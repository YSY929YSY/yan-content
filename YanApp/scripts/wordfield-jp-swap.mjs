#!/usr/bin/env node

// Select deterministic replacements for the JP verdicts. This script only
// reads the candidate/verdict staging files and writes a review markdown file;
// it never edits either content package.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const rawPath = path.join(root, 'staging/wordfield-candidates-tatoeba.jsonl');
const shortlistPath = path.join(root, 'staging/wordfield-shortlist-343.json');
const verdictPath = path.join(root, 'staging/gpt-verdicts-301.json');
const outputPath = path.join(root, 'staging/jp-22-swapped-for-review.md');

const raw = fs.readFileSync(rawPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const shortlist = JSON.parse(fs.readFileSync(shortlistPath, 'utf8'));
const verdicts = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
const jpVerdicts = verdicts.JP || [];
const shortlistByAnchor = new Map(shortlist.map(row => [row.anchor_id, row]));
const candidatesByAnchor = new Map();
for (const row of raw) {
  const rows = candidatesByAnchor.get(row.anchor_id) || [];
  rows.push(row);
  candidatesByAnchor.set(row.anchor_id, rows);
}

const inPreferredLength = row => row.metrics.jp_char_count >= 7 && row.metrics.jp_char_count <= 12;
const negative = [
  ['襲う', /襲[うっいわえ]/u],
  ['ぶつ', /ぶつ|ぶっ/u],
  ['殴る', /殴[るっりれ]/u],
  ['殺す', /殺[すしさせ]/u],
  ['死ぬ', /死(?:ぬ|ん|に|ね|な)/u],
  ['盗む', /盗(?:む|ん|み|め)/u],
  ['打つ', /打(?:つ|っ|ち|た|て)/u],
];
const foreignMeasures = ['マイル', 'ポンド', 'ドル', 'インチ', 'ヤード', 'フィート', 'オンス', 'ガロン'];
const difficulty = [
  ['沸騰する', /沸騰/u],
  ['降り続く', /降り続/u],
  ['〜てごらん', /てごらん|てご覧/u],
  ['だろう', /だろう/u],
];
const chinese = [
  ['姉→姐妹疑似错译', row => /姉/u.test(row.jp) && /姐妹/u.test(row.zh)],
  ['明显不自然：低穿上', row => /低穿上/u.test(row.zh)],
  ['明显不自然：多风', row => /今天比昨天多风/u.test(row.zh)],
  ['明显不自然：每朝轻量运动', row => /每朝都会做轻量运动/u.test(row.zh)],
  ['明显不自然：玫瑰句式', row => /在花园里的玫瑰正盛开著/u.test(row.zh)],
  ['明显不自然：大学四月开学', row => /大学四月开学/u.test(row.zh)],
  ['明显不自然：他说得很大声', row => /他说得很大声/u.test(row.zh)],
  ['明显不自然：厨房正忙著', row => /我的母亲在厨房里正忙著/u.test(row.zh)],
];

const signalsOf = row => [
  ...negative.filter(([, pattern]) => pattern.test(row.jp)).map(([name]) => `负面动词:${name}`),
  ...foreignMeasures.filter(word => row.jp.includes(word)).map(word => `外国语料度量衡:${word}`),
  ...difficulty.filter(([, pattern]) => pattern.test(row.jp)).map(([name]) => `难度:${name}`),
  ...chinese.filter(([, predicate]) => predicate(row)).map(([name]) => `中文:${name}`),
  ...((/(?:が|けど|のに|ので|から|し)。$/u).test(row.jp) ? ['疑似残句'] : []),
  ...((row.unknown_words || []).some(word => /^[0-9０-９]+$/u.test(word) || word === '私たち')
    ? ['数据解析'] : []),
];

const sortCandidates = (rows) => rows.slice().sort((left, right) => {
  const unknown = left.metrics.unknown_word_count - right.metrics.unknown_word_count;
  if (unknown) return unknown;
  const members = right.member_word_ids.length - left.member_word_ids.length;
  if (members) return members;
  const length = Number(inPreferredLength(right)) - Number(inPreferredLength(left));
  if (length) return length;
  return left.tatoeba.jp_sentence_id - right.tatoeba.jp_sentence_id;
});

if (jpVerdicts.length !== 22) throw new Error(`expected 22 JP verdicts, got ${jpVerdicts.length}`);
const results = [];
for (const verdict of jpVerdicts) {
  const current = shortlistByAnchor.get(verdict.anchor);
  const group = candidatesByAnchor.get(verdict.anchor) || [];
  if (!current) throw new Error(`missing shortlist row: ${verdict.anchor}`);
  if (group.length - 1 !== verdict.alt) throw new Error(`alt mismatch: ${verdict.anchor}`);
  const rest = group.filter(row => row.tatoeba.jp_sentence_id !== current.tatoeba.jp_sentence_id);
  const ordered = sortCandidates(rest);
  const usable = ordered.filter(row => signalsOf(row).length === 0);
  results.push({
    anchor: verdict.anchor,
    old: { jp: verdict.jp, zh: verdict.zh, jp_sentence_id: current.tatoeba.jp_sentence_id, zh_sentence_id: current.tatoeba.zh_sentence_id },
    alt_count: verdict.alt,
    selected: usable[0] || null,
    rejected: ordered.filter(row => !usable.includes(row)).map(row => ({
      jp_sentence_id: row.tatoeba.jp_sentence_id,
      signals: signalsOf(row),
    })),
    available_count: usable.length,
  });
}

const swapped = results.filter(result => result.selected);
const unresolved = results.filter(result => !result.selected);
if (swapped.length !== 15 || unresolved.length !== 7) {
  throw new Error(`expected 15 swapped and 7 unresolved, got ${swapped.length} and ${unresolved.length}`);
}

const lines = [
  '# JP 22 换句 · 待人工判断（只判断，不改写）',
  '',
  '> 以下 15 条是从已有 Tatoeba 备选池按固定规则取出的次优句。不要生成替换句、不要改中文；每条只输出 `OK` 或 `JP`。',
  '>',
  '> 规则：unknown_word_count 小 → member_word_ids 多 → 7–12 字优先 → jp_sentence_id 小；命中既有负面动词、外国语料度量衡、难度、中文、残句或数据解析信号的候选跳过。',
  '',
  '| # | anchor | 日语 | 中文 |',
  '|---:|---|---|---|',
];
for (const [index, result] of swapped.entries()) {
  lines.push(`| ${index + 1} | ${result.anchor} | ${result.selected.jp} | ${result.selected.zh} |`);
}
lines.push(
  '',
  '## 来源定位（机器回读）',
  '',
  '| anchor | 新日句 ID | 新中句 ID | 淘汰候选数 |',
  '|---|---:|---:|---:|',
);
for (const result of swapped) {
  lines.push(`| ${result.anchor} | ${result.selected.tatoeba.jp_sentence_id} | ${result.selected.tatoeba.zh_sentence_id} | ${result.rejected.length} |`);
}
lines.push('', '## 无可用备选（本轮不换）', '', '| anchor | 现有句 | 备选情况 |', '|---|---|---|');
for (const result of unresolved) {
  const reason = result.alt_count === 0 ? '独苗，无备选' : `全部 ${result.alt_count} 条备选命中机械信号`;
  lines.push(`| ${result.anchor} | ${result.old.jp} / ${result.old.zh} | ${reason} |`);
}
lines.push('');
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');

console.log(`JP verdicts: ${jpVerdicts.length}`);
console.log(`swapped: ${swapped.length}`);
console.log(`unresolved: ${unresolved.length}`);
console.log(`unresolved anchors: ${unresolved.map(result => result.anchor).join(',')}`);
console.log(`output: ${outputPath}`);
