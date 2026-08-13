// 手账纯逻辑的测试。
//
// 这里守的三件事,每一件都对应一种「用户看不见的丢数据」:
//   1. 城市 id 改写必须一次改完四处 —— 改一半 = 两本东京,再也合不回去
//   2. 补传必须为新账号铸新 id、并把引用整体改写 —— 直接 upsert 旧 id 会
//      被 RLS 静默拒掉(更新 0 行、不报错),而登录只有一次迁移机会
//   3. 旧账号的 storage 路径不能带着走 —— 传上去必然 403,页面上是永久裂图
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newId, slugify, cityIdFromPlace, gridCityId, resolveCityId, isResolvedCityId,
  remapCityId, addTag, removeTag, cityOfMoment,
  writtenFirsts, firstArrivalOf, isFirstArrival,
  normalizeMoment, normalizePage, normalizeMoments, normalizeInk, materialOf,
  newAsset, newItem, ASSET_KINDS, ASSET_ENTRIES, assetUriIn,
  planMomentUpload, planJournalUpload, portablePath, remoteIdFor,
} from '../../features/journal/journalModel.js';

// ── id ───────────────────────────────────────────────────────
test('newId 是合法 uuid 形状,且不重复', () => {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const ids = Array.from({ length: 500 }, newId);
  for (const id of ids) assert.match(id, re);
  assert.equal(new Set(ids).size, ids.length);
});

// ── 城市 id ──────────────────────────────────────────────────
test('城市 id 按国家码+slug,不按显示名 —— 否则东京会分裂成三本册子', () => {
  assert.equal(cityIdFromPlace({ countryCode: 'JP', name: 'Tokyo' }), 'city:jp:tokyo');
  assert.equal(cityIdFromPlace({ countryCode: 'jp', name: '東京都' }), 'city:jp:東京都');
  assert.equal(slugify('San Sebastián'), 'san-sebastián');
  // 信息不全一律返回 null,由调用方回退到网格 —— 不猜
  assert.equal(cityIdFromPlace({ name: 'Tokyo' }), null);
  assert.equal(cityIdFromPlace({ countryCode: 'jp' }), null);
});

test('★ 反查不到照样收下这条记录 —— 落网格 id,不是丢掉', () => {
  const id = resolveCityId({ lat: 35.681, lng: 139.767 });
  assert.equal(id, 'city:?:35.7_139.8');
  assert.equal(isResolvedCityId(id), false);
  // 同一座城的两个点落进同一个网格
  assert.equal(resolveCityId({ lat: 35.71, lng: 139.75 }), id);
  // 连坐标都没有才真的没有城
  assert.equal(resolveCityId({}), null);
});

test('★ 网格 id 反查成功后,四处一起改写 —— 改一半就是两本东京', () => {
  const state = {
    cities: [{ cityId: 'city:?:35.7_139.8', name: null, title: '我的东京' }],
    tags: [
      { id: 't1', momentId: 'm1', kind: 'city', value: 'city:?:35.7_139.8' },
      { id: 't2', momentId: 'm1', kind: 'first', value: 'city:?:35.7_139.8' }, // 同值不同 kind,不该被改
    ],
    pages: [{ id: 'p1', cityId: 'city:?:35.7_139.8' }],
    assets: [{ id: 'a1', cityId: 'city:?:35.7_139.8' }],
  };
  const next = remapCityId(state, 'city:?:35.7_139.8', 'city:jp:tokyo', { name: 'Tokyo' });

  assert.equal(next.cities.length, 1);
  assert.equal(next.cities[0].cityId, 'city:jp:tokyo');
  assert.equal(next.cities[0].resolved, true);
  assert.equal(next.cities[0].name, 'Tokyo');
  assert.equal(next.cities[0].title, '我的东京', '用户改过的册名不能被一次反查覆盖');
  assert.equal(next.tags[0].value, 'city:jp:tokyo');
  assert.equal(next.tags[1].value, 'city:?:35.7_139.8', 'first 标签的 value 是用户的话,不是城市 id');
  assert.equal(next.pages[0].cityId, 'city:jp:tokyo');
  assert.equal(next.assets[0].cityId, 'city:jp:tokyo');
});

