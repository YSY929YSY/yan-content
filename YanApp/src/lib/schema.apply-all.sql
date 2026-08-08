-- 言 · 全量补丁(自动生成,勿手改 —— 改各自的 schema.*.sql 再重新生成)
--
-- 怎么用:Supabase Dashboard → SQL Editor → 整段粘贴 → Run。
-- **随时可以重跑**,跑几次结果都一样。不确定数据库是不是最新的时候,跑一遍就是了。
--
-- 为什么要有这个文件:
-- 在这之前有 11 个 .sql 散在 src/lib,没有任何执行记录 —— 谁也不知道哪几个跑过。
-- 代价是真实发生过的:
--   · word_progress 的 box/due_at 等五列没跑,间隔复习的云端同步整个静默停摆
--   · place_checkin.checked_in_at 没跑,而「旅迹」那条弧线就是按打卡日期画的 ——
--     日期从来没上过云,换机就没了。代码早就修好了,数据库这列没跟上,等于修了个寂寞
-- 两次都不报错、不提示,只在真机日志里留一行 warn。
--
-- 所以这里不做「迁移记录表」那一套 —— 对单人项目,让每条语句都能重复执行、
-- 然后无脑重跑,比维护一张「跑过哪些」的表更难出错。
-- 前提是每个文件都幂等(create ... if not exists / drop policy if exists 打头),
-- 有测试守着这一点,见 src/lib/__tests__/schemaIdempotent.test.mjs。


-- ══════════════════════════════════════════════════════
-- schema.sql
-- ══════════════════════════════════════════════════════
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

drop policy if exists "Users can view own profile" on profiles;
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on profiles;
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

drop policy if exists "Users can view own progress" on word_progress;
create policy "Users can view own progress"
  on word_progress for select using (auth.uid() = user_id);

drop policy if exists "Users can upsert own progress" on word_progress;
create policy "Users can upsert own progress"
  on word_progress for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own progress" on word_progress;
create policy "Users can update own progress"
  on word_progress for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own progress" on word_progress;
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

drop policy if exists "Users can view own checkin" on place_checkin;
create policy "Users can view own checkin"
  on place_checkin for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own checkin" on place_checkin;
create policy "Users can insert own checkin"
  on place_checkin for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own checkin" on place_checkin;
create policy "Users can update own checkin"
  on place_checkin for update using (auth.uid() = user_id);
drop policy if exists "Users can delete own checkin" on place_checkin;
create policy "Users can delete own checkin"
  on place_checkin for delete using (auth.uid() = user_id);

-- 4. 打卡照片 Storage 桶
--    在 Supabase Dashboard → Storage 新建 private bucket: checkin-photos
--    然后运行以下 policy(照片按 user_id 分文件夹，各人只能管自己的)：
--    路径约定: {user_id}/{place_id}.jpg
drop policy if exists "Users manage own checkin photos" on storage;
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

drop policy if exists "Users can view own places" on user_places;
create policy "Users can view own places"
  on user_places for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own places" on user_places;
create policy "Users can insert own places"
  on user_places for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own places" on user_places;
create policy "Users can update own places"
  on user_places for update using (auth.uid() = user_id);
drop policy if exists "Users can delete own places" on user_places;
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

drop policy if exists "Users can view own travel checkins" on travel_checkins;
create policy "Users can view own travel checkins"
  on travel_checkins for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own travel checkins" on travel_checkins;
create policy "Users can insert own travel checkins"
  on travel_checkins for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own travel checkins" on travel_checkins;
create policy "Users can update own travel checkins"
  on travel_checkins for update using (auth.uid() = user_id);
drop policy if exists "Users can delete own travel checkins" on travel_checkins;
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

drop policy if exists "Users can view own travel photos" on travel_photos;
create policy "Users can view own travel photos"
  on travel_photos for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own travel photos" on travel_photos;
create policy "Users can insert own travel photos"
  on travel_photos for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own travel photos" on travel_photos;
create policy "Users can update own travel photos"
  on travel_photos for update using (auth.uid() = user_id);
drop policy if exists "Users can delete own travel photos" on travel_photos;
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

