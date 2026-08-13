// 手账手势的纯计算测试。
//
// 守的是三种「不报错但用户会骂」的失败:
//   1. 点不中 —— 尤其是转过角度的元素,包围盒没跟着转就会「看着在里面点不着」
//   2. 拖到看不见的地方再也找不回来 —— 这一版还没有撤销,丢了就是丢了
//   3. 摸到的东西没浮到最上面 —— 真实拼贴里伸手去动一张票根,它就该到最上面
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAngle, boxOf, hitsItem, hitTest, bringToFront,
  applyGesture, replaceItem, toPageCoords,
  SCALE_MIN, SCALE_MAX, POS_MIN, POS_MAX,
} from '../../features/journal/journalGesture.js';

const PW = 300, PH = 514;   // 和真机同一个比例 1400:2400

const item = (patch = {}) => ({
  id: 'i1', kind: 'photo', assetId: 'a1',
  x: 0.5, y: 0.5, w: 0.4, scale: 1, rotation: 0, z: 1, ...patch,
});

// ── 角度 ─────────────────────────────────────────────────────
test('角度归一到 (-180, 180] —— 转几圈之后数值不该一直涨', () => {
  assert.equal(normalizeAngle(0), 0);
  assert.equal(normalizeAngle(370), 10);
  assert.equal(normalizeAngle(-370), -10);
  assert.equal(normalizeAngle(180), 180);
  assert.equal(normalizeAngle(-180), 180);
  assert.equal(normalizeAngle(720), 0);
  assert.ok(!Object.is(normalizeAngle(-360), -0), '别留 -0,存进 JSON 很难看');
  assert.equal(normalizeAngle(NaN), 0);
});

// ── 命中判定 ─────────────────────────────────────────────────
test('高度由图片长宽比决定,不存在元素数据里 —— 换张图不该回填所有页', () => {
  // 正方形图:相对高 = 相对宽 × (页宽/页高),因为 x/y 的单位长度不一样
  const sq = boxOf(item(), 1, PW, PH);
  assert.equal(sq.w, 0.4);
  assert.ok(Math.abs(sq.h - 0.4 * (PW / PH)) < 1e-9);
  // 竖图更高
  assert.ok(boxOf(item(), 1.5, PW, PH).h > sq.h);
  // scale 同时放大宽和高
  assert.equal(boxOf(item({ scale: 2 }), 1, PW, PH).w, 0.8);
  // 拿不到长宽比按正方形算,不抛
  assert.equal(boxOf(item(), undefined, PW, PH).w, 0.4);
  assert.equal(boxOf(item(), 0, PW, PH).h, sq.h);
});

test('★ 转过角度的元素,包围盒跟着转 —— 不转的话斜着的票根点不着', () => {
  // 必须用**非正方形**的图才测得出来:正方形转 90° 前后占的像素一模一样,
  // 包围盒转不转都看不出区别(第一版测试就是这么写的,过不了)。
  // 这里是一张扁图(高/宽 = 0.5):0.6 页宽 = 180px 宽,90px 高。
  const ASPECT = 0.5;
  const straight = item({ w: 0.6, rotation: 0 });
  const turned = item({ w: 0.6, rotation: 90 });
  // 正中心往上 60px:超出扁图的半高(45px),但没超出立起来之后的半高(90px)
  const p = { x: 0.5, y: 0.5 - 60 / PH };
  assert.equal(hitsItem(straight, p, ASPECT, PW, PH), false);
  assert.equal(hitsItem(turned, p, ASPECT, PW, PH), true);
  // 反过来,正中心往右 60px:扁图中,立起来之后不中
  const q = { x: 0.5 + 60 / PW, y: 0.5 };
  assert.equal(hitsItem(straight, q, ASPECT, PW, PH), true);
  assert.equal(hitsItem(turned, q, ASPECT, PW, PH), false);
  // 中心点四种情况都中
  assert.equal(hitsItem(straight, { x: 0.5, y: 0.5 }, ASPECT, PW, PH), true);
  assert.equal(hitsItem(turned, { x: 0.5, y: 0.5 }, ASPECT, PW, PH), true);
});

