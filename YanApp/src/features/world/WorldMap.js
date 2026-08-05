// 言 · 世界地图(陆地轮廓 + 足迹点 + 旅迹弧线)
//
// 为什么不画国界:
//   地图数据里国界不是「线」,是多边形的边 —— 按国家分别着色时,填色的交界处
//   就成了国界,而那条线的位置在台湾、藏南、南海、克什米尔、克里米亚等地
//   都是政治表态,任何一份数据都会在某处得罪某一方。
//   言画的是点和线,不需要给国家上色,所以把陆地合成一整块,边界自然消失。
//   「点亮了几个国家」照样能数 —— Nominatim 返回的地名里就带 country,
//   不需要边界多边形来判断。
//
// 为什么用 110m 而不是 50m:
//   50m 的 SVG 路径大 11 倍(857KB vs 75KB),而在手机屏幕上肉眼看不出差别 ——
//   多出来的细节是峡湾和小岛的锯齿,那个尺寸下反而显脏。
//
// 平面和地球仪共用这一套代码,区别只是投影函数(geoNaturalEarth1 / geoOrthographic)。
import React, { useMemo, useRef, useState } from 'react';
import { Dimensions, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { geoNaturalEarth1, geoOrthographic, geoPath, geoGraticule10, geoDistance } from 'd3-geo';
import { feature } from 'topojson-client';
import landTopo from '../../../assets/geo/land-110m.json';
import { C } from '../../theme';
import { buildJourney } from '../../lib/journey';

const LAND = feature(landTopo, landTopo.objects.land);

// 双指间距。PanResponder 不直接给捏合手势,自己从 touches 里算。
function pinchDistance(e) {
  const t = e?.nativeEvent?.touches;
  if (!t || t.length < 2) return 0;
  return Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
}

export default function WorldMap({
  points = [],          // [{ id, name, lat, lng, been, visitedOn }]
  showJourney = true,
  onSelect,
}) {
  const [globe, setGlobe] = useState(false);
  // 地球仪:经度(左右转)、纬度(上下转)、缩放
  const [rot, setRot] = useState({ lam: 0, phi: -22 });
  const [zoom, setZoom] = useState(1);
  // 平面图:平移 + 缩放
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // PanResponder 只在首次渲染时创建一次,它的闭包会永远抓住那一刻的 state。
  // 所以手势里要读的当前值必须走 ref,否则拖第二次就会从初始位置重新开始。
  const rotRef = useRef(rot); rotRef.current = rot;
  const panRef = useRef(pan); panRef.current = pan;
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const globeRef = useRef(globe); globeRef.current = globe;

  // 手势:用 RN 自带的 PanResponder,不引新依赖。
  // 单指拖 = 转地球 / 平移地图;双指捏 = 缩放。
  // 拖动中降精度。每一帧都要重算投影 + 全部陆地路径 + 经纬网 + 航线,
  // 满精度跑不满 60 帧。松手后立刻恢复,静止时看到的仍然是完整画质。
  const [dragging, setDragging] = useState(false);
  const gestureStart = useRef(null);
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderGrant: (e) => {
        setDragging(true);
        gestureStart.current = {
          rot: rotRef.current, pan: panRef.current, zoom: zoomRef.current,
          // Grant 只在第一根手指落下时触发,那一刻拿不到双指间距(必然是 0)。
          // 真正的基准要等第二根手指出现时在 Move 里补,见下面。
          pinch: pinchDistance(e), globe: globeRef.current,
          baseDx: 0, baseDy: 0,
        };
      },
      onPanResponderMove: (e, g) => {
        const st = gestureStart.current;
        if (!st) return;
        const d = pinchDistance(e);

        if (d) {
          if (!st.pinch) {
            // 第二根手指刚落下。以此刻为基准重新起算 ——
            // 少了这一步,st.pinch 会一直是 Grant 时的 0,缩放分支永远进不去。
            st.pinch = d;
            st.zoom = zoomRef.current;
            return;
          }
          // 双指:缩放。范围留窄一点 —— 110m 数据放太大会看到锯齿。
          setZoom(Math.min(Math.max(st.zoom * (d / st.pinch), 1), 4));
          return;
        }

        if (st.pinch) {
          // 从双指回到单指。g.dx 是从手势最初那一刻累计的,直接拿来平移会跳一大段,
          // 所以这里把位移基准也一并重置。
          st.pinch = 0;
          st.rot = rotRef.current;
          st.pan = panRef.current;
          st.zoom = zoomRef.current;
          st.baseDx = g.dx;
          st.baseDy = g.dy;
        }

        const dx = g.dx - st.baseDx;
        const dy = g.dy - st.baseDy;
        if (st.globe) {
          // 拖动转地球。0.35 是手感系数:1:1 会转得太快,像打滑。
          setRot({
            lam: st.rot.lam + dx * 0.35 / st.zoom,
            phi: Math.max(Math.min(st.rot.phi - dy * 0.35 / st.zoom, 85), -85),
          });
        } else {
          setPan({ x: st.pan.x + dx, y: st.pan.y + dy });
        }
      },
      onPanResponderRelease: () => { gestureStart.current = null; setDragging(false); },
      onPanResponderTerminate: () => { gestureStart.current = null; setDragging(false); },
    }),
  ).current;

  const W = Dimensions.get('window').width - 28;
  const H = globe ? W : W * 0.52;

  const geo = useMemo(() => {
    let proj;
    if (globe) {
      proj = geoOrthographic()
        .rotate([rot.lam, rot.phi])
        .fitExtent([[8, 8], [W - 8, H - 8]], { type: 'Sphere' });
      proj.scale(proj.scale() * zoom);
      proj.translate([W / 2, H / 2]);
    } else {
      proj = geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], LAND);
      proj.scale(proj.scale() * zoom);
      const [tx, ty] = proj.translate();
      proj.translate([tx + pan.x, ty + pan.y]);
    }
    // 限制路径里的小数位。这条是量出来的,不是猜的:
    //   默认      40,463 字符
    //   digits(1) 29,128 字符  -28%
    //   digits(0) 19,584 字符  -52%
    // 陆地路径每一帧都要作为 d 属性整个传给原生 SVG,字符数就是过桥的开销。
    // 地图宽约 340pt,1 位小数已经是亚像素精度,肉眼无差;拖动中再降到整数。
    //
    // (试过 proj.precision() 放宽自适应重采样,量下来字符数**一个都没少** ——
    //  110m 数据本身已经够粗,插值点很少。那条路是死的,别再走。)
    const path = geoPath(proj).digits(dragging ? 0 : 1);
    return { proj, path };
  }, [globe, rot, zoom, pan, W, H, dragging]);

  // 必须 memo:原来是每次渲染新建数组,导致下面 journey 的 useMemo 永远不命中 ——
  // buildJourney(算全部航段和里程)在每一帧拖动里都重跑了一遍。
  const valid = useMemo(
    () => points.filter(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng)),
    [points],
  );
  const been = useMemo(() => valid.filter(p => p.been), [valid]);
  const journey = useMemo(
    () => (showJourney ? buildJourney(been) : { legs: [] }),
    [been, showJourney],
  );

  // 地球仪:背面的点不画,否则会出现「点浮在地球外面」。
  // rotate() 提到循环外 —— 原来每个点都调一次,几十个点就是几十次无谓调用。
  const [rotLam, rotPhi] = geo.proj.rotate();
  const onFront = (p) => (
    !globe || geoDistance([p.lng, p.lat], [-rotLam, -rotPhi]) < Math.PI / 2
  );

  return (
    <View>
      <View style={s.bar}>
        <Text style={s.count}>
          点亮 {been.length} 处{journey.totalKm > 0 ? ` · ${Math.round(journey.totalKm)} km` : ''}
        </Text>
        <View style={s.modes}>
          <TouchableOpacity onPress={() => setGlobe(false)} hitSlop={8}>
            <Text style={[s.mode, !globe && s.modeOn]}>平面</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setGlobe(true)} hitSlop={8}>
            <Text style={[s.mode, globe && s.modeOn]}>地球</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View {...responder.panHandlers}>
      <Svg width={W} height={H}>
        {globe && (
          <>
            <Path d={geo.path({ type: 'Sphere' })} fill="#eff1f0" stroke={C.border} strokeWidth={1} />
            {/* 经纬网线很多,拖动时最贵而且最不重要 —— 转起来根本看不清 */}
            {!dragging && (
              <Path d={geo.path(geoGraticule10())} fill="none" stroke={C.border} strokeWidth={0.4} />
            )}
          </>
        )}
        <Path d={geo.path(LAND)} fill="#e7e3da" stroke="#d5d0c5" strokeWidth={0.4} />

        {!dragging && journey.legs.map((leg, i) => {
          if (leg.mode.key === 'local') return null;   // 同城不画线,那是一个点不是一段路
          const d = geo.path({
            type: 'LineString',
            coordinates: [[leg.from.lng, leg.from.lat], [leg.to.lng, leg.to.lat]],
          });
          if (!d) return null;
          return (
            <Path key={`leg-${i}`} d={d} fill="none" stroke={C.teal}
              strokeWidth={1.3 * Math.sqrt(zoom)} strokeDasharray="4,3" opacity={0.8} />
          );
        })}

        {valid.map((p) => {
          if (!onFront(p)) return null;
          const c = geo.proj([p.lng, p.lat]);
          if (!c) return null;
          // 点随缩放略微变大 —— 放大本来就是为了看清,点还是原尺寸就白放了。
          // 但不按缩放等比放大(那样会变成大色块),开方增长更耐看。
          const k = Math.sqrt(zoom);
          return p.been ? (
            <React.Fragment key={p.id}>
              <Circle cx={c[0]} cy={c[1]} r={6 * k} fill={C.teal} opacity={0.14} />
              <Circle cx={c[0]} cy={c[1]} r={3.2 * k} fill={C.teal}
                onPress={() => onSelect?.(p)} />
            </React.Fragment>
          ) : (
            <Circle key={p.id} cx={c[0]} cy={c[1]} r={2.8 * k} fill="#fbfaf7"
              stroke="#b0a99b" strokeWidth={1.1} onPress={() => onSelect?.(p)} />
          );
        })}
      </Svg>
      </View>

      {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
        <View style={s.spinRow}>
          <TouchableOpacity
            onPress={() => { setZoom(1); setPan({ x: 0, y: 0 }); setRot({ lam: 0, phi: -22 }); }}
            style={s.spinBtn}
          >
            <Text style={s.spinTxt}>回到整体</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  count: { fontSize: 11.5, color: C.muted },
  modes: { flexDirection: 'row', gap: 14 },
  mode: { fontSize: 11.5, color: C.mutedLight },
  modeOn: { color: C.teal, fontWeight: '700' },
  spinRow: { flexDirection: 'row', justifyContent: 'center', gap: 26, marginTop: 8 },
  spinBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  spinTxt: { fontSize: 12, color: C.muted },
});
