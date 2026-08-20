# 工单：P0-1 Commit 3 · publication 行为接入

> 实现者：Codex
> 复核者：CC（短审）
> 状态：已完成（含真机验收）
> 前置：Commit 1 selector 与 Commit 2 内容迁移已提交

## 为什么现在做

内容包已经用显式 `publication` 表示“可查 / 可学习”，但 App 仍以例句是否齐全推断“可不可以学习”。这会让 migration 只停在数据层：未获 Learning 准入的词仍能通过搜索、词书列表、今日/到期视图或详情按钮进入 SRS。

本提交的目标不是补内容，更不是判断真实性；它只让已经落盘的产品决定真正生效，并保护旧用户已有的复习记录。

## 已确认产品规则

1. `isDictionaryEntry` 决定可查，`canIntroduceWord` 决定能否作为新学习内容引入。
2. 无 Learning 且无旧 record 的词可以查看，但不显示评分入口。
3. 无 Learning 但有旧 record 的词仍可评分、复习；收紧发布规则不能清理用户历史。
4. 守门在详情页是否传入 `onGrade`，不能只靠列表过滤，也不能把 publication 判断塞进通用 `grade()`。
5. 主线候选是 `anchorPool(...)` 与 `canIntroduceWord` 的交集。
6. UI 用“可查 / 可学习 / 仅词典”，不再使用“定稿 / 起草”。“仅词典 · 暂无例句”是一个合成标签，不并排堆两个标签。

完整决定见 `DECISIONS.md` §D1–D3。

## 允许改动

- `App.js`：导入 selector，替换旧准入/展示口径，封住详情评分入口，更新相应中文文案和样式名；
- `src/lib/__tests__/publication-wiring.test.mjs`：新增接线回归测试；
- `docs/handoff/ACTIVE.md`、本工单、`ROADMAP-STATUS.md`、`CC-REPORT.md`：实施和复核记录。

## 禁止事项

- 不改两份内容 JSON、迁移脚本、publication selector 契约或 `grade()`；
- 不做“加入我的词”、manual save、来源核验、词书重构或拆 `App.js`；
- 不改变既有 progress 的数据结构或清理旧 record；
- 不因本轮方便而扩大词场成员的查找范围；
- 不 push / 不发布远端 raw content。

## 影响路径与实现点

| 路径 | 现状风险 | 必须的接入 |
|---|---|---|
| 首页 TodayCard | `anchorPool` 单独作为主线 | `anchorPool(...).filter(canIntroduceWord)` |
| 丿页今日批次 | 同上 | 同上 |
| 词书每日 session | 例句完整度决定候选 | 仅 `canIntroduceWord` 入新 session |
| 词书默认列表 | 例句完整度决定展示 | 默认仅显示可学习词；“浏览词典”显式展示可查词 |
| today / due | 可打开旧 record 的词 | 视图可以展示，但详情评分仍由 `canGradeWord` 决定 |
| 全库搜索详情 | 当前无条件传 `onGrade` | 只有 `canGradeWord(entry, record)` 才传 |
| 词场成员详情 | 列表过滤无法保护跳转 | 同一详情守门；不改成员检索范围 |

## UI 文案验收

- 书架和词书头部明确显示“可查 / 可学习”；
- 无可学习词的空态：`开放词典查询，学习内容正在分批核验`，按钮：`浏览词典`；
- 可查但不可学的列表项显示 `仅词典`；若无完整例句显示 `仅词典 · 暂无例句`；
- 只读详情显示 `仅供查询，暂未开放学习`；若无完整例句，详情可以另显示 `暂无例句`；
- 没有 `onGrade` 时不渲染任何评分或“这个词不用再问我了”按钮。

## 验收

1. 开工前 `npm test` 与 `npm run typecheck` 为绿；记录基线。
2. 新接线测试覆盖：不再有 `isDraftedWord`；两条主线均过滤新词；session 与默认词书列表使用 `canIntroduceWord`；两个详情入口均以 `canGradeWord` 条件传递 `onGrade`；详情组件在无 `onGrade` 时不渲染评分区。
3. 纯 selector 测试继续证明 dictionary-only + old record 可评分，而无 record 不可评分。
4. 最终 `npm test`、`npm run typecheck` 均绿；审计 `git diff`，确认不含内容 JSON、迁移脚本或 progress 清理。

## CC 短审问题

1. `App.js` 是否彻底移除了以例句推断准入的 `isDraftedWord`？
2. 搜索、词书详情与词场成员跳转是否都通过同一 `canGradeWord` 规则？
3. dictionary-only + old record 是否仍能传 `onGrade`？无 old record 是否不传？
4. 主线、session、默认列表是否只引入 `canIntroduceWord`？
5. 是否有越界改动或把“兼容 migration”文案夸大为真实性核验？

## Codex 实现记录

- `App.js` 移除了 `isDraftedWord`、`showDrafts`、`draftTag` 与相应“起草/定稿”语义；
- TodayCard 与 PieTab 主线均为 `anchorPool(...).filter(canIntroduceWord)`；
- 新建词书 session 与默认词书列表均只引入 `canIntroduceWord`；“浏览词典”显示可查词；today/due 额外保留已有 record 的历史项；
- 搜索详情与词书（含词场成员跳转）详情均以 `canGradeWord(entry, record)` 条件传 `onGrade`；详情页无 `onGrade` 时评分、mastered 按钮整体不渲染；
- 新增 `src/lib/__tests__/publication-wiring.test.mjs`，覆盖上述接线；纯 selector 的 record 例外仍由既有 `publication.test.mjs` 覆盖。

基线：`npm test` 540/540，`npm run typecheck` exit 0。
实现后：`npm test` 546/546，`npm run typecheck` exit 0，`git diff --check` exit 0。

未改内容 JSON、`tools/stamp-wordbank-publication.py`、`publication.ts`、SRS/progress 数据结构或 `grade()`；已提交为 `0ff8d67`，未 push。

## CC 短审结论（2026-08-20）

**通过，无阻塞项，可以 commit。**

- Q1：`App.js` 中 `isDraftedWord`、`showDrafts`、`draftTag`、“起草”、“定稿”均为 0 命中；
- Q2：评分守门只有搜索详情与词书详情两处，均为 `canGradeWord`；词场成员跳转复用词书详情守门，不是第三套评分入口；
- Q3：独立逻辑验证：真实 dictionary-only 词无 record 为 false、有 record 为 true；可学习词无 record 为 true；
- Q4：两条主线、词书 session、默认列表均确认已接入 `canIntroduceWord`；
- Q5：未修改内容 JSON、迁移器或 `publication.ts`，迁移文案未夸大为真实性核验。

CC 另做三项篡改验证：移除词书详情守门、移除主线交集、移除默认列表过滤均使新增接线测试失败；源码已还原。复跑 `npm test` 546/546、typecheck、eslint App.js、`git diff --check` 均通过。
