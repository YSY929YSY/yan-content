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
