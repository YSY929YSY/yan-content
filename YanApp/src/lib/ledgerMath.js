// 言 · 分账算术
//
// 这些函数原本埋在 TripNotebook.js 的组件闭包里,测不到 —— 而它们算的是钱。
// 抽出来做纯函数,组件传参调用,测试直接覆盖。
//
// 三条不变量,任何改动都必须守住:
//   ① 守恒:每笔账的分摊之和 == 总额(误差 ≤ 0.01)
//   ② 闭合:所有人的净额之和 == 0
//   ③ 最少:转账笔数不超过「有非零净额的人数 - 1」

/**
 * 金额算式求值:支持 + 和 *,别的一律不认。
 *
 * 为什么要有它:人在小票旁边记账时天然会写「90*2」「47+6」「12+22.8」——
 * 门票两张、打车分两段、买了两样东西。这是纸上记账最省事的地方,
 * 逼用户先按计算器再输入,等于把纸的优势丢掉。
 *
 * 而在这之前,这些写法会被**静默算错**:清洗函数把 * 和 + 直接删掉再拼接,
 * 「90*2」变成 902、「12+22.8」变成 1222.8。不报错、不提示,
 * 你以为记了 180,账本里躺着 902。
 *
 * 只支持 + 和 *:
 *   · 这两个覆盖了真实记账的全部写法(数量 × 单价、几笔加起来)
 *   · 不支持 - 是因为它和负数写法有歧义
 *   · 不支持 / 和括号是因为没人记账时会用,支持了只是扩大出错面
 * 乘法优先级高于加法,和算术常识一致:47+6*2 = 59。
 *
 * @returns 数字;算式不合法(空、有别的符号、以运算符结尾)返回 null
 */
export function evalAmount(raw) {
  const s = String(raw ?? '').replace(/\s/g, '');
  if (!s) return null;
  if (!/^[\d.]+([+*][\d.]+)*$/.test(s)) return null;   // 只认 数字(运算符 数字)*
  let total = 0;
  for (const term of s.split('+')) {
    let product = 1;
    for (const factor of term.split('*')) {
      const n = Number.parseFloat(factor);
      if (!Number.isFinite(n)) return null;
      product *= n;
    }
    total += product;
  }
  // 钱只到分。0.1+0.2 这种浮点尾巴不该出现在账本里
  return Number.isFinite(total) ? Math.round(total * 100) / 100 : null;
}

/** 这串里有没有算式(而不是一个普通数字)。界面据此决定要不要显示「= 180」。 */
export const isAmountExpr = (raw) => /[+*]/.test(String(raw ?? ''));

export const money = (value) => {
  // 先当算式试一次 —— 「90*2」要算成 180,不是 902
  const evaluated = evalAmount(value);
  if (evaluated != null) return evaluated;
  const n = Number.parseFloat(String(value || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * 金额算式输入:在 clampMoney 的基础上放行 + 和 *。
 *
 * 单独一个函数而不是改 clampMoney:预算输入、各自价格那几个格子还用着旧的,
 * 它们没有「两张票」这种语义,放开运算符只会让人困惑。
 */
export const clampAmountExpr = (v) => {
  const s = String(v).replace(/[^\d.+*]/g, '');
  // 每一段数字里最多一个小数点、最多两位小数
  return s.split(/([+*])/).map(part => (
    /[+*]/.test(part) ? part : clampMoney(part)
  )).join('');
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
