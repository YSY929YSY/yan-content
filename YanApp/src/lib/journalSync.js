// 言 · 手账的登录补传
//
// 只做一件事:登录换账号那一刻,把本机整本手账重传到新账号下。
// 为什么这件事这么要紧:Apple 登录走 signInWithIdToken,匿名 uid 被直接丢弃,
// 挂在旧 uid 下的行全部成为孤儿。这是**唯一**的迁移机会,漏掉的就是永久漏掉。
//
// 拉取(pull)这一版不做:云端目前没有任何手账数据,拉一份空的回来只会带来
// 「拿不到数据 ≠ 数据是空的」那类风险。等真的有第二台设备的场景再写,
// 到时候合并规则要像 ledgerMerge 那样单独写、单独测。
import { supabase } from './supabase';
import { readAll, writeMoments, writeTags, writeAssets, writeJournal } from './journalStore';
import { planMomentUpload, planJournalUpload } from '../features/journal/journalModel';

async function sessionUid() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/** 分批 upsert。一次传几千行会把请求撑爆,而手账的页和素材天然是几百上千的量级。 */
async function upsertAll(table, rows, opts) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 200), opts);
    if (error) throw error;
  }
  return rows.length;
}

/**
 * 补传采集层 + 语义层。
 *
 * nextState 里带着这次为新账号铸的 remoteIds,**上传成功之后**才落盘 ——
 * 先落盘的话,一次失败的补传会把 id 占掉,重试时误以为传过了。
 */
export async function backfillMoments() {
  // 读不到就不要补传:planMomentUpload 会拿残缺的一份去铸 id、上传,
  // 而那份缺的记录在下一次补传里会被当成「新的」再铸一遍 —— 云端多出重复
  const { ok: readOk, moments, tags } = await readAll();
  if (!readOk) return { count: 0, error: '读不到本机手账,这次不补传', idMap: new Map() };
  if (!moments.length && !tags.length) return { count: 0, error: null, idMap: new Map() };
  if (!supabase) return { count: 0, error: 'offline', idMap: new Map() };
  try {
    const uid = await sessionUid();
    if (!uid) return { count: 0, error: 'no session', idMap: new Map() };

    const { rows, nextState, idMap } = planMomentUpload({ moments, tags }, uid);
    // 顺序:瞬间 → 照片 / 标签(后两张表都有指向 moments 的外键)
    let n = await upsertAll('moments', rows.moments);
    await upsertAll('moment_photos', rows.photos);
    await upsertAll('moment_tags', rows.tags, { onConflict: 'moment_id,kind,value' });

    // ⚠️ 本地写失败**必须让整次补传失败**,不能报成功。
    //
    // nextState 里带着刚为这个 uid 铸好的 remoteIds。远端已经写进去了,
    // 而这一步是把「我为这个账号铸的 id 是什么」记在本机。写丢了的话:
    //   · 远端有行,本机不知道
    //   · backfillAll 标记成功、清掉 pending
    //   · 下次补传发现没有 remoteIds,**重新铸一批新 uuid** → 云端多出一整份重复
    //
    // 那正好打破「补传可以安全重试」那条承诺(journal.test.mjs 有一条测试守着它,
    // 但它测的是纯函数 planMomentUpload —— 纯函数确实幂等,断在这条 IO 路径上)。
    // 报失败 + 留着 pending 才对:下次带着同一份 remoteIds 重试,upsert 不会变成两份。
    const okM = await writeMoments(nextState.moments);
    const okT = await writeTags(nextState.tags);
    if (!okM || !okT) {
      return { count: 0, error: '远端已写入但本机没记住铸好的 id,保留 pending 下次重试',
               idMap: new Map() };
    }
    return { count: n, error: null, idMap };
  } catch (e) {
    console.warn('[Journal] backfill moments failed:', e?.message);
    return { count: 0, error: e?.message || 'unknown', idMap: new Map() };
  }
}

/**
 * 补传手账页 / 城市册 / 素材库。
 *
 * momentIdMap 来自 backfillMoments —— 素材的溯源和元素的 moment 引用要接到新 id 上。
 * 拿不到映射(采集层那步失败了)也照传:素材和页本身是用户的作品,
 * 不该因为溯源接不上就整批不传,溯源留空而已。
 */
export async function backfillJournal(momentIdMap = new Map()) {
  const { ok: readOk, pages, cities, assets } = await readAll();
  if (!readOk) return { count: 0, error: '读不到本机手账,这次不补传' };
  if (!pages.length && !assets.length && !cities.length) return { count: 0, error: null };
  if (!supabase) return { count: 0, error: 'offline' };
  try {
    const uid = await sessionUid();
    if (!uid) return { count: 0, error: 'no session' };

    const { rows, nextState } = planJournalUpload({ pages, cities, assets }, uid, momentIdMap);
    // 顺序不能换:素材 → 城市册(封面外键)→ 页 → 页上的元素(asset_id / page_id 外键)
    await upsertAll('journal_assets', rows.assets);
    await upsertAll('journal_cities', rows.cities, { onConflict: 'user_id,city_id' });
    const n = await upsertAll('journal_pages', rows.pages);
    await upsertAll('journal_items', rows.items);

    // 同上:本地写失败要让整次补传失败,否则下次会重新铸 id、云端多出一份重复
    const okA = await writeAssets(nextState.assets);
    const okJ = await writeJournal({ pages: nextState.pages, cities: nextState.cities });
    if (!okA || !okJ) {
      return { count: 0, error: '远端已写入但本机没记住铸好的 id,保留 pending 下次重试' };
    }
    return { count: n, error: null };
  } catch (e) {
    console.warn('[Journal] backfill journal failed:', e?.message);
    return { count: 0, error: e?.message || 'unknown' };
  }
}
