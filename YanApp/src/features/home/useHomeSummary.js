// 言 · 首页汇总
//
// 首页原本没有一个数字,只有口号(「今天大地说什么?」「先开口,再补规则」)
// 和一段算出来却从没渲染的推荐文案。用户打开 App 看不到自己在哪儿、
// 上次学到哪、走到哪 —— 每次都像第一次打开。
//
// 这里读几份已经存在的数据,不新增任何存储:
//   学习进度(词书) / 地铁解锁到第几站 / 足迹点亮了几个国家几处
//
// ⚠️ **学习进度走 Context,不再自己读盘。**
//
// 原来这里是 `readJson(K.wordbankProgress)` —— 于是首页同一屏上有两个数据源:
//   今日任务卡  读内存(useReviewProgress 的 context),评分立刻反映
//   这张三数字卡 读磁盘,而且只在挂载时读一次
//
// 两者在正常情况下会收敛(切回首页会重新挂载、重读一次),但只要落盘被
// writeGuard 挡住(读盘失败过),内存那份是对的、磁盘那份是旧的,
// **同一屏上两个数字就会无声无息地分家**。
// 而这个文件自己的注释还写着「首页和词书页各算一遍而算法不同,是『两处数字
// 对不上』这类 bug 的标准做法」—— 口径当时统一了,数据源没有。
//
// 其余三份(地铁/足迹/自建地点)没有 Context,继续读盘,那是它们唯一的源。
import { useEffect, useMemo, useState } from 'react';

import { useReviewProgress } from '../review/ReviewProgressContext';
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
  // 学习进度的唯一所有者。这里只读,不写。
  const { progress, ready: progressReady } = useReviewProgress();
  // 磁盘那三份没有 Context,读盘是它们唯一的源
  const [disk, setDisk] = useState(null);

  // ⚠️ 磁盘只读一次(挂载时),**不跟着 progress 重读**。
  // 第一版把三个 readJson 和进度算在同一个 effect 里、依赖里带上 progress ——
  // 结果每评一个分就重读三次盘。它不会算错,只是白花 IO,
  // 而这种浪费在评分连点时最明显,恰好是最不该卡的时候。
  useEffect(() => {
    let alive = true;
    (async () => {
      const [stationRaw, visited, mine] = await Promise.all([
        readJson(K.subwayProgress, 0),
        readJson(K.worldVisitedIds, []),
        readJson(K.userPlaces, []),
      ]);
      if (!alive) return;
      setDisk({
        station: Number.isFinite(Number(stationRaw)) ? Number(stationRaw) : 0,
        visitedIds: Array.isArray(visited) ? visited : [],
        myPlaces: Array.isArray(mine) ? mine : [],
      });
    })();
    return () => { alive = false; };
  }, []);

  return useMemo(() => {
    // 两个源都到齐才出数字。任何一个没到,空的和「真的没有」长得一样,
    // 而这一屏拿它们说的是「你走到哪儿了」—— 说错了比不说更让人泄气。
    if (!progressReady || !disk) return EMPTY;

    // 走 srs.js 同一套口径,顺带认得旧版存的字符串 —— 首页和词书页各算一遍
    // 而算法不同,是「两处数字对不上」这类 bug 的标准做法
    const words = statusCounts(progress);
    const bySource = dueBySource(progress);
    const deepDue = (bySource.place || 0) + (bySource.card || 0)
      + (bySource.scene || 0) + (bySource.subway || 0);

    // 国家数走和世界足迹同一套计算 —— 首页和那一页显示不一致会很难解释
    const countries = countriesOf([
      ...mapPlaces.map(p => fromCurated(p, { visitedIds: disk.visitedIds })),
      ...disk.myPlaces.map(mp => fromCustom(mp, [])),
    ]);

    return {
      // 首页那个数字从「学习中 N」换成「今天该复习 N」:前者是一个只会变大的
      // 存量,看多少天都一样;后者是今天能做完的事,做完就归零。
      due: words.due,
      // 今天到期的里,有几条来自深内容(地点记忆卡/深卡骨架/场景句/地铁句)。
      // 首页拿它说「3 条来自你走过的地方」—— 这句话是这个 App 和词库 App 的区别,
      // 值得占首页一行。
      deepDue,
      learning: words.learning,
      mastered: words.mastered,
      station: disk.station,
      countries: countries.length,
      places: disk.visitedIds.length + disk.myPlaces.length,
      ready: true,
    };
  }, [progress, progressReady, disk, mapPlaces]);
}
