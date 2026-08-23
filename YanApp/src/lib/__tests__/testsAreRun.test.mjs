// 每个测试文件都必须真的会被 `npm test` 跑到。
//
// 为什么需要这条:2026-08-23 发现两个文件从建好起就一次没跑过 ——
//
//   src/features/review/__tests__/produceChoices.test.mjs   (拼句,5 条)
//   src/features/wordbank/__tests__/pocket.test.mjs         (口袋)
//
// 它们恰好是这一轮学习闭环的两个核心零件。原因是 package.json 的 glob 只写了
// `src/lib/__tests__/`,而这两个文件放在功能目录下。跑起来 584 全绿,
// 报告上也写着「专项测试 5/5」—— 那是有人手动单独跑的,CI 和日常都碰不到。
//
// **跑不到的测试比没有测试更糟**:它给人一种「这里有守卫」的错觉,
// 而它守的东西早就烂了也没人知道。
//
// 这条不检查测试写得对不对,只回答:它会不会被跑到。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../../', import.meta.url).pathname;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.test\.(mjs|ts)$/.test(name)) out.push(full);
  }
  return out;
}

test('★ 每个测试文件都在 __tests__ 目录里 —— 否则 npm test 的 glob 扫不到它', () => {
  const stray = walk(SRC)
    .filter(f => !/[/\\]__tests__[/\\][^/\\]+$/.test(f))
    .map(f => f.replace(SRC, 'src/'));
  assert.deepEqual(stray, [], '这些测试永远不会被跑到,挪进同级的 __tests__/ 目录');
});
