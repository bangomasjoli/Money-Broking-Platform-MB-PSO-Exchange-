---
document_id: SEC-01-ACC-003
title: SEC-01 Security Review (Opus, v0.1)
version: N/A
document_status: APPROVED
implementation_status: ACCEPTED
module: SEC-01
control: Audit log, security monitoring
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 780e116
---

# SEC-01 Audit Log / Security Monitoring — Independent Security/Compliance Review (Opus, v0.1)

| Item | Detail |
|---|---|
| Module | SEC-01 Audit Log / Security Monitoring (Phases 0-2 only) |
| Artifact | `aix-platform/` — `services/sec1`, migration `008_sec1_core`, `sec1_runtime_grants.sql`, `@aix/foundation` audit-publisher extension, on the FND-01 + IAM-01 + IAM-02 + C1/C2 baseline |
| Reviewer | Principal Fintech Platform Architect (Opus) — independent post-implementation review |
| Scope reviewed | Phases 0-2 only (scaffold; schema/grants/core tables; ingestion core + hash-chain + idempotency + source-identity binding). Blueprint v1.2. |
| Verification | Own run: `tsc -b` clean; migrations 001→008 apply; 4 grant files apply; **275/275 tests** on a fresh disposable Postgres; grant boundaries reproduced directly under each runtime role; **F1 reproduced empirically** against the live app + DB. |

---

## 1. Verdict

**ACCEPT WITH MINOR CONDITIONS.** One Medium correctness defect in the tamper-evidence recompute path (F1), plus two Low observations. None blocks acceptance of the Phase 0-2 *ingestion* baseline — the guarantees actually in use (append-only enforcement, chain linkage, dual-layer idempotency, source-identity binding, licence posture) all hold and were verified in code and against a live database. F1 is a latent defect that does not affect stored data integrity or the chain itself, but **must be fixed before the integrity-verification job phase** (and is a one-line fix, cheapest to close now).

This is the same disposition class IAM-02 received at its F1/F2 stage: the architecture is right; there is one localized, not-currently-exploitable defect to fix and re-verify.

## 2. Verification summary

**Commands run (fresh disposable Postgres, single run):**
- `npx node-pg-migrate -m infra/migrations --no-check-order up` — migrations 001→008 apply clean (008 fails closed if `SEC1_INGEST_TOKEN_FND01/_IAM01/_IAM02` are unset — confirmed).
- `psql -f infra/grants/{fnd,iam,iam2,sec1}_runtime_grants.sql` — all four apply.
- `npx tsc -b` — exit 0.
- `npx vitest run` — **26 files, 275 tests, 0 failures** (211 baseline FND-01/IAM-01/IAM-02 unregressed + 64 new SEC-01/audit-publisher).

**Migration/grant verification:** 5 core tables only (`audit_event`, `event_schema`, `audit_stream`, `audit_seal_batch`, `source_identity_binding`); the 11 later-phase tables correctly not created. Two documented non-blueprint columns (`ingest_payload_hash`, `token_hash`), both load-bearing and justified.

**Runtime-role verification (reproduced directly via `psql SET ROLE`, not inferred):**
- `role_sec1_runtime` UPDATE/DELETE on `sec1.audit_event` → **denied** (append-only enforced at the grant layer).
- `role_sec1_runtime` on `foundation.outbox_event` → SELECT ✓, UPDATE ✓, INSERT **denied** (the approved narrow exception, exactly as scoped).
- `role_iam_runtime` / `role_iam2_runtime` on `foundation.outbox_event` → **denied** (the exception did not leak).
- `role_sec1_runtime` on `iam.*`, `iam2.*`, `foundation.module_registry` → **denied** (cross-schema isolation intact).
- Integration suite connects as `role_sec1_runtime` via a real LOGIN role from the start (S1 discipline), not superuser-only — confirmed.

## 3. FND audit publisher extension status — SOUND

