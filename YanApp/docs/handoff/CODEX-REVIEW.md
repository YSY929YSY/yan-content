# Codex 独立复核 · P0-1 内容发布规则

> 复核对象：`docs/handoff/CC-REPORT.md`（2026-08-20）
>
> 复核状态：第 2 版已接受 B1–B6；**仍有 B7–B8 两个准入闭环遗漏，暂不授权实现**
>
> 本轮权限：只读业务代码与内容数据；未授权实现
>
> 复核日期：2026-08-20

## 1. 可以接受的结论

以下结论已用当前代码与 `assets/content.fallback.json` 独立复现：

1. 仓库确实存在两套“新词可学习”口径：
   - 词书路径：例句三字段齐全，即当前 `!isDraftedWord(word)`；
   - 主线路径：`yanFeatures` 包含 `kanji_anchor`，即 `anchorPool(wordBank)`。
2. 词书口径当前放行 4400 条，其中 `zh_drafted` 3037、`draft` 716、`candidate` 645、`verified` 2。
3. 主线池当前 563 条，全部属于 N5，全部例句三字段齐全；状态为 `draft` 561、`verified` 2。
4. 全库搜索详情可以把任意搜索结果送入 `grade()`，从而新增 SRS 记录。
5. `buildUnits()` 不会把整个 `wordBank` 展平成混合复习的新词候选；已有 SRS 记录仍会从 `progress` 进入复习。
6. 收紧规则不能删除既有 SRS 记录，也不能改变 `wordKey`。受影响的持久化 session 是 `K.wordbankSession`；`K.reviewSession` 与不落盘的主线 `learnBatch` 是另外两条路径。

CC 找到“主线不走 `isDraftedWord`”是本轮最有价值的发现。原 `ACTIVE.md` 只围绕词书口径展开，确实不完整。

## 2. 阻塞实现的修订项

### B1. `App.js:2088` 不是“仅展示”，提交计划前后矛盾

CC 报告 §2 正确地把 `App.js:2088` 归为列表准入，并建议改成 `isLearnableWord`；但 §6 Commit 2 又把它与统计一起改成 `hasCompleteExample`，称为“语义等价、不改准入”，Commit 3 也没有再处理它。

`2088` 决定默认词书列表里哪些词可见，是实际行为边界，不是纯统计。如果照当前提交计划执行，P0-1 会保留原有的“补齐例句即进入正式词书”规则，任务只完成一半。

修订要求：

- `1775`、`2099` 是计数，但计数语义必须先命名清楚；
- `2042` 是新词进入词书 session 的准入；
- `2088` 是默认词书列表的准入/可见性；
- `2214` 是“起草”标签的展示语义，删除 `isDraftedWord` 时不能遗漏；
- 不要再把 `2088` 放进“只改展示、无行为变化”的提交。

### B2. `isDraftedWord` 是 5 个调用点，不是 6 个

当前 `rg -n "isDraftedWord" App.js` 有 6 个命中，但其中一个是 `1972` 的定义。实际调用点为：

- `1775`：货架计数；
- `2042`：词书今日 session 候选；
- `2088`：词书默认列表过滤；
- `2099`：单本词书计数/空态；
- `2214`：起草标签。

报告漏写了 `2214` 的迁移方案。不能直接删除函数后再靠编译错误临时决定这个标签代表什么。

### B3. 必须把“允许引入新词”和“允许复习旧词”拆开

`isLearnableWord(word)` 应回答“这个词现在能否作为**新内容**进入学习”，不能反向剥夺用户已经建立的 SRS 记录。

建议把产品规则写成两个判断，而不是在 `grade()` 内粗暴全局拦截：

```ts
canIntroduceWord(word) = isLearnableWord(word)
canReviewWord(word, record) = Boolean(record)
```

由此得到：

- 搜索到 dictionary-only 且没有既有记录：不能显示评分入口；
- 搜索到 dictionary-only 但已有 SRS 记录：仍应允许复习/评分；
- 词书 `today` / `due` 视图：继续显示已经进入 session 或已经到期的旧记录；
- 默认词书列表和新 session 候选：使用 `canIntroduceWord`；
- 主线的新词池：`anchorPool` 与 `canIntroduceWord` 求交；
- `grade()` 本身仍是通用进度写入函数。它也服务深内容，且参数只有 key/bookId，不适合在里面猜 publication。

“dictionary-only 一律隐藏评分按钮”仍会误伤旧记录，CC 报告需要补上这个例外及测试。

