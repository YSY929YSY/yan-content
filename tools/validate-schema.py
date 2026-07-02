#!/usr/bin/env python3
"""Validate content.v2.json against strict schema rules.

Exit code 0 = pass, 1 = failures found.
Output: Markdown report to stdout.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Set

DEFAULT_INPUT = Path("yan-content/content.v2.json")

# ── Schema rules ──────────────────────────────────────────────

# 所有词都必填(核心身份 + 释义)
REQUIRED_WORD_FIELDS = {
    "id": str,
    "word": str,
    "reading": str,
    "level": str,
    "pos": str,
    "meaning_zh": str,
}

# 仅"已定稿"词必填(N5/N4 精修词);草稿词(N3-N1 批量导入)豁免,后续补
FINALIZED_REQUIRED_FIELDS = {
    "coreChunk": str,
    "exampleJp": str,
    "exampleZh": str,
}
DRAFT_STATUSES = {"draft", "zh_drafted", "candidate"}

OPTIONAL_WORD_FIELDS = {
    "meaning_en": str,
    "exampleRoma": str,
    "levels": list,
    "status": str,
    "tags": dict,
    "yanFeatures": list,
    "grammarBlock": list,
    "trap": dict,
}

VALID_LEVELS = {"N5", "N4", "N3", "N2", "N1"}
VALID_POS = {
    "名词", "动词", "形容词", "形容动词", "副词", "代词", "接续词",
    "感叹词", "助词", "助动词", "连体词", "接头词", "接尾词",
    "外来语", "复合词", "敬语动词", "补助动词", "疑问词",
}

REQUIRED_TOP_KEYS = {
    "wordBank", "culturalFusion", "scenes", "kanaRows",
}


def validate_top_level(data: dict) -> List[str]:
    errors = []
    for key in REQUIRED_TOP_KEYS:
        if key not in data:
            errors.append(f"[TOP] Missing required key: {key}")
        elif not isinstance(data[key], list):
            errors.append(f"[TOP] '{key}' should be a list, got {type(data[key]).__name__}")
    return errors


def validate_word(index: int, entry: Dict[str, Any], seen_ids: Set[str]) -> List[str]:
    errors = []
    eid = entry.get("id", f"<index {index}>")

    # Required fields (所有词)
    required = dict(REQUIRED_WORD_FIELDS)
    # 定稿词额外要求 coreChunk/例句;草稿词豁免
    if str(entry.get("status", "")) not in DRAFT_STATUSES:
        required.update(FINALIZED_REQUIRED_FIELDS)
    for field, expected_type in required.items():
        val = entry.get(field)
        if val is None or (isinstance(val, str) and val.strip() == ""):
            errors.append(f"[{eid}] Missing or empty required field: {field}")
        elif not isinstance(val, expected_type):
            errors.append(f"[{eid}] Field '{field}' should be {expected_type.__name__}, got {type(val).__name__}")

    # Optional fields type check
    for field, expected_type in OPTIONAL_WORD_FIELDS.items():
        val = entry.get(field)
        if val is not None and not isinstance(val, expected_type):
            errors.append(f"[{eid}] Field '{field}' should be {expected_type.__name__}, got {type(val).__name__}")

    # ID uniqueness
    word_id = entry.get("id", "")
    if word_id in seen_ids:
        errors.append(f"[{eid}] Duplicate id")
    seen_ids.add(word_id)

    # Level validation
    level = entry.get("level", "")
    if level and level not in VALID_LEVELS:
        errors.append(f"[{eid}] Invalid level: {level}")

    levels = entry.get("levels", [])
    if levels:
        for lv in levels:
            if lv not in VALID_LEVELS:
                errors.append(f"[{eid}] Invalid level in levels array: {lv}")

    # Length sanity checks
    example_jp = entry.get("exampleJp", "")
    if isinstance(example_jp, str) and len(example_jp) > 80:
        errors.append(f"[{eid}] exampleJp too long ({len(example_jp)} chars)")

    meaning_zh = entry.get("meaning_zh", "")
    if isinstance(meaning_zh, str) and len(meaning_zh) > 100:
        errors.append(f"[{eid}] meaning_zh too long ({len(meaning_zh)} chars)")

    return errors


def validate(data: dict) -> List[str]:
    all_errors = validate_top_level(data)

    wordbank = data.get("wordBank", [])
    seen_ids: Set[str] = set()
    for i, entry in enumerate(wordbank, start=1):
        all_errors.extend(validate_word(i, entry, seen_ids))

    return all_errors


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Validate content.v2.json schema.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    args = parser.parse_args()

    with args.input.open("r", encoding="utf-8") as f:
        data = json.load(f)

    errors = validate(data)

    print("# Schema Validation Report")
    print()
    print(f"- file: {args.input}")
    print(f"- wordBank entries: {len(data.get('wordBank', []))}")
    print(f"- errors: {len(errors)}")
    print(f"- result: {'PASS' if not errors else 'FAIL'}")

    if errors:
        print()
        print("## Errors")
        print()
        for e in errors[:100]:
            print(f"- {e}")
        if len(errors) > 100:
            print(f"\n... {len(errors) - 100} more errors omitted")

    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
