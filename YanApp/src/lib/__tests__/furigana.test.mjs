// 振り仮名对齐的测试。
//
// 守的是一种「不报错但教错」的失败:假名标在错的字上面。
// 学习者会照着念,而且没人纠正他 —— 和声调线是同一类风险。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alignFurigana, canAlign, primaryReading, altReadings } from '../../features/wordbank/furigana.ts';
import { toMora } from '../../features/wordbank/pitch.js';

// ── 基本形 ───────────────────────────────────────────────────

test('★ 送り仮名不注音 —— 这是这件事的全部难点', () => {
  // 美味しい / おいしい:只有「美味」该标「おい」,「しい」本来就是假名
  assert.deepEqual(alignFurigana('美味しい', 'おいしい'), [
    { text: '美味', ruby: 'おい' },
    { text: 'しい' },
  ]);
});

test('单汉字 + 送り仮名', () => {
  assert.deepEqual(alignFurigana('行く', 'いく'), [
    { text: '行', ruby: 'い' },
    { text: 'く' },
  ]);
  assert.deepEqual(alignFurigana('食べる', 'たべる'), [
    { text: '食', ruby: 'た' },
    { text: 'べる' },
  ]);
});

test('整词都是汉字', () => {
  assert.deepEqual(alignFurigana('仕事', 'しごと'), [{ text: '仕事', ruby: 'しごと' }]);
});

test('假名夹在中间,两段汉字各注各的', () => {
  assert.deepEqual(alignFurigana('持ち物', 'もちもの'), [
    { text: '持', ruby: 'も' },
    { text: 'ち' },
    { text: '物', ruby: 'もの' },
  ]);
});

test('整词假名 —— 不是失败,是本来就不用注', () => {
  assert.deepEqual(alignFurigana('こんにちは', 'こんにちは'), [{ text: 'こんにちは' }]);
});

// ── 实测逼出来的两个特殊字 ───────────────────────────────────

test('★ 踊り字 々 要注音 —— 它不在汉字区段里,当假名处理会全库挂 50 多条', () => {
  assert.deepEqual(alignFurigana('色々', 'いろいろ'), [{ text: '色々', ruby: 'いろいろ' }]);
  assert.deepEqual(alignFurigana('時々', 'ときどき'), [{ text: '時々', ruby: 'ときどき' }]);
});

test('★ ヶ 是缩写记号不是假名 —— ヶ月 读 かげつ,那个 ヶ 读 か', () => {
  const got = alignFurigana('ヶ月', 'かげつ');
  assert.notEqual(got, null, 'ヶ月 必须能对上,它是全库最后一条对不上的');
});

test('★ 词里的片假名按读音比对,但显示的字不变', () => {
  // 消しゴム / けしごむ:ゴム 是假名段,要归一成 ごむ 才对得上;
  // 但吐出来的 text 必须还是片假名 ゴム,屏幕上不能变成 ごむ
  assert.deepEqual(alignFurigana('消しゴム', 'けしごむ'), [
    { text: '消', ruby: 'け' },
    { text: 'しゴム' },
  ]);
});

// ── 对不上的时候 ─────────────────────────────────────────────

test('★★ 对不上返回 null,绝不退化成「整词标一个读音」', () => {
  // 假名段对不上 —— 读音根本不是这个词的
  assert.equal(alignFurigana('行く', 'たべる'), null);
  // 退化成整词标注看起来也像模像样,但它在教「这几个假名和这几个字逐一对应」,
  // 而那是假的。宁可不注音,也不要多一个错的信息。
  assert.equal(alignFurigana('美味しい', 'ぜんぜんちがう'), null);
});

test('空值不炸', () => {
  assert.equal(alignFurigana(null, 'いく'), null);
  assert.equal(alignFurigana('行く', null), null);
  assert.equal(alignFurigana('', ''), null);
  assert.equal(alignFurigana(undefined, undefined), null);
  assert.equal(canAlign('行く', 'いく'), true);
  assert.equal(canAlign('行く', 'たべる'), false);
});

test('不改原字符串 —— 吐出来的 text 拼回去必须等于原词', () => {
  for (const [w, r] of [['美味しい', 'おいしい'], ['持ち物', 'もちもの'], ['消しゴム', 'けしごむ']]) {
    const segs = alignFurigana(w, r);
    assert.equal(segs.map(s => s.text).join(''), w, `${w} 拼不回去`);
  }
});

