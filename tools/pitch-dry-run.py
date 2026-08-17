#!/usr/bin/env python3
"""音调数据合入前的 dry-run。**只读,一个字节都不写。**

用法:
    python3 tools/pitch-dry-run.py                 # 看报告
    python3 tools/pitch-dry-run.py --samples 10    # 每类多看几个样本

──────────────────────────────────────────────────────────────
⚠️ 关于风险等级的一次更正

顾问意见和决策记录里都写着「音调表的键是 词-读音,而复习进度的键也是
词-读音 —— 这是本项目丢过四次数据的那个键,合并前必须 dry-run」。

**这个前提是错的。** 实测:

    staging/pitch-accent.json 的键是**词条 id**(n5_au、n5_ao…),
    不是 词-读音。

所以这次合并是一次 id → id 的 join,**不碰 词-读音,也就完全不碰复习进度**。
它给词条加一个字段,不改任何键。风险等级远低于此前的判断。

那为什么还要 dry-run?**理由变了**:不是防丢数据,是搞清楚
7510 条到底能对上多少、对不上的是哪些、一词多型的怎么办 ——
这些在写进 content 之前必须先看见。
──────────────────────────────────────────────────────────────

报告分六类,每类都给样本(只给数字的话没人能判断对不对):

    matched            id 对上了,单一型          直接可用
    matched_multi      id 对上了,但有多个型      取第一个,要人看一眼
    pitch_orphan       音调有,词库没这个 id      多半是词库删过的词
    word_no_pitch      词库有,音调没有            这些词的音调字段仍是空的
    id_collision       词库里 id 重复             必须为 0,否则 join 会串
    shape_bad          音调值形状不对              不应该出现
"""
import json
import sys
from pathlib import Path
from collections import Counter, defaultdict

ROOT = Path(__file__).resolve().parents[1]
PITCH = ROOT / "YanApp" / "staging" / "pitch-accent.json"
BANK = ROOT / "YanApp" / "assets" / "content.fallback.json"

SAMPLES = 5
for i, a in enumerate(sys.argv):
    if a == "--samples" and i + 1 < len(sys.argv):
        SAMPLES = int(sys.argv[i + 1])


def die(msg):
    print(f"✗ {msg}")
    sys.exit(2)


if not PITCH.exists():
    die(f"找不到音调表:{PITCH}")
if not BANK.exists():
    die(f"找不到词库:{BANK}")

pitch_doc = json.loads(PITCH.read_text(encoding="utf-8"))
accents = pitch_doc.get("accents") or {}
if not accents:
    die("音调表里没有 accents —— 结构变了,这个脚本要跟着改")

bank = json.loads(BANK.read_text(encoding="utf-8")).get("wordBank") or []
if not bank:
    die("词库是空的 —— 读不到 ≠ 是空的,先查文件")

print("═" * 62)
print("音调合入 · DRY RUN(只读)")
print("═" * 62)
print(f"来源   {pitch_doc.get('source')}")
print(f"许可   {pitch_doc.get('license')}   ⚠️ CC-BY-SA 有传染性,发布时要署名")
print(f"状态   {pitch_doc.get('status')}")
print(f"音调   {len(accents)} 条")
print(f"词库   {len(bank)} 条")
print()

# ── 0 id 唯一性。join 的前提,不成立就别往下走
by_id = defaultdict(list)
no_id = []
for w in bank:
    wid = w.get("id")
    if not wid:
        no_id.append(f"{w.get('word')}-{w.get('reading')}")
    else:
        by_id[wid].append(w)
collisions = {k: v for k, v in by_id.items() if len(v) > 1}

print("── 0 join 的前提")
print(f"   词库有 id 的        {len(bank) - len(no_id)} / {len(bank)}")
print(f"   id 重复             {len(collisions)}   {'✓' if not collisions else '✗ 必须先修'}")
if no_id:
    print(f"   ⚠️ 缺 id 的 {len(no_id)} 条:{', '.join(no_id[:SAMPLES])}")
if collisions:
    for k, v in list(collisions.items())[:SAMPLES]:
        print(f"      {k} → {[x.get('word') for x in v]}")
    die("id 有重复,join 会串词。先修 id 再来。")
