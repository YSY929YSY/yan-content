# 当前状态 · 主线 M1

> 状态：M1 已完成；Tatoeba 词场候选已产出，等待项目负责人先看样例后决定是否进入 M2。
>
> 更新日期：2026-08-25

## 当前工单

`docs/handoff/TICKET-mainline-wordfield.md`

## 本轮进度

- 主线池：563 条 `kanji_anchor`。
- 合格候选覆盖：**459 / 563** 条主线池词。
- 产物：`staging/wordfield-candidates-tatoeba.jsonl`，共 **1,851** 条候选、**1,569** 个成员组合；每个组合最多保留 2 条。
- 平均候选数：按全池 **3.29 条/词**，按已覆盖词 **4.03 条/词**。
- 筛选硬门槛：每句至少 2 个主线池词、日文 ≤20 字、≤8 个 Sudachi token、有日中 Tatoeba 句 ID；生成后逐条机器自检成员命中。
- 句子和中文均直接来自本地 Tatoeba，未造句、未改写；`unknown_words` 已随每条产物写出供人工判断。
- 本轮未改 `assets/content.fallback.json`、`yan-content/content.v2.json`，未推 M2、未构建。
- 实现提交：`d9ec045 feat(wordfield): use native Tatoeba coverage to set the mainline frontier`。

## 下一步

- 先人工查看 `docs/handoff/CC-REPORT.md` 中的 10 条样例；未获确认前不落库、不改内容包。
- M2 若获准，再按候选中的 Tatoeba 日/中句 ID 写入内容包，并保留来源说明。
- 便利店剩余 29 条释义审校仍未做。

## 与 batch9 的边界

- B9-2 不属于本轮，未被顺手修改。
- `TokenColumnSentence` 样板的真机与不同屏幕稳定性仍是**待真机验证**；本轮不构建、不做 EAS Update。

## 不做

- 不把 staging 候选当成已落库词场，不改现有 20 条词场。
- 不下载数据，不使用 LLM 造句或改写，不改内容包。
- 不做 batch9 B9-2 或任何 UI 打磨，不构建。
