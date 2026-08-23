# 工单 · PLAN v2 第三批（commit 12–16：闭环接线）

> 上位文件：`docs/PLAN-execution-2026-08-22.md`
> 前两批：`TICKET-plan-v2-batch1.md`（六个 commit，已完成）、`TICKET-plan-v2-batch2.md`（内容窗口，已完成并已发布 2.2）
>
> 本批做完，最小学习闭环的四个零件（场景词 / 口袋 / 主动输出 / 回场景）就齐了。

## 上一批的教训（本批必须避免重犯）

上一批三个内容 commit 只改了 `YanApp/assets/content.fallback.json`，**没有把 `yan-content/content.v2.json` 一起提交**。
而 `scripts/push-content.sh` 取的是 `git show develop/v2:yan-content/content.v2.json` —— **已提交的那份**。
结果是：两份文件在磁盘上逐字节相同、审计 Blocker=0、测试全绿，但权威副本停在 2.1，照那样发布线上拿到的是旧包。

**本批规则**：任何改内容包的 commit，**必须在同一个 commit 里同时改两份文件**：

```
YanApp/assets/content.fallback.json
yan-content/content.v2.json          ← 上次漏的就是它
```

提交前用 `shasum -a 256` 确认两份逐字节相同（审计有这条硬要求）。

## 已定的产品决策（项目所有者已拍板，不要再问、也不要改）

1. **扩池**：便利店 35 个场景词里目前「仅词典」的 16 条，**开 `publication.learning`**。
2. **未审的排后面**：词书视图按 `meaningTrust()` 两段式排序，`human_reviewed` 在前，`machine_drafted` 在后。
3. **多义词保留原义、追加场景义**，不删词典义 —— 词书同时是词典，砍掉词典义会让「查」这条腿瘸。

## 先读

1. `docs/PLAN-execution-2026-08-22.md` §2B、§3、§4
2. `staging/convenience-meaning-review.json` —— 上一批备好的 35 条对照表（**本批要用它**）
3. `src/features/wordbank/meaningTrust.js` —— 已存在，本批直接复用，不要重写
4. `src/features/review/units.js` —— 只读，`mode:'produce'` 与 `origin` 都已经在了

---

## Commit 12 · 便利店释义修正 + 扩池（内容窗口，一次发布）

### 12a 释义修正（必做，且必须在扩池之前）

`staging/convenience-meaning-review.json` 里 19 条带 `suspiciousPoints`，分两类：

**A 类 · JMdict 未命中（13 条）** —— コンビニ・レシート・ごみ・レジ・ホテル・デパート・いくら・かかる 等。
未命中的原因是假名/片假名词按「词面+读音」join 匹配不上，**不是释义有问题**。释义无争议，**不用改**。

**B 类 · 多义词的场景义项（6 条）** —— 这批要改：

| 词 | 现在 | 便利店场景里是 | 怎么改 |
|---|---|---|---|
| **ポイント** | 要点，关键；分数 | **积分** | ⚠️ 场景义完全缺失，必须补。场景第一句就是「ポイントカードはありますか？」 |
| **カード** | 卡片；贺卡 | 积分卡 / 银行卡 | 场景义缺失，必须补 |
| 袋 | 袋子；（橘子等的）瓤 | 袋子 | 场景义已在，把它提到最前 |
| 現金 | 现金；现实，势利 | 现金 | 同上 |
| 払う | 支付；付钱 | 支付 | 同上 |
| 探す | 寻找；找 | 找（商品） | 同上 |

- **保留原有词典义，追加或前置场景义**。不要删任何已有义项。
- 改过的写 `meaning_zh_status: "human_reviewed"`。
- A 类那 13 条与其余未改的：**不写 `meaning_zh_status`**，让 `meaningTrust()` 的 fail closed 把它们判成 `machine_drafted`。这是对的 —— 没审就是没审。

### 12b 扩池

- 对象：这 35 个便利店场景词里目前 `publication.learning !== true` 的 16 条，**逐条判断**，有疑问的留下，不要无脑全开。
- `learningBasis` 写实话，例如 `scene_convenience_reviewed_2026-08-22`。**不要用 `legacy_*`** —— 那个前缀的含义是「把当前产品行为显式化」，不是「审过了」。
- ⚠️ **绝对不要碰 `yanFeatures`，不要给任何词加 `kanji_anchor`。**
  `anchorPool()`（`dailyTask.ts:310`）只取 `kanji_anchor` 的词，所以开了 `publication.learning` 这些词**也不会进今日任务** —— **这是设计，不是 bug**。
  便利店词的进入路径是「场景 → 入袋 → 复习」，不是「今日任务学新词」。
  `kanji_anchor` 的语义是「汉字跨语言记忆锚」，给 コンビニ / ポイント 加上去就是污染这个 feature 的定义。
- **预期副作用（不是错误）**：`publication.learning` 会从 563 变成约 579，而 `kanji_anchor.total` 仍是 563。
  这两个数字现在是完全重合的，本批之后**第一次分家**。在报告里写清楚。

### 12c 发布

