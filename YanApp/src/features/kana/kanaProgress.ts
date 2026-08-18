/**
 * 「五十音走完了没」—— 主线的第一道门。
 *
 * ─────────────────────────────────────────────────────────
 * 这个文件补的是主线上最早的那处断口。
 *
 * dailyTask 的第一条规则是「五十音没走完 → 先走五十音」,而在这之前
 * **五十音页没有任何进度持久化**(3277 行,storage.js 里一个键都没登记)。
 * 它是个浏览页,不会「完成」。于是新用户:
 *
 *     卡片:先把五十音走完 → 开始五十音 → 浏览一圈退出 → 卡片:先把五十音走完
 *
 * 永远在这里。TodayCard 拿「学过任何一个词」当 kanaDone 的代理,而
 * `wordbankProgress` 只有 grade() 会写,grade() 的调用点从五十音那条路
 * 一个都到不了 —— 新用户脱困的唯一办法是自己绕去词书里评一个分,
 * 那正是这条主线要消灭的「自己挑」。
 *
 * ⚠️ 这个洞只对新用户开,而现在**零个陌生用户**,所以一直没人撞到。
 * ─────────────────────────────────────────────────────────
 *
 * 纯函数,不碰磁盘、不 import React。
 */

/**
 * 存盘形状。
 *
 * `seen` 的键是**假名字符本身**(「あ」),不是行号或下标 ——
 * 内容包是远端下发的,行的顺序和分组都可能变,而字符不会。
 */
export type KanaProgress = {
  /** 点开看过详情的假名。值恒为 true,用对象是为了 O(1) 查。 */
  seen: Record<string, true>;
  /** 用户自己声明「我已经会了」。 */
  declared?: boolean;
  updatedAt?: string;
};

export const emptyKanaProgress = (): KanaProgress => ({ seen: {} });

/** 平假名的 Unicode 区段。 */
const isHiragana = (ch: string) => /^[ぁ-ゖ]$/.test(ch);

type CharLike = { kana?: string; hira?: string };
type RowLike = { chars?: readonly CharLike[] };

/**
 * 主线要求看过的那一批 = 内容包里的**平假名清音**。
 *
 * ⚠️ **不写死 46。** 实测 `kanaRows` 是 20 行 92 格(平假名 46 + 片假名 46),
 * 但内容包是远端下发的,写死的常量和真实数据一旦对不上,就是这一轮开头
 * 那个「渲染层读 pitchAccent、数据写在 pitch.accent」的同款 —— 两边分开看都对。
 * 判据取自数据本身就不会漂。
 *
 * ⚠️ **只要平假名。** 主线池是 563 条 kanji_anchor,它们的 reading 全是平假名;
 * 片假名不是读词的前提,拿它卡住起点是在门口多加一道无关的锁。
 * (看片假名照样会记进 seen,只是不参与这道门的判据。)
 *
 * 按 Unicode 区段筛而不是按行名(`あ行`/`ア行`)—— 行名是内容里的显示文本,
 * 改文案就会把判据改掉,而区段不会。
 */
export function requiredKana(kanaRows: readonly RowLike[] | null | undefined): string[] {
  const out: string[] = [];
  for (const row of kanaRows || []) {
    for (const ch of row.chars || []) {
      // `hira` 是配对后补的字段(片假名模式下 kana 是片假名,hira 仍是平假名);
      // 原始数据里没有 hira,那时 kana 本身就是平假名。
      const k = ch.hira || ch.kana;
      if (k && isHiragana(k) && !out.includes(k)) out.push(k);
    }
  }
  return out;
}

/** 看过几个。用于进度数字。 */
export function seenCount(
  progress: KanaProgress | null | undefined,
  required: readonly string[],
): number {
  const seen = progress?.seen || {};
  let n = 0;
  for (const k of required) if (seen[k]) n += 1;
  return n;
}

/**
 * 这道门过了没。
 *
 * 两条路都算过:
 *   1. 用户自己声明「我已经会了」—— 学过一点日语的人不该被迫点 46 下
 *   2. 平假名清音全部看过
 *
 * ⚠️ **required 为空时绝不能返回 true。**
 * `[].every(...)` 是 true,所以内容包没下发到、或者结构变了导致筛不出假名时,
 * 「五十音自动算过」会安静地成立 —— 新用户第一屏直接被甩六个汉字词。
 * 这正是这个项目丢过四次数据的那个形状:**读不到当成空的,空的当成没问题。**
 * 这时候只认用户的显式声明,那是唯一还可信的输入。
 */
export function isKanaDone(
  progress: KanaProgress | null | undefined,
  required: readonly string[],
): boolean {
  if (progress?.declared) return true;
  if (!required.length) return false;
  return seenCount(progress, required) >= required.length;
}

/**
 * 记一个「看过」。
 *
 * 返回新对象,已经记过就原样返回 —— 调用方用引用相等就能判断要不要落盘,
 * 每点一次假名写一次盘是没必要的。
 */
export function markSeen(
  progress: KanaProgress | null | undefined,
  kana: string,
  now: string,
): KanaProgress {
  const cur = progress || emptyKanaProgress();
  if (!kana || cur.seen[kana]) return cur;
  return { ...cur, seen: { ...cur.seen, [kana]: true }, updatedAt: now };
}

/**
 * 用户声明「我已经会了」。
 *
 * ⚠️ **不连带把 46 个 seen 全填上。** 「他说他会」和「他逐个看过」是
 * 两件不同的事,合并之后就分不开了 —— 而进度数字显示的是后者。
 * 硬塞会让界面显示「46/46 看过」,那是一句他没做过的事,
 * 也让他之后真去逐个看时没有任何进度可涨。
 */
export function declareKnown(
  progress: KanaProgress | null | undefined,
  now: string,
): KanaProgress {
  const cur = progress || emptyKanaProgress();
  if (cur.declared) return cur;
  return { ...cur, declared: true, updatedAt: now };
}

/**
 * 读盘来的东西整形。**任何字段都可能不是想要的类型** ——
 * 存盘的是上个版本的代码写的,而它以后还会再改一次。
 */
export function normalizeKanaProgress(raw: unknown): KanaProgress {
  if (!raw || typeof raw !== 'object') return emptyKanaProgress();
  const r = raw as Record<string, unknown>;
  const seen: Record<string, true> = {};
  if (r.seen && typeof r.seen === 'object') {
    for (const [k, v] of Object.entries(r.seen as Record<string, unknown>)) {
      if (v) seen[k] = true;
    }
  }
  const out: KanaProgress = { seen };
  if (r.declared === true) out.declared = true;
  if (typeof r.updatedAt === 'string') out.updatedAt = r.updatedAt;
  return out;
}
