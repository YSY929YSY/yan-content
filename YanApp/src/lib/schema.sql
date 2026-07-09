-- 言 YAN · Supabase Schema
-- 在 Supabase Dashboard → SQL Editor 里运行这段

-- 1. 用户资料表
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  created_at timestamptz default now(),
  display_name text,
  avatar_url text
);

alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- 2. 词书学习进度表
create table if not exists word_progress (
  user_id uuid references auth.users on delete cascade not null,
  word_key text not null,
  book_id text not null default 'n5',
  status text not null check (status in ('learning', 'mastered')),
  updated_at timestamptz default now(),
  primary key (user_id, word_key)
);

alter table word_progress enable row level security;

create policy "Users can view own progress"
  on word_progress for select using (auth.uid() = user_id);

create policy "Users can upsert own progress"
  on word_progress for insert with check (auth.uid() = user_id);

create policy "Users can update own progress"
  on word_progress for update using (auth.uid() = user_id);

create policy "Users can delete own progress"
  on word_progress for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 3. 世界打卡:地点足迹 + 手账笔记(2026-07，打卡 v1)
-- ─────────────────────────────────────────────────────────────
create table if not exists place_checkin (
  user_id uuid references auth.users on delete cascade not null,
  place_id text not null,
  status text not null check (status in ('been', 'wish')),
  note text,                          -- 手账文字笔记
  photo_path text,                    -- Storage 里的照片路径(见下方 bucket)
  updated_at timestamptz default now(),
  primary key (user_id, place_id)
);

alter table place_checkin enable row level security;

create policy "Users can view own checkin"
  on place_checkin for select using (auth.uid() = user_id);
create policy "Users can insert own checkin"
  on place_checkin for insert with check (auth.uid() = user_id);
create policy "Users can update own checkin"
  on place_checkin for update using (auth.uid() = user_id);
create policy "Users can delete own checkin"
  on place_checkin for delete using (auth.uid() = user_id);

-- 4. 打卡照片 Storage 桶
--    在 Supabase Dashboard → Storage 新建 private bucket: checkin-photos
--    然后运行以下 policy(照片按 user_id 分文件夹，各人只能管自己的)：
--    路径约定: {user_id}/{place_id}.jpg
create policy "Users manage own checkin photos"
  on storage.objects for all
  using (bucket_id = 'checkin-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'checkin-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─────────────────────────────────────────────────────────────
-- 5. 世界打卡 v2:用户自定义地点 + 多次旅行记录 + 3D 地球轨迹
--    这部分用于后续“添加任意地点”“照片 EXIF 时间/GPS”“点亮地球”。
--    现有 place_checkin 继续作为推荐地点的轻量状态表。
-- ─────────────────────────────────────────────────────────────
create table if not exists user_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  city text,
  country text,
  lat double precision,
  lng double precision,
  lang text,
  phrase text,
  phrase_translation text,
  source text not null default 'manual' check (source in ('manual', 'photo_exif', 'official_seed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

alter table user_places enable row level security;

create policy "Users can view own places"
  on user_places for select using (auth.uid() = user_id);
create policy "Users can insert own places"
  on user_places for insert with check (auth.uid() = user_id);
create policy "Users can update own places"
  on user_places for update using (auth.uid() = user_id);
create policy "Users can delete own places"
  on user_places for delete using (auth.uid() = user_id);

create table if not exists travel_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  place_id text,                         -- 官方 mapPlaces id，可为空
  user_place_id uuid references user_places on delete set null,
  title text not null,
  date_taken timestamptz,
  lat double precision,
  lng double precision,
  note text,
  phrase text,
  phrase_translation text,
  lang text,
  source text not null default 'manual' check (source in ('manual', 'photo_exif', 'official_place')),
  sync_status text not null default 'synced' check (sync_status in ('local', 'pending', 'synced', 'error')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

alter table travel_checkins enable row level security;

create policy "Users can view own travel checkins"
  on travel_checkins for select using (auth.uid() = user_id);
create policy "Users can insert own travel checkins"
  on travel_checkins for insert with check (auth.uid() = user_id);
create policy "Users can update own travel checkins"
  on travel_checkins for update using (auth.uid() = user_id);
create policy "Users can delete own travel checkins"
  on travel_checkins for delete using (auth.uid() = user_id);

create table if not exists travel_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  checkin_id uuid references travel_checkins on delete cascade not null,
  storage_path text not null,
  width integer,
  height integer,
  exif_taken_at timestamptz,
  exif_lat double precision,
  exif_lng double precision,
  created_at timestamptz default now()
);

alter table travel_photos enable row level security;

create policy "Users can view own travel photos"
  on travel_photos for select using (auth.uid() = user_id);
create policy "Users can insert own travel photos"
  on travel_photos for insert with check (auth.uid() = user_id);
create policy "Users can update own travel photos"
  on travel_photos for update using (auth.uid() = user_id);
create policy "Users can delete own travel photos"
  on travel_photos for delete using (auth.uid() = user_id);

create index if not exists travel_checkins_user_time_idx
  on travel_checkins (user_id, date_taken desc nulls last);

create index if not exists travel_checkins_user_geo_idx
  on travel_checkins (user_id, lat, lng)
  where lat is not null and lng is not null and deleted_at is null;

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on table public.place_checkin to anon, authenticated;
grant select, insert, update, delete on table public.user_places to anon, authenticated;
grant select, insert, update, delete on table public.travel_checkins to anon, authenticated;
grant select, insert, update, delete on table public.travel_photos to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. 打卡仪式时刻(2026-07,「在这里」按下的那一秒)
--    已建表的运行这条迁移;新建表的可忽略(上面 create table 已含则跳过)
-- ─────────────────────────────────────────────────────────────
alter table place_checkin add column if not exists checked_in_at timestamptz;
