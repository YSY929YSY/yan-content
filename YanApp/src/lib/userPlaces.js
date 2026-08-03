// 言 · 自定义打卡地点
//
// 为什么必须有:言精选的地点是有限的(现在 43 个),而用户去的地方是无限的。
// 把「能不能打卡」绑在「言有没有收录」上,等于让内容生产速度成为产品的天花板 ——
// 一个想记录自己足迹的人,去的地方大概率不在收录列表里,他记不了就走了。
//
// 解耦之后:
//   打卡 = 工具,任何地方都能记
//   言的内容 = 惊喜,打到收录过的点会多出一段注记
// 内容从「门槛」变成「奖励」。
//
// 表 user_places 在 schema.sql 里早就建好了(含 source: manual/photo_exif/official_seed),
// 这一版只接 manual。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const TABLE = 'user_places';
const LOCAL_KEY = 'yan_user_places_v1';

async function uid() {
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id || null;
  } catch { return null; }
}

const localId = () => `up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function readLocal() {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

async function writeLocal(list) {
  try { await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch { /* 忽略 */ }
}

/** 本机 + 云端合并读取。云端拉取失败一律不影响本机那份。 */
export async function listUserPlaces() {
  const local = await readLocal();
  if (!supabase) return local;
  try {
    const user = await uid();
    if (!user) return local;
    const { data, error } = await supabase.from(TABLE)
      .select('id, name, city, country, lat, lng, note, created_at')
      .eq('user_id', user)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const remote = (data || []).map(r => ({
      id: r.id,
      name: r.name,
      city: r.city || '',
      country: r.country || '',
      lat: r.lat, lng: r.lng,
      note: r.note || '',
      createdAt: r.created_at,
      remote: true,
    }));
    // 本机还没同步上去的(id 不是 uuid)保留,已同步的以远端为准。
    // 和分账同一条规矩:拿不到数据 ≠ 数据是空的。
    const remoteIds = new Set(remote.map(r => r.id));
    const pending = local.filter(p => !remoteIds.has(p.id));
    const merged = [...pending, ...remote];
    await writeLocal(merged);
    return merged;
  } catch (e) {
    console.warn('[UserPlaces] list failed:', e?.message);
    return local;
  }
}

/** 加一个自定义地点。先落本机(离线即用),再尝试上云。 */
export async function addUserPlace({ name, city = '', country = '', lat, lng, note = '' }) {
  const clean = String(name || '').trim();
  if (!clean) return { place: null, error: '地名不能为空' };

  const item = {
    id: localId(),
    name: clean, city, country,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    note,
    createdAt: new Date().toISOString(),
  };
  const local = await readLocal();
  await writeLocal([item, ...local]);

  if (!supabase) return { place: item, error: null };
  try {
    const user = await uid();
    if (!user) return { place: item, error: null };
    const { data, error } = await supabase.from(TABLE).insert({
      user_id: user,
      name: clean, city: city || null, country: country || null,
      lat: item.lat, lng: item.lng,
      note: note || null,
      source: 'manual',
    }).select('id').single();
    if (error) throw error;
    // 换成远端 uuid,避免下次合并时重复
    const list = await readLocal();
    await writeLocal(list.map(p => (p.id === item.id ? { ...p, id: data.id, remote: true } : p)));
    return { place: { ...item, id: data.id, remote: true }, error: null };
  } catch (e) {
    console.warn('[UserPlaces] add failed (kept locally):', e?.message);
    return { place: item, error: null };   // 本机已存,不算失败
  }
}

/** 删一个(远端软删,本机移除)。 */
export async function removeUserPlace(id) {
  const local = await readLocal();
  await writeLocal(local.filter(p => p.id !== id));
  if (!supabase) return { error: null };
  try {
    const user = await uid();
    if (!user) return { error: null };
    const { error } = await supabase.from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', user);
    if (error) throw error;
    return { error: null };
  } catch (e) {
    return { error: e?.message };
  }
}
