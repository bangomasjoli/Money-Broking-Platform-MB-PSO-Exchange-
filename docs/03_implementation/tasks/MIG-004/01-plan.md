# 01 Plan — MIG-004: CFG-01 `environment_scope` and live decision-chain step 4

- **Task ID:** MIG-004
- **Risk:** CRITICAL. CFG-01 capability-control decision path; closes a HIGH trust-boundary finding.
- **Category:** Phase A capability-control plane (`DEC-013`)
- **Planner:** architecture/security/compliance planner / claude-opus-5-5 / HIGH
- **Selected implementer:** implementer / claude-opus-5-5 / HIGH. Reason: compliance-critical fail-closed decision logic plus a migration and grant change.
- **Baseline commit:** `6d2e4fe` (MIG-005 accepted at `5f78a0b`); plan drafted at `399ef7f`
- **Human approval:** **APPROVED FOR IMPLEMENTATION** (Aiman, 2026-09-25), subject to the corrections in this turn: HD-1…HD-4 decided (§14), decision-precedence corrected (§5, §7), reason code corrected (§8), feature-seal treatment corrected — unchanged in MIG-004, deferred to `CFG-FIND-002` (§10, §10A). **Implementation itself is NOT STARTED.**

## 1. Authoritative definition
- Doc 00 v1.5 §25.3: "CFG-01 `cfg1.feature.environment_scope` — add the column; make decision-chain step 4 live." STR-03 adds "populate it."
- Doc 00 §1.D: `ENVIRONMENT_AVAILABILITY` = per environment `ENABLED` / `DISABLED` / `NOT_APPLICABLE`, owned by CFG-01 environment scope.
- Binding rules:
  - Doc 00 §1.D rules 1–5 and §21A rules 1–5.
  - `SYS-RULE-007`, `007A`, `010`, `011`; `CFG-RULE-005`; `ENV-SRS-001`…`008`; `STATE-SRS-001`…`003`.
  - Role Matrix §3.8 rule 5.
- Carry-forwards this task must close: `CFG-FIND-001` (all of it) and the CFG-01 part of `FND-FIND-013`. MIG-005 `04-review.md` "MIG-004 gate" conditions 1–4.
- Doc 00 §25.2 also says "CFG-01 owns … `PRODUCTION_ACTIVATION_STATE` (`MIG-004`)". The §25.3 register row, STR-03 and §1.D's owner column all confine MIG-004 to state 2. This plan follows §25.3: **state 3 is not built here** (§8, HD-2, §14). The §25.2 wording itself is R-5, carried to governance cleanup G-1 (§17).

## 2. Architectural fact that shapes the design
Each deployment has its own CFG-01 database, and `ENVIRONMENT` is validated at bootstrap. A CFG-01 instance therefore evaluates **only the entry for its own canonical environment**. The five-entry map exists so one feature definition states availability everywhere without implying anything across environments (§1.D rule 3). A non-production row can never decide PRODUCTION, because a PRODUCTION CFG-01 reads only the `PRODUCTION` entry.

## 3. `environment_scope` representation (Q1)
**Keys are canonical uppercase environment names, and all five are always present. Values are the Doc 00 §1.D vocabulary.**

```json
{"DEVELOPMENT":"DISABLED","TEST":"DISABLED","UAT":"DISABLED","DEMO":"DISABLED","PRODUCTION":"DISABLED"}
```
Doc 00 §1.D worked example (build-unlocked, production-gated):
```json
{"DEVELOPMENT":"ENABLED","TEST":"ENABLED","UAT":"ENABLED","DEMO":"ENABLED","PRODUCTION":"DISABLED"}
```
A capability not meant to exist in demo:
```json
{"DEVELOPMENT":"ENABLED","TEST":"ENABLED","UAT":"ENABLED","DEMO":"NOT_APPLICABLE","PRODUCTION":"DISABLED"}
```
- **Why canonical names, not deployment identifiers:** the masters define availability per canonical environment. Deployment identifiers are six and include `staging`, which is not a capability-control environment. With canonical keys, a `STAGING` or `staging` entry is impossible by construction; `staging` reaches the `PRODUCTION` entry only through `canonicalEnvironment()` (Q10).
- **Rules:**
  - Exactly five keys: no wildcard, no default key, no inheritance.
  - Values are exact-case strings; no booleans and no nesting.
  - An extra or unknown key makes the whole object invalid (rejected by the DB CHECK, and denied at runtime).
  - Only `ENABLED` passes. `DISABLED` and `NOT_APPLICABLE` both deny, and differ only in meaning: "disabled" versus "not meant to exist in this environment".
