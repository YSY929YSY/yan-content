// P2-1 只调整既有完整例句的阅读层级；用接线测试守住数据与评分边界。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = readFileSync(resolve(import.meta.dirname, '../../../App.js'), 'utf8');
const detailStart = app.indexOf('function WBDetailPage(');
const detailEnd = app.indexOf('const wd = StyleSheet.create', detailStart);
const detail = app.slice(detailStart, detailEnd);

test('★★ 词条主例句只接受完整且有逐词注音的数据', () => {
  assert.ok(detailStart >= 0 && detailEnd > detailStart, '测试必须准确截取 WBDetailPage');
  assert.match(
    detail,
    /const hasPrimaryExample = hasCompleteExample\(entry\) && !!EXAMPLE_TOKENS\[entry\.id\];/,
    '主例句不可由单一日文句子或猜测的读音放行',
  );
  assert.match(detail, /\) : \(\s*<Text style=\{wd\.contentNote\}>暂无例句<\/Text>/,
    '没有完整例句时必须明确告知，而不是留出一块无解释的空白');
});

test('★★ 主例句在释义后、词场前，按日文→罗马音→中文阅读', () => {
  const meaning = detail.indexOf('style={wd.meaningBlock}');
  const primary = detail.indexOf('style={wd.primaryExample}');
  const wordFields = detail.indexOf('{fieldRenderData.map');
  assert.ok(meaning >= 0 && primary > meaning && wordFields > primary,
    '主例句须处于词义与补充词场之间');

  const block = detail.slice(primary, wordFields);
  const jp = block.indexOf('<ExampleSentence sentence={entry.exampleJp} tokens={EXAMPLE_TOKENS[entry.id]}');
  const roma = block.indexOf('style={wd.primaryExampleRoma}');
  const zh = block.indexOf('style={wd.primaryExampleZh}');
  assert.ok(jp >= 0 && roma > jp && zh > roma,
    '不可把中文/罗马音放在日文主句之前');
});

test('★★ 无释义 coreChunk 不伪装成常用搭配，原评分/只读边界不变', () => {
  assert.doesNotMatch(detail, /entry\.coreChunk/, 'P2-1 不展示没有释义与来源的裸搭配');
  assert.doesNotMatch(detail, />搭配</, '不能以“搭配”给裸短语补出不存在的语义');
  assert.match(detail, /\{onGrade \? <View style=\{wd\.section\}>/, '评分仍只由 onGrade 放行');
  assert.match(detail, /<View style=\{wd\.readonlyBox\}>/, '无评分权时仍须展示只读态');
});
