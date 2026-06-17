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