- `source_module` is **required** on `AuditEvent`; `tsc -b` structurally enforces that every one of the 59 `publishAudit` call sites supplies it.
- Every call site passes a **hardcoded module literal** (`"FND-01"` / `"IAM-01"` / `"IAM-02"`) — confirmed by grep: the only distinct values are those three string literals; **no** call site derives `source_module` from request/body/params/ctx. (The single `body.source_module` reference in `iam/routes/internal.ts` is a *metadata sub-field* recording which upstream module requested a freeze; that `publishAudit`'s own authoritative `source_module` is the literal `"IAM-01"`. Not a spoofing vector.)
- Optional SEC-compatible fields added (severity, event_category, action, result, session_id, client_id, source_emission_sequence, reason_code); `payload_ref` now carries full fidelity for a future outbox consumer, with undefined-valued keys omitted so pre-extension payload shape is preserved for callers that don't use them.
- Naming-convention judgment call (snake_case, consistent with the file's existing fields) is reasonable and documented.
- No secrets introduced into metadata by the change; spot-checked the freeze-event metadata (event_type/source_module/reason_ref/client_id/count — all safe). SEC-01's own redaction layer is an independent second net (see L2).

## 4. SEC-01 ingestion status — SOUND

- Mandatory-field validation against `event_schema.mandatory_fields` (`SEC1_REQUIRED_FIELD_MISSING`); unknown/unregistered `event_type` → `SEC1_EVENT_TYPE_UNKNOWN`. Verified.
- Source-identity binding: authentication (which module is calling, resolved constant-time in `plugins/source-identity.ts`) is correctly separated from per-event authorization (does the event's declared `source_module` match the authenticated identity → `SEC1_SOURCE_MODULE_IDENTITY_MISMATCH`). A batch authenticated as IAM-01 cannot smuggle an IAM-02-declared event. Verified.
- Duplicate handling: same `(source_module, event_id)` + same payload → idempotent replay (no second row); + different payload → `SEC1_IDEMPOTENCY_CONFLICT` (no second row), via FND-01's documented-safe `INSERT … ON CONFLICT DO NOTHING` + `SELECT` pattern. Verified.
- Fail-closed: hash-chain lock/persist failures throw inside `withTransaction` → full rollback → `503`. Standard envelope + safe error messages (no payload/secret leakage in the error handler — it logs only the stable code). Verified.
- **Dual-layer idempotency is sound**: the routes deliberately ignore `beginIdempotent`'s return value, which is *safe here* because (a) different-fingerprint reuse throws inside `beginIdempotent`, and (b) same-fingerprint replay is made safe by the independent business-level `(source_module, event_id)` dedup. The HTTP layer is effectively belt-and-braces over the business layer — acceptable, and documented.
- `removeAdditional: false` override present (the IAM-01 lesson) — unknown body fields are genuinely rejected, not silently stripped.

## 5. Hash-chain / tamper-evidence status — SOUND CHAIN, ONE RECOMPUTE DEFECT (F1)

- Canonical JSON is deterministic (recursive lexicographic key-sort at every depth; arrays preserve order) — same algorithm as `idempotency.ts`'s own canonicaliser, own copy per F3(c). Verified deterministic.
- `event_hash = sha256(canonicalJson(explicitAllowList) + "|" + (previous_hash ?? "GENESIS"))`. Explicit field allow-list (not "whatever the caller sent"); binds the already-redacted metadata form.
- **Sequencing is race-safe (F2 lesson applied from day one):** `SELECT … FOR UPDATE` on the stream row, held for the ingest transaction; the stream pointer advances **only after** the event insert is confirmed to land, so a replay/losing race never burns a sequence number or creates a gap. The concurrency test is a genuine 8-way `Promise.all` HTTP-level proof (contiguous 1..8, each `previous_hash[i] === event_hash[i-1]`, pointer at 8), plus a 5-way concurrent-duplicate test proving the pointer stays at 1. This is exactly the class of test that would have caught IAM-02's F2 — strong.
- `verifyChainSegment` detects gaps, broken links, and recompute mismatches; proven at unit and integration level.
- **F1 (Medium) — see Findings.** The chain *linkage* verification (comparing stored hashes to each other) is unaffected and correct. The defect is confined to the *recompute-from-stored-columns* path.

## 6. Source identity binding status — SOUND

- 3 seeded bindings (FND-01/IAM-01/IAM-02), hash-only-at-rest bearer tokens (`token_hash` = sha256), matched constant-time via `crypto.timingSafeEqual` — never a shared secret, so `source_module` spoofing is structurally blocked (a caller cannot present as a module it doesn't hold the token for, and cannot declare a different module than its token binds). Config + migration both fail closed if any of the three tokens is missing, and reject non-distinct tokens.
- This is a genuine, narrower-than-today improvement over the platform's interim single-shared-token model (IAM-02 carry-forward L3), scoped correctly to ingestion.

## 7. Grants / append-only status — SOUND

- Append-only: enforced by *never granting* UPDATE/DELETE on `sec1.audit_event` (grant-layer, not application-only) — reproduced denied under the real role. No audit edit/delete/correction-as-mutation helper exists anywhere in the new code (correction is a deferred append-only-event design, not built).
- The `foundation.outbox_event` SELECT+UPDATE exception is present, narrow (no INSERT/DELETE), documented, unique to SEC-01, and confirmed not leaked to any other runtime role. Adding it now (before the deferred consumer exists) matches the IAM-02 precedent and needs no later grants-file patch.
- `foundation.idempotency_record` uses the existing C2 `source_module`-scoped RLS pattern (`sourceModule: "SEC-01"`); isolation model unchanged.

## 8. Out-of-scope / licence posture — CLEAN

- No CFG-01 / CLT / KYC / AML / WLT / LED / DEP / WDR / TRD / E2E / REC / INC / PRT code. No Exchange runtime, order book, matching engine, market making, principal dealing, or AIX spread markup anywhere in `services/sec1` — enforced by the boot-time `assertNoExchangeRuntime` guard plus a route-path check. No ledger/balance surface. Import boundary (F3(c)) holds: `services/sec1` imports only bare `@aix/foundation`, never another service's internals.

## 9. Findings ranked by severity

### F1 — Medium — canonical hash and stored column diverge for omitted `event_category`

`lib/ingest.ts` binds `event_category: input.event_category ?? null` into the canonical hash (`buildCanonicalFields`), but stores `input.event_category ?? schema.category` in the `event_category` **column** (the INSERT). When a caller omits the optional `event_category`, the hash is computed over `null` while the column persists the schema default (e.g. `'system'`). Any integrity routine that reconstructs the canonical fields **from the stored row** — which is exactly what tamper-verification must do, and what the existing tamper test does — recomputes a different hash and reports a **false `hashMismatch` on an untampered event**.

**Reproduced empirically (this review, live app + fresh DB):** an event ingested *with* `event_category` verifies clean (`pass=true`); an otherwise-identical event ingested *without* `event_category` reconstructs to `event_category='system'` and `verifyChainSegment` returns `pass=false, hashMismatchAt=[1]` on an untampered row.

**Why it matters:** tamper evidence is the core control SEC-01 exists to provide. A hash-mismatch is the module's most severe alert class (Critical). A verification job built on this would raise Critical false alarms on every legitimately-ingested event whose caller omitted `event_category` — a common case, since the field is optional and most existing FND/IAM call sites don't set it.

**Why it does not block Phase 0-2:** the stored `event_hash` is correctly computed and chained at write time; the chain *linkage* is valid; append-only/idempotency/source-binding are unaffected. The only consumer of the recompute path is the integrity-verification job, which is **deferred** (not built this pass) — so the defect is latent, not currently live.

**Fix (one line, either direction — make hash and column identical):** pass `schema.category` into `buildCanonicalFields` and bind `input.event_category ?? schema.category` into the hash (preferred — the schema default is deterministic and the stored column is the thing being attested); **or** store `input.event_category ?? null` in the column. Add a test that ingests an event *omitting* `event_category` and verifies it reconstructs clean. Recommend fixing as a small patch now (or at the head of Phase 3), before any verification job is built against the current assumption.

### L1 — Low — `classification` / `retention_class` are not covered by the event hash

Both are set once at insert (schema-derived) but excluded from `CanonicalEventFields`, so a DB-level actor could alter an event's `retention_class` (e.g. to shorten retention) without breaking the hash. Mitigated because both are deterministically re-derivable from `event_type` via the registry, so a verification job can check them independently — but consider binding them into the hash (they are set-once, unlike the legitimately-excluded mutable lifecycle columns `seal_batch_id`/`status`/`backfilled`/`clock_skew_*`). Track for the retention/verification phase.

### L2 — Low — metadata redaction is a key-name-substring blocklist (safety net, not a guarantee)

`redactMetadata` matches on **key name** (case-insensitive substring). A secret placed in an innocuously-named key, or embedded in a value string, is not caught. This is explicitly a defense-in-depth net over the primary "no secrets in metadata" discipline that source modules must follow (documented in both `audit.ts` and `redaction.ts`). Acceptable as-is; keep the source-side discipline as the primary control and revisit value-level scanning if/when a richer classification model lands.

## 10. Go / no-go for SEC-01 Phase 3 or gap patch

**Conditional GO.** The ingestion baseline is a solid foundation for Phase 3 (external sealing / monitoring / evidence export). Recommended sequencing:
1. **Fix F1** as a small gap patch (or the first commit of Phase 3) and re-verify — it is in the tamper-evidence control and is the one thing that should not be built on top of.
2. Carry L1/L2 into the relevant later phases (retention/verification for L1; classification model for L2).
3. Proceed to Phase 3 scope.

## 11. Conditions to carry forward

- **F1 (must-fix before the integrity-verification job phase):** eliminate the `event_category` hash/column divergence; add an omitted-`event_category` reconstruction test.
- **L1:** decide whether `classification`/`retention_class` should be hash-bound; resolve in the retention/verification phase.
- **L2:** keep source-side "no secrets in metadata" as the primary control; consider value-level scanning later.
- **Deferred scope (correctly tracked, not findings):** outbox consumer (Phase 2b — grant already in place); clock-skew detection (blueprint Open Item, threshold undefined upstream); source-emission-sequence continuity; event-schema management API; sensitive-read logging; search/export APIs; monitoring rules/alerts; IAM-02 registration of `sec1.*` protected actions; interim IAM-01/IAM-02 audit handoff/backfill; external WORM/object-lock + trusted timestamp authority; audit correction; retention/legal hold; recovery integrity verification; incident break-glass audit-read.

*No code was written in this review. F1 was reproduced against a disposable database and all probe databases were torn down.*
