#!/usr/bin/env python3
"""Audit staging wordBank example fields without modifying JSON."""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Set

try:
    import jaconv
except ImportError:  # pragma: no cover - dependency is installed in project workflow
    jaconv = None  # type: ignore[assignment]


DEFAULT_INPUT = Path("staging/n4-core-full.json")
JP_RE = re.compile(r"[\u3040-\u30ff\u3400-\u9fff々〆ヵヶ]")
BAD_ROMA_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\bi masu\b",
        r"\bte i masu\b",
        r"\bshite i masu\b",
        r"\bki masu\b",
        r"\bmi masu\b",
        r"\bne masu\b",
        r"\bshira be\b",
    )
]
REQUIRED_FIELDS = [
    "id",
    "word",
    "reading",
    "level",
    "levels",
    "pos",
    "meaning_zh",
    "meaning_en",
    "status",
    "tags",
    "yanFeatures",
    "coreChunk",
    "exampleJp",
    "exampleRoma",
    "exampleZh",
]


@dataclass
class ReviewRow:
    index: int
    entry_id: str
    word: str
    reading: str
    meaning_zh: str
    example_jp: str
    example_roma: str
    example_zh: str
    blockers: List[str]
    warnings: List[str]


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data.get("wordBank"), list):
        raise ValueError("input JSON does not contain a wordBank list")
    return data


def split_variants(text: str) -> List[str]:
    return [part.strip() for part in re.split(r"[;；/／,，、]", text or "") if part.strip()]


def kana_variants(text: str) -> Set[str]:
    forms = set(split_variants(text))
    if jaconv:
        for form in list(forms):
            forms.add(jaconv.kata2hira(form))
            forms.add(jaconv.hira2kata(jaconv.kata2hira(form)))
    return {form for form in forms if form}


def surface_variants(word: str) -> Set[str]:
    forms = set(split_variants(word))
    for form in list(forms):
        forms.add(form.replace("～", ""))
    return {form for form in forms if form}


def conjugation_stems(word: str, reading: str) -> Set[str]:
    forms: Set[str] = set()
    for form in list(surface_variants(word)) + list(kana_variants(reading)):
        if len(form) <= 1:
            continue
        forms.add(form)
        if form.endswith("る"):
            forms.add(form[:-1])
            forms.add(form[:-1] + "り")
        if form.endswith("う"):
            forms.add(form[:-1])
        if form.endswith("く"):
            forms.add(form[:-1])
        if form.endswith("ぐ"):
            forms.add(form[:-1])
        if form.endswith("す"):
            forms.add(form[:-1])
        if form.endswith("つ"):
            forms.add(form[:-1])
        if form.endswith("ぬ"):
            forms.add(form[:-1])
        if form.endswith("ぶ"):
            forms.add(form[:-1])
        if form.endswith("む"):
            forms.add(form[:-1])
        if form.endswith("い"):
            forms.add(form[:-1])
    return {form for form in forms if len(form) > 1}


def target_found(entry: Dict[str, Any]) -> bool:
    example = str(entry.get("exampleJp", ""))
    word = str(entry.get("word", ""))
    reading = str(entry.get("reading", ""))
    if not example:
        return False
    for form in surface_variants(word):
        if form and form in example:
            return True
    for form in kana_variants(reading):
        if form and form in example:
            return True
    for stem in conjugation_stems(word, reading):
        if stem and stem in example:
            return True
    return False


def looks_like_gloss(entry: Dict[str, Any]) -> bool:
    example_zh = str(entry.get("exampleZh", "")).strip()
    meaning_zh = str(entry.get("meaning_zh", ""))
    if not example_zh:
        return False
    compact = re.sub(r"[。！？!?，,、\s]", "", example_zh)
    meanings = {re.sub(r"[。！？!?，,、\s]", "", item) for item in split_variants(meaning_zh)}
    if compact in meanings:
        return True
    return len(compact) <= 2 and compact in meaning_zh


