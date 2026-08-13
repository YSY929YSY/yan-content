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

/**
 * 把几个币种的金额折算到一个币种并加起来。
 * @param entries [{ code, amount }] —— code 是 ISO 代码(EUR/TRY…),不是符号
 * @returns { total, ok, missing }
 *
 * ⚠️ **ok 为假时绝不能把 total 当成「一共花了多少」显示出去。**
 * 换不了的那几笔不会凭空变成 0,它们是真花掉的钱 —— total 只是「能换的那部分」,
 * 比真实数字小。一个偏小的总额长得和正确答案一模一样,
 * 而用户拿它去判断「我这趟花超了没有」。所以调用方必须先看 ok,
 * 拿不到全部汇率就退回分币种显示,而不是给一个少算了的总数。
 * missing 列出换不了的币种,好让界面说清楚少了谁。
 */
export function sumConverted(entries, rates, toCode) {
  if (!Array.isArray(entries) || !rates || !toCode) {
    return { total: 0, ok: false, missing: [] };
  }
  let total = 0;
  const missing = [];
  for (const e of entries) {
    if (!e || !Number.isFinite(e.amount)) continue;
    if (e.code === toCode) { total += e.amount; continue; }
    const r = rateOf(rates, e.code, toCode);
    if (r == null) { missing.push(e.code); continue; }
    total += e.amount * r;
  }
  return { total, ok: missing.length === 0, missing };
}

/**
 * 近期波动幅度(百分比):(最高 - 最低) / 最低。
 * 少于 3 个点算不出趋势 —— 返回 null,而不是 0。
 * 0 的意思是「没波动」,null 的意思是「不知道」,这两件事不能混。
 */
export function fxRangePct(series) {
  if (!Array.isArray(series) || series.length < 3) return null;
  const nums = series.filter(v => Number.isFinite(v));
  if (nums.length < 3) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (!(min > 0)) return null;
  return ((max - min) / min) * 100;
}

/**
 * 波动的人话。抽出来共用是因为这句话现在有两个地方要说
 * (汇率浮层、分账结算里的折算行)—— 分开写迟早会说成两套口径。
 * 主流货币几天内波动常在 0.3% 以内,所以 0.5% 以下一律叫「基本持平」,
 * 别诱导人去计较不值得计较的东西。
 */
export function fxRangeText(series) {
  const r = fxRangePct(series);
  if (r == null) return '银行间参考价';
  return r < 0.5 ? `近十天基本持平(${r.toFixed(1)}%)` : `近十天波动 ${r.toFixed(1)}%`;
}

// 金额按币种习惯取小数位:日元/韩元不用小数
export function fxDecimals(code) {
  return code === 'JPY' || code === 'KRW' ? 0 : 2;
}

/**
 * 汇率本身的格式化。**不能用 fmtFx** —— 那个按币种取 2 位小数,
 * 而 1 ₺ = 0.1418 ¥ 会被舍成 0.14,差 1.3%,拿着它没法复核一趟旅行的折算。
 * 小于 1 的汇率给 4 位有效数字,大于 1 的给 4 位小数,两头都够复核。
 */
export function fmtRate(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  const s = abs >= 1 ? value.toFixed(4) : Number(value.toPrecision(4)).toString();
  // 去掉没意义的末尾 0(53.8500 → 53.85),但整数保留一位小数以外的都不补
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

export function fmtFx(value, code) {
  if (value == null || !Number.isFinite(value)) return '—';
  const d = fxDecimals(code);
  return value.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
