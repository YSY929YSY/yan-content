# 工单 · PLAN v2 第九批（消灭静默降级 + token column 三槽位）

> 先读 `AGENTS.md`（**第六节：交报告前跑 `git status --short` 和 `npm run audit`，贴原始输出**）。
>
> **B9-1 必须先做完再做 B9-2** —— B9-2 的样板要靠 B9-1 修好的数据才看得出对不对。

---

## B9-1 · 把「偷偷加载」改成依赖注入（🔴 先做）

### 现象

真机上「一起出现」那行，`カード` 和 `見せ` 底下是空的。
而用同一份数据在 Node 里显式传映射表算，两个都有中文：

```
カード → 积分卡/银行卡，卡片
見せ  → 给……看，展示
```

构建确实包含了 `f2ed5e7`（已核 commit）。**代码里有、屏幕上没有。**

### 根因

同一份 JSON，两种加载方式：

| 文件 | 怎么加载 | 表现 |
|---|---|---|
| `App.js:65` | `import EXAMPLE_TOKENS from './assets/example_tokens.json'` | ✅ 真机上假名正常 |
| `wordFieldAlignment.js:29` | `require('../../../assets/example_tokens.json')` | ⚠️ gloss 有空白 |

而 `wordFieldAlignment.js:28` 写着：

```js
if (typeof require !== 'function') return new Map();   // 静默返回空
```

**失败不报错，只是少显示几个词。** 这正是这个项目栽过四次的形状：
「读不到」和「没有」长得一样（见 `AGENTS.md` 不变量第 4 条 fail closed）。

### 要做的

**不要加断言去守它 —— 把这条路径拆掉。**

1. `wordFieldAlignment.js` **删掉 `require` 和 `loadBundledDictionaryForms`**，
   改为导出一个纯函数，例如 `dictionaryFormsFrom(exampleTokens)` —— 输入 token 表，输出 surface → 辞书形的 Map
2. `buildWordFieldAlignment` 的第三个参数**不再有默认值**（或默认空 Map 但**调用方必须显式传**）
3. `App.js` 用**已经 import 好的** `EXAMPLE_TOKENS` 构建这张表，**memo 一次**（不要每次渲染重建，
   1083 条 × 每个词卡渲染 = 白烧），然后传给 `buildWordFieldAlignment`

**为什么这样比加断言好**：生产走的是**已被证明可用**的那条 `import`，测试走同一个纯函数，
「模块内部偷偷加载」这条路径**从结构上消失**，不需要守卫去看着它。
这也和这个仓库的一贯做法一致 —— `units.js`、`dailyTask.ts` 都是纯函数收数据，不自己去拿。

### 守卫（这一条仍然要加）

新增测试：把**真实的** `assets/example_tokens.json` 喂给 `dictionaryFormsFrom`，
断言 **Map 非空且规模合理**（当前实测 1083 条）。

这条守的不是「加载方式」，是「**那份数据本身还在、还是三元格式**」——
以后重跑管线格式变了，这条会红。

### 验收

- `grep -n "require(" src/features/wordbank/wordFieldAlignment.js` **无命中**
- 新测试：真实 JSON → Map 规模 ≥ 1000
- 20 条词场句覆盖率仍是 **133/133**（跑之前先确认基线，别只看数字对不对）
- **真机上 `店員にカードを見せます。` 六个 token 全部有中文** ← 这条只能构建后验，
  报告里如实写「待真机验证」，不要写成已验证
- `npm test && npm run typecheck && npm run audit`

---

## B9-2 · token column 补第三个槽位 + 统一渲染器（样板只做两句）

### 现状：已经是 column，但只有两格

`App.js:2494` 那段**已经是 token column 结构**，不是靠 margin/空格拼的：

```jsx
<View style={wfAlignRow}>            // row + wrap
  {tokens.map(token => (
    <View style={wfAlignToken}>      // ← 每个 token 一个纵向列
      <Text>{token.jp}</Text>
      <Text>{gloss}</Text>
    </View>
  ))}
</View>
```

**缺的是第一格：读音。**「一起出现」整段没有假名；而例句那边有假名却没有 gloss。
**两套渲染器，各有一半。**

### 要做成什么样

每个 token 一列，列内三格，**缺哪一格就留空槽位，不能让其它内容顶上来**：

```
[店員]     [に]      [カード]   [を]     [見せ]    [ます]
てんいん    （空）     （空）     （空）    み        （空）     ← 读音
店員        に        カード     を       見せ      ます       ← 日语
店员        向/于     卡         宾语     出示      礼貌       ← gloss / 语法作用
```

**验收标准只有一条**：屏幕上垂直往下看，`を` 正下方就是「宾语」，`ます` 正下方就是「礼貌」，
`店員` 上方的 `てんいん` 和下方的「店员」属于同一列；**换屏宽、换前面词长都不漂移**。

### 硬规则

- ❌ **不许**用手工空格、按字符数算 `marginLeft`、为某一句写死位置
- ❌ **不许**再做「一整行 gloss 去猜日文位置」
- ✅ 横向排的是 token column，纵向排的是同一个 token 的 读音 / 日语 / gloss
- ✅ 语法作用（宾语/礼貌/场所）**属于它自己那个 token**，视觉上仍按 `source` 降权
  （B7 已做对，别退回去）

### 统一渲染器

**例句和「一起出现」必须建在同一个 token renderer 上**，只是例句卡可以**隐藏 gloss 那一格**。
否则以后是两套对齐系统要维护，而 `日本で買ったカメラを友達に見せます` 这种长句会把
现在那套 ruby 拼法压垮。

⚠️ 例句现在的假名对齐由 `furigana.ts` 在渲染时算 —— **规则只该有一份实现**
（`exampleTokens.ts` 顶部注释写着为什么）。统一渲染器要复用它，不要另写一套。

### 范围（不要越界）

**样板只做这两句**：

```
店員にカードを見せます。
店員にサイズを聞きます。
```

**不推全库、不改内容包、不动其它例句。** 排版成立了再谈推广。

### 动手前先说清楚

⚠️ **实现前先在报告里写出：现在这块的 View 层级是什么，你准备怎么改成三槽位 column。**
不要直接开始调样式 —— 这一条是项目负责人明确要求的。

### 验收

- 两句样板：三格垂直严格同列，缺格留空不顶位
- 换屏宽（横竖屏 / 不同机型宽度）不漂移
- 例句和词场走同一个 renderer，例句隐藏 gloss 格
- `npm test && npm run typecheck && npm run audit`

---

## 不变量

照 `AGENTS.md`。本批特别相关：

- 本批**不碰内容包**（`content.fallback.json` / `content.v2.json`）
- 不改 `units.js` / `srs.js` / `publication.ts` / `dailyTask.ts`
- 不改 `furigana.ts` 的对齐规则（复用，不重写）
- 不许顺手重构；不许顺手改「言」按钮层级、灰阶、离线 banner（**是独立的事**）
- 组件改 props 时不要删掉正在用的回调（`propDestructure.test.mjs` 会拦）

## 做完写哪里

`ACTIVE.md` + `CC-REPORT.md`，并贴 `git status --short` 和 `npm run audit` 原始输出。

报告里要有：
- B9-1：`require` 是否已彻底移除、Map 规模、覆盖率、**哪些是「待真机验证」**
- B9-2：**动手前的 View 层级说明和改造方案**（这条是要求，不是可选）
- 两句样板的最终结构描述
- 你想改但忍住没改的地方

## 本批之后

样板成立才谈推广到全部例句。**不要在本批顺手推全库。**
