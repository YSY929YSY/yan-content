import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { dictionaryFormsFrom } from '../src/features/wordbank/wordFieldAlignment.js';
import {
  deriveWordFieldReadingDetails,
  surfaceReadingsFrom,
  surfaceReadingsFromWordBank,
} from '../src/features/wordbank/wordFieldFurigana.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const content = load('assets/content.fallback.json');
const exampleTokens = load('assets/example_tokens.json');
const dictionaryForms = dictionaryFormsFrom(exampleTokens);
const exampleSurfaceReadings = surfaceReadingsFrom(exampleTokens);
const wordBankSurfaceReadings = surfaceReadingsFromWordBank(content.wordBank);
const fields = (content.wordBank || []).flatMap((word) => {
  const raw = Array.isArray(word.wordField) ? word.wordField : (word.wordField ? [word.wordField] : []);
  return raw.filter((field) => field?.sentence?.jp).map((field) => ({ word, field }));
});
const tatoeba = fields.filter(({ field }) => field.source?.provider === 'Tatoeba');
const manual = fields.filter(({ field }) => field.source?.provider !== 'Tatoeba' && field.sentence.roma);
const derive = (field) => deriveWordFieldReadingDetails(
  field.sentence.jp,
  content.wordBank,
  dictionaryForms,
  exampleSurfaceReadings,
  wordBankSurfaceReadings,
);

const results = tatoeba.map(({ field }) => ({ field, result: derive(field) }));
const count = (status) => results.filter(({ result }) => result.status === status).length;
console.log(`Tatoeba fields: ${tatoeba.length}`);
console.log(`full: ${count('full')}`);
console.log(`partial: ${count('partial')}`);
console.log(`none: ${count('none')}`);

console.log('\n20 Tatoeba samples:');
for (const { field, result } of results.slice(0, 20)) {
  console.log(`${field.sentence.jp}\t${result.reading || '—'}\t${result.status}`);
}

console.log('\n20 manual roma comparisons:');
let equal = 0;
for (const { field } of manual) {
  const result = derive(field);
  if (result.reading === field.sentence.roma) equal += 1;
  console.log(`${field.sentence.jp}\texpected=${field.sentence.roma}\tderived=${result.reading || '—'}\texact=${result.reading === field.sentence.roma ? 'yes' : 'no'}${result.reading ? '' : `\tmissing=${result.missing.map((item) => item.surface).join(',')}`}`);
}
console.log(`manual exact: ${equal}/${manual.length}`);
