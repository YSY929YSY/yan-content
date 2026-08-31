# 工单 · ZH 54 落库（27 个新词场）

> 先读 `AGENTS.md`：第二节内容窗口与分支规矩、第四节完成标准、第五节报告要求。
> **这是内容窗口任务，`assets/content.fallback.json` 全局互斥，期间不许并行任何其他改内容包的任务。**

## 本轮决策指标（5-4）

**新落库词场里，中文会把用户教错的条数：25 → 0**

前值 25 = 若把 Tatoeba 原始中文直接落库，A 类会教错的条数（26 条减去撤出的 #32）。
后值靠**回读验证**得出，不是「改完了」。D 类 2 条是附带，不计入
（`AGENTS.md` 已确立：A 会教错，B/C/D 只是难看）。

## ⚠️ 范围更正（2026-08-31，工单原文写错了）

工单初版写「本轮只改 `wordField.sentence.zh`」——**错**。实测 28 条里 **27 条根本没落库**，
这是**落 27 个新词场**（`members` + `sentence` + 来源），不是改中文。
复算：见下方「怎么确认没落库」。

Codex 第一次执行时按 fail closed 停在这里并要求来源，**停得对**。
它只查了 `staging/wordfield-shortlist-343.json`（那份筛掉了未知词非零、以及已有词场的 anchor），
完整候选池是 `staging/wordfield-candidates-tatoeba.jsonl`，两条缺的记录都在里面。

**怎么确认没落库**：
```
node -e 'const c=require("./assets/content.fallback.json");const W={};c.wordBank.forEach(x=>W[x.id]=x);console.log(["n5_aku","n5_kata","n5_saifu"].map(i=>i+":"+(W[i].wordField?"有":"无")).join(" "))'
```

## 两条负责人裁决（2026-08-31，已定，不要再问）

- **#32 `n5_saifu` 撤出本轮，不落。** 库里已有另一句词场（`財布からお金を出します。/ 从钱包里拿出钱。`），
  落 #32 等于换掉一句已经发出去的。现库那句更短、目标词更突出（`SOUL.md` 例句标准）。
  **不换。** 因此本轮 27 条，全部是净新增。
- **#54 `n5_kata` 落，接受未知词。** `あの方は八十歳です。` 的 `八十` 不在词库
  （`unknown_words: ["八十"]`，这也是它当初没进 shortlist 的原因），落库后该 token 没有 gloss。
  `八十` 是数词，中文使用者零成本，不影响理解，**接受**。

## 落库后的账

```
词场 249 → 276 / 563
```
B/C/OK 那 26 条另一轮落完后是 **302**，不是 `ACTIVE.md` 旧文写的 303 —— 差的一条就是撤出的 #32。


## 这张工单把主线推迟多久

**不推迟。** 词场 249 / 563 的中文修缮，是同一条主线的收尾。

## 前置（已完成，不要重做）

28 条最终中文**已经负责人逐条确认**，依据在 `docs/handoff/REVIEW-zh-54-A.md` 第三段确认栏，
判读过程见 `REVIEW-zh-54-A-BLIND.md`（盲判：同意候选 23 / 挑回原文 0 / 第三版 3）。
两条裁决判据在 `DECISIONS.md`（2026-08-31 一节）。

**不要重新判读，不要"顺手优化"任何一条中文。** 表里写的就是要落的字面。

## 🔴 硬约束

1. **不碰日语。** 日语句面按下表原样落，已在此前审核通过，本轮不重判。
2. **不碰 `publication` / `meaningTrust`**，不碰评分算法，不碰 gloss 与对齐逻辑。
3. **两份内容包必须在同一个 commit 里一起改**：
   `assets/content.fallback.json` + `yan-content/content.v2.json`，
   提交前 `shasum -a 256` 确认两份逐字节相同。（2026-08-22 漏过一次，权威副本停在旧版）
4. `_meta.version` **整个窗口只递增一次**。
5. `kanji_anchor` 仍须是 **563 条**，词条总数仍须是 **8005**。
6. **不发布、不推 `origin/main`、不推 OTA。** merge 到 main = 给线上用户发包。

## 分支

```
git checkout -b content/2026-08-31-zh-54 develop/v2
```

窗口做完、`bash tools/check-content-release.sh` Blocker=0 之后再合回 `develop/v2`。
理由是**可回滚**，不是防冲突。

## 括号是什么（不要当成错别字改掉）

#10 #15 #19 #45 的中文里有全角 `（）`，标的是**日语按惯例省略、中文必须补出来**的成分。
这是负责人 2026-08-31 的决定，判据见 `DECISIONS.md` 判据一、背景见 `IDEAS.md`。

**本轮括号按纯文本落库，字号不管。** 小字号渲染是 `TICKET-zh-54-paren-style.md`，
是另一条线的改动，**不许混进内容 commit**。

## 27 条（表里就是要落的字面，不要再判读、不要"顺手优化"）

`members` 与 Tatoeba ID 直接取自 staging 记录，**不许自己造、不许自己补**。
表里没有的字段（如 `roma`）按现有 249 条词场的既有做法生成。

