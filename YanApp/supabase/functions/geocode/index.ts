// 言 · 地名查询 Edge Function(正查 + 反查)
//
// 部署:
//   supabase functions deploy geocode
// 不需要任何 secret。
//
// 为什么必须放服务端 —— 两个都在客户端试过、都失败了:
//
//   1. 直连 nominatim.openstreetmap.org:国内访问不到。不是慢,是连不上,
//      手机 Safari 直接打不开。表现为 8 秒超时后一句「没搜到」。
//
//   2. 改用 iOS 系统地理编码(CLGeocoder):国区的 Apple 地图用高德数据,
//      只有国内结果。查「伊斯坦布尔」它不会说没有,而是返回**成都市**;
//      查「格雷梅」返回**保定市**。这比连不上更危险 —— 用户会拿到一个
//      看起来合理的错误坐标,并且毫不知情地存下来。
//
// 服务端没有这两个问题:Deno Deploy 在境外,Nominatim 直连;而用户只连
// Supabase,和他所在的国家无关。和 parse-itinerary 是同一个道理。
//
// Nominatim 使用条款:必须带可识别的 User-Agent,每秒最多 1 次,结果要缓存。
// 这里做了进程内节流和缓存;客户端那边也有缓存,两层都留着。

const UA = "YanApp/1.0 (ysy929ysy@gmail.com)";
const SEARCH = "https://nominatim.openstreetmap.org/search";
const REVERSE = "https://nominatim.openstreetmap.org/reverse";
const TIMEOUT_MS = 8000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 进程内缓存。Edge Function 实例会被复用,同一次导入里几十个坐标
// 常常落在同一片区域,这一层能挡掉大部分重复请求。
const cache = new Map<string, unknown>();
const MAX_CACHE = 500;

// Nominatim 每秒最多 1 次,超了会被限流甚至封。串行 + 间隔。
let gate: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = gate.then(fn, fn) as Promise<T>;
  gate = run.then(
    () => new Promise((r) => setTimeout(r, 1100)),
    () => new Promise((r) => setTimeout(r, 1100)),
  );
  return run;
}

function pickPlace(addr: Record<string, string> = {}) {
  const city = addr.city || addr.town || addr.village || addr.county || addr.state || "";
  const country = addr.country || "";
  return { city, country };
}

async function call(url: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function remember(key: string, value: unknown) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();
    const op = body?.op;

    if (op === "search") {
      const q = String(body.q ?? "").trim();
      const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 10);
      if (q.length < 2) return json({ hits: [] });

      const key = `s|${q}|${limit}`;
      if (cache.has(key)) return json({ hits: cache.get(key), cached: true });

      const rows = await serialize(() => call(
        `${SEARCH}?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1`
        + `&limit=${limit}&accept-language=zh`,
      ));
      const hits = (Array.isArray(rows) ? rows : []).map((r: any) => {
        const { city, country } = pickPlace(r.address);
        const short = String(r.name || r.display_name || "").split(",")[0].trim();
        return {
          name: short || q,
          city, country,
          lat: Number.parseFloat(r.lat),
          lng: Number.parseFloat(r.lon),
          display: r.display_name || short,
        };
      }).filter((x: any) => Number.isFinite(x.lat) && Number.isFinite(x.lng));

      if (hits.length) remember(key, hits);
      return json({ hits });
    }

    if (op === "reverse") {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return json({ error: "bad coords" }, 400);
      }
      // 按 ~1km 网格取整:一次旅行几十张照片坐标各不相同却都在一个街区
      const key = `r|${lat.toFixed(2)},${lng.toFixed(2)}`;
      if (cache.has(key)) return json({ place: cache.get(key), cached: true });

      const r: any = await serialize(() => call(
        `${REVERSE}?lat=${lat}&lon=${lng}&format=jsonv2&addressdetails=1`
        + "&zoom=14&accept-language=zh",
      ));
      if (!r || r.error) return json({ place: null });

      const { city, country } = pickPlace(r.address);
      const place = {
        name: r.name || city || String(r.display_name || "").split(",")[0].trim() || "未知地点",
        city, country, lat, lng,
      };
      remember(key, place);
      return json({ place });
    }

    return json({ error: "unknown op" }, 400);
  } catch (e) {
    // 原样把原因带回客户端 —— 「连不上」和「没这个地名」对用户的含义相反,
    // 混成一句「没搜到」会让人一直去改地名,而地名怎么改都没用。
    return json({ error: String((e as Error)?.message || e) }, 502);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
