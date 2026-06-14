# 言工程规则手册

## 文件职责一览

```
YanApp/
├── App.js              主应用（代码逻辑、屏幕、样式）
├── app.json            Expo 配置（bundle ID、图标、插件）
├── eas.json            EAS build profile（development/preview/production）
├── CLAUDE.md           项目身份与协作规则（@import 本文件和 SOUL.md）
├── RULE.md             ← 本文件，工程操作规则
├── SOUL.md             审美与内容标准
└── assets/             图标、启动图

yan-content/            独立内容仓库（与 YanApp 同属一个 git repo）
└── content.v2.json     唯一权威内容文件（当前用 v2）
```

## 内容推送流程

内容文件的唯一权威地址：
```
https://raw.githubusercontent.com/YSY929YSY/yan-content/main/content.v2.json
```

**规则**：
- 该文件在 GitHub 仓库**根目录**，不是 `yan-content/` 子目录（子目录已删除，不要复活）
- App.js 里 `CONTENT_URL` 常量必须指向根目录版本
- 修改内容只改 `/Users/yangshiyao/my-app/yan-content/content.v2.json`
- 改完先用 jsonlint.com 验证，再 `git add / commit / push`
- **不动 App.js** 能搞定的事不动 App.js

**发布前必须先运行审计，确认 Blocker 为 0 再推送**：
```bash
# Step 1：审计（Blocker 为 0 才继续）
bash tools/check-content-release.sh

# Step 2：发布
bash scripts/push-content.sh
```

审计脚本会生成：
- `reports/wordbank-audit-report.md`：条数、必填字段、罗马字、例句对应
- `reports/example-roma-report.md`：exampleRoma 候选与现存值的差异

只有审计输出 `✓ 无 Blocker` 才可执行 `push-content.sh`。

## Git 仓库结构

`/Users/yangshiyao/my-app/` 是**一个** git repo，remote 是 `git@github.com:YSY929YSY/yan-content.git`。
它包含两个子目录：
- `YanApp/`：App 代码（当前分支 `develop/v2`）
- `yan-content/`：内容文件（`main` 分支用于 raw CDN）

两套东西在同一个 git 里管理，push 时不要只 add YanApp 下的文件而漏掉 yan-content，反之亦然。

## EAS Build 流程

**前提**：
- 已登录 EAS：`eas whoami`（未登录：`eas login`）
- 项目 ID：`390f09a4-3211-4fec-8702-45ee711a9245`（在 app.json `extra.eas.projectId`）

**三种 build profile**：

| profile | 用途 | 命令 |
|---|---|---|
| development | 含 dev client，调试用，内部分发 | `eas build --platform ios --profile development` |
| preview | 内部测试，不含 dev client | `eas build --platform ios --profile preview` |
| production | 上架 App Store / Play Store | `eas build --platform all --profile production` |

**必须重新 build dev client 的情况**：
- 新增了含 native module 的依赖（如 `react-native-svg`、`expo-camera` 等）
- 修改了 `app.json` 的 plugin 列表
- 升级了 Expo SDK 大版本

普通 JS/内容修改不需要重 build，热更新即可。

**Android build 额外要求**：
- `app.json` 里必须有 `android.package`（已填：`com.ysy929ysy.yan`）
- 第一次 Android build 会自动生成 keystore，EAS 托管，不要手动管理
- 命令：`eas build --platform android --profile development`

## 外部 AI（Codex/ChatGPT）修改 App.js 时的注意事项

**背景**：Codex 第一次帮建 build 是对的，第二次很怪；Claude Code 这次改法是对的。
主要原因：App.js 是一个大单文件，外部 AI 不知道哪些地方是精心设计过的，容易"顺手"改掉不该动的部分。

**给外部 AI 的上下文提示**（每次使用前告诉它）：
```
这是一个 Expo React Native 单文件应用（App.js）。
在修改前请注意：
1. CONTENT_URL 必须指向 https://raw.githubusercontent.com/YSY929YSY/yan-content/main/content.v2.json（根目录）
2. 字体：iOS 用 'Hiragino Mincho ProN'/'PingFang SC'，Android 用 'serif'/'sans-serif'
3. expo-speech 用于朗读，不要引入 expo-av（路由冲突）
4. FlatList 必须有 style={{ flex: 1 }}，否则在 flex column 里会塌缩到 0 高度
5. React Native imports 必须包含所有用到的组件（FlatList, TextInput 等）
6. 不要修改 C（颜色常量）和 ls/wb/wd 等 StyleSheet 里已有的样式
```

## Android 兼容性（已处理）

这些改动已在 `develop/v2` 分支完成，iOS 行为不受影响：

| 改动 | 位置 | 说明 |
|---|---|---|
| 字体 Android fallback | App.js 全局 | `Platform.OS === 'ios' ? 'Hiragino Mincho ProN' : 'serif'`（共16处）；`'PingFang SC'` → Android 用 `'sans-serif'`（共31处） |
| android.package | app.json | `com.ysy929ysy.yan` |
| 删除 expo-av import | App.js | 死代码，留着会引发路由冲突 |
| edgeToEdgeEnabled | app.json | Android edge-to-edge 支持 |


