# 工单 · gloss 覆盖率重测（上一轮的数字作废）

> 先读 `AGENTS.md`（第〇节主线、第六节交报告前必做）、
> `docs/handoff/TICKET-gloss-rollout-assessment.md`（原工单，要求不变）。
> **这一轮依然只测量，一行 UI / 业务代码都不改。**

## 这张工单把主线推迟多久

**不额外推迟。** 它不是新事情，是上一张工单的返工 —— 上一轮的数字不能用来做决定，
所以「推不推 gloss」这个决定现在仍然悬着。预计一次运行 ~3 分钟，报告当轮出。

## 为什么返工

`scripts/gloss-coverage.mjs:33-40` 的 `scopedInputs()` 每句只把**字面出现在该句中**的
词条传给 `buildWordFieldAlignment`，注释断言这与全量输入等价。**这个断言是错的。**

第三级命中 `dictionaryCandidateAt`（`wordFieldAlignment.js:60`）需要的是**辞书形**候选
（`散る`、`黙る`、`見せる`），而句子里出现的是活用形（`散れ`、`黙れ`、`見せます`）。
`sentence.includes('散る') === false` → 候选被过滤 → **辞书形还原通路在测量中全程关闭。**

实测（前 200 条例句，同一个未改的 `buildWordFieldAlignment`）：

```
scoped  1229/1349 = 91.10%
full    1246/1284 = 97.04%
200 句中 95 句 token 序列不同
```

分母也变了 —— `咲きます` 在 scoped 下被切成 `咲` + `き`(→树) + `ます`，
全量下是 `咲き`(→开花) + `ます`。所以覆盖率、分词、空白成因、
「贪心 vs EXAMPLE_TOKENS 差异 3074/4400」**四个数全部受污染**。

报告里作为重点的「最低覆盖 5 条样本」是纯 bug 产物：

```
散れ！   报告 0.00%   全量输入下：散れ→凋谢 ｜ ！→！    100%
黙れ！   报告 0.00%   全量输入下：黙れ→沉默 ｜ ！→！    100%
```

**优化的理由也不成立**：实测全量输入 300 句 9.2 秒，全库 4,400 条估算 **135 秒**。

## 要做的

### 1. 删掉 `scopedInputs()`，全量输入重跑

`buildWordFieldAlignment(entry.exampleJp, wordBank, dictionaryForms)` —— 直接传完整
`content.wordBank`（8005 条，不是过滤后的 4400）和完整 `dictionaryFormsFrom(exampleTokens)`。

慢就慢，135 秒可以接受。**如果你仍然想加缓存/索引来提速，必须满足：**
对全部 4,400 条，优化前后的 token 序列与 gloss **逐字节相同**，并把这个等价性检查
本身写成脚本、把输出贴进报告。**不许只在注释里断言等价。**

### 2. 修「不在词库」这一类

`blankCause()` 的第三个分支永远走不到 —— `buildWordFieldAlignment` 只发
`活用碎片` / `表记差异` 两种 `blankKind`（`wordFieldAlignment.js:138,149`）。
所以报告里的「不在词库 0（0.00%）」**不是测量结果，是死代码**。

原工单要这一类。做法：在**脚本里**（不是在 `wordFieldAlignment.js` 里）判断 ——
空白 token 的表面，或它在 `EXAMPLE_TOKENS` 里对应的辞书形，是否存在于 wordBank 的
`word`/`reading`。存在 = 表记差异或活用问题；不存在 = 真的不在词库。
**如果这一类判不出来，就在报告里写「判不出来，原因是 X」，不要写 0。**

### 3. 新增一个原工单没要、但比覆盖率更重要的数

**短 token 误命中率。** 上一轮样本里出现 `た→田`、`こと→日本筝`、`朝→早上`、
`え→画`、`き→树`、`め→眼睛`、`月→月亮`（句意是「三月」）。
这些在全量输入下**依然存在**（我核过 `朝鮮半島…` 那句：`朝→早上`、`鮮→∅`）。

覆盖率里混着这种，**比留空更糟** —— 留空用户知道没有，误命中用户会当真。

给出：单字（长度 1）token 中有 gloss 的有多少、占全部有 gloss token 的比例；
并**抽 20 条含单字命中的句子**贴进报告。这一批的产品结论主要靠这个数。

### 明确不做

- ❌ 不改 `wordFieldAlignment.js` 的分词、查词、`INFLECTION_FRAGMENTS`、`GRAMMAR`
- ❌ 不改 `App.js`、UI、`TOKEN_COLUMN_SAMPLE_SENTENCES`
- ❌ 不碰 `assets/content.fallback.json` / `yan-content/content.v2.json`
- ❌ 不构建、不发 OTA（8 月额度只剩 1 次）
- ❌ 不用 LLM 补任何中文

## 验收

- `scripts/gloss-coverage.mjs` 只读，跑两次 `git status --short` 干净
- 全量输入；报告里注明实际耗时
- 覆盖率 / 分布 / 空白成因（三类齐全）/ 分词差异 / 单字误命中率，全部给出
- 15 条稳定随机样本 + 5 条最低覆盖样本 + 20 条单字命中样本
- **报告里必须有一节「与上一轮数字的对照表」**：哪个数变了、变了多少
- `npm test && npm run typecheck && npm run audit`，贴原始输出

## 关于上一轮的产物怎么处理

- `docs/handoff/CC-REPORT.md` 的 `## Gloss rollout assessment · 2026-08-25` 一节
  **不要删**。在该节开头加一行醒目标注：「⚠️ 本节数字因测量输入被错误裁剪而作废，
  见 `TICKET-gloss-coverage-remeasure.md`；结论以重测一节为准。」
  留着是为了下一个人能看见这个坑长什么样。
- `staging/deep-card-audit.md` 与深卡盘点结论**不受影响**，不用重做。
- 拼回一致 100% 不受影响（两种输入下拼接都等于原句），但请在重测中再确认一次。

## 不变量

照 `AGENTS.md`。本批特别相关：不改业务代码、不碰内容包、不构建、不发 OTA、
不许顺手修误命中（**发现了写进报告，不要改**）。

## 做完写哪里

`ACTIVE.md` + `CC-REPORT.md` 追加新一节（不要覆盖旧节）。
