#!/usr/bin/env node

// Land the reviewed LV rows into both content copies. The default mode is a
// read-only preflight; --write performs the one content-window write.

import fs from 'node:fs';
import path from 'node:path';
import { buildWordFieldAlignment, dictionaryFormsFrom } from '../src/features/wordbank/wordFieldAlignment.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const fallbackPath = path.join(root, 'assets/content.fallback.json');
const authorityPath = path.resolve(root, '../yan-content/content.v2.json');
const reviewPath = path.join(root, 'staging/lv-67-for-review.md');
const rawPath = path.join(root, 'staging/wordfield-candidates-tatoeba.jsonl');
const tokensPath = path.join(root, 'assets/example_tokens.json');

const rejectedNumbers = new Set([3, 4, 10, 14, 17, 19, 22, 30, 32, 34, 39, 44, 49, 51, 59, 63]);
const expectedRejected = new Set([
  'n5_atatakai', 'n5_atsui', 'n5_dekakeru', 'n5_haha', 'n5_hataraku',
  'n5_hikouki', 'n5_iru_2', 'n5_karada', 'n5_kata', 'n5_kaze_2',
  'n5_kumoru', 'n5_nakusu', 'n5_onnanoko', 'n5_otouto', 'n5_takai', 'n5_tsukue',
]);

const parseReviewRows = () => fs.readFileSync(reviewPath, 'utf8')
  .split('\n')
  .filter(line => /^\| \d+ \|/.test(line))
  .map(line => {
    const columns = line.split('|').map(value => value.trim());
    if (columns.length !== 8) throw new Error(`unexpected review row: ${line}`);
    return { number: Number(columns[1]), anchor: columns[3], jp: columns[4], zh: columns[5] };
  });

const reviewRows = parseReviewRows();
if (reviewRows.length !== 65) throw new Error(`expected 65 review rows, got ${reviewRows.length}`);
if (!reviewRows.every((row, index) => row.number === index + 1)) throw new Error('review row numbering is not contiguous');

const rejectedAnchors = new Set(reviewRows.filter(row => rejectedNumbers.has(row.number)).map(row => row.anchor));
if (rejectedAnchors.size !== 16 || [...rejectedAnchors].some(anchor => !expectedRejected.has(anchor))) {
  throw new Error(`rejected anchor set drifted: ${JSON.stringify([...rejectedAnchors])}`);
}
if (reviewRows.filter(row => !rejectedNumbers.has(row.number)).length !== 49) {
  throw new Error('49 = 65 - 16 check failed');
}

const fallback = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
const authority = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
if (JSON.stringify(fallback) !== JSON.stringify(authority)) throw new Error('content copies differ before merge');

