/**
 * 「今天该干什么」的规则。
 *
 * 这份测试要证明的是一件产品级的事:**任何状态下都恰好有一个下一步**,
 * 不存在「用户打开 App 面对十个格子」的状态。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  nextTask, taskLabel, poolProgress, anchorPool, wordKey, todayStats,
  type WordLike, type ProgressRec,
} from '../../features/learn/dailyTask.ts';

const w = (word: string, reading: string, extra: Partial<WordLike> = {}): WordLike =>
  ({ word, reading, level: 'N5', yanFeatures: ['kanji_anchor'], ...extra });

// 真实池子里确实存在的同读音组,照抄进来
const POOL: WordLike[] = [
  w('準備', 'じゅんび'), w('暑い', 'あつい'), w('熱い', 'あつい'), w('厚い', 'あつい'),
  w('雨', 'あめ'), w('飴', 'あめ'), w('注意', 'ちゅうい'), w('約束', 'やくそく'),
  w('必要', 'ひつよう'), w('禁止', 'きんし'),
];

const learned = (...keys: string[]) =>
  Object.fromEntries(keys.map(k => [k, { status: 'learning', dueAt: '2099-01-01', box: 2 }]));

const TODAY = '2026-08-16';
const base = { pool: POOL, kanaDone: true, today: TODAY };

// ─────────────────────────────────────────────
// 任何状态下都恰好有一个下一步
// ─────────────────────────────────────────────

test('★ 五十音没走完时,下一步一定是五十音 —— 不能跳', () => {
  const t = nextTask({ ...base, kanaDone: false, progress: {} });
  assert.equal(t.kind, 'kana');
  // 即使有到期的词、有没学过的词,也仍然是五十音
  const t2 = nextTask({
    ...base, kanaDone: false,
    progress: { '準備-じゅんび': { status: 'learning', dueAt: '2020-01-01' } },
  });
  assert.equal(t2.kind, 'kana', '有到期的也不能越过五十音');
});

test('★ 全新用户:五十音过了 → 直接给新词,不是空屏', () => {
  const t = nextTask({ ...base, progress: {} });
  assert.equal(t.kind, 'learn');
  assert.ok(t.kind === 'learn' && t.words.length > 0);
});

test('★ 复习优先于新词 —— 否则复习永远轮不上', () => {
  // 有一个到期 + 还有一堆没学过的
  const t = nextTask({
    ...base,
    progress: { '準備-じゅんび': { status: 'learning', dueAt: '2026-08-10' } },
  });
  assert.equal(t.kind, 'review', '到期的必须先还账');
  assert.ok(t.kind === 'review' && t.keys.includes('準備-じゅんび'));
});

test('池子学完且没有到期 → clear,而不是给一个空的 learn', () => {
  const all = learned(...POOL.map(wordKey));
  const t = nextTask({ ...base, progress: all });
  assert.equal(t.kind, 'clear');
  assert.ok(t.kind === 'clear' && t.poolTotal === POOL.length);
});

test('★ 四种状态都有文案和按钮 —— 没有一种会落到空白', () => {
  const states = [
    nextTask({ ...base, kanaDone: false, progress: {} }),
    nextTask({ ...base, progress: { '準備-じゅんび': { dueAt: '2026-08-01', status: 'learning' } } }),
    nextTask({ ...base, progress: {} }),
    nextTask({ ...base, progress: learned(...POOL.map(wordKey)) }),
  ];
  assert.deepEqual(states.map(s => s.kind), ['kana', 'review', 'learn', 'clear']);
  for (const s of states) {
    const l = taskLabel(s);
    assert.ok(l.title.length > 0, `${s.kind} 没有标题`);
    assert.ok(l.action.length > 0, `${s.kind} 没有按钮文案`);
  }
});

// ─────────────────────────────────────────────
// 一批里不放同读音的词
// ─────────────────────────────────────────────

test('★ 同一批里不出现两个同读音的词 —— 三个 あつい 一起上不是学习是制造混淆', () => {
  const t = nextTask({ ...base, progress: {}, newLimit: 6 });
  assert.equal(t.kind, 'learn');
  if (t.kind !== 'learn') return;
  const readings = t.words.map(x => x.reading);
  assert.equal(new Set(readings).size, readings.length,
    `这一批里有重复读音: ${readings.join(' ')}`);
  // 具体确认:暑い/熱い/厚い 只进来一个
  assert.equal(t.words.filter(x => x.reading === 'あつい').length, 1);
});

test('★ 被挤掉的同读音词不会丢 —— 一批批走下去,每个词恰好出现一次', () => {
  // ⚠️ 断言要写要求的**含义**:不是「下一批就轮到它」(每批只允许一个同读音,
  // 所以 厚い 其实要等到第三批),而是「一个词都不会被永久挤掉」。
  const done = new Set<string>();
  const order: string[] = [];
  for (let round = 0; round < 20; round++) {
    const t = nextTask({ ...base, progress: learned(...done), newLimit: 6 });
    if (t.kind === 'clear') break;
    assert.equal(t.kind, 'learn', `第 ${round} 轮不该出现 ${t.kind}`);
    if (t.kind !== 'learn') break;
    assert.ok(t.words.length > 0, '既然不是 clear,就必须给出词');
    for (const x of t.words) { order.push(wordKey(x)); done.add(wordKey(x)); }
  }
  // 每个词恰好出现一次,一个不漏、一个不重
  assert.equal(order.length, POOL.length, `走完只拿到 ${order.length} 个,池子有 ${POOL.length} 个`);
  assert.equal(new Set(order).size, POOL.length, '有词被重复发放');
  for (const x of POOL) {
    assert.ok(order.includes(wordKey(x)), `${wordKey(x)} 被永久挤掉了`);
  }
  // 三个 あつい 分散在不同批次(而不是挤在一起)
  const atsui = ['暑い-あつい', '熱い-あつい', '厚い-あつい'].map(k => order.indexOf(k));
  assert.ok(atsui.every(i => i >= 0), '三个 あつい 都要出现');
});

test('把上限设成 Infinity 就是同批对比教学 —— 口子留着但不是默认', () => {
  const t = nextTask({ ...base, progress: {}, newLimit: 6, maxSameReading: Infinity });
  assert.ok(t.kind === 'learn');
  if (t.kind !== 'learn') return;
  assert.equal(t.words.filter(x => x.reading === 'あつい').length, 3);
});

// ─────────────────────────────────────────────
// 稳定性
// ─────────────────────────────────────────────

test('★ 同一状态反复问,给的是同一批 —— 随机的话用户觉得自己在原地打转', () => {
  const a = nextTask({ ...base, progress: {} });
  const b = nextTask({ ...base, progress: {} });
  assert.ok(a.kind === 'learn' && b.kind === 'learn');
  if (a.kind !== 'learn' || b.kind !== 'learn') return;
  assert.deepEqual(a.words.map(wordKey), b.words.map(wordKey));
});

test('批次大小受 newLimit 限制,而且不超过池子里剩下的', () => {
  const t = nextTask({ ...base, progress: {}, newLimit: 3 });
  assert.ok(t.kind === 'learn' && t.words.length === 3);
  // 只剩 2 个没学的时候,只给 2 个
  const most = POOL.slice(0, 8).map(wordKey);
  const t2 = nextTask({ ...base, progress: learned(...most), newLimit: 6 });
  assert.ok(t2.kind === 'learn' && t2.words.length === 2);
});

test('复习批次受 reviewLimit 限制,但 dueTotal 报的是真实总数', () => {
  const due = Object.fromEntries(
    POOL.map(x => [wordKey(x), { status: 'learning', dueAt: '2026-08-01' }]),
  );
  const t = nextTask({ ...base, progress: due, reviewLimit: 4 });
  assert.ok(t.kind === 'review');
  if (t.kind !== 'review') return;
  assert.equal(t.keys.length, 4, '一次只给 4 个');
  assert.equal(t.dueTotal, POOL.length, '但要告诉用户实际欠了多少');
  assert.ok(taskLabel(t).title.includes(String(POOL.length)));
});

// ─────────────────────────────────────────────
// 边界
// ─────────────────────────────────────────────

test('mastered 的词不再到期,也不再算没学过', () => {
  const p: Record<string, ProgressRec> = {
    '準備-じゅんび': { status: 'mastered', dueAt: '2020-01-01' },
  };
  const t = nextTask({ ...base, progress: p });
  assert.equal(t.kind, 'learn', 'mastered 不该被当成到期');
  const prog = poolProgress(POOL, p);
  assert.equal(prog.mastered, 1);
  assert.equal(prog.learned, 1);
});

test('没有 dueAt 的记录不算到期 —— 「还没排期」不是「今天该复习」', () => {
  const t = nextTask({ ...base, progress: { '準備-じゅんび': { status: 'learning' } } });
  assert.equal(t.kind, 'learn');
});

test('空池子不炸,给的是 clear 不是崩溃', () => {
  const t = nextTask({ pool: [], progress: {}, kanaDone: true, today: TODAY });
  assert.equal(t.kind, 'clear');
  assert.ok(taskLabel(t).title.length > 0);
});

test('进度键和 App.js 的 wordKey 一致 —— 不一致就查不到用户已有的进度', () => {
  assert.equal(wordKey({ word: '準備', reading: 'じゅんび' }), '準備-じゅんび');
});

test('anchorPool 只挑带该 feature 的词', () => {
  const bank = [...POOL, w('雑', 'ざつ', { yanFeatures: ['sound_change'] }), w('無', 'む', { yanFeatures: [] })];
  assert.equal(anchorPool(bank).length, POOL.length);
  assert.equal(anchorPool(bank, 'sound_change').length, 1);
});

// ─────────────────────────────────────────────
// 排序:接尾词不能排在最前面
// ─────────────────────────────────────────────

test('★ 接尾词/量词押后 —— 否则第一屏给用户六个「～円」这种东西', () => {
  // 实测:不排的话真实池子头 24 个全是量词和接尾辞
  const bank = [
    w('～円', '～えん', { pos: '量词', freq: { df: null } }),
    w('～階', '～かい', { pos: '量词', freq: { df: null } }),
    w('準備', 'じゅんび', { pos: '名词', freq: { df: 300 } }),
    w('～人', '～にん', { pos: '接尾词', freq: { df: null } }),
    w('注意', 'ちゅうい', { pos: '名词', freq: { df: 500 } }),
  ];
  const ordered = anchorPool(bank);
  assert.deepEqual(ordered.slice(0, 2).map(x => x.word), ['注意', '準備'],
    '真正的词必须排在接尾词前面,而且按词频');
  assert.equal(ordered.length, bank.length, '押后不是丢掉');
  assert.ok(ordered.slice(2).every(x => x.word.startsWith('～')));
});

// ─────────────────────────────────────────────
// 按词频排 —— 先学用得上的
// ─────────────────────────────────────────────

test('★ 例句库出现次数多的排前面 —— 字典序和「哪个先学更有用」没有关系', () => {
  const bank = [
    w('会う', 'あう', { freq: { df: 1986 } }),
    w('私', 'わたし', { freq: { df: 26526 } }),
    w('青', 'あお', { freq: { df: 300 } }),
    w('行く', 'いく', { freq: { df: 7228 } }),
  ];
  assert.deepEqual(anchorPool(bank).map(x => x.word), ['私', '行く', '会う', '青']);
});

test('★ df=0 和 df=null 必须分开 —— 「不适用」不是「频率为零」', () => {
  const bank = [
    w('～人', '～にん', { pos: '接尾词', freq: { df: null, method: 'not_applicable' } }),
    w('昼御飯', 'ひるごはん', { freq: { df: 0, method: 'none' } }),
    w('私', 'わたし', { freq: { df: 26526, method: 'lemma' } }),
  ];
  const ordered = anchorPool(bank).map(x => x.word);
  assert.deepEqual(ordered, ['私', '昼御飯', '～人'],
    'df=0(语料里真的没出现)要排在 df=null(接尾词,不适用)前面');
});

test('★ raw_substring 不参与「更常用」判断 —— 它可能把恋愛计入愛', () => {
  const bank = [
    w('愛', 'あい', { freq: { df: 99999, method: 'raw_substring' } }),
    w('行く', 'いく', { freq: { df: 2, method: 'lemma' } }),
  ];
  assert.deepEqual(anchorPool(bank).map(x => x.word), ['行く', '愛']);
});

test('★ df=0 仍与 df=null 分开 —— raw_substring 只是降级排序', () => {
  const bank = [
    w('無し', 'なし', { freq: { df: 0, method: 'lemma' } }),
    w('未知', 'みち', { freq: { df: null, method: 'not_applicable' } }),
  ];
  assert.deepEqual(anchorPool(bank).map(x => x.word), ['無し', '未知']);
});

test('★ 接尾词即使有频率也押后 —— 判据是「它不是一个独立的词」', () => {
  // 假设某天数据源给接尾词也算了频率,规则也不能因此把它提前
  const bank = [
    w('～人', '～にん', { pos: '接尾词', freq: { df: 99999 } }),
    w('私', 'わたし', { freq: { df: 100 } }),
  ];
  assert.deepEqual(anchorPool(bank).map(x => x.word), ['私', '～人']);
});

test('★ 同频的保持原序 —— 「下一步」不能每次进来都换一批', () => {
  const bank = [
    w('乙', 'おつ', { freq: { df: 500 } }),
    w('甲', 'こう', { freq: { df: 500 } }),
    w('丙', 'へい', { freq: { df: 500 } }),
  ];
  const a = anchorPool(bank).map(x => x.word);
  assert.deepEqual(a, ['乙', '甲', '丙'], '同 df 必须保持传入顺序');
  assert.deepEqual(anchorPool(bank).map(x => x.word), a, '反复调用结果一致');
});

test('没有 freq 字段的词不会崩,当作「不适用」排最后', () => {
  const bank = [w('未知', 'みち'), w('私', 'わたし', { freq: { df: 100 } })];
  assert.deepEqual(anchorPool(bank).map(x => x.word), ['私', '未知']);
});

test('★ 同一个写法也不能一批里出现两次 —— 卡片上就是并排两个「私」', () => {
  // 换成按词频排之后第一批真的出了 `私 私 行く 何 言う 人`:
  // 两条 私(わたくし / わたし),读音不同所以都过了读音那一关。
  // 判据和读音那条一样:用户看到的是不是同一个东西。
  const bank = [
    w('私', 'わたくし', { freq: { df: 26526 } }),
    w('私', 'わたし', { freq: { df: 26526 } }),
    w('行く', 'いく', { freq: { df: 7228 } }),
    w('何', 'なに', { freq: { df: 7046 } }),
  ];
  const t = nextTask({ pool: anchorPool(bank), progress: {}, kanaDone: true, today: TODAY, newLimit: 3 });
  assert.ok(t.kind === 'learn');
  if (t.kind !== 'learn') return;
  const words = t.words.map(x => x.word);
  assert.equal(new Set(words).size, words.length, `一批里出现了重复写法: ${words.join(' ')}`);
  assert.deepEqual(words, ['私', '行く', '何']);

  // 被挤掉的那条 私 下一批要轮到,不能丢
  const t2 = nextTask({
    pool: anchorPool(bank), progress: learned(...t.words.map(wordKey)),
    kanaDone: true, today: TODAY, newLimit: 3,
  });
  assert.ok(t2.kind === 'learn' && t2.words.some(x => x.word === '私'));
});

// ── 今天走到哪了 ─────────────────────────────────────────────
//
// 补的是主线上一个说不出口的空档:这条路只有「下一步」,没有「到此为止」。
// 真机上走一遍就露出来:学完 6 个,首页立刻换一批新的,「今天该复习」还是 0,
// 而那些词明天就会回来 —— 系统一个字都没说。

const TSW = (word: string, reading: string): WordLike => ({ word, reading });
const TS_POOL: WordLike[] = [TSW('私', 'わたし'), TSW('行く', 'いく'), TSW('何', 'なに')];
const TS_TODAY = '2026-08-18';
const TS_TMR = '2026-08-19';

test('★ 今天碰过几个 / 明天回来几个', () => {
  const progress: Record<string, ProgressRec> = {
    '私-わたし': { dueAt: TS_TMR, lastSeenAt: TS_TODAY, status: 'learning' },
    '行く-いく': { dueAt: TS_TMR, lastSeenAt: TS_TODAY, status: 'learning' },
    // 昨天碰的,明天不回来
    '何-なに': { dueAt: '2026-08-25', lastSeenAt: '2026-08-17', status: 'learning' },
  };
  const got = todayStats(TS_POOL, progress, TS_TODAY, TS_TMR);
  // 字面量,不写 Object.keys(progress).length —— 期望值取自被测输入的话,
  // 实现改成「全都数一遍」它照样绿
  assert.equal(got.touched, 2);
  assert.equal(got.comingBack, 2);
});

test('★ 说「碰过」不说「学会了」—— 记录里只有 lastSeenAt,没有可核的「学会」判据', () => {
  // 一个按了「没读出来」的词:今天见过,但今天还到期,明天不回来
  const progress: Record<string, ProgressRec> = {
    '私-わたし': { dueAt: TS_TODAY, lastSeenAt: TS_TODAY, status: 'learning' },
  };
  const got = todayStats(TS_POOL, progress, TS_TODAY, TS_TMR);
  assert.equal(got.touched, 1, '见过就算碰过,不管评的是什么分');
  assert.equal(got.comingBack, 0, '今天到期的不算「明天回来」');
});

test('已掌握的不算「明天回来」', () => {
  const progress: Record<string, ProgressRec> = {
    '私-わたし': { dueAt: TS_TMR, lastSeenAt: TS_TODAY, status: 'mastered' },
  };
  assert.equal(todayStats(TS_POOL, progress, TS_TODAY, TS_TMR).comingBack, 0);
});

test('空进度不炸,而且是 0 不是 NaN', () => {
  assert.deepEqual(todayStats(TS_POOL, {}, TS_TODAY, TS_TMR), { touched: 0, comingBack: 0 });
  assert.deepEqual(todayStats([], {}, TS_TODAY, TS_TMR), { touched: 0, comingBack: 0 });
});

test('★ 只数池子里的 —— 复习进度是全局的,深卡/地点/场景句都在同一份 map 里', () => {
  const progress: Record<string, ProgressRec> = {
    '私-わたし': { dueAt: TS_TMR, lastSeenAt: TS_TODAY },
    // 不在池子里的一条(比如地铁句),不该被算进主线的今日统计
    'place:oshima': { dueAt: TS_TMR, lastSeenAt: TS_TODAY },
  };
  assert.equal(todayStats(TS_POOL, progress, TS_TODAY, TS_TMR).touched, 1);
});
