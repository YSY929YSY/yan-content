# CC 影响分析 / 实现交接

> 状态：第 2 版（已按 `CODEX-REVIEW.md` B1–B6 修订）。仍为影响分析，未编码。
>
> 当前任务：`docs/handoff/ACTIVE.md` · P0-1 用显式发布契约替换 `isDraftedWord`
>
> 修订日期：2026-08-20

> ⚠️ **不要读整份文件再追加。** 本文件只保留**最近 3 轮**；
> 更早的在 [`archive/CC-REPORT-archive.md`](archive/CC-REPORT-archive.md)。
> 追加新一节时用 `>>` 追加到文件末尾，**不需要先读前面的内容**。
> 超过 5 轮时，把最旧的那节剪到归档文件，保持本文件精简。

## 归档索引（正文在 `archive/CC-REPORT-archive.md`）

- 1. 结论摘要
- 2. 调用路径
- 3. 新 selector 影响表
- Gloss rollout assessment · 2026-08-25
- 4. 存储、迁移与旧用户风险
- 5. 与审查结论不一致或已过时的地方
- 6. 建议提交顺序（已按 B1 / B3 重排）
- 7. 仍需产品负责人决定
- 8. 对 Codex 复核的回应
- 9. 本轮实际变更
- 10. B7 · 词书「先当词典翻」的绕过路径
- 11. B8 · `isDictionaryEntry` 不能从字段形状推断
- 12. 对产品负责人 D1–D3 决定的确认
- 13. 提交计划（第 3 版，替换 §6）
- 14. 本轮实际变更（第 3 版）
- 15. 修改文件
- 16. 每个函数的实际规则
- 17. 测试
- 18. 验收命令与结果
- 19. git diff --stat
- 20. 本轮实际变更
- 21. C1 · 空 `wordField` 被误判为编辑深度
- 22. C2 · `canReviewWord` 的输入契约
- 23. C3 · 删除会漂移的手写统计
- 24. C4 · 修正实现报告
- 25. 测试与篡改验证
- 26. 本轮实际变更（Commit 1 修订）
- 27. 开工前基线(§11-1)
- 28. 实际修改文件(§11-2)
- 29. dry-run / apply / check 统计(§11-3)
- 30. 迁移后 SHA / 大小 / numstat(§11-4)
- 31. 非 publication 字段零变化的证明(§11-5)
- 32. 失败前不写 / 重复 no-op / 单边中断(§11-6)
- 33. 新增测试与篡改验证(§11-7)
- 34. 验收命令与结果(§11-8)
- 35. ⚠️ 兼容迁移不等于真实性核验(§11-9)
- 36. 停止声明(§11-10)
- 37. 三条都先复现，再改
- 38. C5 · 唯一的迁移后验证入口
- 39. C6 · 单边修复的来源必须完整校验过
- 40. C7 · 两阶段 prepare / commit
- 41. 修订验收（5 条全过）
- 42. 本轮变更
- 43. 停止声明
- 44. 范围与五项核对
- 45. 篡改与复跑
- 46. 三条路径的实际行为
- 47. App 实际依赖的顶层字段
- 48. 对工单「最小结构」的裁定
- 49. ETag 失败语义核对
- 50. 允许实现的最小 diff
- 51. 验收矩阵（供实现工单直接采用）
- 52. 对 App 层的核对（无需改动）
- 53. 停止声明
- 54. 六项重点核对
- 55. 适配层委托核对
- 56. 建议在本轮顺手消除：`fetchImpl: fetch` 未绑定
- 57. 非阻塞测试缺口
- 58. 停止声明
- 59. 建议采纳与最终状态
- 59. 复核方式
- 60. 重点 1：独立性是否只按 familyId 计算
- 61. 重点 2：自写内容与外部事实是否分层
- 62. 重点 3 与重点 4：fail closed 与 evidence/publication 解耦
- 63. 重点 5：是否意外阻塞既有工件的后续接入
- 64. 契约自带验收标准的核对
- 65. 停止声明
- 69. 四项重点
- 70. 五处残留
- 71. 结论
- 72. 停止声明
- 73. P2-2A 实现独立审（只读，2026-08-20）
- 74. 六个重点逐条
- 75. 必须先处理的问题
- 76. 结构性隐患（不阻塞，建议记入 P2-2B）
- 77. 确认无误的部分
- 78. 停止声明
- 79. P2-2A 修订复审结论（2026-08-20）
- PLAN v2 第一批
- PLAN v2 第二批（commit 7–10）
- PLAN v2 第四批（commit 17–20）
- PLAN v2 第五批（B5-1 至 B5-3）
- Harness v0（2026-08-24）
- Gloss 空白机械修复与仓库结构清理 · 2026-08-25
- Gloss coverage remeasure · 2026-08-25
- 主线续批 T1/T3 · 繁转简与对齐行收窄（2026-08-25）
- 主线 M1 · Tatoeba 词场候选（2026-08-25）
- PLAN v2 第九批（B9-1 已完成；B9-2 开工前记录）
- PLAN v2 第八批（A 修渲染 / B 补辞书形）
- PLAN v2 第六批（B6-1 至 B6-4）
- PLAN v2 第七批（B7-1 至 B7-4）
- Harness v1
- 主线词场 · 343 条可审清单（2026-08-26）
- Wordfield JP-22 · 2026-08-27
- Wordfield land 167 · 2026-08-26
- Wordfield 中文错译率重测 · 2026-08-26
- Wordfield rubric v2 · 2026-08-26

