#!/usr/bin/env python3
"""词频(Tatoeba 文档频率 DF)合入词库。**默认 dry-run,要显式 --write 才落盘。**

用法:
    python3 tools/freq-merge.py                  # dry-run,只看报告,不写
    python3 tools/freq-merge.py --samples 5      # 多看几个前后对比样本
    python3 tools/freq-merge.py --write          # 真的写(先备份 .bak)

──────────────────────────────────────────────────────────────
数据源(唯一):tools/data/tatoeba/jpn_lemma_index.pkl + jpn_sentences.tsv
    Tatoeba,CC-BY 2.0 FR。248,758 句 / 42,326 lemma。
    索引由 Sudachi SplitMode.C 分词 + dictionary_form + **句内去重** 构建,
    所以 len(index[lemma]) 就是文档频率(DF = 出现过该词的句数),不是 token 数。

JMdict 那条路是死的:本地三份 jmdict-simplified **不含** nf01–nf48 / ichi1
等频率标记(grep 实测 0 次),且 563 条锚点里只有 19 条带 jmdictSeq。
详见 docs/词频调研-2026-08-17.md。本脚本不读 JMdict。

──────────────────────────────────────────────────────────────
写入的字段(只增这一个键):

    "freq": {"df": 6423, "source": "tatoeba", "method": "lemma"}

method 取值 —— **哪一级查法查出来的,必须能看出区别**:

    lemma            直接在 lemma index 里命中(正常情况)
    stripped_prefix  剥掉 お/ご 敬语前缀后才命中(お酒 → 酒)
    raw_substring    lemma 全失败,退回在原句上数字符串
                     (一つ 被 Sudachi 切成 一+つ,lemma index 里根本没有)
    none             三级全失败,df = 0 —— **真的一次都没出现**
    not_applicable   df = null —— 助数词/接尾词,频率概念不适用

    ⚠️ df=0 和 df=null 是两件事,不许混:
       0    = 查过了,语料里真的没有
       null = 这个词不该有 DF 值

助数词特判(调研 4.4 指出的偏差二):
    word 里含 `～` 的条目一律 not_applicable。
    原因:归一化剥掉 `～` 之后 `～人` 就变成 `人`,会**继承基词的 DF**——
    `～人(～じん)` / `～人(～にん)` / `人(ひと)` 会一起拿到 6423,
    排序里连着冒出三个「人」。那 6423 不是助数词的频率,是假的。
    真实的助数词频率本地测不出来(需要「数字+该字」的句法级统计,
    子串法会把 `十一月` 数进 `一月`),所以标 null 而不是编一个数。

    范围说明:调研只点名了 `～` **开头**的 30 条。本脚本把 `何～`
    (唯一一条 `～` 不在开头的)也一并纳入 —— 它同样是靠剥 `～` 继承了
    `何` 的 7046,是同一个偏差。要收窄成「仅开头」改 IS_COUNTER 即可。

──────────────────────────────────────────────────────────────
安全约束(与 tools/pitch-merge.py 完全一致):

 1. **只增 `freq` 键。**不改任何已有字段/id/key 顺序,不碰 _meta,
    不碰 wordBank 以外的任何东西。
 2. 落盘后**字节级自检**:摘掉新增的 freq 后重新序列化,必须和备份的
    原文件逐字节相同。
 3. 两份词库(内置 fallback / 远端 v2)写同样的内容,写完比对字节相同。
 4. 写之前备份 *.bak。

排版:原文件是 json.dumps(..., ensure_ascii=False, indent=1) + 末尾换行。
不重新格式化。
"""
import json
import pickle
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEMMA_PKL = ROOT / "tools" / "data" / "tatoeba" / "jpn_lemma_index.pkl"
SENTENCES = ROOT / "tools" / "data" / "tatoeba" / "jpn_sentences.tsv"
BANKS = [
    ROOT / "YanApp" / "assets" / "content.fallback.json",   # 内置
    ROOT / "yan-content" / "content.v2.json",               # 远端
]

SOURCE_TAG = "tatoeba"
SPLIT_RE = re.compile(r"[;；/、]")

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


def is_counter(word):
    """助数词/接尾词/前缀词:含 `～` 即是。见文件头说明。"""
    return "～" in (word or "")


def base_forms(s):
    """拆多形 + 去 `～` + 去空白。"""
    out = []
    for part in SPLIT_RE.split(s or ""):
        part = part.replace("～", "").strip()
        if part:
            out.append(part)
    return out


