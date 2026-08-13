#!/usr/bin/env python3
"""把 kanjium 的声调数据 join 到词库上。**只出 staging 产物,不碰内容文件。**

## 为什么这一条和「搭配」不一样

搭配(coreChunk)没有开放的权威源,所以那条线本质上是拿小语料猜。
声调有:**这是一次 join,不是一次创作** —— 和五十音那条线同一个模式。
一个词的声调型是封闭答案,抄完能机器验(覆盖率、格式、拍数对不对得上)。

    凡是「和一份数据集做 join」的都能规模化,凡是「写出来的」都不能。

## 数据源与许可

[kanjium](https://github.com/mifunetoshiro/kanjium) `data/source_files/raw/accents.txt`
124,137 词,格式 `表記 \\t 読み \\t 型`。

**CC-BY-SA 4.0,署名 Uros O.** —— 和 JMdict 同一个许可。
⚠️ 上线前必须加进「关于 → 数据来源」那一屏,而且**要和言的原创内容分开写**:
原创内容不该被误认为也在 ShareAlike 之下(JMdict 已经是这么处理的,照抄那个写法)。

## 用法

    python3 tools/join-pitch-accent.py

数据落在 `tools/data/kanjium-accents.txt`。**`tools/data/` 是 gitignored 的**
(和 jmdict / tatoeba 一个待遇,语料太大不进仓库),所以换台机器要先取一次:

    curl -sSL -o tools/data/kanjium-accents.txt \
      https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt

3.2MB。**这行命令必须留在这儿** —— 语料不在仓库里,取数据的方法要是也不在,
这个脚本对第二个人就是不可运行的(2026-08-13 刚因为「生成脚本只在 scratchpad 里」
补过一次同类的坑)。

产物:`YanApp/staging/pitch-accent.json`(id → 声调型)+ 一份覆盖报告。
**不写 content.fallback.json,不写 yan-content/。** 并入内容包要走发版流程。

## 实测(2026-08-13,8047 条词库)

    采用            7574 (94%)   N5 82% / N4 88% / N3 95% / N2 93% / N1 94%
    对不上           434 (5%)
    接尾辞(～)         39         本来就没有独立声调,不算缺口
    格式认不出 / 声调超出拍数  0    数据很干净

**第一版跑出来是 85%,那是我 join 写错造出来的假数字** —— 995 个纯假名词条
(アパート / あなた / いいえ)全都没进来。原因见下面读表那一段。
教训是老一条:**覆盖率这种「看起来合理」的数字最会骗人**,85% 和 94% 都像对的,
不去看漏了谁就发现不了。看一眼漏掉的名单,别只看比例。

N5 仍是最低(82%),剩下的主要是 `～円 / ～回` 接尾辞和 `いい; よい` 这类多写法词头。

**只认「表記+読み 都对上」的。** 只对上読み 的那 323 条不要 —— 同音异形词
(箸/橋/端 都是 はし)声调不同,按読み 匹配会随机安一个错的上去,
而这恰恰是这个功能最该做对的地方。宁可空着不要猜。
"""
import argparse
import json
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANK = f'{ROOT}/YanApp/assets/content.fallback.json'
OUT = f'{ROOT}/YanApp/staging/pitch-accent.json'

SMALL = 'ゃゅょぁぃぅぇぉャュョァィゥェォゎヮ'


def to_mora(reading):
    """和 src/features/wordbank/pitch.js 的 toMora 必须一致 —— 两边算出不同的拍数,
    审计说通过而界面画错位。这里只用来校验,渲染以 JS 那份为准。"""
    out = []
    for ch in str(reading or ''):
        if ch in SMALL and out:
            out[-1] += ch
        else:
            out.append(ch)
    return out


