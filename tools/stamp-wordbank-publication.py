#!/usr/bin/env python3
"""publication 兼容迁移 —— 把当前已经存在的行为写成显式字段。

## 这个脚本在修什么

在这之前,「这个词能不能正式学」是从字段形状**猜**出来的:

    const isDraftedWord = (w) => !(w?.exampleJp && w?.exampleZh && w?.exampleRoma);

「例句齐全」被当成了「已核验、可进 SRS」。**例句完整不能证明中文义、
义项对齐或来源核验已经完成。** 这次把当前的产品行为原样写进内容包,
让运行时不再猜。

## ⚠️ 兼容迁移 ≠ 真实性核验

    legacy_dictionary_compat  只表示「保留当前查询能力」
    legacy_mainline_anchor    只表示「保留当前 N5 主线候选」

两者都**不得**映射成 `verified`、双源印证或人工核验。以后来源流水线复核时,
要另外生成 evidence,不能拿这两个 basis 冒充。

## 为什么 learning:false 不写 learningBasis

basis 记录的是一次**正向准入依据**;「尚未准入」没有可以冒充证据的 basis。
写 `null` 会造出第三种需要解释的业务状态 —— 而 `null` 和「字段不存在」
在下游会被不同的代码用不同方式判断,这正是本轮在消灭的那类歧义。

## 序列化

内容包实测可由 `json.dumps(doc, ensure_ascii=False, indent=1) + "\n"` 逐字节还原。
**不要用默认 json.dump** —— 默认参数会把 6MB 文件整个重新序列化,
diff 从几万行炸成六十多万行。

用法:
    python3 tools/stamp-wordbank-publication.py            # dry-run,只报告
    python3 tools/stamp-wordbank-publication.py --apply    # 落盘
    python3 tools/stamp-wordbank-publication.py --check    # 只校验迁移后状态
"""
import hashlib
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE = os.path.join(ROOT, 'yan-content', 'content.v2.json')
FALLBACK = os.path.join(ROOT, 'YanApp', 'assets', 'content.fallback.json')
TARGETS = [REMOTE, FALLBACK]

# 工单 §2 的只读基线。对不上就停 —— 不拿旧工单覆盖新数据。
BASELINE_SHA = 'c7e24daf4a8c36d1b4e63bb05bf72c527d295abfae4d266774cc20ce0c06f67a'
BASELINE_BYTES = 6743897
EXPECT_WORDS = 8005
EXPECT_ANCHOR = 563

# 本次迁移的产物快照。**这三个数是这个脚本唯一的锚。**
#
# ⚠️ 只检查 publication 的形状是不够的:一份 publication 全合法、
# 但删掉了一个词或改坏了 _meta 的文件,形状检查照样全过。
# MIGRATED_PROJECTION_SHA 锁的正是「publication 之外的一切」——
# 词序、字段顺序、顶层键、_meta,任何一处漂移它都会变。
MIGRATED_SHA = '86a4235d40830a6758883ab0cf67a6b7422a91adcaecce853868779eee3b3631'
MIGRATED_BYTES = 7754410
MIGRATED_PROJECTION_SHA = '8d36ec078321bef6e5292e328a95704fe467042a803d0f6dd19d3b72f28c01c3'

DICT_BASIS = 'legacy_dictionary_compat'
LEARN_BASIS = 'legacy_mainline_anchor'


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def read(path: str) -> bytes:
    with open(path, 'rb') as f:
        return f.read()


def dump(doc) -> bytes:
    """唯一的序列化口径。改这里等于改 diff 预算。"""
    return (json.dumps(doc, ensure_ascii=False, indent=1) + '\n').encode('utf-8')


def is_anchor(w) -> bool:
    return 'kanji_anchor' in (w.get('yanFeatures') or [])


def filled(v) -> bool:
    return isinstance(v, str) and v.strip() != ''


def has_dictionary_shape(w) -> bool:
    """和 src/features/wordbank/publication.ts 的 hasDictionaryShape 等价。

    ⚠️ 两处必须同口径。这里判过的结构,运行时 selector 也要判得过,
    否则会造出「内容包说可查、App 说结构坏」的矛盾态。
    """
    if not isinstance(w, dict):
        return False
    return filled(w.get('word')) and filled(w.get('reading')) \
        and (filled(w.get('meaning_zh')) or filled(w.get('meaning_en')))