def has_kanji(f):
    return any("一" <= ch <= "鿿" for ch in f)


def candidates(w):
    """查询候选形。**有汉字的词只查汉字形,绝不退到假名读音。**

    这一条是本脚本最关键的取舍。第一版把 reading 也当候选、取 max,
    结果 top20 全被助词污染(实跑出来的):
        歯(は) 153587 ← 助词 は     二(に) 86372 ← 助词 に
        手(て) 70751  ← 助词 て     戸(と) 32350 ← 助词 と
        居る/要る(いる) 37686、在る/有る(ある) 17790 ← 补助动词
        五日(いつか) 304 ← 副词「いつか(某天)」
    DF 是**按写法**统计的,拿假名读音去查等于在数另一个词。
    只有本身就是假名词条(これ/そこ/ある…)才用它自己的假名形。
    """
    kw = base_forms(w.get("word"))
    kanji = [f for f in kw if has_kanji(f)]
    if kanji:
        return kanji
    return kw + base_forms(w.get("reading"))


def strip_polite(f):
    """剥 お/ご 敬语前缀(お酒 → 酒)。

    剥完的残余必须「像个词」:含汉字(酒/皿)或至少 2 个字符。
    只留 1 个假名(おと → と)一律不认,那种残余全是助词,会污染 DF。
    """
    if len(f) >= 2 and f[0] in "おご":
        rest = f[1:]
        if has_kanji(rest) or len(rest) >= 2:
            return rest
    return None


# ── 读取 ───────────────────────────────────────────────────────
for p in (LEMMA_PKL, SENTENCES, *BANKS):
    if not p.exists():
        die(f"找不到文件:{p}")

with LEMMA_PKL.open("rb") as fh:
    lemma_index = pickle.load(fh)
if not isinstance(lemma_index, dict) or not lemma_index:
    die("lemma index 结构不对 —— 读不到 ≠ 是空的,先查文件")

raw_banks = [p.read_text(encoding="utf-8") for p in BANKS]
if len(set(raw_banks)) != 1:
    print("⚠️ 两份词库当前**就不是**字节相同的。")
    docs_now = [json.loads(r) for r in raw_banks]
    if (docs_now[0].get("wordBank") or []) != (docs_now[1].get("wordBank") or []):
        die("而且 wordBank 内容也不同 —— 先把两份对齐,再谈合入词频。")
    print("   (wordBank 内容相同,只是排版/其它字段有差异,继续。)")

base_doc = json.loads(raw_banks[0])
bank = base_doc.get("wordBank") or []
if not bank:
    die("词库是空的 —— 读不到 ≠ 是空的,先查文件")

print("═" * 66)
print(f"词频合入 · {'WRITE ⚠️ 会落盘' if WRITE else 'DRY RUN(只读,不写任何文件)'}")
print("═" * 66)
print(f"来源   Tatoeba jpn_lemma_index.pkl   {len(lemma_index)} 个 lemma")
print("许可   CC-BY 2.0 FR(Tatoeba)  ⚠️ 发布时须署名")
for p in BANKS:
    print(f"词库   {p.relative_to(ROOT)}   {len(bank)} 条")
print()

# ── 0 join 的前提:id 唯一 ─────────────────────────────────────
by_id, dups, no_id = {}, [], []
for w in bank:
    wid = w.get("id")
    if not wid:
        no_id.append(f"{w.get('word')}-{w.get('reading')}")
    elif wid in by_id:
        dups.append(wid)
    else:
        by_id[wid] = w
print("── 0 前提检查")
print(f"   有 id     {len(bank) - len(no_id)} / {len(bank)}")
print(f"   id 重复   {len(dups)}   {'✓' if not dups else '✗ 必须先修'}")
if no_id:
    die(f"有 {len(no_id)} 条没有 id:{', '.join(no_id[:5])}")
if dups:
    die(f"id 有重复,join 会串词:{', '.join(dups[:5])}")
print()

# ── 1 第一级 / 第二级:lemma index ─────────────────────────────
plan = {}          # wid -> freq 字段
need_substr = {}   # wid -> 候选串集合(前两级都没查到的)

