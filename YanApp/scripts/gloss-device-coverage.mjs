import { readFileSync } from 'node:fs';

import { buildWordFieldAlignment, dictionaryFormsFrom } from '../src/features/wordbank/wordFieldAlignment.js';

const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const content = load('../assets/content.fallback.json');
const exampleTokens = load('../assets/example_tokens.json');
const fullBank = content.wordBank || [];
const dictionaryForms = dictionaryFormsFrom(exampleTokens);
const punctuationOnly = /^[\s、。？！？，．.!?,:：;；「」『』（）()［］【】〔〕〈〉《》…・~〜]+$/u;

const fieldsFor = (word) => {
  const raw = Array.isArray(word?.wordField) ? word.wordField : (word?.wordField ? [word.wordField] : []);
  return raw.filter(field => field?.sentence?.jp).map(field => field.sentence.jp);
};

const measure = (bank) => {
  let total = 0;
  let covered = 0;
  const gaps = [];

  for (const word of fullBank.filter(item => item.wordField)) {
    for (const sentence of fieldsFor(word)) {
      const missing = [];
      for (const row of buildWordFieldAlignment(sentence, bank, dictionaryForms)) {
        if (punctuationOnly.test(row.jp)) continue;
        total += 1;
        if (row.zh?.trim()) covered += 1;
        else missing.push(row.jp);
      }
      if (missing.length > 0) gaps.push({ id: word.id, word: word.word, level: (word.levels || [word.level])[0], sentence, missing });
    }
  }

  return { total, covered, missing: total - covered, coverage: total ? covered / total : 0, gaps };
};

const measureByBookSubset = () => {
  let total = 0;
  let covered = 0;
  const gaps = [];

  for (const word of fullBank.filter(item => item.wordField)) {
    const levels = word.levels || [word.level];
    const bookLevel = levels[0];
    const bookBank = fullBank.filter(item => (item.levels || [item.level]).includes(bookLevel));
    for (const sentence of fieldsFor(word)) {
      const missing = [];
      for (const row of buildWordFieldAlignment(sentence, bookBank, dictionaryForms)) {
        if (punctuationOnly.test(row.jp)) continue;
        total += 1;
        if (row.zh?.trim()) covered += 1;
        else missing.push(row.jp);
      }
      if (missing.length > 0) gaps.push({ id: word.id, word: word.word, level: levels[0], sentence, missing });
    }
  }

  return { total, covered, missing: total - covered, coverage: total ? covered / total : 0, gaps };
};

const before = measureByBookSubset();
const after = measure(fullBank);
const topGaps = [...before.gaps]
  .sort((a, b) => b.missing.length - a.missing.length || a.id.localeCompare(b.id))
  .slice(0, 10);

const percent = value => `${(value * 100).toFixed(2)}%`;
console.log(`device gloss coverage before: ${before.covered}/${before.total} (${percent(before.coverage)})`);
console.log(`device gloss coverage after:  ${after.covered}/${after.total} (${percent(after.coverage)})`);
console.log(`full-bank gloss baseline:     ${after.covered}/${after.total} (${percent(after.coverage)})`);
console.log('top 10 subset gaps:');
for (const gap of topGaps) {
  console.log(`- ${gap.id} ${gap.word} ${gap.level}: ${gap.missing.length} missing [${gap.missing.join('、')}] — ${gap.sentence}`);
}
