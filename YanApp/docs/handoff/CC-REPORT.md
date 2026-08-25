# CC 影响分析 / 实现交接

> 状态：第 2 版（已按 `CODEX-REVIEW.md` B1–B6 修订）。仍为影响分析，未编码。
>
> 当前任务：`docs/handoff/ACTIVE.md` · P0-1 用显式发布契约替换 `isDraftedWord`
>
> 修订日期：2026-08-20

## 1. 结论摘要

1. 仓库存在**两套并行的新词准入口径**：词书路径 `!isDraftedWord`（4400 条），
   主线路径 `anchorPool` 的 `kanji_anchor`（563 条，**全部 `levels: ["N5"]`，无跨级**）。
2. `isDraftedWord` 有 **5 个调用点**（`1972` 是定义）。其中 **2 个是准入**（`2042`、`2088`）、
   2 个是计数（`1775`、`2099`）、1 个是标签（`2214`）。
3. 边界必须拆成两条：**引入新词** 用 `canIntroduceWord`，**复习旧记录** 用
   `canReviewWord(word, record) = Boolean(record)`。只做前者会误伤已有 SRS 记录。
4. `grade()` 内不做 publication 判断 —— 它同时服务深内容，参数只有 key/bookId，
   在里面猜发布状态是错的层。拦截点在**调用它的入口**。
5. 不影响 `wordKey`、SRS 记录结构、云端行结构。受影响的持久化只有 `K.wordbankSession`。
6. **D1 未决定前不能进入 Commit 2/3**：当前内容包 `publication` 字段为 0 条，
   fail closed 会让词书 4400 → 0、主线 563 → 0。

## 2. 调用路径

`isDraftedWord` 的 5 个调用点，按**语义分类**（不是按文件顺序）：

| 入口 | 位置 | 语义 | 当前规则 | 建议新规则 | 风险 |
|---|---|---|---|---|---|
| 词书今日 session 候选 | `App.js:2042` | **准入（新词）** | `pickSession(bank.filter(!isDraftedWord))` | `canIntroduceWord` | 落盘在 `K.wordbankSession`；同日已挑的 session 会被 `saved.date === today` 复用，**收紧次日才生效** |
| 词书默认列表 | `App.js:2088` | **准入 / 可见性** | `skipDraftFilter ? byStatus : byStatus.filter(!isDraftedWord)` | `canIntroduceWord` | 决定默认列表里哪些词可见，**不是纯展示**（B1 已修正）。`skipDraftFilter` 含 `today`/`due`/`showDrafts` 三个出口，必须保留 —— 前两者正是「旧记录仍可见」的通道 |
| 货架每本计数 | `App.js:1775` | 计数（展示） | `final = count(!isDraftedWord)` | 由 D3 决定命名后再定口径 | 见 §7-Q3 |
| 单本词书计数 / 空态 | `App.js:2099` | 计数（展示） | `finalCount` / `hasFinalWords` | 同上 | `hasFinalWords=false` 会命中更多书，空态文案需同步 |
| 「起草」标签 | `App.js:2214` | 标签（展示） | `isDraftedWord(item) → 显示「起草」` | **不能直接删**，见下 | B2 指出的遗漏。删函数前必须先定这个标签代表什么 |

`2214` 的迁移方案（B2 要求）：该标签当前混合了两层含义。建议**按展示意图拆开**——

- 若意图是「这条例句不全」→ 改用 `hasCompleteExample`，标签文案改为「无例句」；
- 若意图是「这条不能进入正式学习」→ 改用 `canIntroduceWord`，文案改为「词典」。

从 `2213` 的原注释（「用户会拿它和精修词条等同看待，然后得出『这本书的例句怎么时有时无』」）
判断，**原始意图是前者(例句)**。但 D3 定了 publication 语义后可能改为后者。
**这条不由 CC 自行决定**，列入 §7-Q3。

其余入口（与 `isDraftedWord` 无关，但属于本轮边界）：

| 入口 | 位置 | 当前规则 | 建议 |
|---|---|---|---|
| 今日任务（主线） | `App.js:674` → `dailyTask.ts:308 anchorPool` | `kanji_anchor` | 与 `canIntroduceWord` **求交**，不是替换 |
| 全库搜索 | `App.js:1782-1787` | 无发布过滤 | 保持（R2） |
| 搜索详情评分 | `App.js:1798` → `useReview.js:84` | 任意词可 `grade()` | **无既有 record 且不可引入时**不提供评分；有 record 仍可复习 |
| 词书详情评分 | `App.js:2107` | 词书内词可评分 | 随列表过滤自然收敛 |
| 混合复习队列 | `useReview.js:115` + `units.js:247` | 到期项来自 `progress` 全表；`newUnits` 只有深内容 | 不变 |

## 3. 新 selector 影响表

采纳 B3 的双边界。四个 ACTIVE.md 指定的 selector 之外，另需两个**组合判断**：

```ts
canIntroduceWord(word)          = isLearnableWord(word)
canReviewWord(word, record)     = Boolean(record)      // 与 publication 无关
```

## Gloss rollout assessment · 2026-08-25

本轮按 `docs/handoff/TICKET-gloss-rollout-assessment.md` 只做测量。新增的两个脚本均为只读测量脚本：[`scripts/gloss-coverage.mjs`](../../scripts/gloss-coverage.mjs) 直接读取 4,400 条有例句词条、`EXAMPLE_TOKENS`，并复用现有 `buildWordFieldAlignment`；[`scripts/deep-card-audit.mjs`](../../scripts/deep-card-audit.mjs) 只读深卡内容。没有改任何业务代码、UI 或内容包，没有构建，也没有发 OTA。

### Gloss 覆盖率

- 有例句词条：**4,400**。
- 可用率（对齐 token 拼回原句）：**4,400 / 4,400（100.00%）**。
- Gloss 覆盖（排除标点）：**29,521 / 33,566（87.95%）**。
- 全覆盖句：**1,622 / 4,400**。
- 分布：**100% 1,622**；**90–99% 378**；**70–89% 2,200**；**<70% 200**。
- 空白成因（总空白 token 4,058）：**活用碎片 2,627（64.74%）**；**表记差异 1,431（35.26%）**；**不在词库 0（0.00%）**。
- 贪心分词与 `EXAMPLE_TOKENS` 切分不同：**3,074 / 4,400**；全部 4,400 条都有可比较的 `EXAMPLE_TOKENS`。

评估脚本为使 4,400 条测量可完成，对每句只传入该句实际出现的词面和辞书形 surface；不在句中的候选无法影响现有函数的直接命中、边界或辞书形命中，运行时 `wordFieldAlignment.js` 未改。

### 稳定随机样本（15 条）

以下为脚本固定 hash 顺序抽样；`∅` 表示 gloss 留空，括号列出空白成因。

1. `n3_kurasu`｜彼女は安楽に暮らしている。  
   `彼女→她 | は→（主题） | 安→∅ | 楽→舒适 | に→（向/于） | 暮らし→生活 | てい→样子 | る→∅ | 。→。`  
   覆盖 75.00%；空白：安（表记差异）、る（活用碎片）。
2. `n2_hantou`｜朝鮮半島を訪れたことがありますか。  
   `朝→早上 | 鮮→∅ | 半島→半岛 | を→（宾语） | 訪れ→∅ | た→田 | こと→日本筝 | が→（主语） | あ→啊 | り→∅ | ます→（礼貌） | か→（疑问） | 。→。`  
   覆盖 75.00%；空白：鮮（表记差异）、訪れ（活用碎片）、り（活用碎片）。
3. `n5_paateii`｜パーティーに行きます。  
   `パーティー→派对 | に→（向/于） | 行き→去程 | ます→（礼貌） | 。→。`  
   覆盖 100.00%；空白：无。
4. `n1_muchi`｜無知は幸福。  
   `無知→无知 | は→（主题） | 幸福→幸福 | 。→。`  
   覆盖 100.00%；空白：无。
5. `n5_yasui`｜安い服を探しています。  
   `安い→便宜的 | 服→衣服 | を→（宾语） | 探し→∅ | てい→样子 | ます→（礼貌） | 。→。`  
   覆盖 83.33%；空白：探し（活用碎片）。
6. `n3_higai`｜屋根は嵐の被害を受けました。  
   `屋根→屋顶 | は→（主题） | 嵐→暴风雨 | の→（的） | 被害→受害 | を→（宾语） | 受→∅ | け→毛 | ました→（过去） | 。→。`  
   覆盖 88.89%；空白：受（表记差异）。
7. `n4_atsumeru`｜古い切手を集めています。  
   `古い→旧的 | 切手→邮票 | を→（宾语） | 集→∅ | め→眼睛 | てい→样子 | ます→（礼貌） | 。→。`  
   覆盖 85.71%；空白：集（表记差异）。
8. `n5_hagaki`｜葉書を送る。  
   `葉書→明信片 | を→（宾语） | 送る→发送 | 。→。`  
   覆盖 100.00%；空白：无。
9. `n3_hani`｜これは私の想像の範囲を超えている。  
   `これ→这个 | は→（主题） | 私→我（郑重说法） | の→（的） | 想像→想象 | の→（的） | 範囲→范围 | を→（宾语） | 超→超 | え→画 | てい→样子 | る→∅ | 。→。`  
   覆盖 91.67%；空白：る（活用碎片）。
10. `n1_nyuushu`｜登録用紙は無料で入手できます。  
    `登録→登记 | 用紙→表格用纸 | は→（主题） | 無料→免费 | で→（在/用） | 入手→得到 | で→（在/用） | き→树 | ます→（礼貌） | 。→。`  
    覆盖 100.00%；空白：无。
11. `n2_naika`｜熱があるなら内科ですね。  
    `熱→发烧 | が→（主语） | あ→啊 | る→∅ | な→名字 | ら→∅ | 内科→内科 | です→（是） | ね→（确认） | 。→。`  
    覆盖 77.78%；空白：る（活用碎片）、ら（活用碎片）。
12. `n1_gisei`｜彼は成功するのに非常な犠牲をはらった。  
    `彼→他 | は→（主题） | 成功→成功 | する→做 | の→（的） | に→（向/于） | 非常→紧急 | な→名字 | 犠牲→牺牲 | を→（宾语） | は→（主题） | らっ→∅ | た→田 | 。→。`  
    覆盖 92.31%；空白：らっ（活用碎片）。
13. `n1_kiwata`｜彼らの主たる輸出品は織物であり、特に絹と木綿である。  
    `彼ら→他们 | の→（的） | 主→∅ | たる→足够 | 輸出→出口 | 品→物品 | は→（主题） | 織物→纺织品 | で→（在/用） | あり→有 | 、→、 | 特に→特别 | 絹→丝绸 | と→（和/与） | 木綿→棉 | で→（在/用） | あ→啊 | る→∅ | 。→。`  
    覆盖 88.24%；空白：主（表记差异）、る（活用碎片）。
14. `n2_mendoukusai`｜洗い物が面倒くさい。  
    `洗→∅ | い→胃 | 物→东西（具体物品） | が→（主语） | 面倒→麻烦 | くさい→臭 | 。→。`  
    覆盖 83.33%；空白：洗（表记差异）。
15. `n1_juugyouin`｜６時を過ぎると従業員は帰り始めた。  
    `６→∅ | 時→时间 | を→（宾语） | 過ぎる→超过 | と→（和/与） | 従業員→员工 | は→（主题） | 帰り→回来 | 始→∅ | め→眼睛 | た→田 | 。→。`  
    覆盖 81.82%；空白：６（表记差异）、始（表记差异）。

这些样本显示：拼回一致并不等于逐块理解可直接推广；部分未覆盖片段来自活用或表记切碎，但也有“た→田”“え→画”“き→树”等短片段误命中的风险，需在决定推广前由负责人确认质量门槛。

### 最低覆盖样本（5 条）

1. `n2_chiru`｜散れ！：`散れ→∅ | ！→！`；覆盖 **0.00%**；空白：散れ（活用碎片）。
2. `n3_damaru`｜黙れ！：`黙れ→∅ | ！→！`；覆盖 **0.00%**；空白：黙れ（活用碎片）。
3. `n3_hanasu`｜離せ！：`離せ→∅ | ！→！`；覆盖 **0.00%**；空白：離せ（活用碎片）。
4. `n1_kakitoru`｜書き取れ！：`書→∅ | き→树 | 取れ→∅ | ！→！`；覆盖 **33.33%**；空白：書（表记差异）、取れ（活用碎片）。
5. `n3_kane`｜華金だ！：`華→∅ | 金→钱 | だ→∅ | ！→！`；覆盖 **33.33%**；空白：華（表记差异）、だ（活用碎片）。

### 深卡盘点摘要

完整产物见 [`staging/deep-card-audit.md`](../../staging/deep-card-audit.md)。8 张卡中只有 `すみません` 有结构性缺口：`notes`、`contextJa/contextZh` 均为空，缺少可供人工复核的意象载体。发现两条未带来源的词源式断言：`どこ.notes.doko` 与 `痛い.notes.itai` 的“完全同源”；`注文.notes.es` 明确写成记忆联想，因此未计为词源断言。

### 实际改动与 commit

- `scripts/gloss-coverage.mjs`：只读覆盖率、样本和分词差异测量脚本。
- `scripts/deep-card-audit.mjs`：只读深卡结构与词源式断言扫描脚本。
- `staging/deep-card-audit.md`：深卡盘点产物；无内容包修改。
- `docs/handoff/ACTIVE.md`、本节：交接与报告。
- 本轮实现 commit：`77edc17 docs(assessment): measure gloss rollout before deciding`。
- 内容包前后 `content-stats` 对比：**无**，内容包未改。
- 本轮没有顺手修正短 token 误命中、活用覆盖、词源断言、UI、真机稳定性或内容质量；这些都留给负责人看完样本后的单独决定。

### 门禁原始输出

以下为报告落盘前直接运行的原始命令输出；仓库中另有本轮范围外的既有未跟踪文件。两条命令均按要求原样保留。

```text
$ git status --short
?? "\350\260\203\347\240\224/"
?? ../YanApp_backup_0501/
?? ../resources/
?? ../yan-content/README.md
?? ../yan-content/content.json
?? ../yan-content/content.v1.json
?? "../yan-content/yan_word_story\350\276\223\345\205\245\346\250\241\346\216\242\350\256\25026.6.2.html"

$ npm run audit

> yanapp@1.0.0 audit
> node scripts/audit.mjs

audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
WARN user-claims App.js:2937: review editorial claim "旅行高频"
WARN user-claims App.js:2981: review editorial claim "旅行高频"
WARN user-claims App.js:3075: review editorial claim "高频"
WARN user-claims App.js:3118: review editorial claim "高频"
WARN user-claims App.js:3165: review editorial claim "高频"
WARN user-claims App.js:3183: review editorial claim "旅行最高频框架"
WARN user-claims src/features/kana/KanaScreen.js:1954: review editorial claim "旅行高频"
PASS content-pack-sync sha256 a00a76e1289a9c84e0f7089b2edc1949811bf52fb08f7c297ba55ada8ffecd82
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
INFO doc-refs scanned 865 references (381 unique)
WARN doc-refs docs/AUDIT-source-trust-2026-08-22.md:16: missing 调研/…/red调研重新规划_编号修正版.md
WARN doc-refs docs/AUDIT-source-trust-2026-08-22.md:286: missing red调研重新规划_编号修正版.md
WARN doc-refs docs/ROADMAP-content-trust-structure-ui.md:804: missing src/content/publication.ts
WARN doc-refs docs/ROADMAP-content-trust-structure-ui.md:803: missing src/content/schema.ts
WARN doc-refs docs/ROADMAP-content-trust-structure-ui.md:278: missing src/content/contentValidation.ts
WARN doc-refs docs/TICKET-jmdict-followup.md:86: missing staging/duplicate-seq-plan.md
WARN doc-refs docs/TICKET-jmdict-followup.md:86: missing staging/duplicate-seq-groups.json
PASS doc-refs 所有引用都已入库（7 条指向不存在的路径，见 WARN）
PASS workspace-clean docs markdown tracked
--- audit summary ---
FAIL: 0
WARN: 14
Result: PASS
```

| Selector | 应替换的调用点 | 兼容规则 | 所需测试 |
|---|---|---|---|
| `isDictionaryEntry` | 搜索 `1782`（显式化，当前隐式全通） | 有 `word` + `reading` | 缺字段的条目返回 false 且不抛 |
| `isLearnableWord` | 经 `canIntroduceWord` 用于 `2042`、`2088`、主线求交 | `publication?.learning === true`；**缺字段 fail closed** | 无 `publication` → false（B3：**不写「主线交集非空」断言**，publication 未迁移时它必然失败）|
| `hasEditorialDepth` | 暂无调用点 | `coreChunk` / `wordField` / `yanFeatures` 非空 | 纯函数测试；当前 `coreChunk` 1758 条 |
| `hasCompleteExample` | 承接 `2214` 标签（若 D3 选「例句」语义）、以及计数口径之一 | `exampleJp && exampleZh && exampleRoma` | 与现值一致：4400 条 |

**命名**：`isDraftedWord` 删除，不留别名 —— 保留会让下一个人以为它还是准入判据。
但删除必须和 `2214` 的语义决定同一个提交完成。

## 4. 存储、迁移与旧用户风险

- **`wordKey`**：不变。`App.js:1974` 与 `dailyTask.ts:50` 两处定义现已一致，本轮不触碰。
- **SRS 记录**：结构不变。⚠️ **收紧只作用于新引入，不回溯清理**——
  已在 SRS 里的 dictionary-only 词必须继续可复习（B3）。
- **三条 session 路径，容易只改一条**：
  - `K.wordbankSession`（按 bookId 分桶，候选来自 `2042`）→ **受影响**；
  - `K.reviewSession`（`useDailyQueue` 混合队列，来源是 `progress` 全表）→ 不受影响；
  - 主线 `learnBatch`（App state，**不落盘**）→ 重启即重挑，无迁移负担。
- **云端同步**：`sync.js:27 pushProgress(wordKey, rec, bookId)` 行结构不含 publication，不受影响。
- **旧内容无 `publication`**：当前内容包 **0 条**有该字段。见 §7-Q1。
- **读盘失败保护**：`useReview.js` 与 `writeGuard.ts` 的三态护栏与本轮无关，不要顺手改。

## 5. 与审查结论不一致或已过时的地方

### 5.1 主线不使用 `isDraftedWord`（第 1 版发现，Codex 已复现）

- `App.js:674` → `anchorPool(content.wordBank || [])`
- `dailyTask.ts:308` → `bank.filter(w => (w.yanFeatures || []).includes('kanji_anchor'))`
- 5 个调用点全部在 `WordBookShelfScreen` / `WordBankScreen` 内。

### 5.2 ⚠️ 我第一版的等级计数用错了口径（B4，接受）

Codex 的表是对的。我写的 `1318 / 734 / 993` 来自**「最高等级归属」**口径，
而 `WORDBOOKS` 用的是 `(w.levels || [w.level]).includes(book.level)` 的 **membership** 口径 ——
一条跨级词会被两本书同时算进去。两种口径的实测差异：

```
membership（与 App.js:1774 同口径，正确）
  N5 724/724 · N4 632/632 · N3 1712/1373 · N2 1790/819 · N1 3383/993
最高等级归属（我第一版误用）
  N5 723 · N4 632 · N3 1318 · N2 734 · N1 993
```

**这类数字不应再手写进报告或注释**（B4）。实现前先加只读统计脚本产出基线，验收对脚本输出。

### 5.3 ⚠️「主线池跨等级」是错的（B4，接受）

实测 563 条的 `levels` 分布是 `{('N5',): 563}` —— **全部单一 N5，零跨级**。
第一版据此推导的「按等级迁移仍会切掉主线一部分」不成立，已从 §7 删除。

### 5.4 声调 F3 不能写成已关闭（B6，接受）

实测代际漂移确实存在：

| 工件 | 三方 | 两方 | 单一 | 冲突 |
|---|---:|---:|---:|---:|
| 内容包 `pitch.agree` | 523 | 6563 | 588 | 已删，包内不可还原 |
| `staging/pitch-confidence.json` | 523 | 6595 | 661 | 20 |

两边都**没有** run id / 输入 URL / SHA-256 / 下载时间 / 许可快照字段（已核）。
所以 F3 的正确表述是「机制已建立，来源族谱与产物可追溯性未完成」，
不能称「独立性已完全证明」。本轮不改声调数据或脚本（ACTIVE.md 禁止事项）。

### 5.5 第一版的 Commit 2 自相矛盾（B1，接受）

我在 §2 把 `2088` 归为准入，却在 §6 把它放进「只改展示、无行为变化」的 Commit 2，
且 Commit 3 未再处理它。照那个计划执行，**「补齐例句即进入正式词书」这条规则会原样保留，
P0-1 只完成一半**。已按 B1 重排，见 §6。

### 5.6 其余未发现不符

`buildUnits` 不展平 wordBank、`grade()` 真实入口两处 —— 与 Codex 一致。

## 6. 建议提交顺序（已按 B1 / B3 重排）

### Commit 1 · 纯 selector、类型与测试，不接调用点

- 新增 `src/features/wordbank/publication.ts`：四个 selector + `canIntroduceWord` / `canReviewWord`；
- 缺 `publication.learning === true` 时 fail closed；
- `hasCompleteExample` 只检查内容形状；
- **不写「主线交集非空」断言**（B3）—— publication 未迁移时它必然失败。
- 验收：`npm test` 全绿；线上行为零变化（无调用点）。
- 回滚：删文件。

### Commit 2 · 显式兼容迁移与生成校验（**依赖 D1**）

- 按产品负责人选定的 D1 策略生成 `publication`；
- fallback 与 `yan-content/content.v2.json` 保持一致（`wordIds.test.mjs` 守着）；
- 由脚本产出统计报告，**不手填条数**（B4）；
- `basis` 只表示迁移依据，不是真实性等级（B5）。
- 回滚：内容包 revert；⚠️ 这是三个提交里**唯一改数据**的，回滚成本最高。

### Commit 3 · 一次接完所有新内容准入边界

同一提交内接完，避免入口之间出现两套口径、留下搜索绕过窗口：

- 主线：`anchorPool` ∩ `canIntroduceWord`；
- 词书新 session：`2042`；
- 词书默认列表：`2088`；
- 搜索详情：**无既有 record 且不可引入**时不提供评分；有 record 仍可复习；
- `today` / `due` 视图与既有 SRS 记录继续可复习（`skipDraftFilter` 的两个出口保留）；
- 计数（`1775`/`2099`）与标签（`2214`）改用各自明确的展示语义（依赖 D3）。
- 验收（行为测试，同提交内补）：
  1. dictionary-only 且无 record → 搜索详情无评分入口；
  2. dictionary-only 但**有** record → 仍可评分（B3 的例外）；
  3. 已有 `wordbankSession` 当天不被强制重挑；
  4. 主线批次非空。
