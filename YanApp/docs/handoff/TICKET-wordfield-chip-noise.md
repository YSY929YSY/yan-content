# 工单 · 词场对齐行与 chip 行去噪

> 先读 `AGENTS.md`（功能线并行、第四节完成标准、第五节报告要求）。
> **不开分支**（不改内容包），`develop/v2` 直接提交。

## 本轮决策指标（5-4）

**指向词卡自己的 chip 数：244 / 276 → 0**

这是「点了原地不动」的死按钮数量，出现在 **88.4%** 的词场卡上，用户每张都看得见。
复算：
```
node -e 'const w=require("./assets/content.fallback.json").wordBank;const f=w.filter(x=>x.wordField?.sentence?.jp);console.log(f.filter(x=>(x.wordField.members||[]).some(m=>m.id===x.id)).length+" / "+f.length)'
```
⚠️ 上面这条数的是**内容包里的 members**。本轮**不改内容包**，改的是渲染端过滤，
所以这条命令的值不会变 —— 报告里要给的是**渲染出来的 chip 数**，
用一条针对渲染函数的测试来数，命令自己写进报告。

## 这张工单把主线推迟多久

**约半轮。** 不推进词场条数，但 276 条词场 2026-08-31 才第一次真正发布到设备上
（见 `REPEATED-MISTAKES.md` 第 9 条），**这是它们第一次被真人看见**。
先把可见的噪声去掉，再往上加内容。

## 背景

2026-08-31 负责人在真机上看 `聞く` 的词场卡，一眼看到两处噪声：

1. **chip 行**：`聞く 听;问` · `名前 名字` —— 第一个 chip 就是这张卡自己，点了原地不动。
2. **对齐行**：`名前 が 呼ば れる の を 聞い た 。` 下面的注解行，最后一格是 `。` 对应 `。`。

## 要做什么

### F-1 · chip 行过滤掉自己

渲染 `members` chip 时跳过 `m.id === entry.id`。

- **不改内容包**，`members` 里的自身条目保留（它参与高亮与对齐，不只是 chip 来源）。
- **⚠️ 有 8 条 `members` 里只有自己**（`n5_ie` `n5_okashi` `n5_kata` 等），
  过滤后 chip 行为空。**整行不渲染**，不要留一个空的容器或占位边框。
  复算这 8 条：
  ```
  node -e 'const w=require("./assets/content.fallback.json").wordBank;console.log(w.filter(x=>x.wordField?.sentence?.jp&&(x.wordField.members||[]).length===1&&x.wordField.members[0].id===x.id).map(x=>x.id).join(" "))'
  ```

### F-2 · 对齐行不给标点注解

`src/features/wordbank/wordFieldAlignment.js:4` 有一张显式映射表：
```
'、': '、', '。': '。', '？': '？', '！': '！',
```

**这是有人特意写的，不是 bug 溢出 —— 本轮是推翻它，不是修它。**

理由用同一份文件里已有的判据（`wordFieldAlignment.js:73`）：
「对齐行是**辅助行**，不能喧宾夺主」。`。` 对应 `。` 不提供任何信息，纯占位。

**做法**：标点 token 的注解位**留空**，但**保留它的列**（不要让后面的词整体左移，
那会打断日语与注解的逐列对应）。

## 🔴 硬约束

1. **不改内容包**，不改 `members` 数据本身。
2. **不碰高亮与对齐算法**：成员高亮 370/370、括号不闭合 0，是上一轮的成果，
   本轮只动「显示不显示」。回归测试必须仍绿。
3. `wordFieldAlignment.js` 在只读清单里的邻居很多，**只动标点映射这一处**，
   不顺手重构（不变量 6）。
4. 新增测试放 `__tests__/`（不变量 10）。

## 验收

1. `npm test && npm run typecheck && npm run audit`
2. **变异验证**（写明「改坏什么 → 哪条测试红」）：
   - 把 chip 过滤去掉 → 必须转红
   - 把「8 条空 chip 行整行不渲染」改成渲染空容器 → 必须转红
   - 把标点留空改回输出标点本身 → 必须转红
3. **决策指标前后值**：渲染出的自指 chip 数 **244 → 0**（给数法）。
4. **对齐列数不变**：F-2 之后，日语 token 数与注解列数仍然一一对应，
   给一条全库统计命令证明 276 条都没错位。
5. **web 预览截图**（本仓库 2026-08-31 起可用）：
   ```
   npx expo export --platform web --output-dir /tmp/webcheck
   ```
   给 `聞く` 词场卡改前改后各一张。**这一条替代真机截图**，不要再让负责人代拍。

## 报告

按 `AGENTS.md` 第五节写 `ACTIVE.md` + `CC-REPORT.md`，含 5-2 异常自查。**写完记得提交。**
