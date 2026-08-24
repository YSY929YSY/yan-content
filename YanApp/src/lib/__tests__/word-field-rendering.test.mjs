import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = readFileSync(resolve(import.meta.dirname, '../../../App.js'), 'utf8');
const detailStart = app.indexOf('function WBDetailPage(');
const detailEnd = app.indexOf('const wd = StyleSheet.create', detailStart);
const detail = app.slice(detailStart, detailEnd);
const styles = app.slice(detailEnd, app.indexOf('});', detailEnd) + 3);

test('词场日语 token 从顶部对齐，不用 minHeight + flex-end 撑基线', () => {
  assert.match(styles, /wfAlignRow: \{[^}]*alignItems: 'flex-start'/);
  assert.match(styles, /wfAlignToken: \{ alignItems: 'center' \}/);
  assert.doesNotMatch(styles, /wfAlignToken: \{[^}]*minHeight/);
  assert.doesNotMatch(styles, /wfAlignToken: \{[^}]*justifyContent: 'flex-end'/);
});

test('词场释义按 token.source 分层，语法文案去掉括号，blank 不渲染', () => {
  assert.match(detail, /token\.source === 'wordBank'[\s\S]*?wd\.wfAlignZh/);
  assert.match(detail, /token\.source === 'grammar'[\s\S]*?wd\.wfAlignGrammar/);
  assert.match(detail, /String\(token\.zh \|\| ''\)\.replace\(\/\^\[（\(\]\/,[\s\S]*?replace\(\/\[）\)\]\$\//);
  assert.match(detail, /!!glossStyle && !!gloss && <Text style=\{glossStyle\}>\{gloss\}<\/Text>/);
  assert.doesNotMatch(detail, /!!token\.zh && <Text style=\{wd\.wfAlignZh\}>\{token\.zh\}/);
  assert.match(styles, /wfAlignGrammar: \{[^}]*fontSize: 9[^}]*color: C\.mutedLight/);
});