### B4. 计数与等级事实有误

当前 fallback 的例句齐全 membership 计数是：

| 等级 | 总条目 | 例句三字段齐全 |
|---|---:|---:|
| N5 | 724 | 724 |
| N4 | 632 | 632 |
| N3 | 1712 | 1373 |
| N2 | 1790 | 819 |
| N1 | 3383 | 993 |

因此 CC 报告 §2 写的 `1318 / 734 / 993` 不是当前数据；§7 写的“主线池跨等级”也不成立，当前 563 条主线词全部属于 N5。

这些数字不得继续手写进业务注释或长期决策。实现前先增加只读统计脚本，由脚本输出基线和验收结果。

### B5. 563 条主线白名单只能叫“兼容迁移”，不能叫“真实性核验”

把现有 563 个 `kanji_anchor` 显式迁移为可学习，可以最小化主线行为变化；但“当前正在使用 + 例句完整”不证明释义、例句对齐或来源已经核验。

如果产品负责人选择这条迁移，应记录成类似：

```json
{
  "publication": {
    "dictionary": true,
    "learning": true,
    "basis": "legacy_mainline_anchor"
  }
}
```

字段名仍需 schema 工单最终确定。关键是把“产品准入”与 `verified` / evidence strength 分开；后续来源流水线可以复核并提升证据等级，但不能把兼容迁移伪装成人工或多源验证。

### B6. 声调 F3 现在不能直接关闭

当前 bundled/remote 内容包与当前 staging 不是同一代统计：

| 工件 | 三方 | 两方 | 单一 | 冲突 |
|---|---:|---:|---:|---:|
| `content.v2.json` / fallback 中实际 `pitch.agree` | 523 | 6563 | 588 | 已删除，包内不可直接还原数量 |
| 当前 `staging/pitch-confidence.json` | 523 | 6595 | 661 | 20 |

这不表示交叉验证无效，而是说明工件版本与运行记录尚未绑定。现在已经能确认：

- UniDic 是由 NINJAL 建设和发布的独立机构来源；
- 代码确实执行了 kanjium / 中文 Wiktionary / UniDic 的集合交叉比较；
- 冲突项在 stamp 步骤设计为删除，不显示；
- 内容包已有 `pitch.agree`，用户可看到印证等级。

但仍缺：输入 URL、下载时间、版本/commit、SHA-256、许可快照、每次 run id，以及中文 Wiktionary dump/Kaikki 文件的取得记录。`pitch.agree` 也只保存数量，不保存本次运行和具体证据定位。

所以 F3 应从“机制未建立”更新为“**机制已建立，但来源族谱和产物可追溯性未完成**”，不能写成“独立性已经完全证明”。

### B7. 词书“先当词典翻”仍能绕过新词准入

CC 第 2 版把搜索详情的评分条件修正为“可引入或已有 record”，但仍写着词书详情会“随列表过滤自然收敛”。实际代码还有一条确定的绕过路径：

```text
N3/N2/N1 默认列表为空
  → 用户点“先当词典翻”
  → showDrafts = true
  → App.js:2088 的 skipDraftFilter 绕过可学习过滤
  → 用户打开 dictionary-only 且没有 record 的词
  → App.js:2147 无条件传 onGrade={gradeWord}
  → WBDetailPage:2450–2470 无条件渲染评分按钮
  → grade() 新建 SRS 记录
```

因此准入不能只守 `App.js:1798` 的搜索详情，也不能假设词书列表一定只含 learnable 词。`today` / `due`、`showDrafts`、词场成员跳转都会让详情页接触非默认列表内容。

修订要求：

- 搜索详情与词书详情使用同一个 `canGradeWord = canIntroduceWord(word) || canReviewWord(word, record)` 口径；
- 两处调用 `WBDetailPage` 时都按该结果决定是否传入 `onGrade`；
- `WBDetailPage` 在没有 `onGrade` 时不渲染评分按钮，改为只读说明；
- 已有 record 的 dictionary-only 词仍有评分入口；
- 增加“从先当词典翻进入、无 record、不可学习 → 不能评分”的验收用例。

这不是新的产品决定，而是 D2 已选规则在第二个入口上的完整执行。

#### B7 范围补正：`openMember` 绕过成立，但当前不是真正全库查询

CC 第 3 版依据 `App.js:1999` 的注释，把 `lookupWord` 描述成从 8005 条全库按 id 查询。实际调用链是：

