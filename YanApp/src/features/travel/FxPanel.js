// 言 · 汇率换算(参考价)
// 定位:站在店里犹豫「这东西到底贵不贵」时,两秒得到答案。
// 三条设计约束:
//  1. 没网也要能用 —— 一律先显示缓存,标清截至日期,不转圈。
//  2. 不假装精确 —— 这是银行间中间价,刷卡通常再贵 1–3%,必须写在脸上。
//  3. 走势只用来说明「这数字是活的」—— 主流货币几天内波动常在 0.3% 以内,
//     做成大图表反而诱导人去计较不值得计较的东西。所以:小 sparkline + 一句实话。
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { C } from '../../theme';
import { getRates, rateOf, convert, seriesFor, fmtFx, fxDecimals, FX_SYMBOLS, FX_NAMES } from '../../lib/fx';

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });
const CODES = ['EUR', 'GBP', 'TRY', 'USD', 'CNY', 'KRW'];

const Sparkline = ({ data }) => {
  if (!data || data.length < 3) return null;
  const W = 62; const H = 16;
  const min = Math.min(...data); const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / span) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <Svg width={W} height={H}>
      <Polyline points={pts} fill="none" stroke={C.teal} strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
};

export default function FxPanel({ initialFrom = 'TRY', initialTo = 'CNY' }) {
  const [fx, setFx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(initialFrom);
  // 两边同币种就没意义了(账本本来就是人民币时会撞上):换一个目标币种
  const [to, setTo] = useState(initialTo === initialFrom ? (initialFrom === 'EUR' ? 'CNY' : 'EUR') : initialTo);
  const [amount, setAmount] = useState('100');
  const [picking, setPicking] = useState(null); // 'from' | 'to' | null

  // alive 标记:请求还在飞的时候用户关掉浮层,组件已卸载就别再 setState
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = async (force) => {
    setLoading(true);
    const data = await getRates({ force });
    if (!alive.current) return;
    setFx(data);
    setLoading(false);
  };
  useEffect(() => { load(false); }, []);

  const num = Number.parseFloat(String(amount).replace(/[^\d.]/g, ''));
  const rates = fx?.rates;
  const out = convert(Number.isFinite(num) ? num : 0, rates, from, to);
  const one = rateOf(rates, from, to);
  const series = seriesFor(fx, from, to);
  const range = series.length > 2
    ? ((Math.max(...series) - Math.min(...series)) / Math.min(...series)) * 100
    : null;

  const dateTxt = fx?.date
    ? `${Number(fx.date.slice(5, 7))}月${Number(fx.date.slice(8, 10))}日`
    : '—';

  const swap = () => { setFrom(to); setTo(from); };
  const pick = (code) => {
    if (picking === 'from') setFrom(code === to ? from : code);
    if (picking === 'to') setTo(code === from ? to : code);
    setPicking(null);
  };

  return (
    <View style={s.wrap}>
      {/* 换算 */}
      <View style={s.card}>
        <View style={s.line}>
          <TouchableOpacity style={s.curBtn} onPress={() => setPicking(picking === 'from' ? null : 'from')}>
            <Text style={s.curSym}>{FX_SYMBOLS[from]}</Text>
            <Text style={s.curCode}>{from}</Text>
          </TouchableOpacity>
          <TextInput
            style={s.amount}
            value={amount}
            onChangeText={v => setAmount(v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={C.mutedLight}
          />
        </View>

        <TouchableOpacity style={s.swapRow} onPress={swap} activeOpacity={0.7}>
          <View style={s.rule} />
          <Text style={s.swapIcon}>⇅</Text>
          <View style={s.rule} />
        </TouchableOpacity>

        <View style={s.line}>
          <TouchableOpacity style={s.curBtn} onPress={() => setPicking(picking === 'to' ? null : 'to')}>
            <Text style={s.curSym}>{FX_SYMBOLS[to]}</Text>
            <Text style={s.curCode}>{to}</Text>
          </TouchableOpacity>
          <Text style={[s.amount, s.amountOut]} numberOfLines={1}>
            {loading && !rates ? '…' : fmtFx(out, to)}
          </Text>
        </View>

        {picking && (
          <View style={s.tray}>
            {CODES.map(code => {
              const on = (picking === 'from' ? from : to) === code;
              return (
                <TouchableOpacity key={code} style={[s.trayChip, on && s.trayChipOn]} onPress={() => pick(code)}>
                  <Text style={[s.trayTxt, on && s.trayTxtOn]}>{FX_SYMBOLS[code]} {FX_NAMES[code]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* 汇率本身 + 走势 */}
      <View style={s.rateRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.rateMain}>
            1 {FX_SYMBOLS[from]} = {one == null ? '—' : fmtFx(one, to)} {FX_SYMBOLS[to]}
          </Text>
          <Text style={s.rateMeta}>
            {range == null
              ? '银行间参考价'
              : range < 0.5
                ? `近十天基本持平(${range.toFixed(1)}%)`
                : `近十天波动 ${range.toFixed(1)}%`}
          </Text>
        </View>
        <Sparkline data={series} />
      </View>

      <View style={s.footRow}>
        <Text style={s.foot}>
          参考价 · {dateTxt} · 刷卡再贵 1–3%
          {fx?.stale ? ' · 离线' : ''}
        </Text>
        <TouchableOpacity onPress={() => load(true)} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color={C.mutedLight} /> : <Text style={s.refresh}>刷新</Text>}
        </TouchableOpacity>
      </View>
      {!rates && !loading && (
        <Text style={s.err}>还没取到汇率,连上网刷新一下。</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingTop: 2 },
  card: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  curBtn: { minWidth: 54 },
  curSym: { fontFamily: SERIF, fontSize: 21, color: C.ink },
  curCode: { fontSize: 9.5, color: C.muted, letterSpacing: 0.8, marginTop: 1 },
  amount: {
    flex: 1, fontFamily: SERIF, fontSize: 30, color: C.ink,
    padding: 0, textAlign: 'right',
  },
  amountOut: { color: C.teal },
  swapRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 10 },
  rule: { flex: 1, height: 1, backgroundColor: C.border },
  swapIcon: { fontSize: 13, color: C.mutedLight },
  tray: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  trayChip: {
    borderWidth: 1, borderColor: C.border, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  trayChipOn: { backgroundColor: C.ink, borderColor: C.ink },
  trayTxt: { fontSize: 11, color: C.muted, fontWeight: '700' },
  trayTxtOn: { color: C.white },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, paddingHorizontal: 2 },
  rateMain: { fontSize: 13, color: C.ink, fontWeight: '700' },
  rateMeta: { fontSize: 10.5, color: C.muted, marginTop: 3 },
  footRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, marginTop: 12, paddingHorizontal: 2,
  },
  foot: { flex: 1, fontSize: 10.5, color: C.muted },
  refresh: { fontSize: 11.5, color: C.teal, fontWeight: '700' },
  err: { fontSize: 11.5, color: C.lava, lineHeight: 16, marginTop: 10, paddingHorizontal: 2 },
});
