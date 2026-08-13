// 金额归一 + 汇率交叉换算测试
//
// 这两处都出过「看起来正常、其实差很多」的静默错误:
//   · 欧陆小票 "1.056,00" 被按「只留数字和点」清洗成 1.05600 —— 差 1000 倍
//   · 交叉汇率写反会得到倒数,数字仍然像个正常汇率
// 静默算错比崩溃更糟,所以这两块必须有测试兜着。
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAmount } from '../ledgerMath.js';
import { rateOf, convert, FX_CODES, FX_SYMBOLS, fxRangePct, fxRangeText, fmtRate, sumConverted } from '../fxMath.js';

// ── 小票金额归一 ─────────────────────────────────────────
test('normalizeAmount 认得欧陆和英美两种写法', () => {
  assert.equal(normalizeAmount('1.056,00'), '1056.00');   // 土耳其/德法:点千位,逗号小数
  assert.equal(normalizeAmount('1,056.00'), '1056.00');   // 英美:逗号千位,点小数
  assert.equal(normalizeAmount('12.345,67'), '12345.67');
  assert.equal(normalizeAmount('12,345.67'), '12345.67');
});

test('normalizeAmount 处理无千位分隔的普通写法', () => {
  assert.equal(normalizeAmount('60.06'), '60.06');
  assert.equal(normalizeAmount('60,06'), '60.06');
  assert.equal(normalizeAmount('1056'), '1056');
  assert.equal(normalizeAmount('.50'), '0.50');
});

test('normalizeAmount 把三位分组当千位而不是小数', () => {
  assert.equal(normalizeAmount('1.056'), '1056');
  assert.equal(normalizeAmount('1,056'), '1056');
});

test('normalizeAmount 剥掉货币符号和空值', () => {
  assert.equal(normalizeAmount('EUR 60.06'), '60.06');
  assert.equal(normalizeAmount('₺1.056,00'), '1056.00');
  assert.equal(normalizeAmount(''), '');
  assert.equal(normalizeAmount(null), '');
  assert.equal(normalizeAmount(undefined), '');
  assert.equal(normalizeAmount('abc'), '');
});

test('normalizeAmount 结果永远能被 parseFloat 正确读出', () => {
  const cases = ['1.056,00', '1,056.00', '60.06', '60,06', '12.345,67', '.50'];
  cases.forEach(c => {
    const v = Number.parseFloat(normalizeAmount(c));
    assert.ok(Number.isFinite(v) && v > 0, `${c} → ${normalizeAmount(c)} 不是有效数字`);
  });
});

// ── 汇率交叉换算 ─────────────────────────────────────────
const RATES = { EUR: 1, GBP: 0.8555, TRY: 53.8564, USD: 1.1367, CNY: 7.6969, KRW: 1658.96 };
const CODES = Object.keys(RATES);

test('rateOf 方向正确(1 EUR 值多少 TRY,不是倒数)', () => {
  assert.ok(Math.abs(rateOf(RATES, 'EUR', 'TRY') - 53.8564) < 1e-9);
  assert.ok(Math.abs(rateOf(RATES, 'TRY', 'EUR') - 1 / 53.8564) < 1e-9);
});

test('rateOf 缺币种返回 null,不返回 NaN', () => {
  assert.equal(rateOf(RATES, 'EUR', 'XXX'), null);
  assert.equal(rateOf(RATES, 'XXX', 'EUR'), null);
  assert.equal(rateOf(null, 'EUR', 'TRY'), null);
});

test('交叉汇率等于直接相除', () => {
  const cross = rateOf(RATES, 'GBP', 'TRY');
  assert.ok(Math.abs(cross - RATES.TRY / RATES.GBP) < 1e-12);
});

test('任意两币种往返换算回到原值(36 组)', () => {
  let checked = 0;
  CODES.forEach(from => CODES.forEach(to => {
    const back = convert(convert(100, RATES, from, to), RATES, to, from);
    assert.ok(Math.abs(back - 100) < 1e-9, `${from}→${to}→${from} = ${back}`);
    checked += 1;
  }));
  assert.equal(checked, 36);
});

test('同币种换算是恒等', () => {
  CODES.forEach(c => assert.equal(convert(42, RATES, c, c), 42));
});

test('convert 对非数字返回 null', () => {
  assert.equal(convert(NaN, RATES, 'EUR', 'TRY'), null);
  assert.equal(convert(100, RATES, 'EUR', 'XXX'), null);
});

// ── 符号 / 代码映射 ──────────────────────────────────────
test('币种符号和 ISO 代码一一对应,不缺不错', () => {
  Object.entries(FX_CODES).forEach(([sym, code]) => {
    assert.equal(FX_SYMBOLS[code], sym, `${code} 反查符号不是 ${sym}`);
  });
  assert.equal(Object.keys(FX_CODES).length, Object.keys(FX_SYMBOLS).length);
});

test('账本用的 6 个币种都能换算(否则合并结算会静默失效)', () => {
  Object.values(FX_CODES).forEach(code => {
    assert.ok(RATES[code] != null, `${code} 不在汇率表里`);
  });
});

// ── 汇率波动(结算里的折算行和汇率浮层共用这一套说法) ──────────
test('fxRangePct 是 (最高-最低)/最低 的百分比', () => {
  assert.ok(Math.abs(fxRangePct([100, 110, 105]) - 10) < 1e-9);
  assert.equal(fxRangePct([5, 5, 5, 5]), 0);
});

