import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const renderer = read('../../features/wordbank/ExampleSentence.js');
const app = read('../../../App.js');

test('例句和词场共用三槽位 renderer，例句隐藏 gloss 槽', () => {
  assert.match(renderer, /export function TokenColumnSentence\(/);
  assert.match(renderer, /<View style=\{s\.furiganaSlot\}>[\s\S]*?<Furigana/);
  assert.match(renderer, /showGloss &&/);
  assert.match(renderer, /glossBlank/);
  assert.match(renderer, /columns=\{list\.map\([\s\S]*?showGloss=\{false\}/);
  assert.match(app, /import \{ ExampleSentence, TokenColumnSentence \}/);
  assert.match(app, /<TokenColumnSentence[\s\S]*?showGloss\s*\/>/);
});

test('B9-2 只切换两句样板，横向单位是 token column', () => {
  assert.match(app, /'店員にカードを見せます。'/);
  assert.match(app, /'店員にサイズを聞きます。'/);
  assert.match(app, /TOKEN_COLUMN_SAMPLE_SENTENCES\.has\(wordField\.sentence\.jp\)/);
  assert.match(app, /fieldTokenColumns\(wordField\.sentence\.jp, glossLookupBank\)/);
  assert.doesNotMatch(app, /店員にカードを見せます。[^\n]*marginLeft/);
  assert.doesNotMatch(app, /店員にサイズを聞きます。[^\n]*marginLeft/);
});