- `App.js:1523` 先按当前等级生成 `bookWords`；
- `App.js:1526` 把 `bookWords` 作为 `wordBank` 传给 `WordBankScreen`；
- `App.js:2002` 的 `lookupWord` 只在这个参数内查找。

所以 `openMember` 仍能绕过 `2088`，把**当前 bookWords 内**的 dictionary-only 词推进详情；但“任意等级、全库”是注释与实际传参不一致，不是当前代码事实。B7 的详情层守门结论不变。P0 测试不应假设跨级全库跳转，也不要在本工单顺手把 lookup 扩成全库；那是另一个行为变更。

### B8. `isDictionaryEntry` 仍在从字段形状推断发布

CC 第 2 版 §3 将 `isDictionaryEntry` 定义为“有 `word + reading`”。这只能叫结构校验，不能叫显式 Dictionary publication；它会重演本轮正在修的问题：今天是“例句齐全 → 自动可学”，换完变成“表记读音齐全 → 自动可查”。

正确边界应为：

```ts
hasDictionaryShape(word) = Boolean(word?.word && word?.reading && (word?.meaning_zh || word?.meaning_en))
isDictionaryEntry(word) = hasDictionaryShape(word) && word?.publication?.dictionary === true
```

当前 8005 条都满足上述最小结构，但只有 6683 条带 `jmdictSeq`；563 条主线词中只有 19 条带 `jmdictSeq`。因此“只给 JMdict join 成功者 `dictionary: true`”会隐藏 1322 条当前可查内容，并让 544 条主线候选在 Dictionary 层失败。

Codex 对 D1 的补正建议是把迁移明确分成两层：

1. 为当前 8005 条结构完整、现已可查的词显式写入 `dictionary: true`，依据记为 `legacy_dictionary_compat`；这是保留现有查询能力，不是来源核验。
2. 仅为 563 条 N5 `kanji_anchor` 写入 `learning: true`，依据记为 `legacy_mainline_anchor`；其余 7442 条 `learning: false`。
3. Dictionary 与 Learning 的迁移依据分别记录，不能共用一个含混的 `basis` 字符串。
4. 后续来源流水线单独生成 evidence；发现明确错误、授权问题或结构失败时，才把对应 Dictionary publication 关闭并进入异常清单。

第一期可采用布尔开关，但建议最少保留分层依据：

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

这同样不把任何词标成 `verified`，只把当前产品行为显式化，停止继续依靠字段是否为空来猜。

## 3. 修订后的建议提交顺序

以下仍只是建议；D1 未决定前不授权实现。

### Commit 1 · 纯 selector、类型与测试，不接调用点

- 新增 publication 类型与纯 selector；
- 缺 `publication.learning === true` 时 fail closed；
- 明确 `hasCompleteExample` 只检查内容形状；
- 测试 selector，不写“主线交集非空”这种在 publication 尚未迁移时必然失败的断言。

### Commit 2 · 显式兼容迁移与生成校验

- 按产品负责人选择的 D1 策略同时生成 Dictionary 与 Learning publication；
- fallback 与 remote 内容包保持一致；
- 生成统计报告，不手填条数；
- Dictionary/Learning 使用分开的迁移依据；迁移依据不是真实性等级。

### Commit 3 · 一次接完所有新内容准入边界

- 主线：`anchorPool` 与 `canIntroduceWord` 求交；
- 词书新 session：`2042`；
- 默认词书列表：`2088`；
- 搜索详情与词书详情：无旧 record 且不可引入时都不提供评分；
- `showDrafts` / 词典浏览可以看词，但不能绕过准入新建 SRS；
- 既有 `today` / `due` / SRS 记录仍可复习；
- 计数、空态和 `2214` 标签使用各自明确的展示语义；
- 同一提交内补行为测试，避免入口间短暂出现两套 publication 口径。

如果 Commit 3 过大，可以按“主线”和“词书/搜索”拆成两个行为提交，但每个提交都必须保持 App 仍有可用学习内容，且不能留下搜索可绕过的窗口。

## 4. 需要产品负责人确认的最小问题

### D1 · 第一批 Dictionary / Learning publication

Codex 推荐：当前 8005 条结构完整词全部显式迁移为 Dictionary，依据为 `legacy_dictionary_compat`；其中仅 563 个 N5 `kanji_anchor` 迁移为 Learning，依据为 `legacy_mainline_anchor`，其余保持 dictionary-only。