const rawRows = fs.readFileSync(rawPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const rawByText = new Map(rawRows.map(row => [`${row.anchor_id}\0${row.jp}\0${row.zh}`, row]));
const wordById = new Map((fallback.wordBank || []).map(word => [word.id, word]));
const existingWordFieldIds = new Set((fallback.wordBank || [])
  .filter(word => word?.wordField?.sentence?.jp)
  .map(word => word.id));
const exampleTokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
const dictionaryForms = dictionaryFormsFrom(exampleTokens);
const memberVariants = value => String(value || '')
  .split(/[;；|]/)
  .map(part => part.trim())
  .filter(Boolean);
const appearsInSentence = (sentence, word) => {
  if (memberVariants(word.word).some(value => sentence.includes(value))) return true;
  for (const [surface, forms] of dictionaryForms) {
    if (typeof surface !== 'string' || !(forms instanceof Set) || !sentence.includes(surface)) continue;
    if (forms.size !== 1) continue;
    if (memberVariants(word.word).some(value => forms.has(value)) || forms.has(word.reading)) return true;
  }
  return false;
};

const selected = reviewRows.filter(row => !rejectedNumbers.has(row.number)).map(row => {
  const candidate = rawByText.get(`${row.anchor}\0${row.jp}\0${row.zh}`);
  if (!candidate) throw new Error(`review row missing from Tatoeba staging: ${row.anchor}`);
  if (candidate.anchor_id !== row.anchor) throw new Error(`candidate anchor mismatch: ${row.anchor}`);
  if (!Array.isArray(candidate.member_word_ids) || candidate.member_word_ids.length < 2) {
    throw new Error(`candidate has fewer than two members: ${row.anchor}`);
  }
  if (!candidate.tatoeba?.jp_sentence_id || !candidate.tatoeba?.zh_sentence_id) {
    throw new Error(`candidate has incomplete Tatoeba IDs: ${row.anchor}`);
  }
  if (existingWordFieldIds.has(row.anchor)) throw new Error(`would overwrite existing wordField: ${row.anchor}`);

  // The alignment path consumes dictionaryFormsFrom so inflected surfaces are
  // checked through the same dictionary-form map used at runtime. Members are
  // kept only when that same map can resolve them in the sentence.
  const alignment = buildWordFieldAlignment(candidate.jp, fallback.wordBank, dictionaryForms);
  if (alignment.map(token => token.jp).join('') !== candidate.jp) {
    throw new Error(`alignment does not round-trip: ${row.anchor}`);
  }
  for (const id of candidate.member_word_ids) {
    if (!wordById.has(id)) throw new Error(`member missing from wordBank: ${row.anchor} -> ${id}`);
  }
  const members = candidate.member_word_ids.filter(id => appearsInSentence(candidate.jp, wordById.get(id))).map(id => {
    return { id };
  });
  if (!members.length) throw new Error(`candidate has no dictionaryForms-resolved members: ${row.anchor}`);
  return {
    anchor: row.anchor,
    wordField: {
      members,
      sentence: { jp: candidate.jp, zh: candidate.zh },
      source: {
        provider: 'Tatoeba',
        jp_sentence_id: candidate.tatoeba.jp_sentence_id,
        zh_sentence_id: candidate.tatoeba.zh_sentence_id,
      },
    },
  };
});

if (selected.length !== 49) throw new Error(`selected ${selected.length}, expected 49`);
if (new Set(selected.map(row => row.anchor)).size !== selected.length) throw new Error('selected anchors are duplicated');

const write = process.argv.includes('--write');
if (write) {
  const next = (input) => {
    const output = structuredClone(input);
    for (const row of selected) {
      const word = output.wordBank.find(item => item.id === row.anchor);
      if (!word) throw new Error(`anchor missing from output content: ${row.anchor}`);
      word.wordField = row.wordField;
    }
    const version = String(output._meta?.version || '');
    const match = version.match(/^(\d+)(?:\.(\d+))?$/);
    if (!match) throw new Error(`unsupported content version: ${version}`);
    const major = Number(match[1]);
    const minor = Number(match[2] || 0);
    output._meta.version = `${major}.${minor + 1}`;
    return output;
  };
  const nextFallback = next(fallback);
  const nextAuthority = next(authority);
  const fallbackText = `${JSON.stringify(nextFallback, null, 1)}\n`;
  const authorityText = `${JSON.stringify(nextAuthority, null, 1)}\n`;
  if (fallbackText !== authorityText) throw new Error('generated content copies differ');
  const fallbackTemp = `${fallbackPath}.lv49.tmp`;
  const authorityTemp = `${authorityPath}.lv49.tmp`;
  try {
    fs.writeFileSync(fallbackTemp, fallbackText, 'utf8');
    fs.writeFileSync(authorityTemp, authorityText, 'utf8');
    fs.renameSync(fallbackTemp, fallbackPath);
    fs.renameSync(authorityTemp, authorityPath);
  } finally {
    for (const tempPath of [fallbackTemp, authorityTemp]) {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }
  console.log('wrote both content copies');
}

console.log(`review rows: ${reviewRows.length}`);
console.log(`rejected: ${rejectedAnchors.size}`);
console.log(`selected: ${selected.length}`);
console.log(`dictionary form surfaces: ${dictionaryForms.size}`);
console.log(`write: ${write}`);
