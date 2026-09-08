/**
 * CFG-01 §5.4A config integrity — seal-hash computation (pure, DB-free) and the DB-backed
 * readiness check that recomputes each sealed scope's hash and compares it against the active
 * `cfg1.config_integrity_seal` row.
 *
 * Allow-list discipline (not an arbitrary row dump): each scope's hash binds an EXPLICIT field
 * list, matching `infra/migrations/014_cfg1_core.cjs`'s seed-time computation exactly. Excludes
 * mutable/runtime-only columns (`created_at_utc`, `updated_at_utc`, `last_integrity_check_utc`)
 * so a readiness call — which is read-only and cannot write these columns anyway under
 * `role_cfg1_runtime`'s SELECT-only grant — could never invalidate its own seal even if it
 * someday could write them.
 *
 * Rows are sorted by their own stable business key before hashing so the result is reproducible
 * regardless of the table's physical row order.
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Sql } from "@aix/foundation";
import { query } from "@aix/foundation";
import { canonicalJson, codePointCompare, sha256Prefixed } from "./canonical.js";
import { DOC00_LICENCE_PROFILES, DOC00_PROHIBITED_FEATURES, DOC00_SOURCE_VERSION, computeDoc00BaselineHash } from "./doc00-baseline.js";

export interface LicenceProfileSealRow {
  licence_profile_id: string;
  licence_code: string;
  licence_status: string;
  authority: string;
  evidence_ref: string | null;
  evidence_authenticity_status: string;
  version: number;
  status: string;
}

export interface ProhibitedFeatureSealRow {
  prohibited_feature_id: string;
  feature_code: string;
  prohibition_reason: string;
  prohibition_source: string;
  applies_until: string;
  status: string;
  version: number;
}

export interface ActiveSealRow {
  config_scope: string;
  config_hash: string;
}

export function computeLicenceProfileScopeHash(rows: readonly LicenceProfileSealRow[]): string {
  // Phase 2 F-1 closure: codepoint order, not locale order — see canonical.ts's
  // codePointCompare header comment.
  const ordered = [...rows].sort((a, b) => codePointCompare(a.licence_code, b.licence_code));
  return sha256Prefixed(
    canonicalJson(
      ordered.map((r) => ({
        licence_profile_id: r.licence_profile_id,
        licence_code: r.licence_code,
        licence_status: r.licence_status,
        authority: r.authority,
        evidence_ref: r.evidence_ref ?? null,
        evidence_authenticity_status: r.evidence_authenticity_status,
        version: r.version,
        status: r.status,
      })),
    ),
  );
}

export function computeProhibitedRegistryScopeHash(rows: readonly ProhibitedFeatureSealRow[]): string {
  // Phase 2 F-1 closure: codepoint order, not locale order — see canonical.ts's
  // codePointCompare header comment.
  const ordered = [...rows].sort((a, b) => codePointCompare(a.feature_code, b.feature_code));
  return sha256Prefixed(
    canonicalJson(
      ordered.map((r) => ({
        prohibited_feature_id: r.prohibited_feature_id,
        feature_code: r.feature_code,
        prohibition_reason: r.prohibition_reason,
        prohibition_source: r.prohibition_source,
        applies_until: r.applies_until,
        status: r.status,
        version: r.version,
      })),
    ),
  );
}

export interface FeatureSealRow {
  feature_id: string;
  feature_code: string;
  feature_name: string;
  current_state: string;
  licence_profile_id: string | null;
  version: number;
}

/**
 * Phase 3A addition — the same allow-list-hash discipline as the two Phase 1 scope-hash
 * functions above, applied to `cfg1.feature`. `config_integrity_seal.config_scope`'s CHECK
 * constraint already allowed `'feature'` from Phase 1 (`014_cfg1_core.cjs`), but no seal row for
 * it was ever seeded — `cfg1.feature` was empty until Phase 3A's mutation workflow could create
 * rows. `resealScope` below is what actually populates the first `feature`-scope seal.
 */
