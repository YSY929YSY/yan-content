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

// 金额归一:欧陆小票写 "1.056,00",英美写 "1,056.00"。
// 只按「数字和点」粗暴清洗会把 1.056,00 变成 1.05600 —— 差 1000 倍还长得像正常数字。
// 规则:最后出现的那个分隔符才是小数点;它后面必须正好两位数字,否则视为千位分隔。
export function normalizeAmount(raw) {
  let s = String(raw ?? '').replace(/[^\d.,]/g, '');
  if (!s) return '';
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  const sep = Math.max(lastDot, lastComma);
  if (sep >= 0 && /^\d{2}$/.test(s.slice(sep + 1))) {
    const intPart = s.slice(0, sep).replace(/[.,]/g, '');
    return `${intPart || '0'}.${s.slice(sep + 1)}`;
  }
  return s.replace(/[.,]/g, '');   // 没有两位小数 → 全是千位分隔
}

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
