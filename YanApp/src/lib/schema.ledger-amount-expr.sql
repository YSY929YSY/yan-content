-- 言 · 分账金额保留算式(2026-08)
-- 在 Supabase Dashboard → SQL Editor 里整段粘贴运行。可重复运行,不会报错。
--
-- 背景:人在小票旁边记账时天然会写「90*2」「47+6」—— 门票两张、打车分两段。
-- 现在输入框认这种写法了,amount 存算完的结果(180),但算式本身有信息:
-- 「90*2」记着单价是 90、买了两张。纸上记账保留这个,App 也该保留。
--
-- 这一列**只给人看,不参与任何计算**。所有结算、汇总、导出读的都是 amount。
-- 所以它可以为空、可以是任意字符串,坏了也不会算错账。
alter table ledger_expenses add column if not exists amount_expr text;
