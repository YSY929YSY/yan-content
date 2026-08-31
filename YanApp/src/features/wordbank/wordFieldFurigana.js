// 词场句的整句读音是运行时派生数据，不写入内容包。

import { alignFurigana, primaryReading } from './furigana.ts';
import { buildWordFieldAlignment } from './wordFieldAlignment.js';

// 与 furigana.ts 的 NEEDS_RUBY 保持同一字符边界；这里仅判断是否需要查读音，
// 不做任何新的读音转换规则。
const NEEDS_RUBY = /[一-龯㐀-䶿々ヶ]/u;
const READING_SEP = /[;；]/u;

const readingsOf = (value) => String(value || '')
  .split(READING_SEP)
  .map((reading) => reading.trim())
  .filter(Boolean);

/** 例句 token 的 surface → 已有读音。冲突读音全部保留，交给调用方 fail closed。 */
export function surfaceReadingsFrom(exampleTokens) {
  const out = new Map();
  if (!exampleTokens || typeof exampleTokens !== 'object' || Array.isArray(exampleTokens)) return out;

  for (const tokens of Object.values(exampleTokens)) {
    for (const token of Array.isArray(tokens) ? tokens : []) {
      if (!Array.isArray(token) || typeof token[0] !== 'string' || !token[0]
        || typeof token[1] !== 'string' || !token[1]) continue;
      const readings = out.get(token[0]) || new Set();
      for (const reading of readingsOf(token[1])) readings.add(reading);
      out.set(token[0], readings);
    }
  }
  return out;
}

/** 词库 word → 读音，按内容包建立一次，避免每个 token 线性扫描整本词库。 */
export function surfaceReadingsFromWordBank(wordBank) {
  const out = new Map();
  for (const word of Array.isArray(wordBank) ? wordBank : []) {
    if (!word?.word) continue;
    const readings = out.get(word.word) || new Set();
    for (const reading of readingsOf(word.reading)) readings.add(reading);
    out.set(word.word, readings);
  }
  return out;
}

const readingsForSurface = (surface, wordBankSurfaceReadings, exampleSurfaceReadings) => {
  const out = new Set();
  for (const reading of wordBankSurfaceReadings?.get(surface) || []) out.add(reading);
  for (const reading of exampleSurfaceReadings?.get(surface) || []) out.add(reading);
  return out;
};

/**
 * 逐 token 派生整句读音。
 *
 * 只有两类输入可以不查词库直接保留：标点，以及本来就是假名/片假名的 token。
 * 含汉字的 token 必须拿到唯一读音，且必须通过 alignFurigana；否则整句返回 null。
 */
export function deriveWordFieldReadingDetailsFromTokens(
  tokens,
  wordBankSurfaceReadings,
  exampleSurfaceReadings,
) {
  const safeTokens = Array.isArray(tokens) ? tokens : [];
  if (!safeTokens.length) return { status: 'none', reading: null, missing: [], tokens: safeTokens };

  const parts = [];
  const missing = [];
  for (const token of safeTokens) {
    const surface = String(token?.jp || '');
    if (!surface || !NEEDS_RUBY.test(surface)) {
      parts.push(surface);
      continue;
    }

    const readings = readingsForSurface(surface, wordBankSurfaceReadings, exampleSurfaceReadings);
    if (readings.size !== 1) {
      missing.push({ surface, source: token.source, readings: [...readings] });
      parts.push('');
      continue;
    }

    const reading = [...readings][0];
    if (!alignFurigana(surface, reading)) {
      missing.push({ surface, source: token.source, readings: [primaryReading(reading)] });
      parts.push('');
      continue;
    }
    parts.push(primaryReading(reading));
  }

  const status = missing.length === 0
    ? 'full'
    : missing.length === safeTokens.length ? 'none' : 'partial';
  return {
    status,
    reading: status === 'full' ? parts.join('') : null,
    missing,
    tokens: safeTokens,
  };
}

export function deriveWordFieldReadingDetails(
  sentence,
  wordBank,
  dictionaryForms,
  exampleSurfaceReadings,
  wordBankSurfaceReadings = surfaceReadingsFromWordBank(wordBank),
) {
  const text = String(sentence || '');
  if (!text) return { status: 'none', reading: null, missing: [], tokens: [] };
  return deriveWordFieldReadingDetailsFromTokens(
    buildWordFieldAlignment(text, wordBank, dictionaryForms),
    wordBankSurfaceReadings,
    exampleSurfaceReadings,
  );
}

export function deriveWordFieldReading(
  sentence,
  wordBank,
  dictionaryForms,
  exampleSurfaceReadings,
  wordBankSurfaceReadings,
) {
  return deriveWordFieldReadingDetails(
    sentence,
    wordBank,
    dictionaryForms,
    exampleSurfaceReadings,
    wordBankSurfaceReadings,
  ).reading;
}
