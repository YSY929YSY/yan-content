// 言 · 旅迹(把打卡点按时间连成一条路线)
//
// 设计原则:宁可不猜,不要猜错。
//
// 实测下来,速度推测只在「城市之间」可信:
//   伦敦→都柏林   463km / 1.5h = 309km/h → 飞机 ✓
//   伊斯坦布尔→卡帕多奇亚 564km / 10h = 56km/h → 陆路(实际夜巴)✓
// 「城市内部」原理上就推不准:
//   京都站→伏见稻荷 直线 2.4km,坐电车 15 分算出来 10km/h,会被推成「骑行」;
//   而且如果两次都记成「京都」,坐标相同、距离为 0,什么都推不出来。
// 所以同城一律不猜方式,只说「在城里」—— 视觉上也对,城内活动本来就该是一个点。
//
// 另一条原则:有权威数据就别推测。
// 行程段来自真实机票/车票 OCR,带明确的 family(flight/transit),
// 那是票上写的,不是猜的。以后接进来时应优先于速度推测。

const EARTH_R = 6371;

/** 两点球面距离(公里)。 */
export function distanceKm(a, b) {
  if (!a || !b) return null;
  const [lat1, lng1, lat2, lng2] = [a.lat, a.lng, b.lat, b.lng];
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

// 只分大类。不分「地铁/公交/步行」—— 那个分不准,分错了比不分伤人。
export const MODES = {
  flight: { key: 'flight', icon: '✈️', label: '飞了一段' },
  rail: { key: 'rail', icon: '🚄', label: '陆路长途' },
  road: { key: 'road', icon: '🚗', label: '城际' },
  local: { key: 'local', icon: '📍', label: '在城里' },
  unknown: { key: 'unknown', icon: '·', label: '' },
};

const SAME_CITY_KM = 25;   // 25km 以内当同城:市区跨度大多在这个量级内

/**
 * 推测一段怎么走的。
 *
 * ⚠️ 关键约束:打卡点只有「日期」没有「时刻」。
 * 隔一天 = 24 小时,但那 24 小时里可能是飞了 1 小时然后休息 23 小时 ——
 * 所以日期粒度下算出来的「平均速度」没有物理意义,
 * 伦敦→都柏林会被算成 19km/h 判成开车,而那段跨海根本开不过去。
 *
 * 所以:有精确耗时(hoursKnown)才用速度;只有日期时改用「距离 + 天数」判断,
 * 而距离本身已经能排除大部分可能 —— 几千公里当天到只能是飞。
 *
 * @param km 距离
 * @param days 相隔天数(0 = 同一天)
 * @param hours 精确耗时(小时);没有就传 null
 */
export function guessMode(km, days, hours = null) {
  if (!Number.isFinite(km)) return MODES.unknown;
  if (km < SAME_CITY_KM) return MODES.local;          // 同城不猜方式

  // 有精确耗时:速度最可靠
  if (Number.isFinite(hours) && hours > 0) {
    const kmh = km / hours;
    if (kmh > 250) return MODES.flight;
    if (kmh > 90) return MODES.rail;
    return MODES.road;
  }

  // 只有日期:按「这个距离在这些天里,最可能是怎么走的」判断。
  //
  // ⚠️ 算法看不见海。伦敦→都柏林 463km,中间隔着爱尔兰海只能飞或坐渡轮,
  // 但从坐标算不出这件事(需要海岸线数据)。同样是 463km 在欧洲大陆就是高铁。
  // 所以中距离一律不猜 —— 说错「陆路长途」比不说更伤,
  // 用户会觉得「你连我怎么来的都搞错」。
  const d = Number.isFinite(days) ? Math.max(days, 0) : null;
  if (km > 1500) return MODES.flight;                  // 这个距离陆路要好几天,基本只能飞
  // 300km 以内:天数不重要 —— 这个距离飞不了也走不动,只可能是陆路。
  // (都柏林→戈尔韦 186km 隔三天,人还是坐车过去的,不会因为隔得久就变成别的方式)
  if (km <= 300) return MODES.road;
  if (d === null) return MODES.unknown;
  if (km > 700) return d <= 1 ? MODES.flight : MODES.unknown;
  return MODES.unknown;                                // 300-700km:高铁?渡轮?短途飞?分不出来
}

const dayOf = (p) => p?.visitedOn || p?.checkedInAt || p?.createdAt || null;

/**
 * 把打卡点连成旅迹。
 * @param {Array} points [{ id, name, lat, lng, visitedOn }]
 * @returns {{ stops, legs, totalKm }}
 *          legs 里每段带 mode;只有一个点或没有坐标时 legs 为空,但 stops 仍在 ——
 *          「只去过一个地方」也是合法的旅迹,不该因为连不成线就什么都不显示。
 */
export function buildJourney(points = []) {
  const stops = points
    .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && dayOf(p))
    .map((p) => ({ ...p, day: dayOf(p) }))
    .sort((a, b) => String(a.day).localeCompare(String(b.day)));

  const legs = [];
  let totalKm = 0;
  for (let i = 1; i < stops.length; i += 1) {
    const from = stops[i - 1];
    const to = stops[i];
    const km = distanceKm(from, to);
    if (km == null) continue;
    const t1 = Date.parse(from.day);
    const t2 = Date.parse(to.day);
    const days = Number.isFinite(t1) && Number.isFinite(t2)
      ? Math.round((t2 - t1) / 86400000)
      : null;
    // 打卡点没有时刻,所以不传 hours —— 日期粒度下速度没有物理意义。
    // 以后接行程段(有具体时间)时再把 hours 传进来。
    const mode = guessMode(km, days, null);
    if (mode.key !== 'local') totalKm += km;   // 同城不计入里程,那不是「走过的路」
    legs.push({ from, to, km, days, mode });
  }
  return { stops, legs, totalKm };
}

/** 按国家汇总,用于「点亮了几个国家」。 */
export function countriesOf(points = []) {
  const set = new Set();
  points.forEach((p) => {
    const c = (p?.country || '').trim();
    if (c) set.add(c);
  });
  return [...set];
}
