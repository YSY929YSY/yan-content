/**
 * 手账数据模型 —— 第一批的地基。
 *
 * 这份文件是「手账重构工单」1.1~1.5 的落地。工单里最重要的一句话是:
 * **「手账页上的每个元素,不管是照片、票根、词纸条还是印章,共用同一个基类。」**
 * 所有几何逻辑(命中测试、包围盒、导出)只认基类,不认 type。
 * 一旦某个几何函数开始 `switch (type)` 去掏 payload,这条就破了。
 *
 * ─────────────────────────────────────────────────────────
 * 相对工单的偏离,共 7 处。全部经用户批准〔用户 2026-08-14〕,
 * 不是「顺手优化」。每一条都写清楚为什么,免得下一轮有人按工单改回去。
 *
 *  1. x/y 是**中心**,不是左上角。
 *     命中测试要把手指的点反向旋转到元素坐标系,这一步必须知道中心。
 *     存左上角的话中心 = x + w/2,**得先知道 w** —— 而文字元素在测量之前
 *     根本没有 w。参考 HTML 存左上角能work,是因为 DOM 替它做了布局;
 *     我们没有布局层(工单红线:禁止 flex/grid),所以得自己算。
 *
 *  2. w/h 提到基类,不放 payload。
 *     理由同上:几何逻辑不该按 type 分支。payload 里仍有源图尺寸,
 *     但那是**另一件事** —— 见 srcW/srcH 的注释。
 *
 *  3. type 9 种,工单写 8 种(加 scan)。
 *     票根扫描有自己的撕边遮罩 + 投影,是独立渲染路径,不是 photo 的一个 frame。
 *
 *  4. Stroke 加 tool: 'pen' | 'eraser'。
 *     工单要「这一页是怎么被写出来的」回放 —— 橡皮不存成一笔就还原不出来,
 *     而且擦完不能撤销。**存点不存图**的全部好处都建立在「每一笔都在」上面。
 *
 *  5. cutout.style 4 种,工单表里 3 种(加 illus)。
 *     工单第 8 行自己写的是「四种输出形态」,3.3 的表漏了一种。
 *     illus 是色阶压缩 + 描边,**纯像素运算、免费、离线**,
 *     和第四批那个要钱的服务端 AI 插画化只是重名,不是一回事。
 *
 *  6. 图片类 payload 存 assetId,不存 uri。
 *     ⚠️ 这条不是风格问题,是踩过的坑:iOS 的沙盒容器 UUID **每次装应用都会变**,
 *     存绝对 uri 的结果是重装之后满页裂图。素材库(journal_assets)统一管
 *     文件名 + 远端路径,元素只引用 id。见 journalModel.assetUriIn。
 *
 *  7. tape 去掉 lengthPx,用基类的 w。
 *     胶带的长度就是它的宽度,两个字段表示同一件事迟早会不一致。
 *
 * ─────────────────────────────────────────────────────────
 * 第四批(分享出口)对第一批的三条要求,已在本文件满足:
 *   · 导出按 CANVAS 不按 PAGE  → 见 CANVAS / canvasRect()
 *   · 导出倍率不写死 1x        → 见 ExportSpec
 *   · 笔迹存点数组能任意重绘    → 见 Stroke
 */

// ─────────────────────────────────────────────────────────────
// 画布 ≠ 页面
// ─────────────────────────────────────────────────────────────

/**
 * 纸的视觉尺寸。**这不是坐标上限** —— 元素可以放到纸外面去。
 *
 * 1000×1600 是一个「设计单位」,不是像素:渲染时整页按屏幕宽度等比缩放。
 * 定成整千是为了心算方便(x:500 就是横向正中)。
 */
export const PAGE = { w: 1000, h: 1600 } as const;

/**
 * 实际可放置区域,四边各比纸大 120。
 *
 * 纸只是画布上的一个**视觉参考层,不是裁剪边界**。元素压在纸边上、
 * 一半露在纸外,是手账和「卡片列表」最直观的分界(工单 1.2)。
 */
export const CANVAS = { w: 1240, h: 1840 } as const;

