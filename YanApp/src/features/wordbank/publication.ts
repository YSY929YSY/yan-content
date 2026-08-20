/**
 * 发布契约 —— 一个词现在能不能查、能不能作为**新内容**进入学习。
 *
 * ─────────────────────────────────────────────────────────
 * ## 为什么需要它
 *
 * 在这之前,「可不可以正式学习」是从字段形状**猜**出来的:
 *
 *     const isDraftedWord = (w) => !(w?.exampleJp && w?.exampleZh && w?.exampleRoma);
 *
 * 于是「例句齐全」被当成了「已经核验、可以进 SRS」。
 * **例句完整不能证明中文义、义项对齐或来源核验已经完成。**
 *
 * ⚠️ 这个错误最容易的复发方式是**换个字段再猜一次**:把
 * 「例句齐全 → 自动可学」改成「表记读音齐全 → 自动可查」。所以这里把两件事分开:
 *
 *     hasDictionaryShape()  结构校验 —— 这条数据长得对不对
 *     isDictionaryEntry()   发布判断 —— 产品有没有把它放出去
 *
 * **结构永远不能自动升级成发布。** 发布只能由内容包里显式的 `publication` 字段给出。
 *
 * ## fail closed
 *
 * 缺 `publication` 一律返回 false。理由和 writeGuard 是同一条:
 * 「读不到」不等于「没有」,而这个项目栽过四次的形状都是把「不知道」当成了「可以」。
 *
 * ## 引入 ≠ 复习
 *
 * `canIntroduceWord` 回答「能不能作为**新内容**进来」,
 * `canReviewWord` 回答「用户**已经学过**的还能不能复习」。
 * 收紧发布规则不能反过来剥夺用户已经建立的 SRS 记录 —— 学过的词凭空消失,
 * 比多显示一个粗糙词条严重得多。
 *
 * 纯函数,不碰磁盘、不 import React。
 * ─────────────────────────────────────────────────────────
 */

/** 发布契约。两层各自独立,各自记录迁移依据。 */
export type Publication = {
  /** 能不能查(词典层)。 */
  dictionary?: boolean;
  /** 能不能作为新内容进入学习(学习层)。 */
  learning?: boolean;
  /**
   * 两层的依据**分开记**。
   *
   * ⚠️ 共用一个 `basis` 的话,以后按来源流水线单独关闭 Dictionary
   * 或单独提升 Learning 时,无法区分依据来自哪一层。
   *
   * ⚠️ **basis 不是真实性等级。** `legacy_*` 表示「把当前产品行为显式化」,
   * 不表示释义、义项对齐或来源已经核验过 —— 不得等同 `verified`。
   */
  dictionaryBasis?: string;
  learningBasis?: string;
};

/** 词条(只声明这个模块用到的字段)。 */
export type PublishableWord = {
  word?: unknown;
  reading?: unknown;
  meaning_zh?: unknown;
  meaning_en?: unknown;
  exampleJp?: unknown;
  exampleZh?: unknown;
  exampleRoma?: unknown;
  coreChunk?: unknown;
  wordField?: unknown;
  yanFeatures?: unknown;
  publication?: unknown;
};

/**
 * 一条已归一化的 SRS 记录。
 *
 * 调用点拿到的是 `normalizeProgress()` 的输出,所以「已经学过」的形状是
 * **非数组对象**,而不是任意 truthy 值。这里只关心「是不是一条记录」,
 * 不关心里面写了什么 —— 见 `canReviewWord`。
 */
export type ProgressRecord = Record<string, unknown> | null | undefined;

/**
 * 非空字符串。
 *
 * ⚠️ 用 `trim()` 之后判断:内容管道里出现过只有空白的字段,
 * 而 `' '` 是 truthy —— 不 trim 的话它会被当成「有内容」。
 */
const filled = (v: unknown): boolean => typeof v === 'string' && v.trim() !== '';

/**
 * 是不是一条记录。
 *
 * ⚠️ 判据是**非数组对象**,不是 truthy。`'corrupt'` 和 `[]` 都是 truthy,
 * 但它们不是 `normalizeProgress()` 会产出的形状 —— 把它们当成「学过」,
 * 等于让一段坏数据替用户主张一次学习记录。
 */
const isProgressRecord = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 取出 publication。任何非对象形状(null / 数组 / 字符串)一律当作没有。 */
function publicationOf(word: PublishableWord | null | undefined): Publication | null {
  const p = word?.publication;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  return p as Publication;
}

/**
 * 结构校验:这条数据长得像不像一个词条。
 *
 * ⚠️ **这不是发布判断。** 它只回答「字段齐不齐」,
 * 用于迁移脚本筛候选和数据体检,**不能**用来决定用户看不看得到。
 */
