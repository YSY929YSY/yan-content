/**
 * 旧手账数据 → 新数据结构。**跑完这个文件可以删。**(工单 1.4)
 *
 * 纯函数,不碰磁盘 —— 落盘由调用方做,这样迁移逻辑可测,
 * 而且「算错了」和「写坏了」能分开定位。
 *
 * ─────────────────────────────────────────────────────────
 * 三处需要留神的换算:
 *
 * 1. **坐标单位**:旧的 x/y/w 是归一化 0~1,新的是页面单位(PAGE 1000×1600)。
 *    锚点两边都是**中心**(旧 JournalPage.js 的 transform 是
 *    `translateX(x) → rotate → translateX(-w/2)`,即先移到 x 再绕它转),
 *    所以只换单位,不用平移半个身位。这条我实际去代码里确认过,没有靠猜。
 *
 * 2. **高度**:旧 item 只有 w,没有 h —— 高度当时是渲染时按素材长宽比现算的。
 *    新模型要求 h 在基类上,所以这里要**查素材库把它补出来**。
 *    查不到的素材退化成 4:3,并在报告里单独列出来 —— 不静默糊弄过去。
 *
 * 3. **ink 元素变成页级 strokes**:旧模型里手写是一种 item(kind:'ink'),
 *    新模型里它是页的属性。这不是改名,是搬家:一页里所有 ink item 的
 *    strokes 合并进 page.strokes,然后那些 item 消失。
 * ─────────────────────────────────────────────────────────
 */

import { PAGE, wrapAngle, clampScale } from './journalTypes.ts';
import type { JournalItem, JournalPage, ItemType, Stroke, PaperId } from './journalTypes.ts';
import { JITTER, randomAngle, materialOf, DEFAULT_PAPER, LAYER } from './journalTheme.ts';

/** 旧的 kind → 新的 type。旧模型有 10 种,新模型 9 种。 */
const KIND_MAP: Record<string, ItemType | 'ink'> = {
  photo: 'photo',
  polaroid: 'photo',    // 拍立得变成 photo 的一个 frame
  scan: 'scan',
  cutout: 'cutout',
  tape: 'tape',
  stamp: 'stamp',
  seal: 'stamp',        // 印/章合并
  badge: 'sticker',     // 徽章并进贴纸 —— 打卡产物走 stub,不走 badge
  text: 'text',
  ink: 'ink',           // 特殊:不产生 item,搬进 page.strokes
};

type OldPoint = [number, number, number, number];   // [x, y, t, w] 归一化坐标
type OldStroke = { points?: OldPoint[]; color?: string; tool?: string };
type OldItem = {
  id: string; kind?: string; assetId?: string | null; momentId?: string | null;
  material?: string; lift?: number; payload?: any;
  x?: number; y?: number; w?: number; scale?: number; rotation?: number; z?: number;
};
type OldPage = {
  id: string; cityId?: string | null; tripId?: string | null; pageDate?: string | null;
  bg?: string; createdAt?: any; updatedAt?: any; deletedAt?: any; items?: OldItem[];
};
type AssetLike = { id: string; width?: number; height?: number };

export type MigrateReport = {
  pages: number;
  items: number;
  /** ink item 合并成了多少笔。 */
  strokes: number;
  /** 因为查不到素材、高度用了 4:3 兜底的元素 id。**不静默,列出来。** */
  guessedHeight: string[];
  /** kind 不认识、整条丢弃的元素 id。 */
  dropped: string[];
  /** 迁移后 rotation 为 0 的元素数。验收要求这个数是 0。 */
  stillStraight: number;
};

/**
 * 一个旧元素 → 新元素。
 *
 * @param rand 注入随机源,测试里给定值。**不要在函数里直接调 Math.random** ——
 *             那样迁移结果不可复现,出了问题没法定位。
 */
