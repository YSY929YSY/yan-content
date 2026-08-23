// 每个会被打进包的源文件都必须能被解析。
//
// 为什么需要这条:2026-08-22,ReviewScreen.js 有一个没闭合的 <>,
// 而 `npm test` 582/582 全绿、`npm run typecheck` 干净 —— 然后 EAS 构建
// 在 Bundle JavaScript 阶段 74 秒就挂了,dev 二维码扫开也是红屏。
//
// 两道现有关卡都碰不到它:
//   · 测试只覆盖 src/lib 里的纯函数,从不 import React 组件
//   · tsc --noEmit 不解析 .js 里的 JSX
//
// 也就是说这个仓库当时没有任何一道关卡能回答「这个 App 还打得开吗」。
// 这条不做类型检查、不做 lint,只回答最低的那个问题:**它还能被解析吗**。
// 完整答案仍然是 `npx expo export`(约 40 秒),但那个太慢,不适合每次跑。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { transformSync } from '@babel/core';

const require = createRequire(import.meta.url);

const ROOT = new URL('../../../', import.meta.url).pathname;
// __tests__ 不进包(而且用 import.meta,Hermes 本来就不认),不在这条关卡的范围里。
const SKIP = new Set(['node_modules', '.git', 'dist', 'staging', 'assets', 'vendor', '__tests__']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

const files = [join(ROOT, 'App.js'), ...walk(join(ROOT, 'src'))];

test('有源文件可扫(目录结构没变)', () => {
  assert.ok(files.length >= 50, `只找到 ${files.length} 个源文件`);
});

test('★ 每个源文件都能被解析 —— 语法错误会让整个包打不出来', () => {
  const bad = [];
  for (const f of files) {
    try {
      transformSync(readFileSync(f, 'utf8'), {
        filename: f,
        presets: [require.resolve('babel-preset-expo')],
        babelrc: false,
        configFile: false,
        code: false,
      });
    } catch (e) {
      bad.push(`${f.replace(ROOT, '')}: ${String(e.message).split('\n')[0]}`);
    }
  }
  assert.deepEqual(bad, [], '这些文件解析失败,生产包会在 Bundle JavaScript 阶段挂掉');
});
