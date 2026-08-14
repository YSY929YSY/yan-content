/**
 * 手账 v1 第一批:数据结构与迁移。
 *
 * 这份测试的写法有一条自我约束:**断言要写「要求真正的含义」,不是它的弱化代理。**
 * 例:验收标准是「列表里没有一个元素是正的」——
 * 断言 `rotation !== 0` 会在 rotation = 0.03° 时通过,而那个元素肉眼就是正的。
 * 所以这里断的是 `|rotation| >= VISIBLY_TILTED`,而那个阈值是**字面量**,
 * 不是从实现里读来的常量 —— 见下面 VISIBLY_TILTED 的注释。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PAGE, CANVAS, canvasRect, insideCanvas,
  wrapAngle, clampScale, itemCorners, itemBounds, hitTest, pickTop,
  exportPixelSize, EXPORT_HIRES, EXPORT_SCREEN,
} from '../../features/journal/journalTypes.ts';
import type { JournalItem } from '../../features/journal/journalTypes.ts';
import {
  JITTER, DROP_JITTER, randomAngle, LAYER, PAPER, REF_SCALE, fromRef,
  strokeWidth, materialOf, needsRestack, ITEM_Z_MAX,
} from '../../features/journal/journalTheme.ts';
import { migrateJournal } from '../../features/journal/journalMigrate.ts';

// 定值随机源:迁移结果必须可复现
const seq = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]!; };

/**
 * 「看得出来没摆正」的角度下限。**故意写成字面量,不引用 JITTER.minMagnitude。**
 *
 * ⚠️ 第一版这里写的是 `>= JITTER.minMagnitude` —— 阈值取自被测的常量本身,
 * 于是把常量改成 0 时断言变成 `>= 0`,**这条测试永远不可能失败**。
 * 篡改测试当场抓到了:把 minMagnitude 改回 0,26 条依然全绿。
 *
 * 阈值必须来自「要求的含义」,不能来自实现 —— 这是这个项目栽过第三次的同一类坑。
 */
const VISIBLY_TILTED = 1.0;

const item = (p: Partial<JournalItem> = {}): JournalItem => ({
  id: 'i', type: 'photo', x: 500, y: 800, w: 400, h: 300,
  rotation: 0, scale: 1, zIndex: 10, material: 'photo', lift: 6,
  payload: { assetId: 'a', srcW: 4000, srcH: 3000, frame: 'none' },
  createdAt: 0, ...p,
});

// ─────────────────────────────────────────────
// 画布 ≠ 页面
// ─────────────────────────────────────────────

test('画布四边各比纸大 120,元素可以放到纸外面', () => {
  assert.equal(CANVAS.w, PAGE.w + 240);
  assert.equal(CANVAS.h, PAGE.h + 240);
  assert.deepEqual(canvasRect(), { x: -120, y: -120, w: 1240, h: 1840 });
  // 负坐标必须是合法的 —— 这是「溢出」的数据层前提
  assert.ok(insideCanvas(-100, -100), '纸左上角外 100 应该仍在画布内');
  assert.ok(insideCanvas(1100, 1700), '纸右下角外应该仍在画布内');
  assert.ok(!insideCanvas(-200, 0), '超出画布才算越界');
});

test('导出按 CANVAS 出图,不按 PAGE 裁', () => {
  // 第四批预告对第一批的要求之一。按 PAGE 裁会把溢出到纸外的元素切掉。
  const hi = exportPixelSize(EXPORT_HIRES);
  assert.deepEqual(hi, { width: 1240 * 3, height: 1840 * 3 });
  // 倍率不写死 1x
  assert.notEqual(EXPORT_SCREEN.pixelRatio, EXPORT_HIRES.pixelRatio);
  assert.deepEqual(exportPixelSize({ pixelRatio: 1, bounds: 'page' }), { width: 1000, height: 1600 });
});

// ─────────────────────────────────────────────
// 几何
// ─────────────────────────────────────────────

test('wrapAngle 把累积漂移收回 -180~180', () => {
  assert.equal(wrapAngle(0), 0);
  assert.equal(wrapAngle(190), -170);
  assert.equal(wrapAngle(-190), 170);
  assert.equal(wrapAngle(720 + 45), 45);
  // 松手抖动叠加几百次之后的典型值
  assert.ok(Math.abs(wrapAngle(1234.5)) <= 180);
});

