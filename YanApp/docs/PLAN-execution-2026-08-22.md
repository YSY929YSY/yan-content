# 言（YAN）执行计划 · 2026-08-22（v2）

> 承接 `docs/AUDIT-replan-2026-08-22.md` 与 `docs/AUDIT-source-trust-2026-08-22.md`。
> 旧 plan（`CLAUDE.md` / `ROADMAP-content-trust-structure-ui.md` / `HANDOFF-learning.md` / `docs/handoff/*`）**不删除、不覆盖**。
> **本轮只写 plan，不改代码。**

## v2 改了什么（v1 的两个问题）

1. **v1 把三条线排成了一串 11 个 commit，与审计里「S0 与 P0 可并行」自相矛盾。**
   修正：**并行的是代码线，串行的是内容包。** 代码改动三线并行（不同文件，可分给 Codex 的不同 subagent）；`assets/content.fallback.json` 是全局互斥锁，排成一个「内容窗口」串行做完，窗口结束**一次**远端发布。
2. **v1 没有把新 plan 挂回旧 plan。** 修正：见第 1 节 —— 这份 plan 不是新方向，**它就是旧 ROADMAP 工作包 3 + 工作包 7 的执行细化**。
3. **新增 W 线（词，继续推进）。** 你的要求是「一边推进一边核准确性」，v1 把词线整个冻结了，过严。修正见第 2 节 C。

---

## 1. 与旧 plan 的关系（这份 plan 不是替代，是接续）

`ROADMAP` 第 7 节的八个工作包，现在的真实状态：

| 旧工作包 | 状态 | 本轮怎么处理 |
|---|---|---|
| **工作包 0**：只测量，不改行为 | ⚠️ **部分未交付** —— 两份 audit 里的数字全是我手算的，「一条命令重跑的统计脚本」**至今不存在** | **W-T1 补上**，这是「一边核准确性」的基础设施 |
| **工作包 1**：内容发布契约 | ✅ 已完成 | `publication.ts` 两层布尔 + fail closed，本轮**不动结构** |
| **工作包 2**：来源注册表与 release gate | ✅ 主体完成（P2-2A） | 只补 S-T2 的三条 lineage；P2-2B/2C 暂停 |
| **工作包 3**：学习入口诚实化 | ⚠️ **剩余项就是 S 线** —— 「产品文案修正」「首页来源统计修正」没做完 | **= 本轮 S 线**（S-T1/T3/T4） |
| **工作包 4**：手账数据安全 | 冻结 | 本轮完全不碰 |
| **工作包 5**：按屏幕拆 `App.js` | P2 | 本轮**明令禁止**顺手做 |
| **工作包 6**：拆小本子/分账 | 冻结 | 本轮完全不碰 |
| **工作包 7**：**30 个标杆词与一个场景闭环** | 未开始 | **= 本轮 L 线 + W 线**。旧 plan 写的交付物就是「30 个三层内容完整的词 + 1 个从场景学习到复习的闭环 + 5 名用户可理解性测试」 |

**所以结论是**：本轮不是推翻旧 plan，是**终于开始做旧 plan 里最后一个、也是最重要的那个工作包**。前面六个要么做完了、要么被明确冻结。

同样从 `CLAUDE.md` 继承下来、本轮**继续有效**的：

- 「先把功利腿做扎实，灵魂才有地基可站」→ 词库与复习是功利腿（已扎实），场景与口袋是灵魂腿站上去的第一步。
- 「好的分类是记忆的基础」→ 这正是 L-T1 给便利店词打真标签在做的事。
- 「汉字跨语言记忆锚」→ 主线池 563 条全是 `kanji_anchor`，本轮不扩，但要**给它补回锁**（见 W-T2）。
- 「现实激活机制」→ L-T5「复习卡回到场景」就是它的最小实现。
- 排队中的世界打卡 v1 / 虚拟形象 / 西语，按你的裁决**继续排队，不提前**。

---

## 2. 三条线

### 总体禁止（任何 commit 出现即为越界）

