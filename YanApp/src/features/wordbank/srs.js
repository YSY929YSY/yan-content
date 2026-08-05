// 言 · 间隔复习
//
// 在这之前,词的进度是 { wordKey: 'learning' } 这样一个字符串,三个状态循环切换。
// 它能记住「我标过这个词」,但记不住**什么时候该再见到它**——所以「今日 10 词」
// 每次都从词库头上重新挑,「继续复习」只是把所有 learning 筛出来。用户标记的动作
// 没有累积:今天认真标的 10 个词,明天系统一个都不会提醒。
//
// 这个文件把「状态」换成「一条有时间的记录」:
//
//   { box, dueAt, reps, lapses, lastSeenAt, status }
//
// box 是阶梯档位(连续答对几次),dueAt 是下次该见面的日期。到期的词才进今日队列,
// 复习完按评分把 dueAt 往后推。status 不再是用户直接切的开关,而是从 box 算出来的
// 展示口径 —— 只有一个真相来源,界面和云端不会各自记一份然后对不上。
//
// 为什么是 Leitner 阶梯而不是 SM-2:SM-2 的 ease factor 要靠几十次评分才收敛,
// 而这里大部分词一辈子被复习不到 10 次,收敛不了的参数只是噪音。固定阶梯的好处是
// 能对用户讲清楚(答对一次隔 1 天,再对隔 2 天……),出了问题也能一眼看出算错没算错。
//
// 纯函数,不碰 AsyncStorage、不碰 React —— 落盘和渲染在调用方。

/** 答对时的间隔阶梯(天)。box=0 的词答对后隔 1 天再见,一路走到 120 天。 */
export const LADDER = [1, 2, 4, 7, 15, 30, 60, 120];

/** 走到这一档就算「已掌握」—— 间隔已经 30 天以上,不再算日常任务。 */
export const MASTERED_BOX = 5;

/** 每天默认放多少词进队列(到期的 + 补的新词,合计)。 */
export const DAILY_GOAL = 10;

/** 三档评分。界面上是「忘了 / 一般 / 会了」。 */
export const GRADES = ['again', 'hard', 'good'];

const clampBox = (b) => Math.min(Math.max(Number.isFinite(b) ? Math.trunc(b) : 0, 0), LADDER.length);

/** 在 box 档答对一次,应该隔多少天。超出阶梯就用最后一档。 */
export const intervalOf = (box) => LADDER[Math.min(clampBox(box), LADDER.length - 1)];

// ── 日期 ──────────────────────────────────────────────────────
// 全程用本地日历日(YYYY-MM-DD),不用时间戳。
// 理由:用户对「今天该复习」的理解是日历上的今天,不是「距上次满 24 小时」。
// 晚上 11 点学的词,第二天早上 8 点就该能复习到,而不是等到晚上 11 点。

/** 本地时区的今天,YYYY-MM-DD。 */
export function todayStr(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(d.getTime())) return todayStr(new Date());
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 日期串 + n 天。传进来的日期不合法就从今天算 —— 宁可早一天复习,也不要算出 NaN。 */
export function addDays(dateStr, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  const base = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date();
  base.setDate(base.getDate() + (Number.isFinite(n) ? Math.trunc(n) : 0));
  return todayStr(base);
}

// ── 记录 ──────────────────────────────────────────────────────

function makeRecord({ box = 0, dueAt, reps = 0, lapses = 0, lastSeenAt = null }, today) {
  const b = clampBox(box);
  return {
    box: b,
    dueAt: dueAt || today,
    reps: Math.max(0, Math.trunc(reps) || 0),
    lapses: Math.max(0, Math.trunc(lapses) || 0),
    lastSeenAt: lastSeenAt || null,
    status: b >= MASTERED_BOX ? 'mastered' : 'learning',
  };
}

