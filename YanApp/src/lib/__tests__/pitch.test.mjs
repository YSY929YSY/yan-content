// 声调的纯计算测试。
//
// 守的是一种「不报错但教错」的失败:高低线画在错的拍上。
// 学习者会照着念,而且没人纠正他 —— 比没有声调坏。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toMora, pitchPattern, parseAccents, primaryAccent, accentName, accentHint, accentOf,
  pitchUnconfirmed,
} from '../../features/wordbank/pitch.js';
import { readFileSync } from 'node:fs';

// ── 拍 ───────────────────────────────────────────────────────
test('★ 拍不是字符 —— 拗音算一拍,促音和拨音各算一拍', () => {
  assert.deepEqual(toMora('きゃく'), ['きゃ', 'く']);            // 客 = 2 拍不是 3
  assert.deepEqual(toMora('しゅっぱつ'), ['しゅ', 'っ', 'ぱ', 'つ']);  // 出発 = 4 拍
  assert.deepEqual(toMora('でんわ'), ['で', 'ん', 'わ']);        // 電話 = 3 拍
  assert.deepEqual(toMora('コーヒー'), ['コ', 'ー', 'ヒ', 'ー']); // 长音各占一拍
  assert.deepEqual(toMora(''), []);
  assert.deepEqual(toMora(null), []);
});

// ── 高低 ─────────────────────────────────────────────────────
test('★ 第一拍和第二拍必然不同高低 —— 这是日语声调的底层约束,违反了就是画错了', () => {
  for (const r of ['はし', 'さくら', 'でんわ', 'きゃく', 'しゅっぱつ']) {
    for (let a = 0; a <= toMora(r).length; a++) {
      const { pattern } = pitchPattern(r, a);
      if (pattern.length >= 2) {
        assert.notEqual(pattern[0], pattern[1],
          `${r} 型${a}:第一拍和第二拍同高低了`);
      }
    }
  }
});

test('型0 平板:低高高…,而且后接助词也高', () => {
  const { pattern, particleHigh } = pitchPattern('さくら', 0);
  assert.deepEqual(pattern, [false, true, true]);
  assert.equal(particleHigh, true);
});

test('型1 头高:高低低…', () => {
  assert.deepEqual(pitchPattern('はし', 1).pattern, [true, false]);   // 箸
  assert.deepEqual(pitchPattern('いのち', 1).pattern, [true, false, false]);
});

test('型2 以上:低,第 2~n 拍高,之后落下来', () => {
  assert.deepEqual(pitchPattern('はし', 2).pattern, [false, true]);          // 橋
  assert.deepEqual(pitchPattern('たまご', 2).pattern, [false, true, false]);  // 卵
  assert.deepEqual(pitchPattern('おとうと', 4).pattern, [false, true, true, true]);
});

test('★ 型0 和「型=拍数」在词本身上看起来一样,只有助词能分开 —— 所以 particleHigh 必须给', () => {
  // 桜(型0)和 花(型2,2拍)在词内都是「低高」,差别全在后面那个助词上
  const flat = pitchPattern('はな', 0);
  const tail = pitchPattern('はな', 2);
  assert.deepEqual(flat.pattern, tail.pattern, '词内确实分不出来');
  assert.notEqual(flat.particleHigh, tail.particleHigh, '助词上必须分得出来');
});

test('★ 我举给用户看的那几组同音词,必须真的分得开', () => {
  const p = (r, a) => pitchPattern(r, a).pattern.map(x => (x ? '高' : '低')).join('');
  assert.notEqual(p('はし', 1), p('はし', 2));   // 箸 / 橋
  assert.notEqual(p('あめ', 1), p('あめ', 0));   // 雨 / 飴
  assert.notEqual(p('かみ', 1), p('かみ', 2));   // 神 / 紙
  // 端(型0)和 橋(型2)词内同形 —— 这一组只能靠助词,界面上不能假装分开了
  assert.deepEqual(p('はし', 0), p('はし', 2));
  assert.notEqual(pitchPattern('はし', 0).particleHigh, pitchPattern('はし', 2).particleHigh);
});

// ── 原始数据解析 ─────────────────────────────────────────────
test('★ kanjium 的三种形状都要认,认不出的宁可空着', () => {
  assert.deepEqual(parseAccents('1'), [1]);
  assert.deepEqual(parseAccents('0,3'), [0, 3]);
  // 带词性标注的:括号里的丢掉,词库自己有 pos 字段,不在这儿弄第二个真相来源
  assert.deepEqual(parseAccents('(形動)3,(副)3,1,0'), [3, 1, 0]);
  assert.deepEqual(parseAccents(''), []);
  assert.deepEqual(parseAccents(null), []);
  assert.deepEqual(parseAccents('わからない'), []);
});

test('★ 只显示第一个 —— 摆出「0,3」是把选择题丢给不会日语的人', () => {
  assert.equal(primaryAccent('0,3'), 0);
  assert.equal(primaryAccent('(形動)3,(副)3,1,0'), 3);
  // 没有就是没有,不要猜一个 0 出来(0 是平板,是个真实的型,不能当缺省值)
  assert.equal(primaryAccent(''), null);
  assert.equal(primaryAccent('わからない'), null);
});

// ── 型名 ─────────────────────────────────────────────────────
test('型的名字按拍数算 —— 尾高和中高的界线是「降在不在最后一拍」', () => {
  assert.equal(accentName('さくら', 0), '平板');
  assert.equal(accentName('はし', 1), '頭高');
  assert.equal(accentName('はし', 2), '尾高');      // 2 拍词的型2 = 尾高
  assert.equal(accentName('たまご', 2), '中高');    // 3 拍词的型2 = 中高
  assert.equal(accentName('たまご', 3), '尾高');
});

