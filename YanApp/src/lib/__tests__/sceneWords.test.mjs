import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneWordsOf, scenesOfWord } from '../../features/wordbank/sceneWords.js';

const learning = { publication: { learning: true } };

test('daily 不算具体场景', () => {
  assert.deepEqual(scenesOfWord({ tags: { scene: ['daily'] } }), []);
  assert.deepEqual(sceneWordsOf([{ ...learning, tags: { scene: ['daily'] } }], 'daily'), []);
});

test('未发布词被过滤', () => {
  const bank = [
    { word: '已发布', ...learning, tags: { scene: ['daily', 'convenience'] } },
    { word: '仅可查', publication: { dictionary: true }, tags: { scene: ['convenience'] } },
  ];
  assert.deepEqual(sceneWordsOf(bank, 'convenience').map((word) => word.word), ['已发布']);
});

test('没有该场景返回空数组，并保留其他场景标签', () => {
  const word = { ...learning, tags: { scene: ['daily', 'hotel', 'convenience'] } };
  assert.deepEqual(sceneWordsOf([word], 'subway'), []);
  assert.deepEqual(scenesOfWord(word), ['hotel', 'convenience']);
});

test('兼容单字符串 scene 标签', () => {
  assert.deepEqual(scenesOfWord({ tags: { scene: 'restaurant' } }), ['restaurant']);
});

