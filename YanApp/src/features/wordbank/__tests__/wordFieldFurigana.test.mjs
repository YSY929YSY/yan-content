import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { dictionaryFormsFrom } from '../wordFieldAlignment.js';
import {
  deriveWordFieldReading,
  deriveWordFieldReadingDetails,
  surfaceReadingsFrom,
  surfaceReadingsFromWordBank,
} from '../wordFieldFurigana.js';

const load = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const content = load('../../../../assets/content.fallback.json');
const exampleTokens = load('../../../../assets/example_tokens.json');
const dictionaryForms = dictionaryFormsFrom(exampleTokens);
const exampleSurfaceReadings = surfaceReadingsFrom(exampleTokens);
const wordBankSurfaceReadings = surfaceReadingsFromWordBank(content.wordBank);

test('有唯一读音且能对齐的词场句才返回整行读音', () => {
  assert.equal(
    deriveWordFieldReading('千円で足りる？', content.wordBank, dictionaryForms, exampleSurfaceReadings, wordBankSurfaceReadings),
    'せんえんでたりる？',
  );
});

test('多音字没有上下文标准答案时整行留空', () => {
  const result = deriveWordFieldReadingDetails(
    '妊娠何か月ですか。',
    content.wordBank,
    dictionaryForms,
    exampleSurfaceReadings,
    wordBankSurfaceReadings,
  );
  assert.equal(result.status, 'partial');
  assert.equal(result.reading, null);
  assert.deepEqual(result.missing[0], {
    surface: '月',
    source: 'wordBank',
    readings: ['つき', 'がつ'],
  });
});

test('部分 token 失败时不拼半行', () => {
  const result = deriveWordFieldReadingDetails(
    '私の目は青いです。',
    content.wordBank,
    dictionaryForms,
    exampleSurfaceReadings,
    wordBankSurfaceReadings,
  );
  assert.equal(result.status, 'partial');
  assert.equal(result.reading, null);
  assert.ok(result.missing.some((item) => item.surface === '私'));
});

test('纯假名和标点可以原样保留', () => {
  assert.equal(
    deriveWordFieldReading('トルコ語を習ってるんだ。', content.wordBank, dictionaryForms, exampleSurfaceReadings, wordBankSurfaceReadings),
    'トルコごをならってるんだ。',
  );
});
