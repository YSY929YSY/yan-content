# P0-1 Commit 2 工单 · publication 兼容迁移

> 状态：已授权 CC 实现；完成后等待 Codex 独立复核
>
> 预计实现者：CC
>
> 独立复核：Codex
>
> 日期：2026-08-20

## 1. 目标与边界

把当前产品已经存在的“可查询 / 主线可学习”行为显式写入内容包，停止让后续运行时代码从例句、结构或其他字段猜 publication。

本提交只做：

1. 新增一次性、可重复检查的迁移脚本；
2. 给两份内容包写入相同的 `publication`；
3. 增加内容契约测试；
4. 产出机器统计和迁移报告。

本提交**不接入 selector，不修改 `App.js`，不改变任何界面或 SRS 行为**。运行时仍没有调用点；行为接入属于 Commit 3。

这次迁移是兼容迁移，不是真实性核验：

- `legacy_dictionary_compat` = 保留当前查询能力；
- `legacy_mainline_anchor` = 保留当前 N5 主线候选；
- 两者都不得映射成 `verified`、双源印证或人工核验。

## 2. 已独立确认的只读基线

两份目标文件当前逐字节相同：

| 项 | 基线 |
|---|---:|
| 文件大小 | 6,743,897 bytes |
| SHA-256 | `c7e24daf4a8c36d1b4e63bb05bf72c527d295abfae4d266774cc20ce0c06f67a` |
| 末尾换行 | 有 |
| JSON 缩进 | 1 空格 |
| `wordBank` | 8005 |
| 已有 `publication` | 0 |
| `kanji_anchor` | 563 |

目标文件：

- 权威内容：`yan-content/content.v2.json`；
- App fallback：`YanApp/assets/content.fallback.json`。

两份文件都已被 Git 跟踪。开工前若 SHA、字节一致性、词条数、anchor 数或已有 publication 数与上表不同，立即停止并报告，不拿旧工单覆盖新数据。

## 3. 本次迁移的唯一输出 schema

### 3.1 563 个 `kanji_anchor`

```json
"publication": {
 "dictionary": true,
 "learning": true,
 "dictionaryBasis": "legacy_dictionary_compat",
 "learningBasis": "legacy_mainline_anchor"
}
```

### 3.2 其余 7442 词

```json
"publication": {
 "dictionary": true,
 "learning": false,
 "dictionaryBasis": "legacy_dictionary_compat"
}
```

`learning: false` 时不写 `learningBasis`，也不写 `null`。理由：basis 记录的是一次正向准入依据；“尚未准入”没有可以冒充证据的 basis。以后真正进入 Learning 时，必须同时补自己的 `learningBasis`。

所有布尔必须是真布尔，不接受 `1`、`"true"` 或 truthy 兼容。

## 4. 允许修改的文件

- 新增 `tools/stamp-wordbank-publication.py`；
- 修改 `yan-content/content.v2.json`；
- 修改 `YanApp/assets/content.fallback.json`；
- 新增 `YanApp/src/lib/__tests__/publication-content.test.mjs`；
- 仅为删除“publication 仍为 0”的过期注释，可修改 `YanApp/src/lib/__tests__/publication.test.mjs`；
- 在 `YanApp/docs/handoff/CC-REPORT.md` 末尾追加 Commit 2 报告。

除此之外不改。若需要第三种业务文件或修改已有 validator，先停止报告，不顺手扩张。

## 5. 迁移脚本契约

脚本从 Git 根目录运行：

```bash
python3 tools/stamp-wordbank-publication.py
python3 tools/stamp-wordbank-publication.py --apply
python3 tools/stamp-wordbank-publication.py --check
```

### 5.1 默认 dry-run

无参数只读取、验证并打印计划，不写文件。输出至少包含：

- 两份输入的路径、字节数、SHA-256、是否逐字节相同；
- wordBank 总数；
- 当前 publication 数；
- anchor 数；
- 计划写入的 dictionary / learning true / learning false 数；
- learning-without-dictionary 数；
- 预计输出 SHA-256 与字节数。

### 5.2 `--apply` 前置失败条件

任一条件不满足必须非零退出，且两份文件都保持原字节：

- 两份输入不是逐字节相同；
- 输入 SHA 不是本工单基线 SHA；
- `wordBank` 不是数组或不是 8005 条；
- id 缺失/重复；
- 已经存在任意 `publication`，但又不是完整、合法的迁移后状态；
- anchor 不是 563 条；
- 任一词不满足 `hasDictionaryShape` 等价结构；
- 生成后不是 8005 dictionary / 563 learning / 0 learning-without-dictionary；
- 去掉 `publication` 后，任一词的其他字段、词序、顶层内容或键顺序发生变化。

脚本必须先在内存中完成全部生成与验证，再创建临时文件；两个临时文件都成功写完并重新读取验证后，才替换目标。不要在仓库留下 `.bak`、`.tmp` 或时间戳备份。

两文件跨文件系统无法获得真正的单事务原子性，所以脚本启动时还要识别“一个是合法迁移后文件、另一个仍是精确基线”的中断态：dry-run 只报告；`--apply` 可用已验证的迁移后字节修复另一份。任何其他不一致都拒绝猜测。

