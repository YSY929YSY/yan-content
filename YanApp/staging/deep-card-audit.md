# 深卡现状盘点

测量来源：`assets/content.fallback.json` 的 `wordCards`，基准卡为 `order`（注文）。本文件只报告，不改变内容包。

> “九标准”中“不赘 / 简洁 / 节奏 / 人类”是文案质量判断，不能由字段存在性诚实推出；下面的字段检查只标结构性缺口，不替代人工阅读。

## 8 张卡

| 卡 | 结构性缺口 | 字段计数（notes / grammarBlocks / skeletons / examples / related） | 与注文顶层形状差异 |
|---|---|---:|---|
| 注文 | 无 | 4 / 2 / 4 / 4 / 4 | 无（基准） |
| すみません | 意象：`notes`、`contextJa/contextZh` 均为空，缺少可供人工复核的意象载体 | 0 / 2 / 4 / 4 / 2 | `trap`、`contextJa`、`contextZh` |
| お湯 | 无 | 3 / 2 / 4 / 3 / 3 | 无 |
| お会計 | 无 | 3 / 2 / 4 / 4 / 3 | `trap`、`contextJa`、`contextZh` |
| 乗り換え | 无 | 2 / 2 / 4 / 3 / 3 | `trap` |
| どこ | 无 | 3 / 2 / 4 / 4 / 3 | `trap` |
| 痛い | 无 | 3 / 2 / 4 / 4 / 3 | `trap` |
| お世話になりました | 无 | 3 / 2 / 4 / 3 / 2 | `trap` |

所有卡都具备 `sourceLabel`、核心义 / 核心句 / 核心翻译、例句和 skeleton 的结构；差异主要是可选的 `trap`、`context` 和 `notes` 是否有内容。`すみません` 的字段完整性不等于意象标准已通过，只能确定当前没有可供盘点的载体。

## 九标准结构映射

- 真实：`sourceLabel` + `examples` 有结构；是否真为旅行者会遇到的语言仍需人工抽读。
- 内容：`coreMeaning`、`coreSentence`、`coreTranslation`、`examples` 齐全。
- 意象：通常由 `notes` / `contextJa` / `contextZh` 承载；`すみません` 此处为空。
- 深度：由 `notes` / `grammarBlocks` / `related` 承载；8 张均有至少一类。
- 实用：8 张均有 4 条 skeletons。
- 不赘、简洁、节奏、人类：无可靠的结构字段可自动验收，暂列人工审校项。

## 未带来源的词源式断言

按 `docs/etymology-claim-vs-memory-story.md` 的规则，扫描 `notes` 中“同源 / 同根 / 源自 / 词源 / 演变”等标记；明确写成记忆联想的 `注文.notes.es` 未计入问题。发现 2 条：

1. `どこ.notes.doko`：`何処` 与中文“何处”写成“完全同源”，没有 `etymologyClaim` 或可定位来源。
2. `痛い.notes.itai`：中文“痛”和日语“痛い”写成“完全同源”，没有 `etymologyClaim` 或可定位来源。

## 与注文的结构结论

8 张卡的顶层字段集合一致；`すみません`、`お会計`、`乗り換え`、`どこ`、`痛い`、`お世話になりました` 与基准卡的差异是可选字段的值类型（`null` 对字符串 / 对象），不是缺少顶层字段。嵌套内容数量和语义当然不同，不能据此判定文案质量。
