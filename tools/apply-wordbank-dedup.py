#!/usr/bin/env python3
"""执行词库去重。**只写 staging,永远不碰 content.fallback.json / yan-content/。**

8047 → 8005,删 42 组同形同音重复。

## 这个脚本和 plan-wordbank-dedup.py 的区别

plan 只出报告,而且它给的**默认建议在 9 组上是错的**。
2026-08-13 的人工逐组复核(HANDOFF-2026-08-12 第九节)结论是:

> **这是合并,不是删除。** 按 plan 的默认建议直接删,会在 8 组上丢掉真实义项,
> 另有 1 组该反转。

这个脚本把那份复核**编码进代码**,而不是留在文档里等下一个人重读一遍。

## 三条规则

1. **保留低级别那条的 id 和 level。** 进度键(词-读音)和词书归属靠它。
2. **释义取并集** —— 但不是字符串拼接,是把复核时人写好的那一版填进去(见 MERGE)。
   自动拼会得到「相当;很;相当,颇;(后接否定)怎么也(不)」这种前半截重复的东西。
3. **`辞める` 反转。** N4 那条的例句用了同音异字的「止める」(词头是「辞める」),
   是坏数据 —— 留 N3。这是唯一一组不按规则 1 走的。

例句一律留保留条的:低级别那条来自精修过的 N5/N4,本来就是更可信的一份。

## 为什么可以放心删

**42/42 组的进度键相同。** 进度键是「词-读音」不是 id,同形同音天然共用一个键 ——
删掉重复条不会让任何人的进度失效,**不需要 keyAliases**。
那是去重最贵的部分,这次不用做。脚本每次跑都会重新验证这一条,不通过就不写文件。

## 用法

    python3 tools/apply-wordbank-dedup.py            # 出 staging 产物 + 报告
    python3 tools/apply-wordbank-dedup.py --report   # 只看报告,不写文件

产物:`YanApp/staging/wordbank-dedup/` 下的
  · `wordBank.json`       去重合并后的整份 wordBank(8005 条)
  · `report.md`           逐组「留什么 / 删什么 / 合并成什么」,**中文那一列人能直接读**

## 并进内容包(顺序不能跳)

这个脚本**不做**下面任何一步:

    1. 把 wordBank.json 并进 yan-content/content.v2.json
    2. 复制一份到 YanApp/assets/content.fallback.json(两份必须逐字节相同)
    3. 改 tools/audit-wordbank-examples.py 的 --expected-count(8047 → 8005)
    4. bash tools/check-content-release.sh   Blocker 必须为 0
    5. bash scripts/push-content.sh          **内容必须先于 App 上架**

第 5 步的理由见 HANDOFF-learning 发版流程第 2 步:App 先上、内容后推的话,
新客户端配旧内容,进度会从**仍然存在的**词条上折算走,而且不自愈。
"""
import argparse
import json
import os
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANK = f'{ROOT}/YanApp/assets/content.fallback.json'
OUTDIR = f'{ROOT}/YanApp/staging/wordbank-dedup'

EXPECTED_BEFORE = 8047
EXPECTED_AFTER = 8005

# ── 人工复核的产物 ───────────────────────────────────────────
#
# 这张表是 2026-08-13 逐组看出来的,**不是算法算出来的**。改它之前先读
# HANDOFF-2026-08-12 第九节,那里写了每一条为什么。
#
# 8 组「必须并」:被删条带着保留条没有的义项,不并就是丢内容。
MERGE_REQUIRED = {
    'n4_nakanaka': '相当，颇；（后接否定）怎么也（不）',   # 极高频,漏了是硬伤
    'n4_agaru':    '上升；上去；提高；进入（室内）',        # お上がりください
    'n4_otosu':    '掉下；弄丢；使落下；去除（污渍）',      # 汚れを落とす
    'n4_sagaru':   '下降；下来；降低；后退；悬挂',
    'n4_okosu':    '叫醒；引起；扶起，立起',
    'n5_oishii':   '好吃的，美味的；划算，诱人',            # おいしい話
    'n5_dandan':   '渐渐地；台阶',                          # 名词义
    'n4_kimaru':   '决定下来；确定；（动作）利落漂亮',      # 決まってる
}

