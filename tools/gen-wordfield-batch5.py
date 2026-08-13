#!/usr/bin/env python3
"""生成 staging/wordfield-batch-5.json（人・交際 kousai，14 条）。断言不过就不写文件。

做法同 batch3/4，会读 batch-1~4 的产物做去重（同一个词不写两个批次），
所以**跑之前 batch-1~4 必须已经在 `YanApp/staging/` 里**。

只读 `content.fallback.json`，不改它。

    python3 tools/gen-wordfield-batch5.py

想先看结果不覆盖现有 staging：`WORDFIELD_OUT=/tmp/b5.json python3 tools/...`
零第三方依赖，标准库即可。

## 这一批的取舍（写第六批的人先看这段）

- **动词只能用辞書形。** `auditWordFields` 是子串精确匹配，`断る` 配不上 `断った`。
  所以句子里的成员动词一律落在 `断ると` / `手伝うと` / `譲るだけ` / `まず謝る。`
  这类位置上。**宁可少一个成员也不要扭句子**——有三张卡因此只有 3 个成员。
- **`誤解` 故意没有意象。** 汉字对中文母语者完全透明，按标准第二节那是「表演深度」。
  一整批都配意象说明没在做判断。
- **`失礼` 不在词库里**，所以「进门/告辞」那一组只能绕开它。要补词条再说。
- **`かける` 在词库里有 6 条同音异义**（掛ける/欠ける/駆ける/賭ける…），
  当成员会指不明白，这一批一律不用它。
"""
import json, os, sys, re

# 从脚本位置推 ROOT，别写死
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANK = json.load(open(f"{ROOT}/YanApp/assets/content.fallback.json"))["wordBank"]
BY_ID = {w["id"]: w for w in BANK if w.get("id")}
CAND = {c["id"]: c for c in json.load(open(f"{ROOT}/YanApp/staging/wordfield-candidates-v2.json"))}
DONE = set()
for n in (1, 2, 3, 4):
    b = json.load(open(f"{ROOT}/YanApp/staging/wordfield-batch-{n}.json"))
    for it in (b["items"] if isinstance(b, dict) else b):
        DONE.add(it["id"])

