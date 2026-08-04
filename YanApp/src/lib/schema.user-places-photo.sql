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
