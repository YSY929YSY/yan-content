#!/usr/bin/env python3
"""词场句罗马音校对。

用法:
    python3 tools/check-wordfield-roma.py YanApp/staging/wordfield-batch-4.json

## 这个工具换过一次做法,原因值得写下来

第一版拿 pykakasi 当「第二个独立来源」:把整句转成罗马音,和人写的比对,不一致就报出来。
四批下来的实测:**45 句、23 处不一致、23 处全部是 pykakasi 错**,人写的一个字没错过。
错型五类:促音(走って→hashitsu te)、训读音读(隣の人→nin)、长音、
动词活用(戻って→modotsu te)、多音字取错义(注ぐ 倒酒义是 つぐ,它给 そそぐ)。

一个准确率 0% 的告警器不是第二来源,是噪声源 —— 报十次错九次是它自己错,
人第三次就开始无视它,那它连剩下那一次也拦不住了。

## 换成什么

关键认识:**歧义只存在于「汉字 → 假名」,不存在于「假名 → 罗马音」**。
后者是纯查表,没有猜的余地。而词库里每个词条的 `reading` 是人工校订过的假名。

所以改成查这件事:**每个成员词的假名读音,必须能在句子的罗马音里找到。**
成员 温泉 的 reading 是 おんせん → onsen,那句罗马音里必须出现 onsen。

这个检查零误报 —— 它不猜任何东西,只做一次确定性的查表。
它也确实抓得住真错:罗马音里漏字、拼错、把某个词整段忘了写,都会被它逮到。

pykakasi 那条留着,但降级成 `--second-opinion`:默认不跑,想看时才看,
而且报出来的东西一律当「可疑」不当「错误」。
"""
import json
import re
import sys

# ── 假名 → 黑本式罗马音。纯查表,长的先匹配(拗音必须在单假名之前)。
KANA = {
    'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo', 'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
    'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho', 'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
    'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo', 'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
    'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo', 'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
    'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo', 'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
    'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
    'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
    'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
    'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
    'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
    'わ': 'wa', 'を': 'o', 'ん': 'n',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
    'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
    'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
    # 外来音组合:片假名专用。缺了它们,チェックイン 会被读成 chikkuin
    'ちぇ': 'che', 'しぇ': 'she', 'じぇ': 'je', 'てぃ': 'ti', 'でぃ': 'di',
    'とぅ': 'tu', 'どぅ': 'du', 'ふぁ': 'fa', 'ふぃ': 'fi', 'ふぇ': 'fe', 'ふぉ': 'fo',
    'うぃ': 'wi', 'うぇ': 'we', 'うぉ': 'wo', 'つぁ': 'tsa', 'つぇ': 'tse', 'つぉ': 'tso',
    'ゔぁ': 'va', 'ゔぃ': 'vi', 'ゔ': 'vu', 'ゔぇ': 've', 'ゔぉ': 'vo',
    'ー': '\x01', 'っ': '\x00',   # 两个都要看上下文,下面单独处理
}
KEYS = sorted(KANA, key=len, reverse=True)


def kata_to_hira(s: str) -> str:
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in s)


def kana_to_roma(kana: str) -> str:
    """假名 → 罗马音。只做确定性的事,遇到不认识的字符就跳过。"""
    s = kata_to_hira(kana or '')
    out, i = [], 0
    while i < len(s):
        for k in KEYS:
            if s.startswith(k, i):
                out.append(KANA[k]); i += len(k); break
        else:
            i += 1                      # 汉字或标点:跳过,不猜
    r = ''.join(out)
    # 长音记号:重复前一个元音(スーツ→suutsu、アパート→apaato)
    while '\x01' in r:
        j = r.index('\x01')
        prev = ''
        for c in reversed(r[:j]):
            if c in 'aiueo':
                prev = c; break
        r = r[:j] + prev + r[j + 1:]
    # 促音:っ 让下一个辅音双写(買って→katte)。
    # 唯一特例:っ + ch 在黑本式里写 t 不写 c —— 出張 是 shutchou 不是 shucchou。
    while '\x00' in r:
        j = r.index('\x00')
        rest = r[j + 1:]
        dbl = 't' if rest.startswith('ch') else (rest[0] if rest and rest[0].isalpha() else '')
        r = r[:j] + dbl + rest
    return r


def flat(s: str) -> str:
    """比对用:只留字母。助词 を/は 两边同时抹平(见下)。"""
    t = ''.join(re.findall(r'[a-z]+', (s or '').lower().replace('-', '')))
    for a, b in (('wo', 'o'), ('ha', 'wa')):
        t = t.replace(a, b)
    return t