ITEMS = [
    dict(
        id="n3_jama", label="进别人家门的头一分钟",
        jp="「お邪魔します」と言って玄関で靴を脱ぎ、案内された部屋に上がる。",
        zh="说一句「打扰了」，在玄关脱鞋，进到被领去的那个房间。",
        roma="\"Ojama shimasu\" to itte genkan de kutsu o nugi, annai sareta heya ni agaru.",
        members=["n5_genkan", "n5_kutsu", "n5_heya"],
        image="中文的「邪魔」是妖魔鬼怪，日语里只是「碍事」。它最常出现的地方是进别人家门那句「お邪魔します」——不是自称妖怪，是说「我这就要占用你的地方了」。",
        relation="进门说的那句话 → 在哪儿说 → 脱什么 → 进到哪儿",
        dropped=["失礼 —— 「お邪魔します」的近邻，但它根本不在词库里，配不上 id"],
    ),
    dict(
        id="n4_enryo", label="谢绝的时候",
        jp="招待を遠慮して断るのは、相手の気持ちを考えた上での返事でもある。",
        zh="客气地谢绝邀请，也是替对方的心情想过之后才给的回答。",
        roma="Shoutai o enryo shite kotowaru no wa, aite no kimochi o kangaeta ue de no henji de mo aru.",
        members=["n4_shoutai", "n3_kotowaru", "n3_aite", "n4_kimochi", "n4_henji"],
        image="中文的「远虑」是想得远，日语的「遠慮」是**往后退一步**：手缩回来、话咽下去。所以「遠慮なく」不是「别想太多」，是「别客气，伸手拿」。",
        relation="收到什么 → 怎么处理 → 顾及谁 → 顾及他的什么 → 这件事本身也是一种什么",
        dropped=["n4_tsugou 都合 —— 谢绝时确实常说「都合が悪くて」，但那是理由的说法，塞进来这句就成了两件事"],
    ),
    dict(
        id="n3_aisatsu", label="身体比话先动",
        jp="朝、近所で人に会うたびに頭を下げる。挨拶は言葉より先に体が動く。",
        zh="早上在附近每遇到一个人就低一次头。问候是身体先动，话在后面。",
        roma="Asa, kinjo de hito ni au tabi ni atama o sageru. Aisatsu wa kotoba yori saki ni karada ga ugoku.",
        members=["n4_kinjo", "n5_atama", "n4_sageru", "n5_kotoba"],
        image="「挨」和「拶」在中文里都不单用，这两个字给不了任何钩子。记它得从动作记：先低头，再出声——低头的深浅和时机，比说了什么更要紧。",
        relation="什么时候 → 在哪儿 → 身体做什么 → 和话的先后",
        dropped=["n5_ohayou —— 具体的招呼语是挨拶的一个实例，不是它的邻居"],
    ),
    dict(
        id="n5_kekkou", label="说「不用了」的那一刻",
        jp="「もう結構です」と断ると、店の人はそれ以上茶を勧めなかった。",
        zh="说了一句「已经够了」，店里的人就没再劝茶。",
        roma="\"Mou kekkou desu\" to kotowaru to, mise no hito wa sore ijou cha o susumenakatta.",
        members=["n3_kotowaru", "n5_mise", "n3_cha"],
        image="結構 是言里最容易出事的词：它同时是「很好」和「不用了」。分界在语气和场合——被劝东西时说「結構です」，永远是**谢绝**。听成夸奖会一直被添茶。",
        relation="说什么 → 这句话的作用 → 在哪儿 → 对方因此停下什么",
        dropped=["n5_ocha お茶 —— 和 n3_cha 茶 是同一样东西的两条词条，只挂一个"],
    ),
    dict(
        id="n5_taihen", label="一个人干不动的时候",
        jp="一人で荷物を運ぶのは大変だから、隣の人が手伝うと言ってくれた。",
        zh="一个人搬行李够呛，隔壁的人说来搭把手。",
        roma="Hitori de nimotsu o hakobu no wa taihen dakara, tonari no hito ga tetsudau to itte kureta.",
        members=["n5_nimotsu", "n5_tonari", "n4_tetsudau"],
        image="中文的「大变」是变化大，日语的「大変」是**事情大了**。它既能当「非常」（大変おいしい），也能当「够呛」（大変だったね）——一个在夸，一个在慰问，靠场合分。",
        relation="干什么 → 状态 → 谁看见了 → 他因此提出什么",
        dropped=[],
    ),
    dict(
        id="n3_kinodoku", label="听说别人出事之后",
        jp="事故で入院した人の話を聞いて、気の毒だと思い、見舞いに行くことにした。",
        zh="听说有人出事故住了院，觉得可怜，决定去探望。",
        roma="Jiko de nyuuin shita hito no hanashi o kiite, kinodoku da to omoi, mimai ni iku koto ni shita.",
        members=["n4_jiko", "n4_nyuuin", "n3_mimai"],
        image="「毒」看着吓人，其实说的是「这份心情有毒」——难受的是**说话的人自己**。所以它是同情，不是在评价对方倒霉。当面说「お気の毒に」是慰问，不是嫌弃。",
        relation="发生了什么 → 结果 → 我的心情 → 因此去做的事",
        dropped=["n1_doujou 同情 —— 书面的近义词，标准第三节明说不列近义词"],
    ),
    dict(
        id="n1_giri", label="欠着的那笔人情",
        jp="世話になった人に何かを返すのは、義理であって感謝とは限らない。",
        zh="给照顾过自己的人回点什么，那是人情账，不一定是感激。",
        roma="Sewa ni natta hito ni nani ka o kaesu no wa, giri de atte kansha to wa kagiranai.",
        members=["n4_sewa", "n5_kaesu", "n3_kansha"],
        image="義理 是**账本上欠着的那一笔**：受了照顾就得还，还多少看关系，不看心情。所以有「義理チョコ」——不是喜欢，是账上该有这一笔。",
        relation="受了谁的什么 → 要做的动作 → 它是什么 → 它不是什么",
        dropped=["n1_ninjou 人情 —— 「義理と人情」是固定搭配，但它正好是义理的**对立面**（心意 vs 账），同框会让人以为是近义词"],
    ),
    dict(
        id="n3_battari", label="没有前奏的相遇",
        jp="駅で昔の友達にばったり会うのは、約束して会うより記憶に残る。",
        zh="在车站冷不丁碰见老朋友，比约好了见面更记得住。",
        roma="Eki de mukashi no tomodachi ni battari au no wa, yakusoku shite au yori kioku ni nokoru.",
        members=["n5_eki", "n5_tomodachi", "n4_yakusoku"],
        image="ばったり 本来是**东西一下子倒下**的声音。用在遇见人身上，它保留的正是那一点：没有前奏，突然就在眼前。所以它永远和「約束」相对。",
        relation="在哪儿 → 遇见谁 → 怎么遇见的 → 和「约好」对着看",
        dropped=["n3_guuzen 偶然 —— 意思对，但那是个中性的抽象名词；ばったり 带着声音和身体反应，两者不是一个层面"],
    ),
    dict(
        id="n2_shitsukoi", label="甩不掉的时候",
        jp="勧誘の電話がしつこいので、はっきり断ることにした。",
        zh="推销电话缠得没完，决定明确回绝。",
        roma="Kanyuu no denwa ga shitsukoi node, hakkiri kotowaru koto ni shita.",
        members=["n1_kanyuu_2", "n5_denwa", "n3_kotowaru"],
        image="しつこい 最早说的是**味道太浓、油腻得散不掉**。用在人身上是同一种感觉：粘着不走，怎么擦都在。所以它形容的不是次数多，是「甩不掉」。",
        relation="什么事 → 通过什么来的 → 什么感觉 → 因此做的处理",
        dropped=["n3_meiwaku 迷惑 —— 添麻烦是结果，しつこい 是那个动作本身的质感，混在一句里会互相稀释"],
    ),
    dict(
        id="n1_iiwake", label="迟到之后先说什么",
        jp="遅刻の理由を説明しても言い訳になるだけなら、まず謝る。",
        zh="迟到的理由说了也只会变成辩解的话，那就先道歉。",
        roma="Chikoku no riyuu o setsumei shite mo iiwake ni naru dake nara, mazu ayamaru.",
        members=["n3_chikoku", "n4_riyuu", "n4_setsumei", "n4_ayamaru"],
        image="「訳」在中文里是翻译，在这儿是**理由**：言い訳 = 把理由说出来。同一件事说早了叫说明，说晚了、对方还在生气时说，就成了辩解——差的不是内容，是时机。",
        relation="发生了什么 → 手里有什么 → 说出来会变成什么 → 所以先做什么",
        dropped=["n4_uso 嘘 —— 言い訳 不一定是假话，这正是它和撒谎的区别，放一起会教错"],
    ),
    dict(
        id="n2_tasukaru", label="得救的是谁",
        jp="混んだ電車で席を譲るだけで、相手はずいぶん助かる。",
        zh="在挤的电车上让个座，对方就轻松很多。",
        roma="Konda densha de seki o yuzuru dake de, aite wa zuibun tasukaru.",
        members=["n4_seki", "n3_yuzuru", "n3_aite"],
        image="助かる 是自动词——**得救的是主语自己**。所以「助かります」不是「我来帮你」，是「你救了我」，说的是自己的处境。中文说「帮大忙了」时，主语正好是反的。",
        relation="在什么场合 → 做一个很小的动作 → 谁因此怎么样",
        dropped=["n4_tetsudau 手伝う —— 他动词，和 助かる 正好是一个动作的两头；同框会让「谁得救」这条主线糊掉"],
    ),
    dict(
        id="n3_gokai", label="话不够的时候",
        jp="冗談を本気に取られると誤解が生まれるので、言葉は選ぶ。",
        zh="玩笑被当了真就会生出误会，所以话要挑着说。",
        roma="Joudan o honki ni torareru to gokai ga umareru node, kotoba wa erabu.",
        members=["n3_joudan", "n1_honki", "n5_kotoba"],
        # 故意没有 image：汉字对中文母语者完全透明，按标准第二节那是「表演深度」
        relation="说了什么 → 被怎么接住 → 因此产生什么 → 所以怎么做",
        dropped=["n3_setsumei? 説明 —— 已经在 言い訳 那张卡里当成员，同一个词在两张卡里当邻居会让词场看起来是通用填充"],
    ),
    dict(
        id="n2_nikoniko", label="总在笑的人",
        jp="いつもにこにこしている人ほど、機嫌の悪い日は顔に出る。",
        zh="越是平时笑呵呵的人，心情不好那天越写在脸上。",
        roma="Itsumo nikoniko shite iru hito hodo, kigen no warui hi wa kao ni deru.",
        members=["n5_itsumo", "n3_kigen", "n5_kao"],
        image="にこにこ 是**眼睛和嘴角一起弯、没有声音**的笑。有声音的另有其词：げらげら 是放声大笑，にやにや 是憋着的坏笑。日语把笑分得细，分的是声音和意图，不是程度。",
        relation="频率 → 什么样的笑 → 反过来的那天 → 露在哪儿",
        dropped=["n4_warau 笑う —— 上位词。把「笑」和「にこにこ」放一句里等于自己解释自己"],
    ),
    dict(
        id="n1_taimingu", label="约人这件事",
        jp="誘うタイミングさえ合えば、忙しい人でも用事の合間に出てくる。",
        zh="只要约的时机对上，再忙的人也会从事情的空档里出来。",
        roma="Sasou taimingu sae aeba, isogashii hito demo youji no aima ni dete kuru.",
        members=["n3_sasou", "n5_isogashii", "n4_youji"],
        image="英语的 timing 也说计时（秒表、发动机正时），日语的 タイミング 几乎只用在**时机对不对**上。所以它搭的是「合う（对上）」「外す（错过）」，不搭秒表。",
        relation="做什么 → 靠什么成事 → 对方是什么状态 → 从哪儿挤出时间",
        dropped=["n4_tsugou 都合 —— 都合 是对方那边的客观安排，タイミング 是两边对上的那一瞬，不是一回事"],
    ),
]

