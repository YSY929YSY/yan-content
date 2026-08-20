# 当前状态 · P0-1 Commit 3 已提交，待真机验收

> 状态：Commit 3 已提交；待真机验收
>
> 当前工单：`docs/handoff/TICKET-publication-behavior.md`
>
>
> 更新日期：2026-08-20

Commit 1（selector）与 Commit 2（显式 publication 迁移）均已完成并通过独立复核。数据迁移是**兼容迁移，不等于真实性核验**。

本轮已接入既有 selector 到 App 的主线、词书、搜索详情和详情评分入口，并更新已确认的 UI 语义；未修改内容 JSON、迁移脚本或通用 `grade()`。

分工：

- Codex：Commit 3 已创建；不再修改本轮实现；
- CC：短审已通过，无阻塞项；
- 同一文件同一时间仍只允许一个实现者。

下一步只做真机验收：优先打开 N3/N2/N1，确认空态与“浏览词典”；再确认一条 dictionary-only 详情无评分、一条旧 record 仍可评分。通过前仍不 push、不发布远端内容。

## 非阻塞后续硬化

`write_all_atomic()` 已保证“两个临时文件都准备成功后才替换第一个目标”。极端情况下若第二个 `os.replace` 本身失败，脚本可留下第二个临时文件；内容状态会是“精确 migrated + baseline”，可由经过完整 SHA/投影验证的单边恢复收敛，不会复制未验证内容。未来若继续复用这类双文件写入器，再补 replace 阶段异常清理；不阻塞这次一次性迁移提交。
