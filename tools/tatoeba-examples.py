#!/usr/bin/env python3
"""Tatoeba 母语例句索引 + wordBank 例句地道度审计。

数据源:Tatoeba(CC-BY 2.0 FR)per-language 导出。
  tools/data/tatoeba/jpn_sentences.tsv  母语日语句(id, lang, text)
  tools/data/tatoeba/cmn_sentences.tsv  中文句
  tools/data/tatoeba/links.csv          翻译链接(可选,用于日中对齐;后台下载)

用途:
  1. 给每个 wordBank 词查到「母语者真实用它的短句」候选(替换/对照用,绝不自动改)
  2. 审计:哪些词在 24.8 万母语句里几乎找不到自然用例 → 例句可能是 AI 硬造的
  3. links 就绪后,给候选句附中文译句(日中对齐)

设计:用 Sudachi 按「词典原形」给母语句建索引(一次性,缓存 pickle),之后秒查。
report-only,不改 content。
"""

from __future__ import annotations

import argparse
import json
import pickle
import re
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Set

import jaconv
from sudachipy import dictionary, tokenizer

DATA = Path("tools/data/tatoeba")
SENSE_SEP = re.compile(r"[;；/／,，、]")


def hira(s: str) -> str:
    return re.sub(r"[～\s・ー]", "", jaconv.kata2hira(s or ""))


def load_sentences(path: Path) -> Dict[int, str]:
    out: Dict[int, str] = {}
    with path.open(encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 3:
                try:
                    out[int(parts[0])] = parts[2]
                except ValueError:
                    pass
    return out


def build_index(jpn: Dict[int, str], cache: Path):
    """词典原形 → [sentence_id]。缓存到 pickle。"""
    if cache.exists():
        with cache.open("rb") as f:
            return pickle.load(f)
    tk = dictionary.Dictionary().create()
    index: Dict[str, List[int]] = defaultdict(list)
    for i, (sid, text) in enumerate(jpn.items()):
        if i % 20000 == 0:
            print(f"  建索引 {i}/{len(jpn)} ...", flush=True)
        seen: Set[str] = set()
        for m in tk.tokenize(text, tokenizer.Tokenizer.SplitMode.C):
            lemma = m.dictionary_form()
            if lemma and lemma not in seen:
                seen.add(lemma)
                index[lemma].append(sid)
    index = dict(index)
    with cache.open("wb") as f:
        pickle.dump(index, f)
    print(f"  索引完成:{len(index)} 个原形,缓存 {cache}")
    return index


def candidates(word: str, reading: str, index, jpn, max_n=3, max_len=28) -> List[str]:
    forms = [f.strip().replace("～", "") for f in SENSE_SEP.split(word) if f.strip()]
    sids: List[int] = []
    for f in forms:
        sids += index.get(f, [])
    # 也试读音原形(纯假名词)
    if not sids and reading:
        for f in [x.strip() for x in SENSE_SEP.split(reading) if x.strip()]:
            sids += index.get(f, [])
    sents = sorted({jpn[s] for s in sids if s in jpn}, key=len)
    short = [s for s in sents if len(s) <= max_len]
    return (short or sents)[:max_n]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, default=Path("yan-content/content.v2.json"))
    ap.add_argument("--levels", default="N5,N4")
    ap.add_argument("--limit", type=int, default=120)
    ap.add_argument("--show-candidates", action="store_true",
                    help="为缺自然用例的词列出母语候选句")
    args = ap.parse_args()

    jpn = load_sentences(DATA / "jpn_sentences.tsv")
    print(f"母语日语句: {len(jpn)}")
    index = build_index(jpn, DATA / "jpn_lemma_index.pkl")

    wb = json.loads(args.input.read_text(encoding="utf-8"))["wordBank"]
    levels = {x.strip() for x in args.levels.split(",") if x.strip()}
    if levels:
        wb = [w for w in wb if str(w.get("level", "")) in levels]

    # 第一轮:词典原形索引
    lemma_zero: List[dict] = []
    thin: List[dict] = []
    covered = 0
    for w in wb:
        word = str(w.get("word", ""))
        reading = str(w.get("reading", ""))
        forms = [f.strip().replace("～", "") for f in SENSE_SEP.split(word) if f.strip()]
        rforms = [x.strip() for x in SENSE_SEP.split(reading) if x.strip()]
        n = sum(len(index.get(f, [])) for f in forms) or sum(len(index.get(f, [])) for f in rforms)
        if n == 0:
            lemma_zero.append(w)
        elif n < 3:
            thin.append(w)
        else:
            covered += 1

    # 第二轮:对原形 0 命中的词做表层子串兜底(治 お前缀/切碎表达/计数器粒度)
    def surface_forms(w: dict) -> List[str]:
        out = []
        for f in SENSE_SEP.split(str(w.get("word", ""))) :
            f = f.strip().replace("～", "")
            if f:
                out.append(f)
        for r in SENSE_SEP.split(str(w.get("reading", ""))):
            r = r.strip().replace("～", "")
            if r and r not in out:
                out.append(r)
        return out

    zero_targets = {w.get("id"): surface_forms(w) for w in lemma_zero}
    surf_count: Dict[str, int] = defaultdict(int)
    if zero_targets:
        for text in jpn.values():
            for wid, forms in zero_targets.items():
                if surf_count[wid] < 3 and any(f in text for f in forms):
                    surf_count[wid] += 1

    no_native: List[dict] = []
    for w in lemma_zero:
        c = surf_count.get(w.get("id"), 0)
        if c == 0:
            no_native.append(w)
        elif c < 3:
            thin.append(w)
        else:
            covered += 1

    print()
    print("# Tatoeba 母语例句覆盖审计")
    print()
    print(f"- 审计词条: {len(wb)}（{','.join(sorted(levels))}）")
    print(f"- 有充足母语用例(≥3句): {covered}")
    print(f"- 用例稀少(1-2句): {len(thin)}")
    print(f"- **母语语料里找不到(0句): {len(no_native)}** ← 例句可能 AI 硬造,优先核")
    print("- 数据源: Tatoeba CC-BY;report-only")
    print()
    print("## 0 母语用例(优先核例句自然度)")
    print()
    print("| id | word | reading | 现例句 |")
    print("|---|---|---|---|")
    for w in no_native[: args.limit]:
        print(f"| {w.get('id')} | {w.get('word')} | {w.get('reading')} | {w.get('exampleJp','')} |")
    if len(no_native) > args.limit:
        print(f"\n... 另有 {len(no_native)-args.limit} 条")

    if args.show_candidates:
        print()
        print("## 稀少用例词 + 母语候选句(供对照,勿自动替换)")
        print()
        for w in thin[: args.limit]:
            cands = candidates(str(w.get("word", "")), str(w.get("reading", "")), index, jpn)
            print(f"- **{w.get('word')}**（{w.get('reading')}）现:{w.get('exampleJp','')}")
            for c in cands:
                print(f"    候选: {c}")


if __name__ == "__main__":
    main()
