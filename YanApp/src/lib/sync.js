import { supabase } from './supabase';
import { reuploadUserPlaces } from './userPlaces';
import { pushNotebook } from './tripBackup';
import { backfillMoments, backfillJournal } from './journalSync';
import { K, readJson, readJsonResult, writeJson, remove as removeKey } from './storage';
import { toCloudRow, fromCloudRow } from '../features/wordbank/srs';

const CHECKIN_PHOTO_BUCKET = 'checkin-photos';

async function getSessionUser() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user || null;
}

/**
 * 推一条单词进度。
 *
 * 第二个参数是一条**记录**(srs.js 的 { box, dueAt, reps, lapses, lastSeenAt }),
 * 不再是 'learning' / 'mastered' 字符串 —— 云端要能回答「这个词什么时候该再见到」,
 * 只存一个标签是答不了的。传 null 表示退回未学,删除这一行。
 */
export async function pushProgress(wordKey, rec, bookId = 'n5') {
  if (!supabase) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const row = toCloudRow(wordKey, rec, { userId: session.user.id, bookId });
    if (!row) {
      await supabase.from('word_progress')
        .delete()
        .eq('user_id', session.user.id)
        .eq('word_key', wordKey);
    } else {
      await supabase.from('word_progress')
        .upsert(row, { onConflict: 'user_id,word_key' });
    }
  } catch (e) {
    console.warn('[Sync] push failed:', e.message);
  }
}