test('★ 点中的是最上面那个 —— 屏幕上盖住别人的,就是用户以为点中的', () => {
  const items = [
    item({ id: 'bottom', z: 1 }),
    item({ id: 'top', z: 5 }),
    item({ id: 'middle', z: 3 }),
  ];
  assert.equal(hitTest(items, { x: 0.5, y: 0.5 }, { pageWidth: PW, pageHeight: PH })?.id, 'top');
  // 数组顺序不影响结果,z 才算数
  const shuffled = [items[1], items[2], items[0]];
  assert.equal(hitTest(shuffled, { x: 0.5, y: 0.5 }, { pageWidth: PW, pageHeight: PH })?.id, 'top');
});

test('★ 手写不参与命中 —— 一笔字的包围盒能横跨半页,拿它当矩形会「点哪儿都在拖那行字」', () => {
  const items = [
    item({ id: 'ink', kind: 'ink', assetId: null, z: 9, w: 1 }),
    item({ id: 'photo', z: 1 }),
  ];
  assert.equal(hitTest(items, { x: 0.5, y: 0.5 }, { pageWidth: PW, pageHeight: PH })?.id, 'photo');
});

test('点在空白处返回 null,不要「就近找一个」', () => {
  const items = [item()];
  const at = (x, y) => hitTest(items, { x, y }, { pageWidth: PW, pageHeight: PH });
  assert.equal(at(0.05, 0.05), null);
  assert.equal(at(0.5, 0.5)?.id, 'i1');
  assert.equal(hitTest([], { x: 0.5, y: 0.5 }), null);
  assert.equal(hitTest(null, { x: 0.5, y: 0.5 }), null);
});

test('越到页面外面的元素照样点得中 —— 越界是合法的,不是要被排除的异常', () => {
  const out = item({ x: 1.05, y: 0.5 });
  assert.equal(hitsItem(out, { x: 1.05, y: 0.5 }, 1, PW, PH), true);
  assert.equal(hitTest([out], { x: 1.05, y: 0.5 }, { pageWidth: PW, pageHeight: PH })?.id, 'i1');
});

// ── 层级 ─────────────────────────────────────────────────────
test('★ 摸到就提到最上面', () => {
  const items = [item({ id: 'a', z: 1 }), item({ id: 'b', z: 2 }), item({ id: 'c', z: 3 })];
  const next = bringToFront(items, 'a');
  assert.equal(next.find(i => i.id === 'a').z, 4);
  // 其余的 z 一个都没动
  assert.equal(next.find(i => i.id === 'b').z, 2);
  assert.equal(next.find(i => i.id === 'c').z, 3);
});

test('已经在最上面就返回同一个数组 —— 白改一次 z 会让整页白重渲', () => {
  const items = [item({ id: 'a', z: 1 }), item({ id: 'c', z: 3 })];
  assert.equal(bringToFront(items, 'c'), items);
  assert.equal(bringToFront(items, '不存在'), items);
});

// ── 手势 ─────────────────────────────────────────────────────
test('位移按相对坐标走 —— 换个屏幕宽度,同样的手指距离该走同样的比例', () => {
  const moved = applyGesture(item(), { dxPx: PW * 0.25, dyPx: PH * 0.1 }, PW, PH);
  assert.ok(Math.abs(moved.x - 0.75) < 1e-9);
  assert.ok(Math.abs(moved.y - 0.6) < 1e-9);
  // 换一块两倍宽的屏,拖过去的像素也翻倍,落点应该一样
  const onBigScreen = applyGesture(item(), { dxPx: PW * 2 * 0.25, dyPx: PH * 2 * 0.1 },
                                   PW * 2, PH * 2);
  assert.ok(Math.abs(onBigScreen.x - moved.x) < 1e-9);
  assert.ok(Math.abs(onBigScreen.y - moved.y) < 1e-9);
});

test('★ 元素可以拖到纸外面 —— 「延展到本子外面」就是这一条', () => {
  // 中心拖到 x=1.1:整个元素都在纸的右边,落在桌面上
  const off = applyGesture(item(), { dxPx: PW * 0.6 }, PW, PH);
  assert.ok(off.x > 1, '拖到页边外应该是合法的');
  // 半只脚在外面也是合法的(w=0.4,中心 0.9 → 右边缘 1.1)
  assert.ok(applyGesture(item(), { dxPx: PW * 0.4 }, PW, PH).x + 0.2 > 1);
});

