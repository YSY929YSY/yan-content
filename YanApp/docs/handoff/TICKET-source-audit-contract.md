# 工单 · P2-2A 来源审计输出契约

> 状态：已实现并经 CC §79 复审通过
>
> 当前实现者：Codex
>
> 目标：让本地脚本、CC、Codex 与外部模型都只能交换可追溯的候选和证据，而不能直接改正式内容或升级发布状态。

## 为什么先做这一层

此前的循环是“写内容 → 发现错误 → 临时找源 → 再改”。问题不在某个模型不够聪明，而在每次检索没有固定输入、证据、冲突和产物边界。P2-2A 先定义交换格式与自动裁决边界；没有它，直接做搭配释义、例句高亮或词源都会把“模型说过”误当成来源。

这份工单落实 `DECISIONS.md` 的三条既定约束：双独立来源、冲突自动隔离；外部模型只接收 claim JSON 并返回 evidence JSON；正式内容只能由本地脚本/受控实现者处理。

## 本轮范围

- 定义 source registry、claim、evidence、run manifest 四类 JSON 的 v1 契约；
- 定义来源独立性、自动裁决和失败隔离规则；
- 定义外部模型审核包的输入/输出边界；
- 盘点现有 staging 工件怎样进入新契约，尤其是 JMdict join 与 pitch 统计；
- 形成下一步的最小实现工单和测试矩阵。

## 明确不做

- 不下载新来源，不修改 `assets/content.fallback.json`、远端内容包或 `publication`；
- 不批量生成中文释义、例句、搭配、词源、声调或目标词 span；
- 不把 AI、搜索摘要、两个模型的一致回答当成独立来源；
- 不改 App 页面、评分、SRS、例句 token 或声调展示；
- 不重跑既有声调数据，也不把当前 `pitch.agree` 说成已完成完整审计。

## 四类文件与存放位置

P2-2A 只约定未来位置，暂不创建数据文件：

```text
staging/source-audit/
  sources.v1.json             # 可引用来源的锁定注册表
  claims/<batch>.json         # 待核的字段级断言
  evidence/<batch>.json       # 任意脚本/模型返回的证据，不可直接发布
  runs/<run-id>.json          # 输入、工具版本、输出和统计的可复现清单
  reports/<run-id>.md         # 面向人的摘要；统计不手填
```

所有文件都在 `staging/`，因此不是运行时内容，也不会被 App 下载。后续真正写入内容包必须另开迁移工单，并保留这批 `claimId`/`evidenceId` 引用。

## 1. Source registry：来源先于证据

每一个可计入裁决的 `sourceId` 必须预先存在于 `sources.v1.json`。最小形状：

```json
{
  "schemaVersion": 1,
  "sources": [{
    "sourceId": "jmdict-simplified:3.6.2+20260803141815",
    "familyId": "edrdg-jmdict",
    "lineage": ["edrdg-jmdict"],
    "title": "JMdict-simplified",
    "role": ["dictionary_identity", "pos", "sense_boundary"],
    "canonicalUrl": "https://github.com/scriptin/jmdict-simplified",
    "version": "3.6.2+20260803141815",
    "retrievedAt": "2026-08-03T00:00:00Z",
    "artifact": {
      "kind": "source-archive",
      "path": "staging/jmdict-eng.json.tgz",
      "bytes": 11475164,
      "sha256": "<archive-sha256>"
    },
    "license": {
      "name": "CC BY-SA 4.0",
      "url": "https://www.edrdg.org/edrdg/licence.html",
      "noticePath": "docs/sources/jmdict-notice.md"
    },
    "redistribution": "derived-data-with-attribution"
  }]
}
```

规则：

