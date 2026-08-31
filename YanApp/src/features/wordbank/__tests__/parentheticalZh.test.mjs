import assert from 'node:assert/strict';
import test from 'node:test';

import { splitParentheticalZh } from '../parentheticalZh.js';

test('全角括号注被切出，且 #19 的两个注都保留', () => {
  assert.deepEqual(splitParentheticalZh('（我）听到有人叫（我的）名字。'), [
    { kind: 'note', text: '（我）' },
    { kind: 'text', text: '听到有人叫' },
    { kind: 'note', text: '（我的）' },
    { kind: 'text', text: '名字。' },
  ]);
});

test('没有全角括号或只有半角括号时不介入', () => {
  assert.equal(splitParentheticalZh('请给我一杯咖啡。'), null);
  assert.equal(splitParentheticalZh('请给(我)一杯咖啡。'), null);
});

test('不成对、嵌套或空的全角括号 fail closed', () => {
  for (const value of ['请给（我一杯咖啡。', '请给我）一杯咖啡。', '（（我））听到。', '请给（）一杯咖啡。']) {
    assert.equal(splitParentheticalZh(value), null, value);
  }
});