- **Hashing:** `canonicalJson` (recursively key-sorted) makes the value deterministic for seals and snapshots.

## 4. Default and backfill (Q2)
| Case | Behaviour |
|---|---|
| A. existing `cfg1.feature` rows | `ADD COLUMN … NOT NULL DEFAULT` all-`DISABLED`; every existing row is backfilled DISABLED everywhere. **No row becomes more available.** |
| B. new rows (feature-changes apply) | Same DB default, all `DISABLED`; the runtime role cannot supply the column (§9) |
| C. absent column / key | Structurally impossible in DB (NOT NULL + CHECK); runtime parser → `environment_scope_invalid` → deny |
| D. NULL | Rejected by NOT NULL; runtime → deny |
| E. malformed JSON / non-object / array | Rejected by CHECK; runtime → deny |
| F. incomplete map | Rejected by CHECK (`?&` all five); runtime → deny |
| G. unknown state string | Rejected by CHECK; runtime → deny |
| H. unknown environment | CFG-01 cannot boot with an unknown `ENVIRONMENT` (`loadConfig`). Defensively, `canonicalEnvironment()` → PRODUCTION entry |

**Operational consequence (accepted by design):** after MIG-004 every feature denies in every environment until an entry is set `ENABLED`. MIG-004 ships no runtime write path (§9), so in DEVELOPMENT/TEST/UAT/DEMO any feature previously allowed through `current_state = 'enabled'` denies until the follow-on write path lands. This fails closed. No production deployment exists.

