import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { validateRegistry, validateClaims, validateEvidence, validateRunManifest, resolveClaim } from '../sourceAudit.ts';

const SHA = 'a'.repeat(64);
const source = (overrides: Record<string, unknown> = {}) => ({
  sourceId: 'dict:v1', familyId: 'family:dict', lineage: ['family:dict'], title: 'Dictionary', role: ['dictionary_identity'], canonicalUrl: 'https://example.test', version: 'v1',
  artifact: { kind: 'source-archive', path: 'source.tgz', bytes: 3, sha256: SHA },
  license: { name: 'CC BY-SA 4.0', url: 'https://example.test/license', noticePath: 'notice.md' }, redistribution: 'derived-data-with-attribution', relockedAt: '2026-08-20T00:00:00Z', attribution: 'Example', ...overrides,
});
const registryOf = (sources = [source()]) => ({ schemaVersion: 1, sources });
const claim = (overrides: Record<string, unknown> = {}) => ({ claimId: 'c1', wordId: 'n3_aizu', wordKey: '合図\tあいず', field: 'identity', claimType: 'dictionary_fact', proposed: {}, policy: { requiredRoles: ['dictionary_identity'], independentFamilies: 0 }, status: 'candidate', ...overrides });
const claimsOf = (claims = [claim()]) => ({ schemaVersion: 1, claims });
const evidence = (overrides: Record<string, unknown> = {}) => ({ schemaVersion: 1, evidenceId: 'e1', claimId: 'c1', sourceId: 'dict:v1', locator: { kind: 'entry', value: '1284930' }, relation: 'supports', observed: {}, rights: { license: 'CC BY-SA 4.0', attribution: null }, method: 'join', producer: { kind: 'script', name: 'test', version: '1' }, createdAt: '2026-08-20T00:00:00Z', ...overrides });
const opts = { exists: (p: string) => p === 'notice.md', artifactInfo: (p: string) => p === 'source.tgz' ? { bytes: 3, sha256: SHA } : null };

test('★★ eligible 必须有完整 artifact、时间/重锁、notice；research-only 与 incomplete 不贡献通过', () => {
  const valid = validateRegistry(registryOf(), opts); assert.equal(valid.ok, true); assert.equal(valid.value!.eligibility.get('dict:v1'), 'eligible');
  assert.equal(validateRegistry(registryOf()).value!.eligibility.get('dict:v1'), 'incomplete');
  const incomplete = validateRegistry(registryOf(), { ...opts, exists: () => false }); assert.equal(incomplete.value!.eligibility.get('dict:v1'), 'incomplete');
  const research = validateRegistry(registryOf([source({ redistribution: 'research-only' })]), opts); assert.equal(research.value!.eligibility.get('dict:v1'), 'research-only');
});

test('lineage 是来源独立性的可执行下限：根不一致/空根拒绝，同 root 不能凑双源', () => {
  assert.equal(validateRegistry(registryOf([source({ familyId: 'wrong' })]), opts).ok, false);
  assert.equal(validateRegistry(registryOf([source({ lineage: [] })]), opts).ok, false);
  const reg = validateRegistry(registryOf([source(), source({ sourceId: 'fork:v1', lineage: ['family:dict', 'fork:v1'] })]), opts).value!;
  const cs = validateClaims(claimsOf([claim({ policy: { requiredRoles: ['dictionary_identity'], independentFamilies: 2 } })]), reg.registry).value!;
  const ev = validateEvidence({ schemaVersion: 1, evidence: [evidence(), evidence({ evidenceId: 'e2', sourceId: 'fork:v1' })] }, cs, reg.registry, reg.eligibility).value!;
  assert.equal(resolveClaim(cs[0]!, ev, reg.registry, reg.eligibility).status, 'candidate');
});

test('编辑责任、额外字段与 publication 指令都 fail closed', () => {
  const reg = validateRegistry(registryOf(), opts).value!;
  assert.equal(validateClaims(claimsOf([claim({ claimType: 'editorial_translation' })]), reg.registry).ok, false);
  const cs = validateClaims(claimsOf(), reg.registry).value!;
  assert.equal(validateClaims(claimsOf([claim({ publication: { learning: true } })]), reg.registry).ok, false);
  assert.equal(validateEvidence({ schemaVersion: 1, evidence: [evidence({ publication: { learning: true } })] }, cs, reg.registry, reg.eligibility).ok, false);
  assert.equal(validateEvidence({ schemaVersion: 1, evidence: [evidence({ extra: true })] }, cs, reg.registry, reg.eligibility).ok, false);
});

test('冲突优先；模型数不增加来源数；不产生 publication 建议', () => {
  const reg = validateRegistry(registryOf([source(), source({ sourceId: 'second:v1', familyId: 'family:second', lineage: ['family:second'] })]), opts).value!;
  const cs = validateClaims(claimsOf([claim({ policy: { requiredRoles: ['dictionary_identity'], independentFamilies: 2 } })]), reg.registry).value!;
  const ev = validateEvidence({ schemaVersion: 1, evidence: [evidence({ producer: { kind: 'model', name: 'gpt', version: '1' } }), evidence({ evidenceId: 'e2', producer: { kind: 'model', name: 'gemini', version: '1' } }), evidence({ evidenceId: 'e3', sourceId: 'second:v1', relation: 'contradicts' })] }, cs, reg.registry, reg.eligibility).value!;
  assert.deepEqual(resolveClaim(cs[0]!, ev, reg.registry, reg.eligibility), { status: 'conflict', supportFamilies: 0, diagnostics: [], publication: null });
});

