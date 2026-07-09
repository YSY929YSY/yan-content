#!/usr/bin/env python3
"""英语桥数据补全 · 给全库片假名词补 loanSource(词源),两条锚定路径,不凭语感。

路径A(权威): JMdict languageSource
  - N3-N1 有 jmdictSeq → 直接按 seq 取(导入时已取过,这里补 N5/N4 与漏网)
  - N5/N4 无 seq → 按片假名原文精确匹配 JMdict kana.text

路径B(可验证推导): JMdict 未标注词源的英语借词
  JMdict 惯例:非英语源(ger/fre/por…)必标 lsource,而"显而易见的英语借词"常不标。
  对这类词:取该词 meaning_en 的首个 gloss,与片假名的罗马音做相似度比对
  (difflib ≥ 阈值),吻合才写入 eng 词源。gloss 本身来自 JMdict,推导可复现。
  截断型借词(テレビ←television)相似度低会被安全跳过 → 留给人工批。

用法:
  python3 tools/backfill-loansource.py --dry-run   # 只出报告
  python3 tools/backfill-loansource.py --apply     # 写回 content.v2.json
"""

from __future__ import annotations
import argparse, difflib, json, re
from pathlib import Path

import pykakasi

DATA = Path("tools/data")
CONTENT = Path("yan-content/content.v2.json")
KATA = re.compile(r"^[ァ-ヴー・]+$")
SIM_THRESHOLD = 0.72

# 回环词:日语原生词被英语借走,gloss 与罗马音天然一致,但方向相反,禁止建桥。
NATIVE_EXPORTS = {"パチンコ", "カラオケ", "アニメ", "マンガ", "ラーメン", "ツナミ"}
# 注:アニメ 虽是 animation 的截断(算英源),但已进 CURATED 人工表,此处防自动误判即可。

# 人工核准的经典截断/组合型词源(教科书级,自动相似度够不到的)。
# 每条都对照过词库 meaning_zh 再收录;有疑问的不进这张表。
CURATED = {
    "テレビ": {"lang": "eng", "word": "television"},
    "デパート": {"lang": "eng", "word": "department store"},
    "スーパー": {"lang": "eng", "word": "supermarket"},
    "エアコン": {"lang": "eng", "word": "air conditioner"},
    "パソコン": {"lang": "eng", "word": "personal computer"},
    "ビル": {"lang": "eng", "word": "building"},
    "プール": {"lang": "eng", "word": "(swimming) pool"},
    "アパート": {"lang": "eng", "word": "apartment"},
    "コンビニ": {"lang": "eng", "word": "convenience store"},
    "アニメ": {"lang": "eng", "word": "animation"},
    "バス": {"lang": "eng", "word": "bus"},
    "ノート": {"lang": "eng", "word": "notebook"},
    "ボールペン": {"lang": "eng", "word": "ball-point pen"},
    "ハンカチ": {"lang": "eng", "word": "handkerchief"},
    "ネクタイ": {"lang": "eng", "word": "necktie"},
    "カレー": {"lang": "eng", "word": "curry"},
    "メール": {"lang": "eng", "word": "mail"},
    "コピー": {"lang": "eng", "word": "copy"},
    "タクシー": {"lang": "eng", "word": "taxi"},
    "ミルク": {"lang": "eng", "word": "milk"},
    "サッカー": {"lang": "eng", "word": "soccer"},
    "セーター": {"lang": "eng", "word": "sweater"},
    "シャワー": {"lang": "eng", "word": "shower"},
    "レシート": {"lang": "eng", "word": "receipt"},
    "エレベーター": {"lang": "eng", "word": "elevator"},
    "エスカレーター": {"lang": "eng", "word": "escalator"},
    "マンション": {"lang": "eng", "word": "mansion"},
    "ワンピース": {"lang": "eng", "word": "one-piece (dress)"},
    "サラリーマン": {"lang": "eng", "word": "salary + man(和制英语)"},
}


