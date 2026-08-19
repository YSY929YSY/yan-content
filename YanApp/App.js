/**
 * 言 YAN · App.js  v9
 * ─────────────────────────────────────────────
 * 变更：
 * - Tab 栏重设计：首页 / 丿（学习+地铁）/ 捺（世界打卡）
 * - TTS(⚠️ iOS 静音键问题**未修复**,详见 src/components/Speech.js 的注释)
 * - 丿捺=人，产品哲学嵌入导航结构
 * ─────────────────────────────────────────────
 */
const CONTENT_URL = 'https://raw.githubusercontent.com/YSY929YSY/yan-content/main/content.v2.json';
// 隐私政策:App Store Connect 提交时也要填同一个地址
const PRIVACY_URL = 'https://ysy929ysy.github.io/yan-content/privacy.html';
const SHOULD_FETCH_REMOTE_CONTENT = typeof __DEV__ === 'undefined' ? true : !__DEV__;

import { ensureUser, signInWithApple, signOut, deleteAccount } from './src/lib/supabase';
import { backfillAll, pendingBackfill } from './src/lib/sync';
import { K, auditKeys, readJson, writeJson } from './src/lib/storage';
import { DAILY_GOAL, todayStr, pickSession } from './src/features/wordbank/srs';
import { useWorldFootprint } from './src/features/world/useWorldFootprint';
import KanaScreen from './src/features/kana/KanaScreen';
import ReviewScreen from './src/features/review/ReviewScreen';
import LearnBatchScreen from './src/features/learn/LearnBatchScreen';
import { KanaProgressProvider } from './src/features/kana/KanaProgressContext';
import { useKanaGate } from './src/features/kana/useKanaGate';
import {
  ReviewProgressProvider, useReviewProgress,
} from './src/features/review/ReviewProgressContext';
import { bonusOf } from './src/features/world/record';
import { useHomeSummary } from './src/features/home/useHomeSummary';
import * as AppleAuthentication from 'expo-apple-authentication';


import fallbackContent from './assets/content.fallback.json';
import { fetchContent } from './src/lib/contentCache';
import { searchPlace, searchPlaceDetailed } from './src/lib/geocode';
import WorldMap from './src/features/world/WorldMap';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { C } from './src/theme';
import { useSpeech, SpeakBtn } from './src/components/Speech';
import TripNotebook from './src/features/travel/TripNotebook';
// 手账预演。只在 __DEV__ 里挂,生产包里那个入口整段不渲染。
import JournalScreen from './src/features/journal/JournalScreen';
import {
  nextTask, taskLabel, poolProgress, anchorPool, wordKey as poolWordKey,
} from './src/features/learn/dailyTask';
import { usePrefs } from './src/lib/prefs';
// 词场预览:内容还在 staging 没并进内容包,开发期先从这份草稿读,方便边写边看。
// 合并进 content.v2.json 之后这份和它的引用一起删。
import WORDFIELD_PREVIEW from './src/features/wordbank/wordfield-preview.json';
import { PitchLine, pitchOf, hasMultiAccent, pitchUnconfirmed } from './src/features/wordbank/PitchLine';
import { SenseList } from './src/features/wordbank/SenseList';
import { Furigana } from './src/features/wordbank/FuriganaText';
import { ExampleSentence } from './src/features/wordbank/ExampleSentence';
import EXAMPLE_TOKENS from './assets/example_tokens.json';
import { primaryReading, altReadings } from './src/features/wordbank/furigana';
import {
  ActivityIndicator, Alert, Animated, Dimensions, FlatList, Image, Keyboard,
  KeyboardAvoidingView, Modal,
  Platform, Pressable, SafeAreaView, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View,
  Linking,
} from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

const { width: SW } = Dimensions.get('window');
// 键值统一在 src/lib/storage.js 登记 —— 这里只做别名,不再手写字符串。
// 世界足迹那几个键已经全部收进 useWorldFootprint,不再出现在 App.js。
const SUBWAY_PROGRESS_KEY = K.subwayProgress;
// 补传失败时说人话:用户不认识 checkins/userPlaces 这种域名
const BACKFILL_LABEL = {
  progress: '单词进度',
  checkins: '打卡记录',
  userPlaces: '自定义地点',
  notebook: '旅行本',
};
const showComingSoonAlert = () => {
  Alert.alert(
    '即将开放',
    '这个模块会在后续版本上线。V1 可以先从旅行速成、五十音和地铁冒险开始。',
    [{ text: '知道了' }]
  );
};
const showRouteComingSoonAlert = () => {
  Alert.alert(
    '即将开放',
    '这个路线会在后续版本上线。V1 可以先从旅行速成开始。',
    [{ text: '知道了' }]
  );
};
const showWanderComingSoonAlert = () => {
  Alert.alert(
    '即将开放',
    '漫游模式会从地点、词句和记忆卡自由进入学习。V1 可以先使用轨道模式。',
    [{ text: '知道了' }]
  );
};


const HOOK_STYLES = {
  d:{ bg:'#e6f4ea', text:'#1a7a3a', label:'汉字直读', emoji:'✅' },
  t:{ bg:'#fde8e0', text:'#c0391a', label:'陷阱字', emoji:'⚠️' },
  e:{ bg:'#e8eef8', text:'#2a4a8a', label:'英语跳板', emoji:'🌉' },
  r:{ bg:'#f0e8ff', text:'#6a3a9a', label:'拉丁词根', emoji:'🌿' },
  s:{ bg:'#fff0e8', text:'#c05010', label:'故事记忆', emoji:'📖' },
};

const MAP_TYPES = [
  { id:'all', label:'全部', emoji:'🌍' },
  { id:'volcano', label:'火山', emoji:'🌋' },
  { id:'snow', label:'雪山', emoji:'🏔' },
  { id:'water', label:'河湖', emoji:'🌊' },
  { id:'cafe', label:'咖啡', emoji:'☕' },
];

// ─────────────────────────────────────────────
// Content loader
// ─────────────────────────────────────────────
function useContent() {
  const [content, setContent] = useState(fallbackContent);
  const [loading, setLoading] = useState(!fallbackContent);
  const [error, setError] = useState(false);
  const load = async () => {
    if (!content) setLoading(true);
    setError(false);
    if (!SHOULD_FETCH_REMOTE_CONTENT) {
      setLoading(false);
      return;
    }
    // 带 ETag 条件请求:内容没变时服务端回 304、下载 0 字节,
    // 不再每次冷启动全量拉 6MB。取不到就退回缓存,再退回内置 fallback。
    const { content: next, source, error: err } = await fetchContent(CONTENT_URL);
    if (next) {
      setContent(next);
      setError(false);
    } else {
      console.warn('[Content] using bundled fallback:', err);
      setError(true);
    }
    if (__DEV__) console.log('[Content] source =', source);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  return { content, loading, error, reload: load };
}

function JlptBadge({ level }) {
  if (!level) return null;
  const map = {
    N5:['#e8f4ea','#2a7a3a'],
    N4:['#e8eef8','#2a4a8a'],
    N3:['#f0e8ff','#6a3a9a'],
    N2:['#fff0e0','#c07020'],
    N1:['#fde8e0','#b0301a']
  };
  const [bg, fg] = map[level] || [C.tag,'#888'];
  return (
    <View style={[jb.b, { backgroundColor: bg }]}>
      <Text style={[jb.t, { color: fg }]}>{level}</Text>
    </View>
  );
}
const jb = StyleSheet.create({
  b:{ borderRadius:7, paddingHorizontal:6, paddingVertical:2 },
  t:{ fontSize:10, fontWeight:'800', letterSpacing:0.5 }
});

function LangLink({ links }) {
  if (!links || !links.length) return null;
  const m = {
    ES:['#fce0e8','#9a2040','西语'],
    EN:['#e0e8ff','#2040a0','英语'],
    JP:[C.lavaLight,'#c04010','日语'],
    ZH:['#e8f4e0','#2a6020','中文']
  };
  return (
    <View style={ll.row}>
      {links.map((l, i) => {
        const [bg, fg, langName] = m[l.lang] || [C.tag,'#888',l.lang];
        return (
          <View key={i} style={[ll.chip, { backgroundColor: bg }]}>
            <Text style={[ll.lang, { color: fg }]}>{l.lang}</Text>
            <Text style={[ll.langName, { color: fg }]}>{langName}</Text>
            <View style={[ll.divider, { backgroundColor: fg + '40' }]} />
            <Text style={[ll.word, { color: fg }]}>{l.word}</Text>
          </View>
        );
      })}
    </View>
  );
}
const ll = StyleSheet.create({
  row:{ flexDirection:'row', flexWrap:'wrap', gap:6, marginTop:8 },
  chip:{ flexDirection:'row', alignItems:'center', borderRadius:10, paddingHorizontal:8, paddingVertical:5, gap:3 },
  lang:{ fontSize:9, fontWeight:'800' },
  langName:{ fontSize:8, fontWeight:'500', opacity:0.7 },
  divider:{ width:1, height:10, marginHorizontal:2 },
  word:{ fontSize:11, fontWeight:'600' },
});

function AnimatedHook({ hookStyle, hookTxt }) {
  const bounce = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 180,
        useNativeDriver: true
      }),
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: -6,
          duration: 120,
          useNativeDriver: true
        }),
        Animated.spring(bounce, {
          toValue: 0,
          friction: 4,
          tension: 200,
          useNativeDriver: true
        }),
      ]),
    ]).start();
  }, [hookTxt]);

  return (
    <Animated.View style={[hk.card, { transform:[{ scale: scaleAnim }, { translateY: bounce }] }]}>
      <View style={hk.hd}>
        <View style={[hk.badge, { backgroundColor: hookStyle.bg }]}>
          <Text style={hk.badgeEmoji}>{hookStyle.emoji}</Text>
          <Text style={[hk.badgeTxt, { color: hookStyle.text }]}>{hookStyle.label}</Text>
        </View>
        <Text style={hk.title}>记忆钩子</Text>
      </View>
      <Text style={hk.txt}>{hookTxt}</Text>
    </Animated.View>
  );
}
const hk = StyleSheet.create({
  card:{ backgroundColor:'#fffbf0', borderRadius:16, padding:18, marginBottom:12, borderWidth:1.5, borderColor:'#f0e0b0' },
  hd:{ flexDirection:'row', alignItems:'center', gap:10, marginBottom:10 },
  badge:{ flexDirection:'row', alignItems:'center', gap:4, borderRadius:10, paddingHorizontal:9, paddingVertical:4 },
  badgeEmoji:{ fontSize:12 },
  badgeTxt:{ fontSize:10, fontWeight:'800' },
  title:{ fontSize:11, fontWeight:'600', color:C.goldInk },
  txt:{ fontSize:14, color:'#3a2a08', lineHeight:22 },
});
// ─────────────────────────────────────────────
// Loading / Error
// ─────────────────────────────────────────────
function LoadingScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <Text style={{ fontSize: 56, color: C.white, fontWeight: '200', letterSpacing: 10 }}>言</Text>
      <ActivityIndicator color={C.lava} size="large" />
      <Text style={{ fontSize: 11, color: '#3a3a5a', letterSpacing: 2 }}>加载内容中…</Text>
    </View>
  );
}
function ErrorScreen({ onRetry }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
      <Text style={{ fontSize: 40 }}>🌋</Text>
      <Text style={{ fontSize: 16, fontWeight: '600', color: C.ink, textAlign: 'center' }}>无法连接到内容服务器</Text>
      <Text style={{ fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20 }}>检查网络连接，或确认 CONTENT_URL 已正确设置。</Text>
      <TouchableOpacity style={{ backgroundColor: C.lava, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 }} onPress={onRetry}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: C.white }}>重新加载</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────
// Splash
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// Splash — 一撇一捺写人生入场动画
// 丿出现 → 八字还没一撇 → 丶落下 → 合成人 → 言 → 出发！
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// Splash — 笔画流动动画（自然连续，无停顿感）
// 丿划出 → 丶落入 → 合成人 → 化为言 → 一撇一捺写人生
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// Splash — 水墨入场（单一 progress，无停顿）
// 丿划入 → 丶落入 → 两笔同时晕化为「言」
// ─────────────────────────────────────────────
function SplashScreen({ onEnter }) {
  const phase = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0.75)).current;

  useEffect(() => {
    Animated.timing(phase, {
      toValue: 1,
      duration: 5200,
      useNativeDriver: true,
    }).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1, duration: 1800, useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 0.75, duration: 1800, useNativeDriver: true }),
        ])
      ).start();
    });
  }, []);

  const qOp = phase.interpolate({
    inputRange: [0, 0.08, 0.22, 0.3],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });

  const yesOp = phase.interpolate({
    inputRange: [0.18, 0.28, 0.42, 0.5],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });

  const sub1Op = phase.interpolate({
  inputRange: [0.3, 0.38, 0.5, 0.58],
  outputRange: [0, 1, 1, 0],
  extrapolate: 'clamp',
});

  const pieOp = phase.interpolate({
    inputRange: [0.42, 0.5, 0.62, 0.72],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });

  const pieX = phase.interpolate({
    inputRange: [0.42, 0.54],
    outputRange: [-26, 0],
    extrapolate: 'clamp',
  });

  const pieY = phase.interpolate({
    inputRange: [0.42, 0.54],
    outputRange: [-10, 0],
    extrapolate: 'clamp',
  });

  const pieScale = phase.interpolate({
    inputRange: [0.42, 0.54, 0.72],
    outputRange: [1.18, 1, 0.96],
    extrapolate: 'clamp',
  });

  const dianOp = phase.interpolate({
    inputRange: [0.5, 0.58, 0.7, 0.78],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });

  const dianX = phase.interpolate({
    inputRange: [0.5, 0.62],
    outputRange: [24, 0],
    extrapolate: 'clamp',
  });

  const dianY = phase.interpolate({
    inputRange: [0.5, 0.62],
    outputRange: [-18, 0],
    extrapolate: 'clamp',
  });

  const dianScale = phase.interpolate({
    inputRange: [0.5, 0.62, 0.78],
    outputRange: [1.18, 1, 0.96],
    extrapolate: 'clamp',
  });

  const renOp = phase.interpolate({
    inputRange: [0.66, 0.76, 0.84, 0.9],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });

  const renScale = phase.interpolate({
    inputRange: [0.66, 0.76],
    outputRange: [0.9, 1],
    extrapolate: 'clamp',
  });

  const yanOp = phase.interpolate({
    inputRange: [0.84, 0.94],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const yanScale = phase.interpolate({
    inputRange: [0.84, 0.94],
    outputRange: [0.92, 1],
    extrapolate: 'clamp',
  });

  const monoOp = phase.interpolate({
    inputRange: [0.9, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <Pressable style={sp.screen} onPress={onEnter}>
      <View style={sp.lavaWrap}>
        <View style={sp.wave1} />
        <View style={sp.wave2} />
      </View>

      <View style={sp.stage} pointerEvents="none">
        <Animated.Text style={[sp.sysTxt, { opacity: qOp }]}>
          Can you hear me?
        </Animated.Text>

        <Animated.Text style={[sp.sysReply, { opacity: yesOp }]}>
          Yes.
        </Animated.Text>
        <Animated.Text style={[sp.sub1, { opacity: sub1Op }]}>
          八字还没一撇……
          </Animated.Text>

        <Animated.Text
          style={[
            sp.brushGlyph,
            sp.piePos,
            {
              opacity: pieOp,
              transform: [
                { translateX: pieX },
                { translateY: pieY },
                { scale: pieScale },
                { rotate: '-8deg' },
              ],
            },
          ]}
        >
          丿
        </Animated.Text>

        <Animated.Text
          style={[
            sp.brushGlyph,
            sp.dianPos,
            {
              opacity: dianOp,
              transform: [
                { translateX: dianX },
                { translateY: dianY },
                { scale: dianScale },
                { rotate: '10deg' },
              ],
            },
          ]}
        >
          丶
        </Animated.Text>

        <Animated.Text
          style={[
            sp.renGlyph,
            {
              opacity: renOp,
              transform: [{ scale: renScale }],
            },
          ]}
        >
          人
        </Animated.Text>

        <Animated.View
          style={[
            sp.center,
            {
              opacity: yanOp,
              transform: [{ scale: yanScale }],
            },
          ]}
        >
          <Text style={sp.yanBig}>言</Text>
          <Animated.Text style={[sp.mono, { opacity: monoOp }]}>
            YAN · THE LANGUAGE OF EARTH
          </Animated.Text>
        </Animated.View>
      </View>

      <Animated.Text style={[sp.tagline, { opacity: monoOp }]}>
        一撇一捺写人生
      </Animated.Text>

      <Animated.View style={[sp.tapHint, { opacity: breathe }]} />
    </Pressable>
  );
}
const sp = StyleSheet.create({
  screen:{ flex:1, backgroundColor:C.ink, alignItems:'center', justifyContent:'center' },
  lavaWrap:{ position:'absolute', bottom:0, left:0, right:0, height:180, overflow:'hidden' },
  wave1:{ position:'absolute', bottom:0, left:-SW*0.1, right:-SW*0.1, height:100, backgroundColor:C.lava, opacity:0.15, borderTopLeftRadius:SW, borderTopRightRadius:SW*0.5 },
  wave2:{ position:'absolute', bottom:0, left:-SW*0.2, right:-SW*0.15, height:60, backgroundColor:C.lava, opacity:0.25, borderTopLeftRadius:SW*0.4, borderTopRightRadius:SW },
  stage:{ position:'absolute', top:0, left:0, right:0, bottom:0, alignItems:'center', justifyContent:'center' },
  piePos:{ left:SW * 0.28, top:'37%' },
  dianPos:{ right:SW * 0.3, top:'35%' },
  sub1:{
  position:'absolute',
  top:'44%',
  fontSize:11,
  color:'#3a3a55',
  letterSpacing:2,
  fontStyle:'italic',
},
  center:{
  alignItems:'center',
  justifyContent:'center',
  zIndex:2,
},yanBig:{
  fontSize:104,
  color:C.white,
  fontWeight:'200',
  letterSpacing:14,
  lineHeight:116,
},
  mono:{
  fontSize:9,
  color:'#4a4a68',
  letterSpacing:4,
  marginTop:8,
},
  tagline:{ position:'absolute', bottom:88, fontSize:12, color:'#3a3a55', letterSpacing:2.5 },
  tapHint:{ position:'absolute', bottom:0, left:'25%', right:'25%', height:2, backgroundColor:C.lava, borderRadius:1 },
  sysTxt:{
  position:'absolute',
  top:'30%',
  fontSize:22,
  color:C.white,
  fontWeight:'300',
  letterSpacing:0.5,
},

sysReply:{
  position:'absolute',
  top:'37%',
  fontSize:20,
  color:C.lava,
  fontWeight:'600',
  letterSpacing:1,
},

brushGlyph:{
  position:'absolute',
  fontSize:92,
  color:C.lava,
  fontWeight:'200',
  opacity:0.95,
},

renGlyph:{
  position:'absolute',
  fontSize:96,
  color:C.white,
  fontWeight:'200',
  top:'35%',
  lineHeight:106,
},
});


// ─────────────────────────────────────────────
// Welcome Screen — Apple 登录 / 跳过
// ─────────────────────────────────────────────
function WelcomeScreen({ onAppleLogin, onSkip }) {
  const [appleAvail, setAppleAvail] = useState(false);
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAvail).catch(() => {});
    }
    Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  return (
    <View style={ws.screen}>
      <StatusBar barStyle="light-content" backgroundColor={C.ink} />
      <Animated.View style={[ws.content, { opacity: fadeIn }]}>
        <Text style={ws.yanBig}>言</Text>
        <Text style={ws.mono}>YAN</Text>
        <View style={ws.card}>
          <Text style={ws.title}>登录后进度跨设备</Text>
          {/* 这句以前写着「旅行本和分账留在本机」,而 tripBackup.js 的 pushNotebook /
              pullNotebook 早就在同步了 —— 文案落后于实现,等于在劝用户别往旅行本里记东西。
              照片是真的不传(本机 uri 换机就失效),所以单独说清楚。 */}
          <Text style={ws.sub}>学习进度、打卡和旅行本都会同步;照片留在本机</Text>
          {appleAvail && Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={8}
              style={{ width: '100%', height: 48, marginTop: 16 }}
              onPress={onAppleLogin}
            />
          )}
        </View>
        <TouchableOpacity style={ws.skipBtn} onPress={onSkip}>
          <Text style={ws.skipTxt}>先逛逛</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}
const ws = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', width: '100%', paddingHorizontal: 40 },
  yanBig: { fontSize: 72, color: C.white, fontWeight: '200', letterSpacing: 10, marginBottom: 4 },
  mono: { fontSize: 11, color: '#4a4a68', letterSpacing: 6, marginBottom: 48 },
  card: { width: '100%', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 24, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '600', color: C.white, marginBottom: 6 },
  sub: { fontSize: 12.5, color: C.muted, textAlign: 'center', lineHeight: 19 },
  skipBtn: { marginTop: 32, paddingVertical: 12, paddingHorizontal: 32 },
  skipTxt: { fontSize: 14, color: C.muted, letterSpacing: 1 },
});

