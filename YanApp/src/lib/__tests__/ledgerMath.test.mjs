// 分账算术测试 —— 零依赖,用 Node 内置 test runner:npm test
//
// 这些用例大多来自真实排查:每一条都对应一次实际发生过的问题或一次人工验算。
// 三条不变量必须一直成立:守恒(分摊之和==总额)、闭合(净额之和==0)、
// 最少(转账笔数 ≤ 有非零净额的人数-1)。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, clampMoney, splitEven, buildShares, settleOne,
  normalizeCategory, normalizeExpenseCategory, normalizeExpenseList, EXPENSE_CATEGORIES,
  personSpendRows,
} from '../ledgerMath.js';

const P = ['Lyra', 'Ning', 'Max'];
const near = (a, b, eps = 0.005) => Math.abs(a - b) < eps;
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const withShares = (d, people = P) => ({ ...d, shares: buildShares(d, people) });

// ── money ────────────────────────────────────────────────
test('money 解析脏输入不返回 NaN', () => {
  assert.equal(money('42.50'), 42.5);
  assert.equal(money('€42.50'), 42.5);
  assert.equal(money(''), 0);
  assert.equal(money(null), 0);
  assert.equal(money(undefined), 0);
  assert.equal(money('abc'), 0);
});

// ── clampMoney ───────────────────────────────────────────
test('clampMoney 只留一个小数点、最多两位', () => {
  assert.equal(clampMoney('12.345'), '12.34');
  assert.equal(clampMoney('1.2.3'), '1.23');
  assert.equal(clampMoney('1..2'), '1.2');
  assert.equal(clampMoney('abc12'), '12');
  assert.equal(clampMoney('12'), '12');
});

// ── splitEven:守恒 ───────────────────────────────────────
test('splitEven 除不尽时余数给最后一人,总额不丢分', () => {
  const r = splitEven(10, P);
  assert.deepEqual(r, { Lyra: 3.33, Ning: 3.33, Max: 3.34 });
  assert.ok(near(sum(r), 10));
});

test('splitEven 极小额也守恒', () => {
  assert.ok(near(sum(splitEven(0.01, P)), 0.01));
  assert.ok(near(sum(splitEven(0.02, P)), 0.02));
});

test('splitEven 空成员不产生 NaN/Infinity', () => {
  assert.deepEqual(splitEven(100, []), {});
});

test('splitEven 大额随机守恒(200 组)', () => {
  for (let i = 0; i < 200; i += 1) {
    const amt = Math.round(Math.random() * 500000) / 100;
    const n = 2 + (i % 5);
    const people = Array.from({ length: n }, (_, k) => 'p' + k);
    assert.ok(near(sum(splitEven(amt, people)), amt), `${amt} / ${n} 人不守恒`);
  }
});

// ── buildShares:三种分法 ─────────────────────────────────
test('均分:全员参与', () => {
  const s = buildShares({ amount: '86.40', mode: '均分', participants: P }, P);
  assert.deepEqual(s, { Lyra: 28.8, Ning: 28.8, Max: 28.8 });
});

test('均分:只有部分人参与,其余为 0', () => {
  const s = buildShares({ amount: '22.00', mode: '均分', participants: ['Ning', 'Max'] }, P);
  assert.equal(s.Lyra, 0);
  assert.ok(near(s.Ning + s.Max, 22));
});

test('均分:participants 为空时退回全员(不是全 0)', () => {
  const s = buildShares({ amount: '30.00', mode: '均分', participants: [] }, P);
  assert.ok(near(sum(s), 30));
});

test('各自价格:按填的金额,不做均分', () => {
  const s = buildShares({
    amount: '48.00', mode: '各自价格', participants: P,
    personShares: { Lyra: '4.00', Ning: '22.00', Max: '22.00' },
  }, P);
  assert.deepEqual(s, { Lyra: 4, Ning: 22, Max: 22 });
});

