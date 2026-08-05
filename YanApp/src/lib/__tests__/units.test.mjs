// 可复习单元的构建。
//
// 分两部分:
//   前半是纯逻辑(键怎么生成、缺字段怎么办),用手写的假数据;
//   后半直接跑**真实内容包** —— 这一层的全部价值就是「把五种形状归一」,
//   而它归的那五种形状不在代码里,在 content.fallback.json 里。
//   内容包改了字段名而这里没跟上,是最可能发生也最难发现的失配:
//   界面不会崩,只是复习队列里悄悄少了一整个来源。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SOURCES, unitKey, sourceOf,
  fromWord, fromCard, fromPlace, fromScenePhrase, fromSubwayPhrase,
  buildUnits, indexUnits, countBySource,
} from '../../features/review/units.js';

const content = JSON.parse(
  readFileSync(new URL('../../../assets/content.fallback.json', import.meta.url), 'utf8')
);

// ── 键 ────────────────────────────────────────────────────────

test('词的键是裸的,不带前缀 —— 线上进度和云端表都是这个格式,加前缀等于所有人进度归零', () => {
  assert.equal(unitKey('word', '水-みず'), '水-みず');
  assert.equal(sourceOf('水-みず'), 'word');
});

test('其它来源带前缀,且能反解回来', () => {
  assert.equal(unitKey('place', 'mihara'), 'place:mihara');
  assert.equal(sourceOf('place:mihara'), 'place');
  assert.equal(sourceOf('card:order:sk1'), 'card');
});

test('认不出的前缀当成词 —— 冒号可能本来就在词里,不能因此丢一条记录', () => {
  assert.equal(sourceOf('謎:なぞ'), 'word');
  assert.equal(sourceOf(''), 'word');
  assert.equal(sourceOf(null), 'word');
});

// ── 缺字段 ────────────────────────────────────────────────────

test('问或答缺一个就不产出这条题 —— 半道题比没题更糟', () => {
  assert.equal(fromWord({ word: '水', reading: 'みず' }), null, '没有释义就没有答案');
  assert.equal(fromWord({}), null);
  assert.equal(fromWord(null), null);
  assert.equal(fromPlace({ id: 'x', memory: { review: { prompt: '问' } } }), null,
    'review 只有 prompt 没有 answer 时不成题(内容里这种情况真实存在)');
  assert.equal(fromScenePhrase('s', 'l', { id: 1, jp: '' }), null);
});

test('空白字符不算内容', () => {
  assert.equal(fromWord({ word: '水', reading: 'みず', meaning_zh: '   ' }), null);
});

// ── 两种问法 ──────────────────────────────────────────────────

test('词是「认」:正面只给汉字,读音藏在背面 —— 读音才是要考的东西', () => {
  const u = fromWord({ word: '注文', reading: 'ちゅうもん', meaning_zh: '点餐', pos: '名词', level: 'N4' });
  assert.equal(u.mode, 'recall');
  assert.equal(u.ask, '注文');
  assert.ok(!u.askSub, '正面不能带读音,带了这题就白考了');
  assert.equal(u.answer, '点餐');
  assert.equal(u.answerSub, 'ちゅうもん');
});

test('句子是「说」:正面给中文情境,背面给日文', () => {
  const u = fromScenePhrase('restaurant', '餐厅', {
    id: 1, jp: '二人です。', roma: 'Futari desu', zh: '两个人。', scene: '进门站在入口',
  });
  assert.equal(u.mode, 'produce');
  assert.equal(u.ask, '两个人。');
  assert.equal(u.answer, '二人です。');
  assert.equal(u.answerSub, 'Futari desu');
  assert.equal(u.hint, '进门站在入口');
});

test('朗读的永远是日文那一面,不是中文提示', () => {
  const u = fromScenePhrase('s', 'l', { id: 1, jp: '二人です。', zh: '两个人。' });
  assert.equal(u.speak, '二人です。');
});

// ── 深卡 ──────────────────────────────────────────────────────

