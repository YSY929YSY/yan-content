#!/usr/bin/env python3
"""补第一桶:**同读音候选在 kanjium 里全部一致**的词条。默认 dry-run,要 --write 才落盘。

    python3 tools/pitch-fill-kana-headword.py            # 只看报告
    python3 tools/pitch-fill-kana-headword.py --write    # 落盘(先备份 .bak)

## 判据(机器可判,不含任何对日语的判断)

词库里剩下没有 pitch 的条目,拿 `reading` 去 kanjium 查**所有同读音的条目**:

    只有当这些候选 parseAccents 出来的型**完全一致**时才采用。

`ない` → kanjium 里 内/亡い/無い 全是 1 → 采用 1,没得选。
`する` → 為る=0 而 刷る=1 → **不一致,一律不碰**(留给人工挑表記)。

这一桶大多是「词库用假名当词头、kanjium 用汉字」造成的对不上 ——
表記 对不上,但读音这一层的答案是唯一的,所以不是猜。

⚠️ **只要有一个候选的型不一样就不写。**宁可这个词没有声调,也不要一个可能错的:
声调错了学习者会照着念错,而且没有人会纠正他。

## 留痕

每条都写 `via`,记下是从哪些表記匹配到的,以后任何一条都能被复核:

    "pitch": {"accent": 1, "mora": 3, "source": "kanjium",
              "via": "同读音候选一致: 内/亡い/無い"}

## 排除项(不属于这一桶,这个脚本一条都不碰)

  * `pitch-disputed.json` 里三方打架的
  * `～` 开头的接尾辞/助词(本就没有独立声调)
  * kanjium 里根本没有这个读音的
  * 同读音候选不一致的
  * 型超出拍数的(读音和声调表对不上,画出来的线会落在词外面)

## 排版

原文是 `json.dumps(..., ensure_ascii=False, indent=1)` + 末尾换行,已验证 round-trip
逐字节还原。不重新格式化,否则 diff 会从几百行炸成几十万行。
"""
import json
import re
import shutil
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACC = ROOT / 'tools/data/kanjium-accents.txt'
DISP = ROOT / 'YanApp/staging/pitch-disputed.json'
BANKS = [
    ROOT / 'YanApp/assets/content.fallback.json',
    ROOT / 'yan-content/content.v2.json',
]
REPORT = ROOT / 'YanApp/staging/pitch-fill-kana-headword.json'

WRITE = '--write' in sys.argv
SMALL = 'ゃゅょぁぃぅぇぉャュョァィゥェォゎヮ'


def die(msg):
    print(f'\n✗ {msg}')
    sys.exit(2)


def to_mora(reading):
    """必须和 src/features/wordbank/furigana 的 toMora 一致 —— 对不上测试会当场挂。"""
    out = []
    for ch in str(reading or ''):
        if ch in SMALL and out:
            out[-1] += ch
        else:
            out.append(ch)
    return out


def parse_accents(raw):
    out = []
    for part in str(raw or '').split(','):
        m = re.search(r'(\d+)\s*$', part)
        if not m:
            continue
        v = int(m.group(1))
        if v not in out:
            out.append(v)
    return out


def split_semi(s):
    return [x.strip() for x in re.split(r'[;；]', str(s or '')) if x.strip()]


def dump(doc):
    return json.dumps(doc, ensure_ascii=False, indent=1) + '\n'


# ── 读 kanjium ────────────────────────────────────────────────
if not ACC.exists():
    die(f'找不到 kanjium 表:{ACC}\n  curl -sSL -o {ACC} '
        'https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt')

by_reading = defaultdict(list)   # 読み -> [(表記, 型串)]
for line in ACC.read_text(encoding='utf-8').splitlines():
    p = line.split('\t')
    if len(p) < 3:
        continue
    surface, reading, acc = p[0], p[1], p[2]
    # 纯假名词的 読み 列是空的,表記 本身就是读音
    by_reading[reading or surface].append((surface, acc))

disputed = {tuple(p) for p in json.loads(DISP.read_text(encoding='utf-8'))['pairs']}

raw_banks = [p.read_text(encoding='utf-8') for p in BANKS]
if len(set(raw_banks)) != 1:
    die('两份词库当前就不是字节相同的 —— 先对齐再补声调(wordIds.test.mjs 守着这个)')

bank = json.loads(raw_banks[0])['wordBank']

# ── 分桶 ──────────────────────────────────────────────────────
missing = [w for w in bank if not w.get('pitch')]
buckets = defaultdict(list)
plan = {}

