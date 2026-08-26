#!/usr/bin/env node

// Rejudge the 67 LV rows against the project word-field standard and emit a
// deterministic review list. This script never edits either content package.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const verdictPath = path.join(root, 'staging/gpt-verdicts-301.json');
const rawPath = path.join(root, 'staging/wordfield-candidates-tatoeba.jsonl');
const shortlistPath = path.join(root, 'staging/wordfield-shortlist-343.json');
const contentPath = path.join(root, 'assets/content.fallback.json');
const outputPath = path.join(root, 'staging/lv-67-for-review.md');

const verdicts = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
const raw = fs.readFileSync(rawPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const shortlist = JSON.parse(fs.readFileSync(shortlistPath, 'utf8'));
const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
const lv = verdicts.LV || [];

const existingWordFieldIds = new Set((content.wordBank || [])
  .filter(word => {
    const fields = Array.isArray(word?.wordField) ? word.wordField : (word?.wordField ? [word.wordField] : []);
    return fields.some(field => typeof field?.sentence?.jp === 'string' && field.sentence.jp.trim());
  })
  .map(word => word.id));
const shortlistByAnchor = new Map(shortlist.map(row => [row.anchor_id, row]));
const candidatesByAnchor = new Map();
for (const row of raw) {
  const rows = candidatesByAnchor.get(row.anchor_id) || [];
  rows.push(row);
  candidatesByAnchor.set(row.anchor_id, rows);
}

// These are the only four rows judged SWAP under the ticket's three criteria:
// short (<=16), real, and target word as semantic center. Difficulty is not a
// reason here. The reasons are deliberately explicit and reviewable.
const swapReasons = new Map([
  ['n5_kaesu', '原句超过16字'],
  ['n5_kasu', '固定表达，貸す的字面义不突出'],
  ['n5_kata', '方がいい是语法结构，目标词不突出'],
  ['n5_takai', '高く評価する是引申搭配'],
]);

const inPreferredLength = row => row.metrics.jp_char_count >= 7 && row.metrics.jp_char_count <= 12;
const mechanicalSignals = row => {
  const unknownWords = Array.isArray(row.unknown_words) ? row.unknown_words : [];
  const signals = [];
  if (unknownWords.some(word => /^[0-9０-９]+$/u.test(word) || word === '私たち')) signals.push('数据解析');
  if (/襲[うっいわえ]|ぶつ|ぶっ|殴[るっりれ]|殺[すしさせ]|死(?:ぬ|ん|に|ね|な)|盗(?:む|ん|み|め)|打(?:つ|っ|ち|た|て)/u.test(row.jp)) signals.push('负面动词');
  if (['マイル', 'ポンド', 'ドル', 'インチ', 'ヤード', 'フィート', 'オンス', 'ガロン'].some(word => row.jp.includes(word))) signals.push('外国语料度量衡');
  if (/沸騰|降り続|てごらん|てご覧|だろう/u.test(row.jp)) signals.push('难度');
  if (/(?:が|けど|のに|ので|から|し)。$/u.test(row.jp)) signals.push('疑似残句');
  if (/姉/u.test(row.jp) && /姐妹/u.test(row.zh)) signals.push('中文');
  return signals;
};

const replacementOrder = (left, right) => {
  const unknown = left.metrics.unknown_word_count - right.metrics.unknown_word_count;
  if (unknown) return unknown;
  const members = right.member_word_ids.length - left.member_word_ids.length;
  if (members) return members;
  const preferred = Number(inPreferredLength(right)) - Number(inPreferredLength(left));
  if (preferred) return preferred;
  return left.tatoeba.jp_sentence_id - right.tatoeba.jp_sentence_id;
};

const chooseReplacement = anchor => {
  const current = shortlistByAnchor.get(anchor);
  const group = candidatesByAnchor.get(anchor) || [];
  if (!current) throw new Error(`missing shortlist row: ${anchor}`);
  const rest = group
    .filter(row => row.tatoeba.jp_sentence_id !== current.tatoeba.jp_sentence_id)
    .sort(replacementOrder);
  const usable = rest.filter(row => mechanicalSignals(row).length === 0);
  return { current, group, selected: usable[0] || null, rejected: rest.filter(row => !usable.includes(row)) };
};

if (lv.length !== 67) throw new Error(`expected 67 LV verdicts, got ${lv.length}`);
const excluded = lv.filter(row => existingWordFieldIds.has(row.anchor));
const pending = lv.filter(row => !existingWordFieldIds.has(row.anchor));
if (excluded.length !== 2 || pending.length !== 65) {
  throw new Error(`expected 2 existing and 65 pending, got ${excluded.length} and ${pending.length}`);
}

const rows = pending.map(row => {
  const current = shortlistByAnchor.get(row.anchor);
  if (!current) throw new Error(`missing selected candidate: ${row.anchor}`);
  const status = swapReasons.has(row.anchor) ? 'SWAP' : 'LAND';
  const replacement = status === 'SWAP' ? chooseReplacement(row.anchor) : null;
  if (replacement && !replacement.selected) throw new Error(`no usable replacement for ${row.anchor}`);
  return {
    anchor: row.anchor,
    old: row,
    current,
    status,
    reason: swapReasons.get(row.anchor) || '三条判据均符合',
    replacement,
    final: replacement?.selected || current,
  };
});

const currentLand = rows.filter(row => row.status === 'LAND');
const swaps = rows.filter(row => row.status === 'SWAP');
const usable = rows.filter(row => row.final);
const noReplacement = swaps.filter(row => !row.replacement?.selected);

const stats = {
  external_lv: lv.length,
  existing_excluded: excluded.length,
  pending: pending.length,
  current_land: currentLand.length,
  current_swap: swaps.length,
  successful_swaps: swaps.length - noReplacement.length,
  unresolved_swaps: noReplacement.length,
  final_review_rows: usable.length,
  no_alt_total: lv.filter(row => row.alt === 0).length,
  no_alt_swaps: swaps.filter(row => row.old.alt === 0).length,
  swap_anchors: swaps.map(row => row.anchor),
  excluded_anchors: excluded.map(row => row.anchor),
};

const recalc = 'node scripts/wordfield-lv-review.mjs --stats';
const tableRows = usable.map((row, index) => {
  const label = row.status === 'SWAP' ? '换句' : '原句';
  const sentence = row.final;
  return `| ${index + 1} | ${label} | ${row.anchor} | ${sentence.jp} | ${sentence.zh} | ${sentence.metrics.jp_char_count} |`;
});
const sourceRows = usable.map(row => {
  const sentence = row.final;
  const label = row.status === 'SWAP' ? '替换' : '保留';
  return `| ${row.anchor} | ${label} | ${sentence.tatoeba.jp_sentence_id} | ${sentence.tatoeba.zh_sentence_id} | ${row.current.tatoeba.jp_sentence_id} | ${row.current.tatoeba.zh_sentence_id} |`;
});
const swapRows = swaps.map(row => {
  const replacement = row.replacement?.selected;
  return `| ${row.anchor} | ${row.reason} | ${row.old.jp} | ${replacement ? `${replacement.jp} / ${replacement.zh}` : '无可用备选'} |`;
});

const lines = [
  '# LV 65 条 · 待人工判断（只判断，不改写）',
  '',
  '> 以下是按项目标准筛出的 65 条：原句判定为 LAND 的 61 条，以及从 SWAP 备选池确定性换出的 4 条。不要生成替换句、不要改中文；每条只输出 `OK` 或 `SWAP`。',
  '>',
  '> 三条判据：句长 ≤16 字；不是课本造句、而是真实日语；目标词是语义重心而非背景板。词汇超出 N5 不扣分，口语缩约算优点。',
  '',
  '| # | 来源 | anchor | 日语 | 中文 | 字数 |',
  '|---:|---|---|---|---|---:|',
  ...tableRows,
  '',
  '## 来源定位（机器回读）',
  '',
  '| anchor | 处理 | 当前/新日句 ID | 当前/新中句 ID | 原选日句 ID | 原选中句 ID |',
  '|---|---|---:|---:|---:|---:|',
  ...sourceRows,
  '',
  '## SWAP 判定与换句',
  '',
  '| anchor | 判定理由 | 原句 | 确定性替换 |',
  '|---|---|---|---|',
  ...swapRows,
  '',
  '## 无可用备选',
  '',
  '本轮没有 SWAP 且无可用备选的条目。LV 全体中有 21 条无备选，但其中 0 条属于 SWAP；复算：`' + recalc + '`。',
  '',
];
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');

if (process.argv.includes('--stats')) {
  console.log(JSON.stringify(stats, null, 2));
} else {
  console.log(`external LV: ${stats.external_lv}`);
  console.log(`existing excluded: ${stats.existing_excluded}`);
  console.log(`pending: ${stats.pending}`);
  console.log(`current LAND: ${stats.current_land}`);
  console.log(`current SWAP: ${stats.current_swap}`);
  console.log(`successful swaps: ${stats.successful_swaps}`);
  console.log(`unresolved swaps: ${stats.unresolved_swaps}`);
  console.log(`final review rows: ${stats.final_review_rows}`);
  console.log(`no-alt total: ${stats.no_alt_total}`);
  console.log(`no-alt SWAP: ${stats.no_alt_swaps}`);
  console.log(`output: ${outputPath}`);
}
