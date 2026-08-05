// 言 · 共享账本的本地/远端合并
//
// 这段规则判错的后果是钱算错,而且是**静默**算错 —— 用户看到的是一笔账
// 出现两次,结算金额翻倍。已经发生过一次,成因如下:
//
//   1. 记一笔 → 本地生成临时 id(expense-1754…),乐观上屏
//   2. 写远端 → 服务端生成另一个 uuid
//   3. 合并时的规则是「id 不是 uuid = 还没同步,必须留着」
//   4. 那条临时 id 的确实不是 uuid,于是被留下;远端那条又被拉回来
//      → 同一笔账,两个 id,并存
//
// 规则本身没错(离线记的账不能被远端结果吞掉),错在**写成功之后
// 没有把临时 id 换成服务端给的 uuid**。所以这里除了合并,还提供
// replaceLocalId —— 两件事必须配套,只做一半就是上面那个 bug。

/** 服务端主键是 uuid;本地临时 id 形如 expense-1754…,以此区分同步状态。 */
export const isUuid = (id) =>
  typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** 按 id 去重,保留先出现的那条。 */
export function dedupeById(list = []) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/**
 * 合并本地与远端账目。
 *
 * 远端为准,但本地还没同步上去的(id 不是 uuid)必须保留 ——
 * 否则离线记的账会被远端结果吞掉。这条和「拿不到数据 ≠ 数据是空的」
 * 是同一个道理。
 */
export function mergeExpenses(local = [], remote = []) {
  const remoteIds = new Set(remote.map(e => e?.id));
  const pending = local.filter(item => item && !isUuid(item.id) && !remoteIds.has(item.id));
  return dedupeById([...pending, ...remote]);
}

/**
 * 写远端成功后,把本地那条临时 id 的替换成服务端返回的真实记录。
 *
 * 少了这一步,下一次 mergeExpenses 会把它当成「还没同步的笔」留下来,
 * 和远端那条并存 —— 一笔变两笔,结算翻倍。
 */
export function replaceLocalId(list = [], localId, saved) {
  if (!saved) return list;
  const replaced = list.map(item => (item?.id === localId ? saved : item));
  // 实时推送可能已经把远端那条塞进来了,替换后会撞 id,所以要再去重一次
  return dedupeById(replaced);
}
