#!/usr/bin/env python3
"""词场候选去重:找出「同一个场被拆成好几张卡」的组。

用法:
    python3 tools/plan-wordfield-merge.py YanApp/staging/wordfield-candidates.json

为什么必须先做这一步,再动笔写:

227 条候选里有若干组,成员词高度重合 —— 比如通勤高峰那个场被拆成了五条候选,
各自当头词。照单全写出来,用户在词库里会**看到五遍几乎一样的句子**。
这不是质量问题(每条单看都合格),是重复问题,只有放在一起看才发现。

而且这一步是**删**不是**写**:合并掉之后总量下降,后面每一批的工作量都跟着降。
先写后删等于白写。

判定用 Jaccard(交集/并集),纯计算,不需要判断力 —— 判断力留给「合并后头词选谁」。
"""
import json
import sys
from itertools import combinations

# 阈值。0.5 = 四个成员里重合两个以上。
# 调低会把「同一场景但角度不同」的也拉进来(比如「点餐」和「结账」都在餐厅,
# 成员会重合但确实是两张卡),调高会漏掉真重复。0.5 是从这批数据上量出来的。
THRESHOLD = 0.5


def jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if (a | b) else 0.0


def main(path: str) -> int:
    data = json.load(open(path, encoding='utf-8'))
    items = data if isinstance(data, list) else (data.get('items') or list(data.values())[0])
    by_id = {it['id']: it for it in items}
    members = {it['id']: set(it.get('memberIds') or []) for it in items}

    # 并查集:A 和 B 重合、B 和 C 重合 → 三个一组。
    # 只两两报的话,同一个场会被报成三条互相重叠的「对」,人得自己拼。
    parent = {i: i for i in by_id}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    pairs = []
    for a, b in combinations(by_id, 2):
        s = jaccard(members[a], members[b])
        if s >= THRESHOLD:
            pairs.append((a, b, s))
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb

    groups = {}
    for i in by_id:
        groups.setdefault(find(i), []).append(i)
    groups = [g for g in groups.values() if len(g) > 1]
    groups.sort(key=len, reverse=True)

    dupes = sum(len(g) - 1 for g in groups)
    print(f'候选 {len(items)} 条 · 重合组 {len(groups)} 个 · '
          f'合并后可减少 {dupes} 条 → 剩 {len(items) - dupes} 条\n')

    tier_rank = {'A': 0, 'B': 1, 'C': 2}
    for g in groups:
        g.sort(key=lambda i: (tier_rank.get(by_id[i].get('tier'), 9), by_id[i].get('level', '')))
        keep = by_id[g[0]]
        shared = set.intersection(*(members[i] for i in g))
        print(f'── {len(g)} 条重合(共有成员 {len(shared)} 个)')
        for n, i in enumerate(g):
            it = by_id[i]
            mark = '保留头词' if n == 0 else '并入'
            print(f'   [{it.get("tier")}] {it["word"]}({it["reading"]}) {it["id"]}  ← {mark}')
        print(f'   共有:{", ".join(sorted(shared)) or "(无)"}')
        print(f'   建议:以 {keep["word"]} 立卡,其余作为它的成员或直接丢弃\n')

    if not groups:
        print('没有重合组 —— 可以直接按 tier 往下写。')
    return 0


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
