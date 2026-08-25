#!/usr/bin/env python3
"""从本地 Tatoeba 语料筛选主线词场候选。

只读 content.fallback.json 和 Tatoeba 导出，结果写入 staging；不改内容包。
候选先用词形索引缩小范围，再用 Sudachi 的词典原形/表层逐句自检，避免
「子串命中」被误报成成员词真的出现在句子里。
"""

from __future__ import annotations

import argparse
import json
import pickle
import re
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Sequence, Set, Tuple

from sudachipy import dictionary, tokenizer
import opencc


REPO = Path(__file__).resolve().parents[1]
DEFAULT_DATA = REPO.parent / "tools" / "data" / "tatoeba"
DEFAULT_CONTENT = REPO / "assets" / "content.fallback.json"
DEFAULT_OUTPUT = REPO / "staging" / "wordfield-candidates-tatoeba.jsonl"
SENSE_SEP = re.compile(r"[;；/／,，、]")
PUNCTUATION = {"記号", "補助記号"}
GRAMMAR_POS = {"助詞", "助動詞", "記号"}
_T2S = opencc.OpenCC("t2s")


def split_forms(value: object) -> List[str]:
    return [
        form.strip().replace("～", "")
        for form in SENSE_SEP.split(str(value or ""))
        if form.strip()
    ]


def read_sentences(path: Path) -> Dict[int, str]:
    sentences: Dict[int, str] = {}
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            try:
                sentences[int(parts[0])] = parts[2]
            except ValueError:
                continue
    return sentences


def read_index(path: Path) -> Mapping[str, Sequence[int]]:
    with path.open("rb") as handle:
        return pickle.load(handle)


def lexical_tokens(tk, text: str):
    return [
        morpheme
        for morpheme in tk.tokenize(text, tokenizer.Tokenizer.SplitMode.C)
        if morpheme.part_of_speech()[0] not in PUNCTUATION
    ]


def hira(value: str) -> str:
    return "".join(
        chr(ord(char) - 0x60) if "\u30a1" <= char <= "\u30f6" else char
        for char in value
    )


def target_forms(word: Mapping[str, object]) -> Tuple[Set[str], Set[str], bool, str | None]:
    raw_forms = [
        form.strip()
        for form in SENSE_SEP.split(str(word.get("word") or ""))
        if form.strip()
    ]
    word_forms = {form.replace("～", "") for form in raw_forms}
    reading_forms = {hira(form) for form in split_forms(word.get("reading"))}
    # 对纯假名条目，词典原形有时只有读音；汉字条目不能仅凭同音读音命中。
    word_is_kana_only = bool(word_forms) and all(
        not any("\u3400" <= char <= "\u9fff" for char in form)
        for form in word_forms
    )
    pattern_mode = None
    if any(form.startswith("～") for form in raw_forms):
        pattern_mode = "suffix"
    elif any(form.endswith("～") for form in raw_forms):
        pattern_mode = "prefix"
    return word_forms, reading_forms, word_is_kana_only, pattern_mode


def build_sid_candidates(
    anchors: Sequence[Mapping[str, object]],
    index: Mapping[str, Sequence[int]],
    japanese: Mapping[int, str],
) -> Tuple[Dict[int, Set[str]], Dict[str, Tuple[Set[str], Set[str], bool, str | None]]]:
    """由索引找句子，再给没有索引的计数词等条目做表层兜底。"""
    by_sid: Dict[int, Set[str]] = defaultdict(set)
    target_meta: Dict[str, Tuple[Set[str], Set[str], bool, str | None]] = {}
    missing_index: List[Tuple[str, Set[str], Set[str], bool, str | None]] = []

    for word in anchors:
        word_id = str(word["id"])
        word_forms, reading_forms, kana_only, pattern_mode = target_forms(word)
        target_meta[word_id] = (word_forms, reading_forms, kana_only, pattern_mode)
        indexed_words = [form for form in word_forms if form in index]
        indexed_readings = [form for form in reading_forms if form in index]
        keys = indexed_words or indexed_readings
        if not keys:
            missing_index.append((word_id, word_forms, reading_forms, kana_only, pattern_mode))
        for form in keys:
            for sentence_id in index[form]:
                by_sid[int(sentence_id)].add(word_id)

    # 这批条目通常是 Sudachi 分词与 wordBank 粒度不同（如 五つ/お菓子）。
    # 只作为候选预筛，最终仍必须经过 token_matches() 的逐词自检。
    if missing_index:
        for sentence_id, text in japanese.items():
            for word_id, word_forms, reading_forms, _kana_only, _pattern_mode in missing_index:
                if any(form and form in text for form in word_forms | reading_forms):
                    by_sid[sentence_id].add(word_id)

    return dict(by_sid), target_meta


