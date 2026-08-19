/**
 * 振り仮名对齐 —— 哪几个假名压在哪个汉字上。
 *
 * ─────────────────────────────────────────────────────────
 * 词库里只有整词读音:`美味しい` / `おいしい`。
 * 但要做出「假名压在对应汉字上方」的排版,需要知道的是:
 *
 *     美味  →  おい      ← 要标
 *     しい  →  (不标)    ← 送り仮名,它本来就是假名
 *
 * 这一步叫送り仮名对齐,是这件事里唯一有难度的部分。
 *
 * ⚠️ **不需要分词器,也不需要任何新依赖。** 算法就是:
 * 把词按「汉字段 / 假名段」切开,汉字段变成正则 `(.+?)`,假名段变成字面量,
 * 对读音做整串匹配,捕获组就是每段汉字的注音。
 *
 * 实测(8005 条,2026-08-18):含汉字的 6963 条里 **6962 条对上**(99.99%)。
 * 唯一对不上的是 `ヶ月`,已在下面单独处理。
 *
 * 这个数字是自己跑出来的,不是估的 —— 见 furigana.test.mjs 里那条读真实
 * content.fallback.json 的回归测试。
 * ─────────────────────────────────────────────────────────
 *
 * 纯函数,不碰磁盘、不 import React。
 */

/** 一段:一截文本,可能带注音。`ruby` 为空表示它本来就是假名,不注。 */
export type FuriSegment = {
  text: string;
  /** 压在 `text` 上方的假名。没有就是不注音。 */
  ruby?: string;
};

/**
 * 片假名 → 平假名。
 *
 * 只用于**比对**,不改显示的字 —— `消しゴム` 的 `ゴム` 在屏幕上还得是片假名,
 * 但它的读音写作 `けしごむ`,不归一就对不上。
 */
const toHira = (s: string) =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/**
 * 一条 `reading` 可能装着**好几个读音**,用分号隔开:
 *
 *     行く  →  「いく; ゆく」
 *     何    →  「なん; なに」
 *
 * ⚠️ 不拆开的话对齐会把整串当成一个读音塞给汉字:
 * `行く / いく; ゆく` 会标成 **行=「いく; ゆ」**、く 不标 —— 真机上就是这样露馅的。
 *
 * 全库只有 12 条这样,但 `行く` 和 `何` 正好在主线第一批里,
 * 是用户第一眼看到的东西。
 *
 * **只拿第一个读音注音**,其余交给调用方另行提示(不要默默丢掉:
 * 「这个词还有别的念法」本身是有用的信息)。
 */
const READING_SEP = /[;；]/;

export const primaryReading = (reading?: string | null) =>
  String(reading || '').split(READING_SEP)[0]!.trim();

/** 除第一个之外的其余读音。没有就是空数组。 */
export const altReadings = (reading?: string | null) =>
  String(reading || '').split(READING_SEP).slice(1).map((s) => s.trim()).filter(Boolean);

/**
 * 需要注音的字。
 *
 * 汉字之外还有两个:
 *   `々` 踊り字(`色々` 读 `いろいろ`)—— 它不在汉字区段里,当假名处理会
 *        要求读音里真的出现一个 `々`,`色々/いろいろ` 就会对不上。
 *   `ヶ`  `ヶ月` 读 `かげつ` —— 那个 `ヶ` 读 `か`,它是个缩写记号不是假名。
 *        (`ヶ` 只在含汉字的词里才会走到这儿,`カラオケ` 那种整串片假名的
 *         压根不进这个函数。)
 *
 * ⚠️ 这两个字是**实测逼出来的**,不是预先想到的:第一版只按汉字区段筛,
 * 6963 条里挂了 55 条,全是这两类。
 */
const NEEDS_RUBY = /[一-龯㐀-䶿々ヶ]/;

/**
 * 把词切成「要注音 / 不注音」交替的段。
 * `美味しい` → [`美味`(要), `しい`(不要)]
 */
function runs(word: string): { text: string; ruby: boolean }[] {
  const out: { text: string; ruby: boolean }[] = [];
  for (const ch of word) {
    const need = NEEDS_RUBY.test(ch);
    const last = out[out.length - 1];
    if (last && last.ruby === need) last.text += ch;
    else out.push({ text: ch, ruby: need });
  }
  return out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 对齐一个词。
 *
 * @returns 对齐好的段;**对不上时返回 `null`**。
 *
 * ⚠️ 对不上就返回 null,**不要退化成「整词标一个读音」**。
 * 那样看起来也像模像样(假名浮在词上面),但它在教一件错的事:
 * 学习者会以为那几个假名和下面的字是逐一对应的。
 * 宁可这个词不注音,调用方拿 null 去显示纯读音 —— 少一个信息,
 * 好过多一个错的信息。这个 App 唯一的资产就是「说的话可核对」。
 */
export function alignFurigana(
  word: string | null | undefined,
  reading: string | null | undefined,
): FuriSegment[] | null {
  const w = String(word || '');
  // 多读音只取第一个 —— 见 primaryReading
  const r = primaryReading(reading);
  if (!w || !r) return null;

  const parts = runs(w);
  // 一个要注音的字都没有(整词假名)—— 不是失败,是本来就不用注
  if (!parts.some((p) => p.ruby)) return [{ text: w }];

  const pattern = parts
    .map((p) => (p.ruby ? '(.+?)' : escape(toHira(p.text))))
    .join('');
  const m = new RegExp(`^${pattern}$`).exec(toHira(r));
  if (!m) return null;

  let g = 1;
  return parts.map((p) => (p.ruby ? { text: p.text, ruby: m[g++] } : { text: p.text }));
}

/**
 * 这个词能不能注音。给调用方先问一句,省得渲染时再判。
 */
export const canAlign = (word?: string | null, reading?: string | null) =>
  alignFurigana(word, reading) !== null;
