# 当前状态 · P2-2A 来源审计输出契约

> 状态：已完成，本地提交待推送
>
> 当前工单：`docs/handoff/TICKET-source-audit-implementation.md`
>
> 更新日期：2026-08-20

P0-1、P2-1 与 P0-2 已完成并推送。P2-2A 只定义来源注册表、字段 claim、evidence、run manifest 与自动分流规则，解决“模型反复查、内容反复漂”的协作接口问题。

分工：

- Codex：已完成纯 schema、CLI、JMdict 历史重锁样本与验收；已补 CLI/claim 闭集、无归档降级与 run 脚本 SHA 校验；
- CC：已完成两轮独立 diff 复审，无阻塞项；
- 同一文件同一时间仍只允许一个实现者。

禁止事项：不修改内容包、`publication`、App 页面、例句 token、假名、声调或评分逻辑；不下载/抓取新来源；不把 AI 输出视为真实性来源；不启动 P2-2B span 或 P2-2C usage。

本轮改动只包含纯 schema、只读 CLI、测试、JMdict 许可/归属快照与 `staging/source-audit/` 的最小注册/运行样本；不改内容包、`publication`、App、UI、声调或例句。复审已确认：`export-claims`/`summarize` 均不能绕过 validator；claim/evidence 闭集隔离 `publication`；缺失本地归档稳定派生 `incomplete`；run 脚本 SHA 会实测比对。
