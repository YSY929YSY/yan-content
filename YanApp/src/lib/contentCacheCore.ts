import { validateContentShape } from './contentSchema.ts';

type HeadersLike = { get(name: string): string | null };

type ResponseLike = {
  status: number;
  ok: boolean;
  headers: HeadersLike;
  text(): Promise<string>;
};

export type ContentCacheDeps = {
  fetchImpl(url: string, init: { signal: AbortSignal; headers: Record<string, string> }): Promise<ResponseLike>;
  getEtag(): Promise<string | null>;
  clearEtag(): Promise<void>;
  readCache(): Promise<unknown | null>;
  writeCache(text: string, etag: string | null): Promise<void>;
};

export type ContentFetchResult = {
  content: Record<string, unknown> | null;
  source: 'not-modified' | 'network' | 'cache' | 'none';
  error: string | null;
};

async function readValidCache(readCache: ContentCacheDeps['readCache']) {
  const raw = await readCache();
  if (raw === null || raw === undefined) return { content: null, reason: 'cache missing' as const };
  const shape = validateContentShape(raw);
  if (!shape.ok) return { content: null, reason: `invalid cache: ${shape.reason}` };
  // validateContentShape 已验证根节点为普通对象；这里把 unknown 收窄给缓存状态机。
  return { content: raw as Record<string, unknown>, reason: null };
}

function cacheResult(content: Record<string, unknown> | null, reason: string | null): ContentFetchResult {
  return content
    ? { content, source: 'cache', error: reason }
    : { content: null, source: 'none', error: reason };
}

/**
 * 纯下载/缓存状态机。Expo 文件系统、AsyncStorage 都留在外层适配器；
 * 这样 Node 测试能直接验证“坏响应绝不覆盖好缓存”的分支行为。
 */
export async function fetchContentCore(
  url: string,
  deps: ContentCacheDeps,
  { timeoutMs = 20_000 }: { timeoutMs?: number } = {},
): Promise<ContentFetchResult> {
  const etag = await deps.getEtag();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await deps.fetchImpl(url, {
      signal: ctrl.signal,
      headers: etag ? { 'If-None-Match': etag } : {},
    });

    if (res.status === 304) {
      const cached = await readValidCache(deps.readCache);
      if (cached.content) return { content: cached.content, source: 'not-modified', error: null };
      // 服务端说内容未变，而本机却没有可用版本；只有这时 ETag 必须失效。
      await deps.clearEtag();
      return { content: null, source: 'none', error: cached.reason };
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();
    const parsed: unknown = JSON.parse(text);
    const shape = validateContentShape(parsed);
    if (!shape.ok) {
      const cached = await readValidCache(deps.readCache);
      return cacheResult(cached.content, `invalid remote content: ${shape.reason}`);
    }

    await deps.writeCache(text, res.headers.get('etag'));
    return { content: parsed as Record<string, unknown>, source: 'network', error: null };
  } catch (e) {
    const cached = await readValidCache(deps.readCache);
    // 网络失败没有说明远端 ETag 有错；绝不可因此清它。
    return cacheResult(cached.content, e instanceof Error ? e.message : 'content request failed');
  } finally {
    clearTimeout(timer);
  }
}
