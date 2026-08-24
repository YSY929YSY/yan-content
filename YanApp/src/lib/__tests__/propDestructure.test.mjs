// 组件用了某个 `onXxx` 回调,却忘了从 props 解构里取出来。
//
// 为什么值得测:2026-08-24 `WBDetailPage` 的签名加 `wordBank` 时,
// 顺手把 `onPrev` / `onNext` 删掉了,而第 2566/2569 行仍在渲染里用它们。
// 这不是 undefined —— 它们不是局部变量也不是全局变量,所以是**渲染期的
// ReferenceError**:一点开词卡就闪退。
//
// 596 条测试全绿、typecheck 干净、audit PASS,包也打出来了。
// 因为 App.js 的 UI 层是零测试覆盖的(刻意取舍),而 typecheck 不检查
// .js 里的未声明变量,eslint no-undef 这个项目没配。
//
// `hookDestructure.test.mjs` 守的是「hook 返回了但调用方没取」,
// 守不住「组件 props 漏取」—— 同一类错的两个入口,只堵了一个。
//
// 这条只管 `onXxx` 这一类(回调 props 按惯例这样命名),不求覆盖所有未声明变量 ——
// 那是 eslint 的活。但回调 props 恰恰是最常被顺手删掉的那一类,而且一删就是崩溃。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../../App.js', import.meta.url), 'utf8');

test('★ 组件用到的 onXxx 回调都在 props 解构里', () => {
  const bad = [];
  const decl = /^function\s+(\w+)\s*\(\{([^}]*)\}\)/gm;
  let m;
  while ((m = decl.exec(src))) {
    const name = m[1];
    const props = new Set(
      m[2].split(',').map(s => s.trim().split(/[:=]/)[0].trim()).filter(Boolean),
    );
    // 函数体近似取到下一个顶层 function 为止 —— 宁可多扫,不要漏扫
    const next = src.indexOf('\nfunction ', m.index + 1);
    const body = src.slice(m.index, next < 0 ? src.length : next);
    const locals = new Set(
      [...body.matchAll(/\b(?:const|let|var|function)\s+(\w+)/g)].map(x => x[1]),
    );
    // 排除 JSX 属性名(`onPress=`)和对象键(`onProgress:`)—— 那些不是标识符引用
    for (const use of body.matchAll(/(?<![.\w])(on[A-Z]\w*)\b(?!\s*[=:])/g)) {
      const id = use[1];
      if (!props.has(id) && !locals.has(id)) bad.push(`${name} 用了 ${id} 却没从 props 解构`);
    }
  }
  assert.deepEqual([...new Set(bad)], [], '这些会在渲染时抛 ReferenceError —— 真机上是闪退');
});
