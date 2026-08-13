#!/usr/bin/env python3
"""从 staging 的各批词场重建 `src/features/wordbank/wordfield-preview.json`。

这份预览表是**开发期**用的:词场内容还在 staging、没并进内容包,
所以 `__DEV__` 下词卡从它读(见 App.js 的 `WORDFIELD_PREVIEW`)。

## 为什么要有这个脚本

在这之前它是**手抄**的:每写完一批,把每条的 `wordField` 一个个复制过来。
于是同一份内容在仓库里有两个副本,而且第五批写完之后预览表里只有前四批 ——
改一处忘另一处是迟早的事,这个文件已经因为「同一个东西写两遍」栽过两次(见
HANDOFF-2026-08-12 第五节第 6 条)。

现在:批次文件是唯一事实,预览表是它的派生物,随时可重建。

    python3 tools/build-wordfield-preview.py           # 重建
    python3 tools/build-wordfield-preview.py --check   # 只比对,不写(CI/提交前用)

## 一条断言

同一个词 id 在两批里出现 = 有人重复写了同一个词,**直接报错不写文件**。
静默后写覆盖先写的话,丢掉的那条要很久以后才会被发现。
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAGING = os.path.join(ROOT, 'YanApp', 'staging')
OUT = os.path.join(ROOT, 'YanApp', 'src', 'features', 'wordbank', 'wordfield-preview.json')


def collect():
    preview, source_of, errs = {}, {}, []
    names = sorted(f for f in os.listdir(STAGING)
                   if f.startswith('wordfield-batch-') and f.endswith('.json'))
    if not names:
        errs.append(f'{STAGING} 下一个批次文件都没有')
    for name in names:
        data = json.load(open(os.path.join(STAGING, name), encoding='utf-8'))
        items = data['items'] if isinstance(data, dict) else data
        for it in items:
            wid, wf = it.get('id'), it.get('wordField')
            if not wid or not wf:
                errs.append(f'{name}: 有条目缺 id 或 wordField'); continue
            if wid in preview:
                errs.append(f'{wid} 在 {source_of[wid]} 和 {name} 里各写了一次')
                continue
            preview[wid] = wf
            source_of[wid] = name
    return preview, names, errs


def main():
    preview, names, errs = collect()
    if errs:
        print('✗ 未写文件:')
        for e in errs:
            print('  -', e)
        return 1

    # 键按批次内的书写顺序走(dict 保序),不排序 —— 排序会让 diff 在插入新批时炸开
    text = json.dumps(preview, ensure_ascii=False, indent=1) + '\n'

    if '--check' in sys.argv:
        old = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
        if old == text:
            print(f'✓ 预览表和 {len(names)} 个批次一致({len(preview)} 条)')
            return 0
        print(f'✗ 预览表和批次不一致。跑一次 build-wordfield-preview.py 重建。')
        return 1

    open(OUT, 'w', encoding='utf-8').write(text)
    print(f'OK {len(preview)} 条 ← {len(names)} 个批次:{", ".join(names)}')
    print(f'   → {os.path.relpath(OUT, ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
