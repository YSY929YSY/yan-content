#!/usr/bin/env python3
"""Audit N5 wordBank examples without modifying content JSON."""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Set, Tuple

import jaconv
from sudachipy import dictionary, tokenizer


DEFAULT_INPUT = Path("yan-content/content.v2.json")

# IDs confirmed as false positives for target_word_not_found_by_sudachi.
# Reasons: Sudachi splits honorific suffixes (おじさん→おじ+さん),
# alternate okurigana (曲る vs 曲がる), compound suru-verb split,
# optional particle と omitted in example, or conjugation stem match.
SUDACHI_FP_WHITELIST: Set[str] = {
    "n5_ojisan",    # おじさん split as おじ+さん by Sudachi
    "n5_obasan",    # おばさん split as おば+さん by Sudachi
    "n5_owaru",     # 終る / 終わる alternate okurigana
    "n5_kopiisuru", # コピーする split as コピー+する by Sudachi
    "n5_magaru",    # 曲る / 曲がる alternate okurigana
    "n5_yukkurito", # ゆっくりと — example uses ゆっくり (と is optional)
}
JP_RE = re.compile(r"[\u3040-\u30ff\u3400-\u9fff々]")


@dataclass
class AuditRow:
    index: int
    entry_id: str
    word: str
    reading: str
    example_jp: str
    example_zh: str
    example_roma: str
    issues: List[str]
    sudachi: str


