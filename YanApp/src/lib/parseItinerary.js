// 言 · 订单识别客户端
// 把上传的订单/截图读成 base64,发给 Supabase Edge Function(服务端调 Claude vision),
// 拿回结构化行程段。函数没部署 / 未登录时安全报错,不会崩。
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';

const toDataUrl = async (uri) => {
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const ext = (uri.split('.').pop() || 'jpg').toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${b64}`;
};

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
