// 言 · 本地存储登记处
//
// 为什么需要它:在这之前,12 个存储键散在 6 个文件里,每个功能自己发明一个键,
// 没有任何地方知道「一共有哪些键、哪些是用户数据、删号该清哪些、登录该补传哪些」。
// 代价不是理论上的,是已经发生过三次的真实 bug:
//
//   1. 删号时手写清单,漏了 5 个键 —— App 里写着「删除全部数据」,实际没删。
//   2. 打卡日期落了盘、手账备注没落 —— 断网写的备注重开就没了。
//   3. 登录补传只补了 2 类数据,漏了 4 类 —— 而登录后匿名 uid 被丢弃,没有第二次机会。
//
// 三次都是同一个原因:靠写代码的人记得。这个文件把「记得」换成「登记」——
// 加新键必须在这里登记,否则 auditKeys() 会在开发时报出来。
//
// 注意:登记的是**言自己的**键,一律 yan_ 前缀。Supabase 的会话存在 sb-* 下,
// 不归这里管(删号时单独 signOut)。
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * kind 决定这份数据在两个关键流程里的命运:
 *
 *   user   用户产生的、丢了不可再生的数据。删号要清,登录换账号要补传。
 *   cache  可以重新拉回来的。删号要清(不清会让下一个账号看到上一个人的残留),
 *          但不需要补传 —— 补传一份能重新下载的东西没有意义。
 *   device 这台设备的偏好/进度,不跟账号走。删号清,不补传。
 *
 * backfill 标的是 backfillAll() 里对应的域名,null 表示不参与补传。
 */
const REGISTRY = {
  wordbankProgress: {
    key: 'yan_wordbank_progress', kind: 'user', backfill: 'progress',
    desc: '单词学习进度(间隔复习记录:档位/到期日/忘记次数)',
  },
  reviewSession: {
    key: 'yan_review_session_v1', kind: 'device', backfill: null,
    desc: '今日混合复习队列(词/深卡/地点/场景/地铁 五个来源混排)',
    // 和 wordbankSession 的区别:那条属于某本词书,这条是「今天该复习的全部」。
    // 同样不补传 —— 能从 wordbankProgress 重算。
  },
  wordbankSession: {
    key: 'yan_wordbank_session_v1', kind: 'device', backfill: null,
    desc: '今日复习队列(哪天挑的、挑了哪些、做完了哪些)',
    // 不补传:它能从 wordbankProgress 完整重算,补一份能重新算出来的东西没有意义。
    // 但必须落盘 —— 在这之前它是组件里的 useState,退出页面就没了,
    // 重进就换一批词,用户永远做不完「今天的任务」。
  },
  worldVisitedIds: {
    key: 'yan_world_footprint_visited_ids', kind: 'user', backfill: 'checkins',
    desc: '精选地点:去过的 id',
  },
  worldCheckinDates: {
    key: 'yan_world_checkin_dates', kind: 'user', backfill: 'checkins',
    desc: '精选地点:打卡日期(旅迹靠它画)',
  },
  worldPlaceNotes: {
    key: 'yan_world_place_notes', kind: 'user', backfill: 'checkins',
    desc: '精选地点:手账备注',
  },
  worldPhotoPaths: {
    key: 'yan_world_footprint_photo_paths', kind: 'user', backfill: 'checkins',
    desc: '精选地点:Storage 照片路径(签名 URL 靠它现签)',
  },
  worldPhotos: {
    key: 'yan_world_footprint_photos', kind: 'device', backfill: null,
    desc: '精选地点:本机相册 uri(换机后无效,故不补传)',
  },
  worldMeta: {
    key: 'yan_world_footprint_meta', kind: 'device', backfill: null,
    desc: '精选地点:本地存档版本号',
  },
  userPlaces: {
    key: 'yan_user_places_v1', kind: 'user', backfill: 'userPlaces',
    desc: '自定义打卡地点',
  },
  tripNotebook: {
    key: 'yan_trip_notebook_v1', kind: 'user', backfill: 'notebook',
    desc: '旅行本(行程/账目/预算)',
  },
  moments: {
    key: 'yan_moments_v1', kind: 'user', backfill: 'moments',
    desc: '手账采集层:瞬间(时间/坐标/一句话)+ 照片的本机路径',
    // 采集层。本机这份是完整事实 —— 拼一页不能等网,所以先落本机再谈上传。
  },
  momentTags: {
    key: 'yan_moment_tags_v1', kind: 'user', backfill: 'moments',
    desc: '手账语义层:city / first / trip / place… 注解标签',
    // 标签是注解、理论上可重建,但「第一次」那句话是用户手写的,重建不出来 ——
    // 所以是 user 不是 cache。
  },
  journalPages: {
    key: 'yan_journal_pages_v1', kind: 'user', backfill: 'journal',
    desc: '手账页(含页上元素)+ 城市册',
    // 页是原子单位:元素内嵌在页里,不单开一个键 —— 页和它的元素分两次落盘,
    // 中间断电就会留下一页空纸。
  },
  journalAssets: {
    key: 'yan_journal_assets_v1', kind: 'user', backfill: 'journal',
    desc: '手账素材库元数据(抠图/票根/整图;图片文件本身在 FileSystem)',
  },
  journalPagesV2: {
    key: 'yan_journal_pages_v2', kind: 'user', backfill: 'journal',
    desc: '手账页 v2(重构后的数据结构:type/zIndex/页面单位坐标/页级笔迹)',
    // 单开一个 v2 键,**不覆盖 v1** —— 迁移脚本从 v1 读、往 v2 写,
    // 写坏了 v1 还在。等 v2 在真机上验过再考虑清 v1。
  },
  subwayProgress: {
    key: 'yan_subway_unlocked_idx', kind: 'device', backfill: null,
    desc: '地铁冒险解锁进度',
  },
  backfillPending: {
    key: 'yan_backfill_pending', kind: 'device', backfill: null,
    desc: '登录补传的未完成标记(下次启动据此重试)',
  },
  contentEtag: {
    key: 'yan_content_etag_v1', kind: 'cache', backfill: null,
    desc: '远端内容 ETag',
  },
  geocodeCache: {
    key: 'yan_geocode_cache_v1', kind: 'cache', backfill: null,
    desc: '地名搜索结果缓存',
  },
  fx: {
    key: 'yan_fx_v1', kind: 'cache', backfill: null,
    desc: '汇率缓存',
  },
};

