// 共享账本的本地/远端合并。
//
// 判错的后果是钱算错,而且是静默的:一笔账出现两次,结算金额翻倍。
// 这正是线上发生过的那个 bug,下面第一条测试就是它的回归。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isUuid, dedupeById, mergeExpenses, replaceLocalId,
} from '../ledgerMerge.js';

const UUID_A = '11111111-2222-3333-4444-555555555555';
const UUID_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const local = (id, amount = '100') => ({ id, amount, title: '门票' });

test('回归:写成功后换了 id,就不该再出现两条', () => {
  // 本地临时 id 记一笔 → 服务端返回 uuid → 替换 → 再和远端合并
  const afterSave = replaceLocalId([local('expense-1754')], 'expense-1754', local(UUID_A));
  const merged = mergeExpenses(afterSave, [local(UUID_A)]);
  assert.equal(merged.length, 1, '同一笔账不该出现两次');
  assert.equal(merged[0].id, UUID_A);
});

test('不换 id 就会重复 —— 说明 replaceLocalId 是必需的,不是优化', () => {
  // 这条刻意验证「少做那一步会怎样」,免得以后有人把它当冗余删掉
  const merged = mergeExpenses([local('expense-1754')], [local(UUID_A)]);
  assert.equal(merged.length, 2, '临时 id 没被替换时,合并必然产生两条');
});

test('离线记的账不会被远端结果吞掉', () => {
  const merged = mergeExpenses([local('expense-999')], [local(UUID_A)]);
  assert.ok(merged.some(e => e.id === 'expense-999'), '还没同步的笔必须保留');
});

test('拉取到的远端为准,同 id 不重复', () => {
  const merged = mergeExpenses([local(UUID_A, '50')], [local(UUID_A, '100')]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].amount, '100', '同一条以远端为准');
});

test('实时推送已经塞进来时,替换不会撞出重复', () => {
  // Realtime 比 save 的响应先到:列表里已经有远端那条了
  const list = [local('expense-1754'), local(UUID_A)];
  const out = replaceLocalId(list, 'expense-1754', local(UUID_A));
  assert.equal(out.length, 1);
});

test('replaceLocalId 拿不到服务端记录时原样返回,不丢数据', () => {
  const list = [local('expense-1754')];
  assert.deepEqual(replaceLocalId(list, 'expense-1754', null), list);
});

test('isUuid 只认真正的 uuid 格式', () => {
  assert.equal(isUuid(UUID_A), true);
  assert.equal(isUuid('expense-1754'), false);
  assert.equal(isUuid(''), false);
  assert.equal(isUuid(undefined), false);
  // 早期实现用的是 /^[0-9a-f-]{36}$/i,这种全是横线的串也会被误判成 uuid
  assert.equal(isUuid('------------------------------------'), false);
});

test('dedupeById 保留先出现的那条', () => {
  const out = dedupeById([local(UUID_A, '1'), local(UUID_B), local(UUID_A, '2')]);
  assert.equal(out.length, 2);
  assert.equal(out[0].amount, '1');
});

test('空输入不炸', () => {
  assert.deepEqual(mergeExpenses(), []);
  assert.deepEqual(dedupeById(), []);
});
