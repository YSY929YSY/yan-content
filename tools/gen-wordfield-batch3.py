# -*- coding: utf-8 -*-
"""生成 staging/wordfield-batch-3.json（旅行・宿泊 7 + 天気 5）。

所有校验在写文件之前断言，失败就不写 —— 这是 HANDOFF-2026-08-12 第三节定的做法：
不要先写完再查。第二批开始这么做，一次通过。

只读 `content.fallback.json` 取词库，不改它。产物落在 `YanApp/staging/`，
未并入内容包（合并由人决定，见产物里的 note 字段）。

    python3 tools/gen-wordfield-batch3.py

想先看结果不覆盖现有 staging：`WORDFIELD_OUT=/tmp/b3.json python3 tools/...`
零第三方依赖，标准库即可。
"""
import json, sys, os

# 从脚本位置推 ROOT，别写死 —— 写死的话换台机器 / 换个 checkout 就跑不了
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANK = json.load(open(os.path.join(ROOT, "YanApp/assets/content.fallback.json")))["wordBank"]
BY_ID = {w["id"]: w for w in BANK if w.get("id")}
CAND = {c["id"]: c for c in json.load(open(os.path.join(ROOT, "YanApp/staging/wordfield-candidates-v2.json")))}

def card(hid, label, jp, zh, roma, members, image=None, review=None):
    return dict(id=hid, label=label, jp=jp, zh=zh, roma=roma, members=members,
                image=image, review=review or {})