def build_jmdict_indexes():
    jm = json.loads((DATA / "jmdict-eng-full.json").read_text(encoding="utf-8"))["words"]
    by_id, by_kana = {}, {}
    for w in jm:
        by_id[w["id"]] = w
        for k in w.get("kana", []):
            by_kana.setdefault(k["text"], []).append(w)
    return by_id, by_kana


def lsource_of(entry) -> list:
    out, seen = [], set()
    for s in entry.get("sense", []):
        for ls in s.get("languageSource", []):
            key = (ls.get("lang"), ls.get("text"))
            if ls.get("lang") and key not in seen:
                seen.add(key)
                out.append({"lang": ls["lang"], "word": ls.get("text")})
    return out


def first_gloss_words(meaning_en: str) -> list:
    # "ice cream | ..." → 首义项按 ;/| 切开,取每个候选短语
    first = re.split(r"[|]", meaning_en or "")[0]
    return [p.strip() for p in first.split(";") if p.strip()]


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    by_id, by_kana = build_jmdict_indexes()
    kk = pykakasi.kakasi()

    def romaji(kata_word: str) -> str:
        r = "".join(it["hepburn"] for it in kk.convert(kata_word))
        return re.sub(r"[^a-z]", "", r.lower())

    content = json.loads(CONTENT.read_text(encoding="utf-8"))
    wb = content["wordBank"]

    added_a, added_b, skipped = [], [], []
    for w in wb:
        if w.get("loanSource"):          # 已有,不动
            continue
        word = w.get("word", "")
        if not KATA.match(word):          # 只处理片假名词
            continue

        # ── 路径A:JMdict lsource ──
        entry = None
        if w.get("jmdictSeq"):
            entry = by_id.get(str(w["jmdictSeq"]))
        if entry is None:
            cands = by_kana.get(word, [])
            entry = cands[0] if len(cands) >= 1 else None
        if entry:
            ls = lsource_of(entry)
            if ls:
                w["loanSource"] = ls
                added_a.append((w["id"], word, ls))
                continue

        # ── 路径B:首个 gloss ≈ 罗马音(只信主义项,防 bus/bath/bass 选错)──
        rj = romaji(word)
        glosses = first_gloss_words(w.get("meaning_en", ""))
        first = re.sub(r"[^a-z]", "", glosses[0].lower()) if glosses else ""
        score = difflib.SequenceMatcher(None, rj, first).ratio() if first else 0.0
        if word in NATIVE_EXPORTS and word not in CURATED:
            skipped.append((w["id"], word, "回环词,禁止自动建桥", 0.0))
            continue
        if first and score >= SIM_THRESHOLD:
            w["loanSource"] = [{"lang": "eng", "word": glosses[0].lower()}]
            added_b.append((w["id"], word, glosses[0].lower(), round(score, 2)))
        elif word in CURATED:
            w["loanSource"] = [dict(CURATED[word])]
            added_b.append((w["id"], word, "curated:" + CURATED[word]["word"], 1.0))
        else:
            skipped.append((w["id"], word, w.get("meaning_en", "")[:40], round(score, 2)))

    print(f"# loanSource 补全报告")
    print(f"- 路径A(JMdict lsource): +{len(added_a)}")
    print(f"- 路径B(gloss相似度≥{SIM_THRESHOLD}): +{len(added_b)}")
    print(f"- 跳过(留人工批): {len(skipped)}")
    print()
    print("## 路径A 样本")
    for i, (wid, word, ls) in enumerate(added_a[:15]):
        print(f"  {word} ← {['%s:%s' % (x['lang'], x['word']) for x in ls]}")
    print()
    print("## 路径B 全部(请人工过目)")
    for wid, word, src, sc in added_b:
        print(f"  {word} ← eng:{src}  ({sc})")
    print()
    print("## 跳过样本(待人工curation)")
    for wid, word, en, sc in skipped[:40]:
        print(f"  {word}  en:{en}  best={sc}")

    if args.apply:
        CONTENT.write_text(json.dumps(content, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n✓ 已写回 {CONTENT}")


if __name__ == "__main__":
    main()