- `sourceId` 锁定一次具体取得；同一项目的新版本必须是新 `sourceId`；`artifact` 明确锁定校验的是哪一个原始文件/归档，不能把解压后的派生产物 SHA 冒充原始输入；
- `lineage` 是非空、由来源根到当前工件的字段相关数据谱系。`familyId` 必须等于其根节点，不能由导入器或外部模型自由填写；注册新根节点需要受控代码审查并说明为什么它不是既有来源的镜像、fork 或再包装；
- 同一 `familyId`、或两条 `lineage` 表明同一字段相关数据被镜像/fork/再包装时，均不计为独立来源。共享无关的工具或背景资料不自动否定独立性；是否属于字段相关谱系由 registry 的受控注册决定，而非模型或每条 evidence 临时声明；
- `role` 是该来源可支持的字段范围。比如 Sudachi/UniDic 可证明分词或读音机械结果，不能证明中文学习释义或词源故事；
- 新取得来源必须有 artifact SHA、获取时间、许可和归属，缺任一项只能调研、不得计入自动通过；历史工件允许 `retrievedAt: null`，但必须标记 `relockedAt`，并用仍在磁盘的原始文件复算 artifact SHA、版本和字节数。不得伪造旧下载时间；
- 一个来源可有多个许可层；缺失上游许可链时 `redistribution` 必须写成 `research-only`。

来源 validator 对每个注册项只产出一个不可由导入器覆盖的 `eligibility`：`eligible`（可计入本层通过）、`research-only`（仅可找线索）、`incomplete`（完整性/许可/归属/noticePath 不足）。`eligible` 必须同时具备完整 artifact、`retrievedAt` 或 `relockedAt`、许可、归属和本地 noticePath；这样“完整性缺失”和“许可不允许发布”走同一个裁决入口，不会有一条在 §1、一条遗漏在 §4。

## 2. Claim：把“一个词”拆成可判定的小断言

一个 claim 只能断言一个字段的一项事实，不能把“词存在、读音、释义、例句、词源都对”打包。最小形状：

```json
{
  "schemaVersion": 1,
  "claimId": "ja:合図:あいず/meaning_zh/01",
  "wordId": "n3_aizu",
  "wordKey": "合図\tあいず",
  "field": "meaning_zh",
  "claimType": "editorial_translation",
  "proposed": {"zh": "信号；暗号"},
  "policy": {
    "minimumEvidence": "editorial-plus-sense-boundary",
    "requiredRoles": ["sense_boundary"],
    "independentFamilies": 0
  },
  "author": {"kind": "editor", "id": "ysy"},
  "status": "candidate"
}
```

`field` v1 仅允许：`identity`、`reading`、`pos`、`sense_boundary`、`meaning_zh`、`example`、`usage`、`loanSource`、`pitch`、`target_span`。未知字段先拒绝，不静默放行。

`claimType` 以 `editorial_` 开头的 claim 必须带非空 `author`；`authored_example` 同样必须带 `author`。它表示谁对言自己的中文、例句或联想负责，不表示外部来源背书。

claim v1 同样采用 `additionalProperties: false`；允许键仅为 `claimId`、`wordId`、`wordKey`、`field`、`claimType`、`proposed`、`policy`、`author`、`status`。claim 或 evidence 任一出现 `publication`、`learning` 等未建模字段都不能进入外部审核包。

`claimType` 决定证据规则，而不是反过来从内容形状猜状态：

| claimType | 可以由什么支持 | 不能自动得出的结论 |
|---|---|---|
| `dictionary_fact` | 注册表内词典/语法来源 | 中文教学表达自然、例句适合教学 |
| `editorial_translation` | 义项边界 + 署名编辑责任 | “等同于权威中文词典” |
| `authored_example` | 作者责任 + 分词/读音机械校验 | 母语自然度或真实语料频率 |
| `corpus_example` | 句子 ID、作者、许可、定位 | 可以免署名再分发 |
| `etymology_fact` | 一权威来源或两个独立来源 | 记忆联想是历史事实 |
| `editorial_mnemonic` | 作者责任 | 词源事实 |
| `derived_mechanical` | 固定输入、脚本版本、可重跑结果 | 人工或来源核验 |

## 3. Evidence：证据回答“支持什么、从哪一处来”