test('命中测试在元素旋转后仍然准', () => {
  const it = item({ rotation: 45, w: 400, h: 400 });
  // 正方形转 45° 之后,原来的角变成了边的中点外侧
  assert.ok(hitTest(it, 500, 800), '中心一定命中');
  assert.ok(hitTest(it, 500, 800 + 270), '转 45° 后正下方 270 处仍在菱形内');
  assert.ok(!hitTest(it, 500 + 190, 800 + 190), '转 45° 后原来的角落已经不在元素里了');
});

test('命中测试尊重 scale', () => {
  const small = item({ scale: 0.5, w: 400, h: 400 });
  assert.ok(hitTest(small, 500 + 90, 800), '缩到一半后 90 仍在内');
  assert.ok(!hitTest(small, 500 + 150, 800), '缩到一半后 150 已经在外');
});

test('pickTop 选的是最上面那个,不是数组里第一个', () => {
  // 两个完全重叠的元素,数组顺序和 zIndex 顺序**故意相反**
  const bottom = item({ id: 'bottom', zIndex: 50 });
  const top = item({ id: 'top', zIndex: 20 });
  const picked = pickTop([bottom, top], 500, 800);
  assert.equal(picked?.id, 'bottom', 'zIndex 50 在上面,应该选它');
  assert.equal(pickTop([], 500, 800), null);
});

test('包围盒把旋转算进去 —— 导出时才知道溢出了多少', () => {
  const b = itemBounds(item({ rotation: 45, w: 400, h: 400 }));
  const half = Math.sqrt(2) * 200;   // 转 45° 后外接方形的半边
  assert.ok(Math.abs((b.maxX - b.minX) / 2 - half) < 0.01);
  assert.equal(itemCorners(item()).length, 4);
});

test('scale 卡在 0.3~3', () => {
  assert.equal(clampScale(0.01), 0.3);
  assert.equal(clampScale(99), 3);
  assert.equal(clampScale(1.5), 1.5);
});

// ─────────────────────────────────────────────
// 歪斜 —— 这个模块的灵魂
// ─────────────────────────────────────────────

test('新元素的随机角永远看得出来,不会落在 0 附近', () => {
  // ⚠️ 这条是「没有一个元素是正的」的真实含义。
  // 均匀随机 [-3.5,3.5] 抽得到 0.03°,那种元素数值非 0 但肉眼是正的。
  for (let i = 0; i < 2000; i++) {
    const a = randomAngle(JITTER);
    assert.ok(Math.abs(a) >= VISIBLY_TILTED, `抽到了看不出来的角度 ${a}`);
    assert.ok(Math.abs(a) <= 3.5, `抽到了超出范围的角度 ${a}`);
  }
});

test('随机角两个方向都出得来 —— 不能全歪向一边', () => {
  let neg = 0, pos = 0;
  for (let i = 0; i < 400; i++) { if (randomAngle(JITTER) < 0) neg++; else pos++; }
  assert.ok(neg > 50 && pos > 50, `正负严重失衡: 负 ${neg} 正 ${pos}`);
});

test('松手抖动不设死区 —— 它是叠加的,叠 0.03° 完全正常', () => {
  const a = randomAngle(DROP_JITTER, seq(0.5));
  assert.ok(Math.abs(a) <= 1.5);
  assert.equal(DROP_JITTER.minMagnitude, 0);
});

// ─────────────────────────────────────────────
// 层级
// ─────────────────────────────────────────────

test('层级顺序:胶带压照片,笔迹压胶带,纸纹盖全部', () => {
  // 工单 2.3「这个顺序是对的,别改」
  assert.ok(LAYER.itemsBase < LAYER.tape);
  assert.ok(LAYER.tape < LAYER.ink, '手写必须能写在胶带上面');
  assert.ok(LAYER.ink < LAYER.grain);
  assert.ok(LAYER.dragging < LAYER.grain, '拖动中的元素也不能盖过纸纹');
});

test('元素 zIndex 涨到胶带层之前要重排', () => {
  assert.ok(!needsRestack(LAYER.itemsBase));
  assert.ok(needsRestack(ITEM_Z_MAX), '涨到上限就该重排,否则会越过胶带');
});

// ─────────────────────────────────────────────
// 视觉常量的单位换算
// ─────────────────────────────────────────────

