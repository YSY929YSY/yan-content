// 同步冲突规则测试
//
// 「该不该用云端覆盖本地」写反一次就是静默丢数据。
// 原则:拿不准一律保本地 —— 用户手上还有本地那份,而被顶掉的数据找不回来。
import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudIsNewer } from '../syncRules.js';

const T = (s) => new Date(s).toISOString();

test('云端更新时才覆盖本地', () => {
  assert.equal(cloudIsNewer(T('2026-07-31T10:00'), T('2026-07-30T10:00')), true);
});

test('本地更新时绝不覆盖(旧设备不能顶掉新数据)', () => {
  assert.equal(cloudIsNewer(T('2026-07-30T10:00'), T('2026-07-31T10:00')), false);
});

test('同一时刻不覆盖', () => {
  const t = T('2026-07-31T10:00');
  assert.equal(cloudIsNewer(t, t), false);
});

test('本地是老版本存档(无时间戳)时,采用云端', () => {
  assert.equal(cloudIsNewer(T('2026-07-31T10:00'), null), true);
  assert.equal(cloudIsNewer(T('2026-07-31T10:00'), undefined), true);
});

test('云端没有时间戳时不覆盖', () => {
  assert.equal(cloudIsNewer(null, T('2026-07-30T10:00')), false);
  assert.equal(cloudIsNewer(undefined, T('2026-07-30T10:00')), false);
});

test('两边都没有时间戳时不覆盖', () => {
  assert.equal(cloudIsNewer(null, null), false);
});

test('时间戳解析不出来时不覆盖(宁可不同步,不要丢数据)', () => {
  assert.equal(cloudIsNewer('not-a-date', T('2026-07-30T10:00')), false);
  assert.equal(cloudIsNewer(T('2026-07-31T10:00'), 'garbage'), false);
  assert.equal(cloudIsNewer('', ''), false);
});

test('毫秒级差异也能分辨', () => {
  assert.equal(cloudIsNewer('2026-07-31T10:00:00.002Z', '2026-07-31T10:00:00.001Z'), true);
  assert.equal(cloudIsNewer('2026-07-31T10:00:00.001Z', '2026-07-31T10:00:00.002Z'), false);
});
