// 言 · 世界足迹:云端记录的拆分与合并规则
//
// 为什么单独成文件:这段逻辑原本埋在 NaTab 的一个 useEffect 里,和 setState 缠在一起,
// 没法测。而它恰恰是最该测的 —— 「云端有、本地没有」「本地有、云端没有」「两边都有」
// 这三种情况判错任何一种,用户丢的都是真实的旅行记录。
//
// 三条不可动摇的规矩(每一条背后都有一次真实事故):
//
//   1. 拿不到数据 ≠ 数据是空的。
//      pullPlaceCheckins 失败返回 null,调用方必须原样保留本地,不能当成「云端是空的」。
//
//   2. 本地优先于云端。
//      本机是这台设备上最新的事实;云端那份可能是几天前另一台设备传的。
//      合并一律 { ...cloud, ...local },本地键覆盖云端键。
//
//   3. 签名 URL 绝不落盘。
//      云端返回的照片 URL 一小时过期。以前连它一起存,一小时后重开 App 全是裂图。
//      能落盘的只有 photoPath,每次用它现签。

/**
 * 把云端拉回来的打卡记录拆成五份,按用途分开。
 *
 * @param cloud        pullPlaceCheckins() 的返回值(对象;null 表示拉取失败)
 * @param validPlaceIds 当前内容里存在的地点 id 集合
 * @returns 五份数据 + ok 标志;ok=false 表示这次没拿到,调用方不应改动任何本地状态
 */
export function splitCloudCheckins(cloud, validPlaceIds) {
  const empty = {
    ok: false, visitedIds: [], photoUris: {}, photoPaths: {}, dates: {}, notes: {},
  };
  // 规矩 1:null / 非对象一律当作「这次没拿到」,而不是「云端是空的」
  if (!cloud || typeof cloud !== 'object') return empty;

  const valid = validPlaceIds instanceof Set ? validPlaceIds : new Set(validPlaceIds || []);
  const out = {
    ok: true, visitedIds: [], photoUris: {}, photoPaths: {}, dates: {}, notes: {},
  };

  for (const checkin of Object.values(cloud)) {
    if (!checkin || !valid.has(checkin.placeId)) continue;
    if (checkin.status === 'been') out.visitedIds.push(checkin.placeId);
    if (checkin.photoUri) out.photoUris[checkin.placeId] = checkin.photoUri;
    if (checkin.photoPath) out.photoPaths[checkin.placeId] = checkin.photoPath;
    if (checkin.checkedInAt) out.dates[checkin.placeId] = checkin.checkedInAt;
    if (checkin.note) out.notes[checkin.placeId] = checkin.note;
  }
  return out;
}

/** 规矩 2:合并两份 map,本地键覆盖云端键。 */
export const mergeMap = (cloud, local) => ({ ...(cloud || {}), ...(local || {}) });

/** 合并两份 id 列表,去重。去过就是去过,两边取并集,不做删除。 */
export const mergeIds = (cloud, local) =>
  Array.from(new Set([...(local || []), ...(cloud || [])]));

/**
 * 磁盘上读回来的打卡 id 只校验类型,不按当前内容过滤。
 *
 * 为什么:内容源临时少了地点(部署失误、远端和内置版本不一致)时,过滤会让这些打卡
 * 先从内存消失,再被下一次落盘永久删掉 —— 一次内容失误抹掉用户真实的旅行记录。
 * 打卡记录归用户,能不能显示归内容,两件事必须分开。
 */
export const sanitizeVisitedIds = (saved) =>
  Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : [];

/**
 * 地图上的点 = 精选点 + 自己记的点,按坐标去重。
 *
 * 为什么按坐标不按名字:「京都」「Kyoto」「京都市」是三个字符串、一个地方,
 * 名字比不出来。0.045 度约合 5km,以内视为同一处。
 */
export function buildMapPoints(places, myPlaces, { visitedIds = [], checkinDates = {} } = {}) {
  const out = [];
  const visited = new Set(visitedIds);
  const near = (a, b) => Math.abs(a.lat - b.lat) < 0.045 && Math.abs(a.lng - b.lng) < 0.045;

  for (const p of places || []) {
    if (!p.geo) continue;
    out.push({
      id: p.id, name: p.name, lat: p.geo.lat, lng: p.geo.lng,
      been: visited.has(p.id), visitedOn: checkinDates[p.id] || null,
    });
  }
  for (const mp of myPlaces || []) {
    if (!Number.isFinite(mp.lat) || !Number.isFinite(mp.lng)) continue;
    if (out.some(o => near(o, mp))) continue;      // 和精选点重合就不重复画
    out.push({
      id: `my-${mp.id}`, name: mp.name, lat: mp.lat, lng: mp.lng,
      been: true, visitedOn: mp.visitedOn || mp.createdAt, custom: true,
    });
  }
  return out;
}
