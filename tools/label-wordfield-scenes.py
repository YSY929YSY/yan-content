#!/usr/bin/env python3
"""给词场候选补 scene 字段。

用法:
    python3 tools/label-wordfield-scenes.py YanApp/staging/wordfield-candidates-v2.json

为什么要有这个字段(候选名单从建立起就缺它):
上一轮是按场景捞的词,但场景归属只写在报告的散文里,没落进 JSON。
结果是每写一批都要从 memberIds 交集反推一次聚类 —— 同一件事做 N 遍,而且每次结果还不一样。

分类体系不是自己发明的,借用『初級から学ぶ日本語コロケーション』的场面分类
(衣食住/交通/学校/仕事/お金・買い物/情報・通信/スケジュール/人・交際/
興味・スポーツ/天気/自然・災害/体・病気・健康)—— 日语教学界用了很多年,
比自己拍脑袋分得准。

**加了三个它没有的**,每一个都是这批数据逼出来的,不是为了好看:
  ryoko    旅行・宿泊  —— 旅館/浴衣/畳/土産/免税/フロント 是一整簇,而且是言的主场
  kimochi  感情・心情  —— 拟态语和性格形容词占了 40 多条,塞进「人・交際」会把
                          「どきどき」和「名刺」放进同一个筐
  shakai   社会・手続き —— 印鑑/窓口/契約/選挙 在原分类里无处安放

⚠️ 归属是**判断**,不是计算。下面每条都是人分的,可以推翻 —— 有异议改这个文件重跑,
不要在生成物上手改(那样下次重跑又没了)。
"""
import json
import sys

SCENES = {
    'ishokujuu': '衣食住',
    'ryoko': '旅行・宿泊',
    'kotsu': '交通',
    'gakkou': '学校',
    'shigoto': '仕事',
    'okane': 'お金・買い物',
    'joho': '情報・通信',
    'schedule': 'スケジュール',
    'kousai': '人・交際',
    'kimochi': '感情・心情',
    'shumi': '興味・スポーツ',
    'tenki': '天気',
    'saigai': '自然・災害',
    'karada': '体・病気・健康',
    'shakai': '社会・手続き',
}

ASSIGN = {
    'ishokujuu': [
        'n3_chuumon', 'n4_yu', 'n1_teishoku', 'n2_menyu', 'n2_kogeru', 'n4_waku',
        'n2_musu', 'n1_itameru_2', 'n2_kizamu', 'n4_miso', 'n5_shouyu', 'n2_kondate',
        'n2_ajiwau', 'n4_katazukeru', 'n5_sentaku', 'n4_suteru', 'n3_nioi', 'n3_kaori',
        'n2_manshon', 'n3_yachin', 'n2_kuriningu', 'n2_senpuuki', 'n2_ka', 'n4_tatami',
        'n4_futon', 'n1_pekopeko', 'n2_mottainai', 'n2_kanpai', 'n3_tsugu', 'n3_you_2',
        'n3_kanjou',
    ],
    'ryoko': [
        'n4_ryokan', 'n2_yukata', 'n3_yado', 'n3_miyage', 'n2_menzei', 'n1_furonto',
        'n4_annai', 'n3_doraibu', 'n2_reja',
    ],
    'kotsu': [
        'n4_kisha', 'n2_rasshuawa', 'n2_kaisatsu', 'n2_manin', 'n3_teiki', 'n3_juutai',
        'n3_maigo', 'n2_hyoushiki', 'n2_tsuukin', 'n2_urouro', 'n2_noronoro', 'n3_konzatsu',
    ],
    'gakkou': [
        'n5_benkyou', 'n2_juken', 'n3_goukaku', 'n1_juku', 'n3_tetsuya', 'n4_sotsugyou',
        'n4_okujou', 'n4_senpai', 'n2_kouhai',
    ],
    'shigoto': [
        'n2_mensetsu', 'n2_shutchou', 'n2_shimekiri', 'n1_joushi', 'n1_buka', 'n3_douryou',
        'n3_houkoku', 'n2_shiryou', 'n2_shikai', 'n3_shuushoku', 'n4_yameru', 'n2_sarariman',
        'n1_sutoresu', 'n2_keigo', 'n2_meishi', 'n2_kyoushuku', 'n4_arubaito', 'n1_toraburu',
        'n3_genba', 'n2_hitomazu', 'n1_yayakoshii', 'n2_miokuru',
    ],
    'okane': [
        'n3_kyuuryou', 'n2_bonasu', 'n2_waribiki', 'n1_seru', 'n2_gyouretsu', 'n5_yaoya',
        'n4_reji', 'n2_chippu', 'n3_bukka', 'n3_keiki', 'n2_zurari', 'n3_sabisu',
    ],
    # 手紙 归通信而不是文具:它的场是邮筒、邮票、寄出去,不是「一张纸」
    'joho': ['n1_anketo', 'n3_hyouban', 'n1_nyuansu', 'n3_uwasa', 'n5_tegami'],
    'schedule': [
        'n4_tsugou', 'n3_enki', 'n3_chuushi', 'n2_gisshiri', 'n1_renkyuu', 'n3_chikoku',
        'n4_nebou', 'n4_shitaku', 'n2_tokkuni', 'n1_chokuchoku', 'n1_shotchuu', 'n2_ukkari',
        'n4_youji',
    ],
    'kousai': [
        'n5_daijoubu', 'n3_meiwaku', 'n3_jama', 'n4_enryo', 'n5_kekkou', 'n4_shinpai',
        'n4_soudan', 'n3_aisatsu', 'n5_taihen', 'n3_on_2', 'n1_giri', 'n3_seken',
        'n3_kinodoku', 'n2_tasukaru', 'n3_battari', 'n2_nikoniko', 'n3_deto',
        'n1_amaeru', 'n1_iiwake', 'n3_gokai', 'n2_nagusameru', 'n1_kokuhaku',
        'n2_mittomonai', 'n2_shitsukoi', 'n1_kippari', 'n1_taimingu', 'n4_musume',
    ],
    'kimochi': [
        'n3_tokui', 'n3_nigate', 'n2_sunao', 'n4_hazukashii', 'n1_awateru', 'n1_aseru',
        'n1_kataomoi', 'n5_komaru', 'n3_akirameru', 'n2_dokidoki', 'n1_hotto', 'n1_unzari',
        'n1_gakkuri', 'n2_shimijimi', 'n2_nantonaku', 'n3_bonyari', 'n2_sukkiri',
        'n1_tekkiri', 'n2_ikinari', 'n2_sosokkashii', 'n2_darashinai', 'n1_suteki',
    ],
    'shumi': [
        'n3_tozan', 'n3_choujou', 'n1_hiyake', 'n3_nagameru', 'n2_hanabi', 'n3_esa',
        'n1_burabura', 'n3_nonbiri', 'n1_jikkuri', 'n1_chiratto', 'n2_kossori',
        'n3_chansu', 'n1_zuruzuru',
    ],
    'tenki': [
        'n3_tsuyu', 'n2_mushiatsui', 'n2_shikke', 'n4_hieru', 'n3_tsumoru', 'n2_mekkiri',
        'n1_bisshori', 'n2_kouyou', 'n1_ochiba',
    ],
    'saigai': [
        'n4_taifuu', 'n2_teiden', 'n1_hinan_2', 'n4_jishin', 'n4_yureru', 'n1_tsunami',
        'n2_yudan',
    ],
    'karada': [
        'n5_kaze_2', 'n3_seki', 'n4_chuusha', 'n3_shinsatsu', 'n2_machiaishitsu', 'n4_kega',
        'n4_naoru_2', 'n4_nyuuin', 'n3_taion', 'n3_korobu', 'n4_suberu', 'n3_gussuri',
        'n2_masuku', 'n1_kafun', 'n4_muri', 'n3_gaman',
    ],
    'shakai': [
        'n1_inkan', 'n2_madoguchi', 'n3_keiyaku', 'n1_senkyo', 'n3_touhyou', 'n3_enzetsu',
        'n4_keisatsu',
    ],
}

