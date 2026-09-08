# KYC-01 KYC / KYB Verification — Implementation Notes

Module: **KYC-01 KYC / KYB Verification**
Blueprint: `aix-platform-docs/modules/KYC-01_KYC_KYB_Verification_Blueprint_Pack_v1.1/`
Implementation status: **KYC-01 — accepted implementation baseline through Phase 3B.** Phase 0
(scaffold) and Phase 1 (core CDD baseline) were each independently Opus-reviewed and accepted;
the review's sole Medium finding (MED-1) was closed by a scoped micro-patch, independently
Opus-reviewed a second time — **MED-1 CLOSED**. Phase 2A (authoritative outcome + publication
model, no CLT-01 delivery) was deliberately split from Phase 2B so aggregation/publication
semantics could be independently reviewed before any CLT-01 delivery call exists — independently
Opus-reviewed → **ACCEPT WITH LOW FINDINGS**. Phase 2B (CLT-01 outcome delivery + LOW-5/6/7
pre-delivery closures) closed all three Phase 2A Low findings before any delivery code was
written, added a KYC-owned CLT-01 client and one delivery route — independently Opus-reviewed →
**ACCEPT WITH LOW FINDINGS, conditional on closing one Medium (MED-2) first**; MED-2 was
micro-patched and independently re-reviewed a second time — **MED-2 CLOSED**. Phase 3A (KYC-01's
first IAM-02 integration + a permission-gated sensitive evidence-read route) added a KYC-owned
IAM-02 client, registered one IAM-02 permission, narrowed the checklist projection, and added one
new route — independently Opus-reviewed → **ACCEPT WITH LOW FINDINGS** (1 Low, 5 Informational);
the review also live-verified migration 044's down path, closing a residual the implementer had
only code-inspected. Phase 3B (maker-checker manual outcome override) added a second IAM-02
permission, execute-verify support, an append-only override request/apply workflow, self-override
SoD, and a recompute-lock — independently Opus-reviewed → **ACCEPT WITH LOW FINDINGS, conditional
on closing one Medium (MED-3) first**; MED-3 (an override approval not bound to the case outcome
it was granted against) was micro-patched and independently re-reviewed a second time, including a
verbatim replay of the original exploit against the patched code — **MED-3 CLOSED**. Phase 3C is
explicitly skipped; the next step is KYC-01 Phase 4 planning. `MODULE_STATUS.md`,
`PROJECT_HANDOVER.md`, and `SESSION_START_PROMPT.md` (sibling `aix-platform-docs` workspace) have
been updated accordingly.

Selected as the next runtime module after AML-01 paused as an accepted baseline through Phase
3D (real-vendor onboarding blocked on procurement/DPA, no further AML-01 hardening phase
planned). KYC-01 was the close alternative named at that decision point; CLT-01 already exposes
a receipt-only CDD-outcome/handoff-status seam this module makes load-bearing.

---

## 1. Scope implemented (Phase 0 + Phase 1)

### Phase 0 — scaffold
New service `services/kyc1` (`@aix/service-kyc1`), structurally identical to every prior
module's own Phase 0 (CFG-01/CLT-01 precedent): own request-context plugin, own interim
internal-identity guard (`KYC1_INTERNAL_SERVICE_TOKEN`, constant-time compare, fail-closed), own
config loader, boot-time `assertNoExchangeRuntime`, F3(c) import-boundary test proving
`services/kyc1/src/**` never imports another service's `src/**` and only ever imports
`@aix/foundation` via its bare public specifier. One route: `GET /internal/kyc1/health`. No
schema, no migration, no grants, no business logic, no CLT-01/IAM-02/AML-01 integration this
phase.

### Phase 1 — core CDD baseline
Migration `042_kyc1_core.cjs`: `kyc1` schema + `role_kyc1_runtime` + 4 tables:

- `kyc1.kyc_case` — one case per (application/party) anchor; partial unique index
  `idx_kyc1_kyc_case_one_active_per_anchor` (`COALESCE(party_id, '')`) enforces at most one
  active case per anchor at the DB level.
- `kyc1.document_checklist_item` — deterministic default checklist seeded at case creation
  (Phase 1 placeholder baseline per case type — the blueprint's own final document-checklist
  taxonomy by client type/jurisdiction is an explicit open item, not decided this phase).
  Evidence stored as an OPAQUE reference + hash only — never raw content, never a `data:` URI,
  never base64-shaped inline bytes (`validateEvidenceRef`, boundary-enforced).
- `kyc1.verification_result` — append-only manual/registry verification findings.
  `source_type` is `manual`/`registry` only (`vendor` reserved, unimplemented this phase);
  `result_type` is `document`/`identity`/`entity`; `result_status` is `pass`/`fail`.
  `payload_hash` is server-computed tamper-evidence, never caller-supplied.
- `kyc1.cdd_outcome` — APPEND-VERSIONED (never updated in place, mirrors AML-01's
  `screening_result` immutability posture). `outcome_status` resolves to exactly one of
  `pass`/`fail`/`remediation_required` — `pending` is schema-present but structurally
  unreachable this phase (the engine is fully synchronous and always resolves).

`kyc1_runtime_grants.sql`: least-privilege, column-scoped; `verification_result`/`cdd_outcome`
are `SELECT+INSERT` only (append-only, no `UPDATE`/`DELETE`/`TRUNCATE` anywhere); no `iam2`/
`sec1`/`cfg1`/`clt1`/`aml1` cross-schema grant.

**Routes (10 total):**
```
GET  /internal/kyc1/health
GET  /internal/kyc1/readiness
POST /internal/kyc1/handoffs
GET  /internal/kyc1/cases/:case_id
GET  /internal/kyc1/cases
POST /internal/kyc1/cases/:case_id/evidence
GET  /internal/kyc1/cases/:case_id/checklist
POST /internal/kyc1/cases/:case_id/verification-results
POST /internal/kyc1/cases/:case_id/compute-outcome
GET  /internal/kyc1/cases/:case_id/outcome
```
No public `/kyc1/*` routes. No IAM-02 permission registered this phase (0 `kyc1.*` catalogue
rows, zero `role_permission` seed) — every route this phase is internal-identity-gated only,
mirroring CLT-01's own Phase 0/1 posture before its first real IAM-02 integration landed in
Phase 2.

**CDD outcome engine** (`lib/outcome-engine.ts`) — a pure function, no DB/HTTP, mirroring
AML-01's own `lib/screening.ts` posture: given the case's current checklist + verification-result
state, `computeCddOutcome` derives exactly one of `pass`/`fail`/`remediation_required`. No human
override, no maker-checker, no AML/vendor/biometric input of any kind this phase. `compute-outcome`
is fully deterministic and resolves in the same call — never a persisted `pending` row. A case
whose latest outcome is already `pass` is terminal this phase (recompute throws
`KYC1_CASE_INVALID_STATE`); `fail`/`remediation_required` may be recomputed freely as new evidence
arrives.

**Error codes (9):** `KYC1_SERVICE_UNAVAILABLE`, `KYC1_CASE_NOT_FOUND`,
`KYC1_CASE_ALREADY_EXISTS`, `KYC1_CASE_INVALID_STATE`, `KYC1_CHECKLIST_ITEM_NOT_FOUND`,
`KYC1_EVIDENCE_INVALID`, `KYC1_VERIFICATION_RESULT_INVALID`, `KYC1_OUTCOME_NOT_FOUND`,
`KYC1_AUDIT_REQUIRED`.

**Audit events (10, transaction-coupled via FND's `publishAudit`/outbox on every mutation):**
`kyc1.handoff_received`, `kyc1.case_created`, `kyc1.document_reference_added`,
`kyc1.document_verified`, `kyc1.document_rejected`, `kyc1.identity_verified`,
`kyc1.identity_failed`, `kyc1.entity_verified`, `kyc1.entity_failed`, `kyc1.outcome_computed`.

**Explicitly out of scope this phase:** no UBO/EDD/proofing/vendor/periodic-review tables, no
real document storage provider, no vendor source type, no raw document content or base64 storage
anywhere, no CLT-01 outcome-delivery call, no IAM-02 integration, no maker-checker, no Phase
2/3 code, no wallet/deposit/withdrawal/trading/settlement/Exchange runtime.

## 2. Independent Opus review of Phase 0 + Phase 1

**Verdict: ACCEPT WITH FINDINGS.** Zero Critical/High findings. One Medium (MED-1, below) plus
Low/Informational findings, all non-blocking except MED-1.

**MED-1 (the one finding requiring a fix before acceptance could stand unconditionally):**
`computeCddOutcome` was non-deterministic under concurrent verification-result submission, and a
wrong `pass` could become sticky.
- `latestResultOfType` sorted only by `receivedAtUtc`; the comparator never returned `0`.
- SQL retrieval order in `lib/kyc-case.ts` also lacked a deterministic tie-break.
- Concurrent `verification_result` rows can share `received_at_utc` (Postgres `now()` resolution
  is coarser than back-to-back inserts in the same transaction/millisecond).
- Because `pass` is terminal this phase, a nondeterministically-wrong `pass` was not correctable
  through the API.

## 3. MED-1 micro-patch (closes the sole Medium finding)

Scope was explicitly bounded: fix MED-1 only — no Phase 2, no CLT-01 delivery, no IAM-02, no
maker-checker, no new route unless required for the fix, no new migration, no grant change, no
business-rule change, no status-doc update as part of the patch itself (this documentation sync
is a separate, later step).

**Files changed:**
- `services/kyc1/src/lib/outcome-engine.ts` — `OutcomeVerificationResultInput` gained
  `verificationResultId`; `latestResultOfType` now sorts with a new `compareByRecencyThenId`
  comparator.
- `services/kyc1/src/lib/kyc-case.ts` — `fetchVerificationResults`'s SQL `ORDER BY` changed to
  `received_at_utc DESC, verification_result_id DESC`.
- `services/kyc1/src/routes/outcome.ts` — passes `verificationResultId` through to the engine
  input (one field added to an existing row-mapping call).
- `tests/unit/kyc1-outcome-engine.test.ts` — every fixture updated; new tie-break test block.
- `tests/integration/kyc1-db.test.ts` — new DB-level tie-break test block.

**Deterministic tie-break chosen:** `receivedAtUtc` DESC, then `verificationResultId` DESC.
`verification_result_id` (`varchar(64) NOT NULL UNIQUE`, its own unique index — migration 042)
doesn't need to be chronologically meaningful, only stable and unique per row, so the same input
set always sorts to the same winner regardless of array/retrieval order.

```ts
function compareByRecencyThenId(a, b): number {
  if (a.receivedAtUtc > b.receivedAtUtc) return -1;
  if (a.receivedAtUtc < b.receivedAtUtc) return 1;
  if (a.verificationResultId > b.verificationResultId) return -1;
  if (a.verificationResultId < b.verificationResultId) return 1;
  return 0;
}
```

**A second, deeper bug was self-caught (by Sonnet) during this same patch, before any report was
made:** the first fix attempt detected a tie with `!==`. `node-postgres` returns `timestamptz`
columns as `Date` objects at runtime, not the `string` the row interfaces declare; two distinct
`Date` instances at the identical instant are always `!==` by reference even though `<`/`>`
correctly coerce both to their numeric value. The `!==`-based comparator therefore silently never
reached its own tie-break branch against real DB-returned values, falling through to a fixed
`-1` and reproducing exactly the non-determinism the fix existed to remove. Caught by the new
DB-integration tests (4 of 5 failed on first run with wrong `outcome_status` values) — invisible
to the pure-string unit tests, which can't exercise this. Fixed by using only `<`/`>` throughout
the comparator; a dedicated regression test using real `new Date(...)` instances (not strings)
now pins this bug class permanently.

**Tests added:** 6 new pure-unit tests (order-independence across full permutations of a 3-way
tie; swapped-ID-swaps-winner; recency-beats-tie-break; true-duplicate-row tie; the Date-object
regression test) + 5 new DB-integration tests (tied-timestamp higher-ID-wins; swapped-ID-swaps-
winner; repeated-recompute stability; correctly-resolved `pass` is durably sticky; raw SQL
retrieval order).

**Validation:** `npx tsc -b --force` clean; **KYC-01: 135/135**; **full suite: 1755/1755**;
fresh-DB migrations 001→042 clean; all 8 grant files clean; no migration 043 added; no route
added; no grant changed; no AML-01/CLT-01 source touched; no status docs updated as part of the
patch itself.

## 4. Independent Opus review of the MED-1 patch

**Verdict: MED-1 CLOSED.** Re-derived from source and re-proven empirically rather than trusting
the patch report — read the three changed source files directly, rebuilt a genuinely fresh
scratch Postgres, re-ran migrations 001→042 and all 8 grant files, re-ran the full suite
(**1755/1755**, 90/90 files) and `tsc -b --force` (clean), and wrote a standalone probe script
that generated 2,000 random tied/untied verification-result sets (2-5 rows each) and evaluated
**every permutation** of array order for each — **0 order-dependence violations**, versus
input-order-dependent-by-construction before the fix. The live-`pg`-`Date`-object hazard was
independently reproduced directly against the scratch DB (`typeof = object`, `ctor = Date`,
`a !== b` true, `a < b`/`a > b` both false at the identical instant) and confirmed the comparator
resolves it correctly in both directions.

**Scoping caveat recorded, not a defect:** the original finding was "non-deterministic **and** a
wrong pass is sticky." The patch closes the first half completely. The second half is closed only
in the weaker sense that the sticky value is no longer *arbitrary* — it is now *reproducible*. A
genuine same-instant conflicting `pass`/`fail` pair still resolves by `verificationResultId` DESC,
and that ID is a random UUID (`"kyc1vr_" + randomUUID()`), not monotonic — so the winner is
deterministic but semantically arbitrary, and because `pass` remains terminal there is still no
API path to correct it. Excluding both remedies (non-terminal `pass`, manual override) was an
explicit instruction for this patch, so this is correctly deferred, not missed — tracked as
INFO-6 below, a Phase 2 gate.

Two new Low findings surfaced by the patch review (both non-blocking, both correctly deferrable):
**LOW-3** — mixed `Date`/`string` `receivedAtUtc` inputs silently collapse recency comparison to a
tie (unreachable today: the sole production caller always supplies `pg`-returned `Date` values;
the `string`-typed interface declaration is the latent trap for a future caller). **LOW-4** — the
DB-level "SQL retrieval order" test asserts against its own literal query via `verifyPool`, not
against the production `fetchVerificationResults` query, so it would not catch a regression to
that query's own `ORDER BY` (defence-in-depth only — the engine re-sorts internally regardless).

## 5. Findings register

**Low (all non-blocking, carried forward):**
- **LOW-1** — `validateEvidenceRef`'s base64-heuristic is imprecise: a MIME-style base64 string
  with embedded newlines may false-negative past it; a long, legitimate slash-delimited external
  reference key may false-positive and be rejected. Bounded impact — the `data:` URI check and
  the 256-char hard length cap both still apply independently.
- **LOW-2** — a concurrent `POST .../evidence` for a not-yet-existing `document_type` can surface
  as `KYC1_AUDIT_REQUIRED`/503 instead of a client-facing 409 conflict. Fails closed; no data
  corruption.
- **LOW-3** — mixed `Date`/`string` `receivedAtUtc` inputs collapse recency to a tie (see §4).
- **LOW-4** — the SQL-retrieval-order DB test doesn't exercise the production query directly (see
  §4).

