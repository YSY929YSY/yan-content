# 言（YAN）内容准确性审计 · 2026-08-22（第二份）

> 承接 `docs/AUDIT-replan-2026-08-22.md`（学习闭环线）。本份只审 **源与内容准确性**，
> 同样：**不改代码、不删旧 plan、不覆盖旧 plan**。
>
> **本份的核心结论先写在这里**：这一轮不要去做「更多证据」，要做「更诚实的表达」。
> 前者是无底洞且用户感知不到；后者成本接近零、用户立刻能感知（信任），而且**不和 MVP 抢产能**。

---

## 0. 源台账

| 源 | 里面有什么 | 本轮拿它核对了什么 | 还能核对但没做 |
|---|---|---|---|
| `调研/词/yan_vocab_review_md_package/`（豆包/DeepSeek/Gemini/GPT/千问/Claude/Grok 七份 + 一份对比总结） | 字段分级、JMdict 边界、familyId 独立性、状态机、金标准测试集 | 哪些主张仓库已经实现、哪些是真新增 | 各家引用的外部规范（如各 JLPT 社区词表的上游）未逐条查 |
| `调研/…/red调研重新规划_编号修正版.md`（Q1–Q68 原始对话） | 词书来源、MeCab/Sentence-BERT/PMI 方法、BCCWJ/中纳言、片假名反推、词源标注 | 方法层建议的可行性与版权风险 | Q45/Q47 的具体结论细节 |
| `docs/handoff/TICKET-source-audit-contract.md` + `src/lib/sourceAudit.ts` + `staging/source-audit/` | 已实现的 registry/claim/evidence/run manifest 契约 | 七家建议与已有契约的重叠度 | claims/evidence 目录里的实际条数 |
| `src/features/wordbank/publication.ts` | 两层发布契约、fail closed | 「按字段发布」是否有必要 | — |
| `assets/content.fallback.json` 实测 | 真实字段分布 | 下面每条带数字的结论 | 远端内容包（只测了 fallback） |

**本轮新测出的数据（2026-08-22）：**

| 字段 | 实测 | 说明 |
|---|---|---|
| `freq` | 8005/8005 有，**`source` 全部是 `tatoeba`** | 它不是词频，是「Tatoeba 例句库里的文档频次」 |
| `freq.method` | `lemma` 7188 / **`raw_substring` 338** / `stripped_prefix` 18 / `none` 420 / `not_applicable` 41 | 338 条是字符串匹配得来的，会误计（红调研 Q24 说的正是这个坑） |
| `freq.df === 0` | 420 条 | 「在 Tatoeba 里没出现过」≠「日语里罕用」 |
| `jmdictSeq` | 6683 / 8005（83%） | 回锁基础已有八成，缺 1322 条 |
| `pitch` | 7674 条有，`source: kanjium`，带 `agree` | ⚠️ 见第 3.4 节：`agree=2` 是否真的是两个独立 family 未核 |
| `exampleJp` | 4400 / 8005（55%） | — |
| `coreChunk` | zh_drafted 那批是空字符串 `""` | 不是缺字段，是空值 |
| `loanSource` / `conceptCluster` | 字段已存在，值为空 | 英日优先/概念聚类的**字段位已经预留好了** |
| `wordCards[order].notes.es` | 「源自拉丁 petere…英文 appetite、petition 同根」 | ⚠️ 已经在线上发布的**词源断言**，没有来源字段 |

---

## 1. 旧 plan 中仍然有效的部分

审查报告最重要的价值，是它**验证了你已经做的 P2-2A 是对的**。七家里有五家独立提出的规则，仓库里已经实现了：

