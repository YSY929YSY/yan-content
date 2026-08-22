#!/usr/bin/env node

// 只读内容体检：统计来自 fallback 的当前事实，不修正内容，也不写报告。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const content = JSON.parse(readFileSync(resolve(root, 'assets/content.fallback.json'), 'utf8'));
const wordBank = Array.isArray(content.wordBank) ? content.wordBank : [];
const pitchConfidence = JSON.parse(readFileSync(resolve(root, 'staging/pitch-confidence.json'), 'utf8'));
const levels = pitchConfidence.levels || {};

const countBy = (items, keyOf) => items.reduce((out, item) => {
  const key = String(keyOf(item));
  out[key] = (out[key] || 0) + 1;
  return out;
}, {});

const filled = (value) => typeof value === 'string' ? value.trim() !== '' : value != null;
const scenesOf = (word) => {
  const value = word?.tags?.scene;
  const tags = Array.isArray(value) ? value : [value];
  return tags.filter((tag) => typeof tag === 'string' && tag !== 'daily');
};
const hasWordField = (value) => {
  const fields = Array.isArray(value) ? value : (value ? [value] : []);
  return fields.some((field) => filled(field?.sentence?.jp));
};
const coverage = (label, predicate) => {
  const count = wordBank.filter(predicate).length;
  console.log(`${label}: ${count}/${wordBank.length} (${(count / wordBank.length * 100).toFixed(1)}%)`);
};

console.log('content-stats: assets/content.fallback.json (read-only)');
console.log(`wordBank.total: ${wordBank.length}`);
console.log(`level: ${JSON.stringify(countBy(wordBank, (word) => word.level || '(missing)'))}`);
console.log(`status: ${JSON.stringify(countBy(wordBank, (word) => word.status || '(missing)'))}`);

const sceneCounts = countBy(wordBank.flatMap(scenesOf), (scene) => scene);
const dailyTagged = wordBank.filter((word) => {
  const value = word?.tags?.scene;
  return (Array.isArray(value) ? value : [value]).includes('daily');
}).length;
console.log(`tags.scene.effective: ${JSON.stringify(sceneCounts)}`);
console.log(`tags.scene.daily_tagged: ${dailyTagged}`);
console.log(`tags.scene.words_with_any_tag: ${wordBank.filter((word) => scenesOf(word).length > 0 || word?.tags?.scene).length}`);

console.log('coverage:');
coverage('  exampleJp', (word) => filled(word.exampleJp));
coverage('  coreChunk', (word) => filled(word.coreChunk));
coverage('  jmdictSeq', (word) => filled(word.jmdictSeq));
coverage('  pitch', (word) => word.pitch && typeof word.pitch === 'object' && Number.isFinite(word.pitch.accent));
coverage('  wordField', (word) => hasWordField(word.wordField));

console.log(`freq.method: ${JSON.stringify(countBy(wordBank, (word) => word.freq?.method || '(missing)'))}`);
console.log(`freq.df_zero: ${wordBank.filter((word) => word.freq?.df === 0).length}`);
console.log(`freq.df_null: ${wordBank.filter((word) => word.freq?.df === null).length}`);
console.log(`pitch.agree: ${JSON.stringify(countBy(wordBank.filter((word) => word.pitch), (word) => word.pitch.agree ?? '(missing)'))}`);
console.log(`publication.dictionary: ${wordBank.filter((word) => word.publication?.dictionary === true).length}`);
console.log(`publication.learning: ${wordBank.filter((word) => word.publication?.learning === true).length}`);

const anchors = wordBank.filter((word) => (word.yanFeatures || []).includes('kanji_anchor'));
console.log(`kanji_anchor.total: ${anchors.length}`);
console.log(`kanji_anchor.complete: ${anchors.filter((word) => filled(word.exampleJp) && filled(word.coreChunk) && filled(word.jmdictSeq) && word.pitch?.accent != null).length}/${anchors.length}`);
console.log(`kanji_anchor.missing: ${JSON.stringify({
  exampleJp: anchors.filter((word) => !filled(word.exampleJp)).length,
  coreChunk: anchors.filter((word) => !filled(word.coreChunk)).length,
  jmdictSeq: anchors.filter((word) => !filled(word.jmdictSeq)).length,
  pitch: anchors.filter((word) => word.pitch?.accent == null).length,
})}`);

const confidenceAgreeZero = Object.values(levels).filter((entry) => entry?.agree === 0).length;
console.log('known_differences:');
console.log(`  _meta.note says 8026; measured wordBank.total is ${wordBank.length}; difference=${8026 - wordBank.length}`);
console.log(`  staging/pitch-confidence.json agree=0 is ${confidenceAgreeZero}; commit 81efe21 said 15; difference=${confidenceAgreeZero - 15}`);

