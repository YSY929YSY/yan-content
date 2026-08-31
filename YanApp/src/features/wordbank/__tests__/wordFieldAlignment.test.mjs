import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { fieldMemberTerms, isFieldMemberToken } from '../fieldMemberMatching.js';
import { buildWordFieldAlignment, dictionaryFormsFrom, firstGloss, wordFieldGrammar } from '../wordFieldAlignment.js';

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
  assert.deepEqual(rows.map(row => row.zh), ['小票', '（宾语）', '（请）', '']);
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
    ['。', ''],
  ]);
});

test('标点保留对齐列但不产生无信息的注解', () => {
  const rows = buildWordFieldAlignment('聞きます。', [
    { word: '聞く', reading: 'きく', meaning_zh: '听' },
  ], new Map([['聞き', new Set(['聞く'])]]));
  const punctuation = rows.filter(row => /^[、。？！]$/u.test(row.jp));
  assert.deepEqual(punctuation.map(row => row.zh), ['']);
  assert.equal(rows.map(row => row.jp).join(''), '聞きます。');
});

test('单假名永不作为 wordBank token 消费，单汉字仍可命中', () => {
  const bank = [
    { word: '超', reading: 'ちょう', meaning_zh: '超' },
    { word: '超える', reading: 'こえる', meaning_zh: '超过' },
    { word: 'え', reading: 'え', meaning_zh: '画' },
    { word: '照る', reading: 'てる', meaning_zh: '照耀' },
  ];
  const forms = new Map([['超え', new Set(['超える'])]]);
  const rows = buildWordFieldAlignment('超えている。', bank, forms, [['超え', 'こえ', '超える'], 'て', 'いる', '。']);
  assert.deepEqual(rows.map(row => row.jp), ['超え', 'ている', '。']);
  assert.equal(rows[0].zh, '超过');
  assert.equal(rows.some(row => row.jp === 'え'), false, '超え 内部的な一文字候选不应抢先命中');

  const standaloneKana = buildWordFieldAlignment('て。', bank, new Map([['て', new Set(['照る'])]]));
  assert.equal(standaloneKana.some(row => row.source === 'wordBank'), false);
  assert.equal(standaloneKana.find(row => row.jp === 'て')?.zh, '');

  const kanji = buildWordFieldAlignment('超。', bank);
  assert.equal(kanji.find(row => row.jp === '超')?.zh, '超');
});

test('F-3: 跨 word 与 reading 取最长消费表面，同长度保持 word 优先', () => {
  const bank = [
    { word: 'たべ', reading: 'たべ', meaning_zh: '吃' },
    { word: '食べ物', reading: 'たべもの', meaning_zh: '食物' },
  ];
  const rows = buildWordFieldAlignment('たべもの。', bank);
  assert.deepEqual(rows.map(row => row.jp), ['たべもの', '。']);
  assert.equal(rows[0].zh, '食物');

  const tie = buildWordFieldAlignment('たべ。', bank);
  assert.equal(tie.find(row => row.jp === 'たべ')?.zh, '吃');

  const duplicateSurface = buildWordFieldAlignment('たべ。', [
    { word: '食べ', reading: 'たべ', meaning_zh: '读音候选' },
    { word: 'たべ', reading: 'タベ', meaning_zh: '表记候选' },
  ]);
  assert.equal(duplicateSurface.find(row => row.jp === 'たべ')?.zh, '表记候选');
});

