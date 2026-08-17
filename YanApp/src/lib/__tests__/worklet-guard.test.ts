/**
 * 静态护栏:**被 worklet 调用的函数,自己也必须是 worklet。**
 *
 * ─────────────────────────────────────────────────────────
 * 为什么需要一条「读源码」的测试
 *
 * 2026-08-17 真机上手账的拖动/双指/松手**全废**,报错是:
 *
 *   [Worklets] Tried to synchronously call a non-worklet function
 *   `clampScale` on the UI thread.
 *
 * 原因:`journalCanvas` 里的手势函数都标了 `'worklet'`,但它们调用的
 * `clampScale` / `wrapAngle` 在 `journalTypes` 里,没标;`applyDropJitter` 也漏了。
 * 手势跑在 UI 线程,UI 线程只能同步调 worklet。
 *
 * ⚠️ **当时 21 条单元测试全绿、tsc 0 错误、eslint 0 error。**
 * 因为测试在 JS 线程跑,`'worklet'` 在那里只是一句无害的字符串字面量 ——
 * 运行时行为完全正常。**这一类错误,常规测试在原理上就抓不到。**
 *
 * 所以只能静态检查源码本身。丑,但它守的是一个真机上必然复现、
 * 而单测必然放过的失败。
 * ─────────────────────────────────────────────────────────
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ⚠️ 不用 `new URL(..., import.meta.url)`:tsconfig 继承 expo 的 base 带了 DOM lib,
// 那里的 URL 和 node:fs 期望的 node:url.URL 类型不兼容,tsc 会报错(测试却照跑)。
const read = (rel: string) =>
  readFileSync(join(import.meta.dirname, '../../features/journal', rel), 'utf8');

const CANVAS = read('journalCanvas.ts');
const TYPES = read('journalTypes.ts');
const ITEM_VIEW = read('JournalItemView.tsx');

/**
 * 一个名字在这份源码里,是不是带 'worklet' 指令的函数。
 *
 * ⚠️ 第一版用的是 `function name[\s\S]{0,400}?\{\s*'worklet'` 这种正则,
 * 而 `[\s\S]{0,400}?` **会跨过函数边界**,把下一个函数的 'worklet' 认成自己的 ——
 * 于是没标的 `fitCanvas` 被判成标了,**前面三条护栏全是假绿**。
 * 是下面那条「测测试工具」的自检抓到的。
 *
 * 现在改成:定位声明 → 括号配平找到参数表结束 → 找函数体的 `{` →
 * 只看紧跟其后的那一小段。不跨边界。
 */
function isWorklet(src: string, name: string): boolean {
  const decl = new RegExp(`(?:export\\s+)?(?:function\\s+${name}\\b|const\\s+${name}\\s*=)`);
  const m = decl.exec(src);
  if (!m) return false;

  const openParen = src.indexOf('(', m.index);
  if (openParen < 0) return false;

  let depth = 0, i = openParen;
  for (; i < src.length; i++) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') { depth -= 1; if (depth === 0) { i += 1; break; } }
  }
  const brace = src.indexOf('{', i);
  if (brace < 0) return false;
  return /^\s*'worklet';/.test(src.slice(brace + 1, brace + 60));
}

/** 这个名字在源码里出现过(排除注释行),用来确认下面的清单没写错。 */
function definedIn(src: string, name: string): boolean {
  return new RegExp(`(function\\s+${name}\\b|const\\s+${name}\\s*=)`).test(src);
}

/**
 * 手势路径上的全部函数。
 *
 * **加新的手势函数时要往这里加一条。** 忘了加不会报错,但真机会炸 ——
 * 所以下面还有一条测试,反过来检查 journalCanvas 里有没有漏网的。
 */
const MUST_BE_WORKLET: [string, string][] = [
  ['journalCanvas', 'toPageLen'],
  ['journalCanvas', 'screenToPage'],
  ['journalCanvas', 'dragTo'],
  ['journalCanvas', 'pinchTo'],
  ['journalCanvas', 'rotateHandleTo'],
  ['journalCanvas', 'angleAt'],
  ['journalCanvas', 'applyDropJitter'],
  ['journalCanvas', 'clampToCanvas'],
  // ⚠️ 这两个住在 journalTypes 里 —— 正是漏标的那两个
  ['journalTypes', 'wrapAngle'],
  ['journalTypes', 'clampScale'],
];