test('目标城市册已存在时合成一本,不留下两本', () => {
  const state = {
    cities: [
      { cityId: 'city:?:35.7_139.8', title: '我的东京', coverAssetId: 'a1' },
      { cityId: 'city:jp:tokyo', name: 'Tokyo' },
    ],
    tags: [], pages: [], assets: [],
  };
  const next = remapCityId(state, 'city:?:35.7_139.8', 'city:jp:tokyo');
  assert.equal(next.cities.length, 1);
  assert.equal(next.cities[0].title, '我的东京');
  assert.equal(next.cities[0].coverAssetId, 'a1');
});

// ── 标签 ─────────────────────────────────────────────────────
test('同一个三元组不会重复加(云端有 unique 约束,本机口径要一致)', () => {
  let tags = addTag([], 'm1', 'city', 'city:jp:tokyo');
  tags = addTag(tags, 'm1', 'city', 'city:jp:tokyo');
  assert.equal(tags.length, 1);
  tags = addTag(tags, 'm1', 'first', '第一次自己办入住');
  assert.equal(tags.length, 2);
  assert.equal(cityOfMoment(tags, 'm1'), 'city:jp:tokyo');
  assert.equal(removeTag(tags, 'm1', 'first', '第一次自己办入住').length, 1);
});

// ── 「第一次」──────────────────────────────────────────────────
const M = (id, takenAt, extra = {}) => ({ id, takenAt, createdAt: takenAt, ...extra });

test('★ 「第一次」只有用户写下的那些 —— 没有清单,没有未完成项', () => {
  const moments = [M('m1', '2026-05-02T10:00:00Z'), M('m2', '2026-05-01T10:00:00Z')];
  let tags = addTag([], 'm1', 'first', '第一次自己办入住');
  tags = addTag(tags, 'm2', 'first', '第一次问路');
  const firsts = writtenFirsts(tags, moments);
  assert.deepEqual(firsts.map(f => f.text), ['第一次问路', '第一次自己办入住'], '按发生时间排,不按记录时间');
  // 删掉瞬间,那条「第一次」就不再出现 —— 数据里不存在没有落点的第一次
  assert.equal(writtenFirsts(tags, [moments[0]]).length, 1);
});

test('★ 「第一次到这座城」是算出来的,不落库', () => {
  const moments = [
    M('m1', '2026-05-03T10:00:00Z'),
    M('m2', '2026-05-01T10:00:00Z'),
    M('m3', '2026-04-01T10:00:00Z'),
  ];
  let tags = addTag([], 'm1', 'city', 'city:jp:tokyo');
  tags = addTag(tags, 'm2', 'city', 'city:jp:tokyo');
  tags = addTag(tags, 'm3', 'city', 'city:jp:kyoto');

  assert.equal(firstArrivalOf(moments, tags, 'city:jp:tokyo').id, 'm2');
  assert.equal(isFirstArrival(moments, tags, moments[1]), true);
  assert.equal(isFirstArrival(moments, tags, moments[0]), false);
  // 软删的不算 —— 删掉最早那条,第一次就顺延
  const deleted = moments.map(m => (m.id === 'm2' ? { ...m, deletedAt: 'x' } : m));
  assert.equal(firstArrivalOf(deleted, tags, 'city:jp:tokyo').id, 'm1');
  assert.equal(firstArrivalOf(moments, tags, 'city:es:madrid'), null);
});