不重做今日任务 · 不重做 SRS · 不重做三 Tab · 不拆 `App.js` · 不重写场景系统 · 不做云朵 IP · 不做虚拟形象 · 不做记忆宫殿 · 不做观鸟/番茄 · 不做多语言 · 不做全量 N1 精修 · 不做 P2-2B/2C。

四条硬约束：**不改进度键格式**（`词-读音` 裸键）· **不向用户展示 `candidate/draft/zh_drafted/verified`** · **`tags.scene` 是 product_taxonomy，不走 evidence** · **fail closed**（缺字段返回最保守值）。

---

### A. S 线 —— 用户侧表达止血（= 旧工作包 3 剩余）

| 编号 | 任务 | 文件 | 目的 | 验收 | 回滚 | 碰内容包 |
|---|---|---|---|---|---|---|
| **S-T1** | 词书文案下架 | `App.js` 1741-1745 / 2151 + 一处来源说明 | 「高频词块」宣称了高频（无语料证据）与词块（6642 条为空串）；`JLPT N5` 把社区词表说成考试事实，而 `_meta` 里写着 `not an official JLPT list` | grep 无「高频/官方/必考」描述词库；来源说明两步可达，文案**逐字引用** `scope_note` 与 `source_url` | revert | ❌ |
| **S-T2** | 声调 lineage 登记 + 40 条降级 | `PitchLine.js`、`sources.v1.json`、`DECISIONS.md` | 见第 5 节：6549 条 UniDic+kanjium 双源成立；含维基的 40 条存疑，按单源提示 | `pitch.test.mjs` 新用例；6549 条显示逐像素不变 | revert | ❌ |
| **S-T3** | 释义可信度不再从 `status` 猜 | 新增 `meaningTrust.js` + 测试；`App.js:2195` | `publication.ts` 顶部警告的复发模式「换个字段再猜一次」正在发生 | 缺字段 fail closed → `machine_drafted`；**取值不允许 `source_verified`**（测试锁死）；`App.js` 无 `zh_drafted` 判据 | revert | ❌ |
| **S-T4** | `freq` 正名 | `dailyTask.ts` + 测试 | `freq.source` 8005 条全是 `tatoeba`；338 条 `raw_substring` 会误计；420 条 `df=0` 是「Tatoeba 没有」不是「罕用」 | 新测试：`raw_substring` 不参与「更常用」判断；`dailyTask.test.ts` 原有用例全绿 | revert | ❌ |
| **S-T5** | 深卡词源止损 | ⚠️ `content.fallback.json` 的 `wordCards` | `notes.es` 已在线上发布词源断言（petere / appetite）而无来源。8 张卡现在改，比 300 条以后改便宜 | 8 张逐条过；有权威可定位来源的补 `source`，其余改成「可以这样记」；写一份 `etymologyClaim` vs `memoryStory` SOP | revert + 回滚远端包 | ✅ **窗口内** |

**S 线全部不需要新证据，只改表达。**

---

### B. L 线 —— 便利店学习闭环（= 旧工作包 7 的「场景闭环」半边）