CARDS = [
    # ---------- 旅行・宿泊 ----------
    card("n1_furonto", "进旅馆的头五分钟",
         "ホテルに着いたら、まずフロントでチェックインして、鍵をもらい、荷物を部屋に置く。",
         "到了酒店，先在前台办入住，拿钥匙，把行李放进房间。",
         "Hoteru ni tsuitara, mazu furonto de chekkuin shite, kagi o morai, nimotsu o heya ni oku.",
         ["n5_hoteru", "n4_chikuin", "n5_kagi", "n5_nimotsu"],
         "英语的 front 是「前面」，日语把它钉死在旅馆那一格柜台上。要钥匙、寄存行李、问路，都是走向这一格——它不是方位，是一个具体的地点。",
         {"relation": "地点 → 到那儿做的第一件事 → 拿到手的东西 → 放下的东西",
          "dropped": ["n3_shukuhaku 宿泊 —— 候选给的成员，但它是书面登记用语，放进这句口语动线里是硬塞"]}),

    card("n3_yado", "天黑前要落实的一件事",
         "今夜の宿が決まらないまま、駅前の旅館に電話して予約を取り、やっと荷物を下ろす。",
         "今晚住哪儿还没着落，给站前的旅馆打了电话订上，才终于放下行李。",
         "Kon'ya no yado ga kimaranai mama, ekimae no ryokan ni denwa shite yoyaku o tori, yatto nimotsu o orosu.",
         ["n5_eki", "n4_ryokan", "n4_yoyaku", "n5_nimotsu"],
         "宿 不是某一类建筑，是「今晚睡在哪儿」这件事本身。旅館、民宿、朋友家，只要今晚在那儿落脚，都能叫宿——所以它常和「探す・決まる・取る」搭。",
         {"relation": "悬着的问题 → 打电话的地方 → 解决的动作 → 解决之后身体的反应",
          "dropped": ["n3_shukuhaku 宿泊 —— 「宿泊」里含「宿」，写进句子等于让头词自己给自己作证，是假的同框"]}),

    card("n4_ryokan", "和酒店不一样的地方",
         "旅館に泊まると、夕方に温泉に入り、畳の部屋で食事をして、布団で寝る。",
         "住日式旅馆的话，傍晚先泡温泉，在铺榻榻米的房间吃饭，睡在被褥上。",
         "Ryokan ni tomaru to, yuugata ni onsen ni hairi, tatami no heya de shokuji o shite, futon de neru.",
         ["n2_onsen", "n4_tatami", "n4_shokuji", "n4_futon"],
         None,
         {"relation": "一晚上的顺序：泡澡 → 地面 → 饭 → 床。四个成员合起来就是「旅館 ≠ ホテル」的全部内容",
          "dropped": []}),

    card("n3_miyage", "出差回来的第一件事",
         "出張から戻る日、空港でお土産を買って、会社で同僚に配る。",
         "出差回来那天，在机场买了伴手礼，到公司分给同事。",
         "Shutchou kara modoru hi, kuukou de omiyage o katte, kaisha de douryou ni kubaru.",
         ["n2_shutchou", "n4_kuukou", "n3_douryou", "n2_kubaru"],
         "重点不在东西，在「我出门了、你没去」这层交代。所以关键是数量够分——配る 才是这个词真正的搭档，好不好吃是其次。",
         {"relation": "事由 → 买的地方（临上飞机才想起来） → 分给谁 → 那个动作",
          "dropped": ["n3_kankou 観光 —— 出差和观光是两个场，塞在一句里会互相打架",
                      "n3_okuru 贈る —— 贈る 太郑重，土産 走的是 配る 那一路"]}),

    card("n2_menzei", "机场那一段流程",
         "空港の免税店で買い物をするときはパスポートを見せ、帰りは税関を通る。",
         "在机场免税店买东西要出示护照，回来时要过海关。",
         "Kuukou no menzeiten de kaimono o suru toki wa pasupooto o mise, kaeri wa zeikan o tooru.",
         ["n4_kuukou", "n5_kaimono", "n3_pasupoto", "n2_zeikan"],
         None,
         {"relation": "地点 → 做的事 → 要掏的证件 → 回程绕不开的一关",
          "dropped": []}),

    card("n4_annai", "不知道路的时候",
         "道が分からないと言うと、駅の人が地図を出して、観光案内所まで案内してくれた。",
         "说了句不认识路，车站的人就拿出地图，把我领到了旅游咨询处。",
         "Michi ga wakaranai to iu to, eki no hito ga chizu o dashite, kankou annaijo made annai shite kureta.",
         ["n5_michi", "n5_eki", "n5_chizu", "n3_kankou"],
         "案内 是「把你带到那儿」，不是中文的案卷。带的可以是人，也可以是一张纸——所以「ご案内します」从店员嘴里说出来，「案内所」印在牌子上，是同一件事。",
         {"relation": "困境 → 帮忙的人 → 用的工具 → 终点；「案内所」这个复合词顺带出现了",
          "dropped": []}),

    card("n3_doraibu", "周末出门这件事",
         "免許を取ったばかりの弟の運転で、海まで景色のいい道をドライブした。",
         "坐着刚拿到驾照的弟弟开的车，沿着风景好的路一路开到海边。",
         "Menkyo o totta bakari no otouto no unten de, umi made keshiki no ii michi o doraibu shita.",
         ["n3_menkyo", "n4_unten", "n5_umi", "n4_keshiki"],
         "英语的 drive 是「开车」这个动作，日语的ドライブ是「开车出去玩」这件事。所以坐副驾也算ドライブ，而每天开一小时通勤不算。",
         {"relation": "资格 → 谁在开 → 去哪儿 → 路上看什么；ドライブ 是这四样加起来的那个名字",
          "dropped": []}),

    # ---------- 天気 ----------
    card("n3_tsumoru", "雪停之后的早上",
         "夜のうちに雪が積もる朝は、寒いので手袋をして駅まで歩く。",
         "夜里积起雪的早晨，因为冷，戴上手套走去车站。",
         "Yoru no uchi ni yuki ga tsumoru asa wa, samui node tebukuro o shite eki made aruku.",
         ["n5_yuki", "n5_asa", "n5_samui", "n4_tebukuro"],
         "積もる 是「一层层落下来、不走」。所以除了雪，日语也说「疲れが積もる」「積もる話」——攒着没散掉的东西，用的是同一个词。",
         {"relation": "夜里发生的事 → 你面对它的时刻 → 体感 → 因此加的一件装备",
          "dropped": []}),

    card("n4_hieru", "关掉暖气之后",
         "寒い夜、暖房を消すと足元から冷えるので、布団をもう一枚かけて風邪を防ぐ。",
         "冷的夜里一关暖气，凉意就从脚下上来，于是多盖一床被子防感冒。",
         "Samui yoru, danbou o kesu to ashimoto kara hieru node, futon o mou ichimai kakete kaze o fusegu.",
         ["n5_samui", "n4_danbou", "n4_futon", "n5_kaze_2"],
         "冷える 说的不是气温低，是「凉下来」这件事落到了身上：脚、肚子、手指。日本人说「体が冷える」时是在谈健康，不是在报天气——寒い 描述外面，冷える 描述里面。",
         {"relation": "外部条件 → 你做的动作 → 身体的反应 → 补救和后果",
          "dropped": []}),

    card("n1_bisshori", "没带伞的那天",
         "傘のない日に雨に降られると、服はびっしょり濡れる。",
         "偏偏没带伞那天挨了淋，衣服湿了个透。",
         "Kasa no nai hi ni ame ni furareru to, fuku wa bisshori nureru.",
         ["n5_kasa", "n5_ame", "n5_fuku_2", "n3_nureru"],
         "びっしょり 只说一件事：湿到不用再确认了。它不修饰程度轻的湿——「少しびっしょり」不成立。汗和雨都能用，共同点是一眼就看得出来。",
         {"relation": "缺的东西 → 遇上的事 → 遭殃的对象 → 结果；びっしょり 是「濡れる」的程度，不是它的替换词",
          "dropped": ["n3_ase 汗 / n5_atsui 暑い —— 出汗那一头是另一个场（夏天、运动），和淋雨挤在一句里就散了。见报告的问题 3"]}),

    card("n2_mekkiri", "季节换挡的那两周",
         "秋になると涼しい日がめっきり増え、朝は冷えるし夜も寒い。",
         "一入秋，凉快的日子明显多起来，早上发凉，晚上也冷。",
         "Aki ni naru to suzushii hi ga mekkiri fue, asa wa hieru shi yoru mo samui.",
         ["n5_aki", "n5_suzushii", "n4_hieru", "n5_samui"],
         "めっきり 不修饰状态，只修饰变化——所以它后面几乎永远跟着 増える・減る・なる。「めっきり寒い」不对，「めっきり寒くなった」才对。用得最多的两处：天气和上了年纪。",
         {"relation": "时间点 → 明显变化的东西 → 一天里的两个具体时刻",
          "dropped": []}),

    card("n2_mushiatsui", "夏天晚上睡不着的原因",
         "夏の夜は蒸し暑くて、風もなく、扇風機をつけても汗が引かない。",
         "夏天的夜里又闷又热，一丝风也没有，开着电扇汗还是下不去。",
         "Natsu no yoru wa mushiatsukute, kaze mo naku, senpuuki o tsukete mo ase ga hikanai.",
         ["n5_natsu", "n5_kaze", "n2_senpuuki", "n3_ase"],
         "「蒸」是关键：不是热，是水汽把热按在皮肤上不让它散。所以同样的温度，干燥地方的 暑い 和日本夏夜的 蒸し暑い 是两种难受。",
         {"relation": "时令 → 缺的东西 → 试过的办法 → 没解决的问题",
          "dropped": ["n3_tsuyu 梅雨 —— batch-1 的 梅雨 卡已经写过「湿気で蒸し暑い」。再写一遍等于给用户看两遍同一句。本卡刻意挪到盛夏的夜"]}),
]

