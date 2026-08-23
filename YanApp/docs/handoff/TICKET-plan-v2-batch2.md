# 工单 · PLAN v2 第二批（内容窗口 commit 7–9 + 一次远端发布）

> 上位文件：`docs/PLAN-execution-2026-08-22.md`
> 前一批：`docs/handoff/TICKET-plan-v2-batch1.md`（已完成，六个 commit）
>
> **本批要动 `assets/content.fallback.json`。它是全局互斥锁：同一时间只能有一个执行者持有，
> 三个 commit 严格串行，窗口结束后统一发一次远端包。**

## 与 plan v2 的一处调整（已确认）

plan 里内容窗口原本是五个 commit（S-T5 / W-T2 / W-T3 / W-T4 / L-T1）。
**W-T3（释义人工审）与 W-T4（词场撰写）从本窗口移出** —— 它们卡在人工判断上，不是卡在实现上，
放在同一个窗口会让整个窗口和后面的 L 线一起等在人工环节。

本批因此是：**S-T5 → W-T2 → L-T1 → 发布**，另加一个不碰内容包的 W-T3/W-T4 备料 commit。

## 先读

1. `docs/PLAN-execution-2026-08-22.md` §2C、§3.2、§4（三条线、内容包锁、提交顺序）
2. `docs/handoff/CC-REPORT.md` 的「PLAN v2 第一批」统计基线 —— **本批每个 commit 前后都要和它对比**
3. `docs/HANDOFF-learning.md` 的「附:发版流程」第 2 步（内容必须早于 App 上架）
4. `docs/AUDIT-source-trust-2026-08-22.md` §3（每处失真的实测数字）

## 已经查过的事实，不要重新推导，也不要靠猜

| 事实 | 数字 | 含义 |
|---|---|---|
| 8 张深卡里的词源断言 | **只有 1 条**：`wordCards.order.notes.es`（「源自拉丁 petere…appetite、petition 同根」） | S-T5 比预想小得多 |
| 便利店已标词 | 23 条，其中 **可学 15 / 仅词典 8** | 见下方「决策分叉」 |
| 「仅词典」的那 8 条 | コンビニ・レシート・いくら・ごみ・充電・デパート・ホテル・かかる | **最像便利店的词恰恰不可学** |
| 563 主线池带有效场景标签的 | 116 条 | 场景标注不是从零开始 |
| 主线池缺 `jmdictSeq` | **544 / 563（96.6%）** | W-T2 的全部工作量 |
| 主线池四项字段全齐的 | **19 / 563** | 别被「例句 100%」骗了 |
| 用子串从场景句里抽词 | 14 命中里多数是假命中（絵・九・五・四・下・千・手・戸・歯・目） | **禁止用子串抽词**，见 L-T1 |

## Commit 7 · S-T5 深卡词源止损

- 文件：⚠️ `assets/content.fallback.json` 的 `wordCards`（**只动这个顶层键**）
- 范围：只有 `order.notes.es` 一条。其余 7 张卡的 notes 已核，无词源断言，**不要顺手改它们**
- 做二选一：
  - 有权威可定位来源（词源辞典/历史辞书/论文，能定位到条目）→ 补 `source` 字段
  - 否则 → 改成记忆联想的语气（「可以这样记」而非「源自」），不作为事实词源发布
- 同时新建一份简短 SOP：`etymologyClaim`（事实词源，高门槛）与 `memoryStory`（学习联想，不是事实）怎么分开写。放 `docs/` 下，与 `content-standard-wordfield.md` 同级
- 验收：`node scripts/content-stats.mjs` 与基线一致（这条改动不影响任何统计）；`npm test` 全绿
- 回滚：单 commit revert

## Commit 8 · W-T2 主线池回锁 jmdictSeq

- 文件：⚠️ `assets/content.fallback.json`（**只加 `jmdictSeq` 字段，不改任何其他字段**）+ `staging/` 下的新报告
- 输入：`staging/jmdict-eng-3.6.2.json`
- 对象：563 条 `kanji_anchor` 主线池里缺 `jmdictSeq` 的 544 条。**不做全库回锁**
- **join 规则：按「词面 + 读音」精确匹配，不是词面单独。** 这条是 commit `bff04fc` 的教训（当时按词面查，无从印证的从 1403 降到 661），别再踩一次
- 产出三类报告写进 `staging/`：**自动通过 / 冲突（一个词面读音对上多个 seq，或对不上）/ 未命中**
- **只把「自动通过」那批写进内容包。冲突与未命中留在报告里，不猜、不选「看起来最像的那个」**
- 验收：
  - `content-stats.mjs` 的 `kanji_anchor.missing.jmdictSeq` 明显下降，**其余所有数字不变**（尤其 `publication.learning` 必须仍是 563）
  - 报告里三类数量加起来等于 544
  - `npm test && npm run typecheck` 全绿
- 回滚：单 commit revert

## Commit 9 · L-T1 便利店场景词绑定

