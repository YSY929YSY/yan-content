import { supabase } from './supabase';

const CHECKIN_PHOTO_BUCKET = 'checkin-photos';

async function getSessionUser() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user || null;
}

export async function pushProgress(wordKey, status, bookId = 'n5') {
  if (!supabase) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    if (status === 'new') {
      await supabase.from('word_progress')
        .delete()
        .eq('user_id', session.user.id)
        .eq('word_key', wordKey);
    } else {
      await supabase.from('word_progress')
        .upsert({
          user_id: session.user.id,
          word_key: wordKey,
          book_id: bookId,
          status,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,word_key' });
    }
  } catch (e) {
    console.warn('[Sync] push failed:', e.message);
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
  const entries = Object.entries(progressMap || {}).filter(([, v]) => v && v !== 'new');
  if (!entries.length) return { count: 0, error: null };
  try {
    const user = await getSessionUser();
    if (!user) return { count: 0, error: 'no session' };
    const now = new Date().toISOString();
    const rows = entries.map(([word_key, status]) => ({
      user_id: user.id, word_key, book_id: bookId, status, updated_at: now,
    }));
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

export async function backfillCheckins(visitedIds, notes = {}) {
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

export async function pullProgress() {
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const { data, error } = await supabase
      .from('word_progress')
      .select('word_key, status')
      .eq('user_id', session.user.id);

    if (error) throw error;

    const progress = {};
    for (const row of data) {
      progress[row.word_key] = row.status;
    }
    console.log('[Sync] pulled', Object.keys(progress).length, 'entries');
    return progress;
  } catch (e) {
    console.warn('[Sync] pull failed:', e.message);
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