/** 口袋是用户主动选择的数据,沿用 word_progress 的裸词-读音键。 */
export async function pushPocket(wordKey, inPocket) {
  if (!supabase || !wordKey) return { ok: false, error: 'offline' };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, error: 'no session' };
    if (inPocket) {
      const { error } = await supabase.from('word_pocket').upsert(
        { user_id: session.user.id, word_key: wordKey },
        { onConflict: 'user_id,word_key' },
      );
      if (error) throw error;
    } else {
      const { error } = await supabase.from('word_pocket').delete()
        .eq('user_id', session.user.id).eq('word_key', wordKey);
      if (error) throw error;
    }
    return { ok: true, error: null };
  } catch (e) {
    console.warn('[Sync] pocket push failed:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * 登录后把本机数据补传到新账号。
 *
 * 为什么需要:匿名登录和 Apple 登录是两个不同的 user id。以前先「先逛逛」
 * 攒进度、之后再登录,匿名账号下的云端行就永久孤立了,换机登录拉到的是空的。
 * linkIdentity 走的是 OAuth 网页重定向,和 RN 原生 Apple 登录混用不可靠,
 * 所以改成:本机 AsyncStorage 是这台设备的完整事实,登录后整体补传一次。
 *
 * 局限(说实话):只补传「这台设备上还留着的」数据。如果你在 A 机匿名用了半年、
 * 从没登录,然后直接在 B 机登录 —— 那批云端行仍然找不回。所以引导上要让用户
 * 在换机前先在旧机登录一次。
 */
export async function backfillProgress(progressMap, bookId = 'n5') {
  if (!supabase) return { count: 0, error: 'offline' };
  const entries = Object.entries(progressMap || {});
  if (!entries.length) return { count: 0, error: null };
  try {
    const user = await getSessionUser();
    if (!user) return { count: 0, error: 'no session' };
    const now = new Date().toISOString();
    // toCloudRow 顺带做了归一:本机可能还留着旧版写的字符串,那批也要补传,
    // 而且要按和界面上完全一样的规则迁移(learning → 今天到期)。
    // 未学的返回 null,直接排掉 —— 补传的是「学过什么」,不是「没学过什么」。
    const rows = entries
      .map(([word_key, rec]) => toCloudRow(word_key, rec, { userId: user.id, bookId, now }))
      .filter(Boolean);
    if (!rows.length) return { count: 0, error: null };
    // 分批,别一次 upsert 几千行把请求撑爆
    let done = 0;
    for (let i = 0; i < rows.length; i += 400) {
      const chunk = rows.slice(i, i + 400);
      const { error } = await supabase.from('word_progress')
        .upsert(chunk, { onConflict: 'user_id,word_key' });
      if (error) throw error;
      done += chunk.length;
    }
    console.log('[Sync] backfilled progress', done);
    return { count: done, error: null };
  } catch (e) {
    console.warn('[Sync] backfill progress failed:', e.message);
    return { count: 0, error: e.message };
  }
}

/** 登录迁移时口袋取并集:本机 ∪ 云端。分批 upsert,可安全重复。 */
export async function backfillPocket(pocketList) {
  if (!supabase) return { count: 0, error: 'offline' };
  const keys = [...new Set((Array.isArray(pocketList) ? pocketList : [])
    .filter(key => typeof key === 'string' && key.trim()))];
  if (!keys.length) return { count: 0, error: null };
  try {
    const user = await getSessionUser();
    if (!user) return { count: 0, error: 'no session' };
    let done = 0;
    for (let i = 0; i < keys.length; i += 400) {
      const rows = keys.slice(i, i + 400).map(word_key => ({ user_id: user.id, word_key }));
      const { error } = await supabase.from('word_pocket')
        .upsert(rows, { onConflict: 'user_id,word_key' });
      if (error) throw error;
      done += rows.length;
    }
    console.log('[Sync] backfilled pocket', done);
    return { count: done, error: null };
  } catch (e) {
    console.warn('[Sync] backfill pocket failed:', e.message);
    return { count: 0, error: e.message };
  }
}

/**
 * 补传精选地点打卡。
 *
 * 四份数据必须一起传:去过的 id、打卡日期、手账备注、照片路径。
 * 以前只传了 id —— 登录后地点还在,日期和备注没了,而「旅迹」是靠日期画的,
 * 用户看到的就是「登录之后我的旅行线消失了」。
 */
export async function backfillCheckins(visitedIds, { notes = {}, dates = {}, photoPaths = {} } = {}) {
  if (!supabase) return { count: 0, error: 'offline' };
  const ids = (visitedIds || []).filter(Boolean);
  if (!ids.length) return { count: 0, error: null };
  try {
    const user = await getSessionUser();
    if (!user) return { count: 0, error: 'no session' };
    const now = new Date().toISOString();
    const rows = ids.map(place_id => ({
      user_id: user.id,
      place_id,
      status: 'been',
      note: notes[place_id] || null,
      checked_in_at: dates[place_id] || null,
      // 照片本身在旧账号的 Storage 目录下({旧 uid}/xxx.jpg),新账号按 RLS 读不到。
      // 这里只保留能用的那些:路径以当前 uid 开头才传,否则留空等用户重新上传,
      // 传一个必然 403 的路径只会让相册位显示成裂图。
      photo_path: (photoPaths[place_id] || '').startsWith(`${user.id}/`)
        ? photoPaths[place_id]
        : null,
      updated_at: now,
    }));
    const { error } = await supabase.from('place_checkin')
      .upsert(rows, { onConflict: 'user_id,place_id' });
    if (error) throw error;
    console.log('[Sync] backfilled checkins', rows.length);
    return { count: rows.length, error: null };
  } catch (e) {
    console.warn('[Sync] backfill checkins failed:', e.message);
    return { count: 0, error: e.message };
  }
}

// ─────────────────────────────────────────────────────────────
// 登录后的整体补传
// ─────────────────────────────────────────────────────────────

/**
 * 登录后把本机数据整体补传到新账号 —— 一个入口,补齐全部,而不是想起哪个补哪个。
 *
 * 背景:Apple 登录走的是 signInWithIdToken,匿名 uid 被直接丢弃,云端挂在旧 uid
 * 下的行全部成为孤儿。所以这次补传是**唯一**的迁移机会,漏掉的就是永久漏掉。
 * 之前只补了单词进度和「去过的地点 id」,打卡日期、手账备注、自定义地点、
 * 整本旅行册都没补 —— 用户的感受是「登录之后我的东西少了一半」。
 *
 * 每一项独立成败:一项失败不阻断其它项。任何一项失败都会留下 backfillPending 标记,
 * 下次启动自动重试 —— 静默失败是这个流程里最贵的 bug,因为用户没有第二次登录机会。
 * 全部成功才清标记。可以安全重复调用。
 */
export async function backfillAll() {
  const results = [];
  const run = async (domain, fn) => {
    try {
      const r = await fn();
      results.push({ domain, count: r?.count ?? 0, error: r?.error || null });
    } catch (e) {
      results.push({ domain, count: 0, error: e?.message || 'unknown' });
    }
  };

  // ⚠️ 这几个域都是「读本机 → 传云端」。读失败必须报 error,**不能报成功**。
  //
  // 报成功的后果不是少传一次:backfillAll 会把 pending 清掉,而**登录换账号
  // 只有这一次迁移机会**(Apple 登录走 signInWithIdToken,匿名 uid 直接被丢弃,
  // 挂在旧 uid 下的行全部成为孤儿)。读盘抖一下 = 用户攒的东西永久留在旧账号里。
  //
  // 「确实没有」照旧返回 count 0 + error null —— 那是正常的,没数据就是没数据。
  await run('progress', async () => {
    const { ok, value: progress } = await readJsonResult(K.wordbankProgress);
    if (!ok) return { count: 0, error: '读不到本机进度,保留 pending 下次重试' };
    if (!progress || typeof progress !== 'object' || Array.isArray(progress)) {
      return { count: 0, error: null };
    }
    return backfillProgress(progress);
  });

  await run('pocket', async () => {
    const { ok, value: pocket } = await readJsonResult(K.pocket);
    if (!ok) return { count: 0, error: '读不到本机口袋,保留 pending 下次重试' };
    // 口袋迁移是并集(本机 ∪ 云端),只发生在这次登录补传。
    // 后续入袋/移出立即 push,启动 pull 覆盖本地。已知局限:并集之后如果 A 机移出,
    // B 机尚未 pull 就 push,词会复活。当前接受这个代价,不假装不存在。
    return backfillPocket(Array.isArray(pocket) ? pocket : []);
  });

  await run('checkins', async () => {
    const { ok, value: visited } = await readJsonResult(K.worldVisitedIds);
    if (!ok) return { count: 0, error: '读不到本机打卡,保留 pending 下次重试' };
    if (!Array.isArray(visited) || !visited.length) return { count: 0, error: null };
    const [dates, notes, photoPaths] = await Promise.all([
      readJson(K.worldCheckinDates, {}),
      readJson(K.worldPlaceNotes, {}),
      readJson(K.worldPhotoPaths, {}),
    ]);
    return backfillCheckins(visited, { dates, notes, photoPaths });
  });

  await run('userPlaces', () => reuploadUserPlaces());

  await run('notebook', async () => {
    const { ok, value: snap } = await readJsonResult(K.tripNotebook);
    if (!ok) return { count: 0, error: '读不到本机旅行本,保留 pending 下次重试' };
    // ⚠️ 不能只看 books:账本已经和旅行册解耦了,「只用分账、从不开小本子」是
    // 明确存在的用法。只按 books 判空,那种用户登录时整本账都不会补传。
    const books = Array.isArray(snap?.books) ? snap.books : [];
    const ledgers = Array.isArray(snap?.ledgers) ? snap.ledgers : [];
    const legacyExpenses = Array.isArray(snap?.expenses) ? snap.expenses : [];
    if (!snap || (!books.length && !ledgers.length && !legacyExpenses.length)) {
      return { count: 0, error: null };
    }
    // uploads 是本机图片 uri,换机后无效,和 TripNotebook 里的备份口径保持一致
    const { uploads: _skipPhotos, ...cloudSafe } = snap;
    const r = await pushNotebook(cloudSafe, snap.rev);
    return { count: r.ok ? books.length + ledgers.length : 0, error: r.ok ? null : r.error };
  });

  // 手账两步之间要传一张 id 映射表:换账号意味着每条记录在新账号下是**新的一行**,
  // 素材的溯源和页上元素的 moment 引用都得接到新 id 上。采集层失败也照样传手账 ——
  // 页和素材是用户的作品,不该因为溯源接不上就整批不传(溯源留空而已)。
  let momentIdMap = new Map();
  await run('moments', async () => {
    const r = await backfillMoments();
    momentIdMap = r.idMap || new Map();
    return r;
  });
  await run('journal', () => backfillJournal(momentIdMap));

  const failed = results.filter(r => r.error);
  if (failed.length) {
    await writeJson(K.backfillPending, {
      at: new Date().toISOString(),
      domains: failed.map(r => r.domain),
    });
  } else {
    await removeKey(K.backfillPending);
  }

  console.log('[Sync] backfillAll', JSON.stringify(results));
  return { ok: failed.length === 0, results, failed: failed.map(r => r.domain) };
}

/** 有没有没补完的?返回 null 表示没有待办。 */
export async function pendingBackfill() {
  return readJson(K.backfillPending, null);
}

export async function pullProgress() {
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const { data, error } = await supabase
      .from('word_progress')
      .select('word_key, status, box, due_at, reps, lapses, last_seen_at')
      .eq('user_id', session.user.id);

    if (error) throw error;

    const progress = {};
    for (const row of data) {
      // 旧账号的行只有 status,没有 box/due_at —— fromCloudRow 认得这种行,
      // 走和本地旧数据同一套迁移落点,不需要先在数据库里跑一遍。
      const rec = fromCloudRow(row);
      if (rec) progress[row.word_key] = rec;
    }
    console.log('[Sync] pulled', Object.keys(progress).length, 'entries');
    return progress;
  } catch (e) {
    // 返回 null 而不是 {} —— 调用方靠这个区分「云端是空的」和「没拉到」。
    // 库还没跑 schema.word-srs.sql 时,上面 select 新列会直接报错走到这里,
    // 结果是本地照常可用、不被空值覆盖(硬规矩 1)。
    console.warn('[Sync] pull failed:', e.message);
    return null;
  }
}

export async function pullPocket() {
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data, error } = await supabase.from('word_pocket')
      .select('word_key').eq('user_id', session.user.id);
    if (error) throw error;
    return (data || []).map(row => row.word_key).filter(Boolean);
  } catch (e) {
    console.warn('[Sync] pocket pull failed:', e.message);
    return null;
  }
}