# ---------------- 断言 ----------------
errs = []
seen = set()
for c in CARDS:
    hid = c["id"]
    if hid in seen: errs.append(f"{hid}: 重复")
    seen.add(hid)
    head = BY_ID.get(hid)
    if not head: errs.append(f"{hid}: 头词不在 wordBank"); continue
    cand = CAND.get(hid)
    if not cand: errs.append(f"{hid}: 不在候选表里"); continue
    if cand["scene"] not in ("ryoko", "tenki"):
        errs.append(f"{hid}: scene={cand['scene']} 不属于本批")
    for k in ("word", "reading", "level"):
        if head.get(k) != cand.get(k):
            errs.append(f"{hid}: 词库和候选表 {k} 不一致 {head.get(k)} / {cand.get(k)}")
    if head.get("wordField"):
        errs.append(f"{hid}: 词库里已经有 wordField，不要覆盖")
    ms = c["members"]
    if not (3 <= len(ms) <= 5): errs.append(f"{hid}: 成员数 {len(ms)} 不在 3~5")
    if len(set(ms)) != len(ms): errs.append(f"{hid}: 成员重复")
    if hid in ms: errs.append(f"{hid}: 头词把自己当成员了")
    for mid in ms:
        mw = BY_ID.get(mid)
        if not mw: errs.append(f"{hid}: 成员 {mid} 不在 wordBank"); continue
        # 复刻 auditWordFields 的判定：word 或 reading 之一必须是句子的子串
        if mw["word"] not in c["jp"] and mw["reading"] not in c["jp"]:
            errs.append(f"{hid}: 句子里找不到成员 {mw['word']}（{mid}）")
    for k in ("label", "jp", "zh", "roma"):
        if not c.get(k): errs.append(f"{hid}: {k} 空")
    if any(ord(ch) > 127 for ch in c["roma"]):
        errs.append(f"{hid}: roma 里有非 ASCII")

if errs:
    print("拒绝写文件：")
    for e in errs: print("  -", e)
    sys.exit(1)

items = []
for c in CARDS:
    cand = CAND[c["id"]]
    head = BY_ID[c["id"]]
    wf = {
        "label": c["label"],
        "sentence": {"jp": c["jp"], "zh": c["zh"], "roma": c["roma"]},
        "members": [{"id": m} for m in c["members"]],
    }
    if c["image"]: wf["coreImage"] = c["image"]
    review = dict(c["review"])
    review["memberWords"] = [BY_ID[m]["word"] for m in c["members"]]
    items.append({
        "id": c["id"], "word": head["word"], "reading": head["reading"], "level": head["level"],
        "tier": cand.get("tier"), "scene": cand.get("scene"), "kanjiTrap": bool(cand.get("kanjiTrap")),
        "wordField": wf, "review": review,
    })

out = {
    "batch": "wordfield-batch-3",
    "date": "2026-08-11",
    "source": "staging/wordfield-candidates-v2.json 的 ryoko(旅行・宿泊) 与 tenki(天気) 两组",
    "standard": "docs/content-standard-wordfield.md",
    "status": "draft",
    "note": "草稿。未写入内容包，未提交。合并由人决定。`wordField` 是可直接并入 wordBank 对应词条的负载；`review` 是本轮自查记录，合并时不要带进去。",
    "items": items,
}
p = os.environ.get("WORDFIELD_OUT") or os.path.join(ROOT, "YanApp/staging/wordfield-batch-3.json")
with open(p, "w") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
    f.write("\n")
print("OK", len(items), "条 ->", p)
print("ryoko:", sum(1 for i in items if i["scene"] == "ryoko"), " tenki:", sum(1 for i in items if i["scene"] == "tenki"))
