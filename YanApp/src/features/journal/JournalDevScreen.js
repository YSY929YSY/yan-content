// 手账真机预演(仅 __DEV__)
//
// 存在的理由:这一页的对错只能靠肉眼——阴影方向、纸的亮度、元素默认大小,
// 在 Mac 上调好的值到 OLED 屏上多半是偏的。要有个地方能立刻看见。
//
// 它不进生产:App.js 里的入口被 __DEV__ 包着。
//
// 主照片可以「从相册选一张」。这不只是为了好看 —— 纸样图当占位时,
// 照片和纸是同一种材质同一个色系,层次感被白送了一半,看不出阴影对不对。
// 顺带它跑通了三条素材进入路径里的**上传**那条(设计文档第三节):
// 相册 → 复制进素材库 → 建 journal_assets 记录 → 贴到页上,整条链路真的走一遍。
// 其余元素(票根/贴纸/胶带)仍用纸样图顶着,那几个验的是厚度不是内容。
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, SafeAreaView, Alert, ActivityIndicator,
} from 'react-native';
import { useImage } from '@shopify/react-native-skia';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';

import JournalPage from './JournalPage';
import { PAPERS } from './journalPapers';
import { ensureJournalFont, journalFontFamily } from '../../lib/journalFont';
import { importAsset, readAssets, assetUri } from '../../lib/journalStore';

/** 一条手写:点是 [x, y, t, w],x/y 相对页面。写得快的地方 t 间隔小 → 线变细。 */
const scribble = (() => {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const p = i / 40;
    pts.push([
      0.16 + p * 0.55,
      0.72 + Math.sin(p * Math.PI * 3) * 0.018,
      i * (i < 20 ? 28 : 12),        // 后半程写得快 —— 用来验笔锋是不是真的在变
      1,
    ]);
  }
  return pts;
})();

const DEMO_PAGE = {
  id: 'demo-page-1',
  bg: 'kraft-bag',
  items: [
    // 主锚:一张大照片。参考实物里每页都有一个占 40% 以上的主元素。
    // 单独一个 assetId,好让「从相册选一张」只换它,不把票根贴纸一起换掉
    { id: 'i1', kind: 'photo', assetId: 'p1', material: 'photo', lift: 5,
      x: 0.42, y: 0.26, w: 0.62, scale: 1, rotation: -1.8, z: 1 },
    // 越过页边的票根:一半在纸上,一半落到桌面 —— 「延展到本子外面」
    { id: 'i2', kind: 'scan', assetId: 'a1', material: 'scan', lift: 3,
      x: 0.96, y: 0.52, w: 0.34, scale: 1, rotation: 5, z: 2 },
    // 贴纸:浮得最高,影子最远最散
    { id: 'i3', kind: 'sticker', assetId: 'a1', material: 'sticker', lift: 9,
      x: 0.22, y: 0.55, w: 0.2, scale: 1, rotation: -6, z: 3 },
    // 胶带:几乎贴着纸,接触阴影最实
    { id: 'i4', kind: 'tape', assetId: 'a1', material: 'tape', lift: 1,
      x: 0.62, y: 0.1, w: 0.18, scale: 1, rotation: -22, z: 4 },
    { id: 'i5', kind: 'ink', material: 'ink', lift: 0, x: 0.5, y: 0.5, z: 5,
      payload: { strokes: [{ points: scribble, tool: 'pen' }] } },
  ],
};

// 右页:同一份演示元素换个位置,用来看对开时左右会不会读成复制粘贴
const FACING_PAGE = {
  id: 'demo-page-2',
  bg: 'kraft-light',
  items: [
    { id: 'j1', kind: 'scan', assetId: 'a1', material: 'scan', lift: 3,
      x: 0.5, y: 0.22, w: 0.66, scale: 1, rotation: 1.4, z: 1 },
    { id: 'j2', kind: 'sticker', assetId: 'a1', material: 'sticker', lift: 9,
      x: 0.72, y: 0.62, w: 0.26, scale: 1, rotation: 7, z: 2 },
    { id: 'j3', kind: 'ink', material: 'ink', lift: 0, x: 0.5, y: 0.5, z: 3,
      payload: { strokes: [{ points: scribble.map(([x, y, t, w]) => [x * 0.9, y + 0.08, t, w]),
                             tool: 'pen' }] } },
  ],
};

