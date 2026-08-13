#!/usr/bin/env python3
"""Build an auditable N4 staging sample from a licensed seed list.

This does not modify yan-content/content.v2.json. It creates staging output
that can be reviewed before any import.
"""

from __future__ import annotations

import argparse
import base64
import csv
import io
import json
import re
import tarfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import jaconv
from sudachipy import dictionary, tokenizer


SEED_REPO = "KellDatatics/JP_Flashcard_Quiz"
SEED_PATH = "vocab1.csv"
SEED_API_URL = f"https://api.github.com/repos/{SEED_REPO}/contents/{SEED_PATH}"
SEED_REPO_URL = f"https://github.com/{SEED_REPO}"
SEED_LICENSE = "MIT"

JMDICT_RELEASE = "3.6.2+20260608153333"
JMDICT_COMMON_URL = (
    "https://github.com/scriptin/jmdict-simplified/releases/download/"
    "3.6.2%2B20260608153333/"
    "jmdict-eng-common-3.6.2%2B20260608153333.json.tgz"
)
JMDICT_LICENSE_NOTE = "JMdict/EDRDG derived data via jmdict-simplified; CC-BY-SA-4.0 / EDRDG license applies."

DEFAULT_CONTENT = Path("yan-content/content.v2.json")
DEFAULT_STAGING = Path("staging/n4-kell-sample.json")
DEFAULT_REPORT = Path("staging/n4-kell-sample-report.md")
DEFAULT_JMDICT_CACHE = Path("/private/tmp/yan-jmdict/jmdict-eng-common.json")


@dataclass
class SeedFetch:
    text: str
    sha: str
    html_url: str
    download_url: str
    fetched_at: str


def http_json(url: str, timeout: int = 30) -> Dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": "yan-n4-staging"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_seed() -> SeedFetch:
    payload = http_json(SEED_API_URL)
    raw = base64.b64decode(payload["content"]).decode("utf-8-sig")
    return SeedFetch(
        text=raw,
        sha=payload.get("sha", ""),
        html_url=payload.get("html_url", ""),
        download_url=payload.get("download_url", ""),
        fetched_at=datetime.now(timezone.utc).isoformat(),
    )


def parse_seed_rows(seed_text: str) -> List[Dict[str, str]]:
    rows = []
    reader = csv.DictReader(io.StringIO(seed_text))
    for row in reader:
        clean = {k.strip(): (v or "").strip().replace("\u00a0", " ") for k, v in row.items()}
        if clean.get("Level") == "N4":
            rows.append(clean)
    return rows


def load_existing_n5(path: Path) -> set[Tuple[str, str]]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return {
        (str(e.get("word", "")), str(e.get("reading", "")))
        for e in data.get("wordBank", [])
        if "N5" in (e.get("levels") or [e.get("level")])
    }


def safe_slug(text: str, fallback: str) -> str:
    roman = jaconv.kana2alphabet(jaconv.kata2hira(text or ""))
    roman = re.sub(r"[^a-zA-Z0-9]+", "_", roman).strip("_").lower()
    return roman or fallback


