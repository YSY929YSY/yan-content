#!/usr/bin/env python3
"""例句分词 —— 离线跑,产物进内容包,运行时零依赖。

为什么必须离线:
  · 唯一能同时给「切分 + 读音 + 词性」的是带词典的分析器,而词典 207 MB
    (SudachiDict-core)。运行时方案(kuromoji)词典也有 17.8 MB,必须进 App 包,
    还要自己写 RN 加载器 —— 而这里的产物只有几百 KB。
  · 词性只有分析器给得了,而罗马音里「は 当助词才读 wa」这种判断需要词性。

许可证:SudachiPy(Apache-2.0)+ SudachiDict-core(Apache-2.0)。
**只分发派生的读音数据,不分发词典本身。** 上架前要在「数据来源」那一屏
加一条 Sudachi 的 Apache-2.0 署名 —— 和已有的 JMdict / kanjium 并列。

⚠️ 产物**只存 词面 + 读音**,不存对齐好的注音分段。
对齐交给渲染时的 src/features/wordbank/furigana.ts(纯函数,有测试,
含汉字词实测 6962/6963)。理由:对齐规则只该有一份实现;烤进数据的话
以后改规则要重跑管线,而且两边会长歪。

用法:
    python3 scripts/build-example-tokens.py            # 只报告,不写文件
    python3 scripts/build-example-tokens.py --write    # 写 assets/example_tokens.json
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'content.fallback.json')
OUT = os.path.join(ROOT, 'assets', 'example_tokens.json')

# 和 furigana.ts 的 NEEDS_RUBY 必须一致 —— 两边不一致的话,
# 这里报的「能对齐多少」就不是客户端真实的表现
NEEDS_RUBY = re.compile(r'[一-龿㐀-䶿々ヶ]')


def to_hira(s):
    return ''.join(
        chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c
        for c in s
    )


def align(word, reading):
    """和 furigana.ts 同一套算法。返回 True 表示对得上。"""
    if not word or not reading:
        return False
    runs, mode, buf = [], None, ''
    for ch in word:
        m = bool(NEEDS_RUBY.match(ch))
        if m != mode:
            if buf:
                runs.append((buf, mode))
            buf, mode = '', m
        buf += ch
    if buf:
        runs.append((buf, mode))
    if not any(m for _, m in runs):
        return True                       # 整词假名,本来就不用注
    pat = ''.join('(.+?)' if m else re.escape(to_hira(t)) for t, m in runs)
    return re.fullmatch(pat, to_hira(reading)) is not None


# ── 读音覆盖表 ────────────────────────────────────────────────
#
# ⚠️ **这张表里的每一条都是教学判断,不是从数据里跑出来的。**
#
# 决策记录 E1 把声明分成两类:「有源可核的」(读音、音调、JMdict 释义)和
# 「没有源的」(这句话自然吗、日本人真会这么说吗)。分词器给的读音属于第一类 ——
# 它有词典可查。而「同一个词在教学场景里该教哪个读音」属于第二类。
#
# 所以这张表**不允许悄悄长大**:每加一条都要写清理由,而且宁可少写。
# 真正的解法不是「让 CC 判断」,是有一天找到可核的源(比如教材词表)。
#
# ⚠️ 一个反面教训:我原本打算「拿词库的 reading 当准绳去纠分词器」,
# 跑出来 101 种不一致、379 处 —— 而前 20 条几乎**全是分词器对**:
#     来ます=きます(词库 らい)  三時=さんじ(词库 とき)
#     弁当箱=べんとうばこ(词库 はこ,这是连浊)
# 词库存的是词典形,句子里读音本来就会变。那个方案当场作废。
SURFACE_OVERRIDES = {
    # わたくし 是敬体读法;现代日常和教材里 私 一律教 わたし。
    # 词库自己两条都有(私/わたし 和 私/わたくし),所以不是「词库说了算」能解决的。
    '私': 'わたし',
    # あす 偏书面/新闻;口语和 N5 教材是 あした。同一个理由。
    '明日': 'あした',
}

# 何 的读音看后面接什么,不是固定的。分词器给了清一色「なん」,
# 而例句里 `何を食べますか` / `何を売って` 这些该读「なに」。
#
# ⚠️ 只列**没有歧义**的助词。`何で` 故意不列 ——
# なんで(为什么)和 なにで(用什么)都成立,靠后接词判断不了。
NANI_PARTICLES = {'を', 'が', 'も', 'か', 'に'}


def apply_overrides(toks):
    """就地改读音。返回改了几处。"""
    n = 0
    for i, t in enumerate(toks):
        want = SURFACE_OVERRIDES.get(t['t'])
        if t['t'] == '何':
            nxt = toks[i + 1]['t'] if i + 1 < len(toks) else ''
            want = 'なに' if nxt in NANI_PARTICLES else None
        if want and t['r'] != want:
            t['r'] = want
            n += 1
    return n


def main():
    write = '--write' in sys.argv
    from sudachipy import Dictionary, SplitMode

    with open(SRC, encoding='utf-8') as f:
        content = json.load(f)
    bank = content.get('wordBank', [])
    tok = Dictionary(dict='core').create()

    out = {}
    n_sent = n_tok = n_kanji_tok = n_aligned = n_over = 0
    broken = []          # 表层拼不回原句的
    failed = []          # 含汉字但对不上的

    for w in bank:
        sent = (w.get('exampleJp') or '').strip()
        wid = w.get('id')
        if not sent or not wid:
            continue
        n_sent += 1
        toks = []
        for m in tok.tokenize(sent, SplitMode.C):
            surface = m.surface()
            reading = to_hira(m.reading_form() or '')
            toks.append({'t': surface, 'r': reading})
            n_tok += 1
            if NEEDS_RUBY.search(surface):
                n_kanji_tok += 1
                if align(surface, reading):
                    n_aligned += 1
                elif len(failed) < 20:
                    failed.append(f'{wid} {surface}/{reading}')

        n_over += apply_overrides(toks)

        # ⚠️ 这一条是整个脚本里最重要的自检:表层拼起来必须**逐字等于原句**。
        # 分词器吞字、改字、规范化标点都在这里现原形 —— 而它不报错,
        # 只是让例句在屏幕上少一个字,没人会发现。
        if ''.join(t['t'] for t in toks) != sent:
            broken.append(wid)
            continue                      # 拼不回去的**不要**,宁可这句不注音

        # ⚠️ 紧凑格式:这份东西要**打进 App 包**,每个字段名都要付一次运费。
        #     不需要注音的 token   → "きのこ"        (光秃秃一个字符串)
        #     需要注音的 token     → ["美味しい","おいしい"]
        # 用 {"t":…,"r":…} 的话每个 token 多 14 个字节,3.6 万个 token 就是半兆。
        # 客户端判型只要 typeof === 'string',不值得为可读性多付这笔。
        out[wid] = [
            t['t'] if t['r'] == to_hira(t['t']) else [t['t'], t['r']]
            for t in toks
        ]

    print(f'例句            {n_sent}')
    print(f'token           {n_tok}')
    print(f'含汉字 token    {n_kanji_tok}')
    print(f'  能对齐        {n_aligned}  ({n_aligned / n_kanji_tok * 100:.2f}%)')
    print(f'读音覆盖        {n_over} 处   ← 教学判断,见 SURFACE_OVERRIDES')
    print(f'表层拼不回原句  {len(broken)}   ← 这些句子整句丢弃')
    print(f'收进产物的句子  {len(out)}')
    if failed:
        print('对不上的样本:', ' / '.join(failed[:10]))
    if broken:
        print('拼不回去的样本:', ' '.join(broken[:10]))

    blob = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    print(f'产物大小        {len(blob.encode("utf-8")) / 1024:.1f} KB')

    if write:
        with open(OUT, 'w', encoding='utf-8') as f:
            f.write(blob)
        print(f'已写 {OUT}')
    else:
        print('(没写文件。要写加 --write)')


if __name__ == '__main__':
    main()
