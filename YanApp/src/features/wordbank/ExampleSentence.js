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

  return <TokenColumnSentence
    columns={list.map((t) => ({ jp: t.text, reading: t.reading || t.text }))}
    size={size}
    style={style}
    showGloss={false}
  />;
}

/**
 * 例句和词场共用的 token column renderer。
 * 每个 token 是一个横向 column；`Furigana` 内部负责同一 token 的读音/日语
 * 两槽，第三槽是可选 gloss。词场的空 gloss 仍保留 lineHeight，不能让后面的
 * token 顶上来；例句则直接隐藏第三槽。
 */
export function TokenColumnSentence({ columns, size = 15, style, showGloss = false }) {
  if (!Array.isArray(columns) || columns.length === 0) return null;
  return (
    <View style={[s.row, style]}>
      {columns.map((column, i) => {
        const glossStyle = column.source === 'grammar' ? s.glossGrammar : s.gloss;
        const blank = column.source === 'blank' || !column.gloss;
        return (
          <View key={i} style={[s.column, !showGloss && !isPunct(column.jp) && s.word]}>
            <View style={s.furiganaSlot}>
              <Furigana
                word={column.jp}
                reading={column.reading || column.jp}
                size={size}
                color={column.member ? C.lava : C.ink}
                rubyColor={C.mutedLight}
              />
            </View>
            {showGloss && (
              <Text style={[glossStyle, blank && s.glossBlank]}>
                {column.gloss || ' '}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** 标点。日语和西文的都算,例句里两种都出现过。 */
const isPunct = (s) => /^[、。，．・！？!?,.…「」『』()()〜~ー]+$/.test(s);

const s = StyleSheet.create({
  // 折行只会落在 token column 边界上；列宽由 Furigana 自己的文本布局决定。
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 5 },
  column: { alignItems: 'center' },
  furiganaSlot: { alignItems: 'center' },
  word: { borderBottomWidth: 1, borderBottomColor: C.borderWarm, paddingBottom: 1 },
  gloss: { fontSize: 10, color: C.muted, lineHeight: 14, maxWidth: 70, textAlign: 'center' },
  glossGrammar: { fontSize: 9, color: C.mutedLight, lineHeight: 13, maxWidth: 70, textAlign: 'center' },
  glossBlank: { color: 'transparent' },
});

export default ExampleSentence;