test('单独付:那一项归一人,其余均分', () => {
  const s = buildShares({
    amount: '95.00', mode: '特殊项', participants: P,
    specialOwner: 'Max', specialAmount: '35.00',
  }, P);
  assert.deepEqual(s, { Lyra: 20, Ning: 20, Max: 55 });
  assert.ok(near(sum(s), 95));
});

test('单独付金额超总额时被夹取,仍守恒(界面另有拦截)', () => {
  const s = buildShares({
    amount: '50.00', mode: '特殊项', participants: P,
    specialOwner: 'Max', specialAmount: '80.00',
  }, P);
  assert.ok(near(sum(s), 50), '夹取后仍必须等于总额');
});

test('成员为空不做除法(避免 Infinity/NaN)', () => {
  const s = buildShares({ amount: '100', mode: '均分', participants: [] }, []);
  assert.deepEqual(s, {});
});

// ── settleOne:闭合 + 最少笔数 ────────────────────────────
const closes = (rows) => near(rows.reduce((a, r) => a + r.net, 0), 0, 0.02);
const minTransfers = (rows) => Math.max(rows.filter(r => Math.abs(r.net) > 0.01).length - 1, 0);

test('经典三角债抵消成一笔', () => {
  // A 垫 B 的,B 垫 C 的,C 垫 A 的 —— 天真做法要 3 笔
  const items = [
    withShares({ amount: '30', payer: 'Lyra', mode: '均分', participants: ['Ning'] }),
    withShares({ amount: '30', payer: 'Ning', mode: '均分', participants: ['Max'] }),
    withShares({ amount: '30', payer: 'Max', mode: '均分', participants: ['Lyra'] }),
  ];
  const g = settleOne(items, '€', P);
  assert.ok(closes(g.rows), '净额未闭合');
  assert.equal(g.lines.length, 0, '互相抵消后应该一笔都不用转');
});

test('一人垫全部:n-1 笔', () => {
  const items = [withShares({ amount: '300', payer: 'Lyra', mode: '均分', participants: P })];
  const g = settleOne(items, '€', P);
  assert.ok(closes(g.rows));
  assert.equal(g.lines.length, 2);
  assert.ok(g.lines.every(l => l.to === 'Lyra'));
});

test('八笔真实账:守恒 + 闭合 + 笔数最少', () => {
  const raw = [
    { amount: '86.40', payer: 'Lyra', mode: '均分', participants: P },              // Temple Bar
    { amount: '54.00', payer: 'Ning', mode: '均分', participants: P },              // 火车
    { amount: '30.00', payer: 'Max', mode: '均分', participants: P },               // 门票
    { amount: '240.00', payer: 'Lyra', mode: '均分', participants: P },             // 酒店
    { amount: '22.00', payer: 'Max', mode: '均分', participants: ['Ning', 'Max'] }, // Lyra 走回去
    { amount: '48.00', payer: 'Ning', mode: '各自价格', participants: P,            // shared plates
      personShares: { Lyra: '4.00', Ning: '22.00', Max: '22.00' } },
    { amount: '12.50', payer: 'Ning', mode: '均分', participants: ['Ning'] },       // 自己买药
    { amount: '95.00', payer: 'Lyra', mode: '特殊项', participants: P,              // Max 加了瓶酒
      specialOwner: 'Max', specialAmount: '35.00' },
  ];
  const items = raw.map(d => withShares(d));   // 不能直接传 withShares:map 会把下标当第二个参数
  items.forEach((it, i) => {
    assert.ok(near(sum(it.shares), money(it.amount)), `第 ${i + 1} 笔不守恒`);
  });
  const g = settleOne(items, '€', P);
  assert.ok(closes(g.rows), '净额未闭合');
  assert.ok(g.lines.length <= minTransfers(g.rows), '转账笔数超过下限');
  // 每人的应承担合计 == 总支出
  const total = raw.reduce((a, r) => a + money(r.amount), 0);
  assert.ok(near(g.rows.reduce((a, r) => a + r.owed, 0), total), '应承担合计 != 总支出');
});

