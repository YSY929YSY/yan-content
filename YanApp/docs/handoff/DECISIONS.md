# YanApp · 协作决策与待决定事项

> 这里记录已经确认的边界。完整论证见 `docs/ROADMAP-content-trust-structure-ui.md`。

## 已确认的事实

### F1. 当前存在两套并行的新词准入口径

- `App.js` 的 `isDraftedWord` 只检查 `exampleJp/exampleZh/exampleRoma`；
- 它被词书统计、默认列表过滤、`K.wordbankSession` 候选和“起草”标签使用；
- 首页/批次主线不使用它，而使用 `anchorPool` 的 `kanji_anchor` 规则；
- 当前词书口径放行 4400 条；主线池 563 条且全部属于 N5；
- 例句完整不能证明中文义、义项对齐或编辑核验已经完成。

### F2. 当前 fallback 与旧文档数字存在漂移

- 2026-08-20 本地 fallback 是 8005 词；
- 旧 JMdict join 报告基于 8298 词；
- 动态数字后续必须由脚本生成，不能继续靠多份 Markdown 手工同步。

### F3. 声调交叉验证已运行，但来源与产物仍不可完整追溯

- 代码已经对 `UniDic / kanjium / 中文 Wiktionary` 做集合交叉比较，并把 `pitch.agree` 写入内容包；
- UniDic 可确认是 NINJAL 建设和发布的机构来源，与 kanjium 的维护主体不同；
- 当前内容包与当前 staging 的统计属于不同运行代次，未绑定 run id；
- 输入仍缺 URL、版本/commit、SHA-256、下载时间、许可快照及逐条定位，尤其中文 Wiktionary JSONL 没有取得清单；
- 因此可称“已有多源交叉验证机制”，暂不能称“来源独立性与审计链已经完全证明”。

## 产品负责人已经表达的工作偏好

### P1. 不采用逐条专业人工核验

流水线目标是：

- 双独立来源；
- 确定性校验；
- 多模型/多 subagent 找证据与反例；
- 冲突自动隔离；
- 无法确认时允许留空、不发布。

内部状态不能冒充 `human_verified`。

### P2. 外部模型不需要文件权限

- 豆包、Kimi、DeepSeek 等如果以后接入，只接收 claim JSON、返回 evidence JSON；
- 正式文件只由本地脚本、CC 或 Codex 处理；
- 没有 API 时可以导出/导入审核包，但不依赖外部模型直接改仓库。

### P3. 减少 CC 的重复阅读与额度消耗

- 默认只读 `docs/handoff/ACTIVE.md` 和当前代码；
- 旧文档按任务路由读取；
- 不要求每轮全文重读路线图和历史交接。

## 当前建议，尚待产品负责人最终确认

### R1. 实现与审核分工

- CC 作为现有 App 代码的主要实现者；
- Codex 作为独立审核者，并负责新建 source-audit 流水线；
- 同一文件同一时间只有一个实现者。

### R2. 第一阶段发布兼容

- 全库继续可搜索；
- N3/N2/N1 暂时 dictionary-only；
- N5/N4 不再只因例句齐全自动视为核验完成，需显式 publication 迁移策略；
- dictionary-only 词不能直接进入 grade/SRS。

### R3. 第一阶段不做大重构

- 先建立内容发布领域层；
- 再按一屏一个提交抽离 `App.js`；
- 不在同一提交同时改行为、UI 和文件结构。

## P0-1 已确认的产品决定

### D1. Dictionary / Learning 初始 publication

- 8005 条现有结构完整词设为 `dictionary: true`，依据为 `legacy_dictionary_compat`；
- 563 条 N5 `kanji_anchor` 设为 `learning: true`，依据为 `legacy_mainline_anchor`；
- 其余 7442 条 `learning: false`；
- `learning: false` 时不写 `learningBasis`，也不写 `null`；只有正向准入 Learning 的词记录该层 basis；
- Dictionary 与 Learning 分别记录迁移依据，均不等同 `verified` 或 evidence strength。

### D2. dictionary-only 的评分边界

- 不可学习且无既有 SRS record 的词不提供评分，不论来自搜索、词书“浏览词典”、`today`/`due` 还是词场成员跳转；
- 已有 record 的 dictionary-only 词仍可复习；
- P0 第一版不做“加入我的词”，`manual_save` 另开工单；
- 守门统一放在详情页是否获得 `onGrade`，不依赖列表过滤，也不把 publication 判断塞进通用 `grade()`。

### D3. publication 第一版的 UI 语义

- 计数明确写“可查 / 可学习”，不用“定稿”；
- dictionary-only 行不用“起草”；状态合成一个展示：`仅词典` 或 `仅词典 · 暂无例句`，不并排放两个标签；
- 详情页再单独说明“暂无例句”；
- 无可学习词时说明“开放词典查询，学习内容正在分批核验”，入口叫“浏览词典”；
- dictionary-only 且无旧 record 的详情显示只读说明，不显示评分按钮。
- `showDrafts` 同步重命名为 `browseDictionary`，停止在代码里沿用已经废弃的“起草”语义。

## 其他仍待决定

### D4. Journal v2 是正式数据还是开发原型

决定后才能处理多页、生产入口和 backfill 承诺。

## 修改本文件的规则

- 已确认事实可以由代码/数据证据更新；
- 产品取舍只能由产品负责人确认；
- CC、Codex 或 subagent 发现冲突时先记录，不得自行把“建议”升级成“决定”。

## A4 · 声调 lineage 结论（2026-08-22）

`agree=2` 只有在 `staging/pitch-confidence.json` 的 `srcs` 恰为 `UniDic + kanjium` 时，才按两个独立 lineage 计数；该组合共 6549 条，保持原展示。`kanjium + 维基` 23 条与 `UniDic + 维基` 17 条不再按双源提示，改按单源提示。含三方的 `agree=3` 记录不在这 40 条降级名单内。

可复算依据：

```bash
node -e "const x=require('./staging/pitch-confidence.json').levels; const c={}; for(const v of Object.values(x)){const k=v.agree+' '+v.srcs.join('+'); c[k]=(c[k]||0)+1} console.log(c)"
```

本次登记的三个来源及根 lineage 是 `ninjal-unidic`、`kanjium`、`wiktionary-ja`；它们的 staging 工件、版本与许可快照尚未补齐，因此 registry 会将其标为 incomplete，登记不等于已证明可计入 release gate。
