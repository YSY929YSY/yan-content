// 内容包的 publication 契约。
//
// 守的是一种「不报错但越权」的失败:一条还没准入的词悄悄带上了可学习标记,
// 或者两份内容包分了叉 —— 联网用户和离线用户拿到不同的准入规则。
//
// ⚠️ 这里**只守一般不变量,不冻结当前条数**。
// 8005 / 563 / 7442 属于**本次迁移的验收**,由 tools/stamp-wordbank-publication.py --check
// 和 CC 报告记录。写进永久测试的话,以后内容一增长这些断言就会因为历史数字而失败,
// 而那时失败的原因和契约对不对无关 —— 那种测试只会被人改掉,不会被人当真。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isDictionaryEntry, isLearnableWord, hasDictionaryShape,
} from '../../features/wordbank/publication.ts';

const REMOTE = new URL('../../../../yan-content/content.v2.json', import.meta.url);
const FALLBACK = new URL('../../../assets/content.fallback.json', import.meta.url);

const bank = () => JSON.parse(readFileSync(FALLBACK, 'utf8')).wordBank || [];
const filled = (v) => typeof v === 'string' && v.trim() !== '';

// ── 1. 两份内容包不能分叉 ───────────────────────────────────

test('★★ remote 与 fallback 原始字节完全相同', () => {
  // 分叉的后果不是「数字对不上」,是**联网用户和离线用户拿到不同的准入规则** ——
  // 同一个词在两台手机上一个能学一个不能,而没有任何报错。
  const a = readFileSync(REMOTE);
  const b = readFileSync(FALLBACK);
  assert.equal(a.length, b.length, `字节数不同:${a.length} vs ${b.length}`);
  assert.ok(a.equals(b), '两份内容包内容不同');
});

// ── 2-6. 每条 publication 的形状 ────────────────────────────

test('★★ 每条 publication 是非数组对象,且两个布尔都是真布尔', () => {
  // 不接受 1 / "true" / truthy —— 内容包是脚本生成的,形状漂移只能挡不能猜。
  const bad = [];
  for (const w of bank()) {
    const p = w.publication;
    if (!p || typeof p !== 'object' || Array.isArray(p)) { bad.push([w.id, 'publication 不是对象']); continue; }
    if (typeof p.dictionary !== 'boolean') bad.push([w.id, `dictionary=${JSON.stringify(p.dictionary)}`]);
    if (typeof p.learning !== 'boolean') bad.push([w.id, `learning=${JSON.stringify(p.learning)}`]);
  }
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} 条形状不合法`);
});

test('★★ learning === true 必须同时 dictionary === true', () => {
  // 「能学但查不到」是自相矛盾的状态:用户在词书里学了一个词,
  // 回头搜索却搜不到它。这条是 publication.ts 的 isLearnableWord 在数据侧的对应约束。
  const bad = bank().filter(w => w.publication?.learning === true
                              && w.publication?.dictionary !== true);
  assert.deepEqual(bad.map(w => w.id).slice(0, 5), [], `${bad.length} 条 learning-without-dictionary`);
});

test('★ dictionary true 必须有非空 dictionaryBasis', () => {
  const bad = bank().filter(w => w.publication?.dictionary === true
                              && !filled(w.publication?.dictionaryBasis));
  assert.deepEqual(bad.map(w => w.id).slice(0, 5), [], `${bad.length} 条缺 dictionaryBasis`);
});

test('★ learning true 必须有非空 learningBasis', () => {
  // basis 记录的是一次**正向准入依据**。没有依据的准入,以后没人能追溯它凭什么放行。
  const bad = bank().filter(w => w.publication?.learning === true
                              && !filled(w.publication?.learningBasis));
  assert.deepEqual(bad.map(w => w.id).slice(0, 5), [], `${bad.length} 条缺 learningBasis`);
});

test('★ learning false 不得携带 learningBasis', () => {
  // 「尚未准入」没有可以冒充证据的 basis。写了(哪怕是 null)就会造出
  // 第三种需要解释的业务状态,而 null 和「字段不存在」在下游会被不同代码不同判断。
  const bad = bank().filter(w => w.publication?.learning === false
                              && 'learningBasis' in (w.publication || {}));
  assert.deepEqual(bad.map(w => w.id).slice(0, 5), [], `${bad.length} 条不该带 learningBasis`);
});

// ── 7. 防整库 fail closed ───────────────────────────────────

test('★★ 至少各有一条 Dictionary 和 Learning —— 防整库 fail closed', () => {
  // selector 是 fail closed 的:publication 一旦整体丢失或全 false,
  // App 会静默地变成「一个词都不能查、一个词都不能学」,而所有形状测试照样全绿。
  const ws = bank();
  assert.ok(ws.some(w => isDictionaryEntry(w)), '没有任何一条可查');
  assert.ok(ws.some(w => isLearnableWord(w)), '没有任何一条可学');
});

// ── 8. selector 与数据一致 ──────────────────────────────────

test('★★ selector 跑真实内容,结果与原始 publication 逐条一致', () => {
  // 这条把「数据说了什么」和「代码怎么读它」绑在一起。
  // 两边任何一侧改了口径而另一侧没跟,这里会当场挂。
  const mismatch = [];
  for (const w of bank()) {
    const p = w.publication || {};
    const wantDict = p.dictionary === true && hasDictionaryShape(w);
    const wantLearn = wantDict && p.learning === true;
    if (isDictionaryEntry(w) !== wantDict) mismatch.push([w.id, 'dictionary']);
    if (isLearnableWord(w) !== wantLearn) mismatch.push([w.id, 'learning']);
  }
  assert.deepEqual(mismatch.slice(0, 5), [], `${mismatch.length} 条 selector 与数据不一致`);
});

// ── 9. 结构坏的词不得被放行 ─────────────────────────────────

test('★★ 结构坏的词不得带 dictionary: true', () => {
  // 否则会造出「内容包说可查、App 的 selector 说结构坏」的矛盾态 ——
  // 用户看到的是一个查不出内容的词条,而数据侧认为一切正常。
  const bad = bank().filter(w => w.publication?.dictionary === true && !hasDictionaryShape(w));
  assert.deepEqual(bad.map(w => w.id).slice(0, 5), [], `${bad.length} 条结构坏却被放行`);
});
