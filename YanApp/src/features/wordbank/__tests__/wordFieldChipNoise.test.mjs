import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { fieldMemberChips } from '../fieldMemberMatching.js';

const load = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));

test('词场 chip 过滤自己的词，并丢掉查不到的成员', () => {
  const words = new Map([
    ['self', { word: '聞く', meaning_zh: '听' }],
    ['other', { word: '名前', meaning_zh: '名字' }],
  ]);
  const chips = fieldMemberChips(
    { members: [{ id: 'self' }, { id: 'other' }, { id: 'missing' }] },
    'self',
    id => words.get(id),
  );
  assert.deepEqual(chips, [{ id: 'other', word: words.get('other') }]);
});

test('只有自己的成员过滤后为空，调用方可据此不渲染整行', () => {
  const word = { id: 'self', word: 'お菓子' };
  assert.deepEqual(fieldMemberChips({ members: [{ id: word.id }] }, word.id, () => word), []);
});

test('真实内容包渲染出的自指 chip 为 0，8 条单成员词场没有 chip', () => {
  const content = load('../../../../assets/content.fallback.json');
  const byId = new Map((content.wordBank || []).map(word => [word.id, word]));
  const fields = (content.wordBank || []).flatMap(word => {
    const wordFields = Array.isArray(word.wordField) ? word.wordField : (word.wordField ? [word.wordField] : []);
    return wordFields.filter(field => field?.sentence?.jp).map(field => ({ word, field }));
  });
  let selfChips = 0;
  const singleMemberIds = [];
  for (const { word, field } of fields) {
    const chips = fieldMemberChips(field, word.id, id => byId.get(id));
    selfChips += chips.filter(chip => chip.id === word.id).length;
    if ((field.members || []).length === 1 && field.members[0]?.id === word.id) singleMemberIds.push(word.id);
  }
  assert.equal(fields.length, 276);
  assert.equal(selfChips, 0);
  assert.equal(singleMemberIds.length, 8);
  assert.deepEqual(singleMemberIds, ['n5_ie', 'n5_okashi', 'n5_kata', 'n5_kodomo', 'n5_shashin', 'n5_sukoshi', 'n5_tegami', 'n5_ni']);
});

test('App 接线以 chip 数决定是否渲染容器', () => {
  const app = readFileSync(new URL('../../../../App.js', import.meta.url), 'utf8');
  assert.match(app, /fieldMemberChips\(wordField, entry\.id, lookupWord\)/);
  assert.match(app, /memberChips\.length > 0 && <View style=\{wd\.wfChips\}>/);
});
