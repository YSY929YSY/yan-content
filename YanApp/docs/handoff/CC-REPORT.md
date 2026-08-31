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

## 2026-08-30 · `TICKET-gloss-single-kana.md` · 单假名消费闸门

### 异常自查

1. 本轮与上一轮相差 2 倍以上的数字只有单假名误命中：词场句 **82 → 0**，token **88 → 0**；这是把错误单假名命中改为空白后的预期结果。覆盖率 **95.69% → 92.34%**，未达到 2 倍变化，下降来自错误 gloss 被计为空白以及 token 分段变化。以上所有统计复算：`node scripts/gloss-single-kana-stats.mjs`。
2. 没有无法解释来源的数字。基线由 `e20addf^` 的旧对齐实现复算，修复值由工作树实现复算，统计脚本固定使用当前 249 条词场和同一份 `example_tokens.json`。
3. **0** 是决策底线和测试硬断言，不是“抽样测得为零”；覆盖率下限 **91.80%** 是在实测 **92.34%** 上保留 **0.54 个百分点**余量的测试判据。复算：`node scripts/gloss-single-kana-stats.mjs`；闸门：`node --test src/features/wordbank/__tests__/wordFieldAlignment.test.mjs`。

### 结果与决策指标

- 决策指标：含单假名误命中的词场句数 **82 / 249 → 0 / 249**；单假名 wordBank token **88 → 0**。目标 **0** 已达到。复算：`node scripts/gloss-single-kana-stats.mjs`。
- Tatoeba gloss 覆盖：**1467 / 1533（95.69%）→ 1375 / 1489（92.34%）**。新的质量底线是 **91.80%**，余量 **0.54 个百分点**。复算：`node scripts/gloss-single-kana-stats.mjs`。
- F-3（跨 word / reading 取最长、同长度 word 优先）在真实 249 条词场中影响 **0 句 / 0 token**；合成回归覆盖了真实数据未触发的冲突形状。复算：`node scripts/gloss-single-kana-stats.mjs`。
- F-4（更长词库命中让位于 GRAMMAR）独立影响 **10 句 / 62 个对齐位置**。统计中的 token 定义是：固定句子顺序后，修复实现与只关闭 F-4 的变体在同一行位置的 `jp / zh / source` 不同，新增或消失的行也计一处。复算：`node scripts/gloss-single-kana-stats.mjs`。

### 实现范围

- `wordFieldAlignment.js`：单假名在 direct 和 dictionary 的消费点 fail closed；单汉字仍保留；跨 priority 取最长；同表面重复候选按 word 优先；GRAMMAR 只在没有更长有效词库边界时消费。
- `App.js`：`WordBookShelfScreen` 的搜索详情显式传入全库 `glossLookupBank`，与词书详情入口一致。
- `glossFullBankWiring.test.mjs`：删除恒真的 `deviceResult === expected`，改为验证货架入口和详情入口的真实全库接线。
- 新增 `scripts/gloss-single-kana-stats.mjs`：只读复算脚本，不写内容包。
- 未改 `assets/content.fallback.json`、`yan-content/content.v2.json`，未落库、未发布、未推 OTA。

### 变异验证

- F-3：把 `directCandidateAt` 改回 priority-first；独立守卫在 `たべもの` 样例中得到 `たべ / も / の / 。`，测试转红。复算：运行该变体的内存测试，或执行 `node --test src/features/wordbank/__tests__/wordFieldAlignment.test.mjs` 查看 F-3 守卫。
- F-4：把语法判断改回无条件 grammar-first；独立守卫在 `とてもだれか` 样例中得到 `と / て / も / だ / れ / か / 。`，测试转红。复算：运行该变体的内存测试，或执行 `node --test src/features/wordbank/__tests__/wordFieldAlignment.test.mjs` 查看 F-4 守卫。

### 三条样板句

```text
私もとても楽しかったです。
  → 私[我（郑重说法）] も[（也）] とても[非常] 楽[舒适] しか[牙科] った[∅] です[（是）] 。[。]
だれか玄関に来てるよ。
  → だれか[某人] 玄関[玄关] に[（向/于）] 来[下（年] てる[照耀] よ[（强调）] 。[。]
私は先月ロンドンにいました。
  → 私[我（郑重说法）] は[（主题）] 先月[上个月] ロンドン[∅] に[（向/于）] いま[现在] した[下面] 。[。]
```

三句的单假名 wordBank 命中均为 **0**；复算：`node scripts/gloss-single-kana-stats.mjs`。

### 验收原始输出

```text
$ npm test
ℹ tests 619
ℹ pass 619
ℹ fail 0

$ npm run typecheck
> yanapp@1.0.0 typecheck
> tsc --noEmit

$ npm run audit
audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
PASS content-pack-sync sha256 f1e7191767cbc2b80ed0ca47832ab7327a24a0ccc241f2f5ca57cad1c866ddcf
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
PASS workspace-clean docs markdown tracked
INFO doc-refs scanned 1342 references (562 unique)
--- audit summary ---
FAIL: 0
WARN: 24
Result: PASS

$ git status --short
(在本报告提交完成后复算；应无输出)
```

验收命令：`npm test && npm run typecheck && npm run audit`；报告前置检查：`git status --short`、`npm run audit`。audit 的 24 条 WARN 是既有文档/用户 claim 提示，本轮未新增 FAIL。

### Commit 与边界

- `1275481`：修复单假名消费闸门、F-3/F-4 对齐优先级、词书货架全库 gloss 接线；删除恒真设备断言，加入质量闸门、统计脚本和回归测试。复核范围：`git show --stat --oneline 1275481`。
- 本轮想改但忍住没改：没有改任何句子的日文或中文；没有追修 `楽しかった` 的其他词义误配、`来`/`した` 的已有 gloss 质量、F-7/F-8/F-11；没有改评分算法、内容包、发布闸门或 OTA。

## 2026-08-30 · `TICKET-release-gate-blindspot.md` · 发布闸门提交态护栏

### 异常自查

1. 本轮与修复前提交相比，决策指标从 **Blocker 0 → Blocker 2**，超过 2 倍；原因是旧闸门只比较
   两份磁盘文件，修复后新增了「当前分支必须是 `develop/v2`」和「两份磁盘文件必须分别等于
   `develop/v2` 提交 blob」两层阻断。基线复算：在 `09f0d82^` 临时 worktree 运行
   `bash tools/check-content-release.sh`；修复后复算：在当前分支运行同一命令。
2. 没有说不清来源的数字。词条/词场规模来自 `develop/v2` 的提交内容，测试数来自 `npm test`，审计
   结果来自 `npm run audit`。
3. **Blocker 2** 的拆分包含一个产品选择：当前分支不是 `develop/v2` 也算 Blocker；
   **200 个词场**的计数口径是 `wordField` 中带非空 `sentence.jp` 的项，不是人工判读数字。

### 结果与决策指标

- 本轮决策指标 = **磁盘内容与 `develop/v2` 提交不一致时，闸门必须从放行变为 Blocker**。
  修复前 **0 → 修复后 2**，即 **No → Yes**。修复后当前分支的原始输出：

  ```text
  【3/6】develop/v2 提交态检查...
    ✗ 当前分支：content/2026-08-27-wordfield-lv49
    ✗ yan-content/content.v2.json 与 develop/v2 提交不一致
    ✗ YanApp/assets/content.fallback.json 与 develop/v2 提交不一致
  审计结果
    Blocker 数：2
    ✗ 当前不在 develop/v2
    ✗ 磁盘内容与 develop/v2 提交不一致
  ```

  复算：`bash tools/check-content-release.sh`（从 `/Users/yangshiyao/my-app` 运行）。修复前基线命令：
  `tmp=$(mktemp -d /private/tmp/yanapp-release-gate-before.XXXXXX); git worktree add "$tmp" 09f0d82^; bash "$tmp/tools/check-content-release.sh"; git worktree remove --force "$tmp"`。

- 模拟把修复后的 gate 放进临时 `develop/v2` worktree，实测 **Blocker 0**、无 Blocker。复算命令：
  `tmp=$(mktemp -d /private/tmp/yanapp-release-gate.XXXXXX); git worktree add "$tmp" develop/v2; git -C "$tmp" checkout content/2026-08-27-wordfield-lv49 -- tools/check-content-release.sh; bash "$tmp/tools/check-content-release.sh"; git worktree remove --force "$tmp"`。

