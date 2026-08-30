# 当前状态 · LV 49 条已落库，待内容门禁与发布决策

> 更新日期：2026-08-30
> **本轮工单：`TICKET-wordfield-land-lv49.md`，已完成落库；不发布、不推 OTA。**

## 本轮完成 · TICKET-wordfield-land-lv49

| 项 | 结果 |
|---|---|
| 复核结果 | 按负责人最新口径，65 条中 49 条 OK 落库，15 条 ZH 与 1 条 JP 留待后续；复算：`node -e 'const fs=require("fs"),r=fs.readFileSync("staging/lv-67-for-review.md","utf8").split("\\n").filter(x=>/^\\| \\d+ \\|/.test(x)),x=new Set([3,4,10,14,17,19,22,30,32,34,39,44,49,51,59,63]);console.log(r.length,x.size,r.length-x.size)'` |
| 决策指标：词场落库数 | **200 → 249 / 563**；复算：`node scripts/content-stats.mjs` |
| 内容版本 | 2.7 → **2.8**，只递增一次；复算：`node -e "console.log(require('./assets/content.fallback.json')._meta.version)"` |
| 成员 | 总数 487 → 588，空成员 0 → 0；13 个无法由 `dictionaryFormsFrom` 还原的成员不写入；复算：`node -e 'const c=require("./assets/content.fallback.json");const f=c.wordBank.flatMap(w=>{const x=w.wordField;return Array.isArray(x)?x:(x?[x]:[])}).filter(x=>x?.sentence?.jp);console.log(f.reduce((n,x)=>n+(x.members?.length||0),0),f.filter(x=>!(x.members?.length)).length)'`（前值见本轮报告） |
| 主产出 | 两份内容包已同步；待审原始清单仍在 [`staging/lv-67-for-review.md`](../../staging/lv-67-for-review.md) |

落库脚本：[`scripts/wordfield-land-lv49.mjs`](../../scripts/wordfield-land-lv49.mjs)。从已审清单读取 49 条，成员按候选 ID 映射，并通过 `dictionaryFormsFrom` / alignment 做活用回拼校验；不生成、不改写日文或中文。`n5_kata` 的换句留到下一轮。

下一步是完成内容门禁并由项目负责人决定是否合并/发布。本轮没有推 `origin/main`、没有构建、没有 OTA。

## 之前已完成并合入 `develop/v2`

| | 事 | 结果 |
|---|---|---|
| 1 | 落 167 条词场 | 20 → 187 / 563 |
| 2 | 成员回填 + gloss 双基线 | members 空 0；两条基线都硬断言条数 |
| 3 | JP 22 换句 → 落 13 条 | 187 → **200 / 563** |
| 4 | 纠错入口（本地 only） | 词卡底部「去纠错」，无网络调用 |
| 5 | `TICKET-gloss-fullbank-and-mastered.md` | 词场 gloss 查询改用全库；底部逃生口改为右上角垃圾桶图标 |

**未发布。** `push-content.sh` 没跑，`origin/main` 没动，OTA 没推。

## 词场与 gloss 现状

```
249 条：N5 244 · N4 4 · N1 1
Tatoeba 来源 229 条（带 jp/zh sentence ID，可回读）
手工精选 20 条（无 source，有 roma）
gloss 基线：legacy 零空洞 / Tatoeba ≥95%（现有基线测试继续守住）

设备条件决策指标：按每条 anchor 所属词书子集查询时，覆盖率 **87.71% → 96.60%**；修复后与全库基线一致。
复算：`node scripts/gloss-device-coverage.mjs`

这次没有改 `bookWords` 的列表、进度或复习口径；只新增 `glossLookupBank` 沿详情 props 传入完整 `content.wordBank`。
「这个词不用再问我了」已移到右上角垃圾桶图标，底部只保留「去纠错」；图标带「以后不再问这个词」和「移出复习队列」无障碍文案。
```

⚠️ **词场只覆盖 N5。** 全词库 N5 有 724 个词，词场覆盖 244 个（≈34%）。复算：`node scripts/content-stats.mjs`
翻 N3/N2/N1 的词一个词场都看不到 —— **这是设计如此**
（`docs/content-standard-wordfield.md:134`：词场是选出来的两三百个词才有的一层），
**不是 bug**。真机测试时要知道，否则会误判成没生效。

