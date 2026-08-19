# N4 Merge Dry-Run Report

Generated: 2026-06-16T05:35:59.751721+00:00
Content: `yan-content/content.v2.json`
Staging: `staging/n4-core-full.json`
Status: **PASS**

## Counts

| Metric | Actual | Expected |
|---|---:|---:|
| `content_wordbank` | 718 | 718 |
| `staging_wordbank` | 626 | 626 |
| `append_count` | 625 | 625 |
| `cross_level_merge_count` | 1 | 1 |
| `final_physical_wordbank` | 1343 | 1343 |
| `level_eq_n5` | 718 | 718 |
| `levels_includes_n5` | 718 | 718 |
| `level_eq_n4` | 625 | 625 |
| `levels_includes_n4` | 626 | 626 |

## Cross-Level Merge Plan

| staging_id | content_id | word | reading | current_levels | planned_levels | kept level |
|---|---|---|---|---|---|---|
| n4_mina | n5_minna | みんな | みんな | `['N5']` | `['N5', 'N4']` | `N5` |

## Attribution Preview

```json
{
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
  "cross_level_entries": [
    "n5_minna"
  ],
  "skipped_duplicate_with_n5_count": 12
}
```

## Warnings

- None

## Blockers

- None

## Audit Expectations

- expected merged id duplicates: 0
- content word+reading duplicates before merge: 0
- staging word+reading duplicates before merge: 0
- expected merged word+reading duplicates: 0
- new merged word+reading duplicates: 0
- expected missing required fields after merge: 0