export function computeFeatureScopeHash(rows: readonly FeatureSealRow[]): string {
  const ordered = [...rows].sort((a, b) => codePointCompare(a.feature_code, b.feature_code));
  return sha256Prefixed(
    canonicalJson(
      ordered.map((r) => ({
        feature_id: r.feature_id,
        feature_code: r.feature_code,
        feature_name: r.feature_name,
        current_state: r.current_state,
        licence_profile_id: r.licence_profile_id ?? null,
        version: r.version,
      })),
    ),
  );
}

export type SealScope = "licence_profile" | "prohibited_registry";
export type SealCheckReason = "ok" | "seal_missing" | "seal_duplicate_active" | "hash_mismatch";

export interface SealCheckResult {
  scope: SealScope;
  status: "pass" | "fail";
  reason: SealCheckReason;
}

/**
 * Pure comparison — given a freshly-computed scope hash and the set of currently-active seal
 * rows (any scope), decide pass/fail for ONE scope. Structurally cannot pass on a missing seal
 * (empty match) or a duplicate active seal (>1 match) — both fail closed, never picking "the
 * first one" and silently succeeding. The DB's own partial unique index
 * (`cfg1_config_integrity_seal_one_active_per_scope`) should make the duplicate case
 * unreachable in practice; this check is deliberate defense-in-depth per blueprint §5.4A rule 6
 * ("migration/DBA/infra writes must not become trusted until reconciled"), not an assumption
 * that the constraint can never be bypassed by a superuser-level out-of-band write.
 */
export function evaluateScopeSeal(
  scope: SealScope,
  computedHash: string,
  activeSeals: readonly ActiveSealRow[],
): SealCheckResult {
  const matching = activeSeals.filter((s) => s.config_scope === scope);
  if (matching.length === 0) return { scope, status: "fail", reason: "seal_missing" };
  if (matching.length > 1) return { scope, status: "fail", reason: "seal_duplicate_active" };
  if (matching[0]!.config_hash !== computedHash) return { scope, status: "fail", reason: "hash_mismatch" };
  return { scope, status: "pass", reason: "ok" };
}

/**
 * DB-backed check for both sealed scopes. Read-only (three SELECTs) — safe under
 * `role_cfg1_runtime`'s SELECT-only Phase 1 grant. Callers (the readiness route) are
 * responsible for catching connection-level failures separately and reporting them as a
 * `db_unavailable` condition — this function assumes `sql` is already a live connection.
 */
export async function checkConfigIntegritySeals(sql: Sql): Promise<SealCheckResult[]> {
  const licenceRows = await query<LicenceProfileSealRow>(
    sql,
    `SELECT licence_profile_id, licence_code, licence_status, authority, evidence_ref, evidence_authenticity_status, version, status
     FROM cfg1.licence_profile`,
  );
  const prohibitedRows = await query<ProhibitedFeatureSealRow>(
    sql,
    `SELECT prohibited_feature_id, feature_code, prohibition_reason, prohibition_source, applies_until, status, version
     FROM cfg1.prohibited_feature`,
  );
  const activeSeals = await query<ActiveSealRow>(
    sql,
    `SELECT config_scope, config_hash FROM cfg1.config_integrity_seal WHERE status = 'active'`,
  );

  return [
    evaluateScopeSeal("licence_profile", computeLicenceProfileScopeHash(licenceRows), activeSeals),
    evaluateScopeSeal("prohibited_registry", computeProhibitedRegistryScopeHash(prohibitedRows), activeSeals),
  ];
}

