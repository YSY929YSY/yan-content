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
import React, { useMemo, useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { geoNaturalEarth1, geoOrthographic, geoPath, geoGraticule10, geoDistance } from 'd3-geo';
import { feature } from 'topojson-client';
import landTopo from '../../../assets/geo/land-110m.json';
import { C } from '../../theme';
import { buildJourney } from '../../lib/journey';

const LAND = feature(landTopo, landTopo.objects.land);

export default function WorldMap({
  points = [],          // [{ id, name, lat, lng, been, visitedOn }]
  showJourney = true,
  onSelect,
}) {
  const [globe, setGlobe] = useState(false);
  const [spin, setSpin] = useState(0);     // 地球仪的经度旋转

  const W = Dimensions.get('window').width - 28;
  const H = globe ? W : W * 0.52;

  const geo = useMemo(() => {
    const proj = globe
      ? geoOrthographic().rotate([spin, -22]).fitExtent([[8, 8], [W - 8, H - 8]], { type: 'Sphere' })
      : geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], LAND);
    const path = geoPath(proj);
    return { proj, path };
  }, [globe, spin, W, H]);

  const valid = points.filter(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng));
  const journey = useMemo(
    () => (showJourney ? buildJourney(valid.filter(p => p.been)) : { legs: [] }),
    [valid, showJourney],
  );

  // 地球仪:背面的点不画,否则会出现「点浮在地球外面」
  const onFront = (p) => {
    if (!globe) return true;
    const [lam, phi] = geo.proj.rotate();
    return geoDistance([p.lng, p.lat], [-lam, -phi]) < Math.PI / 2;
  };

  const been = valid.filter(p => p.been);

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

      <Svg width={W} height={H}>
        {globe && (
          <>
            <Path d={geo.path({ type: 'Sphere' })} fill="#eff1f0" stroke={C.border} strokeWidth={1} />
            <Path d={geo.path(geoGraticule10())} fill="none" stroke={C.border} strokeWidth={0.4} />
          </>
        )}
        <Path d={geo.path(LAND)} fill="#e7e3da" stroke="#d5d0c5" strokeWidth={0.4} />

        {journey.legs.map((leg, i) => {
          if (leg.mode.key === 'local') return null;   // 同城不画线,那是一个点不是一段路
          const d = geo.path({
            type: 'LineString',
            coordinates: [[leg.from.lng, leg.from.lat], [leg.to.lng, leg.to.lat]],
          });
          if (!d) return null;
          return (
            <Path key={`leg-${i}`} d={d} fill="none" stroke={C.teal}
              strokeWidth={1.1} strokeDasharray="3,2.5" opacity={0.7} />
          );
        })}

        {valid.map((p) => {
          if (!onFront(p)) return null;
          const c = geo.proj([p.lng, p.lat]);
          if (!c) return null;
          return p.been ? (
            <React.Fragment key={p.id}>
              <Circle cx={c[0]} cy={c[1]} r={4.4} fill={C.teal} opacity={0.15} />
              <Circle cx={c[0]} cy={c[1]} r={2.4} fill={C.teal}
                onPress={() => onSelect?.(p)} />
            </React.Fragment>
          ) : (
            <Circle key={p.id} cx={c[0]} cy={c[1]} r={2.1} fill="#fbfaf7"
              stroke="#b7b1a4" strokeWidth={1} onPress={() => onSelect?.(p)} />
          );
        })}
      </Svg>

      {globe && (
        <View style={s.spinRow}>
          <TouchableOpacity onPress={() => setSpin(v => v + 45)} style={s.spinBtn}>
            <Text style={s.spinTxt}>← 转</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSpin(v => v - 45)} style={s.spinBtn}>
            <Text style={s.spinTxt}>转 →</Text>
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
