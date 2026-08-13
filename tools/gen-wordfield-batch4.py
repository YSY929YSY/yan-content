#!/usr/bin/env python3
"""生成 staging/wordfield-batch-4.json（衣食住，14 条）。断言不过就不写文件。

做法同 batch3，另外会读 batch-1/2/3 的产物做去重（同一个词不写两个批次）。
所以**跑之前 batch-1~3 必须已经在 `YanApp/staging/` 里**。

只读 `content.fallback.json`，不改它。

    python3 tools/gen-wordfield-batch4.py

想先看结果不覆盖现有 staging：`WORDFIELD_OUT=/tmp/b4.json python3 tools/...`
零第三方依赖，标准库即可。
"""
import json, os, sys, re

# 从脚本位置推 ROOT，别写死
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANK = json.load(open(f"{ROOT}/YanApp/assets/content.fallback.json"))["wordBank"]
BY_ID = {w["id"]: w for w in BANK}
CAND = {c["id"]: c for c in json.load(open(f"{ROOT}/YanApp/staging/wordfield-candidates-v2.json"))}
DONE = set()
for n in (1, 2, 3):
    b = json.load(open(f"{ROOT}/YanApp/staging/wordfield-batch-{n}.json"))
    for it in (b["items"] if isinstance(b, dict) else b):
        DONE.add(it["id"])

