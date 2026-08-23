#!/usr/bin/env node

// 发布前只读 harness：调用已有审计，补用户文案、内容包同步和硬不变量检查。
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const APP_ROOT = resolve(import.meta.dirname, '..');
const REPO_ROOT = resolve(APP_ROOT, '..');
const FALLBACK = resolve(APP_ROOT, 'assets/content.fallback.json');
const AUTHORITY = resolve(REPO_ROOT, 'yan-content/content.v2.json');
const EXPECTED_KANJI_ANCHOR_TOTAL = 563;
const EXPECTED_WORD_BANK_TOTAL = 8005;
const failures = [];
const warnings = [];

function line(status, message) { console.log(`${status} ${message}`); }
function fail(message) { failures.push(message); line('FAIL', message); }
function warn(message) { warnings.push(message); line('WARN', message); }
function pass(message) { line('PASS', message); }

function runReadOnlyStep(label, command, args) {
  const result = spawnSync(command, args, { cwd: APP_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    failures.push(`${label} exited ${result.status ?? 'with error'}`);
    line('FAIL', `${label} exit status ${result.status ?? 'error'}`);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  } else pass(`${label} (exit 0)`);
}

function sha256(file) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }

function stripComments(source) {
  let out = ''; let state = 'code'; let quote = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]; const next = source[i + 1];
    if (state === 'line') { if (ch === '\n') { state = 'code'; out += ch; } else out += ' '; continue; }
    if (state === 'block') { if (ch === '*' && next === '/') { state = 'code'; out += '  '; i += 1; } else out += ch === '\n' ? '\n' : ' '; continue; }
    if (state === 'string') { out += ch; if (ch === '\\') { out += source[++i] || ''; continue; } if (ch === quote) state = 'code'; continue; }
    if (ch === '/' && next === '/') { state = 'line'; out += '  '; i += 1; continue; }
    if (ch === '/' && next === '*') { state = 'block'; out += '  '; i += 1; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { state = 'string'; quote = ch; }
    out += ch;
  }
  return out;
}

function sourceFiles() {
  const result = [resolve(APP_ROOT, 'App.js')];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const file = resolve(dir, entry); const info = statSync(file);
      if (info.isDirectory()) walk(file);
      else if (/\.(js|jsx|ts|tsx)$/.test(entry)) result.push(file);
    }
  };
  walk(resolve(APP_ROOT, 'src/features'));
  return result;
}

function sourceLine(source, index) { return source.slice(0, index).split('\n').length; }

function userClaimScan() {
  const internal = /candidate|draft|zh_drafted|verified|human_reviewed|候选/;
  const claim = /高频|官方|必考|已核验/;
  const findings = [];
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8'); const clean = stripComments(source); const visible = [];
    for (const match of clean.matchAll(/>\s*([^<>{}\n][^<>{}]*)\s*</g)) visible.push({ text: match[1].trim(), index: match.index });
    for (const match of clean.matchAll(/(?:title|placeholder|accessibilityLabel|label|text)=(["'])(.*?)\1/g)) visible.push({ text: match[2], index: match.index });
    for (const match of clean.matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)) {
      const text = match[2].replace(/\\([\\'"`])/g, '$1');
      if (claim.test(text)) visible.push({ text, index: match.index });
    }
    for (const item of visible) {
      if (!item.text || (!internal.test(item.text) && !claim.test(item.text))) continue;
      const lineNumber = sourceLine(source, item.index ?? 0);
      const context = clean.slice(Math.max(0, (item.index ?? 0) - 180), (item.index ?? 0) + item.text.length + 180);
      const location = `${relative(APP_ROOT, file)}:${lineNumber}`;
      if (internal.test(item.text)) findings.push({ status: 'FAIL', message: `user-claims ${location}: internal status text "${item.text}"` });
      else if (/词库|词书|wordBank|WORDBOOKS|学习分级|可学习/.test(context)) findings.push({ status: 'FAIL', message: `user-claims ${location}: unsupported word-bank claim "${item.text}"` });
      else findings.push({ status: 'WARN', message: `user-claims ${location}: review editorial claim "${item.text}"` });
    }
  }
  const unique = [...new Map(findings.map(item => [item.status + item.message, item])).values()];
  for (const item of unique) item.status === 'FAIL' ? fail(item.message) : warn(item.message);
  if (!unique.length) pass('user-claims');
}

function contentPackChecks() {
  const fallbackHash = sha256(FALLBACK); const authorityHash = sha256(AUTHORITY);
  if (fallbackHash === authorityHash) pass(`content-pack-sync sha256 ${fallbackHash}`);
  else fail(`content-pack-sync sha256 differs fallback=${fallbackHash} authority=${authorityHash}`);
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'diff', '--quiet', 'HEAD', '--', 'yan-content/content.v2.json'], { stdio: 'ignore' });
    pass('content-pack-sync authority content.v2.json has no uncommitted change');
  } catch { fail('content-pack-sync authority content.v2.json has uncommitted change'); }
  try {
    const previous = execFileSync('git', ['-C', REPO_ROOT, 'show', 'HEAD^:yan-content/content.v2.json'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const currentPack = readJson(AUTHORITY); const previousPack = JSON.parse(previous);
    const previousHash = createHash('sha256').update(previous).digest('hex');
    if (sha256(AUTHORITY) !== previousHash && previousPack?._meta?.version === currentPack?._meta?.version) warn(`content-pack-sync _meta.version unchanged while content changed (${currentPack?._meta?.version || 'missing'})`);
    else pass('content-pack-sync version/content comparison');
  } catch (error) { warn(`content-pack-sync version/content comparison unavailable: ${error.message}`); }
}

function invariantChecks() {
  const content = readJson(FALLBACK); const words = Array.isArray(content.wordBank) ? content.wordBank : [];
  const anchors = words.filter(word => (word?.yanFeatures || []).includes('kanji_anchor'));
  if (anchors.length === EXPECTED_KANJI_ANCHOR_TOTAL) pass(`invariant kanji_anchor.total=${anchors.length}`);
  else fail(`invariant kanji_anchor.total=${anchors.length}, expected ${EXPECTED_KANJI_ANCHOR_TOTAL}`);
  const noteCount = Number(String(content._meta?.note || '').match(/词库\s*(\d+)\s*条/)?.[1]);
  if (words.length === EXPECTED_WORD_BANK_TOTAL && noteCount === words.length) pass(`invariant wordBank.total=${words.length}; _meta.note=${noteCount}`);
  else fail(`invariant wordBank/_meta.note wordBank=${words.length}, note=${Number.isFinite(noteCount) ? noteCount : 'unparsed'}, expected ${EXPECTED_WORD_BANK_TOTAL} and equality`);
  pass(`metric publication.learning=${words.filter(word => word?.publication?.learning === true).length} (not asserted)`);
}

console.log('audit: read-only harness');
runReadOnlyStep('content-stats', process.execPath, ['scripts/content-stats.mjs']);
runReadOnlyStep('validate-content', process.execPath, ['scripts/validate-content.js', '../yan-content/content.v2.json']);
runReadOnlyStep('meaning-audit', process.execPath, ['scripts/meaning-audit.mjs']);
userClaimScan(); contentPackChecks(); invariantChecks();
console.log('--- audit summary ---'); console.log(`FAIL: ${failures.length}`); console.log(`WARN: ${warnings.length}`); console.log(failures.length ? 'Result: FAIL' : 'Result: PASS');
process.exit(failures.length ? 1 : 0);
