import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meaningTrust } from '../../features/wordbank/meaningTrust.js';

test('释义可信度只读显式字段', () => {
  assert.equal(meaningTrust({ meaning_zh_status: 'human_reviewed', status: 'zh_drafted' }), 'human_reviewed');
  assert.equal(meaningTrust({ meaning_zh_status: 'editorial_published', status: 'candidate' }), 'editorial_published');
});

test('缺字段或未知字段 fail closed 为 machine_drafted', () => {
  assert.equal(meaningTrust({ status: 'verified' }), 'machine_drafted');
  assert.equal(meaningTrust({ meaning_zh_status: 'source_verified' }), 'machine_drafted');
  assert.equal(meaningTrust(null), 'machine_drafted');
});

test('返回值集合不包含 source_verified', () => {
  for (const value of ['machine_drafted', 'human_reviewed', 'editorial_published']) {
    assert.notEqual(value, 'source_verified');
  }
});

