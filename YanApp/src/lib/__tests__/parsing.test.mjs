// 金额归一 + 汇率交叉换算测试
//
// 这两处都出过「看起来正常、其实差很多」的静默错误:
//   · 欧陆小票 "1.056,00" 被按「只留数字和点」清洗成 1.05600 —— 差 1000 倍
//   · 交叉汇率写反会得到倒数,数字仍然像个正常汇率
// 静默算错比崩溃更糟,所以这两块必须有测试兜着。
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAmount } from '../ledgerMath.js';
import { rateOf, convert, FX_CODES, FX_SYMBOLS } from '../fxMath.js';

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