function migrateItem(
  old: OldItem,
  assets: Map<string, AssetLike>,
  z: number,
  rand: () => number,
  report: MigrateReport,
): JournalItem | null {
  const mapped = KIND_MAP[String(old.kind || 'photo')];
  if (!mapped || mapped === 'ink') return null;
  const type = mapped;

  // 归一化 → 页面单位。中心锚点两边一致,只换单位。
  const w = (Number.isFinite(old.w) ? (old.w as number) : 0.42) * PAGE.w;

  // 高度:旧模型没存,查素材库按长宽比补
  const asset = old.assetId ? assets.get(old.assetId) : undefined;
  let h: number;
  if (asset && asset.width && asset.height) {
    h = w * (asset.height / asset.width);
  } else {
    h = w * 0.75;                       // 4:3 兜底
    report.guessedHeight.push(old.id);
  }

  /**
   * ⚠️ **旋转不能给 0**(工单 1.4)。
   * 「全给 0 打开还是一堵整齐的墙。」旧数据里大部分 rotation 就是 0,
   * 所以这里不是「保留原值」而是「原值为 0 的补一个随机角」。
   */
  const oldRot = Number.isFinite(old.rotation) ? (old.rotation as number) : 0;
  const rotation = wrapAngle(oldRot !== 0 ? oldRot : randomAngle(JITTER, rand));

  const def = materialOf(type);
  return {
    id: old.id,
    type,
    x: (Number.isFinite(old.x) ? (old.x as number) : 0.5) * PAGE.w,
    y: (Number.isFinite(old.y) ? (old.y as number) : 0.5) * PAGE.h,
    w, h,
    rotation,
    scale: clampScale(Number.isFinite(old.scale) ? (old.scale as number) : 1),
    zIndex: z,
    material: (old.material as any) || def.material,
    lift: Number.isFinite(old.lift) ? (old.lift as number) : def.lift,
    payload: migratePayload(type, old, asset),
    createdAt: Date.now(),
  };
}

/** payload 也要跟着改:图片类从「裸 uri / 无结构」变成 assetId + 源尺寸。 */
function migratePayload(type: ItemType, old: OldItem, asset?: AssetLike): any {
  const p = old.payload && typeof old.payload === 'object' ? old.payload : {};
  const src = { srcW: asset?.width ?? 0, srcH: asset?.height ?? 0 };
  switch (type) {
    case 'photo':
      return { ...src, assetId: old.assetId || '', caption: p.caption,
               frame: old.kind === 'polaroid' ? 'polaroid' : 'none' };
    case 'scan':
      return { ...src, assetId: old.assetId || '' };
    case 'cutout':
      return { ...src, assetId: old.assetId || '', maskAssetId: p.maskAssetId || '',
               style: ['cut', 'sticker', 'silhouette', 'illus'].includes(p.style) ? p.style : 'cut' };
    case 'sticker':
      return { assetId: old.assetId || '' };
    case 'stamp':
      return { top: p.top || '', center: p.center || '', bottom: p.bottom || '',
               color: p.color || '#a8442c' };
    case 'text':
      return { content: p.content || '', font: p.font === 'serif' ? 'serif' : 'hand',
               size: Number.isFinite(p.size) ? p.size : 38, color: p.color || '#4c4335' };
    case 'tape':
      return { pattern: ['a', 'b', 'c'].includes(p.pattern) ? p.pattern : 'a' };
    default:
      return p;
  }
}

/**
 * 旧 ink item 的 strokes → 页级 Stroke[]。
 *
 * 点的格式从 `[x, y, t, w]` 变成 `{x, y, p, t}`:
 *   · x/y 归一化 → 页面单位
 *   · t 原样保留 —— **这是能保住的最重要的东西**,有它才能回放,
 *     也才能重新按速度反推笔锋
 *   · w(线宽)**丢弃**,p 填 0
 *
 * 丢 w 看着像丢数据,其实不是:旧的 w 本来就是从速度算出来的派生值,
 * 而 t 还在,新渲染路径会用同一套公式重新算出来。反过来
 * **假装 w 是压力值填进 p 才是真的错** —— 那会让手指写的字被当成 Apple Pencil
 * 写的,笔锋整个变形。
 */