test('参考实现的 px 换算到页面单位 —— 直接抄 19 会让网格细 2.4 倍', () => {
  assert.ok(Math.abs(REF_SCALE - 1000 / 420) < 1e-9);
  assert.equal(PAPER.REF_gridSize, 19);
  assert.ok(PAPER.gridSize > 44 && PAPER.gridSize < 46, `网格间距 ${PAPER.gridSize} 不对`);
  assert.ok(fromRef(60) > 140, '内阴影模糊半径也要换算');
});

test('笔宽:压力走一条路,手指按速度走另一条,都过平滑', () => {
  // 有压力值:0.8 + p*5.2,再换算,再平滑
  const withP = strokeWidth(0.5, 0, 0);
  assert.ok(withP > 0, '压力路径要出正数');
  // 0 和 1 都当作「没有压力值」—— 很多设备没压感时固定报这两个值
  assert.equal(strokeWidth(0, 5, 3), strokeWidth(1, 5, 3));
  // 写得越快越细
  assert.ok(strokeWidth(0, 20, 5) < strokeWidth(0, 1, 5), '快笔应该更细');
  // 平滑:一步只走到目标的 35%,不会突变
  const target = strokeWidth(0, 0, 0);
  assert.ok(target < fromRef(4.4), '平滑后不该一步到位');
  // 橡皮是定宽
  assert.equal(strokeWidth(0.9, 0, 1, 'eraser'), fromRef(18));
});

test('每种元素都有材质默认值 —— 缺一个就没有阴影', () => {
  for (const t of ['photo', 'scan', 'cutout', 'stub', 'wordSlip',
                   'stamp', 'sticker', 'text', 'tape'] as const) {
    const m = materialOf(t);
    assert.ok(m.material, `${t} 缺材质`);
    assert.ok(Number.isFinite(m.lift), `${t} 缺 lift`);
  }
});

// ─────────────────────────────────────────────
// 迁移
// ─────────────────────────────────────────────

const oldAssets = [{ id: 'a1', width: 3024, height: 4032 }];

test('迁移:归一化坐标换成页面单位,锚点两边都是中心所以不平移', () => {
  const { pages } = migrateJournal(
    [{ id: 'p1', items: [{ id: 'i1', kind: 'photo', assetId: 'a1', x: 0.5, y: 0.5, w: 0.42 }] }],
    oldAssets, seq(0.5, 0.9),
  );
  const it = pages[0]!.items[0]!;
  assert.equal(it.x, 500);
  assert.equal(it.y, 800);
  assert.equal(it.w, 420);
  // 高度按素材长宽比补出来(旧模型只存了 w)
  assert.ok(Math.abs(it.h - 420 * (4032 / 3024)) < 0.01);
});

test('迁移:没有一个元素是正的 —— 且是「看得出来」的不正', () => {
  // 旧数据里 rotation 全是 0,这是工单点名的验收项
  const items = Array.from({ length: 40 }, (_, i) => ({
    id: `i${i}`, kind: 'photo', assetId: 'a1', x: 0.5, y: 0.5, w: 0.4, rotation: 0,
  }));
  const { pages, report } = migrateJournal([{ id: 'p1', items }], oldAssets);
  assert.equal(report.stillStraight, 0, '不该有 rotation 为 0 的');
  for (const it of pages[0]!.items) {
    assert.ok(Math.abs(it.rotation) >= VISIBLY_TILTED,
      `${it.id} 角度 ${it.rotation} 数值非 0 但肉眼是正的`);
  }
});

test('迁移:原本已经歪着的保留原角度,不被随机值覆盖', () => {
  const { pages } = migrateJournal(
    [{ id: 'p1', items: [{ id: 'i1', kind: 'photo', assetId: 'a1', rotation: -8 }] }],
    oldAssets, seq(0.5),
  );
  assert.equal(pages[0]!.items[0]!.rotation, -8);
});

