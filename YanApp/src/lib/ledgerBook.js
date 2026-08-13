// 言 · 账本(多本)的数据结构与迁移
//
// 为什么有这个文件:分账原本只能有一本账。不是数据库的限制 ——
// trip_ledgers / ledger_members / ledger_expenses 一开始就按 ledger_id 隔离,
// my_ledgers() 也是 returns setof。卡住的是客户端:
//   · ledgerId 是个单值,恢复时直接取 mine[0],其余账本被静默丢弃
//   · expenses 是**一个扁平数组**,落盘时也是 snapshot.expenses ——
//     账目根本没有按账本分桶,切一下账本就会把 A 本的账混进 B 本
//
// 顺带纠正一个归属错误:预算原来按**旅行册 id** 存(budgets[bookId])。
// 但账本和旅行册是两回事 —— 有人根本不用小本子,只用分账。
// 所以账本是独立实体,预算跟账本走。
//
// 这个文件只放纯函数,组件传参调用,测试直接覆盖。改这里的任何一条,
// 后果都是钱的存储路径出问题,所以每条规则下面都写清楚为什么。
// 带 .js 后缀:这个文件要被 Node 的 test runner 直接跑,ESM 解析不补后缀。
// Metro 两种写法都认。
import { normalizeExpenseList } from './ledgerMath.js';

export const LEDGER_TITLE_FALLBACK = '我的账本';

// 老格式(单本账、扁平 expenses)迁过来的那一本用固定 key。
// 固定而不是随机:云端可能还躺着老客户端推上去的扁平快照,
// 每次读到都要能认出「这就是那一本」,不能每次生成一个新桶。
export const LEGACY_KEY = 'local-legacy';

export const isSharedKey = (key) => typeof key === 'string' && !key.startsWith('local-');

export const newLocalKey = (now = Date.now()) => `local-${now}`;

const asArray = (v) => (Array.isArray(v) ? v : []);
const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

/**
 * 一本账本的规范形状。缺什么补什么,**不认识的字段原样带着** ——
 * 以后加字段时,旧版本写出去的账本经过新版本一轮读写不会被削掉。
 * 认不出的输入返回 null,由调用方决定怎么办(而不是在这里造一个空账本)。
 */
export function normalizeLedger(raw) {
  const o = asObject(raw);
  if (!o) return null;
  const key = o.key || o.id || null;
  if (!key) return null;
  return {
    ...o,
    key: String(key),
    id: o.id || (isSharedKey(String(key)) ? String(key) : null),
    title: String(o.title || LEDGER_TITLE_FALLBACK),
    joinCode: o.joinCode || null,
    shared: !!(o.shared || o.id || isSharedKey(String(key))),
    currency: o.currency || '€',
    members: asArray(o.members),
    // 分类改名的归一落点之一。账目从哪个入口进来都要过这一遍。
    expenses: normalizeExpenseList(asArray(o.expenses)),
    budget: asObject(o.budget) || null,
    createdAt: o.createdAt || null,
  };
}

export const findLedger = (ledgers, key) =>
  asArray(ledgers).find(l => l && l.key === key) || null;

/** 改一本账本的某些字段,其余账本原样不动。找不到就原样返回,绝不新建。 */
export function patchLedger(ledgers, key, patch) {
  const list = asArray(ledgers);
  let hit = false;
  const next = list.map(l => {
    if (!l || l.key !== key) return l;
    hit = true;
    return { ...l, ...(typeof patch === 'function' ? patch(l) : patch) };
  });
  return hit ? next : list;
}

/** 加一本;key 已存在就合并进去(不产生两个同 key 的桶)。 */
export function upsertLedger(ledgers, ledger) {
  const one = normalizeLedger(ledger);
  if (!one) return asArray(ledgers);
  const list = asArray(ledgers);
  const i = list.findIndex(l => l && l.key === one.key);
  if (i < 0) return [...list, one];
  const next = [...list];
  // 已有的在前:本地那份是「当下能用的」,远端字段只补空缺
  next[i] = { ...one, ...next[i], shared: next[i].shared || one.shared };
  return next;
}

/**
 * 挑一个可用的当前账本 key。
 * 传进来的那个还在就用它,不在就用第一本 —— 永远不返回一个指向空气的 key,
 * 否则界面会拿 undefined 当账本,记出来的账掉进虚空。
 */
export function pickActiveKey(ledgers, wanted) {
  const list = asArray(ledgers);
  if (!list.length) return null;
  return list.some(l => l && l.key === wanted) ? wanted : list[0].key;
}

// 老快照里预算是按旅行册存的:{ [bookId]: { amount, currency } }。
// 迁一本过来当这本账的预算:优先当前册的,否则第一条填了数的。
// ⚠️ 原来的 budgets 映射**不删**,继续原样留在快照里 ——
// 万一挑错了,数据还在盘上,不是猜错一次就没了。
function pickLegacyBudget(budgets, activeBookId) {
  const map = asObject(budgets);
  if (!map) return null;
  const direct = asObject(map[activeBookId]);
  if (direct) return direct;
  for (const v of Object.values(map)) {
    const b = asObject(v);
    if (b && Number.parseFloat(b.amount) > 0) return b;
  }
  return null;
}