export async function pullPlaceCheckins() {
  if (!supabase) return null;
  try {
    const user = await getSessionUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('place_checkin')
      .select('place_id, status, note, photo_path, checked_in_at, updated_at')
      .eq('user_id', user.id);

    if (error) throw error;

    const checkins = {};
    for (const row of data || []) {
      let photoUri = null;
      if (row.photo_path) {
        const { data: signed } = await supabase.storage
          .from(CHECKIN_PHOTO_BUCKET)
          .createSignedUrl(row.photo_path, 60 * 60);
        photoUri = signed?.signedUrl || null;
      }

      checkins[row.place_id] = {
        placeId: row.place_id,
        status: row.status,
        note: row.note || '',
        photoPath: row.photo_path || null,
        photoUri,
        checkedInAt: row.checked_in_at || null,
        updatedAt: row.updated_at,
      };
    }

    console.log('[Sync] pulled place checkins', Object.keys(checkins).length);
    return checkins;
  } catch (e) {
    console.warn('[Sync] pull place checkins failed:', e.message);
    return null;
  }
}

export async function pushPlaceCheckin(placeId, status, patch = {}) {
  if (!supabase) return null;
  try {
    const user = await getSessionUser();
    if (!user) return null;

    const row = {
      user_id: user.id,
      place_id: placeId,
      status,
      updated_at: new Date().toISOString(),
    };
    if (Object.prototype.hasOwnProperty.call(patch, 'note')) {
      row.note = patch.note || null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'photoPath')) {
      row.photo_path = patch.photoPath || null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'checkedInAt')) {
      row.checked_in_at = patch.checkedInAt || null;
    }

    const { data, error } = await supabase
      .from('place_checkin')
      .upsert(row, { onConflict: 'user_id,place_id' })
      .select('place_id, status, note, photo_path, checked_in_at, updated_at')
      .single();

    if (error) throw error;
    return data;
  } catch (e) {
    console.warn('[Sync] push place checkin failed:', e.message);
    return null;
  }
}

export async function uploadPlaceCheckinPhoto(placeId, localUri, contentType = 'image/jpeg') {
  if (!supabase || !localUri) return null;
  try {
    const user = await getSessionUser();
    if (!user) return null;

    const response = await fetch(localUri);
    const body = await response.arrayBuffer();
    const path = `${user.id}/${placeId}.jpg`;

    const { error } = await supabase.storage
      .from(CHECKIN_PHOTO_BUCKET)
      .upload(path, body, {
        contentType,
        upsert: true,
      });

    if (error) throw error;

    const { data: signed } = await supabase.storage
      .from(CHECKIN_PHOTO_BUCKET)
      .createSignedUrl(path, 60 * 60);

    return {
      photoPath: path,
      photoUri: signed?.signedUrl || localUri,
    };
  } catch (e) {
    console.warn('[Sync] upload checkin photo failed:', e.message);
    return null;
  }
}
