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

const SPOKEN_ANCHORS = new Set([
  'n5_chikai', 'n5_hiru', 'n5_hito', 'n5_hitori', 'n5_kau', 'n5_kesa',
  'n5_kyonen', 'n5_megane', 'n5_miru', 'n5_mondai', 'n5_tsukau', 'n5_yomu',
]);
const NEGATIVE_VERBS = [
  ['襲う', /襲[うっいわえ]/u],
  ['ぶつ', /ぶつ|ぶっ/u],
  ['殴る', /殴[るっりれ]/u],
  ['殺す', /殺[すしさせ]/u],
  ['死ぬ', /死(?:ぬ|ん|に|ね|な)/u],
  ['盗む', /盗(?:む|ん|み|め)/u],
  ['打つ', /打(?:つ|っ|ち|た|て)/u],
];
const FOREIGN_MEASURE_WORDS = ['マイル', 'ポンド', 'ドル', 'インチ', 'ヤード', 'フィート', 'オンス', 'ガロン'];
const DIFFICULTY_PATTERNS = [
  ['沸騰する', /沸騰/u],
  ['降り続く', /降り続/u],
  ['〜てごらん', /てごらん|てご覧/u],
  ['だろう', /だろう/u],
];
const DATA_WORDS = new Set(['私たち']);
const CHINESE_FIX_PATTERNS = [
  ['明显错字：低穿上', /低穿上/u],
  ['明显不自然：多风', /今天比昨天多风/u],
  ['明显不自然：每朝轻量运动', /每朝都会做轻量运动/u],
  ['明显不自然：玫瑰句式', /在花园里的玫瑰正盛开著/u],
  ['明显不自然：大学四月开学', /大学四月开学/u],
  ['明显不自然：他说得很大声', /他说得很大声/u],
  ['明显不自然：厨房正忙著', /我的母亲在厨房里正忙著/u],
];
// This is the one ticket-specified Chinese issue that the former priority
// chain hid behind DATA. It is an explicit known-row signal, not a new
// general-purpose translation heuristic.
const CHINESE_JP_FIXES = new Map([
  ['n5_fun', '意向形语气误译：待とう'],
]);

const matchesNamed = (text, patterns) => patterns
  .filter(([, pattern]) => pattern.test(text))
  .map(([name]) => name);

