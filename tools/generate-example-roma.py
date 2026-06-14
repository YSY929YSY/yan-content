#!/usr/bin/env python3
"""Generate candidate romanization for wordBank examples.

This script is intentionally report-only. It reads yan-content/content.v2.json
and prints a Markdown audit of generated exampleRoma candidates versus the
current stored values.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List

import jaconv
import pykakasi
from sudachipy import dictionary, tokenizer


DEFAULT_INPUT = Path("yan-content/content.v2.json")
JP_RE = re.compile(r"[\u3040-\u30ff\u3400-\u9fff々]")


def load_wordbank(path: Path) -> List[Dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    wordbank = data.get("wordBank")
    if not isinstance(wordbank, list):
        raise ValueError("content file does not contain a wordBank list")
    return wordbank


def build_kakasi() -> Any:
    kakasi = pykakasi.kakasi()
    return kakasi


def build_sudachi_tokenizer() -> Any:
    return dictionary.Dictionary().create()


def title_case_roma(text: str) -> str:
    if not text:
        return text
    return text[0].upper() + text[1:]


def normalize_punctuation(text: str) -> str:
    replacements = {
        "。": ".",
        "、": ",",
        "？": "?",
        "！": "!",
        "・": " ",
        "「": '"',
        "」": '"',
        "『": '"',
        "』": '"',
        "（": "(",
        "）": ")",
        "　": " ",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return text


def romanize_token(surface: str, reading: str, converter: Any) -> str:
    if surface == "は":
        return "wa"
    if surface == "へ":
        return "e"
    if surface == "を":
        return "o"
    if reading == "*":
        reading = surface
    kana = jaconv.kata2hira(reading)
    return " ".join(part.get("hepburn", "") for part in converter.convert(kana)).strip()


def merge_small_tsu(parts: List[tuple[str, bool]]) -> List[str]:
    merged: List[str] = []
    previous_had_small_tsu = False
    for part, had_small_tsu in parts:
        if (
            merged
            and previous_had_small_tsu
            and re.fullmatch(r"[A-Za-z]+", part)
            and part.lower()[0] in {"t", "k", "s", "p"}
        ):
            base = re.sub(r"tsu$", "", merged[-1], flags=re.IGNORECASE)
            merged[-1] = base + part[0].lower() + part
        else:
            merged.append(part)
        previous_had_small_tsu = had_small_tsu
    return merged


def tokenized_hepburn(text: str, converter: Any, sudachi_tokenizer: Any) -> str:
    parts: List[tuple[str, bool]] = []
    for morpheme in sudachi_tokenizer.tokenize(text, tokenizer.Tokenizer.SplitMode.C):
        surface = morpheme.surface()
        if re.fullmatch(r"[。、？！・「」『』（）、\s]+", surface):
            parts.append((normalize_punctuation(surface), False))
            continue
        reading = morpheme.reading_form()
        parts.append((romanize_token(surface, reading, converter), reading.endswith(("ッ", "っ"))))
    text = " ".join(part for part in merge_small_tsu([p for p in parts if p[0]]))
    return normalize_spacing(text)


def normalize_spacing(text: str) -> str:
    text = re.sub(r"\s+([,.!?])", r"\1", text)
    text = re.sub(r"([,.!?])(?=[A-Za-z])", r"\1 ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def readable_hepburn(text: str, converter: Any, sudachi_tokenizer: Any) -> str:
    if not text:
        return ""
    raw = tokenized_hepburn(text, converter, sudachi_tokenizer)
    return title_case_roma(jaconv.normalize(raw))


def row_needs_review(current: str, candidate: str) -> bool:
    if JP_RE.search(current or ""):
        return True
    compact_current = re.sub(r"[^A-Za-z0-9]", "", current or "").lower()
    compact_candidate = re.sub(r"[^A-Za-z0-9]", "", candidate or "").lower()
    return bool(compact_current and compact_candidate and compact_current != compact_candidate)


def iter_rows(
    wordbank: Iterable[Dict[str, Any]],
    converter: Any,
    sudachi_tokenizer: Any,
) -> Iterable[Dict[str, str]]:
    for index, entry in enumerate(wordbank, start=1):
        example_jp = str(entry.get("exampleJp", ""))
        current = str(entry.get("exampleRoma", ""))
        candidate = readable_hepburn(example_jp, converter, sudachi_tokenizer)
        yield {
            "index": str(index),
            "id": str(entry.get("id", "")),
            "word": str(entry.get("word", "")),
            "exampleJp": example_jp,
            "current": current,
            "candidate": candidate,
            "needsReview": "yes" if row_needs_review(current, candidate) else "no",
        }


def print_markdown(rows: List[Dict[str, str]], limit: int) -> None:
    review_rows = [r for r in rows if r["needsReview"] == "yes"]
    print("# exampleRoma Candidate Report")
    print()
    print(f"- total entries: {len(rows)}")
    print(f"- candidate rows needing review: {len(review_rows)}")
    print("- mode: report-only, JSON not modified")
    print()
    print("| # | id | word | exampleJp | current exampleRoma | candidate |")
    print("|---:|---|---|---|---|---|")
    for row in review_rows[:limit]:
        print(
            f"| {row['index']} | {row['id']} | {row['word']} | "
            f"{row['exampleJp']} | {row['current']} | {row['candidate']} |"
        )
    if len(review_rows) > limit:
        print()
        print(f"... {len(review_rows) - limit} more rows omitted. Use --limit to show more.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate report-only exampleRoma candidates for wordBank examples."
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--limit", type=int, default=120)
    args = parser.parse_args()

    wordbank = load_wordbank(args.input)
    converter = build_kakasi()
    sudachi_tokenizer = build_sudachi_tokenizer()
    rows = list(iter_rows(wordbank, converter, sudachi_tokenizer))
    print_markdown(rows, args.limit)


if __name__ == "__main__":
    main()