def build_publication(w) -> dict:
    """本次迁移的唯一输出 schema。布尔必须是真布尔。"""
    pub = {
        'dictionary': True,
        'learning': bool(is_anchor(w)),
        'dictionaryBasis': DICT_BASIS,
    }
    # ⚠️ learning:false 不写 learningBasis,也不写 null(见文件头)
    if pub['learning']:
        pub['learningBasis'] = LEARN_BASIS
    return pub


def projection(doc) -> str:
    """去掉 publication 之后的内容投影。

    ⚠️ 这是「非 publication 字段零变化」的证据来源:
    迁移前后各算一次,字符串必须完全相同。它同时锁住了词序、字段顺序、
    顶层键和 _meta —— 任何一处漂移都会让这个字符串不同。
    """
    clone = json.loads(json.dumps(doc, ensure_ascii=False))
    for w in clone.get('wordBank', []):
        w.pop('publication', None)
    return json.dumps(clone, ensure_ascii=False, indent=1)


def pub_is_valid(pub, anchor: bool) -> bool:
    """一条 publication 是不是完整、合法的迁移后状态。"""
    if not isinstance(pub, dict) or isinstance(pub, list):
        return False
    if pub.get('dictionary') is not True:
        return False
    if pub.get('dictionaryBasis') != DICT_BASIS:
        return False
    if anchor:
        return pub.get('learning') is True and pub.get('learningBasis') == LEARN_BASIS
    return pub.get('learning') is False and 'learningBasis' not in pub


def classify(path: str):
    """这份文件现在处于哪一态:baseline / migrated / other。

    ⚠️ `other` 的原因必须说准。一个「内容被改过但根本没有 publication」的文件,
    报成「publication 不合法」会把人引到错的方向去查 —— 而这个脚本的失败路径
    正是它最该说清楚的地方(它拒绝写文件时,操作者只有这一行字可看)。
    """
    raw = read(path)
    if sha256(raw) == BASELINE_SHA:
        return 'baseline', raw, None
    try:
        doc = json.loads(raw.decode('utf-8'))
    except Exception as e:
        return 'other', raw, f'不是合法 JSON: {e}'
    wb = doc.get('wordBank')
    if not isinstance(wb, list):
        return 'other', raw, 'wordBank 不是数组'
    if len(wb) != EXPECT_WORDS:
        return 'other', raw, f'wordBank 是 {len(wb)} 条,基线要求 {EXPECT_WORDS}'

    with_pub = sum(1 for w in wb if 'publication' in w)
    if with_pub == 0:
        # 一条 publication 都没有,却又不是基线 SHA —— 内容本身被改过
        return 'other', raw, f'不是基线 SHA(内容已被改动),且 0 条 publication'
    missing = [w.get('id') for w in wb if 'publication' not in w]
    invalid = [w.get('id') for w in wb
               if 'publication' in w and not pub_is_valid(w.get('publication'), is_anchor(w))]
    if missing or invalid:
        parts = []
        if missing:
            parts.append(f'{len(missing)} 条缺 publication(例:{missing[:3]})')
        if invalid:
            parts.append(f'{len(invalid)} 条 publication 不合法(例:{invalid[:3]})')
        return 'other', raw, f'部分迁移:{with_pub}/{len(wb)} 条有 publication —— ' + ';'.join(parts)

    # ⚠️ publication 形状全过**不等于**这是一份合法的迁移后文件。
    # 走完整验证:字节、SHA、条数、结构、统计、投影都对上才算 migrated。
    # 只有 migrated 的字节才有资格当单边修复的来源。
    ok, why, _ = verify_migrated(raw)
    if not ok:
        return 'other', raw, f'publication 形状齐全,但整体校验失败:{why}'
    return 'migrated', raw, None


