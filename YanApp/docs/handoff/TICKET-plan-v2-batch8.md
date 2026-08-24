# 工单 · PLAN v2 第八批（对齐释义：A 修渲染 / B 补辞书形）

> 先读 `AGENTS.md`（**特别是第六节：交报告前必须跑 `git status` 和 `npm run audit` 并贴原始输出**）。
>
> **A 和 B 碰完全不同的文件，可以开两个 subagent 并行。** 都不碰内容包。

## 背景：现在有两套渲染器，各有一半

| | furigana | 逐块中文 |
|---|---|---|
| **例句**（`ExampleSentence`，`App.js:2482`） | ✅ | ❌ |
| **一起出现**（`buildWordFieldAlignment`，`App.js:2494`） | ❌ | ✅ |

最终方向是四层对齐（读音 / 日语原句 / 逐块理解 / 自然中文），
但**本批只做前置的两件事**，合并渲染器是 C，**不在本批**。

---

## A · 修渲染（`App.js` 样式 + 视觉分层）

### A-1 日语基线是断的（🔴 先修这个）

**现象**：真机上「一起出现」那行里，`現金`、`払い` 比 `レジ`、`で` **矮一截**，句子读起来是散的。

**根因**（不是「语法标签插进句子」，是这两行）：

```js
wfAlignToken: { ..., minHeight: 42, justifyContent: 'flex-end' }
{!!token.zh && <Text style={wd.wfAlignZh}>{token.zh}</Text>}
```

没有中文的 token **只渲染日语一行，然后被 `flex-end` 顶到 42px 盒子底部**；
有中文的 token 是日语在上、中文在下。于是日语的基线随「有没有 gloss」上下跳。

**修法**：让日语那一行**永远在同一条基线上** —— 中文那格始终占位（哪怕是空的），
或者改成从顶部对齐。**不要靠 `minHeight` 硬撑。**

**验收**：一句话里所有日语 token 的顶边对齐；有中文和没中文的 token 混排时基线不跳。

### A-2 现在会把语法关系教反（🔴 这是正确性问题，不是审美）

**现象**：排版让人读成「**現金 = 宾语**」，而事实是「**を = 宾语**」。
一个学习产品把语法关系教反，比排版难看严重。

**要做的**：把「词义」和「语法作用」在视觉上分开。

**好消息：数据层已经有了。** `wordFieldAlignment.js` 的每个 token 都带 `source`：

| `source` | 是什么 | 怎么显示 |
|---|---|---|
| `wordBank` | **词义**（收银台 / 钱 / 现金） | 正常字号，中灰 |
| `grammar` | **语法作用**（宾语 / 场所 / 礼貌） | 更小、更浅，或轻量胶囊 |
| `blank` | 查不到 | 不显示，也不占视觉重量 |

- 顺带**去掉现在语法项文案里的括号**（`（宾语）` → `宾语`）—— 括号是在用标点做视觉分层，
  改用字号和颜色做，更干净
- ⚠️ **不要把标签改写成句子。** `SOUL.md`「气质不靠文案表演」：短、明确、低解释成本

**验收**：一眼能看出「宾语」属于 `を` 而不属于 `現金`；三类 token 视觉权重依次递减。

### A 明确不做

- ❌ 不动例句的渲染器（`ExampleSentence`）—— 合并两套是 C
- ❌ 不加「读音辅助：完整/假名/极简」这类设置项 —— 那是把设计难题推给用户，样板阶段固定一种
- ❌ 不顺手改「言」按钮层级、灰阶、离线 banner —— 都是有效观察，但**是三件独立的事**
- ❌ 不改 `C`（颜色常量）和已有的 `ls/wb/wd` 样式（`RULE.md`）

---

## B · 补辞书形（内容管线 + 查词层）

### 为什么从「可惜」变成「前置条件」

现在逐块中文覆盖 86.5%，**空的 18 个全是动词词干**（`払い` / `探し` / `入れ` / `会い`…）。

单看一行小灰字还能忍；一旦做成四层对齐，**洞恰好开在实义词上** ——
`払い` 那一格空着，而它是整句的核心。所以 A 做完，B 不做，四层就立不住。

### 要做的

1. **`scripts/build-example-tokens.py`**：第 132-134 行已经在调 `m.surface()` 和 `m.reading_form()`，
   加 `m.dictionary_form()`。**只在与 surface 不同时存**（省进包体积 ——
   文件注释里写着「每个字段名都要付一次进包的运费」）
2. **`src/features/wordbank/exampleTokens.ts`**：读取层加这个字段。
   ⚠️ 保持它现在的紧凑格式约定，别把结构改成一个字段名一份运费
3. **`src/features/wordbank/wordFieldAlignment.js`**：查词顺序加一级 ——
   **词面 → reading → 辞书形**
4. 重跑管线，产出新的 `assets/example_tokens.json`

### 环境（已确认，不用自己找）

- SudachiPy **0.6.11 已装**，`sudachidict_core` 可用
- 现有产物：`assets/example_tokens.json`，520 KB，4400 句

### ⚠️ 这不是内容包

`assets/example_tokens.json` 是**打进 App 包的 asset**，不是远端 `content.v2.json`。
所以：**不走 `push-content.sh`，改了要重新构建才生效**。
`content-pack-sync` 那两条断言与它无关，不要去动。

### 验收

- **报告里给出覆盖率变化**：现在 86.5%（18 个动词洞），做完是多少
- 留空的仍然**留空，不猜**（`DECISIONS.md`「多源与人工的边界」）
- `assets/example_tokens.json` 的体积变化写进报告 —— 涨太多要说明
- `npm test && npm run typecheck && npm run audit` 全绿
- 20 条词场句里，`払い` / `探し` / `入れ` 这类**动词位置有中文了**

---

## C · 合并两套渲染器（**本批不做**）

四层对齐（逐 token 罗马音 + furigana + 逐块理解 + 自然中文）依赖 A 和 B 都完成。
届时**只在 2-3 个词上做样板，不推全库**。

不要在本批顺手开始它。

---

## 不变量

照 `AGENTS.md`。本批特别相关的：

- 本批**不碰** `assets/content.fallback.json` / `yan-content/content.v2.json`
- 不改 `units.js` / `srs.js` / `publication.ts` / `dailyTask.ts`
- 不许顺手重构；新增测试必须在 `__tests__/` 下
- 组件改 props 时**不要删掉正在用的回调**（`propDestructure.test.mjs` 会拦，但先别撞它）

## 做完写哪里

`ACTIVE.md` + `CC-REPORT.md`，**并按 `AGENTS.md` 第六节贴 `git status --short` 和 `npm run audit` 的原始输出**。

报告里要有：
- A：修完之后基线对齐的说明（最好描述一下三类 token 的最终视觉权重）
- B：覆盖率前后对比、体积变化、留空的还剩哪些
- 你想改但忍住没改的地方
