#!/usr/bin/env python3
"""Tatoeba 日中对齐 · 给母语日语句配中文译句,产出 exampleZh 锚定候选。

数据源(Tatoeba CC-BY):
  tools/data/tatoeba/jpn_sentences.tsv   母语日语句
  tools/data/tatoeba/cmn_sentences.tsv   中文句
  tools/data/tatoeba/links.csv           翻译链接(日id <tab> 译id,双向,2821万行)
  tools/data/tatoeba/jpn_lemma_index.pkl 词典原形→[日id](tatoeba-examples.py 生成)

流程:
  1. 流式扫 links.csv,留下「日id↔中id」的对,缓存 jpn_id→中文句(取最短译)
  2. 复用原形索引,对每个 wordBank 词产出「母语日句 + 中文译」对照候选
  3. 报告对齐覆盖率,导出场景/假朋友词的候选 JSONL(供人/AI 挑选,绝不自动写回)

report-only,不改 content。候选是「池」,选用由人/后续锚定流程决定。
"""

from __future__ import annotations

import argparse
import json
import pickle
import re
from pathlib import Path
from typing import Dict, List

import jaconv

DATA = Path("tools/data/tatoeba")
SENSE_SEP = re.compile(r"[;；/／,，、]")

# 繁→简:Tatoeba 中文句繁简混杂,面向大陆简体用户统一为简体。无 opencc 则降级不转。
try:
    import opencc
    _T2S = opencc.OpenCC("t2s")
    def to_simplified(s: str) -> str:
        return _T2S.convert(s)
except Exception:
    def to_simplified(s: str) -> str:
        return s


def hira(s: str) -> str:
    return re.sub(r"[～\s・ー]", "", jaconv.kata2hira(s or ""))


def load_ids_text(path: Path) -> Dict[int, str]:
    out: Dict[int, str] = {}
    with path.open(encoding="utf-8") as f:
        for line in f:
            p = line.rstrip("\n").split("\t")
            if len(p) >= 3:
                try:
                    out[int(p[0])] = p[2]
                except ValueError:
                    pass
    return out


def build_alignment(jpn: Dict[int, str], cmn: Dict[int, str], cache: Path) -> Dict[int, str]:
    """jpn_id → 最短中文译句。缓存 pickle。"""
    if cache.exists():
        with cache.open("rb") as f:
            return pickle.load(f)
    jpn_ids = set(jpn)
    cmn_ids = set(cmn)
    best: Dict[int, str] = {}
    n = 0
    with (DATA / "links.csv").open(encoding="utf-8") as f:
        for line in f:
            n += 1
            if n % 5_000_000 == 0:
                print(f"  扫 links {n//1_000_000}M 行,已对齐 {len(best)} ...", flush=True)
            a, _, b = line.rstrip("\n").partition("\t")
            if not b:
                continue
            try:
                a_i, b_i = int(a), int(b)
            except ValueError:
                continue
            # 方向 a=日 b=中
            if a_i in jpn_ids and b_i in cmn_ids:
                zh = to_simplified(cmn[b_i])
                if a_i not in best or len(zh) < len(best[a_i]):
                    best[a_i] = zh
    with cache.open("wb") as f:
        pickle.dump(best, f)
    print(f"  对齐完成:{len(best)} 个日句有中文译,缓存 {cache}")
    return best


def word_pairs(word: str, reading: str, index, jpn, align, max_n=4, max_len=30):
    forms = [f.strip().replace("～", "") for f in SENSE_SEP.split(word) if f.strip()]
    sids: List[int] = []
    for f in forms:
        sids += index.get(f, [])
    if not sids and reading:
        for r in [x.strip() for x in SENSE_SEP.split(reading) if x.strip()]:
            sids += index.get(r, [])
    seen = set()
    pairs = []
    for sid in sids:
        if sid in align and sid not in seen:
            seen.add(sid)
            jp = jpn[sid]
            if len(jp) <= max_len:
                pairs.append((jp, align[sid]))
    pairs.sort(key=lambda x: len(x[0]))
    return pairs[:max_n]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, default=Path("yan-content/content.v2.json"))
    ap.add_argument("--levels", default="N5,N4")
    ap.add_argument("--export", type=Path, default=None,
                    help="导出每词对齐候选到 JSONL")
    ap.add_argument("--sample", type=int, default=15, help="报告里展示几个词的候选")
    args = ap.parse_args()

    jpn = load_ids_text(DATA / "jpn_sentences.tsv")
    cmn = load_ids_text(DATA / "cmn_sentences.tsv")
    print(f"日句 {len(jpn)} / 中句 {len(cmn)}")
    align = build_alignment(jpn, cmn, DATA / "jpn_to_cmn.pkl")
    with (DATA / "jpn_lemma_index.pkl").open("rb") as f:
        index = pickle.load(f)

    wb = json.loads(args.input.read_text(encoding="utf-8"))["wordBank"]
    levels = {x.strip() for x in args.levels.split(",") if x.strip()}
    if levels:
        wb = [w for w in wb if str(w.get("level", "")) in levels]

    have = 0
    rows = []
    for w in wb:
        pairs = word_pairs(str(w.get("word", "")), str(w.get("reading", "")), index, jpn, align)
        if pairs:
            have += 1
        rows.append((w, pairs))

    print()
    print("# Tatoeba 日中对齐候选")
    print()
    print(f"- 审计词条: {len(wb)}（{','.join(sorted(levels))}）")
    print(f"- 有≥1 条带中文译的母语例句: {have}/{len(wb)}")
    print(f"- 对齐日句总量: {len(align)}")
    print("- 数据源: Tatoeba CC-BY;report-only,候选池不自动写回")
    print()
    print(f"## 候选示例(前 {args.sample} 词)")
    print()
    for w, pairs in rows[: args.sample]:
        print(f"### {w.get('word')}（{w.get('reading')}）— 现例句:{w.get('exampleJp','')} / {w.get('exampleZh','')}")
        for jp, zh in pairs:
            print(f"- {jp}　→　{zh}")
        if not pairs:
            print("- (无带译母语句)")
        print()

    if args.export:
        with args.export.open("w", encoding="utf-8") as f:
            for w, pairs in rows:
                f.write(json.dumps({
                    "id": w.get("id"), "word": w.get("word"), "reading": w.get("reading"),
                    "current_jp": w.get("exampleJp", ""), "current_zh": w.get("exampleZh", ""),
                    "candidates": [{"jp": jp, "zh": zh} for jp, zh in pairs],
                }, ensure_ascii=False) + "\n")
        print(f"已导出候选 → {args.export}")


if __name__ == "__main__":
    main()