| 七家的建议 | 仓库现状 | 结论 |
|---|---|---|
| 「AI 不能当独立来源」「两个模型一致不算两源」 | `sourceAudit.ts` 按 `familyId` 计数，`producer.kind: model` 不成为 `sourceId`、不计 family | ✅ 已实现 |
| 「同上游/镜像/fork 不算独立」 | `familyId` 必须等于 `lineage` 根节点，且由受控注册决定，导入器与模型不得自由填写 | ✅ 已实现，且比七家写得更严 |
| 「evidence 不能夹带发布字段」 | evidence 出现 `publication`/`verified` 等字段**整条隔离**，`additionalProperties: false` | ✅ 已实现 |
| 「locator 必须能回到同一处」 | URL 只到页面而无条目/行 ID 时判 `insufficient` | ✅ 已实现 |
| 「机器只分流，不宣布真实」 | `resolveClaim()` 返回 `publication: null` —— 审计**结构上无法**推动发布 | ✅ 已实现 |
| 「许可缺上游链时只能 research-only」 | `redistribution: research-only`，缺 artifact SHA/时间/许可只能调研 | ✅ 已实现 |
| 「global_auto_publish: false」（Grok 的核心主张） | 仓库**从来没有 auto-publish**：`publication` 是内容包里的显式字段，缺失一律 false（fail closed） | ✅ 本来就满足，**不需要新工程** |
| 「结构完整 ≠ 可以发布」 | `publication.ts` 顶部就是这条，且专门警告「换个字段再猜一次」 | ✅ 已实现且有注释留证 |

另外仍然有效的：

- **`publication` 两层（dictionary / learning）分离** —— 它已经在挡今日任务的池子（563 条）。七家推荐的九态状态机解决的是同一个问题，代价高一个量级。
- **`_meta.wordBankSources` 里的 `scope_note`**：「N4 Core seed only; not an official JLPT list」—— **这句话本身就是正确答案**，问题只是它没出现在用户看得见的地方（见 3.2）。
- **`pitch.agree` 的「有几个来源印证」展示**（commit 81efe21）—— 方向对：把证据强度做成产品表达，而不是藏起来。

---

## 2. 需要暂停或降级的部分

| 项 | 谁提的 | 为什么风险高 | 去处 |
|---|---|---|---|
| **`field_publication_policy.yml` 全字段发布状态机（9 态、按字段发布）** | GPT/Grok/DeepSeek，对比总结把它列为 P0 | 现有 `publication` 是**按词条两层布尔**。改成按字段 = 8005 条全库迁移 + 所有读取点改写 + UI 全面改动，且**中途状态下用户看到的东西不会变好**。 | **P2**。先只对 3 个真正在骗人的字段做显式状态（见第 4 节），不做全套 |
| **金标准测试集 360 条**（100 回锁 + 50 多读音 + 50 同形 + 100 对齐 + 30 JLPT + 30 词源） | DeepSeek/对比总结 | 一人产能下这是两周的纯标注工作，且它保护的是**还没开始做的**流水线 | 降到 **P1：JMdict 回锁 100 条（样本已有）+ 词源伪事实 30 条**，其余 P2 |
| **例句 `exampleTarget` span / tokenIndex / 形态素对齐**（P2-2B） | 全体一致 | 正确，但它服务的是「例句里高亮目标词」这个还没有的功能。先做证据再做功能 = 无感知 | **P2**（与上一份报告的裁决一致） |
| **语料词频（BCCWJ / 中纳言 / CSJ）** | red Q20–Q24 + 多家 | 需要注册、许可核查、lemma+POS 匹配管线。而且它替换的是一个**用户根本看不见的字段** | **P2**。先做的是把现在这个 `tatoeba` 频次**正名**（3.1） |
| **PMI / logDice 自动抽搭配** | red Q11 | 需要有许可的语料；且 PMI 高 ≠「固定搭配」。当前 `coreChunk` 在 6642 条上是空字符串，先有内容比先有统计重要 | **P2** |
| **Sentence-BERT 义项自动对齐** | red Q6–Q9 | 两个前置都不成立：① 模型输出是 candidate 不是 evidence；② **仓库现在根本没有义项结构** —— `meaning_zh` 是一个字符串（"爱；爱情"），没有 senseId，没有东西可对齐 | **P2**，且前置是先有 senses schema |
| **片假名反推英语原词全管线**（Q33–Q34） | red + 豆包 | 假朋友 + 非英语来源。`loanSource` 字段已存在且为空，说明这条线开过头又停了 | **P2，只做白名单**（与上一份报告一致） |
| **词源自动标注（英/法/葡/德）**（Q35） | red | `historical_claim` 是伪事实重灾区，七家一致要求最高门槛 | **暂不做**，但见 4.5 的止损动作 |
| **「大辞林做主来源」**（red Q2/Q3） | red | ⚠️ **版权问题，直接否**。商业辞典不可再分发，不能进 registry 做底表 | **冻结，写进 DECISIONS 的红线** |
| **「Wiktionary + JMdict 一主一辅 = 两个源」**（red Q2/Q3） | red | ⚠️ **可能是同一个 family**。Wiktionary 日语条目大量派生自 JMdict/EDICT。按现有契约，这两条 lineage 若指向同一上游，**不计为独立来源** —— 红调研这条建议会制造「假双源」 | **驳回原方案**，若要用 Wiktionary 必须先查 lineage |

