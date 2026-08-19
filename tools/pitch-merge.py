#!/usr/bin/env python3
"""音调数据合入词库。**默认 dry-run,要显式 --write 才落盘。**

用法:
    python3 tools/pitch-merge.py                  # dry-run,只看报告,不写
    python3 tools/pitch-merge.py --samples 10     # 多看几个 multi 样本
    python3 tools/pitch-merge.py --write          # 真的写(先备份 .bak)

──────────────────────────────────────────────────────────────
方案 B(用户拍板):**全部合入,但多型的要如实标记。**

    单一型   "pitch": {"accent": 1, "mora": 2, "source": "kanjium"}
    多个型   "pitch": {"accent": 3, "all": [3, 2], "mora": 3,
                       "source": "kanjium", "multi": true}

`multi: true` 是这次的核心要求,不是可选的装饰。理由:

    「取第一个」这条规则**没有来源可以核对**。kanjium 的 all 数组
    是有顺序的,但那个顺序不等于「最常用的在前」—— 没有任何文档
    这样承诺。所以我们不能假装这个词只有一个型。

    「这个词有两种读法」本身是有用且真实的信息,界面可以据此
    提示用户;假装只有一个型才是编造。

单一型条目**不写** `all` 和 `multi` —— all 就是 [accent],重复;
没有 multi 即单一型,界面判断 `pitch.multi` 即可。

──────────────────────────────────────────────────────────────
分类口径和 tools/pitch-dry-run.py **完全一致**(逐行对照过):

    matched         id 对上、len(all)==1        → 写单一型
    matched_multi   id 对上、len(all)>1         → 写多型 + multi:true
    pitch_orphan    音调有、词库没有这个 id      → 跳过
    word_no_pitch   词库有、音调没有            → 不动,pitch 字段不存在
    shape_bad       值形状不对                  → 跳过,并在报告里点名
    id_collision    词库 id 重复                → 直接终止,join 会串词

预期(实测基线):matched 6662 / matched_multi 848 / word_no_pitch 495
              / orphan 0 / shape_bad 0

──────────────────────────────────────────────────────────────
安全约束(这个脚本对自己的承诺):

 1. **只增 `pitch` 键。**不改任何已有字段、不改任何 id、不动任何 key,
    不碰 _meta,不碰 wordBank 以外的任何东西。
 2. 落盘后立刻做**字节级自检**:把写出的文件里每条的 `pitch` 摘掉,
    重新序列化,必须和备份的原文件**逐字节相同**。不同就报错。
 3. 两份词库(内置 fallback / 远端 v2)**写同样的内容**,写完比对
    两者字节相同 —— 分叉了没人会发现(见 wordIds.test.mjs)。
 4. 写之前备份 *.bak。

排版:原文件是 `json.dumps(..., ensure_ascii=False, indent=1)` + 末尾换行,
已验证 round-trip 逐字节还原。不重新格式化,否则 diff 会爆炸。
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PITCH = ROOT / "YanApp" / "staging" / "pitch-accent.json"
# 两份词库必须完全一致。护栏:YanApp/src/lib/__tests__/wordIds.test.mjs
BANKS = [
    ROOT / "YanApp" / "assets" / "content.fallback.json",   # 内置
    ROOT / "yan-content" / "content.v2.json",               # 远端
]

SOURCE_TAG = "kanjium"

WRITE = "--write" in sys.argv
SAMPLES = 3
for i, a in enumerate(sys.argv):
    if a == "--samples" and i + 1 < len(sys.argv):
        SAMPLES = int(sys.argv[i + 1])


def die(msg):
    print(f"\n✗ {msg}")
    sys.exit(2)


def dump(doc):
    """和原文件排版完全一致的序列化。改这里 = 让 diff 爆炸。"""
    return json.dumps(doc, ensure_ascii=False, indent=1) + "\n"


# ── 读取 ───────────────────────────────────────────────────────
if not PITCH.exists():
    die(f"找不到音调表:{PITCH}")
for b in BANKS:
    if not b.exists():
        die(f"找不到词库:{b}")

pitch_doc = json.loads(PITCH.read_text(encoding="utf-8"))
accents = pitch_doc.get("accents") or {}
if not accents:
    die("音调表里没有 accents —— 结构变了,这个脚本要跟着改")

raw_banks = [p.read_text(encoding="utf-8") for p in BANKS]

# 前提:两份词库当前就是一致的。不一致的话这次合并会把分叉固化下来。
if len(set(raw_banks)) != 1:
    print("⚠️ 两份词库当前**就不是**字节相同的。")
    docs_now = [json.loads(r) for r in raw_banks]
    wb_now = [d.get("wordBank") or [] for d in docs_now]
    if wb_now[0] != wb_now[1]:
        die("而且 wordBank 内容也不同 —— 先把两份对齐,再谈合入音调。")
    print("   (wordBank 内容相同,只是排版/其它字段有差异,继续。)")

print("═" * 62)
print(f"音调合入 · {'WRITE ⚠️ 会落盘' if WRITE else 'DRY RUN(只读,不写任何文件)'}")
print("═" * 62)
print(f"来源   {pitch_doc.get('source')}")
print(f"许可   {pitch_doc.get('license')}   ⚠️ CC-BY-SA 有传染性,发布时必须署名")
print(f"署名   {pitch_doc.get('attributionNote') or 'Uros O. (kanjium)'}")
print(f"音调   {len(accents)} 条")
for p in BANKS:
    print(f"词库   {p.relative_to(ROOT)}")
print()

base_doc = json.loads(raw_banks[0])
bank = base_doc.get("wordBank") or []
if not bank:
    die("词库是空的 —— 读不到 ≠ 是空的,先查文件")

# ── 0 join 的前提:id 唯一 ─────────────────────────────────────
by_id = {}
dups, no_id = [], []
for w in bank:
    wid = w.get("id")
    if not wid:
        no_id.append(f"{w.get('word')}-{w.get('reading')}")
    elif wid in by_id:
        dups.append(wid)
    else:
        by_id[wid] = w

print("── 0 join 的前提")
print(f"   词库                {len(bank)} 条")
print(f"   有 id               {len(bank) - len(no_id)} / {len(bank)}")
print(f"   id 重复             {len(dups)}   {'✓' if not dups else '✗ 必须先修'}")
if no_id:
    die(f"有 {len(no_id)} 条没有 id,join 不完整:{', '.join(no_id[:5])}")
if dups:
    die(f"id 有重复,join 会串词。先修 id 再来:{', '.join(dups[:5])}")
print()

# ── 1 分类 + 构造 pitch(口径同 pitch-dry-run.py) ──────────────
plan = {}          # wid -> pitch 字段
matched, matched_multi, shape_bad = [], [], []

for wid, val in accents.items():
    if wid not in by_id:
        continue                                   # pitch_orphan,跳过
    if not isinstance(val, dict) or not isinstance(val.get("all"), list) or not val["all"]:
        shape_bad.append((wid, val))               # 形状不对,不写
        continue
    allv = val["all"]
    if len(allv) > 1:
        plan[wid] = {
            "accent": val["accent"],
            "all": list(allv),
            "mora": val.get("mora"),
            "source": SOURCE_TAG,
            "multi": True,                         # ← 核心:如实标记
        }
        matched_multi.append(wid)
    else:
        plan[wid] = {
            "accent": val["accent"],
            "mora": val.get("mora"),
            "source": SOURCE_TAG,
        }
        matched.append(wid)

pitch_orphan = [k for k in accents if k not in by_id]
word_no_pitch = [w for w in bank if w.get("id") not in plan]

print("── 1 分类(和 pitch-dry-run.py 同口径)")
print(f"   matched         {len(matched):5d}   单一型 → pitch 无 multi")
print(f"   matched_multi   {len(matched_multi):5d}   多个型 → pitch.multi = true")
print(f"   pitch_orphan    {len(pitch_orphan):5d}   音调有、词库没有,跳过")
print(f"   word_no_pitch   {len(word_no_pitch):5d}   合入后仍然没有 pitch 字段")
print(f"   shape_bad       {len(shape_bad):5d}   形状不对,不写")
if shape_bad:
    for wid, val in shape_bad[:5]:
        print(f"      {wid} → {val!r}")
print()

total_write = len(plan)
print("── 2 本次写入")
print(f"   预计写入        {total_write} 条 pitch 字段")
print(f"   其中 multi      {len(matched_multi)} 条")
print(f"   仍为空          {len(word_no_pitch)} 条(不补数据,按要求)")
print(f"   覆盖率          {total_write} / {len(bank)} = {total_write / len(bank) * 100:.1f}%")
print()

# ── 3 multi 样本的前后对比 ────────────────────────────────────
print("── 3 multi 样本 · 改之前 / 改之后")
for wid in matched_multi[:SAMPLES]:
    w = by_id[wid]
    after = dict(w)
    after["pitch"] = plan[wid]
    print(f"\n   ▌{wid}  {w.get('word')}({w.get('reading')})  "
          f"全部型={plan[wid]['all']} → 取 {plan[wid]['accent']}")
    print("   ── 之前 ──")
    for line in json.dumps(w, ensure_ascii=False, indent=1).splitlines():
        print("   " + line)
    print("   ── 之后 ──")
    for line in json.dumps(after, ensure_ascii=False, indent=1).splitlines():
        print("   " + line)
print()

if not WRITE:
    print("═" * 62)
    print("这是 DRY RUN —— **没有写入任何文件**。")
    print("确认上面的数字和样本之后,加 --write 才会落盘。")
    print("═" * 62)
    sys.exit(0)

# ── 4 落盘 ────────────────────────────────────────────────────
print("═" * 62)
print("WRITE 模式 —— 开始落盘")
print("═" * 62)

new_doc = json.loads(raw_banks[0])           # 从原文重新解析,不复用上面的对象
written = 0
for w in new_doc["wordBank"]:
    p = plan.get(w.get("id"))
    if p is None:
        continue
    if "pitch" in w:                          # 只增不改。已有就是异常。
        die(f"{w.get('id')} 已经有 pitch 字段了 —— 这个脚本只负责新增,不覆盖。")
    w["pitch"] = p                            # 追加到条目末尾,不动其它 key 的顺序
    written += 1

if written != total_write:
    die(f"实际写入 {written} ≠ 预计 {total_write} —— 逻辑对不上,不落盘。")

out = dump(new_doc)

for path, raw in zip(BANKS, raw_banks):
    bak = path.with_suffix(path.suffix + ".bak")
    shutil.copy2(path, bak)
    print(f"   备份  {bak.relative_to(ROOT)}")
    path.write_text(out, encoding="utf-8")
    print(f"   写入  {path.relative_to(ROOT)}  ({len(out)} 字节)")
print()

# ── 5 自检:除了新增的 pitch,必须逐字节相同 ────────────────────
print("── 5 自检(字节级)")
ok = True
for path, raw in zip(BANKS, raw_banks):
    back = json.loads(path.read_text(encoding="utf-8"))
    n_pitch = 0
    for w in back["wordBank"]:
        if "pitch" in w:
            del w["pitch"]
            n_pitch += 1
    restored = dump(back)
    same = restored == raw
    ok &= same
    print(f"   {path.relative_to(ROOT)}")
    print(f"      摘掉 pitch 后还原原文  {'✓ 逐字节相同' if same else '✗ 有差异!'}")
    print(f"      文件里的 pitch 条数     {n_pitch}  {'✓' if n_pitch == total_write else '✗'}")
    ok &= (n_pitch == total_write)

texts = [p.read_text(encoding="utf-8") for p in BANKS]
same_two = len(set(texts)) == 1
ok &= same_two
print(f"   两份词库互相比对            {'✓ 字节相同' if same_two else '✗ 分叉了!'}")
print()

if not ok:
    die("自检没过。备份还在 *.bak,用它回滚。")

print("═" * 62)
print(f"完成:写入 {total_write} 条,其中 multi {len(matched_multi)} 条,"
      f"仍为空 {len(word_no_pitch)} 条。")
print("下一步:cd YanApp && npm test —— 必须全绿。")
print(f"⚠️ 许可 {pitch_doc.get('license')},发布时须署名 Uros O.(kanjium)。")
print("═" * 62)
