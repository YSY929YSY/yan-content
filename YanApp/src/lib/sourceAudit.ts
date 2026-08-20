/**
 * 来源审计的纯领域层。它不认识 App、publication 或内容包；只验证 staging
 * 中可追溯的来源、断言和证据，并把不合格输入留在候选/隔离状态。
 */

export type Eligibility = 'eligible' | 'research-only' | 'incomplete';
export type Resolution = 'candidate' | 'supported' | 'corroborated' | 'conflict';
type Obj = Record<string, unknown>;

export type Validation<T> = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  value?: T;
};

export type AuditSource = {
  sourceId: string;
  familyId: string;
  lineage: string[];
  role: string[];
  artifact: { kind: string; path: string; bytes: number; sha256: string };
  license: { name: string; url: string; noticePath: string };
  redistribution: string;
  retrievedAt?: string | null;
  relockedAt?: string;
  attribution: string;
};

export type SourceRegistry = { schemaVersion: 1; sources: AuditSource[] };
export type AuditClaim = {
  claimId: string;
  wordId: string;
  wordKey: string;
  field: string;
  claimType: string;
  proposed: Obj;
  policy: { minimumEvidence?: string; requiredRoles: string[]; independentFamilies: number };
  author?: { kind: string; id: string };
  status: string;
};
export type AuditEvidence = {
  evidenceId: string;
  claimId: string;
  sourceId: string;
  locator: { kind: string; value: string };
  relation: 'supports' | 'contradicts' | 'insufficient';
  observed: Obj;
  rights: { license: string | null; attribution: string | null; author?: string | null };
  method: string;
  producer: { kind: string; name: string; version: string };
  createdAt: string;
};

export type RegistryOptions = {
  exists?: (path: string) => boolean;
  artifactInfo?: (path: string) => { bytes: number; sha256: string } | null;
};