| 编号 | 任务 | 文件 | 目的 | 验收 | 回滚 | 碰内容包 |
|---|---|---|---|---|---|---|
| **L-T1** | 便利店场景词绑定 | ⚠️ `content.fallback.json`（`scenes[convenience]` + 约 35 词 `tags.scene`）、`validate-content.js` | 8005 条里 7985 条 `tags.scene` 是 `daily`，便利店只有 23 条 —— 联动缺的是标注不是架构 | 校验通过；场景词 30–40；`tags.scene` **加 `convenience` 并保留 `daily`**；无新词进 `publication.learning`；`units.test.mjs` 全绿 | revert + 回滚远端包 | ✅ **窗口内** |
| **L-T2a** | 场景词选择器（纯函数） | 新增 `sceneWords.js` + 测试 | 正向联动（词 → 它在哪个场景）。反向已通（`units.fromScenePhrase`） | 测试覆盖「`daily` 不算场景」「未发布词被过滤」「无该场景返回空」 | 删文件 | ❌ |
| **L-T2b** | 词书默认视图改口袋/场景词 | `App.js` `WordBankScreen` | 打开不再是 8005 条大词典 | **搜索必须保留**、**全量词库入口必须保留**、五本词书与四个筛选仍可达；进度键零改动 | revert | ❌ |
| **L-T3** | 口袋（数据与列表） | `storage.js`（登记新键）、新增 `pocket.js` + 测试、`App.js` | 给用户一个自己攒的集合，并直接产生复习 | 杀进程重开仍在；次日进今日任务；`writeGuard` 拦截时**不显示成功**；裸键不加前缀 | revert（残留键读不到即空） | ❌ |
| **L-T4** | 选词拼句 | 新增 `produceChoices.js` + 测试、`ReviewScreen.js` | 现成 85+ 条 `mode:'produce'` 单元，零新增内容字段 | 词块唯一、干扰项不重复、**单词块降级回自评**；答错走现有 `lapses`；`recall` 逐像素不变 | revert | ❌ |
| **L-T5** | 复习卡回场景 | `ReviewScreen.js`、`App.js` | `origin` 字段已存在，做成可点 | `origin` 为空**不显示按钮**；跳回后队列位置不丢 | revert | ❌ |

**L 线绝不做**：云朵动画、表情、成长、角色、世界观；不接 AI 自由判断（拼句答案是有限集）。

---

### C. W 线 —— 词，继续推进（= 旧工作包 0 + 工作包 7 的「30 标杆词」半边）

> 你的要求是「一边推进一边核准确性」。关键不是要不要推，是**推哪一批**。

**制定本 plan 时查到的一个反直觉事实**：

| 对象 | 缺例句 | 缺 coreChunk | **缺 jmdictSeq** | 缺 pitch | 机器稿 |
|---|---:|---:|---:|---:|---:|
| **主线池 563 条**（`kanji_anchor`，全 N5，今日任务只从这里出） | 0 | 0 | **544（96.6%）** | 35 | 0 |
| zh_drafted 那 6642 条 | 3605 | 6642 | 约 17% | 少 | 全部 |

**用户天天在学的那 563 条，恰恰是回锁率最低的。** 例句和词块 100% 齐全，但几乎没有一条能回到 JMdict 的 `ent_seq` —— 也就是「表记读音依据哪来的」答不上来。而机器稿那 6642 条反而 83% 有 seq。

所以 W 线的方向是：**往主线池和便利店那批词里做深，不往 8005 条的尾巴上铺。** 这与旧 ROADMAP P2-1「先做 30 个标杆词，不做 8005 个词源」完全一致。

**并且：30 个标杆词 = 便利店那 30–40 词。** 不另起一批，两条线共用同一批内容，一次工作两处收益。
（这批词现状：23 条已标 `convenience`，全部有例句与 coreChunk，`status` 是 `draft`/`candidate`（**不是机器稿**），已带 `etymology_image` / `sound_change` / `spoken_written` / `loanword` 等 feature —— 底子比预想的好。）

