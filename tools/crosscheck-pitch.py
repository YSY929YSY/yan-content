#!/usr/bin/env python3
"""三个独立来源交叉验证声调。**只出报告,不改内容。**

## 为什么要三个

声调是给学习者照着念的。念错了他不会知道,也没人纠正 ——
「宁可空着不要猜」在这里比在词源那边更硬。

而我们没有权威审校(NHK / 大辞林的重音辞典是商业的)。能做的是**互不相干的
来源互相印证**。三个:

| 来源 | 出处 | 血统 |
|---|---|---|
| kanjium `accents.txt` | Uros O. 整理,Yomichan / Anki 生态在用 | 个人整理 |
| zh.wiktionary 日语条目 | 维基编者标注 | 维基 |
| **UniDic 2.1.2** `aType` | **国立国语研究所**,语料库标注体系 | 学术机构 |

⚠️ **两个来源不够。** 第一版只比 kanjium 和中文维基,跑出 98% 一致 ——
但维基各语言版之间的日语发音数据经常互相导入,**中文版很可能是英文版的下游**。
同源的两份一致是应该的,不算印证。UniDic 才是真正第三条腿:
它来自 NINJAL 的语料库标注,和前两者没有任何交集。

实测它立刻起作用:`注文` kanjium 说 0、维基说 1,UniDic 说 0 —— 判给 kanjium;
`季節` kanjium 2、维基 1,UniDic 给的是 `1,2` —— **两个都通行,谁都没错**。

## 判定口径

**至少两个来源一致才算「有佐证」。** 只有一个来源、或者三个各说各的,
一律标成待定 —— 那种词宁可不显示声调。

UniDic 的 aType 可能是 `1,2`(多个都通行),按集合比,有交集就算一致。

## 用法

    python3 tools/crosscheck-pitch.py

依赖:
    pip install fugashi unidic-lite      # UniDic 2.1.2,BSD/GPL/LGPL 三重许可
数据:
    tools/data/kanjium-accents.txt       取法见 join-pitch-accent.py
    tools/data/zhwikt-jpn.jsonl
"""
import json
import os
import re
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ACCENTS = f'{ROOT}/tools/data/kanjium-accents.txt'
WIKT = f'{ROOT}/tools/data/zhwikt-jpn.jsonl'
BANK = f'{ROOT}/YanApp/assets/content.fallback.json'
OUT = f'{ROOT}/reports/pitch-crosscheck.md'

DOWNSTEP, GRAVE, ACUTE = 'ꜜ', '̀', '́'
SMALL = 'ゃゅょぁぃぅぇぉャュョァィゥェォゎヮ'


def to_mora(reading):
    out = []
    for ch in str(reading or ''):
        if ch in SMALL and out:
            out[-1] += ch
        else:
            out.append(ch)
    return out


def kata_to_hira(s):
    """UniDic 的 kana 是片假名,词库的 reading 是平假名 —— 不转就一条都对不上。"""
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in str(s or ''))


