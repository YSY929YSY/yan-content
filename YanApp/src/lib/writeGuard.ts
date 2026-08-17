/**
 * 「这份状态现在能不能落盘」的唯一裁决者。
 *
 * ─────────────────────────────────────────────────────────
 * 为什么需要它
 *
 * 这个项目丢过四次用户数据,**四次都是同一个形状**:
 *
 *     读不到  →  当成「是空的」 →  下一次写入把磁盘上真实的那份覆盖掉
 *
 * 硬规矩「拿不到数据 ≠ 数据是空的」已经写了很久,但它一直是**一条规矩**,
 * 靠每个调用点自己记得。于是同一个洞反复出现在不同的 hook 里。
 * 这个文件把它变成**一段可测的代码**。
 *
 * ─────────────────────────────────────────────────────────
 * 三个状态,不是两个 —— 这是关键
 *
 * 之前 useWorldFootprint 用的是 `readFailed = useRef(false)`,只有两态:
 * 失败 / 没失败。但真实世界有三态,而它把第三态归错了边:
 *
 *     pending  还没读回来   ← 从 mount 到 await 结束的这段时间
 *     ready    读成功了
 *     failed   读失败了
 *
 * `readFailed` 初值是 false,所以 **pending 期间 canWrite 是 true**。
 * 读盘是异步的,用户在这段时间点一下,写回去的是内存里的初值(空的)。
 * 窗口窄,但这正是四次事故的那类窗口 —— 而且 AsyncStorage 越大窗口越宽。
 *
 * **默认必须是「不能写」。** 一个还没读过盘的状态,对磁盘上有什么一无所知。
 */

export type GuardState = 'pending' | 'ready' | 'failed';

/** readJsonResult 的返回形状里我们只关心 ok。 */
type ReadOutcome = { ok: boolean };

/**
 * 收到一次读盘结果之后,状态应该变成什么。
 *
 * ⚠️ `failed → ready` 只在**读成功**时发生,而且调用方**必须同时采纳读到的值**。
 * 只翻状态不采纳值,等于宣布「我知道磁盘上是什么」然后写回一份空的 ——
 * 那就把这个护栏变成了它要防的那个 bug。
 */
export function afterRead(_current: GuardState, outcome: ReadOutcome): GuardState {
  return outcome.ok ? 'ready' : 'failed';
}

/**
 * 现在能不能写。
 *
 * **只有 ready 能写。** pending 不能(不知道磁盘上有什么),
 * failed 更不能(知道自己没拿到)。
 */
export function canWrite(state: GuardState): boolean {
  return state === 'ready';
}

/** 给日志和诊断行用的人话。 */
export function whyBlocked(state: GuardState, key = ''): string | null {
  if (state === 'ready') return null;
  const k = key ? `(${key})` : '';
  return state === 'pending'
    ? `还没读盘就要写${k} —— 这次不写,免得拿初值覆盖磁盘上的数据`
    : `读盘失败过${k} —— 本次会话不再写这个键,宁可这次改动丢,不要把已有的清掉`;
}

/**
 * 一个有状态的小包装,给 hook 用。
 *
 * 刻意**不用 React 的任何东西** —— 它得能在 node --test 里直接跑。
 * hook 里拿 `useRef(createWriteGuard())` 持有它即可。
 */
export function createWriteGuard(key = '') {
  let state: GuardState = 'pending';
  let blockedWrites = 0;
  return {
    get state() { return state; },
    /** 挡下过多少次写。诊断用 —— 这个数不为 0 就说明有路径在裸写。 */
    get blockedWrites() { return blockedWrites; },

    /** 读盘回来时调。传 readJsonResult 的返回值即可。 */
    onRead(outcome: ReadOutcome) {
      state = afterRead(state, outcome);
      return state;
    },

    /**
     * 写之前问一句。返回 false 就**不要写**。
     *
     * 顺手记一笔并 warn —— 一个被挡下的写入意味着某条路径的时序有问题,
     * 静默挡掉的话你永远不知道它存在。
     */
    allow(): boolean {
      if (canWrite(state)) return true;
      blockedWrites += 1;
      console.warn('[WriteGuard]', whyBlocked(state, key));
      return false;
    },
  };
}

export type WriteGuard = ReturnType<typeof createWriteGuard>;
