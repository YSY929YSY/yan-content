# 当前状态 · 主线词场 343 条审核 rubric 重排

> 状态：五状态 staging 清单已重排，等待项目负责人决定阈值；不落库。
>
> 更新日期：2026-08-26

## 当前工单

`docs/handoff/TICKET-wordfield-rubric-v2.md`

## 主线影响

本轮约一轮，属于主线词库深度的止损：先把词表覆盖检查与教学质量信号分开，再决定哪些句子能进入内容包。现有内容包仍为 20 / 563，未写入。

## 已完成

- 更新只读脚本 `scripts/wordfield-shortlist.mjs`，对已有 1851 条 Tatoeba 行按 anchor 保持确定性选择，并附 `alt_count`。
- 产出 `staging/wordfield-shortlist-343.json`，每条含五状态之一：`LAND` / `FIX_ZH` / `SWAP` / `DATA` / `SPOKEN`。
- 五状态计数：LAND 301、FIX_ZH 7、SWAP 6、DATA 17、SPOKEN 12；旧 A/B/C 交叉表和 30 条抽样见 `CC-REPORT.md`。
- 已列出负面动词、外国语料度量衡、难度信号、数字/解析信号、中文机械信号的全部实例；`SWAP` 且无备选为 1 条。

## 关于“有没有源”

这不是“已有源即可直接落库”：每条有可定位的 Tatoeba 日句 ID 和中日对齐句 ID，但 343 条仍未由项目负责人或母语者逐条确认。请负责人看报告中的交叉表与 30 条抽样后决定：`A 档直接落` / `A+B 落` / `再等`。下一张工单才落库。

## 等待负责人

请负责人看报告中的交叉表和 30 条抽样后，只需给一句：`A 档直接落` / `A+B 落` / `再等`。下一张工单才落库。

## 明确不做

- 不改 `assets/content.fallback.json`、`yan-content/content.v2.json`，不改 App/UI/gloss。
- 不生成或改写任何日文、中文；不使用 LLM。
- 不实现 register，不修 Tatoeba 原句，不删除未跟踪文件。
- 不构建、不发 OTA。
