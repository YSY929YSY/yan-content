// 言 · 今日批次
//
// ─────────────────────────────────────────────────────────
// 这一页补的是主线上唯一断掉的那一节。
//
// dailyTask.ts 早就把「今天学哪 6 个」算出来了(还做了同读音/同写法去重),
// 但首页那个按钮点下去是 `setSubTab('wordbank')` —— 落地在**词书货架**上。
// 于是真实路径长这样:
//
//     首页「6 个你已经认识的汉字词 · 私 行く 何 言う 人 見る」
//       ↓ 点「开始」
//     选一本词书            ← 又要自己挑
//       ↓
//     N5 整本词表           ← 那 6 个词消失了
//
// **卡上承诺了一个批次,点进去交付的是一个货架。** 规则层挑好的结果
// 一个都没到达用户,主线在这里断成两截。这一页就是那个承接。
//
// ## 为什么不复用复习页
//
// 复习页问的是「这个词什么意思」(recall)。而主线池是 563 条 kanji_anchor ——
// **意思正是用户唯一不缺的东西**,他看着汉字就懂。反过来问他意思,
// 等于把这个产品最强的那张牌当题目发出去。
//
// 这一页问的是读音,而且顺序照决策记录 A6 的三拍:
//
//     看懂了(给词 + 给中文义)→ 一个音都没听出来(自己先猜)→ 这就是言要补的(读音 + 声调 + 朗读)
//
// 所以正面**白给中文释义**,不是漏了遮罩。
// ─────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { C } from '../../theme';
import { useSpeech, SpeakBtn } from '../../components/Speech';
import { usePrefs } from '../../lib/prefs';
import { useReviewProgress } from '../review/ReviewProgressContext';
import { PitchLine, pitchOf, hasMultiAccent } from '../wordbank/PitchLine';
import { Furigana } from '../wordbank/FuriganaText';
import { ExampleSentence } from '../wordbank/ExampleSentence';
import EXAMPLE_TOKENS from '../../../assets/example_tokens.json';
import { wordKey, todayStats } from './dailyTask';
import { todayStr, addDays } from '../wordbank/srs';

/**
 * @param words   这一批要学的词。**调用方传进来的快照,这一页不重算。**
 *
 *   ⚠️ 不重算是有意的。pickBatch 的输入里有 progress,而这一页每评一个分
 *   progress 就变一次 —— 就地重算的话,用户答完第一个词,后面五个会当场换人。
 *   复习队列(useDailyQueue)冻结队列是同一个理由。
 *
 *   ⚠️ 也**不落盘**。杀 App 重开后 dailyTask 会重新算一批:已经评过分的词
 *   `seen()` 为真会被跳过,剩下的自然补齐 —— 不需要新开一个存储键。
 *   每多一个键就多一处「读失败当成空的」的风险面(见 writeGuard.ts),
 *   而这里不开也能对。
 *
 * @param onBack  返回
 * @param onDone  这一批过完了、用户点「回首页」
 */
