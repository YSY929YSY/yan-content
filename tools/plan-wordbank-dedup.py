#!/usr/bin/env python3
"""词库同形同音去重:只出报告,不改任何文件。

用法:
    python3 tools/plan-wordbank-dedup.py            # 报告
    python3 tools/plan-wordbank-dedup.py --json     # 机器可读的合并计划

## 为什么这件事必须先出报告再动手

词库是**推给所有已装 App** 的内容包。去重会改词条数(check-content-release.sh 里有写死的
期望值,2026-08 那次去重就是被它正确拦下的),而且删掉的词条如果有人学过,
进度会显示成「没学过」且不自愈 —— 除非同时写 keyAliases 把进度折算过去。

所以流程是:出报告 → 人看 → 定策略 → 一次性改词条 + 期望值 + keyAliases → 推。
不是「顺手删一下」。

## 保留哪一条

**留 JLPT 级别低的那条。** 证据:重复对里高级别那条的等级明显是错的 ——
いいえ 标成 N1、明後日 标成 N1、醤油 标成 N2,全是 N5 词。
说明高级别那份来自一次没做去重的合并,连等级都是拍的。

低级别那条缺字段时,从高级别那条补(只补空缺,不覆盖)。
"""
import json
import os
import sys
import collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANK = os.path.join(ROOT, 'YanApp', 'assets', 'content.fallback.json')
LEVEL_RANK = {'N5': 0, 'N4': 1, 'N3': 2, 'N2': 3, 'N1': 4}

# 进度键就是 f"{word}-{reading}"(见 App.js 的 wordKey)。
# 同形同音的两条**本来就共用一个进度键** —— 这是这次去重最大的运气:
# 删掉重复的那条不会让任何人的进度失效,因为进度从来没按 id 存过。
def progress_key(w):
    return f"{w.get('word')}-{w.get('reading')}"


def main(as_json=False):
    bank = json.load(open(BANK, encoding='utf-8'))['wordBank']
    by = collections.defaultdict(list)
    for w in bank:
        by[(w.get('word'), w.get('reading'))].append(w)
    dups = {k: v for k, v in by.items() if len(v) > 1}

    plan, field_gain = [], collections.Counter()
    for (word, reading), group in dups.items():
        group = sorted(group, key=lambda w: LEVEL_RANK.get(w.get('level'), 9))
        keep, drop = group[0], group[1:]
        fills = {}
        for d in drop:
            for k, v in d.items():
                if k in ('id', 'level'):
                    continue
                if not keep.get(k) and v:
                    fills[k] = v
                    field_gain[k] += 1
        plan.append({
            'word': word, 'reading': reading,
            'keep': keep.get('id'), 'keepLevel': keep.get('level'),
            'drop': [d.get('id') for d in drop],
            'dropLevels': [d.get('level') for d in drop],
            'fillFromDropped': fills,
            'sameMeaning': len({w.get('meaning_zh') for w in group}) == 1,
            'progressKeyShared': len({progress_key(w) for w in group}) == 1,
        })

    if as_json:
        json.dump(plan, sys.stdout, ensure_ascii=False, indent=1)
        return 0

    n_drop = sum(len(p['drop']) for p in plan)
    print(f'词条 {len(bank)} → 去重后 {len(bank) - n_drop}(删 {n_drop} 条,{len(plan)} 组)\n')

    shared = sum(1 for p in plan if p['progressKeyShared'])
    print(f'★ 进度键相同的组:{shared}/{len(plan)}')
    print('  进度键是「词-读音」,同形同音天然共用一个键 —— **删掉重复条不会让任何人的进度失效**,')
    print('  也就不需要 keyAliases。这是这次去重最大的运气,值得先确认再动手。\n')

    same = sum(1 for p in plan if p['sameMeaning'])
    print(f'释义一字不差:{same} 组 · 措辞不同:{len(plan) - same} 组')
    print('  措辞不同**不等于**义项不同 —— 抽查下来是同一个词被两轮各写了一遍中文,')
    print('  不是「一个词的两个义项」。义项拆分要另立标准,不在这次范围。\n')

    if field_gain:
        print('从被删条补回来的字段(只补空缺,不覆盖):')
        for k, n in field_gain.most_common():
            print(f'  {k:<16} {n} 条')
        print()

    print('── 逐组明细 ' + '─' * 50)
    for p in sorted(plan, key=lambda x: LEVEL_RANK.get(x['keepLevel'], 9)):
        drops = ' '.join(f'{i}({lv})' for i, lv in zip(p['drop'], p['dropLevels']))
        fill = ('  ← 补 ' + ','.join(p['fillFromDropped'])) if p['fillFromDropped'] else ''
        print(f"  {p['word']}({p['reading']})  留 {p['keep']}({p['keepLevel']})  删 {drops}{fill}")

    print('\n下一步(不要跳步):')
    print('  1. 人看一遍上面的逐组明细,尤其「留哪条」有没有反直觉的')
    print('  2. 改 tools/audit-wordbank-examples.py 的 --expected-count')
    print('  3. 同时改 yan-content/content.v2.json 和 assets/content.fallback.json(两份必须逐字节相同)')
    print('  4. bash tools/check-content-release.sh → Blocker 必须为 0')
    print('  5. bash scripts/push-content.sh(内容必须先于 App 上架)')
    return 0


if __name__ == '__main__':
    sys.exit(main('--json' in sys.argv))