// ── 归一化 ───────────────────────────────────────────────────
test('坏数据当没有,但好数据一条不能少', () => {
  const { moments, tags } = normalizeMoments({
    moments: [null, {}, { id: 'm1', lat: 'x', source: '乱写', photos: [{ id: 'p1' }, null] }],
    tags: [{ momentId: 'm1' }, { momentId: 'm1', kind: 'city', value: 'c' }],
  });
  assert.equal(moments.length, 1);
  assert.equal(moments[0].lat, null);
  assert.equal(moments[0].source, 'in_app');
  assert.equal(moments[0].photos.length, 1);
  assert.equal(tags.length, 1);
  assert.equal(normalizeMoment({ id: 'm' }).text, '');
  // 页上的元素缺坐标时给默认值,不是丢掉这个元素
  const page = normalizePage({ id: 'p', items: [{ id: 'i' }] });
  assert.deepEqual(
    [page.items[0].x, page.items[0].y, page.items[0].scale, page.items[0].z],
    [0.5, 0.5, 1, 0]
  );
});

// ── 素材入库 ─────────────────────────────────────────────────
test('★ 新素材的 entry 记住它从哪条口子进来 —— 提取和扫描不能事后靠 kind 猜', () => {
  const up = newAsset({ kind: 'photo', entry: 'upload' });
  const sc = newAsset({ kind: 'scan', entry: 'scan' });
  const cut = newAsset({ kind: 'cutout', entry: 'extract' });
  assert.equal(up.entry, 'upload');
  assert.equal(sc.entry, 'scan');
  assert.equal(cut.entry, 'extract');
  // 同一个 kind 可以从不同口子来:扫进来的票根和抠出来的票根是两回事
  assert.notEqual(newAsset({ kind: 'scan', entry: 'scan' }).entry,
                  newAsset({ kind: 'scan', entry: 'extract' }).entry);
  // 认不出的取值回退,不抛 —— 一条坏记录不该让整本手账打不开
  assert.equal(newAsset({ kind: '没见过的', entry: '也没见过' }).kind, 'photo');
  assert.equal(newAsset({ entry: '也没见过' }).entry, 'upload');
});

test('★ 新素材的 storagePath 一定为空 —— 本地优先,上云是后台补的事', () => {
  const a = newAsset({ localUri: 'file:///doc/journal-assets-v1/x.jpg', width: 4032, height: 3024 });
  assert.equal(a.storagePath, null);
  assert.equal(a.localUri, 'file:///doc/journal-assets-v1/x.jpg');
  assert.equal(a.width, 4032);
  assert.deepEqual(a.remoteIds, {});
  assert.ok(a.createdAt, '没有 createdAt 的话素材库排不了序');
  // 拿得到 id 才能先写文件名再写记录
  assert.match(a.id, /^[0-9a-f]{8}-/);
});

test('素材的 kind/entry 清单和 schema 的 check 约束是同一份', () => {
  // 这两个数组一旦和 schema.journal.sql 分叉,本机存得下的记录云端会插不进去
  assert.deepEqual(ASSET_KINDS, ['cutout', 'scan', 'photo', 'badge', 'paper', 'sticker']);
  assert.deepEqual(ASSET_ENTRIES, ['extract', 'scan', 'upload', 'generated', 'official']);
});

test('★ 素材路径每次现拼,存下来的绝对路径不能直接用 —— iOS 容器 UUID 会变', () => {
  // 昨天存的
  const old = { localUri: 'file:///var/mobile/Containers/Data/Application/AAAA-1111/Documents/journal-assets-v1/x.jpg' };
  // 今天的容器换了个 UUID
  const now = 'file:///var/mobile/Containers/Data/Application/BBBB-2222/Documents/journal-assets-v1/';
  assert.equal(assetUriIn(now, old), `${now}x.jpg`);
  // 容器没变时结果不变,不会平白改出个新路径
  const same = 'file:///var/mobile/Containers/Data/Application/AAAA-1111/Documents/journal-assets-v1/';
  assert.equal(assetUriIn(same, old), old.localUri);
});