// ─────────────────────────────────────────────
// Tab Bar — 丿捺 新版
// 丿+捺=人，两个笔画，两个模块
// ─────────────────────────────────────────────
function TabBar({ tab, setTab }) {
  const items = [
    { id: 'home', labelTop: '言', labelBot: '首页', dark: false },
    { id: 'pie', labelTop: '丿', labelBot: '出发·地铁', dark: false },
    { id: 'na', labelTop: '丶', labelBot: '世界打卡', dark: false },
  ];
  return (
    <View style={tb.bar}>
      {items.map(t => {
        const active = tab === t.id;
        return (
          <TouchableOpacity key={t.id} style={tb.item} onPress={() => setTab(t.id)}>
            <Text style={[tb.top, active && tb.topAct]}>{t.labelTop}</Text>
            <Text style={[tb.bot, active && tb.botAct]}>{t.labelBot}</Text>
            {active && <View style={tb.dot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const tb = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.border, paddingBottom: Platform.OS === 'ios' ? 20 : 8, paddingTop: 8 },
  item: { flex: 1, alignItems: 'center', gap: 2, position: 'relative' },
  top: { fontSize: 20, color: C.mutedLight, fontWeight: '200', lineHeight: 26 },
  topAct: { color: C.lava, fontWeight: '400' },
  bot: { fontSize: 9, color: C.mutedLight, fontWeight: '500', letterSpacing: 0.3 },
  botAct: { color: C.lava, fontWeight: '700' },
  dot: { position: 'absolute', top: -1, width: 3, height: 3, borderRadius: 2, backgroundColor: C.lava },
});

// ─────────────────────────────────────────────
// 🏠 Home Screen
// ─────────────────────────────────────────────

/**
 * 今天该干什么 —— **整个首页最上面,只有一句话和一个按钮。**
 *
 * 这张卡是为了回答产品的核心困境:「我自己都不知道我要怎么去学习日语,
 * 感觉很混乱很复杂」。十个模块并列,任何时刻用户都得自己决定点哪个。
 *
 * 规则在 src/features/learn/dailyTask.ts,是纯函数、有 18 条测试。
 * 这里只负责把它接上界面和导航,**不做任何判断**。
 */
function TodayCard({ content, setTab, setSubTab, setLearnBatch }) {
  const { progress, ready } = useReviewProgress();
  // 「五十音这道门过了没」和五十音页用**同一份**判据 —— 各判各的会让老用户
  // 在首页看到「门过了」、在五十音页看到「0 / 46」。见 useKanaGate。
  const gate = useKanaGate(content.kanaRows);

  const pool = useMemo(() => anchorPool(content.wordBank || []), [content.wordBank]);

  // 判据(含老用户兜底、以及那条兜底对新用户是假阳性的取舍)全在 useKanaGate 里
  const kanaDone = gate.done;

  const task = useMemo(
    () => nextTask({ pool, progress: progress || {}, kanaDone, today: todayStr() }),
    [pool, progress, kanaDone],
  );
  const label = taskLabel(task);
  const prog = useMemo(() => poolProgress(pool, progress || {}), [pool, progress]);

  // 读盘没完就先不显示 —— 空的 progress 和「真的没学过」长得一样,
  // 这时候渲染出来的是一句错话。两份进度都要等到。
  if (!ready || !gate.ready || pool.length === 0) return null;

  /**
   * 开一个批次。**已经有一个没做完的就原样接着做,不重开。**
   *
   * ⚠️ 真机上暴露的:退出去再进来永远是「还剩 10 / 10」,而且每次是不同的词。
   * 两件事叠在一起:
   *  ① 做到哪了只活在批次页的 state 里 —— 组件一卸载就没了
   *  ② 批次每次进入都由 nextTask 重算,而**评过分的词会从到期队列里掉出去**,
   *     后面的补上来。所以「今天该复习」看起来像个永远做不完、还一直换人的池子。
   *
   * SRS 的行为本身没错(评了分就不该今天再问),错在把一个**会话**
   * 当成了每次现算的快照。复习页(useDailyQueue)早就把当天队列冻结落盘了,
   * 这里当初为了不新开存储键没做 —— 现在看那个取舍是错的。
   *
   * 这一版先把会话提到 App 层(切 tab、来回进出都保住),**不落盘**:
   * 杀 App 重开仍然会重挑一批。要不要落盘等这一版在真机上验过再说。
   */
  const openBatch = (mode, words) => {
    setLearnBatch(prev => {
      const sameDay = prev?.day === todayStr();
      const unfinished = prev && (prev.words || []).length > (prev.done || []).length;
      if (sameDay && prev.mode === mode && unfinished) return prev;
      return { mode, words, day: todayStr(), done: [] };
    });
  };

  const go = () => {
    setTab('pie');
    if (task.kind === 'kana') return setSubTab('kana');
    if (task.kind === 'review') {
      // ⚠️ 这里原本是 setSubTab('review') —— 而那一页问的是「这个词什么意思」。
      //
      // 两个问题叠在一起:
      //  ① 主线池是 563 条 kanji_anchor,**意思正是用户唯一不缺的**。
      //     拿它问意思,等于把这个产品最强的那张牌当题目发出去。
      //  ② 数字对不上:dailyTask 的 dueKeys **只数主线池**,而 ReviewScreen 走的是
      //     全局混合队列(词/深卡/地点/场景/地铁,上限 10,还会补新的深内容)。
      //     卡上写「有 6 个词到期了」,点进去是另外一批东西。
      //
      // 主线的到期词交给批次页(问读音),ReviewScreen 留给首页三数字卡
      // 那条「今天该复习」—— 那条本来就是全局混合的,名副其实。
      const byKey = new Map(pool.map(x => [poolWordKey(x), x]));
      const dueWords = task.keys.map(k => byKey.get(k)).filter(Boolean);
      if (dueWords.length) {
        openBatch('review', dueWords);
        return setSubTab('todaybatch');
      }
      return setSubTab('review');   // 一条都解析不出来时的兜底
    }
    if (task.kind === 'learn') {
      // ⚠️ **必须把 task.words 一起带过去。**
      //
      // 这里原本是 setSubTab('wordbank') —— 卡面上写着「6 个词 · 私 行く 何…」,
      // 点进去落在词书货架上,那 6 个词一个都没跟过去,用户得自己再挑一遍。
      // 规则层算了半天的「下一步」到界面这一步全丢了,主线在这儿是断的。
      openBatch('learn', task.words);
      return setSubTab('todaybatch');
    }
    // clear:池子过完了,那就真的去词书 —— 这时候「自己挑」是对的动作
    setSubTab('wordbank');
  };

  return (
    <TouchableOpacity style={tc.card} onPress={go} activeOpacity={0.85}>
      <View style={{ flex: 1 }}>
        <Text style={tc.eyebrow}>今天</Text>
        <Text style={tc.title}>{label.title}</Text>
        {task.kind === 'learn' ? (
          <Text style={tc.words} numberOfLines={1}>
            {task.words.map(w => w.word).join('   ')}
          </Text>
        ) : null}
      </View>
      <View style={tc.right}>
        <Text style={tc.action}>{label.action}</Text>
        <Text style={tc.prog}>{prog.learned} / {prog.total}</Text>
      </View>
    </TouchableOpacity>
  );
}

const tc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#2b2723', borderRadius: 16,
    paddingVertical: 18, paddingHorizontal: 20, marginTop: 18,
    borderWidth: 1, borderColor: '#3d372f',
  },
  eyebrow: { color: '#7d7369', fontSize: 10.5, letterSpacing: 2, marginBottom: 5 },
  title: { color: '#e8e0d2', fontSize: 16, lineHeight: 22, letterSpacing: 0.3 },
  words: { color: '#b4542f', fontSize: 13, marginTop: 7, letterSpacing: 1.5 },
  right: { alignItems: 'flex-end', marginLeft: 14 },
  action: {
    color: '#fff', fontSize: 13, backgroundColor: '#b4542f',
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, overflow: 'hidden',
  },
  prog: { color: '#6f665b', fontSize: 10.5, marginTop: 7, fontVariant: ['tabular-nums'] },
});

function HomeScreen({ setTab, setSceneState, setSubTab, setLearnBatch, content, onDataSources, onDeleteAccount }) {
  const { prefs, set: setPrefs } = usePrefs();
  const [fusionIdx, setFusionIdx] = useState(0);
  const [entryMode, setEntryMode] = useState('track');
  const [goalMode, setGoalMode] = useState('travel');
  const fusion = content.culturalFusion[fusionIdx];
  const sum = useHomeSummary(content.mapPlaces || []);
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={hs.c} showsVerticalScrollIndicator={false}>
      <View style={hs.hero}>
        <Text style={hs.heroBg}>言</Text>
        <Text style={hs.heroLbl}>YAN ✦</Text>
        <Text style={hs.heroTitle}>今天大地说什么？</Text>
        <Text style={hs.heroSub}>丿 出发 · 丶 落脚 · 丿+丶=人</Text>
        <Text style={hs.heroNote}>从一撇一捺开始，到真正开口。</Text>

        {/* 任何时刻只有一个下一步 —— 这张卡在最上面,是有意的。
            首页原本是「三个数字 + 三个去处」,那仍然是「你自己选一个」。 */}
        <TodayCard content={content} setTab={setTab} setSubTab={setSubTab} setLearnBatch={setLearnBatch} />

        {/* 三个真实数字 + 三个去处。首页原本一个数字都没有,只有口号 ——
            用户打开 App 看不到自己在哪儿,每次都像第一次打开。
            没有任何进度时不显示这张卡,零填满的界面比没有更让人泄气。 */}
        {sum.ready && (sum.learning + sum.mastered + sum.station + sum.places > 0) && (
          <View style={hs.sumCard}>
            {/* 点进去是复习页,不是词表 —— 用户看到「今天该复习 8」时想做的是
                「那就复习」,不是「让我看看是哪 8 个」。 */}
            <TouchableOpacity
              style={hs.sumCell}
              onPress={() => { setTab('pie'); setSubTab(sum.due > 0 ? 'review' : 'wordbank'); }}
            >
              <Text style={hs.sumN}>{sum.due}</Text>
              <Text style={hs.sumL}>今天该复习</Text>
              {sum.deepDue > 0
                ? <Text style={hs.sumSub}>{sum.deepDue} 条来自你走过的地方</Text>
                : sum.mastered > 0 && <Text style={hs.sumSub}>已掌握 {sum.mastered}</Text>}
            </TouchableOpacity>
            <View style={hs.sumDiv} />
            <TouchableOpacity
              style={hs.sumCell}
              onPress={() => { setTab('pie'); setSubTab('subway'); }}
            >
              <Text style={hs.sumN}>{sum.station}</Text>
              <Text style={hs.sumL}>地铁站</Text>
            </TouchableOpacity>
            <View style={hs.sumDiv} />
            <TouchableOpacity style={hs.sumCell} onPress={() => setTab('na')}>
              <Text style={hs.sumN}>{sum.countries}</Text>
              <Text style={hs.sumL}>国家</Text>
              {sum.places > 0 && <Text style={hs.sumSub}>{sum.places} 处足迹</Text>}
            </TouchableOpacity>
          </View>
        )}
        <View style={hs.section}>
  <Text style={hs.sectionTitle}>更偏向哪种目标？</Text>

  <View style={hs.goalRow}>
    <TouchableOpacity
      style={[hs.goalChip, goalMode === 'travel' && hs.goalChipAct]}
      onPress={() => { setGoalMode('travel'); setTab('pie'); setSubTab('learn'); }}
    >
   <View style={hs.goalInner}>
  <View style={hs.goalDotsRow}>
    <View style={[hs.goalDot, hs.goalDotOn]} />
    <View style={hs.goalDot} />
    <View style={hs.goalDot} />
  </View>
  <Text style={[hs.goalTxt, goalMode === 'travel' && hs.goalTxtAct]}>旅行速成</Text>
</View>
    </TouchableOpacity>

    <TouchableOpacity
      style={[hs.goalChip, hs.goalChipLocked]}
      onPress={showRouteComingSoonAlert}
    >
    <View style={hs.goalInner}>
  <View style={hs.goalDotsRow}>
    <View style={[hs.goalDot, hs.goalDotOn]} />
    <View style={[hs.goalDot, hs.goalDotOn]} />
    <View style={hs.goalDot} />
  </View>
  <Text style={[hs.goalTxt, hs.goalTxtLocked]}>兴趣入门</Text>
  <Text style={hs.lockTag}>即将开放</Text>
</View>
    </TouchableOpacity>

    <TouchableOpacity
      style={[hs.goalChip, hs.goalChipLocked]}
      onPress={showRouteComingSoonAlert}
    >
    <View style={hs.goalInner}>
  <View style={hs.goalDotsRow}>
    <View style={[hs.goalDot, hs.goalDotOn]} />
    <View style={[hs.goalDot, hs.goalDotOn]} />
    <View style={[hs.goalDot, hs.goalDotOn]} />
  </View>
  <Text style={[hs.goalTxt, hs.goalTxtLocked]}>考试基础</Text>
  <Text style={hs.lockTag}>即将开放</Text>
</View>
    </TouchableOpacity>
  </View>
</View>
      </View>
      <View style={hs.section}>
  <Text style={hs.sectionTitle}>学习方式</Text>

  <View style={hs.entryRow}>
    <TouchableOpacity
      style={[hs.entryCard, entryMode === 'track' && hs.entryCardAct]}
      onPress={() => setEntryMode('track')}
    >
    <Text style={[hs.entryIcon, entryMode === 'track' && hs.entryIconAct]}>→</Text>
<Text style={[hs.entryTitle, entryMode === 'track' && hs.entryTitleAct]}>轨道模式</Text>
<Text style={[hs.entryLead, entryMode === 'track' && hs.entryLeadAct]}>稳稳往前走</Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={[hs.entryCard, hs.entryCardLocked]}
      onPress={showWanderComingSoonAlert}
    >
   <Text style={[hs.entryIcon, hs.entryIconLocked]}>◎</Text>
<Text style={[hs.entryTitle, hs.entryTxtLocked]}>漫游模式</Text>
<Text style={[hs.entryLead, hs.entryTxtLocked]}>随心成体系</Text>
<Text style={hs.entryLockTag}>即将开放</Text>
    </TouchableOpacity>
  </View>
</View>
      {/* 从这里开始 */}
     <View style={hs.section}>
  <Text style={hs.sectionTitle}>从这里开始</Text>
 
 <ScrollView
  horizontal
  showsHorizontalScrollIndicator={false}
  contentContainerStyle={hs.startRow}
>
  <TouchableOpacity
    style={[hs.startCard, hs.startCardDark]}
    onPress={() => { setTab('pie'); setSubTab('learn'); }}
  >
    <Text style={hs.startTopDark}>丿</Text>
    <View>
      <Text style={hs.startNameDark}>出发前七天</Text>
      <Text style={hs.startSubDark}>
        {content.scenes.filter(s => s.ready).length}场景 · {content.scenes.filter(s => s.ready).reduce((n, s) => n + (s.phrases?.length || 0), 0)}句
      </Text>
    </View>
  </TouchableOpacity>

  <TouchableOpacity
    style={hs.startCard}
    onPress={() => { setTab('pie'); setSubTab('kana'); }}
  >
    <Text style={hs.startTop}>あ</Text>
    <View>
      <Text style={hs.startName}>五十音</Text>
      <Text style={hs.startSub}>从零开始</Text>
    </View>
  </TouchableOpacity>

  <TouchableOpacity
    style={hs.startCard}
    onPress={() => { setTab('pie'); setSubTab('subway'); }}
  >
    <Text style={hs.startTop}>丿</Text>
    <View>
      <Text style={hs.startName}>场景实战</Text>
      <Text style={hs.startSub}>地铁 · 餐厅 · 酒店</Text>
    </View>
  </TouchableOpacity>

  <TouchableOpacity
    style={[hs.startCard, hs.startCardLocked]}
    onPress={showComingSoonAlert}
  >
    <Text style={hs.startTop}>丶</Text>
    <View>
      <Text style={hs.startName}>记忆专题</Text>
      <Text style={hs.startSub}>星期 · 日期 · 方位</Text>
      <Text style={hs.startLockTag}>即将开放</Text>
    </View>
  </TouchableOpacity>
</ScrollView>
  </View>
      {/* 今日词根 */}
      <View style={hs.fusionHd}>
        <Text style={hs.sectionLbl}>今日词根联动</Text>
        <View style={hs.fusionDots}>
          {content.culturalFusion.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => setFusionIdx(i)}>
              <View style={[hs.dot, fusionIdx === i && hs.dotAct]} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={hs.darkCard}>
        <Text style={hs.darkBg}>言</Text>
        <Text style={hs.darkTag}>💡 {fusion.theme}</Text>
        <Text style={hs.darkWord}>{fusion.word}</Text>
        <Text style={hs.darkNote}>{fusion.note}</Text>
        <LangLink links={fusion.links} />
      </View>

      {/* 语言标签说明 */}
      <View style={hs.legendRow}>
        <Text style={hs.legendTitle}>语言标签说明</Text>
        <View style={hs.legendChips}>
          {[{ code: 'ZH', name: '中文', bg: '#e8f4e0', fg: '#2a6020' }, { code: 'JP', name: '日语', bg: C.lavaLight, fg: '#c04010' }, { code: 'ES', name: '西语', bg: '#fce0e8', fg: '#9a2040' }, { code: 'EN', name: '英语', bg: '#e0e8ff', fg: '#2040a0' }].map(l => (
            <View key={l.code} style={[hs.legendChip, { backgroundColor: l.bg }]}>
              <Text style={[hs.legendCode, { color: l.fg }]}>{l.code}</Text>
              <Text style={[hs.legendName, { color: l.fg }]}>{l.name}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 关于:数据来源署名(JMdict / Tatoeba 的授权都要求署名)、隐私政策、删除账号。
          删除账号是 Apple 5.1.1(v) 的硬性要求,不做会直接拒审。 */}
      <View style={hs.aboutBox}>
        <Text style={hs.aboutTitle}>关于</Text>
        <Text style={hs.aboutLine}>
          {/* 具名署名要留在常驻可见的地方。单独开一屏是 CC BY-SA 的要求,
              但不该因此把这里换成「使用了外部词典和语料数据」这种谁也没点到的话 ——
              两者可以都有:这里点名,那一屏说清边界。 */}
          词条的读音、词性与英文释义参考 <Text style={hs.aboutStrong}>JMdict</Text>(EDRDG,CC BY-SA 4.0);
          声调数据来自 <Text style={hs.aboutStrong}>kanjium</Text>(Uros O.,CC BY-SA 4.0);
          例句与词频来自 <Text style={hs.aboutStrong}>Tatoeba</Text>(CC BY 2.0 FR)。详见数据来源。
        </Text>
        {/* 显示偏好。放「关于」里是因为目前只有这一项,不值得单开一屏 ——
            但它必须能关:不看英文的用户,那一行就是纯噪音。
            (无痛单词把英文释义做成卖点,用户反馈里最大的一条也是「希望能选」。) */}
        <TouchableOpacity
          style={hs.prefRow}
          onPress={() => setPrefs({ showEnglish: !prefs.showEnglish })}
        >
          <View style={{ flex: 1 }}>
            <Text style={hs.prefLabel}>复习时并列英文释义</Text>
            <Text style={hs.prefHint}>中文装不下的区别,英文常常分得开(only / merely)</Text>
          </View>
          <Text style={[hs.prefSwitch, prefs.showEnglish && hs.prefSwitchOn]}>
            {prefs.showEnglish ? '开' : '关'}
          </Text>
        </TouchableOpacity>

        <View style={hs.aboutActions}>
          <TouchableOpacity onPress={onDataSources}>
            <Text style={hs.aboutLink}>数据来源</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}>
            <Text style={hs.aboutLink}>隐私政策</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDeleteAccount}>
            <Text style={hs.aboutDanger}>删除账号</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}
const hs = StyleSheet.create({
  aboutBox: { marginTop: 4, paddingTop: 18, borderTopWidth: 1, borderTopColor: C.borderSoft },
  aboutTitle: { fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  aboutLine: { fontSize: 11.5, color: C.mutedWarm, lineHeight: 18 },
  aboutStrong: { color: C.ink, fontWeight: '600' },
  prefRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border,
  },
  prefLabel: { fontSize: 13, color: C.ink, fontWeight: '600' },
  prefHint: { fontSize: 11, color: C.muted, marginTop: 3, lineHeight: 15 },
  prefSwitch: {
    fontSize: 12, color: C.muted, borderWidth: 1, borderColor: C.border,
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden',
  },
  prefSwitchOn: { color: C.white, backgroundColor: C.lava, borderColor: C.lava },
  aboutActions: { flexDirection: 'row', gap: 20, marginTop: 14 },
  aboutLink: { fontSize: 12, color: C.teal, fontWeight: '600' },
  aboutDanger: { fontSize: 12, color: C.lava },
  c: { padding: 18, paddingBottom: 40 },
hero: { backgroundColor: C.ink, borderRadius: 22, padding: 22, marginBottom: 20, overflow: 'hidden', position: 'relative' },
  heroBg: { position: 'absolute', right: -8, top: -18, fontSize: 100, color: C.white, opacity: 0.05, lineHeight: 110 },
  heroLbl: { fontSize: 10, color: C.lava, letterSpacing: 3, marginBottom: 8 },
  heroTitle: { fontSize: 24, color: C.white, fontWeight: '600', letterSpacing: -0.5, marginBottom: 5 },
  heroSub: { fontSize: 12, color: C.nightMuted },
  heroNote: {
  fontSize: 12,
  color: C.nightMutedLight,
  marginTop: 10,
  lineHeight: 18,
},

section: {
  marginBottom: 20,
},

sectionTitle: {
  fontSize: 13,
  fontWeight: '700',
  color: C.ink,
  marginBottom: 12,
},
startRow: {
  gap: 12,
  paddingRight: 24,
  marginTop: 2,
},

startCard: {
  width: 138,
  minHeight: 148,
  backgroundColor: C.white,
  borderRadius: 22,
  padding: 16,
  borderWidth: 1.5,
  borderColor: C.border,
  justifyContent: 'space-between',
},

startCardDark: {
  backgroundColor: C.ink,
},
startCardLocked: {
  opacity: 0.55,
  backgroundColor: '#f1efe8',
},

startTop: {
  fontSize: 32,
  color: C.ink,
  lineHeight: 36,
},

startTopDark: {
  fontSize: 32,
  color: C.white,
  lineHeight: 36,
},

startName: {
  fontSize: 14,
  fontWeight: '700',
  color: C.ink,
  marginBottom: 6,
},

startNameDark: {
  fontSize: 14,
  fontWeight: '700',
  color: C.white,
  marginBottom: 6,
},

startSub: {
  fontSize: 11,
  color: C.muted,
  lineHeight: 16,
},

startSubDark: {
  fontSize: 11,
  color: '#6f6f92',
  lineHeight: 16,
},
startLockTag: {
  alignSelf: 'flex-start',
  marginTop: 8,
  paddingHorizontal: 7,
  paddingVertical: 3,
  borderRadius: 999,
  backgroundColor: C.tag,
  color: C.muted,
  fontSize: 9,
  fontWeight: '700',
  overflow: 'hidden',
},
entryIcon: {
  fontSize: 16,
  color: C.muted,
  marginBottom: 8,
},

entryIconAct: {
  color: C.lava,
},
entryIconLocked: {
  color: C.mutedLight,
},
entryTxtLocked: {
  color: C.muted,
},
entryLockTag: {
  alignSelf: 'flex-start',
  marginTop: 6,
  paddingHorizontal: 7,
  paddingVertical: 3,
  borderRadius: 999,
  backgroundColor: C.tag,
  color: C.muted,
  fontSize: 9,
  fontWeight: '700',
  overflow: 'hidden',
},

entryRow: {
  flexDirection: 'row',
  gap: 8,
  backgroundColor: C.white,
  borderRadius: 24,
  padding: 6,
  borderWidth: 1.5,
  borderColor: C.border,
},

entryCard: {
  flex: 1,
  borderRadius: 20,
  paddingHorizontal: 16,
  paddingVertical: 16,
  minHeight: 90,
  justifyContent: 'center',
},

entryCardAct: {
  backgroundColor: C.ink,
},
entryCardLocked: {
  opacity: 0.58,
  backgroundColor: '#f1efe8',
},

entryTitle: {
  fontSize: 15,
  fontWeight: '700',
  color: C.ink,
  marginBottom: 4,
},

entryLead: {
  fontSize: 12,
  color: C.ink,
  marginBottom: 3,
  lineHeight: 16,
},

entryDesc: {
  fontSize: 11,
  color: C.muted,
  lineHeight: 15,
},
entryTitleAct: {
  color: C.white,
},

entryLeadAct: {
  color: '#f1d8cf',
},

entryDescAct: {
  color: '#9a8f8a',
},

goalRow: {
  flexDirection: 'row',
  gap: 10,
  marginTop: 14,
},

goalChip: {
  paddingHorizontal: 16,
  paddingVertical: 10,
  borderRadius: 20,
  borderWidth: 1.5,
  borderColor: 'rgba(255,255,255,0.12)',
  backgroundColor: 'rgba(255,255,255,0.03)',
  minWidth: 100,
  alignItems: 'center',
},

goalChipAct: {
  borderColor: C.lava,
  backgroundColor: 'rgba(192,64,16,0.16)',
},
goalChipLocked: {
  opacity: 0.62,
  borderColor: 'rgba(255,255,255,0.08)',
  backgroundColor: 'rgba(255,255,255,0.02)',
},

goalTxt: {
  fontSize: 13,
  color: 'rgba(255,255,255,0.42)',
  fontWeight: '600',
},

goalTxtAct: {
  color: C.white,
},
goalTxtLocked: {
  color: 'rgba(255,255,255,0.38)',
},
lockTag: {
  marginTop: 2,
  fontSize: 9,
  color: '#8d8da8',
  fontWeight: '700',
},
goalInner: {
  alignItems: 'center',
  gap: 4,
},

goalDotsRow: {
  flexDirection: 'row',
  gap: 4,
  marginBottom: 6,
},

goalDot: {
  width: 7,
  height: 7,
  borderRadius: 4,
  backgroundColor: 'rgba(255,255,255,0.18)',
},

goalDotOn: {
  backgroundColor: C.lava,
},
sumCard: {
  flexDirection: 'row', alignItems: 'stretch',
  backgroundColor: 'rgba(255,255,255,0.10)',
  borderRadius: 16, paddingVertical: 14, marginTop: 18,
},
sumCell: { flex: 1, alignItems: 'center', gap: 2 },
sumDiv: { width: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: 4 },
sumN: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
sumL: { fontSize: 11, color: 'rgba(255,255,255,0.72)' },
sumSub: { fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
mapRow: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 10,
},

mapCard: {
  width: (SW - 36 - 20) / 3,
  aspectRatio: 1.15,
  backgroundColor: C.paperFaint,
  borderRadius: 16,
  borderWidth: 1.5,
  borderColor: C.border,
  alignItems: 'center',
  justifyContent: 'center',
},

mapGlyph: {
  fontSize: 25,
  color: C.ink,
  fontWeight: '300',
},
moduleGrid: {
  gap: 10,
},

moduleCard: {
  backgroundColor: C.white,
  borderRadius: 18,
  padding: 16,
  borderWidth: 1.5,
  borderColor: C.border,
},

moduleGlyph: {
  fontSize: 28,
  color: C.ink,
  fontWeight: '300',
  marginBottom: 8,
},

moduleName: {
  fontSize: 12,
  color: C.muted,
  lineHeight: 18,
},
  mainRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  mainCard: { flex: 1, borderRadius: 18, padding: 18, borderWidth: 1.5, borderColor: C.border },
  mainGlyph: { fontSize: 36, color: C.white, fontWeight: '200', lineHeight: 44, marginBottom: 8 },
  mainName: { fontSize: 15, fontWeight: '700', color: C.ink, marginBottom: 3 },
  mainSub: { fontSize: 11, color: C.muted },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  quickCard: { flex: 1, backgroundColor: C.white, borderRadius: 14, padding: 14, alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: C.border },
  quickName: { fontSize: 11, fontWeight: '600', color: C.ink },
  fusionHd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLbl: {
  fontSize: 10,
  fontWeight: '700',
  color: C.muted,
  letterSpacing: 2,
  marginBottom: 10,
},
  fusionDots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
  dotAct: { backgroundColor: C.lava, width: 16 },
  darkCard: { backgroundColor: C.ink, borderRadius: 18, padding: 20, overflow: 'hidden', position: 'relative', marginBottom: 14 },
  darkBg: { position: 'absolute', right: -5, top: -10, fontSize: 80, color: C.white, opacity: 0.04, lineHeight: 90 },
  darkTag: { fontSize: 9, color: C.lava, letterSpacing: 2, marginBottom: 8 },
  darkWord: { fontSize: 22, color: C.white, fontWeight: '400', marginBottom: 10 },
  darkNote: { fontSize: 12, color: C.nightMuted, lineHeight: 20 },
  legendRow: { backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: C.border },
  legendTitle: { fontSize: 10, fontWeight: '700', color: C.muted, letterSpacing: 1.5, marginBottom: 10 },
  legendChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  legendCode: { fontSize: 11, fontWeight: '800' },
  legendName: { fontSize: 11, fontWeight: '500' },
});

// ─────────────────────────────────────────────
// 丿 Tab — 出发·地铁
// 内部子导航：学习场景 / 地铁冒险 / 五十音
// ─────────────────────────────────────────────
function PieTab(props) {
  // ⚠️ Provider 已经上移到 tab 区外面(见 render 里那段注释)。
  // 这里不能再包一层 —— **两个 Provider = 两份独立的进度,各写各的盘、互相覆盖**,
  // 而且不报错。见 useReviewProgressState 的文档注释。
  return <PieTabInner {...props} />;
}

function PieTabInner({ content, setTab, subTab, setSubTab, sceneState, setSceneState, practiceScene, setPracticeScene, learnBatch, setLearnBatch }) {
  const [wbBookId, setWbBookId] = useState(null);
  // memo 一次:内联调用每次渲染都新建数组,下游按引用比较的 memo 会全部失效
  const mainlinePool = useMemo(() => anchorPool(content.wordBank || []), [content.wordBank]);
  return (
    <View style={{ flex: 1 }}>
      {/* 子 tab */}
      <View style={pt.subBar}>
        {[
          { id: 'learn', label: '出发前' },
          { id: 'subway', label: '地铁冒险' },
          { id: 'kana', label: '五十音' },
        ].map(s => (
          <TouchableOpacity key={s.id} style={[
            pt.subBtn,
            ((s.id === 'learn' && ['learn', 'intro', 'card', 'practice', 'todaybatch'].includes(subTab)) || subTab === s.id) && pt.subBtnAct
          ]}
            onPress={() => setSubTab(s.id)}
            >
            <Text
            style={[
              pt.subTxt,
               ((s.id === 'learn' && ['learn', 'intro', 'card', 'practice', 'todaybatch'].includes(subTab)) || subTab === s.id) && pt.subTxtAct
                ]}
              >
                 {s.label}
                 </Text>
               </TouchableOpacity>
        ))}
      </View>
      <View style={{ flex: 1 }}>
        {subTab === 'learn' && (
  <LearnScreen content={content} setSceneState={setSceneState} setSubTab={setSubTab} />
)}

{subTab === 'intro' && sceneState && (
  <SceneIntroScreen
    scene={sceneState.scene}
    onBack={() => setSubTab('learn')}
    onStart={() => {
  setSceneState({ scene: sceneState.scene, index: 0 });
  setSubTab('card');
}}
  />
)}

{subTab === 'card' && sceneState && (
  <CardScreen
    content={content}
    sceneState={sceneState}
    onBack={() => setSubTab('intro')}
    onFinish={() => {
      setPracticeScene(sceneState.scene);
      setSubTab('practice');
    }}
  />
)}

{subTab === 'practice' && practiceScene && (
  <PracticeScreen
    scene={practiceScene}
    onBack={() => setSubTab('card')}
    onDone={() => setSubTab('learn')}
  />
)}
        {subTab === 'subway' && (
          <SubwayScreen adventure={content.subwayAdventure} />
        )}
        {subTab === 'review' && (
          <ReviewScreen content={content} onBack={() => setSubTab('learn')} />
        )}
        {/* 今日批次。首页那张卡点「开始」直接落在这里,不经过词书货架 ——
            货架是「你自己挑」,而这条主线的整个前提是**任何时刻只有一个下一步**。
            batch 为空时不渲染:那说明是直接切到这个 subTab 的(理论上没有这种路径),
            渲染出来会是一页空卡。 */}
        {subTab === 'todaybatch' && (learnBatch?.words?.length ? (
          <LearnBatchScreen
            words={learnBatch.words}
            mode={learnBatch.mode}
            done={learnBatch.done}
            onDoneChange={(next) => setLearnBatch(p => (p ? { ...p, done: next } : p))}
            // 今日统计要按主线池算,不是按这一批的 6 个 ——
            // 「今天一共过了几个」问的是整条主线,不是这一轮
            pool={mainlinePool}
            /* ⚠️ 返回**回首页**,不是回「出发前」。
               这一页是从首页那张卡进来的,退出去落在一个没去过的子 tab 上
               会让人不知道自己在哪儿 —— 用户原话:「返回的时候是不是返回到首页更好」。
               做完了同理。 */
            onBack={() => setTab('home')}
            onDone={() => { setLearnBatch(null); setTab('home'); }}
          />
        ) : null)}
        {subTab === 'wordbank' && !wbBookId && (
          <WordBookShelfScreen
            wordBank={content.wordBank || []}
            onBack={() => setSubTab('learn')}
            onSelect={(id) => setWbBookId(id)}
          />
        )}
        {subTab === 'wordbank' && wbBookId && (() => {
          const activeBook = WORDBOOKS.find(b => b.id === wbBookId);
          if (!activeBook?.available) return null;
          const bookWords = (content.wordBank || []).filter(w => (w.levels || [w.level]).includes(activeBook.level));
          return (
            <WordBankScreen
              wordBank={bookWords}
              book={activeBook}
              onBack={() => setWbBookId(null)}
            />
          );
        })()}
        {subTab === 'kana' && (
        <KanaScreen
  kanaRows={content.kanaRows}
  specialSounds={content.specialSounds}
  specialRows={content.specialRows}
  voicedRows={content.voicedRows}
  yoonRows={content.yoonRows}
  loanwordRows={content.loanwordRows}
/>
        )}
      </View>
    </View>
  );
}
const pt = StyleSheet.create({
  subBar: { flexDirection: 'row', backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 0, gap: 4 },
  subBtn: { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  subBtnAct: { borderBottomColor: C.lava },
  subTxt: { fontSize: 13, color: C.muted, fontWeight: '500' },
  subTxtAct: { color: C.lava, fontWeight: '700' },
});

// ─────────────────────────────────────────────
// Learn Screen（场景列表）
// ─────────────────────────────────────────────
function LearnScreen({ content, setSceneState, setSubTab }) {
  const [learnView, setLearnView] = useState('home');
  const isSentenceView = learnView === 'sentences';
  const openScene = (sc) => {
    if (!sc.ready) {
      showComingSoonAlert();
      return;
    }
    setSceneState({ scene: sc, index: 0 });
    setSubTab('intro');
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={ls.hd}>
        <Text style={ls.title}>{isSentenceView ? '出发句' : '出发前七天'}</Text>
        <Text style={ls.sub}>{isSentenceView ? '按场景学会最常用的表达骨架' : '先学最能用上的内容'}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator={false}>
        {!isSentenceView ? (
          <View style={ls.section}>
  <Text style={ls.sectionTitle}>学习目录</Text>

  <View style={ls.grid}>
    <TouchableOpacity
      style={ls.card}
      onPress={() => setSubTab('kana')}
    >
      <Text style={ls.cardGlyph}>あ</Text>
      <Text style={ls.cardTitle}>五十音</Text>
      <Text style={ls.cardDesc}>发音、平片、易混字、记忆提示</Text>
    </TouchableOpacity>

    <TouchableOpacity style={ls.card} onPress={() => setSubTab('wordbank')}>
      <Text style={ls.cardGlyph}>詞</Text>
      <Text style={ls.cardTitle}>高频词书</Text>
      <Text style={ls.cardDesc}>按词书分级学习，从 N5 开始</Text>
    </TouchableOpacity>

    <TouchableOpacity style={ls.card} onPress={() => setLearnView('sentences')}>
      <Text style={ls.cardGlyph}>句</Text>
      <Text style={ls.cardTitle}>核心句型</Text>
      <Text style={ls.cardDesc}>按场景学会最常用的表达骨架</Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={ls.card}
      onPress={() => setSubTab('subway')}
    >
      <Text style={ls.cardGlyph}>境</Text>
      <Text style={ls.cardTitle}>场景实战</Text>
      <Text style={ls.cardDesc}>用语言完成一整条真实行动链</Text>
    </TouchableOpacity>

    <TouchableOpacity style={[ls.card, ls.cardLocked]} onPress={showComingSoonAlert}>
      <Text style={ls.cardGlyph}>識</Text>
      <Text style={ls.cardTitle}>记忆专题</Text>
      <Text style={ls.cardDesc}>星期、日期、方位与速查专题</Text>
      <Text style={ls.lockTag}>即将开放</Text>
    </TouchableOpacity>
  </View>
</View>
        ) : (
          <>
            <TouchableOpacity onPress={() => setLearnView('home')}>
              <Text style={ls.backLink}>‹ 返回学习目录</Text>
            </TouchableOpacity>
            <Text style={ls.sectionTitle}>场景列表</Text>
        {content.scenes.map(sc => (
<TouchableOpacity
  key={sc.id}
  style={[ls.row, !sc.ready && { opacity: 0.42 }]}
  onPress={() => openScene(sc)}
>
  <View style={[ls.icon, { backgroundColor: sc.bgColor }]}>
    <Text style={{ fontSize: 22 }}>{sc.emoji}</Text>
  </View>
            <View style={{ flex: 1 }}>
              <Text style={ls.name}>{sc.label}</Text>
              <Text style={ls.desc}>{sc.desc}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 3 }}>
              <Text style={[ls.cnt, { color: sc.ready ? sc.color : C.mutedLight }]}>{sc.ready ? `${sc.phrases.length}句` : '即将'}</Text>
              <Text style={[ls.arr, { color: sc.ready ? sc.color : C.mutedLight }]}>{sc.ready ? '›' : '🔒'}</Text>
            </View>
          </TouchableOpacity>
        ))}
          </>
        )}
        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  );
}
const ls = StyleSheet.create({
  hd: { padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  title: { fontSize: 22, fontWeight: '700', color: C.ink },
  sub: { fontSize: 12, color: C.muted, marginTop: 3 },
  section: {
  marginBottom: 14,
},

sectionTitle: {
  fontSize: 13,
  fontWeight: '700',
  color: C.ink,
  marginBottom: 10,
},
backLink: {
  fontSize: 13,
  color: C.lava,
  fontWeight: '600',
  marginBottom: 6,
},

grid: {
  gap: 10,
},

card: {
  backgroundColor: C.paperFaint,
  borderRadius: 16,
  padding: 14,
  borderWidth: 1.5,
  borderColor: C.border,
},
cardLocked: {
  opacity: 0.58,
  backgroundColor: '#f1efe8',
},

cardGlyph: {
  fontSize: 22,
  color: C.ink,
  marginBottom: 8,
},

cardTitle: {
  fontSize: 14,
  fontWeight: '700',
  color: C.ink,
  marginBottom: 4,
},

cardDesc: {
  fontSize: 12,
  color: C.muted,
  lineHeight: 18,
},
lockTag: {
  alignSelf: 'flex-start',
  marginTop: 8,
  paddingHorizontal: 7,
  paddingVertical: 3,
  borderRadius: 999,
  backgroundColor: C.tag,
  color: C.muted,
  fontSize: 9,
  fontWeight: '700',
  overflow: 'hidden',
},
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 15, padding: 15, borderWidth: 1.5, borderColor: C.border, gap: 12 },
  icon: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '600', color: C.ink },
  desc: { fontSize: 11, color: C.muted, marginTop: 2 },
  cnt: { fontSize: 11, fontWeight: '600' },
  arr: { fontSize: 19, fontWeight: '300' },
});
// ─────────────────────────────────────────────
// Word Book Shelf
// ─────────────────────────────────────────────
// 词数**不写在这里**。写死过一次,内容包更新之后五个数全部漂掉了
// (718/626/1730/1812/3413 实际是 724/633/1726/1798/3403),而且不报错、
// 只是让用户看到一个和列表对不上的数字。现在由 WordBookShelfScreen 从内容里现算。
const WORDBOOKS = [
  { id: 'n5', level: 'N5', title: '基础词书', desc: '高频词块 · 例句', available: true },
  { id: 'n4', level: 'N4', title: '进阶词书', desc: '日常表达 · 例句', available: true },
  { id: 'n3', level: 'N3', title: '中级词书', desc: '表达能力跃升', available: true },
  { id: 'n2', level: 'N2', title: '高级词书', desc: '流利阅读基础', available: true },
  { id: 'n1', level: 'N1', title: '最高级词书', desc: '母语级词汇', available: true },
];
const JLPT_COLORS = {
  N5: ['#e8f4ea', '#2a7a3a'],
  N4: ['#e8eef8', '#2a4a8a'],
  N3: ['#f0e8ff', '#6a3a9a'],
  N2: ['#fff0e0', '#c07020'],
  N1: ['#fde8e0', '#b0301a'],
};

/**
 * 词书选择 + **全库搜索**。
 *
 * 搜索原本关在单本词书里,那是个错误的切分:没人记得「注文」是 N4 还是 N3。
 * 用户想查一个词的时候,他脑子里没有 JLPT 级别,只有那个词。
 *
 * 挪出来之后两件事各归各位:
 *   词书 = 定稿的那批(例句/罗马音/搭配齐全),按级别组织,是「学」
 *   搜索 = 全库 8298 条,不分级别、不滤起草稿,是「查」
 * 代码里本来就写着「其余词条只在搜索时出现,当词典用」—— 搜索被关在单本书里的时候
 * 这句话是做不到的,现在才真的成立。
 */
