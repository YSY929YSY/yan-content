// 发布契约的测试。
//
// 守的是一种「不报错但越权」的失败:一个还没核验的词悄悄进了正式学习,
// 或者反过来 —— 收紧规则把用户已经学过的词剥夺掉。
//
// ⚠️ 这个文件只测**纯函数**,不读内容包。
// 内容包侧的契约(两份一致、布尔真假、Learning/Dictionary 矛盾态、
// selector 与数据一致)在 publication-content.test.mjs 里,两者刻意分开:
// 纯函数的对错不该因为内容包换了一代而变红。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasDictionaryShape, isDictionaryEntry, isLearnableWord,
  hasCompleteExample, hasEditorialDepth,
  canIntroduceWord, canReviewWord, canGradeWord,
} from '../../features/wordbank/publication.ts';

/** 一个字段齐全的词。publication 由各用例自己给。 */
const w = (over = {}) => ({
  word: '注文', reading: 'ちゅうもん', meaning_zh: '点餐', meaning_en: 'order',
  ...over,
});
const pub = (dictionary, learning) => ({ publication: { dictionary, learning } });

// ── 1. 字段齐全但无 publication ─────────────────────────────

test('★★ 字段齐全但没有 publication —— 两层都 false(fail closed)', () => {
  const word = w();
  assert.equal(hasDictionaryShape(word), true, '结构是好的');
  assert.equal(isDictionaryEntry(word), false, '但没被发布出去');
  assert.equal(isLearnableWord(word), false);
  assert.equal(canIntroduceWord(word), false);
});

test('★ 结构永远不能自动升级成发布 —— 这是本轮在修的那个病', () => {
  // 老规则是「例句齐全 → 自动可学」。换成「表记读音齐全 → 自动可查」
  // 是同一个错误换个字段,所以这两个函数必须能分开。
  const word = w({ exampleJp: 'ご注文は', exampleZh: '您要点', exampleRoma: 'gochuumon wa' });
  assert.equal(hasCompleteExample(word), true);
  assert.equal(hasDictionaryShape(word), true);
  assert.equal(isDictionaryEntry(word), false, '例句和结构齐全都不能换来发布');
});

// ── 2. dictionary:true 但结构坏 ─────────────────────────────

test('★★ publication 说可查,但结构是坏的 —— 仍然 false', () => {
  assert.equal(isDictionaryEntry({ word: '注文', ...pub(true, false) }), false, '缺 reading');
  assert.equal(isDictionaryEntry({ reading: 'ちゅうもん', ...pub(true, false) }), false, '缺 word');
  assert.equal(isDictionaryEntry({ word: '注文', reading: 'ちゅうもん', ...pub(true, false) }), false,
    '两个释义都没有');
  // 只有空白字符不算有内容 —— ' ' 是 truthy,不 trim 就会被放行
  assert.equal(isDictionaryEntry(w({ reading: '   ', publication: { dictionary: true } })), false);
});

test('★ 空白字符不算有内容', () => {
  assert.equal(hasDictionaryShape(w({ word: '  ' })), false);
  assert.equal(hasDictionaryShape(w({ reading: '\t' })), false);
  assert.equal(hasDictionaryShape(w({ meaning_zh: ' ', meaning_en: '  ' })), false);
  // 中文空但英文有 → 仍然成立(「至少一个释义」)
  assert.equal(hasDictionaryShape(w({ meaning_zh: '  ', meaning_en: 'order' })), true);
});

// ── 3. learning:true 但 Dictionary 不成立 ───────────────────

test('★★ 禁止「Learning 通过、Dictionary 失败」—— 那会让人学一个查不到的词', () => {
  // 前置写在 isLearnableWord 函数体里,不靠调用方记得先判一次。
  assert.equal(isLearnableWord(w(pub(false, true))), false, 'dictionary 显式 false');
  assert.equal(isLearnableWord(w({ publication: { learning: true } })), false, 'dictionary 缺失');
  assert.equal(isLearnableWord({ word: '注文', ...pub(true, true) }), false, '结构坏');
});

// ── 4/5. 两层的正常组合 ─────────────────────────────────────

test('★ Dictionary true / Learning false —— 可查,不可引入', () => {
  const word = w(pub(true, false));
  assert.equal(isDictionaryEntry(word), true);
  assert.equal(isLearnableWord(word), false);
  assert.equal(canIntroduceWord(word), false);
});

