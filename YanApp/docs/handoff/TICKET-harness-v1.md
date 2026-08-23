# 工单 · Harness v1（补两条 v0 的盲区）

> 先读 `AGENTS.md`。上一张：`docs/handoff/TICKET-harness-v0.md`（已完成）
> 本轮只扩 `scripts/audit.mjs`，**不新建脚本、不碰业务代码、不碰内容包**。

## 为什么

Harness v0 就位当天，`git status` 暴露了它抓不到的两件事：

**八份文档从 2026-08-22 起一直没进仓库**，只存在于工作区 ——
两份 audit、执行计划、前三批工单、真人测试脚本、35 词审校表。

而 `AGENTS.md` 和六张工单**全都引用它们**。也就是说任何人 clone 下来，
**整条引用链是断的：契约指向一堆不存在的文件。**

`npm run audit` 当时报 PASS。**这正是 harness 该管而没管的事。**

## 要做的：给 `scripts/audit.mjs` 加两个检查

### A. `doc-refs` —— 文档引用完整性

扫 `AGENTS.md`、`CLAUDE.md`、`RULE.md`、`SOUL.md` 与 `docs/**/*.md` 里的**相对路径引用**
（Markdown 链接 `[x](path)`、行内反引号里的路径、以及正文里出现的 `docs/xxx.md` 形式）。

对每个指向仓库内文件的引用：

| 情况 | 判定 |
|---|---|
| 文件不存在 | 🔴 **FAIL** |
| 文件存在但 **不在 git 里**（`git ls-files` 查不到） | 🔴 **FAIL** ← 今天这个坑 |
| 文件存在且已跟踪 | PASS |

⚠️ **注意排除**：外部 URL（`http://` / `https://`）、锚点（`#xxx`）、
明显是示例路径而非真实引用的（例如代码块里演示用的 `src/foo/bar.js`）。
**宁可漏报也不要误报** —— 一个天天喊狼来了的检查等于没有检查。

判断「是不是真实引用」的建议判据：路径以 `docs/` / `src/` / `scripts/` / `tools/` / `staging/` 
开头，或以 `.md` 结尾，且不在 ``` 围栏代码块内。

### B. `workspace-clean` —— 文档不该躺在工作区外

| 情况 | 判定 |
|---|---|
| `docs/` 下有未跟踪的 `.md` | 🟡 **WARN**（列出文件名）|
| 仓库根的 `AGENTS.md` / `CLAUDE.md` / `RULE.md` / `SOUL.md` 未跟踪 | 🔴 **FAIL** |

用 WARN 而不是 FAIL，是因为写作过程中出现临时草稿是正常的 ——
但它必须**被看见**，不能像这次一样躺两天没人发现。

## 明确不做

- ❌ 不新建脚本文件，只扩 `scripts/audit.mjs`
- ❌ 不改业务代码（`App.js`、`srs.js`、`units.js`、`publication.ts`、`dailyTask.ts`、`ReviewScreen.js`）
- ❌ 不碰 `assets/content.fallback.json` / `yan-content/content.v2.json`
- ❌ 不做 `docs/ai-contracts/`
- ❌ 不改 v0 已有的检查逻辑（`user-claims`、`content-pack-sync`、三条不变量断言）
- ❌ 不自动修复（不 `git add`、不删文件）—— **审计只报告，不动手**

## 验收

1. `npm run audit` 在当前 HEAD 上：**FAIL 0**（八份文档已于 `3776d97` 补交，现在是干净的）
2. **人为验证 A**：临时把 `AGENTS.md` 里某个引用改成一个不存在的路径 → FAIL 且 `exit 1`，
   改回来，**不要提交那个改动**
3. **人为验证 B**：临时 `touch docs/_tmp.md` → WARN 列出它，删掉
4. 脚本仍**不写任何文件**（跑两次 `git status` 干净）
5. `npm test && npm run typecheck` 仍绿

## 回滚

单 commit revert。

## 做完写哪里

1. `docs/handoff/ACTIVE.md` —— 状态更新
2. `docs/handoff/CC-REPORT.md` —— 追加「Harness v1」：
   - 新的 `npm run audit` 完整输出（新基线）
   - 两次人为验证的结果
   - **`doc-refs` 扫到了多少条引用**（数量本身有信息：太少说明判据太严，太多说明在扫代码块）
   - 你想加但本轮没加的检查项（留给 v2）
