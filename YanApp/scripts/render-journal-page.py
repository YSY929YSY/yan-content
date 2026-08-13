"""一页手账的静态渲染 —— 验证「自然感」来自哪。

这一版要证明的是三件贴图本身给不了的东西:
  1. 页面有边界:毛边、纸的厚度、页底下的投影
  2. 光是全局的:所有元素共享一个光源,阴影方向和软硬一致
  3. 元素有厚度:贴纸浮得高、票根薄、胶带几乎贴在纸上 —— 三种投影不一样

外加一条产品要求:元素可以**越过页边**落到桌面上,越界部分的投影打在桌面而不是纸上。

页面不拍平:这里每个元素都是「在哪 / 多大 / 什么材质 / 多厚」,
渲染时才算光影。同一份数据换 300dpi 再渲一遍就是可打印的稿子。

## 这是什么、不是什么

**是**设计验证图 —— 用 Python 先把「一页纸该长什么样」画对,再照着实现 Skia 那一版
(`src/features/journal/JournalPage.js` + `journalRender.js`)。RN 里调一次要重编译,
这里改个数字重跑一次就看得见,所以美术判断都在这儿做完。

**不是**运行时代码,也不是 JournalPage 的测试基准 —— 两边是各自实现的,
像素不会对齐。它是「目标长这样」的参照物。

## 怎么跑

依赖 numpy + Pillow,和 `generate-paper.py` 同一套(见那份的 docstring)。
另外要 `assets/fonts/LXGWWenKai-Regular.ttf` 在位,和 macOS 系统字体。

    /tmp/paper-venv/bin/python YanApp/scripts/render-journal-page.py --out /tmp/page.jpg
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

CW, CH = 1700, 2800          # 桌面画布
PW, PH = 1340, 2280          # 一页纸
PX, PY = (CW - PW) // 2, (CH - PH) // 2
PAGE_ROT = -1.1              # 本子不会摆得正正的

LIGHT = (-0.55, -0.83)       # 全局光方向(左上打下来),所有阴影都按它偏移
rng = np.random.default_rng(5)

F = '/System/Library/Fonts/Supplemental/'          # macOS 系统字体,这个脚本只在 mac 上跑

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # YanApp/
WENKAI = os.path.join(APP, 'assets', 'fonts', 'LXGWWenKai-Regular.ttf')


def font(name, size):
    try:
        return ImageFont.truetype(F + name, size)
    except OSError:
        return ImageFont.load_default()


def wenkai(size):
    """霞鹜文楷:楷体手写感,46490 字,中/日/西一套全覆盖(含假名和西语重音)。
    SIL OFL,允许嵌入 App 分发 —— 这一条才是能不能用的判据,「免费商用」四个字不够。"""
    return ImageFont.truetype(WENKAI, size)


def np_blur(a, r):
    lo, hi = float(a.min()), float(a.max())
    if hi - lo < 1e-9:
        return a.copy()
    n = (a - lo) / (hi - lo)
    im = Image.fromarray((n * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
    return np.asarray(im).astype(np.float32) / 255 * (hi - lo) + lo


def fbm(h, w, octaves=4, base=300):
    out = np.zeros((h, w), np.float32)
    amp, size = 1.0, base
    for _ in range(octaves):
        a = rng.random((max(2, int(h / size * 4)), max(2, int(w / size * 4)))).astype(np.float32)
        im = Image.fromarray((a * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        out += amp * (np.asarray(im).astype(np.float32) / 255)
        amp *= 0.5
        size /= 2
    return (out - out.min()) / (out.max() - out.min())


# ─────────────────────────────────────────────────────────────
# 阴影:厚度 → 偏移和模糊。这是「层次」的全部来源。
# 一个 1mm 厚的贴纸和一条几乎没厚度的胶带,阴影完全不同 ——
# 把两者画成同一种柔和阴影,就是所有拼贴 App 看起来平的原因。
# ─────────────────────────────────────────────────────────────
def drop_shadow(canvas, shape_alpha, lift, opacity=0.42):
    """lift:元素离纸面多高(px)。偏移 ∝ lift,模糊 ∝ lift。"""
    off = (int(LIGHT[0] * lift * -1.6), int(LIGHT[1] * lift * -1.6))
    blur = max(1.2, lift * 0.9)
    sh = shape_alpha.filter(ImageFilter.GaussianBlur(blur))
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    tint = Image.new('RGBA', canvas.size, (38, 28, 18, int(255 * opacity)))
    layer.paste(tint, off, sh)
    return Image.alpha_composite(canvas, layer)


def paste_item(canvas, img, pos, *, lift, rot=0.0, shadow=True):
    """把一个元素放上去:先投影再放本体,顺序不能反。"""
    if rot:
        img = img.rotate(rot, resample=Image.BICUBIC, expand=True)
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    layer.paste(img, pos, img)
    if shadow:
        canvas = drop_shadow(canvas, layer.split()[3], lift)
    return Image.alpha_composite(canvas, layer)


# ─────────────────────────────────────────────────────────────
# 素材
# ─────────────────────────────────────────────────────────────
def real_paper(w, h, name):
    """读 `assets/paper/` 里那张**真图**,和 App 看到的是同一张。

    在这之前这个脚本用的是下面 `kraft()` —— paper_gen 的精简重实现。
    也就是说验证图验的是**另一套纸**:调它调得再好看,App 里也不是那个样子。
    2026-08-13 改掉:换纸样只要换名字,而且所见即所得。

    `kraft()` 保留着,给「想快速试一组还没生成的参数」用。
    """
    path = os.path.join(APP, 'assets', 'paper', f'{name}.jpg')
    im = Image.open(path).convert('RGB')
    # 纸样是 1400x2400,这里的页面尺寸不一定一样 —— 按覆盖裁,别拉伸变形
    src_r, dst_r = im.width / im.height, w / h
    if src_r > dst_r:
        nw = int(im.height * dst_r)
        im = im.crop(((im.width - nw) // 2, 0, (im.width + nw) // 2, im.height))
    else:
        nh = int(im.width / dst_r)
        im = im.crop((0, (im.height - nh) // 2, im.width, (im.height + nh) // 2))
    return im.resize((w, h), Image.LANCZOS).convert('RGBA')


def kraft(w, h, base=(198, 158, 108), crumple=40, seed=3):
    """牛皮纸(paper_gen 的精简版,参数同源)。**渲染正式页用 real_paper**,
    这个只在想试还没生成出来的参数时用。"""
    global rng
    rng = np.random.default_rng(seed)
    v = np.ones((h, w), np.float32)
    for sx, sy, k in ((1.0, 12, 1.0), (12, 1.0, 0.55), (1, 1, 0.35)):
        a = rng.random((max(2, int(h / sy)), max(2, int(w / sx)))).astype(np.float32)
        im = Image.fromarray((a * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        v += 0.055 * k * (np_blur(np.asarray(im).astype(np.float32) / 255, 0.5) - 0.5) * 2
    v += 0.035 * (fbm(h, w, 2, 1400) - 0.5) * 2

    pos, neg = Image.new('L', (w, h), 0), Image.new('L', (w, h), 0)
    dp, dn = ImageDraw.Draw(pos), ImageDraw.Draw(neg)
    def edge():
        s = rng.integers(0, 4)
        if s == 0: return (rng.uniform(-40, w + 40), -40)
        if s == 1: return (rng.uniform(-40, w + 40), h + 40)
        if s == 2: return (-40, rng.uniform(-40, h + 40))
        return (w + 40, rng.uniform(-40, h + 40))
    for _ in range(crumple):
        # 不再是贯通整页的弦 —— 那个在纸上读成尺子划的直线。
        # 真揉痕有始有终,长度随机,方向随机。
        a = np.array(edge())
        b = np.array(edge())
        t0, t1 = sorted(rng.uniform(0.05, 0.95, 2))
        p0, p1 = a + (b - a) * t0, a + (b - a) * t1
        (dp if rng.random() < 0.5 else dn).line(
            [tuple(p0), tuple(p1)], fill=int(rng.uniform(90, 210)), width=int(rng.integers(2, 4)))
    hp = np.asarray(pos.filter(ImageFilter.GaussianBlur(7))).astype(np.float32) / 255
    hn = np.asarray(neg.filter(ImageFilter.GaussianBlur(7))).astype(np.float32) / 255
    hh = hp - hn + 0.22 * (fbm(h, w, 3, 420) - 0.5)
    gy, gx = np.gradient(hh)
    g = LIGHT[0] * gx + LIGHT[1] * gy
    peak = np.abs(g).max()
    shade = g / peak if peak > 1e-9 else g
    v += shade * 0.105 + np.clip(shade, 0, None) * 0.075

    # 纸屑
    fl = Image.new('L', (w, h), 128)
    d = ImageDraw.Draw(fl)
    for _ in range(2600):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        ang, ln = rng.normal(np.pi / 2, 0.7), rng.uniform(2, 9)
        d.line([(x, y), (x + ln * np.cos(ang), y + ln * np.sin(ang))],
               fill=max(0, min(255, 128 + int(rng.normal(0, 16)))), width=1)
    v += (np.asarray(fl.filter(ImageFilter.GaussianBlur(0.4))).astype(np.float32) - 128) / 255 * 1.1

    img = np.clip(v, 0.55, 1.4)[..., None] * (np.array(base, np.float32) / 255)[None, None, :]
    warm = np.clip((v - 1) * 1.6, -1, 1)[..., None]
    img += warm * np.array([0.045, 0.018, -0.012], np.float32)[None, None, :]
    return Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).convert('RGBA')


def deckle_mask(w, h, jitter=1.7, corner=10):
    """毛边:纸的边不是直线。没有这个,页面边缘一眼是矩形贴图。"""
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    pts = []
    steps = 90
    for i in range(steps):                       # 上
        pts.append((w * i / steps, rng.normal(0, jitter) + corner * 0.2))
    for i in range(steps):                       # 右
        pts.append((w - abs(rng.normal(0, jitter)) - 1, h * i / steps))
    for i in range(steps):                       # 下
        pts.append((w - w * i / steps, h - abs(rng.normal(0, jitter)) - 1))
    for i in range(steps):                       # 左
        pts.append((abs(rng.normal(0, jitter)), h - h * i / steps))
    d.polygon(pts, fill=255)
    return m.filter(ImageFilter.GaussianBlur(0.7))


def photo(w, h, hue=(96, 118, 132), border=True):
    """占位照片:抽象色块 + 颗粒。这一版验证的是纸和层次,不是照片内容。"""
    # 占位图也要有构图:天/地两带 + 起伏的地平线。
    # 纯噪声云团会被读成烟,那样评判的就不是纸和层次了。
    g = fbm(h, w, 5, 260)
    g2 = fbm(h, w, 3, 90)
    yy0, xx0 = np.mgrid[0:h, 0:w].astype(np.float32)
    horizon = h * 0.58 + (fbm(h, w, 2, 700)[0] - 0.5) * h * 0.06
    sky = (yy0 < horizon[None, :])
    a = (g * 0.7 + g2 * 0.3)
    a = np.where(sky, 0.55 + a * 0.5, 0.22 + a * 0.42)
    a = np.stack([a] * 3, -1)
    tint = np.array(hue, np.float32) / 255
    img = np.clip(a * 1.25 * tint + 0.06, 0, 1)
    img = np.where(sky[..., None], img * np.array([1.02, 1.04, 1.10]), img * np.array([1.06, 0.98, 0.86]))
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    vig = 1 - 0.35 * (((xx / w - .5) ** 2 + (yy / h - .5) ** 2) * 3)
    img *= np.clip(vig, 0, 1)[..., None]
    img += rng.normal(0, 0.012, img.shape)
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    if not border:
        return im
    # 白边:参考图里牛皮纸上的照片全部带白边 —— 彩色照片直接贴棕底上会显脏
    b = 26
    card = Image.new('RGBA', (w + b * 2, h + b * 2 + 20), (250, 247, 240, 255))
    card.paste(im, (b, b))
    return card


def ticket(w, h):
    """票根:浅色薄纸 + 印刷痕迹 + 一侧齿孔。"""
    base = np.ones((h, w, 3), np.float32) * np.array([0.94, 0.92, 0.87], np.float32)
    base -= (fbm(h, w, 3, 200)[..., None] - 0.5) * 0.05
    im = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    d = ImageDraw.Draw(im)
    d.rectangle([10, 10, w - 10, h - 10], outline=(120, 110, 96, 90), width=1)
    fnt = font('Georgia.ttf', 21)
    d.text((26, 30), 'ADMIT  ONE', font=fnt, fill=(70, 62, 52, 230))
    d.text((26, 66), 'NO. 0413 · 19:30', font=font('Georgia.ttf', 15), fill=(110, 100, 88, 220))
    for i in range(7):                                   # 印刷线,当作正文
        y = 100 + i * 17
        d.line([(26, y), (26 + rng.uniform(0.45, 0.9) * (w - 60), y)],
               fill=(120, 112, 100, 120), width=2)
    for y in range(14, h - 10, 22):                      # 齿孔
        d.ellipse([w - 20, y, w - 8, y + 12], fill=(0, 0, 0, 0))
    return im


def tape(w, h, color=(214, 192, 150, 214)):
    """胶带:半透明,边缘是撕的不是切的,厚度几乎为零。"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pts_top = [(x, abs(rng.normal(0, 2.2))) for x in range(0, w, 7)]
    pts_bot = [(x, h - abs(rng.normal(0, 2.2))) for x in range(w, 0, -7)]
    d.polygon(pts_top + pts_bot, fill=color)
    # 纵向纤维 + 一道高光,不然像塑料片
    for x in range(0, w, 3):
        d.line([(x, 0), (x, h)], fill=(255, 255, 255, int(rng.uniform(0, 22))), width=1)
    d.line([(0, h * 0.35), (w, h * 0.35)], fill=(255, 255, 255, 30), width=int(h * 0.18))
    return im