/** 画布原点相对纸左上角。负数 = 画布从纸的左上角再往外扩。 */
export const ORIGIN = { x: -120, y: -120 } as const;

/**
 * 画布在页面坐标系里的矩形。导出分享图按这个出,**不是按 PAGE 裁**。
 * 第四批要用;第一批只把它定下来,不写导出功能。
 */
export function canvasRect() {
  return { x: ORIGIN.x, y: ORIGIN.y, w: CANVAS.w, h: CANVAS.h };
}

/** 一个点在不在画布内。x/y 允许为负,所以不能用 `x > 0` 这种判断。 */
export function insideCanvas(x: number, y: number): boolean {
  return x >= ORIGIN.x && x <= ORIGIN.x + CANVAS.w
      && y >= ORIGIN.y && y <= ORIGIN.y + CANVAS.h;
}

// ─────────────────────────────────────────────────────────────
// 元素
// ─────────────────────────────────────────────────────────────

export const ITEM_TYPES = [
  'photo', 'scan', 'cutout', 'stub', 'wordSlip',
  'stamp', 'sticker', 'text', 'tape',
] as const;
export type ItemType = typeof ITEM_TYPES[number];

/** 材质:决定怎么打光、投什么样的影。 */
export const MATERIALS = ['paper', 'photo', 'tape', 'sticker', 'vellum', 'scan', 'ink'] as const;
export type Material = typeof MATERIALS[number];

/** scale 的边界。工单 1.1 定的,超出就不是「贴东西」而是「铺背景」了。 */
export const SCALE_MIN = 0.3;
export const SCALE_MAX = 3;

/**
 * 贴在纸上的一个东西。
 *
 * **红线(工单 1.1),这三条破了这个功能就不成立:**
 *  · `rotation` 和 `zIndex` 是必填,不是可选装饰。
 *  · 布局层禁止 flex / grid / 任何自动排列 —— 位置只由 x/y 决定。
 *  · x/y 允许负值,也允许超过页面尺寸。
 */
export type JournalItem = {
  id: string;
  type: ItemType;

  // —— 自由坐标系,不是布局系统 ——
  /** 元素**中心**的 x,页面单位。可以是负数。 */
  x: number;
  /** 元素**中心**的 y,页面单位。可以超过 PAGE.h。 */
  y: number;
  /** scale=1 时的落地宽,页面单位。渲染宽 = w * scale。 */
  w: number;
  /** scale=1 时的落地高。文字元素由测量填回,不要手填。 */
  h: number;
  /** 角度,-180 ~ 180。见 wrapAngle。 */
  rotation: number;
  /** 用户捏合出来的倍数,SCALE_MIN ~ SCALE_MAX。 */
  scale: number;
  /** 层级。items 从 10 起递增(工单 2.3)。 */
  zIndex: number;

  /**
   * 材质与厚度。工单的 JournalItem 里没有,是本项目已有的字段,经确认保留。
   *
   * **阴影不能画死在素材里** —— 画死的话元素一旋转,阴影跟着转,
   * 光源就穿帮了。material 决定怎么打光,lift(离纸面高度,页宽千分比)
   * 决定阴影偏多远、多虚。留空则按 type 取默认值,见 materialOf。
   */
  material: Material;
  lift: number;

  payload: ItemPayload;
  /** 毫秒时间戳。 */
  createdAt: number;
};

// ─────────────────────────────────────────────────────────────
// 各 type 的 payload
// ─────────────────────────────────────────────────────────────

/**
 * 源图的原始像素尺寸。
 *
 * ⚠️ **和基类的 w/h 是两件事,别混。**
 *   · 基类 w/h  = 它在纸上多大(页面单位)
 *   · srcW/srcH = 源文件本身多少像素
 * 后者用来算长宽比、判断要不要缩图、第四批按高倍率导出时决定重采样。
 * 工单把两者都叫 w/h 挤在 payload 里,那样第四批没法区分「放大显示」和
 * 「有没有足够像素放大」。
 */
type SrcDims = { srcW: number; srcH: number };