-- ══════════════════════════════════════════════════════
-- schema.trip-ledger.sql
-- ══════════════════════════════════════════════════════
-- 言 YAN · 多人分账(共享账本)Schema
-- 在 Supabase Dashboard → SQL Editor 里整段运行。
-- 设计目标:多台手机通过「加入码」进同一个账本,各自记账,实时/轮询同步。
-- 关键点:这些表不是按 user_id 私有,而是「同一账本的成员都能读写」。
--        所以 RLS 用 is_ledger_member() 判断,加入/建本走 SECURITY DEFINER 的 RPC。

-- ─────────────────────────────────────────────────────────────
-- 1. 账本
-- ─────────────────────────────────────────────────────────────
create table if not exists trip_ledgers (
  id uuid primary key default gen_random_uuid(),
  join_code text unique not null,
  title text not null default '旅行账本',
  currency text not null default '€',
  created_by uuid references auth.users on delete set null,
  created_at timestamptz default now()
);

-- 2. 成员(可以是真实加入的设备,也可以是「名字标签」——朋友还没装 App 时先占个名)
create table if not exists ledger_members (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid references trip_ledgers on delete cascade not null,
  user_id uuid references auth.users on delete set null,   -- 名字标签成员为 null
  display_name text not null,
  is_tag boolean not null default false,                   -- true = 名字标签,尚未真正加入
  created_at timestamptz default now()
);
-- 同一账本里,一个真实用户只能有一条成员记录
create unique index if not exists ledger_members_user_uniq
  on ledger_members (ledger_id, user_id) where user_id is not null;
create index if not exists ledger_members_ledger_idx on ledger_members (ledger_id);

-- 3. 账目
create table if not exists ledger_expenses (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid references trip_ledgers on delete cascade not null,
  created_by uuid references auth.users on delete set null,
  category text,
  title text,
  amount numeric not null default 0,
  payer text not null,                    -- 成员 display_name
  mode text not null default '均分',       -- 均分 / 各自价格 / 特殊项
  note text,
  special boolean not null default false,
  shares jsonb not null default '{}'::jsonb,        -- { "Lyra": 24.4, "Ning": 18.4 }
  special_item jsonb,                                -- { owner, label, amount }
  participants jsonb not null default '[]'::jsonb,   -- ["Lyra","Ning"]
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);
create index if not exists ledger_expenses_ledger_idx
  on ledger_expenses (ledger_id, created_at desc) where deleted_at is null;

-- ─────────────────────────────────────────────────────────────
-- 4. 成员判定 + RLS
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_ledger_member(p_ledger uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from ledger_members m
    where m.ledger_id = p_ledger and m.user_id = auth.uid()
  );
$$;

alter table trip_ledgers enable row level security;
alter table ledger_members enable row level security;
alter table ledger_expenses enable row level security;

-- 账本:成员可读;建/改走 RPC(SECURITY DEFINER 绕过 RLS),这里不开放直接写
drop policy if exists "members read ledger" on trip_ledgers;
create policy "members read ledger" on trip_ledgers
  for select using (is_ledger_member(id));

-- 成员表:同账本成员可读;直接 insert/delete 走 RPC
drop policy if exists "members read members" on ledger_members;
create policy "members read members" on ledger_members
  for select using (is_ledger_member(ledger_id));

-- 账目:同账本成员可读写
drop policy if exists "members read expenses" on ledger_expenses;
create policy "members read expenses" on ledger_expenses
  for select using (is_ledger_member(ledger_id));
drop policy if exists "members insert expenses" on ledger_expenses;
create policy "members insert expenses" on ledger_expenses
  for insert with check (is_ledger_member(ledger_id));
drop policy if exists "members update expenses" on ledger_expenses;
create policy "members update expenses" on ledger_expenses
  for update using (is_ledger_member(ledger_id));

-- ─────────────────────────────────────────────────────────────
-- 5. 建本 / 加入 / 加成员(SECURITY DEFINER RPC)
-- ─────────────────────────────────────────────────────────────

