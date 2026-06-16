#!/usr/bin/env python3
"""
N4 词条质量审计脚本
检查 POS、coreChunk、exampleRoma 等字段的完整性和基本合理性
"""

import json
import re
import sys
from collections import Counter

CONTENT_PATH = "yan-content/content.v2.json"

SENTENCE_ENDINGS = re.compile(r'(です|ます|ました|ません|でした|だ|である|。)$')
MAX_CHUNK_UNITS = 8  # 超过这个长度的 coreChunk 可能是句子

VALID_POS = {
    '名词', '动词', '副词', 'い形容词', 'な形容词', '连体词',
    '量词', '代词', '感叹词', '助词', '接尾词', '接头词', '接续词',
    '名词/副词', '副词/名词', '名词（する动词）', '副词/な形容词',
    'な形容词/副词', 'な形容词/连体词', '形容词',  # 保留作为兼容
    '助动词',  # 样态/推量等轻语法词（如 〜そう）
    '动词（他动词）', '动词（自动词）', '副助词',
    '疑问词', '词缀', '敬语表达', 'する动词',
    '感叹词/副词', '连词',
}


def load_content():
    with open(CONTENT_PATH, 'r') as f:
        return json.load(f)


def audit_n4(entries):
    issues = []

    for w in entries:
        word = w.get('word', '')
        eid = w.get('id', '')
        pos = w.get('pos', '')
        chunk = w.get('coreChunk', '')
        ex_jp = w.get('exampleJp', '')
        ex_roma = w.get('exampleRoma', '')
        ex_zh = w.get('exampleZh', '')

        def flag(level, msg):
            issues.append({'level': level, 'id': eid, 'word': word, 'msg': msg})

        # POS checks
        if not pos:
            flag('ERROR', 'pos 为空')
        elif pos not in VALID_POS:
            flag('WARN', f'pos 值不在标准集: {pos!r}')

        # coreChunk checks
        if not chunk:
            flag('INFO', 'coreChunk 为空')
        else:
            reading = w.get('reading', '')
            if word not in chunk and (reading and reading not in chunk):
                flag('WARN', f'coreChunk 不含目标词: {chunk!r}')
            if SENTENCE_ENDINGS.search(chunk):
                flag('WARN', f'coreChunk 疑似完整句子（以 です/ます 等结尾）: {chunk!r}')
            if len(chunk) > MAX_CHUNK_UNITS * 2:
                flag('WARN', f'coreChunk 过长（{len(chunk)} 字）: {chunk!r}')

        # exampleJp checks
        if not ex_jp:
            flag('ERROR', 'exampleJp 为空')

        # exampleZh checks
        if not ex_zh:
            flag('ERROR', 'exampleZh 为空')

        # exampleRoma checks
        if not ex_roma:
            flag('WARN', 'exampleRoma 为空')

    return issues


def print_report(issues, total):
    errors = [i for i in issues if i['level'] == 'ERROR']
    warns = [i for i in issues if i['level'] == 'WARN']
    infos = [i for i in issues if i['level'] == 'INFO']

    print(f"\n{'='*60}")
    print(f"N4 质量审计报告  总词条: {total}")
    print(f"{'='*60}")
    print(f"ERROR  {len(errors)}")
    print(f"WARN   {len(warns)}")
    print(f"INFO   {len(infos)}  （coreChunk 空条数）")

    if errors:
        print(f"\n--- ERROR ---")
        for i in errors:
            print(f"  [{i['id']}] {i['word']}: {i['msg']}")

    if warns:
        print(f"\n--- WARN ---")
        for i in warns:
            print(f"  [{i['id']}] {i['word']}: {i['msg']}")

    chunk_empty = len(infos)
    chunk_filled = total - chunk_empty
    print(f"\ncoreChunk 填充率: {chunk_filled}/{total} ({100*chunk_filled//total}%)")

    if errors:
        print(f"\n✗ 有 Blocker（{len(errors)} 条 ERROR），请修复后再推送")
        return False
    else:
        print(f"\n✓ 无 Blocker")
        return True


def main():
    data = load_content()
    n4 = [w for w in data['wordBank'] if w.get('level') == 'N4']
    issues = audit_n4(n4)
    ok = print_report(issues, len(n4))
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
