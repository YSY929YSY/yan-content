// 同步链的不可逆数据丢失护栏。
//
// sync.js / supabase.js 依赖 React Native 与真实 Supabase client，node --test 里不能直接导入。
// 这里把可独立测试的口袋合并放在 pocket.test.mjs；本文件锁住剩余的跨文件契约，
// 防止后人把 fail-closed 分支简化回「失败就是空」或把匿名登录藏回通用同步函数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const syncSrc = readFileSync(new URL('../sync.js', import.meta.url), 'utf8');
const supabaseSrc = readFileSync(new URL('../supabase.js', import.meta.url), 'utf8');
const appSrc = readFileSync(new URL('../../../App.js', import.meta.url), 'utf8');

test('M1：口袋拉取区分失败与空表，并且调用方不能用空表覆盖本机', () => {
  const pull = syncSrc.slice(syncSrc.indexOf('export async function pullPocket'));
  assert.match(pull, /if \(!supabase\) return \{ ok: false, ids: \[\], error:/);
  assert.match(pull, /if \(!session\) return \{ ok: false, ids: \[\], error:/);
  assert.match(pull, /ok: true,[\s\S]*ids: \(data \|\| \[\]\)\.map/);
  assert.match(appSrc, /if \(!alive \|\| !remote\?\.ok\) return;/);
  assert.match(appSrc, /mergePocketPull\(result\.value, remote\)/);
});

test('M2：同步路径只要求现有会话，绝不在补传途中铸造匿名账号', () => {
  assert.doesNotMatch(syncSrc, /signInAnonymously/);
  assert.match(syncSrc, /async function requireSession\(\)/);
  assert.doesNotMatch(syncSrc, /getSessionUser/);

  const sessionCalls = [...syncSrc.matchAll(/const user = await (\w+)\(\);/g)].map(m => m[1]);
  assert.equal(sessionCalls.length, 6);
  assert.deepEqual([...new Set(sessionCalls)], ['requireSession']);
  assert.match(syncSrc, /if \(failed\.length\) \{[\s\S]*writeJson\(K\.backfillPending/);
  assert.match(syncSrc, /\} else \{[\s\S]*removeKey\(K\.backfillPending\)/);
});

test('M3：删号列举分页且任何 Storage 错误都会挡住账号 RPC', () => {
  const listStart = supabaseSrc.indexOf('async function listAllUnder');
  const deleteStart = supabaseSrc.indexOf('export async function deleteAccount');
  assert.ok(listStart >= 0 && deleteStart > listStart, '删号 Storage helper 不见了');
  const listSrc = supabaseSrc.slice(listStart, deleteStart);
  const deleteSrc = supabaseSrc.slice(deleteStart);

  assert.match(listSrc, /STORAGE_LIST_PAGE_SIZE/);
  assert.match(listSrc, /offset/);
  assert.match(listSrc, /if \(error\) throw error/);
  assert.match(listSrc, /data\.length < STORAGE_LIST_PAGE_SIZE/);
  assert.match(deleteSrc, /const paths = await listAllUnder\(bucket, session\.user\.id\)/);
  assert.match(deleteSrc, /const \{ error \} = await supabase\.storage\.from\(bucket\)\.remove\(paths\)/);
  assert.match(deleteSrc, /if \(error\) throw error/);
  assert.ok(
    deleteSrc.indexOf('.remove(paths)') < deleteSrc.indexOf("rpc('delete_my_account')"),
    'Storage 清理必须发生在 delete_my_account RPC 之前',
  );
  assert.doesNotMatch(deleteSrc, /文件删不掉不该挡住账号删除/);
  assert.match(deleteSrc, /return \{ ok: false, error: '删除未完成，请重试' \}/);
});

test('S2：pushProgress 检查 upsert 与 delete 的数据库错误', () => {
  const start = syncSrc.indexOf('export async function pushProgress');
  const end = syncSrc.indexOf('/** 口袋是用户主动选择的数据', start);
  const push = syncSrc.slice(start, end);
  assert.equal([...push.matchAll(/const \{ error \}/g)].length, 2);
  assert.equal([...push.matchAll(/if \(error\) throw error/g)].length, 2);
});
