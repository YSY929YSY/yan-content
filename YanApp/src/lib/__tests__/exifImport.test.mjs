// 从照片导入足迹的聚合规则。
//
// 判错的后果很具体:聚少了 → 一次东京旅行变成 200 条打卡记录;
// 聚多了 → 一整趟环日本被压成一个点;判重错了 → 重复导入把记录翻倍。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  localDay, extractPoints, groupIntoVisits, dedupeAgainstExisting, summarize,
} from '../../features/world/exifImport.js';

const at = (day, h = 12) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).getTime();

test('同一天同一片区域的照片聚成一次到访', () => {
  const { points } = extractPoints([
    { id: 'a', location: { latitude: 35.0000, longitude: 135.7000 }, creationTime: at('2026-03-01', 9) },
    { id: 'b', location: { latitude: 35.0010, longitude: 135.7010 }, creationTime: at('2026-03-01', 14) },
    { id: 'c', location: { latitude: 35.0015, longitude: 135.7015 }, creationTime: at('2026-03-01', 18) },
  ]);
  const visits = groupIntoVisits(points);
  assert.equal(visits.length, 1, '一天在京都拍的三张不该变成三条记录');
  assert.equal(visits[0].photoIds.length, 3);
});

test('同一地点不同天算两次到访', () => {
  const { points } = extractPoints([
    { id: 'a', location: { latitude: 35, longitude: 135.7 }, creationTime: at('2026-03-01') },
    { id: 'b', location: { latitude: 35, longitude: 135.7 }, creationTime: at('2026-03-05') },
  ]);
  assert.equal(groupIntoVisits(points).length, 2);
});

test('同一天相隔很远算两处', () => {
  // 一天之内从东京飞到冲绳是完全正常的
  const { points } = extractPoints([
    { id: 'a', location: { latitude: 35.6, longitude: 139.7 }, creationTime: at('2026-03-01', 9) },
    { id: 'b', location: { latitude: 26.2, longitude: 127.7 }, creationTime: at('2026-03-01', 20) },
  ]);
  assert.equal(groupIntoVisits(points).length, 2);
});

test('没有位置信息的照片被剔除,并且数量被记下来', () => {
  // 截图、转发的图通常没有 GPS —— 这是常态,用户需要知道为什么少了
  const { points, missingLocation } = extractPoints([
    { id: 'a', location: { latitude: 35, longitude: 135.7 }, creationTime: at('2026-03-01') },
    { id: 'b', creationTime: at('2026-03-01') },
    { id: 'c', location: { latitude: null, longitude: null }, creationTime: at('2026-03-01') },
  ]);
  assert.equal(points.length, 1);
  assert.equal(missingLocation, 2);
});

test('没有拍摄时间的也算读不出位置', () => {
  const { points, missingLocation } = extractPoints([
    { id: 'a', location: { latitude: 35, longitude: 135.7 } },
  ]);
  assert.equal(points.length, 0);
  assert.equal(missingLocation, 1);
});

test('到访坐标收敛到区域中心,不是第一张照片的位置', () => {
  // 第一张常常是刚下飞机在机场拍的
  const { points } = extractPoints([
    { id: 'a', location: { latitude: 35.0000, longitude: 135.7000 }, creationTime: at('2026-03-01', 8) },
    { id: 'b', location: { latitude: 35.0020, longitude: 135.7020 }, creationTime: at('2026-03-01', 12) },
  ]);
  const v = groupIntoVisits(points)[0];
  assert.ok(v.lat > 35.0000 && v.lat < 35.0020, `期望落在两点之间,实际 ${v.lat}`);
});

test('同城的不同景点算不同到访 —— 这是最容易搞错的一条', () => {
  // 伊斯坦布尔:圣索菲亚 / 蓝色清真寺 / 大巴扎,彼此都在几百米到两公里内。
  // 早期版本用地图去重那个 5km 半径,把它们压成了一个点 ——
  // 用户拍了三个景点的照片,导入后只得到一条「41.02, 28.97」。
  const { points } = extractPoints([
    { id: 'hagia', location: { latitude: 41.0086, longitude: 28.9802 }, creationTime: at('2026-07-27', 10) },
    { id: 'blue', location: { latitude: 41.0054, longitude: 28.9768 }, creationTime: at('2026-07-27', 13) },
    { id: 'bazaar', location: { latitude: 41.0106, longitude: 28.9680 }, creationTime: at('2026-07-27', 16) },
  ]);
  assert.equal(groupIntoVisits(points).length, 3, '三个景点应该是三次到访');
});

test('封面用当天最早那张', () => {
  const { points } = extractPoints([
    { id: 'late', location: { latitude: 35, longitude: 135.7 }, creationTime: at('2026-03-01', 20) },
    { id: 'early', location: { latitude: 35, longitude: 135.7 }, creationTime: at('2026-03-01', 7) },
  ]);
  assert.equal(groupIntoVisits(points)[0].coverId, 'early');
});

test('重复导入是安全的空操作', () => {
  const { points } = extractPoints([
    { id: 'a', location: { latitude: 35, longitude: 135.7 }, creationTime: at('2026-03-01') },
  ]);
  const visits = groupIntoVisits(points);
  const existing = [{ lat: 35.001, lng: 135.701, visitedOn: '2026-03-01' }];
  assert.equal(dedupeAgainstExisting(visits, existing).length, 0);
});

test('同一地点不同天不算重复 —— 二访也是一次真实的旅行', () => {
  const { points } = extractPoints([
    { id: 'a', location: { latitude: 35, longitude: 135.7 }, creationTime: at('2026-09-01') },
  ]);
  const visits = groupIntoVisits(points);
  const existing = [{ lat: 35, lng: 135.7, visitedOn: '2026-03-01' }];
  assert.equal(dedupeAgainstExisting(visits, existing).length, 1);
});

test('已有记录没有坐标时不参与判重,不会误伤', () => {
  const { points } = extractPoints([
    { id: 'a', location: { latitude: 35, longitude: 135.7 }, creationTime: at('2026-03-01') },
  ]);
  const visits = groupIntoVisits(points);
  assert.equal(dedupeAgainstExisting(visits, [{ name: '土耳其', visitedOn: '2026-03-01' }]).length, 1);
});

test('localDay 用本地日期,不因时区退回前一天', () => {
  const d = new Date(2026, 2, 1, 23, 30);   // 本地 3/1 晚上
  assert.equal(localDay(d), '2026-03-01');
});

test('一无所获时也要说清原因', () => {
  const msg = summarize({ picked: 30, missingLocation: 30, imported: 0, skipped: 0 });
  assert.ok(msg.includes('30'), '要告诉用户有多少张没有位置信息');
});

test('摘要覆盖三种结果', () => {
  const msg = summarize({ picked: 10, missingLocation: 3, imported: 2, skipped: 1 });
  assert.ok(msg.includes('新增 2 处'));
  assert.ok(msg.includes('1 处'));
  assert.ok(msg.includes('3 张'));
});