# ── 断言。全部通过才写文件 ────────────────────────────────────
errs, seen = [], set()
for it in ITEMS:
    hid = it["id"]
    c = CAND.get(hid)
    w = BY_ID.get(hid)
    if hid in seen: errs.append(f"{hid} 重复")
    seen.add(hid)
    if not w: errs.append(f"{hid} 不在 wordBank"); continue
    if not c: errs.append(f"{hid} 不在候选表"); continue
    if c.get("scene") != "kousai": errs.append(f"{hid} scene 不是 kousai")
    if hid in DONE: errs.append(f"{hid} 前四批已写过")
    if w.get("wordField"): errs.append(f"{hid} 词库里已有 wordField")
    for f in ("word", "reading", "level"):
        if w[f] != c[f]: errs.append(f"{hid} {f} 与候选表不一致: {w[f]} vs {c[f]}")
    ms = it["members"]
    if not (3 <= len(ms) <= 5): errs.append(f"{hid} 成员数 {len(ms)} 不在 3~5")
    if len(set(ms)) != len(ms): errs.append(f"{hid} 成员重复")
    if hid in ms: errs.append(f"{hid} 把自己当成员")
    jp = it["jp"]
    if w["word"] not in jp and w["reading"] not in jp:
        errs.append(f"{hid} 头词原形不在句子里")
    for m in ms:
        mw = BY_ID.get(m)
        if not mw: errs.append(f"{hid} 成员 {m} 不在 wordBank"); continue
        if mw["word"] not in jp and mw["reading"] not in jp:
            errs.append(f"{hid} 句子里找不到成员 {mw['word']}（{m}）")
    if not re.fullmatch(r"[\x20-\x7e]+", it["roma"]): errs.append(f"{hid} roma 不是纯 ASCII")
    if not it["zh"] or not it["label"]: errs.append(f"{hid} 缺 zh/label")

