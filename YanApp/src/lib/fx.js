// 言 · 汇率(参考价)
// 数据源:Frankfurter(欧洲央行每日参考汇率,免费、无需 key)。
// 设计前提:
//  1. 旅行中最需要换算的时候常常没网 —— 一律先给缓存,再后台刷新;永远不让用户对着转圈。
//  2. 欧央行只在工作日发布 —— 数据会缺周末,取序列时按"最近一个有值的日子"理解。
//  3. 这是银行间中间价,不是你刷卡拿到的价 —— 展示层必须写清楚,别让用户以为能按这个数结算。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { K } from './storage';
import { FX_CODES, FX_SYMBOLS, FX_NAMES, rateOf, convert, seriesFor, fxDecimals, fmtFx } from './fxMath';

export { FX_CODES, FX_SYMBOLS, FX_NAMES, rateOf, convert, seriesFor, fxDecimals, fmtFx };

const FX_KEY = K.fx;
const API = 'https://api.frankfurter.dev/v1';
const BASE = 'EUR';                 // 统一以 EUR 为轴,任意两币种走交叉汇率
const FRESH_MS = 6 * 60 * 60 * 1000; // 6 小时内的缓存直接用,不再请求
const TIMEOUT_MS = 8000;            // 裸 fetch 会一直挂着,旅行中的弱网必须掐断

// 带超时的 fetch:超时和网络错误一律抛出,交给上层回退
async function get(url, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

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

// 最新汇率(以 EUR 为基准)。主源失败就换备用源,别让一个域名决定功能能不能用。
async function fetchLatest() {
  try {
    const json = await get(`${API}/latest?base=${BASE}&symbols=${SYMBOLS.join(',')}`);
    if (!json?.rates) throw new Error('数据异常');
    return { date: json.date, rates: { ...json.rates, [BASE]: 1 } };
  } catch (primary) {
    // 备用:open.er-api.com(同样免费无 key),字段名不同,取出需要的币种
    const json = await get(`https://open.er-api.com/v6/latest/${BASE}`);
    const all = json?.rates;
    if (!all) throw new Error(primary?.message || '取不到汇率');
    const rates = { [BASE]: 1 };
    SYMBOLS.forEach(code => { if (all[code] != null) rates[code] = all[code]; });
    const d = json.time_last_update_utc ? new Date(json.time_last_update_utc) : new Date();
    return { date: d.toISOString().slice(0, 10), rates };
  }
}

// 近 N 天序列,只为画一条小 sparkline;缺周末是正常的
async function fetchSeries(days = 10) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const json = await get(`${API}/${ymd(start)}..${ymd(end)}?base=${BASE}&symbols=${SYMBOLS.join(',')}`);
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

