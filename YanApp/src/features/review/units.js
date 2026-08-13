// 言 · 可复习单元
//
// 问题:产品里能学的东西有五个来源 —— 8298 条词库、8 张深卡、43 个地点的记忆卡、
// 6 个场景的 74 句、地铁冒险的 5 站。但只有词库那一条产生复习记录。
// 用户在地铁通关的句子、在深卡里学的骨架、在三原山记的那句话,明天系统一句都不会问他。
//
// 更要命的是比例:间隔复习只跑在词库上,而词库是最浅的那条(没有意象、没有词源、
// 没有汉字锚)。功利腿有回流机制会自己变粗,灵魂腿是静态的 —— 写得再好也只被看一次。
//
// 这个文件把五个来源归一成同一种东西:**一问一答**。
//
//   { key, mode, ask, answer, ... }
//
// 归一之后,srs.js 那套间隔算法一行都不用改 —— 它只认 key 和记录,
// 不关心 key 背后是一个词还是一句话。复习页也只需要认识两种问法。
//
// 为什么是「一问一答」而不是「一张卡」:深卡不是闪卡。注文那张有意象、有词源、
// 有骨架替换,把它整张塞进「忘了/一般/会了」的框里,等于拿背单词的形状去套内容。
// 但深卡**里面**有可考的东西(骨架替换),地点记忆卡里本来就写好了 review.prompt/answer。
// 提取那个,而不是把整张卡当卡片。
//
// 纯函数,不碰存储、不碰 React。
import { isDue } from '../wordbank/srs.js';

// ── 键 ────────────────────────────────────────────────────────
//
// ⚠️ 词的键必须保持裸的「词-读音」,不加前缀。
// 这不是风格问题:线上用户的 yan_wordbank_progress 和云端 word_progress 表里
// 已经是这个格式,加前缀等于所有人的进度一夜归零。新来源才带前缀。

export const SOURCES = ['word', 'card', 'place', 'scene', 'subway', 'field'];

export const unitKey = (source, id) => (source === 'word' ? String(id) : `${source}:${id}`);

/** 从键反推来源。用于统计「今天要复习的里有几条是深内容」。 */
export const sourceOf = (key) => {
  const i = String(key || '').indexOf(':');
  if (i < 0) return 'word';
  const s = String(key).slice(0, i);
  return SOURCES.includes(s) ? s : 'word';
};

// ── 两种问法 ──────────────────────────────────────────────────
//
// recall(认):正面给日文,背面给读音和意思。
//   为什么不反过来(中文→日文):词库里大量词的中文释义是多义的
//   ——「啊（恍然/应答）」你没法从它推回「ああ」,那道题本身就不成立。
//   而对中文母语者,汉字词真正难的是读音,正面藏起读音才是在考东西。
//
// produce(说):正面给情境中文,背面给日文原句。
//   句子不一样 —— 旅行者需要的是「这个处境下我该说什么」,
//   给中文让他产出日文,才是他在现场真正要做的事。

const clean = (v) => (v == null ? '' : String(v).trim());

function unit({ key, mode, lang = 'ja-JP', ask, askSub, answer, answerSub, hint, speak, origin }) {
  if (!key || !clean(ask) || !clean(answer)) return null;   // 问或答缺一个,这条题就不成立
  return {
    key,
    mode,
    lang,
    ask: clean(ask),
    askSub: clean(askSub) || null,
    answer: clean(answer),
    answerSub: clean(answerSub) || null,
    hint: clean(hint) || null,
    // 朗读的是日文那一面。没有日文可读的(纯中文提示)就不给喇叭,
    // 给一个按下去念中文的喇叭比没有喇叭更让人困惑。
    speak: clean(speak) || null,
    origin: clean(origin) || null,
  };
}

// ── 五个来源 ──────────────────────────────────────────────────

/** 词库。键沿用旧格式,见上面的警告。 */
export function fromWord(w) {
  if (!w?.word) return null;
  return unit({
    key: unitKey('word', `${w.word}-${w.reading}`),
    mode: 'recall',
    ask: w.word,
    answer: w.meaning_zh || w.meaning_en,
    answerSub: w.reading,
    hint: w.pos,
    speak: w.word,
    origin: w.level,
  });
}

/**
 * 深卡。一张卡产出多条:核心句 + 每个骨架替换。
 *
 * 骨架替换本来就是「换个请求」的练习(注文をお願いします → 会計をお願いします),
 * 它天生是一问一答,不需要为了复习硬造题目。
 */