- `tools/check-content-release.sh` 现在分别用 `git rev-parse "develop/v2:<path>"` 与
  `git hash-object <disk path>` 对照 `yan-content/content.v2.json` 和
  `YanApp/assets/content.fallback.json`；错误信息包含下一步。当前分支规则明确报 Blocker。

- `scripts/push-content.sh` 保留 `git show develop/v2:yan-content/content.v2.json` 作为权威源，发布前打印
  **8005 条词条、200 条词场**，默认要求确认；仅 `--yes` 跳过确认。复算：
  `git show develop/v2:yan-content/content.v2.json | python3 -c 'import json,sys; c=json.load(sys.stdin); w=c.get("wordBank") or []; f=sum(1 for x in w if isinstance(x.get("wordField"),dict) and x["wordField"].get("sentence",{}).get("jp")); print(len(w), f)'`。

- `src/lib/__tests__/wordIds.test.mjs` 新增磁盘/提交 blob 变异护栏（追加一个字节必须不匹配），并静态锁定两份路径都接入 gate；同时锁定发布脚本的规模打印、默认确认和 `--yes` 入口。非 Git 或没有
  `develop/v2` 时测试 skip，符合浅克隆降级要求。定向测试 **10 / 10**；复算：
  `node --test src/lib/__tests__/wordIds.test.mjs`。

### 变异验证

- 删除 gate 中的 `git hash-object` 对照，`wordIds.test.mjs` 的静态断言转红；把提交内容在内存中追加
  一个换行，blob 匹配断言转红。复算：`node --test src/lib/__tests__/wordIds.test.mjs`。
- 将当前工作分支改回修复前提交运行，旧闸门自然输出 **Blocker 0**；将修复脚本放入临时
  `develop/v2` worktree 运行，输出 **Blocker 0**；当前内容分支运行修复后脚本输出 **Blocker 2**。
  三者命令见上方“结果与决策指标”。
- 未执行 `scripts/push-content.sh`，因此没有触发 `fetch`、切换 `main`、提交或推送；这是工单明确边界。

### 验收原始输出

```text
$ npm test
ℹ tests 621
ℹ pass 621
ℹ fail 0

$ npm run typecheck
> yanapp@1.0.0 typecheck
> tsc --noEmit

$ npm run audit
audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
PASS content-pack-sync sha256 f1e7191767cbc2b80ed0ca47832ab7327a24a0ccc241f2f5ca57cad1c866ddcf
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
INFO doc-refs scanned 1358 references (565 unique)
```

复算：`npm test && npm run typecheck && npm run audit`。audit 原始输出中的既有 `WARN user-claims` 未由本轮
改动产生，且没有 FAIL。

报告前置检查：

```text
$ git status --short
(无输出，代码提交后)
```

复算：`git status --short`。

### Commit 与边界

- `09f0d82`：修复发布闸门与 `develop/v2` 提交态绑定，给发布脚本增加提交内容规模回显和默认人工确认，
  新增提交态/变异回归测试；复核：`git show --stat --oneline 09f0d82`。
- 未改 `assets/content.fallback.json`、`yan-content/content.v2.json`、同步链、评分算法或 `App.js`；
  未发布、未推送 `origin/main`、未执行 `scripts/push-content.sh`。
- 本轮想改但忍住没改：没有把发布动作改成自动化，没有放宽当前分支规则，没有改 `git show develop/v2`
  的权威源，也没有顺手修审计中的既有 claim WARN。

## 2026-08-30 · `TICKET-sync-data-loss.md` · 同步链 M1/M2/M3

### 异常自查

1. 本轮与工单基线相比，唯一需要解释的两倍以上变化是决策指标 **3 → 0**：工单点名的三条不可逆
   路径各自增加了阻断守卫和测试；这是修复目标，不是内容规模变化。复算：
   `node --test src/lib/__tests__/syncDataLoss.test.mjs`。
2. 没有说不清来源的数字。**1000** 是原有 Storage 单页 limit，本轮保留这个单页大小、改为带 offset
   持续翻页；复算：`rg -n 'STORAGE_LIST_PAGE_SIZE|offset' src/lib/supabase.js`。
3. **3 → 0** 是工单定义的决策指标；M1 的“空表”判据、M2 的“无会话”、M3 的“Storage 失败”都是
   代码分支判据，不是抽样估计。生产库是否已执行 SQL、真机文件是否已回收，代码不能证明。

### 结果与决策指标

- 本轮决策指标 = **能造成不可逆用户数据丢失的路径数：3 → 0**。
  三条路径现在均有独立守卫：

  - M1：`pullPocket()` 返回 `{ ok, ids, error }`；拉取失败不再伪装成空表，调用方用本机与云端并集，
    云端空表不能清掉本机口袋。
  - M2：同步链改用只读取现有会话的 `requireSession()`；`signInAnonymously()` 不再出现在
    `sync.js`，创建匿名身份只保留在 `supabase.js` 的 `ensureUser()` 首次启动入口。补传失败继续写入
    `K.backfillPending`，不会以新匿名账号伪装成功。
  - M3：Storage `list()` 按 offset 翻页；列举错误和 `remove()` 错误都会向上传播，任何一步失败都不会
    调用 `rpc('delete_my_account')`，并返回用户可见的“删除未完成，请重试”。

  复算：`node --test src/lib/__tests__/syncDataLoss.test.mjs`；M1 的纯合并行为复算：
  `node --test src/features/wordbank/__tests__/pocket.test.mjs`。

- 一并处理 S1：`pocketKey()` 与 `normalizePocket()` 在读盘时调用既有 `canonicalKey()`，仍保持裸的
  `词-读音` 格式；旧口袋键会折算到现行键，不改进度键格式，也没有修改 `srs.js`。

- 一并处理 S2：`pushProgress()` 对 `word_progress` 的 upsert 和 delete 都解构并检查数据库 `error`，
  失败进入既有 catch/warn 路径，不再把 RLS/约束错误当成成功。复算：
  `node --test src/lib/__tests__/syncDataLoss.test.mjs`。

### 变异验证

- M1：将 `!remote?.ok` 守卫改回只判断 `null`，或把 `mergePocketPull(result.value, remote)` 改回直接
  `normalizePocket(remote)`，`syncDataLoss.test.mjs` 的调用方静态守卫转红；口袋纯函数的空表用例也转红。
- M2：在 `sync.js` 任一同步路径重新加入 `signInAnonymously()`，测试的 `doesNotMatch` 转红；把
  `requireSession()` 改回会造账号的函数，调用点/实现契约测试转红。
- M3：删掉 `offset` 翻页、把 `list()` 错误吞成空数组、恢复 `remove()` 的内层吞错，或把 RPC 移到
  Storage 清理之前，M3 测试分别转红。
- S2：删除 upsert/delete 任一处 `if (error) throw error`，S2 测试中的双处计数断言转红。

这些是源码契约测试：同步模块依赖 React Native/Supabase 运行时，当前 node harness 不接生产凭据；
没有把静态通过描述成远端运行时验证。

### 生产库核验（待负责人执行）

代码只能证明客户端按这些表/列工作，不能证明生产库真的跑过 `schema.apply-all.sql`。请在 Supabase
Dashboard → SQL Editor/Database Inspector 确认以下清单：

- `public.word_progress`：`user_id`, `word_key`, `book_id`, `status`, `updated_at`, `box`, `due_at`,
  `reps`, `lapses`, `last_seen_at`。
- `public.place_checkin`：`user_id`, `place_id`, `status`, `note`, `photo_path`, `updated_at`,
  `checked_in_at`；`public.user_places`：`id`, `user_id`, `name`, `visited_on`, `photo_path`。
- `public.trip_notebooks`：`user_id`, `payload`, `device_rev`, `updated_at`；`public.profiles`：`id`。
- 共享账本：`public.trip_ledgers` 的 `id`, `created_by`；`public.ledger_members` 的 `id`, `ledger_id`,
  `user_id`, `display_name`, `is_tag`；`public.ledger_expenses` 的 `id`, `ledger_id`, `created_by`。
- 手账：`public.moments` 的 `id`, `user_id`；`public.moment_photos` 的 `id`, `user_id`, `moment_id`,
  `storage_path`；`public.moment_tags` 的 `id`, `user_id`, `moment_id`, `kind`, `value`；
  `public.journal_pages` 的 `id`, `user_id`；`public.journal_items` 的 `id`, `user_id`, `page_id`。
- Storage：`storage.buckets.id` 中有 `checkin-photos` 与 `moment-photos`；`storage.objects` 至少能查
  `bucket_id`, `name`；同时确认 `public.delete_my_account()` 存在、可执行、且为当前版本。