const SRC: Record<string, string> = { journalCanvas: CANVAS, journalTypes: TYPES };

test('★ 手势路径上的函数全部带 worklet 指令', () => {
  const missing: string[] = [];
  for (const [file, name] of MUST_BE_WORKLET) {
    const src = SRC[file]!;
    assert.ok(definedIn(src, name), `清单写错了:${file} 里没有 ${name}`);
    if (!isWorklet(src, name)) missing.push(`${file}.${name}`);
  }
  assert.deepEqual(missing, [],
    '这些函数会在 UI 线程被同步调用,漏标 worklet 的话真机上手势直接报错');
});

test('★ worklet 函数不许调用没标 worklet 的本地函数', () => {
  // 把 journalCanvas 里每个 worklet 函数的函数体抠出来,看它调了谁
  const bodies = [...CANVAS.matchAll(
    /(?:export\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=)[\s\S]{0,400}?\{\s*'worklet';([\s\S]*?)\n\}/g,
  )];
  assert.ok(bodies.length >= 6, `只解析出 ${bodies.length} 个 worklet,正则大概失效了`);

  // journalTypes 导出的、可能被调用的纯函数
  const importedNames = (CANVAS.match(/import \{([^}]+)\} from '\.\/journalTypes\.ts'/)?.[1] || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  const bad: string[] = [];
  for (const m of bodies) {
    const fnName = m[1] || m[2];
    const body = m[3] || '';
    for (const dep of importedNames) {
      // 只看函数调用形式 dep(,不看当常量用的 PAGE / CANVAS
      if (!new RegExp(`\\b${dep}\\s*\\(`).test(body)) continue;
      if (!isWorklet(TYPES, dep)) bad.push(`${fnName} → journalTypes.${dep}`);
    }
  }
  assert.deepEqual(bad, [],
    'UI 线程只能同步调 worklet;被调用方也必须标');
});

test('★ 手势回调里调用的函数必须是 worklet 或 runOnJS 包过', () => {
  // JournalItemView 的 .onStart/.onUpdate/.onEnd 里,凡是直接调的本地函数
  // 都跑在 UI 线程上。runOnJS(x)() 是合法的例外。
  const handlers = [...ITEM_VIEW.matchAll(/\.on(?:Start|Update|End)\(\([^)]*\)\s*=>\s*\{([\s\S]*?)\n    \}\)/g)];
  assert.ok(handlers.length >= 4, `只解析出 ${handlers.length} 个手势回调,正则大概失效了`);

  const fromCanvas = (ITEM_VIEW.match(/import \{([^}]+)\} from '\.\/journalCanvas\.ts'/)?.[1] || '')
    .split(',').map(s => s.trim().replace(/^type\s+/, '')).filter(Boolean);

  const bad: string[] = [];
  for (const h of handlers) {
    const body = h[1] || '';
    for (const dep of fromCanvas) {
      if (!new RegExp(`\\b${dep}\\s*\\(`).test(body)) continue;
      if (new RegExp(`runOnJS\\(\\s*${dep}`).test(body)) continue;   // 显式切回 JS 线程,合法
      if (!isWorklet(CANVAS, dep)) bad.push(`手势回调 → ${dep}`);
    }
  }
  assert.deepEqual(bad, [], '手势回调跑在 UI 线程,里面直接调的必须是 worklet');
});

test('isWorklet 本身是准的 —— 否则上面三条全是假绿', () => {
  // ⚠️ 这条测「测试的工具」。isWorklet 要是永远返回 true,前面三条就永远通过。
  assert.equal(isWorklet(CANVAS, 'dragTo'), true, '标了的要认出来');
  assert.equal(isWorklet(CANVAS, 'fitCanvas'), false,
    'fitCanvas 故意没标(它只在 JS 线程用),必须被认成 false');
  assert.equal(isWorklet(TYPES, 'canvasRect'), false, '没标的要认出来是没标');
});