- 若过大可按「主线」/「词书+搜索」拆两个，但**每个提交后 App 仍须有可用学习内容**。

## 7. 仍需产品负责人决定

**Q1 · D1：第一批允许学习哪些词（唯一阻塞项）**

当前内容包 `publication` 为 0 条。fail closed 后：词书 4400 → 0，主线 563 → 0。

Codex 建议显式迁移 563 个 N5 `kanji_anchor`，`basis: "legacy_mainline_anchor"`。
**CC 同意，并明确接受 B5 的限定**：这是**兼容迁移**，依据是「当前主线正在使用 + 例句三字段齐全」，
**不构成对释义、义项对齐或来源的真实性核验**，不得等同 `verified` 或 evidence strength。
后续来源流水线应优先审计这 563 条并单独生成证据等级。

**Q2 · D2：搜索中的新 dictionary-only 词**

CC 同意 Codex 方案：P0 第一版只禁用「新建 SRS」的评分入口，已有 record 仍可评分。
`manual_save` 另开工单 —— 在修安全边界的提交里新增收藏语义会把两件事绑死。

**Q3 · D3：这些数字和标签怎么称呼**

需要同时定三处，否则 `2214` 无法迁移：

- `1775` / `2099` 的数字：叫「可学习」（用 `isLearnableWord`）还是「有完整例句」（用 `hasCompleteExample`）？
- `2214` 标签：按原注释意图应是「例句不全」，但若改叫「词典」则语义转为发布层；
- N3/N2/N1 空态文案：`final` 变 0 后，现有「整本还在起草」是否改为「词典模式」。

## 8. 对 Codex 复核的回应

| 项 | 结论 | 说明 |
|---|---|---|
| **B1** `2088` 分类与提交顺序矛盾 | **接受** | 是我的错。§2 判为准入却在 §6 当展示改，会让 P0-1 只完成一半。已重排，见 §5.5 / §6 |
| **B2** 5 个调用点、漏了 `2214` | **接受** | 已核：`1972` 是定义，调用点 5 个。已补 `2214` 迁移方案，并指出它**不能由 CC 单方决定**（§7-Q3）|
| **B3** 引入 / 复习双边界 | **接受** | 已加 `canIntroduceWord` / `canReviewWord`，并补上「有 record 的 dictionary-only 词仍可评分」这条例外及其验收用例 |
| **B4** 计数与等级事实有误 | **接受** | 已核，Codex 数字全对。补充**错因**：我用了「最高等级归属」而非 `WORDBOOKS` 的 membership 口径（§5.2）。同意改由脚本产出基线 |
| **B5** 563 条只能叫兼容迁移 | **接受** | 已在 §7-Q1 明确写为兼容迁移，不等同 `verified`，并写明后续需单独生成证据等级 |
| **B6** F3 不能关闭 | **接受** | 已核代际漂移(内容包 6563/588 vs staging 6595/661)，并确认两边都无 run id / 输入 SHA / 下载时间。本轮不动声调数据与脚本 |

**无反对项。** 需要产品负责人决定的三项已收敛到 §7-Q1/Q2/Q3。

一条**补充观察**（不构成反对，供 D3 参考）：`2214` 标签的原注释写明它是为了防止用户
「拿它和精修词条等同看待」，即它当时承担的是**内容成熟度提示**而非发布层提示。
若 D3 把它改成「词典」，用户在**同一本书内**会同时看到可学习词与词典词，
而这正是 R2「N3/N2/N1 暂时 dictionary-only」想表达的状态 —— 两者语义能对上，
但文案需要一并想清楚，否则会出现「整本 1790 词 / 可学习 0」的自相矛盾界面。

## 9. 本轮实际变更

- 业务代码：无
- 内容数据：无
- 外部内容仓库：无
- 文档：仅本报告（第 2 版）
- 测试：未运行产品测试（无代码变更）。只运行只读统计与调用点搜索：
  `grep -n "isDraftedWord" App.js`、按 levels membership 的例句齐全计数、
  主线池 `levels` 分布、内容包与 staging 的 `agree` 分布对比。
  这些统计**未写入仓库**，可用同一份 `assets/content.fallback.json` 与
  `staging/pitch-confidence.json` 复现。

---

# 第 3 版补充 · 回应 B7–B8

> 修订日期：2026-08-20 · 仍为影响分析，未编码
>
> 本节只回应 B7、B8 与产品负责人已收敛的 D1–D3。B1–B6 的结论见上文，不复述。

## 10. B7 · 词书「先当词典翻」的绕过路径

**接受，且实测比复核描述的更宽 —— 有三个入口，不是一个。**

### 10.1 代码证据

绕过链逐行复现：

| 步骤 | 位置 | 事实 |
|---|---|---|
| 用户开「先当词典翻」 | `App.js:1991` | `showDrafts` state |
| 过滤被跳过 | `App.js:2087-2088` | `skipDraftFilter = statusFilter==='today' \|\| ==='due' \|\| showDrafts`；`filtered = skipDraftFilter ? byStatus : byStatus.filter(...)` |
| 打开详情 | `App.js:2141` | `if (selectedWord) return <WBDetailPage .../>` |
| **无条件**传评分回调 | `App.js:2147` | `onGrade={gradeWord}` —— 没有任何条件 |
| **无条件**渲染评分区 | `App.js:2450-2470` | 整段 `<View style={wd.section}>` 无渲染条件；`2455` 三个按钮、`2466` 「这个词不用再问我了」 |
| 写入 SRS | `App.js:2107` → `useReview.js:84` | `grade(key, g, bookId)` |

`2466` 那个 `mastered` 按钮尤其要注意：它是**唯一带条件**的(`record?.status !== 'mastered'`)，
但条件判的是 status 不是 publication，**对没有 record 的 dictionary-only 词反而恒真**。

### 10.2 ⚠️ 补充：不止 `showDrafts`，共三个入口

`skipDraftFilter` 有三个分支，加上一条与列表无关的跳转，实际有**四条路径**能让
详情页拿到非默认列表内容：

| 路径 | 位置 | 是否需要用户显式操作 |
|---|---|---|
| `showDrafts`（先当词典翻） | `2087` | 是，用户点按钮 |
| `statusFilter === 'today'` | `2087` | 否 |
| `statusFilter === 'due'` | `2087` | 否 |
| **词场成员跳转 `openMember`** | `2122` / `2155` `onOpenWord` → `2404` | 否 |

第四条是复核里提到但未编号的那条。`2122` 的 `openMember` 从**全库**按 id 找词
（原注释：「全库找，不限本词书 —— 紅葉(N2) 的成员是 秋(N5)、落ち葉(N1)」），
所以它能把**任意等级、任意 publication 状态**的词直接推进详情页，
完全绕开 `2088` 的列表过滤。

**结论**：准入不能守在列表上，只能守在**详情页拿不拿得到 `onGrade`** 这一层。
这正是 B7 的修订要求，我完全同意，并补上第四条路径的验收用例。

### 10.3 修订方案（采纳 B7）

```ts
canGradeWord(word, record) = canIntroduceWord(word) || canReviewWord(word, record)
//                            ↑ 可作为新内容引入      ↑ Boolean(record)，已学过的不剥夺
```

- `App.js:1798`（搜索详情）与 `App.js:2147`（词书详情）**用同一个判断**决定是否传 `onGrade`；
- `WBDetailPage` 在 `onGrade` 缺失时**不渲染 `2450-2470` 整段**，改为只读说明
  「仅供查询，暂未开放学习」（D3 已定文案）；
- `2466` 的 `mastered` 按钮随整段一起隐藏 —— 它现在的条件挡不住这个场景；
- 判断放在**调用方**，不进 `grade()`（B3 已确认：`grade` 同时服务深内容，
  参数只有 key/bookId，在里面猜 publication 是错的层）。

## 11. B8 · `isDictionaryEntry` 不能从字段形状推断

**接受。这正是本轮在修的那个病换个字段重演一遍。**

我第 2 版把它写成「有 `word` + `reading`」，那是**结构校验**不是发布层。
按那个写法，规则会从「例句齐全 → 自动可学」变成「表记读音齐全 → 自动可查」——
同一个错误换了个字段。

### 11.1 采纳的边界

```ts
hasDictionaryShape(word) = Boolean(word?.word && word?.reading
                                   && (word?.meaning_zh || word?.meaning_en))
isDictionaryEntry(word)  = hasDictionaryShape(word) && word?.publication?.dictionary === true
```

`hasDictionaryShape` 是**结构校验**，用于迁移脚本筛候选和数据体检；
`isDictionaryEntry` 是**发布判断**，用于运行时。两者不可互相替代。

### 11.2 B8 的三个数字，复现结果

| 项 | Codex | CC 复现 | 一致 |
|---|---:|---:|---|
| 满足最小结构 | 8005 | **8005** | ✅ |
| 带 `jmdictSeq` | 6683 | **6683** | ✅ |
| 「只给 join 成功者 dictionary」会隐藏 | 1322 | **1322** | ✅ |
| 主线 563 条中带 `jmdictSeq` | 19 | **19** | ✅ |
| 主线在 Dictionary 层会失败的 | 544 | **544** | ✅ |
| 当前已有 `publication` 字段的 | — | **0** | — |

`jmdictSeq` 不能当 Dictionary 依据这一点是确凿的：**563 条主线词里 544 条没有 seq**，
按它迁移会让主线词在 Dictionary 层失败、Learning 层通过，产生一个自相矛盾的状态。

### 11.3 分层 basis（采纳）

```json
{
  "publication": {
    "dictionary": true,
    "learning": true,
    "dictionaryBasis": "legacy_dictionary_compat",
    "learningBasis": "legacy_mainline_anchor"
  }
}
```

两个 basis 必须分开记录。共用一个字段的话，以后按来源流水线**单独关闭 Dictionary
或单独提升 Learning** 时无法区分依据来自哪一层。

## 12. 对产品负责人 D1–D3 决定的确认

### D1 · 8005 Dictionary + 563 Learning —— 同意，可执行

按此策略的迁移面（已实测）：

```
publication.dictionary = true   8005 条   basis: legacy_dictionary_compat
publication.learning   = true    563 条   basis: legacy_mainline_anchor
publication.learning   = false  7442 条
```

- 8005 条**全部**满足 `hasDictionaryShape`（实测，无例外），迁移不会漏；
- 563 条主线词也全部满足，Dictionary/Learning 两层一致，不会出现 §11.2 那种矛盾态；
- 用户可感知的变化：**查词能力完全不变**；词书默认列表与「可学习」计数会大幅收缩
  （N5/N4 之外基本归零），这是 D3 文案要承接的。

⚠️ 按 B5：这两个 basis **都不代表真实性核验**，不得等同 `verified` 或 evidence strength。
产品负责人的表述（「两者都不代表真实性核验」）与此一致。

### D2 · 暂不做「加入我的词」—— 同意

搜索与词书浏览**统一规则**：不可学习且无旧 record → 只能查看不能评分；已有 record 继续复习。
这条正是 §10.3 的 `canGradeWord`，两个入口用同一个判断，不留第二套语义。

### D3 · 文案 —— 同意，但有两处需要你再定

采纳的口径：

| 位置 | 新文案 | 用哪个 selector |
|---|---|---|
| 货架 / 书内头部 | `共 N 词可查 · M 词可学习` | `isDictionaryEntry` / `isLearnableWord` |
| `2214` 发布层标签 | 「仅词典」 | `isLearnableWord === false` |
| 例句缺失标签（**另一个**标签） | 「无例句」 | `hasCompleteExample` |
| 空态 | 「开放词典查询，学习内容正在分批核验」 | — |
| dictionary-only 详情无 record | 「仅供查询，暂未开放学习」 | `canGradeWord === false` |

两点请确认：

1. **「仅词典」和「无例句」会不会同时出现在一行？** 实测 N3 有 1373 条例句齐全但
   将是 dictionary-only —— 它们只挂「仅词典」；而 N3 另有 339 条两个标签都会中。
   一行两个标签是否可接受，还是「仅词典」优先、隐藏「无例句」？
2. **空态按钮**：Codex 建议叫「浏览词典」。现有按钮是「先当词典翻」（`showDrafts` 的入口）。
   两者是同一个按钮，改名的话 `showDrafts` 这个 state 名也该跟着改，
   否则下一个人会以为它还和「起草」有关。

## 13. 提交计划（第 3 版，替换 §6）

### Commit 1 · 纯 selector、类型与测试（无行为变化）

- 新增 `src/features/wordbank/publication.ts`：
  `hasDictionaryShape` / `isDictionaryEntry` / `isLearnableWord` / `hasEditorialDepth` /
  `hasCompleteExample` / `canIntroduceWord` / `canReviewWord` / `canGradeWord`；
- 缺 `publication` 时 fail closed；
- **结构校验与发布判断分开**（B8）；
- 测试：不写「主线交集非空」（publication 未迁移时必然失败）。
- 验收：`npm test` 全绿；无调用点，线上零变化。回滚：删文件。

### Commit 2 · 兼容迁移与生成校验（依赖 D1，唯一改数据的提交）

- 脚本按 D1 写入两层 publication 与两个 basis；
- fallback 与 `yan-content/content.v2.json` 保持一致（`wordIds.test.mjs` 守着）；
- **统计由脚本产出，不手填条数**（B4）；
- 校验：8005 条 dictionary、563 条 learning、0 条只有 learning 没有 dictionary。
- 回滚：内容包 revert。⚠️ 三个提交里回滚成本最高的一个。

### Commit 3 · 一次接完所有准入边界

- 主线：`anchorPool` ∩ `canIntroduceWord`；
- 词书新 session `2042`、默认列表 `2088`：`canIntroduceWord`；
- **搜索详情 `1798` 与词书详情 `2147`：同一个 `canGradeWord` 决定是否传 `onGrade`**；
- `WBDetailPage` 无 `onGrade` 时不渲染 `2450-2470`，改只读说明；
- 计数 `1775`/`2099`、标签 `2214` 按 D3 改文案与 selector；
- `today` / `due` / 既有 record 继续可复习。

验收用例（同提交内补齐，**前四条对应四个入口**）：

| # | 场景 | 期望 |
|---|---|---|
| 1 | 搜索 → dictionary-only 且无 record | 无评分入口，显示「仅供查询」 |
| 2 | 搜索 → dictionary-only 但**有** record | **仍可评分**（B3 例外） |
| 3 | **「先当词典翻」→ dictionary-only 无 record** | 无评分入口（B7 主路径） |
| 4 | **词场成员跳转 → 跨等级 dictionary-only 无 record** | 无评分入口（§10.2 第四条路径） |
| 5 | `today` / `due` 视图里的旧 record | 仍可见、仍可评分 |
| 6 | 已存在的 `K.wordbankSession` | 当天不被强制重挑 |
| 7 | 主线批次 | 非空（563 条已迁移） |

若 Commit 3 过大，按「主线」/「词书+搜索+详情」拆两个；但**详情页那一层必须和它的两个调用方在同一个提交**，
否则会出现「列表过滤了、详情还能评分」的窗口 —— 那正是 B7 描述的形状。

## 14. 本轮实际变更（第 3 版）

- 业务代码：无
- 内容数据：无
- 外部内容仓库：无
- 文档：仅本报告
- 测试：未运行产品测试（无代码变更）。只运行只读核对：
  `sed -n` 读 `App.js:2087-2088 / 2141-2155 / 2448-2472 / 2122`、
  以及一次性 `python3` 统计（结构完整 8005、`jmdictSeq` 6683、主线 seq 19、已有 publication 0）。
  统计脚本未写入仓库，可用同一份 `assets/content.fallback.json` 复现。

---

# Commit 1 实现结果 · publication 纯 selector

> 完成日期：2026-08-20 · **未接入任何调用点，线上行为零变化**
>
> 下一步：等待 Codex 审 diff。**未开始 Commit 2/3。**

## 15. 修改文件

| 文件 | 状态 | 行数 |
|---|---|---|
| `src/features/wordbank/publication.ts` | 新增 | 178 |
| `src/lib/__tests__/publication.test.mjs` | 新增 | 165 |
| `docs/handoff/CC-REPORT.md` | 追加本节 | — |

未修改任何其他文件。`git status` 显示的另外两项（`docs/ROADMAP-content-trust-structure-ui.md`、
`docs/handoff/`）是本工单之前就存在的未跟踪文件，不是本轮产生。

## 16. 每个函数的实际规则

| 函数 | 实际实现 | 与工单要求的差异 |
|---|---|---|
| `hasDictionaryShape(word)` | `word` 与 `reading` 非空，且 `meaning_zh` 或 `meaning_en` 至少一个非空。**纯结构** | 无 |
| `isDictionaryEntry(word)` | `hasDictionaryShape(word) && publication.dictionary === true` | 无 |
| `isLearnableWord(word)` | `isDictionaryEntry(word) && publication.learning === true` | 无。Dictionary 前置写死在函数里，**结构上不可能出现 Learning 通过而 Dictionary 失败** |
| `hasCompleteExample(word)` | `exampleJp` / `exampleZh` / `exampleRoma` 三者均非空 | 无。不读 `publication` |
| `hasEditorialDepth(word)` | `coreChunk` 非空 ‖ `wordField` 是对象 ‖ `yanFeatures` 是非空数组 | 无 |
| `canIntroduceWord(word)` | `= isLearnableWord(word)` | 无 |
| `canReviewWord(_word, record)` | `Boolean(record)`。**第一个参数不参与判断** | 无。签名保留 `word` 是为了调用点读起来对称，函数体不用它 |
| `canGradeWord(word, record)` | `canIntroduceWord(word) \|\| canReviewWord(word, record)` | 无 |

三条实现细节，都是工单规则的直接落实：

1. **非空判断一律 `trim()` 之后**。`' '` 是 truthy，不 trim 会被当成有内容。
2. **布尔严格 `=== true`**，不用 truthy。`{ dictionary: 1 }` / `{ learning: 'true' }` 一律 false —— 内容包是脚本生成的，形状漂移只能挡不能猜。
3. **`publication` 非对象形状一律当作没有**（`null` / 字符串 / 数组 / 布尔），走 fail closed。

## 17. 测试

新增 17 条，全部为纯函数测试。覆盖工单的 10 条矩阵：

| # | 矩阵项 | 对应测试 |
|---|---|---|
| 1 | 字段齐全无 publication | 「两层都 false(fail closed)」 |
| 2 | `dictionary:true` 结构坏 | 「publication 说可查，但结构是坏的」+「空白字符不算有内容」 |
| 3 | `learning:true` Dictionary 不成立 | 「禁止 Learning 通过、Dictionary 失败」 |
| 4 | Dictionary true / Learning false | 「可查，不可引入」 |
| 5 | 两层都 true | 「可引入，没有旧 record 也能评分」 |
| 6 | dictionary-only 无 record | 「不可评分」 |
| 7 | dictionary-only 有 record | 「仍可复习、仍可评分」 |
| 8 | 例句与 publication 无关 | 「例句齐不齐和能不能学是两回事」+「缺任一项/只有空白」 |
| 9 | editorial 边界 | 「只回答有没有这些字段」+「空值边界」 |
| 10 | 脏输入不抛 | 「null/undefined/错误形状一律 false，绝不抛」+「publication 本身错误形状」 |

⚠️ **按工单要求，没有写「主线池交集非空」断言** —— 内容包 `publication` 当前为 0 条，
该断言现在必然失败，而失败原因与这些函数是否正确无关。它属于 Commit 2 之后的验收。

### 篡改验证

每条关键规则拆一次，确认测试真的会挂：

| 篡改 | 挂掉 |
|---|---:|
| A · Learning 不再要求先是 Dictionary | 1 |
| B · 去掉 `trim()` | 4 |
| C · `canGradeWord` 忘掉旧 record 那一半 | 1 |
| D · `dictionary` 用 truthy 而非 `=== true` | 1 |

四次全部被抓到，源码已还原。

## 18. 验收命令与结果

```
npm test          → tests 528 / pass 528 / fail 0     （基线 511，本轮 +17）
npm run typecheck → tsc --noEmit，exit 0，无输出
```

基线在本轮开始前跑过：`511/511`、`tsc` 0 错误。**无既有失败**，因此没有需要记录的无关基线问题。

## 19. git diff --stat

两个文件均为新增（untracked），`git diff --stat` 对已跟踪文件为空：

```
$ git status --porcelain YanApp/
?? YanApp/src/features/wordbank/publication.ts
?? YanApp/src/lib/__tests__/publication.test.mjs
?? YanApp/docs/handoff/                     ← 本工单之前已存在
?? YanApp/docs/ROADMAP-content-trust-structure-ui.md   ← 同上

$ git diff --stat YanApp/
（空 —— 没有修改任何已跟踪文件）
```

## 20. 本轮实际变更

- 业务代码：**无**（新增文件零调用点，`App.js` 未触碰）
- 内容数据：无
- 外部内容仓库：无
- 迁移脚本：无
- 文档：仅本报告追加 §15–§20
- 测试：+17 条，528/528 全绿；typecheck exit 0

**未开始 Commit 2/3。** 等待 Codex 独立复核 diff。

---

# Commit 1 修订 · 回应 C1–C4

> 修订日期：2026-08-20 · 仍**零调用点**，运行时行为无变化
>
> 下一步：等待 Codex 再审 diff。**未开始 Commit 2。**

## 21. C1 · 空 `wordField` 被误判为编辑深度

**接受。这是本轮唯一的真 bug，而且比「实现写错」更难发现 —— 测试把错的行为锁住了。**

修订前实测（`hasEditorialDepth({ wordField: v })`）：

```
{}                 true      ← 空壳
[]                 true
new Date()         true      ← 连日期对象都算
{ members: [] }    true      ← 而测试第 141 行把它固化成期望值
```

我上一版写的是 `word.wordField && typeof word.wordField === 'object'` —— 只判「字段存在」。
**这正是这一整轮在修的那个病的第三次现身**：先是「例句齐全 → 自动可学」，
然后是我在 §11 被指出的「表记读音齐全 → 自动可查」，现在是「wordField 字段存在 → 自动有深度」。
同一个错误换第三个字段。

### 修订口径（与运行时对齐）

新增内部守卫 `hasRealWordField()`，口径抄自 `src/features/review/units.js:186` 的 `wordFieldsOf()`：

```js
// units.js（既有运行时）
return list.filter(x => x?.sentence?.jp);
```

理由是**可验证的**，不是我的偏好：`wordFieldsOf()` 是复习队列真正读词场的地方，
一个不带 `sentence.jp` 的条目在那里产不出任何一道题。拿它去货架上声称「有编辑深度」，
那句话是空的。

在此之上按工单要求补了 `trim()`（`wordFieldsOf()` 没做，但工单第 1 项明确要求 trim 后非空）。

三条通路修订后：

| 字段 | 判据 |
|---|---|
| `coreChunk` | trim 后非空字符串 |
| `wordField` | 对象或数组中**至少一条**的 `sentence.jp` trim 后非空 |
| `yanFeatures` | 数组且**至少一个元素**是 trim 后非空字符串 |

