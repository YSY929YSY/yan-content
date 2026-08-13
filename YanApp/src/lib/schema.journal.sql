-- 言 · 手账数据结构(2026-08):城市容器 + 「第一次」+ 素材库
-- 在 Supabase Dashboard → SQL Editor 里整段粘贴运行。可重复运行。
-- 设计文档:docs/journal-data-design.md
--
-- 接着 schema.moments.sql 往下写,那三条铁律继续生效:
--   采集层(moments / moment_photos)只加字段,永不改名/删除/迁移
--   语义层(moment_tags)是注解,删掉重建不伤原始数据
--   展示层不持有数据,推倒重来零成本
--
-- 这次要定的三样东西,各自落在哪一层就是这次设计的全部内容:
--
--   城市容器 → 语义层 tag(kind='city')+ 一张只存装饰的册子表。
--              册子表丢了能从 tag 重建,只丢用户改过的册名和封面。
--   「第一次」 → 语义层 tag(kind='first'),**零新表**。
--              docs/TODO.md 写死了红线:「第一次」是这份数据的透镜,不是新数据模型。
--   素材     → 新的一层:资产库。这是三样里唯一真的缺表的 ——
--              在此之前抠好的图、扫好的票根只作为 journal_items 的一个字段存在,
--              等于「这只鸽子只属于这一页」,跨页复用和材料架都无从谈起。

-- ─────────────────────────────────────────────
-- 1. 素材库:派生资产,一次入库,任意页复用
--
-- kind  = 成品是什么(页面怎么渲染它)
-- entry = 从哪条口子进来的(产品上明确要求区分的三条路径)
--         extract 提取去背景 · scan 扫描留原物 · upload 整图直接进
--         generated(AI 纪念章)和 official(官方贴纸包)是后面两档,先占位不实现。
--
-- 提取和扫描的区别不是实现细节,是产品定义:提取是去背景,扫描是留原物。
-- 所以它们必须能在数据里分开 —— 一张票根被当成抠图处理过一次,原物质感就没了。
--
-- source_* 是溯源,不是所有权:原图/原扫描永远躺在 moment_photos 里不动,
-- 这里存的是派生出来的那张 PNG。删素材不该动原图,所以是 set null 不是 cascade。
-- ─────────────────────────────────────────────
create table if not exists journal_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  kind text not null check (kind in ('cutout', 'scan', 'photo', 'badge', 'paper', 'sticker')),
  entry text not null check (entry in ('extract', 'scan', 'upload', 'generated', 'official')),
  storage_path text,                       -- 写入一次,永不移动。约定: {user_id}/journal/{id}.png
                                           -- 可空:本地优先 —— 素材先在本机存在,上传成功才有路径
  width integer,
  height integer,
  source_moment_id uuid references moments on delete set null,
  source_photo_id uuid references moment_photos on delete set null,
  city_id text,                            -- 材料架按城市分格;和 moment_tags 的 city 用同一套 id
  payload jsonb,                           -- kind 专属:scan 存票面识别出的日期/金额/币种/原文;
                                           -- cutout 存 mask 版本、有没有白色模切边
  created_at timestamptz default now(),
  deleted_at timestamptz                   -- 软删,永不硬删
);
create index if not exists journal_assets_user_idx
  on journal_assets (user_id, created_at desc) where deleted_at is null;
create index if not exists journal_assets_city_idx
  on journal_assets (user_id, city_id) where deleted_at is null;

