// 言 · 一页手账
//
// 这一页要成立,靠的不是纹理好看,是三件贴图给不了的东西:
//   1. 纸有边界   —— 底下垫着的两层(本子的厚度)、页子投在桌面上的影
//   2. 光是全局的 —— 所有元素共用一个光源,阴影方向一致
//   3. 元素有厚度 —— 贴纸浮得高、票根薄、胶带几乎贴着纸,三种阴影完全不同
//
// 为什么用 Skia 而不是 View + shadow:RN 的阴影两个平台行为不一样(iOS 的
// shadowOffset/shadowRadius 和 Android 的 elevation 根本不是一套模型),
// 而这一页的全部说服力就在阴影的方向和虚实上,不能各平台一个样。
// 顺带 Skia 也是手写笔迹唯一跑得动的路 —— 一个原生依赖买两件事。
//
// 数学在 journalRender.js(纯函数,有测试)。这里只负责画。
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import {
  Canvas, Image as SkImage, useImage, Group, Shadow, Path, Skia, Rect, rect,
  LinearGradient, vec,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { shadowFor, toPx, pickPaper, nibWidth, LIGHT } from './journalRender';
import {
  hitTest, bringToFront, applyGesture, replaceItem, toPageCoords,
} from './journalGesture';
import { PAPERS, PAPER_DEFAULTS } from './journalPapers';
import { defaultInkColor } from './journalPapersMeta';

const SHADOW_COLOR = 'rgba(38, 28, 18, 1)';

/**
 * 解码过的纸,进程内留一份。
 *
 * `useImage` 是**每次挂载都重新解码**的。三张牛皮纸都是 1400x2400 的 JPEG(约 500KB),
 * 解一次要好几百毫秒 —— 而「纸没到之前整页不画」那道门是对的,
 * 于是退出这一屏再进来,用户看到的是一整块和桌面同色的空白。
 * 2026-08-13 真机上就是这么撞见的:用户截了图问是不是坏了,一秒后它自己出来了。
 *
 * 「不画」是对的,「等一秒」不是。第二次进来不该再等 —— 纸是打进包的静态资源,
 * 解码结果永远一样,没有任何理由算第二遍。
 *
 * 缓存的是 SkImage,不是路径。持有引用同时也防止它被 GC 掉。
 */
// ⚠️ **必须有上限。** 第一版没有,于是每点一档纸就永久多占一张解码后的位图:
// 1400x2400 RGBA = 12.8MB,四档点完常驻 51MB。用户的原话是「每次加载越来越慢」——
// 那不是别的,就是这个缓存只进不出。
//
// 上限 3:同时显示的最多两张(对开的左右页),留一个余量给「切回上一张纸」。
// 超了按插入顺序丢最早的(Map 是保序的,所以 keys().next() 就是最老那个)。
const PAPER_CACHE_MAX = 3;
const paperCache = new Map();

function cachePaper(source, img) {
  if (paperCache.has(source)) paperCache.delete(source);   // 重新插到末尾 = 标记为最近用过
  paperCache.set(source, img);
  while (paperCache.size > PAPER_CACHE_MAX) {
    paperCache.delete(paperCache.keys().next().value);
  }
}

function useCachedImage(source) {
  const cached = source == null ? null : paperCache.get(source);
  // 命中就不要再让 useImage 去解码了(传 null 它立刻返回 null)。
  // hook 必须无条件调用,所以是换参数不是换分支。
  const fresh = useImage(cached ? null : source);
  if (!cached && fresh && source != null) cachePaper(source, fresh);
  return cached || fresh;
}

/** 一个元素的投影。lift=0(印、文字)不画 —— 压进纸里的东西没有影子。 */
function Lift({ lift, pageWidth, children }) {
  const s = shadowFor(lift, pageWidth);
  if (!s) return children;
  return (
    <Group>
      <Shadow
        dx={s.dx} dy={s.dy} blur={s.blur}
        color={SHADOW_COLOR.replace('1)', `${s.opacity})`)}
        shadowOnly={false}
      />
      {children}
    </Group>
  );
}

/** 一笔手写。点是 [x, y, t, w],x/y 是相对坐标。 */
function Stroke({ stroke, pageWidth, pageHeight, fallbackColor }) {
  const path = useMemo(() => {
    const p = Skia.Path.Make();
    const pts = stroke.points || [];
    if (pts.length < 2) return p;
    p.moveTo(pts[0][0] * pageWidth, pts[0][1] * pageHeight);
    for (let i = 1; i < pts.length; i++) {
      // 二次贝塞尔穿过点的中点 —— 直接 lineTo 会把手写画成折线
      const a = pts[i - 1], b = pts[i];
      const mx = ((a[0] + b[0]) / 2) * pageWidth;
      const my = ((a[1] + b[1]) / 2) * pageHeight;
      p.quadTo(a[0] * pageWidth, a[1] * pageHeight, mx, my);
    }
    return p;
  }, [stroke, pageWidth, pageHeight]);

  // 笔锋:先按整笔的平均速度给一个粗细。
  // TODO 逐点变宽要走 perfect-freehand 生成轮廓再填充,这一版先跑通。
  const width = useMemo(() => {
    const pts = stroke.points || [];
    let sum = 0, n = 0;
    for (let i = 1; i < pts.length; i++) { sum += nibWidth(pts[i - 1], pts[i], 1); n++; }
    return (n ? sum / n : 1) * (pageWidth * 0.006);
  }, [stroke, pageWidth]);

  return (
    <Path
      path={path}
      color={stroke.color || fallbackColor}
      style="stroke"
      strokeWidth={width}
      strokeCap="round"
      strokeJoin="round"
    />
  );
}

/** 一个贴上去的资产(照片/票根/抠图/贴纸)。 */
function AssetItem({ item, image, pageWidth, pageHeight, selected = false }) {
  const { x, y, scale, rotation } = toPx(item, pageWidth, pageHeight);
  if (!image) return null;
  const w = (item.w ?? 0.42) * pageWidth * scale;
  // 同 aspects 那处:失效的图片调 height() 会抛,而这是在 render 里 —— 一抛整页就白
  let h;
  try {
    h = w * (image.height() / image.width());
  } catch {
    return null;                      // 这一个元素不画,别把整页拖下水
  }
  if (!Number.isFinite(h) || h <= 0) return null;
  return (
    <Group
      transform={[{ translateX: x }, { translateY: y }, { rotate: rotation },
                  { translateX: -w / 2 }, { translateY: -h / 2 }]}
    >
      <Lift lift={item.lift} pageWidth={pageWidth}>
        <SkImage image={image} x={0} y={0} width={w} height={h} fit="cover" />
      </Lift>
      {/* 选中标记。
          必须有:捏合和旋转作用在「当前选中的那个」上,看不见选中的是谁,
          两指一捏发现动的是别的元素 —— 而这一版还没有撤销。
          做成一圈**细白线**而不是蓝色高亮框:这是一张纸,不是设计软件的画板。 */}
      {selected && (
        <Rect x={-1} y={-1} width={w + 2} height={h + 2}
              style="stroke" strokeWidth={1.5} color="rgba(255,252,244,0.9)" />
      )}
    </Group>
  );
}

/**
 * 一页。
 *
 * 元素的坐标**不限制在 0~1**:越过页边是合法的,超出那半截的影子会落在桌面上。
 * 这就是「延展到本子外面」—— 不是新功能,是不去 clamp。
 */
export default function JournalPage({ page, facing, assets = {}, spread = false, style,
                                      editable = false, onChangeItems, blockScrollRef,
                                      onReadyChange }) {
  const { width: winW } = useWindowDimensions();
  // 对开:两页并排,各占一半。
  //
  // ⚠️ 这是**翻阅**的形态,不是编辑的形态。手机上一页只剩 ~170pt 宽,
  // 贴纸和字都小到点不准 —— 编辑必须单页(spread=false),对开用来「翻本子看」。
  // 真实手账也是这个分工:摊开是看,动手时会把本子转过来只对着一页。
  const pageWidth = spread ? winW * 0.455 : winW * 0.88;
  const pageHeight = pageWidth * (2400 / 1400);
  const pad = winW * 0.06;
  const canvasW = winW;
  const canvasH = pageHeight + pad * 2;

  // 自动挑纸只在干净的那几档里挑,牛皮要用得自己选(见 journalPapers.PAPER_DEFAULTS)
  const paperKey = pickPaper(page, PAPER_DEFAULTS);
  const paper = useCachedImage(PAPERS[paperKey]);
  const inkColor = defaultInkColor(paperKey);

  // 右页用**另一张**纸。两页共用一张贴图的话,对开时左右完全对称,
  // 一眼就是复制粘贴 —— 真本子的相邻两页纤维走向从来不一样。
  const facingKey = pickPaper(facing || { id: `${page?.id || ''}-r` }, PAPER_DEFAULTS);
  const facingPaper = useCachedImage(PAPERS[facingKey]);

  const sortItems = (p) => [...(p?.items || [])].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  const items = useMemo(() => sortItems(page), [page]);
  const facingItems = useMemo(() => sortItems(facing), [facing]);

  // selectedId 在下面才声明,但 renderLeaf 是在 JSX 里(声明之后)才被调用的
  const renderLeaf = (leafPage, leafItems, img, key, live = false) => (
    <Group key={key}>
      <Lift lift={14} pageWidth={pageWidth}>
        {img && <SkImage image={img} x={0} y={0}
                         width={pageWidth} height={pageHeight} fit="cover" />}
      </Lift>
      {leafItems.map((item) => {
        if (item.kind === 'ink') {
          return (item.payload?.strokes || []).map((s, i) => (
            <Stroke key={`${item.id}-${i}`} stroke={s} fallbackColor={inkColor}
                    pageWidth={pageWidth} pageHeight={pageHeight} />
          ));
        }
        return (
          <AssetItem key={item.id} item={item} image={assets[item.assetId]}
                     pageWidth={pageWidth} pageHeight={pageHeight}
                     selected={live && item.id === selectedId} />
        );
      })}
    </Group>
  );

  const spineW = pageWidth * 0.12;

  // ── 编辑手势 ──────────────────────────────────────────────
  //
  // **只在单页上开。** 对开是「翻阅」的形态,一页只剩 ~170pt 宽,点不准
  // (这条是产品判断,不是实现限制,见 docs/travel-moments-design.md)。
  // 传了 editable 又传 spread 的话这里静默不开,而不是给一个点不准的编辑器。
  const canEdit = editable && !spread && typeof onChangeItems === 'function';

  const [selectedId, setSelectedId] = useState(null);

  // 图片的长宽比,命中判定要用。元素数据里只有 w,高度是图片自己的事。
  //
  // ⚠️ `img.height()` 是**原生调用**,图片被释放之后调它会抛 —— 而这里是在 render 里,
  // 一抛就是整棵子树卸载,屏幕上只剩一块和背景同色的空白,看不出发生过什么。
  // 拿不到长宽比不是错误(命中判定按正方形退一步就行),所以这里吞掉。
  const aspects = useMemo(() => {
    const out = {};
    for (const [id, img] of Object.entries(assets)) {
      if (!img) continue;
      try {
        const w = img.width(), h = img.height();
        if (w > 0 && h > 0) out[id] = h / w;
      } catch { /* 图片已失效,当作没有长宽比 */ }
    }
    return out;
  }, [assets]);

  // 起手时的那份快照。增量一律相对它算,不是相对上一帧 ——
  // 逐帧累加会把浮点误差攒起来,松手时元素和手指对不上(journalGesture 里有测试)。
  const baseRef = useRef(null);
  const deltaRef = useRef({ dxPx: 0, dyPx: 0, scale: 1, rotation: 0 });
  const activeRef = useRef(0);         // 三种手势同时进行,靠计数决定什么时候算结束
  // items 每帧都在变,而手势回调是闭包 —— 不用 ref 的话拿到的是起手那一刻的旧列表
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const commit = useCallback(() => {
    const base = baseRef.current;
    if (!base) return;
    const next = applyGesture(base, deltaRef.current, pageWidth, pageHeight);
    onChangeItems(replaceItem(itemsRef.current, next));
  }, [onChangeItems, pageWidth, pageHeight]);

  const beginOn = useCallback((id) => {
    activeRef.current += 1;
    if (baseRef.current) return;                    // 第二根手指落下,沿用同一份快照
    const target = itemsRef.current.find(it => it.id === id);
    if (!target) return;
    baseRef.current = target;
    deltaRef.current = { dxPx: 0, dyPx: 0, scale: 1, rotation: 0 };
  }, []);

  const endOne = useCallback(() => {
    activeRef.current = Math.max(0, activeRef.current - 1);
    if (activeRef.current === 0) baseRef.current = null;
  }, []);

  const gesture = useMemo(() => {
    if (!canEdit) return null;

    // .runOnJS(true):回调走 JS 线程,不写 worklet。
    //
    // 代价是每帧一次 setState 重渲整个 Canvas —— 一页几个元素扛得住,
    // 元素多了会掉帧。**掉帧了再上 reanimated 的 shared value**,不要提前上:
    // Skia + reanimated 的动画值要重写整条渲染链路,而那会让 journalRender
    // 那些纯函数没法直接用。先跑通,量到卡再换(硬规矩:先量再改)。
    let pan = Gesture.Pan().runOnJS(true);
    // 画布如果在 ScrollView 里,竖着拖元素会被滚动抢走 —— 表现是「只能左右拖」。
    // blocksExternalGesture 让滚动等这个手势先失败,而不是反过来。
    // (光靠 scrollEnabled={false} 有竞态:等 setState 生效时滚动可能已经接管了。)
    if (blockScrollRef) pan = pan.blocksExternalGesture(blockScrollRef);
    pan = pan
      .onBegin((e) => {
        const p = toPageCoords(e.x, e.y, { pad, pageWidth, pageHeight });
        const hit = hitTest(itemsRef.current, p, { aspects, pageWidth, pageHeight });
        // 点空白 = 取消选中。不这么做的话选中框会一直挂在最后碰过的东西上
        setSelectedId(hit?.id ?? null);
        if (!hit) return;
        // 摸到就提到最上面 —— 真实拼贴里伸手去动一张票根,它就到了最上面
        onChangeItems(bringToFront(itemsRef.current, hit.id));
        beginOn(hit.id);
      })
      .onUpdate((e) => {
        if (!baseRef.current) return;
        deltaRef.current = { ...deltaRef.current, dxPx: e.translationX, dyPx: e.translationY };
        commit();
      })
      .onFinalize(endOne);

    // 捏合和旋转作用在**已选中**的那个上。
    // 两指落下时去命中「两指中点」听起来更聪明,实际很难点准 ——
    // 而且用户的心智是「我先拿起这张,再把它转正」。
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onBegin(() => { if (selectedId) beginOn(selectedId); })
      .onUpdate((e) => {
        if (!baseRef.current) return;
        deltaRef.current = { ...deltaRef.current, scale: e.scale };
        commit();
      })
      .onFinalize(endOne);

    const rotate = Gesture.Rotation()
      .runOnJS(true)
      .onBegin(() => { if (selectedId) beginOn(selectedId); })
      .onUpdate((e) => {
        if (!baseRef.current) return;
        deltaRef.current = { ...deltaRef.current, rotation: (e.rotation * 180) / Math.PI };
        commit();
      })
      .onFinalize(endOne);

    // Simultaneous 而不是 Race:真实动作是「按住、同时转和缩」,
    // 让它们互斥的话每调整一次都要松手重来。
    return Gesture.Simultaneous(pan, pinch, rotate);
  }, [canEdit, pad, pageWidth, pageHeight, aspects, selectedId, blockScrollRef,
      onChangeItems, beginOn, endOne, commit]);

  // 纸没到位之前**整页不画**。
  //
  // useImage 是异步的,而 Skia 每帧照画不误 —— 于是用户看到的是一段丑陋的过场:
  // 先是空的,然后是垫底那块纯棕色矩形,然后纸才刷上来,最后元素一个个落下。
  // 用户的原话是「你做了个动画,先是什么都没有然后变成了乱七八糟的牛皮纸」。
  //
  // 一页纸不该有出场动画。等纸到齐,一次性画完;等的这段时间给一块和桌面同色的空白,
  // 什么都不闪。(纸是打进包的本地图片,这个等待通常只有一两帧。)
  // 元素的图也要等齐。
  //
  // 硬规矩 4 说的是「异步图片没到位之前整页不画」,但第一版的 ready 只等了**纸** ——
  // 于是纸铺好之后,票根、贴纸、照片各自解码完各自往上跳,用户看到的是
  // 「一些框框依次显示」(2026-08-13 真机反馈的原话)。
  // 那正是这条规矩要防的东西,只是当初漏了元素这一半。
  //
  // 只等**页面上真的引用到**的那些:assets 里多给几张没人用的,不该拖住整页。
  const itemsReady = useMemo(() => {
    const need = new Set([...items, ...(spread ? facingItems : [])]
      .filter(it => it.kind !== 'ink' && it.assetId)
      .map(it => it.assetId));
    // 引用了一个 assets 里根本没有的 id = 那个元素永远画不出来,不能为它无限等下去
    return [...need].every(id => !(id in assets) || !!assets[id]);
  }, [items, facingItems, spread, assets]);

  const ready = !!paper && (!spread || !!facingPaper) && itemsReady;

  // 「还没画」和「画不出来」在屏幕上长得一模一样(都是一块和桌面同色的空白)。
  // 生产环境这是对的 —— 一页纸不该有出场动画。但排查时它等于没有信息,
  // 所以把状态漏给调用方,预演屏拿它写一行诊断。生产环境不传这个 prop。
  useEffect(() => {
    onReadyChange?.({ ready, paper: !!paper, facingPaper: !!facingPaper,
                     items: itemsReady, spread, paperKey });
  }, [onReadyChange, ready, paper, facingPaper, itemsReady, spread, paperKey]);

  if (!ready) {
    return <View style={[styles.desk, { width: canvasW, height: canvasH }, style]} />;
  }

  // 手势挂在**桌面**这一层,不是纸上 —— 元素可以越过页边落到桌面,
  // 挂在纸上的话那半截拖不动,而那正是「延展到本子外面」最想让人玩的部分。
  const wrap = (canvas) => (canEdit
    ? <GestureDetector gesture={gesture}>{canvas}</GestureDetector>
    : canvas);

  return wrap(
    <View style={[styles.desk, { width: canvasW, height: canvasH }, style]}>
      <Canvas style={{ width: canvasW, height: canvasH }}>
        {/* 本子的厚度:底下垫两层,略微错开。没有这个,纸就是一块贴图 */}
        {[{ dx: 5, dy: 6, o: 0.55 }, { dx: 2.5, dy: 3, o: 0.75 }].map((u, i) => (
          <Group key={i} opacity={u.o}
                 transform={[{ translateX: pad + u.dx }, { translateY: pad + u.dy }]}>
            <Lift lift={i === 0 ? 9 : 0} pageWidth={pageWidth}>
              <Rect rect={rect(0, 0, spread ? pageWidth * 2 : pageWidth, pageHeight)}
                    color="#8a6a44" />
            </Lift>
          </Group>
        ))}

        <Group transform={[{ translateX: pad }, { translateY: pad }]}>
          {renderLeaf(page, items, paper, 'L', canEdit)}
        </Group>

        {spread && (
          <>
            <Group transform={[{ translateX: pad + pageWidth }, { translateY: pad }]}>
              {renderLeaf(facing, facingItems, facingPaper, 'R')}
            </Group>
            {/* 书脊。**没有这道内阴影,两页就读成并排的两张纸,不是一本摊开的书** ——
                纸在装订处向下弯,所以中缝最暗、往两边迅速变亮。 */}
            <Rect x={pad + pageWidth - spineW} y={pad} width={spineW * 2} height={pageHeight}>
              <LinearGradient
                start={vec(pad + pageWidth - spineW, 0)}
                end={vec(pad + pageWidth + spineW, 0)}
                colors={['rgba(40,28,14,0)', 'rgba(40,28,14,0.30)',
                         'rgba(40,28,14,0.42)', 'rgba(40,28,14,0.30)', 'rgba(40,28,14,0)']}
                positions={[0, 0.4, 0.5, 0.6, 1]}
              />
            </Rect>
          </>
        )}
      </Canvas>
    </View>,
  );
}

const styles = StyleSheet.create({
  // 桌面。纸不是浮在白底上的 —— 参考实物照片里,纸底下永远有东西
  desk: { backgroundColor: '#191510', alignItems: 'center', justifyContent: 'center' },
});
