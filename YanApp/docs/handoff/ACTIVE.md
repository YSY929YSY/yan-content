# 当前状态 · PLAN v2 第一批（commit 1–6）

> 状态：已完成，六个本地 commit 已形成；未 push。
>
> 当前工单：`docs/handoff/TICKET-plan-v2-batch1.md`
>
> 更新日期：2026-08-22

本轮按上位 plan 先读主 plan，再按工单必读顺序执行。三条线均只做代码/统计基础设施，未进入内容窗口；`assets/content.fallback.json` 未修改，进度键格式未修改。

## 六个 commit

1. `37dce0e` — 统计脚本先建立可复跑基线。
2. `085d939` — 下架无证据的“高频”和官方 JLPT 暗示，改为学习分级，并把来源说明接到两步可达的数据来源页。
3. `695dd3e` — 让场景词筛选成为可测试的纯函数，避免 UI 接线前再猜标签口径。
4. `c9345c7` — 释义可信度改由显式字段决定，缺字段保守降为机器稿。
5. `cddedb2` — 防止字符串包含计数被当作可比较的使用证据，同时保留 df=0 与 df=null 的差别。
6. `e77659c` — 含维基的两方组合不再伪装成独立双源，并登记三条 pitch lineage。

## 验收

- 每个 commit 在提交前均通过 `npm test && npm run typecheck`。
- 最终全量：582 tests passed，`npm run typecheck` passed。
- 未开始 commit 7–11 内容窗口；下一步是内容窗口，需另行持有 `assets/content.fallback.json` 锁并按窗口顺序执行。

## 明确未做

未修改 `assets/content.fallback.json`、`srs.js`、`units.js`、`publication.ts`、`contentSchema.ts`，未拆 `App.js`，未改裸的 `词-读音` 进度键，未扩 `publication.learning` 池。
