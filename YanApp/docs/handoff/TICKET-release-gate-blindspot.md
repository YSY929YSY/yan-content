# 工单 · 发布闸门审磁盘、发布脚本发提交（M4，最高优先）

> 先读 `AGENTS.md`（第五节 5-1~5-5）。
> **本轮不碰内容包、不改同步链。只改闸门脚本与它的测试。**
> **⚠️ 修完之前不要跑 `scripts/push-content.sh`。**

## 本轮决策指标（5-4）

**在"磁盘与 `develop/v2` 提交不一致"时，闸门是否报 Blocker：否 → 是。**

## 这张工单把主线推迟多久

**不推迟，且必须最先做。** 它挡住的是一次不可逆的线上错误发布。

## 事实（我已复算，此刻的仓库状态，不是构造的）

```
$ git branch --show-current
content/2026-08-27-wordfield-lv49

$ git hash-object yan-content/content.v2.json YanApp/assets/content.fallback.json
bb964fd2259a3ade92ebad18e0b310d63ae6e9e9
bb964fd2259a3ade92ebad18e0b310d63ae6e9e9      ← 磁盘两份一致

$ git rev-parse develop/v2:yan-content/content.v2.json
cf8995085a21b68608979400a9edd1aaaf6c87c3      ← push 实际发的是这一份

develop/v2 提交里 200 条词场，磁盘 249 条，差 49 条
```

**闸门此刻报 Blocker 0 并提示「下一步：bash scripts/push-content.sh」。**

### 根因：两个脚本看的不是同一份东西

```
tools/check-content-release.sh:27
  diff -q yan-content/content.v2.json YanApp/assets/content.fallback.json   ← 磁盘 vs 磁盘

scripts/push-content.sh:45
  git show develop/v2:yan-content/content.v2.json                            ← develop/v2 的提交
```

闸门**从头到尾没有检查当前分支是不是 `develop/v2`**，也没比对过磁盘与 `develop/v2` 提交。

这正是 2026-08-22 那次事故的**变种**：那次是"磁盘一致但没提交"，
`AGENTS.md` 第二节据此加了双份文件规矩 —— **但规矩只管了提交，没管"提交在哪条分支上"**。
内容分支规矩（2026-08-26 加的）反而让这个盲区更容易被踩到：
现在改内容包本来就该在 `content/*` 分支上做。

## 要做的

### 1. 闸门必须比对 `develop/v2` 提交

`tools/check-content-release.sh` 增加 Blocker 级检查：

- `git rev-parse develop/v2:yan-content/content.v2.json` 与
  `git hash-object yan-content/content.v2.json` **必须相同**，否则 Blocker
- 同理比对 `YanApp/assets/content.fallback.json` 与
  `develop/v2:YanApp/assets/content.fallback.json`
- **当前分支不是 `develop/v2` 时，明确报出来**（可以是 Blocker，也可以是
  "只允许在 develop/v2 上跑发布闸门"—— 你选一种并说明理由）

报错信息要**直接告诉人下一步做什么**（例如"当前在 content/xxx 分支，
先合回 develop/v2 再跑"），不要只报不一致。

### 2. `push-content.sh` 自己也要有护栏

它取的是 `develop/v2` 的提交，但**没有确认那份就是操作者以为要发的那份**。
加一道：发布前打印 `develop/v2` 那份的**词条数与词场数**，要求人工确认（或 `--yes` 跳过）。

**不要改它的取数逻辑**（取已提交的那份是对的，那是 2026-08-22 的教训）。

### 3. 同一盲区污染了护栏测试

`src/lib/__tests__/wordIds.test.mjs:27-28` 读的也是**磁盘**两份文件。
「两份词库分叉了没人会发现」这条测试同样看不到 `develop/v2` 提交。

补一条测试：**磁盘与 `develop/v2` 提交不一致时必须失败**。
在非 git 环境（CI 浅克隆）下要能优雅跳过而不是误红 —— 写明你怎么处理的。

### 4. 变异验证（必须做）

**当前仓库状态本身就是一个天然的失败样本**：在 `content/2026-08-27-wordfield-lv49`
分支上，修好的闸门**必须报 Blocker**。把这个作为验收证据贴进报告。

## 明确不做

- ❌ **不跑 `scripts/push-content.sh`**
- ❌ 不碰内容包、不合分支（合不合由负责人定）
- ❌ 不改同步链（M1/M2/M3 另有工单）
- ❌ 不改 `push-content.sh` 的取数逻辑

## 验收

- 异常自查（5-2）；数字附复算命令（5-1）
- **决策指标**：在当前分支上跑修好的闸门，**必须报 Blocker**，贴原始输出
- 合回 `develop/v2` 之后再跑一次，**必须 Blocker 0**（可用临时 worktree 验证，不要真合）
- 新增测试的变异验证：改坏什么 → 哪条转红
- `npm test && npm run typecheck && npm run audit`，`git status --short` 干净

## 做完写哪里

`ACTIVE.md` + `CC-REPORT.md`（直接追加末尾 —— 5-5）。