---

## Wordfield land JP-13 · 2026-08-27

### 异常自查

1. 本轮没有出现与上一轮相差 2 倍以上的数字：决策指标 **187 → 200 / 563**，Tatoeba 词场 **167 → 180**。工单写的“替换后仍为 167”与当前仓库事实矛盾：13 个 JP anchor 在当前包中没有 `wordField`，若保持 167 就无法满足工单的主指标 187→200；因此按实际包状态新增 13 条，并将测试断言从 167 修到 180。
2. 没有说不清来源的数字。13 条、29 个成员引用、1,141/1,185 gloss 行均由下方命令复算。
3. `n5_iro` 不写 `n5_kurai` 是判据决定的，不是漏测：`暗すぎる` 没有 `dictionaryFormsFrom(example_tokens)` 的唯一辞书形还原，按 fail closed 丢弃该成员；其余成员审计为 0 错误。

### 本轮决策指标

**词场落库数：187 / 563 → 200 / 563。**

复算：

```bash
node scripts/content-stats.mjs | grep '^  wordField'
```

输出：`wordField: 200/8005 (2.5%)`；`kanji_anchor.total` 仍为 563。

### 13 条落库对照

下表中的旧句来自 `staging/gpt-verdicts-301.json` 的 JP 审核基线；新句和两个 Tatoeba ID 来自
`staging/jp-22-swapped-for-review.md` 与 `staging/wordfield-candidates-tatoeba.jsonl` 的确定性回读。

复算：

```bash
node --input-type=module -e 'const fs=require("fs"); const v=JSON.parse(fs.readFileSync("staging/gpt-verdicts-301.json")); const c=JSON.parse(fs.readFileSync("assets/content.fallback.json")); const ids=new Set(["n5_ani","n5_dasu","n5_e","n5_hajimaru","n5_hana","n5_hayai_2","n5_imi","n5_inu","n5_iro","n5_kuni","n5_michi","n5_ookii","n5_shimeru"]); const by=new Map(c.wordBank.map(x=>[x.id,x])); for(const x of v.JP.filter(x=>ids.has(x.anchor))){const y=by.get(x.anchor).wordField; console.log(x.anchor,"旧:",x.jp,"新:",y.sentence.jp,"ID:",y.source.jp_sentence_id,y.source.zh_sentence_id)}'
```

| anchor | 旧句 | 新句 | 新 Tatoeba 日 / 中 ID |
|---|---|---|---:|
| n5_ani | 私は兄が八人います。 | 彼は私の兄の友達だ。 | 105863 / 2029456 |
| n5_dasu | 窓から顔を出すな。 | 母に手紙を出します。 | 2197706 / 5091340 |
| n5_e | 彼は犬の絵を書いた。 | 彼女は絵を見ました。 | 90746 / 348101 |
| n5_hajimaru | 教育は家庭に始まる。 | 儀式は彼の話から始まった。 | 182936 / 1394872 |
| n5_hana | 花の金曜日だ！ | 花を持ってきました。 | 11508992 / 11508982 |
| n5_hayai_2 | 速くここに来なさい。 | この川は流れが速い。 | 4919569 / 334882 |
| n5_imi | 生きる意味を教えてくれ。 | この語句の意味は何ですか？ | 9161912 / 10474872 |
| n5_inu | 犬を中に入れるな。 | 犬と猫どっちが好き？ | 3643242 / 4887666 |
| n5_iro | この魚は同じ色だ。 | 色が少し暗すぎるなぁ。 | 11669302 / 13605736 |
| n5_kuni | 彼は金で国を売った。 | 日本は地震の多い国だ。 | 122423 / 517576 |
| n5_michi | 練習は熟達の道。 | 私は森で道に迷った。 | 155702 / 678189 |
| n5_ookii | 大きい鍋で汁を作った。 | 皆大きいピザが好きです。 | 1243657 / 1242091 |
| n5_shimeru | 戸を閉めろ。 | メアリーはドアを静かに閉めた。 | 194802 / 834707 |

日文、中文和 source ID 均逐字采用审核后的候选；没有写 `roma` 或确认字段。`n5_futari` 的
谚语对译仍未处理，留给 ZH-38 专项检查。

### 成员、内容统计与同步

