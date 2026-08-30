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
  られる: '（被动/可能）', れる: '（被动/可能）',
  だろう: '（推测）', だ: '（断定）',
  う: '（意志）', んだ: '（说明）', ん: '（说明）', ょう: '（意志）',
};

// 没有辞书形元数据的活用碎片仍然故意留空，不把词干误当成一个独立词。
const INFLECTION_FRAGMENTS = ['買い', '食べ', '行き', '待ち', '出し', '入れ', '見せ', '探し', '払い', '会い', '読み', 'あり', 'しまし'];

const isKana = (value) => /[ぁ-ゖァ-ヺー]/.test(value);
const isSingleChar = (value) => Array.from(value).length === 1;
const isSingleKana = (value) => isSingleChar(value) && isKana(value);
const toHalfWidth = (value) => value.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));

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
  const seen = new Map();
  const out = [];
  for (const word of Array.isArray(wordBank) ? wordBank : []) {
    const values = [word?.word, word?.reading];
    for (const surface of values) {
      if (!surface || GRAMMAR[surface]) continue;
      const priority = surface === word?.word ? 0 : 1;
      // 对齐行是**辅助行**,不能喧宾夺主(SOUL.md 视觉身份规则)。
      // 词典释义常带多个义项 ——「袋 → 袋子；（橘子等的）瓤」,
      // 「橘子等的瓤」出现在便利店句子的对齐行里纯属干扰。
      // 对齐行是提示,不承载完整定义；只显示第一个完整 gloss，不加省略号。
      const candidate = { surface, zh: firstGloss(word.meaning_zh), source: 'wordBank', priority };
      const existingIndex = seen.get(surface);
      if (existingIndex == null) {
        seen.set(surface, out.length);
        out.push(candidate);
      } else if (priority < out[existingIndex].priority) {
        out[existingIndex] = candidate;
      }
    }
  }
  return out.sort((a, b) => b.surface.length - a.surface.length);
};

const dictionaryCandidateAt = (sentence, start, candidates, dictionaryForms) => {
  if (!(dictionaryForms instanceof Map)) return null;
  const matches = [];
  for (const [surface, forms] of dictionaryForms) {
    if (typeof surface !== 'string' || !(forms instanceof Set) || !sentence.startsWith(surface, start)
      || isSingleKana(surface)) continue;
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
  return candidates
    // 单假名在这里拦截，而不是依赖候选生成时是否拿到了 EXAMPLE_TOKENS。
    .filter(candidate => !isSingleKana(candidate.surface) && sentence.startsWith(candidate.surface, start))
    .sort((a, b) => b.surface.length - a.surface.length || a.priority - b.priority)[0] || null;
};

const nextKnownBoundary = (sentence, start, candidates) => {
  const boundaries = [];
  for (const token of Object.keys(GRAMMAR)) {
    const index = sentence.indexOf(token, start);
    if (index > start) boundaries.push(index);
  }
  for (const candidate of candidates.filter(candidate => !isSingleKana(candidate.surface))) {
    const index = sentence.indexOf(candidate.surface, start);
    if (index > start) boundaries.push(index);
  }
  return boundaries.length ? Math.min(...boundaries) : sentence.length;
};

/**
 * Greedy, fail-closed alignment for the twenty word-field sample sentences.
 * Unknown inflection fragments remain blank; no meaning is invented here.
 */
export function buildWordFieldAlignment(sentence, wordBank, dictionaryForms, exampleTokens) {
  const text = String(sentence || '');
  const candidates = candidatesOf(wordBank);
  const out = [];
  let cursor = 0;

  while (cursor < text.length) {
    const grammar = Object.keys(GRAMMAR)
      .filter(token => text.startsWith(token, cursor))
      .sort((a, b) => b.length - a.length)[0];

    // 先找 wordBank 候选，再决定语法表是否能消费当前位置。
    // 更长的词库命中让语法 token 让位；若 reading-only 候选跨过语法边界、且
    // 边界后本身还能命中词库，则先保留语法，否则「はいくら」会被「俳句」reading
    // 吃成一个词。这样「と」不会遮住「とても」,「だ」不会遮住「だれか」；同长度
    // 继续保留 grammar 的稳定口径。
    const word = directCandidateAt(text, cursor, candidates);
    const dictionary = dictionaryCandidateAt(text, cursor, candidates, dictionaryForms);
    const bestWordBank = word && (!dictionary || word.surface.length >= dictionary.surface.length)
      ? { surface: word.surface, candidate: word, direct: true }
      : dictionary
        ? { surface: dictionary.surface, candidate: dictionary.candidate, direct: false }
        : null;
    const remainderAfterGrammar = grammar && bestWordBank && bestWordBank.surface.startsWith(grammar)
      && bestWordBank.surface.length > grammar.length
      ? text.slice(cursor + grammar.length)
      : '';
    const grammarBoundaryIsKnown = remainderAfterGrammar
      && (directCandidateAt(text, cursor + grammar.length, candidates)
        || dictionaryCandidateAt(text, cursor + grammar.length, candidates, dictionaryForms));
    const grammarIsNotShorter = !grammar || !bestWordBank
      || Math.max(bestWordBank.surface.length, grammar.length) === grammar.length;
    if (grammar && (grammarIsNotShorter || grammarBoundaryIsKnown)) {
      out.push({ jp: grammar, zh: GRAMMAR[grammar], source: 'grammar' });
      cursor += grammar.length;
      continue;
    }

    const number = text.slice(cursor).match(/^[0-9０-９]+/u)?.[0];
    if (number) {
      out.push({ jp: number, zh: toHalfWidth(number), source: 'grammar' });
      cursor += number.length;
      continue;
    }

    // 命中顺序：跨 word / reading / 辞书形取最长的消费表面；同长度仍是
    // word → reading → 辞书形。最后一级用离线 token 的第三项把「探し」还原到「探す」。
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