**Informational:**
- **INFO-1** — `timestamptz` columns are typed `string` in row interfaces at runtime, `pg` returns
  `Date`. Now a demonstrated correctness hazard (LOW-3's root cause), not merely cosmetic. Must be
  considered before Phase 2.
- **INFO-2** — a new handoff is permitted for an anchor whose prior case already reached
  `pass`/`fail`; the application may accumulate multiple completed cases. Phase 2 must define
  which outcome is authoritative before any CLT-01 delivery.
- **INFO-3** — the AML-01 micro-patch precedent this session followed depends on every AML-01
  migration filename containing `aml1` — verified true today, carried forward as a naming-
  convention dependency.
- **INFO-4** — `document_type` is an unconstrained `varchar`, accepted as a Phase 1 placeholder
  because the blueprint's own final document-checklist taxonomy is an open item.
- **INFO-5** — `evidence_refs.verification_result_ids` persisted order flipped to newest-first as
  a direct consequence of the MED-1 fetch-order change. No impact (hashes are never compared
  across outcome versions); noted so a future reader doesn't mistake newest-first for a defect.
- **INFO-6** — the tie-break key (`verificationResultId`) is stable but non-monotonic/random; a
  genuine same-instant conflicting `pass`/`fail` tie now resolves deterministically but by random
  UUID order, and the terminal-`pass` correction path remains unresolved (see §4's scoping
  caveat). Must be addressed before Phase 2 CLT-01 outcome delivery.

## 6. Phase 2 gates

Before KYC-01 Phase 2 (CLT-01 outcome delivery) coding starts, the following must be explicitly
decided — not discovered mid-implementation:

1. Authoritative-outcome / supersession rule (INFO-2) — which outcome governs when an anchor has
   multiple completed cases.
2. A correction path for a terminal `pass` (INFO-6) — manual override and non-terminal `pass` are
   both currently out of scope by explicit instruction; Phase 2 needs an explicit decision, not a
   silent continuation of "no path exists."
3. The `timestamptz` `Date`-vs-`string` row-interface typing mismatch (INFO-1) — ideally resolved
   repo-wide, not just documented per-instance.
4. Whether the MED-1 scoping caveat (random-but-deterministic tie-break winner) requires a
   dedicated Phase 1B/2A hardening slice before Phase 2, or can proceed alongside Phase 2 CLT-01
   delivery mechanics with the gate above as sufficient mitigation.
5. CLT-01 handoff/outcome delivery mechanics themselves (route shape, payload, idempotency,
   failure handling) — undecided, no code exists yet.

## 7. Test / build summary

| Check | Result |
|---|---|
| `npx tsc -b --force` | clean |
| KYC-01 tests | 135/135 |
| Full suite | 1755/1755 (90 files) |
| Migrations | 001→042 clean on a fresh disposable Postgres |
| Grant files | all 8 clean (fnd/iam/iam2/sec1/cfg1/clt1/aml1/kyc1) |
| Migration 043 | does not exist |
| Route count | 10 |
| Table count | 4 |
| IAM-02 `kyc1.*` permissions | 0 |
| `role_permission` seed | none |

---

## 8. Scope implemented (Phase 2A — authoritative outcome + publication model)

Deliberately split from Phase 2B (CLT-01 delivery) so the aggregation/publication semantics could
be independently reviewed before any CLT-01 HTTP call exists — the highest-risk decision in this
phase (a wrong aggregation rule has no observable failure mode of its own; it just silently
unblocks a client approval once delivery exists).

**Timestamp normalization (D5).** `node-postgres` returns `timestamptz` columns as `Date` objects
at runtime, not the `string` every row interface declares (MED-1's own root cause — see
`outcome-engine.ts`'s "CORRECTNESS NOTE"). `lib/kyc-case.ts` gained `normalizeTimestamp` plus a
`normalize*Row` function per row type, applied at every fetcher (`fetchVerificationResults`,
`fetchChecklistItems`, the new `fetchCasesForApplication`) and at every inline route query across
`cases.ts`/`handoffs.ts`/`evidence.ts`/`verification-results.ts`/`outcome.ts`. Internal types were
NOT widened to `Date | string` — row interfaces stay honestly typed as `string`; only the
normalization function itself accepts both. KYC-01-scoped only; no repo-wide `timestamptz`
hardening was attempted.

**Authoritative-outcome aggregation.** `lib/authoritative-outcome.ts`'s `computeAuthoritativeOutcome`
— a pure function, no DB/HTTP — computes ONE application-level aggregate from KYC-01's own current
case set for an application:
- **Within a case**: `kyc_case.current_outcome_status`/`current_outcome_id` remain authoritative;
  nothing here recomputes them.
- **Within an anchor** (`(application_id, case_type, COALESCE(party_id,''))`): the latest case that
  has a COMPUTED outcome wins (`current_outcome_status IS NOT NULL`, not
  `kyc_case.status = 'completed'` — a `remediation_required` outcome leaves `status='remediation'`,
  so gating on `'completed'` would wrongly treat every remediation case as having no outcome at
  all). Tie-break: `createdAtUtc` DESC, `caseId` DESC, relational operators only (the MED-1
  discipline applied to a second ordering).
- **Across anchors**: worst-wins. `fail` beats `remediation_required` beats `pass`. A missing or
  uncomputed PRIMARY (`individual`/`entity`) anchor makes the whole aggregate `pending` (not
  publishable — the primary CDD result is load-bearing). An uncomputed PARTY
  (`authorised_party`) anchor folds in as `remediation_required` rather than blocking the whole
  aggregate. `pass` requires every primary AND every party anchor to have independently passed —
  proven directly (including via the real HTTP route, not just the pure function) that a later
  party `pass` can never override an already-fixed primary `fail`.

**Evidence-conflict refusal (D4 — the INFO-6 remedy).** `detectTiedConflictingEvidence` refuses a
would-be `pass` publication when a contributing case's own verification-result evidence contains a
tied conflicting `pass`/`fail` pair (same `result_type`, same `received_at_utc`) — the exact MED-1
tie scenario surfacing at publish time. No business rule changed; `compute-outcome` itself is
untouched. `pass` stays terminal within a case; no maker-checker, no manual override, no
non-terminal `pass` — correction is by creating a new case for the same anchor, which the anchor
layer then automatically treats as authoritative once it has a computed outcome.

**Migration `043_kyc1_outcome_publication.cjs`** — one new table, `kyc1.outcome_publication`
(`aggregate_status` CHECK `pass`/`fail`/`remediation_required` only — `pending` is structurally
never persisted; `status` CHECK `pending`/`succeeded`/`failed`/`superseded`, with `succeeded`/
`failed` a documented D6 forward-compatibility exception reachable only in Phase 2B). Partial
unique index enforces at most one non-`superseded` publication per application.

**Routes (2, 10→12):** `POST /internal/kyc1/applications/:application_id/publish-outcome`
(application-scoped, internal-identity-only, no IAM-02 — supersedes any prior active publication
before inserting a new `pending` row; refuses with no row created on `pending`/evidence-conflict)
and `GET /internal/kyc1/outcome-publications/:publication_id` (safe projection, `payload_hash`
excluded). No CLT-01 client anywhere in `services/kyc1/src`; no outbound HTTP call of any kind.

**Errors (3 reachable, 9→12):** `KYC1_OUTCOME_NOT_PUBLISHABLE`, `KYC1_OUTCOME_EVIDENCE_CONFLICT`,
`KYC1_OUTCOME_PUBLICATION_NOT_FOUND` — each independently confirmed to have exactly one throw site.
A fourth code, `KYC1_OUTCOME_PUBLICATION_INVALID_STATE`, was pre-registered as a documented
forward-compatibility exception (mirroring the migration's own D6 treatment of the `status` CHECK)
and then REMOVED by a pre-review micro-patch: a forward-only error code with zero call sites was
judged genuinely decorative in a way an unreached CHECK value is not, so the two are not the same
exception. It will be re-added in Phase 2B alongside the retry route that actually throws it.

**Audit events (3, 10→13):** `kyc1.outcome_publication_requested`/`_superseded`/`_refused`
(refusals audited via their own separate, immediately-committed transaction — mirrors CLT-01's
`recordFailureAudit` precedent — so the trail survives even though the route throws). No PII, no
raw `evidence_ref`, no `payload_hash`, no CLT-01 response body in any payload — swept directly.

## 9. Independent Opus review of Phase 2A

**Verdict: ACCEPT WITH LOW FINDINGS** (3 Low, 3 new Informational; zero Critical/High/Medium).
Every headline number was independently reproduced from a fresh disposable Postgres rather than
taken from the report — including live grant-boundary proof under the real `role_kyc1_runtime`
(every immutable `outcome_publication` column individually confirmed UPDATE-denied by direct SQL
under `SET ROLE`) and empirical reproduction of all three Low findings via concurrent/adversarial
HTTP probes, not static reading alone.

- **LOW-5** — concurrent `publish-outcome` calls can surface as 503 `KYC1_AUDIT_REQUIRED` instead
  of a 409-class conflict. Reproduced directly: 4 of 10 calls across a 5-trial concurrent-publish
  probe returned 503. Root cause: the supersede `UPDATE ... WHERE status <> 'superseded'` takes no
  lock when it matches zero rows, so a losing concurrent transaction re-evaluates against the
  winner's just-committed row, matches nothing, and then hits the partial unique index on its own
  INSERT — a raw `23505` mapped to the generic `KYC1_AUDIT_REQUIRED` catch-all. State integrity is
  unaffected (confirmed exactly one active publication in every trial); this is a signalling
  problem, not a correctness one. Same shape as the still-open Phase 1 LOW-2 and CLT-01 Phase 3 F1;
  fixable with the `pg_advisory_xact_lock(hashtext(...))` idiom CFG-01 Phase 3B already
  established for the identical race class. Deferred to Phase 2B, ahead of the retry route.
- **LOW-6** — `detectTiedConflictingEvidence` groups by `(resultType, receivedAtUtc)` only, with no
  `caseId` in the key, so the caller's flattening of every contributing case's evidence into one
  array means a tie can be detected ACROSS two different cases that are each internally consistent.
  Reproduced directly: a primary case and a party case, neither individually tied, sharing one
  `received_at_utc` with opposing `identity` statuses → publication wrongly refused. Fails safe
  (over-refuses, never wrongly publishes a `pass`); real HTTP-created rows essentially never tie
  across cases in practice. Fix: add `caseId` to the grouping key, before Phase 2B.
- **LOW-7** — a corrective same-anchor case (D4's own documented correction path) is invisible to
  the aggregate while its own outcome is still uncomputed. Reproduced directly: an anchor with a
  terminal `pass`, then a corrective case opened for the same anchor (still `pending_documents`,
  no outcome) → `publish-outcome` still returns the OLD `pass`, citing only the original case as
  contributing. Conforms to the approved "latest case WITH an outcome wins" spec, so not a
  deviation — but it means the correction window itself remains publishable, which undercuts D4's
  own narrative. Harmless in Phase 2A (nothing is delivered anywhere); becomes load-bearing the
  moment Phase 2B delivers to CLT-01. Flagged as an explicit Phase 2B gate, not a silent
  carry-forward.
- **INFO-7** `fetchCasesForApplication` has no `LIMIT` (unlike the case-list route's own
  `CASE_LIST_LIMIT`) — bounded in practice by realistic per-application case/party counts.
- **INFO-8** `contributingOutcomeIds` casts `currentOutcomeId as string`, trusting the invariant
  that `current_outcome_status`/`current_outcome_id` are always written together — true today,
  defensive-only.
- **INFO-9** migration 043's down/up round-trip drops `outcome_publication` and therefore its
  grants — `kyc1_runtime_grants.sql` must be re-applied afterward (verified idempotent). Documented
  platform convention, worth an operator-runbook line, not a defect.

## 10. Micro-patch: `KYC1_OUTCOME_PUBLICATION_INVALID_STATE` removed pre-review

Before the independent Opus review, a scoped micro-patch removed `KYC1_OUTCOME_PUBLICATION_INVALID_STATE`
from the error catalogue: it had no genuine Phase 2A throw site (registered only as a forward-
compatibility exception for Phase 2B's own future retry route), and the codebase's own "only add
codes this stage's routes can actually throw" discipline does not extend to forward-only error
codes the way it does to forward-compatible CHECK-constraint values (a CHECK value costs nothing
extra to declare early; a zero-call-site error code is genuinely decorative). KYC-01's error count
corrected from a planned 13 to the accepted **12**. No test asserted the removed code — this patch
touched only `lib/errors.ts` and a stale cross-reference in migration 043's own header comment; no
business logic, route, schema, or grant changed. Re-verified: `tsc -b --force` clean, 186/186 KYC-01
tests, 1806/1806 full suite, migrations 001→043 + all 8 grants clean, no migration 044.

## 11. Phase 2B gates

Before KYC-01 Phase 2B (CLT-01 delivery) coding starts, the following must be explicitly decided:

1. **LOW-7's correction window** — decide whether an in-flight corrective case must block or
   downgrade publication, rather than leaving a stale terminal `pass` publishable.
2. **LOW-5's concurrent-publish conflict signalling** — fix via advisory lock or equivalent before
   the retry route/delivery lifecycle depends on clean conflict semantics.
3. **LOW-6's evidence-conflict grouping** — include `caseId` in `detectTiedConflictingEvidence`'s
   grouping key.
4. **CLT-01 delivery design** — two-phase delivery (INSERT `pending` → HTTP outside any
   transaction → UPDATE terminal), mirroring AML-01 Phase 2A's own accepted pattern.
5. **CLT-01 lifecycle handling** — a delivery attempt against a non-`under_review` application must
   be recorded as a genuine failed delivery, never silently retried into a false success.
6. **Retry semantics** — `pending`/`failed` publications may retry; `succeeded`/`superseded` must
   reject (`KYC1_OUTCOME_PUBLICATION_INVALID_STATE`, re-added at that point).
7. **IAM-02/maker-checker** — not added unless separately justified.

## 12. Findings register — cumulative (Phase 1 + Phase 2A)

**Low (all non-blocking, carried forward):** LOW-1 (evidence-ref base64-heuristic imprecision),
LOW-2 (concurrent evidence POST 503-vs-409), LOW-4 (SQL-order test gap) from Phase 1; LOW-5
(concurrent-publish 503-vs-409), LOW-6 (cross-case evidence-conflict grouping), LOW-7 (correction
window visibility) from Phase 2A — all listed with full detail in §5 and §9 above.

**Informational:** INFO-1 (`timestamptz` string-vs-Date typing — now closed WITHIN KYC-01 by D5;
repo-wide remains open), INFO-3 (AML-01 migration naming-convention dependency), INFO-4
(unconstrained `document_type` placeholder), INFO-5 (evidence_refs newest-first order), INFO-7,
INFO-8, INFO-9 (all Phase 2A, above). **INFO-2** (multiple completed cases / authoritative outcome)
is now substantially addressed by Phase 2A's aggregation/supersession rule — only the D1
CLT-01-roster-completeness limitation remains open. **INFO-6** (non-monotonic tie-break) is
materially improved by the evidence-conflict refusal — the random tie-break key itself is
unchanged, but the ambiguous `pass` it could produce is now refused at publication, not silently
published.

**D1 limitation (unchanged, named, not hidden):** KYC-01 publishes over its own case set only — it
does not call CLT-01 to confirm every authorised party CLT-01 knows about has a matching KYC-01
case. `pass` means "every anchor KYC-01 itself holds a case for has passed", not "every anchor that
should exist has passed".

## 13. Test / build summary (Phase 2A)

| Check | Result |
|---|---|
| `npx tsc -b --force` | clean |
| KYC-01 tests | 186/186 |
| Full suite | 1806/1806 (91 files) |
| Migrations | 001→043 clean on a fresh disposable Postgres |
| Migration 043 down/up round-trip | clean, schema identical |
| Grant files | all 8 clean (fnd/iam/iam2/sec1/cfg1/clt1/aml1/kyc1) |
| Migration 044 | does not exist |
| Route count | 12 |
| Table count | 5 |
| KYC-01 error code count | 12 |
| IAM-02 `kyc1.*` permissions | 0 |
| `role_permission` seed | none |
| CLT-01 client / HTTP call | none anywhere in `services/kyc1/src` |

No code was written or changed during the Opus review of Phase 2A — review-only.

No code was written or changed during either Opus review pass (Phase 0+1 review, MED-1 patch
review) — both were review-only.

---

## 14. Scope implemented (Phase 2B — CLT-01 outcome delivery + LOW-5/6/7 pre-delivery closures)

**Mandatory ordering** (approved D1 of the Phase 2B plan): LOW-6, then LOW-7, then LOW-5 —
committed and independently green as a standalone change to `lib/authoritative-outcome.ts`
BEFORE any CLT-01 client or delivery-route code was written, so a failure in the closures would
be unambiguously attributable rather than entangled with new delivery logic.

**LOW-6 closed** — `EvidenceConflictInput` gained `caseId`; the grouping key in
`detectTiedConflictingEvidence` is now `caseId::resultType::receivedAtUtc`. A tie is detected only
within one case's own evidence. Regression-proofed: two internally-consistent cases sharing a
timestamp/opposing status now publish successfully (previously wrongly refused); a genuine
same-case tie still blocks.

**LOW-7 closed** — `selectAuthoritativeCasePerAnchor` no longer filters to cases with a computed
outcome; the latest case in an anchor wins outright, computed or not. A primary anchor's
uncomputed latest case → `KYC1_OUTCOME_NOT_PUBLISHABLE`; a party anchor's uncomputed latest case →
downgrades to `remediation_required`. A corrective case that DOES have an outcome still supersedes
normally (unchanged from Phase 2A).

**LOW-5 closed** — `pg_advisory_xact_lock(hashtext('kyc1.outcome_publication:'+application_id))`
as the first statement in `publish-outcome`'s transaction and in both of `deliver`'s (TX1/TX2),
mirroring the identical idiom AML-01/CFG-01/SEC-01 already use for the same race class. Never held
across the HTTP call. Empirically verified: 10 trials × 3 concurrent publish calls (30 total)
against an application with a prior active publication → zero 503s, exactly one active publication
surviving every trial.

**CLT-01 client** — `services/kyc1/src/lib/clt1-client.ts`, KYC-01's own copy (F3(c)-clean,
confirmed by the existing import-boundary test; no CLT-01 source change). Explicit status map
(`pass`/`fail`/`remediation_required`, 1:1, never a pass-through). `Clt1DeliveryResult` carries an
explicit `kind: "rejected" | "unavailable"` discriminant so the route never infers the HTTP status
class from string-matching a failure-reason sentinel. `failureReasonCode` clamped to 64 chars
(AML-01's own hard-won lesson, inherited from day one). Config: `CLT1_BASE_URL`/
`CLT1_INTERNAL_SERVICE_TOKEN` required, fail-closed at `loadKyc1Config`; `clt1FetchImpl` test-only
DI seam.

**Delivery route** — `POST /internal/kyc1/outcome-publications/:publication_id/deliver` (route
count 12→13). Handles BOTH first delivery (`pending`) and retry (`failed`) — approved D3, no
separate `/retry`. `publish-outcome` remains create-only; its accepted Phase 2A contract is
unchanged.

**Delivery lifecycle** — TX1 (advisory lock → re-validate `pending`/`failed` → recompute the live
authoritative aggregate and compare it against the publication's own stored snapshot → audit
`attempted` → commit, releasing the lock) → HTTP outside any transaction, 5s timeout-bounded → TX2
(re-lock → re-check the row is still active → write terminal status, `attempt_count += 1`, audit
→ commit). `attempt_count` increments in TX2 (approved D4 — AML-01 symmetry). No `delivering`/
`attempting` status added — a crash between TX1 and TX2 simply leaves the row `pending`/`failed`
and retryable.

**Stale-publication check (the LOW-7 delivery-time backstop)** — a mismatch between the live
aggregate and the stored snapshot (e.g. a corrective case opened between publish and deliver)
throws `KYC1_OUTCOME_PUBLICATION_STALE` (409) BEFORE any CLT-01 HTTP call, no row mutated, audited
via the EXISTING `kyc1.outcome_publication_refused` event (`reason_code: "stale"`) — no new event
type invented.

**Errors added (12 → 16):** `KYC1_OUTCOME_PUBLICATION_INVALID_STATE` (409 — `succeeded`/
`superseded` before TX1), `KYC1_OUTCOME_PUBLICATION_STALE` (409 — snapshot mismatch), `KYC1_CLT_
DELIVERY_FAILED` (502 — CLT-01 reachable, genuine non-2xx decision), `KYC1_CLT_UNAVAILABLE` (503 —
network/timeout/malformed/`success:false`) — each independently confirmed to have exactly one
reachable throw site.

**Audit events added (13 → 16):** `kyc1.outcome_delivery_attempted`/`_succeeded`/`_failed` —
transaction-coupled, no PII/`evidence_ref`/`payload_hash`/raw CLT-01 request-or-response body/
token in any metadata (swept directly).

**No migration, no grant/schema change.** Migration 043's own D6 forward-compatibility exception
(the `status` CHECK already carried `succeeded`/`failed` from Phase 2A) and the six already-granted
UPDATE columns (`status`/`attempt_count`/`failure_reason_code`/`response_ref`/`delivered_at_utc`/
`version`) turned out to be exactly the delivery lifecycle's full write set — confirmed at the
`information_schema` level, byte-identical to the Phase 2A baseline, before and after this phase.

## 15. Independent Opus review of Phase 2B

**Verdict: ACCEPT WITH LOW FINDINGS, conditional on closing one Medium (MED-2) first.** Every
headline number and every LOW-5/6/7 closure claim was independently reproduced on a fresh
disposable Postgres via adversarial probes that INJECTED the actual concurrency conditions
(`Promise.all` concurrent HTTP calls; a superseding publish fired from inside the CLT-01 fetch stub
itself, landing exactly inside the TX1-commit-to-TX2-start window), not static reading.

LOW-5/LOW-6/LOW-7 all confirmed genuinely closed — including a route-level (not just unit-level)
reproduction of the LOW-7 stale-check and the LOW-5 concurrency fix.

**MED-2 — the documented `superseded_during_delivery` mitigation was itself non-functional.** TX2
wrote `status='failed'` over a row whose `status` was already `'superseded'` when a fresh publish
superseded the in-flight delivery mid-HTTP-call. Because `idx_kyc1_outcome_publication_
one_active_per_application` is `UNIQUE(application_id) WHERE status<>'superseded'`, this re-entered
the row into the index alongside the newer publication — a raw `23505`, caught by the generic
handler and surfaced as a misleading `KYC1_AUDIT_REQUIRED` (503) with the WHOLE transaction rolled
back: `attempt_count` stayed 0, no `failure_reason_code`, no `response_ref`, and — even when
CLT-01 had genuinely accepted the delivery — only an `attempted` audit event, never a `failed` one.
Reproduced deterministically in both the CLT-accepts and CLT-rejects variants; untested by the
implementation's own shipped tests.

## 16. MED-2 micro-patch

TX2's terminal write became three-way instead of binary: `targetStatus = succeeded ? "succeeded" :
supersededDuringDelivery ? "superseded" : "failed"`. When superseded mid-flight, the row's `status`
column is written back to `'superseded'` — i.e. left exactly where it was — so it never re-enters
the partial unique index. `attempt_count`, `failure_reason_code = "superseded_during_delivery"`,
`delivered_at_utc`, and `version` all still advance in the SAME statement, so the attempt is
durably recorded either way. `response_ref` stays `null` in this branch (safe-minimal — CLT-01's
`outcome_id` is never attached to a row that is not authoritative).

The caller-side inference was also fixed: the ORIGINAL code inferred the hazard from `finalRow.
status === "failed" && result.succeeded` — dead code once the write stopped conflating "genuinely
failed" and "superseded mid-flight" into the same `'failed'` value. Replaced with a real
discriminated result (`DeliverOutcome`, `kind: "succeeded" | "failed" | "superseded_during_
delivery"`) returned directly from the transaction, so the route branches on what TX2 actually
decided.

**Files changed:** `services/kyc1/src/routes/outcome-publication.ts`,
`tests/integration/kyc1-db.test.ts`. No migration, no grant, no schema, no other file touched.

**Tests added:** Test A (CLT-01 accepts while superseded mid-flight → `KYC1_OUTCOME_PUBLICATION_
STALE`/409, row stays `superseded`, `attempt_count=1`, `failure_reason_code=superseded_during_
delivery`, `response_ref=null`, exactly one active publication, `attempted`+`failed` audit, no
`succeeded`); Test B (CLT-01 rejects while superseded mid-flight — same assertions); two
regression tests (normal success still sets `succeeded` with a real `response_ref`; normal failure
still sets `failed`).

## 17. Independent Opus review of the MED-2 patch

**Verdict: MED-2 CLOSED.** Re-verified via the SAME adversarial reproduction technique that
originally found the defect — re-run unchanged against the patched code, plus a THIRD race variant
(CLT-01 unreachable mid-race) the patch's own tests do not cover, verified independently to behave
identically and correctly. Also verified: the superseding publication (P2) remains independently
deliverable afterward — the recovery property that makes the residual ordering risk self-healing
rather than terminal, not covered by the patch's own tests either. Global integrity sweep: 0
applications with more than one active publication anywhere in the database after all scenarios; 0
audit payloads containing `payload_hash`/`evidence_ref`/token/`sha256:`; 0 superseded rows carrying
a `response_ref`.

Two informational items surfaced during the re-review, both accepted as-is: **INFO-13** the
CLT-unavailable race variant has no dedicated test (behaviour independently confirmed correct);
**INFO-14** a benign local cast (`as DeliverOutcome`) on a value constructed inside the same
function, never on external data.

## 18. Findings register — cumulative (Phase 1 + Phase 2A + Phase 2B)

**Low (all non-blocking, carried forward):** LOW-1 (evidence-ref base64-heuristic imprecision),
LOW-2 (concurrent evidence POST 503-vs-409), LOW-4 (SQL-order test gap) — Phase 1, unchanged.
LOW-5, LOW-6, LOW-7 — **closed in Phase 2B**, see §14-15 above. **LOW-8 (new)**:
`delivered_at_utc` is set on a failed delivery the same as a successful one, with no distinct
"last attempted at" semantics — cosmetic, no functional impact.

**Informational:** INFO-1 (`timestamptz` typing, closed WITHIN KYC-01 by D5, repo-wide remains
open), INFO-3, INFO-4, INFO-5, INFO-7, INFO-8, INFO-9 (all Phase 2A, unchanged). **INFO-10 (new)**
— concurrent `/deliver` calls on the SAME publication can produce two genuine CLT-01 writes;
accepted at-least-once behaviour (AML-01 symmetry), safe-but-noisy given CLT-01's own
append + last-write-wins rollup. **INFO-11 (new)** — a LOW-6 integration test's own trailing
comment is partially self-contradictory; the assertion itself is correct, comment-only. **INFO-12
(new)** — if CLT-01 accepts during the supersession race, its own `cdd_outcome` row is not linked
back to KYC-01 via `response_ref` (accepted safe-minimal trade-off — the attempt itself is still
durably recorded). **INFO-13, INFO-14 (new)** — see §17.

**D1 limitation — restated as higher-stakes, not new:** KYC-01 publishes over its own case set
only and cannot prove CLT-01's authorised-party roster is complete. This was a documented,
accepted limitation since Phase 2A; it is restated here because a `pass` now genuinely reaches
CLT-01's approval gate, so the limitation is no longer purely theoretical.

**Ordering residual (named, queryable, accepted):** if a superseding publication is itself never
delivered, CLT-01's rollup retains the prior value. The read route makes this state directly
queryable; MED-2's closure ensures the attempt evidence for the SUPERSEDED delivery is never lost,
but does not (and cannot, by design) force the superseding publication's own delivery to happen.

## 19. Test / build summary (Phase 2B)

| Check | Result |
|---|---|
| `npx tsc -b --force` | clean |
| KYC-01 tests | 236/236 |
| Full suite | 1856/1856 (92 files) |
| Migrations | 001→043 clean on a fresh disposable Postgres |
| Grant files | all 8 clean (fnd/iam/iam2/sec1/cfg1/clt1/aml1/kyc1) |
| Migration 044 | does not exist |
| Route count | 13 |
| Table count | 5 |
| KYC-01 error code count | 16 |
| IAM-02 `kyc1.*` permissions | 0 |
| `role_permission` seed | none |
| CLT-01/AML-01 source changed | no |

No code was written or changed during either Opus review pass (Phase 2B review, MED-2 patch
review) — both were review-only.

## 20. Scope implemented (Phase 3A — IAM-02 integration + sensitive evidence-read)

KYC-01's first IAM-02 integration point. Split deliberately from Phase 3B (manual override /
maker-checker / execute-verify) so the plumbing (IAM-02 client, permission registration, the
first permission-gated route) could be independently reviewed before any mechanism capable of
changing a compliance outcome exists.

**IAM-02 client** (`services/kyc1/src/lib/iam2-client.ts`): KYC-01's own fresh copy, F3(c)-clean
— never imports `services/iam2/src/**`, `services/aml1/src/**`, or `services/cfg1/src/**`.
Implements `checkPermission` only; deliberately omits `verifyDecisionToken`/execute-verify, since
no Phase 3A permission carries `requires_approval=true` and there is no reachable throw site for
it yet — adding it unreached would itself be the kind of decorative forward-registration this
file's own error-catalogue discipline rejects for code. Baseline decision handling: `allow`/
`approval_required`/`step_up_required` → pass (the CFG-01 Phase 3A F-1 lesson — treating
`approval_required` as a denial would make the baseline check permanently unsatisfiable for any
future approval-gated permission — applied from day one); `deny`/`licence_locked` →
`KYC1_PERMISSION_DENIED`; network error/timeout (`AbortSignal.timeout`, 5s)/non-2xx/malformed
JSON/`success:false`/missing-`decision` → `KYC1_IAM2_UNAVAILABLE`. Token sent only in the
`x-internal-service-token` outbound request header, never in the request body or any log line.

**Config** (`services/kyc1/src/config.ts`): `IAM02_BASE_URL`/`IAM02_INTERNAL_SERVICE_TOKEN`
required, fail-closed at `loadKyc1Config`. `iam2FetchImpl` is a test-only DI seam, never populated
from env.

**Migration `044_iam2_register_kyc1_phase3a_permissions.cjs`** — permission-registration only, no
table, no `ALTER`, no grant statement, no `role_permission` seed. Registers exactly one
`iam2.permission` row:

| Column | Value |
|---|---|
| `permission_id` | `perm_kyc1_evidence_sensitive_read` |
| `permission_code` | `kyc1.evidence.sensitive_read` |
| `resource` | `document_checklist_item` |
| `action` | `sensitive_read` |
| `sensitivity` | `sensitive` |
| `licence_locked` | `false` |
| `prohibited` | `false` |
| `requires_step_up` | `false` |
| `requires_approval` | `false` |
| `status` | `active` |
| `owner_module` | `KYC-01` |

**Checklist projection narrowing** (`services/kyc1/src/lib/kyc-case.ts`): the shared
`safeChecklistItemResponse` — the single safe-projection point for BOTH the checklist-read route
and the evidence-add route's own confirmation response, and also embedded in the handoff-creation
response — had `evidence_ref`/`evidence_hash` REMOVED. This is a deliberate scope decision broader
than a literal "narrow the checklist route" instruction: because the function is shared across
three call sites (`GET .../checklist`, `POST .../evidence`, `POST .../handoffs`), narrowing only
the checklist-read route would have left the other two leaking the values, making the phase's own
central invariant ("the sensitive route is the sole KYC-01 disclosure point for either field")
unsatisfiable. A new `safeChecklistItemSensitiveResponse` was added as the one projection point
that DOES return both fields, used only by the new route. Routine projection now returns:
`checklist_item_id`, `case_id`, `document_type`, `required`, `status`, `expiry_date`,
`verification_result_id`, `created_at_utc`, `updated_at_utc` — `evidence_ref`/`evidence_hash`
removed.

**New route** (`services/kyc1/src/routes/sensitive-evidence.ts`):
`GET /internal/kyc1/checklist-items/:checklist_item_id/sensitive-detail?actor_id=<actor_id>`
(14th route, 13→14). Keyed by `checklist_item_id` alone (globally UNIQUE, migration 042) rather
than nested under `:case_id/...` — a `case_id` path segment would be redundant and only introduce
a mismatch failure mode. `evidence_ref` never appears in the URL (would leak into access
logs/proxies). Internal-identity-gated, `actor_id` required, IAM-02
`kyc1.evidence.sensitive_read`-gated, single-record only — no list/search route. Response returns
an evidence REFERENCE, not document content — exactly `checklist_item_id`, `case_id`,
`document_type`, `status`, `evidence_ref`, `evidence_hash`, `expiry_date`; no base64, no `data:`
URI, no vendor payload, no `verification_result.payload_hash`.

**Permission-before-existence**: `checkPermission` runs BEFORE `fetchChecklistItemById` is ever
called. A denied caller and a denied-caller-against-a-nonexistent-item both resolve to the
identical `KYC1_PERMISSION_DENIED`/403, never a 404 — no existence oracle. Only once permission
genuinely passes does an unknown id resolve to the EXISTING `KYC1_CHECKLIST_ITEM_NOT_FOUND` (no
new `KYC1_SENSITIVE_EVIDENCE_NOT_FOUND` code — a second name for an already-covered condition).

**Audit-before-return, fail-closed**: `kyc1.sensitive_evidence_read` (severity `high`, metadata
`{checklist_item_id, case_id, document_type}` only — never `evidence_ref`/`evidence_hash`/
`payload_hash`/PII/tokens/raw IAM-02 body) commits in its own transaction BEFORE the response is
built. If the audit write fails, the route fails `KYC1_AUDIT_REQUIRED`/503 and returns no
sensitive data.

**2 new error codes (16→18)**: `KYC1_PERMISSION_DENIED`/403, `KYC1_IAM2_UNAVAILABLE`/503 — each
with exactly one reachable throw site. **1 new audit event (16→17)**: `kyc1.sensitive_evidence_read`.

**Existing 13 routes NOT retro-gated with IAM-02** — remain internal-service-token-only, mirroring
the AML-01 precedent of gating only human-actor routes and leaving the service-to-service pipeline
(`screening.ts`/`clt-outcome-delivery.ts`-equivalent routes) untouched.

**Deliberately out of scope**: manual override, maker-checker, execute-verify,
`manual_override_request` table, migration 045/046, `cdd_outcome` mutation, recompute-lock, UBO,
EDD, vendor, proofing, document-store integration, AML integration, no grant/schema change.

## 21. Independent Opus review of Phase 3A

**Verdict: ACCEPT WITH LOW FINDINGS** (1 Low, 5 Informational; zero Critical/High/Medium). Every
claim independently reproduced on a fresh disposable Postgres via adversarial probes rather than
static reading:

- **Permission-before-existence** proven by DB-query-order instrumentation (not just the status
  code): on a denied decision, ZERO `document_checklist_item` queries are issued at all; on an
  allowed decision, the IAM-02 call strictly precedes the DB read; a denied-existing-item response
  and a denied-nonexistent-item response are byte-identical after normalising request-id/
  correlation-id/timestamp — complete existence-oracle closure, stronger than the implementer's
  own status-code-only test.
- **Audit-before-return, fail-closed** re-verified under a genuine least-privilege runtime role.
  (An initial probe connected as database superuser, which bypasses `REVOKE` entirely and produced
  a false leak signal — 200 with the full evidence payload; this was retracted once corrected to
  connect as `role_kyc1_runtime`, which correctly returned 503 `KYC1_AUDIT_REQUIRED` with no
  disclosure.) Exactly one audit event per successful read; zero on deny/IAM-02-unavailable/
  not-found.
- **Checklist projection narrowing** proven at runtime, not just by reading the code: an
  exhaustive canary-value sweep injected a unique `evidence_ref`/`evidence_hash` pair and called
  all 14 routes — exactly one route (`GET .../sensitive-detail`) ever returned either value.
- **Migration 044's down path** — previously a self-flagged residual, code-inspected only — was
  LIVE-TESTED for the first time: `kyc1.evidence.sensitive_read` permission count 1→0, TOTAL
  `iam2.permission` count 93→92 (zero collateral deletion to any other module's permissions), kyc1
  table count unchanged at 5, migration head correctly reverted to `043`, and a subsequent
  up/down/up cycle proved idempotent. **This residual is now CLOSED.**
- Scope boundary, grant-drift, and error-model claims were independently re-derived from source
  (grant file mtime predates migration 044; live grant-footprint query confirms zero drift from
  the Phase 2B baseline; error catalogue re-counted at 18 with all banned codes confirmed absent).
- The SEC-01 validation addendum (an unrelated pre-existing test-environment issue, resolved by
  using the canonical `SEC1_INGEST_TOKEN_*` values already documented in this file's own §7/§13/
  §19 "Commands run" sections) was independently reproduced: isolated SEC-01 139/139, full suite
  93/93 files / 1896/1896 tests, with `services/sec1/**` and `sec1_runtime_grants.sql` confirmed
  untouched.

## 22. Findings register — Phase 3A (new)

**Low:** **LOW-9** — the sensitive-read `actor_id` is caller-asserted via a query parameter and is
used for BOTH the IAM-02 authorization decision and the high-severity audit record; any holder of
the shared `KYC1_INTERNAL_SERVICE_TOKEN` can assert an arbitrary actor identity. This follows the
existing AML-01/platform-wide interim-shared-secret-identity carry-forward exactly and is NOT a
Phase 3A regression — but it is flagged now because Phase 3B's override attribution and strict SoD
(requester ≠ approver, requester ≠ evidence provider) will depend on this identity being genuine.
Do not silently assume cryptographically authenticated human identity when designing Phase 3B.

**Informational:** **INFO-15** — the audit-write-fails fail-closed test is only meaningful when
the integration harness connects as a non-superuser role; a superuser bypasses `REVOKE` and would
silently make the test a no-op that always passes — needs a test-site comment/harness assertion
documenting the least-privilege-role requirement. **INFO-16** — an authorised-but-not-found
sensitive-read attempt emits no audit event (the not-found throw precedes the audit) — matches
AML-01's own `matchNotFound()` ordering, accepted. **INFO-17** — the pre-existing global "no
deferred-phase event type is ever emitted" sweep (§ audit/PII sweep) was narrowed to a single
lifecycle's own events; necessary and correct (the global form false-positived once
`kyc1.sensitive_evidence_read` became genuinely reachable elsewhere in the shared test database),
but it incidentally weakened the still-forbidden `kyc1.manual_review_*` guard from "never
anywhere in the outbox" to "never in this one lifecycle" — Phase 3B should restore a global sweep
scoped to only the event types that remain forbidden. **INFO-18** — `infra/grants/
kyc1_runtime_grants.sql`'s header comment is stale, still claiming KYC-01 has no CLT-01/IAM-02
HTTP dependency (untrue since Phase 2B, doubly untrue now) — correctly NOT edited during Phase 3A
(grant file changes were out of scope), fix opportunistically when Phase 3B legitimately edits
that file for its own reasons. **INFO-19** — the sensitive-read audit's `try/catch` block omits
the house-style `if (err instanceof Kyc1Error) throw err;` re-throw guard present in every other
KYC-01 route's equivalent block; safe today (only `publishAudit` runs inside, which cannot itself
throw a `Kyc1Error`), carried forward as defensive-consistency hardening rather than a functional
defect.

**Carried forward unchanged from Phase 1/2A/2B:** LOW-1 (evidence-ref base64-heuristic
imprecision), LOW-2 (concurrent evidence POST 503-vs-409), LOW-4 (SQL-order test gap), LOW-8
(`delivered_at_utc` set on failure same as success); INFO-3 (AML-01 migration naming-convention
dependency), INFO-4 (unconstrained `document_type` placeholder), INFO-5 (evidence_refs
newest-first order), INFO-7 (`fetchCasesForApplication` no `LIMIT`), INFO-8
(`contributingOutcomeIds` cast invariant), INFO-9 (grants must be re-applied after a migration
down/up round-trip — now also independently confirmed true of migration 044), INFO-10 (concurrent
`/deliver` at-least-once duplicate CLT-01 writes), INFO-11 (LOW-6 test's own trailing comment),
INFO-12 (superseded-during-delivery accepted CLT-01 row not linked via `response_ref`), INFO-13
(missing CLT-unavailable race regression test), INFO-14 (benign local `DeliverOutcome` cast). D1
(authorised-party-roster-completeness limitation) and the ordering residual (an undelivered
superseding publication) both remain open, unchanged. Repo-wide `timestamptz` typing outside
KYC-01 remains a separate platform-hardening item.

## 23. Test / build summary (Phase 3A)

| Check | Result |
|---|---|
| `npx tsc -b --force` | clean |
| KYC-01 tests | 276/276 |
| Full suite | 1896/1896 (93 files) |
| Migrations | 001→044 clean on a fresh disposable Postgres |
| Grant files | all 8 clean (fnd/iam/iam2/sec1/cfg1/clt1/aml1/kyc1) |
| Migration 045 | does not exist |
| Migration 044 down path | independently live-verified — permissions 1→0 (total 93→92, zero collateral), tables unchanged at 5, head reverted to 043, up/down/up idempotent |
| Route count | 14 |
| Table count | 5 |
| KYC-01 error code count | 18 |
| IAM-02 `kyc1.*` permissions | 1 |
| `role_permission` seed | 0 |
| CLT-01/AML-01 source changed | no |
| Status docs updated during implementation | no (documentation sync performed only after this ACCEPT) |

No code was written or changed during the Phase 3A Opus review pass — review-only, including the
migration 044 down-path verification (a fresh disposable database, discarded afterward).

## 24. Phase 3B planning inputs (accepted scope, not yet implemented)

Manual outcome override ONLY — `cdd_outcome` is the sole override target; `verification_result`/
`document_checklist_item`/publication-eligibility/evidence-conflict/stale-publication refusals all
remain forbidden override targets. Maker-checker via IAM-02 execute-verify (`iam2-client.ts` gains
`verifyDecisionToken`, unreached until this phase). Append-only `cdd_outcome` override — never
mutates evidence, always inserts a new versioned row. Migration 045 (`manual_override_request`
table) + migration 046 (permission registration) — two migrations, matching the
table-then-permission convention every prior module uses. Strict SoD: requester ≠ approver (via
IAM-02's own unconditional rule) and requester ≠ any manual verifier on the case (a KYC-01-owned
self-block check). Recompute-lock on overridden cases, reusing the existing
`KYC1_CASE_INVALID_STATE` — no new code required. Explicit republish + redelivery required — no
automatic CLT-01 publication or delivery triggered by an override.

Carried planning inputs: **LOW-9** (caller-asserted actor attribution — now load-bearing for
override SoD, not merely decorative); **D1** (authorised-party-roster-completeness limitation,
still open); the `MED-2`-style partial-unique-index status-transition hazard named in the accepted
Phase 3 planning report — `manual_override_request.status` writes need the same scrutiny that
caught MED-2 in `outcome_publication.status`; **INFO-17**'s global forbidden-event sweep
restoration; **INFO-18**'s stale grant-header fix (opportunistic, when the grant file is next
legitimately touched).

## 25. Scope implemented (Phase 3B — maker-checker manual outcome override)

Case-level `cdd_outcome` is the ONLY permitted override target (D2) — `verification_result`/
`document_checklist_item`/publication-eligibility/evidence-conflict/stale-publication refusals
remain explicitly forbidden override targets; no code anywhere in this phase mutates any of them.

**Migration `045_kyc1_manual_override_request.cjs`** — new table `kyc1.manual_override_request`,
the append-only maker-checker request/apply binding record (mirrors AML-01's own
`match_disposition_decision_request` shape). Live lifecycle this phase: `requested`/`applied`/
`failed` (the last added by the MED-3 fix, §27). `cancelled` schema-present, unreachable — no
cancel route exists. Partial unique index `idx_kyc1_manual_override_request_one_open_per_case`
enforces at most one open `requested` row per case. `reason_code` is a bounded enum (D9) —
`system_derived_outcome_incorrect`/`manual_evidence_review`/`documented_compliance_exception` —
no free-text reason field, a deliberate divergence from AML-01's own free-text `reason` column. No
ALTER to any Phase 1/2 table.

**Migration `046_iam2_register_kyc1_phase3b_permissions.cjs`** — KYC-01's SECOND IAM-02 permission:
`perm_kyc1_outcome_override` / `kyc1.outcome.override`, resource `cdd_outcome`, action `override`,
sensitivity `sensitive`, `licence_locked=false`, `requires_step_up=false`, `requires_approval=true`,
`status=active`, `owner_module=KYC-01`. No `role_permission` seed (FR-003).

**IAM-02 execute-verify** (`lib/iam2-client.ts`): `verifyDecisionToken` added alongside the
existing `checkPermission`. Baseline decision handling unchanged (`allow`/`approval_required`/
`step_up_required` → pass; `deny`/`licence_locked` → `KYC1_PERMISSION_DENIED`) — `kyc1.outcome.
override` is the first KYC-01 permission that genuinely exercises the `approval_required`
pass-through, since it carries `requires_approval=true`. Execute-verify: unavailable/network/
timeout/non-2xx/malformed → `KYC1_IAM2_UNAVAILABLE`; a genuine IAM-02 denial (invalid/expired/
replayed/hash-mismatched token, approver mismatch, `execution_authorised !== true`) →
`KYC1_APPROVAL_REQUIRED`. Raw decision token never logged, never persisted — only
`fingerprint(decision_token)` is stored, and only on a successful apply.

**Request route** — `POST /internal/kyc1/cases/:case_id/outcome-override/request` (15th route,
14→15). Body: `requested_by`/`target_outcome_status` ∈ {pass, fail, remediation_required}/
`reason_code`. Validates: case exists, case has a current outcome, target differs from current
(no-op refused), latest outcome is not already a manual override (an overridden case is terminal;
correction requires a new case for the anchor). Self-override SoD (D6) checked BEFORE the IAM-02
baseline call — `requested_by` may not equal the `source_id` of a `source_type='manual'`
`verification_result` on the same case; a blocked request creates no row, calls no IAM-02, and
emits a standalone best-effort `kyc1.manual_override_refused` audit (`reason_code:
self_override_blocked`, metadata `{case_id, requested_by_present: true, reason_code}` — no
requester/source_id value). VACUOUS for a registry-only case (no manual verifier exists to compare
against) — SoD then rests on IAM-02's own unconditional requester≠approver rule alone; this
limitation is tested and documented, never claimed as closed. `pg_advisory_xact_lock(hashtext(
'kyc1.manual_override:'+case_id))` is the first statement of the mutating transaction (mirrors the
established LOW-5/MED-2 idiom from `outcome-publication.ts`); the case row is re-locked and
re-validated inside the transaction before the row is inserted; the `one_open_per_case` partial
index is the race-safe backstop (`isDuplicateOpenOverrideViolation`, mirrors `kyc-case.ts`'s own
`isDuplicateActiveCaseViolation`).

**Apply route** — `POST /internal/kyc1/cases/:case_id/outcome-override/apply` (16th route). Body:
`override_id`/`approval_id`/`decision_token` — no actor identity accepted from the caller; the
route uses the STORED `requested_by` for both the IAM-02 baseline check and execute-verify (mirrors
AML-01's own `confirm`/`dismiss` apply routes). Preflight (plain reads, IAM-02 calls) runs entirely
OUTSIDE any DB transaction; the final transaction re-locks the override row and the case row (in
that order) and re-validates everything from scratch before writing — approval state can go stale
during the HTTP round-trip to IAM-02, so nothing from the preflight phase is trusted for the actual
write.

**Append-only outcome application** (D3): apply INSERTs a NEW `cdd_outcome` row — same
append-versioned discipline `compute-outcome` already uses — never UPDATEs an existing row, never
touches `verification_result`/`document_checklist_item`. `outcome_reason` ∈ {manual_override_pass,
manual_override_fail, manual_override_remediation_required}; `verification_scope`/`evidence_refs`
built via the SAME structured-snapshot logic (`computeCddOutcome`) the normal compute path uses —
the engine's own evidence snapshot, with `outcome_status`/`outcome_reason` supplied by the override
itself, never the engine's computed values. `kyc_case`'s current-outcome pointer is updated through
the EXISTING four-column grant (`status`/`current_outcome_status`/`current_outcome_id`/
`updated_at_utc`, via the same `caseStatusForOutcome` helper `compute-outcome` uses) — no widened
grant needed. `role_kyc1_runtime` carries NO UPDATE grant on `cdd_outcome`/`verification_result` —
the append-only guarantee is grant-enforced, not merely route-logic-enforced.

**Recompute-lock** (D5, in `routes/outcome.ts`): `compute-outcome` additionally rejects
`KYC1_CASE_INVALID_STATE` when the case's latest `cdd_outcome.outcome_reason` is one of the three
`manual_override_*` values (`MANUAL_OVERRIDE_REASON_CODES`, a single shared source of truth between
the apply route that WRITES these values and the compute-outcome route that READS for them). No new
error code. Correction of an overridden case uses the SAME D4 path Phase 2A already established for
a terminal `pass`: open a new case for the same anchor.

**Publication/delivery interaction**: apply never publishes, never delivers, never calls CLT-01 —
zero automatic side effects (tested: zero CLT-01 fetch calls, zero publications created by apply).
The EXISTING Phase 2B machinery handles the consequence automatically: a prior active publication's
own stored snapshot no longer matches the case's new live aggregate, so a subsequent `/deliver`
call on it fails `KYC1_OUTCOME_PUBLICATION_STALE` before any CLT-01 HTTP call — no new code needed.
Explicit republish + redeliver succeeds with the new value. Override-to-pass does NOT bypass the
evidence-conflict refusal — `publish-outcome` may still return `KYC1_OUTCOME_EVIDENCE_CONFLICT` for
a conflicted case even after an override. Apply response always carries `republish_required: true`
and `redelivery_required: true` (advisory flags, not triggers).

**4 new error codes (18→22)**: `KYC1_APPROVAL_REQUIRED`/403, `KYC1_OVERRIDE_NOT_FOUND`/404,
`KYC1_OVERRIDE_INVALID_STATE`/409, `KYC1_SELF_OVERRIDE_BLOCKED`/409. `KYC1_CASE_INVALID_STATE`
(reused) covers CASE-level state problems (no current outcome, no-op target, already-overridden
case, and — post-MED-3 — approved-against snapshot drift); `KYC1_OVERRIDE_INVALID_STATE` covers
OVERRIDE-ROW lifecycle problems (duplicate open request, apply on a non-`requested` row) — a
deliberate semantic split, not two names for one condition.

**3 new audit events (17→20)**: `kyc1.manual_override_requested` (medium), `kyc1.manual_override_
applied` (high, same transaction as the `cdd_outcome` insert/`kyc_case` update/override-row
update), `kyc1.manual_override_refused` (medium; reachable for `self_override_blocked` and, after
the MED-3 fix, `case_state_changed`). Metadata excludes decision tokens/hashes/`payload_hash`/
`requested_by` value/`source_id`/evidence references/document content/PII/free text/raw IAM-02 or
CLT body throughout.

**INFO-17 restored and CLOSED**: the global forbidden-event sweep (narrowed to one lifecycle at
Phase 3A, necessarily, once `kyc1.sensitive_evidence_read` became reachable) is now a genuinely
global, unscoped sweep of the whole outbox table across the file's lifecycle — confirms `kyc1.
manual_review_*`/`kyc1.manual_override_denied`/`kyc1.outcome_published`/UBO/EDD/vendor/proofing
event prefixes never appear anywhere, while permitting only the three legitimate override events
(plus a full 20-event-type inventory test).

**INFO-18 CLOSED**: `kyc1_runtime_grants.sql`'s header no longer claims KYC-01 has no CLT-01/IAM-02
HTTP dependency — corrected to state the real, permanent invariant (no DIRECT SQL GRANT into any
other module's schema; both dependencies are reached over HTTP only). The GRANT statements
themselves are byte-identical to the Phase 2B baseline — comment-only fix.

**No CLT-01/AML-01 source change. No migration/grant change beyond exactly what's listed above
(the new table's own grants). 386/386 KYC-01 tests, 2006/2006 full suite (94 files), `tsc -b
--force` clean, migrations 001→046 + all 8 grant files clean, migrations 045/046 down/up
round-trip clean, same-DB rerun clean, no migration 047.**

## 26. Independent Opus review of Phase 3B

**Verdict: ACCEPT WITH LOW FINDINGS, conditional on closing one Medium (MED-3) first.** Every claim
independently reproduced on a fresh disposable Postgres via adversarial probes, not static reading
— including a DB-query-order instrumentation probe for the request route's self-override-before-
IAM-02 ordering, a genuine advisory-lock-acquisition probe (from an independent connection, during
the stubbed execute-verify call) proving no transaction/lock is held across the IAM-02 HTTP window,
and a full file-inventory mtime analysis resolving a reported 13-vs-11 file-count discrepancy in
the implementer's own report (see INFO-22, §28) as bookkeeping only — no missing or extra change.

**MED-3**: an override approval was bound only to `{override_id, case_id, target_type,
target_outcome_status, reason_code, requested_by}` — NEVER to the case outcome that existed when
the override was requested. Reproduced exploit: a case at `remediation_required` has an
override-to-`pass` requested and approved; genuinely adverse evidence then arrives and the case
recomputes to `fail`; the STALE approval is applied anyway — `manual_override_pass` masks the
`fail` finding, and D5's own recompute-lock then makes the adverse finding unreassertable except by
opening a new case. This defeated the maker-checker control's core premise: that the approver
approved *this specific situation*, not an arbitrary future one.

## 27. MED-3 micro-patch

Migration 045 modified in place (Phase 3B was never accepted/deployed — no migration 047). Two new
immutable `NOT NULL` columns: `approved_against_outcome_id` (a genuine FK into `kyc1.cdd_outcome
(outcome_id)`, which already carries a `UNIQUE` constraint from migration 042) and `approved_
against_outcome_status`. Both captured from the REQUEST route's own LOCKED re-read (`lockedCase`,
inside the advisory-locked transaction) — never the unlocked preflight read — and included in the
canonical payload hash (`overridePayload`, now 8 fields) bound into the IAM-02 approval via
`current_payload_hash` at execute-verify.

The APPLY route's final transaction compares the case's CURRENT `current_outcome_id`/`current_
outcome_status` against this stored snapshot — BY ID, not merely by status, so a same-status-
different-version drift (e.g. a corrective re-verification landing a NEW row with the identical
status) is also caught, which a status-only comparison would miss. `caseIsOverridable` is re-run as
defence-in-depth (logically redundant when the ID/status snapshot already matches — see INFO-24).

On any mismatch: no `cdd_outcome` insert, no `kyc_case` pointer update, no `manual_override_
applied` event; the override row transitions `requested`→`failed` (a NEW reachable status value —
`failed` is never the `one_open_per_case` index predicate value, so it vacates the index exactly
like `applied` already does; no MED-2-style re-entry hazard), atomically with a `kyc1.manual_
override_refused` audit (`reason_code: case_state_changed`, metadata exactly `{override_id,
case_id, reason_code}` — no approved-against/current-outcome ID, no `requested_by` value). The
route returns `KYC1_CASE_INVALID_STATE`/409 (reused — a CASE-state problem, mirroring the request
route's own identical semantic split). A replacement request may be created immediately for the
case's new state. `approval_id`/`applied_outcome_id`/`decision_token_hash` all remain `null` on the
failed row — the raw decision token is never stored regardless. If the refusal audit itself fails,
the WHOLE transaction rolls back (the row stays `requested`, never silently `failed` without its
audit) and the caller receives the existing `KYC1_AUDIT_REQUIRED` — fail-closed, atomic, no special
new error-handling code (the existing outer `catch` already converts any non-`Kyc1Error` to
`KYC1_AUDIT_REQUIRED`).

10 new integration tests (TEST A–H plus an audit-metadata sweep) added to `tests/integration/
kyc1-db.test.ts`; `overridePayload`'s unit tests extended to the 8-field shape. Regression: all 196
pre-existing Phase 3B tests passed unmodified except one raw-SQL grant-fixture INSERT that needed
the two new NOT NULL columns added (not a behavioral change).

## 28. Independent Opus review of the MED-3 patch

**Verdict: MED-3 CLOSED.** Opus independently replayed the ORIGINAL exploit verbatim against the
patched code (not the implementer's own tests) and confirmed it is genuinely blocked: the applied
409/`KYC1_CASE_INVALID_STATE`, `cdd_outcome` history stops at the adverse `fail` row (no `pass`
masking), the override row is `failed` with `approval_id`/`applied_outcome_id`/`decision_token_
hash` all `null`, exactly one `manual_override_refused` event with the exact restricted metadata,
the case is NOT recompute-locked (the adverse evidence remains actionable), and a replacement
request succeeds. Two additional independent probes: a same-status/different-outcome-ID variant
proving the fix binds by ID, not merely by status (a status-only comparison would have wrongly
passed); and a forced-audit-failure probe (revoking `INSERT` on `foundation.outbox_event`)
confirming the failed-state transition and its audit commit atomically — the override row remained
`requested`, not silently `failed` without its audit, when the audit write was forced to fail.

**INFO-23 (new)**: on a MED-3 case-state-drift refusal, IAM-02 may already have successfully
verified and CONSUMED the decision token, yet KYC-01 records `approval_id`/`decision_token_hash` as
`null` on the failed row — KYC-01 alone cannot reconstruct "was an approval issued and spent" for a
refused override; that evidence lives solely on IAM-02's side. Assessed as accepted safe-minimal
behaviour, not a defect: recording an approval linkage on a row that was never applied would
misleadingly imply the approval authorised something. A replacement request requires a fresh
approval cycle regardless (the consumed token cannot be reused).

**INFO-24 (new)**: the apply route's defence-in-depth `caseIsOverridable` re-check is logically
redundant whenever the exact approved-against ID/status snapshot still matches (if nothing changed,
the same case-outcome row already validated overridable at request time is still current) — the
ID/status snapshot comparison is the actual MED-3 control, correctly documented as such in-code
rather than presented as a second independent control.

**LOW-10 (new)**: the request route's self-override check runs BEFORE the IAM-02 permission check
— as specified by the accepted Phase 3B design (self-override must skip IAM-02 entirely when
blocked). An unpermissioned shared-token caller can distinguish "`requested_by` matches a manual
evidence provider on this case" from "it doesn't" — a one-bit manual-verifier-attribution oracle.
Non-blocking; implemented exactly as designed, not a deviation found by review.

**LOW-11 (new)**: case-existence/state validation also precedes the IAM-02 permission check in the
request route — an unpermissioned caller can distinguish missing-case/invalid-state/permission-
denied. Materiality assessed as low: equivalent case/outcome data is already available from
KYC-01's own intentionally-ungated internal routes (D6).

**INFO-20 (new)**: the self-override refusal audit remains best-effort (unchanged from Phase 3B's
own design) — a self-override attempt can go unaudited if the outbox write fails, though no state
is ever mutated by that specific refusal.

**INFO-21 (new)**: `cancelled` remains schema-present and unreachable; no decorative error code was
added for it (only `failed` became newly reachable, via the MED-3 fix).

**INFO-22 (new)**: the Phase 3B implementation report's own 13-vs-11 file-count discrepancy was
independently confirmed to be bookkeeping only — 13 total (5 created, 8 modified); the 11-file
sweep had excluded migrations 045/046 themselves by using migration 046 as the `-newer` cutoff. No
missing or extra change.

## 29. Findings register — cumulative (Phase 1 + Phase 2A + Phase 2B + Phase 3A + Phase 3B)

**Low (all non-blocking, carried forward):** LOW-1 (evidence-ref base64-heuristic imprecision),
LOW-2 (concurrent evidence POST 503-vs-409), LOW-4 (SQL-order test gap), LOW-8 (`delivered_at_utc`
semantics, cosmetic), LOW-9 (caller-asserted `actor_id`/`requested_by` — now load-bearing for
override SoD, LOW-10/LOW-11 are direct consequences), **LOW-10** (self-override-before-IAM-02
attribution oracle, by design), **LOW-11** (case-existence-before-IAM-02 oracle, low materiality)
— all unchanged except LOW-10/LOW-11, new this phase.

**Informational:** INFO-1 (closed within KYC-01 by D5, repo-wide remains open), INFO-3, INFO-4,
INFO-5, INFO-7, INFO-8, INFO-9 (now also true of migrations 045/046's own down/up round-trip),
INFO-10, INFO-11, INFO-12, INFO-13, INFO-14 (all Phase 2B, unchanged), INFO-15, INFO-16, INFO-19
(Phase 3A, unchanged — **INFO-17 and INFO-18 now CLOSED**, §25). **INFO-20–INFO-24 (new)** — see
§28.

**D1 limitation — now the LEADING Phase 4 planning input, not merely restated:** KYC-01 publishes
over its own case set only and cannot prove CLT-01's authorised-party roster is complete. This is
materially higher-risk than at Phase 2B/3A: a human-approved override-to-`pass` is now
IMPLEMENTED, can be explicitly published and delivered to CLT-01, and incomplete authorised-party
coverage could mean approval was granted over an incomplete KYC case set.

**Ordering residual (named, queryable, accepted, unchanged):** if a superseding publication is
itself never delivered, CLT-01's rollup retains the prior value.

**Registry-only SoD limitation (named, tested, accepted, unchanged):** for a case whose
verification results are all `source_type='registry'`, the self-override check is structurally
vacuous; SoD degrades to IAM-02's own requester≠approver rule alone.

**D6 residual (named, accepted, unchanged):** `publish-outcome`/`deliver` remain internal-
service-token-only, NOT retro-gated with IAM-02 — only the override request/apply routes are
IAM-02-permissioned this phase.

Repo-wide `timestamptz` typing outside KYC-01 remains a separate platform-hardening item.

**Phase 3C is explicitly skipped** — Phase 3 is complete through Phase 3B. **Next step: KYC-01
Phase 4 planning** (no Phase 4 implementation has started).

## 30. Test / build summary (Phase 3B)

| Check | Result |
|---|---|
| `npx tsc -b --force` | clean |
| KYC-01 tests | 386/386 |
| Full suite | 2006/2006 (94 files) |
| Migrations | 001→046 clean on a fresh disposable Postgres |
| Grant files | all 8 clean (fnd/iam/iam2/sec1/cfg1/clt1/aml1/kyc1) |
| Migrations 045/046 down/up | clean, both `approved_against_*` columns restored, grants re-applied |
| Same-DB rerun | clean |
| Migration 047 | does not exist |
| Route count | 16 |
| Table count | 6 |
| KYC-01 error code count | 22 |
| IAM-02 `kyc1.*` permissions | 2 |
| `role_permission` seed | none |
| Distinct `kyc1.*` audit event types | 20 |
| CLT-01/AML-01 source changed | no |

No code was written or changed during either Opus review pass (Phase 3B review, MED-3 patch
review) — both were review-only, including the MED-3 patch's own verbatim exploit-replay
verification (a fresh disposable database, discarded afterward).

## 31. Scope implemented (Phase 4B — authoritative roster completeness, publication binding, atomic delivery integration, coordinated with CLT-01 Phase 4A.1)

Closes D1 for TECHNICAL roster-binding consistency (operational completeness remains open — see
§35). Depends on CLT-01 Phase 4A (roster contract) and CLT-01 Phase 4A.1 (migration
`047_clt1_atomic_kyc_roster_binding.cjs`, the shared advisory-lock + `expected_roster_hash` atomic
receipt contract — see `CLT-01_IMPLEMENTATION_NOTES.md` §17), accepted as a coordinated
prerequisite in the same combined review as this phase.

Migration `048_kyc1_publication_roster_binding.cjs`: five nullable columns on the EXISTING
`kyc1.outcome_publication` table (no new table) — `roster_hash` (CLT-owned digest, format-checked
`^sha256:[0-9a-f]{64}$`), `required_party_count`/`evaluated_party_count` (0–500 bound), 
`contributing_party_ids` (jsonb array), `roster_fetched_at_utc`. Six CHECK constraints: hash
format; count bounds; `contributing_party_ids` is a genuine JSON array; all-or-none binding (a
publication with SOME of the five set and others NULL is a database-enforced impossibility);
`evaluated_party_count = required_party_count`; `jsonb_array_length(contributing_party_ids) =
required_party_count`. Every pre-048 row is genuinely all-NULL (never backfilled). Sort-order and
duplicate-freedom of `contributing_party_ids` are deliberately left to application code + tests,
not a DB constraint (mirrors migration 043's own `contributing_case_ids`/`contributing_outcome_ids`
precedent) — guaranteed upstream by `lib/roster-client.ts`'s own strict shape validation (codepoint
ordering, duplicate-ID rejection), not by `computeRosterBoundOutcome` itself. All five columns are
INSERT-once: `kyc1_runtime_grants.sql`'s existing column-scoped UPDATE grant is UNCHANGED and does
not list any of them — independently confirmed immutable under the real `role_kyc1_runtime` role
(all five attempted UPDATEs individually denied, `42501`).

New KYC-owned CLT-01 roster client (`lib/roster-client.ts`, F3(c)-clean, never imports
`services/clt1/src/**`) wraps CLT-01's ONE existing Phase 4A roster route
(`GET /internal/clt1/applications/:application_id/kyc-roster`) only. Exhaustive shape validation,
in order, returning a single collapsed `ok:false` discriminant on the FIRST violation (never a
partially-trusted roster): requested-application-ID echo, known `application_status`, known
`primary_subject_type`, array shape, `party_count === authorised_parties.length`, 0–500 bound,
`roster_hash` format, non-empty unique `authorised_party_id` values in strict codepoint order
(`<`, never `localeCompare`), known `party_type`/`authority_status`, integer `version ≥ 1`. CLT-01
remains the sole owner/computer of `roster_hash` — this client only format-validates it. 5-second
`AbortSignal.timeout`; no `actor_id`; no token/PII logging. Timeout, connection failure, malformed
JSON, malformed shape, and any non-2xx (including CLT-01's own `CLT1_KYC_ROSTER_TOO_LARGE`/409) are
ALL treated identically as `ok:false` — no per-cause distinction reaches the caller.

`lib/authoritative-outcome.ts` gained `computeRosterBoundOutcome`. Reuses the EXISTING
`selectAuthoritativeCasePerAnchor` (exported for this purpose) for anchor resolution — no second
authority algorithm was introduced. `computeAuthoritativeOutcome` itself is completely unchanged
(proved byte-for-byte via a dedicated side-by-side regression test), though as of this phase no
live route calls it any longer (see §32 LOW-1). Required-party set is exactly `authority_status` ∈
{pending, active, restricted, suspended} — `rejected`/`revoked` are excluded even with zero
matching KYC-01 case (independently verified: a roster listing all six statuses, with cases only
for the four required ones, publishes with `required_party_count=4`). Roster-to-KYC matching is
exact codepoint string equality only (`case.partyId === authorisedPartyId`) — never fuzzy,
positional, count-based, or `party_type`-based; a case-sensitivity mismatch (`party_1` vs
`Party_1`) is never fuzzy-matched, surfacing as `party_missing`. Primary resolution distinguishes
three independently-reachable reason codes: `primary_missing` (no primary-shaped case exists at
all), `primary_type_mismatch` (only the wrong type exists), `anchor_ambiguous` (both individual AND
entity cases exist simultaneously — refused rather than guessed). A required party with no KYC-01
case (`party_missing`), or a case with no resolved outcome (`party_outcome_pending`), ALWAYS blocks
publication outright — **never** downgraded to `remediation_required` (a deliberate tightening
from Phase 2A's own party-anchor folding behaviour, per the approved Phase 4B compliance decision).
Extra KYC-01 cases (a `party_id` not on the roster) are excluded from the aggregate entirely,
counted (`extraCaseCount`), never blocking, and cannot satisfy a different required `party_id`.
Complete-roster aggregation is unchanged worst-wins: any `fail` → `fail`; else any
`remediation_required` → `remediation_required`; else `pass`.

`POST .../publish-outcome`: roster fetched and application-status-eligibility (`under_review`)
confirmed OUTSIDE any transaction, BEFORE the SAME LOW-5 `pg_advisory_xact_lock` as the
transaction's first statement — independently verified empirically (an independent connection's
`pg_try_advisory_lock` on the same key succeeds while the roster HTTP call is deliberately held in
flight by a test stub, proving the lock is not yet held during the fetch). A successful publication
binds all five roster fields into the SAME immutable INSERT as the existing aggregate evidence.
Refusals still resolve-once: audit committed inside its own transaction, then thrown outside it, so
refusal evidence is durable even though the caller receives an error.

`POST .../deliver` extends the existing LOW-7 staleness check (`detectStaleness`). A legacy
(pre-048, `roster_hash IS NULL`) publication refuses (`KYC1_OUTCOME_PUBLICATION_STALE`,
`reason_code: legacy_publication_unbound`) via an UNLOCKED pre-read, before any HTTP call —
`roster_hash` is INSERT-once and immutable, so an unlocked read carries no race risk, unlike
`status`. The current roster is re-fetched outside TX1; TX1 re-locks the row, then — if the roster
fetch succeeded — compares, in priority order, each independently reachable: (1) the required-party
ID SET (comparing derived IDs directly, more specific than a hash-mismatch alone) →
`required_party_set_changed`; (2) `roster_hash` → `roster_changed`; (3) a freshly-recomputed live
aggregate's publishability → `contributing_outcome_changed`; (4) live vs. stored contributing
case/outcome IDs → `contributing_outcome_changed`; (5) live vs. stored `aggregate_status` →
`aggregate_changed`. Any mismatch refuses BEFORE the CLT-01 delivery HTTP call.
`expected_roster_hash` is sourced EXCLUSIVELY from the just-re-locked publication row — never
request body, query parameter, actor identity, or a freshly re-fetched roster's own hash.

`lib/clt1-client.ts`: `DeliverKycOutcomeInput` gained required `expectedRosterHash`, sent as
`expected_roster_hash` in the outcomes POST body (alongside the existing `outcome_type`,
`outcome_status`, `source_module`, `created_by` — no party IDs, no counts, no roster, no PII ever
sent). `Clt1DeliveryResult` gained a `{kind:"stale"}` variant, detected as its own discriminant
(`res.status===409 && failureReasonCode==="CLT1_KYC_ROSTER_STALE"`) BEFORE the generic `"rejected"`
fallback — CLT-01's own atomic-receipt stale-roster rejection (Phase 4A.1) is mapped to
`KYC1_OUTCOME_PUBLICATION_STALE`, NEVER `KYC1_CLT_DELIVERY_FAILED`/`KYC1_CLT_UNAVAILABLE`/a generic
502 — verified both via a stub and via a real, listening CLT-01 server end-to-end (stale rejection
→ explicit republish against the changed roster → successful delivery; a blind retry of the SAME
now-superseded publication_id remains refused). MED-2's three-way terminal write
(`succeeded`/`failed`/`superseded`) is preserved unchanged, extended with the new
`clt_atomic_roster_rejection` failure reason code for TX2's own bookkeeping. No success audit is
ever emitted on a stale refusal.

Zero new KYC-01 error codes (still exactly 22) — every Phase 4B refusal reuses
`KYC1_OUTCOME_NOT_PUBLISHABLE`/`KYC1_OUTCOME_PUBLICATION_STALE`/`KYC1_CLT_UNAVAILABLE` with a
specific, bounded `reason_code`. Zero new audit event types (still exactly 20, independently
confirmed by querying the outbox after the full suite run) — `contributing_party_ids` (opaque CLT
`authorised_party_id` values only, never `party_reference`/names/PII) appear only in immutable
publication evidence, never copied into general audit metadata (independently confirmed: zero
outbox rows containing `contributing_party_ids`/`authorised_party_id`). Manual overrides (Phase 3B)
interact correctly and were not touched: overriding the PRIMARY case cannot substitute for a
missing required PARTY; overriding one required party cannot satisfy a different `party_id`; a
roster change after an override-driven publish correctly makes the publication stale at deliver
time; MED-3's approved-against outcome-snapshot binding is unaffected. The Phase 2A/2B MED-1
deterministic tie-break guard tests remain intact and unmodified (independently re-run in
isolation: 6/6 green).

## 32. Independent Opus review of the combined CLT-01 Phase 4A.1 + KYC-01 Phase 4B implementation

**Verdict: ACCEPT COORDINATED PHASE 4A.1 + PHASE 4B — WITH NON-BLOCKING FINDINGS** (0
Critical/High/Medium; 2 Low; 4 Informational; no fixes required before acceptance).

Scope independently verified via file-modification-time forensics (this repository has no git):
Phase 4A.1's window (migration 047, `clt1_runtime_grants.sql`, 6 CLT-01 source files) and Phase
4B's window (13 files: 3 created, 10 modified, exactly as scoped) are cleanly separated in time,
with zero CLT-01 source files falling inside the Phase 4B window — confirming no CLT-01 runtime
source, migration 047, or CLT-01 grants were touched during Phase 4B. Status documents' own
modification times predate both implementation windows — confirmed untouched before this sync.

**LOW-1**: `computeAuthoritativeOutcome` is now dead production code — no live route calls it,
following this phase's route-layer switch to `computeRosterBoundOutcome`. Retained as the
regression oracle proving the old computation remains byte-for-byte unmutated, which is a
legitimate reason to keep it, but its live/dead status is currently invisible to a reader. Carry
forward: label it clearly as legacy/test-oracle code, or remove it, during later housekeeping.

**LOW-2**: `routes/outcome-publication.ts`'s own opening header sentence still names
`computeAuthoritativeOutcome` as what publish computes; later lines in the same comment correct
this, but the first sentence is stale. Carry forward as documentation-only housekeeping.

**INFO-1**: `lib/roster-client.ts` computes four distinct fetch-failure reason codes
(`clt1_roster_timeout`/`_unreachable`/`_malformed_response`/`_unavailable`) but neither call site
in `routes/outcome-publication.ts` reads them — both hardcode `"roster_unavailable"`. Fail-closed
behaviour is correct and intentional; an operator debugging a roster failure gets no signal
distinguishing "CLT-01 down" from "CLT-01 returning garbage."

**INFO-2**: migration 048's own header comment attributes `contributing_party_ids`'s
deduplication to `computeRosterBoundOutcome`, but that function does not itself deduplicate — the
invariant is enforced one layer up, by `lib/roster-client.ts`'s `validateRosterShape` rejecting any
roster containing a duplicate `authorised_party_id` before it ever reaches aggregation. The
property holds in production; the attribution in the migration comment is inaccurate.

**INFO-3**: on a `party_missing` refusal, `computeRosterBoundOutcome` reports `extraCaseCount: 0`
unconditionally (the extra-case loop is only reached on the `publishable:true` path) — so a
mistyped party ID surfaces only as "missing required," never also as "extra case" in the same
refusal's diagnostics. The block itself is correct; only refusal diagnostics are less informative
than they could be.

**INFO-4** (process, not code): the SEC-01 test-environment incident (see §33) showed the required
`SEC1_INGEST_TOKEN_*` values are discoverable only by reading a test file's own header comment.
Worth pinning in `.env.example` or a documented test-bootstrap script.

None of these findings affect security posture, data integrity, or the acceptance criteria. No
fixes were required or applied before acceptance.

**Independently re-verified, empirically, not taken on report**: the MED-1 lock-position guard
(8 anchors covering 10 runtime paths, brace-balanced extraction, genuine negative control); the
roster client's full 12-rule validation; `computeRosterBoundOutcome`'s required-party-status
filter, exact-match rule, and blocking-not-downgrading behaviour; the publish route's roster-fetch-
before-lock ordering (via a live advisory-lock-freedom probe); the delivery route's staleness
priority order and `expected_roster_hash` provenance; the CLT-01 stale-mapping discriminant; grant
immutability under the real runtime role (all five columns); migration 048's six CHECK constraints
(each individually violated and confirmed rejected); migration 048 down/up round-trip (columns
removed/restored, rows preserved, migration 047 confirmed unaffected); and the D1 pre-approval
reachability gap (structurally confirmed: all 11 CLT-01 authorised-party routes require an
approved `active_limited` `client_profile`, created only at final approval).

## 33. SEC-01 test-environment incident — correction of an initial misclassification

The Phase 4B implementer's own final report stated 66 failures remained in
`sec1-db.test.ts`'s Phase 5 security-monitoring-rule-engine section, and characterized them as
"pre-existing/unrelated," reproduced by re-running that one file in isolation on a fresh disposable
Postgres. The reproduction was real; the attribution was wrong. Independent Opus investigation
found: `sec1-db.test.ts`'s own header comment documents that migration 008 must be run with
specific token values (`test-fnd01-ingest-token-it`/`test-iam01-ingest-token-it`/
`test-iam02-ingest-token-it`) that the test file itself hardcodes; migration 008 seeds the expected
token *hashes* at migration time; the implementer's own session had instead run migration 008 with
those same three words TRANSPOSED (`test-ingest-token-fnd01-it`, etc.) — producing a hash mismatch
and a 401 on every authenticated SEC-01 call, which cascades into every downstream assertion in
that section. Proven, not merely asserted: `sec1-db.test.ts` alone, on a genuinely fresh database,
reproduced all 66 failures as `401`s with the transposed values; with the documented canonical
values, the SAME file passed 139/139, and the complete canonical suite passed 2195/2195.
**Classification: unrelated harness/environment invocation issue, independently proven** — not a
Phase 4A.1/4B regression, and not an inherent pre-existing SEC-01 code defect. See §34 for the
canonical command/environment/result.

## 34. Findings register — cumulative (Phase 1 + Phase 2A + Phase 2B + Phase 3A + Phase 3B + Phase 4B)

All Phase 1/2A/2B/3A/3B findings (§29) remain unchanged and are carried forward. Phase 4B adds:
**LOW-1** (`computeAuthoritativeOutcome` dead production code), **LOW-2** (stale header sentence),
**INFO-1** (collapsed roster-fetch reason codes), **INFO-2** (migration-048-header dedup
attribution), **INFO-3** (`party_missing` refusal omits `extraCaseCount`), **INFO-4** (pin
canonical SEC1_INGEST_TOKEN values) — all §32 above, none blocking.

**D1 (authorised-party-roster-completeness)**: TECHNICAL roster-binding consistency is now
enforced end to end (publish-time completeness gate, immutable roster-hash binding, delivery-time
revalidation, CLT-01's own atomic receipt and approval recheck). **Status as of KYC-01 Phase 4B
itself, restated below for accuracy after a later CLT-01-side change:** at the time Phase 4B was
implemented and reviewed, all 11 CLT-01 authorised-party routes required an approved
`active_limited` `client_profile`, created only at final approval, so every supported pre-approval
workflow produced an empty roster — the completeness gate was technically correct but evaluated an
organically empty roster, and every non-empty-roster test in this phase seeded via raw SQL/test
fixtures, explicitly labeled as proving technical consistency only, not organic-workflow
completeness.

**Cross-reference update (post-Phase-4B, coordinated with CLT-01 — recorded here, not
re-litigated):** CLT-01 Phase 4A.2A (pre-approval authorised-party capture) was implemented and
independently accepted by Opus (after one reject/remediate/re-review cycle closing a lifecycle
TOCTOU) — see `CLT-01_IMPLEMENTATION_NOTES.md` §18-19 for the full detail. Pre-approval
authorised-party capture became organically reachable without raw-SQL seeding. The remaining gap —
deterministic KYC anchor creation and one complete organic CLT-to-KYC workflow — was closed by
Phase 4A.2B (KYC-01's own `POST .../roster-sync` route, implemented on the KYC-01 side and
detailed fully in §36 below). **D1 is now closed** — see §36 for the exact accepted wording. KYC-01
itself is now accepted through Phase 4B PLUS Phase 4A.2B; this cross-reference is superseded by
§36, kept here only for the historical record of Phase 4B's own point-in-time status.

## 35. Test / build summary (Phase 4B, combined coordinated baseline with CLT-01 Phase 4A.1)

| Check | Result |
|---|---|
| `npx tsc -b --force` | clean |
| KYC-01 integration tests | 237/237 |
| New roster-client unit tests | 25 |
| New authoritative-outcome unit tests | 19 (58 total in file) |
| New real-CLT-01 end-to-end test | 1 (stale-roster → republish → deliver) |
| Canonical combined full suite | **2195/2195 (96/96 test files)** |
| Migrations | 001→048 clean on a fresh disposable Postgres |
| Migration 047 | intact, unmodified by Phase 4B |
| Migration 048 down/up | clean, rows preserved, no historical-row rewrite |
| Grant files | all 8 clean |
| Same-DB targeted KYC+CLT rerun | 606/606 |
| Migration 049 | does not exist |
| Migration head | 048 |
| Route count | 16 (unchanged) |
| Table count | 6 (unchanged) |
| KYC-01 error code count | 22 (unchanged) |
| IAM-02 `kyc1.*` permissions | 2 (unchanged) |
| `role_permission` seed | none |
| Distinct `kyc1.*` audit event types | 20 (unchanged) |
| CLT-01 source changed | no |
| Status documents changed before this sync | no |

**Canonical test environment** (pin these — do not re-derive; see §33):
`SEC1_INGEST_TOKEN_FND01=test-fnd01-ingest-token-it`,
`SEC1_INGEST_TOKEN_IAM01=test-iam01-ingest-token-it`,
`SEC1_INGEST_TOKEN_IAM02=test-iam02-ingest-token-it`. Canonical command: `npm test`. Canonical
result: `Test Files 96 passed (96)` / `Tests 2195 passed (2195)`.

**KYC-01 — accepted implementation baseline through Phase 4B** (superseded by §36 below, kept
here as the historical point-in-time record of this specific sync).

## 36. Scope implemented (Phase 4A.2B — coordinated KYC anchor-sync integration; D1 closure)

`POST /internal/kyc1/applications/:application_id/roster-sync` — internal KYC service token only,
no IAM-02 permission, no caller-supplied actor identity. Fetches CLT-01's accepted Phase 4A roster
contract over HTTP outside any transaction, requires `application_status='under_review'` (learned
from the same roster fetch, no separate CLT-01 call), and — inside one transaction, under the
shared application-scoped advisory lock — creates exactly one KYC `authorised_party` case for
every party whose `authority_status` is `pending`/`active`/`restricted`/`suspended` and who has NO
existing `kyc_case` row at all for `(application_id, 'authorised_party', party_id)`. Any party
with ANY existing case, in ANY status — `pending_documents`, `remediation`, `completed` (pass,
fail, or remediation-required), or a completed case with an already-open corrective case — is
skipped, never re-created. This is the load-bearing correctness property: creating a fresh,
uncomputed case over an anchor whose latest case is already `completed`/`pass` would make that
anchor (and therefore the application) silently unpublishable again on the very next routine sync.

**Shared case-creation extraction** (`lib/kyc-case-creation.ts`): the single implementation of
case-id generation, the `kyc_case` INSERT, the default-checklist INSERT loop, and the
`kyc1.case_created` audit — used by both the pre-existing `POST /internal/kyc1/handoffs` route and
the new roster-sync route. Never opens or commits its own transaction; makes no external HTTP
call; propagates any audit-write failure so the caller's own transaction rolls back atomically
(independently proven: revoking `INSERT` on `foundation.outbox_event` mid-sync produces
`KYC1_AUDIT_REQUIRED` with zero surviving case/checklist rows, and a clean retry after re-granting
creates correctly).

**Audit separation** (deliberate): the shared creator emits ONLY `kyc1.case_created`. The
pre-existing handoff route alone still emits `kyc1.handoff_received`, first, in the same
transaction, before calling the shared creator — behaviour-preserving, confirmed by regression.
Roster-sync NEVER emits `kyc1.handoff_received` (it would misrepresent an operation with no
handoff trigger); it emits `kyc1.case_created` once per created anchor plus exactly one summary
`kyc1.roster_sync_processed` event per call, `result: "success"` or `result: "blocked"`, carrying
only bounded, non-PII metadata (`application_id`, `roster_hash`, `required_party_count`,
`created_count`, `skipped_count`, `primary_anchor_present`, and a bounded `reason_code` on
refusal) — never party IDs, case IDs, `party_reference`, or the full roster.

**Shared roster controls** (`lib/roster-controls.ts`): the required-authority-status set
(`pending`/`active`/`restricted`/`suspended`; `rejected`/`revoked` excluded) and the
application-scoped advisory lock (`kyc1.outcome_publication:<application_id>`, unchanged
namespace) were extracted out of `routes/outcome-publication.ts` into this shared module — both
outcome publication and roster-sync now consume the identical exported definitions, never two
independently-maintained copies. The lock now serialises three operations for one application:
roster-sync, outcome publication, and outcome delivery.

**Idempotency and concurrency** (independently adversarially probed by Opus, not merely asserted):
a repeated sync creates nothing new; a completed-case retry leaves the authoritative selection
unchanged and never regresses a publishable application to unpublishable; an open-corrective-case
retry creates no third case; two concurrent sync calls, proven via a genuine advisory-lock-hold
barrier (×6), always converge to exactly one creator and one clean no-op, with zero duplicate
cases/checklists/audits and zero `40P01`; a real concurrent race between the handoff route and
roster-sync for the SAME anchor (×20 natural races plus one deterministic forced-conflict probe)
never produces two active cases, is bounded by the pre-existing partial unique index as a
backstop, rolls the whole sync transaction back atomically on the rare `23505`, and always
converges cleanly on retry — the handoff route does not need to take the roster-sync lock.

**Primary anchor**: roster-sync creates authorised-party cases only, never an individual/entity
primary case. Its own `primary_anchor_present` field is a plain existence check, informational
only — it never blocks sync, and `routes/outcome-publication.ts` remains the sole authority for
`primary_missing`/`primary_type_mismatch`/`anchor_ambiguous` (independently confirmed:
`primary_anchor_present` can read `true` for an ambiguous application while publish correctly
still refuses `anchor_ambiguous` — informational imprecision only, no compliance-decision risk).

**Phase 4B preservation** (independently re-run, substantively unchanged): roster-sync computes no
outcome, publishes nothing, delivers nothing, approves nothing. Missing required anchor still
blocks publication; missing required outcome still blocks; exact `party_id` matching remains
(a near-miss id never satisfies a required party, independently proven); extra cases remain
non-blocking; worst-wins aggregation, immutable publication evidence, delivery-time revalidation,
`expected_roster_hash` sourced only from the locked publication row, CLT-01's own atomic
stale-roster rejection, and the final-approval roster-hash recheck all remain intact.

**Roster-change behaviour** (unchanged design, no second CLT-01 fetch, no distributed lock, no
historical mutation): a party added to CLT-01's roster after a sync is picked up only by the next
sync — publish blocks with `party_missing` in the meantime. A party revoked after sync leaves its
KYC case as a non-blocking "extra" — never rewritten, never deleted. A replacement party
(new `authorised_party_id`) receives its own new anchor on the next sync; the old case remains
immutable historical evidence.

**New error**: `KYC1_APPLICATION_INVALID_STATE` (409, "This application is not in a state that
permits roster synchronisation.") — exactly one runtime purpose, exactly one throw site: roster-
sync against a validated CLT-01 application whose status is not `under_review`. Never reused for
anything else; roster-fetch failure itself continues to use the existing `KYC1_CLT_UNAVAILABLE`.
KYC-01 error catalogue: 22 → **23**.

**New audit event**: `kyc1.roster_sync_processed` — KYC-01 audit-event inventory: 20 → **21**,
still proven by an exact-equality inventory assertion (see MEDIUM-1 below for why its position in
the test file mattered).

**Organic, no-raw-SQL D1-closing end-to-end test**
(`tests/integration/kyc1-clt1-roster-sync-e2e-real.test.ts`): a real CLT-01 app and a real KYC-01
app run in one process (one throwaway login role granted membership in both `role_clt1_runtime`
and `role_kyc1_runtime` — a test-fixture convenience that changes neither runtime role's own real
grants; an inject-fetch adapter lets KYC-01's `clt1FetchImpl` reach CLT-01's real route handlers
without a listening socket — independently confirmed this bypasses no real authentication, schema
validation, or business logic). Drives, over real HTTP only: create application → submit → start
review → capture an authorised party through CLT-01's accepted Phase 4A.2A maker-checker routes
(distinct maker/checker identities) → create the primary KYC case through the existing handoff
route → invoke KYC roster-sync (creating the authorised-party KYC case with `party_id` exactly
equal to the CLT-generated `authorised_party_id`) → complete evidence/checklist/verification/
outcome for both the primary and party cases → create the required CLT-01 AML handoff marker →
receive `aml_sanctions`/`pep_adverse_media`/`risk_rating` outcomes → publish the roster-bound KYC
outcome → deliver it atomically to CLT-01 (CLT-01's real migration-047 atomic-receipt contract) →
request and apply final CLT-01 approval → `client_profile` created, roster hash bound. Zero raw
SQL `authorised_party`/`kyc_case`/`outcome_publication`/`client_profile` inserts anywhere in the
flow; no hand-written roster hash; no caller-supplied fake party id; no maker-checker bypass;
`verifyPool` used only for read-only final assertions.

**Independent Opus review of the initial implementation**: runtime found correct across every
acceptance-critical property above, with exactly one blocking finding — **MEDIUM-1, a
test-infrastructure defect, not a runtime defect**: the KYC-01 suite's exact 21-event global audit
inventory assertion was declared BEFORE the Phase 4A.2B test block that first organically emits
`kyc1.roster_sync_processed`, so on a genuinely fresh disposable Postgres the assertion failed
(2279/2280 tests, 96/97 files) — a warm/already-populated database masked this, since a prior
run's event rows were already present when the assertion ran.

**Remediated (KYC-01 test file only, `tests/integration/kyc1-db.test.ts`) and independently
re-verified → MEDIUM-1 CLOSED.** The exact-equality assertion — unweakened, the identical 21-member
set — was relocated to a new, final `describe("FINAL KYC AUDIT EVENT INVENTORY")` block executing
after every KYC-01 event-emitting test in the file, including the entire Phase 4A.2B block. No
event was manually seeded; no runtime source changed. Independently re-verified on TWO
separately-provisioned, genuinely fresh disposable Postgres databases — the second created and
used for nothing but the canonical suite, to rule out residual-state dependence — both returning
canonical `npm test` **2280/2280 across 97/97 files**.

**Accepted canonical baseline**: `npx tsc -b --force` clean; KYC-01 integration **273/273**;
KYC-01 unit **38/38**; organic CLT-to-KYC E2E **1/1**; CLT-01 regression **415/415** (fully
unchanged, confirming zero CLT-01-side runtime impact); AML-01 regression **191/191**; same-DB
targeted CLT+KYC rerun **887/887**; migrations 001→048 clean; all 8 grant files clean; migration
head **048**; no migration 049; KYC-01 error codes **23**; KYC-01 audit event types **21**; KYC-01
route handlers **17**; KYC-01 tables unchanged **6**; KYC-01 IAM-02 `kyc1.*` permissions unchanged
**2**; no `role_permission` seed; grants unchanged; CLT-01 runtime source, migrations, and grants
entirely unchanged by this phase.

**2 Low** (non-blocking, both independently proven correct by adversarial probe despite lacking a
dedicated test in the implementation suite — coverage housekeeping, carried forward): roster-
sync's own audit-failure rollback, and the handoff-versus-roster-sync `23505` race path. One
additional Low: `primary_anchor_present` may report `true` when both an individual and an entity
primary case exist for one application — informational response field only, no compliance
decision is made by sync itself, and publication still correctly refuses `anchor_ambiguous`.

**4 Informational** (carried forward, none blocking): the pre-existing held-state dead end (no
resume/unhold transition exists anywhere) is unchanged and remains an unrelated, separate CLT-01
lifecycle carry-forward; the handoff route's relative audit ordering
(`handoff_received` before `case_created`) is preserved but its exact SQL statement position
changed during the shared-service extraction (a comment-wording imprecision only, no behavioural
difference); the combined-role E2E test fixture proves the full route/business workflow but does
not, on its own, prove cross-schema grant isolation — the dedicated KYC-01 grant-boundary tests
under the real `role_kyc1_runtime` role remain the authority for that; `entity_type="roster_sync"`
is the first KYC-01 audit `entity_type` value with no corresponding physical table, which SEC-01's
free-form `entity_type` field permits safely.

**Known, pre-existing, unrelated same-database limitation** (not a Phase 4A.2B finding, recorded
for completeness): a SECOND consecutive full-suite run against an already-used database reproduces
the documented one-time IAM-01/IAM-02/CFG-01 bootstrap-idempotency signature
(`iam-db`/`iam2-db`/`cfg1-db`, 22 failures) — KYC-01, CLT-01, and AML-01 all remain fully green in
that same run. Canonical Phase 4A.2B acceptance rests exclusively on the two independently
fresh-database runs recorded above, never on a same-database rerun.

**D1 (authorised-party-roster-completeness) — closed. Technical roster-binding consistency is
enforced. Pre-approval authorised-party capture is operational. Deterministic KYC anchor creation
is operational. One complete organic CLT-to-KYC workflow — application creation, submission,
review, authorised-party capture, KYC roster sync, KYC evidence and outcome, roster-bound
publication, atomic delivery, and final approval — is proven end to end with no raw-SQL
authorised-party or KYC-case seeding.**

**KYC-01 — accepted implementation baseline through Phase 4B plus accepted Phase 4A.2B
deterministic authorised-party anchor sync.** KYC-01 reaches the planned accepted completion point
for this coordinated D1 workstream; still recorded as a partial module pending independent
confirmation that no later KYC-01 phases remain on its own module roadmap. `MODULE_STATUS.md`,
`PROJECT_HANDOVER.md`, and `SESSION_START_PROMPT.md` (sibling `aix-platform-docs` workspace) have
been updated to this state.

D1 is closed. Phase 4A.2B is accepted. The next implementation task must be selected from the
remaining approved module roadmap.
