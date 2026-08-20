# 实施工单：P0-2 · 远端内容结构闸门

> 实现者：Codex
> 独立复核：CC（短审）
> 状态：已完成
> 依据：`TICKET-runtime-content-schema.md`、`CC-REPORT.md` §46–§53

## 目标

合法 JSON 但错误结构的远端内容或磁盘缓存，不能写入/进入 App；网络失败仍可使用旧的有效缓存；远端 304 却拿不到有效缓存时才清 ETag。App 继续以 bundled fallback 作为最终安全退路。

## 允许的最小文件范围

- 新增 `src/lib/contentSchema.ts`；
- 新增 `src/lib/contentCacheCore.ts`；
- 修改 `src/lib/contentCache.js`，仅作 Expo 文件系统/AsyncStorage 适配；
- 新增对应 Node 测试；
- 更新交接文档与报告。

禁止修改 `App.js`、内容 JSON、publication、内容生产脚本、页面和文案。

## 最小运行时结构

根节点为普通对象。

必需数组：`scenes`、`mapPlaces`、`culturalFusion`、`kanaRows`、`wordBank`。

必需对象：`subwayAdventure`，且 `subwayAdventure.stations` 为数组。

可选但若存在必须为数组：`voicedRows`、`yoonRows`、`specialRows`、`loanwordRows`。

可选但若存在必须为对象：`_meta`。

不检查 `wordCards`、`specialSounds`、`cultureNotes`、未知字段、数组长度和元素细节；不做内容真实性或 publication 判断。

## 结构与可测性设计

`validateContentShape(value)` 是纯函数，返回 `{ ok, reason }`；`reason` 仅含路径与类型，不含内容值。

`contentCacheCore` 也是纯函数边界：接收网络/存储适配器并处理 200、304、网络失败。不要让 Node 测试 import Expo 模块。`contentCache.js` 用默认适配器调用 core，对 App 公开的 `fetchContent(url, options)` 签名保持不变。

## ETag 不变量

- 200 + 结构无效：不写缓存、不更新/清除 ETag；尝试有效旧缓存。
- 304 + 无效或缺失缓存：清 ETag，返回 none。
- 网络失败 + 无效或缺失缓存：不清 ETag，返回 none。
- 所有失败路径均不得覆盖旧有效缓存。

## 测试矩阵

1. 200 + 合法包 → network，写内容和 ETag；
2. 200 + `{}` + 旧有效缓存 → cache，不写、不清 ETag，旧缓存内容不变；
3. 200 + `wordBank` 为对象 + 无缓存 → none；
4. 200 + 合法包且 `wordCards` 为对象 → network；
5. 304 + 有效缓存 → not-modified；
6. 304 + 缓存缺失 → none，清 ETag；
7. 304 + 坏缓存 → none，清 ETag，缓存内容不变；
8. 网络失败 + 有效缓存 → cache；
9. 网络失败 + 坏缓存 → none，不清 ETag，缓存内容不变；
10. bundled `assets/content.fallback.json` → validator 通过。

每个分支测试必须断言写/清 ETag 的调用情况，不能只断言返回 source。

## 交付与停点

开工前记录基线。完成后跑 `npm test`、`npm run typecheck`、`git diff --check` 与 iOS Expo bundle；提交前停下，交 CC 只审本工单 diff。不得 push。

## 实现记录（2026-08-20）

- 新增纯 `contentSchema` 与纯 `contentCacheCore`；Expo 文件系统/AsyncStorage 留在原适配层，App 调用签名不变。
- 远端 200、304、网络失败均通过同一结构闸门；ETag 只在 304 无有效缓存时清除。
- 新增 schema/core/接线测试；内置 fallback 也已通过同一 validator。
- CC 短审通过后，补齐安全绑定的 fetch 调用、成功路径 ETag 断言、非对象根节点与 `wordCards` 数组用例。
- 最终验收：`npm test` 562/562、`npm run typecheck`、`git diff --check`、iOS Expo bundle 均通过。
- 篡改验证：移除 200 结构闸门会挂 2 条；网络失败时清 ETag 会挂 1 条；源码均已还原。
