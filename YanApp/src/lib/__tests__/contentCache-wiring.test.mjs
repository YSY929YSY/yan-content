// Expo 适配层不进入裸 Node；这里守住它必须把真实读写都交给已测的纯状态机。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(import.meta.dirname, '../contentCache.js'), 'utf8');

test('★★ Expo 缓存适配层只委托给受测的结构闸门状态机', () => {
  assert.match(source, /import \{ fetchContentCore \} from '\.\/contentCacheCore';/);
  assert.match(source, /fetchContentCore\(url, \{[\s\S]*getEtag:[\s\S]*clearEtag:[\s\S]*readCache: readCachedContent,[\s\S]*writeCache: writeCachedContent,[\s\S]*\}, \{ timeoutMs \}\)/);
  assert.match(source, /fetchImpl:\s*\(requestUrl, init\)\s*=>\s*fetch\(requestUrl, init\)/,
    '全局 fetch 不可作为未绑定属性调用，宿主实现可能检查 this');
});
