// 间隔复习的算术。
//
// 为什么值得测:这是整个学习线唯一一处「用户看不见但错了会静默毁掉体验」的逻辑。
// 间隔算错不会崩、不会报错,只会让一个词永远不再出现、或者每天都出现,
// 而用户只会觉得「这 App 的复习很奇怪」,没人会去提 bug。
//
// 迁移那几条尤其要守:线上已经有真实用户的 { wordKey: 'learning' },
// 改结构时读错一次就是丢进度。
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LADDER, MASTERED_BOX, DAILY_GOAL,
  todayStr, addDays, intervalOf,
  normalizeRecord, normalizeProgress,
  review, markMastered, isDue, dueCount, statusCounts,
  pickSession, mergeProgress, toCloudRow, fromCloudRow,
} from '../../features/wordbank/srs.js';

const T = '2026-08-05';

// ── 日期 ──────────────────────────────────────────────────────

test('addDays 跨月跨年都对', () => {
  assert.equal(addDays('2026-08-05', 1), '2026-08-06');
  assert.equal(addDays('2026-08-31', 1), '2026-09-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-08-05', 30), '2026-09-04');
});

test('todayStr 用本地日历日,不是 UTC —— 晚上学的词第二天早上就该能复习', () => {
  // 本地时间 23:30。用 toISOString() 的实现在东八区会算成第二天,西八区算成同一天,
  // 两边都和用户日历上的「今天」对不上。
  assert.equal(todayStr(new Date(2026, 7, 5, 23, 30)), '2026-08-05');
  assert.equal(todayStr(new Date(2026, 7, 5, 0, 5)), '2026-08-05');
});

test('日期串坏掉时退回今天,不产生 NaN 记录', () => {
  assert.equal(addDays('不是日期', 1), addDays(todayStr(), 1));
  assert.match(addDays(null, 0), /^\d{4}-\d{2}-\d{2}$/);
});

// ── 旧格式迁移 ────────────────────────────────────────────────

test('旧的 learning 迁成今天到期 —— 升级后立刻能接着复习', () => {
  const r = normalizeRecord('learning', T);
  assert.equal(r.status, 'learning');
  assert.equal(r.dueAt, T);
  assert.equal(r.box, 0);
  assert.equal(r.reps, 1);
});

test('旧的 mastered 推到 30 天后 —— 升级不该给用户凭空派一堆任务', () => {
  const r = normalizeRecord('mastered', T);
  assert.equal(r.status, 'mastered');
  assert.equal(r.box, MASTERED_BOX);
  assert.equal(r.dueAt, addDays(T, intervalOf(MASTERED_BOX)));
  assert.equal(isDue(r, T), false);
});

test('未学 / 坏值一律返回 null,不占一条记录', () => {
  for (const v of ['new', null, undefined, '', 0, [], 'garbage']) {
    assert.equal(normalizeRecord(v, T), null, `${JSON.stringify(v)} 不该产生记录`);
  }
});

test('normalizeProgress 丢掉坏条目,但保住同一张表里的好条目', () => {
  const out = normalizeProgress({ a: 'learning', b: null, c: 'mastered', d: [] }, T);
  assert.deepEqual(Object.keys(out).sort(), ['a', 'c']);
});

test('normalizeProgress 对非对象输入返回空表而不是抛', () => {
  for (const v of [null, undefined, 'x', 42, ['a']]) {
    assert.deepEqual(normalizeProgress(v, T), {});
  }
});

test('新结构过一遍归一是幂等的 —— 每次读盘都会走这里,不能越走越歪', () => {
  const once = review(null, 'good', T);
  const twice = normalizeRecord(once, T);
  assert.deepEqual(twice, once);
});

test('status 由 box 算出来,不信输入里带的 —— 只留一个真相来源', () => {
  const r = normalizeRecord({ box: 0, status: 'mastered', dueAt: T }, T);
  assert.equal(r.status, 'learning');
});

// ── 评分 ──────────────────────────────────────────────────────

