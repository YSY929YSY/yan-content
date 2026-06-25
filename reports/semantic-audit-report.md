# wordBank 语义存疑标记

- 审计词条: 1343
- 命中条目: 169
- 跨级重复词(P2_dedup): 2
- 模式: report-only,未修改 JSON

## 严重度汇总

- **P0 致命(必审)**: 0
- **P1 复核**: 61
- P2 加工信号(非错误): 113 + 跨级重复 2

  - P2_multisense: 113
  - P1_reading_ambiguous: 47
  - P1_chunk_missing_word: 8
  - P1_zh_association: 6

## P0 致命 · 必须人审（0）

- 无

## P1 · 值得复核（61）

| id | word | reading | level | flags | 详情 |
|---|---|---|---|---|---|
| n5_aku | 開く | あく | N5 | P1_reading_ambiguous | 存:あく / Sudachi 默认:ひらく(确认教的是哪个) |
| n5_asatte | 明後日 | あさって | N5 | P1_reading_ambiguous | 存:あさって / Sudachi 默认:みょうごにち(确认教的是哪个) |
| n5_ashita | 明日 | あした | N5 | P1_reading_ambiguous | 存:あした / Sudachi 默认:あす(确认教的是哪个) |
| n5_iu | 言う | いう | N5 | P1_reading_ambiguous | 存:いう / Sudachi 默认:ゆう(确认教的是哪个) |
| n5_ototoi | 一昨日 | おととい | N5 | P1_reading_ambiguous | 存:おととい / Sudachi 默认:いっさくにち(确认教的是哪个) |
| n5_owaru | 終る | おわる | N5 | P1_chunk_missing_word | 词块「授業が終わる」不含「終る」 |
| n5_kata | 方 | かた | N5 | P1_reading_ambiguous | 存:かた / Sudachi 默认:ほう(确认教的是哪个) |
| n5_gatsu | ～月 | ～がつ | N5 | P1_reading_ambiguous | 存:～がつ / Sudachi 默认:~つき(确认教的是哪个) |
| n5_kado | 角 | かど | N5 | P1_reading_ambiguous | 存:かど / Sudachi 默认:かく(确认教的是哪个) |
| n5_karai | 辛い | からい | N5 | P1_reading_ambiguous | 存:からい / Sudachi 默认:つらい(确认教的是哪个) |
| n5_ku | 九 | く | N5 | P1_reading_ambiguous | 存:く / Sudachi 默认:きゅう(确认教的是哪个) |
| n5_sai | ～歳 | ～さい | N5 | P1_reading_ambiguous | 存:～さい / Sudachi 默认:~とし(确认教的是哪个) |
| n5_shi | 四 | し | N5 | P1_reading_ambiguous | 存:し / Sudachi 默认:よん(确认教的是哪个) |
| n5_shichi | 七 | しち | N5 | P1_reading_ambiguous | 存:しち / Sudachi 默认:なな(确认教的是哪个) |
| n5_juu_2 | ～中 | ～じゅう | N5 | P1_reading_ambiguous | 存:～じゅう / Sudachi 默认:~ちゅう(确认教的是哪个) |
| n5_jin | ～人 | ～じん | N5 | P1_reading_ambiguous | 存:～じん / Sudachi 默认:~ひと(确认教的是哪个) |
| n5_chigau | 違う | ちがう | N5 | P1_chunk_missing_word | 词块「違います」不含「違う」 |
| n5_tsuitachi | 一日 | ついたち | N5 | P1_reading_ambiguous | 存:ついたち / Sudachi 默认:いちにち(确认教的是哪个) |
| n5_too | 十 | (〜を) とお | N5 | P1_reading_ambiguous | 存:(〜を) とお / Sudachi 默认:じゅう(确认教的是哪个) |
| n5_tooka | 十日 | とおか | N5 | P1_reading_ambiguous | 存:とおか / Sudachi 默认:とうか(确认教的是哪个) |
| n5_toki | ～時 | ～とき | N5 | P1_reading_ambiguous | 存:～とき / Sudachi 默认:~じ(确认教的是哪个) |
| n5_toshi | 年 | とし | N5 | P1_reading_ambiguous | 存:とし / Sudachi 默认:ねん(确认教的是哪个) |
| n5_toriniku | 鶏肉 | とりにく | N5 | P1_reading_ambiguous | 存:とりにく / Sudachi 默认:けいにく(确认教的是哪个) |
| n5_nakusu | 無くす | なくす | N5 | P1_zh_association | 弄→含混,优先具体动词 |
| n5_nanoka | 七日 | なのか | N5 | P1_reading_ambiguous | 存:なのか / Sudachi 默认:ななにち(确认教的是哪个) |
| n5_nin | ～人 | ～にん | N5 | P1_reading_ambiguous | 存:～にん / Sudachi 默认:~ひと(确认教的是哪个) |
| n5_nurui | 温い | ぬるい | N5 | P1_reading_ambiguous | 存:ぬるい / Sudachi 默认:ぬくい(确认教的是哪个) |
| n5_hai_2 | ～杯 | ～はい | N5 | P1_reading_ambiguous | 存:～はい / Sudachi 默认:~ばい(确认教的是哪个) |
| n5_hako | 箱 | はこ | N5 | P1_reading_ambiguous | 存:はこ / Sudachi 默认:ばこ(确认教的是哪个) |
| n5_hatsuka | 二十日 | はつか | N5 | P1_reading_ambiguous | 存:はつか / Sudachi 默认:にとうか(确认教的是哪个) |
| n5_hitotsuki | 一月 | ひとつき | N5 | P1_reading_ambiguous | 存:ひとつき / Sudachi 默认:いちがつ(确认教的是哪个) |
| n5_futsuka | 二日 | ふつか | N5 | P1_reading_ambiguous | 存:ふつか / Sudachi 默认:ふたか(确认教的是哪个) |
| n5_fun | ～分 | ～ふん | N5 | P1_reading_ambiguous | 存:～ふん / Sudachi 默认:~ぶん(确认教的是哪个) |
| n5_hoka | 外 | ほか | N5 | P1_reading_ambiguous | 存:ほか / Sudachi 默认:そと(确认教的是哪个) |
| n5_mai | ～枚 | ～まい | N5 | P1_reading_ambiguous | 存:～まい / Sudachi 默认:~ばい(确认教的是哪个) |
| n5_magaru | 曲る | まがる | N5 | P1_chunk_missing_word | 词块「角を曲がる」不含「曲る」 |
| n5_muttsu | 六つ | むっつ | N5 | P1_reading_ambiguous | 存:むっつ / Sudachi 默认:むいつ(确认教的是哪个) |
| n5_yattsu | 八つ | やっつ | N5 | P1_reading_ambiguous | 存:やっつ / Sudachi 默认:ようつ(确认教的是哪个) |
| n5_yuube | 昨夜 | ゆうべ | N5 | P1_reading_ambiguous | 存:ゆうべ / Sudachi 默认:さくや(确认教的是哪个) |
| n5_yukkurito | ゆっくりと | ゆっくりと | N5 | P1_chunk_missing_word | 词块「ゆっくり話す」不含「ゆっくりと」 |
| n5_yokka | 四日 | よっか | N5 | P1_reading_ambiguous | 存:よっか / Sudachi 默认:よんにち(确认教的是哪个) |
| n5_yottsu | 四つ | よっつ | N5 | P1_reading_ambiguous | 存:よっつ / Sudachi 默认:よんつ(确认教的是哪个) |
| n5_watashi | 私 | わたし | N5 | P1_reading_ambiguous | 存:わたし / Sudachi 默认:わたくし(确认教的是哪个) |
| n4_aida | 間 | あいだ | N4 | P1_reading_ambiguous | 存:あいだ / Sudachi 默认:ま(确认教的是哪个) ; 3 个义项,例句只演示其一?需义项地图 |
| n4_itasu | 致す | いたす | N4 | P1_chunk_missing_word | 词块「ご連絡いたします」不含「致す」 |
| n4_otosu | 落とす | おとす | N4 | P1_zh_association | 弄→含混,优先具体动词 ; 3 个义项,例句只演示其一?需义项地图 |
| n4_omote | 表 | おもて | N4 | P1_reading_ambiguous | 存:おもて / Sudachi 默认:ひょう(确认教的是哪个) |
| n4_kamau | かまう | かまう | N4 | P1_chunk_missing_word | 词块「かまわないで」不含「かまう」 |
| n4_guai | 具合い | ぐあい | N4 | P1_chunk_missing_word | 词块「具合が悪い」不含「具合い」 |
| n4_kun | 君 | くん | N4 | P1_reading_ambiguous | 存:くん / Sudachi 默认:きみ(确认教的是哪个) |
| n4_komu | 込む | こむ | N4 | P1_reading_ambiguous | 存:こむ / Sudachi 默认:ごむ(确认教的是哪个) |
| n4_kome | 米 | こめ | N4 | P1_reading_ambiguous | 存:こめ / Sudachi 默认:べい(确认教的是哪个) |
| n4_kowasu | 壊す | こわす | N4 | P1_zh_association | 弄→含混,优先具体动词 |
| n4_juubun | 十分 | じゅうぶん | N4 | P1_reading_ambiguous | 存:じゅうぶん / Sudachi 默认:じゅうふん(确认教的是哪个) |
| n4_suku | 空く | すく | N4 | P1_reading_ambiguous | 存:すく / Sudachi 默认:あく(确认教的是哪个) ; 3 个义项,例句只演示其一?需义项地图 |
| n4_daibu | 大分 | だいぶ | N4 | P1_reading_ambiguous | 存:だいぶ / Sudachi 默认:おおいた(确认教的是哪个) ; 3 个义项,例句只演示其一?需义项地图 |
| n4_tariru | 足りる | たりる | N4 | P1_chunk_missing_word | 词块「時間が足りない」不含「足りる」 |
| n4_nureru | ぬれる | ぬれる | N4 | P1_zh_association | 弄→含混,优先具体动词 |
| n4_fukai | 深い | ふかい | N4 | P1_reading_ambiguous | 存:ふかい / Sudachi 默认:ぶかい(确认教的是哪个) |
| n4_machigaeru | 間違える | まちがえる | N4 | P1_zh_association | 搞→口语过随便,正式释义慎用; 弄→含混,优先具体动词 ; 3 个义项,例句只演示其一?需义项地图 |
| n4_yogoreru | 汚れる | よごれる | N4 | P1_zh_association | 弄→含混,优先具体动词 |

