# 工单 · Harness v0（`npm run audit`）

> 上位文件：`AGENTS.md`（先读）
> 这一张**插在第六批之前**。第六批的三个风险恰好是这条命令能挡的。

## 为什么现在做

`docs/handoff/TICKET-plan-v2-batch6.md` 要做的事里有三个「机器一秒能拦、人容易忘」的点：

1. 开 N4 的池会改 `publication.learning`（579 → 1000+），需要 before/after 对比
2. **绝不能碰 `kanji_anchor`**（必须仍是 563）—— 现在只靠工单里的一行字
3. 两份内容包必须逐字节相同 —— batch3 漏过一次，差点发了旧包

## 本轮只做一件事

新增 **`npm run audit`** —— 一条只读命令，把已有检查串起来，补两个新的，加不变量断言。

**不实现** GPT 提案里的 `docs/ai-contracts/` 六件套。理由：那六份里五份已经有家
（`RULE.md` 第 129 行那节就是 agent 契约），再加六份会制造「两处真相」。
契约已收敛到 `AGENTS.md` 一份。

---

## 要做的

### 新增 `scripts/audit.mjs`（只读，不写任何文件）

**串起已有的**（不要重写它们，调用或复用）：

| 已有 | 位置 |
|---|---|
| 内容统计 | `scripts/content-stats.mjs` |
| 内容结构校验 | `scripts/validate-content.js` |
| 释义体检 | `scripts/meaning-audit.mjs` |

**新增两个检查**：

**A. `user-claims` —— 用户侧断言扫描**

到现在还是手动 `grep`。扫 `App.js` 与 `src/features/**` 里**会被渲染成用户可见文案**的字符串：

- 🔴 FAIL：出现 `候选` 类内部状态词 —— `candidate` / `draft` / `zh_drafted` / `verified` / `human_reviewed`
- 🔴 FAIL：用于描述**词库**的「高频」「官方」「必考」「已核验」
- 🟡 WARN：其它位置的「高频」（例如深卡的 `旅行高频` 标签，那是编辑判断，不是语料断言）

⚠️ 只扫**用户可见文案**，不要扫注释和变量名 —— 现在代码注释里大量出现 `zh_drafted`，那是对的。

**B. `content-pack-sync` —— 两份内容包一致性**

- 🔴 FAIL：`YanApp/assets/content.fallback.json` 与 `yan-content/content.v2.json` 的 sha256 不同
- 🔴 FAIL：`yan-content/content.v2.json` 有未提交改动（发布脚本读的是**已提交**那份）
- 🟡 WARN：`_meta.version` 与上次相比没变但内容变了

**不变量断言**（数字写死在脚本里，改动必须是有意的）：

| 断言 | 当前值 | 违反时 |
|---|---|---|
| `kanji_anchor` 总数 | **563** | 🔴 FAIL |
| `_meta.note` 里的词条数 == 实测 `wordBank.length` | 8005 | 🔴 FAIL |
| 两份内容包 sha256 相同 | — | 🔴 FAIL |
| `publication.learning` 计数 | 打印出来，**不断言**（会随开池变化） | — |

### 输出格式

每项一行 `PASS / WARN / FAIL`，末尾汇总。**有 FAIL 时 `exit 1`**，WARN 不影响退出码。

### 接进 package.json

```
"audit": "node scripts/audit.mjs"
```

---

## 明确不做

- ❌ 不新建 `docs/ai-contracts/`
- ❌ 不改任何业务代码（`App.js`、`srs.js`、`units.js`、`publication.ts`、`dailyTask.ts`）
- ❌ 不改 `assets/content.fallback.json` 或 `yan-content/content.v2.json`
- ❌ 不实现口袋、不实现拼句相关逻辑、不动 Source S0 文案
- ❌ 不重写已有的四个脚本，只串起来
- ❌ 不做 `audit:deep-cards` / `audit:produce-units` / `audit:scene-tags` 三个独立脚本 ——
  它们的数据 `content-stats.mjs` 已经在打印，本轮只需要在汇总里带上，不必各起一个脚本

## 验收

- `npm run audit` 在当前 HEAD 上跑通，**全部 PASS**（当前状态是干净的）
- 人为把 `kanji_anchor` 数字改错 → FAIL 且 `exit 1`（验证完改回来，**不要提交那个改动**）
- 脚本**不写任何文件**（跑两次，`git status` 干净）
- `npm test && npm run typecheck` 仍绿
- 新增的脚本本身不需要测试（它就是测试），但**不要放进 `__tests__/`** —— 它是脚本不是测试

## 回滚

单 commit revert。删掉 `scripts/audit.mjs` 和 package.json 里那一行即可，零影响面。

## 做完写哪里

1. `docs/handoff/ACTIVE.md` —— 状态改成「Harness v0 已就位，下一步 batch6」
2. `docs/handoff/CC-REPORT.md` —— 追加「Harness v0」：
   - `npm run audit` 的完整输出（这是以后所有对比的基线）
   - 故意制造 FAIL 的那次验证结果
   - 你想加但本轮没加的检查项（留给 v1）

## 之后

Harness v0 就位后，第六批的每一步前后都跑一次 `npm run audit`，
把输出贴进 CC-REPORT —— 尤其 B6-2 开池那一步。