-- 生成 6 位加入码,去掉易混字符(0/O/1/I)
create or replace function public.gen_join_code()
returns text language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from trip_ledgers where join_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.create_ledger(p_title text, p_currency text, p_display_name text)
returns trip_ledgers
language plpgsql
security definer
set search_path = public
as $$
declare
  new_ledger trip_ledgers;
begin
  if auth.uid() is null then
    raise exception '需要先登录';
  end if;
  insert into trip_ledgers (join_code, title, currency, created_by)
  values (gen_join_code(),
          coalesce(nullif(trim(p_title), ''), '旅行账本'),
          coalesce(nullif(trim(p_currency), ''), '€'),
          auth.uid())
  returning * into new_ledger;

  insert into ledger_members (ledger_id, user_id, display_name, is_tag)
  values (new_ledger.id, auth.uid(),
          coalesce(nullif(trim(p_display_name), ''), '我'), false);

  return new_ledger;
end;
$$;

create or replace function public.join_ledger(p_code text, p_display_name text)
returns trip_ledgers
language plpgsql
security definer
set search_path = public
as $$
declare
  target trip_ledgers;
  tag_member ledger_members;
begin
  if auth.uid() is null then
    raise exception '需要先登录';
  end if;
  select * into target from trip_ledgers where join_code = upper(trim(p_code));
  if target.id is null then
    raise exception '加入码不存在';
  end if;

  -- 已经是成员就直接返回
  if exists (select 1 from ledger_members where ledger_id = target.id and user_id = auth.uid()) then
    return target;
  end if;

  -- 如果有个同名的「名字标签」,把它认领为自己(避免重复)
  select * into tag_member from ledger_members
    where ledger_id = target.id and is_tag = true
      and lower(display_name) = lower(trim(p_display_name))
    limit 1;

  if tag_member.id is not null then
    update ledger_members
      set user_id = auth.uid(), is_tag = false
      where id = tag_member.id;
  else
    insert into ledger_members (ledger_id, user_id, display_name, is_tag)
    values (target.id, auth.uid(),
            coalesce(nullif(trim(p_display_name), ''), '我'), false);
  end if;

  return target;
end;
$$;

-- 加一个「名字标签」成员(朋友还没装 App 时先占名)
create or replace function public.add_ledger_tag_member(p_ledger uuid, p_name text)
returns ledger_members
language plpgsql
security definer
set search_path = public
as $$
declare
  new_member ledger_members;
begin
  if not is_ledger_member(p_ledger) then
    raise exception '你不是这个账本的成员';
  end if;
  insert into ledger_members (ledger_id, user_id, display_name, is_tag)
  values (p_ledger, null, coalesce(nullif(trim(p_name), ''), '同行'), true)
  returning * into new_member;
  return new_member;
end;
$$;

-- 我加入的所有账本(用于打开 App 时恢复)
create or replace function public.my_ledgers()
returns setof trip_ledgers
language sql
security definer
set search_path = public
as $$
  select l.* from trip_ledgers l
  join ledger_members m on m.ledger_id = l.id
  where m.user_id = auth.uid()
  order by l.created_at desc;
$$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.trip_ledgers to anon, authenticated;
grant select, insert, update, delete on table public.ledger_members to anon, authenticated;
grant select, insert, update, delete on table public.ledger_expenses to anon, authenticated;
grant execute on function public.create_ledger(text, text, text) to anon, authenticated;
grant execute on function public.join_ledger(text, text) to anon, authenticated;
grant execute on function public.add_ledger_tag_member(uuid, text) to anon, authenticated;
grant execute on function public.my_ledgers() to anon, authenticated;

-- 可选:开启 Realtime(Dashboard → Database → Replication 里把 ledger_expenses / ledger_members 勾上)
-- 客户端也可以退化为轮询(见 tripLedger.js)。

-- ══════════════════════════════════════════════════════
-- schema.trip-ledger.currency.sql
-- ══════════════════════════════════════════════════════
-- 言 · 分账多币种迁移
-- 在 Supabase Dashboard → SQL Editor 里整段粘贴运行。可重复运行,不会报错。
--
-- 背景:一趟旅行常跨币种(爱尔兰 € + 土耳其 ₺)。原来账本只有一个币种设置,
-- 切换只换显示符号、不换算,于是 €240 和 ₺4500 会被直接相加,
-- 结算算出一个看起来正常、实际毫无意义的数字。
-- 方案:每笔账记自己的币种,结算按币种分组、各算各的,不做汇率换算。

