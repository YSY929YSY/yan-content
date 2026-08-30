import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

import { buildWordFieldAlignment as currentAlign, dictionaryFormsFrom } from '../src/features/wordbank/wordFieldAlignment.js';

const load = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const content = load('assets/content.fallback.json');
const exampleTokens = load('assets/example_tokens.json');
const fullBank = content.wordBank || [];
const dictionaryForms = dictionaryFormsFrom(exampleTokens);
const punctuationOnly = /^[\s、。？！？，．.!?,:：;；「」『』（）()［］【】〔〕〈〉《》…・~〜]+$/u;
const singleKana = /^[ぁ-ゖァ-ヺー]$/u;
const fields = fullBank.flatMap((word) => {
  const raw = Array.isArray(word.wordField) ? word.wordField : (word.wordField ? [word.wordField] : []);
  return raw.filter((field) => field?.sentence?.jp).map((field) => ({
    sentence: field.sentence.jp,
    provider: field.source?.provider,
  }));
});

const importAlignment = async (source) => import(`data:text/javascript,${encodeURIComponent(source)}`);
const source = fs.readFileSync('src/features/wordbank/wordFieldAlignment.js', 'utf8');
const gitPrefix = execFileSync('git', ['rev-parse', '--show-prefix'], { encoding: 'utf8' }).trim();
const baselineSource = execFileSync(
  'git',
  ['show', `e20addf^:${gitPrefix}src/features/wordbank/wordFieldAlignment.js`],
  { encoding: 'utf8' },
);
const baseline = await importAlignment(baselineSource);
const current = { buildWordFieldAlignment: currentAlign };

const directStart = source.indexOf('const directCandidateAt =');
const directEnd = source.indexOf('\n\nconst nextKnownBoundary', directStart);
if (directStart < 0 || directEnd < 0) throw new Error('F-3 mutation anchor not found');
const priorityOnlyDirect = `const directCandidateAt = (sentence, start, candidates) => {
  for (const priority of [0, 1]) {
    const matches = candidates
      .filter(candidate => candidate.priority === priority
        && !isSingleKana(candidate.surface)
        && sentence.startsWith(candidate.surface, start))
      .sort((a, b) => b.surface.length - a.surface.length);
    if (matches.length) return matches[0];
  }
  return null;
};`;
const f3Source = source.slice(0, directStart) + priorityOnlyDirect + source.slice(directEnd);
const f3Only = await importAlignment(f3Source);

const f4Source = source.replace(
  /if \(grammar && \(grammarIsNotShorter \|\| grammarBoundaryIsKnown\)\) \{[\s\S]*?\n    \}\n\n    const number/,
  `if (grammar) {
      out.push({ jp: grammar, zh: GRAMMAR[grammar], source: 'grammar' });
      cursor += grammar.length;
      continue;
    }

    const number`,
);
if (f4Source === source) throw new Error('F-4 mutation anchor not found');
const f4Only = await importAlignment(f4Source);

const rowsFor = (alignment, field) => alignment.buildWordFieldAlignment(field.sentence, fullBank, dictionaryForms);
const measure = (alignment) => {
  let singleKanaHits = 0;
  const singleKanaSentences = new Set();
  let total = 0;
  let covered = 0;
  for (const field of fields) {
    const rows = rowsFor(alignment, field);
    for (const row of rows) {
      if (row.source === 'wordBank' && singleKana.test(row.jp)) {
        singleKanaHits += 1;
        singleKanaSentences.add(field.sentence);
      }
      if (field.provider !== 'Tatoeba' || punctuationOnly.test(row.jp)) continue;
      total += 1;
      if (row.zh?.trim()) covered += 1;
    }
  }
  return {
    fields: fields.length,
    singleKanaSentences: singleKanaSentences.size,
    singleKanaHits,
    tatoebaTotal: total,
    tatoebaCovered: covered,
    tatoebaCoverage: `${(covered / total * 100).toFixed(2)}%`,
  };
};

const signature = (row) => row && [row.jp, row.zh, row.source];
const impact = (variant) => {
  let sentences = 0;
  let tokens = 0;
  for (const field of fields) {
    const expected = rowsFor(current, field);
    const actual = rowsFor(variant, field);
    let changed = 0;
    for (let i = 0; i < Math.max(expected.length, actual.length); i += 1) {
      if (JSON.stringify(signature(expected[i])) !== JSON.stringify(signature(actual[i]))) changed += 1;
    }
    if (changed) {
      sentences += 1;
      tokens += changed;
    }
  }
  return { sentences, tokens };
};

console.log(`baseline: ${JSON.stringify(measure(baseline))}`);
console.log(`fixed: ${JSON.stringify(measure(current))}`);
console.log(`F-3 isolated impact: ${JSON.stringify(impact(f3Only))}`);
console.log(`F-4 isolated impact: ${JSON.stringify(impact(f4Only))}`);
