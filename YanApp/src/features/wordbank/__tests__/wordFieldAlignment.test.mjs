import assert from 'node:assert/strict';
import test from 'node:test';

import { buildWordFieldAlignment, wordFieldGrammar } from '../wordFieldAlignment.js';

test('词场逐词中文优先查词库并固定识别语法成分', () => {
  const rows = buildWordFieldAlignment('レシートをください。', [
    { word: 'レシート', reading: 'れしーと', meaning_zh: '小票' },
  ]);
  assert.deepEqual(rows.map(row => row.jp), ['レシート', 'を', 'ください', '。']);
  assert.deepEqual(rows.map(row => row.zh), ['小票', '（宾语）', '（请）', '。']);
});

test('读音命中表记差异，查不到的活用片段留空', () => {
  const rows = buildWordFieldAlignment('買いました。', [
    { word: '買う', reading: 'かう', meaning_zh: '买' },
  ]);
  assert.equal(rows.find(row => row.jp === 'ました').zh, '（过去）');
  assert.equal(rows.find(row => row.source === 'blank').zh, '');
  assert.equal(wordFieldGrammar['を'], '（宾语）');
});
