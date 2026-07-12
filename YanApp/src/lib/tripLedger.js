// 言 YAN · 多人分账客户端
// 和 schema.trip-ledger.sql 配套:建本 / 加入 / 加成员 / 拉取 / 记账 / 订阅同步。
// 所有函数在 supabase 未配置时安全退化(返回 null / 空),不会崩。
import { supabase } from './supabase';

async function requireUser() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user || null;
}

// ── 建本 ─────────────────────────────────────────────
export async function createLedger({ title, currency, displayName }) {
  if (!supabase) return { ledger: null, error: 'offline' };
  try {
    await requireUser();
    const { data, error } = await supabase.rpc('create_ledger', {
      p_title: title || '旅行账本',
      p_currency: currency || '€',
      p_display_name: displayName || '我',
    });
    if (error) throw error;
    return { ledger: data, error: null };
  } catch (e) {
    return { ledger: null, error: e.message };
  }
}

// ── 加入 ─────────────────────────────────────────────
export async function joinLedger({ code, displayName }) {
  if (!supabase) return { ledger: null, error: 'offline' };
  try {
    await requireUser();
    const { data, error } = await supabase.rpc('join_ledger', {
      p_code: (code || '').trim().toUpperCase(),
      p_display_name: displayName || '我',
    });
    if (error) throw error;
    return { ledger: data, error: null };
  } catch (e) {
    return { ledger: null, error: e.message };
  }
}

// ── 加名字标签成员 ──────────────────────────────────────
export async function addTagMember({ ledgerId, name }) {
  if (!supabase) return { member: null, error: 'offline' };
  try {
    await requireUser();
    const { data, error } = await supabase.rpc('add_ledger_tag_member', {
      p_ledger: ledgerId,
      p_name: name,
    });
    if (error) throw error;
    return { member: data, error: null };
  } catch (e) {
    return { member: null, error: e.message };
  }
}

// ── 我加入的账本(打开 App 时恢复) ──────────────────────
export async function myLedgers() {
  if (!supabase) return [];
  try {
    await requireUser();
    const { data, error } = await supabase.rpc('my_ledgers');
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('[Ledger] myLedgers failed:', e.message);
    return [];
  }
}

// ── 拉取一个账本的成员 + 账目 ────────────────────────────
export async function fetchLedgerData(ledgerId) {
  if (!supabase || !ledgerId) return { members: [], expenses: [] };
  try {
    const [membersRes, expensesRes] = await Promise.all([
      supabase.from('ledger_members').select('*').eq('ledger_id', ledgerId).order('created_at'),
      supabase.from('ledger_expenses').select('*').eq('ledger_id', ledgerId)
        .is('deleted_at', null).order('created_at', { ascending: false }),
    ]);
    if (membersRes.error) throw membersRes.error;
    if (expensesRes.error) throw expensesRes.error;
    return {
      members: membersRes.data || [],
      expenses: (expensesRes.data || []).map(normalizeExpense),
    };
  } catch (e) {
    console.warn('[Ledger] fetch failed:', e.message);
    return { members: [], expenses: [] };
  }
}

// 把远端行转成组件里用的形状(amount 转字符串,和本地一致)
function normalizeExpense(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    amount: String(row.amount),
    payer: row.payer,
    mode: row.mode,
    note: row.note || '',
    special: !!row.special,
    shares: row.shares || {},
    specialItem: row.special_item || undefined,
    participants: row.participants || [],
    remote: true,
  };
}

// ── 记一笔 / 改一笔 ────────────────────────────────────
export async function saveExpenseRemote(ledgerId, expense) {
  if (!supabase || !ledgerId) return { error: 'offline' };
  try {
    const user = await requireUser();
    const row = {
      ledger_id: ledgerId,
      created_by: user?.id || null,
      category: expense.category,
      title: expense.title,
      amount: Number.parseFloat(String(expense.amount).replace(/[^\d.-]/g, '')) || 0,
      payer: expense.payer,
      mode: expense.mode,
      note: expense.note || '',
      special: !!expense.special,
      shares: expense.shares || {},
      special_item: expense.specialItem || null,
      participants: expense.participants || [],
      updated_at: new Date().toISOString(),
    };
    // 已有 uuid 就 update,否则 insert
    const isUuid = typeof expense.id === 'string' && /^[0-9a-f-]{36}$/i.test(expense.id);
    let res;
    if (isUuid) {
      res = await supabase.from('ledger_expenses').update(row).eq('id', expense.id).select().single();
    } else {
      res = await supabase.from('ledger_expenses').insert(row).select().single();
    }
    if (res.error) throw res.error;
    return { expense: normalizeExpense(res.data), error: null };
  } catch (e) {
    return { error: e.message };
  }
}

// ── 删一笔(软删) ─────────────────────────────────────
export async function deleteExpenseRemote(expenseId) {
  if (!supabase) return { error: 'offline' };
  try {
    const { error } = await supabase.from('ledger_expenses')
      .update({ deleted_at: new Date().toISOString() }).eq('id', expenseId);
    if (error) throw error;
    return { error: null };
  } catch (e) {
    return { error: e.message };
  }
}

// ── 实时订阅(Realtime 开了就走推送;没开就用轮询兜底) ──────────
// 返回一个 unsubscribe 函数。onChange 无参,收到变化时让调用方重新 fetch。
export function subscribeLedger(ledgerId, onChange, { pollMs = 8000 } = {}) {
  if (!supabase || !ledgerId) return () => {};
  let channel = null;
  let timer = null;
  try {
    channel = supabase
      .channel(`ledger-${ledgerId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'ledger_expenses', filter: `ledger_id=eq.${ledgerId}` },
        () => onChange())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'ledger_members', filter: `ledger_id=eq.${ledgerId}` },
        () => onChange())
      .subscribe();
  } catch (e) {
    console.warn('[Ledger] realtime unavailable, fallback to polling:', e.message);
  }
  // 轮询兜底(Realtime 没开、或掉线时仍能同步)
  timer = setInterval(() => onChange(), pollMs);
  return () => {
    if (channel) supabase.removeChannel(channel);
    if (timer) clearInterval(timer);
  };
}