- 文件：⚠️ `assets/content.fallback.json`（`scenes[convenience]` + 相关词的 `tags.scene`）、`scripts/validate-content.js`
- 做三件事：
  1. 便利店 10 句 + 2 段 miniDialogue，每句加 `core_vocab: [wordId]`
  2. 目标 **30–40 条**便利店场景词：在已有 23 条基础上补。**`tags.scene` 追加 `convenience`，保留 `daily`，不是替换**
  3. `validate-content.js` 加校验：`core_vocab` 的每个 id 必须存在于 `wordBank`
- **选词方法**（重要）：
  - **禁止用子串匹配从句子里抽词** —— 已实测会踩和 `freq.raw_substring` 同一个坑
  - 正确做法：按「一个人在便利店真的会用到」逐个挑，挑完再确认它在 `wordBank` 里有对应 id
  - 宁可 30 条准的，不要 40 条掺水的。**不把所有词都塞进便利店**
- **`tags.scene` 是 product_taxonomy**：不需要来源、不需要证据、不进 claim/evidence 流程。不要给它做 source-audit
- **绝对不做**：不给任何词改 `publication`。可学的仍是 563 条，一条不多一条不少
- 验收：
  - `node scripts/validate-content.js` 通过
  - `content-stats.mjs`：`tags.scene.effective.convenience` 到 30–40；**`publication.learning` 仍是 563**；其余数字不变
  - `units.test.mjs` 全绿（场景句仍进复习队列）
  - 手动：丿 → 出发前 → 便利店，10 句 + 2 段对话正常渲染
- 回滚：单 commit revert

## 🚀 发布（三个 commit 都绿之后，一次做完）

1. `_meta.version` 递增（**整个窗口只递增一次**），`_meta.changelog` 追加本次三条改动
2. 按 `HANDOFF-learning.md` 的发版流程第 2 步发布远端内容包
3. **真机拉到新包后验证**：便利店场景正常、词书正常、复习队列数量没掉
4. 把发布结果写进 `ACTIVE.md`

**改了本地 fallback 但没发远端 = 线上用户看到的还是旧包，而本地测试全绿。这是最容易骗过自己的一种「已完成」。**

## Commit 10 · W-T3 / W-T4 备料（**不碰内容包**）

这两件事最终要人工拍板，本批只备料，产物一律进 `staging/`，**不写内容包**：

- **W-T3 备料**：便利店那 30–40 条的中文释义对照表 → `staging/`。每条列出：现有 `meaning_zh`、JMdict 英文 gloss、你认为可疑的点。**只标记疑点，不改释义**
- **W-T4 备料**：从便利店那批里挑 8–10 条做词场候选 → `staging/`。必须过 `auditWordFields()` 的机器校验（成员必须真的出现在句子里）。**标明这是 candidate，日语自然度未经母语者确认**
- 验收：两份文件在 `staging/`，内容包零改动，`content-stats.mjs` 与发布后一致
- 这个 commit 可以和上面三个并行做（它不碰内容包），但**报告里要写清楚它是候选，不是已审**

## 不变量（每个 commit 都要守）

- 不改 `publication` 结构，不改 `publication.learning` 的成员（563 条）
- 不改 `contentSchema.ts`（新增的都是可选字段，不需要过形状闸门）
- 不改进度键格式（裸的 `词-读音`）
- 不改 `srs.js` / `units.js` / `publication.ts`
- **不动 `pitch` 字段**。`src/features/wordbank/pitch.js` 里有一份 40 条硬编码的维基双源名单，它依赖当前 `pitch` 数据；本批不碰 pitch，但如果发现任何 pitch 相关改动，停下来说明
- 不拆 `App.js`，不许顺手重构
- 用户可见文案不出现 `candidate` / `draft` / `zh_drafted` / `verified`
- 不删除第一批工单里列的任何旧功能

## 一个需要你回答、但**本批不必解决**的分叉

便利店最核心的 8 个词（コンビニ・レシート・いくら・ごみ・充電・デパート・ホテル・かかる）现在是「仅词典」，不在 563 可学池里。
于是「场景词」视图会出现一个问题：用户在便利店场景里遇到 コンビニ，回词书却找不到它。

三条路：(a) 扩池，把这 8 条放进 `publication.learning`；(b) 场景词视图两段式，可学的在前、仅词典的在后并保留标记；(c) 场景词就只有可学的那些。

**本批不要决定，也不要顺手实现任何一条。** 它属于 commit 12（L-T2b 词书视图），到时候由项目所有者拍板。
本批只管打标签，标签打了三条路都能走。**在报告里把这个分叉再提一次，不要让它被默默决定了。**

## 做完写哪里

1. `docs/handoff/ACTIVE.md` —— 覆盖成本轮状态：三个 commit + 发布结果 + 备料产物 + 下一步是 commit 12–15
2. `docs/handoff/CC-REPORT.md` —— 追加「PLAN v2 第二批」，必须包含：
   - **每个 content commit 前后的 `content-stats.mjs` 输出对比**（哪些数字变了、变成多少、为什么）
   - W-T2 的三类报告数量与结论
   - L-T1 最终选了哪 30–40 个词、为什么（选词理由，不是列表就完了）
   - 远端发布是否已完成、真机验证结果
   - 上面那个分叉的重述
   - 你想改但忍住没改的地方