修订后实测：

```
wordField:  {} / [] / new Date() / {members:[]} / {sentence:{}} /
            {sentence:{jp:'   '}} / [{}] / [null] / 'jp' / 0        → 全部 false
wordField:  {sentence:{jp:'雨が降る'}} / [{sentence:{jp:'雨が降る'}}] → true
yanFeatures: [] / [null] / [' ','\t'] → false ;  ['x'] / [null,'x'] → true
```

`hasEditorialDepth` 仍**不参与** publication 或真实性判断，注释里写明了。

## 22. C2 · `canReviewWord` 的输入契约

**接受。契约互相矛盾这一点说得对**：类型写 `unknown`、工单又承诺「错误形状返回 false」，
而实现是 `Boolean(record)` —— 三者对不上。

### 类型

```ts
export type ProgressRecord = Record<string, unknown> | null | undefined;
```

### 判据

新增 `isProgressRecord()`：**非数组对象**为 true。

```
null / undefined / 'corrupt' / '' / 0 / 3 / true / false / NaN / [] / [{}]  → false
{} / { box: 1 } / { status: undefined, dueAt: null }                        → true
```

### 两条刻意不做的事

1. **不按 `status` / `box` / `dueAt` 再加门槛**（工单明确要求）。一条字段不全的旧记录
   同样是用户学过的证据；挡掉它等于替用户决定那次学习不算数 ——
   **那会把「内容发布收紧」悄悄变成「用户进度清理」**。所以空对象 `{}` 返回 true。
2. 第一个参数 `_word` 仍然保留但不参与判断，签名对称是为了调用点读起来一致。

按 Codex 的说明，这条记为**原任务书对 `record` 形状表述不足**，不是 CC 实现漂移。

## 23. C3 · 删除会漂移的手写统计

**接受。** 已从 production selector 与测试注释中删除全部当前快照数字：

| 位置 | 删掉的内容 |
|---|---|
| `publication.ts` 文件头 | `4400 / 3037 / 716 / 645 / 2` 那段放行统计 |
| `publication.ts` `isLearnableWord` 注释 | `563 / 19 / 544` 的 jmdictSeq 矛盾态举例 |
| `publication.test.mjs` 「禁止 Learning 通过」用例 | 同上三个数字 |

保留的是**不随内容包变化的设计理由**：

- 「结构永远不能自动升级成发布」；
- 「Learning 必须先属于 Dictionary，前置写在函数体里，不靠调用方记得」；
- 「fail closed 的理由：读不到 ≠ 没有」。

动态计数属于迁移脚本与验收报告，不属于长期业务注释 —— 这一条我同意，
因为我自己在第 1 版就因为口径搞错写出过 `1318/734/993`（见 §5.2）。

## 24. C4 · 修正实现报告

**接受，三处都改。**

### 24.1 行数

上一版报的 178/165 是错的。当时的真实值是 Codex 复核的 176/175。
**本次修订后**（新增守卫与用例）：

```
$ wc -l
     218 src/features/wordbank/publication.ts
     215 src/lib/__tests__/publication.test.mjs
```

### 24.2 「业务代码：无」的表述

改为：**新增领域源文件与测试，零调用点，运行时行为无变化。**

上一版那句话会让人以为本轮没交付代码。准确的说法是「交付了代码，但它还没有被任何人调用」。

### 24.3 ⚠️ `git diff --stat` 不能当证据

`git diff` **默认忽略 untracked 文件**，所以上一版拿它的空输出证明「没有代码变更」是**无效证据** ——
它对任何全新文件都会是空的。正确的描述方式：

```
$ git status --porcelain YanApp/src YanApp/App.js
?? YanApp/src/features/wordbank/publication.ts
?? YanApp/src/lib/__tests__/publication.test.mjs
          ↑ 只有两个新文件；App.js 与其余已跟踪源码零改动

$ git diff --no-index --numstat /dev/null <file>
publication.ts        218 行新增
publication.test.mjs  215 行新增
```

`App.js` 未出现在 `git status` 里，这才是「未接入调用点」的有效证据。

## 25. 测试与篡改验证

```
npm test          → tests 531 / pass 531 / fail 0    （基线 511，本轮 +20）
npm run typecheck → tsc --noEmit, exit 0，无输出
```

上一版 17 条 → 本版 20 条。**原有覆盖一条未减**（publication 真值表、Learning/Dictionary 前置、
例句独立、旧 record 保护、脏输入不抛全部保留），新增/重写的是：

| 用例 | 对应 |
|---|---|
| 「空壳不算编辑深度」（10 种形状） | C1，**重写**，替代原来把 `{members:[]}` 固化成 true 的那条 |
| 「editorial 的其余空值边界」 | C1，扩充 `yanFeatures` 元素级判断 |
| 「hasEditorialDepth 三条通路各自成立」 | C1，补了 wordField 的对象/数组两种形状 |
| 「record 的判据是非数组对象，不是 truthy」 | C2，新增，12 种脏值 |
| 「空对象 record 仍然算学过」 | C2，新增，锁住「不拿字段完整度当门槛」 |

### 篡改验证：五次，全部被抓到

| 篡改 | 挂掉 |
|---|---:|
| C1 回退 · `wordField` 只判 truthy object（即复核抓到的原 bug） | 1 |
| C1 回退 · `yanFeatures` 只判长度，不判元素非空 | 1 |
| C1 回退 · `sentence.jp` 不做 trim | 1 |
| C2 回退 · `canReviewWord` 用 `Boolean(record)` | 1 |
| C2 回退 · `isProgressRecord` 忘记排除数组 | 1 |

**前三条尤其重要**：它们证明新测试真的能挡住上一版那个 bug，
而不只是把新行为重新固化一遍。源码已逐处确认还原（5 处 grep 全部命中修订后实现）。

## 26. 本轮实际变更（Commit 1 修订）

| 项 | 变更 |
|---|---|
| 业务代码 | **新增领域源文件，零调用点，运行时行为无变化**；`App.js` 未触碰 |
| 内容数据 | 无 |
| 外部内容仓库 | 无 |
| 迁移脚本 | 无 |
| 文档 | 仅本报告追加 §21–§26 |
| 测试 | 531/531（+20 于基线 511）；typecheck exit 0 |

变更摘要（覆盖 untracked）：

```
新增  src/features/wordbank/publication.ts        218 行
新增  src/lib/__tests__/publication.test.mjs      215 行
修改  docs/handoff/CC-REPORT.md                   追加 §21–§26
其余已跟踪文件：0 处改动（git status 未列出 App.js 等）
```

**未开始 Commit 2。** 等待 Codex 再审。

---

# Commit 2 实现结果 · publication 兼容迁移

> 完成日期：2026-08-20 · **未 commit、未 push、未接 App**
>
> 下一步：等待 Codex 独立复核。**未开始 Commit 3。**

## 27. 开工前基线(§11-1)

```
git status --short -- yan-content/content.v2.json YanApp/assets/content.fallback.json
  → 空(两份都干净)
cmp -s …                      → 逐字节相同
```

| 项 | 实测 | 工单 §2 基线 | |
|---|---|---|---|
| 字节 | 6,743,897 | 6,743,897 | ✓ |
| SHA-256 | `c7e24daf…0c06f67a` | `c7e24daf…0c06f67a` | ✓ |
| `wordBank` | 8005 | 8005 | ✓ |
| 已有 `publication` | 0 | 0 | ✓ |
| `kanji_anchor` | 563 | 563 | ✓ |
| 末尾换行 / 缩进 | 有 / 1 空格 | 同 | ✓ |
| id 缺失 / 重复 | 0 / 0 | — | ✓ |

另外**独立验证了工单 §6 的序列化前提**：
`json.dumps(doc, ensure_ascii=False, indent=1) + "\n"` 对基线文件**逐字节 round-trip 成立**。
这是整个 diff 预算的地基，不先验它，后面 40,588 这个数字没有意义。

基线测试：`npm test` **531/531**、`npm run typecheck` **exit 0**。**无既有失败。**

## 28. 实际修改文件(§11-2)

| 文件 | 状态 |
|---|---|
| `tools/stamp-wordbank-publication.py` | 新增(迁移脚本) |
| `yan-content/content.v2.json` | 修改(+40,588 / −0) |
| `YanApp/assets/content.fallback.json` | 修改(+40,588 / −0) |
| `YanApp/src/lib/__tests__/publication-content.test.mjs` | 新增(9 条契约测试) |
| `YanApp/src/lib/__tests__/publication.test.mjs` | 仅删除「publication 仍为 0」的过期注释(§4 允许) |
| `YanApp/docs/handoff/CC-REPORT.md` | 追加本节 |

**未修改** `App.js`、`publication.ts`、任何 validator 或其他业务文件。

## 29. dry-run / apply / check 统计(§11-3)

三个模式统计一致：

```
dictionary_true                  8005
learning_true                     563
learning_false                   7442
learning_without_dictionary         0
dictionaryBasis_ok               8005
learningBasis_ok                  563
learning_false_with_basis           0
learners_equal_anchors           True
```

最后一项是**集合相等**判断，不是计数相等 —— 数字撞对但集合不同的情况会被它抓到。

## 30. 迁移后 SHA / 大小 / numstat(§11-4)

| | 实测 | 工单 §6 预算 | |
|---|---|---|---|
| 输出大小 | **7,754,410** bytes | 7,754,410 | ✓ |
| 输出 SHA-256 | **`86a4235d40830a6758883ab0cf67a6b7422a91adcaecce853868779eee3b3631`** | 同 | ✓ |
| numstat | **40,588 / 0** ×2 文件 | 40,588 / 0 | ✓ |
| 两份 `cmp` | 逐字节相同 | — | ✓ |
| `git diff --check` | 空 | — | ✓ |

**三项预算全部逐字符命中**，且**零删除行** —— 没有发生任何格式化重排。

## 31. 非 publication 字段零变化的证明(§11-5)

用两条互相独立的证据，不只靠一条：

**证据一 · 投影哈希。** 把迁移前(`git show HEAD:`)与迁移后各自去掉 `publication` 再序列化：

```
迁移前投影 SHA  8d36ec078321bef6e5292e328a95704f
迁移后投影 SHA  8d36ec078321bef6e5292e328a95704f     ← 完全相同
```

这一条同时锁住了**词序、字段顺序、顶层键、`_meta`** —— 任何一处漂移都会让字符串不同。
脚本内部在写盘前也跑同一个投影比较，不过才生成字节。

**证据二 · diff 内容审计。** 新增行里**非 publication 相关的行数 = 0**：

```
git diff -- yan-content/content.v2.json | grep '^+' | grep -v '^+++' \
  | grep -vcE '"(publication|dictionary|learning|dictionaryBasis|learningBasis)"|^\+\s*[}],?\s*$'
→ 0
```

另外单独核过：顶层键顺序不变、词序不变、`_meta.updated` 未改、
**8005 个 `publication` 全部追加在词对象末尾**(`set(每个词的最后一个键) == {'publication'}`)。

## 32. 失败前不写 / 重复 no-op / 单边中断(§11-6)

⚠️ **失败路径全部在 `/tmp` 沙箱副本上验证**，不在真文件上制造损坏状态。
每次都记录运行**前后**的 SHA，证明脚本一个字节都没动过：

| 失败场景 | exit | 脚本是否动过文件 | 诊断输出 |
|---|---:|---|---|
| 两份输入不同(fallback `_meta` 被改) | 1 | **没有** | `不是基线 SHA(内容已被改动),且 0 条 publication` |
| `wordBank` 少一条 | 1 | **没有** | `wordBank 是 8004 条,基线要求 8005` |
| 有词结构坏(`reading` 全空白) | 1 | **没有** | 同上类 |
| 已存在残缺 publication | 1 | **没有** | `部分迁移:1/8005 条有 publication —— 8004 条缺…;1 条不合法…` |

四次均无 `.stamp-pub-*` / `.bak` / `.tmp` 残留。

⚠️ **中途修过一次诊断措辞**：第一版对「内容被改过但根本没有 publication」的文件
报的是「publication 不是合法迁移后状态」—— 会把人引到错的方向去查。
失败路径是这个脚本最该说清楚的地方(它拒绝写文件时，操作者只有那一行字可看)，
所以改成区分「不是基线 SHA」「缺 publication」「publication 不合法」三种原因。

**重复 `--apply`**：识别为「两份都已是合法迁移后状态」，打印 no-op 并跳过写入，
SHA 前后完全不变(`86a4235d…` → `86a4235d…`)。

**单边中断态**(一份已迁移、一份仍是精确基线)：
- dry-run 只报告，**运行前后 SHA 不变**；
- `--apply` 用已验证的迁移后字节修复另一份，修复后两份一致且 `--check` 通过。

**原子性**：同目录临时文件 → `fsync` → **回读比对** → `os.replace`。
两份都写完后再逐一回读验证。跨文件系统拿不到真正的单事务，所以才需要上面那条中断态修复。

## 33. 新增测试与篡改验证(§11-7)

`publication-content.test.mjs` 9 条，对应工单 §7 的 9 条不变量。

⚠️ **刻意不冻结 8005 / 563 / 7442**。那三个数字属于本次迁移验收(在 `--check` 和本报告里)，
写进永久测试的话，以后内容一增长就会因为历史数字报错 ——
**那时失败的原因和契约对不对无关，这种测试只会被人改掉，不会被人当真。**

### 四个篡改（在真文件上做，每次立即还原）

| 篡改 | `npm test` | `--check` |
|---|---|---|
| 删掉一条 publication | **539/1 挂** | **拒绝** |
| `dictionary` 改成字符串 `'true'` | **538/2 挂** | **拒绝** |
| 制造 learning-without-dictionary | **539/1 挂** | **拒绝** |
| 删掉 `learningBasis` | **539/1 挂** | **拒绝** |

**测试和脚本双双抓到** —— 两道闸互相独立，不是同一份逻辑写两遍。
还原后 `--check` 通过，SHA 回到 `86a4235d…`。

## 34. 验收命令与结果(§11-8)

```
python3 tools/stamp-wordbank-publication.py --check   → ✓ 通过
cmp -s <两份>                                          → 逐字节相同
git diff --check                                       → 空
git diff --numstat                                     → 40588/0 ×2
bash tools/check-content-release.sh                    → Blocker 0，exit 0
npm test                                               → 540 / 540（基线 531，+9）
npm run typecheck                                      → exit 0
```

`check-content-release.sh` 的 5 步全过，**Blocker 数 0**。基线在开工前已确认无既有失败，
因此没有需要「前后完全相同的证据」来对照的无关问题。

## 35. ⚠️ 兼容迁移不等于真实性核验(§11-9)

**这次迁移没有核验任何一条内容。**

- `legacy_dictionary_compat` 只表示「保留当前查询能力」——
  依据是这 8005 条现在就能被搜索到，不是它们的释义、义项对齐或来源经过了检查；
- `legacy_mainline_anchor` 只表示「保留当前 N5 主线候选」——
  依据是这 563 条现在就在主线池里，同样不构成任何内容层面的背书。

两者**都不得**映射成 `verified`、双源印证或人工核验。全库 `verified` 仍然只有 2 条，
本次迁移**一条都没有增加**。

后续来源流水线复核这些词时，必须**另外生成 evidence**，不能拿这两个 basis 冒充；
发现明确错误、授权问题或结构失败时，对应的 Dictionary publication 应当被关闭并进入异常清单。

## 36. 停止声明(§11-10)

| | |
|---|---|
| 是否接入 App | **否** —— `App.js` 未触碰，selector 仍零调用点，界面与 SRS 行为无变化 |
| 是否开始 Commit 3 | **否** |
| 是否 commit | **否** —— 停在未提交状态 |
| 是否 push | **否** |
| 是否执行内容发布 | **否** —— 只跑了只读的 `check-content-release.sh`，未跑 `push-content.sh` |
| 是否新增 verified / evidence | **否** |
| 临时文件残留 | 无(已确认无 `.stamp-pub-*` / `.bak` / `.tmp`) |

等待 Codex 独立复核。

---

# Commit 2 修订 · 回应 C5–C7

> 修订日期：2026-08-20 · **只改脚本，两份 JSON 零变化**
>
> 下一步：等待 Codex 复核并提交。**Commit 3 起由产品负责人实现，CC 只做一次短审核。**

## 37. 三条都先复现，再改

| | 复现结果 |
|---|---|
| **C5** 两份都删掉同一个非 anchor 词 | 8004 条，`--check` **exit 0** ✗ |
| **C6** 一份基线 + 一份 `_meta` 改坏但 publication 全合法 | 坏文件被判 migrated，**覆盖了好文件**，并报「✓ 通过」✗ |
| **C7** 正常 apply | 循环内 `mkstemp → 写 → replace`，第一份先落盘 ✗ |

**C6 是三条里最危险的** —— 它不是漏检，是**主动把坏内容复制到好文件上**，还给出通过信号。

## 38. C5 · 唯一的迁移后验证入口

新增 `verify_migrated(raw)`，锁死整份产物而不只是 publication 形状：

| 检查 | 值 |
|---|---|
| 字节数 | `7,754,410` |
| SHA-256 | `86a4235d…3631` |
| `wordBank` / anchor | 8005 / 563 |
| id | 完整、唯一 |
| 每条结构 | 满足 dictionary shape |
| publication | 8 项精确统计 + 集合约束 |
| **投影 SHA** | `8d36ec07…c01c3` |

最后一项是关键：**它锁的是「publication 之外的一切」** —— 词序、字段顺序、顶层键、`_meta`，
任何一处漂移它都会变。只数 publication 形状的校验挡不住 C5/C6 那两类。

`--check`、`classify()` 判 migrated、单边修复取源 **三处全部走这一个入口**，
不再各写一份会漂的弱校验。它返回 `(ok, reason, stats)` 而不打印/退出，
所以同一份逻辑既能当校验又能当分类判据。

## 39. C6 · 单边修复的来源必须完整校验过

`classify()` 现在在 publication 形状全过之后**再走一次 `verify_migrated`**：

```
publication 形状齐全,但整体校验失败:字节数 7754233,迁移后应为 7754410
```

所以「publication 合法但内容已漂移」的文件被判 `other` → `exit 1` → 两份零写入，
**不可能再成为修复源**。

## 40. C7 · 两阶段 prepare / commit

拆成 `prepare()`（写临时文件 + `fsync` + 回读，**不替换**）和 `write_all_atomic()`
（全部准备成功后再依次 `os.replace`）。准备阶段任意失败：清理所有临时文件，两个目标零变化。

原写法的问题不是「不够原子」，而是**它制造了一个本可以避免的中断态**：
第二份准备失败时第一份已经被换掉了。现在窗口从「整个生成+写入」缩到「两次 `replace` 之间」，
剩下那一段仍由单边恢复兜底（跨文件 `replace` 拿不到真正的单事务）。

## 41. 修订验收（5 条全过）

⚠️ 前三条在 `/tmp/c567` 副本上做，不在真文件上制造损坏。

| # | 场景 | 结果 |
|---|---|---|
| 1 | 两份都删同一个非 anchor 词 | `--check` **exit 1**，`✗ 字节数 7753625,迁移后应为 7754410` |
| 2 | 一份精确基线 + 一份 `_meta` 坏 | dry-run 与 `--apply` **均 exit 1**；基线那份 **污染 0 处、SHA 不变** |
| 3 | 第二个临时文件准备失败（目录设只读） | **第一份目标 SHA 未变**、第二份未变、**临时文件残留 0 个** |
| 4 | 真文件 `--check` | 通过；两份 SHA 仍是 `86a4235d…`；**`git diff --numstat` 仍是 40588/0** |
| 5 | 测试 / typecheck / release audit | `npm test` **540/540**、typecheck **exit 0**、`check-content-release.sh` **Blocker 0, exit 0** |

第 4 条同时满足工单「不要改 JSON；若修订导致 JSON 出现 diff 变化，立即停止」——
**JSON 一个字节都没动。**

## 42. 本轮变更

| 文件 | 变更 |
|---|---|
| `tools/stamp-wordbank-publication.py` | 新增 `verify_migrated` / `prepare` / `write_all_atomic`；删除旧 `write_atomic`（已确认零残留）；`classify` 与 `cmd_check` 改用统一入口 |
| 两份 JSON | **零变化**（SHA 与 numstat 均未变） |
| 测试文件 | 未改 |
| `App.js` | 未触碰 |
| `CC-REPORT.md` | 追加 §37–§42 |

## 43. 停止声明

未 commit、未 push、未接 App、未开始 Commit 3。

按新分工：**Commit 2 由产品负责人复核并提交；Commit 3 起由产品负责人实现，CC 只做一次短审核。**

---

# Commit 3 · publication 行为接入短审

> 审核日期：2026-08-20
> 结论：**通过，无阻塞项，可以 commit**

## 44. 范围与五项核对

本轮只改 `App.js`、接线测试与交接文档；内容 JSON、迁移器、`publication.ts` 均未变化。

| 问题 | 结论 | 证据 |
|---|---|---|
| Q1 旧例句准入是否清除 | 通过 | `isDraftedWord` / `showDrafts` / `draftTag` / “起草” / “定稿”在 `App.js` 均 0 命中 |
| Q2 评分入口是否同一守门 | 通过 | 搜索详情和词书详情均条件传 `onGrade`；词场成员跳转复用词书详情，不另设评分入口 |
| Q3 dictionary-only + 旧 record | 通过 | 独立逻辑验证：无 record false，有 record true；可学习词无 record true |
| Q4 新词入口 | 通过 | 两条主线、session、默认列表均使用 `canIntroduceWord` |
| Q5 越界/夸大 | 通过 | 没有内容/迁移改动；兼容迁移文案没有称为真实性核验 |

详情页评分区与“这个词不用再问我了”按钮整体位于 `onGrade ?` 分支；无 `onGrade` 时只显示只读说明。

## 45. 篡改与复跑

三项篡改均被新接线测试抓到：移除词书详情守门、移除主线 `canIntroduceWord` 交集、移除默认词书列表过滤。源码已还原。

```text
npm test          546 / 546
npm run typecheck exit 0
eslint App.js     0 errors
git diff --check  exit 0
```

---

# P0-2 · 远端内容运行时结构闸门（只读核对）

> 核对日期：2026-08-20
> 范围：`src/lib/contentCache.js`、`App.js` 的 `useContent()` / `CONTENT_URL`、各顶层字段的实际消费点
> 结论：**工单方向成立；但「最小结构」清单有 1 处会误伤合法内容的错误、2 处过宽、2 处漏项**
> 本轮未编码、未 commit、未 push。

## 46. 三条路径的实际行为

`CONTENT_URL = https://raw.githubusercontent.com/YSY929YSY/yan-content/main/content.v2.json`（`App.js:10`）。
`SHOULD_FETCH_REMOTE_CONTENT`（`App.js:13`）在 `__DEV__` 下为 false —— **开发与测试期根本不走远端路径**，所以这条路径没有任何现存测试覆盖，也不会在本机自然暴露。