export type PhotoPayload = SrcDims & {
  /** 素材库 id。**不是 uri** —— 见文件头偏离 6。 */
  assetId: string;
  caption?: string;
  frame: 'polaroid' | 'none';
};

/** 票根扫描件:撕边遮罩 + 投影,渲染成一张有厚度的纸片,不是矩形照片。 */
export type ScanPayload = SrcDims & {
  assetId: string;
  /** 扫描时识别出的票面信息,识别不出就留空。第三批填。 */
  recognized?: { dateISO?: string; amount?: number; currency?: string; raw?: string };
};

export const CUTOUT_STYLES = ['cut', 'sticker', 'silhouette', 'illus'] as const;
export type CutoutStyle = typeof CUTOUT_STYLES[number];

export type CutoutPayload = SrcDims & {
  assetId: string;
  /** alpha 遮罩也是一份素材。存 id 的理由同 assetId。 */
  maskAssetId: string;
  /**
   * 四种全部**本地、免费、无限量**(工单 3.3)。它们是手账的基础设施 ——
   * 用户不该为了贴一张照片犹豫。illus 是色阶压缩+描边,不是 AI 生成。
   */
  style: CutoutStyle;
};

export const STUB_KINDS = ['volcano', 'lake', 'river', 'mountain', 'sea', 'city'] as const;
export type StubKind = typeof STUB_KINDS[number];

/**
 * 打卡产物。
 *
 * **它不是徽章,是一张可以被拖、被压、被贴纸盖住一角的纸片**(工单 1.3)。
 * 数据上和照片平级 —— 不要做成成就系统的子集。
 */
export type StubPayload = {
  placeId: string;
  kind: StubKind;
  name: string;
  /** 同类打卡的第几个,从 1 起。显示成 "VOLCANO 04" 是渲染层的事。 */
  serial: number;
  dateISO: string;
};

/**
 * 词纸条 —— **言和所有旅行手账 App 的分界点**(工单 1.3)。
 *
 * 用户在某地用过/解锁的词,可以作为一张纸条贴进那一天。
 * `note` 是用户自己写的,**不是词卡释义** —— 词卡是词的定义,手账是词的传记。
 */
export type WordSlipPayload = {
  /**
   * 词库 id。见 wordIds.ts:词库原本没有稳定 id,进度键一直是「词-读音」。
   * 这次补了真 id,**旧键保留成永久别名,一条进度都没重写**。
   */
  wordId: string;
  /** 贴上去那一刻的字面快照。词库以后改了读音,这页仍是当时的样子。 */
  word: string;
  reading: string;
  note: string;
};

export type StampPayload = { top: string; center: string; bottom: string; color: string };
export type StickerPayload = { assetId: string };
export type TextPayload = {
  content: string;
  /**
   * 'hand' **只走系统字体栈,不内嵌手写字库**(工单 3.1)。
   * 一个同时覆盖中日的手写体 8–15MB,而且假手写比真打字更假 ——
   * 想要手写感就真的手写(strokes),打字就是打字的样子。
   */
  font: 'hand' | 'serif';
  size: number;
  color: string;
};
/** 长度用基类的 w,不另设 lengthPx —— 见文件头偏离 7。 */
export type TapePayload = { pattern: 'a' | 'b' | 'c' };

export type ItemPayload =
  | PhotoPayload | ScanPayload | CutoutPayload | StubPayload | WordSlipPayload
  | StampPayload | StickerPayload | TextPayload | TapePayload;

/** type 与 payload 的对应关系。窄化用,渲染层 switch 时靠它拿到正确的 payload 类型。 */
export type PayloadOf<T extends ItemType> =
  T extends 'photo' ? PhotoPayload :
  T extends 'scan' ? ScanPayload :
  T extends 'cutout' ? CutoutPayload :
  T extends 'stub' ? StubPayload :
  T extends 'wordSlip' ? WordSlipPayload :
  T extends 'stamp' ? StampPayload :
  T extends 'sticker' ? StickerPayload :
  T extends 'text' ? TextPayload :
  T extends 'tape' ? TapePayload :
  never;

