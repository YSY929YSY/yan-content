/**
 * 例句分词的读取层。
 *
 * 数据是 `scripts/build-example-tokens.py` 离线跑出来的(SudachiPy + SudachiDict-core,
 * 都是 Apache-2.0)。**词典 207 MB 不进包,进包的只有派生出来的读音和必要的辞书形**,当前约584.7 KB。
 *
 * ⚠️ 上架前要在「数据来源」那一屏加一条 Sudachi 的 Apache-2.0 署名,
 * 和已有的 JMdict / kanjium 并列。这条别忘 —— 署名债这个项目已经欠过一次。
 *
 * 紧凑格式(每个字段名都要付一次进包的运费,3.6 万个 token):
 *
 *     "きのこ"                  不需要注音
 *     ["美味しい","おいしい"]    需要注音
 *     ["探し","さがし","探す"]    需要辞书形
 *
 * ⚠️ **这里只存词面、读音和辞书形,不存对齐好的注音分段。**
 * 「哪几个假名压在哪个汉字上」交给 `furigana.ts` 在渲染时算 ——
 * 对齐规则只该有一份实现。烤进数据的话,以后改规则要重跑管线,
 * 而且数据里那份和代码里那份会慢慢长歪,谁也不知道以哪个为准。
 */

/** 一个词。`reading` 为空表示它本来就是假名,不用注音。 */
export type ExampleToken = {
  text: string;
  reading?: string;
  dictionaryForm?: string;
};

/** 产物里一个 token 的原始形状。 */
type RawToken = string | [string, string] | [string, string, string] | unknown;

/**
 * 整形。**任何一项都可能不是想要的形状** —— 这份 JSON 是脚本生成的,
 * 而脚本以后还会再改一次;而且内容包是远端下发的。
 */
export function normalizeTokens(raw: unknown): ExampleToken[] {
  if (!Array.isArray(raw)) return [];
  const out: ExampleToken[] = [];
  for (const t of raw as RawToken[]) {
    if (typeof t === 'string') {
      if (t) out.push({ text: t });
    } else if (Array.isArray(t) && typeof t[0] === 'string' && t[0]) {
      const reading = typeof t[1] === 'string' && t[1] ? t[1] : undefined;
      const dictionaryForm = typeof t[2] === 'string' && t[2] && t[2] !== t[0]
        ? t[2]
        : undefined;
      out.push(dictionaryForm
        ? { text: t[0], ...(reading ? { reading } : {}), dictionaryForm }
        : (reading ? { text: t[0], reading } : { text: t[0] }));
    }
    // 其它形状直接丢 —— 丢一个词好过整句渲染不出来
  }
  return out;
}

/**
 * 分词结果拼回去等不等于原句。
 *
 * ⚠️ 这是**调用方必须做的自检**,不是可选的。分词器吞字、改字、
 * 规范化标点都不会报错,只会让例句在屏幕上少一个字 —— 而日语句子少一个
 * 假名可能就是另一个意思。对不上就整句退回纯文本显示。
 *
 * (离线脚本里已经拦过一道,实测 4400 句 0 处对不上。这里再拦一道是因为
 * 那是构建时的数据,而它和代码是分开演进的。)
 */
export const tokensMatch = (tokens: readonly ExampleToken[], sentence: string) =>
  tokens.length > 0 && tokens.map((t) => t.text).join('') === String(sentence || '');