def token_matches(
    tk,
    text: str,
    possible_ids: Iterable[str],
    target_meta: Mapping[str, Tuple[Set[str], Set[str], bool, str | None]],
    known_forms: Set[str],
    ambiguous_forms: Set[str],
) -> Tuple[Set[str], int, List[str]]:
    matched: Set[str] = set()
    unknown: List[str] = []
    tokens = lexical_tokens(tk, text)
    for token_index, morpheme in enumerate(tokens):
        surface = morpheme.surface()
        lemma = morpheme.dictionary_form()
        reading = hira(morpheme.reading_form())
        for word_id in possible_ids:
            word_forms, reading_forms, kana_only, pattern_mode = target_meta[word_id]
            orthographic_match = lemma in word_forms or surface in word_forms
            reading_required = kana_only or bool(word_forms & ambiguous_forms)
            reading_match = not reading_required or reading in reading_forms
            if not (reading_match and (orthographic_match or (kana_only and reading in reading_forms))):
                continue
            if pattern_mode == "suffix":
                if token_index == 0 or tokens[token_index - 1].part_of_speech()[0] in GRAMMAR_POS:
                    continue
            if pattern_mode == "prefix":
                if token_index == len(tokens) - 1:
                    continue
                next_pos = tokens[token_index + 1].part_of_speech()
                if next_pos[0] in GRAMMAR_POS or next_pos[0] == "代名詞" or (
                    next_pos[0] == "名詞" and next_pos[1] == "代名詞"
                ):
                    continue
            if orthographic_match or (kana_only and reading in reading_forms):
                matched.add(word_id)
        pos = morpheme.part_of_speech()[0]
        if pos not in GRAMMAR_POS and lemma not in known_forms and surface not in known_forms:
            unknown.append(lemma or surface)
    return matched, len(tokens), sorted(set(unknown))


def read_alignment_ids(
    links_path: Path,
    chinese: Mapping[int, str],
    wanted_japanese: Set[int],
) -> Dict[int, Tuple[int, str]]:
    """流式读取日→中链接；只保留候选日句的一个可定位中文译句。"""
    aligned: Dict[int, Tuple[int, str]] = {}
    with links_path.open(encoding="utf-8") as handle:
        for line in handle:
            left, separator, right = line.rstrip("\n").partition("\t")
            if not separator:
                continue
            try:
                japanese_id = int(left)
                chinese_id = int(right)
            except ValueError:
                continue
            if japanese_id not in wanted_japanese or chinese_id not in chinese:
                continue
            # links.csv 的日→中方向可能有多条译文；取短译，确定性用 ID 破平局。
            text = chinese[chinese_id]
            previous = aligned.get(japanese_id)
            if previous is None or (len(text), chinese_id) < (len(previous[1]), previous[0]):
                aligned[japanese_id] = (chinese_id, text)
    return aligned


