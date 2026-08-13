// 言 · 手账的纯逻辑
//
// 这个文件不碰存储也不碰网络也不碰 React —— 手账里判错会直接丢用户的旅行记录
// 和拼好的页,这种东西必须能测。
// 设计文档:docs/journal-data-design.md,schema 在 src/lib/schema.journal.sql。
//
// 三件事在这里实现:
//   城市容器  cityId 的生成/合并(反查不到时先落网格 id,以后再合)
//   「第一次」 只有一个 lens,不落库(见文件末尾那段注释)
//   素材      本机 id ↔ 各账号远端 uuid 的映射,登录换账号时靠它把引用接上

// ─────────────────────────────────────────────────────────────
// id
// ─────────────────────────────────────────────────────────────

/**
 * 时间前缀的 uuid(v7 布局)。
 *
 * 为什么自己生成而不是让服务端生成:手账是本地优先的,一页拼好的时候可能没网。
 * 主键由本机定,补传就能用 upsert —— 重试一次不会多出一整份重复的页。
 * (自定义地点当初没这么做,只能靠 ownerUid + 按位置回填 id,见 userPlaces.js。)
 *
 * 为什么不引 expo-crypto:会加一个原生依赖、要重打 build。前 48 位是毫秒时间戳,
 * 剩下 74 位随机 —— 单人单机的场景下碰撞概率可以忽略,而且天然按时间有序。
 */
