-- 言 · 共享账本:移除「名字标签」成员(2026-08)
-- 在 Supabase Dashboard → SQL Editor 里整段粘贴运行。可重复运行,不会报错。
--
-- 背景:同行者列表加得进、去不掉。名字敲错、朋友最后没去成,那一行就永远挂着,
-- 而且会被自动拉进「全员均分」——多一个人分,每笔账的每人份额都是错的。
--
-- 真实遭遇(2026-08):「一开始加错了成员,均分那里每次多一个人,
-- 导致我先删除了账号」—— 为了去掉一个加错的名字,把整个账号删了。
-- 所以这个口子必须够宽:**已经真正加入的人也要能删**,不能只删名字标签。
--
-- 三条约束,都是为了「删掉一个人」不会变成「账对不上」:
--   ① 不能删自己。那是你在这本账里的身份,删了这本账就跟你没关系了,
--      而「退出账本」是另一件事,得单独做。
--   ② 身上有账的一律不删。settleOne 只按当前成员名单遍历,名单里少一个人,
--      他那份分摊就凭空蒸发,守恒直接破掉,而界面上看起来一切正常。
--      「有账」= 当过垫付人 / 分摊金额非零 / 是单独付那一项的 owner。
--      注意不能用「在 shares 或 participants 里出现过」来判 —— buildShares 会给
--      每个成员都写一个 0,participants 在均分模式下也是全员,
--      按那个判等于谁都删不掉。金额是 0 就不影响任何计算,可以删。
--   ③ 判断放在服务端。客户端手里的账目可能是弱网下的旧快照,
--      按它判会以为「这个人没有账」而删掉一个其实有账的人。
--
-- 不删任何账目、不删任何列。删不掉的时候抛异常,由客户端原样提示。

create or replace function public.remove_ledger_tag_member(p_ledger uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target ledger_members;
  used int;
begin
  if not is_ledger_member(p_ledger) then
    raise exception '你不是这个账本的成员';
  end if;

  select * into target from ledger_members
    where ledger_id = p_ledger and display_name = p_name
    limit 1;
  if target.id is null then
    raise exception '没找到这个同行者';
  end if;
  if target.user_id is not null and target.user_id = auth.uid() then
    raise exception '不能移除自己';
  end if;

  -- 已软删的账不参与任何计算,不算数;已结清的仍在「我花了」里,算数。
  select count(*) into used from ledger_expenses e
    where e.ledger_id = p_ledger
      and e.deleted_at is null
      and (
        e.payer = p_name
        or coalesce(e.special_item ->> 'owner', '') = p_name
        or (
          e.shares ? p_name
          and coalesce(nullif(e.shares ->> p_name, ''), '0') ~ '^-?[0-9]*\.?[0-9]+$'
          and abs((e.shares ->> p_name)::numeric) > 0.005
        )
      );
  if used > 0 then
    raise exception '% 身上还有 % 笔账,先把那些账改掉或删掉再移除', p_name, used;
  end if;

  delete from ledger_members where id = target.id;
end;
$$;

grant execute on function public.remove_ledger_tag_member(uuid, text) to anon, authenticated;
