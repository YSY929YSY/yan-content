// 声调的纯计算测试。
//
// 守的是一种「不报错但教错」的失败:高低线画在错的拍上。
// 学习者会照着念,而且没人纠正他 —— 比没有声调坏。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toMora, pitchPattern, parseAccents, primaryAccent, accentName, accentHint,
} from '../../features/wordbank/pitch.js';

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
