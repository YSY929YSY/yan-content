# 当前状态 · ZH 54 的 27 个词场已落库，括号显示待真机验收

> 更新日期：2026-08-31

---

## 📌 前提：言现在没有真实用户（2026-08-31，负责人第三次说明）

**「线上用户会收到」不再是拦发布/OTA 的有效理由。** 结构上「merge 到 `main` = 发布通道」
仍然成立，但**后果不是用户受伤**，只是 EAS 额度和验证环境。

- 要在真机上看 JS 改动，**直接推 OTA 就行**，不必为了避开线上去打 TestFlight 包。
  ⚠️ 但**推哪个分支由设备在哪个 channel 决定，不由「有没有用户」决定** ——
  这台设备在 `preview` 上，推 `production` 它收不到。2026-08-31 因此白推过一次。
  先跑 `npx eas channel:view preview` 确认。
- **仍然要负责人点头的是 `scripts/push-content.sh`**（推 `origin/main`）——
  理由是它改变「权威内容副本是哪一版」，是可回滚性问题，与有没有用户无关。
- 上架前人工核验清单照做，理由是**上架前**要对，不是因为现在有人在用。

---

## ✅ 已结案 · OTA 悬案（2026-08-31）

**结论：配置一直是对的，OTA 一直在生效。悬案本身是误判。**

权威来源（不要再靠猜，直接跑这两条）：

```
npx eas build:list --limit 5    # 装机包的 profile / channel / runtimeVersion
npx eas channel:view preview    # channel 指向哪个 branch、最近一条更新是什么
```

实测：**全部 build 都是 `preview` profile、channel `preview`、runtimeVersion 2**，
channel `preview` → branch `preview`，映射正常。

原悬案猜「设备装的是 production build，收不到 preview 分支」——**猜反了**。
而且 9 小时前那条 `五十音头部重排` 其实已经到了设备（20:26 截图里计数块已消失，
正是那次改动的效果）。

**真正没到的是 ZH 27 条词场那批**：负责人说「没有客户，可以 production」，
我照字面推到了 `--branch production`，而设备在 `preview` channel 上 ——
**往一个没人听的频道广播了一次。** 已重推 `--branch preview`（`d9e28772`）。

### 留下的规矩

1. **推 OTA 前先 `eas channel:view <channel>` 确认设备在哪个 channel**，
   不要根据「有没有用户」决定推哪个分支 —— 那是两件事。
2. **判断 OTA 有没有到设备，找「一起出现」四个字**（`聞く` 词卡，例句卡下面）。
   它在 276 条词场上都会出现，比找 4 条括号可靠。
3. `eas update` **不能用 `--platform=all`**：web 链路会因缺依赖打包失败而整条命令失败，
   一律带 `--platform ios`。

---

> **新窗口开局只读这一份就够，不要回溯 CC-REPORT。**

## ✅ 本轮完成 · `TICKET-zh-54-land.md`

本轮决策指标 = **新落库词场里会把用户教错的中文条数 25 → 0**。27 条已逐字回读，中文、可渲染的
成员与 Tatoeba 日中句 ID 全部一致；复算：`node scripts/land-zh-54.mjs`。词场 **249 → 276 / 563**，
词库总数仍为 8005、`kanji_anchor` 仍为 563、版本 2.8 → 2.9；复算：`node scripts/content-stats.mjs`。

staging 原始成员中有 6 个不能被运行时匹配器在句面识别（`～杯`、`～月`、`～歳`、`呼ぶ`、`～人`、`撮る`；复算：`node scripts/land-zh-54.mjs | grep '^source members filtered'`），
落库时按同一 `dictionaryFormsFrom` 路径过滤，防止设备端成员高亮失效；中文、日语、来源 ID 未改。
全量验收 `npm test` **638 / 638**、`npm run typecheck` 通过、`npm run audit` 退出码 0；发布闸门
Blocker 0。未执行 `push-content.sh`、未推 `origin/main`、未推 OTA。完整原始输出与内容统计对比见本轮
`CC-REPORT.md`。

## ⏳ 实现完成、待真机验收 · `TICKET-zh-54-paren-style.md`