ITEMS = [
    dict(
        id="n3_chuumon", label="在餐厅还会遇到",
        jp="席に着いたらメニューを見て、定食を注文し、食べ終わってから会計をする。",
        zh="落座之后看菜单，点一份套餐，吃完再去结账。",
        roma="Seki ni tsuitara menyuu o mite, teishoku o chuumon shi, tabeowatte kara kaikei o suru.",
        members=["n4_seki", "n2_menyu", "n1_teishoku", "n3_kaikei"],
        image="中文的「注文」是订货单据，日语第一现场是餐厅——服务员开口就是「ご注文は？」。另一头离得更远：「注文が多い」不是点得多，是要求多、挑剔。",
        relation="坐下 → 先看什么 → 点什么 → 最后一步付钱，一条餐厅动线",
        dropped=["n4_okaikei お会計 —— 和 n3_kaikei 会計 是同一个词的两条词条，只挂一个（见报告问题 2）"],
    ),
    dict(
        id="n1_pekopeko", label="饭点之前",
        jp="朝から何も食べずに歩いたので、お腹がぺこぺこで、昼食は食堂で早めに済ませた。",
        zh="从早上开始什么都没吃地走了一路，肚子饿瘪了，午饭早早在食堂解决了。",
        roma="Asa kara nani mo tabezu ni aruita node, onaka ga pekopeko de, chuushoku wa shokudou de hayame ni sumaseta.",
        members=["n5_onaka", "n3_chuushoku", "n5_shokudou"],
        image="ぺこぺこ 是「瘪下去」的声音，肚子空了往里陷。同一个词换个身体部位就换意思——人对着上司ぺこぺこ，是腰一次次弯下去。",
        relation="身体部位 → 状态 → 因此提前做的事",
        dropped=["n1_kuufuku 空腹 —— 书面语的近义词，标准第三节明说不列近义词"],
    ),
    dict(
        id="n2_kondate", label="一周的饭怎么安排",
        jp="一週間の献立を先に決めておくと、買い物が一回で済み、野菜も味噌も余らない。",
        zh="先把一周的菜谱定下来，买菜一趟就够，蔬菜和味噌都不会剩。",
        roma="Isshuukan no kondate o saki ni kimete oku to, kaimono ga ikkai de sumi, yasai mo miso mo amaranai.",
        members=["n5_kaimono", "n5_yasai", "n4_miso"],
        image="献立 不是菜单那张纸（那是メニュー），是「这几天吃什么」的安排。所以它连着的是买菜、冰箱和剩菜，跟餐厅没关系。",
        relation="安排 → 因此省下的一趟 → 安排到的具体东西",
        dropped=["n5_ryouri 料理 —— 和 献立 的落点重合，塞进来只是把同一件事说两遍"],
    ),
    dict(
        id="n2_ajiwau", label="不只是舌头",
        jp="母の料理をしみじみ味わうと、忘れていた味が戻ってくる。",
        zh="静静品着母亲做的菜，忘掉的那个味道就回来了。",
        roma="Haha no ryouri o shimijimi ajiwau to, wasurete ita aji ga modotte kuru.",
        members=["n5_ryouri", "n2_shimijimi", "n4_aji"],
        image="味わう 的宾语可以不是食物：苦労を味わう、自由を味わう。它说的是让一个东西在自己身上停留够久，吃只是最常见的那一种。",
        relation="对象 → 怎么个吃法 → 吃出来的东西",
        dropped=["n5_shokudou 食堂 —— 这句是家里的饭，食堂进不来"],
    ),
    dict(
        id="n2_kogeru", label="厨房里走神的那一下",
        jp="電話に出ている間にぼんやりして、台所から焦げる匂いがしてきた。",
        zh="接电话的工夫走了神，厨房那边飘来一股糊味。",
        roma="Denwa ni dete iru aida ni bonyari shite, daidokoro kara kogeru nioi ga shite kita.",
        members=["n3_bonyari", "n5_daidokoro", "n3_nioi"],
        image="焦げる 是自动词——东西自己糊的，不是你糊了它。你只是没在那儿。要说「我把它烤糊了」得换他动词 焦がす。",
        relation="走神 → 走神的时候人不在的地方 → 最先通知你的感官",
        dropped=[
            "n4_yaku 焼く —— 这句里只能是「焼き」，活用形过不了子串匹配",
            "n3_nabe 鍋 —— 本批 沸く/炒める 已经占了锅，第三次就是填充物",
        ],
    ),
    dict(
        id="n4_waku", label="开了的不止是水",
        jp="鍋の湯が沸くまで火を弱くして、その間にお風呂も沸かしておく。",
        zh="等锅里的水开之前先把火关小，趁这工夫把洗澡水也烧上。",
        roma="Nabe no yu ga waku made hi o yowaku shite, sono aida ni ofuro mo wakashite oku.",
        members=["n3_nabe", "n4_yu", "n4_hi_2", "n5_ofuro"],
        image="一个 沸く 管三样：锅里的水开了、浴缸的洗澡水好了、球场上「会場が沸く」观众炸开。共同点是从底下往上翻涌，所以主语永远是那个自己翻起来的东西。",
        relation="容器 → 里面的东西 → 控制它的东西 → 同一个词管的第二个场",
        dropped=[
            "n5_chawan 茶碗 —— 词库释义是「饭碗」，拿它配茶是错的",
            "n2_onsen 温泉 —— 温泉不是烧开的，硬配会教错",
        ],
    ),
    dict(
        id="n1_itameru_2", label="锅里的那几分钟",
        jp="フライパンに油をひいて野菜を炒めると、焼くより早く火が通る。",
        zh="平底锅里倒上油炒蔬菜，比烤熟得快。",
        roma="Furaipan ni abura o hiite yasai o itameru to, yaku yori hayaku hi ga tooru.",
        members=["n2_furaipan", "n3_abura", "n5_yasai", "n4_yaku"],
        image="炒める 和「痛める」同音，但一个在锅里、一个在身上。听到 いためる，先看句子里有没有油和锅。",
        relation="工具 → 必须先有的东西 → 材料 → 拿来比的另一种做法",
        dropped=["n3_nabe 鍋 —— 这句用的是フライパン；鍋 已在 沸く 卡"],
    ),
    dict(
        id="n2_kuriningu", label="换季的那一趟",
        jp="冬の服とスーツをクリーニングに出し、家で洗濯できないものは来週受け取る。",
        zh="把冬天的衣服和西装送去干洗，家里洗不了的下周去取。",
        roma="Fuyu no fuku to suutsu o kuriiningu ni dashi, ie de sentaku dekinai mono wa raishuu uketoru.",
        members=["n5_fuku_2", "n4_su_tsu", "n5_sentaku", "n3_uketoru"],
        image="英语的 cleaning 是打扫，日语的 クリーニング 只干一件事：把衣服送到店里去洗。家里洗衣机洗的那种叫 洗濯，两个词不互换。",
        relation="送去的东西 → 送去的理由 → 一周之后的那个动作",
        dropped=[],
    ),
    dict(
        id="n2_manshon", label="找房子时会撞上",
        jp="駅に近いマンションは家賃が高いので、少し歩くアパートの部屋を大家さんに見せてもらった。",
        zh="靠近车站的公寓楼房租贵，就让房东带看了要走一段路的那栋公寓的房间。",
        roma="Eki ni chikai manshon wa yachin ga takai node, sukoshi aruku apaato no heya o ooya-san ni misete moratta.",
        members=["n3_yachin", "n5_apaato", "n5_heya", "n3_ooya"],
        image="英语 mansion 是豪宅，日语 マンション 只是钢筋水泥的公寓楼。它和木造两三层的 アパート 分的是结构，不是档次——租房广告上这是硬分类，不是形容词。",
        relation="位置 → 代价 → 退一步的选项 → 带你看房的人",
        dropped=[],
    ),
    dict(
        id="n4_futon", label="每天要收起来一次",
        jp="朝は布団をたたんでしまい、夜になるとまた畳の部屋に敷く。",
        zh="早上把被褥叠起来收好，到了晚上再铺回榻榻米的房间。",
        roma="Asa wa futon o tatande shimai, yoru ni naru to mata tatami no heya ni shiku.",
        members=["n5_asa", "n5_yoru", "n4_tatami", "n5_heya"],
        image="布団 不是「被子」，是铺在地板上的一整套：底下的褥子（敷布団）加上盖的（掛布団）。它默认早上要收进柜子，所以配的动词是 敷く 和 たたむ，不是「铺床」。",
        relation="早上做的事 → 晚上做的相反的事 → 铺在什么上面 → 铺在哪儿。一天一个来回就是这个词的全部",
        dropped=[],
    ),
    dict(
        id="n4_katazukeru", label="收拾这件事",
        jp="ごみを捨てに行くついでに机を片付けるつもりが、掃除だけで終わり、だらしない自分に呆れた。",
        zh="本想趁扔垃圾顺手收拾一下桌子，结果只扫了地，对自己的邋遢感到无语。",
        roma="Gomi o sute ni iku tsuide ni tsukue o katazukeru tsumori ga, souji dake de owari, darashinai jibun ni akireta.",
        members=["n5_gomi", "n5_souji", "n2_darashinai"],
        image="片付ける 不是打扫（那是 掃除），是把散着的东西各归各位。所以饭后收桌子、搬家前清空房间都用它，连「仕事を片付ける」也是——把堆着的活儿一件件放回该在的地方。",
        relation="打算做的事 → 实际做成的事 → 对自己的评价",
        dropped=[
            "n4_suteru 捨てる —— 这句里只能写「捨てに」，活用形过不了；而且它和 batch-1 的 もったいない 卡正面重合",
            "n5_heya 部屋 —— 本批 マンション/布団 已经用过两次，第三次就是凑数",
        ],
    ),
    dict(
        id="n2_kanpai", label="开场那一声",
        jp="部長の挨拶が終わってから、ビールを注ぐ人が回ってきて、全員で乾杯した。",
        zh="部长致辞结束之后，有人挨个来倒啤酒，然后全体干杯。",
        roma="Buchou no aisatsu ga owatte kara, biiru o tsugu hito ga mawatte kite, zen'in de kanpai shita.",
        members=["n3_aisatsu", "n3_biru", "n3_tsugu"],
        image="汉语的「干杯」要求喝干，日语的 乾杯 只是全体举杯的那一声，喝多少随意。它是开场信号——没喊之前谁都不动杯子。",
        relation="先于它发生的事 → 杯子里的东西 → 谁倒的 → 这一声本身",
        dropped=["n2_meue 目上 —— 「给长辈倒酒」的礼仪是 注ぐ 那一头的内容，塞进这句会让落点变成两个"],
    ),
    dict(
        id="n3_you_2", label="不只是喝多了",
        jp="お酒に弱い人はビール一杯でも酔うし、帰りの電車では気持ちが悪くなる。",
        zh="酒量差的人一杯啤酒就醉，回去的电车上还会晕得难受。",
        roma="Osake ni yowai hito wa biiru ippai demo you shi, kaeri no densha de wa kimochi ga waruku naru.",
        members=["n3_sake", "n3_biru", "n5_densha", "n4_kimochi"],
        image="酔う 管的不是酒，是身体被晃到失去平衡。所以晕车（車に酔う）、晕船、看画面头晕都是它，连「雰囲気に酔う」也算。喝酒只是最常见的那个来源。",
        relation="来源一（酒）→ 具体多少 → 来源二（车）→ 两边共用的那个身体感觉",
        dropped=[],
    ),
    dict(
        id="n3_nioi", label="和「香り」分工",
        jp="お茶の香りは好きだが、料理の匂いが服にまで残るのは困る。",
        zh="茶的香气我喜欢，可做饭的气味留到衣服上就麻烦了。",
        roma="Ocha no kaori wa suki da ga, ryouri no nioi ga fuku ni made nokoru no wa komaru.",
        members=["n3_kaori", "n5_ocha", "n5_ryouri", "n5_fuku_2"],
        image="「匂」这个字中文里没有。匂い 本身中立，好闻难闻都能说；香り 只说好闻的。所以「いい匂い」成立，「悪い香り」不成立——想抱怨，只能用 匂い。",
        relation="褒义的那半 → 它配的东西 → 中立的那半 → 它留下的地方",
        dropped=[
            "n2_kogeru 焦げる —— 本批已单独成卡，厨房那个场归它",
            "n4_aji 味 —— 这句塞不下，且会把落点从「气味」拉到「味觉」",
        ],
    ),
]

errs = []
seen = set()
for it in ITEMS:
    hid = it["id"]
    c = CAND.get(hid)
    w = BY_ID.get(hid)
    if hid in seen: errs.append(f"{hid} 重复")
    seen.add(hid)
    if not w: errs.append(f"{hid} 不在 wordBank"); continue
    if not c: errs.append(f"{hid} 不在候选表"); continue
    if c.get("scene") != "ishokujuu": errs.append(f"{hid} scene 不是 ishokujuu")
    if hid in DONE: errs.append(f"{hid} 前三批已写过")
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
    "batch": "wordfield-batch-4",
    "date": "2026-08-12",
    "source": "staging/wordfield-candidates-v2.json 的 ishokujuu(衣食住) 一组，31 条候选",
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

path = os.environ.get("WORDFIELD_OUT") or f"{ROOT}/YanApp/staging/wordfield-batch-4.json"
with open(path, "w") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
    f.write("\n")
print(f"OK {len(out['items'])} 条 → {path}")
print("成员总数", sum(len(i['wordField']['members']) for i in out['items']))
print("无意象的", [i['word'] for i in out['items'] if 'coreImage' not in i['wordField']])
