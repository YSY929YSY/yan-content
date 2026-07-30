// 言 · 同步冲突规则(纯函数,可测)
//
// 从 tripBackup.js 拆出来:那边要 import supabase(RN 专有),Node 里跑不了。
// 而「该不该用云端覆盖本地」这条判断一旦写反,就是静默丢数据 —— 必须有测试兜着。

/**
 * 云端那份是不是比本地新。
 * 拿不准一律返回 false —— 宁可不覆盖(用户手上还有本地那份),
 * 也不要用可疑的云端数据顶掉现有的。
 */
export function cloudIsNewer(cloudRev, localRev) {
  if (!cloudRev) return false;          // 云端没时间戳:不动
  if (!localRev) return true;           // 本地没有(老版本存档):云端有就用
  const c = Date.parse(cloudRev);
  const l = Date.parse(localRev);
  if (!Number.isFinite(c) || !Number.isFinite(l)) return false;
  return c > l;
}
