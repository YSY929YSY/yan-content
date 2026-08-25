# 工单 · 主线：词场从「自己造句」改成「从 Tatoeba 筛」

> 先读 `AGENTS.md`，**特别是第〇节（主线是什么）**。
> **这是主线工单。** 其余 UI 打磨（batch 9 的 B9-2 等）一律排在它后面。

## 为什么主线一直推不动

不是「被 UI 挤走」那么简单。更根本的原因是：

**词场和深卡都要写日语句子，而自然度我和 Codex 都判不了。**
现有 20 条词场至今标着「未经母语者确认」。
UI 打磨之所以一直插队，是因为**它是唯一不需要日语能力的活**。

## 解法：不造句，去筛

仓库里已经躺着完整的 Tatoeba 语料：

```
tools/data/tatoeba/
  jpn_sentences.tsv     248,758 句   ← 母语者写的
  cmn_sentences.tsv      87,264 句
  links.csv          28,213,248 行   ← 日中对齐
  jpn_lemma_index.pkl                ← 词形索引，已建好
  jpn_to_cmn.pkl                     ← 日→中映射，已建好
tools/tatoeba-examples.py            ← 现成脚本，读的就是这些
tools/tatoeba-align.py
```

**词场的定义天然适合筛选**：`content-standard-wordfield.md` 要求
「用一个句子让成员同框出现」+「成员必须真的出现在句子里」——
筛选**天生满足**后者，而句子来自母语者，前者的风险大幅下降。

⚠️ 但**「有 ID 和许可不等于地道」**（`AUDIT-source-trust-2026-08-22.md` §8）。
筛出来仍是 **candidate**，不是已审。

---

## M1 · 筛候选（纯脚本，只读，不碰内容包）

### 要做的

新增 `scripts/wordfield-candidates.mjs`（或复用 `tools/tatoeba-examples.py` 的读法），
从 Tatoeba 里筛出适合做词场的句子。

**筛选规则**（宁缺毋滥）：

| 条件 | 判据 |
|---|---|
| 同框 | 句子里**至少 2 个**主线池词（563 条 `kanji_anchor`）——这是词场的定义 |
| 长度 | 教学用，**不要长句**。建议 ≤ 20 字，且 ≤ 8 个 token |
| 有中文 | 必须能通过 `links.csv` / `jpn_to_cmn.pkl` 找到对应中文句 |
| 无生僻 | 句子里的词**尽量都在词库里**（查不到的词越少越好，作为排序权重） |
| 去重 | 同一组成员词只留最好的 1–2 句 |

### 产出

`staging/wordfield-candidates-tatoeba.jsonl`，每条包含：

```
锚词 id / 句子 jp / 句子 zh / Tatoeba 句子 ID（日、中各一）/ 命中的成员词 id 列表 /
句子里查不到的词（用于人工判断难度）
```

⚠️ **必须带 Tatoeba 句子 ID** —— 没有可定位 ID 的句子不能用
（`TICKET-source-audit-contract.md` §3：locator 必须能让人回到同一处）。

### 报告里必须给出

- 563 条主线池里，**有多少条能找到合格候选**（这个数决定主线能推多远）
- 候选总数、平均每个锚词几条
- 抽 10 条贴进报告，**让项目负责人先看质量再决定要不要落库**

### 明确不做

- ❌ **不写内容包**（这一步只产出 staging）
- ❌ 不改现有的 20 条词场
- ❌ 不用 LLM 造句或改写句子 —— 用的就是原句，改了就不再是母语者写的
- ❌ 不下载新数据（语料已在本地）

### 验收

- 脚本只读，跑两次 `git status` 干净
- 每条候选都有 Tatoeba 句子 ID
- 每条候选的成员词**确实出现在句子里**（机器自检，别靠人看）
- `npm test && npm run typecheck && npm run audit`

---

## M2 · 落库（**等 M1 的样例过目之后再做**）

从候选里选一批落进内容包。**本工单不预设数量**——先看 M1 的质量。

- `auditWordFields()` 必须零报错
- 每条标明来源：Tatoeba 句子 ID
- 仍标「未经母语者确认」——**筛选降低了风险，没有消除**
- 内容包改动：两份文件同一 commit，`_meta.version` 递增一次

---

## M3 · 便利店剩下 29 条释义审校（低优先，但备料早就好了）

`staging/convenience-meaning-review.json` 从 batch 2 挂到现在。
35 条里**已审 6 条、未审 29 条**。

`scripts/meaning-audit.mjs` 已经能把「需要人看的」挑出来。
**先跑它，只把机器标出可疑的那几条给项目负责人**，其余按现状保留
（不写 `meaning_zh_status` = fail closed 判机器稿，这是诚实的）。

---

## ⚠️ 本批不需要构建

主线全是**内容和脚本**：

- 脚本改动 → 不进 App
- 内容包改动 → 走 `push-content.sh` 远端发布，**已装的包自动拉到**

**8 月 iOS 构建额度只剩 1 次，要留给另一个项目。**
JS 改动如果确实需要上真机，用 **EAS Update 热更新**，不消耗构建额度：

```bash
npx eas-cli update --branch preview --message "描述"
```

（`RULE.md` EAS 那节写着「普通 JS/内容修改不需要重 build，热更新即可」。）

## 不变量

照 `AGENTS.md`。本批特别相关：

- 不改 `units.js`（`auditWordFields` / `wordFieldUnits` 只读）
- 不改 `publication.ts`、不动 `publication.learning` 的成员
- 不改 `yanFeatures`，`kanji_anchor` 仍是 563
- 不许顺手做 batch 9 的 B9-2 或任何 UI 打磨

## 做完写哪里

`ACTIVE.md` + `CC-REPORT.md`，贴 `git status --short` 和 `npm run audit` 原始输出。

**并更新 `AGENTS.md` 第〇节里的主线进度数字**（词场 20/563 → 新数字）。
