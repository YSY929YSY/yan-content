#!/usr/bin/env python3
"""从 Tatoeba 母语句里抽 `coreChunk`(搭配)候选。**只出候选,不写内容。**

## 这个脚本要解决什么

词书的门槛卡在 `coreChunk` 上:N3 只有 5%、N2 17%、N1 1% 有搭配,
于是 1386 条例句齐全的 N3 词被藏在「起草」里看不见。缺 6284 条。

搭配**不能从例句里抠**。2026-08-13 量过:同时有搭配和例句的 1763 条里,
搭配是例句子串的只有 24%。看样本就知道为什么 ——

    消す    搭配「電気を消す」   例句「電気を消します。」  ← 词典形 vs 活用形
    下がる  搭配「値段が下がる」 例句「気温が下がるでしょう。」 ← 换了个名词

搭配是**独立选出来的「最典型的伙伴词 + 助词」**,得从语料里统计。

## 铁律:出候选,不定稿

RULE.md 的工具化原则 + HANDOFF 第五节第 5 条:
**工具的价值是找出可疑处,不是替人判断。宁可空着不要猜。**

所以这个脚本:
  · 只写 `staging/`,**永远不碰 content.fallback.json / yan-content/**
  · 每条候选都带频次和**一句真实出处**,人一眼能验
  · 排序不做取舍,Top-N 全给出来,选哪个是人的事
一个自动填进去的错搭配比没有搭配坏得多 —— 它教一个假的助词,而学习者无从判断。

## 语料

`tools/data/tatoeba/`(CC-BY 2.0 FR),24.8 万句母语日语,Sudachi 原形索引已缓存。
覆盖是分层的(2026-08-13 实测,缺搭配的词里语料 ≥20 句的比例):
    N3  86%   ← 现有语料够用
    N2  21%
    N1  25%   ← 不够,要另找语料(见 HANDOFF 第四点五)
所以先跑 N3。N2/N1 别拿这个语料硬跑,句子太少的统计是噪声。

## 用法

    python3 tools/build-corechunk-candidates.py --level N3 --limit 50
    python3 tools/build-corechunk-candidates.py --level N3            # 整级

依赖 sudachipy(仓库里其他脚本已在用)。
"""
import argparse
import json
import os
import pickle
import re
import sys
from collections import Counter, defaultdict

from sudachipy import dictionary, tokenizer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANK_PATH = f'{ROOT}/YanApp/assets/content.fallback.json'
TATOEBA = f'{ROOT}/tools/data/tatoeba'
SPLIT = tokenizer.Tokenizer.SplitMode.C

# 已有搭配的 1763 条里实际用到的型式,照着它们来 —— 不要自己发明新格式
#   名词:  電気を消す / 値段が下がる / 昼間は暑い / 子供の時 / 寝坊する
#   动词:  お金を払う(名词 を 动词)
#   形容词:美味しいラーメン(形容词 + 名词)
CASE_PARTICLES = ('を', 'が', 'に', 'で', 'と', 'へ', 'から', 'より')
TOPIC_PARTICLES = ('は',)

# 这些词当伙伴毫无信息量:「事を する」「人が いる」谁都能搭
STOP_PARTNERS = {
    'する', 'いる', 'ある', 'なる', 'こと', 'もの', 'これ', 'それ', 'あれ', 'ここ',
    'そこ', 'どこ', '人', '事', '物', '方', 'того', 'の', '私', '僕', '彼', '彼女',
    'あなた', '君', '今日', '一', '二', '三', 'それら', 'よう', 'ため', 'とき',
}


def is_proper(m):
    """固有名词。

    Tatoeba 是教学句库,**满篇是 Tom 和 Mary** —— 不挡的话「会う」的前三名是
    「トムに会う」「メアリーに会う」,而正确答案「友達に会う」被挤到第三。
    这不是排序不准,是语料的人造痕迹,按词性能根治。
    地名国名同理:「日本に行く」压过「学校に行く」,前者是语料偏差不是搭配。
    """
    p = m.part_of_speech()
    return p[0] == '名詞' and p[1] == '固有名詞'


