---
document_id: WLT-01-ACC-002
title: WLT-01 Public Perimeter Application Gate — Independent Acceptance (Opus, v1.0)
version: N/A
document_status: APPROVED
implementation_status: ACCEPTED
module: WLT-01
control: Public-surface enablement gate + perimeter-provenance admission (DECISION_LOG.md DEC-010, layer L3)
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: af52fe8
---

# WLT-01 Public Perimeter Application Gate — Independent Acceptance (Opus, v1.0)

| Item | Detail |
|---|---|
| Module | WLT-01 — application-side (L3) half of the DEC-010 public-perimeter / pre-authentication abuse control, layered on the already-accepted WLT-01 Public Client Surface |
| Artifact | `services/wlt1/src/plugins/public-perimeter.ts` (new), `services/wlt1/src/config.ts`, `services/wlt1/src/server.ts`, `platform/.env.example`, `tests/unit/wlt1-public-perimeter.test.ts` (new), `tests/unit/wlt1-config.test.ts`, `tests/unit/wlt1-app.test.ts`, `tests/integration/wlt1-{db,outbox-acl-private,public-surface-db}.test.ts` |
| Trigger | `OPEN_FINDINGS.md` WLT-FIND-010 (LOW, no technical public-route enablement gate) and `DECISION_LOG.md` DEC-010's own Turn 1 authorization — the WLT-01-owned half of the four-layer public-perimeter architecture, unblocked independently of Turn 2 (trusted edge + network isolation) |
| Governance | `DECISION_LOG.md` DEC-010 (architecture ACCEPTED FOR IMPLEMENTATION at commit `5ce9840`) — this record implements and independently accepts DEC-010's L3 clause exactly; it does not revise DEC-010's architecture |
| Implementation commit | `af52fe8` — `feat(wlt1): gate public surface behind perimeter provenance` |
| Parent governance baseline | `5ce9840` — `docs: approve public perimeter architecture` (DEC-010 authored) |
| Reviewer | Independent Opus acceptance review (narrow — scoped to Turn 1's L3 properties; the accepted six-route business surface was re-verified only insofar as this control could have disturbed it) |
| Verification | Full platform canonical suite independently reproduced 0 failures (187/4933) on a freshly migrated disposable Postgres, `--no-file-parallelism`; adversarial probes against a real Postgres and a real Fastify app for every load-bearing DEC-010 L3 property — route absence/presence, Fastify encapsulation (behavioural, not textual), trust-class separation (all four directions), pre-IAM ordering (discriminated by failure mode, not merely hook position), zero downstream HTTP calls, zero DB/idempotency/outbox writes, 404 body/header/leakage equivalence across four scenarios, constant-time comparison under 14 pathological inputs, and the full six-route business regression under valid provenance |

---

## 1. Verdict

**WLT PUBLIC-PERIMETER APPLICATION GATE: COMPLETE / ACCEPTED** (at `af52fe8`).

The six public `/wlt1/*` routes are now registered only when `WLT1_PUBLIC_SURFACE_ENABLED` is exactly `"true"` (safe default: disabled — no route, no handler, no IAM/CLT/FND client, no DB path exists for a disabled surface). When enabled, every public request must additionally present a valid `x-aix-perimeter-token` (`WLT1_PUBLIC_PERIMETER_TOKEN`, ≥32 characters, constant-time compared) via an `onRequest` hook confined to a single encapsulated Fastify plugin scope — proven, not merely declared, to be genuinely inert on the 27 internal routes and on health/readiness. Missing or wrong provenance is rejected with the exact same `404 NOT_FOUND` an unknown route or a disabled surface produces — independently proven byte-identical in body, header-key set, and status across all three cases — before body parsing, before any IAM/CLT/FND call, and before any database write (including `foundation.outbox_event`, which the implementer's own tests did not directly assert).

**This closes WLT-FIND-010 only.** It does not implement DEC-010's L1 (trusted-edge pre-authentication throttling) or L2 (mandatory network isolation), and independent testing directly confirmed the residual: a request carrying a *valid* perimeter token but an *invalid* bearer still causes exactly one IAM call. **FND-FIND-001 (HIGH, pre-authentication abuse) is NOT closed by this work and REMAINS OPEN.** **INTERNET EXPOSURE REMAINS PROHIBITED.**

---

## 2. Scope / Diff

10 files, 675 insertions / 12 deletions. No migration, no grant, no dependency, no IAM/IAM-02/CLT/FND/other-module production change, no docs. `config.ts`'s diff is purely additive — zero existing validation lines deleted or weakened.

## 3. DEC-010 L3 Compliance

Independently re-read against `DECISION_LOG.md` DEC-010's own L3 clause and frozen request order. The implementation matches it exactly: safe default disabled; routes not registered at all when disabled (never "registered then rejected"); `x-aix-perimeter-token`; `crypto.timingSafeEqual` with a length guard; `onRequest` hook, before body parsing, strictly before IAM; missing/mismatched credential rejected with the same `NOT_FOUND` a disabled surface or an unknown route produces; infrastructure provenance only, never conflated with `x-internal-service-token` in either direction. No reinterpretation of the decision was found.

## 4. Route Inventory — Independently Reconstructed

Full paths reconstructed live from `app.printRoutes()`'s indented radix tree (not the trimmed/substring form the committed unit tests use for their weaker assertions — see §12):

| State | Public | Internal | Total |
|---|---|---|---|
| Disabled (default) | **0** | **27** | 27 |
| Enabled + valid config | **6** | **27** | 33 |

Enabled route set, confirmed exact: `GET /wlt1/destinations`, `GET /wlt1/destinations/:destination_id`, `POST /wlt1/wallet-destinations`, `POST /wlt1/payout-destinations`, `POST .../proof-of-control/challenges`, `POST .../proof-of-control/verify`. No self-revocation, no limits endpoint, no evaluate-use exposure, no seventh route.

## 5. Configuration

| Key | Default | Behaviour independently verified |
|---|---|---|
| `WLT1_PUBLIC_SURFACE_ENABLED` | `false` | Only the exact case-insensitive string `"true"` (after trim) enables. Probed all 14 values (`absent, "false", "", "0", "1", "yes", "on", "   ", "truthy", "TRUE1"` → disabled; `"true", "TRUE", "True", " true "` → enabled) through the real `loadWlt1Config` — matches `IAM_BOOTSTRAP_ENABLED`'s own established convention exactly |
| `WLT1_PUBLIC_PERIMETER_TOKEN` | none | Conditionally required only when enabled; ≥32 characters. Probed: disabled+no-token boots (token never surfaced onto config even if present in env); enabled+missing/blank/31-chars all fail `CONFIGURATION_INVALID` at boot; enabled+32/40-chars boots. Error `details` never echo the configured value (verified with a distinctive marker) |

An operator who explicitly enables the surface is never silently downgraded to disabled — an invalid/missing token at that point is a hard boot failure.

## 6. Fastify Encapsulation — Behaviourally Proven

Verified by executing requests, not by reading indentation: `GET /internal/wlt1/health` with **no** perimeter header returns 200; the same request carrying a **garbage** perimeter header still returns 200 (the header is inert there); an internal route with no auth at all returns 401 `SERVICE_IDENTITY_REQUIRED` (proving the perimeter hook never ran — a leak would have produced 404 first); an internal `POST` with a valid internal token and **no** perimeter header executes a real business operation to 201. The perimeter `onRequest` hook is confined to the single `app.register(async (publicScope) => {...})` scope wrapping exactly the four public route registrations.

## 7. Trust-Class Separation — All Four Directions

| Probe | Result |
|---|---|
| perimeter token presented as `x-internal-service-token` → internal route | 401 `SERVICE_IDENTITY_REQUIRED` |
| internal token presented as perimeter token → public route | 404 `NOT_FOUND` |
| valid perimeter token alone (no Bearer) → public route | 401 `WLT1_AUTH_REQUIRED` — perimeter never grants client identity |
| internal token + Bearer, no perimeter → public route | 404 `NOT_FOUND` |

No conflation in any direction. The guard never reads `Authorization`, never calls IAM/CLT/FND, and never sets `request.ctx.actor_id`/`actor_type`.

## 8. Pre-IAM Ordering — Proven by Discriminated Failure Mode

Stronger than confirming hook registration order: a schema-invalid body without perimeter provenance returns 404 `NOT_FOUND`; the identical body **with** valid provenance returns 400 `VALIDATION_ERROR`. A missing `Idempotency-Key` without provenance returns 404, never `IDEMPOTENCY_KEY_REQUIRED`. This proves the hook runs before body parsing, schema validation, and the idempotency-key check — not merely before the IAM HTTP call.

## 9. Zero Downstream Work

Across all six public routes, on both missing and wrong tokens: **IAM 0, CLT 0, FND 0** HTTP calls, and zero row deltas across `wlt1.destination`, `foundation.idempotency_record`, **`foundation.outbox_event`**, `wlt1.address_integrity_check`, and `wlt1.proof_of_control` — the outbox check in particular is not itself asserted by the committed test suite and was independently added during this review. No audit/security-event write is created by a perimeter rejection at any layer.

**Explicit limitation, not closed by this work:** with a *valid* perimeter token, an invalid bearer still produces exactly 1 IAM call. Provenance is admission control, not pre-authentication abuse throttling — the two are not the same property, and this record does not conflate them.

## 10. 404 Equivalence

Disabled / enabled+missing / enabled+wrong / genuinely-unknown-path all independently confirmed: identical status (404), identical body after stripping the standard per-request envelope fields (`request_id`/`correlation_id`/`server_time_utc` — present on every response including an unknown route, disclosing nothing), and identical response header key sets. A leakage scan across all four responses for perimeter/token/IAM/CLT/FND/gateway/edge/surface substrings, plus both the valid and wrong token literals, found zero hits. The 404 is produced by throwing the shared `AppError("NOT_FOUND")`, flowing through the same error handler the app's own not-found path uses — genuine reuse, not a look-alike.

## 11. Constant-Time Comparison

Length guard before `timingSafeEqual`; no `===` on the secret; deterministic UTF-8 buffer conversion. Stress-tested 14 pathological header values (absent, empty, whitespace, prefix, suffix, one-character-diff at equal length, case-flip, Unicode homoglyph, trailing newline, and three header-array-duplication shapes) — only the exact value admits. The thrown error carries no token material in code, message, details, or a truncated stack. The residual comparison-length signal is the same accepted class as the pre-existing `internal-identity.ts` guard.

## 12. Secret Redaction

`WLT1_LOG_REDACT_PATHS` reconstructed directly from source (not trusted from the implementer's count): **9 entries**, including `req.headers['x-aix-perimeter-token']`, with all 8 prior entries intact. Live stdout capture in `prod` log mode across admitted, rejected, and mutation requests confirmed the perimeter token, a wrong-token value, and the bearer token are all absent from emitted logs.

## 13. Existing Public-Surface Business Regression

Re-verified under valid provenance + valid client auth, all six routes: wallet registration (201, exact DTO key set, address-integrity evidence row written — WLT-FIND-005 intact), list (SQL tenant isolation — every row owned by the caller's own client), single read (exact DTO key set), idempotent replay (same `destination_id`; idempotency scope's composite `actor_id` still binds derived client authority — WLT-FIND-006 intact), PoC challenge (Sensitive Read evidence row written), PoC verify (correct not-found semantics on an unknown challenge), payout registration (correct dormant-rail semantics). No business semantics were altered by the L3 control. Auth-chain order after valid provenance reproduced exactly: perimeter → IAM (1 call) → user_class → CLT (1 call) → FND (1 call) → business operation — matching the unchanged accepted L4 chain.

## 14. Test-Quality Observations (Non-Blocking)

Two informational items surfaced during independent review, assigned controlled IDs in §16 below. Neither is a security or correctness defect; neither blocks acceptance.

## 15. Independent Regression Reproduction

| Gate | Result |
|---|---|
| TypeScript `tsc -b --force` | 0 errors |
| WLT | 80 files / 2347 tests |
| CLT | 21 / 739 |
| IAM | 7 / 120 |
| IAM-02 | 5 / 83 |
| FND | 97 |
| Clean migration → 070 (70 files), all 9 grants | clean, byte-unchanged |
| Fail-loud (`wlt1-public-surface-db.test.ts` vs an unmigrated database) | exit 1 |
| **Full canonical platform, `--no-file-parallelism`** | **187 files / 4933 tests / 0 failures** |

Reconciles exactly to the pre-Turn-1 baseline (186/4889) + 44 new tests. A parallel WLT-only run showed transient contamination in files this turn never touched (`wlt1-db.test.ts` grant probes, `wlt1-screening-route.test.ts`); independently confirmed Turn 1 introduced zero new DB-mutating test statements and zero change to test isolation posture — the contaminating shared-fixture mutation pre-dates this commit. Consistent with this repository's own established convention, the cold sequential canonical is the authoritative signal, and it is fully green.

---

## 16. Findings

| Finding ID | Origin | Severity | Status | Summary |
|---|---|---|---|---|
| **WLT-FIND-010** | W5 | LOW | **CLOSED** at `af52fe8` | Default-off public-route registration plus perimeter-provenance admission, independently accepted per this record. Closes only the WLT-01 application-side enablement/provenance gap — does NOT approve internet exposure and does NOT close FND-FIND-001. |
| **WLT-FIND-014** | T1-INF-1 | INFORMATIONAL | OPEN | A hand-built `Wlt1Config` with `publicSurfaceEnabled: true` and `publicPerimeterToken: undefined` (the internal `as string` cast in `server.ts`) yields `500 INTERNAL_ERROR` rather than the generic `404` when a request presents a token. Unreachable through the real `loadWlt1Config` — validation forbids this state at boot — and it still fails closed (never admits). Same structural-typing residual class as the already-accepted M-D2R-1 finding. |
| **WLT-FIND-015** | T1-INF-2 | INFORMATIONAL | OPEN | Two `toContain` assertions in the enabled-state portion of `tests/unit/wlt1-public-perimeter.test.ts` are substrings of the corresponding internal route lines (`/internal/wlt1/wallet-destinations (POST)` / `…payout-destinations (POST)`) and would false-pass if the public routes were absent; the tests' own titles additionally claim "27 internal routes" while asserting only three by substring. `iamCallCount`/`cltCallCount` in the DB-gated suite have no dedicated positive-control assertion (only `toBe(0)` on the rejection path). Fully compensated: `tests/unit/wlt1-app.test.ts` pins the complete enabled 33-line route tree via exact `toEqual`, `fndCallCount` carries its own positive control, and independent review directly confirmed IAM/CLT counters increment correctly on a valid chain. |

`FND-FIND-001` (HIGH, pre-authentication abuse — tracked under FND-01) is reaffirmed unchanged, not solved by this work, and remains the mandatory precondition before any WLT-01 public route is internet-exposed.

## 17. WLT-01 Module Status

Acceptance of this application gate does not constitute WLT-01 module completion. Unaffected and unresolved: WLT-FIND-001 (monetary wire contract), WLT-FIND-002/003 (deferred by design), WLT-FIND-009/011/012/013, `BP-WLT-01-v1.2` (`REVIEW_REQUIRED — CONFLICT`), and provider redelivery (OPEN/LOAD-BEARING). **WLT-01 REMAINS PARTIAL.**

## 18. DEC-010 Turn 2 — Unaffected

Turn 2 (L1 trusted-edge pre-authentication throttling + L2 mandatory network isolation — the layers that actually close FND-FIND-001) remains **BLOCKED**, pending (a) governance designation of a deployment/infrastructure implementation owner (none exists in this repository) and (b) a separate future governance decision approving the numeric pre-authentication policy. Nothing in this record advances Turn 2.

## 19. Documentation Impact

This record, plus updates to `OPEN_FINDINGS.md` (WLT-FIND-010 CLOSED; WLT-FIND-014/WLT-FIND-015 registered OPEN/INFORMATIONAL), `00_project_state/MODULE_STATUS.md` and `00_project_state/PROJECT_HANDOVER.md` (Turn 1 acceptance recorded, canonical baseline 187/4933, WLT-01 module status unchanged at PARTIAL), `02_modules/WLT-01/README.md`, `DECISION_LOG.md` (DEC-010's own Status field annotated in place, mirroring the DEC-008/DEC-009 precedent — no new decision entry), and `DOCUMENT_REGISTER.md` (this document registered as `WLT-01-ACC-002`).

## 20. Final Statement

**WLT PUBLIC-PERIMETER APPLICATION GATE: COMPLETE / ACCEPTED.**
**WLT-FIND-010: CLOSED.**
**WLT-FIND-014, WLT-FIND-015: OPEN (informational, non-blocking).**
**WLT-01 MODULE: PARTIAL / REMAINING CONTROLLED WORK EXISTS.**
**FND-FIND-001: REMAINS OPEN (HIGH)** — DEC-010 Turn 2 (trusted edge + network isolation) is required before it can close, and Turn 2 remains blocked on deployment-owner designation and numeric-policy governance.
**INTERNET EXPOSURE: REMAINS PROHIBITED.**
