# 当前状态 · 主线词场 343 条可审清单

> 状态：shortlist staging 已产出，等待项目负责人决定 A / A+B / 再等；不落库。
>
> 更新日期：2026-08-26

## 当前工单

`docs/handoff/TICKET-wordfield-343-reviewable.md`

## 主线影响

本工单不推迟主线；它把已有 Tatoeba 候选收成负责人可决策的形状。现有内容包仍是 20/563，未写入。

## 已完成

- 新增只读脚本 `scripts/wordfield-shortlist.mjs`，1851 条候选按 anchor 收成 343 条。
- 产出并提交 `staging/wordfield-shortlist-343.json`；每条保留 Tatoeba 日句/中句 ID、原句、原译、成员词和 unknown 词。
- 确定性规则淘汰：unknown 426、成员数 787、句长 131、日句 ID 164。
- 三档：A 230、B 66、C 47。
- 机械风险扫描标出 13 条：疑似残句 1 条、疑似口语省略 12 条；全部实例已写入 CC-REPORT。
- 两次运行产物 SHA-256 相同：`e1d6ea9258589623973ebf0ba5214f34c862d8ae6586f980b572744bdee9f007`。

## 关于“有没有源”

有来源：每条来自本地 Tatoeba 语料，保留日文句 ID、中文对齐句 ID、原句和原译。来源可定位，不等于句子自然度已经被项目负责人或母语者人工确认；本批 343 条全部仍待审。

## 等待负责人

请负责人看报告中的 30 条样本和 13 条风险实例后，只需给一句：`A 档直接落` / `A+B 落` / `再等`。下一张工单才落库。

## 明确不做

- 不改 `assets/content.fallback.json`、`yan-content/content.v2.json`，不改 App/UI/gloss。
- 不生成或改写任何日文、中文；不使用 LLM。
- 不构建、不发 OTA。