⚠️ **229 条 Tatoeba 词场没有读音行。** 现有 20 条手工词场有 `roma`，
新的没有（不生成假名 = 不产出无源内容）。渲染端 `App.js:2590` 已 fail-safe，
不会崩，但视觉上少一行。如果碍眼，`furigana.ts` 批量派生是独立的一张小工单。

## 下一步：项目负责人（不是 AI）

1. **推 OTA**（JS 改动，不吃构建额度）：
   `npx eas-cli update --branch preview --platform ios --message "…"`
   ⚠️ 开着 App 前台别动 1–2 分钟再杀掉重开，否则下载每次从头开始
2. **真机翻这 249 条词场**，边翻边点「去纠错」
3. 攒一批一起反馈（`CLAUDE.md` 第 5 节）

**纠错入口的真正验收**：用一周看点几次。**点不到三次就该删掉**
（工单里写死的，不要忘）。


## 卡在谁身上（每轮必须分开写）

**「卡在人」和「卡在技术」不是一回事，混在一起会让人以为都在推进。**

| 卡在 | 事 | 谁能解 |
|---|---|---|
| **人** | ZH 54 条中文要人审（外部审核只能出候选，LLM 产出不能进 publication） | 负责人 |
| **人** | 200 条词场的真机观感、对齐问题要人指认 | 负责人 |
| **人** | 内容包什么时候发布（`push-content.sh` = 推线上） | 负责人 |
| **人** | 纠错入口一周后点几次（点不到三次就删） | 负责人 |
| 技术 | gloss 单字误命中率的修复后值 | Codex |
| 技术 | 换句规则不看 `meaning_zh` 义项 | Codex |
| 技术 | `glossLookupBank` 默认参数改必传 | Codex（已并入 lv49 工单） |

**这个项目历史上最长的停滞（1851 条候选挂两个月）卡的是人，不是技术。**
写工单前先看这张表：如果队列里全是"卡在人"，那就不该再写工单，
该做的是**把人的决定变便宜**（分档、抽样、只问一句话）。

## 排队中（等真机反馈后再定优先级）

| | 工单 | 说明 |
|---|---|---|
| 1 | `TICKET-wordfield-zh-38.md`（**待写**） | 53 条中文，日语不动；**要负责人 + 外部审核，最贵** |
| 2 | `TICKET-mishit-after-value.md` | gloss 单字误命中率的修复后值（55.88% → ?），已写未发 |

**当前词场 249 / 563**；ZH 53 条仍未落库。复算：`node scripts/content-stats.mjs`。

## 已知放弃 · 9 条无词场

`n5_aru_2` `n5_fuyu` `n5_iriguchi` `n5_iru` `n5_mimi` `n5_oniisan` `n5_shinu`
`n5_futari` `n5_sora`

Tatoeba 候选池已耗尽，另一条同样不自然。**要么人写句子（破坏可回读），
要么接受没有词场 —— 已决定接受。不要再试。**

## 两个记着不急的结构问题

1. `docs/content-standard-wordfield.md:124` 写的是「**手工精选**两三百个词写词场」，
   而我们做的是自动选句管线。外部审核标出 47%，某种程度上正是这个替换的可预期结果。
2. **谚语对译**：Tatoeba 日中双方各取本国谚语，两边都不是自然句
   （`二人は伴侶三人は仲間割れ / 一个和尚挑水吃…`）。ZH 那轮要专门查这一类。

## 不做

- 不发布、不推 `origin/main`（**merge 到 main = 推线上**）
- 不构建（EAS 额度留给另一个项目）
- 不并行任何两个改内容包的任务（内容窗口互斥）

## 本轮已完成 · TICKET-gloss-fullbank-and-mastered

- 实现提交：`d5a4db9`（未改内容包、未发布、未推 OTA）。
- 覆盖率脚本：`scripts/gloss-device-coverage.mjs`；设备样本守卫：`src/lib/__tests__/glossFullBankWiring.test.mjs`。
- 词书详情保留子集作为列表/进度/复习池；例句与词场 gloss 单独使用全库。
- 右上角使用垃圾桶图标，不用「斩」（用户不一定理解）、不使用包包（语义不对应），也不再放底部长句；点击行为仍调用既有 `handleGrade('mastered')`。

下一步仍由项目负责人决定是否推热更新包；本轮不构建、不发 OTA。