test('不是素材目录里的文件就原样返回 —— 别去改不归我们管的路径', () => {
  const dir = 'file:///doc/journal-assets-v1/';
  const outside = { localUri: 'ph://ABC-123/L0/001' };
  assert.equal(assetUriIn(dir, outside), 'ph://ABC-123/L0/001');
  assert.equal(assetUriIn(dir, { localUri: 'file:///somewhere/else/a.jpg' }), 'file:///somewhere/else/a.jpg');
  // 空的照旧是空,不要拼出一个只有目录的假路径
  assert.equal(assetUriIn(dir, { localUri: '' }), null);
  assert.equal(assetUriIn(dir, null), null);
  assert.equal(assetUriIn(dir, { localUri: 'journal-assets-v1/' }), null);
});

test('★ 新元素的厚度由 kind 决定,不让调用方填 —— 两处填不一样页面就花了', () => {
  const sticker = newItem('sticker', 'a1');
  const tape = newItem('tape', 'a1');
  assert.equal(sticker.lift, materialOf('sticker').lift);
  assert.equal(tape.lift, materialOf('tape').lift);
  assert.ok(sticker.lift > tape.lift);
  // patch 能改位置,但不该有人顺手把 lift 也传进来 —— 传了也就传了,不拦,
  // 这条测试守的是**默认值**来自同一张表
  const moved = newItem('scan', 'a2', { x: 0.96, rotation: 5 });
  assert.equal(moved.x, 0.96);
  assert.equal(moved.rotation, 5);
  assert.equal(moved.lift, materialOf('scan').lift);
  assert.equal(moved.assetId, 'a2');
});

// ── 材质与厚度 ───────────────────────────────────────────────
test('★ 每个元素都必须有厚度 —— 缺一个就没有阴影,那一片就是平的', () => {
  const page = normalizePage({
    id: 'p', items: [{ id: 'i1', kind: 'sticker' }, { id: 'i2', kind: 'tape' },
                     { id: 'i3', kind: 'scan' }, { id: 'i4', kind: '没见过的' }],
  });
  for (const it of page.items) {
    assert.ok(Number.isFinite(it.lift), `${it.kind} 没有 lift`);
    assert.ok(it.material, `${it.kind} 没有 material`);
  }
  const lift = Object.fromEntries(page.items.map(i => [i.kind, i.lift]));
  // 这个顺序就是层次本身:贴纸浮得最高,胶带几乎贴着纸
  assert.ok(lift.sticker > lift.scan, '贴纸该比票根浮得高');
  assert.ok(lift.scan > lift.tape, '票根该比胶带厚');
  assert.equal(materialOf('seal').lift, 0, '印是压进纸里的,没有厚度');
});

test('★ 手写存矢量笔画,不存位图 —— 时间戳一起存,不然回放做不了', () => {
  const page = normalizePage({
    id: 'p',
    items: [{ id: 'i', kind: 'ink', payload: { strokes: [
      { points: [[0.1, 0.2, 100, 3], [0.2, 0.3, 140, 2]], color: '#222', tool: 'pen' },
      { points: [[0.5, 0.5, 0, 1]] },                     // 一个点不成笔
      { points: [[0.1, 0.1], ['x', 2]] },                 // 坏点剔掉,好点留下
    ] } }],
  });
  const ink = page.items[0].payload;
  assert.equal(ink.strokes.length, 1, '单点笔画和空笔画都不该留下');
  assert.deepEqual(ink.strokes[0].points[0], [0.1, 0.2, 100, 3]);
  assert.equal(ink.strokes[0].tool, 'pen');
  // 缺 t 的点补 0 而不是丢掉这一笔
  const fallback = normalizeInk({ strokes: [{ points: [[0, 0], [1, 1]], tool: '乱写' }] });
  assert.deepEqual(fallback.strokes[0].points[1], [1, 1, 0, 1]);
  assert.equal(fallback.strokes[0].tool, 'pen');
});