这既不是对 8005 条 Dictionary 内容的真实性背书，也不是对 563 条 Learning 内容的核验背书，只是把当前查询/主线行为变成显式、可测试、以后可逐条关闭的 publication。来源流水线随后优先审计 563 条，逐批生成真正的 evidence 状态。

### D2 · 搜索中的新 dictionary-only 词

Codex 推荐：P0 第一版只隐藏/禁用“新建 SRS”的评分入口；已有 SRS record 仍可评分。“加入我的词”另开产品工单，不要在修安全边界时新增一套收藏语义。

### D3 · 页面怎么称呼这些数字

已采用以下口径，不再显示含混的 `final` / “定稿”：

- 货架与书内头部：`共 1790 词可查 · 0 词可学习`，前者用 Dictionary，后者用 Learning；
- 默认列表只显示可学习词；另设既有的“浏览词典”出口查看 dictionary-only；
- `2214` 不再叫“起草”；行内合成一个状态：`仅词典` 或 `仅词典 · 暂无例句`，不并排放两个标签；
- 详情页可用 `hasCompleteExample` 单独说明“暂无例句”；
- 无可学习词时，空态改为“这本目前开放词典查询，学习内容正在分批核验”，按钮叫“浏览词典”；
- dictionary-only 详情无旧 record 时显示“仅供查询，暂未开放学习”，不显示评分按钮。
- `showDrafts` 在行为接入提交中机械重命名为 `browseDictionary`，不保留旧别名。

## 5. 本轮实际变更

- 业务代码：无；
- 内容数据：无；
- 外部内容仓库：无；
- 文档：新增本独立复核，并更新交接状态/已确认事实；
- 测试：未运行产品测试，因为没有代码变更；只运行了只读统计与调用点搜索。

## 6. Commit 1 独立复核（2026-08-20）

结论：**核心 publication 真值表正确，但本版不通过；Commit 2 继续冻结。**

Codex 独立复跑：

```text
npm test          528 / 528
npm run typecheck exit 0
```

也确认 `App.js`、内容包和既有已跟踪业务文件没有改动；两个 selector/test 文件仍是 untracked 新文件。全绿只能证明现有断言通过，不能覆盖断言本身写错的边界。

### C1 · [P1] 空 `wordField` 被误判为编辑深度

`publication.ts:148` 只检查 truthy object，因此下列实测全部返回 true：

```text
wordField: {}          true
wordField: []          true
wordField: new Date()  true
```

测试 `publication.test.mjs:141` 又把 `{ members: [] }` 固化成 true，因此最低矩阵第 9 条“editorial 字段为空与非空的边界”并未真正满足。仓库已有的 `wordFieldsOf()` 只承认带 `sentence.jp` 的词场；内容标准也把词场定义成用句子让成员同框。空壳不能让货架声称有编辑深度。

修法与验收见 `ACTIVE.md` 第 1 项。

### C2 · [P2] `canReviewWord` 把任意 truthy 脏值当成旧记录

`publication.ts:165` 对 `'corrupt'`、`[]` 都返回 true。当前正式调用链的 `progress` 已先经过 `normalizeProgress()`，所以这不是现有线上绕过；但导出函数把 `ProgressRecord` 声明成 `unknown`，同时工单又承诺错误字段形状返回 false，契约互相矛盾。

修订为“已归一化的非数组对象或空值”：对象（即便字段不全）继续保护；字符串、数字、数组不算记录。这里不复用 `status` 或 `dueAt` 做门槛，以免把内容发布收紧变成用户进度清理。

这是 Codex 原任务书没有把 `record` 的形状写清，不归因于 CC 实现漂移。

### C3 · [P2] 动态统计被复制进长期源码和测试注释

`publication.ts:11-12,119-120` 与测试 `:65-66` 手写了多组当前内容包计数。B4 已明确这些数字不得继续进入业务注释；它们不会随内容包自动更新，也没有断言作用，下一代内容一变就会成为假证据。

保留“结构不能升级成发布”“Learning 必须先属于 Dictionary”两条稳定理由，删除快照数字。计数只由迁移脚本或验收报告生成。

### C4 · [P2] 报告把 untracked 新源码描述成“无业务代码”

实测行数是：

```text
publication.ts              176
publication.test.mjs        175
```

报告写成 178/165；且普通 `git diff --stat` 本来就忽略 untracked 文件，空输出不能证明“没有代码变更”。准确表述应是“新增领域源文件和测试，但零调用点、运行时行为无变化”。这不影响 selector 正确性，但会影响以后判断某轮到底交付了什么。