test('请客:付款人不在参与人里,自己不承担', () => {
  const items = [withShares({ amount: '60', payer: 'Lyra', mode: '均分', participants: ['Ning', 'Max'] })];
  const g = settleOne(items, '€', P);
  assert.equal(g.rows.find(r => r.person === 'Lyra').owed, 0);
  assert.equal(g.lines.length, 2);
  assert.ok(closes(g.rows));
});

test('中途加入的成员不承担之前的账', () => {
  const items = [withShares({ amount: '60', payer: 'Lyra', mode: '均分', participants: ['Lyra', 'Ning'] })];
  const g = settleOne(items, '€', P);   // 结算时已经 3 个人
  assert.equal(g.rows.find(r => r.person === 'Max').owed, 0);
  assert.ok(closes(g.rows));
});

test('随机 300 局:永远闭合且笔数不超下限', () => {
  for (let t = 0; t < 300; t += 1) {
    const n = 2 + (t % 4);
    const people = Array.from({ length: n }, (_, k) => 'p' + k);
    const items = Array.from({ length: 1 + (t % 6) }, () => {
      const payer = people[Math.floor(Math.random() * n)];
      const parts = people.filter(() => Math.random() > 0.3);
      return withShares({
        amount: String(Math.round(Math.random() * 20000) / 100),
        payer, mode: '均分',
        participants: parts.length ? parts : people,
      }, people);
    });
    const g = settleOne(items, '€', people);
    assert.ok(closes(g.rows), `第 ${t} 局未闭合`);
    assert.ok(g.lines.length <= minTransfers(g.rows), `第 ${t} 局笔数超限`);
  }
});

test('结清的账目不计入「谁欠谁」,但仍算个人花费', () => {
  const all = [
    withShares({ amount: '240', payer: 'Lyra', mode: '均分', participants: P, settledAt: '2026-07-30' }),
    withShares({ amount: '60', payer: 'Ning', mode: '均分', participants: P }),
  ];
  const active = all.filter(i => !i.settledAt);
  const owe = settleOne(active, '€', P);
  const spend = settleOne(all, '€', P);
  assert.equal(owe.lines.length, 2, '未结清的那笔应产生 2 笔转账');
  assert.ok(near(spend.rows.find(r => r.person === 'Lyra').owed, 100), '个人花费应含已结清的');
  assert.ok(near(owe.rows.find(r => r.person === 'Lyra').owed, 20), '谁欠谁只算未结清的');
});

// ── 金额算式 ──────────────────────────────────────────────────
//
// 人在小票旁边记账天然会写「90*2」「47+6」「12+22.8」—— 两张门票、
// 打车分两段、买了两样。这是纸上记账最省事的地方。
//
// 在这之前这些写法被**静默算错**:清洗函数把运算符删掉再拼接,
// 90*2 变成 902、12+22.8 变成 1222.8。不报错不提示,你以为记了 180。
import { evalAmount, clampAmountExpr, isAmountExpr } from '../ledgerMath.js';

test('算式:乘法和加法', () => {
  assert.equal(evalAmount('90*2'), 180);
  assert.equal(evalAmount('47+6'), 53);
  assert.equal(evalAmount('12+22.8'), 34.8);
  assert.equal(evalAmount('388*2'), 776);
});

test('乘法优先于加法 —— 和算术常识一致,否则 47+6*2 会算成 106', () => {
  assert.equal(evalAmount('47+6*2'), 59);
});

test('普通金额照常,一位小数不会被当成千位分隔', () => {
  assert.equal(evalAmount('57.8'), 57.8);
  assert.equal(evalAmount('84.95'), 84.95);
  assert.equal(evalAmount('100'), 100);
});

test('结果只到分 —— 浮点尾巴不该出现在账本里', () => {
  assert.equal(evalAmount('0.1+0.2'), 0.3);
  assert.equal(evalAmount('19.99*3'), 59.97);
});