13 条共写入 **29 个成员引用**，`members` 为空仍为 **0**；成员审计命令如下：

```bash
node --input-type=module -e 'import fs from "node:fs"; import {dictionaryFormsFrom} from "./src/features/wordbank/wordFieldAlignment.js"; import {auditWordFields} from "./src/features/review/units.js"; const c=JSON.parse(fs.readFileSync("assets/content.fallback.json")); const f=dictionaryFormsFrom(JSON.parse(fs.readFileSync("assets/example_tokens.json"))); console.log(auditWordFields(c.wordBank,f));'
```

输出：`[]`。

| 项 | 2.6 | 2.7 |
|---|---:|---:|
| 词场 | 187 | 200 |
| Tatoeba 词场 | 167 | 180 |
| 决策指标主线覆盖 | 187 / 563 | 200 / 563 |
| 版本 | 2.6 | 2.7 |

复算前值：

```bash
git show HEAD^:YanApp/assets/content.fallback.json | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const c=JSON.parse(s); console.log({version:c._meta.version,wordField:c.wordBank.filter(w=>w.wordField).length,tatoeba:c.wordBank.filter(w=>w.wordField?.source?.provider==="Tatoeba").length,kanjiAnchor:c.wordBank.filter(w=>(w.yanFeatures||[]).includes("kanji_anchor")).length})})'
node scripts/content-stats.mjs
```

前值实测 `wordField=187`、`Tatoeba=167`、版本 `2.6`；当前 `content-stats` 输出
`wordField: 200/8005 (2.5%)`、版本 `2.7`，词库总量、状态分布和 563 条 anchor 未改变。

两份文件 SHA：

```bash
shasum -a 256 assets/content.fallback.json ../yan-content/content.v2.json
```

输出：两份均为 `04ee995c85ea4357a1d4f6b6ea54c4ebff1a3b09efb76730a311bf44ec304c4b`。

### Gloss 基线

Tatoeba 词场为 **1,141 / 1,185（96.29%）**，高于 95% 下限；legacy 20 条检查不变且全绿。
复算：

```bash
node --test src/features/wordbank/__tests__/wordFieldAlignment.test.mjs
```

全量测试中的 Tatoeba 断言因此从 167 条修为 180 条；若按工单原断言保留，新增 13 条会使验收
在正确内容上必然失败。

### Commit 与边界

- `656a507`：同一 commit 修改两份内容包和 gloss 条数测试；内容版本 `2.6→2.7`。
- 没有改现有 20 条手工词场，没有改 ZH/LV、App/UI、评分算法或进度键。
- 没有发布、没有推 `origin/main`、没有构建、没有 OTA。
- 想顺手做但忍住：没有落 `n5_futari` / `n5_sora`，没有处理剩余 9 条 JP，
  没有改两条细微中文对译，也没有为新词场生成 roma。

### 本轮交报告前最终门禁原始输出

```text
$ npm test
ℹ tests 611
ℹ pass 611
ℹ fail 0

$ npm run typecheck
> yanapp@1.0.0 typecheck
> tsc --noEmit

$ npm run audit
--- audit summary ---
FAIL: 0
WARN: 17
Result: PASS

$ bash tools/check-content-release.sh
Blocker 数：0
✓ 无 Blocker

$ git status --short
(无输出)
```

审计中的 17 条 WARN 是既有 user-claims 与缺失规划文档引用，不是本轮内容 Blocker。

## 2026-08-26 · TICKET-gloss-fullbank-and-mastered

### 异常自查

1. 本轮可比指标中，设备条件下的未覆盖 token 从 162 降到 44，超过两倍的变化来自根因修复：原来按词书子集查 gloss，会同时造成查不到和活用误拆；修复后改查全库。复算：`node scripts/gloss-device-coverage.mjs`。
2. 没有说不清来源的数字。覆盖率、分子/分母、十大缺口都由同一只读脚本从当前 fallback、example token asset 和 200 条词场重算；测试总数由 `npm test` 给出。
3. “按每条 anchor 的第一所属级别构造词书子集”是本轮测量口径；“十大”是按子集路径缺失 token 数降序的排序判据，不是人工估计。复算：`node scripts/gloss-device-coverage.mjs`。

### 决策指标

本轮决策指标 = 设备真实条件（按词书过滤的 `wordBank`）下的 gloss 覆盖率，因为它直接决定用户是否看到空白或错误中文。

- 修复前：**1156 / 1318（87.71%）**。
- 修复后：**1251 / 1295（96.60%）**，与完整词库基线同值。
- 注意：修复前后分母分别为 1318 与 1295，是因为词书子集不仅少词，还会改变对齐分词（例如 `聞き` 被拆成 `聞` + `き`）；因此不能只比较空洞数量，覆盖率按各自设备路径的实际 token 计算。

复算：`node scripts/gloss-device-coverage.mjs`

### 设备样本与变异验证

