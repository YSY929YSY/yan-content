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
 * 提示卡最小高度。按五段理论文案里最长的一段（外来语，66 字）估算：
 * 256px 可用宽度（320 屏 − scroll padding 32 − 卡片 padding 32）÷ 12.5px/字
 * ≈ 20 字/行，66 字 ≈ 4 行，多留 1 行安全余量按 5 行算 —— 这是估算，
 * 不是在真实渲染器里量出来的（这个仓库没有 RN 渲染测试基建）。
 * 复算：`node -e "console.log(Math.ceil(66/20))"`。
 */
export const KANA_THEORY_CARD_MIN_HEIGHT = 180;
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
