/**
 * 手账视觉常量 —— 工单 1.6。
 *
 * 值照抄 `yan-journal-v2.html`,**不自己调**。
 *
 * ⚠️ ─────────────────────────────────────────────────────────
 * 但有一件事不能照抄:**尺寸单位**。
 *
 * 参考 HTML 里的纸是 **420 × 652 CSS px**,网格 19px、内阴影模糊 60px
 * 都是相对这个尺寸的。我们的页面单位是 **PAGE 1000 × 1600**。
 * 直接把 19 写进来,网格会细成原来的 1/2.4,整页看起来像方格纸而不是手账。
 *
 * 所以每个长度常量都写成两份:`REF_*` 是参考实现里的原值(便于对照),
 * 下面是换算到页面单位之后的值。换算系数:
 *
 *     PAGE.w / 420 = 1000 / 420 ≈ 2.381
 *
 * 按**宽度**换算,不按高度 —— 参考纸的长宽比 420/652 = 0.644,
 * 而 PAGE 是 1000/1600 = 0.625,两者不等。宽度是视觉上的主导维度,
 * 而且网格在宽度方向上的疏密最容易被看出来。
 * ─────────────────────────────────────────────────────────
 */

import { PAGE } from './journalTypes.ts';
import type { Material, ItemType, PaperId } from './journalTypes.ts';

/** 参考实现里那张纸的 CSS 尺寸。所有 REF_* 常量都以它为基准。 */
export const REF_PAGE = { w: 420, h: 652 } as const;

/** 参考单位 → 页面单位。 */
export const REF_SCALE = PAGE.w / REF_PAGE.w;   // ≈ 2.381
export const fromRef = (px: number) => Math.round(px * REF_SCALE * 100) / 100;

// ─────────────────────────────────────────────────────────────
// 纸
// ─────────────────────────────────────────────────────────────

/**
 * **纸纹和内阴影不是可选的**(工单 1.6)。
 *
 * 纯色底 + 直角矩形是「App 界面」,加了纹理和内阴影才是「纸」。
 * 这一层如果省掉,后面贴纸做得再精致也白搭。
 */
export const PAPER = {
  base: '#f4efe4',
  base2: '#efe7d8',
  edge: '#e6dcc9',

  /** 网格线颜色。参考实现里线本身 0.13 alpha,整层再乘 0.5。 */
  grid: 'rgba(150,128,95,0.13)',
  /** 网格层整体透明度(参考实现的 `.page::after { opacity:.5 }`)。 */
  gridOpacity: 0.5,
  /** 网格间距。参考 19px → 页面单位约 45。 */
  REF_gridSize: 19,
  gridSize: fromRef(19),

  /** 纸纹噪点,multiply 混合。 */
  grainOpacity: 0.3,
  /** 噪点贴图的平铺尺寸,参考实现是 140px 的 fractalNoise。 */
  REF_grainTile: 140,
  grainTile: fromRef(140),

  /**
   * 内阴影。
   *
   * ⚠️ RN **没有** inset box-shadow,这个字符串不能直接用。
   * 渲染层要么用 Skia 画一圈内发光,要么叠一层四边向内的径向渐变。
   * 这里只把参数留下来,不假装它是能直接塞进 style 的值。
   */
  innerShadow: {
    css: 'inset 0 0 60px rgba(139,116,80,0.18)',   // 原值,仅供对照
    color: 'rgba(139,116,80,0.18)',
    REF_blur: 60,
    blur: fromRef(60),
  },
  /** 纸的圆角。参考 3px —— **很小**,不是 App 卡片那种大圆角。 */
  REF_radius: 3,
  radius: fromRef(3),
} as const;

export const INK = '#3a3229';
export const INK_SOFT = '#7a6f60';
export const ACCENT = '#b4542f';

/** 打卡纸片按类型取色(工单 1.6)。 */
export const STUB_COLORS: Record<string, string> = {
  volcano: '#a8442c',
  lake: '#4a7d94',
  river: '#5c8a6a',
  mountain: '#7a6a4e',
  sea: '#3e6b86',
  city: '#8a6a3e',
};