### 5.3 `--check`

只接受完整迁移后的状态，不写文件。检查：

- 两份文件逐字节相同；
- 8005 条均有合法 publication；
- dictionary true = 8005；
- learning true = 563；
- learning false = 7442；
- learning true 词集合与 `kanji_anchor` 集合完全相同；
- learning-without-dictionary = 0；
- dictionaryBasis 正确 = 8005；
- learningBasis 正确 = 563；
- learning false 的 7442 条没有 learningBasis；
- 非 publication 内容与迁移前投影一致。

脚本重复执行 `--apply` 必须是安全 no-op，不得改变 SHA。

## 6. 序列化与 diff 预算

当前内容包已实测可由以下格式逐字节 round-trip：

```python
json.dumps(doc, ensure_ascii=False, indent=1) + "\n"
```

不使用默认 `json.dump`，不使用 `indent=2/4`，不排序键，不修改 `_meta.updated`，不重排词条或字段。

`publication` 追加在每个词对象末尾。按本工单 schema，单份文件的预期迁移结果是：

```text
输出大小       7,754,410 bytes
输出 SHA-256   86a4235d40830a6758883ab0cf67a6b7422a91adcaecce853868779eee3b3631
diff numstat   40,588 insertions / 0 deletions
```

40,588 行是 8005 个显式对象带来的合理新增，不是格式化噪音。出现删除行、不同输出 SHA、非 publication 字段 diff，或接近整包重排的改动才算失败。

## 7. 永久内容契约测试

新增 `publication-content.test.mjs`。永久测试守一般不变量，不把 8005/563 永久冻结：

1. remote 与 fallback **原始字节**完全相同；
2. 每条词的 publication 是非数组对象；
3. dictionary / learning 都是严格 boolean；
4. `learning === true` 必须同时 `dictionary === true`；
5. dictionary true 必须有非空 `dictionaryBasis`；
6. learning true 必须有非空 `learningBasis`；
7. 至少存在一条 Dictionary 和一条 Learning，防止整库 fail closed；
8. 用 `isDictionaryEntry` / `isLearnableWord` 跑真实内容，selector 结果与原始 publication 一致；
9. 真实内容中不得出现结构坏但 publication 放行的词。

精确的 8005/563/7442 属于**本次迁移验收**，由迁移脚本 `--check` 和 CC 报告记录；未来内容增长不应因为历史数字让永久测试报错。

## 8. 开工、验收与停止点

开工前：

```bash
cd /Users/yangshiyao/my-app
git status --short -- yan-content/content.v2.json YanApp/assets/content.fallback.json
cmp -s yan-content/content.v2.json YanApp/assets/content.fallback.json
cd YanApp
npm test
npm run typecheck
```

实现后：

```bash
cd /Users/yangshiyao/my-app
python3 tools/stamp-wordbank-publication.py --check
cmp -s yan-content/content.v2.json YanApp/assets/content.fallback.json
git diff --check
git diff --numstat -- yan-content/content.v2.json YanApp/assets/content.fallback.json
bash tools/check-content-release.sh
cd YanApp
npm test
npm run typecheck
```

`check-content-release.sh` 会写报告。先跑基线；若存在与本迁移无关的既有失败，记录前后完全相同的证据，不在本提交顺手修 validator 或内容。

完成后停在未提交状态，等待 Codex 独立审查：

- 脚本逻辑与失败路径；
- 两份 JSON 的字节与 diff；
- 精确统计；
- 新测试是否会抓到 publication 缺失、真假布尔和 Learning/Dictionary 矛盾态；
- 是否有无关字段变化。

Codex 通过后再提交；不 push，不发布远端内容。

## 9. 回滚

本提交必须保持单一职责。通过复核并 commit 后，回滚方式是对该提交执行 `git revert <commit>`，同时恢复脚本、测试和两份 JSON。

不得手工只回滚其中一份内容包；那会让联网/离线用户得到不同 publication。不得用未核路径的 `git checkout --` 或 `reset --hard`。

## 10. 明确禁止

- 不修改 `App.js` 或接入 selector；
- 不修改 `publication.ts` 的业务规则；
- 不开始 Commit 3；
- 不改 SRS、session、`showDrafts`、UI 文案或词书计数；
- 不给任何词新增 `verified` 或 evidence；
- 不因审计输出顺手修例句、声调、词源、标签或地点；
- 不 push `develop/v2`，不执行内容发布脚本；
- 不把 dry-run 生成的临时文件、审计报告噪音或备份文件加入提交。

## 11. CC 报告必须回答

1. 开工前两个 SHA、字节一致性和基线测试；
2. 实际修改文件；
3. dry-run / apply / check 的完整统计；
4. 两份迁移后 SHA、大小、`numstat`；
5. 如何证明非 publication 字段零变化；
6. 如何验证失败前不写、重复 apply no-op、单边中断可修复；
7. 新增测试及至少四个篡改验证：删 publication、把 boolean 改字符串、制造 learning-without-dictionary、删 basis；
8. `check-content-release.sh`、`npm test`、typecheck 结果；
9. 明确写“兼容迁移不等于真实性核验”；
10. 停止声明：未接 App、未开始 Commit 3、未 commit、未 push。