| # | anchor | 日语 | 中文（落库字面） | members | Tatoeba jp / zh |
|---:|---|---|---|---|---|
| 2 | n5_aku | 靴下に穴が開いているよ。 | 袜子上破了个洞呀。 | `n5_aku` `n5_kutsushita` | 179233 / 8593083 |
| 4 | n5_aruku | 少し歩くと駅に出ます。 | 走一小段路就到车站了。 | `n5_aruku` `n5_deru` `n5_eki` `n5_sukoshi` | 146778 / 13942584 |
| 6 | n5_ashi | 靴がきつくて足が痛い。 | 鞋太紧了，脚疼。 | `n5_ashi` `n5_itai` `n5_kutsu` | 179262 / 1783815 |
| 8 | n5_bunshou | 先生、この文章は正しいですか？ | 老师，这段文字写得对吗？ | `n5_bunshou` `n5_sensei` | 11243008 / 13920702 |
| 10 | n5_hai_2 | コーヒー一杯ください。 | 请给（我）一杯咖啡。 | `n5_hai_2` `n5_ichi` | 224848 / 1109528 |
| 11 | n5_hanashi | 話を続けて下さい。 | 请继续说下去。 | `n5_hanashi` `n5_kudasai` | 77144 / 2004697 |
| 13 | n5_hikui | 私はとても背が低い。 | 我个子很矮。 | `n5_hikui` `n5_sei` `n5_watakushi` | 2349246 / 512866 |
| 15 | n5_itai | 先生、お腹が痛いんです。 | 老师，（我）肚子疼。 | `n5_itai` `n5_onaka` `n5_sensei` | 1126049 / 10540451 |
| 17 | n5_kaku | 彼は時々手紙を書いた。 | 他偶尔写信。 | `n5_kaku` `n5_tegami` `n5_tokidoki` | 105279 / 10275159 |
| 18 | n5_ki | 鳥は木に巣を作る。 | 鸟儿在树上筑巢。 | `n5_ki` `n5_tori` `n5_tsukuru` | 125775 / 9453440 |
| 19 | n5_kiku | 名前が呼ばれるのを聞いた。 | （我）听到有人叫（我的）名字。 | `n5_kiku` `n5_namae` `n5_yobu` | 80788 / 495606 |
| 22 | n5_kotaeru | 私の質問に答えなさい。 | 回答我的问题。 | `n5_kotaeru` `n5_shitsumon` `n5_watakushi` | 163451 / 784532 |
| 23 | n5_kuchi | あいつは口の悪いやつだ。 | 他这人说话很刻薄。 | `n5_kuchi` `n5_warui` | 234619 / 8508417 |
| 24 | n5_kyoudai | 彼女には兄弟が三人いる。 | 她有三个兄弟姐妹。 | `n5_kyoudai` `n5_nin` `n5_san_2` | 89846 / 8940730 |
| 27 | n5_nomu | 彼女は時々ワインを少し飲む。 | 她偶尔喝点葡萄酒。 | `n5_nomu` `n5_sukoshi` `n5_tokidoki` | 89165 / 342762 |
| 28 | n5_nugu | 彼は上着を脱いだ。 | 他脱下了外套。 | `n5_nugu` `n5_uwagi` | 103995 / 1071000 |
| 31 | n5_oshieru | 先生が教えた。 | 老师教了。 | `n5_oshieru` `n5_sensei` | 6828208 / 8835055 |
| 34 | n5_shashin | この写真はどこで撮ったの？ | 这张照片是在哪儿拍的？ | `n5_shashin` `n5_toru_2` | 2998816 / 2998814 |
| 38 | n5_watakushi | 私は山にいました。 | 我在山里。 | `n5_watakushi` `n5_yama` | 4715 / 15 |
| 41 | n5_dekakeru | 彼は今出かけるところだ。 | 他正要出门。 | `n5_dekakeru` `n5_ima` | 107131 / 8499945 |
| 45 | n5_iru_2 | 言葉だけの優しさなんて要らない。 | （我）不需要只停留在嘴上的温柔。 | `n5_iru_2` `n5_kotoba` | 3309009 / 11122919 |
| 46 | n5_karada | 魚を食べることは体にいい。 | 吃鱼对身体有好处。 | `n5_karada` `n5_sakana` `n5_taberu` | 182091 / 1878291 |
| 47 | n5_kaze_2 | 私は彼に風邪をうつした。 | 我把感冒传染给他了。 | `n5_kaze_2` `n5_watakushi` | 154058 / 1423995 |
| 53 | n5_tsukue | 机の上を片付けよう。 | 把桌面收拾一下吧。 | `n5_tsukue` `n5_ue` | 183412 / 333524 |
| 54 | n5_kata | あの方は八十歳です。 | 那位八十岁了。 | `n5_kata` `n5_sai` | 13225083 / 13526849 |
| 26 | n5_namae | 私は彼の名前を知らない。 | 我不知道他叫什么名字。 | `n5_namae` `n5_shiru` `n5_watakushi` | 153785 / 505677 |
| 39 | n5_atatakai | 三月にはもっと暖かくなるだろう。 | 到了三月会变得更温暖吧。 | `n5_atatakai` `n5_gatsu` `n5_san_2` | 169507 / 5849914 |

## 验收

1. `npm test && npm run typecheck && npm run audit`（`AGENTS.md` 第四节）
2. `bash tools/check-content-release.sh` → **Blocker 0**
3. **回读验证**：落库后从内容包里把这 27 条读出来，`sentence.zh`、`members`、Tatoeba ID
   三项都与上表逐字比对。写一条可粘贴运行的命令进报告（`AGENTS.md` 5-1），
   给出**一致条数 27 / 27**，以及**词场总数 249 → 276**。
4. 两份内容包 `shasum -a 256` 相同，把两行哈希贴进报告。
5. 决策指标前后值：**25 → 0**（5-3 必需项）。

## 报告

按 `AGENTS.md` 第五节写 `ACTIVE.md` + `CC-REPORT.md`，含 5-2 异常自查、
前后 `node scripts/content-stats.mjs` 对比。

**报告写完记得提交。**（`REPEATED-MISTAKES.md` 第 2 条：代码提交了、报告留在工作区，发生过 5 次）
