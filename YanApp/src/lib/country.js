// 言 · 国名归一化
//
// 「点亮了几个国家」是这个产品里最有成就感的一个数字,而它是靠字符串去重算出来的
// —— 所以国名不干净,数字就是错的。
//
// Nominatim 返回的中文国名有三种脏法(都是实测到的):
//   意大利;義大利          简繁用分号连在一起
//   韩国 / 南韓            斜杠分隔的两种叫法
//   奧地利                 整体是繁体
//
// 不归一化的话,「意大利;義大利」和「意大利」会被算成两个国家,而用户只去过一个。
//
// 这里只做能确定的事:切分隔符取第一个、繁转简(仅限国名里出现的那些字)。
// 不做模糊匹配 —— 猜错国家比多一个条目更糟。

/** 只覆盖国名里会出现的繁体字。不做通用繁简转换,那需要一整张表且容易误伤。 */
const TRAD_TO_SIMP = {
  義: '义', 韓: '韩', 國: '国', 奧: '奥', 島: '岛', 尼: '尼',
  西: '西', 亞: '亚', 維: '维', 蘭: '兰', 羅: '罗', 斯: '斯',
  爾: '尔', 東: '东', 灣: '湾', 麥: '麦', 挪: '挪', 瑞: '瑞',
};

const simplify = (s) => s.replace(/./g, (ch) => TRAD_TO_SIMP[ch] || ch);

/**
 * 把地理服务返回的国名收拾干净。
 * @returns {string} 归一化后的国名;输入为空或全是分隔符时返回空串
 */
export function normalizeCountry(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  // 分号和斜杠都是「同一个国家的另一种叫法」,取第一个即可
  const first = s.split(/[;/／]/)[0].trim();
  if (!first) return '';
  return simplify(first);
}

/**
 * 数一共点亮了几个国家。
 *
 * 只认真正去过的记录 —— 「想去」不该计入成就,那会让数字失去意义。
 */
export function countriesOf(records = []) {
  const set = new Set();
  for (const r of records) {
    if (!r?.been) continue;
    const c = normalizeCountry(r.country);
    if (c) set.add(c);
  }
  return [...set].sort();
}

/**
 * 按国家汇总,给「点亮了哪些、还差哪些」用。
 *
 * 为什么要连未点亮的一起给:光看「25 个国家」是个死数字,而「日本还有 6 个
 * 地方没去」是个可以行动的提示。成就感来自差距可见,不是来自总数。
 *
 * @returns 已点亮的在前(按去过的地点数倒序),未点亮的在后(按可去的地点数倒序)
 */
export function countryStats(records = []) {
  const map = new Map();
  for (const r of records) {
    const c = normalizeCountry(r?.country);
    if (!c) continue;
    if (!map.has(c)) map.set(c, { country: c, been: [], wish: [] });
    map.get(c)[r.been ? 'been' : 'wish'].push(r.name || '');
  }
  const rows = [...map.values()].map(x => ({ ...x, lit: x.been.length > 0 }));
  return rows.sort((a, b) => {
    if (a.lit !== b.lit) return a.lit ? -1 : 1;
    return a.lit
      ? b.been.length - a.been.length
      : b.wish.length - a.wish.length;
  });
}