function migrateStrokes(old: OldItem, rand: () => number): Stroke[] {
  const list: OldStroke[] = Array.isArray(old.payload?.strokes) ? old.payload.strokes : [];
  return list.map((s, i) => ({
    id: `${old.id}-s${i}`,
    color: typeof s.color === 'string' ? s.color : '#33302b',
    // 旧的 tool 是 pen/pencil/marker/brush,新的只有 pen/eraser
    tool: 'pen' as const,
    points: (Array.isArray(s.points) ? s.points : [])
      .filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map(p => ({ x: p[0] * PAGE.w, y: p[1] * PAGE.h, p: 0, t: Number.isFinite(p[2]) ? p[2] : 0 })),
  })).filter(s => s.points.length > 1);   // 一个点不成笔
}

const PAPER_MAP: Record<string, PaperId> = {
  paper: 'plain-cream', 'plain-cream': 'plain-cream',
  dot: 'dot-cream', 'dot-cream': 'dot-cream',
  grid: 'grid-white', 'grid-white': 'grid-white',
  kraft: 'kraft-bag', 'kraft-bag': 'kraft-bag', 'kraft-light': 'kraft-bag',
};

/**
 * 整份迁移。
 *
 * @param rand 注入随机源。默认 Math.random,测试里传定值 —— 见上面 migrateItem 的注释。
 */
export function migrateJournal(
  oldPages: OldPage[],
  oldAssets: AssetLike[] = [],
  rand: () => number = Math.random,
): { pages: JournalPage[]; report: MigrateReport } {
  const assets = new Map(oldAssets.filter(a => a && a.id).map(a => [a.id, a]));
  const report: MigrateReport = {
    pages: 0, items: 0, strokes: 0,
    guessedHeight: [], dropped: [], stillStraight: 0,
  };

  const pages = (oldPages || []).filter(p => p && p.id).map(op => {
    const oldItems = Array.isArray(op.items) ? op.items : [];

    // ink 先摘出来搬进页级
    const strokes: Stroke[] = [];
    for (const it of oldItems) {
      if (KIND_MAP[String(it.kind)] === 'ink') strokes.push(...migrateStrokes(it, rand));
    }

    /**
     * zIndex 按旧的 z 排序后重发,从 LAYER.itemsBase 起连续递增。
     * **不沿用旧的 z 值** —— 旧值可能有重复、有空洞、也可能已经涨到很大,
     * 直接搬过来会撞上胶带层(300)。顺序是要保的,数值不是。
     */
    const items = oldItems
      .filter(it => it && it.id && KIND_MAP[String(it.kind)] !== 'ink')
      .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
      .map((it, i) => {
        const mi = migrateItem(it, assets, LAYER.itemsBase + i, rand, report);
        if (!mi) report.dropped.push(it.id);
        return mi;
      })
      .filter((x): x is JournalItem => x !== null);

    report.pages += 1;
    report.items += items.length;
    report.strokes += strokes.length;
    report.stillStraight += items.filter(i => i.rotation === 0).length;

    return {
      id: op.id,
      bookId: op.tripId || null,          // 旧的 tripId 就是「哪一趟」,对应新的册子
      cityId: op.cityId || null,          // 城市自动分格,与册子并存
      dateISO: op.pageDate || null,
      items,
      strokes,
      paper: PAPER_MAP[String(op.bg || '')] || DEFAULT_PAPER,
      createdAt: toMillis(op.createdAt),
      updatedAt: toMillis(op.updatedAt),
      deletedAt: op.deletedAt ? toMillis(op.deletedAt) : null,
    } satisfies JournalPage;
  });

  return { pages, report };
}

/** 旧数据里时间戳有 ISO 字符串也有毫秒数,统一成毫秒。 */
function toMillis(v: any): number {
  if (Number.isFinite(v)) return v as number;
  const t = Date.parse(String(v || ''));
  return Number.isFinite(t) ? t : Date.now();
}