test('★ 两层都 true —— 可引入,没有旧 record 也能评分', () => {
  const word = w(pub(true, true));
  assert.equal(isLearnableWord(word), true);
  assert.equal(canIntroduceWord(word), true);
  assert.equal(canGradeWord(word, null), true);
});

test('learning 必须严格是 true —— truthy 不算', () => {
  assert.equal(isLearnableWord(w({ publication: { dictionary: true, learning: 1 } })), false);
  assert.equal(isLearnableWord(w({ publication: { dictionary: true, learning: 'true' } })), false);
  assert.equal(isDictionaryEntry(w({ publication: { dictionary: 1 } })), false);
});

// ── 6/7. 引入 vs 复习 ───────────────────────────────────────

test('★★ dictionary-only 且无 record —— 不可评分', () => {
  assert.equal(canGradeWord(w(pub(true, false)), null), false);
  assert.equal(canGradeWord(w(pub(true, false)), undefined), false);
});

test('★★ dictionary-only 但**有** record —— 仍可复习、仍可评分', () => {
  // 收紧发布规则只作用于新引入,不回溯清理。
  // 用户已经学过的词凭空消失,比多显示一个粗糙词条严重得多。
  const word = w(pub(true, false));
  const record = { box: 1, dueAt: '2026-08-21', status: 'learning' };
  assert.equal(canReviewWord(word, record), true);
  assert.equal(canGradeWord(word, record), true);
});

test('★ canReviewWord 只看 record,与 publication 无关', () => {
  const rec = { box: 0 };
  // 连结构都坏的词,只要有 record 就能复习 —— 内容包换版本时不能把人的进度锁死
  assert.equal(canReviewWord(null, rec), true);
  assert.equal(canReviewWord(w(pub(false, false)), rec), true);
  assert.equal(canReviewWord(w(pub(true, true)), null), false);
});

test('★★ record 的判据是「非数组对象」,不是 truthy', () => {
  // 调用点拿到的是 normalizeProgress() 的输出,所以「学过」的形状是对象。
  // 'corrupt' 和 [] 都是 truthy,但它们不是那个形状 ——
  // 把它们当成学过,等于让一段坏数据替用户主张一次学习记录。
  const word = w(pub(true, false));   // dictionary-only,只能靠 record 放行
  for (const junk of ['corrupt', '', 0, 1, 3.14, [], [{}], true, false, NaN, null, undefined]) {
    assert.equal(canReviewWord(word, junk), false, `record=${JSON.stringify(junk) ?? String(junk)}`);
    assert.equal(canGradeWord(word, junk), false, 'canGradeWord 也不该被脏值放行');
  }
});

test('★★ 空对象 record 仍然算学过 —— 不拿字段完整度当门槛', () => {
  // 一条字段不全的旧记录同样是用户学过的证据。按 status/box/dueAt 再加门槛,
  // 会把「内容发布收紧」悄悄变成「用户进度清理」。
  const word = w(pub(true, false));
  assert.equal(canReviewWord(word, {}), true, '空对象');
  assert.equal(canReviewWord(word, { box: 0 }), true, 'box=0 也不是「没学过」');
  assert.equal(canReviewWord(word, { status: undefined, dueAt: null }), true);
  assert.equal(canGradeWord(word, {}), true);
});

// ── 8. 例句与 publication 无关 ──────────────────────────────

test('★ 例句三件套齐不齐,和能不能学是两回事', () => {
  const full = { exampleJp: 'あ', exampleZh: '啊', exampleRoma: 'a' };
  assert.equal(hasCompleteExample(w(full)), true);
  assert.equal(hasCompleteExample(w({ ...full, ...pub(true, true) })), true, '有 publication 不改变它');
  assert.equal(hasCompleteExample(w({ ...full, ...pub(false, false) })), true, '没 publication 也不改变它');
  // 反过来:例句齐全不给任何发布权限(这正是老 isDraftedWord 的错)
  assert.equal(isLearnableWord(w(full)), false);
});

