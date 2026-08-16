// 词条 id 的护栏。
//
// 背景:手账的词纸条(JournalItem 的 wordSlip)引用词条 id。
// 这是「词」和「手账」之间唯一的一根线 —— 工单原话:
// 「词卡是词的定义,手账是词的传记。」
//
// 传记指向定义,靠的就是这个 id。它一旦改名或消失:
//   · 用户手账里那张纸条永远指向一个不存在的词
//   · 不报错、不提示,只是点不开
//
// 这个项目已经因为「键悄悄变了」丢过用户数据(2026-08 的 267 组合并,
// 见 keyAliases.js),那次是复习进度,这次会是手账。同一个坑不踩第二次。
//
// ⚠️ 注意这里守的**不是** id 存在,而是三件更具体的事:
//   1. 两份线上词库(远端 content.v2.json / 内置 content.fallback.json)
//      的 id 完全一致 —— 分叉了没人会发现
//   2. 清单里的 id 一个都不能少(新增不限)
//   3. id 和「词-读音」进度键一一对应 —— 两套键必须能互相换算
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../../../', import.meta.url);          // my-app/
const read = (p) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));

const bundled = read('YanApp/assets/content.fallback.json').wordBank;
const remote = read('yan-content/content.v2.json').wordBank;

const manifest = readFileSync(
  new URL('YanApp/src/features/wordbank/wordIds.manifest.txt', ROOT), 'utf8',
).split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));

// 和 App.js:1793 的 wordKey 保持一致
const wordKey = (w) => `${w.word}-${w.reading}`;

test('两份词库条数一致 —— 远端和内置分叉了没人会发现', () => {
  assert.equal(bundled.length, remote.length,
    `内置 ${bundled.length} 条,远端 ${remote.length} 条`);
});

test('每一条都有非空 id', () => {
  const missing = bundled.filter(w => !w?.id || !String(w.id).trim()).map(w => wordKey(w));
  assert.deepEqual(missing, [], '这些词没有 id,词纸条没法引用它们');
});

test('id 全唯一 —— 重复的话词纸条会指向两个词', () => {
  const seen = new Map();
  for (const w of bundled) seen.set(w.id, (seen.get(w.id) ?? 0) + 1);
  const dups = [...seen].filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`);
  assert.deepEqual(dups, []);
});

test('两份词库的 id 集合完全相同', () => {
  const a = new Set(bundled.map(w => w.id));
  const b = new Set(remote.map(w => w.id));
  const onlyBundled = [...a].filter(x => !b.has(x));
  const onlyRemote = [...b].filter(x => !a.has(x));
  assert.deepEqual(onlyBundled, [], '只在内置里有的 id —— 联网的用户会看到断链纸条');
  assert.deepEqual(onlyRemote, [], '只在远端有的 id —— 离线的用户会看到断链纸条');
});

test('同一个 id 在两份里指向同一个词', () => {
  const b = new Map(remote.map(w => [w.id, wordKey(w)]));
  const drift = bundled
    .filter(w => b.has(w.id) && b.get(w.id) !== wordKey(w))
    .map(w => `${w.id}: 内置「${wordKey(w)}」/ 远端「${b.get(w.id)}」`);
  assert.deepEqual(drift, [], 'id 相同但词不同 —— 比断链更糟,纸条会静默指向别的词');
});

test('★ 清单里的 id 一个都不能少(新增不限)', () => {
  // 这是那条契约本身。删词或改名会在这里挂掉,
  // 而不是等到用户点开一张空白纸条。
  const have = new Set(bundled.map(w => w.id));
  const gone = manifest.filter(id => !have.has(id));
  assert.deepEqual(gone, [],
    '这些 id 从词库里消失了。要真删,先补一张别名映射(照 keyAliases.js 的样子),再更新清单');
});

test('id 和「词-读音」进度键一一对应', () => {
  // 两套键并存:进度用「词-读音」(历史原因,已有用户数据),
  // 手账用 id。必须能互相换算,否则「这个词我在京都用过」这条线接不起来。
  const keys = new Set(bundled.map(w => wordKey(w)));
  assert.equal(keys.size, bundled.length, '「词-读音」有重复,没法当键用');
  const byKey = new Map(bundled.map(w => [wordKey(w), w.id]));
  assert.equal(byKey.size, bundled.length);
  const byId = new Map(bundled.map(w => [w.id, wordKey(w)]));
  assert.equal(byId.size, bundled.length);
});

test('清单本身没有重复行', () => {
  assert.equal(new Set(manifest).size, manifest.length);
  assert.ok(manifest.length >= 8005, `清单只有 ${manifest.length} 条,像是被截断了`);
});