alter table ledger_expenses
  add column if not exists currency text;

-- 存量数据:按所属账本的币种回填,避免旧账目落进「未知币种」组
update ledger_expenses e
set currency = l.currency
from trip_ledgers l
where e.ledger_id = l.id
  and e.currency is null;

comment on column ledger_expenses.currency is
  '这笔账的货币符号(€ £ ₺ $ ¥ ₩)。结算按币种分组,不做汇率换算。';

-- ── 结清标记(2026-07-30)────────────────────────────────
-- 结清 = 钱已经还了,不是这笔消费没发生过。
-- 原来「结清」直接删账目,于是「我花了」和预算跟着归零 ——
-- 旅行才到一半,记录先没了。改成打标记:谁欠谁只算未结清的,个人花费算全部。
alter table ledger_expenses
  add column if not exists settled_at timestamptz;

comment on column ledger_expenses.settled_at is
  '这笔已经还过钱的时间。非空则不计入「谁欠谁」,但仍计入个人花费。';

-- ══════════════════════════════════════════════════════
-- schema.trip-notebook.sql
-- ══════════════════════════════════════════════════════
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

-- 表级授权。RLS 只管「哪些行能碰」,GRANT 才管「能不能碰这张表」——
-- 少了它 PostgREST 直接 403,和策略写没写无关。
-- anon 也要授:言用的是匿名登录,大多数用户从头到尾都是 anon 角色。
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.trip_notebooks to anon, authenticated;

comment on table trip_notebooks is
  '旅行小本子的整块备份(旅行册/行程/账目/预算)。每用户一行,只有本人可读写。';
comment on column trip_notebooks.device_rev is
  '客户端本地最后修改时间;云端比本地新才覆盖本地,避免旧设备把新数据顶掉。';

-- ══════════════════════════════════════════════════════
-- schema.moments.sql
-- ══════════════════════════════════════════════════════
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

drop policy if exists "own moments" on moments;
create policy "own moments" on moments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own moment photos" on moment_photos;
create policy "own moment photos" on moment_photos for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own moment tags" on moment_tags;
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
drop policy if exists "own journal pages" on journal_pages;
create policy "own journal pages" on journal_pages for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own journal items" on journal_items;
create policy "own journal items" on journal_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on table public.journal_pages to anon, authenticated;
grant select, insert, update, delete on table public.journal_items to anon, authenticated;

