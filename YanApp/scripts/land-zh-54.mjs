#!/usr/bin/env node

// Land the 27 owner-approved ZH 54 word fields into both content copies.
// Default mode is read-only; --write is the one content-window mutation.

import fs from 'node:fs';
import path from 'node:path';
import { buildWordFieldAlignment, dictionaryFormsFrom } from '../src/features/wordbank/wordFieldAlignment.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const fallbackPath = path.join(root, 'assets/content.fallback.json');
const authorityPath = path.resolve(root, '../yan-content/content.v2.json');
const rawPath = path.join(root, 'staging/wordfield-candidates-tatoeba.jsonl');
const tokensPath = path.join(root, 'assets/example_tokens.json');

const approved = [
  ['n5_aku', '靴下に穴が開いているよ。', '袜子上破了个洞呀。', ['n5_aku', 'n5_kutsushita'], 179233, 8593083],
  ['n5_aruku', '少し歩くと駅に出ます。', '走一小段路就到车站了。', ['n5_aruku', 'n5_deru', 'n5_eki', 'n5_sukoshi'], 146778, 13942584],
  ['n5_ashi', '靴がきつくて足が痛い。', '鞋太紧了，脚疼。', ['n5_ashi', 'n5_itai', 'n5_kutsu'], 179262, 1783815],
  ['n5_bunshou', '先生、この文章は正しいですか？', '老师，这段文字写得对吗？', ['n5_bunshou', 'n5_sensei'], 11243008, 13920702],
  ['n5_hai_2', 'コーヒー一杯ください。', '请给（我）一杯咖啡。', ['n5_hai_2', 'n5_ichi'], 224848, 1109528],
  ['n5_hanashi', '話を続けて下さい。', '请继续说下去。', ['n5_hanashi', 'n5_kudasai'], 77144, 2004697],
  ['n5_hikui', '私はとても背が低い。', '我个子很矮。', ['n5_hikui', 'n5_sei', 'n5_watakushi'], 2349246, 512866],
  ['n5_itai', '先生、お腹が痛いんです。', '老师，（我）肚子疼。', ['n5_itai', 'n5_onaka', 'n5_sensei'], 1126049, 10540451],
  ['n5_kaku', '彼は時々手紙を書いた。', '他偶尔写信。', ['n5_kaku', 'n5_tegami', 'n5_tokidoki'], 105279, 10275159],
  ['n5_ki', '鳥は木に巣を作る。', '鸟儿在树上筑巢。', ['n5_ki', 'n5_tori', 'n5_tsukuru'], 125775, 9453440],
  ['n5_kiku', '名前が呼ばれるのを聞いた。', '（我）听到有人叫（我的）名字。', ['n5_kiku', 'n5_namae', 'n5_yobu'], 80788, 495606],
  ['n5_kotaeru', '私の質問に答えなさい。', '回答我的问题。', ['n5_kotaeru', 'n5_shitsumon', 'n5_watakushi'], 163451, 784532],
  ['n5_kuchi', 'あいつは口の悪いやつだ。', '他这人说话很刻薄。', ['n5_kuchi', 'n5_warui'], 234619, 8508417],
  ['n5_kyoudai', '彼女には兄弟が三人いる。', '她有三个兄弟姐妹。', ['n5_kyoudai', 'n5_nin', 'n5_san_2'], 89846, 8940730],
  ['n5_nomu', '彼女は時々ワインを少し飲む。', '她偶尔喝点葡萄酒。', ['n5_nomu', 'n5_sukoshi', 'n5_tokidoki'], 89165, 342762],
  ['n5_nugu', '彼は上着を脱いだ。', '他脱下了外套。', ['n5_nugu', 'n5_uwagi'], 103995, 1071000],
  ['n5_oshieru', '先生が教えた。', '老师教了。', ['n5_oshieru', 'n5_sensei'], 6828208, 8835055],
  ['n5_shashin', 'この写真はどこで撮ったの？', '这张照片是在哪儿拍的？', ['n5_shashin', 'n5_toru_2'], 2998816, 2998814],
  ['n5_watakushi', '私は山にいました。', '我在山里。', ['n5_watakushi', 'n5_yama'], 4715, 15],
  ['n5_dekakeru', '彼は今出かけるところだ。', '他正要出门。', ['n5_dekakeru', 'n5_ima'], 107131, 8499945],
  ['n5_iru_2', '言葉だけの優しさなんて要らない。', '（我）不需要只停留在嘴上的温柔。', ['n5_iru_2', 'n5_kotoba'], 3309009, 11122919],
  ['n5_karada', '魚を食べることは体にいい。', '吃鱼对身体有好处。', ['n5_karada', 'n5_sakana', 'n5_taberu'], 182091, 1878291],
  ['n5_kaze_2', '私は彼に風邪をうつした。', '我把感冒传染给他了。', ['n5_kaze_2', 'n5_watakushi'], 154058, 1423995],
  ['n5_tsukue', '机の上を片付けよう。', '把桌面收拾一下吧。', ['n5_tsukue', 'n5_ue'], 183412, 333524],
  ['n5_kata', 'あの方は八十歳です。', '那位八十岁了。', ['n5_kata', 'n5_sai'], 13225083, 13526849],
  ['n5_namae', '私は彼の名前を知らない。', '我不知道他叫什么名字。', ['n5_namae', 'n5_shiru', 'n5_watakushi'], 153785, 505677],
  ['n5_atatakai', '三月にはもっと暖かくなるだろう。', '到了三月会变得更温暖吧。', ['n5_atatakai', 'n5_gatsu', 'n5_san_2'], 169507, 5849914],
].map(([anchor, jp, zh, members, jpId, zhId]) => ({ anchor, jp, zh, members, jpId, zhId }));

