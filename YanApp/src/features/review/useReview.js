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

import { K, readJsonResult, writeJson } from '../../lib/storage';
import { createWriteGuard } from '../../lib/writeGuard';
import { pullProgress, pushProgress } from '../../lib/sync';
import {
  todayStr, normalizeProgress, mergeProgress, review, markMastered,
  isDue, DAILY_GOAL,
} from '../wordbank/srs';

/**
 * 全部单词/句子的复习进度。**这是实现,不是给业务代码用的入口。**
 *
 * ⚠️ 业务代码请用 `ReviewProgressContext` 的 `useReviewProgress()`。
 * 直接调这个函数会得到一份**独立副本** —— 两处同时挂载时各写各的盘、互相覆盖,
 * 而且不报错。这个 hook 只该被 `ReviewProgressProvider` 调用一次。
 *
 * @returns progress  key → 记录
 * @returns ready     读盘+合并完成了没有。false 时不要拿 progress 做判断,
 *                    空的 progress 和「真的没学过」长得一样。
 * @returns grade     (key, 'again'|'hard'|'good'|'mastered', bookId?) => 新记录
 */
export function useReviewProgressState() {
  const [progress, setProgress] = useState({});
  const [ready, setReady] = useState(false);
  // 读盘之前、以及读盘失败之后,一律不许写这个键。
  // 见 writeGuard.ts —— 这是「拿不到数据 ≠ 数据是空的」的可执行形态。
  const guard = useRef(createWriteGuard(K.wordbankProgress));

  useEffect(() => {
    let alive = true;
    (async () => {
      const today = todayStr();
      // ⚠️ 必须用 readJsonResult 而不是 readJson。
      // readJson 把 ok 丢掉了 —— 「读失败」和「确实没有」都返回 null,
      // 于是界面显示成「一个词都没学过」,用户随手评一个分,
      // grade() 就把 { ...{}, [key]: rec } 写回磁盘,**全部进度清零**。
      // 这正是这个项目丢过四次数据的那个形状。
      const { ok, value: saved } = await readJsonResult(K.wordbankProgress);
      if (!alive) return;
      guard.current.onRead({ ok });

      // 先上屏本地那份,不等网络。旧版存的是 'learning' 字符串,
      // normalizeProgress 在这里迁成记录 —— 读盘是唯一的迁移入口。
      const local = normalizeProgress(saved, today);
      setProgress(local);
      setReady(true);

      const cloud = await pullProgress();
      if (!alive) return;

      // ⚠️ 必须拿 **prev** 合并,不能拿上面那个 local。
      //
      // setReady(true) 之后用户就能评分了,而 pullProgress() 还在等。
      // 原来的写法是 mergeProgress(local, cloud) —— local 是**启动那一刻的快照**,
      // 等待期间用户评的那一次不在里面。于是:
      //   联网:评分被合并结果覆盖,界面退回未评状态(云端有,下次启动才捞回来)
      //   离线:pullProgress 失败 → mergeProgress 原样返回启动快照 → 覆盖 state 和磁盘,
      //        而 pushProgress 同样离线失败 —— **那一次评分永久丢了**
      //
      // 用函数式更新拿到的 prev 一定是最新的。mergeProgress 的口径是
      // 「云端 lastSeenAt 更新才覆盖本地」,所以刚评的分天然赢过旧的云端行。
      // (2026-08-13 外部评审发现,不是理论风险 —— 弱网下走一遍就撞得到。)
      setProgress(prev => {
        const merged = mergeProgress(prev, cloud, today);
        if (guard.current.allow()) writeJson(K.wordbankProgress, merged);
        return merged;
      });
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
      // 读盘没成功过就只改内存不落盘 —— 但**云端照推**:
      // 推的是这一条记录本身,不是整份进度,不存在「拿空的覆盖」的问题,
      // 而且这是本地写不了时唯一能保住这次评分的通道。
      if (guard.current.allow()) writeJson(K.wordbankProgress, next);
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
export function useDailyQueue({ progress, ready, resolve, newUnits, limit = DAILY_GOAL, scopeKeys = null, persist = true }) {
  const [queue, setQueue] = useState(null);
  const savedRef = useRef(null);

  // resolve/newUnits 每次渲染都是新引用,放 ref 里避免把 effect 拖成死循环
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;
  // 队列是另一个键,单独一个护栏 —— 一个键读失败不该连累另一个。
  const sessionGuard = useRef(createWriteGuard(K.reviewSession));
  const newUnitsRef = useRef(newUnits);
  newUnitsRef.current = newUnits;

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      const today = todayStr();
      // 同样不能用 readJson:读失败会被当成「今天还没挑过队列」,
      // 于是重挑一批、落盘,把用户今天已经答过的进度盖掉。
      let saved = savedRef.current;
      if (saved == null) {
        const r = persist ? await readJsonResult(K.reviewSession) : { ok: true, value: null };
        if (!alive) return;
        sessionGuard.current.onRead({ ok: persist && r.ok });
        saved = r.value;
      } else {
        sessionGuard.current.onRead({ ok: true });   // 内存里这份就是我们自己刚写的
      }
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
      const allowed = scopeKeys ? new Set(scopeKeys) : null;
      const due = Object.entries(progress)
        .filter(([k]) => !allowed || allowed.has(k))
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
      if (persist && sessionGuard.current.allow()) writeJson(K.reviewSession, fresh);
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
      if (persist && sessionGuard.current.allow()) writeJson(K.reviewSession, next);
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
      if (persist && sessionGuard.current.allow()) writeJson(K.reviewSession, next);
      return next;
    });
  }, []);

  /** 队列里还没做完的键,按原顺序。 */
  const remaining = queue ? queue.keys.filter(k => !queue.done.includes(k)) : [];

  return { queue, remaining, markDone, defer };
}
