---
document_id: WLT-01-ACC-001
title: WLT-01 Public Client Surface — Independent Acceptance (Opus, v1.0)
version: N/A
document_status: APPROVED
implementation_status: ACCEPTED
module: WLT-01
control: Client-facing public `/wlt1/*` surface (6-route contract) — WLT-01 BLOCKER-1/BLOCKER-2 downstream consumer
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 7f9fc8a
---

# WLT-01 Public Client Surface — Independent Acceptance (Opus, v1.0)

| Item | Detail |
|---|---|
| Module | WLT-01 — new client-facing public route surface added to the accepted WLT-01 internal baseline |
| Artifact | `services/wlt1/src/routes/public/{destinations,wallet-destinations,payout-destinations,proof-of-control}.ts`, `services/wlt1/src/plugins/public-auth.ts`, `services/wlt1/src/lib/{iam-client,fnd-rate-limit-client,destinations}.ts`, `services/wlt1/src/lib/public/{cursor,dto,destination-list}.ts`, `services/wlt1/src/{config,server}.ts`, `services/wlt1/src/lib/errors.ts` |
| Trigger | `OPEN_FINDINGS.md` WLT-FIND-004 — both WLT-01 public-surface prerequisites (BLOCKER-1: IAM-01 internal session introspection; BLOCKER-2: FND-01 shared rate-limit engine) were COMPLETE, unblocking implementation of the previously FROZEN PENDING PREREQUISITES public `/wlt1/*` contract |
| Governance | Executes existing accepted authority (CLT-01 Membership Authority's own "selector never authority" rule; IAM-01 internal session introspection) and `DECISION_LOG.md` DEC-009 (rate-limit bucket/subject bindings and public failure-semantics mapping) — introduces no new architecture decision |
| Implementation commit | `12cedda` — `feat(wlt1): add public client surface` |
| Remediation commit | `7f9fc8a` — `fix(wlt1): harden public client surface` |
| Reviewer | Independent Opus acceptance review (three turns: original implementation review, narrow remediation re-review, this consolidated governance record) |
| Verification | Full platform canonical suite independently reproduced 0 failures at both commits (186/4889 at `7f9fc8a`) on freshly migrated disposable Postgres instances, `--no-file-parallelism`; adversarial probes against a real Postgres using production-shaped identifiers (not the committed test suite's short fixtures) for every load-bearing claim — cross-client idempotency collision (including a forced fail-closed evidence-write trigger), the full FND-01 failure matrix (7 modes), auth-channel separation in both directions, tenant isolation, and the address-integrity evidence chain |

---

## 1. Verdict

**WLT-01 PUBLIC CLIENT SURFACE: COMPLETE / ACCEPTED** (at `7f9fc8a`, following remediation of three MEDIUM findings identified at the original implementation commit `12cedda`).

Exactly six public `/wlt1/*` routes exist, mirroring five projections of the already-accepted internal WLT capability plus one new client-scoped read capability, with zero new mutation capability and zero license/feature-boundary expansion. The authority chain (client bearer → IAM-01 introspection → user_class gate → CLT-01 membership resolution → derived `client_id` → FND-01 rate-limit check → idempotency → business operation → Sensitive Read evidence → response) is proven fail-closed at every step. Address-integrity evidence, idempotency authority scoping, and public dependency-failure mapping — the three defects found at first review — are independently proven closed, not merely re-read as closed.

**FND-FIND-001 (HIGH, pre-authentication abuse) is explicitly NOT solved by this work and REMAINS OPEN.** **INTERNET EXPOSURE REMAINS PROHIBITED** pending a separately accepted public-perimeter / pre-authentication-abuse control. **WLT-01 AS A WHOLE REMAINS PARTIAL** — this record accepts only the public client surface, not the module.

---

## 2. Part A — Original independent implementation review (`12cedda`)

### 2.1 Scope

Six public routes implemented exactly as frozen: `GET /wlt1/destinations`, `GET /wlt1/destinations/:destination_id`, `POST /wlt1/wallet-destinations`, `POST /wlt1/payout-destinations`, `POST .../proof-of-control/challenges`, `POST .../proof-of-control/verify`. No self-revocation route, no public limits-disclosure route, no public evaluate-use route, no per-IP limiting, no `AUTH_FAILURE` bucket, no `trustProxy`, no Exchange/trading/balance/custody/settlement capability. No new WLT migration — the six-route contract required zero new schema. Route inventory independently reconstructed via live `app.printRoutes()` parsing: exactly 6 public + 27 internal.

### 2.2 Independently confirmed correct at first review

Auth-channel separation (internal service token cannot open a public route in either presentation form, and vice versa); IAM-01 introspection fail-closed (only HTTP 200 + `valid:true` + complete fields authenticates; every other outcome — 401, 5xx, timeout, network error, malformed body, `valid:false`-on-200 — is `unavailable`, never silently `invalid`); `user_class` gate restricted to `{client, client_approver}`; CLT-01 membership resolution as the sole authority source, with `X-AIX-Client-Id` proven (an 8-case matrix) to be a narrowing selector only, never an authority-establishing input; SQL-level tenant isolation on both list and single-read (predicate in the query, never fetch-then-filter); exact DEC-009 bucket/subject bindings on all six routes; FND-01 explicit-allow-required ordering (auth/CLT rejections never call FND; a rate-limited request creates zero mutation state); Sensitive Read evidence-before-response (proven destructively — breaking the audit write yields 503 with the restricted value absent from the response body); PoC verify's absence of a foundation Idempotency-Key confirmed to match an already-accepted internal-route precedent, not a new deviation.

### 2.3 Findings identified requiring remediation

Three MEDIUM and one LOW/test-quality finding, using this record's own controlled IDs (mapped from the review's original W1–W9 labels):

| Controlled ID | Origin label | Severity | Summary |
|---|---|---|---|
| WLT-FIND-005 | W1 | MEDIUM → CLOSED (Part B) | Public wallet registration omitted the controlled address-integrity evidence chain (`wlt1.address_integrity_check` / `wlt1.address_integrity_checked`) the accepted internal route produces |
| WLT-FIND-006 | W2 | MEDIUM → CLOSED (Part B) | Public mutation idempotency scope omitted derived client authority — a multi-membership caller could have one client's idempotent-replay result returned for a different narrowed client |
| WLT-FIND-007 | W3 | MEDIUM → CLOSED (Part B) | Public FND-01-unavailable path returned the internal `RATE_LIMIT_UNAVAILABLE` code verbatim, rather than DEC-009's required generic public mapping |
| WLT-FIND-008 | W6 | LOW → CLOSED (Part B) | Missing load-bearing regression coverage (auth-channel separation; full positive DTO allowlists on all six routes) |

No BLOCKING or HIGH defect was found. **Verdict at this stage: REVISE BEFORE ACCEPTANCE.**

---

## 3. Part B — Remediation (`7f9fc8a`) and its independent narrow re-review

### 3.1 Scope

8 files changed (609 insertions / 116 deletions), all within `services/wlt1/src/**` and `tests/integration/**`. No migration, no grant, no docs, no dependency, no IAM/IAM-02/CLT/FND production change.

### 3.2 WLT-FIND-005 (W1) — address-integrity evidence — CLOSED

The internal route's private `recordRefusal` helper was relocated to `lib/destinations.ts` and parameterized by actor identity, so both the internal and public routes reuse the identical evidence-writing code — independently diffed byte-for-byte identical modulo the actor parameterization. The public wallet-registration route now writes the same success-path (`address_integrity_check` PASS row + `address_integrity_checked` audit) and refusal-path (FAIL row + both `address_integrity_checked` and `destination_registration_refused` audits) evidence as the internal route, correctly attributed to the introspected human IAM user and derived client, never to a fabricated service identity.

**Independently reproduced**, using production-shaped identifiers against a real Postgres: a fresh success registration produces exactly one PASS evidence row and one audit event with no leakage into the public response; a bad-checksum refusal produces exactly one FAIL row (`destination_id IS NULL`) and both required audit events; a CLT-status-blocked refusal correctly omits the address-integrity row (matching internal semantics — the refusal precedes address parsing). **Transactionality independently proven fail-closed by destructive test**: a trigger forcing the evidence INSERT to fail produced HTTP 503 `WLT1_AUDIT_REQUIRED`, zero destination rows created, and — verified via a precise post-hoc integrity query — zero orphaned `wallet_registered` audits anywhere in the database (a 1:1:1 reconciliation of registered destinations, wallet rows, and PASS evidence rows). The internal route's own body diff is confirmed to be exactly the two call sites now passing the same literal actor values the helper previously hardcoded — no internal-route behavioural change.

### 3.3 WLT-FIND-006 (W2) — idempotency client-authority binding — CLOSED

`publicIdempotencyActorId(iamUserId, clientId) => \`${iamUserId}:${clientId}\`` folds the derived client into the foundation idempotency scope's `actor_id` field (the scope key has no independent client column), applied to all three public mutation routes that use foundation idempotency: wallet registration, payout registration, and PoC challenge creation. PoC verify remains unchanged and outside foundation idempotency, per the already-accepted frozen design.

**Collision-safety independently verified against the actual identifier grammar**, not merely test fixtures: `iam.user_identity.user_id` and `clt1.client_profile.client_id` each have exactly one server-side minting path (`"user_"+randomUUID()`, `"clt1client_"+randomUUID()`), no migration seeds either table, and the UUID alphabet cannot produce a colon — so the composite's split point is structurally unambiguous. Measured production-shaped composite length: 89 characters, within `actor_id varchar(128)`; the unreachable theoretical maximum (129 chars) would hard-fail on INSERT rather than silently collide.

**Cross-client independence independently proven on all three routes** with a real multi-membership actor: wallet registration (two clients, same key/body, narrowed differently) produced two distinct destinations correctly owned by their respective clients, with same-client replay still returning the original result; payout registration proven independently (not assumed from shared-helper reuse) with the same result; **PoC challenge — the most severe case, where the pre-remediation replay branch resolved before its own ownership check — proven directly**: a second caller narrowed to a client that does not own the destination now receives a safe 404 `WLT1_DESTINATION_NOT_FOUND` rather than a replayed cross-client challenge, with neither the challenge id nor the PoC message leaked, while the true owner's own replay still works. Audit `actor_id` on every `publishAudit`/`logSensitiveDestinationRead` call independently confirmed to remain the plain human `iamUserId` — the composite is confined to the idempotency scope only and never appears in any audit record.

### 3.4 WLT-FIND-007 (W3) — public dependency-error mapping — CLOSED

`checkPublicRateLimit`'s enforcement-indeterminate branch now throws `WLT1_SERVICE_UNAVAILABLE` (WLT-01's own already-established generic-unavailable code) instead of the shared foundation `RATE_LIMIT_UNAVAILABLE`, matching DEC-009's own failure-semantics clause verbatim ("engine unavailable ... mapped to public `503 SERVICE_UNAVAILABLE`").

