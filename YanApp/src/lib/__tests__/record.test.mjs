// 打卡记录统一模型。
//
// 这是「两等公民合并」的判断核心:一条记录能不能拿到语言卡和文化彩蛋,
// 取决于坐标撞没撞上收录点,而不取决于它是谁创建的。判错的后果是
// 用户自己记的地方永远拿不到内容 —— 也就是合并根本没发生。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchCurated, fromCurated, fromCustom, bonusOf, isNear,
} from '../../features/world/record.js';

const KYOTO = {
  id: 'kyoto', name: '京都', loc: '日本 京都',
  geo: { lat: 35.0, lng: 135.7 },
  emoji: '⛩', jp: 'きれいですね', zh: '真漂亮',
  cultureEgg: '进店要先说一声', subSpots: [{ name: '伏见稻荷' }],
};
const CURATED = [KYOTO];

test('坐标撞上收录点 → 拿到内容', () => {
  const r = fromCustom({ id: 'u1', name: 'Kyoto', lat: 35.01, lng: 135.71 }, CURATED);
  assert.equal(r.curated?.id, 'kyoto', '「Kyoto」和「京都」名字对不上,但坐标是同一处');
});

test('坐标没撞上 → 没有内容,但记录本身完全正常', () => {
  const r = fromCustom({ id: 'u2', name: '某个小镇', lat: 10, lng: 20 }, CURATED);
  assert.equal(r.curated, null);
  assert.equal(r.been, true, '自己记下来的就意味着去过');
  assert.equal(r.name, '某个小镇');
});

test('没有坐标 → 不匹配,并标记出来', () => {
  // 没坐标的记录不会出现在地图上,UI 要能据此提示用户
  const r = fromCustom({ id: 'u3', name: '土耳其' }, CURATED);
  assert.equal(r.curated, null);
  assert.equal(r.hasCoords, false);
});

test('自定义记录默认就是「去过」', () => {
  assert.equal(fromCustom({ id: 'u4', name: 'x' }, []).been, true);
});

test('精选地点:打卡了才算去过', () => {
  const a = fromCurated(KYOTO, { visitedIds: [] });
  const b = fromCurated(KYOTO, { visitedIds: ['kyoto'] });
  assert.equal(a.been, false);
  assert.equal(b.been, true);
});

test('两种来源产出同一种形状 —— 合并的前提', () => {
  const a = fromCurated(KYOTO, { visitedIds: ['kyoto'] });
  const b = fromCustom({ id: 'u5', name: '京都', lat: 35.0, lng: 135.7 }, CURATED);
  for (const k of ['key', 'source', 'id', 'name', 'loc', 'lat', 'lng', 'been', 'visitedOn', 'note', 'curated']) {
    assert.ok(k in a, `精选记录缺字段 ${k}`);
    assert.ok(k in b, `自定义记录缺字段 ${k}`);
  }
});

test('key 带来源前缀 —— 两边 id 可能撞,列表 key 不能撞', () => {
  const a = fromCurated(KYOTO, {});
  const b = fromCustom({ id: 'kyoto', name: '同名' }, []);
  assert.notEqual(a.key, b.key);
});

test('没去过的地方不剧透文化彩蛋', () => {
  const notYet = bonusOf(fromCurated(KYOTO, { visitedIds: [] }));
  const been = bonusOf(fromCurated(KYOTO, { visitedIds: ['kyoto'] }));
  assert.equal(notYet.cultureEgg, null, '打卡前应保持神秘');
  assert.equal(been.cultureEgg, '进店要先说一声');
});

test('没有匹配内容时 bonusOf 返回 null,不是空壳', () => {
  // 返回 {} 的话 UI 会渲染出一堆空区块
  assert.equal(bonusOf(fromCustom({ id: 'u6', name: 'x', lat: 1, lng: 1 }, CURATED)), null);
});

test('isNear:缺坐标一律不算接近', () => {
  assert.equal(isNear({ lat: 1, lng: 1 }, { lat: null, lng: 1 }), false);
  assert.equal(isNear(null, { lat: 1, lng: 1 }), false);
});

test('matchCurated 跳过没有 geo 的收录点,不崩', () => {
  const r = matchCurated({ lat: 35, lng: 135.7 }, [{ id: 'x' }, KYOTO]);
  assert.equal(r?.id, 'kyoto');
});

test('自定义记录的日期优先用到访日,不是记录日', () => {
  // 旅行回来一次性补记 10 个地方,createdAt 全是同一天,旅迹会算成「一天飞遍东南亚」
  const r = fromCustom(
    { id: 'u7', name: 'x', visitedOn: '2026-03-01', createdAt: '2026-08-04T00:00:00Z' }, [],
  );
  assert.equal(r.visitedOn, '2026-03-01');
});
