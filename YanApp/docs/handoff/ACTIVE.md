# 当前状态 · 主线词场 gloss 推广前评估

> 状态：本轮测量已完成；未改业务代码、UI、内容包；未构建、未发 OTA。
>
> 更新日期：2026-08-25

## 当前工单

`docs/handoff/TICKET-gloss-rollout-assessment.md`

## 本轮结果

- 4,400 条有例句词条全部完成测量。
- 拼回一致：**4,400 / 4,400（100.00%）**。
- 非标点 token gloss 覆盖：**29,521 / 33,566（87.95%）**；全覆盖句 **1,622 / 4,400**。
- 覆盖分布：100% **1,622**；90–99% **378**；70–89% **2,200**；<70% **200**。
- 空白 token：活用碎片 **2,627（64.74%）**；表记差异 **1,431（35.26%）**；不在词库 **0（0.00%）**。
- 贪心分词与 `EXAMPLE_TOKENS` 不同：**3,074 / 4,400**。
- 15 条稳定随机样本与 5 条最低覆盖样本已追加到 `docs/handoff/CC-REPORT.md`。
- 深卡盘点已产出 [`staging/deep-card-audit.md`](../../staging/deep-card-audit.md)：8 张卡中，`すみません` 缺少可供意象复核的 notes/context；发现 `どこ`、`痛い` 两条未带来源的“完全同源”式断言。

## 下一步

- 由项目负责人先看样本质量，再决定是否推进 gloss 展示或深卡修订。
- 本轮没有根据覆盖率自行修改对齐逻辑，也没有把空白补成中文。
- 真机、字号稳定性、UI 推广、构建和 OTA 均不在本轮；保持待后续明确安排。

## 不做

- 不改 `App.js`、`wordFieldAlignment.js`、`TOKEN_COLUMN_SAMPLE_SENTENCES`。
- 不改 `assets/content.fallback.json`、`yan-content/content.v2.json`。
- 不推全库、不用 LLM 补 gloss、不构建、不发 OTA。
