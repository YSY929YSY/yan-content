-- 言 · 旅行小本子云端备份
-- 在 Supabase Dashboard → SQL Editor 里整段粘贴运行。可重复运行,不会报错。
--
-- 背景:旅行册、行程、账目、预算、上传的订单图全部只在 AsyncStorage
-- (key `yan_trip_notebook_v1`)。换手机、删 App、系统清缓存 —— 全丢。
-- 而首屏一度承诺「数据云端同步」。
--
-- 方案:整块 JSON 存一行,不拆表。理由:
--   · 这份数据只有本人读写,没有跨用户查询需求
--   · 结构还在演进(旅行册/现场口袋/预算都在改),拆表会被 schema 迁移拖住
--   · 共享账本已经有自己的规范化表(trip_ledgers 等),这里只管本机那份

create table if not exists trip_notebooks (
  user_id     uuid primary key references auth.users on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  -- 客户端本地的最后修改时间。用来判断「云端的比本地新吗」,
  -- 不能用 updated_at:那是服务器写入时间,离线改动会显得比实际晚。
  device_rev  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table trip_notebooks enable row level security;

-- 只能读写自己那行
drop policy if exists trip_notebooks_own on trip_notebooks;
create policy trip_notebooks_own on trip_notebooks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table trip_notebooks is
  '旅行小本子的整块备份(旅行册/行程/账目/预算)。每用户一行,只有本人可读写。';
comment on column trip_notebooks.device_rev is
  '客户端本地最后修改时间;云端比本地新才覆盖本地,避免旧设备把新数据顶掉。';