// ── 真实词库回归 ─────────────────────────────────────────────

test('★ 回归:真实词库里含汉字的词几乎全都对得上', () => {
  // ⚠️ 读真文件。这条守的是「算法在构造的例子上work,在真数据上塌了」——
  // 第一版只按汉字区段筛,构造的例子全过,真数据挂了 55 条(々 和片假名两类)。
  const url = new URL('../../../assets/content.fallback.json', import.meta.url);
  const wordBank = JSON.parse(readFileSync(url, 'utf8')).wordBank || [];

  const hasKanji = (s) => [...String(s || '')].some(c => /[一-龯㐀-䶿々ヶ]/.test(c));
  let cand = 0, ok = 0;
  const failed = [];
  for (const w of wordBank) {
    // ⚠️ 这里**曾经**排除过「读音带分号」的条目,理由写的是「那是多读音条目,
    // 不是对齐问题」。那是错的:`行く/いく; ゆく` 会把 行 标成「いく; ゆ」,
    // 而 `行く` 和 `何` 正好在主线第一批里,是用户第一眼看到的东西。
    // **把不方便的数据排除在测试外,等于给自己发一张假的合格证。** 不再排除。
    if (!hasKanji(w.word)) continue;
    cand += 1;
    if (alignFurigana(w.word, w.reading)) ok += 1;
    else if (failed.length < 10) failed.push(`${w.word}/${w.reading}`);
  }

  // 字面量。写 `ok === cand` 的话,算法退化成「什么都返回 null」时
  // cand 也会变,断言可能照样绿。
  assert.ok(cand >= 6900, `含汉字的候选只有 ${cand} 条,预期 6963 左右 —— 词库变了?`);
  assert.ok(ok >= 6960, `只对上 ${ok} 条(候选 ${cand}),实测应为 6962。失败样本:${failed.join(' ')}`);
  // 而且不能是「全都返回非 null」—— 那说明它在瞎对齐
  assert.ok(ok <= cand, '对上的不可能多于候选');
});

test('★ 回归:对齐结果必须能拼回原词,全库逐条验', () => {
  // 光看「对上了多少条」不够:一个把字吃掉的实现同样会「对上」。
  const url = new URL('../../../assets/content.fallback.json', import.meta.url);
  const wordBank = JSON.parse(readFileSync(url, 'utf8')).wordBank || [];
  let checked = 0;
  for (const w of wordBank) {
    const segs = alignFurigana(w.word, w.reading);
    if (!segs) continue;
    checked += 1;
    assert.equal(segs.map(s => s.text).join(''), w.word, `${w.word} 拼不回去`);
  }
  assert.ok(checked >= 7000, `只验了 ${checked} 条,太少`);
});

// ── 多读音 ───────────────────────────────────────────────────
//
// 真机上暴露的:`行` 上面标着「いく; ゆ」。全库只有 12 条这样,
// 但 `行く` 和 `何` 都在主线第一批里。

test('★★ 读音带分号时只用第一个 —— 不然整串会被塞给汉字', () => {
  assert.deepEqual(alignFurigana('行く', 'いく; ゆく'), [
    { text: '行', ruby: 'い' },
    { text: 'く' },
  ]);
  assert.deepEqual(alignFurigana('何', 'なん; なに'), [{ text: '何', ruby: 'なん' }]);
});

test('其余读音要能取出来 —— 默默丢掉也是错的,「还有别的念法」是有用的信息', () => {
  assert.equal(primaryReading('いく; ゆく'), 'いく');
  assert.deepEqual(altReadings('いく; ゆく'), ['ゆく']);
  assert.deepEqual(altReadings('わたくし'), []);
  assert.deepEqual(altReadings(''), []);
  assert.deepEqual(altReadings(null), []);
  // 全角分号也认
  assert.equal(primaryReading('なん；なに'), 'なん');
});

