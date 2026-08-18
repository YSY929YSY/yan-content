// 言 · 英文释义按义项分行
//
// `meaning_en` 一个字段塞了两层结构:
//
//     "only; just; merely | as much as; to the extent of"
//      └───── 义项 1 ─────┘  └────── 义项 2 ──────┘
//
// 之前是整串塞进一个 <Text numberOfLines={2}>,于是两个义项被挤成一行、
// 还可能被省略号截掉半个 —— 一个词有几个意思这件事,用户根本看不出来。
//
// ## 为什么直接列出来,而不是「这个词还有别的意思」
//
// 原本的方案是只显示第一个义项 + 一句提示。用户的判断是反的,而且他是对的:
//
//     「有位置说还有其他意思,不如直接写出来,而且这样潜移默化余光也会学到」
//
// 提示是一句需要用户去点、去展开、去处理的东西;直接列出来是**余光就能扫到**的。
// 而这一页本来就有位置。多义词只有 2–3 个义项(实测最多 3),列完也不长。
//
// ⚠️ **不做中英义项配对。** meaning_zh 全库 0 条带分隔符,而且中英义项数
// 对不上的有 881 条 —— 按下标配对的 UI 会张冠李戴(见 meaningSenses.ts)。
// 这里只是把英文那一侧如实摊开,中文仍然是它自己那一行。
import { StyleSheet, Text, View } from 'react-native';

import { C } from '../../theme';
import { parseEnSenses } from './meaningSenses';

/**
 * @param text  meaning_en 原文
 * @param max   最多列几个义项。默认全列 —— 实测最多 3 个,不长
 */
export function SenseList({ text, max = 3, style }) {
  const senses = parseEnSenses(text);
  if (!senses.length) return null;

  // 只有一个义项时不编号 —— 「1.」孤零零挂在那里像是漏了后面几条
  if (senses.length === 1) {
    return <Text style={[s.single, style]}>{senses[0].text}</Text>;
  }

  const shown = senses.slice(0, max);
  return (
    <View style={[s.wrap, style]}>
      {shown.map((sense, i) => (
        <View key={i} style={s.row}>
          <Text style={s.num}>{i + 1}</Text>
          <Text style={s.txt}>{sense.text}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 3, alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  // 序号用等宽数字,两行的文字才对得齐
  num: {
    fontSize: 11, color: C.mutedLight, lineHeight: 17,
    fontVariant: ['tabular-nums'], minWidth: 10,
  },
  txt: { flex: 1, fontSize: 12, color: C.muted, lineHeight: 17 },
  single: { fontSize: 12, color: C.muted, lineHeight: 17 },
});

export default SenseList;
