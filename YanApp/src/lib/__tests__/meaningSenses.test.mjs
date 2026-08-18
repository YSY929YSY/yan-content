// 义项拆分的规则测试。
//
// 守的是两层结构不被压平:`|` 是义项,`;` 是同义项内的近义写法。
// 它错的样子有两种,方向相反:
//   · 该切没切 —— 「我慢」只剩一条「endurance; patience; ... | self-control; ...」,
//     词卡正面塞一整行,用户读不出这词有两个不同的意思
//   · 不该切切了 —— 「半」的括号例句被 `|` 从中间劈开,
//     两半("half (e.g., にじはん" / "half-past two)")都不是词
//
// 期望值全部写死成字面量,不从被测函数或被测常量里取 —— 否则实现改成
// 任何东西测试都是绿的。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseEnSenses, parseZhSenses, parseMeaning, isPolysemous, primaryGloss,
} from '../../features/wordbank/meaningSenses.ts';

// ── 两层结构 ─────────────────────────────────────────────────

test('★ `|` 切义项,`;` 切义项内的近义写法 —— 两层不能压成一层', () => {
  const senses = parseEnSenses('endurance; patience; perseverance | self-control; self-restraint');
  assert.equal(senses.length, 2);
  assert.equal(senses[0].text, 'endurance; patience; perseverance');
  assert.deepEqual(senses[0].glosses, ['endurance', 'patience', 'perseverance']);
  assert.equal(senses[1].text, 'self-control; self-restraint');
  assert.deepEqual(senses[1].glosses, ['self-control', 'self-restraint']);
});

test('单义项也给出 glosses 数组,长度 1 —— 调用方可以无条件取 [0]', () => {
  const senses = parseEnSenses('Yen');
  assert.equal(senses.length, 1);
  assert.equal(senses[0].text, 'Yen');
  assert.deepEqual(senses[0].glosses, ['Yen']);
});

test('三义项(全库 16 条长这样)', () => {
  const senses = parseEnSenses('bright; cheerful | light; well-lit | bright (colour)');
  assert.equal(senses.length, 3);
  assert.deepEqual(senses.map(s => s.text), ['bright; cheerful', 'light; well-lit', 'bright (colour)']);
});

// ── 括号内的分隔符不算数 ─────────────────────────────────────

test('★ 括号里的 `|` 不切 —— 全库唯一那条「半」不能被劈成两半', () => {
  const senses = parseEnSenses('half (e.g., にじはん | half-past two)');
  assert.equal(senses.length, 1);
  assert.equal(senses[0].text, 'half (e.g., にじはん | half-past two)');
});

test('★ 括号里的 `;` 不切近义写法', () => {
  const senses = parseEnSenses('out (of a ball; in tennis, etc.); outside the line | out; putout');
  assert.equal(senses.length, 2);
  assert.deepEqual(senses[0].glosses, ['out (of a ball; in tennis, etc.)', 'outside the line']);
  assert.deepEqual(senses[1].glosses, ['out', 'putout']);
});

test('嵌套括号照样配平', () => {
  const senses = parseEnSenses('a (b (c | d) e) | f');
  assert.equal(senses.length, 2);
  assert.equal(senses[0].text, 'a (b (c | d) e)');
  assert.equal(senses[1].text, 'f');
});

test('孤立的右括号不该让后面整条都不再切分', () => {
  const senses = parseEnSenses('a) b | c');
  assert.equal(senses.length, 2);
  assert.equal(senses[1].text, 'c');
});

// ── 脏数据 ───────────────────────────────────────────────────

test('★ 首尾多余分隔符、连续分隔符、空义项一律丢弃', () => {
  assert.deepEqual(parseEnSenses('| a |').map(s => s.text), ['a']);
  assert.deepEqual(parseEnSenses('a | | b').map(s => s.text), ['a', 'b']);
  assert.deepEqual(parseEnSenses('  |  ').map(s => s.text), []);
  assert.deepEqual(parseEnSenses('a ;; b').map(s => s.text), ['a ;; b']);
  assert.deepEqual(parseEnSenses('a ;; b')[0].glosses, ['a', 'b']);
});

test('★ 分隔符两侧的空格是格式不是内容,切完必须去掉', () => {
  assert.equal(parseEnSenses('  a   b |   c  ')[0].text, 'a b');
  assert.equal(parseEnSenses('  a   b |   c  ')[1].text, 'c');
});

test('不是字符串不炸 —— 内容包是远端下发的', () => {
  assert.deepEqual(parseEnSenses(null), []);
  assert.deepEqual(parseEnSenses(undefined), []);
  assert.deepEqual(parseEnSenses(42), []);
  assert.deepEqual(parseEnSenses({}), []);
  assert.deepEqual(parseEnSenses(''), []);
  assert.deepEqual(parseMeaning(null), { en: [], zh: [], aligned: false });
  assert.deepEqual(parseMeaning(undefined).en, []);
});

// ── 中文侧 ───────────────────────────────────────────────────

// 全角分号/逗号在源码里写成转义,肉眼分不出 `；` 和 `;` 时改错一个字符
// 测试会假绿(半角分号是英文侧的 gloss 分隔符,中文侧根本不该认)。
const ZH_SEMI = '\uFF1B';
const ZH_COMMA = '\uFF0C';

test('★ 中文只切全角分号,不切全角逗号 —— 逗号在中文释义里也是句内标点', () => {
  const senses = parseZhSenses(`忍耐${ZH_COMMA}忍受${ZH_SEMI}克制`);
  assert.equal(senses.length, 2);
  assert.equal(senses[0].text, `忍耐${ZH_COMMA}忍受`);
  assert.equal(senses[1].text, '克制');
});