## 内容生产工具化原则

内容准确性不能只靠 AI 手写、AI 自查和人工反复猜。完善某个内容模块或设计某个功能前，先问：有没有现成工具、词典、语料、开源库、文献、教材体系或脚本可以辅助生成、校验或分类？

AI 的职责是：
- 设计流程和规则
- 调研可用工具与资料
- 写脚本把工具接入内容流水线
- 对工具无法判断的异常做复核清单
- 帮人做最终判断

AI 不应该直接凭感觉批量生成需要高准确度的内容，例如读音、罗马音、活用、词性、例句对齐、释义、声调、词源。能工具化的部分先工具化。

当前优先工具方向：
- 日文分词、读音、罗马音：`pykakasi` / `SudachiPy` / `fugashi`
- 词性、原形、活用检测：`SudachiPy` / `fugashi + UniDic`
- 词典释义和交叉引用：JMdict 等开放词典资源
- 例句候选和自然度参考：Tatoeba 等语料资源（只作候选，不直接照搬）
- 汉字结构、笔顺、部件：KanjiVG
- 发音与 pitch accent：OJAD 等资料（后续再接）

每次引入工具都要留下脚本或审计报告，让同一套检查可以重复跑。不要只做一次性手工修补。

## 词书内容路线

N5-N1 不是五份孤立词表，而是同一个基础词库在不同等级视图下的呈现。普通词书负责覆盖和准确，言库负责分类、记忆和特色。

推荐顺序：
1. 先用 N5 跑通标准 schema、例句、罗马音、标签、审计脚本。
2. 用工具修正 N5 的 `exampleJp/exampleZh/exampleRoma`，确保目标词、翻译、读音对齐。
3. 建立可重复脚本：生成罗马音、检查例句目标词、检查中文是否像释义回退、统计标签。
4. 再导入 N4-N1，导入时就按 N5 的标准 schema 和工具流水线处理。
5. 后续从 N5-N1 全词库里筛选高价值词进入言库：汉字锚、假朋友、外来语、音变、口语/书面差异、形近词、场景色、词源意象。

不要在 N4-N1 导入前把 N5 人工打磨到完美；但必须先让 N5 的字段标准和工具审计跑通，否则后续几千词会继承同样的混乱。

## 词书架构

**当前状态**（2026-06）：
- N5：718 词，全部有 `coreChunk` + `exampleJp` + `exampleZh`，**已完成**
- N4/N3/N2：架构就绪，`available: false`，待导入数据

**App.js 里的词书常量**：
```javascript
const WORDBOOKS = [
  { id: 'n5', level: 'N5', title: '基础词书', count: 718, available: true },
  { id: 'n4', level: 'N4', title: '进阶词书', count: null, available: false },
  // ...
];
```

**导入新词书的步骤**：
1. 准备词条数据，格式与 N5 相同（`word/reading/meaning/coreChunk/exampleJp/exampleZh`）
2. 在 `content.v2.json` 里新增对应字段（如 `wordBankN4`）
3. 在 `WORDBOOKS` 里把对应 `available` 改为 `true`，填入 `count`
4. 在 `PieTab` 的 `wbBookId` 路由分支里加 `n4` 的处理
5. 传入 `content.wordBankN4 || []` 给 `WordBankScreen`

**相同词跨词书共用词卡**（设计讨论结论）：
- N4/N3 里出现 N5 已有的词时，优先指向已有词卡，不重复创建
- 实现方式待定（讨论过 ID 索引方案），目前 N5 词卡先做扎实
- 原则：先把 2-3 本词书的导入流程跑通，再建词卡共享/去重的基础设施

## 导航路由规则

当前三级导航：
```
学习目录 (LearnScreen)
  └─ 高频词书 (ls.card，白底)
       └─ WordBookShelfScreen（选词书）
            └─ WordBankScreen（词列表 + 详情）
```

**导航 state 在 `PieTab`**：
- `subTab`：控制是否进入词书（`'learn'` vs `'wordbank'`）
- `wbBookId`：控制哪本词书打开（`null` = 选书架，`'n5'` = N5 词列表）

返回路径：词列表 back → 选书架 → 学习目录，层层退。

## Skills 调用

Claude Code 通过 `/skill-name` 调用 skill，skill 文件需放在 plugins 目录（`~/.claude/plugins/`），不是 `~/.claude/skills/`。

目前还没有可用的 yan 专属 skill；计划写：
- `yan-build`：正确 build 流程指导
- `yan-content`：内容格式规范与推送步骤

写法：在 `~/.claude/plugins/` 下建目录，参考已有 plugin 格式。**新 skill 需要重启 Claude Code 会话才生效。**
