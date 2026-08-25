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
const surfacesFromSudachi = (tokens) => (Array.isArray(tokens) ? tokens : [])
  .map((token) => Array.isArray(token) ? token[0] : token)
  .filter((surface) => typeof surface === 'string');
const sameArray = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);

// buildWordFieldAlignment is intentionally unchanged. Its candidatesOf() scans the
// whole word bank on every call, so the assessment scopes inputs to surfaces that
// actually occur in this sentence. A candidate/form absent from the sentence cannot
// affect a direct match, boundary, or dictionary-form match, making this equivalent
// for the sentence while keeping the full 4,400-row assessment tractable.
const scopedInputs = (sentence) => ({
  wordBank: wordBank.filter((word) => [word?.word, word?.reading]
    .some((surface) => typeof surface === 'string' && surface && sentence.includes(surface))),
  dictionaryForms: new Map([...dictionaryForms]
    .filter(([surface]) => typeof surface === 'string' && sentence.includes(surface))),
});

const records = entries.map((entry) => {
  const scoped = scopedInputs(entry.exampleJp);
  const rows = buildWordFieldAlignment(entry.exampleJp, scoped.wordBank, scoped.dictionaryForms);
  const comparableRows = rows.filter((token) => !isPunctuation(token));
  const filledRows = comparableRows.filter(filled);
  const coverage = comparableRows.length ? filledRows.length / comparableRows.length : 1;
  const sudachiSurfaces = surfacesFromSudachi(exampleTokens[entry.id]);
  const greedySurfaces = rows.map((token) => token.jp);
  const blanks = rows.filter((token) => !filled(token));
  return {
    entry,
    rows,
    coverage,
    reconstructs: rows.map((token) => token.jp).join('') === entry.exampleJp,
    hasSudachiTokens: Array.isArray(exampleTokens[entry.id]),
    differsFromSudachi: Array.isArray(exampleTokens[entry.id]) && !sameArray(greedySurfaces, sudachiSurfaces),
    blanks,
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

const blankCause = (token) => {
  if (token.blankKind === '活用碎片') return '活用碎片';
  if (token.blankKind === '表记差异') return '表记差异';
  return '不在词库';
};
const blankCounts = Object.fromEntries(['活用碎片', '表记差异', '不在词库'].map((name) => [name, 0]));
for (const record of records) {
  for (const token of record.blanks) blankCounts[blankCause(token)] += 1;
}
const blankTotal = Object.values(blankCounts).reduce((sum, count) => sum + count, 0);
const comparableSudachi = records.filter((record) => record.hasSudachiTokens).length;
const sudachiDifferences = records.filter((record) => record.differsFromSudachi).length;

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

const tokenDisplay = (record) => record.rows
  .map((token) => `${token.jp}→${filled(token) ? token.zh : '∅'}`)
  .join(' | ');
const printSample = (title, sample) => {
  console.log(`\n## ${title}`);
  for (const record of sample) {
    const blanks = record.blanks.map((token) => `${token.jp}（${blankCause(token)}）`).join('、') || '无';
    console.log(`- ${record.entry.id} | ${record.entry.exampleJp}`);
    console.log(`  tokens: ${tokenDisplay(record)}`);
    console.log(`  coverage: ${percentage(record.coverage)} | blanks: ${blanks}`);
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
printSample('Deterministic random sample (15)', randomSample);
printSample('Lowest coverage sample (5)', lowestSample);