可粘贴的列清单查询：

```sql
select table_schema, table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'profiles', 'word_progress', 'place_checkin', 'user_places', 'trip_ledgers',
    'ledger_members', 'ledger_expenses', 'trip_notebooks', 'moments', 'moment_photos',
    'moment_tags', 'journal_pages', 'journal_items'
  )
order by table_name, ordinal_position;
```

### 删号真机核验步骤（待负责人执行）

1. 用可丢弃的 Apple 账号登录测试包，先记录当前 user id；上传一张精选地点打卡照片，再创建一条带
   照片的手账瞬间/素材。
2. 在 Dashboard 查询 `storage.objects`，确认两个桶下都出现该 user id 前缀：
   `select bucket_id, name from storage.objects where name like '<USER_ID>/%' order by bucket_id, name;`
   同时记录 `place_checkin`, `moments`, `moment_photos`, `journal_pages`, `journal_items` 中该用户的行。
3. 在 App 内完成两次删除确认。若客户端返回失败，必须看到“删除未完成，请重试”，并且 Auth 用户仍在；
   不得出现“已删除”。
4. 若返回成功，刷新两个桶的对象列表，旧 user id 前缀应为空；检查 Auth → Users 中账号消失，且上述
   业务表不再有该 `user_id` 的行。这个步骤验证的是线上实际回收，不是本地代码推断。

### 仍未改的 publication 守卫（S3 建议）

发布检查脚本的 `--check` 模式目前把字节数和 SHA 快照写死；内容一变化就会红，且
`publication-content.test.mjs` 只间接依赖它，发布闸门也不调用它。建议另立小工单：把 publication
形状检查、两份内容字节同步、`kanji_anchor` 产品契约拆成可读的只读检查，并接入 `scripts/audit.mjs`
与发布闸门；固定的产品数量应放进版本化契约文件，内容窗口变更时同一 commit 更新契约和测试。
本轮不改这条，也不宣称当前已有自动检查守住 563。

### 验收原始输出

```text
$ node --test src/lib/__tests__/syncDataLoss.test.mjs src/features/wordbank/__tests__/pocket.test.mjs
ℹ tests 10
ℹ pass 10
ℹ fail 0

$ npm test
ℹ tests 627
ℹ pass 627
ℹ fail 0

$ npm run typecheck
> yanapp@1.0.0 typecheck
> tsc --noEmit

$ npm run audit
--- audit summary ---
FAIL: 0
WARN: 24
Result: PASS

$ git status --short
(无输出)
```

复算：以上各命令逐条运行；`npm run audit` 的既有 WARN 未由本轮改动产生。

### Commit 与边界

- `7c888e8`：修复 M1/M2/M3 与 S1/S2，新增 `syncDataLoss.test.mjs`，扩展口袋测试；复核：
  `git show --stat --oneline 7c888e8`。
- 未改内容包、`srs.js` 评分算法、数据库 SQL、发布闸门、`push-content.sh` 或 UI；未连生产凭据。
- 本轮想改但忍住没改：没有擅自修改匿名补传触发条件，没有把生产 SQL 执行状态写成“已完成”，没有
  把 S3 失效快照直接修掉，也没有为删号增加新的数据库删除路径。

## 2026-08-30 · `TICKET-wordfield-render-fixes.md`

### 异常自查

1. 与上一轮/工单基线相比，成员失效槽位从工单写的 **61 / 370** 变为本分支按旧严格相等口径实测的
   **69 / 370**，整句无高亮从工单写的 **22** 变为 **25**；修复后两者都为 **0**。这是统计口径/分支
   现状差异，仓库里没有足够证据解释为什么独立基线对不上，不能把 61 与 22 当成本次可复算基线。
   括号不闭合从 **46** 变为 **0**，性能调用从 **10** 变为 **0**；这些变化分别由括号扫描和 memo
   依赖直接决定。复算命令：

   ```bash
   node --input-type=module -e "import fs from 'node:fs'; import {firstGloss,dictionaryFormsFrom,buildWordFieldAlignment} from './src/features/wordbank/wordFieldAlignment.js'; import {fieldMemberTerms,isFieldMemberToken} from './src/features/wordbank/fieldMemberMatching.js'; const content=JSON.parse(fs.readFileSync('assets/content.fallback.json')); const rawTokens=JSON.parse(fs.readFileSync('assets/example_tokens.json')); const byId=new Map(content.wordBank.map(w=>[w.id,w])); const forms=dictionaryFormsFrom(rawTokens); const balanced=s=>{let d=0; for(const c of s){if(c==='（'||c==='(')d++; if(c==='）'||c===')'){d--; if(d<0)return false;}} return d===0}; const oldFirst=s=>String(s||'').split(/[;；]/)[0].split(/[，、,／/]/)[0].trim(); let oldMiss=0,oldZero=0,afterMiss=0,afterZero=0,slots=0,fields=0,oneField=0,beforeUnclosed=0,afterUnclosed=0; for(const w of content.wordBank){const fs=Array.isArray(w.wordField)?w.wordField:(w.wordField?[w.wordField]:[]); if(fs.length)fields++; if(fs.length===1)oneField++; if(!balanced(oldFirst(w.meaning_zh)))beforeUnclosed++; if(!balanced(firstGloss(w.meaning_zh)))afterUnclosed++; for(const f of fs){if(!f?.sentence?.jp)continue; const rows=buildWordFieldAlignment(f.sentence.jp,content.wordBank,forms); const members=(f.members||[]).map(m=>byId.get(m.id)).filter(Boolean).filter(m=>m.id!==w.id); let oldHits=0,afterHits=0; for(const m of members){slots++; const oldTerms=[m.word,m.reading].filter(Boolean); const fixedTerms=fieldMemberTerms({members:[{id:m.id}]},id=>byId.get(id)); if(rows.some(row=>oldTerms.includes(row.jp)))oldHits++; else oldMiss++; if(rows.some(row=>isFieldMemberToken(row,fixedTerms,forms)))afterHits++; else afterMiss++;} if(members.length&&!oldHits)oldZero++; if(members.length&&!afterHits)afterZero++;}} console.log(JSON.stringify({fields,oneField,slots,beforeMemberMiss:oldMiss,afterMemberMiss:afterMiss,beforeZeroSentences:oldZero,afterZeroSentences:afterZero,beforeUnclosed,afterUnclosed},null,2));"
   ```

   原始输出：

   ```text
   {
     "fields": 249,
     "oneField": 249,
     "slots": 370,
     "beforeMemberMiss": 69,
     "afterMemberMiss": 0,
     "beforeZeroSentences": 25,
     "afterZeroSentences": 0,
     "beforeUnclosed": 46,
     "afterUnclosed": 0
   }
   ```

2. 我说不清楚的数字是工单独立基线与本次 literal baseline 的 **61 vs 69**、**22 vs 25**；本轮不
   反推原因，也不修改内容包去迎合旧数字。
3. 判据决定而非独立测量的数字：修复后的失效数与零高亮句数由“每个非自身成员槽位必须命中、每个有
   非自身成员的句子必须至少命中一次”定义；memo 的 **0** 次输入后调用由 `correctionNote` 不在
   依赖数组定义。词场条目恰好都是单字段的 **249 / 249** 是内容现状测量，不是产品目标。

### 实际改动与决策指标

- 成员匹配从 `App.js` 内的严格 `term === token.jp` 改为独立纯函数：拆分 `word` / `reading` 的多表记，
  使用 `dictionaryFormsFrom` 的 surface → dictionary form 索引，并只对含汉字或长度大于 **1** 的词面
  使用包含兜底。决策指标 **69 / 370 → 0 / 370**，整句无高亮 **25 → 0**；测试逐槽位断言通过：
  `node --test src/features/wordbank/__tests__/wordFieldAlignment.test.mjs`。
- `firstGloss` 改成括号深度扫描，同时支持全角/半角括号；括号外才消费 `;；，、,／/`。决策指标
  **46 → 0**；测试逐词库扫描通过：`node --test src/features/wordbank/__tests__/wordFieldAlignment.test.mjs`。
