// 言 · 内容缓存
//
// 原来每次冷启动都 fetch(CONTENT_URL, { cache:'no-cache' }) 全量拉 6MB:
// 移动数据上又贵又慢,首屏还要等它。
//
// raw.githubusercontent 支持 ETag,带 If-None-Match 命中时返回 304 且 0 字节。
// 所以:存一份内容 + 它的 ETag,每次只问「变了吗」,变了才下载。
//
// 内容体走文件系统而不是 AsyncStorage —— 6MB 超过 Android 单条记录的默认上限。
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const ETAG_KEY = 'yan_content_etag_v1';
const FILE_NAME = 'yan_content_v2.json';

const filePath = () => `${FileSystem.documentDirectory}${FILE_NAME}`;

async function readCachedContent() {
  try {
    const info = await FileSystem.getInfoAsync(filePath());
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(filePath());
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[Content] read cache failed:', e.message);
    return null;
  }
}

async function writeCachedContent(text, etag) {
  try {
    await FileSystem.writeAsStringAsync(filePath(), text);
    if (etag) await AsyncStorage.setItem(ETAG_KEY, etag);
  } catch (e) {
    // 写不进去不影响本次使用,只是下次还得重下
    console.warn('[Content] write cache failed:', e.message);
  }
}

/**
 * 取内容。
 * @returns {{ content, source, error }}
 *   source: 'not-modified' | 'network' | 'cache' | 'none'
 */
export async function fetchContent(url, { timeoutMs = 20000 } = {}) {
  const etag = await AsyncStorage.getItem(ETAG_KEY).catch(() => null);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: etag ? { 'If-None-Match': etag } : {},
    });

    // 没变:一个字节都不用下,直接用缓存
    if (res.status === 304) {
      const cached = await readCachedContent();
      if (cached) return { content: cached, source: 'not-modified', error: null };
      // 缓存文件丢了但 ETag 还在 → 清掉 ETag,下次强拉
      await AsyncStorage.removeItem(ETAG_KEY).catch(() => {});
      return { content: null, source: 'none', error: 'cache missing' };
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();
    const parsed = JSON.parse(text);            // 先解析再落盘,别把坏 JSON 存进去
    await writeCachedContent(text, res.headers.get('etag'));
    return { content: parsed, source: 'network', error: null };
  } catch (e) {
    // 没网 / 超时 / 服务端坏了:用上次存下来的
    const cached = await readCachedContent();
    if (cached) return { content: cached, source: 'cache', error: e.message };
    return { content: null, source: 'none', error: e.message };
  } finally {
    clearTimeout(timer);
  }
}
