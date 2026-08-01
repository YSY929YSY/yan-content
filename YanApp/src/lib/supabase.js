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

/**
 * 删除账号 + 全部数据(Apple 5.1.1(v) 要求 App 内可删)。
 *
 * 服务端那步是 SECURITY DEFINER 的 delete_my_account():删 auth.users
 * 需要提权,anon key 做不到;只删业务表而留下 auth 记录不算真删除。
 *
 * 本地存档也要一并清 —— 否则删完账号重开 App,旅行本和进度还在,
 * 用户会以为没删干净。
 */
export async function deleteAccount() {
  if (!supabase) return { ok: false, error: 'offline' };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, error: '当前没有登录' };

    // 先删打卡照片,再删账号 —— 顺序不能反:
    // Supabase 不允许在 SQL 里直接删 storage.objects(会报 42501),
    // 只能走 Storage API;而账号一旦删掉,就再没有权限碰自己那些文件了,
    // 照片会变成谁也删不掉的孤儿。
    try {
      const dir = session.user.id;
      const { data: files } = await supabase.storage.from('checkin-photos').list(dir);
      if (files?.length) {
        await supabase.storage.from('checkin-photos')
          .remove(files.map(f => `${dir}/${f.name}`));
      }
    } catch (e) {
      // 照片删不掉不该挡住账号删除 —— 用户的诉求是「把我删掉」
      console.warn('[Auth] remove photos failed:', e.message);
    }

    const { error } = await supabase.rpc('delete_my_account');
    if (error) throw error;

    // 服务端删完再清本地,顺序不能反:先清本地而服务端失败,
    // 会变成「数据还在云端但本机看不到」,比什么都没删更糟。
    await AsyncStorage.multiRemove([
      'yan_trip_notebook_v1',
      'yan_wordbank_progress',
      'yan_world_footprint_photos',
      'yan_world_footprint_visited_ids',
      'yan_world_footprint_meta',
      'yan_subway_unlocked_idx',
      'yan_fx_v1',
    ]).catch(() => {});

    await supabase.auth.signOut().catch(() => {});
    return { ok: true, error: null };
  } catch (e) {
    console.warn('[Auth] delete account failed:', e.message);
    return { ok: false, error: e.message };
  }
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  console.log('[Auth] Signed out');
}