- `WBDetailPage` 的主例句、词场 columns/alignment 与成员 terms 进入 `useMemo`；`correctionNote` 的
  `useState` 和 `TextInput` 结构未移动。旧路径在单字段卡上每次输入触发 **1** 次对齐，敲 **10** 个字符
  为 **10** 次；新路径仅初次计算，输入后为 **0** 次。这里是调用次数，不是耗时估算；源码守卫复算：
  `node --test src/lib/__tests__/wordfieldRenderGuards.test.mjs`。

  调用计数复算：

  ```bash
  node --input-type=module -e "import fs from 'node:fs'; const app=fs.readFileSync('App.js','utf8'); const d=app.slice(app.indexOf('function WBDetailPage'),app.indexOf('const wd = StyleSheet.create')); const memo=d.includes('const fieldRenderData = useMemo('); const correctionDeps=!d.slice(d.indexOf('const fieldRenderData = useMemo('),d.indexOf('const [correctionOpen')).includes('correctionNote'); console.log(JSON.stringify({beforePerInput:1,beforeTen:10,afterInitial:1,afterPerInput:memo&&correctionDeps?0:1,afterTen:memo&&correctionDeps?0:10}));"
  ```

  原始输出：`{"beforePerInput":1,"beforeTen":10,"afterInitial":1,"afterPerInput":0,"afterTen":0}`。

### 22 条基线无高亮句的逐条复核

本分支按旧严格相等口径得到 **25** 条而不是工单的 22 条；修复后全库残留为 **0**。下面列出前 **10**
个旧基线样本，逐条均已由全库测试命中；完整判定由上面的全库统计命令与测试完成：

```text
n5_kagetsu / 妊娠何か月ですか。 / 何
n5_go_2 / トルコ語を習ってるんだ。 / 習う
n5_nichi / 三日以内にお返事いたします。 / 三
n5_ato / 後で取りに来ます。 / 来る、取る
n5_imi / この語句の意味は何ですか？ / 何
n5_uta / 彼が歌を歌った。 / 歌う
n5_e / 彼女は絵を見ました。 / 見る
n5_kabin / 花瓶は両手で持ちなさい。 / 持つ
n5_kiiroi / 黄色い牛なんて見たことないよ。 / 見る
n5_kitte / あなたの切手帳を見せてください。 / 見せる
```

### 变异验证

变异在内存字符串/纯函数中执行，没有改写工作区：旧的 firstGloss 让 **3** 个括号 fixture 失败；旧的
成员严格相等在 **370** 个槽位中漏 **69** 个；把 `fieldRenderData` 的 `useMemo` 替换成普通赋值会让
源码守卫失败。复算命令：

```bash
node --input-type=module -e "import fs from 'node:fs'; import {dictionaryFormsFrom,buildWordFieldAlignment} from './src/features/wordbank/wordFieldAlignment.js'; const content=JSON.parse(fs.readFileSync('assets/content.fallback.json')); const tokens=JSON.parse(fs.readFileSync('assets/example_tokens.json')); const byId=new Map(content.wordBank.map(w=>[w.id,w])); const forms=dictionaryFormsFrom(tokens); const oldGloss=s=>String(s||'').split(';')[0].split('；')[0].split('，')[0].split('、')[0].split(',')[0].split('／')[0].split('/')[0].trim(); const glossCases=[['花费（时间、金钱）','花费（时间、金钱）'],['戴（帽子等，盖在头上）；穿','戴（帽子等，盖在头上）'],['（您/他的）夫人；太太','（您/他的）夫人']]; const glossMutationFailures=glossCases.filter(([input,expected])=>oldGloss(input)!==expected).length; let oldMemberMiss=0,slots=0; for(const w of content.wordBank){const fields=Array.isArray(w.wordField)?w.wordField:(w.wordField?[w.wordField]:[]); for(const f of fields){if(!f?.sentence?.jp)continue; const rows=buildWordFieldAlignment(f.sentence.jp,content.wordBank,forms); for(const m of f.members||[]){const mw=byId.get(m.id); if(!mw||m.id===w.id)continue; slots++; if(!rows.some(row=>[mw.word,mw.reading].filter(Boolean).includes(row.jp)))oldMemberMiss++;}}} const app=fs.readFileSync('App.js','utf8'); const component=app.slice(app.indexOf('function WBDetailPage'),app.indexOf('const wd = StyleSheet.create')); const memoMutationFails=!component.replace('const fieldRenderData = useMemo(', 'const fieldRenderData = (').includes('const fieldRenderData = useMemo('); console.log(JSON.stringify({glossMutationFailures,oldMemberMiss,slots,memoMutationFails}));"
```

原始输出：

```text
{"glossMutationFailures":3,"oldMemberMiss":69,"slots":370,"memoMutationFails":true}
```

### 保留的产品问题与未改项

- `カード` 的 `meaning_zh` 仍按现有测试显示为 `积分卡`；在「店員にカードを見せます。」里负责人可能
  更想要「卡片」。本轮没有改内容或测试锁定值。
- 当前 **218 / 249** 条词场把自身列在 `members`，chip 是否用于强调锚点还是冗余，留给负责人决定；
  本轮没有删除。
- 本轮没有改内容包、没有落库、没有发布或推 OTA；主线不推迟。性能只处理渲染路径，不改变评分算法。

复算自成员数量：

```bash
node --input-type=module -e "import fs from 'node:fs'; const c=JSON.parse(fs.readFileSync('assets/content.fallback.json')); let fields=0,self=0; for(const w of c.wordBank){const fs=Array.isArray(w.wordField)?w.wordField:(w.wordField?[w.wordField]:[]); for(const f of fs){if(!f?.sentence?.jp)continue; fields++; if((f.members||[]).some(m=>m.id===w.id))self++;}} console.log(JSON.stringify({fields,selfMemberFields:self}));"
```

原始输出：`{"fields":249,"selfMemberFields":218}`。

### 验收原始输出

```text
$ npm test
ℹ tests 631
ℹ pass 631
ℹ fail 0

$ npm run typecheck
> yanapp@1.0.0 typecheck
> tsc --noEmit

$ npm run audit
audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
WARN user-claims App.js:3048: review editorial claim "旅行高频"
WARN user-claims App.js:3092: review editorial claim "旅行高频"
WARN user-claims App.js:3186: review editorial claim "高频"
WARN user-claims App.js:3229: review editorial claim "高频"
WARN user-claims App.js:3276: review editorial claim "高频"
WARN user-claims App.js:3294: review editorial claim "旅行最高频框架"
WARN user-claims src/features/kana/KanaScreen.js:1954: review editorial claim "旅行高频"
PASS content-pack-sync sha256 f1e7191767cbc2b80ed0ca47832ab7327a24a0ccc241f2f5ca57cad1c866ddcf
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
INFO doc-refs scanned 1401 references (588 unique)
PASS doc-refs 所有引用都已入库（18 条指向不存在的路径，见 WARN）
PASS workspace-clean docs markdown tracked
--- audit summary ---
FAIL: 0
WARN: 25
Result: PASS

$ git status --short
(无输出)
```

### Commit 与边界

- `d94ea35`：修复成员高亮、括号内 gloss 截断与词卡对齐重复计算；新增纯函数与回归/源码守卫测试。
- 本轮没有改内容包，因此没有内容 stats 前后对比，也没有内容版本递增或发布验证。
- 最终状态干净；审计的 **25** 条 WARN 均为既有 user-claims/doc-refs 提示，不是本轮词场修复引入。
- 本轮想改但忍住没改：没有为工单基线差异虚构解释，没有改 `カード` gloss，没有删除自成员 chip，
  没有把包含兜底扩展成新的词义或修改评分逻辑。
## 2026-08-30 · TICKET-wordfield-zh-54（候选稿，未落库）

### 异常自查

1. 本轮没有与上一轮可比且相差两倍以上的数：本轮第一次产出候选稿，之前只记录待判读的 54 条。
2. 没有说不清来源的数字；分类数来自工单已给出的负责人判读，候选条数由下方命令按 Markdown 表格行复算。
3. A/B/C/D/OK 是负责人判据决定的分类，不是本轮测量结果；候选中文是 LLM 候选，尚未成为可发布内容。

### 结果

- 提交 `c2b980d`（`docs: keep Chinese wordfield fixes awaiting review`）新增候选稿，并更新本轮状态与验收记录；提交 `bfb69f9`（`docs: record wordfield audit output faithfully`）把审计记录校正为实际输出。两次提交均未触碰内容包或运行时代码。复算：`git show --stat c2b980d && git show --stat bfb69f9`。
- 新增 `staging/zh-54-candidates.md`：A 26、D 2、B 17、C 5、OK 4，共 54 条。每条含原中文、候选中文和原因；D 类有前后对照。复算：
  `node -e "const s=require('fs').readFileSync('staging/zh-54-candidates.md','utf8'); for(const h of ['## A','## D','## B','## C','## OK']){const i=s.indexOf(h),j=s.indexOf('\\n## ',i+1); console.log(h,(s.slice(i,j<0?undefined:j).match(/^\\| \\d+ \\|/gm)||[]).length)}"`
