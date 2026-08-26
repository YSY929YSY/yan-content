// 言 · 纠错记录的纯函数部分
// JSONL 是一份本机事实：每次提交只追加一行，不把旧记录整份覆盖。

export const CORRECTION_KINDS = Object.freeze([
  'meaning',
  'unnatural',
  'example_mismatch',
]);

export function appendJsonlLine(existing, record) {
  const current = typeof existing === 'string' ? existing : '';
  const separator = current && !current.endsWith('\n') ? '\n' : '';
  return `${current}${separator}${JSON.stringify(record)}\n`;
}

/**
 * 追加一条 JSONL 记录。读失败或写失败都返回 false。
 * @param {{readText: () => Promise<string>, writeText: (text: string) => Promise<void>}} io
 * @returns {Promise<boolean>}
 */
export async function appendJsonlRecord(io, record) {
  let existing;
  try {
    existing = await io.readText();
  } catch {
    return false;
  }
  try {
    await io.writeText(appendJsonlLine(existing, record));
    return true;
  } catch {
    return false;
  }
}