## 5. CFG-FIND-001 closure: trust boundary (Q3)
1. The route reads `own = app.config.environment`, validated at startup by `loadConfig`, and derives `canonical = canonicalEnvironment(own)`.
2. `environment` stays **required** on both routes (wire-compatible with CLT-01, the only caller) but is demoted to an **asserted routing-consistency field**. Its schema is the foundation `ENVIRONMENTS` union (§6), so unknown identifiers are a 400 schema failure as today.
3. **`evaluate`:** if `body.environment !== own` →
   - a `deny` decision with reason_code **`environment_mismatch`** (HTTP 200 decision envelope, like every ordinary deny; the CLT-01 client already fails closed on deny);
   - **a decision-log row is written** with `environment = own` (the authoritative value, never the asserted one);
   - one additional audit event **`cfg1.feature_decision.environment_mismatch`**, severity **critical**, metadata `{decision_id, environment: own, canonical_environment, asserted_environment}`;
   - **never a token**: only `allow` mints, and migration 015's `decision IN ('allow')` CHECK makes it structural.
   **Ordering (corrected — see §7):** this check runs **after** step 1 (prohibited registry + the HD-4 structural `exchange.` deny), not before it. A prohibited or `exchange.`-shaped feature code denies as `prohibited` even when the caller also asserts a mismatched environment — permanent-prohibition attribution must never be displaced by a lower-precedence deny. Where the implementation can do so without weakening the single-transaction audit guarantee, an environment-mismatch audit event MAY still be emitted alongside the prohibited decision (informational, not the decision's own reason code); it must never be emitted *instead of* the prohibited decision or audit.
4. **`verify-decision`:**
   - Binding uses `own`, not the body. A mismatched assertion → revoke with `revoked_reason = 'environment_mismatch'` and `CFG1_DECISION_BINDING_MISMATCH` (409, existing code). The existing `cfg1.feature_decision.rejected` audit carries `reason_code: environment_mismatch`.
   - `row.environment !== own` is also a binding mismatch, so a token issued under one environment never verifies under another CFG-01 environment.
5. `computeDecisionPayloadHash`, the decision log, token issuance and verification all use `own`. The caller value is used **only** for the equality check and the audit metadata.
6. No new error code is needed. The existing `CFG1_DECISION_BINDING_MISMATCH` is the right attribution for verify; evaluate reports a decision reason, not an error.
7. **Reason-code column widths (verified against `reason_code varchar(32)` / `revoked_reason varchar(32)`, migrations 014/015):** `environment_mismatch` (20), `environment_scope_invalid` (25), `environment_not_available` (25), `environment_unavailable` (23), `production_activation_absent` (28, §8) — all fit. `production_activation_unrepresented` (35) does **not** fit and is replaced throughout by `production_activation_absent` (§8, HD-2).

## 6. FND-FIND-013, CFG-01 part (Q4)
`routes/features.ts` deletes its local `ENVIRONMENTS` constant and builds `EnvironmentSchema` from `@aix/foundation`'s `ENVIRONMENTS`. `demo` is accepted and no environment vocabulary is duplicated. The `ENVIRONMENT_AVAILABILITY` vocabulary is CFG-01-owned (Doc 00 §1.D) and lives in a new `services/cfg1/src/lib/environment-availability.ts`, **not** the foundation; the MIG-005 test asserting the foundation exports no availability helper stays green. **No WLT-01 change**; the WLT-01 part of FND-FIND-013 stays open.

## 7. Step 4 algorithm (Q5)
```
readEnvironmentAvailability(scope: unknown, canonical: CanonicalEnvironment)
  → "ENABLED" | "DISABLED" | "NOT_APPLICABLE" | "INVALID"
  INVALID unless: scope is a plain non-null, non-array object; its own-key set equals exactly
  CANONICAL_ENVIRONMENTS; every value is one of the three exact strings.
  The WHOLE object is validated, not just the key read: a malformed row denies everywhere.

step 4 (after the feature row is found, before step 10 stale and step 8 state):
  a = readEnvironmentAvailability(row.environment_scope, canonicalEnvironment(own))
  a === "INVALID"  → deny "environment_scope_invalid"
  a !== "ENABLED"  → deny "environment_not_available"
  otherwise continue
```
**Never** `!isProductionGated(...)`. Availability is only the explicit `ENABLED` entry for the authoritative canonical environment. Reason codes fit `reason_code varchar(32)`, which has no CHECK, so no schema change is needed.

**Resulting order in code (corrected):** integrity verification → **step 1 prohibited registry / structural `exchange.` deny (HD-4)** → **caller-environment mismatch check (§5)** → step 6 kill switch → feature lookup (unknown → step 12 deny) → **step 4 environment** → step 10 stale → step 8 `current_state` → **production hold (HD-2)** → allow. Permanent prohibition keeps primary denial attribution and is checked before any environment logic, including the mismatch check, so a permanently prohibited request with a mismatched environment still denies as `prohibited` (§5 point 3). All remaining steps deny, so their order only affects which reason is reported once prohibition and mismatch are cleared.

## 8. `current_state` semantics and four-state separation (Q6, Q11)
- **Proposed meaning (HD-1):** `current_state` keeps its existing mechanics: the deployment-local governed feature state, changed only through the feature-changes maker-checker, and evaluated in **every** environment. In the four-state model it is the **"product activation"** conjunct of Doc 00 §21A rule 2 and Role Matrix §3.7. It is **not** `ENVIRONMENT_AVAILABILITY` (now `environment_scope`) and **not** `PRODUCTION_ACTIVATION_STATE`.
  - This does not collide with §1.D rule 1 or `STATE-SRS-001`: they govern a single field *named `enabled`*, and `current_state` is a four-valued enum.
  - It is still an interpretation the masters do not state, so HD-1 needs your approval.
- **Separation result:** state 2 and product activation become two independent columns, read by two independent steps, and both must pass. Neither is derived from the other.
- **DEVELOPMENT ENABLED / PRODUCTION DISABLED: feasible.**
  - Dev deployment: `current_state = 'enabled'` in the dev DB and `DEVELOPMENT = ENABLED` → allow.
  - Production deployment: `PRODUCTION = DISABLED` → deny `environment_not_available`, whatever the production `current_state` says.
  - **Limitation:** MIG-004 ships no runtime writer for `environment_scope`, so outside tests (superuser fixtures) this state cannot yet be set. See §9.
- **PRODUCTION_ACTIVATION_STATE (state 3) is not faithfully representable in the current schema.** No five-valued state exists, and the `CFG-RULE-004` activation path (three checkers, §21 evidence) does not exist.
  - Today state 3 is only partly carried by the prohibited registry (`PROHIBITED_PERMANENT`; `exchange_pending_locked` ≈ `DISABLED_PENDING_REGULATORY_ACTIVATION`) and the kill switch (≈ `DISABLED_BY_POLICY`), which matches §1.D's owner column.
  - **HD-2 (recommended):** under `SYS-RULE-010` an absent state denies, so in canonical PRODUCTION (`prod` and `staging`) a request that passes every other step is **denied with `production_activation_absent`** (28 characters — fits `reason_code varchar(32)`; the originally proposed `production_activation_unrepresented` was 35 characters and did not) until a later migration builds state 3.
  - Impact today is zero, because no production deployment exists. The consequence: any production or staging `allow`, including MB baseline, needs that later migration.
  - **MIG-004 does not make any capability production-ready**, and does not claim to.

## 9. Write path (Q8)
- **Mutating `environment_scope` is OUT OF SCOPE for MIG-004.** No route, workflow or IAM-02 permission is added.
- **Grants:** replace `GRANT INSERT ON cfg1.feature` with a column-scoped `GRANT INSERT (feature_id, feature_code, feature_name, current_state, licence_profile_id, version, created_at_utc, updated_at_utc)`, preceded by `REVOKE INSERT`. The `UPDATE (current_state, version, updated_at_utc)` grant is unchanged. `role_cfg1_runtime` therefore **cannot set or change `environment_scope` at all**; new rows get the all-DISABLED default. Regression tests prove 42501 on both.
- **Initial population:** the migration default only. Test fixtures set it as superuser in the test DB only, which creates no production management path.
- **Constraint on the follow-on write-path task:** a non-production entry change is a `CFG-RULE-005` governed, maker-checker act and must bump `cfg1.feature.version`. A `PRODUCTION` entry change is a production-activation-grade act (`CFG-RULE-004`), not reachable by the ordinary feature-change approval.

## 10. Integrity, versioning, tokens (Q7)
| Mechanism | MIG-004 treatment |
|---|---|
| Feature scope seal hash | **UNCHANGED IN MIG-004.** `computeFeatureScopeHash`'s allow-list is **not** extended to `environment_scope`. Extending it now, without simultaneously resealing every existing active `feature`-scope seal, would make any current active seal stale the instant migration 071 backfills the column — a self-inflicted `CFG1_CONFIG_INTEGRITY_FAILED` across the whole platform. Seal-hash inclusion is deferred to `CFG-FIND-002` (§10A), which designs the inclusion together with its reseal migration |
| Decision-time seal verification | **Pre-existing gap, unchanged by MIG-004:** the `feature` seal is written by `resealScope` but **never verified** (`verifyDecisionTimeIntegrity` checks `licence_profile` and `prohibited_registry` only). Registered as `CFG-FIND-002` (§10A); closed as a separate control task, not inside MIG-004 |
| `feature_version.state_snapshot` | Snapshot becomes `{current_state, environment_scope}` (read from the row in the same transaction). This is independent of the seal-hash question above — the version-history snapshot is not the integrity seal |
| Decision payload hash | Unchanged shape; `environment` = authoritative own identifier |
| Token binding | Unchanged columns; `environment` = own; verify compares against own (§5) |
| Stale-version invalidation | Unchanged (`feature_config_version`); the follow-on write path must bump version (§9) |
| Fresh re-check at verify | **Added, in MIG-004:** verify-decision re-reads the feature's `environment_scope` for its own canonical environment, like the kill switch. Anything other than `ENABLED` → revoke `environment_unavailable` + `CFG1_DECISION_BINDING_MISMATCH`. This invalidates outstanding tokens even after an out-of-band change that did not bump the version, and is what keeps tokens honest **while the seal itself stays unextended** |

### 10A. `CFG-FIND-002` — feature-scope seal does not cover `environment_scope`; decision-time seal verification does not exist
- **Root cause (one finding, not several):** `cfg1.config_integrity_seal` supports a `'feature'` scope and `resealScope` can write it, but `verifyDecisionTimeIntegrity` never checks it — only `licence_profile` and `prohibited_registry` are checked at decision time. An out-of-band write to `cfg1.feature` (including, after this task, `environment_scope`) is therefore undetected by the seal mechanism at evaluation time, even though the mechanism exists.
- **Severity rationale (register taxonomy, `OPEN_FINDINGS.md`):** **MEDIUM**, not HIGH and not LOW/INFORMATIONAL. Not HIGH: MIG-004's fresh verify-decision re-read (§10, "Fresh re-check at verify") independently re-reads live `environment_scope` on every verify, so an out-of-band `environment_scope` tamper is still caught at verify time even without seal coverage — there is a working compensating control, unlike `CFG-FIND-001`'s untrusted-caller path, which had none. Not LOW/INFORMATIONAL: the gap is pre-existing (predates MIG-004, covers `current_state` too, not just the new column) and is a real detection gap in the seal's own stated purpose (`config_integrity_seal` scope `'feature'` exists specifically to detect this class of tamper), so it is a genuine control deficiency, not a cosmetic or already-mitigated-everywhere observation.
- **Affected components:** `services/cfg1/src/lib/integrity-seal.ts` (`computeFeatureScopeHash`, `verifyDecisionTimeIntegrity`, `resealScope`), `cfg1.config_integrity_seal` (`config_scope = 'feature'`), `cfg1.feature` (`current_state`, and `environment_scope` once migration 071 lands).
- **Current exploitability:** none through any CFG-01 route — no route allows an out-of-band write; `role_cfg1_runtime`'s grants are column-scoped and the mutation workflow is the only writer. The gap matters only against a direct, out-of-band (e.g. superuser/DBA-level) database write, which is already outside CFG-01's own trust boundary.
- **Future exploitability after MIG-004:** unchanged in kind — still requires an out-of-band write. MIG-004's fresh verify-decision re-read of `environment_scope` (§10) means a tampered `environment_scope` is still caught the next time an issued token is verified, though not at the moment of tamper and not for a fresh `evaluate()` call made before any verify (that call would read the tampered value directly and decide on it, since `evaluateFeature`'s own feature-row read is always live — this is the residual gap).
- **Remediation (single coherent task, not split):** in the `CFG-FIND-002` closure task, together:
  1. add `environment_scope` to `FeatureSealRow`/`computeFeatureScopeHash`'s allow-list;
  2. a migration that reseals every existing active `feature`-scope seal to the new hash shape in the same change (so no existing seal goes stale);
  3. add `feature` to `verifyDecisionTimeIntegrity`'s checked scopes, at decision time (both `evaluate` and `verify-decision`);
  4. tests proving tamper detection: an out-of-band `current_state` or `environment_scope` write is caught by `verifyDecisionTimeIntegrity` on the very next `evaluate()`/`verify-decision()`, not only at the next verify of an already-issued token;
  5. correct treatment of every existing `cfg1.feature` row and its current `environment_scope` (post-MIG-004 backfill value) under the new seal hash, proven by the reseal migration's own validation.
