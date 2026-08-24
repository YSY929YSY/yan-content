// 例句分词产物的测试。
//
// 这里守的和别处不太一样:被测的一半是**离线脚本生成的数据文件**。
// 数据和代码是分开演进的 —— 脚本改了、词库换了、有人手改了那个 JSON,
// 代码这边什么都不会知道。所以最重要的几条是拿产物对着真实词库逐条核。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeTokens, tokensMatch } from '../../features/wordbank/exampleTokens.ts';
import { alignFurigana } from '../../features/wordbank/furigana.ts';

const load = (rel) =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));

// ── 整形 ─────────────────────────────────────────────────────

test('两种形状都认', () => {
  assert.deepEqual(normalizeTokens(['きのこ', ['美味しい', 'おいしい']]), [
    { text: 'きのこ' },
    { text: '美味しい', reading: 'おいしい' },
  ]);
});

test('三元紧凑形状读取辞书形,且不接受重复的辞书形', () => {
  assert.deepEqual(normalizeTokens([
    ['探し', 'さがし', '探す'],
    ['きのこ', 'きのこ', 'きのこ'],
  ]), [
    { text: '探し', reading: 'さがし', dictionaryForm: '探す' },
    { text: 'きのこ', reading: 'きのこ' },
  ]);
});

test('★ 什么脏东西都不能炸 —— 这份 JSON 是脚本生成的,脚本还会再改', () => {
  assert.deepEqual(normalizeTokens(null), []);
  assert.deepEqual(normalizeTokens('不是数组'), []);
  assert.deepEqual(normalizeTokens(42), []);
  assert.deepEqual(normalizeTokens([]), []);
  // 坏项丢掉,好项留下 —— 丢一个词好过整句渲染不出来
  assert.deepEqual(normalizeTokens(['あ', null, 42, [], ['い', 'い'], ['う']]), [
    { text: 'あ' }, { text: 'い', reading: 'い' }, { text: 'う' },
  ]);
  // 空字符串不算一个词
  assert.deepEqual(normalizeTokens(['', ['', 'x']]), []);
});

test('★ 拼不回原句就是拼不回,不许放过', () => {
  const t = normalizeTokens([['行き', 'いき'], 'ます', '。']);
  assert.equal(tokensMatch(t, '行きます。'), true);
  assert.equal(tokensMatch(t, '行きました。'), false, '少了字必须报 false');
  assert.equal(tokensMatch(t, '行きます'), false, '标点也算');
  assert.equal(tokensMatch([], '行きます。'), false, '空的不算对上');
});

// ── 拿真实产物对着真实词库核 ─────────────────────────────────

test('★★ 回归:每一句分词拼回去都必须逐字等于 exampleJp', () => {
  // 分词器吞字、改字、规范化标点都**不报错**,只会让例句在屏幕上少一个字,
  // 而日语句子少一个假名可能就是另一个意思。这条是整个管线的总闸。
  const tokens = load('../../../assets/example_tokens.json');
  const bank = load('../../../assets/content.fallback.json').wordBank || [];
  const byId = new Map(bank.map((w) => [w.id, w]));

  let checked = 0;
  const bad = [];
  for (const [id, raw] of Object.entries(tokens)) {
    const w = byId.get(id);
    assert.ok(w, `产物里的 ${id} 在词库里找不到 —— 两份数据对不上了`);
    checked += 1;
    if (!tokensMatch(normalizeTokens(raw), w.exampleJp)) bad.push(id);
  }

  assert.equal(bad.length, 0, `${bad.length} 句拼不回原句:${bad.slice(0, 10).join(' ')}`);
  // 字面量下界:掉下来说明产物没跟着词库重跑
  assert.ok(checked >= 4300, `产物只有 ${checked} 句,实测应为 4400`);
});

test('★ 回归:有例句的词条都该有分词,反过来也是', () => {
  const tokens = load('../../../assets/example_tokens.json');
  const bank = load('../../../assets/content.fallback.json').wordBank || [];
  const withEx = bank.filter((w) => (w.exampleJp || '').trim());
  // 4400 条有例句(实测),产物应当一一对应
  assert.equal(withEx.length, 4400, `有例句的词条 ${withEx.length} 条,实测应为 4400`);
  const missing = withEx.filter((w) => !tokens[w.id]);
  assert.equal(missing.length, 0, `${missing.length} 条有例句却没分词`);
});

test('★ 回归:含汉字的 token 绝大多数能对齐 —— 对不上的只该是全角数字那一类', () => {
  const tokens = load('../../../assets/example_tokens.json');
  const needsRuby = (s) => /[一-龿㐀-䶿々ヶ]/.test(s);

  let kanji = 0, aligned = 0;
  const failed = [];
  for (const raw of Object.values(tokens)) {
    for (const t of normalizeTokens(raw)) {
      if (!needsRuby(t.text)) continue;
      kanji += 1;
      if (t.reading && alignFurigana(t.text, t.reading)) aligned += 1;
      else if (failed.length < 12) failed.push(`${t.text}/${t.reading}`);
    }
  }

  // 字面量。实测 12247 个含汉字 token,12237 个对得上(99.92%)。
  assert.ok(kanji >= 12000, `含汉字 token 只有 ${kanji},实测应为 12247`);
  assert.ok(aligned >= 12200, `只对上 ${aligned} / ${kanji}。失败样本:${failed.join(' ')}`);
  // 而且不能全对 —— 已知那 10 个全角数字对不上,全对说明对齐在瞎给
  assert.ok(aligned < kanji, '一个都不失败反而可疑,已知有 10 个全角数字量词对不上');
});

test('★ 回归:真实产物含辞书形,且第三项只在词面不同的时候出现', () => {
  const tokens = load('../../../assets/example_tokens.json');
  const triples = Object.values(tokens).flat().filter((t) => Array.isArray(t) && t.length === 3);
  assert.ok(triples.length >= 5000, `辞书形三元 token 只有 ${triples.length}`);
  assert.ok(triples.every((t) => t[2] !== t[0]), '不应存和词面相同的辞书形');
  assert.deepEqual(
    normalizeTokens(tokens.n5_au).find((t) => t.text === '会い'),
    { text: '会い', reading: 'あい', dictionaryForm: '会う' },
  );
});