for w in bank:
    wid = w["id"]
    if is_counter(w.get("word")):
        plan[wid] = {"df": None, "source": SOURCE_TAG, "method": "not_applicable"}
        continue

    cands = candidates(w)
    df = max((len(lemma_index.get(c) or ()) for c in cands), default=0)
    if df > 0:
        plan[wid] = {"df": df, "source": SOURCE_TAG, "method": "lemma"}
        continue

    stripped = [s for s in (strip_polite(c) for c in cands) if s]
    df2 = max((len(lemma_index.get(s) or ()) for s in stripped), default=0)
    if df2 > 0:
        plan[wid] = {"df": df2, "source": SOURCE_TAG, "method": "stripped_prefix"}
        continue

    need_substr[wid] = set(cands) | set(stripped)

# ── 2 第三级:原句子串计数(单遍扫 248k 句) ────────────────────
all_cands = set()
for s in need_substr.values():
    all_cands |= s
lengths = sorted({len(c) for c in all_cands})

sub_df = {c: 0 for c in all_cands}
n_sent = 0
if all_cands:
    with SENTENCES.open(encoding="utf-8") as fh:
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            text = parts[2]
            n_sent += 1
            seen = set()
            n = len(text)
            for L in lengths:
                if L > n:
                    break
                for i in range(n - L + 1):
                    sub = text[i:i + L]
                    if sub in sub_df and sub not in seen:
                        seen.add(sub)
            for sub in seen:
                sub_df[sub] += 1

for wid, cands in need_substr.items():
    df = max((sub_df.get(c, 0) for c in cands), default=0)
    if df > 0:
        plan[wid] = {"df": df, "source": SOURCE_TAG, "method": "raw_substring"}
    else:
        plan[wid] = {"df": 0, "source": SOURCE_TAG, "method": "none"}

# ── 3 报告:覆盖率 ────────────────────────────────────────────
def tally(items):
    out = {}
    for w in items:
        out[plan[w["id"]]["method"]] = out.get(plan[w["id"]]["method"], 0) + 1
    return out


anchors = [w for w in bank if "kanji_anchor" in (w.get("yanFeatures") or [])]

print(f"── 1 子串兜底扫描:实读 {n_sent} 句,{len(all_cands)} 个候选串,"
      f"长度 {lengths[:1] and f'{lengths[0]}–{lengths[-1]}' or '—'}")
print()
print("── 2 覆盖率(method 分布)")
order = ["lemma", "stripped_prefix", "raw_substring", "none", "not_applicable"]
note = {
    "lemma": "lemma index 直接命中",
    "stripped_prefix": "剥 お/ご 后命中",
    "raw_substring": "退回原句子串计数",
    "none": "三级全失败,df=0(真的没出现)",
    "not_applicable": "助数词/接尾词,df=null",
}
tb, ta = tally(bank), tally(anchors)
print(f"   {'method':<16}{'全库 8005':>12}{'锚点 563':>12}   说明")
for m in order:
    print(f"   {m:<16}{tb.get(m, 0):>12}{ta.get(m, 0):>12}   {note[m]}")
got_b = sum(tb.get(m, 0) for m in ("lemma", "stripped_prefix", "raw_substring"))
got_a = sum(ta.get(m, 0) for m in ("lemma", "stripped_prefix", "raw_substring"))
print(f"   {'拿到 df>0':<16}{got_b:>12}{got_a:>12}   "
      f"({got_b / len(bank) * 100:.1f}% / {got_a / len(anchors) * 100:.1f}%)")
print()

# ── 4 锚点按 df 排序 top20 + 连续同汉字自检 ────────────────────
ranked = sorted(
    [w for w in anchors if plan[w["id"]]["df"]],
    key=lambda w: -plan[w["id"]]["df"],
)
tail = [w for w in anchors if not plan[w["id"]]["df"]]   # df=0 或 null,排最后

print("── 3 563 条锚点 · 按 df 降序 top 20")
print(f"   {'#':>3} {'word':<12}{'reading':<14}{'df':>8}  method")
for i, w in enumerate(ranked[:20], 1):
    f = plan[w["id"]]
    print(f"   {i:>3} {w['word']:<12}{w['reading']:<14}{f['df']:>8}  {f['method']}")
print()


def kanji_of(word):
    return "".join(ch for ch in word if "一" <= ch <= "鿿") or word


