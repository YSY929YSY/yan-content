// 言 · 复习状态
//
// 为什么要有这个 hook:进度原本锁在 WordBankScreen 的 useState 里。
// 现在复习页也要读同一份进度、写同一份进度 —— 如果各自 useState 各自落盘,
// 两个页面会互相覆盖:你在复习页答对的词,切回词书页一看还是「今天到期」,
// 然后词书页一落盘,复习页那次答题就没了。
//
// 所以进度只有一个所有者,就是这里。谁要用谁调这个 hook,不要再自己读盘。
//
// 遵守硬规矩 2:落盘是状态的属性,不是调用方的责任 —— grade() 里必然落盘 + 推云端,
// 调用方没有「忘了存」这个选项。
import { useCallback, useEffect, useRef, useState } from 'react';

import { K, readJson, writeJson } from '../../lib/storage';
import { pullProgress, pushProgress } from '../../lib/sync';
import {
  todayStr, normalizeProgress, mergeProgress, review, markMastered,
  isDue, DAILY_GOAL,
} from '../wordbank/srs';

/**
 * 全部单词/句子的复习进度。
 *
 * @returns progress  key → 记录
 * @returns ready     读盘+合并完成了没有。false 时不要拿 progress 做判断,
 *                    空的 progress 和「真的没学过」长得一样。
 * @returns grade     (key, 'again'|'hard'|'good'|'mastered', bookId?) => 新记录
 */
export function useReviewProgress() {
  const [progress, setProgress] = useState({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const today = todayStr();
      const saved = await readJson(K.wordbankProgress, null);
      if (!alive) return;

      // 先上屏本地那份,不等网络。旧版存的是 'learning' 字符串,
      // normalizeProgress 在这里迁成记录 —— 读盘是唯一的迁移入口。
      const local = normalizeProgress(saved, today);
      setProgress(local);
      setReady(true);

      // 拉不到时 mergeProgress 原样返回本地,绝不用空值覆盖(硬规矩 1)
      const merged = mergeProgress(local, await pullProgress(), today);
      if (!alive) return;
      setProgress(merged);
      writeJson(K.wordbankProgress, merged);
    })();
    return () => { alive = false; };
  }, []);

  const grade = useCallback((key, g, bookId = 'n5') => {
    if (!key) return null;
    const today = todayStr();
    let rec = null;
    setProgress(prev => {
      rec = g === 'mastered' ? markMastered(prev[key], today) : review(prev[key], g, today);
      const next = { ...prev, [key]: rec };
      writeJson(K.wordbankProgress, next);
      pushProgress(key, rec, bookId);
      return next;
    });
    return rec;
  }, []);

  return { progress, ready, grade };
}

/**
 * 今天的混合复习队列 —— 五个来源混在一起,不分词书。
 *
 * 和词书页那条「今日任务」的区别:那条是「这本书今天学 10 个」,属于词书;
 * 这条是「今天该复习的全部东西」,词、深卡骨架、地点记忆卡、场景句、地铁句都在里面。
 * 用户点首页那个「今天该复习 N」进来的就是这个。
 *
 * @param resolve  (key) => 单元 | null。解析不出内容的键会被跳过 ——
 *                 内容包换过版本、某个词被删掉时,不能让队列里出现一道空白题。
 * @param newUnits 没学过的候选单元,用来在到期的不够时补足。
 */
export function useDailyQueue({ progress, ready, resolve, newUnits, limit = DAILY_GOAL }) {
  const [queue, setQueue] = useState(null);
  const savedRef = useRef(null);

  // resolve/newUnits 每次渲染都是新引用,放 ref 里避免把 effect 拖成死循环
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;
  const newUnitsRef = useRef(newUnits);
  newUnitsRef.current = newUnits;

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      const today = todayStr();
      const saved = savedRef.current ?? await readJson(K.reviewSession, null);
      if (!alive) return;
      savedRef.current = saved || {};

      if (saved && saved.date === today && Array.isArray(saved.keys)) {
        setQueue({
          date: today,
          keys: saved.keys.filter(k => resolveRef.current(k)),
          done: Array.isArray(saved.done) ? saved.done : [],
        });
        return;
      }

      // 到期的全部收上来,逾期最久的排最前 —— 复习欠账优先于摄入新内容
      const due = Object.entries(progress)
        .filter(([k, rec]) => isDue(rec, today) && resolveRef.current(k))
        .sort((a, b) => (a[1].dueAt < b[1].dueAt ? -1 : a[1].dueAt > b[1].dueAt ? 1 : 0))
        .map(([k]) => k);

      const keys = due.slice(0, limit);

      // 不够时补新的。**深内容排在生词前面**是有意的:
      // 词库有 8298 条,按数量它永远能把队列填满,深卡和地点记忆卡就永远轮不上。
      // 而深内容恰恰是这个产品和词库 App 的分界线 —— 让它优先出场,
      // 是在机制上保证「功利腿不会吃掉灵魂腿」,不是靠以后记得手动调。
      for (const u of newUnitsRef.current || []) {
        if (keys.length >= limit) break;
        if (!progress[u.key]) keys.push(u.key);
      }

      const fresh = { date: today, keys, done: [] };
      savedRef.current = fresh;
      setQueue(fresh);
      writeJson(K.reviewSession, fresh);
    })();
    return () => { alive = false; };
    // progress 变化不该重挑队列 —— 答一道题就换一批词是灾难。
    // 只在读盘就绪时挑一次,之后靠 markDone 增量更新。
  }, [ready]);

  const markDone = useCallback((key) => {
    setQueue(prev => {
      if (!prev || prev.done.includes(key)) return prev;
      const next = { ...prev, done: [...prev.done, key] };
      savedRef.current = next;
      writeJson(K.reviewSession, next);
      return next;
    });
  }, []);

  /**
   * 把一条挪到队尾。
   *
   * 「忘了」的词今天还要再见一次,所以不能标记成完成;但如果就留在原位,
   * 点完「忘了」同一道题立刻又弹回来 —— 那不是复习,是罚站。挪到队尾,
   * 等把别的过一遍再回来问,中间隔了几道题,才是真的又想了一次。
   */
  const defer = useCallback((key) => {
    setQueue(prev => {
      if (!prev) return prev;
      const rest = prev.keys.filter(k => k !== key);
      if (rest.length === prev.keys.length) return prev;
      const next = { ...prev, keys: [...rest, key] };
      savedRef.current = next;
      writeJson(K.reviewSession, next);
      return next;
    });
  }, []);

  /** 队列里还没做完的键,按原顺序。 */
  const remaining = queue ? queue.keys.filter(k => !queue.done.includes(k)) : [];

  return { queue, remaining, markDone, defer };
}
