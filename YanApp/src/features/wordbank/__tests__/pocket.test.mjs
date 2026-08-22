import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addToPocket, isPocketed, normalizePocket, pocketKey, pocketWords, removeFromPocket } from '../pocket.js';

const word = { word: '買う', reading: 'かう' };

test('口袋键沿用裸的词-读音格式', () => {
  assert.equal(pocketKey(word), '買う-かう');
});

test('读盘归一去重并忽略坏值', () => {
  assert.deepEqual(normalizePocket(['買う-かう', '買う-かう', '', null, 3]), ['買う-かう']);
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
