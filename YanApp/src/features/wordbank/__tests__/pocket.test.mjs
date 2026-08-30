import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addToPocket, isPocketed, mergePocketPull, normalizePocket, pocketKey, pocketWords, removeFromPocket } from '../pocket.js';

const word = { word: '買う', reading: 'かう' };

test('口袋键沿用裸的词-读音格式', () => {
  assert.equal(pocketKey(word), '買う-かう');
});

test('读盘归一去重并忽略坏值', () => {
  assert.deepEqual(normalizePocket(['買う-かう', '買う-かう', '', null, 3]), ['買う-かう']);
});

test('读盘时把旧口袋键折算到现行键，不改裸的词-读音格式', () => {
  assert.deepEqual(normalizePocket(['おねがいします-おねがいします']), ['お願いします-おねがいします']);
  assert.equal(pocketKey({ word: 'お願いします', reading: 'おねがいします' }), 'お願いします-おねがいします');
});

test('云端口袋失败或为空都不能抹掉本机选择，成功时取并集', () => {
  const local = ['買う-かう'];
  assert.deepEqual(mergePocketPull(local, { ok: false, ids: [] }), local);
  assert.deepEqual(mergePocketPull(local, { ok: true, ids: [] }), local);
  assert.deepEqual(mergePocketPull(local, { ok: true, ids: ['売る-うる'] }), ['買う-かう', '売る-うる']);
});

test('入袋和移出是幂等纯函数', () => {
  const once = addToPocket([], word);
  assert.deepEqual(addToPocket(once, word), once);
  assert.equal(isPocketed(once, word), true);
  assert.deepEqual(removeFromPocket(once, word), []);
});

test('只返回词库中确实在口袋的词', () => {
  assert.deepEqual(pocketWords([word, { word: '売る', reading: 'うる' }], ['買う-かう']).map(pocketKey), ['買う-かう']);
});