# ─────────────────────────────────────────────────────────────
# 桌面
# ─────────────────────────────────────────────────────────────
def desk():
    g = fbm(CH, CW, 4, 260)
    base = np.array([0.107, 0.094, 0.082], np.float32)
    img = (0.82 + 0.36 * g)[..., None] * base
    img += rng.normal(0, 0.006, img.shape)
    yy, xx = np.mgrid[0:CH, 0:CW].astype(np.float32)
    # 桌面上的光也来自同一个方向
    lit = 1.0 - 0.22 * ((xx / CW) * -LIGHT[0] + (yy / CH) * -LIGHT[1])
    img *= np.clip(lit, 0, 2)[..., None]
    return Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).convert('RGBA')


def build(out_path='page.jpg', paper='kraft-bag', under='kraft-dark'):
    global PAPER, UNDER_PAPER
    PAPER, UNDER_PAPER = paper, under
    global rng
    canvas = desk()

    # ── 本子:底下垫两层错开的纸,这是「厚度」
    for i, (dx, dy, dim) in enumerate([(7, 9, 0.72), (4, 5, 0.86)]):
        rng = np.random.default_rng(30 + i)
        under = real_paper(PW, PH, UNDER_PAPER)
        under.putalpha(deckle_mask(PW, PH, jitter=2.1))
        under = Image.eval(under, lambda v: int(v * dim))
        under = under.rotate(PAGE_ROT + rng.uniform(-0.6, 0.6), resample=Image.BICUBIC, expand=True)
        canvas = paste_item(canvas, under, (PX + dx, PY + dy), lift=10, shadow=(i == 0))

    rng = np.random.default_rng(3)
    page = real_paper(PW, PH, PAPER)
    page.putalpha(deckle_mask(PW, PH, jitter=1.7))
    page = page.rotate(PAGE_ROT, resample=Image.BICUBIC, expand=True)
    canvas = paste_item(canvas, page, (PX, PY), lift=16, shadow=True)

    # ── 日期:唯一固定位的元素(参考图里几乎每页都有,手写、小、不装饰)
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.text((PX + PW - 250, PY + 74), '8 · 11', font=font('Bradley Hand Bold.ttf', 46),
           fill=(62, 48, 34, 205))
    canvas = Image.alpha_composite(canvas, layer)

    # ── 主锚:一大张带白边的照片。参考图里每页都有一个占 40% 以上的主元素
    ph = photo(700, 520)
    canvas = paste_item(canvas, ph, (PX + 90, PY + 210), lift=7, rot=1.8)

    # 压角的胶带:胶带是「钉子」,压在元素交界处,不是拿来填空白的
    canvas = paste_item(canvas, tape(210, 52), (PX + 40, PY + 190), lift=1.5, rot=-24)
    canvas = paste_item(canvas, tape(190, 48), (PX + 690, PY + 690), lift=1.5, rot=8)

    # ── 越界的票根:一半在纸上,一半落到桌面
    # 这是「延展到本子外面」的最小验证 —— 数据上只是 x 没有被限制在页内,
    # 视觉上越界那半截的投影打在桌面,层次一下就出来了
    tk = ticket(360, 250)
    canvas = paste_item(canvas, tk, (PX + PW - 210, PY + 830), lift=4, rot=-6)

    # ── 第二张小照片 + 一张扫描小画当贴纸(浮得最高)
    canvas = paste_item(canvas, photo(330, 330, hue=(150, 126, 96)), (PX + 120, PY + 900),
                        lift=6, rot=-2.4)
    canvas = paste_item(canvas, photo(430, 320, hue=(126, 132, 112)), (PX + 620, PY + 1480),
                        lift=6, rot=2.1)
    canvas = paste_item(canvas, tape(170, 46), (PX + 590, PY + 1455), lift=1.5, rot=-14)
    canvas = paste_item(canvas, ticket(300, 200), (PX + 120, PY + 1700), lift=4, rot=3.2)
    sticker = photo(190, 190, hue=(196, 176, 140), border=False)
    m = Image.new('L', sticker.size, 0)
    ImageDraw.Draw(m).ellipse([6, 6, 184, 184], fill=255)
    sticker.putalpha(m.filter(ImageFilter.GaussianBlur(0.6)))
    canvas = paste_item(canvas, sticker, (PX + 560, PY + 1120), lift=13, rot=6)

    # ── 手写块:参考图里文字总是成块塞在缝里,不是均匀写满
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    fnt = font('Bradley Hand Bold.ttf', 30)
    lines = ['第一次自己办入住。', '前台听懂了，我说的那句话。',
             'チェックインをお願いします。', '¿Dónde está la estación?']
    for i, line in enumerate(lines):
        d.text((PX + 150, PY + 1280 + i * 50), line, font=wenkai(34), fill=(58, 44, 30, 220))
    canvas = Image.alpha_composite(canvas, layer)

    # ── 收尾:全局颗粒 + 暗角。
    # 这一步把所有元素统一进同一张「照片」里 —— 少了它,元素各是各的。
    a = np.asarray(canvas).astype(np.float32)
    a[..., :3] += rng.normal(0, 2.6, a[..., :3].shape)
    yy, xx = np.mgrid[0:CH, 0:CW].astype(np.float32)
    vig = 1 - 0.30 * (((xx / CW - .5) ** 2 + (yy / CH - .5) ** 2) * 2.4)
    a[..., :3] *= np.clip(vig, 0, 1)[..., None]
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGB')
    out.save(out_path, quality=90, optimize=True)
    return out_path


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='渲染一页手账的设计验证图')
    ap.add_argument('--out', default='page.jpg', help='输出 jpg 路径(默认当前目录 page.jpg)')
    ap.add_argument('--paper', default='kraft-bag', help='纸样名(assets/paper/ 里的文件名)')
    ap.add_argument('--under', default='kraft-dark', help='垫在下面那两层的纸样')
    args = ap.parse_args()
    print(build(out_path=args.out, paper=args.paper, under=args.under))
