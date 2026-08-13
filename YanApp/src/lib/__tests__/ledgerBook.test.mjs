// 多账本的数据分桶与迁移测试。
//
// 这一组守的是钱的存储路径。以前只有一本账、账目摊在快照顶层,
// 分桶之后每一条读写都可能把账记进错的桶、或者把某一桶整个抹掉。
// 所以这里的重点不是「功能对不对」,而是**任何一条失败路径都不能丢数据**。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_KEY, LEDGER_TITLE_FALLBACK, normalizeLedger, findLedger, patchLedger,
  upsertLedger, pickActiveKey, migrateLedgers, mergeRemoteLedgers, applyCloudLedgers,
  isSharedKey, newLocalKey,
} from '../ledgerBook.js';

const UUID_A = '11111111-2222-3333-4444-555555555555';
const UUID_B = '66666666-7777-8888-9999-000000000000';

// ── 形状 ────────────────────────────────────────────────
test('normalizeLedger 补齐缺省字段', () => {
  const l = normalizeLedger({ key: 'local-1' });
  assert.equal(l.title, LEDGER_TITLE_FALLBACK);
  assert.equal(l.currency, '€');
  assert.deepEqual(l.members, []);
  assert.deepEqual(l.expenses, []);
  assert.equal(l.budget, null);
  assert.equal(l.shared, false);
});

test('★ 不认识的字段原样带着 —— 以后加字段不会被旧代码削掉', () => {
  const l = normalizeLedger({ key: 'local-1', 未来字段: '别删我' });
  assert.equal(l.未来字段, '别删我');
});

test('没有 key 的返回 null,不造一个空账本出来', () => {
  assert.equal(normalizeLedger({}), null);
  assert.equal(normalizeLedger(null), null);
  assert.equal(normalizeLedger('字符串'), null);
  assert.equal(normalizeLedger([]), null);
});

test('uuid key 认作共享账本,local- 前缀认作本机', () => {
  assert.equal(isSharedKey(UUID_A), true);
  assert.equal(isSharedKey('local-123'), false);
  assert.equal(normalizeLedger({ key: UUID_A }).shared, true);
  assert.equal(normalizeLedger({ key: UUID_A }).id, UUID_A);
  assert.equal(normalizeLedger({ key: 'local-9' }).id, null);
});

test('账本里的账目也过分类归一(晚餐→餐饮)', () => {
  const l = normalizeLedger({ key: 'local-1', expenses: [{ id: 'a', category: '晚餐' }] });
  assert.equal(l.expenses[0].category, '餐饮');
});

test('newLocalKey 带 local- 前缀,不会被当成共享账本', () => {
  assert.ok(newLocalKey(1700000000000).startsWith('local-'));
  assert.equal(isSharedKey(newLocalKey(1700000000000)), false);
});

// ── 增删改查 ─────────────────────────────────────────────
test('patchLedger 只动目标那本,其余原样', () => {
  const list = [normalizeLedger({ key: 'a', title: 'A' }), normalizeLedger({ key: 'b', title: 'B' })];
  const next = patchLedger(list, 'a', { title: '改了' });
  assert.equal(next[0].title, '改了');
  assert.equal(next[1], list[1], 'B 应该是同一个对象引用');
});

test('★ patchLedger 找不到就原样返回,绝不新建一个空桶', () => {
  const list = [normalizeLedger({ key: 'a' })];
  assert.equal(patchLedger(list, '不存在', { title: 'X' }), list);
  assert.equal(patchLedger(null, 'a', {}).length, 0);
});

test('patchLedger 支持函数式改法(要读旧值时用)', () => {
  const list = [normalizeLedger({ key: 'a', expenses: [{ id: '1', category: '购物' }] })];
  const next = patchLedger(list, 'a', l => ({ expenses: [...l.expenses, { id: '2', category: '门票' }] }));
  assert.equal(next[0].expenses.length, 2);
});

test('upsertLedger 同 key 不会产生两个桶', () => {
  let list = upsertLedger([], { key: 'a', title: 'A' });
  list = upsertLedger(list, { key: 'a', title: '又来一次' });
  assert.equal(list.length, 1);
});

test('★ upsert 合并时本地字段优先 —— 远端只补空缺,不覆盖本机现状', () => {
  let list = upsertLedger([], { key: UUID_A, currency: '₺', expenses: [{ id: 'x', category: '门票' }] });
  list = upsertLedger(list, { key: UUID_A, currency: '€', title: '远端标题' });
  assert.equal(list[0].currency, '₺', '本机上一笔用的币种不该被远端默认值改掉');
  assert.equal(list[0].expenses.length, 1, '本机账目不该被清空');
});