def main(path: str, second_opinion: bool = False) -> int:
    data = json.load(open(path, encoding='utf-8'))
    items = data['items'] if isinstance(data, dict) else data

    # 成员的假名读音从批次文件里拿不到,要回词库查
    import os
    bank_path = os.environ.get('WORDBANK') or os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(path))),
        'assets', 'content.fallback.json')
    bank = {}
    if os.path.exists(bank_path):
        for w in json.load(open(bank_path, encoding='utf-8')).get('wordBank', []):
            if w.get('id'):
                bank[w['id']] = w

    # ⚠️ 找不到词库就**停下**,不要接着跑。
    #
    # 2026-08-13 踩到:词库路径是从批次文件自己的位置推的,所以把批次文件
    # 复制到别处(比如 /tmp 里 dry-run)再跑,这里就查不到词库 —— 而原来的写法
    # 是 `bank = {}` 继续跑,于是**成员词全部静默跳过、只验了头词,还照样打印
    # 「通过 14」**。故意把成员词的罗马音改坏三处,三处都没被抓出来。
    #
    # 这比 pykakasi 那次更坏:那个是报错报得不对(人会开始无视它),
    # 这个是**报成功报得不对**(人会以为验过了)。工具的职责是找出可疑处,
    # 一个查不到数据的检查器只有一件事可做 —— 说自己查不了。
    # 想指到别处的词库用 WORDBANK=... 显式给。
    if not bank:
        print(f'✗ 找不到词库,无法校验成员读音:{bank_path}')
        print('  批次文件要放在 YanApp/staging/ 下跑,或用 WORDBANK=<content.fallback.json> 指定。')
        return 2

    missing, bad, ok = [], [], 0
    for it in items:
        wf = it.get('wordField') or {}
        sent = wf.get('sentence') or {}
        jp, roma = sent.get('jp'), sent.get('roma')
        if not jp:
            continue
        if not roma:
            missing.append((it.get('id'), jp)); continue

        target = flat(roma)
        problems = []
        # 头词自己 + 每个成员,读音都必须出现在罗马音里
        checks = [(it.get('word'), it.get('reading'))]
        for m in wf.get('members') or []:
            w = bank.get(m.get('id'))
            if w:
                checks.append((w.get('word'), w.get('reading')))
        for word, reading in checks:
            r = flat(kana_to_roma(reading))
            if not r:
                continue                                    # 读音里没有假名(纯符号),跳过
            if r in target:
                continue
            # 活用要容忍:蒸し暑い 在句子里是「蒸し暑くて」,词典形的最后一个音节不会出现。
            # 退一步查词干(去掉最后一个假名)—— 少验一个音节,换掉全部活用误报。
            stem = flat(kana_to_roma(reading[:-1]))
            if len(stem) >= 3 and stem in target:
                continue
            problems.append(f'{word}({reading}) → 期望罗马音含「{r}」(词干「{stem}」也没找到)')
        if problems:
            bad.append((it.get('id'), jp, roma, problems))
        else:
            ok += 1

    total = ok + len(bad) + len(missing)
    print(f'共 {total} 句:通过 {ok} · 有问题 {len(bad)} · 缺罗马音 {len(missing)}\n')

    for wid, jp in missing:
        print(f'✗ {wid} 缺罗马音\n    {jp}\n')
    for wid, jp, roma, problems in bad:
        print(f'✗ {wid}\n    原文  {jp}\n    罗马音 {roma}')
        for p in problems:
            print(f'    ↳ {p}')
        print()

    if second_opinion:
        try:
            import pykakasi
        except ImportError:
            print('(--second-opinion 需要 pykakasi,跳过)'); return 1 if (bad or missing) else 0
        print('── pykakasi 第二意见(**它经常是错的那个**,一律当可疑不当错误)' + '─' * 6)
        k = pykakasi.kakasi()
        for it in items:
            sent = (it.get('wordField') or {}).get('sentence') or {}
            if not sent.get('jp') or not sent.get('roma'):
                continue
            auto = ' '.join(x['hepburn'] for x in k.convert(sent['jp']))
            if flat(auto) != flat(sent['roma']):
                print(f'  ? {it.get("id")}\n      人写 {sent["roma"]}\n      工具 {auto}')

    return 1 if (bad or missing) else 0


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) != 1:
        print(__doc__); sys.exit(2)
    sys.exit(main(args[0], second_opinion='--second-opinion' in sys.argv))