def accent_from_roman(roman, reading):
    """从 `[nìhóꜜǹ]` + 假名读音数出降调位置。

    ⚠️ 不能只数罗马字上的高低标记:标记打在**元音**上,而 `っ` 在罗马字里是
    双辅音(うっかり → ukkari),不带元音因此没有标记。只数标记会把每个 `っ` 漏掉。
    第一版就这么错的,26 条「不一致」里十几条其实是这个 bug。
    (`ん` 是带标记的,只有 `っ` 要补。)
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
        return 0 if (GRAVE in s or ACUTE in s) else None
    mora = to_mora(reading)
    counted = 0
    for i, m in enumerate(mora):
        if m not in ('っ', 'ッ'):
            counted += 1
        if counted == marks:
            return i + 1
    return marks


def accent_from_tag(tags, mora_n):
    t = set(tags or [])
    if 'Heiban' in t:
        return 0
    if 'Atamadaka' in t:
        return 1
    if 'Odaka' in t:
        return mora_n
    return None          # 中高定不了降在第几拍,交给 roman


def load_kanjium():
    out = {}
    for line in open(ACCENTS, encoding='utf-8'):
        p = line.rstrip('\n').split('\t')
        if len(p) < 3:
            continue
        accs = {int(m.group(1)) for m in re.finditer(r'(\d+)\s*(?:,|$)', p[2])}
        if accs:
            out[(p[0], p[1] or p[0])] = accs
    return out


def load_wiktionary(in_bank):
    out = {}
    for line in open(WIKT, encoding='utf-8'):
        d = json.loads(line)
        if d.get('lang_code') != 'ja':
            continue
        for s in d.get('sounds') or []:
            reading = s.get('other')
            key = (d.get('word'), reading)
            if not reading or key not in in_bank or key in out:
                continue
            n = len(to_mora(reading))
            a = accent_from_tag(s.get('tags'), n)
            if a is None:
                a = accent_from_roman(s.get('roman'), reading)
            if a is not None:
                out[key] = {a}
    return out


def load_unidic(words):
    """按 **(词面, 读音)** 精确查 UniDic,而不是只信分词器给的那一个最优解。

    ⚠️ 2026-08-19 改。原来的写法是 `tagger(word)` 取唯一词元,读音对不上就放弃 ——
    那把最该查的词全丢了:

        私(わたし) df=26526    分词器给 ワタクシ  → 判「读音不符」丢弃
        言う(いう) df=6697     分词器给 ユー      → 丢弃
        時(とき)   df=3354     分词器给 ジ        → 丢弃

    而 UniDic 里这些读音**都在**,只是不是最优解。N-best 能把它们全列出来:

        私  → ワタクシ 0 | ワタシ 0 | アタシ 0 | シ 1
        時  → トキ 2   | ジ 1     | ドキ 2
        中  → ナカ 1   | チュー 1 | ウチ 0

    改成 N-best 逐条按读音匹配后,覆盖率 **6386 → 7238 条(占有声调的 94.1%)**,
    一致率 99.6%。**丢掉的那 852 条里全是高频词** —— 越常用的词读音越多,
    也就越容易被「只取最优解」这个写法漏掉,正好和需求相反。

    仍然只认**整词**:第 0 列必须逐字等于 word,否则那是切碎后的某一段。
    """
    try:
        import fugashi
        import unidic_lite
    except ImportError:
        print('（跳过 UniDic:pip install fugashi unidic-lite）')
        return {}
    tagger = fugashi.Tagger('-d ' + unidic_lite.DICDIR)

    def norm(s):
        # 长音记号要去掉:UniDic 的 pron 写 チュー,词库的 reading 写 ちゅう
        return kata_to_hira(str(s or '')).replace('ー', '')

    out = {}
    for word, reading in words:
        want = norm(reading)
        if not word or not want:
            continue
        try:
            raw = tagger.nbest(word, 12)
        except Exception:
            continue
        accs = set()
        for line in raw.split('\n'):
            if not line or line == 'EOS':
                continue
            col = line.split('\t')
            # 0=表層 1=発音 2=語彙素読み 7=aType
            if len(col) < 8 or col[0] != word:
                continue
            a_raw = col[7].strip()
            if not a_raw or a_raw == '*':
                continue
            # 発音和語彙素読み两列都比:あたし 的 pron 是 アタシ 而 kana 是 ワタシ
            if norm(col[1]) != want and norm(col[2]) != want:
                continue
            accs |= {int(x) for x in re.findall(r'\d+', a_raw)}
        if accs:
            out[(word, reading)] = accs
    return out


def main():
    bank = json.load(open(BANK, encoding='utf-8'))['wordBank']
    keys = [(w.get('word'), w.get('reading')) for w in bank if w.get('word') and w.get('reading')]
    in_bank = set(keys)

    kanjium = load_kanjium()
    wikt = load_wiktionary(in_bank)
    unidic = load_unidic(keys)

    print(f'词库 {len(in_bank)} 条 —— 各来源覆盖:')
    print(f'  kanjium   {sum(1 for k in in_bank if k in kanjium)}')
    print(f'  中文维基   {len(wikt)}')
    print(f'  UniDic    {len(unidic)}')
    print()

    rows = {'三方一致': [], '两方一致': [], '各说各的': [], '只有一个来源': [], '无': []}
    for key in in_bank:
        srcs = {n: s for n, s in
                (('kanjium', kanjium.get(key)), ('维基', wikt.get(key)), ('UniDic', unidic.get(key)))
                if s}
        if not srcs:
            rows['无'].append((key, srcs)); continue
        if len(srcs) == 1:
            rows['只有一个来源'].append((key, srcs)); continue
        names = list(srcs)
        pairs = [(a, b) for i, a in enumerate(names) for b in names[i + 1:]
                 if srcs[a] & srcs[b]]
        if len(srcs) == 3 and len(pairs) == 3:
            rows['三方一致'].append((key, srcs))
        elif pairs:
            rows['两方一致'].append((key, srcs))
        else:
            rows['各说各的'].append((key, srcs))

    total_multi = len(rows['三方一致']) + len(rows['两方一致']) + len(rows['各说各的'])
    print(f'有两个以上来源的 {total_multi} 条:')
    for k in ('三方一致', '两方一致', '各说各的'):
        n = len(rows[k])
        print(f'  {k:<8}{n:>6}  ({100 * n // max(1, total_multi)}%)')
    print(f'\n只有一个来源(无从印证){len(rows["只有一个来源"]):>6}')
    print(f'一个来源都没有         {len(rows["无"]):>6}')

    bad = rows['各说各的']
    if bad:
        print(f'\n★ 三方各说各的 {len(bad)} 条 —— **这些不该显示声调**:')
        for (w, r), s in bad[:20]:
            print('   ', w, f'({r})', ' · '.join(f'{n}{sorted(v)}' for n, v in s.items()))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('# 声调交叉验证 · kanjium × 中文维基 × UniDic\n\n')
        f.write('三个来源血统不同:个人整理 / 维基编者 / 国立国语研究所语料库。\n')
        f.write('**判定:至少两个来源一致才算有佐证。**\n\n')
        f.write(f'| 类别 | 条数 |\n|---|---|\n')
        for k in ('三方一致', '两方一致', '各说各的', '只有一个来源', '无'):
            f.write(f'| {k} | {len(rows[k])} |\n')
        f.write('\n## 各说各的(建议不显示声调)\n\n| 词 | 读音 | 各家说法 |\n|---|---|---|\n')
        for (w, r), s in bad:
            f.write(f'| {w} | {r} | {" · ".join(f"{n}{sorted(v)}" for n, v in s.items())} |\n')
    # 机器可读的一份,给 join-pitch-accent.py 排除用。
    # 不让它自己再判一遍 —— 判据只该有一处,两处迟早会分叉。
    disputed = f'{ROOT}/YanApp/staging/pitch-disputed.json'
    os.makedirs(os.path.dirname(disputed), exist_ok=True)
    with open(disputed, 'w', encoding='utf-8') as f:
        json.dump({
            'note': '三个来源各说各的。**不要显示这些词的声调** —— 空着不会教错,'
                    '给一个错的会。判定和明细见 reports/pitch-crosscheck.md',
            'pairs': sorted([list(k) for k, _ in bad]),
        }, f, ensure_ascii=False, indent=1)
        f.write('\n')

    print(f'\n→ {os.path.relpath(OUT, ROOT)}')
    print(f'→ {os.path.relpath(disputed, ROOT)}  ({len(bad)} 条,join 时自动排除)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
