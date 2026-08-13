#!/usr/bin/env python3
"""Build an auditable N4 Core staging sample from stephenmk/yomitan-jlpt-vocab.

This script does not modify yan-content/content.v2.json. It creates a staging
JSON file and a Markdown report for review before any product import.
"""

from __future__ import annotations

import argparse
import base64
import csv
import io
import json
import re
import time
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import jaconv
from sudachipy import dictionary, tokenizer


SEED_REPO = "stephenmk/yomitan-jlpt-vocab"
SEED_PATH = "original_data/n4.csv"
SEED_API_URL = f"https://api.github.com/repos/{SEED_REPO}/contents/{SEED_PATH}"
SEED_REPO_URL = f"https://github.com/{SEED_REPO}"
SEED_LICENSE = "CC-BY-SA-4.0"
SEED_EXPECTED_SHA = "6c50e2f5a025041dece962d3332c653bf055178b"
SEED_SOURCE_NOTE = (
    "JLPT data is sourced from Jonathan Waller / Tanos JLPT Resources; "
    "stephenmk added corresponding JMdict entry IDs and normalized some spellings."
)
SEED_SCOPE_NOTE = "N4 Core seed only; not an official JLPT list and not final complete N4+ coverage."

JMDICT_LICENSE_NOTE = "JMdict/EDRDG derived data via local jmdict-simplified cache; license/attribution review required."

MANUAL_MAPPINGS: dict[str, dict[str, Any]] = {
    "1001180": {
        "word": "おいでになる",
        "reading": "おいでになる",
        "pos": ["v5r", "hon"],
        "gloss": ["(honorific) to be", "(honorific) to come", "(honorific) to go"],
        "fix_type": "phrase",
        "note": "Honorific phrase not present in the common JMdict cache; keep natural kana phrase.",
    },
    "1001640": {
        "word": "おかげ",
        "reading": "おかげ",
        "pos": ["n"],
        "gloss": ["thanks to", "owing to", "because of"],
        "fix_type": "kana variant",
        "note": "Kana form normalized by Sudachi to 御陰; keep seed kana form.",
    },
    "1604135": {
        "word": "お祭り",
        "reading": "おまつり",
        "pos": ["n", "vs"],
        "gloss": ["festival", "feast"],
        "fix_type": "kana variant",
        "note": "Polite/o-prefix form not present in the common JMdict cache; keep natural learner-facing form.",
    },
    "1001870": {
        "word": "お見舞い",
        "reading": "おみまい",
        "pos": ["n", "vs"],
        "gloss": ["visiting someone who is ill", "get-well visit", "inquiry"],
        "fix_type": "kana variant",
        "note": "Polite/o-prefix form not present in the common JMdict cache; keep natural noun form.",
    },
    "1282770": {
        "word": "降り出す",
        "reading": "ふりだす",
        "pos": ["v5s", "vi"],
        "gloss": ["to start to rain", "to start to fall"],
        "fix_type": "compound",
        "note": "Compound verb segmented by Sudachi; keep the seed compound.",
    },
    "2015610": {
        "word": "もうすぐ",
        "reading": "もうすぐ",
        "pos": ["adv"],
        "gloss": ["soon", "shortly", "before long"],
        "fix_type": "phrase",
        "note": "Adverbial phrase not present in the common JMdict cache; keep kana phrase.",
    },
    "2005990": {
        "word": "泳ぎ方",
        "reading": "およぎかた",
        "pos": ["n"],
        "gloss": ["way of swimming", "swimming style"],
        "fix_type": "compound",
        "note": "Derived compound not present in the common JMdict cache; keep seed compound.",
    },
}

DEFAULT_CONTENT = Path("yan-content/content.v2.json")
DEFAULT_STAGING = Path("staging/n4-core-sample.json")
DEFAULT_REPORT = Path("staging/n4-core-sample-report.md")
DEFAULT_MEANING_REVIEW = Path("staging/n4-meaning-review.md")
DEFAULT_JMDICT_CACHE = Path("/private/tmp/yan-jmdict/jmdict-eng-common.json")


@dataclass
class SeedFetch:
    text: str
    sha: str
    html_url: str
    download_url: str
    fetched_at: str


def http_json(url: str, timeout: int = 30) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": "yan-n4-core-staging"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_seed(timeout: int) -> SeedFetch:
    payload = http_json(SEED_API_URL, timeout=timeout)
    raw = base64.b64decode(payload["content"]).decode("utf-8-sig")
    return SeedFetch(
        text=raw,
        sha=payload.get("sha", ""),
        html_url=payload.get("html_url", ""),
        download_url=payload.get("download_url", ""),
        fetched_at=datetime.now(timezone.utc).isoformat(),
    )


