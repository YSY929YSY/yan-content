#!/usr/bin/env python3
"""拿中文维基词典当**独立第二来源**,交叉验证 kanjium 的声调数据。**只出报告。**

## 为什么需要这个

声调数据是给学习者照着念的。念错了他不会知道,而且没人纠正 ——
「补错的词源比没有词源坏得多」那条规矩在这里同样成立,甚至更严重。

而我们没有权威审校(NHK / 大辞林的重音辞典是商业的,不能直接比对)。
唯一能做的是**两个互不相干的来源互相印证**:

  · kanjium `accents.txt`     —— Uros O. 整理,Yomichan / Anki 生态在用
  · zh.wiktionary 的日语条目  —— 维基编者标注,来源与 kanjium 无关

两边一致的,可信度高得多;两边打架的,**一条都不能信**,要挑出来单独处理。
这不是「验证正确」,是「找出可疑处」—— 工具能做的只有后者。

## 维基那边的数据长什么样

    {"tags": ["Nakadaka"], "other": "にほん", "roman": "[nìhóꜜǹ]"}

  · tags   Heiban(平板) / Atamadaka(頭高) / Nakadaka(中高) / Odaka(尾高)
  · roman  每个拍标了高低(◌̀ 低 / ◌́ 高),`ꜜ` 是降调位置

**降调位置从 roman 数**:数 `ꜜ` 前面有几个带高低标记的音节即可。
只靠 tags 不够 —— 中高只说明「降在中间」,没说降在第几拍。

## 用法

    python3 tools/crosscheck-pitch.py

需要 `tools/data/kanjium-accents.txt`(取法见 join-pitch-accent.py)
和 `tools/data/zhwikt-jpn.jsonl`。
"""
import json
import os
import re
import sys
import unicodedata
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ACCENTS = f'{ROOT}/tools/data/kanjium-accents.txt'
WIKT = f'{ROOT}/tools/data/zhwikt-jpn.jsonl'
BANK = f'{ROOT}/YanApp/assets/content.fallback.json'

DOWNSTEP = 'ꜜ'          # ꜜ
GRAVE, ACUTE = '̀', '́'

SMALL = 'ゃゅょぁぃぅぇぉャュョァィゥェォゎヮ'


def to_mora(reading):
    """和 pitch.js / join-pitch-accent.py 的 toMora 一致。"""
    out = []
    for ch in str(reading or ''):
        if ch in SMALL and out:
            out[-1] += ch
        else:
            out.append(ch)
    return out


def accent_from_roman(roman, reading):
    """从 `[nìhóꜜǹ]` + 假名读音,数出降调位置。

    ⚠️ **不能只数罗马字上的高低标记。**
    标记是打在元音上的,而 `っ` 在罗马字里写成双辅音(うっかり → ukkari),
    **不带元音、因此没有标记**。只数标记会把每个 `っ` 都漏掉,结果比真值小。

    第一版就是这么写的,跑出来 26 条「不一致」,其中十几条是清一色的
    「kanjium 恰好比我大 1,而且词里都有 っ」—— 那不是数据打架,是我的解析器错了。
    (`ん` 是带标记的:にほん → nìhóǹ,所以只有 `っ` 要补。)

    做法:数出 `ꜜ` 前有几个**带标记的拍**,再回假名里走,
    把路上遇到的 `っ` 一起算进去。
    """
    if not roman or not reading:
        return None
    s = unicodedata.normalize('NFD', roman)
    marks = 0
    for ch in s:
        if ch == DOWNSTEP:
            break
        if ch in (GRAVE, ACUTE):
            marks += 1
    else:
        # 没有 ꜜ:整词不降 = 平板
        return 0 if (GRAVE in s or ACUTE in s) else None

    mora = to_mora(reading)
    counted = 0
    for i, m in enumerate(mora):
        if m not in ('っ', 'ッ'):
            counted += 1
        if counted == marks:
            return i + 1                 # 降在这一拍之后
    return marks


def accent_from_tag(tags, mora_n):
    """tags 能定的三种。中高定不了(它只说降在中间),返回 None 交给 roman。"""
    t = set(tags or [])
    if 'Heiban' in t:
        return 0
    if 'Atamadaka' in t:
        return 1
    if 'Odaka' in t:
        return mora_n
    return None


def main():
    for p in (ACCENTS, WIKT):
        if not os.path.exists(p):
            print(f'✗ 缺文件:{p}')
            return 2

    kanjium = {}
    for line in open(ACCENTS, encoding='utf-8'):
        p = line.rstrip('\n').split('\t')
        if len(p) >= 3:
            surface, reading, acc = p[0], p[1], p[2]
            m = re.search(r'(\d+)', acc.split(',')[0])
            if m:
                kanjium[(surface, reading or surface)] = int(m.group(1))

    # 词库里的词才有意义 —— 全量比对会把大量我们根本不展示的词算进去
    bank = json.load(open(BANK, encoding='utf-8'))['wordBank']
    in_bank = {(w.get('word'), w.get('reading')) for w in bank}

    agree, disagree, only_one = 0, [], 0
    seen = set()
    for line in open(WIKT, encoding='utf-8'):
        d = json.loads(line)
        if d.get('lang_code') != 'ja':
            continue
        word = d.get('word')
        for s in d.get('sounds') or []:
            reading = s.get('other')
            if not word or not reading:
                continue
            key = (word, reading)
            if key not in in_bank or key in seen:
                continue
            k = kanjium.get(key)
            if k is None:
                continue
            n = len(to_mora(reading))
            w_acc = accent_from_tag(s.get('tags'), n)
            if w_acc is None:
                w_acc = accent_from_roman(s.get('roman'), reading)
            if w_acc is None:
                continue
            seen.add(key)
            if w_acc == k:
                agree += 1
            else:
                disagree.append((word, reading, k, w_acc, s.get('tags'), s.get('roman')))

    total = agree + len(disagree)
    if not total:
        print('✗ 两边没有可比对的交集 —— 检查数据文件')
        return 1

    print(f'词库里两边都有的:{total} 条')
    print(f'  一致    {agree} ({100 * agree // total}%)')
    print(f'  不一致  {len(disagree)} ({100 * len(disagree) // total}%)')
    print()
    print('不一致的**一条都不能信**,要人挑一遍。前 25 条:')
    for word, reading, k, w, tags, roman in disagree[:25]:
        print(f'  {word}({reading})  kanjium 型{k}  维基 型{w}  {tags} {roman}')

    out = f'{ROOT}/reports/pitch-crosscheck.md'
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write('# 声调交叉验证 · kanjium vs 中文维基词典\n\n')
        f.write('两个来源互不相干。一致的可信度高;**不一致的一条都不能信**。\n\n')
        f.write(f'- 可比对:{total}\n- 一致:{agree}({100 * agree // total}%)\n')
        f.write(f'- 不一致:{len(disagree)}\n\n## 不一致明细\n\n')
        f.write('| 词 | 读音 | kanjium | 维基 | 维基 tags | 维基 roman |\n|---|---|---|---|---|---|\n')
        for word, reading, k, w, tags, roman in disagree:
            f.write(f'| {word} | {reading} | 型{k} | 型{w} | {tags} | `{roman}` |\n')
    print(f'\n→ {os.path.relpath(out, ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