| 路径 | 代码 | 写入 | 消费 | ETag |
|---|---|---|---|---|
| 200 | `contentCache.js:65-70` | `JSON.parse` 成功后立刻 `writeCachedContent(text, etag)` 覆盖 `yan_content_v2.json` | `source:'network'` → `setContent` | 用响应头 etag 覆盖 |
| 304 | `:57-63` | 无 | `readCachedContent()` 直接 `setContent`，**中途无任何结构判断** | 缓存缺失时 `removeItem(ETAG_KEY)` |
| 网络失败/超时/`!res.ok` | `:71-75` | 无 | `readCachedContent()` → `source:'cache'` | 不动 |

关键事实三条：

1. **唯一的闸门是 `JSON.parse` 的语法性**（`:68` 注释自称「别把坏 JSON 存进去」，但它只挡语法）。结构错误的合法 JSON 直接落盘。
2. **缓存读取路径（304 与 network-error）完全没有校验**。所以即使将来只在 200 处加校验，历史上已落盘的坏缓存仍会经 304 无限期复活。**validator 必须同时挂在写入前和读取后**，工单第 3 条要求成立。
3. `writeCachedContent` 先写文件、后写 ETag，且自身 try/catch 吞掉异常。因此存在「文件写成功、ETag 未写成功」的中间态；反向的「ETag 写了但文件没写」不会发生。这个顺序对本工单有利，实现时应保留。

## 47. App 实际依赖的顶层字段

内置包顶层 14 个键。实际消费点与守卫情况：

| 字段 | 内置包类型 | 消费点 | 现有守卫 | 缺失/类型错时 |
|---|---|---|---|---|
| `scenes` | array(6) | `App.js:943` `.filter`、`:1634` `.map` | 无 | 崩溃 |
| `mapPlaces` | array(43) | `:6299` 原样传 `NaTab` → `useWorldFootprint.js:111` `initialPlaces.map` | `:805` 有 `\|\| []`，**`:6299` 没有** | 崩溃 |
| `culturalFusion` | array(4) | `:804` `[fusionIdx]`、`:987` `.map` | 无 | 崩溃 |
| `subwayAdventure` | object | `:1496` → `SubwayScreen` `adventure.stations`、`stations.length` | hydrate 处有 `?.`，渲染处 `const stations = adventure.stations` 无守卫 | 崩溃 |
| `kanaRows` | array(20) | `:680` `useKanaGate`、`KanaScreen.js:990/991` `.filter` | `requiredKana` 内部有 `\|\| []`，**KanaScreen 的 `.filter` 无守卫** | 崩溃 |
| `voicedRows` `yoonRows` `specialRows` `loanwordRows` | array | `KanaScreen.js:1056/1076/1102/1117` | 全部 `(x \|\| []).map` | 缺失安全；**非数组真值仍崩溃** |
| `wordBank` | array(8005) | `:683/1431` `anchorPool(content.wordBank \|\| [])` → `dailyTask.ts:308` `bank.filter`；`:1524/1532` | 一律 `\|\| []` | 缺失安全；非数组真值崩溃 |
| `specialSounds` | **object** | `KanaScreen.js:1685` `specialSounds?.sections?.map` | 全程可选链 | 安全降级 |
| `wordCards` | **object** | `App.js:3379 resolveWordCards` | 自带类型闸门：非对象或**数组**一律退回 `WORD_CARDS_BUILTIN` | 安全降级 |
| `_meta` | object | **App 与 src 内 0 处消费** | — | 无影响 |
| `cultureNotes` | array(6) | **App 与 src 内 0 处消费** | — | 无影响 |

## 48. 对工单「最小结构」的裁定

### 48.1 必须改：`wordCards` 的规则是错的

工单写「`wordCards` 若存在必须为数组（可为空）」。**内置包里 `wordCards` 是对象**（键为 `order,sumimasen,oyu,...`），`resolveWordCards` 也明确把数组当作非法输入丢弃。按工单实现，validator 会判定当前正式内容包无效，导致所有安装退回 fallback —— 这是本次核对发现的唯一会造成即时线上故障的条款。

裁定：**`wordCards` 从最小结构中整条删除**。它已有本地闸门，validator 不需要重复表态。

### 48.2 过宽：`_meta` 的「非空版本标识」

`_meta` 在 App 运行时零消费，删掉它不会让任何页面失效，不符合工单自设的「只锁会让主要页面直接失效的边界」。而拒绝 `{}` 这件事已由 `scenes`/`wordBank` 等必需字段完成，不需要 `_meta` 兜底。

裁定：**降级为 `_meta` 必须是对象（若存在）**，不校验 version 非空。理由是保留一个廉价的「这是内容包不是别的 JSON」标记，但不把发布契约带进运行时。若产品负责人希望保留版本校验，须先明确：谁保证远端每次都写 version、写错了怎么发现 —— 那是发布期 CI 的职责，不是客户端闸门。

### 48.3 过宽：「五个假名行数组」中的四个

`voicedRows/yoonRows/specialRows/loanwordRows` 全部是 `(x || []).map`，缺失时页面只是少一块，不会失效。把它们列为**必需**会让一个只是暂时没带这四个字段的合法内容包被整包拒绝。

裁定：**改为「若存在必须为数组」**，不要求存在。`kanaRows` 例外 —— 见下。

### 48.4 漏项：`kanaRows` 的必需性被「五个数组」这个说法掩盖了

`KanaScreen.js:990/991` 对 `kanaRows` 直接 `.filter`，无守卫；五十音是新用户主线的第一道门。`kanaRows` 与其余四个不是同一级别，必须单列为**必需数组**。

### 48.5 漏项：`specialSounds` 不必列（确认无需补）

曾疑为漏项，核实后 `specialSounds?.sections?.map` 全程可选链，且它是对象不是数组。**确认不进最小结构**，工单省略它是对的。

### 48.6 建议的最终最小结构

必需，且必须为数组：`scenes`、`mapPlaces`、`culturalFusion`、`kanaRows`、`wordBank`。
必需，且必须为对象、其 `stations` 必须为数组：`subwayAdventure`。
若存在则必须为数组：`voicedRows`、`yoonRows`、`specialRows`、`loanwordRows`。
若存在则必须为对象：`_meta`。
根节点必须是普通对象（非数组、非 null）。
不校验：`wordCards`、`specialSounds`、`cultureNotes`、任何未知顶层字段、任何数组的长度与元素结构。

一句话判据：**只有「无守卫地被解引用、且失效会让主线页面白屏」的字段进最小结构**。`cultureNotes` 零消费、`wordCards`/`specialSounds` 自带降级，都不进。

### 48.7 已知残留风险（不在本工单修）

元素级形状仍无保护：`KanaScreen.js:1021` 的 `hiraRow.chars.map`、`:994` 的 `row.row[0]` 在行对象形状错误时仍会崩。顶层闸门不覆盖这一层，这是有意的取舍 —— 元素级校验会把 validator 推向内容质量审查器。登记为已知残留，不扩本工单范围。

## 49. ETag 失败语义核对

| 场景 | 当前行为 | 是否达标 | 要求的最小改动 |
|---|---|---|---|
| 200 + 结构无效 | 落盘 + 覆盖 ETag，坏内容成为新缓存 | **否，主漏洞** | 校验在 `writeCachedContent` **之前**；不写文件、不写 ETag、不动旧 ETag，转走缓存/fallback |
| 304 + 缓存有效 | 直接返回 | 部分 | 返回前须过 validator |
| 304 + 缓存缺失 | 清 ETag，返回 none | 是 | 保持不变 |
| 304 + 缓存无效 | **直接把坏缓存交给 `setContent`** | **否** | 清 ETag（复用现有 `:61` 分支），返回 none。缓存文件建议保留不删——下次必然走 200 全量拉取并覆盖，删文件不增加安全性只增大 diff |
| 网络失败 + 缓存有效 | 返回 cache | 部分 | 返回前须过 validator |
| 网络失败 + 缓存无效 | 返回坏内容 | **否** | 返回 none；**ETag 不动**（此时并无证据说明远端或 ETag 有问题，清掉只会让下次多下 6MB） |

ETag 的判据可以收成一句：**只有在「服务端说没变、而我方拿不出一份通得过校验的内容」时才清 ETag**；结构无效导致的拒绝不构成清 ETag 的理由，网络失败更不构成。

一个当前已存在、本工单不必修但应记录的边界：200 响应若不带 `etag` 头，`writeCachedContent` 只写文件、旧 ETag 留存（`:34` 的 `if (etag)`），下次会带着过期 ETag 请求。raw.githubusercontent 恒发 ETag，风险为零，但实现时不要顺手「修」成无条件写入 —— 无条件写会引入 `setItem(null)`。

## 50. 允许实现的最小 diff

1. 新增 `src/lib/contentSchema.ts`：纯函数 `validateContentShape(value) => { ok, reason }`。**不得 import 任何 expo/react-native 模块**，否则无法进 `node --test`（现有 `src/lib/__tests__/*` 全部依赖这一点）。`reason` 只含字段路径与失败类型，不含值 —— 满足工单第 6 条不落日志内容。
2. `contentCache.js` 三处接线：`readCachedContent` 返回前校验；200 分支在 `JSON.parse` 与 `writeCachedContent` 之间校验；304 无效缓存复用现有清 ETag 分支。
3. 可测性：`contentCache.js` 直接 import 了 `expo-file-system` 与 AsyncStorage，现有测试框架下**无法覆盖六行验收矩阵**。最小可行做法是给 `fetchContent` 加一个带默认值的依赖参数（`{ fetchImpl, readCache, writeCache, getEtag, clearEtag }`），生产调用点一字不改。不接受用「测不了」为由只测 validator —— 工单要求断言「旧有效缓存未被覆盖」，那是分支行为，不是 validator 行为。
4. 新增测试：`contentSchema.test.mjs`（含「内置 `assets/content.fallback.json` 必须通过」这一条，即工单第 5 条）+ `contentCache-branches.test.mjs`（六行矩阵，每行同时断言返回值与 `writeCache`/`clearEtag` 是否被调用）。

## 51. 验收矩阵（供实现工单直接采用）

| # | 输入 | 期望 source | 写内容 | 写 ETag | 清 ETag |
|---|---|---|---|---|---|
| 1 | 200 + 合法包 | `network` | 是 | 是 | 否 |
| 2 | 200 + `{}` + 旧有效缓存 | `cache` | **否** | **否** | 否 |
| 3 | 200 + `wordBank` 为对象 + 无缓存 | `none` | 否 | 否 | 否 |
| 4 | 200 + 合法包但 `wordCards` 为对象 | `network` | 是 | 是 | 否 |
| 5 | 304 + 有效缓存 | `not-modified` | 否 | 否 | 否 |
| 6 | 304 + 缓存缺失 | `none` | 否 | 否 | **是** |
| 7 | 304 + 坏缓存 | `none` | 否 | 否 | **是** |
| 8 | 网络失败 + 有效缓存 | `cache` | 否 | 否 | 否 |
| 9 | 网络失败 + 坏缓存 | `none` | 否 | 否 | **否** |
| 10 | `assets/content.fallback.json` | validator 通过 | — | — | — |

第 4 行是防回归行，专门守住 §48.1 那条错误规则不被重新写进来。
第 2、7、9 行必须额外断言磁盘上的旧缓存文件内容未变。

## 52. 对 App 层的核对（无需改动）

`useContent()` 初始 state 即 `fallbackContent`（`App.js:124`，静态 import 的 JSON，恒为真值），`next` 为 null 时只 `setError(true)` 而不清空 content。因此 `App.js:6261` 的 `ErrorScreen` 在当前接线下实际不可达，**远端拒绝不会让 App 白屏，只会静默停留在内置包**。这正是本工单期望的降级形态，`App.js` 不需要任何改动 —— 工单「允许修改」中不含 App 页面行为，与事实一致。

## 53. 停止声明

只读核对完成。未编码、未改 `contentCache.js`、未 commit、未 push。
下一步按 `ACTIVE.md` 分工：由 Codex 独立复核本报告（重点复核 §48.1 与 §49 的 ETag 判据），通过后再形成最小实现工单。

---

# P0-2 · Codex 实现记录（待 CC 短审）

Codex 独立复核接受 §48 的最终最小结构与 §49 的 ETag 判据。实现额外收紧了一点：`contentCache.js` 顶层依赖 Expo 模块，不能仅靠向它注入依赖就进入裸 Node 测试；因此将状态机抽为纯 `contentCacheCore`，Expo 文件系统/AsyncStorage 仍由原文件适配，生产调用签名不变。

实现只新增 schema、纯状态机及其测试，未改 App 或内容 JSON。最终验收为 `npm test` 561/561、`npm run typecheck`、`git diff --check`、iOS Expo bundle 均通过。

篡改验证已执行并还原：移除 200 结构闸门会使 2 条分支测试失败；网络失败时错误清 ETag 会使 1 条分支测试失败。

---

# P0-2 · 结构闸门实施短审

> 审核日期：2026-08-20
> 范围：`src/lib/contentSchema.ts`、`src/lib/contentCacheCore.ts`、`src/lib/contentCache.js`、三个新测试与交接文档
> 结论：**通过。六项重点核对全部达标；有 1 条建议在本轮顺手消除的低概率高影响风险（§56），3 处非阻塞测试缺口（§57）**
> 本轮只读，未编码、未 commit、未 push。

## 54. 六项重点核对

| # | 核对项 | 结论 | 证据 |
|---|---|---|---|
| 1 | 200 坏包不写缓存/不覆盖 ETag | 通过 | `contentCacheCore.ts:72-78` 校验在 `writeCache` 之前；失败分支直接 `return cacheResult(...)`，`writeCache` 与 `clearEtag` 均不可达 |
| 2 | 304 坏缓存清 ETag | 通过 | `:60-66` 有效缓存才提前 return，否则 `await deps.clearEtag()`。缺失与结构无效走同一分支，符合 §49 |
| 3 | 网络失败坏缓存不清 ETag | 通过 | `:80-83` catch 内只 `readValidCache` 后返回，全程无 `clearEtag`；`:82` 注释写明判据 |
| 4 | 读缓存与远端同一 validator | 通过 | 两条路径都收敛到 `readValidCache`（`:26-33`）与 `:72`，共用 `validateContentShape`；无第二套判据 |
| 5 | `wordCards` 对象不被误拒 | 通过 | `contentSchema.ts` 全文无 `wordCards`，等于不表态；`contentSchema.test.ts` 与 `contentCacheCore.test.ts` 各有一条正向防回归 |
| 6 | 未越界到 App/内容 JSON | 通过 | 工作区改动仅 5 文件 + 5 新增，`App.js`、`assets/content.fallback.json`、内容脚本、publication 全部未触碰 |

`validateContentShape` 的字段清单与 §48.6 逐条一致：五个必需数组含 `kanaRows`，四个假名可选数组为「若存在须为数组」，`_meta` 降级为「若存在须为对象」、不校验 version，`specialSounds`/`cultureNotes`/`wordCards`/未知字段一律不表态。`isPlainObject`（`:12-16`）额外排除了数组与非 `Object.prototype` 原型，`JSON.parse` 的产物恒满足，判据没有过紧。

## 55. 适配层委托核对

`contentCache.js` 现在只剩 Expo 适配：`readCachedContent`/`writeCachedContent` 保持原样，`fetchContent` 退化为一次 `fetchContentCore` 调用，**对 App 的签名与返回形状一字未变**（`App.js` 因此不需要、也确实没有改动）。原文件里的 200/304/失败三条分支逻辑已整段移入纯 core，没有留下第二条绕过闸门的路径。

`writeCachedContent` 仍先写文件再写 ETag、且自吞异常（§46 事实 3），这个顺序被保留下来了，正确。

本地复跑与实现记录一致：

```text
npm test          561 / 561
npx tsc --noEmit  exit 0
git diff --check  clean
```

按「不改代码」的约束，本轮未做篡改验证，采信实施记录中的三条篡改结果；上面的分支证据是直接读源码得到的，不依赖那三条。

## 56. 建议在本轮顺手消除：`fetchImpl: fetch` 未绑定

`contentCache.js:49` 把全局 `fetch` 作为属性值传入，core 在 `:55` 以 `deps.fetchImpl(...)` 调用它，`this` 因此是 `deps` 而不是原来的 undefined/global。React Native 的 `fetch` 来自 whatwg-fetch polyfill，实现中不引用 `this`，所以当前运行时大概率无影响 —— 但这是本 diff 引入的、与改动前不等价的调用形态。

值得处理的原因不是概率，是**这条路径没有任何东西能发现它**：`SHOULD_FETCH_REMOTE_CONTENT` 在 `__DEV__` 下为 false，开发期不走远端；bundle 只打包不执行；Node 测试注入的是假 `fetchImpl`。一旦某天宿主换成有 brand check 的实现（Expo Web、或 polyfill 变更），表现是每次请求抛错 → 落入 catch → 静默退回缓存/内置包，**内容更新永久停止且不报错**。

建议改为 `fetchImpl: (u, init) => fetch(u, init)`，一行、零行为风险。注意 `contentCache-wiring.test.mjs:10` 的正则里写死了 `fetchImpl: fetch,` 字面量，改这一行必须同步改该断言 —— 顺带说明那条正则把接线测试绑到了实现的字面写法上，未来重构会误报，可考虑改成断言「存在 fetchImpl 键且 core 被调用」。

以上是建议，不是阻塞项。产品负责人若选择原样提交，风险已记录在案。

## 57. 非阻塞测试缺口

1. **根节点非对象未测**：`contentSchema.ts:25` 的 `$: expected object` 是唯一没有对应用例的规则；`null`、数组、字符串三种输入都未断言。这条恰好是「远端返回 HTML 错误页且碰巧能被 parse」的最后一道防线。
2. **200 成功路径未断言 ETag 被更新**：`contentCacheCore.test.ts` 的 harness 里 `writeCache` 丢弃了第二个参数，测试只断言 `writes() === 1`。实施工单矩阵第 1 行写的是「写内容**和 ETag**」，其中后半句实际无覆盖。真正写 ETag 的是适配层 `writeCachedContent`，本轮未改、未回归，因此不阻塞。
3. **`wordCards` 为数组时仍应放行未测**：§48.1 那条错误规则的反面（数组也不该被拒）没有用例。现有正向用例只覆盖对象。

三条都属于「加断言」，不涉及行为改动，可并入本轮，也可留作后续。

## 58. 停止声明

短审完成，结论为通过。未编码、未 commit、未 push。
下一步由产品负责人决定是否采纳 §56 的一行修改，然后提交本轮 diff；`ROADMAP-STATUS.md` 的 P0-2 可在提交后由 `已实现待复核` 改为 `完成`。

## 59. 建议采纳与最终状态

产品负责人授权后，Codex 已采纳 §56 与 §57 的全部四项：全局 `fetch` 改为普通函数调用；200 成功路径断言写入 ETag；根节点非对象用例；`wordCards` 数组放行用例。复跑结果为 `npm test` 562/562、`npm run typecheck`、`git diff --check` 与 iOS Expo bundle 均通过。

P0-2 现可标记为完成。

---

# P2-2A · 来源审计输出契约 独立边界复核

> 复核日期：2026-08-20
> 范围：`docs/handoff/TICKET-source-audit-contract.md`，对照 `DECISIONS.md` F3/P1/P2 与 `staging/` 现有工件
> 结论：**五项复核重点全部成立，契约方向通过。** 发现 3 处会削弱其自身保证的定义空洞（§60.1、§61.1、§63.2），2 处对既有工件过严或未覆盖（§63.1、§63.4），1 处已发布行为与新判据的语义冲突必须写明归属（§63.5）
> 本轮只读，未编码、未改内容包、未 commit、未 push。

## 59. 复核方式

契约本身不产生代码，因此复核的是**它能否在被严格执行时兑现自己的承诺**，以及**它是否与磁盘上已存在的事实相容**。除通读工单外，实读了 `staging/jmdict-join-report.md`、`staging/pitch-confidence.json`（7799 条，按 `srcs` 组合做了分布统计）、`assets/content.fallback.json` 的 `_meta.wordBankSources` 与 `wordBank[].pitch`、`src/features/wordbank/PitchLine.js`。

## 60. 重点 1：独立性是否只按 familyId 计算

**成立。** §1 明确「`familyId` 才是独立性单位」，并逐条点名镜像、fork、搜索结果、两个模型转述都不增加 family 数；§3 约束 `producer.kind: model` 不使模型成为 `sourceId`、不计 family；§4 的 `corroborated` 写的是「至少两个不同 `familyId`」而不是两条 evidence；§5 再次单独重申两个模型同意不算双源。四处互不依赖地表达同一判据，没有留下从 evidence 条数反推独立性的缝。

### 60.1 空洞：`familyId` 本身怎么定没有规则

契约把全部独立性重量压在 `familyId` 上，却没有规定它如何被赋值。示例里有 `upstream: ["EDRDG"]` 字段，但规则清单从未提到 `upstream`，也没有要求它非空。结果是：**一个镜像只要在注册时被写上一个新的 `familyId` 字符串，就自动获得独立性**——契约禁止的正是这件事，而唯一的防线是注册者自觉。

建议把独立性判据从「`familyId` 不同」改为可机器执行的形式：`upstream` 为必填非空数组；两个来源的 `upstream` 集合**有交集即不算独立**，`familyId` 退化为该判据的缓存标签而非依据。这样 `scriptin/jmdict-simplified` 的任何 fork 都会因为同带 `EDRDG` 而自动失去第二源资格，不依赖注册者的诚实。

## 61. 重点 2：自写内容与外部事实是否分层

**成立。** §2 的 `claimType` 表把三类自写物（`editorial_translation`、`authored_example`、`editorial_mnemonic`）与三类外部事实（`dictionary_fact`、`corpus_example`、`etymology_fact`）分列，且右列逐条写明「不能自动得出的结论」——`editorial_mnemonic` 不能推出词源事实、`etymology_fact` 不能由记忆联想支持、`authored_example` 不能自动得出母语自然度。§4 的 `editorial` 输出进一步规定「不能改写为外部事实」。分层是双向的，不只是禁止把 AI 输出当来源。

### 61.1 空洞：「作者责任」没有承载字段

`editorial_*` 三类的证据要求都写成「作者责任」，`editorial` 输出也要求「必须带作者责任」。但 claim 的最小形状里没有任何署名字段，`producer` 只存在于 evidence 上、且描述的是「谁找到了线索」而不是「谁为这句中文负责」。按当前 schema，一条 `editorial_translation` 可以合法地不带任何责任人。

建议：`claimType` 以 `editorial_` 开头时，claim 必须带非空 `author`（人或受控实现者标识），schema 校验对此 fail closed。这是 §2 分层能否落地的唯一着力点。

## 62. 重点 3 与重点 4：fail closed 与 evidence/publication 解耦

