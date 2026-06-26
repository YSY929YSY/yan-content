#!/usr/bin/env python3
"""N3 导入器 · 按 jmdict_seq 精确 join 全量 JMdict + Tatoeba,产出权威骨架。

来源:
  /tmp/n3.csv                          stephenmk/yomitan-jlpt-vocab(jmdict_seq,kana,kanji,waller_def)
  tools/data/jmdict-eng-full.json      全量 JMdict(按 id=seq join)
  tools/data/tatoeba/jpn_lemma_index.pkl + jpn_sentences.tsv + jpn_to_cmn.pkl

产出 staging/n3-staging.json,每条:
  word/reading/pos/meaning_en  ← JMdict 权威(按 seq)
  exampleJp/exampleZh          ← Tatoeba 母语对齐(最短带译句),无则留空
  exampleRoma                  ← pykakasi
  meaning_zh                   ← 留空 ""(待 LLM 翻译 meaning_en + 双闸校验)
  status="draft", levels=["N3"]

report-only 性质:只生成 staging,不动 content.v2.json。
"""

from __future__ import annotations

import csv
import json
import pickle
import re
from pathlib import Path
from typing import Dict, List

import jaconv
import pykakasi
from sudachipy import dictionary as sudachi_dict, tokenizer as sudachi_tok

DATA = Path("tools/data")
TAT = DATA / "tatoeba"
SENSE_SEP = re.compile(r"[;；/／,，、]")

POS_MAP = {
    "n": "名词", "pn": "代词", "adv": "副词", "int": "感叹词",
    "conj": "连词", "exp": "惯用", "pref": "接头", "suf": "接尾",
    "ctr": "量词", "adj-i": "形容词", "adj-na": "形容动词", "adj-no": "连体词",
    "prt": "助词", "aux": "助动词",
}


def hira(s: str) -> str:
    return re.sub(r"[～\s・ー]", "", jaconv.kata2hira(s or ""))


def sense_applies(sense: dict, word: str, reading: str) -> bool:
    """合并条目(開ける/空ける/明ける同seq)按写法过滤:只取适用于本词形的义项。"""
    ak = sense.get("appliesToKanji", ["*"])
    an = sense.get("appliesToKana", ["*"])
    kanji_ok = ("*" in ak) or (word in ak)
    kana_ok = ("*" in an) or (reading in an) or (word in an)
    return kanji_ok and kana_ok


def applicable_senses(entry: dict, word: str, reading: str) -> list:
    s = [x for x in entry.get("sense", []) if sense_applies(x, word, reading)]
    return s or entry.get("sense", [])  # 兜底:过滤后为空则退回全部


def jm_pos(entry: dict, word: str, reading: str) -> str:
    for s in applicable_senses(entry, word, reading):
        for p in s.get("partOfSpeech", []):
            if p.startswith("v"):
                return "动词（する动词）" if p == "vs" else "动词"
            if p in POS_MAP:
                return POS_MAP[p]
    return "名词"


def jm_meaning_en(entry: dict, word: str, reading: str, max_senses=2) -> str:
    out = []
    for s in applicable_senses(entry, word, reading):
        g = "; ".join(x["text"] for x in s.get("gloss", [])[:3])
        if g:
            out.append(g)
        if len(out) >= max_senses:
            break
    return " | ".join(out)


def jm_word_reading(entry: dict, csv_kanji: str, csv_kana: str):
    word = csv_kanji or csv_kana
    reading = csv_kana
    # uk(通常假名):若标 uk 且词是汉字,提示(不强制改,汉字锚)
    is_uk = any("uk" in s.get("misc", []) for s in entry.get("sense", []))
    return word, reading, is_uk


def make_id(reading: str, used: set) -> str:
    kk = pykakasi.kakasi()
    roma = "".join(item["hepburn"] for item in kk.convert(hira(reading)))
    roma = re.sub(r"[^a-z]", "", roma.lower()) or "x"
    base = f"n3_{roma}"
    cand, i = base, 2
    while cand in used:
        cand = f"{base}_{i}"
        i += 1
    used.add(cand)
    return cand


def main() -> None:
    jm = {w["id"]: w for w in json.loads((DATA / "jmdict-eng-full.json").read_text(encoding="utf-8"))["words"]}
    with (TAT / "jpn_lemma_index.pkl").open("rb") as f:
        index = pickle.load(f)
    with (TAT / "jpn_to_cmn.pkl").open("rb") as f:
        align = pickle.load(f)
    jpn: Dict[int, str] = {}
    with (TAT / "jpn_sentences.tsv").open(encoding="utf-8") as f:
        for line in f:
            p = line.rstrip("\n").split("\t")
            if len(p) >= 3:
                try:
                    jpn[int(p[0])] = p[2]
                except ValueError:
                    pass

    kk = pykakasi.kakasi()

    def roma(text: str) -> str:
        out = " ".join(it["hepburn"] for it in kk.convert(text))
        return re.sub(r"\s+", " ", out).strip().capitalize()

    def best_example(word: str, reading: str):
        forms = [f.strip().replace("～", "") for f in SENSE_SEP.split(word) if f.strip()]
        sids: List[int] = []
        for f in forms:
            sids += index.get(f, [])
        cands = [(jpn[s], align[s]) for s in sids if s in align and s in jpn and len(jpn[s]) <= 28]
        cands.sort(key=lambda x: len(x[0]))
        return cands[0] if cands else ("", "")

    used: set = set()
    out = []
    no_jm = no_ex = 0
    for row in csv.DictReader(open("/tmp/n3.csv")):
        seq = row["jmdict_seq"]
        entry = jm.get(seq)
        if not entry:
            no_jm += 1
            continue
        word, reading, is_uk = jm_word_reading(entry, row["kanji"], row["kana"])
        # 分流:合并条目(存在限定给"别的写法"的义项)= 自动选义不可靠,标记人工
        needs_manual = any(
            s.get("appliesToKanji", ["*"]) != ["*"] and word not in s.get("appliesToKanji", ["*"])
            for s in entry.get("sense", [])
        )
        ex_jp, ex_zh = best_example(word, reading)
        if not ex_jp:
            no_ex += 1
        out.append({
            "id": make_id(reading, used),
            "word": word,
            "reading": reading,
            "level": "N3",
            "levels": ["N3"],
            "pos": jm_pos(entry, word, reading),
            "meaning_zh": "",
            "meaning_en": jm_meaning_en(entry, word, reading),
            "status": "draft",
            "tags": {"scene": ["daily"], "type": ["uncategorized"], "memory": []},
            "yanFeatures": [],
            "coreChunk": "",
            "exampleJp": ex_jp,
            "exampleRoma": roma(ex_jp) if ex_jp else "",
            "exampleZh": ex_zh,
            "_uk": is_uk,
            "_jmdict_seq": seq,
            "_needs_manual_meaning": needs_manual,
        })

    Path("staging").mkdir(exist_ok=True)
    Path("staging/n3-staging.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"N3 导入: {len(out)} 词")
    print(f"  JMdict 未命中跳过: {no_jm}")
    print(f"  有 Tatoeba 对齐例句: {len(out)-no_ex}/{len(out)}")
    manual = sum(1 for w in out if w["_needs_manual_meaning"])
    print(f"  可自动锚定英义: {len(out)-manual}/{len(out)}")
    print(f"  ⚠ 合并条目需人工定义: {manual}（同seq多词,自动选义不可靠）")
    print(f"  meaning_zh 待填: {len(out)}（下一步 LLM 翻译，合并条目优先人工）")
    print("  → staging/n3-staging.json")


if __name__ == "__main__":
    main()