---

## 3. 新调研中真正有价值的部分

去掉与仓库重复的、去掉方法论正确但无感知的，剩下**四条真新增**，每条都对应一个当前正在发生的、可查证的失真：

### 3.1 `freq` 不是词频（真新增，且有具体错误）

- 实测：`freq.source` **8005 条全是 `tatoeba`**。Tatoeba 是例句库不是均衡语料，它的 df 反映的是「造句者写了什么」，不是「日本人说什么」。
- 其中 **338 条用 `raw_substring`** 得到 —— 字符串包含匹配，会把「愛」的计数算进「恋愛」「愛情」。
- **420 条 df=0**：这是「Tatoeba 里没有」，不是「罕用」。
- **该做的不是换语料，是正名**：字段和任何 UI 表达都不能叫「词频/高频」，叫「例句库出现次数」；`raw_substring` 那 338 条标为不可用于排序。

### 3.2 JLPT 是产品分类，不是词典事实（真新增，且是最便宜的一条）

- 现状：`App.js:2151` 显示 `JLPT {level} · N 可查 · N 可学习`；`App.js:1741` 五本词书写着「基础词书 · **高频词块** · 例句」。
- 而 `_meta.wordBankSources` 里明明白白写着来源是 stephenmk/Tanos 的社区词表，且 **"not an official JLPT list"**。
- 所以现在的状态是：**正确的限定写在元数据里，未限定的断言写在用户眼前。** 这是本轮最该修、也最好修的一处。
- 「高频词块」这个词更糟：它同时宣称了「高频」（无语料证据）和「词块」（6642 条上是空字符串）。

### 3.3 中文释义的状态是**猜**出来的（真新增，而且是已知复发模式）

- `publication.ts` 开头专门警告过：「最容易的复发方式是**换个字段再猜一次**」。
- 现状正是如此：界面靠 `status === 'zh_drafted'` 推断「这条是机器稿」。`status` 是一个词条级的混合字段，被用来回答一个**字段级**的问题（中文释义可不可信）。
- 七家一致的裁决可以直接采纳：`meaning_zh` 属于 `pedagogical_content`，**可以发布给用户，但内部绝不能标成 source_verified**。做法是加一个显式的 `meaning_zh_status`，而不是继续从 `status` 猜。

### 3.4 声调的「两个来源印证」需要自查（真新增，且可能是已发布的失真）

- 实测 `pitch: { source: 'kanjium', agree: 2 }`，7674 条。
- 对比总结里点名了一条风险：**「Kanjium 与其再打包字典」属于同一 family**。
- 所以问题很具体：**那个 `agree: 2` 数的是两个独立 family，还是 Kanjium 和它的一个再打包？** 如果是后者，线上「有 2 个来源印证」这句话就是失真的。
- 这条是**必须自查**的，因为它已经发布给用户了。查证成本低（看当时的 join 脚本和输入文件），风险高。

### 3.5 我不采纳的

- 「所有 claim 都要两源」（豆包）：会把底座建设卡死，且仓库现在连回锁都只有 83%。
- 「candidate 弱标展示给用户」（千问/Gemini）：核心学习路径只走已发布，这一条仓库已经用 `publication.learning` 做到了，不要开口子。
- 「JMdict 可支撑基础中文释义/常用搭配」（豆包）：错的，JMdict 只有英文 gloss。
- 「官方公布词汇表」「2023 年 JLPT 词汇变化」（千问）：无可定位证据，不能写进工程规则。

---

## 4. 内容准确性的最小闭环（≤5 项，全部是「表达诚实化」，不是「补证据」）

> 判准：**每一项都必须让用户当场能感知到差别，或者拦住一次正在发生的失真。**
> 不满足这条的（span、语料频率、状态机迁移）一律不进这一轮。

### S0-1 下架无证据的断言文案

