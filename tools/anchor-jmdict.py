#!/usr/bin/env python3
"""JMdict 锚定审计 · 把 wordBank 的读音/词性/义项/显示放到权威词典上验。

数据源:jmdict-simplified(scriptin/jmdict-simplified,CC-BY-SA)JSON 版。
  下载:GitHub release 资产 jmdict-eng-common-*.json.zip(常用词子集,~16MB)
  默认路径:tools/data/jmdict-eng-common.json(用 --jmdict 覆盖)

设计:report-only,绝不改 content。JMdict 没有中文,所以它的角色是
「权威义项地图 + 英文真相 + 常用度」,中文释义在它身上被审,不是由它生成。

检查分层:
  P0_reading_not_attested   存储读音在 JMdict 该词条下查无 → 可能读音错(致命)
  P1_reading_not_common     存储读音 JMdict 标为非常用,另有常用读音 → 确认教哪个
  P1_should_be_kana         JMdict 标 uk(通常假名),但 wordBank 用汉字显示
  P1_false_friend_confirm   日中同形异义高危词 → 确认中文释义是日语义不是汉字直读义
  P1_pos_mismatch           词性与 JMdict 主词性不符
  P2_missing_sense          JMdict 义项数 > 中文义项数 → 可能漏义(附英文义供核)
  INFO                      已匹配且无异常(可选输出英文义,供中文地道度人工核对)
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import jaconv

SENSE_SEP = re.compile(r"[;；/／,，、]")

# 日中同形异义高危词(N5-N4 段高频)。命中 → 人工确认中文是日语义。
FALSE_FRIENDS: Set[str] = {
    "手紙", "勉強", "大丈夫", "邪魔", "我慢", "床", "娘", "切手", "汽車",
    "新聞", "工夫", "丈夫", "留守", "喧嘩", "怪我", "風邪", "顔色", "階段",
    "約束", "用意", "文句", "無理", "結構", "適当", "真面目", "得意", "苦手",
    "迷惑", "心配", "元気", "野菜", "勝手", "返事", "外人", "下手", "上手",
    "邪魔", "授業", "宿題", "怪我", "泥棒", "親切", "正直", "感心",
}

# JMdict 词性大类 → 中文 pos 粗映射(只做粗校,不细抠)
POS_JP = {
    "n": "名词", "pn": "代词", "adj-i": "形容词", "adj-na": "形容词",
    "adv": "副词", "int": "感叹词", "conj": "连词", "exp": "惯用",
    "pref": "接头", "suf": "接尾", "ctr": "量词",
}
POS_VERB = {"v1", "v5", "vs", "vk", "vi", "vt"}  # 任何 v* 视为动词


def clean_reading(s: str) -> str:
    """去掉 reading 字段里的注释/助词污染:「けっこん (する)」「(〜を) とお」。"""
    s = re.sub(r"[（(].*?[)）]", "", s or "")   # 去括号注释(する/〜を 等)
    return s.strip()


def hira(s: str) -> str:
    return re.sub(r"[～\s・ー]", "", jaconv.kata2hira(s or ""))


def load_jmdict(path: Path):
    """返回 (by_kanji, by_kana):text → [word entry]。"""
    data = json.loads(path.read_text(encoding="utf-8"))
    by_kanji: Dict[str, List[dict]] = defaultdict(list)
    by_kana: Dict[str, List[dict]] = defaultdict(list)
    for w in data["words"]:
        for k in w.get("kanji", []):
            by_kanji[k["text"]].append(w)
        for k in w.get("kana", []):
            by_kana[hira(k["text"])].append(w)
    return by_kanji, by_kana


def jm_pos_set(entry: dict) -> Set[str]:
    out: Set[str] = set()
    for s in entry.get("sense", []):
        for p in s.get("partOfSpeech", []):
            out.add("verb" if p[:2] in {"v1", "v5", "vs", "vk", "vi", "vt"} or p.startswith("v") else p)
    return out


def jm_glosses(entry: dict, limit: int = 4) -> str:
    senses = []
    for s in entry.get("sense", []):
        g = "/".join(x["text"] for x in s.get("gloss", [])[:3])
        if g:
            senses.append(g)
    return " | ".join(senses[:limit])


def jm_sense_count(entry: dict) -> int:
    return sum(1 for s in entry.get("sense", []) if s.get("gloss"))


def common_reading_set(word: str, by_kanji, by_kana):
    """聚合该词所有同形条目的读音(按平假名),返回 (all_hira, common_hira, common_texts)。"""
    forms = [f.strip().replace("～", "") for f in SENSE_SEP.split(word) if f.strip()]
    entries = []
    for f in forms:
        entries += by_kanji.get(f, [])
        entries += by_kana.get(hira(f), [])
    all_h: Set[str] = set()
    common_h: Set[str] = set()
    common_t: List[str] = []
    for e in entries:
        for k in e.get("kana", []):
            h = hira(k["text"])
            all_h.add(h)
            if k.get("common"):
                common_h.add(h)
                if k["text"] not in common_t:
                    common_t.append(k["text"])
    return all_h, common_h, common_t


def match_entry(word: str, reading: str, by_kanji, by_kana) -> Optional[dict]:
    """优先按汉字+读音匹配;退而按读音;再退按汉字第一条。"""
    forms = [f.strip().replace("～", "") for f in SENSE_SEP.split(word) if f.strip()]
    rd = hira(SENSE_SEP.split(clean_reading(reading))[0]) if reading else ""
    # 汉字命中且读音吻合
    for f in forms:
        for e in by_kanji.get(f, []):
            kanas = {hira(k["text"]) for k in e.get("kana", [])}
            if rd and rd in kanas:
                return e
    # 纯假名词
    for f in forms:
        if hira(f) in by_kana:
            return by_kana[hira(f)][0]
    if rd and rd in by_kana:
        # 读音命中,且该条确有此汉字
        for e in by_kana[rd]:
            ktexts = {k["text"] for k in e.get("kanji", [])}
            if any(f in ktexts for f in forms) or not e.get("kanji"):
                return e
    # 最后:汉字命中但读音对不上(留给 reading_not_attested 判断)
    for f in forms:
        if by_kanji.get(f):
            return by_kanji[f][0]
    return None


def audit(entry_wb: dict, by_kanji, by_kana) -> dict:
    word = str(entry_wb.get("word", ""))
    reading = str(entry_wb.get("reading", ""))
    meaning = str(entry_wb.get("meaning_zh", ""))
    pos_zh = str(entry_wb.get("pos", ""))
    flags: List[str] = []
    detail: List[str] = []

    jm = match_entry(word, reading, by_kanji, by_kana)
    if jm is None:
        return {"id": entry_wb.get("id"), "word": word, "reading": reading,
                "flags": ["P2_no_jmdict_match"],
                "detail": ["JMdict 常用词表查无(可能生僻/写法差异/拼写)"],
                "gloss": ""}

    gloss = jm_glosses(jm)
    rd = hira(SENSE_SEP.split(clean_reading(reading))[0]) if reading else ""

    # 读音:用「该词所有同形条目」聚合的读音集合判断(修同形/片假名 bug)
    all_h, common_h, common_t = common_reading_set(word, by_kanji, by_kana)
    if rd and all_h:
        if rd not in all_h:
            flags.append("P0_reading_not_attested")
            detail.append(f"读音「{clean_reading(reading)}」JMdict 查无,常用:{'/'.join(common_t) or '?'}")
        elif common_h and rd not in common_h:
            flags.append("P1_reading_not_common")
            detail.append(f"读音「{clean_reading(reading)}」非常用,JMdict 常用:{'/'.join(common_t)}")

    # uk:通常假名书写,但 wordBank 用了汉字
    is_uk = any("uk" in s.get("misc", []) for s in jm.get("sense", []))
    has_kanji_word = bool(re.search(r"[㐀-鿿]", word))
    if is_uk and has_kanji_word:
        flags.append("P1_should_be_kana")
        detail.append(f"JMdict 标 uk(通常假名);考虑显示「{reading}」而非「{word}」")

    # 假朋友
    if any(f in FALSE_FRIENDS for f in [x.strip() for x in SENSE_SEP.split(word)]):
        flags.append("P1_false_friend_confirm")
        detail.append(f"同形异义高危;中文「{meaning}」需 = 日语义,JMdict英:[{gloss}]")

    # 词性粗校:只报「存储说动词但 JMdict 无动词义」这个方向(反向多是する名词,FP)
    jm_pos = jm_pos_set(jm)
    if pos_zh and jm_pos and "动词" in pos_zh and "verb" not in jm_pos:
        flags.append("P1_pos_mismatch")
        detail.append(f"标为动词,但 JMdict 无动词义 {sorted(jm_pos)};英:[{gloss}]")

    # 漏义:JMdict 穷举古义/技术义,作为「正确性」信号噪声太大,默认不报。
    # 仅作言库富度信号保留在 _enrich(不进 flags/默认报告)。

    return {"id": entry_wb.get("id"), "word": word, "reading": reading,
            "meaning": meaning, "flags": flags, "detail": detail, "gloss": gloss}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, default=Path("yan-content/content.v2.json"))
    ap.add_argument("--jmdict", type=Path, default=Path("tools/data/jmdict-eng-common.json"))
    ap.add_argument("--levels", default="N5,N4")
    ap.add_argument("--limit", type=int, default=300)
    args = ap.parse_args()

    by_kanji, by_kana = load_jmdict(args.jmdict)
    wb = json.loads(args.input.read_text(encoding="utf-8"))["wordBank"]
    levels = {x.strip() for x in args.levels.split(",") if x.strip()}
    if levels:
        wb = [w for w in wb if str(w.get("level", "")) in levels]

    results = [audit(e, by_kanji, by_kana) for e in wb]
    flagged = [r for r in results if r["flags"]]
    matched = sum(1 for r in results if "P2_no_jmdict_match" not in r["flags"])

    counts: Dict[str, int] = defaultdict(int)
    for r in flagged:
        for f in r["flags"]:
            counts[f] += 1

    print("# JMdict 锚定审计")
    print()
    print(f"- 审计词条: {len(results)}（{','.join(sorted(levels)) or '全部'}）")
    print(f"- JMdict 匹配: {matched}/{len(results)}")
    print(f"- 命中条目: {len(flagged)}")
    print("- 数据源: jmdict-simplified eng-common (CC-BY-SA);report-only")
    print()
    print("## 严重度汇总")
    print()
    order = ["P0_reading_not_attested", "P1_reading_not_common", "P1_should_be_kana",
             "P1_false_friend_confirm", "P1_pos_mismatch", "P2_missing_sense", "P2_no_jmdict_match"]
    for k in order:
        if counts.get(k):
            print(f"- {k}: {counts[k]}")
    print()

    for tier in ("P0", "P1", "P2"):
        sub = [r for r in flagged if any(f.startswith(tier) for f in r["flags"])]
        if not sub:
            continue
        print(f"## {tier}（{len(sub)}）")
        print()
        print("| id | word | reading | flags | 详情 |")
        print("|---|---|---|---|---|")
        for r in sub[: args.limit]:
            fl = ",".join(f for f in r["flags"] if f.startswith(tier))
            print(f"| {r['id']} | {r['word']} | {r['reading']} | {fl} | {' ; '.join(r['detail'])} |")
        if len(sub) > args.limit:
            print(f"\n... 另有 {len(sub) - args.limit} 条")
        print()


if __name__ == "__main__":
    main()