样本 `店員にサイズを聞きます。` 在 N4 子集下，修复后 `サイズ → 尺寸`、`聞き → 听`。旧路径的可观察错误是 `サイズ` 留空，`聞き` 被错误拆开并把 `き` 命中成「心情」。复算：

```bash
node --test src/lib/__tests__/glossFullBankWiring.test.mjs
```

变异验证写进了这条设备守卫：

- 把 `glossLookupBank` 改回当前词书的 `wordBank`，App 接线断言会红；
- 用 N4 子集直接跑同一句，`brokenSubsetResult` 与全库结果必须不相等，说明样本确实能抓住原 bug；
- 当前实现再断言设备结果与全库结果一致。

### 最大子集缺口（修复前路径）

以下由脚本按每条句子的缺失 token 数降序输出；完整原始输出可直接复算：`node scripts/gloss-device-coverage.mjs`。

```text
n5_kurai 暗い N5: 4 missing [そ、な、ろ、る]
n5_tsukuru 作る N5: 4 missing [彼、昨、スープ、た]
n5_ban_2 ～番 N5: 3 missing [度、運転、番]
n5_hajimaru 始まる N5: 3 missing [儀式、彼、た]
n5_higashi 東 N5: 3 missing [太陽、昇り、沈む]
n5_iu 言う N5: 3 missing [彼、時、た]
n5_kodomo 子供 N5: 3 missing [頃、楽、ったなあ]
n4_reshito レシート N4: 2 missing [袋、入れ]
n4_tenin 店員 N4: 2 missing [カード、見せ]
n5_ageru 上げる N5: 2 missing [彼、た]
```

### 实际改动与边界

- `d5a4db9`：App 详情链路新增命名明确的 `glossLookupBank`；词书列表的 `wordBank` 子集保持不变；搜索详情显式传全库；例句/词场的三个 gloss 查询点全部改用全库。
- `d5a4db9`：新增设备条件结构回归与只读覆盖率脚本；更新两个原本要求底部旧文案的 UI 源码守卫。
- `d5a4db9`：把底部「这个词不用再问我了」移到右上角垃圾桶图标，保留 `handleGrade('mastered')` 行为；图标带人话无障碍标签，不做滑动手势。选择垃圾桶是因为「斩」不直观，「包包」与移出复习无关，「删除」作为底部长文案太直白且占空间。
- 未改 `assets/content.fallback.json`、`yan-content/content.v2.json`，所以本轮没有内容 stats 前后对比，也没有递增内容版本；未改评分算法、进度键、服务端、数据库或 OTA。

### 验收原始输出

```text
$ npm test
ℹ tests 617
ℹ pass 617
ℹ fail 0

$ npm run typecheck
> yanapp@1.0.0 typecheck
> tsc --noEmit

$ npm run audit
--- audit summary ---
FAIL: 0
WARN: 16
Result: PASS

$ git status --short
(无输出)
```

复算命令分别为：`npm test`、`npm run typecheck`、`npm run audit`、`git status --short`。

本轮没有构建、没有发布、没有推 `origin/main`，停在等待项目负责人决定是否推热更新包。

## 2026-08-26 · TICKET-correction-entry-minimal

### 异常自查

1. 本轮可比数字没有出现两倍以上变化。本轮测试总数为 616，新增数字来自纠错纯函数与入口结构守卫；复算：`npm test`。
2. 没有说不清来源的数字。测试数来自 `npm test`，审计结果来自 `npm run audit`，其余是代码结构或人工观察门槛。
3. 「入口位于详情页底部、低权重」是结构判据，不是统计测量；实际 web 渲染被项目既有 Expo web 依赖解析错误挡住，不能把静态守卫写成截图已通过。

### 决策指标

本轮决策指标 = 一周内真实点击纠错入口的次数，因为它直接决定这个入口是否值得留在产品里。

- 修复前：0（此前没有显式入口）。
- 修复后：待负责人用热更新包观察一周，低于工单约定的点击门槛就删除；这是人工判读，判读对象是真机一周的入口点击记录，当前没有可复算的本地数据。

### 实际改动

- `App.js`：在 `WBDetailPage` 内容底部加入低权重「去纠错」；弹层固定「中文意思不对 / 日语不自然 / 例句和这个词对不上」三项、可选说明、取消/提交；成功提示「记下了」，读写失败提示「没记上」。
- `src/lib/correctionsModel.js`：抽出 JSONL 追加纯函数，读失败或写失败均返回 `false`。
- `src/lib/corrections.js`：使用 Expo 现有的 `FileSystem` 适配，把记录追加到 `documentDirectory/yan_corrections_v1.jsonl`；不发网络请求。
- `scripts/corrections-export.mjs`：只读 JSONL，按 `kind` 和 `wordId` 输出汇总。
- `src/lib/__tests__/corrections.test.mjs`：覆盖追加保留旧行、三种类型、读写失败。
- `src/lib/__tests__/correctionEntry.test.mjs`：守住入口只在详情页、位于底部导航之前且不使用主色背景。

