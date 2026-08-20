# YanApp · CC / Codex 交接入口

> 目的：让 Claude Code（CC）与 Codex 通过仓库协作，减少重复读取、重复解释和两边同时改方向。

## 默认阅读规则

CC 每次开始任务时，**默认只读**：

1. `docs/handoff/ACTIVE.md`
2. `docs/handoff/DECISIONS.md` 中被 `ACTIVE.md` 点名的条目
3. `ACTIVE.md` 点名的当轮报告或复核文件
4. 当前任务直接涉及的代码

不要默认全文重读所有项目文档。

### 旧文档按需路由

| 文档 | 是否每次重读 | 什么时候读 |
|---|---|---|
| `CLAUDE.md` | 不要求手动重读 | Claude Code 通常已把它作为项目上下文；只有文件更新或规则不清时重新打开相关段落 |
| `RULE.md` | 否 | 内容发布、存储、build、Git、外部 AI 修改规则相关时查对应章节 |
| `docs/HANDOFF-learning.md` | 否 | 学习主线、SRS、今日任务、五十音、发布流程相关时查对应章节 |
| `docs/TICKET-jmdict-followup.md` | 否 | 仅在处理 JMdict 署名、join、词性、重复 seq 时阅读 |
| `docs/ROADMAP-content-trust-structure-ui.md` | 否 | 作为完整审查依据；由 `ACTIVE.md` 指定需要看的章节，不要求每次读约 1000 行全文 |

如果旧文档与 `ACTIVE.md` 冲突：

1. 不自行选择一个继续写；
2. 在 `docs/handoff/CC-REPORT.md` 的“冲突”栏记录；
3. 等产品负责人确认后写入 `DECISIONS.md`。

## 协作角色

| 角色 | 默认职责 |
|---|---|
| 产品负责人 | 决定产品方向、取舍和是否进入下一张工单 |
| CC | 主要实现者，延续现有代码与产品上下文 |
| Codex | 独立审查、任务拆解、来源流水线设计、diff 与风险复核 |
| Subagents | 并行查源、找反例、跑统计；不修改正式内容 |

同一张工单同一时间只允许一个实现者。另一个代理做审核，不同时修改相同文件。

## 一张工单的生命周期

```text
ACTIVE.md 指定当前唯一任务
  → CC 填 CC-REPORT.md（影响分析，不编码）
  → Codex 只读复核并写 CODEX-REVIEW.md
  → 产品负责人确认取舍
  → ACTIVE.md 更新为实现工单
  → CC 实现一个小提交
  → Codex 审查 diff
  → CC 修复或完成
  → 下一张工单
```

## 产品负责人如何发消息给 CC

不需要复制长提示。当前阶段只需发送：

```text
请读取 docs/handoff/README.md 和 docs/handoff/ACTIVE.md，
按 ACTIVE.md 要求填写 docs/handoff/CC-REPORT.md。
本轮不要修改业务代码或内容数据，完成报告后停止。
```

之后每轮都以 `ACTIVE.md` 为准。

## 文件职责

- `ACTIVE.md`：当前唯一正在进行的任务。保持短小，旧任务完成后替换或归档。
- `DECISIONS.md`：已经确认的事实、规则、待决定事项。代理不能私自改产品决定。
- `ROADMAP-STATUS.md`：完整路线图的逐项核对/实现状态；防止把长期建议当成一次性施工任务。
- `CC-REPORT.md`：CC 的影响分析或实现交接，使用固定格式。
- `CODEX-REVIEW.md`：Codex 对当轮 CC 报告或 diff 的独立复核；不覆盖 CC 原报告。
- `IDEAS.md`：产品负责人的新想法停车场，不自动打断当前工单。
- `../ROADMAP-content-trust-structure-ui.md`：完整独立审查和长期路线图，不作为每轮必读上下文。

## Token 节省原则

- 先用 `rg` 找符号和相关段落，不通读无关文件。
- 不在多个 Markdown 重复粘贴完整审查；用标题链接和短摘要。
- 报告只写结论、证据位置、风险和下一步，不复述任务书。
- 动态数字由脚本生成；文档只保留本轮决策需要的少量基线。
- 一个问题一张工单，不一次把内容、UI、手账和重构全部装进上下文。
