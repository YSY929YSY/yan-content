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
import { K } from './storage';
import { fetchContentCore } from './contentCacheCore';

const ETAG_KEY = K.contentEtag;
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
  return fetchContentCore(url, {
    // 以普通函数调用全局 fetch，别把宿主实现的 this 绑定改成 deps。
    fetchImpl: (requestUrl, init) => fetch(requestUrl, init),
    getEtag: () => AsyncStorage.getItem(ETAG_KEY).catch(() => null),
    clearEtag: () => AsyncStorage.removeItem(ETAG_KEY).catch(() => {}),
    readCache: readCachedContent,
    writeCache: writeCachedContent,
  }, { timeoutMs });
}
