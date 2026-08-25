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

// 没有辞书形元数据的活用碎片仍然故意留空，不把词干误当成一个独立词。
const INFLECTION_FRAGMENTS = ['買い', '食べ', '行き', '待ち', '出し', '入れ', '見せ', '探し', '払い', '会い', '読み', 'あり', 'しまし'];

const isKana = (value) => /[ぁ-ゖァ-ヺー]/.test(value);

/** 只取第一个义项，再取第一个 gloss 分隔符前的完整词义。 */
const firstGloss = (value) => String(value || '')
  .split(/[;；]/)[0]
  .split(/[，、,／/]/)[0]
  .trim();

// 词场句没有自己的 id；它们借用例句管线产出的 surface → dictionary form
// 索引。输入由调用方注入，避免这个纯函数模块偷偷加载 asset。
export function dictionaryFormsFrom(exampleTokens) {
  const bySurface = new Map();
  if (!exampleTokens || typeof exampleTokens !== 'object' || Array.isArray(exampleTokens)) return bySurface;
  for (const tokens of Object.values(exampleTokens)) {
    for (const token of Array.isArray(tokens) ? tokens : []) {
      if (!Array.isArray(token) || typeof token[0] !== 'string' || !token[0]
        || typeof token[2] !== 'string' || !token[2] || token[2] === token[0]) continue;
      const forms = bySurface.get(token[0]) || new Set();
      forms.add(token[2]);
      bySurface.set(token[0], forms);
    }
  }
  return bySurface;
}

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
      // 对齐行是提示,不承载完整定义；只显示第一个完整 gloss，不加省略号。
      out.push({ surface, zh: firstGloss(word.meaning_zh), source: 'wordBank', priority: surface === word?.word ? 0 : 1 });
    }
  }
  return out.sort((a, b) => b.surface.length - a.surface.length);
};

const dictionaryCandidateAt = (sentence, start, candidates, dictionaryForms) => {
  if (!(dictionaryForms instanceof Map)) return null;
  const matches = [];
  for (const [surface, forms] of dictionaryForms) {
    if (typeof surface !== 'string' || !(forms instanceof Set) || !sentence.startsWith(surface, start)) continue;
    const dictionaryCandidates = candidates.filter(candidate => forms.has(candidate.surface));
    // 同一个活用表面可能对应多个辞书形（例如「行っ」），这种情况不猜。
    if (dictionaryCandidates.length === 1) {
      matches.push({ surface, candidate: dictionaryCandidates[0] });
    }
  }
  matches.sort((a, b) => b.surface.length - a.surface.length);
  return matches[0] || null;
};

const directCandidateAt = (sentence, start, candidates) => {
  for (const priority of [0, 1]) {
    const matches = candidates
      .filter(candidate => candidate.priority === priority && sentence.startsWith(candidate.surface, start))
      .sort((a, b) => b.surface.length - a.surface.length);
    if (matches.length) return matches[0];
  }
  return null;
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
export function buildWordFieldAlignment(sentence, wordBank, dictionaryForms) {
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

    // 命中顺序：词面 → reading → 辞书形。前两级仍由 candidates 的
    // word/reading 别名完成；最后一级用离线 token 的第三项把「探し」还原到「探す」。
    // 候选之间取最长的完整表面，避免词库里的短词「你」先吃掉「你们」一类
    // 活用 token；同长度时仍保持上面的命中顺序。
    const word = directCandidateAt(text, cursor, candidates);
    const dictionary = dictionaryCandidateAt(text, cursor, candidates, dictionaryForms);
    if (word && (!dictionary || word.surface.length >= dictionary.surface.length)) {
      out.push({ jp: word.surface, zh: word.zh, source: 'wordBank' });
      cursor += word.surface.length;
      continue;
    }
    if (dictionary) {
      out.push({ jp: dictionary.surface, zh: dictionary.candidate.zh, source: 'wordBank' });
      cursor += dictionary.surface.length;
      continue;
    }

    const inflection = INFLECTION_FRAGMENTS.find(fragment => text.startsWith(fragment, cursor));
    if (inflection) {
      out.push({ jp: inflection, zh: '', source: 'blank', blankKind: '活用碎片' });
      cursor += inflection.length;
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
