/**
 * 手账页的画布 —— 纸、层级、溢出。
 *
 * 工单 2.3 的渲染层次(从下到上):
 *   1  纸底色      2  网格      3  装订孔      4  日期角标
 *   10 items      300 胶带     600 笔迹      900 纸纹
 *
 * ⚠️ **纸不是裁剪边界。** 裁剪发生在画布(stage)那一层,纸只是画布上的
 * 一个视觉参考层。元素压在纸边上、一半露在纸外 —— 这是手账和「卡片列表」
 * 最直观的分界(工单 1.2 / 2.4)。
 */
import React, { useMemo } from 'react';
import { StyleSheet, View, Text, Image, Pressable } from 'react-native';

import type { JournalItem, JournalPage } from './journalTypes.ts';
import { PAPER, LAYER, INK_SOFT } from './journalTheme.ts';
import { fitCanvas, inPaintOrder } from './journalCanvas.ts';
import { PAPERS } from './journalPapers';
import { JournalItemView } from './JournalItemView.tsx';

type Props = {
  page: JournalPage;
  width: number;
  height: number;
  selectedId: string | null;
  /** itemId → 本地文件 uri。缺的传 undefined,元素会显示「缺图」而不是空白。 */
  assetUris: Record<string, string | null | undefined>;
  onSelect: (id: string | null) => void;
  onLayerMenu: (id: string) => void;
  onDelete: (id: string) => void;
  onCommit: (id: string, patch: Partial<JournalItem>) => void;
};

export default function JournalCanvasView({
  page, width, height, selectedId, assetUris,
  onSelect, onLayerMenu, onDelete, onCommit,
}: Props) {
  // fit 要稳定引用 —— JournalItemView 的 memo 拿它做相等判断
  const fit = useMemo(() => fitCanvas(width, height), [width, height]);
  const ordered = useMemo(() => inPaintOrder(page.items), [page.items]);

  const paperSrc = PAPERS[page.paper as keyof typeof PAPERS] ?? PAPERS['plain-cream'];

  const paperBox = {
    left: fit.left + fit.paperLeft,
    top: fit.top + fit.paperTop,
    width: fit.paperWidth,
    height: fit.paperHeight,
  };

  return (
    // stage:裁在这里。元素跑出纸没事,跑出画布才看不见。
    <View style={[styles.stage, { width, height }]}>
      {/* 点空白取消选中(工单 2.2)。放在最底下,元素会挡住它。 */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => onSelect(null)} />

      {/* 1 纸底色 —— 真实纸纹贴图,不是纯色块 */}
      <View style={[styles.paper, paperBox, { zIndex: LAYER.paper }]} pointerEvents="none">
        <Image source={paperSrc} style={styles.fill} resizeMode="cover" />
        {/* 内阴影:RN 没有 inset box-shadow,用四条向内的渐变边代替。
            纸纹和内阴影不是可选的(工单 1.6)—— 少了这层就是「App 界面」不是「纸」。 */}
        <View style={[styles.inner, { borderColor: PAPER.innerShadow.color }]} />
      </View>

      {/* 3 装订孔 —— 纸的一部分,不可拖 */}
      <View style={[styles.rings, {
        left: paperBox.left + paperBox.width * 0.022,
        top: paperBox.top, height: paperBox.height, zIndex: LAYER.rings,
      }]} pointerEvents="none">
        {[0, 1, 2, 3, 4, 5].map(i => <View key={i} style={styles.ring} />)}
      </View>

      {/* 4 日期角标 */}
      {page.dateISO ? (
        <View style={[styles.datemark, {
          right: width - (paperBox.left + paperBox.width) + paperBox.width * 0.05,
          top: paperBox.top + paperBox.height * 0.025, zIndex: LAYER.datemark,
        }]} pointerEvents="none">
          <Text style={styles.dateBig}>{page.dateISO.slice(5).replace('-', ' / ')}</Text>
        </View>
      ) : null}

      {/* 10+ items。zIndex 由每个元素自己带,拖动中临时提到 700。 */}
      {ordered.map(item => (
        <JournalItemView
          key={item.id}
          item={item}
          fit={fit}
          selected={selectedId === item.id}
          assetUri={assetUris[item.id]}
          onSelect={onSelect}
          onLayerMenu={onLayerMenu}
          onDelete={onDelete}
          onCommit={onCommit}
        />
      ))}

      {/* 900 纸纹 —— 盖住全页(含溢出),不吃事件 */}
      <View style={[styles.grain, paperBox, { zIndex: LAYER.grain }]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  // ⚠️ overflow:'hidden' 裁的是**画布**不是纸。纸只占画布中间那块。
  stage: { overflow: 'hidden', backgroundColor: 'transparent' },
  fill: { width: '100%', height: '100%' },
  paper: {
    position: 'absolute', borderRadius: 3, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 }, elevation: 8,
  },
  inner: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 14, borderRadius: 3, opacity: 0.55,
  },
  rings: { position: 'absolute', justifyContent: 'space-evenly', paddingVertical: 24 },
  ring: {
    width: 11, height: 11, borderRadius: 6, backgroundColor: '#5a5347',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.4)',
  },
  datemark: { position: 'absolute', alignItems: 'flex-end' },
  dateBig: { fontSize: 15, color: '#7a6a54', letterSpacing: 2, fontVariant: ['tabular-nums'] },
  grain: {
    position: 'absolute', borderRadius: 3,
    backgroundColor: '#8b7450', opacity: PAPER.grainOpacity * 0.12,
  },
  hint: { color: INK_SOFT },
});
