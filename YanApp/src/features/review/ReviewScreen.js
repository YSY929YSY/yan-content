// 言 · 复习页
//
// 一次一道题,不是列表。词书页是「浏览」,这里是「被问」——
// 被问才会暴露你其实不会,浏览只会让你以为自己会。
//
// 题目来自五个地方(词库/深卡骨架/地点记忆卡/场景句/地铁句),在这里长得一样:
// 正面一个问题,点开背面,然后说实话。用户不需要知道这道题是从哪个模块来的,
// 但页脚会告诉他 —— 「三原山」这三个字出现在一道题下面,是这个产品的意义所在。
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { C } from '../../theme';
import { useSpeech, SpeakBtn } from '../../components/Speech';
import { usePrefs } from '../../lib/prefs';
import { useDailyQueue } from './useReview';
import { useReviewProgress } from './ReviewProgressContext';
import { fromWord, indexUnits, buildUnits, sourceOf } from './units';
import { buildProduceChoices, isProduceAnswer } from './produceChoices';
import { sceneWordsOf } from '../wordbank/sceneWords';

const SOURCE_LABEL = {
  word: '词库', card: '词卡', place: '足迹', scene: '场景', subway: '地铁',
};

export default function ReviewScreen({ content, onBack }) {
  const { speak, speakingKey } = useSpeech();
  const { prefs } = usePrefs();
  const { progress, ready, grade } = useReviewProgress();

  // 深内容一次建好放内存(共一百多条)。词库 8298 条按键现查,不展平。
  const deep = useMemo(() => indexUnits(buildUnits(content)), [content]);
  const wordIndex = useMemo(() => {
    const m = {};
    for (const w of content?.wordBank || []) m[`${w.word}-${w.reading}`] = w;
    return m;
  }, [content]);

  // 键 → 题目。解析不出来的键会被队列跳过 —— 内容包换版本、词被删掉时,
  // 宁可这道题不出现,也不要弹一道空白题出来。
  const resolve = (key) => {
    if (!key) return null;
    if (sourceOf(key) !== 'word') return deep[key] || null;
    const w = wordIndex[key];
    return w ? fromWord(w) : null;
  };

  const newUnits = useMemo(() => Object.values(deep), [deep]);
  const { queue, remaining, markDone, defer } = useDailyQueue({ progress, ready, resolve, newUnits });
  const sceneWords = useMemo(() => sceneWordsOf(content?.wordBank || [], 'convenience').map(w => w.word), [content]);

  const [flipped, setFlipped] = useState(false);
  const [pickedBlocks, setPickedBlocks] = useState([]);
  const currentKey = remaining?.[0] || null;
  useEffect(() => {
    setFlipped(false);
    setPickedBlocks([]);
  }, [currentKey]);

  if (!ready || !queue) {
    return (
      <View style={s.screen}>
        <Header onBack={onBack} left={null} />
        <View style={s.center}><Text style={s.dim}>正在读取进度…</Text></View>
      </View>
    );
  }

  if (!remaining.length) {
    return (
      <View style={s.screen}>
        <Header onBack={onBack} left={0} />
        <View style={s.center}>
          <Text style={s.doneBig}>今天的都过完了</Text>
          <Text style={s.dim}>明天到期的会自己出现在这里</Text>
        </View>
      </View>
    );
  }

  const key = remaining[0];
  const unit = resolve(key);
  const produce = unit?.mode === 'produce' ? buildProduceChoices(unit, sceneWords) : null;
  if (!unit) {
    // 理论上进不来(队列已经过滤过),但内容包是远端下发的,不能假设它永远自洽。
    // 跳过这一条而不是白屏。
    markDone(key);
    return null;
  }

  const onGrade = (g) => {
    grade(key, g);
    setFlipped(false);
    // 「忘了」不算做完 —— 它今天还要再见一次。挪到队尾,过几道题再问一遍。
    if (g === 'again') defer(key);
    else markDone(key);
  };

  const submitProduce = () => {
    if (!produce || produce.mode !== 'choices' || !pickedBlocks.length) return;
    const correct = isProduceAnswer(pickedBlocks, produce.correct);
    setFlipped(true);
    onGrade(correct ? 'good' : 'again');
  };

  return (
    <View style={s.screen}>
      <Header onBack={onBack} left={remaining.length} />

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <Text style={s.eyebrow}>
          {unit.mode === 'recall' ? '这个词什么意思' : '这时候该怎么说'}
        </Text>

        <Text style={unit.mode === 'recall' ? s.askWord : s.askLine}>{unit.ask}</Text>
        {!!unit.askSub && <Text style={s.askSub}>{unit.askSub}</Text>}

        {!flipped ? (
          <>
            {produce?.mode === 'choices' ? (
              <View style={s.choiceBox}>
                <Text style={s.choicePrompt}>按顺序拼出这句话</Text>
                <View style={s.choiceRow}>
                  {pickedBlocks.map((block, index) => (
                    <TouchableOpacity key={`picked-${index}-${block}`} style={s.choiceSelected} onPress={() => setPickedBlocks(pickedBlocks.filter((_, i) => i !== index))}>
                      <Text style={s.choiceText}>{block}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={s.choiceRow}>
                  {produce.choices.filter(block => !pickedBlocks.includes(block)).map((block) => (
                    <TouchableOpacity key={block} style={s.choiceBtn} onPress={() => setPickedBlocks([...pickedBlocks, block])}>
                      <Text style={s.choiceText}>{block}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={[s.submitBtn, !pickedBlocks.length && s.submitDisabled]} onPress={submitProduce} disabled={!pickedBlocks.length}>
                  <Text style={s.submitTxt}>提交</Text>
                </TouchableOpacity>
              </View>
            ) : <>
            {!!unit.hint && (
              <View style={s.hintBox}>
                <Text style={s.hintTxt}>{unit.hint}</Text>
              </View>
            )}
            <TouchableOpacity style={s.flipBtn} onPress={() => setFlipped(true)}>
              <Text style={s.flipTxt}>看答案</Text>
            </TouchableOpacity>
            <Text style={s.dimSmall}>先自己想一遍再翻 —— 想不起来本身就是有用的信息</Text>
            </>}
        ) : (
          <>
            <View style={s.answerBox}>
              {/* 朗读入口统一用「言」按钮(SpeakBtn),不用一行文字提示 ——
                  词书详情页从一开始就是这个,复习页却写成「点一下听发音」,
                  同一个动作在两个地方长得不一样,用户得重新学一次。 */}
              <View style={s.answerRow}>
                <TouchableOpacity
                  style={s.answerText}
                  onPress={() => unit.speak && speak?.(unit.speak, unit.lang, `rv-${key}`)}
                  activeOpacity={unit.speak ? 0.6 : 1}
                >
                  <Text style={s.answer}>{unit.answer}</Text>
                  {!!unit.answerSub && <Text style={s.answerSub}>{unit.answerSub}</Text>}
                  {/* 英文不是中文的备份,是中文装不下的那部分。可在「关于」里关掉。 */}
                  {prefs.showEnglish && !!unit.answerEn && (
                    <Text style={s.answerEn} numberOfLines={3}>{unit.answerEn}</Text>
                  )}
                </TouchableOpacity>
                {!!unit.speak && (
                  <SpeakBtn
                    onPress={() => speak?.(unit.speak, unit.lang, `rv-${key}`)}
                    speaking={speakingKey === `rv-${key}`}
                    size="sm"
                  />
                )}
              </View>
            </View>

            <View style={s.gradeRow}>
              <TouchableOpacity style={[s.gradeBtn, s.gAgain]} onPress={() => onGrade('again')}>
                <Text style={[s.gradeTxt, s.gradeTxtOn]}>忘了</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.gradeBtn} onPress={() => onGrade('hard')}>
                <Text style={s.gradeTxt}>一般</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.gradeBtn, s.gGood]} onPress={() => onGrade('good')}>
                <Text style={[s.gradeTxt, s.gradeTxtOn]}>会了</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {!!unit.origin && (
          <Text style={s.origin}>
            {SOURCE_LABEL[sourceOf(key)] || ''} · {unit.origin}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function Header({ onBack, left }) {
  return (
    <View style={s.hd}>
      <TouchableOpacity onPress={onBack}>
        <Text style={s.back}>‹ 返回</Text>
      </TouchableOpacity>
      <View style={s.hdRow}>
        <Text style={s.title}>今日复习</Text>
        {left != null && <Text style={s.left}>还剩 {left}</Text>}
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
  left: { fontSize: 12, color: C.muted },
  body: { padding: 20, gap: 12, alignItems: 'center', paddingTop: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  eyebrow: { fontSize: 11, color: C.mutedLight, fontWeight: '600', letterSpacing: 1 },
  // 词只有几个字,给它足够大的字号让它独占视线;句子会换行,大字号会挤成一团
  askWord: { fontSize: 40, fontWeight: '700', color: C.ink, textAlign: 'center' },
  askLine: { fontSize: 20, fontWeight: '600', color: C.ink, textAlign: 'center', lineHeight: 30 },
  askSub: { fontSize: 13, color: C.muted },
  hintBox: {
    backgroundColor: C.tag, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, marginTop: 8,
  },
  hintTxt: { fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 19 },
  flipBtn: {
    marginTop: 18, backgroundColor: C.ink, borderRadius: 8,
    paddingHorizontal: 40, paddingVertical: 13,
  },
  flipTxt: { fontSize: 15, fontWeight: '700', color: C.white },
  answerBox: {
    marginTop: 10, backgroundColor: C.white, borderRadius: 10, borderWidth: 1,
    borderColor: C.border, paddingHorizontal: 20, paddingVertical: 18,
    alignItems: 'center', gap: 5, alignSelf: 'stretch',
  },
  answer: { fontSize: 24, fontWeight: '700', color: C.ink, textAlign: 'center', lineHeight: 34 },
  answerSub: { fontSize: 13, color: C.muted, textAlign: 'center' },
  answerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch' },
  answerText: { flex: 1 },
  answerEn: { fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 17 },
  gradeRow: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 18 },
  gradeBtn: {
    flex: 1, borderRadius: 8, paddingVertical: 13, alignItems: 'center',
    borderWidth: 1, borderColor: C.border, backgroundColor: C.white,
  },
  gAgain: { backgroundColor: C.lava, borderColor: C.lava },
  gGood: { backgroundColor: C.ink, borderColor: C.ink },
  gradeTxt: { fontSize: 14, fontWeight: '700', color: C.muted },
  gradeTxtOn: { color: C.white },
  // 「三原山」出现在一道题下面,是这个产品和词库 App 的分界线,别把它做小到看不见
  origin: { fontSize: 11, color: C.mutedLight, marginTop: 24 },
  doneBig: { fontSize: 17, fontWeight: '700', color: C.ink },
  dim: { fontSize: 13, color: C.muted, textAlign: 'center' },
  dimSmall: { fontSize: 11, color: C.mutedLight, textAlign: 'center', marginTop: 10 },
  choiceBox: { alignSelf: 'stretch', gap: 12, marginTop: 12 },
  choicePrompt: { fontSize: 13, color: C.muted, textAlign: 'center' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'center', minHeight: 34 },
  choiceBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 8, backgroundColor: C.white, paddingHorizontal: 10, paddingVertical: 8 },
  choiceSelected: { borderWidth: 1, borderColor: C.lava, borderRadius: 8, backgroundColor: C.tag, paddingHorizontal: 10, paddingVertical: 8 },
  choiceText: { fontSize: 14, color: C.ink },
  submitBtn: { alignSelf: 'center', backgroundColor: C.ink, borderRadius: 8, paddingHorizontal: 28, paddingVertical: 10 },
  submitDisabled: { opacity: 0.4 },
  submitTxt: { color: C.white, fontWeight: '700' },
});
