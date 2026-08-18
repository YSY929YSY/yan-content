// 言 · 五十音进度状态
//
// 规则在 kanaProgress.ts(纯函数,有测试)—— 这里只负责读盘、落盘、给出口。
//
// ⚠️ 业务代码请用 `KanaProgressContext` 的 `useKanaProgress()`。
// 直接调这个函数会得到一份**独立副本**:五十音页和首页今日卡是两个调用点,
// 各读各的盘、各写各的盘,而且不报错。见 ReviewProgressContext 的文档注释 ——
// 那个坑这个项目已经踩过一次,不必再踩第二次。
import { useCallback, useEffect, useRef, useState } from 'react';

import { K, readJsonResult, writeJson } from '../../lib/storage';
import { createWriteGuard } from '../../lib/writeGuard';
import { todayStr } from '../wordbank/srs';
import {
  emptyKanaProgress, normalizeKanaProgress, markSeen, declareKnown,
} from './kanaProgress';

/**
 * @returns progress  KanaProgress
 * @returns ready     读盘完成了没。**false 时不要拿 progress 做判断** ——
 *                    空的 progress 和「真的没看过」长得一样,而这两者在
 *                    「五十音走完了没」这个问题上会给出相反的界面。
 * @returns see       (kana) => void   记一个「看过」
 * @returns declare   () => void       用户声明「我已经会了」
 */
export function useKanaProgressState() {
  const [progress, setProgress] = useState(emptyKanaProgress);
  const [ready, setReady] = useState(false);
  // 读盘之前、以及读盘失败之后,一律不许写这个键 —— 见 writeGuard.ts。
  const guard = useRef(createWriteGuard(K.kanaProgress));

  useEffect(() => {
    let alive = true;
    (async () => {
      // ⚠️ readJsonResult 而不是 readJson:readJson 把 ok 丢掉了,
      // 「读失败」和「确实没有」都返回 null。在这里的后果是
      // 「你还没走五十音」—— 然后用户点开一个假名,就把已有的进度覆盖成一条。
      const { ok, value } = await readJsonResult(K.kanaProgress);
      if (!alive) return;
      guard.current.onRead({ ok });
      setProgress(normalizeKanaProgress(value));
      setReady(true);
    })();
    return () => { alive = false; };
  }, []);

  // 落盘是状态的属性,不是调用方的责任 —— 调用方没有「忘了存」这个选项。
  const commit = useCallback((fn) => {
    setProgress(prev => {
      const next = fn(prev);
      // 没变就不写。每点一次假名写一次盘没有必要,而且 markSeen 已经保证
      // 重复记会返回同一个引用。
      if (next === prev) return prev;
      if (guard.current.allow()) writeJson(K.kanaProgress, next);
      return next;
    });
  }, []);

  const see = useCallback((kana) => {
    commit(prev => markSeen(prev, kana, todayStr()));
  }, [commit]);

  const declare = useCallback(() => {
    commit(prev => declareKnown(prev, todayStr()));
  }, [commit]);

  return { progress, ready, see, declare };
}
