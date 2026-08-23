# 工单 · PLAN v2 第一批（commit 1–6）

> 上位文件：`docs/PLAN-execution-2026-08-22.md`
> 本工单只覆盖第一批六个 commit，**全部不碰 `assets/content.fallback.json`**。
> 内容窗口（commit 7–11）是下一张工单，本轮不做。

## 先读（按顺序，不要跳）

1. `docs/PLAN-execution-2026-08-22.md` —— 三条线、文件锁、提交顺序（**主文件**）
2. `docs/AUDIT-source-trust-2026-08-22.md` §3 —— 每处失真的实测数字
3. `docs/AUDIT-replan-2026-08-22.md` §0 —— 仓库已有能力清单（**避免重做已存在的东西**）
4. `docs/HANDOFF-learning.md` §四「这个项目的几条硬规矩」
5. `src/features/wordbank/publication.ts` 顶部注释 —— fail closed 与「换个字段再猜一次」

## 三个 subagent（可同时开，文件不重叠）

### Agent A · S 线（三个 commit，串行做完）

**A1 `fix(wordbank): 文案不再宣称高频与官方 JLPT`**
- 文件：`App.js` 1741-1745、2151，加一处来源说明入口
- 「基础词书 · 高频词块 · 例句」→ 去掉「高频」（6642 条 `coreChunk` 是空字符串，这个词是假的）
- `JLPT {level} · N 可查 · N 可学习` → `{level} 学习分级 · …`
- 来源说明**逐字引用** `_meta.wordBankSources` 里的 `scope_note`（`"not an official JLPT list"`）与 `source_url`，**不要自己改写**
- 验收：`grep -rn "高频\|官方\|必考" App.js` 在描述词库处无命中；来源说明两步可达

**A2 `feat(wordbank): 释义可信度改用显式字段`**
- 新增 `src/features/wordbank/meaningTrust.js` + `src/lib/__tests__/meaningTrust.test.mjs`
- `meaningTrust(word)` → `'machine_drafted' | 'human_reviewed' | 'editorial_published'`
- 读显式的 `meaning_zh_status` 字段；**缺字段 fail closed 返回 `machine_drafted`**
- **取值集合里不允许出现 `source_verified`**，用测试锁死
- `App.js:2195` 一带的「仅词典」标记改读它；用户侧文案是人话，**不出现 `zh_drafted` 等内部词**
- 本轮**不给内容包批量加字段**（那是内容窗口的事）

**A3 `fix(learn): freq 正名，raw_substring 降权`**
- 文件：`src/features/learn/dailyTask.ts` + `src/lib/__tests__/dailyTask.test.ts`
- 事实：`freq.source` 8005 条全是 `tatoeba`（例句库，不是均衡语料）；`method === 'raw_substring'` 的 338 条会误计（「愛」把「恋愛」算进去）；`df === 0` 的 420 条是「Tatoeba 里没有」不是「罕用」
- 做：措辞与注释改为「例句库出现次数」；`raw_substring` 那批在排序里降权或排除；保留 `df=0` 与 `df=null` 的语义差别（**代码里已经区分，别改回去**）
- **不换语料、不接 BCCWJ、不改排序算法结构**
- 验收：新增两条测试；`dailyTask.test.ts` 原有用例全绿（今日任务不回归）

**A4 `fix(pitch): 含维基的双源按单源提示 + lineage 登记`**
- 文件：`src/features/wordbank/PitchLine.js`、`staging/source-audit/sources.v1.json`、`docs/handoff/DECISIONS.md`
- 背景（已查完，不要重查）：`staging/pitch-confidence.json` 逐条记着 `srcs`。agree=2 里 6549 条是 UniDic+kanjium（lineage 根不同，**双源成立，不动**）；**kanjium+维基 23 条、UniDic+维基 17 条存疑**（Wiktionary 声调常转录自辞书，可能与 kanjium 同上游）
- 做：扩充**已存在的** `pitchUnconfirmed()` 判据 —— `agree===1` **或** srcs 含维基且 agree===2；名单从 `staging/pitch-confidence.json` 生成，**不改内容包的 `pitch` 字段**
- 顺带把 UniDic / kanjium / 维基三条 lineage 登记进 registry
- 验收：`pitch.test.mjs` 新用例；6549 条 UniDic+kanjium 的显示**逐像素不变**

