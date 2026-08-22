-- 言 · 口袋上云(2026-08)
-- 在 Supabase Dashboard → SQL Editor 里整段粘贴运行。可重复运行,不会报错。
--
-- 背景:口袋是用户**亲手挑**进来的词。它和「今日批次」不一样 ——
-- 那个能从 wordbankProgress 完整重算,所以不补传;口袋算不出来,
-- 丢了就是永久丢了。
--
-- 为什么必须上云而不是只存本机:登录换账号**只有一次迁移机会**。
-- Apple 登录走 signInWithIdToken,匿名 uid 直接被丢弃,挂在旧 uid 下的行
-- 全部成为孤儿(见 src/lib/sync.js 的 backfillAll 注释)。
-- 打卡日期和手账备注已经因为同一个原因栽过一次:代码没错,
-- 只是那份数据从来没被补传,用户登录之后就没了,而且不自愈。
--
-- word_key 沿用**裸的「词-读音」**,和 word_progress 完全一致。
-- 不加前缀 —— 线上用户的 yan_wordbank_progress 和云端 word_progress
-- 都是这个格式,口袋要能和它们对得上。
--
-- 移出口袋 = 删除这一行,不做软删除。
-- 代价写在客户端注释里:补传是并集(本机 ∪ 云端),只发生在登录那一次;
-- 之后每次入袋/移出立即 push、启动时 pull 覆盖本地。
-- 已知局限:并集那一次之后,如果在 A 机移出、B 机还没 pull 就 push,词会复活。
-- 当前接受这个代价(单设备),但它是取舍不是 bug,所以写在这里而不是藏起来。
--
-- 不建额外索引:主键 (user_id, word_key) 本身就是 btree,
-- 「拉我的整个口袋」走的正是它的前缀。口袋是几十条量级,不是几千条。

create table if not exists word_pocket (
  user_id  uuid references auth.users on delete cascade not null,
  word_key text not null,
  added_at timestamptz default now(),
  primary key (user_id, word_key)
);

alter table word_pocket enable row level security;

-- 四条策略各限本人,和 word_progress 同一套口径。
-- ⚠️ 每条 create policy 前面都要有**完全对应**的 drop policy if exists,
-- 否则重复执行会报错、整段脚本从那一行往下全不执行。
-- schemaIdempotent.test.mjs 逐条比对策略名和表名,写不对会红。

drop policy if exists "Users can view own pocket" on word_pocket;
create policy "Users can view own pocket"
  on word_pocket for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own pocket" on word_pocket;
create policy "Users can insert own pocket"
  on word_pocket for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own pocket" on word_pocket;
create policy "Users can update own pocket"
  on word_pocket for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own pocket" on word_pocket;
create policy "Users can delete own pocket"
  on word_pocket for delete using (auth.uid() = user_id);
