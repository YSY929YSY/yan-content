// 手账(仅 __DEV__ 的预演入口)
//
// ## 这一版按产品定案重做过
//
// docs/travel-moments-design.md 第四节的定案是:
//
//   > 手账本一开始是**完全空白的**。言只提供纸和一抽屉工具,
//   > 一个字、一张贴纸都不预先放。
//
// 三条不可动摇的原则:①空白优先 ②一切皆可自选、皆非默认 ③能单独拿出手。
//
// **上一版违反了①和②**:一页预置好的照片 + 三个方框占位 —— 那正是文档里
// 「v2 拼贴但预置元素(否:框定了位置)」被否掉的那一版,我把它又做了一遍。
// 用户的判断是「还是难看」「只能上传一张图片」,根因不是纸,
// 是**这一页本来就不该由我摆**。
//
// 施工顺序第 3 步写的是「空白画布 + 工具抽屉(先支持:上传整图、拖拽/旋转/缩放/层叠)」,
// 这一版做的就是它。提取(抠图)和扫描是第 4 步,抽屉里占位但没实现。
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, SafeAreaView, Alert, ActivityIndicator,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';

import JournalPage from './JournalPage';
import { PAPER_KEYS, PAPERS_META } from './journalPapers';
import { useAssetImages } from './useAssetImages';
import { newItem } from './journalModel';
import { ensureJournalFont, journalFontFamily } from '../../lib/journalFont';
import { importAsset, readAssets, assetUri } from '../../lib/journalStore';

/**
 * 工具抽屉。
 *
 * 顺序照文档:提取 · 扫描 · 上传 · 贴纸 · 胶带 · 印 · 笔 · 色。
 * **没做的也列出来**,而且点了要说清「还没做」—— 藏起来的话下一个人
 * (包括我)会以为这就是全部,然后照着一个残缺的形状继续加东西。
 */
const TOOLS = [
  { id: 'upload', label: '上传', hint: '整张图直接放,不抠不裁', ready: true },
  { id: 'extract', label: '提取', hint: '抠掉背景留主体 —— 端上 VisionKit,施工顺序第 4 步' },
  { id: 'scan', label: '扫描', hint: '拍实体纸片:裁边/去反光/拉正 —— 第 4 步。和提取的区别是「留原物」' },
  { id: 'sticker', label: '贴纸', hint: '第 5 步' },
  { id: 'tape', label: '胶带', hint: '第 5 步' },
  { id: 'seal', label: '印', hint: '第 5 步' },
  { id: 'pen', label: '笔', hint: '第 6 步:先手写体,再颜色,最后真笔迹' },
  { id: 'color', label: '色', hint: '第 6 步' },
];

/** 一页空白。**不预置任何元素** —— 这是原则①,不是省事。 */
const blankPage = (bg) => ({ id: 'dev-page-1', bg, items: [] });

