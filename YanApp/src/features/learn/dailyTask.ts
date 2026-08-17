/**
 * 「今天该干什么」—— 只有一个下一步。
 *
 * ─────────────────────────────────────────────────────────
 * 这个文件要解决的是产品的核心困境:
 *
 *   「我自己设计其实我都不知道我要怎么去学习日语,感觉很混乱很复杂。」
 *
 * 十个模块并列,任何时刻用户都得自己决定点哪个。多邻国的优势不是课程编得好,
 * 是**任何时刻只有一个下一步**。
 *
 * ⚠️ 关键判断:**这个「下一步」不需要人工排课,可以算出来。**
 * 五份顾问意见吵了四轮「主线是什么」,其中三份主张按站/关卡组织内容 ——
 * 但地铁冒险实测只有 5 站、每站绑定词数 0、站间没有能力递进,
 * 那条路要先写两周内容才存在。
 *
 * 而按规则算的话,今天就能跑:数据已经全在了。
 * ─────────────────────────────────────────────────────────
 *
 * 纯函数,不碰磁盘、不 import React —— 所以它可测,而这个项目里
 * 没被测到的那一层出过每一个丢数据的 bug。
 */

/** 词条(只声明这个模块用到的字段)。 */
export type WordLike = {
  word: string;
  reading: string;
  level?: string;
  /** 词性。接尾词/量词要押后,见 orderPool。 */
  pos?: string;
  meaning_zh?: string;
  yanFeatures?: string[];
};

/** SRS 记录(只声明用到的字段)。 */
export type ProgressRec = {
  status?: string;
  dueAt?: string | null;
  box?: number;
};

/**
 * 进度键。**必须和 App.js 里的 wordKey 完全一致** ——
 * 不一致的话查不到用户已有的进度,界面会显示成「一个词都没学过」。
 *
 * (别名折算在 srs.normalizeProgress 读盘时就做完了,所以这里直接拼即可。)
 */
export const wordKey = (w: Pick<WordLike, 'word' | 'reading'>) => `${w.word}-${w.reading}`;

export type Task =
  /** 五十音没走完 —— 这是起点,不能跳(约束:五十音是起点) */
  | { kind: 'kana' }
  /** 有到期的词要复习 */
  | { kind: 'review'; keys: string[]; dueTotal: number }
  /** 学新的汉字直读词 */
  | { kind: 'learn'; words: WordLike[]; learnedTotal: number; poolTotal: number }
  /** 池子学完了 */
  | { kind: 'clear'; poolTotal: number };

export type NextTaskInput = {
  /** 候选词池。调用方负责筛(目前是 563 条 kanji_anchor)。 */
  pool: readonly WordLike[];
  /** 键 → 记录。srs.normalizeProgress 的输出。 */
  progress: Record<string, ProgressRec | undefined>;
  /** 五十音走完了没。 */
  kanaDone: boolean;
  /** 今天(YYYY-MM-DD)。 */
  today: string;
  /** 一批学几个新词。 */
  newLimit?: number;
  /** 一批复习几个。 */
  reviewLimit?: number;
  /**
   * 同一批里允许出现几个同读音的词。
   *
   * ⚠️ **默认 1,这条不是洁癖。** 池子里有 暑い / 熱い / 厚い,读音全是 あつい;
   * 还有 雨/飴(あめ)、橋/箸(はし)、花/鼻(はな)、早い/速い(はやい)。
   * 六个词一批,里面三个都念 あつい —— 那不是学习,是在制造混淆。
   * 被挤掉的词不会消失,下一批会轮到它(见测试)。
   *
   * 设成 Infinity 就是「同批对比教学」那种路线,留着这个口子,但不是默认。
   */
  maxSameReading?: number;
};

/** 到期了没。没有 dueAt 的记录当作「还没排期」,不算到期。 */
function isDue(rec: ProgressRec | undefined, today: string): boolean {
  if (!rec || !rec.dueAt) return false;
  if (rec.status === 'mastered') return false;
  return rec.dueAt <= today;
}

/** 学过没。**「学过」的判据是有记录,不是记录里写了什么。** */
const seen = (rec: ProgressRec | undefined) => !!rec;

/**
 * 今天的唯一一个动作。
 *
 * 优先级顺序,**复习在新词前面**:
 *
 *   1. 五十音没走完      → 先走五十音
 *   2. 有到期的          → 先还复习的账
 *   3. 有没学过的        → 学新的
 *   4. 都完了            → 池子清空
 *
 * 第 2 条压过第 3 条是有意的:**复习欠账优先于摄入新内容。**
 * 反过来的话,用户每天都在学新词,而学过的在背后慢慢忘掉 ——
 * 词库有 8005 条,按数量它永远能把队列填满,复习就永远轮不上。
 */
