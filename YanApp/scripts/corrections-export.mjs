#!/usr/bin/env node
// 读取本机导出的纠错 JSONL，只汇总到 stdout，不修改输入文件。
import fs from 'node:fs';
import path from 'node:path';

const inputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(process.cwd(), 'yan_corrections_v1.jsonl');

if (!fs.existsSync(inputPath)) {
  console.error(`找不到纠错记录：${inputPath}`);
  process.exitCode = 1;
} else {
  const byKind = {};
  const byWordId = {};
  let total = 0;
  let invalid = 0;

  const text = fs.readFileSync(inputPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      invalid += 1;
      continue;
    }
    if (!row || typeof row !== 'object' || !row.kind || !row.wordId) {
      invalid += 1;
      continue;
    }
    total += 1;
    byKind[row.kind] = (byKind[row.kind] || 0) + 1;
    byWordId[row.wordId] = (byWordId[row.wordId] || 0) + 1;
  }

  console.log(JSON.stringify({ total, byKind, byWordId, invalid }, null, 2));
}
