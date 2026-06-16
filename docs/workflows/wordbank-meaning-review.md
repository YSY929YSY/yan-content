# WordBank Meaning Zh Review Workflow

## Scope

This workflow applies to N4-N1 staging data only. It is for converging `meaning_zh` candidates before any formal merge into `yan-content/content.v2.json`.

It does not apply to production content updates, app UI work, or example sentence generation.

## Stage

Use this workflow after a JLPT level staging file has been generated with:

- `word`
- `reading`
- `meaning_en`
- candidate `meaning_zh`
- audit metadata from JMdict/Sudachi/source matching

The expected input is a staging JSON plus a review report, such as:

- `staging/n4-core-full.json`
- `staging/n4-core-full-report.md`
- `staging/n4-meaning-review.md`

## Tool-Handled Checks

The tooling may handle mechanical and auditable checks:

- JSON parse and schema shape
- entry count and id uniqueness
- required field presence
- empty `meaning_zh`
- `meaning_zh == "待审"`
- English/ASCII residue in `meaning_zh`
- reading, POS, and JMdict matching
- Sudachi reading/dictionary-form checks
- high-risk category labeling
- report statistics
- review queue generation

Tools may also auto-fix narrow, obvious issues, such as:

- `待审` entries where the English gloss is unambiguous
- accidental English leftovers in the main `meaning_zh`
- clearly awkward fallback artifacts
- obvious honorific labels already confirmed by source data

Do not use tooling to silently resolve real semantic ambiguity.

## Human Decisions

Human review is required for:

- multi-sense word selection
- Chinese naturalness and learner-facing wording
- honorific/register nuance
- katakana loanword conventions and common Chinese usage
- phrase and compound interpretation
- whether to keep a basic vocabulary meaning or a more encyclopedic explanation
- whether a candidate belongs in the core meaning or should move to future extended notes

When uncertain, keep:

- `needs_sense_review: true`
- a concise `reason`
- the item in the manual review queue

## Review Tracking Fields

After each manual review pass, record the decision in the entry's audit object:

- `reviewed_round`: review batch id, for example `n4_meaning_round_1`
- `manual_review_decision`: one of `fixed`, `accepted`, or `kept_for_review`
- `manual_review_note`: short reason for the decision

Use `manual_review_decision` consistently:

- `fixed`: `meaning_zh` was changed.
- `accepted`: risk was cleared, but `meaning_zh` did not change.
- `kept_for_review`: reviewer could not decide safely.

For `kept_for_review`, preserve `needs_sense_review: true` and keep a clear `reason` so the item remains in the manual review queue.

## Batch Size

Default review batch size: 50 entries.

Do not process the entire high-risk queue in one pass. Small batches make it easier to keep the Chinese concise, consistent, and reviewable.

Recommended rhythm:

1. Select the next 50 manual-review rows.
2. Fix only clear issues inside that batch.
3. Leave uncertain entries flagged.
4. Regenerate staging/report.
5. Verify counts and examples remain untouched.

## Entry Standard

Each reviewed entry should satisfy:

- `word`, `reading`, `meaning_en`, and `meaning_zh` agree.
- Chinese is short, accurate, common, and learner-facing.
- Prefer basic vocabulary meanings over encyclopedia-style explanations.
- Multiple meanings use Chinese semicolons: `；`
- Keep no more than 3-4 core meanings.
- Avoid machine-translation phrasing.
- Honorifics and register-sensitive meanings include a short note, for example: `在；来；去（尊敬语）`.
- If the sense is uncertain, preserve `needs_sense_review` and explain why.

Good examples:

- `押入れ`: `壁橱；日式壁橱`
- `はっきり`: `清楚地；明确地`
- `おいでになる`: `在；来；去（尊敬语）`
- `予定`: `计划；安排；日程`

Risky examples to avoid:

- Overlong explanation in the main `meaning_zh`
- English residue such as `待审：closet`
- fallback artifacts such as unrelated meanings pulled from isolated words
- treating a loanword as rare ateji or an uncommon literal translation

## Output Format

Each review round should report:

- batch size processed
- fixed count
- accepted count
- kept-for-review count
- remaining manual-review count
- remaining high-risk category stats
- typical before/after pairs
- validation results

Use this shape:

```md
## Meaning Zh Review Round

- processed: 50
- fixed: 18
- accepted: 12
- kept for manual review: 20
- remaining manual review: 245

## High-Risk Remaining

- translation awkward: 120
- sense ambiguity: 70
- katakana loanword: 8
- honorific/register: 1
- phrase/compound: 4

## Before / After

| id | word | before | after | decision |
|---|---|---|---|---|
| n4_xxx | ... | ... | ... | fixed |

## Validation

- JSON parse: PASS
- staging wordBank count: PASS
- examples untouched: PASS
- App.js untouched: PASS
- content.v2.json untouched: PASS
```

## Copyable Next-Round Prompt

```text
请继续 N4 meaning_zh 人工复核队列收敛，但只处理下一批 50 条，不要扩大范围。

边界：
- 不要修改 App.js
- 不要修改 yan-content/content.v2.json
- 不要提交
- 不要推送
- 不要生成 exampleJp/exampleRoma/exampleZh
- 只允许修改 staging/n4-core-full.json、staging/n4-core-full-report.md、staging/n4-meaning-review.md
- 如需改规则，可修改 tools/build-n4-core-staging.py

任务：
1. 从 staging/n4-meaning-review.md 取下一批 50 条人工复核项。
2. 只自动修明显错误或明显不自然的 meaning_zh。
3. 多义项不确定时保留 needs_sense_review: true，并写 reason。
4. 中文释义要短、准、常用；多义用“；”，不超过 3-4 个。
5. 尊敬语/语域词要保留简短说明。
6. 每条在 audit 中记录 reviewed_round、manual_review_decision、manual_review_note。
7. meaning_zh 修改时 decision 用 fixed；未改但清除风险用 accepted；仍不确定用 kept_for_review。
8. 不要补中文以外的字段，不要写例句。

完成后输出：
- 本轮处理条数
- fixed / accepted / kept_for_review 数量
- 仍需人工复核条数
- high-risk 剩余分类统计
- 典型修复前后对照
- JSON parse / count / examples untouched 验证结果
```

## Hard Prohibitions

- Do not generate `exampleJp`.
- Do not generate `exampleRoma`.
- Do not generate `exampleZh`.
- Do not merge staging entries into `yan-content/content.v2.json`.
- Do not modify `YanApp/App.js`.
- Do not commit.
- Do not push.