/** 手写四色笔(工单 3.1)。 */
export const PEN_COLORS = ['#33302b', '#b4542f', '#3e6b86', '#7a8a5e'] as const;

// ─────────────────────────────────────────────────────────────
// 歪斜 —— 这个模块的灵魂
// ─────────────────────────────────────────────────────────────

/**
 * 新贴上去的元素的随机角度范围(工单 1.6)。
 *
 * **不要给 0。** 全给 0 打开就是一堵整齐的墙,那是卡片列表不是手账。
 *
 * ⚠️ `minMagnitude` 是工单没写、但必须有的一条。
 *
 * 工单只给了 ±3.5 的范围,而均匀随机在这个范围里**抽得到 0.03°**。
 * 那样「rotation ≠ 0」的断言会通过,可元素看上去仍然是正的 ——
 * 验收标准写的是「列表里没有一个元素是正的」,不是「没有一个等于 0」。
 *
 * 这个项目已经栽过一次同样的跟头:新元素落点的测试断言「两点间距 > 0.02」
 * 并且通过了,而实际两张照片盖住了彼此 87%,用户连报三次「只能上传一张」。
 * **测「两个数不一样」不等于测「人能看出来」。**
 *
 * 1.2° 的下限:一张半页宽的照片,角位移约等于 2px —— 刚好到「看得出没摆正」。
 */
export const JITTER = { min: -3.5, max: 3.5, minMagnitude: 1.2 } as const;

/**
 * 松手时**在当前角度上叠加**的随机抖动(工单 2.2)。
 *
 * ⚠️ **这条看起来像 bug,是核心,不要省。**
 * 工单原话:「手贴上去本来就不会正 —— 每次松手它都会重新歪一点点,
 * 这个不精确感就是整个功能的灵魂。」
 *
 * 注意是**叠加**不是重设:每次松手都在上一次的基础上再歪一点,
 * 所以角度会随使用慢慢漂移 —— 这是要的效果。漂出 ±180 由 wrapAngle 收。
 */
export const DROP_JITTER = { min: -1.5, max: 1.5, minMagnitude: 0 } as const;

/**
 * 在 [min,max] 里取一个角度,可选地跳过 0 附近的死区。
 *
 * `minMagnitude > 0` 时改成「先抽大小、再抽正负」:
 * 大小落在 [minMagnitude, max],符号五五开。这样保证抽出来的角**看得出来**,
 * 而不只是数值上非 0。松手抖动(DROP_JITTER)不需要死区 ——
 * 它是在已有角度上**叠加**的,叠 0.03° 完全正常。
 *
 * rand 可注入,测试时给定值 —— 迁移结果必须可复现。
 */
export const randomAngle = (
  range: { min: number; max: number; minMagnitude?: number } = JITTER,
  rand: () => number = Math.random,
) => {
  const dead = range.minMagnitude ?? 0;
  if (dead <= 0) return range.min + rand() * (range.max - range.min);
  const span = Math.max(range.max, -range.min);
  const mag = dead + rand() * Math.max(0, span - dead);
  return rand() < 0.5 ? -mag : mag;
};

// ─────────────────────────────────────────────────────────────
// 层级(工单 2.3,从下到上)
// ─────────────────────────────────────────────────────────────

/**
 * **这个顺序是对的,别改**(工单 2.3)。
 *
 * 胶带在 300、笔迹在 600 —— 意味着**手写可以写在照片上面**,
 * 胶带永远压着照片但压不住笔迹。
 */
export const LAYER = {
  paper: 1,
  grid: 2,
  rings: 3,
  datemark: 4,
  /** items 从这里起递增。 */
  itemsBase: 10,
  tape: 300,
  ink: 600,
  /** 拖动中的元素临时提到这里 —— 在笔迹之上、纸纹之下。 */
  dragging: 700,
  grain: 900,
} as const;

/**
 * 元素能占的 zIndex 区间。
 *
 * 递增到 tape(300)就得重排,否则新元素会越过胶带层。
 * 重排是把现有 items 按当前顺序压回 itemsBase 起的连续整数。
 */
export const ITEM_Z_MIN = LAYER.itemsBase;
export const ITEM_Z_MAX = LAYER.tape - 1;

