# 言 · 学习线交接

写给接手「学习线」的新会话。旅行线的工作已经告一段落,两条线文件几乎不重叠,
可以独立推进。

---

## 一、先读这些

代码在 `/Users/yangshiyao/my-app/YanApp`,**git 仓库根目录是 `/Users/yangshiyao/my-app`**
(不是 YanApp 本身)。当前分支 `develop/v2`。

```bash
cd /Users/yangshiyao/my-app/YanApp && npm test     # 134 个测试,应全绿
```

测试只覆盖 `src/lib` 和 `src/features/*` 里的**纯函数**。UI 和 React hook 零覆盖 ——
这是刻意的取舍:能测的抽出来测,测不了的靠真机验。

---

## 二、学习线现在是什么样

### 五十音

`src/features/kana/KanaScreen.js`(3278 行,含 500 多行笔顺数据表)。
从 App.js 抽出来的,对外只导出 `KanaScreen` 一个符号,零外部依赖。

**已知缺口**:没有掌握度、没有易错记录、没有复习入口、没有诊断测试。
大部分状态离开页面就消失。

### 词书

`WordBankScreen` 仍在 App.js 里(约 1509-1700 行区间,搜 `function WordBankScreen`)。

**核心问题 —— 这是学习线最该修的**:

```js
WB_NEXT_STATUS = { new: 'learning', learning: 'mastered', mastered: 'new' }
```

只有三个状态循环切换。然后:

- **「今日 10 词」是组件内存里的**(`todayKeys` 是 useState)。退出页面就没了,
  重进重新挑,而且挑的是词库里**头 10 个** `new` 状态的词,不是按任何计划。
- **「继续复习」只是个筛选器**,筛出所有 `learning` 的词。不是队列,没有顺序。
- 没有:下次复习日期、错误次数、遗忘记录、任何形式的测验。

所以它是**一张带三态标签的词表**。用户标记完之后,系统不知道他什么时候
该再见到这个词。每次打开都是从头开始,没有累积。

词库数据:`assets/content.fallback.json` 的 `wordBank`,8298 条。
其中 N5/N4 的 1343 条是精修的(例句 100%),N3 以上 6955 条是机器起草
(`status: 'zh_drafted'`,例句仅 39%)—— 界面上用 `isDraftedWord()` 标出来了。

### 地铁冒险

`SubwayScreen`,进度存 `yan_subway_unlocked_idx`。通关会保存,但**通关的词句
不会进入任何复习队列**,也不反哺旅行准备。

### 首页

`HomeScreen` + `src/features/home/useHomeSummary.js`(新加的)。
现在显示三个真实数字:学习中/已掌握、地铁第几站、点亮几个国家。
每个可点进对应页面。没有任何进度时整张卡不显示。

---

## 三、间隔复习(2026-08 已做)

学习线的核心缺口,做完之后前面的内容才开始产生累积。

算法在 `src/features/wordbank/srs.js`,纯函数、零 RN 依赖,
测试 `src/lib/__tests__/srs.test.mjs`(36 条)。

- 进度从 `'learning'` 字符串扩成 `{ box, dueAt, reps, lapses, lastSeenAt, status }`。
  `status` 由 `box` 算出来,不再是用户直接切的开关 —— 只留一个真相来源。
- Leitner 固定阶梯 `[1,2,4,7,15,30,60,120]` 天,不用 SM-2:
  ease factor 要几十次评分才收敛,而这里大部分词一辈子复习不到 10 次。
- 三档评分:忘了(回第一档、lapses+1、当天再见)/ 一般(档位不动、间隔减半)/
  会了(前进一档)。另有「不用再问我了」直接跳到已掌握档。
- 今日队列落 `yan_wordbank_session_v1`,**按词书分开存**
  (`{ [bookId]: {date,keys,done} }`),换天才重挑。
  排序是**先到期的旧词、逾期最久优先,再补新词** —— 否则每天靠学新词拿进度感,
  旧词越积越多,最后打开看到 300 个待复习直接放弃。