test('pickActiveKey:想要的还在就用它,不在就退回第一本', () => {
  const list = [normalizeLedger({ key: 'a' }), normalizeLedger({ key: 'b' })];
  assert.equal(pickActiveKey(list, 'b'), 'b');
  assert.equal(pickActiveKey(list, '已删掉的'), 'a');
  assert.equal(pickActiveKey([], 'a'), null);
  assert.equal(pickActiveKey(null, 'a'), null);
});

test('findLedger 找不到返回 null,不返回 undefined', () => {
  assert.equal(findLedger([normalizeLedger({ key: 'a' })], 'z'), null);
  assert.equal(findLedger(null, 'a'), null);
});

// ── 读盘迁移 ─────────────────────────────────────────────
test('★ 老快照(扁平 expenses)迁成一本账,一笔都不能少', () => {
  const saved = {
    books: [{ id: 'trip-1' }],
    activeBookId: 'trip-1',
    expenses: [
      { id: 'e1', category: '晚餐', amount: '48.8', currency: '₺' },
      { id: 'e2', category: '车票', amount: '20', currency: '₺' },
      { id: 'e3', category: '门票', amount: '100', currency: '€' },
    ],
    ledgerMembers: [{ name: '我' }, { name: 'Ning' }],
    budgets: { 'trip-1': { amount: '3000', currency: '₺' } },
  };
  const { ok, ledgers, activeLedgerKey } = migrateLedgers(saved);
  assert.equal(ok, true);
  assert.equal(ledgers.length, 1);
  assert.equal(activeLedgerKey, LEGACY_KEY);
  assert.equal(ledgers[0].expenses.length, 3);
  assert.equal(ledgers[0].members.length, 2);
  assert.deepEqual(ledgers[0].budget, { amount: '3000', currency: '₺' });
  // 分类顺带归一了
  assert.deepEqual(ledgers[0].expenses.map(e => e.category), ['餐饮', '交通', '门票']);
});

test('老快照没存过币种,按账目里用得最多的那个反推', () => {
  const { ledgers } = migrateLedgers({
    expenses: [
      { id: '1', currency: '₺' }, { id: '2', currency: '₺' }, { id: '3', currency: '€' },
    ],
  });
  assert.equal(ledgers[0].currency, '₺');
});

test('一笔账都没有时,币种退回预算的币种,再退回 €', () => {
  assert.equal(migrateLedgers({ expenses: [], budgets: { b: { amount: '10', currency: '£' } }, activeBookId: 'b' }).ledgers[0].currency, '£');
  assert.equal(migrateLedgers({ expenses: [] }).ledgers[0].currency, '€');
});

test('预算原来挂在旅行册上:当前册没有就挑第一条填了数的,不静默丢掉', () => {
  const { ledgers } = migrateLedgers({
    expenses: [],
    activeBookId: 'trip-9',
    budgets: { 'trip-1': { amount: '0' }, 'trip-2': { amount: '5000', currency: '€' } },
  });
  assert.deepEqual(ledgers[0].budget, { amount: '5000', currency: '€' });
});

test('新格式直接读出来,当前账本 key 跟着走', () => {
  const { ok, ledgers, activeLedgerKey } = migrateLedgers({
    ledgers: [{ key: 'local-1' }, { key: UUID_A }],
    activeLedgerKey: UUID_A,
  });
  assert.equal(ok, true);
  assert.equal(ledgers.length, 2);
  assert.equal(activeLedgerKey, UUID_A);
});

test('新格式里 activeLedgerKey 指向一本已经不在的账本时,退回第一本', () => {
  const { activeLedgerKey } = migrateLedgers({
    ledgers: [{ key: 'local-1' }], activeLedgerKey: '删掉了',
  });
  assert.equal(activeLedgerKey, 'local-1');
});

test('★ 读不出来时 ok:false 且 ledgers 为 null —— 调用方必须保持现状', () => {
  for (const bad of [null, undefined, '字符串', 42, {}, { books: [] }, { ledgers: [] }, { ledgers: [{}] }]) {
    const r = migrateLedgers(bad);
    assert.equal(r.ok, false, `${JSON.stringify(bad)} 不该算读成功`);
    assert.equal(r.ledgers, null, '绝不返回空数组 —— 那会被当成「账本真的空了」');
  }
});

test('只有成员、一笔账没有的老快照也算读到了(那本账是真的空)', () => {
  const r = migrateLedgers({ ledgerMembers: [{ name: '我' }] });
  assert.equal(r.ok, true);
  assert.equal(r.ledgers[0].members.length, 1);
});

// ── 远端账本并入 ──────────────────────────────────────────
test('远端账本并进来,本机账本一本不少', () => {
  const local = [normalizeLedger({ key: 'local-1', title: '本机' })];
  const out = mergeRemoteLedgers(local, [{ id: UUID_A, join_code: 'ABC123', title: '土耳其', currency: '₺' }]);
  assert.equal(out.length, 2);
  assert.equal(out[0].key, 'local-1');
  assert.equal(out[1].joinCode, 'ABC123');
  assert.equal(out[1].shared, true);
});

