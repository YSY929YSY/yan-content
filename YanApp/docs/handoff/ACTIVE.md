# 当前状态 · 主线词场中文错译率重测

> 状态：LAND 中文错译率已完成人工抽样，等待项目负责人决定是否开启中文返工；不落库。
>
> 更新日期：2026-08-26

## 当前工单

`docs/handoff/TICKET-wordfield-zh-rate.md`

## 主线影响

本轮十几分钟到半轮，属于主线词库深度的止损：测量 LAND 中文错译率后再决定是否落库。现有内容包仍为 20 / 563，未写入。

## 已完成

- 更新只读脚本 `scripts/wordfield-shortlist.mjs`，对已有 1851 条 Tatoeba 行按 anchor 保持确定性选择，并附 `alt_count`。
- 产出 `staging/wordfield-shortlist-343.json`，每条含五状态之一：`LAND` / `FIX_ZH` / `SWAP` / `DATA` / `SPOKEN`。
- 五状态计数：LAND 301、FIX_ZH 7、SWAP 6、DATA 17、SPOKEN 12；旧 A/B/C 交叉表和 30 条抽样见 `CC-REPORT.md`。
- 已列出负面动词、外国语料度量衡、难度信号、数字/解析信号、中文机械信号的全部实例；`SWAP` 且无备选为 1 条。
- 已将五状态扩展为多标签；2 条同时带两个标签：`n5_ane` 为 SWAP + FIX_ZH，`n5_fun` 为 DATA + FIX_ZH。
- 从 LAND 301 条按 anchor_id 确定性取前 40 条人工判读：中文有问题 6 / 40 = 15%，其中意思错 1、中文不自然 4、语体不匹配 1。

## 关于“有没有源”

这不是“已有源即可直接落库”：每条有可定位的 Tatoeba 日句 ID 和中日对齐句 ID，但中文来自用户贡献的 zh 对齐句，质量不齐。请负责人看报告中的 40 条完整样本后决定是否先做中文返工；本轮没有修改任何译文。

## 等待负责人

请负责人看报告中的 40 条人工样本后决定下一步：直接落、先做中文返工，或继续抽样。下一张工单才落库。

## 明确不做

- 不改 `assets/content.fallback.json`、`yan-content/content.v2.json`，不改 App/UI/gloss。
- 不生成或改写任何日文、中文；不使用 LLM。
- 不实现 register，不修 Tatoeba 原句，不删除未跟踪文件。
- 不构建、不发 OTA。
