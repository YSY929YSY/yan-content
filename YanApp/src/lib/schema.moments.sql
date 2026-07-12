-- 言 YAN · 旅行瞬间(Moments)采集层 + 语义层
-- ⚠️ 草稿:旅行结束、做相册导入功能时再在 Supabase SQL Editor 运行。
-- 设计文档:docs/travel-moments-design.md
--
-- 铁律:
--   1. moments / moment_photos(采集层)只加字段,永不改名/删除/迁移
--   2. 照片写入 Storage 一次,路径永不移动
--   3. moment_tags(语义层)是注解,可随意增删,不伤原始数据

-- ─────────────────────────────────────────────
-- 采集层:瞬间
-- ─────────────────────────────────────────────
create table if not exists moments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  taken_at timestamptz,                    -- EXIF 拍摄时间(导入)或记录时间(App 内)
  lat double precision,
  lng double precision,
  text text,                               -- 一句话,可空
  phrase jsonb,                            -- 可选短语引用 { "jp": "...", "zh": "...", "lang": "ja-JP" }
  source text not null default 'in_app'
    check (source in ('camera_import', 'in_app', 'manual')),
  created_at timestamptz default now(),
  deleted_at timestamptz                   -- 软删,永不硬删
);
create index if not exists moments_user_time_idx
  on moments (user_id, taken_at desc nulls last) where deleted_at is null;

create table if not exists moment_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  moment_id uuid references moments on delete cascade not null,
  storage_path text not null,              -- 写入一次,永不移动。约定: {user_id}/moments/{moment_id}/{n}.jpg
  width integer,
  height integer,
  exif_taken_at timestamptz,
  exif_lat double precision,
  exif_lng double precision,
  created_at timestamptz default now()
);
create index if not exists moment_photos_moment_idx on moment_photos (moment_id);

-- ─────────────────────────────────────────────
-- 语义层:注解标签(事后贴,可重建)
-- kind 约定(只增不改):
--   place       → value = mapPlaces 的 place_id(即「点亮」该地点)
--   trip        → value = 旅行册 id
--   category    → value = volcano/forest/... 分类
--   serendipity → value = 'auto' | 'user'(计划之外的偶遇;GPS 离当日行程远时自动标)
--   mood        → value = 自由文本
-- ─────────────────────────────────────────────
create table if not exists moment_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  moment_id uuid references moments on delete cascade not null,
  kind text not null,
  value text not null,
  created_at timestamptz default now(),
  unique (moment_id, kind, value)
);
create index if not exists moment_tags_kind_idx on moment_tags (user_id, kind, value);

-- ─────────────────────────────────────────────
-- RLS:全部按 user_id 私有(与 word_progress 同款)
-- ─────────────────────────────────────────────
alter table moments enable row level security;
alter table moment_photos enable row level security;
alter table moment_tags enable row level security;

create policy "own moments" on moments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own moment photos" on moment_photos for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own moment tags" on moment_tags for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.moments to anon, authenticated;
grant select, insert, update, delete on table public.moment_photos to anon, authenticated;
grant select, insert, update, delete on table public.moment_tags to anon, authenticated;

-- ─────────────────────────────────────────────
-- 古法手账:用户拼贴的页(创作数据,按采集层同级保护)
-- 言不排版,言备料——页面由用户拼贴,系统只存元素和变换
-- ─────────────────────────────────────────────
create table if not exists journal_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  trip_id text,                            -- 归属旅行册,可空
  page_date date,                          -- 这页写的是哪天,可空
  bg text not null default 'paper',        -- 页面底纹
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz                   -- 软删,永不硬删
);
create index if not exists journal_pages_user_idx
  on journal_pages (user_id, created_at desc) where deleted_at is null;

create table if not exists journal_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  page_id uuid references journal_pages on delete cascade not null,
  kind text not null check (kind in ('cutout', 'scan', 'photo', 'polaroid', 'tape', 'seal', 'stamp', 'badge', 'text', 'ink')),
  -- 进入路径: cutout=提取抠图(透明背景) · scan=扫描凭证(留原纸) · photo/polaroid=整图上传
  -- 素材: tape=胶带 · seal=印章 · stamp=邮票框 · badge=AI纪念章 · text=文字/手写体 · ink=涂画笔迹
  asset_path text,                         -- Storage 路径(资产类元素)
  moment_id uuid references moments on delete set null,  -- 溯源到瞬间,可空
  payload jsonb,                           -- kind 专属数据(如 tape 颜色、未来的文字内容)
  x double precision not null default 0.5, -- 相对坐标 0~1
  y double precision not null default 0.5,
  scale double precision not null default 1,
  rotation double precision not null default 0,
  z integer not null default 0,
  created_at timestamptz default now()
);
create index if not exists journal_items_page_idx on journal_items (page_id, z);

alter table journal_pages enable row level security;
alter table journal_items enable row level security;
create policy "own journal pages" on journal_pages for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own journal items" on journal_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on table public.journal_pages to anon, authenticated;
grant select, insert, update, delete on table public.journal_items to anon, authenticated;

-- Storage:新建 private bucket `moment-photos`,路径 {user_id}/moments/...
--         贴纸等派生资产放 {user_id}/stickers/...(同 bucket,原图永不动)
create policy "own moment photo files" on storage.objects for all
  using (bucket_id = 'moment-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'moment-photos' and (storage.foldername(name))[1] = auth.uid()::text);