test('算式不合法返回 null,不返回一个像模像样的错数', () => {
  for (const s of ['', '90*', '+5', 'abc', '90--2', '90/2']) {
    assert.equal(evalAmount(s), null, `${JSON.stringify(s)} 不该算出数来`);
  }
});

test('money 认算式 —— 这是修掉静默算错的那一刀', () => {
  assert.equal(money('90*2'), 180, '以前是 902');
  assert.equal(money('12+22.8'), 34.8, '以前是 1222.8');
  assert.equal(money('57.8'), 57.8);
  assert.equal(money('90*'), 90, '打字打到一半时回退到已经输入的部分,不闪一个错数');
});

test('输入清洗放行运算符,但每段数字仍然最多两位小数', () => {
  assert.equal(clampAmountExpr('90*2'), '90*2');
  assert.equal(clampAmountExpr('12+22.8'), '12+22.8');
  assert.equal(clampAmountExpr('9a0*2元'), '90*2');
  assert.equal(clampAmountExpr('1.234*2'), '1.23*2', '每段各自截到两位');
});

test('isAmountExpr 只对真的带运算符的串为真', () => {
  assert.equal(isAmountExpr('90*2'), true);
  assert.equal(isAmountExpr('57.8'), false);
  assert.equal(isAmountExpr(''), false);
});

// ── 分类改名(晚餐→餐饮、车票→交通) ─────────────────────
// 这一组守的是同一件事:改名不能让存量账目掉分类。
// 归一走「读的时候翻译」,所以每个入口都会过这几个函数。
test('旧分类值被翻译成新名字', () => {
  assert.equal(normalizeCategory('晚餐'), '餐饮');
  assert.equal(normalizeCategory('车票'), '交通');
});

test('★ 认不出的分类原样放行 —— 绝不映射成空或「其他」', () => {
  assert.equal(normalizeCategory('购物'), '购物');
  assert.equal(normalizeCategory('酒吧'), '酒吧');      // 以后新加的
  assert.equal(normalizeCategory('随便敲的'), '随便敲的'); // 用户自己写的
});

test('空值保持空,不被填成一个假分类', () => {
  assert.equal(normalizeCategory(''), '');
  assert.equal(normalizeCategory(null), null);
  assert.equal(normalizeCategory(undefined), undefined);
});

test('归一是幂等的 —— 反复读盘不会越翻越歪', () => {
  assert.equal(normalizeCategory(normalizeCategory('晚餐')), '餐饮');
  assert.equal(normalizeCategory('餐饮'), '餐饮');
});

test('新分类列表就是改名后的那六个', () => {
  assert.deepEqual(EXPENSE_CATEGORIES, ['餐饮', '交通', '购物', '酒店', '门票', '其他']);
  // 旧名字必须已经不在列表里,否则新旧两个值会同时存在
  assert.ok(!EXPENSE_CATEGORIES.includes('晚餐'));
  assert.ok(!EXPENSE_CATEGORIES.includes('车票'));
});

test('★ 整条账目只动 category,金额/分摊/垫付人一个字节都不碰', () => {
  const old = {
    id: 'expense-1', category: '晚餐', title: '晚餐', amount: '48.80',
    payer: 'Lyra', shares: { Lyra: 24.4, Ning: 24.4 }, note: '在 Temple Bar',
  };
  const next = normalizeExpenseCategory(old);
  assert.equal(next.category, '餐饮');
  assert.equal(next.amount, '48.80');
  assert.equal(next.payer, 'Lyra');
  assert.deepEqual(next.shares, { Lyra: 24.4, Ning: 24.4 });
  assert.equal(next.note, '在 Temple Bar');
  assert.equal(next.id, 'expense-1');
});

test('title 以前会被兜底填成和 category 一样,那种要一起改', () => {
  // 否则列表渲染成「餐饮 · 晚餐」
  assert.equal(normalizeExpenseCategory({ category: '车票', title: '车票' }).title, '交通');
  // 用户自己写过标题的,标题不动
  assert.equal(normalizeExpenseCategory({ category: '车票', title: '机场大巴' }).title, '机场大巴');
});