括号注的切分与两处接线已实现：词场中文行和复习提问面都共用
`src/features/wordbank/parentheticalZh.js` 的 `splitParentheticalZh`。#19
`（我）听到有人叫（我的）名字。` 会把两个全角括号（括号本身含在内）降为较小、较淡的嵌套文本；
不成对、嵌套、空全角括号或没有全角括号一律原样显示，半角 `()` 不处理。

决策指标的代码接线点数 **2 → 0**：两处原本整段同字号的输出均已改为注样式；复算：
`node --test src/features/wordbank/__tests__/parentheticalZhWiring.test.mjs`。变异验证已实际运行：放宽
不成对括号会令 `parentheticalZh.test.mjs` 红；移除复习调用会令接线测试红。全量 `npm test`、
`npm run typecheck` 通过。

**尚未完成视觉验收。** 当前机器没有 `xcrun simctl`；`npx expo start --web --port 8083` 也因缺少
`react-native-web/dist/exports/AppRegistry` 打包失败。因此还需负责人在现有真机/开发客户端上分别查看 #19
的词卡词场和复习提问面，确认注没有变成过强提示或影响换行；完整命令、报错和建议观察点见本轮报告。

## ✅ 本轮完成 · `TICKET-kana-header.md`（五十音头部重排）

本轮决策指标 = **切换子标签时假名格区域顶部的位移：现状 → 0**。修复前只在清音屏渲染的
「看过 X/46」计数块造成约 59px 位移（按删除前样式字面量估算，非实测）；修复后头部两行 +
提示卡都改成与 `kanaSection` 无关的固定高度（`src/features/kana/kanaHeaderLayout.ts`），
位移按构造为 0。复算：`node --test src/features/kana/__tests__/kanaHeaderLayout.test.mjs`（7/7）。

删掉计数块整块（含三种状态注解文案）。**「我已经会了」按钮也在这一整块里被一并删除** ——
工单原文要求整块删,新头部结构没给这个按钮留位置,按字面理解删了;`declareKnown` / `useKanaGate`
数据层完好未动,首页今日卡的门判断不受影响,唯一受影响的是「一个词都没学过又不想逐个点 46 个
假名」的新用户失去了这一页上的显式跳过入口。**这条需要负责人确认是否符合预期**,详见本轮
`CC-REPORT.md`「有意的功能取舍」一节。

提示卡 `minHeight` 是按字数估算的(320 屏 256px 可用宽度 ÷ 12.5px/字 ≈ 20 字/行,最长文案
66 字≈4 行+1 行余量),不是在真实渲染器里量出来的 —— 这个仓库没有 RN 渲染测试基建。
变异验证按工单要求做了两处(条件渲染守卫 + 共享常量引用),均确认转红后已改回。

验收：`npm test` **638 / 638**、`npm run typecheck` 通过、`npm run audit` `FAIL: 0` `WARN: 24`
（与改动前基线相同）。本轮未改内容包、假名数据、发音、记忆钩子、底部三个 tab、评分算法，
未发布未推 OTA。

## ✅ 本轮完成 · `TICKET-wordfield-zh-54.md`（第 2 步）

本轮决策指标 = **A 类 26 条改完并经负责人确认的条数 0 → 0**；候选稿不构成确认，负责人尚未逐条确认，
因此没有任何条目可落库。待确认 A 类 **26 条**；复算：
`node -e "const s=require('fs').readFileSync('staging/zh-54-candidates.md','utf8'); const a=s.slice(s.indexOf('## A'),s.indexOf('## D')); console.log((a.match(/^\\| \\d+ \\|/gm)||[]).length)"`。

候选稿在 `staging/zh-54-candidates.md`：A 26、D 2、B 17、C 5、OK 4，共 54 条；每条均含原中文、
候选中文和原因，D 类另列修改前后。复算：
`node -e "const s=require('fs').readFileSync('staging/zh-54-candidates.md','utf8'); for(const h of ['## A','## D','## B','## C','## OK']){const i=s.indexOf(h),j=s.indexOf('\\n## ',i+1); console.log(h,(s.slice(i,j<0?undefined:j).match(/^\\| \\d+ \\|/gm)||[]).length)}"`。