test('会了:沿阶梯前进,间隔按档位递增', () => {
  let r = review(null, 'good', T);
  assert.equal(r.box, 1);
  assert.equal(r.dueAt, addDays(T, LADDER[0]));

  r = review(r, 'good', T);
  assert.equal(r.box, 2);
  assert.equal(r.dueAt, addDays(T, LADDER[1]));
});

test('会了:连续答对最终进入已掌握,且间隔封顶在阶梯最后一档', () => {
  let r = null;
  for (let i = 0; i < LADDER.length + 3; i += 1) r = review(r, 'good', T);
  assert.equal(r.status, 'mastered');
  assert.equal(r.box, LADDER.length, 'box 不该无限增长');
  assert.equal(r.dueAt, addDays(T, LADDER[LADDER.length - 1]));
});

test('忘了:掉回第一档、lapses+1、当天再见一次', () => {
  const good = review(review(null, 'good', T), 'good', T);
  const r = review(good, 'again', T);
  assert.equal(r.box, 0);
  assert.equal(r.lapses, 1);
  assert.equal(r.dueAt, T);
  assert.equal(isDue(r, T), true, '忘了的词不该等到明天');
});

test('一般:档位不动,间隔取本档一半,至少 1 天', () => {
  // box=0 档的间隔是 1 天,一半仍是 1 天 —— 不能算出 0 天让它当天反复弹出来
  const r0 = review(null, 'hard', T);
  assert.equal(r0.box, 0);
  assert.equal(r0.dueAt, addDays(T, 1));

  // box=3 档间隔 7 天,一半向上取整 4 天
  let r = null;
  for (let i = 0; i < 3; i += 1) r = review(r, 'good', T);
  assert.equal(r.box, 3);
  const hard = review(r, 'hard', T);
  assert.equal(hard.box, 3, '吃力不该抹掉已有进度');
  assert.equal(hard.dueAt, addDays(T, Math.ceil(LADDER[3] / 2)));
});

test('一般不计 lapses —— 想起来了就不算忘', () => {
  const r = review(review(null, 'good', T), 'hard', T);
  assert.equal(r.lapses, 0);
});

test('每次评分都累加 reps 并记下 lastSeenAt', () => {
  const r = review(review(null, 'good', T), 'again', T);
  assert.equal(r.reps, 2);
  assert.equal(r.lastSeenAt, T);
});

test('认不出的评分按会了处理,不抛 —— 这是点一下按钮就会走到的路径', () => {
  const r = review(null, 'wat', T);
  assert.equal(r.box, 1);
});

test('markMastered 直接跳到已掌握档', () => {
  const r = markMastered(null, T);
  assert.equal(r.status, 'mastered');
  assert.equal(isDue(r, T), false);
});

// ── 到期 ──────────────────────────────────────────────────────

test('到期判定含当天,且逾期的仍然算到期', () => {
  assert.equal(isDue({ box: 0, dueAt: T }, T), true);
  assert.equal(isDue({ box: 0, dueAt: '2026-08-01' }, T), true, '逾期的不能漏掉');
  assert.equal(isDue({ box: 0, dueAt: '2026-08-06' }, T), false);
  assert.equal(isDue(null, T), false);
});

test('dueCount / statusCounts 的口径对得上', () => {
  const p = {
    a: 'learning',                                  // 今天到期
    b: { box: 2, dueAt: '2026-07-30' },             // 逾期
    c: { box: 2, dueAt: '2026-09-01' },             // 没到期
    d: 'mastered',                                  // 30 天后
  };
  assert.equal(dueCount(p, T), 2);
  const s = statusCounts(p, T);
  assert.equal(s.due, 2);
  assert.equal(s.learning, 3);
  assert.equal(s.mastered, 1);
});

// ── 今日队列 ──────────────────────────────────────────────────

const bank = Array.from({ length: 50 }, (_, i) => `w${i}`);