**Independently probed across a 7-mode failure matrix** (FND 503/401/400/418/malformed-JSON/timeout/network-failure): every mode maps to public `503 WLT1_SERVICE_UNAVAILABLE`, never the internal code and never 429, on both a read route and a mutation route. A genuine FND `429` independently confirmed to remain public `429 RATE_LIMITED` with `Retry-After` preserved end to end, on both read and mutation routes — the generic mapping does not swallow true quota denials. No secret or internal dependency detail (tokens, base URLs) appears in the response body.

One new non-blocking observation surfaced by this verification (WLT-FIND-013 / W9, below): the generic mapping is public-side correct, but the FND-unavailable reason is no longer distinguishable in internal logs from a WLT DB-pool outage.

### 3.5 WLT-FIND-008 (W6) — regression coverage — CLOSED

Four committed bidirectional auth-channel-separation tests (internal token via its own header, and as a Bearer, against a public route; a public client Bearer via its own header, and via the internal header, against an internal route) — each asserting both status and error code, not merely call counts. Exact positive `Object.keys(data).sort()` allowlists committed for all six public routes (not `client_id === undefined` checks), including a genuine crypto-fixture-based PoC-verify success (the real production `canonicalizeAixSignature` path, not a mocked shortcut) and a payout-destinations success reached via a temporary rail activation restored in `finally` — independently confirmed to leave the fixture `inactive` after both the full sequential canonical suite and two consecutive reruns of the file.

