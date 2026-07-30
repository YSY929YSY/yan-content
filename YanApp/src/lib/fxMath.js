// 言 · 汇率的纯计算部分
//
// 从 fx.js 拆出来:那边要 import AsyncStorage(RN 专有),Node 里跑不了,
// 于是交叉汇率这种「写反了也像个正常数字」的逻辑一直没法测。
// 纯函数单独放,测试直接覆盖。

// App 里用符号,接口要 ISO 代码
// 汇率表统一以 EUR 为轴,任意两币种走交叉汇率
export const BASE = 'EUR';

export const FX_CODES = { '€': 'EUR', '£': 'GBP', '₺': 'TRY', $: 'USD', '¥': 'CNY', '₩': 'KRW' };

export const FX_SYMBOLS = { EUR: '€', GBP: '£', TRY: '₺', USD: '$', CNY: '¥', KRW: '₩' };

export const FX_NAMES = {
  EUR: '欧元', GBP: '英镑', TRY: '土耳其里拉', USD: '美元', CNY: '人民币', KRW: '韩元',
};

// 交叉汇率:1 单位 from 值多少 to
export function rateOf(rates, from, to) {
  if (!rates || !rates[from] || !rates[to]) return null;
  return rates[to] / rates[from];
}

export function convert(amount, rates, from, to) {
  const r = rateOf(rates, from, to);
  if (r == null || !Number.isFinite(amount)) return null;
  return amount * r;
}

// 某个币种对 from 的近期走势(给 sparkline),已按 from 换算
export function seriesFor(cache, from, to) {
  const s = cache?.series || {};
  if (from === BASE) return (s[to] || []).map(p => p.v);
  const a = s[from] || [];
  const b = to === BASE ? null : (s[to] || []);
  if (!a.length) return [];
  const bByDate = b ? Object.fromEntries(b.map(p => [p.d, p.v])) : null;
  return a.map(p => {
    const other = to === BASE ? 1 : bByDate?.[p.d];
    return other == null ? null : other / p.v;
  }).filter(v => v != null);
}

// 金额按币种习惯取小数位:日元/韩元不用小数
export function fxDecimals(code) {
  return code === 'JPY' || code === 'KRW' ? 0 : 2;
}

export function fmtFx(value, code) {
  if (value == null || !Number.isFinite(value)) return '—';
  const d = fxDecimals(code);
  return value.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
