// 言 YAN · 旅行小本子 + 多人分账(从 App.js 抽出)
// 依赖:共享色板 theme、发音组件 Speech、分账同步库 tripLedger。
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Keyboard, Modal, Platform, Pressable, ScrollView,
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

const TRIP_STORAGE_KEY = 'yan_trip_notebook_v1';
const MONTH_NUM = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const TRAVEL_BOOKS_SEED = [
  {
    id: 'ireland-turkey-2026',
    title: 'Ireland / Türkiye 2026',
    subtitle: 'Lyra & Ning · 7月15日—7月29日',
    status: '当前旅程',
    shareLabel: '同行版未生成',
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
      },
      {
        mon: 'JUL',
        day: '16',
        title: 'Dublin → Galway',
        summary: '上午 Trinity；下午火车去 Galway',
        detail: 'Dublin Heuston 15:35 → Galway Ceannt 18:00\n先回 Temple Bar Inn 取行李，再打车去 Heuston。',
        phrase: 'Which platform does the train to Galway leave from?',
      },
      {
        mon: 'JUL',
        day: '17',
        title: 'Cliffs of Moher',
        summary: 'Galway 出发，一天给海风',
        detail: '建议报 Galway 出发的一日团：Cliffs of Moher + Burren。\n自然景观对中文讲解依赖不高。',
        phrase: 'What time do we need to be back here?',
      },
      {
        mon: 'JUL',
        day: '18',
        title: 'Galway → Belfast',
        summary: '移动日；晚上 The Flint',
        detail: '待补具体交通。建议上午从 Galway 出发，经 Dublin 转 Belfast。\n住：The Flint · 48 Howard St · 7/18—7/21',
        phrase: 'Could we leave our luggage here?',
      },
      {
        mon: 'JUL',
        day: '21',
        title: 'Belfast → Cappadocia',
        summary: 'BFS → STN → SAW → NAV',
        detail: '16:40 BFS → STN 18:00 · Ryanair UK RK0158\n23:00 STN → SAW 05:00 · AJet VF1992\n07:45 SAW → NAV 09:00 · AJet VF3268',
        phrase: 'Where is the shuttle to Göreme?',
      },
      {
        mon: 'JUL',
        day: '25',
        title: 'Göreme → Istanbul',
        summary: '夜巴；Esenler 或 Alibeyköy',
        detail: '候选：20:15 Göreme Otogarı → Istanbul。\n住老城选 Esenler；住 Galata/Taksim 可考虑 Alibeyköy。',
        phrase: 'Does this bus stop at Alibeyköy?',
      },
    ],
  },
  {
    id: 'next-trip-draft',
    title: '下一本旅行册',
    subtitle: '上传订单后，言会先整理成小卡',
    status: '草稿',
    shareLabel: '未分享',
    current: {
      eyebrow: '草稿',
      title: '还没有下一段路。',
      note: '上传机票、酒店或截图后，这里会变成路上能用的小纸条。',
      from: '出发地',
      to: '目的地',
      time: '待补',
      phrase: 'Could you help me check this itinerary?',
      phraseZh: '可以帮我确认一下这个行程吗？',
    },
    gaps: ['上传第一份订单', '补入住宿', '生成同行版'],
    legs: [],
  },
];

