/**
 * 画布交互的数学层 —— 第二批。
 *
 * 这里**只有纯函数**,不 import 任何 RN / reanimated 的东西。两个原因:
 *
 *  1. 能测。这个项目只测纯函数,而每一个丢过数据、每一个「只能上传一张」
 *     级别的 bug 都出在没被测到的那层。手势数学放进组件里就等于放弃测试。
 *  2. 能进 worklet。手势要在 UI 线程跑(工单 2.1:位置写 shared value,
 *     不走 setState —— 每帧 setState 会掉到 20fps),UI 线程只能调
 *     worklet 化的函数。带 `'worklet'` 指令的纯函数两边都能用。
 *
 * ⚠️ `'worklet'` 指令在 Node 里就是一句无害的字符串字面量,所以同一份代码
 *    既能被 reanimated 编译进 UI 线程,也能被 node --test 直接跑。
 */

import { PAGE, CANVAS, ORIGIN, wrapAngle, clampScale } from './journalTypes.ts';
import { DROP_JITTER, LAYER, ITEM_Z_MIN, ITEM_Z_MAX } from './journalTheme.ts';

// ─────────────────────────────────────────────────────────────
// 屏幕 ↔ 页面坐标
// ─────────────────────────────────────────────────────────────

/**
 * 画布在屏幕上怎么摆。
 *
 * ⚠️ 按 **CANVAS** 适配,不是按 PAGE(工单 2.4)。
 * 按 PAGE 适配的话纸会铺满容器,而溢出到纸外的元素正好落在容器外被裁掉 ——
 * 「拖出纸边不裁剪」这条就废了。留出的那圈 120 就是给溢出用的。
 */
export function fitCanvas(containerW: number, containerH: number) {
  const scale = Math.min(containerW / CANVAS.w, containerH / CANVAS.h);
  const w = CANVAS.w * scale;
  const h = CANVAS.h * scale;
  return {
    scale,
    /** 画布左上角(= 页面坐标 ORIGIN)在容器里的像素位置 */
    left: (containerW - w) / 2,
    top: (containerH - h) / 2,
    width: w,
    height: h,
    /** 纸左上角(= 页面坐标 0,0)相对画布左上角的像素偏移 */
    paperLeft: -ORIGIN.x * scale,
    paperTop: -ORIGIN.y * scale,
    paperWidth: PAGE.w * scale,
    paperHeight: PAGE.h * scale,
  };
}

/** 屏幕像素长度 → 页面单位。手势的位移都要过这一步。 */
export function toPageLen(px: number, scale: number): number {
  'worklet';
  return scale > 0 ? px / scale : 0;
}

/** 容器内的点 → 页面坐标。点击落在哪个元素上要用它。 */
export function screenToPage(
  px: number, py: number,
  fit: { scale: number; left: number; top: number },
) {
  'worklet';
  const s = fit.scale > 0 ? fit.scale : 1;
  return {
    x: (px - fit.left) / s + ORIGIN.x,
    y: (py - fit.top) / s + ORIGIN.y,
  };
}

// ─────────────────────────────────────────────────────────────
// 手势
// ─────────────────────────────────────────────────────────────

/** 一次手势开始那一刻的快照。**所有增量都相对它算,不逐帧累加。** */
export type GestureStart = { x: number; y: number; rotation: number; scale: number };

/**
 * 拖动到哪。
 *
 * ⚠️ **必须相对起手快照算,不能每帧 `x += dx`。**
 * reanimated 的 `translation` 本来就是「相对手势起点的总位移」,
 * 逐帧再累加一次会让元素以平方速度飞出去 —— 而且手势被打断重放时对不上。
 */
export function dragTo(
  start: GestureStart, dxScreen: number, dyScreen: number, scale: number,
) {
  'worklet';
  return {
    x: start.x + toPageLen(dxScreen, scale),
    y: start.y + toPageLen(dyScreen, scale),
  };
}

/**
 * 双指:**同时**旋转 + 缩放(工单 2.2「不要拆成两个手势」)。
 *
 * 一次调用同时算出两个值,所以它们永远同步。拆成两个回调各改各的,
 * 中间会有一帧只更新了其中一个,捏合时看得出「先转后缩」的抽动。
 *
 * @param gestureScale    reanimated PinchGesture 的 scale(1 = 没变)
 * @param gestureRotation reanimated RotationGesture 的 rotation(**弧度**)
 */
export function pinchTo(start: GestureStart, gestureScale: number, gestureRotation: number) {
  'worklet';
  return {
    scale: clampScale(start.scale * (gestureScale > 0 ? gestureScale : 1)),
    rotation: wrapAngle(start.rotation + (gestureRotation * 180) / Math.PI),
  };
}