def stats(doc) -> dict:
    wb = doc['wordBank']
    d = sum(1 for w in wb if (w.get('publication') or {}).get('dictionary') is True)
    lt = sum(1 for w in wb if (w.get('publication') or {}).get('learning') is True)
    lf = sum(1 for w in wb if (w.get('publication') or {}).get('learning') is False)
    lwd = sum(1 for w in wb
              if (w.get('publication') or {}).get('learning') is True
              and (w.get('publication') or {}).get('dictionary') is not True)
    db = sum(1 for w in wb if (w.get('publication') or {}).get('dictionaryBasis') == DICT_BASIS)
    lb = sum(1 for w in wb if (w.get('publication') or {}).get('learningBasis') == LEARN_BASIS)
    stray = sum(1 for w in wb
                if (w.get('publication') or {}).get('learning') is False
                and 'learningBasis' in (w.get('publication') or {}))
    anchors = {w['id'] for w in wb if is_anchor(w)}
    learners = {w['id'] for w in wb if (w.get('publication') or {}).get('learning') is True}
    return {
        'dictionary_true': d, 'learning_true': lt, 'learning_false': lf,
        'learning_without_dictionary': lwd,
        'dictionaryBasis_ok': db, 'learningBasis_ok': lb,
        'learning_false_with_basis': stray,
        'learners_equal_anchors': learners == anchors,
    }


def fail(msg: str):
    print(f'✗ {msg}', file=sys.stderr)
    sys.exit(1)


def generate(baseline_raw: bytes):
    """在内存里完成生成 + 全部验证。任何一条不过就抛,绝不落盘。"""
    doc = json.loads(baseline_raw.decode('utf-8'))
    before = projection(doc)

    wb = doc.get('wordBank')
    if not isinstance(wb, list):
        fail('wordBank 不是数组')
    if len(wb) != EXPECT_WORDS:
        fail(f'wordBank 是 {len(wb)} 条,基线要求 {EXPECT_WORDS}')

    ids = [w.get('id') for w in wb]
    if any(not i for i in ids):
        fail('有词条缺 id')
    if len(ids) != len(set(ids)):
        fail('id 有重复')

    anchors = sum(1 for w in wb if is_anchor(w))
    if anchors != EXPECT_ANCHOR:
        fail(f'kanji_anchor 是 {anchors} 条,基线要求 {EXPECT_ANCHOR}')

    bad_shape = [w.get('id') for w in wb if not has_dictionary_shape(w)]
    if bad_shape:
        fail(f'{len(bad_shape)} 条不满足 hasDictionaryShape,例:{bad_shape[:5]}')

    for w in wb:
        if 'publication' in w:
            fail(f"{w.get('id')} 已有 publication —— 基线应为 0 条")
        w['publication'] = build_publication(w)

    st = stats(doc)
    if st['dictionary_true'] != EXPECT_WORDS:
        fail(f"dictionary true = {st['dictionary_true']},应为 {EXPECT_WORDS}")
    if st['learning_true'] != EXPECT_ANCHOR:
        fail(f"learning true = {st['learning_true']},应为 {EXPECT_ANCHOR}")
    if st['learning_false'] != EXPECT_WORDS - EXPECT_ANCHOR:
        fail(f"learning false = {st['learning_false']},应为 {EXPECT_WORDS - EXPECT_ANCHOR}")
    if st['learning_without_dictionary'] != 0:
        fail('出现 learning-without-dictionary')
    if st['learning_false_with_basis'] != 0:
        fail('learning:false 的词带了 learningBasis')
    if not st['learners_equal_anchors']:
        fail('learning true 的集合与 kanji_anchor 集合不同')

    after = projection(doc)
    if after != before:
        fail('非 publication 字段发生了变化(词序/字段顺序/顶层内容漂移)')

    out = dump(doc)
    # 生成的字节必须能原样读回来,否则替换目标毫无意义
    if json.loads(out.decode('utf-8')) != doc:
        fail('生成的字节重新读回来和内存对象不一致')
    return out, st


