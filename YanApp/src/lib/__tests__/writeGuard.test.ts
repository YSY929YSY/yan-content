/**
 * 写路径护栏。
 *
 * 这份测试守的是这个项目**已经付过四次学费**的那条规矩:
 * 「拿不到数据 ≠ 数据是空的」。
 *
 * 它一直是一条写在注释里的规矩,靠每个调用点自己记得 —— 所以同一个洞
 * 反复出现在不同 hook 里。这里把它变成断言。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  afterRead, canWrite, whyBlocked, createWriteGuard,
  type GuardState,
} from '../writeGuard.ts';

// 把 console.warn 静音,顺便数一下 warn 了几次
function muted<T>(fn: () => T): { result: T; warns: number } {
  const orig = console.warn;
  let warns = 0;
  console.warn = () => { warns += 1; };
  try { return { result: fn(), warns }; } finally { console.warn = orig; }
}

// ─────────────────────────────────────────────
// 三态,不是两态
// ─────────────────────────────────────────────

test('★ 还没读盘时不许写 —— 这就是旧 readFailed=useRef(false) 漏掉的那一态', () => {
  const g = createWriteGuard('yan_test');
  assert.equal(g.state, 'pending');
  const { result } = muted(() => g.allow());
  assert.equal(result, false, '读盘回来之前的任何一次写都必须被挡下');
});

test('读成功之后才放行', () => {
  const g = createWriteGuard();
  g.onRead({ ok: true });
  assert.equal(g.state, 'ready');
  assert.equal(g.allow(), true);
});

test('★ 读失败之后一直不许写 —— 宁可这次改动丢,不要把已有的清掉', () => {
  const g = createWriteGuard();
  g.onRead({ ok: false });
  assert.equal(g.state, 'failed');
  const { warns } = muted(() => { g.allow(); g.allow(); g.allow(); });
  assert.equal(g.blockedWrites, 3, '每一次都要挡,不是只挡第一次');
  assert.equal(warns, 3, '被挡下要出声 —— 静默挡掉的话没人知道有这条路径');
});

test('★「确实没有数据」必须能写 —— 否则全新安装永远存不下东西', () => {
  // readJsonResult 对「键不存在」返回 { ok:true, value:null }。
  // 这一条和上一条的区别,正是整个护栏存在的理由:
  //   ok:false = 拿不到(不能写)   ok:true + null = 确实没有(可以写)
  const g = createWriteGuard();
  g.onRead({ ok: true });
  assert.equal(g.allow(), true);
});

test('★ 坏数据当「没有」,可以写 —— 上个版本写坏的东西,重试一万次还是坏的', () => {
  // readJsonResult 对 JSON.parse 失败也返回 ok:true。
  // 这是刻意的:解析不了的数据不会自愈,当没有才能往前走。
  const g = createWriteGuard();
  g.onRead({ ok: true });     // 坏数据走的也是这条
  assert.equal(g.allow(), true);
});

// ─────────────────────────────────────────────
// 状态迁移
// ─────────────────────────────────────────────

test('读失败后重读成功可以恢复 —— 但调用方必须同时采纳读到的值', () => {
  const g = createWriteGuard();
  g.onRead({ ok: false });
  assert.equal(g.state, 'failed');
  g.onRead({ ok: true });
  assert.equal(g.state, 'ready', '拿到磁盘真实内容之后就不必再封锁了');
});

test('★ 已经 ready 之后再读失败,退回不许写 —— 保守方向是对的方向', () => {
  // 两种错误的代价不对称:
  //   不该写却写了 → 毁掉磁盘上已有的数据(不可逆)
  //   该写却没写   → 丢掉这一次的改动(有限)
  // 所以往「不写」的方向倒。
  const g = createWriteGuard();
  g.onRead({ ok: true });
  g.onRead({ ok: false });
  assert.equal(g.state, 'failed');
  muted(() => assert.equal(g.allow(), false));
});

test('afterRead 是纯函数,只看这次读的结果', () => {
  const states: GuardState[] = ['pending', 'ready', 'failed'];
  for (const s of states) {
    assert.equal(afterRead(s, { ok: true }), 'ready');
    assert.equal(afterRead(s, { ok: false }), 'failed');
  }
});

test('canWrite 只对 ready 为真', () => {
  assert.equal(canWrite('ready'), true);
  assert.equal(canWrite('pending'), false);
  assert.equal(canWrite('failed'), false);
});

// ─────────────────────────────────────────────
// 诊断
// ─────────────────────────────────────────────

test('被挡下时给的是人话,而且两种原因分得开', () => {
  assert.equal(whyBlocked('ready'), null);
  const pend = whyBlocked('pending', 'yan_x');
  const fail = whyBlocked('failed', 'yan_x');
  assert.ok(pend && pend.includes('还没读盘'));
  assert.ok(fail && fail.includes('读盘失败'));
  assert.notEqual(pend, fail, '「还没读」和「读失败」是两回事,提示不能一样');
  assert.ok(pend!.includes('yan_x'), '要带上是哪个键,否则排查时不知道找谁');
});

test('放行的写不计入 blockedWrites —— 这个数不为 0 才有意义', () => {
  const g = createWriteGuard();
  g.onRead({ ok: true });
  g.allow(); g.allow();
  assert.equal(g.blockedWrites, 0);
});

// ─────────────────────────────────────────────
// 把四次事故的形状直接写成回归测试
// ─────────────────────────────────────────────

test('★ 回归:读盘失败 → 界面显示为空 → 用户操作 → 不得写回那份空的', () => {
  // 这是四次数据丢失的共同剧本。useReview 到今天还是这个形状:
  //   readJson(K.wordbankProgress, null) 读失败也返回 null
  //   → normalizeProgress(null) → {} → setProgress({}) → 界面「一个词都没学过」
  //   → 用户随手评一个分 → writeJson({ ...{}, [key]: rec }) → 全部进度没了
  const disk = { 'を-を': { box: 3 }, '準備-じゅんび': { box: 5 } };
  let written: unknown = null;

  const g = createWriteGuard('yan_wordbank_progress');
  g.onRead({ ok: false });                    // 读盘炸了
  const inMemory = {};                        // 于是内存里是空的
  const afterGrade = { ...inMemory, 'x-x': { box: 1 } };
  muted(() => { if (g.allow()) written = afterGrade; });

  assert.equal(written, null, '这一次写必须没有发生');
  assert.deepEqual(disk, { 'を-を': { box: 3 }, '準備-じゅんび': { box: 5 } },
    '磁盘上那两条进度必须原封不动');
});

test('★ 回归:读盘还在路上,用户就点了 —— 同样不得写', () => {
  // 比上一条更隐蔽:没有任何东西「失败」,只是还没回来。
  // 旧的两态守卫在这里完全不设防。
  let written: unknown = null;
  const g = createWriteGuard('yan_world_footprint');
  // 注意:这里**没有** onRead —— 读还在 await 里
  muted(() => { if (g.allow()) written = { visitedIds: [] }; });
  assert.equal(written, null, '读回来之前写入必须被挡下');
  assert.equal(g.blockedWrites, 1);
});
