// 每个 .sql 都必须能安全地重复运行。
//
// 为什么这条比它看起来重要:11 个 .sql 散在 src/lib,没有执行记录 ——
// 谁也不知道哪几个在数据库上跑过。这在 2026-08 造成了两次静默故障:
//
//   · word_progress 的五列没跑 → 间隔复习的云端同步整个停摆
//   · place_checkin.checked_in_at 没跑 → 打卡日期从来没上过云,
//     而「旅迹」那条弧线就是按日期画的。代码早修好了,数据库这列没跟上。
//
// 两次都不报错、不提示,只在真机日志里留一行 warn。
//
// 解法不是维护「跑过哪些」的记录表,而是让每条语句都能重复执行,然后无脑重跑
// schema.apply-all.sql。这条测试守的就是那个前提 —— 只要有一个文件不幂等,
// 「重跑一遍保平安」这个办法就不成立了。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const DIR = new URL('../', import.meta.url);
const files = readdirSync(DIR).filter(f => f.endsWith('.sql') && f !== 'schema.apply-all.sql');
const read = (f) => readFileSync(new URL(f, DIR), 'utf8');

test('有 .sql 可读(目录结构没变)', () => {
  assert.ok(files.length >= 11, `只找到 ${files.length} 个 .sql`);
});

test('★ 每个 create policy 前面都有 drop policy if exists', () => {
  const bad = [];
  for (const f of files) {
    const s = read(f);
    // ⚠️ 表名要用 [\w.]+ 而不是 \w+ —— storage 上的策略挂在 `storage.objects`,
    // \w 不含点,会把它截成 `storage`,然后去找一条根本不该存在的
    // `drop policy ... on storage;`。这条测试因此**在写错的代码上通过、
    // 在改对之后失败**(2026-08-14):正确写法是 on storage.objects,
    // 而写成 on storage 会直接 42P01,整份 schema 从那一行往下全不执行。
    for (const m of s.matchAll(/create policy\s+("[^"]+")\s*\n?\s*on\s+([\w.]+)/g)) {
      if (!s.slice(0, m.index).includes(`drop policy if exists ${m[1]} on ${m[2]};`)) {
        bad.push(`${f}: ${m[1]} on ${m[2]}`);
      }
    }
  }
  assert.deepEqual(bad, [], 'create policy 重复执行会报错,整段脚本会在这里中断');
});

test('★ create table / index / type 都带 if not exists,function 用 or replace', () => {
  const bad = [];
  for (const f of files) {
    read(f).split('\n').forEach((line, i) => {
      const t = line.trim();
      if (/^create (table|index|type)\b/.test(t) && !t.includes('if not exists')) {
        bad.push(`${f}:${i + 1} ${t.slice(0, 60)}`);
      }
      if (/^create function\b/.test(t)) bad.push(`${f}:${i + 1} 应写成 create or replace function`);
    });
  }
  assert.deepEqual(bad, []);
});

test('★ apply-all 包含了每一个 .sql —— 漏一个就等于那条迁移永远跑不到', () => {
  const all = read('schema.apply-all.sql');
  const missing = files.filter(f => !all.includes(`-- ${f}\n`));
  assert.deepEqual(missing, [], '新增 .sql 后要重新生成 schema.apply-all.sql');
});
