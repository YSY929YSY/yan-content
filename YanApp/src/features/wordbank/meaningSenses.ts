/**
 * 「一个词到底有几个意思」—— 把压成一行的释义拆回义项。
 *
 * ─────────────────────────────────────────────────────────
 * 词库里 `meaning_en` 是从 JMdict 那类词典压平出来的,一个字段塞了两层结构:
 *
 *     "endurance; patience; perseverance | self-control; self-restraint"
 *      └────────── 义项 1 ──────────┘   └───── 义项 2 ─────┘
 *                  └ 同义词 ┘
 *
 * `|` 是**义项**边界(词典里的 sense),`;` 是同一义项内的**近义写法**(gloss)。
 * 两者不是同一层:按 `;` 一路切到底会把「忍耐」和「克制」并列成两个平级的东西,
 * 而它们在词典里本来一个是词条的第一义、一个是第二义。
 *
 * 实测(8005 条,2026-08-18):3017 条含 `|`。**按下面的括号感知口径**拆出来是
 * 3000 条两义项、16 条三义项,外加 1 条其实只有一个义项(见下面的「半」);
 * `|` 全部严格是 `" | "`,没有首尾多余分隔符、没有空义项、没有连续 `|`。
 * 所以这里**不需要**容错那些脏数据 —— 但仍然写了,因为内容包是远端下发的,
 * 下一版编辑器手抖就会有。
 *
 * ⚠️ 括号内的分隔符不算数,这是唯一真出现过的歧义:
 *
 *     "half (e.g., にじはん | half-past two)"   ← 全库唯一 1 条,`|` 在括号里
 *     "out (of a ball; in tennis, etc.); outside the line"  ← 13 条,`;` 在括号里
 *
 * 天真的 `split('|')` 会把「半」切成「half (e.g., にじはん」和「half-past two)」——
 * 两个都不是词。所以下面按括号深度切,深度 > 0 时分隔符只当普通字符。
 *
 * ⚠️ 中文侧和英文侧**对不上**,不要假设能按下标配对。
 * `meaning_zh` 全库 0 条含 `|`,用的是 `；`;在 3017 条含 `|` 的词里,
 * 中文义项数和英文义项数只有 2136 条相等,881 条不等(791 条英文更多)。
 * 因为中文是人工压缩的摘要,不是逐义项翻译。所以 `parseMeaning` 只如实报出
 * 两边各自的数量和 `aligned` 标志,**不做任何跨语言的下标对齐**。
 * ─────────────────────────────────────────────────────────
 *
 * 纯函数,不碰磁盘、不 import React。
 */

/** 义项分隔符:词典里的 sense 边界。 */
const SENSE_SEP = '|';

/** 同义写法分隔符:同一义项内并列的 gloss。 */
const GLOSS_SEP = ';';

/** 中文侧的义项分隔符。中文用全角分号,且全库不出现 `|`。 */
const ZH_SENSE_SEP = '；';

/** 一个义项。 */
export type Sense = {
  /** 整条义项原文(已去首尾空白),例如 `"endurance; patience; perseverance"`。 */
  text: string;
  /**
   * 这个义项下并列的近义写法。
   * 单 gloss 的义项这里长度为 1,**不是空数组** —— 调用方可以无条件取 `[0]` 当主释义。
   */
  glosses: string[];
};

/** 一条词的释义拆解结果。 */
export type ParsedMeaning = {
  en: Sense[];
  zh: Sense[];
  /**
   * 中英义项数是否相等。
   * 相等**也不等于**能按下标一一对应 —— 这只是个「值得怀疑」的信号,
   * 不相等时(实测 882/3017)任何按下标配对的 UI 都会张冠李戴。
   */
  aligned: boolean;
};

/**
 * 按括号深度切分:只在括号外的分隔符处断开。
 *
 * 用计数而不是正则,因为括号里可以再嵌括号,而正则做不了配平。
 * 右括号多于左括号时(全库 0 条,但内容包是远端的)把深度夹在 0,
 * 宁可多切也不要因为一个孤立的 `)` 让后面整条都不再切分。
 */
function splitOutsideParens(raw: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = depth > 0 ? depth - 1 : 0;
    else if (ch === sep && depth === 0) {
      out.push(raw.slice(start, i));
      start = i + 1;
    }
  }
  out.push(raw.slice(start));
  return out;
}

/**
 * 归一空白。
 *
 * 分隔符两侧的空格是格式而不是内容(实测 3033 处 `|` 全部写作 `" | "`),
 * 切完必须去掉,否则每个义项都会带一个前导空格,而下游拿它当 map 的键。
 */
function tidy(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** 切成非空片段。空片段一律丢弃 —— `"a | | b"` 里那个空档不是义项。 */
function segments(raw: string, sep: string): string[] {
  return splitOutsideParens(raw, sep).map(tidy).filter((s) => s !== '');
}

/**
 * 拆英文释义。
 *
 * 输入不是字符串时返回空数组而不是抛 —— 内容包字段可能缺失,
 * 而这一层跑在渲染词卡的路径上,炸一条等于整页白屏。
 */
export function parseEnSenses(raw: unknown): Sense[] {
  if (typeof raw !== 'string') return [];
  return segments(raw, SENSE_SEP).map((text) => ({
    text,
    glosses: segments(text, GLOSS_SEP),
  }));
}

/**
 * 拆中文释义。
 *
 * 中文只切 `；`,**不切 `，`**:全角逗号在中文释义里既当近义词分隔
 * (「忍耐,忍受」)又当句内标点(「一共三千日元,不含税」),
 * 切了会把半句话当成一个义项。分号没有这个歧义。
 */
export function parseZhSenses(raw: unknown): Sense[] {
  if (typeof raw !== 'string') return [];
  return segments(raw, ZH_SENSE_SEP).map((text) => ({ text, glosses: [text] }));
}

/** 词条(只声明这个模块用到的字段)。 */
export type MeaningLike = {
  meaning_en?: unknown;
  meaning_zh?: unknown;
};

/** 一条词的完整拆解。传 null/非对象也不炸,返回全空。 */
export function parseMeaning(entry: MeaningLike | null | undefined): ParsedMeaning {
  const en = parseEnSenses(entry?.meaning_en);
  const zh = parseZhSenses(entry?.meaning_zh);
  return { en, zh, aligned: en.length > 0 && en.length === zh.length };
}

/**
 * 一条词是不是多义词。
 *
 * 只看英文侧:中文侧是人工摘要,把三个义项压成一句是常态,
 * 拿它判断会把大量多义词漏掉。
 */
export function isPolysemous(entry: MeaningLike | null | undefined): boolean {
  return parseEnSenses(entry?.meaning_en).length > 1;
}

/**
 * 取主释义 —— 第一义项的第一个 gloss。
 *
 * 词典里 sense 是按常用度排的,第一个就是最该出现在词卡正面的那个。
 * 没有释义时返回空串而不是 undefined,省得每个调用点都写一遍兜底。
 */
export function primaryGloss(entry: MeaningLike | null | undefined): string {
  const first = parseEnSenses(entry?.meaning_en)[0];
  return first?.glosses[0] ?? '';
}
