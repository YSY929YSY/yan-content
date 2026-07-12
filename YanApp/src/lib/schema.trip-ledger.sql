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
