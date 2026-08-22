// 中文释义的发布可信度是字段级事实，不能从词条 status 猜出来。
// 缺字段时保守地回到机器稿，避免“读不到”被当成“已经审过”。

const TRUST_LEVELS = new Set([
  'machine_drafted',
  'human_reviewed',
  'editorial_published',
]);

export function meaningTrust(word) {
  const value = word?.meaning_zh_status;
  return TRUST_LEVELS.has(value) ? value : 'machine_drafted';
}