function WordBookShelfScreen({ wordBank, onBack, onSelect }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(null);
  const [pickedIdx, setPickedIdx] = useState(0);
  const { speak, speakingKey } = useSpeech();
  const { progress, grade } = useReviewProgress();

  // 每本书的词数**从内容里算**,不用 WORDBOOKS 里写死的那个。
  //
  // 写死的五个数到 2026-08 已经全部对不上了(718/626/1730/1812/3413 实际是
  // 724/633/1726/1798/3403)—— 内容包在更新,常量没人跟着改,而这种漂移
  // 不会报错、只会让用户看到一个和列表对不上的数字。
  // 顺带把「定稿多少」也算出来:一本全是起草稿的书不该和精修过的书写一样的话。
  const stats = useMemo(() => {
    const out = {};
    for (const book of WORDBOOKS) {
      const ws = (wordBank || []).filter(w => (w.levels || [w.level]).includes(book.level));
      out[book.id] = { total: ws.length, final: ws.reduce((n, w) => n + (isDraftedWord(w) ? 0 : 1), 0) };
    }
    return out;
  }, [wordBank]);

  const q = query.trim();
  const hits = !q ? [] : (wordBank || []).filter(w =>
    w.word.includes(q) || w.reading.includes(q)
    || (w.meaning_zh || '').includes(q)
    || (w.meaning_en || '').toLowerCase().includes(q.toLowerCase())
  ).slice(0, 80);   // 8298 条全渲染会卡,查词的人也不会翻到第 80 条

  const today = todayStr();

  if (picked) {
    return (
      <WBDetailPage
        entry={picked}
        record={progress[wordKey(picked)] || null}
        today={today}
        onBack={() => setPicked(null)}
        // 搜索结果里评分用词条自己的级别当 bookId,而不是「当前这本书」——
        // 这里根本没有「当前这本书」
        onGrade={(g) => grade(wordKey(picked), g, (picked.level || 'n5').toLowerCase())}
        speak={speak}
        speakingKey={speakingKey}
        hasPrev={pickedIdx > 0}
        hasNext={pickedIdx < hits.length - 1}
        onPrev={() => { const i = pickedIdx - 1; setPicked(hits[i]); setPickedIdx(i); }}
        onNext={() => { const i = pickedIdx + 1; setPicked(hits[i]); setPickedIdx(i); }}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={wbs.nav}>
        <TouchableOpacity onPress={onBack}>
          <Text style={wbs.navBack}>‹ 返回学习目录</Text>
        </TouchableOpacity>
        <Text style={wbs.title}>词书</Text>
        <Text style={wbs.sub}>选择一本开始学习,或直接搜整个词库</Text>
        <TextInput
          style={wbs.search}
          placeholder="搜索词、读音或意思"
          placeholderTextColor={C.mutedLight}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {!!q && (
        <FlatList
          style={{ flex: 1 }}
          data={hits}
          keyExtractor={(item, i) => `${item.word}-${item.reading}-${i}`}
          contentContainerStyle={{ padding: 14, gap: 6 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const [bg, fg] = JLPT_COLORS[item.level] || [C.tag, '#888'];
            const st = progress[wordKey(item)]?.status || 'new';
            return (
              <TouchableOpacity
                style={wbs.hit}
                activeOpacity={0.7}
                onPress={() => { setPicked(item); setPickedIdx(index); }}
              >
                {/* 级别标在结果上 —— 用户查完一个词,顺带知道了它属于哪本书。
                    这正是把搜索挪出来之后才能给的信息。 */}
                <View style={[wbs.hitLv, { backgroundColor: bg }]}>
                  <Text style={[wbs.hitLvTxt, { color: fg }]}>{item.level}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={wbs.hitHead}>
                    <Text style={wbs.hitWord}>{item.word}</Text>
                    <Text style={wbs.hitReading}>{item.reading}</Text>
                    {st === 'learning' && <View style={wbs.hitDot} />}
                    {st === 'mastered' && <Text style={wbs.hitCheck}>✓</Text>}
                  </View>
                  <Text style={wbs.hitZh} numberOfLines={1}>{item.meaning_zh}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={wbs.empty}>没有找到匹配的词</Text>}
        />
      )}

      {!q && (
      <ScrollView contentContainerStyle={{ padding: 14, gap: 7 }} showsVerticalScrollIndicator={false}>
        {WORDBOOKS.map(book => {
          const [bg, fg] = JLPT_COLORS[book.level] || [C.tag, '#888'];
          return (
            <TouchableOpacity
              key={book.id}
              style={[wbs.row, !book.available && wbs.rowLocked]}
              onPress={book.available ? () => onSelect(book.id) : undefined}
              activeOpacity={book.available ? 0.7 : 1}
            >
              <View style={[wbs.badge, { backgroundColor: bg }]}>
                <Text style={[wbs.badgeTxt, { color: fg }]}>{book.level}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={wbs.bookTitle}>{book.title}</Text>
                <Text style={wbs.bookDesc}>
                  {/* 一本全是起草稿的书,别写得和精修过的一样 ——
                      点进去发现例句时有时无,信任是这么丢的 */}
                  {!book.available ? book.desc
                    : stats[book.id]?.final > 0
                      ? `${stats[book.id].final} 词 · ${book.desc}`
                      : `${stats[book.id]?.total || 0} 条起草中 · 可当词典翻`}
                </Text>
              </View>
              {book.available
                ? <Text style={[wbs.arr, { color: fg }]}>›</Text>
                : <Text style={wbs.lockTxt}>即将</Text>
              }
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      )}
    </View>
  );
}
const wbs = StyleSheet.create({
  nav: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border, gap: 3 },
  navBack: { fontSize: 13, color: C.lava, fontWeight: '600', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '700', color: C.ink },
  sub: { fontSize: 11, color: C.muted },
  search: {
    marginTop: 9, backgroundColor: C.white, borderRadius: 8,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 0, height: 40,
    fontSize: 15, color: C.ink,
  },
  hit: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: C.border },
  hitLv: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 },
  hitLvTxt: { fontSize: 10, fontWeight: '800' },
  hitHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  hitWord: { fontSize: 16, fontWeight: '700', color: C.ink },
  hitReading: { fontSize: 11, color: C.muted },
  hitDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold, marginLeft: 'auto' },
  hitCheck: { fontSize: 12, color: C.lava, fontWeight: '700', marginLeft: 'auto' },
  hitZh: { fontSize: 12, color: C.ink, marginTop: 2 },
  empty: { textAlign: 'center', color: C.muted, marginTop: 40, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: C.border, gap: 12 },
  rowLocked: { opacity: 0.4 },
  badge: { width: 38, height: 38, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { fontSize: 12, fontWeight: '800' },
  bookTitle: { fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 1 },
  bookDesc: { fontSize: 11, color: C.muted },
  arr: { fontSize: 17, fontWeight: '300' },
  lockTxt: { fontSize: 10, fontWeight: '600', color: C.mutedLight },
});

// ─────────────────────────────────────────────
// Word Bank Screen
// ─────────────────────────────────────────────

// 用户可能敲 2026-07-15 / 2026/7/15 / 20260715,都归一成 YYYY-MM-DD。
// 认不出来就返回空 —— 宁可用今天,也不要存一个解析不了的日期让旅迹算错。
const normalizeDate = (v) => {
  const t = String(v || '').trim();
  if (!t) return '';
  const m = t.match(/^(\d{4})\D?(\d{1,2})\D?(\d{1,2})$/);
  if (!m) return '';
  const [, y, mo, d] = m;
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return Number.isFinite(Date.parse(iso)) ? iso : '';
};

// 词条是不是「机器起草、还没人工校对」。
// 8298 条里 N5/N4 那 1343 条是精修的(例句 100%),N3 以上 6955 条全是 zh_drafted
// (例句仅 39%)。数据层一直知道这件事,界面以前完全不体现 —— 用户看到的每张卡
// 长得都一样,而作者定的标准是「词意 0 容忍」。标出来是诚实,也让人能只学精修的。
/**
 * 这条词够不够格进词书。
 *
 * **判据是「有没有完整例句」,不是 `status` 标志位。**
 *
 * 原来看 `status !== 'zh_drafted'`。问题是那个标志位**已经和内容脱节了**:
 * 2026-08-13 数过,N3 有 1386 条例句齐全(jp/zh/roma 三样同步,没有半拉子),
 * 而被标成定稿的只有 8 条 —— 内容往前走了,标志位没人跟着改,而且不报错,
 * 只是让 1386 条做完的词一直藏在「起草」里看不见。
 * 和 `WORDBOOKS` 里那五个写死的词数是同一种病。
 *
 * 改成从字段现算之后:内容补一条就自动放出一条,没有需要有人记得改的开关。
 *
 * ⚠️ 门槛里**不含 `coreChunk`(搭配)**,这是想清楚的:搭配是三层里唯一
 * 没有开放权威源的字段(2026-08-13 找过,GitHub 上没有;NINJAL-LWP 不能批量
 * 且商业利用受限),拿它当闸门等于用一个补不上的字段挡住已经做完的内容。
 * 详见 HANDOFF-2026-08-12「有权威源的 join,和没有源的创作」。
 */
const isDraftedWord = (w) => !(w?.exampleJp && w?.exampleZh && w?.exampleRoma);

const wordKey = (item) => `${item.word}-${item.reading}`;

function WordBankScreen({ wordBank, book, onBack }) {
  // 读写进度的逻辑不再写在这个页面里,统一走 useReviewProgress ——
  // 复习页读写的是同一份数据,两处各写一套迁移和落盘,迟早会长歪成两个口径。
  //
  // ✅ 2026-08-13 已提到 context(ReviewProgressProvider 挂在 PieTab)。
  // 这条注释原来写着「以后让两个页面同时挂载就会互相覆盖,到那时要提到 context,
  // 别指望这条注释以外的东西提醒你」—— 外部评审替它提醒了。
  // 现在结构上不可能出现两份副本:漏包 Provider 的调用点会直接抛,不会安静地
  // 拿到一份自己的 state。
  const { progress, ready: progressReady, grade } = useReviewProgress();
  // 今日队列 { date, keys, done }。落盘的 —— 以前它是个 useState,
  // 退出页面就没了,重进重新挑一批,用户永远做不完「今天的任务」。
  const [session, setSession] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  // 「先当词典翻」—— 只在整本还没定稿的词书上才会用到,见下面 skipDraftFilter
  const [showDrafts, setShowDrafts] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [navList, setNavList] = useState([]);
  // 从词场点进成员词时的返回栈(见下方 openMember)
  const [stack, setStack] = useState([]);
  const { speak, speakingKey } = useSpeech();

  // 词场的成员词按 id 找回词条。**全库找,不限本词书** ——
  // 紅葉(N2)的成员是 秋(N5)、落ち葉(N1),按词书切会有一半点不开。
  const lookupWord = useCallback(
    (id) => (id ? (wordBank || []).find(w => w.id === id) || null : null),
    [wordBank]
  );

  // 队列只从定稿词里挑,和列表默认显示的口径一致 —— 不能派一个连例句都没有的词当今日任务。
  const bankRef = useRef(wordBank);
  bankRef.current = wordBank;

  // 每本词书一条独立队列,落盘的是 { [bookId]: {date,keys,done} } 这整份。
  // 一份全局队列会串:在 N5 挑的 10 个词切到 N4 一个都不在词库里,
  // 用户看到的是「今日任务 10」点进去空列表。
  const bookId = book?.id || 'n5';
  const sessionAllRef = useRef({});

  // 进度就绪后挑一次今日队列。progress 不进依赖 —— 答一道题就重挑一批词是灾难。
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    if (!progressReady) return;
    let alive = true;
    setSession(null);
    (async () => {
      const today = todayStr();
      const savedSessions = await readJson(K.wordbankSession, null);
      if (!alive) return;

      const all = savedSessions && typeof savedSessions === 'object' && !Array.isArray(savedSessions)
        ? savedSessions : {};
      const saved = all[bookId];
      const fresh = saved && saved.date === today && Array.isArray(saved.keys)
        ? {
          date: today,
          keys: saved.keys,
          done: Array.isArray(saved.done) ? saved.done : [],
        }
        // 换了一天才重挑。同一天里进出多少次都是同一批词。
        : {
          date: today,
          keys: pickSession(
            (bankRef.current || []).filter(w => !isDraftedWord(w)),
            progressRef.current,
            { today, limit: DAILY_GOAL, keyOf: wordKey }
          ),
          done: [],
        };
      sessionAllRef.current = { ...all, [bookId]: fresh };
      setSession(fresh);
      writeJson(K.wordbankSession, sessionAllRef.current);
    })();
    return () => { alive = false; };
  }, [bookId, progressReady]);

  // 这一页不再有搜索框 —— 查词是全库的事,搬到了词书选择页。
  // 没人记得「注文」是 N4 还是 N3,按词书切分搜索本来就是错的切法。
  const searched = wordBank;
  const STATUS_FILTERS = [
    { id: 'all', label: '全部' },
    { id: 'new', label: '未学' },
    { id: 'learning', label: '学习中' },
    { id: 'mastered', label: '已掌握' },
  ];
  const today = todayStr();
  const statusOf = (w) => progress[wordKey(w)]?.status || 'new';
  const sessionKeys = session ? new Set(session.keys) : null;
  const doneKeys = session ? new Set(session.done) : new Set();

  const byStatus = statusFilter === 'today'
    ? searched.filter(w => sessionKeys && sessionKeys.has(wordKey(w)))
    : statusFilter === 'due'
    ? searched.filter(w => (progress[wordKey(w)]?.dueAt || '9999') <= today)
    : statusFilter === 'all' ? searched
    : searched.filter(w => statusOf(w) === statusFilter);
  // 词书 = 已定稿的那批(例句/罗马音/搭配齐全);其余词条只在「搜索」时出现,
  // 当词典用 —— 词典本来就不是每个词都配例句。
  // 不在界面上暴露 status,那是数据管道的词汇,不该让用户替开发者做质检。
  //
  // 「今日任务」和「待复习」两个视图不过这道滤:队列和到期表是按用户实际学过的词
  // 算出来的,用户可能是搜索时顺手学的起草词。滤掉它们会让按钮上写着「待复习 3」
  // 而列表里只有 2 条 —— 数字和眼前的东西对不上,比多显示一个粗糙词条更伤信任。
  //
  // showDrafts 是用户自己按下的第三种情况:整本都还在起草时(N3/N2/N1),
  // 上面那条规矩会把列表滤成空的 —— 而头部还写着「1798 词」。
  // 界面自相矛盾比内容粗糙严重得多,所以给一条出口:让他自己决定要不要当词典翻。
  // **默认仍然不给**,词书的定义没变。
  const skipDraftFilter = statusFilter === 'today' || statusFilter === 'due' || showDrafts;
  const filtered = skipDraftFilter ? byStatus : byStatus.filter(w => !isDraftedWord(w));

  // 只数这本书里的词。progress 是全局的(键是「词-读音」,不分书),
  // 直接数整张表会把 N3 的到期词算到 N5 的按钮上。
  const dueTotal = wordBank.reduce(
    (n, w) => n + ((progress[wordKey(w)]?.dueAt || '9999') <= today ? 1 : 0), 0
  );
  const todayLeft = session ? session.keys.filter(k => !doneKeys.has(k)).length : 0;
  // 这本书里有没有精修词。N3/N2/N1 现在整本都是机器起草,一条定稿词都没有,
  // 于是队列挑出来是空的 —— 而空队列和「今天做完了」在数据上长得一模一样。
  // 不区分的话,用户什么都没做就被告知「今日已完成」,这是界面在骗他。
  const finalCount = wordBank.reduce((n, w) => n + (isDraftedWord(w) ? 0 : 1), 0);
  const hasFinalWords = finalCount > 0;

  const startToday = () => setStatusFilter('today');

  /** 评一次分。g: 'again' | 'hard' | 'good' | 'mastered' */
  const gradeWord = (g) => {
    const key = wordKey(selectedWord);
    grade(key, g, bookId);   // 算记录 + 落盘 + 推云端,都在 hook 里,这里没有忘存的余地

    // 「忘了」不算做完 —— 它当天就该再见一次,标记成完成等于把它推到了明天。
    if (g === 'again') return;
    setSession(prev => {
      if (!prev || !prev.keys.includes(key) || prev.done.includes(key)) return prev;
      const next = { ...prev, done: [...prev.done, key] };
      sessionAllRef.current = { ...sessionAllRef.current, [bookId]: next };
      writeJson(K.wordbankSession, sessionAllRef.current);
      return next;
    });
  };

  // 点词场里的成员词跳进去。要能跳回来 —— 否则用户点一下就丢了刚才在读的那个词,
  // 于是再也不敢点,词场就白做了。所以留一个返回栈,而不是直接换掉当前词。
  const openMember = (entry) => {
    setStack(s => [...s, { word: selectedWord, idx: selectedIdx, list: navList }]);
    setSelectedWord(entry);
    setNavList([entry]);
    setSelectedIdx(0);
  };
  const goBack = () => {
    if (stack.length) {
      const prev = stack[stack.length - 1];
      setStack(s => s.slice(0, -1));
      setSelectedWord(prev.word);
      setSelectedIdx(prev.idx);
      setNavList(prev.list);
      return;
    }
    setSelectedWord(null);
  };

  if (selectedWord) {
    return (
      <WBDetailPage
        entry={selectedWord}
        record={progress[wordKey(selectedWord)] || null}
        today={today}
        onBack={goBack}
        onGrade={gradeWord}
        speak={speak}
        speakingKey={speakingKey}
        hasPrev={selectedIdx > 0}
        hasNext={selectedIdx < navList.length - 1}
        onPrev={() => { const ni = selectedIdx - 1; setSelectedWord(navList[ni]); setSelectedIdx(ni); }}
        onNext={() => { const ni = selectedIdx + 1; setSelectedWord(navList[ni]); setSelectedIdx(ni); }}
        lookupWord={lookupWord}
        onOpenWord={openMember}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={wb.hd}>
        <TouchableOpacity onPress={onBack}>
          <Text style={wb.back}>‹ 词书选择</Text>
        </TouchableOpacity>
        <Text style={wb.title}>{book?.level || 'N5'} {book?.title || '基础词库'}</Text>
        {/* 数字要和眼睛看到的对得上。整本都在起草时,写「1798 词」而列表是空的 ——
            用户只会得出「这 App 坏了」。所以起草的那部分单独说出来。 */}
        <Text style={wb.sub}>
          JLPT {book?.level || 'N5'} · {hasFinalWords ? `${finalCount} 词` : '还没有精修词条'}
          {wordBank.length > finalCount ? ` · 另有 ${wordBank.length - finalCount} 条起草中` : ''}
          {' · '}{book?.desc || '高频词块 · 例句'}
        </Text>
        <View style={wb.ctaRow}>
          <TouchableOpacity style={[wb.ctaBtn, statusFilter === 'today' && wb.ctaBtnActive]} onPress={startToday}>
            <Text style={[wb.ctaBtnTxt, statusFilter === 'today' && wb.ctaBtnTxtActive]}>
              {/* session 还没读出来时不能显示「今日已完成」—— 冷启动那一瞬间
                  告诉用户今天没事干,他就真的关掉了 */}
              {!session ? '今日任务'
                : !hasFinalWords ? '这本还在起草'
                : todayLeft > 0 ? `今日任务 ${todayLeft}` : '今日已完成'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[wb.ctaBtn, statusFilter === 'due' && wb.ctaBtnActive]} onPress={() => setStatusFilter('due')}>
            <Text style={[wb.ctaBtnTxt, statusFilter === 'due' && wb.ctaBtnTxtActive]}>待复习{dueTotal > 0 ? ` (${dueTotal})` : ''}</Text>
          </TouchableOpacity>
        </View>
        <View style={wb.filterRow}>
          {STATUS_FILTERS.map(f => (
            <TouchableOpacity key={f.id} style={[wb.filterChip, statusFilter === f.id && wb.filterChipActive]} onPress={() => setStatusFilter(f.id)}>
              <Text style={[wb.filterChipTxt, statusFilter === f.id && wb.filterChipTxtActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <FlatList
        style={{ flex: 1 }}
        data={filtered}
        keyExtractor={(item, idx) => `${item.word}-${item.reading}-${idx}`}
        contentContainerStyle={{ padding: 12, gap: 4 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const key = wordKey(item);
          const st = progress[key]?.status || 'new';
          const done = statusFilter === 'today' && doneKeys.has(key);
          return (
            <TouchableOpacity style={[wb.row, done && wb.rowDone]} onPress={() => { setSelectedWord(item); setSelectedIdx(index); setNavList(filtered); }} activeOpacity={0.7}>
              <View style={wb.rowHead}>
                <Text style={wb.word}>{item.word}</Text>
                <Text style={wb.reading}>{item.reading}</Text>
                <View style={wb.posTag}><Text style={wb.posTagTxt}>{item.pos}</Text></View>
                {/* 起草稿混进列表时必须能一眼认出来。不标的话用户会拿它和精修词条
                    等同看待,然后得出「这本书的例句怎么时有时无」——那比粗糙本身更伤 */}
                {isDraftedWord(item) && (
                  <View style={wb.draftTag}><Text style={wb.draftTagTxt}>起草</Text></View>
                )}
                {done ? <Text style={wb.checkMastered}>今天过了</Text>
                  : st === 'learning' ? <View style={wb.dotLearning} />
                  : st === 'mastered' ? <Text style={wb.checkMastered}>✓</Text> : null}
              </View>
              <Text style={wb.zh}>{item.meaning_zh}</Text>
              {!!item.coreChunk && <Text style={wb.chunk}>{item.coreChunk}</Text>}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={(
          // 整本还在起草是**最常见**的空,却曾经掉进最后那句「这里还没有词」——
          // 而头部同时写着 1798 词。词条明明在,只是还没配例句和搭配,
          // 说成「没有词」是界面在骗人。所以这一支单独说清楚,并且给一条出口。
          !hasFinalWords && !showDrafts && statusFilter !== 'due' ? (
            <View style={wb.emptyBox}>
              <Text style={wb.empty}>
                这本还在起草。{'\n'}
                {wordBank.length} 条已经有释义和读音,{'\n'}
                但还没配例句、搭配和罗马音。
              </Text>
              <TouchableOpacity style={wb.emptyBtn} onPress={() => setShowDrafts(true)}>
                <Text style={wb.emptyBtnTxt}>先当词典翻</Text>
              </TouchableOpacity>
              {/* 说清楚按下去会得到什么,别让人点完才发现内容比别的书粗糙 */}
              <Text style={wb.emptyNote}>翻的是起草稿,每条都会标出来</Text>
            </View>
          ) : (
            <Text style={wb.empty}>
              {statusFilter === 'due' ? '今天没有到期的词,明天再来'
                : statusFilter === 'today' && session ? '今日任务已完成'
                : '这里还没有词'}
            </Text>
          )
        )}
      />
    </View>
  );
}
const wb = StyleSheet.create({
  hd: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border, gap: 7 },
  back: { fontSize: 13, color: C.lava, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: C.ink },
  sub: { fontSize: 11, color: C.muted, marginTop: -3 },
  ctaRow: { flexDirection: 'row', gap: 6 },
  ctaBtn: { flex: 1, borderRadius: 6, paddingVertical: 7, alignItems: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.white },
  ctaBtnActive: { backgroundColor: C.lava, borderColor: C.lava },
  ctaBtnTxt: { fontSize: 12, fontWeight: '600', color: C.muted },
  ctaBtnTxtActive: { color: C.white },
  filterRow: { flexDirection: 'row', gap: 5 },
  filterChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: C.border, backgroundColor: C.white },
  filterChipActive: { backgroundColor: C.ink, borderColor: C.ink },
  filterChipTxt: { fontSize: 11, fontWeight: '600', color: C.muted },
  filterChipTxtActive: { color: C.white },
  row: { backgroundColor: C.white, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: C.border, gap: 3 },
  rowDone: { opacity: 0.5 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  word: { fontSize: 16, fontWeight: '700', color: C.ink },
  reading: { fontSize: 11, color: C.muted },
  posTag: { backgroundColor: C.tag, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  posTagTxt: { fontSize: 9, color: C.muted, fontWeight: '600' },
  // 起草标记:描边不填色,比词性标签更轻 —— 它是个说明,不是一枚勋章
  draftTag: { borderWidth: StyleSheet.hairlineWidth, borderColor: C.muted, borderRadius: 999,
              paddingHorizontal: 6, paddingVertical: 1 },
  draftTagTxt: { fontSize: 9, color: C.muted },
  emptyBox: { alignItems: 'center', marginTop: 40, gap: 14, paddingHorizontal: 24 },
  emptyBtn: { borderWidth: 1, borderColor: C.ink, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  emptyBtnTxt: { fontSize: 14, color: C.ink, fontWeight: '600' },
  emptyNote: { fontSize: 12, color: C.muted, textAlign: 'center' },
  dotLearning: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold, marginLeft: 'auto' },
  checkMastered: { fontSize: 12, color: C.lava, fontWeight: '700', marginLeft: 'auto' },
  zh: { fontSize: 12, color: C.ink },
  chunk: { fontSize: 11, color: C.muted, fontStyle: 'italic' },
  empty: { textAlign: 'center', color: C.muted, marginTop: 40, fontSize: 14 },
});

// 词源桥:借词的来源语言(英语桥 = 用你已经会的学新的)
const LOAN_LANG = {
  eng: '英语', ger: '德语', fre: '法语', por: '葡萄牙语', dut: '荷兰语',
  ita: '意大利语', spa: '西班牙语', kor: '韩语', chi: '汉语', rus: '俄语',
  lat: '拉丁语', gre: '希腊语',
};

function WBDetailPage({ entry, record, today, onBack, onGrade, speak, speakingKey, hasPrev, hasNext, onPrev, onNext, lookupWord, onOpenWord }) {
  // 词场:这个词真实出现时,身边站着哪些词。
  // 关键是**一个句子**而不是并列的词块 —— 秋(季节)、山(地点)、温泉(要做的事)
  // 是三种不同的关系,摊成一排格子等于让用户自己猜关系。第一版就是这么翻的车。
  //
  // 内容还在 staging,没并进内容包,所以开发期先从预览表读 —— 见 wordfield-preview.json。
  // 一个词可以有多个词场(大丈夫 的「没事」和「婉拒」是两个完全不同的场合),
  // 但**仍然是一张卡** —— 分成两张会让用户以为是两个词。
  const rawField = entry.wordField || (__DEV__ ? WORDFIELD_PREVIEW[entry.id] : null);
  const wordFields = (Array.isArray(rawField) ? rawField : (rawField ? [rawField] : []))
    .filter(f => f?.sentence?.jp);
  useEffect(() => {
    // ⚠️ 喂读音不是汉字。TTS 拿汉字自己挑读音,而这张卡上写着的是**某一个**读音:
    // `私` 有 わたし / わたくし 两条词条,卡上写 わたくし、念出来是 わたし,
    // 用户没有第三个地方可以核对。批次页早就这么做了,这里(而且是进页面自动播)没跟上。
    speak(primaryReading(entry.reading), 'ja-JP', `wd-auto-${entry.word}`);
  }, [entry.word]);

  // 评分后自动翻下一词。「忘了」不翻 —— 那个词当天还要再见,
  // 直接跳走会让人以为自己刚才标错了。
  const handleGrade = (grade) => {
    onGrade(grade);
    if (hasNext && grade !== 'again') setTimeout(onNext, 120);
  };

  // 让间隔可见。用户凭什么信任「系统会在合适的时候再问我」——
  // 只有把「下次:8月12日」摆出来,这个承诺才是可验证的。
  const nextHint = !record ? '还没学过'
    : record.dueAt <= today ? '今天到期'
    : `下次 ${record.dueAt.slice(5).replace('-', '月')}日`;

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={wd.nav}>
        <TouchableOpacity onPress={onBack}>
          <Text style={wd.navBack}>‹ 返回词库</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={wd.scroll} showsVerticalScrollIndicator={false}>
        <View style={wd.hero}>
          <View style={{ flex: 1 }}>
            {/* 假名压在对应汉字上。词书页是**查词**入口 ——
                对不会读的人,这里的价值比批次页还大。
                对不上会自己退回纯词面(见 furigana.ts,不瞎标)。 */}
            <Furigana word={entry.word} reading={entry.reading} size={32} color={C.ink} />
            {/* 声调数据还在 staging,没并进内容包,开发期从预览表读 ——
                和词场同一个模式(见 pitch-preview.json,它是派生物,别手改)。
                拿不到就退回原来那行纯假名:没有声调不影响这张卡能用。 */}
            {/* ⚠️ 喂 primaryReading 不是整串。`行く` 的 reading 是「いく; ゆく」,
                整串扔进去 toMora 会切出 **6 拍**:い|く|;|␣|ゆ|く ——
                声调线直接画在分号和空格上。
                这个 bug 原本被「这 12 条没有 pitch 所以不渲染」盖着,
                补上音调数据的当天就会露出来。批次页早就用 primaryReading 了,
                这里没跟上 —— **同一个口径散在两个文件里,就会有一处忘记跟。** */}
            {pitchOf(entry) != null
              ? <PitchLine reading={primaryReading(entry.reading)} accent={pitchOf(entry)} />
              : <Text style={wd.reading}>{primaryReading(entry.reading)}</Text>}
            {/* 多型 / 多读音,和批次页同一套提示 ——
                不标的话用户会把可能不对的那个型当唯一答案背下去(850 条),
                或者在别处听到 ゆく 时以为那是另一个词(12 条)。 */}
            {hasMultiAccent(entry) && (
              <Text style={wd.altNote}>这个词不止一个调型,这里显示的是其中一个</Text>
            )}
            {altReadings(entry.reading).length > 0 && (
              <Text style={wd.altNote}>也读作 {altReadings(entry.reading).join(' / ')}</Text>
            )}
            {/* 声调的确定性要说出来,词书页和批次页同一句话 */}
            {pitchUnconfirmed(entry) && (
              <Text style={wd.altNote}>这个调型只有一个来源,还没有第二处印证</Text>
            )}
          </View>
          <SpeakBtn onPress={() => speak(primaryReading(entry.reading), 'ja-JP', 'wd-word')} speaking={speakingKey === 'wd-word'} size="sm" color={C.lava} />
        </View>
        <View style={wd.metaRow}>
          <View style={wd.posTag}><Text style={wd.posTagTxt}>{entry.pos}</Text></View>
        </View>
        <View style={wd.meaningBlock}>
          <Text style={wd.zh}>{entry.meaning_zh}</Text>
          {/* 按义项分行,不挤成一串。一个词有几个意思,用户扫一眼就该知道 ——
              而不是等他自己从 `a; b | c; d` 里看出那个竖线是分界。
              ⚠️ 不和中文按下标配对:meaning_zh 全库 0 条带分隔符,
              而且中英义项数对不上的有 881 条(见 meaningSenses.ts)。 */}
          {!!entry.meaning_en && <SenseList text={entry.meaning_en} style={wd.enBlock} />}
        </View>
        {wordFields.map((wordField, fi) => (
          <View key={fi} style={wd.section}>
            {/* 标题跟着词走(「秋天会一起遇到」),不用固定的「相关词」——
                固定标题会逼人把不同关系塞进同一个筐 */}
            <Text style={wd.sectionLabel}>{wordField.label || '一起出现'}</Text>
            <View style={wd.exRow}>
              <View style={{ flex: 1, gap: 3 }}>
                <ExampleSentence sentence={wordField.sentence.jp} tokens={null} size={17} />
                {!!wordField.sentence.roma && <Text style={wd.exRoma}>{wordField.sentence.roma}</Text>}
                <Text style={wd.exZh}>{wordField.sentence.zh}</Text>
              </View>
              <SpeakBtn onPress={() => speak(wordField.sentence.jp, 'ja-JP', `wd-wf${fi}`)} speaking={speakingKey === `wd-wf${fi}`} size="sm" color={C.muted} />
            </View>
            <View style={wd.wfChips}>
              {(wordField.members || []).map((m) => {
                const w = lookupWord?.(m.id);
                // 查不到就不显示这一个,而不是显示一个点不动的空壳 ——
                // 标准里那条硬规则:成员必须对得上词库里真实存在的词条
                if (!w) return null;
                return (
                  <TouchableOpacity key={`${fi}-${m.id}`} style={wd.wfChip} activeOpacity={0.7}
                    onPress={() => onOpenWord?.(w)}>
                    <Text style={wd.wfChipJp}>{w.word}</Text>
                    <Text style={wd.wfChipZh}>{w.meaning_zh}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
        {Array.isArray(entry.loanSource) && entry.loanSource.length > 0 && (
          <View style={wd.section}>
            <Text style={wd.sectionLabel}>词源</Text>
            <Text style={wd.loanTxt}>
              {'← '}
              {entry.loanSource
                .map(ls => [LOAN_LANG[ls.lang] || ls.lang, ls.word].filter(Boolean).join(' '))
                .join(' · ')}
            </Text>
          </View>
        )}
        {!!entry.coreChunk && (
          <View style={wd.section}>
            <Text style={wd.sectionLabel}>搭配</Text>
            <View style={wd.exRow}>
              <ExampleSentence sentence={entry.coreChunk} tokens={null} size={15} />
              <SpeakBtn onPress={() => speak(entry.coreChunk, 'ja-JP', 'wd-chunk')} speaking={speakingKey === 'wd-chunk'} size="sm" color={C.muted} />
            </View>
          </View>
        )}
        {/* 词场句已经是这个词最好的例句了,一模一样就别说第二遍(自查九条:不赘) */}
        {!!entry.exampleJp && !wordFields.some(f => f.sentence.jp === entry.exampleJp) && (
          <View style={wd.section}>
            <Text style={wd.sectionLabel}>例句</Text>
            <View style={wd.exRow}>
              <View style={{ flex: 1, gap: 3 }}>
                {/* 按词切开 + 汉字上注音。分词是离线跑好的,只有例句有 ——
                    搭配(coreChunk)和词场句没有对应的 token,
                    ExampleSentence 拿不到 tokens 会整句退回纯文本,所以传空也安全。 */}
                <ExampleSentence sentence={entry.exampleJp} tokens={EXAMPLE_TOKENS[entry.id]} size={15} />
                {!!entry.exampleRoma && <Text style={wd.exRoma}>{entry.exampleRoma}</Text>}
                <Text style={wd.exZh}>{entry.exampleZh}</Text>
              </View>
              <SpeakBtn onPress={() => speak(entry.exampleJp, 'ja-JP', 'wd-ex')} speaking={speakingKey === 'wd-ex'} size="sm" color={C.muted} />
            </View>
          </View>
        )}
        <View style={wd.section}>
          <View style={wd.gradeMeta}>
            <Text style={wd.gradeHint}>{nextHint}</Text>
            {!!record?.lapses && <Text style={wd.gradeHint}>忘过 {record.lapses} 次</Text>}
          </View>
          <View style={wd.statusRow}>
            <TouchableOpacity style={[wd.statusChip, wd.gradeAgain]} onPress={() => handleGrade('again')}>
              <Text style={[wd.statusTxt, wd.statusTxtX]}>忘了</Text>
            </TouchableOpacity>
            <TouchableOpacity style={wd.statusChip} onPress={() => handleGrade('hard')}>
              <Text style={wd.statusTxt}>一般</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[wd.statusChip, wd.gradeGood]} onPress={() => handleGrade('good')}>
              <Text style={[wd.statusTxt, wd.statusTxtCheck]}>会了</Text>
            </TouchableOpacity>
          </View>
          {record?.status !== 'mastered' && (
            <TouchableOpacity style={wd.masterBtn} onPress={() => handleGrade('mastered')}>
              <Text style={wd.masterTxt}>这个词不用再问我了</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
      <View style={wd.bottomNav}>
        <TouchableOpacity style={[wd.bottomNavBtn, !hasPrev && wd.bottomNavBtnDisabled]} onPress={hasPrev ? onPrev : undefined} activeOpacity={hasPrev ? 0.7 : 1}>
          <Text style={[wd.bottomNavTxt, !hasPrev && wd.bottomNavTxtDisabled]}>‹ 上一词</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[wd.bottomNavBtn, wd.bottomNavBtnNext, !hasNext && wd.bottomNavBtnDisabled]} onPress={hasNext ? onNext : undefined} activeOpacity={hasNext ? 0.7 : 1}>
          <Text style={[wd.bottomNavTxt, !hasNext && wd.bottomNavTxtDisabled]}>下一词 ›</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const wd = StyleSheet.create({
  nav: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  navBack: { fontSize: 13, color: C.lava, fontWeight: '600' },
  scroll: { paddingBottom: 60 },
  hero: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, gap: 10 },
  word: { fontSize: 32, fontWeight: '700', color: C.ink },
  reading: { fontSize: 14, color: C.muted, marginTop: 2 },
  // 声调线:一条**完整的阶梯轮廓**,不是只在高的地方画一段。
  //
  // 第一版只给高的那几拍画了顶线。頭高的词(挨拶)于是只剩第一个假名头上一个小拐角,
  // 用户的反馈是「有一点没看懂」—— 那不是他没学过,是那个图形本身没有信息:
  // 一小段线没有对照物,读不出「相对谁高」。
  //
  // 声调线的样式跟着组件搬去了 features/wordbank/PitchLine.js
  metaRow: { paddingHorizontal: 16, marginTop: 6, flexDirection: 'row', gap: 6 },
  posTag: { backgroundColor: C.tag, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  posTagTxt: { fontSize: 10, color: C.muted, fontWeight: '600' },
  meaningBlock: { paddingHorizontal: 16, paddingVertical: 12, marginTop: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border, gap: 4 },
  zh: { fontSize: 17, fontWeight: '600', color: C.ink },
  altNote: { fontSize: 10.5, color: C.mutedLight, marginTop: 4, lineHeight: 15 },
  // 英文释义现在由 SenseList 排(要分行编号),这里只留外边距
  enBlock: { marginTop: 4 },
  section: { marginHorizontal: 16, marginTop: 16, gap: 8 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: C.mutedLight, letterSpacing: 0.8, textTransform: 'uppercase' },
  loanTxt: { fontSize: 14, color: C.teal, fontWeight: '500', marginTop: 2 },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exJp: { flex: 1, fontSize: 15, color: C.ink, fontWeight: '500' },
  // 词场句比普通例句大一号:它是这张卡的主句,不是补充材料
  wfJp: { fontSize: 17, color: C.ink, fontWeight: '600', lineHeight: 26 },
  wfChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  wfChip: {
    flexDirection: 'row', alignItems: 'baseline', gap: 5,
    borderWidth: 1, borderColor: C.border, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.white,
  },
  wfChipJp: { fontSize: 13, color: C.ink, fontWeight: '600' },
  wfChipZh: { fontSize: 11, color: C.muted },
  exRoma: { fontSize: 11, color: C.mutedLight, lineHeight: 16 },
  exZh: { fontSize: 12, color: C.muted },
  statusRow: { flexDirection: 'row', gap: 8 },
  statusChip: { flex: 1, borderRadius: 6, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.white },
  // 三档评分:两端着色、中间留白 —— 「一般」是最常被点的一档,
  // 让它最轻,免得用户为了「点哪个颜色好看」而不是按真实记忆去选。
  gradeAgain: { backgroundColor: C.lava, borderColor: C.lava },
  gradeGood: { backgroundColor: C.ink, borderColor: C.ink },
  statusTxt: { fontSize: 13, fontWeight: '700', color: C.muted },
  statusTxtX: { color: C.white },
  statusTxtCheck: { color: C.white },
  gradeMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  gradeHint: { fontSize: 11, color: C.muted },
  masterBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 6 },
  masterTxt: { fontSize: 11, color: C.mutedLight, fontWeight: '600' },
  bottomNav: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.white },
  bottomNavBtn: { flex: 1, paddingVertical: 13, alignItems: 'center' },
  bottomNavBtnNext: { borderLeftWidth: 1, borderLeftColor: C.border },
  bottomNavBtnDisabled: { opacity: 0.3 },
  bottomNavTxt: { fontSize: 13, fontWeight: '600', color: C.lava },
  bottomNavTxtDisabled: { color: C.muted },
});

// ─────────────────────────────────────────────
// Scene Intro Screen
// ─────────────────────────────────────────────
function SceneIntroScreen({ scene, onBack, onStart }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={si.nav}>
        <TouchableOpacity onPress={onBack}>
          <Text style={[si.navBack, { color: scene.color }]}>‹ 返回场景列表</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={si.scroll} showsVerticalScrollIndicator={false}>
        <View style={[si.hero, { backgroundColor: scene.bgColor, borderColor: scene.color + '30' }]}>
          <Text style={si.emoji}>{scene.emoji}</Text>
          <Text style={[si.title, { color: scene.color }]}>{scene.label}</Text>
          <Text style={si.desc}>{scene.desc}</Text>
          <Text style={si.meta}>{scene.phrases?.length || 0} 句 · 开始前先看一下这组要解决什么问题</Text>
        </View>
        {scene.starter && scene.starter.items && scene.starter.items.length > 0 && (
  <View style={si.starterBox}>
    <Text style={si.starterTitle}>{scene.starter.title}</Text>
    {scene.starter.items.map((item, i) => (
      <View key={i} style={si.item}>
        <Text style={si.bullet}>•</Text>
        <Text style={si.itemTxt}>{item}</Text>
      </View>
    ))}
  </View>
)}
        {scene.goal && scene.goal.length > 0 && (
  <View style={si.box}>
    <Text style={si.boxTitle}>学完这一组，你应该能：</Text>
    {scene.goal.map((g, i) => (
      <View key={i} style={si.item}>
        <Text style={si.bullet}>•</Text>
        <Text style={si.itemTxt}>{g}</Text>
      </View>
    ))}
  </View>
)}

{scene.notes && scene.notes.length > 0 && (
  <View style={si.box}>
    <Text style={si.boxTitle}>场景须知</Text>
    {scene.notes.map((n, i) => (
      <View key={i} style={si.noteCard}>
        <Text style={[si.noteTitle, { color: scene.color }]}>{n.t}</Text>
        <Text style={si.noteBody}>{n.b}</Text>
      </View>
    ))}
  </View>
)}


        <TouchableOpacity style={[si.startBtn, { backgroundColor: scene.color }]} onPress={onStart}>
          <Text style={si.startBtnTxt}>开始学习</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const si = StyleSheet.create({
  nav: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  navBack: {
    fontSize: 15,
    fontWeight: '500',
  },
  scroll: {
    padding: 18,
    paddingBottom: 32,
  },
  hero: {
    borderRadius: 18,
    padding: 20,
    borderWidth: 1.5,
    marginBottom: 14,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 34,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  desc: {
    fontSize: 13,
    color: C.ink,
    textAlign: 'center',
    lineHeight: 20,
  },
  meta: {
    fontSize: 11,
    color: C.muted,
    marginTop: 8,
    textAlign: 'center',
  },
  box: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 12,
  },
  boxTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
    marginBottom: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 7,
  },
  bullet: {
    width: 14,
    fontSize: 13,
    color: C.lava,
    lineHeight: 20,
  },
  itemTxt: {
    flex: 1,
    fontSize: 13,
    color: C.ink,
    lineHeight: 20,
  },
  noteCard: {
    backgroundColor: C.paper,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  noteTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  noteBody: {
    fontSize: 13,
    color: C.ink,
    lineHeight: 20,
  },
  startBtn: {
    marginTop: 8,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  startBtnTxt: {
    fontSize: 15,
    color: C.white,
    fontWeight: '700',
  },
  starterBox: {
  backgroundColor: '#fff7e8',
  borderRadius: 16,
  padding: 16,
  borderWidth: 1.5,
  borderColor: '#f0dfb2',
  marginBottom: 12,
},
starterTitle: {
  fontSize: 14,
  fontWeight: '700',
  color: '#8a5a10',
  marginBottom: 10,
},
});
// ─────────────────────────────────────────────
// Card Screen
// ─────────────────────────────────────────────
// 内置副本:兜底用。
// 深度词卡的权威来源是 content.json 的 wordCards —— 放在内容里才能热更新、不过审。
// 这份留着是为了:① 首次启动还没拉到远端内容时有东西可看;
// ② 万一远端内容缺了这个字段,不至于点进去白屏。
// 新增/修改词卡请改 content.v2.json,不要改这里。
const WORD_CARDS_BUILTIN = {
  order: {
    word: '注文', reading: 'ちゅうもん', jlpt: 'N4', sourceLabel: '餐厅点餐',
    coreMeaning: '点餐 · 下单',
    tags: ['旅行高频', '餐厅'],
    coreSentence: 'すみません、注文をお願いします。',
    coreTranslation: '不好意思，我要点餐了。',
    coreTokens: [
      { text: 'すみません、' },
      { text: '注文', noteKey: 'order', style: 'lava' },
      { text: 'を', noteKey: 'wo', style: 'blue' },
      { text: 'お願いします', noteKey: 'onegai', style: 'plain' },
      { text: '。' },
    ],
    trap: { front: '注文 ≠ 注解文字', back: '真实含义：点餐 / 下单\n是动作，不是文字。' },
    contextJa: '注文しました', contextZh: '，网购里也常见。',
    pitch: [{ char: 'ちゅ', high: false }, { char: 'う', high: true }, { char: 'も', high: true }, { char: 'ん', high: false }],
    notes: {
      order: { title: '注文', body: '注文是行动信号，不只是”点餐”这个动作名词。你说出这个词，等于告诉店员：我选好了，可以来了。' },
      wo: { title: 'を', body: 'を：把前面的「注文」变成请求处理的对象。注文を = 把点餐这件事交给对方处理。' },
      onegai: { title: 'お願いします', body: 'お願いします：礼貌请求的万能结尾。比直接说ください更软，对店员很自然。' },
      es: { title: 'ES｜pedir', body: '源自拉丁 petere「寻求、去要」。英文 appetite、petition 同根。点餐这件事，西语和日语都落在「我要去要」这个动作上。' },
    },
    grammarBlocks: [
      { particle: 'を', particleSize: 24, label: '助词', body: 'を 像传送带，\n把「注文」送到 お願いします 那里。' },
      { particle: 'お願いします', particleSize: 20, label: '万能礼貌结尾', body: 'ください 是「给我」，お願いします 是「我托付你」。\n一字之差，是日语礼貌感的核心。\n对朋友可以直接说「お願い」。' },
    ],
    skeletonTitle: '换个请求',
    skeletonPrefix: '', skeletonSuffix: 'をお願いします',
    skeletons: [
      { jp: '注文をお願いします', zh: '麻烦点餐', chipLabel: '点餐' },
      { jp: '会計をお願いします', zh: '麻烦结账', chipLabel: '结账' },
      { jp: '予約をお願いします', zh: '麻烦预约', chipLabel: '预约' },
      { jp: '写真をお願いします', zh: '麻烦帮我拍照', chipLabel: '拍照' },
    ],
    examples: [
      { jp: 'すみません、注文をお願いします。', zh: '不好意思，我要点餐。', scene: '餐厅', who: 'say', level: 'N4' },
      { jp: '注文してもいいですか？', zh: '现在可以点单吗？', scene: '咖啡馆', who: 'say', level: 'N4' },
      { jp: 'ご注文はお決まりですか？', zh: '您想好点什么了吗？', scene: '餐厅', who: 'listen', level: 'N4' },
      { jp: '昨日、本を注文しました。', zh: '昨天我下单买了一本书。', scene: '网购', who: 'say', level: 'N4' },
    ],
    related: [{ jp: '会計', zh: '结账' }, { jp: 'ください', zh: '请给我' }, { jp: 'メニュー', zh: '菜单' }, { jp: '予約', zh: '预约' }],
    relatedLabel: '在餐厅还会遇到',
  },

  sumimasen: {
    word: 'すみません', reading: 'sumimasen', jlpt: 'N5', sourceLabel: '地铁 & 交通',
    coreMeaning: '打扰一下 · 对不起',
    tags: ['旅行高频', '通用'],
    coreSentence: 'すみません、写真をお願いします。',
    coreTranslation: '不好意思，麻烦帮我拍个照。',
    coreTokens: [
      { text: 'すみません', style: 'lava' },
      { text: '、写真をお願いします。' },
    ],
    trap: null,
    contextJa: null,
    contextZh: null,
    pitch: [{ char: 'す', high: false }, { char: 'み', high: true }, { char: 'ま', high: true }, { char: 'せ', high: true }, { char: 'ん', high: true }],
    notes: {},
    grammarBlocks: [
      {
        type: 'morph',
        label: '词根',
        chain: [
          { text: '済む', sub: '了结' },
          { text: '済みません', sub: '还没了结', active: true },
        ],
        transform: '→ ません',
        body: '打扰你 / 寻求帮助 = 占用了对方的注意力与时间 (未了结态)',
      },
      {
        type: 'compare',
        heading: '为什么也能表达谢谢？',
        scenario: '帮我拿外套',
        left: { word: 'すみません', scenario: '帮我拿一下外套', state: '对方还在付出' },
        right: { word: 'ありがとう', scenario: '帮我拿了外套', state: '对方已帮完' },
        compound: 'すみません、ありがとうございます。',
        compoundLabel: '两句连说也自然',
      },
    ],
    skeletonTitle: '换个需求',
    skeletonPrefix: 'すみません、', skeletonSuffix: '',
    skeletons: [
      { jp: 'すみません、写真をお願いします。', zh: '麻烦帮我拍照', chipLabel: '拍照' },
      { jp: 'すみません、〇〇はどこですか？', zh: '请问〇〇在哪里', chipLabel: '问路' },
      { jp: 'すみません、通してください。', zh: '让我过一下', chipLabel: '让路' },
      { jp: 'すみません、もう一度お願いします。', zh: '请再说一遍', chipLabel: '再说一遍' },
    ],
    examples: [
      { jp: 'すみません、ちょっと通してください。', zh: '不好意思，我要过去一下。', scene: '地铁', who: 'say', level: 'N5' },
      { jp: 'すみません、落としましたよ。', zh: '不好意思，你掉东西了。', scene: '街上', who: 'say', level: 'N5' },
      { jp: 'すみません！お水をください。', zh: '不好意思，请给我水。', scene: '餐厅', who: 'say', level: 'N5' },
      { jp: 'あ、すみません。', zh: '啊，对不起。', scene: '不小心碰到人', who: 'say', level: 'N5' },
    ],
    related: [{ jp: 'ありがとうございます', zh: '谢谢' }, { jp: '申し訳ありません', zh: '非常抱歉（重度）' }],
    relatedLabel: '同场合常用词',
  },

  oyu: {
    word: 'お湯', reading: 'おゆ', jlpt: 'N4', sourceLabel: '酒店入住',
    coreMeaning: '热水',
    tags: ['酒店', '陷阱词'],
    coreSentence: 'お湯が出ないのですが…',
    coreTranslation: '热水出不来……',
    coreTokens: [
      { text: 'お' },
      { text: '湯', noteKey: 'yu', style: 'lava' },
      { text: 'が出ないのですが…' },
    ],
    trap: { front: '湯 ≠ 汤', back: '日语「湯」= 热水，不是汤！\nスープ / 汁 才是汤。' },
    contextJa: 'お湯をください。', contextZh: '——在餐厅要热水，同一个词。',
    pitch: [{ char: 'お', high: false }, { char: 'ゆ', high: true }],
    notes: {
      yu: { title: '湯', body: '湯 = 热水，不是汤。这是汉字圈最容易踩的陷阱之一。\n日本餐厅里「お湯」= 热水，汤要说スープ或汁（しる）。' },
      o: { title: 'お', body: '礼貌前缀。お + 湯 = 热水（礼貌说法）。日语里很多日常名词前加お表示礼貌，去掉也能说，但显得随意。' },
      noda: { title: '〜のですが…', body: '「〜のですが」句尾不说完，表示「（所以请帮我处理）」。日本人听到这个语气词，立刻知道你在委婉请求帮助。' },
    },
    grammarBlocks: [
      { particle: '湯', particleSize: 28, label: '汉字陷阱', body: '中文「汤」≠ 日文「湯」\n日语「湯」= 热水。在餐厅说「お湯ください」要的是热水，不是汤。\n汤要说スープ（soup）或汁（しる）。' },
      { particle: '〜のですが…', particleSize: 16, label: '省略请求句', body: '句子不说完反而更自然。「〜のですが…」= 因为……（所以希望你帮我处理）。\n任何问题都能套：\nシャワーが壊れているのですが…\nエアコンが動かないのですが…' },
    ],
    skeletonTitle: '换个问题',
    skeletonPrefix: '', skeletonSuffix: 'のですが…',
    skeletons: [
      { jp: 'お湯が出ないのですが…', zh: '热水出不来', chipLabel: '热水' },
      { jp: 'シャワーが壊れているのですが…', zh: '淋浴坏了', chipLabel: '淋浴' },
      { jp: 'エアコンが動かないのですが…', zh: '空调不动了', chipLabel: '空调' },
      { jp: 'カギが開かないのですが…', zh: '钥匙打不开', chipLabel: '钥匙' },
    ],
    examples: [
      { jp: 'お湯が出ないのですが、確認していただけますか？', zh: '热水出不来，可以帮我确认一下吗？', scene: '酒店', who: 'say', level: 'N4' },
      { jp: 'お湯をください。', zh: '请给我热水。', scene: '餐厅', who: 'say', level: 'N4' },
      { jp: 'お湯で溶かしてください。', zh: '请用热水溶化。', scene: '便利店食品', who: 'listen', level: 'N4' },
    ],
    related: [{ jp: '水（みず）', zh: '冷水' }, { jp: 'スープ', zh: '汤（soup）' }, { jp: 'お風呂', zh: '浴缸热水' }],
    relatedLabel: '相关词汇',
  },

  okaikei: {
    word: 'お会計', reading: 'おかいけい', jlpt: 'N4', sourceLabel: '餐厅点餐',
    coreMeaning: '结账',
    tags: ['餐厅', '高频'],
    coreSentence: 'お会計をお願いします。',
    coreTranslation: '麻烦结账。',
    coreTokens: [
      { text: 'お' },
      { text: '会計', noteKey: 'kaikei', style: 'lava' },
      { text: 'を', noteKey: 'wo', style: 'blue' },
      { text: 'お願いします', noteKey: 'onegai', style: 'plain' },
      { text: '。' },
    ],
    trap: null,
    contextJa: null, contextZh: null,
    pitch: [{ char: 'お', high: false }, { char: 'か', high: true }, { char: 'い', high: true }, { char: 'け', high: true }, { char: 'い', high: false }],
    notes: {
      kaikei: { title: '会計', body: '结账的账单。\n注意：日语「会計」≠ 中文「会计（职业）」。\nお勘定（おかんじょう）= 同义，两个说法都通。' },
      wo: { title: 'を', body: 'を把「会計」传送给お願いします处理。\n同一框架：〇〇をお願いします，换个名词就是新的礼貌请求。' },
      onegai: { title: 'お願いします', body: '万能礼貌结尾。比ください更软，正式场合用这个。\n任何名词后面接上，都变成得体的请求。' },
    },
    grammarBlocks: [
      { particle: '会計', particleSize: 24, label: '汉字解析', body: '会 + 計 = 计算账目、结账。\n注意：日语「会計」= 结账/账单，≠ 中文「会计（职业）」。\nお勘定（おかんじょう）= 同义，两种说法都通。' },
      { particle: 'お〇〇をお願いします', particleSize: 13, label: '万能服务请求框架', body: '任何服务或物品前套上这个框架都成立：\nおすすめをお願いします（推荐菜）\nお箸をお願いします（筷子）\nキャンセルをお願いします（取消）' },
    ],
    skeletonTitle: '换个服务',
    skeletonPrefix: '', skeletonSuffix: 'をお願いします',
    skeletons: [
      { jp: 'お会計をお願いします', zh: '麻烦结账', chipLabel: '结账' },
      { jp: 'お箸をお願いします', zh: '麻烦给我筷子', chipLabel: '筷子' },
      { jp: 'キャンセルをお願いします', zh: '麻烦取消', chipLabel: '取消' },
      { jp: '領収書をお願いします', zh: '麻烦给我收据', chipLabel: '收据' },
    ],
    examples: [
      { jp: 'すみません、お会計をお願いします。', zh: '不好意思，麻烦结账。', scene: '餐厅', who: 'say', level: 'N4' },
      { jp: 'お会計はご一緒ですか？', zh: '你们一起结账吗？', scene: '餐厅', who: 'listen', level: 'N4' },
      { jp: '別々でお願いします。', zh: '分开结账。', scene: '餐厅', who: 'say', level: 'N4' },
      { jp: 'カードでお支払いできますか？', zh: '可以刷卡吗？', scene: '收银台', who: 'say', level: 'N4' },
    ],
    related: [{ jp: '注文', zh: '点餐' }, { jp: '割り勘', zh: 'AA制' }, { jp: 'レシート', zh: '小票' }],
    relatedLabel: '餐厅结账相关',
  },

  norikae: {
    word: '乗り換え', reading: 'のりかえ', jlpt: 'N3', sourceLabel: '地铁 & 交通',
    coreMeaning: '换乘',
    tags: ['地铁', '高频'],
    coreSentence: '乗り換えはどこですか？',
    coreTranslation: '换乘在哪里？',
    coreTokens: [
      { text: '乗り換え', noteKey: 'kanji', style: 'lava' },
      { text: 'はどこですか？' },
    ],
    trap: null,
    contextJa: '〇〇線に乗り換えてください。', contextZh: ' 请换乘〇〇线。\n——地铁广播里最常听到的换乘提示。',
    pitch: [{ char: 'の', high: true }, { char: 'り', high: false }, { char: 'か', high: false }, { char: 'え', high: false }],
    notes: {
      kanji: { title: '乗り換え', body: '乗る（乘坐）+ 換える（换）= 乗り換え。\n地铁三个动作：乗る（上车）→ 乗り換える（换乘）→ 降りる（下车）。' },
      doko: { title: 'はどこですか', body: '〇〇はどこですか = 〇〇在哪里。\n换掉前面，任何你找不到的地方都能问。' },
    },
    grammarBlocks: [
      {
        type: 'morph',
        label: '复合动词',
        chain: [
          { text: '乗る', sub: '乘坐' },
          { text: '乗り換え', sub: '换乘', active: true },
        ],
        transform: '+ 換える',
        body: '日语复合动词：动词词干 + 动词 = 新动词\n乗り降り（上下车）· 乗り過ごし（坐过站）',
      },
      { particle: 'はどこですか', particleSize: 15, label: '万能定位框架', body: '〇〇はどこですか = 〇〇在哪里？\nは = 话题标记；どこ = 何处（同源）。\n\n任何找不到的地方都可以试试。' },
    ],
    skeletonTitle: '换个地点',
    skeletonPrefix: '', skeletonSuffix: 'はどこですか？',
    skeletons: [
      { jp: '乗り換えはどこですか？', zh: '换乘在哪里', chipLabel: '换乘' },
      { jp: '改札口はどこですか？', zh: '检票口在哪里', chipLabel: '检票口' },
      { jp: '出口はどこですか？', zh: '出口在哪里', chipLabel: '出口' },
      { jp: 'トイレはどこですか？', zh: '厕所在哪里', chipLabel: '厕所' },
    ],
    examples: [
      { jp: '渋谷で山手線に乗り換えてください。', zh: '请在涩谷换乘山手线。', scene: '地铁广播', who: 'listen', level: 'N3' },
      { jp: '乗り換えに5分かかります。', zh: '换乘需要5分钟。', scene: '询问路线', who: 'listen', level: 'N3' },
      { jp: '乗り過ごしてしまいました。', zh: '我坐过站了。', scene: '地铁', who: 'say', level: 'N3' },
    ],
    related: [{ jp: '降ります', zh: '下车' }, { jp: '乗ります', zh: '上车' }, { jp: '終点', zh: '终点站' }],
    relatedLabel: '地铁行动词',
  },

  doko: {
    word: 'どこ', reading: 'どこ（何処）', jlpt: 'N5', sourceLabel: '问题 & 导航',
    coreMeaning: '哪里 · 在哪',
    tags: ['通用', '高频'],
    coreSentence: 'すみません、〇〇はどこですか？',
    coreTranslation: '不好意思，请问〇〇在哪里？',
    coreTokens: [
      { text: 'すみません、〇〇は' },
      { text: 'どこ', noteKey: 'doko', style: 'lava' },
      { text: 'ですか？' },
    ],
    trap: null,
    contextJa: 'どこから来ましたか？', contextZh: '——どこ不只是导航，还能引出真实对话。',
    pitch: [{ char: 'ど', high: true }, { char: 'こ', high: false }],
    notes: {
      doko: { title: '何処', body: 'どこ的汉字写法是「何処」——何（哪）+ 処（处所），和中文「何处」完全同源。\n现代日语简化为假名，但词根还在。' },
      ha: { title: 'は', body: 'は是话题标记，把前面的名词变成被问对象。\nは发音 wa（不是 ha），这是日语拼写里最常见的特例。' },
      desuka: { title: 'ですか', body: 'です = 是；か = 问句标记。合在一起把陈述句变成问句。\n语调上扬就是问句，语调平或下沉是陈述。' },
    },
    grammarBlocks: [
      { particle: '何処', particleSize: 28, label: '汉字同源', body: '何（なん/どの）= 哪；処（ところ）= 地方。\n合起来 = 何处。中文「何处」和日文「何処」，字形完全相同，意思完全一致。' },
      { particle: '〇〇はどこですか', particleSize: 13, label: '旅行最高频框架', body: '覆盖率最高的单一框架——换掉〇〇就能问任何地点：\nトイレはどこですか（厕所）\n駅はどこですか（车站）\n出口はどこですか（出口）' },
    ],
    skeletonTitle: '换个地点',
    skeletonPrefix: '', skeletonSuffix: 'はどこですか？',
    skeletons: [
      { jp: 'トイレはどこですか？', zh: '厕所在哪', chipLabel: '厕所' },
      { jp: '駅はどこですか？', zh: '车站在哪', chipLabel: '车站' },
      { jp: '出口はどこですか？', zh: '出口在哪', chipLabel: '出口' },
      { jp: 'コンビニはどこですか？', zh: '便利店在哪', chipLabel: '便利店' },
    ],
    examples: [
      { jp: 'すみません、トイレはどこですか？', zh: '不好意思，厕所在哪里？', scene: '便利店', who: 'say', level: 'N5' },
      { jp: 'どこから来ましたか？', zh: '你从哪里来？', scene: '旅途中', who: 'listen', level: 'N5' },
      { jp: '今どこにいますか？', zh: '你现在在哪里？', scene: '打电话', who: 'listen', level: 'N5' },
      { jp: 'どこか痛いですか？', zh: '哪里疼吗？', scene: '医院', who: 'listen', level: 'N4' },
    ],
    related: [{ jp: 'いつ', zh: '什么时候' }, { jp: 'だれ', zh: '谁' }, { jp: 'なに', zh: '什么' }],
    relatedLabel: '五个疑问词',
  },

  itai: {
    word: '痛い', reading: 'いたい', jlpt: 'N4', sourceLabel: '紧急 & 就医',
    coreMeaning: '疼 · 痛',
    tags: ['紧急', '医疗'],
    coreSentence: '〇〇が痛いです。',
    coreTranslation: '〇〇疼。',
    coreTokens: [
      { text: '〇〇が' },
      { text: '痛い', noteKey: 'itai', style: 'lava' },
      { text: 'です。' },
    ],
    trap: null,
    contextJa: 'とても痛いです。', contextZh: '——加「とても」（非常），医生立刻明白程度。',
    pitch: [{ char: 'い', high: false }, { char: 'た', high: true }, { char: 'い', high: false }],
    notes: {
      itai: { title: '痛', body: '痛（いた）汉字直读。中文「痛」和日语「痛い」完全同源，连字形都一样。\n紧张时最先想到的词，汉字圈优势在这里最明显。' },
      ga: { title: 'が', body: 'が标记身体的哪个部位在疼。〇〇が痛い = 〇〇疼。\n不会说部位？指着说「ここが痛いです」（这里疼）完全有效。' },
      totemo: { title: 'とても', body: 'とても = 非常。加在痛い前面表示程度严重。\n医院或急救场景里加这个词，帮助对方快速判断情况。' },
    },
    grammarBlocks: [
      { particle: '痛い', particleSize: 28, label: '汉字同源', body: '中文「痛」与日文「痛い」完全同源。\n常见部位：\n頭（あたま）= 头 · お腹（おなか）= 肚子\n喉（のど）= 喉咙 · 背中（せなか）= 背' },
      { particle: '〇〇が痛いです', particleSize: 13, label: '症状表达框架', body: '换掉〇〇说任何部位。\n不会说部位时，直接指着那个地方说「ここが痛いです」也完全有效。\n医院挂号时说这句就能开始诊断。' },
    ],
    skeletonTitle: '换身体部位',
    skeletonPrefix: '', skeletonSuffix: 'が痛いです。',
    skeletons: [
      { jp: '頭が痛いです。', zh: '头疼' },
      { jp: 'お腹が痛いです。', zh: '肚子疼' },
      { jp: '喉が痛いです。', zh: '喉咙疼' },
      { jp: '背中が痛いです。', zh: '背疼' },
    ],
    examples: [
      { jp: 'ここが痛いです。', zh: '（指着）这里疼。', scene: '医院', who: 'say', level: 'N4' },
      { jp: 'いつから痛いですか？', zh: '从什么时候开始疼？', scene: '医院', who: 'listen', level: 'N4' },
      { jp: 'どこが痛いですか？', zh: '哪里疼？', scene: '医院', who: 'listen', level: 'N4' },
      { jp: 'とても痛いです。', zh: '非常疼。', scene: '医院', who: 'say', level: 'N4' },
    ],
    related: [{ jp: '気分が悪い', zh: '不舒服' }, { jp: '熱があります', zh: '发烧了' }, { jp: '病院', zh: '医院' }],
    relatedLabel: '医院常用词',
  },

  osewa: {
    word: 'お世話になりました', reading: 'おせわになりました', jlpt: 'N3', sourceLabel: '酒店入住',
    coreMeaning: '承蒙关照',
    tags: ['酒店', '情感深度'],
    coreSentence: 'お世話になりました。ありがとうございました。',
    coreTranslation: '承蒙关照，非常感谢。',
    coreTokens: [
      { text: 'お' },
      { text: '世話', noteKey: 'sewa', style: 'lava' },
      { text: 'になりました。ありがとうございました。' },
    ],
    trap: null,
    contextJa: '大変お世話になりました。', contextZh: '——离开时说，比ありがとう分量重三倍。',
    pitch: [{ char: 'お', high: false }, { char: 'せ', high: true }, { char: 'わ', high: true }, { char: 'に', high: true }, { char: 'な', high: false }],
    notes: {
      sewa: { title: '世話', body: '世話（せわ）= 照顾、关照。\nお世話になる = 受到照顾、承蒙关照。\n说这句，等于承认：这几天你们让我很舒适，我记得这份情。' },
      ninarimashita: { title: 'になりました', body: 'になる = 成为；ました = 过去式。\nお世話になりました = 已经受到了关照（确认这段关系）。\n过去式很重要：表示这段关系正式告别，不只是一句谢谢。' },
      vsarigato: { title: 'vs ありがとう', body: 'ありがとう是感谢一件事；お世話になりました是感谢一段关系。\n酒店离开、离职、离校——任何一段时间关系结束都用这句。\n日本人听到这句会真的很感动。' },
    },
    grammarBlocks: [
      { particle: '世話', particleSize: 26, label: '汉字解析', body: '世（世界）+ 話（话/照管）。\n「世話をする」= 照顾、操持。承蒙关照 = 有人在你的世界里为你出力。\n汉字本身藏着这个词的情感重量。' },
      {
        type: 'compare',
        heading: '感谢的层次',
        left: { word: 'ありがとう', scenario: '服务员帮你拿了行李', state: '感谢一件事' },
        right: { word: 'お世話になりました', scenario: '住了三天退房时', state: '感谢一段关系' },
      },
    ],
    skeletonTitle: '接上心意',
    skeletonPrefix: 'お世話になりました。', skeletonSuffix: '',
    skeletons: [
      { jp: 'お世話になりました。ありがとうございました。', zh: '承蒙关照，非常感谢', chipLabel: '感谢' },
      { jp: 'お世話になりました。またよろしくお願いします。', zh: '承蒙关照，下次再来', chipLabel: '再来' },
      { jp: 'お世話になりました。楽しかったです。', zh: '承蒙关照，很开心', chipLabel: '说开心' },
      { jp: 'お世話になりました。お体に気をつけて。', zh: '承蒙关照，保重身体', chipLabel: '祝保重' },
    ],
    examples: [
      { jp: 'お世話になりました。', zh: '承蒙关照了。（离开酒店时）', scene: '酒店退房', who: 'say', level: 'N3' },
      { jp: '今まで大変お世話になりました。', zh: '一直以来承蒙您的关照。', scene: '离职 / 毕业', who: 'say', level: 'N3' },
      { jp: 'こちらこそ、お世話になりました。', zh: '哪里哪里，是我受到您的关照了。', scene: '互相道谢', who: 'listen', level: 'N3' },
    ],
    related: [{ jp: 'ありがとうございました', zh: '非常感谢' }, { jp: 'またよろしく', zh: '下次也请多关照' }],
    relatedLabel: '告别用语',
  },
};

function WordCardScreen({ card, onBack, onDone }) {
  const [side, setSide] = useState('front');
  const [trapFlipped, setTrapFlipped] = useState(false);
  const [activeWordNote, setActiveWordNote] = useState(null);
  const [slotIdx, setSlotIdx] = useState(0);
  const [examplesModal, setExamplesModal] = useState(false);
  const [exModalExpanded, setExModalExpanded] = useState(false);
  const { speak, speakingKey } = useSpeech();
  const say = (text, key) => speak(text, 'ja-JP', key);
  const showNote = (key, text) => {
    setActiveWordNote(key);
    say(text, `word-card-token-${key}`);
  };
  const activeNote = activeWordNote ? card.notes[activeWordNote] : null;
  return (
    <View style={cs.wordCardPage}>
      <View style={cs.nav}>
        <TouchableOpacity onPress={onBack}><Text style={[cs.navBack, { color: C.lava }]}>‹ {card.sourceLabel || '返回'}</Text></TouchableOpacity>
        <Text style={cs.navN}>词卡</Text>
        <View style={{ width: 80 }} />
      </View>
      <ScrollView contentContainerStyle={cs.wordCardScroll} showsVerticalScrollIndicator={false}>
        <Pressable style={cs.wordCardSheet} onPress={() => setSide(s => s === 'front' ? 'back' : 'front')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <View style={cs.wordCardTabs}>
                {[
                  { id: 'front', label: '真实世界' },
                  { id: 'back', label: '语法深度' },
                ].map(tab => (
                  <TouchableOpacity key={tab.id} style={[cs.wordCardTab, side === tab.id && cs.wordCardTabAct]} onPress={() => setSide(tab.id)}>
                    <Text style={[cs.wordCardTabTxt, side === tab.id && cs.wordCardTabTxtAct]}>{tab.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <Text style={cs.wordN4Tag}>{card.jlpt || 'N5'}</Text>
          </View>
          {side === 'front' ? (
            <>
              <View style={cs.wordHero}>
                <TouchableOpacity activeOpacity={0.78} onPress={() => say(card.word, 'word-card-headword')}>
                  <Text style={[cs.wordHead, speakingKey === 'word-card-headword' && cs.wordSpeaking]}>{card.word}</Text>
                </TouchableOpacity>
                <Text style={[cs.wordReading, speakingKey === 'word-card-headword' && cs.wordSpeaking]}>{card.reading}</Text>
                {card.coreMeaning && <Text style={cs.wordMeaning}>{card.coreMeaning}</Text>}
                <View style={cs.wordTagRow}>
                  {card.tags.map(tag => <Text key={tag} style={cs.wordMiniTag}>{tag}</Text>)}
                </View>
              </View>

              {card.trap && (
                <TouchableOpacity style={[cs.wordTrapFlip, trapFlipped && cs.wordTrapFlipBack]} activeOpacity={0.9} onPress={() => setTrapFlipped(v => !v)}>
                  {!trapFlipped ? (
                    <View style={cs.wordTrapFront}>
                      <Text style={cs.wordTrapWarning}>⚠️ 汉字陷阱</Text>
                      <Text style={cs.wordTrapFrontText}>{card.trap.front}</Text>
                      <Text style={cs.wordTrapHintSmall}>点击翻看 →</Text>
                    </View>
                  ) : (
                    <View style={cs.wordTrapBackInner}>
                      <Text style={cs.wordTrapBackSub}>{card.trap.front}</Text>
                      <Text style={cs.wordTrapBackText}>{card.trap.back}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}

              <View style={cs.wordCoreBlock}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={[cs.wordCoreSentence, { flex: 1 }, speakingKey === 'word-card-core' && cs.wordSpeaking]} onPress={() => say(card.coreSentence, 'word-card-core')}>
                    {(card.coreTokens || []).map((t, i) => {
                      const isAct = t.noteKey && activeWordNote === t.noteKey;
                      const onPress = t.noteKey ? () => showNote(t.noteKey, t.text) : undefined;
                      if (t.style === 'lava') return <Text key={i} style={[cs.wordToken, { color: C.lava, backgroundColor: 'transparent' }, isAct && cs.wordTokenAct]} onPress={onPress}>{t.text}</Text>;
                      if (t.style === 'blue') return <Text key={i} style={[cs.wordTokenBlue, isAct && cs.wordTokenBlueAct]} onPress={onPress}>{t.text}</Text>;
                      if (t.style === 'plain') return <Text key={i} style={[cs.wordTokenPlain, isAct && cs.wordTokenAct]} onPress={onPress}>{t.text}</Text>;
                      return <Text key={i}>{t.text}</Text>;
                    })}
                  </Text>
                  <SpeakBtn
                    onPress={() => say(card.coreSentence, 'word-card-core')}
                    speaking={speakingKey === 'word-card-core'}
                    size="sm"
                    color={C.lava}
                  />
                </View>
                <Text style={cs.wordCoreZh}>{card.coreTranslation}</Text>
                {card.notes && Object.keys(card.notes).length > 0 && (
                  <View style={cs.wordNoteChipRow}>
                    {Object.entries(card.notes).map(([key, note]) => (
                      <TouchableOpacity
                        key={key}
                        style={[cs.wordNoteChip, activeWordNote === key && cs.wordNoteChipActive]}
                        onPress={() => setActiveWordNote(prev => prev === key ? null : key)}
                        activeOpacity={0.75}
                      >
                        <Text style={[cs.wordNoteChipTxt, activeWordNote === key && cs.wordNoteChipTxtActive]}>
                          {note.title}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {activeNote && (
                  <View style={cs.wordNotePanel}>
                    <Text style={cs.wordNoteBody}>{activeNote.body}</Text>
                  </View>
                )}
              </View>

              {(card.contextJa || card.contextZh) && (
                <Text style={cs.wordContextText}>
                  {card.contextJa ? <Text style={cs.wordContextJa} onPress={() => say(card.contextJa, 'word-card-ctx')}>{card.contextJa}</Text> : null}
                  {card.contextZh}
                </Text>
              )}

              {card.examples && card.examples.length > 0 && (
                <TouchableOpacity style={cs.examplesDrawer} onPress={() => setExamplesModal(true)} activeOpacity={0.82}>
                  <Text style={cs.examplesToggleTxt}>在真实句子里再遇见它</Text>
                  <Text style={cs.examplesArrow}>↗</Text>
                </TouchableOpacity>
              )}

              {card.pitch && card.pitch.length > 0 && (
                <TouchableOpacity style={cs.pitchInlineRow} onPress={() => say(card.word, 'word-card-pitch')} activeOpacity={0.75}>
                  <SpeakBtn onPress={() => say(card.word, 'word-card-pitch')} speaking={speakingKey === 'word-card-pitch'} size="sm" color={C.muted} />
                  <Text style={cs.pitchLabel}>声调</Text>
                  <View style={cs.pitchRow}>
                    {card.pitch.map((s, i) => (
                      <View key={i} style={cs.pitchSyl}>
                        <Text style={cs.pitchChar}>{s.char}</Text>
                        <View style={[cs.pitchBar, s.high ? cs.pitchBarHigh : cs.pitchBarLow]} />
                      </View>
                    ))}
                  </View>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              {(card.grammarBlocks || []).map((block, i) => {
                if (block.type === 'morph') return (
                  <View key={i} style={cs.wordBackBlock}>
                    <Text style={cs.gramLabel}>{block.label}</Text>
                    <View style={cs.morphRow}>
                      <TouchableOpacity style={cs.morphPill} activeOpacity={0.7} onPress={() => say(block.chain[0].text, `morph-0-${i}`)}>
                        <Text style={cs.morphPillJp}>{block.chain[0].text}</Text>
                        <Text style={cs.morphPillSub}>{block.chain[0].sub}</Text>
                      </TouchableOpacity>
                      <View style={cs.morphArrowCol}>
                        <Text style={cs.morphArrowTxt}>{block.transform}</Text>
                      </View>
                      <TouchableOpacity style={[cs.morphPill, cs.morphPillActive]} activeOpacity={0.7} onPress={() => say(block.chain[1].text, `morph-1-${i}`)}>
                        <Text style={[cs.morphPillJp, cs.morphPillJpActive]}>{block.chain[1].text}</Text>
                        <Text style={[cs.morphPillSub, cs.morphPillSubActive]}>{block.chain[1].sub}</Text>
                      </TouchableOpacity>
                    </View>
                    {block.body ? <Text style={cs.wordBackText}>{block.body}</Text> : null}
                  </View>
                );
                if (block.type === 'compare') return (
                  <View key={i} style={cs.wordBackBlock}>
                    {block.heading ? <Text style={cs.compareHeading}>{block.heading}</Text> : null}
                    <View style={cs.compareRow}>
                      <View style={[cs.compareCard, cs.compareCardLeft]}>
                        <View style={cs.compareCardTopRow}>
                          <Text style={cs.compareCardWord}>{block.left.word}</Text>
                          <SpeakBtn onPress={() => say(block.left.word, `cmp-l-${i}`)} speaking={speakingKey === `cmp-l-${i}`} size="sm" color={C.muted} />
                        </View>
                        <Text style={cs.compareCardScenario}>{block.left.scenario || block.scenario}</Text>
                        <View style={cs.compareCardDivider} />
                        <Text style={cs.compareCardState}>{block.left.state}</Text>
                      </View>
                      <View style={cs.compareCard}>
                        <View style={cs.compareCardTopRow}>
                          <Text style={cs.compareCardWord}>{block.right.word}</Text>
                          <SpeakBtn onPress={() => say(block.right.word, `cmp-r-${i}`)} speaking={speakingKey === `cmp-r-${i}`} size="sm" color={C.muted} />
                        </View>
                        <Text style={cs.compareCardScenario}>{block.right.scenario || block.scenario}</Text>
                        <View style={cs.compareCardDivider} />
                        <Text style={cs.compareCardState}>{block.right.state}</Text>
                      </View>
                    </View>
                    {block.compound ? (
                      <View style={cs.compareCompound}>
                        <Text style={cs.compareCompoundTxt}>
                          {block.compoundLabel ? `${block.compoundLabel}：` : ''}<Text style={{ fontWeight: '500' }}>{block.compound}</Text>
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
                return (
                  <View key={i} style={cs.wordBackBlock}>
                    <Text style={[cs.gramParticle, block.particleSize && { fontSize: block.particleSize }]}>{block.particle}</Text>
                    <Text style={cs.gramLabel}>{block.label}</Text>
                    <Text style={cs.wordBackText}>{block.body}</Text>
                  </View>
                );
              })}
              {card.skeletons && card.skeletons.length > 0 && (() => {
                const pre = card.skeletonPrefix || '';
                const suf = card.skeletonSuffix || '';
                const getJpVar = (sk) => sk.jp.replace(pre, '').replace(suf, '').replace(/[。？]$/, '').trim();
                const getLabel = (sk) => sk.chipLabel || getJpVar(sk);
                return (
                  <View style={[cs.wordBackBlock, cs.patContainer]}>
                    <Text style={cs.wordBackHd}>{card.skeletonTitle || '只换前面，后面不用动'}</Text>
                    <View style={cs.patRow}>
                      {pre ? <Text style={cs.patSlotFixTxt} numberOfLines={1}>{pre}</Text> : null}
                      <View style={cs.patSlotVar}><Text style={cs.patSlotVarTxt} numberOfLines={1}>{getJpVar(card.skeletons[slotIdx] || card.skeletons[0])}</Text></View>
                      {suf ? <Text style={cs.patSlotFixTxt} numberOfLines={1}>{suf}</Text> : null}
                    </View>
                    <View style={cs.patChipRow}>
                      {card.skeletons.map((sk, i) => {
                        const active = slotIdx === i;
                        return (
                          <TouchableOpacity key={i} style={[cs.patChip, active && cs.patChipActive]} activeOpacity={0.75}
                            onPress={() => { setSlotIdx(i); say(sk.jp, `word-card-slot-${i}`); }}>
                            <Text style={[cs.patChipWord, active && cs.patChipWordActive]}>{getLabel(sk)}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <View style={cs.patSentenceRow}>
                      <Text style={cs.patSentenceJp}>{(card.skeletons[slotIdx] || card.skeletons[0]).jp}</Text>
                      <Text style={cs.patSentenceZh}> — {(card.skeletons[slotIdx] || card.skeletons[0]).zh}</Text>
                    </View>
                  </View>
                );
              })()}
            </>
          )}
        </Pressable>
        {onDone && (
          <TouchableOpacity style={cs.wordDoneBtn} onPress={onDone} activeOpacity={0.85}>
            <Text style={cs.wordDoneBtnTxt}>学完这个词，继续 →</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      <Modal visible={examplesModal} transparent animationType="slide" onRequestClose={() => setExamplesModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setExamplesModal(false)} />
          <View style={cs.exModal}>
            <View style={cs.exModalHead}>
              <Text style={cs.exModalTitle}>在真实句子里再遇见它</Text>
              <TouchableOpacity onPress={() => setExamplesModal(false)}>
                <Text style={cs.exModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {(exModalExpanded ? card.examples : (card.examples || []).slice(0, 3)).map((ex, i) => {
                const isListen = ex.who === 'listen';
                return (
                  <View key={i} style={[cs.exampleRow, isListen && cs.exampleRowListen]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[cs.exampleJp, isListen && cs.exampleJpListen]}>{ex.jp}</Text>
                      <Text style={cs.exampleZh}>{ex.zh}</Text>
                      <View style={cs.exampleMeta}>
                        <Text style={[cs.exampleScene, isListen && cs.exampleSceneListen]}>{ex.scene}</Text>
                        <Text style={[cs.exampleWhoLabel, isListen ? cs.exampleWhoListen : cs.exampleWhoSay]}>
                          {isListen ? '👂 听懂就好' : '🗣 开口练'}
                        </Text>
                      </View>
                    </View>
                    <SpeakBtn
                      onPress={() => say(ex.jp, `word-card-ex-${i}`)}
                      speaking={speakingKey === `word-card-ex-${i}`}
                      size="sm"
                      color={isListen ? C.blue : C.muted}
                    />
                  </View>
                );
              })}
              {!exModalExpanded && (card.examples || []).length > 3 && (
                <TouchableOpacity style={cs.examplesExpandBtn} onPress={() => setExModalExpanded(true)} activeOpacity={0.75}>
                  <Text style={cs.examplesExpandTxt}>展开全部 ↓</Text>
                </TouchableOpacity>
              )}
              {card.related && card.related.length > 0 && (
                <View style={{ marginTop: 16 }}>
                  <Text style={[cs.wordSectionLabel, { marginBottom: 10 }]}>{card.relatedLabel || '相关词汇'}</Text>
                  <View style={cs.wordChipRow}>
                    {card.related.map(item => (
                      <TouchableOpacity key={item.jp} style={cs.wordChip} activeOpacity={0.78} onPress={() => say(item.jp, `word-card-related-${item.jp}`)}>
                        <Text style={cs.wordChipTxt}>{item.jp}</Text>
                        <Text style={cs.wordChipZh}>{item.zh}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// 深度词卡取值:content.json 里的 wordCards 优先,取不到才用内置副本。
// 逐张合并而不是整体二选一 —— 这样内容里只写新增的几张,已有的 8 张不用重复搬。
function resolveWordCards(content) {
  const remote = content?.wordCards;
  if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return WORD_CARDS_BUILTIN;
  return { ...WORD_CARDS_BUILTIN, ...remote };
}

function CardScreen({ sceneState, onBack, onFinish, content }) {
  const WORD_CARDS = resolveWordCards(content);
  const { scene, index } = sceneState;
  const [cur, setCur] = useState(index);
  const [showScene, setShowScene] = useState(false);
  const [wordCardKey, setWordCardKey] = useState(null);
  const { speak, speakingKey } = useSpeech();
  const phrases = scene.phrases || [];
  const p = phrases[cur];
  const hookStyle = HOOK_STYLES[p?.hookType] || HOOK_STYLES.e;
  const go = (d) => { setCur(i => i + d); setShowScene(false); setWordCardKey(null); };
  const phraseWordCardKey = p?.wordCardKey;
  if (wordCardKey && WORD_CARDS[wordCardKey]) {
    return <WordCardScreen card={WORD_CARDS[wordCardKey]} onBack={() => setWordCardKey(null)} onDone={() => { setWordCardKey(null); go(1); }} />;
  }
  if (!p) {
    return (
      <View style={{ flex: 1 }}>
        <View style={cs.nav}>
          <TouchableOpacity onPress={onBack}><Text style={[cs.navBack, { color: scene.color }]}>‹ 返回</Text></TouchableOpacity>
          <Text style={cs.navN}>{scene.label}</Text>
          <View style={{ width: 80 }} />
        </View>
        <View style={cs.emptyWrap}>
          <View style={cs.emptyCard}>
            <Text style={cs.emptyTitle}>内容暂未准备好</Text>
            <Text style={cs.emptySub}>请返回上一页，或先学习其他场景。</Text>
            <TouchableOpacity style={[cs.emptyBtn, { backgroundColor: scene.color }]} onPress={onBack}>
              <Text style={cs.emptyBtnTxt}>返回上一页</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <View style={cs.nav}>
        <TouchableOpacity onPress={onBack}><Text style={[cs.navBack, { color: scene.color }]}>‹ {scene.label}</Text></TouchableOpacity>
        <Text style={cs.navN}>{cur + 1} / {phrases.length}</Text>
        <View style={{ width: 80 }} />
      </View>
      <View style={cs.prog}><View style={[cs.progFill, { width: `${((cur + 1) / phrases.length) * 100}%`, backgroundColor: scene.color }]} /></View>
      <ScrollView contentContainerStyle={cs.scroll} showsVerticalScrollIndicator={false}>
        <View style={cs.main}>
        
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, width: '100%' }}>
            <View style={[cs.scTag, { backgroundColor: scene.bgColor }]}><Text style={[cs.scTagTxt, { color: scene.color }]}>{scene.emoji} {scene.label}</Text></View>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              {p.speaker === 'staff' && (
                <View style={cs.listenChip}><Text style={cs.listenChipTxt}>👂</Text></View>
              )}
              <JlptBadge level={p.jlpt} />
            </View>
          </View>
          {(() => {
            if (phraseWordCardKey && WORD_CARDS[phraseWordCardKey]) {
              const word = WORD_CARDS[phraseWordCardKey].word;
              const idx = p.jp.indexOf(word);
              if (idx >= 0) return (
                <Text style={cs.jpTxt}>
                  {idx > 0 ? p.jp.slice(0, idx) : null}
                  <Text style={[cs.jpTxt, cs.wordCardInline]} onPress={() => setWordCardKey(phraseWordCardKey)}>{word}</Text>
                  {p.jp.slice(idx + word.length) || null}
                </Text>
              );
            }
            return <Text style={cs.jpTxt}>{p.jp}</Text>;
          })()}
          <Text style={cs.romaTxt}>{p.roma}</Text>
          <View style={{ marginTop: 12 }}>
            <SpeakBtn
              onPress={() => speak(p.jp, 'ja-JP', `phrase-${p.id}`)}
              speaking={speakingKey === `phrase-${p.id}`}
              color={scene.color}
            />
          </View>
          <View style={cs.trans}>
            <Text style={cs.zhTxt}>{p.zh}</Text>
            <Text style={cs.enTxt}>{p.en}</Text>
          </View>
          {p.links && p.links.length > 0 && (
            <View style={{ marginTop: 10, width: '100%' }}>
              <Text style={cs.linkLbl}>🔗 多语言关联</Text>
              <LangLink links={p.links} />
            </View>
          )}
          {p.swappableWords && p.swappableWords.length > 0 && (
            <View style={cs.swapBox}>
              <Text style={cs.swapLbl}>🔁 可替换词</Text>
              <View style={cs.swapRow}>
                {p.swappableWords.map((w, i) => (
                  <TouchableOpacity
                    key={i}
                    style={cs.swapChip}
                    activeOpacity={0.78}
                    onPress={() => speak(w.word, 'ja-JP', `swap-${p.id || cur}-${i}`)}
                  >
                    <Text style={cs.swapJp} numberOfLines={1}>{w.word}</Text>
                    {w.reading ? <Text style={cs.swapReading} numberOfLines={1}>{w.reading}</Text> : null}
                    <Text style={cs.swapZh} numberOfLines={1}>{w.zh}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
        <AnimatedHook hookStyle={hookStyle} hookTxt={p.hook} />
        <TouchableOpacity style={cs.sceneCard} onPress={() => setShowScene(v => !v)} activeOpacity={0.85}>
          <View style={cs.sceneCardHeader}>
            <Text style={cs.sceneCardTitle}>🎬 实战场景</Text>
            <Text style={cs.sceneCardArrow}>{showScene ? '↑' : '↓'}</Text>
          </View>
          {showScene && (
            <>
              <View style={cs.sceneCardBody}>
                <Text style={cs.detailTxt}>{p.scene}</Text>
              </View>
              {p.expandNote && p.expandNote.items && p.expandNote.items.length > 0 && (
                <View style={cs.sceneCardExtra}>
                  <Text style={cs.extraTitle}>{p.expandNote.title}</Text>
                  {p.expandNote.items.map((item, i) => (
                    <View key={i} style={cs.extraItem}>
                      <Text style={cs.extraBullet}>•</Text>
                      <Text style={cs.extraTxt}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}
              {p.spotlight && (
                <View style={cs.sceneCardSpotlight}>
                  <Text style={cs.spotlightTitle}>
                    {typeof p.spotlight === 'string' ? '站点小知识' : p.spotlight.title}
                  </Text>
                  <Text style={cs.spotlightTxt}>
                    {typeof p.spotlight === 'string' ? p.spotlight : p.spotlight.body}
                  </Text>
                </View>
              )}
            </>
          )}
        </TouchableOpacity>

        <View style={cs.navBtns}>
          <TouchableOpacity style={[cs.btn, cur === 0 && cs.btnOff]} onPress={() => go(-1)} disabled={cur === 0}>
            <Text style={cs.btnTxt}>← 上一句</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[cs.btn, { backgroundColor: scene.color, borderColor: scene.color }]}
            onPress={() => {
              if (cur === phrases.length - 1) {
                onFinish && onFinish();
              } else {
                go(1);
              }
            }}
          >
            <Text style={[cs.btnTxt, { color: C.white }]}>
              {cur === phrases.length - 1 ? '进入练习 →' : '下一句 →'}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}
const cs = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  navBack: { fontSize: 15, fontWeight: '500' },
  navN: { fontSize: 14, fontWeight: '600', color: C.ink },
  prog: { height: 3, backgroundColor: C.border },
  progFill: { height: 3 },
  scroll: { padding: 14, paddingBottom: 40 },
  emptyWrap: { flex: 1, padding: 18, justifyContent: 'center' },
  emptyCard: { backgroundColor: C.white, borderRadius: 18, padding: 22, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: C.ink, textAlign: 'center' },
  emptySub: { fontSize: 13, color: C.muted, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  emptyBtn: { marginTop: 18, borderRadius: 13, paddingHorizontal: 22, paddingVertical: 12 },
  emptyBtnTxt: { fontSize: 14, fontWeight: '700', color: C.white },
  main: { backgroundColor: C.white, borderRadius: 20, padding: 18, marginBottom: 10, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' },
  listenChip: { backgroundColor: C.blueLight, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 },
  listenChipTxt: { fontSize: 13 },
  wordCardChip: { marginTop: 6, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: '#fff0e8', borderRadius: 20, borderWidth: 1, borderColor: '#f0c8b0' },
  wordCardChipTxt: { fontSize: 12, color: C.lava, fontWeight: '600' },
  scTag: { borderRadius: 18, paddingHorizontal: 11, paddingVertical: 4 },
  scTagTxt: { fontSize: 11, fontWeight: '700' },
  jpTxt: { fontSize: 30, color: C.ink, fontWeight: '300', textAlign: 'center', lineHeight: 42 },
  wordCardInline: { color: C.lava, textDecorationLine: 'underline', fontWeight: '500' },
  romaTxt: { fontSize: 12, color: C.muted, marginTop: 7 },
  trans: { marginTop: 12, alignItems: 'center' },
  zhTxt: { fontSize: 19, color: C.ink, fontWeight: '500', textAlign: 'center' },
  enTxt: { fontSize: 12, color: C.muted, marginTop: 4, fontStyle: 'italic', textAlign: 'center' },
  linkLbl: { fontSize: 10, fontWeight: '700', color: C.muted, letterSpacing: 1, marginBottom: 2 },
  sceneCard: { borderWidth: 1.5, borderColor: C.border, borderRadius: 12, marginBottom: 10, backgroundColor: C.white, overflow: 'hidden' },
  sceneCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  sceneCardTitle: { fontSize: 13, color: C.muted, fontWeight: '600' },
  sceneCardArrow: { fontSize: 13, color: C.muted },
  sceneCardBody: { borderTopWidth: 1, borderTopColor: C.border, padding: 14 },
  sceneCardExtra: { borderTopWidth: 1, borderTopColor: C.border, padding: 14 },
  sceneCardSpotlight: { borderTopWidth: 1, borderTopColor: C.border, padding: 14 },
  detail: { backgroundColor: C.white, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1.5, borderColor: C.border },
  detailLbl: { fontSize: 10, fontWeight: '700', color: C.muted, marginBottom: 7, letterSpacing: 1 },
  detailTxt: { fontSize: 14, color: C.ink, lineHeight: 22 },
  navBtns: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 13, alignItems: 'center', borderWidth: 1.5, borderColor: C.border, backgroundColor: C.white },
  btnOff: { opacity: 0.25 },
  btnTxt: { fontSize: 15, fontWeight: '600', color: C.ink },
  goalBox: {
    width: '100%',
    backgroundColor: C.paperWarm,
    borderWidth: 1,
    borderColor: '#f0e2b8',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  goalTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.goldInk,
    marginBottom: 8,
  },
  goalItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  goalBullet: {
    width: 14,
    fontSize: 13,
    color: C.goldInk,
    lineHeight: 20,
  },
  goalTxt: {
    flex: 1,
    fontSize: 13,
    color: '#4a3a16',
    lineHeight: 20,
  },
  swapBox: { marginTop: 10, width: '100%' },
  swapLbl: { fontSize: 10, fontWeight: '700', color: C.muted, letterSpacing: 1, marginBottom: 5 },
  swapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  swapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f3eeff',
    borderColor: '#d8ccff',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  swapJp: { fontSize: 13, fontWeight: '700', color: C.purple },
  swapReading: { fontSize: 10, color: '#8c7bb8' },
  swapZh: { fontSize: 10, color: '#7a7199' },
  wordCardPage: { flex: 1, backgroundColor: C.paper },
  wordCardScroll: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 24 },
  wordCardSource: { fontSize: 12, color: C.muted, textAlign: 'center', marginBottom: 12 },
  wordDoneBtn: { marginHorizontal: 18, marginBottom: 16, marginTop: 10, backgroundColor: C.ink, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  wordDoneBtnTxt: { fontSize: 15, color: C.white, fontWeight: '700' },
  wordCardTabs: {
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: '#ece7de',
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: '#e0d7cc',
  },
  wordCardTab: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
  wordCardTabAct: { backgroundColor: C.ink },
  wordCardTabTxt: { fontSize: 12, fontWeight: '700', color: '#7a7168' },
  wordCardTabTxtAct: { color: C.paper },
  wordCardSheet: {
    backgroundColor: '#fffdf8',
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    shadowColor: C.ink,
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  wordHero: { alignItems: 'center', paddingTop: 6, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.borderSoft, marginBottom: 12 },
  wordHead: { fontSize: 54, lineHeight: 62, fontWeight: '400', color: C.ink, textAlign: 'center' },
  wordReading: { fontSize: 18, color: C.lava, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  wordMeaning: { fontSize: 20, color: C.ink, fontWeight: '700', textAlign: 'center', marginTop: 12 },
  wordTagRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 8 },
  wordN4Tag: { fontSize: 11, color: C.muted, borderWidth: 0.5, borderColor: C.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  wordMiniTag: {
    fontSize: 11,
    color: '#7c6f62',
    backgroundColor: C.tag,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  wordFreqRow: { flexDirection: 'row', gap: 5, marginTop: 12 },
  wordFreqDot: { fontSize: 12, color: '#d2c8bb', lineHeight: 16 },
  wordFreqDotOn: { color: C.lava },
  wordTrapHint: { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 2, letterSpacing: 0.5 },
  wordTrapFlip: { backgroundColor: C.ink, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 14, minHeight: 72, justifyContent: 'center' },
  wordTrapFlipBack: {},
  wordTrapFront: { alignItems: 'center' },
  wordTrapWarning: { fontSize: 11, color: '#a09080', marginBottom: 4 },
  wordTrapFrontText: { fontSize: 17, color: C.paper, fontWeight: '600' },
  wordTrapHintSmall: { fontSize: 11, color: '#6a6050', marginTop: 6 },
  wordTrapBackInner: { alignItems: 'center' },
  wordTrapBackText: { fontSize: 17, color: C.lava, fontWeight: '700' },
  wordTrapBackSub: { fontSize: 13, color: '#a09080', marginTop: 4 },
  wordTrapBox: {
    backgroundColor: '#fff6ee',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#efd8c8',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 24,
  },
  wordTrapTitle: { fontSize: 12, fontWeight: '800', color: C.lava, marginBottom: 7 },
  wordTrapBody: { fontSize: 15, color: C.ink, lineHeight: 23, fontWeight: '600' },
  wordCoreBlock: { alignItems: 'center', marginBottom: 8 },
  wordSectionLabel: { fontSize: 11, fontWeight: '800', color: C.muted, letterSpacing: 1.5, marginBottom: 8 },
  wordCoreSentence: { fontSize: 20, lineHeight: 30, color: C.ink, fontWeight: '500', textAlign: 'center', marginBottom: 6 },
  wordCoreZh: { fontSize: 15, lineHeight: 22, color: C.muted, textAlign: 'center', marginBottom: 8 },
  wordToken: {
    color: C.blueInk,
    backgroundColor: C.blueFaint,
  },
  wordTokenAct: { color: C.lava, backgroundColor: C.lavaLight, fontWeight: '800' },
  wordTokenBlue: {
    color: C.blueInk,
    backgroundColor: C.blueFaint,
  },
  wordTokenBlueAct: { color: C.blueInk, backgroundColor: '#d8dff5', fontWeight: '800' },
  wordTokenPlain: { color: C.ink, backgroundColor: C.blueFaint },
  wordNoteHint: { fontSize: 12, color: C.muted, lineHeight: 18, textAlign: 'center' },
  wordNoteChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  wordNoteChip: { borderRadius: 999, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: C.white },
  wordNoteChipActive: { borderColor: C.lava, backgroundColor: C.lavaLight },
  wordNoteChipTxt: { fontSize: 11, fontWeight: '700', color: C.muted },
  wordNoteChipTxtActive: { color: C.lava },
  wordNotePanel: {
    alignSelf: 'stretch',
    backgroundColor: '#f4eee6',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: C.borderWarm,
  },
  wordNoteTitle: { fontSize: 13, fontWeight: '800', color: C.lava, marginBottom: 5 },
  wordNoteBody: { fontSize: 13, color: C.ink, lineHeight: 20 },
  wordContextText: { fontSize: 14, color: C.ink, lineHeight: 24, marginBottom: 8 },
  wordContextJa: { color: C.muted, fontSize: 14, textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: C.muted },
  wordRelatedBlock: { borderTopWidth: 1, borderTopColor: C.borderSoft, paddingTop: 10 },
  examplesDrawer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f4ede6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, marginTop: 4, marginBottom: 6 },
  examplesToggleTxt: { fontSize: 13, fontWeight: '700', color: C.ink },
  examplesArrow: { fontSize: 14, color: C.lava, fontWeight: '700' },
  pitchInlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: C.borderSoft, paddingTop: 8, marginTop: 2 },
  exModal: { backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 32, maxHeight: '80%' },
  exModalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  exModalTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  exModalClose: { fontSize: 18, color: C.muted, paddingHorizontal: 6 },
  exampleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.white },
  exampleRowListen: { backgroundColor: C.blueLight },
  exampleJp: { fontSize: 14, color: C.ink, fontWeight: '600', lineHeight: 21 },
  exampleJpListen: { color: C.blue },
  exampleZh: { fontSize: 12, color: C.muted, lineHeight: 18, marginTop: 2 },
  exampleMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  exampleScene: { fontSize: 11, color: C.muted, backgroundColor: C.tag, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  exampleSceneListen: { backgroundColor: '#d8e8f8', color: C.blue },
  exampleWhoLabel: { fontSize: 11, fontWeight: '600', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  exampleWhoSay: { color: C.muted, backgroundColor: C.tag },
  exampleWhoListen: { color: C.blue, backgroundColor: '#d8e8f8' },
  examplesExpandBtn: { paddingVertical: 10, alignItems: 'center' },
  examplesExpandTxt: { fontSize: 12, color: C.muted, fontWeight: '600' },
  wordChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  wordChip: {
    backgroundColor: C.tag,
    borderWidth: 1,
    borderColor: '#e6ded4',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  wordChipTxt: { fontSize: 14, color: C.ink, fontWeight: '700' },
  wordChipZh: { fontSize: 10, color: C.muted, textAlign: 'center', marginTop: 1 },
  wordSpeaking: { color: C.lava },
  wordBackTitle: { fontSize: 13, fontWeight: '500', color: C.muted, marginBottom: 20, letterSpacing: 1 },
  wordBackBlock: { marginBottom: 10 },
  wordBackHd: { fontSize: 13, fontWeight: '500', color: C.muted, marginBottom: 6 },
  wordBackText: { fontSize: 13, lineHeight: 22, color: C.ink },
  wordSkeletonFormula: {
    fontSize: 15,
    lineHeight: 23,
    color: C.lava,
    fontWeight: '800',
    backgroundColor: C.lavaLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    overflow: 'hidden',
  },
  wordSkeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSoft,
  },
  wordSkeletonJp: { flex: 1.3, fontSize: 15, color: C.ink, fontWeight: '700', lineHeight: 22 },
  wordSkeletonZh: { flex: 1, fontSize: 13, color: C.muted, lineHeight: 22, textAlign: 'right' },
  wordSceneLine: { fontSize: 14, color: C.ink, lineHeight: 24, marginBottom: 3 },
  wordAccentBox: {
    backgroundColor: C.blueFaint,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c5cce8',
    padding: 10,
  },
  wordAccentText: { fontSize: 15, color: C.blueInk, lineHeight: 23, fontWeight: '600' },
  wordAccentHint: { fontSize: 11, color: '#7a8ab0', marginTop: 4, textAlign: 'center' },
  gramParticle: { fontSize: 24, fontWeight: '700', color: C.blueInk, marginBottom: 2 },
  gramLabel: { fontSize: 12, color: C.blueInk, letterSpacing: 1, marginBottom: 5 },
  morphRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 12, gap: 6 },
  morphPill: { flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, backgroundColor: '#f4f4f4', borderRadius: 16 },
  morphPillActive: { backgroundColor: '#fff0e8', borderWidth: 1.5, borderColor: C.lava },
  morphPillJp: { fontSize: 15, fontWeight: '700', color: C.ink },
  morphPillJpActive: { color: C.lava },
  morphPillSub: { fontSize: 11, color: C.muted, marginTop: 2 },
  morphPillSubActive: { color: C.lava, opacity: 0.8 },
  morphArrowCol: { alignItems: 'center', paddingHorizontal: 2 },
  morphArrowTxt: { fontSize: 11, color: '#bbb' },
  compareHeading: { fontSize: 13, fontWeight: '600', color: C.lava, marginBottom: 10 },
  compareRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  compareCard: { flex: 1, backgroundColor: '#f7f7f7', borderRadius: 10, padding: 10 },
  compareCardLeft: { backgroundColor: '#fdf8f5' },
  compareCardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  compareCardWord: { fontSize: 16, fontWeight: '700', color: C.ink, flex: 1 },
  compareCardScenario: { fontSize: 11, color: C.muted, marginBottom: 6 },
  compareCardDivider: { height: 0.5, backgroundColor: '#d8d8d8', marginBottom: 6 },
  compareCardState: { fontSize: 11, color: C.muted },
  compareCompound: { paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#f4f4f4', borderRadius: 8 },
  compareCompoundTxt: { fontSize: 13, color: C.ink },
  gramQuote: { fontSize: 13, color: '#5a6a8a', fontStyle: 'italic', marginBottom: 5, paddingLeft: 2 },
  patRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 4, flexWrap: 'wrap' },
  patSlotVar: { backgroundColor: C.lavaLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  patSlotVarTxt: { fontSize: 18, fontWeight: '700', color: C.lava },
  patSlotFix: {},
  patSlotFixTxt: { fontSize: 18, fontWeight: '300', color: C.ink },
  patMeaning: { fontSize: 12, color: C.muted, marginBottom: 2 },
  patHint: { fontSize: 10, color: C.mutedLight, marginTop: 4 },
  patInlineHint: { fontSize: 10, color: C.mutedLight },
  patChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  patChip: { borderWidth: 1.5, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center', backgroundColor: C.white },
  patChipActive: { borderColor: C.lava, backgroundColor: C.lavaLight },
  patChipWord: { fontSize: 14, fontWeight: '700', color: C.ink },
  patChipWordActive: { color: C.lava },
  patChipZh: { fontSize: 10, color: C.muted, marginTop: 2 },
  patChipZhActive: { color: C.lava },
  patContainer: { borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: '#c0a090', padding: 10 },
  patSentenceRow: { marginTop: 10, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: '#ddd', flexDirection: 'row', flexWrap: 'wrap' },
  patSentenceJp: { fontSize: 12, color: C.ink, fontWeight: '300' },
  patSentenceZh: { fontSize: 12, color: C.muted, fontWeight: '300' },
  pitchLabel: { fontSize: 10, fontWeight: '700', color: C.blueInk, letterSpacing: 1 },
  pitchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 6 },
  pitchSyl: { alignItems: 'center', gap: 4, marginRight: 2 },
  pitchChar: { fontSize: 18, fontWeight: '700', color: C.ink, lineHeight: 22 },
  pitchBar: { height: 3, borderRadius: 2, width: 28 },
  pitchBarHigh: { backgroundColor: C.blueInk },
  pitchBarLow: { backgroundColor: '#DDD5C8' },
  pitchBody: { fontSize: 11.5, color: C.blueInk, lineHeight: 18 },
  taskWrap: {
    marginTop: 14,
    marginBottom: 6,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#3f4d7a',
    marginBottom: 8,
  },
  taskCard: {
    backgroundColor: '#f7f8fc',
    borderColor: '#d9dfef',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  taskPrompt: {
    fontSize: 13,
    color: '#23304f',
    lineHeight: 20,
    fontWeight: '600',
  },
  taskAnswer: {
    fontSize: 12,
    color: '#5a678a',
    lineHeight: 19,
    marginTop: 6,
  },
  extraBox: {
  backgroundColor: C.paperWarm,
  borderRadius: 14,
  padding: 14,
  marginBottom: 10,
  borderWidth: 1.5,
  borderColor: '#f0e2b8',
},
extraTitle: {
  fontSize: 13,
  fontWeight: '700',
  color: C.goldInk,
  marginBottom: 8,
},
extraItem: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  marginBottom: 6,
},
extraBullet: {
  width: 14,
  fontSize: 13,
  color: C.goldInk,
  lineHeight: 20,
},
extraTxt: {
  flex: 1,
  fontSize: 13,
  color: '#4a3a16',
  lineHeight: 20,
},
spotlightBox: {
  backgroundColor: '#eef3ff',
  borderRadius: 14,
  padding: 14,
  marginBottom: 10,
  borderWidth: 1.5,
  borderColor: '#cfdcff',
},
spotlightTitle: {
  fontSize: 13,
  fontWeight: '700',
  color: '#34509a',
  marginBottom: 8,
},
spotlightTxt: {
  fontSize: 13,
  color: '#24365f',
  lineHeight: 20,
},
});
  // ─────────────────────────────────────────────
// Practice Screen
// ─────────────────────────────────────────────
function PracticeScreen({ scene, onBack, onDone }) {
  const [curIndex, setCurIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState([]);
  const inputTasks = (scene.inputTasks || []).map(t => ({
    kind: 'input',
    title: '听懂 / 看懂',
    prompt: t.prompt,
    answer: t.answer || '',
  }));
  const outputTasks = (scene.outputTasks || []).map(t => ({
    kind: 'output',
    title: t.type === 'roleplay' ? '情境输出' : '开口练习',
    prompt: t.promptZh || t.prompt,
    answer: t.target || (Array.isArray(t.targets) ? t.targets : ''),
  }));
  const tasks = [...inputTasks, ...outputTasks];
  const task = tasks[curIndex];
  const finished = tasks.length > 0 && results.length >= tasks.length;
  const knownCount = results.filter(r => r === 'known').length;
  const shakyCount = results.filter(r => r === 'shaky').length;
  const restart = () => {
    setCurIndex(0);
    setRevealed(false);
    setResults([]);
  };
  const selfRate = (result) => {
    setResults(prev => [...prev, result]);
    if (curIndex < tasks.length - 1) {
      setCurIndex(i => i + 1);
      setRevealed(false);
    }
  };
  const renderAnswer = (answer) => {
    if (Array.isArray(answer)) {
      return answer.map((line, i) => (
        <Text key={`${line}-${i}`} style={pr.answer}>• {line}</Text>
      ));
    }
    if (answer) return <Text style={pr.answer}>{answer}</Text>;
    return <Text style={pr.answer}>暂无标准答案，试着用自己的话说出来。</Text>;
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={pr.nav}>
        <TouchableOpacity onPress={onBack}>
          <Text style={[pr.navBack, { color: scene.color }]}>‹ 返回句子</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={pr.scroll} showsVerticalScrollIndicator={false}>
        <View style={[pr.hero, { backgroundColor: scene.bgColor, borderColor: scene.color + '30' }]}>
          <Text style={pr.heroEmoji}>{scene.emoji}</Text>
          <Text style={[pr.heroTitle, { color: scene.color }]}>{scene.label} · 练习</Text>
          <Text style={pr.heroSub}>先想一想，再看答案。</Text>
        </View>

        {tasks.length === 0 ? (
          <View style={pr.emptyCard}>
            <Text style={pr.emptyTitle}>这组暂时没有练习</Text>
            <Text style={pr.emptySub}>先回到句卡，把场景句读一遍。</Text>
            <View style={pr.actionRow}>
              <TouchableOpacity style={pr.ghostBtn} onPress={onBack}>
                <Text style={pr.ghostBtnTxt}>返回句卡</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[pr.solidBtn, { backgroundColor: scene.color }]} onPress={onDone}>
                <Text style={pr.solidBtnTxt}>完成</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : finished ? (
          <View style={pr.summaryCard}>
            <Text style={pr.summaryTitle}>这组练习完成了</Text>
            <Text style={pr.summaryLine}>共 {tasks.length} 题</Text>
            <View style={pr.scoreRow}>
              <View style={pr.scoreChip}>
                <Text style={pr.scoreN}>{knownCount}</Text>
                <Text style={pr.scoreLbl}>会了</Text>
              </View>
              <View style={pr.scoreChip}>
                <Text style={pr.scoreN}>{shakyCount}</Text>
                <Text style={pr.scoreLbl}>还不熟</Text>
              </View>
            </View>
            <Text style={pr.summarySub}>先能判断自己会不会，就是输出能力的开始。</Text>
            <View style={pr.actionRow}>
              <TouchableOpacity style={pr.ghostBtn} onPress={restart}>
                <Text style={pr.ghostBtnTxt}>再练一遍</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[pr.solidBtn, { backgroundColor: scene.color }]} onPress={onDone}>
                <Text style={pr.solidBtnTxt}>完成</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={pr.card}>
            <Text style={pr.progress}>第 {curIndex + 1} / {tasks.length} 题</Text>
            <Text style={[pr.kind, { color: scene.color }]}>{task.title}</Text>
            <Text style={pr.prompt}>{task.prompt}</Text>

            {!revealed ? (
              <TouchableOpacity style={[pr.revealBtn, { backgroundColor: scene.color }]} onPress={() => setRevealed(true)}>
                <Text style={pr.revealBtnTxt}>查看答案</Text>
              </TouchableOpacity>
            ) : (
              <>
                <View style={pr.answerBox}>
                  <Text style={pr.answerLabel}>参考答案</Text>
                  {renderAnswer(task.answer)}
                </View>
                <View style={pr.actionRow}>
                  <TouchableOpacity style={pr.ghostBtn} onPress={() => selfRate('shaky')}>
                    <Text style={pr.ghostBtnTxt}>还不熟</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[pr.solidBtn, { backgroundColor: scene.color }]} onPress={() => selfRate('known')}>
                    <Text style={pr.solidBtnTxt}>会了</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const pr = StyleSheet.create({
  nav: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  navBack: {
    fontSize: 15,
    fontWeight: '500',
  },
  scroll: {
    padding: 18,
    paddingBottom: 32,
  },
  hero: {
    borderRadius: 18,
    padding: 20,
    borderWidth: 1.5,
    marginBottom: 14,
    alignItems: 'center',
  },
  heroEmoji: {
    fontSize: 34,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 13,
    color: C.ink,
    textAlign: 'center',
    lineHeight: 20,
  },
  block: {
    marginBottom: 14,
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: C.ink,
    marginBottom: 8,
  },
  card: {
    backgroundColor: C.white,
    borderColor: C.border,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  prompt: {
    fontSize: 13,
    color: C.ink,
    lineHeight: 20,
    fontWeight: '600',
  },
  progress: {
    fontSize: 11,
    color: C.muted,
    fontWeight: '700',
    marginBottom: 8,
  },
  kind: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
  },
  answer: {
    fontSize: 12,
    color: C.muted,
    lineHeight: 19,
    marginTop: 6,
  },
  answerBox: {
    backgroundColor: C.tag,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  answerLabel: {
    fontSize: 10,
    color: C.muted,
    fontWeight: '800',
    marginBottom: 4,
  },
  revealBtn: {
    marginTop: 18,
    borderRadius: 13,
    paddingVertical: 13,
    alignItems: 'center',
  },
  revealBtnTxt: {
    fontSize: 14,
    color: C.white,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  ghostBtn: {
    flex: 1,
    borderRadius: 13,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  ghostBtnTxt: {
    fontSize: 14,
    color: C.ink,
    fontWeight: '700',
  },
  solidBtn: {
    flex: 1,
    borderRadius: 13,
    paddingVertical: 13,
    alignItems: 'center',
  },
  solidBtnTxt: {
    fontSize: 14,
    color: C.white,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: C.white,
    borderColor: C.border,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 18,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.ink,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 20,
  },
  summaryCard: {
    backgroundColor: C.white,
    borderColor: C.border,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 18,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.ink,
    marginBottom: 10,
  },
  summaryLine: {
    fontSize: 13,
    color: C.muted,
    fontWeight: '700',
  },
  scoreRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    marginBottom: 12,
  },
  scoreChip: {
    flex: 1,
    backgroundColor: C.tag,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  scoreN: {
    fontSize: 22,
    color: C.ink,
    fontWeight: '800',
  },
  scoreLbl: {
    fontSize: 11,
    color: C.muted,
    fontWeight: '700',
    marginTop: 2,
  },
  summarySub: {
    fontSize: 13,
    color: C.ink,
    lineHeight: 20,
    opacity: 0.76,
  },
});
// ─────────────────────────────────────────────
// 🚇 Subway Screen
// ─────────────────────────────────────────────
function TypeLine({ text, start, speed = 45, style }) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    if (!start) {
      setDisplayed('');
      return;
    }

    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, speed);

    return () => clearInterval(timer);
  }, [text, start, speed]);

  return <Text style={style}>{displayed}</Text>;
}
function SubwayFirstContactOverlay({ visible, onStart, onSkip }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!visible) return;

    setStage(0);

    const timers = [
      setTimeout(() => setStage(1), 150),
      setTimeout(() => setStage(2), 900),
      setTimeout(() => setStage(3), 1800),
      setTimeout(() => setStage(4), 2900),
      setTimeout(() => setStage(5), 4300),
    ];

    return () => timers.forEach(clearTimeout);
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={sfc.wrap}>
      <View style={sfc.mask} />

      <View style={sfc.panel}>
        <TypeLine text="SIGNAL DETECTED" start={stage >= 1} speed={40} style={sfc.topLine} />
<TypeLine text="FIRST CONTACT" start={stage >= 2} speed={45} style={sfc.subLine} />

<View style={[sfc.terminalBox, stage < 2 && { opacity: 0 }]}>
  <View style={sfc.squareWrap}>
    <View style={sfc.squareOuter} />
    <View style={sfc.squareMid} />
    <View style={sfc.squareCore}>
      <TypeLine text="WANDERER" start={stage >= 2} speed={55} style={sfc.squareLabel} />
    </View>
  </View>

  <View style={sfc.scanLine} />

  <View style={sfc.statusBlock}>
    <TypeLine text="LANGUAGE MODULE: LOADED..." start={stage >= 2} speed={28} style={sfc.statusLine} />
    <TypeLine text="USER DETECTED: WANDERER" start={stage >= 3} speed={28} style={sfc.statusLine} />
    <TypeLine text="SCENE: SUBWAY" start={stage >= 3} speed={28} style={sfc.statusLine} />
    <TypeLine text="STATUS: CONNECTED" start={stage >= 4} speed={28} style={sfc.statusLine} />
  </View>
</View>

<View style={[sfc.messageBox, stage < 4 && { opacity: 0 }]}>
  <TypeLine text="Can you hear me?" start={stage >= 4} speed={55} style={sfc.hero} />
  <TypeLine text="Absolutely." start={stage >= 5} speed={65} style={sfc.reply} />
</View>

        <View style={[sfc.btnRow, stage < 5 && { opacity: 0 }]}>
          <TouchableOpacity style={sfc.skipBtn} onPress={onSkip}>
            <Text style={sfc.skipBtnTxt}>跳过</Text>
          </TouchableOpacity>

          <TouchableOpacity style={sfc.startBtn} onPress={onStart}>
            <Text style={sfc.startBtnTxt}>开始连接</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const sfc = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  mask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6,6,16,0.92)',
  },
  panel: {
  width: '100%',
  backgroundColor: '#0a0a12',
  borderRadius: 0,
  borderWidth: 1,
  borderColor: '#2a2a3a',
  padding: 24,
  alignItems: 'center',
},
  topLine: {
    fontSize: 10,
    color: C.lava,
    letterSpacing: 2,
    marginBottom: 6,
  },
  subLine: {
    fontSize: 10,
    color: C.nightMutedLight,
    letterSpacing: 2,
    marginBottom: 18,
  },
  terminalBox: {
  width: '100%',
  borderWidth: 1,
  borderColor: '#5a4720',
  backgroundColor: '#101018',
  borderRadius: 0,
  padding: 16,
  marginBottom: 18,
},

squareWrap: {
  height: 130,
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 16,
},

squareOuter: {
  position: 'absolute',
  width: 128,
  height: 128,
  borderWidth: 1.5,
  borderColor: '#c6922b',
},

squareMid: {
  position: 'absolute',
  width: 88,
  height: 88,
  borderWidth: 1.2,
  borderColor: '#f4f1e8',
},

squareCore: {
  minWidth: 72,
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderWidth: 1,
  borderColor: '#b54a4a',
  backgroundColor: '#1a1212',
  alignItems: 'center',
},

squareLabel: {
  fontSize: 11,
  color: '#f4f1e8',
  letterSpacing: 1.5,
  fontWeight: '700',
},

scanLine: {
  height: 1,
  backgroundColor: '#3a3a52',
  marginBottom: 14,
},

statusBlock: {
  gap: 6,
},

statusLine: {
  fontSize: 11,
  color: '#d8c9a8',
  letterSpacing: 1,
},

messageBox: {
  width: '100%',
  borderWidth: 1,
  borderColor: C.nightLine,
  backgroundColor: '#12121a',
  borderRadius: 0,
  paddingVertical: 18,
  paddingHorizontal: 16,
  alignItems: 'center',
  marginBottom: 18,
},
hero: {
  fontSize: 28,
  color: '#f4f1e8',
  fontWeight: '300',
  textAlign: 'center',
  marginBottom: 8,
},
reply: {
  fontSize: 18,
  color: '#c6922b',
  fontWeight: '700',
  letterSpacing: 1,
},
  btnRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  skipBtn: {
  flex: 1,
  backgroundColor: '#161624',
  borderRadius: 0,
  borderWidth: 1,
  borderColor: C.nightLine,
  paddingVertical: 13,
  alignItems: 'center',
},
  skipBtnTxt: {
    fontSize: 14,
    color: '#8a8aa8',
    fontWeight: '600',
  },
  startBtn: {
  flex: 1,
  backgroundColor: '#c6922b',
  borderRadius: 0,
  paddingVertical: 13,
  alignItems: 'center',
},
  startBtnTxt: {
    fontSize: 14,
    color: C.white,
    fontWeight: '700',
  },
});
function SubwayScreen({ adventure }) {
  // 「通关解锁下一站」的进度必须落盘 —— 原来只在 useState 里,
  // 重开 App 就退回第一站,解锁这件事等于没发生过。
  const [unlockedIdx, setUnlockedIdx] = useState(0);
  const unlockHydrated = useRef(false);
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SUBWAY_PROGRESS_KEY);
        const n = Number.parseInt(raw, 10);
        // 夹到实际站数以内:内容改版少了几站时,存着的旧下标会让渲染越界
        const maxIdx = Math.max((adventure?.stations?.length || 1) - 1, 0);
        if (Number.isFinite(n) && n > 0) setUnlockedIdx(Math.min(n, maxIdx));
      } catch (e) { /* 读不到就从头开始 */ }
      unlockHydrated.current = true;
    })();
  }, []);
  useEffect(() => {
    if (!unlockHydrated.current) return;   // 别用初始值 0 覆盖已存的进度
    AsyncStorage.setItem(SUBWAY_PROGRESS_KEY, String(unlockedIdx)).catch(() => {});
  }, [unlockedIdx]);
  const [view, setView] = useState('map');
  const [curStation, setCurStation] = useState(0);
  const [curStep, setCurStep] = useState(0);
  const [showFirstContact, setShowFirstContact] = useState(true);
  const { speak, speakingKey } = useSpeech();
  const lineAnim = useRef(new Animated.Value(0)).current;
  const personAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const stations = adventure.stations;

  useEffect(() => {
    Animated.timing(lineAnim, {
      toValue: unlockedIdx === 0 ? 0 : unlockedIdx / (stations.length - 1),
      duration: 800, useNativeDriver: false,
    }).start();
  }, [unlockedIdx]);

  const startWalk = () => {
    setCurStep(0);
    animatePerson(0);
    fadeScene();
    setView('walk');
  };

  const animatePerson = (stepIdx) => {
    const pos = stations[curStation].steps[stepIdx]?.personPos ?? 15;
    Animated.spring(personAnim, { toValue: (pos / 100) * (SW - 80), friction: 6, tension: 80, useNativeDriver: false }).start();
  };

  const fadeScene = () => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const nextStep = () => {
    const steps = stations[curStation].steps;
    if (curStep < steps.length - 1) {
      const next = curStep + 1;
      setCurStep(next); animatePerson(next); fadeScene();
    } else { setView('clear'); }
  };

  const unlockNext = () => {
    setUnlockedIdx(Math.max(unlockedIdx, curStation + 1));
    if (curStation + 1 < stations.length) setCurStation(curStation + 1);
    setView('map');
  };

  const step = stations[curStation]?.steps[curStep];
  const tagColors = { zh: ['#e8f4e022', '#4a9a60'], en: ['#e0e8ff22', '#4060a0'], culture: ['#fce8e022', '#c04010'] };
  const lineWidth = lineAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${100 - 100 / stations.length}%`] });

  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
          <SubwayFirstContactOverlay
        visible={showFirstContact}
        onSkip={() => setShowFirstContact(false)}
        onStart={() => setShowFirstContact(false)}
      />
      <View style={sw.header}>
        <Text style={sw.headerTitle}>東京 · {adventure.title}</Text>
        <View style={sw.lineWrap}>
          <View style={sw.lineTrack} />
          <Animated.View style={[sw.lineFill, { width: lineWidth }]} />
          <View style={sw.stationsRow}>
            {stations.map((s, i) => {
              const done = i < unlockedIdx, active = i === unlockedIdx, locked = i > unlockedIdx;
              return (
                <TouchableOpacity key={s.id} style={sw.stnWrap} onPress={() => !locked && (setCurStation(i), setView('map'))}>
                  <View style={[sw.dot, done && sw.dotDone, active && sw.dotActive, locked && sw.dotLocked]}>
                    {done && <Text style={sw.dotCheck}>✓</Text>}
                  </View>
                  <Text style={[sw.stnName, done && { color: '#5a5a8a' }, active && { color: C.lava }, locked && { color: C.nightLine }]}>{s.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {view === 'map' && (
          <ScrollView contentContainerStyle={sw.mapBody}>
            <View style={sw.stationCard}>
              <Text style={sw.levelBadge}>LEVEL {stations[curStation]?.level}</Text>
              <Text style={sw.stationBig}>{stations[curStation]?.name}駅</Text>
              <Text style={sw.stationSteps}>{stations[curStation]?.steps.length} 个关卡</Text>
              {stations[curStation]?.spotlight ? (
  <View style={sw.stationSpotlight}>
    <Text style={sw.stationSpotlightTxt}>{stations[curStation].spotlight}</Text>
  </View>
) : null}
              <TouchableOpacity style={sw.startBtn} onPress={startWalk}>
                <Text style={sw.startBtnTxt}>进站 →</Text>
              </TouchableOpacity>
            </View>
            {adventure.culturalNote && (
              <View style={sw.cultureCard}>
                <Text style={sw.cultureTitleTxt}>🧭 私铁文化</Text>
                <Text style={sw.cultureTxt}>{adventure.culturalNote}</Text>
              </View>
            )}
            {adventure.railNotes && adventure.railNotes.length > 0 && (
  <View style={sw.cultureCard}>
    <Text style={sw.cultureTitleTxt}>🎫 票务补充</Text>
    {adventure.railNotes.map((note, i) => (
      <View key={i} style={{ marginTop: i === 0 ? 0 : 12 }}>
        <Text style={sw.railTitle}>{note.title}</Text>
        <Text style={sw.cultureTxt}>{note.body}</Text>
        {note.bullets && note.bullets.map((b, j) => (
          <View key={j} style={sw.railItem}>
            <Text style={sw.railBullet}>•</Text>
            <Text style={sw.railTxt}>{b}</Text>
          </View>
        ))}
      </View>
    ))}
  </View>
)}
<View style={{ height: 24 }} />
          </ScrollView>
        )}
        {view === 'walk' && step && (
          <View style={{ flex: 1 }}>
            <View style={sw.sceneArea}>
              <View style={sw.track} />
              <Animated.View style={[sw.signBoard, { opacity: fadeAnim }]}>
                <Text style={sw.signJp}>{step.sign}</Text>
                <Text style={sw.signSub}>{step.signSub}</Text>
              </Animated.View>
              <Animated.View style={[sw.personWrap, { left: personAnim }]}>
                <View style={sw.personDot} />
                <View style={sw.personShadow} />
              </Animated.View>
              <View style={sw.progRow}>
                {stations[curStation].steps.map((_, i) => (
                  <View key={i} style={[sw.progDot, i < curStep && { backgroundColor: C.lava }, i === curStep && { backgroundColor: C.white }]} />
                ))}
              </View>
            </View>
            <ScrollView style={sw.infoPanel} contentContainerStyle={{ paddingBottom: 24 }}>
              <Text style={sw.infoStep}>{step.step}</Text>
              {step.jp !== '（无需说话）' && step.jp !== '（Suica轻触，无需说话）' ? (
  <>
    <View style={sw.infoJpRow}>
      <Text style={sw.infoJp}>{step.jp}</Text>
      <SpeakBtn
        onPress={() => speak(step.jp, 'ja-JP', `subway-${curStation}-${curStep}`)}
        speaking={speakingKey === `subway-${curStation}-${curStep}`}
        size="sm"
        color={C.lava}
      />
    </View>
    {step.zh ? <Text style={sw.infoZh}>{step.zh}</Text> : null}
    {step.en ? <Text style={sw.infoEn}>{step.en}</Text> : null}
  </>
) : (
  <Text style={sw.infoJpMuted}>{step.jp}</Text>
)}
<Text style={sw.infoTip}>{step.tip}</Text>
              {step.tags && (
                <View style={sw.tagsRow}>
                  {step.tags.map((tag, i) => {
                    const [bg, fg] = tagColors[tag.type] || ['#f0ede622', '#888'];
                    return <View key={i} style={[sw.tag, { backgroundColor: bg }]}><Text style={[sw.tagTxt, { color: fg }]}>{tag.text}</Text></View>;
                  })}
                </View>
              )}
              <TouchableOpacity style={sw.nextBtn} onPress={nextStep}>
                <Text style={sw.nextBtnTxt}>{curStep === stations[curStation].steps.length - 1 ? '通关 ✓' : '了解，继续 →'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {view === 'clear' && (
          <ScrollView contentContainerStyle={sw.clearBody}>
            <Text style={sw.clearStar}>⭐</Text>
            <Text style={sw.clearTitle}>通关！</Text>
            <Text style={sw.clearStnName}>{stations[curStation]?.name}駅</Text>
            {stations[curStation]?.phrases.map((p, i) => (
              <View key={i} style={sw.phraseCard}>
                <Text style={sw.phraseJp}>{p.jp}</Text>
                <Text style={sw.phraseZh}>{p.zh}</Text>
              </View>
            ))}
            {curStation < stations.length - 1 ? (
              <TouchableOpacity style={sw.unlockBtn} onPress={unlockNext}>
                <Text style={sw.unlockBtnTxt}>解锁 {stations[curStation + 1]?.name} →</Text>
              </TouchableOpacity>
            ) : (
              <View style={sw.finalCard}>
                <Text style={sw.finalTxt}>🎌 全线通关！</Text>
              </View>
            )}
            <TouchableOpacity style={sw.replayBtn} onPress={() => setView('map')}>
              <Text style={sw.replayBtnTxt}>返回线路图</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </View>
  );
}
const sw = StyleSheet.create({
  header: { backgroundColor: C.ink, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.night },
  headerTitle: { fontSize: 11, color: C.lava, letterSpacing: 2, marginBottom: 12 },
  lineWrap: { position: 'relative', paddingBottom: 28 },
  lineTrack: { position: 'absolute', top: 10, left: 10, right: 10, height: 2, backgroundColor: C.night },
  lineFill: { position: 'absolute', top: 10, left: 10, height: 2, backgroundColor: C.lava },
  stationsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stnWrap: { alignItems: 'center', gap: 5 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.night, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: C.lava, borderColor: C.lava },
  dotActive: { borderColor: C.lava },
  dotLocked: { borderColor: C.night },
  dotCheck: { fontSize: 9, color: C.white },
  stnName: { fontSize: 9, textAlign: 'center' },
  mapBody: { padding: 20, gap: 12 },
  stationCard: { backgroundColor: '#0e0e18', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: C.night },
  levelBadge: { fontSize: 10, color: C.lava, letterSpacing: 3, marginBottom: 8 },
  stationBig: { fontSize: 42, color: C.white, fontWeight: '200', letterSpacing: 6 },
  stationSteps: { fontSize: 11, color: C.nightLine, marginTop: 8 },
  startBtn: { marginTop: 16, borderWidth: 1, borderColor: C.lava, borderRadius: 20, paddingHorizontal: 32, paddingVertical: 10 },
  startBtnTxt: { fontSize: 13, color: C.lava, letterSpacing: 2 },
  cultureCard: { backgroundColor: '#0e0e18', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.night },
  cultureTitleTxt: { fontSize: 11, color: '#5a5a8a', letterSpacing: 1, marginBottom: 8 },
  cultureTxt: { fontSize: 12, color: '#3a3a5a', lineHeight: 20 },
  sceneArea: { height: 160, backgroundColor: '#060610', position: 'relative', overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: C.night },
  track: { position: 'absolute', bottom: 32, left: 0, right: 0, height: 2, backgroundColor: C.night },
  signBoard: { position: 'absolute', top: 20, left: 0, right: 0, alignItems: 'center' },
  signJp: { fontSize: 28, color: C.white, fontWeight: '200', textAlign: 'center' },
  signSub: { fontSize: 10, color: '#3a3a6a', letterSpacing: 1, marginTop: 4, textAlign: 'center' },
  personWrap: { position: 'absolute', bottom: 24, alignItems: 'center' },
  personDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.lava, shadowColor: C.lava, shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  personShadow: { width: 16, height: 4, borderRadius: 8, backgroundColor: C.lava, opacity: 0.25, marginTop: 2 },
  progRow: { position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  progDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.night },
  infoPanel: { flex: 1, backgroundColor: '#0a0a12', padding: 18 },
  infoStep: { fontSize: 10, color: C.lava, letterSpacing: 2, marginBottom: 8 },
  infoJpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  infoJp: { fontSize: 20, color: C.white, fontWeight: '200', flex: 1 },
  infoZh: {
  fontSize: 15,
  color: C.white,
  marginBottom: 4,
  lineHeight: 22,
},
infoEn: {
  fontSize: 12,
  color: C.nightMutedLight,
  marginBottom: 10,
  fontStyle: 'italic',
  lineHeight: 18,
},
  infoJpMuted: { fontSize: 14, color: C.nightLine, marginBottom: 10, fontStyle: 'italic' },
  infoTip: { fontSize: 13, color: C.nightMuted, lineHeight: 20, marginBottom: 12 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  tag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tagTxt: { fontSize: 10 },
  nextBtn: { backgroundColor: C.lava, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  nextBtnTxt: { fontSize: 13, color: C.white, fontWeight: '600', letterSpacing: 1 },
  clearBody: { padding: 24, alignItems: 'center', gap: 8 },
  clearStar: { fontSize: 48 },
  clearTitle: { fontSize: 28, color: C.white, fontWeight: '200', letterSpacing: 4 },
  clearStnName: { fontSize: 11, color: C.lava, letterSpacing: 2 },
  phraseCard: { backgroundColor: '#0e0e18', borderRadius: 12, padding: 14, width: '100%', borderWidth: 1, borderColor: C.night },
  phraseJp: { fontSize: 15, color: C.white, fontWeight: '300' },
  phraseZh: { fontSize: 11, color: '#4a4a7a', marginTop: 4 },
  unlockBtn: { marginTop: 8, borderWidth: 1, borderColor: C.lava, borderRadius: 20, paddingHorizontal: 32, paddingVertical: 12, width: '100%', alignItems: 'center' },
  unlockBtnTxt: { fontSize: 13, color: C.lava, letterSpacing: 1 },
  finalCard: { marginTop: 8, backgroundColor: '#1e0e0a', borderRadius: 14, padding: 20, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: C.lava + '44' },
  finalTxt: { fontSize: 18, color: C.white, fontWeight: '300' },
  replayBtn: { marginTop: 4, paddingVertical: 10 },
  replayBtnTxt: { fontSize: 12, color: '#3a3a5a' },
  railTitle: {
  fontSize: 13,
  color: C.white,
  fontWeight: '600',
  marginBottom: 8,
},
railItem: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  marginTop: 6,
},
railBullet: {
  width: 14,
  fontSize: 12,
  color: C.lava,
  lineHeight: 18,
},
railTxt: {
  flex: 1,
  fontSize: 12,
  color: C.nightMuted,
  lineHeight: 18,
},
stationSpotlight: {
  marginTop: 12,
  backgroundColor: '#161624',
  borderRadius: 12,
  padding: 12,
  borderWidth: 1,
  borderColor: C.nightLine,
},
stationSpotlightTxt: {
  fontSize: 12,
  color: C.nightMutedLight,
  lineHeight: 19,
  textAlign: 'left',
},
});

// ─────────────────────────────────────────────
// あ Kana Screen
// ─────────────────────────────────────────────
function geoToXY(geo, cell) {
  return {
    x: ((geo.lng + 180) / 4) * cell,
    y: ((80 - geo.lat) / 4) * cell,
  };
}


// ─────────────────────────────────────────────
// 捺 Tab — 世界打卡
// ─────────────────────────────────────────────

function NaTab({ mapPlaces: initialPlaces }) {
  const [typeF, setTypeF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [sel, setSel] = useState(null);
  const [openMemoryId, setOpenMemoryId] = useState(null);
  // 小练习的答案要先藏起来。内容里 review 一直写着 { prompt, answer, hint } 三样,
  // 界面却只渲染了问题和提示 —— 一道题问完不给答案,用户只能自己上网查,
  // 或者更可能的是:算了。但也不能直接摊开,摊开就不是练习是阅读了。
  const [openAnswerId, setOpenAnswerId] = useState(null);
  const [noteDrafts, setNoteDrafts] = useState({});
  const [ceremony, setCeremony] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  // 足迹的 6 份数据和它们的落盘规则都在 useWorldFootprint 里 ——
  // 这里只留纯 UI 状态(筛选、展开、弹窗草稿)。
  // 自定义打卡:言收录的地点是有限的,用户去的地方是无限的。
  // 把「能不能打卡」绑在「言有没有收录」上,等于让内容产量成为产品天花板。
  const {
    places, visitedIds, checkinDates, placeNotes, photoUris, myPlaces, mapPoints,
    // countries / countryRows 曾经漏在这里 —— 下面用了它们,却没从 hook 取出来,
    // 于是「世界打卡」一进去就 ReferenceError 白屏。JS 不会在编译期告诉你这件事,
    // 只有真机点进那个 Tab 才会炸,而这一层没有测试覆盖。
    customRecords, countries, countryRows,
    checkIn, saveNote: persistNote, toggleStatus: togglePlaceStatus, pickPhoto, setVisitedOn,
    addPlace, removePlace, updatePlace, pickPhotoForCustom, importFromPhotos,
  } = useWorldFootprint(initialPlaces);
  // 自己记的地点:展开哪一条、手账草稿
  const [openMineId, setOpenMineId] = useState(null);
  const [mineDrafts, setMineDrafts] = useState({});
  const [nameDrafts, setNameDrafts] = useState({});
  const [dateDrafts, setDateDrafts] = useState({});
  const [countryOpen, setCountryOpen] = useState(false);
  // 导入进度。null = 没在导入;字符串 = 当前在做什么(直接显示给用户)
  const [importing, setImporting] = useState(null);

  const runImport = async () => {
    if (importing) return;
    setImporting('准备中…');
    try {
      const r = await importFromPhotos({
        onProgress: ({ phase, done, total }) => {
          // 反查地名受 Nominatim 每秒 1 次限速,十几个点要等十几秒。
          // 不报进度的话用户会以为卡死了。
          if (phase === 'reading') setImporting(`读取照片 ${done}/${total}`);
          else if (phase === 'naming') setImporting(`查地名 ${done}/${total} · 需要等一会`);
          else setImporting('收尾中…');
        },
      });
      if (r) Alert.alert('导入完成', r.message, [{ text: '好' }]);
    } catch (e) {
      Alert.alert('导入没能完成', e?.message || '未知错误,已记录的部分不受影响');
    } finally {
      setImporting(null);
    }
  };
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addHits, setAddHits] = useState([]);
  const [addBusy, setAddBusy] = useState(false);
  // 请求失败的原因。null = 没失败(可能是真的没搜到,两者含义相反)
  const [addErr, setAddErr] = useState(null);
  const [addPicked, setAddPicked] = useState(null);
  const [addNote, setAddNote] = useState('');
  // 到访日期:必须和「记录日期」分开 —— 旅行回来一次性补记 10 个地方,
  // created_at 全是同一天,旅迹会算成「一天飞遍东南亚」。
  const [addDate, setAddDate] = useState('');
  const { speak, speakingKey } = useSpeech();

  // 搜地名。Nominatim 要求每秒最多 1 次,所以防抖 600ms,不是每敲一个字就发。
  useEffect(() => {
    const q = addQuery.trim();
    if (q.length < 2) { setAddHits([]); return; }
    setAddBusy(true);
    const t = setTimeout(async () => {
      const { hits, error } = await searchPlaceDetailed(q);
      setAddHits(hits);
      setAddErr(error);
      setAddBusy(false);
    }, 600);
    return () => { clearTimeout(t); setAddBusy(false); };
  }, [addQuery]);

  const resetAdd = () => {
    setAddOpen(false); setAddQuery(''); setAddHits([]); setAddPicked(null); setAddErr(null);
    setAddNote(''); setAddDate('');
  };
  const savePlace = async (name, hit) => {
    await addPlace({
      name,
      city: hit?.city || '',
      country: hit?.country || '',
      lat: hit?.lat,
      lng: hit?.lng,
      note: addNote.trim(),
      visitedOn: normalizeDate(addDate) || new Date().toISOString().slice(0, 10),
    });
    resetAdd();
  };

  const confirmAdd = async () => {
    const name = (addPicked?.name || addQuery).trim();
    if (!name) return;

    // 没坐标的地点不会出现在地图和地球仪上 —— 而按下「记下来」的人,
    // 预期就是「它会点亮」。所以没选搜索结果时先替他查一次。
    let hit = addPicked;
    let err = null;
    if (!hit) {
      setAddBusy(true);
      const r = await searchPlaceDetailed(name).catch(e => ({ hits: [], error: e?.message }));
      setAddBusy(false);
      hit = r.hits?.[0] || null;
      err = r.error;
    }

    // 用户没有亲手点候选项时,不能默默采用结果。
    // 国区的系统地名服务查国外地名会返回一个国内的近似匹配 ——
    // 「伊斯坦布尔」存成成都市、「格雷梅」存成保定市,而且毫无提示。
    // 自动挑的一律先给他看一眼落在哪。
    if (hit && !addPicked && Number.isFinite(hit.lat)) {
      const where = [hit.name, hit.city, hit.country].filter(Boolean).join(' · ');
      const suspect = hit.source === 'os';
      Alert.alert(
        '找到这个位置',
        `${where}\n${hit.lat.toFixed(3)}, ${hit.lng.toFixed(3)}`
        + (suspect ? '\n\n⚠️ 这条来自系统地名服务,在国内查国外地名时可能匹配到错误的国内位置。请核对是不是你要的地方。' : ''),
        [
          { text: '不对,我再改', style: 'cancel' },
          { text: '就是这里', onPress: () => savePlace(name, hit) },
        ],
      );
      return;
    }

    if (!hit || !Number.isFinite(hit.lat) || !Number.isFinite(hit.lng)) {
      // 「连不上」和「查不到」要分开说 —— 前者改地名毫无用处,
      // 一直劝用户换写法只会让他反复试到放弃。
      Alert.alert(
        err ? '连不上地名服务' : '没查到这个地名的坐标',
        err
          ? `${err}\n\n「${name}」可以先记下来,等网络恢复后重新添加就能点亮地图。`
          : `「${name}」可以记下来,但不会出现在地图和地球仪上。\n\n换个更具体的写法(比如「伊斯坦布尔」而不是「土耳其」)通常能查到。`,
        [
          { text: err ? '取消' : '换个写法', style: 'cancel' },
          { text: '仍然记下', onPress: () => savePlace(name, null) },
        ],
      );
      return;
    }
    await savePlace(name, hit);
  };
  const deleteMyPlace = (id, name) => {
    Alert.alert('删掉这个地方?', name, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => removePlace(id) },
    ]);
  };

  const shown = places.filter(
    p => (typeF === 'all' || p.type === typeF) && (statusF === 'all' || p.status === statusF)
  );
  // 计数只算当前内容里有的地点(记录可能包含旧内容里的地点,它们仍存在磁盘上,
  // 只是这一版内容没有,不参与显示和计数)
  const knownVisited = visitedIds.filter(id => places.some(p => p.id === id));
  const been = knownVisited.length;
  const wish = Math.max(places.length - been, 0);
  // 分类从数据自动生成:content.json 里出现新 type 就自动多一个筛选项,
  // 地点可带 typeLabel 字段自定义显示名;这里只留旧类型的兜底翻译。
  const TYPE_LABEL_FALLBACK = {
    volcano: '火山', snow: '雪山', water: '山河湖海', landmark: '人文地标',
    life: '在地风味', experience: '奇观体验', island: '海岛', forest: '森林秘境',
    onsen: '温泉', city: '城市夜色', festival: '节庆', wildlife: '野生相遇',
  };
  const typeFilters = [
    { id: 'all', label: '全部', widthStyle: ms.fBtnShort },
    ...Array.from(new Set(places.map(p => p.type).filter(Boolean))).map(type => {
      const label = places.find(p => p.type === type && p.typeLabel)?.typeLabel
        || TYPE_LABEL_FALLBACK[type] || type;
      return { id: type, label, widthStyle: label.length >= 4 ? ms.fBtnLong : ms.fBtnShort };
    }),
  ];
  const statusFilters = [
    { id: 'all', label: '全部状态', widthStyle: ms.fBtnState },
    { id: 'been', label: '去过', widthStyle: ms.fBtnShort },
    { id: 'wish', label: '想去', widthStyle: ms.fBtnShort },
  ];

useEffect(() => {
  if (sel && !shown.some(p => p.id === sel.id)) {
    setSel(null);
  }
  if (openMemoryId && !shown.some(p => p.id === openMemoryId)) {
    setOpenMemoryId(null);
  }
}, [typeF, statusF, places, sel, openMemoryId]);
  // 落盘规则都在 useWorldFootprint 里。这里只留「UI 的那一半」:
  // 打卡完要放一下仪式动画,存备注要先从草稿里取出文字。
  const doCheckIn = (place) => {
    checkIn(place);
    setCeremony(place);
  };
  const saveNote = (placeId) => persistNote(placeId, noteDrafts[placeId] ?? '');
  const renderMemoryCard = (place) => {
    const memory = place.memory;
    if (!memory) return null;

    const phraseText = memory?.phrase?.text || place.jp;
    const phraseZh = memory?.phrase?.translation || place.zh;
    const audioText = memory?.phrase?.audioText || phraseText;
    const langCode = memory?.language?.code || place.lang;
    const title = memory?.title || place.name;
    const isOpen = openMemoryId === place.id;
    const swapItems = Array.isArray(memory?.swap?.items)
      ? memory.swap.items.slice(0, 3).filter(item => item?.text || item?.translation)
      : [];
    const hasContext = !!(memory?.context?.situation || memory?.context?.note);
    const hasReview = !!(memory?.review?.prompt || memory?.review?.hint);
    const answerOpen = openAnswerId === place.id;

    return (
      <>
        <TouchableOpacity
          style={ms.memoryToggle}
          onPress={(event) => {
            event.stopPropagation();
            setOpenMemoryId(prev => (prev === place.id ? null : place.id));
          }}
          activeOpacity={0.82}
        >
          <Text style={ms.memoryToggleTxt}>{isOpen ? '记忆卡已展开 · 收起' : '打开记忆卡'}</Text>
        </TouchableOpacity>

        {isOpen && (
          <View style={ms.memoryCard}>
            <View>
              <Text style={ms.memoryEyebrow}>记忆卡</Text>
              {!!title && <Text style={ms.memoryTitle}>{title}</Text>}
            </View>

            <View style={ms.memoryPhrase}>
              <View style={{ flex: 1 }}>
                {!!phraseText && <Text style={ms.memoryJp}>{phraseText}</Text>}
                {!!phraseZh && <Text style={ms.memoryZh}>{phraseZh}</Text>}
              </View>
              {!!audioText && (
                <SpeakBtn
                  onPress={() => speak(audioText, langCode, `memory-${place.id}`)}
                  speaking={speakingKey === `memory-${place.id}`}
                  size="sm"
                />
              )}
            </View>

            {hasContext && (
              <View style={ms.memorySection}>
                <Text style={ms.memorySectionTitle}>场景</Text>
                {!!memory?.context?.situation && (
                  <Text style={ms.memoryBody}>{memory.context.situation}</Text>
                )}
                {!!memory?.context?.note && (
                  <Text style={ms.memorySubtle}>{memory.context.note}</Text>
                )}
              </View>
            )}

            {!!memory?.phrase?.pattern && (
              <View style={ms.memorySection}>
                <Text style={ms.memorySectionTitle}>句型</Text>
                <Text style={ms.memoryPattern}>{memory.phrase.pattern}</Text>
              </View>
            )}

            {swapItems.length > 0 && (
              <View style={ms.memorySection}>
                <Text style={ms.memorySectionTitle}>替换一下</Text>
                <View style={ms.memorySwapRow}>
                  {swapItems.map((item, index) => (
                    <TouchableOpacity
                      key={`${place.id}-swap-${index}`}
                      style={ms.memorySwapChip}
                      activeOpacity={0.78}
                      onPress={(event) => {
                        event.stopPropagation?.();
                        if (item.text) speak(item.text, langCode || 'ja-JP', `memory-swap-${place.id}-${index}`);
                      }}
                    >
                      {!!item.text && <Text style={ms.memorySwapText} numberOfLines={1}>{item.text}</Text>}
                      {!!item.translation && (
                        <Text style={ms.memorySwapZh} numberOfLines={1}>{item.translation}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {hasReview && (
              <View style={ms.memorySection}>
                <Text style={ms.memorySectionTitle}>小练习</Text>
                {!!memory?.review?.prompt && (
                  <Text style={ms.memoryReview}>{memory.review.prompt}</Text>
                )}
                {!!memory?.review?.hint && (
                  <Text style={ms.memorySubtle}>{memory.review.hint}</Text>
                )}
                {!!memory?.review?.answer && (
                  answerOpen ? (
                    <View style={ms.memoryAnswerRow}>
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={() => speak(memory.review.answer, langCode, `mem-ans-${place.id}`)}
                        activeOpacity={0.6}
                      >
                        <Text style={ms.memoryAnswer}>{memory.review.answer}</Text>
                      </TouchableOpacity>
                      {/* 同上:朗读统一走「言」按钮 */}
                      <SpeakBtn
                        onPress={() => speak(memory.review.answer, langCode, `mem-ans-${place.id}`)}
                        speaking={speakingKey === `mem-ans-${place.id}`}
                        size="sm"
                      />
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={ms.memoryAnswerBtn}
                      onPress={() => setOpenAnswerId(place.id)}
                    >
                      <Text style={ms.memoryAnswerBtnTxt}>自己想一遍,再看答案</Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            )}

            {!!memory?.footprint?.traceText && (
              <View style={ms.memoryTraceBox}>
                <Text style={ms.memorySectionTitle}>留痕</Text>
                <Text style={ms.memoryTrace}>{memory.footprint.traceText}</Text>
              </View>
            )}
          </View>
        )}
      </>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={ms.hd}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={ms.title}>世界足迹</Text>
            <Text style={ms.sub}>丶——每个地方，用当地语言打卡</Text>
          </View>

          <View style={ms.stats}>
            {/* 国家放第一个:用户回看足迹时在意的是「点亮了几个国家」,
                不是「打了几个卡」—— 地点数是过程,国家数才是成就。 */}
            <TouchableOpacity
              style={ms.stat}
              onPress={() => setCountryOpen(true)}
              activeOpacity={0.7}
            >
              <Text style={ms.statN}>{countries.length}</Text>
              <Text style={ms.statL}>国家 ›</Text>
            </TouchableOpacity>
            <View style={ms.statDiv} />
            <View style={ms.stat}>
              <Text style={ms.statN}>{been + customRecords.length}</Text>
              <Text style={ms.statL}>去过</Text>
            </View>
            <View style={ms.statDiv} />
            <View style={ms.stat}>
              <Text style={ms.statN}>{wish}</Text>
              <Text style={ms.statL}>想去</Text>
            </View>
          </View>
        </View>
      </View>
      <View style={ms.viewSwitch}>
        {[{ id: 'list', label: '🗺 列表' }, { id: 'world', label: '🌍 世界' }].map(v => (
          <TouchableOpacity
            key={v.id}
            style={[ms.viewSwitchBtn, viewMode === v.id && ms.viewSwitchBtnAct]}
            onPress={() => setViewMode(v.id)}
            activeOpacity={0.85}
          >
            <Text style={[ms.viewSwitchTxt, viewMode === v.id && ms.viewSwitchTxtAct]}>{v.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {viewMode === 'world' && (
        <ScrollView contentContainerStyle={{ padding: 14 }} showsVerticalScrollIndicator={false}>
          {/* 精选点和自己记的点画在同一张图上 —— 对用户来说都是「我的足迹」,
              区别只在点开之后有没有言的注记。 */}
          <WorldMap
            points={mapPoints}
            onSelect={(p) => {
              // 自己记的点现在有详情了(照片/手账/日期),跳到列表并展开那一条。
              // 以前这里直接 return —— 点了没反应,用户只会觉得地图是坏的。
              if (p.custom) {
                setViewMode('list');
                setOpenMineId(String(p.id).replace(/^my-/, ''));
                return;
              }
              setTypeF('all');
              setStatusF('all');
              setSel(places.find(x => x.id === p.id) || null);
              setViewMode('list');
            }}
          />
        </ScrollView>
      )}

      {viewMode === 'list' && (
      <View style={ms.filterSection}>
        <ScrollView
  horizontal
  showsHorizontalScrollIndicator={false}
  style={ms.filterScroll}
  contentContainerStyle={ms.filterRow}
>
  {typeFilters.map(filter => (
    <TouchableOpacity
      key={`type-${filter.id}`}
      style={[ms.fBtn, filter.widthStyle, typeF === filter.id && ms.fBtnAct]}
      onPress={() => setTypeF(prev => (prev === filter.id ? prev : filter.id))}
      activeOpacity={1}
    >
      <Text style={[ms.fTxt, typeF === filter.id && ms.fTxtAct]} numberOfLines={1}>
        {filter.label}
      </Text>
    </TouchableOpacity>
  ))}

  <View style={ms.fDiv} />

  {statusFilters.map(filter => (
    <TouchableOpacity
      key={`status-${filter.id}`}
      style={[ms.fBtn, filter.widthStyle, statusF === filter.id && ms.fBtnAct]}
      onPress={() => setStatusF(prev => (prev === filter.id ? prev : filter.id))}
      activeOpacity={1}
    >
      <Text style={[ms.fTxt, statusF === filter.id && ms.fTxtAct]} numberOfLines={1}>
        {filter.label}
      </Text>
    </TouchableOpacity>
  ))}
</ScrollView>
      </View>
      )}

      {viewMode === 'list' && (
      <ScrollView contentContainerStyle={ms.list} showsVerticalScrollIndicator={false}>
        {shown.length === 0 && (
          <View style={ms.emptyState}>
            <Text style={ms.emptyTitle}>还没有去过的地方</Text>
            <Text style={ms.emptySub}>添加你的第一段足迹，慢慢把世界点亮。</Text>
          </View>
        )}

        {shown.map(place => (
  <TouchableOpacity
    key={place.id}
    style={[ms.card, sel?.id === place.id && ms.cardSel]}
    onPress={() => setSel(sel?.id === place.id ? null : place)}
    activeOpacity={0.85}
  >
    <View style={ms.cardHd}>
      <View style={[ms.statusDot, place.status === 'been' ? ms.dotBeen : ms.dotWish]} />
      <Text style={{ fontSize: 22 }}>{place.emoji}</Text>

      <View style={{ flex: 1 }}>
        <Text style={ms.cardName}>{place.name}</Text>
        <Text style={ms.cardLoc}>{place.loc}</Text>
      </View>

      <TouchableOpacity
        style={[ms.sTag, place.status === 'been' ? ms.tagBeen : ms.tagWish]}
        onPress={(event) => {
          event.stopPropagation();
          togglePlaceStatus(place.id);
        }}
        activeOpacity={0.8}
      >
        <Text style={[ms.sTxt, place.status === 'been' ? ms.tagBeenTxt : ms.tagWishTxt]}>
          {place.status === 'been' ? '✓ 去过' : '🔖 想去'}
        </Text>
      </TouchableOpacity>
    </View>

   {sel?.id === place.id && (
      <View style={ms.detail}>
        {photoUris[place.id] ? (
          <View style={ms.photoWrap}>
            <Image source={{ uri: photoUris[place.id] }} style={ms.photo} resizeMode="cover" />
            <TouchableOpacity style={ms.photoEdit} onPress={() => pickPhoto(place.id)}>
              <Text style={ms.photoEditTxt}>换图 ✎</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={ms.photoPlaceholder} onPress={() => pickPhoto(place.id)}>
            <Text style={{ fontSize: 24 }}>📷</Text>
            <Text style={ms.photoPlaceholderTxt}>上传打卡照片</Text>
          </TouchableOpacity>
        )}

        <View style={ms.phraseRow}>
          <View style={{ flex: 1 }}>
            <Text style={ms.phraseJp}>{place.jp}</Text>
            <Text style={ms.phraseZh}>{place.zh}</Text>
          </View>

          <SpeakBtn
            onPress={() => speak(place.jp, place.lang, `place-${place.id}`)}
            speaking={speakingKey === `place-${place.id}`}
            size="sm"
          />
        </View>

        <Text style={ms.note}>{place.note}</Text>

        {Array.isArray(place.phrases) && place.phrases.length > 0 && (
          <View style={ms.deepBlock}>
            <Text style={ms.deepTitle}>🗣 救命句</Text>
            {place.phrases.map((ph, i) => (
              <View key={`ph-${i}`} style={ms.phraseItem}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={ms.phraseItemJp}>{ph.text}</Text>
                    {ph.check && <Text style={ms.phraseCheck}>待校</Text>}
                  </View>
                  <Text style={ms.phraseItemZh}>{ph.zh}</Text>
                  {!!ph.use && <Text style={ms.phraseUse}>{ph.use}</Text>}
                </View>
                <SpeakBtn
                  onPress={() => speak(ph.text, place.lang, `ph-${place.id}-${i}`)}
                  speaking={speakingKey === `ph-${place.id}-${i}`}
                  size="sm"
                />
              </View>
            ))}
          </View>
        )}

        {Array.isArray(place.sceneOps) && place.sceneOps.length > 0 && (
          <View style={ms.deepBlock}>
            <Text style={ms.deepTitle}>🧭 到了怎么做</Text>
            {place.sceneOps.map((op, i) => (
              <View key={`op-${i}`} style={ms.opRow}>
                <Text style={ms.opNum}>{i + 1}</Text>
                <Text style={ms.opTxt}>{op}</Text>
              </View>
            ))}
          </View>
        )}

        {!!place.tips && (
          <View style={ms.tipsRow}>
            {!!place.tips.when && <Text style={ms.tipChip}>🕐 {place.tips.when}</Text>}
            {!!place.tips.how && <Text style={ms.tipChip}>🧳 {place.tips.how}</Text>}
            {!!place.tips.cost && <Text style={ms.tipChip}>💰 {place.tips.cost}</Text>}
          </View>
        )}

        {Array.isArray(place.subSpots) && place.subSpots.length > 0 && (
          <View style={ms.deepBlock}>
            <Text style={ms.deepTitle}>📍 这里还有</Text>
            {place.subSpots.map((sp, i) => (
              <View key={`sp-${i}`} style={ms.subSpot}>
                <Text style={{ fontSize: 18 }}>{sp.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={ms.subSpotName}>{sp.name}</Text>
                  {!!sp.tip && <Text style={ms.subSpotTip}>{sp.tip}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}

        {place.status !== 'been' && (
          <TouchableOpacity
            style={ms.hereBtn}
            activeOpacity={0.88}
            onPress={(event) => { event.stopPropagation(); doCheckIn(place); }}
          >
            <Text style={ms.hereBtnTxt}>📍 我在这里 · 打卡</Text>
          </TouchableOpacity>
        )}

        {place.status !== 'been' && !!place.cultureEgg && (
          <View style={ms.eggLocked}>
            <Text style={ms.eggLockedTxt}>🥚 这里藏着一条当地人才知道的规则 · 打卡后浮现</Text>
          </View>
        )}

        {/* 日期必须能改:打卡写的是「打卡那一刻」,而人常常是回来之后一次性补录。
            不能改的话,十个地方的日期全是同一天,旅迹就成了「今天飞遍全球」。 */}
        {place.status === 'been' && (
          <View style={ms.dateRow}>
            <Text style={ms.checkinDate}>⛩ 哪天去的</Text>
            <TextInput
              style={ms.dateInput}
              value={
                dateDrafts[place.id]
                ?? (checkinDates[place.id]
                  ? new Date(checkinDates[place.id]).toISOString().slice(0, 10)
                  : '')
              }
              onChangeText={t => setDateDrafts(prev => ({ ...prev, [place.id]: t }))}
              placeholder={new Date().toISOString().slice(0, 10)}
              placeholderTextColor={C.mutedLight}
              keyboardType="numbers-and-punctuation"
              onEndEditing={() => {
                const draft = dateDrafts[place.id];
                if (draft === undefined) return;
                const day = normalizeDate(draft);
                if (!day && draft.trim()) {
                  Alert.alert('日期看不懂', '写成 2026-03-01 这样就行。', [{ text: '好' }]);
                  setDateDrafts(prev => { const n = { ...prev }; delete n[place.id]; return n; });
                  return;
                }
                setVisitedOn(place.id, day);
              }}
            />
          </View>
        )}

        {place.status === 'been' && !!place.cultureEgg && (
          <View style={ms.eggBox}>
            <Text style={ms.eggTitle}>当地人才知道的</Text>
            <Text style={ms.eggBody}>{place.cultureEgg}</Text>
          </View>
        )}

        {place.status === 'been' && (
          <View style={ms.noteBox}>
            <TextInput
              style={ms.noteInput}
              placeholder="写一句手账,留在这个坐标…"
              placeholderTextColor={C.mutedLight}
              value={noteDrafts[place.id] ?? placeNotes[place.id] ?? ''}
              onChangeText={t => setNoteDrafts(prev => ({ ...prev, [place.id]: t }))}
              onEndEditing={() => saveNote(place.id)}
              multiline
            />
          </View>
        )}

        {renderMemoryCard(place)}
      </View>
    )}
  </TouchableOpacity>
))}

        {/* 我自己记的地方:不依赖言的内容库,去哪都能记 */}
        {myPlaces.length > 0 && (
          <View style={ms.mineHead}>
            <Text style={ms.mineHeadTxt}>我记的 {myPlaces.length} 个</Text>
          </View>
        )}
        {/* 自己记的地方和精选地点是同一种东西 —— 一条打卡记录。
            所以这里给的是同样的东西:照片、手账、日期、可展开的详情。
            唯一的差别是有没有踩到言收录过的坐标,踩到了多一段内容(bonus)。 */}
        {customRecords.map(rec => {
          const isOpen = openMineId === rec.id;
          const bonus = bonusOf(rec);
          return (
            <TouchableOpacity
              key={rec.key}
              style={[ms.mineRow, isOpen && ms.mineRowOpen]}
              activeOpacity={0.9}
              onPress={() => setOpenMineId(isOpen ? null : rec.id)}
            >
              <View style={ms.mineTop}>
                <View style={{ flex: 1 }}>
                  <Text style={ms.mineName}>
                    {bonus?.emoji ? `${bonus.emoji} ` : ''}{rec.name}
                  </Text>
                  {!!rec.loc && <Text style={ms.mineMeta}>{rec.loc}</Text>}
                  {!!rec.visitedOn && (
                    <Text style={ms.mineMeta}>
                      ⛩ {new Date(rec.visitedOn).toLocaleDateString('zh-CN')}
                    </Text>
                  )}
                  {/* 没坐标就不会出现在地图上。与其让人对着「点亮 0 处」纳闷,不如直说。 */}
                  {!rec.hasCoords && (
                    <Text style={ms.mineMeta}>⚠️ 没有坐标,不会点亮地图</Text>
                  )}
                  {/* 收起时也能看见手账的头一行 —— 否则要挨个点开才知道哪条写过 */}
                  {!isOpen && !!rec.note && (
                    <Text style={ms.mineNote} numberOfLines={1}>{rec.note}</Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => deleteMyPlace(rec.id, rec.name)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={ms.mineDel}>删</Text>
                </TouchableOpacity>
              </View>

              {isOpen && (
                <View style={ms.mineBody}>
                  {/* 地名服务给的名字常常不是你叫它的那个名字(「Cankurtaran
                      Mahallesi」而不是「圣索菲亚」)。与其追求搜得准,
                      不如让你随时能改成自己认得的叫法。 */}
                  <TextInput
                    style={ms.mineNameInput}
                    value={nameDrafts[rec.id] ?? rec.name}
                    onChangeText={t => setNameDrafts(prev => ({ ...prev, [rec.id]: t }))}
                    placeholder="这个地方你叫它什么"
                    placeholderTextColor={C.mutedLight}
                    onEndEditing={() => {
                      const d = (nameDrafts[rec.id] ?? '').trim();
                      if (d && d !== rec.name) updatePlace(rec.id, { name: d });
                    }}
                  />
                  {rec.photoUri ? (
                    <TouchableOpacity onPress={() => pickPhotoForCustom(rec.id)}>
                      <Image source={{ uri: rec.photoUri }} style={ms.minePhoto} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={ms.photoPlaceholder}
                      onPress={() => pickPhotoForCustom(rec.id)}
                    >
                      <Text style={ms.photoPlaceholderTxt}>＋ 放一张这里的照片</Text>
                    </TouchableOpacity>
                  )}

                  {/* 踩到收录点的奖励内容。踩不到就没有,这是常态不是缺失。 */}
                  {!!bonus?.jp && (
                    <View style={ms.eggBox}>
                      <Text style={ms.eggTitle}>言在这里收了一句</Text>
                      <Text style={ms.eggBody}>{bonus.jp}{bonus.zh ? ` · ${bonus.zh}` : ''}</Text>
                    </View>
                  )}
                  {!!bonus?.cultureEgg && (
                    <View style={ms.eggBox}>
                      <Text style={ms.eggTitle}>当地人才知道的</Text>
                      <Text style={ms.eggBody}>{bonus.cultureEgg}</Text>
                    </View>
                  )}

                  <View style={ms.noteBox}>
                    <TextInput
                      style={ms.noteInput}
                      placeholder="写一句手账,留在这个坐标…"
                      placeholderTextColor={C.mutedLight}
                      value={mineDrafts[rec.id] ?? rec.note ?? ''}
                      onChangeText={t => setMineDrafts(prev => ({ ...prev, [rec.id]: t }))}
                      // 没动过草稿就什么都不做 —— 否则点一下输入框再退出,
                      // 会把已有的备注写成空字符串
                      onEndEditing={() => {
                        const draft = mineDrafts[rec.id];
                        if (draft !== undefined) updatePlace(rec.id, { note: draft.trim() });
                      }}
                      multiline
                    />
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={ms.addCard} onPress={() => setAddOpen(true)} activeOpacity={0.82}>
          <Text style={{ fontSize: 20, color: C.mutedLight }}>＋</Text>
          <Text style={ms.addTxt}>添加去过的地方</Text>
        </TouchableOpacity>

        {/* 从照片导入:过去几年的旅行都在相册里,手动补录是不现实的。 */}
        <TouchableOpacity
          style={ms.addCard}
          onPress={runImport}
          activeOpacity={0.82}
          disabled={!!importing}
        >
          {importing ? (
            <>
              <ActivityIndicator size="small" color={C.muted} />
              <Text style={ms.addTxt}>{importing}</Text>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 18, color: C.mutedLight }}>🖼</Text>
              <Text style={ms.addTxt}>从照片导入足迹</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>
      )}

      {/* 国家面板。光看「25 个国家」是个死数字,而「日本还有 6 个地方没去」
          是能行动的提示 —— 成就感来自差距可见,不是来自总数。 */}
      <Modal visible={countryOpen} transparent animationType="slide" onRequestClose={() => setCountryOpen(false)}>
        <View style={ms.addLayer}>
          <Pressable style={ms.addScrim} onPress={() => setCountryOpen(false)} />
          <View style={[ms.addSheet, { maxHeight: '82%' }]}>
            <View style={ms.addHead}>
              <Text style={ms.addTitle}>点亮 {countries.length} 个国家</Text>
              <TouchableOpacity onPress={() => setCountryOpen(false)}>
                <Text style={ms.addClose}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {countryRows.length === 0 && (
                <Text style={ms.addHint}>还没有任何记录。打个卡,或者从照片导入。</Text>
              )}
              {countryRows.map(row => (
                <View key={row.country} style={[ms.ctryRow, row.lit && ms.ctryRowLit]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[ms.ctryName, row.lit && ms.ctryNameLit]}>
                      {row.lit ? '● ' : '○ '}{row.country}
                    </Text>
                    {row.been.length > 0 && (
                      <Text style={ms.ctryMeta} numberOfLines={2}>{row.been.join('、')}</Text>
                    )}
                    {!row.lit && row.wish.length > 0 && (
                      <Text style={ms.ctryMeta} numberOfLines={2}>
                        还差一个:{row.wish.slice(0, 3).join('、')}{row.wish.length > 3 ? ' 等' : ''}
                      </Text>
                    )}
                  </View>
                  <Text style={[ms.ctryNum, row.lit && ms.ctryNumLit]}>
                    {row.lit ? row.been.length : row.wish.length}
                  </Text>
                </View>
              ))}
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 添加去过的地方。搜地名拿真实经纬度 ——
          存坐标而不是只存地名,以后接真实地图时历史数据能直接落到正确位置。 */}
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={resetAdd}>
        <KeyboardAvoidingView
          style={ms.addLayer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={ms.addScrim} onPress={() => Keyboard.dismiss()} />
          <View style={ms.addSheet}>
            <View style={ms.addHead}>
              <Text style={ms.addTitle}>去过哪里</Text>
              <TouchableOpacity onPress={resetAdd}><Text style={ms.addClose}>×</Text></TouchableOpacity>
            </View>
            <TextInput
              style={ms.addInput}
              value={addQuery}
              onChangeText={(v) => { setAddQuery(v); setAddPicked(null); }}
              placeholder="地名,中英文都行"
              placeholderTextColor={C.mutedLight}
              autoFocus
              returnKeyType="search"
            />
            {addBusy && <Text style={ms.addHint}>搜索中…</Text>}
            {!addBusy && !!addErr && (
              <Text style={ms.addHint}>连不上地名服务({addErr})。换个网络再试 —— 改地名没用。</Text>
            )}
            {!addBusy && !addErr && addQuery.trim().length >= 2 && addHits.length === 0 && (
              <Text style={ms.addHint}>没搜到。换个更具体的地名(如城市名)才能点亮地图。</Text>
            )}
            <ScrollView style={{ maxHeight: 210 }} keyboardShouldPersistTaps="handled">
              {addHits.map((h, i) => {
                const on = addPicked?.display === h.display;
                return (
                  <TouchableOpacity
                    key={`${h.display}-${i}`}
                    style={[ms.addHit, on && ms.addHitOn]}
                    onPress={() => { setAddPicked(h); Keyboard.dismiss(); }}
                  >
                    <Text style={ms.addHitName}>{h.name}</Text>
                    <Text style={ms.addHitMeta} numberOfLines={1}>{h.display}</Text>
                    {/* 系统地名服务在国区只有国内数据,查国外地名会返回一个
                        国内的近似匹配(「格雷梅」→ 保定市)。标出来,别让人以为这是答案。 */}
                    {h.source === 'os' && (
                      <Text style={ms.addHitWarn}>⚠️ 来自系统地名服务,查国外地点时常常匹配错,请核对</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TextInput
              style={ms.addNote}
              value={addDate}
              onChangeText={setAddDate}
              placeholder={`什么时候去的,如 ${new Date().toISOString().slice(0, 10)}(留空=今天)`}
              placeholderTextColor={C.mutedLight}
              keyboardType="numbers-and-punctuation"
            />
            <TextInput
              style={ms.addNote}
              value={addNote}
              onChangeText={setAddNote}
              placeholder="记一笔,可不填"
              placeholderTextColor={C.mutedLight}
            />
            <TouchableOpacity
              style={[ms.addSave, !addQuery.trim() && ms.addSaveOff]}
              onPress={confirmAdd}
              disabled={!addQuery.trim()}
            >
              <Text style={ms.addSaveTxt}>记下来</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <TripNotebook />

      <Modal visible={!!ceremony} transparent animationType="fade" onRequestClose={() => setCeremony(null)}>
        <View style={ms.cerBackdrop}>
          <View style={ms.cerCard}>
            <Text style={ms.cerEmoji}>{ceremony?.emoji}</Text>
            <Text style={ms.cerHere}>你在这里</Text>
            <Text style={ms.cerName}>{ceremony?.name}</Text>
            <Text style={ms.cerDate}>{new Date().toLocaleDateString('zh-CN')} · {ceremony?.loc}</Text>
            <View style={ms.cerDivider} />
            {!!ceremony?.jp && (
              <TouchableOpacity
                style={ms.cerPhrase}
                activeOpacity={0.85}
                onPress={() => ceremony && speak(ceremony.jp, ceremony.lang, `cer-${ceremony.id}`)}
              >
                <Text style={ms.cerJp}>{ceremony.jp}</Text>
                <Text style={ms.cerZh}>{ceremony.zh} · 点我开口说</Text>
              </TouchableOpacity>
            )}
            {!!ceremony?.cultureEgg && (
              <Text style={ms.cerEggHint}>🥚 一条当地人才知道的规则,已经放进你的卡片</Text>
            )}
            <TouchableOpacity
              style={ms.cerBtn}
              activeOpacity={0.88}
              onPress={() => { const p = ceremony; setCeremony(null); setSel(p); }}
            >
              <Text style={ms.cerBtnTxt}>留下这一刻 →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const ms = StyleSheet.create({
  hd: { padding: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  viewSwitch: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  viewSwitchBtn: { flex: 1, height: 34, borderRadius: 17, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  viewSwitchBtnAct: { backgroundColor: C.ink, borderColor: C.ink },
  viewSwitchTxt: { fontSize: 12, color: C.muted, fontWeight: '600' },
  viewSwitchTxtAct: { color: C.white },
  mapWrap: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, alignItems: 'center' },
  mapProgress: { alignSelf: 'stretch', marginBottom: 12 },
  mapProgressTxt: { fontSize: 12, color: C.ink, fontWeight: '700', marginBottom: 6 },
  mapProgressTrack: { height: 5, borderRadius: 3, backgroundColor: C.tag, overflow: 'hidden' },
  mapProgressFill: { height: 5, borderRadius: 3, backgroundColor: C.lava },
  mapFocusCard: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.paper, borderRadius: 13, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12 },
  mapFocusName: { fontSize: 14, color: C.ink, fontWeight: '700' },
  mapFocusLoc: { fontSize: 11, color: C.muted, marginTop: 1 },
  mapFocusGo: { fontSize: 12, color: C.teal, fontWeight: '800' },
  mapLegend: { flexDirection: 'row', gap: 18, marginTop: 12 },
  mapLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mapLegendDot: { width: 8, height: 8, borderRadius: 4 },
  mapLegendTxt: { fontSize: 11, color: C.muted, fontWeight: '600' },
  mapCaption: { fontSize: 11, color: C.mutedLight, marginTop: 10, fontStyle: 'italic', textAlign: 'center' },
  deepBlock: { backgroundColor: C.tag, borderRadius: 12, padding: 12, gap: 8 },
  deepTitle: { fontSize: 11, fontWeight: '700', color: C.muted, letterSpacing: 1 },
  phraseItem: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.white, borderRadius: 10, padding: 10 },
  phraseItemJp: { fontSize: 14, fontWeight: '600', color: C.ink },
  phraseItemZh: { fontSize: 12, color: C.muted, marginTop: 2 },
  phraseUse: { fontSize: 11, color: C.mutedLight, marginTop: 3, fontStyle: 'italic' },
  phraseCheck: { fontSize: 9, color: '#a07818', backgroundColor: '#fff6e0', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' },
  opRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  opNum: { width: 18, height: 18, borderRadius: 9, backgroundColor: C.lava, color: C.white, fontSize: 11, fontWeight: '700', textAlign: 'center', lineHeight: 18, overflow: 'hidden' },
  opTxt: { flex: 1, fontSize: 13, color: C.ink, lineHeight: 19 },
  tipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tipChip: { fontSize: 11, color: C.muted, backgroundColor: C.tag, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, overflow: 'hidden' },
  subSpot: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: C.white, borderRadius: 10, padding: 10 },
  subSpotName: { fontSize: 13, fontWeight: '600', color: C.ink },
  subSpotTip: { fontSize: 11, color: C.muted, marginTop: 2, lineHeight: 16 },
  hereBtn: { backgroundColor: C.lava, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  hereBtnTxt: { color: C.white, fontSize: 14, fontWeight: '700' },
  eggLocked: { backgroundColor: C.tag, borderRadius: 10, padding: 10 },
  eggLockedTxt: { fontSize: 11, color: C.mutedLight },
  eggBox: { backgroundColor: C.paperWarm, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#f0e0b0' },
  eggTitle: { fontSize: 10, fontWeight: '700', color: '#a07818', letterSpacing: 1, marginBottom: 4 },
  eggBody: { fontSize: 13, color: '#3a2a08', lineHeight: 20 },
  checkinDate: { fontSize: 11, color: C.muted, fontStyle: 'italic' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  dateInput: {
    flex: 1, fontSize: 12, color: C.ink, backgroundColor: C.tag,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
  },
  noteBox: { backgroundColor: C.tag, borderRadius: 12, padding: 4 },
  noteInput: { minHeight: 44, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: C.ink, lineHeight: 19 },
  cerBackdrop: { flex: 1, backgroundColor: 'rgba(14,14,18,0.86)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  cerCard: { width: '100%', backgroundColor: C.white, borderRadius: 22, padding: 26, alignItems: 'center' },
  cerEmoji: { fontSize: 44 },
  cerHere: { fontSize: 12, color: C.muted, letterSpacing: 4, marginTop: 10 },
  cerName: { fontSize: 24, fontWeight: '700', color: C.ink, marginTop: 4 },
  cerDate: { fontSize: 11, color: C.mutedLight, marginTop: 4 },
  cerDivider: { width: 36, height: 2, backgroundColor: C.lava, borderRadius: 1, marginVertical: 14 },
  cerPhrase: { backgroundColor: C.tag, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', alignSelf: 'stretch' },
  cerJp: { fontSize: 16, fontWeight: '600', color: C.ink, textAlign: 'center' },
  cerZh: { fontSize: 11, color: C.muted, marginTop: 4, textAlign: 'center' },
  cerEggHint: { fontSize: 11, color: '#a07818', marginTop: 12, textAlign: 'center' },
  cerBtn: { backgroundColor: C.lava, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 34, marginTop: 16 },
  cerBtnTxt: { color: C.white, fontSize: 14, fontWeight: '700' },
  title: { fontSize: 20, fontWeight: '700', color: C.ink },
  sub: { fontSize: 12, color: C.muted, marginTop: 3, fontStyle: 'italic' },
  stats: { flexDirection: 'row', backgroundColor: C.tag, borderRadius: 12, padding: 10, alignItems: 'center', gap: 10 },
  stat: { alignItems: 'center' },
  statN: { fontSize: 18, fontWeight: '700', color: C.ink },
  statL: { fontSize: 9, color: C.muted, marginTop: 1 },
  statDiv: { width: 1, height: 20, backgroundColor: C.border },
  filterSection: { height: 59, borderBottomWidth: 1, borderBottomColor: C.border, justifyContent: 'center' },
  filterScroll: { height: 58 },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  fBtn: { height: 38, paddingHorizontal: 18, borderRadius: 19, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 10 },
  fBtnShort: { width: 72 },
  fBtnMedium: { width: 84 },
  fBtnLong: { width: 104 },
  fBtnState: { width: 106 },
  fBtnAct: { backgroundColor: C.lava, borderColor: C.lava },
  fTxt: { fontSize: 11, color: C.muted, fontWeight: '600', textAlign: 'center' },
  fTxtAct: { color: C.white },
  fDiv: { width: 1, height: 24, backgroundColor: C.border, marginRight: 10 },
  list: { padding: 14, gap: 12 },
  emptyState: { paddingTop: 36, paddingBottom: 22, paddingHorizontal: 18, alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.ink, textAlign: 'center' },
  emptySub: { fontSize: 12, color: C.muted, lineHeight: 18, marginTop: 6, textAlign: 'center' },
  card: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, overflow: 'hidden' },
  cardSel: { borderColor: C.lava },
  cardHd: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 15 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  dotBeen: { backgroundColor: '#2a8a5a' },
  dotWish: { backgroundColor: C.mutedLight },
  cardName: { fontSize: 15, fontWeight: '600', color: C.ink },
  cardLoc: { fontSize: 11, color: C.muted, marginTop: 2 },
  sTag: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  tagBeen: { backgroundColor: '#e0f4ea' },
  tagWish: { backgroundColor: C.tag },
  sTxt: { fontSize: 10, fontWeight: '700' },
  tagBeenTxt: { color: '#1a7a4a' },
  tagWishTxt: { color: C.muted },
  detail: {
  borderTopWidth: 1,
  borderTopColor: C.border,
  padding: 15,
  gap: 12,
  backgroundColor: C.paperFaint,
},
  photoWrap: { borderRadius: 12, overflow: 'hidden', position: 'relative' },
  photo: { width: '100%', height: 180, borderRadius: 12 },
  photoEdit: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  photoEditTxt: { fontSize: 11, color: C.white, fontWeight: '600' },
  photoPlaceholder: { backgroundColor: C.tag, borderRadius: 12, height: 100, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  photoPlaceholderTxt: { fontSize: 12, color: C.muted },
  phraseRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.tag, borderRadius: 11, padding: 12, gap: 10 },
  phraseJp: { fontSize: 15, fontWeight: '500', color: C.ink },
  phraseZh: { fontSize: 11, color: C.muted, marginTop: 3 },
  note: { fontSize: 13, color: C.ink, lineHeight: 20, opacity: 0.7 },
  memoryToggle: { minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  memoryToggleTxt: { fontSize: 13, fontWeight: '700', color: C.ink },
  memoryCard: { borderRadius: 14, backgroundColor: C.white, padding: 13, gap: 12 },
  memoryEyebrow: { fontSize: 10, color: C.lava, fontWeight: '700', marginBottom: 3 },
  memoryTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  memoryPhrase: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.tag, borderRadius: 12, padding: 11 },
  memoryJp: { fontSize: 15, fontWeight: '700', color: C.ink, lineHeight: 21 },
  memoryZh: { fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 17 },
  memorySection: { gap: 5 },
  memorySectionTitle: { fontSize: 10, color: C.muted, fontWeight: '700' },
  memoryBody: { fontSize: 12, color: C.ink, lineHeight: 18, opacity: 0.78 },
  memorySubtle: { fontSize: 11, color: C.muted, lineHeight: 17 },
  memoryPattern: { fontSize: 12, color: C.lava, lineHeight: 18, fontWeight: '700' },
  memorySwapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memorySwapChip: { minWidth: 76, maxWidth: '100%', borderRadius: 9, backgroundColor: C.paperFaint, paddingHorizontal: 9, paddingVertical: 7 },
  memorySwapText: { fontSize: 11, fontWeight: '700', color: C.ink },
  memorySwapZh: { fontSize: 10, color: C.muted, marginTop: 2 },
  memoryReview: { fontSize: 12, color: C.ink, lineHeight: 18, fontWeight: '600' },
  memoryAnswerBtn: {
    marginTop: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: C.border,
    borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.white,
  },
  memoryAnswerBtnTxt: { fontSize: 11, color: C.muted, fontWeight: '600' },
  memoryAnswerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memoryAnswer: { fontSize: 15, color: C.ink, fontWeight: '700', marginTop: 8, lineHeight: 22 },
  memoryTraceBox: { borderRadius: 12, backgroundColor: '#f8efe7', padding: 10, gap: 5 },
  memoryTrace: { fontSize: 12, color: C.ink, lineHeight: 18, fontWeight: '600' },
  addCard: { backgroundColor: C.white, borderRadius: 15, padding: 18, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  addTxt: { fontSize: 13, color: C.mutedLight },
  mineHead: { marginTop: 18, marginBottom: 6, paddingHorizontal: 2 },
  mineHeadTxt: { fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 0.5 },
  // 展开后是一条完整的打卡记录(照片/内容/手账),所以外层不再是横向行,
  // 由 mineTop 承担原来那一行的布局
  mineRow: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 13, padding: 12, marginBottom: 7,
  },
  mineRowOpen: { borderColor: C.lava },
  mineTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mineBody: { marginTop: 12, gap: 10 },
  minePhoto: { width: '100%', height: 160, borderRadius: 12, backgroundColor: C.tag },
  mineNameInput: {
    fontSize: 14, color: C.ink, fontWeight: '600', backgroundColor: C.tag,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  mineName: { fontSize: 13.5, color: C.ink, fontWeight: '700' },
  mineMeta: { fontSize: 11, color: C.muted, marginTop: 3 },
  mineNote: { fontSize: 11.5, color: C.mutedWarm, marginTop: 5, lineHeight: 17 },
  mineDel: { fontSize: 11.5, color: C.lava },

  addLayer: { flex: 1, justifyContent: 'flex-end' },
  addScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,18,14,0.32)' },
  addSheet: {
    backgroundColor: '#fbfaf7', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 18, paddingBottom: 30,
  },
  addHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  addTitle: { fontSize: 16, color: C.ink, fontWeight: '700' },
  addClose: { fontSize: 26, color: C.muted, lineHeight: 28 },
  addInput: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 12, fontSize: 14, color: C.ink,
  },
  addHint: { fontSize: 11.5, color: C.muted, marginTop: 10, paddingHorizontal: 2 },
  addHit: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 11, padding: 11, marginTop: 8,
  },
  addHitOn: { borderColor: C.teal, backgroundColor: C.tealLight },
  addHitName: { fontSize: 13.5, color: C.ink, fontWeight: '600' },
  addHitMeta: { fontSize: 10.5, color: C.muted, marginTop: 3 },
  addHitWarn: { fontSize: 10.5, color: C.lava, marginTop: 4, lineHeight: 15 },
  ctryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 12, marginBottom: 6,
    borderRadius: 11, backgroundColor: C.tag,
  },
  ctryRowLit: { backgroundColor: C.white, borderWidth: 1, borderColor: C.lava },
  ctryName: { fontSize: 14, color: C.muted, fontWeight: '600' },
  ctryNameLit: { color: C.ink, fontWeight: '700' },
  ctryMeta: { fontSize: 11, color: C.muted, marginTop: 3, lineHeight: 16 },
  ctryNum: { fontSize: 15, color: C.mutedLight, fontWeight: '700' },
  ctryNumLit: { color: C.lava },
  addNote: {
    marginTop: 14, backgroundColor: C.paper, borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 12, fontSize: 13, color: C.ink,
  },
  addSave: {
    marginTop: 14, backgroundColor: C.ink, borderRadius: 999,
    paddingVertical: 13, alignItems: 'center',
  },
  addSaveOff: { opacity: 0.35 },
  addSaveTxt: { fontSize: 13.5, color: C.white, fontWeight: '700' },
  globeHint: {
  backgroundColor: C.tag,
  borderRadius: 15,
  padding: 16,
  alignItems: 'center',
  borderWidth: 1.5,
  borderColor: C.border,
},
globeTxt: {
  fontSize: 13,
  color: C.ink,
  fontWeight: '600',
  textAlign: 'center',
},
globeSub: {
  fontSize: 11,
  color: C.muted,
  marginTop: 4,
  textAlign: 'center',
},
});

function OfflineContentNotice() {
  return (
    <View style={{ backgroundColor: '#fff7e8', borderBottomWidth: 1, borderBottomColor: '#f0dfb2', paddingHorizontal: 16, paddingVertical: 9 }}>
      <Text style={{ fontSize: 12, color: '#8a5a10', textAlign: 'center' }}>当前使用离线内容，联网后将自动更新。</Text>
    </View>
  );
}

// 从首页「关于」进入的单独一屏。JMdict 的署名不能只停留在启动页或一行脚注里。
function DataSourcesScreen({ onBack }) {
  return (
    <View style={ds.screen}>
      <View style={ds.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="返回" onPress={onBack} style={ds.backBtn}>
          <Text style={ds.back}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={ds.title}>数据来源</Text>
      </View>
      <ScrollView contentContainerStyle={ds.content} showsVerticalScrollIndicator={false}>
        <View style={ds.card}>
          <Text style={ds.eyebrow}>词库数据</Text>
          <Text style={ds.body}>
            词库中的部分词条数据派生自 JMdict/EDICT，版权归 Electronic Dictionary Research and Development Group 所有。
          </Text>
          <Text style={ds.body}>授权：Creative Commons Attribution-ShareAlike 4.0。</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project').catch(() => {})}>
            <Text style={ds.link}>JMdict/EDICT Dictionary Project ↗</Text>
          </TouchableOpacity>
        </View>
        <View style={ds.card}>
          <Text style={ds.eyebrow}>言的原创内容</Text>
          <Text style={ds.body}>
            深卡、词场、地点记忆卡和场景句为言的原创内容；它们并非 JMdict/EDICT 的衍生数据。
          </Text>
        </View>
        <View style={ds.card}>
          <Text style={ds.eyebrow}>声调数据</Text>
          <Text style={ds.body}>
            词条的东京式声调（アクセント型）派生自 kanjium，署名 Uros O.。
            数据经 kanjium × zh.wiktionary × UniDic 三源交叉校验后收录，三方不一致的条目未收。
          </Text>
          <Text style={ds.body}>授权：Creative Commons Attribution-ShareAlike 4.0。</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://github.com/mifunetoshiro/kanjium').catch(() => {})}>
            <Text style={ds.link}>kanjium ↗</Text>
          </TouchableOpacity>
        </View>
        <View style={ds.card}>
          <Text style={ds.eyebrow}>例句与词频</Text>
          <Text style={ds.body}>
            部分例句来自 Tatoeba（CC BY 2.0 FR）。
            词条的使用频率也由 Tatoeba 语料统计得出（文档频率，248,758 句）——
            学习顺序按它排,所以它不只是例句来源。
          </Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://tatoeba.org/').catch(() => {})}>
            <Text style={ds.link}>Tatoeba ↗</Text>
          </TouchableOpacity>
        </View>
        {/* ⚠️ 这一条是 2026-08-18 加的。例句的分词和注音是**离线**跑 Sudachi 得到的
            (构建时跑,词典 207 MB 留在开发机),进 App 的只有派生出来的读音数据。
            分发派生物同样要署名 —— 署名债这个项目已经欠过一次(kanjium 那次),
            不要再欠第二次。 */}
        <View style={ds.card}>
          <Text style={ds.eyebrow}>例句的分词与注音</Text>
          <Text style={ds.body}>
            例句按词切开、汉字上方的假名,由 <Text style={ds.strong}>Sudachi</Text>
            （SudachiPy + SudachiDict，Works Applications，Apache License 2.0）
            在构建时离线分析得出。词典本身不随 App 分发，App 里只包含由它派生的读音数据。
          </Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://github.com/WorksApplications/Sudachi').catch(() => {})}>
            <Text style={ds.link}>Sudachi ↗</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
const ds = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.paper },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn: { paddingVertical: 6, paddingRight: 14 },
  back: { fontSize: 14, color: C.teal, fontWeight: '600' },
  title: { fontSize: 18, color: C.ink, fontWeight: '700' },
  content: { padding: 18, gap: 12, paddingBottom: 36 },
  card: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16 },
  eyebrow: { fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 1, marginBottom: 9 },
  body: { fontSize: 14, color: C.ink, lineHeight: 22, marginBottom: 8 },
  link: { fontSize: 13, color: C.teal, fontWeight: '600', marginTop: 3 },
  strong: { fontWeight: '700' },
});

// ─────────────────────────────────────────────
// App Root
// ─────────────────────────────────────────────
export default function App() {
  const [splashed, setSplashed] = useState(false);
  const [welcomed, setWelcomed] = useState(false);
  const [tab, setTab] = useState('home');
  const [subTab, setSubTab] = useState('learn');
  const [sceneState, setSceneState] = useState(null);
  const [practiceScene, setPracticeScene] = useState(null);
  // 今日批次:首页那张卡算出来的那几个词。**状态放这里而不是 PieTab 里**,
  // 因为写它的是首页(HomeScreen),读它的是学习 tab —— 两边都在这一层下面。
  const [learnBatch, setLearnBatch] = useState(null);
  const [showDataSources, setShowDataSources] = useState(false);
  const [showJournal, setShowJournal] = useState(false);   // __DEV__ 手账预演
  const [user, setUser] = useState(null);
  const { content, loading, error, reload } = useContent();

  useEffect(() => { ensureUser().then(u => { if (u) setUser(u); }); }, []);
  // 开发期体检:有没有加了存储键却忘了在 storage.js 登记的。
  // 忘了登记 = 删号清不掉、登录不补传,而这两件事都要等用户投诉才会发现。
  useEffect(() => { auditKeys(); }, []);

  const isAnonymous = !user || user.is_anonymous;

  // 删除账号不可逆,给两道确认 —— 第二道明说会删掉什么
  const handleDeleteAccount = () => {
    Alert.alert(
      '删除账号',
      '会删除你的学习进度、世界足迹、打卡照片和旅行本。共享账本里同行者的账不受影响。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '继续',
          style: 'destructive',
          onPress: () => Alert.alert('确认删除?', '此操作无法撤销。', [
            { text: '取消', style: 'cancel' },
            {
              text: '删除',
              style: 'destructive',
              onPress: async () => {
                const { ok, error } = await deleteAccount();
                if (!ok) { Alert.alert('删除失败', error || '请稍后再试'); return; }
                setUser(null);
                setWelcomed(false);
                Alert.alert('已删除', '你的数据已从言里移除。');
              },
            },
          ]),
        },
      ],
    );
  };

  // 补传失败必须让用户看见并能重试。
  // Apple 登录换了 user id,匿名 uid 被丢弃 —— 这是唯一一次迁移机会,
  // 失败了只在 console 里 warn 一句,用户永远等不到第二次登录。
  const runBackfill = async ({ silent = false } = {}) => {
    const { ok, failed } = await backfillAll();
    if (ok || silent) return ok;
    Alert.alert(
      '部分数据还没同步',
      `${failed.map(d => BACKFILL_LABEL[d] || d).join('、')}没能传到新账号。` +
      '本机数据没有丢,可以现在重试,或下次打开言时自动再试一次。',
      [
        { text: '稍后', style: 'cancel' },
        { text: '重试', onPress: () => runBackfill({ silent: false }) },
      ],
    );
    return false;
  };

  const handleAppleLogin = async () => {
    const { user: u, error: e } = await signInWithApple();
    if (e) { Alert.alert('登录失败', e); return; }
    if (!u) return;                     // 用户自己取消
    setUser(u);
    setWelcomed(true);
    // Apple 登录换了 user id,之前匿名攒的云端行在新账号下是空的。
    // 本机 AsyncStorage 是这台设备的完整事实 —— 整体补传一次,新账号才算完整。
    await runBackfill();
  };

  // 上次补传没做完就接着做。静默重试:用户已经被提示过一次,
  // 每次启动再弹一遍只会让人学会忽略它。
  useEffect(() => {
    if (!user || user.is_anonymous) return;
    let alive = true;
    (async () => {
      const pending = await pendingBackfill();
      if (!alive || !pending) return;
      await runBackfill({ silent: true });
    })();
    return () => { alive = false; };
  }, [user]);

  const isDark = tab === 'pie' && (subTab === 'subway');

  if (!splashed) return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={C.ink} />
      <SplashScreen onEnter={() => setSplashed(true)} />
    </>
  );
  if (!welcomed && isAnonymous) return (
    <WelcomeScreen onAppleLogin={handleAppleLogin} onSkip={() => setWelcomed(true)} />
  );
  if (loading && !content) return <LoadingScreen />;
  if (!content) return <ErrorScreen onRetry={reload} />;

  // 手账预演:整段被 __DEV__ 包着,生产包里连组件都不会被引用到
  if (__DEV__ && showJournal) return <JournalScreen onBack={() => setShowJournal(false)} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? C.ink : C.paper }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? C.ink : C.paper} />
      {error && <OfflineContentNotice />}
      {/* ⚠️ Provider 从 PieTab 上移到这里。
          原来挂在 PieTab 上,理由是「用户从没进过学习 tab 也会白读一次盘」——
          那个前提**现在不成立了**:首页的今日任务卡要显示学习状态,
          进首页就必须读进度,不存在「白读」。
          绝不能两处都挂 —— 两个 Provider 是两份独立的进度,各写各的盘、互相覆盖。 */}
      {/* 五十音进度也挂在这一层,理由和上面那条一样:
          写它的是五十音页(pie tab),读它的是首页今日卡(home tab),
          两者同时挂载 —— 各自 useState 就是两份副本互相覆盖。 */}
      <ReviewProgressProvider>
      <KanaProgressProvider>
      {showDataSources ? (
        <DataSourcesScreen onBack={() => setShowDataSources(false)} />
      ) : tab === 'home' && (
        <HomeScreen setTab={setTab} setSubTab={setSubTab} setSceneState={setSceneState} setLearnBatch={setLearnBatch} content={content} onDataSources={() => setShowDataSources(true)} onDeleteAccount={handleDeleteAccount} />
      )}
      {tab === 'pie' && (
     <PieTab
  content={content}
  setTab={setTab}
  subTab={subTab}
  setSubTab={setSubTab}
  sceneState={sceneState}
  setSceneState={setSceneState}
  practiceScene={practiceScene}
  setPracticeScene={setPracticeScene}
  learnBatch={learnBatch}
  setLearnBatch={setLearnBatch}
/>
      )}
      {tab === 'na' && <NaTab mapPlaces={content.mapPlaces} />}
      </KanaProgressProvider>
      </ReviewProgressProvider>
      {!showDataSources && <TabBar tab={tab} setTab={(t) => { setTab(t); if (t === 'pie') setSubTab('learn'); }} />}
      {__DEV__ && !showDataSources && tab === 'na' && (
        // 开发期入口,只在「世界打卡」这个 tab 出现 —— 手账属于世界打卡那一块,
        // 不是一个跟全局并列的东西。正式做的时候要长进那一屏里,不是浮在上面。
        <Pressable
          onPress={() => setShowJournal(true)}
          style={{
            position: 'absolute', right: 12, bottom: 96, width: 44, height: 44,
            borderRadius: 22, alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(40,32,22,0.82)',
          }}
          hitSlop={8}
        >
          {/* 不要写「账」—— 单字读成账单。手账和分账是两回事,名字上不能混 */}
          <Text style={{ color: '#e6ddca', fontSize: 11, letterSpacing: 0.5 }}>手账</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}
