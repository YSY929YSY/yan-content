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
      .select('place_id, status, note, photo_path, updated_at')
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

    const { data, error } = await supabase
      .from('place_checkin')
      .upsert(row, { onConflict: 'user_id,place_id' })
      .select('place_id, status, note, photo_path, updated_at')
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
