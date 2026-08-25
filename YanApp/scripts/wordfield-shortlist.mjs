#!/usr/bin/env node

/**
 * Collapse the staged Tatoeba candidates to one deterministic row per anchor.
 * This script reads the existing JSONL and writes only the explicitly requested
 * shortlist staging file; it never edits either content package.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repo = path.resolve(new URL('..', import.meta.url).pathname);
const defaultInput = path.join(repo, 'staging/wordfield-candidates-tatoeba.jsonl');
const defaultOutput = path.join(repo, 'staging/wordfield-shortlist-343.json');

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value.startsWith('--')) continue;
  args.set(value, process.argv[index + 1]);
  index += 1;
}

const inputPath = path.resolve(args.get('--input') || defaultInput);
const outputPath = path.resolve(args.get('--output') || defaultOutput);

const readRows = (filePath) => fs.readFileSync(filePath, 'utf8')
  .split('\n')
  .filter(line => line.trim())
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`invalid JSON at ${filePath}:${index + 1}: ${error.message}`);
    }
  });

const assertCandidate = (row, index) => {
  if (!row || typeof row !== 'object') throw new Error(`candidate ${index} is not an object`);
  if (typeof row.anchor_id !== 'string' || !row.anchor_id) throw new Error(`candidate ${index} has no anchor_id`);
  if (typeof row.jp !== 'string' || typeof row.zh !== 'string' || !row.zh) throw new Error(`candidate ${index} has missing text`);
  if (!Array.isArray(row.member_word_ids) || row.member_word_ids.length < 2) throw new Error(`candidate ${index} has fewer than two members`);
  if (!row.tatoeba || !Number.isInteger(row.tatoeba.jp_sentence_id) || !Number.isInteger(row.tatoeba.zh_sentence_id)) {
    throw new Error(`candidate ${index} is missing Tatoeba sentence IDs`);
  }
  if (!row.metrics || !Number.isInteger(row.metrics.jp_char_count) || !Number.isInteger(row.metrics.unknown_word_count)) {
    throw new Error(`candidate ${index} has incomplete metrics`);
  }
}

const inPreferredLength = row => row.metrics.jp_char_count >= 7 && row.metrics.jp_char_count <= 12;

// The four tie-breaks are deliberately separate so the script can report how
// many rows each rule removes. Every comparison is total and deterministic.
const chooseOne = (rows) => {
  let pool = rows.slice();
  const eliminated = [];

  const keep = (predicate) => {
    const next = pool.filter(predicate);
    eliminated.push(pool.length - next.length);
    pool = next;
  };

  const minUnknown = Math.min(...pool.map(row => row.metrics.unknown_word_count));
  keep(row => row.metrics.unknown_word_count === minUnknown);

  const maxMembers = Math.max(...pool.map(row => row.member_word_ids.length));
  keep(row => row.member_word_ids.length === maxMembers);

  const hasPreferredLength = pool.some(inPreferredLength);
  keep(row => !hasPreferredLength || inPreferredLength(row));

  pool.sort((left, right) => left.tatoeba.jp_sentence_id - right.tatoeba.jp_sentence_id);
  const selected = pool[0];
  eliminated.push(pool.length - 1);
  return { selected, eliminated };
};

const tierOf = (row) => {
  const unknown = row.metrics.unknown_word_count;
  if (unknown === 0 && inPreferredLength(row) && row.member_word_ids.length >= 2) return 'A';
  if (unknown === 0) return 'B';
  return 'C';
};

// Conservative mechanical flags for owner review. These are signals, not
// judgments of native correctness; the source sentence and translation stay
// byte-for-byte as supplied by the staged Tatoeba row.
const riskFlagsOf = (jp) => {
  const flags = [];
  if (/(?:頭|腹|お腹|歯|喉|腰|肩|背中|足|目|耳)痛い/u.test(jp)) flags.push('疑似缺助词');
  if (/^(?:明日|今日|今|ここ|そこ|それ|これ|誰|何|どこ|どう|もう|まだ)[^。！？!?]*[？?！!]$/u.test(jp)
    || /(?:？|\?)$/u.test(jp) && !/[ですますだである]/u.test(jp)) flags.push('疑似口语省略');
  if (!/[。！？!?]$/u.test(jp)
    || /^(?:そして|しかし|だから|でも|ので|のに|けど|が)[^。！？!?]*[。！？!?]?$/u.test(jp)
    || /(?:が|けど|のに|ので|から|し)。$/u.test(jp)
    || /[、,]$/u.test(jp)) flags.push('疑似残句');
  return flags;
};

const rows = readRows(inputPath);
rows.forEach(assertCandidate);
const byAnchor = new Map();
for (const row of rows) {
  if (!byAnchor.has(row.anchor_id)) byAnchor.set(row.anchor_id, []);
  byAnchor.get(row.anchor_id).push(row);
}

const ruleEliminated = [0, 0, 0, 0];
const selected = [];
for (const group of byAnchor.values()) {
  const result = chooseOne(group);
  result.eliminated.forEach((count, index) => { ruleEliminated[index] += count; });
  selected.push({
    ...result.selected,
    review_tier: tierOf(result.selected),
    review_risks: riskFlagsOf(result.selected.jp),
  });
}
selected.sort((left, right) => left.anchor_id.localeCompare(right.anchor_id));

if (selected.length !== byAnchor.size || selected.length !== 343) {
  throw new Error(`expected 343 selected anchors, got ${selected.length} from ${byAnchor.size}`);
}

fs.writeFileSync(outputPath, `${JSON.stringify(selected, null, 2)}\n`, 'utf8');

const counts = (values) => [...values.entries()].sort((left, right) => {
  if (left[0] < right[0]) return -1;
  if (left[0] > right[0]) return 1;
  return 0;
});
const tierCounts = new Map();
const unknownCounts = new Map();
const lengthCounts = new Map();
for (const row of selected) {
  tierCounts.set(row.review_tier, (tierCounts.get(row.review_tier) || 0) + 1);
  const unknown = row.metrics.unknown_word_count;
  unknownCounts.set(unknown, (unknownCounts.get(unknown) || 0) + 1);
  const length = row.metrics.jp_char_count;
  lengthCounts.set(length, (lengthCounts.get(length) || 0) + 1);
}

console.log(`input candidates: ${rows.length}`);
console.log(`distinct anchors: ${byAnchor.size}`);
console.log(`selected rows: ${selected.length}`);
console.log(`rule eliminated: unknown=${ruleEliminated[0]}, members=${ruleEliminated[1]}, length=${ruleEliminated[2]}, jp_sentence_id=${ruleEliminated[3]}`);
console.log(`unknown_word_count: ${JSON.stringify(counts(unknownCounts))}`);
console.log(`jp_char_count: ${JSON.stringify(counts(lengthCounts))}`);
console.log(`tiers: ${JSON.stringify(counts(tierCounts))}`);
console.log(`risk rows: ${selected.filter(row => row.review_risks.length).length}`);
console.log(`output: ${outputPath}`);