def prepare(path: str, data: bytes) -> str:
    """写同目录临时文件 + fsync + 回读验证。返回临时文件路径,**不替换目标**。"""
    d = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=d, prefix='.stamp-pub-', suffix='.tmp')
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        if read(tmp) != data:
            raise RuntimeError(f'{path} 的临时文件回读不一致')
        return tmp
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def write_all_atomic(pairs):
    """两阶段落盘:**先把所有临时文件都准备好,再依次替换目标。**

    ⚠️ 不能边准备边替换。原来的写法是循环里 mkstemp → 写 → replace,
    于是第二份准备失败时,第一份目标**已经被换掉了** —— 留下一个
    「一份新、一份旧」的中断态,而这个中断态本可以完全避免。

    准备阶段任意失败:清理全部临时文件,两个目标零变化。
    跨文件的 replace 之间仍无法原子(不同 inode),那一段残留的中断态
    由单边恢复处理 —— 但窗口已经从「整个生成+写入」缩到「两次 replace 之间」。
    """
    tmps = []
    try:
        for path, data in pairs:
            tmps.append((path, prepare(path, data)))
    except BaseException:
        for _, t in tmps:
            if os.path.exists(t):
                os.unlink(t)
        raise
    for path, tmp in tmps:
        os.replace(tmp, path)


def report_inputs():
    rows = []
    for p in TARGETS:
        raw = read(p)
        rows.append((p, len(raw), sha256(raw)))
    identical = len({r[2] for r in rows}) == 1
    print('输入:')
    for p, n, h in rows:
        print(f'  {os.path.relpath(p, ROOT):<44} {n:>9} bytes  {h}')
    print(f'  逐字节相同: {identical}')
    return rows, identical


def verify_migrated(raw: bytes):
    """**唯一的迁移后验证入口。**

    ⚠️ `--check`、`classify()` 判 migrated、单边修复取源,三处必须都走这里。
    各写一份弱校验的后果已经实测过两次:

      · 只数 publication 形状 → 删掉一个非 anchor 词,8004 条照样 --check 通过;
      · 只看 publication 合法 → 一份 _meta 被改坏的文件被判成 migrated,
        然后**被当成修复源复制到了另一份好文件上**,而且报「✓ 通过」。

    所以这里锁死整份产物:字节、SHA、条数、结构、统计,以及最要紧的
    「publication 之外的一切」(投影 SHA)。

    @returns (ok, reason, stats)。不打印、不退出 —— 调用方决定怎么处理。
    """
    if len(raw) != MIGRATED_BYTES:
        return False, f'字节数 {len(raw)},迁移后应为 {MIGRATED_BYTES}', None
    if sha256(raw) != MIGRATED_SHA:
        return False, f'SHA {sha256(raw)[:16]}…,迁移后应为 {MIGRATED_SHA[:16]}…', None
    try:
        doc = json.loads(raw.decode('utf-8'))
    except Exception as e:
        return False, f'不是合法 JSON: {e}', None

    wb = doc.get('wordBank')
    if not isinstance(wb, list):
        return False, 'wordBank 不是数组', None
    if len(wb) != EXPECT_WORDS:
        return False, f'wordBank 是 {len(wb)} 条,应为 {EXPECT_WORDS}', None

    ids = [w.get('id') for w in wb]
    if any(not i for i in ids):
        return False, '有词条缺 id', None
    if len(ids) != len(set(ids)):
        return False, 'id 有重复', None

    anchors = sum(1 for w in wb if is_anchor(w))
    if anchors != EXPECT_ANCHOR:
        return False, f'kanji_anchor 是 {anchors} 条,应为 {EXPECT_ANCHOR}', None

    bad_shape = [w.get('id') for w in wb if not has_dictionary_shape(w)]
    if bad_shape:
        return False, f'{len(bad_shape)} 条不满足 dictionary shape,例:{bad_shape[:3]}', None

    bad_pub = [w.get('id') for w in wb if not pub_is_valid(w.get('publication'), is_anchor(w))]
    if bad_pub:
        return False, f'{len(bad_pub)} 条 publication 不合法,例:{bad_pub[:3]}', None

    st = stats(doc)
    checks = [
        (st['dictionary_true'] == EXPECT_WORDS, 'dictionary_true'),
        (st['learning_true'] == EXPECT_ANCHOR, 'learning_true'),
        (st['learning_false'] == EXPECT_WORDS - EXPECT_ANCHOR, 'learning_false'),
        (st['learning_without_dictionary'] == 0, 'learning_without_dictionary'),
        (st['learning_false_with_basis'] == 0, 'learning_false_with_basis'),
        (st['dictionaryBasis_ok'] == EXPECT_WORDS, 'dictionaryBasis_ok'),
        (st['learningBasis_ok'] == EXPECT_ANCHOR, 'learningBasis_ok'),
        (st['learners_equal_anchors'], 'learners_equal_anchors'),
    ]
    for ok, name in checks:
        if not ok:
            return False, f'统计不符:{name} = {st.get(name)}', st

    proj_sha = hashlib.sha256(projection(doc).encode('utf-8')).hexdigest()
    if proj_sha != MIGRATED_PROJECTION_SHA:
        return False, (f'非 publication 内容已漂移:投影 SHA {proj_sha[:16]}…,'
                       f'应为 {MIGRATED_PROJECTION_SHA[:16]}…'), st

    return True, None, st


