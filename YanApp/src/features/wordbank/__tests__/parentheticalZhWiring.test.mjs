import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../../../App.js', import.meta.url), 'utf8');
const review = readFileSync(new URL('../../review/ReviewScreen.js', import.meta.url), 'utf8');

test('词场中文行和复习提问面共用括号注切分函数', () => {
  assert.match(app, /splitParentheticalZh\(wordField\.sentence\.zh\)/);
  assert.match(app, /style=\{wd\.exZhNote\}/);
  assert.match(review, /splitParentheticalZh\(unit\?\.ask\)/);
  assert.match(review, /style=\{s\.askNote\}/);
});