### Agent B · L 线（一个 commit）

**B1 `feat(wordbank): 场景词选择器（纯函数）`**
- 新增 `src/features/wordbank/sceneWords.js` + `src/lib/__tests__/sceneWords.test.mjs`
- `sceneWordsOf(wordBank, sceneId)`、`scenesOfWord(word)`；只认 `publication.learning === true` 的词
- **不接任何 UI，不改 `App.js`** —— UI 接线是 commit 12，不在本轮
- 验收：测试覆盖「`daily` 不算场景」「未发布词被过滤」「无该场景返回空数组」
- 注意：`tags.scene` 是 **product_taxonomy**，不需要 evidence，不进 claim/evidence 流程

### Agent C · W 线（一个 commit）

**C1 `chore(content): 内容统计脚本`**
- 新增 `scripts/content-stats.mjs`，**只读，不写任何文件**
- 这是旧 ROADMAP 工作包 0 的欠账：两份 audit 里的数字全是手算的，至今没有一条命令能重跑
- 输出至少：词条总数、`level` 分布、`status` 分布、`tags.scene` 各标签计数（区分「有效标签」与 `daily`）、`exampleJp`/`coreChunk`/`jmdictSeq`/`pitch`/`wordField` 覆盖率、`freq.method` 与 `freq.df===0` 计数、`pitch.agree` 分布、`publication.dictionary`/`learning` 计数、`kanji_anchor` 池大小及其字段完整度
- **必须打印已知差异**：`_meta.note` 说 8026 而实测 8005（差 21）；`staging/pitch-confidence.json` 里 agree=0 是 20 条而 commit 81efe21 说 15 条（差 5）
- 验收：一条命令可重跑；数字与两份 audit 对得上；对不上的地方明确打印出来

## 硬性限制（每个 agent 都适用）

- **不许顺手重构**。看到烂代码记在报告里，不要改。
- **不拆 `App.js`**（那是 ROADMAP 工作包 5，P2）。
- 不改 `srs.js` 评分逻辑、不改 `units.js`、不改 `publication.ts` 结构、不改 `contentSchema.ts`。
- **不改进度键格式**：`unitKey('word', …)` 保持裸的 `词-读音`，改了等于所有人进度归零。
- **本批任何 commit 都不许碰 `assets/content.fallback.json`。**
- 不删除：词书搜索、全量词库入口、「仅词典」标记、五本词书入口、四个筛选、地铁 5 站、其余 5 个场景、世界打卡/手账/分账、五十音。
- 用户可见文案里不出现 `candidate` / `draft` / `zh_drafted` / `verified`。
- 新增的可信度判断一律 **fail closed**：缺字段返回最保守值，不返回「可以」。
- 新增纯函数一律配 `src/lib/__tests__/` 下的测试，跟着 `npm test` 跑，**不新增测试框架**。

## 每个 commit 的完成标准

```bash
npm test && npm run typecheck
```

两条都绿才算完。commit message 写**为什么**，不是写改了什么（`HANDOFF-learning.md` 硬规矩第 5 条）。

## 做完之后写哪里

1. **`docs/handoff/ACTIVE.md`** —— 覆盖成本轮状态：当前工单是本文件、六个 commit 各自的完成情况、还剩什么、下一步是内容窗口。
2. **`docs/handoff/CC-REPORT.md`** —— 追加一节「PLAN v2 第一批」，写：
   - 每个 commit 的实际改动范围与 commit hash
   - **`content-stats.mjs` 的首次输出全文**（这是以后所有对比的基线）
   - 遇到的与 plan 不符的事实（plan 里的数字是我实测的，但只测了本地 fallback；对不上就以你实测为准并写清楚）
   - 你想改但**忍住没改**的地方（留给后续工单，不要顺手做）
3. **`docs/handoff/DECISIONS.md`** —— 只写 A4 的声调 lineage 结论，附可复算依据。

## 不要做的事

- 不要开始内容窗口（commit 7–11），那需要 `_meta.version` 递增与远端内容包发布，是另一张工单。
- 不要扩 `publication.learning` 的池子（563 条不变），扩池是产品决定。
- 不要为了让统计脚本好看去改数据。
- 不要在报告里用「已验证」形容只是「跑通了」的东西。