**重点 3 成立。** 无 locator → §3 规定只到页面而无条目/行/句子 ID 即 `insufficient`；无许可链 → §1 规定必须写 `research-only`，且 SHA/时间/许可/归属缺任一即「不得计入自动通过」；未注册来源 → §1「必须预先存在」+ §5 导入校验 `sourceId` 已注册；冲突 → §4 `conflict` 自动隔离且禁止写内容包。§2 的未知 `field` 也是「先拒绝，不静默放行」。四条都是拒绝式默认。

**重点 4 成立，且是全文最硬的一条。** §4 末尾直接写明 `supported`/`corroborated` 是证据状态而非 `publication`，不允许任何自动步骤映射为 `dictionary` 或 `learning: true`；§3 从数据形状上禁止 evidence 携带 `publication`/`learning`/`verified` 字段；§0 与 §6 两次声明写入内容包必须另开迁移工单。三层（语义层、schema 层、流程层）互相独立，任一层失守另两层仍成立。

### 62.1 三处建议补强

1. **冲突优先只写在测试矩阵里。** §4 的状态表没说明「2 个支持 family + 1 条有效反证」应落到 `corroborated` 还是 `conflict`；只有 §7.3 的测试项「冲突优先」隐含了答案。判据应写在 §4 表上，否则实现者按表逐行匹配会得出 `corroborated`。
2. **`research-only` 的下游后果没写。** §1 规定缺上游许可链时 `redistribution` 写 `research-only`，但全文没有一处说明 research-only 来源能否计入 `supported`/`corroborated`。按字面它可以——因为 §1 的「不得计入自动通过」挂的是 SHA/时间/许可/归属四项缺失，不是 redistribution 取值。建议明确：research-only 可支持内部状态，但任何内容迁移工单必须对它 fail closed，否则许可风险会在 P2-2A 之后的迁移环节才第一次被发现。
3. **§7.3 的测试矩阵缺一条**：「evidence 携带 `publication`/`learning`/`verified` 字段 → 整条隔离」。这是重点 4 在 schema 层的唯一执行点，却没有对应用例；矩阵现有六条都在测独立性与定位，没测这条禁令。

## 63. 重点 5：是否意外阻塞既有工件的后续接入

### 63.1 JMdict 被过度降级（建议放宽）

§6 把 JMdict 历史输入判为「没有 SHA/完整许可快照的记录只能标 `legacy-unpinned`」。**这与磁盘事实不符**：`staging/jmdict-join-report.md` §0 已完整记录 Release tag `3.6.2+20260803141815`、`dictDate 2026-08-03`、`sha256(tgz) 2fb280ac1737161795f4bce157466f69c7e51a50aa6a3353ac59ca06a2e07c5f`、文件字节数 11,475,164；而 `staging/jmdict-eng.json.tgz` 现仍在盘上，字节数与报告完全一致（可当场复算 SHA 自证）。按 §1 自己的六项标准，JMdict 缺的只有 `retrievedAt` 与许可快照文件，不是 SHA。

契约照原样执行，会把**全仓库文档最完备的那个来源**降级到不能支持新 claim，而把这条路堵死没有任何安全收益。建议 §6 增加一条**重锁路径**：历史工件若保留了原始文件且报告中的 SHA 可当场复算一致，允许补齐 `retrievedAt` 与许可快照后注册为正式 `sourceId`，不必等待重新下载。

### 63.2 许可快照文件尚不存在，会使 §7.4 无法完成

registry 示例的 `license.noticePath` 指向 `docs/sources/jmdict-notice.md`，但 **`docs/sources/` 目录当前不存在**。§1 又规定许可缺失即不得计入自动通过。于是 §7.4 要求的「用一个明确许可的真实来源样本（建议 JMdict identity/reading）验证 run manifest」在该文件被撰写之前**不可能通过**——下一张实现工单会在最后一步卡住。建议把「创建 `docs/sources/` 与 JMdict 许可与归属快照」显式列为 §7 的第 0 项。

### 63.3 Sudachi / UniDic：不阻塞

§1 的 `role` 机制正确处理了它们——可证明分词/读音的机械结果，不可证明中文释义或词源；§2 的 `derived_mechanical` 给了它们对应的 claimType，配套要求是固定输入、脚本版本、可重跑，与 `scripts/build-example-tokens.py` 的现状一致。内容包 `_meta.wordBankSources` 里已有的 `sudachi_note`（SudachiPy + sudachidict_core 用于读音、词典形、词性校验）与这个 role 划分完全吻合。无需改动。

### 63.4 未覆盖：内容包里已经存在第二套来源台账

`assets/content.fallback.json` 的 `_meta.wordBankSources` 已经是一份**运行时内容内的来源记录**，含 `source_url`、`license: CC-BY-SA-4.0`、`github_blob_sha`、`source_note`、`jmdict_note`、`sudachi_note`、`generated_count` 等。契约 §6 盘点了 staging 工件，但完全没有提到它。

后果是将来会有两份互不知情的来源台账：`staging/source-audit/sources.v1.json` 与内容包内的 `_meta.wordBankSources`，且后者是随 App 分发、用户可见口径的那一份。建议 §6 增加一条口径：`_meta.wordBankSources` 的每一项要么在 registry 中获得对应 `sourceId`，要么明确标注为「历史发布记录，不作为 evidence 依据」。这不需要改内容包，只需在契约里认领它。

### 63.5 必须写明归属：已发布的「来源印证」语义早于本契约

这是本轮最需要产品负责人拍板的一项。

`src/features/wordbank/PitchLine.js:50-66` 已经把 `wordBank[].pitch.agree` 渲染成用户可见的「几个来源印证」，其注释明确称这是「这个 App 最该说出口的一件事」。而这份数据由 `tools/stamp-pitch-confidence.py` 产生——**该文件当前不在仓库中，git 历史里 `YanApp/tools` 也无任何提交**。也就是说，一条已经发布给用户的多源印证声明，其生产者不可复现。这与 `DECISIONS.md` F3 的判断一致，但 F3 说的是「不能称已完全证明」，此处更进一步：连生产脚本都不在。

同时，新契约的 `corroborated` 要求「至少两个不同 `familyId`」，而已发布的 `agree` 计的是**查过并一致的来源个数**，两者不是同一判据。实测 `staging/pitch-confidence.json` 的 7799 条：

| agree | srcs 组合 | 条数 |
|---:|---|---:|
| 2 | UniDic + kanjium | 6549 |
| 3 | UniDic + kanjium + 维基 | 523 |
| 1 | kanjium | 417 |
| 1 | UniDic | 237 |
| 2 | kanjium + 维基 | 23 |
| 2 | UniDic + 维基 | 17 |
| 0 | UniDic + kanjium | 19 |
| 2 | UniDic + kanjium + 维基 | 6 |
| 1 | 维基 | 7 |
| 0 | UniDic + 维基 | 1 |

好消息是回溯敞口很小：`agree ≥ 2` 的绝大多数（6549 条）是 UniDic + kanjium，即 NINJAL 机构来源与独立维护的 kanjium，按 §60.1 的 `upstream` 判据大概率确为两个 family。**只有 40 条**（23 + 17）的「两方印证」把中文维基当作恰好两个来源之一，而维基的日语声调数据上游未经证明，是唯一独立性可疑的位置。

坏消息是这份历史工件**自身无法自证**：`agree: 2` 却列出三个 `srcs` 的有 6 条、`agree: 0` 却列出两个 `srcs` 的有 19 条，说明 `srcs` 记录的是「查了哪几个」而不是「哪几个一致」。因此无法从中反推逐条 evidence——**这恰好证明 §6「不反向伪造逐条 locator」的决定是对的**，该决定应予保留。

需要契约补写的是归属问题：已发布的 `pitch.agree` 语义是**祖父条款保留**，还是在新流水线跑出结果前需要改口径？契约当前对此沉默，沉默的默认结果是新判据上线后旧声明继续以旧口径展示，而两者叫同一个名字。建议 §6 增加一句明确表态，并把那 40 条记为已知敞口。本轮不建议改 UI 或数据——那是独立的产品决定，不属于 P2-2A。

## 64. 契约自带验收标准的核对

| 验收项 | 结论 |
|---|---|
| 能解释「两模型同意但同一来源家族」为何不算双源 | 是（§1 + §3 + §5，三处独立表述） |
| 能解释自写中文/例句为何是编辑责任 | 是（§2 表 + §4 `editorial`），但缺署名字段承载，见 §61.1 |
| 无 locator/无许可/冲突/未注册均无法推动发布 | 是，见 §62；建议补 §62.1 的三条 |
| 当前 App 行为与内容字节不变 | 是，本工单纯文档，未创建任何数据文件 |
| 复核者只需读本工单 + DECISIONS §P1/P2 + 列出的 staging 工件 | 基本成立，但 §63.4、§63.5 两项要害不在其列出的阅读清单内（`_meta.wordBankSources` 与 `PitchLine.js`），建议把它们加进清单 |

## 65. 停止声明

只读复核完成，结论为契约通过、建议按 §60.1、§61.1、§62.1、§63.1、§63.2、§63.4、§63.5 修订后再开实现工单。未编码、未修改内容包或 staging 工件、未 commit、未 push。

---

# P2-2A · 契约修订短复核

> 复核日期：2026-08-20
> 范围：`TICKET-source-audit-contract.md` 修订稿，对照 §60–§65 的七条意见
> 结论：**四项复核重点均达标，七条意见逐条落地，可进入实现工单。** 另发现 5 处残留（§70），全部属于「规则已写对、但 validator 落不了地」或「修订新引入的字段无人管辖」，不推翻契约，但应在实现工单开工前一次性收掉
> 本轮只读，未编码、未 commit、未 push。

## 69. 四项重点

### 69.1 lineage 能挡 mirror/fork，且不误杀无关工具共用 —— 达标

`familyId` 从可自由填写的标签收紧为「必须等于 `lineage` 根节点，不能由导入器或外部模型自由填写」，新根节点需受控代码审查并说明「为什么它不是既有来源的镜像、fork 或再包装」。误杀侧也明确豁免：「共享无关的工具或背景资料不自动否定独立性」，且归属权写死在 registry 的受控注册，不接受模型或单条 evidence 临时声明。

这比 §60.1 建议的 `upstream` 集合求交更符合实情——真正的判断（这份数据是不是那份数据的再包装）本来就不可能纯机械完成，修订把它明确交给代码审查，而不是假装能自动算。方向正确。残留见 §70.1、§70.2。

### 69.2 author / research-only / 冲突优先 / 发布字段隔离 —— 三条完全可执行，一条半

| 规则 | 可执行性 | 依据 |
|---|---|---|
| `author` | 完全可执行 | §2「`editorial_` 开头的 claim 必须带非空 `author`；`authored_example` 同样必须带」——按 `claimType` 前缀判定，无解释空间 |
| 冲突优先 | 完全可执行 | §4 从测试矩阵提升为状态表规则：「只要存在有效的互相矛盾证据，即优先于支持数」，且 `supported`/`corroborated` 两行同时补了「无有效反证」前置条件。双向写死 |
| 发布字段隔离 | 完全可执行（但黑名单不闭合，见 §70.4） | §3 从「不能含」升级为「整条隔离；不是'忽略多余字段后继续导入'」，§7.3 补了对应测试项 |
| `research-only` | **半条** | §4 新增的排除条款只覆盖许可路径，完整性路径仍停在 §1 的散文里，见 §70.3 |

### 69.3 三处历史工件均已认领，未形成第二真相 —— 达标，且重锁路径已实测可行

- **JMdict 重锁**：§1 允许 `retrievedAt: null` + 必填 `relockedAt` + 用在盘原始文件复算 SHA/版本/字节数，§6 给出对应流程，§7 新增第 0 项许可快照且「没有该快照不得把 JMdict 样本计入通过」。§63.1、§63.2 两条一并解决。

  **本轮实测复算，重锁不是纸面设计**：

  ```text
  shasum -a 256 staging/jmdict-eng.json.tgz
  2fb280ac1737161795f4bce157466f69c7e51a50aa6a3353ac59ca06a2e07c5f
  文件大小 11,475,164 bytes
  ```

  与 `jmdict-join-report.md` §0 记录的 SHA 与字节数**逐字符吻合**。也就是说 §6 的历史重锁今天就能执行完毕，唯一缺口是尚未撰写的许可快照文件。

- **`_meta.wordBankSources`**：§6 定性为「已发布的历史来源说明，不是新 registry 的第二真相」，并给了二选一归宿（映射到 `sourceId`，或标 `legacy-published-record`），且明确不得作为 evidence 依据。解决 §63.4。
- **声调祖父工件**：§6 写明保留展示、不反向伪造 locator、不得导入为 `supported`/`corroborated`，新判据须等下一次带 registry + run manifest + 逐条 evidence 的 run。并把「是否更改用户可见的'来源印证'措辞」明确划为独立产品决定。解决 §63.5，且正确地把 UI 口径问题移出本工单而非含糊带过。

### 69.4 evidence 与 publication 仍完全解耦 —— 达标，且是本轮唯一变更严格的条款

语义层（§4 不允许任何自动步骤映射为 `dictionary`/`learning: true`）、schema 层（§3 整条隔离）、流程层（写入内容包须另开迁移工单）三重保证全部保留；schema 层由「不能含」升级为「整条作废」。修订没有为了别处的放宽而在这里让步。

## 70. 五处残留

### 70.1 `upstream` 成了孤儿字段

registry 示例里 `upstream: ["EDRDG"]` 原样保留，但修订后的规则条文**全篇不再提到它**——职责已被 `lineage` 接管。两者粒度还不一致：`familyId`/`lineage` 根是 `edrdg-jmdict`，`upstream` 是 `EDRDG`。实现者写 schema 时无从判断它是必填、选填、还是应当删除，而 registry 是整个契约里最不该有歧义字段的文件。建议删掉，或明确降级为人类可读的备注且不参与任何判定。

### 70.2 §7.3 的合成测试覆盖不到独立性判据的另一半

诚实填写时，fork 与镜像的 `lineage` 根本来就与上游相同，因此「同一 `familyId`」这一句已经挡住了它们；第二个分句（两条 lineage 表明同一数据被再包装）真正覆盖的是**根不同但中途交汇**的情形——例如某词典把 JMdict 数据吃进自己的词库。这类交汇能被受控注册审查挡下，但**写不成合成测试**。

而 §7.3 的测试项写的是「同 lineage/fork 不计双源」，读起来像是两种都覆盖了。建议改成「同根不计双源」并加一句：交汇型谱系由 registry 注册审查负责，不在自动测试范围。测试矩阵不应显得比它实际能保证的更宽。

### 70.3 「不得计入自动通过」有两条路径，§4 只接住了一条

§1 里有两种「不能算数」：

1. **许可路径**——缺上游许可链 → `redistribution: "research-only"`；
2. **完整性路径**——新取得来源缺 `sha256`/获取时间/许可/归属任一项 → 「只能调研、不得计入自动通过」。

§4 新增的排除条款只点名了 `redistribution: "research-only"`。一个**缺 `sha256` 但许可宽松**的来源，其 `redistribution` 合法地不是 `research-only`，§4 状态表里没有任何一行排除它，只有 §1 的散文禁止。实现者照 §4 写裁决器就会放行。

这正是 §62.1 第 2 点想堵的洞，修订只堵了一半。建议 registry 增加一个显式的 `eligibility` 字段（`countable` / `research-only` / `incomplete`），由注册时确定性推导，§4 只测这一个字段——两条路径合流到同一个可测的地方。

### 70.4 发布字段黑名单里的「等」字不可机械执行

§3 写「`publication`、`learning`、`dictionary`、`verified` 等发布/升级字段」。「等」无法写进 validator，而这条是重点 4 在 schema 层的唯一执行点，靠列举必然漏掉将来新造的字段名。

建议直接规定 evidence 对象 `additionalProperties: false`：既覆盖当前四个，也自动挡住任何未来的发布字段，并且比维护黑名单更 fail closed。同一条也适用于 claim。

### 70.5 两处小项

- **`corpus_example` 的承载字段缺失**：§2 要求它由「句子 ID、作者、许可、定位」支持，但 §3 的 evidence 最小形状里没有承载「作者」「许可」的字段——与 §61.1 是同一类空洞，只是从 claim 侧换到 evidence 侧。若 v1 暂不启用 `corpus_example`（当前 staging 里确实没有语料来源），写明「v1 不启用」即可，不必现在设计字段。
- **重锁应指明以哪个工件的 SHA 为准**：§6 同时列出 `jmdict-eng.json.tgz` 与解压后的 `jmdict-eng-3.6.2.json`（117,544,161 bytes），但报告只记录了 tgz 的 SHA，解压产物的 SHA 从未记录、无从复算。应写明「以原始下载工件为准」，否则重锁第一步就会卡在选哪个文件。

## 71. 结论

七条意见全部落地，无一条被稀释；§70 的五处残留都是收尾性质，不影响契约的四项核心保证成立。JMdict 重锁已实测可执行，`docs/sources/` 许可快照是唯一挡在样本验证前的实际缺口，§7 已把它列为第 0 项，位置正确。

建议把 §70.1、§70.3、§70.4 三条并入实现工单的第 1 项（schema validator）一次性收掉——它们都是「validator 该测什么」的问题，正好在那一步落地；§70.2、§70.5 是文字澄清，随手改即可。

## 72. 停止声明

短复核完成，结论为通过。未编码、未修改内容包或 staging 工件、未 commit、未 push。

---

## 73. P2-2A 实现独立审（只读，2026-08-20）

范围：`src/lib/sourceAudit.ts`、`src/lib/__tests__/sourceAudit.test.ts`、`scripts/source-audit.mjs`、`docs/sources/jmdict-notice.md`、`staging/source-audit/` 的 5 个样本、`TICKET-source-audit-implementation.md`。未编码、未 commit、未 push。

基线复核：`npm test` 570/570 通过，`npm run typecheck` 通过（与实现记录一致）。本节所有行为结论都用一次性探针脚本在纯 core 上实测过，不是读代码推断。

**总判：可以合入，但有 3 处必须先落文档或修正的偏差（74.1、74.3、75.1），另有 3 处结构性隐患（76）。**

## 74. 六个重点逐条

### 74.1 CLI 是否有绕过 pure validator 的路径 —— **有一条**

`scripts/source-audit.mjs:74-78` 的 `export-claims`：

```js
required(input, ['claims', 'out']);
const claims = json(input.claims);
atomicJson(input.out, { schemaVersion: 1, kind: 'external-review-package', claims: claims.claims });
```

它 **一次都没有调用 `validateRegistry` / `validateClaims`**，把原始 claims 文件原样转写成给外部模型的审核包。后果不是污染内容包（输出仍锁死在 staging），而是：**发出去给外部评审的那份 claim 集合，可以是 validator 从未接受过的**。结合 74.3 的 `publication` 缺口，一个带 `"publication": {"learning": true}` 的 claim 能原样出现在外部审核包里，等于给外部模型看到一个它不该看到的指令位。

工单 2 节写的是「命令必须先完整验证输入，再原子写报告」。`export-claims` 不满足这一句。修法只有一行：先跑 `validateClaims`（需要 `--registry`），用 `claimsResult.value` 而不是 `claims.claims` 去写。

次一级：`summarize` 走 `validate(input, false)`，**整体跳过 run manifest 与 `run.inputs.*` 的 SHA 交叉核对**（`source-audit.mjs:70`）。报告自己会写 3 个输入 SHA，所以不是断链，但「先 validate 再 summarize」的口径里，summarize 这条路径比 validate 弱一档，值得在工单里写明是有意为之。

### 74.2 eligibility 是否真检查本地 notice、归档字节与 SHA —— **是，且默认 fail closed**

`sourceAudit.ts:71-79` 三项全查：`options.exists(source.license.noticePath)`、`actual.bytes !== source.artifact.bytes`、`actual.sha256 !== source.artifact.sha256`，任一不符即 `incomplete`。CLI 侧 `registryOptions()`（`source-audit.mjs:35-44`）确实用 `existsSync` + `statSync().size` + 真实 `createHash('sha256')` 落地，没有拿声明值当实测值。

最好的一处设计是 `!options.exists || !options.artifactInfo` 也判 `incomplete`：**不注入文件系统探针的调用方，什么都验不出 eligible**。这条比任何测试都更能挡住"以后有人图省事直接调纯函数"。

`redistribution === 'research-only'` 在最前面短路，所以一个既 research-only 又缺 notice 的源会被标成 `research-only` 而非 `incomplete`。两者都不合格，无安全影响，仅诊断精度问题。

### 74.3 lineage/familyId 能否被外部 evidence 或模型字段影响 —— **不能，这是全实现最硬的一段**

- `familyId` 只从 registry 取（`sourceAudit.ts:168`），evidence schema 里根本没有 lineage/family 位；
- `EVIDENCE_KEYS` 白名单 + `ownOnly` 使任何 `familyId`/`lineage`/`publication`/`verified` 额外键直接报错，该条 evidence 被整条排除（`:145`、`:158` 的 `errors.some(e => e.startsWith(p))` 守卫）；实测 `publication` 与 `extra` 两种注入都 `ok:false`；
- `familyId !== lineage[0]` 在纯 validator 内强制（`:97`）；
- 独立家族数用 `Set<familyId>` 去重，两个不同模型 producer 指向同一 source 只算一源（测试第 4 条已覆盖，实测一致）。

**但白名单只加在 evidence 上，claim 没有。** 实测：

```
claim 带 "publication": {"learning": true}  →  ok=true, errors=[]
```

claim 走的是"必填项齐不齐"，不是 `additionalProperties: false`。契约 §3 只对 evidence 要求闭集，所以实现没有偏离契约——但这正是 §70.4 提过、当时没被采纳的那条。它现在和 74.1 叠在一起成了一条真实通路：**未验证的 claim → 原样导出给外部模型**。建议把 `ownOnly` 同样加到 claim 上。

### 74.4 extra property / publication 字段是否整条隔离 —— **evidence 层面是；但 claim 层与 CLI 层语义不一致**

两处不一致：

1. `validateClaims`（`:122-129`）只在"缺必填"时 `continue`，**其它错误照样 `claims.push(raw)`**。实测：editorial claim 缺 author → `ok=false`，但 `value.length === 1`，那条坏 claim 仍在返回值里。`validateRegistry`（`:105`）和 `validateEvidence`（`:158`）都有 `errors.some(startsWith(p))` 守卫，唯独 claims 没有。目前不出事，只因为 CLI 在 `!ok` 时直接 throw；任何一个未来调用方若采用"用 value、忽略 warnings"的写法就会踩到。
2. CLI 的 `validate` 在 `!evidenceResult.ok` 时抛错（`:51`），**把契约 §3 的"单条隔离"实际执行成"整文件拒绝"**。方向更保守，没有安全问题，但和契约措辞不符，也意味着一条脏 evidence 会挡住同文件里全部干净 evidence 的裁决。二选一：改契约措辞，或让 CLI 使用 `value` 并把 errors 降级为报告项。