- **Blocks:** MIG-005 gate condition, none (out of MIG-005 scope). **Blocks:** UAT or DEMO use of any environment-gated capability (the seal must cover the mechanism UAT/DEMO will exercise); blocks introduction of a real `environment_scope` mutation/write path (§9) — that path must reseal on every write, which requires this fix to exist first.
- **Does not block:** MIG-004 itself (compensating control in place, §10); does not block continued non-production testing of the environment-availability mechanism under this plan's existing test matrix (§13), which exercises live rows, not the seal.

## 11. Prohibited precedence (Q9) and staging (Q10)
- Step 1 stays first. `environment_scope` is read only after the registry deny.
- **HD-4 (recommended, deny-only):** step 1 also denies any `exchange.`-prefixed code structurally, reason `prohibited`. This mirrors the existing `isFeatureMutationBlocked` prefix guard, so a DBA-injected `exchange.*` row with every entry `ENABLED` still denies. It does not touch MIG-002, whose subject is the mutation block.
- Staging resolves to the `PRODUCTION` entry via `canonicalEnvironment`. No `STAGING` key can exist: the DB CHECK rejects it and the runtime parser marks the object invalid.

## 12. Migration `071_cfg1_environment_scope.cjs` (Q12)
The head is **070**, so this is migration **071**; one migration is enough. Historical migrations 001, 014 and 053 are untouched.
```sql
ALTER TABLE cfg1.feature ADD COLUMN environment_scope jsonb NOT NULL
  DEFAULT '{"DEVELOPMENT":"DISABLED","TEST":"DISABLED","UAT":"DISABLED","DEMO":"DISABLED","PRODUCTION":"DISABLED"}'::jsonb;
ALTER TABLE cfg1.feature ADD CONSTRAINT cfg1_feature_environment_scope_valid CHECK (
  jsonb_typeof(environment_scope) = 'object'
  AND environment_scope ?& ARRAY['DEVELOPMENT','TEST','UAT','DEMO','PRODUCTION']
  AND (environment_scope - ARRAY['DEVELOPMENT','TEST','UAT','DEMO','PRODUCTION']) = '{}'::jsonb
  AND jsonb_typeof(environment_scope->'DEVELOPMENT') = 'string' AND environment_scope->>'DEVELOPMENT' IN ('ENABLED','DISABLED','NOT_APPLICABLE')
  AND jsonb_typeof(environment_scope->'TEST')        = 'string' AND environment_scope->>'TEST'        IN ('ENABLED','DISABLED','NOT_APPLICABLE')
  AND jsonb_typeof(environment_scope->'UAT')         = 'string' AND environment_scope->>'UAT'         IN ('ENABLED','DISABLED','NOT_APPLICABLE')
  AND jsonb_typeof(environment_scope->'DEMO')        = 'string' AND environment_scope->>'DEMO'        IN ('ENABLED','DISABLED','NOT_APPLICABLE')
  AND jsonb_typeof(environment_scope->'PRODUCTION')  = 'string' AND environment_scope->>'PRODUCTION'  IN ('ENABLED','DISABLED','NOT_APPLICABLE'));
```
- `down`: drop the constraint, then the column (repository convention: every migration has a `down`).
- No index: lookup stays by the unique `feature_code`.
- Grants: `infra/grants/cfg1_runtime_grants.sql` as §9.
- Validation: `migrate:up` on a clean DB and on a DB with pre-existing feature rows (all backfilled DISABLED); `migrate:down`/`up` round trip; CHECK rejection probes for every Q2 case.