/** 名字 → 键值。业务代码用 K.worldPlaceNotes,不要再手写字符串。 */
export const K = Object.fromEntries(
  Object.entries(REGISTRY).map(([name, meta]) => [name, meta.key])
);

export const PREFIX = 'yan_';

/** 登记在册的全部键。 */
export const registeredKeys = () => Object.values(REGISTRY).map(m => m.key);

/** 按 kind 取键,例如 keysOfKind('user')。 */
export const keysOfKind = (kind) =>
  Object.values(REGISTRY).filter(m => m.kind === kind).map(m => m.key);

/** 参与登录补传的键,按域名分组。backfillAll() 用它,不必各自手写键名。 */
export function backfillGroups() {
  const groups = {};
  for (const meta of Object.values(REGISTRY)) {
    if (!meta.backfill) continue;
    (groups[meta.backfill] ||= []).push(meta.key);
  }
  return groups;
}

// ── 读写 ──────────────────────────────────────────────────────
// 统一在这里做「坏数据当没有」:AsyncStorage 里可能留着上个版本写坏的 JSON,
// 一处 JSON.parse 抛异常就能让整个 hydration 的 useEffect 静默中断,
// 后面该读的键一个都读不到。

/**
 * 读一个键,**区分「读失败」和「确实没有」**。
 *
 * `readJson` 把两者压成同一个 fallback。对只读来显示的地方无所谓,
 * 但对**读完还要写回去**的路径是致命的:读失败 → 当成空 → 拿空的写回磁盘,
 * 那正是硬规矩 1 禁止的「用空值覆盖本地」(这个项目为此丢过至少四次用户数据)。
 *
 * 范式和 `geocode.searchPlaceDetailed`(返回 `{hits, error}`)、
 * `footprintMerge.splitCloudCheckins`(返回 `ok`)一致。
 *
 * 一个刻意的取舍:**JSON 解析失败算 `ok: true` + 空值**。
 * 那是「上个版本写坏的数据」,重试一万次也还是坏的,当没有才能往前走
 * (见下面 readJson 上面那段注释)。**只有拿不到(getItem 抛)才是 ok:false** ——
 * 那才是「这次读不到,下次可能读得到」。
 *
 * @returns {{ ok: boolean, value: any, error: string|null }}
 */
export async function readJsonResult(key) {
  let raw;
  try {
    raw = await AsyncStorage.getItem(key);
  } catch (e) {
    // 真·读不出来。调用方必须**保持现状**,不要写回任何东西
    console.warn('[Storage] read failed:', key, e?.message);
    return { ok: false, value: null, error: e?.message || 'read failed' };
  }
  if (raw == null) return { ok: true, value: null, error: null };   // 确实没有
  try {
    return { ok: true, value: JSON.parse(raw) ?? null, error: null };
  } catch {
    return { ok: true, value: null, error: null };                  // 坏数据当没有
  }
}

export async function readJson(key, fallback = null) {
  const { value } = await readJsonResult(key);
  return value ?? fallback;
}

/** 写失败只 warn,不抛 —— 落盘失败不该让正在进行的用户操作崩掉。 */
export async function writeJson(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('[Storage] write failed:', key, e?.message);
    return false;
  }
}

export async function remove(key) {
  try { await AsyncStorage.removeItem(key); } catch { /* 删不掉就算了 */ }
}

/**
 * 清掉言写的全部本地数据(删号用)。
 *
 * 按前缀清而不是按登记表清:登记表可能漏登记,前缀不会漏。
 * 登记表在这里只用来体检 —— 清到了没登记的键,说明有人加键忘了登记。
 */
export async function wipeAll() {
  try {
    const all = await AsyncStorage.getAllKeys();
    const mine = all.filter(k => k.startsWith(PREFIX));
    if (!mine.length) return { cleared: [], error: null };

    if (__DEV__) {
      const known = new Set(registeredKeys());
      const strays = mine.filter(k => !known.has(k));
      if (strays.length) {
        console.warn('[Storage] 清到了未登记的键,请补登记到 storage.js:', strays);
      }
    }

    await AsyncStorage.multiRemove(mine);
    return { cleared: mine, error: null };
  } catch (e) {
    console.warn('[Storage] wipeAll failed:', e?.message);
    return { cleared: [], error: e?.message || 'unknown' };
  }
}

/**
 * 开发期体检:本机存在但没登记的 yan_ 键。
 *
 * 这是这个文件真正的价值 —— 加了新键忘了登记,不再需要等到「删号没删干净」
 * 或「登录后数据少了一半」才被发现,启动时就会在 console 里报出来。
 */
export async function auditKeys() {
  if (!__DEV__) return [];
  try {
    const all = await AsyncStorage.getAllKeys();
    const known = new Set(registeredKeys());
    const strays = all.filter(k => k.startsWith(PREFIX) && !known.has(k));
    if (strays.length) {
      console.warn('[Storage] 以下键未在 storage.js 登记:', strays);
    }
    return strays;
  } catch {
    return [];
  }
}
