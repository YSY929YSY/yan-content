# WordBank Example Generation Workflow

## Scope

This workflow applies to N4-N1 staging data only. It is for generating and auditing `exampleJp`, `exampleRoma`, and `exampleZh` before any formal merge into `yan-content/content.v2.json`.

It does not apply to production content updates, app UI work, N5 release maintenance, or schema changes.

## Batch Size

Use small, reviewable batches:

- First sample: 30 entries.
- After the sample passes review: 100 entries per round.
- After full generation: run a full example audit before any merge decision.

Do not generate a full level in one pass unless a reviewed workflow and audit report already exist for that level.

## Example Standard

Each core example should satisfy:

- `exampleJp` is short, natural, and understandable with mostly N4/N5 grammar.
- The target word appears clearly in `exampleJp`; natural conjugation is allowed.
- The sentence uses the core sense in `meaning_zh`.
- `exampleZh` is a natural full-sentence Chinese translation, not a copied gloss.
- `exampleRoma` fully corresponds to `exampleJp`.
- `exampleRoma` is split by words or short phrases and has no Japanese characters.
- N4 Core examples should favor basic daily situations.
- Do not force every word into travel, hotel, medical, business, or service scenarios.
- Honorific and humble words must use examples that make the register visible.
- For polysemous words, choose the most basic learner-facing sense.

## Style Warnings

Avoid:

- Literary or poetic core examples.
- Overly business-like or domain-specific core examples.
- Travel-service sentences when the word does not naturally call for them.
- Scene sentences that do not include the target word.
- Grammar that is much harder than N4 unless the word requires it.
- Literal Chinese that sounds translated rather than natural.
- `exampleZh` values that are just one meaning from `meaning_zh`.
- Broken romaji spacing such as `i masu`, `te i masu`, `shira be`, or `ki masu`.

## Division Of Labor

Use this split:

- AI generates candidate examples in the staging JSON.
- Tools audit structure and high-risk patterns.
- Human or model review makes final decisions on naturalness, target-word salience, register, and semantic fit.

Tool checks can catch:

- JSON parse errors.
- Entry count drift.
- Missing example fields.
- Japanese residue in `exampleRoma`.
- Bad romaji spacing patterns.
- Very long `exampleJp` or `exampleZh`.
- Heuristic target-word missing cases.
- `exampleZh` that looks like a gloss instead of a sentence.

Human/model review must decide:

- Whether the sentence is truly natural.
- Whether the target word is used in the intended core sense.
- Whether the register is right.
- Whether the Chinese translation matches the whole sentence.
- Whether a romaji reading is plausible for kanji and particles.

## Round Output

Each round should report:

- batch size processed
- generated example count
- blocker count
- warning count
- manual review list
- representative before/after or generated rows
- JSON parse / count / example field validation
- confirmation that `YanApp/App.js` and `yan-content/content.v2.json` were not modified

## Copyable Next-Round Prompt

```text
请继续 N4 example 生成，但只处理下一批 100 条尚无例句的 staging 词条，不要扩大范围。

边界：
- 不要修改 App.js
- 不要修改 yan-content/content.v2.json
- 不要提交
- 不要推送
- 不要合并正式 content
- 只允许修改 staging/n4-core-full.json、staging/n4-core-full-report.md、staging/n4-meaning-review.md；可更新 staging/n4-example-sample-report.md 或新增本轮 example 报告

任务：
1. 为下一批 100 条尚无例句的词生成 exampleJp/exampleRoma/exampleZh。
2. exampleJp 要短、自然、N4/N5 可理解。
3. 目标词必须显著出现，允许自然活用。
4. 围绕 meaning_zh 核心义，多义词只选基础词书最核心义。
5. exampleZh 必须是整句自然中文翻译，不是词义回退。
6. exampleRoma 必须完整对应 exampleJp，按词分隔，无日文残留。
7. 不强行旅行/酒店/医疗/商务场景。
8. 尊敬语/谦让语必须体现语气。
9. 生成后运行 tools/audit-wordbank-examples-staging.py。
10. 根据 audit 输出修复 blocker；warning 先列入人工复核，不要为了清零乱改。

输出：
- 本轮生成条数
- blocker / warning 数量
- 人工复核列表
- 典型 30 条对照
- 是否可以继续下一批
```

## Hard Prohibitions

- Do not merge staging entries into `yan-content/content.v2.json`.
- Do not modify `YanApp/App.js`.
- Do not generate more entries than the requested batch size.
- Do not commit.
- Do not push.