## 7. Commit 1 第二轮复核结论（2026-08-20）

结论：**通过，无未关闭发现。** C1–C4 全部关闭；Commit 1 可以结束。这个结论只覆盖纯 selector、类型与测试，不授权 Commit 2 数据迁移。

独立证据：

```text
npm test          531 / 531
npm run typecheck exit 0
publication.ts              218 行
publication.test.mjs        215 行
```

- C1：`wordField` 的对象/数组路径均要求至少一条 `sentence.jp` trim 后非空；`{}`、`[]`、日期、空成员、空白句子均为 false；`yanFeatures` 改为元素级非空字符串判断。
- C2：record 只接受非数组对象；字符串、数字、数组为 false，空对象仍为 true。与 `normalizeProgress()` 的正式调用链一致，也不增加会清理旧进度的字段门槛。
- C3：production selector 与测试注释中的动态快照数字已删除；只保留稳定设计不变量。
- C4：修订报告给出的 218/215 行已复现，并明确新增的是领域源文件与测试、只是零调用点；不再把空的普通 `git diff --stat` 当作 untracked 文件不存在的证据。

Codex 另以直接调用覆盖 13 个对抗边界，结果全部符合约定；`App.js`、fallback 内容包和既有已跟踪源码仍无 diff，未发现遗留备份文件。

## 8. Commit 2 第一轮独立复核（2026-08-20）

结论：**数据结果正确，迁移脚本不通过；Commit 2 暂不提交。**

已独立复现通过的部分：两份内容包逐字节相同；单份 SHA `86a4235d…3631`、大小 7,754,410、numstat 40,588/0；publication 统计 8005/563/7442/0；去 publication 后投影与基线完全相同；`npm test` 540/540、typecheck 0、官方 release audit Blocker 0。

### C5 · [P1] `--check` 会接受缺词的“完整迁移”

删除同一个非 anchor 词并把两份文件保持一致后，wordBank 变成 8004；所有剩余 publication 仍合法。实测 `--check` exit 0，并打印通过。原因是 `cmd_check()` 用 `len(wb)` 自洽比较，却没和本次迁移的 `EXPECT_WORDS=8005`、输出 SHA 或基线投影比较。

### C6 · [P1] 单边恢复会把非-publication 损坏复制到好文件

把一份迁移后文件的 `_meta.note` 改掉、保留 publication 全部合法，再配一份精确基线。实测 `classify()` 把坏文件判成 migrated，`--apply` 随后用它覆盖基线文件并 exit 0。单边恢复来源必须是精确通过完整迁移后验证的字节，不能只看 publication。

### C7 · [P2] 正常 apply 没有先准备完两个临时文件

工单要求两个临时文件均写入、fsync、回读成功后才替换目标。当前 `for p in TARGETS: write_atomic(p, out)` 会先替换第一份，再开始准备第二份。它有单边恢复能力，因此不是不可恢复的数据损失，但准备阶段失败本可做到目标零变化，当前实现没有兑现。

最小修订与验收矩阵已写入 `ACTIVE.md`。本轮不要求重做正确的 JSON，也不扩大到 Commit 3。

## 9. Commit 2 第二轮复核结论（2026-08-20）

结论：**通过。** C5–C7 均已关闭，Commit 2 可以提交。

Codex 独立复现：

- 删除同一个非 anchor 词：`--check` exit 1，明确报迁移后字节预算不符；
- 一份精确基线 + 一份 `_meta` 漂移但 publication 合法：`--apply` exit 1，基线字节完全不变，坏内容未复制；
- 模拟第二份临时文件 prepare 失败：两个目标均保持原字节，临时文件为 0；
- 真文件 `--check` 通过，单份 SHA `86a4235d…3631`，两份逐字节一致，内容 diff 仍为 40,588 additions / 0 deletions；
- `npm test` 540/540，typecheck exit 0。官方 release audit 已独立运行，Blocker 0。

`verify_migrated()` 现为 `--check`、`classify(migrated)` 和单边恢复来源的唯一完整验证入口，锁定字节、SHA、词数、anchor、id、结构、publication 统计与非-publication 投影。数据本身没有因 C5–C7 修订而改变。

非阻塞记录：若第二个 `os.replace` 本身失败，尚未 replace 的临时文件可能残留；它不会复制未经验证的数据，且会留下“完整 migrated + baseline”的可恢复状态。对于本次一次性本地迁移，接受该剩余操作系统级故障窗口；未来复用双文件写入器时补 replace 阶段清理。