// =============================================================================================
// Phase 2 F-2 closure — decision-time DB-to-vendored-Doc00 agreement check.
// =============================================================================================
//
// `checkConfigIntegritySeals` above (Phase 1, still used by GET /internal/cfg1/readiness,
// UNCHANGED by this phase) proves DB-to-seal internal consistency: the live rows hash to
// whatever the active seal CLAIMS. That is exactly the limitation Phase 1 documented as
// accepted: a DB-write-capable actor who tampers the registry rows AND recomputes+rewrites the
// seal's own config_hash to match would sail through that check undetected.
//
// `verifyDecisionTimeIntegrity` below is a STRONGER, ADDITIONAL check used only by the
// evaluate() decision path (blueprint §5.4A rule 3: "scheduled reconciliation is not enough for
// prohibited/Exchange-sensitive decisions... integrity must be verified at decision time").
// It closes F-2 specifically: the "expected" side of its comparisons is the VENDORED
// `doc00-baseline.ts` constant, compiled into the running process — never read from the
// database at all. A DB-write-capable attacker who tampers both the registry rows and the
// seal's config_hash still cannot make this check pass, because nothing it compares against
// ever touches the tampered storage.
//
// Layered, in this order (first failure wins, fail closed):
//   1. checkConfigIntegritySeals's own two checks (seal_missing / seal_duplicate_active /
//      hash_mismatch) — unchanged, still the first line of defence.
//   2. The active seal's OWN doc00_baseline_hash must equal computeDoc00BaselineHash()
//      freshly recomputed from the vendored constant right now — not trusted from the stored
//      seal row without re-derivation.
//   3. The active seal's OWN doc00_source_version must equal DOC00_SOURCE_VERSION.
//   4. Direct, hash-free, field-by-field comparison: every DOC00_LICENCE_PROFILES fact must
//      match the live DB row for that licence_code exactly; every DOC00_PROHIBITED_FEATURES
//      code must have a live, active DB row. This is the step that defeats the "attacker
//      rewrites both data and seal" scenario — it never consults the seal at all.

export type DecisionIntegrityReason =
  | SealCheckReason
  | "doc00_baseline_hash_stale"
  | "doc00_source_version_stale"
  | "doc00_licence_fact_mismatch"
  | "doc00_prohibited_fact_missing";

export interface DecisionIntegrityScopeResult {
  scope: SealScope;
  status: "pass" | "fail";
  reason: DecisionIntegrityReason;
}

export interface DecisionTimeIntegrityResult {
  status: "verified" | "failed";
  scopes: DecisionIntegrityScopeResult[];
  /** Resolved seal metadata for binding into the decision log / decision token — null when the
   * corresponding scope's seal could not be resolved at all (missing/duplicate). */
  licenceProfileVersion: number | null;
  prohibitedRegistryVersion: number | null;
  prohibitedRegistryHash: string | null;
  doc00SourceVersion: string | null;
}

interface FullSealRow {
  config_scope: string;
  config_version: number;
  config_hash: string;
  doc00_baseline_hash: string;
  doc00_source_version: string;
}

function findSingleActiveSeal(seals: readonly FullSealRow[], scope: SealScope): { seal: FullSealRow | null; reason: SealCheckReason | null } {
  const matching = seals.filter((s) => s.config_scope === scope);
  if (matching.length === 0) return { seal: null, reason: "seal_missing" };
  if (matching.length > 1) return { seal: null, reason: "seal_duplicate_active" };
  return { seal: matching[0]!, reason: null };
}

