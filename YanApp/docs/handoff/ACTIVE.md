# 当前状态 · PLAN v2 第五批

> 状态：B5-1、B5-2、B5-3 本地实现完成；线上内容包保持 2.3；SQL 尚未执行。
>
> 更新日期：2026-08-23

## 本批完成

- B5-1：默认视图预选口袋 chip，但两种视图都在整本词书上筛选；保留 `sortByTrust` 两段式排序；N5「全部」实测 724 条，今日任务实测 10 条。
- B5-2：拼句提交先显示“对了/错了”；错题可重拼，重拼答对仍按第一次错误结果评分；未改 SRS 算法。
- B5-3：在“收入口袋”按钮旁加入一句自解释文案。

## 验收

- `npm test`：584 passed；`npm run typecheck`：passed。
- `node --test src/features/review/__tests__/produceChoices.test.mjs`：5 passed。
- 本批未修改 `assets/content.fallback.json` 或 `yan-content/content.v2.json`，线上停在 2.3。
- 未修改裸的“词-读音”进度键、`yanFeatures`、`srs.js`、`units.js`、`publication.ts`、`contentSchema.ts`。
- **`schema.word-pocket.sql` 待项目所有者在 Supabase Dashboard → SQL Editor 执行**；不能把仓库文件存在写成云端迁移已完成。

## 当前闭环状态

场景词已绑定，口袋可持久化并可上云；词书筛选与今日任务回归，拼句结果可见且不会因重试刷成 good，口袋按钮有自解释。下一步只做同一位真人的第二次测试，不新增功能。
