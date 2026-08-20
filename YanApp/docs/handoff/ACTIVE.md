# 当前状态 · P0-1 Commit 1 已通过独立复核

> 状态：完成；当前无授权中的实现任务
>
> 实现者：CC
>
> 独立复核：Codex
>
> 更新日期：2026-08-20

第二版已由 Codex 独立复核通过：`npm test` 531/531、`npm run typecheck` exit 0，C1–C4 均关闭。`App.js` 与内容包未修改，Commit 2 尚未开始。

**现在停止，不执行下文的历史修订工单，也不自行开始 Commit 2。** 等 Codex/产品负责人另写 Commit 2 的独立任务书后再动数据。

下文仅保留本轮修订记录，已不再是待办。

## Codex 复核后必须修订

### 1. 修正 `hasEditorialDepth`

当前实现把 `{}`、`[]`、`new Date()` 都当成有 `wordField` 深度，测试还把 `{ members: [] }` 固化成 true。这不满足“editorial 字段为空与非空的边界”，也和运行时 `wordFieldsOf()` 只承认带 `sentence.jp` 的词场不一致。

修订口径：

- `coreChunk`：trim 后非空字符串；
- `wordField`：对象或数组中至少有一个词场条目，且该条目的 `sentence.jp` 是 trim 后非空字符串；空对象、空数组、日期对象、`{ members: [] }` 都是 false；
- `yanFeatures`：至少包含一个 trim 后非空字符串；`[]`、`[null]`、`[' ']` 都是 false；
- 这个函数仍不参与 publication 或真实性判断。

新增或改写测试，至少覆盖上述 true/false 边界。

### 2. 收紧 `canReviewWord` 的输入契约

调用点拿到的是 `normalizeProgress()` 输出，所以“既有 record”应表示非数组对象，而不是任意 truthy 值。当前 `Boolean(record)` 会把 `'corrupt'` 和 `[]` 当成已经学过。

- 将 `ProgressRecord` 从无约束 `unknown` 改成能表达“已归一化记录对象或空值”的类型；
- `null` / `undefined` / 字符串 / 数字 / 数组为 false；非数组对象为 true；
- 不按 `status`、`box` 或 `dueAt` 再做业务门槛，避免误伤旧的部分记录；
- 补测试：空对象 true（已有但字段不全仍保护），任意字符串和数组 false。

这条是 Codex 原工单对“错误字段形状安全 false”表达不够严，不算 CC 擅自偏离设计。

### 3. 删除会漂移的手写统计

从 production selector 与测试注释中删除 `4400 / 3037 / 716 / 645 / 563 / 19 / 544` 等当前快照数字。保留不随内容包变化的设计理由即可；动态计数属于迁移脚本/验收报告，不属于长期业务注释。

不要求删掉所有解释性注释，但应去除重复的审计史，避免一个约 40 行逻辑的 selector 长期携带另一份会过期的路线图。

### 4. 修正实现报告

- 实际行数是 `publication.ts` 176、测试 175，不是 178/165；
- “业务代码：无”改为“新增领域源文件，但零调用点、运行时行为无变化”；
- 明确普通 `git diff --stat` 看不到 untracked 文件，不能把空输出当作没有代码变更的证据；用 `git status`、`wc -l` 或 `git diff --no-index /dev/null <file>` 描述新增文件。

原有 17 条测试不得减少 publication、Learning/Dictionary 前置、例句独立、旧 record 保护等覆盖；允许重写 editorial 用例并新增 record 脏形状用例。

## CC 只需要读什么

1. 本文件；
2. `docs/handoff/CODEX-REVIEW.md` 的 §6（C1–C4）。

不需要重读 `DECISIONS.md`、`CC-REPORT.md` 旧章节、完整路线图、旧 handoff、JMdict、声调、UI、手账或世界相关文档。

## 允许修改的文件

- 新增 `src/features/wordbank/publication.ts`；
- 新增 `src/lib/__tests__/publication.test.mjs`；
- 在 `docs/handoff/CC-REPORT.md` 末尾追加本轮实现结果。

除此之外不修改任何文件。若测试基础设施要求改第三个文件，先停止并写报告，不自行扩大范围。

## 必须实现的纯函数

```ts
hasDictionaryShape(word)
isDictionaryEntry(word)
isLearnableWord(word)
hasEditorialDepth(word)
hasCompleteExample(word)
canIntroduceWord(word)
canReviewWord(word, record)
canGradeWord(word, record)
```

规则：

- `hasDictionaryShape`：`word`、`reading`、至少一个释义是非空字符串；只做结构判断；
- `isDictionaryEntry`：结构通过且 `publication.dictionary === true`；缺 publication 时 fail closed；
- `isLearnableWord`：必须先是 Dictionary，且 `publication.learning === true`；禁止出现 Learning 通过、Dictionary 失败；
- `hasCompleteExample`：日文、中文、罗马音均为非空字符串；与 publication 完全独立；
- `hasEditorialDepth`：只回答是否存在 `coreChunk`、`wordField` 或非空 `yanFeatures`，不冒充发布/核验；
- `canIntroduceWord`：等价于 `isLearnableWord`；
- `canReviewWord`：只由既有 `record` 决定，与 publication 无关；
- `canGradeWord`：可引入新词或已有 record 时为 true；
- 所有函数对 `null`、`undefined`、错误字段形状安全返回 false，不抛异常；
- 字符串完整度用 `trim()` 后判断。

## 最低测试矩阵

1. 字段齐全但无 publication：Dictionary/Learning 都 false；
2. `dictionary: true` 但结构坏：Dictionary false；
3. `learning: true` 但 Dictionary 不成立：Learning false；
4. Dictionary true、Learning false：可查但不可引入；
5. Dictionary/Learning 都 true：可引入、无旧 record 也可评分；
6. dictionary-only、无 record：不可评分；
7. dictionary-only、有 record：可复习、可评分；
8. 三项例句齐全与 publication 无关；只缺任一项或只有空白字符都不完整；
9. editorial 字段为空与非空的边界；
10. null/undefined/错误数组或对象形状不抛。

## 验收命令

```bash
npm test
npm run typecheck
```

如果仓库已有与本工单无关的基线失败，记录完整命令、失败测试和判断依据，不顺手修。

## 明确禁止

- 不修改 `App.js`，不接任何 selector；
- 不修改 `assets/content.fallback.json` 或 `../yan-content/content.v2.json`；
- 不写迁移脚本；
- 不重命名 `showDrafts`；
- 不修改 `WBDetailPage`、`grade()`、session 或 UI 文案；
- 不处理 `openMember` 注释与跨级行为；
- 不开始 Commit 2/3；
- 不顺手重构或格式化无关文件。

## 完成后报告

在 `CC-REPORT.md` 末尾追加“Commit 1 修订”：逐条回答 `CODEX-REVIEW.md` 的 C1–C4，写测试命令与结果，并给出能覆盖 untracked 文件的变更摘要。然后停止，等待 Codex 独立复核。