### 3.6 Full regression at `7f9fc8a`

Independently rebuilt from an empty database (fresh migration to head `070`, all 9 grant files applied clean, correctly-bootstrapped SEC-01 ingest tokens):

- WLT: 79 files / **2303/2303**
- CLT: 21 files / **739/739**
- IAM: 7 files / **120/120**
- IAM-02: 5 files / **83/83**
- FND: **97/97** (4 `fnd-*` files = 71, plus `app.test.ts` = 26)
- `tsc -b --force`: **0 errors**
- **Full canonical platform suite: 186 files / 4889 tests / 0 failures**, `--no-file-parallelism` — reconciles exactly to the pre-remediation 186/4875 committed baseline (+14 new W1/W2/W3/W6 regression tests)
- Fail-loud confirmed: the public-surface integration suite fails loud (exit 1, an explicit canary failure) against an unmigrated database
- Migration head unchanged at `070_fnd_rate_limit_policy_privilege_hardening` (70 files, no migration 071); all 9 grant files byte-unchanged; zero direct WLT grants into `iam.*`, `clt1.*`, or `foundation.rate_limit_*`

---

## 4. Findings register (final state at `7f9fc8a`)

| Finding ID | Origin | Severity | Status | Summary |
|---|---|---|---|---|
| WLT-FIND-005 | W1 | MEDIUM | **CLOSED** at `7f9fc8a` | Address-integrity evidence chain restored on both success and refusal paths, transactionally fail-closed, internal route unregressed |
| WLT-FIND-006 | W2 | MEDIUM | **CLOSED** at `7f9fc8a` | Public idempotency scope now binds derived client authority on all three eligible routes; cross-client replay proven impossible, same-client replay intact, human audit identity preserved |
| WLT-FIND-007 | W3 | MEDIUM | **CLOSED** at `7f9fc8a` | Public FND-unavailable mapping now generic (`WLT1_SERVICE_UNAVAILABLE`) per DEC-009; genuine 429 quota denial unaffected |
| WLT-FIND-008 | W6 | LOW | **CLOSED** at `7f9fc8a` | Auth-channel-separation and six-route positive DTO allowlist regression coverage committed |
| WLT-FIND-009 | W4 | LOW | **OPEN** | Sensitive Read public-disclosure evidence records `actor_type: "service"` for a human-driven public disclosure; `actor_id` correctly identifies the human IAM user |
| WLT-FIND-010 | W5 | LOW | **OPEN** | No technical route-enablement / go-live gate — the six public routes register unconditionally in `buildApp`; the internet-exposure prohibition is currently procedural, not technically enforced |
| WLT-FIND-011 | W7 | LOW | **OPEN** | WLT-01's production environment configuration (30 WLT-specific vars, including the 5 this implementation added) is not represented in `platform/.env.example` — a pre-existing gap, widened, not newly introduced; boot remains fail-closed on any missing required var |
| WLT-FIND-012 | W8 | INFORMATIONAL | **OPEN** | Carried observational notes: the pagination cursor is unsigned/malleable but cannot cross tenants (SQL authority always uses the derived `client_id`, never the cursor's own claim); `WLT1_PUBLIC_DESTINATION_LIST_MAX` has no operator-configured upper bound; the `WLT1_IAM01_UNAVAILABLE`/`WLT1_CLT1_UNAVAILABLE` codes name internal module topology to a public caller; the CLT-unavailable public message wording is imprecise for the membership-resolution seam specifically |
| WLT-FIND-013 | W9 | LOW | **OPEN** (new, identified during remediation re-review) | The corrected generic public FND-unavailable mapping (WLT-FIND-007) is public-side correct, but internal diagnosability lost the dependency-specific reason — an FND rate-limit outage now logs identically (`WLT1_SERVICE_UNAVAILABLE`, no cause) to an unrelated WLT DB-pool or provider outage. No security, correctness, or public-contract impact; not fixed in the remediation turn |

FND-FIND-001 (HIGH, pre-authentication abuse — tracked under FND-01, see `02_modules/FND-01/acceptance/FND-01_Rate_Limit_Hardening_Opus_v1.0.md`) is reaffirmed unchanged, not solved by any of the above, and remains the mandatory precondition before any WLT-01 public route is internet-exposed.

---

## 5. WLT-01 module status

Acceptance of the public client surface does **not** constitute acceptance of the WLT-01 module. Remaining controlled WLT-01 work, unaffected by this record:

- **WLT-FIND-001** — monetary amount wire contract (LOW/NON-BLOCKING; 2 routes hardened, broader rollout pending)
- **WLT-FIND-002** / **WLT-FIND-003** — concentration / step-up controls, DEFERRED by design
- **`BP-WLT-01-v1.2`** — blueprint authority conflict, **REVIEW_REQUIRED — CONFLICT** (unresolved by this record)
- **Provider redelivery** — OPEN / LOAD-BEARING operational integration prerequisite (no worker, no raw/normalized-result persistence)
- **WLT-FIND-009 through WLT-FIND-013** above

`MODULE_STATUS.md`'s own prior statement that "WLT-01 as a whole remains NOT go-live ready" stands, unaltered by this record.

---

## 6. Documentation impact

This record, plus updates to `OPEN_FINDINGS.md` (WLT-FIND-005 through WLT-FIND-013 registered; WLT-FIND-004 reconciled to record implementation + independent acceptance complete), `00_project_state/MODULE_STATUS.md` and `00_project_state/PROJECT_HANDOVER.md` (public-surface acceptance recorded, canonical baseline 186/4889, migration head `070` unchanged, WLT-01 module status unchanged at PARTIAL), `02_modules/WLT-01/README.md`, and `DOCUMENT_REGISTER.md` (register this document as `WLT-01-ACC-001`). `DECISION_LOG.md` DEC-009 remains authoritative and unchanged — this record executes its existing bucket/subject bindings and public failure-semantics mapping; no new architecture decision was required.

## 7. Final statement

**WLT-01 PUBLIC CLIENT SURFACE: COMPLETE / ACCEPTED.**
**WLT-FIND-005, WLT-FIND-006, WLT-FIND-007, WLT-FIND-008: CLOSED.**
**WLT-FIND-009, WLT-FIND-010, WLT-FIND-011, WLT-FIND-012, WLT-FIND-013: OPEN (non-blocking).**
**WLT-01 MODULE: PARTIAL / REMAINING CONTROLLED WORK EXISTS.**
**FND-FIND-001: REMAINS OPEN (HIGH)** — internet exposure of any WLT-01 public route is **PROHIBITED** until this separate public-perimeter / pre-authentication-abuse control is independently resolved.
