# 当前状态 · PLAN v2 第二批（commit 7–10）

> 状态：本地实现与审计完成；远端发布等待对具体 `origin/main` 目标的明确授权。
>
> 更新日期：2026-08-22

## 已完成

- `556e96a` commit 7：只改 `order.notes.es` 一条，把无证据词源断言改为标明的记忆联想。
- `9171af3` commit 8：按“词面+读音”精确 join；自动通过 503，冲突 0，未命中 41；只回写自动通过批。
- `9d4e92b` commit 9：便利店标签从 23 到 35；10 条短句与 6 条对话均绑定 `core_vocab`，加入引用 ID 校验。
- `8160b00`：版本从 2.1 只递增到 2.2，并追加一次发布 changelog。
- `dd8bb4a` commit 10：W-T3 释义审阅包、W-T4 8 条词场候选及机器审计脚本进入 `staging/`，未改内容包。

## 验收与锁

- 每个内容 commit 前后均运行 `node scripts/content-stats.mjs`；`publication.learning` 始终为 563。
- 最终 `npm test`：582 passed；`npm run typecheck`：passed。
- W-T4 审计：8 candidates，0 errors。
- 发布前审计：schema、fallback 同步、wordBank、places 均通过，Blocker 0。
- 未修改 `srs.js`、`units.js`、`publication.ts`、`contentSchema.ts`、`App.js`，未改裸的“词-读音”进度键。

## 当前阻塞

`bash scripts/push-content.sh` 的目标是 `git@github.com:YSY929YSY/yan-content.git` 的 `origin/main`；审批要求产品负责人明确授权这个具体远端目标后才能执行。尚未声称完成真机拉包验证。

## 下一步

完成远端发布后，真机拉新包验证内容缓存与进度键不变；下一张工单继续按主 plan 处理 commit 11–15。