没有改 `assets/content.fallback.json`、`yan-content/content.v2.json`、服务端、积分或 OTA 配置。

### 验收原始输出

新增测试单独运行：

~~~
node --test src/lib/__tests__/corrections.test.mjs
✔ 追加 JSONL 时保留旧行，并且新记录只占一行
✔ 三种纠错类型都能追加成功
✔ 读失败或写失败都返回 false，不报成功
ℹ tests 3
ℹ pass 3
ℹ fail 0
~~~

完整测试：

~~~
> yanapp@1.0.0 test
> node --test --test-reporter=spec "src/**/__tests__/*.test.mjs" "src/**/__tests__/*.test.ts"

ℹ tests 616
ℹ suites 0
ℹ pass 616
ℹ fail 0
~~~

复算：`npm test`

类型检查：

~~~
> yanapp@1.0.0 typecheck
> tsc --noEmit
~~~

复算：`npm run typecheck`

审计：

~~~
> yanapp@1.0.0 audit
> node scripts/audit.mjs

--- audit summary ---
FAIL: 0
WARN: 16
Result: PASS
~~~

复算：`npm run audit`

web 渲染验证：本地 Expo web 在 bundling 阶段失败，原始错误为无法解析
`react-native-web/dist/exports/DeviceEventEmitter`，随后同样无法解析
`react-native-web/dist/exports/AppRegistry`。这是现有 web 依赖基线问题；本轮保留了结构守卫，
没有为了截图验收引入或升级依赖。

### 本轮忍住没改

- 没有顺手修 Expo web 的依赖版本或升级 `react-native-web`。
- 没有把纠错记录接入服务端、登录补传、积分或内容自动修正。
- 没有拆 `App.js`，也没有给例句、词场、首页增加入口。

代码、测试与交接文档 commit：`6bff0e8`；内容包未改。

## 2026-08-27 · TICKET-wordfield-lv-67

### 异常自查

1. 本轮没有与上一轮相差 2 倍以上且可直接比较的测量数字：上一轮测试为 616，本轮为 617；复算：`npm test`。本轮的 65 条是新工单首次建立的判定基线，不与上一轮的 0 条已完成结果比较。
2. 没有说不清来源的数字。67、2、65、61、4、21、0 均由 `staging/gpt-verdicts-301.json`、内容包的 `wordField` 字段和本轮脚本复算；复算：`node scripts/wordfield-lv-review.mjs --stats`。
3. `LAND 61 / SWAP 4` 是按三条项目判据人工重判的结果，不是语料统计；4 条替换是否可用由候选池排序和机械信号过滤测得。最终 65 条是 61 条保留加 4 条换句的确定性汇总；复算：`node scripts/wordfield-lv-review.mjs --stats`。

### 决策指标

本轮决策指标 = **重判后该落的条数**。

- 修复前：**61 条**原句直接符合项目标准。
- 修复后：**65 条**进入待人工审清单（61 条原句 + 4 条确定性换句）；复算：`node scripts/wordfield-lv-review.mjs --stats`。
- 67 条外部 LV 中，2 条已有词场排除（`n5_kaisha`、`n5_tegami`）；复算：同上。

### 与外部 LV 的交叉表

| 外部审核判定 | 本轮结果 | 条数 |
|---|---|---:|
| LV | 原句 LAND | 61 |
| LV | 原句 SWAP，换句后进入待审清单 | 4 |
| LV | 已有词场，排除不重复落库 | 2 |
| 合计 |  | 67 |

复算：`node scripts/wordfield-lv-review.mjs --stats`。因此严格按“原句重判”的 `LV → LAND` 是 **61 条**；按最终可落审清单口径是 **65 条**。

### 实际改动与边界

- `85903bc`：新增 `scripts/wordfield-lv-review.mjs`，读取既有 LV 判定、Tatoeba 候选池、shortlist 和当前内容，仅输出确定性重判结果；不写两个内容包。
- `85903bc`：新增并强制纳入版本库的 [`staging/lv-67-for-review.md`](../../staging/lv-67-for-review.md)，包含 61 条原句 LAND 与 4 条换句后的待审条目。
- `85903bc`：更新 [`docs/handoff/ACTIVE.md`](ACTIVE.md)，将下一步交给项目负责人审清单。
- 4 条 SWAP：`n5_kaesu`（超过 16 字）、`n5_kasu`（固定表达）、`n5_kata`（语法结构）、`n5_takai`（引申搭配）。4 条均找到可用备选；无可用备选的 SWAP 为 0；复算：`node scripts/wordfield-lv-review.mjs --stats`。
- 外部 LV 全体中无备选共 21 条，其中属于 SWAP 的为 0 条；复算：同上。
- 未改 `assets/content.fallback.json`、`yan-content/content.v2.json`，没有内容 stats 前后对比，也没有递增内容版本；未改 UI、评分、进度键、服务端、数据库、OTA 或 `App.js`。

