// Commit 3 只把既有 publication selector 接进 App.js；这里守接线，不重测 selector。
// 纯函数的“dictionary-only + 旧 record 仍可评分”在 publication.test.mjs，
// 内容包契约在 publication-content.test.mjs。三层分开，避免把内容快照写进 UI 测试。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = readFileSync(resolve(import.meta.dirname, '../../../App.js'), 'utf8');

test('★★ App 不再从例句形状推断新词准入', () => {
  assert.doesNotMatch(app, /isDraftedWord/, '旧例句推断必须彻底移除');
  assert.match(app, /from '\.\/src\/features\/wordbank\/publication'/);
});

test('★★ 两条主线都只从 anchorPool 与 Learning 的交集取新词', () => {
  const needle = 'anchorPool(content.wordBank || []).filter(canIntroduceWord)';
  assert.equal(app.split(needle).length - 1, 2,
    'TodayCard 与 PieTab 各有一条主线，不能只改一条');
});

test('★★ 词书 session 与默认列表只引入 Learning 词', () => {
  assert.match(app, /\(bankRef\.current \|\| \[\]\)\.filter\(canIntroduceWord\)/,
    '新建 daily session 不能再从例句完整度挑词');
  assert.match(app, /: byStatus\.filter\(canIntroduceWord\);/,
    '默认词书列表只能展示可学习词');
  assert.match(app, /isDictionaryEntry\(w\) \|\| canReviewWord\(w, progress\[wordKey\(w\)\] \|\| null\)/,
    '浏览词典展示可查词；today、due 还须保留历史 record');
});

test('★★ 搜索与词书详情都按同一个 canGradeWord 决定是否交出评分权', () => {
  const guards = app.match(/onGrade=\{canGradeWord\(/g) || [];
  assert.equal(guards.length, 2, '搜索详情、词书/词场详情各一条');
  assert.match(app, /onGrade=\{canGradeWord\(picked, pickedRecord\)[\s\S]{0,180}: undefined\}/,
    '搜索路径必须能让 dictionary-only + 无 record 只读');
  assert.match(app, /onGrade=\{canGradeWord\(selectedWord, progress\[wordKey\(selectedWord\)\] \|\| null\)[\s\S]{0,100}: undefined\}/,
    '词书及词场成员路径必须同样只读');
});

test('★★ 详情页没有 onGrade 就完全不渲染评分区', () => {
  assert.match(app, /if \(!onGrade\) return;/, '即使未来误接按钮，handler 也不能写 progress');
  assert.match(app, /\{onGrade \? <View style=\{wd\.section\}>[\s\S]{0,1400}这个词不用再问我了[\s\S]{0,500}<View style=\{wd\.readonlyBox\}>/,
    '评分和 mastered 按钮必须与只读说明互斥');
  assert.match(app, /仅供查询，暂未开放学习/);
});

test('UI 术语对齐已确认的 publication 语义', () => {
  assert.match(app, /可查 · .*可学习/);
  assert.match(app, /仅词典 · 暂无例句/);
  assert.match(app, /开放词典查询，[\s\S]{0,40}学习内容正在分批核验/);
  assert.match(app, /浏览词典/);
  assert.doesNotMatch(app, /showDrafts|draftTag/);
});