function isObj(value: unknown): value is Obj {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(text);
}
function timestamp(value: unknown): value is string {
  return text(value) && Number.isFinite(Date.parse(value));
}
function ownOnly(value: Obj, allowed: readonly string[], path: string, errors: string[]) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${path}.${key}: unexpected property`);
}
function result<T>(errors: string[], warnings: string[], value?: T): Validation<T> {
  return { ok: errors.length === 0, errors, warnings, ...(value ? { value } : {}) };
}
function sourceEligibility(source: AuditSource, options: RegistryOptions): Eligibility {
  if (source.redistribution === 'research-only') return 'research-only';
  const hasTime = text(source.retrievedAt) || text(source.relockedAt);
  if (!hasTime || !text(source.attribution) || !text(source.license.noticePath) || !options.exists || !options.artifactInfo) return 'incomplete';
  if (!options.exists(source.license.noticePath)) return 'incomplete';
  const actual = options.artifactInfo(source.artifact.path);
  if (!actual || actual.bytes !== source.artifact.bytes || actual.sha256 !== source.artifact.sha256) return 'incomplete';
  return 'eligible';
}

export function validateRegistry(value: unknown, options: RegistryOptions = {}): Validation<{ registry: SourceRegistry; eligibility: Map<string, Eligibility> }> {
  const errors: string[] = [], warnings: string[] = [];
  if (!isObj(value)) return result(['$: expected object'], warnings);
  if (value.schemaVersion !== 1) errors.push('$.schemaVersion: expected 1');
  if (!Array.isArray(value.sources)) errors.push('$.sources: expected array');
  if (errors.length) return result(errors, warnings);
  const sources: AuditSource[] = [];
  const ids = new Set<string>();
  for (const [i, raw] of (value.sources as unknown[]).entries()) {
    const p = `$.sources[${i}]`;
    if (!isObj(raw)) { errors.push(`${p}: expected object`); continue; }
    for (const key of ['sourceId', 'familyId', 'title', 'role', 'canonicalUrl', 'version', 'artifact', 'license', 'redistribution', 'attribution', 'lineage']) {
      if (!(key in raw)) errors.push(`${p}.${key}: required`);
    }
    if (!text(raw.sourceId) || !text(raw.familyId) || !text(raw.title) || !text(raw.canonicalUrl) || !text(raw.version) || !text(raw.redistribution) || !text(raw.attribution)) errors.push(`${p}: required text invalid`);
    if (!stringArray(raw.lineage) || raw.lineage.length === 0) errors.push(`${p}.lineage: expected non-empty string array`);
    else if (raw.familyId !== raw.lineage[0]) errors.push(`${p}.familyId: must equal lineage root`);
    if (!stringArray(raw.role)) errors.push(`${p}.role: expected non-empty string array`);
    if (!isObj(raw.artifact) || !text(raw.artifact.kind) || !text(raw.artifact.path) || !Number.isSafeInteger(raw.artifact.bytes) || (raw.artifact.bytes as number) < 0 || !/^[a-f0-9]{64}$/i.test(String(raw.artifact.sha256 || ''))) errors.push(`${p}.artifact: invalid`);
    if (!isObj(raw.license) || !text(raw.license.name) || !text(raw.license.url) || !text(raw.license.noticePath)) errors.push(`${p}.license: invalid`);
    if ('retrievedAt' in raw && raw.retrievedAt !== null && !timestamp(raw.retrievedAt)) errors.push(`${p}.retrievedAt: expected ISO text or null`);
    if ('relockedAt' in raw && !timestamp(raw.relockedAt)) errors.push(`${p}.relockedAt: expected ISO text`);
    if (text(raw.sourceId) && ids.has(raw.sourceId)) errors.push(`${p}.sourceId: duplicate`);
    if (text(raw.sourceId)) ids.add(raw.sourceId);
    if (errors.some(e => e.startsWith(p))) continue;
    sources.push(raw as unknown as AuditSource);
  }
  const registry: SourceRegistry = { schemaVersion: 1, sources };
  const eligibility = new Map(sources.map(s => [s.sourceId, sourceEligibility(s, options)]));
  for (const [id, state] of eligibility) if (state !== 'eligible') warnings.push(`${id}: eligibility ${state}`);
  return result(errors, warnings, { registry, eligibility });
}

const FIELDS = new Set(['identity', 'reading', 'pos', 'sense_boundary', 'meaning_zh', 'example', 'usage', 'loanSource', 'pitch', 'target_span']);
const CLAIM_KEYS = ['claimId', 'wordId', 'wordKey', 'field', 'claimType', 'proposed', 'policy', 'author', 'status'] as const;
export function validateClaims(value: unknown, registry: SourceRegistry): Validation<AuditClaim[]> {
  const errors: string[] = [], warnings: string[] = [];
  if (!isObj(value) || value.schemaVersion !== 1 || !Array.isArray(value.claims)) return result(['$: expected v1 claims object'], warnings);
  const claims: AuditClaim[] = [], ids = new Set<string>();
  for (const [i, raw] of value.claims.entries()) {
    const p = `$.claims[${i}]`;
    if (!isObj(raw)) { errors.push(`${p}: expected object`); continue; }
    ownOnly(raw, CLAIM_KEYS, p, errors);
    if (!text(raw.claimId) || !text(raw.wordId) || !text(raw.wordKey) || !text(raw.field) || !text(raw.claimType) || !isObj(raw.proposed) || !isObj(raw.policy) || !text(raw.status)) { errors.push(`${p}: required claim fields invalid`); continue; }
    if (!FIELDS.has(raw.field)) errors.push(`${p}.field: unsupported`);
    if (!stringArray(raw.policy.requiredRoles) || !Number.isInteger(raw.policy.independentFamilies) || (raw.policy.independentFamilies as number) < 0) errors.push(`${p}.policy: invalid`);
    const needsAuthor = raw.claimType.startsWith('editorial_') || raw.claimType === 'authored_example';
    if (needsAuthor && (!isObj(raw.author) || !text(raw.author.kind) || !text(raw.author.id))) errors.push(`${p}.author: required for editorial claim`);
    if (ids.has(raw.claimId)) errors.push(`${p}.claimId: duplicate`);
    ids.add(raw.claimId);
    if (errors.some(e => e.startsWith(p))) continue;
    claims.push(raw as unknown as AuditClaim);
  }
  if (registry.sources.length === 0) warnings.push('registry has no sources');
  return result(errors, warnings, claims);
}

const EVIDENCE_KEYS = ['schemaVersion', 'evidenceId', 'claimId', 'sourceId', 'locator', 'relation', 'observed', 'rights', 'method', 'producer', 'createdAt'] as const;
export function validateEvidence(value: unknown, claims: AuditClaim[], registry: SourceRegistry, eligibility: Map<string, Eligibility>): Validation<AuditEvidence[]> {
  const errors: string[] = [], warnings: string[] = [];
  if (!isObj(value) || value.schemaVersion !== 1 || !Array.isArray(value.evidence)) return result(['$: expected v1 evidence object'], warnings);
  const byClaim = new Map(claims.map(c => [c.claimId, c]));
  const bySource = new Map(registry.sources.map(s => [s.sourceId, s]));
  const entries: AuditEvidence[] = [];
  for (const [i, raw] of value.evidence.entries()) {
    const p = `$.evidence[${i}]`;
    if (!isObj(raw)) { errors.push(`${p}: expected object`); continue; }
    ownOnly(raw, EVIDENCE_KEYS, p, errors);
    const claim = text(raw.claimId) ? byClaim.get(raw.claimId) : undefined;
    const source = text(raw.sourceId) ? bySource.get(raw.sourceId) : undefined;
    if (!text(raw.evidenceId) || !claim || !source) errors.push(`${p}: unknown claim/source or missing id`);
    if (!isObj(raw.locator) || !text(raw.locator.kind) || !text(raw.locator.value)) errors.push(`${p}.locator: required`);
    if (!['supports', 'contradicts', 'insufficient'].includes(String(raw.relation))) errors.push(`${p}.relation: invalid`);
    const rights = isObj(raw.rights) ? raw.rights : null;
    if (!rights || !('license' in rights) || !('attribution' in rights)) errors.push(`${p}.rights: invalid`);
    if (!isObj(raw.producer) || !text(raw.producer.kind) || !text(raw.producer.name) || !text(raw.producer.version)) errors.push(`${p}.producer: invalid`);
    if (!timestamp(raw.createdAt)) errors.push(`${p}.createdAt: expected ISO text`);
    if (claim?.claimType === 'corpus_example' && (!text(rights?.license) || !text(rights?.attribution) || !text(rights?.author))) errors.push(`${p}.rights: corpus evidence requires license, attribution, author`);
    if (claim && source && !claim.policy.requiredRoles.some(role => source.role.includes(role))) errors.push(`${p}.sourceId: role cannot support claim`);
    if (source && eligibility.get(source.sourceId) !== 'eligible') warnings.push(`${p}: source is ${eligibility.get(source.sourceId)}`);
    if (errors.some(e => e.startsWith(p))) continue;
    entries.push(raw as unknown as AuditEvidence);
  }
  return result(errors, warnings, entries);
}

export function resolveClaim(claim: AuditClaim, evidence: AuditEvidence[], registry: SourceRegistry, eligibility: Map<string, Eligibility>): { status: Resolution; supportFamilies: number; diagnostics: string[]; publication: null } {
  const sources = new Map(registry.sources.map(s => [s.sourceId, s]));
  const usable = evidence.filter(e => e.claimId === claim.claimId && eligibility.get(e.sourceId) === 'eligible' && sources.get(e.sourceId)?.role.some(r => claim.policy.requiredRoles.includes(r)));
  const unusableCounterevidence = evidence.filter(e => e.claimId === claim.claimId && e.relation === 'contradicts' && !usable.includes(e));
  const diagnostics = unusableCounterevidence.map(e => `unusable contradiction: ${e.evidenceId}`);
  if (usable.some(e => e.relation === 'contradicts')) return { status: 'conflict', supportFamilies: 0, diagnostics, publication: null };
  const families = new Set(usable.filter(e => e.relation === 'supports').map(e => sources.get(e.sourceId)!.familyId));
  const count = families.size;
  if (count === 0) return { status: 'candidate', supportFamilies: 0, diagnostics, publication: null };
  if (claim.policy.independentFamilies >= 2) {
    if (count < claim.policy.independentFamilies || diagnostics.length) return { status: 'candidate', supportFamilies: count, diagnostics, publication: null };
    return { status: 'corroborated', supportFamilies: count, diagnostics, publication: null };
  }
  return { status: 'supported', supportFamilies: count, diagnostics, publication: null };
}

export function validateRunManifest(value: unknown, registry: SourceRegistry): Validation<Obj> {
  const errors: string[] = [], warnings: string[] = [];
  if (!isObj(value)) return result(['$: expected run manifest object'], warnings);
  for (const key of ['schemaVersion', 'runId', 'executedAt', 'baseCommit', 'scriptContentSha256', 'nodeVersion', 'inputs', 'sourceArtifacts', 'reportPath']) if (!(key in value)) errors.push(`$.${key}: required`);
  if (value.schemaVersion !== 1 || !text(value.runId) || !timestamp(value.executedAt) || !text(value.baseCommit) || !/^[a-f0-9]{64}$/i.test(String(value.scriptContentSha256 || '')) || !text(value.nodeVersion) || !isObj(value.inputs) || !isObj(value.sourceArtifacts) || !text(value.reportPath)) errors.push('$: invalid run manifest');
  if (isObj(value.inputs)) for (const key of ['registry', 'claims', 'evidence']) if (!/^[a-f0-9]{64}$/i.test(String(value.inputs[key] || ''))) errors.push(`$.inputs.${key}: expected SHA-256`);
  for (const source of registry.sources) if (isObj(value.sourceArtifacts) && value.sourceArtifacts[source.sourceId] !== source.artifact.sha256) errors.push(`$.sourceArtifacts.${source.sourceId}: SHA mismatch`);
  return result(errors, warnings, value);
}