def pos_kind(m):
    """把 Sudachi 的词性压成我们关心的四类。固有名词不参与搭配。"""
    p = m.part_of_speech()
    if p[0] == '名詞':
        if p[1] == '固有名詞':
            return 'proper'
        if p[1] == '数詞':
            return 'proper'      # 「3つ買う」也是噪声,数字不是伙伴词
        return 'noun'
    if p[0] == '動詞':
        return 'verb'
    if p[0] in ('形容詞', '形状詞'):
        return 'adj'
    if p[0] == '副詞':
        return 'adv'
    return None


def load_bank():
    return json.load(open(BANK_PATH, encoding='utf-8'))['wordBank']


def load_corpus():
    sents = {}
    with open(f'{TATOEBA}/jpn_sentences.tsv', encoding='utf-8') as f:
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) >= 3:
                sents[parts[0]] = parts[2]
    idx = pickle.load(open(f'{TATOEBA}/jpn_lemma_index.pkl', 'rb'))
    return sents, idx


def extract(target_lemma, target_kind, toks):
    """从一句话里抽出以 target 为核心的搭配。返回 [(chunk, 型式)]。

    只认**相邻**的型式(名词-助词-动词 这样紧挨着的三个词元)。放宽到跨词会
    抓到大量假搭配 —— 长句里任意两个词都能凑一对,那样统计出来的是句子长度,
    不是搭配强度。
    """
    out = []
    n = len(toks)
    lem = [t['lemma'] for t in toks]
    kind = [t['kind'] for t in toks]
    surf = [t['surface'] for t in toks]

    for i in range(n):
        if lem[i] != target_lemma:
            continue

        # ── target 是名词 ──────────────────────────────
        if target_kind == 'noun':
            # 電気を消す / 値段が下がる:名词 + 格助词 + 动词
            if i + 2 < n and surf[i + 1] in CASE_PARTICLES and kind[i + 2] == 'verb':
                if lem[i + 2] not in STOP_PARTNERS:
                    out.append((f'{target_lemma}{surf[i + 1]}{lem[i + 2]}', 'N+助+V'))
            # 昼間は暑い:名词 + は + 形容词
            if i + 2 < n and surf[i + 1] in TOPIC_PARTICLES and kind[i + 2] == 'adj':
                out.append((f'{target_lemma}{surf[i + 1]}{lem[i + 2]}', 'N+は+A'))
            # 寝坊する:サ变
            if i + 1 < n and lem[i + 1] == 'する':
                out.append((f'{target_lemma}する', 'Nする'))
            # 子供の時:名词 + の + 名词(target 在后)
            if i >= 2 and surf[i - 1] == 'の' and kind[i - 2] == 'noun' \
                    and lem[i - 2] not in STOP_PARTNERS:
                out.append((f'{lem[i - 2]}の{target_lemma}', 'N+の+N'))

        # ── target 是动词:找它前面的「名词 + 格助词」 ──
        elif target_kind == 'verb':
            if i >= 2 and surf[i - 1] in CASE_PARTICLES and kind[i - 2] == 'noun' \
                    and lem[i - 2] not in STOP_PARTNERS:
                out.append((f'{lem[i - 2]}{surf[i - 1]}{target_lemma}', 'N+助+V'))

        # ── target 是形容词:美味しいラーメン(連体)/ 名词が形容词 ──
        elif target_kind == 'adj':
            if i + 1 < n and kind[i + 1] == 'noun' and lem[i + 1] not in STOP_PARTNERS:
                out.append((f'{target_lemma}{lem[i + 1]}', 'A+N'))
            if i >= 2 and surf[i - 1] in ('が', 'は') and kind[i - 2] == 'noun' \
                    and lem[i - 2] not in STOP_PARTNERS:
                out.append((f'{lem[i - 2]}{surf[i - 1]}{target_lemma}', 'N+助+A'))

        # ── target 是副词:副词 + 动词 ──────────────────
        elif target_kind == 'adv':
            for j in (i + 1, i + 2):
                if j < n and kind[j] == 'verb' and lem[j] not in STOP_PARTNERS:
                    out.append((f'{target_lemma}{lem[j]}', 'Adv+V'))
                    break
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--level', default='N3', help='只跑这一级(默认 N3)')
    ap.add_argument('--limit', type=int, default=0, help='只跑前 N 个词,用来先看质量')
    ap.add_argument('--min-sents', type=int, default=20,
                    help='语料句数少于这个就跳过 —— 句子太少的统计是噪声(默认 20)')
    ap.add_argument('--top', type=int, default=5, help='每个词给几个候选(默认 5)')
    # 频次 2 的基本是噪声。实测样本里「金持ちの商人(2)」「哲学は難しい(2)」
    # 「犬は嬉しい(2)」全是 2 —— 它们不是搭配,是碰巧同时出现在一句话里。
    # 宁可少给一个词候选,也不要让人在噪声里挑(第五节第 5 条)。
    ap.add_argument('--min-count', type=int, default=3, help='候选至少出现几次(默认 3)')
    ap.add_argument('--out', default=None)
    args = ap.parse_args()

    tok = dictionary.Dictionary().create()
    bank = load_bank()
    sents, idx = load_corpus()

    targets = [w for w in bank
               if not w.get('coreChunk')
               and args.level in (w.get('levels') or [w.get('level')])]
    targets.sort(key=lambda w: w['id'])
    if args.limit:
        targets = targets[:args.limit]

    rows, skipped = [], Counter()
    for w in targets:
        lemma = w['word']
        sids = idx.get(lemma) or idx.get(w.get('reading')) or []
        if len(sids) < args.min_sents:
            skipped['语料不足'] += 1
            continue

        # 目标词自己的词性,由 Sudachi 判 —— 词库的 pos 是中文写的,对不上
        probe = tok.tokenize(lemma, SPLIT)
        tkind = pos_kind(probe[0]) if len(probe) else None
        if tkind is None:
            skipped['词性不支持'] += 1
            continue

        counts, evidence = Counter(), {}
        for sid in sids:
            text = sents.get(str(sid)) if not isinstance(sid, str) else sents.get(sid)
            if not text:
                continue
            toks = [{'surface': m.surface(), 'lemma': m.dictionary_form(), 'kind': pos_kind(m)}
                    for m in tok.tokenize(text, SPLIT)]
            for chunk, pat in extract(lemma, tkind, toks):
                counts[(chunk, pat)] += 1
                evidence.setdefault((chunk, pat), text)

        # 只出现一次的不算搭配,算巧合
        # 「議論する」这类サ变**降到最后**。
        #
        # 它几乎总是榜首(频次最高),但对学习者信息量接近零 —— 「这是个する动词」
        # 是语法事实,而 `pos` 字段里本来就有「名词(する动词)」这个取值。
        # 标准第四节:**能进结构化字段的,不要写成散文。** 占着榜首会把真正的搭配
        # (議論を始める / 議論が進む)挤下去,那才是学习者不知道的东西。
        # 不删掉,是因为个别词确实只有这一种用法 —— 留在末位让人自己判断。
        ranked = sorted(counts.items(), key=lambda kv: (kv[0][1] == 'Nする', -kv[1]))
        cands = [(c, p, n) for (c, p), n in ranked if n >= args.min_count][:args.top]
        if not cands:
            skipped['没抽到候选'] += 1
            continue

        rows.append({
            'id': w['id'], 'word': w['word'], 'reading': w['reading'],
            'level': w.get('level'), 'pos': w.get('pos'),
            'meaning_zh': w.get('meaning_zh'),
            'exampleJp': w.get('exampleJp'),
            'corpusSents': len(sids),
            'candidates': [
                {'chunk': c, 'pattern': p, 'count': n, 'evidence': evidence[(c, p)]}
                for c, p, n in cands
            ],
        })

    out_path = args.out or f'{ROOT}/YanApp/staging/corechunk-candidates-{args.level.lower()}.json'
    payload = {
        'generated': '按 tools/build-corechunk-candidates.py',
        'level': args.level,
        'corpus': 'Tatoeba jpn_sentences (CC-BY 2.0 FR), 248758 句',
        'status': 'candidates-only',
        'note': '**候选,不是定稿。** 每条挑一个写进 coreChunk 之前必须人过目 —— '
                '语料给的是「常见」,不是「典型」,两者经常不是一回事。未写入内容包。',
        'stats': {'目标词': len(targets), '出了候选': len(rows), **dict(skipped)},
        'items': rows,
    }
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write('\n')

    print(f'{args.level}:目标 {len(targets)} 词 → 出候选 {len(rows)} 词')
    for k, v in skipped.items():
        print(f'  跳过({k}) {v}')
    print(f'→ {os.path.relpath(out_path, ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