# 汉字陷阱词是**跨场景的属性**,不是一个场景。
# 汉字看起来像中文但义偏离 —— 这是言的 moat,单独一个标记,和 scene 并存。
KANJI_TRAP = {
    'n5_daijoubu', 'n3_chuumon', 'n5_benkyou', 'n3_meiwaku', 'n3_gaman', 'n3_jama',
    'n3_tokui', 'n4_tsugou', 'n4_enryo', 'n2_sunao', 'n4_kisha', 'n4_musume', 'n5_tegami',
    'n4_yu', 'n1_giri', 'n2_yudan', 'n3_kinodoku', 'n5_kekkou', 'n4_annai', 'n4_muri',
    'n5_taihen', 'n3_hyouban', 'n1_suteki', 'n1_kokuhaku', 'n2_manshon', 'n3_sabisu',
    'n4_kega', 'n5_yaoya', 'n2_madoguchi', 'n3_genba',
}


def main(path: str) -> int:
    items = json.load(open(path, encoding='utf-8'))
    scene_of = {}
    for scene, ids in ASSIGN.items():
        for i in ids:
            if i in scene_of:
                print(f'⚠️ {i} 被分到两个场景:{scene_of[i]} 和 {scene}', file=sys.stderr)
            scene_of[i] = scene

    known = {it['id'] for it in items}
    ghost = sorted(set(scene_of) - known)
    missing = sorted(known - set(scene_of))

    for it in items:
        it['scene'] = scene_of.get(it['id'])
        if it['id'] in KANJI_TRAP:
            it['kanjiTrap'] = True

    json.dump(items, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    from collections import Counter
    c = Counter(it.get('scene') for it in items)
    print(f'{len(items)} 条,分了 {len(items) - c.get(None, 0)} 条\n')
    for k, label in SCENES.items():
        print(f'  {label:<12} {c.get(k, 0):>3}')
    if missing:
        print(f'\n⚠️ 没分到场景({len(missing)} 条),必须补:')
        for i in missing:
            w = next(x for x in items if x['id'] == i)
            print(f'   {i}  {w["word"]}')
    if ghost:
        print(f'\n⚠️ 分类表里有不存在的 id(多半是合并时删掉的):{", ".join(ghost)}')
    return 1 if (missing or ghost) else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1
                  else 'YanApp/staging/wordfield-candidates-v2.json'))