- **目的**：不再对用户宣称我们证明不了的事。
- **改哪里**：`App.js:1741-1745`（五本词书的 desc）、`App.js:2151`（`JLPT {level}` 那行）。
- **做**：「高频词块」→「词块 · 例句」或直接去掉；`JLPT N5` → `N5 学习分级`，并在词书页放一句可点开的来源说明（文案直接用 `_meta` 里现成的 scope_note）。
- **验收**：全仓库 grep 不到「高频」「官方」「必考」用于描述词库的地方；来源说明可从词书页两步内到达。
- **用户能感知什么**：一个诚实的产品，且第一次知道这些分级是哪来的。

### S0-2 `freq` 正名

- **目的**：不把 Tatoeba 的造句次数当词频用。
- **改哪里**：任何按 `freq.df` 排序或展示的位置（含 `dailyTask.ts` 的 `orderPool`——**只改措辞与注释，不改排序逻辑**）；`freq.method === 'raw_substring'` 的 338 条在排序里降权或排除。
- **不做**：不换语料、不接 BCCWJ、不改 SRS。
- **验收**：`raw_substring` 不再参与任何「更常用」的判断；纯函数测试锁住这条。
- **用户能感知什么**：间接——今日任务里的新词顺序更可信。

### S0-3 `meaning_zh_status` 显式化

- **目的**：把「这条释义可不可信」从 `status` 的猜测里拆出来，堵住已知复发模式。
- **改哪里**：`assets/content.fallback.json` 加字段（可选字段，`contentSchema.ts` 不用改）；新增纯函数 `meaningTrust(word)` 放 `src/features/wordbank/`；App.js 里现有的「仅词典」标记改读这个函数。
- **取值**（直接用七家的裁决）：`editorial_published` / `human_reviewed` / `machine_drafted`。**不允许出现 `source_verified`。**
- **验收**：`meaningTrust()` 有测试，且**缺字段时 fail closed 返回 `machine_drafted`**（和 `publication` 同一条原则）；界面不再出现从 `status` 推断可信度的代码。
- **用户能感知什么**：标记从「有没有例句」变成「这条释义审过没有」——后者才是他真正想知道的。

### S0-4 声调 `agree` 自查

- **目的**：确认线上「几个来源印证」这句话是不是真的。
- **改哪里**：**先只查不改**。看 `staging/pitch-*.json` 和当时的 join 脚本，确认 `agree` 数的是不是两个独立 family。
- **两种结局**：是 → 补一行 registry 记录，收工；不是 → **改文案**（比如「Kanjium 词典标注」），不改数据。
- **验收**：结论写进 `docs/handoff/DECISIONS.md`，附可复算的依据；若失真则当轮修正文案。
- **用户能感知什么**：如果失真，修掉的是一句每天被看见的假话。

### S0-5 词源断言止损

- **目的**：`wordCards` 的 `notes` 里已经在发布词源（petere / appetite / petition）。这一类是七家一致要求最高门槛的 `historical_claim`。
- **改哪里**：`assets/content.fallback.json` 的 8 张深卡；不改代码。
- **做**：逐条判断——有权威可定位来源的，补 `source`；只是好记的联想，**改成 `memoryStory` 的语气**（「可以这样记」而不是「源自」）。8 张卡，一小时的量。
- **同时定死一条规则**：以后 30 个标杆词的词源走同一条，`etymologyClaim` 与 `memoryStory` 分开写。
- **用户能感知什么**：几乎无感——但这是唯一能防止 moat（词源顺藤摸瓜）在放大到 30/300 条时变成伪事实工厂的时机。**现在改 8 条，比以后改 300 条便宜。**

---

## 5. 优先级表（源线）

**S0（本轮，与学习闭环 P0 并行——因为它们几乎不碰同一批文件）**

1. S0-1 断言文案下架
2. S0-2 `freq` 正名
3. S0-3 `meaning_zh_status`
4. S0-4 声调 `agree` 自查
5. S0-5 词源止损（8 张深卡）

**S1（学习闭环 P0 验收后）**

- JMdict 回锁补齐：6683 → 8005（缺 1322 条）
- 金标准最小集：回锁 100 条 + 词源伪事实 30 条
- `examTags` 薄映射（保留 `level` 字段不动，只加一层带 `sourceId` 的标签）
- 便利店场景那批词的中文释义人工过一遍（和学习线 P0-1 是同一批词，顺手做）