- 决策指标「A 类 26 条改完并经负责人确认的条数」为 **0 → 0**：本工单只包含候选步骤，尚未得到负责人逐条确认，因而可落库数仍为 0。待确认 A 类为 **26 条**。复算：
  `node -e "const s=require('fs').readFileSync('staging/zh-54-candidates.md','utf8'); const a=s.slice(s.indexOf('## A'),s.indexOf('## D')); console.log((a.match(/^\\| \\d+ \\|/gm)||[]).length)"`
- 未改日语、`assets/content.fallback.json`、`yan-content/content.v2.json`、`publication`、UI、gloss 或对齐；没有发布、没有推 OTA。想改但忍住的地方：没有把候选中文直接写入内容包，也没有顺手调整词场渲染或日语原句。

### 验收原始输出

候选数量检查：

```text
A 26 expected 26
D 2 expected 2
B 17 expected 17
C 5 expected 5
OK 4 expected 4
```

`npm test`：

```text
ℹ tests 631
ℹ suites 0
ℹ pass 631
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

`npm run typecheck`：

```text
> tsc --noEmit
```

`npm run audit`：

```text
audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
WARN user-claims App.js:3048: review editorial claim "旅行高频"
WARN user-claims App.js:3092: review editorial claim "旅行高频"
WARN user-claims App.js:3186: review editorial claim "高频"
WARN user-claims App.js:3229: review editorial claim "高频"
WARN user-claims App.js:3276: review editorial claim "高频"
WARN user-claims App.js:3294: review editorial claim "旅行最高频框架"
WARN user-claims src/features/kana/KanaScreen.js:1954: review editorial claim "旅行高频"
PASS content-pack-sync sha256 f1e7191767cbc2b80ed0ca47832ab7327a24a0ccc241f2f5ca57cad1c866ddcf
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
INFO doc-refs scanned 1411 references (589 unique)
```

`git status --short`（提交前）：

```text
 M docs/handoff/ACTIVE.md
 M docs/handoff/CC-REPORT.md
?? staging/zh-54-candidates.md
```

## 2026-08-31 · `TICKET-kana-header.md` · 五十音头部重排

### 异常自查（5-2）

1. **和上一轮差 2 倍以上的数字**：无可比数字（本轮是布局改动，之前的验收轮次都不涉及五十音这一屏的高度）。
2. **说不清是怎么来的数**：`KANA_THEORY_CARD_MIN_HEIGHT = 180`（提示卡最小高度）是**估算**，不是量出来的 ——
   这个仓库没有 RN 渲染测试基建（`npm test` 只跑 `node --test` 的纯函数测试），没法像 web 项目那样
   开预览拿真实 DOM 坐标。估算方法：320 屏可用宽度 256px（scroll padding 32 + 卡片 padding 32）
   ÷ 12.5px/字（12 号字 CJK 全角字宽估值）≈ 20 字/行；五段理论文案里最长的一段（外来语，66 字）
   ≈ 4 行，多留 1 行安全余量按 5 行算，加卡片自身 padding/标题/提示行凑成 180。**这是按字数估算的
   上界，不是任何一个真实设备上实测的行数** —— 如果理论文案以后改得更长，这个常量要跟着调，
   见 `kanaHeaderLayout.ts` 顶部注释。
3. **判据决定、不是测出来的**：决策指标（假名格区域顶部偏移=0）现在是**按构造成立**，不是抽样量出来的——
   头部两行和提示卡都改成了显式 `height`/`minHeight`（不是 `marginTop` 堆出来的），这三块高度
   与 `kanaSection` 无关是代码结构本身保证的，测试断言的是「这个保证真的接在组件上，没有各写各的」。
   这比在某一个屏宽下量一次更强，但前提是提示卡永远不会被内容撑爆 —— 第 2 条的估算就是这个前提的
   来源，值得单独标出来。

### 本轮决策指标

**切换子标签（清音 / 浊·半浊 / 拗音 / 特殊音 / 外来语）时，假名格区域顶部的位移：现状 → 0。**

- **修复前**：只在 `kanaSection === 'clear'` 渲染的「看过 X/46」计数块（原 `kn.gateRow`，
  `marginTop:10` + `paddingVertical:8×2=16` + 单行文案内容约 33px）造成约 **59px** 的位移
  （note 换行时更多）。这是按删除前的样式字面量算出来的估算，不是实测像素；复算：
  `git show HEAD~0:src/features/kana/KanaScreen.js` 已经删了这块，历史版本在
  `git log -p -- src/features/kana/KanaScreen.js` 里能找到删除前的 `gateRow` 样式定义。
- **修复后**：**0**。头部第一行（标题/副标题 + 平假名|片假名 + 对照）固定 `height: 48`，
  外来语屏不渲染右侧控件时槽位高度不变；第二行（五段分段控件）固定 `height: 40`，五段等宽、
  不换行；提示卡固定 `minHeight: 180`。三块高度都与 `kanaSection` 无关，见
  `src/features/kana/kanaHeaderLayout.ts`。复算：
  `node --test src/features/kana/__tests__/kanaHeaderLayout.test.mjs`（7/7）。

### 做了什么

1. **删掉计数块整块**（含「看过 X/46」文案、三种状态的注解文案、**以及「我已经会了」按钮**）。
   `useKanaGate` 在这一页的引用、`declare` 的解构都一并删除（不删会留下死代码）。
   **`useKanaGate.js` / `kanaProgress.ts` / `declareKnown` 本身一个字节都没动** ——
   首页今日卡（`App.js`）仍然用同一份 `useKanaGate` 判断这道门过没过，老用户「学过任何词即视为
   过关」的兜底完全不受影响。
2. **头部压成两行**：行一 = 标题/副标题（左，`numberOfLines={1}` 防止长副标题在窄屏下把行高撑高）
   + 平假名|片假名切换 + 对照（右，外来语屏隐藏但槽位高度不变）；行二 = 一个带底轨的分段控件
   （`KANA_SECTION_TABS` 数据驱动，五段等宽共享一行，不再是五个各写各的 chip）。
3. **提示卡给了 `minHeight`**（估算方法与局限见上面异常自查第 2 条）。

### ⚠️ 有意的功能取舍：「我已经会了」按钮消失了

工单原文「删掉计数块（整块，含那句解释）」——那个块除了计数文案，还包含 `!gate.done` 时显示的
「我已经会了」显式跳过按钮（`declareKnown`，学过一点日语的人不用被迫点 46 下）。工单给的新头部
结构（行一 = 标题+切换+对照，行二 = 分段控件）里没有为这个按钮留位置，我按字面理解把它一并删了。

**影响范围很窄**：`gate.done` 已经把「学过任意一个词」当兜底，所以只有「一个词都没学过、又不想
逐个点 46 个假名的新用户」会失去这个显式出口 —— 其余情况门本来就是过的。**这是本轮唯一一处
「工单字面上要求删，但删了会去掉一个可用功能」的地方**，写在这里供负责人核对：如果这个判断错了，
按钮的数据层（`declareKnown`）完好，加回来只是加一行 JSX。

### 验收原始输出

`npm test`：

```text
ℹ tests 638
ℹ suites 0
ℹ pass 638
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

新增测试单独跑（`src/features/kana/__tests__/kanaHeaderLayout.test.mjs`，7 条）：

```text
✔ ★ 决策指标:假名格区域顶部偏移与 kanaSection 无关,五段算出来必须相等
✔ 头部自身高度(kn.hd)是正数常量,不依赖任何外部输入
✔ 头部三块(行一/分段控件/提示卡)的样式确实引用了共享常量,不是各写各的字面量
✔ 删掉的「看过 X/46」计数块(含「我已经会了」按钮)没有再出现
✔ ★ 变异防护:头部区域不许再出现「按 kanaSection 字面量做条件渲染」
✔ 分段控件按 KANA_SECTION_TABS 数据渲染五段,不是五个各写各的 chip
✔ 行一右侧的切换/对照只按 isLoanwordMode 隐藏,不按其余四个子标签分别决定
ℹ pass 7, fail 0
```

`npm run typecheck`：

```text
> tsc --noEmit
```
（无输出，退出码 0）

`npm run audit`：

