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
