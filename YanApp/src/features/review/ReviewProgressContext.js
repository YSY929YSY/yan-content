// 言 · 复习进度的单一实例
//
// ## 为什么需要这一层
//
// `useReviewProgress()` 有三个调用点:词书页、词库搜索页、复习页。
// 在这之前每个调用点是**各自独立的 state**,不是共享 store —— 各读各的盘、
// 各写各的盘。现在没炸,只是因为这三屏由 subTab 二选一渲染,同时只挂载一个。
//
// 那是**靠渲染结构保证正确性**:哪天复习页做成盖在上面的浮层(是个很自然的想法),
// 两边的内存副本就会各写各的、互相覆盖,而且不会报错 —— 表现是「我明明标了会了,
// 回到词书还是未学」。外部评审给这条的风险评级是「中等偏高」。
//
// 提成 Provider 之后,那种情况在结构上不可能发生:一个实例,一份 state,一次落盘。
// **不需要引入外部状态库** —— 问题从来不是「状态管理不够强」,是同一份数据有多份副本。
//
// ## 为什么 useReviewProgress 找不到 Provider 时直接抛
//
// 不回退到「就地建一个」。回退的话这个文件就白写了:漏包的那一屏会安静地
// 拿到自己的副本,回到今天的 bug,而且更难发现(因为大家以为已经修好了)。
// 抛出来是刺眼的,但它在开发期第一次渲染就会暴露,而不是等用户丢了进度。
import React, { createContext, useContext } from 'react';

import { useReviewProgressState } from './useReview';

const ReviewProgressCtx = createContext(null);

export function ReviewProgressProvider({ children }) {
  // 整个学习域共用这一份。挂在学习 Tab 而不是 App 根:
  // 挂根上的话,用户从没进过学习 tab 也会白读一次盘、白拉一次云端。
  const value = useReviewProgressState();
  return (
    <ReviewProgressCtx.Provider value={value}>
      {children}
    </ReviewProgressCtx.Provider>
  );
}

export function useReviewProgress() {
  const ctx = useContext(ReviewProgressCtx);
  if (!ctx) {
    throw new Error(
      'useReviewProgress 必须在 ReviewProgressProvider 里用。'
      + '直接调 useReviewProgressState 会得到一份独立副本,'
      + '两处同时挂载时会互相覆盖进度 —— 那正是这个 Provider 要消掉的 bug。'
    );
  }
  return ctx;
}