for w in missing:
    word = str(w.get('word') or '')
    reads = split_semi(w.get('reading'))
    if (w.get('word'), w.get('reading')) in disputed:
        buckets['三方交叉验证打架'].append(w); continue
    if word.startswith('～'):
        buckets['～接尾/助词'].append(w); continue
    if not reads:
        buckets['没有读音'].append(w); continue

    cands, absent = [], []
    for r in reads:
        c = by_reading.get(r)
        (cands.extend(c) if c else absent.append(r))
    if absent:
        buckets['kanjium 没有这个读音'].append(w); continue

    parsed = [tuple(parse_accents(a)) for (_, a) in cands]
    if any(not t for t in parsed):
        buckets['候选格式认不出'].append(w); continue
    if len(set(parsed)) != 1:
        buckets['同读音候选不一致(留给人工)'].append(w); continue

    acc = list(set(parsed))[0]
    # mora 必须按 primaryReading(第一个读音)算 —— furigana.test.mjs 交叉验证这一条
    n = len(to_mora(reads[0]))
    if acc[0] > n:
        buckets['声调位置超出拍数'].append(w); continue

    surfaces = sorted({s for (s, _) in cands})
    pitch = {'accent': acc[0]}
    if len(acc) > 1:
        pitch['all'] = list(acc)
    pitch['mora'] = n
    pitch['source'] = 'kanjium'
    if len(acc) > 1:
        pitch['multi'] = True
    pitch['via'] = '同读音候选一致: ' + '/'.join(surfaces)
    plan[w['id']] = pitch
    buckets['同读音候选全部一致(本次补录)'].append(w)

print('═' * 62)
print(f"补第一桶 · {'WRITE ⚠️ 会落盘' if WRITE else 'DRY RUN(不写任何文件)'}")
print('═' * 62)
print(f'词库 {len(bank)} 条,已有 pitch {len(bank) - len(missing)},缺 {len(missing)}\n')
for k in sorted(buckets, key=lambda k: -len(buckets[k])):
    print(f'  {k:<30}{len(buckets[k]):>5}')
print(f'  {"合计":<28}{sum(len(v) for v in buckets.values()):>5}')
print(f'\n本次写入 {len(plan)} 条(其中 multi {sum(1 for p in plan.values() if p.get("multi"))} 条)')

REPORT.parent.mkdir(parents=True, exist_ok=True)
by_id = {w['id']: w for w in bank}
REPORT.write_text(json.dumps({
    'note': '第一桶补录清单。判据:同读音候选在 kanjium 里型全部一致。每条的 via 即来源表記。',
    'source': 'kanjium accents.txt (CC-BY-SA 4.0, 署名 Uros O.)',
    'buckets': {k: len(v) for k, v in buckets.items()},
    'filled': [{'id': i, 'word': by_id[i]['word'], 'reading': by_id[i]['reading'], **p}
               for i, p in plan.items()],
    'skipped': {k: [{'id': w['id'], 'word': w.get('word'), 'reading': w.get('reading')}
                    for w in v] for k, v in buckets.items()
                if k != '同读音候选全部一致(本次补录)'},
}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(f'清单 → {REPORT.relative_to(ROOT)}')

if not WRITE:
    print('\n' + '═' * 62)
    print('DRY RUN —— 没有写入任何词库文件。确认数字后加 --write。')
    sys.exit(0)

# ── 落盘 ──────────────────────────────────────────────────────
new_doc = json.loads(raw_banks[0])
written = 0
for w in new_doc['wordBank']:
    p = plan.get(w.get('id'))
    if p is None:
        continue
    if 'pitch' in w:
        die(f"{w['id']} 已经有 pitch —— 这个脚本只新增,不覆盖")
    w['pitch'] = p
    written += 1
if written != len(plan):
    die(f'实际写入 {written} ≠ 预计 {len(plan)},不落盘')

out = dump(new_doc)
for path in BANKS:
    shutil.copy2(path, path.with_suffix(path.suffix + '.bak'))
    path.write_text(out, encoding='utf-8')
    print(f'   写入 {path.relative_to(ROOT)}')

# ── 自检:摘掉本次新增的 pitch 必须逐字节还原 ───────────────────
ok = True
for path, raw in zip(BANKS, raw_banks):
    back = json.loads(path.read_text(encoding='utf-8'))
    for w in back['wordBank']:
        if w.get('id') in plan:
            del w['pitch']
    same = dump(back) == raw
    ok &= same
    print(f'   {path.name} 摘掉新增 pitch 后还原原文  {"✓ 逐字节相同" if same else "✗ 有差异"}')
texts = [p.read_text(encoding='utf-8') for p in BANKS]
ok &= len(set(texts)) == 1
print(f'   两份词库互相比对  {"✓ 字节相同" if len(set(texts)) == 1 else "✗ 分叉"}')
if not ok:
    die('自检没过。用 *.bak 回滚。')
print('\n完成。下一步:cd YanApp && npm test')
