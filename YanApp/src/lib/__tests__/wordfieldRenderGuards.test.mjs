import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../../../App.js', import.meta.url), 'utf8');
const component = app.slice(app.indexOf('function WBDetailPage'), app.indexOf('const wd = StyleSheet.create'));

test('词场详情页把对齐计算放在 memo 中，纠错输入状态仍留在组件内', () => {
  assert.match(component, /const primaryColumns = useMemo\(/);
  assert.match(component, /const fieldRenderData = useMemo\(/);
  assert.match(component, /columns:[\s\S]*fieldTokenColumns\(/);
  assert.match(component, /alignment:[\s\S]*buildWordFieldAlignment\(/);
  assert.match(component, /fieldRenderData\.map\(/);
  assert.match(component, /const \[correctionNote, setCorrectionNote\] = useState\('\'\);/);
});