/** 带窄化的元素。渲染层用 `item.type === 'photo'` 之后能直接拿到 PhotoPayload。 */
export type TypedItem<T extends ItemType = ItemType> =
  T extends ItemType ? Omit<JournalItem, 'type' | 'payload'> & { type: T; payload: PayloadOf<T> } : never;

// ─────────────────────────────────────────────────────────────
// 笔迹
// ─────────────────────────────────────────────────────────────

/**
 * 一个采样点。
 *
 * **t 必须存。** 有它才能回放书写过程,也才能在没有压力值时用速度反推笔锋
 * (工单 3.1:`max(0.9, 4.4 - 速度*0.22)`)。它几乎不占空间,
 * **现在不存以后补不回来** —— 老用户的笔迹没有时间轴,只能让他们重写。
 */
export type StrokePoint = {
  /** 页面单位,和 item 同一个坐标系。 */
  x: number;
  y: number;
  /** 压力 0~1。手指拿不到压力(3D Touch 早废了),填 0,由 t 反推速度。 */
  p: number;
  /** 毫秒时间戳,相对这一笔的起点。 */
  t: number;
};

/**
 * 一笔。
 *
 * **存点数组,不要存图片**(工单 1.5)。存了点以后:能改颜色、能回放、
 * 能按 300dpi 重画(第四批导出要用)、一页手写几 KB 而位图要几 MB。
 * 存成图片这些全没了,而且以后想加只能让老用户重写。
 */
export type Stroke = {
  id: string;
  color: string;
  /**
   * 橡皮也是一笔。
   *
   * 工单的 Stroke 没有这个字段,是加的〔用户 2026-08-14 批准〕。
   * 橡皮如果直接把像素擦掉,就**没法撤销,也没法回放** ——
   * 而「这一页是怎么被写出来的」正是 1.5 存点不存图的理由。
   * 渲染时 eraser 用 BlendMode.Clear,不是画白色(工单 3.1)。
   */
  tool: 'pen' | 'eraser';
  points: StrokePoint[];
};

// ─────────────────────────────────────────────────────────────
// 页 / 册
// ─────────────────────────────────────────────────────────────

export type PaperId = 'plain-cream' | 'dot-cream' | 'grid-white' | 'kraft-bag';

export type JournalPage = {
  id: string;
  /** 归属册子(手动)。空 = 散页。 */
  bookId: string | null;
  /** 归属城市(自动)。两套并存,见 JournalBook 的注释。 */
  cityId: string | null;
  /** 这页写的是哪天。 */
  dateISO: string | null;
  items: JournalItem[];
  /**
   * 笔迹是**页级**的,不是一种 item〔用户 2026-08-14 确认〕。
   *
   * 工单 1.3 的 payload 表里列了一行「strokes: 见 1.5」容易让人以为它是 item,
   * 但 2.3 要求笔迹层固定在 z=600、压在所有 item 之上、胶带(300)压不住它 ——
   * **只有页级才成立**。做成 item 的话它就有自己的 zIndex,会被拖到别的层去。
   */
  strokes: Stroke[];
  paper: PaperId;
  createdAt: number;
  updatedAt: number;
  /** 软删,永不硬删。 */
  deletedAt: number | null;
};

/**
 * 册子(手动组织)。
 *
 * **和按城市自动分格并存**〔用户 2026-08-14 选择〕。两者不是一回事:
 *   · cityId 是**自动**的 —— 照片有 GPS 就自动归格,材料架按城市分格,不用户操心。
 *   · bookId 是**手动**的 —— 用户自己决定「这是哪一趟旅行」,可以跨城市。
 * 一趟关西之旅横跨京都大阪奈良,自动分格分不出「这是一趟」,只有用户知道。
 *
 * **日常记录不做成第二套系统**(工单 1.4):日常 = bookId 为空的散页,
 * 可以随时被拖进某本册子。旅游是主线,日常是支线,结构上同一个东西。
 */
