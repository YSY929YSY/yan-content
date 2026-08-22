# 工单 · PLAN v2 第四批（口袋上云 + commit 13）

> 上位文件：`docs/PLAN-execution-2026-08-22.md`
> 前三批：batch1（六个 commit）、batch2（内容窗口，2.2）、batch3（commit 12/14/15/16，内容 2.3 已发布上线）
>
> **当前树是红的**：`storage.test.mjs` 的「user 类数据必须参与登录补传」失败。
> 本批第一件事就是把它修绿，在那之前不要提交任何新功能。

## 为什么做这一批

commit 14 把口袋登记成 `kind: 'user', backfill: null`（`src/lib/storage.js:47`）——两者矛盾，仓库自己的守卫拦下了。

这条守卫不是洁癖。`src/lib/sync.js:161` 那段注释写着后果：

> **登录换账号只有这一次迁移机会**。Apple 登录走 `signInWithIdToken`，匿名 uid 直接被丢弃，挂在旧 uid 下的行全部成为孤儿。

也就是说：用户攒了一口袋词，一登录，全留在旧账号里，**而且不自愈**。
打卡日期和手账备注已经因为同一个原因栽过一次。

项目所有者已决定：**口袋上云**（方案 A）。不采用「改成 device 蒙混过关」——口袋是用户亲手攒的、算不出来的东西，标成 device 是撒谎。

## 照着现成的走，不要发明新结构

口袋同步完全可以复用 `word_progress` 那条链路的形状：

| 环节 | 现成的参照 | 位置 |
|---|---|---|
| 建表 + RLS | `word_progress` | `src/lib/schema.sql:27-49` |
| 加列/建索引的幂等写法 | `schema.word-srs.sql` | `src/lib/schema.word-srs.sql` |
| 单条推送 | `pushProgress()` | `src/lib/sync.js:27` |
| 登录补传 | `backfillProgress()` | `src/lib/sync.js:60` |
| 启动拉取 | `pullProgress()` | `src/lib/sync.js:236` |
| 域接线 | `backfillAll()` 里的 `run('progress', …)` | `src/lib/sync.js:166` |

---

## Commit 17 · 建表 SQL（✅ 已完成，commit `3696a79`）

> **这一条已经做完了，不要重做、不要改动那两个文件。**
> `src/lib/schema.word-pocket.sql` 已写好并挂进 `schema.apply-all.sql`，
> `schemaIdempotent.test.mjs` 四条全绿。项目所有者正在 Supabase 执行。
> 下面保留原始要求，供复核用。

- 新增 `src/lib/schema.word-pocket.sql`：

```
create table if not exists word_pocket (
  user_id  uuid references auth.users on delete cascade not null,
  word_key text not null,
  added_at timestamptz default now(),
  primary key (user_id, word_key)
);
```

  加 `enable row level security` 与四条策略（select / insert / update / delete，各限本人）。
- ⚠️ **必须幂等**：每条 `create policy` 前面都要有**完全对应**的 `drop policy if exists "…" on word_pocket;`。
  `schemaIdempotent.test.mjs` 会逐条比对策略名和表名，写不对会红。
- 把新文件挂进 `src/lib/schema.apply-all.sql`。
- 顶部注释按仓库惯例写清楚：这张表存什么、为什么 `word_key` 沿用裸的 `词-读音`、旧行怎么办。
- 验收：`npm test` 里 `schemaIdempotent.test.mjs` 全绿。

### ⚠️ 这一步之后有一个只有项目所有者能做的动作

**把 `schema.word-pocket.sql` 拿到 Supabase Dashboard → SQL Editor 里跑一遍。**

不跑的后果是这个仓库已经栽过两次的那种：`word_progress` 的五列、`place_checkin.checked_in_at` 都是「迁移文件躺在仓库里从没跑过」——**不报错、不提示，只在真机日志里留一行 warn**，云端同步实际是停的。

Codex 不要假设它跑过，也不要在报告里写成「已完成」。写成「待项目所有者执行」。

## Commit 18 · 同步三件套 + 域接线（把树修绿）

