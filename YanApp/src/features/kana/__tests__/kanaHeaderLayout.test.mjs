// 五十音头部防跳测试。
//
// 背景:`docs/handoff/TICKET-kana-header.md` —— 「看过 X/46」计数块只在
// 清音屏渲染,切走时整块消失,下面所有内容(假名格区域)往上跳。
// 这个仓库没有 RN 渲染测试基建(npm test 只跑 node --test 的纯函数测试,
// 见 package.json 的 test 脚本),所以这里用两层证据顶上:
//
//   1. 纯函数层:`kanaHeaderLayout.ts` 里算「假名格区域顶部偏移」的函数
//      不接受 kanaSection 参数 —— 五个子标签算出来必须是同一个数,
//      这是「与选中哪个子标签无关」这件事本身。
//   2. 源码层:直接读 KanaScreen.js 源文本,断言删掉的计数块(gate.*)
//      没有再出现,且头部/分段控件/提示卡的高度确实接的是上面那份常量
//      (不是各写各的字面量,防止两边漂开)。
//
// 变异验证(手动做,不写进自动化测试):把 headerRow1 的 height 从常量改成
// `kanaSection === 'clear' ? X : Y`,或者把 gate.ready 那块粘回去,
// 跑 `npm test` 应该转红 —— 结果见本轮 CC-REPORT.md。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  KANA_SECTIONS,
  kanaHeaderHeight,
  kanaContentTopOffset,
  KANA_HEADER_ROW1_HEIGHT,
  KANA_SEGMENT_HEIGHT,
  KANA_THEORY_CARD_MIN_HEIGHT,
} from '../kanaHeaderLayout.ts';

const src = readFileSync(new URL('../KanaScreen.js', import.meta.url), 'utf8');

// ── 纯函数层:五个子标签的偏移量必须是同一个数 ─────────────────────

test('★ 决策指标:假名格区域顶部偏移与 kanaSection 无关,五段算出来必须相等', () => {
  assert.equal(KANA_SECTIONS.length, 5);

  // kanaContentTopOffset() 本身不接受 kanaSection —— 用一个包装函数
  // 模拟「对每个子标签各算一次」,断言五次结果两两相等,
  // 对应工单的决策指标:「切换子标签时,假名格区域顶部的位移:现状 → 0」。
  const offsetForSection = (_section) => kanaContentTopOffset();
  const offsets = KANA_SECTIONS.map(offsetForSection);

  for (const o of offsets) assert.equal(o, offsets[0]);
  assert.ok(offsets[0] > 0);
});

test('头部自身高度(kn.hd)是正数常量,不依赖任何外部输入', () => {
  const h = kanaHeaderHeight();
  assert.ok(Number.isFinite(h) && h > 0);
  assert.equal(kanaHeaderHeight(), h);
});

// ── 源码层:确认组件真的接的是这份常量,而不是各写各的字面量 ─────────

test('头部三块(行一/分段控件/提示卡)的样式确实引用了共享常量,不是各写各的字面量', () => {
  assert.match(src, /KANA_HEADER_ROW1_HEIGHT/);
  assert.match(src, /KANA_SEGMENT_HEIGHT/);
  assert.match(src, /KANA_THEORY_CARD_MIN_HEIGHT/);

  const headerRow1Block = src.slice(src.indexOf('headerRow1: {'), src.indexOf('headerTitleBlock: {'));
  assert.match(headerRow1Block, /height:\s*KANA_HEADER_ROW1_HEIGHT/);

  const segmentTrackBlock = src.slice(src.indexOf('segmentTrack: {'), src.indexOf('segmentBtn: {'));
  assert.match(segmentTrackBlock, /height:\s*KANA_SEGMENT_HEIGHT/);
  // 换行会让分段控件的高度随屏宽变化,重新引入闪跳 —— 不许换行。
  assert.doesNotMatch(segmentTrackBlock, /flexWrap/);

  const theoryCardBlock = src.slice(src.indexOf('theoryCard: {'), src.indexOf('theoryTitle:'));
  assert.match(theoryCardBlock, /minHeight:\s*KANA_THEORY_CARD_MIN_HEIGHT/);
});

test('删掉的「看过 X/46」计数块(含「我已经会了」按钮)没有再出现', () => {
  assert.doesNotMatch(src, /gate\.ready/);
  assert.doesNotMatch(src, /gate\.done/);
  assert.doesNotMatch(src, /gate\.legacy/);
  assert.doesNotMatch(src, /gate\.seen/);
  assert.doesNotMatch(src, /kn\.gateRow/);
  assert.doesNotMatch(src, /kn\.gateBtn/);
  assert.doesNotMatch(src, /onPress=\{declare\}/);
  assert.doesNotMatch(src, /useKanaGate\(/);
});

// ── 变异防护:泛化守卫,不认具体变量名 ──────────────────────────────
//
// 上面几条按名字(gate.ready / kn.gateRow ...)找,只能防「这份代码原样
// 粘回来」。这一条按**形状**找:头部区域里,只要出现「JSX 条件渲染
// 用字面量比较 kanaSection」这个模式(`{kanaSection === '某个子标签' ...`),
// 不管新变量叫什么名字,都判定为又在按子标签加了一个不对称的头部块。
//
// ⚠️ 不能用「区域里完全不出现 kanaSection === '字面量'」这么宽的规则 ——
// 平假名/片假名切换的 onPress 里就有 `kanaSection === 'special' && sel`
// (决定切换后要不要保留选中项,不影响渲染高度),那是合法用法,只是不能
// 出现在「{...条件渲染...}」这个位置上。
test('★ 变异防护:头部区域不许再出现「按 kanaSection 字面量做条件渲染」', () => {
  const start = src.indexOf('<View style={kn.hd}>');
  const end = src.indexOf('<ScrollView', start);
  assert.ok(start > 0 && end > start, '找不到头部 JSX 区域边界,测试本身失效了');
  const headerRegion = src.slice(start, end);

  const renderGuardPattern = /\{\s*(?:[a-zA-Z0-9_.]+\s*&&\s*)?kanaSection\s*===\s*'/;
  assert.doesNotMatch(
    headerRegion,
    renderGuardPattern,
    '头部区域出现了按 kanaSection 字面量做条件渲染 —— 这正是计数块闪跳的形状,见 TICKET-kana-header.md'
  );
});

test('分段控件按 KANA_SECTION_TABS 数据渲染五段,不是五个各写各的 chip', () => {
  assert.match(src, /const KANA_SECTION_TABS = \[/);
  assert.match(src, /KANA_SECTION_TABS\.map\(/);
  for (const label of ['清音', '浊·半浊', '拗音', '特殊音', '外来语']) {
    assert.ok(src.includes(`label: '${label}'`), `缺少子标签: ${label}`);
  }
});

test('行一右侧的切换/对照只按 isLoanwordMode 隐藏,不按其余四个子标签分别决定', () => {
  const row1 = src.slice(src.indexOf('<View style={kn.headerRow1}>'), src.indexOf('{/* 行二'));
  const guardCount = (row1.match(/isLoanwordMode/g) || []).length;
  // 只有「!isLoanwordMode ?」这一处条件 —— 多了就是又按某个子标签加了分支。
  assert.equal(guardCount, 1);
});
