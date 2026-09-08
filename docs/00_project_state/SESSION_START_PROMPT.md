---
document_id: STATE-003
title: AIX Platform — Session Start Prompt
version: N/A
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Session bootstrap prompt
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 780e116
---

# Session Start Prompt

Copy-paste this into a new Claude Code session in this workspace.

**AUTHORITATIVE REPOSITORY ROOT:** `/Users/AimanRahimi/Money-Broking-Platform-MB-PSO-Exchange-`
**AUTHORITATIVE DOCS:** `<repo>/docs` (i.e. `/Users/AimanRahimi/Money-Broking-Platform-MB-PSO-Exchange-/docs`)

`/Users/AimanRahimi/aix-platform-docs` is now only a **compatibility symlink** to
`<repo>/docs` (established in Turn D of the Document Control Reorganisation,
commit range starting `d647dc1`). It is not a second copy — edits through either
path land in the same physical files, and Git sees them immediately. **No manual
rsync/copy workflow is permitted or required any more.** Work directly from the
Git repository. The retired original directory (pre-cutover) is preserved,
untouched, at `/Users/AimanRahimi/aix-platform-docs.RETIRED-2026-09-08` for
rollback only — it is not authoritative and must not be edited or read as a
source of truth.

**AUTHORITATIVE CODE ROOT:** `<repo>/platform` (i.e.
`/Users/AimanRahimi/Money-Broking-Platform-MB-PSO-Exchange-/platform`).

`/Users/AimanRahimi/aix-platform` is now only a **compatibility symlink** to
`<repo>/platform` (code source-of-truth cutover, recovered/completed
2026-09-09 after an interrupted session — Git HEAD `ff84a5a` unchanged
throughout). It is not a second copy — edits through either path land in the
same physical files under Git, and Git sees them immediately. **No manual
rsync/copy workflow is permitted or required.** Work directly from the Git
repository at `<repo>/platform`. The retired original directory (pre-cutover)
is preserved, untouched, at `/Users/AimanRahimi/aix-platform.RETIRED-2026-09-09`
for rollback only — it is not authoritative and must not be edited or read as
a source of truth. Before this cutover, `aix-platform` was itself the
authoritative code directory outside Git; that convention is now retired.
Symlink runtime parity was independently verified (`npx tsc -b --force`, one
representative unit test, one representative integration test — all matched
direct-repo results) before this note was written; `NODE_PRESERVE_SYMLINKS`
must remain unset.

---

```
You are working in the AIX Money Broking + PSO Platform documentation workspace.
Workspace root: /Users/AimanRahimi/Money-Broking-Platform-MB-PSO-Exchange- (git repo).
Docs live at <repo>/docs; the legacy path is a compatibility symlink only.

Before doing anything else, read these files:
  1. PROJECT_HANDOVER.md            (this directory — project narrative, checkpoints)
  2. MODULE_STATUS.md               (this directory — implementation status, owns this only)
  3. ../DOCUMENT_REGISTER.md        (sole authority for document version/status)
  4. ../OPEN_FINDINGS.md            (current unresolved findings / blockers / deferrals)

Rules for this session:
- Do NOT scan or deep-analyse the whole repository. Search/list first, then open
  only the specific files for the module we are working on.
- Work on ONE module only this session (see MODULE_STATUS.md → "next"). Do not
  start other modules.
- Enforce the licence lock: Money Broking + PSO only; ALL exchange features
  LOCKED (no order book, matching engine, market making, principal dealing,
  spread markup). Revenue = disclosed brokerage fee only; execution = agency
  back-to-back through approved LP.
- Use focused diffs. Do not rewrite accepted packs or unrelated content.
- Follow CLAUDE_CODE_USAGE_RULES.md for model selection (Sonnet for build,
  Opus for architecture/security/compliance/fund-flow review, Fable for UX copy).
- A blueprint version is authoritative only when DOCUMENT_REGISTER.md says so —
  never infer authority from version number or presence on disk alone.
- After the module is accepted, update MODULE_STATUS.md, DOCUMENT_REGISTER.md
  (if a document's version/status changed), and OPEN_FINDINGS.md (if a finding
  opened/closed), then /compact.

Tell me which module is next per MODULE_STATUS.md, then wait for my go-ahead.
```

---

## Implementation-start instruction

The workspace is in the **implementation phase**. Current state: FND-01, IAM-01, IAM-02
(Phases 0-5), and **SEC-01 (Phases 0-5)** are accepted implementation baselines.

**SEC-01 Phase 5** (security monitoring rule engine + alert lifecycle + Critical-closure
approval via IAM-02's existing `execute-verify` endpoint + dead-letter replay; migrations
012-013) went through two Sonnet self-review passes (4 real gaps found and fixed — an
idempotency stuck-processing bug on Critical close, a rule-engine duplicate-alert race under
concurrent threshold-crossing events, the same race in the seal-verification alert hook, and a
missing `client_id` decision-token binding — all closed with `pg_advisory_xact_lock`/
idempotency-record-status checks) and an independent Opus review (**ACCEPT WITH MINOR
CONDITIONS** — no Critical/High/Medium findings; grant posture, catalogue registration, the
fail-open-for-monitoring/fail-closed-for-ingestion boundary, and the Critical-closure
decision-token binding were all independently reproduced under `role_sec1_runtime`). The two
minor conditions (LOW-1 dead-letter-write-failure observability, LOW-3 `decision_token` log
redaction) were closed in the same pass. **476/476 tests passing, migrations 001→013 + all 4
grant files clean, `tsc -b` clean.** Full detail: `aix-platform/docs/implementation/
SEC-01_IMPLEMENTATION_NOTES.md` §51-63.

**Non-blocking carry-forwards:** P3-L2, F-2…F-6 (F-5 — interim shared internal-token +
trusted-`actor_id` trust model — now more load-bearing after Phase 5's added routes), SoD rule 2
(alert self-close block, deferred/documented), full IAM-02 `sod_rule`-table integration, a live
IAM-02-backed Critical-closure test (currently proven by shared-`fingerprint()` construction +
stubbed fail-closed tests).

**Decision resolved: CFG-01 Feature-Flag / Licence-Lock chosen** (Priority order per FND-01
§7.2: IAM-01 → IAM-02 → SEC-01 → CFG-01 → business tier). **CFG-01 Phase 0 (scaffold) is now an
accepted implementation baseline**: new service `services/cfg1` (Fastify 5, TypeBox
`removeAdditional:false`, own request-context plugin, own interim internal-identity guard, own
config loader, boot-time `assertNoExchangeRuntime`, F3(c) import-boundary tests, one health
route) — no `cfg1` schema/migration/grants/business logic yet. A Sonnet self-review pass found
no defects; independent Opus review → **ACCEPT**, zero Critical/High/Medium/Low findings —
**505/505 tests (476 baseline + 29 new), migrations 001→013 + all 4 existing grant files clean,
`tsc -b` clean**. Full detail: `aix-platform/docs/implementation/CFG-01_IMPLEMENTATION_NOTES.md`.

**CFG-01 Phase 1 (core registries + sealed baseline) is now an accepted implementation
baseline.** Migration `014_cfg1_core.cjs`: `cfg1` schema + `role_cfg1_runtime` (SELECT-only,
verified directly under the real runtime role) + 5 tables (`licence_profile`, `feature`,
`prohibited_feature`, `feature_version`, `config_integrity_seal`). Licence-profile seed (`MB`
approved/LFSA, `PSO` approved/LFSA, `EXCHANGE` pending/LFSA) with three independent Exchange
enforcement layers (licence status + every Exchange feature code separately hard-blocked in
`prohibited_feature` + the boot-time `assertNoExchangeRuntime` guard). A 30-code reconciled
prohibited-feature registry (corrected from a "31-code" planning-message miscount — documented
as a correction, not a scope reduction; no code was invented). A vendored Doc00 v1.3 baseline
constant (no runtime filesystem dependency on this docs repo). An interim sha256 integrity seal
(own canonical-JSON/hash library, explicit allow-list fields, no fake KMS/PKI/digital
signature). `GET /internal/cfg1/readiness` (recomputes/compares both sealed scopes, minimal
non-leaking response, queried not boot-time). `feature`/`feature_version` intentionally empty.
No runtime decision engine, mutation workflow, or IAM-02/SEC-01 integration yet. A Sonnet
self-review pass found and patched one documentation-only defect (no functional defects).
Independent Opus review → **ACCEPT**, zero Critical/High/Medium findings —
**547/547 tests (505 baseline + 42 new), migrations 001→014 + all 5 grant files clean,
`tsc -b` clean**. Full detail: `aix-platform/docs/implementation/CFG-01_IMPLEMENTATION_NOTES.md`.

**Carry-forwards (non-blocking) heading into Phase 2:** **F-1** — seal-hash row-ordering uses
locale-sensitive `localeCompare`; replace with locale-independent codepoint ordering (service
library + migration) before Phase 2's decision-time checks depend on it — no live defect today,
but a `LC_COLLATE` difference between environments could otherwise cause a false
`hash_mismatch`. **F-2** — Phase 2's decision-time integrity check must verify
DB-to-vendored-Doc00 agreement (including `doc00_source_version`), not only the DB-to-seal
internal consistency Phase 1's readiness performs. Interim sha256 seal remains detection-only,
real signing/KMS deferred. The later Exchange Activation Ceremony must remain a structural
fail-closed placeholder — no fake LFSA evidence source, ever. Interim shared-token trust model
carry-forward is now more load-bearing heading into Phase 2+.

**CFG-01 Phase 2 (runtime feature decision engine) is now an accepted implementation
baseline.** Migration `015_cfg1_decision_engine.cjs`: `cfg1.feature_decision_log` (append-only)
+ `cfg1.feature_decision_token` (bounded-reuse, hash-only-at-rest — no raw token column
exists). `POST /internal/cfg1/features/evaluate` (200 decision report for ordinary denials,
throws on integrity/audit/engine failure) + `POST /internal/cfg1/features/verify-decision`
(throws on every non-success outcome). Decision tokens are bounded-reuse (5-minute TTL, not
single-use) — full binding + fresh decision-time integrity + current registry version/hash are
re-checked on every verify; any mismatch revokes the token immediately. No raw token is ever
stored or logged. No `Idempotency-Key` required for either endpoint. **F-1 closed**:
locale-independent `codePointCompare` replaces `localeCompare` everywhere a row ordering feeds a
seal/baseline hash; migration 015 re-verified the real Phase 1 seed data under the corrected
comparator (no divergence). **F-2 closed**: `verifyDecisionTimeIntegrity` adds a decision-time
check that re-derives the seal's own `doc00_baseline_hash`/`doc00_source_version` from the
vendored Doc00 constant, then directly compares live DB rows against that same vendored constant
— never through the seal — closing the "attacker rewrites both data and seal" gap; all 4
required attack scenarios are proven by dedicated tests. Audit integration uses only FND's
`publishAudit`/outbox pattern, transaction-coupled with the decision-log write; any failure
(including the outbox insert) fails the whole call closed with no orphaned decision-log row.
`role_cfg1_runtime` grants extended least-privilege (`feature_decision_log` SELECT+INSERT,
`feature_decision_token` SELECT+INSERT+UPDATE, `foundation.outbox_event` INSERT-only — CFG-01's
first cross-schema grant; Phase 1's 5 tables remain SELECT-only). `cfg1.feature`/`feature_version`
remain empty in production seed; allow path reachable only via synthetic test fixtures.
`caller_module` remains a declared, not authenticated, identity — now more load-bearing since
Phase 2 attributes decisions to it in audit trails. A Sonnet self-review pass updated two
legitimately-stale test assertions (no functional defects). Independent **Opus review →
ACCEPT**, zero Critical/High/Medium findings — **596/596 tests (547 baseline + 49 new),
migrations 001→015 + all 5 grant files clean, `tsc -b` clean**; independently re-run from a
fresh disposable Postgres and reproduced exactly, plus independent static sweeps (import-
boundary, no-Exchange, `localeCompare`, raw-token storage/logging). Two Low, non-blocking
findings: **Low-1** the F-2 direct fact comparison covers only currently decision-relevant
fields — extend if a later phase makes `authority`/`applies_until`/`prohibition_reason`
decision-load-bearing; **Low-2** audit events omit the optional `event_category` field
(cosmetic). Full detail: `aix-platform/docs/implementation/CFG-01_IMPLEMENTATION_NOTES.md` §13.

**Carry-forwards (non-blocking) heading into Phase 3:** real service-identity model must replace
the declared/spoofable `caller_module` before any Phase 3 mutation workflow trusts it as an
identity; real signing/KMS/PKI remains deferred (interim sha256 seal stays detection-only); the
F-2 direct fact comparison should be extended if future phases add decision-load-bearing fields
beyond licence status/prohibited-code presence; the bounded-reuse decision-token model should be
revalidated once real production `feature` rows and a mutation path exist; the later Exchange
Activation Ceremony must remain a structural fail-closed placeholder — no fake LFSA evidence
source, ever; keep `assertNoExchangeRuntime` + the route-surface test in every future phase.

**CFG-01 Phase 3A (governed feature/licence mutation workflow) is now an accepted implementation
baseline** — after an initial independent Opus DO NOT ACCEPT and a blocking-fix patch. Migration
`016_cfg1_mutation_workflow.cjs`: `cfg1.feature_state_change` (blueprint-defined) +
`cfg1.licence_profile_change` (documented blueprint extension). Migration
`017_iam2_register_cfg1_mutation_permissions.cjs`: 8 CFG-01 permissions additively registered in
`iam2.permission` (no IAM-02 guard/grant change, no `role_permission` seed). New routes
`POST /internal/cfg1/feature-changes/{request,apply}` +
`POST /internal/cfg1/licence-profile-changes/{request,apply}`. CFG-01 builds NO maker-checker
tables of its own — mutation APPLY routes require a real IAM-02-issued decision token (bound to
the approving human actor and the exact stored payload hash) verified via IAM-02's **existing**
`execute-verify` endpoint, reusing exactly the pattern SEC-01 Phase 5's Critical-alert-closure
route established; `caller_module` + the shared internal-service-token alone can never authorise
a mutation. `resealScope()`/`computeFeatureScopeHash()` reseal the mutated scope in the same
transaction as the state write and audit publish. Decision-token invalidation extended with
`licenceProfileVersion`/`featureConfigVersion`. `cfg1.prohibited_feature` remains structurally
locked (SELECT-only, no mutation route, no `.manage` permission ever registered).

**Independent Opus review — initial verdict DO NOT ACCEPT**: one High finding **F-1** — the 6
sensitive mutation permissions were registered `licence_locked=true`, which IAM-02's guard
treats as an UNCONDITIONAL, non-overridable deny checked before any role/approval logic —
reserved for genuine business-capability locks, not admin/governance permissions. Every real
feature-apply and licence-profile call was denied outright, for every actor, always — invisible
to the self-reported 646/646 because every test stubbed IAM-02. **Fix**: `licence_locked=false`
on all 8 permissions. Building the real-guard regression test this required surfaced a
**second, identically-shaped defect**: `requires_approval`/`requires_step_up` also return a
non-`allow` decision unconditionally before role-grant lookup — fixed by correcting CFG-01's own
`checkPermission()` to treat `approval_required`/`step_up_required` as a baseline pass (the real,
unconditional gate remains the mandatory `execute-verify` call; independently re-verified that no
route can mutate on a baseline pass alone). New `tests/integration/cfg1-iam2-guard-real.test.ts`
— the first CFG-01 test exercising a real, listening IAM-02 server instead of a stub;
regression-proofed by confirming it fails against a deliberately-reverted copy of the buggy
migration. **Independent Opus re-review → ACCEPT** — **657/657 tests (646 baseline + 11 new),
migrations 001→017 + all 5 grant files clean, `tsc -b` clean**, real IAM-02 guard coverage
independently confirmed genuine, static sweeps (kill-switch/`prohibited_feature`-write/
Exchange-route/F3(c)) all clean. Full detail: `aix-platform/docs/implementation/
CFG-01_IMPLEMENTATION_NOTES.md` §14-15.

**Carry-forwards (non-blocking) heading into Phase 3B:** Phase 3B's own `cfg1.kill_switch.*`
permission registration must use the corrected `licence_locked=false` pattern and extend the
real-IAM-02-guard test file to cover the new codes — do not rely on stubs for the positive path.
Real service-identity model still needed for actor attribution (mutation *authorisation* is now
IAM-02-approval-bound; attribution is not). Real signing/KMS/PKI remains deferred. A
licence-profile status mutation diverging from the vendored Doc00 baseline halts ALL feature
decisions platform-wide via F-2 until `doc00-baseline.ts` is updated and redeployed — needs an
operator runbook before real production use. Role-level SoD remains deferred pending real IAM-02
roles.

**CFG-01 Phase 3B (feature-scoped kill-switch workflow + decision-engine integration) is now an
accepted implementation baseline.** Migration `018_cfg1_kill_switch.cjs`: `cfg1.kill_switch`
(current state, partial unique index `cfg1_kill_switch_one_active_per_feature` — at most one
active switch per feature, DB-enforced), `cfg1.kill_switch_deactivation_request` (documented
extension mirroring `feature_state_change`'s request/apply shape), `cfg1.kill_switch_event`
(append-only). Migration `019_iam2_register_cfg1_kill_switch_permissions.cjs`:
`cfg1.kill_switch.activate` / `.deactivate_request` / `.deactivate` — three codes (the blueprint
names one; IAM-02's guard gates `requires_approval` per-code, and activation/deactivation have
structurally different approval requirements) — all `licence_locked=false` from the start (the
Phase 3A-corrected pattern). No `cfg1.kill_switch.read`, no read/list route, no global
kill-switch, no `scope` jsonb, no seal/reseal participation — all deliberately out of scope.

**Activation** (`POST /internal/cfg1/kill-switches/activate`) is a single step, permission-gated
only, no execute-verify — the route asserts a genuine `permission_granted` baseline as
defence-in-depth since there is no second gate. **Deactivation** is the same two-step
request→apply, IAM-02-approval-bound pattern Phase 3A established. **Partial SoD**: a
deactivation-request proposer cannot equal the kill-switch's own activator. **Residual SoD gap,
explicitly documented**: CFG-01 cannot verify the eventual IAM-02 *approver* of a different
proposer's request is not the original activator — `execute-verify` never exposes approver
identity, closing this needs an IAM-02 change, out of scope here.

**Decision-engine integration**: `evaluateFeature()` gained a live kill-switch check before the
feature-row lookup (pre-emptive block even with no `cfg1.feature` row). **Critical design
correction from planning**: `verify-decision` does NOT re-run `evaluateFeature()`, so an explicit,
separate live kill-switch check was added inside the verify-decision route and threaded into
`verifyDecisionToken()` as a new parameter — an allow token issued before activation is revoked
and fails on its very next verify (`CFG1_TOKEN_REVOKED_BY_KILL_SWITCH`).

**A Sonnet self-review pass found and fixed one real concurrency defect**: `activateKillSwitch`'s
`FOR UPDATE` lookup does nothing for the true first-ever-activation race (zero existing rows), so
two simultaneous first activations could both reach `INSERT`, and the loser would surface a
misleading `CFG1_AUDIT_REQUIRED` (503) instead of the correct `CFG1_KILL_SWITCH_ALREADY_ACTIVE`
(409). **Fixed** with `pg_advisory_xact_lock(hashtext($1))` keyed by `feature_code`, the same
idiom SEC-01 already established for the identical race class.

**Independent Opus review → ACCEPT.** Independently reproduced from a fresh disposable Postgres
(migrations 001→019, all 5 grant files): **708/708 tests, 48 files, 0 failures**, `tsc -b` clean.
Direct catalogue/grant inspection confirmed all 3 permission codes with exact documented flags,
all `licence_locked=false`, zero `role_permission` rows, no `.read` row; column-scoped grants
exactly as documented, no `DELETE`/`TRUNCATE`, `prohibited_feature` unchanged. Real IAM-02 guard
coverage (`cfg1-iam2-guard-real.test.ts`, 14/14) independently confirmed genuine — a real
listening IAM-02 server, not a stub. Static sweeps (Exchange, `prohibited_feature` write,
kill-switch read/list, raw-token storage) all clean. **No Critical/High/Medium findings.** Two
Low/informational, non-blocking: **L1** the partial-SoD self-block is bounded by the same
declared-identity trust model flagged since Phase 2 (not a Phase 3B regression); **L2**
pre-existing test-harness fragility (a shared runtime-role name across two test files; a
DB-ordering-sensitive Phase 1 seed assertion) — neither is Phase 3B code. **CFG-01 Phase 3B is an
accepted implementation baseline.** No code was written or changed during the review. Full
detail: `aix-platform/docs/implementation/CFG-01_IMPLEMENTATION_NOTES.md` §16.

**Carry-forwards (non-blocking) heading into the next CFG-01 phase:** approver-side SoD remains
open until IAM-02's `execute-verify` exposes approver identity or a suitable cross-module SoD
mechanism exists; service-to-service authentication / declared actor identity remains
carry-forward; real signing/KMS/PKI remains deferred; the F-2/licence-mutation operator runbook
is still required before real licence-mutation use; role-level SoD remains deferred pending real
IAM-02 roles; test-harness cleanup is tracked (namespace runtime-role names per test file or
provision centrally; make the Phase 1 empty-table assertion resilient to shared-DB ordering).
Keep `assertNoExchangeRuntime` + the route-surface test in every future phase.

CFG-01 is paused as an accepted implementation baseline through Phase 3B. A CLT-01
post-Phase-3-consolidation-adjacent planning report was produced and **CLT-01 (Client
Onboarding / Client Profile) Phase 0 (scaffold) is now an accepted implementation baseline.**
New service `services/clt1` (Fastify), structurally identical to CFG-01's own Phase 0: own
request-context plugin, own interim internal-identity guard, own config loader
(`CLT1_INTERNAL_SERVICE_TOKEN` fail-closed — no CFG-01/IAM-02/SEC-01 dependency yet), boot-time
`assertNoExchangeRuntime`, F3(c) import-boundary test, exactly one route
(`GET /internal/clt1/health`). **No `/internal/clt1/readiness` this phase** — deliberate, same
CFG-01 Phase 0→1 sequencing (no `clt1.*` schema yet to report on). No schema, no migration, no
grants, no business tables/routes, no CFG-01/IAM-02/SEC-01 integration, no public `/clt1/*`
routes. `lib/errors.ts` ships a structurally-ready but intentionally empty error catalogue —
Phase 0's two failure modes both reuse shared foundation codes (`SERVICE_IDENTITY_REQUIRED`,
`CONFIGURATION_INVALID`), the same discipline IAM-02/SEC-01/CFG-01 each applied at their own
Phase 0/1. A Sonnet self-review pass found no functional defects.

**Independent Opus review → ACCEPT.** Independently reproduced from a fresh disposable Postgres
(migrations 001→019 + all 5 grant files, unchanged — no new CLT-01 migration): **740/740 tests,
54 files, 0 failures** (708 baseline + 32 new), `tsc -b` clean (incremental and forced full
rebuild). Route surface confirmed exactly `GET /internal/clt1/health` (readiness explicitly
absent, proven by a 404 test); F3(c) import-boundary clean; zero forbidden Exchange/business
fragments anywhere in `services/clt1/src`; zero `infra/migrations`/`infra/grants` files touched.
**No Critical/High/Medium findings.** Three Low/informational, non-blocking: **L1** the
route-surface test's forbidden-substring list is stricter than the real boot guard's
hyphenated-fragment matching — reconcile if a legitimate future route (e.g. duplicate-detection
`match_type`) needs a bare term like "matching"; **L2** the interim shared-token identity model
is higher-stakes for CLT-01 specifically, since it will become the platform's PII system of
record; **L3** pre-existing no-DB `vitest run` canary-failure behaviour in unrelated integration
test files, unrelated to CLT-01 code. **CLT-01 Phase 0 is an accepted implementation baseline.**
No code was written or changed during the review. Full detail:
`aix-platform/docs/implementation/CLT-01_IMPLEMENTATION_NOTES.md`.

**Carry-forwards (non-blocking) heading into CLT-01 Phase 1:** `/internal/clt1/readiness` must
land once the first `clt1.*` table exists; the CFG-01 `cfg1.feature`-row operational dependency
must be resolved or explicitly fixture-scoped before Phase 1's CFG-01 gate integration tests;
the interim shared-token identity model should be revisited before any real client-profile
route is exposed; the first CLT-01 IAM-02 permissions must use the `licence_locked=false`
governance-permission pattern from the start (the CFG-01 Phase 3A F-1 lesson) and Phase 1+ must
include real-listening-IAM-02 guard tests once IAM-02 permissions are introduced — never rely
on stubs alone for the positive path.

**CLT-01 Phase 1 (application intake / classification / consent baseline) is now an accepted
implementation baseline.** Migration `020_clt1_intake_baseline.cjs`: `clt1` schema +
`role_clt1_runtime` + 4 tables — `client_application` (the only table Phase 1 code mutates),
`client_profile` (DDL-only, zero rows written — final-approval-gated, out of scope),
`client_classification_evidence` (append-only, `provided`-status only), `consent_record`
(append-only). Internal-only application-intake API (`POST/PATCH/GET applications`,
`classification-evidence`, `consents`, `submit`, `start-review`, `cancel`) plus
`GET /internal/clt1/readiness` (DB/`clt1`-table reachability only, never checks CFG-01). Own
CFG-01 HTTP client (`lib/cfg1-client.ts`, F3(c), never imports `services/cfg1`) calling
`evaluate` only — never `verify-decision`, no decision token stored; `institutional`/`hnwi`/
`professional` map to their own `onboarding.*` codes, `retail`/`unknown` both map to
`onboarding.retail_default` (structurally blocked by CFG-01's own permanent prohibited-registry
entry — no local special-casing). `draft→submitted→under_review` lifecycle plus
`draft/submitted→cancelled`; every mutating `UPDATE` embeds its required current status in the
`WHERE` clause as the concurrency guard (no separate row locking needed). `client_class_status`
stays `claimed` all phase (no verify route — no IAM-02 model yet to gate who may verify a
class claim). Consent required before submit. PII (`legal_name`/`applicant_email`/
`registration_number`/`country_of_incorporation`) stored in `client_application` but never
returned by any route (`safeApplicationResponse()` is the single projection point) — sidesteps
SEC-01 sensitive-read logging entirely rather than half-building it. Audit/outbox
transaction-coupled on every mutation via FND's `publishAudit`/outbox only; CFG-01 denials are
audited inside the transaction before the route throws, so a denied attempt never loses its
audit trail. `role_clt1_runtime` least-privilege: column-scoped `UPDATE` on `client_application`
(excludes `id`/`application_id`/`applicant_type`/`created_by`/`created_at_utc`), `SELECT`-only
on `client_profile`, append-only `SELECT+INSERT` on evidence/consent tables, `INSERT`-only on
`foundation.outbox_event` — no `cfg1`/`iam2`/`sec1` grant. Synthetic `cfg1.feature` fixtures used
in tests only, explicitly documented as such — a real CFG-01 governed-mutation-workflow runbook
is still required before production onboarding of institutional/hnwi/professional classes. No
public `/clt1/*` routes, no final approval/approve/reject/hold, no IAM-02 integration, no
KYC/AML/CDD, no Exchange/trading/settlement runtime. A Sonnet self-review pass fixed two bugs (a
`config.ts` field-narrowing issue caught before commit; a TypeScript control-flow narrowing issue
across three routes requiring an explicit unreachable-fallback throw) plus one header-comment
correction (the "never throw inside `withTransaction`" claim was overstated — clarified that
concurrency-guard throws are safe pre-write, only CFG-01-gate-denial audit writes need the
structured-outcome pattern).

**Independent Opus review → ACCEPT.** Independently reproduced from a genuinely fresh disposable
Postgres (migrations 001→020, all 6 grant files): **806/806 tests, 57 files, 0 failures**
(740 baseline + 66 new), `tsc -b` clean (incremental and forced full rebuild). Grant boundary
verified directly via `information_schema.role_table_grants`/`role_column_grants` (not just by
reading the SQL) — column-scoped `UPDATE` confirmed to exclude the identity-shaping columns;
zero grant into `iam`/`iam2`/`sec1`/`cfg1`. Route surface confirmed exactly the 10 approved
internal routes via direct source enumeration; confirmed only `evaluate` is ever called, never
`verify-decision`. Static sweeps (public-route strings, Exchange/trading fragments, cross-schema
grants, `DELETE`/`TRUNCATE` grants, cross-service imports, decision-token handling) all clean.
**No Critical/High/Medium findings.** Four Low/informational, non-blocking: **L1**
`CLT1_SERVICE_UNAVAILABLE`'s top-level message is inaccurate when the real cause is CFG-01 (not
CLT-01's own DB) being unreachable — the `details` field is accurate; consider a distinct
`CLT1_CFG_GATE_UNAVAILABLE` code later; **L2** audit `actor_id` falls back to
`application_id`/`service` for routes with no declared human-actor field — weak attribution,
tighten with real IAM-02 identity; **L3** no FK from evidence/consent `application_id` to
`client_application` — existence enforced only at the API layer; **L4** readiness probes only
`client_application` as the table-reachability proxy, not all four tables (low-risk, all four
created atomically in one migration). **CLT-01 Phase 1 is an accepted implementation baseline.**
No code was written or changed during the review. Full detail:
`aix-platform/docs/implementation/CLT-01_IMPLEMENTATION_NOTES.md` §6.

**Carry-forwards (non-blocking) heading into CLT-01 Phase 2:** the CFG-01 `cfg1.feature`-row
operational runbook must be executed before any real onboarding use — institutional/hnwi/
professional gates return `unknown_fail_closed` until then; the interim shared-token identity
model is now higher-stakes since CLT-01 stores real (if never-returned) PII; `start-review` and
every other mutation route's actor attribution needs real IAM-02 identity/permission gating; L1
(message accuracy), L2 (weak attribution), and L3 (evidence/consent FK hardening) are tracked
minor cleanups; class-claim verification, final approval, CDD/KYC/AML, authorised
users/mandates, duplicate detection, related-party graph, ongoing monitoring, data
protection/retention, and evidence export all remain fully out of scope — each needs its own
planning pass.

**CLT-01 Phase 2 (CDD outcome gate + final approval control) is now an accepted implementation
baseline** — CLT-01's first real IAM-02 integration. Migration `021_clt1_cdd_final_approval.cjs`:
4 CDD rollup columns on `client_application` (one canonical 9-value status enum: `pending, pass,
fail, hit, rejected, stale, remediation_required, unavailable, not_required`) + 6 decision
columns; new tables `clt1.cdd_outcome` (append-only received-outcome log — receipt only, no
screening engine), `clt1.handoff_status` (delivery-tracking only, no outbound KYC/AML call),
`clt1.application_decision_request` (documented extension mirroring `cfg1.feature_state_change`,
`approve`-only). Migration `022_iam2_register_clt1_permissions.cjs`: exactly 5 IAM-02 permissions
(`clt1.application.review/.approve/.reject/.hold`, `clt1.cdd_outcome.read`), all
`licence_locked=false` from day one (the CFG-01 Phase 3A F-1 lesson applied up front), zero
`role_permission` seed, only `.approve` `requires_approval=true`. `review`/`reject`/`hold`/
`cdd_outcome.read` use IAM-02 `checkPermission`; `approve` is request/apply with mandatory IAM-02
`execute-verify` (payload_hash recomputed from the stored row, self-approval blocked,
token-consumed-after-verify discipline identical to CFG-01 Phase 3A). Approval requires both
KYC+AML handoff rows and all four CDD outcomes `pass`, plus a fresh CFG-01 onboarding-gate
re-check; only on success does it insert exactly one `client_profile` row at
`status='active_limited'` (no wallet/deposit/withdrawal/trading/settlement/Exchange capability) —
reject/hold create no profile. New non-PII `GET /internal/clt1/clients/:client_id/status`.
`CLT1_SERVICE_UNAVAILABLE` split from the new `CLT1_CFG_GATE_UNAVAILABLE`/`CLT1_IAM2_UNAVAILABLE`
(closes Phase 1 L1). No public `/clt1/*` routes, no raw CFG/IAM token stored, no verify-decision
call.

**Independent Opus review → ACCEPT.** Independently reproduced from a genuinely fresh disposable
Postgres (migrations 001→022, all 6 grant files): **889/889 tests, 60 files, 0 failures** (806
baseline + 83 new), `tsc -b --force` clean. IAM-02 catalogue and runtime-grant posture verified
directly at the `information_schema`/catalogue level (not just by reading SQL); real (non-stubbed)
IAM-02 guard coverage (`clt1-iam2-guard-real.test.ts`) independently confirmed genuine. Static
sweeps (public routes, Exchange/trading/settlement/wallet/deposit/withdrawal, screening
implementation, cross-schema grants, PII responses) all clean. **No Critical/High/Medium
findings.** Three Low/informational, non-blocking: **L1** the post-verify approval-failure audit
path emits `clt1.cdd_gate_denied` for several distinct failure causes (CFG-01 gate denial
included) — event-taxonomy/doc-accuracy nit, no security/data impact; **L2** consider a
`UNIQUE(application_id)` constraint on `client_profile` as a structural duplicate-profile
backstop; **L3** unused `ctx` parameter in `createHandoff` / `handoff_status` correlation-column
asymmetry. **CLT-01 Phase 2 is an accepted implementation baseline.** No code was written or
changed during the review. Full detail: `aix-platform/docs/implementation/
CLT-01_IMPLEMENTATION_NOTES.md` §8.

**Carry-forwards (non-blocking) heading into CLT-01 Phase 3:** L1/L2/L3 above; the residual
approver-side SoD gap (IAM-02 `execute-verify` never exposes approver identity); the interim
shared-token identity model (higher-stakes now that CLT-01 is a PII system of record); actual
KYC/AML/sanctions/PEP screening engines, duplicate detection, authorised users/mandates,
related-party graph, ongoing monitoring, data protection/retention, and evidence export all remain
fully deferred; `client_profile` active/suspend/close routes remain deferred; no trading/wallet/
deposit/withdrawal/settlement capability yet.

**CLT-01 Phase 3 (authorised users + client mandate baseline) is now an accepted implementation
baseline** — CLT-01's second real IAM-02 integration. Migration
`023_clt1_authorised_users_mandates.cjs`: `clt1.authorised_user` (role enum `client_admin`/
`client_maker`/`client_approver`/`viewer`; status `active`/`inactive`/`suspended`/`revoked`;
`user_reference` declared, PII-adjacent, never returned by the default list route),
`clt1.client_mandate` (`mandate_type` `standard`/`custom`/`institutional`; status `active`/
`inactive`/`expired`/`revoked`; `rules jsonb` strictly validated by TypeBox — 6 allowed keys, no
arbitrary JSON; `iam2_dual_auth_policy_ref` nullable, never populated — no such IAM-02 concept
exists), `clt1.authorised_user_decision_request`/`clt1.client_mandate_decision_request`
(request/apply binding tables mirroring `application_decision_request`'s shape). Closes Phase 2
L2: `UNIQUE(application_id)` added to `client_profile`. A partial unique index enforces at most
one active mandate per client at the DB level. Migration
`024_iam2_register_clt1_phase3_permissions.cjs`: exactly 8 IAM-02 permissions —
`authorised_user.add`/`.remove` and `client_mandate.create`/`.update` (`requires_approval=true`,
execute-verify-bound maker-checker — blueprint Maker-Checker Required items 5/6 followed
literally, even though `remove` reads as capability-reducing); `authorised_user.read`/`.suspend`/
`.reactivate` and `client_mandate.read` (single-step, `checkPermission`-gated only); all
`licence_locked=false` from day one (the CFG-01 Phase 3A F-1 lesson, applied a third time), zero
`role_permission` seed. add/remove and create/update mirror the Phase 2 `approve/request`+
`approve/apply` pattern exactly (payload_hash snapshotted onto the stored row at request time,
recomputed from that stored row at apply time; self-add block via `CLT1_SELF_APPROVAL_BLOCKED`;
token-consumed-after-verify discipline). suspend/reactivate are single-step atomic
`UPDATE...WHERE status=<from> RETURNING`. `GET /internal/clt1/clients/:client_id/status` gains
additive `mandate_configured`/`authorised_users_configured` booleans — `client_profile.status`
stays `active_limited`; no route in this codebase ever writes `'active'`. No `authorised_party`,
no identity verification, no duplicate detection, no mandate-check endpoint, no sensitive
authorised-user detail route, no IAM-01 client-user linkage, no wallet/deposit/withdrawal/
trading/settlement/Exchange runtime.

**Two real defects were found and fixed during implementation** (via the integration suite
itself, before any review pass, not discovered by review): `SELECT...FOR UPDATE` on
`client_profile` inside `add/apply` and `create/apply` failed with a Postgres permission error —
`FOR UPDATE` requires the UPDATE privilege even for a lock-only read, but `client_profile`
deliberately carries no UPDATE grant (correctly — no Phase 1/2/3 route mutates it). Fixed by
dropping to a plain `SELECT` (no lock needed: nothing else in this codebase ever writes
`client_profile.status`). `remove/apply`'s `UPDATE clt1.authorised_user` statement tried to set
`approval_id`, outside the locked grant's column scope (`status`/`version`/`updated_at_utc`
only). Fixed in the code, not the grant: `authorised_user.approval_id` represents the ADD
approval only and is deliberately not overwritten on removal.

**Independent Opus review → ACCEPT.** Independently reproduced from a genuinely fresh disposable
Postgres (migrations 001→024, all 6 grant files): **949/949 tests, 62 files, 0 failures** (889
baseline + 60 new), `tsc -b --force` clean. A first reproduction attempt doubled-ran the suite
against the same database and surfaced 22 failures, all confined to IAM-01/IAM-02/CFG-01
bootstrap/seed-state tests (none in CLT-01) — traced to the one-time-per-database IAM
bootstrap-to-RBAC transition being consumed twice; recreating a genuinely fresh database and
running exactly once reproduced a clean 949/949, with CLT-01's own tests passing in both runs.
IAM-02 catalogue and runtime-grant posture verified directly at the `information_schema`/
catalogue level (not just by reading SQL) — column-scoped UPDATE grants on `authorised_user`
(`status`/`version`/`updated_at_utc`) and `client_mandate` (`rules`/`mandate_type`/
`mandate_schema_version`/`status`/`approval_id`/`version`/`updated_at_utc`) confirmed exact; zero
grant into `iam`/`iam2`/`cfg1`/`sec1`; zero DELETE/TRUNCATE. Real (non-stubbed) IAM-02 guard
coverage confirmed genuine for all 8 new permissions. Static sweeps (public routes, Exchange/
trading/wallet/deposit/withdrawal/settlement, `authorised_party` implementation, mandate-check
route, PII responses, cross-schema grants) all clean. **No Critical/High/Medium findings.** Three
Low/informational, non-blocking: **F1** the one-active-mandate-per-client unique-violation
surfaces as 503 `CLT1_AUDIT_REQUIRED` instead of a 409-class conflict code — state is always
correct, but the signal misleads retry semantics; **F2** `CLT1_MANDATE_INVALID_STATE`'s doc
wording ("not reachable via any Phase 3 route today") should read "present-but-defensive" — the
throw sites genuinely exist in `routes/mandates.ts`, they are just untriggerable this phase;
**F3** optional wording cleanup for the implementation notes' "no PII (`user_reference`
included) in any response body" sentence (grammatically ambiguous, not incorrect). **CLT-01
Phase 3 is an accepted implementation baseline.** No code was written or changed during the
review. Full detail: `aix-platform/docs/implementation/CLT-01_IMPLEMENTATION_NOTES.md` §9.

**Carry-forwards (non-blocking) heading into CLT-01 Phase 4:** F1/F2/F3 above; Phase 2 L1
(approval-failure audit event-name/notes mismatch) and L3 (unused `ctx` parameter in
`createHandoff`) remain deferred; the residual approver-side SoD gap (IAM-02 `execute-verify`
never exposes approver identity); the interim shared-token identity model (higher-stakes now
that CLT-01 is a PII system of record); no real IAM-01 client-user linkage yet; the CFG-01
`cfg1.feature`-row operational runbook still required before real onboarding gates;
`authorised_party`, identity verification, duplicate detection, related-party graph, ongoing
monitoring, data protection/retention, and evidence export all remain fully deferred;
`client_profile` active/suspend/close routes remain deferred; no trading/wallet/deposit/
withdrawal/settlement capability yet.

**CLT-01 Phase 4 (authorised party + screening linkage baseline) is now an accepted implementation
baseline** — CLT-01's third real IAM-02 integration. Migration `025_clt1_authorised_parties.cjs`:
`clt1.authorised_party` — a legal/compliance party record (director/UBO/controller/authorised
signatory), structurally distinct from `clt1.authorised_user` (Phase 3, operational actor).
APPLICATION-scoped, not client-scoped — deliberately deviating from the blueprint's own literal
§2.12 column list (which lists both `client_id` and `application_id`): parties are compliance data
captured during CDD, alongside `client_classification_evidence`/`consent_record` (Phase 1,
application-scoped), not alongside `authorised_user`/`client_mandate` (Phase 3, client-scoped,
since those only make sense for an already-approved client). No `client_id` column is stored;
routes are `client_id`-scoped at the HTTP layer, resolving `client_id -> client_profile.
application_id` internally before touching the table. `party_type` narrowed to `signatory`/
`director`/`controller`/`ubo` — the blueprint's own enum also lists `client_admin`/
`client_approver`, identical to `authorised_user.role` values (a blueprint-side conflation,
excluded to keep the two tables genuinely separate). No `linked_user_id` column (no real
client-user account-creation flow exists yet). `party_reference` (declared name/reference,
PII-adjacent) is a necessary, blueprint-silent addition — stored, never returned by the default
list route, redacted from request logs. `identity_verification_status`/`sanctions_pep_status` are
the blueprint's own exact screening-linkage enums — receipt-only, no actual screening engine, no
external vendor call anywhere in this codebase. `authority_status` reconciles a genuine
inconsistency between the blueprint's own `05_Database_Design.md` and `06_State_Machine.md`
documents; no reactivation path exists (the blueprint's own diagram draws no arrow back to
`active`/`pending` from any terminal-shaped state).

Migration `026_iam2_register_clt1_phase4_permissions.cjs`: exactly 8 permissions —
`authorised_party.add`/`.update`/`.remove`/`.activate` (`requires_approval=true`,
execute-verify-bound maker-checker — no blueprint "Maker-Checker Required" item names
authorised_party directly, a documented reasoned extension); `authorised_party.read`/`.restrict`/
`.reject`/`.suspend` (single-step, `checkPermission`-gated only); all `licence_locked=false` from
day one, zero `role_permission` seed (21 `clt1.*` permissions total). `add`/`update`/`remove`/
`activate` mirror the Phase 2/3 `request`+`apply` pattern exactly; `activate/apply` requires
blueprint Rule 3 (`identity_verification_status='pass'` AND `sanctions_pep_status IN
('clear','review_required')`), checked both at request time and again inside the locked apply
transaction. `restrict`/`reject`/`suspend` are single-step atomic `UPDATE...WHERE
authority_status=<from> RETURNING`. Screening-outcome receipt (`POST .../screening-outcome`) is
internal-identity-only — no IAM-02 permission check at all, mirrors Phase 2's `cdd_outcome`
receipt exactly. `GET /internal/clt1/clients/{client_id}/status` gains `authorised_parties_
configured` — `client_profile.status` stays `active_limited`; Phase 2's approval gate is
UNCHANGED (confirmed by a regression test). No `authorised_party` FK conflict, no duplicate
detection, no related-party graph, no wallet/deposit/withdrawal/trading/settlement/Exchange
runtime, no IAM-01 client-user linkage.

**Independent Opus review → ACCEPT WITH MINOR CONDITIONS.** Reproduced from a genuinely fresh
disposable Postgres (migrations 001→026, all 6 grant files): **1010/1010 tests, 63 files, 0
failures**, `tsc -b --force` clean. Zero Critical/High findings. One Medium and two Low:
- **M1 (Medium)** — `update/apply`'s `ownership_percentage`/`sec_audit_ref` UPDATE was an
  unconditional overwrite from the stored decision row: omitting one field in `update/request`
  silently NULLed it on the live party, inconsistent with the adjacent screening-outcome route's
  own `COALESCE`-preserve handling of `sec_audit_ref`.
- **L1 (Low)** — a schema-valid sub-hundredths `ownership_percentage` (e.g. `0.0000001`) renders
  via JS's own `String(...)` as exponential notation (`"1e-7"`), which Postgres's `numeric` column
  does not preserve on round-trip, silently diverging the request-time and apply-time payload
  hashes and permanently failing `apply` with a misleading `CLT1_APPROVAL_REQUIRED`.
- **L2 (Low)** — `registerSingleStepTransition`'s `fromStatus`/`toStatus` were interpolated
  directly into the UPDATE statement's SQL string — not exploitable (both are TypeScript
  literal-union-typed, supplied only by three hardcoded call sites, never request-derived), but
  inconsistent with the fully-parameterized convention used everywhere else in this file.