test('★ 缺任一项 / 只有空白 都不算完整', () => {
  assert.equal(hasCompleteExample(w({ exampleJp: 'あ', exampleZh: '啊' })), false, '缺罗马音');
  assert.equal(hasCompleteExample(w({ exampleJp: 'あ', exampleRoma: 'a' })), false, '缺中文');
  assert.equal(hasCompleteExample(w({ exampleZh: '啊', exampleRoma: 'a' })), false, '缺日文');
  assert.equal(hasCompleteExample(w({ exampleJp: ' ', exampleZh: '啊', exampleRoma: 'a' })), false, '只有空白');
});

// ── 9. editorial 边界 ───────────────────────────────────────

const FIELD = { sentence: { jp: '雨が降る', zh: '下雨' } };

test('★ hasEditorialDepth 三条通路各自成立', () => {
  assert.equal(hasEditorialDepth(w()), false, '三样都没有');
  assert.equal(hasEditorialDepth(w({ coreChunk: '注文する' })), true);
  assert.equal(hasEditorialDepth(w({ wordField: FIELD })), true, '对象形状');
  assert.equal(hasEditorialDepth(w({ wordField: [FIELD] })), true, '数组形状');
  assert.equal(hasEditorialDepth(w({ yanFeatures: ['kanji_anchor'] })), true);
  // 有深度 ≠ 可以学
  assert.equal(isLearnableWord(w({ coreChunk: '注文する', yanFeatures: ['kanji_anchor'] })), false);
});

test('★★ 空壳不算编辑深度 —— 口径和运行时 wordFieldsOf() 对齐', () => {
  // wordFieldsOf() 只承认带 sentence.jp 的条目。一个空壳在复习队列里
  // 产不出任何一道题,拿它去货架上声称「有编辑深度」,那句话是空的。
  //
  // ⚠️ 这一组是 Codex 复核抓到的真 bug:上一版只判 truthy object,
  // 于是 {} / [] / new Date() 全部返回 true,而测试还把 { members: [] } 固化成 true ——
  // **测试把错的行为锁住了**,这比实现错更难发现。
  for (const v of [{}, [], new Date(), { members: [] }, { sentence: {} },
                   { sentence: { jp: '   ' } }, [{}], [null], 'jp', 0]) {
    assert.equal(hasEditorialDepth(w({ wordField: v })), false,
      `wordField=${JSON.stringify(v) ?? String(v)} 不该算有深度`);
  }
});

test('★ editorial 的其余空值边界', () => {
  assert.equal(hasEditorialDepth(w({ coreChunk: '   ' })), false, '只有空白');
  assert.equal(hasEditorialDepth(w({ yanFeatures: [] })), false, '空数组');
  assert.equal(hasEditorialDepth(w({ yanFeatures: [null] })), false, '数组里是 null');
  assert.equal(hasEditorialDepth(w({ yanFeatures: [' ', '\t'] })), false, '数组里只有空白');
  assert.equal(hasEditorialDepth(w({ yanFeatures: [null, 'kanji_anchor'] })), true, '混着有真的');
  assert.equal(hasEditorialDepth(w({ yanFeatures: 'kanji_anchor' })), false, '不是数组');
  assert.equal(hasEditorialDepth(w({ wordField: null })), false);
});

// ── 10. 脏输入一律不抛 ──────────────────────────────────────

test('★★ null / undefined / 错误形状 —— 一律 false,绝不抛', () => {
  const junk = [null, undefined, 0, 1, '', 'word', [], [1, 2], true, false, NaN];
  for (const v of junk) {
    assert.doesNotThrow(() => {
      hasDictionaryShape(v); isDictionaryEntry(v); isLearnableWord(v);
      hasCompleteExample(v); hasEditorialDepth(v);
      canIntroduceWord(v); canReviewWord(v, null); canGradeWord(v, null);
    }, `输入 ${JSON.stringify(v)} 抛了`);
    assert.equal(isDictionaryEntry(v), false);
    assert.equal(isLearnableWord(v), false);
    assert.equal(canGradeWord(v, null), false);
  }
});

test('★ publication 本身是错误形状时当作没有', () => {
  for (const p of [null, 'yes', 42, [], [{ dictionary: true }], true]) {
    assert.equal(isDictionaryEntry(w({ publication: p })), false, `publication=${JSON.stringify(p)}`);
    assert.equal(isLearnableWord(w({ publication: p })), false);
  }
});