test('★ 型名后面那句大白话必须和高低线说的是同一件事', () => {
  // 用户反馈「那个高低线其实我有一点没看懂」——「頭高」是行话,
  // 而这个 App 还没教过它。所以补一句能照着念的中文。
  // **这句话要是和线画的不一致,比不给还坏** —— 学习者会照着错的念。
  const check = (reading, accent) => {
    const { pattern, particleHigh } = pitchPattern(reading, accent);
    const hint = accentHint(reading, accent);
    assert.ok(hint, `${reading} 型${accent} 没给提示`);
    if (accent === 0) {
      assert.equal(pattern[0], false, '平板第1拍该低');
      assert.equal(particleHigh, true, '平板助词该高');
      assert.match(hint, /第1拍低/);
      assert.match(hint, /助词也高/);
    }
    if (accent === 1 && pattern.length > 1) {
      assert.equal(pattern[0], true, '頭高第1拍该高');
      assert.equal(pattern[1], false, '頭高第2拍该低');
      assert.match(hint, /第1拍高/);
    }
    if (accent >= 2 && accent >= pattern.length) {
      assert.equal(pattern[pattern.length - 1], true, '尾高最后一拍该高');
      assert.equal(particleHigh, false, '尾高助词该低');
      assert.match(hint, /助词才转低/);
    }
  };
  check('さくら', 0);      // 平板
  check('あいさつ', 1);    // 頭高 —— 用户看到的那个词
  check('はし', 1);
  check('はな', 2);        // 尾高(2 拍词的型2)
  check('たまご', 2);      // 中高
  assert.match(accentHint('たまご', 2), /第2拍之后降/);
});

test('拿不到就不要编一句出来', () => {
  assert.equal(accentHint('', 1), '');
  assert.equal(accentHint('あいさつ', null), '');
  assert.equal(accentHint('あいさつ', undefined), '');
});

// ── 从词条上取型 ─────────────────────────────────────────────
//
// 这一组守的是 2026-08-18 那个 bug:渲染层读 `pitchAccent`,而合入的数据
// 写在 `pitch.accent`,于是生产构建里 7510 条音调一条都不显示。
// 开发构建有 preview 兜底,所以「真机验过」也没验出来。

test('★ 读的是 pitch.accent —— 合入的 7510 条全写在这里', () => {
  // 字面量,不写 sample.pitch.accent:断言的期望值取自被测对象的话,
  // 把实现改成 `return w.pitch.accent` 之外的任何东西它都照样绿。
  assert.equal(accentOf({ pitch: { accent: 1, mora: 2, source: 'kanjium' } }), 1);
  assert.equal(accentOf({ pitch: { accent: 2, mora: 3 } }), 2);
});

test('★ 型 0 是「平板」,不是「没有」—— 这条错了会把一批词教成平板', () => {
  assert.equal(accentOf({ pitch: { accent: 0, mora: 3 } }), 0);
  // 而真的没有必须是 null,两者不能长一样
  assert.equal(accentOf({ word: '桜', reading: 'さくら' }), null);
  assert.equal(accentOf({ pitch: {} }), null);
  assert.equal(accentOf({ pitch: null }), null);
  assert.equal(accentOf(null), null);
  assert.equal(accentOf(undefined), null);
});

test('多型词取 accent 那个,不碰 all —— 「取第一个」这条规则无源可核,但至少要稳定', () => {
  assert.equal(accentOf({ pitch: { accent: 0, all: [0, 3], mora: 4, multi: true } }), 0);
});

test('旧结构的内容包还认 —— 内容包是远端下发的,线上可能还有旧包在跑', () => {
  assert.equal(accentOf({ pitchAccent: 3 }), 3);
  // 两个都在时以新结构为准
  assert.equal(accentOf({ pitch: { accent: 1 }, pitchAccent: 3 }), 1);
});

test('★ 含维基的 agree=2 按单源提示，UniDic+kanjium 的双源提示不变', () => {
  assert.equal(pitchUnconfirmed({ word: '注文', reading: 'ちゅうもん', pitch: { agree: 2 } }), true);
  assert.equal(pitchUnconfirmed({ word: '芸術', reading: 'げいじゅつ', pitch: { agree: 2 } }), false);
  assert.equal(pitchUnconfirmed({ word: '注文', reading: 'ちゅうもん', pitch: { agree: 3 } }), false);
  assert.equal(pitchUnconfirmed({ pitch: { agree: 1 } }), true);
});

test('★ 回归:真实内容包里 accentOf 必须能取到,不是只在构造的对象上成立', () => {
  // ⚠️ 这条读的是真文件。上一轮的五次错全是「看了局部样本就当成全库」,
  // 而这个 bug 恰恰是构造对象怎么测都测不出来的那一类 —— 它是数据和代码
  // 对不上,两边分开看都没问题。
  const url = new URL('../../../assets/content.fallback.json', import.meta.url);
  const wordBank = JSON.parse(readFileSync(url, 'utf8')).wordBank || [];
  const got = wordBank.filter(w => accentOf(w) != null).length;

  // 字面量下界。合入报告说 7510 条 —— 掉到 7000 以下说明数据或字段名又动了。
  assert.ok(got >= 7000, `真实内容包里只有 ${got} 条取得到声调,合入时是 7510`);
  // 而且不能是全都有:495 条本来就没音调,全绿反而说明 accentOf 在瞎给值
  assert.ok(got < wordBank.length, `${wordBank.length} 条全都有声调,不合预期`);
});
