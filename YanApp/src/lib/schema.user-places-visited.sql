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
