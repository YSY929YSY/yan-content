import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is missing. ' +
    'Create a .env file in the project root. Supabase features will be disabled.'
  );
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export async function ensureUser() {
  if (!supabase) {
    console.warn('[Supabase] Client not initialized — skipping auth.');
    return null;
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      console.log('[Supabase] Existing session:', session.user.id);
      return session.user;
    }
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    console.log('[Supabase] Anonymous user created:', data.user.id);
    return data.user;
  } catch (e) {
    console.warn('[Supabase] Auth failed:', e.message);
    return null;
  }
}