## 13. Test matrix
**Unit (`cfg1-environment-availability`, `cfg1-decision`):**
- Parser: valid for each value in each key; INVALID for null, array, string, number, 4-key, 6-key (`STAGING`), lowercase keys, lowercase values, boolean value, nested value, prototype keys.
- For **each** of dev/qa/uat/demo/staging/prod as the own environment (6 × 4):
  - its canonical entry `ENABLED` → step 4 passes;
  - `DISABLED` → `environment_not_available`;
  - `NOT_APPLICABLE` → `environment_not_available`;
  - invalid object → `environment_scope_invalid`.
- Staging reads `PRODUCTION`: `PRODUCTION = DISABLED` with the others `ENABLED` → deny; the reverse → passes step 4.
- Propagation: every non-production entry `ENABLED` and `PRODUCTION = DISABLED` → prod and staging deny.
- Own environment an unknown string (library level) → PRODUCTION entry used.
- Payload hash uses the own environment.

**Integration (`cfg1-db`, real DB):**
- Migration 071 applies cleanly; existing rows backfilled all-DISABLED; the CHECK rejects each Q2 malformed case including a `STAGING` key.
- Runtime role: INSERT with `environment_scope` → 42501; UPDATE `environment_scope` → 42501. Feature-changes creation still works and yields all-DISABLED.
- Prod-configured CFG-01:
  - body `dev` → `environment_mismatch` deny, decision log `environment = 'prod'`, critical mismatch audit with `asserted_environment: 'dev'`, no token row;
  - body `prod` with a fixture `DEVELOPMENT = ENABLED`, `PRODUCTION = DISABLED` → `environment_not_available` (it cannot evaluate as DEVELOPMENT).
