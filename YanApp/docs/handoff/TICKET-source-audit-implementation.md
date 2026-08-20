# 工单 · P2-2A 实现：来源审计 schema 与只读 CLI

> 状态：已实现并经 CC §79 独立审通过
>
> 前置：`TICKET-source-audit-contract.md` 已经 CC 复核通过；本工单只落实其 v1 契约，不生产或迁移内容。

## 目标

交付一个本地、可重复运行的最小来源审计底座：验证 source registry、claim、evidence、run manifest；导入/导出外部模型审核包；用一个重锁后的 JMdict identity/reading 样本证明输入与许可链可追溯。

它的输出只能是 staging 报告与状态，不得写入内容包、`publication` 或 App 运行时数据。

## 允许修改

- 新增 `src/lib/sourceAudit.ts`：零 Expo/RN/React 依赖的纯 schema、裁决和诊断函数；
- 新增 `src/lib/__tests__/sourceAudit.test.ts`；
- 新增 `scripts/source-audit.mjs`：只读 `validate` / `summarize` / `export-claims` / `import-evidence` CLI；
- 新增 `docs/sources/jmdict-notice.md`：JMdict/EDICT 的许可与归属快照，附官方 URL、取得日期、适用范围；
- 新增 `staging/source-audit/sources.v1.json`、一个 `claims/` 样本、一个 `runs/` 样本及自动生成的 `reports/` 摘要。
- 更新本工单、`ACTIVE.md`、`ROADMAP-STATUS.md`、`CC-REPORT.md`。

## 禁止修改

- `assets/content.fallback.json`、远端内容包、`publication.ts`、内容迁移脚本；
- `App.js`、任何页面、词书、评分、SRS、例句 token、假名、声调 UI 或数据；
- 既有 `pitch.agree` 与 `staging/pitch-confidence.json`；
- 批量拉取、爬取、生成或重写词条、例句、中文释义、搭配、span、词源；
- 自动创建 Git 提交或推送。

## 实现形式

### 1. 纯核心

`sourceAudit.ts` 至少导出：

```ts
validateRegistry(value, options)
validateClaims(value, registry)
validateEvidence(value, claims, registry)
validateRunManifest(value, registry)
resolveClaim(claim, evidence, registry)
```

每个函数返回 `{ ok, errors, warnings, value? }`；错误只给 JSON path、规则与 ID，不输出词条全文或来源大段文本。

source validator 必须**派生**、而不是相信输入中手写的 eligibility：

| eligibility | 规则 |
|---|---|
| `eligible` | artifact（path/kind/bytes/SHA）、`retrievedAt` 或 `relockedAt`、归属、许可和本地 `noticePath` 全部有效；`redistribution` 不是 `research-only` |
| `research-only` | 许可或上游限制声明为 research-only，即便其它元数据齐全 |
| `incomplete` | 上述完整性条件任一缺失或本地 noticePath 不存在 |

`lineage` 必须是非空字符串数组，`familyId === lineage[0]`。同 root lineage 永远不算两源；mirror/fork/repackaging 的认定在 registry 注册时由受控审查写进 lineage，代码不假装从任意两个 JSON 自动推断中途数据依赖。

v1 evidence 必须 `additionalProperties: false`。允许键严格限定为：`schemaVersion`、`evidenceId`、`claimId`、`sourceId`、`locator`、`relation`、`observed`、`rights`、`method`、`producer`、`createdAt`。出现任何额外键（包括 `publication`、`learning`、`dictionary`、`verified`）都隔离。

`editorial_*` 与 `authored_example` claim 必须带 `{ author: { kind, id } }`。`corpus_example` evidence 必须有定位、`rights.license`、非空 `rights.attribution` 与作者。

裁决顺序固定：无效/不合格 evidence 忽略并报告 → 任何有效 `contradicts` → `conflict` → 再判 `supported` / `corroborated` / `candidate`。`research-only`、`incomplete`、未注册来源都不能贡献支持数。任何返回状态都不得含 publication 写入建议。

### 2. 只读 CLI

CLI 不接受输出内容包路径；所有输出只能在指定的 `staging/source-audit/` 目录。命令必须先完整验证输入，再原子写报告；验证失败时不覆盖任何已有 evidence、registry 或报告。

```text
node scripts/source-audit.mjs validate --registry <file> --claims <file> --evidence <file> --run <file>
node scripts/source-audit.mjs summarize --registry <file> --claims <file> --evidence <file> --run <file> --out <staging-report>
node scripts/source-audit.mjs export-claims --registry <file> --claims <file> --out <review-package>
node scripts/source-audit.mjs import-evidence --input <external-json> --claims <file> --registry <file> --out <staging-evidence>
```