本轮未改日语、两个内容包、`publication`、UI、gloss 或对齐，未发布也未推 OTA。验收：`npm test`
**631 / 631**、`npm run typecheck` 通过、`npm run audit` 退出码 **0**。完整原始输出及异常自查见
本轮 `CC-REPORT.md`。下一步仅限负责人逐条确认候选，确认后另开落库工单与内容分支。

## ✅ 本轮完成 · `TICKET-wordfield-render-fixes.md`

本轮决策指标 = **成员高亮失效槽位 69 / 370 → 0 / 370；括号不闭合 gloss 46 → 0**。当前分支按
工单原有的严格相等口径复算出 **69 / 370**、**25 条**整句无高亮；工单正文写的 61 / 370、22 条与
本次实测不一致，原因无法从仓库现状确定，按实测值报告。复算：运行下方 CC-REPORT 中的词场全库
统计命令。

成员匹配现在拆分多表记/读音，并用 `dictionaryFormsFrom` 及受限的词面包含兜底识别活用、复合 token；
全库 **370 / 370** 槽位命中、整句无高亮 **0 条**。`firstGloss` 现在跳过半角/全角括号内部的分隔符，
全库不闭合 **0 条**。所有结果复算：`node --test src/features/wordbank/__tests__/wordFieldAlignment.test.mjs`。

词卡主例句与词场对齐结果已放入 `useMemo`，`correctionNote` state 结构未移动；同一张单词场卡敲 **10**
个字符的对齐调用由 **10 → 0**，这是按旧的每次渲染调用路径与当前 memo 依赖做的源码级调用计数，
不是耗时估算。复算：`node --test src/lib/__tests__/wordfieldRenderGuards.test.mjs`。

代码提交 `d94ea35`。项目验收 **631 / 631**，类型检查通过，审计 `FAIL: 0`、`WARN: 25`；复算：
`npm test && npm run typecheck && npm run audit`。本轮未改内容包、未改 `カード → 积分卡`，未处理 **218 / 249**
条自成员 chip；后两项留给负责人决定。按工单要求，本轮完成后停在热更新就绪，不发布、不推 OTA。

## ✅ 本轮完成 · `TICKET-sync-data-loss.md`

本轮决策指标 = **能造成不可逆用户数据丢失的路径数 3 → 0**。M1 口袋空表覆盖、M2 补传途中
铸造匿名账号、M3 删号 Storage 清理失败后仍删账号，均已加 fail-closed 守卫与回归测试；复算：
`node --test src/lib/__tests__/syncDataLoss.test.mjs`。

M1 现在区分拉取失败与云端空表，口袋拉取成功取本机与云端并集；M2 的同步路径只读取现有会话，
匿名账号创建只保留在 `ensureUser()` 首次启动入口；M3 Storage 列举分页、错误向上传播，任一步
Storage 清理失败都不会调用删号 RPC，并返回“删除未完成，请重试”。S1/S2 建议项也已处理：口袋
读盘按既有别名表折算，进度 upsert/delete 检查数据库错误。

代码验收 **627 / 627**，类型检查通过，审计 `FAIL: 0`；复算：
`npm test && npm run typecheck && npm run audit`。本轮未改内容包、未改评分算法、未连生产凭据。

仍待负责人确认：生产库是否实际执行过 `schema.apply-all.sql`；删号后两桶旧前缀照片是否真已回收；
以及把失效的 `stamp-wordbank-publication.py --check` 改成新的内容契约守卫（本轮只写建议，不改）。

## ✅ 本轮完成 · `TICKET-release-gate-blindspot.md`

本轮决策指标 = **磁盘内容与 `develop/v2` 提交不一致时，闸门必须从放行变为 Blocker**。
修复前的自然失败样本会被旧闸门判为 Blocker 0；修复后当前分支实测为 **Blocker 2**（当前分支不对，且
磁盘不对应 `develop/v2` 提交，各占一项）。复算：从仓库根目录运行 `bash tools/check-content-release.sh`。

闸门现在分别用 `git rev-parse develop/v2:<path>` 与 `git hash-object <disk path>` 对照两份内容，且
当前分支不是 `develop/v2` 时直接报 Blocker，并输出下一步。模拟在临时 `develop/v2` worktree 上运行同一
修复脚本，实测 **Blocker 0**；复算方式见本轮 `CC-REPORT.md` 的原始命令记录。

