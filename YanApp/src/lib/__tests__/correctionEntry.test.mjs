import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../../App.js', import.meta.url), 'utf8');
const detail = app.slice(app.indexOf('function WBDetailPage'), app.indexOf('const wd = StyleSheet.create'));

test('纠错入口只在词卡详情页，并位于底部导航之前', () => {
  const entryIndex = detail.indexOf('style={wd.correctionBtn}');
  const bottomNavIndex = detail.indexOf('<View style={wd.bottomNav}>');

  assert.ok(entryIndex >= 0, '词卡详情页缺少去纠错入口');
  assert.ok(bottomNavIndex > entryIndex, '去纠错没有放在词卡内容底部');
  assert.equal((detail.match(/去纠错/g) || []).length, 1, '词卡以外不应重复出现纠错入口');
});

test('纠错表单固定三项，入口不使用主色按钮样式', () => {
  assert.match(detail, /中文意思不对/);
  assert.match(detail, /日语不自然/);
  assert.match(detail, /例句和这个词对不上/);
  assert.equal((detail.match(/\['(?:meaning|unnatural|example_mismatch)'/g) || []).length, 3);

  const style = app.match(/correctionBtn:\s*\{([^}]*)\}/)?.[1] || '';
  assert.doesNotMatch(style, /backgroundColor|C\.lava/);
});
