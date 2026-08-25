import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = JSON.parse(fs.readFileSync(path.join(root, 'assets/content.fallback.json'), 'utf8'));
const cards = content.wordCards && typeof content.wordCards === 'object' && !Array.isArray(content.wordCards)
  ? content.wordCards
  : {};
const order = cards.order || {};
const filled = (value) => (typeof value === 'string' ? value.trim().length > 0 : value != null);
const count = (value) => Array.isArray(value) ? value.length : value && typeof value === 'object' ? Object.keys(value).length : 0;

const standardChecks = (card) => {
  const missing = [];
  if (!filled(card.sourceLabel) || !count(card.examples)) missing.push('真实：sourceLabel/examples');
  if (!filled(card.coreMeaning) || !filled(card.coreSentence) || !filled(card.coreTranslation) || !count(card.examples)) {
    missing.push('内容：coreMeaning/coreSentence/coreTranslation/examples');
  }
  if (!count(card.notes) && !filled(card.contextJa) && !filled(card.contextZh)) missing.push('意象：无 notes/context 可供人工复核');
  if (!count(card.notes) && !count(card.grammarBlocks) && !count(card.related)) missing.push('深度：notes/grammarBlocks/related');
  if (!count(card.skeletons)) missing.push('实用：skeletons');
  // 不赘、简洁、节奏、人类是文案质量标准，没有可诚实自动判定的字段。
  return missing;
};

const claimMarkers = /同源|同根|源自|来自|词源|语源|演变|祖语|直读/;
const explicitMemoryStory = /可以这样记|记忆联想|联想到|不是词源断言/;
const sourceBearing = (note) => Boolean(note?.etymologyClaim?.source || note?.source || note?.sources);
const sourceLessClaims = [];
for (const [cardId, card] of Object.entries(cards)) {
  for (const [noteId, note] of Object.entries(card.notes || {})) {
    const body = typeof note?.body === 'string' ? note.body : '';
    if (claimMarkers.test(body) && !explicitMemoryStory.test(body) && !sourceBearing(note)) {
      sourceLessClaims.push({ cardId, word: card.word, noteId, body: body.replace(/\s+/g, ' ') });
    }
  }
}

const kind = (value) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};
const topLevelShapeDifferences = (card) => Object.keys(order)
  .filter((key) => kind(card[key]) !== kind(order[key]))
  .concat(Object.keys(card).filter((key) => !(key in order)).map((key) => `extra:${key}`));

console.log('# Deep card audit');
console.log(`cards: ${Object.keys(cards).length}`);
console.log('Note: the nine-standard fields below are structural proxies; 不赘/简洁/节奏/人类仍需人工阅读判断。');
for (const [cardId, card] of Object.entries(cards)) {
  const missing = standardChecks(card);
  console.log(`\n## ${cardId} · ${card.word}`);
  console.log(`- structural gaps: ${missing.length ? missing.join('；') : 'none detected'}`);
  console.log(`- field counts: notes=${count(card.notes)}, grammarBlocks=${count(card.grammarBlocks)}, skeletons=${count(card.skeletons)}, examples=${count(card.examples)}, related=${count(card.related)}`);
  console.log(`- top-level shape differences from order: ${topLevelShapeDifferences(card).join(', ') || 'none'}`);
}
console.log('\n## Source-less etymology-like claims');
if (!sourceLessClaims.length) console.log('- none detected by marker scan');
for (const claim of sourceLessClaims) console.log(`- ${claim.cardId}.notes.${claim.noteId} (${claim.word}): ${claim.body}`);