export async function verifyDecisionTimeIntegrity(sql: Sql): Promise<DecisionTimeIntegrityResult> {
  const licenceRows = await query<LicenceProfileSealRow>(
    sql,
    `SELECT licence_profile_id, licence_code, licence_status, authority, evidence_ref, evidence_authenticity_status, version, status
     FROM cfg1.licence_profile`,
  );
  const prohibitedRows = await query<ProhibitedFeatureSealRow>(
    sql,
    `SELECT prohibited_feature_id, feature_code, prohibition_reason, prohibition_source, applies_until, status, version
     FROM cfg1.prohibited_feature`,
  );
  const seals = await query<FullSealRow>(
    sql,
    `SELECT config_scope, config_version, config_hash, doc00_baseline_hash, doc00_source_version
     FROM cfg1.config_integrity_seal WHERE status = 'active'`,
  );

  const expectedDoc00Hash = computeDoc00BaselineHash();

  // Steps 1-3 for one scope: seal resolution -> DB-to-seal hash -> seal-to-vendored-Doc00-hash
  // -> seal-to-vendored-Doc00-version. Returns the resolved seal (for version/hash metadata)
  // alongside the first failure found, if any — step 4 (below) is scope-specific and runs
  // separately so each scope ends with EXACTLY ONE verdict, never two competing entries.
  function checkSealLayer(
    scope: SealScope,
    computedScopeHash: string,
  ): { seal: FullSealRow | null; failure: DecisionIntegrityReason | null } {
    const { seal, reason } = findSingleActiveSeal(seals, scope);
    if (!seal) return { seal: null, failure: reason! };
    if (seal.config_hash !== computedScopeHash) return { seal, failure: "hash_mismatch" };
    if (seal.doc00_baseline_hash !== expectedDoc00Hash) return { seal, failure: "doc00_baseline_hash_stale" };
    if (seal.doc00_source_version !== DOC00_SOURCE_VERSION) return { seal, failure: "doc00_source_version_stale" };
    return { seal, failure: null };
  }

  const licenceLayer = checkSealLayer("licence_profile", computeLicenceProfileScopeHash(licenceRows));
  const prohibitedLayer = checkSealLayer("prohibited_registry", computeProhibitedRegistryScopeHash(prohibitedRows));

  // Step 4 — the defeat-both-data-and-seal check: compare LIVE DB ROWS directly against the
  // VENDORED constant, never via a hash and never via the (already-tampered, in the attack
  // scenario this closes) seal row. Evaluated regardless of steps 1-3's outcome for that scope,
  // because a hash/seal-level pass does NOT imply the underlying facts are actually correct —
  // that is exactly the gap this step closes. A scope's FINAL verdict is the first failure
  // found across steps 1-4, seal-layer failures taking precedence since they're checked first.
  const licenceByCode = new Map(licenceRows.map((r) => [r.licence_code, r]));
  let licenceFactFailure: DecisionIntegrityReason | null = null;
  for (const fact of DOC00_LICENCE_PROFILES) {
    const row = licenceByCode.get(fact.licence_code);
    if (!row || row.licence_status !== fact.licence_status) {
      licenceFactFailure = "doc00_licence_fact_mismatch";
      break;
    }
  }

  const activeProhibitedCodes = new Set(prohibitedRows.filter((r) => r.status === "active").map((r) => r.feature_code));
  let prohibitedFactFailure: DecisionIntegrityReason | null = null;
  for (const fact of DOC00_PROHIBITED_FEATURES) {
    if (!activeProhibitedCodes.has(fact.feature_code)) {
      prohibitedFactFailure = "doc00_prohibited_fact_missing";
      break;
    }
  }

  const licenceReason = licenceLayer.failure ?? licenceFactFailure;
  const prohibitedReason = prohibitedLayer.failure ?? prohibitedFactFailure;

  const scopes: DecisionIntegrityScopeResult[] = [
    { scope: "licence_profile", status: licenceReason ? "fail" : "pass", reason: licenceReason ?? "ok" },
    { scope: "prohibited_registry", status: prohibitedReason ? "fail" : "pass", reason: prohibitedReason ?? "ok" },
  ];

  const allPass = scopes.every((s) => s.status === "pass");

  return {
    status: allPass ? "verified" : "failed",
    scopes,
    licenceProfileVersion: licenceLayer.seal?.config_version ?? null,
    prohibitedRegistryVersion: prohibitedLayer.seal?.config_version ?? null,
    prohibitedRegistryHash: prohibitedLayer.seal?.config_hash ?? null,
    doc00SourceVersion: allPass ? DOC00_SOURCE_VERSION : null,
  };
}

// =============================================================================================
// Phase 3A — reseal-after-mutation.
// =============================================================================================
//
// `resealScope` is CFG-01's ONLY write path onto `cfg1.config_integrity_seal`. It is called by
// `routes/feature-changes.ts`/`routes/licence-changes.ts` at the end of a successful mutation
// APPLY, on the SAME transaction as the state write and the audit publish (approved Phase 3A
// scope item 8) — a reseal that ran in its own separate transaction could leave the state change
// committed with a stale/missing seal if the reseal step then failed, which would make the seal
// actively WRONG rather than merely absent (worse than Phase 1's "detection-only, not yet built"
// starting point). Never deletes a superseded seal row — `status = 'superseded'`, kept forever,
// same append-only-audit-trail posture as `feature_decision_log`.
//
// Scope note: 'prohibited_registry' is deliberately NOT resealable through this function —
// approved decisions #5/#6/#7: no route ever mutates `cfg1.prohibited_feature`, so there is
// nothing for a prohibited-registry reseal to legitimately respond to this phase. Restricting
// the type below to the two scopes Phase 3A actually mutates is a compile-time guarantee, not
// just a runtime check, that this function can never be called for that scope.
//
// Real-signing carry-forward (approved decision #10, unchanged): `signed_by`/`signature_ref`
// remain NULL on every row this function inserts — this stays a detection-only interim sha256
// seal, never a real cryptographic signature.