### 可复现性

连续两次执行 `node scripts/wordfield-lv-review.mjs --stats` 并比较输出文件，结果为 `determinism: byte-identical`；复算：

```bash
cp staging/lv-67-for-review.md /tmp/lv-67-for-review.first.md
node scripts/wordfield-lv-review.mjs --stats
cmp -s staging/lv-67-for-review.md /tmp/lv-67-for-review.first.md
```

### 验收原始输出

```text
$ npm test
ℹ tests 617
ℹ pass 617
ℹ fail 0

$ npm run typecheck
> yanapp@1.0.0 typecheck
> tsc --noEmit

$ npm run audit
--- audit summary ---
FAIL: 0
WARN: 25
Result: PASS

$ git status --short
(无输出)
```

复算命令分别为：`npm test`、`npm run typecheck`、`npm run audit`、`git status --short`。

### 本轮忍住没改

- 没有因为词汇超出 N5 而额外换句；这不是本工单的新判据。
- 没有落库、改内容包或递增 `_meta.version`；负责人审完后另开内容窗口。
- 没有把 `SWAP` 候选自动升级为发布内容，也没有生成或改写任何日文、中文。

## TICKET-wordfield-land-lv49 · 49 条落库验收（2026-08-30）

### 范围与决策

本轮按负责人最新指令执行 49 条：从 65 条外部复核记录中落库 49 条 OK，15 条 ZH 与 1 条 JP 留待后续；`n5_kata` 的指定换句不在本轮落库。仓库内工单后来写成 50 条，但本报告以最新执行口径为准。

决策指标：词场落库数 **200 / 563 → 249 / 563**。

复算：

```bash
git show 7193d19:YanApp/assets/content.fallback.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=JSON.parse(s),f=c.wordBank.flatMap(w=>{const x=w.wordField;return Array.isArray(x)?x:(x?[x]:[])}).filter(x=>x?.sentence?.jp);console.log(f.length+"/563")})'
node scripts/content-stats.mjs
```

### 异常自查

1. 本轮没有任何数字相对上一轮变化超过 2 倍：词场 200→249、Tatoeba 180→229、成员 487→588，均未达到 2 倍；对应复算命令见下文。
2. 没有无法解释来源的数字。49 = 65 − 16；16 个排除项是工单明确列出的 15 条 ZH 与 1 条 JP。成员少于候选原始数的部分，是按运行时同一套 `dictionaryFormsFrom` 规则过滤无法在句中还原的 ID。
3. **49 条是审核判据决定的数量，不是质量测量结果**；质量门槛另由词场审计、gloss 覆盖率和内容发布门禁测量。

### 内容包前后值

| 指标 | 落库前 | 落库后 |
|---|---:|---:|
| 内容版本 | 2.7 | 2.8 |
| 词场 | 200 / 563 | 249 / 563 |
| Tatoeba 词场 | 180 | 229 |
| 成员总数 | 487 | 588 |
| 空成员词场 | 0 | 0 |

前值复算：

```bash
git show 7193d19:YanApp/assets/content.fallback.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=JSON.parse(s),f=c.wordBank.flatMap(w=>{const x=w.wordField;return Array.isArray(x)?x:(x?[x]:[])}).filter(x=>x?.sentence?.jp);console.log({version:c._meta.version,fields:f.length,tatoeba:f.filter(x=>x.source?.provider==="Tatoeba").length,members:f.reduce((n,x)=>n+(x.members?.length||0),0),empty:f.filter(x=>!(x.members?.length)).length})})'
```

后值复算：

```bash
node scripts/content-stats.mjs
node -e 'const c=require("./assets/content.fallback.json"),f=c.wordBank.flatMap(w=>{const x=w.wordField;return Array.isArray(x)?x:(x?[x]:[])}).filter(x=>x?.sentence?.jp);console.log({version:c._meta.version,fields:f.length,tatoeba:f.filter(x=>x.source?.provider==="Tatoeba").length,members:f.reduce((n,x)=>n+(x.members?.length||0),0),empty:f.filter(x=>!(x.members?.length)).length})'
```

两份内容包 SHA-256 完全一致，且版本只从 2.7 递增到 2.8：

```text
f1e7191767cbc2b80ed0ca47832ab7327a24a0ccc241f2f5ca57cad1c866ddcf  assets/content.fallback.json
f1e7191767cbc2b80ed0ca47832ab7327a24a0ccc241f2f5ca57cad1c866ddcf  ../yan-content/content.v2.json
```

复算：`shasum -a 256 assets/content.fallback.json ../yan-content/content.v2.json`

### 49 条对照表