if errs:
    print("断言失败，未写文件：")
    for e in errs: print("  -", e)
    sys.exit(1)

out = {
    "batch": "wordfield-batch-5",
    "date": "2026-08-13",
    "source": "staging/wordfield-candidates-v2.json 的 kousai(人・交際) 一组，25 条待写候选",
    "standard": "docs/content-standard-wordfield.md",
    "status": "draft",
    "note": "草稿。未写入内容包，未提交。合并由人决定。`wordField` 是可直接并入 wordBank 对应词条的负载；`review` 是本轮自查记录，合并时不要带进去。",
    "items": [],
}
for it in ITEMS:
    c = CAND[it["id"]]
    w = BY_ID[it["id"]]
    wf = {
        "label": it["label"],
        "sentence": {"jp": it["jp"], "zh": it["zh"], "roma": it["roma"]},
        "members": [{"id": m} for m in it["members"]],
    }
    if it.get("image"): wf["coreImage"] = it["image"]
    out["items"].append({
        "id": it["id"], "word": w["word"], "reading": w["reading"], "level": w["level"],
        "tier": c.get("tier"), "scene": c.get("scene"), "kanjiTrap": bool(c.get("kanjiTrap")),
        "wordField": wf,
        "review": {
            "relation": it["relation"],
            "dropped": it["dropped"],
            "memberWords": [BY_ID[m]["word"] for m in it["members"]],
        },
    })

path = os.environ.get("WORDFIELD_OUT") or f"{ROOT}/YanApp/staging/wordfield-batch-5.json"
with open(path, "w") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
    f.write("\n")
print(f"OK {len(out['items'])} 条 → {path}")
print("成员总数", sum(len(i["wordField"]["members"]) for i in out["items"]))
print("无意象的", [i["word"] for i in out["items"] if "coreImage" not in i["wordField"]])