test('★ 但拖不到找不回来的地方 —— 这一版还没有撤销', () => {
  const flung = applyGesture(item(), { dxPx: PW * 99, dyPx: PH * 99 }, PW, PH);
  assert.equal(flung.x, POS_MAX);
  assert.equal(flung.y, POS_MAX);
  const back = applyGesture(item(), { dxPx: -PW * 99, dyPx: -PH * 99 }, PW, PH);
  assert.equal(back.x, POS_MIN);
  assert.equal(back.y, POS_MIN);
  // 兜底范围要明显宽于页面,不然就成了「关回页内」,那是另一回事
  assert.ok(POS_MIN < -0.2 && POS_MAX > 1.2);
});

test('★ 缩放有上下限 —— 捏到一个点就再也点不着了', () => {
  assert.equal(applyGesture(item(), { scale: 0.0001 }, PW, PH).scale, SCALE_MIN);
  assert.equal(applyGesture(item(), { scale: 9999 }, PW, PH).scale, SCALE_MAX);
  assert.equal(applyGesture(item(), { scale: 2 }, PW, PH).scale, 2);
  // 缩放是**乘**在起手那份上的
  assert.equal(applyGesture(item({ scale: 1.5 }), { scale: 2 }, PW, PH).scale, 3);
  // 0 和负数当没缩放,不要产出一个宽度为 0 的元素
  assert.equal(applyGesture(item(), { scale: 0 }, PW, PH).scale, 1);
  assert.equal(applyGesture(item(), { scale: -1 }, PW, PH).scale, 1);
});

test('★ 增量都相对起手那一刻,不是相对上一帧 —— 累加会让松手时和手指对不上', () => {
  const base = item();
  // 同一个 base 连着算两次「往右 30px」,结果必须一样(幂等),不是走了 60px
  const once = applyGesture(base, { dxPx: 30 }, PW, PH);
  const twice = applyGesture(base, { dxPx: 30 }, PW, PH);
  assert.deepEqual(once, twice);
  assert.equal(base.x, 0.5, '起手快照不能被就地改掉');
});

test('手势只动位置/大小/角度,材质和厚度一个都不碰 —— 页面永不拍平', () => {
  const base = item({ material: 'sticker', lift: 9, kind: 'sticker' });
  const next = applyGesture(base, { dxPx: 40, scale: 1.3, rotation: 15 }, PW, PH);
  assert.equal(next.material, 'sticker');
  assert.equal(next.lift, 9);
  assert.equal(next.kind, 'sticker');
  assert.equal(next.assetId, base.assetId);
  assert.equal(next.rotation, 15);
});

// ── 列表替换 ─────────────────────────────────────────────────
test('替换只换那一条,找不到就原样返回 —— 不要凭空插一条进去', () => {
  const items = [item({ id: 'a' }), item({ id: 'b' })];
  const next = replaceItem(items, { ...items[0], x: 0.1 });
  assert.equal(next.length, 2);
  assert.equal(next[0].x, 0.1);
  assert.equal(next[1], items[1], '没动的那条应该还是同一个对象引用');
  assert.equal(replaceItem(items, item({ id: '不存在' })), items);
  assert.equal(replaceItem(items, null), items);
});

// ── 坐标换算 ─────────────────────────────────────────────────
test('触点要先减掉画布四周的 pad —— 忘了减就整体偏一个 pad,点哪儿都差一点', () => {
  const opts = { pad: 20, pageWidth: PW, pageHeight: PH };
  const at = toPageCoords(20, 20, opts);
  assert.equal(at.x, 0);
  assert.equal(at.y, 0);
  const mid = toPageCoords(20 + PW / 2, 20 + PH / 2, opts);
  assert.equal(mid.x, 0.5);
  assert.equal(mid.y, 0.5);
  // 纸外面照样给出坐标(负数),不截断 —— 调用方靠它判断「拖到桌面上了」
  assert.ok(toPageCoords(0, 0, opts).x < 0);
});
