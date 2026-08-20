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