外部模型、CC、Codex、脚本均只能生成 evidence 文件。最小形状：

```json
{
  "schemaVersion": 1,
  "evidenceId": "ev:20260820:001",
  "claimId": "ja:合図:あいず/meaning_zh/01",
  "sourceId": "jmdict-simplified:3.6.2+20260803141815",
  "locator": {"kind": "entry", "value": "1284930"},
  "relation": "supports",
  "observed": {"gloss": ["sign", "signal", "cue"]},
  "rights": {"license": "CC BY-SA 4.0", "attribution": null},
  "method": "deterministic_join",
  "producer": {"kind": "script", "name": "jmdict-join", "version": "<git-commit>"},
  "createdAt": "2026-08-20T00:00:00Z"
}
```

约束：

- evidence v1 采用 `additionalProperties: false`：只允许本节明列的键及未来明确版本化的新键；不能靠“等”字维护一个永远漏项的发布字段黑名单；
- `relation` 只能是 `supports`、`contradicts`、`insufficient`；没有“模型认为正确”；
- `locator` 必须能让本地人或脚本回到同一来源位置；URL 只能到页面而没有条目/行/句子 ID 时为 `insufficient`；
- `observed` 存归一化后的必要值与短定位，不复制大段受版权保护文本；
- `producer.kind: model` 记录谁找到了线索，但不使模型成为 `sourceId`，也不计独立 family；
- evidence 出现 `publication`、`learning`、`dictionary`、`verified` 等发布/升级字段时，整条隔离；它不是“忽略多余字段后继续导入”。
- `corpus_example` 的 evidence 必须带非空 `rights.license`、`rights.attribution` 与可定位句子作者；这三项由证据承载，而不是假定 registry 的项目级许可能覆盖每一句。

## 4. 本地裁决：机器只分流，不宣布“真实”

未来纯脚本以 claim 的 policy 和 registry 做确定性输出：

| 输出 | 条件 | 后续动作 |
|---|---|---|
| `candidate` | 尚无足量可定位证据 | 保持 staging |
| `supported` | 无有效反证，且至少一个 eligible 支持来源已满足 policy（不要求多源） | 允许进入受控编辑审阅清单，不改 publication |
| `corroborated` | 无有效反证，policy 要求多源且已达到所需独立谱系数 | 可展示为“多源印证”，仍不等于人工核验 |
| `conflict` | 只要存在有效的互相矛盾证据，即优先于支持数 | 自动隔离，禁止写内容包 |
| `insufficient` | `eligibility !== eligible`，或 locator、角色、输入版本、发布用途不合格 | 自动隔离，保留诊断 |
| `editorial` | 明确作者联想/翻译/自写句 | 必须带作者责任，不能改写为外部事实 |

`supported`/`corroborated` 是证据状态，不是 `publication`。本工单不允许任何自动步骤把它们映射为 `dictionary` 或 `learning: true`；那需要字段级内容迁移和独立产品决定。

`redistribution: "research-only"` 的来源可供内部找线索或生成 `candidate`，但不能计入 `supported`/`corroborated`，也不得成为任何内容迁移工单的发布依据。这样许可风险在裁决阶段被隔离，而不是等到准备发布才发现。

不合格来源的 `contradicts` 不冒充有效冲突，也不能推翻一个合格来源；但裁决报告必须显式列出它，并阻止该 claim 达到 `corroborated`。这样既不让无定位/无许可的外部输入恶意阻塞内容，也不会静默掩盖反例线索。

## 5. 外部模型审核包

导出给 GPT、Grok、Gemini、Kimi、DeepSeek 的文件仅含：`claimId`、词头/读音、字段、待验证值、允许的来源注册链接/版本、返回 schema。模型的任务是找反例或返回带 locator 的 evidence；找不到就返回 `insufficient`。

