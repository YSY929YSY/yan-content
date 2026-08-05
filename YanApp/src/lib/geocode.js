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
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { K } from './storage';
import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────
// 系统自带的地名服务(iOS 用 CLGeocoder)。
//
// 为什么要它:nominatim.openstreetmap.org 从国内访问不到 —— 不是慢,是
// 连不上(手机 Safari 直接打不开)。整个「添加地点」和「照片导入反查地名」
// 都建立在一个用户根本够不着的服务上。
//
// 系统服务的三个好处:国内可用、没有每秒 1 次的限速、不算第三方出站请求
// (不必写进隐私政策)。
//
// 权限:iOS 的地理编码**不需要定位权限**(expo-location 文档里
// 「must request location permissions」那句只针对 Android)。所以言不会
// 申请定位权限 —— 一个不做位置追踪的 App 去要定位权限,审核一定会问。
//
// Android 的地理编码依赖 Google Play 服务且需要定位权限,国行机常常没有,
// 所以那边仍然走 Nominatim 兜底。
// ─────────────────────────────────────────────────────────────
const OS_GEOCODER_OK = Platform.OS === 'ios';

// ⚠️ 系统地理编码只能当国内兜底,不能当主力。
// 国区的 Apple 地图用高德数据,只有国内结果:查「伊斯坦布尔」返回成都市,
// 查「格雷梅」返回保定市 —— 它不会告诉你查不到,而是给一个看起来合理的
// 错误坐标。所以主力走服务端代理(见 supabase/functions/geocode),
// 只有代理不可用时才退到系统,并且结果会标上来源让 UI 提醒用户核对。

/**
 * 服务端代理。手机只连 Supabase(国内可达),由服务端去连 Nominatim。
 * 和 parse-itinerary 同一个道理:能不能连上第三方是服务端的事,不是用户的事。
 */
async function viaProxy(payload) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('geocode', { body: payload });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data ?? null;
  } catch (e) {
    console.warn('[Geocode] proxy failed:', e?.message);
    return null;
  }
}

/** 系统反查。失败返回 null,由调用方决定要不要退回 Nominatim。 */
async function osReverse(lat, lng) {
  if (!OS_GEOCODER_OK) return null;
  try {
    const rows = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const r = rows?.[0];
    if (!r) return null;
    // name 常常就是 POI 名(「圣索菲亚大教堂」),比区名有用得多
    const name = r.name || r.district || r.subregion || r.city || r.region || '未知地点';
    return {
      name,
      city: r.city || r.subregion || r.region || '',
      country: r.country || '',
      lat, lng,
    };
  } catch (e) {
    console.warn('[Geocode] os reverse failed:', e?.message);
    return null;
  }
}

