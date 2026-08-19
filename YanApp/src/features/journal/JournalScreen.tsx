/**
 * 手账屏 —— 第二批。**整体替换 JournalDevScreen,不修补它**(工单红线 2)。
 *
 * 这一屏只负责:装配画布、管一页的状态、提供往纸上放东西的入口。
 * 手势数学在 journalCanvas.ts,元素渲染在 JournalItemView.tsx ——
 * 这里不该出现任何角度或坐标的计算。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet, View, Text, Pressable, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';

import type { JournalItem, JournalPage, ItemType } from './journalTypes.ts';
import { PAGE, wrapAngle } from './journalTypes.ts';
import { ACCENT, JITTER, randomAngle, materialOf, DEFAULT_PAPER } from './journalTheme.ts';
import { bringToFront, sendToBack, maxZ, restackIfNeeded } from './journalCanvas.ts';
import JournalCanvasView from './JournalCanvasView.tsx';
import { K, readJsonResult, writeJson } from '../../lib/storage';
import { importAsset, assetUri, readAssets } from '../../lib/journalStore';

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const emptyPage = (): JournalPage => ({
  id: newId(), bookId: null, cityId: null,
  dateISO: new Date().toISOString().slice(0, 10),
  items: [], strokes: [], paper: DEFAULT_PAPER,
  createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null,
});

/**
 * 新元素落在哪。
 *
 * 黄金角绕圈 + 按元素宽度定间距 —— 用户连报三次「只能上传一张」都是因为
 * 第二张严丝合缝盖在第一张上面。**一个看不见结果的操作等于没做。**
 * 这不是替用户排版(位置照样随便拖),只保证「你放的东西看得见」。
 */
function dropSpot(n: number, w: number) {
  const a = n * 2.39996;                                  // 黄金角
  const r = Math.min(w * 0.72, w * 0.52 * Math.sqrt(n));
  return { x: PAGE.w / 2 + r * Math.cos(a), y: PAGE.h * 0.46 + r * Math.sin(a) };
}

