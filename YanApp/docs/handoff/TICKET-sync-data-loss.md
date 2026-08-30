# 工单 · 同步链三处数据丢失（M1/M2/M3，上架前必修）

> 先读 `AGENTS.md`（**第二节红线：同步体系不可触碰** —— 本工单是例外，
> 因为它修的正是不变量本身；每一处改动都要在报告里对照不变量说明）。
> **本轮不碰内容包、不碰 UI、不碰词场/gloss。**

## 本轮决策指标（5-4）

**能造成不可逆用户数据丢失的路径数：3 → 0。**

不是"加了多少判断"，是**那三条路径是否还能走通**。每条都要有测试证明走不通了。

## 这张工单把主线推迟多久

**它不在主线上，但它是上架前的门槛。** `DECISIONS.md`「上架前审核」第一优先那五项
里有两项（删账号回收照片、schema 是否真跑过）直接依赖这里。

## 来源

一次冷启动外部审计（审计方未看过此前任何对话与报告）。
**M1 与 M4 我已独立复算；M2/M3 我读了代码确认形状成立，但没有构造运行时复现。**
`grep -rln "pullPocket\|deleteAccount\|getSessionUser\|signInAnonymously" src/**/__tests__/`
返回空 —— **这三处目前零测试覆盖。**

---

## M1 · `pullPocket` 返回空数组会把本机口袋整个抹掉

`src/lib/sync.js:325-338` + 消费点 `App.js:2083-2089`

```js
// sync.js: 空表返回 []，只有 catch 才返回 null —— 两者不可区分
return (data || []).map(row => row.word_key).filter(Boolean);

// App.js:2085
if (!alive || remote === null) return;      // 只挡 null，不挡 []
if (pocketGuard.current.allow()) writeJson(K.pocket, next);   // [] 被落盘
```

**失败场景**：匿名用户离线时往口袋加词 → `pushPocket` 走 catch，界面说"已存本机，
联网后同步" → **但没有重传路径**：`backfillAll` 只由 `App.js:6557` 的 Apple 登录
和 `App.js:6570` 的 pending 重试触发，而后者第一行是
`if (!user || user.is_anonymous) return;` → 下次联网启动，云端确实是空表 →
返回 `[]` → 越过守卫 → 本机口袋清零。

**对照**：打卡链做对了 —— `footprintMerge.js:33` 把非对象一律判 `ok:false`，
`mergeIds` 取并集、本地优先。**口袋链做反了。**

**要做的**

- 让"拉取失败/无会话"与"云端确实为空"**可区分**（返回结构而非裸数组，
  参照 `footprintMerge` 的 `{ok, ids}` 形状）
- 空表**不得覆盖非空本地**。是否合并（并集）还是保留本地，**按不变量 4 fail closed 取最保守**
- 顺带说明：匿名用户的离线待传为什么没有重传路径 —— **本轮只报告，不擅自改触发条件**

---

## M2 · `getSessionUser()` 会在补传途中静默新建匿名账号

`src/lib/sync.js:10-18`，被 `backfillProgress:89`、`backfillCheckins:153`、
`pullPlaceCheckins:343`、`pushPlaceCheckin:385`、`uploadPlaceCheckinPhoto:421` 调用

```js
if (session?.user) return session.user;
const { data, error } = await supabase.auth.signInAnonymously();   // ← 铸新账号
```

**失败场景**：Apple 登录后 `backfillAll` 开跑，途中 token 刷新失败 / `getSession()`
瞬时返回 null → **铸一个全新匿名 uid**，把全部进度和打卡 upsert 到那个一次性账号 →
返回 `{count:N, error:null}` → `backfillAll:281` 判定全成功 → 清掉 `K.backfillPending`。

**而 `sync.js:189` 自己写着「这次补传是唯一的迁移机会，漏掉的就是永久漏掉」。**

**同一个文件里有两套身份语义**：`pushProgress:30` / `pullProgress:297` /
`pushPocket:52` / `pullPocket:328` 用 `getSession()`，拿不到就 `return`；
`getSessionUser()` 却会造账号。

附带：`deleteAccount()` 之后已 `signOut`，此时任何足迹刷新都会**立刻重建一个匿名账号**。

**要做的**

- **补传路径一律不得新建账号**。拿不到会话就失败并**保留** `K.backfillPending`
- `signInAnonymously()` 的调用点收敛到明确的"首次启动/重建匿名身份"入口，
  不要藏在通用取会话函数里
