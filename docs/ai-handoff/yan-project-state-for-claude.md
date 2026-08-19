# 言项目 Claude Code 接入说明

## 1. 项目一句话定位

「言」不是普通五十音表、背单词 App，也不是旅行 phrasebook。它的核心是用真实世界场景驱动语言学习：先看懂世界，再完成行动，最后让语言变成自己的表达和记忆。

当前产品气质更接近「旅行中的语言操作系统」：用户不是先被语法表和词表淹没，而是在餐厅、酒店、问路、地铁、地点打卡等真实场景中，逐步建立听懂、说出、替换、复习、记住的能力。

## 2. 正确启动 / 构建目录

真正的「言」App 项目目录是：

```bash
/Users/yangshiyao/my-app/YanApp
```

以后启动和构建都必须从 `YanApp` 目录执行：

```bash
cd /Users/yangshiyao/my-app/YanApp
npx expo start --dev-client -c
```

不要从根目录 `/Users/yangshiyao/my-app` 启动或构建「言」。根目录曾经导致跑到 Expo Router / Home / Explore / 旧 5 场景 57 句，不是当前 V2 主线。

## 3. 当前 Git 状态

只读检查时间：2026-06-03。

当前分支：

```text
develop/v2
```

remote：

```text
origin	git@github.com:YSY929YSY/yan-content.git (fetch)
origin	git@github.com:YSY929YSY/yan-content.git (push)
```

最近 5 个 commit：

```text
29c6c77 chore: ignore R workspace files
ac998ed content: add v2 memory cards and practice tasks
4867dcc feat: add v2 practice and memory interactions
96a321b chore: add content schema validator
03f4e92 chore: add referenced app assets
```

当前 `git status` 显示：

```text
modified:   YanApp/App.js

untracked:
  YanApp/scripts/generate-kana-strokes.js
  YanApp_backup_0501/
  docs/
  resources/
  yan-content/README.md
  yan-content/content.json
  yan-content/content.v1.json
  yan-content/yan_word_story输入模式探讨26.6.2.html
```

注意：当前有业务文件修改和多个未跟踪文件。不要随便执行 `git add .`，否则很容易把备份、资源、旧内容、实验文档一起加进去。

## 4. 当前已完成的 V2 功能

当前 V2 已完成或已接入的功能包括：

- `PracticeScreen` 最小闭环：从场景句卡结束后进入练习，支持输入理解题、输出/roleplay 题、查看答案、自评「会了 / 还不熟」、完成总结和再练一遍。
- `swappableWords` 点击整块发音：句卡里的可替换词 chip 点击后会直接 TTS，不需要点很小的按钮。
- 世界足迹 memory card：`NaTab` 中每个地点可展开记忆卡，包含短句、场景、句型、替换、小练习、留痕。
- memory swap chip 点击发音且不收起：`event.stopPropagation()` 已用于阻止点击替换 chip 时误收起 memory card。
- restaurant / hotel / directions 已接入练习任务。
- 已有 3 个地点 memory card，用于世界足迹里的语言记忆样板。
- `validate-content.js` 已用于 V2 内容校验，是内容结构安全网之一。

## 5. 重要文件关系

- `YanApp/App.js` 是当前主业务入口，包含主要 React Native 组件、导航状态、视觉样式、TTS、场景句卡、练习页、五十音、地铁、世界足迹等。
- `yan-content/content.v2.json` 是 V2 内容主文件，远程 `CONTENT_URL` 当前指向 GitHub raw 的 `content.v2.json`。
- `yan-content/content.json` / `yan-content/content.v1.json` 属于 V1 / 旧主内容，暂时不要碰。它们可能承载旧 5 场景 57 句或历史结构，混改会污染 V2 判断。
- `YanApp/assets/content.fallback.json` 是 App 打包 fallback。发布前如需同步 V2 内容必须非常谨慎，避免把实验内容或不完整内容打进包内。
- 根目录 `app/(tabs)` 是旧 Expo Router 模板，不是当前「言」主线。不要从根目录启动，不要按 Expo Router 模板去理解当前 App。

## 6. 当前 UI / 审美体系

当前色板集中在 `YanApp/App.js` 的 `C`：

- `C.paper`: 温润纸张背景。
- `C.ink`: 深墨色主文字和深色大块。
- `C.lava`: 柿子橙 / 朱红重点色。
- `C.lavaLight`: 柔和浅橙高亮底。
- `C.border`: 温和细边框。
- `C.tag`: 纸感标签底色。

整体视觉气质：白卡、细边框、克制圆角、大留白、温润纸张感。日语大字可以偏衬线气质和书写感，中文说明要克制、清楚、少堆砌。不要把所有信息都做成同等重量的白色说明卡，也不要做成考试解析页。

