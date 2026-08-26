# 工单 · 落 13 条换句结果（内容窗口，开分支）

> 先读 `AGENTS.md`（第二节分支规矩、第四节 commit 完成标准、第五节 5-1/5-2/5-3/5-4）。
> **本轮改内容包。** 分支 `content/2026-08-27-wordfield-jp13`。

## 本轮决策指标（5-4）

**词场落库数：187 / 563 → 200 / 563。**

## 这张工单把主线推迟多久

**不推迟，就是主线。** 半轮的量。

## 负责人已经做出的决定（不要重新讨论）

`staging/jp-22-swapped-for-review.md` 的 15 条已外部审核完毕：

- **13 条通过 → 本轮落库**（编号 1,2,3,5,6,7,8,9,10,11,12,13,14）
- **2 条不通过 → 并入未解决**（编号 4 `n5_futari`、15 `n5_sora`）

未解决因此从 7 条变为 **9 条**：
`n5_aru_2` `n5_fuyu` `n5_iriguchi` `n5_iru` `n5_mimi` `n5_oniisan` `n5_shinu`
`n5_futari` `n5_sora`

**这 9 条不落库、不换句、不写新句。** 已核：`n5_futari` 与 `n5_sora` 的候选池
各只有 2 条，另一条同样不自然（`二人子供がいます` 缺助词；`鳥が空にいます` 只是换敬体），
**池子已耗尽，不要再试。**

### 审核边界（保持，不要越界）

外部审核明确**没有**因为中文对应问题判 JP：
`#3 見ました↔看着`、`#8 語句↔这句话` 的细微对译问题**属于 ZH 那一轮**。

**本轮同样不要顺手改这两条的中文。** 分层测量的前提是每层只答自己那一问；
混进来会让 JP 的验收数和 ZH 的基线同时失真。

## 要做的

### 1. 落 13 条

把这 13 条的新句子写进内容包，**替换**对应 anchor 现有的 `wordField.sentence`。

- **日文、中文逐字照搬**候选池原文，一个字都不改
- `source.jp_sentence_id` / `zh_sentence_id` 更新为新句的 ID
- `members` 按新句重算（**必须走 `dictionaryFormsFrom` 还原活用形** ——
  上一轮就是词面直接对照才丢了成员）
- 不写 `roma`、不写 `nativeChecked`（沿用既有裁决）

### 2. 更新两条 gloss 基线的硬断言

`src/features/wordbank/__tests__/wordFieldAlignment.test.mjs`：

- Tatoeba 组的 `assert.equal(fields.length, 167)` 会因为句子替换**不变**（还是 167 条），
  但覆盖率会变 —— **重测实测值，若跌破 95% 下限，报告说明原因，不要下调下限**
- legacy 组（20 条零空洞）不动

### 3. 记一笔：谚语对译是系统性问题

`n5_futari` 那条 `二人は伴侶三人は仲間割れ / 一个和尚挑水吃…` 是**谚语对译** ——
Tatoeba 日中双方各取本国谚语，两边都不是自然句子。
外部审核上一轮标的 `255 ZH 中文谚语义不等值` 是同一形状。

**本轮不处理**，写进报告，`ZH 38` 那轮要专门查这一类。

## 明确不做

- ❌ 不用 LLM 生成或改写任何日文或中文
- ❌ 不落那 9 条未解决
- ❌ 不改 ZH 38 / LV 67 两组
- ❌ **不覆盖现有 20 条手工词场**
- ❌ 不发布、不推 `origin/main`、不构建、不发 OTA

## 验收

- 异常自查（5-2）；每个数字附复算命令（5-1）
- **`content-stats` 前后对比：词场 187 → 200**
- 13 条的 anchor / 旧句 / 新句 / 新 Tatoeba ID 对照表
- **members 为空的仍为 0**；成员总数前后对比
- 两份文件 sha256 相同、`_meta.version` 递增一次、
  `bash tools/check-content-release.sh` Blocker=0
- Tatoeba gloss 覆盖率实测值（下限仍为 95%）
- `npm test && npm run typecheck && npm run audit`，`git status --short` 干净

## 做完写哪里

`ACTIVE.md` + `CC-REPORT.md`。**做完停下，不要发布。**