test('不需要改的账目原样返回(同一个对象引用,不制造无谓的重渲染)', () => {
  const item = { category: '购物', title: '纪念品' };
  assert.equal(normalizeExpenseCategory(item), item);
});

test('★ 不是数组的原样返回 —— 拿不到数据不等于数据是空的', () => {
  assert.equal(normalizeExpenseList(null), null);
  assert.equal(normalizeExpenseList(undefined), undefined);
  assert.deepEqual(normalizeExpenseList([]), []);
});

test('整批归一:一笔都不少,该改的改了', () => {
  const list = [
    { id: 'a', category: '晚餐' },
    { id: 'b', category: '车票' },
    { id: 'c', category: '门票' },
    { id: 'd', category: '夜宵' },
  ];
  const out = normalizeExpenseList(list);
  assert.equal(out.length, 4);
  assert.deepEqual(out.map(x => x.category), ['餐饮', '交通', '门票', '夜宵']);
  assert.deepEqual(out.map(x => x.id), ['a', 'b', 'c', 'd']);
});

test('★ 改名不影响结算 —— 分类只是标签,不进任何算术', () => {
  const items = [
    { amount: '60', payer: 'Lyra', category: '晚餐', shares: { Lyra: 30, Ning: 30, Max: 0 } },
    { amount: '30', payer: 'Ning', category: '车票', shares: { Lyra: 10, Ning: 10, Max: 10 } },
  ];
  const before = settleOne(items, '€', P);
  const after = settleOne(normalizeExpenseList(items), '€', P);
  assert.deepEqual(after.rows, before.rows);
  assert.deepEqual(after.lines, before.lines);
});

// ── 真实旅行:爱尔兰 + 土耳其(2026-08,ysy / dyn 两人 41 笔)────────────
//
// 这一组是**真实数据**,不是造的。价值在于它同时包含了造不出来的几种组合:
//   · 五个币种(人民币/欧元/英镑/里拉/美金)同时存在,且各自独立结算
//   · 一个项目跨三笔付款(格雷梅 tour:ysy 付 €300、dyn 付 €100、dyn 付 ₺1000)
//   · 「单独付」双向交叉:dyn 替 ysy 垫了 4 笔,ysy 替 dyn 垫了 2 笔,互相抵消
//   · 分币种的奇数分账(¥539.95 → 269.97 / 269.98)
//
// 答案是人工用表格独立算过一遍、再和 App 逐笔对齐核对出来的。
// 排查时发现的唯一一处出入是**输入错误**(水宫门票记成了 ¥4500,实为 ₺4500),
// 不是算法问题 —— 这里按正确的币种写。
const TRIP = [
  // [币种, 金额, 垫付人, 归属] 归属 null = 两人均分;'ysy'/'dyn' = 单独付,东西是谁的
  ['CNY', 1184, 'ysy', null], ['CNY', 2290, 'ysy', null], ['CNY', 3621, 'dyn', null],
  ['CNY', 539.95, 'dyn', null], ['CNY', 5683, 'ysy', null], ['CNY', 230, 'ysy', null],
  ['CNY', 1292.45, 'ysy', null], ['CNY', 781.73, 'dyn', null], ['CNY', 270, 'ysy', null],
  ['CNY', 4928, 'dyn', null], ['CNY', 200, 'ysy', null], ['CNY', 74.88, 'ysy', null],
  ['CNY', 269, 'ysy', null], ['CNY', 161, 'ysy', null],
  ['EUR', 33.18, 'dyn', null], ['EUR', 99, 'dyn', null], ['EUR', 84.40, 'dyn', null],
  ['EUR', 300, 'ysy', null], ['EUR', 100, 'dyn', null],
  ['GBP', 21.65, 'ysy', null], ['GBP', 18, 'ysy', null],
  ['TRY', 1000, 'dyn', null], ['TRY', 1453, 'ysy', null], ['TRY', 3057.6, 'dyn', null],
  ['TRY', 647.28, 'dyn', null], ['TRY', 500, 'ysy', null], ['TRY', 400, 'dyn', null],
  ['TRY', 1950, 'ysy', null], ['TRY', 200, 'ysy', null], ['TRY', 4500, 'dyn', null],
  ['TRY', 200, 'ysy', null], ['TRY', 500, 'ysy', null], ['TRY', 338.85, 'dyn', null],
  ['TRY', 148, 'ysy', null],
  // 单独付:一个人替另一个人垫的个人开销,全额归对方
  ['TRY', 400, 'dyn', 'ysy'], ['TRY', 50, 'dyn', 'ysy'],
  ['TRY', 440, 'dyn', 'ysy'], ['TRY', 1550, 'dyn', 'ysy'],
  ['TRY', 2180, 'ysy', 'dyn'], ['TRY', 1000, 'ysy', 'dyn'],
  ['USD', 140, 'dyn', 'ysy'],
];
const TRIP_PEOPLE = ['ysy', 'dyn'];
const tripItems = (cur) => TRIP.filter(r => r[0] === cur).map(([, amount, payer, owner]) => ({
  amount: String(amount),
  payer,
  shares: owner
    ? { ysy: owner === 'ysy' ? amount : 0, dyn: owner === 'dyn' ? amount : 0 }
    : buildShares({ amount: String(amount), mode: 'even', participants: TRIP_PEOPLE }, TRIP_PEOPLE),
}));

