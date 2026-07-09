import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';

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

export async function signInWithApple() {
  if (!supabase) return { user: null, error: 'Supabase not initialized' };
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { user: null, error: 'No identity token from Apple' };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) throw error;

    if (credential.fullName) {
      const name = [credential.fullName.givenName, credential.fullName.familyName]
        .filter(Boolean).join(' ');
      if (name) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          display_name: name,
        }, { onConflict: 'id' });
      }
    }

    console.log('[Auth] Apple sign-in success:', data.user.id);
    return { user: data.user, error: null };
  } catch (e) {
    if (e.code === 'ERR_REQUEST_CANCELED') {
      return { user: null, error: null };
    }
    console.warn('[Auth] Apple sign-in failed:', e.message);
    return { user: null, error: e.message };
  }
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  console.log('[Auth] Signed out');
}
