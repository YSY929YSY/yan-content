// 分账算术测试 —— 零依赖,用 Node 内置 test runner:npm test
//
// 这些用例大多来自真实排查:每一条都对应一次实际发生过的问题或一次人工验算。
// 三条不变量必须一直成立:守恒(分摊之和==总额)、闭合(净额之和==0)、
// 最少(转账笔数 ≤ 有非零净额的人数-1)。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  money, clampMoney, splitEven, buildShares, settleOne,
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