/**
 * 用右下角把手转到哪。
 *
 * 把手是**绝对角**手势:算的是「手指现在在元素中心的哪个方向」减去
 * 「按下时在哪个方向」,再加回按下时的角度。这样把手会一直跟着手指走,
 * 不会因为转过头而失控。
 *
 * @param cx,cy       元素中心(容器像素)
 * @param startAngle  按下那一刻 atan2 出来的角(度)
 */
export function rotateHandleTo(
  start: GestureStart, cx: number, cy: number, px: number, py: number, startAngle: number,
) {
  'worklet';
  const now = (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
  return wrapAngle(start.rotation + (now - startAngle));
}

/** 按下把手那一刻的基准角。 */
export function angleAt(cx: number, cy: number, px: number, py: number): number {
  'worklet';
  return (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
}

/**
 * 松手时叠加的随机抖动(工单 2.2)。
 *
 * ⚠️ **这条看起来像 bug,是这个功能的灵魂,不要省。**
 * 「手贴上去本来就不会正 —— 每次松手它都会重新歪一点点。」
 *
 * 是**叠加**不是重设:每次松手都在上一次基础上再歪一点,角度会随使用漂移。
 * 漂出 ±180 由 wrapAngle 收 —— 不收的话导出时某些渲染路径会算错。
 */
export function applyDropJitter(rotation: number, rand: () => number = Math.random): number {
  const span = DROP_JITTER.max - DROP_JITTER.min;
  return wrapAngle(rotation + DROP_JITTER.min + rand() * span);
}

/**
 * 别让元素被拖丢。
 *
 * ⚠️ 这是**防丢不是防越界** —— 工单红线明确要求 x/y 可以为负、可以超出纸面。
 * 卡的是画布边界(CANVAS),不是纸边界(PAGE):元素可以整个跑到纸外面去,
 * 但不能跑到画布外面,那样用户再也点不到它,而且导出时也不在画面里。
 */
export function clampToCanvas(x: number, y: number) {
  'worklet';
  const minX = ORIGIN.x, maxX = ORIGIN.x + CANVAS.w;
  const minY = ORIGIN.y, maxY = ORIGIN.y + CANVAS.h;
  return {
    x: x < minX ? minX : x > maxX ? maxX : x,
    y: y < minY ? minY : y > maxY ? maxY : y,
  };
}

// ─────────────────────────────────────────────────────────────
// 层级
// ─────────────────────────────────────────────────────────────

type Z = { id: string; zIndex: number };

/** 当前最高层。空数组返回 items 层的起点,不返回 0(0 是纸底色那层)。 */
export const maxZ = (items: readonly Z[]) =>
  items.length ? Math.max(...items.map(i => i.zIndex)) : ITEM_Z_MIN;

export const minZ = (items: readonly Z[]) =>
  items.length ? Math.min(...items.map(i => i.zIndex)) : ITEM_Z_MIN;

/**
 * 把 items 的 zIndex 压回从 ITEM_Z_MIN 起的连续整数,顺序不变。
 *
 * 为什么需要:置顶是「比最高的再高 1」,反复置顶会一路涨。
 * 涨过 ITEM_Z_MAX(299)就会越过胶带层(300),照片会盖住本该压着它的胶带。
 */
export function restack<T extends Z>(items: readonly T[]): T[] {
  return [...items]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((it, i) => ({ ...it, zIndex: ITEM_Z_MIN + i }));
}

/** 需要时才重排 —— 每次都重排会让 React 每个元素都变 identity。 */
export function restackIfNeeded<T extends Z>(items: readonly T[]): T[] {
  return maxZ(items) >= ITEM_Z_MAX ? restack(items) : [...items];
}

/**
 * 置顶。拖动开始时也走这里(工单 2.2:移动中 zIndex 提到最上层)。
 *
 * 已经在最上面就原样返回**同一个数组引用** —— 拖动每次按下都调它,
 * 返回新数组会让整页重渲染。
 */
export function bringToFront<T extends Z>(items: readonly T[], id: string): T[] {
  const top = maxZ(items);
  const target = items.find(i => i.id === id);
  if (!target || (target.zIndex === top && items.length > 1)) return items as T[];
  return restackIfNeeded(items.map(i => (i.id === id ? { ...i, zIndex: top + 1 } : i)));
}

/** 置底。ITEM_Z_MIN 是下限,所以往下挤要靠重排而不是给负数。 */
export function sendToBack<T extends Z>(items: readonly T[], id: string): T[] {
  const bottom = minZ(items);
  const target = items.find(i => i.id === id);
  if (!target) return items as T[];
  // 先把目标压到最底之下,再整体重排回连续整数
  return restack(items.map(i => (i.id === id ? { ...i, zIndex: bottom - 1 } : i)));
}

/** 渲染顺序:zIndex 小的先画。RN 没有真正的 z-index,靠数组顺序。 */
export const inPaintOrder = <T extends Z>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => a.zIndex - b.zIndex);

/** 拖动中的元素画在哪一层 —— 笔迹之上、纸纹之下(工单 2.3)。 */
export const DRAG_Z = LAYER.dragging;
