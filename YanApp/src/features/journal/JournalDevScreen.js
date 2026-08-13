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
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, SafeAreaView, Alert, ActivityIndicator,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';

import JournalPage from './JournalPage';
import { PAPER_KEYS, PAPERS_META } from './journalPapers';
import { useAssetImages } from './useAssetImages';
import { newItem, dropSpot } from './journalModel';
import { ensureJournalFont } from '../../lib/journalFont';
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
  // 画布区量出来的高。**页面按它缩**,而不是自己撑到多高算多高 ——
  // 上一版就是后者,结果页面顶满整屏、工具栏被挤到屏幕外(见 JournalPage 里那段)。
  const [canvasBox, setCanvasBox] = useState(0);

  // 素材库里所有能用的素材。页面上的元素按 assetId 引用它们。
  const [library, setLibrary] = useState([]);
  const { images, loading: decoding, failed } = useAssetImages(library, assetUri);

  // 页面上引用了、但还没解出图的元素。
  //
  // ⚠️ 这一行是必须的。用户报了两次「只能上传一张」,我猜了两次都没中 ——
  // 因为「没加进去」「加了但没解码」「解码了但没画」在屏幕上**长得一模一样**:
  // 都是「看不见第二张」。没有这一行,只能靠猜。
  const pending = useMemo(
    () => page.items.filter(it => it.assetId && !images[it.assetId]).map(it => it.assetId),
    [page.items, images],
  );

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
    // 每张错开落点。**不替他排版**(原则②),只保证「放上去的东西看得见」——
    // 都落正中的话第二张会严丝合缝盖住第一张,用户会以为只能传一张。
    setPage(p => ({
      ...p,
      items: [...p.items, newItem('photo', asset.id, {
        ...dropSpot(p.items.length),
        z: p.items.reduce((m, it) => Math.max(m, it.z ?? 0), 0) + 1,
      })],
    }));
    setNote(`已放上 · ${asset.width}×${asset.height} · 按住能拖`);
    setDrawer(false);
  }, []);

  const onTool = useCallback((t) => {
    if (t.id === 'upload') return addUpload();
    setNote(`「${t.label}」${t.hint}`);
  }, [addUpload]);

  const removeLast = useCallback(() => {
    setPage(p => ({ ...p, items: p.items.slice(0, -1) }));
  }, []);

  // 字体按需下载:**为了「笔」那条路径提前备好**,这一屏本身不显示日语。
  // 失败什么都不做 —— 回退系统字,手账照常能用(字体是锦上添花,不是前提)。
  useEffect(() => { ensureJournalFont(); }, []);

  return (
    // GestureHandlerRootView 包在这一屏自己的根上,不动 App.js 的根节点。
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

      {/* 画布区:flex:1 占满剩下的,**不放在 ScrollView 里**。
          放进滚动容器有两个后果,上一版都撞上了:
            ① 页面高度不受限 → 撑到屏幕外,工具栏够不着
            ② 拖元素和滚动抢同一个手势 —— 得靠 blocksExternalGesture 打补丁
          画布编辑器的画布本来就该是固定的那一块。 */}
      <View style={styles.canvas} onLayout={e => setCanvasBox(e.nativeEvent.layout.height)}>
        {canvasBox > 0 && (
          <JournalPage
            page={livePage} facing={facingPage} spread={spread}
            assets={images} editable onChangeItems={onChangeItems}
            maxHeight={canvasBox}
          />
        )}
      </View>

      {/* 工具栏:**常驻底部**,不随内容滚走。 */}
      <View style={styles.dock}>
        {!page.items.length && (
          <Text style={styles.empty}>
            空白页。{spread ? '切到单页再放东西' : '点「工具」往上放东西'}
          </Text>
        )}
        {!!note && <Text style={styles.note} numberOfLines={2}>{note}</Text>}
        {/* 真相行:页上几个元素、解出几张图、哪些还缺。看不见第二张时,
            这一行直接说明卡在哪一环 —— 加没加进去 / 解没解出来 / 画没画出来。 */}
        <Text style={styles.note}>
          页上 {page.items.length} 个 · 素材库 {library.length} · 已解码 {Object.keys(images).length}
          {decoding ? ' · 解码中' : ''}
          {pending.length ? ` · 缺图 ${pending.length}` : ''}
          {failed.length ? ` · 解码失败 ${failed.length}` : ''}
        </Text>

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

        {drawer && (
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
        )}

        <View style={styles.row}>
          <Pressable onPress={() => setDrawer(v => !v)}
                     style={[styles.btn, drawer && styles.btnOn]} hitSlop={8}>
            <Text style={[styles.btnText, drawer && styles.btnTextOn]}>
              {drawer ? '收起' : '工具'}
            </Text>
          </Pressable>
          <Pressable onPress={() => setSpread(v => !v)} style={styles.btn} hitSlop={8}>
            <Text style={styles.btnText}>{spread ? '单页' : '对开'}</Text>
          </Pressable>
          <Pressable onPress={removeLast} disabled={!page.items.length}
                     style={[styles.btn, !page.items.length && styles.btnOff]} hitSlop={8}>
            <Text style={[styles.btnText, !page.items.length && styles.btnTextOff]}>撤掉</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#191510' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
         paddingHorizontal: 16, paddingVertical: 10 },
  backHit: { paddingVertical: 6, paddingRight: 16 },
  back: { color: '#e6ddca', fontSize: 16 },
  title: { color: '#e6ddca', fontSize: 15, letterSpacing: 2 },
  hint: { color: '#6f6553', fontSize: 11, letterSpacing: 1 },
  // 画布吃掉剩下的全部高度,页面按这个框缩
  canvas: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // 工具栏常驻底部。paddingBottom 留一点,免得贴着 home indicator
  dock: { paddingBottom: 6, paddingTop: 8, gap: 8,
          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2e2820' },
  empty: { color: '#6f6553', fontSize: 12, textAlign: 'center' },
  note: { color: '#8a7f68', fontSize: 11, paddingHorizontal: 20, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  btn: { paddingHorizontal: 22, minHeight: 42, justifyContent: 'center',
         borderWidth: StyleSheet.hairlineWidth, borderColor: '#6f6553', borderRadius: 3 },
  btnOn: { borderColor: '#c9b98f', backgroundColor: 'rgba(201,185,143,0.12)' },
  btnOff: { borderColor: '#332e26' },
  btnText: { color: '#e6ddca', fontSize: 14, letterSpacing: 1 },
  btnTextOn: { color: '#f0e6d2' },
  btnTextOff: { color: '#4a4234' },
  drawer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
            gap: 8, paddingHorizontal: 16 },
  tool: { minWidth: 60, paddingVertical: 9, alignItems: 'center', borderRadius: 3,
          borderWidth: StyleSheet.hairlineWidth, borderColor: '#8a7f68' },
  // 没做的画得更淡,但**不隐藏** —— 藏起来会让人以为这就是全部
  toolTodo: { borderColor: '#3d372c' },
  toolTxt: { color: '#e6ddca', fontSize: 14 },
  toolTxtTodo: { color: '#6f6553' },
  paperRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
              gap: 7, paddingHorizontal: 16 },
  paperChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 3,
               borderWidth: StyleSheet.hairlineWidth, borderColor: '#4a4234' },
  paperChipOn: { borderColor: '#c9b98f', backgroundColor: 'rgba(201,185,143,0.12)' },
  paperTxt: { color: '#8a7f68', fontSize: 12 },
  paperTxtOn: { color: '#e6ddca' },
});