def rank_key(row: Mapping[str, object]) -> Tuple[int, int, int, int, int]:
    metrics = row["metrics"]
    return (
        int(metrics["unknown_word_count"]),
        int(metrics["jp_char_count"]),
        int(metrics["token_count"]),
        -len(row["member_word_ids"]),
        int(row["tatoeba"]["jp_sentence_id"]),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--content", type=Path, default=DEFAULT_CONTENT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--max-chars", type=int, default=20)
    parser.add_argument("--max-tokens", type=int, default=8)
    parser.add_argument("--per-group", type=int, default=2)
    args = parser.parse_args()

    data_dir = args.data_dir.resolve()
    content = json.loads(args.content.read_text(encoding="utf-8"))
    words = content["wordBank"]
    anchors = [word for word in words if "kanji_anchor" in word.get("yanFeatures", [])]
    if len(anchors) != 563:
        raise SystemExit(f"expected 563 kanji_anchor words, got {len(anchors)}")

    japanese = read_sentences(data_dir / "jpn_sentences.tsv")
    chinese = read_sentences(data_dir / "cmn_sentences.tsv")
    index = read_index(data_dir / "jpn_lemma_index.pkl")
    sid_candidates, target_meta = build_sid_candidates(anchors, index, japanese)
    tk = dictionary.Dictionary().create()

    known_forms: Set[str] = set()
    for word in words:
        known_forms.update(split_forms(word.get("word")))
        known_forms.update(split_forms(word.get("reading")))
    form_counts = defaultdict(int)
    for word in anchors:
        word_forms, _reading_forms, _kana_only, _pattern_mode = target_forms(word)
        for form in word_forms:
            form_counts[form] += 1
    ambiguous_forms = {form for form, count in form_counts.items() if count > 1}

    preliminary: List[dict] = []
    for sentence_id, possible_ids in sid_candidates.items():
        text = japanese.get(sentence_id)
        if not text or len(text) > args.max_chars:
            continue
        matched, token_count, unknown = token_matches(
            tk, text, possible_ids, target_meta, known_forms, ambiguous_forms
        )
        if len(matched) < 2 or token_count > args.max_tokens:
            continue
        preliminary.append(
            {
                "jp": text,
                "jp_sentence_id": sentence_id,
                "member_word_ids": sorted(matched),
                "token_count": token_count,
                "unknown_words": unknown,
            }
        )

    aligned = read_alignment_ids(
        data_dir / "links.csv",
        chinese,
        {row["jp_sentence_id"] for row in preliminary},
    )
    rows: List[dict] = []
    for row in preliminary:
        pair = aligned.get(row["jp_sentence_id"])
        if pair is None:
            continue
        member_ids = row["member_word_ids"]
        rows.append(
            {
                "anchor_id": member_ids[0],
                "member_word_ids": member_ids,
                "jp": row["jp"],
                "zh": _T2S.convert(pair[1]),
                "tatoeba": {
                    "jp_sentence_id": row["jp_sentence_id"],
                    "zh_sentence_id": pair[0],
                },
                "unknown_words": row["unknown_words"],
                "metrics": {
                    "jp_char_count": len(row["jp"]),
                    "token_count": row["token_count"],
                    "unknown_word_count": len(row["unknown_words"]),
                },
                "source": "Tatoeba",
            }
        )

    grouped: Dict[Tuple[str, ...], List[dict]] = defaultdict(list)
    for row in rows:
        grouped[tuple(row["member_word_ids"])].append(row)
    selected: List[dict] = []
    for group in grouped.values():
        selected.extend(sorted(group, key=rank_key)[: args.per_group])
    selected.sort(key=rank_key)

    # 机器验收：每条均有两端 ID、中文，并且所有成员词都能被逐 token 命中。
    for row in selected:
        if not row["tatoeba"]["jp_sentence_id"] or not row["tatoeba"]["zh_sentence_id"]:
            raise SystemExit("selected row is missing a Tatoeba sentence ID")
        if len(row["member_word_ids"]) < 2 or not row["zh"]:
            raise SystemExit("selected row violates the two-member/Chinese rule")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        for row in selected:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")

    covered = sorted({word_id for row in selected for word_id in row["member_word_ids"]})
    print(f"kanji_anchor pool: {len(anchors)}")
    print(f"qualified candidates: {len(selected)}")
    print(f"member coverage: {len(covered)}/{len(anchors)}")
    print(f"member groups: {len(grouped)} (max {args.per_group} rows/group)")
    print(f"output: {args.output}")


if __name__ == "__main__":
    main()