export function nextTask({
  pool, progress, kanaDone, today,
  newLimit = 6, reviewLimit = 10, maxSameReading = 1,
}: NextTaskInput): Task {
  if (!kanaDone) return { kind: 'kana' };

  // ── 2 到期的
  const dueKeys: string[] = [];
  for (const w of pool) {
    const k = wordKey(w);
    if (isDue(progress[k], today)) dueKeys.push(k);
  }
  if (dueKeys.length > 0) {
    return { kind: 'review', keys: dueKeys.slice(0, reviewLimit), dueTotal: dueKeys.length };
  }

  // ── 3 没学过的
  const learnedTotal = pool.reduce((n, w) => n + (seen(progress[wordKey(w)]) ? 1 : 0), 0);
  const fresh = pickBatch(pool, progress, newLimit, maxSameReading);
  if (fresh.length > 0) {
    return { kind: 'learn', words: fresh, learnedTotal, poolTotal: pool.length };
  }

  return { kind: 'clear', poolTotal: pool.length };
}

/**
 * 挑一批新词。
 *
 * **顺序是池子的顺序,不随机。** 随机的话每次进来看到的「下一步」都不一样,
 * 那就不是一条路径了 —— 用户会觉得自己在原地打转。
 */
function pickBatch(
  pool: readonly WordLike[],
  progress: Record<string, ProgressRec | undefined>,
  limit: number,
  maxSameReading: number,
): WordLike[] {
  const out: WordLike[] = [];
  const readingCount = new Map<string, number>();
  for (const w of pool) {
    if (out.length >= limit) break;
    if (seen(progress[wordKey(w)])) continue;
    const n = readingCount.get(w.reading) ?? 0;
    if (n >= maxSameReading) continue;      // 同读音的挤到下一批,不是丢掉
    readingCount.set(w.reading, n + 1);
    out.push(w);
  }
  return out;
}

/**
 * 首页那一行字。**整个首页只显示这一句 + 一个按钮。**
 *
 * 分开成一个函数是为了让它可测 —— 文案也是产品的一部分,
 * 「不知道该干什么」这个问题一半是文案造成的。
 */
export function taskLabel(task: Task): { title: string; action: string } {
  switch (task.kind) {
    case 'kana':
      return { title: '先把五十音走完', action: '开始五十音' };
    case 'review':
      return {
        title: `有 ${task.dueTotal} 个词到期了`,
        action: `复习 ${task.keys.length} 个`,
      };
    case 'learn':
      return {
        // 说「你已经认识」而不是「你要学」—— 这是汉字直读词,用户确实认得字
        title: `${task.words.length} 个你已经认识的汉字词,只差读音`,
        action: '开始',
      };
    case 'clear':
      return { title: `${task.poolTotal} 个汉字直读词都过完了`, action: '看词书' };
  }
}

/** 进度数字。首页那一行的右边。 */
export function poolProgress(
  pool: readonly WordLike[],
  progress: Record<string, ProgressRec | undefined>,
) {
  let learned = 0, mastered = 0;
  for (const w of pool) {
    const rec = progress[wordKey(w)];
    if (!rec) continue;
    learned += 1;
    if (rec.status === 'mastered') mastered += 1;
  }
  return { learned, mastered, total: pool.length };
}

/**
 * 接尾词 / 量词 / 接头词押后。
 *
 * ⚠️ **这条不是教学法判断,是数据判断**:`～円`、`～階`、`～か月` 不是独立的词。
 * 钩子说的是「你已经认识这个**词**,只差读音」—— 这句话对一个量词后缀不成立,
 * 用户看到的是六个 `～` 开头的东西,产生不了「我居然看懂了」那一下。
 *
 * 实测:不排的话,**头 24 个词全是量词和接尾辞**(池子按读音排,`～` 全挤在开头)。
 * 这是只有拿真数据跑一遍才看得见的问题。
 *
 * 用稳定排序,所以同一档内部的原顺序不变 —— 「下一步」不能每次都换。
 */
const isAffix = (w: WordLike) =>
  w.word.startsWith('～') || w.word.startsWith('~') || /量词|接尾|接头/.test(w.pos || '');

export function orderPool(pool: readonly WordLike[]): WordLike[] {
  const head: WordLike[] = [], tail: WordLike[] = [];
  for (const w of pool) (isAffix(w) ? tail : head).push(w);
  return [...head, ...tail];
}

/**
 * 从整个词库里筛出主线池。目前 = 563 条 kanji_anchor,接尾词押后。
 *
 * ⚠️ 还有一个**没有定论**的排序问题留在这里:双汉字的漢語(準備/注意/約束)
 * 大概率比单汉字(青/秋)更能触发「我居然看懂了」,但这是教学法判断,
 * 没有来源可核,**只有真人能回答**。想试的话把 head 再按汉字数排一次就行。
 */
export const anchorPool = (bank: readonly WordLike[], feature = 'kanji_anchor') =>
  orderPool(bank.filter(w => (w.yanFeatures || []).includes(feature)));
