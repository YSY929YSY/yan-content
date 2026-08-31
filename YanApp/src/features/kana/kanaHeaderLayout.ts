/**
 * 五十音头部 + 提示卡的高度模型 —— UI 与测试共用同一份常量，不允许分别定义。
 *
 * 背景见 `docs/handoff/TICKET-kana-header.md`：根因是「看过 X/46」计数块只在
 * 清音屏渲染，切走时整块消失，下面内容往上跳。修法是让下面三块的高度都变成
 * 与 kanaSection 无关的常量：
 *
 *   1. 头部第一行（标题/副标题 + 平假名|片假名 + 对照）—— 固定高度；
 *      外来语屏不渲染右侧控件时，这一行的槽位高度不变（不是内容撑出来的）
 *   2. 头部第二行（五个子标签的分段控件）—— 固定高度，五段等宽、不换行
 *   3. 提示卡（理论说明）—— minHeight 按五段文案里最长的一段估算，
 *      短文案会留白，但高度不会比长文案矮
 *
 * 三块常量高度加总 = 「提示卡下沿」到 `kn.hd` 顶边的固定偏移，与选中哪个
 * 子标签无关 —— `kanaContentTopOffset()` 不接受 kanaSection 参数就是这个
 * 设计的直接体现：一旦某个分支需要按 kanaSection 加一段高度，就是在
 * 重新引入闪跳，应该先来改这个文件，而不是直接在 JSX 里加条件渲染。
 *
 * ⚠️ 这条边界之下（行标签、拗音分组标签、外来语组合说明）是各子标签
 * 真实内容不同导致的高度差，不在这份工单范围内 —— 那是内容本身的差异
 * （比如「フ + 小ァィェォ」这行说明只有外来语数据里有），不是这次要修的
 * 「同一层级、只因渲染分支不同而产生」的闪跳。
 */

export const KANA_HD_PADDING_TOP = 20;
export const KANA_HD_PADDING_BOTTOM = 14;

export const KANA_HEADER_ROW1_HEIGHT = 48;
export const KANA_HEADER_ROW1_MARGIN_TOP = 4;

export const KANA_SEGMENT_HEIGHT = 40;
export const KANA_SEGMENT_MARGIN_TOP = 12;

export const KANA_SCROLL_PADDING_TOP = 16;

/**
 * 提示卡最小高度。**实测值，不再是估算。**
 *
 * 2026-08-31 补上 react-native-web 后，在真实渲染器里逐个子标签量过卡片外框：
 * 320 屏（最窄）下五段文案**全部渲染成 140px**，414 屏下更矮。取最窄屏的最大值 → 140。
 *
 * 原值 180 是按「66 字 ÷ 20 字/行 ≈ 4 行 + 1 行余量」估的，估大了 —— 
 * 414 屏上浪费 76px，就是负责人看到的那块空白。
 *
 * ⚠️ 中途取过 124（只加了子元素高度、漏了它们之间的 margin）。124 比真实内容矮，
 * minHeight 就不再生效、卡片变回内容撑开 —— 那等于把上一轮修掉的闪跳放回来。
 * **这个数必须量卡片外框，不是量子元素之和。**
 *
 * 复算（需要先 `npx expo export --platform web` 起预览）：
 * 逐个点五个子标签，量 minHeight 卡片的子元素高度合计 + padding。
 * 命令与输出见 `docs/handoff/CC-REPORT.md` 2026-08-31 一节。
 *
 * ⚠️ 改文案就要重量。文案变长而这个数没跟着改 = 切标签重新开始闪跳。
 */
export const KANA_THEORY_CARD_MIN_HEIGHT = 140;
export const KANA_THEORY_CARD_MARGIN_BOTTOM = 20;

/**
 * 头部（`kn.hd`）自身高度，不含 borderBottomWidth。
 * 不接受 kanaSection 参数 —— 一旦某个分支需要按 kanaSection 加一段高度，
 * 就是在重新引入闪跳，应该显式改这里，而不是直接改 JSX。
 */
export function kanaHeaderHeight(): number {
  return (
    KANA_HD_PADDING_TOP +
    KANA_HEADER_ROW1_HEIGHT +
    KANA_HEADER_ROW1_MARGIN_TOP +
    KANA_SEGMENT_MARGIN_TOP +
    KANA_SEGMENT_HEIGHT +
    KANA_HD_PADDING_BOTTOM
  );
}

/**
 * 从 `kn.hd` 顶边到「提示卡下沿」的固定偏移 —— 假名格区域
 * （行标签/拗音分组标签/假名格本身）的起点。五个子标签算出来必须是同一个数。
 */
export function kanaContentTopOffset(): number {
  return (
    kanaHeaderHeight() +
    KANA_SCROLL_PADDING_TOP +
    KANA_THEORY_CARD_MIN_HEIGHT +
    KANA_THEORY_CARD_MARGIN_BOTTOM
  );
}

export const KANA_SECTIONS = ['clear', 'voiced', 'yoon', 'special', 'loanword'] as const;
export type KanaSection = (typeof KANA_SECTIONS)[number];