// These are conservative, mechanical pre-review signals. They are not a
// claim that an unflagged row is native-approved; source text is unchanged.
const classifyRow = (row) => {
  const unknownWords = Array.isArray(row.unknown_words) ? row.unknown_words : [];
  const numericOrMeasureUnknown = unknownWords.filter(word => /^[0-9０-９]+$/u.test(word) || DATA_WORDS.has(word));
  const dataReasons = numericOrMeasureUnknown.map(word => `解析失败:${word}`);
  const spoken = SPOKEN_ANCHORS.has(row.anchor_id);
  const negative = matchesNamed(row.jp, NEGATIVE_VERBS);
  const foreignMeasures = FOREIGN_MEASURE_WORDS.filter(word => row.jp.includes(word));
  const difficulty = matchesNamed(row.jp, DIFFICULTY_PATTERNS);
  const fragment = /(?:が|けど|のに|ので|から|し)。$/u.test(row.jp);
  const chineseMismatch = /姉/u.test(row.jp) && /姐妹/u.test(row.zh);
  const chineseFixes = [
    ...matchesNamed(row.zh, CHINESE_FIX_PATTERNS),
    ...(CHINESE_JP_FIXES.has(row.anchor_id) ? [CHINESE_JP_FIXES.get(row.anchor_id)] : []),
  ];
  const chineseSignals = [
    ...(chineseMismatch ? ['姉→姐妹疑似错译'] : []),
    ...chineseFixes,
  ];
  const swap = (negative.length && row.anchor_id !== 'n5_shinu')
    || foreignMeasures.length
    || fragment
    || row.anchor_id === 'n5_amai'
    || row.anchor_id === 'n5_ane';
  const labels = [];
  if (dataReasons.length) labels.push('DATA');
  if (spoken) labels.push('SPOKEN');
  if (swap) labels.push('SWAP');
  if (chineseSignals.length) labels.push('FIX_ZH');
  if (!labels.length) labels.push('LAND');
  const status = ['DATA', 'SPOKEN', 'SWAP', 'FIX_ZH', 'LAND'].find(label => labels.includes(label));
  const reasons = [...dataReasons];
  if (spoken) reasons.push('真实口语缩约/省略');
  if (negative.length && row.anchor_id !== 'n5_shinu') reasons.push(`负面动词:${negative.join('、')}`);
  if (foreignMeasures.length) reasons.push(`外国语料度量衡:${foreignMeasures.join('、')}`);
  if (fragment) reasons.push('疑似残句');
  if (row.anchor_id === 'n5_amai') reasons.push('固定搭配/引申义');
  if (row.anchor_id === 'n5_ane') reasons.push('日语搭配别扭');
  if (chineseMismatch) reasons.push('姉被译成姐妹');
  reasons.push(...chineseFixes);
  return {
    status,
    labels,
    reasons,
    data_signals: numericOrMeasureUnknown,
    difficulty_signals: difficulty,
    chinese_signals: chineseSignals,
    risk_signals: fragment ? ['疑似残句'] : [],
  };
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
  const classification = classifyRow(result.selected);
  selected.push({
    ...result.selected,
    old_review_tier: tierOf(result.selected),
    alt_count: group.length - 1,
    review_status: classification.status,
    review_labels: classification.labels,
    review_reasons: classification.reasons,
    data_signals: classification.data_signals,
    difficulty_signals: classification.difficulty_signals,
    chinese_signals: classification.chinese_signals,
    risk_signals: classification.risk_signals,
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
const statusCounts = new Map();
const unknownCounts = new Map();
const lengthCounts = new Map();
for (const row of selected) {
  tierCounts.set(row.old_review_tier, (tierCounts.get(row.old_review_tier) || 0) + 1);
  statusCounts.set(row.review_status, (statusCounts.get(row.review_status) || 0) + 1);
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
console.log(`old tiers: ${JSON.stringify(counts(tierCounts))}`);
console.log(`statuses: ${JSON.stringify(counts(statusCounts))}`);
console.log(`multi-label rows (>=2): ${selected.filter(row => row.review_labels.length >= 2).length}`);
console.log(`DATA signals: ${selected.filter(row => row.data_signals.length).length}`);
console.log(`difficulty signals: ${selected.filter(row => row.difficulty_signals.length).length}`);
console.log(`Chinese signals: ${selected.filter(row => row.chinese_signals.length).length}`);
console.log(`SWAP with alt_count=0: ${selected.filter(row => row.review_status === 'SWAP' && row.alt_count === 0).length}`);
for (const [label, key] of [['negative', 'review_reasons'], ['foreign', 'review_reasons'], ['difficulty', 'difficulty_signals'], ['Chinese', 'chinese_signals']]) {
  const rowsForSignal = selected.filter(row => label === 'negative'
    ? matchesNamed(row.jp, NEGATIVE_VERBS).length
    : label === 'foreign'
      ? FOREIGN_MEASURE_WORDS.some(word => row.jp.includes(word))
    : label === 'Chinese'
      ? row.chinese_signals.length
      : row[key].some(value => value.includes(label === 'foreign' ? '外国语料度量衡' : '')));
  if (label !== 'difficulty' || rowsForSignal.length) console.log(`${label} instances: ${JSON.stringify(rowsForSignal.map(row => ({ anchor_id: row.anchor_id, jp: row.jp, zh: row.zh, signals: label === 'negative' ? matchesNamed(row.jp, NEGATIVE_VERBS).map(value => `负面动词:${value}`) : label === 'foreign' ? FOREIGN_MEASURE_WORDS.filter(value => row.jp.includes(value)).map(value => `外国语料度量衡:${value}`) : row[key], jp_sentence_id: row.tatoeba.jp_sentence_id, zh_sentence_id: row.tatoeba.zh_sentence_id })))}`);
}
console.log(`output: ${outputPath}`);
