// 言 · 手账拖拽/旋转/缩放的纯计算
//
// 这里没有 React 也没有 gesture-handler —— 手势判错的样子是「点不中那张票根」
// 或者「一甩手贴纸飞出去再也找不回来」,两种都不报错、不崩,只能靠肉眼撞见。
// 所以命中判定、坐标换算、边界这些全抽在这儿测。
//
// 三条约束来自 docs/journal-data-design.md,不要在实现时「顺手优化」掉:
//   1. 坐标是**相对页宽/页高的 0~1**,不是像素 —— 换屏幕、换 300dpi 打印都不用改数据
//   2. **越过页边是合法的**,超出那半截的影子落在桌面上。所以不能 clamp 回 0~1
//   3. 元素永不拍平:动的是 x/y/scale/rotation,材质和厚度一个都不碰

/**
 * 缩放的上下限。
 *
 * 不设限的话捏到 0.001 就是一个点不着的点,而用户没有「撤销」可用(这一版还没有)——
 * 一次误操作等于永久丢一个元素。上限 6 是因为再大就整页只剩一张图,没有意义。
 */
export const SCALE_MIN = 0.15;
export const SCALE_MAX = 6;

/**
 * 位置的兜底范围。
 *
 * 这**不是**把元素关回页内 —— 0~1 之外是合法的,「延展到本子外面」靠的就是它。
 * 但 -0.5~1.5 之外的东西已经完全在屏幕外了,再远只有一个后果:找不回来。
 * 所以这是「防丢」不是「防越界」,两者差一个量级。
 */
export const POS_MIN = -0.5;
export const POS_MAX = 1.5;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 角度归一到 (-180, 180]。不归一的话转几圈之后数值一直涨,存下来越来越难读。 */
export function normalizeAngle(deg) {
  if (!Number.isFinite(deg)) return 0;
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a === 0 ? 0 : a;   // 干掉 -0
}

/**
 * 一个元素在页面上占的**相对**宽高。
 *
 * 高度由图片自己的长宽比决定(和 JournalPage 的 AssetItem 同一套算法):
 * 元素数据里只有 w,存 h 会和图片本身打架 —— 换一张图就得回填所有页。
 *
 * @param aspect 图片 高/宽。拿不到就按 1(正方形)—— 命中判定宁可小一点也不要
 *               把一片空白算成命中,后者的表现是「点空白处却拖走了别的东西」。
 */
export function boxOf(item, aspect = 1, pageWidth = 1, pageHeight = 1) {
  const scale = item?.scale ?? 1;
  const w = (item?.w ?? 0.42) * scale;
  // 宽是按页宽算的,高要换算回页高的比例,不然非正方形的页面上盒子是歪的
  const h = w * (Number.isFinite(aspect) && aspect > 0 ? aspect : 1)
              * (pageWidth / (pageHeight || 1));
  return { w, h };
}

/**
 * 点在不在这个元素上(考虑旋转)。
 *
 * 做法是把点转进元素自己的坐标系再比矩形 —— 反过来算旋转后的四条边要处理八种情况,
 * 而且斜着的元素会出现「看着在里面、算出来在外面」的边角。
 */
export function hitsItem(item, point, aspect = 1, pageWidth = 1, pageHeight = 1) {
  if (!item || !point) return false;
  const { w, h } = boxOf(item, aspect, pageWidth, pageHeight);
  const rad = ((item.rotation ?? 0) * Math.PI) / 180;
  // 相对坐标下 x 和 y 的单位长度不一样,旋转必须在**像素**空间里做
  const dx = (point.x - (item.x ?? 0.5)) * pageWidth;
  const dy = (point.y - (item.y ?? 0.5)) * pageHeight;
  const cos = Math.cos(-rad), sin = Math.sin(-rad);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  return Math.abs(lx) <= (w * pageWidth) / 2 && Math.abs(ly) <= (h * pageHeight) / 2;
}

/**
 * 点中了哪个元素。
 *
 * **从上往下找,第一个中的就是它** —— 屏幕上盖在最上面的那个,就是用户以为自己点中的。
 * 按 z 升序画,所以要倒着找。
 *
 * 手写(kind='ink')不参与:一笔字的包围盒可能横跨半页,拿它当矩形去命中,
 * 结果是「点哪儿都在拖那行字」。笔迹要能选中得按笔画本身算距离,那是另一件事。
 */
export function hitTest(items, point, { aspects = {}, pageWidth = 1, pageHeight = 1 } = {}) {
  const sorted = [...(items || [])].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const it = sorted[i];
    if (!it || it.kind === 'ink') continue;
    if (hitsItem(it, point, aspects[it.assetId], pageWidth, pageHeight)) return it;
  }
  return null;
}

/**
 * 把一个元素提到最上层。
 *
 * 摸到就提 —— 真实拼贴里你伸手去动一张票根,它就到了最上面。
 * 已经在最上面的话**原样返回同一个数组**:白改一次 z 会让 React 白重渲一整页。
 */
export function bringToFront(items, id) {
  const list = items || [];
  const target = list.find(it => it?.id === id);
  if (!target) return list;
  const maxZ = list.reduce((m, it) => Math.max(m, it?.z ?? 0), 0);
  if ((target.z ?? 0) >= maxZ) return list;
  return list.map(it => (it.id === id ? { ...it, z: maxZ + 1 } : it));
}

/**
 * 一次手势作用到元素上。
 *
 * 增量都是**相对手势开始那一刻**的,不是相对上一帧 —— 累加式会把浮点误差
 * 一路攒起来,松手时元素和手指对不上。所以调用方要留住起手时的那份快照(base)。
 *
 * @param base     起手时的元素
 * @param dxPx/dyPx  手指位移(像素)
 * @param scale    捏合倍率(1 = 没变)
 * @param rotation 旋转增量(度)
 */
export function applyGesture(base, { dxPx = 0, dyPx = 0, scale = 1, rotation = 0 } = {},
                             pageWidth = 1, pageHeight = 1) {
  if (!base) return base;
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    ...base,
    x: clamp((base.x ?? 0.5) + dxPx / (pageWidth || 1), POS_MIN, POS_MAX),
    y: clamp((base.y ?? 0.5) + dyPx / (pageHeight || 1), POS_MIN, POS_MAX),
    scale: clamp((base.scale ?? 1) * s, SCALE_MIN, SCALE_MAX),
    rotation: normalizeAngle((base.rotation ?? 0) + (Number.isFinite(rotation) ? rotation : 0)),
  };
}

/** 用改好的元素换掉列表里那一条。找不到就原样返回 —— 不要凭空插一条进去。 */
export function replaceItem(items, next) {
  const list = items || [];
  if (!next?.id || !list.some(it => it?.id === next.id)) return list;
  return list.map(it => (it.id === next.id ? next : it));
}

/**
 * 触点(画布像素)→ 页面相对坐标。
 *
 * 画布比纸大一圈(四周留 pad 给桌面和影子),所以要先减掉 pad。
 * 结果**不做 0~1 截断**:落在纸外面是合法的,调用方靠这个判断「拖到桌面上了」。
 */
export const toPageCoords = (px, py, { pad = 0, pageWidth = 1, pageHeight = 1 } = {}) => ({
  x: (px - pad) / (pageWidth || 1),
  y: (py - pad) / (pageHeight || 1),
});