### 74.5 research-only / incomplete / 冲突是否绝不推动 supported/corroborated —— **推动不了；但另外两件事需要拍板**

实测确认：只有 research-only 源支持时 → `candidate, supportFamilies: 0`。`resolveClaim:166` 的 `eligibility.get(e.sourceId) === 'eligible'` 过滤在一切判断之前，这条守得住。

需要拍板的两点：

**(a) `supported` 完全不看 `policy.independentFamilies`。** `resolveClaim:171-172` 只把 `independentFamilies` 当作 `corroborated` 的阈值；只要有 ≥1 个合格支持家族，就一律落到 `supported`。实测：

```
policy.independentFamilies = 2，实际支持家族 = 1  →  status: "supported"
```

契约 §4 对 supported 的定义是「无有效反证，**且满足字段 policy 的最小可发布来源要求**」。一个自己声明"我需要两个独立家族"的 claim，拿一个家族就被标成 `supported`，而 `supported` 的下一步动作是进入受控编辑审阅清单——policy 声明的门槛在这里是没有作用的装饰。

更要紧的是**测试把这个行为固化了**：`sourceAudit.test.ts:30-33` 用 `independentFamilies: 2` + 同 root 双源断言 `status === 'supported'`。该测试想证明的是"同 root 不算双源"（这一点它证明了，没变成 `corroborated`），但它顺带把"policy 要 2、只有 1 也叫 supported"写成了预期。这条测试将来会阻止修正。

**(b) 非合格来源的 `contradicts` 被静默丢弃。** 实测：一个 research-only 源提交 `contradicts`、一个合格源提交 `supports` →

```
validateEvidence: ok=true, warnings=["$.evidence[1]: source is research-only"]
resolveClaim: {"status":"supported","supportFamilies":1,"publication":null}
```

因为 `usable` 先按 eligible 过滤，再查 contradicts（`:166-167`）。这正是 §70 里我提出、契约留白的那个不对称问题，实现在代码里默默选了**宽松**方向：research-only 源不能否决。可以接受（否则任何未注册/不合格来源都能一票否决），但它是一条只存在于代码里的裁决规则，必须写进契约 §4。目前它只在 warnings 里留痕，而 CLI 的 `summarize` 不输出 warnings——**这条警告在报告里是看不见的**。

另需记录：契约 §4 的六个状态，实现只有四个。`insufficient` 和 `editorial` 没有实现，都塌缩成 `candidate`（`:170`）。安全性不受影响（都不推进），但"完全没有证据"和"有证据但来源不合格"在报告里长得一模一样，§4 说的 `insufficient` 要「保留诊断」在这里丢了。

### 74.6 staging 强制纳入是否只限本轮 5 个工件 —— **当前无夹带，但没有任何机制保证**

实测：

```
git check-ignore -v staging/source-audit/sources.v1.json
→ .gitignore:60:**/staging/*
git ls-files staging → 只有 8 个历史 wordfield-*.json（与本轮无关）
git status --porcelain -- staging → 空
```

`staging/` 被 `**/staging/*` 全局忽略；本轮 5 个样本目前**未被跟踪、也未被 force-add**，`staging/pitch-*.json`、`jmdict-eng*.json` 等旧工件也全部仍是 ignored 状态。所以到此刻为止没有夹带。

但"只 `git add -f` 这 5 个"是纯人工纪律，写在工单实现记录里，仓库里没有对应的约束。提交那一步建议逐个显式列路径，不要用 `git add -f staging/source-audit`（目录形式会连同以后任何人放进该目录的东西一起进来）。

## 75. 必须先处理的问题

**75.1（阻塞级，可复现性）eligibility 全链依赖一个被 gitignore 的 11MB 文件。**

`sources.v1.json` 的 artifact 指向 `staging/jmdict-eng.json.tgz`，而该文件 ignored 且未跟踪。测试 `sourceAudit.test.ts:64-76`「真实 JMdict 历史重锁」在 `artifactInfo` 里用**无保护的 `readFileSync`** 读它，然后断言 `eligibility === 'eligible'`。

后果：在任何没有这份本地 tgz 的机器（新 clone、CI、换机）上，这条测试不是判 `incomplete` 失败，而是直接 ENOENT 抛错。**570/570 绿只在这台机器上成立。** 这与"来源审计"这件事本身的目标——可追溯、可重放——直接冲突。

这不是要求把 11MB 提交进仓库。最小修法是让该测试对缺失工件降级（缺文件时断言 `incomplete` 并 skip 掉 eligible 断言），把"本机有工件时才验 eligible"这个事实显式化，而不是靠环境偶然成立。

**75.2** `export-claims` 补上 validator（74.1）。

**75.3** `supported` 纳入 `policy.independentFamilies` 下限，并同步改掉 `sourceAudit.test.ts:30-33` 的断言（74.5a）。若判定当前行为是有意的，则改契约 §4 对 supported 的措辞，二者必须对齐一个。

## 76. 结构性隐患（不阻塞，建议记入 P2-2B）

1. **warnings 在 CLI 里是黑洞。** 四条命令没有一条打印或落盘 `warnings`。74.5b 的"证据被静默丢弃"、74.2 的"源不合格"全部只活在 warnings 里。报告 schema 建议加 `diagnostics` 字段。
2. **claim 缺闭集校验**（74.3），与 74.1 叠加成实际通路。
3. **lineage 只查 root。** 中途交叉（不同 root、共享中段 lineage）不计入独立性判定，与 §70.2 记录一致——这是契约诚实划定的边界，不是实现缺陷，但报告里没有任何字段提示"本次独立性只按 root 判定"。

## 77. 确认无误的部分

- `onlyStaging()`（`source-audit.mjs:23-27`）用 `relative(STAGING, target).startsWith('..')` 拦截，测试第 8 条用真实 `spawnSync` 验证了写 `assets/` 被拒且文件未创建——这是本轮唯一一条端到端的越界防护测试，写得对。
- `atomicJson` 先写 `.tmp-<pid>` 再 `renameSync`，验证失败时不会留下半份报告，满足工单「验证失败不覆盖任何已有 evidence/registry/报告」。
- `validateRunManifest`（`:181`）要求 registry 中**每一个** source 的 artifact SHA 都在 manifest 里回显且一致；测试第 6 条用篡改 SHA 验证了失败路径。
- `scriptContentSha256` 记录脚本内容而非只记 commit，样本里 `producer.version: "uncommitted"` 如实标注了当前脚本未提交——没有伪装成已在某 commit 上运行。
- `retrievedAt: null` + 真实 `relockedAt`，没有伪造 2026-08-03 的下载时间；`jmdict-notice.md` 是许可/归属快照而非词典正文，末行明确写了「不证明自己的中文释义、例句、词源或学习准入已经核验」——这一句正是防止 notice 被当成第二真相的关键。
- 样本报告 `jmdict-aizu.summary.json` 输出 `"publication": null`，`resolveClaim` 的四个返回分支全部硬编码 `publication: null`，evidence 与 publication 完全解耦这一条成立。

## 78. 停止声明

独立审完成。未编码、未修改任何源文件或 staging 工件、未 commit、未 push。唯一写入是本文件 §73–§78。行为结论均由临时探针脚本实测得出，探针写在会话 scratchpad，不在仓库内。

## 79. P2-2A 修订复审结论（2026-08-20）

**通过，无阻塞项，可以提交。** 本节复审的是 §73–§78 后的修订；未编码、未改 staging、未 commit/push。

- `export-claims` 必须先验证 registry 与闭集 claim；`summarize` 必须带 run，并走与 `validate` 相同的完整路径，要求已引用来源为 `eligible`；
- claim 与 evidence 均为闭集对象；claim 携带 `publication` 时验证失败，且坏 claim 不会留在返回值；
- 缺 archive 或不注入文件探针时 eligibility 稳定派生为 `incomplete`，不会抛 `ENOENT`；
- `independentFamilies: 2` 但只得到一个家族时为 `candidate`，不会误标 `supported`；
- 不合格反证不会伪装为有效 conflict，但会进入 diagnostics，并阻止 claim 晋级 `corroborated`；
- run manifest 的脚本 SHA 会与当前 CLI 实测比对；当前样本的脚本 SHA 与输入 SHA 均一致，端到端 validate 退出码为 0。

复核验收：`npm test` 572/572、`npm run typecheck` 通过。非阻塞保留项：当 `independentFamilies <= 1` 时，不合格反证只保留诊断、不阻止 `supported`；这条有意的不对称须在 P2-2B 契约中写明。提交 staging 时仍须逐个 `git add -f` 本工单列出的五个路径，禁止使用目录形式。

## PLAN v2 第一批

### 实际提交

- `37dce0e chore(content): make content accuracy measurable`：新增只读 `scripts/content-stats.mjs`。
- `085d939 fix(wordbank): stop presenting an unsupported JLPT scope`：词书首页/词书页去掉“高频”与“JLPT”事实暗示；数据来源页逐字读取 fallback 的 `scope_note` 与 `source_url`。
- `695dd3e feat(wordbank): make scene membership queryable without UI coupling`：新增 `sceneWordsOf()`、`scenesOfWord()` 及纯函数测试；未接 UI。
- `c9345c7 feat(wordbank): make meaning trust explicit instead of inferred`：新增 `meaningTrust()`、测试和 App 接线；缺字段 fail closed 为 `machine_drafted`。
- `cddedb2 fix(learn): stop treating substring counts as usage evidence`：`raw_substring` 排在可比较的例句库计数之后；df=0 与 df=null 仍分开。
- `e77659c fix(pitch): avoid calling recycled sources independent corroboration`：40 条含维基的两方组合按单源提示；登记 UniDic、kanjium、Wiktionary lineage；A4 结论写入 `DECISIONS.md`。

### content-stats.mjs 首次输出（基线全文）

```text
content-stats: assets/content.fallback.json (read-only)
wordBank.total: 8005
level: {"N5":724,"N4":631,"N3":1712,"N2":1774,"N1":3164}
status: {"draft":716,"verified":2,"candidate":645,"zh_drafted":6642}
tags.scene.effective: {"convenience":23,"directions":43,"restaurant":58,"hotel":16,"emergency":14,"subway":14}
tags.scene.daily_tagged: 7985
tags.scene.words_with_any_tag: 8005
coverage:
  exampleJp: 4400/8005 (55.0%)
  coreChunk: 1758/8005 (22.0%)
  jmdictSeq: 6683/8005 (83.5%)
  pitch: 7674/8005 (95.9%)
  wordField: 0/8005 (0.0%)
freq.method: {"not_applicable":41,"lemma":7188,"raw_substring":338,"stripped_prefix":18,"none":420}
freq.df_zero: 420
freq.df_null: 41
pitch.agree: {"1":588,"2":6563,"3":523}
publication.dictionary: 8005
publication.learning: 563
kanji_anchor.total: 563
kanji_anchor.complete: 19/563
kanji_anchor.missing: {"exampleJp":0,"coreChunk":0,"jmdictSeq":544,"pitch":35}
known_differences:
  _meta.note says 8026; measured wordBank.total is 8005; difference=21
  staging/pitch-confidence.json agree=0 is 20; commit 81efe21 said 15; difference=5
```

### 与 plan 数字不符的事实

本地 fallback 的总数、级别、状态、场景标签、主线池和字段覆盖率与 plan 的实测口径基本一致；脚本把差异打印为 8026 vs 8005（21 条）及 agree=0 的 20 vs 15（5 条）。此外，当前 fallback 的 `freq.method` 并非 8005 条全为 `tatoeba`：`source` 可以是 Tatoeba，但 method 实测为 `lemma` 7188、`raw_substring` 338、`none` 420、`not_applicable` 41、`stripped_prefix` 18。当前 fallback 的 `pitch.agree=2` 是 6563 条，staging 的 UniDic+kanjium 组合是 6549 条；两者不是同一运行代次，报告保留实测值，没有改数据迁就 plan。

### 想改但忍住没改

- 没有给 8005 条词批量补 `meaning_zh_status`，也没有进入 commit 7–11 的内容窗口。
- 没有修改 `assets/content.fallback.json`、远端内容包、`_meta.version`、jmdictSeq、词源卡或场景标签。
- 没有把所有 `high-frequency`/“高频”相关的非词书旅行文案顺手重写；本轮只处理词书描述范围。
- 没有拆 `App.js`，没有重做排序算法结构、SRS、units、publication 或 content schema，也没有改变裸的 `词-读音` 进度键。
- A4 没有把未锁定 artifact 的 registry 条目伪装成 eligible；三条新增来源如实保留为 incomplete，后续要补工件与许可快照再谈 release gate。

## PLAN v2 第二批（commit 7–10）

### 内容 commit 与统计输出对比

每一组均为 `node scripts/content-stats.mjs` 的完整字段对比；未列字段表示前后逐项相同。基线就是第一批末尾记录的 fallback 实测输出：`wordBank.total=8005`、`publication.learning=563`、`tags.scene.effective.convenience=23`、`jmdictSeq=6683/8005`、`kanji_anchor.complete=19/563`，其余 level/status/coverage/freq/pitch/daily/其他场景计数均保持原值。

| commit | before → after | 结论 |
|---|---|---|
| 7 `556e96a` | `wordBank 8005 → 8005`；`jmdictSeq 6683/8005 → 6683/8005`；`kanji_anchor 19/563 → 19/563`；`publication.learning 563 → 563` | 所有统计不变，只改一条深卡文案 |
| 8 `9171af3` | `jmdictSeq 6683/8005 (83.5%) → 7186/8005 (89.8%)`；`kanji_anchor.complete 19/563 → 518/563`；missing `jmdictSeq 544 → 41`；`publication.learning 563 → 563` | 其余字段逐项不变 |
| 9 `9d4e92b` | `convenience 23 → 35`；`wordBank 8005 → 8005`；`jmdictSeq 7186/8005 → 7186/8005`；`publication.learning 563 → 563` | 其余字段逐项不变 |
| release `8160b00` | `version 2.1 → 2.2`；统计字段全部不变；`publication.learning 563 → 563` | 只递增一次版本并追加一次 changelog |

首次输出的完整基线仍以本文件第一批的 `content-stats` 原文为准；本批每个 commit 的 before/after 原始日志在执行过程中分别核对，核心差异如上，且没有用改数据去迁就 plan。持续存在的已知差异为 `_meta.note=8026` 对实测 `wordBank.total=8005`（21 条），以及 pitch staging `agree=0` 实测 20 对旧 commit 文案 15（差 5）。

### W-T2 三类报告

目标为 544 个缺 `jmdictSeq` 的 `kanji_anchor`。join 严格使用 `词面+读音`，不是词面单独：自动通过 503、冲突 0、未命中 41，总数 544。自动通过的 503 条写入内容包；0 条冲突和 41 条未命中分别留在：

- `staging/jmdict-join-auto-pass.json`：503
- `staging/jmdict-join-conflicts.json`：0
- `staging/jmdict-join-unmatched.json`：41

### L-T1 最终便利店选择

最终 `convenience` 有 35 条：

`～円、～屋、いくら、要る、入れる、売る、お金、お弁当、買い物、買う、かかる、喫茶店、ごみ、コンビニ、財布、高い、デパート、部屋、便利、ホテル、丸い/円い、店、見せる、八百屋、安い、探す、店員、払う、レジ、レシート、カード、現金、充電、袋、ポイント`。

保留原有 23 条，因为它们已有 `daily` 且与价格、商品、店铺、支付等便利店任务直接相关；新增 12 条为 `店員、レジ、袋、払う、現金、カード、ポイント、探す、お弁当、入れる、要る、見せる`，理由是它们能覆盖收银、袋子、支付、找货和店员互动。没有用场景句子子串抽词；冲突和未命中未被“看起来最像”的词替代。10 条短句与 6 条 mini-dialogue 均只绑定真实存在的 wordBank ID，并由 validator 检查 ID。

### W-T3/W-T4 备料

`staging/convenience-meaning-review.json` 并列 35 条现有 `meaning_zh`、JMdict 英文 gloss、jmdictSeq 与疑点；只标疑点，不改释义。`staging/convenience-wordfield-candidates.json` 提供 8 条 review-only 候选；`node staging/audit-convenience-wordfield-candidates.mjs` 输出 `candidates=8, errors=[]`。这些产物不写入内容包。

### 发布、未做事项与待回答分叉

发布前审计 Blocker=0，fallback 与 sibling `yan-content/content.v2.json` 已同步；但 `bash scripts/push-content.sh` 对 `git@github.com:YSY929YSY/yan-content.git` 的 `origin/main` 推送被安全审批拦截，故本报告不声称远端发布完成，也未声称完成真机拉新包验证。

本批想改但忍住的地方：没有处理 41 个 W-T2 未命中、没有处理冲突（本次为 0）、没有改 `assets/content.fallback.json` 的其他释义/场景数据，没有补全全部 wordField，没有改 publication 或进度键，没有重构 UI/业务文件。

## PLAN v2 第四批（commit 17–20）

### 先修红灯：上一批报告勘误

本批开始时树确实是 `582` 中 `581` 通过、`1` 失败：`storage.test.mjs` 报口袋登记为 `kind:'user'` 却 `backfill:null`。上一批交接中把它写成“通过测试”不准确，本节予以更正。

第一步没有改成 device，而是保留项目所有者已经决定的“口袋上云”方案，把 `K.pocket` 的补传域改为 `backfill:'pocket'`。先跑验证确认红灯消失，再提交同步域接线；最终 commit 18 后 `npm test` 为 582/582，typecheck 通过。

### Commit 17：schema

`3696a79` 已包含 `src/lib/schema.word-pocket.sql` 和 `schema.apply-all.sql` 接线。表名完整使用 `word_pocket`，主键为 `(user_id, word_key)`，RLS 四条策略分别限制本人；每条 `create policy` 前都有完全对应的 `drop policy if exists ... on word_pocket`。

这只是仓库迁移文件验收。**`schema.word-pocket.sql` 待项目所有者在 Supabase Dashboard → SQL Editor 执行**；本报告不把它写成已执行，也没有假设云端表已存在。

### Commit 18：同步三件套与 fail-closed

`5c68eb5` 新增：

- `pushPocket(wordKey, inPocket)`：入袋 upsert，移出 delete；使用裸的 `词-读音`。
- `backfillPocket(pocketList)`：登录迁移时按 400 条分批 upsert。
- `pullPocket()`：按当前用户拉取 `word_key` 列表。
- `backfillAll()` 的 `run('pocket', ...)`：使用 `readJsonResult(K.pocket)`；读不到返回 `读不到本机口袋,保留 pending 下次重试`，不会报成功，也不会清除 pending。

合并语义写死为：登录那一次补传取并集“本机 ∪ 云端”；之后入袋/移出立即 push，启动 pull 成功后覆盖本地。已知局限是并集之后，若 A 机移出而 B 机尚未 pull 就 push，词可能复活；当前接受这个代价，没有假装成冲突解决系统。

### Commit 19：UI 同步行为

`baf8e7d` 接通启动 pull 与入袋/移出 push。远端 pull 返回 `null` 时保留本地；本地读失败由 write guard 阻止写回；本地写成功但远端 push 失败时，词仍可在本机使用，并显示“已存本机，联网后同步”，没有显示云端成功。实际 Supabase 真机/SQL Editor 联通验证尚未完成，因为 schema 仍待项目所有者执行；上述为代码路径和自动化验收结果，不冒充线上行为已验证。

### Commit 20：L-T2b 默认词书视图

`e36956f` 将词书打开后的默认列表改为：当前词书中口袋词优先；口袋为空时退回带产品场景标签的可学习词。默认列表按已有 `meaningTrust()` 排两段：`human_reviewed` / `editorial_published` 在前，其他未审词在后；UI 不展示内部状态名。原有全库入口、词书入口、四个状态筛选和仅词典路径保留，进度键未动。

### 本批之后的四件闭环

场景词：便利店 35 条、短句和对话已在 2.3 内容包；口袋：本地持久化 + 云同步代码已接线；主动输出：已有 `mode:'produce'` 单元现在可切块、选择、提交，拼错走 `again/lapses`，单块答案降级自评；回场景：场景来源卡显示“回到场景”，按 `scene:<sceneId>:<phraseId>` 定位原句。词书默认视图现在从口袋/场景词开始。

### 想改但忍住的地方

- 没有绕过项目所有者去执行 Supabase SQL，也没有声称云端表已存在。
- 没有把口袋改成 device，没有新增云端冲突解决策略，没有改 SRS 算法或进度键格式。
- 没有修改内容包、publication、`yanFeatures` 或 `kanji_anchor`，没有推进 commit 13 的旧版本实现，而是按本批要求落地为 commit 20。
- 没有拆 `App.js`，没有新增第二场景、第二种题型、词场内容或综合挑战。

项目所有者需要回答但本批不解决的分叉：便利店 8 个核心词当前不可学时，是（a）继续只作为场景句 `core_vocab` 引用但不进 SRS，（b）另开 publication 例外让它们可学习，还是（c）先补齐证据/例句后再进入 Learning；本批不替项目所有者决定，也不实现其中任何方案。

## PLAN v2 第五批（B5-1 至 B5-3）

### B5-1 · 词书筛选与今日任务回归

根因按真人测试结果修正：默认视图不再用口袋/场景词替换数据集，而是两种 `viewMode` 都从整本 `wordBank` 筛选，默认 `statusFilter` 为 `pocket`。口袋为空时，口袋筛选退回有场景标签的可学习词；`sortByTrust` 的两段式排序保留。

使用 `assets/content.fallback.json` 与当前 `pickSession` 口径实测：

- N5「全部」：**724 条**
- N5 今日任务：**10 条**
- N5 当前可学习词：569 条（仅作核对，不是“全部”按钮的显示数）

### B5-2 · 拼句结果与评分时机

提交后先显示判定结果：拼对显示“对了”，拼错显示“错了”并显示“正确顺序”。错题可点击“再拼一次”；状态会记住本题首次答错，因此重拼答对仍调用 `onGrade('again')`，不能刷成 `good`。只有结果已经展示、用户继续操作后才调用评分。`srs.js` 未修改。

拼句测试实际结果：5/5 通过，包含“提交判定结果可被调用方读取”的新增测试。

### B5-3 · 最终文案

> **收进来后会进入复习，之后还会再问你。**

文案放在词详情的“收入口袋”按钮旁；没有新增页面、动画、IP、onboarding 或口袋数据结构。

### 本批忍住没改

没有做地铁游戏化、英日优先、手账、分账/行程、地图性能、内容缺口、世界打卡地名匹配、五十音测验、首页“即将开放”清理，也没有改内容包、线上版本、SRS 算法或其他测试中出现但不属于本批的行为。

## Harness v0（2026-08-24）

### 实际改动范围

