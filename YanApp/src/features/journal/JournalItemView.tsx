/**
 * 纸上的一个元素 —— 拖、捏、转、选、层级菜单。
 *
 * 工单 2.1 的技术选型:**位置写在 shared value 上,不走 setState。**
 * 拖动时每帧 setState 会掉到 20fps。所以手势过程中只有 UI 线程在改
 * shared value,**松手那一刻才 runOnJS 提交一次**给 React。
 *
 * 元素本身是普通 RN 组件(Animated.View + transform),不用 Skia ——
 * Skia 留给第三批的笔迹。
 */
import React, { memo, useCallback } from 'react';
import { StyleSheet, View, Text, Image, Pressable } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, runOnJS,
} from 'react-native-reanimated';

import type { JournalItem } from './journalTypes.ts';
import { ORIGIN } from './journalTypes.ts';
import { ACCENT, INK, INK_SOFT, STUB_COLORS, PAPER } from './journalTheme.ts';
import {
  dragTo, pinchTo, applyDropJitter, clampToCanvas, DRAG_Z,
  type GestureStart,
} from './journalCanvas.ts';

type Fit = ReturnType<typeof import('./journalCanvas.ts').fitCanvas>;

type Props = {
  item: JournalItem;
  fit: Fit;
  selected: boolean;
  assetUri?: string | null;
  onSelect: (id: string) => void;
  onLayerMenu: (id: string) => void;
  onDelete: (id: string) => void;
  /** 手势结束时提交一次。**只在松手时调,不逐帧调。** */
  onCommit: (id: string, patch: Partial<JournalItem>) => void;
};