```text
audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
WARN user-claims App.js:3048: review editorial claim "旅行高频"
WARN user-claims App.js:3092: review editorial claim "旅行高频"
WARN user-claims App.js:3186: review editorial claim "高频"
WARN user-claims App.js:3229: review editorial claim "高频"
WARN user-claims App.js:3276: review editorial claim "高频"
WARN user-claims App.js:3294: review editorial claim "旅行最高频框架"
WARN user-claims src/features/kana/KanaScreen.js:1900: review editorial claim "旅行高频"
PASS content-pack-sync sha256 f1e7191767cbc2b80ed0ca47832ab7327a24a0ccc241f2f5ca57cad1c866ddcf
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
--- audit summary ---
FAIL: 0
WARN: 24
Result: PASS
```

`WARN: 24` 与改动前基线相同（`git stash` 后重跑核对过，那条 KanaScreen.js 的 `旅行高频` 警告
改动前就存在，只是行号从 1954 变成 1900，是本轮插入/删除行数导致的行号漂移，不是新增内容）。

**变异验证**（手动做，按工单要求）：把「行二不许出现按 `kanaSection` 字面量条件渲染」测试保护的
那一行临时改回 `{kanaSection === 'clear' ? <Text style={kn.sub}>看过 1 / 46 个平假名</Text> : null}`，
`npm test` 单跑该文件从 7/7 转 6/7（`★ 变异防护` 那条转红，报错原文见改动记录）；
另外把 `theoryCard` 的 `minHeight: KANA_THEORY_CARD_MIN_HEIGHT` 临时改成字面量 `180`，
「样式确实引用了共享常量」那条同样转红。两处都已改回，`npm test` 复跑回到 638/638。

`git status --short`（`npm run audit` 提示两个新文件「存在但未入库」——`doc-refs` 检查按
`git ls-files` 判断入库，只要 `git add` 到暂存区就算数，不需要 commit；已 `git add`，
未 commit）：

```text
 M docs/handoff/ACTIVE.md
 M docs/handoff/CC-REPORT.md
 M src/features/kana/KanaScreen.js
A  src/features/kana/__tests__/kanaHeaderLayout.test.mjs
A  src/features/kana/kanaHeaderLayout.ts
```

`npm run audit`（`git add` 之后复跑）：

```text
--- audit summary ---
FAIL: 0
WARN: 24
Result: PASS
```

本轮未改内容包、未改假名数据/发音/记忆钩子、未改底部三个 tab、未改评分算法、未连生产、
未发布、未推 OTA。改的是 JS，走热更新，做完停下。

### 提交

三个代码/测试文件已提交，commit `855f944`：

```text
fix(kana): 头部改固定高度模型，消除切子标签时的闪跳

计数块「看过 X/46」只在清音屏渲染，切走时整块消失，下面所有内容
往上跳——不是渲染 bug，是布局不对称。删掉计数块（含「我已经会了」
按钮，declareKnown/useKanaGate 本身未动），把头部两行和提示卡的
高度都改成与 kanaSection 无关的常量（kanaHeaderLayout.ts），让「位移
为 0」从需要每次核对变成代码结构本身保证的事。
```

`docs/handoff/ACTIVE.md`、`docs/handoff/CC-REPORT.md` 本身未提交（改报告不改代码，留给下一次
一起进）。

提交后 `git status --short`：

```text
 M docs/handoff/ACTIVE.md
 M docs/handoff/CC-REPORT.md
```

提交后 `npm run audit`：

```text
audit: read-only harness
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
WARN user-claims App.js:3048: review editorial claim "旅行高频"
WARN user-claims App.js:3092: review editorial claim "旅行高频"
WARN user-claims App.js:3186: review editorial claim "高频"
WARN user-claims App.js:3229: review editorial claim "高频"
WARN user-claims App.js:3276: review editorial claim "高频"
WARN user-claims App.js:3294: review editorial claim "旅行最高频框架"
WARN user-claims src/features/kana/KanaScreen.js:1900: review editorial claim "旅行高频"
PASS content-pack-sync sha256 f1e7191767cbc2b80ed0ca47832ab7327a24a0ccc241f2f5ca57cad1c866ddcf
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
PASS metric publication.learning=1187 (not asserted)
INFO doc-refs scanned 1447 references (603 unique)
PASS doc-refs 所有引用都已入库（17 条指向不存在的路径，见 WARN）
PASS workspace-clean docs markdown tracked
--- audit summary ---
FAIL: 0
WARN: 24
Result: PASS
```
## 2026-08-31 · TICKET-zh-54-land（27 个新词场，未发布）

### 异常自查

1. 词场数从 249 到 276，变化为 27 条，不是两倍以上；Tatoeba 词场从 229 到 256，同因。可渲染的非 anchor 成员槽位从 370 到 406，增加 36，原因是 27 条新句带来成员，且 6 个 staging 成员被运行时匹配闸门过滤（复算：`node scripts/land-zh-54.mjs | grep '^source members filtered'`）。
2. 没有说不清来源的数字：27 条及其来源/成员由 `scripts/land-zh-54.mjs` 固定表和 Tatoeba staging 双重校验；内容统计由 `node scripts/content-stats.mjs` 输出。
3. 「应过滤 6 个成员」是运行时匹配判据决定的，不是内容质量测量；判据是 `dictionaryFormsFrom` 能否在对应日语句面解析，避免设备上成员高亮失效。

### 结果

- 提交 `1080de1`（`content: land approved ZH word fields without teaching errors`）：两份内容包同一提交新增 27 个负责人确认的词场、版本 2.8 → 2.9；新增可复跑落库脚本；将两个内容规模断言更新为 Tatoeba 229 → 256、可渲染非 anchor 槽位 370 → 406。复算：`git show --stat 1080de1`。
- 决策指标「会把用户教错的中文条数」**25 → 0**。回读 27 / 27：中文、成员和 Tatoeba 日中句 ID 均与工单表一致；复算：`node scripts/land-zh-54.mjs`。
- 词场 **249 → 276 / 563**（3.1% → 3.4%）；Tatoeba 词场 **229 → 256**；词条 **8005 → 8005**、`kanji_anchor` **563 → 563**。复算：`node scripts/content-stats.mjs`。
- 两份内容包 SHA-256 一致：`098aa5071beb98510dfd7a2e5f005212f0f8478aeff2be96531dd6e7e990238c`。复算：`shasum -a 256 assets/content.fallback.json ../yan-content/content.v2.json`。
- 与工单初版不符的事实：27 条是新增词场，不是修改既有 `sentence.zh`；`n5_saifu` 已有更短的在库词场，按负责人裁决撤出。staging 的 `～杯`、`～月`、`～歳`、`呼ぶ`、`～人`、`撮る` 不能由运行时匹配器在句面识别，已从 members 过滤而未改任何句面或来源。想改但忍住的地方：没有改日语、中文、gloss、对齐算法、publication、评分或发布链；没有发布或推送 main。

### 验收原始输出

`npm test`：

```text
ℹ tests 638
ℹ pass 638
ℹ fail 0
ℹ skipped 0
ℹ todo 0
```

`npm run typecheck`：

```text
> tsc --noEmit
```

`bash ../tools/check-content-release.sh`：

```text
✓ fallback.json 同步
✓ 当前分支：develop/v2
✓ yan-content/content.v2.json 与 develop/v2 提交一致
✓ YanApp/assets/content.fallback.json 与 develop/v2 提交一致
Blocker 数：0
✓ 无 Blocker
```

`npm run audit`：

```text
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
PASS content-pack-sync sha256 098aa5071beb98510dfd7a2e5f005212f0f8478aeff2be96531dd6e7e990238c
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
```

`git status --short`（内容提交和报告修改前）：

```text
(empty)
```

## 2026-08-31 · TICKET-zh-54-paren-style（实现完成，待真机视觉验收）

### 异常自查

1. 本轮的决策指标从两个消费点中的 2 处全字号括号到 0 处，但这是由接线测试点数得出，**不是**截图测量；复算：`node --test src/features/wordbank/__tests__/parentheticalZhWiring.test.mjs`。
2. 没有无法复算的数字：真实带全角括号的词场为 4 条，#19 含 2 个注；复算：`node -e "const c=require('./assets/content.fallback.json'); console.log(c.wordBank.flatMap(w=>Array.isArray(w.wordField)?w.wordField:[w.wordField]).filter(f=>f?.sentence?.zh?.includes('（')).map(f=>f.sentence.zh))"`。
3. 「2 → 0」是消费点/样式接线的判据，而不是肉眼量出的字体比例；视觉是否会在复习提问面变成过强提示，必须由真机观察决定。