test('F-4: 更长 wordBank 命中让位于同位置的 GRAMMAR token', () => {
  const rows = buildWordFieldAlignment('とてもだれか。', [
    { word: 'とても', reading: 'とても', meaning_zh: '非常' },
    { word: 'だれか', reading: 'だれか', meaning_zh: '某人' },
  ]);
  assert.deepEqual(rows.map(row => row.jp), ['とても', 'だれか', '。']);
  assert.deepEqual(rows.map(row => row.source), ['wordBank', 'wordBank', 'grammar']);
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

test('★★ Tatoeba 词场 gloss 覆盖率守住修复后下限且单假名 wordBank 命中为零', () => {
  const content = load('../../../../assets/content.fallback.json');
  const rawTokens = load('../../../../assets/example_tokens.json');
  const dictionaryForms = dictionaryFormsFrom(rawTokens);
  const punctuationOnly = /^[\s、。？！？，．.!?,:：;；「」『』（）()［］【】〔〕〈〉《》…・~〜]+$/u;
  const fields = (content.wordBank || [])
    .filter(word => word.wordField?.source?.provider === 'Tatoeba')
    .map(word => word.wordField.sentence.jp);
  // ZH 54 内容窗口新增 27 条可追溯 Tatoeba 词场。
  assert.equal(fields.length, 256);

  let total = 0;
  let covered = 0;
  let singleKanaWordBankHits = 0;
  for (const sentence of fields) {
    const rows = buildWordFieldAlignment(sentence, content.wordBank, dictionaryForms);
    for (const row of rows) {
      if (punctuationOnly.test(row.jp)) continue;
      total += 1;
      if (row.zh?.trim()) covered += 1;
      if (row.source === 'wordBank' && /^[ぁ-ゖァ-ヺー]$/u.test(row.jp)) singleKanaWordBankHits += 1;
    }
  }
  const coverage = covered / total;
  assert.equal(singleKanaWordBankHits, 0, `单假名 wordBank 命中 ${singleKanaWordBankHits} 条`);
  // 修复后实测 92.34%；留 0.54 个百分点余量，既容纳小幅词库变动，也不会把
  // 覆盖率闸门放低到失去意义。
  assert.ok(coverage >= 0.918, `Tatoeba gloss coverage ${covered}/${total} = ${(coverage * 100).toFixed(2)}% < 91.80%`);
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

test('firstGloss 保留括号内的分隔符，再截断括号外的后续义项', () => {
  assert.equal(firstGloss('花费（时间、金钱）'), '花费（时间、金钱）');
  assert.equal(firstGloss('戴（帽子等，盖在头上）；穿'), '戴（帽子等，盖在头上）');
  assert.equal(firstGloss('（您/他的）夫人；太太'), '（您/他的）夫人');
  assert.equal(firstGloss('使用(time, money), usage'), '使用(time, money)');
});

test('全库 firstGloss 不留下未闭合的半角或全角括号', () => {
  const content = load('../../../../assets/content.fallback.json');
  const unclosed = [];
  for (const word of content.wordBank || []) {
    const gloss = firstGloss(word.meaning_zh);
    let depth = 0;
    let valid = true;
    for (const char of gloss) {
      if (char === '（' || char === '(') depth += 1;
      if (char === '）' || char === ')') {
        depth -= 1;
        if (depth < 0) valid = false;
      }
    }
    if (!valid || depth !== 0) unclosed.push(`${word.id}: ${gloss}`);
  }
  assert.deepEqual(unclosed, []);
});

test('全库词场成员都能在对齐行中找到，包括活用、复合 token 与多表记', () => {
  const content = load('../../../../assets/content.fallback.json');
  const rawTokens = load('../../../../assets/example_tokens.json');
  const dictionaryForms = dictionaryFormsFrom(rawTokens);
  const byId = new Map((content.wordBank || []).map(word => [word.id, word]));
  let slots = 0;
  const misses = [];
  const zeroSentences = [];

  for (const word of content.wordBank || []) {
    const fields = Array.isArray(word.wordField) ? word.wordField : (word.wordField ? [word.wordField] : []);
    for (const field of fields) {
      if (!field?.sentence?.jp) continue;
      const rows = buildWordFieldAlignment(field.sentence.jp, content.wordBank, dictionaryForms);
      let sentenceHits = 0;
      for (const member of field.members || []) {
        const memberWord = byId.get(member.id);
        if (!memberWord || member.id === word.id) continue;
        slots += 1;
        const memberTerms = fieldMemberTerms({ members: [member] }, id => byId.get(id));
        if (rows.some(row => isFieldMemberToken(row, memberTerms, dictionaryForms))) {
          sentenceHits += 1;
        } else {
          misses.push(`${word.id} / ${field.sentence.jp} / ${memberWord.word}`);
        }
      }
      if ((field.members || []).some(member => member.id !== word.id) && sentenceHits === 0) {
        zeroSentences.push(`${word.id} / ${field.sentence.jp}`);
      }
    }
  }

  // 内容窗口落入 27 个词场后，非 anchor 成员槽位从 370 增至 406。
  assert.equal(slots, 406);
  assert.deepEqual(misses, []);
  assert.deepEqual(zeroSentences, []);
});

test('全库词场对齐保持原句列数与顺序，标点列仍在', () => {
  const content = load('../../../../assets/content.fallback.json');
  const dictionaryForms = dictionaryFormsFrom(load('../../../../assets/example_tokens.json'));
  const fields = [];
  for (const word of content.wordBank || []) {
    const wordFields = Array.isArray(word.wordField) ? word.wordField : (word.wordField ? [word.wordField] : []);
    for (const field of wordFields) if (field?.sentence?.jp) fields.push(field.sentence.jp);
  }
  assert.equal(fields.length, 276);
  for (const sentence of fields) {
    const rows = buildWordFieldAlignment(sentence, content.wordBank, dictionaryForms);
    assert.equal(rows.length, rows.map(row => row.jp).length);
    assert.equal(rows.map(row => row.jp).join(''), sentence, `对齐列吞字或改字: ${sentence}`);
    assert.ok(rows.every(row => Object.hasOwn(row, 'zh')), `缺少注解槽位: ${sentence}`);
  }
});
