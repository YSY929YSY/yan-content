// scripts/generate-kana-strokes.js
// 自动从 KanjiVG GitHub raw 下载假名 SVG，并转换成 App 可用的 strokes JSON。
// 输出：data/kana-strokes.json

const fs = require('fs');
const path = require('path');
const { svgPathProperties } = require('svg-path-properties');

const OUT_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(OUT_DIR, 'kana-strokes.json');

// 先做あ行。后面你要扩展，只要继续加这里。
const KANA_LIST = [
  { key: 'a-hira', char: 'あ' },
  { key: 'i-hira', char: 'い' },
  { key: 'u-hira', char: 'う' },
  { key: 'e-hira', char: 'え' },
  { key: 'o-hira', char: 'お' },

  { key: 'a-kata', char: 'ア' },
  { key: 'i-kata', char: 'イ' },
  { key: 'u-kata', char: 'ウ' },
  { key: 'e-kata', char: 'エ' },
  { key: 'o-kata', char: 'オ' },
];

function codepointFileName(char) {
  // KanjiVG 文件名通常是 5 位小写 hex，例如 あ U+3042 -> 03042.svg
  const hex = char.codePointAt(0).toString(16).padStart(5, '0');
  return `${hex}.svg`;
}

function rawUrlForChar(char) {
  const file = codepointFileName(char);
  return `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${file}`;
}

function extractPathDs(svgText) {
  // KanjiVG 的笔画基本都在 <path ... d="..."> 里，顺序就是笔顺。
  // 这里保留所有 path 的 d。
  const paths = [];
  const regex = /<path\b[^>]*\sd="([^"]+)"[^>]*>/g;
  let match;

  while ((match = regex.exec(svgText)) !== null) {
    const d = match[1];

    // 防御：过滤空 path
    if (d && d.trim()) {
      paths.push(d.trim());
    }
  }

  return paths;
}

function getPathLength(d) {
  try {
    const props = new svgPathProperties(d);
    return Math.ceil(props.getTotalLength());
  } catch (err) {
    console.warn('无法计算 path 长度，使用兜底 len=120:', d);
    return 120;
  }
}

async function fetchSvg(char) {
  const url = rawUrlForChar(char);
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`下载失败：${char} ${url} status=${res.status}`);
  }

  return await res.text();
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const result = {};

  for (const item of KANA_LIST) {
    console.log(`Downloading ${item.char} -> ${item.key}`);

    const svgText = await fetchSvg(item.char);
    const ds = extractPathDs(svgText);

    if (!ds.length) {
      throw new Error(`没有提取到 path：${item.char}`);
    }

    result[item.key] = ds.map(d => ({
      d,
      len: getPathLength(d),
    }));

    console.log(`  strokes: ${result[item.key].length}`);
  }

  const banner = {
    _source: 'KanjiVG',
    _license: 'CC BY-SA 3.0',
    _note: 'Generated from KanjiVG SVG path data. Keep attribution in app About/Credits.',
    _viewBox: '0 0 109 109',
  };

  const output = {
    ...banner,
    strokes: result,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nDone: ${OUT_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});