// 旅迹测试
//
// 为什么必须测:推错交通方式比不推更伤人 —— 用户看到「你从京都站骑车去了伏见稻荷」
// 而他明明坐的电车,会直接不信任整个功能。所以边界(同城、同一天、缺坐标)
// 全部要有明确且保守的行为。
import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceKm, guessMode, buildJourney, countriesOf, MODES } from '../journey.js';

const P = {
  london: { lat: 51.5074, lng: -0.1278, country: '英国' },
  dublin: { lat: 53.3498, lng: -6.2603, country: '爱尔兰' },
  galway: { lat: 53.2707, lng: -9.0568, country: '爱尔兰' },
  istanbul: { lat: 41.0082, lng: 28.9784, country: '土耳其' },
  cappadocia: { lat: 38.6431, lng: 34.8289, country: '土耳其' },
  chiangmai: { lat: 18.7883, lng: 98.9859, country: '泰国' },
  kyotoStn: { lat: 34.9858, lng: 135.7588, country: '日本' },
  inari: { lat: 34.9671, lng: 135.7727, country: '日本' },
};

test('球面距离和已知值吻合', () => {
  assert.ok(Math.abs(distanceKm(P.london, P.dublin) - 463) < 15);
  assert.ok(Math.abs(distanceKm(P.dublin, P.galway) - 186) < 10);
  assert.ok(Math.abs(distanceKm(P.london, P.chiangmai) - 8992) < 120);
});

test('缺坐标时返回 null,不返回 0', () => {
  // 返回 0 会被当成「同城」,那是错的:不知道 ≠ 在同一个地方
  assert.equal(distanceKm(null, P.dublin), null);
  assert.equal(distanceKm({ lat: 1 }, P.dublin), null);
  assert.equal(distanceKm({ lat: NaN, lng: 0 }, P.dublin), null);
});

test('有精确耗时时用速度(以后接行程段会走这条)', () => {
  assert.equal(guessMode(463, 0, 1.5).key, 'flight');    // 309 km/h
  assert.equal(guessMode(8992, 0, 13).key, 'flight');    // 692 km/h
  assert.equal(guessMode(564, 0, 3).key, 'rail');        // 188 km/h
  assert.equal(guessMode(564, 0, 10).key, 'road');       // 56 km/h,实际是夜巴
});

test('只有日期时按距离判断,不按速度', () => {
  // 打卡点没有时刻。隔一天 = 24h,但那 24h 里可能只飞了 1 小时。
  assert.equal(guessMode(8992, 1).key, 'flight');   // 洲际,只能飞
  assert.equal(guessMode(3135, 3).key, 'flight');   // 距离足够大,天数再多也是飞
  assert.equal(guessMode(900, 1).key, 'flight');    // 近千公里、隔天到
  assert.equal(guessMode(186, 1).key, 'road');      // 都柏林→戈尔韦
  assert.equal(guessMode(186, 0).key, 'road');      // 当天往返
});

test('算法看不见海 —— 中距离一律不猜', () => {
  // 伦敦→都柏林 463km 隔着爱尔兰海,只能飞或坐渡轮;
  // 但同样 463km 在欧洲大陆就是高铁。从坐标分不出这两种情况(需要海岸线数据)。
  // 说错「陆路长途」比不说更伤 —— 用户会觉得「你连我怎么来的都搞错」。
  assert.equal(guessMode(463, 1).key, 'unknown');
  assert.equal(guessMode(400, 0).key, 'unknown');
  assert.equal(guessMode(600, 2).key, 'unknown');
});

test('隔了好几天就更不猜 —— 中间干什么都可能', () => {
  assert.equal(guessMode(400, 5).key, 'unknown');
  assert.equal(guessMode(200, 10).key, 'road');    // 200km 只能是陆路,隔多久都一样
  assert.equal(guessMode(900, 5).key, 'unknown');   // 距离不够大 + 天数多 = 不猜
  assert.equal(guessMode(3000, 5).key, 'flight');   // 但超远距离仍然敢说
});