- Staging-configured CFG-01 → PRODUCTION entry.
- `demo` accepted by the schema.
- Cross-environment tokens: issue under a dev-configured app, verify under a prod-configured app on the same DB → binding mismatch + revoked.
- A verify-decision body mismatch → revoked `environment_mismatch`.
- An out-of-band `environment_scope` flip to `DISABLED` after issuance → verify revoked `environment_unavailable`.
- Unchanged denials still hold:
  - a prohibited code with every entry `ENABLED` → `prohibited`;
  - an `exchange.*` fixture with everything `ENABLED` → `prohibited` (HD-4);
  - kill switch active → `kill_switch_active`;
  - `current_state = 'disabled'` with the own entry `ENABLED` → `feature_disabled`;
  - unknown feature → `unknown_fail_closed`;
  - canonical PRODUCTION, all else passing → `production_activation_absent` (HD-2).
  - a permanently prohibited/`exchange.`-shaped code with a **mismatched** caller environment on the same request → decision remains `prohibited` (never `environment_mismatch`), proving the corrected precedence (§5, §7).
- DEVELOPMENT-configured, entry `ENABLED`, `current_state = 'enabled'` → allow and a token (proves the non-production path works).
- `feature_version.state_snapshot` carries `environment_scope`. The feature-scope integrity seal hash does **not** change when only `environment_scope` changes (`computeFeatureScopeHash` is unextended in MIG-004, §10); a test asserts the seal hash is unaffected by an `environment_scope` mutation, distinguishing this from `CFG-FIND-002`'s later change.

