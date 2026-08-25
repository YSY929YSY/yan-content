import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));

const content = readJson('assets/content.fallback.json');
const exampleTokens = readJson('assets/example_tokens.json');
const alignmentSource = fs.readFileSync(
  path.join(root, 'src/features/wordbank/wordFieldAlignment.js'),
  'utf8',
);
const alignment = await import(`data:text/javascript,${encodeURIComponent(alignmentSource)}`);
const { buildWordFieldAlignment, dictionaryFormsFrom } = alignment;

const wordBank = Array.isArray(content.wordBank) ? content.wordBank : [];
const entries = wordBank.filter((word) => typeof word?.exampleJp === 'string' && word.exampleJp.trim());
const dictionaryForms = dictionaryFormsFrom(exampleTokens);
const punctuationOnly = /^[\s、。？！？，．.!?,:：;；「」『』（）()［］【】〔〕〈〉《》…・~〜]+$/u;
const isPunctuation = (token) => punctuationOnly.test(String(token?.jp || ''));
const filled = (token) => typeof token?.zh === 'string' && token.zh.trim().length > 0;
const isHiragana = (value) => /^[ぁ-ゖ]+$/u.test(value);
const isKatakana = (value) => /^[ァ-ヺー]+$/u.test(value);
const isNumber = (value) => /^[0-9０-９]+$/u.test(value);
const lexiconSurfaces = new Set(wordBank.flatMap((word) => [word?.word, word?.reading]
  .filter((surface) => typeof surface === 'string' && surface)));
const surfacesFromSudachi = (tokens) => (Array.isArray(tokens) ? tokens : [])
  .map((token) => Array.isArray(token) ? token[0] : token)
  .filter((surface) => typeof surface === 'string');
const sameArray = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);

const tokenSpans = (tokens) => {
  let cursor = 0;
  return surfacesFromSudachi(tokens).map((surface) => {
    const span = { surface, start: cursor, end: cursor + surface.length };
    cursor += surface.length;
    return span;
  });
};

// Runtime blankKind only describes the shape of a blank. This report uses the
// sentence's Sudachi spans to separate grammar/inflection tails, split tokens,
// proper names/loanwords/numbers, and genuine missing vocabulary.
const measuredBlankCause = (positionedToken, spans) => {
  if (isHiragana(positionedToken.jp)) return '语法/活用尾';
  if (lexiconSurfaces.has(positionedToken.jp)) return '分词切碎';
  const containingSpans = spans.filter((span) => positionedToken.start >= span.start
    && positionedToken.end <= span.end
    && (lexiconSurfaces.has(span.surface) || lexiconSurfaces.has(span.dictionaryForm)));
  if (containingSpans.length) return '分词切碎';
  if (isKatakana(positionedToken.jp) || isNumber(positionedToken.jp)) return '专名/外来语';
  return '真·缺词';
};

const records = entries.map((entry) => {
  const rows = buildWordFieldAlignment(entry.exampleJp, wordBank, dictionaryForms, exampleTokens[entry.id]);
  const comparableRows = rows.filter((token) => !isPunctuation(token));
  const filledRows = comparableRows.filter(filled);
  const coverage = comparableRows.length ? filledRows.length / comparableRows.length : 1;
  const sudachiTokens = Array.isArray(exampleTokens[entry.id]) ? exampleTokens[entry.id] : [];
  const sudachiSurfaces = surfacesFromSudachi(sudachiTokens);
  const spans = tokenSpans(sudachiTokens).map((span, index) => ({
    ...span,
    dictionaryForm: Array.isArray(sudachiTokens[index]) ? sudachiTokens[index][2] : null,
  }));
  const greedySurfaces = rows.map((token) => token.jp);
  let cursor = 0;
  const positionedRows = rows.map((token) => {
    const positioned = { ...token, start: cursor, end: cursor + token.jp.length };
    cursor += token.jp.length;
    return positioned;
  });
  const blanks = positionedRows.filter((token) => !filled(token));
  const blankDetails = blanks.map((token) => ({ token, cause: measuredBlankCause(token, spans) }));
  return {
    entry,
    rows,
    coverage,
    reconstructs: rows.map((token) => token.jp).join('') === entry.exampleJp,
    hasSudachiTokens: Array.isArray(exampleTokens[entry.id]),
    differsFromSudachi: Array.isArray(exampleTokens[entry.id]) && !sameArray(greedySurfaces, sudachiSurfaces),
    blanks,
    blankDetails,
  };
});

const percentage = (value) => `${(value * 100).toFixed(2)}%`;
const totalTokens = records.reduce((sum, record) => sum + record.rows.filter((token) => !isPunctuation(token)).length, 0);
const coveredTokens = records.reduce((sum, record) => sum + record.rows.filter((token) => !isPunctuation(token) && filled(token)).length, 0);
const fullCoverage = records.filter((record) => record.coverage === 1).length;
const bucket = (record) => {
  if (record.coverage === 1) return '100%';
  if (record.coverage >= 0.9) return '90-99%';
  if (record.coverage >= 0.7) return '70-89%';
  return '<70%';
};
const buckets = Object.fromEntries(['100%', '90-99%', '70-89%', '<70%'].map((name) => [
  name,
  records.filter((record) => bucket(record) === name).length,
]));

