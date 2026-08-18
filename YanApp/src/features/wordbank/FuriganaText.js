// 言 · 振り仮名(假名压在对应汉字上方)
//
// ## 为什么是「每段一列」而不是真的 ruby
//
// React Native **没有 ruby**。`<Text>` 不是 HTML,没有 `<ruby>`/`<rt>`,
// 而且 RN 文档写明 `<Text>` 内部不走 Flexbox 而是文本布局 ——
// 所以也别想在一段 `<Text>` 里塞个绝对定位的假名。
//
// 唯一可行的是把每一段拆成一列:
//
//     ┌──────┬──────┐
//     │ おい │      │   ← 上排:假名(小号)
//     │ 美味 │ しい │   ← 下排:字
//     └──────┴──────┘
//
// **不需要测量宽度**:列是 flex 列,宽度自动取「假名行」和「汉字行」里较宽的那个,
// 两行各自 `textAlign: center` 就自然居中对齐了。这是这个方案唯一优雅的地方。
//
// ⚠️ 代价要知道:换行只能发生在**段边界**上。对学习 App 这其实是优点
// (一个词不会被劈成两半),但长句子的排版会比纯文本松。
//
// ⚠️ 文件名叫 FuriganaText 而不是 Furigana:纯逻辑那份是同目录的 `furigana.ts`,
// 而 macOS 的文件系统大小写不敏感 —— 两个只差首字母大小写的文件放一起,
// `import from './furigana'` 会解析到这个组件自己身上(循环 import),
// eslint 的 import/no-unresolved 当场就报了。
//
// ⚠️ 社区那个 `react-native-furi` **不要装**:npm 上的包是坏的,
// `index.js` 只有一行 `import from './dist'` 而 `dist/` 根本不在包里(整包 2.7 KB)。
import { StyleSheet, Text, View } from 'react-native';

import { C } from '../../theme';
import { alignFurigana } from './furigana';

/**
 * @param word     词面
 * @param reading  整词读音
 * @param size     汉字字号。假名固定取它的 0.5,再小就看不清了
 * @param color    字色
 * @param rubyColor 假名色。默认比字浅 —— 假名是辅助,不该和字抢
 *
 * 对不上就**退回显示纯读音**(见 furigana.ts:对不上返回 null,不瞎标)。
 * 少一个信息好过多一个错的信息。
 */
export function Furigana({ word, reading, size = 26, color = C.ink, rubyColor = C.muted, style }) {
  const segs = alignFurigana(word, reading);

  if (!segs) {
    // 对不上:老老实实只给读音。**不要把整词读音浮在词上面充数**
    return (
      <Text style={[{ fontSize: size, fontWeight: '700', color }, style]}>
        {reading || word}
      </Text>
    );
  }

  const ruby = Math.round(size * 0.5);
  return (
    <View style={[s.row, style]}>
      {segs.map((seg, i) => (
        <View key={i} style={s.col}>
          {/* 没有 ruby 的段也要占一行等高的空白,否则这一列会往上窜,
              整行字的基线就参差不齐了 */}
          <Text style={[s.ruby, { fontSize: ruby, lineHeight: ruby + 2, color: rubyColor }]}>
            {seg.ruby || ' '}
          </Text>
          <Text style={[s.base, { fontSize: size, lineHeight: size + 4, color }]}>
            {seg.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  // wrap 是为了长词也能折;折点落在段边界上
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  // 列宽 = max(假名宽, 汉字宽),两行居中 —— 对齐就是这么来的,不用测量
  col: { alignItems: 'center' },
  ruby: { textAlign: 'center' },
  base: { textAlign: 'center', fontWeight: '700' },
});

export default Furigana;