**S2（未来）**

- 按字段发布策略 `field_publication_policy.yml` + 状态机迁移
- `exampleTarget` span / 形态素对齐（P2-2B）
- 语料词频（BCCWJ/中纳言，需先解决许可）
- senses 结构化 → 之后才谈义项对齐
- 声调第二独立 family
- `coreChunk` 内容补齐（6642 条空值）+ 编辑 SOP
- 片假名英语白名单（`loanSource` 字段已就位）

**暂不做（明确冻结）**

- 大辞林等商业辞典作为来源（**版权红线**）
- Sentence-BERT 自动义项对齐
- PMI 自动抽搭配
- 词源自动标注（英/法/葡/德）
- 全库 `source_verified` 目标
- 把 AI 一致当双源（契约层已禁止，这里再记一次）

---

## 6. 冲突表

| # | 冲突点 | 风险 | 建议裁决 | 需你确认 |
|---|---|---|---|---|
| 1 | 七家一致推「按字段发布状态机」／ 现有是按词条两层布尔 | 全库迁移 + 全 UI 改写，中途用户无感知 | **不迁移**。只对 `meaning_zh` 一个字段做显式状态（S0-3），验证这个模式值不值再谈推广 | 否 |
| 2 | 审查报告的 P0 是「写字段发布政策」／ 我的 S0 是「改五处表达」 | 前者产出一份 YAML，用户零感知；后者当天可见 | **采纳 S0**。政策文件等到有第二个字段需要它时再写 | 否 |
| 3 | red Q2/Q3 建议「大辞林做主源」 | 商业辞典不可再分发 | **否决，写进红线** | 否 |
| 4 | red Q2/Q3 建议「Wiktionary + JMdict = 两源」 | 可能同 family，制造假双源 | **否决原方案**；要用先查 lineage | 否 |
| 5 | 源线 S0 ／ 上一份报告的学习闭环 P0 | 两条线并行会不会又变成"什么都在做" | **可以并行**：S0 碰的是 `App.js` 文案层 + 深卡 JSON + 一个新纯函数；P0 碰的是场景/口袋/复习。**唯一重叠点是 `assets/content.fallback.json`，必须错开提交，不要同时改** | ⚠️ 是 |
| 6 | 「场景标签需不需要证据」 | 证据焦虑会卡死学习线 P0-1 | **不需要**。`tags.scene` 是 `product_taxonomy`，和 JLPT 同类——它是产品分类，不是事实断言，不走 evidence 流程。**别让源线的标准误伤它** | 否（但这条最容易搞错，特意写下来） |
| 7 | 上一份报告建议暂停 P2-2B/2C ／ 本份 S0 也属于源线 | 看起来自相矛盾 | 不矛盾：**暂停的是"补证据"，做的是"改表达"**。S0 五项没有一项需要新证据 | 否 |
| 8 | 审查报告建议 360 条金标准 ／ 一人产能 | 两周纯标注，保护的是还没有的流水线 | 降到 130 条，且放 S1 | 否 |

---

## 7. 三阶段

**Phase 1 · 收束（不改代码）**
- 做：把第 6 节冲突 5 的提交顺序定下来；把「大辞林/假双源」写进 `DECISIONS.md` 红线；S0-4 的自查（只读）。
- 不做：不动内容包、不动 UI。
- 验收：声调 `agree` 有结论；红线有文字。

**Phase 2 · 表达诚实化（S0-1/2/3/5）**
- 做：文案下架、`freq` 正名、`meaning_zh_status`、深卡词源止损。
- 不做：不补证据、不迁状态机、不接语料、不改 SRS 与 `publication` 结构。
- 修改范围：`App.js`（文案与两处读取点）、`assets/content.fallback.json`（加可选字段 + 8 张深卡）、新增一个纯函数 + 测试。
- 验收：全仓库无「高频/官方/必考」类无证据断言；`meaningTrust()` fail closed 有测试；已发布 UI 行为除文案外零变化。

**Phase 3 · 补证据（S1）**
- 做：回锁补齐 1322 条、最小金标准 130 条、`examTags` 薄映射。
- 不做：状态机迁移、语料频率、义项对齐。
- 验收：回锁率 100%，且每条能复算。

