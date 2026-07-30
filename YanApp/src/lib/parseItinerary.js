// 言 · 订单识别客户端
// 把上传的订单/截图读成 base64,发给 Supabase Edge Function(服务端调 Claude vision),
// 拿回结构化行程段。函数没部署 / 未登录时安全报错,不会崩。
// ⚠️ 必须从 /legacy 导入。expo-file-system v19 的主入口把 readAsStringAsync
// 换成了抛错桩(throw errorOnLegacyMethodUse),从主入口调用 100% 失败 ——
// 订单识别和扫小票整条链路都断在这里。
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';
import { normalizeAmount } from './ledgerMath';

const toDataUrl = async (uri) => {
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const ext = (uri.split('.').pop() || 'jpg').toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${b64}`;
};


// 小票:只取总额和币种,不猜谁点了什么(那个识别不可靠,而主场景本来就是均分)。
// uri → { total, currency, merchant } | { error }
export async function parseReceipt(uri) {
  if (!supabase) return { error: 'offline' };
  if (!uri) return { error: '没有可识别的小票' };
  try {
    const image = await toDataUrl(uri);
    const { data, error } = await supabase.functions.invoke('parse-itinerary', {
      body: { images: [image], kind: 'receipt' },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const total = normalizeAmount(data?.total);
    if (!total || !(Number.parseFloat(total) > 0)) throw new Error('没读出金额');
    return {
      total,
      currency: String(data?.currency || '').toUpperCase().slice(0, 3),
      merchant: String(data?.merchant || '').slice(0, 40),
    };
  } catch (e) {
    return { error: e?.message || String(e) };
  }
}

// uploads: [{ uri }] → { legs: [...] } | { error }
export async function parseItinerary(uploads) {
  if (!supabase) return { error: 'offline' };
  if (!uploads?.length) return { error: '没有可识别的资料' };
  try {
    const images = [];
    for (const u of uploads.slice(0, 4)) images.push(await toDataUrl(u.uri));
    const { data, error } = await supabase.functions.invoke('parse-itinerary', { body: { images } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const legs = Array.isArray(data?.legs) ? data.legs.filter(l => l && l.title) : [];
    return { legs };
  } catch (e) {
    return { error: e?.message || String(e) };
  }
}
