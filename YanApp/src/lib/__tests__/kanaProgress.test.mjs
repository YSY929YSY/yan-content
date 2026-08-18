// 五十音那道门的规则测试。
//
// 守的是主线的第一步:在这之前五十音页没有任何持久化,新用户
// 「先把五十音走完 → 走一圈 → 还是先把五十音走完」永远出不去。
// 这一层是那个出口,它错的样子有两种,方向相反:
//   · 该过没过 —— 用户被永久卡在门口
//   · 不该过过了 —— 零基础的人第一屏被甩六个汉字词
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  requiredKana, seenCount, isKanaDone, markSeen, declareKnown,
  normalizeKanaProgress, emptyKanaProgress,
} from '../../features/kana/kanaProgress.ts';

const seenAll = (keys) => ({ seen: Object.fromEntries(keys.map(k => [k, true])) });

// ── 判据取自哪里 ─────────────────────────────────────────────

test('★ 只要平假名 —— 片假名不是读词的前提,不该卡在主线起点', () => {
  const rows = [
    { chars: [{ kana: 'あ' }, { kana: 'い' }] },
    { chars: [{ kana: 'ア' }, { kana: 'イ' }] },
  ];
  assert.deepEqual(requiredKana(rows), ['あ', 'い']);
});

test('配对后的行也认 —— 片假名模式下 kana 是片假名,hira 才是平假名', () => {
  const rows = [{ chars: [{ kana: 'ア', hira: 'あ' }, { kana: 'イ', hira: 'い' }] }];
  assert.deepEqual(requiredKana(rows), ['あ', 'い']);
});

test('去重,而且内容包缺胳膊少腿时不炸', () => {
  assert.deepEqual(requiredKana([{ chars: [{ kana: 'あ' }, { kana: 'あ' }] }]), ['あ']);
  assert.deepEqual(requiredKana([{}, { chars: [] }, { chars: [{}] }]), []);
  assert.deepEqual(requiredKana(null), []);
  assert.deepEqual(requiredKana(undefined), []);
});

// ── 门开不开 ─────────────────────────────────────────────────

test('★ 全看过才算过 —— 差一个都不行', () => {
  const req = ['あ', 'い', 'う'];
  assert.equal(isKanaDone(seenAll(['あ', 'い', 'う']), req), true);
  assert.equal(isKanaDone(seenAll(['あ', 'い']), req), false);
  assert.equal(isKanaDone(emptyKanaProgress(), req), false);
});

test('★ 声明了就算过 —— 学过一点日语的人不该被迫点 46 下', () => {
  assert.equal(isKanaDone({ seen: {}, declared: true }, ['あ', 'い', 'う']), true);
});

test('★★ required 为空时绝不能算过 —— [].every() 是 true,这是个陷阱', () => {
  // 内容包没下发到、或者结构变了筛不出假名时,「五十音自动算过」会安静地成立,
  // 零基础的人第一屏直接被甩六个汉字词。**读不到当成空的,空的当成没问题** ——
  // 这个项目丢过四次数据都是这个形状。
  assert.equal(isKanaDone(seenAll(['あ']), []), false);
  assert.equal(isKanaDone(emptyKanaProgress(), []), false);
  // 但用户自己声明过的话仍然认:那是这时候唯一还可信的输入
  assert.equal(isKanaDone({ seen: {}, declared: true }, []), true);
});

test('没有进度也不能炸', () => {
  assert.equal(isKanaDone(null, ['あ']), false);
  assert.equal(isKanaDone(undefined, ['あ']), false);
});

test('看过的个数只数 required 里的 —— 看一百个片假名也推不动这道门', () => {
  const p = seenAll(['あ', 'ア', 'イ', 'ウ', 'エ']);
  assert.equal(seenCount(p, ['あ', 'い', 'う']), 1);
});

// ── 写 ───────────────────────────────────────────────────────

test('markSeen 不改原对象,重复记返回同一个引用', () => {
  const a = emptyKanaProgress();
  const b = markSeen(a, 'あ', '2026-08-18');
  assert.equal(a.seen['あ'], undefined, '原对象不能被改');
  assert.equal(b.seen['あ'], true);
  // 同一个引用 = 调用方可以据此跳过落盘。每点一次假名写一次盘没必要
  assert.equal(markSeen(b, 'あ', '2026-08-19'), b);
  assert.equal(markSeen(b, '', '2026-08-19'), b);
});

test('★ 声明「我会了」不连带把 seen 填满 —— 那是两件不同的事', () => {
  const p = declareKnown(emptyKanaProgress(), '2026-08-18');
  assert.equal(p.declared, true);
  // 字面量 0,不写 Object.keys(p.seen).length === 原来的长度:
  // 期望值取自被测对象的话,实现改成什么样它都绿
  assert.equal(Object.keys(p.seen).length, 0,
    '硬塞 seen 会让界面显示「46/46 看过」—— 那是一句用户没做过的事');
  // 已经声明过就返回同一个引用
  assert.equal(declareKnown(p, '2026-08-19'), p);
});

// ── 读盘整形 ─────────────────────────────────────────────────

test('★ 存盘里的东西什么形状都可能 —— 上个版本写的,以后还会再改一次', () => {
  assert.deepEqual(normalizeKanaProgress(null), { seen: {} });
  assert.deepEqual(normalizeKanaProgress('坏数据'), { seen: {} });
  assert.deepEqual(normalizeKanaProgress(42), { seen: {} });
  assert.deepEqual(normalizeKanaProgress({}), { seen: {} });
  assert.deepEqual(normalizeKanaProgress({ seen: '不是对象' }), { seen: {} });
  // declared 只认 true,不认 truthy —— 'false' 这个字符串是 truthy
  assert.equal(normalizeKanaProgress({ declared: 'false' }).declared, undefined);
  assert.equal(normalizeKanaProgress({ declared: 1 }).declared, undefined);
  assert.equal(normalizeKanaProgress({ declared: true }).declared, true);
});

// ── 真实内容包 ───────────────────────────────────────────────

test('★ 回归:真实内容包里筛出来的必须是 46 个平假名清音', () => {
  // ⚠️ 读真文件。上一轮的五次错全是「看了局部样本就当成全库」,
  // 而这一条要防的是另一件事:kanaRows 实测是 20 行 92 格
  // (平假名 46 + 片假名 46),按行名或按总数猜都会猜错。
  const url = new URL('../../../assets/content.fallback.json', import.meta.url);
  const content = JSON.parse(readFileSync(url, 'utf8'));
  const req = requiredKana(content.kanaRows);

  assert.equal(req.length, 46, `真实内容包筛出 ${req.length} 个,五十音清音是 46 个`);
  assert.ok(req.includes('あ') && req.includes('ん'), '头尾都得在');
  assert.equal(req.some(k => /[ァ-ヶ]/.test(k)), false, '不能混进片假名');

  // 而且这道门真的能被走完 —— 全点一遍就过
  assert.equal(isKanaDone(seenAll(req), req), true);
  assert.equal(isKanaDone(seenAll(req.slice(0, 45)), req), false);
});