// ── 补传 ─────────────────────────────────────────────────────
let seq = 0;
const mint = () => `uuid-${++seq}`;

test('★ 换账号 = 铸新 id 整份重传,引用跟着改写', () => {
  seq = 0;
  const state = {
    moments: [{ id: 'm1', photos: [{ id: 'ph1', storagePath: 'olduid/moments/x.jpg' }] }],
    tags: [
      { id: 't1', momentId: 'm1', kind: 'city', value: 'city:jp:tokyo' },
      { id: 't2', momentId: '不存在的瞬间', kind: 'city', value: 'city:jp:tokyo' },
    ],
  };
  const { rows, nextState, idMap } = planMomentUpload(state, 'U2', mint);

  assert.equal(rows.moments.length, 1);
  assert.equal(rows.moments[0].user_id, 'U2');
  assert.equal(rows.photos[0].moment_id, rows.moments[0].id, '照片必须指向新铸的瞬间 id');
  assert.equal(rows.tags.length, 1, '孤儿标签不传 —— 云端有外键,传上去整批被拒');
  assert.equal(rows.tags[0].moment_id, rows.moments[0].id);
  assert.equal(remoteIdFor(nextState.moments[0], 'U2'), rows.moments[0].id);
  assert.equal(idMap.get('ph1'), rows.photos[0].id);
});

test('★ 旧账号的 storage 路径不带走 —— 传上去必然 403,页面上是永久裂图', () => {
  assert.equal(portablePath('OLD/moments/a.jpg', 'NEW'), null);
  assert.equal(portablePath('NEW/moments/a.jpg', 'NEW'), 'NEW/moments/a.jpg');
  seq = 0;
  const { rows } = planMomentUpload(
    { moments: [{ id: 'm1', photos: [{ id: 'ph1', storagePath: 'OLD/moments/a.jpg' }] }], tags: [] },
    'NEW', mint
  );
  assert.equal(rows.photos[0].storage_path, null, '本机文件还在,留空等重新上传');
});

test('★ 补传可以安全重试 —— 重试用同一个 uuid,不会变成两份', () => {
  seq = 0;
  const state = { moments: [{ id: 'm1', photos: [] }], tags: [] };
  const first = planMomentUpload(state, 'U2', mint);
  const again = planMomentUpload(first.nextState, 'U2', mint);
  assert.equal(again.rows.moments[0].id, first.rows.moments[0].id);
  // 换到第三个账号,是另一份新 id,互不影响
  const third = planMomentUpload(first.nextState, 'U3', mint);
  assert.notEqual(third.rows.moments[0].id, first.rows.moments[0].id);
  assert.equal(remoteIdFor(third.nextState.moments[0], 'U2'), first.rows.moments[0].id);
});

test('★ 手账的外键顺序:素材 id 要能被封面和页上元素接上', () => {
  seq = 0;
  const momentIdMap = new Map([['m1', 'uuid-moment'], ['ph1', 'uuid-photo']]);
  const state = {
    assets: [{ id: 'a1', kind: 'scan', entry: 'scan', sourceMomentId: 'm1', sourcePhotoId: 'ph1', cityId: 'city:jp:tokyo' }],
    cities: [{ cityId: 'city:jp:tokyo', coverAssetId: 'a1' }],
    pages: [{ id: 'p1', cityId: 'city:jp:tokyo', items: [{ id: 'i1', kind: 'scan', assetId: 'a1', momentId: 'm1' }] }],
  };
  const { rows } = planJournalUpload(state, 'U2', momentIdMap, mint);

  const assetId = rows.assets[0].id;
  assert.equal(rows.cities[0].cover_asset_id, assetId);
  assert.equal(rows.items[0].asset_id, assetId);
  assert.equal(rows.items[0].page_id, rows.pages[0].id);
  assert.equal(rows.items[0].moment_id, 'uuid-moment');
  assert.equal(rows.assets[0].source_photo_id, 'uuid-photo', '溯源要接到照片的新 id 上');
  assert.equal(rows.cities[0].resolved, true);
});