test('迁移:ink 元素搬进页级 strokes,不再是 item', () => {
  const { pages, report } = migrateJournal([{
    id: 'p1',
    items: [
      { id: 'ink1', kind: 'ink', payload: { strokes: [
        { color: '#33302b', tool: 'brush', points: [[0.1, 0.2, 0, 3], [0.3, 0.4, 16, 2.5]] },
        { color: '#b4542f', points: [[0.5, 0.5, 0, 2]] },   // 一个点不成笔,应被丢
      ] } },
      { id: 'ph1', kind: 'photo', assetId: 'a1' },
    ],
  }], oldAssets, seq(0.4));

  const page = pages[0]!;
  assert.equal(page.items.length, 1, 'ink 不该再出现在 items 里');
  assert.equal(page.items[0]!.id, 'ph1');
  assert.equal(page.strokes.length, 1, '单点的那笔要丢掉');
  assert.equal(report.strokes, 1);

  const s = page.strokes[0]!;
  assert.equal(s.tool, 'pen', '旧的 brush/pencil/marker 统一成 pen');
  assert.deepEqual(s.points[0], { x: 0.1 * PAGE.w, y: 0.2 * PAGE.h, p: 0, t: 0 });
  // t 必须保住 —— 有它才能回放,也才能重新按速度反推笔锋
  assert.equal(s.points[1]!.t, 16);
  // 旧的线宽不冒充压力值:手指写的字被当成 Pencil 写的会让笔锋整个变形
  assert.equal(s.points[1]!.p, 0);
});

test('迁移:zIndex 按旧顺序重发,从 10 起连续 —— 不沿用可能已撞进胶带层的旧值', () => {
  const { pages } = migrateJournal([{
    id: 'p1',
    items: [
      { id: 'c', kind: 'photo', assetId: 'a1', z: 999 },   // 旧值已经越过胶带层
      { id: 'a', kind: 'photo', assetId: 'a1', z: 5 },
      { id: 'b', kind: 'photo', assetId: 'a1', z: 50 },
    ],
  }], oldAssets);
  const items = pages[0]!.items;
  assert.deepEqual(items.map(i => i.id), ['a', 'b', 'c'], '顺序要保住');
  assert.deepEqual(items.map(i => i.zIndex), [10, 11, 12], '数值要重发');
  assert.ok(items.every(i => i.zIndex < LAYER.tape), '不能有元素越过胶带层');
});

test('迁移:查不到素材的元素要被报出来,不静默用兜底比例', () => {
  const { report } = migrateJournal(
    [{ id: 'p1', items: [{ id: 'orphan', kind: 'photo', assetId: 'missing', w: 0.4 }] }],
    oldAssets,
  );
  // 拿不到数据 ≠ 数据是空的:兜底可以,但必须留痕
  assert.deepEqual(report.guessedHeight, ['orphan']);
});

test('迁移:旧的 10 种 kind 并进新的 9 种 type', () => {
  const kinds = ['photo', 'polaroid', 'scan', 'cutout', 'tape', 'stamp', 'seal', 'badge', 'text'];
  const { pages, report } = migrateJournal([{
    id: 'p1',
    items: kinds.map((k, i) => ({ id: `k${i}`, kind: k, assetId: 'a1' })),
  }], oldAssets);
  const byId = new Map(pages[0]!.items.map(i => [i.id, i]));
  assert.equal(byId.get('k0')!.type, 'photo');
  assert.equal(byId.get('k1')!.type, 'photo');
  assert.equal((byId.get('k1')!.payload as any).frame, 'polaroid', '拍立得变成 photo 的一个 frame');
  assert.equal(byId.get('k6')!.type, 'stamp', 'seal 并进 stamp');
  assert.equal(byId.get('k7')!.type, 'sticker', 'badge 并进 sticker');
  assert.equal(report.dropped.length, 0);
});

test('迁移:认不出的 kind 整条丢弃并记账,不猜成 photo', () => {
  const { pages, report } = migrateJournal(
    [{ id: 'p1', items: [{ id: 'weird', kind: 'hologram' }] }], oldAssets,
  );
  assert.equal(pages[0]!.items.length, 0);
  assert.deepEqual(report.dropped, ['weird']);
});

test('迁移:页字段改名,册子和城市两套并存', () => {
  const { pages } = migrateJournal([{
    id: 'p1', tripId: 'trip-kansai', cityId: 'jp-kyoto', pageDate: '2026-08-13', bg: 'kraft-light',
  }], oldAssets);
  const p = pages[0]!;
  assert.equal(p.bookId, 'trip-kansai', '旧 tripId 就是「哪一趟」,对应新册子');
  assert.equal(p.cityId, 'jp-kyoto', '城市自动分格与册子并存,不是二选一');
  assert.equal(p.dateISO, '2026-08-13');
  assert.equal(p.paper, 'kraft-bag');
  assert.deepEqual(p.strokes, []);
});

test('迁移:空输入不炸,也不伪造数据', () => {
  const { pages, report } = migrateJournal([], []);
  assert.deepEqual(pages, []);
  assert.equal(report.pages, 0);
  assert.equal(report.items, 0);
});