function JournalItemViewInner({
  item, fit, selected, assetUri, onSelect, onLayerMenu, onDelete, onCommit,
}: Props) {
  // 手势期间的实时值。初值来自 item,松手后由 onCommit 写回 item。
  const x = useSharedValue(item.x);
  const y = useSharedValue(item.y);
  const rot = useSharedValue(item.rotation);
  const scl = useSharedValue(item.scale);
  const dragging = useSharedValue(0);
  // 起手快照 —— 所有增量相对它算,不逐帧累加(见 journalCanvas.dragTo)
  const snap = useSharedValue<GestureStart>({ x: item.x, y: item.y, rotation: 0, scale: 1 });

  // item 从外部变了(撤销、层级菜单、别处提交)就同步回来
  React.useEffect(() => {
    x.value = item.x; y.value = item.y;
    rot.value = item.rotation; scl.value = item.scale;
  }, [item.x, item.y, item.rotation, item.scale, x, y, rot, scl]);

  const commit = useCallback((patch: Partial<JournalItem>) => {
    onCommit(item.id, patch);
  }, [item.id, onCommit]);

  const select = useCallback(() => onSelect(item.id), [item.id, onSelect]);
  const menu = useCallback(() => onLayerMenu(item.id), [item.id, onLayerMenu]);

  const s = fit.scale;

  const pan = Gesture.Pan()
    .onStart(() => {
      snap.value = { x: x.value, y: y.value, rotation: rot.value, scale: scl.value };
      dragging.value = 1;
      runOnJS(select)();                      // 移动中 zIndex 提到最上层(工单 2.2)
    })
    .onUpdate((e) => {
      const p = dragTo(snap.value, e.translationX, e.translationY, s);
      const c = clampToCanvas(p.x, p.y);      // 防丢,不防越界 —— 纸外是合法的
      x.value = c.x; y.value = c.y;
    })
    .onEnd(() => {
      dragging.value = 0;
      // ⚠️ 松手叠加随机抖动。看着像 bug,是这个功能的灵魂,不要省(工单 2.2)。
      const jittered = applyDropJitter(rot.value);
      rot.value = jittered;
      runOnJS(commit)({ x: x.value, y: y.value, rotation: jittered });
    });

  // 双指:旋转 + 缩放**同时**生效,不拆成两个手势(工单 2.2)
  const pinch = Gesture.Pinch()
    .onStart(() => {
      snap.value = { x: x.value, y: y.value, rotation: rot.value, scale: scl.value };
    })
    .onUpdate((e) => {
      const r = pinchTo(snap.value, e.scale, 0);
      scl.value = r.scale;
    })
    .onEnd(() => {
      const jittered = applyDropJitter(rot.value);
      rot.value = jittered;
      runOnJS(commit)({ scale: scl.value, rotation: jittered });
    });

  const rotate = Gesture.Rotation()
    .onStart(() => {
      snap.value = { x: x.value, y: y.value, rotation: rot.value, scale: scl.value };
    })
    .onUpdate((e) => {
      const r = pinchTo(snap.value, 1, e.rotation);
      rot.value = r.rotation;
    })
    .onEnd(() => {
      const jittered = applyDropJitter(rot.value);
      rot.value = jittered;
      runOnJS(commit)({ rotation: jittered, scale: scl.value });
    });

  const tap = Gesture.Tap().onEnd(() => { runOnJS(select)(); });
  const longPress = Gesture.LongPress().minDuration(420).onStart(() => { runOnJS(menu)(); });

  /**
   * ⚠️ **pan / pinch / rotate 必须三个都 Simultaneous,不能用 Exclusive。**
   *
   * 第一版写的是:
   *
   *     Gesture.Exclusive(Gesture.Simultaneous(pinch, rotate), pan, longPress, tap)
   *
   * 真机上的结果是**完全拖不动**,而松手时角度还会微微一变。原因:
   * Exclusive 的语义是「后面的要等前面的**失败**才能激活」,而 Pinch 需要两根手指 ——
   * 单指按下时它既不激活也**不失败**,一直挂在待定,把 pan 挡在门外。
   * 等手指抬起 pinch 才失败,pan 这时才拿到机会,于是 onStart 和 onEnd 连着触发、
   * translation 是 0:位置纹丝不动,但 onEnd 里的松手抖动照样叠加了一次。
   *
   * 正确的关系:
   *   · pan + pinch + rotate → **Simultaneous**。两指操作时位移和缩放本来就该同时发生
   *     (工单 2.2「不要拆成两个手势」说的就是这件事)。
   *   · tap 与 longPress   → 互斥,长按赢(长按本来就是「按住不动」,和单击天然冲突)。
   *   · 这两组之间 Simultaneous:移动会让 tap/longPress 自己因超出容差而取消,
   *     不需要我们手动排他。
   */
  const manipulate = Gesture.Simultaneous(pan, pinch, rotate);
  const taps = Gesture.Exclusive(longPress, tap);
  const gesture = Gesture.Simultaneous(manipulate, taps);

  const animStyle = useAnimatedStyle(() => {
    const w = item.w * fit.scale;
    const h = item.h * fit.scale;
    return {
      width: w,
      height: h,
      transform: [
        { translateX: fit.left + (x.value - ORIGIN.x) * fit.scale - w / 2 },
        { translateY: fit.top + (y.value - ORIGIN.y) * fit.scale - h / 2 },
        { rotate: `${rot.value}deg` },
        { scale: scl.value },
      ],
      zIndex: dragging.value ? DRAG_Z : item.zIndex,
    };
  }, [item.w, item.h, item.zIndex, fit.scale, fit.left, fit.top]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.item, animStyle]}>
        <ItemBody item={item} assetUri={assetUri} />
        {selected ? (
          <>
            <View style={styles.outline} pointerEvents="none" />
            {/* 左上角删除。
                ⚠️ 右下角**曾经**还有一个旋转把手(工单 2.2 的 ⟳ 圈),
                它带着 pointerEvents="none" —— **画着但是死的**,按了没任何反应。
                真机上第一眼就被问「那个圈还在」。

                决定是**不做**,不是「以后补」:双指已经能转能缩,
                再加一条路径只多一处状态、多一件要真机验的事,换来的只是单手也能转。
                而一个看得见、按了没反应的控件**比没有更糟** —— 它在教用户
                一件不存在的事。rotateHandleTo / angleAt 留在 journalGesture 里
                (有测试,不碍事),真需要单手旋转那天再接。 */}
            <Pressable style={[styles.knob, styles.del]} onPress={() => onDelete(item.id)}
                       hitSlop={10}>
              <Text style={styles.delTxt}>×</Text>
            </Pressable>
          </>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

/** 按 type 画内容。第二批只要求能看出是什么、能被拖 —— 精修在第三批。 */
function ItemBody({ item, assetUri }: { item: JournalItem; assetUri?: string | null }) {
  const p = item.payload as any;
  switch (item.type) {
    case 'photo':
      return (
        <View style={[styles.photo, p?.frame === 'polaroid' && styles.polaroid]}>
          {assetUri
            ? <Image source={{ uri: assetUri }} style={styles.fill} resizeMode="cover" />
            : <View style={[styles.fill, styles.missing]}><Text style={styles.missTxt}>缺图</Text></View>}
          {p?.caption ? <Text style={styles.cap} numberOfLines={1}>{p.caption}</Text> : null}
        </View>
      );
    case 'scan':
    case 'cutout':
      return assetUri
        ? <Image source={{ uri: assetUri }} style={styles.fill} resizeMode="contain" />
        : <View style={[styles.fill, styles.missing]}><Text style={styles.missTxt}>缺图</Text></View>;
    case 'stub':
      return (
        <View style={[styles.stub, { borderLeftColor: STUB_COLORS[p?.kind] || ACCENT }]}>
          <Text style={styles.stubT1} numberOfLines={1}>{p?.name || '打卡'}</Text>
          <Text style={styles.stubT2}>{String(p?.kind || '').toUpperCase()} {p?.serial ?? ''}</Text>
        </View>
      );
    case 'wordSlip':
      return (
        <View style={styles.slip}>
          <Text style={styles.slipW} numberOfLines={1}>{p?.word}</Text>
          <Text style={styles.slipR} numberOfLines={1}>{p?.reading}</Text>
          {p?.note ? <Text style={styles.slipN} numberOfLines={2}>{p.note}</Text> : null}
        </View>
      );
    case 'stamp':
      return (
        <View style={[styles.stamp, { borderColor: p?.color || '#aa3a26' }]}>
          <Text style={[styles.stampS, { color: p?.color || '#aa3a26' }]}>{p?.top}</Text>
          <Text style={[styles.stampB, { color: p?.color || '#aa3a26' }]}>{p?.center}</Text>
          <Text style={[styles.stampS, { color: p?.color || '#aa3a26' }]}>{p?.bottom}</Text>
        </View>
      );
    case 'text':
      return (
        <Text style={[styles.hand, { fontSize: (p?.size || 38) * 0.4, color: p?.color || '#4c4335' }]}>
          {p?.content}
        </Text>
      );
    case 'tape':
      return <View style={[styles.tape, TAPE[p?.pattern as keyof typeof TAPE] || TAPE.a]} />;
    case 'sticker':
      return assetUri
        ? <Image source={{ uri: assetUri }} style={styles.fill} resizeMode="contain" />
        : <View style={[styles.fill, styles.sticker]} />;
    default:
      return <View style={styles.fill} />;
  }
}

const TAPE = {
  a: { backgroundColor: '#e6c9a6' },
  b: { backgroundColor: '#c2d3c4' },
  c: { backgroundColor: '#d98f7d' },
};

const styles = StyleSheet.create({
  item: { position: 'absolute', left: 0, top: 0 },
  fill: { width: '100%', height: '100%' },

  outline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5, borderColor: 'rgba(180,84,47,0.85)',
    borderStyle: 'dashed', margin: -4,
  },
  knob: {
    position: 'absolute', width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  del: { left: -13, top: -13, backgroundColor: '#2b2723' },
  delTxt: { color: '#e8ddd0', fontSize: 15, lineHeight: 17 },
  // handle / handleTxt 跟着那个死掉的旋转把手一起删了(见上面那段注释)

  photo: { flex: 1, backgroundColor: '#fdfbf5', padding: 5 },
  polaroid: { paddingBottom: 20 },
  cap: { fontSize: 10, color: '#6a5f52', textAlign: 'center', paddingTop: 3 },
  missing: { backgroundColor: '#e6dcc9', alignItems: 'center', justifyContent: 'center' },
  missTxt: { color: '#9b8b74', fontSize: 11 },

  stub: {
    flex: 1, backgroundColor: '#faf4e6', borderLeftWidth: 3,
    paddingHorizontal: 9, justifyContent: 'center',
  },
  stubT1: { fontSize: 12, color: INK, fontWeight: '600' },
  stubT2: { fontSize: 9, color: INK_SOFT, letterSpacing: 1.2, marginTop: 2 },

  slip: {
    flex: 1, backgroundColor: '#fffdf6', paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(150,120,80,0.22)',
  },
  slipW: { fontSize: 17, color: INK },
  slipR: { fontSize: 9, color: INK_SOFT, marginTop: 1 },
  slipN: {
    fontSize: 11, color: '#8a6a3e', marginTop: 4, paddingTop: 4,
    borderTopWidth: 1, borderTopColor: 'rgba(150,120,80,0.4)',
  },

  stamp: {
    flex: 1, borderWidth: 2.5, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  stampS: { fontSize: 8, letterSpacing: 1.4 },
  stampB: { fontSize: 15, marginVertical: 1 },

  hand: { lineHeight: 22 },
  tape: { flex: 1, opacity: 0.72 },
  sticker: { backgroundColor: PAPER.edge, borderRadius: 6 },
});

/** item 的几何值走 shared value,所以只有这几个 prop 变了才需要重渲染。 */
export const JournalItemView = memo(JournalItemViewInner, (a, b) =>
  a.item === b.item && a.fit === b.fit
  && a.selected === b.selected && a.assetUri === b.assetUri);

export default JournalItemView;