Claude Code 接入后，建议优先主导 UI 信息层级：谁是视觉中心，哪些是辅助解释，哪些只是轻量出口。尤其是 Word Card，需要第一眼像一张真实词卡，而不是说明文档。

## 7. ABCD 主线

当前可以把产品主线理解为 ABCD：

A 世界入口：从真实世界、地点、场景、行动欲望进入语言。当前有 Home、场景入口、世界足迹等雏形。

B 语言基础：五十音、假名、基础语言结构。当前 `KanaScreen` 已存在，后续不要轻易大改。

C 场景行动：餐厅、酒店、问路等场景句卡，让用户能完成现实中的行动。当前 `LearnScreen`、`SceneIntroScreen`、`CardScreen` 是这一层主线。

D 输入输出闭环：练习、复习、替换、自评、记忆。当前 `PracticeScreen`、`swappableWords`、世界足迹 memory card 已开始形成闭环。

后续方向：让 A 的世界入口更有吸引力，让 C 的句卡更像真实行动卡，让 D 的练习从「最小闭环」逐渐变成可持续复习系统。

## 8. 新模块方向：词 / 識

「词」模块：词书、词卡、背词、复习。适合 Claude 版完整翻转词卡：正面背词，背面语法深度，强调可记忆、可复习、可扩展成词库。

「識」模块：速查专题、语言机关、真实语境、开窍解释。适合 Gemini 版语境故事切片：从一句话或场景进入一个轻量故事流，解释为什么这样说、真实世界怎么用。

当前决定：先探索「注文」作为第一张 Word Card / Word Story 样板。不要急着抽象 schema，也不要把两个方向混成一个臃肿页面。

## 9. Word Card / Word Story 当前产品判断

Claude 版更适合「词」模块：正面满足背词，背面满足深入理解。它应该像一张完整翻转词卡，而不是长说明页。

Gemini 版更适合「識 / 境」：从语境进入的轻量故事流，更像场景解释和开窍切片，不承担完整背词功能。

当前不要混做两个页面。推荐先把「注文」完整词卡样板做扎实：正面有大字词头、读音、释义、频率、核心现场句、语境；背面有 `を`、`お願いします`、替换骨架、适用场景、声调。后续再拆 Story Slice。

当前 `YanApp/App.js` 中已有 `WORD_CARDS` / `WordCardScreen` 方向的本地样板入口，挂在餐厅场景句 `すみません、注文をお願いします。` 的「注文」上。它还没有抽到 content schema，也不应在 V0 里改 `content.v2.json`。

## 10. Claude Code 的建议职责

Claude Code 负责：

- 审美评估。
- UI 信息层级。
- 页面视觉规格。
- 识别哪里丑、哪里像说明文档、哪里不像真实词卡。
- 产出 visual spec，尤其是 React Native 可执行的视觉规格。
- 必要时只做样式微调，而且必须先确认允许修改的文件范围。

Claude Code 暂时不要：

- 大规模改业务逻辑。
- 改 content schema。
- 改 package / app config。
- 改五十音。
- 改发布配置。
- 从根目录启动 Expo。

## 11. Codex 的建议职责

Codex 负责：

- 只读检查。
- 精准修改指定文件。
- 跑 `node --check`。
- 输出修改清单。
- 确认没有误改文件。
- 在 dirty worktree 中保护用户已有修改，不回退、不清理、不扩大改动面。

## 12. 安全规则

必须遵守：

- 不要 `git add .`。
- 不要 `git clean -fd`。
- 不要 `git reset --hard`。
- 不要 `rm -rf`。
- 不要 `push --force`。
- 不要从根目录启动。
- 每次修改前必须确认允许文件。
- 每次修改后必须输出：改了什么 / 没改什么 / 检查结果 / 验收路径。

对于「言」主线，启动必须是：

```bash
cd /Users/yangshiyao/my-app/YanApp
npx expo start --dev-client -c
```

## 13. Claude Code 下一步建议任务

Claude Code 第一次接入后，应该先只读审美评估，不要改代码。

建议任务：基于当前 `YanApp/App.js`、Gemini HTML Demo、Claude HTML Demo，输出 Word Card 的 React Native 视觉规格。重点判断：

- 第一眼是否像一张真实词卡。
- 「注文」是否是正面视觉中心。
- 核心句是否足够醒目。
- 正面是否适合背词。
- 背面是否适合理解语法。
- 信息层级是否清楚。
- 是否过度卡片化、考试解析化、按钮堆砌化。

第一轮建议只输出 visual spec 和问题清单。等确认后，再由 Codex 或 Claude Code 在明确允许的文件范围内做样式微调。