export default function JournalDevScreen({ onBack }) {
  const [paper, setPaper] = useState('plain-cream');
  const [page, setPage] = useState(() => blankPage('plain-cream'));
  const [spread, setSpread] = useState(false);   // 编辑是单页,默认就给能动的那个
  const [drawer, setDrawer] = useState(false);
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState('');
  const scrollRef = useRef(null);

  // 素材库里所有能用的素材。页面上的元素按 assetId 引用它们。
  const [library, setLibrary] = useState([]);
  const { images, loading: imagesLoading } = useAssetImages(library, assetUri);

  useEffect(() => {
    let alive = true;
    readAssets().then(({ ok, assets }) => {
      if (alive && ok) setLibrary(assets.filter(a => a.localUri && !a.deletedAt));
    }).catch(() => { /* 读不到就空着,这一屏不该被素材库挡住 */ });
    return () => { alive = false; };
  }, []);

  const livePage = useMemo(() => ({ ...page, bg: paper }), [page, paper]);
  const facingPage = useMemo(() => ({ id: 'dev-page-2', bg: 'grid-ivory', items: [] }), []);

  const onChangeItems = useCallback((items) => setPage(p => ({ ...p, items })), []);

  const addUpload = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('无法访问照片', '在系统设置里允许“言”访问照片后再试。', [{ text: '知道了' }]);
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (r.canceled || !r.assets?.[0]?.uri) return;          // 取消不是错误,什么都不说

    const a = r.assets[0];
    setPicking(true);
    const { asset, error } = await importAsset(a.uri, {
      kind: 'photo', entry: 'upload', width: a.width, height: a.height,
    });
    setPicking(false);
    if (error) { setNote(`入库失败:${error}`); return; }

    setLibrary(prev => [...prev, asset]);
    // 放在页面正中、占 42% 宽,然后由用户拖。**不替他排版** —— 原则②。
    setPage(p => ({
      ...p,
      items: [...p.items, newItem('photo', asset.id, {
        z: (p.items.reduce((m, it) => Math.max(m, it.z ?? 0), 0) || 0) + 1,
      })],
    }));
    setNote(`已入库 ${asset.id.slice(0, 8)} · ${asset.width}×${asset.height}`);
    setDrawer(false);
  }, []);

  const onTool = useCallback((t) => {
    if (t.id === 'upload') return addUpload();
    setNote(`「${t.label}」${t.hint}`);
  }, [addUpload]);

  const removeLast = useCallback(() => {
    setPage(p => ({ ...p, items: p.items.slice(0, -1) }));
  }, []);

  // 字体按需下载。失败什么都不做 —— 回退系统字,这一屏照常能看。
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
    // GestureHandlerRootView 包在这一屏自己的根上,不动 App.js 的根节点
    // (App.js 是 6000 行单文件,在它根上套新容器影响的是所有屏)。
    // 手账正式长进「世界打卡」那一屏时,这一层要跟着挪过去。
    <GestureHandlerRootView style={styles.root}>
    <SafeAreaView style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={onBack} hitSlop={16} style={styles.backHit}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.title}>手账</Text>
        <Text style={styles.hint}>DEV</Text>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
        <JournalPage
          page={livePage} facing={facingPage} spread={spread}
          assets={images} editable onChangeItems={onChangeItems}
          blockScrollRef={scrollRef}
        />

        {/* 页面是空的时候说一句。**不在纸上写字** —— 纸必须是空的(原则①),
            提示只能待在纸外面。 */}
        {!page.items.length && (
          <Text style={styles.empty}>
            空白页。{spread ? '切到单页' : '点下面的工具'}往上放东西。
          </Text>
        )}

        <View style={styles.row}>
          <Pressable onPress={() => setDrawer(v => !v)} style={[styles.btn, drawer && styles.btnOn]} hitSlop={8}>
            <Text style={[styles.btnText, drawer && styles.btnTextOn]}>
              {drawer ? '收起工具' : '工具'}
            </Text>
          </Pressable>
          <Pressable onPress={() => setSpread(s => !s)} style={styles.btn} hitSlop={8}>
            <Text style={styles.btnText}>{spread ? '单页(可编辑)' : '对开(翻阅)'}</Text>
          </Pressable>
          {!!page.items.length && (
            <Pressable onPress={removeLast} style={styles.btn} hitSlop={8}>
              <Text style={styles.btnText}>撤掉最后一个</Text>
            </Pressable>
          )}
        </View>

        {/* 工具抽屉:**不占页面**,收在下面,点开才出来(文档 4.2)。 */}
        {drawer && (
          <View style={styles.drawer}>
            {TOOLS.map(t => (
              <Pressable key={t.id} onPress={() => onTool(t)} hitSlop={6}
                         style={[styles.tool, !t.ready && styles.toolTodo]}>
                {picking && t.id === 'upload'
                  ? <ActivityIndicator size="small" color="#e6ddca" />
                  : <Text style={[styles.toolTxt, !t.ready && styles.toolTxtTodo]}>{t.label}</Text>}
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.paperRow}>
          {PAPER_KEYS.map(k => (
            <Pressable key={k} onPress={() => setPaper(k)} hitSlop={6}
                       style={[styles.paperChip, paper === k && styles.paperChipOn]}>
              <Text style={[styles.paperTxt, paper === k && styles.paperTxtOn]}>
                {PAPERS_META[k]?.label || k}
              </Text>
            </Pressable>
          ))}
        </View>

        {!!note && <Text style={styles.note}>{note}</Text>}
        {imagesLoading && <Text style={styles.note}>素材解码中…</Text>}
        <Text style={styles.note}>
          素材库 {library.length} 条 · 页上 {page.items.length} 个元素
          {page.items.length ? ' · 按住拖动,两指缩放旋转,拖出纸外是合法的' : ''}
        </Text>

        {/* 字体验收:三种文字一起上,一眼看出覆盖有没有洞(方块=缺字) */}
        <Text style={[styles.sample, fam && { fontFamily: fam }]}>
          第一次自己办入住。{'\n'}チェックインをお願いします。{'\n'}¿Dónde está la estación?
        </Text>
        <Text style={styles.note}>
          字体 {fontState === 'ok' ? '已加载 · 霞鹜文楷'
            : fontState === 'loading' ? '下载中(24MB,首次)…' : fontState}
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
  empty: { color: '#6f6553', fontSize: 12, marginTop: 12 },
  row: { flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' },
  btn: { paddingHorizontal: 16, minHeight: 40, justifyContent: 'center',
         borderWidth: StyleSheet.hairlineWidth, borderColor: '#6f6553', borderRadius: 3 },
  btnOn: { borderColor: '#c9b98f', backgroundColor: 'rgba(201,185,143,0.12)' },
  btnText: { color: '#e6ddca', fontSize: 14, letterSpacing: 1 },
  btnTextOn: { color: '#f0e6d2' },
  drawer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
            gap: 8, marginTop: 12, paddingHorizontal: 20 },
  tool: { minWidth: 62, paddingVertical: 10, alignItems: 'center', borderRadius: 3,
          borderWidth: StyleSheet.hairlineWidth, borderColor: '#8a7f68' },
  // 没做的画得更淡,但**不隐藏** —— 藏起来会让人以为这就是全部
  toolTodo: { borderColor: '#3d372c' },
  toolTxt: { color: '#e6ddca', fontSize: 14 },
  toolTxtTodo: { color: '#6f6553' },
  paperRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
              gap: 7, marginTop: 16, paddingHorizontal: 20 },
  paperChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 3,
               borderWidth: StyleSheet.hairlineWidth, borderColor: '#4a4234' },
  paperChipOn: { borderColor: '#c9b98f', backgroundColor: 'rgba(201,185,143,0.12)' },
  paperTxt: { color: '#8a7f68', fontSize: 12 },
  paperTxtOn: { color: '#e6ddca' },
  note: { color: '#6f6553', fontSize: 11, paddingHorizontal: 24, paddingTop: 8, textAlign: 'center' },
  sample: { color: '#e6ddca', fontSize: 18, lineHeight: 32, paddingHorizontal: 24, paddingTop: 22 },
});