test('旅迹按到访日期排序,不按记录顺序', () => {
  const pts = [
    { id: 'c', ...P.cappadocia, visitedOn: '2026-07-22' },
    { id: 'a', ...P.dublin, visitedOn: '2026-07-15' },
    { id: 'b', ...P.galway, visitedOn: '2026-07-18' },
  ];
  const { stops } = buildJourney(pts);
  assert.deepEqual(stops.map(s => s.id), ['a', 'b', 'c']);
});

test('缺日期或缺坐标的点不进旅迹,但不影响其他点', () => {
  const pts = [
    { id: 'ok', ...P.dublin, visitedOn: '2026-07-15' },
    { id: 'noDate', ...P.galway },
    { id: 'noGeo', country: '法国', visitedOn: '2026-07-16' },
  ];
  const { stops } = buildJourney(pts);
  assert.deepEqual(stops.map(s => s.id), ['ok']);
});

test('只有一个点也是合法旅迹', () => {
  const { stops, legs, totalKm } = buildJourney([
    { id: 'a', ...P.dublin, visitedOn: '2026-07-15' },
  ]);
  assert.equal(stops.length, 1);
  assert.equal(legs.length, 0);
  assert.equal(totalKm, 0);
});

test('空输入不崩', () => {
  const r = buildJourney([]);
  assert.deepEqual(r.stops, []);
  assert.deepEqual(r.legs, []);
  assert.equal(r.totalKm, 0);
  assert.deepEqual(buildJourney().stops, []);
});

test('同城不计入总里程', () => {
  const pts = [
    { id: 'a', ...P.kyotoStn, visitedOn: '2026-07-15' },
    { id: 'b', ...P.inari, visitedOn: '2026-07-15' },
  ];
  const { legs, totalKm } = buildJourney(pts);
  assert.equal(legs.length, 1);
  assert.equal(legs[0].mode.key, 'local');
  assert.equal(totalKm, 0);   // 城里走动不算「走过的路」
});

test('同一天的两个远点不会算出无穷大速度', () => {
  const pts = [
    { id: 'a', ...P.london, visitedOn: '2026-07-15' },
    { id: 'b', ...P.dublin, visitedOn: '2026-07-15' },
  ];
  const { legs } = buildJourney(pts);
  assert.equal(legs[0].days, 0);
  // 463km 当天到:可能飞、可能渡轮+火车。算法看不见海,所以不猜。
  assert.equal(legs[0].mode.key, 'unknown');
  assert.ok(Number.isFinite(legs[0].km));
});

test('真实行程:伦敦→都柏林→戈尔韦→伊斯坦布尔→卡帕多奇亚', () => {
  const pts = [
    { id: '1', ...P.london, visitedOn: '2026-07-14' },
    { id: '2', ...P.dublin, visitedOn: '2026-07-15' },
    { id: '3', ...P.galway, visitedOn: '2026-07-18' },
    { id: '4', ...P.istanbul, visitedOn: '2026-07-21' },
    { id: '5', ...P.cappadocia, visitedOn: '2026-07-22' },
  ];
  const { legs, totalKm } = buildJourney(pts);
  assert.equal(legs.length, 4);
  assert.equal(legs[0].mode.key, 'unknown');  // 伦敦→都柏林 463km,看不见海所以不猜
  assert.equal(legs[1].mode.key, 'road');     // 都柏林→戈尔韦 186km,岛内只能陆路
  assert.equal(legs[2].mode.key, 'flight');   // 戈尔韦→伊斯坦布尔 3135km
  assert.ok(totalKm > 3000);
});

test('国家去重', () => {
  const pts = [
    { country: '爱尔兰' }, { country: '爱尔兰' }, { country: '土耳其' },
    { country: '' }, { country: null }, {},
  ];
  assert.deepEqual(countriesOf(pts).sort(), ['土耳其', '爱尔兰']);
  assert.deepEqual(countriesOf([]), []);
});

test('MODES 都有图标和 key', () => {
  Object.values(MODES).forEach((m) => {
    assert.ok(m.key);
    assert.equal(typeof m.icon, 'string');
  });
});