export default function LearnBatchScreen({ words, pool, onBack, onDone }) {
  const { speak, speakingKey } = useSpeech();
  const { prefs } = usePrefs();
  const { grade, progress } = useReviewProgress();

  // 今天走到哪了。**用主线池算,不是用整份进度** ——
  // 复习进度是全局的,深卡/地点/场景句都在同一份 map 里(见 useReview.js)。
  const stats = useMemo(
    () => todayStats(pool || words || [], progress || {}, todayStr(), addDays(todayStr(), 1)),
    [pool, words, progress],
  );

  // 队列只存键,词本身按键现查 —— 和复习页一个口径
  const index = useMemo(() => {
    const m = {};
    for (const w of words || []) m[wordKey(w)] = w;
    return m;
  }, [words]);

  const [queue, setQueue] = useState(() => (words || []).map(wordKey));
  const [done, setDone] = useState([]);
  const [flipped, setFlipped] = useState(false);

  const remaining = queue.filter(k => !done.includes(k));
  const total = queue.length;

  if (!total) {
    // 理论上进不来(首页只在 kind === 'learn' 时才给这个入口),但内容包是
    // 远端下发的,不能假设它永远自洽。给一句话而不是白屏。
    return (
      <View style={s.screen}>
        <Header onBack={onBack} left={null} total={0} />
        <View style={s.center}><Text style={s.dim}>这一批是空的</Text></View>
      </View>
    );
  }

  if (!remaining.length) {
    return (
      <View style={s.screen}>
        <Header onBack={onBack} left={0} total={total} />
        <View style={s.center}>
          <Text style={s.doneBig}>这 {total} 个过完了</Text>
          {/* ⚠️ 这里原本是一句笼统的「它们进了复习队列,到期会自己出现」。
              真机上走一遍就知道那句话不够:学完之后首页立刻换一批新的,
              「今天该复习」还是 0 —— 用户唯一收到的信号是「还有更多」,
              **没有任何地方告诉他今天做成了什么、什么时候回来**。
              于是要么停不下来,要么随便一停,两种都不知道自己在哪儿。
              现在给真数字。 */}
          <Text style={s.dim}>
            今天一共过了 {stats.touched} 个
            {stats.comingBack > 0 ? ` · 明天有 ${stats.comingBack} 个回来` : ''}
          </Text>
          <TouchableOpacity style={s.doneBtn} onPress={onDone}>
            <Text style={s.doneTxt}>回首页</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const key = remaining[0];
  const w = index[key];
  if (!w) {
    // 解析不出来的键跳过,不弹一张空白卡
    setDone(d => [...d, key]);
    return null;
  }

  const accent = pitchOf(w);
  const speakKey = `lb-${key}`;

  /**
   * ⚠️ 朗读喂的是 `reading`,不是 `word`。
   *
   * TTS 拿到汉字要自己选读音,而这一页教的恰恰是**某一个指定的读音**。
   * 池子里 `私` 有两条(わたし / わたくし),`今日` 之类的更是常被读成别的型 ——
   * 用户刚被告知「读 わたくし」,按下喇叭听见 わたし,他没有第三个地方可以核对。
   * 假名是我们唯一能保证读出来就是卡上那个音的输入。
   */
  const say = () => speak?.(w.reading, 'ja-JP', speakKey);

  const onGrade = (g) => {
    grade(key, g);
    setFlipped(false);
    if (g === 'again') {
      // 「忘了」的词今天还要再见一次。留在原位的话点完立刻又弹回来 ——
      // 那不是学习,是罚站。挪到队尾,隔几个词再问一遍。
      setQueue(q => [...q.filter(k => k !== key), key]);
    } else {
      setDone(d => [...d, key]);
    }
  };

  return (
    <View style={s.screen}>
      <Header onBack={onBack} left={remaining.length} total={total} />

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {/* 第一拍:你看得懂。这句话是这个产品的底牌,要明说出来 */}
        <Text style={s.eyebrow}>这个词你已经认识</Text>

        <Text style={s.word}>{w.word}</Text>
        {!!w.meaning_zh && <Text style={s.meaning}>{w.meaning_zh}</Text>}

        {!flipped ? (
          <>
            {/* 第二拍:那你会读吗。**先让他自己试**,不能直接把读音摊开 ——
                「以为自己会」和「真的会」的差别就在这一下 */}
            <View style={s.gapBox}>
              <Text style={s.gapTxt}>那它怎么读?先自己念一遍</Text>
            </View>
            <TouchableOpacity style={s.flipBtn} onPress={() => setFlipped(true)}>
              <Text style={s.flipTxt}>看读音</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* 第三拍:这就是言要补的那一层 */}
            <View style={s.answerBox}>
              <View style={s.answerRow}>
                <TouchableOpacity
                  style={s.answerText}
                  onPress={say}
                  activeOpacity={0.6}
                >
                  {/* 假名压在对应的汉字上 —— 这一页教的就是「这个字读什么」,
                      把读音单独摆一行,用户还得自己在心里做一次对应。
                      `行く` 上面标一个 `い`,那一下才是这一页的意义。
                      对不上的词会退回纯读音显示(见 furigana.ts,不瞎标)。 */}
                  <Furigana word={w.word} reading={w.reading} size={26} color={C.lava} />
                  {accent != null && <PitchLine reading={w.reading} accent={accent} />}
                  {/* 多型词要标出来。「取第一个」这条规则无源可核 ——
                      不标的话用户会把一个可能不对的型当成唯一答案背下去 */}
                  {hasMultiAccent(w) && (
                    <Text style={s.multi}>这个词不止一个调型,这里显示的是其中一个</Text>
                  )}
                </TouchableOpacity>
                <SpeakBtn
                  onPress={say}
                  speaking={speakingKey === speakKey}
                  size="sm"
                />
              </View>

              {/* 英文不是中文的备份,是中文装不下的那部分。可在「关于」里关掉。 */}
              {prefs.showEnglish && !!w.meaning_en && (
                <Text style={s.en} numberOfLines={2}>{w.meaning_en}</Text>
              )}
            </View>

            {!!w.exampleJp && (
              <TouchableOpacity
                style={s.exBox}
                onPress={() => speak?.(w.exampleJp, 'ja-JP', `${speakKey}-ex`)}
                activeOpacity={0.6}
              >
                {/* 例句也按词切开、汉字上注音 —— 对还不会读的人,
                    一整行纯文本既看不出词边界也不知道汉字读什么。
                    分词是离线跑好的(运行时不跑分词器),
                    拼不回原句时整句退回纯文本(见 ExampleSentence)。 */}
                <ExampleSentence
                  sentence={w.exampleJp}
                  tokens={EXAMPLE_TOKENS[w.id]}
                  size={15}
                />
                {!!w.exampleZh && <Text style={s.exZh}>{w.exampleZh}</Text>}
              </TouchableOpacity>
            )}

            {/* 评的是读音记住了没,不是意思 —— 文案要说清楚,
                否则用户会按「这个词我懂啊」来评,SRS 收到的就是一份假数据 */}
            <Text style={s.askGrade}>刚才读对了吗?</Text>
            <View style={s.gradeRow}>
              <TouchableOpacity style={[s.gradeBtn, s.gAgain]} onPress={() => onGrade('again')}>
                <Text style={[s.gradeTxt, s.gradeTxtOn]}>没读出来</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.gradeBtn} onPress={() => onGrade('hard')}>
                <Text style={s.gradeTxt}>差一点</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.gradeBtn, s.gGood]} onPress={() => onGrade('good')}>
                <Text style={[s.gradeTxt, s.gradeTxtOn]}>读对了</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Header({ onBack, left, total }) {
  return (
    <View style={s.hd}>
      <TouchableOpacity onPress={onBack}>
        <Text style={s.back}>‹ 返回</Text>
      </TouchableOpacity>
      <View style={s.hdRow}>
        <Text style={s.title}>今天这一批</Text>
        {left != null && total > 0 && <Text style={s.left}>还剩 {left} / {total}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.paper },
  hd: {
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: C.border, gap: 4,
  },
  back: { fontSize: 13, color: C.lava, fontWeight: '600' },
  hdRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '700', color: C.ink },
  left: { fontSize: 12, color: C.muted, fontVariant: ['tabular-nums'] },
  body: { padding: 20, gap: 10, alignItems: 'center', paddingTop: 36 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  eyebrow: { fontSize: 11, color: C.mutedLight, fontWeight: '600', letterSpacing: 1 },
  // 汉字要够大 —— 「我看得懂」这一拍全靠这个字本身,它得独占视线
  word: { fontSize: 52, fontWeight: '700', color: C.ink, textAlign: 'center', marginTop: 4 },
  meaning: { fontSize: 15, color: C.muted, textAlign: 'center' },
  gapBox: {
    backgroundColor: C.tag, borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 11, marginTop: 20,
  },
  gapTxt: { fontSize: 12.5, color: C.muted, textAlign: 'center' },
  flipBtn: {
    marginTop: 14, backgroundColor: C.ink, borderRadius: 8,
    paddingHorizontal: 40, paddingVertical: 13,
  },
  flipTxt: { fontSize: 15, fontWeight: '700', color: C.white },
  answerBox: {
    marginTop: 16, backgroundColor: C.white, borderRadius: 10, borderWidth: 1,
    borderColor: C.border, paddingHorizontal: 20, paddingVertical: 18,
    alignSelf: 'stretch', gap: 6,
  },
  answerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  answerText: { flex: 1 },
  // 读音那一行现在由 Furigana 组件自己排(要分列才能把假名压在字上),
  // 这里不再需要样式 —— 留个空位说明它去哪了,免得下一个人以为漏了
  multi: { fontSize: 10.5, color: C.mutedLight, marginTop: 6, lineHeight: 15 },
  en: { fontSize: 12, color: C.muted, lineHeight: 17 },
  exBox: {
    marginTop: 10, alignSelf: 'stretch', backgroundColor: C.paperLight,
    borderRadius: 8, borderWidth: 1, borderColor: C.borderSoft,
    paddingHorizontal: 16, paddingVertical: 13, gap: 4,
  },
  // 例句正文由 ExampleSentence 自己排(要分列才能按词切开+注音)
  exZh: { fontSize: 12, color: C.muted, lineHeight: 18 },
  askGrade: { fontSize: 11.5, color: C.mutedLight, marginTop: 20 },
  gradeRow: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 8 },
  gradeBtn: {
    flex: 1, borderRadius: 8, paddingVertical: 13, alignItems: 'center',
    borderWidth: 1, borderColor: C.border, backgroundColor: C.white,
  },
  gAgain: { backgroundColor: C.lava, borderColor: C.lava },
  gGood: { backgroundColor: C.ink, borderColor: C.ink },
  gradeTxt: { fontSize: 13, fontWeight: '700', color: C.muted },
  gradeTxtOn: { color: C.white },
  doneBig: { fontSize: 17, fontWeight: '700', color: C.ink },
  dim: { fontSize: 13, color: C.muted, textAlign: 'center' },
  doneBtn: {
    marginTop: 12, backgroundColor: C.ink, borderRadius: 8,
    paddingHorizontal: 32, paddingVertical: 12,
  },
  doneTxt: { fontSize: 14, fontWeight: '700', color: C.white },
});