-- ─────────────────────────────────────────────
-- 2. 城市册:容器是城市,不是旅行
--
-- 为什么不是旅行册:旅行册(trip_notebooks)是轨道那一侧的东西 —— 行程、账目、预算。
-- 手账是漫游那一侧。一次旅行会横跨几个城市,而一个城市会被去很多次;
-- 第二次去东京翻开的应该是同一本册子,上面留着上次的痕迹。
-- 「一个人在不同坐标下留下的自己的截面」—— 坐标是城市,旅行只是其中一次。
-- 所以:**城市是容器,旅行是标签**(kind='trip' 照旧挂在 moment_tags 上)。
--
-- city_id 必须是稳定 id,不能是名字。「东京」「Tokyo」「東京都」是一个地方,
-- 按名字存会分裂成三本册子,而且改一次显示语言就全散架。
--   反查成功: city:{iso2}:{slug}      例 city:jp:tokyo
--   反查失败: city:?:{lat}_{lng}      按 0.1°(约 11km)取整的网格,resolved=false
-- 反查失败时**照样收下这条记录**,只是先落在网格 id 上,以后补反查再合并。
-- 拿不到数据 ≠ 数据是空的 —— 不能因为 Nominatim 没响应就把一条真实的旅行记录丢掉。
--
-- 这张表里只有两类东西:反查回来的字典信息(可重新拉),和用户改过的装饰
-- (title / cover / note)。整张表删掉,册子能从 moment_tags 的 city 标签重建,
-- 代价只是册名回退成反查名、封面没了。所以它是语义层,不是采集层。
-- ─────────────────────────────────────────────
create table if not exists journal_cities (
  user_id uuid references auth.users on delete cascade not null,
  city_id text not null,
  name text,                               -- 反查回来的名字,册名的默认值
  name_local text,                         -- 当地写法(東京都),词卡那侧要用
  country_code text,
  lat double precision,
  lng double precision,
  resolved boolean not null default false, -- false = 还是网格占位 id,以后反查成功要换掉
  title text,                              -- 用户改过的册名。空 = 用 name
  cover_asset_id uuid references journal_assets on delete set null,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  primary key (user_id, city_id)
);

-- ─────────────────────────────────────────────
-- 3. 手账页接上前两样
--
-- city_id 不做外键:它和 moment_tags.value 是同一种东西 —— 一个标签值。
-- 做成外键就等于「城市册必须先存在,页才能存在」,而真实顺序常常是反的:
-- 人先在飞机上拼了一页,落地反查才知道这是哪。
-- ─────────────────────────────────────────────
alter table journal_pages add column if not exists city_id text;
create index if not exists journal_pages_city_idx
  on journal_pages (user_id, city_id, page_date) where deleted_at is null;

-- 页上的元素从此引用素材库,而不是自己存一份路径。
-- 同一张票根贴两页 = 两条 item 指同一个 asset,不是两份文件。
-- asset_path 那一列**不删**(铁律:只加不删),新代码一律写 asset_id;
-- 读的时候 asset_id 优先,为空再回退 asset_path。
alter table journal_items add column if not exists asset_id uuid
  references journal_assets on delete set null;
create index if not exists journal_items_asset_idx on journal_items (asset_id);

-- ─────────────────────────────────────────────
-- 3.5 采集层放开 storage_path 的 not null
--
-- 不是改主意,是本地优先逼出来的:照片先在本机存在,上传成功之后才有路径。
-- 保持 not null 的话,离线拍下的那条瞬间在补传时**一行都插不进去** ——
-- 而登录换账号只有一次迁移机会,插不进去就是永久丢。
-- 这是放宽约束,不是改名/删列/迁移数据,不违反采集层那条铁律。
-- ─────────────────────────────────────────────
alter table moment_photos alter column storage_path drop not null;

-- ─────────────────────────────────────────────
-- 3.6 材质与厚度:层次是算出来的,不是画上去的
--
-- 页面**永不拍平**。存的是「每个元素在哪、多大、什么材质、离纸面多高」,
-- 光影在渲染时才算。这一条同时买下三件事:
--   · 层次感 —— 贴纸浮 1mm、票根 0.3mm、胶带几乎贴在纸上,三种投影完全不同。
--     所有拼贴 App 看起来是平的,就是因为给所有元素画了同一种柔和阴影。
--   · 延展到本子外面 —— 坐标不限制在页内,越界那半截的投影落在桌面上
--   · 可打印 —— 同一份数据换 300dpi 重渲一遍就是印刷稿,不是把屏幕图放大
--
-- lift 的单位是「相对页宽的千分比」,不是像素 —— 换屏幕、换 300dpi 打印都不用改数据。
-- ─────────────────────────────────────────────
alter table journal_items add column if not exists material text;
alter table journal_items add column if not exists lift real not null default 0;