**All three fixed in a follow-up patch, independently re-verified by a targeted Opus re-review.**
M1: both columns now use `COALESCE($n, <column>)` against the live row, mirroring the
screening-outcome route exactly — two new integration tests prove a partial update of either
field preserves the other. L1: the first fix attempt (TypeBox's `multipleOf: 0.01` keyword) was
**empirically wrong** — caught by the patch's own full-suite re-run, not assumed correct — TypeBox/
AJV's `multipleOf` is implemented via a raw floating-point modulo that rejects ordinary values
including whole integers (`45 % 0.01 === 0.009999999999999063` in JS). Corrected to a new pure
function, `validateOwnershipPercentagePrecision` (`lib/authorised-parties.ts`), which round-trips
through a fixed 2-decimal-place rounding and throws the shared `VALIDATION_ERROR` on mismatch — no
silent rounding, stable for every real value in `[0,100]`. L2: `fromStatus`/`toStatus` are now
bound parameters; a full sweep confirmed no other SQL-value interpolation remains in the file.

**Independent targeted Opus re-review → CONDITIONS CLOSED, ACCEPT CLT-01 Phase 4.** Independently
reproduced from a genuinely fresh disposable Postgres: **1017/1017 tests, 63 files, 0 failures**
(1010 baseline + 7 new regression tests — 3 unit for the precision function, 2 integration for
the M1 partial-update preservation, 2 integration for the L1 precision-rejection/round-trip).
IAM-02 catalogue (21 permissions) and both new tables' grants confirmed byte-identical to the
pre-fix state — the patch touched only application-layer validation/write logic, no migration, no
grant, no permission. Static sweeps (public routes, Exchange/trading/wallet/deposit/withdrawal/
settlement, screening/identity-verification engine, duplicate-detection/related-party-graph
implementation) all clean. **Zero remaining findings.** No code was written or changed during
either Opus review pass. Full detail: `aix-platform/docs/implementation/
CLT-01_IMPLEMENTATION_NOTES.md` §10.

**Carry-forwards (non-blocking) heading into CLT-01 Phase 5:** Phase 3 F1 (one-active-mandate
503→409 mapping); Phase 2 L1 (approval-failure audit event-name/notes mismatch) and L3 (unused
`ctx` parameter in `createHandoff`); the residual approver-side SoD gap (IAM-02 `execute-verify`
never exposes approver identity); the interim shared-token identity model (higher-stakes now that
CLT-01 is a PII system of record); no real IAM-01 client-user linkage yet; the CFG-01
`cfg1.feature`-row operational runbook still required before real onboarding gates; identity
verification, actual KYC/AML/sanctions/PEP screening engines, duplicate detection, related-party
graph, UBO-threshold enforcement (the blueprint's own `ubo_identification_threshold` parameter
remains `to_be_defined`), ongoing monitoring, data protection/retention, and evidence export all
remain fully deferred; `client_profile` active/suspend/close routes remain deferred; mandate-check
endpoint remains deferred; no trading/wallet/deposit/withdrawal/settlement capability yet.

**CLT-01 Phase 5 (related-party edge baseline) is now an accepted implementation baseline.**
Migration `027_clt1_related_party_edges.cjs`: `clt1.related_party_edge` — the first CLT-01 table
with no single owning scope (no `owning_application_id`/`owning_client_id`, no `client_id`/
`application_id` column at all). Polymorphic `from_entity_type`/`from_entity_id`/`to_entity_type`/
`to_entity_id` (the blueprint's own literal column names) limited to `client`/`application`/
`party` node types — deliberately excluding `authorised_user` and `client_mandate` (neither is a
node type in the blueprint's own enum either). `relationship_type` adopts the blueprint's own
6-value enum verbatim (`ubo`/`director`/`signatory`/`shared_identity`/`shared_address`/
`associated_account`) even though it mixes role-echo and matching-signal concepts — every edge is
human-declared via maker-checker regardless of label, no automated matching ever produces one.
`status` is `active`/`inactive` only, no reactivation path (a corrected relationship requires a
fresh remove+add). A self-reference CHECK plus a partial unique index (exact-tuple uniqueness
only, no direction-canonicalization for symmetric types — documented, deferred) enforce structure
at the DB level. Migration `028_iam2_register_clt1_phase5_permissions.cjs`: exactly 4 permissions
— `clt1.related_party.add`/`.update`/`.remove` (`requires_approval=true`, execute-verify-bound
maker-checker — a documented reasoned extension, since the blueprint names only `.read`);
`clt1.related_party.read` (single-step); all `licence_locked=false` from day one, zero
`role_permission` seed (25 `clt1.*` permissions total).

`add`/`update`/`remove` are TOP-LEVEL routes (`/internal/clt1/related-party-edges/...`), not
nested under `/clients/:client_id/...` like every Phase 1-4 route — a structural first, since
`related_party_edge` has no owning client/application to nest under. The one client-scoped route
(`GET /internal/clt1/clients/:client_id/related-parties`, the blueprint's own literal route)
resolves the client's own known node identities and returns active edges touching any of them in
either direction — a bounded, explicitly non-recursive single-hop lookup, not graph traversal.
Node existence (`client`→`client_profile`, `application`→`client_application`,
`party`→`authorised_party`) is validated entirely at the application layer (no conditional FK is
possible in Postgres) at both request and apply time. A duplicate active edge on the exact
`(from, to, relationship_type)` tuple maps to a real 409 `CLT1_RELATED_PARTY_EDGE_DUPLICATE` —
deliberately applying the Phase 4 F1 lesson (a near-identical `client_mandate` unique-violation
was left collapsed into a misleading 503) to new code rather than repeating it. No
`related_parties_configured` client-status boolean (deferred — would fold in the same
multi-node-identity lookup, graph-adjacent complexity kept out of the simple status-boolean shape
Phase 3/4 established); Phase 2's approval gate is unchanged. No duplicate-detection engine, no
fuzzy/name/registration-number/shared-address matching, no graph traversal, no UBO-threshold
enforcement, no risk scoring, no screening engine, no public `/clt1/*` routes, no wallet/deposit/
withdrawal/trading/settlement/Exchange runtime.

One test-helper bug (not a code defect) was found and fixed during implementation verification:
`addRelatedPartyEdge()`'s default `from`/`to` entity IDs were placeholder strings not
corresponding to real `client_profile` rows — the route's own (correct) node-existence validation
rejected them, surfacing as 5 unrelated-looking test failures. Fixed by having the helper
auto-create real active clients when the caller doesn't override the IDs.

**Independent Opus review → ACCEPT, zero Critical/High/Medium/Low findings.** Independently
reproduced from a genuinely fresh disposable Postgres (migrations 001→028, all 6 grant files):
**1065/1065 tests, 64 files, 0 failures** (1017 baseline + 48 new), `tsc -b --force` clean. IAM-02
catalogue and runtime-grant posture verified directly at the `information_schema` level (25
`clt1.*` permissions, all `licence_locked=false`, zero `role_permission` seed; `related_party_edge`
UPDATE grant limited to exactly `status`/`evidence_ref`/`approval_id`/`version`/`updated_at_utc`;
no DELETE/TRUNCATE; no cross-schema grant into `iam2`/`cfg1`/`sec1`). Real (non-stubbed) IAM-02
guard coverage confirmed genuine for all 4 new permissions. Static sweeps (public routes,
Exchange/trading/wallet/deposit/withdrawal/settlement, duplicate-detection/graph-traversal/
UBO-threshold, screening engine, `related_parties_configured`, cross-schema grants) all clean.
Safety-critical test bodies (duplicate-409-not-503, payload-hash-mismatch fail-closed,
evidence-only update + version bump, no-reactivation state guard, audit-rollback) independently
re-read and confirmed correct, not just re-run. **No code was written or changed during the
review.** Full detail: `aix-platform/docs/implementation/CLT-01_IMPLEMENTATION_NOTES.md` §11.

**Carry-forwards (non-blocking) heading into CLT-01 Phase 6:** Phase 3 F1 (one-active-mandate
503→409 mapping); Phase 2 L1 (approval-failure audit event-name/notes mismatch) and L3 (unused
`ctx` parameter in `createHandoff`); direction-canonicalization for symmetric related-party edges;
duplicate-detection engine; graph traversal; UBO-threshold enforcement; CDD-gate wiring for
duplicate/related-party findings; the residual approver-side SoD gap (IAM-02 `execute-verify`
never exposes approver identity); the interim shared-token identity model; no real IAM-01
client-user linkage yet; the CFG-01 `cfg1.feature`-row operational runbook still required before
real onboarding gates; identity verification, actual KYC/AML/sanctions/PEP screening engines,
ongoing monitoring, data protection/retention, and evidence export all remain fully deferred;
`client_profile` active/suspend/close routes remain deferred; mandate-check endpoint remains
deferred; no trading/wallet/deposit/withdrawal/settlement capability yet.

**CLT-01 Phase 6 (duplicate-candidate review baseline) is now an accepted implementation
baseline.** Migration `029_clt1_duplicate_candidates.cjs`: `clt1.duplicate_candidate` reconciles
the blueprint's own `05_Database_Design.md` §2.8 table (which already defines real columns, a real
`06_State_Machine.md` §4 state diagram, one permission `clt1.duplicate.review`, and one error code
`CLT1_DUPLICATE_REVIEW_REQUIRED`). The blueprint's own literal shape has exactly two node columns
(`application_id` subject, `matched_client_id` matched); Phase 6 generalizes both sides into a
polymorphic `subject_type/subject_ref`+`matched_type/matched_ref` pair, reusing Phase 5's
`from_entity_type/to_entity_type` idiom, to satisfy the approved scope's `party`-scoped
requirement — `authorised_user`/`client_mandate` are deliberately NOT node types. `match_type` and
`status` adopt the blueprint's own exact enums verbatim (not an invented taxonomy); `status` carries
all 4 blueprint values but `needs_more_info` has zero reachable transition/permission/route this
phase (present-but-defensive). `match_score`/`source_ref` are present for blueprint/future-detector
fidelity but never written; `source_type` only ever writes `'manual'`. A directional,
`status='open'`-scoped partial unique index (no canonicalization — pair direction matters, and a
resolved candidate may be legitimately re-declared) backs `create/apply`'s real 409
`CLT1_DUPLICATE_CANDIDATE_ALREADY_OPEN` mapping (applying the Phase 4 F1 / Phase 5 lesson a third
time, not the generic 503). Migration `030_iam2_register_clt1_phase6_permissions.cjs`: exactly 5
permissions — `duplicate_candidate.create`/`.update`/`.confirm`/`.dismiss` (`requires_approval=true`,
execute-verify-bound maker-checker, a documented generalization of the blueprint's single
permission); `duplicate_candidate.read` (single-step); all `licence_locked=false`, zero
`role_permission` seed (30 `clt1.*` permissions total). Blueprint SoD rule 4 ("duplicate reviewer
cannot approve own duplicate override if they created the application") is implemented, not
deferred — a local, request-time-only check (no IAM-02 change) blocking `confirm`/`dismiss` if the
requester created any application-typed side of the pair. Mutation routes are TOP-LEVEL (no owning
scope); both read routes (application-scoped, client-scoped bounded single-hop) live in the same
new `routes/duplicate-candidates.ts` file — a deliberate variation from Phase 5's split-file
placement. `CLT1_DUPLICATE_REVIEW_REQUIRED` is deliberately NOT registered (zero reachable Phase 6
throw site; Phase 2's approval gate is untouched).

**Independent Opus review → ACCEPT WITH MINOR CONDITIONS.** Reproduced from a genuinely fresh
disposable Postgres (migrations 001→030, all 6 grant files): **1125/1125 tests, 65 files, 0
failures**, `tsc -b --force` clean. Zero Critical/High/Medium findings. One Low: **L1** —
`resolveApplicationCreatedBy` (blueprint SoD rule 4 support) checked only the subject side of an
application-vs-application candidate pair, so a reviewer who created the *matched* application
was not blocked from confirming/dismissing it — a pair shape Phase 6's own polymorphic
generalization permits but the blueprint's original two-column model never contemplated.

**L1 fixed in a follow-up patch, independently re-verified by a targeted Opus re-review.**
`resolveApplicationCreatedBy` renamed to `resolveApplicationCreatedByValues`, now resolves EVERY
application-typed side of the pair (subject, matched, or both) via one `WHERE application_id =
ANY($1)` query; `checkDuplicateSelfReviewBlocked` now takes `readonly string[]` and blocks if the
requester matches any of them — client-vs-client/party-vs-party remain a correct no-op. Four new
integration tests plus new unit tests prove both directions block and the neither-creator case
succeeds; a genuine party-vs-party no-op test was also added (the prior test's title claimed this
coverage without exercising it); the create-audit-event test title was tightened to match what it
actually asserts. **Independent targeted Opus re-review → CONDITIONS CLOSED, ACCEPT CLT-01
Phase 6.** Independently reproduced: **1132/1132 tests** (1125 + 7 new), migrations 001→030 + all
6 grant files clean, IAM-02 catalogue/grants confirmed unchanged from the pre-fix state, zero
remaining findings. No code was written or changed during either Opus review pass. Full detail:
`aix-platform/docs/implementation/CLT-01_IMPLEMENTATION_NOTES.md` §12.

**Carry-forwards (non-blocking) heading into CLT-01 Phase 7:** Phase 3 F1 (one-active-mandate
503→409 mapping); Phase 2 L1/L3; the residual approver-side SoD gap (IAM-02 `execute-verify` never
exposes approver identity); the interim shared-token identity model; symmetric-pair
direction-canonicalization (related-party edges and now duplicate candidates); `CLT1_DUPLICATE_
REVIEW_REQUIRED`/CDD-approval-gate wiring deferred; identity verification, actual KYC/AML/
sanctions/PEP screening engines, duplicate-detection/scoring/fuzzy-matching engines,
merge/consolidation, graph traversal, UBO-threshold enforcement, ongoing monitoring, data
protection/retention, and evidence export all remain fully deferred; `client_profile`
active/suspend/close routes remain deferred; mandate-check endpoint remains deferred; no
trading/wallet/deposit/withdrawal/settlement capability yet.

**CLT-01 Phase 7 (final approval compliance gate wiring) is now an accepted implementation
baseline.** No new migration, IAM-02 permission, grant, or route this phase — pure gate-logic
wiring inside the existing `clt1.application.approve` action. `clt1.duplicate_candidate` (Phase 6)
is wired into the Phase 2 final approval guard as a third precondition alongside the existing
CDD/handoff gates: `evaluateDuplicateCandidateGateForApproval` blocks approval when any touching
candidate has status `open`/`duplicate`/`needs_more_info`, allows when the touching-candidate list
is empty or every touching candidate is `not_duplicate`. Node scope is
`application:application_id` plus `party:<every authorised_party_id under that application>`
(bidirectional); no `client` node check (structurally impossible before this apply creates the
profile); no `related_party_edge` direct block; no `authorised_party` screening direct block; no
approval override. Gate checked at `approve/request`, at the `approve/apply` pre-check, and again
inside the `FOR UPDATE`-locked transaction immediately before the `client_profile` INSERT (proven
genuine by an in-transaction race test) — dynamic, not included in `payload_hash`. New reachable
error code `CLT1_DUPLICATE_REVIEW_REQUIRED` (409). **Phase 2 L1 closed**: the approval-failure
audit wrapper event renamed `clt1.cdd_gate_denied` → `clt1.application_approval_denied` (confirmed
at the DB level: 0 old-name events, new-name events present with per-family `reason_code`).

**Independent Opus review → ACCEPT, zero Critical/High/Medium/Low findings.** Independently
reproduced from a genuinely fresh disposable Postgres (migrations 001→030 unchanged, no migration
031, all 6 grant files clean): **1152/1152 tests, 65 files, 0 failures**, `tsc -b --force` clean.
IAM-02 catalogue confirmed unchanged (30 `clt1.*` permissions, zero `role_permission` seed); route
surface confirmed unchanged (5 routes); static sweeps (public routes, Exchange/trading/wallet/
deposit/withdrawal/settlement, duplicate-detection/scoring/fuzzy-matching/merge-consolidation,
graph-traversal/UBO-threshold, screening engine, `related_party_edge`/authorised-party-screening
direct blocking) all clean. One informational, non-blocking observation: the party-node branch of
the gate is currently unreachable via organic workflow, since `authorised_party` (Phase 4) requires
an already-`active_limited` client to exist first — correct, approved, forward-compatible scope,
not a defect. No code was written or changed during the review. Full detail:
`aix-platform/docs/implementation/CLT-01_IMPLEMENTATION_NOTES.md` §13.

**Carry-forwards (non-blocking) heading into CLT-01 Phase 8:** authorised-party screening does not
block final approval; `related_party_edge` does not directly block approval; the party-node branch
of the duplicate gate is defensively present but organically unreachable until a future phase
allows party configuration during review/re-review; no approval override; symmetric-pair
direction-canonicalization remains deferred; duplicate-detection/scoring/fuzzy-matching/merge-
consolidation/graph-traversal/UBO-threshold/screening/identity-verification engines all remain
fully deferred; no real IAM-01 client-user linkage yet; `client_profile` active/suspend/close and
the mandate-check endpoint remain deferred; the residual approver-side SoD gap and the interim
shared-token trust model remain; Phase 3 F1 (`client_mandate` duplicate 503→409 mapping) and Phase
2 L3 (unused `ctx` parameter in `createHandoff`) remain deferred; no wallet/deposit/withdrawal/
trading/settlement/Exchange capability yet.

**CLT-01 Phase 8 (client profile lifecycle baseline) is now an accepted implementation baseline.**
Migration `031_clt1_client_profile_lifecycle.cjs`: one new table,
`clt1.client_profile_lifecycle_decision_request` — the request/apply binding table for
suspend/reactivate/close, with a REAL FK to `client_profile(client_id)` (the first CLT-01
decision-request table able to FK, since `client_profile.client_id` has carried a UNIQUE index
since migration 020). No `client_profile.status` CHECK change (it already permitted
`suspended`/`closed` since Phase 1) and no new `client_profile` column — `reason`/`evidence_ref`
live only on the decision-request row. Migration `032_iam2_register_clt1_phase8_permissions.cjs`:
exactly 3 permissions (`clt1.client_profile.suspend`/`.reactivate`/`.close`), all
`licence_locked=false`, `requires_approval=true` (every lifecycle mutation is maker-checker — no
single-step lifecycle mutation exists), zero `role_permission` seed (33 `clt1.*` permissions
total). `clt1.client_profile.read` deliberately NOT registered.

Reachable statuses: `active_limited` (existing) plus newly-reachable `suspended`/`closed`;
`active`/`restricted`/`pending` remain present in the CHECK but unreachable. Allowed transitions:
`active_limited -> suspended`, `suspended -> active_limited`, `active_limited -> closed`,
`suspended -> closed`; `closed` is terminal. Reactivate always restores exactly `active_limited`,
never `active`. `client_profile` gains its first-ever UPDATE grant, column-scoped to exactly
`status`/`version`/`updated_at_utc` — which also newly enables `SELECT ... FOR UPDATE` locking on
the table (Phase 8 is the first code that actually mutates it).

**Existing-route impact — near-zero, by design.** `GET /internal/clt1/clients/:client_id/status`
is UNCHANGED — it already returns `client_profile.status` verbatim, so it naturally reports
`suspended`/`closed`. Every client-scoped mutation route (`authorised_user`, `client_mandate`,
`authorised_party`) already required `client_profile.status = 'active_limited'`, so a suspended or
closed client is automatically rejected with `CLT1_CLIENT_NOT_ACTIVE` on every such mutation, and
automatically un-rejected the moment the client is reactivated — zero retrofit. **No close
cascade** — `close/apply` updates ONLY `client_profile.status`; `authorised_user`/`client_mandate`/
`authorised_party` rows are left untouched. No reopen-from-closed path. New error code
`CLT1_CLIENT_PROFILE_INVALID_STATE` (409). Failure audit wrapper `clt1.client_profile_lifecycle_
denied` mirrors Phase 7's own consolidation precedent (`action` + specific `reason_code`, no PII).

**Independent Opus review → ACCEPT, zero Critical/High/Medium/Low findings.** Independently
reproduced from a genuinely fresh disposable Postgres (migrations 001→032, all 6 grant files
clean): **1198/1198 tests, 66 files, 0 failures**, `tsc -b --force` clean. IAM-02 catalogue
confirmed at the DB level (33 `clt1.*` permissions, 3 new, all `licence_locked=false`/
`requires_approval=true`, zero `role_permission` seed); grants confirmed exactly
`{status, version, updated_at_utc}` on `client_profile`; route surface confirmed (6 new routes, no
public `/clt1/*`); static sweeps (Exchange/trading/wallet/deposit/withdrawal/settlement, KYC/AML/
screening, duplicate-detection/scoring/fuzzy/graph/UBO, `client_profile.read` permission,
lifecycle-history route, `client_profile.status='active'` write, cascade into child tables) all
clean. Two informational, non-blocking observations: no local self-action SoD check exists for
lifecycle actions (`client_profile` has no assigned-actor field to compare against — the same
inherited limitation Phase 3's `client_mandate` already has, not new); apply-time decision-row
mismatch reuses `CLT1_CLIENT_NOT_FOUND` rather than a lifecycle-specific code (byte-identical to
`routes/decisions.ts`'s own `approve/apply` precedent). No code was written or changed during the
review. Full detail: `aix-platform/docs/implementation/CLT-01_IMPLEMENTATION_NOTES.md` §14.

**Carry-forwards (non-blocking) heading into CLT-01 Phase 9:** no lifecycle-history read route /
`clt1.client_profile.read` permission; no `status_reason`/`evidence_ref` column on
`client_profile`; no close cascade into child rows; no reopen-from-closed path; no approval
override; authorised-party screening does not block final approval; `related_party_edge` does not
directly block final approval; symmetric-pair direction-canonicalization remains deferred;
duplicate-detection/scoring/fuzzy/merge/graph/UBO engines remain deferred; screening/
identity-verification engines remain deferred; IAM-01 client-user linkage remains deferred;
mandate-check endpoint remains deferred; the residual approver-side SoD gap and the interim
shared-token identity model remain; Phase 3 F1 (`client_mandate` duplicate 503→409 mapping) and
Phase 2 L3 (unused `ctx` parameter in `createHandoff`) remain deferred; no wallet/deposit/
withdrawal/trading/settlement/Exchange capability yet.

**CLT-01 Phase 9 (module closure & final hardening baseline) is now an accepted implementation
baseline — closure and hardening only: no new migration, no schema change, no new IAM-02
permission, no new grant, no new route, no new business capability.** Closed the two oldest open
carry-forwards: **Phase 3 F1** — `client_mandate` `create/apply`'s one-active-mandate-per-client
unique-violation (`idx_clt1_client_mandate_one_active_per_client`, migration 023) now maps to a
real 409 `CLT1_MANDATE_ALREADY_ACTIVE` via `isDuplicateActiveMandateViolation`, mirroring the
Phase 5 `isDuplicateEdgeViolation`/Phase 6 `isAlreadyOpenViolation` pattern exactly, not the
generic 503 `CLT1_AUDIT_REQUIRED` it was collapsed into since Phase 3. **Phase 2 L3** — the unused
`ctx` parameter removed from `createHandoff` and both call sites (`handoff/kyc-kyb`,
`handoff/aml`); behaviour unchanged.

Route-surface test hardened from substring/`.toContain` matching to an exact frozen
`app.printRoutes()` tree-equality assertion (67 lines, catches an accidental extra route, not just
a missing one). Six closure-inventory/regression test suites added, each independently
re-verified at the DB/catalogue level: **route inventory** (exact-set); **permission inventory**
(33 `clt1.*` total — 19 maker-checker + 14 single-step — all `licence_locked=false`, zero
`role_permission` seed); **grant inventory** (zero DELETE/TRUNCATE, zero cross-schema grant, exact
column-scoped UPDATE lists on `client_profile` and all 7 decision-request tables); **audit-event
inventory** (full documented event set emitted across all 8 phase families, `clt1.cdd_gate_denied`
permanently absent, both failure-wrapper events carry `reason_code`, zero PII key-name in any
`clt1.*` payload); **PII/safe-response regression** (one route per family, correctly distinguishing
genuine entity fields like `duplicate_candidate.evidence_ref` from process-internal fields asserted
absent everywhere); **no-Exchange/no-wallet/no-trading posture** (`client_profile.status` fixture-
proven to never be `active`/`trading_enabled`/`wallet_enabled`).

Sonnet self-review found zero Critical/High/Medium defects. One Low review-process note (not a
Phase 9 code defect): the self-review's first full-suite verification attempt used `DATABASE_URL`
instead of `TEST_DATABASE_URL`, so DB-gated test bodies risked silently no-op'ing rather than
genuinely executing — caught by `cfg1-db.test.ts`/`sec1-db.test.ts`'s hard `schemaReady`
assertions failing (rather than silently skipping), corrected, and rerun with `TEST_DATABASE_URL`
set correctly before reporting a result.

**Independent Opus review → ACCEPT, zero Critical/High/Medium/Low findings.** Independently
reproduced from a genuinely fresh disposable Postgres (migrations 001→032 unchanged, no migration
033, all 6 grant files clean): **1223/1223 tests, 66 files, 0 failures**, `tsc -b --force` clean.
`TEST_DATABASE_URL` explicitly set and independently PROVEN (not merely trusted) to be genuinely
exercising DB-gated test bodies: 3,794 accumulated `clt1.*` audit events across 67 distinct event
types after the run (a silently-skipped run would show zero); `client_mandate_create_failed`
present confirms the F1 failure path fired; lifecycle-suspend/reactivate/close events present
confirm Phase 8 code paths ran. IAM-02 catalogue (33 permissions, 19/14 split, zero seed) and the
full grant matrix independently reproduced at the `information_schema`/`iam2.permission` level. No
code was changed during the review. Two informational, non-blocking observations: the audit-event
and PII-payload closure-inventory tests depend on accumulated `foundation.outbox_event` state from
the whole file's prior Phase 1-8 tests having already run (deliberate, documented design); the F1
duplicate-mandate conflict still emits an inherited `severity: high` failure-audit event for what
is a client-side 409 conflict, consistent with the already-accepted Phase 5/6 precedent, not a
Phase 9 regression. Full detail: `aix-platform/docs/implementation/CLT-01_IMPLEMENTATION_NOTES.md`
§15.

**CLT-01 — Accepted implementation baseline COMPLETE (Phases 0-9).** Final carry-forwards
(non-blocking, none blocking future modules): no lifecycle-history read route /
`clt1.client_profile.read` permission; no `status_reason`/`evidence_ref` column on
`client_profile`; no close cascade into child rows; no reopen-from-closed path; no approval
override; the residual approver-side SoD gap; the interim shared-token identity model;
symmetric-pair direction-canonicalization; duplicate-detection/scoring/fuzzy-matching/
merge-consolidation/graph-traversal/UBO-threshold/screening/identity-verification engines; IAM-01
client-user linkage; mandate-check endpoint; wallet/deposit/withdrawal/trading/settlement/Exchange
capability (Exchange permanently locked); consider a future audit-taxonomy pass distinguishing
client-conflict from server-fault failure-event severity platform-wide.

**AML-01 Phase 0 (service scaffold / boot guard / internal route baseline) is now an accepted
implementation baseline.** New service `services/aml1` (Fastify), structurally identical to
CLT-01's/CFG-01's own accepted Phase 0: own request-context plugin, own interim internal-identity
guard (constant-time compare, fail-closed, never trusts caller-supplied `actor_id`), own config
loader (`AML1_INTERNAL_SERVICE_TOKEN` fail-closed — no CLT1/IAM2/CFG1/SEC1 base URL or vendor API
key added yet), boot-time `assertNoExchangeRuntime`, F3(c) import-boundary test (`iam`/`iam2`/
`sec1`/`cfg1`/`clt1`/`fnd` forbidden — `clt1` included from day one since AML-01's future CLT-01
wiring will be HTTP-only, never an import), exactly one route (`GET /internal/aml1/health`,
unauthenticated liveness). **No `/internal/aml1/readiness` this phase** — deliberate, mirrors
CFG-01's/CLT-01's own Phase 0->1 precedent (no `aml1.*` table yet to check). `AML1_ERROR_CODES`
ships empty; `Aml1Error` is a structurally-ready shell, intentionally uninstantiable until Phase 1
adds the first real code — Phase 0's two failure modes reuse shared `SERVICE_IDENTITY_REQUIRED`/
`CONFIGURATION_INVALID`; no `AML1_SERVICE_UNAVAILABLE` yet (no Phase 0 route calls `getPool()`).
No schema, no migration, no grant, no `role_aml1_runtime`, no screening/match/disposition/callback
route, no CLT-01/IAM-02/CFG-01/SEC-01 integration, no vendor/network call, no watchlist data, no
public route, no wallet/deposit/withdrawal/trading/settlement/Exchange capability. Root
`tsconfig.json`/`package.json` wired with the new workspace package following the existing
per-service convention.

A Sonnet self-review pass found zero Critical/High/Medium/Low defects. One self-caught correction
during implementation: an early draft of `aml1-no-exchange.test.ts` incorrectly asserted that
`wallet`/`deposit`/`withdrawal`/`trading`/`settlement`-shaped routes would trip the shared
`findProhibitedExchangeRoutes` guard — reading the actual `PROHIBITED_EXCHANGE_FRAGMENTS` list
showed the guard is Exchange-runtime-specific only (`order-book`/`matching-engine`/
`market-making`/`principal-dealing`/`spread-markup`/`maker-taker`/`client-to-client`/`exchange`);
the test was corrected before reporting a result, and the distinction (AML-01's no-wallet/no-
trading constraint is enforced by route-absence + static greps, not this runtime guard) is now
documented directly in the test file's own header.

**Independent Opus review → ACCEPT, zero Critical/High/Medium/Low findings.** Independently
reproduced from a genuinely fresh disposable Postgres (migrations 001->032 unchanged, no new
migration, all 6 grant files clean): **1261/1261 tests, 71 files, 0 failures** (1223 baseline +
38 new), `tsc -b`/`tsc -b --force` clean. Direct DB inspection confirmed zero `aml1` schema rows
in `information_schema.schemata` and zero `role_aml1_runtime` rows in `pg_roles` (not just a file
listing). Import boundary independently re-derived (every specifier in `services/aml1/src` is
either an own-tree relative path, bare `@aix/foundation`, `fastify`, or `node:crypto`). Static
sweeps (public route, Exchange/wallet/trading fragments, vendor/watchlist/network-call code,
cross-service imports) all clean. No code was changed during the review. Two informational,
non-blocking observations: the empty error catalogue makes `Aml1Error` intentionally
uninstantiable until Phase 1 adds real codes (by design); the Phase 0 route-fragment test's
forbidden-term sweep (`screening`/`match`/`disposition`) must be consciously updated once Phase 1
adds AML-01's own legitimate routes using those terms — flagged now so it is a deliberate Phase 1
edit, not a surprise regression. Full detail:
`aix-platform/docs/implementation/AML-01_IMPLEMENTATION_NOTES.md` §1.

**AML-01 — accepted implementation baseline through Phase 0.** Carry-forwards (non-blocking) into
Phase 1: populate `AML1_ERROR_CODES` only when real reachable throw sites exist; add
`AML1_SERVICE_UNAVAILABLE` only when the first DB-querying route exists; create the `aml1` schema
and `role_aml1_runtime` in Phase 1; keep the screening stub adaptor a strict boundary (no real
vendor/watchlist/network calls) with mandatory deterministic HIT fixtures; declared-identity
provenance must be explicit (screening runs on CLT-01's declared data, not KYC-verified identity);
the interim shared-token identity model remains a platform-wide carry-forward, more consequential
for AML-01 than most prior modules given future screening-PII sensitivity; no IAM-02 permissions
until the human-disposition/maker-checker phase; no CLT-01 callback until a later phase.

**AML-01 Phase 1 (point-in-time screening record & deterministic stub adaptor) is now an accepted
implementation baseline.** Migration `033_aml1_core.cjs`: `aml1` schema + 4 tables —
`screening_request` (workflow row, NO PII), `screening_subject_snapshot` (declared-identity PII,
isolated in its own table, append-only), `screening_result` (append-only, one per completed
screen), `screening_match` (append-only, zero-or-more per result). `aml1_runtime_grants.sql`:
`role_aml1_runtime` (least-privilege — SELECT/INSERT on all 4 tables, UPDATE column-scoped to
`screening_request.{status, completed_at_utc, version}` only, zero DELETE/TRUNCATE, zero
cross-schema grant).

`POST /internal/aml1/screening-requests` runs the entire screening lifecycle SYNCHRONOUSLY in one
transaction: INSERT request (`requested`) -> INSERT subject snapshot -> run the deterministic stub
adaptor (`lib/screening.ts`'s `screen()`, pure, no network/vendor call) -> on a screened outcome,
INSERT result + zero-or-more matches and UPDATE to `completed`; on the stub's own
provider-unavailable signal, UPDATE to `failed` instead (no result row ever written for a failed
screen). `GET .../screening-requests/:id` (safe-projection read) and `GET /internal/aml1/readiness`
(DB/`aml1`-table reachability, mirrors CLT-01's own precedent) also added. Both business routes
are internal-identity-guarded; health/readiness remain unauthenticated.

Deterministic synthetic fixtures (clearly labeled `"AML1 TEST ..."`, never real list data): a clean
name -> `clear`/zero matches; one fixture each for sanctions/PEP/adverse-media -> `potential_match`
+ exactly one match in that category (the load-bearing proof that the pipeline can genuinely
surface a hit, not an always-clear stub); one provider-down fixture -> `unavailable`.
`safeScreeningResponse` is the single safe-projection point — returns ONLY
`{screening_request_id, subject_type, subject_ref, provenance, status,
result:{overall_status, matched_categories, screened_at_utc}}`, never name/registration_number/
date_of_birth/nationality/matched_name/match_detail/score. `subject_ref` is an opaque, unverified
caller-supplied reference this phase — no CLT-01 HTTP client, no CLT-01 callback.

Five reachable error codes added (`AML1_SERVICE_UNAVAILABLE`/`AML1_SCREENING_REQUEST_NOT_FOUND`/
`AML1_SCREENING_SUBJECT_INVALID`/`AML1_SCREENING_PROVIDER_UNAVAILABLE`/`AML1_AUDIT_REQUIRED`);
`AML1_SCREENING_REQUEST_INVALID_STATE` and all disposition/vendor/CLT-callback codes deliberately
NOT added (no reachable throw site — screening is entirely synchronous this phase). Audit/outbox
(`aml1.screening_request_created`/`aml1.screening_completed`/`aml1.screening_failed`,
`source_module: "AML-01"`) is transaction-coupled and PII-free in metadata.

A real gap was caught and fixed during Phase 1 self-review, before Opus review:
`declared_identity.date_of_birth` initially accepted any string up to 40 chars at the schema
layer, so a malformed value would reach the `date`-typed DB column and fail as an opaque
`AML1_AUDIT_REQUIRED` (503) instead of a clean `AML1_SCREENING_SUBJECT_INVALID` (422) — fixed with
`isValidCalendarDate` (regex shape check + `Date` round-trip verification, rejecting both
malformed strings and calendrically-impossible dates like Feb 30 or a non-leap-year Feb 29) before
any database write; error `details` never echo the rejected value.

**Independent Opus review -> ACCEPT, zero Critical/High/Medium/Low findings.** Independently
reproduced from a genuinely fresh disposable Postgres (migration 001->033, `aml1_runtime_grants.sql`
+ all 6 prior grant files clean): **1317/1317 tests, 74 files, 0 failures** (1261 baseline + 56
new), `tsc -b --force` clean. Grant matrix independently confirmed exact at the
`information_schema` level, including a LIVE proof that UPDATE is actually denied on the three
append-only tables under `role_aml1_runtime` (not just absent from the catalogue). No code was
changed during the review. Four informational, non-blocking observations: a stale doc-comment in
`lib/errors.ts` not yet mentioning the date_of_birth case (closed in the status-sync pass); an
unused computed value in the POST handler's transaction-return type; `matched_categories` ordering
differs cosmetically between audit metadata and the HTTP response with no observable effect; the
DOB validator's round-trip check harmlessly rejects implausible 2-digit-mapped years. Full detail:
`aix-platform/docs/implementation/AML-01_IMPLEMENTATION_NOTES.md` §2.

**AML-01 — accepted implementation baseline through Phase 1.** Carry-forwards (non-blocking) into
Phase 2: no CLT-01 callback / CLT-01 HTTP client yet; no IAM-02 permissions yet; no human match
disposition / maker-checker yet; no real vendor/watchlist/network integration;
`AML1_SCREENING_REQUEST_INVALID_STATE` remains unregistered until a real throw site exists (the
phase that introduces a request lifecycle / re-screen / disposition); the interim shared-token
identity model remains a platform-wide carry-forward, more consequential for AML-01 given
screening-PII sensitivity; `fetchSafeResponseOrThrow`'s 3-sequential-query pattern is an
acceptable, non-blocking future micro-optimization.

**AML-01 Phase 2A (CLT-01 outcome delivery) is now an accepted implementation baseline.** Migration
`034_aml1_clt_outcome_delivery.cjs`: `aml1.screening_request` gains a nullable `subject_parent_ref`
column (the parent `client_id` for an `authorised_party` subject, INSERT-time only, deliberately
excluded from the runtime role's UPDATE grant); new table `aml1.clt_outcome_delivery` implementing
a two-phase delivery model — TX1 inserts the delivery row `pending` and publishes
`aml1.clt_outcome_delivery_attempted`, commits; the CLT-01 HTTP call happens OUTSIDE any
transaction, timeout-bounded via `AbortSignal.timeout`; TX2 updates the delivery to
`succeeded`/`failed`, increments `attempt_count`, records `response_ref`/`failure_reason_code`,
publishes `aml1.clt_outcome_delivery_succeeded`/`_failed`, commits. A crash between TX1 and TX2
leaves a retriable `pending` row; at-least-once delivery is the approved posture (a duplicate
successful CLT-01 receipt is safe-but-noisy, never engineered around by adding idempotency to
CLT-01 itself).

AML-01's own `lib/clt1-client.ts` (F3(c)-clean, never imports `services/clt1/**`) wraps CLT-01's
TWO EXISTING receipt endpoints only — never a new CLT-01 route — and fails closed on
non-2xx/timeout/network-error/malformed-response, extracting only an opaque `response_ref`, never
the raw CLT-01 body or its token. `lib/clt1-outcome-mapping.ts` derives AML-01's own "effective
status" from `screening_match.match_status` values (never from `screening_result.overall_status`
directly, since `dismissed` is a match-level value, not a result-level one) and maps it
per-endpoint: application-level (`clear`/`clear_after_review`->`pass`, `potential_match`->`pending`,
`confirmed_hit`->`hit`, split into two deliveries — `aml_sanctions` and `pep_adverse_media`, the
latter fed by both `pep` and `adverse_media` matches since CLT-01 fuses them into one outcome type)
and authorised-party-level (`clear`/`clear_after_review`->`clear`, `potential_match`->
`review_required`, `confirmed_hit`->`hit`; never writes `identity_verification_status`, which
belongs to KYC-01).

Three new routes, all internal-identity-guarded: `POST .../screening-requests/:id/clt-outcome`,
`POST .../clt-outcome-deliveries/:id/retry`, `GET .../clt-outcome-deliveries/:id`. A
micro-stabilization pass (after the first Opus review round) made `AML1_CLT_DELIVERY_FAILED`
genuinely reachable — both delivery/retry routes now throw it (502) *after* TX2 has already
committed the failed-delivery evidence, so the row stays durably persisted, queryable via GET, and
retriable regardless of what the original caller saw. `role_aml1_runtime` extended with
`SELECT`/`INSERT` + column-scoped `UPDATE` on `clt_outcome_delivery` (`status`/`attempt_count`/
`failure_reason_code`/`response_ref`/`delivered_at_utc`/`version` only); zero `DELETE`/`TRUNCATE`,
zero grant into `clt1` or any other module's schema, `subject_parent_ref` confirmed NOT in the
`screening_request` UPDATE grant — all independently proven LIVE under the real runtime role, not
just read from the grant SQL.

The real-CLT-01 integration test (`aml1-clt1-outcome-delivery-real.test.ts`) provisions its own
private, uniquely-named throwaway database per run (full migration chain + all 7 grant files,
dropped in `afterAll`) — eliminating a cross-file collision with `clt1-db.test.ts`'s unscoped
cleanup without touching any CLT-01 production or test code — and proves CLT-01's real
`under_review` precondition plus real rollup convergence (including an at-least-once
duplicate-delivery case), not a stub-only positive path. No IAM-02, no human disposition, no
sensitive-read route, no Exchange/wallet/trading/settlement scope.

**Independent Opus review -> ACCEPT WITH LOW FINDINGS.** Independently reproduced TWICE, each from
a genuinely fresh disposable Postgres, with default file-level parallelism: **1388/1388 tests, 77
files, 0 failures both times** (1317 baseline + 71 new), migrations 001->034 clean + all 7 grant
files clean, `tsc -b --force` clean. Grant matrix and column-level immutability LIVE-proven under
the real runtime role (including `subject_parent_ref` insert-only), 19 PII/secret terms swept clean
across all real `aml1.clt_outcome_delivery*` audit payloads, throwaway-DB isolation independently
confirmed genuine (created and dropped, zero pollution of the shared test DB), zero CLT-01 file
touched. Two Low, three Informational, non-blocking findings: **Low-1** `delivered_status` has no
CHECK constraint, unlike its sibling enum-like columns (not live-reachable — the mapping library is
a total function over a closed TypeScript union, and the column carries no UPDATE grant); **Low-2**
`failure_reason_code` is written from CLT-01's `error.code` with no length clamp before the
`varchar(64)` column (no live risk — longest real code observed is 40 chars — but an oversized
value from an untrusted intermediary would fail safe as `AML1_AUDIT_REQUIRED` with a misleading
code rather than a clean rejection); **Info-1** a partial-failure response discards the succeeded
delivery's ID, recoverable only from free-text `details[].issue`; **Info-2** `delivery_id`'s index
duplicates its own UNIQUE-created index (mirrors migration 033's own precedent); **Info-3** the
real-CLT-01 test leaves one cluster-global LOGIN role uncleaned, consistent with every other
integration test file's existing convention. Full detail:
`aix-platform/docs/implementation/AML-01_IMPLEMENTATION_NOTES.md` §3.

**AML-01 — accepted implementation baseline through Phase 2A.** Carry-forwards (non-blocking) into
Phase 2B: Low-1/Low-2/Info-1/Info-2/Info-3 above; no CLT-01 callback beyond the two existing
receipt endpoints; no human match disposition / maker-checker yet; no AML-01 IAM-02 permissions yet
(first ones must be `licence_locked=false` from day one — the CFG-01 F-1 lesson — with
real-listening-IAM-02 guard tests, never stub-only); no sensitive-read path for full match detail
yet; `screening_match` still carries zero UPDATE grant (Phase 2B's disposition workflow needs its
first deliberate column-scoped grant there, keeping `matched_name`/`match_detail`/`score`
immutable); post-disposition re-delivery should reuse the existing Phase 2A delivery routes
unchanged; the interim shared-token identity model remains a platform-wide carry-forward.

**AML-01 Phase 2B (human match disposition + IAM-02 + sensitive read) is now an accepted
implementation baseline.** Migration `035_aml1_match_disposition.cjs`: `aml1.screening_match` gains
its first-ever UPDATE grant, column-scoped to exactly `match_status`/`reviewed_by`/
`reviewed_at_utc`/`approval_id`/`version`/`updated_at_utc` — `matched_name`/`match_detail`/`score`/
`category`/`list_source`/`screening_result_id`/`screening_match_id`/`created_at_utc` remain
permanently immutable; new table `aml1.match_disposition_decision_request` (request/apply binding
table, mirrors CLT-01's own `duplicate_candidate_decision_request` shape). Migration
`036_iam2_register_aml1_permissions.cjs` registers AML-01's first 4 IAM-02 permissions:
`aml1.screening.read`/`.sensitive_read` (single-step) and `aml1.match.confirm`/`.dismiss`
(maker-checker) — all `licence_locked=false` from day one (the CFG-01 F-1 lesson applied
proactively, not discovered by a later review pass), zero `role_permission` seed.

AML-01's own `lib/iam2-client.ts` (F3(c)-clean, never imports `services/iam2/**`) is AML-01's first
IAM-02 dependency — 5s `AbortSignal.timeout`-bounded, fail-closed on deny/non-2xx/network-error/
timeout/malformed body, `approval_required`/`step_up_required` treated as a baseline pass (the real
gate for confirm/dismiss is always the separate `execute-verify` call). Verified against a REAL
listening IAM-02 guard (`tests/integration/aml1-iam2-guard-real.test.ts`), not only a stub.

Two new read routes: `GET .../screening-requests/:id/matches` (PII-free match inventory — returns
`screening_match_id`/`category`/`match_status`/`reviewed_at_utc` only, and exists because no prior
route ever returned `screening_match_id`, so disposition would otherwise be unreachable) and
`GET .../matches/:id/sensitive-detail` (the ONLY AML-01 route ever returning `matched_name`/
`match_detail`/`score`/`list_source`, write-before-return same-transaction fail-closed
`aml1.sensitive_match_detail_read` audit — if the audit write fails, the read fails, no unlogged
sensitive disclosure).

Four new disposition routes (`confirm/request`, `confirm/apply`, `dismiss/request`, `dismiss/apply`)
follow the same request/apply + IAM-02 execute-verify pattern as CLT-01's own maker-checker
tables: `payload_hash` snapshotted at request time, recomputed from the STORED row at apply time
(never from caller-supplied apply input); `fingerprint(token)` stored, never the raw decision
token; `potential_match`->`confirmed_hit`/`dismissed` are both terminal, no re-open path. Strict
SoD: the disposition requester may never equal the original screening request's own
`requested_by` (`AML1_SELF_DISPOSITION_BLOCKED`) — combined with IAM-02's own unconditional
requester != approver rule, a normal workflow needs three distinct identities (screener,
disposition requester, approver). Apply's concurrency guard uses `SELECT...FOR UPDATE` on both the
decision row and the match row, race-loser resolving to a clean `AML1_DISPOSITION_INVALID_STATE`
or `AML1_MATCH_INVALID_STATE`, never a silent double-apply.

Post-disposition re-delivery is NOT automatic — apply returns `redelivery_required:true` +
`screening_request_id`; the caller must explicitly invoke the EXISTING Phase 2A
`POST .../clt-outcome` route, unchanged, which correctly re-maps a dismissed match to
`clear_after_review`/`pass` and a confirmed_hit match to `confirmed_hit`/`hit` with zero code
changes to the Phase 2A mapping library. This phase also closes Phase 2A's own Low-1
(`delivered_status` CHECK constraint added, covering exactly the 5 values the mapping library ever
writes) and Low-2 (`failure_reason_code` clamped to 64 chars before writing to the `varchar(64)`
column).

Exactly 8 new error codes, each with a reachable throw site (`AML1_SCREENING_MATCH_NOT_FOUND`,
`AML1_MATCH_INVALID_STATE`, `AML1_DISPOSITION_NOT_FOUND`, `AML1_DISPOSITION_INVALID_STATE`,
`AML1_PERMISSION_DENIED`, `AML1_APPROVAL_REQUIRED`, `AML1_IAM2_UNAVAILABLE`,
`AML1_SELF_DISPOSITION_BLOCKED`); `AML1_SENSITIVE_READ_FORBIDDEN` deliberately not added (identical
condition to `AML1_PERMISSION_DENIED`). Exactly 4 new transaction-coupled audit events
(`aml1.match_disposition_requested`/`_confirmed`/`_dismissed`, `aml1.sensitive_match_detail_read`),
no PII in any metadata; `req.body.reason` and `req.body.decision_token` added to the log-redaction
list. No real vendor/list/monitoring integration, no wallet/Travel Rule/deposit/withdrawal/trading/
settlement/Exchange scope.

**Independent Opus review -> ACCEPT WITH LOW FINDINGS.** Independently reproduced TWICE, each from
a genuinely fresh disposable Postgres, with default file-level parallelism: **1464/1464 tests, 80
files, 0 failures both times** (1388 baseline + 76 new), migrations 001->036 clean + all 7 grant
files clean, `tsc -b --force` clean. Grant matrix independently confirmed exact at the
`information_schema` level (screening_match's 6-column UPDATE grant, match_disposition_decision_
request's 4-column UPDATE grant), migration 035/036 down-migration independently verified to
cleanly remove all 4 permissions/the new table/all 5 new columns, zero Phase 3/Exchange/wallet/
trading term found in a code-only sweep of `services/aml1/src`, status docs confirmed untouched
pre-sync. Three Low, non-blocking findings: **Low-1** IAM-02 unreachability during execute-verify
is reported as `AML1_APPROVAL_REQUIRED`/403 rather than `AML1_IAM2_UNAVAILABLE`/503 (fail-closed
either way — no security impact, a diagnostics-accuracy nit); **Low-2** the sensitive-detail route
checks match existence before the IAM-02 permission check, creating a low-risk existence oracle and
materialising the PII row in-process before permission is established (IDs are opaque UUIDs,
enumeration impractical); **Low-3** no regression test proving the disposition `reason` free text
stays out of audit metadata (holds by inspection — the metadata object literals never include it —
but no test pins it). Full detail: `aix-platform/docs/implementation/AML-01_IMPLEMENTATION_NOTES.md`
§4.

**AML-01 — accepted implementation baseline through Phase 2B.** Carry-forwards (non-blocking) into
Phase 3: Low-1/Low-2/Low-3 above; Phase 2A Info-1/Info-2/Info-3 (unchanged, still deferred); the
residual approver-side SoD gap (IAM-02's own `execute-verify` never exposes approver identity — a
platform-wide inherited limitation, not AML-01-specific); the interim shared-token identity model
(now materially more consequential — Phase 2B is the first AML-01 surface returning sanctions/PEP/
adverse-media PII and the first that mutates a compliance decision); AML-01 still screens on a
deterministic stub adaptor, not a real vendor/list integration — no closure review is appropriate
until a real vendor/list adaptor boundary exists.

**AML-01 Phase 3A (micro-hardening) is now an accepted implementation baseline.** Closes all three
Phase 2B Low findings, with no migration, schema, grant, route, or permission change of any kind.

**Low-1 closed** — `routes/matches.ts`'s confirm/dismiss apply handler now applies the same
`reason === "iam2_unavailable"` ternary already used at every `checkPermission` call site to
`verifyDecisionToken`'s result: IAM-02 unreachable at execute-verify time now throws
`AML1_IAM2_UNAVAILABLE`/503, while a genuine execute-verify rejection (tampered token, payload-hash
mismatch) still correctly throws `AML1_APPROVAL_REQUIRED`/403. No mutation occurs in either failure
case — the throw precedes the transaction entirely, and a decision row left `requested` by an
unavailability failure is provably retriable once IAM-02 recovers. `lib/iam2-client.ts` itself was
NOT modified, only its two AML-01 consumer call sites.

**Low-2 closed** — the sensitive-detail route now calls IAM-02 `checkPermission` BEFORE fetching the
`screening_match` row. An unpermissioned caller requesting an unknown `screening_match_id` now gets
403 `AML1_PERMISSION_DENIED`, never 404 — closing the existence-oracle gap — and the PII-bearing row
is never materialised in-process before authorization is established. A permissioned caller
requesting an unknown match still correctly gets 404 `AML1_SCREENING_MATCH_NOT_FOUND`. Write-before-
return, same-transaction, fail-closed `AML1_AUDIT_REQUIRED` on audit failure, and the exact 6-field
response projection are all unchanged.

**Low-3 closed** — a new regression test proves a disposition's `reason` free text is genuinely
stored as evidence on `match_disposition_decision_request.reason` while never appearing in any
`aml1.match_disposition_*` audit `payload_ref`, closing the coverage gap without relocating or
weakening the existing file-level PII sweep.

Route tree remains exactly 13 routes; `aml1.*` IAM-02 permission count remains exactly 4; `aml1`
schema table count and `role_aml1_runtime`'s full grant matrix (including the exact 6-column
`screening_match` UPDATE grant and 4-column `match_disposition_decision_request` UPDATE grant from
Phase 2B) confirmed byte-identical at the `information_schema` level.

**Independent Opus review -> ACCEPT, zero Critical/High/Medium/Low findings.** Independently
reproduced TWICE, each from a genuinely fresh disposable Postgres, under default file-level
parallelism: **1468/1468 tests, 80 files, 0 failures both times** (1464 baseline + 4 new), migrations
001->036 unchanged (no migration 037 exists) + all 7 grant files clean, `tsc -b --force` clean, a
code-only sweep found zero Phase 3B/3C term introduced. Three informational, non-blocking
observations: **I-1** one theoretical branch of the Low-1 fix (IAM-02 responding 200 with
`execution_authorised: false`) would still map to 503 rather than 403, but the IAM-02 client's own
header comment documents this shape as unreachable against the real execute-verify route (execute-
verify always returns non-2xx on failure) — confirmed by the real-guard test suite, left as-is
rather than editing the client for an untriggerable branch; **I-2** CLT-01 and CFG-01 still collapse
ALL execute-verify failures — including genuine IAM-02 unavailability — into their own single
`_APPROVAL_REQUIRED`-style code, at 10 combined call sites; AML-01 Phase 3A fixed this locally, but
the same latent gap remains open in both sibling modules — a NEW platform-wide carry-forward,
identified by this review, not previously tracked; **I-3** `lib/errors.ts`'s header doc-comment for
`AML1_IAM2_UNAVAILABLE` was corrected in the same pass to document its second reachable throw site
(comment-only — `AML1_ERROR_CODES` itself is byte-identical). Full detail:
`aix-platform/docs/implementation/AML-01_IMPLEMENTATION_NOTES.md` §5.

**AML-01 — accepted implementation baseline through Phase 3A.** Carry-forwards (non-blocking) into
Phase 3B: Phase 2A Info-1/Info-2/Info-3 (unchanged, still deferred); the residual approver-side SoD
gap (platform-wide, not AML-01-specific); the interim shared-token identity model (increasingly
consequential as AML-01's PII/compliance-mutation surface expands); the NEW platform-wide
carry-forward that CLT-01/CFG-01 still collapse execute-verify unavailability into approval-required-
style errors (I-2 above); the Phase 3B architectural prerequisite that the Phase 1 screening
lifecycle (`routes/screening.ts`) must be restructured so a future provider call runs OUTSIDE the DB
transaction, mirroring Phase 2A's own two-phase delivery model, before any real vendor/list adaptor
can land; AML-01 still screens on a deterministic stub adaptor — no closure review is appropriate
until a real vendor/list adaptor boundary exists.

**AML-01 Phase 3B (two-phase screening lifecycle + provider adaptor boundary) is now an accepted
implementation baseline.** Closes the Phase 3A architectural prerequisite. Migrations
`037_aml1_provider_attempt.cjs` + `038_iam2_register_aml1_provider_permission.cjs`.

`POST .../screening-requests` is now TWO-PHASE: TX1 inserts `screening_request` (`requested`) +
`screening_subject_snapshot` (including the new `subject_nature`) + `screening_provider_attempt`
(`pending`), publishes `aml1.screening_request_created`, commits. The provider call happens OUTSIDE
any transaction, 5s timeout-bounded via `Promise.race` (`lib/providers/registry.ts`'s
`screenViaProvider`). TX2 records the attempt outcome: on success, `succeeded` + `screening_result`/
`screening_match` rows + request `completed`, publishing `aml1.screening_completed`; on ANY failure
(provider unavailable OR its response could not be normalized), `failed` + request `failed`, no
result/match row ever written, publishing `aml1.screening_failed` — commits BEFORE either throw. HTTP
response contract UNCHANGED, stays synchronous — no async/polling. Independently verified
structurally (the provider call sits strictly between TX1's close and TX2's open by line position)
and by a witness-provider integration test that queried the DB on a separate connection mid-call and
observed TX1's already-committed `requested`/`pending` state.

New AML-01-owned provider adaptor boundary: `lib/providers/types.ts` (`ScreeningProvider` interface;
`ProviderScreeningOutcome` = `screened`/`unavailable`/`invalid_response`), `lib/providers/
stub-provider.ts` (the deterministic stub moved here byte-identical to its Phase 1-3A fixtures, plus
3 new ones — malformed response, unknown category, null score), `lib/providers/registry.ts`
(`screenViaProvider` is the ONE invocation point — throw/reject/timeout all map to `unavailable`,
NO always-clear fallback ever). `routes/screening.ts` imports the registry only, never the stub
directly and never a vendor SDK. `AML1_SCREENING_PROVIDER` config defaults to the stub in dev/test,
validated against the registry's known-id set, fail-closed on an unknown id — and **fails closed at
boot (`CONFIGURATION_INVALID`) if `ENVIRONMENT=prod` and the provider is still the stub**, in
`loadAml1Config` (the real production entrypoint, `index.ts`, is fully covered by this).

`subject_nature` (`individual`/`entity`) is now a REQUIRED top-level body field, CALLER-SUPPLIED,
never derived by AML-01, stored on `screening_subject_snapshot`. Gates payload minimization
(`lib/screening.ts`'s `buildProviderScreeningPayload`): `registration_number` sent only for `entity`,
`date_of_birth`/`nationality` only for `individual`; `subject_ref`/`screening_request_id`/
`requested_by`/`provenance` NEVER sent; the raw provider payload is never stored, returned, audited,
or logged — only `fingerprint()` hashes are retained (`screening_provider_attempt.
request_payload_hash`/`response_payload_hash`).

`screening_match.score` is now NULLABLE (`NULL` = "provider supplied no confidence score," never a
misleading `0.000` sentinel) — handled end-to-end by sensitive-detail and disposition. Normalization
(`normalizeProviderMatches`) fails closed: an unknown provider category maps to
`AML1_VENDOR_RESPONSE_INVALID` (502, the only new error code this phase) — NEVER silently bucketed
into `adverse_media`, NEVER silently dropped. A provider can only ever produce `clear`/
`potential_match` — `confirmed_hit` remains exclusively human-disposition's own output (Phase 2B).
`AML1_SCREENING_PROVIDER_UNAVAILABLE` (503) is reused unchanged for provider unreachability.

New route `GET /internal/aml1/provider/status` (14th route) returns `{active_provider_id,
adaptor_version, environment, stub_provider}` only — no credentials, no tokens, no secrets, no live
vendor health call — gated by AML-01's 5th IAM-02 permission `aml1.provider.read`
(`licence_locked=false`, `requires_approval=false`, zero `role_permission` seed). No CLT-01 source
touched; the existing Phase 2A delivery route is unchanged and still works for completed
provider-generated results; failed requests remain non-deliverable. No Phase 3C code
(rescreening/monitoring/risk-signal), no real vendor SDK/client/credentials.

**Independent Opus review -> ACCEPT WITH LOW FINDINGS.** Independently reproduced TWICE, each from a
genuinely fresh disposable Postgres, under default file-level parallelism: **1524/1524 tests, 82
files, 0 failures both times** (1468 baseline + 56 new), migrations 001->038 clean + all 7 grant
files clean, `tsc -b --force` clean. `screening_provider_attempt`'s 8-column UPDATE grant live-proven
under the real runtime role; a code-only sweep found zero Phase 3C/real-vendor term; zero CLT-01 file
touched (mtimes 4+ days stale). Down-migrations 038->037 independently verified, INCLUDING a direct
reproduction that seeded a NULL-score row and confirmed the rollback fails ATOMICALLY (no partial
schema state, no data loss). One Low, three Informational, non-blocking findings: **Low-1** migration
037's down-migration restores `score SET NOT NULL` unconditionally — if populated NULL scores exist,
rollback past 037 fails safely/atomically; operator note: manual NULL-score remediation (or a
forward-fix plan) is required before rolling back past migration 037 in a populated environment;
**I-1** the production stub boot guard lives in `loadAml1Config` rather than `buildApp` — the real
entrypoint is fully covered, a `buildApp`-level second layer may be considered later; **I-2** no new
provider request/response log-redaction paths were added — deliberate, since the provider payload is
never attached to any Fastify request/reply object Pino would serialize; **I-3**
`AML1_SCREENING_PROVIDER_UNAVAILABLE` (503) and `AML1_VENDOR_RESPONSE_INVALID` (502) use deliberately
different HTTP statuses (retry-later vs upstream-untrustworthy) — re-confirm once a real vendor
lands. Full detail: `aix-platform/docs/implementation/AML-01_IMPLEMENTATION_NOTES.md` §6.

**AML-01 — accepted implementation baseline through Phase 3B.** Carry-forwards (non-blocking) into
Phase 3C: Low-1/I-1/I-2/I-3 above; Phase 2A Info-1/Info-2/Info-3 (unchanged, still deferred); the
residual approver-side SoD gap (platform-wide, not AML-01-specific); the interim shared-token
identity model (increasingly consequential as AML-01's PII/compliance-mutation surface expands); the
platform-wide carry-forward that CLT-01/CFG-01 still collapse execute-verify unavailability into
approval-required-style errors; AML-01 still has no real vendor onboarded — no closure review is
appropriate until one is live.

**AML-01 Phase 3C accepted (re-screening triggers + route-triggered monitoring runs + risk-signal
emission)** — migration `039_aml1_rescreen_monitoring.cjs` + `040_iam2_register_aml1_phase3c_
permissions.cjs`. `aml1.screening_request` gains nullable `rescreen_of_request_id`/`trigger_reason`
(`manual`/`periodic_due`/`list_version_changed` only — `kyc_profile_changed`/`transaction_triggered`/
`remediation_check` deliberately deferred) plus a partial unique index enforcing at most one
in-flight (`status='requested'`) request per subject; new tables `aml1.monitoring_run` and
`aml1.risk_signal`. A shared screening-execution core (`lib/screening-execution.ts`, split
`beginScreening`/`completeScreening`) extracted from the Phase 3B create route is reused unchanged
by the new re-screen route (`POST .../screening-requests/:id/rescreen`) and by monitoring's own
claim/complete split — a re-screen is always a brand-new append-only row, copying declared-identity
PII forward from the source's own snapshot (caller cannot resupply it), never mutating the source
request/result/match. Route-triggered monitoring only (`POST /internal/aml1/monitoring-runs` +
`GET .../monitoring-runs/:run_id`) — no external scheduler/cron/queue; concurrency safety uses
`pg_advisory_xact_lock` spanning candidate SELECTION *and* per-candidate CLAIMING, not just the
SELECT (an earlier design that locked only the SELECT failed its own concurrency test and was
redesigned before acceptance), with the potentially-slow provider calls deliberately unlocked
afterward. Risk-signal emission (`GET /internal/aml1/risk-signals` + `POST .../risk-signals/:id/
acknowledge`) is signal-only — AML-01 never freezes, blocks, debits, settles, trades, or mutates any
downstream module, and holds no grant into one; `confirmed_hit` disposition emits a critical open
signal atomically inside the existing confirm-apply transaction; acknowledgement mutates only its
own review-lifecycle columns. Four new IAM-02 permissions (`aml1.rescreen.request`/
`aml1.monitoring.run`/`aml1.risk_signal.read`/`aml1.risk_signal.acknowledge`), all
`licence_locked=false`, zero `role_permission` seed. No CLT-01 source touched, no new CLT-01
delivery target. Route tree 14→19; AML-01 IAM-02 permission count 5→9.

**Independent Opus review → ACCEPT WITH FINDINGS** (1 Medium, 2 Low, 3 Informational; zero
Critical/High) — independently reproduced on two genuinely fresh disposable Postgres databases:
**1581/1581 tests, 82 files, 0 failures both times** (1524 baseline + 57 new), migrations 001→040
clean + all 7 grant files clean (live-proven at the `information_schema` level, including confirming
`rescreen_of_request_id`/`trigger_reason` carry no UPDATE grant — INSERT-time only), down-migrations
040→039 verified clean with a subsequent up round-trip reproducing an identical schema, `tsc -b
--force` clean. Full suite passed twice on two independent fresh databases (a same-database re-run
instead surfaces the known, pre-existing, unrelated IAM-01/IAM-02/CFG-01 bootstrap/seed-state
re-run artifact — zero AML-01 failures, not a Phase 3C regression).

**MEDIUM-1 — mandatory AML-01 Phase 3D hardening item, not an ordinary carry-forward**: a crash
between the claim (TX1) and complete (TX2) steps of a re-screen/monitoring attempt can leave
`screening_request.status='requested'` stuck. Migration 039's own partial unique index then
permanently blocks any further re-screen of that subject (manual or monitoring); monitoring
candidate selection excludes the subject because its latest row is no longer `completed`; no
`rescreen_overdue` signal is ever emitted because the subject is never selected as a candidate.
Empirically reproduced by the independent Opus reviewer (a seeded stuck row was shown to be
invisible to candidate selection, blocked from manual re-screen by both the application guard and
the DB constraint, and absent from `rescreen_overdue` signals). Recovery today requires direct DBA
intervention. **Must be closed — stuck-request detection, resume/cancel/fail handling, and an
operator runbook/detection query, or equivalent — before Phase 4 / real vendor / production use**;
real-vendor latency and outages will only widen the crash window.

**Carry-forward (non-blocking) into Phase 3D:** **LOW-1** the code comment justifying the
`createMonitoringRun`-before-claim-loop reorder in `routes/monitoring.ts` states an incorrect
rationale (the reorder itself is beneficial, for a different reason than stated) — comment-only
correction; **LOW-2** `AML1_MONITORING_RUN_INVALID_STATE` is a real, tested throw site only at the
library level (`finalizeMonitoringRun`) — not organically reachable via the HTTP route in normal
operation; document as present-but-defensive (mirrors CLT-01 Phase 3's own F2 wording for an
identical shape); **Info-1** match-keyed duplicate suppression is effectively unreachable for
`confirmed_hit` (a match can only ever be confirmed once) and for `potential_match_unresolved` (each
re-screen inserts new `screening_match` rows, so repeated signals across re-screens are expected —
new evidence each time, not a leak); **Info-2** `selectListVersionChangedCandidates` has no
attempt-level tiebreaker — deterministic today (one attempt per request), revisit if a future
retry/resume phase introduces multiple attempts per request; **Info-3** the re-screen path carries
`provenance` forward without re-running the `WRITABLE_SCREENING_PROVENANCE` check — safe today since
only `declared_identity` is ever written, but is the one code path that would propagate
`kyc_verified_identity` forward if a row ever acquired it, revisit once KYC-01 lands; Phase 3B Low-1/
I-1/I-2/I-3 (unchanged); Phase 2A Info-1/Info-2/Info-3 (unchanged, still deferred); the residual
approver-side SoD gap (platform-wide); the interim shared-token identity model (platform-wide);
CLT-01/CFG-01 still collapse execute-verify unavailability into approval-required-style errors
(platform-wide, unchanged); AML-01 still has no real vendor onboarded — no closure review is
appropriate until one is live.

**AML-01 — accepted implementation baseline through Phase 3C.**

**AML-01 Phase 3D accepted (stuck requested-screening detection / orphan-claim hardening — closes
Phase 3C's own MEDIUM-1)** — migration `041_iam2_register_aml1_phase3d_permissions.cjs`,
**permissions-only, no `aml1` schema DDL**. A TX2 concurrency guard (`lib/screening-execution.ts`)
now opens `completeScreening` with `SELECT status FROM screening_request ... FOR UPDATE` as its
FIRST statement, before any `screening_result`/`screening_match` INSERT — aborts cleanly
(`{kind:"aborted"}`) if the row is no longer `requested`; this is the SAME row lock the new recovery
transaction takes, so the two race-safely serialize on it in either direction. New
`lib/stuck-screening.ts` + `routes/stuck-screening.ts`: `GET /internal/aml1/screening-requests/stuck`
(IAM-02-gated `aml1.screening.stuck_read`, bounded, PII-free safe projection, `min_age_seconds` can
only RAISE the effective threshold) and `POST .../screening-requests/:id/recover` (IAM-02-gated
`aml1.screening.stuck_recover`, single-step — no maker-checker — asserting a GENUINE
`permission_granted` baseline, since `approval_required`/`step_up_required` never authorise
recovery). `reason_code` is a closed enum (`process_crash_orphan`/`provider_call_abandoned`/
`deployment_interruption`/`manual_operator_recovery`) — no free text ever accepted or stored.
Recovery marks the request AND its latest provider attempt both `failed`
(`failure_reason_code = "stuck_recovery_<reason_code>"`, reusing existing Phase 1/3B grants — zero
new grant needed); never deletes evidence; never auto-starts a re-screen (recovery and re-screen
stay separate, independently auditable actions — an operator must trigger the follow-up re-screen
manually; monitoring will NEVER automatically re-screen a recovered subject, since its latest status
is `failed`, a state no AML-01 detection surface selects). Monitoring gains a stuck-detection
VISIBILITY pass (both trigger reasons) inside its existing locked transaction — reuses the
`rescreen_overdue` signal type (no schema change) plus a new `aml1.stuck_screening_detected` audit
event, never counted in `candidates_selected`/`rescreens_created`/`failures`, never
claims/mutates/auto-recovers a stuck subject. New config `AML1_STUCK_SCREENING_THRESHOLD_SECONDS`
(default 900s, HARD FLOOR 300s — below the floor fails startup closed as `CONFIGURATION_INVALID`, no
per-request override). Exactly three new error codes (`AML1_STUCK_SCREENING_NOT_FOUND`/
`_INVALID_STATE`/`_TOO_FRESH`, total 25) and two new audit events
(`aml1.stuck_screening_detected`/`_recovered`, no PII, no free text by construction). Standalone
operator runbook added (`AML-01_PHASE_3D_STUCK_SCREENING_RUNBOOK.md`). Closes Phase 3C's own LOW-1
(`routes/monitoring.ts` comment corrected) and LOW-2 (`AML1_MONITORING_RUN_INVALID_STATE` documented
as present-but-defensive / library-level reachable). Grants **unchanged** — independently confirmed
byte-identical to the Phase 3C baseline via `information_schema` (308 privilege rows, zero drift).
Route tree 19→21; AML-01 IAM-02 permission count 9→11.

**Independent Opus review → ACCEPT WITH LOW FINDINGS** (2 Low, 5 Informational; zero
Critical/High/Medium) — independently reproduced on a genuinely fresh disposable Postgres:
**1620/1620 tests, 82 files, 0 failures** (1581 baseline + 39 new), migrations 001→041 + all 7 grant
files clean, migration 041's own down-migration independently verified to restore the catalogue to
exactly 9 `aml1.*` permissions with zero `stuck_*` rows remaining, `tsc -b --force` clean. **The TX2
concurrency guard (the highest-risk item in this phase) was independently re-proven under GENUINE
concurrency** — a real blocking provider call racing a real recovery commit, and a real
held-row-lock scenario racing recovery against a winning terminal update — not by re-running the
implementer's own hand-edited-state test; all race outcomes correct in both directions, zero
orphaned evidence rows, no resurrection to `completed`. The known same-DB re-run artifact
(`iam-db`/`iam2-db`/`cfg1-db`, unrelated to AML-01) was independently reproduced and reconfirmed —
zero AML-01 failures on either a fresh or a reused database.

**MEDIUM-1 (Phase 3C) is now CLOSED**: a stuck subject is detected, signalled, and recoverable via a
single-step, IAM-02-gated operator action; recovery unblocks a future manual re-screen; a
late-landing provider TX2 cannot resurrect a recovered request nor write orphaned evidence; recovery
never deletes evidence, never produces a `clear`/`pass` outcome, is never deliverable to CLT-01, and
never mutates any downstream module.

**Carry-forward (non-blocking) into whatever comes next:** **LOW-1** the operator runbook originally
implied a `periodic_due` monitoring cycle could trigger the required follow-up re-screen —
independently DISPROVED by direct test (a just-recovered subject's latest status is `failed`, not
`completed`, so no AML-01 detection surface ever selects it) — corrected in this same
documentation-sync pass; **LOW-2** the recovery route's staleness gate uses the application clock
against the DB-stored `created_at_utc`, while detection uses the DB clock — accepted as Low (requires
skew exceeding the 300s hard floor, cannot produce a `clear`/`pass` outcome, TX2 guard prevents
evidence corruption regardless); **Info-1** a post-recovery detection blind spot remains by design,
mitigated (not eliminated) by the lingering open `rescreen_overdue` signal and the runbook's
mandatory manual-follow-up instruction; **Info-2** an `aborted` TX2 outcome counts as a `failures`
increment in monitoring's Phase B loop, effectively unreachable in production; **Info-3** the
latest-attempt tie-break is nondeterministic if two attempts share a timestamp, unreachable today; a
future retry/resume phase must add a deterministic tie-break; **Info-4** one integration test's own
comment is self-contradictory/brittle, no runtime issue; **Info-5** the runbook's manual-follow-up
instruction is correct post-fix but not yet covered by an automated test; Phase 3C Info-1/Info-2/
Info-3 (unchanged); Phase 3B Low-1/I-1/I-2/I-3 (unchanged); Phase 2A Info-1/Info-2/Info-3 (unchanged,
still deferred); the residual approver-side SoD gap (platform-wide); the interim shared-token
identity model (platform-wide); CLT-01/CFG-01 still collapse execute-verify unavailability into
approval-required-style errors (platform-wide, unchanged); the same-DB re-run test artifact in
`iam-db`/`iam2-db`/`cfg1-db` remains unrelated to AML-01 (confirmed twice now); AML-01 still has no
real vendor onboarded — no closure review is appropriate until one is live.

**AML-01 — accepted implementation baseline through Phase 3D.**

**AML-01 pauses after Phase 3D — no further AML-01 hardening phase is planned at this time. Do NOT
start AML-01 Phase 4.** Real vendor onboarding remains Phase 4, still blocked on procurement, DPA,
vendor credentials, real provider selection, production secret management, and vendor
governance/outsourcing review. AML-01 closure review remains unavailable until a real provider is
live AND Phase 4 is accepted AND the real-vendor path has itself been independently reviewed.

**KYC-01 KYC/KYB Verification selected as the next runtime module** (the close alternative named
alongside AML-01 at the prior decision point; CLT-01's own receipt-only CDD-outcome/handoff-status
seam made this the natural next step). **KYC-01 Phase 0 (scaffold) is now an accepted
implementation baseline**: new service `services/kyc1` (Fastify), structurally identical to every
prior module's own Phase 0 — own request-context plugin, own interim internal-identity guard
(`KYC1_INTERNAL_SERVICE_TOKEN`, fail-closed), own config loader, boot-time
`assertNoExchangeRuntime`, F3(c) import-boundary test, one route (`GET /internal/kyc1/health`). No
schema, migration, grants, or business logic this phase.

**KYC-01 Phase 1 (core CDD baseline) is now an accepted implementation baseline.** Migration
`042_kyc1_core.cjs`: `kyc1` schema + `role_kyc1_runtime` + 4 tables — `kyc1.kyc_case` (partial
unique index enforcing at most one active case per anchor), `kyc1.document_checklist_item`
(deterministic default checklist per case type, a documented Phase 1 placeholder taxonomy),
`kyc1.verification_result` (append-only manual/registry findings; `vendor` source type reserved,
unimplemented), `kyc1.cdd_outcome` (append-versioned, never updated in place). A deterministic
pure-function CDD outcome engine (`computeCddOutcome`, no DB/HTTP, mirrors AML-01's own
`lib/screening.ts` posture) resolves every case to exactly `pass`/`fail`/`remediation_required` —
no human override, no maker-checker, no AML/vendor/biometric input this phase; `pass` is terminal.
Opaque evidence-reference handling only — never raw document content, never base64/`data:` inline
bytes. 10 routes total, 9 error codes, 10 audit events (transaction-coupled via FND's
`publishAudit`/outbox on every mutation), PII-minimal safe-response projections throughout. Zero
IAM-02 `kyc1.*` permissions this phase, zero `role_permission` seed. No CLT-01 outcome-delivery
call, no UBO/EDD/proofing/vendor/periodic-review tables, no real document store, no Phase 2/3 code.
Independent **Opus review → ACCEPT WITH FINDINGS** (1 Medium — MED-1 — plus Low/Informational; zero
Critical/High) — **1755/1755 tests**, migrations 001→042 + all 8 grant files clean, `tsc -b --force`
clean.

**MED-1 — `computeCddOutcome` was non-deterministic under concurrent verification-result
submission, and a wrong `pass` could become sticky.** `latestResultOfType` sorted only by
`receivedAtUtc`; the comparator never returned `0`; SQL retrieval order also lacked a tie-break;
concurrent `verification_result` rows can share `received_at_utc`; because `pass` is terminal this
phase, a nondeterministically-wrong `pass` was not correctable through the API.

**MED-1 micro-patch is now closed.** Scope was explicitly bounded to the fix alone — no Phase 2, no
CLT-01 delivery, no IAM-02, no maker-checker, no new route/migration/grant, no business-rule
change. SQL retrieval reordered to `received_at_utc DESC, verification_result_id DESC`;
`OutcomeVerificationResultInput` gained `verificationResultId`; a new `compareByRecencyThenId`
comparator sorts by `receivedAtUtc` DESC then `verificationResultId` DESC, returning `0` only on
true full-key equality. **A second, deeper bug was self-caught by Sonnet during the same patch,
before any report was made**: the first fix attempt used `!==` to detect a tie — always `true` for
two distinct `Date` objects at the identical instant, since `node-postgres` returns `timestamptz`
as `Date`, not the `string` the row interfaces declare — silently never reaching the tie-break
branch against real DB data and reproducing exactly the non-determinism the fix existed to remove.
Caught by the new DB-integration tests (4 of 5 failed on first run), invisible to the pure-string
unit tests. Fixed by using only `<`/`>` throughout; a dedicated `Date`-object regression test now
pins this bug class permanently. Files changed: `lib/outcome-engine.ts`, `lib/kyc-case.ts`,
`routes/outcome.ts`, plus `tests/unit/kyc1-outcome-engine.test.ts` and
`tests/integration/kyc1-db.test.ts`. **135/135 KYC-01 tests, 1755/1755 full suite, `tsc -b --force`
clean, no migration 043, no route/grant added, no status doc touched by the patch itself.**

**Independent Opus review of the MED-1 patch → MED-1 CLOSED.** Independently re-derived from source
and re-proven empirically, not rubber-stamped: read the three changed files directly, rebuilt a
genuinely fresh disposable Postgres, reproduced **1755/1755** and `tsc -b --force` clean, and ran a
standalone probe generating 2,000 random tied/untied verification-result sets evaluated across
**every permutation** of array order — **0 order-dependence violations**. The `pg`-`Date`-object
hazard was independently reproduced directly against the scratch DB and confirmed resolved in both
directions. **Scoping caveat recorded, not a defect**: the fix closes the non-determinism
completely, but the sticky-wrong-`pass` half of the original finding is closed only in the weaker
sense that the winner is now *reproducible*, not *correct-by-construction* — the tie-break key
(`verificationResultId`) is a random UUID, so a genuine same-instant conflicting tie still resolves
by chance, and `pass` remains uncorrectable through the API by explicit instruction. Tracked as
INFO-6, a Phase 2 gate.

**Carry-forward (non-blocking) heading into KYC-01 Phase 2:** **LOW-1** `validateEvidenceRef`'s
base64 heuristic is imprecise (MIME-with-newlines false-negative; long legitimate slash-delimited
keys false-positive), bounded impact; **LOW-2** concurrent evidence POST for a not-yet-existing
`document_type` can surface as `KYC1_AUDIT_REQUIRED`/503 instead of 409, fails closed; **LOW-3**
mixed `Date`/`string` `receivedAtUtc` inputs collapse recency to a tie, unreachable today (the sole
production caller always supplies `pg`-returned `Date` values); **LOW-4** the SQL-retrieval-order DB
test asserts its own literal query, not the production `fetchVerificationResults` query — defence-
in-depth only; **INFO-1** `timestamptz` columns are typed `string` in row interfaces at runtime,
`pg` returns `Date` — now a demonstrated correctness hazard (LOW-3's root cause), must be considered
before Phase 2; **INFO-2** a new handoff is permitted for an anchor whose prior case already reached
pass/fail — Phase 2 must define which outcome is authoritative before CLT-01 delivery; **INFO-3**
the AML-01 micro-patch precedent this session followed depends on every AML-01 migration filename
containing `aml1`; **INFO-4** `document_type` is an unconstrained `varchar`, a documented Phase 1
placeholder; **INFO-5** `evidence_refs.verification_result_ids` persisted order flipped to
newest-first, harmless; **INFO-6** the tie-break key is stable but non-monotonic/random, the
terminal-`pass` correction path remains unresolved; the platform-wide approver-side SoD gap and
interim shared-token identity model both remain open. **Phase 2 gates, must be explicitly decided
before Phase 2 coding starts:** (1) authoritative-outcome/supersession rule; (2) a correction path
for a terminal `pass`; (3) the `timestamptz` typing mismatch, ideally resolved repo-wide; (4)
whether the MED-1 scoping caveat needs a dedicated Phase 1B/2A hardening slice before Phase 2 or can
proceed alongside it; (5) CLT-01 handoff/outcome delivery mechanics themselves — undecided, no code
exists yet. Full detail: `aix-platform/docs/implementation/KYC-01_IMPLEMENTATION_NOTES.md`.

**KYC-01 — accepted implementation baseline through Phase 1.**

**KYC-01 Phase 2A (authoritative outcome + publication model, no CLT-01 delivery) is now an
accepted implementation baseline.** Deliberately split from Phase 2B so aggregation/publication
semantics could be independently reviewed before any CLT-01 delivery call exists. Timestamp
normalization at the KYC-01 DB boundary (`normalizeTimestamp`, applied at every fetcher and inline
route query — closes Phase 1's INFO-1/LOW-3; KYC-01-scoped only). `lib/authoritative-outcome.ts`'s
`computeAuthoritativeOutcome` — application-scoped (never case-scoped) worst-wins aggregation
across every KYC-01 anchor an application holds: `fail` beats `remediation_required` beats `pass`;
a missing/uncomputed PRIMARY (`individual`/`entity`) anchor makes the whole aggregate `pending`
(not publishable); an uncomputed PARTY anchor folds in as `remediation_required` rather than
blocking; within an anchor the latest case WITH A COMPUTED OUTCOME wins (`createdAtUtc` DESC,
`caseId` DESC tie-break — correctly treats `remediation_required` as having an outcome, not gated
on `status='completed'`). `detectTiedConflictingEvidence` refuses a would-be `pass` publication
(`KYC1_OUTCOME_EVIDENCE_CONFLICT`, 422, no row created) when contributing evidence contains a tied
conflicting pass/fail pair — the direct D4/INFO-6 remedy. Migration
`043_kyc1_outcome_publication.cjs`: one new table, `kyc1.outcome_publication`; `aggregate_status`
CHECK excludes `pending` (structurally never persisted); `status` CHECK carries
`pending`/`succeeded`/`failed`/`superseded`, a documented D6 forward-compatibility exception for
the CHECK values only.

`POST /internal/kyc1/applications/:application_id/publish-outcome` (application-scoped, internal-
identity-only, no IAM-02) supersedes any prior active publication before inserting a new `pending`
row; `GET /internal/kyc1/outcome-publications/:publication_id` returns a safe projection excluding
`payload_hash`. `payload_hash` is server-computed and deterministic, never exposed. Audit events:
`kyc1.outcome_publication_requested`/`_superseded`/`_refused` (10→13). 3 new error codes:
`KYC1_OUTCOME_NOT_PUBLISHABLE`/`_EVIDENCE_CONFLICT`/`_PUBLICATION_NOT_FOUND` (9→12) — a fourth,
`KYC1_OUTCOME_PUBLICATION_INVALID_STATE`, was pre-registered then REMOVED by a pre-review
micro-patch for having no Phase 2A throw site. No CLT-01 client, no CLT-01 HTTP call, no retry
route, no IAM-02, no maker-checker. Route count 10→12, table count 4→5. **186/186 KYC-01 tests,
1806/1806 full suite (91 files), `tsc -b --force` clean, migrations 001→043 + all 8 grant files
clean, 043 down/up round-trip clean, no migration 044.**

**Independent Opus review → ACCEPT WITH LOW FINDINGS** (3 Low, 3 new Informational; zero
Critical/High/Medium) — every headline number independently reproduced from a fresh disposable
Postgres, including live grant-boundary proof under the real `role_kyc1_runtime` (every immutable
`outcome_publication` column individually confirmed UPDATE-denied) and empirical reproduction of
all three Low findings via concurrent/adversarial HTTP probes, not just static reading. **LOW-5**:
concurrent `publish-outcome` calls can surface as 503 `KYC1_AUDIT_REQUIRED` instead of a 409-class
conflict (reproduced: 4/10 concurrent calls in a 5-trial probe) — state integrity holds (partial
unique index), fails closed, same shape as the still-open Phase 1 LOW-2/CLT-01 Phase 3 F1; fix with
the CFG-01 Phase 3B `pg_advisory_xact_lock` idiom before Phase 2B retry/delivery. **LOW-6**:
`detectTiedConflictingEvidence` groups across ALL contributing cases, not within one case —
reproduced (two internally-consistent cases sharing one timestamp/opposing status wrongly refuse a
publication); fail-safe (over-refuses, never wrongly publishes); fix by adding `caseId` to the
grouping key before Phase 2B. **LOW-7**: a corrective same-anchor case is invisible to the
aggregate while its own outcome is uncomputed — reproduced (a stale terminal `pass` remains
publishable during the correction window); must be an explicit Phase 2B gate (block vs. downgrade),
not a silent carry-forward. **INFO-7** `fetchCasesForApplication` has no `LIMIT` (bounded in
practice); **INFO-8** `contributingOutcomeIds` trusts the current_outcome_status/current_outcome_id
write-together invariant (defensive-only); **INFO-9** migration 043's down/up round-trip drops
`outcome_publication`'s grants, requiring a re-apply of `kyc1_runtime_grants.sql` (documented
platform convention). **INFO-2 substantially addressed** by the aggregation/supersession rule — the
CLT-01-roster-completeness half (D1) remains. **INFO-6 materially improved** by the
evidence-conflict refusal — the random tie-break key itself is unchanged, but the ambiguous `pass`
it could produce is now refused at publication. Phase 1 LOW-1/LOW-4, INFO-3/4/5, and the D1
limitation (KYC-01 publishes over its own case set only, cannot prove CLT-01's authorised-party
roster is complete) remain unchanged. Repo-wide `timestamptz` typing outside KYC-01 remains open as
a separate platform-hardening item. Full detail:
`aix-platform/docs/implementation/KYC-01_IMPLEMENTATION_NOTES.md`.

**Phase 2B gates, must be explicitly decided before Phase 2B coding starts:** (1) LOW-7's
correction window — decide whether an in-flight corrective case must block or downgrade
publication; (2) LOW-5's concurrent-publish conflict signalling — fix via advisory lock or
equivalent before retry/delivery; (3) LOW-6's evidence-conflict grouping — include `caseId` in the
grouping key; (4) CLT-01 delivery design — two-phase delivery with the HTTP call outside the DB
transaction, mirroring AML-01 Phase 2A; (5) CLT-01 lifecycle handling — a non-`under_review`
application must be recorded as a failed delivery, never a false success; (6) retry semantics —
`pending`/`failed` publications may retry, `succeeded`/`superseded` must reject; (7) no
IAM-02/maker-checker unless separately justified.

**KYC-01 — accepted implementation baseline through Phase 2A.**

**KYC-01 Phase 2B (CLT-01 outcome delivery + LOW-5/6/7 pre-delivery closures) is now an accepted
implementation baseline.** Mandatory ordering followed exactly as planned — all three Phase 2A Low
findings closed and independently green BEFORE any CLT-01 delivery code was written. **LOW-6
closed**: `detectTiedConflictingEvidence`'s grouping key gained `caseId`
(`caseId::resultType::receivedAtUtc`) — a tie is now detected only within one case's own evidence,
never across two independently-consistent contributing cases. **LOW-7 closed**: within an anchor
the latest case now wins outright, not "latest case with an outcome" — an in-flight corrective
primary case blocks publication (`KYC1_OUTCOME_NOT_PUBLISHABLE`), a corrective party case downgrades
the aggregate to `remediation_required`, closing the correction-window gap Phase 2A left open.
**LOW-5 closed**: `pg_advisory_xact_lock(hashtext('kyc1.outcome_publication:'+application_id))` as
the first statement in `publish-outcome`'s transaction and in both of `deliver`'s (TX1/TX2), never
held across the HTTP call — concurrent publish now serializes instead of racing the partial unique
index into a misleading `KYC1_AUDIT_REQUIRED`/503.

KYC-owned CLT-01 client (`services/kyc1/src/lib/clt1-client.ts`, F3(c)-clean, no import from
AML-01's own copy, no CLT-01 source change) — explicit status map (`pass`/`fail`/
`remediation_required`, never a pass-through), `CLT1_BASE_URL`/`CLT1_INTERNAL_SERVICE_TOKEN`
required and fail-closed, 5s timeout-bounded, no token/raw-request/raw-response logging,
`response_ref` stores only CLT-01's own `outcome_id`, `failure_reason_code` clamped to 64 chars.
`POST /internal/kyc1/outcome-publications/:publication_id/deliver` (13th route, 12→13) handles
BOTH first delivery (`pending`) and retry (`failed`) through one route (approved D3, no separate
`/retry`); `publish-outcome` remains create-only, its accepted Phase 2A contract unchanged.
Two-phase delivery mirroring AML-01's own accepted pattern: TX1 (advisory lock → re-validate →
recompute-and-compare the live aggregate against the stored snapshot → audit `attempted` → commit,
releasing the lock) → HTTP outside any transaction → TX2 (re-lock → re-check still active →
terminal write → audit). A stale snapshot (live aggregate ≠ stored) is rejected with
`KYC1_OUTCOME_PUBLICATION_STALE` (409) BEFORE any CLT-01 HTTP call, reusing the existing
`kyc1.outcome_publication_refused` audit event (`reason_code: "stale"`). 4 new error codes
(12→16): `KYC1_OUTCOME_PUBLICATION_INVALID_STATE`/`_STALE`/`KYC1_CLT_DELIVERY_FAILED`/
`KYC1_CLT_UNAVAILABLE`, each with exactly one reachable throw site. 3 new audit events (13→16):
`kyc1.outcome_delivery_attempted`/`_succeeded`/`_failed` — no PII/`evidence_ref`/`payload_hash`/raw
CLT-01 body/token in any metadata. No IAM-02, no maker-checker, **no migration, no grant/schema
change** — Phase 2A's own D6 forward-compatibility decision on the `status` CHECK paid off exactly
as intended. **236/236 KYC-01 tests, 1856/1856 full suite (92 files), `tsc -b --force` clean,
migrations 001→043 + all 8 grant files clean, no migration 044.**

**Independent Opus review of Phase 2B → ACCEPT WITH LOW FINDINGS, conditional on closing one
Medium (MED-2) first.** Every claim independently reproduced on a fresh disposable Postgres via
adversarial probes that INJECTED the actual races, not static reading. **MED-2**: the documented
`superseded_during_delivery` mitigation was itself non-functional — TX2 wrote `status='failed'`
over a row already `status='superseded'` when a fresh publish superseded the in-flight delivery
mid-HTTP-call, re-entering the row into the partial unique index and raising a raw `23505` mapped
to `KYC1_AUDIT_REQUIRED` (503) with the WHOLE transaction rolled back — losing the attempt evidence
entirely, even when CLT-01 had genuinely accepted the delivery.

**Micro-patched and independently re-reviewed → MED-2 CLOSED.** The terminal write became
three-way (`succeeded`/`failed`/`superseded` — the superseded branch now writes back
`status='superseded'`, never re-entering the index), tracked via a real discriminated result
(`DeliverOutcome`) rather than inferred back out of the final `status`. Re-verified via the SAME
adversarial reproduction across all three CLT-01 response variants (accept/reject/unreachable —
the third added independently during re-review): `status` stays `superseded`,
`attempt_count`/`failure_reason_code=superseded_during_delivery`/the `failed` audit event are all
durably recorded in the SAME transaction, the caller receives `KYC1_OUTCOME_PUBLICATION_STALE`
(409) never `KYC1_AUDIT_REQUIRED`, exactly one active publication survives every trial,
`response_ref` stays `null` (safe-minimal), and the superseding publication remains independently
deliverable afterward.

**Carry-forward (non-blocking) heading into KYC-01 Phase 3:** **LOW-8** `delivered_at_utc` set on
failure the same as success, no distinct "last attempted at" semantics — cosmetic; **INFO-10**
concurrent `/deliver` on the SAME publication can produce two real CLT-01 writes — accepted
at-least-once, AML-01 symmetry, safe-but-noisy; **INFO-11** a LOW-6 test's own trailing comment is
partially self-contradictory, the assertion itself is correct; **INFO-12** if CLT-01 accepts during
the supersession race, its own `cdd_outcome` row is not linked back via `response_ref` — accepted
safe-minimal trade-off, the attempt is still recorded; **INFO-13** the CLT-unavailable race variant
was independently verified during review but not covered by the patch's own tests; **INFO-14** a
benign local cast on `DeliverOutcome`, constructed inside the same function, never on external
data. Phase 1 **LOW-1**/**LOW-2**/**LOW-4**, **INFO-3**/**INFO-4**/**INFO-5**/**INFO-7**/**INFO-8**/
**INFO-9** all unchanged. **D1** restated as higher-stakes, not new: KYC-01 publishes over its own
case set only and cannot prove CLT-01's authorised-party roster is complete, and a `pass` now
genuinely reaches CLT-01's approval gate. **Ordering residual (named, queryable, accepted)**: if a
superseding publication is itself never delivered, CLT-01's rollup retains the prior value. Repo-
wide `timestamptz` typing outside KYC-01 remains a separate platform-hardening item. Full detail:
`aix-platform/docs/implementation/KYC-01_IMPLEMENTATION_NOTES.md`.

**Phase 3 planning inputs**: IAM-02 / manual review / maker-checker (KYC-01's first real
integration point, same shape CLT-01/AML-01 each hit at their own first IAM-02 phase); the **D1**
authorised-party-roster-completeness limitation; the **ordering residual**; the full carry-forward
register above.

**KYC-01 — accepted implementation baseline through Phase 2B.**

**KYC-01 Phase 3A (IAM-02 integration + sensitive evidence-read) accepted.** KYC-01's first
IAM-02 integration point. KYC-owned IAM-02 client (`services/kyc1/src/lib/iam2-client.ts`,
F3(c)-clean — no import from AML-01/CFG-01/IAM-02 source), `checkPermission` only, no
`verifyDecisionToken`/execute-verify this phase (no Phase 3A permission carries
`requires_approval=true`, so there is no execute-verify throw site to bind against yet).
`IAM02_BASE_URL`/`IAM02_INTERNAL_SERVICE_TOKEN` required and fail-closed, 5s timeout-bounded, no
token/raw-request/raw-response logging. Baseline decision handling: `allow`/`approval_required`/
`step_up_required` → pass; `deny`/`licence_locked` → `KYC1_PERMISSION_DENIED`; network
error/timeout/non-2xx/malformed JSON/`success:false`/missing-decision → `KYC1_IAM2_UNAVAILABLE`
— the CFG-01 Phase 3A F-1 lesson (treating `approval_required` as a denial would make the
baseline check permanently unsatisfiable) applied from day one, not discovered by review.

Migration `044_iam2_register_kyc1_phase3a_permissions.cjs` — permission-registration ONLY, no
table, no `ALTER`, no grant statement. Registers exactly one `iam2.permission` row:
`perm_kyc1_evidence_sensitive_read` / `kyc1.evidence.sensitive_read`, resource
`document_checklist_item`, action `sensitive_read`, sensitivity `sensitive`,
`licence_locked=false`, `prohibited=false`, `requires_step_up=false`, `requires_approval=false`,
`status=active`, `owner_module=KYC-01`. No `role_permission` seed.

Checklist projection narrowed: `lib/kyc-case.ts`'s shared `safeChecklistItemResponse` had
`evidence_ref`/`evidence_hash` REMOVED. This is intentionally broader than a single-route
instruction — it applies to all three of that function's call sites (`GET .../checklist`,
`POST .../evidence`'s own confirmation response, `POST .../handoffs`'s embedded checklist array),
because narrowing only the checklist-read route would have left the "sensitive route is the sole
disclosure point" invariant unsatisfiable. Routine projection retains `checklist_item_id`/
`case_id`/`document_type`/`required`/`status`/`expiry_date`/`verification_result_id`/
`created_at_utc`/`updated_at_utc`.

New route `GET /internal/kyc1/checklist-items/:checklist_item_id/sensitive-detail?actor_id=`
(14th route, 13→14) — internal-identity-gated, `actor_id` required, IAM-02
`kyc1.evidence.sensitive_read`-gated, single-record only (no list/search route).
PERMISSION-BEFORE-EXISTENCE: the IAM-02 check runs before any `document_checklist_item` row is
fetched — a denied caller and a denied-caller-against-a-nonexistent-item resolve to the identical
`KYC1_PERMISSION_DENIED`/403, never a 404; only once permission genuinely passes does an unknown
id resolve to the EXISTING `KYC1_CHECKLIST_ITEM_NOT_FOUND` (no new
`KYC1_SENSITIVE_EVIDENCE_NOT_FOUND` code). AUDIT-BEFORE-RETURN, fail-closed:
`kyc1.sensitive_evidence_read` (severity `high`, metadata `{checklist_item_id, case_id,
document_type}` only — never `evidence_ref`/`evidence_hash`/`payload_hash`/PII/tokens/raw IAM-02
body) commits before the response is built; if the audit write fails, the route fails
`KYC1_AUDIT_REQUIRED`/503 with no sensitive data returned. Response returns an evidence
REFERENCE, never document content — exactly `checklist_item_id`/`case_id`/`document_type`/
`status`/`evidence_ref`/`evidence_hash`/`expiry_date`, no base64/data-URI/vendor payload. 2 new
error codes (16→18): `KYC1_PERMISSION_DENIED`/403, `KYC1_IAM2_UNAVAILABLE`/503, each with exactly
one reachable throw site. The existing 13 routes remain internal-service-token-only — NOT
retro-gated with IAM-02 (mirrors the AML-01 precedent of gating only human-actor routes, leaving
the service-to-service pipeline untouched). No manual override, no maker-checker, no
execute-verify, no `manual_override_request` table, no migration 045/046, **no grant/schema
change**. **276/276 KYC-01 tests, 1896/1896 full suite (93 files), `tsc -b --force` clean,
migrations 001→044 + all 8 grant files clean, no migration 045.**

**Independent Opus review of Phase 3A → ACCEPT WITH LOW FINDINGS (1 Low, 5 Informational; zero
Critical/High/Medium).** Every claim independently reproduced on a fresh disposable Postgres via
adversarial probes rather than static reading: DB-query-order instrumentation proved zero
`document_checklist_item` queries occur before a denied permission decision (stronger than the
implementer's own status-code-only test); the audit-failure fail-closed path was re-tested under
a genuine least-privilege runtime role after an initial superuser-connected probe produced a
false leak signal (retracted once corrected); an exhaustive canary-value sweep across all 14
routes confirmed exactly one route ever returns `evidence_ref`/`evidence_hash`; and the migration
044 down path — previously code-inspected only — was LIVE-TESTED (kyc1 permissions 1→0, total
permissions 93→92 with zero collateral to any other module's permissions, kyc1 tables unchanged
at 5, migration head reverted to 043, up/down/up idempotency confirmed) and is now **CLOSED**.

**LOW-9 (new)**: the sensitive-read `actor_id` is caller-asserted via a query parameter and is
used for BOTH the IAM-02 authorization decision and the high-severity audit record — any holder
of the shared `KYC1_INTERNAL_SERVICE_TOKEN` can assert an arbitrary actor identity. Follows the
existing AML-01/platform-wide interim-shared-secret-identity carry-forward exactly, NOT a Phase
3A regression, but flagged because Phase 3B's override attribution and strict SoD (requester ≠
approver, requester ≠ evidence provider) will depend on this identity being genuine. **INFO-15
(new)**: the audit-write-fails fail-closed test is only meaningful under a non-superuser DB role
— a superuser bypasses `REVOKE` and would silently make the test a no-op; needs a harness
comment/assertion. **INFO-16 (new)**: an authorised-but-not-found sensitive-read attempt emits no
audit event (matches AML-01's own `matchNotFound()` ordering, accepted). **INFO-17 (new)**: the
pre-existing global "no deferred-phase event type" sweep was narrowed to a single lifecycle's own
events — necessary (the global form false-positived once `kyc1.sensitive_evidence_read` became
genuinely reachable elsewhere in the shared test database), but it incidentally weakened the
still-forbidden `kyc1.manual_review_*` guard from "never anywhere" to "never in this lifecycle" —
Phase 3B should restore a global sweep for the still-banned event types. **INFO-18 (new)**:
`infra/grants/kyc1_runtime_grants.sql`'s header comment is stale — still claims no CLT-01/IAM-02
HTTP dependency — correctly NOT edited during Phase 3A (grant changes out of scope), fix
opportunistically when Phase 3B legitimately edits that file. **INFO-19 (new)**: the
sensitive-read audit's `try/catch` block omits the house-style
`if (err instanceof Kyc1Error) throw err;` guard present elsewhere — safe today (only
`publishAudit` runs inside), carried forward as defensive-consistency hardening.

**Carry-forward (non-blocking) heading into KYC-01 Phase 3B:** **LOW-9**, **INFO-15**–**INFO-19**
(all above, new); **LOW-8**, **INFO-10**, **INFO-11**, **INFO-12**, **INFO-13**, **INFO-14**
(Phase 2B, unchanged); Phase 1 **LOW-1**/**LOW-2**/**LOW-4**, **INFO-3**/**INFO-4**/**INFO-5**/
**INFO-7**/**INFO-8**/**INFO-9** (now also true of migration 044's own down/up round-trip); **D1**
and the **ordering residual** (both unchanged, still open); repo-wide `timestamptz` typing
outside KYC-01 remains a separate platform-hardening item.

**Phase 3B planning inputs (accepted scope, not yet implemented)**: manual outcome override ONLY
(no verification_result/document_checklist_item/publication-eligibility/evidence-conflict/
stale-refusal override — all forbidden); maker-checker via IAM-02 execute-verify (`iam2-client.ts`
gains `verifyDecisionToken`); append-only `cdd_outcome` override (never mutates evidence, always
inserts a new versioned row); migration 045 (`manual_override_request` table) + migration 046
(permission registration); strict SoD (requester ≠ approver via IAM-02, requester ≠ any manual
verifier on the case via a KYC-01-owned self-block check); recompute-lock on overridden cases
(reuses the existing `KYC1_CASE_INVALID_STATE`); explicit republish + redelivery required — no
automatic CLT-01 publication or delivery from an override; **LOW-9** (caller-asserted actor
attribution — now load-bearing for override SoD); **D1** (authorised-party-roster-completeness
limitation, still open); the `MED-2`-style partial-unique-index status-transition hazard named in
the accepted Phase 3 planning report — `manual_override_request.status` writes need the same
scrutiny that caught MED-2 in `outcome_publication.status`; **INFO-17**'s global-sweep
restoration; **INFO-18**'s stale grant-header fix (opportunistic).

**KYC-01 — accepted implementation baseline through Phase 3A.**

**KYC-01 Phase 3B (maker-checker manual outcome override) accepted.** Case-level `cdd_outcome` is
the ONLY permitted override target; `verification_result`/`document_checklist_item`/publication-
eligibility/evidence-conflict/stale-publication refusals remain explicitly forbidden override
targets. Migration `045_kyc1_manual_override_request.cjs` — new table `kyc1.manual_override_
request` (append-only maker-checker request record). Live lifecycle: `requested`/`applied`/
`failed` (the last added by the MED-3 fix, below); `cancelled` schema-present but unreachable.
Partial unique index enforces at most one open `requested` row per case. No ALTER to any Phase 1/2
table. Migration `046_iam2_register_kyc1_phase3b_permissions.cjs` — KYC-01's SECOND IAM-02
permission: `perm_kyc1_outcome_override` / `kyc1.outcome.override`, resource `cdd_outcome`, action
`override`, sensitivity `sensitive`, `licence_locked=false`, `requires_step_up=false`,
`requires_approval=true`, `status=active`, `owner_module=KYC-01`. No `role_permission` seed.

`lib/iam2-client.ts` gained `verifyDecisionToken` (execute-verify) alongside the existing
`checkPermission`. Baseline `allow`/`approval_required`/`step_up_required` → pass; `deny`/
`licence_locked` → `KYC1_PERMISSION_DENIED`. Execute-verify unavailable/network/timeout/non-2xx/
malformed → `KYC1_IAM2_UNAVAILABLE`; a genuine denial (invalid/expired/replayed/hash-mismatched
token) → `KYC1_APPROVAL_REQUIRED`. Raw decision token never logged or persisted — only
`fingerprint(decision_token)` stored, and only on a successful apply.

Two new routes (14→16): `POST /internal/kyc1/cases/:case_id/outcome-override/request`
(`requested_by`/`target_outcome_status` ∈ {pass, fail, remediation_required}/`reason_code` ∈
{system_derived_outcome_incorrect, manual_evidence_review, documented_compliance_exception} —
bounded enum, no free text) and `POST .../outcome-override/apply` (`override_id`/`approval_id`/
`decision_token` — no actor identity accepted from the caller; the route uses the STORED
`requested_by`). Self-override SoD: the requester is blocked (`KYC1_SELF_OVERRIDE_BLOCKED`/409)
when `requested_by` equals the `source_id` of a manual verification result on the SAME case;
refusal audited (`kyc1.manual_override_refused`, `reason_code: self_override_blocked`) with no
requester/source_id value in metadata. Vacuous for a registry-only case (SoD then rests on IAM-02's
own requester≠approver rule alone) — a named limitation, not silently accepted.

Append-only apply: inserts a NEW `cdd_outcome` row (`outcome_reason` ∈ {manual_override_pass,
manual_override_fail, manual_override_remediation_required}), never mutates `verification_result`/
`document_checklist_item`/any prior `cdd_outcome` row; updates the case's current-outcome pointer
through the EXISTING column-scoped grant (no widening). Recompute-lock: a case whose latest outcome
is a manual override is terminal against `compute-outcome` (reuses `KYC1_CASE_INVALID_STATE`, no
new code); correction requires a new case for the same anchor. Publication/delivery interaction:
apply never publishes, never delivers, never calls CLT-01 — zero automatic side effects. An
existing active publication goes stale through the UNCHANGED Phase 2B live-snapshot comparison;
override-to-pass still cannot bypass the evidence-conflict refusal at publish. Explicit republish +
redeliver required (`republish_required`/`redelivery_required: true` on every apply response).

4 new error codes (18→22): `KYC1_APPROVAL_REQUIRED`/403, `KYC1_OVERRIDE_NOT_FOUND`/404,
`KYC1_OVERRIDE_INVALID_STATE`/409, `KYC1_SELF_OVERRIDE_BLOCKED`/409 — `KYC1_CASE_INVALID_STATE`
(case/business-state problems) vs `KYC1_OVERRIDE_INVALID_STATE` (override-row lifecycle problems)
is a deliberate semantic split, not two names for the same condition. 3 new audit events (17→20):
`kyc1.manual_override_requested`/`_applied`/`_refused` — the last reachable for both
`self_override_blocked` and (post-MED-3) `case_state_changed`. Metadata excludes decision
tokens/hashes/`payload_hash`/`requested_by` value/`source_id`/evidence references/PII/free text
throughout. **INFO-17 CLOSED**: the global forbidden-event sweep is restored — a genuinely global
(unscoped) sweep confirms `kyc1.manual_review_*`/`kyc1.manual_override_denied`/`kyc1.outcome_
published`/UBO/EDD/vendor/proofing event prefixes never appear anywhere in the outbox, permitting
only the three legitimate override events. **INFO-18 CLOSED**: `kyc1_runtime_grants.sql`'s header
now correctly acknowledges KYC-01's CLT-01/IAM-02 HTTP dependencies while preserving the
no-cross-schema-SQL-grant invariant — the GRANT statements themselves are byte-identical to before
(comment-only fix). **386/386 KYC-01 tests, 2006/2006 full suite (94 files), `tsc -b --force`
clean, migrations 001→046 + all 8 grant files clean, migrations 045/046 down/up round-trip clean,
same-DB rerun clean, no migration 047.**

**Independent Opus review of Phase 3B → ACCEPT WITH LOW FINDINGS, conditional on closing one
Medium (MED-3) first.** Every claim independently reproduced on a fresh disposable Postgres via
adversarial probes, not static reading. **MED-3**: an override approval was bound only to
`{override_id, case_id, target_type, target_outcome_status, reason_code, requested_by}` — NEVER to
the case outcome that existed when the override was requested. Reproduced exploit: a case at
`remediation_required` has an override-to-`pass` requested and approved; genuinely adverse evidence
then arrives and the case recomputes to `fail`; the STALE approval is applied anyway —
`manual_override_pass` masks the `fail` finding, and the recompute-lock then makes the adverse
finding unreassertable except by opening a new case.

**Micro-patched and independently re-reviewed → MED-3 CLOSED.** Migration 045 gained two immutable
NOT NULL columns — `approved_against_outcome_id` (a genuine FK into `kyc1.cdd_outcome(outcome_id)`)
and `approved_against_outcome_status` — captured from the REQUEST route's own locked re-read
(never the unlocked preflight read) and included in the canonical payload hash bound into the
IAM-02 approval. The APPLY route's final transaction compares the case's CURRENT `current_outcome_
id`/`current_outcome_status` against this stored snapshot BY ID, not merely by status, so a
same-status-different-version drift (e.g. a corrective re-verification landing a new row with the
identical status) is also caught. On any mismatch: no `cdd_outcome` insert, no case-pointer update,
no `manual_override_applied` event; the override row transitions `requested`→`failed` (a NEW
reachable status value, vacating the `one_open_per_case` partial index exactly like `applied`
already does — no MED-2-style re-entry hazard), atomically with a `kyc1.manual_override_refused`
audit (`reason_code: case_state_changed`); the route returns `KYC1_CASE_INVALID_STATE`/409; a
replacement request may be created immediately for the case's new state. If the refusal audit
itself fails, the WHOLE transaction rolls back (the row stays `requested`, never silently `failed`
without its audit) and the caller receives the existing `KYC1_AUDIT_REQUIRED`. Opus independently
replayed the ORIGINAL exploit verbatim against the patched code and confirmed it is genuinely
blocked (case-outcome history stops at the adverse `fail` row, no `pass` masking, no recompute-lock
introduced on the failed path), plus a same-status/different-outcome-ID variant proving ID-binding
specifically, plus a forced-audit-failure probe proving atomicity.

**Carry-forward (non-blocking) heading into KYC-01 Phase 4:** **LOW-10** (new — the request route's
self-override check runs BEFORE the IAM-02 permission check, as specified by the accepted Phase 3B
design; an unpermissioned shared-token caller can distinguish "requested_by matches a manual
evidence provider on this case," a one-bit attribution oracle; non-blocking, implemented as
designed); **LOW-11** (new — case-existence/state validation also precedes the IAM-02 permission
check; materiality low since equivalent data is already available from KYC-01's own ungated
routes); **INFO-20** (new — the self-override refusal audit is best-effort, a self-override attempt
can go unaudited if the outbox write fails, no state ever mutated); **INFO-21** (new — `cancelled`
remains schema-present and unreachable, no decorative error code added); **INFO-22** (new — the
implementation report's own 13-vs-11 file-count discrepancy confirmed as bookkeeping only: 13 total,
5 created + 8 modified, the 11-file sweep excluded migrations 045/046 by using migration 046 itself
as the cutoff); **INFO-23** (new — on a MED-3 refusal, IAM-02 may already have consumed the decision
token while KYC-01 records `approval_id`/`decision_token_hash` as null; accepted safe-minimal, a
replacement request needs a fresh approval cycle regardless); **INFO-24** (new — the defence-in-depth
`caseIsOverridable` re-check is logically redundant when the exact snapshot matches; harmless,
the ID/status comparison is the real MED-3 control); **LOW-9**, **INFO-15**, **INFO-16**, **INFO-19**
(Phase 3A, unchanged); **LOW-8**, **INFO-10**–**INFO-14** (Phase 2B, unchanged); Phase 1 **LOW-1**/
**LOW-2**/**LOW-4**, **INFO-3**/**INFO-4**/**INFO-5**/**INFO-7**/**INFO-8**/**INFO-9** (now also
true of migrations 045/046's own down/up round-trip); **D1** and the **ordering residual** (both
unchanged, still open); repo-wide `timestamptz` typing outside KYC-01 remains a separate
platform-hardening item.

**Phase 4 planning inputs**: **D1** (authorised-party-roster-completeness limitation) is now the
LEADING planning input — materially higher-risk than at Phase 2B/3A, since a human-approved
override-to-`pass` is now implemented, can be explicitly published and delivered to CLT-01, and
incomplete authorised-party coverage could mean approval was granted over an incomplete KYC case
set; the registry-only SoD limitation; the ungated publish/deliver residual (D6); the full
carry-forward register above. **Phase 3C is explicitly skipped** — Phase 3 is complete through
Phase 3B; the next step is KYC-01 Phase 4 planning (no Phase 4 implementation has started).

**KYC-01 — accepted implementation baseline through Phase 3B** (phase label unchanged by the
CLT-01-side prerequisite below).

**KYC-01 Phase 4A prerequisite — CLT-01 application-keyed KYC roster contract — now an accepted
CLT-01 baseline.** KYC-01 Phase 4 planning identified a structural blocker: CLT-01's only existing
authorised-party roster read (`GET /internal/clt1/clients/:client_id/authorised-parties`) is
client-keyed and gated on `client_profile.status='active_limited'`, which is created only at final
approval — chronologically unavailable to KYC-01, which publishes/delivers while the application
is still `under_review`, before any `client_profile`/`client_id` exists. **CLT-01 Phase 4A** closes
this with exactly one new internal route added on top of the already-complete CLT-01 Phases 0-9
baseline — **no migration, no schema/grant change, no IAM-02 permission, no `role_permission`
seed, no outbox event, no KYC-01 source change.**

- Route: `GET /internal/clt1/applications/:application_id/kyc-roster` — application-keyed, no
  `client_id`/`client_profile` dependency; internal-service-token-only (no IAM-02 call, no
  `actor_id`, no caller-asserted human identity); read-only (no write, no transaction, no audit/
  outbox event).
- Response: `{application_id, application_status, primary_subject_type, authorised_parties,
  party_count, roster_hash}`; each party `{authorised_party_id, party_type, authority_status,
  version}` — no `party_reference`, no PII. `primary_subject_type` maps `individual`→`individual`,
  `corporate`/`institutional`→`entity`. Complete roster, unfiltered by `authority_status`;
  complete-or-error, no pagination; hard cap 500 parties.
- `roster_hash`: CLT-owned `@aix/foundation` `fingerprint()` over the roster canonically sorted by
  `authorised_party_id` ASC via a locale-independent comparator (the CFG-01 F-1 lesson applied up
  front) — a content digest, not a version counter, so "same version, different contents" drift is
  structurally impossible; no migration touches any existing `authorised_party` apply path.
- Roster-cap micro-patch registered a dedicated `CLT1_KYC_ROSTER_TOO_LARGE` (409) rather than
  reusing the ill-fitting `CLT1_APPLICATION_INVALID_STATE`. CLT-01 error catalogue 42→43; route
  tree 67→68 (+1); `clt1.*` IAM-02 permissions unchanged at 33.
- **Independent Opus review → ACCEPT WITH LOW FINDINGS** (zero Critical/High/Medium), reproduced
  via 76 independently-authored adversarial probes on a fresh disposable Postgres — including an
  independent hash recomputation matching byte-for-byte and a decisive collation probe proving the
  ordering is application-code-driven, not DB-collation-driven. **LOW-1**: the application-row and
  party-roster reads are two independent, non-transactional statements — classified Low, not
  Medium, because the tear direction is structurally safe (the party read runs second, so a
  concurrently-added party is never missed; the only achievable tear fails closed at Phase 4B's
  comparison). Seven Informational findings, all non-blocking. Opus independently reproduced CLT-01
  focused unit 57/57, CLT-01 integration 357/357, KYC-01 regression 386/386 (unchanged), full suite
  2084/2084 (95 files), migrations 001→046 clean (no 047), all 8 grant files clean, and confirmed
  the known same-DB 22 IAM-01/IAM-02/CFG-01 bootstrap-ordering failures are causally unrelated to
  Phase 4A. No code was written or changed during the review.
- **Phase 4B readiness — Opus-confirmed**: the contract supplies every element KYC-01 Phase 4B
  needs, with no missing field or blocking ambiguity. **D1 remains open** until KYC-01 Phase 4B
  itself implements publish-time roster-completeness validation, a roster-bound publication
  snapshot, and delivery-time roster revalidation. **KYC-01 Phase 4B planning/coding may now
  begin.** Full detail: `aix-platform/docs/implementation/CLT-01_IMPLEMENTATION_NOTES.md` and
  `aix-platform/docs/implementation/KYC-01_IMPLEMENTATION_NOTES.md`.

**CLT-01 Phase 4A.1 (atomic KYC roster binding, coordinated prerequisite) — now accepted.**
Migration `047_clt1_atomic_kyc_roster_binding.cjs` closes a confirmed, empirically-reproduced
TOCTOU between the Phase 4A roster read and the existing KYC/KYB outcome receipt: two nullable,
lowercase-`sha256`-format-constrained columns (`clt1.client_application.kyc_roster_hash`,
rechecked at final approval; `clt1.cdd_outcome.kyc_roster_hash`, immutable append-only evidence).
`expected_roster_hash` is now mandatory on every `kyc_kyb` receipt. A shared application-scoped
`pg_advisory_xact_lock` (`acquireKycRosterLock`, 8 source call sites covering 10 runtime
transaction paths) is the FIRST statement of every roster-mutating transaction and of both the
outcome-receipt and approval-recheck transactions — independently verified via a static
lock-position guard with a genuine negative control (a synthetic lock-after-`FOR UPDATE` block is
proven to fail the guard) plus three behavioural independent-connection lock-block tests. A
mismatch refuses as `CLT1_KYC_ROSTER_STALE`/409 BEFORE any `cdd_outcome` INSERT or rollup UPDATE.
Final approval independently rechecks the SAME binding under the SAME lock — NULL is a hard
refusal, never a bypass. A test-only MED-1 micro-patch corrected the lock-position guard's own
overclaimed scope description without weakening the guard.

**KYC-01 Phase 4B (authoritative roster completeness, publication binding, atomic delivery
integration) — now accepted.** Migration `048_kyc1_publication_roster_binding.cjs` adds five
nullable, all-or-none-bound columns to `kyc1.outcome_publication` (`roster_hash`,
`required_party_count`, `evaluated_party_count`, `contributing_party_ids`,
`roster_fetched_at_utc`) — independently confirmed immutable under the real runtime role. New
KYC-owned roster client (`lib/roster-client.ts`) wraps CLT-01's Phase 4A route with exhaustive
shape validation. `computeRosterBoundOutcome` reuses the EXISTING anchor-resolution algorithm
(`selectAuthoritativeCasePerAnchor`) — no second authority algorithm; `computeAuthoritativeOutcome`
itself is untouched (proven byte-for-byte), though no live route calls it any longer. Required-party
set is exactly `authority_status` ∈ {pending, active, restricted, suspended}; matching is exact
codepoint string equality only. A required party with no case, or no resolved outcome, ALWAYS
blocks publication outright — never downgraded to `remediation_required`. Extra KYC-01 cases are
excluded from the aggregate, never blocking. Deliver re-fetches the roster outside TX1 and compares
the required-party set, roster hash, freshly-recomputed live aggregate, contributing IDs, and
aggregate status against the stored evidence — `expected_roster_hash` is sourced EXCLUSIVELY from
the locked publication row. CLT-01's own `CLT1_KYC_ROSTER_STALE`/409 maps to
`KYC1_OUTCOME_PUBLICATION_STALE`, never `KYC1_CLT_DELIVERY_FAILED`/`KYC1_CLT_UNAVAILABLE`. A legacy
(pre-048) publication can never be delivered — the only remedy is a fresh publish. Zero new KYC-01
error codes (still 22) and zero new audit event types (still 20).

**Independent Opus review of the combined CLT-01 Phase 4A.1 + KYC-01 Phase 4B implementation →
ACCEPT WITH NON-BLOCKING FINDINGS** (0 Critical/High/Medium; 2 Low — `computeAuthoritativeOutcome`
is now dead production code, retained only as the regression oracle; a stale opening header
sentence in `routes/outcome-publication.ts`; 4 Informational — collapsed roster-fetch-failure
reason codes, an inaccurate migration-header attribution for `contributing_party_ids` dedup,
incomplete `party_missing` diagnostics, and a process recommendation to pin canonical SEC-01 test
env values). No fixes required before acceptance. Canonical combined full suite **2195/2195
(96/96 test files)** on a fresh disposable Postgres, `npx tsc -b --force` clean, migrations
001→048 clean, migration 047 intact and unmodified by Phase 4B, migration 048 down/up round-trip
clean, all 8 grant files clean, same-DB targeted KYC+CLT rerun **606/606**, migration head **048**,
no migration 049.

**SEC-01 test-environment correction (supersedes any earlier "pre-existing failure"
characterization):** an implementation session's own `sec1-db.test.ts` run showed 66 failures in
the Phase 5 security-monitoring-rule-engine section. Root cause, independently investigated: the
session ran migration 008 with TRANSPOSED `SEC1_INGEST_TOKEN_*` env values against the values
`sec1-db.test.ts` itself hardcodes — migration 008 seeds the expected token hashes at migration
time, so every authenticated ingest call returned 401. This was NOT a Phase 4A.1/4B regression and
NOT an inherent pre-existing SEC-01 code defect — classification: **unrelated harness/environment
invocation issue, independently proven** (reproduced the 66 failures in isolation with the
transposed values; with the canonical values below, `sec1-db.test.ts` passed 139/139 and the full
canonical suite passed 2195/2195). **Canonical values** (pin these — do not re-derive):
`SEC1_INGEST_TOKEN_FND01=test-fnd01-ingest-token-it`,
`SEC1_INGEST_TOKEN_IAM01=test-iam01-ingest-token-it`,
`SEC1_INGEST_TOKEN_IAM02=test-iam02-ingest-token-it`. Canonical command: `npm test`. Canonical
result: `Test Files 96 passed (96)` / `Tests 2195 passed (2195)`.

**CLT-01 Phase 4A.2A (pre-approval authorised-party capture) — now accepted, after one
reject/remediate/re-review cycle.** Extracted the four shared maker-checker mutation functions
(add/update/remove apply, screening-outcome) into `services/clt1/src/lib/authorised-party-
service.ts`, called identically by the pre-existing client-keyed post-approval routes and 8 new
application-keyed pre-approval routes (`services/clt1/src/routes/application-authorised-
parties.ts`) — no application-keyed activate/restrict/reject/suspend routes were added. Lifecycle:
pre-approval capture from `draft`/`submitted`/`under_review`; screening only from `under_review`;
post-approval maintenance only from `approved`. **Independent Opus review of the INITIAL
implementation → REJECT**: two empirically-proven critical findings — **CRITICAL-1** (a party
could be inserted into an already-`rejected` application, HTTP 200, since `reject`/`hold` take no
roster advisory lock and lifecycle was checked only as a route preflight) and **CRITICAL-2** (a
party could be inserted into an already-`approved` application after approval had already
committed and Phase 4A.1's own roster recheck had already passed, diverging the accepted
`kyc_roster_hash`, HTTP 200). **Remediation accepted**: added `lockAndAssertApplicationLifecycle`
— a `SELECT ... FOR UPDATE` row lock taken inside every shared mutation's own transaction, after
the roster advisory lock, before any write, gated by three trusted route-selected policy constants
(`PRE_APPROVAL_PARTY_STATUSES`, `PRE_APPROVAL_SCREENING_STATUSES`, `POST_APPROVAL_PARTY_STATUSES`)
never derived from caller input. **Independent Opus re-review → ACCEPT REMEDIATED PHASE 4A.2A —
WITH NON-BLOCKING FINDINGS** (0 Critical/High/Medium; 2 Low, 3 Informational, none blocking):
re-ran both original exploits unmodified — both now refuse with HTTP 409
`CLT1_APPLICATION_INVALID_STATE`, zero corruption; a 6x concurrent add-vs-approve race produced
zero both-success outcomes. Canonical full suite **2241/2241 (96/96 test files)**, migration head
**048**, no migration 049. The pre-existing held-state lifecycle gap (no resume/unhold transition)
is unchanged and remains explicitly out of scope.

**CLT-01 Phase 4A.2B (coordinated KYC anchor-sync integration) — now accepted, after one
test-order remediation cycle.** KYC-01 gains `POST /internal/kyc1/applications/:application_id/
roster-sync` — internal KYC service token only, no IAM-02, no caller-supplied actor identity —
which fetches the authoritative CLT-01 roster, requires `application_status='under_review'`, and
creates exactly one KYC `authorised_party` case for every required party with no KYC case at all;
any party with ANY existing case (any status — pending, remediation, completed, corrective) is
skipped, never re-created. Case creation now runs through one shared implementation
(`lib/kyc-case-creation.ts`) used by both the pre-existing handoff route and roster-sync. Audit
separation: handoff alone still emits `kyc1.handoff_received`; roster-sync never does, emitting
only `kyc1.case_created` per created anchor plus one bounded, PII-free `kyc1.roster_sync_processed`
summary event. The required-authority-status set and the application-scoped advisory lock
(`kyc1.outcome_publication:<application_id>`, unchanged namespace) are now shared exports consumed
identically by outcome publication and roster-sync. Completed-case and corrective-case retries are
safe; concurrent roster-sync calls serialise cleanly through the shared lock; a handoff-versus-
roster-sync race is bounded by the pre-existing partial unique index (atomic rollback, safe
convergent retry). Roster-sync creates authorised-party cases only, never a primary case; all
Phase 4B controls remain fully preserved. One new error `KYC1_APPLICATION_INVALID_STATE` (409) —
KYC error catalogue now **23**. One new audit event `kyc1.roster_sync_processed` — KYC audit-event
inventory now **21**. KYC route handlers now **17**; tables unchanged **6**; IAM-02 `kyc1.*`
permissions unchanged **2**; no `role_permission` seed; grants unchanged; CLT-01 runtime source
unchanged by this phase.

**The organic, no-raw-SQL D1-closing end-to-end test passes.** Real CLT-01 app + real KYC-01 app
in one process: create application → submit → start review → capture an authorised party through
the accepted CLT-01 Phase 4A.2A maker-checker routes → create the primary KYC case through the
existing handoff route → invoke KYC roster-sync (creating the authorised-party KYC case with
`party_id` exactly equal to the CLT-generated `authorised_party_id`) → complete evidence/checks/
outcomes for both cases → create the required AML handoff marker → deliver `aml_sanctions`/
`pep_adverse_media`/`risk_rating` → publish the roster-bound KYC outcome → deliver it atomically to
CLT-01 → request and apply final approval → `client_profile` created — zero raw SQL inserts of any
kind, no hand-written roster hash, no fake caller-supplied party id, no maker-checker bypass.

**Independent Opus review of the initial implementation found the runtime correct, with one
blocking test-infrastructure finding (MEDIUM-1, not a runtime defect) — since remediated and
re-verified, MEDIUM-1 closed.** The exact 21-event KYC audit-event inventory assertion had been
declared before the Phase 4A.2B block that first organically emits `kyc1.roster_sync_processed`,
so on a genuinely fresh database the assertion failed (2279/2280, 96/97 files) while a warm
database masked it. The exact-equality assertion (unweakened, same 21-member set) moved to a
final `describe` block executing after every KYC event-emitting test — no event manually seeded,
no runtime source changed. Independently re-verified on TWO separately-provisioned fresh
databases, canonical `npm test` **2280/2280 across 97/97 files** on each. **Accepted canonical
baseline**: `npx tsc -b --force` clean; KYC-01 integration **273/273**; KYC-01 unit **38/38**;
organic E2E **1/1**; CLT-01 regression **415/415**; AML-01 regression **191/191**; same-DB
targeted rerun **887/887**; migration head **048**; no migration 049. **2 Low** (non-blocking,
both independently proven correct despite lacking a dedicated implementation-suite test):
roster-sync's own audit-failure rollback, and the handoff-versus-roster-sync `23505` race — both
coverage housekeeping only; `primary_anchor_present` may report `true` when both an individual and
entity primary case exist — informational only, publication still correctly refuses
`anchor_ambiguous`. **4 Informational**: the held-state dead end (separate CLT-01 carry-forward);
the handoff route's exact SQL statement position changed while relative audit ordering is
preserved; the combined-role E2E fixture proves the full workflow but not cross-schema grant
isolation on its own; `entity_type="roster_sync"` is the first KYC audit `entity_type` with no
corresponding table, safely permitted by SEC-01's free-form field. **Known, pre-existing,
unrelated same-database limitation** (not a Phase 4A.2B finding): a second consecutive full-suite
run against an already-used database reproduces the documented one-time IAM-01/IAM-02/CFG-01
bootstrap-idempotency signature — KYC-01/CLT-01/AML-01 remain fully green in that run; canonical
acceptance rests on the two independently fresh-database runs above.

**D1 (authorised-party-roster-completeness) — closed. Technical roster-binding consistency is
enforced. Pre-approval authorised-party capture is operational. Deterministic KYC anchor creation
is operational. One complete organic CLT-to-KYC workflow — application creation, submission,
review, authorised-party capture, KYC roster sync, KYC evidence and outcome, roster-bound
publication, atomic delivery, and final approval — is proven end to end with no raw-SQL
authorised-party or KYC-case seeding.**

**Current module: KYC-01 — accepted implementation baseline through Phase 4B plus accepted Phase
4A.2B deterministic authorised-party anchor sync (still recorded as partial pending independent
confirmation that no later KYC-01 phases remain on its own module roadmap). CLT-01 — accepted core
implementation (Phases 0-9) plus accepted Phase 4A KYC roster prerequisite, accepted Phase 4A.1
atomic KYC roster binding, accepted Phase 4A.2A pre-approval authorised-party capture, and accepted
coordinated Phase 4A.2B KYC anchor-sync integration (CLT-01 remains a completed module, not
incomplete).
D1 is closed. Phase 4A.2B is accepted. The next implementation task must be selected from the
remaining approved module roadmap.** (See `MODULE_STATUS.md`'s own module-counts line for the full
cross-module picture — SEC-01 partial through Phase 5, CFG-01 partial through Phase 3B, AML-01
partial through Phase 3D, KYC-01 partial through Phase 4B plus accepted Phase 4A.2B, 9 modules not
started.)

**WLT-01 selected as the next approved-roadmap module.** Documented build order:
`WLT-01 → LED-01 → DEP-01 → WDR-01 → TRD-01 → E2E-01 → REC-01 → INC-01 → PRT-01` (corrects an
earlier assumed ledger-first ordering — WLT-01 is not a sub-ledger and holds no balances). WLT-01
v1.2 is the controlling blueprint; the v1.1→v1.2 delta is documentation-only (no substantive
route/table/state-machine/permission/error/audit-event/test/integration-contract change) — no
additional blueprint review is required before Phase 1 planning.

**WLT-01 Phase 0 (service scaffold, boot guard, internal route baseline) is now an accepted
implementation baseline.** New service `services/wlt1` (`@aix/service-wlt1`) — own
request-context plugin, own interim internal-service identity guard
(`WLT1_INTERNAL_SERVICE_TOKEN`, `timingSafeEqual`, fail-closed), own config loader, boot-time
`assertNoExchangeRuntime` (wired before `listen`), F3(c) import-boundary test, one production
route (`GET /internal/wlt1/health`, unauthenticated, `{status:"alive", module:"WLT-01"}`,
Fastify auto-registers `HEAD`). No `wlt1` schema, no `role_wlt1_runtime`, no migration 049, no
WLT grant file, no IAM-02 permission, no business route, no public route, no external
HTTP/provider call.

**Independent Opus review of Phase 0 → ACCEPT WITH NON-BLOCKING FINDINGS** (0 Critical/High; 1
Medium; 0 Low; 6 Informational), every claim independently reproduced rather than read from the
implementation report: `tsc -b --force` clean; WLT tests 45/45 (40 WLT-authored + 5 re-executed
shared import-boundary scanner tests); full canonical suite **2325/2325 across 102/102 files**
reproduced on two separately created genuinely fresh Postgres databases (one running the
canonical suite as its very first test action); direct `information_schema`/`pg_roles`/
`iam2.permission`/`iam2.role_permission` queries confirmed zero WLT-01 database footprint;
`package-lock.json`'s only change is the new workspace-member registration (no dependency
version changed); the boot guard was empirically proven to throw on an injected prohibited
route.

**MED-1 (mandatory Phase 1 entry condition, not an ordinary carry-forward)**: the inherited
shared import-boundary scanner (`tests/unit/iam-import-boundary.test.ts`, reused by every
module) does not detect dynamic `import()`, template-literal dynamic `import()`, `require()`,
or `@aix/service-*` sibling package aliases. Current WLT-01 Phase 0 source contains none of
these — verified by direct enumeration of every import specifier — so this is non-blocking for
Phase 0. It must close as the **first Phase 1 implementation commit**, before any WLT-01
business or sibling-integration code is added, since Phase 1+ will eventually add five sibling
HTTP clients (CFG-01/CLT-01/KYC-01/AML-01/IAM-02) — the largest sibling-integration surface of
any module built so far. The fix is test-only and closes the gap platform-wide (every module
reuses the same scanner).

**Informational (non-blocking):** health response includes `module:"WLT-01"` while other
services return only `status:"alive"`; the empty-error-catalogue TypeScript cast is narrowly
scoped and must be removed once Phase 1 adds the first real WLT error; the fetch-spy test's
`scratchApp.close()` should move into `finally` (fetch itself is already restored there); the
identity guard's nullish actor assignment is harmless while request context never accepts
caller-supplied actor identity; the explicit secondary token-presence check is unreachable after
shared `loadConfig` validation (inherited from AML-01's identical accepted Phase 0 precedent).

**Known, pre-existing, unrelated same-database limitation** (not a Phase 0 finding): a second
consecutive full-suite run against an already-used database reproduces the documented one-time
IAM-01/IAM-02/CFG-01 bootstrap-idempotency signature. No WLT-01 test is implicated; canonical
acceptance rests on the two independently fresh-database runs above.

**Current module: WLT-01 — partial through the accepted Phase 0 service scaffold, boot guard and
internal route baseline.** Phase 1 (schema `wlt1`, `role_wlt1_runtime`, migration 049,
destination registration/read, address canonicalisation and integrity, chain-coverage registry,
readiness route) has not begun. MED-1 must be closed as the first Phase 1 implementation commit.
Open decisions before Phase 1 coding: D-CFG (`cfg1.feature` has zero positive WLT entries;
unknown feature codes fail closed; no bypass permitted), D-CHAINS (initial supported-chain
coverage), D-COOLOFF (cooling-off duration source). AML-01 Phase 3E (synchronous stub-backed
pre-transaction gate) must land before WLT-01 Phase 4A; WLT Phase 4 remains split into 4A
(evaluate-use/token issuance/read-only verify) and 4B (verify-and-consume/release/LED-01
contract tests); LED-01 remains blocked until WLT-01 Phase 4B acceptance. The next task is
WLT-01 Phase 1 planning for the schema, runtime role, destination registration/read, address
canonicalisation and chain-coverage baseline. (See `MODULE_STATUS.md`'s own module-counts line
for the full cross-module picture — SEC-01 partial through Phase 5, CFG-01 partial through Phase
3B, AML-01 partial through Phase 3D, KYC-01 partial through Phase 4B plus accepted Phase 4A.2B,
WLT-01 partial through accepted Phase 0, 8 modules not started.)

**WLT-01 Phase 1A (MED-1 import-boundary control remediation) is now an accepted implementation
baseline.** MED-1 required closing 8 proven false negatives (dynamic `import()` with a string or
static-template specifier, non-static/interpolated dynamic `import()`, `require()`,
`require.resolve()`, `@aix/service-*` sibling package aliases and subpaths, `export {} from`/
`export type {} from`, `export * from`, `ImportEqualsDeclaration`) and 2 proven false positives
(commented-out sibling import text, import-like text inside an ordinary string). The inherited
regex-based `tests/unit/iam-import-boundary.test.ts` scanner is retired from that role;
`tests/helpers/module-import-boundary.ts` — a new, side-effect-free helper (no `describe`/`it`,
no DB/env/global side effects) — replaces it using `ts.createSourceFile` + structural AST
traversal, so comments and unrelated string literals are structurally invisible to the walk.
Dynamic-specifier policy: a `StringLiteral` or `NoSubstitutionTemplateLiteral` argument resolves
statically; any other shape fails closed as `unresolvable_dynamic_specifier`. Relative specifiers
are resolved against the importing file's own directory and compared by exact path segment
(never substring). Sibling package-alias names (`@aix/service-fnd`, `@aix/service-iam`,
`@aix/service-iam2`, `@aix/service-sec1`, `@aix/service-cfg1`, `@aix/service-clt1`,
`@aix/service-kyc1`, `@aix/service-aml1`, `@aix/service-wlt1`) are derived from each sibling's
own `package.json`, not hard-coded. `@aix/foundation`'s permitted entries are derived from
`packages/foundation/package.json`'s own `exports` map. All 8 consumers (IAM-01, IAM-02, SEC-01,
CFG-01, CLT-01, KYC-01, AML-01, WLT-01) now import the shared helper directly and register only
their own assertions.

**Independent Opus review of Phase 1A → ACCEPT WITH NON-BLOCKING FINDINGS** (0 Critical/High/
Medium; 2 Low; 4 Informational), every claim independently reproduced rather than read from the
implementation report: `tsc -b --force` clean; helper unit tests 32/32; all 8 module boundary
suites individually (IAM-01 2/2, the other 7 each 1/1) and together (41/41 across 9/9 files);
WLT-01 unit baseline 40/40; non-DB unit baseline 1054/1054 across 89/89 files; **canonical full
suite reproduced 2319/2319 across 103/103 files on two separately created, genuinely fresh
Postgres databases** (the second running the canonical suite as its very first test action);
migration head remains 048, no migration 049. The reviewer additionally scanned all 9 existing
service source trees (FND-01, IAM-01, IAM-02, SEC-01, CFG-01, CLT-01, KYC-01, AML-01, WLT-01)
against **all** sibling services under the enhanced rule and confirmed every one clean — no
dynamic sibling import, no `require`/`require.resolve` sibling import, no sibling re-export, no
sibling package alias, no foundation-internal import exists anywhere in current service source.

**Test-count reconciliation**: previous 2325 tests/102 files → accepted 2319 tests/103 files.
IAM-01 boundary suite 5→2 (−3); the other 7 consumer suites stop re-executing IAM-01's 5 tests
each (−35); the new helper suite adds 32 tests (+32); net −6 tests, +1 file. **The decrease is
entirely removed redundant test execution — it does not reduce control coverage**; authored
boundary-control coverage rose from 9 to 41 tests.

**MED-1 — closed.** The inherited regex-based import-boundary control was replaced with a
side-effect-free shared helper using the TypeScript compiler API. The control now detects static
imports, `import type`, side-effect imports, re-exports, dynamic imports, import-equals,
`require()`, `require.resolve()`, sibling-service package aliases and package subpaths.
Non-static dynamic specifiers fail closed. Comments and ordinary strings no longer produce false
positives.

**LOW-1** (mandatory first Phase 1B commit, not an ordinary carry-forward): the shared
`listSourceFiles` scans `.ts`/`.tsx` but not `.mts`/`.cts` — no such file currently exists under
any `services/*/src` tree, so this is non-blocking for Phase 1A, but must close (extend
scanning, add focused regression coverage, rerun all boundary suites) before any WLT-01 Phase 1B
business source is added. **LOW-2**: `tests/unit/sec1-external-anchor-boundary.test.ts` retains
a private copy of the retired regex scanner, proving a SEC-01 same-module call-site property
rather than sibling coupling — its underlying assertion remains true; scheduled for a later,
separate test-control pass, not blocking WLT-01. **Informational (non-blocking):** INFO-1 the
"zero test registration" tests establish the helper's export surface rather than directly
intercepting `describe`/`it` calls (side-effect-freedom independently confirmed instead by exact
suite-count reconciliation); title precision to improve later. INFO-2 several existing module
suites retain historically narrow sibling-forbidden sets (explicitly required by the Phase 1A
scope; all 9 trees independently confirmed clean against the complete sibling set regardless).
INFO-3 no dedicated `fnd-import-boundary.test.ts` exists (FND-01 covered indirectly today,
independently confirmed clean against every sibling). INFO-4 same-module package-alias policy
(e.g. `services/wlt1` importing `@aix/service-wlt1`) is permitted by current construction but
undocumented/untested — no current occurrence.

**WLT-01 Phase 1B (schema `wlt1`, `role_wlt1_runtime`, migration 049, wallet-destination
registration/read, Ethereum/TRON canonicalisation, chain-coverage baseline) is now an
accepted implementation baseline.** Gate A (LOW-1 remediation — `.mts`/`.cts` scanner
extension) closed and independently verified first (49/49 across 9/9 boundary suites)
before any Gate B business file was touched. Gate B: exactly 4 tables (`destination`,
`wallet_destination`, `address_integrity_check`, `chain_coverage`), `role_wlt1_runtime`
plus one WLT runtime grant file, `GET /internal/wlt1/readiness`, `POST
/internal/wlt1/wallet-destinations`, `GET
/internal/wlt1/wallet-destinations/:destination_id`, CLT-01 client-status validation
resolved fully before the WLT-01 transaction opens, deterministic Ethereum mainnet
EIP-55 canonicalisation (genuine Keccak-256, never SHA3-256) and TRON mainnet
Base58Check canonicalisation (double SHA-256) via
`@noble/hashes@1.8.0`/`@scure/base@1.2.6` (exact pins, no wallet/RPC/signing SDK
introduced), deterministic address-integrity evidence including durable refusal
evidence, deny-by-default chain-coverage registry seeded with exactly `ethereum/mainnet`
+ `tron/mainnet` (address-format coverage only, not asset approval — ETH/TRX/USDT
approval remains a separate CFG-01-licence-controlled decision), safe masked API
projection, natural-key duplicate prevention, request idempotency, client-scoped
advisory locking, and audit-coupled atomic registration. Exactly 3 audit event types, 10
reachable error codes, 0 IAM-02 permissions. Phase 1B is wallet-only — no fiat, no
screening, no whitelist, no public route.

**Independent Opus review of Phase 1B → ACCEPT WITH NON-BLOCKING FINDINGS** (0
Critical/High; 1 Medium; 5 Low; 7 Informational), every claim independently reproduced
via adversarial empirical probes on genuinely fresh disposable Postgres databases, not
read from the implementation report: a deterministic advisory-lock barrier (an
independent connection holds the lock; the registration request stays unsettled while
held; releasing it completes the request); a statement/HTTP-ordered instrumentation log
proving the CLT-01 fetch occurs at transaction depth 0, before `BEGIN`, with zero HTTP
calls at any non-zero transaction depth; live RLS isolation probes on
`foundation.idempotency_record` (RLS enabled and forced; WLT-01 sees/completes only its
own rows; another module's rows are invisible and unmodifiable; flipping `source_module`
is rejected; an unset `aix.module` context fails closed; the runtime role cannot bypass
RLS); a full live privilege matrix (every allowed operation succeeded, every denied
operation returned `42501`, all cross-schema reads denied at the schema level); an
independently written EIP-55 reference cross-checked against all 8 canonical spec
vectors; an independently written Base58Check reference cross-checked against two real
published TRON mainnet addresses; a full refusal-path inventory exercised against the
real database across all eleven refusal scenarios.

`npx tsc -b --force` clean; Gate A boundary suites 49/49 across 9/9 files; WLT unit
48/48 across 5 files; WLT integration 64/64; foundation/IAM/IAM-02/SEC-01 idempotency
regressions 237/237 across 4 files; CLT-01 status-route regressions 415/415; **first
independently fresh canonical suite 2399/2399 across 104/104 files; second independently
fresh canonical suite (canonical suite as its first test action) 2399/2399 across
104/104 files** — neither reused an already-tested database; migrations 001→049 clean;
all 9 grant files clean; migration 049 down/up/re-up clean; migration head 049; no
migration 050. `tests/integration/kyc1-db.test.ts` and
`tests/integration/clt1-db.test.ts` were updated only to recognize `049_wlt1_core`
specifically as a later unrelated migration — they do not accept an arbitrary migration
049 or migration 050+; CLT/KYC migration ownership assertions remain intact. No runtime
source, test assertion logic, migration, grant, package file, or TypeScript
configuration was changed during the Opus review.

**P1B-MED-1** (mandatory Phase 2 entry condition, not closed this sync): the database
chain-coverage registry and the in-process address dispatcher are currently aligned, but
no automated test enforces that alignment — the implementation comment claims the
relationship is protected by an integration test, but no such test currently exists.
Current database and dispatcher pairs are identical, current runtime behaviour is
correct, and no present unsupported or unhandled pair exists — non-blocking for Phase 1B
acceptance, but must close (a real bidirectional sync test between `wlt1.chain_coverage`
and the dispatcher's known pair inventory) before any Phase 2 chain/network coverage or
dispatcher change.

**P1B-LOW-1 through P1B-LOW-5** (all non-blocking): LOW-1 the committed concurrency test
is `Promise.all` timing-luck — runtime advisory locking is correct and was independently
proven with a real held-lock barrier, but the suite itself should gain a deterministic
barrier test. LOW-2 the route-level `23505`-to-`WLT1_DESTINATION_DUPLICATE` mapping
(`isDuplicateNaturalKeyViolation`) is correct but lacks direct route-level test
coverage. LOW-3 the TRON `invalid_network_prefix`/`invalid_payload_length` branches are
reachable and correct (proven with concrete witnesses) but the current named tests are
intercepted earlier by the T-prefix guard. LOW-4 refusals before `beginIdempotent`
create no idempotency record, so repeated blocked-client/invalid-address requests with
the same key produce repeated refusal evidence/audit rows (no destination is ever
created; follows the accepted Phase 1B order) — evaluate bounded deduplication during
Phase 2 planning. LOW-5 four redundant unique/explicit index pairs exist (harmless,
precedented by KYC-01's migration 042); the exact index inventory test currently asserts
only two of the four tables.

**P1B-INF-1 through P1B-INF-7** (informational, non-blocking): INF-1 `maskAddress`'s
≤10-character fallback and 11–13-character behaviour must be revisited before supporting
shorter-address formats (safe today for Ethereum/TRON lengths). INF-2 all dotted inputs
classify as name-service aliases before chain dispatch — safe fail-closed, not always
the most precise error. INF-3 some tests mutate `config.clt1FetchImpl` without explicit
restoration (contained by per-registration reset). INF-4 `foundation.idempotency_record`
UPDATE is table-wide at the grant level while RLS enforces isolation — column-scoped
UPDATE is feasible as a platform-wide hardening task shared by 4 other runtime roles,
not WLT-01-specific. INF-5 all upstream callers currently share the
`wlt1_internal_service` actor idempotency namespace. INF-6 the CLT-01 migration-head
drift guard moved to the newest WLT module test (coverage-neutral). INF-7 unused
`appPool`/`walletCount` test code should be removed during later hygiene.

**Test-infrastructure carry-forward (platform-wide, not WLT-01-specific):** several
module integration tests temporarily `REVOKE`/`GRANT INSERT` on
`foundation.outbox_event`; parallel execution can rarely cause a PostgreSQL catalogue
"tuple concurrently updated" race across cfg1/aml1/clt1/kyc1/wlt1's own audit-failure
tests. WLT-01 did not originate this pattern; both official parallel fresh-database runs
were green. A shared advisory lock around ACL mutation is recommended as a platform-wide
test-infrastructure improvement.

**WLT-01 Phase 2A (chain-coverage/dispatcher control and deterministic hardening) is now
an accepted implementation baseline; P1B-MED-1 is closed.** A typed
`CHAIN_CANONICALISER_REGISTRY` chain canonicaliser registry (`chain`/`network`/
`address_format`/`canonicalisation_version`/`canonicalise()` bound together per entry)
replaces the prior hard-coded supported-pair branches as the genuine runtime dispatch
authority; a registry-derived, read-only `CHAIN_DISPATCHER_INVENTORY` (never a second
hand-maintained list); a pure bidirectional `compareChainCoverageToDispatcher`
comparison helper; an authoritative integration test comparing real
`wlt1.chain_coverage` (`coverage_status='supported' AND activation_status='active'`)
against the real runtime dispatcher inventory in both directions across `chain`/
`network`/`address_format`/`canonicalisation_version`, plus four synthetic
one-sided/format/version drift meta-tests; the prior misleading sync-test comment
corrected. Also delivered: a deterministic `pg_locks`-proven registration advisory-lock
barrier test and a two-competitor barrier test (closing P1B-LOW-1); a real route-level
natural-key `23505` race test using a competing uncommitted transaction plus a direct
negative-coverage test of the duplicate-constraint predicate (closing P1B-LOW-2);
independently-verified TRON `invalid_network_prefix`/`invalid_payload_length` direct
branch vectors and honestly-renamed `t_prefix_required` tests (closing P1B-LOW-3); a
complete index inventory across all four current `wlt1` tables (closing P1B-LOW-5);
`config.clt1FetchImpl` restoration hygiene and dead test-code removal (closing
P1B-INF-3/P1B-INF-7); a test-only outbox-ACL advisory-lock helper
(`tests/helpers/outbox-acl-lock.ts`) adopted at WLT-01's own two ACL-mutation sites. No
Phase 2 screening business functionality, no migration 050, no schema/grant/permission/
route change. Baseline moved 2399/2399 (104 files) → **2412/2412 (104/104 files)**;
WLT-01 integration tests 64→77 (+13 — 6 sync/drift + registry-load-bearing test, 3 TRON
vector/branch tests, 4 duplicate-detection/lock tests — zero coverage removed; 4 tests
renamed, 1 index-inventory assertion strengthened/replaced).

**Independent Opus review of Phase 2A → ACCEPT WITH NON-BLOCKING FINDINGS** (0
Critical/High/Medium; 1 Low; 6 Informational), every claim independently reproduced on
two separately created, genuinely fresh Postgres databases: `npx tsc -b --force` clean;
WLT unit 48/48; WLT integration 77/77; import-boundary 49/49 across 9/9 files; CLT-01
regression 415/415; foundation/IAM/IAM-02/SEC-01 idempotency regressions 237/237 across
4 files; **both fresh canonical runs 2412/2412 across 104/104 files**, one with the
canonical suite as its literal first test action. The review ran three temporary, fully
reverted negative-control probes (hash-verified byte-identical restoration afterward),
which produced the decisive evidence: (1) hard-coded dispatch branches inserted ahead of
the registry left all 77 tests green, including the test titled "REGISTRY IS
LOAD-BEARING" — **P2A-LOW-1**, that specific test's proof is weaker than its title
claims, though production dispatch is confirmed registry-driven by source inspection;
(2) dropping `tron` from the registry while runtime dispatch stayed
hard-coded-unchanged caused the AUTHORITATIVE sync test alone to fail, with exactly
`coverage_without_dispatcher: tron/mainnet` — independently proving the actual
P1B-MED-1 drift control works; (3) disabling `takeRegistrationLock` made both new
deterministic lock-barrier tests fail at their poll timeout while the old un-renamed
`Promise.all` test still passed, confirming the new tests are genuinely non-vacuous.

Six Informational findings (P2A-INF-1..6): duplicate-key `Map` collapse in the
comparison helper, unreachable under the real `idx_wlt1_chain_coverage_chain_network`
unique index; the module-private registry is not runtime-frozen while the derived
`CHAIN_DISPATCHER_INVENTORY` is (verified: mutation attempts on the inventory were
rejected at runtime); a blocked-INSERT test matcher that could be more tightly scoped;
a `clt1FetchImpl` restoration convention judged safe by isolated-subset reruns (six
subsets each pass standalone); a committed harmless competitor fixture row left by the
23505 race test; no VCS in `aix-platform`, so absolute historical byte-equivalence
cannot be proven from version control. Unrelated-`23505` negative coverage was assessed
**ACCEPTABLE NON-BLOCKING LIMITATION** (forcing it end-to-end through the live route
was correctly judged unsafe — it would require predicting a `randomUUID()`-derived
identifier or a schema change made solely for the test; the duplicate-constraint
predicate is instead directly exercised against 7 cases). None of the findings reopen
P1B-MED-1 or block Phase 2B. **Migration-050 rule recorded**: migration 050 must not
read a runtime environment variable to backfill `wlt1.chain_coverage.provider_id` — use
an explicit, reviewed, deterministic provider identifier tied to the accepted stub
baseline, decided and frozen before implementation.

**WLT-01 Phase 2B (screening-persistence/provider-foundation baseline) is now an
accepted implementation baseline.** `infra/migrations/050_wlt1_screening.cjs` —
`wlt1.chain_coverage.provider_id` added and deterministically backfilled (no runtime
environment read; literal `stub-wallet-analytics-v1`, both accepted seed rows bound);
`wlt1.wallet_screening_result` (23 columns) and `wlt1.vendor_result_inbox` (14 columns)
created (WLT table count 4→6); `destination.status` CHECK deliberately unchanged
(`draft`/`revoked` only — Phase 2C's own migration 051 will widen it alongside the
route/guard that can reach the new states); deterministic single-pending and
provider-result-replay uniqueness controls enforced at the database level, independently
proven via real `23505` collisions; evidence-preserving down migration (refuses loudly
if either new table holds a row — independently proven for both tables separately).
Provider abstraction (`services/wlt1/src/lib/providers/{types,registry,stub-provider}.ts`):
a `WalletAnalyticsProvider` interface (chain/network/canonicalAddress input only — no
key/seed/signing/credential field); a deny-by-default, runtime-frozen registry
containing only the deterministic stub; `WLT1_SCREENING_PROVIDER` config (defaults to
the stub, validated at load time) with a production+stub boot refusal traced to have no
alternate startup path bypassing it; a 5000ms module-constant provider-call timeout,
never an env var, mapping to `unavailable`, never `clear`. Runtime grants extended
least-privilege on both new tables (SELECT/INSERT/column-scoped-UPDATE-only);
`chain_coverage` remains SELECT-only including `provider_id`. No screening route, no
receipt route, no lifecycle logic, no IAM-02 permission, no audit event, no business
error, no real vendor. Baseline moved 2412/2412 (104 files) → **2453/2453 (105/105
files)**; WLT integration 77→89 (+12).

**Independent Opus review of Phase 2B → ACCEPT WITH NON-BLOCKING FINDINGS** (0
Critical/High; 1 Medium; 1 Low; 6 Informational), every claim independently reproduced
on two separately created, genuinely fresh Postgres databases: `npx tsc -b --force`
clean; WLT unit 76/76 across the targeted five-file Phase 2B unit set; WLT integration
89/89; import-boundary 49/49 across 9/9 files; **both fresh canonical runs 2453/2453
across 105/105 files**, one with the canonical suite as its literal first test action.
Migration atomicity independently proven by injecting a temporary failure after `ADD
COLUMN`+backfill — the whole migration rolled back cleanly (head stayed 049,
`provider_id` absent, 4 tables); down-evidence safety independently proven for both new
tables separately (each refuses down while holding a row; both-empty succeeds; re-up
restores the exact schema). Two bookkeeping corrections applied: table column counts are
**23**/**14** (not the implementation report's 20/13 — schemas themselves correct) and
the platform grant-file count is **9** (not 10 — Phase 2B modified the existing WLT
grant file rather than creating a new one; no test depended on the wrong count).

**P2B-MED-1** (mandatory Phase 2C entry condition, not closed this sync): the
deterministic stub provider's seven scenario fixtures are symbolic labels, not valid
canonical Ethereum or TRON addresses — independently run through the real
`canonicaliseAddress`, all seven are rejected on both supported chains
(`0x_prefix_required`/`t_prefix_required`). A future screening route passing
`canonicalAddress` after WLT's own canonicalisation could never organically reach
`clear`/`review_required`/`high_risk`/`hit` through the stub. Non-blocking for Phase 2B
(no screening route exists yet); must close (fixture keys replaced with real canonical
EIP-55/Base58Check addresses) before Phase 2C's screening route lands. Provider unit
tests alone are insufficient evidence — they call `stubProvider.screen()` directly,
bypassing canonicalisation entirely.

**P2B-LOW-1** (non-blocking): migration 050's own comment states `risk_status`
"transitions exactly once to a terminal value," but this is not database-enforced —
independently proven: under `role_wlt1_runtime`, direct SQL performed
`pending→clear`, `clear→hit`, `hit→clear`, and `clear→pending`, all four succeeded. No
current runtime code can exploit this (no lifecycle route exists), but Phase 2C must
implement the one-way `pending→terminal` guard at the application/transaction level; the
migration wording must not be read as an enforced database invariant.

Six Informational findings (P2B-INF-1..6): table column counts and the grant-file count
were bookkeeping errors only (schemas/grants themselves correct — actual grant files:
`fnd`/`iam`/`iam2`/`sec1`/`cfg1`/`clt1`/`aml1`/`kyc1`/`wlt1`, 9 total);
`direct_exposure`/`indirect_exposure` remain `jsonb` with no Phase 2B normalized shape
(Phase 2C must define one before writing them); down/re-up drops and recreates the new
tables so runtime grants must be re-applied afterward (expected platform convention —
migrations first, grants after); `wallet_screening_result` has no
`UNIQUE(provider_id, provider_result_id)` by design (a legitimate rescreen may reuse the
same provider-derived result id; replay uniqueness correctly lives on
`vendor_result_inbox` instead, and Phase 2C should correlate by `screening_result_id`);
one review attempt reproduced the known warm-database IAM/IAM-02 bootstrap signature
after contaminating a database with targeted suites first — excluded from acceptance
evidence, two genuinely fresh databases both passed clean. **Migration
regression-test coverage gap (non-blocking):** migration up/down/re-up and the
evidence-row down-refusal for both tables are independently verified against real
databases but not yet automated as committed regression tests — a candidate for Phase
2C Gate A or a dedicated migration-hardening pass.

**WLT-01 Phase 2C-A (canonical-fixture/migration-regression/normalized-type baseline)
is now an accepted implementation baseline; P2B-MED-1 is closed.** The Phase 2B stub's
seven symbolic scenario lookup values were replaced by genuine synthetic-but-
canonicalisation-valid Ethereum EIP-55 and TRON Base58Check addresses — the exact
accepted matrix: CLEAR `0x56445b274e67797c7a0C151919085239322a31c5` (ethereum/mainnet);
REVIEW_REQUIRED `0x56445B274E67797c6b16101919085239322A31d4` (ethereum/mainnet);
HIGH_RISK `TG1mwc48txnCWUGN3JK2ZxR54RpAHcuMeM` (tron/mainnet); HIT
`TG1mwc48txnCVqsHLDw1ZZGg3s3hMuJTTt` (tron/mainnet); UNAVAILABLE
`0x56445b274E67797C6c0E061919085239322a31D3` (ethereum/mainnet);
INVALID_RESPONSE-MALFORMED `TG1mwc48txnE7hj2sDDzdCgtQsmHY4MyDS` (tron/mainnet);
INVALID_RESPONSE-UNMAPPED-CATEGORY `0x56445b274E67797C6C0e0a1919085239322A31D3`
(ethereum/mainnet) — all seven synthetic/test-only, never customer wallet addresses.
Also delivered: committed automated migration-050 regression coverage
(`tests/integration/wlt1-migration-050-regression.test.ts`, a uniquely-named disposable
database via the real `node-pg-migrate` runner) proving 049→050, both
evidence-preserving down-refusals independently, clean down/re-up, and chain-coverage
provider-binding restoration — closing the previously carried-forward automated-test
gap; and a normalized exposure/screening-result type freeze
(`NormalizedExposureEntry {category: RiskCategory}`, bounded to 16 entries,
category-only, `[]` meaning "screened, no exposure" — never `null` on a constructed
result — plus the sanctions cross-field consistency rule, invoked live during every
stub result construction, not merely unit-tested). No migration 051, no route, no
lifecycle mutation, no business error, no audit event, no IAM-02 permission, no
threshold arithmetic, no validity policy. Baseline moved 2453/2453 (105 files) →
**2506/2506 (106/106 files)**; provider unit tests 20→67 (+47), plus the new
migration-regression file (+6) = **+53 net**.

**Independent Opus review of Phase 2C-A → ACCEPT WITH NON-BLOCKING FINDINGS** (0
Critical/High; 1 Medium; 1 Low; 4 Informational), every claim independently reproduced
on two separately created, genuinely fresh Postgres databases: `npx tsc -b --force`
clean; provider unit 67/67; targeted WLT unit 123/123 across 5 files (app 17 + config
24 + identity 8 + no-exchange 7 + providers 67); WLT integration 89/89; import-boundary
49/49 across 9/9 files; CLT-01 regression 415/415; idempotency regressions 237/237
across 4 files; **both fresh canonical runs 2506/2506 across 106/106 files**, one with
the canonical suite as its literal first test action. All seven fixtures independently
re-verified against the real `canonicaliseAddress` (genuine EIP-55/Base58Check,
idempotent, mutually unique, 4 Ethereum/3 TRON) and proven organically reachable
end-to-end (canonicalisation → provider). Migration 050 confirmed byte-identical to the
accepted Phase 2B artifact (hash `21f0ac852e340961f707d40b1a678718`). The
migration-regression test's `afterAll` cleanup was independently proven to run even on
a forced test failure (temporary probe, fully reverted).

**P2CA-MED-1** (mandatory before any result-persistence path, not blocking Phase 2C-A):
`NormalizedScreeningResult` carries non-nullable `sourceAuthenticated`/`payloadHash`,
and the synchronous stub returns `sourceAuthenticated: true` — conflicting with the
approved semantic that a synchronous in-process result has no external source to
authenticate (`source_authenticated = NULL`). Both fields must move out of the
provider-owned result into the application/receipt envelope before Phase 2C-B's
result-application service can persist anything.

**P2CA-LOW-1** (non-blocking): the stub selects outcomes by `canonicalAddress` alone,
not `(chain, network, canonicalAddress)` — independently proven reachable with a
mismatched chain/network; harmless today because real canonicalisation is chain-specific
and structurally prevents a genuine mismatch from reaching the provider, but should be
closed before or with the Phase 2C-C `/screen` route.

Four Informational findings (P2CA-INF-1..4): prototype/Symbol-keyed exposure input
cannot smuggle prohibited fields because the normalizer emits a fresh `{category}`
literal rather than passing input through; the migration-regression test's A–H steps
are intentionally order-dependent within one file (standard for stepwise migration
tests); the `count:49` baseline is self-guarding via an immediate head assertion; the
stub's `payloadHash` fixture values are placeholders, not real hashes, subsumed by
P2CA-MED-1.

**WLT-01 Phase 2C-B (screening-lifecycle/result-application baseline) implemented and
accepted; P2CA-MED-1 and P2B-LOW-1 both closed.**
`infra/migrations/051_wlt1_screening_lifecycle.cjs` widens `wlt1.destination.status`'s
CHECK from the Phase 1B two-state set (`draft`/`revoked`) to the accepted four-state
Phase 2C set (`draft`/`pending_screening`/`pending_review`/`revoked`) under an explicit
stable constraint name (`chk_wlt1_destination_status`), plus a necessary compatibility
widening of the `status` column from `varchar(16)` to `varchar(32)` (`pending_screening`
is 17 characters, one over the Phase 1B width — approved as part of this phase's scope,
not undeclared drift); migration verifies the exact pre-051 baseline via `pg_constraint`
before touching anything, and its down migration refuses if any destination is currently
`pending_screening`/`pending_review`, independently proven for both states.
`services/wlt1/src/lib/screening-application.ts`'s `applyNormalizedScreeningResult` is
the ONE authoritative result-application function — owns its own transaction, takes the
`wlt1.destination:<id>` advisory lock then `FOR UPDATE` on both destination and
screening rows, enforces the one-way `pending → exactly one terminal state` gate
application-side (P2B-LOW-1), verifies current/latest screening version and provider
binding against the pending row, computes effective validity as `min(providerValidUntil
?? +Infinity, issuedAtUtc + ceilingHours)`, and publishes 1-3 audits inside the same
transaction as the terminal update. P2CA-MED-1 remediation: `NormalizedScreeningResult`
no longer carries `sourceAuthenticated`/`payloadHash` — both moved to an
application-owned `ScreeningEvidenceEnvelope` discriminated union; the stub's fake
`sha256:stub:*` placeholder is removed entirely. Two new business errors
(`WLT1_DESTINATION_INVALID_STATE` 409, `WLT1_VENDOR_RESULT_INVALID` 422 — inventory 10 →
12); three new audits (`wallet_screening_completed`, `wallet_high_risk_detected`,
`wallet_sanctions_exposure` — inventory 3 → 6); `WLT1_SCREENING_MAX_VALIDITY_HOURS`
(default 720, range 1-8760) and `WLT1_PROVIDER_RECEIPT_TOKEN` (optional, >=32 chars,
latent) added to config. No route, no lifecycle initiation, no IAM-02 permission, no
grant change. Baseline moved 2506/2506 (106 files) → **2556/2556 (108/108 files)**; +50
net tests (provider unit +6, config unit +12, new screening-application service tests
+25, new migration-051 regression +7).

**Independent Opus review of Phase 2C-B → ACCEPT WITH NON-BLOCKING FINDINGS** (0
Critical/High; 2 Medium; 3 Low; 4 Informational) — every claim independently reproduced
via adversarial empirical probes against two separately created, genuinely fresh
Postgres databases (canonical SEC-01 ingest tokens, migrations 001→051, all 9 grant
files): `npx tsc -b --force` clean; provider unit 73/73; config unit 36/36;
screening-application 25/25; migration-051 regression 7/7; targeted WLT unit 141/141
across 5 files; WLT integration 89/89; boundary 49/49 across 9/9 files; CLT-01
regression 415/415; idempotency regressions 237/237 across 4 files; **both fresh
canonical runs 2556/2556 across 108/108 files**, one with the canonical suite as its
literal first test action. The one-way `pending → terminal` gate was independently
reproduced in all four directions (`clear→hit`, `hit→clear`, `high_risk→clear`,
`review_required→hit`, each rejected with state unchanged) — **P2B-LOW-1 closed**.
`sourceAuthenticated`/`payloadHash` confirmed absent from the provider result type and
the stub's fake hash confirmed fully removed — **P2CA-MED-1 closed**. Audit rollback
proven fully atomic under a real `REVOKE INSERT ON foundation.outbox_event` (screening
row remained `pending`, destination remained `pending_screening`, zero audits
committed). The updated audit-inventory assertion was independently proven to still be a
strong allowlist, not a weakened subset check, by injecting an unapproved `wlt1.%` event
type and confirming the test fails, then passes again once removed.

**P2CB-MED-1** (mandatory Phase 2C-C entry gate, not blocking Phase 2C-B — no production
caller exists yet): the screening validity ceiling is caller-selectable at the
persistence boundary — `applyNormalizedScreeningResult` accepts
`screeningMaxValidityHours` as an unvalidated primitive rather than obtaining it from
authoritative validated `Wlt1Config`. Independently proven live: passing 8760 while boot
config defaults to 720 persists 365 days instead of 30; passing 87600/876000 persists
10/~100 years; `1.5` (non-integer) is accepted; `NaN` escapes as an unmapped
`RangeError` rather than a WLT error. The boot-time 1-8760 validation constrains only
the environment variable, not the persistence authority. Phase 2C-C must obtain the
ceiling from validated config through an authoritative composition seam
(factory/closure), never as a caller-chosen primitive. **P2CB-MED-2** (mandatory Phase
2C-D entry gate, not blocking Phase 2C-B — no production caller imports the receipt path
yet): `provider_receipt` evidence-envelope provenance is caller-forgeable — any caller
constructing a plain `{sourceKind: "provider_receipt", ...}` object literal causes
`source_authenticated = TRUE` to persist with zero authentication having occurred, and
`payloadHash` is accepted with no format/length/canonical-fingerprint validation
(independently proven with `"not-a-hash-at-all"`, `""`, and a single-character string,
all accepted; an 88-character value reached PostgreSQL directly and returned unmapped
`22001`). Phase 2C-D must make `provider_receipt` unconstructible outside the
authentication boundary (an opaque/branded envelope minted only after timing-safe
credential verification) and validate `payloadHash` as the canonical 64-character
foundation fingerprint before persistence.

**L1** (non-blocking, Phase 2C-C): `issuedAtUtc`/`validUntilUtc` parsing accepts
timezone-naive/local-time strings and lets JavaScript `Date` reinterpret them by server
timezone (e.g. `"2026-08-11"` → UTC midnight, `"Aug 11 2026"` → local-time
interpretation) — consistent with the existing SEC-01 `Date`-parsing precedent, but
WLT's future `/screen` route should be the first to require an explicit-offset/UTC
timestamp contract at the schema layer. **L2** (non-blocking, Phase 2C-C coverage): the
implementation report's claim that a pending-but-superseded screening row is
structurally impossible was independently disproven — a terminal higher-version row is
constructible via the runtime role's own table-level INSERT grant, and the
`MAX(screening_result_version)` guard then correctly rejects the superseded pending row;
the production guard is correct, only the committed test coverage and stated rationale
were incomplete. Phase 2C-C should add a committed superseded-version regression test.
**L3** (non-blocking, Phase 2C-C): an audit/outbox write failure inside
`applyNormalizedScreeningResult` currently surfaces as a raw PostgreSQL `42501` rather
than the module's `WLT1_AUDIT_REQUIRED` code — consistent with the accepted Phase 1B
library/route split (the route layer performs this mapping); Phase 2C-C's `/screen`
route must apply the same mapping. The underlying transaction rollback itself is already
fully atomic and correct.

Four Informational findings (independently confirmed, non-blocking): **I1** migration
051's header cites `client_status_ref` as its `varchar(32)` width precedent —
`client_status_ref` is actually `varchar(128)`; the width decision itself (32, sized for
`pending_screening`'s 17 characters with headroom) remains approved, only the cited
precedent is inaccurate. **I2** the screening-application test file's header comment
says audits are scoped by `entity_id`; the actual helper correctly scopes via
`payload_ref::text LIKE` because `entity_id` is not a real column on
`foundation.outbox_event` — stale comment only. **I3** `Number()` accepts non-canonical
numeric forms (`"0x2D0"`, `"7.2e2"`) that evaluate exactly to 720 — benign under current
range validation. **I4** `provider_result_id` intentionally carries no index or
uniqueness constraint and may repeat across different screening histories — confirmed
correct evidence-not-identity design, not a defect.

**Current module: WLT-01 Phase 2C-B is accepted. WLT-01 remains partial through accepted
Phases 0, 1A, 1B, 2A, 2B, 2C-A and 2C-B. P1B-MED-1, P2B-MED-1, the migration-050
automated-regression coverage gap, P2CA-MED-1, and P2B-LOW-1 are all closed. Corrected
accepted baseline: 2556/2556 tests across 108/108 files, two independently fresh
acceptance databases; migration head `051_wlt1_screening_lifecycle`; 6 WLT tables; 9
grant files; 4 routes; 12 business errors; 6 audit event types; 0 WLT IAM-02
permissions; `destination.status varchar(32)` —
`draft`/`pending_screening`/`pending_review`/`revoked`. P2CB-MED-1 blocks Phase 2C-C
implementation; P2CB-MED-2 blocks Phase 2C-D implementation. WLT-01 Phase 2C-C planning
is authorized after this status synchronization; Phase 2C-C implementation has not
started and is not yet authorized.**

Mandatory Phase 2C-C entry gates: **P2CB-MED-1** (screening validity ceiling must come
from validated `Wlt1Config` through an authoritative composition seam, never a
caller-chosen primitive); **P2CA-LOW-1** (bind stub fixture identity to `(chain,
network, canonicalAddress)`, not `canonicalAddress` alone); **L1** (route schema must
require explicit-offset/UTC timestamps); **L2** (add a committed
superseded-screening-version regression test); **L3** (route layer must map unexpected
audit/outbox persistence failures to `WLT1_AUDIT_REQUIRED`, matching the accepted Phase
1B library/route split). Only after all five are resolved may Phase 2C-C implement `POST
/internal/wlt1/wallet-destinations/:destination_id/screen`, `draft` →
`pending_screening` initiation, screening version allocation, provider call outside the
transaction, Idempotency-Key, pending resume/retry, the `wallet_screening_requested`
audit, `WLT1_SERVICE_UNAVAILABLE` for provider outage, and concurrency controls. Phase
2C-D remains separately gated on **P2CB-MED-2** (provider_receipt provenance must become
unconstructible outside the authentication boundary; `payloadHash` must be validated as
the canonical 64-character foundation fingerprint) before the receipt route may be
implemented.

Carry-forwards into Phase 2C-C: P2CB-MED-1 (blocking), P2CA-LOW-1, L1, L2, L3, I1
through I4, P2CA-INF-1 through P2CA-INF-4, P2B-INF-1 through P2B-INF-6, P2A-LOW-1,
P2A-INF-1 through P2A-INF-6, P1B-LOW-4 (refusal-idempotency behaviour retained by
explicit architecture decision), the remaining CFG-01/AML-01/CLT-01/KYC-01 outbox-ACL
sites not yet migrated to the shared test lock helper, Phase 1A's LOW-2,
full-sibling-set widening, dedicated FND-01 boundary suite, same-module package-alias
policy, `maskAddress` shorter-address-format consideration, dotted-input
alias-classification precision, `foundation.idempotency_record` column-scoped UPDATE
hardening, shared internal-service idempotency namespace, the interim shared-secret
internal-identity model (most consequential for WLT-01 once `/screen`/receipt routes
land), no rescreening/refresh path yet (the 720h validity ceiling has no supported
renewal route). Deferred to Phase 2C-D: P2CB-MED-2 (blocking), the receipt route,
receipt-token `timingSafeEqual` execution, inbox processing, replay/tamper handling.
Deferred further: proof-of-control (Phase 3), own-name/KYC-verified-identity binding
(blocked); AML-01 Phase 3E required before WLT-01 Phase 4A; WLT Phase 4 remains split
into 4A/4B; LED-01 remains blocked until WLT-01 Phase 4B acceptance; real vendor
onboarding deferred until after WLT-01 Phase 6 — Phase 2C-B remains deterministic
stub-only, no vendor URL/SDK/API key/live request/RPC.

**WLT-01 Phase 2C-C1 (structural-screening-foundation baseline) implemented and
accepted; P2CA-LOW-1, L1, and L2 all closed; P2CB-MED-1's apply-call layer closed.**
`infra/migrations/052_wlt1_screening_address_hash_width.cjs` widens
`wlt1.wallet_screening_result.address_hash` from `varchar(64)` to `varchar(128)`,
matching `wlt1.wallet_destination.address_hash` — discovered empirically: the accepted
`computeAddressHash(...)` foundation-fingerprint representation is 71 characters, which
Phase 2C-C2 must copy from `wallet_destination` into a screening row, and the pre-052
column could not hold it; baseline-verified up (fails closed unless the column is
exactly `varchar(64)`) and evidence-preserving down (refuses if any value exceeds 64
characters). `services/wlt1/src/lib/screening-application.ts`'s
`createScreeningApplication(config: Wlt1Config)` is now the sole exported entry point —
the raw persistence function is private, and the returned service's
`applyNormalizedScreeningResult` accepts no `screeningMaxValidityHours` parameter in any
form (P2CB-MED-1 apply-call remediation — the field was deleted, not defaulted). The
same file adds the L1 strict RFC-3339 timestamp grammar (mandatory explicit `Z`/numeric
offset, checked before `Date` construction) at the screening-result persistence boundary
— a WLT-local contract, not a platform-wide change.
`services/wlt1/src/lib/providers/stub-provider.ts` — fixture identity is now the
composite `chain:network:canonicalAddress` triplet (P2CA-LOW-1 remediation; the
previously-exploitable TRON `high_risk`/`hit` fixtures paired with `chain="ethereum"` no
longer leak their configured outcome); `createStubWalletAnalyticsProvider(time:
Pick<TimeService,"nowUtc">)` replaces the fixed epoch-0 `issuedAtUtc` with an injectable
clock, the frozen `stubProvider` export built from the real `systemTime` singleton (no
registry/server change needed). L2 committed coverage: a legally-constructed
pending-v1-plus-terminal-v2 pair (via the runtime role's own INSERT grant, no constraint
bypassed) now proves the "superseded by a newer version" guard is genuinely reachable,
closing the coverage gap the Phase 2C-B report had incorrectly called structurally
impossible. No route, no audit/error/permission inventory change, no grant change.
Baseline moved 2556/2556 (108 files) → **2611/2611 (109/109 files)**; provider unit
73→102 (+29), config unit unchanged (36), new screening-application tests (+18), new
migration-052 regression (+7), wlt1-db 89→90 (+1).

**Independent Opus review of Phase 2C-C1 → ACCEPT WITH NON-BLOCKING FINDINGS** (0
Critical/High; 1 Medium; 2 Low; 4 Informational) — every claim independently reproduced
via adversarial empirical probes against two separately created, genuinely fresh
Postgres databases: `npx tsc -b --force` clean; provider unit 102/102; config unit
36/36; screening-application 43/43; migration-052 regression 7/7; WLT integration 90/90;
boundary 49/49 across 9/9 files; CLT regression 433/433 (the historical 415 figure
covers only `clt1-db.test.ts`; the broader `tests/integration/clt1` glob also matches
`clt1-iam2-guard-real.test.ts` (18 tests) — 415 + 18 = 433, no CLT source or coverage
changed); **both fresh canonical runs 2611/2611 across 109/109 files**, one with the
canonical suite as its literal first test action. Migration 052's fail-closed baseline
verification, the real 71-character `computeAddressHash` overflow against head 051 and
byte-for-byte persistence against head 052, both down-refusal/preservation proofs, and
clean down/re-up were all independently reproduced from a private disposable database.
**Real-registration integration proof**: independent review registered a destination
through the actual `POST /internal/wlt1/wallet-destinations` route, read the genuine
71-character `wallet_destination.address_hash` it persisted, and copied that exact value
into `wallet_screening_result.address_hash` at head 052 — succeeded byte-for-byte,
proving migration 052 supports the exact data flow Phase 2C-C2 needs. All seven provider
fixtures independently reproduced on correct triplets; every fixture independently
proven to fail closed on both wrong chain and wrong network, including the two
previously-exploitable TRON/ethereum-chain cases. The RFC-3339 grammar was adversarially
probed beyond the three examples (fractional-second variants, lowercase `z`,
missing-colon offsets, `+24:00`/`+08:60`/`-99:99`, month-13/day-32/minute-60/second-60)
— all syntax-invalid forms rejected before `Date` construction, all
semantically-invalid-but-syntactically-valid forms rejected at the `Date` stage;
`Z`/`+08:00`/`-08:00` forms of the identical instant confirmed to persist identically.
L2's superseded-version rejection independently reproduced with full state preservation
(v1 still pending, v2 unchanged, destination unchanged, zero audits from the rejected
call).

**P2CC1-MED-1** (mandatory Phase 2C-C2 entry gate, not blocking Phase 2C-C1 — no
production caller exists yet): `createScreeningApplication(config: Wlt1Config)` performs
no runtime validation of its own config argument — `Wlt1Config` is a plain structural
TypeScript interface, so an ordinary internal caller may construct or spread a valid
config and replace `screeningMaxValidityHours` with an unvalidated value
(`{...loadWlt1Config(env), screeningMaxValidityHours: 876000}` type-checks with no
cast). Independently proven live: a forged 876000/8760000-hour ceiling persisted
~100/~1000-year validity; `NaN`/`Infinity` escaped as an unmapped `RangeError`. The
apply-call layer is genuinely closed — injecting `screeningMaxValidityHours` at the
apply call itself does not alter the captured ceiling — but full construction-authority
closure is conditional on Phase 2C-C2's server composition: `server.ts` must construct
the screening-application service ONCE from `app.config` (the validated output of the
boot-time `loadWlt1Config` path) and inject the already-configured service into the
route; the route must never receive a `Wlt1Config`, `screeningMaxValidityHours`, the
`createScreeningApplication` factory, or raw environment values.

**P2CC1-LOW-1** (non-blocking, platform-wide tooling property, not a C1 runtime defect):
the committed `@ts-expect-error` assertion inside `wlt1-screening-application.test.ts`
is not load-bearing — `tsconfig.json` references only production `src/**/*.ts` per
service/package project, so `tests/**` is never typechecked by `npx tsc -b --force`, and
Vitest transpiles via esbuild without semantic checking. Independent review removed the
forbidden property while leaving the directive in place and confirmed `tsc -b --force`
still passed — no `@ts-expect-error` in any test file has ever been load-bearing. The
runtime half of the same test (exact key-set assertion, persisted ceiling still governed
by the 720h test config) remains valid. Future project decision (not made here): either
add a dedicated test-typecheck project, or stop describing `@ts-expect-error` inside
tests as compile-time proof. **P2CC1-LOW-2** (non-blocking, sub-case of P2CC1-MED-1):
`NaN`/`Infinity` forged into a service's config still escape as an unmapped `RangeError`
rather than a WLT error; this becomes unreachable once Phase 2C-C2 makes
`app.config`-only construction the sole composition site.

Four Informational findings (independently confirmed, non-blocking): **INF-2**
JavaScript `Date` may silently normalize an invalid leap day (e.g.
`2025-02-29T07:00:00Z`) to the following day rather than reject it — a bounded
provider-side parsing quirk under the accepted explicit-offset syntax, does not reopen
L1. **INF-3** `24:00:00` may similarly normalize to next-day midnight. **INF-4**
composite fixture-key delimiter collision is structurally absent for the currently
supported chains — `CHAIN_NETWORK_PATTERN` (`^[a-z0-9_]+$`) forbids colons, and both
supported address formats (0x-hex, Base58Check) are colon-free; no additional escaping
is required for the deterministic stub.

**Current module: WLT-01 Phase 2C-C1 is accepted. WLT-01 remains partial through
accepted Phases 0, 1A, 1B, 2A, 2B, 2C-A, 2C-B and 2C-C1. P1B-MED-1, P2B-MED-1, the
migration-050 automated-regression coverage gap, P2CA-MED-1, P2B-LOW-1, P2CA-LOW-1, L1,
and L2 are all closed. Corrected accepted baseline: 2611/2611 tests across 109/109
files, two independently fresh acceptance databases; migration head
`052_wlt1_screening_address_hash_width`; 6 WLT tables; 9 grant files; 4 routes; 12
business errors; 6 audit event types; 0 WLT IAM-02 permissions;
`wallet_screening_result.address_hash varchar(128)`; `destination.status varchar(32)` —
`draft`/`pending_screening`/`pending_review`/`revoked`. P2CB-MED-1's apply-call layer is
closed; its residual construction-authority issue is P2CC1-MED-1, which blocks Phase
2C-C2 implementation. P2CB-MED-2 blocks Phase 2C-D implementation (unchanged). WLT-01
Phase 2C-C2 planning is authorized after this status synchronization; Phase 2C-C2
implementation has not started and is not yet authorized.**

Mandatory Phase 2C-C2 entry gates: **P2CC1-MED-1** (screening-application construction
must be restricted to the sole validated `app.config` composition site in `server.ts` —
the route must never receive a `Wlt1Config`, the raw ceiling, or the factory itself);
**L3** (route layer must map unexpected audit/outbox persistence failures to
`WLT1_AUDIT_REQUIRED`, matching the accepted Phase 1B library/route split). Only after
both are resolved may Phase 2C-C2 implement `POST
/internal/wlt1/wallet-destinations/:destination_id/screen`: internal authentication,
empty `{}` body, Idempotency-Key, `draft` → `pending_screening` initiation, screening
version allocation, copying the real 71-character `address_hash` from
`wallet_destination`, the `wallet_screening_requested` audit, server-side provider
resolution, provider call outside the transaction, the configured screening-application
service for terminal application, HTTP 200 for a terminal result, and HTTP 202 for a
durable pending outcome. Resume/retry remains Phase 2C-C3 — Phase 2C-C2 does not
implement it.

Carry-forwards into Phase 2C-C2: P2CC1-MED-1 (blocking), P2CC1-LOW-1, P2CC1-LOW-2,
INF-2, INF-3, INF-4, L3 (blocking), P2CA-INF-1 through P2CA-INF-4, P2B-INF-1 through
P2B-INF-6, P2A-LOW-1, P2A-INF-1 through P2A-INF-6, P1B-LOW-4, the interim shared-secret
internal-identity model, no rescreening/refresh path yet. Deferred to Phase 2C-D:
P2CB-MED-2 (blocking), the payload-hash 71-vs-64 width/fingerprint-format decision
(foundation `fingerprint()` is 71 characters, both `payload_hash` columns remain
`varchar(64)`; Phase 2C-D planning must deliberately choose between widening the columns
or defining a bare 64-hex digest — no choice made here), the receipt route,
receipt-token `timingSafeEqual` execution, inbox processing, replay/tamper handling. The
202-pending/200-terminal response contract is frozen for Phase 2C-C2/C3 planning only —
no route, response code, or body exists yet. Deferred further: proof-of-control (Phase
3), own-name/KYC-verified-identity binding (blocked); AML-01 Phase 3E required before
WLT-01 Phase 4A; WLT Phase 4 remains split into 4A/4B; LED-01 remains blocked until
WLT-01 Phase 4B acceptance; real vendor onboarding deferred until after WLT-01 Phase 6 —
Phase 2C-C1 remains deterministic stub-only, no vendor URL/SDK/API key/live request/RPC.

**WLT-01 Phase 2C-C2 (screening-initiation-route baseline) implemented;
P2CC1-MED-1 and L3 both closed at entry.** `POST
/internal/wlt1/wallet-destinations/:destination_id/screen` —
internal-service-authenticated, `Idempotency-Key`-bound to the target
`destination_id`; server-owned validated `ScreeningApplicationService`
composition (`server.ts` sole ordinary production construction site); `draft`
→ `pending_screening` initiation inside TX-1 with
`MAX(screening_result_version)+1` allocation and an exact real
71-character `address_hash` copy; server-side chain/network/provider
resolution with `chain_coverage.provider_id` as the authoritative identity;
provider invocation strictly outside TX-1 (depth 0, only after commit);
`wlt1.wallet_screening_requested` audit inside TX-1; terminal application on
a `screened` outcome (HTTP 200); HTTP 202 on `unavailable`/`invalid_response`;
route-level `WLT1_AUDIT_REQUIRED` mapping (L3) for unexpected
TX-1/terminal-application failures. Routes 4→5, audits 6→7.

**Independent Opus review of Phase 2C-C2 → PHASE 2C-C2 ACCEPTANCE BLOCKED**
(0 Critical; 1 High — P2CC2-HIGH-1; 1 Medium — P2CC2-MED-1; 2 Low —
P2CC2-LOW-1, P2CC2-LOW-2; 4 Informational), every claim independently
reproduced via adversarial empirical probes on genuinely fresh disposable
Postgres databases. **P2CC1-MED-1 and L3 independently reconfirmed CLOSED,
untouched by this finding set.** **P2CC2-HIGH-1** — the same-key
pending-rehydration branch hardcoded `provider_attempt = "unavailable"` for
every replay of a still-`pending` screening regardless of actual history;
reproduced as factually false on multiple reachable paths (replay after a
genuine `invalid_response`; replay while the provider call was still in
flight; replay after TX-1 committed but before the provider was ever
invoked). **P2CC2-MED-1** — `wlt1-screening-route.test.ts`'s own fixture
cleanup performed unscoped, table-wide `DELETE`s colliding with sibling
WLT-01 files under Vitest's default cross-file parallelism (16–22 failures
per co-scheduled run). **P2CC2-LOW-1** — the fabricated replay disposition
carried `reason_code = "screening_still_pending"`, outside the approved
provider-reason allowlist. **P2CC2-LOW-2** — the test-only
`screeningProviderImpl` seam could override not just the callable
implementation but the persisted `provider_id` identity itself.

**P2CC2-HIGH-1/LOW-1/LOW-2/MED-1 narrow remediation implemented and
independently re-verified — all four CLOSED.** HIGH-1/LOW-1: two mutually
exclusive 202 response shapes (`ScreenPendingObservedBody` — `provider_attempt`
+ bounded `reason_code`, ONLY when THIS request directly observed the
provider outcome; `ScreenPendingUnknownBody` — both fields structurally
absent, every same-key rehydration of a still-pending row) enforced at
compile time via two dedicated builder functions as the sole 202
construction sites; `screening_still_pending` removed everywhere, never
allowlisted. LOW-2: `resolveWalletAnalyticsProvider(coverage.provider_id)`
now runs unconditionally first (never bypassable, even under test
injection); an injected seam may replace only the callable
`screen`/`adaptorVersion`, never `providerId`; the pending-row INSERT and
terminal-application evidence read from the SAME resolved provider object.
MED-1: fixture cleanup scoped by an owned `client_id` (subquery-scoped
`DELETE`s, FK-safe order), plus a deterministic byte-for-byte
foreign-sentinel proof (`toEqual` across all five WLT tables) as the
load-bearing isolation oracle — repeated-parallel-run greenness alone was
shown to be an unreliable signal once a separate, genuinely pre-existing,
platform-wide `foundation.outbox_event` ACL race was independently
discovered contaminating it.

**Acceptance-harness stabilization implemented and independently
re-verified — test-only, zero production source changed.** All remaining
shared-database `foundation.outbox_event` ACL REVOKE/GRANT mutators (CFG-01
4, CLT-01 8, KYC-01 1, AML-01 1 — 14 total) now serialize behind the
pre-existing common `aix.test.outbox_acl` advisory lock (single namespace,
no per-module split, ordinary bystanders never required to take the lock).
Three previously-unguarded CLT-01 GRANT-restoration sites made
exception-safe via `finally`. WLT-01's own 5 outbox-ACL-failure tests
relocated onto a dedicated private disposable database
(`wlt1-outbox-acl-private.test.ts`) — moved, not duplicated, real `REVOKE`
retained, original assertions preserved — because the advisory lock alone
cannot protect an ordinary bystander request in a sibling WLT-01 file
sharing `role_wlt1_runtime` (independently observed causing a spurious
`WLT1_AUDIT_REQUIRED` in a non-mutating test). Migration-050/051/052
regression-test teardown hardened (disposable-database drop gated on actual
creation, pool `error` listeners for the expected `DROP DATABASE ... WITH
(FORCE)` administrative disconnect).

**Independent Opus final re-review → ACCEPT WLT-01 PHASE 2C-C2 WITH
NON-BLOCKING FINDINGS.** **P2CC2-HIGH-1, P2CC2-MED-1, P2CC2-LOW-1, and
P2CC2-LOW-2 are all CLOSED** — independently reproduced via adversarial
probes written separately from the implementer's own committed tests (a
truthful-replay matrix including a provider-in-flight barrier proving
exactly one provider invocation; an injected fake `providerId` proving
`chain_coverage.provider_id` remains authoritative; mutation-testing both
fixture-isolation sentinels to confirm load-bearingness). **P2CC1-MED-1 and
L3 remain CLOSED.** Two independently fresh canonical databases (migrate
001→052, all 9 grant files, canonical suite as first action) both ran 100%
green: **112/112 files, 2666/2666 tests each.** One Medium, harness-only,
non-blocking finding: **M-1** — `clt1-db.test.ts`'s own Phase-7 assertion
performs an unscoped whole-database count against `iam2.role_permission` for
`clt1.*` permissions; a concurrent `clt1-iam2-guard-real.test.ts` test (a
different file/worker) legitimately inserts exactly such a row for its own
test duration (≈33% measured incidence). Independently confirmed
structurally unrelated to WLT-01, `foundation.outbox_event`, any C2 runtime
path, or the harness-stabilization change itself (reproduced against a
database provisioned before the harness gate existed). **M-1 does not
reopen or block Phase 2C-C2 acceptance but must close before the next
acceptance gate — it is an external test-harness prerequisite for the next
gate, not a WLT-01 implementation blocker for Phase 2C-C3 planning.** One
Low, harness-only, non-blocking finding: `wlt1-outbox-acl-private.test.ts`
unnecessarily takes the canonical-database advisory lock though its own ACL
mutations occur only on its private database (harmless).

**WLT-01 Phase 2C-C3 (durable same-row/version `pending_screening` resume)
implemented on the existing route — no new `/retry` route.** Reuses the SAME
`screening_result_id`/`screening_result_version` on resume (no INSERT, no
version bump, no `destination_status_version` increment, no re-emitted
`wlt1.wallet_screening_requested` audit). Durable 30-second retry claim is an
atomic CAS against `wallet_screening_result.updated_at_utc` itself — a
deliberate decision to avoid migration 053, sound only because exactly two
production code paths ever UPDATE this table and the other
(`screening-application.ts`) only ever transitions a row AWAY from `pending`,
guarded by a committed source-scan invariant test. Throttled requests get a
truthful `provider_attempt: "throttled"` / `reason_code:
"retry_cooldown_active"` 202 and complete their idempotency key without ever
gaining provider-call ownership. Provider-identity drift and adaptor-version
drift both fail closed to `WLT1_SERVICE_UNAVAILABLE` before any provider
call. No new migration, grant, audit type, error code, or route.

**First independent Opus review → ACCEPT WLT-01 PHASE 2C-C3 WITH
NON-BLOCKING FINDINGS, but M-1 REMEDIATION BLOCKED.** Every C3 control was
independently reproduced via adversarial probes on genuinely fresh
disposable Postgres — two independently fresh canonical runs both landed on
**113/113 files, 2687/2687 tests, 100% green**. Two non-blocking Medium
findings: **M-A** — the C3 `updated_at_utc`-reuse source guard matches only
the literal string `"UPDATE wlt1.wallet_screening_result"` and can miss a
future multiline/wrapped or unqualified UPDATE (mutation-tested, confirmed,
reverted byte-exact). **M-B** — CFG-01 carries the identical
unscoped-`role_permission`-assertion pattern with a live
`cfg1-iam2-guard-real.test.ts` sibling; flagged, not fixed. Separately,
**H-1**: the prior M-1 fix had scoped only **1 of 5** structurally identical
unscoped `iam2.role_permission` zero-seed assertions in `clt1-db.test.ts` —
proven by holding one legitimate foreign fixture open and re-running the
file (**4 failed / 412 passed**). C3's acceptance stood independently of
M-1's status.

**M-1 final closure — all five sites routed through the one existing,
unchanged helper (`countUnauthorizedCltRolePermissionBindings()`), test-only,
zero production/WLT/C3/migration/grant change.** Final independent Opus
verification → **ACCEPT M-1 REMEDIATION. M-1 CLOSED. H-1 CLOSED.**
Independently reproduced the H-1 falsification scenario with BOTH namespace
variants held open — **416/416, 100% green** (previously 4 failed/412
passed) — plus an adversarial sensitivity counter-probe (inserted one
genuinely unauthorized binding outside the namespace while the legitimate
fixtures stayed open): **all five sites plus the committed A/B/C proof test
failed together**, proving the helper never became a general bypass. One
further independent fresh canonical: **113/113 files, 2687/2687 tests, 100%
green, 0 unhandled errors.**

**CURRENT WLT STATUS: ACCEPTED THROUGH PHASE 2C-D. PHASE 2C-D IS COMPLETE /
ACCEPTED (D0 + D1 + D2 + D3A + D3B + D3C).** WLT-01 is partial through
accepted Phases 0, 1A, 1B, 2A, 2B, 2C-A, 2C-B, 2C-C1, 2C-C2, 2C-C3, and now
the full Phase 2C-D arc (D0, D1, D2, D3A, D3B, D3C). Every prior control
(P1B-MED-1, P2B-MED-1, P2CA-MED-1, P2B-LOW-1, P2CA-LOW-1, L1, L2,
P2CC1-MED-1, L3, P2CC2-HIGH-1, P2CC2-MED-1, P2CC2-LOW-1, P2CC2-LOW-2)
remains closed. **M-1 and its H-1 follow-on remain CLOSED. M-A, GAP-1, and
GAP-2 (Phase 2C-D0 foundations) are CLOSED. M-D0-1 (Phase 2C-D1) is CLOSED.**

**P2CB-MED-2 IS NOW CLOSED.** Getting there took two independent-review
rounds on Phase 2C-D2, which the next session must understand in full before
touching the receipt path again: the **first Phase 2C-D2 candidate was
BLOCKED** — the Phase 2C-D1 standalone provenance-mint factory
(`mintAuthenticatedReceiptProvenance`) was genuinely removed, but its
replacement, an exported `authenticateProviderReceipt(secrets, providerId,
token)`, still accepted an arbitrary CALLER-SUPPLIED credential map as a
plain call argument. An adversarial foreign-module probe proved any
production module could fabricate its own secrets object and a matching
fake token and mint real, brand-matching `AuthenticatedReceiptProvenance`
from it — this is **H-D2-1**, and it left **M-D1-1 open**. D2's own
replay/tamper mechanics (see below) were independently reviewed as sound
throughout this whole process and were never reopened. The remediation
(**Phase 2C-D2R**) bound receipt authentication to server composition:
`createWlt1ProviderReceiptAuthenticator(config)` is now the SOLE
construction path for the authenticator, called exactly once in
`server.ts`'s `buildApp`, from the app's own validated `Wlt1Config` —
mirroring the already-accepted `createScreeningApplication(config)` /
P2CC1-MED-1 composition pattern exactly. The returned authenticator's
`.authenticate(claimedProviderId, providedToken)` takes NO secrets argument
at all; `provider-receipt.ts` receives only the already-bound instance via
dependency injection and never loads config or constructs authority itself.

A **second, narrow independent re-review** confirmed the originally
demonstrated attack (a caller-supplied secrets map) is now closed, but
adversarially proved a residual: `Wlt1Config` carries no nominal/private
branding and `loadWlt1Config` is itself an exported function accepting a
caller-supplied env object, so a malicious actor already able to inject and
compile arbitrary trusted `services/wlt1/src/**` production source could
still hand-build a structurally-valid `Wlt1Config`-shaped object and obtain
genuine branded provenance this way (proven empirically) — and, separately,
such a code-injecting actor could bypass the provenance abstraction entirely
by calling `@aix/foundation`'s already-freely-importable `query`/
`withTransaction` directly, since raw DB write access is itself an ordinary
exported API available to every WLT-01 module today.

**THE RATIFIED ACCEPTED THREAT BOUNDARY (read this before touching receipt
auth again):** the receipt-provenance control's accepted scope is to prevent
forging authenticated provider-receipt evidence THROUGH THE SUPPORTED
RUNTIME INGRESS/API PATH, and to prevent untrusted REQUEST input from
choosing the credential authority, `source_authenticated` value, or payload
hash. It does NOT, and structurally cannot, defend against an actor who can
already inject and execute arbitrary trusted WLT production source — that
broader threat is governed by repository/code-review/CI-CD/deployment/
production-access controls, not by this receipt-provenance type. Do NOT
describe this capability as "cryptographically unforgeable" or "impossible
for any production code to forge" — both are false; the source itself
carries an explicit "HONEST SCOPE" disclosure of this residual, tracked as
the non-blocking **M-D2R-1** finding (kept OPEN, not fixed, not erased).

Under that ratified boundary: **P2CB-MED-2 CLOSED (10/10 criteria pass),
H-D2-1 CLOSED, M-D1-1 CLOSED, M-D2-1 CLOSED** (corrected the misleading
"unforgeable"/"REAL credential" wording from the D1/D2 era).

**Accepted D2 baseline (superseded by the final Phase 2C-D baseline below,
preserved for chronology): 2812/2812 tests across 115/115 files**, two
independently fresh acceptance databases for the final D2 acceptance, all
100% green, 0 unhandled errors; migration head
`052_wlt1_screening_address_hash_width` (no migration 053); 6 WLT tables; 9
grant files (no grant content change); **6 routes**
(`POST /internal/wlt1/provider-results/receipt` internal-only, no public PRT
route, no IAM-02 human permission); **13 business errors** (12→13,
`WLT1_RECEIPT_CONFLICT`/409 new); **8 audit event types** (7→8,
`wlt1.provider_receipt_conflict_detected` new — **no `WLT1_RECEIPT_STALE`
yet**, deliberately deferred to Phase 2C-D3); 0 WLT IAM-02 permissions; 0 WLT
`role_permission` rows.

**PHASE 2C-D3 FINAL SEMANTICS (D3A + D3B + D3C, all accepted).** The
complete accepted asynchronous provider-receipt pipeline: authenticated
internal receipt ingress → exact raw-body SHA-256 → server-owned provenance
→ TX-A immutable `vendor_result_inbox` evidence → `(provider_id,
provider_result_id)` replay identity → exact-duplicate detection →
different-hash tamper conflict (`WLT1_RECEIPT_CONFLICT`, still strictly
FINAL — decided before any reconciliation/normalization/application/
healing) → exact-version historical-adaptor normalization (never current/
latest) → shared normalized-result validation (the SAME validator the
synchronous path uses) → permanent stale/invalid classification
(`WLT1_RECEIPT_STALE`/409, final error count 14) → terminal application
through the EXISTING, unmodified `ScreeningApplicationService` (zero
duplicated locking/validation/audit logic in the receipt route) → terminal
receipt evidence persisted (`source_authenticated=TRUE`, server-computed
`payload_hash`, `provider_result_id`, `provider_id`, frozen
`provider_adaptor_version`; synchronous application remains distinguishable
via `source_authenticated=NULL`/`payload_hash=NULL`) → `received`→
`processed` inbox lifecycle → TX-B(service)/TX-C(inbox) crash-window
recovery via an EXACT five-field terminal-evidence match (same target
`screening_result_id`, `source_authenticated=TRUE`, matching `payload_hash`/
`provider_result_id`/`provider_id` — never a terminal-status-only shortcut)
→ full deterministic race arbitration.

**Race arbitration (frozen, accepted):** two byte-identical concurrent
receipts → exactly one terminal application, one inbox row `processed`,
neither response `WLT1_RECEIPT_STALE`. Synchronous result wins → receipt
never reconciles against `source_authenticated=NULL` evidence, rejected
stale/409. Receipt wins → a later synchronous attempt cannot overwrite it
(existing `WLT1_DESTINATION_INVALID_STATE` screen-facing semantics
unchanged). C3 retry claim starts, receipt wins before the paused provider
call returns → late synchronous result cannot overwrite, one terminal audit
set, no new screening version. Receipt completes before the C3 claim → the
later `/screen` retry never claims and never calls the provider (proven by
call-count = 0). Two different `provider_result_id` values racing the same
pending screening → not a D2 conflict; exactly one winner (`processed`/200,
matching terminal evidence), the loser rejected stale/409, two inbox rows
persist, one terminal audit set.

**M-D3B-1 self-healing exception (narrow, do not generalize):** if an inbox
is `rejected` with a RACE-PRODUCED reason (`screening_not_pending` or
`screening_superseded` ONLY) and exact persisted terminal evidence proves
THIS SAME receipt already successfully applied, the inbox may correct
`rejected`→`processed`/reason→`NULL` — this is the ONE exception to
"rejected never reopens" anywhere in the codebase, reachable only after
independent evidence proof, DB-predicate-bounded a second time. It NEVER
reopens `invalid_normalized_result`, `adaptor_version_unavailable`,
`screening_not_found`, `provider_binding_mismatch`, a tamper conflict, or
any evidence-mismatched stale rejection.

**Final accepted Phase 2C-D baseline: 2872/2872 tests across 117/117 files**
(+10 tests/+1 file over the pre-H-D3C-1 2862/116 baseline — the new
`wlt1-schema-ready-fail-loud-guard.test.ts` defense-in-depth source guard;
zero product/route/error/audit/migration/grant change).
The AUTHORITATIVE acceptance signal is the cold SEQUENTIAL canonical (fresh
DB, migrations 001→052, all 9 grants, canonical SEC-01 variables, full suite
as the first action, 100% green, 0 unhandled). A **WLT-scoped** default-
parallel run is now TRUSTWORTHY acceptance evidence (see H-D3C-1 below); the
**full-repository** default-parallel canonical remains unreliable due to a
SEPARATE, pre-existing, non-WLT platform startup-reliability issue. Migration
head `052_wlt1_screening_address_hash_width` (no migration 053); 6 WLT
tables; 6 routes; **14 business errors** (13→14, `WLT1_RECEIPT_STALE` added
in D3A); **8 audit event types** (unchanged since D2 — D3A/D3B/D3C add zero
new audit types); 0 WLT IAM-02 permissions; 0 WLT `role_permission` rows; 9
grant files, no content change across the entire D3 arc.

**H-D3C-1 — CLOSED (independently accepted).** Was a pre-existing,
platform-wide test-harness fragility, NOT a WLT-01/D3C product defect: under
full-repository default-parallel startup load, WLT DB-dependent test files
could observe `schemaReady = false` and silently return before their
substantive assertions executed, with no equivalent hard
`expect(schemaReady).toBe(true)` guard to make that visible (unlike
aml1/cfg1/fnd/iam/iam2/sec1, which already had one). **Remediation**: a
fail-loud canary was added to ONE existing test per readiness flag across
the four affected shared-schema files (`wlt1-db.test.ts`,
`wlt1-provider-receipt-route.test.ts`, `wlt1-screening-application.test.ts`,
`wlt1-screening-route.test.ts` — the last carrying two independent canaries
for its two separately-scoped readiness flags), mirroring the established
convention exactly; the 5 private-disposable-DB WLT suites were
independently confirmed to already fail loudly by construction (no
swallowing `catch` in `beforeAll`) and were left unmodified; a new
defense-in-depth source guard (`wlt1-schema-ready-fail-loud-guard.test.ts`,
10 tests, mutation-tested) auto-discovers future regressions. Independently
verified: negative controls (forced setup failure, `TEST_DATABASE_URL`
genuinely set) produce explicit red failures with no secret leakage; a
GENUINE full-repository startup stampede (not synthetic) caused every
affected WLT file to fail loud rather than false-green; 5/5 independent
default-parallel WLT-only runs clean and substantive; cold sequential
canonical 117/117 files, 2872/2872 tests, 100% green. Zero production code
changed; zero D3C/M-D3B-1/M-D3B-2 regression. **The full-repository
default-parallel canonical is STILL not a reliable routine acceptance
oracle** — that is now understood to be a SEPARATE, pre-existing platform
startup/setup-reliability issue affecting several non-WLT services
(aml1-db, cfg1-db, db.test.ts, iam-db, iam2-db, sec1-db), out of WLT-01
scope, not a Phase 3 blocker.
**M-D3C-1** (non-blocking, still OPEN — not addressed by H-D3C-1): the
route-level race-produced-rejected-row self-healing path (as opposed to the
post-service-catch path, which IS committed and tested) has no committed
regression test; production behaviour was independently proven correct by
probe. Recommended: close before or during the next gate.

**PROVIDER REDELIVERY PREREQUISITE — OPEN / LOAD-BEARING OPERATIONAL
INTEGRATION PREREQUISITE.** No worker, no raw receipt-body persistence, no
normalized-staging persistence exist anywhere in the accepted architecture.
Recovery from any transient failure, audit-publication failure, or the
TX-B/TX-C crash window depends entirely on the provider redelivering the
exact receipt. Before any real provider is onboarded to this receipt path,
its integration contract MUST guarantee redelivery after non-2xx/transport
failure until terminal acknowledgement, or an equivalent guaranteed-delivery
mechanism. This is a vendor-onboarding/integration prerequisite, not a code
finding.

**Phase 2C-D2 replay/tamper model (frozen, do not redesign without cause):**
durable replay identity is the composite `(provider_id, provider_result_id)`
— no foundation Idempotency-Key, no second replay table. Immutable content
identity is the server-computed `payload_hash` (SHA-256 over the exact raw
receipt bytes, never caller-supplied). Insertion uses
`INSERT ... ON CONFLICT (provider_id, provider_result_id) DO NOTHING
RETURNING`, never `DO UPDATE` — the original inbox row is never overwritten.
Same-hash replay is an idempotent EXACT DUPLICATE, classified by the
ORIGINAL row's own `processing_status`: `received`→202/`received:true`,
`processed`→200/`received:true` (future-facing; D2 itself never creates a
`processed` row), `rejected`→202/`received:false`. Different-hash replay is
a genuine CONFLICT → `WLT1_RECEIPT_CONFLICT` (409); exactly one
`wlt1.provider_receipt_conflict_detected` security audit is committed
TRANSACTIONALLY BEFORE the 409 response is ever surfaced; an
audit-persistence failure fails closed to `WLT1_AUDIT_REQUIRED` (503) rather
than a silently-dropped conflict claim. Concurrency (identical/identical and
identical/conflicting replay races) is proven deterministic with no sleeps.

`/screen` remains OPERATIONALLY RETRY-CAPABLE exactly as under Phase 2C-C3
(unchanged by D0/D1/D2/D3A/D3B/D3C): an ordinary `pending_screening`
stranding (provider `unavailable`, `invalid_response`, or crash/
interruption) can be retried with a NEW Idempotency-Key after the fixed
30-second successful-claim window, reusing the SAME screening row/version —
but provider-identity drift, provider adaptor-version drift, and
destination/configuration/data-integrity failure remain explicit
fail-closed conditions that may require a future new-version rescreen
workflow. Now also race-arbitrated against a concurrent receipt applying
the same screening (see Phase 2C-D3 final semantics above) — a receipt that
wins terminally applies first and the `/screen` route's own existing
`WLT1_DESTINATION_INVALID_STATE` fail-closed semantics handle the loser
without any C3-specific code change.

**PHASE 2C-D IS NOW COMPLETE / ACCEPTED (D0+D1+D2+D3A+D3B+D3C). WLT-01 AS A
WHOLE REMAINS NOT COMPLETE AND NOT GO-LIVE READY** — Phases 3, 4A, 4B, 5,
and 6 all remain outstanding.

**NEXT: OPUS PHASE 3 ARCHITECTURE FREEZE** — expected domain: Proof-of-
Control / ownership-control. **Phase 3 implementation is NOT authorized**;
do NOT design or implement Phase 3 without that freeze happening first.
(H-D3C-1 is now CLOSED — see above — so this is the sole remaining gate
before Phase 3 architecture work may begin.)

Non-blocking carry-forwards into Phase 3 planning: **M-D2R-1** (the
receipt-provenance threat-boundary residual above — read it before assuming
stronger guarantees than are actually enforced), **L-D2-1**, **L-D1-1**,
**I-D1-3**, **L-D0-1**/**L-D0-2**, **M-B**, **L-B**, the adaptor-version-
drift operational limitation, a pre-existing test-harness-only TypeScript
compile gap in `wlt1-screening-application.test.ts` (`tests/**` is outside
this repo's own `tsc -b` project graph), plus the D3-era **L-D3B-1**,
**L-D3B-2**, **L-D3C-1**, **L-D3C-2**, **L-D3C-3**, **L-H1** (four WLT
test-file headers still say "self-skips unless TEST_DATABASE_URL is set" —
imprecise post-H-D3C-1), **L-H2** (one-canary-per-flag guarantees fail-loud
behaviour for normal full-file execution, not a targeted/name-filtered
invocation — matches the pre-existing convention), and **M-D3C-1** (missing
committed regression test for the route-level race-healing path — close
before or during the next gate). **M-D3B-1, M-D3B-2, and H-D3C-1 are ALL
CLOSED.**

**LED-01 REMAINS BLOCKED.** Phase 2C-D's completion does NOT unblock it —
the accepted dependency remains **WLT-01 Phase 4B (verify-and-consume)**
before LED-01 implementation may begin.

Deferred further: own-name/KYC-verified-identity binding (blocked); AML-01
Phase 3E required before WLT-01 Phase 4A; WLT Phase 4 remains split into
4A/4B; real vendor onboarding deferred until after WLT-01 Phase 6 — WLT-01
remains deterministic stub-only, no vendor URL/SDK/API key/live request/RPC.

---

**CURRENT WLT-01 STATUS — SUPERSEDES THE "NEXT: OPUS PHASE 3 ARCHITECTURE
FREEZE" BOOTSTRAP ABOVE.** M-D3C-1 has since closed and Phase 3 readiness is
now complete; a fresh session should start from THIS block, not the one
above.

**WLT-01: ACCEPTED THROUGH PHASE 2C-D.**
**BASELINE: 2874/2874 tests, 117/117 files** (+2 over the prior 2872/117
H-D3C-1 baseline; migration head, tables, routes, errors, audits, IAM-02
permissions/role_permission, and grant files all unchanged — authoritative
signal remains the cold SEQUENTIAL canonical, migration head
`052_wlt1_screening_address_hash_width`, no migration 053).
**H-D3C-1: CLOSED.**
**M-D3C-1: CLOSED** — independently accepted, test-only. Exactly one file
changed, `tests/integration/wlt1-provider-receipt-route.test.ts` (+2 tests,
no file added, zero production/migration/grant/dependency change). Added: a
positive regression proving a historical race-produced `rejected`/
`screening_not_pending` inbox row carrying THIS receipt's own matching
terminal evidence self-heals to `processed`/`NULL` via the route's own
`duplicate_exact`/`rejected` branch on a real exact-byte HTTP replay (200, no
re-normalization, no `ScreeningApplicationService` reapplication, zero new
terminal audits, screening/destination byte-identical before/after); plus a
negative control (non-matching terminal evidence never heals, 409
`WLT1_RECEIPT_STALE`). Independent review additionally ran a live
grant-revocation probe (`REVOKE UPDATE ON wlt1.vendor_result_inbox FROM
role_wlt1_runtime`) that made the positive test fail closed (503) —
confirming the accepted runs genuinely executed under the restricted
`wlt1_provider_receipt_route_test` role, never `postgres` superuser.

**M-REV-1: OPEN / MEDIUM / TEST-HARNESS PRIVILEGE-DOWNGRADE TRAP / NOT A WLT
PRODUCT DEFECT / NON-BLOCKING FOR PHASE 3A IMPLEMENTATION.** WLT test files
derive a restricted-role connection URL by string-replacing `postgres@` with
the intended test role — correct only for this repo's canonical passwordless
form `postgres://postgres@host/db`. A password-bearing form
(`postgres://postgres:password@host/db`) makes the replace land on the
password segment instead, silently reconnecting as `postgres` superuser, so
a privilege-boundary test can pass green without proving least privilege.
Reproduced only in a discarded scratch database during the M-D3C-1 review —
NOT present in any final accepted run. Does NOT reopen M-D3C-1. Does NOT
block Phase 3A implementation. **SHOULD close before Phase 3A acceptance**
(add a `current_user = RUNTIME_ROLE_USER` assertion per file's `beforeAll`).

Also carried forward from the M-D3C-1 review, all LOW/non-blocking:
**L-MD3C1-1** (the route-level negative control varies `payload_hash` and
`provider_result_id` together — single-variable negatives already exist at
the sibling `received`-row call site), **L-MD3C1-2** (the `screening_
superseded` variant of the same route-level healing branch has no dedicated
committed test — identical code path to the tested `screening_not_pending`
variant), **L-MD3C1-3** (destination immutability is asserted on `status` +
`destination_status_version` rather than the full row).

**PHASE 3 ARCHITECTURE: FROZEN.** Architecture freeze plus a narrow
correction-pass addendum are both complete; Ratifications A-E are RATIFIED.
Phase 3 = Proof-of-Control only (never ownership/beneficial-ownership/
custody); EOA-only, signed-message verification only; EVM
(`eip191_personal_sign`) ships in 3A, TRON fails closed as
`WLT1_POC_UNSUPPORTED` until 3B; migration 053 (`wlt1.proof_of_control`)
forecast, not yet created; no `proof_of_control_status` column added to the
immutable `wallet_destination` table.

**`@noble/curves@1.9.7` DEPENDENCY SECURITY GATE: PASSED / APPROVED** for
Phase 3A — exact pin (no `^`/`~`), MIT license, SLSA provenance, 0 `npm
audit` findings, depends only on the already-pinned `@noble/hashes@1.8.0`
(no forced upgrade). Non-blocking **M-DEP-1**: the standalone
`secp256k1.recoverPublicKey` is not type-reachable under this repo's strict
TS settings — the frozen typed recovery path is
`secp256k1.Signature.fromBytes(sig, "recovered").recoverPublicKey(digest32).toBytes(false)`,
with explicit `r||s||v` → `v||r||s` reordering (Noble's recovered byte order
is `recovery||r||s`) and explicit low-`s`/range checks implemented by AIX
code — never a `@ts-ignore`/type-assertion workaround, never bespoke
secp256k1 arithmetic. `@noble/hashes` remains 1.8.0, not yet installed.

**PHASE 3A: AUTHORIZED / NOT STARTED.** All four gates hold — M-D3C-1
CLOSED, architecture freeze + addendum complete, Ratifications A-E ratified,
`@noble/curves@1.9.7` approved. **PHASE 3B: NOT AUTHORIZED.**

**NEXT: WLT-01 PHASE 3A IMPLEMENTATION** (Sonnet) — starting with migration
053 (`wlt1.proof_of_control`) and the EVM-only signed-message
Proof-of-Control flow. **BEFORE PHASE 3A ACCEPTANCE: CLOSE M-REV-1** (does
not block starting implementation).

**LED-01: BLOCKED UNTIL WLT-01 PHASE 4B (VERIFY-AND-CONSUME).** Unchanged by
this update.

---

**CURRENT WLT-01 STATUS — SUPERSEDES THE "NEXT: WLT-01 PHASE 3A
IMPLEMENTATION" BOOTSTRAP ABOVE.** Phase 3A (3A-1 + 3A-2 + 3A-3) is now
independently accepted and M-REV-1 has closed; a fresh session should start
from THIS block, not the one above.

**WLT-01: ACCEPTED THROUGH PHASE 3A.**
**PHASE 3A: COMPLETE / ACCEPTED.**

**BASELINE: 3051/3051 tests, 125/125 files** (canonical full suite, cold
sequential — the trustworthy acceptance oracle; the full-repository
default-parallel canonical run remains unreliable due to a separate,
pre-existing, non-WLT platform startup-stampede issue, unrelated to
H-D3C-1/M-REV-1).
**WLT-SCOPED: 762/762 tests, 27/27 files** (WLT-scoped default-parallel is
trustworthy, confirmed across 3 consecutive runs, byte-identical).

**MIGRATION HEAD: `053_wlt1_proof_of_control`** (no migration 054).
**TABLES: 7. ROUTES: 9. ERRORS: 19. AUDITS: 11.**
**IAM-02 WLT PERMISSIONS: 0. WLT `role_permission`: 0. GRANT FILES: 9**
(content unchanged across the entire Phase 3A arc).
**`@noble/curves@1.9.7`, `@noble/hashes@1.8.0`** — unchanged, no dependency
version change.

**PHASE 3A-1 (PoC schema/crypto/message foundation): ACCEPTED.**
**PHASE 3A-2 (challenge issuance + read routes): ACCEPTED.**
**PHASE 3A-3 (EVM signature verification submission lifecycle,
`POST .../proof-of-control/verify`): ACCEPTED.**

EVM Proof-of-Control (`eip191_personal_sign`) is now live for
`ethereum/mainnet`. Challenge lifecycle: server-generated nonce, PostgreSQL
authoritative time, canonical signed message, one-active-challenge invariant,
supersession/expiry, `Idempotency-Key` on issuance, verified-proof
short-circuit, internal authenticated `POST` challenge, internal `GET`
current proof. Verification lifecycle: internal `POST` verify, persisted-
message reconstruction, `message_hash` integrity check, destination-snapshot
integrity, explicit per-state handling (no catch-all), EIP-191 verification,
explicit r/s/v + low-`s` validation, attempt accounting, max-attempt
terminal `failed` transition, verified transition, `signature_hash`/
`recovered_address` persisted only on success, failed/verified audit
atomicity, same-signature verified-replay idempotency, concurrent
verification safety. **Security/evidence boundary: PoC demonstrates
possession/signing authority over the registered address at proof time
only** — it does NOT establish legal ownership, beneficial ownership,
authorized use, custody relationship, exclusive control, continued control,
source of funds, or source of wealth. No raw signature persisted. No
private-key handling. No transaction signing/broadcast. TRON remains
unsupported (`WLT1_POC_UNSUPPORTED`) until Phase 3B.

**M-REV-1: CLOSED.** Test-harness privilege-downgrade trap from a fragile
`.replace("postgres@", ...)` restricted-role URL derivation, silently unsafe
for password-bearing `TEST_DATABASE_URL` values. Repository-wide inventory
performed; 75 active occurrences across 15 files and 8 modules (WLT-01,
CLT-01, KYC-01, AML-01, CFG-01, SEC-01, IAM-01/02, FND) all remediated with
the safe whole-userinfo replacement
(`replace(/^postgres:\/\/[^@]+@/, ...)`), verified for passwordless,
password-bearing, and encoded-password source URLs via a committed pure
regression test. Fail-loud `current_user`/`session_user`/`rolsuper`/
`rolbypassrls` identity canaries added to the three privilege-sensitive
files whose acceptance claims depend on restricted-role identity
(`wlt1-db.test.ts`, `wlt1-poc-verify-route.test.ts`,
`aml1-iam2-guard-real.test.ts`); AML-01/IAM-02 guard-test semantics
otherwise unchanged. Independently verified: a simulated failed derivation
is caught loudly (`current_user='postgres', rolsuper=true`), and the
PoC-verify route's real app pool was independently confirmed (via
`pg_stat_activity`) to run under the restricted role. Product diff: ZERO.

**L-3A3-4: CLOSED** (closed as part of the M-REV-1 remediation — the PoC
verify DB-backed test can no longer silently execute under `postgres`
superuser).

**G3 / D-CFG: NOT A PHASE 3A BLOCKER.** D-CFG's trigger (WLT introducing
CFG-01 feature evaluation) never fired this phase; Phase 3A introduces no
CFG feature evaluation; no WLT Phase-3 feature key exists; `cfg1.feature`
remaining unseeded does not block Phase 3A. Do not seed `cfg1.feature` or
start CFG-01 Phase 1 solely on account of WLT-01 Phase 3A.

Carried forward, all LOW / NON-BLOCKING:
**L-3A3-1** (raw submitted signature is not currently in
`WLT1_LOG_REDACT_PATHS` — no actual logging/persistence leak exists today;
defence-in-depth only), **L-3A3-2** (canonical PoC persisted-field mapping
exists at two equivalent code sites, both using the same canonical builder —
maintainability/drift risk only), **L-3A3-3** (the Model-A second-
verified-row fail-closed backstop exists and was independently proven
effective, but lacks a committed regression test), **L-MREV-5** (the
accepted safe regex recognises the repository-standard `postgres://` scheme
but not `postgresql://` — the latter appears nowhere in the current
repository/configuration; load-bearing privilege-sensitive WLT tests
additionally assert effective `current_user` and therefore still fail
loudly), **L-MREV-6** (identity canaries independently derive the
restricted URL rather than querying the actual app pool directly — the
current expressions are identical, and independent review verified the
actual app pool runs under the restricted role).

**PROVIDER REDELIVERY: OPEN / LOAD-BEARING OPERATIONAL INTEGRATION
PREREQUISITE.** No worker, no raw/normalized-result persistence. Separate
from Phase 3A product correctness — not conflated with M-REV-1 or H-D3C-1.

**PLATFORM STARTUP STAMPEDE: PRE-EXISTING PLATFORM TEST-INFRASTRUCTURE
ISSUE**, separate from H-D3C-1 and M-REV-1. Full-repository default-parallel
remains unsuitable as the sole canonical acceptance oracle; use the cold
sequential canonical run instead.

**PHASE 3B: AUTHORIZED / NOT STARTED.** Frozen scope: TRON `signMessageV2`/
TIP-191-style verification; migration 054 widening ONLY the
`verification_scheme` CHECK; independent TronWeb/TronLink interoperability
vectors. No whitelist logic. No Phase 4A. No Phase 4B. No LED.

**NEXT: WLT-01 PHASE 3B IMPLEMENTATION** (Sonnet) — TRON signature
verification, migration 054 (CHECK-widening only).

**PHASE 4A: BLOCKED. PHASE 4B: BLOCKED.**
**LED-01: BLOCKED UNTIL WLT-01 PHASE 4B (VERIFY-AND-CONSUME).** Unchanged by
this update — completing Phase 3A does NOT unblock LED-01.

---

**CURRENT WLT-01 STATUS — SUPERSEDES THE "NEXT: WLT-01 PHASE 3B
IMPLEMENTATION" BOOTSTRAP ABOVE.** Phase 3B (TRON `signMessageV2`-compatible
Proof-of-Control) is now independently accepted, INCLUDING real TronLink
wallet interoperability confirmation; a fresh session should start from THIS
block, not the one above.

**WLT-01: ACCEPTED THROUGH PHASE 3B.**
**PHASE 3A: COMPLETE / ACCEPTED. PHASE 3B: COMPLETE / ACCEPTED.**

**BASELINE: 3098/3098 tests, 128/128 files** (canonical full suite, cold
sequential — the trustworthy acceptance oracle).
**WLT-SCOPED: 809/809 tests, 30/30 files** (3 consecutive default-parallel
runs, byte-identical).

**MIGRATION HEAD: `054_wlt1_proof_of_control_tron_scheme`** (no migration
055). **TABLES: 7. ROUTES: 9. ERRORS: 19. AUDITS: 11.**
**IAM-02 WLT PERMISSIONS: 0. WLT `role_permission`: 0. GRANT FILES: 9**
(unchanged). **`@noble/curves@1.9.7`, `@noble/hashes@1.8.0`** — unchanged.
**No TronWeb runtime dependency** (temporary external oracle installs only,
never `package.json`/`package-lock.json`/any workspace, fully deleted).

**Migration 054** widens ONLY the `verification_scheme` CHECK
(`eip191_personal_sign` → `eip191_personal_sign, tron_personal_sign`) — no
new table/column/index/grant/IAM permission/route/audit event/error;
evidence-preserving down refuses while any `tron_personal_sign` row exists.

**Accepted PoC schemes:** `ethereum/mainnet` → `eip191_personal_sign`;
`tron/mainnet` → `tron_personal_sign` (TronLink/TronWeb `signMessageV2`-
compatible dynamic-length digest — the legacy fixed `"...\n32"` form is
deliberately never implemented). Every other chain/network fails closed.
Wallet-type applicability unchanged: `unhosted`/`unknown` supported, `hosted`
unsupported.

**TRONLINK INTEROP: CONFIRMED.** A real TronLink Chrome-extension wallet
(`TFuEiLEx1NnNYeJq9VtwZUw6CwaSFvvvTE`) signed a real AIX-issued challenge
(`wlt1poc_d246943e-0ec4-430f-b7b2-54fe2c7732c8`) via its own native Message
Signature approval UI. Registered address, TronLink-connected address, AIX
`verified_address`, and DB `recovered_address` were all FOUR-WAY IDENTICAL —
independently re-derived from the persisted snapshot alone, never merely
trusting the HTTP 200. `attempt_count` unchanged (0→0); exactly one
`wlt1.proof_of_control_verified` audit, zero failed audits; raw signature NOT
persisted anywhere (only `signature_hash`); zero repository changes from the
entire manual interoperability exercise.

**M-REV-1: CLOSED. M-3B-1: CLOSED** (the initial manual TronLink procedure
draft incorrectly implied any account could sign the static committed vector
message — the verifier correctly rejects this by design; corrected procedure
required no product-code change).

**Security boundary (reaffirmed):** PoC demonstrates possession/signing
authority over the registered address at verification time only — it does
NOT establish legal ownership, beneficial ownership, authorized corporate
use, custody relationship, exclusive control, continued control, source of
funds, or source of wealth. AIX never receives or retains a private key,
mnemonic, wallet password, or raw signature. No transaction signing. No
transaction broadcasting. No blockchain RPC is required for normal PoC
verification.

Carried forward, all LOW / NON-BLOCKING: **L-3A3-1, L-3A3-2, L-3A3-3,
L-MREV-5, L-MREV-6** (Phase 3A/M-REV-1 era, unchanged) plus **L-3B-1** (the
committed static TronWeb vector is ASCII-only, so does not itself
discriminate UTF-8 byte length from JS character length — correctness
independently proven via a separate genuinely multi-byte external TronWeb
test) and **L-3B-2** (the committed TRON digest constant's provenance
comment was initially self-referential — independently recomputed
externally and confirmed exact).

**PROVIDER REDELIVERY: OPEN / LOAD-BEARING EXTERNAL INTEGRATION
PREREQUISITE**, kept separate from PoC product correctness.

**PLATFORM STARTUP STAMPEDE: PRE-EXISTING PLATFORM TEST-INFRASTRUCTURE
ISSUE**, separate from H-D3C-1/M-REV-1. Full-repository default-parallel
remains unsuitable as the sole canonical acceptance oracle; use the cold
sequential canonical run instead.

**PHASE 4A: AUTHORIZED / NOT STARTED.** Frozen scope: evaluate-use +
decision token + read-only verify ONLY — explicitly NOT verify-and-consume,
compensation/release, ledger posting, settlement, or LED-01.
**IMPLEMENTATION START IS SUBJECT TO CONFIRMING THE AML-01 PHASE 3E
(synchronous stub-backed pre-transaction gate) PREREQUISITE IS SATISFIED** —
not yet confirmed as of this entry; this document does not assert AML-01
Phase 3E is complete.

**NEXT: CONFIRM THE AML-01 PHASE 3E PREREQUISITE.**
**THEN: WLT-01 PHASE 4A IMPLEMENTATION** (Sonnet) — evaluate-use, decision
token, read-only verify.

**PHASE 4B: BLOCKED.**
**LED-01: BLOCKED UNTIL WLT-01 PHASE 4B (VERIFY-AND-CONSUME).** Completing
Phase 3B does NOT unblock LED-01.

---

**CURRENT STATE — SUPERSEDES THE "NEXT: CONFIRM THE AML-01 PHASE 3E
PREREQUISITE" BOOTSTRAP ABOVE.** AML-01 Phase 3E (the synchronous
pre-transaction AML gate WLT-01 Phase 4A depends on) is now independently
accepted; a fresh session should start from THIS block, not the one above.

**AML-01: ACCEPTED THROUGH PHASE 3E.**
**AML PHASE 3E: COMPLETE / ACCEPTED.**

**ROUTE: `POST /internal/aml1/pre-transaction/screen`** — machine-to-machine
only (`makeAml1InternalIdentityGuard`), no IAM-02 permission. Evidence-based
(never a live provider call); `authorised_party` subjects only
(`client_application` rejected at schema level); client/subject binding
proven via `subject_parent_ref = client_id` inside the same query predicate
that selects each subject's newest lifecycle row (`created_at_utc DESC,
screening_request_id DESC`) — NULL/foreign-client/unknown subjects are
structurally indistinguishable, collapsing to
`review/subject_client_binding_unprovable` (no cross-client enumeration
oracle). Decision vocabulary `allow`/`review`/`deny` (only `allow`
affirmative), exactly 11 frozen reason codes, strictest-wins precedence
(`deny > review > allow`). `confirmed_hit` is never rescued by staleness or
absent provider provenance. Provenance (`evidence_provider_ids`, distinct +
sorted) sourced only from `screening_provider_attempt` rows with
`status='succeeded'`; otherwise-affirmative evidence with ZERO successful
provenance cannot support allow — falls to `review/unsupported_evidence_state`
(the C-3E-1 remediation, below). PostgreSQL `now()` read once inside the one
ordinary read-write transaction, driving `evaluated_at_utc`/
`valid_until_utc`/freshness — never Node wall-clock. One new audit event,
`aml1.pre_transaction_evaluated`, one per allow/review/deny, atomic with the
decision (forced audit failure → 503 `AML1_AUDIT_REQUIRED`, no decision
field, full rollback).

**PLATFORM BASELINE: 3185/3185 tests, 130/130 files** (fresh DB, cold
sequential, `--no-file-parallelism`, canonical SEC-01 ingest tokens).
**AML-01 SCOPED: 480/480 tests, 18 files.**
**PHASE 3E FOCUSED: 75/75 (38 unit + 37 integration).**

**AML ROUTES: 22. AML ERROR CODES: 26** (zero added by Phase 3E — corrects a
pre-existing documentation drift that had recorded 25). **AML IAM-02
PERMISSIONS: 11** (unchanged). **AML AUDIT EVENT TYPES: 10** (9→10, the new
`aml1.pre_transaction_evaluated`). **AML MIGRATION STATE: 041** (unchanged;
no migration 055). **PLATFORM MIGRATION HEAD:
`054_wlt1_proof_of_control_tron_scheme`.** Grants and dependencies
unchanged.

**M-3E-1: CLOSED. C-3E-1: CLOSED. H-3E-1: CLOSED. L-3E-1: CLOSED. L-3E-2:
CLOSED.**

**C-3E-1 (Critical, closed):** the initial implementation candidate let
otherwise-affirmative `clear`/`matches_dismissed` evidence return `allow`
even with zero successful provider attempts — a fail-open. **H-3E-1 (High,
closed):** the provenance integration test asserted only an empty array, not
`decision`/`reason_code`, and could not have caught it. A surgical 3-file
Sonnet remediation gated both affirmative branches on
`providerIds.length > 0` (else `review/unsupported_evidence_state`) without
touching the `confirmed_hit` branch, which returns earlier in the evaluator;
independently re-verified, including a deliberate revert-then-restore
proving the strengthened tests genuinely fail without the fix.

**M-3E-2: OPEN / NON-BLOCKING.** `no_current_evidence` remains a defensive
reason code, effectively production-unreachable under the current atomic
screening-write path (result persistence is atomic with the `completed`
lifecycle transition). Carried forward as a documentation acknowledgement
only — no production trigger to be manufactured, no migration, no
persistence change.

**WLT-01: ACCEPTED THROUGH PHASE 3B** (unchanged by this update).

**THE AML-01 PHASE 3E PREREQUISITE IS NOW SATISFIED.**
**WLT-01 PHASE 4A IMPLEMENTATION START: CLEARED.**

**NEXT: WLT-01 PHASE 4A IMPLEMENTATION** (Sonnet) — evaluate-use, decision
token, read-only verify only. Only HTTP 200 + AML decision `allow` may
support positive WLT authorization/token issuance; `review`/`deny`/non-2xx/
timeout/network error/malformed response must all fail closed. WLT must not
interpret raw AML screening evidence — only the Phase 3E decision contract.

**PHASE 4B: BLOCKED.**
**LED-01: BLOCKED UNTIL WLT-01 PHASE 4B (VERIFY-AND-CONSUME).** Completion of
AML-01 Phase 3E does NOT unblock LED-01 directly.

---

**DOCUMENTATION GAP, EXPLICITLY MARKED.** Multiple further WLT-01 phases were
completed in sessions this file was never updated for, before the entry
below: Phase 3A/3B Proof-of-Control, Phase 4A, Phase 4B verify-and-consume,
destination revocation + AML revocation signals, ongoing rescreening, Fiat
Payout Destinations (APAC), Sensitive Read Logging, Evidence Export,
Inbound-Source Screening, provider-receipt/stuck-screening recovery — plus
whatever intervening SEC-01/CFG-01/AML-01/KYC-01/IAM-02 work also happened.
Not reconstructed here — no first-hand session record survived into the
context that wrote this entry. Full detail for the checkpoint below (and the
DOCUMENTATION GAP entry it matches) is in `PROJECT_HANDOVER.md`'s
"Implementation phase" section.

**VERIFIED CURRENT CHECKPOINT (live database + source inspection):**
**PLATFORM MIGRATION HEAD: `067_clt1_authorised_user_iam_binding`** (67
migrations total, all 9 grant files applied clean on a fresh disposable
Postgres). **WLT-01: 27 routes, 35 errors, 18 tables, 27 audit types** —
Limits/Velocity/Concentration/First-Use and its L-1 monetary-wire-contract
hardening are both **COMPLETE / ACCEPTED**. **CLT-01: 71 routes, 44 errors,
18 tables, 83 audit types** — gained an Authenticated Principal → Client
Membership Authority extension (migration 067): architecture **ACCEPTED**,
implementation **CANDIDATE READY FOR INDEPENDENT REVIEW, NOT yet accepted**.
**FULL PLATFORM CANONICAL (fresh DB, `--no-file-parallelism`): 178 files /
4660 tests, 4659 passing** — the one known failure is
`tests/integration/wlt1-db.test.ts` hardcoding migration head as
`"066_wlt1_limits"`, stale because CLT-01's migration 067 legitimately
advanced the platform head; tracked, non-blocking, one-line WLT-01 test fix
still outstanding.

**A WLT-01 Client-Facing Public `/wlt1/*` Surface architecture attempt is
OPEN / IMPLEMENTATION BLOCKED** (no code written) on three prerequisites:
(1) an authenticated-user → CLT client_id membership authority — now
architecturally resolved and implemented as the CLT-01 extension above, but
NOT yet independently accepted; (2) real API rate limiting — the only
existing surface, `POST /foundation/rate-limit/check`, is an allow-by-default
stub; (3) a public perimeter (CORS / security headers / CSRF /
`Cache-Control`) — none exists anywhere in the platform yet. The WLT public
surface may not reopen until all three are independently accepted.

**NEXT: independent Opus acceptance review of the Authenticated Principal →
Client Membership Authority candidate (CLT-01, migration 067).** Only after
that closes does prerequisite (1) above actually clear.

---

**AUTHENTICATED PRINCIPAL → CLIENT MEMBERSHIP AUTHORITY (CLT-01): COMPLETE /
ACCEPTED.** Independent Opus final review first returned REVISE BEFORE
ACCEPTANCE on exactly one HIGH finding: the candidate's own fresh-canonical
run reported 4659/4660 passing, and the one failure was
`tests/integration/wlt1-db.test.ts` pinning the platform-wide GLOBAL
migration head to `066_wlt1_limits`, broken by this candidate's own
migration 067 legitimately advancing the head. **Remediated** (commit
`033534034720739f36954fbca0d05d8dcfbf9f8a`, short `0335340`) — one file, test
only: removed the two-line global-head assertion, kept the existing loop
that independently verifies each of WLT-01's own migrations 055-066 exists
exactly once. No production, migration, CLT, IAM, or WLT source code
changed. **Independent Opus re-review** reproduced the fix from its own
fresh disposable database and additionally simulated a hypothetical future
migration 068 on a probe database, empirically confirming the remediated WLT
test survives it (proving genuine decoupling, not a re-pin). **Final
independent canonical verification: 178 files / 4660 tests / 4660 passing /
0 failures; `tsc -b --force` 0 errors; 67 migrations, head
`067_clt1_authorised_user_iam_binding`, all 9 grant files clean.**

**Prerequisite (1) of the WLT-01 Public `/wlt1/*` Surface addendum is now
CLEARED.** Prerequisites (2) API rate limiting and (3) public perimeter
remain not started — the addendum may not reopen until both are also
independently accepted.

**Findings carried forward, none blocking:**
- **LOW** — bound `iam_user_id` is not directly named in
  `authorised_user_added` audit metadata (evidence remains durable via two
  independent immutable joins on `entity_id` and `decision_id`).
- **INFORMATIONAL** — the future consumer of
  `GET /internal/clt1/principals/:iam_user_id/client-memberships` must
  source `iam_user_id` from its own authenticated session and enforce
  `userClass ∈ {client, client_approver}` — CLT cannot see `userClass` and
  makes no IAM call.
- **INFORMATIONAL** — migration 067's unique index is a non-`CONCURRENTLY`
  build (deployment-planning note only).
- **LOW, newly identified during re-review, NOT fixed this turn** —
  `tests/integration/clt1-db.test.ts` (~line 3015) pins the SAME global
  migration head to `067` — the identical anti-pattern just removed from
  WLT. Empirically proven (same probe-DB technique) to break the moment
  migration 068 lands; currently green only because 067 genuinely is the
  head today. **TRACKED AS CLT-SCOPED TECHNICAL DEBT — MUST BE FIXED BEFORE
  MIGRATION 068**, in its own narrowly-scoped turn.

**NEXT: fix the `clt1-db.test.ts` global-head-pin ahead of migration 068;
separately, resume the WLT-01 Public Surface prerequisites (API rate
limiting, then public perimeter) whenever that addendum is reprioritised.**

---

## Document Control Reorganisation (Turn C1): governance layer established

`INDEX.md` has been renamed/merged (via `git mv`, history preserved) into
**`../DOCUMENT_REGISTER.md`**, now the sole authority for document version,
status, and supersession. Two new registers exist at the same level:
**`../OPEN_FINDINGS.md`** (current unresolved findings — the three findings
above are now tracked there as `CLT-FIND-001/002/003/004`) and
**`../DECISION_LOG.md`** (governance decisions). Every module now also has
`../02_modules/<MODULE>/README.md` for quick navigation. The copy-paste
prompt at the top of this file has been updated to point a new session at
all four current-state files; do not read this historical section into a
fresh session — it is retained for continuity only.
