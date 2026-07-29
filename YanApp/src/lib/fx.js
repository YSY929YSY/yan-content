// 言 · 汇率(参考价)
// 数据源:Frankfurter(欧洲央行每日参考汇率,免费、无需 key)。
// 设计前提:
//  1. 旅行中最需要换算的时候常常没网 —— 一律先给缓存,再后台刷新;永远不让用户对着转圈。
//  2. 欧央行只在工作日发布 —— 数据会缺周末,取序列时按"最近一个有值的日子"理解。
//  3. 这是银行间中间价,不是你刷卡拿到的价 —— 展示层必须写清楚,别让用户以为能按这个数结算。
import AsyncStorage from '@react-native-async-storage/async-storage';

const FX_KEY = 'yan_fx_v1';
const API = 'https://api.frankfurter.dev/v1';
const BASE = 'EUR';                 // 统一以 EUR 为轴,任意两币种走交叉汇率
const FRESH_MS = 6 * 60 * 60 * 1000; // 6 小时内的缓存直接用,不再请求

// App 里用符号,接口要 ISO 代码
export const FX_CODES = { '€': 'EUR', '£': 'GBP', '₺': 'TRY', $: 'USD', '¥': 'CNY', '₩': 'KRW' };
export const FX_SYMBOLS = { EUR: '€', GBP: '£', TRY: '₺', USD: '$', CNY: '¥', KRW: '₩' };
export const FX_NAMES = {
  EUR: '欧元', GBP: '英镑', TRY: '土耳其里拉', USD: '美元', CNY: '人民币', KRW: '韩元',
};
const SYMBOLS = Object.keys(FX_SYMBOLS).filter(c => c !== BASE);

const readCache = async () => {
  try {
    const raw = await AsyncStorage.getItem(FX_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const writeCache = async (data) => {
  try { await AsyncStorage.setItem(FX_KEY, JSON.stringify(data)); } catch { /* 存不下就算了 */ }
};

const ymd = (d) => d.toISOString().slice(0, 10);

// 最新汇率(以 EUR 为基准)
async function fetchLatest() {
  const res = await fetch(`${API}/latest?base=${BASE}&symbols=${SYMBOLS.join(',')}`);
  if (!res.ok) throw new Error(`fx ${res.status}`);
  const json = await res.json();
  if (!json?.rates) throw new Error('fx 数据异常');
  return { date: json.date, rates: { ...json.rates, [BASE]: 1 } };
}

// 近 N 天序列,只为画一条小 sparkline;缺周末是正常的
async function fetchSeries(days = 10) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const res = await fetch(`${API}/${ymd(start)}..${ymd(end)}?base=${BASE}&symbols=${SYMBOLS.join(',')}`);
  if (!res.ok) throw new Error(`fx series ${res.status}`);
  const json = await res.json();
  const byDate = json?.rates || {};
  // { TRY: [{ d, v }...] },按日期升序
  const out = {};
  Object.keys(byDate).sort().forEach(d => {
    Object.entries(byDate[d]).forEach(([code, v]) => {
      (out[code] = out[code] || []).push({ d, v });
    });
  });
  return out;
}

/**
 * 取汇率。先回缓存(可能是旧的),需要时再联网刷新。
 * @returns {{ rates, date, series, fetchedAt, stale, error }}
 */
export async function getRates({ force = false } = {}) {
  const cached = await readCache();
  const fresh = cached && !force && Date.now() - (cached.fetchedAt || 0) < FRESH_MS;
  if (fresh) return { ...cached, stale: false };

  try {
    const [latest, series] = await Promise.all([
      fetchLatest(),
      fetchSeries().catch(() => cached?.series || {}), // 序列失败不影响主功能
    ]);
    const next = { ...latest, series, fetchedAt: Date.now() };
    await writeCache(next);
    return { ...next, stale: false };
  } catch (e) {
    // 没网:有缓存就用旧的并标记 stale,没缓存才算真失败
    if (cached) return { ...cached, stale: true };
    return { rates: null, date: null, series: {}, stale: true, error: e?.message || String(e) };
  }
}

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