def audit_entry(index: int, entry: Dict[str, Any]) -> ReviewRow:
    blockers: List[str] = []
    warnings: List[str] = []
    missing_schema = [field for field in REQUIRED_FIELDS if field not in entry]
    if missing_schema:
        blockers.append("missing_schema_fields:" + ",".join(missing_schema))

    example_jp = str(entry.get("exampleJp", ""))
    example_roma = str(entry.get("exampleRoma", ""))
    example_zh = str(entry.get("exampleZh", ""))

    if bool(example_jp) != bool(example_roma) or bool(example_jp) != bool(example_zh):
        blockers.append("partial_example_fields")

    if example_roma and JP_RE.search(example_roma):
        blockers.append("exampleRoma_has_japanese")

    if example_roma and any(pattern.search(example_roma) for pattern in BAD_ROMA_PATTERNS):
        blockers.append("exampleRoma_bad_spacing")

    if example_jp and not target_found(entry):
        blockers.append("target_word_not_found")

    if example_zh and looks_like_gloss(entry):
        blockers.append("exampleZh_looks_like_gloss")

    if example_jp and len(example_jp) > 38:
        warnings.append("exampleJp_long")
    if example_zh and len(example_zh) > 28:
        warnings.append("exampleZh_long")
    if example_zh and len(re.sub(r"[。！？!?，,、\s]", "", example_zh)) <= 3:
        warnings.append("exampleZh_short")

    return ReviewRow(
        index=index,
        entry_id=str(entry.get("id", "")),
        word=str(entry.get("word", "")),
        reading=str(entry.get("reading", "")),
        meaning_zh=str(entry.get("meaning_zh", "")),
        example_jp=example_jp,
        example_roma=example_roma,
        example_zh=example_zh,
        blockers=blockers,
        warnings=warnings,
    )


def audit_wordbank(wordbank: Sequence[Dict[str, Any]]) -> List[ReviewRow]:
    return [audit_entry(index, entry) for index, entry in enumerate(wordbank, start=1)]


def print_report(rows: List[ReviewRow], total_entries: int) -> None:
    filled = [row for row in rows if row.example_jp or row.example_roma or row.example_zh]
    blockers = [row for row in rows if row.blockers]
    warnings = [row for row in rows if row.warnings]
    jp_count = sum(1 for row in rows if row.example_jp)
    roma_count = sum(1 for row in rows if row.example_roma)
    zh_count = sum(1 for row in rows if row.example_zh)

    print("# Staging WordBank Example Audit")
    print()
    print(f"- total entries: {total_entries}")
    print(f"- filled examples count: {len(filled)}")
    print(f"- exampleJp non-empty: {jp_count}")
    print(f"- exampleRoma non-empty: {roma_count}")
    print(f"- exampleZh non-empty: {zh_count}")
    print(f"- blocker count: {len(blockers)}")
    print(f"- warning count: {len(warnings)}")
    print("- mode: report-only, JSON not modified")
    print()

    issue_counts: Dict[str, int] = {}
    for row in rows:
        for issue in row.blockers + row.warnings:
            issue_counts[issue] = issue_counts.get(issue, 0) + 1

    print("## Issue Counts")
    print()
    if issue_counts:
        for issue, count in sorted(issue_counts.items(), key=lambda item: (-item[1], item[0])):
            print(f"- {issue}: {count}")
    else:
        print("- none")
    print()

    print("## Manual Review List")
    print()
    print("| # | id | word | reading | blockers | warnings | exampleJp | exampleRoma | exampleZh |")
    print("|---:|---|---|---|---|---|---|---|---|")
    for row in [row for row in rows if row.blockers or row.warnings]:
        print(
            f"| {row.index} | {row.entry_id} | {row.word} | {row.reading} | "
            f"{', '.join(row.blockers) or '-'} | {', '.join(row.warnings) or '-'} | "
            f"{row.example_jp} | {row.example_roma} | {row.example_zh} |"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit staging wordBank examples.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    args = parser.parse_args()

    data = load_json(args.input)
    wordbank = data["wordBank"]
    rows = audit_wordbank(wordbank)
    print_report(rows, len(wordbank))


if __name__ == "__main__":
    main()
