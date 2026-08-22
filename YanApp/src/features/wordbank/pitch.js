// 言 · 声调(高低アクセント)
//
// 这里只有纯计算,没有 React —— 声调画错的样子是「一条线画在错的地方」,
// 不报错、不崩,而学习者拿它当标准照着念。必须能测。
//
// ## 为什么做这个
//
// 词库里有 **207 组同音但声调不同**的词(2026-08-13 实测,涉及 535 个词条):
//   書く(型1) / 欠く(型0)、紙(型2) / 神(型1)、箸(型1) / 橋(型2) / 端(型0)
// 在这之前这些卡在 App 里长得一模一样。对中文母语者这是重灾区 ——
// 中文有声调,所以会**下意识给日语词也安一个调**,而且安错了没人纠正。
//
// 数据来自 kanjium(CC-BY-SA 4.0,署名 Uros O.),和 JMdict 同一个许可,
// 要在「关于 → 数据来源」那一屏单独列出来。**不要和言的原创内容合成一句** ——
// 原创内容不该被误认为也在 ShareAlike 之下(上架合规那条,JMdict 已经这么处理)。

/**
 * 假名串 → 拍(モーラ)。
 *
 * 拍不是字符:「きゃ」是一拍(小字并进前一个),而「っ」「ん」「ー」各自算一拍。
 * 这一条错了,整条高低线就会画错位 —— 声调型说的是「第几拍之后降下来」。
 */
const SMALL = 'ゃゅょぁぃぅぇぉャュョァィゥェォゎヮ';