export function fromCard(cardId, card) {
  if (!card?.word) return [];
  const out = [];
  const origin = card.sourceLabel || card.word;

  const core = unit({
    key: unitKey('card', `${cardId}:core`),
    mode: 'produce',
    ask: card.coreTranslation,
    answer: card.coreSentence,
    hint: card.coreMeaning,
    speak: card.coreSentence,
    origin,
  });
  if (core) out.push(core);

  (card.skeletons || []).forEach((sk, i) => {
    const u = unit({
      key: unitKey('card', `${cardId}:sk${i}`),
      mode: 'produce',
      ask: sk.zh,
      answer: sk.jp,
      // 骨架的后缀是现成的脚手架:「____をお願いします」,
      // 想不起来时给这个,比直接看答案有价值
      hint: card.skeletonSuffix ? `…${card.skeletonSuffix}` : null,
      speak: sk.jp,
      origin,
    });
    if (u) out.push(u);
  });

  return out;
}

/**
 * 地点记忆卡。
 *
 * memory.review 里本来就写着 { prompt, answer, hint } —— 内容作者早就按
 * 一问一答的形状写好了,只是界面从来没渲染过 answer,也没人把它接进复习。
 */
export function fromPlace(place) {
  const r = place?.memory?.review;
  if (!r) return null;
  return unit({
    key: unitKey('place', place.id),
    mode: 'produce',
    lang: place.memory?.language?.code || place.lang,
    ask: r.prompt,
    answer: r.answer,
    hint: r.hint,
    speak: r.answer,
    origin: place.name,
  });
}

/**
 * 词场句。
 *
 * 词场不是并列的近义词块,是一个让成员同框出现的句子 ——
 * 「秋、山が紅葉する頃、温泉に行く」。这句话同时是例句、是词场、是一道复习题,
 * 一份内容三个用途。做成并列词块试过一次,失败了:秋是季节、山是地点、
 * 温泉是同时会做的事,三种关系摊平之后读者看不出相关性。
 * 详见 docs/content-standard-wordfield.md。
 */
export function fromWordField(w) {
  return wordFieldUnits(w)[0] || null;
}

/**
 * 一个词可以有**多个**词场。
 *
 * 三次撞上才定的(大丈夫、びっしょり、蒸す):同一个词的两种用法出现在完全不同的
 * 场合 —— 「もう大丈夫です」(摔了一跤有人来扶)和「大丈夫です」(便利店问要不要袋子,
 * 这是婉拒)身边站的词毫无交集。硬塞进一个句子只会两头不像。
 *
 * 但**仍然是一张卡**:词性/读音/多义都并列在同一张卡上,这是标准第四节定死的
 * (同字多读也是两条并列,不是两张卡)。用户的原话:分成两张会让人以为是两个词。
 *
 * 存储形状:`wordField` 既接对象也接数组。归一在这一处做 —— 和 srs.js 的
 * normalizeRecord 同一个套路,读取是唯一入口,不存在「迁一半」的中间态。
 */
export const wordFieldsOf = (w) => {
  const f = w?.wordField;
  const list = Array.isArray(f) ? f : (f ? [f] : []);
  return list.filter(x => x?.sentence?.jp);
};

export function wordFieldUnits(w) {
  const base = w?.id || `${w?.word}-${w?.reading}`;
  return wordFieldsOf(w).map((f, i) => unit({
    // 第一个词场保留原来的键 —— 已经在复习的进度不能因为加了第二个场就作废。
    // 后续的挂 #2、#3,和第一个各自独立计进度(它们本来就是两道不同的题)。
    key: unitKey('field', i === 0 ? base : `${base}#${i + 1}`),
    mode: 'produce',
    ask: f.sentence.zh,
    answer: f.sentence.jp,
    answerSub: f.sentence.roma,
    speak: f.sentence.jp,
    origin: w.word,
  }));
}

/** 场景句。hook 是现成的记忆钩子,拿来当提示。 */
export function fromScenePhrase(sceneId, sceneLabel, p) {
  if (!p) return null;
  return unit({
    key: unitKey('scene', `${sceneId}:${p.id}`),
    mode: 'produce',
    ask: p.zh,
    answer: p.jp,
    answerSub: p.roma,
    hint: p.scene || p.hook,
    speak: p.jp,
    origin: sceneLabel,
  });
}