if (approved.length !== 27 || new Set(approved.map(row => row.anchor)).size !== 27) throw new Error('approved 27-row set drifted');

const fallback = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
const authority = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
if (JSON.stringify(fallback) !== JSON.stringify(authority)) throw new Error('content copies differ before landing');
const byId = new Map(fallback.wordBank.map(word => [word.id, word]));
const raw = fs.readFileSync(rawPath, 'utf8').trim().split('\n').map(JSON.parse);
const rawByKey = new Map(raw.map(row => [`${row.anchor_id}\0${row.jp}\0${row.tatoeba?.jp_sentence_id}\0${row.tatoeba?.zh_sentence_id}`, row]));
const dictionaryForms = dictionaryFormsFrom(JSON.parse(fs.readFileSync(tokensPath, 'utf8')));
const memberVariants = value => String(value || '').split(/[;；|]/).map(part => part.trim()).filter(Boolean);
const appearsInSentence = (sentence, word) => {
  if (memberVariants(word.word).some(value => sentence.includes(value))) return true;
  for (const [surface, forms] of dictionaryForms) {
    if (typeof surface !== 'string' || !(forms instanceof Set) || !sentence.includes(surface) || forms.size !== 1) continue;
    if (memberVariants(word.word).some(value => forms.has(value)) || forms.has(word.reading)) return true;
  }
  return false;
};

for (const row of approved) {
  const word = byId.get(row.anchor);
  if (!word) throw new Error(`missing anchor: ${row.anchor}`);
  if (word.wordField && word.wordField.sentence?.jp !== row.jp) throw new Error(`would overwrite existing wordField: ${row.anchor}`);
  const source = rawByKey.get(`${row.anchor}\0${row.jp}\0${row.jpId}\0${row.zhId}`);
  if (!source) throw new Error(`missing exact Tatoeba staging record: ${row.anchor}`);
  if (JSON.stringify(source.member_word_ids) !== JSON.stringify(row.members)) throw new Error(`members drifted from staging: ${row.anchor}`);
  for (const id of row.members) if (!byId.has(id)) throw new Error(`missing member: ${row.anchor} -> ${id}`);
  const aligned = buildWordFieldAlignment(row.jp, fallback.wordBank, dictionaryForms);
  if (aligned.map(token => token.jp).join('') !== row.jp) throw new Error(`alignment does not round-trip: ${row.anchor}`);
}

const renderedMembers = row => row.members.filter(id => appearsInSentence(row.jp, byId.get(id)));
for (const row of approved) {
  if (!renderedMembers(row).length) throw new Error(`no renderable member remains: ${row.anchor}`);
}

const countFields = content => content.wordBank.filter(word => word.wordField?.sentence?.jp).length;
if (![249, 276].includes(countFields(fallback))) throw new Error(`expected 249 or 276 fields, got ${countFields(fallback)}`);

const next = content => {
  const output = structuredClone(content);
  for (const row of approved) {
    const word = output.wordBank.find(item => item.id === row.anchor);
    word.wordField = {
      // Staging is provenance, not the renderer contract: only retain source
      // members which the same dictionary-form path can resolve in this sentence.
      members: renderedMembers(row).map(id => ({ id })),
      sentence: { jp: row.jp, zh: row.zh },
      source: { provider: 'Tatoeba', jp_sentence_id: row.jpId, zh_sentence_id: row.zhId },
    };
  }
  if (countFields(output) !== 276) throw new Error(`expected 276 fields after landing, got ${countFields(output)}`);
  if (output.wordBank.length !== 8005) throw new Error(`wordBank count drifted: ${output.wordBank.length}`);
  if (output.wordBank.filter(word => (word.yanFeatures || []).includes('kanji_anchor')).length !== 563) throw new Error('kanji_anchor count drifted');
  if (!['2.8', '2.9'].includes(output._meta?.version)) throw new Error(`expected version 2.8 or 2.9, got ${output._meta?.version}`);
  if (output._meta.version === '2.8') output._meta.version = '2.9';
  return output;
};

if (process.argv.includes('--write')) {
  const fallbackText = `${JSON.stringify(next(fallback), null, 1)}\n`;
  const authorityText = `${JSON.stringify(next(authority), null, 1)}\n`;
  if (fallbackText !== authorityText) throw new Error('generated content copies differ');
  for (const [target, text] of [[fallbackPath, fallbackText], [authorityPath, authorityText]]) {
    const temporary = `${target}.zh54.tmp`;
    try { fs.writeFileSync(temporary, text, 'utf8'); fs.renameSync(temporary, target); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  console.log('wrote both content copies');
}

console.log(`approved: ${approved.length}`);
console.log(`wordField: ${countFields(fallback)} -> 276`);
console.log(`write: ${process.argv.includes('--write')}`);