export function toMora(reading) {
  const s = String(reading || '');
  const out = [];
  for (const ch of s) {
    if (SMALL.includes(ch) && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

/**
 * 声调型 → 每一拍的高低。返回 boolean[],true = 高。
 *
 * 东京式的三条规则(第一拍和第二拍必然不同高低,这是日语声调的底层约束):
 *   型0(平板) 第一拍低,之后全高,而且后接助词也高
 *   型1(头高) 第一拍高,之后全低
 *   型n(n≥2)  第一拍低,第 2~n 拍高,第 n+1 拍起低
 *
 * @returns {{ pattern: boolean[], particleHigh: boolean }}
 *   particleHigh:后面接助词时那个助词是高还是低。**型0 和「型=拍数」在词本身上
 *   看起来一模一样**(桜が / 花が 的差别只在「が」上),不给这个值就分不出来。
 */
export function pitchPattern(reading, accent) {
  const mora = toMora(reading);
  const n = mora.length;
  const a = Number.isFinite(accent) ? accent : 0;
  const pattern = [];
  for (let i = 0; i < n; i++) {
    const k = i + 1;                       // 第几拍,从 1 数
    if (a === 0) pattern.push(k !== 1);            // 低高高高…
    else if (a === 1) pattern.push(k === 1);       // 高低低低…
    else pattern.push(k !== 1 && k <= a);          // 低高…高低低…
  }
  return { pattern, particleHigh: a === 0 };
}

/**
 * kanjium 的声调串 → 数字数组。
 *
 * 原始数据不止「1」这么干净,实测有三种形状:
 *   "1"                     单一型
 *   "0,3"                   两个都通行(11% 的词条是这样)
 *   "(形動)3,(副)3,1,0"      按词性分的
 * 括号里的词性标注**丢掉不解析** —— 词库自己有 `pos` 字段,在这里再解析一遍
 * 等于让同一件事有两个真相来源,而且这个来源还更不可靠。
 */
export function parseAccents(raw) {
  const out = [];
  for (const part of String(raw || '').split(',')) {
    const m = part.match(/(\d+)\s*$/);
    if (!m) continue;
    const v = Number(m[1]);
    if (Number.isFinite(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * 拿来显示的那一个。
 *
 * **只显示第一个。** kanjium 是按通行度排的,把「0,3」原样摆出来,
 * 学习者得到的是一个他无法处理的选择题 —— 他问的是「这个词怎么念」,
 * 不是「这个词有几种念法」。次要的那个留在数据里,以后想做「也可以念作」再用。
 */
export const primaryAccent = (raw) => {
  const list = parseAccents(raw);
  return list.length ? list[0] : null;
};

/**
 * 从词条上取声调型。拿不到返回 null。
 *
 * ⚠️ **不要拿 0 当缺省值。** 0 是「平板」,是一个真实存在的型 ——
 * 用它表示「不知道」会把一批词教成平板,而且不报错。
 *
 * ⚠️ 2026-08-18:这个函数是从 App.js 的 `pitchOf` 里抠出来的,因为它原来
 * 只认 `w.pitchAccent`,而 2026-08 合入的 7510 条音调**全写在 `w.pitch.accent`**
 * (实测 `pitchAccent` 字段 0 条)。App.js 那份还有个 `__DEV__` 的 preview 兜底,
 * 于是开发构建看着一切正常、生产构建一条音调都不显示,整整一轮没人发现。
 *
 * 搬到这里是为了**它能被测到** —— 留在组件文件里就得先起 React Native,
 * 而这个项目里没被测到的那一层出过每一个不报错的错。
 *
 * `pitchAccent` 那条留着:内容包是远端下发的,线上可能还有旧结构的包在跑。
 */
export function accentOf(word) {
  const merged = word?.pitch?.accent;
  if (Number.isFinite(merged)) return merged;
  if (Number.isFinite(word?.pitchAccent)) return word.pitchAccent;
  return null;
}

// Generated from staging/pitch-confidence.json: the 40 agree=2 rows whose
// exact two-source set contains Wiktionary. Three-way rows stay at agree=3;
// UniDic+kanjium rows stay trusted as two independent lineages.
const WIKTIONARY_TWO_SOURCE_KEYS = new Set([
  '薬指\tくすりゆび', '久しぶり\tひさしぶり', '最も\tもっとも', 'しかも\tしかも',
  'アメリカ\tアメリカ', 'グラム\tグラム', '注文\tちゅうもん', 'お土産\tおみやげ',
  'やっぱり\tやっぱり', '四日\tよっか', '五日\tいつか', '六日\tむいか',
  'しなやか\tしなやか', 'うどん\tうどん', '執着\tしゅうじゃく', 'けれども\tけれども',
  '自転車\tじてんしゃ', 'する\tする', '七日\tなのか', 'なる\tなる',
  '一日\tいちじつ', 'ガラス\tガラス', 'できる\tできる', '九日\tここのか',
  'こらえる\tこらえる', '少なくとも\tすくなくとも', '見方\tみかた', '反る\tかえる',
  'みっともない\tみっともない', '絶えず\tたえず', '一昨日\tいっさくじつ',
  'ふざける\tふざける', 'なさる\tなさる', '一日\tいちにち', '魂\tこん',
  'お代わり\tおかわり', 'やがて\tやがて', '別に\tべつに', 'うるさい\tうるさい',
  'お菓子\tおかし', '的\tてき', 'それ\tそれ', 'ワイシャツ\tワイシャツ',
  '物足りない\tものたりない', '十日\tとおか', '機関車\tきかんしゃ',
]);

/** 只有一个来源，或双源组合含有可能复录上游的维基 —— 都要提示。 */
export const pitchUnconfirmed = (w) => {
  const agree = w?.pitch?.agree;
  return agree === 1 || (agree === 2
    && WIKTIONARY_TWO_SOURCE_KEYS.has(`${w?.word || ''}\t${w?.reading || ''}`));
};

/** 型的名字。日语教学里的通用叫法,用户以后在别处也会遇到,所以照旧给。 */
export function accentName(reading, accent) {
  const n = toMora(reading).length;
  if (accent === 0) return '平板';
  if (accent === 1) return '頭高';
  if (accent >= n) return '尾高';
  return '中高';
}

/**
 * 一句能照着念的中文。
 *
 * 光给「頭高」不够 —— 对不懂日语的人那只是两个汉字,不是指令。
 * 用户的原话是「那个高低线其实我有一点没看懂」,而他看不懂是合理的:
 * 型名是**行话**,行话要先被教过才有意义,而这个 App 恰恰还没教。
 *
 * 所以型名后面跟一句大白话,说清「第几拍高、第几拍降」。
 * 读过三五个词自然就内化了,那时候型名才开始有用。
 */
export function accentHint(reading, accent) {
  const n = toMora(reading).length;
  if (!n || !Number.isFinite(accent)) return '';
  if (accent === 0) return '第1拍低，之后一直高（助词也高）';
  if (accent === 1) return n === 1 ? '就一拍，高' : '第1拍高，之后一直低';
  if (accent >= n) return `到第${n}拍都不降，助词才转低`;
  return `第2拍起高，第${accent}拍之后降下来`;
}
