#!/usr/bin/env node
/** 只读来源审计 CLI：唯一可写目标是 staging/source-audit。 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const STAGING = resolve(ROOT, 'staging/source-audit');
const core = await import(pathToFileURL(resolve(ROOT, 'src/lib/sourceAudit.ts')).href);

function args(argv) {
  const [command, ...rest] = argv;
  const out = { command };
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i]?.startsWith('--') || !rest[i + 1]) throw new Error('参数必须是 --name value');
    out[rest[i].slice(2)] = rest[i + 1];
  }
  return out;
}
function json(file) { return JSON.parse(readFileSync(resolve(ROOT, file), 'utf8')); }
function sha(file) { return createHash('sha256').update(readFileSync(resolve(ROOT, file))).digest('hex'); }
function onlyStaging(file) {
  const target = resolve(ROOT, file);
  if (relative(STAGING, target).startsWith('..')) throw new Error('输出只能写入 staging/source-audit');
  return target;
}
function atomicJson(file, value) {
  const target = onlyStaging(file);
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temp, target);
}
function registryOptions() {
  return {
    exists: file => existsSync(resolve(ROOT, file)),
    artifactInfo: file => {
      const target = resolve(ROOT, file);
      if (!existsSync(target)) return null;
      return { bytes: statSync(target).size, sha256: sha(file) };
    },
  };
}
function validate(input, includeRun = true, requireEligibleEvidence = false) {
  const registryResult = core.validateRegistry(json(input.registry), registryOptions());
  if (!registryResult.ok || !registryResult.value) throw new Error(registryResult.errors.join('\n'));
  const claimsResult = core.validateClaims(json(input.claims), registryResult.value.registry);
  if (!claimsResult.ok || !claimsResult.value) throw new Error(claimsResult.errors.join('\n'));
  const evidenceResult = core.validateEvidence(json(input.evidence), claimsResult.value, registryResult.value.registry, registryResult.value.eligibility);
  if (!evidenceResult.ok || !evidenceResult.value) throw new Error(evidenceResult.errors.join('\n'));
  if (includeRun && input.run) {
    const run = json(input.run);
    const runResult = core.validateRunManifest(run, registryResult.value.registry);
    if (!runResult.ok) throw new Error(runResult.errors.join('\n'));
    for (const key of ['registry', 'claims', 'evidence']) if (run.inputs?.[key] !== sha(input[key])) throw new Error(`run.inputs.${key}: SHA mismatch`);
    if (run.scriptContentSha256 !== sha('scripts/source-audit.mjs')) throw new Error('run.scriptContentSha256: SHA mismatch');
  }
  if (requireEligibleEvidence) {
    const used = new Set(evidenceResult.value.map(e => e.sourceId));
    for (const sourceId of used) if (registryResult.value.eligibility.get(sourceId) !== 'eligible') throw new Error(`source ${sourceId}: eligibility ${registryResult.value.eligibility.get(sourceId)}`);
  }
  return { registry: registryResult.value, claims: claimsResult.value, evidence: evidenceResult.value };
}
function required(input, names) { for (const name of names) if (!input[name]) throw new Error(`缺少 --${name}`); }

try {
  const input = args(process.argv.slice(2));
  if (input.command === 'validate') {
    required(input, ['registry', 'claims', 'evidence', 'run']);
    const checked = validate(input, true, true);
    console.log(`通过：${checked.claims.length} claims，${checked.evidence.length} evidence`);
  } else if (input.command === 'summarize') {
    required(input, ['registry', 'claims', 'evidence', 'run', 'out']);
    const checked = validate(input, true, true);
    const states = Object.fromEntries(checked.claims.map(claim => [claim.claimId, core.resolveClaim(claim, checked.evidence, checked.registry.registry, checked.registry.eligibility)]));
    atomicJson(input.out, { schemaVersion: 1, generatedBy: 'source-audit', inputs: { registry: sha(input.registry), claims: sha(input.claims), evidence: sha(input.evidence) }, states });
    console.log(`已写 ${input.out}`);
  } else if (input.command === 'export-claims') {
    required(input, ['registry', 'claims', 'out']);
    const registryResult = core.validateRegistry(json(input.registry), registryOptions());
    if (!registryResult.ok || !registryResult.value) throw new Error(registryResult.errors.join('\n'));
    const claimsResult = core.validateClaims(json(input.claims), registryResult.value.registry);
    if (!claimsResult.ok || !claimsResult.value) throw new Error(claimsResult.errors.join('\n'));
    atomicJson(input.out, { schemaVersion: 1, kind: 'external-review-package', claims: claimsResult.value });
    console.log(`已写 ${input.out}`);
  } else if (input.command === 'import-evidence') {
    required(input, ['input', 'claims', 'registry', 'out']);
    const registryResult = core.validateRegistry(json(input.registry), registryOptions());
    if (!registryResult.ok || !registryResult.value) throw new Error(registryResult.errors.join('\n'));
    const claimsResult = core.validateClaims(json(input.claims), registryResult.value.registry);
    if (!claimsResult.ok || !claimsResult.value) throw new Error(claimsResult.errors.join('\n'));
    const evidenceResult = core.validateEvidence(json(input.input), claimsResult.value, registryResult.value.registry, registryResult.value.eligibility);
    if (!evidenceResult.ok) throw new Error(evidenceResult.errors.join('\n'));
    atomicJson(input.out, json(input.input));
    console.log(`已写 ${input.out}`);
  } else {
    throw new Error('命令只允许 validate / summarize / export-claims / import-evidence');
  }
} catch (error) {
  console.error(`source-audit: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
