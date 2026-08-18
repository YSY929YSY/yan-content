// 言 · 「五十音这道门过了没」—— 单一判据
//
// ## 为什么要有这一层
//
// 这个判据原本写了两份:首页今日卡(App.js)算的是
// 「新进度 或 学过任何词」,五十音页算的只有「新进度」。
// 于是一个学了几百个词的老用户会看到:
//
//     首页   —— 这道门早就过了,直接给你词
//     五十音 —— 看过 0 / 46 个平假名
//
// 他合理的读解是「我的五十音进度没了」。两个页面对同一个问题给两个答案,
// 而**没有任何一处代码是错的** —— 错在这件事有两份实现。
//
// 收成一个 hook,两边都用它。判据以后要改也只有一个地方要改。
import { useMemo } from 'react';

import { useReviewProgress } from '../review/ReviewProgressContext';
import { useKanaProgress } from './KanaProgressContext';
import { requiredKana, seenCount, isKanaDone } from './kanaProgress';

/**
 * @param kanaRows 内容包里的假名表(原始行,不是配对后的)
 *
 * @returns done      这道门过了没
 * @returns required  要求看过的平假名清音(从内容包现筛,不写死 46)
 * @returns seen      已经看过几个
 * @returns ready     两份进度都读回来了没。**false 时不要拿 done 做判断**
 * @returns legacy    是靠「学过任何词」这条兜底过的,而不是真的走完了五十音
 */
export function useKanaGate(kanaRows) {
  const { progress: kanaProg, ready: kanaReady } = useKanaProgress();
  const { progress: srsProgress, ready: srsReady } = useReviewProgress();

  const required = useMemo(() => requiredKana(kanaRows), [kanaRows]);

  return useMemo(() => {
    const real = isKanaDone(kanaProg, required);

    /**
     * 老用户兜底:学过任何一个词就当这道门过了。
     *
     * ⚠️ 这条不能删。五十音进度是新键,**已有用户的这个键是空的** ——
     * 只认 `real` 的话,一个学了几百词的人下次打开会被告知「先把五十音走完」。
     * 新键上线不能把老用户打回起点。
     *
     * ⚠️ 但它对新用户是**假阳性,而且不可逆**:一个真·零基础的人如果绕开首页、
     * 自己去词书里点开一个词评了个分,`srsProgress` 就永远非空,这道门被永久跳过,
     * 没有任何回退路径(SRS 记录不会变回空)。
     *
     * 明知如此还是留着,因为两害相权:
     *   误放行 —— 要用户主动绕开首页的引导才会发生,而且他还能自己回五十音页
     *   误拦截 —— 每一个现有用户,一打开就发生,而且他没做错任何事
     * 等到这个键铺开够久(所有活跃用户都有了真实的 kanaProgress),这条就该删。
     *
     * ⚠️ `srsProgress` 是**全局** SRS 进度,深卡/地点/场景/地铁句都在同一份 map 里
     * (见 useReview.js),不限于主线池。所以「学过任何词」比字面意思更宽。
     */
    const legacy = !real && Object.keys(srsProgress || {}).length > 0;

    return {
      done: real || legacy,
      legacy,
      required,
      seen: seenCount(kanaProg, required),
      ready: kanaReady && srsReady,
    };
  }, [kanaProg, srsProgress, required, kanaReady, srsReady]);
}