/** 需不需要重排 zIndex。 */
export const needsRestack = (maxZ: number) => maxZ >= ITEM_Z_MAX;

// ─────────────────────────────────────────────────────────────
// 材质
// ─────────────────────────────────────────────────────────────

/**
 * 每种元素默认什么材质、浮多高。
 *
 * lift 是**离纸面的高度(页宽千分比)** —— 阴影的偏移和虚实由它算出来。
 * 不让调用方填:让每个调用点自己写 lift,迟早会出现两处给贴纸不同的高度,
 * 页面就花了。
 */
export const MATERIAL_DEFAULTS: Record<ItemType, { material: Material; lift: number }> = {
  photo:    { material: 'photo',   lift: 6 },
  scan:     { material: 'scan',    lift: 4 },
  cutout:   { material: 'sticker', lift: 5 },
  stub:     { material: 'paper',   lift: 3 },
  wordSlip: { material: 'paper',   lift: 3 },
  stamp:    { material: 'ink',     lift: 0 },   // 盖在纸上,没有厚度
  sticker:  { material: 'sticker', lift: 5 },
  text:     { material: 'ink',     lift: 0 },
  tape:     { material: 'tape',    lift: 1 },
};

export const materialOf = (type: ItemType) =>
  MATERIAL_DEFAULTS[type] ?? { material: 'paper' as Material, lift: 3 };

// ─────────────────────────────────────────────────────────────
// 笔迹粗细(工单 3.1,第三批用)
// ─────────────────────────────────────────────────────────────

/**
 * 笔宽公式的常量。**照抄参考实现的 `pointermove`,别自己调。**
 *
 * 有压力值(Apple Pencil):`0.8 + p * 5.2`
 * 没有压力值(手指):    `max(0.9, 4.4 - 速度 * 0.22)`
 * 两者都再过一遍平滑:  `w = lastW + (w - lastW) * 0.35`
 *
 * ⚠️ **平滑不加会画出锯齿状的毛毛虫**(工单 3.1)。
 *
 * 这些值同样是参考实现在 420px 宽的纸上调出来的,
 * 用在页面单位上要乘 REF_SCALE —— 见 strokeWidth。
 */
export const STROKE = {
  pressureBase: 0.8,
  pressureGain: 5.2,
  speedBase: 4.4,
  speedGain: 0.22,
  speedFloor: 0.9,
  smoothing: 0.35,
  eraserWidth: 18,
} as const;

/**
 * 算一个采样点的笔宽,返回**页面单位**。
 *
 * @param pressure 0~1;0 或 1 都当作「没有压力值」——
 *                 参考实现的判断是 `pressure>0 && pressure<1`,
 *                 因为很多设备在没有压感时会固定报 0 或 1。
 * @param speed    参考单位 px/ms。
 * @param lastW    上一个点的笔宽(页面单位),用于平滑。
 */
export function strokeWidth(
  pressure: number, speed: number, lastW: number,
  tool: 'pen' | 'eraser' = 'pen',
): number {
  if (tool === 'eraser') return fromRef(STROKE.eraserWidth);
  const refW = pressure > 0 && pressure < 1
    ? STROKE.pressureBase + pressure * STROKE.pressureGain
    : Math.max(STROKE.speedFloor, STROKE.speedBase - speed * STROKE.speedGain);
  const w = fromRef(refW);
  return lastW + (w - lastW) * STROKE.smoothing;
}

// ─────────────────────────────────────────────────────────────
// 纸样
// ─────────────────────────────────────────────────────────────

/** 纸样清单。id 与现有 journalPapers 的注册表对应。 */
export const PAPERS: Record<PaperId, { label: string; base: string; rule: 'none' | 'dot' | 'grid' }> = {
  'plain-cream': { label: '素 · 米黄',   base: PAPER.base,  rule: 'none' },
  'dot-cream':   { label: '点阵 · 米黄', base: PAPER.base,  rule: 'dot' },
  'grid-white':  { label: '方格 · 素白', base: '#f7f4ec',   rule: 'grid' },
  'kraft-bag':   { label: '牛皮 · 纸袋', base: '#d8c3a0',   rule: 'none' },
};

export const DEFAULT_PAPER: PaperId = 'plain-cream';