def parse_seed_rows(seed_text: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    reader = csv.DictReader(io.StringIO(seed_text))
    for row in reader:
        rows.append({k.strip(): (v or "").strip().replace("\u00a0", " ") for k, v in row.items()})
    return rows


def load_existing_n5(path: Path) -> dict[str, set[Any]]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    by_pair: set[tuple[str, str]] = set()
    by_reading_meaning: list[tuple[str, str]] = []
    by_seq: set[str] = set()
    for entry in data.get("wordBank", []):
        levels = entry.get("levels") or [entry.get("level")]
        if "N5" not in levels:
            continue
        word = str(entry.get("word", ""))
        reading = str(entry.get("reading", ""))
        meaning = str(entry.get("meaning_en", ""))
        by_pair.add((word, reading))
        by_reading_meaning.append((reading, meaning))
        staging = entry.get("_staging") or {}
        seq = entry.get("jmdict_seq") or staging.get("jmdict_seq")
        if seq:
            by_seq.add(str(seq))
    return {"by_pair": by_pair, "by_reading_meaning": set(by_reading_meaning), "by_seq": by_seq}


def load_jmdict(cache_path: Path) -> list[dict[str, Any]]:
    with cache_path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return list(data.get("words", []))


def jmdict_forms(entry: dict[str, Any]) -> tuple[list[str], list[str]]:
    kanji = [str(k["text"]) for k in entry.get("kanji", []) if isinstance(k, dict) and k.get("text")]
    kana = [str(k["text"]) for k in entry.get("kana", []) if isinstance(k, dict) and k.get("text")]
    return kanji, kana


def jmdict_senses(entry: dict[str, Any]) -> tuple[list[str], list[str]]:
    pos: list[str] = []
    gloss: list[str] = []
    for sense in entry.get("sense", []) or []:
        pos.extend(str(p) for p in sense.get("partOfSpeech", []) or [])
        for g in sense.get("gloss", []) or []:
            if isinstance(g, dict) and g.get("text"):
                gloss.append(str(g["text"]))
            elif isinstance(g, str):
                gloss.append(g)
    return list(dict.fromkeys(pos)), list(dict.fromkeys(gloss))


def jmdict_sense_options(entry: dict[str, Any]) -> list[dict[str, Any]]:
    options: list[dict[str, Any]] = []
    for idx, sense in enumerate(entry.get("sense", []) or [], start=1):
        pos = [str(p) for p in sense.get("partOfSpeech", []) or []]
        gloss: list[str] = []
        for g in sense.get("gloss", []) or []:
            if isinstance(g, dict) and g.get("text"):
                gloss.append(str(g["text"]))
            elif isinstance(g, str):
                gloss.append(g)
        options.append({"sense_index": idx, "pos": pos, "gloss": gloss})
    return options


def index_jmdict_by_seq(words: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(entry.get("id")): entry for entry in words if entry.get("id")}


def index_jmdict_by_form(words: list[dict[str, Any]]) -> dict[tuple[str, str], list[dict[str, Any]]]:
    index: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for entry in words:
        kanji, kana = jmdict_forms(entry)
        forms = kanji or kana
        for form in forms:
            for reading in kana:
                index.setdefault((form, reading), []).append(entry)
        for reading in kana:
            index.setdefault((reading, reading), []).append(entry)
    return index


def match_jmdict(
    by_seq: dict[str, dict[str, Any]],
    by_form: dict[tuple[str, str], list[dict[str, Any]]],
    row: dict[str, str],
) -> dict[str, Any]:
    seq = row.get("jmdict_seq", "")
    manual = MANUAL_MAPPINGS.get(seq)
    if manual:
        return {
            "matched": True,
            "manual_mapping": True,
            "manual_fix_type": manual["fix_type"],
            "manual_note": manual["note"],
            "match_method": "manual_mapping",
            "multi_match": False,
            "match_count": 1,
            "matches": [{
                "jmdict_seq": seq,
                "kanji": [manual["word"]] if manual["word"] != manual["reading"] else [],
                "kana": [manual["reading"]],
                "pos": manual["pos"],
                "gloss": manual["gloss"],
                "senses": [{
                    "sense_index": 1,
                    "pos": manual["pos"],
                    "gloss": manual["gloss"],
                }],
            }],
        }
    kana = row.get("kana", "")
    kanji = row.get("kanji", "") or kana
    entry = by_seq.get(seq)
    fallback = by_form.get((kanji, kana), []) or by_form.get((kana, kana), [])
    matches = [entry] if entry else fallback
    matches = [m for m in matches if m]
    details = []
    for match in matches[:5]:
        pos, gloss = jmdict_senses(match)
        m_kanji, m_kana = jmdict_forms(match)
        details.append({
            "jmdict_seq": str(match.get("id", "")),
            "kanji": m_kanji,
            "kana": m_kana,
            "pos": pos,
            "gloss": gloss[:8],
            "senses": jmdict_sense_options(match),
        })
    return {
        "matched": bool(matches),
        "match_method": "jmdict_seq" if entry else ("form" if fallback else "none"),
        "multi_match": len(matches) > 1,
        "match_count": len(matches),
        "matches": details,
    }


def is_katakana_text(text: str) -> bool:
    if not text:
        return False
    has_katakana = bool(re.search(r"[\u30a0-\u30ff]", text))
    has_hiragana_or_kanji = bool(re.search(r"[\u3040-\u309f\u4e00-\u9fff]", text))
    return has_katakana and not has_hiragana_or_kanji


def has_okurigana(text: str, reading: str) -> bool:
    return bool(re.search(r"[\u3040-\u309f]", text)) and text != reading


def choose_word_reading(row: dict[str, str], match: dict[str, Any]) -> tuple[str, str, dict[str, bool]]:
    first = (match.get("matches") or [{}])[0]
    row_reading = row.get("kana", "")
    seed_kanji = row.get("kanji", "")
    row_word = seed_kanji or row_reading
    kanji = first.get("kanji") or []
    kana = first.get("kana") or []
    rules = {
        "kana_preferred": False,
        "ateji_avoided": False,
        "okurigana_normalized": False,
        "jmdict_form_used": False,
    }

    # If the seed has no kanji form, keep the kana/katakana seed as the core word.
    # This avoids uncommon ateji such as 亜細亜/阿弗利加/亜米利加 and keeps
    # honorific kana forms such as いらっしゃる readable for learners.
    if not seed_kanji:
        word = row_reading
        if kanji:
            rules["kana_preferred"] = True
            if is_katakana_text(row_reading):
                rules["ateji_avoided"] = True
    else:
        word = row_word
        common_modern = next((form for form in kanji if has_okurigana(form, row_reading)), "")
        if common_modern and common_modern != row_word:
            word = common_modern
            rules["okurigana_normalized"] = True
        elif kanji and row_word not in kanji:
            word = kanji[0]
            rules["jmdict_form_used"] = True

    reading = row_reading
    if kana and row_reading not in kana:
        reading = kana[0]
    return word, reading, rules


def n5_pos_from_jmdict(pos: list[str]) -> str:
    joined = " ".join(pos).lower()
    if "v" in pos or "verb" in joined or re.search(r"\bv[1-5]", joined) or "vs" in joined:
        return "动词"
    if "adj-i" in joined:
        return "い形容词"
    if "adj-na" in joined:
        return "な形容词"
    if "adj" in joined:
        return "形容词"
    if "pn" in pos or "pronoun" in joined:
        return "代词"
    if "prt" in pos or "particle" in joined:
        return "助词"
    if "adv" in pos or "adverb" in joined:
        return "副词"
    if "n" in pos or "noun" in joined:
        return "名词"
    if "int" in pos:
        return "感叹词"
    if "conj" in pos:
        return "连词"
    return ""


def safe_slug(text: str, fallback: str) -> str:
    roman = jaconv.kana2alphabet(jaconv.kata2hira(text or ""))
    roman = re.sub(r"[^a-zA-Z0-9]+", "_", roman).strip("_").lower()
    return roman or fallback


def normalize_text(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def token_set(text: str) -> set[str]:
    stop = {
        "a", "an", "the", "to", "of", "or", "and", "be", "is", "are", "for",
        "with", "in", "on", "at", "as", "from", "by", "one", "something",
    }
    return {t for t in normalize_text(text).split() if t and t not in stop}


def sense_score(seed_meaning: str, gloss: list[str]) -> int:
    seed_tokens = token_set(seed_meaning)
    gloss_tokens = token_set(" ".join(gloss))
    score = len(seed_tokens & gloss_tokens) * 10
    seed_norm = normalize_text(seed_meaning)
    gloss_norm = normalize_text(" ".join(gloss))
    if seed_norm and seed_norm in gloss_norm:
        score += 25
    if "full" in seed_tokens and ({"full", "filled", "plenty", "lot", "many", "much"} & gloss_tokens):
        score += 35
    if "cup" in gloss_tokens and "full" in seed_tokens:
        score -= 20
    return score


def choose_sense(match: dict[str, Any], seed_meaning: str) -> dict[str, Any]:
    first = (match.get("matches") or [{}])[0]
    senses = first.get("senses") or []
    if not senses:
        return {
            "sense_index": None,
            "pos": first.get("pos", []) or [],
            "gloss": first.get("gloss", []) or [],
            "score": 0,
            "needs_sense_review": not bool(first.get("gloss")),
        }

    ranked = []
    for sense in senses:
        ranked.append((sense_score(seed_meaning, sense.get("gloss", [])), sense))
    ranked.sort(key=lambda item: item[0], reverse=True)
    best_score, best = ranked[0]
    second_score = ranked[1][0] if len(ranked) > 1 else -999
    needs_review = best_score <= 0 or (len(ranked) > 1 and best_score == second_score)
    return {
        "sense_index": best.get("sense_index"),
        "pos": best.get("pos", []),
        "gloss": best.get("gloss", []),
        "score": best_score,
        "runner_up_score": second_score,
        "needs_sense_review": needs_review,
    }


ZH_OVERRIDES: dict[str, str] = {
    "n4_oshiire": "壁橱；日式壁橱",
    "n4_ke": "毛；毛发",
    "n4_koto": "琴；日本筝",
    "n4_shikkari": "牢牢地；扎实地；清楚地",
    "n4_nikki": "日记",
    "n4_hakkiri": "清楚地；明确地",
    "n4_yahari": "果然；还是；果真",
    "n4_yappari": "果然；还是；果真",
    "n4_igai": "除……以外；除了",
    "n4_isogu": "赶快；急忙",
    "n4_ueru": "种植",
    "n4_otosu": "掉下；弄丢；使落下",
    "n4_oru": "折；折断",
    "n4_oreru": "折断；断掉",
    "n4_kaijou": "会场",
    "n4_kangaeru": "考虑；认为",
    "n4_kimeru": "决定；选择",
    "n4_keikaku": "计划；项目；日程",
    "n4_geshuku": "寄宿；住宿",
    "n4_gochisou": "丰盛饭菜；美食；款待",
    "n4_ko": "孩子；小孩",
    "n4_kowasu": "弄坏；破坏；打破",
    "n4_kowareru": "坏；破损",
    "n4_morau": "收到；得到；接受",
    "n4_yotei": "计划；安排；日程",
    "n4_oideninaru": "在；来；去（尊敬语）",
    "n4_okage": "多亏；由于",
    "n4_omatsuri": "祭典；节日",
    "n4_omimai": "探病；慰问",
    "n4_furidasu": "开始下（雨/雪）",
    "n4_mousugu": "马上；快要",
    "n4_oyogikata": "游泳方法；游泳方式",
    "n4_itadaku": "收到；得到；吃；喝（谦让语）",
    "n4_itasu": "做（谦让语）",
    "n4_irassharu": "来；去；在（尊敬语）",
    "n4_kudasaru": "给（尊敬语）",
    "n4_goranninaru": "看（尊敬语）",
    "n4_nasaru": "做（尊敬语）",
    "n4_meshiagaru": "吃；喝（尊敬语）",
    "n4_moushiageru": "说；告诉（谦让语）",
    "n4_mousu": "说；叫做（谦让语）",
}

CURRENT_MEANING_AUTO_FIX_IDS = {
    "n4_oshiire",
    "n4_ke",
    "n4_koto",
    "n4_shikkari",
    "n4_nikki",
    "n4_hakkiri",
    "n4_yahari",
    "n4_yappari",
    "n4_igai",
    "n4_isogu",
    "n4_ueru",
    "n4_otosu",
    "n4_oru",
    "n4_oreru",
    "n4_kaijou",
    "n4_kangaeru",
    "n4_kimeru",
    "n4_keikaku",
    "n4_geshuku",
    "n4_gochisou",
    "n4_ko",
    "n4_kowasu",
    "n4_kowareru",
    "n4_morau",
    "n4_yotei",
}


ZH_PHRASES: dict[str, str] = {
    "(honorific) to be": "在（尊敬语）",
    "(honorific) to come": "来（尊敬语）",
    "(honorific) to go": "去（尊敬语）",
    "ah": "啊",
    "oh": "哦",
    "greeting": "问候",
    "greetings": "问候语",
    "salutation": "致意",
    "space (between)": "间隔",
    "gap": "间隙",
    "interval": "间隔",
    "baby": "婴儿",
    "infant": "婴儿",
    "accessory (fashion)": "饰品",
    "jewelry": "首饰",
    "shallow": "浅",
    "superficial": "肤浅",
    "flavor": "味道",
    "flavour": "味道",
    "taste": "味道",
    "Asia": "亚洲",
    "Africa": "非洲",
    "(United States of) America": "美国",
    "United States": "美国",
    "US": "美国",
    "tomorrow": "明天",
    "play": "玩耍",
    "playing": "玩",
    "game": "游戏",
    "announcer": "播音员",
    "presenter": "主持人",
    "broadcaster": "播报员",
    "alcohol": "酒精",
    "part-time job": "兼职",
    "side job": "副业",
    "peace of mind": "安心",
    "relief": "放心",
    "(sense of) security": "安全感",
    "safety": "安全",
    "security": "安全",
    "that sort of": "那种",
    "that kind of": "那样的",
    "like that": "像那样",
    "guidance": "指引",
    "leading (the way)": "带路",
    "showing around": "带人参观",
    "below (a standard, level, etc.)": "以下",
    "under": "低于",
    "beneath": "在下面",
    "excluding": "除外",
    "except (for)": "除了",
    "apart from": "除……以外",
    "medicine": "医学",
    "medical science": "医学",
    "opinion": "意见",
    "view": "看法",
    "comment": "评论",
    "stone": "石头",
    "rock": "岩石",
    "pebble": "小石子",
    "not less than ...": "……以上",
    "... and over": "……以上",
    "... and above": "……以上",
    "once": "一次",
    "one time": "一次",
    "on one occasion": "有一次",
    "very hard": "非常努力",
    "with utmost effort": "拼命",
    "as hard as one can": "尽全力",
    "full": "满",
    "filled (with)": "装满",
    "brimming (with)": "满满的",
    "thread": "线",
    "yarn": "纱线",
    "string": "细绳",
    "within": "以内",
    "inside of": "在……里面",
    "less than": "少于",
    "rural area": "农村",
    "countryside": "乡下",
    "the sticks": "乡下",
    "receipt": "受理",
    "acceptance": "接受",
    "lie": "谎言",
    "fib": "小谎",
    "falsehood": "虚假",
    "inside": "里面",
    "within": "之内",
    "arm": "手臂",
    "delicious": "好吃",
    "tasty": "美味",
    "good": "好",
    "opposite side": "反面",
    "bottom": "底部",
    "other side": "另一面",
    "selling area": "卖场",
    "counter": "柜台",
    "section": "区域",
    "happy": "开心",
    "glad": "高兴",
    "pleased": "愉快",
    "yes": "嗯",
    "yeah": "嗯",
    "uh huh": "嗯",
    "operation (of a machine)": "运转",
    "running": "运行",
    "working": "运作",
    "driver": "司机",
    "chauffeur": "司机",
    "exercise": "运动",
    "physical training": "体育锻炼",
    "workout": "锻炼",
    "escalator": "自动扶梯",
    "branch": "树枝",
    "bough": "大树枝",
    "limb": "树枝",
    "reserve": "客气",
    "constraint": "克制",
    "restraint": "顾虑",
    "congratulation": "祝贺",
    "congratulations": "祝贺",
    "celebration": "庆祝",
    "motorcycle": "摩托车",
    "motorbike": "摩托车",
    "thanks to": "多亏",
    "owing to": "由于",
    "because of": "因为",
    "strange": "奇怪",
    "odd": "古怪",
    "funny": "好笑",
    "hundred million": "一亿",
    "100,000,000": "一亿",
    "10^8": "一亿",
    "rooftop": "屋顶",
    "present": "礼物",
    "gift": "礼物",
    "young lady": "小姐；年轻女性",
    "your house": "您家",
    "your home": "您家",
    "your family": "您家人",
    "husband": "丈夫",
    "change (for a purchase)": "找零",
    "sound": "声音",
    "noise": "噪音",
    "dance": "舞蹈",
    "festival": "祭典",
    "feast": "宴会",
    "visiting someone who is ill": "探病",
    "get-well visit": "慰问病人",
    "inquiry": "询问",
    "local specialty or souvenir bought as a gift while traveling (travelling)": "土特产；旅行伴手礼",
    "toy": "玩具",
    "front (of a building, etc.)": "正面",
    "obverse side (i.e. \"head\") of a coin": "正面",
    "parent": "父母",
    "parents": "父母",
    "mother and father": "父母",
    "thanks": "感谢",
    "gratitude": "谢意",
    "end": "结束",
    "ending": "结尾",
    "close": "结束",
    "curtain": "窗帘",
    "curtains": "窗帘",
    "seashore": "海边",
    "coast": "海岸",
    "seaside": "海边",
    "meeting": "会议",
    "conference": "会议",
    "session": "会议",
    "conference room": "会议室",
    "council room": "会议室",
    "assembly hall": "会场",
    "meeting place": "会场",
    "venue": "会场",
    "conversation": "会话",
    "talk": "谈话",
    "chat": "聊天",
    "return": "回来",
    "coming back": "返回",
    "science": "科学",
    "mirror": "镜子",
    "looking-glass": "镜子",
    "fire": "火灾",
    "conflagration": "大火",
    "gasoline": "汽油",
    "gas": "汽油",
    "petrol": "汽油",
    "gas station": "加油站",
    "petrol station": "加油站",
    "filling station": "加油站",
    "hard": "硬",
    "solid": "坚固",
    "tough": "结实",
    "(physical) form": "形状",
    "shape": "形状",
    "figure": "形态",
    "section manager": "科长",
    "section chief": "科长",
    "appearance": "外表",
    "style": "样子",
    "(my) wife": "我妻子",
    "sad": "悲伤",
    "miserable": "痛苦",
    "unhappy": "不开心",
    "always": "一定",
    "without exception": "毫无例外",
    "necessarily": "必然",
    "rich person": "有钱人",
    "wealthy person": "富人",
    "she": "她",
    "her": "她",
    "wall": "墙",
    "partition": "隔墙",
    "hair (on the head)": "头发",
    "glass": "玻璃",
    "pane": "玻璃窗格",
    "he": "他",
    "him": "他",
    "they": "他们",
    "them": "他们",
    "substitute": "替代",
    "replacement": "替代品",
    "substituting": "代替",
    "relation": "关系",
    "relationship": "关系",
    "connection": "联系",
    "(female) nurse": "护士",
    "simple": "简单",
    "easy": "容易",
    "uncomplicated": "不复杂",
    "spirit": "精神",
    "mind": "心",
    "heart": "心",
    "chance": "机会",
    "opportunity": "机会",
    "occasion": "时机",
    "danger": "危险",
    "peril": "危险",
    "hazard": "危险",
    "steam locomotive": "蒸汽机车",
    "steam train": "蒸汽火车",
    "technology": "技术",
    "engineering": "工程",
    "season": "季节",
    "time of year": "时节",
    "rule": "规则",
    "regulation": "规定",
    "surely": "一定",
    "undoubtedly": "毫无疑问",
    "almost certainly": "几乎肯定",
    "silk": "丝绸",
    "severe": "严厉",
    "strict": "严格",
    "rigid": "严苛",
    "feeling": "感觉",
    "mood": "心情",
    "you": "你",
    "buddy": "老兄",
    "pal": "朋友",
    "kimono": "和服",
    "Japanese traditional clothing (esp. full-length)": "和服",
    "guest": "客人",
    "visitor": "访客",
    "urgent": "紧急",
    "pressing": "紧迫",
    "express (train)": "急行列车",
    "education": "教育",
    "schooling": "学校教育",
    "training": "培训",
    "church": "教堂",
    "congregation": "教会",
    "competition": "比赛",
    "contest": "竞赛",
    "rivalry": "竞争",
    "interest (in something)": "兴趣",
    "curiosity (about something)": "好奇心",
    "zest (for)": "热情",
    "neighbourhood": "附近",
    "neighborhood": "附近",
    "vicinity": "周边",
    "condition": "情况",
    "state": "状态",
    "air": "空气",
    "atmosphere": "气氛",
    "airport": "机场",
    "grass": "草",
    "weed": "杂草",
    "herb": "草本植物",
    "neck": "脖子",
    "cloud": "云",
    "Mr": "君；先生",
    "master": "少爷",
    "boy": "男孩",
    "plan": "计划",
    "project": "项目",
    "schedule": "日程",
    "experience": "经验",
    "economy": "经济",
    "economics": "经济学",
    "police": "警察",
    "cake": "蛋糕",
    "injury": "受伤",
    "wound": "伤口",
    "scenery": "景色",
    "scene": "景象",
    "landscape": "风景",
    "eraser": "橡皮",
    "rubber": "橡皮",
    "boarding": "寄宿",
    "lodging": "住宿",
    "board and lodging": "食宿",
    "but": "但是",
    "however": "然而",
    "although": "虽然",
    "cause": "原因",
    "origin": "起因",
    "source": "来源",
    "quarrel": "吵架",
    "brawl": "打架",
    "fight": "争吵",
    "research": "研究",
    "study": "学习；研究",
    "investigation": "调查",
    "laboratory": "研究室",
    "sightseeing": "观光",
    "watching": "观看",
    "viewing": "参观",
    "child": "孩子",
    "kid": "小孩",
    "teenager": "青少年",
    "in this way": "这样",
    "like this": "像这样",
    "so": "如此",
    "suburb": "郊区",
    "residential area on the outskirt of a city": "市郊住宅区",
    "commuter belt": "通勤带",
    "lecture": "讲课",
    "(manufacturing) industry": "工业",
    "senior high school": "高中",
    "high school": "高中",
    "senior high school student": "高中生",
    "factory": "工厂",
    "plant": "工厂",
    "mill": "工厂",
    "principal": "校长",
    "head teacher": "校长",
    "headmaster": "校长",
    "traffic": "交通",
    "transportation": "交通",
    "auditorium": "礼堂",
    "lecture hall": "讲堂",
    "public employee": "公务员",
    "government employee": "政府职员",
    "public-sector worker": "公职人员",
    "international": "国际",
    "your husband": "您丈夫",
    "her husband": "她丈夫",
    "fault": "故障",
    "trouble": "麻烦",
    "breakdown": "故障",
    "knowing": "知道",
    "being aware (of)": "知晓",
    "answer": "回答",
    "reply": "回复",
    "response": "回应",
    "gorgeous dinner": "丰盛饭菜",
    "excellent food": "美食",
    "small bird": "小鸟",
    "little bird": "小鸟",
    "the other day": "前几天",
    "lately": "最近",
    "recently": "最近",
    "these days": "近来",
    "nowadays": "如今",
    "now": "现在",
    "small": "小",
    "rubbish": "垃圾",
    "trash": "垃圾",
    "garbage": "垃圾",
    "(husked grains of) rice": "米",
    "from now on": "从现在起",
    "after this": "今后",
    "in the future": "将来",
    "scary": "可怕",
    "frightening": "吓人",
    "eerie": "阴森",
    "concert": "音乐会",
    "this time": "这次",
    "computer": "电脑",
    "this evening": "今晚",
    "tonight": "今晚",
    "conclusion": "结尾",
    "beginning": "开始",
    "outset": "开端",
    "first": "最初",
    "slope": "坡",
    "incline": "斜坡",
    "hill": "小山",
    "prosperous": "繁荣",
    "flourishing": "兴盛",
    "thriving": "兴旺",
    "a short while ago": "刚才",
    "a moment ago": "刚才",
    "just now": "刚才",
    "lonely": "寂寞",
    "lonesome": "孤单",
    "solitary": "孤独",
    "month after next": "下下个月",
    "week after next": "下下周",
    "salad": "沙拉",
    "industry": "产业",
    "sandal": "凉鞋",
    "sandwich": "三明治",
    "regrettable": "遗憾",
    "unfortunate": "不幸",
    "disappointing": "令人失望",
    "city": "市",
    "character (esp. kanji)": "字",
    "letter": "文字",
    "written text": "文字",
    "match": "比赛",
    "bout": "比赛",
    "way": "方法",
    "method": "方法",
    "means": "手段",
    "examination": "考试",
    "exam": "考试",
    "test": "测验",
    "accident": "事故",
    "incident": "事件",
    "earthquake": "地震",
    "period": "时期",
    "epoch": "时代",
    "era": "时代",
    "underwear": "内衣",
    "undergarment": "内衣",
    "underclothes": "内衣",
    "preparation": "准备",
    "arrangements": "安排",
    "failure": "失败",
    "mistake": "错误",
    "blunder": "失误",
    "dictionary": "词典",
    "lexicon": "词典",
    "article": "物品",
    "item": "物品",
    "thing": "东西",
    "for a while": "一会儿",
    "for some time": "一段时间",
    "island": "岛",
    "citizen (of a country)": "市民",
    "citizenry": "市民",
    "office": "办公室",
    "society": "社会",
    "public": "公众",
    "community": "社区",
    "company president": "公司社长",
    "manager": "经理",
    "director": "董事",
    "hindrance": "妨碍",
    "obstacle": "障碍",
    "nuisance": "麻烦",
    "jam": "果酱",
    "freedom": "自由",
    "liberty": "自由",
    "(social) custom": "习惯",
    "practice": "惯例",
    "convention": "惯例",
    "address (of a home, business, etc.)": "地址",
    "residence": "住处",
    "domicile": "住所",
    "judo": "柔道",
    "enough": "足够",
    "sufficient": "充分",
    "plenty": "充足",
    "attendance": "出席",
    "presence": "在场",
    "appearance": "出场",
    "departure": "出发",
    "leaving": "离开",
    "setting off": "出发",
    "hobby": "兴趣爱好",
    "pastime": "消遣",
    "getting ready": "准备",
    "introduction": "介绍",
    "presentation": "介绍",
    "referral": "推荐",
    "primary school": "小学",
    "elementary school": "小学",
    "grade school": "小学",
    "novel": "小说",
    "story": "故事",
    "(work of) fiction": "小说作品",
    "invitation": "邀请",
    "consent": "同意",
    "assent": "同意",
    "future": "将来",
    "(future) prospects": "前途",
    "meal (e.g. lunch, dinner)": "饭",
    "foodstuff": "食品",
    "groceries": "食品杂货",
    "woman": "女性",
    "female": "女性",
    "population": "人口",
    "Shinto shrine": "神社",
    "kind": "亲切",
    "gentle": "温柔",
    "considerate": "体贴",
    "worry": "担心",
    "concern": "担忧",
    "anxiety": "焦虑",
    "newspaper company": "报社",
    "swimming": "游泳",
    "water supply": "供水",
    "water service": "自来水",
    "waterworks": "供水设施",
    "very": "非常",
    "extremely": "极其",
    "surprisingly": "相当",
    "mathematics": "数学",
    "suit (clothing)": "西装",
    "suitcase": "行李箱",
    "screen": "屏幕",
    "amazing (e.g. of strength)": "厉害",
    "great (e.g. of skills)": "了不起",
    "wonderful": "很棒",
    "all": "全部",
    "completely": "完全",
    "totally": "彻底",
    "straight": "笔直",
    "quickly": "迅速",
    "directly": "直接",
    "steak": "牛排",
    "stereo (sound)": "立体声",
    "sand": "沙子",
    "grit": "砂砾",
    "fine gravel": "细砾",
    "splendid": "出色",
    "magnificent": "宏伟",
    "corner": "角落",
    "nook": "角落",
    "recess": "凹处",
    "pickpocket": "扒手",
    "(and) then": "于是",
    "thereupon": "于是",
    "life": "生活",
    "living": "生活",
    "production": "生产",
    "manufacture": "制造",
    "politics": "政治",
    "government": "政府",
    "the West": "西方",
    "the Occident": "西方",
    "Western countries": "西方国家",
    "the world": "世界",
    "universe": "宇宙",
    "seat": "座位",
    "explanation": "说明",
    "exposition": "阐述",
    "description": "描述",
    "back (of the body)": "后背",
    "certainly": "一定",
    "without fail": "务必",
    "care": "照顾",
    "looking after": "照料",
    "help": "帮助",
    "line": "线",
    "stripe": "条纹",
    "stria": "条纹",
    "(not) at all": "完全不",
    "(not) in the slightest": "一点也不",
    "war": "战争",
    "senior (at school, work, etc.)": "前辈",
    "superior": "上级",
    "elder": "年长者",
    "appearing that": "看起来",
    "seeming that": "似乎",
    "looking like": "看起来像",
    "consultation": "商量",
    "discussion": "讨论",
    "discussing": "商量",
    "graduation": "毕业",
    "completion (of a course)": "完成课程",
    "grandfather": "祖父",
    "soft": "软",
    "grandmother": "祖母",
    "therefore": "因此",
    "besides": "而且",
    "in addition": "此外",
    "also": "也",
    "to that degree": "到那种程度",
    "to that extent": "到那种程度",
    "that much": "那么多",
    "soon": "快要",
    "before long": "不久",
    "any time now": "差不多该",
    "such": "那样的",
    "so much": "那么多",
    "leaving hospital": "出院",
    "discharge from hospital": "出院",
    "university student": "大学生",
    "college student": "大学生",
    "important": "重要",
    "serious": "严重",
    "crucial": "关键",
    "generally": "大体上",
    "on the whole": "总体上",
    "mostly": "大多",
    "ordinarily": "通常",
    "usually": "通常",
    "type": "类型",
    "sort": "种类",
    "considerably": "相当",
    "greatly": "很大程度地",
    "a lot": "很多",
    "typhoon": "台风",
    "hurricane": "飓风",
    "sure": "确实",
    "certain": "确定",
    "positive": "肯定",
    "right": "正确",
    "correct": "正确",
    "tatami mat": "榻榻米",
    "Japanese straw floor coverings": "日本草席地板",
    "for example": "例如",
    "for instance": "比如",
    "e.g.": "例如",
    "shelf": "架子",
    "ledge": "搁板",
    "rack": "架子",
    "enjoyment": "乐趣",
    "pleasure": "快乐",
    "amusement": "娱乐",
    "occasionally": "偶尔",
    "once in a while": "偶尔",
    "now and then": "时不时",
    "advantage": "好处",
    "benefit": "利益",
    "no good": "不行",
    "not serving its purpose": "没用",
    "useless": "无用",
    "man": "男性",
    "male": "男性",
    "(indoor) heating": "暖气",
    "blood": "血",
    "check (pattern)": "格纹",
    "plaid": "格子花纹",
    "force": "力量",
    "strength": "力气",
    "might": "力量",
    "(not) a bit": "一点也不",
    "(not) in the least": "完全不",
    "suffix for familiar person": "昵称后缀",
    "caution": "注意",
    "precaution": "小心",
    "junior high school": "初中",
    "middle school": "中学",
    "lower secondary school": "初中",
    "injection": "注射",
    "jab": "针",
    "shot": "注射",
    "parking lot": "停车场",
    "car park": "停车场",
    "carpark": "停车场",
    "geography": "地理",
    "Moon": "月亮",
    "circumstances": "情况",
    "convenience": "方便",
    "wife": "妻子",
    "intention": "打算",
    "purpose": "目的",
    "polite": "礼貌",
    "courteous": "有礼貌",
    "civil": "客气",
    "text": "课文",
    "suitable": "合适",
    "proper": "适当",
    "appropriate": "合适",
    "as much as one can": "尽可能",
    "as much as possible": "尽可能",
    "if at all possible": "尽量",
    "tennis": "网球",
    "glove": "手套",
    "mitten": "连指手套",
    "mitt": "手套",
    "temple (Buddhist)": "寺庙",
    "(punctuation) mark (e.g. comma, period, decimal point)": "标点",
    "dot": "点",
    "employee (of a store)": "店员",
    "shop assistant": "店员",
    "clerk": "店员",
    "weather forecast": "天气预报",
    "weather report": "天气预报",
    "electric light": "电灯",
    "telegram": "电报",
    "exhibition": "展览会",
    "if": "如果",
    "when": "当……时",
    "tool": "工具",
    "implement": "用具",
    "instrument": "器具",
    "finally": "终于",
    "at last": "终于",
    "in the end": "最后",
    "zoo": "动物园",
    "zoological gardens": "动物园",
    "far away": "远方",
    "distant place": "远处",
    "a (great) distance": "远距离",
    "particularly": "特别",
    "especially": "尤其",
    "in particular": "特别",
    "special": "特别",
    "particular": "特定",
    "extraordinary": "特别",
    "barbershop": "理发店",
    "barber shop": "理发店",
    "barber": "理发师",
    "on the way": "途中",
    "en route": "在路上",
    "limited express (train for which a limited-express ticket is required)": "特急列车",
    "thief": "小偷",
    "burglar": "窃贼",
    "robber": "强盗",
    "drumming (noise)": "咚咚声",
    "beating": "敲打声",
    "pounding": "砰砰声",
    "to be lost (e.g. a dream, confidence)": "失去",
    "to pass away": "去世",
    "I see": "原来如此",
    "that's right": "确实如此",
    "indeed": "的确",
    "smell": "气味",
    "scent": "香味",
    "odour": "气味",
    "bitter": "苦",
    "two-storied building": "二层楼建筑",
    "hospitalization": "住院",
    "hospitalisation": "住院",
    "admission (to a school or university)": "入学",
    "entrance": "入学",
    "enrolment": "入学",
    "doll": "人偶",
    "puppet": "木偶",
    "marionette": "牵线木偶",
    "price": "价格",
    "cost": "费用",
    "fever": "发烧",
    "temperature": "体温",
    "zealous": "热心",
    "enthusiastic": "热情",
    "ardent": "热烈",
    "sleeping in late": "睡过头",
    "oversleeping": "睡过头",
    "sleepy": "困",
    "drowsy": "犯困",
    "somnolent": "想睡",
    "throat": "喉咙",
    "vehicle": "交通工具",
    "conveyance": "运输工具",
    "(means of) transport": "交通工具",
    "leaf": "叶子",
    "blade (of grass)": "草叶",
    "(pine) needle": "松针",
    "case": "情况",
    "part-time (work)": "兼职",
    "double": "两倍",
    "twice (as much)": "两倍",
    "seeing": "拜见",
    "looking at": "看",
    "dentist": "牙医",
    "place": "地方",
    "location": "地点",
    "spot": "地点",
    "should (be)": "应该",
    "bound (to be)": "理应",
    "expected (to be)": "按理会",
    "embarrassing": "难为情",
    "embarrassed": "尴尬",
    "ashamed": "羞愧",
    "personal computer": "个人电脑",
    "PC": "电脑",
    "pronunciation": "发音",
    "cherry blossom viewing": "赏樱",
    "flower viewing": "赏花",
    "wood": "树林",
    "woods": "树林",
    "forest": "森林",
    "program (e.g. TV)": "节目",
    "programme": "节目",
    "opposition": "反对",
    "resistance": "抵抗",
    "antagonism": "对立",
    "handbag": "手提包",
    "purse": "手提包",
    "day": "日子",
    "days": "天",
    "flame": "火焰",
    "blaze": "火焰",
    "piano (instrument)": "钢琴",
    "light": "光",
    "drawer": "抽屉",
    "moustache": "胡子",
    "mustache": "胡子",
    "beard": "胡须",
    "airfield": "机场",
    "aerodrome": "机场",
    "a long time (since the last time)": "好久不见",
    "first in a long time": "久违",
    "art museum": "美术馆",
    "art gallery": "美术馆",
    "needed": "需要",
    "essential": "必要",
    "very bad": "糟糕",
    "terrible": "严重",
    "awful": "可怕",
    "multi-floor building": "大楼",
    "multi-storey building": "大楼",
    "daytime": "白天",
    "during the day": "白天",
    "time from sunrise until sunset": "白天",
    "lunch break": "午休",
    "noon recess": "午休",
    "noon rest period": "午休",
    "fax": "传真",
    "facsimile": "传真",
    "deep": "深",
    "complex": "复杂",
    "complicated": "复杂",
    "intricate": "错综复杂",
    "review (of learned material)": "复习",
    "revision": "复习",
    "head (chief, director) of a section or department": "部长",
    "local train": "普通列车",
    "train that stops at every station": "各站停车",
    "grape": "葡萄",
    "grapevine": "葡萄藤",
    "futon": "日式被褥",
    "Japanese bedding consisting of a mattress and a duvet": "日式被褥",
    "ship": "船",
    "boat": "船",
    "watercraft": "船只",
    "inconvenience": "不方便",
    "inexpediency": "不便",
    "unhandiness": "不方便",
    "culture": "文化",
    "civilization": "文明",
    "civilisation": "文明",
    "literature": "文学",
    "grammar": "语法",
    "separate": "另外",
    "different": "不同",
    "another": "别的",
    "bell": "铃",
    "peculiar": "奇怪",
    "(foreign) trade": "外贸",
    "(international) commerce": "国际贸易",
    "importing and exporting": "进出口",
    "broadcasting": "广播",
    "broadcast": "播送",
    "program": "节目",
    "law": "法律",
    "legislation": "立法",
    "act": "法案",
    "I": "我",
    "me": "我",
    "star (usu. excluding the Sun)": "星星",
    "planet (usu. excluding Earth)": "行星",
    "heavenly body": "天体",
    "extent": "程度",
    "degree": "程度",
    "measure": "程度",
    "almost": "几乎",
    "nearly": "差不多",
    "translation": "翻译",
    "serious": "认真",
    "earnest": "认真",
    "sober": "严肃",
    "or": "或者",
    "either ... or ...": "或者……或者……",
    "surroundings": "周围",
    "cartoon": "漫画",
    "comic": "漫画",
    "comic strip": "连环漫画",
    "middle": "中间",
    "centre": "中心",
    "center": "中心",
    "lake": "湖",
    "miso": "味噌",
    "fermented condiment usu. made from soybeans": "味噌",
    "everyone": "大家",
    "everybody": "大家",
    "harbour": "港口",
    "harbor": "港口",
    "port": "港口",
    "the old days": "过去",
    "the past": "过去",
    "former times": "从前",
    "insect": "昆虫",
    "bug": "虫子",
    "cricket": "蟋蟀",
    "son": "儿子",
    "daughter": "女儿",
    "impossible": "不可能",
    "rare": "少见",
    "uncommon": "罕见",
    "unusual": "不寻常",
    "if": "如果",
    "in case": "万一",
    "supposing": "假如",
    "of course": "当然",
    "naturally": "自然",
    "most": "最",
    "cotton (material)": "棉",
    "promise": "约定",
    "agreement": "协议",
    "arrangement": "安排",
    "tender": "温柔",
    "hot water": "热水",
    "export": "出口",
    "exportation": "出口",
    "import": "进口",
    "importation": "进口",
    "finger": "手指",
    "toe": "脚趾",
    "digit": "指头",
    "(finger) ring": "戒指",
    "dream": "梦",
    "use": "用途",
    "provision": "准备",
    "business": "事情",
    "things to do": "事情",
    "engagement": "约会；事务",
    "preparation for a lesson": "预习",
    "plans": "计划",
    "reservation": "预约",
    "appointment": "预约",
    "booking": "预订",
    "reason": "理由",
    "grounds": "根据",
    "pretext": "借口",
    "utilization": "利用",
    "utilisation": "利用",
    "both": "双方",
    "both sides": "双方",
    "both parties": "双方",
    "ryokan": "日式旅馆",
    "traditional Japanese inn": "日式旅馆",
    "absence": "不在",
    "being away from home": "不在家",
    "air conditioning": "冷气",
    "air cooling": "制冷",
    "history": "历史",
    "(cash) register": "收银机",
    "report": "报告",
    "paper": "报告",
    "contacting": "联系",
    "(making) contact": "联系",
    "getting in touch": "联络",
    "word processor": "文字处理机",
    "lost article": "遗失物",
    "thing left behind": "遗落物",
    "rate": "比例",
    "ratio": "比率",
    "percentage": "百分比",
    "way of swimming": "游泳方法",
    "swimming style": "泳姿",
}


ZH_VERB_PHRASES: dict[str, str] = {
    "to rise": "上升",
    "to go up": "上去",
    "to come up": "上来",
    "to gather": "聚集",
    "to collect": "收集",
    "to assemble": "集合",
    "to apologize (apologise)": "道歉",
    "to live": "生活；活着",
    "to exist": "存在",
    "to ill-treat": "虐待",
    "to bully": "欺负",
    "to torment": "折磨",
    "to hurry": "赶快",
    "to rush": "匆忙",
    "to hasten": "赶紧",
    "to do": "做",
    "to receive": "收到",
    "to get": "得到",
    "to accept": "接受",
    "to pray": "祈祷",
    "to say a prayer": "祈祷",
    "to say grace": "饭前祷告",
    "to come": "来",
    "to go": "去",
    "to be (somewhere)": "在",
    "to plant": "种植",
    "to grow": "种植；生长",
    "to raise": "养育；提高",
    "to call on someone": "拜访",
    "to call at a place": "到访",
    "to pay a visit": "拜访",
    "to undergo (e.g. surgery)": "接受（手术等）",
    "to take (a test)": "参加（考试）",
    "to accept (a challenge)": "接受（挑战）",
    "to move": "移动",
    "to stir": "动",
    "to shift": "移动",
    "to hit": "打",
    "to strike": "击打",
    "to knock": "敲",
    "to copy": "抄写",
    "to duplicate": "复制",
    "to reproduce": "复制",
    "to choose": "选择",
    "to select": "选择",
    "to pick (out)": "挑选",
    "to send": "发送",
    "to dispatch": "派遣",
    "to forward": "转发",
    "to be late": "迟到",
    "to be delayed": "延迟",
    "to fall behind schedule": "落后于计划",
    "to wake": "叫醒",
    "to wake up": "醒来",
    "to waken": "叫醒",
    "to perform": "进行",
    "to conduct oneself": "行事",
    "to get angry": "生气",
    "to get mad": "发火",
    "to lose one's temper": "发脾气",
    "to fall": "掉落",
    "to drop": "掉下",
    "to come down": "下来",
    "to say": "说",
    "to speak": "讲话",
    "to tell": "告诉",
    "to let fall": "使掉落",
    "to dance (orig. a hopping dance)": "跳舞",
    "to be surprised": "吃惊",
    "to be taken aback": "吓一跳",
    "to be amazed": "惊讶",
    "to recall": "回想起",
    "to remember": "记得",
    "to recollect": "回忆",
    "to think": "想",
    "to consider": "考虑",
    "to believe": "认为",
    "to break": "折断；打破",
    "to fracture": "折断",
    "to break off": "折下",
    "to be broken": "坏了",
    "to snap": "折断",
    "to decorate": "装饰",
    "to ornament": "装饰",
    "to adorn": "装点",
    "to put in order": "整理",
    "to tidy up": "收拾",
    "to clean up": "整理干净",
    "to win": "获胜",
    "to gain victory": "取得胜利",
    "to mind": "介意",
    "to care about": "在意",
    "to be concerned about": "关心",
    "to bite": "咬",
    "to go to (school, work, etc.)": "上（学/班）",
    "to attend": "上；参加",
    "to commute": "通勤",
    "to get dry": "变干",
    "to change": "改变",
    "to be transformed": "变化",
    "to be altered": "改变",
    "to bear in mind": "考虑到",
    "to allow for": "顾及",
    "to be heard": "听得见",
    "to be audible": "听得见",
    "to reach one's ears": "传到耳中",
    "to be decided": "决定下来",
    "to be settled": "确定",
    "to be fixed": "固定",
    "to decide": "决定",
    "to determine": "决定",
    "to confer": "赐予",
    "to bestow": "给予",
    "to compare": "比较",
    "to make a comparison (between)": "作比较",
    "to give": "给",
    "to let (one) have": "给（某人）",
    "to get dark": "天黑",
    "to grow dark": "变暗",
    "to be crowded": "拥挤",
    "to be packed": "挤满",
    "to be congested": "拥堵",
    "to see": "看",
    "to look": "看",
    "to watch": "观看",
    "to destroy": "破坏",
    "to demolish": "拆毁",
    "to search for": "寻找",
    "to look for": "找",
    "to hunt for": "搜寻",
    "to go down": "下降",
    "to demote": "降职",
    "to move back": "后退",
    "to pull back": "拉回",
    "to present": "赠送",
    "to offer": "提供",
    "to make noise": "吵闹",
    "to make racket": "喧闹",
    "to be noisy": "吵",
    "to touch": "碰",
    "to feel": "摸",
    "to handle": "处理",
    "to scold": "责备",
    "to chide": "训斥",
    "to rebuke": "斥责",
    "to notify": "通知",
    "to advise": "告知",
    "to inform": "通知",
    "to examine": "检查",
    "to look up": "查询",
    "to investigate": "调查",
    "to exceed": "超过",
    "to surpass": "超越",
    "to be above": "超过",
    "to become less crowded": "变空",
    "to thin out": "变少",
    "to get empty": "空下来",
    "to make progress": "前进；进展",
    "to improve": "进步",
    "to throw away": "扔掉",
    "to cast away": "丢弃",
    "to dump": "倒掉",
    "to slide": "滑",
    "to glide": "滑行",
    "to skate": "滑冰",
    "to rear": "养育",
    "to bring up": "养大",
    "to be confined to bed (with an illness)": "病倒卧床",
    "to come down with": "患上",
    "to break down (e.g. from overwork)": "累倒",
    "to add (numbers)": "加",
    "to visit": "拜访",
    "to ask": "询问",
    "to enquire": "询问",
    "to inquire": "询问",
    "to stand up": "站起来",
    "to put up": "立起",
    "to set up": "设置",
    "to build": "建造",
    "to construct": "建设",
    "to enjoy": "享受",
    "to take pleasure in": "享受",
    "to have a good time": "玩得开心",
    "to be sufficient": "足够",
    "to be enough": "够",
    "to catch": "抓住",
    "to capture": "捕获",
    "to arrest": "逮捕",
    "to convey": "传达",
    "to report": "报告",
    "to transmit": "传送",
    "to continue": "继续",
    "to last": "持续",
    "to go on": "继续",
    "to keep up": "持续",
    "to keep on": "继续",
    "to wrap up": "包起来",
    "to pack": "打包",
    "to bundle": "捆起来",
    "to fish": "钓鱼",
    "to angle": "垂钓",
    "to take (someone) with one": "带某人一起去",
    "to bring along": "带来",
    "to go with": "一起去",
    "to help": "帮助",
    "to assist": "协助",
    "to aid": "援助",
    "to penetrate": "穿过",
    "to pierce": "刺穿",
    "to skewer": "串起",
    "to deliver": "送达",
    "to stop": "停止",
    "to turn off": "关掉",
    "to exchange": "交换",
    "to swap": "互换",
    "to barter": "以物易物",
    "to repair": "修理",
    "to mend": "修补",
    "to fix": "修好",
    "to get mended": "被修好",
    "to be repaired": "修好了",
    "to get better": "好转",
    "to get well": "康复",
    "to recover (from an illness)": "康复",
    "to disappear (e.g. pain)": "消失",
    "to die": "死；去世",
    "to throw": "扔",
    "to hurl": "猛扔",
    "to fling": "甩",
    "to get used to": "习惯",
    "to grow accustomed to": "逐渐习惯",
    "to become familiar with": "熟悉",
    "to run away": "逃跑",
    "to flee": "逃离",
    "to get away (e.g. from danger)": "逃脱",
    "to resemble": "相似",
    "to look like": "像",
    "to be like": "像",
    "to steal": "偷",
    "to paint": "涂",
    "to spread": "涂抹",
    "to plaster": "涂上",
    "to get wet": "弄湿",
    "to sleep": "睡觉",
    "to remain": "留下",
    "to be left": "剩下",
    "to transfer (trains)": "换乘",
    "to change (bus, train)": "换乘",
    "to carry": "搬运",
    "to transport": "运输",
    "to start": "开始",
    "to begin": "开始",
    "to commence": "开始",
    "to pay (e.g. money, bill)": "支付",
    "to grow cold": "变冷",
    "to get chilly": "变凉",
    "to cool down": "冷却",
    "to shine": "发光",
    "to glitter": "闪耀",
    "to be bright": "明亮",
    "to withdraw (money)": "取出（钱）",
    "to draw": "抽出",
    "to move (house)": "搬家",
    "to change residence": "搬家",
    "to open": "打开",
    "to undo": "解开",
    "to unseal": "开封",
    "to pick up": "捡起",
    "to increase": "增加",
    "to multiply": "增多",
    "to put on weight": "发胖",
    "to gain weight": "变胖",
    "to grow fat": "胖起来",
    "to step on": "踩",
    "to tread on": "踩踏",
    "to trample on": "践踏",
    "to lose": "输",
    "to be defeated": "被打败",
    "to be beaten": "被击败",
    "to make a mistake (in)": "弄错",
    "to commit an error": "犯错",
    "to get wrong": "搞错",
    "to be in time (for)": "赶得上",
    "to go around": "绕行",
    "to circle": "环绕",
    "to revolve around": "旋转",
    "to be seen": "看得见",
    "to be visible": "可见",
    "to be in sight": "在视野中",
    "to be found": "被找到",
    "to be discovered": "被发现",
    "to find": "找到",
    "to discover": "发现",
    "to come across": "偶然遇到",
    "to face": "面向",
    "to go out to meet": "迎接",
    "to welcome": "欢迎",
    "to eat": "吃",
    "to drink": "喝",
    "to be called": "叫做",
    "to turn back (e.g. half-way)": "返回",
    "to roast": "烤",
    "to broil": "烤",
    "to grill": "烤",
    "to be helpful": "有帮助",
    "to be useful": "有用",
    "to burn": "燃烧",
    "to burn down": "烧毁",
    "to go down in flames": "烧毁",
    "to become thin": "变瘦",
    "to lose weight": "减肥",
    "to slim": "变瘦",
    "to cease": "停止",
    "to be over": "结束",
    "to discontinue": "中止",
    "to shake": "摇晃",
    "to sway": "摇摆",
    "to rock": "摇动",
    "to get dirty": "弄脏",
    "to become dirty": "变脏",
    "to stop by (while on one's way to another place)": "顺路去",
    "to drop by": "顺便拜访",
    "to make a short visit": "短暂拜访",
    "to be delighted": "高兴",
    "to be glad": "开心",
    "to be pleased": "高兴",
    "to boil": "煮沸",
    "to heat (a liquid)": "加热（液体）",
    "to prepare (a bath, hot drink)": "烧（洗澡水/热饮）",
    "to separate (of a couple)": "分手",
    "to break up": "分手",
    "to divorce": "离婚",
    "to grow hot (e.g. water)": "烧开",
    "to laugh": "笑",
}


ZH_WORD_FALLBACK: dict[str, str] = {
    "apologize": "道歉",
    "apologise": "道歉",
    "rise": "上升",
    "collect": "收集",
    "assemble": "集合",
    "gather": "聚集",
    "open": "打开",
    "close": "关闭",
    "begin": "开始",
    "start": "开始",
    "end": "结束",
    "stop": "停止",
    "continue": "继续",
    "send": "发送",
    "receive": "收到",
    "accept": "接受",
    "give": "给",
    "take": "拿；取",
    "bring": "带来",
    "go": "去",
    "come": "来",
    "return": "回来",
    "move": "移动",
    "change": "改变",
    "choose": "选择",
    "decide": "决定",
    "think": "想；认为",
    "know": "知道",
    "see": "看",
    "look": "看",
    "watch": "观看",
    "hear": "听见",
    "speak": "说",
    "say": "说",
    "tell": "告诉",
    "ask": "问",
    "answer": "回答",
    "reply": "回复",
    "read": "读",
    "write": "写",
    "study": "学习",
    "learn": "学习",
    "teach": "教",
    "work": "工作",
    "use": "使用",
    "make": "制作",
    "do": "做",
    "eat": "吃",
    "drink": "喝",
    "sleep": "睡觉",
    "live": "生活；活着",
    "die": "死；去世",
    "buy": "买",
    "sell": "卖",
    "pay": "支付",
    "win": "赢",
    "lose": "输",
    "break": "坏；打破",
    "repair": "修理",
    "clean": "打扫",
    "wash": "洗",
    "throw": "扔",
    "carry": "搬运",
    "build": "建造",
    "meet": "见面",
    "visit": "拜访",
    "help": "帮助",
    "worry": "担心",
    "surprise": "吃惊",
    "laugh": "笑",
    "cry": "哭",
    "hot": "热",
    "cold": "冷",
    "warm": "暖",
    "cool": "凉",
    "new": "新",
    "old": "旧",
    "big": "大",
    "small": "小",
    "long": "长",
    "short": "短",
    "high": "高",
    "low": "低",
    "expensive": "贵",
    "cheap": "便宜",
    "easy": "容易",
    "difficult": "难",
    "important": "重要",
    "special": "特别",
    "necessary": "必要",
    "possible": "可能",
    "impossible": "不可能",
    "beautiful": "美丽",
    "pretty": "漂亮",
    "strange": "奇怪",
    "danger": "危险",
    "safe": "安全",
    "person": "人",
    "place": "地方",
    "thing": "东西",
    "time": "时间",
    "day": "日子",
    "week": "周",
    "month": "月",
    "year": "年",
    "school": "学校",
    "company": "公司",
    "station": "车站",
    "train": "电车",
    "bus": "公交车",
    "car": "车",
    "room": "房间",
    "house": "家；房子",
    "home": "家",
    "shop": "店",
    "store": "商店",
    "hospital": "医院",
    "medicine": "医学；药",
    "food": "食物",
    "water": "水",
    "money": "钱",
    "book": "书",
    "letter": "信；文字",
    "word": "词",
    "language": "语言",
    "Japanese": "日语；日本的",
    "English": "英语；英国的",
}


def clean_gloss_piece(piece: str) -> str:
    piece = piece.strip()
    piece = re.sub(r"\s+", " ", piece)
    return piece


def translate_gloss_piece(piece: str) -> tuple[str, str]:
    piece = clean_gloss_piece(piece)
    if not piece:
        return "", "empty"
    if piece in ZH_PHRASES:
        return ZH_PHRASES[piece], "phrase"
    if piece in ZH_VERB_PHRASES:
        return ZH_VERB_PHRASES[piece], "verb_phrase"

    lowered = piece.lower()
    if lowered.startswith("to ") and piece in ZH_VERB_PHRASES:
        return ZH_VERB_PHRASES[piece], "verb_phrase"
    if lowered.startswith("to "):
        core = re.sub(r"\([^)]*\)", "", lowered[3:]).strip()
        first = re.split(r"\s+", core)[0]
        if first in ZH_WORD_FALLBACK:
            return ZH_WORD_FALLBACK[first], "word_fallback"
    compact = re.sub(r"\([^)]*\)", "", lowered)
    tokens = [t for t in re.split(r"[^a-zA-Z]+", compact) if t]
    translated = [ZH_WORD_FALLBACK[t] for t in tokens if t in ZH_WORD_FALLBACK]
    if translated:
        return "；".join(list(dict.fromkeys(translated))[:3]), "word_fallback"
    return f"待审：{piece}", "unmapped"


def build_meaning_zh(entry_id: str, glosses: list[str], chosen_sense: dict[str, Any]) -> dict[str, Any]:
    if entry_id in ZH_OVERRIDES:
        candidate = ZH_OVERRIDES[entry_id]
        return {
            "meaning_zh": candidate,
            "candidate_meanings": candidate.split("；"),
            "source": "override",
            "high_risk": bool(chosen_sense.get("needs_sense_review")),
            "needs_sense_review": bool(chosen_sense.get("needs_sense_review")),
            "reason": "sense needs review; Chinese meaning is a staging candidate" if chosen_sense.get("needs_sense_review") else "",
        }

    candidates: list[str] = []
    review_candidates: list[str] = []
    sources: list[str] = []
    for gloss in glosses[:5]:
        zh, source = translate_gloss_piece(gloss)
        if zh and zh not in review_candidates:
            review_candidates.append(zh)
        if zh and not zh.startswith("待审：") and zh not in candidates:
            candidates.append(zh)
        sources.append(source)

    meaning_zh = "；".join(candidates[:4])
    unmapped = any(s == "unmapped" for s in sources)
    high_risk = bool(chosen_sense.get("needs_sense_review")) or not meaning_zh or unmapped
    reason = ""
    if chosen_sense.get("needs_sense_review"):
        reason = "JMdict sense ranking was low or tied; verify selected sense before product use."
    elif unmapped:
        reason = "One or more English glosses used an unmapped fallback."
    elif not meaning_zh:
        reason = "No Chinese candidate generated."
    if not meaning_zh:
        meaning_zh = "待审"

    return {
        "meaning_zh": meaning_zh,
        "candidate_meanings": review_candidates,
        "source": ",".join(dict.fromkeys(sources)),
        "high_risk": high_risk,
        "needs_sense_review": bool(chosen_sense.get("needs_sense_review")),
        "reason": reason,
    }


def classify_meaning_risk(
    entry_id: str,
    word: str,
    meaning_review: dict[str, Any],
    chosen_sense: dict[str, Any],
    match: dict[str, Any],
) -> str:
    if not meaning_review.get("high_risk"):
        return "okay"
    pos_text = " ".join(chosen_sense.get("pos", []))
    gloss_text = " ".join(chosen_sense.get("gloss", []))
    if (
        "hon" in pos_text
        or "honorific" in gloss_text
        or entry_id in {
            "n4_oideninaru",
            "n4_itadaku",
            "n4_itasu",
            "n4_irassharu",
            "n4_kudasaru",
            "n4_goranninaru",
            "n4_nasaru",
            "n4_meshiagaru",
            "n4_moushiageru",
            "n4_mousu",
        }
    ):
        return "honorific/register"
    if is_katakana_text(word):
        return "katakana loanword"
    if match.get("manual_fix_type") in {"phrase", "compound"}:
        return "phrase/compound"
    if meaning_review.get("source") == "override":
        return "okay"
    if (
        meaning_review.get("meaning_zh") == "待审"
        or "word_fallback" in meaning_review.get("source", "")
        or "unmapped" in meaning_review.get("source", "")
    ):
        return "translation awkward"
    if meaning_review.get("needs_sense_review"):
        return "sense ambiguity"
    return "okay"


def rough_reading_meaning_duplicate(existing: set[Any], reading: str, meaning_en: str) -> bool:
    seed_words = set(normalize_text(meaning_en).split())
    if not seed_words:
        return False
    for existing_reading, existing_meaning in existing:
        if existing_reading != reading:
            continue
        existing_words = set(normalize_text(existing_meaning).split())
        if seed_words & existing_words:
            return True
    return False


def sudachi_check(word: str, reading: str, sudachi_tokenizer: Any) -> dict[str, Any]:
    morphemes = list(sudachi_tokenizer.tokenize(word, tokenizer.Tokenizer.SplitMode.C))
    token_reading = "".join(jaconv.kata2hira(m.reading_form()) for m in morphemes if m.reading_form() != "*")
    dictionary_form = "".join(m.dictionary_form() for m in morphemes)
    normalized_form = "".join(m.normalized_form() for m in morphemes)
    pos = [" / ".join(m.part_of_speech()) for m in morphemes]
    return {
        "reading_form": token_reading,
        "reading_match": token_reading == reading or token_reading == jaconv.kata2hira(reading),
        "dictionary_form": dictionary_form,
        "part_of_speech": pos,
        "normalized_form": normalized_form,
    }


def classify_reading_mismatch(
    reading: str,
    sudachi: dict[str, Any],
    match: dict[str, Any],
) -> dict[str, Any]:
    sudachi_reading = sudachi.get("reading_form", "")
    first = (match.get("matches") or [{}])[0]
    jmdict_readings = first.get("kana") or []
    if sudachi_reading == reading:
        category = "exact"
        blocker = False
    elif sudachi_reading == jaconv.kata2hira(reading):
        category = "kana_script_difference"
        blocker = False
    elif reading in jmdict_readings:
        category = "alternate_isolated_reading"
        blocker = False
    else:
        category = "seed_word_reading_mismatch"
        blocker = True
    return {
        "category": category,
        "blocker": blocker,
        "jmdict_readings": jmdict_readings,
    }


def build_sample(args: argparse.Namespace) -> tuple[list[dict[str, Any]], dict[str, Any], list[dict[str, Any]]]:
    seed = fetch_seed(args.seed_timeout)
    seed_rows = parse_seed_rows(seed.text)
    existing_n5 = load_existing_n5(args.content)
    jmdict_words = load_jmdict(args.jmdict_cache)
    by_seq = index_jmdict_by_seq(jmdict_words)
    by_form = index_jmdict_by_form(jmdict_words)
    sudachi_tokenizer = dictionary.Dictionary().create()

    stats = {
        "total_n4_seed_count": len(seed_rows),
        "generated_count": 0,
        "sample_count": 0,
        "skipped_duplicate_with_n5_count": 0,
        "matched_jmdict_count": 0,
        "unmatched_jmdict_count": 0,
        "reading_mismatch_count": 0,
        "reading_mismatch_categories": {},
        "sense_review_count": 0,
        "blocker_count": 0,
        "pos_mismatch_count": 0,
        "multi_match_count": 0,
        "manual_mapping_count": 0,
        "ateji_avoided_count": 0,
        "okurigana_normalized_count": 0,
        "kana_preferred_count": 0,
        "jmdict_form_used_count": 0,
        "generated_meaning_zh_count": 0,
        "empty_meaning_zh_count": 0,
        "high_risk_meaning_count": 0,
        "auto_fixed_meaning_count": 0,
        "manual_review_meaning_count": 0,
        "high_risk_meaning_categories": {},
    }
    staging: list[dict[str, Any]] = []
    audit: list[dict[str, Any]] = []
    skipped_duplicates: list[dict[str, str]] = []
    id_counts: dict[str, int] = {}

    for row in seed_rows:
        if args.sample_count and len(staging) >= args.sample_count:
            break
        match = match_jmdict(by_seq, by_form, row)
        word, reading, form_rules = choose_word_reading(row, match)
        chosen_sense = choose_sense(match, row.get("waller_definition", ""))
        jmdict_pos = chosen_sense.get("pos", []) or []
        jmdict_gloss = chosen_sense.get("gloss", []) or []
        meaning_en = "; ".join(jmdict_gloss[:3]) if jmdict_gloss else row.get("waller_definition", "")

        duplicate_reasons = []
        if row.get("jmdict_seq") in existing_n5["by_seq"]:
            duplicate_reasons.append("jmdict_seq")
        if (word, reading) in existing_n5["by_pair"]:
            duplicate_reasons.append("word+reading")
        if rough_reading_meaning_duplicate(existing_n5["by_reading_meaning"], reading, meaning_en):
            duplicate_reasons.append("reading+meaning_en")
        if duplicate_reasons:
            stats["skipped_duplicate_with_n5_count"] += 1
            skipped_duplicates.append({"word": word, "reading": reading, "reasons": ",".join(duplicate_reasons)})
            continue

        sudachi = sudachi_check(word, reading, sudachi_tokenizer)
        reading_review = classify_reading_mismatch(reading, sudachi, match)
        stats["generated_count"] += 1
        stats["sample_count"] = stats["generated_count"]
        stats["matched_jmdict_count"] += 1 if match["matched"] else 0
        stats["unmatched_jmdict_count"] += 0 if match["matched"] else 1
        stats["multi_match_count"] += 1 if match["multi_match"] else 0
        stats["manual_mapping_count"] += 1 if match.get("manual_mapping") else 0
        stats["reading_mismatch_count"] += 0 if reading_review["category"] == "exact" else 1
        stats["reading_mismatch_categories"][reading_review["category"]] = (
            stats["reading_mismatch_categories"].get(reading_review["category"], 0) + 1
        )
        stats["sense_review_count"] += 1 if chosen_sense["needs_sense_review"] else 0
        stats["ateji_avoided_count"] += 1 if form_rules["ateji_avoided"] else 0
        stats["okurigana_normalized_count"] += 1 if form_rules["okurigana_normalized"] else 0
        stats["kana_preferred_count"] += 1 if form_rules["kana_preferred"] else 0
        stats["jmdict_form_used_count"] += 1 if form_rules["jmdict_form_used"] else 0

        pos = n5_pos_from_jmdict(jmdict_pos)
        pos_mismatch = False
        stats["pos_mismatch_count"] += 1 if pos_mismatch else 0
        blocker_reasons = []
        if not match["matched"]:
            blocker_reasons.append("jmdict_unmatched")
        if reading_review["blocker"]:
            blocker_reasons.append("seed_word_reading_mismatch")
        if chosen_sense["needs_sense_review"] and not jmdict_gloss:
            blocker_reasons.append("meaning_sense_unmatched")
        blocker = bool(blocker_reasons)
        stats["blocker_count"] += 1 if blocker else 0
        base_entry_id = f"n4_{safe_slug(reading, str(stats['generated_count']))}"
        id_counts[base_entry_id] = id_counts.get(base_entry_id, 0) + 1
        entry_id = base_entry_id if id_counts[base_entry_id] == 1 else f"{base_entry_id}_{id_counts[base_entry_id]}"
        meaning_review = build_meaning_zh(entry_id, jmdict_gloss or [row.get("waller_definition", "")], chosen_sense)
        risk_category = classify_meaning_risk(entry_id, word, meaning_review, chosen_sense, match)
        meaning_review["risk_category"] = risk_category
        meaning_review["auto_fixed"] = entry_id in CURRENT_MEANING_AUTO_FIX_IDS
        stats["generated_meaning_zh_count"] += 1 if meaning_review["meaning_zh"] else 0
        stats["empty_meaning_zh_count"] += 0 if meaning_review["meaning_zh"] else 1
        stats["high_risk_meaning_count"] += 1 if meaning_review["high_risk"] else 0
        stats["auto_fixed_meaning_count"] += 1 if meaning_review["auto_fixed"] else 0
        stats["manual_review_meaning_count"] += 1 if meaning_review["high_risk"] and not meaning_review["auto_fixed"] else 0
        if meaning_review["high_risk"]:
            stats["high_risk_meaning_categories"][risk_category] = (
                stats["high_risk_meaning_categories"].get(risk_category, 0) + 1
            )

        entry = {
            "id": entry_id,
            "word": word,
            "reading": reading,
            "level": "N4",
            "levels": ["N4"],
            "pos": pos,
            "meaning_zh": meaning_review["meaning_zh"],
            "meaning_en": meaning_en,
            "status": "candidate",
            "tags": {"scene": ["daily"], "type": ["uncategorized"], "memory": []},
            "yanFeatures": [],
            "coreChunk": "",
            "exampleJp": "",
            "exampleRoma": "",
            "exampleZh": "",
        }
        staging.append(entry)
        audit.append({
            "id": entry_id,
            "jmdict_seq": row.get("jmdict_seq", ""),
            "seed": row,
            "jmdict": match,
            "sudachi": sudachi,
            "reading_review": reading_review,
            "chosen_sense": chosen_sense,
            "meaning_zh_review": meaning_review,
            "form_rules": form_rules,
            "fix_type": match.get("manual_fix_type", ""),
            "fix_note": match.get("manual_note", ""),
            "duplicate_with_existing_n5": False,
            "pos_mismatch": pos_mismatch,
            "blocker": blocker,
            "blocker_reasons": blocker_reasons,
            "needs_review": blocker or match["multi_match"] or chosen_sense["needs_sense_review"] or reading_review["category"] not in ("exact", "kana_script_difference"),
        })

    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "seed_source": {
            "repo": SEED_REPO,
            "repo_url": SEED_REPO_URL,
            "file": SEED_PATH,
            "api_url": SEED_API_URL,
            "html_url": seed.html_url,
            "download_url": seed.download_url,
            "license": SEED_LICENSE,
            "github_blob_sha": seed.sha,
            "expected_github_blob_sha": SEED_EXPECTED_SHA,
            "sha_matches_expected": seed.sha == SEED_EXPECTED_SHA,
            "fetched_at": seed.fetched_at,
            "source_note": SEED_SOURCE_NOTE,
            "scope_note": SEED_SCOPE_NOTE,
        },
        "jmdict_source": {
            "cache": str(args.jmdict_cache),
            "license_note": JMDICT_LICENSE_NOTE,
            "word_count": len(jmdict_words),
        },
        "sudachi_source": {
            "package": "sudachipy + sudachidict_core",
            "purpose": "reading_form, dictionary_form, part_of_speech, normalized_form validation",
        },
        "stats": stats,
        "skipped_duplicates_preview": skipped_duplicates[:30],
        "review_ids": [a["id"] for a in audit if a["needs_review"]],
        "manual_review_top_list": [
            {
                "id": a["id"],
                "word": next(e["word"] for e in staging if e["id"] == a["id"]),
                "reading": next(e["reading"] for e in staging if e["id"] == a["id"]),
                "reasons": [
                    *(a["blocker_reasons"] or []),
                    *([] if not a["chosen_sense"]["needs_sense_review"] else ["sense_review"]),
                    *([] if a["reading_review"]["category"] in ("exact", "kana_script_difference") else [a["reading_review"]["category"]]),
                    *([] if not a["jmdict"]["multi_match"] else ["multi_match"]),
                ],
            }
            for a in audit
            if a["needs_review"]
        ][:50],
    }
    return staging, metadata, audit


def write_report(path: Path, staging: list[dict[str, Any]], metadata: dict[str, Any], audit: list[dict[str, Any]]) -> None:
    stats = metadata["stats"]
    seed = metadata["seed_source"]
    lines = [
        "# N4 Core Staging Report",
        "",
        "## Source",
        f"- Seed source URL: {seed['html_url']}",
        f"- Repo: {seed['repo_url']}",
        f"- License: {seed['license']}",
        f"- File SHA: `{seed['github_blob_sha']}`",
        f"- Expected SHA: `{seed['expected_github_blob_sha']}`",
        f"- SHA matches expected: {seed['sha_matches_expected']}",
        f"- Source note: {seed['source_note']}",
        f"- Scope note: {seed['scope_note']}",
        f"- Fetched at: {seed['fetched_at']}",
        f"- JMdict cache: {metadata['jmdict_source']['cache']}",
        f"- JMdict words loaded: {metadata['jmdict_source']['word_count']}",
        f"- JMdict license note: {metadata['jmdict_source']['license_note']}",
        "- Sudachi: sudachipy + sudachidict_core for local validation",
        "",
        "## Summary",
        f"- total N4 seed count: {stats['total_n4_seed_count']}",
        f"- generated count: {stats['generated_count']}",
        f"- skipped duplicate with N5 count: {stats['skipped_duplicate_with_n5_count']}",
        f"- matched JMdict count: {stats['matched_jmdict_count']}",
        f"- unmatched JMdict count: {stats['unmatched_jmdict_count']}",
        f"- reading mismatch count: {stats['reading_mismatch_count']}",
        f"- sense review count: {stats['sense_review_count']}",
        f"- blocker count: {stats['blocker_count']}",
        f"- pos mismatch count: {stats['pos_mismatch_count']}",
        f"- multi-match count: {stats['multi_match_count']}",
        f"- manual mapping count: {stats['manual_mapping_count']}",
        f"- generated meaning_zh count: {stats['generated_meaning_zh_count']}",
        f"- empty meaning_zh count: {stats['empty_meaning_zh_count']}",
        f"- high-risk meaning count: {stats['high_risk_meaning_count']}",
        f"- auto-fixed meaning count: {stats['auto_fixed_meaning_count']}",
        f"- still needs manual meaning review count: {stats['manual_review_meaning_count']}",
        "",
        "## High-Risk Meaning Categories",
        *[
            f"- {category}: {count}"
            for category, count in sorted(stats["high_risk_meaning_categories"].items())
        ],
        "",
        "## Reading Mismatch Categories",
        *[
            f"- {category}: {count}"
            for category, count in sorted(stats["reading_mismatch_categories"].items())
        ],
        "",
        "## Form Rule Application",
        f"- ateji avoided count: {stats['ateji_avoided_count']}",
        f"- okurigana normalized count: {stats['okurigana_normalized_count']}",
        f"- kana preferred count: {stats['kana_preferred_count']}",
        f"- JMdict fallback form used count: {stats['jmdict_form_used_count']}",
        "",
        "## License / Attribution Notes",
        "- This staging uses stephenmk/yomitan-jlpt-vocab under CC-BY-SA-4.0.",
        "- The seed traces JLPT data to Jonathan Waller / Tanos; stephenmk added JMdict entry IDs.",
        "- This is an N4 Core seed, not an official JLPT vocabulary list and not final complete N4+ coverage.",
        "- GPL and no-license datasets were not used for staging generation.",
        "- `meaning_zh` values are staging candidates only and are not final product copy.",
        "",
        "## Manual Mapping Fixes",
        "| id | seed kanji | seed kana | seed meaning | fixed word | fixed reading | meaning_en | matched | fix type |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    audit_by_id = {a["id"]: a for a in audit}
    for entry in staging:
        st = audit_by_id[entry["id"]]
        if not st["jmdict"].get("manual_mapping"):
            continue
        seed_row = st["seed"]
        lines.append(
            f"| {entry['id']} | {seed_row.get('kanji', '')} | {seed_row.get('kana', '')} | "
            f"{seed_row.get('waller_definition', '')} | {entry['word']} | {entry['reading']} | "
            f"{entry['meaning_en']} | yes/manual | {st['fix_type']} |"
        )
    lines.extend([
        "",
        "## Meaning Zh Auto Fixes",
        "| id | word | reading | meaning_en | meaning_zh candidate | category |",
        "|---|---|---|---|---|---|",
    ])
    for entry in staging:
        st = audit_by_id[entry["id"]]
        mr = st["meaning_zh_review"]
        if not mr.get("auto_fixed"):
            continue
        lines.append(
            f"| {entry['id']} | {entry['word']} | {entry['reading']} | "
            f"{entry['meaning_en']} | {entry['meaning_zh']} | {mr['risk_category']} |"
        )
    lines.extend([
        "",
        "## Manual Review Top List",
        "| # | id | word | reading | reasons |",
        "|---:|---|---|---|---|",
    ])
    for idx, item in enumerate(metadata["manual_review_top_list"], start=1):
        lines.append(
            f"| {idx} | {item['id']} | {item['word']} | {item['reading']} | {', '.join(item['reasons'])} |"
        )
    meaning_review_rows = [
        a for a in audit
        if a["meaning_zh_review"]["high_risk"] and not a["meaning_zh_review"].get("auto_fixed")
    ]
    lines.extend([
        "",
        "## Meaning Manual Review Top 50",
        "| # | id | word | reading | meaning_en | meaning_zh candidate | category | reason |",
        "|---:|---|---|---|---|---|---|---|",
    ])
    for idx, st in enumerate(meaning_review_rows[:50], start=1):
        entry = next(e for e in staging if e["id"] == st["id"])
        mr = st["meaning_zh_review"]
        lines.append(
            f"| {idx} | {entry['id']} | {entry['word']} | {entry['reading']} | "
            f"{entry['meaning_en']} | {entry['meaning_zh']} | {mr['risk_category']} | {mr['reason']} |"
        )
    lines.extend([
        "",
        "## Meaning Zh Sample (50)",
        "| # | id | word | reading | meaning_en | meaning_zh candidate | review |",
        "|---:|---|---|---|---|---|---|",
    ])
    for idx, entry in enumerate(staging[:50], start=1):
        st = audit_by_id[entry["id"]]
        mr = st["meaning_zh_review"]
        review = []
        if mr["needs_sense_review"]:
            review.append("sense-review")
        if mr["high_risk"]:
            review.append("high-risk")
        if mr["source"]:
            review.append(mr["source"])
        lines.append(
            f"| {idx} | {entry['id']} | {entry['word']} | {entry['reading']} | "
            f"{entry['meaning_en']} | {entry['meaning_zh']} | {', '.join(review)} |"
        )
    sense_review_rows = [a for a in audit if a["meaning_zh_review"]["needs_sense_review"]]
    lines.extend([
        "",
        "## Sense Review Preview (First 30)",
        "| # | id | word | reading | seed meaning | selected gloss | meaning_zh candidate | reason |",
        "|---:|---|---|---|---|---|---|---|",
    ])
    for idx, st in enumerate(sense_review_rows[:30], start=1):
        entry = next(e for e in staging if e["id"] == st["id"])
        mr = st["meaning_zh_review"]
        seed_meaning = st["seed"].get("waller_definition", "")
        selected_gloss = "; ".join(st["chosen_sense"].get("gloss", [])[:3])
        lines.append(
            f"| {idx} | {entry['id']} | {entry['word']} | {entry['reading']} | "
            f"{seed_meaning} | {selected_gloss} | {entry['meaning_zh']} | {mr['reason']} |"
        )
    lines.extend([
        "",
        "## Generated Preview",
        "| # | id | word | reading | pos | meaning_en | jmdict_seq | sudachi reading | dictionary form | normalized form | review |",
        "|---:|---|---|---|---|---|---|---|---|---|---|",
    ])
    for idx, entry in enumerate(staging, start=1):
        st = audit_by_id[entry["id"]]
        sud = st["sudachi"]
        review = []
        if not st["jmdict"]["matched"]:
            review.append("unmatched")
        if st["jmdict"]["multi_match"]:
            review.append(f"multi-match:{st['jmdict']['match_count']}")
        if st["reading_review"]["category"] != "exact":
            review.append(st["reading_review"]["category"])
        if st["chosen_sense"]["needs_sense_review"]:
            review.append("sense-review")
        if st["blocker"]:
            review.append("BLOCKER:" + ",".join(st["blocker_reasons"]))
        lines.append(
            f"| {idx} | {entry['id']} | {entry['word']} | {entry['reading']} | {entry['pos']} | "
            f"{entry['meaning_en']} | {st['jmdict_seq']} | {sud['reading_form']} | "
            f"{sud['dictionary_form']} | {sud['normalized_form']} | {', '.join(review)} |"
        )
    lines.extend([
        "",
        "## Skipped N5 Duplicate Preview",
        "| word | reading | reason |",
        "|---|---|---|",
    ])
    for dup in metadata["skipped_duplicates_preview"]:
        lines.append(f"| {dup['word']} | {dup['reading']} | {dup['reasons']} |")
    lines.extend([
        "",
        "## Next-Step Risks",
        "- JLPT vocabulary lists are estimates; keep N4 Core as a reviewed seed, not a truth source.",
        "- CC-BY-SA attribution and share-alike obligations need product/legal handling before release.",
        "- Chinese meanings are staging candidates; high-risk and sense-review rows must be reviewed before release.",
        "- Examples are intentionally left blank for a separate example workflow.",
        "- Some Sudachi reading mismatches may be dictionary normalization artifacts and need human review.",
    ])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_meaning_review(path: Path, staging: list[dict[str, Any]], audit: list[dict[str, Any]]) -> None:
    entry_by_id = {entry["id"]: entry for entry in staging}
    rows = [
        a for a in audit
        if (a["meaning_zh_review"]["high_risk"] or a["meaning_zh_review"]["needs_sense_review"])
        and not a["meaning_zh_review"].get("auto_fixed")
    ]
    auto_fixed = [a for a in audit if a["meaning_zh_review"].get("auto_fixed")]
    lines = [
        "# N4 Meaning Zh Review",
        "",
        "These Chinese meanings are staging candidates only. Review rows here before treating them as product copy.",
        "",
        f"- manual review row count: {len(rows)}",
        f"- auto-fixed row count: {len(auto_fixed)}",
        f"- sense review count: {sum(1 for a in rows if a['meaning_zh_review']['needs_sense_review'])}",
        f"- high-risk meaning count: {sum(1 for a in rows if a['meaning_zh_review']['high_risk'])}",
        "",
        "| # | id | word | reading | meaning_en | meaning_zh candidate | category | candidate meanings | source | reason |",
        "|---:|---|---|---|---|---|---|---|---|---|",
    ]
    for idx, st in enumerate(rows, start=1):
        entry = entry_by_id[st["id"]]
        mr = st["meaning_zh_review"]
        lines.append(
            f"| {idx} | {entry['id']} | {entry['word']} | {entry['reading']} | "
            f"{entry['meaning_en']} | {entry['meaning_zh']} | "
            f"{mr['risk_category']} | {' / '.join(mr['candidate_meanings'])} | {mr['source']} | {mr['reason']} |"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate an auditable N4 Core staging sample.")
    parser.add_argument("--sample-count", type=int, default=50)
    parser.add_argument("--content", type=Path, default=DEFAULT_CONTENT)
    parser.add_argument("--output", type=Path, default=DEFAULT_STAGING)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--meaning-review", type=Path, default=DEFAULT_MEANING_REVIEW)
    parser.add_argument("--jmdict-cache", type=Path, default=DEFAULT_JMDICT_CACHE)
    parser.add_argument("--seed-timeout", type=int, default=45)
    args = parser.parse_args()

    start = time.time()
    staging, metadata, audit = build_sample(args)
    metadata["elapsed_seconds"] = round(time.time() - start, 2)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    payload = {"metadata": metadata, "wordBank": staging, "audit": audit}
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_report(args.report, staging, metadata, audit)
    write_meaning_review(args.meaning_review, staging, audit)
    print(json.dumps({
        "output": str(args.output),
        "report": str(args.report),
        "meaning_review": str(args.meaning_review),
        **metadata["stats"],
        "sha_matches_expected": metadata["seed_source"]["sha_matches_expected"],
        "review_ids": metadata["review_ids"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
