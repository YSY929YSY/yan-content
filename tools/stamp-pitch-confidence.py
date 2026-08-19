#!/usr/bin/env python3
"""把「这条声调有几个来源印证」盖进内容包。

## 为什么要有这一步

crosscheck-pitch.py 早就算出了三方交叉验证的结果,**但没有任何一步去执行它**。
2026-08-19 实测:`pitch-disputed.json` 自己写着「不要显示这些词的声调」,
而内容包里 **15 条照样带着 pitch 在显示**。

工具算出来 ≠ 产品做到了。中间缺的就是这个脚本。

## 盖什么

    pitch.agree = 3  三方一致
                = 2  两方一致
                = 1  只有一个来源(无从印证)
                = 0  三方各说各的 → **直接删掉 pitch,不显示**

⚠️ agree 必须进内容包,而不是只留在报告里:
「三方印证过的」和「只有一个人说的」在屏幕上长得一模一样,
是这个 App 最不该有的那种沉默 —— 它的全部资产就是「说的话可核对」。

⚠️ 改 JSON **不要用默认的 json.dump**:内容包是 1 空格缩进 + 结尾换行,
默认参数会把整个 6MB 文件重新序列化,diff 从几十行炸成六十多万行(踩过)。

用法:
    python3 tools/stamp-pitch-confidence.py            # 只报告
    python3 tools/stamp-pitch-confidence.py --write    # 落盘
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONF = f'{ROOT}/YanApp/staging/pitch-confidence.json'
PACKS = [f'{ROOT}/YanApp/assets/content.fallback.json',
         f'{ROOT}/yan-content/content.v2.json']


def main():
    write = '--write' in sys.argv
    if not os.path.exists(CONF):
        print('缺 pitch-confidence.json —— 先跑 tools/crosscheck-pitch.py')
        return
    levels = json.load(open(CONF, encoding='utf-8'))['levels']

    for path in PACKS:
        d = json.load(open(path, encoding='utf-8'))
        stamped = dropped = missing = 0
        for w in d.get('wordBank', []):
            if not w.get('pitch'):
                continue
            info = levels.get(f"{w.get('word')}\t{w.get('reading')}")
            if info is None:
                # 交叉验证覆盖不到(比如 UniDic 补的那批读音形式对不上)
                # —— 不猜,标成 1(只有一个来源),这是它的实际处境
                w['pitch']['agree'] = 1
                missing += 1
                continue
            if info['agree'] == 0:
                # ★ 三方各说各的 —— **删掉**。空着不会教错,给一个错的会。
                del w['pitch']
                dropped += 1
                continue
            w['pitch']['agree'] = info['agree']
            stamped += 1

        name = os.path.basename(path)
        print(f'{name}: 盖了 {stamped} 条 · 打架删掉 {dropped} 条 · 交叉验证没覆盖到 {missing} 条(记作 agree=1)')
        if write:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(d, f, ensure_ascii=False, indent=1)
                f.write('\n')

    if not write:
        print('(没写文件。要写加 --write)')


if __name__ == '__main__':
    main()