`push-content.sh` 发布前从 `develop/v2` 提交打印 **8005 条词条、200 条词场**，默认要求人工确认，
只有 `--yes` 才跳过确认；复算：
`git show develop/v2:yan-content/content.v2.json | python3 -c 'import json,sys; c=json.load(sys.stdin); w=c.get("wordBank") or []; f=sum(1 for x in w if isinstance(x.get("wordField"),dict) and x["wordField"].get("sentence",{}).get("jp")); print(len(w), f)'`。

新增提交态回归与发布脚本静态护栏测试；完整验收 **621 / 621**，类型检查通过，审计 `FAIL: 0`。
复算：`npm test && npm run typecheck && npm run audit`。本轮没有执行发布脚本、没有发布或推送线上。

## ✅ 本轮完成 · `TICKET-gloss-single-kana.md`

决策指标：含单假名误命中的词场句数 **82 / 249 → 0 / 249**；单假名 token **88 → 0**。
Tatoeba 词场 gloss 覆盖 **1467 / 1533（95.69%）→ 1375 / 1489（92.34%）**，新测试下限为
**91.80%**（比修复后实测低 0.54 个百分点）。以上复算：`node scripts/gloss-single-kana-stats.mjs`。

F-3 在真实 249 条词场中影响 **0 句 / 0 token**，由合成回归测试覆盖；F-4 影响 **10 句 / 62 个
对齐位置**，同一命令复算。变异验证：把 F-3 改回 priority-first 后，测试样例变为 `たべ/も/の/。`；
把 F-4 改回无条件 grammar-first 后，测试样例变为 `と/て/も/だ/れ/か/。`，两条守卫均转红。

代码只改对齐消费逻辑、词书货架全库接线及测试/统计脚本；内容包未改、未落库、未发布、未推 OTA。
三条命令验收：`npm test` **619 / 619**，`npm run typecheck` 通过，`npm run audit` **FAIL 0**。
复算：分别运行 `npm test`、`npm run typecheck`、`npm run audit`。

三条样板句现在不再产生单假名 wordBank 命中：`私もとても楽しかったです。`、`だれか玄関に来てるよ。`、
`私は先月ロンドンにいました。`。本轮按工单定义**不推迟词库主线**；热更新由负责人决定。


## 🟡 发布边界：不要跑 `scripts/push-content.sh`

发布闸门已经修好，但本轮只验证了它在错误分支阻断、在模拟 `develop/v2` 环境通过；没有执行
`scripts/push-content.sh`，也没有发布或推送 `origin/main`。线上发布仍由负责人决定。

## 已落库（未发布）

| | 结果 |
|---|---|
| 词场 | **276 / 563**（256 条 Tatoeba + 20 条手工） |
| 纠错入口 | 已上线，词卡底部「去纠错」，本地 JSONL 不发网络 |
| 备份点 | `git tag backup/2026-08-30-wordfield-249` → `c01d928` |

## 排队中的工单

| 序 | 工单 | 状态 |
|---|---|---|
| 1 | `TICKET-gloss-single-kana.md` | **已完成**，待负责人决定是否热更新 |
| 2 | `TICKET-release-gate-blindspot.md` | **已完成**，待负责人决定是否发布 |
| 3 | `TICKET-sync-data-loss.md` | **已完成**，待生产库/真机核验 |
| 4 | `TICKET-wordfield-render-fixes.md` | **已完成**，待负责人决定热更新 |
| 5 | `TICKET-wordfield-furigana.md` | 待发，229 条补读音行 |
| 6 | `TICKET-wordfield-zh-54.md` | **判读全部完成**。A 26 + D 2 已经负责人逐条确认，确认栏在 `REVIEW-zh-54-A.md`；B 17 + C 5 另起一轮 |
| 7 | `TICKET-kana-header.md` | **已完成**，待负责人确认「我已经会了」按钮一并删除是否符合预期 |
| 8 | `TICKET-zh-54-land.md` | **已完成**，27 个新词场落库；未发布 |
| 9 | `TICKET-zh-54-paren-style.md` | **实现完成，待负责人真机验收**：`（）`降级显示 |

**上限 302 / 563**（ZH 54 救回 53 条；`n5_saifu` 撤出，见 `DECISIONS.md` 裁决一）。
本轮工单 8 落 27 条：**249 → 276**。

