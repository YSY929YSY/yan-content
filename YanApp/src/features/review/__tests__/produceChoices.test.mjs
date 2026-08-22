import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProduceChoices, isProduceAnswer, splitJapanese } from '../produceChoices.js';

test('便利店句子切成可回拼的唯一词块', () => {
  const blocks = splitJapanese('カードで払えますか？');
  assert.deepEqual(blocks, ['カードで', '払えますか', '？']);
  assert.equal(new Set(blocks).size, blocks.length);
});

test('干扰项来自场景词且不重复正确词块', () => {
  const result = buildProduceChoices({ answer: 'カードで払えますか？' }, ['カード', '袋', 'カード', 'レジ']);
  assert.deepEqual(result.correct, ['カードで', '払えますか', '？']);
  assert.equal(new Set(result.choices).size, result.choices.length);
  assert.equal(result.choices.includes('袋'), true);
  assert.equal(result.choices.includes('カード'), true);
});

test('只有一个词块时降级自评', () => {
  assert.equal(buildProduceChoices({ answer: 'いりません' }).mode, 'self_assess');
});

test('拼对和拼错是有限集比较', () => {
  assert.equal(isProduceAnswer(['カードで', '払えますか', '？'], ['カードで', '払えますか', '？']), true);
  assert.equal(isProduceAnswer(['袋', 'カードで'], ['カードで', '袋']), false);
});