| 编号 | 任务 | 文件 | 目的 | 验收 | 回滚 | 碰内容包 |
|---|---|---|---|---|---|---|
| **W-T1** | 内容统计脚本 | 新增 `scripts/content-stats.mjs` | **补上旧工作包 0 的欠账**：把两份 audit 里手算的数字变成一条命令。以后每次内容改动都能立刻看到准确性有没有退步 | 一条命令输出：词条数、级别/状态分布、`tags.scene` 有效标签数、各字段覆盖率、`freq.method` 分布、`pitch.agree` 分布、`publication` 计数；**只读，不写任何文件**；数字与两份 audit 对得上（对不上的差异要打印出来，比如 `_meta` 8026 vs 实测 8005） | 删文件 | ❌ |
| **W-T2** | 主线池 563 条回锁 | `staging/`（join 报告）+ ⚠️ `content.fallback.json`（只加 `jmdictSeq`） | 让「用户在学的词」能回答「表记读音依据哪来的」 | 用 `staging/jmdict-eng-3.6.2.json` 按 **词面+读音** join（**不是词面单独**，见 commit bff04fc 的教训）；产出三类报告：自动通过 / 冲突 / 未命中；**只写自动通过那批**；冲突与未命中留在报告里人工判，不猜 | revert + 回滚远端包 | ✅ **窗口内** |
| **W-T3** | 便利店 30–40 词做成标杆 | ⚠️ `content.fallback.json` | 旧工作包 7 的「30 个三层内容完整的词」 | 每条：中文释义人工过一遍并写显式 `meaning_zh_status`；`coreChunk` 与例句复核；`tags.scene` 由 L-T1 负责（**W 线不碰 scene 标签**） | revert + 回滚远端包 | ✅ **窗口内** |
| **W-T4** | 词场首批 8–10 条 | ⚠️ `content.fallback.json` | 标准（`content-standard-wordfield.md`）、校验（`auditWordFields`）、复习接线（`wordFieldUnits`）**全都写好了，内容 0 条**。这是全仓库最"写了没用上"的一处 | 从便利店那批里挑；`auditWordFields()` 零报错（成员必须真出现在句子里）；每条进复习队列后 `units.test.mjs` 仍绿 | revert + 回滚远端包 | ✅ **窗口内** |

**W 线绝不做**：不补 6642 条机器稿的例句/词块；不做全库回锁；不接语料词频；不做义项对齐；不做词源自动标注；**不给任何新词开 `publication.learning`**（扩池是单独的产品决定，不在本轮）。

---

## 3. 并行规则与文件锁

### 3.1 代码线：三线并行，可分给不同 subagent

| Lane | 独占文件 | 可并行 |
|---|---|---|
| S | `PitchLine.js`、新增 `meaningTrust.js`、`dailyTask.ts`、`sources.v1.json` | ✅ |
| L | 新增 `sceneWords.js` / `pocket.js` / `produceChoices.js`、`ReviewScreen.js`、`storage.js` | ✅ |
| W | 新增 `scripts/content-stats.mjs`、`staging/**` 报告 | ✅ |

**唯一的代码级共享文件是 `App.js`**（S 改 1741/2151/2195，L 改 `WordBankScreen` 主体与 `ReviewScreen` 挂接点）。位置不重叠，但**不要让两个 subagent 同时写 `App.js`** —— 按第 4 节顺序串行落地即可。

### 3.2 内容包：全局互斥锁

`assets/content.fallback.json` **同一时间只能有一个任务持有**。五个内容任务（S-T5 / L-T1 / W-T2 / W-T3 / W-T4）排成**一个内容窗口**，窗口内串行，一个任务一个 commit，**窗口结束后一次性发布远端 + `_meta.version` 递增一次**。

**为什么必须这样**：`content.fallback.json` 只是兜底，线上读远端包（`src/lib/contentCache.js`）。改了本地不发远端 = 本地测试全绿、线上还是旧包。这是最容易骗过自己的一种「已完成」。发布顺序见 `HANDOFF-learning.md` 的「附:发版流程」第 2 步：**内容必须早于 App 上架**。

窗口内顺序（各改不同顶层键，冲突面最小）：

```
S-T5(wordCards) → W-T2(wordBank.jmdictSeq) → W-T3(wordBank 释义/状态) → W-T4(wordBank.wordField) → L-T1(scenes + tags.scene)
```

L-T1 放最后：它是 L 线后续任务的前置，放最后能让内容窗口一结束就直接接 L-T2a。

### 3.3 只读参考，不许改

`srs.js`（评分）· `units.js`（五来源归一）· `publication.ts`（发布契约）· `contentSchema.ts`（运行时形状闸门，**新增可选字段不需要改它**）· `sourceAudit.ts` · `keyAliases.js` / `wordIds.manifest.txt`（进度键保护）· `staging/**`（除 `source-audit/sources.v1.json` 与 W-T2 的新报告）

### 3.4 明确禁止删除

