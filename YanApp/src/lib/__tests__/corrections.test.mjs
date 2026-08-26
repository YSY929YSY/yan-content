import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CORRECTION_KINDS,
  appendJsonlLine,
  appendJsonlRecord,
} from '../correctionsModel.js';

const baseRecord = (kind, i = 0) => ({
  ts: `2026-08-26T12:34:5${i}Z`,
  wordId: `n5_test_${i}`,
  word: '頭',
  reading: 'あたま',
  kind,
  note: '',
  appVersion: '1.1.0',
});

test('追加 JSONL 时保留旧行，并且新记录只占一行', () => {
  const first = JSON.stringify(baseRecord('meaning'));
  const next = appendJsonlLine(`${first}\n`, baseRecord('unnatural', 1));
  const lines = next.trimEnd().split('\n');

  assert.equal(lines.length, 2);
  assert.deepEqual(JSON.parse(lines[0]), baseRecord('meaning'));
  assert.deepEqual(JSON.parse(lines[1]), baseRecord('unnatural', 1));
});

test('三种纠错类型都能追加成功', async () => {
  let contents = '';
  for (const [i, kind] of CORRECTION_KINDS.entries()) {
    const ok = await appendJsonlRecord({
      readText: async () => contents,
      writeText: async (text) => { contents = text; },
    }, baseRecord(kind, i));
    assert.equal(ok, true);
  }

  const rows = contents.trimEnd().split('\n').map(JSON.parse);
  assert.deepEqual(rows.map(row => row.kind), [...CORRECTION_KINDS]);
});

test('读失败或写失败都返回 false，不报成功', async () => {
  const record = baseRecord('meaning');
  const readFailed = await appendJsonlRecord({
    readText: async () => { throw new Error('read failed'); },
    writeText: async () => { throw new Error('must not write'); },
  }, record);
  const writeFailed = await appendJsonlRecord({
    readText: async () => '',
    writeText: async () => { throw new Error('write failed'); },
  }, record);

  assert.equal(readFailed, false);
  assert.equal(writeFailed, false);
});
