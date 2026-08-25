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
    for (const field of wordFields) if (field?.sentence?.jp) fields.push(field.sentence.jp);
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
