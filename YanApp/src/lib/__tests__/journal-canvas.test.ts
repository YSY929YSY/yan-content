/**
 * 手账 v1 第二批:画布交互的数学层。
 *
 * 同一条自我约束:**断言写「要求真正的含义」,不是它的弱化代理。**
 * 例:工单要「拖出纸边不被裁剪」——
 * 断言 `x 可以是负数` 是弱化代理(负数照样可能被裁),
 * 所以这里断的是「x=-100 的元素换算到屏幕后,仍落在画布的可见范围内」。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PAGE, CANVAS, ORIGIN, SCALE_MIN, SCALE_MAX } from '../../features/journal/journalTypes.ts';
import { ITEM_Z_MIN, ITEM_Z_MAX, LAYER } from '../../features/journal/journalTheme.ts';
import {
  fitCanvas, toPageLen, screenToPage,
  dragTo, pinchTo, rotateHandleTo, angleAt, applyDropJitter, clampToCanvas,
  maxZ, minZ, restack, restackIfNeeded, bringToFront, sendToBack, inPaintOrder,
} from '../../features/journal/journalCanvas.ts';

const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]!; };
const start = (p: Partial<{ x: number; y: number; rotation: number; scale: number }> = {}) =>
  ({ x: 500, y: 800, rotation: 0, scale: 1, ...p });

// ─────────────────────────────────────────────
// 屏幕 ↔ 页面
// ─────────────────────────────────────────────

test('画布按 CANVAS 适配容器,不是按 PAGE —— 按 PAGE 适配溢出就会被裁', () => {
  const fit = fitCanvas(390, 700);
  // 纸只占画布的一部分,四周留出的圈就是给溢出用的
  assert.ok(fit.paperWidth < fit.width, '纸必须比画布窄,否则没有溢出的余地');
  assert.ok(fit.paperHeight < fit.height);
  assert.ok(fit.paperLeft > 0 && fit.paperTop > 0);
  // 画布整体装得进容器
  assert.ok(fit.width <= 390.001 && fit.height <= 700.001);
});

test('★ 拖到纸外的元素仍在画布可见范围内 —— 这才是「不被裁剪」', () => {
  const fit = fitCanvas(390, 700);
  // 一个中心跑到纸左边缘外 100 页面单位的元素
  const sx = fit.left + (-100 - ORIGIN.x) * fit.scale;
  assert.ok(sx >= fit.left, `跑到纸外的元素落在画布左边界之外(${sx} < ${fit.left})`);
  assert.ok(sx <= fit.left + fit.width);
  // 而且它确实在纸的左边缘之外 —— 否则这条测试什么也没证明
  assert.ok(sx < fit.left + fit.paperLeft, '它应该在纸的左边缘外面');
});

test('屏幕点换算回页面坐标,和正向换算互为逆运算', () => {
  const fit = fitCanvas(390, 700);
  const p = screenToPage(fit.left + fit.paperLeft, fit.top + fit.paperTop, fit);
  assert.ok(Math.abs(p.x - 0) < 1e-9, '纸左上角应该换算成页面坐标 (0,0)');
  assert.ok(Math.abs(p.y - 0) < 1e-9);
  const q = screenToPage(fit.left, fit.top, fit);
  assert.ok(Math.abs(q.x - ORIGIN.x) < 1e-9, '画布左上角应该是 ORIGIN');
});

test('长度换算:scale 为 0 不产生 NaN/Infinity', () => {
  assert.equal(toPageLen(100, 0), 0);
  assert.ok(Number.isFinite(toPageLen(100, 0.5)));
  assert.equal(toPageLen(100, 0.5), 200);
});

// ─────────────────────────────────────────────
// 手势
// ─────────────────────────────────────────────

test('★ 拖动相对起手快照算,不逐帧累加 —— 累加会让元素以平方速度飞走', () => {
  const s = start();
  // 同一次手势里连续三帧,位移是「相对起点的总量」而不是增量
  const f1 = dragTo(s, 10, 0, 1);
  const f2 = dragTo(s, 20, 0, 1);
  const f3 = dragTo(s, 30, 0, 1);
  assert.equal(f1.x, 510);
  assert.equal(f2.x, 520);
  assert.equal(f3.x, 530, '第三帧应该是 +30,不是 +10+20+30');
  // 手势被打断后用同样的 translation 重放,结果必须一样(幂等)
  assert.deepEqual(dragTo(s, 30, 0, 1), f3);
});

test('拖动把屏幕像素换算成页面单位', () => {
  // 画布缩到一半时,手指移 10px 等于元素移 20 页面单位
  assert.equal(dragTo(start(), 10, 10, 0.5).x, 520);
  assert.equal(dragTo(start(), 10, 10, 0.5).y, 820);
});

test('★ 双指:旋转和缩放由同一次调用同时算出 —— 不拆成两个手势', () => {
  const s = start({ rotation: 10, scale: 1 });
  const r = pinchTo(s, 2, Math.PI / 2);
  assert.equal(r.scale, 2, '缩放要生效');
  assert.equal(r.rotation, 100, '旋转要同时生效(90° + 原来的 10°)');
  // 两个值来自同一个返回对象,不可能出现「只更新了其中一个」的中间帧
  assert.deepEqual(Object.keys(r).sort(), ['rotation', 'scale']);
});

test('双指缩放卡在 0.3~3,且以起手 scale 为基准', () => {
  assert.equal(pinchTo(start({ scale: 2 }), 4, 0).scale, SCALE_MAX);
  assert.equal(pinchTo(start({ scale: 0.5 }), 0.1, 0).scale, SCALE_MIN);
  assert.equal(pinchTo(start({ scale: 1.5 }), 2, 0).scale, 3);
  // gestureScale 异常值不产生 NaN
  assert.ok(Number.isFinite(pinchTo(start(), 0, 0).scale));
});

test('双指旋转累积后仍收在 -180~180', () => {
  const r = pinchTo(start({ rotation: 170 }), 1, Math.PI);   // +180°
  assert.ok(Math.abs(r.rotation) <= 180, `漂出范围: ${r.rotation}`);
});

test('旋转把手跟着手指走,是绝对角不是增量角', () => {
  const s = start({ rotation: 0 });
  const base = angleAt(100, 100, 200, 100);      // 正右方 = 0°
  assert.equal(base, 0);
  // 手指转到正下方(+90°),元素就该转 90°
  assert.equal(rotateHandleTo(s, 100, 100, 100, 200, base), 90);
  // 转过头再转回来,结果回到原处 —— 增量式实现做不到这点
  assert.equal(rotateHandleTo(s, 100, 100, 200, 100, base), 0);
});

test('★ 松手抖动是叠加的,每次都不一样 —— 这是「手账感」的核心,不是 bug', () => {
  let r = 0;
  // ⚠️ 取值别让两次抖动正好互相抵消:0.9 之后跟 0.1 会得到 +1.2 再 -1.2,
  // 结果回到 0,断言「每次都不一样」会假失败。
  const rand = seq(0.9, 0.8, 0.2);
  const a = applyDropJitter(r, rand); r = a;
  const b = applyDropJitter(r, rand); r = b;
  const c = applyDropJitter(r, rand);
  assert.notEqual(a, b);
  assert.notEqual(b, c);
  // 单次幅度不超过 ±1.5
  assert.ok(Math.abs(a - 0) <= 1.5);
  assert.ok(Math.abs(b - a) <= 1.5 + 1e-9);
  // 叠加意味着角度会漂 —— 不是每次都从 0 重设
  assert.notEqual(c, applyDropJitter(0, seq(0.5)));
});

test('松手抖动漂了几百次也不会越出 -180~180', () => {
  let r = 0;
  for (let i = 0; i < 500; i++) r = applyDropJitter(r);
  assert.ok(Math.abs(r) <= 180, `漂到了 ${r}`);
});

test('★ 防丢不防越界:能整个跑到纸外,但不能跑出画布', () => {
  // 纸外是允许的 —— 工单红线
  assert.deepEqual(clampToCanvas(-100, -100), { x: -100, y: -100 });
  assert.deepEqual(clampToCanvas(PAGE.w + 100, PAGE.h + 100),
    { x: PAGE.w + 100, y: PAGE.h + 100 });
  // 画布外要卡住,否则用户再也点不到它
  assert.equal(clampToCanvas(-99999, 0).x, ORIGIN.x);
  assert.equal(clampToCanvas(99999, 0).x, ORIGIN.x + CANVAS.w);
  assert.equal(clampToCanvas(0, 99999).y, ORIGIN.y + CANVAS.h);
});

// ─────────────────────────────────────────────
// 层级
// ─────────────────────────────────────────────

const zs = (...v: number[]) => v.map((z, i) => ({ id: `i${i}`, zIndex: z }));

test('置顶把元素提到最上面', () => {
  const out = bringToFront(zs(10, 11, 12), 'i0');
  assert.ok(out.find(i => i.id === 'i0')!.zIndex > out.find(i => i.id === 'i2')!.zIndex);
});

test('已经在最上面时置顶返回同一个数组引用 —— 否则每次按下都整页重渲染', () => {
  const items = zs(10, 11, 12);
  assert.equal(bringToFront(items, 'i2'), items);
  // 找不到的 id 也不该产生新数组
  assert.equal(bringToFront(items, '不存在'), items);
});

test('置底把元素压到最下面,且不产生负的 zIndex', () => {
  const out = sendToBack(zs(10, 11, 12), 'i2');
  const me = out.find(i => i.id === 'i2')!;
  assert.equal(me.zIndex, ITEM_Z_MIN);
  assert.ok(out.every(i => i.zIndex >= ITEM_Z_MIN), '不能有元素落到 items 层以下');
  assert.ok(out.find(i => i.id === 'i0')!.zIndex > me.zIndex);
});

test('★ 反复置顶不会越过胶带层 —— 越过了照片就会盖住本该压着它的胶带', () => {
  let items = zs(10, 11, 12);
  for (let i = 0; i < 2000; i++) items = bringToFront(items, `i${i % 3}`);
  assert.ok(maxZ(items) < LAYER.tape, `涨到了 ${maxZ(items)},已经越过胶带层 ${LAYER.tape}`);
  assert.ok(minZ(items) >= ITEM_Z_MIN);
  // 顺序仍然是有效的偏序(没有因为重排而并列)
  assert.equal(new Set(items.map(i => i.zIndex)).size, items.length);
});

test('重排保持相对顺序,只换数值', () => {
  const out = restack(zs(50, 10, 99));
  assert.deepEqual(out.map(i => i.id), ['i1', 'i0', 'i2']);
  assert.deepEqual(out.map(i => i.zIndex), [ITEM_Z_MIN, ITEM_Z_MIN + 1, ITEM_Z_MIN + 2]);
});

test('没涨到上限就不重排 —— 每次重排都会让 React 每个元素换 identity', () => {
  const items = zs(10, 11);
  assert.deepEqual(restackIfNeeded(items).map(i => i.zIndex), [10, 11]);
  assert.deepEqual(restackIfNeeded(zs(ITEM_Z_MAX, ITEM_Z_MAX + 1)).map(i => i.zIndex),
    [ITEM_Z_MIN, ITEM_Z_MIN + 1]);
});

test('绘制顺序按 zIndex 从小到大 —— RN 没有真 z-index,靠数组顺序', () => {
  assert.deepEqual(inPaintOrder(zs(30, 10, 20)).map(i => i.id), ['i1', 'i2', 'i0']);
});

test('空数组不炸,也不返回 0(0 是纸底色那层)', () => {
  assert.equal(maxZ([]), ITEM_Z_MIN);
  assert.equal(minZ([]), ITEM_Z_MIN);
  assert.deepEqual(restack([]), []);
});
