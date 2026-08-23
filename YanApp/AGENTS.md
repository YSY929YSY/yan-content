# 给 AI 执行者的契约（Codex / Claude Code / subagent）

> **这份文件只写「边界」，不写「怎么做」。** 规则各有各的家，这里只给指针 —— 
> 一条规矩有两处写法，就一定会漂开（见 `src/features/kana/useKanaGate.js` 开头那段）。

## 先读什么

| 你要做的事 | 读哪份 |
|---|---|
| 产品身份、moat、永不做 | `CLAUDE.md` |
| 工程操作：发版、EAS、路由、词书架构 | `RULE.md` |
| 审美、词卡九标准、例句规则、中文语感 | `SOUL.md` |
| **现在这一轮在做什么** | `docs/handoff/ACTIVE.md` ← **每次先看这个** |
| 已经拍板的产品决定（含理由） | `docs/handoff/DECISIONS.md` |
| 当前工单 | `docs/handoff/TICKET-*.md`（`ACTIVE.md` 会指出是哪一张） |
| 学习线现状与硬规矩 | `docs/HANDOFF-learning.md` |

**没有工单就不要写代码。** 先问，或先读 `ACTIVE.md`。

---

## 一、不变量（任何一轮都不许破，工单不用再抄一遍）

1. **进度键格式不变**：`unitKey('word', …)` 永远是裸的 `词-读音`，不加前缀。
   改了等于所有线上用户的学习进度一夜归零。别名折算在 `srs.normalizeProgress` 读盘时做完。
2. **`kanji_anchor` 是 563 条**。不给任何词加这个 feature —— 它的语义是「汉字跨语言记忆锚」，
   给片假名词加上去就是污染 moat 的定义。首页主 CTA 的池子靠它。
3. **不改评分算法**：`src/features/wordbank/srs.js` 的 Leitner 阶梯与三档评分。
   可以改「什么时候调用它」，不能改「它怎么算」。
4. **fail closed**：任何新增判断，缺字段一律返回最保守的值。
   `publication` 缺失 = 不可学；`meaningTrust` 缺字段 = 机器稿；`writeGuard` 读不到 = 不许写。
   这个项目栽过四次的形状都是把「不知道」当成了「可以」。
5. **不拆 `App.js`**。那是 ROADMAP 工作包 5，是独立的事，不许顺手做。
6. **不许顺手重构**。看到烂代码写进报告，不要改。
7. **用户可见文案里不出现内部状态词**：`candidate` / `draft` / `zh_drafted` / `verified` / 
   `human_reviewed`。要说就说人话。
8. **不许宣称证明不了的事**：「高频」「官方」「必考」「已核验」——
   除非有可定位的来源。理由见 `docs/AUDIT-source-trust-2026-08-22.md`。
9. **`tags.scene` 是 product_taxonomy，不是事实断言**。它不需要来源、不进 claim/evidence 流程。
   别让 source-audit 的标准误伤它。
10. **新增测试必须放在 `__tests__/` 目录下**。有守卫（`src/lib/__tests__/testsAreRun.test.mjs`），
    放错地方会红 —— batch3/4 有两个测试文件因此从没被跑过。

---

## 二、文件锁

### 🔒 `assets/content.fallback.json` —— 全局互斥

**同一时间只能有一个任务持有。** 多个内容改动排成一个「内容窗口」，串行做完，窗口结束发一次远端包。

改它的时候**必须在同一个 commit 里同时改两份文件**：

```
YanApp/assets/content.fallback.json
yan-content/content.v2.json          ← 漏过一次，见下
```

提交前 `shasum -a 256` 确认两份逐字节相同（审计有这条硬要求）。

**为什么**：`scripts/push-content.sh` 取的是 `git show develop/v2:yan-content/content.v2.json`——
**已提交的那份**。2026-08-22 只改了 fallback、没提交 content.v2.json，结果两份文件在磁盘上
逐字节相同、审计 Blocker=0、测试全绿，**而权威副本停在旧版本，照那样发布线上拿到的是旧包**。

### ⚠️ `App.js` —— 代码级共享文件

两条线都会碰它，但位置通常不重叠。**不要让两个 subagent 同时写它**，按 commit 顺序串行落地。

### 📖 只读，不许改

`srs.js`（评分）· `units.js`（五来源归一）· `publication.ts`（发布契约）· 
`contentSchema.ts`（运行时形状闸门，**新增可选字段不需要改它**）· `sourceAudit.ts` · 
`keyAliases.js` / `wordIds.manifest.txt`（进度键保护）· `staging/**`（除工单明确指定的产出）

---

## 三、并行规则

| 能并行 | 不能并行 |
|---|---|
| 不同文件的纯函数 + 测试 | 任何两个改 `assets/content.fallback.json` 的任务 |
| 各自产出 `staging/` 报告的只读分析 | 两个都写 `App.js` 的任务 |
| 文档 / 统计脚本 | 内容窗口里的任何两步 |

**subagent 可以并行分析，但写内容包必须合成一个 commit。**

---

## 四、每个 commit 的完成标准

```bash
npm test && npm run typecheck
```

两条都绿才算完。commit message 写**为什么**，不是写改了什么
（`docs/HANDOFF-learning.md` 硬规矩第 5 条）。

改了内容包的，另外还要：`_meta.version` 递增（整个窗口只递增一次）+
`bash tools/check-content-release.sh` Blocker=0 + 发布后回读验证。

---

## 五、报告模板（做完写哪里）

1. **`docs/handoff/ACTIVE.md`** —— 覆盖成本轮状态：当前工单是哪张、各步完成情况、还剩什么、下一步。
2. **`docs/handoff/CC-REPORT.md`** —— 追加一节，必须包含：
   - 每个 commit 的实际改动范围与 hash
   - **改了内容包的，附前后 `node scripts/content-stats.mjs` 的对比**（哪些数字变了、为什么）
   - 与工单不符的事实（工单里的数字是实测的，但只测过本地 fallback；对不上以你实测为准并写清楚）
   - **你想改但忍住没改的地方**
3. **`docs/handoff/DECISIONS.md`** —— 只在产生了新的产品/事实裁决时追加，附可复算依据。

## 六、诚实要求

- 跑不到的测试不算通过。手动单独跑的要写明「手动单独跑」。
- 「已完成」和「待项目所有者执行」要分清（尤其 SQL 迁移、远端发布）。
- 不要用「已验证」形容只是「跑通了」的东西。
- LLM 产出只能是 candidate，**不能直接进 `publication`**。两个模型一致不是两个来源。