以下为实际落库的 anchor、日语、中文及 Tatoeba 日/中句 ID。整表复算：`node scripts/wordfield-land-lv49.mjs`（该脚本在已有字段上会按保护规则拒绝覆盖；落库前执行输出为 `review rows: 65`、`rejected: 16`、`selected: 49`）。

| # | anchor | 日语 | 中文 | Tatoeba JP / ZH ID |
|---:|---|---|---|---|
| 1 | n5_akai | 赤い屋根の家を見てごらん。 | 看看那间红色屋顶的房子。 | 1151723 / 348624 |
| 2 | n5_ame | 雨は一週間降り続いた。 | 雨下了一周。 | 189550 / 333989 |
| 3 | n5_ban | 彼女は一晩中泣き通した。 | 她一整晚都在哭。 | 91111 / 333193 |
| 4 | n5_butaniku | 豚肉は私には合わない。 | 猪肉不适合我。 | 123261 / 8789278 |
| 5 | n5_chikaku | 近くで犬が吠えている。 | 附近有狗在叫。 | 2860740 / 2843700 |
| 6 | n5_chizu | 地図は壁に貼ってある。 | 地图挂在墙上。 | 991942 / 8869384 |
| 7 | n5_dare | 母は誰よりも先に起きる。 | 妈妈起得比谁都早。 | 82892 / 8723671 |
| 8 | n5_denki | 電気を消しなさい。 | 关灯。 | 124840 / 771563 |
| 9 | n5_doubutsu | 動物に関する本を買った。 | 我买了一本关于动物的书。 | 1115260 / 9545088 |
| 10 | n5_fuutou | 私はすでに封筒をもっている。 | 我已经有信封了。 | 160504 / 403758 |
| 11 | n5_hareru | 日曜日は晴れてほしいですね。 | 希望星期天是晴天呢。 | 11604217 / 13607689 |
| 12 | n5_hashi | 池には橋がかかっている。 | 池塘上有座桥。 | 126791 / 8800731 |
| 13 | n5_hiki | 魚を二匹捕まえた。 | 我捉了两条鱼。 | 13511266 / 10324290 |
| 14 | n5_ike | その池で泳ぐのは危険です。 | 在池塘游泳是危险的。 | 207859 / 1928620 |
| 15 | n5_ireru | 私はバケツに水を入れた。 | 我将水倒入了桶中。 | 159141 / 2032270 |
| 16 | n5_iya | 嫌なら結構です。 | 如果你不想的话也没问题。 | 175403 / 8777619 |
| 17 | n5_juu | 彼女は十代で結婚した。 | 她十几岁时就结婚了。 | 88779 / 802500 |
| 18 | n5_kabin | 花瓶は両手で持ちなさい。 | 用双手握着花瓶。 | 186559 / 9433043 |
| 19 | n5_kaesu | 財布を返せ。 | 把钱包还我。 | 4216180 / 8703977 |
| 20 | n5_kagetsu | 妊娠何か月ですか。 | 你怀孕几个月了？ | 122036 / 2007114 |
| 21 | n5_kami | 紙は木から作られる。 | 纸是由木制成的。 | 151205 / 406363 |
| 22 | n5_kanji | 漢字は読むのが難しい。 | 汉字很难读。 | 183899 / 339311 |
| 23 | n5_kasu | ナイフを貸して下さい。 | 请借我你的刀。 | 199334 / 840780 |
| 24 | n5_kawa | 道は川に平行している。 | 这条路与河流平行。 | 123578 / 6477585 |
| 25 | n5_kekkou | どんな雑誌でも結構です。 | 任何一本杂志都行。 | 199449 / 924632 |
| 26 | n5_kesu | 彼は電灯を消し忘れた。 | 他忘了关灯。 | 101885 / 884175 |
| 27 | n5_kitte | あなたの切手帳を見せてください。 | 请让我看看你的集邮册。 | 233124 / 786403 |
| 28 | n5_kotoba | 音楽は人類共通の言葉である。 | 音乐是人类共同的语言。 | 188270 / 10272583 |
| 29 | n5_kusuri | 薬、飲み忘れるなよ。 | 别忘了吃药。 | 10473146 / 12510973 |
| 30 | n5_matsu | 座って待つしかなかった。 | 只好坐下来等待。 | 170846 / 361697 |
| 31 | n5_mono | 通路に物を置くな。 | 别在通道上放东西。 | 125570 / 1423369 |
| 32 | n5_naka | この中は風通しが悪いですね。 | 这里的通风很差呢。 | 220561 / 13187219 |
| 33 | n5_narau | 先週中国語を習い始めました。 | 我上周开始学中文了。 | 5224 / 502851 |
| 34 | n5_ni | サムはトムより二歳年下です。 | Sam比Tom小两岁。 | 216723 / 333708 |
| 35 | n5_nichi | 三日以内にお返事いたします。 | 我会在三天之内回复。 | 3468510 / 595622 |
| 36 | n5_noboru | 私は富士山の頂上に登った。 | 我登上了富士山顶。 | 153052 / 411703 |
| 37 | n5_otokonoko | ほとんどの男の子は野球が好きだ。 | 大多数的男孩子喜欢棒球。 | 196136 / 13651526 |
| 38 | n5_raigetsu | 私達は来月旅行にいくつもりです。 | 我们打算下个月去旅游。 | 151243 / 8761472 |
| 39 | n5_rainen | 私は来年篠山に住むつもりです。 | 我明年会住在筱山。 | 152384 / 889127 |
| 40 | n5_ryoushin | 私は両親と連絡を取った。 | 我跟父母联络了一下。 | 152327 / 330586 |
| 41 | n5_sanpo | 休憩時間に少し散歩をした。 | 休息时间去散了一会儿步。 | 13059106 / 13875798 |
| 42 | n5_shukudai | 私は宿題に飽きた。 | 我厌倦了功课。 | 155993 / 926788 |
| 43 | n5_sukoshi | 少し安くなりませんか。 | 能便宜点儿吗？ | 146823 / 11484520 |
| 44 | n5_suwaru | 私のそばに座りなさい。 | 坐我旁边。 | 164167 / 1424389 |
| 45 | n5_toki | 若い時は、一度しかない。 | 青春只有一次。 | 148817 / 604475 |
| 46 | n5_tori | 鳥は小枝で巣を作る。 | 鸟用细树枝筑巢。 | 125788 / 786116 |
| 47 | n5_tsuku | 何処に着くかも分からない。 | 我不知道我们会到达哪里。 | 187397 / 792386 |
| 48 | n5_warui | それは私が悪いのだ。 | 这是我的错。 | 205175 / 790573 |
| 49 | n5_wasureru | 私は会議の日付を忘れた。 | 我忘了会议的日期。 | 157961 / 876708 |

