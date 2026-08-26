# 当前状态 · 纠错入口（本地 only）

> 更新日期：2026-08-26

## 当前工单

`docs/handoff/TICKET-correction-entry-minimal.md` ← **本轮已完成；不发布、不发 OTA**

已在词卡详情页底部加入低权重「去纠错」入口。弹层固定三类问题、可选说明，
提交追加到本机 `documentDirectory/yan_corrections_v1.jsonl`，不联网、不进内容包。
新增 `scripts/corrections-export.mjs`，按 `kind` 与 `wordId` 汇总到 stdout。

代码与测试 commit 待本轮提交后补入；没有内容包改动。

## 本轮验收

- `npm test`：616 / 616 通过。复算：`npm test`
- `npm run typecheck`：通过。复算：`npm run typecheck`
- `npm run audit`：`FAIL: 0`、`WARN: 16`、`Result: PASS`。复算：`npm run audit`
- 导出脚本已用临时 JSONL 验证能按 `kind` 与 `wordId` 汇总；样例文件已在验证后删除。

web 实际渲染未能启动：Expo web 基线在 bundling 阶段报既有依赖解析错误，缺少
`react-native-web/dist/exports/DeviceEventEmitter` 与 `AppRegistry`；本轮没有改依赖。
因此 UI 位置以结构守卫通过为准，真机视觉仍待负责人在热更新包上确认。

## 使用反馈门槛

负责人自己用一周观察使用量；一周内点击少于 3 次，就删掉这个入口。
这个指标是产品验收门槛，不是本轮代码测试可以证明的事实。

## 排队中的工单（本轮做完再动，不要并行改内容包）

| | 工单 | 说明 |
|---|---|---|
| 1 | `TICKET-wordfield-zh-38.md`（**待写**） | 38 条中文，日语不动 |
| 2 | `TICKET-wordfield-lv-67.md`（**待写**） | 先重定判据再处理 |
| 4 | `TICKET-mishit-after-value.md` | gloss 误命中率修复后值，已写未发 |
| 5 | `TICKET-correction-entry-minimal.md` | 纠错入口，已写未发 |

## LV 67 条：判据要重定（重要）

外部审核用的判据是「适合作 **N5 主例句**」—— **这个判据是外部给的，不是项目标准。**

项目自己的标准是 `SOUL.md:115`：**目标词突出、短、真实、中文自然、适合朗读跟读**，
以及词卡九标准第 1 条「**真实 —— 不是课本造的**」。

**「超出 N5」不在标准里，「真实」才在。** 按 N5 语法严格过滤，剩下的正好是课本句。
所以这 67 条**多数不该换**，要拆成两类重判：

- **词汇超纲**（`茹でる` `金髪` `小枝`）→ 落，gloss 逐块理解本来就是兜这个的
- **结构超纲且句子长**（复合动词叠敬语、`〜のは〜危険だ`）→ 违反标准里的「短」，换

## 一个未解决的结构问题（记着，不急）

`docs/content-standard-wordfield.md:124` 写的是「**手工精选**两三百个词写词场」。
我们做的是自动选句管线。外部审核标出 47%，某种程度上正是
「自动化替代了手工精选」的可预期结果。**这条以后要正面回答，本轮不处理。**

## 不做

- 不发布、不推 `origin/main`（**merge 到 main = 推线上**）
- 不构建、不发 OTA
- 不改任何一条句子的日文或中文
- 不并行任何其他内容包改动（内容窗口互斥）
