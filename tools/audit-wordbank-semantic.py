#!/usr/bin/env python3
"""语义存疑标记层 · 高精度、报告-only、不修改内容 JSON。

与 audit-wordbank-examples.py(结构审计)互补:
- 结构审计查:字段缺失、目标词在不在例句、romaji 混日文、长度。
- 本脚本查:致命语义嫌疑(读音对不上、词块不含本词、负面联想中文),
  以及待加工信号(多义未铺地图、跨级重复)。

设计铁律:宁可漏报,不要假阳性。每条 flag 必须是"看一眼大概率真有问题"。
按严重度分三档:
  P0_catastrophic — 读音/对应级,错了就是教错,必须人审
  P1_review       — 较可能有问题,值得人审
  P2_enrichment   — 不是错,是言库加工信号(多义铺地图、跨级去重)
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Set

import jaconv
from sudachipy import dictionary, tokenizer

DEFAULT_INPUT = Path("yan-content/content.v2.json")
JP_RE = re.compile(r"[぀-ヿ㐀-鿿々]")
SENSE_SEP_RE = re.compile(r"[;；/／,，、]")

# 母语者负面联想 / 不地道措辞表(来自 SOUL.md「算账 vs 结账」精神)。
# 命中不代表一定错,但值得复核中文语感。可持续扩充。
ZH_SENSITIVE = {
    "算账": "带火药味(找你算账),收尾场景用「结账」",
    "搞": "口语过随便,正式释义慎用",
    "弄": "含混,优先具体动词",
    "玩意": "贬义口语",
    "家伙": "口语/略贬",
}

# 读音对比的已知豁免:Sudachi 拆分习惯导致的合理差异,不是错。
READING_FP_WHITELIST: Set[str] = set()


@dataclass
class Row:
    entry_id: str
    word: str
    reading: str
    level: str
    flags: List[str] = field(default_factory=list)
    detail: Dict[str, str] = field(default_factory=dict)


def norm_kana(s: str) -> str:
    """转平假名并去掉长音/分隔符,用于读音宽松比对。"""
    s = jaconv.kata2hira(s or "")
    return re.sub(r"[、。\s〜～ー・]", "", s)


def sudachi_reading(word: str, tk: Any) -> str:
    morphs = list(tk.tokenize(word, tokenizer.Tokenizer.SplitMode.C))
    return "".join(jaconv.kata2hira(m.reading_form()) for m in morphs)


def first_sense(meaning: str) -> str:
    parts = [p.strip() for p in SENSE_SEP_RE.split(meaning or "") if p.strip()]
    return parts[0] if parts else ""


def sense_count(meaning: str) -> int:
    # 去掉括号注释再数义项,避免「啊(恍然/应答)」被误判成多义。
    bare = re.sub(r"[（(].*?[)）]", "", meaning or "")
    return len([p for p in SENSE_SEP_RE.split(bare) if p.strip()])


def audit(entry: Dict[str, Any], tk: Any) -> Row:
    eid = str(entry.get("id", ""))
    word = str(entry.get("word", ""))
    reading = str(entry.get("reading", ""))
    level = str(entry.get("level", ""))
    meaning = str(entry.get("meaning_zh", ""))
    example_jp = str(entry.get("exampleJp", ""))
    example_zh = str(entry.get("exampleZh", ""))
    chunk = str(entry.get("coreChunk", ""))

    row = Row(eid, word, reading, level)

    # ── P0:读音对不上(致命,Sudachi 词典读音 vs 存储 reading) ──
    # 只对纯假名/含汉字的单词条比对;多写法(含分隔符)跳过避免噪声。
    if word and reading and not SENSE_SEP_RE.search(word) and eid not in READING_FP_WHITELIST:
        sud = sudachi_reading(word, tk)
        if sud and norm_kana(sud) != norm_kana(reading):
            # 进一步排除:reading 是 sud 的子串或反之(送假名/长音差异)
            a, b = norm_kana(sud), norm_kana(reading)
            if a not in b and b not in a:
                # 降级为 P1:多数是「同字多读音」,存储读音常常是对的,
                # 但少数是「同字不同词」(辛い からい/つらい)——需确认词卡教哪个。
                row.flags.append("P1_reading_ambiguous")
                row.detail["reading"] = f"存:{reading} / Sudachi 默认:{sud}(确认教的是哪个)"

    # ── P1:coreChunk 不含本词(拆多写法,任一形式命中即通过) ──
    if chunk and word:
        word_forms = set()
        for w in SENSE_SEP_RE.split(word):
            w = w.strip().replace("～", "")
            if w:
                word_forms.add(w)
                word_forms.add(norm_kana(w))
        for r in SENSE_SEP_RE.split(reading):
            r = re.sub(r"[（(].*?[)）～]", "", r).strip()
            if r:
                word_forms.add(norm_kana(r))
        if not any(f and (f in chunk or f in norm_kana(chunk)) for f in word_forms):
            row.flags.append("P1_chunk_missing_word")
            row.detail["chunk"] = f"词块「{chunk}」不含「{word}」"

    # ── P1:中文负面联想 / 不地道 ──
    hit = [w for w in ZH_SENSITIVE if w in meaning]
    if hit:
        row.flags.append("P1_zh_association")
        row.detail["zh"] = "; ".join(f"{w}→{ZH_SENSITIVE[w]}" for w in hit)

    # NOTE: example_echoes_gloss 检查已移除——验证证明它对半个词库假阳性:
    # 一个好例句天然会包含释义词(讲狗的句子当然有「狗」)。字符串无法判断
    # 「例句是否只是释义的回放」,这需要语义判断,留给词典锚定阶段。

    # ── P2:多义未铺地图(≥3 义项,言库加工信号,非错误) ──
    sc = sense_count(meaning)
    if sc >= 3:
        row.flags.append("P2_multisense")
        row.detail["multisense"] = f"{sc} 个义项,例句只演示其一?需义项地图"

    return row


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    ap.add_argument("--levels", default="", help="逗号分隔,如 N5,N4;空=全部")
    ap.add_argument("--limit", type=int, default=80)
    args = ap.parse_args()

    with args.input.open(encoding="utf-8") as f:
        wb = json.load(f)["wordBank"]

    levels = {x.strip() for x in args.levels.split(",") if x.strip()}
    if levels:
        wb = [w for w in wb if str(w.get("level", "")) in levels]

    tk = dictionary.Dictionary().create()
    rows = [audit(e, tk) for e in wb]

    # 跨级重复(同词出现在多个 level)
    by_word: Dict[str, List[str]] = defaultdict(list)
    for w in wb:
        by_word[str(w.get("word", ""))].append(str(w.get("level", "")))
    dup_words = {w for w, lv in by_word.items() if len(set(lv)) > 1}

    flagged = [r for r in rows if r.flags]
    counts: Dict[str, int] = defaultdict(int)
    for r in flagged:
        for fl in r.flags:
            counts[fl] += 1

    print("# wordBank 语义存疑标记")
    print()
    print(f"- 审计词条: {len(rows)}")
    print(f"- 命中条目: {len(flagged)}")
    print(f"- 跨级重复词(P2_dedup): {len(dup_words)}")
    print("- 模式: report-only,未修改 JSON")
    print()
    print("## 严重度汇总")
    print()
    p0 = sum(v for k, v in counts.items() if k.startswith("P0"))
    p1 = sum(v for k, v in counts.items() if k.startswith("P1"))
    p2 = sum(v for k, v in counts.items() if k.startswith("P2"))
    print(f"- **P0 致命(必审)**: {p0}")
    print(f"- **P1 复核**: {p1}")
    print(f"- P2 加工信号(非错误): {p2} + 跨级重复 {len(dup_words)}")
    print()
    for k in sorted(counts, key=lambda x: (-counts[x], x)):
        print(f"  - {k}: {counts[k]}")
    print()

    for tier, name in (("P0", "P0 致命 · 必须人审"), ("P1", "P1 · 值得复核")):
        sub = [r for r in flagged if any(f.startswith(tier) for f in r.flags)]
        print(f"## {name}（{len(sub)}）")
        print()
        if not sub:
            print("- 无")
            print()
            continue
        print("| id | word | reading | level | flags | 详情 |")
        print("|---|---|---|---|---|---|")
        for r in sub[: args.limit]:
            fl = ", ".join(f for f in r.flags if f.startswith(tier))
            dt = " ; ".join(r.detail.get(k, "") for k in r.detail) or ""
            print(f"| {r.entry_id} | {r.word} | {r.reading} | {r.level} | {fl} | {dt} |")
        if len(sub) > args.limit:
            print(f"\n... 另有 {len(sub) - args.limit} 条,用 --limit 展开")
        print()


if __name__ == "__main__":
    main()
