// storage.js 的登记表体检。
//
// 为什么值得测:这张表存在的意义就是「不靠人记得」。如果表本身写错了
// —— 两个功能撞了同一个键、user 类数据忘了标 backfill —— 那它就退化成了
// 一份会骗人的文档,比没有更糟。这些是纯数据校验,不需要跑 RN。
//
// 用正则从源码里读 REGISTRY,而不是 import:storage.js 依赖 AsyncStorage 和
// __DEV__,都是 RN 运行时的东西,node --test 里没有。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../storage.js', import.meta.url), 'utf8');

const entries = [...src.matchAll(
  /^\s{2}(\w+):\s*\{\s*\n\s*key:\s*'([^']+)',\s*kind:\s*'(\w+)',\s*backfill:\s*(null|'[\w]+')/gm
)].map(m => ({
  name: m[1],
  key: m[2],
  kind: m[3],
  backfill: m[4] === 'null' ? null : m[4].slice(1, -1),
}));

test('登记表能被解析出来(正则没有失配)', () => {
  assert.ok(entries.length >= 13, `只解析出 ${entries.length} 条,正则可能和源码格式脱节了`);
});

test('键值不重复 —— 两个功能共用一个键会互相覆盖', () => {
  const keys = entries.map(e => e.key);
  assert.equal(new Set(keys).size, keys.length,
    '重复键: ' + keys.filter((k, i) => keys.indexOf(k) !== i).join(', '));
});

test('所有键都带 yan_ 前缀 —— wipeAll 按前缀清,不带前缀的删号清不掉', () => {
  for (const e of entries) {
    assert.ok(e.key.startsWith('yan_'), `${e.name} 的键 ${e.key} 没有 yan_ 前缀`);
  }
});

test('kind 只能是 user / cache / device', () => {
  for (const e of entries) {
    assert.ok(['user', 'cache', 'device'].includes(e.kind), `${e.name} 的 kind=${e.kind} 不合法`);
  }
});

test('user 类数据必须参与登录补传', () => {
  // 这条就是 Fix 3 那个 bug 的守卫:打卡日期、手账备注都是 user 类,
  // 当初没被补传,用户登录后旅迹就画不出来了。
  for (const e of entries.filter(x => x.kind === 'user')) {
    assert.ok(e.backfill, `${e.name}(${e.key})是 user 数据却没标 backfill —— 登录换账号时会丢`);
  }
});

test('非 user 类不该参与补传 —— 缓存能重新拉,传它没有意义', () => {
  for (const e of entries.filter(x => x.kind !== 'user')) {
    assert.equal(e.backfill, null, `${e.name} 是 ${e.kind} 却标了 backfill=${e.backfill}`);
  }
});

test('backfill 域名和 backfillAll 里实现的域一致', () => {
  const syncSrc = readFileSync(new URL('../sync.js', import.meta.url), 'utf8');
  const implemented = new Set(
    [...syncSrc.matchAll(/await run\('(\w+)'/g)].map(m => m[1])
  );
  const declared = new Set(entries.map(e => e.backfill).filter(Boolean));
  for (const d of declared) {
    assert.ok(implemented.has(d),
      `登记表声明了 backfill 域 "${d}",但 backfillAll() 里没有对应的 run('${d}')`);
  }
});

test('三个已修复的 bug 不会悄悄退回去', () => {
  const byKey = Object.fromEntries(entries.map(e => [e.key, e]));
  // 手账备注:曾经只写内存,不落盘
  assert.ok(byKey['yan_world_place_notes'], '手账备注的键不见了');
  // 打卡日期:曾经落了盘但登录不补传
  assert.equal(byKey['yan_world_checkin_dates'].backfill, 'checkins');
  // 自定义地点:曾经删号不清、登录不补传
  assert.equal(byKey['yan_user_places_v1'].kind, 'user');
  assert.equal(byKey['yan_user_places_v1'].backfill, 'userPlaces');
  // 旅行本:曾经登录完全不补传
  assert.equal(byKey['yan_trip_notebook_v1'].backfill, 'notebook');
});

// ── 读失败 ≠ 数据是空的 ──────────────────────────────────────
//
// 这几条也是从源码正则读的(同上:storage.js 在 node 里 import 不了)。
// 测源码结构不如测行为,但**这个取舍太容易被后人"简化"掉**,而简化掉之后
// 不会报错、不会红,只会在某次读盘失败时把用户数据清空 —— 那正是这个项目
// 犯过至少四次的错。宁可要一条脆一点的测试,也不要没有。

test('★ readJsonResult 里:拿不到才 ok:false,解析失败算 ok —— 两者不能混', () => {
  const fn = src.match(/export async function readJsonResult[\s\S]*?\n}/)?.[0];
  assert.ok(fn, 'readJsonResult 不见了 —— 它是「区分读失败」的唯一入口');

  // getItem 那个 catch 必须报 ok:false:这次读不到,下次可能读得到,调用方要保持现状
  assert.match(fn, /catch \(e\)[\s\S]*?ok: false/,
    'getItem 失败必须返回 ok:false,否则调用方会拿空值写回磁盘');
  // JSON.parse 那个 catch 必须是 ok:true:坏数据重试一万次还是坏的,当没有才能往前走
  const parseCatch = fn.split('JSON.parse')[1] || '';
  assert.match(parseCatch, /catch\s*\{\s*\n?\s*return \{ ok: true/,
    '解析失败该当「确实没有」(ok:true),不然一条坏数据能让整个功能永久卡住');
});

test('★ readJson 必须委托给 readJsonResult —— 两份实现一定会漂', () => {
  const fn = src.match(/export async function readJson\(key[\s\S]*?\n}/)?.[0];
  assert.ok(fn, 'readJson 不见了');
  assert.match(fn, /readJsonResult\(key\)/,
    'readJson 要走 readJsonResult。各写一份的话,哪天只改了一边,'
    + '「区分失败」这件事就只在一半的调用点成立 —— 而那一半是哪些没人说得清');
});
