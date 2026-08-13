// 言 YAN · 旅行小本子 + 多人分账(从 App.js 抽出)
// 依赖:共享色板 theme、发音组件 Speech、分账同步库 tripLedger。
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Image, InputAccessoryView, Keyboard, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { K } from '../../lib/storage';
import { isUuid, mergeExpenses, replaceLocalId } from '../../lib/ledgerMerge';
import * as ImagePicker from 'expo-image-picker';
import { C } from '../../theme';
import { useSpeech, SpeakBtn } from '../../components/Speech';
import {
  createLedger, joinLedger, addTagMember, removeTagMember, myLedgers, currentUserId,
  fetchLedgerData, saveExpenseRemote, deleteExpenseRemote, subscribeLedger,
} from '../../lib/tripLedger';
import { SCENE_PACK } from './scenePack';
import {
  money, clampMoney, clampAmountExpr, isAmountExpr, splitEven, specialAmountFor,
  buildShares as buildSharesFor, settleOne as settleOneFor,
  EXPENSE_CATEGORIES, normalizeCategory, personSpendRows,
} from '../../lib/ledgerMath';
import { parseItinerary } from '../../lib/parseItinerary';
import { pushNotebook, pullNotebook, cloudIsNewer } from '../../lib/tripBackup';
import {
  LEDGER_TITLE_FALLBACK, normalizeLedger, findLedger, patchLedger, upsertLedger,
  pickActiveKey, migrateLedgers, mergeRemoteLedgers, applyCloudLedgers, newLocalKey,
} from '../../lib/ledgerBook';
import FxPanel, { Sparkline } from './FxPanel';
import { FX_CODES, FX_SYMBOLS, getRates, rateOf, seriesFor, fmtFx, fmtRate, fxRangeText, sumConverted } from '../../lib/fx';

const TRIP_STORAGE_KEY = K.tripNotebook;
// 远端账目是 uuid,本地未同步的是 expense-<时间戳>;用它区分「同步过的」和「还在本机的」
// 数字键盘没有回车键,iOS 上收不起来。给所有金额输入配一条「完成」。
const NUM_PAD_ID = 'yan-num-pad';


const MONTH_NUM = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// 示例行程(不进默认数据,新用户可在空态「看看示例」时载入)
const SAMPLE_TRIP = {
    id: 'sample-ireland',
    title: 'Ireland / Türkiye（示例）',
    subtitle: '这是一份示例,看完可删',
    status: '示例',
    sample: true,
    shareLabel: '',
    current: {
      eyebrow: '现在 · 7月16日',
      title: '取行李，去 Heuston 坐火车。',
      note: '上午 Trinity，下午回 Temple Bar Inn 拿行李。带行李时直接打车去 Heuston。',
      from: 'Temple Bar Inn',
      to: 'Dublin Heuston',
      time: '15:35 train',
      phrase: 'Could you take us to Dublin Heuston Station, please?',
      phraseZh: '可以带我们去 Dublin Heuston 火车站吗？',
    },
    gaps: ['Galway → Belfast 具体交通', 'NAV → Göreme shuttle / 接机', 'Göreme → Istanbul 7/25 夜巴'],
    legs: [
      {
        mon: 'JUL',
        day: '15',
        title: 'Dublin 汇合',
        summary: '下午抵达；晚上 Temple Bar',
        detail: 'Lyra：LHR T2 15:10 → DUB T2 16:35 · Aer Lingus EI161\nNing：SHA → CAN → LGW → DUB · 14:30 到\n住：Temple Bar Inn · 40-47 Fleet St',
        phrase: 'Could we check in, please?',
        family: 'flight',
        pockets: [
          { label: '机场', steps: [
            { label: '取行李', look: '看 baggage claim、carousel、自己的航班号。不要只跟人流走。', say: 'Where is the baggage claim for this flight?', sayZh: '这个航班的行李在哪里取？', stuck: 'Could you show me where to go for baggage claim?' },
            { label: '出口', look: '看 arrivals、exit、meeting point。确认自己在 T1 还是 T2。', say: 'Is this the way to arrivals?', sayZh: '这是去到达口的路吗？', stuck: 'Could you point me to the exit?' },
            { label: '会合', look: '确认门口编号、手机电量。只报一个清楚的位置。', say: "I'm at arrivals. Where are you?", sayZh: '我在到达口了，你在哪？', stuck: "I'm near the arrivals exit. Could you send me your location?" },
          ] },
          { label: '酒店', look: '看 booking name、check-in time、是否含早餐。', say: 'Could we check in, please?', sayZh: '我们可以办入住吗？', stuck: 'Sorry, could you check the booking under this name?' },
          { label: '打车', look: '看上车点、车牌、目的地地址。', say: 'Could you take us to Temple Bar Inn, please?', sayZh: '可以送我们去 Temple Bar Inn 吗？', stuck: 'This is the address. Could you take us there?' },
        ],
      },
      {
        mon: 'JUL',
        day: '16',
        title: 'Dublin → Galway',
        summary: '上午 Trinity；下午火车去 Galway',
        detail: 'Dublin Heuston 15:35 → Galway Ceannt 18:00\n先回 Temple Bar Inn 取行李，再打车去 Heuston。',
        phrase: 'Which platform does the train to Galway leave from?',
        family: 'transit',
        pockets: [
          { label: '车站', look: '看 platform、departure time、Galway / Ceannt。', say: 'Which platform does the train to Galway leave from?', sayZh: '去 Galway 的火车在几号站台？', stuck: 'Could you point me to the platform for Galway?' },
          { label: '寄存', look: '看酒店前台是否能 hold luggage。', say: 'Could we leave our luggage here until this afternoon?', sayZh: '我们能把行李寄存到下午吗？', stuck: 'We will come back before going to the station.' },
        ],
      },
      {
        mon: 'JUL',
        day: '17',
        title: 'Cliffs of Moher',
        summary: 'Galway 出发，一天给海风',
        detail: '建议报 Galway 出发的一日团：Cliffs of Moher + Burren。\n自然景观对中文讲解依赖不高。',
        phrase: 'What time do we need to be back here?',
        family: 'sights',
        pockets: [
          { label: '集合', look: '看 meeting point、bus number、return time。', say: 'What time do we need to be back here?', sayZh: '我们几点要回到这里？', stuck: 'Could you write down the meeting time for me?' },
        ],
      },
      {
        mon: 'JUL',
        day: '18',
        title: 'Galway → Belfast',
        summary: '移动日；晚上 The Flint',
        detail: '待补具体交通。建议上午从 Galway 出发，经 Dublin 转 Belfast。\n住：The Flint · 48 Howard St · 7/18—7/21',
        phrase: 'Could we leave our luggage here?',
        family: 'transit',
        pockets: [
          { label: '换乘', look: '看 Dublin / Belfast、coach bay、ticket QR code。', say: 'Is this the bus to Belfast?', sayZh: '这是去贝尔法斯特的车吗？', stuck: 'Could you check if this is the right bus for Belfast?' },
          { label: '酒店', look: '看 check-in time、booking name、luggage storage。', say: 'Could we leave our luggage here?', sayZh: '我们能把行李寄存在这里吗？', stuck: 'Our check-in is later. Could you hold these bags?' },
        ],
      },
      {
        mon: 'JUL',
        day: '21',
        title: 'Belfast → Cappadocia',
        summary: 'BFS → STN → SAW → NAV',
        detail: '16:40 BFS → STN 18:00 · Ryanair UK RK0158\n23:00 STN → SAW 05:00 · AJet VF1992\n07:45 SAW → NAV 09:00 · AJet VF3268',
        phrase: 'Where is the shuttle to Göreme?',
        family: 'flight',
        pockets: [
          { label: '机场', steps: [
            { label: '值机', look: '先确认是否已 online check-in；看 bag drop。', say: 'Where is the bag drop for this flight?', sayZh: '这个航班在哪里托运行李？', stuck: 'Could you help me check in for this flight?' },
            { label: '安检', look: '看 liquids、laptop、belt、coat。听不清就先看别人怎么做。', say: 'Do I need to take this out?', sayZh: '这个需要拿出来吗？', stuck: 'Could you show me what I need to take out?' },
            { label: '登机口', look: '看 gate、boarding time、group。注意 gate changed 和 final call。', say: 'Has the gate changed for this flight?', sayZh: '这个航班改登机口了吗？', stuck: 'Is my group boarding now?' },
          ] },
          { label: '转机', steps: [
            { label: '找门', look: '到 SAW 先看 transfer / domestic departures，别只跟着 exit。', say: 'Where is the gate for the flight to Nevsehir?', sayZh: '去内夫谢希尔的登机口在哪？', stuck: 'I have a connecting flight to Nevsehir. Where should I go?' },
            { label: '延误', look: '上一段晚点就先找 service desk 或 gate staff。', say: 'My first flight was delayed. Can I still make this connection?', sayZh: '我上一班晚点了，还赶得上这班吗？', stuck: 'Could you check the next flight to Nevsehir for me?' },
          ] },
          { label: '接机', look: '到 NAV 看 arrival hall、hotel name、shuttle sign。', say: 'Where is the shuttle to Göreme?', sayZh: '去格雷梅的接驳车在哪？', stuck: 'This is my hotel. Could you help me find the transfer?' },
        ],
      },
      {
        mon: 'JUL',
        day: '25',
        title: 'Göreme → Istanbul',
        summary: '夜巴；Esenler 或 Alibeyköy',
        detail: '候选：20:15 Göreme Otogarı → Istanbul。\n住老城选 Esenler；住 Galata/Taksim 可考虑 Alibeyköy。',
        phrase: 'Does this bus stop at Alibeyköy?',
        family: 'transit',
        pockets: [
          { label: '巴士站', look: '看 company name、destination、seat、luggage tag。', say: 'Does this bus stop at Alibeyköy?', sayZh: '这班车在 Alibeyköy 停吗？', stuck: 'Could you check my ticket and tell me where to wait?' },
          { label: '行李', look: '看工作人员是否给 luggage tag。拍一下行李牌。', say: 'Do I get a luggage tag for this bag?', sayZh: '这个行李有行李牌吗？', stuck: 'Could you put this bag under the bus?' },
        ],
      },
    ],
};

// 全新用户默认:一本空的起始册(真实首屏,不预置任何行程)
const TRAVEL_BOOKS_SEED = [
  {
    id: 'my-first-trip',
    title: '我的旅行',
    subtitle: '还没开始 · 从上传订单或新增一段开始',
    status: '进行中',
    shareLabel: '',
    current: {
      eyebrow: '还没有行程',
      title: '开始记这一趟。',
      note: '上传机票 / 酒店截图,或手动新增第一段路。到了照着「常用英语」说就行。',
      from: '出发',
      to: '目的地',
      time: '',
      phrase: 'Could you help me with this, please?',
      phraseZh: '可以帮我一下吗？',
    },
    gaps: [],
    legs: [],
  },
];

// 全新用户默认:一本空的本机账本。
// 账本不挂在旅行册下 —— 只用分账、完全不碰小本子的人也要能直接开记。
const SEED_LEDGER = normalizeLedger({
  key: 'local-1',
  title: '我的账本',
  currency: '€',
  members: [{ name: '我', label: '我', status: '已加入', joined: true }],
  expenses: [],
});

