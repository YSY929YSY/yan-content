#!/usr/bin/env node
// 中文释义体检 —— 把「靠人眼扫」换成「机器先挑出可疑的」。
//
// 为什么需要它:2026-08-22 我们把便利店 35 条开成了学习内容,然后我把一张
// 35 行的表丢给项目负责人人工审。这是错的分工 —— JMdict 里有大量结构化事实
// 根本没被用上:
//
//   · partOfSpeech 里的 vi/vt(自他动词)—— 「要る」标着 vi,全部 gloss 都是
//     "to be needed" 的被动式,而中文写的是「需要」(中文里及物)。语感对不上,
//     **机器本来就查得出来**。
//   · sense 是分组的 —— 「買う」有「买」「赏识」「招致」几个独立义项,
//     拍平成一个分号串看起来像 20 个意思,那是呈现错误不是数据问题。
//   · sense 数 vs 中文分段数 —— 中文只写了一个义项而 JMdict 有五个,
//     不一定错(教学上本来就该减),但值得看一眼。
//
// 多源证明得了词形/读音/词性/英文 gloss,证明不了「便利店场景里该翻成什么」——
// 那是教学取舍,只能人定。但机器应该把**需要人定的那几条挑出来**,
// 而不是让人从头扫一遍。
//
// 只读,不写任何文件。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const content = JSON.parse(readFileSync(resolve(root, 'assets/content.fallback.json'), 'utf8'));
const jm = JSON.parse(readFileSync(resolve(root, 'staging/jmdict-eng-3.6.2.json'), 'utf8'));

// 按「词面+读音」建索引 —— 不是词面单独,那是 bff04fc 的教训。
const bySurfaceReading = new Map();
const bySeq = new Map();
for (const w of jm.words) {
  bySeq.set(String(w.id), w);
  for (const k of [...(w.kanji || []), ...(w.kana || [])]) {
    for (const r of (w.kana || [])) {
      bySurfaceReading.set(`${k.text}\t${r.text}`, w);
    }
  }
}

const scene = process.argv[2] || 'convenience';
const words = content.wordBank.filter(w => (w.tags?.scene || []).includes(scene));

/** 中文释义按「；」「;」分段 —— 这是内容包里表示义项的写法。 */
const zhSenses = (s) => String(s || '').split(/[;；]/).map(x => x.trim()).filter(Boolean);

/** 及物性:vt 他动词 / vi 自动词。一个词条可能两者都有(不同 sense)。 */
const transitivity = (entry) => {
  const pos = new Set((entry?.sense || []).flatMap(s => s.partOfSpeech || []));
  return { vi: pos.has('vi'), vt: pos.has('vt') };
};

/** 中文看起来像及物动词:「动词 + 宾语」或单个及物动词。粗判据,只用于挑可疑项。 */
const looksTransitiveZh = (zh) => /^(需要|放入|装入|买|购买|支付|付|找|寻找|带|拿|使用|用)/.test(String(zh || '').trim());

const rows = [];
for (const w of words) {
  const entry = (w.jmdictSeq && bySeq.get(String(w.jmdictSeq)))
    || bySurfaceReading.get(`${w.word}\t${w.reading}`)
    || null;

  const flags = [];
  if (!entry) {
    flags.push('JMDICT_未命中');
  } else {
    const { vi, vt } = transitivity(entry);
    const senses = entry.sense || [];
    const zh = zhSenses(w.meaning_zh);

    // ★ 这一条就是「要る」那类:JMdict 说它只自动词,中文却写成及物。
    if (vi && !vt && looksTransitiveZh(w.meaning_zh)) {
      flags.push('自他不符:JMdict 标 vi(不及物),中文像及物');
    }
    if (senses.length >= 3 && zh.length === 1) {
      flags.push(`义项覆盖:JMdict ${senses.length} 义 / 中文 1 义`);
    }
    if (w.meaning_zh_status !== 'human_reviewed' && senses.length >= 5) {
      flags.push(`高多义未审:${senses.length} 义`);
    }
  }

  rows.push({ w, entry, flags });
}

const suspect = rows.filter(r => r.flags.length);
const clean = rows.filter(r => !r.flags.length);

console.log(`场景 ${scene}:${words.length} 条,机器挑出 ${suspect.length} 条需要人看,${clean.length} 条无异常\n`);

for (const { w, entry, flags } of suspect) {
  console.log(`── ${w.word}(${w.reading})  中文:${w.meaning_zh}  ${w.meaning_zh_status ? `[${w.meaning_zh_status}]` : '[未审]'}`);
  for (const f of flags) console.log(`   ⚠ ${f}`);
  if (entry) {
    (entry.sense || []).forEach((s, i) => {
      const pos = (s.partOfSpeech || []).join(',');
      const g = (s.gloss || []).map(x => x.text).join('; ');
      console.log(`   义项${i + 1} [${pos}] ${g}`);
    });
  }
  console.log('');
}

if (clean.length) {
  console.log('无异常(机器判定,不代表教学上最优):');
  console.log('  ' + clean.map(r => r.w.word).join(' '));
}
