// 国名归一化。
//
// 「点亮了几个国家」是靠字符串去重算出来的,国名不干净数字就是错的 ——
// 下面这些脏数据全是从 Nominatim 实测到的,不是假想。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCountry, countriesOf } from '../country.js';

test('分号连着的简繁只取第一个', () => {
  assert.equal(normalizeCountry('意大利;義大利'), '意大利');
  assert.equal(normalizeCountry('英国;英國'), '英国');
  assert.equal(normalizeCountry('美国;美國'), '美国');
});

test('斜杠分隔的两种叫法只取第一个', () => {
  assert.equal(normalizeCountry('韩国 / 南韓'), '韩国');
  assert.equal(normalizeCountry('印度尼西亚 / 印度尼西亞'), '印度尼西亚');
  assert.equal(normalizeCountry('冰岛 / 冰島'), '冰岛');
});

test('整体是繁体的转成简体', () => {
  assert.equal(normalizeCountry('奧地利'), '奥地利');
});

test('已经干净的原样返回', () => {
  for (const c of ['日本', '土耳其', '爱尔兰', '中国', '玻利维亚']) {
    assert.equal(normalizeCountry(c), c);
  }
});

test('空值不炸,返回空串', () => {
  assert.equal(normalizeCountry(''), '');
  assert.equal(normalizeCountry(null), '');
  assert.equal(normalizeCountry(undefined), '');
  assert.equal(normalizeCountry('  '), '');
  assert.equal(normalizeCountry('/;'), '');
});

test('回归:简繁两种写法必须算同一个国家', () => {
  // 不归一化的话这里会数出 2,而用户只去过意大利一个国家
  const n = countriesOf([
    { been: true, country: '意大利;義大利' },
    { been: true, country: '意大利' },
  ]);
  assert.deepEqual(n, ['意大利']);
});

test('只数去过的,想去的不算', () => {
  // 想去也计入的话,这个数字就失去意义了 —— 43 个精选地点一装 App 就全亮
  const n = countriesOf([
    { been: true, country: '日本' },
    { been: false, country: '秘鲁' },
    { country: '印度' },
  ]);
  assert.deepEqual(n, ['日本']);
});

test('没有国家信息的记录被跳过,不产生空条目', () => {
  const n = countriesOf([
    { been: true, country: '' },
    { been: true },
    { been: true, country: '日本' },
  ]);
  assert.deepEqual(n, ['日本']);
});

test('同一国家的多个地点只算一次', () => {
  const n = countriesOf([
    { been: true, country: '日本' },
    { been: true, country: '日本' },
    { been: true, country: '土耳其' },
  ]);
  assert.equal(n.length, 2);
});
