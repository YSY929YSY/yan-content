// 世界足迹的合并规则。
//
// 这段逻辑以前埋在 NaTab 的 useEffect 里,和 setState 缠在一起,零覆盖 ——
// 而它判错任何一种情况,用户丢的都是真实的旅行记录。抽成纯函数后终于能测。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitCloudCheckins, mergeMap, mergeIds, sanitizeVisitedIds, buildMapPoints,
} from '../../features/world/footprintMerge.js';

const VALID = new Set(['kyoto', 'osaka', 'nara']);

test('拿不到数据 ≠ 数据是空的:null 返回 ok:false', () => {
  // 这是最贵的一条。判成「云端是空的」,下一步就会拿空数据覆盖本地记录。
  assert.equal(splitCloudCheckins(null, VALID).ok, false);
  assert.equal(splitCloudCheckins(undefined, VALID).ok, false);
});

test('云端真的是空的:返回 ok:true 但内容为空', () => {
  const r = splitCloudCheckins({}, VALID);
  assert.equal(r.ok, true);
  assert.deepEqual(r.visitedIds, []);
});

test('五类数据各归各位', () => {
  const r = splitCloudCheckins({
    a: { placeId: 'kyoto', status: 'been', checkedInAt: '2026-03-01', note: '樱花',
         photoUri: 'https://signed/x', photoPath: 'uid/kyoto.jpg' },
    b: { placeId: 'osaka', status: 'wish' },
  }, VALID);
  assert.deepEqual(r.visitedIds, ['kyoto']);          // wish 的不算去过
  assert.equal(r.dates.kyoto, '2026-03-01');
  assert.equal(r.notes.kyoto, '樱花');
  assert.equal(r.photoPaths.kyoto, 'uid/kyoto.jpg');
  assert.equal(r.photoUris.kyoto, 'https://signed/x');
});

test('当前内容里没有的地点被跳过,不参与显示', () => {
  const r = splitCloudCheckins({
    a: { placeId: 'atlantis', status: 'been' },
  }, VALID);
  assert.deepEqual(r.visitedIds, []);
});

test('本地覆盖云端 —— 本机是这台设备上最新的事实', () => {
  const merged = mergeMap({ kyoto: '云端的' }, { kyoto: '本机的', nara: '只在本机' });
  assert.equal(merged.kyoto, '本机的');
  assert.equal(merged.nara, '只在本机');
});

test('去过的地点取并集,不做删除', () => {
  assert.deepEqual(mergeIds(['kyoto'], ['osaka']).sort(), ['kyoto', 'osaka']);
  assert.deepEqual(mergeIds(['kyoto'], ['kyoto']), ['kyoto']);   // 去重
});

test('磁盘上的打卡只校验类型,绝不按当前内容过滤', () => {
  // 内容源临时少了地点时过滤,会把用户真实的打卡先从内存抹掉、再被落盘永久删除。
  const saved = ['kyoto', 'atlantis', 42, null, { id: 'x' }];
  assert.deepEqual(sanitizeVisitedIds(saved), ['kyoto', 'atlantis']);
  assert.deepEqual(sanitizeVisitedIds('坏数据'), []);
  assert.deepEqual(sanitizeVisitedIds(null), []);
});

test('地图点:精选点 + 自定义点', () => {
  const pts = buildMapPoints(
    [{ id: 'kyoto', name: '京都', geo: { lat: 35.0, lng: 135.7 } }],
    [{ id: 'u1', name: '某个小镇', lat: 10, lng: 20, visitedOn: '2026-01-01' }],
    { visitedIds: ['kyoto'], checkinDates: { kyoto: '2026-03-01' } },
  );
  assert.equal(pts.length, 2);
  assert.equal(pts[0].been, true);
  assert.equal(pts[0].visitedOn, '2026-03-01');
  assert.equal(pts[1].custom, true);
});

test('自定义点和精选点重合时不重复画(5km 内视为同一处)', () => {
  const pts = buildMapPoints(
    [{ id: 'kyoto', name: '京都', geo: { lat: 35.0, lng: 135.7 } }],
    [{ id: 'u1', name: 'Kyoto', lat: 35.01, lng: 135.71 }],   // 名字不同,位置相同
    {},
  );
  assert.equal(pts.length, 1, '「京都」和「Kyoto」应被认作同一处');
});

test('没有坐标的点不画,但不会让整个函数出错', () => {
  const pts = buildMapPoints(
    [{ id: 'a', name: '无坐标' }],
    [{ id: 'u1', name: '无坐标自定义', lat: null, lng: undefined }],
    {},
  );
  assert.deepEqual(pts, []);
});
