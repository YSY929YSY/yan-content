#!/usr/bin/env python3
"""打卡点内容审计 · report-only,绝不改 content。

为什么是工具而不是「再让 AI 审一遍」:
    言的词书踩过这个坑 —— AI 生成 + AI 互审在数学上不收敛,每轮都能发现新错,
    永远停不下来。能自动化的是**可判定**的部分:字符、词典、规格、套话。
    判定不了的(内容够不够具体、地不地道)交给人,但把范围缩到最小。

检查分层(和 wordbank 审计一致,按严重度不按总数):
    BLOCKER  非日语字符混入 / 词典查无此词 / 规格缺项
    POLISH   套话嫌疑 / 信息重复 / 长度异常

用法:
    python3 tools/check-places.py                 # 审全部
    python3 tools/check-places.py --lang ja-JP    # 只审某语言
    python3 tools/check-places.py --id fushimi_inari
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

CONTENT = Path("yan-content/content.v2.json")
JMDICT_FULL = Path("tools/data/jmdict-eng-full.json")

# 只有这些语言能做词典锚定;其余语言先只查规格和套话
DICT_LANGS = {"ja-JP"}

# 日文允许的字符:平假名、片假名、汉字、标点、长音、空格、全角数字
JA_OK = re.compile(r"[぀-ヿ一-鿿　-〿＀-￯\s0-9]")

# 旅游宣传套话。这类句式是公式化的,规则查得动,噪声低 ——
# 和语义检查不同,这里不是判断「意思对不对」,是判断「有没有说等于没说」。
CLICHE = [
    "值得一游", "值得一去", "不虚此行", "美不胜收", "令人流连忘返", "叹为观止",
    "风景优美", "景色宜人", "举世闻名", "闻名遐迩", "享誉世界", "世界著名",
    "必打卡", "网红打卡", "人间仙境", "如诗如画", "心旷神怡",
    "是世界上最", "是最著名的", "被誉为", "素有", "堪称",
]
# 百科腔:陈述客观事实但对「到了那儿」没用
ENCYCLOPEDIC = ["位于", "海拔", "始建于", "面积约", "总面积", "人口约", "隶属于"]


def load_places(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f).get("mapPlaces", [])


def load_dict() -> set[str] | None:
    if not JMDICT_FULL.exists():
        return None
    with JMDICT_FULL.open("r", encoding="utf-8") as f:
        data = json.load(f)
    words = data.get("words", data)
    idx: set[str] = set()
    for w in words:
        for k in w.get("kanji") or []:
            idx.add(k["text"])
        for k in w.get("kana") or []:
            idx.add(k["text"])
    return idx


def ja_tokens(text: str) -> list[str]:
    """粗切:连续汉字块。不做分词 —— 这里只要「这个写法词典里有没有」,
    命中不了的交人判断,不试图断句(那需要 Sudachi,是另一层)。"""
    return [t for t in re.findall(r"[一-鿿]{2,}", text)]


def audit(place: dict, jdict: set[str] | None) -> tuple[list[str], list[str]]:
    blockers: list[str] = []
    polish: list[str] = []
    name = place.get("name", place.get("id", "?"))
    lang = place.get("lang", "")

    phrases = place.get("phrases") or []
    tips = place.get("tips") or {}
    # tips 有两种形态:{when,how,cost} 的对象(既有内容用这种),
    # 或纯字符串数组。审计两种都要吃得下,不能假设 schema。
    tip_texts = list(tips.values()) if isinstance(tips, dict) else list(tips)
    ops = place.get("sceneOps") or []
    egg = place.get("cultureEgg") or ""

    # ── 规格 ──────────────────────────────────────────
    if not phrases:
        blockers.append("没有 phrases(到了要说的话)")
    elif len(phrases) < 3:
        polish.append(f"phrases 只有 {len(phrases)} 条,建议 3-5 条")
    for i, p in enumerate(phrases, 1):
        if not p.get("text"):
            blockers.append(f"phrases[{i}] 缺 text")
        if not p.get("use"):
            blockers.append(f"phrases[{i}] 缺 use —— 不写「什么时候用」的句子等于词表")
        if not p.get("zh"):
            blockers.append(f"phrases[{i}] 缺中文")
    if isinstance(tips, dict):
        for k in ("when", "how", "cost"):
            if not tips.get(k):
                polish.append(f"tips 缺 {k}")
    elif tips:
        blockers.append("tips 是数组 —— 既有内容用的是 {when,how,cost} 对象,schema 不一致")
    if not egg:
        polish.append("没有 cultureEgg")
    elif len(egg) < 30:
        polish.append(f"cultureEgg 只有 {len(egg)} 字,可能太薄")

    # ── 字符混入(抓 `奥social` 这类)────────────────
    if lang in DICT_LANGS:
        for i, p in enumerate(phrases, 1):
            bad = [c for c in p.get("text", "") if not JA_OK.match(c)]
            if bad:
                blockers.append(f"phrases[{i}] 混入非日文字符: {''.join(sorted(set(bad)))}")

    # ── 词典锚定(抓「町家读音」这类凭语感的断言)──────
    if lang in DICT_LANGS and jdict:
        seen: set[str] = set()
        for p in phrases:
            for tok in ja_tokens(p.get("text", "")):
                if tok in seen:
                    continue
                seen.add(tok)
                if tok not in jdict:
                    polish.append(f"「{tok}」不在 JMdict —— 可能是专名/术语(正常),也可能是错字,人工确认")

    # ── 套话 / 百科腔 ────────────────────────────────
    blob = " ".join([egg, *[t for t in tip_texts if isinstance(t, str)], *ops])
    for c in CLICHE:
        if c in blob:
            blockers.append(f"套话「{c}」—— 说了等于没说,换成到了那儿用得上的信息")
    for e in ENCYCLOPEDIC:
        if e in blob:
            polish.append(f"百科腔「{e}」—— 确认这条对「站在那里的人」有没有用")

    # ── 重复(同一信息说两遍)──────────────────────────
    chunks = [t.strip() for t in (tip_texts + ops) if isinstance(t, str) and t.strip()]
    for i, a in enumerate(chunks):
        for b in chunks[i + 1:]:
            short, long_ = sorted([a, b], key=len)
            if len(short) >= 8 and short[:10] in long_:
                polish.append(f"疑似重复: 「{short[:18]}…」")

    return blockers, polish


def main() -> int:
    ap = argparse.ArgumentParser(description="打卡点内容审计(report-only)")
    ap.add_argument("--input", type=Path, default=CONTENT)
    ap.add_argument("--lang", help="只审某个语言,如 ja-JP")
    ap.add_argument("--id", help="只审某个地点")
    args = ap.parse_args()

    places = load_places(args.input)
    if args.lang:
        places = [p for p in places if p.get("lang") == args.lang]
    if args.id:
        places = [p for p in places if p.get("id") == args.id]

    jdict = load_dict()
    print("# 打卡点内容审计\n")
    print(f"- 审计地点数: {len(places)}")
    print(f"- JMdict 锚定: {'已加载 ' + str(len(jdict)) + ' 个写法' if jdict else '未加载(缺 tools/data/jmdict-eng-full.json),跳过词典检查'}")
    print("- mode: report-only, JSON not modified\n")

    total_b = total_p = 0
    empty: list[str] = []
    detail: list[str] = []

    for p in places:
        name = p.get("name", p.get("id"))
        if not (p.get("phrases") or p.get("tips") or p.get("sceneOps")):
            empty.append(f"{name} ({p.get('id')})")
            continue
        b, pol = audit(p, jdict)
        total_b += len(b)
        total_p += len(pol)
        if b or pol:
            detail.append(f"\n## {name} · {p.get('id')}")
            for x in b:
                detail.append(f"- **BLOCKER** {x}")
            for x in pol:
                detail.append(f"- polish: {x}")

    print("## 汇总\n")
    print(f"- Blocker: {total_b}")
    print(f"- Polish: {total_p}")
    print(f"- 尚无内容(不计入): {len(empty)}")
    if empty:
        print("\n## 尚无内容\n")
        for e in empty:
            print(f"- {e}")
    if detail:
        print("\n".join(detail))
    else:
        print("\n有内容的地点全部通过。")

    return 1 if total_b else 0


if __name__ == "__main__":
    sys.exit(main())