- 统一文件内两套语义，或明确命名区分（如 `requireSession()` vs `getOrCreateAnonUser()`）
- **不变量 4 对照**：拿不到身份 = 最保守 = 不写

---

## M3 · 删账号时 Storage 列举失败 = 静默跳过，账号一删文件永远成孤儿

`src/lib/supabase.js:119-132`（`listAllUnder`）+ `134-175`（`deleteAccount`）

```js
if (error || !data?.length) return [];                    // 出错与"确实没有"压成同一返回
if (paths.length) await supabase.storage...remove(paths); // remove 的 error 没接
const { error } = await supabase.rpc('delete_my_account'); // 然后账号就没了
```

三个叠加缺陷：
1. `list()` 报错 → 返回 `[]` → 一个文件都不删，**也不 warn**
2. `limit: 1000` **无分页** → 素材超过 1000 的用户从第 1001 个起全部漏删
3. `remove()` 的 error 完全没接

而 `schema.delete-account.sql:48-52` 明确说明照片只能由客户端在调用该函数**之前**删。
`auth.users` 一删，RLS 策略 `(storage.foldername(name))[1] = auth.uid()::text`
再没有任何身份能匹配 —— **那些文件谁也删不掉了**。

**用户看到的是"已删除，你的数据已从言里移除"（`App.js:6530`），实际照片还在。**

**要做的**

- `listAllUnder` 区分"出错"与"为空"；**出错必须向上传播**
- 加分页（`list` 的 offset 循环），并在报告里说明上限怎么定的
- `remove()` 的 error 必须接
- **任何一步失败，都不许继续调用 `rpc('delete_my_account')`** —— 停下来告诉用户
  "删除未完成，请重试"，不要给出已删除的错觉（不变量 4 + 不变量 7 说人话）

---

## 一并处理（建议档，同一文件）

### S1 · 口袋不做别名折算

`src/features/wordbank/pocket.js:2,6,27` 的 `pocketKey`/`normalizePocket`/`pocketWords`
**都不调 `canonicalKey`**，而进度侧 `srs.js:117` 调了。
269 个别名源键在当前内容里**一个都不存在**，所以合并前收藏的词全部匹配不上、从口袋消失，
且 `backfillPocket` 会把死键永久推上云。

**注意不变量 1**：折算必须在**读盘时**做，**不许改进度键格式本身**。

### S2 · `pushProgress` 不检查数据库返回的 error

`src/lib/sync.js:35-42` 的 `upsert` 和 `delete` 都没解构 `error`。
RLS 拒绝、约束冲突、schema 没跑，全部表现为静默成功。
同文件 `pushPocket:59,63` 做对了（`if (error) throw error`）。`useReview.js:95` 同样忽略返回值。

---

## 明确不做

- ❌ 不碰内容包、不碰 UI、不碰词场/gloss（另有工单）
- ❌ **不改进度键格式**（不变量 1 —— 改了等于所有线上用户进度归零）
- ❌ **不改 `srs.js` 的评分算法**（不变量 3）
- ❌ 不改 `push-content.sh` / 闸门（M4 另有工单）
- ❌ 不动 `journalSync` 只推不拉（P1，已书面承认的取舍）
- ❌ 不连远端、不碰生产凭据

## 验收

- 异常自查（5-2）；数字附复算命令（5-1）
- **决策指标**：三条路径各有一条测试证明走不通了
- **变异验证逐条**：把每处修复改回原样 → 哪条测试转红
- 逐条对照 `AGENTS.md` 第二节的不变量说明改动为什么不破坏它们
- 新增测试放 `__tests__/`（不变量 10）
- `npm test && npm run typecheck && npm run audit`，`git status --short` 干净

## 报告里必须单独回答的三件事（代码证明不了，交负责人）

1. **生产库到底跑没跑 `schema.apply-all.sql`** —— `storage.js:122` 自己写着"至今未验"。
   给出需要在 Dashboard 里确认的**具体表名与列名清单**。
2. **删账号是否真的回收了旧前缀的照片** —— 给出一份可照做的真机验证步骤。
3. **`stamp-wordbank-publication.py --check` 已失效**（写死字节数快照，内容一动就红），
   而 `publication-content.test.mjs:7` 把 563 的验收转包给了它，
   且它不在发布闸门的 5 步里 —— **所以现在没有任何自动检查在守 563**。
   给出修法建议，**本轮不改**。

## 做完写哪里

`ACTIVE.md` + `CC-REPORT.md`（直接追加末尾 —— 5-5）。
