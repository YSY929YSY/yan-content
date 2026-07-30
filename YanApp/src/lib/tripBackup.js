// 言 · 旅行小本子云端备份
//
// 旅行册/行程/账目/预算原本只在 AsyncStorage,换机或删 App 就没了。
// 这里做「整块备份 + 取回」,不做实时协同 —— 共享账本已经有自己的实时通道,
// 这份只解决「换了台手机,我的旅行本还在吗」。
//
// 冲突策略:比 device_rev(客户端本地最后修改时间),新的赢。
// 不做三方合并 —— 两台设备同时改同一本旅行册是极少数情况,
// 而一个猜错的自动合并比「以较新的为准」更难解释。
import { supabase } from './supabase';
import { cloudIsNewer } from './syncRules';

export { cloudIsNewer };

const TABLE = 'trip_notebooks';

async function uid() {
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id || null;
  } catch { return null; }
}

/** 上传本机快照。deviceRev 传本地最后修改时间(ISO 字符串)。 */
export async function pushNotebook(payload, deviceRev) {
  if (!supabase) return { ok: false, error: 'offline' };
  try {
    const user = await uid();
    if (!user) return { ok: false, error: 'no session' };
    const { error } = await supabase.from(TABLE).upsert({
      user_id: user,
      payload,
      device_rev: deviceRev || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
    return { ok: true, error: null };
  } catch (e) {
    // 表没建、没网、RLS 拒绝 —— 一律安静失败,本地照常用
    console.warn('[TripBackup] push failed:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * 取回云端快照。
 * ⚠️ 失败返回 null(不是空对象)—— 调用方会拿它决定要不要覆盖本地,
 * 空对象会被当成「云端真的是空的」,重蹈共享账本被弱网清空的覆辙。
 */
export async function pullNotebook() {
  if (!supabase) return null;
  try {
    const user = await uid();
    if (!user) return null;
    const { data, error } = await supabase.from(TABLE)
      .select('payload, device_rev')
      .eq('user_id', user)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { payload: null, deviceRev: null };   // 确实没备份过
    return { payload: data.payload || null, deviceRev: data.device_rev || null };
  } catch (e) {
    console.warn('[TripBackup] pull failed:', e.message);
    return null;
  }
}

