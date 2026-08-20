# 当前唯一任务 · P0-1 Commit 2 publication 数据迁移

> 状态：已授权 CC 按工单实现
>
> 预计实现者：CC
>
> 独立复核：Codex
>
> 更新日期：2026-08-20

Commit 1 已通过并提交。Commit 2 的完整任务书在：

- `docs/handoff/TICKET-publication-migration.md`

产品负责人已确认 schema 细节。CC 可以严格按工单修改允许范围内的脚本、两份内容包与测试；完成后停在未提交状态，等待 Codex 独立复核。

CC 若要预读，只读：

1. 本文件；
2. `TICKET-publication-migration.md`；
3. 工单直接点名的现有代码。

不需要重读路线图、旧 `CC-REPORT`、旧 `CODEX-REVIEW`、JMdict、声调、UI、手账或世界相关文档。

## 已确认的 schema 细节

`learning: false` 时不写 `learningBasis`，也不写 `null`；只有 563 个 `learning: true` 的兼容主线词携带 `learningBasis: "legacy_mainline_anchor"`。

理由：basis 是正向准入依据；尚未准入没有证据依据。这样也避免把 `null` 当成一个需要解释的第三种业务状态。

这条已由产品负责人于 2026-08-20 确认，不再是待决定项。
