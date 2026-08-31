// 中文里的全角括号是日语省略、中文补出的注；只有形状完全可信时才单独降级。
// 返回 null 就是 fail closed：调用方必须把整句原样渲染。
export function splitParentheticalZh(value) {
  if (typeof value !== 'string' || !value) return null;

  const parts = [];
  let text = '';
  let note = null;

  for (const char of value) {
    if (char === '（') {
      if (note !== null) return null;
      if (text) parts.push({ kind: 'text', text });
      text = '';
      note = '（';
      continue;
    }
    if (char === '）') {
      if (note === null || !note.slice(1).trim()) return null;
      note += '）';
      parts.push({ kind: 'note', text: note });
      note = null;
      continue;
    }
    if (note !== null) note += char;
    else text += char;
  }

  if (note !== null) return null;
  if (text) parts.push({ kind: 'text', text });
  return parts.some(part => part.kind === 'note') ? parts : null;
}
