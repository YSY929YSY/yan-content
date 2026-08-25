# 当前状态 · 主线续批 T1/T3

> 状态：T1、T3 已完成；T2 **未落库**，等待项目负责人看过 T1 规范化后的样例并决定数量。
>
> 更新日期：2026-08-25

## 当前工单

`docs/handoff/TICKET-mainline-wordfield-2.md`

## 本轮进度

- T1 已完成：重跑 1,851 条 Tatoeba staging 中文，接入现成 `opencc.OpenCC("t2s")`；OpenCC 可转换繁体字符机器命中 **0**。
- T1 机器回归：日文原句、`jp_sentence_id`、`zh_sentence_id` 均与 T1 前逐条一致；实际有 621 行中文发生规范化（工单的 368 条是较窄常用字口径，报告记录该差异）。
- T3 已完成：对齐行 gloss 在第一个义项后再取第一个中文分隔符；不改 `meaning_zh`，不改 `TokenColumnSentence` 三槽位结构；对齐行 gloss 单行显示且不设截断宽度。
- T3 测试覆盖真实词库 10 个词，并检查不以省略号截断。
- T2：**0 条**。未改 `assets/content.fallback.json`、`yan-content/content.v2.json`，未自行决定落库数量。
- T1 提交：`0d82268 fix(wordfield): normalize staged Tatoeba translations before review`。
- T3 提交：`c839be5 fix(wordfield): keep alignment glosses short and single-line`。
- EAS Update：preview / iOS 已发布，update group `94cd5add-ca1e-464d-81d2-997cc0fe5974`；这不是构建。

## 下一步

- 项目负责人先看 `docs/handoff/CC-REPORT.md` 中的 T1/T3 样例；确认前不做 T2。
- 真机检查对齐行和系统字号是否撑散列布局：**待真机验证**。
- 若负责人批准 T2，再由负责人决定落库条数；按两份内容包同一 commit 的规则执行。

## 不做

- 不自行落库，不更新主线已落库数字（仍为 20/563；staging 覆盖仍为 459/563）。
- 不改词条 `meaning_zh`，不改 `TokenColumnSentence` 三槽位，不推全库 B9-2。
- 不构建；不做横竖屏结论；不把 EAS Update 发布写成真机已验证。
