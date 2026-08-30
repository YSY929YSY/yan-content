# 当前状态 · 发布闸门已补上提交态护栏，待负责人决定发布

> 更新日期：2026-08-30
> **新窗口开局只读这一份就够，不要回溯 CC-REPORT。**

## ✅ 本轮完成 · `TICKET-release-gate-blindspot.md`

本轮决策指标 = **磁盘内容与 `develop/v2` 提交不一致时，闸门必须从放行变为 Blocker**。
修复前的自然失败样本会被旧闸门判为 Blocker 0；修复后当前分支实测为 **Blocker 2**（当前分支不对
与磁盘不对应 `develop/v2` 提交各占一项）。复算：从仓库根目录运行 `bash tools/check-content-release.sh`。

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
| 3 | `TICKET-sync-data-loss.md` | 待发，M1/M2/M3 上架前必修，零测试覆盖 |
| 4 | `TICKET-wordfield-render-fixes.md` | 待发，前置是 1（同一处代码） |
| 5 | `TICKET-wordfield-furigana.md` | 待发，229 条补读音行 |
| 6 | `TICKET-wordfield-zh-54.md` | 待发，**待审文件已备好**：`staging/zh-54-for-review.md` |

**上限 303 / 563**（ZH 54 全救回来）。

## 卡在谁身上（每轮必须分开写）

| 卡在 | 事 | 谁能解 |
|---|---|---|
| **人** | ZH 54 条中文要审（LLM 产出不能进 publication） | 负责人 |
| **人** | 218/249 条把自己列进 `members`，chip 指向自己 —— 设计还是冗余？ | 负责人 |
| **人** | `カード → 积分卡` 在「見せます」句里应是「卡片」，且被测试硬编码锁死 | 负责人 |
| **人** | 内容包什么时候发布（`push-content.sh` = 推线上） | 负责人 |
| **人** | 纠错入口一周后点几次（**点不到三次就删**） | 负责人 |
| 技术 | 工单 1 / 2 / 3 | Codex |

## 外部审计确认、已写进工单的其余缺陷

- **成员高亮**：370 个非自身成员槽位只有 309 个能亮（83.5%），22 条句子整句无高亮 ——
  内容侧刻意放了活用成员（`d11f81c`），渲染侧还在用严格相等 → 工单 2
- **括号截断**：`firstGloss` 不看括号配对，全库 46 条切出半个括号
  （`花费（时间` `戴（帽子等` `（您`）→ 工单 2
- **性能**：`WBDetailPage` 零个 `useMemo`，纠错框每敲一个字重跑一次全库对齐 → 工单 2
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