export type ResealableScope = "licence_profile" | "feature";

export interface ResealScopeResult {
  sealId: string;
  scope: ResealableScope;
  previousVersion: number | null;
  newVersion: number;
  newHash: string;
}

interface ActiveSealForUpdateRow {
  config_integrity_seal_id: string;
  config_version: number;
}

/**
 * Recomputes `scope`'s hash from the LIVE rows in the same transaction as the caller's own
 * mutation (so the reseal reflects exactly what was just committed), locks any existing active
 * seal row for that scope (`FOR UPDATE`, preventing a concurrent reseal of the same scope from
 * racing this one), inserts a new active seal at `previousVersion + 1` (or `1` if this is the
 * scope's first-ever seal — true for every 'feature' scope reseal until this function has run at
 * least once, since Phase 1 never seeded one), and supersedes the old row if one existed. Fails
 * closed (throws) if more than one active seal is somehow found for the scope — the same
 * defence-in-depth posture `evaluateScopeSeal`'s `seal_duplicate_active` case already documents;
 * the partial unique index should make this unreachable, but this function does not assume a
 * superuser-level out-of-band write could never bypass it.
 */
export async function resealScope(
  client: PoolClient,
  scope: ResealableScope,
  input: { approvalId?: string | null },
): Promise<ResealScopeResult> {
  const existing = await client.query<ActiveSealForUpdateRow>(
    `SELECT config_integrity_seal_id, config_version
       FROM cfg1.config_integrity_seal
      WHERE config_scope = $1 AND status = 'active'
      FOR UPDATE`,
    [scope],
  );
  if (existing.rows.length > 1) {
    throw new Error(`resealScope: more than one active seal found for scope '${scope}' — refusing to reseal`);
  }
  const previous = existing.rows[0] ?? null;

  let newHash: string;
  if (scope === "licence_profile") {
    const rows = await query<LicenceProfileSealRow>(
      client,
      `SELECT licence_profile_id, licence_code, licence_status, authority, evidence_ref, evidence_authenticity_status, version, status
         FROM cfg1.licence_profile`,
    );
    newHash = computeLicenceProfileScopeHash(rows);
  } else {
    const rows = await query<FeatureSealRow>(
      client,
      `SELECT feature_id, feature_code, feature_name, current_state, licence_profile_id, version
         FROM cfg1.feature`,
    );
    newHash = computeFeatureScopeHash(rows);
  }

  const newVersion = (previous?.config_version ?? 0) + 1;
  const sealId = "seal_" + randomUUID();
  const doc00Hash = computeDoc00BaselineHash();

  // Supersede the OLD row BEFORE inserting the new one — the partial unique index
  // (`cfg1_config_integrity_seal_one_active_per_scope`) allows at most one 'active' row per
  // scope at any instant, so inserting the new active row first (while the old one is still
  // 'active') would violate it. The row lock acquired by the earlier `FOR UPDATE` already
  // prevents a concurrent reseal of this scope from racing this reordering.
  if (previous) {
    await client.query(
      `UPDATE cfg1.config_integrity_seal SET status = 'superseded' WHERE config_integrity_seal_id = $1`,
      [previous.config_integrity_seal_id],
    );
  }

  await client.query(
    `INSERT INTO cfg1.config_integrity_seal
       (config_integrity_seal_id, config_scope, config_version, config_hash, doc00_baseline_hash, doc00_source_version,
        seal_method, signed_by, signature_ref, approval_id, status, created_at_utc)
     VALUES ($1,$2,$3,$4,$5,$6,'sha256',NULL,NULL,$7,'active', now())`,
    [sealId, scope, newVersion, newHash, doc00Hash, DOC00_SOURCE_VERSION, input.approvalId ?? null],
  );

  return { sealId, scope, previousVersion: previous?.config_version ?? null, newVersion, newHash };
}