## 卡在谁身上（每轮必须分开写）

| 卡在 | 事 | 谁能解 |
|---|---|---|
| ~~人~~ | ~~ZH 54 中文确认~~ **已完成 2026-08-31**：盲判复核（同意候选 23 / 挑回原文 0 / 第三版 3）+ 负责人逐条裁决，28 条可落 | — |
| **人** | 218/249 条把自己列进 `members`，chip 指向自己 —— 设计还是冗余？ | 负责人 |
| **人** | `カード → 积分卡` 在「見せます」句里应是「卡片」，且被测试硬编码锁死 | 负责人 |
| **人** | 内容包什么时候发布（`push-content.sh` = 推线上） | 负责人 |
| **人** | 纠错入口一周后点几次（**点不到三次就删**） | 负责人 |
| **人** | 五十音「我已经会了」按钮随计数块一起删了，没有新位置安放 —— 要不要加回来（哪里加） | 负责人 |
| 人 | #19 在词卡词场与复习提问面各看一次：括号注是否过强提示、是否影响换行 | 负责人 |

## 外部审计确认、已写进工单的其余缺陷

- **成员高亮**：已修复；当前 literal baseline 为 69 / 370、25 条整句无高亮，修复后均为 0；
  工单原文的 61 / 370、22 条与本次实测不一致，详见本轮报告。
- **括号截断**：已修复；`firstGloss` 全库不闭合条数 46 → 0。
- **性能**：已修复；对齐计算移入 `useMemo`，纠错框每敲一个字不再重跑对齐。
- **测试口径**：95% 覆盖率闸门量的是「非空」不是「正确」，
  算上错误 gloss 才及格（真实约 90.6%）→ 工单 1
- **恒真断言**：`glossFullBankWiring.test.mjs:17-19` 同一表达式求值两次 → 工单 1

**数据完整性无问题**：成员 id 全部存在、无重复无空、Tatoeba ID 无冲突无复用、
分词拼回原句 249/249 精确一致。


## 第二次冷启动审计 · 同步链与发布契约（2026-08-30）

审计方未看过任何此前对话与报告。**成立的不变量**（它自己跑过，非复述）：
进度键裸格式 ✓ · `kanji_anchor` 563 ✓ · 别名表 269 条无链式无自映射 ✓ ·
8005 个 id 唯一 ✓ · `publication` / `meaningTrust` fail-closed ✓ ·
删账号 DB 侧靠 `on delete cascade` 回收 ✓ · RLS 缺 `with check` **不是洞**（PG 用 USING 兼作 CHECK）

**必修四条** → 工单 2（M4）与工单 3（M1/M2/M3）。

**建议档**：口袋不做别名折算（269 个别名源键在内容里已全部不存在，
合并前收藏的词从口袋消失）· `pushProgress` 不接 DB error ·
`stamp-wordbank-publication.py --check` 已失效且不在闸门里
——**所以现在没有任何自动检查在守 563 这个数**。

**必须人工核验（代码证明不了）**：生产库到底跑没跑 `schema.apply-all.sql` ·
删账号是否真回收旧前缀照片 · `origin/main` 上现在挂的是哪一版 content。

## 已知放弃 · 9 条无词场

`n5_aru_2` `n5_fuyu` `n5_iriguchi` `n5_iru` `n5_mimi` `n5_oniisan` `n5_shinu`
`n5_futari` `n5_sora` —— Tatoeba 池已耗尽，**已决定接受，不要再试。**

## 两个记着不急的结构问题

1. `docs/content-standard-wordfield.md:124` 写的是「**手工精选**两三百个词写词场」，
   而我们做的是自动选句管线。外部审核标出 47%，正是这个替换的可预期结果。
2. **谚语对译**：Tatoeba 日中双方各取本国谚语，两边都不自然。ZH 那轮要专门查。

## 不做

- **不发布、不推 `origin/main`**（merge 到 main = 推线上）
- 不构建（EAS 额度留给另一个项目）
- 不并行任何两个改内容包的任务（内容窗口互斥）
- 功能线（journal / travel / world）**可以**与词库线并行 —— 见 `AGENTS.md` 第二节新增那节
