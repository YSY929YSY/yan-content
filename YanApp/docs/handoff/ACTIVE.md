# 当前状态 · PLAN v2 第四批（commit 17–20）

> 状态：本地实现完成，线上内容包保持 2.3；SQL 尚未执行。
>
> 更新日期：2026-08-22

## 本批提交

- `3696a79` commit 17：新增 `schema.word-pocket.sql` 并挂入 `schema.apply-all.sql`；四条 RLS policy 均有完全对应的 drop。
- `5c68eb5` commit 18：修复口袋 `user`/补传域矛盾，加入 push/backfill/pull 与 `backfillAll` fail-closed 接线；树由 581/1 恢复为 582/582。
- `baf8e7d` commit 19：口袋 UI 接本地写入、启动远端拉取和入袋/移出 push；断网时保留本地并显示待同步说明。
- `e36956f` commit 20：词书默认显示口袋，口袋为空退回场景词；按释义可信度分两段排序，保留浏览全库入口。

## 验收

- 最终 `npm test`：582 passed；`npm run typecheck`：passed。
- 本批未修改 `assets/content.fallback.json` 或 `yan-content/content.v2.json`，线上停在 2.3。
- 未修改裸的“词-读音”进度键、`yanFeatures`、`srs.js`、`units.js`、`publication.ts`、`contentSchema.ts`。
- **`schema.word-pocket.sql` 待项目所有者在 Supabase Dashboard → SQL Editor 执行**；不能把仓库文件存在写成云端迁移已完成。

## 当前闭环状态

场景词已绑定，口袋可持久化并可上云，已有 produce 单元支持拼句，复习卡可回到原场景句；词书默认从口袋/场景词开始，两段排序后仍可浏览全库。下一步不是继续加功能，而是找未看过 App 的真人走完“进场景 → 入袋 → 拼句 → 从复习跳回场景”的 10 分钟测试。
