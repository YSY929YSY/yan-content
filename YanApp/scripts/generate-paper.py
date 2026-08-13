"""程序化生成 assets/paper/ 里的三张牛皮纸底纹。

不是 CSS 渐变糊出来的那种 —— 是一层层按真纸的成因叠:
纤维(各向异性噪声)→ 长纤维碎屑 → 云斑(打浆不均)→ 折痕(带方向光的脊)
→ 边缘磨损 → 光照不均 → foxing 斑。

输出 1400x2400,一页手账正好铺满,不平铺就没有接缝。

## 怎么跑

依赖只有 numpy 和 Pillow,不进 package.json(这是构建期资产生成,不是运行时依赖):

    python3 -m venv /tmp/paper-venv
    /tmp/paper-venv/bin/pip install numpy Pillow
    /tmp/paper-venv/bin/python YanApp/scripts/generate-paper.py

默认直接覆盖 `YanApp/assets/paper/`。想先看结果再决定就给 `--out`:

    ... generate-paper.py --out /tmp/paper-preview

## 为什么这个脚本必须在仓库里

三张纸是**程序化**生成的,不是找来的图。没有脚本就只剩三张 jpg:
换纸样尺寸、加第四档颜色、出 300dpi 打印版(见 journal-data-design.md「页面永不拍平」)
全都做不了,只能从头再调一遍参数 —— 而参数是对着参考图调了三版才对的,
注释里记的那些「第一版为什么错」是这次调参的全部产出。

## 可复现性

每一档都钉了 `seed`,同一套 numpy/Pillow 下逐字节可复现。
**跨版本不保证** —— Pillow 的 `GaussianBlur` / `BICUBIC` 实现变过。
所以是「改参数重出一套」的工具,不是「校验现有 jpg 有没有被改过」的工具。
最后一次出图用的是 numpy 2.0.2 + Pillow 11.3.0。
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1400, 2400
rng = np.random.default_rng(7)

# 默认落回 assets/paper/,不落在当前工作目录 —— 免得在仓库根跑一次就散一地 png
DEFAULT_OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'paper')


def blur(a, r):
    """用 PIL 的高斯模糊,免装 scipy。"""
    lo, hi = a.min(), a.max()
    if hi - lo < 1e-9:
        return a.copy()
    n = (a - lo) / (hi - lo)
    im = Image.fromarray((n * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
    return np.asarray(im).astype(np.float32) / 255 * (hi - lo) + lo


def noise(h, w, r=0):
    a = rng.random((h, w)).astype(np.float32)
    return blur(a, r) if r else a


def stretched(h, w, sx, sy, r=0.6):
    """各向异性噪声:在小图上生成再拉伸 —— 纸的纤维是有方向的。"""
    a = noise(max(2, int(h / sy)), max(2, int(w / sx)))
    im = Image.fromarray((a * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    return blur(np.asarray(im).astype(np.float32) / 255, r)


def fbm(h, w, octaves=5, base=200):
    """多倍频噪声:云斑。真纸的深浅不均是打浆和干燥留下的,尺度很大。"""
    out = np.zeros((h, w), np.float32)
    amp, size = 1.0, base
    for _ in range(octaves):
        a = noise(max(2, int(h / size * 4)), max(2, int(w / size * 4)))
        im = Image.fromarray((a * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        out += amp * (np.asarray(im).astype(np.float32) / 255)
        amp *= 0.5
        size /= 2
    return (out - out.min()) / (out.max() - out.min())


def crease_light(lines, width=3, soft=9, theta=-0.7):
    """折痕。

    这是整张纸里最值钱的一层 —— 参考图里那张纸袋,价值全在那道横折上,
    它是「这张纸被人手折过、装过东西」的证据。纯纤维颗粒反而最像假的。

    做法:画线 → 模糊成脊 → 取梯度当法线 → 打一道方向光。
    脊的一侧亮、一侧暗,这才有立体感;直接画一条深色线只会像铅笔道。
    """
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    for pts, w_ in lines:
        d.line(pts, fill=255, width=w_ or width)
    r = np.asarray(m.filter(ImageFilter.GaussianBlur(soft))).astype(np.float32) / 255
    gy, gx = np.gradient(r)
    g = np.cos(theta) * gx + np.sin(theta) * gy
    # 归一化:模糊之后梯度绝对值只有千分之几,不归一化这层等于没有 —— 第一版就是这么丢的
    peak = np.abs(g).max()
    return g / peak if peak > 1e-9 else g


def crumple_shade(n_lines=70, soft=7, theta=-0.7, facet=0.22):
    """揉皱:整页的高度场,不是几道折痕。

    第一版做错的地方:在一张平纸上画了三五条线。参考图里那张(揉过再展开的牛皮纸)
    是**整页密布的棱面** —— 纸被攥成一团再摊开,折线互相切割,把页面分成几十个
    多边形小面,每个面是平的,交界处是脊或谷。

    做法:
      1. 几十条横贯整页的弦(不是短线段 —— 短的切不出面)
      2. 每条随机当脊或谷,分别累加再模糊 → 高度场 h
      3. 对 h 取梯度当法线,打方向光 → 脊的一侧亮一侧暗
      4. 叠一层低频起伏,免得每个面平得像折纸
    """
    pos = Image.new('L', (W, H), 0)
    neg = Image.new('L', (W, H), 0)
    dp, dn = ImageDraw.Draw(pos), ImageDraw.Draw(neg)

    def edge_point():
        """页面边界(略微出界)上的随机点 —— 弦必须贯穿整页。"""
        s = rng.integers(0, 4)
        if s == 0:   return (rng.uniform(-40, W + 40), -40)
        if s == 1:   return (rng.uniform(-40, W + 40), H + 40)
        if s == 2:   return (-40, rng.uniform(-40, H + 40))
        return (W + 40, rng.uniform(-40, H + 40))

    for _ in range(n_lines):
        a, b = np.array(edge_point()), np.array(edge_point())
        # 折痕是**弯的**。第三版画的是笔直的弦,几十条直线互相交叉,
        # 眼睛立刻读成网格 —— 用户的原话是「太横平竖直」。
        # 真纸的折痕受纤维走向影响会缓慢偏移,所以沿弦取若干控制点、
        # 每个点朝法线方向推开一点,再连成折线。
        n = int(rng.integers(4, 8))
        t = np.linspace(0, 1, n)
        pts = a[None, :] + (b - a)[None, :] * t[:, None]
        d_vec = b - a
        L = np.hypot(*d_vec) or 1.0
        normal = np.array([-d_vec[1], d_vec[0]]) / L
        # 中间弯得多、两端收住(端点钉在页边上),幅度按线长走
        bow = np.sin(t * np.pi) * rng.normal(0, L * 0.045, n)
        pts = pts + normal[None, :] * bow[:, None]
        d = dp if rng.random() < 0.5 else dn
        d.line([tuple(map(float, q)) for q in pts],
               fill=int(rng.uniform(110, 255)), width=int(rng.integers(2, 5)),
               joint='curve')

    hp = np.asarray(pos.filter(ImageFilter.GaussianBlur(soft))).astype(np.float32) / 255
    hn = np.asarray(neg.filter(ImageFilter.GaussianBlur(soft))).astype(np.float32) / 255
    h = hp - hn
    h += facet * (fbm(H, W, 3, 420) - 0.5)      # 面不能是绝对平的

    gy, gx = np.gradient(h)
    g = np.cos(theta) * gx + np.sin(theta) * gy
    peak = np.abs(g).max()
    return g / peak if peak > 1e-9 else g


def rand_polyline(n=5, horizontal=True, margin=0.12):
    """随机折线。横折走整页,斜折从边缘出发 —— 真纸的折痕不会停在页面中央。"""
    if horizontal:
        y = rng.uniform(H * margin, H * (1 - margin))
        xs = np.linspace(-20, W + 20, n)
        ys = y + rng.normal(0, H * 0.012, n)
    else:
        x = rng.uniform(W * margin, W * (1 - margin))
        ys = np.linspace(-20, H + 20, n)
        xs = x + rng.normal(0, W * 0.02, n)
    return [(float(a), float(b)) for a, b in zip(xs, ys)]


def make(name, base_rgb, *, out_dir=DEFAULT_OUT, keep_png=False,
         fiber=0.055, cloud=0.04, creases=3, crumple=0,
         crumple_depth=0.16, flecks=1500, hairs=90, stains=3, foxing=18,
         wear=0.55, crease_depth=0.10, seed=7):
    global rng
    rng = np.random.default_rng(seed)

    # ── 明度层(先做灰度,最后再上色 —— 纸的颜色是染出来的,纹理是纸本身的)
    v = np.ones((H, W), np.float32)

    # 纤维:两个方向叠,竖向为主(抄纸时纤维顺着流浆方向排)
    v += fiber * (stretched(H, W, 1.0, 14, 0.5) - 0.5) * 2
    v += fiber * 0.55 * (stretched(H, W, 14, 1.0, 0.5) - 0.5) * 2
    v += fiber * 0.35 * (noise(H, W, 0.4) - 0.5) * 2

    # 云斑:只要**大尺度**的深浅不均。中频一强就成迷彩,那是皮子不是纸。
    v += cloud * (fbm(H, W, 2, 1400) - 0.5) * 2

    # 长纤维碎屑:牛皮纸里能看见的草梗、木丝。
    # 短、多、低对比 —— 长而黑的会读成毛发或松针。
    fl = Image.new('L', (W, H), 128)
    d = ImageDraw.Draw(fl)
    for _ in range(flecks):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        ang = rng.normal(np.pi / 2, 0.7)
        ln = rng.uniform(2, 9)
        c = 128 + int(rng.normal(0, 16))
        d.line([(x, y), (x + ln * np.cos(ang), y + ln * np.sin(ang))],
               fill=max(0, min(255, c)), width=1)
    v += (np.asarray(fl.filter(ImageFilter.GaussianBlur(0.4))).astype(np.float32) - 128) / 255 * 1.1

    # 毛丝:纸面上翘起来的长纤维,浅色、细、带弧度。
    # 参考图里那张软牛皮纸上到处是这种丝,它是「手工/再生纸」最直接的信号。
    if hairs:
        hr = Image.new('L', (W, H), 128)
        d = ImageDraw.Draw(hr)
        for _ in range(hairs):
            x, y = rng.uniform(0, W), rng.uniform(0, H)
            ang = rng.uniform(0, 2 * np.pi)
            pts = [(x, y)]
            for _ in range(rng.integers(3, 7)):
                ang += rng.normal(0, 0.45)
                ln = rng.uniform(12, 40)
                x, y = x + ln * np.cos(ang), y + ln * np.sin(ang)
                pts.append((x, y))
            d.line(pts, fill=128 + int(rng.normal(0, 30)), width=1)
        v += (np.asarray(hr.filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32) - 128) / 255 * 1.4

    # 折痕 + 揉痕
    folds = [(rand_polyline(6, horizontal=(i % 2 == 0)), rng.integers(2, 5))
             for i in range(creases)]
    if folds:
        v += crease_light(folds) * crease_depth

    # 揉皱:整页棱面
    shade = None
    if crumple > 0:
        shade = crumple_shade(n_lines=int(crumple))
        v += shade * crumple_depth

        # 磨损跟着棱走 —— 脊顶是最先被磨白的地方。
        # 这条是物理真实:纸团摊开后,凸起处先掉色、纤维起毛,凹处保留原色。
        ridge = np.clip(shade, 0, None)
        v += ridge * 0.16 * wear

    # 边缘磨损:四边略暗、略脏,页角更明显
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ex = np.minimum(xx, W - 1 - xx) / (W * 0.5)
    ey = np.minimum(yy, H - 1 - yy) / (H * 0.5)
    edge = np.clip(np.minimum(ex, ey) * 3.2, 0, 1)
    v -= (1 - edge) * 0.16 * wear

    # 光照不均:大尺度,很淡。完全均匀的纸一眼假
    v += 0.05 * (blur(noise(24, 14), 6) [0:1, 0:1].mean() * 0 + (fbm(H, W, 2, 900) - 0.5)) * 2

    # ── 上色
    base = np.array(base_rgb, np.float32) / 255
    img = np.clip(v, 0.55, 1.4)[..., None] * base[None, None, :]

    # 色偏:亮处偏黄、暗处偏红棕 —— 牛皮纸的颜色不是单一色乘明度
    warm = np.clip((v - 1) * 1.6, -1, 1)[..., None]
    img += warm * np.array([0.045, 0.018, -0.012], np.float32)[None, None, :]

    # 污渍:手汗、茶渍、说不清的脏。大、淡、边缘不规则。
    # 「太干净」的第一元凶其实是它 —— 一张用过的纸不会通体均匀。
    if stains:
        st = np.zeros((H, W), np.float32)
        for _ in range(stains):
            m = fbm(H, W, 3, 700)
            cx, cy = rng.uniform(0.1, 0.9), rng.uniform(0.1, 0.9)
            yy2, xx2 = np.mgrid[0:H, 0:W].astype(np.float32)
            r2 = ((xx2 / W - cx) ** 2 + (yy2 / H - cy) ** 2) / rng.uniform(0.01, 0.06)
            st += np.clip(1 - r2, 0, 1) * (m > 0.5)
        st = blur(np.clip(st, 0, 1), 18)
        img -= st[..., None] * np.array([0.05, 0.065, 0.085], np.float32)[None, None, :]

    # foxing:氧化的锈斑,几点就够
    fox = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(fox)
    for _ in range(foxing):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r_ = rng.uniform(3, 13)
        d.ellipse([x - r_, y - r_, x + r_, y + r_], fill=int(rng.uniform(40, 130)))
    f = np.asarray(fox.filter(ImageFilter.GaussianBlur(5))).astype(np.float32) / 255
    img -= f[..., None] * np.array([0.10, 0.14, 0.19], np.float32)[None, None, :] * 0.9

    # 棱顶掉色:磨白的地方饱和度也低,不只是变亮
    if shade is not None:
        ridge = np.clip(shade, 0, None)[..., None]
        gray = img.mean(axis=2, keepdims=True)
        img = img * (1 - ridge * 0.30 * wear) + gray * (ridge * 0.30 * wear)

    out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f'{name}.jpg')
    # 只有 jpg 进仓库。png 每张 4MB,而 App 只读 jpg —— 想看无损原图时加 --png
    if keep_png:
        out.save(os.path.join(out_dir, f'{name}.png'))
    out.save(path, quality=88, optimize=True)
    return path


# ── 干净的一组(2026-08-13 加)────────────────────────────────
#
# 用户看了真机截图的判断:「不太美观」。查下来牛皮那三张的问题是**太脏太重** ——
# 揉皱 26~64 条、污渍 2~4 摊、磨损 0.5~0.72,参考的是一个揉过的纸袋。
# 那是一种很强的风格,读起来像皱布或皮革,不像手账纸。真实手账绝大多数用的是
# 干净的素纸、笺纸、米黄纸,痕迹只有纤维和很淡的光照不均。
#
# **但不能把痕迹全关掉。** 完全均匀的一块颜色一眼假(这一点在下面的注释里
# 已经写过一次)。所以干净纸的配方是「减法做到极限,但三样不能丢」:
#   纤维颗粒(纸之所以是纸)· 少量草梗(手工/再生纸的信号)· 大尺度光照不均
# 去掉的是:揉皱、折痕、污渍、foxing 锈斑、重磨损。
CLEAN = dict(crumple=0, crumple_depth=0, creases=0, crease_depth=0, stains=0)

# 三档,对着参考图里的色域来:米白稻草 / 黄棕纸袋 / 红棕深牛皮。
# crumple 是横贯整页的折线条数 —— 它决定「揉过几次」。
# 改参数请连注释里的判断一起看:大部分默认值是排除了某个具体的翻车才定的。
PAPERS = [
    # 素白:最干净的一档,给「打开就是一张空白的好纸」那个定案用
    ('plain-ivory', (247, 243, 234), dict(
        CLEAN, fiber=0.030, cloud=0.014, flecks=700, hairs=45,
        foxing=0, wear=0.14, seed=101)),
    # 米黄笺纸:暖一点,长时间看不刺眼,是手账最常见的底
    ('plain-cream', (241, 231, 210), dict(
        CLEAN, fiber=0.034, cloud=0.018, flecks=1100, hairs=60,
        foxing=2, wear=0.18, seed=102)),
    # 浅灰:冷底,给照片多的页 —— 暖纸会把彩色照片压得发黄
    ('plain-mist', (234, 233, 228), dict(
        CLEAN, fiber=0.028, cloud=0.013, flecks=600, hairs=35,
        foxing=0, wear=0.13, seed=103)),
    ('kraft-light', (223, 206, 176), dict(
        fiber=0.05, cloud=0.035, creases=1, crumple=26, crumple_depth=0.09,
        flecks=2600, hairs=120, stains=2, foxing=22, wear=0.5,
        crease_depth=0.07, seed=11)),
    ('kraft-bag', (198, 158, 108), dict(
        fiber=0.055, cloud=0.04, creases=2, crumple=64, crumple_depth=0.17,
        flecks=3600, hairs=90, stains=3, foxing=10, wear=0.62,
        crease_depth=0.12, seed=3)),
    ('kraft-dark', (152, 102, 64), dict(
        fiber=0.07, cloud=0.05, creases=1, crumple=58, crumple_depth=0.15,
        flecks=4200, hairs=70, stains=4, foxing=6, wear=0.72,
        crease_depth=0.10, seed=21)),
]


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', default=DEFAULT_OUT,
                    help='输出目录(默认 YanApp/assets/paper,会直接覆盖)')
    ap.add_argument('--png', action='store_true', help='同时留一份无损 png(每张约 4MB,别进仓库)')
    ap.add_argument('--only', action='append', metavar='NAME',
                    help='只出某几档,如 --only kraft-bag。可重复')
    args = ap.parse_args()

    wanted = set(args.only) if args.only else None
    known = {name for name, _, _ in PAPERS}
    if wanted and not wanted <= known:
        ap.error(f'不认识的纸样 {sorted(wanted - known)},可选:{sorted(known)}')

    for name, base_rgb, params in PAPERS:
        if wanted and name not in wanted:
            continue
        print(make(name, base_rgb, out_dir=args.out, keep_png=args.png, **params))
