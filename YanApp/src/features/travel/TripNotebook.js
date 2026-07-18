// 言 YAN · 旅行小本子 + 多人分账(从 App.js 抽出)
// 依赖:共享色板 theme、发音组件 Speech、分账同步库 tripLedger。
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Image, Keyboard, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { C } from '../../theme';
import { useSpeech, SpeakBtn } from '../../components/Speech';
import {
  createLedger, joinLedger, addTagMember, myLedgers,
  fetchLedgerData, saveExpenseRemote, deleteExpenseRemote, subscribeLedger,
} from '../../lib/tripLedger';
import { SCENE_PACK } from './scenePack';
import { parseItinerary } from '../../lib/parseItinerary';

const TRIP_STORAGE_KEY = 'yan_trip_notebook_v1';
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
  const [sceneFam, setSceneFam] = useState(SCENE_PACK[0].key);
  const [sceneOpenIdx, setSceneOpenIdx] = useState(0);
  const [editIdx, setEditIdx] = useState(undefined);
  const [draft, setDraft] = useState({ title: '', summary: '', detail: '', phrase: '' });
  const [uploads, setUploads] = useState([]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [expenseEditId, setExpenseEditId] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [ledgerMembers, setLedgerMembers] = useState([
    { name: '我', label: '我', status: '已加入', joined: true },
  ]);
  // ── 多人分账(Supabase 共享账本) ──
  const [ledgerId, setLedgerId] = useState(null);      // null = 仅本机;有值 = 已进共享账本
  const [ledgerCode, setLedgerCode] = useState('');    // 真实邀请码
  const [currency, setCurrency] = useState('€');
  const [remoteMembers, setRemoteMembers] = useState(null); // 远端成员;null 时用本地 ledgerMembers
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [myName, setMyName] = useState('我');
  const [newMemberName, setNewMemberName] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [expenseDraft, setExpenseDraft] = useState({
    category: '晚餐',
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
          if (saved.expenses) setExpenses(saved.expenses);
          if (saved.ledgerMembers) setLedgerMembers(saved.ledgerMembers);
          if (saved.uploads) setUploads(saved.uploads);
        }
      } catch (e) { /* 读档失败就用种子数据，静默 */ }
      hydrated.current = true;
    })();
  }, []);
  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(
      TRIP_STORAGE_KEY,
      JSON.stringify({ books, activeBookId, expenses, ledgerMembers, uploads }),
    ).catch(() => {});
  }, [books, activeBookId, expenses, ledgerMembers, uploads]);

  const activeBook = books.find(book => book.id === activeBookId) || books[0];
  const legs = activeBook.legs || [];

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
  const specialCount = expenses.filter(item => item.special).length;
  // 成员:进了共享账本用远端成员,否则用本地成员
  const members = remoteMembers || ledgerMembers;
  const ledgerPeople = members.map(member => member.name || member.display_name);
  const isShared = !!ledgerId;
  const expenseCategories = ['晚餐', '车票', '购物', '酒店', '门票', '其他'];
  const splitModes = ['均分', '各自价格', '特殊项'];
  const MODE_LABEL = { 均分: '均分', 各自价格: '各自付', 特殊项: '单独付' };
  const CURRENCIES = ['€', '£', '₺', '$', '¥', '₩'];
  const money = (value) => {
    const n = Number.parseFloat(String(value || '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  // 金额输入:只留数字和一个小数点,最多两位小数
  const clampMoney = (v) => {
    let s = String(v).replace(/[^\d.]/g, '');
    const dot = s.indexOf('.');
    if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    return s;
  };
  const stripLook = (t) => String(t || '').replace(/^看\s*/, '');   // 标签已是「看什么」,内容里的「看」冗余
  const famLabelOf = (k) => SCENE_PACK.find(f => f.key === k)?.label || '';
  const openScenes = (fam) => { if (fam) setSceneFam(fam); setSceneOpenIdx(0); setScenesOpen(true); };
  const fmtMoney = (value) => `${currency}${Math.abs(value).toFixed(2)}`;
  const specialAmountFor = (draft) => Math.max(0, Math.min(money(draft.specialAmount), money(draft.amount)));
  // 均分但守恒:前 n-1 人取两位小数,最后一人拿余数(3 人分 €10 → 3.33/3.33/3.34)
  const splitEven = (amount, people) => {
    const result = {};
    if (!people.length) return result;
    const base = Math.floor((amount / people.length) * 100) / 100;
    people.forEach((p, i) => {
      result[p] = i === people.length - 1
        ? Math.round((amount - base * (people.length - 1)) * 100) / 100
        : base;
    });
    return result;
  };
  const buildShares = (draft) => {
    const total = money(draft.amount);
    const emptyShares = ledgerPeople.reduce((acc, person) => ({ ...acc, [person]: 0 }), {});
    // 成员为空(如远端拉取失败)时不做除法,直接返回全 0,避免 Infinity/NaN
    if (!ledgerPeople.length) return emptyShares;
    const chosen = (draft.participants || []).filter(p => ledgerPeople.includes(p));
    const participants = chosen.length ? chosen : ledgerPeople;
    if (draft.mode === '各自价格') {
      const entered = {};
      participants.forEach(p => { entered[p] = money(draft.personShares?.[p]); });
      return { ...emptyShares, ...entered };
    }
    const specialAmount = specialAmountFor(draft);
    if (draft.mode === '特殊项' && specialAmount > 0) {
      const evenPart = splitEven(Math.max(total - specialAmount, 0), participants);
      return ledgerPeople.reduce((acc, person) => ({
        ...acc,
        [person]: (evenPart[person] || 0) + (draft.specialOwner === person ? specialAmount : 0),
      }), { ...emptyShares });
    }
    return { ...emptyShares, ...splitEven(total, participants) };
  };
  // 各自价格的守恒检查:已分配了多少、还差多少
  const perPersonAssigned = (expenseDraft.participants || [])
    .filter(p => ledgerPeople.includes(p))
    .reduce((sum, p) => sum + money(expenseDraft.personShares?.[p]), 0);
  const draftTotal = money(expenseDraft.amount);
  const assignGap = Math.round((draftTotal - perPersonAssigned) * 100) / 100;
  const isBalanced = expenseDraft.mode !== '各自价格' || Math.abs(assignGap) <= 0.01;
  const canSave = draftTotal > 0 && isBalanced && ledgerPeople.length > 0;
  const ledgerNets = expenses.reduce((acc, item) => {
    const total = money(item.amount);
    ledgerPeople.forEach(person => {
      acc[person] = acc[person] || 0;
      acc[person] -= money(item.shares?.[person]);
    });
    if (ledgerPeople.includes(item.payer)) acc[item.payer] += total;
    return acc;
  }, {});
  // N 人贪心净额化:可能产生多笔转账,而不是只找一对
  const settlementLines = (() => {
    const creditors = [];
    const debtors = [];
    ledgerPeople.forEach(person => {
      const v = ledgerNets[person] || 0;
      if (v > 0.01) creditors.push({ person, v });
      else if (v < -0.01) debtors.push({ person, v: -v });
    });
    creditors.sort((a, b) => b.v - a.v);
    debtors.sort((a, b) => b.v - a.v);
    const lines = [];
    let i = 0; let j = 0;
    while (i < creditors.length && j < debtors.length) {
      const pay = Math.min(creditors[i].v, debtors[j].v);
      lines.push(`${debtors[j].person} → ${creditors[i].person} ${fmtMoney(pay)}`);
      creditors[i].v -= pay;
      debtors[j].v -= pay;
      if (creditors[i].v < 0.01) i += 1;
      if (debtors[j].v < 0.01) j += 1;
    }
    return lines;
  })();
  const settlement = settlementLines.length ? settlementLines.join('\n') : '现在基本扯平。';
  // 结算可解释:每人「垫付 / 应承担 / 净额」
  const settlementDetail = ledgerPeople.map(person => {
    const paid = expenses.reduce((s, item) => s + (item.payer === person ? money(item.amount) : 0), 0);
    const owed = expenses.reduce((s, item) => s + money(item.shares?.[person]), 0);
    const net = paid - owed;
    const label = net > 0.01 ? `应收 ${fmtMoney(net)}` : net < -0.01 ? `应付 ${fmtMoney(net)}` : '两清';
    return `${person}:垫付 ${fmtMoney(paid)} · 应承担 ${fmtMoney(owed)} → ${label}`;
  }).join('\n');
  const showSettlement = () => {
    const buttons = [{ text: '知道了', style: 'cancel' }];
    if (expenses.length) buttons.push({ text: '标记已结清', onPress: () => clearExpenses() });
    Alert.alert('结算', `${settlement}\n\n${settlementDetail}`, buttons);
  };
  // 拉取共享账本的成员 + 账目(供订阅和进入时刷新)
  const refreshLedger = useCallback(async (id) => {
    const target = id || ledgerId;
    if (!target) return;
    const { members: rows, expenses: remoteExpenses } = await fetchLedgerData(target);
    setRemoteMembers(rows.map(r => ({
      name: r.display_name,
      label: r.is_tag ? '标签' : '成员',
      joined: !r.is_tag,
      status: r.is_tag ? '未加入' : '已加入',
      tagOnly: r.is_tag,
    })));
    setExpenses(remoteExpenses);
  }, [ledgerId]);

  // 打开 App 时恢复我已加入的共享账本
  useEffect(() => {
    (async () => {
      const mine = await myLedgers();
      if (mine.length) {
        const l = mine[0];
        setLedgerId(l.id);
        setLedgerCode(l.join_code);
        setCurrency(l.currency || '€');
        refreshLedger(l.id);
      }
    })();
  }, []);

  // 实时同步(Realtime 推送 + 轮询兜底)
  useEffect(() => {
    if (!ledgerId) return undefined;
    const unsub = subscribeLedger(ledgerId, () => refreshLedger(ledgerId));
    return unsub;
  }, [ledgerId, refreshLedger]);

  const createSharedLedger = async () => {
    setLedgerBusy(true);
    const { ledger, error } = await createLedger({
      title: activeBook.title, currency, displayName: myName,
    });
    setLedgerBusy(false);
    if (error || !ledger) {
      Alert.alert('建账本失败', error === 'offline' ? '需要联网并配置 Supabase 才能开共享账本。' : (error || '请稍后再试。'), [{ text: '好' }]);
      return;
    }
    setLedgerId(ledger.id);
    setLedgerCode(ledger.join_code);
    setCurrency(ledger.currency || '€');
    setRemoteMembers([{ name: myName, label: '成员', joined: true, status: '已加入' }]);
    setExpenses([]);
    Alert.alert('邀请码', ledger.join_code, [{ text: '好' }]);
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
    setLedgerId(ledger.id);
    setLedgerCode(ledger.join_code);
    setCurrency(ledger.currency || '€');
    setJoinCode('');
    refreshLedger(ledger.id);
    Alert.alert('已加入', ledger.title, [{ text: '好' }]);
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
    setExpenseDraft({
      category: item.category || '其他',
      title: item.title || item.category || '',
      amount: String(item.amount || ''),
      payer: item.payer || ledgerPeople[0] || '我',
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
    setExpenseEditId(null);
    setExpenseDraft({
      category: expenseDraft.category,
      title: '',
      amount: '',
      payer: ledgerPeople.includes(expenseDraft.payer) ? expenseDraft.payer : (ledgerPeople[0] || '我'),
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

  const isUuid = (v) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
  const deleteExpense = (id) => {
    setExpenses(prev => prev.filter(item => item.id !== id));
    if (expenseEditId === id) resetExpenseDraft();
    // 只有远端真实记录(uuid)才发远端软删;本地种子 id(meal-1 等)只在本机删
    if (isShared && isUuid(id)) deleteExpenseRemote(id).then(() => refreshLedger(ledgerId));
  };

  const clearExpenses = () => {
    if (!expenses.length) {
      Alert.alert('还没有账目', '记一笔再结清。', [{ text: '好' }]);
      return;
    }
    Alert.alert(
      '结清并归零？',
      isShared
        ? '这些账目会标为已结清、从账本移除；远端保留记录，成员和邀请码不变。'
        : '本机这本账的账目会清零，成员保留。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '结清',
          style: 'destructive',
          onPress: async () => {
            const remoteIds = isShared ? expenses.map(item => item.id).filter(isUuid) : [];
            setExpenses([]);
            resetExpenseDraft();
            if (!remoteIds.length) return;
            const results = await Promise.all(remoteIds.map(id => deleteExpenseRemote(id)));
            const failed = results.find(res => res?.error);
            if (failed) {
              Alert.alert('清空未完全同步', failed.error || '有几笔远端账目没有删掉，请稍后再试。', [{ text: '好' }]);
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
      title: expenseDraft.title.trim() || expenseDraft.category,
      amount: expenseDraft.amount.trim(),
      note: expenseDraft.note.trim() || (
        expenseDraft.mode === '均分'
          ? '默认均分'
          : expenseDraft.mode === '各自价格'
            ? ledgerPeople.map(p => `${p} ${fmtMoney(shares[p] || 0)}`).join(' · ')
            : `${specialItem?.owner} 的 ${specialItem?.label} ${fmtMoney(specialItem?.amount || 0)}，其余均分`
      ),
      shares,
      specialItem,
      participants: (() => {
        const chosen = (expenseDraft.participants || []).filter(p => ledgerPeople.includes(p));
        return chosen.length ? chosen : ledgerPeople;
      })(),
    };
    if (isShared) {
      // 共享账本:写远端,再拉回最新(拿到真实 uuid)
      saveExpenseRemote(ledgerId, nextExpense).then(({ error }) => {
        if (error) Alert.alert('同步失败', '这笔已记在本机,联网后会重试。', [{ text: '好' }]);
        refreshLedger(ledgerId);
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
        <View style={tn.modalLayer}>
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

                {toolsOpen && (
                  <View style={tn.toolsCard}>
                    <Text style={tn.uploadTitle}>补进资料</Text>
                    <Text style={tn.uploadSub}>订单 / 截图 / 酒店，先存着</Text>
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
                    {ledgerOpen && (
                      <View style={tn.ledgerCard}>
                        <View style={tn.ledgerHead}>
                          <View>
                            <Text style={tn.ledgerK}>TRIP LEDGER</Text>
                            <Text style={tn.ledgerTitle}>旅行小账本</Text>
                          </View>
                          {specialCount > 0 && <Text style={tn.ledgerBadge}>{specialCount} 笔单独付</Text>}
                        </View>
                        <View style={tn.expenseForm}>
                          <TextInput
                            style={tn.ledgerInput}
                            value={expenseDraft.title}
                            onChangeText={title => setExpenseDraft(prev => ({ ...prev, title }))}
                            placeholder="记点什么"
                            placeholderTextColor={C.mutedLight}
                          />
                          <View style={tn.ledgerInputRow}>
                            <TextInput
                              style={[tn.ledgerInput, { flex: 1 }]}
                              value={expenseDraft.amount}
                              onChangeText={v => setExpenseDraft(prev => ({ ...prev, amount: clampMoney(v) }))}
                              placeholder="金额"
                              keyboardType="decimal-pad"
                              placeholderTextColor={C.mutedLight}
                            />
                            <TextInput
                              style={[tn.ledgerInput, { flex: 1 }]}
                              value={expenseDraft.payer}
                              onChangeText={payer => setExpenseDraft(prev => ({ ...prev, payer }))}
                              placeholder="谁付的"
                              placeholderTextColor={C.mutedLight}
                            />
                          </View>
                          <TextInput
                            style={[tn.ledgerInput, tn.ledgerNoteInput]}
                            value={expenseDraft.note}
                            onChangeText={note => setExpenseDraft(prev => ({ ...prev, note }))}
                            placeholder="备注"
                            placeholderTextColor={C.mutedLight}
                          />
                          <View style={tn.ledgerActions}>
                            <TouchableOpacity
                              style={[tn.specialBtn, expenseDraft.special && tn.specialBtnAct]}
                              onPress={() => setExpenseDraft(prev => ({ ...prev, special: !prev.special }))}
                            >
                              <Text style={[tn.specialBtnTxt, expenseDraft.special && tn.specialBtnTxtAct]}>单独付</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={tn.addExpenseBtn} onPress={saveExpense}>
                              <Text style={tn.addExpenseTxt}>记一笔</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        {expenses.map(item => (
                          <View key={item.id} style={tn.expenseRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={tn.expenseTitle}>{item.title} · {currency}{item.amount}</Text>
                              <Text style={tn.expenseMeta}>{item.payer} 付 · {item.mode} · {item.note}</Text>
                            </View>
                            {item.special && <Text style={tn.specialPill}>单独</Text>}
                          </View>
                        ))}
                      </View>
                    )}
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
        </View>
      </Modal>

      <Modal visible={ledgerOpen} transparent animationType="slide" onRequestClose={() => setLedgerOpen(false)}>
        <View style={tn.modalLayer}>
          {/* 点空白处只收键盘,不关弹窗(防误触退出);关闭走右上角 × */}
          <Pressable style={tn.scrim} onPress={() => Keyboard.dismiss()} />
          <View style={[tn.sheet, tn.ledgerSheet]}>
            <View style={tn.head}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <Text style={tn.mark}>🧮</Text>
                <View>
                  <Text style={tn.title}>同行分账</Text>
                </View>
              </View>
              <View style={tn.headActions}>
                <TouchableOpacity style={[tn.clearLedgerBtn, !expenses.length && tn.clearLedgerBtnOff]} onPress={clearExpenses} disabled={!expenses.length}>
                  <Text style={[tn.clearLedgerTxt, !expenses.length && tn.clearLedgerTxtOff]}>结清</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setLedgerOpen(false)}>
                  <Text style={tn.close}>×</Text>
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView style={tn.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              <View style={tn.ledgerCard}>
                <View style={tn.ledgerHead}>
                  <View>
                    <Text style={tn.ledgerK}>LEDGER</Text>
                    <Text style={tn.ledgerTitle}>分账</Text>
                  </View>
                  {specialCount > 0 && <Text style={tn.ledgerBadge}>{specialCount} 笔单独付</Text>}
                </View>
                <View style={tn.joinBox}>
                  {/* 共享状态 */}
                  {isShared ? (
                    <View>
                      <View style={tn.codeRow}>
                        <View>
                          <Text style={tn.codeK}>共享账本 · 邀请码</Text>
                          <Text style={tn.codeVal}>{ledgerCode}</Text>
                        </View>
                        <TouchableOpacity style={tn.inviteBtn} onPress={inviteLedger}>
                          <Text style={tn.inviteTxt}>邀请</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={tn.joinOtherBox}>
                        <Text style={tn.joinTitle}>加入另一个账本</Text>
                                                <View style={tn.inviteRow}>
                          <TextInput
                            style={tn.joinInput}
                            value={joinCode}
                            onChangeText={setJoinCode}
                            placeholder="输入邀请码"
                            autoCapitalize="characters"
                            placeholderTextColor={C.mutedLight}
                          />
                          <TouchableOpacity style={[tn.inviteBtn, ledgerBusy && tn.inviteBtnOff]} disabled={ledgerBusy} onPress={joinLedgerRemote}>
                            <Text style={tn.inviteTxt}>{ledgerBusy ? '处理中' : '加入'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View>
                      <Text style={tn.joinTitle}>共享账本</Text>
                      <TextInput
                        style={[tn.joinInput, { marginTop: 8, textAlign: 'left', height: 36 }]}
                        value={myName}
                        onChangeText={setMyName}
                        placeholder="你的名字(账本里显示)"
                        placeholderTextColor={C.mutedLight}
                      />
                      <View style={[tn.inviteRow, { marginTop: 8 }]}>
                        <TouchableOpacity style={[tn.addExpenseBtn, { flex: 1, opacity: ledgerBusy ? 0.6 : 1 }]} disabled={ledgerBusy} onPress={createSharedLedger}>
                          <Text style={tn.addExpenseTxt}>{ledgerBusy ? '处理中…' : '建共享账本'}</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={[tn.inviteRow, { marginTop: 8 }]}>
                        <TextInput
                          style={tn.joinInput}
                          value={joinCode}
                          onChangeText={setJoinCode}
                          placeholder="输入邀请码"
                          autoCapitalize="characters"
                          placeholderTextColor={C.mutedLight}
                        />
                        <TouchableOpacity style={[tn.inviteBtn, ledgerBusy && tn.inviteBtnOff]} disabled={ledgerBusy} onPress={joinLedgerRemote}>
                          <Text style={tn.inviteTxt}>{ledgerBusy ? '处理中' : '加入'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* 成员 */}
                  <View style={tn.joinRow}>
                    {members.map(member => (
                      <Text key={member.name} style={[tn.avatarChip, member.joined && tn.avatarChipOn]}>
                        {member.name}{member.tagOnly ? ' · 待加入' : ''}
                      </Text>
                    ))}
                  </View>
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

                  {/* 货币 */}
                  <View style={tn.joinRow}>
                    {CURRENCIES.map(cur => (
                      <TouchableOpacity
                        key={cur}
                        style={[tn.curChip, currency === cur && tn.curChipAct]}
                        onPress={() => {
                          if (cur === currency) return;
                          if (expenses.length) {
                            Alert.alert(
                              '切换货币符号',
                              `只改显示单位,不会换算已有金额:${currency}50 会直接显示为 ${cur}50。确定切换吗?`,
                              [
                                { text: '取消', style: 'cancel' },
                                { text: '切换', onPress: () => setCurrency(cur) },
                              ],
                            );
                          } else {
                            setCurrency(cur);
                          }
                        }}
                      >
                        <Text style={[tn.curTxt, currency === cur && tn.curTxtAct]}>{cur}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
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
                <View style={tn.modeRow}>
                  {splitModes.map(mode => (
                    <TouchableOpacity
                      key={mode}
                      style={[tn.modeBtn, expenseDraft.mode === mode && tn.modeBtnAct]}
                      onPress={() => setExpenseDraft(prev => ({ ...prev, mode, special: mode === '特殊项' ? true : prev.special }))}
                    >
                      <Text style={[tn.modeTxt, expenseDraft.mode === mode && tn.modeTxtAct]}>{MODE_LABEL[mode] || mode}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={tn.expenseForm}>
                  <View style={tn.microSection}>
                    <Text style={tn.splitHint}>谁付的</Text>
                    <View style={tn.ownerRow}>
                      {ledgerPeople.map(person => (
                        <TouchableOpacity
                          key={person}
                          style={[tn.ownerChip, expenseDraft.payer === person && tn.ownerChipAct]}
                          onPress={() => setExpenseDraft(prev => ({
                            ...prev,
                            payer: person,
                            // 付款人通常自己也消费:自动勾进参与人,省一次点击
                            participants: prev.participants?.includes(person)
                              ? prev.participants
                              : [...(prev.participants || []), person],
                          }))}
                        >
                          <Text style={[tn.ownerTxt, expenseDraft.payer === person && tn.ownerTxtAct]}>{person}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={tn.microSection}>
                    <Text style={tn.splitHint}>
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
                  </View>
                  <View style={tn.ledgerInputRow}>
                    <TextInput
                      style={[tn.ledgerInput, { flex: 1 }]}
                      value={expenseDraft.amount}
                      onChangeText={v => setExpenseDraft(prev => ({ ...prev, amount: clampMoney(v) }))}
                      placeholder="总金额"
                      keyboardType="decimal-pad"
                      placeholderTextColor={C.mutedLight}
                    />
                  </View>
                  <TextInput
                    style={[tn.ledgerInput, tn.ledgerNoteInput]}
                    value={expenseDraft.note}
                    onChangeText={note => setExpenseDraft(prev => ({ ...prev, note }))}
                    placeholder="备注，可不填"
                    placeholderTextColor={C.mutedLight}
                  />
                  {expenseDraft.mode === '各自价格' && (
                    <View style={tn.splitBox}>
                      <Text style={tn.splitHint}>各自价格 · 每人实际消费多少</Text>
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
                            placeholderTextColor={C.mutedLight}
                          />
                        </View>
                      ))}
                      {draftTotal > 0 && (
                        <View style={tn.balanceRow}>
                          <Text style={[tn.balanceTxt, !isBalanced && tn.balanceTxtWarn]}>
                            {isBalanced
                              ? `已分配 ${fmtMoney(perPersonAssigned)},账已平 ✓`
                              : assignGap > 0
                                ? `已分配 ${fmtMoney(perPersonAssigned)} / ${fmtMoney(draftTotal)},还差 ${fmtMoney(assignGap)}`
                                : `超出总额 ${fmtMoney(assignGap)},请调整`}
                          </Text>
                          {!isBalanced && assignGap > 0 && (
                            <TouchableOpacity
                              onPress={() => {
                                // 把没分完的差额均分给还没填金额的人;都填了就给付款人
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
                      <Text style={tn.splitHint}>特殊项，其余默认均分</Text>
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
                          placeholderTextColor={C.mutedLight}
                        />
                      </View>
                    </View>
                  )}
                  <View style={tn.ledgerActions}>
                    <TouchableOpacity
                      style={[tn.specialBtn, expenseDraft.special && tn.specialBtnAct]}
                      onPress={() => setExpenseDraft(prev => ({ ...prev, special: !prev.special, mode: !prev.special ? '特殊项' : prev.mode }))}
                    >
                      <Text style={[tn.specialBtnTxt, expenseDraft.special && tn.specialBtnTxtAct]}>单独付</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={tn.scanBtn} onPress={pickOrder}>
                      <Text style={tn.scanTxt}>上传小票</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[tn.addExpenseBtn, !canSave && tn.addExpenseBtnOff]}
                      onPress={saveExpense}
                      disabled={!canSave}
                    >
                      <Text style={tn.addExpenseTxt}>{expenseEditId ? '保存修改' : '记一笔'}</Text>
                    </TouchableOpacity>
                  </View>
                  {/* 按下「记一笔」之前,先看到每个人会分多少 */}
                  {draftTotal > 0 && expenseDraft.mode !== '各自价格' && (
                    <Text style={tn.previewTxt}>
                      预览:{Object.entries(buildShares(expenseDraft)).filter(([, v]) => v > 0).map(([p, v]) => `${p} ${fmtMoney(v)}`).join(' · ') || '选一下参与人'}
                    </Text>
                  )}
                  {expenseEditId && (
                    <TouchableOpacity style={tn.cancelEditBtn} onPress={resetExpenseDraft}>
                      <Text style={tn.cancelEditTxt}>取消修改</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  style={tn.settleAction}
                  activeOpacity={0.88}
                  onPress={showSettlement}
                >
                  <View>
                    <Text style={tn.settleActionK}>结算</Text>
                    <Text style={tn.settleActionMain}>{settlement}</Text>
                  </View>
                  <Text style={tn.settleActionArrow}>→</Text>
                </TouchableOpacity>
                {expenses.map(item => (
                  <View key={item.id} style={tn.expenseRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={tn.expenseTitle}>
                        {item.title && item.title !== item.category ? `${item.category} · ${item.title}` : item.category} · {currency}{item.amount}
                      </Text>
                      <Text style={tn.expenseMeta}>
                        {item.payer} 付 · {item.mode} · {
                          Object.entries(item.shares || {})
                            .filter(([, v]) => money(v) > 0)
                            .map(([p, v]) => `${p} 承担 ${fmtMoney(v)}`)
                            .join(' / ') || '未分配'
                        }
                      </Text>
                      {!!item.note && <Text style={tn.expenseMeta}>{item.note}</Text>}
                      <View style={tn.expenseOps}>
                        <TouchableOpacity onPress={() => startExpenseEdit(item)}>
                          <Text style={tn.expenseOpTxt}>改</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => deleteExpense(item.id)}>
                          <Text style={[tn.expenseOpTxt, tn.deleteTxt]}>删</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    {item.special && <Text style={tn.specialPill}>单独</Text>}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </>
  );
}

// 英文用衬线,让「要说的那句话」读起来像内容,不像 UI(demo 的做法)
const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });

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
  toolsTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  uploadTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  uploadSub: { fontSize: 11, color: C.muted, lineHeight: 17, marginTop: 3 },
  thumbRow: { marginTop: 10 },
  thumb: { width: 56, height: 56, borderRadius: 9, marginRight: 8, backgroundColor: C.tag, borderWidth: 1, borderColor: C.border },
  fromUpload: { fontSize: 12, color: C.muted, fontWeight: '700' },
  uploadActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  recognizeBtn: { backgroundColor: C.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  recognizeBtnOff: { backgroundColor: C.mutedLight },
  recognizeTxt: { color: C.white, fontSize: 12.5, fontWeight: '800' },
  uploadCount: { fontSize: 11, color: C.teal, fontWeight: '800', backgroundColor: C.white, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  toolBtn: { width: '48%', backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 13, paddingVertical: 10, alignItems: 'center' },
  toolBtnTxt: { color: C.teal, fontSize: 12, fontWeight: '800' },
  shareState: { fontSize: 11, color: C.muted, marginTop: 10 },
  headActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clearLedgerBtn: { backgroundColor: '#fff0f0', borderWidth: 1, borderColor: '#f0c8c8', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  clearLedgerBtnOff: { opacity: 0.45 },
  clearLedgerTxt: { fontSize: 11, color: C.lava, fontWeight: '900' },
  clearLedgerTxtOff: { color: C.muted },
  ledgerCard: { marginTop: 12, backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 12 },
  ledgerHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  ledgerK: { fontSize: 9, color: C.teal, fontWeight: '900', letterSpacing: 1.4 },
  ledgerTitle: { fontSize: 16, color: C.ink, fontWeight: '800', marginTop: 2 },
  ledgerBadge: { fontSize: 10, color: C.muted, backgroundColor: C.tag, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden', fontWeight: '700' },
  ledgerSub: { fontSize: 11, color: C.muted, lineHeight: 17, marginTop: 7 },
  settleCard: { backgroundColor: '#20352d', borderRadius: 16, padding: 12, marginTop: 10 },
  settleK: { fontSize: 9, color: 'rgba(255,255,255,0.58)', fontWeight: '900', letterSpacing: 1.4 },
  settleMain: { fontSize: 17, color: C.white, fontWeight: '900', marginTop: 4 },
  settleSub: { fontSize: 10.5, color: 'rgba(255,255,255,0.68)', marginTop: 5, lineHeight: 15 },
  joinBox: { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 10, marginTop: 10 },
  joinOtherBox: { marginTop: 10, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 },
  joinTitle: { fontSize: 12, color: C.ink, fontWeight: '900' },
  joinSub: { fontSize: 10.5, color: C.muted, lineHeight: 16, marginTop: 3 },
  joinRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  avatarChip: { fontSize: 10, color: C.teal, backgroundColor: C.tealLight, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden', fontWeight: '800' },
  avatarChipOn: { color: C.white, backgroundColor: C.teal },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  codeK: { fontSize: 10, color: C.muted, fontWeight: '800', letterSpacing: 0.5 },
  codeVal: { fontSize: 20, color: C.ink, fontWeight: '900', letterSpacing: 3, marginTop: 2 },
  curChip: { minWidth: 34, alignItems: 'center', backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  curChipAct: { backgroundColor: C.ink, borderColor: C.ink },
  curTxt: { fontSize: 13, color: C.muted, fontWeight: '800' },
  curTxtAct: { color: C.white },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 },
  inviteBtn: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 },
  inviteBtnOff: { opacity: 0.6 },
  inviteTxt: { fontSize: 11, color: C.teal, fontWeight: '900' },
  joinInput: { flex: 1, height: 34, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 11, fontSize: 11.5, color: C.ink, fontWeight: '800' },
  ledgerSummary: { backgroundColor: C.white, borderRadius: 13, borderWidth: 1, borderColor: C.border, padding: 9, marginTop: 10 },
  ledgerSummaryTxt: { fontSize: 11, color: C.muted, lineHeight: 16 },
  quickTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 },
  catChip: { borderWidth: 1, borderColor: C.border, backgroundColor: C.white, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  catChipAct: { backgroundColor: C.ink, borderColor: C.ink },
  catTxt: { fontSize: 11, color: C.muted, fontWeight: '800' },
  catTxtAct: { color: C.white },
  modeRow: { flexDirection: 'row', gap: 7, marginTop: 9 },
  modeBtn: { flex: 1, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, borderRadius: 12, paddingVertical: 9, alignItems: 'center' },
  modeBtnAct: { backgroundColor: C.ink, borderColor: C.ink },
  modeTxt: { fontSize: 11, color: C.muted, fontWeight: '900' },
  modeTxtAct: { color: C.white },
  expenseForm: { marginTop: 10 },
  microSection: { marginBottom: 6 },
  ledgerInput: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, fontSize: 12, color: C.ink, marginBottom: 7 },
  ledgerInputRow: { flexDirection: 'row', gap: 7 },
  ledgerNoteInput: { minHeight: 38 },
  splitBox: { backgroundColor: 'rgba(255,255,255,0.62)', borderWidth: 1, borderColor: C.border, borderRadius: 13, padding: 9, marginBottom: 8 },
  splitHint: { fontSize: 10.5, color: C.teal, fontWeight: '900', marginBottom: 7 },
  ownerRow: { flexDirection: 'row', gap: 7, marginBottom: 8 },
  ownerChip: { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingVertical: 7, alignItems: 'center' },
  ownerChipAct: { backgroundColor: C.ink, borderColor: C.ink },
  ownerTxt: { fontSize: 11, color: C.muted, fontWeight: '800' },
  ownerTxtAct: { color: C.white },
  ledgerActions: { flexDirection: 'row', gap: 7, marginBottom: 8 },
  specialBtn: { flex: 1, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, borderRadius: 999, paddingVertical: 9, alignItems: 'center' },
  specialBtnAct: { backgroundColor: C.ink, borderColor: C.ink },
  specialBtnTxt: { fontSize: 12, color: C.muted, fontWeight: '800' },
  specialBtnTxtAct: { color: C.white },
  scanBtn: { flex: 1, borderWidth: 1, borderColor: '#d8c197', backgroundColor: '#fff3d6', borderRadius: 999, paddingVertical: 9, alignItems: 'center' },
  scanTxt: { fontSize: 12, color: '#8a6418', fontWeight: '800' },
  addExpenseBtn: { flex: 1, backgroundColor: C.ink, borderRadius: 999, paddingVertical: 9, alignItems: 'center' },
  addExpenseBtnOff: { backgroundColor: C.mutedLight },
  previewTxt: { fontSize: 11, color: C.teal, lineHeight: 16, marginBottom: 8 },
  personShareRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  personShareName: { width: 56, fontSize: 12, color: C.ink, fontWeight: '700' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  balanceTxt: { fontSize: 11, color: C.teal, fontWeight: '700' },
  balanceTxtWarn: { color: C.lava },
  balanceFix: { fontSize: 11, color: C.blue, fontWeight: '800', padding: 4 },
  addExpenseTxt: { fontSize: 12, color: C.white, fontWeight: '800' },
  cancelEditBtn: { alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 12, marginTop: -2, marginBottom: 6 },
  cancelEditTxt: { fontSize: 11, color: C.muted, fontWeight: '800' },
  settleAction: { backgroundColor: '#20352d', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 11, marginTop: 4, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settleActionK: { fontSize: 9, color: 'rgba(255,255,255,0.58)', fontWeight: '900', letterSpacing: 1.4 },
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
  siteStuck: { fontSize: 13, color: C.muted, lineHeight: 20, fontFamily: SERIF },
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
  miniCn: { fontSize: 11, color: C.muted, marginTop: 4 },
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
