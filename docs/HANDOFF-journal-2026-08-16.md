# 手账重构 · 交接(2026-08-16)

分支 `develop/v2`。三个 commit,全部本地已提交,**未推送**。

```
3108a5a  feat(journal): 第二批 —— 画布交互
3668f23  test(wordbank): 词条 id 护栏
3087a23  feat(journal): 第一批 —— 数据结构与视觉常量
```

验证状态:`npm test` 400/400 · `npm run typecheck` 0 错误 · `npx eslint` 0 error
(只剩 `JournalPage.js` 一条既有 warning,不是这轮引入的)

---

## 0. 先读这个:哪些验过、哪些没验

| | 状态 |
|---|---|
| 数据结构、迁移、手势数学、层级、id 护栏 | ✅ 有测试,且做过篡改验证 |
| **RN 渲染、真机手势、纸的比例、60fps** | ❌ **一次都没在设备上跑过** |

第二批工单要求的五条验收(60fps 截图 / 双指同时 / 拖出纸外不裁 / 连拖三次三个角度 / 层级菜单)**一条都没做**,它们全部需要设备。
下次开工第一件事就是跑起来看,不要在没跑过之前继续往上叠第三批。

---

## 1. 权威源

- 工单:`~/Downloads/手账工单包.zip` 里那份 **274 行**的
  ⚠️ `~/Downloads/手账重构工单.md` 是 **247 行的旧版**,少了整个「第四批预告」,措辞也不同。**以 zip 里那份为准。**
- 参考实现:`yan-journal-v2.html` / `yan-cutout-lab.html`(同一个 zip)
  ⚠️ 用户在浏览器里打开时**页面是空的** —— 只有写死在 HTML 里的胶带/装订孔/日期出来了,8 个 `makeItem()` 生成的元素一个都没渲染。脚本被拦或报错,原因未查。**「唯一标准」目前谁都没真正见过它满页的样子。**

---

## 2. 已确认的设计决定(用户 2026-08-14 逐条拍板)

| 项 | 决定 |
|---|---|
| 字段与坐标 | 全按工单改:`type` / `zIndex` / 页面单位(可负) |
| 坐标锚点 | **中心**(工单没写,命中测试和文字元素测量都要它) |
| `w/h` | **提到基类**,不放 payload(几何逻辑不该 `switch(type)`) |
| 笔迹 | **页级** `JournalPage.strokes`,不是一种 item |
| 册子 | `JournalBook`(手动)与 `cityId`(自动)**两套并存** |
| 类型集 | **9 种**(工单 8 种 + `scan`) |
| 橡皮 | `Stroke.tool: 'pen'\|'eraser'` —— 不存成笔就没法回放/撤销 |
| 抠图 | `style` **4 种**(加 `illus`,纯像素运算,与第四批要钱的 AI 插画化只是重名) |
| 图片引用 | payload 存 `assetId` **不存 uri**(iOS 容器 UUID 每次装应用都变) |
| `material`/`lift` | **保留**(工单没提;阴影不画死在素材里) |
| 类型方案 | TS,**只限手账目录**;`tsconfig` 已开 strict |
| 词条 id | 已存在,**不用补**,详见第 4 节 |

偏离工单的 7 处连同理由,全部写在 `journalTypes.ts` 文件头。**改之前先读那段。**

---

## 3. 文件地图

```
src/features/journal/
  journalTypes.ts       类型 + 画布几何 + 导出规格。第一批地基
  journalTheme.ts       视觉常量。⚠️ 参考 HTML 的纸是 420px 宽,
                        所有长度都按 1000/420≈2.381 换算过,别直接抄 19
  journalMigrate.ts     v1 → v2 迁移。纯函数,随机源可注入。跑完可删
  journalCanvas.ts      手势数学。纯函数 + 'worklet',两边都能跑
  JournalItemView.tsx   单元素:Pan / Pinch+Rotation(Simultaneous)/ Tap / LongPress
  JournalCanvasView.tsx 纸、装订孔、日期角标、纸纹。裁在画布,不裁在纸
  JournalScreen.tsx     整屏,已接进 App.js

  JournalDevScreen.js   ⚠️ 旧屏,已无人引用,**故意没删**
  JournalPage.js        ⚠️ 同上 —— 新屏真机验过再清,否则新的跑不起来就没退路

src/lib/
  storage.js            新增 journalPagesV2 键(不覆盖 v1)
  journalStore.d.ts     给 journalStore.js 补的类型声明。⚠️ 手写的,改 .js 要同步改
```

测试:`src/lib/__tests__/journal-v2.test.ts`(26)、`journal-canvas.test.ts`(21)、`wordIds.test.mjs`(8)

---

## 4. 一处需要纠正的旧结论

上一轮我判断「词库没有稳定 id、需要补」,**这是错的**。

实测:8005 条**每一条都已有唯一 id**(形如 `n5_en`),0 重复、0 缺失,`词-读音` 与 id 一一对应。
而且「只增不改 + 永久别名」的方案早就建好了 —— `src/features/wordbank/keyAliases.js`,292 行,2026-08 合并 267 组时做的。

所以那一批实际做的是**护栏**不是补 id,而且**没有改动任何 content.json**。
护栏在 `wordIds.test.mjs`,守三件事:两份词库(远端 `content.v2.json` / 内置 `content.fallback.json`)id 集合一致、同 id 指向同一个词、清单里的 id 一个都不能少。

---

## 5. 下次开工的顺序

1. **跑起来看。** 第二批的五条验收全部需要设备截图。
2. 验过之后:把 `journalMigrate` 接进 `JournalScreen`(现在写了但没接),把 v1 那一页导进 v2。
3. 再删 `JournalDevScreen.js` / `JournalPage.js`。
4. 用户报过的 bug,归到第二批一起看:
   - 「只有一页,**无法翻动**」—— 翻页在画布层,现在也还没做
   - 素材 `3024×4032` 说明**缩图没生效**;15 张里解码失败 5。
     缩图代码在 `journalStore.downscaleTo`,两种可能:老素材是加缩图之前进来的(不会补跑),
     或 `Skia.Surface.Make` 在真机上失败。下次上传时看控制台有没有 `[Journal] 缩图失败`
5. 第三批(手写/扫描/抠图)**要用户点头才开**(工单红线 1)。

---

## 6. 这轮踩到的两个测试陷阱(值得记住)

**一、断言的阈值取自被测常量本身,测试永远不可能失败。**
角度断言第一版写的是 `|rotation| >= JITTER.minMagnitude` —— 把常量改成 0,断言就变成 `>= 0`,26 条照样全绿。改成字面量 `VISIBLY_TILTED = 1.0` 之后同样的篡改会挂 2 条。

**二、测试在写错的代码上通过、在改对之后失败。**
`schemaIdempotent` 的正则用 `\w+` 匹配表名,不含点,把 `on storage.objects` 截成 `storage`,于是去找一条正是被修掉的错写法。上一个 commit 因此留了一条红的没被发现。

共同的教训还是那条:**「有测试」和「这条路径被测到了」是两回事**,而且断言要写要求的**含义**,不是它的弱化代理。
每加一条关键断言就篡改一次实现,看它会不会挂 —— 这轮靠它抓到了上面第一条。
