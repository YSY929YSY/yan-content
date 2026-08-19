// 言 · 声调线
//
// 原来这两个东西写在 App.js 里(2238 / 1896 行)。搬出来是因为批次学习页也要画声调 ——
// 留在 App.js 里的话,新页面要么从 App.js 反向 import(循环依赖),要么照抄一份。
// 照抄的那份迟早和这份长歪成两个口径,而「同一个词在两个页面显示不同的调」
// 比不显示更糟:用户没有第三个地方可以核对。
//
// 数学在 pitch.js(纯函数,有测试)—— 这里只负责画。
import { StyleSheet, Text, View } from 'react-native';

import { C } from '../../theme';
import PITCH_PREVIEW from './pitch-preview.json';
import { toMora, pitchPattern, accentName, accentHint, accentOf } from './pitch';

/**
 * 这个词的声调型。取字段那一步在 `pitch.js` 的 `accentOf`(纯函数,有测试),
 * 这里只多一个开发期的 preview 兜底。
 *
 * ⚠️ 2026-08-18 修:`accentOf` 原来叫 `pitchOf`、写在 App.js 里,而且**只认
 * `w.pitchAccent`** —— 实测那个字段 0 条,7510 条音调全在 `w.pitch.accent`。
 * 于是唯一还能返回值的是下面这个 `__DEV__` 分支:
 *
 *     开发构建  → 走 PITCH_PREVIEW,音调全都在,看起来完全正常
 *     生产构建  → 7510 条音调**一条都不显示**
 *
 * 「音调渲染真机验过」验的是 dev build,而这条 preview 分支恰好把 bug 盖住了。
 * **验证路径和生产路径不是同一条的时候,验过等于没验。**
 *
 * preview 兜底留着(它对开发有用),但它现在只在 accentOf 拿不到时才轮得到,
 * 盖不住数据侧的问题。
 */
export const pitchOf = (w) => {
  const a = accentOf(w);
  if (a != null) return a;
  if (__DEV__) {
    const v = PITCH_PREVIEW[w?.id];
    return Number.isFinite(v) ? v : null;
  }
  return null;
};

/**
 * 这个词有没有不止一个型。
 *
 * ⚠️ `multi` 不能省。「取第一个」这条规则**没有来源可核** —— 848 条多型词里
 * 我们显示的那个型可能不是用户会听到的那个。标出来是唯一诚实的做法:
 * 用户知道「这里还有别的说法」,总好过他背下一个型然后在现实里对不上。
 */
export const hasMultiAccent = (w) => !!w?.pitch?.multi;

/**
 * 这条声调有几个来源印证。3 三方 / 2 两方 / 1 只有一个 / undefined 没标过。
 *
 * ⚠️ **这是这个 App 最该说出口的一件事。**
 * 在这之前,「三个独立来源都认」和「只有一个人这么说」在屏幕上**长得一模一样** ——
 * 而这个产品的全部资产就是「说的话可核对」。
 *
 * 三方各说各的那一类不会走到这里:它们的 pitch 在内容包里已经被删掉了
 * (tools/stamp-pitch-confidence.py)。空着不会教错,给一个错的会。
 */
export const pitchAgree = (w) => {
  const a = w?.pitch?.agree;
  return Number.isFinite(a) ? a : null;
};

/** 只有一个来源、无从印证 —— 界面上要标一句。 */
export const pitchUnconfirmed = (w) => pitchAgree(w) === 1;


/**
 * 声调线:假名上面那条高低线。
 *
 * 中文母语者有声调,会**下意识给日语词安一个调**,安错了也没人纠正。
 * 词库里有 207 组同音但声调不同的词(書く型1 / 欠く型0),在这之前它们长得一样。
 *
 * 画法是日语教材的标准形:高的那几拍上面拉一条线,降的地方线拐下来。
 */
export function PitchLine({ reading, accent }) {
  const mora = toMora(reading);
  if (!mora.length || !Number.isFinite(accent)) return null;
  const { pattern, particleHigh } = pitchPattern(reading, accent);
  return (
    <View style={wd.pitchRow}>
      {mora.map((m, i) => {
        const high = pattern[i];
        // 下一格的高低。最后一拍的「下一格」是助词那一格 —— 尾高的那道降就在那里
        const nextHigh = i < mora.length - 1 ? pattern[i + 1] : particleHigh;
        return (
          <Text
            key={i}
            style={[wd.pitchMora,
                    high ? wd.pitchHigh : wd.pitchLow,
                    // 高低要变的地方竖一道,把上下两条线连起来
                    high !== nextHigh && wd.pitchStep]}
          >
            {m}
          </Text>
        );
      })}
      {/* 后接助词那一格。
          **没有它,平板和尾高就分不开** —— 「はな(花・型0)」和「はな(鼻・型2)」
          在词本身上都是「低高」,差别全在后面那个助词上。
          用 ○ 占位,表示「这里跟一个助词的话是高还是低」。 */}
      <Text style={[wd.pitchMora, wd.pitchParticle,
                    particleHigh ? wd.pitchHigh : wd.pitchLow]}>○</Text>
      <Text style={wd.pitchName}>
        {accentName(reading, accent)} · {accentHint(reading, accent)}
      </Text>
    </View>
  );
}

const wd = StyleSheet.create({
  // 高的画顶线、低的画底线、高低交界处竖一道连起来,整条读下来就是一个阶梯。
  // 不需要先懂日语教材的约定也看得出形状。
  pitchRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  pitchMora: { fontSize: 14, color: C.muted, lineHeight: 20, paddingTop: 2,
               borderColor: C.lava },
  pitchHigh: { borderTopWidth: 1.5 },
  pitchLow: { borderBottomWidth: 1.5, borderColor: C.border },
  pitchStep: { borderRightWidth: 1.5 },
  // 助词那一格:○ 是占位,表示「后面跟个助词的话它是高还是低」。
  // 平板和尾高的差别只在这一格上,颜色要更淡,免得被当成词的一部分
  pitchParticle: { color: C.mutedLight, marginLeft: 1 },
  pitchName: { fontSize: 10, color: C.mutedLight, marginLeft: 7, paddingTop: 4 },
});