export default function JournalDevScreen({ onBack }) {
  // 票根/贴纸/胶带的占位图:纸样顶着。这几个验的是厚度和阴影,不是内容。
  const stand = useImage(PAPERS['kraft-light']);

  // 主照片。没选过就回退到占位图 —— 空着不画的话就看不出主锚的层次了。
  const [photoUri, setPhotoUri] = useState(null);
  const [picking, setPicking] = useState(false);
  const [assetNote, setAssetNote] = useState('');
  const photo = useImage(photoUri);

  // 冷启动时把上次选的那张捞回来。
  // 这一步才是「跑通」的证据:重开这一屏图还在,说明文件和元数据是真落了盘,
  // 不是只在内存里显示了一下。
  useEffect(() => {
    let alive = true;
    readAssets().then((list) => {
      const last = [...list].reverse().find(a => a.localUri && !a.deletedAt);
      if (!alive || !last) return;
      // 走 assetUri 而不是直接用 last.localUri —— 存下来的绝对路径里的容器 UUID 会过期
      setPhotoUri(assetUri(last));
      setAssetNote(`素材库 ${list.length} 条 · 复用上次(${last.entry}/${last.kind})`);
    }).catch(() => { /* 读不到就用占位图,这一屏不该被素材库挡住 */ });
    return () => { alive = false; };
  }, []);

  const pick = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('无法访问照片', '在系统设置里允许“言”访问照片后再试。', [{ text: '知道了' }]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;   // 取消不是错误,什么都不说

    const a = result.assets[0];
    setPicking(true);
    const { asset, error } = await importAsset(a.uri, {
      kind: 'photo', entry: 'upload', width: a.width, height: a.height,
    });
    setPicking(false);
    if (error) {
      // 入库失败**不上屏** —— 显示一张进不了素材库的图,下次冷启动它就消失了,
      // 那比一开始就说失败更让人困惑。
      setAssetNote(`入库失败:${error}`);
      return;
    }
    setPhotoUri(assetUri(asset));
    setAssetNote(`已入库 ${asset.id.slice(0, 8)} · ${asset.entry}/${asset.kind}`
      + (asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ''));
  }, []);

  // 页在 state 里,拖拽改的是它。
  //
  // 这一屏没有存盘 —— 退出就回到 DEMO_PAGE 的初始摆位。**这是故意的**:
  // 预演屏要能一次次从同一个已知状态开始看,存了盘反而每次打开都不一样,
  // 调阴影和默认大小时就没有基准了。真正的手账页要存,那是 journalStore 的事。
  const [page, setPage] = useState(DEMO_PAGE);
  // 对开是**翻阅**的形态,单页才编辑得动(一页 ~170pt 宽点不准)。
  // 两种都要能看:阴影和书脊要在对开下验,手势要在单页下验。
  const [spread, setSpread] = useState(true);
  // 交给 JournalPage,让拖元素的手势能挡住这一层的滚动
  const scrollRef = useRef(null);

  const onChangeItems = useCallback((items) => {
    setPage(p => ({ ...p, items }));
  }, []);

  // ⚠️ 必须记忆化。这个对象直接进 JournalPage 的 `assets`,而那边的 aspects
  // 和整套手势对象都挂在它的**引用**上 —— 每帧新建一个字面量的话,
  // 拖动时每一帧都在重建三个 Gesture 对象,而拖动恰好是每帧都在 setState 的那条路径。
  const assets = useMemo(() => ({ a1: stand, p1: photo || stand }), [stand, photo]);

  // 「还没画」和「画不出来」在屏幕上都是一块空白。预演屏必须能分清这两件事,
  // 否则看到白屏只能猜。这一行就是干这个的。
  const [pageDiag, setPageDiag] = useState(null);
  const onReadyChange = useCallback((d) => setPageDiag(d), []);

  // 字体按需下载。**失败什么都不做** —— 回退系统字,这一屏照常能看。
  const [fontState, setFontState] = useState('loading');
  useEffect(() => {
    let alive = true;
    ensureJournalFont().then(({ ok, error }) => {
      if (alive) setFontState(ok ? 'ok' : `失败:${error}`);
    });
    return () => { alive = false; };
  }, []);
  const fam = journalFontFamily();

  return (
    // GestureHandlerRootView 包在这一屏自己的根上,不去动 App.js 的根节点。
    //
    // 手势必须有这一层才收得到事件(Android 上是硬要求)。全项目现在只有手账用手势,
    // 包在这儿的好处是**出问题的范围就这一屏** —— App.js 是个 5900 行的单文件,
    // 在它根上套一层新容器,受影响的是所有屏(RULE.md:不动 App.js 能搞定的事不动它)。
    // 手账正式长进「世界打卡」那一屏时,这一层要跟着挪过去。
    <GestureHandlerRootView style={styles.root}>
    {/* ⚠️ 必须包 SafeAreaView。第一版直接用 View,返回那一行压在状态栏底下 ——
        看得见但点不着,用户被困在这一屏里。这种 bug 模拟器上很容易漏,
        因为刘海屏的安全区在不同设备上不一样。 */}
    <SafeAreaView style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={onBack} hitSlop={16} style={styles.backHit}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.title}>手账 · 预演</Text>
        <Text style={styles.hint}>DEV</Text>
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
        <JournalPage page={page} facing={FACING_PAGE} spread={spread}
                     assets={assets}
                     editable onChangeItems={onChangeItems} blockScrollRef={scrollRef}
                     onReadyChange={onReadyChange} />

        <View style={styles.row}>
          <Pressable onPress={pick} disabled={picking} style={styles.btn} hitSlop={8}>
            {picking
              ? <ActivityIndicator size="small" color="#e6ddca" />
              : <Text style={styles.btnText}>
                  {photoUri ? '换一张主照片' : '从相册选一张'}
                </Text>}
          </Pressable>
          <Pressable onPress={() => setSpread(s => !s)} style={styles.btn} hitSlop={8}>
            <Text style={styles.btnText}>{spread ? '单页(可编辑)' : '对开(翻阅)'}</Text>
          </Pressable>
        </View>
        <Text style={styles.fontState}>
          {spread
            ? '对开只看不动 —— 一页 ~170pt 宽点不准。切到单页拖拽/旋转/缩放'
            : '按住拖动 · 两指缩放和旋转 · 点空白取消选中 · 拖出纸外是合法的'}
        </Text>
        <Pressable onPress={() => setPage(DEMO_PAGE)} hitSlop={12}>
          <Text style={styles.reset}>复位摆放</Text>
        </Pressable>
        {!!assetNote && <Text style={styles.fontState}>{assetNote}</Text>}
        {/* 页面空白时,这一行说清楚是「纸还没到」还是「纸没加载出来」 */}
        {pageDiag && !pageDiag.ready && (
          <Text style={[styles.fontState, styles.diag]}>
            页面空白:纸({pageDiag.paperKey}){pageDiag.paper ? '已到' : '未到'}
            {pageDiag.spread ? ` · 右页纸${pageDiag.facingPaper ? '已到' : '未到'}` : ''}
            {' · 一两秒还不消失就是加载失败,不是过场'}
          </Text>
        )}
        {pageDiag?.ready && photoUri && !photo && (
          <Text style={[styles.fontState, styles.diag]}>
            主照片解码失败,已回退占位图 —— 文件可能不在了:{String(photoUri).slice(-42)}
          </Text>
        )}

        {/* 字体验收:三种文字一起上,一眼看出覆盖有没有洞(方块=缺字) */}
        <Text style={[styles.sample, fam && { fontFamily: fam }]}>
          第一次自己办入住。{'\n'}
          チェックインをお願いします。{'\n'}
          ¿Dónde está la estación?
        </Text>
        <Text style={styles.fontState}>
          字体 {fontState === 'ok' ? '已加载 · 霞鹜文楷' :
                 fontState === 'loading' ? '下载中(24MB,首次)…' : fontState}
        </Text>
      </ScrollView>
    </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#191510' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
         paddingHorizontal: 16, paddingVertical: 12 },
  backHit: { paddingVertical: 6, paddingRight: 16 },
  back: { color: '#e6ddca', fontSize: 16 },
  title: { color: '#e6ddca', fontSize: 15, letterSpacing: 2 },
  hint: { color: '#6f6553', fontSize: 11, letterSpacing: 1 },
  scroll: { alignItems: 'center', paddingBottom: 40 },
  row: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btn: { paddingHorizontal: 18, minHeight: 40, justifyContent: 'center',
         borderWidth: StyleSheet.hairlineWidth, borderColor: '#6f6553', borderRadius: 3 },
  btnText: { color: '#e6ddca', fontSize: 14, letterSpacing: 1 },
  reset: { color: '#6f6553', fontSize: 12, paddingTop: 10, textDecorationLine: 'underline' },
  diag: { color: '#c08a5a', textAlign: 'center' },
  sample: { color: '#e6ddca', fontSize: 20, lineHeight: 34, paddingHorizontal: 24, paddingTop: 22 },
  fontState: { color: '#6f6553', fontSize: 11, paddingHorizontal: 24, paddingTop: 8 },
});
