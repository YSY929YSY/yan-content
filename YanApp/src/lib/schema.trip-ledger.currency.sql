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
