# 当前状态 · 主线词库 gloss 空白机械修复

> 状态：代码修复、全量重测与仓库盘点完成；等待最终门禁输出归档。
>
> 更新日期：2026-08-25

## 当前工单

`docs/handoff/TICKET-gloss-blanks-and-cleanup.md`

## 主线影响

本工单不额外推迟主线。gloss 覆盖是词库深度可读性的一部分；仓库清理是机械整理，不碰内容包。

## 已完成

- 脚本改为四类空白归因：语法/活用尾、分词切碎、专名/外来语、真·缺词。
- `GRAMMAR` 补入稳定语法项；纯全角/半角数字输出半角形式。
- 单字候选采用方案 (a)：只有当前 `EXAMPLE_TOKENS` 独立 span 才允许命中；测试已放在 `src/features/wordbank/__tests__/`。
- 全量 4,400 条重测：实际耗时 92.09 秒；拼回一致 4,400/4,400（100.00%）；非标点 gloss 28,903/31,256（92.47%）。
- 空白 2,365：语法/活用尾 940（39.75%）、分词切碎 286（12.09%）、专名/外来语 284（12.01%）、真·缺词 855（36.15%）；真·缺词去重 604 个，完整清单在 CC-REPORT。
- 新增根目录 `.gitignore` 与 `UNTRACKED-INVENTORY.md`；未删除、未暂存任何原未跟踪内容。
- 检查没有脚本读取 `yan-content/content.json` 或 `content.v1.json`。

## 关键判断

- 修复前 30 条单字样本人工判读为 68 个命中中的 38 个误命中（55.88%），因此采用可解释的独立 span 守卫。
- 修复后覆盖率下降是准确性取舍，不能据此回滚。
- “真·缺词”机械判据实测得到 604 个去重表面，明显高于工单背景估计；本轮只列清单，不使用 JMdict/LLM 补中文。

## 尚未完成

- 将最终 `npm test && npm run typecheck && npm run audit` 的 raw 输出贴入 CC-REPORT。
- 提交本轮代码、测试、脚本和报告变更；提交前后各跑一次 `git status --short`。

## 明确不做

- 不改 `App.js`、UI、`TOKEN_COLUMN_SAMPLE_SENTENCES`。
- 不碰 `assets/content.fallback.json`、`yan-content/content.v2.json`。
- 不删除未跟踪文件，不使用 JMdict/LLM 补中文。
- 不构建、不发 OTA，不顺手重构 `wordFieldAlignment.js` 的其他部分。
