import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildWordFieldAlignment, dictionaryFormsFrom, wordFieldGrammar } from '../wordFieldAlignment.js';

const load = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));

test('真实例句 asset 仍是三元格式且能生成辞书形索引', () => {
  const forms = dictionaryFormsFrom(load('../../../../assets/example_tokens.json'));
  assert.ok(forms instanceof Map);
  assert.ok(forms.size >= 1000, `辞书形 surface 只有 ${forms.size} 条`);
  assert.ok(forms.get('探し')?.has('探す'), '探し → 探す 必须存在');
});

test('词场逐词中文优先查词库并固定识别语法成分', () => {
  const rows = buildWordFieldAlignment('レシートをください。', [
    { word: 'レシート', reading: 'れしーと', meaning_zh: '小票' },
  ]);
  assert.deepEqual(rows.map(row => row.jp), ['レシート', 'を', 'ください', '。']);
  assert.deepEqual(rows.map(row => row.zh), ['小票', '（宾语）', '（请）', '。']);
});

test('读音命中表记差异，查不到的活用片段留空', () => {
  const rows = buildWordFieldAlignment('買いました。', [
    { word: '買う', reading: 'かう', meaning_zh: '买' },
  ]);
  assert.equal(rows.find(row => row.jp === 'ました').zh, '（过去）');
  assert.equal(rows.find(row => row.source === 'blank').zh, '');
  assert.equal(wordFieldGrammar['を'], '（宾语）');
});

test('辞书形命中活用词干,而真正歧义的辞书形留空', () => {
  const dictionaryForms = new Map([
    ['探し', new Set(['探す'])],
    ['行っ', new Set(['行く', '行う'])],
  ]);
  const bank = [
    { word: '探す', reading: 'さがす', meaning_zh: '找' },
    { word: '行く', reading: 'いく', meaning_zh: '去' },
    { word: '行う', reading: 'おこなう', meaning_zh: '进行' },
  ];
  const rows = buildWordFieldAlignment('探します。', bank, dictionaryForms);
  assert.equal(rows.find(row => row.jp === '探し').zh, '找');

  const ambiguous = buildWordFieldAlignment('行った。', bank, dictionaryForms);
  assert.equal(ambiguous.some(row => row.jp.startsWith('行') && row.zh), false);
});

test('语法表按最长项优先覆盖稳定的助动词组合', () => {
  const rows = buildWordFieldAlignment('だろうんだられるうょう。', []);
  assert.deepEqual(rows.map(row => row.jp), ['だろう', 'んだ', 'られる', 'う', 'ょう', '。']);
  assert.deepEqual(rows.slice(0, 5).map(row => row.zh), ['（推测）', '（说明）', '（被动/可能）', '（意志）', '（意志）']);
});

test('全角数字作为数字 token 转成半角 gloss', () => {
  const rows = buildWordFieldAlignment('２０２６年。', [
    { word: '年', reading: 'ねん', meaning_zh: '年' },
  ]);
  assert.deepEqual(rows.map(row => [row.jp, row.zh]), [
    ['２０２６', '2026'],
    ['年', '年'],
    ['。', '。'],
  ]);
});

test('方案 a: 单字候选只有在当前 EXAMPLE_TOKENS 独立成 span 时才参与命中', () => {
  const bank = [
    { word: '超', reading: 'ちょう', meaning_zh: '超' },
    { word: '超える', reading: 'こえる', meaning_zh: '超过' },
    { word: 'え', reading: 'え', meaning_zh: '画' },
  ];
  const forms = new Map([['超え', new Set(['超える'])]]);
  const tokens = [['超え', 'こえ', '超える'], 'て', 'いる', '。'];
  const rows = buildWordFieldAlignment('超えている。', bank, forms, tokens);
  assert.deepEqual(rows.map(row => row.jp), ['超え', 'ている', '。']);
  assert.equal(rows[0].zh, '超过');
  assert.equal(rows.some(row => row.jp === 'え'), false, '超え 内部的な一文字候选不应抢先命中');
});

test('★★ 20 条真实词场句的动词活用位置都有中文', () => {
  const content = load('../../../../assets/content.fallback.json');
  const rawTokens = load('../../../../assets/example_tokens.json');
  const dictionaryForms = new Map();
  for (const tokens of Object.values(rawTokens)) {
    for (const token of tokens) {
      if (!Array.isArray(token) || typeof token[0] !== 'string' || typeof token[2] !== 'string' || !token[2]) continue;
      const forms = dictionaryForms.get(token[0]) || new Set();
      forms.add(token[2]);
      dictionaryForms.set(token[0], forms);
    }
  }

  const fields = [];
  for (const word of content.wordBank || []) {
    const wordFields = Array.isArray(word.wordField) ? word.wordField : (word.wordField ? [word.wordField] : []);
    for (const field of wordFields) {
      if (field?.sentence?.jp && !field.source) fields.push(field.sentence.jp);
    }
  }
  assert.equal(fields.length, 20);

  const holes = [];
  for (const sentence of fields) {
    for (const row of buildWordFieldAlignment(sentence, content.wordBank, dictionaryForms)) {
      if (!row.zh && /[ぁ-ゖァ-ヺー]/.test(row.jp)) holes.push(`${sentence}: ${row.jp}`);
    }
  }
  assert.deepEqual(holes, []);
});

test('★★ Tatoeba 词场 gloss 基线不得跌破 95%', () => {
  const content = load('../../../../assets/content.fallback.json');
  const rawTokens = load('../../../../assets/example_tokens.json');
  const dictionaryForms = dictionaryFormsFrom(rawTokens);
  const punctuationOnly = /^[\s、。？！？，．.!?,:：;；「」『』（）()［］【】〔〕〈〉《》…・~〜]+$/u;
  const fields = (content.wordBank || [])
    .filter(word => word.wordField?.source?.provider === 'Tatoeba')
    .map(word => word.wordField.sentence.jp);
  assert.equal(fields.length, 180);

  let total = 0;
  let covered = 0;
  for (const sentence of fields) {
    const rows = buildWordFieldAlignment(sentence, content.wordBank, dictionaryForms);
    for (const row of rows) {
      if (punctuationOnly.test(row.jp)) continue;
      total += 1;
      if (row.zh?.trim()) covered += 1;
    }
  }
  const coverage = covered / total;
  assert.ok(coverage >= 0.95, `Tatoeba gloss coverage ${covered}/${total} = ${(coverage * 100).toFixed(2)}% < 95%`);
});

test('对齐行只显示第一个完整 gloss，不截断词义', () => {
  const content = load('../../../../assets/content.fallback.json');
  const cases = [
    ['カード', '积分卡'],
    ['見せる', '给……看'],
    ['袋', '袋子'],
    ['現金', '现金'],
    ['聞く', '听'],
    ['料理', '料理'],
    ['果物', '水果'],
    ['大好き', '非常喜欢'],
    ['雨', '雨'],
    ['出かける', '出门'],
  ];

  for (const [word, expected] of cases) {
    const row = buildWordFieldAlignment(`${word}。`, content.wordBank)
      .find(token => token.jp === word && token.source === 'wordBank');
    assert.ok(row, `${word} 应该能在真实词库中命中`);
    assert.equal(row.zh, expected, `${word} 的对齐提示应为第一个完整 gloss`);
    assert.doesNotMatch(row.zh, /[，、,／/]/, `${word} 不应带后续并列释义`);
    assert.doesNotMatch(row.zh, /…$|\.\.\.$/, `${word} 不应以省略号截断`);
  }
});