-- Storage:新建 private bucket `moment-photos`,路径 {user_id}/moments/...
--         贴纸等派生资产放 {user_id}/stickers/...(同 bucket,原图永不动)
drop policy if exists "own moment photo files" on storage;
create policy "own moment photo files" on storage.objects for all
  using (bucket_id = 'moment-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'moment-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ══════════════════════════════════════════════════════
-- schema.user-places-visited.sql
-- ══════════════════════════════════════════════════════
-- 言 · 自定义打卡地点补「到访日期」
-- 在 Supabase Dashboard → SQL Editor 里整段粘贴运行。可重复运行。
--
-- 为什么必须单开一列:created_at 是「什么时候记的」,不是「什么时候去的」。
-- 旅行回来一次性补记 10 个地方,created_at 全是同一天 ——
-- 拿它算旅迹会得出「一天飞遍东南亚」这种荒谬结果。
-- 旅迹的一切(按时间排序、两点之间的速度、推测怎么走的)都建立在这一列上。

alter table user_places
  add column if not exists visited_on date;

-- 存量数据:没有到访日期的,先按记录日期回填 ——
-- 不准,但比空着强(空着的点根本进不了旅迹)。用户可以自己改。
update user_places
   set visited_on = created_at::date
 where visited_on is null;

comment on column user_places.visited_on is
  '实际到访日期(不是记录日期)。旅迹按它排序并计算两点间速度。';

-- ══════════════════════════════════════════════════════
-- schema.user-places-note.sql
-- ══════════════════════════════════════════════════════
-- 言 · 自定义打卡地点补 note 列
-- 在 Supabase Dashboard → SQL Editor 里整段粘贴运行。可重复运行。
--
-- user_places 建表时有 phrase/phrase_translation(「这地方的一句话」),
-- 但没有给用户写自己感想的地方。这两件事不一样:
--   phrase = 言给的语言内容
--   note   = 用户自己记的一笔
-- 混用会让以后想区分「谁写的」时说不清,所以单开一列。

alter table user_places
  add column if not exists note text;

comment on column user_places.note is
  '用户自己写的备注。与 phrase(言提供的当地语句)分开,别混用。';

-- 表级授权(RLS 只管哪些行,GRANT 才管能不能碰这张表)。
-- 言用匿名登录,anon 也要授。
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.user_places to anon, authenticated;

-- ══════════════════════════════════════════════════════
-- schema.user-places-photo.sql
-- ══════════════════════════════════════════════════════
-- 言 · 自定义打卡地点补 photo_path 列
-- 在 Supabase Dashboard → SQL Editor 里整段粘贴运行。可重复运行。
--
-- 为什么要它:在这之前,照片是精选地点独有的 —— place_checkin 有 photo_path,
-- user_places 没有。于是产生了两等公民:去了言收录过的地方能留照片,
-- 去了没收录的地方只能留一行字。而用户真实去的地方,大部分不在收录列表里。
--
-- 存的是 Storage 里的路径({user_id}/{place_id}.jpg),不是 URL。
-- 签名 URL 一小时就过期,落库等于存一个注定失效的值 —— 精选地点那边
-- 已经因为这个踩过一次(冷启动满屏裂图),这里不重蹈。

alter table user_places
  add column if not exists photo_path text;

comment on column user_places.photo_path is
  'Storage(checkin-photos)里的路径,不是 URL。签名 URL 一小时过期,每次现签。';

-- 表级授权(RLS 只管哪些行,GRANT 才管能不能碰这张表)。
-- 言用匿名登录,anon 也要授。
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.user_places to anon, authenticated;

-- ══════════════════════════════════════════════════════
-- schema.delete-account.sql
-- ══════════════════════════════════════════════════════
-- 言 · 删除账号
-- 在 Supabase Dashboard → SQL Editor 里整段粘贴运行。可重复运行。
--
-- 为什么要它:Apple App Store 指南 5.1.1(v) 规定,支持创建账号的 App
-- 必须提供「在 App 内删除账号」的入口。言接了 Sign in with Apple,属于此列。
-- 缺这个是明确拒审项,不是"可能被问到"。
--
-- 为什么必须是 SECURITY DEFINER 的数据库函数:
-- 删除 auth.users 里的行需要提权,客户端拿的是 anon key,做不到。
-- 只删业务表而留下 auth 记录,不算真正的删除账号。

create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception '未登录';
  end if;

  -- 业务数据
  delete from word_progress   where user_id = me;
  delete from place_checkin   where user_id = me;
  delete from user_places     where user_id = me;
  delete from trip_notebooks  where user_id = me;
  delete from profiles        where id = me;

  -- 共享账本:只退出自己,不删别人的账本。
  -- 账目里留的是 display_name 而不是 user_id,同行者那边的账要保持完整 ——
  -- 一个人退出不该让另外两个人的账对不上。
  delete from ledger_members  where user_id = me;

  -- 我建的、且已经没有任何成员的账本,连同其账目一起清掉
  delete from ledger_expenses
   where ledger_id in (
     select l.id from trip_ledgers l
      where l.created_by = me
        and not exists (select 1 from ledger_members m where m.ledger_id = l.id)
   );
  delete from trip_ledgers l
   where l.created_by = me
     and not exists (select 1 from ledger_members m where m.ledger_id = l.id);

  -- ⚠️ 打卡照片不在这里删。
  -- Supabase 禁止在 SQL 里直接删 storage.objects:
  --   "Direct deletion from storage tables is not allowed. Use the Storage API instead."
  -- 加了这段会让整个函数报 42501,导致删除账号彻底失败。
  -- 照片由客户端在调用本函数之前,通过 Storage API 删除(见 supabase.js 的 deleteAccount)。

  -- 最后删账号本体
  delete from auth.users where id = me;
end;
$$;

revoke all on function delete_my_account() from public;
grant execute on function delete_my_account() to anon, authenticated;

comment on function delete_my_account is
  '删除当前登录用户的全部数据与账号本体。共享账本只退出自己,不影响同行者的账。';

-- ══════════════════════════════════════════════════════
-- schema.word-srs.sql
-- ══════════════════════════════════════════════════════
-- 言 · 单词进度升级为间隔复习(2026-08)
-- 在 Supabase Dashboard → SQL Editor 里整段粘贴运行。可重复运行,不会报错。
--
-- 背景:word_progress 原本一行只记 status('learning' / 'mastered')。
-- 它能记住「我标过这个词」,但记不住什么时候该再见到它 —— 客户端的「今日 10 词」
-- 因此只能每次从词库头上重挑,用户标记的动作不产生任何累积。
--
-- 这次加四列,把一行从「一个标签」变成「一条有时间的记录」:
--   box          Leitner 阶梯档位(连续答对几次),决定下次间隔
--   due_at       下次该复习的本地日历日。客户端按本地时区算好再传,
--                这里用 date 而不是 timestamptz —— 「今天该复习」是日历概念,
--                存成时刻会让跨时区/跨夏令时的用户在错误的钟点看到任务。
--   reps/lapses  复习次数 / 忘记次数。目前只用于统计和排序,不参与间隔计算。
--   last_seen_at 最后一次复习的日历日。本地和云端合并时靠它择新。
--
-- 旧行怎么办:不在这里迁移。全部给默认值(box=0、due_at 为空),
-- 客户端 srs.js 的 fromCloudRow() 认得「只有 status 没有 due_at」这种行,
-- 和本地旧数据走同一套落点(learning → 今天到期,mastered → 30 天后)。
-- 让一处代码负责迁移,比数据库和客户端各迁一半、口径不一致要安全。

alter table word_progress add column if not exists box          smallint     not null default 0;
alter table word_progress add column if not exists due_at       date;
alter table word_progress add column if not exists reps         integer      not null default 0;
alter table word_progress add column if not exists lapses       integer      not null default 0;
alter table word_progress add column if not exists last_seen_at date;

-- 原来的约束是 check (status in ('learning', 'mastered'))。
-- 现在 status 由客户端从 box 算出来,取值域没变,但约束名在旧库里是
-- 自动生成的(word_progress_status_check),重建一遍以保证名字确定、可重复运行。
alter table word_progress drop constraint if exists word_progress_status_check;
alter table word_progress add  constraint word_progress_status_check
  check (status in ('learning', 'mastered'));

-- 客户端每次进词书都要问「我今天有几个词到期」。没有索引时这是全表扫,
-- 而重度用户的行数会随词库(8298 条)增长。
create index if not exists word_progress_due_idx
  on word_progress (user_id, due_at);

-- RLS 策略沿用 schema.sql 里那四条(select/insert/update/delete 各限本人),
-- 加列不影响策略,这里不重复声明。

-- ══════════════════════════════════════════════════════
-- schema.ledger-amount-expr.sql
-- ══════════════════════════════════════════════════════
-- 言 · 分账金额保留算式(2026-08)
-- 在 Supabase Dashboard → SQL Editor 里整段粘贴运行。可重复运行,不会报错。
--
-- 背景:人在小票旁边记账时天然会写「90*2」「47+6」—— 门票两张、打车分两段。
-- 现在输入框认这种写法了,amount 存算完的结果(180),但算式本身有信息:
-- 「90*2」记着单价是 90、买了两张。纸上记账保留这个,App 也该保留。
--
-- 这一列**只给人看,不参与任何计算**。所有结算、汇总、导出读的都是 amount。
-- 所以它可以为空、可以是任意字符串,坏了也不会算错账。
alter table ledger_expenses add column if not exists amount_expr text;
