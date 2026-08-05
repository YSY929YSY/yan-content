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