/** 系统正查。只给坐标,名字用用户输入的那个;城市国家再反查一次补上。 */
async function osSearch(query) {
  if (!OS_GEOCODER_OK) return null;
  try {
    const rows = await Location.geocodeAsync(query);
    const hits = [];
    for (const r of (rows || []).slice(0, 5)) {
      if (!Number.isFinite(r?.latitude) || !Number.isFinite(r?.longitude)) continue;
      const back = await osReverse(r.latitude, r.longitude);
      hits.push({
        name: query,
        city: back?.city || '',
        country: back?.country || '',
        lat: r.latitude,
        lng: r.longitude,
        display: [back?.name, back?.city, back?.country].filter(Boolean).join(', ') || query,
      });
    }
    return hits.length ? hits : null;
  } catch (e) {
    console.warn('[Geocode] os search failed:', e?.message);
    return null;
  }
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const REVERSE_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const UA = 'YanApp/1.0 (ysy929ysy@gmail.com)';
const CACHE_KEY = K.geocodeCache;
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

// Nominatim 每秒最多 1 次。EXIF 导入会连着反查十几个坐标,
// 不排队就会被限流甚至封 IP —— 所有出站请求走同一条串行队列。
let gate = Promise.resolve();
function serialize(fn) {
  const run = gate.then(fn, fn);
  gate = run.then(() => new Promise(r => setTimeout(r, 1100)),
                  () => new Promise(r => setTimeout(r, 1100)));
  return run;
}

/**
 * 按坐标反查地名(EXIF 导入用)。
 *
 * 缓存按 ~1km 网格取整,不按精确坐标 —— 同一次旅行里几十张照片的坐标各不相同
 * 但都在一个街区,不取整的话每张都要发一次请求,限速下要等好几分钟。
 *
 * @returns {Promise<{name,city,country,lat,lng}|null>} 查不到返回 null(不是抛错)
 */
export async function reverseGeocode(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cache = await loadCache();
  const key = `r|${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (cache[key]) return cache[key];

  // 代理优先:它连的是 Nominatim,全球覆盖且不受用户所在国家影响。
  const p = await viaProxy({ op: 'reverse', lat, lng });
  if (p?.place) {
    cache[key] = p.place;
    await saveCache(cache);
    return p.place;
  }

  // 代理不可用时退到系统。国区只有国内数据,查国外坐标多半返回 null,
  // 那样反而是安全的 —— 宁可没名字,也不要一个错的名字。
  const os = await osReverse(lat, lng);
  if (os) {
    cache[key] = os;
    await saveCache(cache);
    return os;
  }

  return serialize(async () => {
    // 排队期间可能已经被别的请求填上了
    const c = await loadCache();
    if (c[key]) return c[key];

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const url = `${REVERSE_ENDPOINT}?lat=${lat}&lon=${lng}&format=jsonv2`
        + '&addressdetails=1&zoom=14&accept-language=zh';
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`reverse ${res.status}`);
      const r = await res.json();
      if (!r || r.error) return null;

      const { city, country } = pickPlace(r.address);
      const out = {
        name: r.name || city || (r.display_name || '').split(',')[0].trim() || '未知地点',
        city, country, lat, lng,
      };
      c[key] = out;
      await saveCache(c);
      return out;
    } catch (e) {
      console.warn('[Geocode] reverse failed:', e?.message);
      return null;
    } finally {
      clearTimeout(timer);
    }
  });
}

/**
 * 按地名搜索,返回候选列表。
 * @returns {Promise<Array<{name,city,country,lat,lng,display}>>}
 *          失败返回空数组 —— 搜不到不该阻断打卡,用户仍可只记名字。
 */
export async function searchPlace(query, { limit = 5 } = {}) {
  const r = await searchPlaceDetailed(query, { limit });
  return r.hits;
}

/**
 * 同上,但把「请求失败」和「真的没这个地名」分开。
 *
 * 为什么必须分开:这两件事对用户的含义完全相反。
 * 「没搜到」→ 换个写法;「连不上」→ 换个网络,写法再改也没用。
 * 之前两者都返回空数组,于是网络不通时 App 一直在劝用户改地名 ——
 * 和这个项目里踩过的「拿不到数据 ≠ 数据是空的」是同一个错误。
 *
 * @returns {Promise<{hits:Array, error:string|null}>}
 */
export async function searchPlaceDetailed(query, { limit = 5 } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return { hits: [], error: null };

  const cache = await loadCache();
  const key = `${q}|${limit}`;
  // 只认非空的缓存。空结果不缓存 —— 否则一次网络抖动会把「这个地名不存在」
  // 永久钉在本地,以后网络好了也查不出来。
  if (Array.isArray(cache[key]) && cache[key].length) return { hits: cache[key], error: null };

  const p = await viaProxy({ op: 'search', q, limit });
  // 注意 p !== null 就代表代理**成功**了 —— 哪怕 hits 是空的。
  // 「代理说没这个地名」和「代理连不上」是两件事,以前混在一起:
  // 空结果被当成失败,继续去试系统和直连,最后直连超时,报出来的是
  // 「连不上(8s)」。用户看到的原因是错的,而且白等 8 秒。
  if (p && Array.isArray(p.hits)) {
    const hits = p.hits.map(h => ({ ...h, source: 'osm' }));
    if (hits.length) {
      cache[key] = hits;
      await saveCache(cache);
    }
    return { hits, error: null };
  }

  // 退到系统。标 source:'os' —— 国区只有国内数据,查国外地名会返回一个
  // 错误的国内匹配,UI 要据此提醒用户核对,不能默默采用。
  const os = await osSearch(q);
  if (os) {
    const hits = os.map(h => ({ ...h, source: 'os' }));
    cache[key] = hits;
    await saveCache(cache);
    return { hits, error: null };
  }

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

    if (out.length) {
      cache[key] = out;
      await saveCache(cache);
    }
    return { hits: out, error: null };
  } catch (e) {
    // 超时、被限流、DNS 不通 —— 原样报出去,由调用方决定怎么对用户说。
    const msg = e?.name === 'AbortError'
      ? `连接超时(${TIMEOUT_MS / 1000}s)`
      : (e?.message || '网络错误');
    console.warn('[Geocode] search failed:', msg);
    return { hits: [], error: msg };
  } finally {
    clearTimeout(timer);
  }
}