test('溯源接不上也照传 —— 素材和页是用户的作品,不能因为溯源丢掉', () => {
  seq = 0;
  const { rows } = planJournalUpload(
    { assets: [{ id: 'a1', kind: 'cutout', entry: 'extract', sourceMomentId: 'm1' }], cities: [], pages: [] },
    'U2', new Map(), mint
  );
  assert.equal(rows.assets.length, 1);
  assert.equal(rows.assets[0].source_moment_id, null);
});

test('★ 没有 countFirsts —— 有计数就会有进度条,然后就是打卡任务', async () => {
  const mod = await import('../../features/journal/journalModel.js');
  for (const name of Object.keys(mod)) {
    assert.ok(!/count|streak|total/i.test(name), `导出了 ${name} —— 「第一次」不统计数量,见 docs/TODO.md`);
  }
});

// ── 渲染的数学 ───────────────────────────────────────────────
// 渲染错了不会崩、不会报错,只会「看着平」—— 所以能测的必须测。
import { shadowFor, liftToPx, pickPaper, nibWidth, LIGHT } from '../../features/journal/journalRender.js';

test('★ 厚度不同,阴影必须不同 —— 一样就是所有拼贴 App 那种平', () => {
  const W = 400;
  const sticker = shadowFor(9, W);   // 贴纸
  const scan = shadowFor(3, W);      // 票根
  const tape = shadowFor(1, W);      // 胶带
  assert.ok(Math.hypot(sticker.dx, sticker.dy) > Math.hypot(scan.dx, scan.dy));
  assert.ok(Math.hypot(scan.dx, scan.dy) > Math.hypot(tape.dx, tape.dy));
  assert.ok(sticker.blur > scan.blur && scan.blur > tape.blur, '浮得高的影子更散');
  assert.ok(sticker.opacity < tape.opacity, '浮得高的影子更淡,贴着纸的接触阴影最实');
  assert.equal(shadowFor(0, W), null, '印是压进纸里的,不该有影子');
});

test('阴影方向永远背着光,所有元素一致 —— 这是「在同一个空间里」的全部原因', () => {
  for (const lift of [1, 3, 9, 20]) {
    const s = shadowFor(lift, 400);
    assert.ok(s.dx * LIGHT.x < 0 && s.dy * LIGHT.y < 0, `lift=${lift} 的影子方向反了`);
  }
});

test('lift 是页宽千分比,不是像素 —— 换屏幕/换 300dpi 打印都不用改数据', () => {
  assert.equal(liftToPx(10, 400), 4);
  assert.equal(liftToPx(10, 4000), 40);
});

test('同一页每次打开必须是同一张纸 —— 随机换纸就不是一本本子了', () => {
  const keys = ['a', 'b', 'c'];
  const page = { id: 'p-123' };
  assert.equal(pickPaper(page, keys), pickPaper(page, keys));
  assert.equal(pickPaper({ id: 'p-123', bg: 'c' }, keys), 'c', '指定了就用指定的');
  assert.equal(pickPaper({ id: 'p', bg: '不存在的纸' }, keys) !== null, true, '认不出的纸样要回退,不能白页');
});

test('笔锋:快的地方细,慢的地方粗', () => {
  const slow = nibWidth([0.1, 0.1, 0], [0.101, 0.101, 60], 1);
  const fast = nibWidth([0.1, 0.1, 0], [0.30, 0.30, 60], 1);
  assert.ok(fast < slow, '写得快该更细');
  assert.ok(fast >= 0.35, '再快也不能细到消失');
  assert.equal(nibWidth(null, null, 2), 2, '算不出速度时回退到基础粗细');
});