test('不合格反证不伪装成有效冲突，但必须诊断且阻止双源晋级', () => {
  const reg = validateRegistry(registryOf([
    source(),
    source({ sourceId: 'second:v1', familyId: 'family:second', lineage: ['family:second'] }),
    source({ sourceId: 'research:v1', familyId: 'family:research', lineage: ['family:research'], redistribution: 'research-only' }),
  ]), opts).value!;
  const cs = validateClaims(claimsOf([claim({ policy: { requiredRoles: ['dictionary_identity'], independentFamilies: 2 } })]), reg.registry).value!;
  const ev = validateEvidence({ schemaVersion: 1, evidence: [
    evidence(), evidence({ evidenceId: 'e2', sourceId: 'second:v1' }),
    evidence({ evidenceId: 'e3', sourceId: 'research:v1', relation: 'contradicts' }),
  ] }, cs, reg.registry, reg.eligibility).value!;
  assert.deepEqual(resolveClaim(cs[0]!, ev, reg.registry, reg.eligibility), {
    status: 'candidate', supportFamilies: 2, diagnostics: ['unusable contradiction: e3'], publication: null,
  });
});

test('corpus 证据缺作者、许可或 attribution 一律隔离', () => {
  const reg = validateRegistry(registryOf([source({ role: ['corpus'] })]), opts).value!;
  const cs = validateClaims(claimsOf([claim({ claimType: 'corpus_example', field: 'example', policy: { requiredRoles: ['corpus'], independentFamilies: 0 } })]), reg.registry).value!;
  assert.equal(validateEvidence({ schemaVersion: 1, evidence: [evidence({ rights: { license: null, attribution: null } })] }, cs, reg.registry, reg.eligibility).ok, false);
});

test('run manifest 必须锁输入 SHA 与 source artifact SHA', () => {
  const reg = validateRegistry(registryOf(), opts).value!;
  const run = { schemaVersion: 1, runId: 'r', executedAt: '2026-08-20', baseCommit: 'base', scriptContentSha256: SHA, nodeVersion: 'v24', inputs: { registry: SHA, claims: SHA, evidence: SHA }, sourceArtifacts: { 'dict:v1': SHA }, reportPath: 'staging/source-audit/reports/r.json' };
  assert.equal(validateRunManifest(run, reg.registry).ok, true);
  assert.equal(validateRunManifest({ ...run, sourceArtifacts: { 'dict:v1': 'b'.repeat(64) } }, reg.registry).ok, false);
});

test('真实 JMdict 历史重锁：归档 SHA、字节、noticePath 三者都必须对上', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const registry = JSON.parse(readFileSync(resolve(root, 'staging/source-audit/sources.v1.json'), 'utf8'));
  const checked = validateRegistry(registry, {
    exists: file => existsSync(resolve(root, file)),
    artifactInfo: file => {
      if (!existsSync(resolve(root, file))) return null;
      const data = readFileSync(resolve(root, file));
      return { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
    },
  });
  assert.equal(checked.ok, true);
  assert.equal(checked.value!.eligibility.get('jmdict-simplified:3.6.2+20260803141815'), existsSync(resolve(root, 'staging/jmdict-eng.json.tgz')) ? 'eligible' : 'incomplete');
});

test('CLI 拒绝把审核包写到 staging/source-audit 之外', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const output = spawnSync(process.execPath, ['scripts/source-audit.mjs', 'export-claims', '--registry', 'staging/source-audit/sources.v1.json', '--claims', 'staging/source-audit/claims/jmdict-aizu.v1.json', '--out', 'assets/must-not-write.json'], { cwd: root, encoding: 'utf8' });
  assert.equal(output.status, 1);
  assert.match(output.stderr, /输出只能写入 staging\/source-audit/);
  assert.equal(existsSync(resolve(root, 'assets/must-not-write.json')), false);
});

test('CLI 拒绝输入正确但脚本 SHA 已漂移的 run manifest', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const temp = mkdtempSync(join(tmpdir(), 'yan-source-audit-'));
  try {
    const run = JSON.parse(readFileSync(resolve(root, 'staging/source-audit/runs/jmdict-aizu-relock-20260820.json'), 'utf8'));
    run.scriptContentSha256 = '0'.repeat(64);
    const runPath = join(temp, 'stale-run.json');
    writeFileSync(runPath, JSON.stringify(run));
    const output = spawnSync(process.execPath, ['scripts/source-audit.mjs', 'validate', '--registry', 'staging/source-audit/sources.v1.json', '--claims', 'staging/source-audit/claims/jmdict-aizu.v1.json', '--evidence', 'staging/source-audit/evidence/jmdict-aizu.v1.json', '--run', runPath], { cwd: root, encoding: 'utf8' });
    assert.equal(output.status, 1);
    assert.match(output.stderr, /(run\.scriptContentSha256|sourceArtifacts).*SHA mismatch/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
