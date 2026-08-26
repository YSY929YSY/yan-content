# 当前状态 · JP-13 换句落库（内容窗口已完成）

> 更新日期：2026-08-27

## 当前工单

`docs/handoff/TICKET-wordfield-land-jp13.md` ← **已完成；不发布**

13 条已通过审核的 JP 换句已落入两份内容包；没有推 `origin/main`，没有构建或 OTA。

## 到这里为止发生了什么

JP-22 的 15 条可用换句中，按负责人裁决落库 13 条；`n5_futari`、`n5_sora` 仍不落库。
当前词场从 **187 → 200 / 563**，Tatoeba 词场从 **167 → 180**。

复算：

```bash
node scripts/content-stats.mjs | grep '^  wordField'
node --input-type=module -e 'const c=require("./assets/content.fallback.json"); console.log(c.wordBank.filter(w=>w.wordField?.source?.provider==="Tatoeba").length)'
```

内容与测试 commit：`656a507`。版本从 `2.6 → 2.7`，29 个成员引用按候选句复算；
`n5_iro` 的 `暗い` 没有被 `dictionaryFormsFrom(example_tokens)` 唯一还原，按 fail closed 不写。
两份内容包 SHA 相同：

```bash
shasum -a 256 assets/content.fallback.json ../yan-content/content.v2.json
```

成员审计使用 `dictionaryFormsFrom(example_tokens)` 注入辞书形后为 0 错误；Tatoeba gloss
实测为 **1,141 / 1,185（96.29%）**，仍高于 95% 下限。复算：

```bash
node --test src/features/wordbank/__tests__/wordFieldAlignment.test.mjs
```

## 排队中的工单（本轮做完再动，不要并行改内容包）

| | 工单 | 说明 |
|---|---|---|
| 1 | `TICKET-wordfield-zh-38.md`（**待写**） | 38 条中文，日语不动 |
| 2 | `TICKET-wordfield-lv-67.md`（**待写**） | 先重定判据再处理 |
| 4 | `TICKET-mishit-after-value.md` | gloss 误命中率修复后值，已写未发 |
| 5 | `TICKET-correction-entry-minimal.md` | 纠错入口，已写未发 |

## LV 67 条：判据要重定（重要）

外部审核用的判据是「适合作 **N5 主例句**」—— **这个判据是外部给的，不是项目标准。**

项目自己的标准是 `SOUL.md:115`：**目标词突出、短、真实、中文自然、适合朗读跟读**，
以及词卡九标准第 1 条「**真实 —— 不是课本造的**」。

**「超出 N5」不在标准里，「真实」才在。** 按 N5 语法严格过滤，剩下的正好是课本句。
所以这 67 条**多数不该换**，要拆成两类重判：

- **词汇超纲**（`茹でる` `金髪` `小枝`）→ 落，gloss 逐块理解本来就是兜这个的
- **结构超纲且句子长**（复合动词叠敬语、`〜のは〜危険だ`）→ 违反标准里的「短」，换

## 一个未解决的结构问题（记着，不急）

`docs/content-standard-wordfield.md:124` 写的是「**手工精选**两三百个词写词场」。
我们做的是自动选句管线。外部审核标出 47%，某种程度上正是
「自动化替代了手工精选」的可预期结果。**这条以后要正面回答，本轮不处理。**

## 不做

- 不发布、不推 `origin/main`（**merge 到 main = 推线上**）
- 不构建、不发 OTA
- 不改任何一条句子的日文或中文
- 不并行任何其他内容包改动（内容窗口互斥）