print("── 4 自检:排序里有没有「同一个汉字连着出现」")
worst = 0
runs = []
i = 0
seq = ranked + tail
while i < len(seq):
    k = kanji_of(seq[i]["word"])
    j = i
    while j + 1 < len(seq) and kanji_of(seq[j + 1]["word"]) == k:
        j += 1
    if j > i:
        runs.append((k, j - i + 1, i + 1))
    worst = max(worst, j - i + 1)
    i = j + 1
top20_runs = [r for r in runs if r[2] <= 20]
print(f"   全 563 条里最长连续同汉字段  {worst}  "
      f"{'✓ 没有连着三次' if worst < 3 else '✗ 有 ≥3 连'}")
print(f"   top20 内的连续段            {top20_runs if top20_runs else '无'}")
if runs:
    print(f"   全表所有连续段(汉字, 长度, 起始名次):")
    for k, n, pos in runs[:12]:
        print(f"      {k}  ×{n}  @#{pos}")
print()

# ── 5 前后对比样本 ────────────────────────────────────────────
print("── 5 前后对比样本")
picks = []
for m in ("lemma", "stripped_prefix", "raw_substring", "not_applicable", "none"):
    for w in anchors:
        if plan[w["id"]]["method"] == m:
            picks.append(w)
            break
for w in picks[:max(SAMPLES, 3)]:
    after = dict(w)
    after["freq"] = plan[w["id"]]
    print(f"\n   ▌{w['id']}  {w['word']}({w['reading']})  → {plan[w['id']]}")
    print("   ── 之前(末 3 行)──")
    for line in json.dumps(w, ensure_ascii=False, indent=1).splitlines()[-3:]:
        print("   " + line)
    print("   ── 之后(末 4 行)──")
    for line in json.dumps(after, ensure_ascii=False, indent=1).splitlines()[-4:]:
        print("   " + line)
print()

total_write = len(plan)
print(f"── 6 本次写入 {total_write} 条 freq 字段(= 全部 {len(bank)} 条)")
print()

if not WRITE:
    print("═" * 66)
    print("这是 DRY RUN —— **没有写入任何文件**。")
    print("确认上面的数字和样本之后,加 --write 才会落盘。")
    print("═" * 66)
    sys.exit(0)

# ── 6 落盘 ────────────────────────────────────────────────────
print("═" * 66)
print("WRITE 模式 —— 开始落盘")
print("═" * 66)

new_doc = json.loads(raw_banks[0])
written = 0
for w in new_doc["wordBank"]:
    f = plan.get(w.get("id"))
    if f is None:
        continue
    if "freq" in w:
        die(f"{w.get('id')} 已经有 freq 字段了 —— 这个脚本只负责新增,不覆盖。")
    w["freq"] = f
    written += 1
if written != total_write:
    die(f"实际写入 {written} ≠ 预计 {total_write} —— 逻辑对不上,不落盘。")

out = dump(new_doc)
for path in BANKS:
    bak = path.with_suffix(path.suffix + ".bak")
    shutil.copy2(path, bak)
    print(f"   备份  {bak.relative_to(ROOT)}")
    path.write_text(out, encoding="utf-8")
    print(f"   写入  {path.relative_to(ROOT)}  ({len(out)} 字节)")
print()

# ── 7 自检:除了新增的 freq,必须逐字节相同 ─────────────────────
print("── 7 自检(字节级)")
ok = True
for path, raw in zip(BANKS, raw_banks):
    back = json.loads(path.read_text(encoding="utf-8"))
    n = 0
    for w in back["wordBank"]:
        if "freq" in w:
            del w["freq"]
            n += 1
    same = dump(back) == raw
    ok &= same and n == total_write
    print(f"   {path.relative_to(ROOT)}")
    print(f"      摘掉 freq 后还原原文  {'✓ 逐字节相同' if same else '✗ 有差异!'}")
    print(f"      文件里的 freq 条数     {n}  {'✓' if n == total_write else '✗'}")
texts = [p.read_text(encoding="utf-8") for p in BANKS]
same_two = len(set(texts)) == 1
ok &= same_two
print(f"   两份词库互相比对            {'✓ 字节相同' if same_two else '✗ 分叉了!'}")
print()
if not ok:
    die("自检没过。备份还在 *.bak,用它回滚。")

print("═" * 66)
print(f"完成:写入 {total_write} 条 freq。")
print("下一步:cd YanApp && npm test —— 必须全绿。")
print("⚠️ 许可 CC-BY 2.0 FR(Tatoeba),发布时须署名。")
print("═" * 66)
