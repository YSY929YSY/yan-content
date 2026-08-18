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
  /** 词频。df=null 表示「不适用」(接尾词),df=0 表示「真的没出现过」,两者不一样。 */
  freq?: { df: number | null; source?: string; method?: string };
  meaning_zh?: string;
  yanFeatures?: string[];
};

/** SRS 记录(只声明用到的字段)。 */
export type ProgressRec = {
  status?: string;
  dueAt?: string | null;
  box?: number;
  /** 上次见到它是哪天(YYYY-MM-DD)。srs.makeRecord 每次评分都会写。 */
  lastSeenAt?: string | null;
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
   * ⚠️ **同一个写法也算重复,不只是同一个读音。**
   * 换成按词频排之后第一批出来的是 `私 私 行く 何 言う 人` ——
   * 两条 `私`(わたくし / わたし),读音不同所以都过了读音这一关,
   * 但卡片上就是并排两个一模一样的「私」。判据和读音那条一样:
   * **用户看到的是不是同一个东西。**
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
  const wordCount = new Map<string, number>();
  for (const w of pool) {
    if (out.length >= limit) break;
    if (seen(progress[wordKey(w)])) continue;
    // 同读音、同写法都算「看起来是同一个东西」,挤到下一批 —— 不是丢掉
    if ((readingCount.get(w.reading) ?? 0) >= maxSameReading) continue;
    if ((wordCount.get(w.word) ?? 0) >= maxSameReading) continue;
    readingCount.set(w.reading, (readingCount.get(w.reading) ?? 0) + 1);
    wordCount.set(w.word, (wordCount.get(w.word) ?? 0) + 1);
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

/**
 * 今天走到哪了。
 *
 * ─────────────────────────────────────────────────────────
 * 补的是主线上一个说不出口的空档:**这条路只有「下一步」,没有「到此为止」。**
 *
 * 真机上走一遍就露出来了:学完 6 个词,首页立刻换一批新的,
 * 「今天该复习」还是 0 —— 而那 12 个词其实明天就会回来。
 * 系统一个字都没说。用户能得到的信号只有「还有更多」,
 * 于是要么停不下来,要么随便一停,而**两种都不知道自己今天做成了什么**。
 *
 * ⚠️ 这里**不设每日上限**,只如实报数。设不设上限是产品决定
 * (它会改变「无限往下学」这件事的性质),不该顺手在一个统计函数里定。
 * ─────────────────────────────────────────────────────────
 *
 * @param tomorrow 明天(YYYY-MM-DD)。**由调用方算好传进来** ——
 *                 这个模块不做日期运算,免得和 srs.js 的 addDays 长出两套口径。
 */
export function todayStats(
  pool: readonly WordLike[],
  progress: Record<string, ProgressRec | undefined>,
  today: string,
  tomorrow: string,
) {
  let touched = 0;
  let comingBack = 0;
  for (const w of pool) {
    const rec = progress[wordKey(w)];
    if (!rec) continue;
    // ⚠️ 说「碰过」不说「学会了」。记录里有的只是 lastSeenAt,
    // 而「学会」这件事我们没有任何可核的判据 —— 不做没有源的声明。
    if (rec.lastSeenAt === today) touched += 1;
    if (rec.dueAt === tomorrow && rec.status !== 'mastered') comingBack += 1;
  }
  return { touched, comingBack };
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
 * 排序:**先学用得上的**。
 *
 * ⚠️ 这里换过一次口径,原因值得记下来。
 *
 * 第一版按池子原顺序(等于按读音的字典序),头 24 个全是量词和接尾辞
 * (`～円 ～回 ～階 ～か月…`),第一屏给用户六个 `～` 开头的东西。
 * 第二版把接尾词押后,变成 `会う 青 青い 赤 赤い 明るい` —— 不难看,但那是
 * 字典序,和「哪个先学更有用」没有关系。
 *
 * 现在按 Tatoeba 文档频率(248,758 句)降序,top 变成:
 *
 *     私 行く 何 言う 人 見る 知る 好き 自分 家
 *
 * 三档,顺序不能乱:
 *
 *   1. `df > 0`   有真实使用频率,按 df 降序
 *   2. `df === 0` 语料里**真的一次都没出现**(420 条,其中 301 条是 N1)
 *   3. `df === null` / 接尾词 —— **「不适用」不是「频率为零」**
 *
 * ⚠️ 第 2 档和第 3 档必须分开。`～人` 的 df 是 null 而不是 0,是因为
 * 「接尾词不该有独立词频」和「这个词冷门到没人说」是两件完全不同的事。
 * 混成一档就等于宣称接尾词是冷门词。
 *
 * ⚠️ 接尾词单独押后这条**不能删**,即使它们已经是 df:null:
 * 判据是「它不是一个独立的词」,和有没有频率数据无关。
 *
 * 同 df 的保持原有相对顺序(Array.sort 在现代 JS 里是稳定的)——
 * 「下一步」不能每次进来都换一批。
 */
const isAffix = (w: WordLike) =>
  w.word.startsWith('～') || w.word.startsWith('~') || /量词|接尾|接头/.test(w.pos || '');

const tierOf = (w: WordLike): number => {
  if (isAffix(w)) return 2;
  const df = w.freq?.df;
  if (df == null) return 2;      // 没有 freq 字段、或明确的 not_applicable
  return df > 0 ? 0 : 1;
};

export function orderPool(pool: readonly WordLike[]): WordLike[] {
  return [...pool].sort((a, b) => {
    const ta = tierOf(a), tb = tierOf(b);
    if (ta !== tb) return ta - tb;
    if (ta !== 0) return 0;                       // 非第一档内部不排,保持原序
    return (b.freq!.df as number) - (a.freq!.df as number);
  });
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