comment on column journal_items.material is
  '材质,决定怎么打光和投影:paper / photo / tape / sticker / vellum / scan / ink。为空时按 kind 取默认值。';
comment on column journal_items.lift is
  '离纸面的高度(页宽千分比)。阴影的偏移和虚实由它算出来,不要在素材里画死阴影。';

-- 手写笔迹:kind='ink' 的 payload 存**矢量笔画**,不存位图。
--   { "strokes": [ { "points": [[x,y,t,w], ...], "color": "#3a2c1e", "tool": "pen" } ] }
--   x/y 是相对坐标(0~1),t 是毫秒时间戳,w 是该点的线宽(由速度推出的笔锋)。
-- 为什么不存 PNG:
--   · 打印时按 300dpi 重画,不是把屏幕上的线放大成锯齿
--   · 能整笔擦除 —— 位图做不到,矢量只是删一条记录
--   · 事后能改颜色改粗细;一页手写几 KB,位图要几 MB
--   · 白送一个能力:回放书写过程(翻到那页,字一笔一笔重新写出来)
-- t 必须存:没有它就没有回放,而它几乎不占空间 —— 现在不存,以后补不回来。

-- ─────────────────────────────────────────────
-- 4. 语义层新增的两个 kind(只是约定,不动表结构)
--
--   city  → value = 上面那套 city_id。「这条瞬间属于哪座城」
--   first → value = 用户自己写的那句话,如「第一次自己办入住」
--
-- 「第一次」为什么不建表,三条红线直接落在这里:
--   · 不预置清单 —— 数据库里没有任何「第一次」的枚举、没有 seed。
--     预置一份「36 个第一次」就退化成打卡任务,和一期一会正相反。
--   · 不显示未完成 —— 数据里根本不存在「未完成的第一次」这种行。发生过才有行。
--   · 不统计数量 —— 所以**这里故意不建按 kind 计数的索引**,也不加派生列。
--     加了就会有人拿它做进度条。moment_tags_kind_idx 够查了。
--
-- 「第一次到东京」「第一次到日本」这类能算出来的,**一律不落库** ——
-- 由展示层按 moments 的时间序当场算(纯函数,可测)。落库就是把透镜焊死成模型。
-- ─────────────────────────────────────────────
comment on column moment_tags.kind is
  '注解种类,只增不改:place / trip / category / serendipity / mood / city / first。'
  'city 的 value 是 city_id(见 journal_cities);first 的 value 是用户自己写的那句话,不预置清单、不统计数量。';

-- ─────────────────────────────────────────────
-- 5. RLS + GRANT
-- 「RLS 建了但没 GRANT」踩过一次:策略管哪些行,GRANT 管能不能碰这张表,少了直接 403。
-- ─────────────────────────────────────────────
alter table journal_assets enable row level security;
alter table journal_cities enable row level security;

drop policy if exists "own journal assets" on journal_assets;
create policy "own journal assets" on journal_assets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own journal cities" on journal_cities;
create policy "own journal cities" on journal_cities for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.journal_assets to anon, authenticated;
grant select, insert, update, delete on table public.journal_cities to anon, authenticated;

-- Storage:素材和瞬间照片同一个 private bucket `moment-photos`(策略见 schema.moments.sql)。
--   原图     {user_id}/moments/{moment_id}/{n}.jpg   ← 写入一次,永不移动
--   派生素材 {user_id}/journal/{asset_id}.png        ← 抠图/扫描/纪念章,同样写入一次
-- ⚠️ 删号时这个桶要客户端自己清:supabase.js 的 deleteAccount 现在只清了 checkin-photos,
--    手账上线前必须把 moment-photos 也加进去 —— 数据库里的行会随 auth.users 级联删掉,
--    Storage 里的文件不会,而 SQL 里删不了 storage.objects(会报 42501 让整个删号失败)。