`n5_kata` 未落库；工单指定的 `あの方は八十歳です。 / 那位老人八十岁。` 留待下一轮。未改写任何日文或中文，未覆盖已有手工词场。

### Gloss 与成员质量基线

- Tatoeba 词场 gloss：**1141 / 1185（96.29%）→ 1467 / 1533（95.69%）**，仍高于 95% 下限。复算当前值：`node --input-type=module -e "import fs from 'node:fs'; import {buildWordFieldAlignment,dictionaryFormsFrom} from './src/features/wordbank/wordFieldAlignment.js'; const c=JSON.parse(fs.readFileSync('assets/content.fallback.json')),d=dictionaryFormsFrom(JSON.parse(fs.readFileSync('assets/example_tokens.json'))),p=/^[\\s、。？！？，．.!?,:：;；「」『』（）()［］【】〔〕〈〉《》…・~〜]+$/u; let t=0,g=0; for(const w of c.wordBank.filter(w=>w.wordField?.source?.provider==='Tatoeba')) for(const x of buildWordFieldAlignment(w.wordField.sentence.jp,c.wordBank,d)){if(p.test(x.jp))continue;t++;if(x.zh)g++} console.log(g,t,(g/t*100).toFixed(2)+'%')"`。
- 设备条件 gloss：**86.17% → 95.98%**，当前全库基线与设备条件相同。复算：`node scripts/gloss-device-coverage.mjs`。
- `auditWordFields` 结果为 **0** 个问题；新增成员均走 `dictionaryFormsFrom` 还原路径，13 个无法还原的候选成员未写入。复算：`bash ../tools/check-content-release.sh`（wordBank 审计）。

### 验收原始输出

```text
$ npm test
ℹ tests 617
ℹ pass 617
ℹ fail 0

$ npm run typecheck
> yanapp@1.0.0 typecheck
> tsc --noEmit

$ npm run audit
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
PASS content-pack-sync sha256 f1e7191767cbc2b80ed0ca47832ab7327a24a0ccc241f2f5ca57cad1c866ddcf
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005

$ bash ../tools/check-content-release.sh
Blocker 数：0
✓ 无 Blocker

$ git status --short
(无输出)
```

复算命令分别为：`npm test`、`npm run typecheck`、`npm run audit`、`bash ../tools/check-content-release.sh`、`git status --short`。

### Commit 与边界

- `54c118e`：落库本轮 49 条复核通过的 Tatoeba 词场；同步 `assets/content.fallback.json` 与 `../yan-content/content.v2.json`，内容版本从 2.7 递增到 2.8；新增确定性落库脚本；更新必要的 gloss 对齐测试、全库 gloss 接线和 `ACTIVE.md`。
- 本轮没有发布、推送 `origin/main`、构建或发 OTA。
- 本轮想改但忍住没改：没有落 `n5_kata` 的换句；没有把 15 条 ZH 混入；没有生成 `roma`、改写例句、改变词库进度键或评分算法；没有修改换句规则的义项判据。