- 实现提交：`4574f53`（`chore: add pre-batch release safety harness`）。
- 新增 `scripts/audit.mjs`：只读调用 `content-stats.mjs`、`validate-content.js`、`meaning-audit.mjs`；扫描 `App.js` 与 `src/features/**` 的用户侧断言；检查两份内容包 SHA、authority 文件 Git 工作树状态、版本/内容变化；断言 `kanji_anchor=563` 与 `_meta.note` 词条数和实测 `wordBank.length` 一致；打印 `publication.learning` 但不做断言。
- `package.json` 新增一行：`"audit": "node scripts/audit.mjs"`。
- `docs/handoff/ACTIVE.md` 覆盖为 Harness v0 状态。
- 未新增 `docs/ai-contracts/`，未修改业务代码与内容 JSON。

### `npm run audit` 完整基线输出

```text

> yanapp@1.0.0 audit
> node scripts/audit.mjs

audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
WARN user-claims App.js:2813: review editorial claim "旅行高频"
WARN user-claims App.js:2857: review editorial claim "旅行高频"
WARN user-claims App.js:2951: review editorial claim "高频"
WARN user-claims App.js:2994: review editorial claim "高频"
WARN user-claims App.js:3041: review editorial claim "高频"
WARN user-claims App.js:3059: review editorial claim "旅行最高频框架"
WARN user-claims src/features/kana/KanaScreen.js:1954: review editorial claim "旅行高频"
PASS content-pack-sync sha256 4323789bdfb757e5d7ab4f7fd6387d67c58c527934456fa8607194351cde9235
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=579 (not asserted)
--- audit summary ---
FAIL: 0
WARN: 7
Result: PASS
```

### 故意制造 FAIL 的验收

临时把 `scripts/audit.mjs` 中 `EXPECTED_KANJI_ANCHOR_TOTAL` 从 563 改为 562，再运行 `npm run audit`，实际结果：

```text
exit=1
FAIL invariant kanji_anchor.total=563, expected 562
--- audit summary ---
FAIL: 1
Result: FAIL
```

## 主线续批 T1/T3 · 繁转简与对齐行收窄（2026-08-25）

### T1：Tatoeba 中文规范化

- 入口仍为 `scripts/wordfield-candidates.mjs`，实际筛选逻辑为 `scripts/wordfield-candidates.py`；只接入现成的 `opencc.OpenCC("t2s")`，没有自造转换表。
- staging 仍为 **1,851** 行；日语原句、`tatoeba.jp_sentence_id`、`tatoeba.zh_sentence_id` 逐条与修改前一致。
- 机器自检：按 OpenCC 可转换字符检查，繁体字符命中 **0**；有 **621** 行中文发生规范化。
- 工单写的 368/1851 是较窄的常用字命中口径；本次按 OpenCC 完整可转换字符统计，因此影响行数更高。最终产物以 OpenCC 规范化结果为准。
- 没有改日文原句，没有新增字段，没有改内容包。

### T3：对齐行 gloss

`wordFieldAlignment.js` 现在先取第一个中文义项，再取第一个 `，`、`、`、`,`、`/` 分隔符之前的完整片段；不加省略号，不修改词条 `meaning_zh`。旧式对齐行的 gloss 使用 `numberOfLines={1}`，同时移除其截断宽度，避免自动把完整词义裁成半个词；`TokenColumnSentence` 三槽位结构未改。

| 词 | 收窄前 | 收窄后 |
|---|---|---|
| カード | 积分卡/银行卡，卡片 | 积分卡 |
| 見せる | 给……看，展示 | 给……看 |
| 袋 | 袋子；（橘子等的）瓤 | 袋子 |
| 現金 | 现金；现实，势利 | 现金 |
| 聞く | 听；问 | 听 |
| 料理 | 料理，做菜 | 料理 |
| 果物 | 水果 | 水果（不变） |
| 大好き | 非常喜欢 | 非常喜欢（不变） |
| 雨 | 雨 | 雨（不变） |
| 出かける | 出门 | 出门（不变） |

新增测试用真实词库覆盖以上 10 个词，并断言不以分隔符或省略号结束；渲染测试断言对齐行 gloss 单行显示。

### T2 状态

T2 落库 **0 条**。没有项目负责人的质量确认和落库数量决定，本轮不自行选择、不改 `assets/content.fallback.json` 或 `yan-content/content.v2.json`；主线数字仍为已落库 20/563，M1 staging 覆盖 459/563。

### 提交与 EAS Update

- `0d82268 fix(wordfield): normalize staged Tatoeba translations before review`：OpenCC 规范化脚本与 staging 产物。
- `c839be5 fix(wordfield): keep alignment glosses short and single-line`：对齐行纯函数、单行渲染与测试；未改三槽位 renderer。
- EAS Update 已成功发布：preview / iOS，update group `94cd5add-ca1e-464d-81d2-997cc0fe5974`，iOS update ID `01a0380f-67e2-79d2-a6a2-986523106c3c`。
- EAS 发布不等于真机验收；系统字号是否撑散对齐、不同设备实际显示：**待真机验证**。
- 这次忍住没做：T2 落库、修改词条本身释义、改三槽位、推全库 B9-2、构建、横竖屏结论。

### 交报告前原始输出

```text
?? "\350\260\203\347\240\224/"
?? ../YanApp_backup_0501/
?? ../resources/
?? ../yan-content/README.md
?? ../yan-content/content.json
?? ../yan-content/content.v1.json
?? "../yan-content/yan_word_story\350\276\223\345\205\245\346\250\241\345\274\217\346\216\242\350\256\25026.6.2.html"

> yanapp@1.0.0 audit
> node scripts/audit.mjs

audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
WARN user-claims App.js:2915: review editorial claim "旅行高频"
WARN user-claims App.js:2959: review editorial claim "旅行高频"
WARN user-claims App.js:3053: review editorial claim "高频"
WARN user-claims App.js:3096: review editorial claim "高频"
WARN user-claims App.js:3143: review editorial claim "高频"
WARN user-claims App.js:3161: review editorial claim "旅行最高频框架"
WARN user-claims src/features/kana/KanaScreen.js:1954: review editorial claim "旅行高频"
PASS content-pack-sync sha256 a00a76e1289a9c84e0f7089b2edc1949811bf52fb08f7c297ba55ada8ffecd82
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
INFO doc-refs scanned 798 references (356 unique)
WARN doc-refs docs/AUDIT-source-trust-2026-08-22.md:16: missing 调研/…/red调研重新规划_编号修正版.md
WARN doc-refs docs/AUDIT-source-trust-2026-08-22.md:286: missing red调研重新规划_编号修正版.md
WARN doc-refs docs/ROADMAP-content-trust-structure-ui.md:804: missing src/content/publication.ts
WARN doc-refs docs/ROADMAP-content-trust-structure-ui.md:803: missing src/content/schema.ts
WARN doc-refs docs/ROADMAP-content-trust-structure-ui.md:278: missing src/content/contentValidation.ts
WARN doc-refs docs/TICKET-jmdict-followup.md:86: missing staging/duplicate-seq-plan.md
WARN doc-refs docs/TICKET-jmdict-followup.md:86: missing staging/duplicate-seq-groups.json
PASS doc-refs 所有引用都已入库（7 条指向不存在的路径，见 WARN）
PASS workspace-clean docs markdown tracked
--- audit summary ---
FAIL: 0
WARN: 14
Result: PASS
```

## 主线 M1 · Tatoeba 词场候选（2026-08-25）

### 结果

本轮只做 M1，不写内容包、不改现有 20 条词场、不构建。入口脚本为
`scripts/wordfield-candidates.mjs`，实际筛选逻辑在
`scripts/wordfield-candidates.py`，产物为
`staging/wordfield-candidates-tatoeba.jsonl`。

- 主线池：563 条 `kanji_anchor`。
- 找到合格候选的主线池词：**459 / 563**。
- 候选总数：**1,851** 条。
- 成员组合：**1,569** 组；同一组最多保留 2 条。
- 平均：**3.29 条/全池词**；按已覆盖词算 **4.03 条/词**。
- 每条都有 `tatoeba.jp_sentence_id` 与 `tatoeba.zh_sentence_id`，且有至少 2 个 `member_word_ids`。
- 机器筛选上限：日文 ≤20 字、≤8 个 Sudachi token；`unknown_words` 逐条写入，供人工判断难度。
- 日文、中文均为本地 Tatoeba 原句；没有使用 LLM 造句或改写。中文保留语料原文的简繁混用，不在筛选阶段改写。

覆盖数只代表 staging 中找到合格候选，**不代表已落库或已完成人工审校**。剩余 104 条未找到同时满足全部门槛的候选，留给后续人工/规则复核，不用低质量句子硬填。

### 10 条样例

以下均直接摘自 JSONL；括号内为命中的成员词 ID，末尾为日句 ID / 中句 ID。10 条的 `unknown_words` 均为空。

| 日文原句 | 中文原句 | 成员词 | Tatoeba ID（日 / 中） |
|---|---|---|---|
| 彼は新しいコンピューターを買ったらしい。 | 他好像买了台新电脑。 | `n5_atarashii`, `n5_kau` | `103832 / 2393065` |
| 悪い習慣を取り除くことはとても難しい。 | 改掉坏习惯是很难的。 | `n5_muzukashii`, `n5_warui` | `191469 / 2411002` |
| 車はいつ返したらよろしいでしょうか。 | 車子方便什麼時候還呢？ | `n5_kaesu`, `n5_kuruma` | `149020 / 949354` |
| 来週ヨーロッパへ行くつもりなんです。 | 我下週要去歐洲。 | `n5_iku`, `n5_raishuu` | `191765 / 850591` |
| ちょっと待って、トイレに行きたいの。 | 稍等一下，我想去上一下廁所。 | `n5_iku`, `n5_matsu` | `9308408 / 10301340` |
| カメラにフィルムを入れ忘れちゃった。 | 相機裡忘了放底片了！ | `n5_ireru`, `n5_wasureru` | `10267526 / 805869` |
| あなたはもっと果物を食べるべきです。 | 你應該多吃點水果。 | `n5_kudamono`, `n5_taberu` | `13543108 / 534147` |
| 料理にあまりに時間がかかりすぎる。 | 做饭太费时间了。 | `n5_jikan`, `n5_ryouri` | `77938 / 3341521` |
| 彼女はバイオリンを上手に弾きます。 | 她的小提琴拉得很好。 | `n5_hiku_2`, `n5_jouzu` | `91767 / 343226` |
| 雨が止んだらすぐに出かけましょう。 | 只要雨一停我们就走。 | `n5_ame`, `n5_dekakeru` | `189679 / 5091636` |

### 实现与门禁

- `d9ec045 feat(wordfield): use native Tatoeba coverage to set the mainline frontier`：新增本地 Tatoeba 筛选脚本和 JSONL staging 产物；没有内容包改动。
- `97df011 docs(wordfield): record the evidence before mainline review`：更新 `AGENTS.md` 主线覆盖数字、`ACTIVE.md` 当前工单、10 条样例报告，并加入工单指定的 `.mjs` 入口。
- `eb2f971 docs(handoff): include the raw mainline gate output`：把交报告前的原始 `git status --short` 与 `npm run audit` 输出写入本报告。
- 同一入口保留 Node `.mjs` 以对齐工单路径；它只注入参数并转交 Python，未复制筛选规则。
- `npm test`：606 passed，0 failed。
- `npm run typecheck`：exit 0。
- 额外机器校验：1,851 行均有两端句子 ID、中文、至少 2 个成员；最大日文长度 20、最大 token 数 8；同组合不超过 2 条。
- 这次忍住没做：M2 落库、补齐剩余 104 条、改现有 20 条词场、批量推全库、B9-2 UI/真机验证、构建或 EAS Update。

### 交报告前原始输出

`git status --short` 与 `npm run audit` 在最后一个交接提交后执行，原始输出如下：

```text
?? "\350\260\203\347\240\224/"
?? ../YanApp_backup_0501/
?? ../resources/
?? ../yan-content/README.md
?? ../yan-content/content.json
?? ../yan-content/content.v1.json
?? "../yan-content/yan_word_story\350\276\223\345\205\245\346\250\241\345\274\217\346\216\242\350\256\25026.6.2.html"

> yanapp@1.0.0 audit
> node scripts/audit.mjs

audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
WARN user-claims App.js:2914: review editorial claim "旅行高频"
WARN user-claims App.js:2958: review editorial claim "旅行高频"
WARN user-claims App.js:3052: review editorial claim "高频"
WARN user-claims App.js:3095: review editorial claim "高频"
WARN user-claims App.js:3142: review editorial claim "高频"
WARN user-claims App.js:3160: review editorial claim "旅行最高频框架"
WARN user-claims src/features/kana/KanaScreen.js:1954: review editorial claim "旅行高频"
PASS content-pack-sync sha256 a00a76e1289a9c84e0f7089b2edc1949811bf52fb08f7c297ba55ada8ffecd82
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
INFO doc-refs scanned 782 references (349 unique)
WARN doc-refs docs/AUDIT-source-trust-2026-08-22.md:16: missing 调研/…/red调研重新规划_编号修正版.md
WARN doc-refs docs/AUDIT-source-trust-2026-08-22.md:286: missing red调研重新规划_编号修正版.md
WARN doc-refs docs/ROADMAP-content-trust-structure-ui.md:804: missing src/content/publication.ts
WARN doc-refs docs/ROADMAP-content-trust-structure-ui.md:803: missing src/content/schema.ts
WARN doc-refs docs/ROADMAP-content-trust-structure-ui.md:278: missing src/content/contentValidation.ts
WARN doc-refs docs/TICKET-jmdict-followup.md:86: missing staging/duplicate-seq-plan.md
WARN doc-refs docs/TICKET-jmdict-followup.md:86: missing staging/duplicate-seq-groups.json
PASS doc-refs 所有引用都已入库（7 条指向不存在的路径，见 WARN）
PASS workspace-clean docs markdown tracked
--- audit summary ---
FAIL: 0
WARN: 14
Result: PASS
```

## PLAN v2 第九批（B9-1 已完成；B9-2 开工前记录）

### B9-1 · 消灭静默降级

- `5471ec5`：改动 `App.js`、`src/features/wordbank/wordFieldAlignment.js` 和 `src/features/wordbank/__tests__/wordFieldAlignment.test.mjs`。
- 删除 alignment 模块内部的 `require` / `loadBundledDictionaryForms` / 默认 bundled Map；新增纯函数 `dictionaryFormsFrom(exampleTokens)`。
- `App.js` 使用已经 import 的 `EXAMPLE_TOKENS`，模块级只构建一次 `EXAMPLE_DICTIONARY_FORMS`，词场渲染显式传入。
- 真实 `assets/example_tokens.json` 守卫结果：Map size `1083`，包含 `探し → 探す`；`grep -n "require(" src/features/wordbank/wordFieldAlignment.js` 无命中。
- 20 条词场句覆盖率基线仍为 `133/133`；定向测试 5 passed；全量测试 604 passed；typecheck 通过。
- 构建后的真机“店員にカードを見せます。”六个 token 是否都显示中文：**待真机验证**。

### B9-2 · 实现前 View 层级与三槽位方案（负责人要求）

当前层级是：

```text
WBDetailPage
└─ wordFields.map
   └─ View wd.section
      ├─ Text wd.sectionLabel
      └─ View wd.exRow
         ├─ View { flex: 1, gap: 3 }
         │  ├─ View wd.wfAlignRow  (row + wrap)
         │  │  └─ View wd.wfAlignToken  (每个 token 一列)
         │  │     ├─ Text wd.wfAlignJp
         │  │     └─ Text wd.wfAlignZh / wd.wfAlignGrammar（有 gloss 才渲染）
         │  ├─ Text wd.exRoma
         │  └─ Text wd.exZh
         └─ SpeakBtn
```

准备改成：

```text
TokenColumnSentence
└─ View tokenRow  (row + wrap；横向单位始终是 token column)
   └─ View tokenColumn
      ├─ View readingSlot  (固定第一槽；用现有 Furigana/alignFurigana)
      ├─ View japaneseSlot (固定第二槽；同一 token 的日语)
      └─ Text glossSlot    (固定第三槽；词义/语法作用，blank 只留高度)
```

例句和词场都调用同一个 `TokenColumnSentence`；例句传 `showGloss=false` 隐藏第三槽，词场传 `showGloss=true`。例句的 token 读音继续交给现有 `Furigana`，其内部继续复用 `furigana.ts`，不另写假名对齐规则。词场只在两句样板上切换到该 renderer，其他词场不推广。

### B9-2 · 实际结果

- `fe06d0e`：改动 `App.js`、`src/features/wordbank/ExampleSentence.js` 和 `src/lib/__tests__/token-column-renderer.test.mjs`。
- 两句均按 token column 渲染：`店員 / に / カード(サイズ) / を / 見せ(聞き) / ます / 。`；每列由现有 `Furigana` 的读音+日语布局和第三行 gloss 组成，grammar 继续使用低权重样式，blank 只留槽位高度。
- `店員にカードを見せます。` 中 `カード` 的 gloss 为“积分卡/银行卡，卡片”，`見せ` 的 gloss 为“给……看，展示”；`店員にサイズを聞きます。` 中 `サイズ`、`聞き` 同样有对应 gloss。两句的 `を` 下方是“宾语”，`ます` 下方是“礼貌”。
- 例句 `店員にサイズを聞きます。` 与词场 `店員にカードを見せます。` 走同一个 renderer；例句隐藏第三槽。没有推全库词场，也没有改内容包。
- `npm test`：606 passed；`npm run typecheck`：通过；`npm run audit`：`FAIL: 0`、`WARN: 14`、`Result: PASS`。
- 真机显示、横竖屏和不同机型下是否无漂移：**待真机验证**。

### B9 本轮想改但忍住没改

没有把三槽位 renderer 推到其他词场，没有改内容包或例句数据，没有重写 `furigana.ts`，没有用句子专属坐标/字符宽度补偿布局，也没有顺手改按钮层级、灰阶或离线 banner。

### B9 最终交报告前原始输出

#### `git status --short`

```text
?? "\\350\\260\\224\\347\\240\\224/"
?? ../YanApp_backup_0501/
?? ../resources/
?? ../yan-content/README.md
?? ../yan-content/content.json
?? ../yan-content/content.v1.json
?? "../yan-content/yan_word_story\\350\\276\\223\\205\\245\\350\\250\\236\\345\\274\\217\\346\\216\\242\\350\\256\\25026.6.2.html"
```

#### `npm run audit`

```text
> yanapp@1.0.0 audit
> node scripts/audit.mjs

audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
WARN user-claims App.js:2914: review editorial claim "旅行高频"
WARN user-claims App.js:2958: review editorial claim "旅行高频"
WARN user-claims App.js:3052: review editorial claim "高频"
WARN user-claims App.js:3095: review editorial claim "高频"
WARN user-claims App.js:3142: review editorial claim "高频"
WARN user-claims App.js:3160: review editorial claim "旅行最高频框架"
WARN user-claims src/features/kana/KanaScreen.js:1954: review editorial claim "旅行高频"
PASS content-pack-sync sha256 a00a76e1289a9c84e0f7089b2edc1949811bf52fb08f7c297ba55ada8ffecd82
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
INFO doc-refs scanned 748 references (333 unique)
WARN doc-refs docs/AUDIT-source-trust-2026-08-22.md:16: missing 调研/…/red调研重新规划_编号修正版.md
WARN doc-refs docs/AUDIT-source-trust-2026-08-22.md:286: missing red调研重新规划_编号修正版.md
WARN doc-refs docs/ROADMAP-content-trust-structure-ui.md:804: missing src/content/publication.ts
WARN doc-refs docs/ROADMAP-content-trust-structure-ui.md:803: missing src/content/schema.ts
WARN doc-refs docs/ROADMAP-content-trust-structure-ui.md:278: missing src/content/contentValidation.ts
WARN doc-refs docs/TICKET-jmdict-followup.md:86: missing staging/duplicate-seq-plan.md
WARN doc-refs docs/TICKET-jmdict-followup.md:86: missing staging/duplicate-seq-groups.json
PASS doc-refs 所有引用都已入库（7 条指向不存在的路径，见 WARN）
PASS workspace-clean docs markdown tracked
--- audit summary ---
FAIL: 0
WARN: 14
Result: PASS
```

## PLAN v2 第八批（A 修渲染 / B 补辞书形）

### 实际改动与提交

- `f2ed5e7`：A/B 代码与 App asset 合并提交。改动范围是 `App.js`、`scripts/build-example-tokens.py`、`src/features/wordbank/exampleTokens.ts`、`src/features/wordbank/wordFieldAlignment.js`、`assets/example_tokens.json` 及对应 `__tests__/` 测试。
- 未修改 `assets/content.fallback.json`、`yan-content/content.v2.json`，没有走 `push-content.sh`。

### A · 渲染

- A-1 根因修复为移除词场 token 的 `minHeight + justifyContent: 'flex-end'`，词场行与 token 改为顶部对齐；没有中文 gloss 的 token 不再被 42px 盒子顶到底部，因此混排时日语顶边/基线稳定。
- A-2 直接消费既有 `token.source`：`wordBank` 使用正常的中灰词义样式，`grammar` 使用更小、更浅的语法作用样式，`blank` 不渲染。语法文案在渲染层去掉括号，所以“宾语”挂在 `を` 的 token 下，不会被读成 `現金` 的词义。
- 没有动 `ExampleSentence`、颜色常量、已有 `ls/wb/wd` 样式、读音设置、按钮层级或离线 banner。

### B · 辞书形管线

- `build-example-tokens.py` 保存 `dictionary_form()`，仅在与 surface 不同时以第三项进入紧凑数组；读取层暴露 `dictionaryForm`，不为重复值付包体积。
- 词场查词顺序为词面 → reading → 辞书形；无法唯一映射的辞书形继续留空，不猜。
- 20 条词场句：`115/133 = 86.5%` → `133/133 = 100.0%`；留空 `18` → `0`，18 个动词洞（包括 `払い`、`探し`、`入れ`、`会い` 等）清零。
- 产物从 `520,743` bytes 增至 `598,745` bytes，增加 `78,002` bytes（`+14.98%`）；新增 5,302 个三元 token。脚本实测仍为 4,400 句、36,435 token，含汉字 token 12,247、可对齐 12,237（99.92%）。
- 这 20 条样板没有剩余空 token；全量例句中仍可能有不适合猜测的形状/歧义，读取和查词层保持 fail-closed。

### 验收

- `npm test && npm run typecheck`：603 passed，0 failed；typecheck exit 0。
- `git diff --check`：通过。
- 本批没有改内容包，因此没有 `content-stats` 前后差异可报告；`assets/example_tokens.json` 是打进 App 的 asset，需重新构建 App 才生效。

### 想改但忍住没改

没有启动 C 的四层渲染合并；没有改例句渲染器、内容包、语法数据字段、`units.js`、`srs.js`、颜色常量或其他工单明确不做的观察项；没有用 LLM 为辞书形或逐块中文补猜。

### 交报告前原始门禁输出

以下两段是在报告整理完成后按 `AGENTS.md` 第六节执行的原始输出；最终 audit 为 `FAIL: 0`，保留 14 条 WARN。