// 老快照没存过币种(currency 不在 snapshot 里),只能从账目反推:
// 用得最多的那个就是这本账的币种。一笔都没有就退回预算的币种,再退回 €。
function guessCurrency(expenses, budget) {
  const count = {};
  asArray(expenses).forEach(e => {
    const c = e?.currency;
    if (c) count[c] = (count[c] || 0) + 1;
  });
  const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : (budget?.currency || '€');
}

/**
 * 从落盘快照里读出账本列表。
 *
 * 返回 { ok, ledgers, activeLedgerKey }。**读不出来时 ok:false 且 ledgers 为 null**,
 * 不返回空数组 —— 这是这个项目犯过至少四次的那条:拿不到数据 ≠ 数据是空的。
 * 调用方看到 ok:false 必须保持现状,而不是把界面清空。
 */
export function migrateLedgers(saved) {
  const o = asObject(saved);
  if (!o) return { ok: false, ledgers: null, activeLedgerKey: null };

  // 新格式:已经分好桶了
  if (Array.isArray(o.ledgers)) {
    const ledgers = o.ledgers.map(normalizeLedger).filter(Boolean);
    if (!ledgers.length) return { ok: false, ledgers: null, activeLedgerKey: null };
    return { ok: true, ledgers, activeLedgerKey: pickActiveKey(ledgers, o.activeLedgerKey) };
  }

  // 老格式:一本账,账目和成员摊在快照顶层
  const hasLegacy = Array.isArray(o.expenses) || Array.isArray(o.ledgerMembers);
  if (!hasLegacy) return { ok: false, ledgers: null, activeLedgerKey: null };

  const budget = pickLegacyBudget(o.budgets, o.activeBookId);
  const one = normalizeLedger({
    key: LEGACY_KEY,
    title: LEDGER_TITLE_FALLBACK,
    currency: guessCurrency(o.expenses, budget),
    members: o.ledgerMembers,
    expenses: o.expenses,
    budget,
  });
  return { ok: true, ledgers: [one], activeLedgerKey: one.key };
}

/**
 * 把远端「我加入的账本」并进本地桶。
 *
 * 两条铁律:
 *  ① ok 为假(网络/RPC 失败)一律原样返回。myLedgers 失败时给的是空列表,
 *    照着它删本地桶等于弱网抖一下就把账本清空。
 *  ② **只加不删**。远端没列出来的本地桶必须留着 —— 本机账本压根不在远端,
 *    而共享账本也可能只是这次没拉到。
 */
export function mergeRemoteLedgers(local, remote, ok = true) {
  const list = asArray(local);
  if (!ok || !Array.isArray(remote)) return list;
  let out = list;
  for (const r of remote) {
    if (!r?.id) continue;
    const existing = findLedger(out, r.id);
    if (existing) {
      out = patchLedger(out, r.id, {
        id: r.id,
        shared: true,
        joinCode: r.join_code || existing.joinCode,
        title: r.title || existing.title,
        // 币种保留本地那份:那是「上一笔记的是什么钱」,比账本的默认币种更贴当下
        currency: existing.currency || r.currency || '€',
      });
    } else {
      out = upsertLedger(out, {
        key: r.id, id: r.id, shared: true,
        joinCode: r.join_code, title: r.title, currency: r.currency,
      });
    }
  }
  return out;
}

/**
 * 云端快照 → 本地账本列表。返回 null 表示「不要动本地」。
 *
 * 麻烦在于云端那份可能是**老版本客户端**推上去的:只有扁平的 expenses,
 * 没有 ledgers。这种时候绝不能拿它替换整个列表 —— 那会把其它账本一起抹掉。
 * 只把它当作「遗留那一本」的内容更新进去。
 */
export function applyCloudLedgers(localLedgers, payload) {
  const p = asObject(payload);
  if (!p) return null;
  const list = asArray(localLedgers);

  if (Array.isArray(p.ledgers)) {
    const ledgers = p.ledgers.map(normalizeLedger).filter(Boolean);
    return ledgers.length ? ledgers : null;   // 空的就是没读到,别覆盖
  }

  if (!Array.isArray(p.expenses)) return null;
  const legacy = normalizeLedger({
    key: LEGACY_KEY,
    title: LEDGER_TITLE_FALLBACK,
    currency: guessCurrency(p.expenses, pickLegacyBudget(p.budgets, p.activeBookId)),
    members: p.ledgerMembers,
    expenses: p.expenses,
    budget: pickLegacyBudget(p.budgets, p.activeBookId),
  });
  const existing = findLedger(list, LEGACY_KEY);
  if (!existing) return [...list, legacy];
  return patchLedger(list, LEGACY_KEY, {
    expenses: legacy.expenses,
    members: legacy.members.length ? legacy.members : existing.members,
  });
}
