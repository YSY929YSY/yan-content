import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateContentShape } from '../contentSchema.ts';

function validContent() {
  return {
    scenes: [], mapPlaces: [], culturalFusion: [], kanaRows: [], wordBank: [],
    subwayAdventure: { stations: [] },
  };
}

test('★★ bundled fallback 通过与远端相同的最低运行时结构闸门', () => {
  const fallback = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../assets/content.fallback.json'), 'utf8'));
  assert.deepEqual(validateContentShape(fallback), { ok: true, reason: null });
});

test('必需顶层字段与地铁 stations 分别守住', () => {
  for (const key of ['scenes', 'mapPlaces', 'culturalFusion', 'kanaRows', 'wordBank']) {
    const value: Record<string, unknown> = validContent();
    delete value[key];
    assert.equal(validateContentShape(value).ok, false, `${key} 缺失必须拒绝`);
  }
  assert.equal(validateContentShape({ ...validContent(), subwayAdventure: {} }).ok, false);
});

test('根节点必须是普通对象，不能让可解析的错误页混进内容缓存', () => {
  for (const value of [null, [], 'upstream error']) {
    assert.deepEqual(validateContentShape(value), { ok: false, reason: '$: expected object' });
  }
});

test('可选假名数组若出现就不能是错类型；wordCards 对象保持允许', () => {
  assert.equal(validateContentShape({ ...validContent(), voicedRows: {} }).ok, false);
  assert.deepEqual(validateContentShape({ ...validContent(), wordCards: { order: {} } }), { ok: true, reason: null });
  assert.deepEqual(validateContentShape({ ...validContent(), wordCards: [] }), { ok: true, reason: null });
});

test('_meta 只守对象形状，不把版本字段带进运行时闸门', () => {
  assert.equal(validateContentShape({ ...validContent(), _meta: [] }).ok, false);
  assert.equal(validateContentShape({ ...validContent(), _meta: {} }).ok, true);
});
