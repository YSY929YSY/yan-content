# 当前状态 · PLAN v2 第八批

> 状态：A/B 实现已完成并提交；C（合并两套渲染器）按工单明确不做。
>
> 更新日期：2026-08-24

## 当前工单

`docs/handoff/TICKET-plan-v2-batch8.md`

## 本轮完成

- A-1：词场逐 token 行改为顶部对齐，移除 `minHeight + flex-end` 造成的日语基线跳动。
- A-2：词义、语法作用、空 token 按已有 `source` 分层；grammar 文案去括号并降低字号/对比度，blank 不渲染。
- B：Sudachi token 产出必要的 `dictionary_form`；读取层支持三元紧凑格式；词场查词顺序为词面 → reading → 辞书形。
- 重新生成 `assets/example_tokens.json`：4400 句、36435 token，加入 5302 个三元 token。
- 20 条词场句的逐块中文覆盖从 115/133（86.5%）提升到 133/133（100%）；18 个动词洞清零。
- 未修改 `assets/content.fallback.json`、`yan-content/content.v2.json` 或任何远端内容包。

## 提交与验收

- 本轮代码提交：`f2ed5e7 fix(wordfield): preserve grammar cues and inflected gloss coverage`
- `npm test`：603 passed，0 failed。
- `npm run typecheck`：exit 0。
- `git diff --check`：通过。
- `npm run audit`：当前仍受 Harness v1 已知的 23 个 `doc-refs` FAIL 阻断；详见 `docs/handoff/CC-REPORT.md` 的 batch8 原始输出。该 FAIL 不由本批改动引入，也未在本批越界修复。

## 明确未做与剩余事项

- C：不合并 `ExampleSentence` 与词场渲染器，不做四层对齐样板。
- 不改例句渲染器、读音设置、`C` 颜色常量、已有 `ls/wb/wd` 样式、按钮层级或离线 banner。
- 不用 LLM 猜测仍无法唯一映射的辞书形；真正查不到/有歧义的 token 继续留空。
- `assets/example_tokens.json` 是 App asset，需随之后的 App 构建才会进入安装包；不走 `push-content.sh`。
