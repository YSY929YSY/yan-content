// 词场句的逐词中文是运行时派生数据，不写入内容包。

const GRAMMAR = {
  '、': '、', '。': '。', '？': '？', '！': '！',
  は: '（主题）', が: '（主语）', を: '（宾语）', に: '（向/于）',
  へ: '（方向）', で: '（在/用）', と: '（和/与）', の: '（的）',
  も: '（也）', から: '（从）', まで: '（到）', や: '（和）',
  より: '（比）', ね: '（确认）', よ: '（强调）', か: '（疑问）',
  です: '（是）', ます: '（礼貌）', ました: '（过去）',
  ません: '（否定）', でした: '（过去·是）',
  します: '（做·礼貌）',
  ください: '（请）', 下さい: '（请）',
};

// Sudachi 的辞书形没有随 token 一起带到运行时；这些是样板句里明确可识别的活用碎片。
// 它们故意留空，不把词干误当成一个独立词。
const INFLECTION_FRAGMENTS = ['買い', '食べ', '行き', '待ち', '出し', '入れ', '見せ', '探し', '払い', '会い', '読み', 'あり', 'しまし'];

const isKana = (value) => /[ぁ-ゖァ-ヺー]/.test(value);

/** 只取第一个义项。分号分义项,逗号分同义词 —— 后者不拆。 */
const firstSense = (value) => String(value || '').split(/[;；]/)[0].trim();

const candidatesOf = (wordBank) => {
  const seen = new Set();
  const out = [];
  for (const word of Array.isArray(wordBank) ? wordBank : []) {
    const values = [word?.word, word?.reading];
    for (const surface of values) {
      if (!surface || seen.has(surface) || GRAMMAR[surface]) continue;
      seen.add(surface);
      // 对齐行是**辅助行**,不能喧宾夺主(SOUL.md 视觉身份规则)。
      // 词典释义常带多个义项 ——「袋 → 袋子；（橘子等的）瓤」,
      // 「橘子等的瓤」出现在便利店句子的对齐行里纯属干扰。
      // 只取第一个义项:分号是义项分隔,逗号是同义并列(「早上，早晨」要整段留)。
      out.push({ surface, zh: firstSense(word.meaning_zh), source: 'wordBank' });
    }
  }
  return out.sort((a, b) => b.surface.length - a.surface.length);
};

const nextKnownBoundary = (sentence, start, candidates) => {
  const boundaries = [];
  for (const token of Object.keys(GRAMMAR)) {
    const index = sentence.indexOf(token, start);
    if (index > start) boundaries.push(index);
  }
  for (const candidate of candidates) {
    const index = sentence.indexOf(candidate.surface, start);
    if (index > start) boundaries.push(index);
  }
  return boundaries.length ? Math.min(...boundaries) : sentence.length;
};

/**
 * Greedy, fail-closed alignment for the twenty word-field sample sentences.
 * Unknown inflection fragments remain blank; no meaning is invented here.
 */
export function buildWordFieldAlignment(sentence, wordBank) {
  const text = String(sentence || '');
  const candidates = candidatesOf(wordBank);
  const out = [];
  let cursor = 0;

  while (cursor < text.length) {
    const grammar = Object.keys(GRAMMAR)
      .filter(token => text.startsWith(token, cursor))
      .sort((a, b) => b.length - a.length)[0];
    if (grammar) {
      out.push({ jp: grammar, zh: GRAMMAR[grammar], source: 'grammar' });
      cursor += grammar.length;
      continue;
    }

    const inflection = INFLECTION_FRAGMENTS.find(fragment => text.startsWith(fragment, cursor));
    if (inflection) {
      out.push({ jp: inflection, zh: '', source: 'blank', blankKind: '活用碎片' });
      cursor += inflection.length;
      continue;
    }

    const word = candidates.find(candidate => text.startsWith(candidate.surface, cursor));
    if (word) {
      out.push({ jp: word.surface, zh: word.zh, source: 'wordBank' });
      cursor += word.surface.length;
      continue;
    }

    const end = nextKnownBoundary(text, cursor, candidates);
    const jp = text.slice(cursor, end || cursor + 1);
    out.push({
      jp,
      zh: '',
      source: 'blank',
      blankKind: isKana(jp) ? '活用碎片' : '表记差异',
    });
    cursor += jp.length || 1;
  }

  return out;
}

export function summarizeWordFieldAlignment(rows) {
  const tokens = (rows || []).flat();
  const filled = tokens.filter(token => token.zh && token.source !== 'grammar').length
    + tokens.filter(token => token.zh && token.source === 'grammar').length;
  const blanks = tokens.filter(token => !token.zh);
  const blankKinds = blanks.reduce((out, token) => {
    const kind = token.blankKind || '未分类';
    out[kind] = (out[kind] || 0) + 1;
    return out;
  }, {});
  return { total: tokens.length, filled, blank: blanks.length, blankKinds };
}

export const wordFieldGrammar = GRAMMAR;