function TripNotebook() {
  const [visible, setVisible] = useState(false);
  const [books, setBooks] = useState(TRAVEL_BOOKS_SEED);
  const [activeBookId, setActiveBookId] = useState(TRAVEL_BOOKS_SEED[0].id);
  const [expanded, setExpanded] = useState(1);
  const [flipped, setFlipped] = useState({});     // { legIdx: true } → 显示现场
  const [pocketSel, setPocketSel] = useState({}); // { legIdx: pocketIdx }
  const [stepSel, setStepSel] = useState({});     // { 'legIdx-pocketIdx': stepIdx }
  const [siteEdit, setSiteEdit] = useState(null); // 现场编辑草稿 { i, pIdx, sIdx, label, look, say, sayZh, stuck }
  const [ocrBusy, setOcrBusy] = useState(false);
  const [scenesOpen, setScenesOpen] = useState(false);
  // 汇率换算:两个 Modal 各挂一层(iOS 叠 Modal 打不开,只能各自用弹窗内浮层)
  const [fxOpen, setFxOpen] = useState(false);
  const [fxOpenLedger, setFxOpenLedger] = useState(false);
  const [sceneFam, setSceneFam] = useState(SCENE_PACK[0].key);
  const [sceneOpenIdx, setSceneOpenIdx] = useState(0);
  const [editIdx, setEditIdx] = useState(undefined);
  const [draft, setDraft] = useState({ title: '', summary: '', detail: '', phrase: '' });
  const [uploads, setUploads] = useState([]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [expenseEditId, setExpenseEditId] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  // 分账主路径 = 金额 + 谁垫的 + 记一笔。其余(分类/分法/参与人/共享设置)默认收起。
  const [ledgerAdvanced, setLedgerAdvanced] = useState(false);
  const [ledgerSetupOpen, setLedgerSetupOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);   // 已结清的账目默认收起
  const [curOpen, setCurOpen] = useState(false);
  // ── 账本(可以有好几本) ────────────────────────────────
  // 账本和旅行册**完全解耦**:有人根本不用小本子,只用分账;
  // 也有人同一周和不同的人各出去玩一趟,要两本互不相干的账同时开着。
  // 所以账本是独立实体,不挂在册子下面,预算也跟账本走(以前跟册子走,是错的)。
  // 每本账自己拿着:成员、账目、币种、预算、邀请码。
  const [ledgers, setLedgers] = useState(() => [SEED_LEDGER]);
  const [activeLedgerKey, setActiveLedgerKey] = useState(SEED_LEDGER.key);
  const [ledgerPickerOpen, setLedgerPickerOpen] = useState(false);
  const [ledgerRename, setLedgerRename] = useState(null);   // 改名草稿;null = 没在改
  // 老快照里预算是按旅行册存的。迁移只搬走一条,这份原样留在盘上不再写 ——
  // 万一挑错了,数据还在,不是猜错一次就没了。
  const [legacyBudgets, setLegacyBudgets] = useState(null);
  // 币种:显示用的当前选择。真相存在账本里(上一笔记的是什么钱),
  // 切账本时从账本读回来 —— 见下面那个 effect。
  const [currency, setCurrency] = useState('€');
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [myName, setMyName] = useState('我');
  const [myUid, setMyUid] = useState(null);   // 匿名身份 id,用来在共享账本里认出自己
  const [budgetEditing, setBudgetEditing] = useState(false);
  const [spendOpen, setSpendOpen] = useState(false);   // 个人支出明细表,默认收起
  const [spendCur, setSpendCur] = useState(null);      // 看哪个币种的明细;null = 花得最多的那个
  // 个人支出的折算开关。和结算那边的 mergeOn 分开:两块各看各的,
  // 展开支出顺手按一下「换」,不该把结算面板也一起翻过去。
  // 但目标币种(settleCurrency)和汇率是同一份 —— 那是同一个选择,不该问两遍。
  const [spendMergeOn, setSpendMergeOn] = useState(false);
  const [budgetCurDraft, setBudgetCurDraft] = useState(null);  // 正在设的这个预算用什么币种
  const [budgetCurOpen, setBudgetCurOpen] = useState(false);   // 预算的货币托盘
  const [budgetDraft, setBudgetDraft] = useState('');
  const [fxRates, setFxRates] = useState(null);      // 结算合并用的参考汇率
  const [mergeOn, setMergeOn] = useState(false);     // 默认分币种(那是真相),合并是可选的便利
  const [settleCurOpen, setSettleCurOpen] = useState(false);
  // 折算目标币种的**第二个入口**,开在「我的支出」那一块。
  //
  // 之前它只长在结算面板里,于是纯本机记账、从不点开结算的人根本改不了 ——
  // 界面上一直写着「换成 €」而没有任何地方能把 € 换掉。
  // 同一个设置出现在两处不是「问两次」(选的是同一个 settleCurrency),
  // 是让它在用户真正想到这件事的那一屏够得着。托盘的展开状态才分两份:
  // 在支出那块点开托盘,不该顺手把结算面板也翻过来。
  const [spendCurOpen, setSpendCurOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [expenseDraft, setExpenseDraft] = useState({
    category: '餐饮',
    title: '',
    amount: '',
    payer: '我',
    mode: '均分',
    note: '',
    special: false,
    personShares: {},          // 各自价格:{ 名字: '金额字符串' },任意人数
    specialOwner: '我',
    specialAmount: '',
    specialLabel: '',
    participants: ['我'],
  });
  const { speak, speakingKey } = useSpeech();
  const hydrated = useRef(false);
  const localRev = useRef(null);        // 本机最后一次改动时间,和云端比新旧用
  const pushTimer = useRef(null);

  // 持久化：首次进入读回本地存档，之后任意改动自动落盘（离线即用，关掉 App 不丢）
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(TRIP_STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.books?.length) {
            setBooks(saved.books);
            setActiveBookId(saved.books.some(b => b.id === saved.activeBookId) ? saved.activeBookId : saved.books[0].id);
          }
          // 账本分桶 + 老格式迁移都在 migrateLedgers 里(有测试覆盖)。
          // ok 为假 = 这份快照里读不出账本,**保持现状**,不拿空数组盖掉种子账本。
          const mig = migrateLedgers(saved);
          if (mig.ok) {
            setLedgers(mig.ledgers);
            setActiveLedgerKey(mig.activeLedgerKey);
          }
          // 老的按旅行册存的预算映射原样留着,不再写,也不删
          if (saved.budgets) setLegacyBudgets(saved.budgets);
          if (saved.uploads) setUploads(saved.uploads);
          localRev.current = saved.rev || null;
        }
      } catch (e) { /* 读档失败就用种子数据，静默 */ }
      hydrated.current = true;

      // 本地先上屏(离线即用),再问云端有没有更新的版本。
      // ⚠️ 只在「云端确实更新」时才覆盖:pullNotebook 失败返回 null,
      // 空 payload 也不动本地 —— 否则就是共享账本被弱网清空那个坑的翻版。
      try {
        const cloud = await pullNotebook();
        if (!cloud || !cloud.payload) return;
        if (!cloudIsNewer(cloud.deviceRev, localRev.current)) return;
        const c = cloud.payload;
        if (Array.isArray(c.books) && c.books.length) {
          setBooks(c.books);
          setActiveBookId(c.books.some(b => b.id === c.activeBookId) ? c.activeBookId : c.books[0].id);
        }
        // 云端可能是**老版本客户端**推上去的(只有扁平 expenses、没有 ledgers)。
        // 那种情况下只更新「遗留那一本」,绝不拿它替换整个列表 ——
        // 否则另外几本账会被一份不知道自己有多本账的快照抹掉。规则在 applyCloudLedgers。
        setLedgers(prev => {
          const next = applyCloudLedgers(prev, c);
          if (!next) return prev;            // null = 读不出东西,别动本地
          setActiveLedgerKey(k => pickActiveKey(next, c.activeLedgerKey || k));
          return next;
        });
        if (Array.isArray(c.uploads)) setUploads(c.uploads);
        if (c.budgets && typeof c.budgets === 'object') setLegacyBudgets(c.budgets);
        localRev.current = cloud.deviceRev;
      } catch (e) { /* 取不到就用本地这份 */ }
    })();
  }, []);
  useEffect(() => {
    if (!hydrated.current) return;
    const rev = new Date().toISOString();
    localRev.current = rev;
    // 账目和成员现在都在 ledgers 里,顶层不再写 expenses/ledgerMembers。
    // budgets 是老的按册预算映射,原样带着 —— 只读不写,留着当后悔药。
    const snapshot = {
      books, activeBookId, uploads, rev,
      ledgers, activeLedgerKey,
      ...(legacyBudgets ? { budgets: legacyBudgets } : {}),
    };
    AsyncStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(snapshot)).catch(() => {});
    // 云端备份防抖:记一笔账会连着触发好几次 setState,不能每次都发请求。
    // 备份失败静默 —— 本地那份才是当下能用的,云端只是换机时的保险。
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      const { uploads: _skipPhotos, ...cloudSafe } = snapshot;   // 本机图片 uri 换机后无效,不上传
      pushNotebook(cloudSafe, rev);
    }, 4000);
  }, [books, activeBookId, uploads, ledgers, activeLedgerKey, legacyBudgets]);
  useEffect(() => () => { if (pushTimer.current) clearTimeout(pushTimer.current); }, []);

  const activeBook = books.find(book => book.id === activeBookId) || books[0];
  const legs = activeBook.legs || [];

  // ── 当前账本 ────────────────────────────────────────────
  // 下面这一圈别名让组件其余部分继续按「一本账」的写法读数据,
  // 但每一次写都必须指名道姓写进某一本 —— 不指名就是把账记进虚空。
  const activeLedger = findLedger(ledgers, activeLedgerKey) || ledgers[0] || SEED_LEDGER;
  const expenses = activeLedger.expenses;
  const ledgerMembers = activeLedger.members;
  const ledgerId = activeLedger.id;            // null = 仅本机;有值 = 共享账本
  const ledgerCode = activeLedger.joinCode || '';
  const budget = activeLedger.budget;

  // 改当前账本。所有对账目/成员/预算的写入都从这里过。
  //
  // ⚠️ 用 activeLedger.key,**不能用 activeLedgerKey**。
  // activeLedger 在 key 指不到任何一本时会回落到第一本(界面因此永远有东西显示),
  // 而 patchLedger 找不到 key 时按设计原样返回、绝不新建桶 ——
  // 两者一旦不一致,用户看着第一本记账,写入却打在一个不存在的 key 上,
  // 静默丢失。以 activeLedger.key 为准,看到哪本就写哪本。
  const writeKey = activeLedger.key;
  const patchActive = useCallback((patch) => {
    setLedgers(prev => patchLedger(prev, writeKey, patch));
  }, [writeKey]);
  // 和原来的 setExpenses 同形(支持函数式),但写的是当前账本这一桶
  const setExpenses = useCallback((updater) => {
    setLedgers(prev => patchLedger(prev, writeKey, l => ({
      expenses: typeof updater === 'function' ? updater(l.expenses) : updater,
    })));
  }, [writeKey]);
  const setLedgerMembers = useCallback((updater) => {
    setLedgers(prev => patchLedger(prev, writeKey, l => ({
      members: typeof updater === 'function' ? updater(l.members) : updater,
    })));
  }, [writeKey]);
  // 指名道姓写某一本(异步回调用)。见下面 saveExpense / refreshLedger 的说明。
  const patchLedgerByKey = useCallback((key, patch) => {
    setLedgers(prev => patchLedger(prev, key, patch));
  }, []);

  // 币种记住上一笔选的,不要每次弹回默认。
  // 用户在土耳其连着记三十多笔里拉,每次都要手动切一遍;漏一次,
  // ₺4500 的门票就成了 ¥4500 —— 一笔之差能把结论从「A 欠 B 891」翻成「B 欠 A 1358」。
  // 连续同币种是常态,回默认才是例外。真相存在账本里,切账本时各回各的。
  useEffect(() => {
    setCurrency(activeLedger.currency || '€');
    // 换了一本账,草稿里的编辑态和上一本无关了
    setExpenseEditId(null);
  }, [activeLedgerKey]);
  const pickCurrency = (cur) => {
    setCurrency(cur);
    patchActive({ currency: cur });   // 记住,下一笔默认还是它
  };
  // 自愈:activeLedgerKey 指到一本已经不在的账本时(删掉了、云端换了一份),
  // 把它拨回 activeLedger 实际落在的那一本。上面的写入已经以 activeLedger.key 为准,
  // 这一条是让「读的 key」和「写的 key」重新合一,免得两套 key 长期并存。
  useEffect(() => {
    if (activeLedgerKey !== writeKey) setActiveLedgerKey(writeKey);
  }, [activeLedgerKey, writeKey]);

  // 动态「现在」：按真实日期定位当前这段路，日期不再写死
  const today = new Date();
  const legDate = (leg) => {
    const m = MONTH_NUM[leg?.mon]; const d = parseInt(leg?.day, 10);
    return (m && d) ? new Date(today.getFullYear(), m - 1, d) : null;
  };
  const isCurrentTrip = activeBook.status === '当前旅程';
  const todayLegIdx = (() => {
    let idx = -1;
    legs.forEach((leg, i) => { const v = legDate(leg); if (v && v <= today) idx = i; });
    return idx;
  })();
  const currentEyebrow = isCurrentTrip
    ? `现在 · ${today.getMonth() + 1}月${today.getDate()}日`
    : activeBook.current.eyebrow;
  // 当前段：今天这段（有就用），否则下一段即将出发的，否则最后一段
  const nowLegIdx = (() => {
    if (!legs.length) return -1;
    const todayIdx = legs.findIndex(leg => { const v = legDate(leg); return v && v.toDateString() === today.toDateString(); });
    if (todayIdx >= 0) return todayIdx;
    const nextIdx = legs.findIndex(leg => { const v = legDate(leg); return v && v > today; });
    return nextIdx >= 0 ? nextIdx : legs.length - 1;
  })();
  // 「现在」卡：当前旅程且有行程段时，从那段真身派生；否则用旅行册预设
  const nowCard = (() => {
    if (!isCurrentTrip || nowLegIdx < 0) return activeBook.current;
    const leg = legs[nowLegIdx];
    const parts = (leg.title || '').split('→').map(s => s.trim());
    const p0 = leg.pockets?.[0];
    const say = p0?.steps?.[0]?.say || p0?.say || leg.phrase;
    const sayZh = p0?.steps?.[0]?.sayZh || p0?.sayZh || activeBook.current.phraseZh;
    return {
      eyebrow: currentEyebrow,
      title: leg.title,
      note: leg.summary,
      from: parts.length > 1 ? parts[0] : activeBook.current.from,
      to: parts.length > 1 ? parts[1] : activeBook.current.to,
      time: (leg.detail || '').split('\n')[0] || activeBook.current.time,
      phrase: say,
      phraseZh: sayZh,
    };
  })();
  // 进入某本旅行册时，默认展开当前段
  useEffect(() => {
    setExpanded(nowLegIdx >= 0 ? nowLegIdx : (legs.length ? 0 : null));
  }, [activeBookId]);
  // 「单独」以数据为准(有没有 specialItem),不信 special 标记 ——
  // 老版本从「单独付」切回「均分」时不会清掉那个标记,导致均分的账被错标
  const isSpecial = (item) => !!item.specialItem;
  // 旅行十天记三十笔,全叫「晚餐」——列表得能看出是哪天。
  // 本地旧账目没存时间,但 id 里带着 Date.now(),能捞出来。
  const expenseDay = (item) => {
    const raw = item.createdAt
      || (/^expense-(\d{13})$/.test(item.id || '') ? Number(item.id.slice(8)) : null);
    if (!raw) return '';
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
  };
  const specialCount = expenses.filter(isSpecial).length;
  // 成员:进了共享账本用远端成员,否则用本地成员
  // 成员就是这本账自己的成员列表。共享账本的成员由 refreshLedger 从远端刷进这一桶,
  // 不再另存一份 remoteMembers —— 两份成员名单迟早会对不上,而分账是按名字算钱的。
  const members = ledgerMembers;
  const ledgerPeople = members.map(member => member.name || member.display_name);
  const isShared = !!ledgerId;
  // 「我」在这本账里叫什么:共享模式按匿名身份认领自己那行,本机模式就是本机名字。
  // 用途:谁记账通常就是谁垫的钱 —— 拿它当垫付人默认值。
  const myLedgerName = (() => {
    if (isShared) {
      const mine = members.find(m => m.userId && m.userId === myUid);
      if (mine?.name) return mine.name;
    }
    return ledgerPeople.includes(myName) ? myName : (ledgerPeople[0] || '我');
  })();
  // 简单模式(均分)下参与人恒等于全体成员:加了同行者就自动进均分,不用再去勾一遍。
  // 只在均分时同步——各自付/单独付各人有各自金额,强行拉平会让草稿变成不可保存的状态。
  // 一次只开一个:看账的时候不会同时在记账,反之亦然。
  // 两个折叠区同时展开时,要滚很久才够得到「记一笔」,像页面重复了一遍。
  const openOnly = (which) => {
    // 每一个都按「是不是我」直接赋值。
    // 之前写成「不是我就关掉」,结果目标自己永远不会被打开 ——
    // 货币托盘因此点了没反应,记账时改不了币种。
    setSettleOpen(which === 'settle');
    setLedgerAdvanced(which === 'adv');
    setLedgerSetupOpen(which === 'setup');
    setBudgetEditing(which === 'budget');
    setCurOpen(which === 'cur');
  };
  const toggleOnly = (which, isOpen) => openOnly(isOpen ? null : which);

  useEffect(() => { currentUserId().then(setMyUid).catch(() => {}); }, []);
  useEffect(() => {
    if (!ledgerOpen || fxRates) return;
    getRates().then(setFxRates).catch(() => {});
  }, [ledgerOpen]);
  // 新草稿的垫付人默认是我;用户手动改过、或正在改旧账时不动
  useEffect(() => {
    if (expenseEditId) return;
    setExpenseDraft(prev => (
      prev.payerTouched || prev.payer === myLedgerName ? prev : { ...prev, payer: myLedgerName }
    ));
  }, [myLedgerName, expenseEditId]);

  const peopleKey = ledgerPeople.join('|');
  useEffect(() => {
    if (ledgerAdvanced || expenseEditId || expenseDraft.mode !== '均分') return;
    setExpenseDraft(prev => (
      (prev.participants || []).join('|') === peopleKey ? prev : { ...prev, participants: [...ledgerPeople] }
    ));
  }, [peopleKey, ledgerAdvanced, expenseEditId, expenseDraft.mode]);
  const expenseCategories = EXPENSE_CATEGORIES;
  const splitModes = ['均分', '各自价格', '特殊项'];
  const MODE_LABEL = { 均分: '均分', 各自价格: '各自付', 特殊项: '单独付' };
  const CURRENCIES = ['€', '£', '₺', '$', '¥', '₩'];
  // 人民币首尾各放一次:这排 chip 横着铺开,拇指在手机上一头一尾最好够,
  // 中间反而最难点。¥ 是回家路上唯一一定会用到的那个,两头都留一个入口。
  // 渲染时按下标做 key —— 同一个符号出现两次,拿它当 key 会撞。
  const CURRENCY_PICKS = ['¥', ...CURRENCIES.filter(c => c !== '¥'), '¥'];
  const stripLook = (t) => String(t || '').replace(/^看\s*/, '');   // 标签已是「看什么」,内容里的「看」冗余
  const famLabelOf = (k) => SCENE_PACK.find(f => f.key === k)?.label || '';
  const openScenes = (fam) => { if (fam) setSceneFam(fam); setSceneOpenIdx(0); setScenesOpen(true); };
  const fmtMoney = (value) => `${currency}${Math.abs(value).toFixed(2)}`;
  // 算术全部走 lib/ledgerMath(有测试覆盖),这里只绑定当前成员
  const buildShares = (draft) => buildSharesFor(draft, ledgerPeople);

  // 各自价格的守恒检查:已分配了多少、还差多少
  const perPersonAssigned = (expenseDraft.participants || [])
    .filter(p => ledgerPeople.includes(p))
    .reduce((sum, p) => sum + money(expenseDraft.personShares?.[p]), 0);
  const draftTotal = money(expenseDraft.amount);
  const assignGap = Math.round((draftTotal - perPersonAssigned) * 100) / 100;
  // 单独付的那一项不能比总额还大:以前会被 Math.min 悄悄截断成总额,用户填的数被无声改掉
  const specialGap = Math.round((money(expenseDraft.specialAmount) - draftTotal) * 100) / 100;
  const specialOver = expenseDraft.mode === '特殊项' && specialGap > 0.01;
  const isBalanced = (expenseDraft.mode !== '各自价格' || Math.abs(assignGap) <= 0.01) && !specialOver;
  const canSave = draftTotal > 0 && isBalanced && ledgerPeople.length > 0;
  // ── 结算:按币种分组,各算各的 ──
  // 一趟旅行常跨币种(爱尔兰 € + 土耳其 ₺)。把 €240 和 ₺4500 相加会得到一个
  // 看起来正常、实际毫无意义的数字。所以不做汇率换算,每种货币单独结一次。
  const curOf = (item) => item.currency || currency;   // 迁移前的旧账目按当前账本币种算
  // 老版本会把分摊自动写进备注,和列表上一行重复。认出这类备注,不再显示。
  const isDerivedNote = (item) => {
    const n = String(item.note || '').trim();
    if (!n) return true;
    if (n === '默认均分') return true;
    const names = Object.keys(item.shares || {});
    // 形如「Lyra €24.40 · Ning €18.40」或「A 的 B ...,其余均分」
    if (/其余均分$/.test(n)) return true;
    const looksLikeShares = names.length > 0
      && names.some(p => n.includes(p))
      && /[€£₺$¥₩]\s*\d/.test(n)
      && !/[，。!?]/.test(n);
    return looksLikeShares;
  };
  const fmtIn = (value, cur) => `${cur}${Math.abs(value).toFixed(2)}`;
  // 结清 = 钱已经还了,不是这笔消费没发生过。
  // 所以「谁欠谁」只看未结清的,而「我花了多少」看全部 —— 旅行中途结一次账,
  // 个人花费和预算不该跟着归零。
  const activeExpenses = expenses.filter(item => !item.settledAt);
  const settledCount = expenses.length - activeExpenses.length;
  const currenciesIn = (items) => {
    const seen = [];
    items.forEach(item => { const c = curOf(item); if (!seen.includes(c)) seen.push(c); });
    return seen.length ? seen : [currency];
  };
  const multiCurrency = currenciesIn(activeExpenses).length > 1;

  const settleOne = (items, cur) => settleOneFor(items, cur, ledgerPeople);

  // 账目列表按币种分组,每组给笔数和合计。分组本身就是校对工具:
  // 只有一两笔的币种要么真是特例,要么是记账时选错了币种(见列表处的长注释)。
  const expenseGroups = currenciesIn(activeExpenses).map(cur => {
    const items = activeExpenses.filter(i => curOf(i) === cur);
    return { cur, items, total: items.reduce((s, i) => s + money(i.amount), 0) };
  }).filter(g => g.items.length);
  const multiCurrencyList = expenseGroups.length > 1;

  const groupsFor = (items) => currenciesIn(items).map(cur => settleOne(items.filter(i => curOf(i) === cur), cur));
  const settleGroups = groupsFor(activeExpenses);   // 谁欠谁:只算未结清的
  const spendGroups = groupsFor(expenses);          // 我花了:算全部,结清过的也算

  // ── 我这趟花了多少 ──
  // 不新建一套记账数据:每个人的「应承担」就是他真实花掉的钱(垫付的会还回来)。
  // 一个人买的东西记成「参与人只有我」就会算进来。
  const mySpend = spendGroups
    .map(g => ({ cur: g.cur, spent: g.rows.find(r => r.person === myLedgerName)?.owed || 0 }))
    .filter(x => x.spent > 0.005);

  // ── 个人支出记录 ──
  // 「我花了」原来只是分账的一个中间量(一行数字)。但它其实已经是一份完整的
  // 个人消费记录了 —— 每笔账里我承担的那一份,就是我这趟真花掉的钱。
  // 摊开成表就能回答「我在土耳其自己花了多少、花在哪」,不用再单独记一套账。
  //
  // ⚠️ 口径是**担**(我承担的份额),不是**垫**(我先付的钱,会还回来)。
  // 所以每一行都要同时给出「这笔总额」和「我担」—— 只给一个数字的话,
  // 用户会把 ₺4500 的门票当成自己花了 4500,实际只担了 2250。
  const expenseTime = (item) => {
    const raw = item.createdAt
      || (/^expense-(\d{13})$/.test(item.id || '') ? Number(item.id.slice(8)) : null);
    const t = raw ? new Date(raw).getTime() : NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  // 「担」的口径和 0 分摊的处理在 lib/ledgerMath 的 personSpendRows 里(有测试)
  const mySpendRows = (cur) => personSpendRows(
    expenses.filter(item => curOf(item) === cur), myLedgerName,
  ).sort((a, b) => expenseTime(b.item) - expenseTime(a.item));   // 新的在上,和账目列表一致
  // ── 按参考汇率合并结算 ──
  // 分币种是真相(不会错),但会出现「他给你英镑、你给他里拉」这种来回倒。
  // 合并是可选的便利:把各币种净额按参考汇率折算到一种货币,再净额化一次。
  // 它是估算,不是账 —— 所以默认关着,开了要标明汇率日期。
  // 折算目标默认取「花得最多」的币种 —— 那笔钱占比最大,折算误差影响最小;
  // 但用户可以自己改(有人就是想统一看人民币)。不跟着记账币种走:
  // 记账币种是「我此刻在花什么钱」,结算币种是「我们最后用什么算」,两回事。
  const dominantCur = (() => {
    const sum = {};
    activeExpenses.forEach(item => {
      const c = curOf(item);
      sum[c] = (sum[c] || 0) + money(item.amount) * (rateOf(fxRates?.rates, FX_CODES[c], 'EUR') || 1);
    });
    const best = Object.entries(sum).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : currency;
  })();
  // 折算成哪种货币由用户定,而且**记在账本里** —— 人在土耳其想看里拉总账,
  // 回国想看人民币,这个偏好不该每次关掉面板就忘。null = 还没选过,
  // 按「花得最多」自动挑一个(那笔钱占比最大,折算误差影响最小)。
  const settleCur = activeLedger.settleCurrency || null;
  const setSettleCur = (cur) => patchActive({ settleCurrency: cur });
  const mergeCurSym = settleCur || dominantCur;
  const mergeTargetCode = FX_CODES[mergeCurSym] || 'EUR';
  const canMerge = multiCurrency && !!fxRates?.rates
    && currenciesIn(activeExpenses).every(c => FX_CODES[c] && rateOf(fxRates.rates, FX_CODES[c], mergeTargetCode) != null);

  // ── 个人支出的折算总数 ──
  // 「₺9,887.36 $140.00 ¥10,762.49 €308.29 £19.82」并排五个数字,
  // 每个都是真实发生的钱,但加在一起是多少没人算得出来 ——
  // 而「我这趟一共花了多少」正是个人消费记录最该回答的那个问题。
  // 所以两个都给:上面那排原货币是事实,下面这个总数是折算出来的参考值。
  // 目标币种直接用结算那边的 mergeCurSym,不让用户再选一次。
  const spendEntries = mySpend.map(x => ({ code: FX_CODES[x.cur], amount: x.spent }));
  const spendConverted = sumConverted(spendEntries, fxRates?.rates, mergeTargetCode);
  // ok 为假 = 有币种换不出来。那种情况下 total 比真实数字小,而且看不出来 ——
  // 宁可不给总数,也不给一个少算了的(见 sumConverted 的注释)。
  const canMergeSpend = mySpend.length > 1 && spendConverted.ok;

  // ── 预算 ──
  // 预算跟**账本**走,不跟旅行册走(同一趟旅行可以有两本账,各有各的预算;
  // 不用小本子的人也该能设预算)。
  //
  // 币种跟的是**折算目标币种**,不是记账默认币种。
  // 原来跟记账币种,于是五个币种的旅行里「预算只能设置里拉」——
  // 而进度条只统计里拉那一部分,花掉的欧元英镑美元全不算数,
  // 那个百分比等于在骗人。心里那把「一共花了多少」的尺子是同一个货币,
  // 所以预算和折算总数用同一个尺子才对得上。
  const budgetCur = budget?.currency || mergeCurSym;
  const budgetCode = FX_CODES[budgetCur];
  // 把所有币种折算到预算币种。换不全就退回「只算同币种那部分」(老行为),
  // 并在界面上说清楚 —— 不假装那是全部。
  const budgetConv = budget ? sumConverted(spendEntries, fxRates?.rates, budgetCode) : null;
  const budgetAcrossCur = !!budgetConv?.ok && mySpend.length > 1;
  const budgetSpent = budget
    ? (budgetConv?.ok ? budgetConv.total : (mySpend.find(x => x.cur === budgetCur)?.spent || 0))
    : 0;
  const budgetPct = budget && money(budget.amount) > 0
    ? Math.min(budgetSpent / money(budget.amount), 1)
    : 0;
  const overBudget = budget && money(budget.amount) > 0 && budgetSpent > money(budget.amount);
  // 设预算时直接选币种。
  //
  // 上一版预算跟着折算目标币种走,方向对,但落地后用户**没有任何地方能选它** ——
  // 折算目标只能在结算面板换,而账本里只有一笔欧元的账时自动挑出来的就是欧元,
  // 于是预算被钉死在欧元上。一个只在日本花过日元的用户,预算入口是死的。
  // 这是全球化的前提,不是一个小选项。
  //
  // 默认值仍然是折算目标币种(默认对了大多数人就不用点),但选了之后
  // **只改这个预算自己的币种,不动账本的 settleCurrency** ——
  // 「我给自己定的上限用什么计价」和「结算最后按什么算」是两件事。
  const budgetCurPick = budgetCurDraft || budgetCur;
  const openBudgetEditor = () => {
    setBudgetDraft(budget?.amount || '');
    setBudgetCurDraft(budget?.currency || mergeCurSym);
    setBudgetCurOpen(false);
    toggleOnly('budget', budgetEditing);
  };
  const saveBudget = () => {
    const v = money(budgetDraft);
    patchActive({ budget: v > 0 ? { amount: String(v), currency: budgetCurPick } : null });
    setBudgetEditing(false);
    setBudgetCurOpen(false);
    setBudgetDraft('');
    Keyboard.dismiss();
  };
  const mergedGroup = (() => {
    if (!canMerge || !mergeOn) return null;
    const nets = {};
    settleGroups.forEach(g => {
      const r = rateOf(fxRates.rates, FX_CODES[g.cur], mergeTargetCode) || 0;
      g.rows.forEach(row => {
        nets[row.person] = (nets[row.person] || 0) + (row.paid - row.owed) * r;
      });
    });
    const creditors = []; const debtors = [];
    ledgerPeople.forEach(p => {
      const v = Math.round((nets[p] || 0) * 100) / 100;
      if (v > 0.01) creditors.push({ person: p, v });
      else if (v < -0.01) debtors.push({ person: p, v: -v });
    });
    creditors.sort((a, b) => b.v - a.v);
    debtors.sort((a, b) => b.v - a.v);
    const lines = [];
    let i = 0; let j = 0;
    while (i < creditors.length && j < debtors.length) {
      const pay = Math.min(creditors[i].v, debtors[j].v);
      lines.push({ from: debtors[j].person, to: creditors[i].person, amount: pay, cur: mergeCurSym });
      creditors[i].v -= pay; debtors[j].v -= pay;
      if (creditors[i].v < 0.01) i += 1;
      if (debtors[j].v < 0.01) j += 1;
    }
    return { cur: mergeCurSym, lines };
  })();
  const fxDay = fxRates?.date
    ? `${Number(fxRates.date.slice(5, 7))}月${Number(fxRates.date.slice(8, 10))}日`
    : '';

  // 「应收 £4.80」是会计口径:它给结果,不给对象。人要知道的是「找谁要」。
  // 所以一律写成「谁 给 谁 多少」,和自己有关的排最前,自己那方写「你」。
  const sayWho = (name) => (name === myLedgerName ? '你' : name);
  // 「Ning 给你」不留空格,「Ning 给 Max」留 —— 中文黏着,西文分开
  const payText = (l) => {
    const to = sayWho(l.to);
    return `${sayWho(l.from)} 给${to === '你' ? '' : ' '}${to}`;
  };
  const involvesMe = (l) => l.from === myLedgerName || l.to === myLedgerName;
  const orderMineFirst = (lines) => [
    ...lines.filter(involvesMe),
    ...lines.filter(l => !involvesMe(l)),
  ];
  const shownGroups = mergedGroup ? [mergedGroup] : settleGroups;
  const settlementLines = orderMineFirst(shownGroups.flatMap(g => g.lines));
  const settlement = settlementLines.length
    ? settlementLines.map(l => `${payText(l)} ${fmtIn(l.amount, l.cur)}`).join('\n')
    : '现在基本扯平。';
  // 这张深色卡是为一行设计的,多币种会让它变成一堵墙 —— 只露头两笔,
  // 其余在展开的明细里(卡本身就是展开开关)。
  const SETTLE_PEEK = 2;
  const settleHead = settlementLines.slice(0, SETTLE_PEEK);
  const settleRest = Math.max(settlementLines.length - SETTLE_PEEK, 0);
  // 主路径的一行摘要:不展开也知道这笔怎么分
  const splitSummary = (() => {
    const chosen = (expenseDraft.participants || []).filter(p => ledgerPeople.includes(p));
    const n = chosen.length || ledgerPeople.length;
    if (expenseDraft.mode === '各自价格') return `各自付 · ${n} 人分别记`;
    if (expenseDraft.mode === '特殊项') return `${expenseDraft.specialOwner} 单独付一项,其余均分`;
    const all = n === ledgerPeople.length;
    const who = all ? '全员均分' : `${chosen.join('、')} 均分`;
    return draftTotal > 0 && n ? `${who} · 每人 ${fmtMoney(draftTotal / n)}` : who;
  })();
  // 拉取共享账本的成员 + 账目,写进**那一本**的桶里。
  // ⚠️ 一定要按 id 定位账本,不能写进「当前账本」——
  // 轮询和 Realtime 是异步的,回来的时候用户可能已经切到别的账本了,
  // 写错桶就是把 A 本的账目倒进 B 本。
  const refreshLedger = useCallback(async (id) => {
    if (!id) return;
    const data = await fetchLedgerData(id);
    if (!data) return;   // 拉取失败:保持现状,绝不用空数据覆盖本地
    const { members: rows, expenses: remoteExpenses } = data;
    setLedgers(prev => patchLedger(prev, id, l => ({
      members: rows.map(r => ({
        name: r.display_name,
        label: r.is_tag ? '标签' : '成员',
        joined: !r.is_tag,
        status: r.is_tag ? '未加入' : '已加入',
        tagOnly: r.is_tag,
        userId: r.user_id || null,   // 留着认出「哪个成员是我」
      })),
      // 合并规则见 lib/ledgerMerge.js —— 判错会让一笔账变两笔、结算翻倍
      expenses: mergeExpenses(l.expenses, remoteExpenses),
    })));
  }, []);

  // 打开 App 时恢复我已加入的**全部**共享账本(以前只取 mine[0],其余静默丢弃)
  useEffect(() => {
    (async () => {
      const { ledgers: mine, ok } = await myLedgers();
      // ok 为假 = 这次没问到,不是「没有」。并入规则见 mergeRemoteLedgers:只加不删。
      if (!ok || !mine.length) return;
      setLedgers(prev => mergeRemoteLedgers(prev, mine, ok));
      mine.forEach(l => refreshLedger(l.id));
    })();
  }, [refreshLedger]);

  // 实时同步:每一本共享账本各订一条。只订当前那本的话,
  // 切回去才发现同行者半天前记的账没进来。
  const sharedIdsKey = ledgers.filter(l => l.id).map(l => l.id).join('|');
  useEffect(() => {
    const ids = sharedIdsKey ? sharedIdsKey.split('|') : [];
    if (!ids.length) return undefined;
    const unsubs = ids.map(id => subscribeLedger(id, () => refreshLedger(id)));
    return () => unsubs.forEach(fn => fn && fn());
  }, [sharedIdsKey, refreshLedger]);

  // 开一本共享账本 = **新开一本**,当前这本原样留着。
  // 以前这里会 setExpenses([]) —— 在只有一本账的年代,那等于把已经记的账
  // 直接抹掉换成空的共享本。现在多账本了,没有任何理由再去动别的桶。
  const createSharedLedger = async () => {
    setLedgerBusy(true);
    const { ledger, error } = await createLedger({
      title: activeLedger.title || activeBook.title, currency, displayName: myName,
    });
    setLedgerBusy(false);
    if (error || !ledger) {
      Alert.alert('建账本失败', error === 'offline' ? '需要联网并配置 Supabase 才能开共享账本。' : (error || '请稍后再试。'), [{ text: '好' }]);
      return;
    }
    setLedgers(prev => upsertLedger(prev, {
      key: ledger.id,
      id: ledger.id,
      shared: true,
      joinCode: ledger.join_code,
      title: ledger.title || '共享账本',
      currency: ledger.currency || currency,
      members: [{ name: myName, label: '成员', joined: true, status: '已加入' }],
      expenses: [],
      createdAt: new Date().toISOString(),
    }));
    setActiveLedgerKey(ledger.id);
    Alert.alert('已开一本共享账本', `邀请码：${ledger.join_code}\n\n原来那本账原样留着,可以在账本列表里切回去。`, [{ text: '好' }]);
  };

  const inviteLedger = () => {
    if (!ledgerCode) {
      Alert.alert('还没有共享账本', '先点「建共享账本」，或输入同行者的邀请码加入。', [{ text: '好' }]);
      return;
    }
    Alert.alert('邀请同行', `邀请码：${ledgerCode}\n\n同行者在他们的言里打开分账、输入这个码即可加入。`, [{ text: '好' }]);
  };

  const joinLedgerRemote = async () => {
    const cleaned = joinCode.trim().toUpperCase();
    if (!cleaned) {
      Alert.alert('输入邀请码', '把同行者发来的邀请码填进来。', [{ text: '好' }]);
      return;
    }
    setLedgerBusy(true);
    const { ledger, error } = await joinLedger({ code: cleaned, displayName: myName });
    setLedgerBusy(false);
    if (error || !ledger) {
      Alert.alert('加入失败', error === 'offline' ? '需要联网并配置 Supabase 才能加入。' : (error || '请确认邀请码。'), [{ text: '好' }]);
      return;
    }
    // 加入 = 多一本,不是换掉手上这本
    setLedgers(prev => upsertLedger(prev, {
      key: ledger.id,
      id: ledger.id,
      shared: true,
      joinCode: ledger.join_code,
      title: ledger.title || '共享账本',
      currency: ledger.currency || '€',
      createdAt: new Date().toISOString(),
    }));
    setActiveLedgerKey(ledger.id);
    setJoinCode('');
    refreshLedger(ledger.id);
    Alert.alert('已加入', ledger.title, [{ text: '好' }]);
  };

  // ── 账本的增删改 ────────────────────────────────────────
  const createLocalLedger = () => {
    const key = newLocalKey();
    const n = ledgers.length + 1;
    setLedgers(prev => upsertLedger(prev, {
      key,
      title: `账本 ${n}`,
      currency,                                  // 多半还在同一个国家,沿用当前币种
      members: [{ name: myName || '我', label: '我', status: '已加入', joined: true }],
      expenses: [],
      createdAt: new Date().toISOString(),
    }));
    setActiveLedgerKey(key);
    setLedgerPickerOpen(false);
    setLedgerRename({ key, text: `账本 ${n}` });   // 直接进改名,省一次点击
  };

  const saveLedgerRename = () => {
    if (!ledgerRename) return;
    const title = ledgerRename.text.trim();
    setLedgers(prev => patchLedger(prev, ledgerRename.key, {
      title: title || LEDGER_TITLE_FALLBACK,
    }));
    setLedgerRename(null);
    Keyboard.dismiss();
  };

  // 删一本账本。有账目的不让删 —— 和「删成员」同一个道理:
  // 这是一次点击就能让几十笔账消失的操作,而账目本身是用户一路手输的。
  // 想删就先把账目删掉,那条路每一步都看得见、也撤得回。
  const deleteLedger = (key) => {
    const target = findLedger(ledgers, key);
    if (!target) return;
    if (ledgers.length <= 1) {
      Alert.alert('至少留一本账', '删完就没地方记账了。', [{ text: '好' }]);
      return;
    }
    if (target.expenses.length) {
      Alert.alert(
        `「${target.title}」里还有 ${target.expenses.length} 笔账`,
        '先把账目删掉再删这本账。\n这一步不给捷径:一次点击让几十笔手输的账消失,撤不回来。',
        [{ text: '好' }],
      );
      return;
    }
    if (target.shared) {
      Alert.alert(
        '共享账本不能在这里删',
        '这本账其他人也在用。你可以先把它留着 —— 退出共享账本还没做。',
        [{ text: '好' }],
      );
      return;
    }
    Alert.alert(`删掉「${target.title}」？`, '这本账是空的,删了不影响别的账本。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          setLedgers(prev => {
            const next = prev.filter(l => l.key !== key);
            if (!next.length) return prev;             // 兜底:绝不删到一本不剩
            setActiveLedgerKey(k => pickActiveKey(next, k === key ? null : k));
            return next;
          });
        },
      },
    ]);
  };

  const addMember = async () => {
    const name = newMemberName.trim();
    if (!name) return;
    if (isShared) {
      const { error } = await addTagMember({ ledgerId, name });
      if (error) { Alert.alert('添加失败', error, [{ text: '好' }]); return; }
      setNewMemberName('');
      refreshLedger(ledgerId);
    } else {
      setLedgerMembers(prev => [...prev, { name, label: '成员', joined: false, status: '未加入', tagOnly: true }]);
      setNewMemberName('');
    }
  };

  // 这个人身上有没有账。判据要和 settleOne 读的东西完全一致:
  // 它只看 payer 和 shares[某人],participants 不参与任何计算。
  // 所以「在 participants 里」不算有账,「分摊金额是 0」也不算 ——
  // 按那两个判,加过一次账之后谁都删不掉。
  const expenseCountFor = (person) => expenses.filter(item => (
    item.payer === person
    || item.specialItem?.owner === person
    || money(item.shares?.[person]) > 0.005
  )).length;

  // 同行者删得掉,**包括已经真正加入的人**。
  // 真实遭遇:「一开始加错了成员,均分那里每次多一个人,导致我先删除了账号」——
  // 为了去掉一个加错的名字,把整个账号删了。这个代价太离谱,口子必须开够。
  //
  // 但删人仍然是会算错钱的操作:名单里少一个人,他那份分摊在结算里直接蒸发,
  // 守恒破掉而界面看起来一切正常。所以身上有账的一律不让删,
  // 让用户先去改那几笔账 —— 那是他自己能看懂、能撤回的路径。
  // 而「刚加错的人」本来就还没有账,不受这条影响,一点就能删掉。
  const removeMember = (person) => {
    if (ledgerPeople.length <= 1) {
      Alert.alert('至少留一个人', '账本里没有成员就没法记账了。', [{ text: '好' }]);
      return;
    }
    if (person === myLedgerName) {
      Alert.alert('不能删掉自己', '这是你在这本账里的名字。', [{ text: '好' }]);
      return;
    }
    const used = expenseCountFor(person);
    if (used > 0) {
      Alert.alert(
        `${person} 身上还有 ${used} 笔账`,
        '先把那几笔改成别人,或者删掉,再移除这个人。\n直接移除会让他那份分摊凭空消失,结算就对不上了。',
        [{ text: '好' }],
      );
      return;
    }
    Alert.alert(`移除 ${person}？`, '账目不受影响。', [
      { text: '取消', style: 'cancel' },
      {
        text: '移除',
        style: 'destructive',
        onPress: async () => {
          if (isShared) {
            const { ok, error } = await removeTagMember({ ledgerId, name: person });
            // 失败就保持现状 —— 不拿一次失败的请求去改本地名单
            if (!ok) { Alert.alert('移除失败', error || '请稍后再试。', [{ text: '好' }]); return; }
            refreshLedger(ledgerId);
          } else {
            setLedgerMembers(prev => (
              prev.length > 1 ? prev.filter(m => (m.name || m.display_name) !== person) : prev
            ));
          }
          // 草稿里可能还选着这个人,清掉免得存出一笔挂在不存在的人头上的账
          setExpenseDraft(prev => ({
            ...prev,
            participants: (prev.participants || []).filter(p => p !== person),
            payer: prev.payer === person ? myLedgerName : prev.payer,
            specialOwner: prev.specialOwner === person ? myLedgerName : prev.specialOwner,
            personShares: Object.fromEntries(
              Object.entries(prev.personShares || {}).filter(([p]) => p !== person),
            ),
          }));
        },
      },
    ]);
  };

  /**
   * 货币托盘。三个地方用:预算编辑器、结算面板、支出那块的折算目标。
   *
   * 一份 JSX —— 这个文件因为「同一个东西写两遍」漂移过两次(两个预算编辑器、
   * 几个输入框的垂直居中),修复每次都只落在其中一处。
   *
   * @param fxOnly 只列**换得出来**的币种。折算目标必须能真的换算,
   *   列一个没有汇率的选项,用户选完发现总数消失了,而且看不出为什么;
   *   预算币种没有这个限制 —— 换不出来时它退回「只算同币种那部分」,仍然有意义。
   */
  const renderCurTray = ({ active, onPick, fxOnly = false }) => (
    <View style={tn.curTray}>
      {/* CURRENCY_PICKS 里 ¥ 首尾各一个,拇指两头都够得到 */}
      {CURRENCY_PICKS
        .map((cur, i) => ({ cur, i }))
        .filter(({ cur }) => !fxOnly
          || (FX_CODES[cur] && rateOf(fxRates?.rates, 'EUR', FX_CODES[cur]) != null))
        .map(({ cur, i }) => (
          <TouchableOpacity
            key={`${cur}-${i}`}
            style={[tn.curChip, active === cur && tn.curChipAct]}
            onPress={() => onPick(cur)}
          >
            <Text style={[tn.curTxt, active === cur && tn.curTxtAct]}>{cur}</Text>
          </TouchableOpacity>
        ))}
    </View>
  );

  // 预算编辑器。有两个入口(空账本那行、支出面板底部),渲染成一份 ——
  // 这个文件已经因为「同一个东西写两遍」漂移过一次(几个输入框的垂直居中各修各的)。
  const renderBudgetEditor = () => (
    <View>
      <View style={tn.meEditRow}>
        {/* 「预算」两个字在框外当标签,占位符只留货币符号。
            混排「€ 预算」时 iOS 会按字形回退字体,中文那半截用的是另一套
            字体度量,基线被拉低 —— 看起来就是「没居中」。而且占位符当标签
            本来就是坏做法:一开始输入,标签就消失了。 */}
        <Text style={tn.meEditLabel}>预算</Text>
        <TouchableOpacity
          onPress={() => setBudgetCurOpen(v => !v)}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        >
          <Text style={tn.meEditCur}>{budgetCurPick}{budgetCurOpen ? ' ▾' : ' ▸'}</Text>
        </TouchableOpacity>
        <TextInput
          style={tn.meInput}
          value={budgetDraft}
          onChangeText={v => setBudgetDraft(clampMoney(v))}
          placeholder={budgetCurPick}
          keyboardType="decimal-pad"
          inputAccessoryViewID={NUM_PAD_ID}
          placeholderTextColor={C.mutedLight}
          autoFocus
        />
        <TouchableOpacity style={tn.inviteBtn} onPress={saveBudget}>
          <Text style={tn.inviteTxt}>
            {money(budgetDraft) > 0 ? '存' : (budget ? '清除' : '取消')}
          </Text>
        </TouchableOpacity>
      </View>
      {budgetCurOpen && renderCurTray({
        active: budgetCurPick,
        onPick: (cur) => { setBudgetCurDraft(cur); setBudgetCurOpen(false); },
      })}
    </View>
  );

  const pickOrder = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('无法访问照片', '你可以在系统设置中允许“言”访问照片后，再上传订单或截图。', [{ text: '知道了' }]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setUploads(prev => [{ id: `u${Date.now()}`, uri: result.assets[0].uri }, ...prev]);
    }
  };

  const removeUpload = (id) => {
    Alert.alert('移除这张？', '', [
      { text: '取消', style: 'cancel' },
      { text: '移除', style: 'destructive', onPress: () => setUploads(prev => prev.filter(u => u.id !== id)) },
    ]);
  };

  // 识别订单:上传的截图 → Claude vision → 行程段,确认后追加到当前旅行册
  const recognizeUploads = async () => {
    if (!uploads.length) { Alert.alert('先上传资料', '上传机票/酒店截图,再识别。', [{ text: '好' }]); return; }
    setOcrBusy(true);
    const { legs, error } = await parseItinerary(uploads);
    setOcrBusy(false);
    if (error) {
      Alert.alert('识别失败', error === 'offline' ? '需要联网。' : `${error}\n(需要先部署 parse-itinerary 云函数)`, [{ text: '好' }]);
      return;
    }
    if (!legs.length) { Alert.alert('没读出行程', '这些图里没识别到清晰的行程,可手动新增。', [{ text: '好' }]); return; }
    Alert.alert('识别到 ' + legs.length + ' 段行程', legs.map(l => `${l.mon} ${l.day} · ${l.title}`).join('\n'), [
      { text: '取消', style: 'cancel' },
      { text: '加入行程', onPress: () => {
        setBooks(prev => prev.map(book => (
          book.id === activeBook.id ? { ...book, legs: [...(book.legs || []), ...legs] } : book
        )));
        setToolsOpen(false);
      } },
    ]);
  };

  // 单条账目的渲染。未结清和已结清两个列表复用同一份,
  // 免得改一处忘另一处 —— 这类重复正是「同一个信息说两遍」的来源。
  const renderExpense = (item) => (
    <View key={item.id} style={[tn.expenseRow, item.settledAt && tn.expenseRowSettled]}>
      <View style={{ flex: 1 }}>
        <View style={tn.expenseTitleRow}>
          <Text style={tn.expenseTitle}>
            {item.title && item.title !== item.category ? `${item.category} · ${item.title}` : item.category} · {fmtIn(money(item.amount), curOf(item))}{item.amountExpr ? ` (${item.amountExpr.replace(/\*/g, '×')})` : ''}
          </Text>
          {!!expenseDay(item) && <Text style={tn.expenseDay}>{expenseDay(item)}</Text>}
        </View>
        <Text style={tn.expenseMeta}>
          {item.payer} 垫付 · {
            Object.entries(item.shares || {})
              .filter(([, v]) => money(v) > 0)
              .map(([p, v]) => `${p} ${fmtIn(money(v), curOf(item))}`)
              .join(' / ') || '未分配'
          }
          {item.specialItem?.label
            ? ` · ${item.specialItem.owner} 的${item.specialItem.label}`
            : ''}
        </Text>
        {/* 存量数据里那些自动生成的备注和上面重复,不再显示 */}
        {!!item.note && !isDerivedNote(item) && (
          <Text style={tn.expenseMeta}>{item.note}</Text>
        )}
        <View style={tn.expenseOps}>
          <TouchableOpacity onPress={() => startExpenseEdit(item)}>
            <Text style={tn.expenseOpTxt}>改</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => deleteExpense(item.id)}>
            <Text style={[tn.expenseOpTxt, tn.deleteTxt]}>删</Text>
          </TouchableOpacity>
        </View>
      </View>
      {item.settledAt
        ? <Text style={tn.settledPill}>已结清</Text>
        : (isSpecial(item) && <Text style={tn.specialPill}>单独</Text>)}
    </View>
  );

  const startEdit = (idx) => {
    const base = idx === null
      ? { title: '', summary: '', detail: '', phrase: '' }
      : legs[idx];
    setEditIdx(idx);
    setDraft({ title: base.title, summary: base.summary, detail: base.detail, phrase: base.phrase });
  };

  const saveEdit = () => {
    const nextLeg = {
      mon: editIdx === null ? MONTH_ABBR[new Date().getMonth()] : legs[editIdx].mon,
      day: editIdx === null ? String(new Date().getDate()) : legs[editIdx].day,
      ...draft,
    };
    setBooks(prev => prev.map(book => {
      if (book.id !== activeBook.id) return book;
      const nextLegs = editIdx === null
        ? [...book.legs, nextLeg]
        : book.legs.map((leg, i) => (i === editIdx ? nextLeg : leg));
      return { ...book, legs: nextLegs };
    }));
    setExpanded(editIdx === null ? legs.length : editIdx);
    setEditIdx(undefined);
    setToolsOpen(false);
  };

  const deleteLeg = () => {
    if (editIdx === null || editIdx === undefined) return;
    Alert.alert('删掉这一段？', '这段行程会从当前旅行册移除。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          setBooks(prev => prev.map(book => (
            book.id === activeBook.id
              ? { ...book, legs: book.legs.filter((_, i) => i !== editIdx) }
              : book
          )));
          setExpanded(null);
          setEditIdx(undefined);
        },
      },
    ]);
  };

  // ── 现场口袋:让用户改/加自己的场景和句子 ──
  const mutateLegPockets = (legIdx, fn) => {
    setBooks(prev => prev.map(book => (
      book.id !== activeBook.id ? book : {
        ...book,
        legs: book.legs.map((leg, li) => (li !== legIdx ? leg : { ...leg, pockets: fn(leg.pockets || []) })),
      }
    )));
  };
  const startSiteEdit = (i, pIdx, sIdx, s, label) => {
    setSiteEdit({ i, pIdx, sIdx, label: label || '', look: s?.look || '', say: s?.say || '', sayZh: s?.sayZh || '', stuck: s?.stuck || '' });
  };
  const saveSite = () => {
    const { i, pIdx, sIdx, label, look, say, sayZh, stuck } = siteEdit;
    const fields = { look: look.trim(), say: say.trim(), sayZh: sayZh.trim(), stuck: stuck.trim() };
    mutateLegPockets(i, pockets => pockets.map((pk, pi) => {
      if (pi !== pIdx) return pk;
      if (pk.steps) return { ...pk, label: label.trim() || pk.label, steps: pk.steps.map((st, si) => (si === sIdx ? { ...st, ...fields } : st)) };
      return { ...pk, label: label.trim() || pk.label, ...fields };
    }));
    setSiteEdit(null);
  };
  const addPocket = (i) => {
    mutateLegPockets(i, pockets => [...pockets, { label: '新场景', look: '', say: '', sayZh: '', stuck: '' }]);
    const newIdx = (legs[i]?.pockets?.length) || 0;
    setPocketSel(prev => ({ ...prev, [i]: newIdx }));
    setFlipped(prev => ({ ...prev, [i]: true }));
    setExpanded(i);
    startSiteEdit(i, newIdx, 0, {}, '新场景');
  };
  const removePocket = (i, pIdx) => {
    Alert.alert('删掉这个场景？', '', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => {
        mutateLegPockets(i, pockets => pockets.filter((_, pi) => pi !== pIdx));
        setPocketSel(prev => ({ ...prev, [i]: 0 }));
        setSiteEdit(null);
      } },
    ]);
  };

  const createDraftBook = () => {
    const id = `trip-${Date.now()}`;
    const next = {
      id,
      title: '新的旅行册',
      subtitle: '上传资料，或先手动写一段路',
      status: '草稿',
      shareLabel: '未分享',
      current: {
        eyebrow: '草稿',
        title: '还没有下一段路。',
        note: '把订单、截图或聊天计划补进来，言会整理成路上能用的小卡。',
        from: '出发地',
        to: '目的地',
        time: '待补',
        phrase: 'Could you help me check this itinerary?',
        phraseZh: '可以帮我确认一下这个行程吗？',
      },
      gaps: ['上传第一份订单', '补入住宿', '生成同行版'],
      legs: [],
    };
    setBooks(prev => [next, ...prev]);
    setActiveBookId(id);
    setExpanded(null);
    setToolsOpen(true);
  };

  const loadSample = () => {
    setBooks(prev => (prev.some(b => b.id === SAMPLE_TRIP.id) ? prev : [...prev, SAMPLE_TRIP]));
    setActiveBookId(SAMPLE_TRIP.id);
    setExpanded(null);
    setToolsOpen(false);
  };

  const toggleParticipant = (person) => {
    setExpenseDraft(prev => {
      const current = prev.participants || [];
      const next = current.includes(person)
        ? current.filter(item => item !== person)
        : [...current, person];
      return { ...prev, participants: next.length ? next : current };
    });
  };

  const startExpenseEdit = (item) => {
    setExpenseEditId(item.id);
    // 改一笔 ₺ 的旧账时,币种选择器也跟着切过去 —— 看到什么就存什么,别把它悄悄改成当前币种。
    // 用 setCurrency 而不是 pickCurrency:这只是临时看这笔账,
    // 不该把「这本账上一笔用的币种」改成一笔老账的币种(改完 resetExpenseDraft 会还回去)。
    if (item.currency && item.currency !== currency) setCurrency(item.currency);
    // 改一笔老账时也归一,否则「晚餐」不在 chip 列表里,选中态永远高亮不上,
    // 而用户会以为这笔账没有分类
    const cat = normalizeCategory(item.category) || '其他';
    setExpenseDraft({
      category: cat,
      title: (item.title === item.category ? cat : item.title) || cat,
      amount: String(item.amountExpr || item.amount || ''),
      payer: item.payer || ledgerPeople[0] || '我',
      payerTouched: true,                              // 改旧账:用它原本的垫付人,别被默认值覆盖
      currency: item.currency || currency,
      createdAt: item.createdAt || null,               // 保留原始时间,别因为改一下就跳到今天
      mode: item.mode || '均分',
      note: item.note || '',
      special: !!item.special,
      personShares: item.mode === '各自价格'
        ? Object.fromEntries(Object.entries(item.shares || {}).filter(([, v]) => money(v) > 0).map(([k, v]) => [k, String(v)]))
        : {},
      specialOwner: item.specialItem?.owner || ledgerPeople[0] || '我',
      specialAmount: item.specialItem?.amount ? String(item.specialItem.amount) : '',
      specialLabel: item.specialItem?.label || '',
      participants: item.participants || [...ledgerPeople],
    });
  };

  const resetExpenseDraft = () => {
    // 改完/取消一笔老账后,币种回到「这本账上一笔记的是什么钱」——
    // 否则翻一下三周前那笔欧元,接下来记的里拉就默认成了欧元。
    if (expenseEditId && activeLedger.currency && activeLedger.currency !== currency) {
      setCurrency(activeLedger.currency);
    }
    setExpenseEditId(null);
    setExpenseDraft({
      category: expenseDraft.category,
      title: '',
      amount: '',
      payer: myLedgerName,            // 记完一笔回到默认:谁记账谁垫付
      payerTouched: false,
      mode: '均分',
      note: '',
      special: false,
      personShares: {},
      specialOwner: ledgerPeople.includes(expenseDraft.specialOwner) ? expenseDraft.specialOwner : (ledgerPeople[0] || '我'),
      specialAmount: '',
      specialLabel: '',
      participants: [...ledgerPeople],
    });
  };

  const deleteExpense = (id) => {
    setExpenses(prev => prev.filter(item => item.id !== id));
    if (expenseEditId === id) resetExpenseDraft();
    // 只有远端真实记录(uuid)才发远端软删;本地种子 id(meal-1 等)只在本机删
    if (isShared && isUuid(id)) deleteExpenseRemote(id).then(() => refreshLedger(ledgerId));
  };

  // 结清 = 大家把钱还清了,不是这些消费没发生过。
  // 只打标记,不删账目 —— 否则「我花了」和预算会跟着归零,旅行才到一半记录就没了。
  const settleExpenses = () => {
    if (!activeExpenses.length) {
      Alert.alert(expenses.length ? '已经都结清了' : '还没有账目', '', [{ text: '好' }]);
      return;
    }
    Alert.alert(
      '标记已还钱？',
      `${activeExpenses.length} 笔标为已结清,谁欠谁归零。账目和「我花了」都还在。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '结清',
          onPress: async () => {
            const stamp = new Date().toISOString();
            const targets = activeExpenses;
            setExpenses(prev => prev.map(item => (item.settledAt ? item : { ...item, settledAt: stamp })));
            resetExpenseDraft();
            if (!isShared) return;
            const results = await Promise.all(
              targets.filter(item => isUuid(item.id))
                .map(item => saveExpenseRemote(ledgerId, { ...item, settledAt: stamp })),
            );
            const failed = results.find(res => res?.error);
            if (failed) {
              Alert.alert('没有完全同步', '有几笔没同步到共享账本,联网后再试一次。', [{ text: '好' }]);
            }
            refreshLedger(ledgerId);
          },
        },
      ],
    );
  };

  const saveExpense = () => {
    if (!(money(expenseDraft.amount) > 0)) {
      Alert.alert('差一点点', '写一下金额就可以。', [{ text: '好' }]);
      return;
    }
    if (!ledgerPeople.length) {
      Alert.alert('还没有成员', '先添加至少一位同行者，再记这笔账。', [{ text: '好' }]);
      return;
    }
    // 守恒检查:各自价格下,各人金额之和必须等于总额,否则这笔账不平
    if (specialOver) {
      Alert.alert(
        '单独付的金额太大',
        `单独付的一项是 ${fmtMoney(money(expenseDraft.specialAmount))},比这笔的总额 ${fmtMoney(draftTotal)} 还多 ${fmtMoney(specialGap)}。`,
        [{ text: '好' }],
      );
      return;
    }
    if (!isBalanced) {
      Alert.alert(
        '账不平',
        assignGap > 0
          ? `已分配 ${fmtMoney(perPersonAssigned)} / ${fmtMoney(draftTotal)},还差 ${fmtMoney(assignGap)} 没归属。`
          : `已分配 ${fmtMoney(perPersonAssigned)},超出总额 ${fmtMoney(assignGap)},请调整金额。`,
        [{ text: '好' }],
      );
      return;
    }
    Keyboard.dismiss();
    const shares = buildShares(expenseDraft);
    const specialAmount = specialAmountFor(expenseDraft);
    const specialItem = expenseDraft.mode === '特殊项' && specialAmount > 0
      ? {
        owner: expenseDraft.specialOwner,
        label: expenseDraft.specialLabel.trim() || '特殊项',
        amount: specialAmount,
      }
      : undefined;
    const nextExpense = {
      id: expenseEditId || `expense-${Date.now()}`,
      ...expenseDraft,
      currency,                       // 这笔用的币种,结算按它分组
      createdAt: expenseDraft.createdAt || new Date().toISOString(),
      title: expenseDraft.title.trim() || expenseDraft.category,
      // amount 存算完的结果:远端 upsert、结算、导出都按纯数字读,算式不该流进去。
      // 但算式本身有信息 ——「90*2」记着单价是 90、买了两张,这正是纸上记账
      // 要保留的东西。所以另存一份给人看,不给机器算。
      amount: String(money(expenseDraft.amount)),
      amountExpr: isAmountExpr(expenseDraft.amount) ? expenseDraft.amount : undefined,
      // 备注只存用户自己写的。以前会自动生成一句「Lyra €24.40 · Ning €18.40」,
      // 而列表上一行已经渲染了同样的分摊 —— 同一件事印两遍。
      note: expenseDraft.note.trim(),
      shares,
      specialItem,
      participants: (() => {
        const chosen = (expenseDraft.participants || []).filter(p => ledgerPeople.includes(p));
        return chosen.length ? chosen : ledgerPeople;
      })(),
    };
    if (isShared) {
      // ⚠️ 把目标账本的 key 在这里就固定下来。这个回调是异步的,
      // 用户完全可能在等回应的这几百毫秒里切到另一本账 ——
      // 那时候 setExpenses 打的是「当时的当前账本」,会把 uuid 替换
      // 做到别人家的桶里(或者做不成,留下一条永远替换不掉的临时 id)。
      const targetKey = writeKey;
      const targetId = ledgerId;
      // 共享账本:写远端,再拉回最新(拿到真实 uuid)
      saveExpenseRemote(targetId, nextExpense).then(({ expense: saved, error }) => {
        if (error) {
          Alert.alert('同步失败', '这笔已记在本机,联网后会重试。', [{ text: '好' }]);
          return;
        }
        // 换成服务端给的真实 uuid。少了这一步,下一次合并会把本地这条
        // 当成「还没同步的笔」留下来,和远端那条并存 —— 一笔变两笔,结算翻倍。
        patchLedgerByKey(targetKey, l => ({
          expenses: replaceLocalId(l.expenses, nextExpense.id, saved),
        }));
        refreshLedger(targetId);
      });
      // 乐观更新,先让本机看到
      setExpenses(prev => (
        expenseEditId ? prev.map(item => (item.id === expenseEditId ? nextExpense : item)) : [nextExpense, ...prev]
      ));
    } else {
      setExpenses(prev => (
        expenseEditId
          ? prev.map(item => (item.id === expenseEditId ? nextExpense : item))
          : [nextExpense, ...prev]
      ));
    }
    resetExpenseDraft();
  };

  return (
    <>
      <TouchableOpacity style={tn.fab} onPress={() => setVisible(true)} activeOpacity={0.88}>
        <Text style={tn.fabIcon}>📓</Text>
        <View style={tn.fabDot} />
      </TouchableOpacity>
      <TouchableOpacity style={tn.ledgerFab} onPress={() => setLedgerOpen(true)} activeOpacity={0.88}>
        <Text style={tn.ledgerFabIcon}>🧮</Text>
        <Text style={tn.ledgerFabHint}>{expenses.length}</Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <KeyboardAvoidingView
          style={tn.modalLayer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={tn.scrim} onPress={() => setVisible(false)} />
          <View style={tn.sheet}>
            <View style={tn.head}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <Text style={tn.mark}>言</Text>
                <View>
                  <Text style={tn.title}>小本子</Text>
                  <Text style={tn.sub}>当前旅程 · 路上小纸条</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Text style={tn.close}>×</Text>
              </TouchableOpacity>
            </View>

            {editIdx !== undefined ? (
              <ScrollView style={tn.body} keyboardShouldPersistTaps="handled">
                <Text style={tn.section}>人工编辑</Text>
                <TextInput
                  style={tn.input}
                  value={draft.title}
                  onChangeText={title => setDraft(prev => ({ ...prev, title }))}
                  placeholder="标题，如 Dublin → Galway"
                  placeholderTextColor={C.mutedLight}
                />
                <TextInput
                  style={tn.input}
                  value={draft.summary}
                  onChangeText={summary => setDraft(prev => ({ ...prev, summary }))}
                  placeholder="摘要"
                  placeholderTextColor={C.mutedLight}
                />
                <TextInput
                  style={[tn.input, tn.area]}
                  value={draft.detail}
                  onChangeText={detail => setDraft(prev => ({ ...prev, detail }))}
                  placeholder="时间、地址、航班、酒店…"
                  placeholderTextColor={C.mutedLight}
                  multiline
                />
                <TextInput
                  style={tn.input}
                  value={draft.phrase}
                  onChangeText={phrase => setDraft(prev => ({ ...prev, phrase }))}
                  placeholder="这段路会用到的一句话"
                  placeholderTextColor={C.mutedLight}
                />
                <View style={tn.editRow}>
                  <TouchableOpacity style={tn.ghostBtn} onPress={() => setEditIdx(undefined)}>
                    <Text style={tn.ghostTxt}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={tn.darkBtn} onPress={saveEdit}>
                    <Text style={tn.darkTxt}>保存</Text>
                  </TouchableOpacity>
                </View>
                {editIdx !== null && (
                  <TouchableOpacity style={tn.deleteLegBtn} onPress={deleteLeg}>
                    <Text style={tn.deleteLegTxt}>删除这一段</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            ) : (
              <ScrollView style={tn.body} showsVerticalScrollIndicator={false}>
                <View style={tn.bookRail}>
                  {books.map(book => (
                    <TouchableOpacity
                      key={book.id}
                      style={[tn.bookChip, activeBook.id === book.id && tn.bookChipAct]}
                      onPress={() => { setActiveBookId(book.id); setExpanded(book.legs?.length ? 0 : null); setToolsOpen(false); }}
                      activeOpacity={0.84}
                    >
                      <Text style={[tn.bookChipTitle, activeBook.id === book.id && tn.bookChipTitleAct]} numberOfLines={1}>{book.title}</Text>
                      <Text style={[tn.bookChipSub, activeBook.id === book.id && tn.bookChipSubAct]} numberOfLines={1}>{book.status}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={tn.bookHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={tn.bookK}>旅行册</Text>
                    <Text style={tn.bookTitle}>{activeBook.title}</Text>
                    <Text style={tn.bookSub}>{activeBook.subtitle}</Text>
                  </View>
                  <TouchableOpacity style={tn.topTool} onPress={() => setToolsOpen(prev => !prev)}>
                    <Text style={tn.topToolTxt}>补</Text>
                  </TouchableOpacity>
                </View>

                <View style={tn.now}>
                  <Text style={tn.kicker}>{currentEyebrow}</Text>
                  <Text style={tn.nowTitle}>{nowCard.title}</Text>
                  <Text style={tn.nowText}>{nowCard.note}</Text>
                  <View style={tn.route}>
                    <View style={tn.place}>
                      <Text style={tn.placeK}>FROM</Text>
                      <Text style={tn.placeT}>{nowCard.from}</Text>
                    </View>
                    <Text style={tn.arrow}>→</Text>
                    <View style={tn.place}>
                      <Text style={tn.placeK}>TO</Text>
                      <Text style={tn.placeT}>{nowCard.to}</Text>
                    </View>
                  </View>
                  <Text style={tn.timeHint}>{nowCard.time}</Text>
                  <View style={tn.phrase}>
                    <View style={{ flex: 1 }}>
                      <Text style={tn.phraseEn}>{nowCard.phrase}</Text>
                      <Text style={tn.phraseCn}>{nowCard.phraseZh}</Text>
                    </View>
                    <SpeakBtn
                      onPress={() => speak(nowCard.phrase, 'en-GB', 'trip-now')}
                      speaking={speakingKey === 'trip-now'}
                      size="sm"
                      color={C.teal}
                    />
                  </View>
                </View>

                <TouchableOpacity style={tn.scenesEntry} activeOpacity={0.85} onPress={() => setScenesOpen(true)}>
                  <View style={{ flex: 1 }}>
                    <Text style={tn.scenesEntryTitle}>常用英语 · 照着说</Text>
                    <Text style={tn.scenesEntrySub}>坐飞机 · 公共交通 · 入住 · 吃饭 · 逛景点</Text>
                  </View>
                  <Text style={tn.scenesEntryGo}>→</Text>
                </TouchableOpacity>

                <TouchableOpacity style={tn.scenesEntry} activeOpacity={0.85} onPress={() => setFxOpen(true)}>
                  <View style={{ flex: 1 }}>
                    <Text style={tn.scenesEntryTitle}>汇率 · 这值多少钱</Text>
                    <Text style={tn.scenesEntrySub}>€ · £ · ₺ · $ · ¥ · ₩</Text>
                  </View>
                  <Text style={tn.scenesEntryGo}>→</Text>
                </TouchableOpacity>

                {toolsOpen && (
                  <View style={tn.toolsCard}>
                    <Text style={tn.uploadTitle}>补进资料</Text>
                    <Text style={tn.uploadSub}>订单 / 截图 / 酒店，先存着</Text>
                    {/* 这些图只存在本机(换机后 uri 失效,所以刻意不上云)。
                        不说清楚的话,用户换手机才发现没了 —— 那是不可逆的损失。 */}
                    <Text style={tn.uploadWarn}>只存在这台手机上,换机或删 App 会丢失。重要凭证请另存一份。</Text>
                    {uploads.length > 0 && (
                      <>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tn.thumbRow}>
                          {uploads.map(u => (
                            <TouchableOpacity key={u.id || u.uri} onPress={() => removeUpload(u.id)} activeOpacity={0.85}>
                              <Image source={{ uri: u.uri }} style={tn.thumb} />
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                        <View style={tn.uploadActions}>
                          <TouchableOpacity style={[tn.recognizeBtn, ocrBusy && tn.recognizeBtnOff]} disabled={ocrBusy} onPress={recognizeUploads}>
                            <Text style={tn.recognizeTxt}>{ocrBusy ? '识别中…' : '识别订单 → 生成行程'}</Text>
                          </TouchableOpacity>
                          {/* 欧盟 AI Act 第 50 条:用户直接与 AI 系统交互时应当当场知情。
                              立法意图是「当场」,所以这句话必须在按钮旁边 ——
                              藏进隐私政策等于没做。这也是全 App 唯一一处用到 AI。 */}
                          <Text style={tn.aiNote}>由 AI 识别，结果请核对</Text>
                          <TouchableOpacity onPress={() => startEdit(null)}>
                            <Text style={tn.fromUpload}>手动新增</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                    <View style={tn.toolGrid}>
                      <TouchableOpacity style={tn.toolBtn} onPress={pickOrder}>
                        <Text style={tn.toolBtnTxt}>上传</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={tn.toolBtn} onPress={() => startEdit(null)}>
                        <Text style={tn.toolBtnTxt}>新增段落</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={tn.toolBtn} onPress={() => { setToolsOpen(false); setLedgerOpen(true); }}>
                        <Text style={tn.toolBtnTxt}>分账</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={tn.toolBtn} onPress={createDraftBook}>
                        <Text style={tn.toolBtnTxt}>新旅行册</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <View style={tn.sectionRow}>
                  <Text style={tn.section}>行程</Text>
                  <TouchableOpacity onPress={() => setToolsOpen(prev => !prev)}>
                    <Text style={tn.add}>{activeBook.gaps.length} 处待补齐</Text>
                  </TouchableOpacity>
                </View>

                {legs.length === 0 && (
                  <View style={tn.emptyBook}>
                    <Text style={tn.emptyTitle}>开始记你的第一趟。</Text>
                    <Text style={tn.emptySub}>上传机票 / 酒店截图,或手动写第一段路。到了照着上面的「常用英语」说。</Text>
                    <View style={tn.emptyBtns}>
                      <TouchableOpacity style={tn.emptyBtnDark} onPress={() => startEdit(null)}>
                        <Text style={tn.emptyBtnDarkTxt}>手动新增一段</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={tn.emptyBtn} onPress={pickOrder}>
                        <Text style={tn.emptyBtnTxt}>上传资料</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={loadSample}>
                      <Text style={tn.emptySample}>先看看示例行程 →</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {legs.map((leg, i) => {
                  const isFlipped = !!flipped[i];
                  const pIdx = pocketSel[i] || 0;
                  const pocket = leg.pockets?.[pIdx] || leg.pockets?.[0];
                  const sIdx = stepSel[`${i}-${pIdx}`] || 0;
                  const site = pocket?.steps ? (pocket.steps[sIdx] || pocket.steps[0]) : pocket;
                  return (
                  <View key={`${leg.day}-${i}`} style={[tn.leg, expanded === i && tn.legOpen]}>
                    <TouchableOpacity
                      style={tn.legHead}
                      onPress={() => setExpanded(expanded === i ? null : i)}
                      activeOpacity={0.84}
                    >
                      <View style={tn.date}>
                        <Text style={tn.mon}>{leg.mon}</Text>
                        <Text style={tn.day}>{leg.day}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={tn.legTitle}>{leg.title}</Text>
                        <Text style={tn.legSub}>{leg.summary}</Text>
                      </View>
                      {leg.pockets?.length > 0 && (
                        <TouchableOpacity
                          style={[tn.flipPill, isFlipped && tn.flipPillAct]}
                          onPress={() => { setExpanded(i); setFlipped(prev => ({ ...prev, [i]: !prev[i] })); }}
                        >
                          <Text style={[tn.flipTxt, isFlipped && tn.flipTxtAct]}>{isFlipped ? '行程' : '现场'}</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={tn.editPill} onPress={() => startEdit(i)}>
                        <Text style={tn.editTxt}>改</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                    {expanded === i && !isFlipped && (
                      <View style={tn.legBody}>
                        {leg.detail.split('\n').map((line, idx) => <Text key={idx} style={tn.line}>{line}</Text>)}
                        {leg.family && (
                          <TouchableOpacity style={tn.legScenes} onPress={() => openScenes(leg.family)}>
                            <Text style={tn.legScenesTxt}>常用英语 · {famLabelOf(leg.family)} →</Text>
                          </TouchableOpacity>
                        )}
                        {leg.pockets?.length > 0 ? (
                          <TouchableOpacity style={tn.toSite} onPress={() => { setExpanded(i); setFlipped(prev => ({ ...prev, [i]: true })); }}>
                            <Text style={tn.toSiteTxt}>翻到现场 · 到了这儿要说的话 →</Text>
                          </TouchableOpacity>
                        ) : (
                          <>
                            <View style={tn.miniPhrase}>
                              <Text style={tn.miniEn}>{leg.phrase}</Text>
                            </View>
                            <TouchableOpacity style={tn.toSite} onPress={() => addPocket(i)}>
                              <Text style={tn.toSiteTxt}>＋ 给这段加个现场场景</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    )}
                    {expanded === i && isFlipped && pocket && (() => {
                      const editing = siteEdit && siteEdit.i === i && siteEdit.pIdx === pIdx && siteEdit.sIdx === sIdx;
                      return (
                      <View style={tn.legBody}>
                        {/* 场景标签 */}
                        {leg.pockets.length > 1 && (
                          <View style={tn.sceneTabs}>
                            {leg.pockets.map((pk, j) => (
                              <TouchableOpacity key={j} style={[tn.sceneTab, j === pIdx && tn.sceneTabAct]} onPress={() => { setSiteEdit(null); setPocketSel(prev => ({ ...prev, [i]: j })); }}>
                                <Text style={[tn.sceneTabTxt, j === pIdx && tn.sceneTabTxtAct]}>{pk.label}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                        {/* 步骤(机场那种多步场景) */}
                        {pocket.steps && (
                          <View style={tn.stepPath}>
                            {pocket.steps.map((st, j) => (
                              <TouchableOpacity key={j} style={[tn.stepTab, j === sIdx && tn.stepTabAct]} onPress={() => { setSiteEdit(null); setStepSel(prev => ({ ...prev, [`${i}-${pIdx}`]: j })); }}>
                                <Text style={[tn.stepTabTxt, j === sIdx && tn.stepTabTxtAct]}>{st.label}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                        {/* 编辑控制条 */}
                        <View style={tn.siteBar}>
                          {editing ? (
                            <>
                              {!pocket.steps && <TouchableOpacity onPress={() => removePocket(i, pIdx)}><Text style={tn.siteDel}>删场景</Text></TouchableOpacity>}
                              <View style={{ flex: 1 }} />
                              <TouchableOpacity onPress={() => setSiteEdit(null)}><Text style={tn.siteBarTxt}>取消</Text></TouchableOpacity>
                              <TouchableOpacity onPress={saveSite}><Text style={[tn.siteBarTxt, tn.siteSave]}>保存</Text></TouchableOpacity>
                            </>
                          ) : (
                            <>
                              <View style={{ flex: 1 }} />
                              <TouchableOpacity onPress={() => startSiteEdit(i, pIdx, sIdx, site, pocket.label)}><Text style={tn.siteBarTxt}>改</Text></TouchableOpacity>
                              <TouchableOpacity onPress={() => addPocket(i)}><Text style={[tn.siteBarTxt, tn.siteSave]}>＋场景</Text></TouchableOpacity>
                            </>
                          )}
                        </View>
                        {editing && !pocket.steps && (
                          <TextInput style={tn.siteInput} value={siteEdit.label} onChangeText={v => setSiteEdit(s => ({ ...s, label: v }))} placeholder="场景名，如 车站 / 酒店" placeholderTextColor={C.mutedLight} />
                        )}
                        {/* 看什么 / 直接问 */}
                        <Text style={tn.siteLabel}>看什么</Text>
                        {editing
                          ? <TextInput style={[tn.siteInput, tn.siteArea]} value={siteEdit.look} onChangeText={v => setSiteEdit(s => ({ ...s, look: v }))} placeholder="到了看哪些字 / 标识" placeholderTextColor={C.mutedLight} multiline />
                          : <Text style={tn.siteLook}>{stripLook(site.look) || '—'}</Text>}
                        <Text style={tn.siteLabel}>直接问</Text>
                        {editing
                          ? <TextInput style={tn.siteInput} value={siteEdit.say} onChangeText={v => setSiteEdit(s => ({ ...s, say: v }))} placeholder="要说的那句英文" placeholderTextColor={C.mutedLight} />
                          : (
                            <View style={tn.sitePhrase}>
                              <Text style={tn.siteSay}>{site.say || '—'}</Text>
                              {!!site.say && <SpeakBtn onPress={() => speak(site.say, 'en-GB', `site-${i}-${pIdx}-${sIdx}`)} speaking={speakingKey === `site-${i}-${pIdx}-${sIdx}`} size="sm" color={C.teal} />}
                            </View>
                          )}
                        {editing
                          ? <TextInput style={tn.siteInput} value={siteEdit.sayZh} onChangeText={v => setSiteEdit(s => ({ ...s, sayZh: v }))} placeholder="中文意思(可不填)" placeholderTextColor={C.mutedLight} />
                          : (site.sayZh ? <Text style={tn.siteSayZh}>{site.sayZh}</Text> : null)}
                      </View>
                      );
                    })()}
                  </View>
                );})}

                <View style={tn.todo}>
                  <Text style={tn.todoTitle}>还缺几件小事</Text>
                  {activeBook.gaps.map(gap => <Text key={gap} style={tn.todoLine}>· {gap}</Text>)}
                </View>
              </ScrollView>
            )}
          </View>

          {/* 常用英语:小本子内部覆盖层(不叠 Modal,避免 iOS 模态叠模态打不开) */}
          {scenesOpen && (
            <View style={tn.scenesOverlay}>
              <View style={tn.head}>
                <View>
                  <Text style={tn.title}>常用英语</Text>
                  <Text style={tn.sub}>到了照着说 · 点 言 听发音</Text>
                </View>
                <TouchableOpacity onPress={() => setScenesOpen(false)}>
                  <Text style={tn.close}>×</Text>
                </TouchableOpacity>
              </View>
              <View style={tn.famTabs}>
                {SCENE_PACK.map(fam => (
                  <TouchableOpacity key={fam.key} style={[tn.famTab, sceneFam === fam.key && tn.famTabAct]} onPress={() => { setSceneFam(fam.key); setSceneOpenIdx(0); }}>
                    <Text style={[tn.famTabTxt, sceneFam === fam.key && tn.famTabTxtAct]}>{fam.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <ScrollView style={tn.body} showsVerticalScrollIndicator={false}>
                {(SCENE_PACK.find(f => f.key === sceneFam)?.scenes || []).map((scene, si) => {
                  const open = sceneOpenIdx === si;
                  return (
                    <View key={scene.label} style={[tn.sceneCard, open && tn.sceneCardOpen]}>
                      <TouchableOpacity style={tn.sceneCardHead} onPress={() => setSceneOpenIdx(open ? -1 : si)} activeOpacity={0.84}>
                        <Text style={tn.sceneCardTitle}>{scene.label}</Text>
                        <Text style={tn.sceneCardChevron}>{open ? '—' : '+'}</Text>
                      </TouchableOpacity>
                      {open && (
                        <View style={tn.sceneCardBody}>
                          {!!scene.look && <Text style={tn.sceneLook}>{stripLook(scene.look)}</Text>}
                          {scene.lines.map((ln, li) => (
                            <View key={li} style={tn.sceneLine}>
                              <View style={{ flex: 1 }}>
                                {!!ln.when && <Text style={tn.sceneWhen}>{ln.when}</Text>}
                                <Text style={tn.sceneEn}>{ln.en}</Text>
                                <Text style={tn.sceneZh}>{ln.zh}</Text>
                              </View>
                              <SpeakBtn onPress={() => speak(ln.en, 'en-GB', `pack-${sceneFam}-${si}-${li}`)} speaking={speakingKey === `pack-${sceneFam}-${si}-${li}`} size="sm" color={C.teal} />
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
                <View style={{ height: 24 }} />
              </ScrollView>
            </View>
          )}

          {/* 汇率:同样走弹窗内浮层,不叠 Modal */}
          {fxOpen && (
            <View style={tn.scenesOverlay}>
              <View style={tn.head}>
                <View>
                  <Text style={tn.title}>汇率</Text>
                  <Text style={tn.sub}>参考价</Text>
                </View>
                <TouchableOpacity onPress={() => setFxOpen(false)}>
                  <Text style={tn.close}>×</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={tn.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <FxPanel initialFrom={FX_CODES[currency] || 'TRY'} initialTo="CNY" />
                <View style={{ height: 24 }} />
              </ScrollView>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={ledgerOpen} transparent animationType="slide" onRequestClose={() => setLedgerOpen(false)}>
        <KeyboardAvoidingView
          style={tn.modalLayer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* 点空白处只收键盘,不关弹窗(防误触退出);关闭走右上角 × */}
          <Pressable style={tn.scrim} onPress={() => Keyboard.dismiss()} />
          <View style={[tn.sheet, tn.ledgerSheet]}>
            <View style={tn.head}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <Text style={tn.mark}>言</Text>
                <View>
                  <Text style={tn.title}>分账</Text>
                  <Text style={tn.sub}>{isShared ? `共享账本 · ${ledgerPeople.length} 人` : '本机记账'}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setLedgerOpen(false)}>
                <Text style={tn.close}>×</Text>
              </TouchableOpacity>
            </View>

            {/* ── 账本切换 ──
                账本和旅行册解耦之后可以同时开好几本(同一周和不同的人各出去一趟)。
                这一行永远显示「现在记的是哪本」—— 记错本子和记错币种一样,
                是那种事后翻半天才看得出来的错。 */}
            <TouchableOpacity style={tn.bookBar} activeOpacity={0.8} onPress={() => setLedgerPickerOpen(v => !v)}>
              <View style={{ flex: 1 }}>
                <Text style={tn.bookBarName} numberOfLines={1}>{activeLedger.title}</Text>
                <Text style={tn.bookBarMeta}>
                  {activeLedger.shared ? '共享' : '本机'} · {activeLedger.expenses.length} 笔
                  {ledgers.length > 1 ? ` · 共 ${ledgers.length} 本` : ''}
                </Text>
              </View>
              <Text style={tn.bookBarChev}>{ledgerPickerOpen ? '−' : '⇅'}</Text>
            </TouchableOpacity>
            {ledgerPickerOpen && (
              <View style={tn.bookList}>
                {ledgers.map(l => {
                  const on = l.key === activeLedgerKey;
                  return (
                    <View key={l.key} style={tn.bookRow}>
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={() => { setActiveLedgerKey(l.key); setLedgerPickerOpen(false); }}
                      >
                        <Text style={[tn.bookRowName, on && tn.bookRowNameOn]} numberOfLines={1}>
                          {on ? '· ' : ''}{l.title}
                        </Text>
                        <Text style={tn.bookRowMeta}>
                          {l.shared ? `共享 · 码 ${l.joinCode || '—'}` : '本机'} · {l.expenses.length} 笔 · {l.currency}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setLedgerRename({ key: l.key, text: l.title })}
                        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                      >
                        <Text style={tn.bookRowOp}>改名</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => deleteLedger(l.key)}
                        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                      >
                        <Text style={[tn.bookRowOp, tn.bookRowDel]}>删</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
                {!!ledgerRename && (
                  <View style={tn.inviteRow}>
                    <TextInput
                      style={[tn.joinInput, { textAlign: 'left' }]}
                      value={ledgerRename.text}
                      onChangeText={text => setLedgerRename(r => ({ ...r, text }))}
                      placeholder="账本名字"
                      placeholderTextColor={C.mutedLight}
                      autoFocus
                    />
                    <TouchableOpacity style={tn.inviteBtn} onPress={saveLedgerRename}>
                      <Text style={tn.inviteTxt}>存</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity style={tn.bookAdd} onPress={createLocalLedger}>
                  <Text style={tn.bookAddTxt}>+ 新建一本账</Text>
                </TouchableOpacity>
              </View>
            )}
            <ScrollView style={tn.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              {/* ── 我的支出 ──
                  这块原来叫「我花了」,只给一行数字,是分账的一个中间量。
                  但它其实已经是一份完整的个人消费记录:每笔账里我承担的那一份,
                  就是我这趟真花掉的钱。摊开成表就能回答「我在土耳其自己花了多少、
                  花在哪」—— 不用再单独记一套账。
                  预算降级成这块的附加物(一个安静的链接):支出记录是主体,
                  预算是可选的、想管的时候才设的东西。 */}
              {/* 一笔账都没有时也要露一行 —— 否则「想设预算却找不到入口」。
                  新账本因此多一块空内容,那个代价可以接受;找不到入口不行。 */}
              {mySpend.length === 0 && !budget ? (
                <TouchableOpacity style={tn.meEmpty} onPress={openBudgetEditor}>
                  <Text style={tn.meEmptyTxt}>还没有支出</Text>
                  <Text style={tn.meEmptyLink}>设个预算</Text>
                </TouchableOpacity>
              ) : null}
              {mySpend.length === 0 && !budget && budgetEditing && renderBudgetEditor()}
              {(mySpend.length > 0 || budget) && (
                <View style={tn.meBox}>
                  <TouchableOpacity
                    style={tn.meRow}
                    activeOpacity={0.8}
                    onPress={() => setSpendOpen(v => !v)}
                  >
                    <Text style={tn.meRowK}>我的支出</Text>
                    <View style={tn.meAmounts}>
                      {mySpend.length === 0 && <Text style={tn.meRowNum}>{currency}0.00</Text>}
                      {mySpend.map(x => (
                        <Text key={x.cur} style={tn.meRowNum}>{fmtIn(x.spent, x.cur)}</Text>
                      ))}
                    </View>
                    <Text style={tn.meChevron}>{spendOpen ? '−' : '+'}</Text>
                  </TouchableOpacity>

                  {/* ── 一共花了多少 ──
                      上面那排是原货币,是事实,永远留着。这一行是折算出来的参考值,
                      加一层、不替换 —— 和结算那边的「换/换回」同一条规矩。

                      左边这一块管「折算成哪种货币」,右边的换/换回管开关 ——
                      和结算面板同一个分工,免得两块地方两套操作方式。
                      选的是**同一个** settleCurrency:一个人心里「一共花了多少」
                      的尺子只有一把,结算和支出各记一个目标币种只会互相打架。 */}
                  {canMergeSpend && (
                    <>
                      <View style={tn.meTotalRow}>
                        <TouchableOpacity
                          style={{ flex: 1 }}
                          activeOpacity={0.7}
                          onPress={() => setSpendCurOpen(v => !v)}
                        >
                          {spendMergeOn ? (
                            <>
                              <Text style={tn.meTotalNum}>
                                一共约 {fmtIn(spendConverted.total, mergeCurSym)}
                                <Text style={tn.mergeCaret}>{spendCurOpen ? ' ▾' : ' ▸'}</Text>
                              </Text>
                              <Text style={tn.meTotalMeta}>
                                {mySpend.length} 个币种按参考汇率折算 · {fxDay || '—'} · 上面那排才是原账
                                {spendCurOpen ? '' : ' · 点这里换一种'}
                              </Text>
                            </>
                          ) : (
                            // 没折算时也要给托盘入口和光标 —— 左边永远是「换成哪种」、
                            // 右边永远是开关,两个状态下同一个分工,不让人猜
                            <Text style={tn.meTotalHint}>
                              {mySpend.length} 个币种 · 想知道一共花了多少?
                              <Text style={tn.mergeCaret}>{spendCurOpen ? ' ▾' : ' ▸'}</Text>
                            </Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setSpendMergeOn(v => !v)}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        >
                          <Text style={[tn.mergePick, spendMergeOn && tn.mergePickOn]}>
                            {spendMergeOn ? '换回' : `换成 ${mergeCurSym}`}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {/* 选完顺手把折算打开:用户点进来换币种,想看的就是换完的结果。
                          让他再点一次「换」等于把一个动作拆成两步。 */}
                      {spendCurOpen && renderCurTray({
                        active: mergeCurSym,
                        fxOnly: true,
                        onPick: (c) => { setSettleCur(c); setSpendCurOpen(false); setSpendMergeOn(true); },
                      })}
                    </>
                  )}

                  {spendOpen && (() => {
                    // 默认看花得最多的那个币种;多币种时上面给一排可点的币种
                    const curs = mySpend.map(x => x.cur);
                    const pick = curs.includes(spendCur) ? spendCur : (curs[0] || currency);
                    const rows = mySpendRows(pick);
                    const mineTotal = rows.reduce((s, r) => s + r.mine, 0);
                    return (
                      <View style={tn.spendPanel}>
                        {curs.length > 1 && (
                          <View style={tn.curTray}>
                            {curs.map(c => (
                              <TouchableOpacity
                                key={c}
                                style={[tn.curChip, pick === c && tn.curChipAct]}
                                onPress={() => setSpendCur(c)}
                              >
                                <Text style={[tn.curTxt, pick === c && tn.curTxtAct]}>{c}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                        <View style={tn.spendHead}>
                          <Text style={tn.spendHeadK}>{rows.length} 笔 · 我担</Text>
                          <View style={{ flex: 1 }} />
                          <Text style={tn.spendHeadNum}>{fmtIn(mineTotal, pick)}</Text>
                        </View>
                        {rows.map(({ item, mine, total }) => (
                          <View key={item.id} style={tn.spendRow}>
                            <Text style={tn.spendDay}>{expenseDay(item) || '—'}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={tn.spendName} numberOfLines={1}>
                                {item.title && item.title !== item.category
                                  ? `${item.title}`
                                  : item.category}
                              </Text>
                              <Text style={tn.spendCat}>{item.category}</Text>
                            </View>
                            {/* 两个数字都要给:只给「我担」的话,₺4500 的门票会被
                                当成自己花了 4500,实际只担了 2250。 */}
                            <View style={tn.spendNums}>
                              <Text style={tn.spendMine}>{fmtIn(mine, pick)}</Text>
                              {Math.abs(total - mine) > 0.005 && (
                                <Text style={tn.spendTotal}>总 {fmtIn(total, pick)}</Text>
                              )}
                            </View>
                          </View>
                        ))}
                        {!rows.length && (
                          <Text style={tn.payNone}>这个币种下我还没承担过任何一笔。</Text>
                        )}
                        <TouchableOpacity style={tn.spendBudget} onPress={openBudgetEditor}>
                          <Text style={tn.spendBudgetTxt}>
                            {budget
                              ? `预算 ${fmtIn(money(budget.amount), budgetCur)} · 已用 ${Math.round(budgetPct * 100)}%`
                              : '设个预算'}
                          </Text>
                          {/* 跨币种的进度是折算出来的估算,必须说出来 ——
                              不说的话那个百分比看起来和「实打实花了多少」一模一样 */}
                          {budget && budgetAcrossCur && (
                            <Text style={tn.spendBudgetMeta}>
                              含全部 {mySpend.length} 个币种,按参考汇率折算 · {fxDay || '—'}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })()}

                  {budget && money(budget.amount) > 0 && (
                    <View style={tn.meBarTrack}>
                      <View style={[
                        tn.meBarFill,
                        { width: `${Math.max(budgetPct * 100, 1)}%` },
                        overBudget && tn.meBarOver,
                      ]} />
                    </View>
                  )}

                  {budgetEditing && renderBudgetEditor()}
                </View>
              )}

              {/* ── 结算:账本的高光;点开看每人明细 ── */}
              <TouchableOpacity style={tn.settleAction} activeOpacity={0.9} onPress={() => toggleOnly('settle', settleOpen)}>
                <View style={{ flex: 1 }}>
                  <Text style={tn.settleActionK}>结算</Text>
                  {settleHead.length === 0
                    ? <Text style={tn.settleActionMain}>现在基本扯平。</Text>
                    : settleHead.map(l => (
                      <Text key={`${l.from}-${l.to}-${l.cur}`} style={tn.settleActionMain}>
                        {payText(l)} {fmtIn(l.amount, l.cur)}
                      </Text>
                    ))}
                  {settleRest > 0 && (
                    <Text style={tn.settleActionRest}>还有 {settleRest} 笔</Text>
                  )}
                </View>
                <Text style={tn.settleActionArrow}>{settleOpen ? '−' : '→'}</Text>
              </TouchableOpacity>
              {settleOpen && (
                <View style={tn.settlePanel}>
                  {canMerge && (
                    <View>
                      {/* 「换」是可以再点一下换回来的开关,不是一次性转换。
                          原来它只负责打开货币托盘,选完就把 mergeOn 拨到 true ——
                          于是原始币种的数字整片消失,而看不出有路回去。
                          现在:左边这一块管「折算成哪种货币」,右边的换/换回管开关。
                          账目本身永远只存原始币种和原始金额(见 saveExpense),
                          折算是每次渲染现算的,所以换回来拿到的一定是原账,不是反算的结果。 */}
                      <View style={tn.mergeRow}>
                        <TouchableOpacity onPress={() => setSettleCurOpen(v => !v)} activeOpacity={0.7} style={{ flex: 1 }}>
                          <Text style={tn.mergeTxt}>
                            {mergeOn ? `已折算成 ${mergeCurSym}` : `合并成 ${mergeCurSym}`}
                            <Text style={tn.mergeCaret}>{settleCurOpen ? ' ▾' : ' ▸'}</Text>
                          </Text>
                          <Text style={tn.mergeMeta}>
                            {/* 目标币种一直是可以换的,但光给一个符号看不出来能点。
                                写清楚「点这里换一种」—— 人在土耳其想看里拉总账、
                                回国想看人民币,这个选择不该由我们替他定死。 */}
                            {mergeOn
                              ? `原账仍是 ${currenciesIn(activeExpenses).join(' / ')} · 参考汇率 ${fxDay}`
                              : '省得来回倒'}
                            {settleCurOpen ? '' : ' · 点这里换一种'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setMergeOn(v => !v)}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        >
                          <Text style={[tn.mergePick, mergeOn && tn.mergePickOn]}>
                            {mergeOn ? '换回' : '换'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {settleCurOpen && renderCurTray({
                        active: mergeCurSym,
                        fxOnly: true,
                        onPick: (c) => { setSettleCur(c); setSettleCurOpen(false); setMergeOn(true); },
                      })}
                      {/* 折算态下,**每个币种各自摆出自己的汇率和日期**。
                          顶上只给一个总日期是不够的:没人能复核一个不知道按什么算出来的数。
                          汇率用 fmtRate 而不是 fmtFx —— 后者按币种取两位小数,
                          1 ₺ = 0.1418 ¥ 会被舍成 0.14,差 1.3%,拿着它对不上账。
                          顺带把近十天走势也画上(和小本子的汇率浮层同一套说法)。 */}
                      {mergeOn && (
                        <View style={tn.fxTrendBox}>
                          {currenciesIn(activeExpenses)
                            .filter(c => c !== mergeCurSym && FX_CODES[c])
                            .map(c => {
                              const from = FX_CODES[c];
                              const one = rateOf(fxRates?.rates, from, mergeTargetCode);
                              const series = seriesFor(fxRates, from, mergeTargetCode);
                              return (
                                <View key={c} style={tn.fxTrendRow}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={tn.fxTrendMain}>
                                      1 {c} = {mergeCurSym}{fmtRate(one)}
                                      <Text style={tn.fxTrendDay}>{fxDay ? ` · ${fxDay}` : ''}</Text>
                                    </Text>
                                    <Text style={tn.fxTrendMeta}>{fxRangeText(series)}</Text>
                                  </View>
                                  <Sparkline data={series} />
                                </View>
                              );
                            })}
                          <Text style={tn.fxTrendFoot}>
                            银行间参考价 · 刷卡再贵 1–3%{fxRates?.stale ? ' · 离线,用的是缓存' : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                  {shownGroups.map(group => (
                    <View key={group.cur}>
                      {/* 只有跨币种时才需要标出这一段是哪种货币 */}
                      {multiCurrency && !mergedGroup && (
                        <View style={tn.curDivider}>
                          <Text style={tn.curDividerTxt}>{group.cur}</Text>
                          <View style={tn.curDividerLine} />
                        </View>
                      )}
                      {/* 真正要执行的动作:谁给谁多少。净额化后转账笔数已是最少 */}
                      {orderMineFirst(group.lines).map(l => (
                        <View key={`${l.from}-${l.to}`} style={tn.payRow}>
                          <Text style={[tn.payPair, involvesMe(l) && tn.payPairMine]}>{payText(l)}</Text>
                          <Text style={tn.payAmt}>{fmtIn(l.amount, l.cur)}</Text>
                        </View>
                      ))}
                      {!group.lines.length && <Text style={tn.payNone}>这组扯平了</Text>}
                      <View style={tn.payRule} />
                    </View>
                  ))}

                  {/* ── 过程 ──
                      **结论只能验对错,过程才能定位错在哪。**
                      2026-08 那趟旅行:一张 ₺4500 的门票被记成了 ¥4500,
                      结论从「dyn 欠 891」翻成「ysy 欠 1358」,而界面上只有那一行结论,
                      没有任何东西能让人看出哪里不对。如果当时摊着「人民币合计 ¥26,025」,
                      一眼就知道错了 —— 实际只有 ¥21,525。
                      所以这块**默认展开**,不再藏在「看每人明细」后面。
                      ⚠️ 一律走 settleGroups(原始币种),不走 shownGroups:
                      折算后 shownGroups 只剩一个合并组、它没有 rows,
                      按它渲染会让整块过程在折算态下变成空白。原账永远看得到。 */}
                  {settleGroups.map(group => {
                    const rows = (group.rows || []).filter(r => r.paid > 0.005 || r.owed > 0.005);
                    const total = rows.reduce((s, r) => s + r.paid, 0);
                    const count = activeExpenses.filter(i => curOf(i) === group.cur).length;
                    return (
                      <View key={`detail-${group.cur}`} style={tn.procBox}>
                        <View style={tn.procHead}>
                          <Text style={tn.procHeadCur}>{group.cur}</Text>
                          <Text style={tn.procHeadMeta}>{count} 笔</Text>
                          <View style={{ flex: 1 }} />
                          <Text style={tn.procHeadTotal}>合计 {fmtIn(total, group.cur)}</Text>
                        </View>
                        {rows.map(row => (
                          <View key={row.person} style={tn.procRow}>
                            <Text style={tn.procName}>{sayWho(row.person)}</Text>
                            <Text style={tn.procNum}>垫 {fmtIn(row.paid, group.cur)}</Text>
                            <Text style={tn.procNum}>担 {fmtIn(row.owed, group.cur)}</Text>
                          </View>
                        ))}
                        {!rows.length && <Text style={tn.payNone}>这组没有金额</Text>}
                      </View>
                    );
                  })}
                  <TouchableOpacity style={tn.settleClear} onPress={settleExpenses} disabled={!activeExpenses.length}>
                    <Text style={[tn.settleClearTxt, !activeExpenses.length && tn.settleClearTxtOff]}>标记已还钱</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ── 记一笔:主路径只有「金额 + 谁垫的」,其余收在「调整」里 ──
                  看结算的时候整块藏起来:那一刻用户在对账,不在记账,
                  而结算本身还要展开每人明细,再叠一个记账表单页面就没法看了。 */}
              {!settleOpen && (
              <View style={tn.ledgerCard}>
                <View style={tn.amountRow}>
                  <TouchableOpacity onPress={() => toggleOnly('cur', curOpen)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={tn.curTap}>{currency}</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={tn.amountInput}
                    value={expenseDraft.amount}
                    onChangeText={v => setExpenseDraft(prev => ({ ...prev, amount: clampAmountExpr(v) }))}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    inputAccessoryViewID={NUM_PAD_ID}
                    placeholderTextColor={C.border}
                  />
                  {/* 运算符按钮放在行里,不放键盘配件栏:decimal-pad 两个平台都没有
                      * 和 +,而 InputAccessoryView 只有 iOS 有 —— 放那儿等于 Android 用不了。 */}
                  {!!expenseDraft.amount && !/[+*]$/.test(expenseDraft.amount) && (
                    <>
                      <TouchableOpacity
                        style={tn.exprOp}
                        onPress={() => setExpenseDraft(prev => ({ ...prev, amount: prev.amount + '*' }))}
                      >
                        <Text style={tn.exprOpTxt}>×</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={tn.exprOp}
                        onPress={() => setExpenseDraft(prev => ({ ...prev, amount: prev.amount + '+' }))}
                      >
                        <Text style={tn.exprOpTxt}>+</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {/* 写了算式就把结果摆出来。不显示的话用户没法确认「90*2」有没有被理解 ——
                      而这正是它以前静默算错(902)时最要命的地方:看不出来。 */}
                  {isAmountExpr(expenseDraft.amount) && money(expenseDraft.amount) > 0 && (
                    <Text style={tn.exprHint}>= {fmtMoney(money(expenseDraft.amount))}</Text>
                  )}
                </View>
                {curOpen && renderCurTray({
                  active: currency,
                  // 每笔账各记各的币种,切换只影响接下来记的这笔,不动旧账。
                  // pickCurrency 会把选择记进账本 —— 下一笔默认还是它,
                  // 不用在土耳其连着记三十多笔时每笔都手动切一遍。
                  onPick: (cur) => { setCurOpen(false); pickCurrency(cur); },
                })}

                <Text style={tn.fieldK}>谁垫的</Text>
                <View style={tn.ownerRow}>
                  {ledgerPeople.map(person => (
                    <TouchableOpacity
                      key={person}
                      style={[tn.ownerChip, expenseDraft.payer === person && tn.ownerChipAct]}
                      onPress={() => setExpenseDraft(prev => ({
                        ...prev,
                        payer: person,
                        payerTouched: true,   // 手动选过就别再被「默认是我」覆盖
                        participants: prev.participants?.includes(person)
                          ? prev.participants
                          : [...(prev.participants || []), person],
                      }))}
                    >
                      <Text style={[tn.ownerTxt, expenseDraft.payer === person && tn.ownerTxtAct]}>{person}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 不展开也知道这笔怎么分 */}
                <View style={tn.splitLine}>
                  <Text style={tn.splitLineTxt}>{splitSummary}</Text>
                  <TouchableOpacity onPress={() => toggleOnly('adv', ledgerAdvanced)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={tn.splitLineLink}>{ledgerAdvanced ? '收起' : '调整'}</Text>
                  </TouchableOpacity>
                </View>

                {ledgerAdvanced && (
                  <View style={tn.advBox}>
                    {/* 分类和备注排在分法前面:这两个是「这笔是什么」,
                        分法是「这笔怎么算」。人在小票旁边先想得起来的是前者,
                        而且分法那几块(各自付、单独付)会展开成一整片输入框,
                        排在它们后面等于把最轻的两项推到最底下。 */}
                    <Text style={tn.fieldK}>分类</Text>
                    <View style={tn.quickTags}>
                      {expenseCategories.map(cat => (
                        <TouchableOpacity
                          key={cat}
                          style={[tn.catChip, expenseDraft.category === cat && tn.catChipAct]}
                          onPress={() => setExpenseDraft(prev => ({ ...prev, category: cat, title: '' }))}
                        >
                          <Text style={[tn.catTxt, expenseDraft.category === cat && tn.catTxtAct]}>{cat}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={tn.fieldK}>备注</Text>
                    <TextInput
                      style={tn.noteInput}
                      value={expenseDraft.note}
                      onChangeText={note => setExpenseDraft(prev => ({ ...prev, note }))}
                      placeholder="可不填"
                      placeholderTextColor={C.mutedLight}
                    />

                    <Text style={tn.fieldK}>怎么分</Text>
                    <View style={tn.modeRow}>
                      {splitModes.map(mode => (
                        <TouchableOpacity
                          key={mode}
                          style={[tn.modeBtn, expenseDraft.mode === mode && tn.modeBtnAct]}
                          onPress={() => setExpenseDraft(prev => ({ ...prev, mode, special: mode === '特殊项' }))}
                        >
                          <Text style={[tn.modeTxt, expenseDraft.mode === mode && tn.modeTxtAct]}>{MODE_LABEL[mode] || mode}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={tn.fieldK}>
                      {expenseDraft.mode === '各自价格' ? '这笔消费包含谁' : expenseDraft.mode === '特殊项' ? '基础分摊成员' : '谁参与均分'}
                    </Text>
                    <View style={tn.ownerRow}>
                      {ledgerPeople.map(person => (
                        <TouchableOpacity
                          key={person}
                          style={[tn.ownerChip, expenseDraft.participants?.includes(person) && tn.ownerChipAct]}
                          onPress={() => toggleParticipant(person)}
                        >
                          <Text style={[tn.ownerTxt, expenseDraft.participants?.includes(person) && tn.ownerTxtAct]}>{person}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {expenseDraft.mode === '各自价格' && (
                      <View style={tn.splitBox}>
                        <Text style={tn.fieldK}>每人实际消费多少</Text>
                        {(expenseDraft.participants || []).filter(p => ledgerPeople.includes(p)).map(person => (
                          <View key={person} style={tn.personShareRow}>
                            <Text style={tn.personShareName}>{person}</Text>
                            <TextInput
                              style={[tn.ledgerInput, { flex: 1, marginBottom: 0 }]}
                              value={expenseDraft.personShares?.[person] || ''}
                              onChangeText={v => setExpenseDraft(prev => ({
                                ...prev,
                                personShares: { ...prev.personShares, [person]: clampMoney(v) },
                              }))}
                              placeholder={`${currency}0.00`}
                              keyboardType="decimal-pad"
                              inputAccessoryViewID={NUM_PAD_ID}
                              placeholderTextColor={C.mutedLight}
                            />
                          </View>
                        ))}
                        {draftTotal > 0 && (
                          <View style={tn.balanceRow}>
                            <Text style={[tn.balanceTxt, !isBalanced && tn.balanceTxtWarn]}>
                              {isBalanced
                                ? `已分配 ${fmtMoney(perPersonAssigned)},账已平`
                                : assignGap > 0
                                  ? `已分配 ${fmtMoney(perPersonAssigned)} / ${fmtMoney(draftTotal)},还差 ${fmtMoney(assignGap)}`
                                  : `超出总额 ${fmtMoney(assignGap)},请调整`}
                            </Text>
                            {!isBalanced && assignGap > 0 && (
                              <TouchableOpacity
                                onPress={() => {
                                  const ps = expenseDraft.personShares || {};
                                  const chosen = (expenseDraft.participants || []).filter(p => ledgerPeople.includes(p));
                                  const blanks = chosen.filter(p => !money(ps[p]));
                                  const targets = blanks.length ? blanks : [expenseDraft.payer].filter(p => chosen.includes(p));
                                  if (!targets.length) return;
                                  const add = splitEven(assignGap, targets);
                                  setExpenseDraft(prev => ({
                                    ...prev,
                                    personShares: {
                                      ...prev.personShares,
                                      ...Object.fromEntries(targets.map(p => [
                                        p, String(Math.round(((money(ps[p]) || 0) + (add[p] || 0)) * 100) / 100),
                                      ])),
                                    },
                                  }));
                                }}
                              >
                                <Text style={tn.balanceFix}>剩余均分</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}
                      </View>
                    )}

                    {expenseDraft.mode === '特殊项' && (
                      <View style={tn.splitBox}>
                        <Text style={tn.fieldK}>谁单独付了一项</Text>
                        <View style={tn.ownerRow}>
                          {ledgerPeople.map(person => (
                            <TouchableOpacity
                              key={person}
                              style={[tn.ownerChip, expenseDraft.specialOwner === person && tn.ownerChipAct]}
                              onPress={() => setExpenseDraft(prev => ({ ...prev, specialOwner: person, special: true }))}
                            >
                              <Text style={[tn.ownerTxt, expenseDraft.specialOwner === person && tn.ownerTxtAct]}>{person}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <View style={tn.ledgerInputRow}>
                          <TextInput
                            style={[tn.ledgerInput, { flex: 1 }]}
                            value={expenseDraft.specialLabel}
                            onChangeText={specialLabel => setExpenseDraft(prev => ({ ...prev, specialLabel }))}
                            placeholder="物品"
                            placeholderTextColor={C.mutedLight}
                          />
                          <TextInput
                            style={[tn.ledgerInput, { flex: 1 }]}
                            value={expenseDraft.specialAmount}
                            onChangeText={v => setExpenseDraft(prev => ({ ...prev, specialAmount: clampMoney(v), special: true }))}
                            placeholder="金额"
                            keyboardType="decimal-pad"
                            inputAccessoryViewID={NUM_PAD_ID}
                            placeholderTextColor={C.mutedLight}
                          />
                        </View>
                      </View>
                    )}

                  </View>
                )}

                {/* 按钮变灰必须给出理由,尤其原因藏在收起的「调整」里时 */}
                {!canSave && draftTotal > 0 && !isBalanced && (
                  <TouchableOpacity style={tn.whyOff} onPress={() => openOnly('adv')}>
                    <Text style={tn.whyOffTxt}>
                      {specialOver
                        ? `单独付的一项比总额还多 ${fmtMoney(specialGap)} · 去调整`
                        : assignGap > 0
                          ? `还差 ${fmtMoney(assignGap)} 没分到人 · 去调整`
                          : `超出总额 ${fmtMoney(assignGap)} · 去调整`}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[tn.addExpenseBtn, !canSave && tn.addExpenseBtnOff]}
                  onPress={saveExpense}
                  disabled={!canSave}
                >
                  <Text style={tn.addExpenseTxt}>{expenseEditId ? '保存修改' : '记一笔'}</Text>
                </TouchableOpacity>
                <View style={tn.underActions}>
                  <TouchableOpacity onPress={() => setFxOpenLedger(true)}>
                    <Text style={tn.quietLink}>汇率</Text>
                  </TouchableOpacity>
                  {expenseEditId && (
                    <TouchableOpacity onPress={resetExpenseDraft}>
                      <Text style={tn.quietLink}>取消修改</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              )}

              {/* ── 同行者 / 共享账本:一趟旅行只设一次,默认收起 ── */}
              {!settleOpen && (<>
              <TouchableOpacity style={tn.setupRow} activeOpacity={0.8} onPress={() => toggleOnly('setup', ledgerSetupOpen)}>
                <View style={{ flex: 1 }}>
                  <Text style={tn.setupTxt}>{isShared ? `共享账本 · 邀请码 ${ledgerCode}` : '同行者'}</Text>
                  <Text style={tn.setupMeta}>{ledgerPeople.join('、') || '还没有成员'}</Text>
                </View>
                <Text style={tn.setupChevron}>{ledgerSetupOpen ? '−' : '+'}</Text>
              </TouchableOpacity>
              {ledgerSetupOpen && (
                <View style={tn.setupPanel}>
                  <View style={tn.inviteRow}>
                    <TextInput
                      style={[tn.joinInput, { textAlign: 'left' }]}
                      value={newMemberName}
                      onChangeText={setNewMemberName}
                      placeholder="加一个同行者名字"
                      placeholderTextColor={C.mutedLight}
                    />
                    <TouchableOpacity style={tn.inviteBtn} onPress={addMember}>
                      <Text style={tn.inviteTxt}>加成员</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={tn.joinRow}>
                    {members.map(member => {
                      const name = member.name || member.display_name;
                      // 除了自己,谁都能删(身上有账的会在 removeMember 里被拦下来)。
                      // 自己不给 —— 那是你在这本账里的名字,删了这本账就跟你没关系了。
                      const canRemove = name !== myLedgerName && ledgerPeople.length > 1;
                      return (
                        <View key={name} style={[tn.memberChip, member.joined && tn.memberChipOn]}>
                          <Text style={[tn.memberChipTxt, member.joined && tn.memberChipTxtOn]}>
                            {name}{member.tagOnly ? ' · 待加入' : ''}
                          </Text>
                          {canRemove && (
                            <TouchableOpacity
                              onPress={() => removeMember(name)}
                              hitSlop={{ top: 10, bottom: 10, left: 8, right: 10 }}
                            >
                              <Text style={tn.memberChipX}>×</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                  </View>
                  <View style={tn.setupDivider} />
                  {isShared ? (
                    <View>
                      <TouchableOpacity style={tn.inviteBtnWide} onPress={inviteLedger}>
                        <Text style={tn.inviteTxt}>把邀请码发给同行者</Text>
                      </TouchableOpacity>
                      <View style={tn.inviteRow}>
                        <TextInput
                          style={tn.joinInput}
                          value={joinCode}
                          onChangeText={setJoinCode}
                          placeholder="加入另一个账本"
                          autoCapitalize="characters"
                          placeholderTextColor={C.mutedLight}
                        />
                        <TouchableOpacity style={[tn.inviteBtn, ledgerBusy && tn.inviteBtnOff]} disabled={ledgerBusy} onPress={joinLedgerRemote}>
                          <Text style={tn.inviteTxt}>{ledgerBusy ? '处理中' : '加入'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View>
                      <View style={tn.inviteRow}>
                        <TextInput
                          style={[tn.joinInput, { textAlign: 'left' }]}
                          value={myName}
                          onChangeText={setMyName}
                          placeholder="你的名字(账本里显示)"
                          placeholderTextColor={C.mutedLight}
                        />
                        <TouchableOpacity style={[tn.inviteBtn, ledgerBusy && tn.inviteBtnOff]} disabled={ledgerBusy} onPress={createSharedLedger}>
                          <Text style={tn.inviteTxt}>{ledgerBusy ? '处理中' : '开共享'}</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={tn.inviteRow}>
                        <TextInput
                          style={tn.joinInput}
                          value={joinCode}
                          onChangeText={setJoinCode}
                          placeholder="或输入同行者的邀请码"
                          autoCapitalize="characters"
                          placeholderTextColor={C.mutedLight}
                        />
                        <TouchableOpacity style={[tn.inviteBtn, ledgerBusy && tn.inviteBtnOff]} disabled={ledgerBusy} onPress={joinLedgerRemote}>
                          <Text style={tn.inviteTxt}>{ledgerBusy ? '处理中' : '加入'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* ── 账目 ── */}
              {expenses.length > 0 && (
                <View style={tn.listHead}>
                  <Text style={tn.listHeadTxt}>账目 {activeExpenses.length} 笔</Text>
                  {specialCount > 0 && <Text style={tn.ledgerBadge}>{specialCount} 笔单独付</Text>}
                </View>
              )}
              {/* 未结清的照常列;已结清的收进下面的折叠区 ——
                  账目会越攒越长,但结清过的只在想回头看时才需要。
                  只是收起来,不是删掉:除非用户自己点「删」,账目永远留着。

                  ── 按币种分组 ──
                  币种在卡片上只是一个符号,「¥4500」和「₺4500」长得几乎一样。
                  41 笔混在一起滑六屏,一张记错币种的门票根本看不出来。
                  分组之后:里拉 19 笔、人民币 15 笔、欧元 5 笔、英镑 2 笔、美金 1 笔 ——
                  **只有一两笔的那组天然可疑**,要么真是特例,要么就是选错了币种。
                  这比按金额数量级做预警更简单,也更准。 */}
              {expenseGroups.map(g => (
                <View key={g.cur}>
                  {multiCurrencyList && (
                    <View style={tn.grpHead}>
                      <Text style={tn.grpCur}>{g.cur}</Text>
                      <Text style={tn.grpCount}>{g.items.length} 笔</Text>
                      <View style={{ flex: 1 }} />
                      <Text style={tn.grpTotal}>合计 {fmtIn(g.total, g.cur)}</Text>
                    </View>
                  )}
                  {multiCurrencyList && g.items.length <= 2 && (
                    <Text style={tn.grpOdd}>
                      这个币种只有 {g.items.length} 笔 —— 确认一下不是记账时选错了币种。
                    </Text>
                  )}
                  {g.items.map(renderExpense)}
                </View>
              ))}

              {/* 已结清的收进折叠区。账目会越攒越长,而结清过的只在想回头看时才需要。
                  注意:只是收起来,不是删掉 —— 除非用户自己点「删」,账目永远留着。 */}
              {settledCount > 0 && (
                <TouchableOpacity style={tn.historyRow} activeOpacity={0.7} onPress={() => setHistoryOpen(v => !v)}>
                  <Text style={tn.historyTxt}>已结清 {settledCount} 笔</Text>
                  <Text style={tn.historyChev}>{historyOpen ? "−" : "+"}</Text>
                </TouchableOpacity>
              )}
              {historyOpen && expenses.filter(item => item.settledAt).map(renderExpense)}
              </>)}
            </ScrollView>

            {/* 数字键盘的「完成」条。iOS 的 decimal-pad 没有回车键,
                不给一个出口的话输入完金额就卡在键盘里出不来。 */}
            {Platform.OS === 'ios' && (
              <InputAccessoryView nativeID={NUM_PAD_ID}>
                <View style={tn.numPadBar}>
                  <TouchableOpacity onPress={() => Keyboard.dismiss()} hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}>
                    <Text style={tn.numPadDone}>完成</Text>
                  </TouchableOpacity>
                </View>
              </InputAccessoryView>
            )}

            {/* 分账里的汇率:结算前想换算一下的时候 */}
            {fxOpenLedger && (
              <View style={tn.scenesOverlay}>
                <View style={tn.head}>
                  <View>
                    <Text style={tn.title}>汇率</Text>
                    <Text style={tn.sub}>参考价</Text>
                  </View>
                  <TouchableOpacity onPress={() => setFxOpenLedger(false)}>
                    <Text style={tn.close}>×</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={tn.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <FxPanel initialFrom={FX_CODES[currency] || 'EUR'} initialTo="CNY" />
                  <View style={{ height: 24 }} />
                </ScrollView>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </>
  );
}

// 英文用衬线,让「要说的那句话」读起来像内容,不像 UI(demo 的做法)
const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });

// 单行 TextInput 的垂直居中配方。
//
// 只要给了固定 height,就必须摊上这三条,否则文字会贴在框底、上半截空着。
// 成因:iOS 的 TextInput 自带一份垂直内边距,固定高度下它把文字往下推,
// 而组件没有机会再居中;Android 则默认顶着上边,还额外带一圈字体内边距。
// 三条各管一件事 —— paddingVertical 归零(iOS 靠固定高度自己居中)、
// textAlignVertical 和 includeFontPadding 管 Android。
//
// **另外:单行输入框绝对不要设 lineHeight。** iOS 上一旦设了,
// 文字就按行高盒子的底部对齐,字照样沉底 —— 这是最容易「修了反而更歪」的一步。
//
// 抽出来一处定义,是因为这个毛病在本文件已经犯过三次(备注、预算、邀请码那几个),
// 每次都是单独修一处。新加单行输入框直接 ...SINGLE_LINE_INPUT。
// 没有固定 height、靠 paddingVertical 撑开的输入框不需要这个(那种本来就正常),
// 多行输入框更不要 —— 它们用 textAlignVertical: 'top'。
const SINGLE_LINE_INPUT = {
  paddingVertical: 0,
  textAlignVertical: 'center',
  includeFontPadding: false,
};

const tn = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    bottom: Platform.OS === 'ios' ? 96 : 84,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1a1a2e',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    zIndex: 20,
  },
  fabIcon: { fontSize: 23 },
  ledgerFab: {
    position: 'absolute',
    right: 18,
    bottom: Platform.OS === 'ios' ? 158 : 146,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1a1a2e',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
    zIndex: 21,
  },
  ledgerFabIcon: { fontSize: 21 },
  ledgerFabHint: {
    position: 'absolute',
    right: -4,
    top: -4,
    minWidth: 17,
    height: 17,
    borderRadius: 8.5,
    overflow: 'hidden',
    backgroundColor: C.teal,
    color: C.white,
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 17,
  },
  fabDot: {
    position: 'absolute',
    right: 11,
    top: 11,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: C.teal,
    borderWidth: 1.5,
    borderColor: C.white,
  },
  modalLayer: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(14,14,18,0.22)' },
  sheet: {
    margin: 12,
    maxHeight: '86%',
    backgroundColor: '#fbfaf7',
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  ledgerSheet: { maxHeight: '78%' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  mark: { fontSize: 25, fontWeight: '300', color: C.ink, letterSpacing: 3 },
  title: { fontSize: 16, fontWeight: '700', color: C.ink },
  sub: { fontSize: 11, color: C.muted, marginTop: 2 },
  close: { fontSize: 26, color: C.muted, lineHeight: 28 },
  body: { padding: 14 },
  bookRail: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  bookChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  bookChipAct: { backgroundColor: C.ink, borderColor: C.ink },
  bookChipTitle: { fontSize: 11.5, color: C.ink, fontWeight: '700' },
  bookChipTitleAct: { color: C.white },
  bookChipSub: { fontSize: 10, color: C.muted, marginTop: 2 },
  bookChipSubAct: { color: 'rgba(255,255,255,0.62)' },
  bookHead: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 10, paddingHorizontal: 2 },
  bookK: { fontSize: 10, color: C.teal, fontWeight: '800', letterSpacing: 1.5 },
  bookTitle: { fontSize: 21, color: C.ink, fontWeight: '800', marginTop: 3 },
  bookSub: { fontSize: 11.5, color: C.muted, marginTop: 3 },
  topTool: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  topToolTxt: { fontSize: 13, color: C.teal, fontWeight: '800' },
  now: { backgroundColor: C.white, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 10, shadowColor: '#1a1a2e', shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  kicker: { fontSize: 10, fontWeight: '800', color: C.teal, letterSpacing: 1.4, marginBottom: 6 },
  nowTitle: { fontSize: 20, fontWeight: '700', color: C.ink, marginBottom: 5 },
  nowText: { fontSize: 12, color: C.muted, lineHeight: 19 },
  route: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 },
  place: { flex: 1, borderRadius: 14, padding: 10, backgroundColor: C.paper, borderWidth: 1, borderColor: C.border },
  placeK: { fontSize: 9, color: C.mutedLight, fontWeight: '800', letterSpacing: 1 },
  placeT: { fontSize: 12, color: C.ink, fontWeight: '600', marginTop: 2 },
  arrow: { fontSize: 16, color: C.mutedLight, fontWeight: '700' },
  timeHint: { fontSize: 11, color: C.muted, marginTop: 9 },
  phrase: { marginTop: 12, borderRadius: 15, backgroundColor: C.tealLight, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center' },
  phraseEn: { fontFamily: SERIF, fontSize: 16.5, color: C.ink, lineHeight: 23 },
  phraseCn: { fontSize: 11.5, color: C.muted, marginTop: 4 },
  toolsCard: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 12 },
  uploadTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  uploadWarn: { fontSize: 11, color: C.lava, marginTop: 6, lineHeight: 16 },
  uploadSub: { fontSize: 11, color: C.muted, lineHeight: 17, marginTop: 3 },
  thumbRow: { marginTop: 10 },
  thumb: { width: 56, height: 56, borderRadius: 9, marginRight: 8, backgroundColor: C.tag, borderWidth: 1, borderColor: C.border },
  fromUpload: { fontSize: 12, color: C.muted, fontWeight: '700' },
  uploadActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  recognizeBtn: { backgroundColor: C.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  recognizeBtnOff: { backgroundColor: C.mutedLight },
  aiNote: { fontSize: 10.5, color: C.mutedLight, marginTop: 6, textAlign: 'center' },
  recognizeTxt: { color: C.white, fontSize: 12.5, fontWeight: '800' },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  toolBtn: { width: '48%', backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 13, paddingVertical: 10, alignItems: 'center' },
  toolBtnTxt: { color: C.teal, fontSize: 12, fontWeight: '800' },
  ledgerCard: { marginTop: 12, backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },

  // 我花了 + 预算:和记一笔用同一套语言(衬线数字 + teal eyebrow)
  meBox: { paddingBottom: 2 },
  meRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingHorizontal: 4, paddingBottom: 8 },
  meRowK: { fontSize: 11, color: C.muted },
  meAmounts: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 },
  meRowNum: { fontFamily: SERIF, fontSize: 17, color: C.ink },
  meChevron: { fontSize: 15, color: C.mutedLight, fontWeight: '700' },
  // 「一共花了多少」:折算出来的参考值,加在原货币那排下面,不替换它
  meTotalRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 4, paddingBottom: 9,
  },
  meTotalNum: { fontFamily: SERIF, fontSize: 15, color: C.ink },
  meTotalMeta: { fontSize: 10, color: C.mutedLight, marginTop: 2 },
  meTotalHint: { fontSize: 11, color: C.muted },
  // 空账本:也要有一条能摸到预算的路
  meEmpty: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 4, paddingBottom: 10,
  },
  meEmptyTxt: { flex: 1, fontSize: 11, color: C.mutedLight },
  meEmptyLink: { fontSize: 11.5, color: C.teal, fontWeight: '700' },

  // 个人支出明细表:这一趟我自己花了多少、花在哪
  spendPanel: {
    borderWidth: 1, borderColor: C.border, borderRadius: 13,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, marginBottom: 10,
  },
  spendHead: {
    flexDirection: 'row', alignItems: 'baseline', gap: 8,
    paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  spendHeadK: { fontSize: 10.5, color: C.mutedLight, fontWeight: '700', letterSpacing: 0.4 },
  spendHeadNum: { fontFamily: SERIF, fontSize: 16, color: C.ink },
  spendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  spendDay: { width: 30, fontSize: 10, color: C.mutedLight, fontWeight: '700' },
  spendName: { fontSize: 12.5, color: C.ink },
  spendCat: { fontSize: 10, color: C.mutedLight, marginTop: 2 },
  spendNums: { alignItems: 'flex-end' },
  spendMine: { fontFamily: SERIF, fontSize: 14, color: C.ink },
  spendTotal: { fontSize: 9.5, color: C.mutedLight, marginTop: 2 },
  spendBudget: { paddingVertical: 11, alignItems: 'center' },
  spendBudgetTxt: { fontSize: 11.5, color: C.teal, fontWeight: '700' },
  spendBudgetMeta: { fontSize: 10, color: C.mutedLight, marginTop: 3 },
  meBarTrack: { height: 2, backgroundColor: C.tag, marginHorizontal: 4, marginBottom: 10, overflow: 'hidden' },
  meBarFill: { height: 2, backgroundColor: C.teal },
  meBarOver: { backgroundColor: C.lava },
  meEditRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 },
  meEditLabel: { fontSize: 12, color: C.muted, fontWeight: '600' },
  // 预算的币种:点开是和记账那个同款的货币托盘。
  // 衬线,和金额那些数字是同一套语言;纯符号,不和中文混排(混排会拉低基线)。
  meEditCur: { fontFamily: SERIF, fontSize: 15, color: C.ink },
  meInput: {
    ...SINGLE_LINE_INPUT,
    flex: 1, height: 34, backgroundColor: C.paper, borderRadius: 999,
    paddingHorizontal: 12, fontSize: 12.5, color: C.ink,
  },

  // ── 分账 v2:金额是内容(衬线大字),其余一律安静 ──
  // 结算明细面板(替掉系统 Alert)
  settlePanel: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 4, marginTop: 8,
  },
  // 转账方案:这是要照着做的事,给它重量
  payRow: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    gap: 12, paddingTop: 12, paddingBottom: 2,
  },
  payPair: { fontSize: 14, color: C.muted, fontWeight: '700' },
  payPairMine: { color: C.ink },   // 和自己有关的那笔,墨色;别人之间的转账压低
  payAmt: { fontFamily: SERIF, fontSize: 17, color: C.ink },
  payNone: { fontSize: 12, color: C.muted, paddingTop: 12, paddingBottom: 2 },
  payRule: { height: 1, backgroundColor: C.border, marginTop: 12 },
  mergeRow: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    gap: 10, paddingTop: 13, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  mergeTxt: { fontSize: 12.5, color: C.teal, fontWeight: '700' },
  mergeCaret: { fontSize: 9, color: C.mutedLight, fontWeight: '700' },
  mergeMeta: { fontSize: 10.5, color: C.mutedLight },
  // 折算用的那几条汇率 + 近十天走势,和小本子的汇率浮层同一套说法
  fxTrendBox: { paddingTop: 10, paddingBottom: 2 },
  fxTrendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 5 },
  fxTrendMain: { fontSize: 12, color: C.ink, fontWeight: '700' },
  fxTrendMeta: { fontSize: 10, color: C.muted, marginTop: 2 },
  fxTrendDay: { fontSize: 10, color: C.mutedLight, fontWeight: '400' },
  fxTrendFoot: { fontSize: 10, color: C.mutedLight, marginTop: 6 },

  // 结算的「过程」:每个币种摊开垫付/应担/合计,默认展开。
  // 结论只能验对错,过程才能定位错在哪。
  procBox: { paddingTop: 12 },
  procHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingBottom: 6 },
  procHeadCur: { fontFamily: SERIF, fontSize: 15, color: C.ink },
  procHeadMeta: { fontSize: 10.5, color: C.mutedLight },
  procHeadTotal: { fontSize: 11.5, color: C.muted, fontWeight: '700' },
  procRow: {
    flexDirection: 'row', alignItems: 'baseline', gap: 10,
    paddingVertical: 5, borderTopWidth: 1, borderTopColor: C.border,
  },
  procName: { width: 62, fontSize: 12, color: C.ink, fontWeight: '700' },
  procNum: { flex: 1, fontSize: 11.5, color: C.muted },

  // 账目列表的币种分组头
  grpHead: {
    flexDirection: 'row', alignItems: 'baseline', gap: 8,
    marginTop: 14, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  grpCur: { fontFamily: SERIF, fontSize: 16, color: C.ink },
  grpCount: { fontSize: 10.5, color: C.mutedLight, fontWeight: '700' },
  grpTotal: { fontSize: 11.5, color: C.muted, fontWeight: '700' },
  grpOdd: { fontSize: 10.5, color: C.lava, lineHeight: 15, marginTop: 6 },

  // 账本切换条
  bookBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 18, marginBottom: 4,
    backgroundColor: C.paper, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 9,
  },
  bookBarName: { fontSize: 13, color: C.ink, fontWeight: '800' },
  bookBarMeta: { fontSize: 10.5, color: C.muted, marginTop: 2 },
  bookBarChev: { fontSize: 14, color: C.mutedLight, fontWeight: '700' },
  bookList: {
    marginHorizontal: 18, marginBottom: 6,
    borderWidth: 1, borderColor: C.border, borderRadius: 13, paddingHorizontal: 12, paddingBottom: 10,
  },
  bookRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  bookRowName: { fontSize: 12.5, color: C.muted, fontWeight: '700' },
  bookRowNameOn: { color: C.ink },
  bookRowMeta: { fontSize: 10, color: C.mutedLight, marginTop: 2 },
  bookRowOp: { fontSize: 11, color: C.teal, fontWeight: '700' },
  bookRowDel: { color: C.lava },
  bookAdd: { paddingTop: 11, alignItems: 'center' },
  bookAddTxt: { fontSize: 11.5, color: C.teal, fontWeight: '800' },
  // 跨币种时才出现的分段标题
  curDivider: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 14, paddingBottom: 2 },
  curDividerTxt: { fontFamily: SERIF, fontSize: 15, color: C.ink },
  curDividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  settleClear: { paddingVertical: 13, alignItems: 'center' },
  settleClearTxt: { fontSize: 12, color: C.muted, fontWeight: '600' },
  settleClearTxtOff: { color: C.mutedLight },

  // 金额:整个分账里唯一的大字,用衬线,和小本子的标题同一套语言
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 },
  exprHint: { fontSize: 13, color: C.muted, fontWeight: '600' },
  exprOp: {
    width: 30, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border, backgroundColor: C.white,
  },
  exprOpTxt: { fontSize: 15, color: C.muted, fontWeight: '700' },
  curTap: { fontFamily: SERIF, fontSize: 22, color: C.muted, lineHeight: 44 },
  amountInput: {
    flex: 1, fontFamily: SERIF, fontSize: 38, color: C.ink,
    // 显式给高度和行高:只靠 alignItems:'baseline' 时,大字号下 iOS 的
    // placeholder 和真实文字不在同一条基线上,空着的时候 0.00 看起来是浮的。
    //
    // ⚠️ 这里是 SINGLE_LINE_INPUT 之外的**唯一例外**,别顺手统一掉:
    // 它带着 lineHeight(那是别处要避免的),但 38px 衬线大字配 48 的固定高度,
    // 这一组值是在真机上调出来、并且已经验过的。padding 三条已经归零,
    // 真正的差异只有 lineHeight —— 去掉它反而会让大字重新浮起来。
    height: 48, lineHeight: 44, padding: 0, paddingTop: 0, paddingBottom: 0,
    textAlignVertical: 'center',
  },
  curTray: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 4 },

  // 字段标题:teal 小字,和小本子的 eyebrow 同款
  fieldK: { fontSize: 10, color: C.teal, fontWeight: '800', letterSpacing: 0.6, marginTop: 14, marginBottom: 8 },

  // 分法摘要:一行说清,不展开也懂
  splitLine: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border,
  },
  splitLineTxt: { flex: 1, fontSize: 12, color: C.ink },
  splitLineLink: { fontSize: 12, color: C.teal, fontWeight: '700' },
  advBox: { marginTop: 2 },

  noteInput: {
    ...SINGLE_LINE_INPUT,
    height: 40, backgroundColor: C.paper, borderRadius: 12,
    paddingHorizontal: 12, fontSize: 12.5, color: C.ink,
  },
  whyOff: { marginTop: 16, marginBottom: -12, alignItems: 'center' },
  whyOffTxt: { fontSize: 11.5, color: C.lava },
  underActions: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 12 },
  quietLink: { fontSize: 11.5, color: C.muted },

  // 共享账本:低频,收成一行
  setupRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
  },
  setupTxt: { fontSize: 12.5, color: C.ink, fontWeight: '700' },
  setupMeta: { fontSize: 11, color: C.muted, marginTop: 3 },
  setupChevron: { fontSize: 17, color: C.mutedLight },
  setupPanel: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
    borderTopWidth: 0, borderRadius: 14, borderTopLeftRadius: 0, borderTopRightRadius: 0,
    paddingHorizontal: 14, paddingBottom: 14, marginTop: -10,
  },
  setupDivider: { height: 1, backgroundColor: C.border, marginTop: 14 },
  inviteBtnWide: {
    backgroundColor: C.paper, borderWidth: 1, borderColor: C.border,
    borderRadius: 999, paddingVertical: 10, alignItems: 'center', marginTop: 12,
  },

  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 2 },
  listHeadTxt: { fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 0.5 },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 12, paddingVertical: 11, paddingHorizontal: 12,
    borderWidth: 1, borderColor: C.border, borderRadius: 13,
  },
  mergePick: { fontSize: 12, color: C.teal, fontWeight: '700', paddingLeft: 12 },
  mergePickOn: { color: C.muted },   // 折算态下它是「退出」,不该看起来像主动作
  numPadBar: {
    backgroundColor: '#f6f6f6', borderTopWidth: 1, borderTopColor: C.border,
    paddingVertical: 9, paddingHorizontal: 18, alignItems: 'flex-end',
  },
  numPadDone: { fontSize: 15, color: C.teal, fontWeight: '600' },
  historyTxt: { fontSize: 11.5, color: C.muted },
  historyChev: { fontSize: 15, color: C.mutedLight },
  expenseRowSettled: { opacity: 0.55 },
  settledPill: {
    fontSize: 10, color: C.teal, backgroundColor: C.tealLight, borderRadius: 999,
    paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden', fontWeight: '800',
  },
  ledgerBadge: { fontSize: 10, color: C.muted, backgroundColor: C.tag, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden', fontWeight: '700' },
  joinRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  // 成员 chip 从纯 Text 换成 View:里面要放一个「×」,Text 里塞不下可点区域
  memberChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.tealLight, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4,
  },
  memberChipOn: { backgroundColor: C.teal },
  memberChipTxt: { fontSize: 10, color: C.teal, fontWeight: '800' },
  memberChipTxtOn: { color: C.white },
  memberChipX: { fontSize: 13, lineHeight: 15, color: C.muted, fontWeight: '700' },
  curChip: { minWidth: 34, alignItems: 'center', backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  curChipAct: { backgroundColor: C.ink, borderColor: C.ink },
  curTxt: { fontSize: 13, color: C.muted, fontWeight: '800' },
  curTxtAct: { color: C.white },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 },
  inviteBtn: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 },
  inviteBtnOff: { opacity: 0.6 },
  inviteTxt: { fontSize: 11, color: C.teal, fontWeight: '900' },
  joinInput: {
    ...SINGLE_LINE_INPUT,
    flex: 1, height: 34, backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 999, paddingHorizontal: 11, fontSize: 11.5, color: C.ink, fontWeight: '800',
  },
  // 间距一律由上面的 fieldK(marginBottom 8)给,这几行自己不再加 marginTop ——
  // 原来 fieldK 8 + quickTags 11 = 19,而备注输入框离标签只有 8,
  // 同一栏里两组字段的标签和内容对不齐,看着像错了一行。
  quickTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 2 },
  catChip: { borderWidth: 1, borderColor: C.border, backgroundColor: C.white, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  catChipAct: { backgroundColor: C.ink, borderColor: C.ink },
  catTxt: { fontSize: 11, color: C.muted, fontWeight: '800' },
  catTxtAct: { color: C.white },
  modeRow: { flexDirection: 'row', gap: 7 },
  modeBtn: { flex: 1, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, borderRadius: 12, paddingVertical: 9, alignItems: 'center' },
  modeBtnAct: { backgroundColor: C.ink, borderColor: C.ink },
  modeTxt: { fontSize: 11, color: C.muted, fontWeight: '900' },
  modeTxtAct: { color: C.white },
  ledgerInput: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, fontSize: 12, color: C.ink, marginBottom: 7 },
  ledgerInputRow: { flexDirection: 'row', gap: 7 },
  splitBox: { backgroundColor: 'rgba(255,255,255,0.62)', borderWidth: 1, borderColor: C.border, borderRadius: 13, padding: 9, marginBottom: 8 },
  ownerRow: { flexDirection: 'row', gap: 7, marginBottom: 8 },
  ownerChip: { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingVertical: 7, alignItems: 'center' },
  ownerChipAct: { backgroundColor: C.ink, borderColor: C.ink },
  ownerTxt: { fontSize: 11, color: C.muted, fontWeight: '800' },
  ownerTxtAct: { color: C.white },
  addExpenseBtn: {
    flex: 1, backgroundColor: C.ink, borderRadius: 999,
    paddingVertical: 13, alignItems: 'center', marginTop: 18,
  },
  addExpenseBtnOff: { backgroundColor: C.mutedLight },
  personShareRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  personShareName: { width: 56, fontSize: 12, color: C.ink, fontWeight: '700' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  balanceTxt: { fontSize: 11, color: C.teal, fontWeight: '700' },
  balanceTxtWarn: { color: C.lava },
  balanceFix: { fontSize: 11, color: C.blue, fontWeight: '800', padding: 4 },
  addExpenseTxt: { fontSize: 12, color: C.white, fontWeight: '800' },
  settleAction: { backgroundColor: '#20352d', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 11, marginTop: 4, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settleActionK: { fontSize: 9, color: 'rgba(255,255,255,0.58)', fontWeight: '900', letterSpacing: 1.4 },
  settleActionRest: { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 5 },
  expenseTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  expenseDay: { fontSize: 10.5, color: C.mutedLight, fontVariant: ['tabular-nums'] },
  settleActionMain: { fontSize: 15, color: C.white, fontWeight: '900', marginTop: 3 },
  settleActionArrow: { fontSize: 18, color: 'rgba(255,255,255,0.72)', fontWeight: '900' },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 13, borderWidth: 1, borderColor: C.border, padding: 10, marginTop: 7 },
  expenseTitle: { fontSize: 12.5, color: C.ink, fontWeight: '800' },
  expenseMeta: { fontSize: 10.5, color: C.muted, lineHeight: 15, marginTop: 3 },
  expenseOps: { flexDirection: 'row', gap: 12, marginTop: 7 },
  expenseOpTxt: { fontSize: 11, color: C.teal, fontWeight: '900' },
  deleteTxt: { color: '#a85b45' },
  specialPill: { fontSize: 10, color: C.muted, backgroundColor: C.tag, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden', fontWeight: '800' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 2, marginTop: 4, marginBottom: 8 },
  section: { fontSize: 14, fontWeight: '800', color: C.teal, letterSpacing: 1, marginBottom: 8 },
  add: { fontSize: 12, color: C.teal, fontWeight: '700' },
  leg: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, marginBottom: 10, overflow: 'hidden' },
  legOpen: { borderColor: C.teal, borderLeftWidth: 2 },
  legHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 14 },
  date: { width: 42 },
  mon: { fontFamily: SERIF, fontSize: 10, color: C.teal, fontWeight: '700', letterSpacing: 1.5 },
  day: { fontFamily: SERIF, fontSize: 22, color: C.ink, marginTop: 1 },
  legTitle: { fontSize: 15.5, fontWeight: '700', color: C.ink },
  legSub: { fontSize: 11.5, color: C.muted, marginTop: 3, lineHeight: 16 },
  editPill: { borderWidth: 1, borderColor: C.border, backgroundColor: C.white, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  editTxt: { color: C.teal, fontSize: 11, fontWeight: '700' },
  flipPill: { borderWidth: 1, borderColor: C.border, backgroundColor: C.white, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, marginRight: 6 },
  flipPillAct: { backgroundColor: C.teal, borderColor: C.teal },
  flipTxt: { color: C.teal, fontSize: 11, fontWeight: '800' },
  flipTxtAct: { color: C.white },
  toSite: { marginTop: 8, alignItems: 'center', paddingVertical: 9, borderRadius: 12, backgroundColor: C.tealLight },
  toSiteTxt: { fontSize: 12, color: C.teal, fontWeight: '800' },
  sceneTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 2 },
  sceneTab: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: C.paper },
  sceneTabAct: { backgroundColor: C.ink },
  sceneTabTxt: { fontSize: 11.5, color: C.muted, fontWeight: '700' },
  sceneTabTxtAct: { color: C.white },
  stepPath: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  stepTab: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  stepTabAct: { borderColor: C.teal, backgroundColor: C.tealLight },
  stepTabTxt: { fontSize: 11, color: C.muted, fontWeight: '700' },
  stepTabTxtAct: { color: C.teal },
  siteLabel: { fontSize: 10, color: C.mutedLight, fontWeight: '800', letterSpacing: 1, marginTop: 14, marginBottom: 4 },
  siteLook: { fontSize: 12.5, color: C.muted, lineHeight: 19 },
  sitePhrase: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  siteSay: { flex: 1, fontFamily: SERIF, fontSize: 18, color: C.ink, lineHeight: 25 },
  siteSayZh: { fontSize: 12, color: C.muted, marginTop: 4 },
  siteBar: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
  siteBarTxt: { fontSize: 12, color: C.muted, fontWeight: '700' },
  siteSave: { color: C.teal, fontWeight: '800' },
  siteDel: { fontSize: 12, color: C.lava, fontWeight: '700' },
  siteInput: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13, color: C.ink, marginTop: 4 },
  siteArea: { minHeight: 46, textAlignVertical: 'top', lineHeight: 19 },
  scenesOverlay: { position: 'absolute', top: '13%', left: 12, right: 12, bottom: 12, backgroundColor: '#fbfaf7', borderRadius: 26, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  legScenes: { marginTop: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  legScenesTxt: { fontSize: 12, color: C.teal, fontWeight: '700' },
  scenesEntry: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 13, marginBottom: 12 },
  scenesEntryTitle: { fontSize: 14.5, color: C.ink, fontWeight: '700' },
  scenesEntrySub: { fontSize: 11.5, color: C.muted, marginTop: 3 },
  scenesEntryGo: { fontSize: 16, color: C.teal, fontWeight: '700' },
  famTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingTop: 12 },
  famTab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: C.paper },
  famTabAct: { backgroundColor: C.ink },
  famTabTxt: { fontSize: 12, color: C.muted, fontWeight: '700' },
  famTabTxtAct: { color: C.white },
  sceneCard: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 14, marginBottom: 9, overflow: 'hidden' },
  sceneCardOpen: { borderColor: C.teal, borderLeftWidth: 2 },
  sceneCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 13 },
  sceneCardTitle: { fontSize: 14.5, color: C.ink, fontWeight: '700' },
  sceneCardChevron: { fontSize: 15, color: C.mutedLight, fontWeight: '700' },
  sceneCardBody: { paddingHorizontal: 14, paddingBottom: 12 },
  sceneLook: { fontSize: 12, color: C.muted, lineHeight: 18, marginBottom: 8 },
  sceneLine: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 11 },
  sceneWhen: { fontSize: 10, color: C.teal, fontWeight: '800', letterSpacing: 0.5, marginBottom: 3 },
  sceneEn: { fontFamily: SERIF, fontSize: 16.5, color: C.ink, lineHeight: 22 },
  sceneZh: { fontSize: 12, color: C.muted, marginTop: 3 },
  emptyBook: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 17, padding: 16, marginBottom: 8 },
  emptyBtns: { flexDirection: 'row', gap: 8, marginTop: 14 },
  emptyBtnDark: { flex: 1, backgroundColor: C.ink, borderRadius: 999, paddingVertical: 11, alignItems: 'center' },
  emptyBtnDarkTxt: { color: C.white, fontSize: 13, fontWeight: '700' },
  emptyBtn: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingVertical: 11, alignItems: 'center' },
  emptyBtnTxt: { color: C.ink, fontSize: 13, fontWeight: '700' },
  emptySample: { color: C.teal, fontSize: 12, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  emptyTitle: { fontSize: 14, color: C.ink, fontWeight: '800' },
  emptySub: { fontSize: 12, color: C.muted, lineHeight: 18, marginTop: 4 },
  legBody: { paddingHorizontal: 14, paddingBottom: 14, paddingLeft: 64 },
  line: { borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 8, fontSize: 12.5, color: C.ink, lineHeight: 19 },
  miniPhrase: { backgroundColor: C.tealLight, borderRadius: 13, padding: 11, marginTop: 8 },
  miniEn: { fontFamily: SERIF, fontSize: 14.5, color: C.ink, lineHeight: 20 },
  todo: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 12, marginTop: 4, marginBottom: 28 },
  todoTitle: { fontSize: 13, fontWeight: '800', color: C.ink, marginBottom: 4 },
  todoLine: { fontSize: 12, color: C.muted, lineHeight: 22 },
  input: { backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border, borderRadius: 14, padding: 12, fontSize: 14, color: C.ink, marginBottom: 9 },
  area: { minHeight: 98, textAlignVertical: 'top', lineHeight: 20 },
  editRow: { flexDirection: 'row', gap: 9, marginBottom: 12 },
  ghostBtn: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  ghostTxt: { color: C.muted, fontSize: 13, fontWeight: '700' },
  darkBtn: { flex: 1, backgroundColor: C.ink, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  darkTxt: { color: C.white, fontSize: 13, fontWeight: '700' },
  deleteLegBtn: { alignItems: 'center', paddingVertical: 10, marginBottom: 24 },
  deleteLegTxt: { color: C.lava, fontSize: 12, fontWeight: '700' },
});

export default TripNotebook;