def load_wordbank(path: Path) -> List[Dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    wordbank = data.get("wordBank")
    if not isinstance(wordbank, list):
        raise ValueError("content file does not contain a wordBank list")
    return wordbank


def split_variants(text: str) -> List[str]:
    return [part.strip() for part in re.split(r"[;；/／,，、]", text or "") if part.strip()]


def kana_forms(text: str) -> Set[str]:
    forms: Set[str] = set()
    for part in split_variants(text):
        forms.add(part)
        forms.add(jaconv.kata2hira(part))
        forms.add(jaconv.hira2kata(part))
    return {f for f in forms if f}


def surface_forms(word: str) -> Set[str]:
    forms = set(split_variants(word))
    for form in list(forms):
        forms.add(form.replace("～", ""))
    return {f for f in forms if f}


def token_summary(morphemes: Sequence[Any]) -> str:
    cells = []
    for m in morphemes:
        reading = jaconv.kata2hira(m.reading_form())
        cells.append(f"{m.surface()}:{m.dictionary_form()}:{reading}")
    return " / ".join(cells)


def sudachi_contains_target(
    example_jp: str,
    word: str,
    reading: str,
    sudachi_tokenizer: Any,
) -> Tuple[bool, str]:
    surfaces = surface_forms(word)
    readings = kana_forms(reading)
    morphemes = list(sudachi_tokenizer.tokenize(example_jp, tokenizer.Tokenizer.SplitMode.C))
    summary = token_summary(morphemes)

    for form in surfaces:
        if form and form in example_jp:
            return True, summary

    for m in morphemes:
        token_forms = {
            m.surface(),
            m.dictionary_form(),
            jaconv.kata2hira(m.reading_form()),
            jaconv.hira2kata(jaconv.kata2hira(m.reading_form())),
        }
        if surfaces.intersection(token_forms) or readings.intersection(token_forms):
            return True, summary

    return False, summary


def audit_entry(
    index: int,
    entry: Dict[str, Any],
    sudachi_tokenizer: Any,
) -> AuditRow:
    entry_id = str(entry.get("id", ""))
    word = str(entry.get("word", ""))
    reading = str(entry.get("reading", ""))
    example_jp = str(entry.get("exampleJp", ""))
    example_zh = str(entry.get("exampleZh", ""))
    example_roma = str(entry.get("exampleRoma", ""))
    status = str(entry.get("status", ""))
    issues: List[str] = []

    # 草稿状态(N3-N1 批量导入)缺例句不算 Blocker:词+释义已可用,例句后续补。
    # 只对"已定稿"(非草稿)的词强制要求例句(N5/N4 精修词)。
    DRAFT_STATUSES = {"draft", "zh_drafted", "candidate"}
    if status not in DRAFT_STATUSES:
        for field, value in (
            ("exampleJp", example_jp),
            ("exampleZh", example_zh),
            ("exampleRoma", example_roma),
        ):
            if not value:
                issues.append(f"missing_{field}")

    if JP_RE.search(example_roma):
        issues.append("exampleRoma_has_japanese")

    contains, summary = sudachi_contains_target(example_jp, word, reading, sudachi_tokenizer)
    if example_jp and word and not contains and entry_id not in SUDACHI_FP_WHITELIST:
        issues.append("target_word_not_found_by_sudachi")

    if len(example_jp) > 35:
        issues.append("exampleJp_long")

    if example_zh and len(example_zh) <= 3 and len(example_jp) > 6:
        issues.append("exampleZh_maybe_gloss")

    return AuditRow(
        index=index,
        entry_id=entry_id,
        word=word,
        reading=reading,
        example_jp=example_jp,
        example_zh=example_zh,
        example_roma=example_roma,
        issues=issues,
        sudachi=summary,
    )


def audit_wordbank(wordbank: Iterable[Dict[str, Any]]) -> List[AuditRow]:
    sudachi_tokenizer = dictionary.Dictionary().create()
    return [
        audit_entry(index, entry, sudachi_tokenizer)
        for index, entry in enumerate(wordbank, start=1)
    ]


def print_markdown(rows: List[AuditRow], expected_count: int, limit: int) -> None:
    review_rows = [row for row in rows if row.issues]
    print("# wordBank Example Audit")
    print()
    print(f"- total entries: {len(rows)}")
    print(f"- expected entries: {expected_count}")
    print(f"- count check: {'PASS' if len(rows) == expected_count else 'FAIL'}")
    print(f"- entries needing manual review: {len(review_rows)}")
    print("- mode: report-only, JSON not modified")
    print()

    issue_counts: Dict[str, int] = {}
    for row in review_rows:
        for issue in row.issues:
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
    print("| # | id | word | reading | issues | exampleJp | exampleZh | exampleRoma | Sudachi tokens |")
    print("|---:|---|---|---|---|---|---|---|---|")
    for row in review_rows[:limit]:
        print(
            f"| {row.index} | {row.entry_id} | {row.word} | {row.reading} | "
            f"{', '.join(row.issues)} | {row.example_jp} | {row.example_zh} | "
            f"{row.example_roma} | {row.sudachi} |"
        )
    if len(review_rows) > limit:
        print()
        print(f"... {len(review_rows) - limit} more rows omitted. Use --limit to show more.")


def load_baseline_ids(baseline_path: Path) -> Set[str]:
    """Load word IDs from a baseline file for incremental diff."""
    try:
        with baseline_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return {str(w.get("id", "")) for w in data.get("wordBank", [])}
    except Exception:
        return set()


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit wordBank example fields.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--expected-count", type=int, default=8298)
    parser.add_argument("--limit", type=int, default=120)
    parser.add_argument("--diff-only", type=Path, default=None,
                        help="Only audit entries not present in this baseline file (incremental mode)")
    args = parser.parse_args()

    wordbank = load_wordbank(args.input)

    if args.diff_only:
        baseline_ids = load_baseline_ids(args.diff_only)
        wordbank = [w for w in wordbank if str(w.get("id", "")) not in baseline_ids]
        print(f"# Incremental Audit (vs {args.diff_only})")
        print(f"- new/changed entries: {len(wordbank)}")
        print()

    rows = audit_wordbank(wordbank)
    if not args.diff_only:
        print_markdown(rows, args.expected_count, args.limit)
    else:
        print_markdown(rows, len(wordbank), args.limit)


if __name__ == "__main__":
    main()
