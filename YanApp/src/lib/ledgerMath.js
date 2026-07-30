// 言 · 分账算术
//
// 这些函数原本埋在 TripNotebook.js 的组件闭包里,测不到 —— 而它们算的是钱。
// 抽出来做纯函数,组件传参调用,测试直接覆盖。
//
// 三条不变量,任何改动都必须守住:
//   ① 守恒:每笔账的分摊之和 == 总额(误差 ≤ 0.01)
//   ② 闭合:所有人的净额之和 == 0
//   ③ 最少:转账笔数不超过「有非零净额的人数 - 1」

export const money = (value) => {
  const n = Number.parseFloat(String(value || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// 金额输入:只留数字和一个小数点,最多两位小数
export const clampMoney = (v) => {
  let s = String(v).replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  return s;
};

// 均分但守恒:前 n-1 人取两位小数,最后一人拿余数(3 人分 €10 → 3.33/3.33/3.34)
export const splitEven = (amount, people) => {
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

export const specialAmountFor = (draft) =>
  Math.max(0, Math.min(money(draft.specialAmount), money(draft.amount)));

export const buildShares = (draft, ledgerPeople) => {
  const total = money(draft.amount);
  const emptyShares = ledgerPeople.reduce((acc, person) => ({ ...acc, [person]: 0 }), {});
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

/**
 * 单一币种的净额化(N 人贪心)。
 * @returns {{ cur, lines: [{from,to,amount,cur}], rows: [{person,paid,owed,net}] }}
 */
export const settleOne = (items, cur, ledgerPeople) => {
  const nets = items.reduce((acc, item) => {
    const total = money(item.amount);
    ledgerPeople.forEach(person => {
      acc[person] = acc[person] || 0;
      acc[person] -= money(item.shares?.[person]);
    });
    if (ledgerPeople.includes(item.payer)) acc[item.payer] += total;
    return acc;
  }, {});
  const creditors = []; const debtors = [];
  ledgerPeople.forEach(person => {
    const v = nets[person] || 0;
    if (v > 0.01) creditors.push({ person, v });
    else if (v < -0.01) debtors.push({ person, v: -v });
  });
  creditors.sort((a, b) => b.v - a.v);
  debtors.sort((a, b) => b.v - a.v);
  const lines = [];
  let i = 0; let j = 0;
  while (i < creditors.length && j < debtors.length) {
    const pay = Math.min(creditors[i].v, debtors[j].v);
    lines.push({ from: debtors[j].person, to: creditors[i].person, amount: pay, cur });
    creditors[i].v -= pay;
    debtors[j].v -= pay;
    if (creditors[i].v < 0.01) i += 1;
    if (debtors[j].v < 0.01) j += 1;
  }
  const rows = ledgerPeople.map(person => {
    const paid = items.reduce((s, item) => s + (item.payer === person ? money(item.amount) : 0), 0);
    const owed = items.reduce((s, item) => s + money(item.shares?.[person]), 0);
    return { person, paid, owed, net: paid - owed };
  });
  return { cur, lines, rows };
};

// 金额归一:欧陆小票写 "1.056,00",英美写 "1,056.00"。
// 只按「数字和点」粗暴清洗会把 1.056,00 变成 1.05600 —— 差 1000 倍还长得像正常数字。
// 规则:最后出现的那个分隔符才是小数点;它后面必须正好两位数字,否则视为千位分隔。
export function normalizeAmount(raw) {
  let s = String(raw ?? '').replace(/[^\d.,]/g, '');
  if (!s) return '';
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  const sep = Math.max(lastDot, lastComma);
  if (sep >= 0 && /^\d{2}$/.test(s.slice(sep + 1))) {
    const intPart = s.slice(0, sep).replace(/[.,]/g, '');
    return `${intPart || '0'}.${s.slice(sep + 1)}`;
  }
  return s.replace(/[.,]/g, '');   // 没有两位小数 → 全是千位分隔
}
