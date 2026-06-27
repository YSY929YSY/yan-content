#!/usr/bin/env python3
"""通用词书导入器(N2/N1/...) · 按 jmdict_seq join 全量 JMdict + Tatoeba。

用法: python3 tools/build-wordbank-staging.py --level N2
  读 /tmp/{level}.csv(stephenmk/yomitan-jlpt-vocab),产 staging/{level}-staging.json。
与 build-n3-staging.py 同逻辑,level 参数化。meaning_zh 留空待 LLM 翻译。
"""
from __future__ import annotations
import argparse, csv, json, pickle, re
from pathlib import Path
from typing import Dict, List
import jaconv, pykakasi

DATA = Path("tools/data"); TAT = DATA / "tatoeba"
SENSE_SEP = re.compile(r"[;；/／,，、]")
POS_MAP = {"n":"名词","pn":"代词","adv":"副词","int":"感叹词","conj":"连词","exp":"惯用",
    "pref":"接头","suf":"接尾","ctr":"量词","adj-i":"形容词","adj-na":"形容动词",
    "adj-no":"连体词","prt":"助词","aux":"助动词"}


def hira(s): return re.sub(r"[～\s・ー]", "", jaconv.kata2hira(s or ""))


def sense_applies(sense, word, reading):
    ak = sense.get("appliesToKanji", ["*"]); an = sense.get("appliesToKana", ["*"])
    return (("*" in ak) or (word in ak)) and (("*" in an) or (reading in an) or (word in an))


def applicable_senses(entry, word, reading):
    s = [x for x in entry.get("sense", []) if sense_applies(x, word, reading)]
    return s or entry.get("sense", [])


def jm_pos(entry, word, reading):
    for s in applicable_senses(entry, word, reading):
        for p in s.get("partOfSpeech", []):
            if p.startswith("v"): return "动词（する动词）" if p == "vs" else "动词"
            if p in POS_MAP: return POS_MAP[p]
    return "名词"


def jm_meaning_en(entry, word, reading, max_senses=2):
    out = []
    for s in applicable_senses(entry, word, reading):
        g = "; ".join(x["text"] for x in s.get("gloss", [])[:3])
        if g: out.append(g)
        if len(out) >= max_senses: break
    return " | ".join(out)


def jm_loan_source(entry, word, reading):
    out, seen = [], set()
    for s in applicable_senses(entry, word, reading):
        for ls in s.get("languageSource", []):
            lang, text = ls.get("lang"), ls.get("text")
            if lang and (lang, text) not in seen:
                seen.add((lang, text)); out.append({"lang": lang, "word": text})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--level", required=True, help="如 N2 / N1")
    args = ap.parse_args()
    LEVEL = args.level.upper(); PREFIX = LEVEL.lower()
    csv_path = f"/tmp/{PREFIX}.csv"; out_path = f"staging/{PREFIX}-staging.json"

    jm = {w["id"]: w for w in json.loads((DATA/"jmdict-eng-full.json").read_text(encoding="utf-8"))["words"]}
    index = pickle.load((TAT/"jpn_lemma_index.pkl").open("rb"))
    align = pickle.load((TAT/"jpn_to_cmn.pkl").open("rb"))
    jpn = {}
    for line in (TAT/"jpn_sentences.tsv").open(encoding="utf-8"):
        p = line.rstrip("\n").split("\t")
        if len(p) >= 3:
            try: jpn[int(p[0])] = p[2]
            except ValueError: pass

    kk = pykakasi.kakasi()
    def roma(t): return re.sub(r"\s+"," "," ".join(it["hepburn"] for it in kk.convert(t))).strip().capitalize()
    def mkid(reading, used):
        r = re.sub(r"[^a-z]", "", "".join(it["hepburn"] for it in kk.convert(hira(reading))).lower()) or "x"
        base, c, i = f"{PREFIX}_{r}", f"{PREFIX}_{r}", 2
        while c in used: c = f"{base}_{i}"; i += 1
        used.add(c); return c
    def best_example(word, reading):
        forms = [f.strip().replace("～","") for f in SENSE_SEP.split(word) if f.strip()]
        sids = []
        for f in forms: sids += index.get(f, [])
        cands = [(jpn[s], align[s]) for s in sids if s in align and s in jpn and len(jpn[s]) <= 28]
        cands.sort(key=lambda x: len(x[0]))
        return cands[0] if cands else ("", "")

    used, out, no_jm, no_ex, manual_n = set(), [], 0, 0, 0
    for row in csv.DictReader(open(csv_path)):
        entry = jm.get(row["jmdict_seq"])
        if not entry: no_jm += 1; continue
        word = row["kanji"] or row["kana"]; reading = row["kana"]
        is_uk = any("uk" in s.get("misc", []) for s in entry.get("sense", []))
        needs_manual = any(s.get("appliesToKanji", ["*"]) != ["*"] and word not in s.get("appliesToKanji", ["*"])
                           for s in entry.get("sense", []))
        if needs_manual: manual_n += 1
        ex_jp, ex_zh = best_example(word, reading)
        if not ex_jp: no_ex += 1
        out.append({
            "id": mkid(reading, used), "word": word, "reading": reading,
            "level": LEVEL, "levels": [LEVEL], "pos": jm_pos(entry, word, reading),
            "meaning_zh": "", "meaning_en": jm_meaning_en(entry, word, reading),
            "status": "draft", "tags": {"scene": ["daily"], "type": ["uncategorized"], "memory": []},
            "yanFeatures": [], "coreChunk": "",
            "exampleJp": ex_jp, "exampleRoma": roma(ex_jp) if ex_jp else "", "exampleZh": ex_zh,
            "loanSource": jm_loan_source(entry, word, reading), "conceptCluster": "",
            "_uk": is_uk, "_jmdict_seq": row["jmdict_seq"], "_needs_manual_meaning": needs_manual,
        })

    Path("staging").mkdir(exist_ok=True)
    Path(out_path).write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{LEVEL} 导入: {len(out)} 词 | JMdict未命中跳过 {no_jm} | 有对齐例句 {len(out)-no_ex}/{len(out)} | 需人工定义 {manual_n}")
    print(f"  → {out_path}")


if __name__ == "__main__":
    main()
