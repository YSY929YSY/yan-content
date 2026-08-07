// hook 返回值有没有被漏掉。
//
// 为什么值得测:「世界打卡」在 develop/v2 上白屏了一段时间,原因是 NaTab 里
// 用了 countries 和 countryRows,却忘了从 useWorldFootprint 的解构里取出来。
//
// 这类错 JS 编译期不报 —— 它是运行期的 ReferenceError,而且只有真机点进那个 Tab
// 才会炸。App.js 里的 UI 和 React hook 是零测试覆盖的(刻意的取舍:能测的抽出来测,
// 测不了的靠真机验),于是它一直没被发现。
//
// 这条测试不是在测 UI,是在**读源码**做一次符号对账 —— 和 storage.test.mjs
// 用正则读 REGISTRY 一样,靠的是「表本身不能骗人」。
// 它挡不住所有 undefined 变量(那是 eslint no-undef 的活,这个项目没有配),
// 但挡得住「hook 返回了但调用方忘了取」这一类,而这一类已经真实发生过。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSrc = readFileSync(new URL('../../../App.js', import.meta.url), 'utf8');

/** 从 hook 源码里读出它 return 了哪些名字。 */
function hookReturns(relPath, hookName) {
  const src = readFileSync(new URL(relPath, import.meta.url), 'utf8');
  const fnAt = src.indexOf(`export function ${hookName}`);
  assert.notEqual(fnAt, -1, `找不到 ${hookName},文件结构变了`);
  // 取该函数里最后一个 `return {` 到配对的 `};`
  const retAt = src.lastIndexOf('return {');
  assert.ok(retAt > fnAt, `${hookName} 没有对象形式的 return`);
  const block = src.slice(retAt + 'return {'.length, src.indexOf('};', retAt));
  return block
    .split(/[,\n]/)
    .map(s => s.replace(/\/\/.*$/, '').trim())
    .map(s => s.split(':')[0].trim())
    .filter(s => /^[a-zA-Z_$][\w$]*$/.test(s));
}

/** 从 App.js 里某个组件的解构里读出它取了哪些名字。 */
function destructuredIn(componentName, hookCall) {
  const start = appSrc.indexOf(`function ${componentName}(`);
  assert.notEqual(start, -1, `找不到组件 ${componentName}`);
  const callAt = appSrc.indexOf(hookCall, start);
  assert.notEqual(callAt, -1, `${componentName} 里找不到 ${hookCall}`);
  const openAt = appSrc.lastIndexOf('const {', callAt);
  const block = appSrc.slice(openAt + 'const {'.length, appSrc.lastIndexOf('}', callAt));
  return new Set(
    block
      .split(/[,\n]/)
      .map(s => s.replace(/\/\/.*$/, '').trim())
      .map(s => s.split(':').pop().trim())   // saveNote: persistNote → persistNote
      .filter(s => /^[a-zA-Z_$][\w$]*$/.test(s))
  );
}

/** 组件体内除解构外,还提到了哪些名字。 */
function bodyOf(componentName) {
  const start = appSrc.indexOf(`function ${componentName}(`);
  const rest = appSrc.slice(start + 1);
  const next = rest.search(/\nfunction [A-Z]/);
  return appSrc.slice(start, next === -1 ? undefined : start + 1 + next);
}

test('NaTab 用到的 useWorldFootprint 返回值,一个都不能漏在解构外', () => {
  const returns = hookReturns('../../features/world/useWorldFootprint.js', 'useWorldFootprint');
  assert.ok(returns.includes('countries'), '正则没读到 countries,解析逻辑和源码脱节了');

  const taken = destructuredIn('NaTab', '= useWorldFootprint(');
  const body = bodyOf('NaTab');

  const missing = returns.filter((name) => {
    if (taken.has(name)) return false;
    // 组件体里自己声明了同名的也算数 —— NaTab 就有个 const saveNote = ...
    // 包着 hook 的 persistNote,那不是漏取,是有意的本地封装
    if (new RegExp(`(const|let|function)\\s+${name}\\b`).test(body)) return false;
    // 组件体里以独立标识符出现(不是 obj.name、不是 name: 这种键)
    return new RegExp(`[^.\\w'"\`]${name}\\b(?!\\s*:)`).test(body);
  });

  assert.deepEqual(missing, [],
    `这些是 useWorldFootprint 返回的、NaTab 里用了却没解构出来的名字。\n` +
    `运行时会是 ReferenceError,整个「世界打卡」Tab 白屏,而且编译期不报。`);
});