test('★ 真实旅行:41 笔 / 5 币种 / 双向单独付,逐币种结算', () => {
  // 期望值由表格独立算出,不是从代码反推的
  const expect = {
    CNY: { from: 'dyn', to: 'ysy', amount: 891.825 },
    EUR: { from: 'ysy', to: 'dyn', amount: 8.29 },
    GBP: { from: 'dyn', to: 'ysy', amount: 19.825 },
    TRY: { from: 'ysy', to: 'dyn', amount: 1756.365 },
    USD: { from: 'ysy', to: 'dyn', amount: 140 },
  };
  for (const [cur, want] of Object.entries(expect)) {
    const { lines } = settleOne(tripItems(cur), cur, TRIP_PEOPLE);
    assert.equal(lines.length, 1, `${cur} 应该只需要一笔转账`);
    assert.equal(lines[0].from, want.from, `${cur} 付款方`);
    assert.equal(lines[0].to, want.to, `${cur} 收款方`);
    // 容差 0.02 不是偷懒:分账要落到「分」,奇数金额必然有一分的取整
    // (¥539.95 → 269.97/269.98,¥781.73、¥1292.45 同理)。三笔累起来是 1.5 分。
    // 表格里用精确小数算出的 891.825 是理想值,891.84 才是真实付得出去的钱 —— App 是对的。
    assert.ok(near(lines[0].amount, want.amount, 0.02),
      `${cur} 金额:算出 ${lines[0].amount},应为 ${want.amount}`);
  }
});

test('★ 真实旅行:每个币种都守恒 —— 净额之和必须是 0', () => {
  for (const cur of ['CNY', 'EUR', 'GBP', 'TRY', 'USD']) {
    const { rows } = settleOne(tripItems(cur), cur, TRIP_PEOPLE);
    const total = rows.reduce((s, r) => s + r.net, 0);
    assert.ok(near(total, 0), `${cur} 不守恒:净额之和 ${total}`);
    // 垫付总额 == 分摊总额,否则有钱凭空多出来或消失
    const paid = rows.reduce((s, r) => s + r.paid, 0);
    const owed = rows.reduce((s, r) => s + r.owed, 0);
    assert.ok(near(paid, owed, 0.02), `${cur} 垫付 ${paid} != 分摊 ${owed}`);
  }
});

