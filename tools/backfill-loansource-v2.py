#!/usr/bin/env python3
"""从 JMdict 补全词源(loanSource),并把它归一成**跨语言共享的节点**。

用法:
    python3 tools/backfill-loansource-v2.py            # 只出报告
    python3 tools/backfill-loansource-v2.py --write    # 写回 staging(仍然不碰内容包)

## 这个字段不是「给日语用的注记」,是一条边

现在 loanSource 长这样:{"lang":"eng","word":"apartment"}。
它看起来是「アパート 来自英语 apartment」,但**真正的用法是把 アパート 挂到
一个叫 eng:apartment 的共享节点上**。

区别在加第二门语言的时候显现:
  · 当成注记(成对建):西语上线要另写 西→中、西→英,n 种语言要 n(n-1)/2 套
  · 当成节点(共享建):西语的 apartamento 也挂 eng:apartment,**桥自己就出现了**

所以补数据这件事,只要多守一条规则,就等于把架构也一起定了:

    **value 必须是可归一的词元(lemma),不是解释性的文字。**

「apartment」是节点,「来自英语 apartment 一词」不是。归一规则见 norm_lemma()。
JMdict 的 languageSource 天生就是词元,这是它比人工写注记可靠的地方。
"""
import json
import os
import re
import sys
import unicodedata
import collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANK = os.path.join(ROOT, 'YanApp', 'assets', 'content.fallback.json')
JMDICT = os.path.join(ROOT, 'YanApp', 'staging', 'jmdict-eng-3.6.2.json')
OUT = os.path.join(ROOT, 'YanApp', 'staging', 'loansource-backfill.json')


def norm_lemma(s: str) -> str:
    """词元归一 —— 这一步决定两门语言的词能不能落到同一个节点上。

    小写、去重音符号以外的装饰、去首尾标点、多空格并一个。
    **不去重音**(café ≠ cafe 在法语里是两个词),只做安全的清洗。
    """
    s = unicodedata.normalize('NFC', (s or '').strip().lower())
    s = re.sub(r'^[\'"“”‘’(\[]+|[\'"“”‘’)\]，,.;:!?]+$', '', s)
    return re.sub(r'\s+', ' ', s)


def node_id(lang: str, lemma: str) -> str:
    """共享节点的 id。跨语言唯一,任何语言的词都能挂上来。"""
    return f'{lang}:{lemma}'


def main(write=False):
    bank = json.load(open(BANK, encoding='utf-8'))['wordBank']
    jm = json.load(open(JMDICT, encoding='utf-8'))['words']
    src = {}
    for w in jm:
        ls = []
        for s in w.get('sense', []):
            for x in s.get('languageSource') or []:
                if x.get('text'):
                    ls.append({'lang': x['lang'], 'word': x['text'],
                               'wasei': bool(x.get('wasei'))})
        if ls:
            src[str(w['id'])] = ls

    filled, already, nokey, nodata = [], 0, 0, 0
    for w in bank:
        if w.get('loanSource'):
            already += 1
            continue
        seq = str(w.get('jmdictSeq') or '')
        if not seq:
            nokey += 1
            continue
        ls = src.get(seq)
        if not ls:
            nodata += 1
            continue
        seen, clean = set(), []
        for x in ls:
            lemma = norm_lemma(x['word'])
            if not lemma or (x['lang'], lemma) in seen:
                continue
            seen.add((x['lang'], lemma))
            e = {'lang': x['lang'], 'word': lemma, 'node': node_id(x['lang'], lemma)}
            if x['wasei']:
                # 和製英語:形状像英语,英语里没有这个词。
                # 标出来是因为它对学习者是**反向陷阱** —— サラリーマン 不能拿去跟英语母语者说。
                e['wasei'] = True
            clean.append(e)
        if clean:
            filled.append({'id': w.get('id'), 'word': w.get('word'),
                           'level': w.get('level'), 'loanSource': clean})

    langs = collections.Counter(e['lang'] for f in filled for e in f['loanSource'])
    wasei = sum(1 for f in filled for e in f['loanSource'] if e.get('wasei'))

    print(f'词库 {len(bank)} 条')
    print(f'  已有词源      {already}')
    print(f'  ★ 可补        {len(filled)}   → 覆盖率 {already}/{len(bank)}'
          f' = {already/len(bank)*100:.1f}%  →  {(already+len(filled))/len(bank)*100:.1f}%')
    print(f'  没有 jmdictSeq {nokey}(接不上,只能人工)')
    print(f'  JMdict 也没写   {nodata}\n')
    print('补进来的来源语言:', dict(langs.most_common(12)))
    print(f'其中和製英語:{wasei} 条 —— 这批是**反向陷阱**,长得像英语但英语里没有\n')

    print('抽样:')
    for f in filled[:12]:
        s = ' / '.join(f"{e['node']}{'(和製)' if e.get('wasei') else ''}" for e in f['loanSource'])
        print(f"  {f['word']:<12} {f['level']:<3} ← {s}")

    # 共享节点:同一个节点被几个词挂着 —— 这就是「桥」的雏形
    node = collections.Counter(e['node'] for f in filled for e in f['loanSource'])
    multi = {k: v for k, v in node.items() if v > 1}
    print(f'\n被多个词挂着的节点:{len(multi)} 个(同一来源词派生出多个日语词)')
    for k, v in collections.Counter(multi).most_common(5):
        who = [f['word'] for f in filled if any(e['node'] == k for e in f['loanSource'])]
        print(f'  {k}  ← {" ".join(who)}')

    if write:
        json.dump({'note': '草稿,未并入内容包。node 是跨语言共享节点 id。',
                   'items': filled}, open(OUT, 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=1)
        print(f'\n写入 {OUT}')
    else:
        print('\n(只出报告。加 --write 写进 staging,仍然不碰内容包)')
    return 0


if __name__ == '__main__':
    sys.exit(main('--write' in sys.argv))
