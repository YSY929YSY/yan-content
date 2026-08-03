// 言 · 地名搜索(地理编码)
//
// 用途:自定义打卡时,用户输入地名 → 拿到真实经纬度。
//
// 为什么用 Nominatim 而不是引地图 SDK:
//   自定义打卡的核心诉求是「我去过的地方能记下来」,不是「在地图上拖来拖去」。
//   地名搜索就能满足,而引 MapLibre/Mapbox 意味着新的原生依赖 —— 要重新打
//   dev build、包体积变大、还多一份第三方 SDK 的隐私申报。
//   真实地图留给以后的「行程规划」,那时候才真的需要在地图上点选。
//
// Nominatim 使用条款要点(https://operations.osmfoundation.org/policies/nominatim/):
//   · 必须带能识别应用的 User-Agent
//   · 每秒最多 1 次请求 —— 所以调用方要防抖,不能每敲一个字就搜
//   · 结果要缓存,别重复问同一个词
import AsyncStorage from '@react-native-async-storage/async-storage';

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const UA = 'YanApp/1.0 (ysy929ysy@gmail.com)';
const CACHE_KEY = 'yan_geocode_cache_v1';
const TIMEOUT_MS = 8000;
const MAX_CACHE = 200;

let memCache = null;

async function loadCache() {
  if (memCache) return memCache;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    memCache = raw ? JSON.parse(raw) : {};
  } catch { memCache = {}; }
  return memCache;
}

async function saveCache(cache) {
  // 只留最近 MAX_CACHE 条,防止无限长大
  const keys = Object.keys(cache);
  if (keys.length > MAX_CACHE) {
    const trimmed = {};
    keys.slice(-MAX_CACHE).forEach(k => { trimmed[k] = cache[k]; });
    cache = trimmed;
    memCache = cache;
  }
  try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* 存不下就算了 */ }
}

// 从 Nominatim 的 address 里挑出「城市 / 国家」,不同国家字段名不一样
function pickPlace(addr = {}) {
  const city = addr.city || addr.town || addr.village || addr.county || addr.state || '';
  const country = addr.country || '';
  return { city, country };
}

/**
 * 按地名搜索,返回候选列表。
 * @returns {Promise<Array<{name,city,country,lat,lng,display}>>}
 *          失败返回空数组 —— 搜不到不该阻断打卡,用户仍可只记名字。
 */
export async function searchPlace(query, { limit = 5 } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const cache = await loadCache();
  const key = `${q}|${limit}`;
  if (cache[key]) return cache[key];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1`
      + `&limit=${limit}&accept-language=zh`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`geocode ${res.status}`);
    const rows = await res.json();
    const out = (Array.isArray(rows) ? rows : []).map((r) => {
      const { city, country } = pickPlace(r.address);
      const short = (r.name || r.display_name || '').split(',')[0].trim();
      return {
        name: short || q,
        city,
        country,
        lat: Number.parseFloat(r.lat),
        lng: Number.parseFloat(r.lon),
        display: r.display_name || short,
      };
    }).filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lng));

    cache[key] = out;
    await saveCache(cache);
    return out;
  } catch (e) {
    // 没网、超时、被限流 —— 一律安静失败。用户还能手动只记地名。
    console.warn('[Geocode] search failed:', e?.message);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