/** 地铁冒险。站内句子没有 id。 */
export function fromSubwayPhrase(station, p) {
  if (!p || !station?.id) return null;
  return unit({
    // 用句子本身做键而不是下标:内容包会更新,插一句进去会让所有下标错位,
    // 用户的进度就整体串到别的句子上。文本变了顶多是新起一条记录,不会串。
    key: unitKey('subway', `${station.id}:${p.jp}`),
    mode: 'produce',
    ask: p.zh,
    answer: p.jp,
    speak: p.jp,
    origin: station.nameZh || station.name,
  });
}

// ── 全量构建 ──────────────────────────────────────────────────

/**
 * 从内容包构建全部可复习单元。
 *
 * 词库那 8298 条**不在这里**:它太大,而且词书页有自己的列表和筛选,
 * 不需要预先展平成单元。复习页要哪个词的时候按键现查即可。
 * 这个函数负责的是「除词库外的四个来源」—— 它们加起来才几百条,
 * 一次建好放内存里最简单。
 */
export function buildUnits(content) {
  const out = [];
  if (!content) return out;

  for (const [id, card] of Object.entries(content.wordCards || {})) {
    out.push(...fromCard(id, card));
  }

  // 词场句。词库整体不在这里展平(8298 条太大),但带 wordField 的只有精选的几百条,
  // 它们是这个产品的 moat,必须进复习队列 —— 否则又变成「写了只被看一次」。
  for (const w of content.wordBank || []) {
    out.push(...wordFieldUnits(w));
  }

  for (const place of content.mapPlaces || []) {
    const u = fromPlace(place);
    if (u) out.push(u);
  }

  for (const scene of content.scenes || []) {
    if (!scene?.ready) continue;
    for (const p of scene.phrases || []) {
      const u = fromScenePhrase(scene.id, scene.label, p);
      if (u) out.push(u);
    }
  }

  for (const st of content.subwayAdventure?.stations || []) {
    for (const p of st.phrases || []) {
      const u = fromSubwayPhrase(st, p);
      if (u) out.push(u);
    }
  }

  return out;
}

/**
 * 词场体检:成员对不对得上词库、句子里有没有真的出现成员词。
 *
 * 和 storage.js 的 auditKeys() 同性质 —— 把「靠写内容的人记得」换成「机器拦」。
 * 这条规则被违反过一次:设计样板时给紅葉配了 `見頃`,而它根本不在词库里,
 * 于是那个词点不进去。当时的结论是「规则没错,错在没有校验」。
 *
 * @returns 问题描述数组,空数组 = 没问题
 */
export function auditWordFields(wordBank) {
  const bank = Array.isArray(wordBank) ? wordBank : [];
  const byId = new Map(bank.filter(w => w?.id).map(w => [w.id, w]));
  const out = [];

  for (const w of bank) {
    const raw = w?.wordField;
    if (!raw) continue;
    const list = Array.isArray(raw) ? raw : [raw];
    for (const f of list) {
    if (!f?.sentence?.jp) { out.push(`${w.word} 的词场没有句子`); continue; }

    for (const m of f.members || []) {
      const mw = m?.id && byId.get(m.id);
      if (!mw) { out.push(`${w.word} 的词场成员 ${m?.id || '(没有 id)'} 不在词库里`); continue; }
      // 成员必须真的出现在句子里 —— 否则「同框」是假的,词场就退回成了近义词列表
      if (!f.sentence.jp.includes(mw.word) && !f.sentence.jp.includes(mw.reading)) {
        out.push(`${w.word} 的句子里找不到成员 ${mw.word}`);
      }
    }
    }
  }
  return out;
}

/** 键 → 单元。复习页拿到键后按它取内容。 */
export const indexUnits = (units) => {
  const m = {};
  for (const u of units || []) if (u?.key) m[u.key] = u;
  return m;
};

/**
 * 今天到期的里各来源占多少。
 *
 * 放在这个纯函数模块而不是 useReview.js:首页要用它,而 useReview.js 里有 hook,
 * 它又拖着 supabase —— 首页只是想数个数,不该因此把整条同步链拉进依赖。
 */
export function dueBySource(progress, today) {
  const out = {};
  for (const s of SOURCES) out[s] = 0;
  for (const [k, rec] of Object.entries(progress || {})) {
    if (!isDue(rec, today)) continue;
    out[sourceOf(k)] += 1;
  }
  return out;
}

/** 按来源分组计数,给「今天要复习的里有几条是深内容」这类展示用。 */
export function countBySource(keys) {
  const out = {};
  for (const s of SOURCES) out[s] = 0;
  for (const k of keys || []) out[sourceOf(k)] += 1;
  return out;
}