def load_jmdict(cache_path: Path, timeout: int) -> Tuple[Optional[List[Dict[str, Any]]], str]:
    if cache_path.exists():
        with cache_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return list(data.get("words", data if isinstance(data, list) else [])), f"loaded cache: {cache_path}"

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache_path.with_suffix(".tgz")
    try:
        req = urllib.request.Request(JMDICT_COMMON_URL, headers={"User-Agent": "yan-n4-staging"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            tmp.write_bytes(resp.read())
        with tarfile.open(tmp, "r:gz") as tar:
            member = next(m for m in tar.getmembers() if m.name.endswith(".json"))
            extracted = tar.extractfile(member)
            if extracted is None:
                raise RuntimeError("JMdict archive did not contain an extractable JSON file")
            cache_path.write_bytes(extracted.read())
        with cache_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return list(data.get("words", data if isinstance(data, list) else [])), f"downloaded: {JMDICT_COMMON_URL}"
    except Exception as exc:  # network is allowed to fail; report it explicitly.
        return None, f"unavailable: {type(exc).__name__}: {exc}"


def jmdict_forms(entry: Dict[str, Any]) -> Tuple[List[str], List[str]]:
    kanji = []
    kana = []
    for k in entry.get("kanji", []) or []:
        if isinstance(k, dict) and k.get("text"):
            kanji.append(str(k["text"]))
    for r in entry.get("kana", []) or []:
        if isinstance(r, dict) and r.get("text"):
            kana.append(str(r["text"]))
    return kanji, kana


def jmdict_senses(entry: Dict[str, Any]) -> Tuple[List[str], List[str]]:
    pos: List[str] = []
    gloss: List[str] = []
    for sense in entry.get("sense", []) or entry.get("senses", []) or []:
        pos.extend(str(p) for p in sense.get("partOfSpeech", []) or sense.get("pos", []) or [])
        for g in sense.get("gloss", []) or sense.get("glosses", []) or []:
            if isinstance(g, dict):
                text = g.get("text") or g.get("value")
                if text:
                    gloss.append(str(text))
            elif isinstance(g, str):
                gloss.append(g)
    return list(dict.fromkeys(pos)), list(dict.fromkeys(gloss))


def index_jmdict(words: Optional[List[Dict[str, Any]]]) -> Dict[Tuple[str, str], List[Dict[str, Any]]]:
    index: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    if not words:
        return index
    for entry in words:
        kanji, kana = jmdict_forms(entry)
        if not kana:
            continue
        forms = kanji or kana
        for form in forms:
            for reading in kana:
                index.setdefault((form, reading), []).append(entry)
        for reading in kana:
            index.setdefault((reading, reading), []).append(entry)
    return index


def overlap_score(seed_meaning: str, gloss: List[str]) -> int:
    seed_words = set(re.findall(r"[a-z]+", seed_meaning.lower()))
    gloss_words = set(re.findall(r"[a-z]+", " ".join(gloss).lower()))
    return len(seed_words & gloss_words)


def match_jmdict(
    index: Dict[Tuple[str, str], List[Dict[str, Any]]],
    word: str,
    reading: str,
    seed_meaning: str,
) -> Dict[str, Any]:
    matches = index.get((word, reading), []) or index.get((reading, reading), [])
    ranked = []
    for entry in matches:
        pos, gloss = jmdict_senses(entry)
        ranked.append((overlap_score(seed_meaning, gloss), entry, pos, gloss))
    ranked.sort(key=lambda item: item[0], reverse=True)
    details = []
    for score, entry, pos, gloss in ranked[:5]:
        details.append({
            "jmdict_seq": entry.get("id") or entry.get("sequence") or entry.get("ent_seq"),
            "pos": pos,
            "gloss": gloss[:8],
            "seed_gloss_overlap": score,
        })
    return {
        "matched": bool(matches),
        "multi_match": len(matches) > 1,
        "match_count": len(matches),
        "matches": details,
    }


def sudachi_check(word: str, reading: str, sudachi_tokenizer: Any) -> Dict[str, Any]:
    morphemes = list(sudachi_tokenizer.tokenize(word, tokenizer.Tokenizer.SplitMode.C))
    token_reading = "".join(jaconv.kata2hira(m.reading_form()) for m in morphemes if m.reading_form() != "*")
    dictionary_form = "".join(m.dictionary_form() for m in morphemes)
    pos = [" / ".join(m.part_of_speech()) for m in morphemes]
    return {
        "reading": token_reading,
        "reading_match": token_reading == reading,
        "dictionary_form": dictionary_form,
        "part_of_speech": pos,
    }


def n5_pos_from_jmdict(pos: List[str]) -> str:
    joined = " ".join(pos).lower()
    if "verb" in joined or joined.startswith("v") or "vs" in joined:
        return "动词"
    if "adjective" in joined or "adj" in joined:
        return "い形容词"
    if "pronoun" in joined or "pn" in joined:
        return "代词"
    if "noun" in joined or re.search(r"(^|\s)n($|\s|-)", joined):
        return "名词"
    if "particle" in joined or "prt" in joined:
        return "助词"
    if "adverb" in joined or "adv" in joined:
        return "副词"
    return ""


def build_sample(args: argparse.Namespace) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    seed = fetch_seed()
    seed_rows = parse_seed_rows(seed.text)
    sample_rows = seed_rows[: args.sample_count]
    existing_n5 = load_existing_n5(args.content)

    jmdict_words, jmdict_status = load_jmdict(args.jmdict_cache, args.jmdict_timeout)
    jmdict_index = index_jmdict(jmdict_words)
    sudachi_tokenizer = dictionary.Dictionary().create()

    staging = []
    stats = {
        "total_n4_seed_count": len(seed_rows),
        "sample_count": len(sample_rows),
        "matched": 0,
        "unmatched": 0,
        "duplicate_with_existing_n5": 0,
        "reading_mismatch": 0,
        "pos_mismatch": 0,
        "multi_match": 0,
    }
    review_rows = []

    for i, row in enumerate(sample_rows, start=1):
        word = row.get("Kanji") or row.get("Kana") or ""
        reading = jaconv.kata2hira(row.get("Kana", ""))
        entry_id = f"n4_{safe_slug(reading, str(i))}"
        jmd = match_jmdict(jmdict_index, word, reading, row.get("Meaning", ""))
        sud = sudachi_check(word, reading, sudachi_tokenizer)
        first_match = (jmd["matches"] or [{}])[0]
        jmdict_pos = first_match.get("pos", []) or []
        pos = n5_pos_from_jmdict(jmdict_pos)
        meaning_en = "; ".join(first_match.get("gloss", [])[:3]) if first_match.get("gloss") else row.get("Meaning", "")
        duplicate = (word, reading) in existing_n5
        reading_mismatch = not sud["reading_match"]
        pos_mismatch = False  # no trusted seed POS to compare against yet

        stats["matched"] += 1 if jmd["matched"] else 0
        stats["unmatched"] += 0 if jmd["matched"] else 1
        stats["multi_match"] += 1 if jmd["multi_match"] else 0
        stats["duplicate_with_existing_n5"] += 1 if duplicate else 0
        stats["reading_mismatch"] += 1 if reading_mismatch else 0
        stats["pos_mismatch"] += 1 if pos_mismatch else 0

        staging_entry = {
            "id": entry_id,
            "word": word,
            "reading": reading,
            "level": "N4",
            "levels": ["N4"],
            "pos": pos,
            "meaning_zh": "",
            "meaning_en": meaning_en,
            "status": "candidate",
            "tags": {"scene": ["daily"], "type": ["uncategorized"], "memory": []},
            "yanFeatures": [],
            "coreChunk": "",
            "exampleJp": "",
            "exampleRoma": "",
            "exampleZh": "",
            "_staging": {
                "seed": row,
                "jmdict": jmd,
                "sudachi": sud,
                "duplicate_with_existing_n5": duplicate,
                "needs_review": (not jmd["matched"]) or duplicate or reading_mismatch or jmd["multi_match"],
            },
        }
        staging.append(staging_entry)
        if staging_entry["_staging"]["needs_review"]:
            review_rows.append(staging_entry)

    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "seed_source": {
            "repo": SEED_REPO,
            "repo_url": SEED_REPO_URL,
            "file": SEED_PATH,
            "api_url": SEED_API_URL,
            "html_url": seed.html_url,
            "download_url": seed.download_url,
            "license": SEED_LICENSE,
            "github_blob_sha": seed.sha,
            "fetched_at": seed.fetched_at,
        },
        "jmdict_source": {
            "release": JMDICT_RELEASE,
            "url": JMDICT_COMMON_URL,
            "status": jmdict_status,
            "license_note": JMDICT_LICENSE_NOTE,
        },
        "sudachi_source": {
            "package": "sudachipy + sudachidict_core",
            "purpose": "reading, dictionary_form, part_of_speech validation",
        },
        "stats": stats,
        "review_ids": [e["id"] for e in review_rows],
    }
    return staging, metadata


def write_report(path: Path, staging: List[Dict[str, Any]], metadata: Dict[str, Any]) -> None:
    stats = metadata["stats"]
    lines = [
        "# N4 KellDatatics Staging Sample Report",
        "",
        "## Source",
        f"- Seed: {metadata['seed_source']['repo']} `{metadata['seed_source']['file']}`",
        f"- Seed URL: {metadata['seed_source']['html_url']}",
        f"- Seed license: {metadata['seed_source']['license']}",
        f"- Seed GitHub blob SHA: `{metadata['seed_source']['github_blob_sha']}`",
        f"- Seed fetched at: {metadata['seed_source']['fetched_at']}",
        f"- JMdict: {metadata['jmdict_source']['url']}",
        f"- JMdict status: {metadata['jmdict_source']['status']}",
        f"- JMdict license note: {metadata['jmdict_source']['license_note']}",
        "- Sudachi: sudachipy + sudachidict_core for local validation",
        "",
        "## Summary",
        f"- total N4 seed count: {stats['total_n4_seed_count']}",
        f"- sample count: {stats['sample_count']}",
        f"- matched: {stats['matched']}",
        f"- unmatched: {stats['unmatched']}",
        f"- duplicate with existing N5: {stats['duplicate_with_existing_n5']}",
        f"- reading mismatch: {stats['reading_mismatch']}",
        f"- pos mismatch: {stats['pos_mismatch']}",
        f"- multi-match: {stats['multi_match']}",
        "",
        "## License / Attribution Notes",
        "- KellDatatics/JP_Flashcard_Quiz is MIT licensed; keep the license attribution if this seed is used.",
        "- JMdict-derived data requires EDRDG / CC-BY-SA attribution and license review before product import.",
        "- GPL or no-license datasets were not used for staging generation.",
        "- `meaning_zh` is intentionally blank; Chinese meanings require a separate reviewed workflow.",
        "",
        "## Review Rows",
        "| # | id | word | reading | seed meaning | jmdict | sudachi reading | duplicate N5 | notes |",
        "|---:|---|---|---|---|---|---|---|---|",
    ]
    for idx, entry in enumerate(staging, start=1):
        st = entry["_staging"]
        jmd = st["jmdict"]
        sud = st["sudachi"]
        notes = []
        if not jmd["matched"]:
            notes.append("unmatched")
        if jmd["multi_match"]:
            notes.append(f"multi-match:{jmd['match_count']}")
        if not sud["reading_match"]:
            notes.append("reading-mismatch")
        if st["duplicate_with_existing_n5"]:
            notes.append("duplicate-n5")
        jmd_label = "matched" if jmd["matched"] else "unmatched"
        lines.append(
            f"| {idx} | {entry['id']} | {entry['word']} | {entry['reading']} | "
            f"{st['seed'].get('Meaning', '')} | {jmd_label} | {sud['reading']} | "
            f"{'yes' if st['duplicate_with_existing_n5'] else 'no'} | {', '.join(notes)} |"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate an auditable N4 staging sample.")
    parser.add_argument("--sample-count", type=int, default=50)
    parser.add_argument("--content", type=Path, default=DEFAULT_CONTENT)
    parser.add_argument("--output", type=Path, default=DEFAULT_STAGING)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--jmdict-cache", type=Path, default=DEFAULT_JMDICT_CACHE)
    parser.add_argument("--jmdict-timeout", type=int, default=120)
    args = parser.parse_args()

    start = time.time()
    staging, metadata = build_sample(args)
    metadata["elapsed_seconds"] = round(time.time() - start, 2)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    payload = {"metadata": metadata, "wordBank": staging}
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_report(args.report, staging, metadata)
    print(json.dumps({
        "output": str(args.output),
        "report": str(args.report),
        **metadata["stats"],
        "jmdict_status": metadata["jmdict_source"]["status"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