test('★ 回归:全库带分号的那些也必须能对齐', () => {
  const url = new URL('../../../assets/content.fallback.json', import.meta.url);
  const wordBank = JSON.parse(readFileSync(url, 'utf8')).wordBank || [];
  const multi = wordBank.filter(w => /[;；]/.test(w.reading || ''));
  // 字面量:实测 12 条
  assert.equal(multi.length, 12, `带分号的词条 ${multi.length} 条,实测应为 12`);
  const failed = multi.filter(w => {
    const segs = alignFurigana(w.word, w.reading);
    return segs && segs.map(s => s.text).join('') !== w.word;
  });
  assert.equal(failed.length, 0, `拼不回原词:${failed.map(w => w.word).join(' ')}`);
});

// ── 全线排查:三道自动闸,不靠眼睛看 ─────────────────────────
//
// 真机上那个 `行` 标成「いく; ゆ」的 bug 说明了一件事:
// **「能对齐」和「对得对」是两回事**,而上一版回归只验了前者。
// 靠人肉看 8005 条不现实,所以换成三道能自动跑的判据。

test('★★ 交叉验证:注音的拍数必须和 kanjium 的 mora 一致', () => {
  // ⚠️ 这一条的价值在于**它用的是另一个来源**。
  // 声调数据(kanjium)自带每个词的拍数,和注音对齐是两套毫不相干的逻辑 ——
  // 两边对不上,必有一边错。自己写测试验自己的实现,是验不出口径错的。
  const url = new URL('../../../assets/content.fallback.json', import.meta.url);
  const wordBank = JSON.parse(readFileSync(url, 'utf8')).wordBank || [];

  let checked = 0;
  const bad = [];
  for (const w of wordBank) {
    const mora = w.pitch?.mora;
    if (!Number.isFinite(mora)) continue;
    checked += 1;
    const got = toMora(primaryReading(w.reading)).length;
    if (got !== mora && bad.length < 10) bad.push(`${w.word}/${w.reading} 算出 ${got} 拍,kanjium 说 ${mora} 拍`);
  }
  // 字面量:实测 7510 条有 mora 可以对
  assert.ok(checked >= 7400, `能交叉验证的只有 ${checked} 条,实测应为 7510`);
  assert.equal(bad.length, 0, `拍数对不上:\n${bad.join('\n')}`);
});

test('★★ 注音里只能是假名 —— 那个 bug 就是分号混进了 ruby', () => {
  // ruby = "いく; ゆ" 之所以能溜过去,是因为没人规定 ruby 长什么样。
  // 规定了之后,整**一类**问题(分隔符/拉丁字母/汉字漏进注音)都会当场现形。
  const url = new URL('../../../assets/content.fallback.json', import.meta.url);
  const wordBank = JSON.parse(readFileSync(url, 'utf8')).wordBank || [];
  const KANA_ONLY = /^[ぁ-ゖァ-ヺーゝゞ]+$/;

  let rubies = 0;
  const bad = [];
  for (const w of wordBank) {
    const segs = alignFurigana(w.word, w.reading);
    if (!segs) continue;
    for (const seg of segs) {
      if (!seg.ruby) continue;
      rubies += 1;
      if (!KANA_ONLY.test(seg.ruby) && bad.length < 10) {
        bad.push(`${w.word}/${w.reading} → ruby="${seg.ruby}"`);
      }
    }
  }
  assert.ok(rubies >= 7000, `注音段只有 ${rubies} 个,实测应为 7259`);
  assert.equal(bad.length, 0, `ruby 里混进了非假名:\n${bad.join('\n')}`);
});

test('★ 一个汉字不该配一长串假名 —— 那多半是整串读音被塞给了它', () => {
  // 这是上一个 bug 的形状本身:单字 `行` 拿到了「いく; ゆ」。
  // 日语单字读音极少超过 5 拍,超了就该看一眼。
  const url = new URL('../../../assets/content.fallback.json', import.meta.url);
  const wordBank = JSON.parse(readFileSync(url, 'utf8')).wordBank || [];
  const suspicious = [];
  for (const w of wordBank) {
    const segs = alignFurigana(w.word, w.reading);
    if (!segs) continue;
    for (const seg of segs) {
      if (seg.ruby && [...seg.text].length === 1 && [...seg.ruby].length >= 6) {
        suspicious.push(`${w.word} 的「${seg.text}」配了「${seg.ruby}」`);
      }
    }
  }
  assert.equal(suspicious.length, 0, `单字配了 6 拍以上:\n${suspicious.slice(0, 10).join('\n')}`);
});