- 首页从「学习中 N」换成「今天该复习 N」:前者是只会变大的存量,后者做完就归零。

**迁移落点**(只在 `normalizeRecord()` 一处,本地旧数据和旧云端行共用):
`learning` → 今天到期;`mastered` → 30 天后;认不出的值 → 当没学过。
读盘是唯一的迁移入口,不存在「迁一半」的中间态。

**⚠️ 上线前必须先在 Supabase 跑 `src/lib/schema.word-srs.sql`。**
没跑的话 `pullProgress()` 会 select 到不存在的列而报错 —— 行为上是「拉取失败」,
本地照常可用、不会被空值覆盖,但云端同步实际是停的,而且不会有任何提示。

### 还没做的

- 五十音仍然没有掌握度/易错记录/复习入口,和这套 SRS 没打通。
- 地铁冒险通关的词句仍然不进复习队列。
- 复习只有「认还是不认」的自评,没有真正的测验(拼写/听辨/选择)。

---

## 四、这个项目的几条硬规矩

都是踩过坑总结的,写在这里免得重犯。

### 1. 拿不到数据 ≠ 数据是空的

这一条在项目里犯过至少四次,每次都是丢用户数据。
网络失败、读盘失败一律**保持现状**,绝不用空值覆盖本地。
返回值要能区分「失败」和「真的是空的」——
参考 `lib/geocode.js` 的 `searchPlaceDetailed`(返回 `{hits, error}`)
和 `features/world/footprintMerge.js` 的 `splitCloudCheckins`(返回 `ok` 标志)。

### 2. 落盘是状态的属性,不是调用方的责任

参考 `features/world/useWorldFootprint.js` 的 `usePersistedState`:
用它声明的状态,任何一次 set 都自动落盘;需要「只放内存不落盘」的必须显式走
`setInMemory`。**从「忘了就丢数据」变成「想不落盘得专门说」。**

### 3. 存储键必须在 `src/lib/storage.js` 登记

登记表记录每个键的 `kind`(user/cache/device)和是否参与登录补传。
删号按 `yan_` 前缀清理,并对未登记的键告警;开发期启动时 `auditKeys()` 会体检。
有测试守着「user 类数据必须参与补传」。

### 4. 先量再改

猜错过两次,都写进注释了免得别人再走:
- 以为 `proj.precision()` 能减少地图路径开销 → 量下来字符数**一个都没少**
- 以为拆 `wordBank` 能减包体积 → 代码换模块**不改变字节数**

### 5. 提交信息写「为什么」

看 `git log`,每条都说清楚问题是什么、成因是什么、为什么这样修。
这个项目的注释和提交信息是主要的上下文载体。

---

## 五、还欠着的账(不限于学习线)

| 项 | 性质 |
|---|---|
| SQL 迁移顺序化 | 8 个 `.sql` 无执行记录,换机/第二人无法重建 |
| 远端内容 schema 校验 | 一次坏推送能让所有已装 App 崩,用户无法自救 |
| 登录迁移验证 | 匿名攒数据 → Apple 登录 → 查四类数据是否都在。**从没验过** |
| 删号验证 | 会真删,要用测试账号 |
| Android 定位权限 | expo-location 库清单里写死 `ACCESS_FINE/COARSE_LOCATION`,插件选项去不掉 |

---

## 六、上架相关

已合规:App 内删除账号、Sign in with Apple、权限说明(不申请相机/麦克风/定位)、
出口合规声明、显示名「言」。

隐私政策在**另一个 GitHub 仓库** `YSY929YSY/yan-content`,
本地副本在 `/Users/yangshiyao/my-app/yan-content/`,改完要单独推。
内容包 `content.v2.json` 同理。

V1 已上架过,带着若干「即将开放」入口,未被驳回 —— 所以那些占位入口保留。
