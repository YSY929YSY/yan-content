// 言 · 五十音进度的单一实例
//
// 两个调用点:五十音页(写)和首页今日任务卡(读)。它们**同时挂载**——
// 首页那张卡在 home tab,五十音页在 pie tab,而 Provider 包着两者。
// 各自 useState 的话就是两份独立副本,各写各的盘,表现是
// 「我明明点完了 46 个,首页还说先把五十音走完」。
//
// 这不是假想:复习进度就是这么长歪的,ReviewProgressContext 那份注释记着全过程。
// 照着它做,不要再发明第二种写法。
import React, { createContext, useContext } from 'react';

import { useKanaProgressState } from './useKanaProgress';

const KanaProgressCtx = createContext(null);

export function KanaProgressProvider({ children }) {
  const value = useKanaProgressState();
  return (
    <KanaProgressCtx.Provider value={value}>
      {children}
    </KanaProgressCtx.Provider>
  );
}

export function useKanaProgress() {
  const ctx = useContext(KanaProgressCtx);
  if (!ctx) {
    throw new Error(
      'useKanaProgress 必须在 KanaProgressProvider 里用。'
      + '直接调 useKanaProgressState 会得到一份独立副本,'
      + '两处同时挂载时会互相覆盖进度 —— 那正是这个 Provider 要消掉的 bug。'
    );
  }
  return ctx;
}