/**
 * 把任意来源的一条进度归一成记录。
 *
 * 兼容三种输入,因为线上同时存在三种:
 *   'learning' / 'mastered'  旧版本地和旧版云端存的扁平字符串
 *   {…}                      新结构(可能字段缺、可能被写坏)
 *   其它                     当作没学过,返回 null
 *
 * 老用户升级后的落点是刻意选的:
 *   learning  → 今天到期。他标过「不认识」,那就今天开始正经复习。
 *   mastered  → 推到 30 天后。他说过认识了,升级不该反过来给他派一堆任务。
 * 两种都不丢 lapses/reps —— 旧格式里本来就没有,从 0 起算,只是精度损失不是数据丢失。
 */
export function normalizeRecord(v, today = todayStr()) {
  if (v === 'learning') return makeRecord({ box: 0, dueAt: today, reps: 1 }, today);
  if (v === 'mastered') {
    return makeRecord(
      { box: MASTERED_BOX, dueAt: addDays(today, intervalOf(MASTERED_BOX)), reps: 1 },
      today
    );
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return makeRecord(v, today);
}

/** 整张表归一。坏条目丢掉而不是让整张表读不出来。 */
export function normalizeProgress(map, today = todayStr()) {
  const out = {};
  if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
  for (const [key, v] of Object.entries(map)) {
    const rec = normalizeRecord(v, today);
    if (rec) out[key] = rec;
  }
  return out;
}

/**
 * 复习一次,得到新记录。
 *
 *   again(忘了)  掉回第一档,lapses+1,当天再见一次 —— 忘了的词不该等到明天。
 *   hard(一般)   档位原地不动,间隔取本档的一半(至少 1 天)。
 *                「想起来了但很吃力」既不该被当成掌握往后推,也不该抹掉已有进度。
 *   good(会了)   前进一档,按本档间隔往后推。
 *
 * 认不出的评分按 good 处理而不是抛异常:这是用户点一下按钮就会走到的路径,
 * 崩在这里的代价远大于记错一个间隔。
 */
export function review(rec, grade, today = todayStr()) {
  const cur = normalizeRecord(rec, today) || makeRecord({}, today);
  const reps = cur.reps + 1;

  if (grade === 'again') {
    return makeRecord(
      { box: 0, dueAt: today, reps, lapses: cur.lapses + 1, lastSeenAt: today },
      today
    );
  }
  if (grade === 'hard') {
    const days = Math.max(1, Math.ceil(intervalOf(cur.box) / 2));
    return makeRecord(
      { box: cur.box, dueAt: addDays(today, days), reps, lapses: cur.lapses, lastSeenAt: today },
      today
    );
  }
  return makeRecord(
    {
      box: cur.box + 1,
      dueAt: addDays(today, intervalOf(cur.box)),
      reps,
      lapses: cur.lapses,
      lastSeenAt: today,
    },
    today
  );
}

/**
 * 直接判定「已掌握」——不走阶梯的手动开关,留给用户对着一个明显认识的词说「别再问我了」。
 * 传 false 则退回未学(删除记录,由调用方处理 null)。
 */
export function markMastered(rec, today = todayStr()) {
  const cur = normalizeRecord(rec, today) || makeRecord({}, today);
  return makeRecord(
    {
      box: MASTERED_BOX,
      dueAt: addDays(today, intervalOf(MASTERED_BOX)),
      reps: cur.reps + 1,
      lapses: cur.lapses,
      lastSeenAt: today,
    },
    today
  );
}

export const isDue = (rec, today = todayStr()) => {
  const r = normalizeRecord(rec, today);
  return !!r && r.dueAt <= today;   // YYYY-MM-DD 字典序即时间序
};

/** 今天到期几个。首页那个数字用它。 */
export function dueCount(progress, today = todayStr()) {
  let n = 0;
  for (const v of Object.values(progress || {})) if (isDue(v, today)) n += 1;
  return n;
}

/** 三态计数,给界面的筛选标签用。 */
export function statusCounts(progress, today = todayStr()) {
  const out = { learning: 0, mastered: 0, due: 0 };
  for (const v of Object.values(progress || {})) {
    const r = normalizeRecord(v, today);
    if (!r) continue;
    out[r.status] += 1;
    if (r.dueAt <= today) out.due += 1;
  }
  return out;
}

/**
 * 挑出今天的队列。
 *
 * 顺序是有意的:**先到期的旧词,再补新词**。
 * 复习欠账优先于摄入新词 —— 否则每天都能靠学新词获得进度感,而积压的旧词
 * 越滚越多,最后打开一看 300 个待复习,直接放弃。逾期最久的排最前。
 *
 * 只从 candidates 里挑。调用方负责先过滤(比如排掉机器起草的词条),
 * 这个函数不认识 isDraftedWord 那套业务规则。
 */
export function pickSession(candidates, progress, {
  today = todayStr(), limit = DAILY_GOAL, keyOf = (w) => w,
} = {}) {
  const prog = progress || {};
  const due = [];
  const fresh = [];

  for (const item of candidates || []) {
    const key = keyOf(item);
    if (!key) continue;
    const rec = normalizeRecord(prog[key], today);
    if (!rec) {
      if (fresh.length < limit) fresh.push(key);
    } else if (rec.dueAt <= today) {
      due.push({ key, dueAt: rec.dueAt });
    }
  }

  due.sort((a, b) => (a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0));
  const keys = due.slice(0, limit).map(d => d.key);
  for (const k of fresh) {
    if (keys.length >= limit) break;
    keys.push(k);
  }
  return keys;
}

// ── 合并 ──────────────────────────────────────────────────────

/**
 * 本地和云端合并,逐词取「最后复习时间更新的那条」。
 *
 * 硬规矩 1:拿不到数据 ≠ 数据是空的。cloud 传 null(拉取失败)时原样返回本地,
 * 绝不因为「云端没有」就把本地记录删掉 —— 这个项目已经因为这类判断丢过四次数据。
 *
 * 同一天复习过的、或两边都没有 lastSeenAt 的,取 dueAt 更远的那条:
 * 更远意味着更多次答对,而把一个已经推到 30 天的词拉回 1 天,用户的损失是实打实的。
 */
export function mergeProgress(local, cloud, today = todayStr()) {
  const a = normalizeProgress(local, today);
  if (cloud == null) return a;
  const b = normalizeProgress(cloud, today);

  const out = { ...a };
  for (const [key, rc] of Object.entries(b)) {
    const rl = out[key];
    if (!rl) { out[key] = rc; continue; }
    const tl = rl.lastSeenAt || '';
    const tc = rc.lastSeenAt || '';
    if (tc > tl) out[key] = rc;
    else if (tc === tl && rc.dueAt > rl.dueAt) out[key] = rc;
  }
  return out;
}

// ── 云端行 ────────────────────────────────────────────────────
// word_progress 表的列名是 snake_case,记录字段是 camelCase,转换只此一处。

export function toCloudRow(key, rec, { userId, bookId = 'n5', now }) {
  const r = normalizeRecord(rec);
  if (!r) return null;
  return {
    user_id: userId,
    word_key: key,
    book_id: bookId,
    status: r.status,
    box: r.box,
    due_at: r.dueAt,
    reps: r.reps,
    lapses: r.lapses,
    last_seen_at: r.lastSeenAt,
    updated_at: now || new Date().toISOString(),
  };
}

/**
 * 云端行 → 记录。
 *
 * 旧账号的行只有 status,没有 box/due_at —— 那些行走 normalizeRecord 的字符串分支,
 * 和本地旧数据同一套落点,不需要在数据库里先跑一遍迁移。
 */
export function fromCloudRow(row, today = todayStr()) {
  if (!row) return null;
  if (row.due_at == null && row.box == null) return normalizeRecord(row.status, today);
  return normalizeRecord({
    box: row.box,
    dueAt: row.due_at,
    reps: row.reps,
    lapses: row.lapses,
    lastSeenAt: row.last_seen_at,
  }, today);
}
