# N4 Content Merge Apply Report

Generated: 2026-06-16T07:08:44.696356+00:00

## Summary

- before wordBank: 718
- staging wordBank: 626
- append count: 625
- cross-level merge count: 1
- after wordBank: 1343

## Cross-Level Merge

| staging_id | content_id | word | reading |
|---|---|---|---|
| n4_mina | n5_minna | みんな | みんな |

## Audit

- wordBank.length: PASS
- id_unique: PASS
- required_fields_complete: PASS
- level_eq_N5: PASS
- levels_includes_N5: PASS
- level_eq_N4: PASS
- levels_includes_N4: PASS
- duplicate_word_reading_zero: PASS
- N4_examples_nonempty: PASS
- N4_exampleRoma_japanese_residual_zero: PASS

## Counts

- level === N5: 718
- levels includes N5: 718
- level === N4: 625
- levels includes N4: 626
- duplicate word+reading: 0
- N4 example nonempty: {'exampleJp': 626, 'exampleRoma': 626, 'exampleZh': 626}
- N4 exampleRoma Japanese residual: 0

## Attribution Metadata

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
  "skipped_duplicate_with_n5_count": 12,
  "merged_at": "2026-06-16T07:08:44.696356+00:00"
}
```