export function newId() {
  const ms = Date.now();
  const hex = ms.toString(16).padStart(12, '0');
  const r = () => Math.floor(Math.random() * 16).toString(16);
  const rand = (n) => Array.from({ length: n }, r).join('');
  // 版本位 7,变体位 10xx
  const variant = ['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${rand(3)}-${variant}${rand(3)}-${rand(12)}`;
}

// ─────────────────────────────────────────────────────────────
// 城市 id
// ─────────────────────────────────────────────────────────────

/** 网格精度 0.1°,约 11km。城市尺度,不是地点尺度(地点去重用 record.js 的 5km)。 */
export const CITY_GRID = 1;   // toFixed 的位数

export const slugify = (s) => String(s || '')
  .trim().toLowerCase()
  .replace(/[\s_/]+/g, '-')
  .replace(/[^\p{Letter}\p{Number}-]/gu, '')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

/**
 * 反查成功后的正式 id:city:jp:tokyo。
 * 名字不能直接当 id ——「东京」「Tokyo」「東京都」是一个地方,按名字存会分裂成三本册子。
 * 拿不到国家码或名字就返回 null,由调用方回退到网格 id。
 */
export function cityIdFromPlace({ countryCode, name } = {}) {
  const cc = String(countryCode || '').trim().toLowerCase();
  const slug = slugify(name);
  if (!cc || !slug) return null;
  return `city:${cc}:${slug}`;
}

/**
 * 反查不到时的占位 id。
 *
 * 关键:反查失败**照样收下这条记录**,只是先落在网格上。
 * 拿不到数据 ≠ 数据是空的 —— 人在飞机上、在没信号的山里记的东西不能因为
 * Nominatim 没响应就丢掉。
 */
export function gridCityId({ lat, lng } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `city:?:${lat.toFixed(CITY_GRID)}_${lng.toFixed(CITY_GRID)}`;
}

export const isResolvedCityId = (id) =>
  typeof id === 'string' && id.startsWith('city:') && !id.startsWith('city:?:');

/** 有反查结果就用正式 id,没有就用网格 id,都没有返回 null(这条记录暂时不属于任何城)。 */
export function resolveCityId({ countryCode, name, lat, lng } = {}) {
  return cityIdFromPlace({ countryCode, name }) || gridCityId({ lat, lng });
}

/**
 * 网格 id 反查成功后,把它换成正式 id。
 *
 * 必须一次改完四处:城市册、city 标签、页、素材。改一半的后果是
 * 用户看到两本东京 —— 一本有旧素材,一本有新页,而且再也合不回去。
 * 所以这里返回**整份新状态**,由调用方一次性落盘;中途出错就整个不动。
 */
export function remapCityId(state, oldId, newId, cityPatch = {}) {
  if (!oldId || !newId || oldId === newId) return state;
  const swap = (v) => (v === oldId ? newId : v);

  const cities = [];
  let merged = null;
  for (const c of state.cities || []) {
    if (c.cityId !== oldId && c.cityId !== newId) { cities.push(c); continue; }
    // 目标 id 已经有一本册子(比如同城另一条记录先反查成功了)—— 合成一本,
    // 用户改过的册名/封面/备注优先保留,不能被一次反查覆盖掉。
    merged = {
      ...(merged || {}),
      ...c,
      ...cityPatch,
      cityId: newId,
      resolved: isResolvedCityId(newId),
      title: merged?.title || c.title || cityPatch.title || null,
      coverAssetId: merged?.coverAssetId || c.coverAssetId || null,
      note: merged?.note || c.note || null,
      updatedAt: new Date().toISOString(),
    };
  }
  if (merged) cities.push(merged);

  return {
    ...state,
    cities,
    tags: (state.tags || []).map(t => (t.kind === 'city' ? { ...t, value: swap(t.value) } : t)),
    pages: (state.pages || []).map(p => ({ ...p, cityId: swap(p.cityId) })),
    assets: (state.assets || []).map(a => ({ ...a, cityId: swap(a.cityId) })),
  };
}

// ─────────────────────────────────────────────────────────────
// 标签(语义层)
// ─────────────────────────────────────────────────────────────
// kind 只增不改:place / trip / category / serendipity / mood / city / first
// 云端有 unique(moment_id, kind, value),本机这里也按同一个三元组去重。

export const TAG_KINDS = ['place', 'trip', 'category', 'serendipity', 'mood', 'city', 'first'];

export function addTag(tags, momentId, kind, value, now = new Date().toISOString()) {
  const list = Array.isArray(tags) ? tags : [];
  if (!momentId || !kind || !value) return list;
  if (list.some(t => t.momentId === momentId && t.kind === kind && t.value === value)) return list;
  return [...list, { id: newId(), momentId, kind, value, createdAt: now, remoteIds: {} }];
}

export function removeTag(tags, momentId, kind, value) {
  return (Array.isArray(tags) ? tags : [])
    .filter(t => !(t.momentId === momentId && t.kind === kind && t.value === value));
}

export const tagsOf = (tags, momentId, kind) =>
  (tags || []).filter(t => t.momentId === momentId && (!kind || t.kind === kind));

export const cityOfMoment = (tags, momentId) =>
  tagsOf(tags, momentId, 'city')[0]?.value || null;

// ─────────────────────────────────────────────────────────────
// 「第一次」—— 只有 lens,没有模型
// ─────────────────────────────────────────────────────────────

/**
 * 用户自己写下的那些「第一次」。
 *
 * 数据上它就是 kind='first' 的标签,value 是他自己写的那句话。
 * docs/TODO.md 的三条红线在这里的表现:
 *   · 不预置清单 —— 这个文件里没有任何候选列表,一条都没有
 *   · 不显示未完成 —— 没发生的事在数据里根本不存在,想显示也无从显示
 *   · 不统计数量 —— 所以**不提供 countFirsts()**。想要计数的人得自己写,
 *     写的时候就会看见这段注释。加了计数,下一步一定是进度条,然后就是打卡任务。
 */
export function writtenFirsts(tags, moments) {
  const byId = new Map((moments || []).map(m => [m.id, m]));
  return (tags || [])
    .filter(t => t.kind === 'first')
    .map(t => ({ text: t.value, moment: byId.get(t.momentId) || null, at: t.createdAt }))
    .filter(x => x.moment && !x.moment.deletedAt)
    .sort((a, b) => momentTime(a.moment) - momentTime(b.moment));
}

const momentTime = (m) => {
  const t = Date.parse(m?.takenAt || m?.createdAt || '');
  return Number.isFinite(t) ? t : Infinity;
};

/**
 * 「第一次到这座城」—— **算出来的,不落库**。
 *
 * 落库就是把透镜焊死成模型:一旦有了 is_first 这种列,它就会被别的功能读,
 * 然后开始需要维护、需要回填、删记录时需要同步 ——
 * 一个本来只是「按时间排个序」的事实变成了一份要对账的状态。
 *
 * 返回该城最早的那条瞬间;这座城没有记录就返回 null。
 */
export function firstArrivalOf(moments, tags, cityId) {
  if (!cityId) return null;
  const ids = new Set((tags || [])
    .filter(t => t.kind === 'city' && t.value === cityId)
    .map(t => t.momentId));
  let best = null;
  for (const m of moments || []) {
    if (!ids.has(m.id) || m.deletedAt) continue;
    if (!best || momentTime(m) < momentTime(best)) best = m;
  }
  return best;
}

/** 这条瞬间是不是它所属城市的第一条。用户手写的 first 标签和它是两回事,不要互相同步。 */
export function isFirstArrival(moments, tags, moment) {
  const city = cityOfMoment(tags, moment?.id);
  if (!city) return false;
  return firstArrivalOf(moments, tags, city)?.id === moment.id;
}

// ─────────────────────────────────────────────────────────────
// 归一化:读盘是唯一的迁移入口
// ─────────────────────────────────────────────────────────────
// 坏数据当没有 —— 一条写坏的记录不该让整本手账打不开。

const str = (v) => (typeof v === 'string' ? v : '');
const num = (v) => (Number.isFinite(v) ? v : null);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

export function normalizeMoment(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  return {
    id: String(raw.id),
    takenAt: raw.takenAt || null,
    lat: num(raw.lat), lng: num(raw.lng),
    text: str(raw.text),
    phrase: raw.phrase && typeof raw.phrase === 'object' ? raw.phrase : null,
    source: ['camera_import', 'in_app', 'manual'].includes(raw.source) ? raw.source : 'in_app',
    createdAt: raw.createdAt || null,
    deletedAt: raw.deletedAt || null,
    remoteIds: obj(raw.remoteIds),
    photos: Array.isArray(raw.photos) ? raw.photos.filter(p => p && p.id).map(p => ({
      id: String(p.id),
      localUri: str(p.localUri) || null,      // 本机文件,换机后失效
      storagePath: str(p.storagePath) || null, // 上传后才有
      width: num(p.width), height: num(p.height),
      exifTakenAt: p.exifTakenAt || null,
      exifLat: num(p.exifLat), exifLng: num(p.exifLng),
      remoteIds: obj(p.remoteIds),
    })) : [],
  };
}

export function normalizeTag(raw) {
  if (!raw || !raw.momentId || !raw.kind || !raw.value) return null;
  return {
    id: raw.id ? String(raw.id) : newId(),
    momentId: String(raw.momentId),
    kind: String(raw.kind),
    value: String(raw.value),
    createdAt: raw.createdAt || null,
    remoteIds: obj(raw.remoteIds),
  };
}

/** 成品是什么(页面怎么渲染)。和 schema.journal.sql 的 check 约束是同一份清单。 */
export const ASSET_KINDS = ['cutout', 'scan', 'photo', 'badge', 'paper', 'sticker'];

/**
 * 从哪条口子进来的。
 *
 * **这是产品定义,不是实现细节**(设计文档第三节):提取是去背景,扫描是留原物。
 * 一张票根被当抠图处理过一次,毛边和纸质感就没了,而那正是票根的全部价值 ——
 * 所以两条路径必须在数据里分得开,不能事后靠 kind 猜。
 */
export const ASSET_ENTRIES = ['extract', 'scan', 'upload', 'generated', 'official'];

export function normalizeAsset(raw) {
  if (!raw || !raw.id) return null;
  const kind = ASSET_KINDS.includes(raw.kind) ? raw.kind : 'photo';
  const entry = ASSET_ENTRIES.includes(raw.entry) ? raw.entry : 'upload';
  return {
    id: String(raw.id),
    kind, entry,
    localUri: str(raw.localUri) || null,
    storagePath: str(raw.storagePath) || null,
    width: num(raw.width), height: num(raw.height),
    sourceMomentId: raw.sourceMomentId || null,
    sourcePhotoId: raw.sourcePhotoId || null,
    cityId: str(raw.cityId) || null,
    payload: raw.payload && typeof raw.payload === 'object' ? raw.payload : null,
    createdAt: raw.createdAt || null,
    deletedAt: raw.deletedAt || null,
    remoteIds: obj(raw.remoteIds),
  };
}

/**
 * 新建一条素材记录。
 *
 * 只造记录,**不碰文件** —— 文件先落地、元数据后写,顺序不能反(设计文档第四节):
 * 反过来的话元数据指向一个还不存在的文件,页面上就是一个永久的破图占位。
 * 所以复制文件那一步在 journalStore.importAsset 里,这里拿到的 localUri
 * 已经是落好的本机路径。
 *
 * `storagePath` 一律留空:本地优先,上云是后台补的事。
 */
export function newAsset({
  kind = 'photo', entry = 'upload', localUri = null,
  width = null, height = null, cityId = null,
  sourceMomentId = null, sourcePhotoId = null, payload = null,
} = {}, now = new Date().toISOString(), mint = newId) {
  return normalizeAsset({
    id: mint(),
    kind, entry, localUri, width, height, cityId,
    sourceMomentId, sourcePhotoId, payload,
    storagePath: null,
    createdAt: now,
    remoteIds: {},
  });
}

/**
 * 素材文件的当前路径。
 *
 * **存下来的绝对路径不能直接用。** iOS 的 `documentDirectory` 长这样:
 *   `file:///var/mobile/Containers/Data/Application/{容器UUID}/Documents/`
 * 那个 UUID **不是稳定的** —— 重装、某些系统迁移之后会换一个。于是昨天存的
 * 绝对路径今天指向一个不存在的目录,页面上就是一张永久裂图,而用户已经把它贴上去了。
 * 这和打卡照片的 `portablePath` 是同一个坑的本地版本(见 journal-data-design 第四节)。
 *
 * 所以:**存下来的那串只当文件名用,目录每次现拼。**
 * 纯字符串处理,不碰文件系统,所以能测。
 *
 * @param dir 当前的素材目录(调用方从 FileSystem 现取)
 */
export function assetUriIn(dir, asset) {
  const stored = str(asset?.localUri);
  if (!stored) return null;
  // 以 / 结尾的是目录,不是文件。不挡住的话 `.../journal-assets-v1/` 会被
  // 当成文件名 `journal-assets-v1`,拼出一个查无此物的路径 —— 拼错的路径
  // 比空值坏:空值调用方会回退,假路径它会当真,然后页面上一张永久裂图。
  if (stored.endsWith('/')) return null;
  const name = stored.split('/').filter(Boolean).pop();
  if (!name) return null;
  // 不是我们自己目录里的文件(比如以后支持引用相册原图)就原样返回,别乱改
  if (!stored.includes('journal-assets-')) return stored;
  return `${dir}${name}`;
}

/**
 * 一个「贴上去」的页面元素。
 *
 * 材质和厚度不让调用方填 —— 它们由 kind 决定(见下面的 MATERIALS)。
 * 让每个调用点自己写 lift,迟早会出现两处给贴纸不同的高度,页面就花了。
 */
export function newItem(kind, assetId, patch = {}, mint = newId) {
  const { material, lift } = materialOf(kind);
  return {
    id: mint(),
    kind, assetId: assetId || null, material, lift,
    // 页面正中、占 42% 宽:一个「刚放上去」的安全落点,之后由用户拖。
    x: 0.5, y: 0.5, w: 0.42, scale: 1, rotation: 0, z: 0,
    ...patch,
  };
}

// ─────────────────────────────────────────────────────────────
// 材质与厚度
// ─────────────────────────────────────────────────────────────

/**
 * 每种元素默认什么材质、浮多高。
 *
 * lift 的单位是**页宽千分比**,不是像素 —— 换屏幕、换 300dpi 打印都不用改数据。
 * 这张表是「层次」的全部来源:贴纸浮得高、票根薄、胶带几乎贴在纸上,
 * 三种阴影的偏移和虚实完全不同。给所有元素画同一种柔和阴影,页面就是平的。
 */
export const MATERIALS = {
  photo:    { material: 'photo',   lift: 5 },
  polaroid: { material: 'photo',   lift: 6 },
  scan:     { material: 'scan',    lift: 3 },   // 票根:薄
  cutout:   { material: 'paper',   lift: 4 },
  sticker:  { material: 'sticker', lift: 9 },   // 贴纸:浮得最高
  badge:    { material: 'sticker', lift: 9 },
  tape:     { material: 'tape',    lift: 1 },   // 胶带:几乎贴着纸
  seal:     { material: 'ink',     lift: 0 },   // 印是压进纸里的,没有厚度
  stamp:    { material: 'paper',   lift: 3 },
  text:     { material: 'ink',     lift: 0 },
  ink:      { material: 'ink',     lift: 0 },
};

export const materialOf = (kind) => MATERIALS[kind] || { material: 'paper', lift: 3 };

/**
 * 手写笔迹:存矢量笔画,不存位图。
 *
 * 一笔 = 一串点 [x, y, t, w]:相对坐标 0~1、毫秒时间戳、该点线宽。
 *   · 打印时按 300dpi 重画,不是把屏幕上的线放大成锯齿
 *   · 能整笔擦除 —— 位图做不到,矢量只是删一条记录
 *   · 一页手写几 KB,位图要几 MB
 *   · t 必须存:有它才能回放书写过程。它几乎不占空间,**现在不存以后补不回来**。
 *
 * w 是笔锋:线宽随速度变,快的地方细。没有笔锋的手写是一条均匀的塑料线,
 * 比字库还假 —— iPhone 手指拿不到压力(3D Touch 早废了),但拿得到速度。
 */
export function normalizeInk(payload) {
  const strokes = Array.isArray(payload?.strokes) ? payload.strokes : [];
  return {
    strokes: strokes.map(s => ({
      points: (Array.isArray(s?.points) ? s.points : [])
        .filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .map(p => [p[0], p[1], Number.isFinite(p[2]) ? p[2] : 0, Number.isFinite(p[3]) ? p[3] : 1]),
      color: typeof s?.color === 'string' ? s.color : '#3a2c1e',
      tool: ['pen', 'pencil', 'marker', 'brush'].includes(s?.tool) ? s.tool : 'pen',
    })).filter(s => s.points.length > 1),   // 一个点不成笔
  };
}

export function normalizePage(raw) {
  if (!raw || !raw.id) return null;
  return {
    id: String(raw.id),
    cityId: str(raw.cityId) || null,
    tripId: str(raw.tripId) || null,
    pageDate: str(raw.pageDate) || null,
    bg: str(raw.bg) || 'paper',
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
    deletedAt: raw.deletedAt || null,
    remoteIds: obj(raw.remoteIds),
    items: Array.isArray(raw.items) ? raw.items.filter(i => i && i.id).map(i => ({
      id: String(i.id),
      kind: str(i.kind) || 'photo',
      assetId: i.assetId || null,
      momentId: i.momentId || null,
      // 材质和厚度:没写就按 kind 取默认,不留 null —— 渲染时缺一个就没有阴影
      material: str(i.material) || materialOf(str(i.kind) || 'photo').material,
      lift: Number.isFinite(i.lift) ? i.lift : materialOf(str(i.kind) || 'photo').lift,
      payload: str(i.kind) === 'ink'
        ? normalizeInk(i.payload)
        : (i.payload && typeof i.payload === 'object' ? i.payload : null),
      x: Number.isFinite(i.x) ? i.x : 0.5,
      y: Number.isFinite(i.y) ? i.y : 0.5,
      scale: Number.isFinite(i.scale) ? i.scale : 1,
      rotation: Number.isFinite(i.rotation) ? i.rotation : 0,
      z: Number.isFinite(i.z) ? i.z : 0,
      remoteIds: obj(i.remoteIds),
    })) : [],
  };
}

export function normalizeCity(raw) {
  if (!raw || !raw.cityId) return null;
  return {
    cityId: String(raw.cityId),
    name: str(raw.name) || null,
    nameLocal: str(raw.nameLocal) || null,
    countryCode: str(raw.countryCode) || null,
    lat: num(raw.lat), lng: num(raw.lng),
    resolved: isResolvedCityId(raw.cityId),
    title: str(raw.title) || null,
    coverAssetId: raw.coverAssetId || null,
    note: str(raw.note) || null,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
    deletedAt: raw.deletedAt || null,
  };
}

const clean = (arr, f) => (Array.isArray(arr) ? arr.map(f).filter(Boolean) : []);

export const normalizeMoments = (raw) => ({
  moments: clean(raw?.moments, normalizeMoment),
  tags: clean(raw?.tags, normalizeTag),
});

export const normalizeJournal = (raw) => ({
  pages: clean(raw?.pages, normalizePage),
  cities: clean(raw?.cities, normalizeCity),
});

// ─────────────────────────────────────────────────────────────
// 补传:本机 id ↔ 每个账号一份远端 uuid
// ─────────────────────────────────────────────────────────────
//
// 为什么不能直接 upsert 同一个 id:Apple 登录换了 user id,旧行挂在匿名账号下。
// 拿同一个主键 upsert 到新账号,RLS 的 using 条件(auth.uid() = user_id)不成立,
// 结果是**更新 0 行、不报错** —— 静默什么都没发生,而登录只有这一次迁移机会。
//
// 所以每条记录记一份 remoteIds = { [uid]: 远端 uuid }:
// 换账号 = 为新账号铸一个新 uuid、整份重传,引用关系按同一张映射表改写。
// uuid 预先铸好再上传,所以补传可以安全重试 —— 重试用的是同一个 uuid,
// upsert 到同一个账号自己的行,不会变成两份。

export const remoteIdFor = (rec, uid) => (rec?.remoteIds || {})[uid] || null;

/** 给这个账号铸 id(已经有就复用)。返回 [id, 新记录]。 */
export function mintRemoteId(rec, uid, mint = newId) {
  const has = remoteIdFor(rec, uid);
  if (has) return [has, rec];
  const id = mint();
  return [id, { ...rec, remoteIds: { ...(rec.remoteIds || {}), [uid]: id } }];
}

/**
 * 照片/素材的 storage 路径能不能带着走。
 *
 * 不能:文件在旧账号的目录下({旧 uid}/...),新账号按 RLS 读不到。
 * 传一个必然 403 的路径,页面上就是一张永久裂图 —— 打卡照片踩过这个坑。
 * 留空,本机文件还在(localUri),等重新上传。
 */
export const portablePath = (path, uid) =>
  (typeof path === 'string' && path.startsWith(`${uid}/`) ? path : null);

/**
 * 把本机的瞬间 + 标签整理成三张表的行。
 *
 * 返回 nextState —— 里面带着新铸的 remoteIds,**上传成功后**才该落盘。
 * 先落盘会让一次失败的补传把 id 占掉,重试时以为传过了。
 */
export function planMomentUpload(state, uid, mint = newId) {
  const moments = [];
  const photos = [];
  const tags = [];
  const nextMoments = [];
  const idMap = new Map();

  for (const m of state.moments || []) {
    const [rid, nextM] = mintRemoteId(m, uid, mint);
    idMap.set(m.id, rid);
    const nextPhotos = [];
    for (const p of nextM.photos || []) {
      const [pid, nextP] = mintRemoteId(p, uid, mint);
      // 照片 id 也进同一张映射表:素材的 source_photo_id 要靠它接回去
      idMap.set(p.id, pid);
      nextPhotos.push(nextP);
      photos.push({
        id: pid,
        user_id: uid,
        moment_id: rid,
        storage_path: portablePath(p.storagePath, uid),
        width: p.width, height: p.height,
        exif_taken_at: p.exifTakenAt || null,
        exif_lat: p.exifLat, exif_lng: p.exifLng,
      });
    }
    nextMoments.push({ ...nextM, photos: nextPhotos });
    moments.push({
      id: rid,
      user_id: uid,
      taken_at: m.takenAt || null,
      lat: m.lat, lng: m.lng,
      text: m.text || null,
      phrase: m.phrase || null,
      source: m.source,
      deleted_at: m.deletedAt || null,
    });
  }

  const nextTags = [];
  for (const t of state.tags || []) {
    const momentId = idMap.get(t.momentId);
    // 孤儿标签(瞬间已经不在了)不传 —— 云端有外键,传上去整批会被拒
    if (!momentId) { nextTags.push(t); continue; }
    const [rid, nextT] = mintRemoteId(t, uid, mint);
    nextTags.push(nextT);
    tags.push({ id: rid, user_id: uid, moment_id: momentId, kind: t.kind, value: t.value });
  }

  return {
    rows: { moments, photos, tags },
    nextState: { moments: nextMoments, tags: nextTags },
    idMap,
  };
}

/**
 * 手账这边同理。顺序有讲究:素材要先于册子(封面是外键)和页上的元素(asset_id 是外键)。
 * momentIdMap 由 planMomentUpload 产出,用来把素材的溯源和元素的 moment 引用接到新 id 上。
 */
export function planJournalUpload(state, uid, momentIdMap = new Map(), mint = newId) {
  const assets = [];
  const nextAssets = [];
  const assetMap = new Map();

  for (const a of state.assets || []) {
    const [rid, nextA] = mintRemoteId(a, uid, mint);
    assetMap.set(a.id, rid);
    nextAssets.push(nextA);
    assets.push({
      id: rid,
      user_id: uid,
      kind: a.kind,
      entry: a.entry,
      storage_path: portablePath(a.storagePath, uid),
      width: a.width, height: a.height,
      // 原图可能压根没传上去过 —— 溯源接不上就留空,素材本身照样存在
      source_moment_id: momentIdMap.get(a.sourceMomentId) || null,
      source_photo_id: momentIdMap.get(a.sourcePhotoId) || null,
      city_id: a.cityId || null,
      payload: a.payload || null,
      deleted_at: a.deletedAt || null,
    });
  }

  const cities = (state.cities || []).map(c => ({
    user_id: uid,
    city_id: c.cityId,
    name: c.name, name_local: c.nameLocal,
    country_code: c.countryCode,
    lat: c.lat, lng: c.lng,
    resolved: isResolvedCityId(c.cityId),
    title: c.title, note: c.note,
    cover_asset_id: assetMap.get(c.coverAssetId) || null,
    deleted_at: c.deletedAt || null,
  }));

  const pages = [];
  const items = [];
  const nextPages = [];
  for (const p of state.pages || []) {
    const [rid, nextP] = mintRemoteId(p, uid, mint);
    const nextItems = [];
    for (const it of nextP.items || []) {
      const [iid, nextI] = mintRemoteId(it, uid, mint);
      nextItems.push(nextI);
      items.push({
        id: iid,
        user_id: uid,
        page_id: rid,
        kind: it.kind,
        asset_id: assetMap.get(it.assetId) || null,
        moment_id: momentIdMap.get(it.momentId) || null,
        material: it.material || null,
        lift: Number.isFinite(it.lift) ? it.lift : 0,
        payload: it.payload || null,
        x: it.x, y: it.y, scale: it.scale, rotation: it.rotation, z: it.z,
      });
    }
    nextPages.push({ ...nextP, items: nextItems });
    pages.push({
      id: rid,
      user_id: uid,
      trip_id: p.tripId || null,
      city_id: p.cityId || null,
      page_date: p.pageDate || null,
      bg: p.bg || 'paper',
      deleted_at: p.deletedAt || null,
    });
  }

  return {
    rows: { assets, cities, pages, items },
    nextState: { assets: nextAssets, cities: state.cities || [], pages: nextPages },
    assetMap,
  };
}