### 实现与变异验证

- 新增 `src/features/wordbank/parentheticalZh.js`：只有完整、非嵌套、非空的全角 `（…）` 才切出 `{ kind: 'note' }`；半角括号不介入。其他输入返回 `null`，两处调用方遂原样整句渲染。单元测试覆盖 #19 的双注、无括号/半角括号、未配对/嵌套/空括号；复算：`node --test src/features/wordbank/__tests__/parentheticalZh.test.mjs`。
- `App.js` 的词场中文行调用同一函数，并以 `wd.exZhNote`（10px、`C.mutedLight`）渲染注；`ReviewScreen.js` 的 `unit.ask` 调用同一函数，并以 `s.askNote`（15px、`C.muted`）渲染注。接线守卫会在任一消费点删调用或删注样式时失败；复算：`node --test src/features/wordbank/__tests__/parentheticalZhWiring.test.mjs`。
- 变异一（改坏什么：把未闭合 `（` 也切为 note）→ `node --test src/features/wordbank/__tests__/parentheticalZh.test.mjs` 实测 **2 pass / 1 fail**，断言 `请给（我一杯咖啡。` 必须返回 `null`。
- 变异二（改坏什么：将复习面的 `splitParentheticalZh(unit?.ask)` 替换为 `null`）→ `node --test src/features/wordbank/__tests__/parentheticalZhWiring.test.mjs` 实测 **0 pass / 1 fail**，缺失复习调用的正则断言失败。

### 真机/预览验收：环境阻塞，未宣称完成

按工单尝试 `xcrun simctl list devices available`，输出 `unable to find utility \"simctl\"`，本机无可用 iOS 模拟器。随后运行 `npx expo start --web --port 8083`，Metro 在 Web 打包时报 `Unable to resolve \"react-native-web/dist/exports/AppRegistry\"`，因此无法用浏览器预览替代真机。没有截图，也没有把「代码接线」写成「已肉眼确认」。

负责人待验：在词卡词场中文行与复习提问面各打开 #19 `（我）听到有人叫（我的）名字。`，确认两个括号及其内容均比正文小、淡，且复习面没有变成不舒服的提示。若复习面别扭，按工单不自行改规则，另交负责人决定。

### 未做的事

未改内容包、`units.js`、评分、进度键或其他词场样式；未安装缺失依赖、未发布、未推 OTA。`react-native-web` 的缺失是既有预览环境问题，本轮不顺手修。

### 本轮验收原始输出

`npm test`：

```text
tests 642
pass 642
fail 0
```

`npm run typecheck`：

```text
> tsc --noEmit
```

`npm run audit`：

```text
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
PASS content-pack-sync sha256 098aa5071beb98510dfd7a2e5f005212f0f8478aeff2be96531dd6e7e990238c
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
INFO doc-refs scanned 1579 references (667 unique)
```

`git status --short`（提交前）：

```text
 M YanApp/App.js
 M YanApp/docs/handoff/ACTIVE.md
 M YanApp/docs/handoff/CC-REPORT.md
 M YanApp/src/features/review/ReviewScreen.js
?? YanApp/src/features/wordbank/__tests__/parentheticalZh.test.mjs
?? YanApp/src/features/wordbank/__tests__/parentheticalZhWiring.test.mjs
?? YanApp/src/features/wordbank/parentheticalZh.js
```

## 2026-08-31 · TICKET-wordfield-chip-noise（词场对齐行与 chip 行去噪）

### 异常自查

1. 与上一轮相比，没有数字变化超过 2 倍：测试 638 → 648，audit WARN 仍为 24；本轮新增的决策基线
   是内容包自指成员 244 / 276，不是上一轮指标，修复后渲染值为 0。
2. 没有说不清来源的数字。244 / 276 来自工单给定的内容包命令；0 / 276、8 条单成员词场和 276 / 276
   对齐结果均由本轮测试直接计算。
3. 8 条单成员词场是内容形状判据，不是视觉测量；“整行不渲染”由 `memberChips.length > 0` 的接线
   判据决定。截图是 web 视觉验收，不能替代全库统计。

### 实现与决策指标

- 本轮决策指标 = **渲染出的自指 chip 244 / 276 → 0 / 276**。旧值复算：
  `node -e 'const w=require("./assets/content.fallback.json").wordBank;const f=w.filter(x=>x.wordField?.sentence?.jp);console.log(f.filter(x=>(x.wordField.members||[]).some(m=>m.id===x.id)).length+" / "+f.length)'`。
  新值复算：`node --test src/features/wordbank/__tests__/wordFieldChipNoise.test.mjs`，其中真实内容包
  用 `fieldMemberChips` 走与 App 相同的可见成员筛选。
- 新增 `fieldMemberChips(wordField, entryId, lookupWord)`：过滤当前词条自己及查不到的成员；App 只在
  `memberChips.length > 0` 时渲染 chip 容器。真实内容包的 8 条单成员词场为：
  `n5_ie n5_okashi n5_kata n5_kodomo n5_shashin n5_sukoshi n5_tegami n5_ni`。复算：上述 chip 测试。
- `wordFieldAlignment.js` 只把 `、。？！` 映射值从自身改为空字符串；token 列保留。全库 **276 / 276**
  条词场句均能按原顺序回拼，所有行均保留 `zh` 注解槽位。复算：
  `node --test --test-name-pattern='全库词场对齐保持原句列数与顺序' src/features/wordbank/__tests__/wordFieldAlignment.test.mjs`。

### 变异验证

- 改坏什么：去掉 `member.id !== entryId` 过滤；红测：`wordFieldChipNoise.test.mjs`，真实内容包自指
  chip **244**，且 3 / 4 个测试失败。
- 改坏什么：把 `memberChips.length > 0 && <View ...>` 改成无条件容器；红测：同一文件的 App 接线测试
  1 / 4 失败，空行守卫正则不匹配。
- 改坏什么：把标点 gloss 恢复为 `、。？！`；红测：
  `node --test --test-name-pattern='标点保留' src/features/wordbank/__tests__/wordFieldAlignment.test.mjs`
  1 个测试失败，实际标点注为 `。` 而非空字符串。

三处变异均已恢复，恢复后定向验收 **3 / 3** 通过；复算：
`node --test --test-name-pattern='标点保留|真实内容包渲染出的自指 chip|App 接线' src/features/wordbank/__tests__/wordFieldAlignment.test.mjs src/features/wordbank/__tests__/wordFieldChipNoise.test.mjs`。

### Web 视觉验收

从提交 `016ceda` 导出基线 `/tmp/webcheck-before`，从当前代码导出 `/tmp/webcheck`，均用 web 预览进入
词书搜索 `聞く` 后在同一滚动位置截图：

- 改前：`/tmp/wordfield-chip-noise-before.png`，可见 `聞く 听；问` 自指 chip 和标点 `。` 注解。
- 改后：`/tmp/wordfield-chip-noise-after.png`，自指 chip 与 `。` 注解消失，`名前 名字` 保留。
- 导出命令：`npx expo export --platform web --output-dir /tmp/webcheck`；退出码 0，bundle 成功。
  基线命令：`npx expo export --platform web --output-dir /tmp/webcheck-before`；退出码 0，bundle 成功。

### 验收原始输出

`npm test`：

```text
ℹ tests 648
ℹ pass 648
ℹ fail 0
```

`npm run typecheck`：

```text
> tsc --noEmit
```

`npm run audit`：

```text
PASS content-stats (exit 0)
PASS validate-content (exit 0)
PASS meaning-audit (exit 0)
PASS content-pack-sync sha256 098aa5071beb98510dfd7a2e5f005212f0f8478aeff2be96531dd6e7e990238c
PASS content-pack-sync authority content.v2.json has no uncommitted change
PASS content-pack-sync version/content comparison
PASS invariant kanji_anchor.total=563
PASS invariant wordBank.total=8005; _meta.note=8005
--- audit summary ---
FAIL: 0
WARN: 24
Result: PASS
```

`git status --short`（本轮代码与报告提交前；以下 3 个脚本/测试文件是本轮开始前已存在的并行词场
读音工作，未改、未暂存、未纳入本轮 commit）：

```text
 M App.js
 M docs/handoff/ACTIVE.md
 M docs/handoff/CC-REPORT.md
 M src/features/wordbank/__tests__/wordFieldAlignment.test.mjs
 M src/features/wordbank/fieldMemberMatching.js
 M src/features/wordbank/wordFieldAlignment.js
?? scripts/wordfield-furigana-stats.mjs
?? src/features/wordbank/__tests__/wordFieldChipNoise.test.mjs
?? src/features/wordbank/__tests__/wordFieldFurigana.test.mjs
?? src/features/wordbank/wordFieldFurigana.js
```