词书**搜索** · **全量词库**入口与「仅词典」标记 · 五本 N5–N1 词书入口 · 「全部/未学/学习中/已掌握」筛选 · 地铁冒险 5 站（**冻结，不扩不删**）· 其余 5 个场景 · 世界打卡 / 手账 / 小本子分账 · 五十音与 `useKanaGate` · `agree===1` 的声调单源提示

---

## 4. 提交顺序

| 阶段 | 顺序 | Commit | 任务 | Lane | 可并行 |
|---|---:|---|---|---|---|
| **零风险起步** | 1 | `chore(content): 内容统计脚本` | W-T1 | W | ✅ 与 2、3 并行 |
| | 2 | `fix(wordbank): 文案不再宣称高频与官方 JLPT` | S-T1 | S | ✅ |
| | 3 | `feat(wordbank): 场景词选择器（纯函数）` | L-T2a | L | ✅ |
| **纯函数层** | 4 | `feat(wordbank): 释义可信度改用显式字段` | S-T3 | S | ✅ 与 5、6 并行 |
| | 5 | `fix(learn): freq 正名，raw_substring 降权` | S-T4 | S | ✅ |
| | 6 | `fix(pitch): 含维基的双源按单源提示 + lineage 登记` | S-T2 | S | ✅ |
| **🔒 内容窗口** | 7 | `content: 深卡词源改为有来源或记忆联想` | S-T5 | S | ❌ 串行 |
| | 8 | `content: 主线池 563 条回锁 jmdictSeq` | W-T2 | W | ❌ 串行 |
| | 9 | `content: 便利店 30 词标杆化` | W-T3 | W | ❌ 串行 |
| | 10 | `content: 词场首批 8-10 条` | W-T4 | W | ❌ 串行 |
| | 11 | `content: 便利店场景词绑定与 core_vocab` | L-T1 | L | ❌ 串行 |
| | — | **🚀 一次远端内容包发布 + `_meta.version` 递增** | | | |
| **接线层** | 12 | `feat(wordbank): 词书默认视图改口袋/场景词` | L-T2b | L | ❌（碰 `App.js`） |
| | 13 | `feat(wordbank): 口袋（数据与列表）` | L-T3 | L | ❌（碰 `App.js`） |
| | 14 | `feat(review): 选词拼句` | L-T4 | L | ✅ 与 15 可并行（不同文件区） |
| | 15 | `feat(review): 复习卡可回到来源场景` | L-T5 | L | ✅ |

**给 subagent 分工的建议**：1–6 可以开三个 subagent 同时跑（W-T1 / S 线三项 / L-T2a）；7–11 必须一个 agent 串行持锁；12–15 回到单线。

---

## 5. 已经查完、不必再查的一件事

原 S0-4「声调 `agree` 自查」在制定 plan 时已用 `staging/pitch-confidence.json`（逐条记着 `srcs`）查完：

| agree · 来源组合 | 条数 | 判断 |
|---|---:|---|
| 2 · **UniDic + kanjium** | 6549 | ✅ lineage 根不同，**双源成立**，不动 |
| 3 · UniDic + kanjium + 维基 | 523 | ⚠️ 第三方存疑，但降级后仍是 2，不影响展示 |
| 1 · 单源 | 661 | 界面已标「只有一个来源」 |
| 2 · **kanjium + 维基** / **UniDic + 维基** | 23 / 17 | ⚠️ **真正存疑**，S-T2 按单源处理 |
| 0 · 打架 | 20 | 已从内容包删除 |

另一个降险发现：UI **只在 `agree === 1` 时**出提示（`App.js:2350`），`agree >= 2` 什么都不说。所以失真形态是「沉默默认可信」，不是「宣称了双源一致」，比审计里担心的轻一档。

**待核（不影响用户，随 W-T1 顺手打印出来）**：`_meta` 说 8026 / 实测 8005，差 21 条；`pitch-confidence` 里 agree=0 是 20 条 / commit 81efe21 说 15 条，差 5 条。

---

