import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildWordFieldAlignment, dictionaryFormsFrom } from '../../features/wordbank/wordFieldAlignment.js';

const load = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));

test('设备条件：N4 词书子集的 gloss 查询使用全库结果', () => {
  const appSource = readFileSync(new URL('../../../App.js', import.meta.url), 'utf8');
  const content = load('../../../assets/content.fallback.json');
  const exampleTokens = load('../../../assets/example_tokens.json');
  const fullBank = content.wordBank;
  const n4Bank = fullBank.filter(word => (word.levels || [word.level]).includes('N4'));
  const dictionaryForms = dictionaryFormsFrom(exampleTokens);
  const sentence = '店員にサイズを聞きます。';
  const expected = buildWordFieldAlignment(sentence, fullBank, dictionaryForms);
  const brokenSubsetResult = buildWordFieldAlignment(sentence, n4Bank, dictionaryForms);
  const deviceResult = buildWordFieldAlignment(sentence, fullBank, dictionaryForms);

  assert.notDeepEqual(
    brokenSubsetResult,
    expected,
    'mutation guard: passing the current N4 list as gloss bank must be observably broken',
  );
  assert.deepEqual(deviceResult, expected);
  assert.equal(deviceResult.find(row => row.jp === 'サイズ')?.zh, '尺寸');
  assert.equal(deviceResult.find(row => row.jp === '聞き')?.zh, '听');

  assert.match(appSource, /<WordBankScreen\s+[\s\S]*?wordBank=\{bookWords\}[\s\S]*?glossLookupBank=\{content\.wordBank \|\| \[\]\}/);
  assert.match(appSource, /function WordBankScreen\(\{ wordBank, glossLookupBank, book, onBack \}\)/);
  assert.match(appSource, /function WBDetailPage\(\{ entry, wordBank, glossLookupBank,/);
  assert.match(appSource, /fieldTokenColumns\(entry\.exampleJp, glossLookupBank\)/);
  assert.match(appSource, /fieldTokenColumns\(wordField\.sentence\.jp, glossLookupBank\)/);
  assert.match(appSource, /buildWordFieldAlignment\(wordField\.sentence\.jp, glossLookupBank,/);
});