导入时必须过 JSON schema、`claimId` 存在、`sourceId` 已注册、字段 role 合法、locator 非空、时间格式合法。任何一项失败整条 evidence 隔离，不影响其他 claim。外部模型没有仓库写权限也完全可参与；复制粘贴的 JSON 同样能被导入。

不能把“GPT 与 Gemini 都说对”算作两个来源。它们最多是两个独立的**检索/反例代理**，不是两个独立资料家族。

## 6. 现有工件的迁移口径

- `staging/jmdict-eng-3.6.2.json`、`jmdict-join-report.md`、`jmdict-join-sample.json` 与仍在仓库的 `jmdict-eng.json.tgz`：走“历史重锁”。本次锁定对象是 source archive `jmdict-eng.json.tgz`，不是未记录 SHA 的解压 JSON；若报告中的版本、归档字节数与归档 SHA 能由现存 tgz 复算一致，可补齐许可/归属快照与 `relockedAt` 后注册为正式 `sourceId`；原始 `retrievedAt` 未知就写 `null`，绝不编造。
- `assets/content.fallback.json` 的 `_meta.wordBankSources` 是已发布的历史来源说明，不是新 registry 的第二真相。其每一项后续要么映射到一个 `sourceId`，要么明确标为 `legacy-published-record`，不得作为 evidence 依据；本轮不改内容包。
- `staging/pitch-confidence.json` 与内容包 `pitch.agree` 是祖父工件：保留现有展示和数据，不反向伪造逐条 locator，也不得导入为新契约的 `supported`/`corroborated`。下一次声调 run 必须产生 registry + run manifest + 逐条 evidence 才能使用新判据。是否在未来更改用户可见的“来源印证”措辞，是独立产品决定，不属于本工单。
- `staging/wordbank-pilot.json`、`wordfield-*`、`corechunk-*`：都是 candidate 内容或编辑建议，不能自行成为 evidence。
- `scripts/build-example-tokens.py`：是 `derived_mechanical` 的好模板；以后它的输入 SHA、脚本 commit、工具/词典版本和失败清单进入 run manifest，但它不验证例句真实性。

## 7. 下一张实现工单必须包含

0. 创建 `docs/sources/` 内的 JMdict 许可与归属快照，并以 registry 的 `noticePath` 引用；没有该快照不得把 JMdict 样本计入通过；
1. 纯 TypeScript/Node schema validator：分别验证 registry、claim、evidence、run manifest；
2. 一个只读 import/export CLI：绝不读写 `assets/content.fallback.json`；
3. 固定的合成测试矩阵：同 root lineage / mirror / fork 不计双源、未注册 source 拒绝、错 locator 隔离、冲突优先、`research-only` 或 `incomplete` 不计通过、模型 producer 不计来源、editorial claim 缺 author 拒绝、evidence 的额外字段或发布字段隔离、corpus evidence 缺作者/许可/定位隔离、无 evidence 不升级。中途吃入另一来源的词典必须由 registry 注册审查认定谱系，不能假装可由合成测试自动发现；
4. 一个最小、明确许可的真实来源样本（建议仅 JMdict identity/reading），用其验证历史重锁与 run manifest，而非批量改词；
5. 报告中的统计由 CLI 产出；不在源码/Markdown 手填动态通过数。

在这个实现工单结束之前，不开 P2-2B target span 或 P2-2C usage gloss。前者需要词条与例句的明确对齐证据，后者需要释义和许可边界；两者都依赖本契约。

## 验收标准（本轮仅文档）

- 契约能解释“两个模型同意、同 lineage 或同一 fork”为什么不算双源；
- 契约能解释“自写中文/例句”为什么是编辑责任而不是 AI/词典事实；
- 一条无 locator、无许可、`research-only`、冲突、未注册来源或携带发布字段的 evidence 都无法推动内容发布；
- 当前已发布 App 行为和所有内容字节均不变化；
- 独立复核者只需阅读本工单、`DECISIONS.md` §P1/P2、`_meta.wordBankSources`、`PitchLine.js` 和列出的现有 staging 工件，即可审查边界。