`export-claims` 只能输出 claim 所需的词头/读音/字段/候选值和允许来源标识；`import-evidence` 只能写新 staging evidence，经同一 validator 验证。外部模型名只能进入 `producer`，绝不进入 `sourceId`、`familyId` 或支持数。

### 3. 最小真实样本：JMdict 历史重锁

registry 中只加入一个来源：`jmdict-simplified:3.6.2+20260803141815`。

- artifact 是 `staging/jmdict-eng.json.tgz`，`kind: source-archive`；
- 验收时重新计算 SHA-256 `2fb280ac1737161795f4bce157466f69c7e51a50aa6a3353ac59ca06a2e07c5f` 与字节数 `11475164`；
- `retrievedAt: null`，使用真实的本轮 `relockedAt`，不伪造 2026-08-03 下载时间；
- `docs/sources/jmdict-notice.md` 必须是本地许可/归属快照，不复制整部词典；
- 一个 claim 只验证现有词 `n3_aizu` 的 identity/reading 与 `jmdictSeq: "1284930"`，一个 evidence 以 entry locator 支持它；不写回该词条。

run manifest 至少锁定：run ID、运行时间、工作区基准 commit 与脚本内容 SHA（避免未提交脚本假装已在某 commit）、Node 版本、输入 registry/claims/evidence 的 SHA、每个 source artifact SHA、输出报告路径与摘要统计。动态统计只能由 CLI 写入报告。

## 必须新增的测试

1. 真实 JMdict registry + noticePath + archive SHA/字节通过并派生 `eligible`；
2. 缺 SHA、缺时间且无 relockedAt、缺 noticePath 分别为 `incomplete`；
3. `research-only` 即使字段齐全也不能贡献 `supported`；
4. `familyId !== lineage[0]`、空 lineage 拒绝；同 root lineage 的两条 support 不得变成 `corroborated`；
5. editorial claim 缺 author 拒绝；
6. evidence 的未注册 source、空 locator、额外字段、`publication` 字段均隔离；
7. corpus evidence 缺作者/许可/attribution 任一隔离；
8. 一个有效 contradiction 优先于两个 eligible supports；
9. producer 是两个不同模型、但 source 同一来源时不算双源；
10. no evidence / 全部不合格 evidence 均为 `candidate`，无 publication 建议；
11. CLI 的 validate、summarize、export/import 均不写内容包；导入失败不覆盖已存在 staging evidence；
12. run manifest 的输入 SHA 与实际文件漂移时失败。

## 开工与验收

开工前必须记录 `git status --short`、`npm test`、`npm run typecheck`；基线非绿即停止。实现后运行完整测试、类型检查、`git diff --check`，并额外运行四条 CLI 命令。对第 4、6、8、11 条做篡改验证并还原。

完成后由 CC 只审 diff：是否存在绕过 pure validator 的 CLI 路径、eligible 派生是否真检查本地 notice/artifact、外部模型是否能通过任意字段影响来源独立性或 publication。通过前不提交。

## 实现记录（2026-08-20）

- 基线：`npm test` 562/562、`npm run typecheck` 通过；
- 新增纯 `src/lib/sourceAudit.ts`、10 条领域/CLI 测试、只读 `scripts/source-audit.mjs`、JMdict 许可快照与一个 identity/reading 历史重锁样本；
- 实测 archive SHA 为 `2fb280ac…e07c5f`、字节数 11,475,164，与旧 join report 一致；样本只输出 staging `supported`，`publication: null`；
- 初次完整验收：`npm test` 570/570、类型检查、四个 CLI 命令、`git diff --check` 均通过；
- 篡改验证已做并还原：跳过 `research-only` 限制、跳过 evidence 额外字段拒绝、跳过冲突优先，各至少使一条测试失败；
- `staging/` 全局被忽略；提交时只允许 `git add -f` 本工单列出的 5 个 source-audit 样本，不得把现有 staging 工件批量纳入。

### CC §73–§78 复审前修订

- `export-claims` 改为先验证 registry 与闭集 claim；`summarize` 改为同样要求 run manifest、输入 SHA 与所有已用 evidence 的 `eligible`；
- claim 与 evidence 都是闭集对象；任何 `publication` 等额外字段都不进入导出包；坏 claim 不留在 validator 返回值；
- eligibility 没有文件探针或本地 archive 时稳定派生 `incomplete`，真实 JMdict 测试不再因缺少本机归档抛 `ENOENT`；
- policy 要求两个独立家族但只有一个时是 `candidate`，不会被固化为 `supported`；无资格反证会进入 diagnostics 并阻止 `corroborated`，但不伪装为有效 conflict；
- CLI 同时比对 run 中的 `scriptContentSha256` 与当前脚本，防止未提交脚本假装由基准 commit 运行；复审前最终验收为 `npm test` 572/572、`npm run typecheck` 通过、`git diff --check` clean。