## 6. 测试与验收

每个 commit：

```bash
npm test && npm run typecheck
```

| 类别 | 怎么验 | 归属 |
|---|---|---|
| 现有测试 | `npm test`（37 个文件）全绿 | 全部 |
| **今日任务不回归** | `dailyTask.test.ts` 全绿；手动：首页 TodayCard 仍给唯一下一步且落点正确 | S-T4、L-T3、W-T2 |
| **SRS 不回归** | `srs.test.mjs` 全绿；手动：评分后档位与 `dueAt` 符合 `[1,2,4,7,15,30,60,120]`；进度键格式未变 | L-T3、L-T4 |
| **场景句仍进复习队列** | `units.test.mjs` 全绿；`buildUnits()` 产出的场景/地铁单元数不减 | L-T1、L-T5、W-T4 |
| **便利店场景能打开** | 手动：丿 → 出发前 → 便利店，10 句 + 2 段对话正常渲染 | L-T1 |
| **词书搜索仍可用** | 手动：搜索框可用、能搜到非便利店的词、全量词库两步内可达 | L-T2b |
| **无未限定断言** | `grep -rn "高频\|官方\|必考\|双源" App.js src/features` 用户文案无命中 | S-T1、S-T2 |
| **不展示内部状态词** | `grep -rn "zh_drafted\|candidate\|verified" App.js` 渲染字符串无命中 | S-T1、S-T3 |
| **拼句最小用例** | 手动：一条便利店 produce 单元，拼对进档 / 拼错 `lapses+1` 当天再见；单词块降级自评 | L-T4 |
| **复习卡见 origin** | 手动：场景来源的卡显示场景名可跳回；无 `origin` 的卡不显按钮 | L-T5 |
| **内容包生效** | 窗口结束后：`_meta.version` 递增 + 远端已发布 + **真机拉到新包** | 内容窗口 |
| **准确性没退步** | `node scripts/content-stats.mjs` 前后对比，覆盖率只增不减 | 内容窗口每个 commit |
| **fail closed** | `meaningTrust` 缺字段 → `machine_drafted`；`publication` 缺失 → 不可学；`writeGuard` 拦截 → 不显示成功 | S-T3、L-T3 |

---

## 7. 仍需人工验证的假设

| # | 假设 | 最小验证 | 成功标准 | 失败后 |
|---|---|---|---|---|
| 1 | 用户想要「入袋」这个动作 | 上线两周看入袋过 ≥1 词的用户比例 | ≥30% | 改成自动入袋，主动动作降级为「移出」 |
| 2 | 口袋比普通收藏更有感 | 入袋词 vs 非入袋词的复习完成率 | 入袋词明显更高 | 退回单一「场景词」视图，砍掉入袋 |
| 3 | 拼句比自评更有效 | 同批用户，两种题 7 天后正确率 | 拼句更高 | 保留但不扩题型，L-T4 不进 P1 |
| 4 | 便利店比地铁适合做第一个闭环 | 便利店完成率 vs 地铁通关率 | 不低于地铁 | 第二个场景改回地铁（**可逆，地铁没被删**） |
| 5 | **用户 10 分钟内能理解闭环** | **找 1 个没看过 App 的真人**，不解释，看能否走完「进场景→入袋→拼句→从复习跳回场景」 | 10 分钟走完，且能说出「这词我在便利店见过」 | 加一次性引导，**不是加功能** |
| 6 | 用户在意证据标记 | 来源说明的点开率 | 非零即可 | 保留改动但不再为它加 UI |
| 7 | 30 个标杆词值得扩到 100 | 旧 ROADMAP 工作包 7 原话：5 名目标用户可理解性测试 | 用户看完说得出这词怎么用 | 不扩批，先修标准 |

**第 5 条是唯一必须做的**，成本一小时。

---

## 8. 一句话

> **S 线停止宣称，L 线接上已有的线，W 线往主线池里做深而不是往尾巴上铺。**
> **代码三线并行，内容包一把锁串行，窗口结束发一次远端。**