# 「可并可不并」的那几组。2026-08-13 逐条定过,结论不是「全并」也不是「全不并」:
#
# 判据只有一条:**它是不是这个词本身的义项。**
# 是 → 并,措辞别扭就改措辞;不是 → 不并,塞进释义栏会教错。
MERGE_SECONDARY = {
    'n5_isu':     '椅子；（比喻）职位',
    'n4_majime':  '认真；正经；诚实',
    # N5 只写「饭碗」太窄,N2 的「碗;茶杯」又太宽 —— 日语 茶碗 日常压倒性指盛饭的碗,
    # 「茶杯」那义存在但少见。所以给主次,不是并列
    'n5_chawan':  '碗（多指饭碗）；茶杯',
    # 「宝贝,珍爱」对应 JMdict 的 dear / precious / darling(可愛い我が子),
    # **是真实义项**,不能因为中文措辞别扭就整条丢掉 —— 那是丢内容。改措辞
    'n5_kawaii':  '可爱的；（对人）疼爱的，宝贝的',
}

# 明确**不并**的:被删条写的东西不是这个词的义项。
#
# 明後日 的「(方向)不对」只活在 あさっての方向 这个固定说法里,
# 明後日 本身没有这个意思。并进释义栏 = 教一个不存在的义项。
# 惯用法要收的话该另立字段(标准第四节:能进结构化字段的不要写成散文)。
MERGE_REJECTED = {
    'n5_asatte': '「（方向）不对」只存在于 あさっての方向,不是 明後日 的义项',
}

# 唯一一组反转:保留高级别那条。
# n4_yameru 的例句是「仕事を止めるつもりです。」—— 用的是同音异字的「止める」,
# 和词头「辞める」不是一个词。坏数据不能因为级别低就留着。
REVERSE = {'辞める': 'n3_yameru'}


def progress_key(w):
    """和 App 的 wordKey 同口径:词-读音。这是能不能放心删的全部依据。"""
    return f"{w.get('word')}-{w.get('reading')}"


def level_rank(w):
    return {'N5': 1, 'N4': 2, 'N3': 3, 'N2': 4, 'N1': 5}.get(w.get('level'), 9)