test('★ 拉取失败(ok=false)一律原样返回 —— 弱网抖一下不能把账本清空', () => {
  const local = [normalizeLedger({ key: 'local-1' }), normalizeLedger({ key: UUID_A })];
  assert.equal(mergeRemoteLedgers(local, [], false), local);
  assert.equal(mergeRemoteLedgers(local, null, true), local);
  assert.equal(mergeRemoteLedgers(local, undefined, false), local);
});

test('★ 只加不删:远端没列出的本地桶必须留着', () => {
  const local = [
    normalizeLedger({ key: 'local-1' }),
    normalizeLedger({ key: UUID_A, expenses: [{ id: 'x', category: '门票' }] }),
  ];
  // 远端这次只返回了 B(比如 A 还没同步到、或者只是这次没拉全)
  const out = mergeRemoteLedgers(local, [{ id: UUID_B, join_code: 'XYZ789' }]);
  assert.equal(out.length, 3);
  assert.ok(findLedger(out, UUID_A), 'A 不在远端列表里,但不能删');
  assert.equal(findLedger(out, UUID_A).expenses.length, 1, 'A 的账目也不能动');
});

test('★ 已存在的共享账本再拉一次:账目和币种都不被覆盖', () => {
  const local = [normalizeLedger({
    key: UUID_A, currency: '₺', expenses: [{ id: 'x', category: '餐饮' }],
  })];
  const out = mergeRemoteLedgers(local, [{ id: UUID_A, title: '新标题', currency: '€', join_code: 'AAA' }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, '新标题', '标题跟远端');
  assert.equal(out[0].currency, '₺', '币种是「上一笔记的什么钱」,不跟远端默认值');
  assert.equal(out[0].expenses.length, 1);
});

test('远端行缺 id 的直接跳过,不产生一个 key 是 undefined 的桶', () => {
  const out = mergeRemoteLedgers([], [{ join_code: 'ABC' }, null, { id: UUID_A }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].key, UUID_A);
});

// ── 云端快照 ─────────────────────────────────────────────
test('云端是新格式:整份读进来', () => {
  const out = applyCloudLedgers([], { ledgers: [{ key: 'local-1' }, { key: UUID_A }] });
  assert.equal(out.length, 2);
});

test('★ 云端读不出东西时返回 null,意思是「别动本地」', () => {
  assert.equal(applyCloudLedgers([], null), null);
  assert.equal(applyCloudLedgers([], {}), null);
  assert.equal(applyCloudLedgers([], { ledgers: [] }), null);
  assert.equal(applyCloudLedgers([], { books: [] }), null);
  assert.equal(applyCloudLedgers([], '字符串'), null);
});

test('★ 老客户端推上来的扁平快照,只更新遗留那一本,不抹掉其它账本', () => {
  const local = [
    normalizeLedger({ key: LEGACY_KEY, expenses: [{ id: 'old', category: '餐饮' }] }),
    normalizeLedger({ key: UUID_A, expenses: [{ id: 'keep', category: '门票' }] }),
    normalizeLedger({ key: 'local-2', expenses: [{ id: 'keep2', category: '购物' }] }),
  ];
  const out = applyCloudLedgers(local, {
    expenses: [{ id: 'new1', category: '晚餐' }, { id: 'new2', category: '车票' }],
    ledgerMembers: [{ name: '我' }],
  });
  assert.equal(out.length, 3, '三本账一本都不能少');
  assert.equal(findLedger(out, LEGACY_KEY).expenses.length, 2);
  assert.deepEqual(findLedger(out, LEGACY_KEY).expenses.map(e => e.category), ['餐饮', '交通']);
  assert.equal(findLedger(out, UUID_A).expenses[0].id, 'keep');
  assert.equal(findLedger(out, 'local-2').expenses[0].id, 'keep2');
});

test('本地还没有遗留桶时,老快照追加成新的一本', () => {
  const local = [normalizeLedger({ key: UUID_A })];
  const out = applyCloudLedgers(local, { expenses: [{ id: 'a', category: '餐饮' }] });
  assert.equal(out.length, 2);
  assert.equal(findLedger(out, LEGACY_KEY).expenses.length, 1);
});

test('老快照没带成员时,不要用空数组把本地成员冲掉', () => {
  const local = [normalizeLedger({ key: LEGACY_KEY, members: [{ name: '我' }, { name: 'Ning' }] })];
  const out = applyCloudLedgers(local, { expenses: [] });
  assert.equal(findLedger(out, LEGACY_KEY).members.length, 2);
});