### 实际改动范围与克制项

本轮改动：`App.js` 的词场 chip 接线、`fieldMemberMatching.js` 的显示筛选、
`wordFieldAlignment.js` 的标点 gloss、`wordFieldAlignment.test.mjs` 回归，以及新增
`wordFieldChipNoise.test.mjs`。未改内容包、members 数据、高亮/对齐消费算法、publication、评分算法，
未拆 App.js，未发布、未推 OTA。想改但忍住：没有删除内容包里的自指 members（它们仍参与高亮与对齐），
没有顺手清理既有 web/audit WARN，也没有纳入并行的词场读音工作。

## 2026-08-31 · TICKET-wordfield-furigana

### 异常自查

1. 与上一轮直接可比的词场来源数从 **229 → 256**，不是两倍变化；原因是上一轮已把 27 条新 Tatoeba 词场落进内容包，本轮工单正文仍保留旧的 229 条口径。复算：`node scripts/wordfield-furigana-stats.mjs`；历史 229 条复算命令见下文。
2. 没有自己说不清来源的数字：全句/部分/完全不可用由同一派生函数的 `status` 输出，人工标准答案一致率由 20 条现有 `sentence.roma` 与同一函数结果逐字相等计算。样本正文和原始输出均贴在本节。
3. **0 条完全不可用**包含判据成分：只要句子里还有可保留的假名或标点，就不会进入 `none`；含汉字 token 无唯一读音或无法通过 `alignFurigana` 时进入 `partial`，整句不显示。

### 决策指标与实际范围

本轮决策指标 = **原工单 229 条 Tatoeba 词场中可正确派生整句读音的条数 0 → 78**。

工单正文写 229 条，但当前内容包实际有 256 条 Tatoeba 词场：**89 / 256 全句可派生，167 / 256 部分可派生，0 / 256 完全不可派生**。复算：

```bash
node scripts/wordfield-furigana-stats.mjs
```

原工单 229 条历史 cohort 的结果是 **78 / 229 全句、151 / 229 部分、0 / 229 完全不可用**；复算：

```bash
node --input-type=module - <<'NODE'
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { dictionaryFormsFrom } from './src/features/wordbank/wordFieldAlignment.js';
import { deriveWordFieldReadingDetails, surfaceReadingsFrom, surfaceReadingsFromWordBank } from './src/features/wordbank/wordFieldFurigana.js';
const old = JSON.parse(execFileSync('git', ['show', '1080de1^:yan-content/content.v2.json'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
const tokens = JSON.parse(fs.readFileSync('assets/example_tokens.json', 'utf8'));
const df = dictionaryFormsFrom(tokens), er = surfaceReadingsFrom(tokens), wr = surfaceReadingsFromWordBank(old.wordBank);
const fields = old.wordBank.flatMap(w => { const f = Array.isArray(w.wordField) ? w.wordField : (w.wordField ? [w.wordField] : []); return f.filter(x => x?.source?.provider === 'Tatoeba' && x.sentence?.jp); });
const results = fields.map(f => deriveWordFieldReadingDetails(f.sentence.jp, old.wordBank, df, er, wr));
console.log(fields.length, results.reduce((out, x) => (out[x.status]++, out), { full: 0, partial: 0, none: 0 }));
NODE
```

当前实现只复用三处已有数据：完整内容包的 `word.reading`、`assets/example_tokens.json` 的 surface 读音、以及既有 `wordFieldAlignment.js` token 结果。`example_tokens.json` 按例句词条 id 索引，词场句没有自己的 token-reading 索引；因此没有把 Tatoeba source id 当成读音来源，也没有从网络或猜测补读音。含汉字 token 只有拿到唯一读音并通过 `alignFurigana` 才参与拼接；任一 token 失败，返回 `null`，App 不渲染整行。

### 实际改动与验证

- `61d0244`：新增 `src/features/wordbank/wordFieldFurigana.js`，为词库表面读音和例句 token 读音建立索引；App 在 `fieldRenderData` 中复用既有 alignment，保留已有 `sentence.roma`，Tatoeba 缺失时才使用完整派生结果；新增 `src/features/wordbank/__tests__/wordFieldFurigana.test.mjs` 与 `scripts/wordfield-furigana-stats.mjs`。复算：`git show --stat 61d0244`。
- 内容包未改：`assets/content.fallback.json` 与 `yan-content/content.v2.json` 均未触碰；`furigana.ts`、`wordFieldAlignment.js`、评分、publication、同步链均未改。未构建、未发布、未推 OTA。
- 定向测试：**4 / 4**；复算：`node --test src/features/wordbank/__tests__/wordFieldFurigana.test.mjs`。
- 全量测试：**652 / 652**；复算：`npm test`。
- 类型检查：通过；复算：`npm run typecheck`。
- 审计：`FAIL: 0`、`WARN: 24`；复算：`npm run audit`。

### 20 条 Tatoeba 派生样本

复算：`node scripts/wordfield-furigana-stats.mjs`。

```text
千円で足りる？ → せんえんでたりる？
妊娠何か月ですか。 → 不显示（部分）
今日は三月五日です。 → 不显示（部分）
トルコ語を習ってるんだ。 → トルコごをならってるんだ。
彼は昨日、一日中働いた。 → 不显示（部分）
若い時は、一度しかない。 → 不显示（部分）
三日以内にお返事いたします。 → みっかいないにおへんじいたします。
コーヒー一杯ください。 → 不显示（部分）
今度は私が運転する番よ。 → 不显示（部分）
魚を二匹捕まえた。 → 不显示（部分）
彼女の目の色は青です。 → かのじょのめのいろはあおです。
私の目は青いです。 → 不显示（部分）
赤い屋根の家を見てごらん。 → 不显示（部分）
私は明るい色が好きです。 → 不显示（部分）
私は秋より春が好きだ。 → 不显示（部分）
靴下に穴が開いているよ。 → くつしたにあながひらいているよ。
この箱の開け方分かる？ → 不显示（部分）
彼女は頭を上げた。 → かのじょはあたまをあげた。
靴がきつくて足が痛い。 → 不显示（部分）
私は庭で遊びます。 → 不显示（部分）
```

### 手工 20 条标准答案逐字比对

复算：`node scripts/wordfield-furigana-stats.mjs`。结果为 **8 / 20 一致**。

- 无法安全派生的 4 条：`明日、友達と会います。`（明日多音）、`家で朝ご飯を食べます。`（家多音）、`明日、海へ行きます。`（明日多音且行き无唯一标准）、`朝、会社へ行きます。`（行き无唯一标准）。这是 fail closed，不是派生错读。
- 可派生但逐字不一致的 8 条：`お金はいくらですか？`、`コンビニでお弁当を買いました。`、`財布からお金を出します。`、`安いお弁当を探します。`、`店員にカードを見せます。`、`レジで現金を払います。`、`レシートを袋に入れます。`、`ポイントカードがあります。`。这 8 条的人工 `roma` 使用罗马字/混合格式，而运行时派生按 token 已有读音输出假名；不是读音算法不一致。
- 其余 8 条逐字一致：`新しい靴を買います。`、`駅で電車を待ちます。`、`おいしい料理を食べます。`、`お菓子を買いました。`、`学校で先生に会います。`、`先生と学校の話をします。`、`手紙を読みます。`、`昼に料理を食べます。`

### 想改但忍住的地方

没有把读音写回两个内容包；没有新引依赖或编写活用/假名推测规则；没有修改 `furigana.ts`、`wordFieldAlignment.js`、Tatoeba 数据、手工 `roma`、例句 token 资产、构建/发布链。没有为了补覆盖率放宽多音字或部分 token 的整行门槛，也没有处理当前工作区之外的真机/OTA 验收。

### 验收原始输出

```text
node --test src/features/wordbank/__tests__/wordFieldFurigana.test.mjs
ℹ tests 4
ℹ pass 4
ℹ fail 0

npm test
ℹ tests 652
ℹ pass 652
ℹ fail 0

npm run typecheck
> tsc --noEmit

npm run audit
--- audit summary ---
FAIL: 0
WARN: 24
Result: PASS
```

最终 `git status --short` 与 `git status --short --branch` 的复算命令：

```bash
git status --short
git status --short --branch
```