1. 两份文件同步并**在同一 commit 里提交**（见上面的教训）
2. `_meta.version` 2.2 → 2.3，`_meta.updated` 跟上，changelog 追加
3. `bash tools/check-content-release.sh` → Blocker 必须 0
4. `bash scripts/push-content.sh`
5. 回读 `git show origin/main:content.v2.json` 确认线上是 2.3、`publication.learning` 是新数字

### 验收

- `node scripts/content-stats.mjs`：`publication.learning` ≈ 579、`kanji_anchor.total` **仍是 563**、`tags.scene.effective.convenience` 仍是 35、其余数字不变
- `npm test && npm run typecheck` 全绿
- 线上回读确认

### 回滚

单 commit revert **+ 回滚远端包**（两步）

---

## Commit 13 · L-T2b 词书默认视图（两段式）

- 文件：`App.js` 的 `WordBankScreen`；复用已有的 `sceneWords.js` 与 `meaningTrust.js`
- 做：默认视图从 8005 条大词典改为「口袋（本批还没有 → 退化为场景词）」；场景词按 `meaningTrust()` 两段式排 —— `human_reviewed` / `editorial_published` 在前，`machine_drafted` 在后
- **绝不删除**：搜索、全量词库入口、五本 N5–N1 词书入口、「全部/未学/学习中/已掌握」四个筛选、「仅词典」标记
- 不新增 Tab，不拆 `App.js`
- 验收：搜索仍可用；全量词库两步内可达；进度键格式零改动；`npm test && npm run typecheck`
- 回滚：单 commit revert

## Commit 14 · L-T3 口袋（数据与列表）

- 文件：`src/lib/storage.js`（登记新键）、新增 `src/features/wordbank/pocket.js` + 测试、`App.js` 一个入袋动作
- 做：入袋 / 移出 / 读盘归一。**只做数据与列表**
- ⚠️ 入袋词进 SRS 时**沿用裸键 `词-读音`，不加前缀**（加了等于所有人进度归零）
- **绝不做**：云朵动画、表情、成长、角色、世界观、任何装饰
- 验收：入袋 → 杀进程 → 重开仍在；`writeGuard` 拦截落盘时界面**不显示成功**；新键在 `storage.js` 登记；老用户进度零变化
- 回滚：单 commit revert（残留键读不到即空，无害）

## Commit 15 · L-T4 选词拼句

- 文件：新增 `src/features/review/produceChoices.js` + 测试、`ReviewScreen.js` 一个渲染分支
- 做：只对已有的 `mode:'produce'` 单元启用（场景句 69 + 地铁句 16 + 深卡骨架，现成 85+ 条）。把 `answer` 切成词块 + 干扰项，干扰项从同场景词里取
- **绝不做**：不新增内容字段；**不接 AI 自由判断**（答案是有限集，机器比对）；不改 `units.js`；不改 `srs.js`；不对 `recall` 单元启用
- 验收：纯函数测试覆盖「词块唯一」「干扰项不与正确块重复」「**只有 1 个词块时降级回自评**」；答错走现有 `lapses`；`recall` 复习行为逐像素不变
- 回滚：单 commit revert，复习页退回自评

## Commit 16 · L-T5 复习卡回场景

- 文件：`ReviewScreen.js`、`App.js` 场景跳转挂接点
- 做：`origin` 字段**已经存在**（`units.js` 每条都带），做成可显示 / 可点，跳到对应场景并定位那一句
- 验收：`origin` 为空时**不显示按钮**（不给假入口）；跳转后可返回且复习队列当前位置不丢
- 回滚：单 commit revert

---

## 不变量（每个 commit 都要守）

- **不改 `yanFeatures`**，不给任何词加 `kanji_anchor`
- 不改 `anchorPool()` 的语义，今日任务的池子仍是 563 条
- 不改进度键格式（裸的 `词-读音`）
- 不改 `srs.js` 评分、不改 `units.js`、不改 `publication.ts` 结构、不改 `contentSchema.ts`
- 不拆 `App.js`，不许顺手重构
- 用户可见文案不出现 `candidate` / `draft` / `zh_drafted` / `verified` / `human_reviewed` 等内部状态词 —— 要说就说人话
- 不删除第一、二批工单里列的任何旧功能
- 每个 commit：`npm test && npm run typecheck` 两条绿

## 做完写哪里

1. `docs/handoff/ACTIVE.md` —— 覆盖成本轮状态
2. `docs/handoff/CC-REPORT.md` —— 追加「PLAN v2 第三批」，必须包含：
   - commit 12 前后的 `content-stats.mjs` 对比，**特别说明 `publication.learning` 与 `kanji_anchor.total` 分家**
   - 16 条里最终开了几条、留下几条、留下的理由
   - B 类 6 条释义最终怎么改的（改前 → 改后）
   - 远端发布是否完成、线上回读结果
   - 拼句题的一个真实用例（哪句话、切成了哪些词块、干扰项是什么）
   - 你想改但忍住没改的地方

## 本批之后

闭环四个零件齐了。下一步不是继续加功能，是 `PLAN-execution-2026-08-22.md` §7 第 5 条：
**找一个没看过这个 App 的真人，不给任何解释，看他能不能 10 分钟走完「进场景 → 入袋 → 拼句 → 从复习跳回场景」。**
在那之前不要开 P1（第二个场景、第二种题型、词场内容）。
