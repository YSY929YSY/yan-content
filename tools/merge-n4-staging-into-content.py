#!/usr/bin/env python3
"""Dry-run or apply N4 staging wordBank merge into Yan content.v2.json.

Default mode is dry-run-safe when --dry-run is passed: input files are not
modified and a Markdown report is written with expected counts and blockers.
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

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

EXPECTED = {
    "content_wordbank": 718,
    "staging_wordbank": 626,
    "append_count": 625,
    "cross_level_merge_count": 1,
    "final_physical_wordbank": 1343,
    "level_eq_n5": 718,
    "levels_includes_n5": 718,
    "level_eq_n4": 625,
    "levels_includes_n4": 626,
}

LEVEL_ORDER = {"N5": 0, "N4": 1, "N3": 2, "N2": 3, "N1": 4}


def order_levels(levels: list[str]) -> list[str]:
    return sorted(set(levels), key=lambda x: LEVEL_ORDER.get(str(x), 99))


N4_ATTRIBUTION = {
    "source": "stephenmk/yomitan-jlpt-vocab original_data/n4.csv",
    "source_url": "https://github.com/stephenmk/yomitan-jlpt-vocab",
    "license": "CC-BY-SA-4.0",
    "github_blob_sha": "6c50e2f5a025041dece962d3332c653bf055178b",
    "source_note": "JLPT data sourced from Jonathan Waller / Tanos JLPT Resources; stephenmk added corresponding JMdict entry IDs.",
    "scope_note": "N4 Core seed only; not an official JLPT list and not final complete N4+ coverage.",
    "jmdict_note": "JMdict/EDRDG used for validation and sense/gloss support.",
    "sudachi_note": "SudachiPy + sudachidict_core used for reading, dictionary form, and POS validation.",
    "generated_count": 626,
    "merged_physical_entries": 625,
    "cross_level_entries": ["n5_minna"],
    "skipped_duplicate_with_n5_count": 12,
}


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def entry_key(entry: dict[str, Any]) -> tuple[str, str]:
    return (str(entry.get("word", "")), str(entry.get("reading", "")))


def reading_meaning_key(entry: dict[str, Any]) -> tuple[str, str]:
    return (str(entry.get("reading", "")), str(entry.get("meaning_en", "")))


def find_missing_required(entries: list[dict[str, Any]]) -> dict[str, list[str]]:
    missing: dict[str, list[str]] = {}
    for entry in entries:
        absent = [field for field in REQUIRED_FIELDS if field not in entry]
        if absent:
            missing[str(entry.get("id", "<missing-id>"))] = absent
    return missing


def count_levels(entries: list[dict[str, Any]]) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for entry in entries:
        levels = entry.get("levels") or []
        if isinstance(levels, list):
            for level in levels:
                counts[str(level)] += 1
    return dict(counts)


def duplicate_keys(entries: list[dict[str, Any]], key_name: str) -> dict[str, list[str]]:
    buckets: defaultdict[str, list[str]] = defaultdict(list)
    for entry in entries:
        if key_name == "id":
            key = str(entry.get("id", ""))
        elif key_name == "word_reading":
            key = " / ".join(entry_key(entry))
        elif key_name == "reading_meaning_en":
            key = " / ".join(reading_meaning_key(entry))
        else:
            raise ValueError(key_name)
        buckets[key].append(str(entry.get("id", "<missing-id>")))
    return {key: ids for key, ids in buckets.items() if key and len(ids) > 1}


def build_plan(content: dict[str, Any], staging: dict[str, Any]) -> dict[str, Any]:
    content_wb = content.get("wordBank") or []
    staging_wb = staging.get("wordBank") or []
    if not isinstance(content_wb, list) or not isinstance(staging_wb, list):
        raise SystemExit("content/staging wordBank must be arrays")

    content_by_id = {entry.get("id"): entry for entry in content_wb}
    content_by_wr: defaultdict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    content_by_rm: defaultdict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for entry in content_wb:
        content_by_wr[entry_key(entry)].append(entry)
        content_by_rm[reading_meaning_key(entry)].append(entry)

    blockers: list[str] = []
    warnings: list[str] = []
    append_entries: list[dict[str, Any]] = []
    cross_level_merges: list[dict[str, Any]] = []
    reading_meaning_warnings: list[dict[str, Any]] = []

    for entry in staging_wb:
        entry_id = entry.get("id")
        if entry_id in content_by_id:
            blockers.append(f"id overlap: {entry_id}")
            continue

        wr_matches = content_by_wr.get(entry_key(entry), [])
        if wr_matches:
            if len(wr_matches) > 1:
                blockers.append(
                    f"multiple content word+reading matches for staging {entry_id}: "
                    + ", ".join(str(match.get("id")) for match in wr_matches)
                )
                continue
            target = wr_matches[0]
            cross_level_merges.append(
                {
                    "staging_id": entry_id,
                    "content_id": target.get("id"),
                    "word": entry.get("word"),
                    "reading": entry.get("reading"),
                    "current_levels": target.get("levels"),
                    "planned_levels": order_levels((target.get("levels") or []) + ["N4"]),
                    "content_level_kept": target.get("level"),
                }
            )
            continue

        rm_matches = content_by_rm.get(reading_meaning_key(entry), [])
        if rm_matches:
            reading_meaning_warnings.append(
                {
                    "staging_id": entry_id,
                    "staging_word": entry.get("word"),
                    "reading": entry.get("reading"),
                    "meaning_en": entry.get("meaning_en"),
                    "content_ids": [match.get("id") for match in rm_matches],
                }
            )

        append_entries.append(entry)

    merged = copy.deepcopy(content_wb)
    merged_by_id = {entry.get("id"): entry for entry in merged}
    for merge in cross_level_merges:
        target = merged_by_id[merge["content_id"]]
        levels = target.get("levels") or []
        if "N4" not in levels:
            target["levels"] = order_levels(levels + ["N4"])
    merged.extend(copy.deepcopy(append_entries))

    final_level_counter = Counter(str(entry.get("level")) for entry in merged)
    final_levels_counter = Counter()
    for entry in merged:
        for level in entry.get("levels") or []:
            final_levels_counter[str(level)] += 1

    missing_content = find_missing_required(content_wb)
    missing_staging = find_missing_required(staging_wb)
    missing_merged = find_missing_required(merged)
    if missing_content:
        blockers.append(f"content missing required fields: {len(missing_content)} entries")
    if missing_staging:
        blockers.append(f"staging missing required fields: {len(missing_staging)} entries")
    if missing_merged:
        blockers.append(f"merged missing required fields: {len(missing_merged)} entries")

    duplicate_id_after = duplicate_keys(merged, "id")
    duplicate_wr_after = duplicate_keys(merged, "word_reading")
    duplicate_id_content = duplicate_keys(content_wb, "id")
    duplicate_wr_content = duplicate_keys(content_wb, "word_reading")
    duplicate_id_staging = duplicate_keys(staging_wb, "id")
    duplicate_wr_staging = duplicate_keys(staging_wb, "word_reading")
    new_duplicate_wr_after = {
        key: ids
        for key, ids in duplicate_wr_after.items()
        if key not in duplicate_wr_content
    }
    if duplicate_id_content:
        blockers.append(f"content id duplicates: {len(duplicate_id_content)} keys")
    if duplicate_id_staging:
        blockers.append(f"staging id duplicates: {len(duplicate_id_staging)} keys")
    if duplicate_id_after:
        blockers.append(f"expected merged id duplicates: {len(duplicate_id_after)} keys")
    if new_duplicate_wr_after:
        blockers.append(f"new merged word+reading duplicates: {len(new_duplicate_wr_after)} keys")

    counts = {
        "content_wordbank": len(content_wb),
        "staging_wordbank": len(staging_wb),
        "append_count": len(append_entries),
        "cross_level_merge_count": len(cross_level_merges),
        "final_physical_wordbank": len(merged),
        "level_eq_n5": final_level_counter.get("N5", 0),
        "levels_includes_n5": final_levels_counter.get("N5", 0),
        "level_eq_n4": final_level_counter.get("N4", 0),
        "levels_includes_n4": final_levels_counter.get("N4", 0),
    }
    for key, expected in EXPECTED.items():
        if counts.get(key) != expected:
            blockers.append(f"{key} expected {expected}, got {counts.get(key)}")

    if reading_meaning_warnings:
        warnings.append(f"reading+meaning_en overlaps: {len(reading_meaning_warnings)}")

    return {
        "counts": counts,
        "blockers": blockers,
        "warnings": warnings,
        "append_entries": append_entries,
        "cross_level_merges": cross_level_merges,
        "reading_meaning_warnings": reading_meaning_warnings,
        "duplicate_id_after": duplicate_id_after,
        "duplicate_word_reading_after": duplicate_wr_after,
        "duplicate_id_content": duplicate_id_content,
        "duplicate_word_reading_content": duplicate_wr_content,
        "duplicate_id_staging": duplicate_id_staging,
        "duplicate_word_reading_staging": duplicate_wr_staging,
        "new_duplicate_word_reading_after": new_duplicate_wr_after,
        "missing_required_after": missing_merged,
        "attribution_preview": N4_ATTRIBUTION,
    }


def render_report(plan: dict[str, Any], content_path: Path, staging_path: Path) -> str:
    counts = plan["counts"]
    blockers = plan["blockers"]
    warnings = plan["warnings"]
    status = "PASS" if not blockers else "FAIL"
    lines: list[str] = []
    lines.append("# N4 Merge Dry-Run Report")
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).isoformat()}")
    lines.append(f"Content: `{content_path}`")
    lines.append(f"Staging: `{staging_path}`")
    lines.append(f"Status: **{status}**")
    lines.append("")
    lines.append("## Counts")
    lines.append("")
    lines.append("| Metric | Actual | Expected |")
    lines.append("|---|---:|---:|")
    for key in EXPECTED:
        lines.append(f"| `{key}` | {counts.get(key)} | {EXPECTED[key]} |")
    lines.append("")
    lines.append("## Cross-Level Merge Plan")
    lines.append("")
    if plan["cross_level_merges"]:
        lines.append("| staging_id | content_id | word | reading | current_levels | planned_levels | kept level |")
        lines.append("|---|---|---|---|---|---|---|")
        for item in plan["cross_level_merges"]:
            lines.append(
                "| {staging_id} | {content_id} | {word} | {reading} | `{current_levels}` | `{planned_levels}` | `{content_level_kept}` |".format(
                    **item
                )
            )
    else:
        lines.append("No cross-level merges planned.")
    lines.append("")
    lines.append("## Attribution Preview")
    lines.append("")
    lines.append("```json")
    lines.append(json.dumps(plan["attribution_preview"], ensure_ascii=False, indent=2))
    lines.append("```")
    lines.append("")
    lines.append("## Warnings")
    lines.append("")
    if warnings:
        for warning in warnings:
            lines.append(f"- {warning}")
    else:
        lines.append("- None")
    if plan["reading_meaning_warnings"]:
        lines.append("")
        lines.append("### Reading + Meaning Overlaps")
        lines.append("")
        lines.append("| staging_id | staging_word | reading | meaning_en | content_ids |")
        lines.append("|---|---|---|---|---|")
        for item in plan["reading_meaning_warnings"]:
            lines.append(
                f"| {item['staging_id']} | {item['staging_word']} | {item['reading']} | {item['meaning_en']} | `{item['content_ids']}` |"
            )
    lines.append("")
    lines.append("## Blockers")
    lines.append("")
    if blockers:
        for blocker in blockers:
            lines.append(f"- {blocker}")
    else:
        lines.append("- None")
    lines.append("")
    lines.append("## Audit Expectations")
    lines.append("")
    lines.append(f"- expected merged id duplicates: {len(plan['duplicate_id_after'])}")
    lines.append(f"- content word+reading duplicates before merge: {len(plan['duplicate_word_reading_content'])}")
    lines.append(f"- staging word+reading duplicates before merge: {len(plan['duplicate_word_reading_staging'])}")
    lines.append(f"- expected merged word+reading duplicates: {len(plan['duplicate_word_reading_after'])}")
    lines.append(f"- new merged word+reading duplicates: {len(plan['new_duplicate_word_reading_after'])}")
    lines.append(f"- expected missing required fields after merge: {len(plan['missing_required_after'])}")
    if plan['new_duplicate_word_reading_after']:
        lines.append("")
        lines.append("### New Word + Reading Duplicates")
        lines.append("")
        lines.append("| word / reading | ids |")
        lines.append("|---|---|")
        for key, ids in plan['new_duplicate_word_reading_after'].items():
            lines.append(f"| {key} | `{ids}` |")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Dry-run or apply N4 staging merge into Yan content.")
    parser.add_argument("--content", required=True, type=Path)
    parser.add_argument("--staging", required=True, type=Path)
    parser.add_argument("--report", type=Path, default=Path("reports/merge-n4-dry-run-report.md"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.dry_run:
        raise SystemExit("Only --dry-run is currently supported. Refusing to modify content.")

    content = load_json(args.content)
    staging = load_json(args.staging)
    plan = build_plan(content, staging)
    report = render_report(plan, args.content, args.staging)

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(report, encoding="utf-8")

    print(f"dry-run status: {'PASS' if not plan['blockers'] else 'FAIL'}")
    for key in EXPECTED:
        print(f"{key}: {plan['counts'].get(key)}")
    print(f"warnings: {len(plan['warnings']) + len(plan['reading_meaning_warnings'])}")
    print(f"blockers: {len(plan['blockers'])}")
    print(f"report: {args.report}")

    return 1 if plan["blockers"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