def cmd_check():
    rows, identical = report_inputs()
    if not identical:
        fail('两份内容包不是逐字节相同')
    ok, why, st = verify_migrated(read(TARGETS[0]))
    if st:
        print('\n迁移后统计:')
        for k, v in st.items():
            print(f'  {k:<32} {v}')
    if not ok:
        fail(why)
    print('\n✓ --check 通过(含字节、SHA、条数、结构、统计、投影)')


def main():
    args = set(sys.argv[1:])
    if '--check' in args:
        return cmd_check()

    apply = '--apply' in args
    states = {p: classify(p) for p in TARGETS}
    kinds = {p: s[0] for p, s in states.items()}
    print('文件状态:')
    for p, (k, raw, why) in states.items():
        print(f'  {os.path.relpath(p, ROOT):<44} {k}{"  ← " + why if why else ""}')
    print()

    others = [p for p, k in kinds.items() if k == 'other']
    if others:
        fail(f'{len(others)} 份文件既不是基线也不是合法迁移后状态,拒绝猜测')

    migrated = [p for p, k in kinds.items() if k == 'migrated']
    baseline = [p for p, k in kinds.items() if k == 'baseline']

    # ── 单边中断态:一份已迁移、一份仍是精确基线 ──
    if migrated and baseline:
        # ⚠️ classify 判 migrated 已经走过 verify_migrated,
        # 所以这份字节是**完整校验过**的,不只是 publication 形状对。
        good = states[migrated[0]][1]
        print(f'⚠️ 单边中断态:{len(migrated)} 份已迁移,{len(baseline)} 份仍是基线')
        if not apply:
            print('   dry-run 只报告。用 --apply 以已验证的迁移后字节修复另一份。')
            return
        write_all_atomic([(p, good) for p in baseline])
        for p in baseline:
            print(f'   已修复 {os.path.relpath(p, ROOT)}')
        return cmd_check()

    # ── 全部已迁移:重复 apply 必须是安全 no-op ──
    if not baseline:
        print('两份都已是合法迁移后状态 —— 重复执行是 no-op,不写文件。')
        return cmd_check()

    # ── 全部是基线:正常迁移 ──
    raw = states[TARGETS[0]][1]
    if sha256(raw) != BASELINE_SHA:
        fail('输入 SHA 不是本工单基线 SHA')
    if len(raw) != BASELINE_BYTES:
        fail(f'输入是 {len(raw)} bytes,基线要求 {BASELINE_BYTES}')

    out, st = generate(raw)
    print('计划写入:')
    for k, v in st.items():
        print(f'  {k:<32} {v}')
    print(f'\n  输出大小   {len(out):>9} bytes')
    print(f'  输出 SHA-256 {sha256(out)}')

    if not apply:
        print('\n(dry-run,没有写文件。要写加 --apply)')
        return

    # 两个临时文件都准备成功后才替换目标(见 write_all_atomic)
    write_all_atomic([(p, out) for p in TARGETS])
    for p in TARGETS:
        if read(p) != out:
            fail(f'{p} 写后回读不一致')
    print('\n✓ 已写入两份内容包')
    print()
    cmd_check()


if __name__ == '__main__':
    main()
