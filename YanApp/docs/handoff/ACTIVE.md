# 当前状态 · PLAN v2 第九批

> 状态：B9-1 已完成并提交；B9-2 的实现方案已先写入报告，待按两句样板实施。
>
> 更新日期：2026-08-25

## 当前工单

`docs/handoff/TICKET-plan-v2-batch9.md`

## 本轮进度

- B9-1 已完成：移除 `wordFieldAlignment.js` 内部 `require` 和静默空 Map，改为 `dictionaryFormsFrom(exampleTokens)` 依赖注入；`App.js` 对已 import 的 `EXAMPLE_TOKENS` 只构建一次索引并显式传入。
- B9-1 提交：`5471ec5 fix(wordfield): inject the example token dictionary forms`。
- B9-1 守卫：真实 `assets/example_tokens.json` → Map，规模 `1083`（测试下限 ≥1000）；`grep require(` 无命中。
- B9-1 验收：全量 `npm test` 604 passed，`npm run typecheck` 通过。
- B9-2 尚未写代码。改前 View 层级与三槽位方案已记录在 `docs/handoff/CC-REPORT.md`，之后只做 `店員にカードを見せます。` 与 `店員にサイズを聞きます。` 两句样板。

## 不做

- 不推全库，不改内容包，不动 `furigana.ts`、`units.js`、`srs.js`、`publication.ts`、`dailyTask.ts`。
- 不用手工空格、字符数 margin、句子写死位置或整行 gloss 猜位置。
- 不改「言」按钮层级、灰阶、离线 banner；不重构 `App.js`。
- 真机显示验收尚未执行；完成后若没有真机证据，报告只写“待真机验证”。