function TripNotebook() {
  const [visible, setVisible] = useState(false);
  const [books, setBooks] = useState(TRAVEL_BOOKS_SEED);
  const [activeBookId, setActiveBookId] = useState(TRAVEL_BOOKS_SEED[0].id);
  const [expanded, setExpanded] = useState(1);
  const [editIdx, setEditIdx] = useState(undefined);
  const [draft, setDraft] = useState({ title: '', summary: '', detail: '', phrase: '' });
  const [uploads, setUploads] = useState([]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [expenseEditId, setExpenseEditId] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [ledgerMembers, setLedgerMembers] = useState([
    { name: 'Lyra', label: '我', status: '已加入', joined: true },
    { name: 'Ning', label: '同行', status: '待加入', joined: false },
    { name: 'Max', label: '标签', status: '未下载', joined: false, tagOnly: true },
  ]);
  // ── 多人分账(Supabase 共享账本) ──
  const [ledgerId, setLedgerId] = useState(null);      // null = 仅本机;有值 = 已进共享账本
  const [ledgerCode, setLedgerCode] = useState('');    // 真实加入码
  const [currency, setCurrency] = useState('€');
  const [remoteMembers, setRemoteMembers] = useState(null); // 远端成员;null 时用本地 ledgerMembers
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [myName, setMyName] = useState('我');
  const [newMemberName, setNewMemberName] = useState('');
  const [expenses, setExpenses] = useState([
    { id: 'meal-1', category: '晚餐', title: 'Galway 晚餐', payer: 'Lyra', amount: '42.80', mode: '各自价格', note: 'Lyra €24.40 · Ning €18.40', special: true, shares: { Lyra: 24.4, Ning: 18.4 } },
    { id: 'shop-1', category: '购物', title: '便利店补给', payer: 'Ning', amount: '16.20', mode: '特殊项', note: '共同零食 €10.20 · Lyra 私人物品 €6.00', special: true, shares: { Lyra: 11.1, Ning: 5.1 }, specialItem: { owner: 'Lyra', label: '私人物品', amount: 6 } },
    { id: 'taxi-1', category: '交通', title: 'Heuston 打车', payer: 'Lyra', amount: '15.00', mode: '均分', note: '两人各 €7.50', special: false, shares: { Lyra: 7.5, Ning: 7.5 } },
  ]);
  const [expenseDraft, setExpenseDraft] = useState({
    category: '晚餐',
    title: '',
    amount: '',
    payer: 'Lyra',
    mode: '均分',
    note: '',
    special: false,
    personShares: {},          // 各自价格:{ 名字: '金额字符串' },任意人数
    specialOwner: 'Lyra',
    specialAmount: '',
    specialLabel: '',
    participants: ['Lyra', 'Ning'],
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
  // 进入某本旅行册时，默认展开“今天”那一段
  useEffect(() => {
    setExpanded(todayLegIdx >= 0 ? todayLegIdx : (legs.length ? 0 : null));
  }, [activeBookId]);
  const specialCount = expenses.filter(item => item.special).length;
  // 成员:进了共享账本用远端成员,否则用本地成员
  const members = remoteMembers || ledgerMembers;
  const ledgerPeople = members.map(member => member.name || member.display_name);
  const isShared = !!ledgerId;
  const expenseCategories = ['晚餐', '车票', '购物', '酒店', '门票', '其他'];
  const splitModes = ['均分', '各自价格', '特殊项'];
  const CURRENCIES = ['€', '£', '₺', '$', '¥', '₩'];
  const money = (value) => {
    const n = Number.parseFloat(String(value || '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
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
    Alert.alert('一键结算', `${settlement}\n\n——明细——\n${settlementDetail}\n\n(已自动抵消相互往来)`, [{ text: '知道了' }]);
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
    Alert.alert('共享账本已建好', `把加入码发给同行者：${ledger.join_code}\n他们在自己手机上「加入」后，记的每一笔都会同步过来。`, [{ text: '知道了' }]);
  };

  const inviteLedger = () => {
    if (!ledgerCode) {
      Alert.alert('还没有共享账本', '先点「建共享账本」，或输入同行者的加入码加入。', [{ text: '好' }]);
      return;
    }
    Alert.alert('邀请同行', `加入码：${ledgerCode}\n\n同行者在他们的言里打开分账、输入这个码即可加入。`, [{ text: '好' }]);
  };

  const joinLedgerRemote = async () => {
    const cleaned = joinCode.trim().toUpperCase();
    if (!cleaned) {
      Alert.alert('输入加入码', '把同行者发来的加入码填进来。', [{ text: '好' }]);
      return;
    }
    setLedgerBusy(true);
    const { ledger, error } = await joinLedger({ code: cleaned, displayName: myName });
    setLedgerBusy(false);
    if (error || !ledger) {
      Alert.alert('加入失败', error === 'offline' ? '需要联网并配置 Supabase 才能加入。' : (error || '请确认加入码。'), [{ text: '好' }]);
      return;
    }
    setLedgerId(ledger.id);
    setLedgerCode(ledger.join_code);
    setCurrency(ledger.currency || '€');
    setJoinCode('');
    refreshLedger(ledger.id);
    Alert.alert('已加入', `你已加入「${ledger.title}」。之后记的账会和同行者同步。`, [{ text: '好' }]);
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
      setUploads(prev => [{ uri: result.assets[0].uri, name: `订单/截图 ${prev.length + 1}` }, ...prev]);
      Alert.alert('已放入待识别', '这版先保存账单图片。正式版会识别总额、商户和明细，再让你轻轻确认特殊项。', [{ text: '好' }]);
    }
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

  const makeShare = () => {
    setBooks(prev => prev.map(book => (
      book.id === activeBook.id ? { ...book, shareLabel: '同行版已准备' } : book
    )));
    Alert.alert('同行版已准备', '正式版会生成只读链接，并可隐藏订单号、价格和私人备注。', [{ text: '知道了' }]);
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
      Alert.alert('没有账目', '现在账本里还没有可以清空的账。', [{ text: '好' }]);
      return;
    }
    Alert.alert(
      '清空当前账目？',
      isShared
        ? '会清空这个共享账本里的账目记录，成员和加入码会保留。'
        : '会清空本机当前旅行账本里的账目，成员会保留。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清空',
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
                  <Text style={tn.nowTitle}>{activeBook.current.title}</Text>
                  <Text style={tn.nowText}>{activeBook.current.note}</Text>
                  <View style={tn.route}>
                    <View style={tn.place}>
                      <Text style={tn.placeK}>FROM</Text>
                      <Text style={tn.placeT}>{activeBook.current.from}</Text>
                    </View>
                    <Text style={tn.arrow}>→</Text>
                    <View style={tn.place}>
                      <Text style={tn.placeK}>TO</Text>
                      <Text style={tn.placeT}>{activeBook.current.to}</Text>
                    </View>
                  </View>
                  <Text style={tn.timeHint}>{activeBook.current.time} · 已离线保存最近行程</Text>
                  <View style={tn.phrase}>
                    <View style={{ flex: 1 }}>
                      <Text style={tn.phraseEn}>{activeBook.current.phrase}</Text>
                      <Text style={tn.phraseCn}>{activeBook.current.phraseZh}</Text>
                    </View>
                    <SpeakBtn
                      onPress={() => speak(activeBook.current.phrase, 'en-GB', 'trip-now')}
                      speaking={speakingKey === 'trip-now'}
                      size="sm"
                      color={C.teal}
                    />
                  </View>
                </View>

                {toolsOpen && (
                  <View style={tn.toolsCard}>
                    <View style={tn.toolsTop}>
                      <View>
                        <Text style={tn.uploadTitle}>补进资料</Text>
                        <Text style={tn.uploadSub}>订单、截图、酒店、聊天计划，都属于这本旅行册。</Text>
                      </View>
                      {uploads.length > 0 && <Text style={tn.uploadCount}>{uploads.length} 份</Text>}
                    </View>
                    <View style={tn.toolGrid}>
                      <TouchableOpacity style={tn.toolBtn} onPress={pickOrder}>
                        <Text style={tn.toolBtnTxt}>上传</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={tn.toolBtn} onPress={() => startEdit(null)}>
                        <Text style={tn.toolBtnTxt}>新增段落</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={tn.toolBtn} onPress={makeShare}>
                        <Text style={tn.toolBtnTxt}>同行版</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={tn.toolBtn} onPress={() => { setToolsOpen(false); setLedgerOpen(true); }}>
                        <Text style={tn.toolBtnTxt}>🧮 分账</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={tn.toolBtn} onPress={createDraftBook}>
                        <Text style={tn.toolBtnTxt}>新旅行册</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={tn.shareState}>{activeBook.shareLabel} · {activeBook.gaps.length} 件待补齐</Text>
                    {ledgerOpen && (
                      <View style={tn.ledgerCard}>
                        <View style={tn.ledgerHead}>
                          <View>
                            <Text style={tn.ledgerK}>TRIP LEDGER</Text>
                            <Text style={tn.ledgerTitle}>旅行小账本</Text>
                          </View>
                          <Text style={tn.ledgerBadge}>{specialCount} 个特殊项</Text>
                        </View>
                        <Text style={tn.ledgerSub}>先轻轻记下：谁付了、哪些是个人项、哪些要均分。旅行结束再统一结清。</Text>
                        <View style={tn.ledgerSummary}>
                          <Text style={tn.ledgerSummaryTxt}>当前记录 {expenses.length} 笔 · 支持账单上传 / 手动修正 / 特殊项标记</Text>
                        </View>
                        <View style={tn.expenseForm}>
                          <TextInput
                            style={tn.ledgerInput}
                            value={expenseDraft.title}
                            onChangeText={title => setExpenseDraft(prev => ({ ...prev, title }))}
                            placeholder="这笔是什么，如晚餐 / 车票 / 购物"
                            placeholderTextColor={C.mutedLight}
                          />
                          <View style={tn.ledgerInputRow}>
                            <TextInput
                              style={[tn.ledgerInput, { flex: 1 }]}
                              value={expenseDraft.amount}
                              onChangeText={amount => setExpenseDraft(prev => ({ ...prev, amount }))}
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
                            placeholder="怎么分：Ning 自己的咖啡 / 两人均分 / Lyra 私人物品…"
                            placeholderTextColor={C.mutedLight}
                          />
                          <View style={tn.ledgerActions}>
                            <TouchableOpacity
                              style={[tn.specialBtn, expenseDraft.special && tn.specialBtnAct]}
                              onPress={() => setExpenseDraft(prev => ({ ...prev, special: !prev.special }))}
                            >
                              <Text style={[tn.specialBtnTxt, expenseDraft.special && tn.specialBtnTxtAct]}>特殊项</Text>
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
                            {item.special && <Text style={tn.specialPill}>特殊</Text>}
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
                    <Text style={tn.emptyTitle}>这本旅行册还是空的。</Text>
                    <Text style={tn.emptySub}>点右上角“补”，上传资料或手动新增第一段路。</Text>
                  </View>
                )}

                {legs.map((leg, i) => (
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
                      <TouchableOpacity style={tn.editPill} onPress={() => startEdit(i)}>
                        <Text style={tn.editTxt}>改</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                    {expanded === i && (
                      <View style={tn.legBody}>
                        {leg.detail.split('\n').map((line, idx) => <Text key={idx} style={tn.line}>{line}</Text>)}
                        <View style={tn.miniPhrase}>
                          <Text style={tn.miniEn}>{leg.phrase}</Text>
                          <Text style={tn.miniCn}>这句会跟着当前行程出现。</Text>
                        </View>
                      </View>
                    )}
                  </View>
                ))}

                <View style={tn.todo}>
                  <Text style={tn.todoTitle}>还缺几件小事</Text>
                  {activeBook.gaps.map(gap => <Text key={gap} style={tn.todoLine}>· {gap}</Text>)}
                </View>
              </ScrollView>
            )}
          </View>
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
                  <Text style={tn.sub}>同一账本 · 各自上传 · 最后结清</Text>
                </View>
              </View>
              <View style={tn.headActions}>
                <TouchableOpacity style={[tn.clearLedgerBtn, !expenses.length && tn.clearLedgerBtnOff]} onPress={clearExpenses} disabled={!expenses.length}>
                  <Text style={[tn.clearLedgerTxt, !expenses.length && tn.clearLedgerTxtOff]}>清空</Text>
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
                  <Text style={tn.ledgerBadge}>{specialCount} 个特殊项</Text>
                </View>
                <View style={tn.joinBox}>
                  {/* 共享状态 */}
                  {isShared ? (
                    <View>
                      <View style={tn.codeRow}>
                        <View>
                          <Text style={tn.codeK}>共享账本 · 加入码</Text>
                          <Text style={tn.codeVal}>{ledgerCode}</Text>
                        </View>
                        <TouchableOpacity style={tn.inviteBtn} onPress={inviteLedger}>
                          <Text style={tn.inviteTxt}>邀请</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={tn.joinOtherBox}>
                        <Text style={tn.joinTitle}>加入另一个账本</Text>
                        <Text style={tn.joinSub}>如果同行者发了新的邀请码，在这里输入即可切换过去。</Text>
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
                      <Text style={tn.joinTitle}>开一个跨手机的共享账本</Text>
                      <Text style={tn.joinSub}>建好后把加入码发给同行者,各自在自己手机上记账,自动同步。</Text>
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
                      <Text style={[tn.modeTxt, expenseDraft.mode === mode && tn.modeTxtAct]}>{mode}</Text>
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
                      onChangeText={amount => setExpenseDraft(prev => ({ ...prev, amount }))}
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
                              personShares: { ...prev.personShares, [person]: v },
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
                          onChangeText={specialAmount => setExpenseDraft(prev => ({ ...prev, specialAmount, special: true }))}
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
                      <Text style={[tn.specialBtnTxt, expenseDraft.special && tn.specialBtnTxtAct]}>标特殊</Text>
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
                    <Text style={tn.settleActionK}>一键结算</Text>
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
                    {item.special && <Text style={tn.specialPill}>特殊</Text>}
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
  phrase: { marginTop: 10, borderRadius: 15, backgroundColor: C.tealLight, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center' },
  phraseEn: { fontSize: 15, color: C.ink, fontWeight: '700', lineHeight: 20 },
  phraseCn: { fontSize: 11, color: C.muted, marginTop: 3 },
  toolsCard: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 12 },
  toolsTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  uploadTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  uploadSub: { fontSize: 11, color: C.muted, lineHeight: 17, marginTop: 3 },
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
  ledgerBadge: { fontSize: 10, color: '#9a6b16', backgroundColor: '#fff0c6', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden', fontWeight: '800' },
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
  modeBtnAct: { backgroundColor: '#2d584a', borderColor: '#2d584a' },
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
  specialBtnAct: { backgroundColor: '#2d584a', borderColor: '#2d584a' },
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
  specialPill: { fontSize: 10, color: C.white, backgroundColor: '#2d584a', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden', fontWeight: '800' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 2, marginTop: 4, marginBottom: 8 },
  section: { fontSize: 14, fontWeight: '800', color: C.teal, letterSpacing: 1, marginBottom: 8 },
  add: { fontSize: 12, color: C.teal, fontWeight: '700' },
  leg: { backgroundColor: 'rgba(255,250,241,0.9)', borderRadius: 17, borderWidth: 1.5, borderColor: C.border, marginBottom: 8, overflow: 'hidden' },
  legOpen: { borderColor: '#d3a24d' },
  legHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  date: { width: 42 },
  mon: { fontSize: 10, color: C.teal, fontWeight: '800', letterSpacing: 1 },
  day: { fontSize: 20, color: C.ink, fontWeight: '800' },
  legTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  legSub: { fontSize: 11.5, color: C.muted, marginTop: 2 },
  editPill: { borderWidth: 1, borderColor: C.border, backgroundColor: C.white, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  editTxt: { color: C.teal, fontSize: 11, fontWeight: '700' },
  emptyBook: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 17, padding: 16, marginBottom: 8 },
  emptyTitle: { fontSize: 14, color: C.ink, fontWeight: '800' },
  emptySub: { fontSize: 12, color: C.muted, lineHeight: 18, marginTop: 4 },
  legBody: { paddingHorizontal: 12, paddingBottom: 12, paddingLeft: 64 },
  line: { borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 7, fontSize: 12, color: C.ink, lineHeight: 18 },
  miniPhrase: { backgroundColor: C.tealLight, borderRadius: 13, padding: 9, marginTop: 6 },
  miniEn: { fontSize: 13, fontWeight: '700', color: C.ink, lineHeight: 18 },
  miniCn: { fontSize: 11, color: C.muted, marginTop: 3 },
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
