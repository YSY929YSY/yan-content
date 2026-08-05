// 言 · 首页汇总
//
// 首页原本没有一个数字,只有口号(「今天大地说什么?」「先开口,再补规则」)
// 和一段算出来却从没渲染的推荐文案。用户打开 App 看不到自己在哪儿、
// 上次学到哪、走到哪 —— 每次都像第一次打开。
//
// 这里读三份已经存在的数据,不新增任何存储:
//   学习进度(词书) / 地铁解锁到第几站 / 足迹点亮了几个国家几处
//
// 只读不写。首页每次切回来都会重新挂载,所以读一次就够,不必订阅。
import { useEffect, useState } from 'react';

import { K, readJson } from '../../lib/storage';
import { countriesOf } from '../../lib/country';
import { fromCurated, fromCustom } from '../world/record';
import { statusCounts } from '../wordbank/srs';
import { dueBySource } from '../review/units';

const EMPTY = {
  due: 0, deepDue: 0, learning: 0, mastered: 0, station: 0,
  countries: 0, places: 0, ready: false,
};

export function useHomeSummary(mapPlaces = []) {
  const [sum, setSum] = useState(EMPTY);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [progress, stationRaw, visited, mine] = await Promise.all([
        readJson(K.wordbankProgress, {}),
        readJson(K.subwayProgress, 0),
        readJson(K.worldVisitedIds, []),
        readJson(K.userPlaces, []),
      ]);
      if (!alive) return;

      // 走 srs.js 同一套口径,顺带认得旧版存的字符串 —— 首页和词书页各算一遍
      // 而算法不同,是「两处数字对不上」这类 bug 的标准做法
      const words = statusCounts(progress);
      const bySource = dueBySource(progress);
      const deep = {
        place: bySource.place || 0, card: bySource.card || 0,
        scene: bySource.scene || 0, subway: bySource.subway || 0,
      };
      const visitedIds = Array.isArray(visited) ? visited : [];
      const myPlaces = Array.isArray(mine) ? mine : [];

      // 国家数走和世界足迹同一套计算 —— 首页和那一页显示不一致会很难解释
      const countries = countriesOf([
        ...mapPlaces.map(p => fromCurated(p, { visitedIds })),
        ...myPlaces.map(mp => fromCustom(mp, [])),
      ]);

      setSum({
        // 首页那个数字从「学习中 N」换成「今天该复习 N」:前者是一个只会变大的
        // 存量,看多少天都一样;后者是今天能做完的事,做完就归零。
        due: words.due,
        // 今天到期的里,有几条来自深内容(地点记忆卡/深卡骨架/场景句/地铁句)。
        // 首页拿它说「3 条来自你走过的地方」—— 这句话是这个 App 和词库 App 的区别,
        // 值得占首页一行。
        deepDue: deep.place + deep.card + deep.scene + deep.subway,
        learning: words.learning,
        mastered: words.mastered,
        // 存的是「解锁到第几站」的下标,展示时是第几站
        station: Number.isFinite(Number(stationRaw)) ? Number(stationRaw) : 0,
        countries: countries.length,
        places: visitedIds.length + myPlaces.length,
        ready: true,
      });
    })();
    return () => { alive = false; };
  }, [mapPlaces]);

  return sum;
}