**Regression:**
- Existing CFG-01 tests are updated so the request body `environment` equals the app's configured environment. About 42 sites send `"prod"` today, and fixtures need an explicit `environment_scope`.
- CLT-01 onboarding tests unchanged at the client boundary.
- WLT-01 untouched: zero diff under `services/wlt1`.
- Full `npm test` compared against the baseline failure set; `tsc -b` exit 0.

## 14. Human decisions — APPROVED (Aiman, 2026-09-25, MIG-004 plan approval turn)
| ID | Decision | Status |
|---|---|---|
| **HD-1** | `current_state` = local product/operational feature-activation conjunct (every environment); separate from `ENVIRONMENT_AVAILABILITY`, `PRODUCTION_ACTIVATION_STATE` and `PRODUCT_ASSET_ELIGIBILITY_STATE`; `current_state = enabled` is never evidence the production regulatory activation gate has passed | **APPROVED.** Recorded as `DEC-014` in `DECISION_LOG.md` (this turn) |
| **HD-2** | PRODUCTION hold: canonical PRODUCTION (`prod`, `staging`) denies `production_activation_absent` until state 3 exists, even if environment availability = `ENABLED` and `current_state = enabled` | **APPROVED.** Reason code corrected to `production_activation_absent` (28 chars, fits `varchar(32)`) — `production_activation_unrepresented` (35 chars) is rejected as too long and replaced everywhere in this plan |
| **HD-3** | Decision-time verification of the `feature` seal, and extending the seal hash to cover `environment_scope` | **APPROVED as a separate control task, `CFG-FIND-002` (§10A), registered in `OPEN_FINDINGS.md` this turn.** MIG-004 does **not** add `environment_scope` to `computeFeatureScopeHash` (reverses the original plan's §10) — doing so without a paired reseal migration would make every existing active `feature`-scope seal stale the instant migration 071 backfills the column. MIG-004 keeps the fresh verify-decision re-read of `environment_scope` (§10) as its compensating control |
| **HD-4** | Structural `exchange.` prefix deny at evaluate step 1 (deny-only defence in depth; does not implement or alter `MIG-002`) | **APPROVED** |

**Precedence correction (applied throughout, §5 and §7):** decision order is now integrity verification → prohibited registry / structural `exchange.*` deny → caller-environment mismatch → kill switch → feature lookup → environment availability → stale/version → `current_state` → production activation hold → allow. Permanent prohibition keeps primary denial attribution; a permanently prohibited request with a mismatched environment still decides `prohibited`, with the heightened prohibited audit intact and an additional environment-mismatch audit permitted (not required) alongside it, never in place of it.

## 15. Findings treatment
- `CFG-FIND-001`: **closed by MIG-004** on repository evidence of the §5 design and the §13 trust-boundary tests. Closure is recorded at acceptance, not at planning.
- `FND-FIND-013`: the CFG-01 part is closed by MIG-004 (§6). The row stays **OPEN** for the WLT-01 part and migrations 001/053.
- `FND-FIND-012` (FND-01) and `WLT-FIND-016` (WLT-01) are untouched. G-1 is not mixed in.

## 16. Exclusions
- No `environment_scope` mutation route or IAM-02 permission.
- No state 3 or state 4 implementation, apart from the HD-2 deny-only hold.
- No seeded enabled capability, and no Exchange, RWA, Pay, `securities.token_trading` or `securities_market.*` work.
- None of MIG-001/002/003/006/007/008/009/010. No WLT-01 or FND-01 change. No edit to historical migrations.
- No `DOC00_SOURCE_VERSION` change or reseal of the Doc 00 scopes.
- The blueprint v1.1 "synthetic quarantined non-production exception" to the prohibited lock (FR-029, §9 rule 2, TC-084) is **not implemented**. Doc 00 v1.5 makes those prohibitions permanent in every environment.

## 17. Review-required issues — dispositions (this approval turn)
- **R-1:** CFG-01 blueprint v1.1 allows a synthetic non-production exception to the prohibited lock, which conflicts with Doc 00 v1.5 §1.D.4 / `LIC-RULE-002`. **Disposition: carried forward as blueprint/master reconciliation.** The masters prevail; no synthetic exception to a permanent prohibition exists in this plan or in MIG-004. Not registered as an `OPEN_FINDINGS` row (it is a blueprint staleness item, not a code/control defect) — tracked here and in the blueprint's own future rebaseline (Doc 00 §25.2 lists CFG-01 as "Extension").
- **R-2:** blueprint FR-016 lists environments "dev, staging, UAT, production" (stale, pre-`DEC-013`). **Disposition: carried forward as stale blueprint environment vocabulary**, alongside R-1, for the same future CFG-01 blueprint rebaseline. Not a MIG-004 defect.
- **R-3:** the `feature` seal is never verified at decision time. **Disposition: superseded by `CFG-FIND-002` (§10A)**, which is the formal registration of this observation together with its root-caused seal-hash-coverage gap. No separate R-3 tracking needed once `CFG-FIND-002` is registered.
- **R-4:** the feature-changes workflow can set `current_state = 'enabled'` in a production deployment through a generic IAM-02 approval, not the `CFG-RULE-004` path. **Disposition: NOT registered as a separate defect.** Under `DEC-014` (HD-1), `current_state` is product/operational activation, not the production regulatory gate — a generic approval setting it was never meant to represent `PRODUCTION_ACTIVATION_STATE`, so there is no control conflated here to fix. `HD-2`'s production hold independently prevents any access in canonical PRODUCTION while state 3 is absent, regardless of `current_state`. **Revisit if a distinct control issue remains once the production-activation workflow/state (`CFG-RULE-004`) is actually designed** — at that point, confirm the feature-changes workflow cannot be mistaken for, or substituted for, that governed path.
- **R-5:** Doc 00 §25.2's "`PRODUCTION_ACTIVATION_STATE` (`MIG-004`)" wording versus the §25.3 register, which confines MIG-004 to state 2. **Disposition: added to governance cleanup `G-1`** (the MIG-005-review docs cleanup item; see `docs/03_implementation/tasks/MIG-005/04-review.md` §6). Not actioned in this turn; does not broaden MIG-004.

## Acceptance criteria (checkable from repository evidence)
- [ ] Migration 071 as §12; backfill all-DISABLED proven; CHECK rejects every Q2 case; round trip works.
- [ ] Column-scoped INSERT grant; runtime cannot write `environment_scope` (42501 ×2).
- [ ] Step 4 live exactly as §7; no `isProductionGated` in any allow path.
- [ ] Decision precedence exactly as §5/§7 (corrected): prohibited registry / structural `exchange.` deny before the environment-mismatch check; a permanently prohibited request with a mismatched environment still decides `prohibited`.
- [ ] Authoritative own environment everywhere per §5; the mismatch denies (`environment_mismatch`), logs, audits critical and never issues a token; cross-environment tokens fail.
- [ ] Production hold denies with `production_activation_absent` (not `production_activation_unrepresented`) in canonical PRODUCTION; fits `reason_code varchar(32)`.
- [ ] `computeFeatureScopeHash` is **not** extended to `environment_scope` in this task; the feature-scope seal hash is unchanged by an `environment_scope`-only mutation (§10 test).
- [ ] `demo` accepted via the foundation `ENVIRONMENTS`; no local environment list in CFG-01.
- [ ] `DEC-014` recorded in `DECISION_LOG.md` before implementation; `CFG-FIND-002` registered in `OPEN_FINDINGS.md`.
- [ ] HD-1…HD-4 implemented as approved; the §13 matrix passes; zero new failures versus baseline; `tsc -b` exit 0.
- [ ] No diff outside `services/cfg1`, `infra/migrations/071_*`, `infra/grants/cfg1_runtime_grants.sql`, `tests/**` and docs.
