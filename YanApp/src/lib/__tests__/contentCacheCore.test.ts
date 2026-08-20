import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchContentCore } from '../contentCacheCore.ts';

function validContent(extra: Record<string, unknown> = {}) {
  return {
    scenes: [], mapPlaces: [], culturalFusion: [], kanaRows: [], wordBank: [],
    subwayAdventure: { stations: [] },
    ...extra,
  };
}

function response(status: number, body = '', etag = 'new-tag') {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => name === 'etag' ? etag : null },
    text: async () => body,
  };
}

function harness({ reply, cached }: { reply: () => Promise<ReturnType<typeof response>>; cached?: unknown | null }) {
  let disk = cached ?? null;
  let writes = 0;
  let clears = 0;
  let etag: string | null = 'old-tag';
  let writtenEtag: string | null = null;
  return {
    disk: () => disk,
    writes: () => writes,
    clears: () => clears,
    etag: () => etag,
    writtenEtag: () => writtenEtag,
    deps: {
      fetchImpl: () => reply(),
      getEtag: async () => etag,
      clearEtag: async () => { clears += 1; etag = null; },
      readCache: async () => disk,
      writeCache: async (text: string, nextEtag: string | null) => {
        writes += 1;
        writtenEtag = nextEtag;
        disk = JSON.parse(text);
      },
    },
  };
}

test('200 + 合法包写入内容和 ETag', async () => {
  const h = harness({ reply: async () => response(200, JSON.stringify(validContent())) });
  const out = await fetchContentCore('https://content.test', h.deps);
  assert.equal(out.source, 'network');
  assert.equal(h.writes(), 1);
  assert.equal(h.writtenEtag(), 'new-tag');
  assert.equal(h.clears(), 0);
});

test('200 + {} 绝不覆盖旧有效缓存或 ETag', async () => {
  const old = validContent({ marker: 'old' });
  const h = harness({ reply: async () => response(200, '{}'), cached: old });
  const out = await fetchContentCore('https://content.test', h.deps);
  assert.equal(out.source, 'cache');
  assert.equal(h.writes(), 0);
  assert.equal(h.clears(), 0);
  assert.strictEqual(h.disk(), old);
  assert.equal(h.etag(), 'old-tag');
});

test('200 + 错误 wordBank 且无缓存返回 none', async () => {
  const h = harness({ reply: async () => response(200, JSON.stringify(validContent({ wordBank: {} }))) });
  const out = await fetchContentCore('https://content.test', h.deps);
  assert.equal(out.source, 'none');
  assert.equal(h.writes(), 0);
  assert.equal(h.clears(), 0);
});

test('200 + wordCards 对象或数组仍是合法运行时包', async () => {
  for (const wordCards of [{ order: {} }, []]) {
    const h = harness({ reply: async () => response(200, JSON.stringify(validContent({ wordCards }))) });
    const out = await fetchContentCore('https://content.test', h.deps);
    assert.equal(out.source, 'network');
    assert.equal(h.writes(), 1);
  }
});

test('304 + 有效缓存只消费缓存', async () => {
  const h = harness({ reply: async () => response(304), cached: validContent() });
  const out = await fetchContentCore('https://content.test', h.deps);
  assert.equal(out.source, 'not-modified');
  assert.equal(h.writes(), 0);
  assert.equal(h.clears(), 0);
});

test('304 + 缓存缺失或坏缓存清 ETag，且不改缓存', async () => {
  for (const cached of [null, {}]) {
    const h = harness({ reply: async () => response(304), cached });
    const before = h.disk();
    const out = await fetchContentCore('https://content.test', h.deps);
    assert.equal(out.source, 'none');
    assert.equal(h.writes(), 0);
    assert.equal(h.clears(), 1);
    assert.strictEqual(h.disk(), before);
  }
});

test('网络失败只使用有效缓存；坏缓存不清 ETag也不被改写', async () => {
  for (const [cached, source] of [[validContent(), 'cache'], [{}, 'none']] as const) {
    const h = harness({ reply: async () => { throw new Error('offline'); }, cached });
    const before = h.disk();
    const out = await fetchContentCore('https://content.test', h.deps);
    assert.equal(out.source, source);
    assert.equal(h.writes(), 0);
    assert.equal(h.clears(), 0);
    assert.strictEqual(h.disk(), before);
    assert.equal(h.etag(), 'old-tag');
  }
});