test('一张深卡产出核心句 + 每个骨架替换', () => {
  const card = {
    word: '注文', coreMeaning: '点餐 · 下单', sourceLabel: '餐厅点餐',
    coreSentence: 'すみません、注文をお願いします。',
    coreTranslation: '不好意思，我要点餐了。',
    skeletonSuffix: 'をお願いします',
    skeletons: [
      { jp: '会計をお願いします', zh: '麻烦结账' },
      { jp: '予約をお願いします', zh: '麻烦预约' },
    ],
  };
  const us = fromCard('order', card);
  assert.equal(us.length, 3);
  assert.equal(us[0].key, 'card:order:core');
  assert.equal(us[1].key, 'card:order:sk0');
  assert.equal(us[1].ask, '麻烦结账');
  assert.equal(us[1].answer, '会計をお願いします');
  assert.equal(us[1].hint, '…をお願いします', '想不起来时给脚手架,比直接看答案有价值');
  assert.ok(us.every(u => u.origin === '餐厅点餐'));
});

test('深卡没有骨架时只出核心句,不报错', () => {
  const us = fromCard('x', { word: 'w', coreSentence: 'あ', coreTranslation: '啊' });
  assert.equal(us.length, 1);
});

test('坏卡产出空数组而不是抛', () => {
  assert.deepEqual(fromCard('x', null), []);
  assert.deepEqual(fromCard('x', {}), []);
});

// ── 地铁键的稳定性 ────────────────────────────────────────────

test('地铁句的键用句子本身,不用下标 —— 内容包插一句进去不能让所有进度串位', () => {
  const st = { id: 'st1', name: 'A', nameZh: '甲站' };
  const a = fromSubwayPhrase(st, { jp: 'Suicaをください', zh: '请给我一张Suica' });
  const b = fromSubwayPhrase(st, { jp: '切符はどこですか', zh: '票在哪买' });
  assert.equal(a.key, 'subway:st1:Suicaをください');
  assert.notEqual(a.key, b.key);
  // 在它们中间插一句,a 的键不变
  const a2 = fromSubwayPhrase(st, { jp: 'Suicaをください', zh: '请给我一张Suica' });
  assert.equal(a2.key, a.key);
});

// ── 真实内容包 ────────────────────────────────────────────────

test('真实内容包能建出单元,四个来源一个都不缺', () => {
  const units = buildUnits(content);
  const n = countBySource(units.map(u => u.key));
  assert.ok(n.card > 0, '深卡一条都没建出来,多半是 wordCards 的字段名变了');
  assert.ok(n.place > 0, '地点记忆卡一条都没建出来');
  assert.ok(n.scene > 0, '场景句一条都没建出来');
  assert.ok(n.subway > 0, '地铁句一条都没建出来');
  assert.equal(n.word, 0, '词库不在这里展平,8298 条不该进这个数组');
});

test('真实内容包建出的每条单元都问得成、答得出', () => {
  for (const u of buildUnits(content)) {
    assert.ok(u.ask && u.answer, `${u.key} 缺问或答`);
    assert.ok(SOURCES.includes(sourceOf(u.key)), `${u.key} 来源认不出`);
    assert.ok(u.mode === 'recall' || u.mode === 'produce', `${u.key} 问法认不出`);
  }
});

test('真实内容包里没有重键 —— 撞键会让两条内容共用一份复习进度', () => {
  const units = buildUnits(content);
  const keys = units.map(u => u.key);
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  assert.deepEqual([...new Set(dup)], [], '重复的键');
  assert.equal(Object.keys(indexUnits(units)).length, units.length);
});

test('真实词库前 200 条都能建成单元 —— 建不成说明有词条缺释义', () => {
  const bad = content.wordBank.slice(0, 200).filter(w => !fromWord(w));
  assert.deepEqual(bad.map(w => w.word), []);
});

// 这条是给内容作者看的:数字掉下去说明有内容退化了,不是代码坏了。
test('留个数字在这儿,方便看出内容有没有长', () => {
  const n = countBySource(buildUnits(content).map(u => u.key));
  console.log('  当前可复习单元:', JSON.stringify(n));
  assert.ok(n.card + n.place + n.scene + n.subway >= 100,
    `深内容单元总数 ${n.card + n.place + n.scene + n.subway},比预期少`);
});
