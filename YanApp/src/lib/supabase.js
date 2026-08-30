import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import { wipeAll } from './storage';

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
/**
 * 删号要清的所有 Storage 桶。**新增桶必须加到这里。**
 *
 * 手账的素材和瞬间照片共用 `moment-photos`(见 schema.journal.sql 第 190 行)。
 */
const BUCKETS = ['checkin-photos', 'moment-photos'];
const STORAGE_LIST_PAGE_SIZE = 1000;

/**
 * 列出某个前缀下的**全部**文件路径,包括子目录里的。
 *
 * ⚠️ Supabase 的 `list()` **不递归**。而手账素材约定存在
 * `{user_id}/journal/{id}.png` —— 只列 `{uid}` 一层的话,返回的是一个名叫
 * `journal` 的「文件夹」条目,真正的文件一个都不在里面,于是全部漏删。
 * 文件夹条目的特征是 `id` 为 null(Supabase 的对象才有 id)。
 *
 * 限深度 3:够覆盖现在和可预见的布局,又不会在意外的深层结构上转很久 ——
 * 删号是用户点了「删除」正在等的操作,不能卡住。
 */
async function listAllUnder(bucket, prefix, depth = 3) {
  const out = [];
  for (let offset = 0; ; offset += STORAGE_LIST_PAGE_SIZE) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: STORAGE_LIST_PAGE_SIZE,
      offset,
    });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error(`Storage list returned invalid data for ${bucket}/${prefix}`);
    if (!data.length) break;

    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id == null) {
        if (depth > 1) out.push(...await listAllUnder(bucket, path, depth - 1));
      } else {
        out.push(path);
      }
    }
    if (data.length < STORAGE_LIST_PAGE_SIZE) break;
  }
  return out;
}

export async function deleteAccount() {
  if (!supabase) return { ok: false, error: 'offline' };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, error: '当前没有登录' };

    // 先删所有桶里的文件,再删账号 —— 顺序不能反:
    // Supabase 不允许在 SQL 里直接删 storage.objects(会报 42501),
    // 只能走 Storage API;而账号一旦删掉,就再没有权限碰自己那些文件了,
    // 文件会变成谁也删不掉的孤儿。这是合规问题,不是清理问题。
    //
    // ⚠️ **加了新桶就往 BUCKETS 里加一行。** 原来这里是一段写死 checkin-photos
    // 的代码,于是手账上线时 moment-photos 会被整个漏掉 ——
    // schema.journal.sql 第 195 行早就写了这条,但那是注释,拦不住谁。
    for (const bucket of BUCKETS) {
      const paths = await listAllUnder(bucket, session.user.id);
      if (paths.length) {
        const { error } = await supabase.storage.from(bucket).remove(paths);
        if (error) throw error;
      }
    }

    const { error } = await supabase.rpc('delete_my_account');
    if (error) throw error;

    // 服务端删完再清本地,顺序不能反:先清本地而服务端失败,
    // 会变成「数据还在云端但本机看不到」,比什么都没删更糟。
    // 交给登记处按前缀清,不在这里手写清单。
    // 手写过一版,漏了 5 个键(打卡日期、照片路径、自定义地点、地理编码缓存、
    // 内容 ETag)—— 用户删完账号,这些还留在本机。
    // Supabase 的会话存在 sb-* 下,不会被带走(登出在下面单独做)。
    const { cleared } = await wipeAll();
    console.log('[Auth] cleared local keys:', cleared.length);

    await supabase.auth.signOut().catch(() => {});
    return { ok: true, error: null };
  } catch (e) {
    console.warn('[Auth] delete account failed:', e.message);
    return { ok: false, error: '删除未完成，请重试' };
  }
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  console.log('[Auth] Signed out');
}
