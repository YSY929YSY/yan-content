#!/usr/bin/env python3
"""staging 词书 meaning_zh 质量门 · 校验 LLM 翻译,report-only。

对已译条目跑自动检查,连"我自己译的"也过一遍闸:
  E_kana_leak     meaning_zh 混入日文假名(翻译没翻干净)
  E_empty         status 已标译但 meaning_zh 空
  W_false_friend  日中同形异义词 → 列出我的中文 + JMdict英义,人工确认没掉进汉字直读陷阱
  W_too_long      meaning_zh 过长(>22字),违背简洁
  W_dup_meaning   多个不同词译成完全相同的中文(可能偷懒/漏区分)
  W_punct         用了半角标点(应统一中文全角)
"""
from __future__ import annotations
import argparse, json, re
from collections import defaultdict
from pathlib import Path

FALSE_FRIENDS = {
    "手紙","勉強","大丈夫","邪魔","我慢","床","娘","切手","汽車","新聞","工夫","丈夫",
    "留守","喧嘩","怪我","風邪","顔色","階段","約束","用意","文句","無理","結構","適当",
    "真面目","得意","苦手","迷惑","心配","元気","野菜","勝手","返事","外人","下手","上手",
    "授業","宿題","泥棒","親切","正直","感心","油断","遠慮","我儘","必死","迷子","素直",
}
KANA = re.compile(r"[ぁ-ゖァ-ヺ]")
HALF_PUNCT = re.compile(r"[;,]")  # 半角分号/逗号(应为；，)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, default=Path("staging/n3-staging.json"))
    args = ap.parse_args()
    d = json.loads(args.input.read_text(encoding="utf-8"))
    done = [w for w in d if w.get("meaning_zh")]

    errs = defaultdict(list)
    by_meaning = defaultdict(list)
    for w in done:
        zh = w["meaning_zh"]
        by_meaning[zh].append(w["word"])
        if KANA.search(zh):
            errs["E_kana_leak"].append(w)
        if HALF_PUNCT.search(zh):
            errs["W_punct"].append(w)
        if len(zh) > 22:
            errs["W_too_long"].append(w)
        if w["word"] in FALSE_FRIENDS:
            errs["W_false_friend"].append(w)
    for w in d:
        if w.get("status") == "zh_drafted" and not w.get("meaning_zh"):
            errs["E_empty"].append(w)

    dups = {m: ws for m, ws in by_meaning.items() if len(ws) > 1}

    print(f"# staging meaning_zh 质量门 · {args.input.name}")
    print(f"\n- 已译: {len(done)}/{len(d)}")
    print(f"- 致命(E): {sum(len(errs[k]) for k in errs if k.startswith('E'))}")
    print(f"- 复核(W): {sum(len(errs[k]) for k in errs if k.startswith('W'))}")
    print(f"- 同译多词(W_dup_meaning): {len(dups)}")
    print()
    for k in ["E_kana_leak", "E_empty", "W_punct", "W_too_long", "W_false_friend"]:
        if errs[k]:
            print(f"## {k}（{len(errs[k])}）")
            for w in errs[k][:40]:
                extra = f"  ←JMdict英: {w['meaning_en'][:50]}" if k == "W_false_friend" else ""
                print(f"  {w['word']}（{w['reading']}）= 「{w['meaning_zh']}」{extra}")
            print()
    if dups:
        print(f"## W_dup_meaning（{len(dups)}）同一中文译给了不同词")
        for m, ws in list(dups.items())[:25]:
            print(f"  「{m}」← {' / '.join(ws)}")


if __name__ == "__main__":
    main()