#### `git status --short`

```text
?? "\350\260\224\347\240\224/"
?? ../YanApp_backup_0501/
?? ../resources/
?? ../yan-content/README.md
?? ../yan-content/content.json
?? ../yan-content/content.v1.json
?? "../yan-content/yan_word_story\350\276\223\205\245\350\250\236\345\\274\\217\346\\216\\242\350\\256\\25026.6.2.html"
```

#### `npm run audit`

```text
> yanapp@1.0.0 audit
> node scripts/audit.mjs

audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
WARN user-claims App.js:2859: review editorial claim "旅行高频"
WARN user-claims App.js:2903: review editorial claim "旅行高频"
WARN user-claims App.js:2997: review editorial claim "高频"
WARN user-claims App.js:3040: review editorial claim "高频"
WARN user-claims App.js:3087: review editorial claim "高频"
WARN user-claims App.js:3105: review editorial claim "旅行最高频框架"
WARN user-claims src/features/kana/KanaScreen.js:1954: review editorial claim "旅行高频"
PASS content-pack-sync sha256 a00a76e1289a9c84e0f7089b2edc1949811bf52fb08f7c297ba55ada8ffecd82
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
INFO doc-refs scanned 724 references (323 unique)
WARN doc-refs docs/AUDIT-source-trust-2026-08-22.md:16: missing 调研/…/red调研重新规划_编号修正版.md
WARN doc-refs docs/AUDIT-source-trust-2026-08-22.md:286: missing red调研重新规划_编号修正版.md
WARN doc-refs docs/ROADMAP-content-trust-structure-ui.md:804: missing src/content/publication.ts
WARN doc-refs docs/ROADMAP-content-trust-structure-ui.md:803: missing src/content/schema.ts
WARN doc-refs docs/ROADMAP-content-trust-structure-ui.md:278: missing src/content/contentValidation.ts
WARN doc-refs docs/TICKET-jmdict-followup.md:86: missing staging/duplicate-seq-plan.md
WARN doc-refs docs/TICKET-jmdict-followup.md:86: missing staging/duplicate-seq-groups.json
PASS doc-refs 所有引用都已入库（7 条指向不存在的路径，见 WARN）
PASS workspace-clean docs markdown tracked
--- audit summary ---
FAIL: 0
WARN: 14
Result: PASS
```

随后已把断言恢复为 563；错误数字没有进入提交。

### 与工单/当前事实的对照

- 当前 fallback 实测 `wordBank.total=8005`、`kanji_anchor.total=563`、`publication.learning=579`；后者只打印不阻断，符合工单“开池会变化”的要求。
- `validate-content.js` 本身会产生大量既有 warning，但 exit 0；Harness 只以其 exit status 判定，不重写它的规则，也不把 warning 伪装成 FAIL。
- 用户侧扫描的 7 条 WARN 全是现有“高频”编辑判断，当前没有内部状态词或词库“高频/官方/必考/已核验”断言，因此整体 exit 0。

### 本轮想加但忍住没加（留给 v1）

- 没有拆分 `audit:deep-cards`、`audit:produce-units`、`audit:scene-tags`。
- 没有重写三个已有脚本，也没有新增独立测试文件。
- 没有把 `publication.learning` 写成硬断言，没有扫描内容 JSON 的用户文案，也没有把所有编辑判断 warning 升格为失败。

## PLAN v2 第六批（B6-1 至 B6-4）

### 实际改动与 commit

- `7da71ce`：B6-1 纯机器 JMdict 回锁；新增 N4/N5 自动通过、冲突、未命中 JSON 与汇总报告；两份内容包只写自动通过的 `jmdictSeq`。
- `6e98925`：B6-2 按回锁结果开放 N4 学习池，新增 608 条 Learning，`learningBasis=n4_refined_relocked_2026-08-24`，版本 2.3 → 2.4。
- `429e7dc`：B6-3 主 CTA 使用独立混合队列；词库单元继续问读音，深内容进入拼句；不与次入口共用今日队列。
- `b64984b`：B6-4 将 8 条备料候选和 12 条主线词条写入词场，共 20 条。

### B6-1 结果

当前内容包实测 N4 共有 631 条（工单写 631），其中缺 `jmdictSeq` 为 615；N5 目标 197。严格按词面+读音 join：N4 自动 596、冲突 19、未命中 0；N5 自动 92、冲突 46、未命中 59。合计 812 个级别目标、688 个自动通过；由于「みんな」同时属于 N4/N5，写入内容包的是 687 条唯一词条。冲突和未命中均未猜、未写入。

### B6-1 前审计（完整输出）

```text
audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
WARN user-claims App.js:2813: review editorial claim "旅行高频"
WARN user-claims App.js:2857: review editorial claim "旅行高频"
WARN user-claims App.js:2951: review editorial claim "高频"
WARN user-claims App.js:2994: review editorial claim "高频"
WARN user-claims App.js:3041: review editorial claim "高频"
WARN user-claims App.js:3059: review editorial claim "旅行最高频框架"
WARN user-claims src/features/kana/KanaScreen.js:1954: review editorial claim "旅行高频"
PASS content-pack-sync sha256 4323789bdfb757e5d7ab4f7fd6387d67c58c527934456fa8607194351cde9235
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=579 (not asserted)
--- audit summary ---
FAIL: 0
WARN: 7
Result: PASS
```

### B6-1 后审计（提交前后事实）

写入双包后、提交前的审计按 authority 未提交规则为 `FAIL: 1`；提交 `7da71ce` 后重跑为 `FAIL: 0, WARN: 8, Result: PASS`。提交后的完整输出：

```text
audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
WARN user-claims App.js:2813: review editorial claim "旅行高频"
WARN user-claims App.js:2857: review editorial claim "旅行高频"
WARN user-claims App.js:2951: review editorial claim "高频"
WARN user-claims App.js:2994: review editorial claim "高频"
WARN user-claims App.js:3041: review editorial claim "高频"
WARN user-claims App.js:3059: review editorial claim "旅行最高频框架"
WARN user-claims src/features/kana/KanaScreen.js:1954: review editorial claim "旅行高频"
PASS content-pack-sync sha256 845a8d3a8514da37cfc007a3740c8774ff4573247a2a0b49731a7ea2498ada45
PASS content-pack-sync authority content.v2.json has no uncommitted change
WARN content-pack-sync _meta.version unchanged while content changed (2.3)
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=579 (not asserted)
--- audit summary ---
FAIL: 0
WARN: 8
Result: PASS
```

### B6-2 结果与审计

按三项条件逐条开 N4：自动回锁、有 `exampleJp` 与 `coreChunk`、`status !== 'zh_drafted'`。新开 608 条，`publication.learning` 从 579 到 1187；N4「全部」实测 631，`kanji_anchor.total` 仍 563；两份内容包 SHA 为 `65587aac6fd51865d0a7e9d39a0bdd1b1b6afc959a496e2a46fcf24d1874e6c3`。

B6-2 开始前 audit 为 `FAIL: 1`（authority 有未提交变更），其余检查通过，实测 `publication.learning=1187`、`kanji_anchor.total=563`。`6e98925` 提交后完整结果：

```text
audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
WARN user-claims App.js:2813: review editorial claim "旅行高频"
WARN user-claims App.js:2857: review editorial claim "旅行高频"
WARN user-claims App.js:2951: review editorial claim "高频"
WARN user-claims App.js:2994: review editorial claim "高频"
WARN user-claims App.js:3041: review editorial claim "高频"
WARN user-claims App.js:3059: review editorial claim "旅行最高频框架"
WARN user-claims src/features/kana/KanaScreen.js:1954: review editorial claim "旅行高频"
PASS content-pack-sync sha256 65587aac6fd51865d0a7e9d39a0bdd1b1b6afc959a496e2a46fcf24d1874e6c3
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
--- audit summary ---
FAIL: 0
WARN: 7
Result: PASS
```

### B6-3 结果与审计

主 CTA 现在把本轮词条批次和最多一条未学深内容放入独立队列；词库 `recall` 仍显示“这个词你已经认识”并考读音，深内容按 `produce` 进入拼句。两个入口的数字口径差异保留在注释中，没有合并。

B6-3 前审计完整输出：

```text
audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
WARN user-claims App.js:2820: review editorial claim "旅行高频"
WARN user-claims App.js:2864: review editorial claim "旅行高频"
WARN user-claims App.js:2958: review editorial claim "高频"
WARN user-claims App.js:3001: review editorial claim "高频"
WARN user-claims App.js:3048: review editorial claim "高频"
WARN user-claims App.js:3066: review editorial claim "旅行最高频框架"
WARN user-claims src/features/kana/KanaScreen.js:1954: review editorial claim "旅行高频"
PASS content-pack-sync sha256 65587aac6fd51865d0a7e9d39a0bdd1b1b6afc959a496e2a46fcf24d1874e6c3
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
--- audit summary ---
FAIL: 0
WARN: 7
Result: PASS
```

B6-3 后审计与前审计相同口径，提交 `429e7dc` 后完整结果仍为 `FAIL: 0, WARN: 7, Result: PASS`，SHA 仍为 `65587aac6fd51865d0a7e9d39a0bdd1b1b6afc959a496e2a46fcf24d1874e6c3`，`publication.learning=1187`，`kanji_anchor.total=563`。

为保留每一步的原始前后记录，B6-2 前审计的完整尾部如下（内容包已写入、尚未提交，所以 authority 这一项按 harness 规则失败）：

```text
PASS content-pack-sync sha256 65587aac6fd51865d0a7e9d39a0bdd1b1b6afc959a496e2a46fcf24d1874e6c3
FAIL content-pack-sync authority content.v2.json has uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
--- audit summary ---
FAIL: 1
WARN: 7
Result: FAIL
```

B6-3 后审计的完整输出：

```text
PASS content-pack-sync sha256 65587aac6fd51865d0a7e9d39a0bdd1b1b6afc959a496e2a46fcf24d1874e6c3
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
--- audit summary ---
FAIL: 0
WARN: 7
Result: PASS
```

### B6-4 结果与审计

词场最终实测 `wordField=20/8005`，`auditWordFields(wordBank)` 返回 `[]`，`buildUnits()` 产出 162 个单元，其中 `field=20`。B6-4 的 8 条候选日语自然度原文结论：**未经母语者确认**。这 8 条只做了机器成员存在性和句中出现检查，不写成已验证。

B6-4 前审计（写入双包、提交前）完整结果：

```text
audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
WARN user-claims App.js:2820: review editorial claim "旅行高频"
WARN user-claims App.js:2864: review editorial claim "旅行高频"
WARN user-claims App.js:2958: review editorial claim "高频"
WARN user-claims App.js:3001: review editorial claim "高频"
WARN user-claims App.js:3048: review editorial claim "高频"
WARN user-claims App.js:3066: review editorial claim "旅行最高频框架"
WARN user-claims src/features/kana/KanaScreen.js:1954: review editorial claim "旅行高频"
PASS content-pack-sync sha256 a00a76e1289a9c84e0f7089b2edc1949811bf52fb08f7c297ba55ada8ffecd82
FAIL content-pack-sync authority content.v2.json has uncommitted change
WARN content-pack-sync _meta.version unchanged while content changed (2.4)
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
--- audit summary ---
FAIL: 1
WARN: 8
Result: FAIL
```

提交 `b64984b` 后 B6-4 后审计完整结果：

```text
audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
WARN user-claims App.js:2820: review editorial claim "旅行高频"
WARN user-claims App.js:2864: review editorial claim "旅行高频"
WARN user-claims App.js:2958: review editorial claim "高频"
WARN user-claims App.js:3001: review editorial claim "高频"
WARN user-claims App.js:3048: review editorial claim "高频"
WARN user-claims App.js:3066: review editorial claim "旅行最高频框架"
WARN user-claims src/features/kana/KanaScreen.js:1954: review editorial claim "旅行高频"
PASS content-pack-sync sha256 a00a76e1289a9c84e0f7089b2edc1949811bf52fb08f7c297ba55ada8ffecd82
PASS content-pack-sync authority content.v2.json has no uncommitted change
WARN content-pack-sync _meta.version unchanged while content changed (2.4)
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
--- audit summary ---
FAIL: 0
WARN: 8
Result: PASS
```

### 测试、release check 与刻意保留项

四个步骤各自按顺序执行 `npm test && npm run typecheck`，最终均为 594 passed、typecheck exit 0。`bash ../tools/check-content-release.sh` 最终报告显示 schema 校验、fallback 同步、wordBank 审计、地点审计通过；脚本写入父仓库 `reports/`，未将其余报告文件混入本批 commit。线上仍停在内容包 2.4，未执行 push。

本批没有改 `srs.js`、进度键、`yanFeatures`、`kanji_anchor`、N3/N2/N1、词源、深卡扩展、口袋、频率、英日优先、地铁游戏化、手账、地图性能或内容缺口。也没有把“未经母语者确认”的 8 条候选写成已验证。

## PLAN v2 第七批（B7-1 至 B7-4）

### 实际改动与 commit

- `2a798ab`：纯代码提交，修改 `App.js` 的口袋提示、词性标签、词场渲染；新增 `src/features/wordbank/wordFieldAlignment.js` 和对应 `__tests__/wordFieldAlignment.test.mjs`。
- 未修改 `assets/content.fallback.json`、`yan-content/content.v2.json`、`units.js`、内容管线或内容包版本。

### B7-1 · 口袋文案

删除“收进来后会进入复习，之后还会再问你。”，保留“已存本机，联网后同步”。空口袋列表的引导不属于按钮下方的同步状态提示，未扩大改动范围。

### B7-2 · 词性标签

只调整词详情页 `wd.posTag`：固定内边距、取消多余的横向占位，让 `名词`、`动词`、`名词（する动词）` 随文字宽度变化；词书列表的 `wb.posTag` 未改。

### B7-3 · 词场

最终标签措辞：**“这句话里，它和这些词碰面”**。

成员通过 `wordField.members[].id` 查词，按成员的词面或 reading 在句子中标色并加下划线；成员查不到时跳过，不报错、不生成假高亮。20 条现有词场均使用同一运行时渲染路径。

### B7-4 · 逐词中文样板

只对内容包中已有的 20 条词场句运行派生对齐。算法顺序是：固定语法成分表 → 词面查词库 → reading 查词库 → 未命中留空；没有写入内容包，也没有使用 LLM。正常语序中文继续读取现有 `wordField.sentence.zh`。

实际数字（手动单独运行 `node --input-type=module` 统计）：

- 20 条句子。
- 133 个 token。
- 115 个 token 有中文，覆盖率 `115 / 133 = 86.5%`。
- 18 个 token 留空，占 `13.5%`。
- 留空最多的类别：**活用碎片，18 个（全部留空项）**。
- 本样板没有因表记差异留下空项；reading 查命中了 `美味しい/おいしい`、`朝御飯/朝ご飯` 等表记差异。

留空示例是 `会い`、`買い`、`食べ`、`行き`、`待ち`、`出し`、`探し`、`見せ`、`払い`、`入れ`、`あり`、`読み` 等活用碎片；没有猜测中文。

### 验收

```text
npm test
ℹ tests 596
ℹ pass 596
ℹ fail 0

npm run typecheck
exit 0

npm run audit
--- audit summary ---
FAIL: 0
WARN: 7
Result: PASS
```

最终 `npm run audit` 完整输出：

```text
audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
WARN user-claims App.js:2847: review editorial claim "旅行高频"
WARN user-claims App.js:2891: review editorial claim "旅行高频"
WARN user-claims App.js:2985: review editorial claim "高频"
WARN user-claims App.js:3028: review editorial claim "高频"
WARN user-claims App.js:3075: review editorial claim "高频"
WARN user-claims App.js:3093: review editorial claim "旅行最高频框架"
WARN user-claims src/features/kana/KanaScreen.js:1954: review editorial claim "旅行高频"
PASS content-pack-sync sha256 a00a76e1289a9c84e0f7089b2edc1949811bf52fb08f7c297ba55ada8ffecd82
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
--- audit summary ---
FAIL: 0
WARN: 7
Result: PASS
```

### 本批忍住没改

没有重跑 4400 条例句覆盖率、没有改 `build-example-tokens.py` 保存辞书形、没有把逐词中文写入内容包、没有用 LLM 补空、没有改 `units.js` 或内容包，也没有顺手处理 B7 之外的视觉样式。

## Harness v1

### 实际改动

本轮只扩展 `scripts/audit.mjs`，加入：

- `doc-refs`：扫描 `AGENTS.md`、`CLAUDE.md`、`RULE.md`、`SOUL.md` 与 `docs/**/*.md`；排除 Markdown 围栏、外部 URL、锚点和明显示例路径；检查目标存在且 `git ls-files` 可查到。
- `workspace-clean`：`docs/` 下未跟踪 Markdown 输出 WARN；四份根契约未跟踪输出 FAIL。

未新建脚本，未改 v0 既有检查逻辑，未改业务代码和内容包，未执行 `git add`。

### doc-refs 数量

最终基线扫描到 **695 次引用，312 条去重后的“文档+原文”引用**。这个数量包含 Markdown 链接、行内反引号和正文中明确的 `docs/`、`src/`、`scripts/`、`tools/`、`staging/` 路径；围栏代码块没有计入。数量本身已由 audit 输出 `INFO doc-refs scanned ...`，用于后续判断判据是否过严或过宽。两次人为验收发生在本节追加前，当时输出为 681 次、307 条去重引用。

### 当前基线事实

当前工作区的审计结果不是 FAIL 0：最终 `doc-refs` 实际报告 23 个既有问题，主要是文档引用的未跟踪 `staging/`、`tools/`、`reports/` 工件，以及当前不存在的旧路径；这符合本工单“存在但未跟踪也 FAIL”的规则。本轮没有替这些文件执行 `git add`，也没有自动修复。四份根契约当前均已被 Git 跟踪，`workspace-clean` 没有额外的 docs WARN。

### 人为验收 A：不存在路径

临时把 `AGENTS.md` 的一个现有引用改为不存在路径，手动单独运行 `npm run audit`：

```text
exit=1
FAIL doc-refs AGENTS.md:13: missing docs/handoff/__audit_missing__.md
FAIL: 24
Result: FAIL
```

随后已恢复原引用，错误修改没有提交。

### 人为验收 B：未跟踪 docs Markdown

临时创建一个未跟踪 Markdown 文件，手动单独运行 `npm run audit`：

```text
exit=1
INFO doc-refs scanned 681 references (307 unique)
WARN workspace-clean untracked docs: docs/_tmp.md
FAIL: 23
WARN: 8
Result: FAIL
```

随后已删除该临时文件。这个删除只针对验收临时文件，不是 audit 脚本行为。

### 最终门禁与未做

- `npm test`：596 passed，0 failed。
- `npm run typecheck`：exit 0。
- `npm run audit`：保留 v0 的 7 条既有 WARN；新增 `doc-refs` 如上报告当前工作区的 23 个 FAIL，`workspace-clean` 当前无额外 docs WARN。
- 两次人为验证后，AGENTS、内容包和其余工作区文件均恢复；审计运行没有写入文件。

本轮没有检查图片/链接可访问性、Markdown 标题结构、孤儿文档、文档内容新鲜度、代码注释引用、JSON 内部路径，也没有自动清理或暂存任何文件；这些留给 Harness v2。

### npm run audit 完整基线输出

```text
> yanapp@1.0.0 audit
> node scripts/audit.mjs

audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
WARN user-claims App.js:2847: review editorial claim "旅行高频"
WARN user-claims App.js:2891: review editorial claim "旅行高频"
WARN user-claims App.js:2985: review editorial claim "高频"
WARN user-claims App.js:3028: review editorial claim "高频"
WARN user-claims App.js:3075: review editorial claim "高频"
WARN user-claims App.js:3093: review editorial claim "旅行最高频框架"
WARN user-claims src/features/kana/KanaScreen.js:1954: review editorial claim "旅行高频"
PASS content-pack-sync sha256 a00a76e1289a9c84e0f7089b2edc1949811bf52fb08f7c297ba55ada8ffecd82
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
INFO doc-refs scanned 695 references (312 unique)
FAIL doc-refs docs/handoff/TICKET-plan-v2-batch3.md:78: untracked scripts/push-content.sh
FAIL doc-refs docs/handoff/TICKET-plan-v2-batch3.md:77: untracked tools/check-content-release.sh
FAIL doc-refs RULE.md:43: untracked reports/wordbank-audit-report.md
FAIL doc-refs RULE.md:44: untracked reports/example-roma-report.md
FAIL doc-refs docs/AUDIT-source-trust-2026-08-22.md:16: missing 调研/…/red调研重新规划_编号修正版.md
FAIL doc-refs docs/AUDIT-source-trust-2026-08-22.md:286: missing red调研重新规划_编号修正版.md
FAIL doc-refs docs/HANDOFF-learning.md:232: untracked tools/audit-wordbank-examples.py
FAIL doc-refs docs/handoff/TICKET-source-audit-contract.md:189: untracked staging/jmdict-eng-3.6.2.json
FAIL doc-refs docs/handoff/TICKET-source-audit-implementation.md:26: untracked staging/pitch-confidence.json
FAIL doc-refs docs/ROADMAP-content-trust-structure-ui.md:804: missing src/content/publication.ts
FAIL doc-refs docs/ROADMAP-content-trust-structure-ui.md:803: missing src/content/schema.ts
FAIL doc-refs docs/ROADMAP-content-trust-structure-ui.md:278: missing src/content/contentValidation.ts
FAIL doc-refs docs/handoff/CC-REPORT.md:1322: untracked staging/jmdict-join-report.md
FAIL doc-refs docs/TICKET-jmdict-followup.md:50: untracked staging/jmdict-join-sample.json
FAIL doc-refs docs/TICKET-jmdict-followup.md:60: untracked staging/vs-sample-50.md
FAIL doc-refs docs/TICKET-jmdict-followup.md:86: missing staging/duplicate-seq-plan.md
FAIL doc-refs docs/TICKET-jmdict-followup.md:86: missing staging/duplicate-seq-groups.json
FAIL doc-refs docs/content-standard-wordfield.md:125: untracked staging/tags-plan.md
FAIL doc-refs docs/handoff/TICKET-publication-migration.md:80: untracked tools/stamp-wordbank-publication.py
FAIL doc-refs docs/sources/jmdict-notice.md:3: untracked staging/jmdict-eng.json.tgz
FAIL doc-refs docs/handoff/CC-REPORT.md:1344: untracked tools/stamp-pitch-confidence.py
FAIL doc-refs docs/handoff/TICKET-source-audit-contract.md:189: untracked jmdict-join-report.md
FAIL doc-refs docs/handoff/TICKET-source-audit-contract.md:192: untracked staging/wordbank-pilot.json
PASS workspace-clean docs markdown tracked
--- audit summary ---
FAIL: 23
WARN: 7
Result: FAIL
```