const blankCounts = Object.fromEntries(['语法/活用尾', '分词切碎', '专名/外来语', '真·缺词'].map((name) => [name, 0]));
for (const record of records) {
  for (const detail of record.blankDetails) blankCounts[detail.cause] += 1;
}
const blankTotal = Object.values(blankCounts).reduce((sum, count) => sum + count, 0);
const trueMissingSurfaces = new Map();
for (const record of records) {
  for (const detail of record.blankDetails) {
    if (detail.cause !== '真·缺词') continue;
    const surface = detail.token.jp;
    trueMissingSurfaces.set(surface, (trueMissingSurfaces.get(surface) || 0) + 1);
  }
}
const trueMissingList = [...trueMissingSurfaces.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const comparableSudachi = records.filter((record) => record.hasSudachiTokens).length;
const sudachiDifferences = records.filter((record) => record.differsFromSudachi).length;
const allGlossedTokens = records.flatMap((record) => record.rows.filter(filled));
const allNonPunctuationGlossedTokens = allGlossedTokens.filter((token) => !isPunctuation(token));
const wordBankGlossedTokens = allGlossedTokens.filter((token) => token.source === 'wordBank');
const singleCharGlossedTokens = allGlossedTokens.filter((token) => token.jp.length === 1);
const singleCharNonPunctuationGlossedTokens = allNonPunctuationGlossedTokens.filter((token) => token.jp.length === 1);
const singleCharWordBankGlossedTokens = wordBankGlossedTokens.filter((token) => token.jp.length === 1);

// Stable pseudo-random order: the sample is reproducible without writing a seed file.
const hash = (value) => {
  let state = 2166136261;
  for (const char of value) {
    state ^= char.codePointAt(0);
    state = Math.imul(state, 16777619);
  }
  return state >>> 0;
};
const randomSample = [...records].sort((a, b) => hash(a.entry.id) - hash(b.entry.id)).slice(0, 15);
const lowestSample = [...records]
  .sort((a, b) => a.coverage - b.coverage || a.entry.id.localeCompare(b.entry.id))
  .slice(0, 5);
const singleCharSentenceSample = [...records]
  .filter((record) => record.rows.some((token) => token.source === 'wordBank' && token.jp.length === 1 && filled(token)))
  .sort((a, b) => hash(a.entry.id) - hash(b.entry.id))
  .slice(0, 30);

const tokenDisplay = (record) => record.rows
  .map((token) => `${token.jp}→${filled(token) ? token.zh : '∅'}`)
  .join(' | ');
const printSample = (title, sample) => {
  console.log(`\n## ${title}`);
  for (const record of sample) {
    const blanks = record.blankDetails.map(({ token, cause }) => `${token.jp}（${cause}）`).join('、') || '无';
    console.log(`- ${record.entry.id} | ${record.entry.exampleJp}`);
    console.log(`  tokens: ${tokenDisplay(record)}`);
    console.log(`  coverage: ${percentage(record.coverage)} | blanks: ${blanks}`);
  }
};
const printSingleCharSample = () => {
  console.log('\n## Single-character wordBank gloss hits (30 sentences)');
  for (const record of singleCharSentenceSample) {
    const hits = record.rows
      .filter((token) => token.source === 'wordBank' && token.jp.length === 1 && filled(token))
      .map((token) => `${token.jp}→${token.zh}`)
      .join(' | ');
    console.log(`- ${record.entry.id} | ${record.entry.exampleJp}`);
    console.log(`  single-char wordBank hits: ${hits}`);
    console.log(`  tokens: ${tokenDisplay(record)}`);
  }
};

console.log('# Gloss coverage assessment');
console.log(`wordBank entries with examples: ${records.length}`);
console.log(`reconstruction usable: ${records.filter((record) => record.reconstructs).length}/${records.length} (${percentage(records.filter((record) => record.reconstructs).length / records.length)})`);
console.log(`gloss coverage (non-punctuation tokens): ${coveredTokens}/${totalTokens} (${percentage(coveredTokens / totalTokens)})`);
console.log(`fully covered sentences: ${fullCoverage}/${records.length}`);
console.log(`coverage buckets: ${JSON.stringify(buckets)}`);
console.log(`blank causes (all blank tokens: ${blankTotal}): ${JSON.stringify(Object.fromEntries(Object.entries(blankCounts).map(([name, count]) => [name, { count, share: percentage(count / blankTotal) }])))}`);
console.log(`greedy vs EXAMPLE_TOKENS split differences: ${sudachiDifferences}/${comparableSudachi} comparable sentences`);
console.log(`EXAMPLE_TOKENS unavailable for comparison: ${records.length - comparableSudachi}`);
console.log(`single-character glossed tokens (all sources): ${singleCharGlossedTokens.length}/${allGlossedTokens.length} (${percentage(singleCharGlossedTokens.length / allGlossedTokens.length)})`);
console.log(`single-character glossed tokens (non-punctuation): ${singleCharNonPunctuationGlossedTokens.length}/${allNonPunctuationGlossedTokens.length} (${percentage(singleCharNonPunctuationGlossedTokens.length / allNonPunctuationGlossedTokens.length)})`);
console.log(`single-character wordBank gloss hits (mis-hit risk subset): ${singleCharWordBankGlossedTokens.length}/${wordBankGlossedTokens.length} wordBank-glossed tokens (${percentage(singleCharWordBankGlossedTokens.length / wordBankGlossedTokens.length)})`);
console.log(`真·缺词 unique surfaces: ${trueMissingList.length}`);
console.log(`真·缺词 list (surface x count): ${trueMissingList.map(([surface, count]) => `${surface}×${count}`).join(' | ')}`);
printSample('Deterministic random sample (15)', randomSample);
printSample('Lowest coverage sample (5)', lowestSample);
printSingleCharSample();