test('★ 点太少返回 null,不返回 0 —— 「不知道」和「没波动」不是一回事', () => {
  assert.equal(fxRangePct([]), null);
  assert.equal(fxRangePct([1]), null);
  assert.equal(fxRangePct([1, 2]), null);
  assert.equal(fxRangePct(null), null);
  assert.equal(fxRangePct(undefined), null);
  assert.equal(fxRangePct('不是数组'), null);
});

test('脏数据不产生 NaN/Infinity', () => {
  assert.equal(fxRangePct([NaN, NaN, NaN]), null);
  assert.equal(fxRangePct([0, 0, 0]), null);        // 除以 0
  assert.equal(fxRangePct([1, 2, NaN]), null);      // 剩两个有效点,不够
  const r = fxRangePct([1, 2, 3, NaN]);
  assert.ok(Number.isFinite(r));
});

test('波动文案:0.5% 以下叫基本持平,别诱导人计较不值得计较的', () => {
  assert.match(fxRangeText([100, 100.2, 100.1]), /基本持平/);
  assert.match(fxRangeText([100, 110, 105]), /近十天波动 10\.0%/);
});

test('★ 没有走势数据时退回「银行间参考价」,不显示 NaN%', () => {
  assert.equal(fxRangeText([]), '银行间参考价');
  assert.equal(fxRangeText(null), '银行间参考价');
  assert.ok(!fxRangeText([0, 0, 0]).includes('NaN'));
});

test('★ 汇率格式化不能把小汇率舍没 —— 1 ₺ = 0.1418 ¥ 不是 0.14', () => {
  assert.equal(fmtRate(0.1418), '0.1418');
  assert.equal(fmtRate(0.00123456), '0.001235');
  assert.equal(fmtRate(53.8564), '53.8564');
  assert.equal(fmtRate(1), '1');
  assert.equal(fmtRate(53.85), '53.85');       // 末尾的 0 不留
});

test('汇率格式化对脏值给「—」,不给 NaN', () => {
  assert.equal(fmtRate(null), '—');
  assert.equal(fmtRate(undefined), '—');
  assert.equal(fmtRate(NaN), '—');
  assert.equal(fmtRate(Infinity), '—');
  assert.equal(fmtRate(0), '0');
});

// ── 多币种折算求和(「我的支出」的总数、预算进度) ──────────────
test('sumConverted 把几个币种折算到一个币种加起来', () => {
  const r = sumConverted([
    { code: 'EUR', amount: 100 },
    { code: 'TRY', amount: 5385.64 },   // = 100 EUR
  ], RATES, 'EUR');
  assert.equal(r.ok, true);
  assert.deepEqual(r.missing, []);
  assert.ok(Math.abs(r.total - 200) < 1e-6);
});

test('目标币种自己那笔原样相加,不绕一圈汇率', () => {
  const r = sumConverted([{ code: 'EUR', amount: 42.42 }], RATES, 'EUR');
  assert.equal(r.total, 42.42, '不该因为来回换算掉精度');
});

test('★ 有换不了的币种时 ok:false —— 少算的总额长得和正确答案一模一样', () => {
  const r = sumConverted([
    { code: 'EUR', amount: 100 },
    { code: 'XXX', amount: 999 },
  ], RATES, 'EUR');
  assert.equal(r.ok, false, '调用方必须能看出这个总数不完整');
  assert.deepEqual(r.missing, ['XXX']);
  assert.ok(Math.abs(r.total - 100) < 1e-6, 'total 只是「能换的那部分」');
});

test('★ 没有汇率表时 ok:false,不返回一个 0 当总额', () => {
  for (const bad of [null, undefined]) {
    const r = sumConverted([{ code: 'EUR', amount: 100 }], bad, 'EUR');
    assert.equal(r.ok, false);
  }
  assert.equal(sumConverted([{ code: 'EUR', amount: 1 }], RATES, null).ok, false);
  assert.equal(sumConverted(null, RATES, 'EUR').ok, false);
});

test('空清单是「真的没有」,算得出来:ok 且总额 0', () => {
  const r = sumConverted([], RATES, 'EUR');
  assert.equal(r.ok, true);
  assert.equal(r.total, 0);
});

test('脏条目跳过,不产生 NaN', () => {
  const r = sumConverted([
    { code: 'EUR', amount: 100 },
    { code: 'EUR', amount: NaN },
    null,
    { code: 'EUR' },
  ], RATES, 'EUR');
  assert.equal(r.ok, true);
  assert.ok(Number.isFinite(r.total));
  assert.ok(Math.abs(r.total - 100) < 1e-6);
});

test('真实那趟五个币种能折算成人民币,一个都不缺', () => {
  const r = sumConverted([
    { code: 'TRY', amount: 9887.36 }, { code: 'USD', amount: 140 },
    { code: 'CNY', amount: 10762.49 }, { code: 'EUR', amount: 308.29 },
    { code: 'GBP', amount: 19.82 },
  ], RATES, 'CNY');
  assert.equal(r.ok, true);
  assert.deepEqual(r.missing, []);
  assert.ok(r.total > 10762.49, '折算总额必须大于其中任何单独一项');
});