test('★ 单独付不能被算成均分 —— 这是两人互相代付时最容易错的一处', () => {
  // dyn 替 ysy 付的 ₺140 戒指(美金那笔同理):ysy 全额欠,不是欠一半
  const items = tripItems('USD');
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].shares, { ysy: 140, dyn: 0 });
  const { rows } = settleOne(items, 'USD', TRIP_PEOPLE);
  const ysy = rows.find(r => r.person === 'ysy');
  assert.equal(ysy.owed, 140, 'ysy 该承担全额 140,不是 70');
  assert.equal(ysy.paid, 0);
});

// ── 个人支出流水(「我的支出」那张表) ────────────────────
// 这一组守的是**担 vs 垫**。两个数经常差得很远,而界面上只差一个字。
test('★ 口径是「担」不是「垫」—— 垫付人自己只算他那一份', () => {
  // ₺4500 的水宫门票,ysy 垫的,两人均分
  const items = [{ id: 't', amount: '4500', payer: 'ysy', shares: { ysy: 2250, dyn: 2250 } }];
  const ysy = personSpendRows(items, 'ysy');
  assert.equal(ysy.length, 1);
  assert.equal(ysy[0].mine, 2250, '垫了 4500,但只花掉 2250');
  assert.equal(ysy[0].total, 4500, '总额也要给出来,否则用户以为自己花了 4500');
  // 没垫钱的那个,花掉的一样是 2250
  assert.equal(personSpendRows(items, 'dyn')[0].mine, 2250);
});

test('单独付:替别人垫的钱不算自己的消费', () => {
  // dyn 垫的 $140 戒指,东西是 ysy 的
  const items = [{ id: 'r', amount: '140', payer: 'dyn', shares: { ysy: 140, dyn: 0 } }];
  assert.equal(personSpendRows(items, 'dyn').length, 0, 'dyn 垫了钱但一分没花');
  assert.equal(personSpendRows(items, 'ysy')[0].mine, 140, 'ysy 没垫钱但全额是他花的');
});

test('分摊为 0 的不进流水 —— 那笔账他没参与', () => {
  const items = [
    { id: 'a', amount: '60', shares: { A: 30, B: 30, C: 0 } },
    { id: 'b', amount: '20', shares: { A: 20 } },
  ];
  assert.deepEqual(personSpendRows(items, 'C'), []);
  assert.equal(personSpendRows(items, 'A').length, 2);
});

test('★ 负分摊照样保留 —— 悄悄滤掉会让人对不上总额还找不到原因', () => {
  const items = [{ id: 'x', amount: '100', shares: { A: -50 } }];
  assert.equal(personSpendRows(items, 'A').length, 1);
  assert.equal(personSpendRows(items, 'A')[0].mine, -50);
});

test('流水合计 == settleOne 里那个人的 owed(两处口径必须一致)', () => {
  const items = [
    { amount: '60', payer: 'Lyra', shares: buildShares({ amount: '60', participants: P }, P) },
    { amount: '31', payer: 'Ning', shares: buildShares({ amount: '31', participants: P }, P) },
    { amount: '140', payer: 'Max', shares: { Lyra: 140, Ning: 0, Max: 0 } },
  ];
  const { rows } = settleOne(items, '€', P);
  for (const person of P) {
    const flow = personSpendRows(items, person).reduce((s, r) => s + r.mine, 0);
    const owed = rows.find(r => r.person === person).owed;
    assert.ok(near(flow, owed), `${person}:流水 ${flow} != 应承担 ${owed}`);
  }
});

test('脏输入不产生 NaN,也不抛', () => {
  assert.deepEqual(personSpendRows(null, 'A'), []);
  assert.deepEqual(personSpendRows([], 'A'), []);
  assert.deepEqual(personSpendRows([{ id: 'a' }], 'A'), []);        // 没有 shares
  assert.deepEqual(personSpendRows([{ shares: { A: 1 } }], null), []); // 没有人名
  const r = personSpendRows([{ amount: '乱码', shares: { A: '12.5' } }], 'A');
  assert.equal(r[0].mine, 12.5);
  assert.equal(r[0].total, 0, '金额读不出来记 0,不是 NaN');
});