def merge_en(keep, drop):
    """英文释义按 ' | ' 切开取并集。JMdict 派生的,机械合并是安全的 ——
    中文那边不能这么干(会得到前半截重复的句子),所以中文走 MERGE 表。"""
    seen, out = set(), []
    for src in (keep.get('meaning_en'), drop.get('meaning_en')):
        for part in str(src or '').split('|'):
            p = part.strip()
            if p and p.lower() not in seen:
                seen.add(p.lower())
                out.append(p)
    return ' | '.join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--report', action='store_true', help='只看报告,不写文件')
    ap.add_argument('--no-secondary', action='store_true', help='5 组「可并可不并」的不并')
    # ⚠️ 这个开关会**改内容文件**。默认关着 —— 默认行为永远只落 staging。
    ap.add_argument('--apply-to-content', action='store_true',
                    help='把结果写进 yan-content/content.v2.json 和 assets/content.fallback.json'
                         '(两份保持逐字节相同)。之后还要改 --expected-count、跑审计、再推')
    args = ap.parse_args()

    data = json.load(open(BANK, encoding='utf-8'))
    bank = data['wordBank']
    errs = []

    if len(bank) != EXPECTED_BEFORE:
        errs.append(f'词库 {len(bank)} 条,期望 {EXPECTED_BEFORE} —— 内容变过了,'
                    f'这份复核要重做,不要硬跑')

    # 同形同音分组
    groups = defaultdict(list)
    for w in bank:
        groups[(w.get('word'), w.get('reading'))].append(w)
    dups = {k: v for k, v in groups.items() if len(v) > 1}

    if len(dups) != EXPECTED_BEFORE - EXPECTED_AFTER:
        errs.append(f'找到 {len(dups)} 组重复,期望 {EXPECTED_BEFORE - EXPECTED_AFTER} 组')

    # ★ 放心删的前提:每组内进度键必须相同
    for k, ws in dups.items():
        if len({progress_key(w) for w in ws}) != 1:
            errs.append(f'{k} 组内进度键不同 —— 删掉会让用户进度失效,必须先做 keyAliases')

    merge_table = dict(MERGE_REQUIRED)
    if not args.no_secondary:
        merge_table.update(MERGE_SECONDARY)

    rows, drop_ids = [], set()
    for (word, reading), ws in sorted(dups.items()):
        ws = sorted(ws, key=level_rank)
        keep = ws[0]
        if word in REVERSE:
            forced = [w for w in ws if w['id'] == REVERSE[word]]
            if not forced:
                errs.append(f'{word} 要反转成 {REVERSE[word]},但这一组里没有这个 id')
                continue
            keep = forced[0]
        drops = [w for w in ws if w['id'] != keep['id']]
        for d in drops:
            drop_ids.add(d['id'])

        before_zh = keep.get('meaning_zh')
        merged_zh = merge_table.get(keep['id'], before_zh)
        rows.append({
            'word': word, 'reading': reading,
            'keep': keep['id'], 'keepLevel': keep.get('level'),
            'drop': [d['id'] for d in drops],
            'dropLevel': [d.get('level') for d in drops],
            'zhBefore': before_zh,
            'zhDropped': [d.get('meaning_zh') for d in drops],
            'zhAfter': merged_zh,
            'merged': merged_zh != before_zh,
            'reversed': word in REVERSE,
        })

        keep['meaning_zh'] = merged_zh
        keep['meaning_en'] = merge_en(keep, drops[0])
        # 只补空缺,不覆盖 —— 保留条是精修过的,它有值的字段一律不动
        for d in drops:
            for f, v in d.items():
                if v not in (None, '', [], {}) and keep.get(f) in (None, '', [], {}):
                    keep[f] = v

    # 复核里点名必须补进去的义项,逐条验证真的在结果里
    NEEDLES = {
        'n4_nakanaka': '怎么也', 'n4_agaru': '进入', 'n4_otosu': '去除',
        'n4_sagaru': '后退', 'n4_okosu': '扶起', 'n5_oishii': '划算',
        'n5_dandan': '台阶', 'n4_kimaru': '利落',
    }
    by_id = {w['id']: w for w in bank}
    for wid, needle in NEEDLES.items():
        got = (by_id.get(wid) or {}).get('meaning_zh') or ''
        if needle not in got:
            errs.append(f'{wid} 的释义里没有「{needle}」—— 第九节点名要补的义项丢了:{got!r}')

    out_bank = [w for w in bank if w['id'] not in drop_ids]
    if len(out_bank) != EXPECTED_AFTER:
        errs.append(f'结果 {len(out_bank)} 条,期望 {EXPECTED_AFTER}')

    # 报告
    lines = [
        '# 词库去重 · 待人复核',
        '',
        f'{len(bank)} → {len(out_bank)}(删 {len(drop_ids)} 条,{len(rows)} 组)',
        '',
        f'**进度键 {len(dups)}/{len(dups)} 组相同** → 删掉不影响任何人的进度,不需要 keyAliases。',
        '',
        '中文那一列不需要懂日语也能读。**重点看「合并成」那一列有没有话说不通的。**',
        '',
        '## 改了释义的组',
        '',
        '| 词 | 留 | 删 | 原释义 | 被删条的释义 | **合并成** |',
        '|---|---|---|---|---|---|',
    ]
    for r in [x for x in rows if x['merged']]:
        lines.append(f"| {r['word']} | {r['keep']} | {'/'.join(r['drop'])} | {r['zhBefore']} "
                     f"| {' / '.join(str(z) for z in r['zhDropped'])} | **{r['zhAfter']}** |")
    lines += ['', '## 明确**不并**的(被删条写的不是这个词的义项)', '']
    for wid, why in MERGE_REJECTED.items():
        w = by_id.get(wid) or {}
        lines.append(f"- **{w.get('word')}**({wid}):{why}。释义保持「{w.get('meaning_zh')}」")
    lines += ['', '## 反转的组(不按「留低级别」的规则)', '']
    for r in [x for x in rows if x['reversed']]:
        lines.append(f"- **{r['word']}**:留 {r['keep']}({r['keepLevel']}),"
                     f"删 {'/'.join(r['drop'])}({'/'.join(str(l) for l in r['dropLevel'])})。"
                     f"被删那条的例句用了同音异字,是坏数据。")
    lines += ['', f'## 其余 {len([x for x in rows if not x["merged"]])} 组:只删重复条,释义不动', '']
    for r in [x for x in rows if not x['merged']]:
        lines.append(f"- {r['word']}({r['reading']}) 留 {r['keep']} 删 {'/'.join(r['drop'])}")
    report = '\n'.join(lines) + '\n'

    if errs:
        print('✗ 断言失败,未写文件:')
        for e in errs:
            print('  -', e)
        return 1

    print(f'{len(bank)} → {len(out_bank)}(删 {len(drop_ids)} 条)')
    print(f'  进度键相同 {len(dups)}/{len(dups)} 组 → 不需要 keyAliases')
    print(f'  改了释义 {len([x for x in rows if x["merged"]])} 组 · '
          f'反转 {len([x for x in rows if x["reversed"]])} 组')
    if args.report:
        print('\n(--report:没有写文件)')
        return 0

    os.makedirs(OUTDIR, exist_ok=True)
    with open(f'{OUTDIR}/wordBank.json', 'w', encoding='utf-8') as f:
        json.dump(out_bank, f, ensure_ascii=False, indent=1)
        f.write('\n')
    with open(f'{OUTDIR}/report.md', 'w', encoding='utf-8') as f:
        f.write(report)
    print(f'\n→ {os.path.relpath(OUTDIR, ROOT)}/  (wordBank.json + report.md)')

    if not args.apply_to_content:
        print('  **没有碰内容文件。** 要写进内容包加 --apply-to-content。')
        return 0

    # ── 写进内容包 ────────────────────────────────────────────
    #
    # 只换 wordBank 这一个键,其余原样保留 —— 整份重新序列化会把别的区块
    # 的格式也动一遍,那样 diff 里全是噪声,人没法复核这次到底改了什么。
    CONTENT = f'{ROOT}/yan-content/content.v2.json'
    FALLBACK = f'{ROOT}/YanApp/assets/content.fallback.json'

    before = open(CONTENT, encoding='utf-8').read()
    if before != open(FALLBACK, encoding='utf-8').read():
        print('✗ content.v2.json 和 fallback.json 现在就不一致 —— 先把这个修好再来,'
              '否则这次改动会掩盖掉原来的偏差')
        return 1

    doc = json.loads(before)
    if len(doc.get('wordBank') or []) != EXPECTED_BEFORE:
        print(f"✗ 内容包里的 wordBank 是 {len(doc.get('wordBank') or [])} 条,不是 {EXPECTED_BEFORE}")
        return 1
    doc['wordBank'] = out_bank

    # 沿用原文件的缩进风格,别在 diff 里制造无关噪声
    indent = 1 if before.startswith('{\n ') and not before.startswith('{\n  ') else 2
    text = json.dumps(doc, ensure_ascii=False, indent=indent) + ('\n' if before.endswith('\n') else '')
    for p in (CONTENT, FALLBACK):
        with open(p, 'w', encoding='utf-8') as f:
            f.write(text)

    same = open(CONTENT, encoding='utf-8').read() == open(FALLBACK, encoding='utf-8').read()
    print(f'\n✓ 已写入内容包(两份逐字节{"相同" if same else "**不同 —— 有问题**"})')
    print('  还没做完,剩下三步:')
    print(f'    1. tools/audit-wordbank-examples.py 的 --expected-count 改成 {EXPECTED_AFTER}')
    print('    2. bash tools/check-content-release.sh    Blocker 必须为 0')
    print('    3. bash scripts/push-content.sh           内容必须先于 App 上架')
    return 0 if same else 1


if __name__ == '__main__':
    sys.exit(main())