def parse_accents(raw):
    """同 pitch.js 的 parseAccents:括号里的词性标注丢掉,只取数字。"""
    out = []
    for part in str(raw or '').split(','):
        m = re.search(r'(\d+)\s*$', part)
        if not m:
            continue
        v = int(m.group(1))
        if v not in out:
            out.append(v)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--accents', default=f'{ROOT}/tools/data/kanjium-accents.txt',
                    help='kanjium 的 accents.txt(默认 tools/data/kanjium-accents.txt)')
    ap.add_argument('--out', default=OUT)
    args = ap.parse_args()

    table = {}
    with open(args.accents, encoding='utf-8') as f:
        for line in f:
            p = line.rstrip('\n').split('\t')
            if len(p) < 3:
                continue
            surface, reading, acc = p[0], p[1], p[2]
            # ⚠️ 纯假名词的 読み 列是**空的**(表記 本身就是读音):
            #     アパート \t \t 2
            # 不处理这一条的话,995 个纯假名词条全部 join 不上 —— 而 アパート、
            # あなた、いいえ 这些都是有声调的常用词,漏掉它们等于漏掉 N5 的一大半。
            # 第一版就是这么漏的,覆盖率看起来 85%,其实假名词一条没进来。
            table[(surface, reading or surface)] = acc

    bank = json.load(open(BANK, encoding='utf-8'))['wordBank']

    # 三方交叉验证判定「各说各的」的词,一律不收。
    #
    # 判据在 crosscheck-pitch.py 那一处,这里只读结论 —— 两处各判一遍迟早会分叉。
    # 空着不会教错,给一个错的会:声调是照着念的东西,念错了学习者不会知道。
    disputed = set()
    dp = f'{ROOT}/YanApp/staging/pitch-disputed.json'
    if os.path.exists(dp):
        for pair in json.load(open(dp, encoding='utf-8')).get('pairs', []):
            disputed.add(tuple(pair))
    else:
        print('⚠️ 没找到 pitch-disputed.json —— 先跑 tools/crosscheck-pitch.py,'
              '否则三个来源打架的那些词会被原样收进去')

    hits, stats, bad = {}, Counter(), []
    for w in bank:
        key = (w.get('word'), w.get('reading'))
        if key in disputed:
            stats['三方打架,不收'] += 1
            continue
        raw = table.get(key)
        if raw is None:
            # 接尾辞(～円/～回)本来就没有独立声调,不算缺口,单独计数
            stats['接尾辞等(本就无声调)' if str(w.get('word', '')).startswith('～')
                  else '对不上'] += 1
            continue
        acc = parse_accents(raw)
        if not acc:
            stats['格式认不出'] += 1
            bad.append({'id': w['id'], 'raw': raw})
            continue

        # 校验:降调位置不能超过拍数。超了说明读音和声调表对不上,
        # 那条数据不能用 —— 画出来的线会落在词的外面。
        n = len(to_mora(w.get('reading')))
        primary = acc[0]
        if primary > n:
            stats['声调位置超出拍数'] += 1
            bad.append({'id': w['id'], 'reading': w.get('reading'),
                        'mora': n, 'accent': primary, 'raw': raw})
            continue

        hits[w['id']] = {'accent': primary, 'all': acc, 'mora': n}
        stats['采用'] += 1
        if len(acc) > 1:
            stats['(其中)有多个型,只取第一个'] += 1

    payload = {
        'source': 'kanjium accents.txt (CC-BY-SA 4.0, 署名 Uros O.)',
        'sourceUrl': 'https://github.com/mifunetoshiro/kanjium',
        'license': 'CC-BY-SA-4.0',
        'attributionNote': '上线前必须加进「关于 → 数据来源」,且与言的原创内容分开写',
        'status': 'staging',
        'note': '**未并入内容包。** id → 声调型。只收「表記+読み 都对上」的,'
                '按読み 匹配会给同音异形词(箸/橋/端)安错声调,那是这个功能最该做对的地方。',
        'stats': dict(stats),
        'accents': hits,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write('\n')

    # 开发期预览表:`id → 声调型` 的紧凑映射,词卡在 __DEV__ 下从它读。
    # 和 wordfield-preview.json 同一个模式 —— 内容还在 staging,没并进内容包,
    # 但真机上得看得见才验得了。**它是派生物**,改了 staging 就重跑这个脚本,别手改。
    preview = {wid: v['accent'] for wid, v in hits.items()}
    ppath = os.path.join(ROOT, 'YanApp/src/features/wordbank/pitch-preview.json')
    with open(ppath, 'w', encoding='utf-8') as f:
        json.dump(preview, f, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
        f.write('\n')
    print(f'预览表 {len(preview)} 条 → {os.path.relpath(ppath, ROOT)} '
          f'({os.path.getsize(ppath) // 1024} KB)')

    total = len(bank)
    print(f'词库 {total} 条')
    for k, v in stats.most_common():
        print(f'  {k:<24}{v:>6}  ({100 * v // total}%)')
    if bad:
        print(f'\n可疑 {len(bad)} 条(未采用),前 5:')
        for b in bad[:5]:
            print('   ', b)
    print(f'\n→ {os.path.relpath(args.out, ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