test('中文侧不认半角分号 —— 那是英文 gloss 的分隔符,中文释义里 0 条出现', () => {
  assert.equal(parseZhSenses('忍耐;克制').length, 1);
});

test('中文侧不认 `|` —— 全库 0 条中文释义含 `|`,当它是普通字符', () => {
  const senses = parseZhSenses('明亮的 | 开朗的');
  assert.equal(senses.length, 1);
  assert.equal(senses[0].text, '明亮的 | 开朗的');
});

// ── aligned 只是信号,不是配对承诺 ────────────────────────────

test('★ 中英义项数不等时 aligned 为 false', () => {
  const r = parseMeaning({
    meaning_en: 'bright; cheerful | light | bright (colour)',
    meaning_zh: `明亮的${ZH_SEMI}开朗的`,
  });
  assert.equal(r.en.length, 3);
  assert.equal(r.zh.length, 2);
  assert.equal(r.aligned, false);
});

test('数量相等时 aligned 为 true', () => {
  const r = parseMeaning({ meaning_en: 'juice | soft drink', meaning_zh: `果汁${ZH_SEMI}饮料` });
  assert.equal(r.en.length, 2);
  assert.equal(r.zh.length, 2);
  assert.equal(r.aligned, true);
});

test('英文侧为空时 aligned 不能为 true —— 两边都空不叫「对齐」', () => {
  assert.equal(parseMeaning({ meaning_en: '', meaning_zh: '' }).aligned, false);
});

// ── 便捷判据 ─────────────────────────────────────────────────

test('★ 多义只看英文侧 —— 中文是人工摘要,压成一句是常态', () => {
  assert.equal(isPolysemous({ meaning_en: 'boat | rowboat', meaning_zh: '小船,划艇' }), true);
  assert.equal(isPolysemous({ meaning_en: 'boat; rowboat', meaning_zh: `小船${ZH_SEMI}划艇` }), false);
  assert.equal(isPolysemous({ meaning_en: 'Yen' }), false);
  assert.equal(isPolysemous(null), false);
});

test('★ 主释义 = 第一义项的第一个 gloss', () => {
  assert.equal(primaryGloss({ meaning_en: 'endurance; patience | self-control' }), 'endurance');
  assert.equal(primaryGloss({ meaning_en: '' }), '');
  assert.equal(primaryGloss(null), '');
});

// ── 真实词库 ─────────────────────────────────────────────────
//
// 下面的数字是 2026-08-18 对 assets/content.fallback.json 实测出来的
// 快照(8005 条)。词库更新后它们会变,那时该改的是这里的数字,
// 而不是把这几条测试删掉 —— 它们是唯一防「解析器悄悄少切一半」的东西。

const wordBank = JSON.parse(
  readFileSync(new URL('../../../assets/content.fallback.json', import.meta.url), 'utf8'),
).wordBank;

test('★ 真实词库:总条数与含 `|` 的条数', () => {
  assert.equal(wordBank.length, 8005);
  assert.equal(wordBank.filter(w => w.meaning_en.includes('|')).length, 3017);
});

test('★ 真实词库:多义词 3016 条 —— 比含 `|` 的 3017 条少一条,少的正是「半」', () => {
  const poly = wordBank.filter(isPolysemous);
  assert.equal(poly.length, 3016);
  const han = wordBank.find(w => w.id === 'n5_han');
  assert.equal(han.meaning_en, 'half (e.g., にじはん | half-past two)');
  assert.equal(isPolysemous(han), false);
});

test('★ 真实词库:义项数分布 —— 1 义 4989 / 2 义 3000 / 3 义 16', () => {
  const dist = { 1: 0, 2: 0, 3: 0 };
  for (const w of wordBank) dist[parseEnSenses(w.meaning_en).length]++;
  assert.equal(dist[1], 4989);
  assert.equal(dist[2], 3000);
  assert.equal(dist[3], 16);
  // 加起来必须是全库 —— 少一条就说明有词条解析出 0 义项
  assert.equal(4989 + 3000 + 16, 8005);
});

test('★ 真实词库:没有一条解析出空义项或空 gloss', () => {
  let bad = 0;
  for (const w of wordBank) {
    for (const s of parseEnSenses(w.meaning_en)) {
      if (s.text === '' || s.glosses.length === 0 || s.glosses.some(g => g === '')) bad++;
    }
  }
  assert.equal(bad, 0);
});

test('★ 真实词库:中英义项数只有 2136/3017 相等 —— 不要按下标配对', () => {
  const piped = wordBank.filter(w => w.meaning_en.includes('|'));
  assert.equal(piped.length, 3017);
  assert.equal(piped.filter(w => parseMeaning(w).aligned).length, 2136);
});

test('★ 真实词库:抽三条已知词条,逐字核对拆出来的义项', () => {
  const gaman = wordBank.find(w => w.word === '我慢');
  assert.deepEqual(parseEnSenses(gaman.meaning_en).map(s => s.text), [
    'endurance; patience; perseverance',
    'self-control; self-restraint',
  ]);
  const akarui = wordBank.find(w => w.word === '明るい');
  assert.equal(parseEnSenses(akarui.meaning_en).length, 3);
  assert.equal(primaryGloss(akarui), 'bright (in reference to personality or weather)');
  const en = wordBank.find(w => w.id === 'n5_en');
  assert.deepEqual(parseEnSenses(en.meaning_en), [{ text: 'Yen', glosses: ['Yen'] }]);
});
