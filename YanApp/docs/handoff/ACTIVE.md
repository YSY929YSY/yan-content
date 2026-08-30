# 当前状态 · ZH 54 候选稿已备妥，待负责人逐条确认

> 更新日期：2026-08-30
> **新窗口开局只读这一份就够，不要回溯 CC-REPORT。**

## ✅ 本轮完成 · `TICKET-wordfield-zh-54.md`（第 2 步）

本轮决策指标 = **A 类 26 条改完并经负责人确认的条数 0 → 0**；候选稿不构成确认，负责人尚未逐条确认，
因此没有任何条目可落库。待确认 A 类 **26 条**；复算：
`node -e "const s=require('fs').readFileSync('staging/zh-54-candidates.md','utf8'); const a=s.slice(s.indexOf('## A'),s.indexOf('## D')); console.log((a.match(/^\\| \\d+ \\|/gm)||[]).length)"`。

候选稿在 `staging/zh-54-candidates.md`：A 26、D 2、B 17、C 5、OK 4，共 54 条；每条均含原中文、
候选中文和原因，D 类另列修改前后。复算：
`node -e "const s=require('fs').readFileSync('staging/zh-54-candidates.md','utf8'); for(const h of ['## A','## D','## B','## C','## OK']){const i=s.indexOf(h),j=s.indexOf('\\n## ',i+1); console.log(h,(s.slice(i,j<0?undefined:j).match(/^\\| \\d+ \\|/gm)||[]).length)}"`。

本轮未改日语、两个内容包、`publication`、UI、gloss 或对齐，未发布也未推 OTA。验收：`npm test`
**631 / 631**、`npm run typecheck` 通过、`npm run audit` **FAIL: 0, WARN: 25**。完整原始输出及异常自查见
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
| 词场 | **249 / 563**（229 条 Tatoeba + 20 条手工） |
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
| 6 | `TICKET-wordfield-zh-54.md` | 第 2 步已完成，待负责人确认 `staging/zh-54-candidates.md`；确认后另开落库工单 |

**上限 303 / 563**（ZH 54 全救回来）。

## 卡在谁身上（每轮必须分开写）

| 卡在 | 事 | 谁能解 |
|---|---|---|
| **人** | ZH 54 条候选中文逐条确认（A 26 条优先；LLM 产出不能进 publication） | 负责人 |
| **人** | 218/249 条把自己列进 `members`，chip 指向自己 —— 设计还是冗余？ | 负责人 |
| **人** | `カード → 积分卡` 在「見せます」句里应是「卡片」，且被测试硬编码锁死 | 负责人 |
| **人** | 内容包什么时候发布（`push-content.sh` = 推线上） | 负责人 |
| **人** | 纠错入口一周后点几次（**点不到三次就删**） | 负责人 |
| 技术 | 本轮词场渲染修复已落库，无待处理技术步骤 | Codex |

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
