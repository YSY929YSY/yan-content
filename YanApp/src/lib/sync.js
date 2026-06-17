import { supabase } from './supabase';

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
