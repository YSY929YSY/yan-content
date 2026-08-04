// 言 · 打卡记录的统一模型
//
// 在这之前,世界足迹里有两等公民:
//
//   精选地点(43 个)  照片 ✅  手账 ✅  详情 ✅  可编辑 ✅
//   自己记的地点      照片 ❌  手账 只在添加时那一行  详情 ❌  只能删
//
// 而用户真实去过的地方,大部分不在那 43 个里。于是产品体验是断裂的:
// 去了收录过的地方是完整体验,去了没收录的地方就是一行文字加个删除按钮。
//
// userPlaces.js 开头写着这个产品哲学:
//   「打卡 = 工具,任何地方都能记;言的内容 = 惊喜,打到收录过的点会多出一段注记」
// 但代码从来没实现它 —— 两套并行的系统,两套 UI。
//
// 这个文件把它实现出来:对外只有一种东西 —— **打卡记录**。
// 记录有地点、时间、照片、手账。如果它的坐标撞上了言收录过的地方,
// 就额外获得语言卡和文化彩蛋。内容从「门槛」变成「奖励」。
//
// 纯函数,不碰存储也不碰 React —— 合并规则判错会丢用户真实的旅行记录,
// 这种东西必须能测。

/** 约 5km。和地图去重用同一个阈值:「京都」「Kyoto」「京都市」是一个地方。 */
export const NEAR_DEG = 0.045;

export const isNear = (a, b) =>
  Number.isFinite(a?.lat) && Number.isFinite(a?.lng) &&
  Number.isFinite(b?.lat) && Number.isFinite(b?.lng) &&
  Math.abs(a.lat - b.lat) < NEAR_DEG && Math.abs(b.lng - a.lng) < NEAR_DEG;

/**
 * 这条自定义记录踩到言收录的地方了吗?
 * 踩到就把那份内容作为奖励附上,踩不到返回 null —— 不是错误,是常态。
 */
export function matchCurated(record, curatedPlaces) {
  if (!Number.isFinite(record?.lat) || !Number.isFinite(record?.lng)) return null;
  for (const p of curatedPlaces || []) {
    if (!p?.geo) continue;
    if (isNear(record, { lat: p.geo.lat, lng: p.geo.lng })) return p;
  }
  return null;
}

/** 精选地点 → 统一记录。 */
export function fromCurated(place, { visitedIds = [], dates = {}, notes = {}, photoUris = {} } = {}) {
  const been = visitedIds.includes(place.id);
  return {
    key: `curated:${place.id}`,
    source: 'curated',
    id: place.id,
    name: place.name,
    loc: place.loc || '',
    lat: place.geo?.lat ?? null,
    lng: place.geo?.lng ?? null,
    been,
    visitedOn: dates[place.id] || null,
    note: notes[place.id] || '',
    photoUri: photoUris[place.id] || null,
    curated: place,           // 语言卡、文化彩蛋、子地点都在这里面
    editable: false,          // 精选地点的名字和日期由内容决定,用户改的是打卡状态
  };
}

/** 自己记的地点 → 统一记录。curated 由 matchCurated 决定,可能为 null。 */
export function fromCustom(mp, curatedPlaces = [], { photoUris = {} } = {}) {
  const hit = matchCurated(mp, curatedPlaces);
  return {
    key: `custom:${mp.id}`,
    source: 'custom',
    id: mp.id,
    name: mp.name,
    loc: [mp.city, mp.country].filter(Boolean).join(' · '),
    lat: Number.isFinite(mp.lat) ? mp.lat : null,
    lng: Number.isFinite(mp.lng) ? mp.lng : null,
    // 自己记下来的,本身就意味着去过
    been: true,
    visitedOn: mp.visitedOn || mp.createdAt || null,
    note: mp.note || '',
    photoUri: photoUris[mp.id] || null,
    photoPath: mp.photoPath || null,
    curated: hit,             // 撞上收录点就有,这是奖励不是必需
    editable: true,
    hasCoords: Number.isFinite(mp.lat) && Number.isFinite(mp.lng),
  };
}

/**
 * 一条记录该显示哪些「奖励内容」。
 * 精选和自定义走同一个判断 —— 这是两等公民合并的关键:
 * 有没有内容取决于坐标撞没撞上,不取决于这条记录是谁创建的。
 */
export function bonusOf(record) {
  const c = record?.curated;
  if (!c) return null;
  return {
    emoji: c.emoji || null,
    jp: c.jp || null,
    zh: c.zh || null,
    cultureEgg: record.been ? (c.cultureEgg || null) : null,   // 没去过不剧透
    memory: c.memory || null,
    subSpots: Array.isArray(c.subSpots) ? c.subSpots : [],
  };
}