export type JournalBook = {
  id: string;
  title: string;
  coverAssetId: string | null;
  pageIds: string[];
  startISO: string | null;
  endISO: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

// ─────────────────────────────────────────────────────────────
// 导出(第四批用,第一批只留余地)
// ─────────────────────────────────────────────────────────────

/**
 * 导出规格。**第一批不写导出功能,只保证渲染层不把 1x 写死。**
 *
 * 工单第四批预告对第一批的唯一要求就是这三条:
 *   · 按 CANVAS 出图(连溢出到纸外的部分一起),不按 PAGE 裁
 *   · 倍率可配置,别把 1x 写进渲染逻辑
 *   · 笔迹是点数组,所以能按任意分辨率重绘
 * 前两条如果没留,第四批要动渲染层。
 */
export type ExportSpec = {
  /** 1 = 页面单位 1:1。屏幕档约 1.5,高清档 3 或更高。 */
  pixelRatio: number;
  /** 默认按画布(含溢出)。设 'page' 才裁到纸边。 */
  bounds: 'canvas' | 'page';
};

export const EXPORT_SCREEN: ExportSpec = { pixelRatio: 1.5, bounds: 'canvas' };
export const EXPORT_HIRES: ExportSpec = { pixelRatio: 3, bounds: 'canvas' };

export function exportPixelSize(spec: ExportSpec) {
  const r = spec.bounds === 'page' ? { w: PAGE.w, h: PAGE.h } : { w: CANVAS.w, h: CANVAS.h };
  return { width: Math.round(r.w * spec.pixelRatio), height: Math.round(r.h * spec.pixelRatio) };
}

// ─────────────────────────────────────────────────────────────
// 小工具
// ─────────────────────────────────────────────────────────────

/**
 * 把角度收进 -180~180。
 *
 * ⚠️ **必须有。** 松手时每次叠加 ±1.5° 的随机抖动(工单 2.2),
 * 一个元素被拖上几百次之后 rotation 会漂出工单规定的范围。
 * 不收的话第四批导出时某些渲染路径会对 >360° 的角度算错。
 */
export function wrapAngle(deg: number): number {
  let a = ((deg + 180) % 360 + 360) % 360 - 180;
  if (a === -180) a = 180;
  return a;
}

export const clampScale = (s: number) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, s));

/**
 * 元素的四个角在页面坐标系里的位置(已应用旋转和缩放)。
 *
 * 命中测试、包围盒、导出全走这里 —— **这就是 w/h 必须在基类上的原因**:
 * 这个函数不知道也不该知道自己算的是照片还是词纸条。
 */
export function itemCorners(item: Pick<JournalItem, 'x' | 'y' | 'w' | 'h' | 'rotation' | 'scale'>) {
  const hw = (item.w * item.scale) / 2;
  const hh = (item.h * item.scale) / 2;
  const rad = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return ([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as const).map(([dx, dy]) => ({
    x: item.x + dx * cos - dy * sin,
    y: item.y + dx * sin + dy * cos,
  }));
}

/** 轴对齐包围盒。导出时要把所有元素的包围盒并起来,才知道溢出了多少。 */
export function itemBounds(item: Parameters<typeof itemCorners>[0]) {
  const c = itemCorners(item);
  const xs = c.map(p => p.x), ys = c.map(p => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/**
 * 一个点在不在元素里。
 *
 * 做法是把点**反向旋转**到元素自己的坐标系,再当成没转过的矩形来判断。
 * 这比算四条边的叉积短,也不会在 scale 很小时出现浮点边界问题。
 */
export function hitTest(item: Parameters<typeof itemCorners>[0], px: number, py: number): boolean {
  const rad = (-item.rotation * Math.PI) / 180;
  const dx = px - item.x, dy = py - item.y;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(lx) <= (item.w * item.scale) / 2 && Math.abs(ly) <= (item.h * item.scale) / 2;
}

/** 命中最上面的那个。**从 zIndex 高的往低的找** —— 否则点重叠处会选中被压住的那个。 */
export function pickTop<T extends Parameters<typeof itemCorners>[0] & { zIndex: number }>(
  items: readonly T[], px: number, py: number,
): T | null {
  let best: T | null = null;
  for (const it of items) {
    if (!hitTest(it, px, py)) continue;
    if (!best || it.zIndex > best.zIndex) best = it;
  }
  return best;
}
