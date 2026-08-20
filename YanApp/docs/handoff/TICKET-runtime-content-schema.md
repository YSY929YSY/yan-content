# 工单：P0-2 · 远端内容运行时结构闸门

> 实现者：待定  
> 复核者：CC（先做影响分析，后做短审）  
> 状态：影响分析完成，待 CC 核对  
> 前置：P0-1 已完成并推送；本工单不生产、不修改内容

## 要解决的问题

`src/lib/contentCache.js` 当前只在下载后执行 `JSON.parse(text)`。因此一个语法正确但结构错误的远端包（如 `{}`、`wordBank: {}` 或缺少五十音/地点/地铁字段）会被写入 `yan_content_v2.json`，并被 `useContent()` 交给整个 App。

更糟的是，写入后的下一次请求若收到 HTTP 304，客户端会直接读取这份缓存；网络失败时也会把它作为 cache fallback。也就是说，错误结构能跨启动存活，直到远端内容再次变化或用户清缓存。

这是缓存边界问题，不是内容真实性问题：本工单只判断“是否具备 App 可安全消费的最低结构”，不评价词义、例句、翻译、声调或 publication。

## 已核实的调用链

```text
App.js useContent()
  → fetchContent(CONTENT_URL)
    → HTTP 200: JSON.parse → writeCachedContent → setContent
    → HTTP 304: readCachedContent → setContent
    → 网络错误: readCachedContent → setContent
  → 无有效远端/缓存时才继续使用 bundled fallback
```

当前内置包顶层包含：`_meta`、场景/地点、五十音组、`subwayAdventure`、`culturalFusion`、`wordBank`、`wordCards` 等。`scripts/validate-content.js` 是发布期旧脚本，当前对新增顶层字段和地点类型会产出噪声；它不能被直接搬到运行时。

## 产品与安全决定

1. 远端包、缓存包都必须通过同一份**最小运行时结构校验**，否则一律视为不可用。
2. 远端 200 结构无效时：不得写内容文件、不得更新 ETag；优先保留并使用已通过校验的缓存，否则继续使用 bundled fallback。
3. HTTP 304 但缓存缺失或结构无效时：清 ETag，返回不可用，让 App 保持 bundled fallback；不得把坏缓存传入 `setContent`。
4. 网络失败时：只允许回退到已通过校验的缓存；否则 bundled fallback。
5. bundled fallback 也在开发/测试中跑相同 validator，防止“保护了远端却把坏包随二进制发出去”。
6. 校验失败只记录结构路径/原因；不得把完整内容、用户数据或网络响应输出到日志。

## 最小结构（不是完整发布契约）

运行时只需要锁住会让主要页面直接失效的边界：

- 根节点为普通对象；`_meta` 为对象且具有非空版本标识；
- `scenes`、`mapPlaces`、五个假名行数组、`culturalFusion`、`wordBank` 均为数组；
- `subwayAdventure` 为对象，`stations` 为数组；
- `wordCards` 若存在必须为数组（可为空）；
- 不冻结数量、不要求所有数组非空、不限制未知顶层字段；
- 不校验单词/例句的真实性、完整性或 publication，避免和 P0-1/P2-2 混层。

最终字段清单必须由 CC 用实际 App 消费点复核；不得凭本工单文字自行扩张成内容质量审查器。

## 允许修改

- 新增纯函数 validator（可在 Node 测试中直接运行）；
- `src/lib/contentCache.js` 的读取、写入、ETag 与 fallback 分支；
- 对应单元测试、静态接线测试；
- 本工单、`ACTIVE.md`、`ROADMAP-STATUS.md`、`CC-REPORT.md`。

## 禁止修改

- `assets/content.fallback.json`、`yan-content/content.v2.json`、内容生产脚本与 publication；
- App 页面/文案/学习与评分行为；
- 将旧 `scripts/validate-content.js` 整段复制进 App；
- 修改远端仓库内容或 push，直到独立复核通过。

## CC 核对任务（只读）

1. 复现 200/304/network-error 三条路径，确认缓存写入和消费点；
2. 列出所有实际读取的顶层字段，判断“最小结构”是否漏项或过宽；
3. 证明 validator 应位于下载/写缓存之前，且缓存读取也会调用它；
4. 检查 ETag 的失败语义；
5. 写出允许实现的最小 diff 与验收矩阵，不编码。

## 未来实现验收

| 场景 | 预期 |
|---|---|
| 200 + 合法包 | 返回 network，写入内容与 ETag |
| 200 + `{}` / 错误字段 | 不写内容、不更新 ETag；使用有效缓存或 fallback |
| 304 + 缓存不存在/无效 | 清 ETag；不返回坏内容 |
| 网络失败 + 无效缓存 | 不返回坏内容 |
| 有效缓存 + 网络失败 | 返回 cache |
| bundled fallback | 通过相同最小结构校验 |

所有失败测试必须同时断言“旧有效缓存未被覆盖”，而不只是断言函数返回 `null`。
