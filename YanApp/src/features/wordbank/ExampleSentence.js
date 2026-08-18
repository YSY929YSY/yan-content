// 言 · 例句(按词切开 · 假名压在字上)
//
// 原本例句是一整行纯文本。对一个还不会读的人,那是一堵墙:
// 他既不知道哪里到哪里是一个词,也不知道那些汉字读什么。
//
//     明日、大阪に行きます。          ← 之前
//
//      あす      おおさか   い
//      明日 、   大阪  に  行き ます 。   ← 现在,每个词底下一条线
//
// 分词来自离线管线(见 exampleTokens.ts),注音对齐来自 furigana.ts。
// 运行时**零新依赖** —— 手机上不跑分词器。
import { StyleSheet, Text, View } from 'react-native';

import { C } from '../../theme';
import { Furigana } from './FuriganaText';
import { normalizeTokens, tokensMatch } from './exampleTokens';

/**
 * @param sentence  原句(权威文本)
 * @param tokens    example_tokens.json 里这一句的原始数组;没有就传空
 * @param size      字号
 *
 * ⚠️ **分词拼不回原句就整句退回纯文本。**
 * 分词器吞字、改字、规范化标点都不报错,只会让屏幕上少一个字,
 * 而日语句子少一个假名可能就是另一个意思。这时候纯文本是对的,
 * 花哨但少了字的排版是错的。
 */
export function ExampleSentence({ sentence, tokens, size = 15, style }) {
  const list = normalizeTokens(tokens);
  const usable = tokensMatch(list, sentence);

  if (!usable) {
    return <Text style={[{ fontSize: size, color: C.ink, lineHeight: size * 1.5 }, style]}>{sentence}</Text>;
  }

  return (
    <View style={[s.row, style]}>
      {list.map((t, i) => (
        // 标点不画下划线也不留词间距 —— 它不是一个词,画上去会让人以为是
        <View key={i} style={[s.tok, !isPunct(t.text) && s.word]}>
          <Furigana
            word={t.text}
            reading={t.reading || t.text}
            size={size}
            color={C.ink}
            rubyColor={C.mutedLight}
          />
        </View>
      ))}
    </View>
  );
}

/** 标点。日语和西文的都算,例句里两种都出现过。 */
const isPunct = (s) => /^[、。，．・！？!?,.…「」『』()()〜~ー]+$/.test(s);

const s = StyleSheet.create({
  // 折行只会落在词边界上 —— 对学习 App 是优点,一个词不会被劈成两半
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  tok: { marginBottom: 2 },
  // 词底下那条线 + 词间距。线是「这是一个词」的唯一提示,
  // 没有它按词切开只会看着像排版坏了
  word: {
    borderBottomWidth: 1, borderBottomColor: C.borderWarm,
    marginRight: 5, paddingBottom: 1,
  },
});

export default ExampleSentence;