export function hasDictionaryShape(word: PublishableWord | null | undefined): boolean {
  if (!word || typeof word !== 'object') return false;
  return filled(word.word)
    && filled(word.reading)
    && (filled(word.meaning_zh) || filled(word.meaning_en));
}

/**
 * 能不能查。**结构通过 且 产品显式放出去。**
 *
 * 缺 `publication` → false(fail closed)。
 */
export function isDictionaryEntry(word: PublishableWord | null | undefined): boolean {
  if (!hasDictionaryShape(word)) return false;
  return publicationOf(word)?.dictionary === true;
}

/**
 * 能不能作为新内容进入学习。
 *
 * ⚠️ **必须先是 Dictionary。** 禁止出现「Learning 通过但 Dictionary 失败」——
 * 那种状态下用户能学一个查不到的词,界面自相矛盾。
 * 前置写在函数体里,不靠调用方记得先判一次。
 */
export function isLearnableWord(word: PublishableWord | null | undefined): boolean {
  if (!isDictionaryEntry(word)) return false;
  return publicationOf(word)?.learning === true;
}

/**
 * 例句三件套齐不齐。**与 publication 完全独立** ——
 * 它只描述内容形状,不参与任何准入判断。
 *
 * 这个函数承接的正是老 `isDraftedWord` 的**统计**语义。
 * 把它和发布层分开,是为了让「补齐例句」不再自动等于「可以学了」。
 */
export function hasCompleteExample(word: PublishableWord | null | undefined): boolean {
  if (!word || typeof word !== 'object') return false;
  return filled(word.exampleJp) && filled(word.exampleZh) && filled(word.exampleRoma);
}

/**
 * 词场里有没有**真的一个词场**。
 *
 * ⚠️ 口径和运行时的 `units.js` 的 `wordFieldsOf()` 对齐:它只承认带
 * `sentence.jp` 的条目。一个 `{}` 或 `{ members: [] }` 在复习队列里
 * 产不出任何一道题 —— 拿它去货架上声称「有编辑深度」,那句话是空的。
 *
 * `wordField` 既接对象也接数组(存储形状的历史包袱,归一在读取处做)。
 */
function hasRealWordField(v: unknown): boolean {
  const list = Array.isArray(v) ? v : (v ? [v] : []);
  return list.some((f) => {
    if (!f || typeof f !== 'object') return false;
    const sentence = (f as { sentence?: unknown }).sentence;
    if (!sentence || typeof sentence !== 'object') return false;
    return filled((sentence as { jp?: unknown }).jp);
  });
}

/**
 * 有没有编辑加工过的深度内容(搭配 / 词场 / 言自己的标签)。
 *
 * ⚠️ **不冒充发布或核验。** 它只回答「有没有这些内容」,
 * 供货架文案分档用;有深度不代表内容对,没深度也不代表不能学。
 *
 * ⚠️ **空壳不算。** 三个字段各自要求「真的有东西」而不只是「字段存在」:
 * `{}`、`[]`、`new Date()`、`{ members: [] }`、`[' ']` 全部 false。
 * 否则这个函数会变成又一个「字段存在 → 自动升级」的判据,
 * 而那正是这一整轮在修的病。
 */
export function hasEditorialDepth(word: PublishableWord | null | undefined): boolean {
  if (!word || typeof word !== 'object' || Array.isArray(word)) return false;
  if (filled(word.coreChunk)) return true;
  if (hasRealWordField(word.wordField)) return true;
  return Array.isArray(word.yanFeatures) && word.yanFeatures.some(filled);
}

/** 能不能把这个词作为**新内容**引入学习。 */
export const canIntroduceWord = (word: PublishableWord | null | undefined): boolean =>
  isLearnableWord(word);

/**
 * 用户**已经学过**的词还能不能复习。
 *
 * ⚠️ 只由既有 record 决定,**与 publication 无关**。
 * 收紧发布规则只作用于新引入,不回溯清理 —— 已经在 SRS 里的词不能凭空消失。
 *
 * ⚠️ **不按 `status` / `box` / `dueAt` 再加门槛。** 那会把「内容发布收紧」
 * 悄悄变成「用户进度清理」:一条字段不全的旧记录同样是用户学过的证据,
 * 挡掉它等于替用户决定那次学习不算数。空对象也返回 true,就是这个意思。
 */
export const canReviewWord = (
  _word: PublishableWord | null | undefined,
  record: ProgressRecord,
): boolean => isProgressRecord(record);

/**
 * 详情页该不该给评分入口。
 *
 * ⚠️ 判断放在**调用方**,不放进 `grade()`:`grade` 同时服务深内容(深卡/地点/场景句),
 * 参数只有 key 和 bookId,在里面猜 publication 是错的层。
 */
export const canGradeWord = (
  word: PublishableWord | null | undefined,
  record: ProgressRecord,
): boolean => canIntroduceWord(word) || canReviewWord(word, record);
