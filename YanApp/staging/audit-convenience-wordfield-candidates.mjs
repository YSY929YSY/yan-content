import fs from 'node:fs';
import { auditWordFields } from '../src/features/review/units.js';

const content = JSON.parse(fs.readFileSync(new URL('../assets/content.fallback.json', import.meta.url)));
const input = JSON.parse(fs.readFileSync(new URL('./convenience-wordfield-candidates.json', import.meta.url)));
const byId = new Map(content.wordBank.map(w => [w.id, w]));
const bank = input.candidates.map(candidate => ({
  ...byId.get(candidate.anchorId),
  wordField: candidate.wordField,
}));
const errors = auditWordFields([...content.wordBank, ...bank]);
console.log(JSON.stringify({kind: input.kind, candidates: bank.length, errors}, null, 2));
if (errors.length) process.exitCode = 1;