test('到期的排在新词前面 —— 复习欠账优先于摄入新词', () => {
  const progress = { w40: { box: 1, dueAt: '2026-08-01' } };
  const keys = pickSession(bank, progress, { today: T, limit: 3 });
  assert.equal(keys[0], 'w40');
  assert.deepEqual(keys.slice(1), ['w0', 'w1']);
});

test('逾期最久的排最前', () => {
  const progress = {
    w5: { box: 1, dueAt: T },
    w6: { box: 1, dueAt: '2026-07-01' },
    w7: { box: 1, dueAt: '2026-08-03' },
  };
  assert.deepEqual(pickSession(bank, progress, { today: T, limit: 3 }), ['w6', 'w7', 'w5']);
});

test('到期的够多时不掺新词,且不超过 limit', () => {
  const progress = {};
  for (let i = 0; i < 20; i += 1) progress[`w${i}`] = { box: 1, dueAt: '2026-08-01' };
  const keys = pickSession(bank, progress, { today: T, limit: DAILY_GOAL });
  assert.equal(keys.length, DAILY_GOAL);
  assert.ok(keys.every(k => progress[k]), '不该在还欠着复习时塞新词');
});

test('已掌握、没到期的词不进队列', () => {
  const progress = { w0: 'mastered', w1: { box: 3, dueAt: '2026-12-01' } };
  const keys = pickSession(bank, progress, { today: T, limit: 2 });
  assert.deepEqual(keys, ['w2', 'w3']);
});

test('词库比 limit 小的时候给多少算多少,不补空', () => {
  assert.deepEqual(pickSession(['a', 'b'], {}, { today: T, limit: 10 }), ['a', 'b']);
  assert.deepEqual(pickSession([], {}, { today: T }), []);
  assert.deepEqual(pickSession(null, null, { today: T }), []);
});

test('keyOf 让调用方自己定键 —— 词库里是对象不是字符串', () => {
  const items = [{ word: '水', reading: 'みず' }, { word: '火', reading: 'ひ' }];
  const keys = pickSession(items, {}, {
    today: T, limit: 5, keyOf: (w) => `${w.word}-${w.reading}`,
  });
  assert.deepEqual(keys, ['水-みず', '火-ひ']);
});

// ── 合并 ──────────────────────────────────────────────────────

test('云端拉取失败(null)原样返回本地 —— 拿不到数据 ≠ 数据是空的', () => {
  const local = { a: 'learning' };
  assert.deepEqual(mergeProgress(local, null, T), normalizeProgress(local, T));
});

test('云端返回空表时不删本地记录', () => {
  // 空表和拉取失败在这里的结果一致:合并只做并集与择新,从不因为一边缺就删。
  const merged = mergeProgress({ a: 'learning' }, {}, T);
  assert.ok(merged.a);
});

test('逐词取 lastSeenAt 更新的那条', () => {
  const local = { a: { box: 1, dueAt: '2026-08-06', lastSeenAt: '2026-08-05' } };
  const cloud = { a: { box: 4, dueAt: '2026-08-20', lastSeenAt: '2026-08-01' } };
  assert.equal(mergeProgress(local, cloud, T).a.box, 1, '本地更新,该留本地');
  assert.equal(mergeProgress(cloud, local, T).a.box, 1, '换个方向结果一样');
});

test('同一天复习过的取 dueAt 更远的 —— 别把推到 30 天的词拉回 1 天', () => {
  const local = { a: { box: 1, dueAt: '2026-08-06', lastSeenAt: T } };
  const cloud = { a: { box: 4, dueAt: '2026-08-20', lastSeenAt: T } };
  assert.equal(mergeProgress(local, cloud, T).a.dueAt, '2026-08-20');
});

test('两边独有的词都保留', () => {
  const merged = mergeProgress({ a: 'learning' }, { b: 'mastered' }, T);
  assert.deepEqual(Object.keys(merged).sort(), ['a', 'b']);
});

// ── 云端行 ────────────────────────────────────────────────────