print()

# ── 1 逐条分类
matched, matched_multi, shape_bad = [], [], []
for wid, val in accents.items():
    if wid not in by_id:
        continue
    if not isinstance(val, dict) or not isinstance(val.get("all"), list) or not val["all"]:
        shape_bad.append((wid, val))
        continue
    (matched_multi if len(val["all"]) > 1 else matched).append((wid, val))

pitch_orphan = [k for k in accents if k not in by_id]
word_no_pitch = [w for w in bank if w.get("id") not in accents]

total_bank = len(bank)
covered = len(matched) + len(matched_multi)


def pct(n):
    return f"{n / total_bank * 100:5.1f}%"


print("── 1 分类")
print(f"   matched         {len(matched):5d}  {pct(len(matched))}  id 对上,单一型,直接可用")
print(f"   matched_multi   {len(matched_multi):5d}  {pct(len(matched_multi))}  对上但有多个型,取第一个")
print(f"   pitch_orphan    {len(pitch_orphan):5d}         音调有、词库没有这个 id")
print(f"   word_no_pitch   {len(word_no_pitch):5d}  {pct(len(word_no_pitch))}  词库有、音调没有")
print(f"   shape_bad       {len(shape_bad):5d}         值的形状不对")
print()
print(f"   合入后覆盖率     {covered} / {total_bank} = {pct(covered)}")
print()


def show(title, rows, fmt):
    print(f"── 样本 · {title}")
    if not rows:
        print("   (无)")
    for r in rows[:SAMPLES]:
        print("  ", fmt(r))
    if len(rows) > SAMPLES:
        print(f"   … 还有 {len(rows) - SAMPLES} 条")
    print()


def word_of(wid):
    w = by_id[wid][0]
    return f"{w.get('word')}({w.get('reading')})"


show("matched", matched,
     lambda r: f"{r[0]:<14} {word_of(r[0]):<22} 型={r[1]['accent']} 拍={r[1].get('mora')}")
show("matched_multi ⚠️ 取第一个,这些要人看一眼", matched_multi,
     lambda r: f"{r[0]:<14} {word_of(r[0]):<22} 全部型={r[1]['all']} → 取 {r[1]['accent']}")
show("pitch_orphan(音调有、词库没有)", pitch_orphan, lambda r: r)
show("word_no_pitch(这些词合入后音调仍为空)", word_no_pitch,
     lambda w: f"{w.get('id'):<14} {w.get('word')}({w.get('reading')})  {(w.get('meaning_zh') or '')[:14]}")
show("shape_bad", shape_bad, lambda r: f"{r[0]} → {r[1]!r}")

# ── 2 word_no_pitch 里主线池占多少 —— 这才是真正影响体验的数
anchors = [w for w in bank if "kanji_anchor" in (w.get("yanFeatures") or [])]
anchor_no_pitch = [w for w in anchors if w.get("id") not in accents]
print("── 2 对主线的影响(563 条 kanji_anchor 是当前主线池)")
print(f"   主线池              {len(anchors)} 条")
print(f"   其中拿不到音调       {len(anchor_no_pitch)} 条")
if anchor_no_pitch:
    for w in anchor_no_pitch[:SAMPLES]:
        print(f"      {w.get('word')}({w.get('reading')})")
    if len(anchor_no_pitch) > SAMPLES:
        print(f"      … 还有 {len(anchor_no_pitch) - len(anchor_no_pitch[:SAMPLES])} 条")
print()

# ── 3 型的分布,给渲染层参考
dist = Counter(v["accent"] for _, v in matched + matched_multi)
print("── 3 型的分布")
for k in sorted(dist):
    name = {0: "平板"}.get(k, f"{k} 型")
    print(f"   {name:<6} {dist[k]:5d}  {'█' * max(1, dist[k] * 40 // max(dist.values()))}")
print()

print("═" * 62)
print("这是 dry-run,**没有写入任何文件**。")
print("看过样本、确认 matched_multi 的取值方式可接受之后,再写合入脚本。")
print("═" * 62)