- `src/lib/sync.js` 新增：
  - `pushPocket(wordKey, inPocket)` —— 入袋 upsert 一行，移出 delete 一行
  - `backfillPocket(pocketList)` —— 登录后把本机口袋整体补传，**分批 upsert**（照 `backfillProgress` 的 400 一批）
  - `pullPocket()` —— 拉取云端口袋
- `src/lib/storage.js:47` 把 `backfill: null` 改成 `backfill: 'pocket'`
- `backfillAll()` 里加 `run('pocket', …)`，**必须用 `readJsonResult` 的 fail-closed 写法**：
  读不到时返回 `{ count: 0, error: '读不到本机口袋,保留 pending 下次重试' }`，
  **绝不能报成功** —— 报成功会把 pending 清掉，而迁移机会只有一次（`sync.js:159-165` 那段注释说的就是这个）。
  「确实没有」照旧返回 `count: 0, error: null`。
- **合并语义要写死在注释里**（这是取舍，不是 bug）：
  - 补传是**并集**（本机 ∪ 云端），只发生在登录那一次
  - 之后每次入袋/移出立即 push，启动时 pull 覆盖本地
  - **已知局限**：并集那一次之后，如果用户在 A 机移出、B 机还没 pull 就 push，词会复活。当前接受这个代价，**但必须写进注释**，不要假装没有
- 验收：
  - `storage.test.mjs` 的「user 类数据必须参与登录补传」**转绿**
  - 「backfill 域名和 backfillAll 里实现的域一致」仍绿
  - `npm test` **582 全绿**（当前是 581/1）
  - `npm run typecheck` 干净

## Commit 19 · 口袋 UI 接上同步

- `App.js` 入袋/移出的动作接 `pushPocket`；启动的拉取链路接 `pullPocket`
- ⚠️ **push 失败不能让界面显示成功**（和 `writeGuard` 同一条原则）。离线时本地照常可用，等下次补
- ⚠️ 键仍是裸的 `词-读音`，不加前缀
- 验收：入袋 → 杀进程 → 重开仍在；断网入袋不报假成功；老用户 SRS 进度零变化

## Commit 20 · L-T2b 词书默认视图（batch3 里被堵住的那个）

- 内容 2.3 已上线（`publication.learning` 579），前置条件已满足
- 文件：`App.js` 的 `WordBankScreen`；复用 `sceneWords.js` / `meaningTrust.js` / `pocket.js`
- 做：默认视图改为「口袋（空则显示场景词）」；场景词按 `meaningTrust()` 两段式排 —— 审过的在前，机器稿在后
- **绝不删除**：搜索、全量词库入口、五本词书入口、四个筛选、「仅词典」标记
- 验收：搜索仍可用；全量词库两步内可达；进度键零改动

---

## 不变量

- 不改进度键格式（裸的 `词-读音`）
- 不改 `srs.js` 评分、不改 `units.js`、不改 `publication.ts`、不改 `contentSchema.ts`
- 不改 `yanFeatures`，不给任何词加 `kanji_anchor`（今日任务池仍是 563）
- **本批不碰内容包**（`content.fallback.json` / `content.v2.json` 都不动，线上停在 2.3）
- 不拆 `App.js`，不许顺手重构
- 用户可见文案不出现内部状态词
- 每个 commit：`npm test && npm run typecheck` 两条绿

## 做完写哪里

1. `docs/handoff/ACTIVE.md` —— 覆盖成本轮状态，**必须明确写出「schema.word-pocket.sql 待项目所有者在 Supabase 执行」**
2. `docs/handoff/CC-REPORT.md` —— 追加「PLAN v2 第四批」：
   - 那条失败测试是怎么修的（改了什么、为什么这样修）
   - 口袋同步的合并语义与已知局限（并集那一次、移出可能复活）
   - 断网/读盘失败时的行为验证
   - commit 20 之后闭环四个零件的实际状态
   - 你想改但忍住没改的地方

## 本批之后

闭环齐了。下一步**不是继续加功能**，是 `PLAN-execution-2026-08-22.md` §7 第 5 条：

> 找一个没看过这个 App 的真人，不给任何解释，看他能不能 10 分钟走完
> 「进场景 → 入袋 → 拼句 → 从复习跳回场景」。

在那之前不要开 P1（第二个场景、第二种题型、词场内容、综合挑战）。