test('toCloudRow 列名是 snake_case,且带上 SRS 字段', () => {
  const row = toCloudRow('水-みず', review(null, 'good', T), {
    userId: 'u1', bookId: 'n5', now: '2026-08-05T00:00:00.000Z',
  });
  assert.equal(row.word_key, '水-みず');
  assert.equal(row.user_id, 'u1');
  assert.equal(row.status, 'learning');
  assert.equal(row.box, 1);
  assert.equal(row.due_at, addDays(T, 1));
  assert.equal(row.reps, 1);
  assert.equal(row.lapses, 0);
  assert.equal(row.last_seen_at, T);
});

test('toCloudRow 对未学的词返回 null —— 不往云端写一条空记录', () => {
  assert.equal(toCloudRow('k', null, { userId: 'u1' }), null);
});

test('fromCloudRow 认得旧账号那种只有 status 的行', () => {
  const r = fromCloudRow({ word_key: 'k', status: 'learning' }, T);
  assert.equal(r.dueAt, T);
  assert.equal(r.box, 0);
});

test('fromCloudRow 读新行时原样还原', () => {
  const r = fromCloudRow({
    status: 'learning', box: 3, due_at: '2026-08-12',
    reps: 5, lapses: 2, last_seen_at: '2026-08-05',
  }, T);
  assert.deepEqual(r, {
    box: 3, dueAt: '2026-08-12', reps: 5, lapses: 2,
    lastSeenAt: '2026-08-05', status: 'learning',
  });
});

test('云端行 → 记录 → 云端行,一圈下来不变形', () => {
  const rec = review(review(null, 'good', T), 'hard', T);
  const row = toCloudRow('k', rec, { userId: 'u1', now: 'X' });
  assert.deepEqual(fromCloudRow(row, T), rec);
});

// ── 键迁移 ────────────────────────────────────────────────────
//
// 2026-08 合并了 267 组「同一个词两条记录」(おねがいします / お願いします 这种)。
// 合并等于让被删那条的键消失 —— 不折算的话,用户在它上面攒的进度会静默清零。
// 静默是关键:他不会收到任何提示,只会觉得「我明明学过这个词」。

test('★ 旧键读盘时自动折算到现行键 —— 合并不能让进度静默清零', async () => {
  const { KEY_ALIASES } = await import('../../features/wordbank/keyAliases.js');
  const [oldKey, newKey] = Object.entries(KEY_ALIASES)[0];
  const out = normalizeProgress({ [oldKey]: { box: 3, dueAt: '2026-09-01' } }, T);
  assert.equal(out[oldKey], undefined, '旧键不该继续存在');
  assert.ok(out[newKey], '进度必须出现在新键下');
  assert.equal(out[newKey].box, 3, '档位不能在折算中丢掉');
});

test('★ 新旧键都有记录时,留学得更远的那条', async () => {
  const { KEY_ALIASES } = await import('../../features/wordbank/keyAliases.js');
  const [oldKey, newKey] = Object.entries(KEY_ALIASES)[0];
  const out = normalizeProgress({
    [oldKey]: { box: 5, dueAt: '2026-12-01', lastSeenAt: T },
    [newKey]: { box: 0, dueAt: '2026-08-06', lastSeenAt: T },
  }, T);
  assert.equal(out[newKey].box, 5, '不能把推到 30 天的词拉回 1 天');
});

test('★ 别名表指向的键必须是真实存在的词条', async () => {
  const { readFileSync } = await import('node:fs');
  const { KEY_ALIASES } = await import('../../features/wordbank/keyAliases.js');
  const content = JSON.parse(readFileSync(
    new URL('../../../assets/content.fallback.json', import.meta.url), 'utf8'));
  const live = new Set(content.wordBank.map(w => `${w.word}-${w.reading}`));
  const bad = Object.entries(KEY_ALIASES).filter(([o, n]) => !live.has(n) || live.has(o));
  assert.deepEqual(bad, [], '别名的目标必须在词库里,来源必须已经被删掉');
});