---

## 8. 任务拆分（3–5 个，可单独回滚）

> 通用约束：不改 `publication` 结构、不改 SRS、不改进度键、不拆 `App.js`、不下载新来源、LLM 产出只能是 candidate。
> **`assets/content.fallback.json` 与学习线 T1 冲突，必须错开提交。**

### S-T1 · 断言文案下架（纯 UI 文案，最先做）
- 范围：`App.js:1741-1745`、`App.js:2151` 及词书页一处来源说明入口。
- 验收：grep 不到描述词库的「高频/官方/必考」；来源说明文案逐字引自 `_meta.wordBankSources.scope_note`。
- 回滚：单 commit revert。

### S-T2 · 声调 `agree` 自查（只读，无代码改动）
- 范围：`staging/pitch-*.json`、当时的 join 脚本；产出写进 `DECISIONS.md`。
- 验收：结论可复算；若判定失真，另起一个只改文案的 commit（不改数据）。
- 回滚：文档改动，天然可回滚。

### S-T3 · `meaning_zh_status` + `meaningTrust()`
- 范围：新增 `src/features/wordbank/meaningTrust.js` + 测试；`assets/content.fallback.json` 加可选字段；App.js 的「仅词典」标记改读它。
- 不做：不改 `contentSchema.ts`（可选字段无需过形状闸门）、不动 `publication`。
- 验收：缺字段 fail closed → `machine_drafted`；不允许出现 `source_verified` 取值（测试锁死）；界面上不再有从 `status` 推断可信度的代码路径。
- 回滚：单 commit revert，字段残留无害。

### S-T4 · `freq` 正名
- 范围：`dailyTask.ts` 的 `orderPool` 相关注释与措辞；`raw_substring` 338 条在排序里降权；相关测试。
- 不做：不换语料、不改排序算法本身的结构。
- 验收：测试锁住「`raw_substring` 不参与更常用判断」「df=0 不等于罕用」。
- 回滚：单 commit revert。

### S-T5 · 深卡词源止损（纯内容，8 张卡）
- 范围：`assets/content.fallback.json` 的 `wordCards` notes。
- 做：有可定位来源的补 `source`；其余改写成「可以这样记」的联想语气。
- 验收：8 张卡逐条过一遍；`etymologyClaim` / `memoryStory` 的写法规则写进 `docs/content-standard-wordfield.md` 同级的一份说明。
- 回滚：单 commit revert。

---

## 9. 「已经讨论过」≠「已经验证过」

1. `pitch.agree = 2` 是否真的是两个独立 family —— **未验证，且已发布给用户**（S0-4 就是去验它）。
2. 6683/8005 的 `jmdictSeq` 是否条条能回锁到 `jmdict-eng.json.tgz` —— 只做过样本。
3. `_meta` 说 8026、实测 8005 的 21 条差异 —— 仍未查（上一份报告已记）。
4. 用户是否在意证据标记 —— 零测试。七家都假设在意，没有一家有数据。
5. Wiktionary 日语条目与 JMdict 的 lineage 关系 —— 我判断"可能同族"，**这是需要查证的判断，不是已核事实**。
6. 远端内容包与本地 fallback 的字段是否一致 —— 只测了 fallback。
7. `raw_substring` 那 338 条到底误计了多少 —— 未抽样。

---

## 10. 关于「和 red 讨论的原文」

**已经拿到了，不需要再补。** 你这次附上的 `red调研重新规划_编号修正版.md`（Q1–Q68）就是原文转换版，我按 Q 号读过，源相关的 Q1–Q4、Q11、Q20–Q24、Q33–Q35、Q47 都进了上面的判断（大辞林、假双源、PMI、Tatoeba 频次这四条结论直接来自它）。

**还值得补的只有一种**：如果那次讨论里有**截图、外部链接或对方给的具体词表/文件**没有被转成文字——那些是可能带 `sourceId` 和许可信息的东西，转换版里丢了。除此之外，Q1–Q68 的文字已经足够，不必再找。

---

## 11. 一句话定调

> **这一轮不要去证明更多，去停止宣称更多。**
> 五处表达改完，产品的可信度会比补一万条 evidence 提升得更明显——因为用户看得见前者，看不见后者。