export default function JournalScreen({ onBack }: { onBack?: () => void }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const [page, setPage] = useState<JournalPage | null>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // ── 读盘。⚠️ 读失败**不能**当成空页:那会让下一次写入把已有的一页覆盖掉。
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await readJsonResult(K.journalPagesV2);
      const a = await readAssets();
      if (!alive) return;
      setAssets(a?.ok ? a.assets : []);
      if (!r.ok) { setNote('读不到本地手账 —— 这次不新建,免得覆盖已有的一页'); return; }

      // ⚠️ 这里原本是 `setPage(stored ?? emptyPage())` —— 只要 pages[0] 取不到
      // 就新建一页,而 save() 是 `writeJson(K, { pages: [stamped] })`,
      // **一次覆盖整个数组**。于是「键里有东西但不是我们认得的形状」这一种情况,
      // 会安静地把用户已有的那一页顶掉。真机上就发生了:一页 7 个元素(含照片)
      // 变成一页 2 个,日期也换了 —— 那是新建的空页。
      //
      // 三态要分开,不能压成两态:
      //   读失败        → 上面已经挡了
      //   键里真的是空的 → 首次使用,该新建
      //   键里有东西但形状不对 → **绝不新建**,宁可这一屏不可用
      //
      // 「读不到当成空的」是这个项目丢过四次数据的形状,这是第五处。
      const raw = r.value as any;
      const pages = raw?.pages;
      if (raw != null && !(Array.isArray(pages) && pages.length > 0)) {
        setNote('本地手账数据读出来不是预期的形状 —— 这次不新建,免得覆盖掉已有的');
        return;
      }
      setPage(pages?.[0] ?? emptyPage());
    })();
    return () => { alive = false; };
  }, []);

  /**
   * 落盘。**每一处改动都要过它** —— 散着写 writeJson 的结果是
   * updatedAt 只在其中几条路径上更新,云端同步会拿旧时间戳判「本地没变」。
   */
  const save = useCallback((next: JournalPage): JournalPage => {
    const stamped = { ...next, updatedAt: Date.now() };
    writeJson(K.journalPagesV2, { pages: [stamped] });
    return stamped;
  }, []);

  // ── 往纸上放东西
  const addItem = useCallback((type: ItemType, payload: any, w: number, h: number) => {
    setPage(prev => {
      const base = prev ?? emptyPage();
      const spot = dropSpot(base.items.length, w);
      const def = materialOf(type);
      const item: JournalItem = {
        id: newId(), type,
        x: spot.x, y: spot.y, w, h,
        // 新贴上去的元素**不能是正的** —— 全给 0 就是一堵整齐的墙
        rotation: wrapAngle(randomAngle(JITTER)),
        scale: 1,
        zIndex: maxZ(base.items) + (base.items.length ? 1 : 0),
        material: def.material, lift: def.lift,
        payload, createdAt: Date.now(),
      };
      return save({ ...base, items: restackIfNeeded([...base.items, item]) as JournalItem[] });
    });
  }, [save]);

  const addPhoto = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setNote('没有相册权限'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 1, exif: false });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    const { asset, error } = await importAsset(a.uri, {
      kind: 'photo', entry: 'upload', width: a.width, height: a.height,
    });
    if (!asset) { setNote(error || '导入失败'); return; }
    setAssets(prev => [...prev, asset]);
    const w = PAGE.w * 0.42;
    addItem('photo', {
      assetId: asset.id, srcW: asset.width, srcH: asset.height, frame: 'none',
    }, w, w * (asset.height / asset.width || 0.75));
    setNote(`已放上 · ${asset.width}×${asset.height}`);
  }, [addItem]);

  const addSlip = useCallback(() => {
    const w = PAGE.w * 0.36;
    addItem('wordSlip', {
      wordId: 'n5_en', word: '注文', reading: 'ちゅうもん',
      note: '今天第一次自己说出口',
    }, w, w * 0.62);
  }, [addItem]);

  const addStamp = useCallback(() => {
    const w = PAGE.w * 0.16;
    addItem('stamp', { top: 'KYOTO', center: '言', bottom: '2026', color: '#aa3a26' }, w, w);
  }, [addItem]);

  const addTape = useCallback(() => {
    const w = PAGE.w * 0.2;
    addItem('tape', { pattern: 'a' }, w, w * 0.13);
  }, [addItem]);

  // ── 元素操作
  const commit = useCallback((id: string, patch: Partial<JournalItem>) => {
    setPage(prev => {
      if (!prev) return prev;
      return save({ ...prev, items: prev.items.map(i => (i.id === id ? { ...i, ...patch } : i)) });
    });
  }, [save]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (!id) return;
    // 移动中 zIndex 提到最上层(工单 2.2)
    setPage(prev => {
      if (!prev) return prev;
      const items = bringToFront(prev.items, id);
      if (items === prev.items) return prev;      // 已经在最上面就不重渲染
      return save({ ...prev, items: items as JournalItem[] });
    });
  }, [save]);

  const layer = useCallback((id: string, to: 'front' | 'back') => {
    setMenuFor(null);
    setPage(prev => {
      if (!prev) return prev;
      const items = (to === 'front' ? bringToFront(prev.items, id) : sendToBack(prev.items, id));
      return save({ ...prev, items: items as JournalItem[] });
    });
  }, [save]);

  const del = useCallback((id: string) => {
    setSelectedId(null);
    setPage(prev => {
      if (!prev) return prev;
      return save({ ...prev, items: prev.items.filter(i => i.id !== id) });
    });
  }, [save]);

  // itemId → 文件 uri。缺的留 undefined,元素会显示「缺图」而不是空白。
  const assetUris = useMemo(() => {
    const byId = new Map(assets.map(a => [a.id, a]));
    const out: Record<string, string | null | undefined> = {};
    for (const it of page?.items ?? []) {
      const aid = (it.payload as any)?.assetId;
      const a = aid ? byId.get(aid) : null;
      out[it.id] = a ? assetUri(a) : undefined;
    }
    return out;
  }, [assets, page?.items]);

  const canvasH = Math.max(240, winH - 210);

  if (!page) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={ACCENT} />
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
    );
  }

  /**
   * 真正丢了文件的照片有几张。
   *
   * ⚠️ 原本是 `Object.values(assetUris).filter(u => u === undefined).length` ——
   * 那会把**印章、胶带、词纸条全算成缺图**:只有 photo 元素才有 `assetId`,
   * 其余三种 `assetUris[id]` 天然是 undefined。
   * 真机上一页 1 张照片 + 2 印章 + 1 纸条 + 3 胶带,底下就写着「缺图 6」,
   * 而一张都没丢。**一个会说谎的诊断比没有诊断更糟** —— 它会让下一个人
   * 去追一个不存在的 bug,或者反过来,真丢图的那天没人信这个数。
   *
   * 判据改成「它是张照片(有 assetId),但文件找不着」。
   */
  // 不用 useMemo:这行在提前 return 之后,包成 hook 就成了条件调用。
  // assetUris 本身已经 memo 过,这里只是数一遍元素。
  const missing = (page?.items ?? []).filter(
    it => (it.payload as any)?.assetId && !assetUris[it.id],
  ).length;

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={onBack} hitSlop={12}><Text style={styles.back}>‹ 返回</Text></Pressable>
        <Text style={styles.title}>手账</Text>
        <Text style={styles.dim}>{page.items.length} 个</Text>
      </View>

      <JournalCanvasView
        page={page}
        width={winW}
        height={canvasH}
        selectedId={selectedId}
        assetUris={assetUris}
        onSelect={select}
        onLayerMenu={setMenuFor}
        onDelete={del}
        onCommit={commit}
      />

      <Text style={styles.note} numberOfLines={2}>
        {note || '拖一拖 · 双指转和缩 · 长按调层级 · 松手会自己歪一点'}
        {missing ? ` · 缺图 ${missing}` : ''}
      </Text>

      <View style={styles.tools}>
        {[['上传照片', addPhoto], ['词纸条', addSlip], ['盖章', addStamp], ['胶带', addTape]]
          .map(([label, fn]) => (
            <Pressable key={label as string} style={styles.tool} onPress={fn as () => void}>
              <Text style={styles.toolTxt}>{label as string}</Text>
            </Pressable>
          ))}
      </View>

      {menuFor ? (
        <Pressable style={styles.sheetWrap} onPress={() => setMenuFor(null)}>
          <View style={styles.sheet}>
            <Pressable style={styles.sheetRow} onPress={() => layer(menuFor, 'front')}>
              <Text style={styles.sheetTxt}>置顶</Text>
            </Pressable>
            <Pressable style={styles.sheetRow} onPress={() => layer(menuFor, 'back')}>
              <Text style={styles.sheetTxt}>置底</Text>
            </Pressable>
          </View>
        </Pressable>
      ) : null}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1714' },
  center: { alignItems: 'center', justifyContent: 'center' },
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 54, paddingBottom: 10,
  },
  back: { color: '#a2988a', fontSize: 15 },
  title: { color: '#e8e0d2', fontSize: 15, letterSpacing: 2 },
  dim: { color: '#6f665b', fontSize: 12 },
  note: { color: '#8a7f72', fontSize: 11.5, textAlign: 'center', paddingHorizontal: 20, paddingTop: 8 },
  tools: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 28,
  },
  tool: {
    backgroundColor: '#211d19', borderWidth: 1, borderColor: '#37312a',
    borderRadius: 9, paddingHorizontal: 14, paddingVertical: 9,
  },
  toolTxt: { color: '#a2988a', fontSize: 12 },
  sheetWrap: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  },
  sheet: { backgroundColor: '#241f1a', borderRadius: 14, minWidth: 200, overflow: 'hidden' },
  sheetRow: { paddingVertical: 15, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#3a332b' },
  sheetTxt: { color: '#e8ddd0', fontSize: 15 },
});
