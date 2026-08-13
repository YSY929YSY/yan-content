// 言 · 手账渲染的纯计算
//
// 这里只有数学,没有 Skia 也没有 React —— 渲染出错的样子是「页面看着平」,
// 不会报错、不会崩,只能靠肉眼发现。所以能抽成纯函数的都抽出来测。
//
// 一句话原则:**页面永不拍平**。存的是每个元素在哪、多大、什么材质、离纸面多高,
// 光影是这里算出来的。同一份数据换 300dpi 再算一遍,就是可打印的稿子。

/**
 * 全局光。所有元素共用**同一个**光源,这是「像在同一个空间里」的全部原因。
 * 每个素材自带一份烤死的阴影 = 每个元素各在各的世界里,这就是拼贴 App 看着假的原因。
 * 归一化向量,指向光来的方向(左上)。
 */
export const LIGHT = { x: -0.55, y: -0.83 };

/** lift 是页宽千分比,不是像素 —— 换屏幕、换 300dpi 打印都不用改数据。 */
export const liftToPx = (lift, pageWidth) => (lift / 1000) * pageWidth;

/**
 * 厚度 → 阴影。层次感的全部来源。
 *
 * 贴纸浮 9、票根 3、胶带 1、印 0,阴影的**偏移**和**虚实**跟着走:
 * 浮得高 = 影子离得远、更散、更淡;贴着纸 = 影子几乎在正下方、很紧、偏实。
 * 给所有元素画同一种柔和阴影,页面就是平的 —— 这是最常见的错法。
 */
export function shadowFor(lift, pageWidth) {
  const h = liftToPx(Math.max(0, lift || 0), pageWidth);
  if (h <= 0) return null;                  // 印是压进纸里的,没有影子
  return {
    dx: -LIGHT.x * h * 1.6,
    dy: -LIGHT.y * h * 1.6,
    blur: Math.max(1, h * 0.9),
    // 越高越散也越淡:近处的接触阴影最实,这条不成立的话贴纸会像浮在半空
    opacity: Math.max(0.14, 0.42 - h * 0.012),
  };
}

/**
 * 元素越过页边时,超出的那半截影子应该落在**桌面**上,不是纸上。
 * 这是「延展到本子外面」在视觉上成立的关键 —— 数据上只是 x 没被限制在 0~1。
 */
export const crossesPageEdge = (item) => {
  const halfW = (item?.w ?? 0.2) * (item?.scale ?? 1) / 2;
  const halfH = (item?.h ?? 0.2) * (item?.scale ?? 1) / 2;
  return item.x - halfW < 0 || item.x + halfW > 1
      || item.y - halfH < 0 || item.y + halfH > 1;
};

/** 相对坐标(0~1)→ 像素。渲染层唯一该做的坐标换算,别在别处再写一遍。 */
export const toPx = (item, pageWidth, pageHeight) => ({
  x: item.x * pageWidth,
  y: item.y * pageHeight,
  scale: item.scale ?? 1,
  rotation: ((item.rotation ?? 0) * Math.PI) / 180,
});

/**
 * 笔锋:线宽随速度变,快的地方细。
 *
 * 没有笔锋的手写是一条均匀的塑料线,比字库还假。
 * iPhone 手指拿不到压力(3D Touch 早废了),但拿得到速度 —— 用它反推。
 * 返回 0.35~1 的系数,乘上笔的基础粗细。
 */
export function nibWidth(prev, next, base = 1) {
  if (!prev || !next) return base;
  const dt = Math.max(1, (next[2] || 0) - (prev[2] || 0));
  const dist = Math.hypot(next[0] - prev[0], next[1] - prev[1]);
  const speed = dist / dt;                   // 相对页宽/毫秒
  const k = 1 - Math.min(0.65, speed * 220); // 越快越细
  return base * Math.max(0.35, k);
}

/**
 * 挑一张纸。
 *
 * 没指定 bg 就按页 id **稳定**挑 —— 不能用随机:每次打开换一张纸,那就不是一本本子了。
 * (图片的 require 在 journalPapers.js,这个文件要保持能在 node 里直接跑测试。)
 */
export function pickPaper(page, keys) {
  if (!keys?.length) return null;
  if (page?.bg && keys.includes(page.bg)) return page.bg;
  const id = String(page?.id || '');
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return keys[h % keys.length];
}
