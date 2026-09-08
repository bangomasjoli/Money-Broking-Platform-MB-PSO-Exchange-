/**
 * KYC-01 domain error catalogue.
 *
 * Same rationale as every prior module's own copy (services/aml1/src/lib/errors.ts /
 * services/clt1/src/lib/errors.ts / services/cfg1/src/lib/errors.ts /
 * services/sec1/src/lib/errors.ts / services/iam2/src/lib/errors.ts, mirrored, not imported —
 * F3(c)): `@aix/foundation`'s `AppError` is intentionally closed over `FndErrorCode`, and
 * KYC-01-specific codes not in the shared foundation catalogue get their own small parallel error
 * type here, carrying the exact same on-wire shape (`{code, message, details}` + `http`), so the
 * request-context error handler can treat both uniformly.
 *
 * PHASE 0 — "only add codes this stage's routes can actually throw" (every prior module's own
 * repeated header-comment discipline, applied identically here). Phase 0 registers exactly one
 * route (`GET /internal/kyc1/health`), which is unauthenticated and does not query the database —
 * it has no reachable failure mode of its own. Both of Phase 0's actual failure paths reuse shared
 * foundation codes instead of a new KYC-01 code:
 *   - guard rejection (a future guarded route, not reachable this phase) -> `SERVICE_IDENTITY_REQUIRED`
 *   - config load failure -> `CONFIGURATION_INVALID`
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 1 additions (deterministic KYC/KYB evidence baseline — case creation from handoff,
 * document checklist, opaque evidence references, manual/registry verification-result receipt,
 * deterministic CDD outcome computation). Each new code maps to exactly one reachable Phase 1 code
 * path:
 *   - KYC1_SERVICE_UNAVAILABLE — the DB pool was never reachable (`assertPoolAvailable`) or
 *     readiness's own DB probe failed. Mirrors AML-01's own `AML1_SERVICE_UNAVAILABLE`.
 *   - KYC1_CASE_NOT_FOUND — no `kyc_case` row for the given `case_id` (the GET-by-id read route,
 *     and every case-scoped mutation route's initial lookup).
 *   - KYC1_CASE_ALREADY_EXISTS — `POST .../handoffs` was attempted for an anchor
 *     (`application_id`/`case_type`/`party_id`) that already has an ACTIVE (non-`completed`) case —
 *     migration 042's own partial unique index is the race-safe backstop (`lib/kyc-case.ts` maps
 *     the `23505` violation to this code), the same "check first, let the constraint catch the
 *     race" discipline every maker-checker-adjacent table in this codebase already uses.
 *   - KYC1_CASE_INVALID_STATE — `POST .../compute-outcome` was attempted on a case whose latest
 *     `cdd_outcome.outcome_status` is already `'pass'` — a passed case is terminal this phase (no
 *     remediation/reopen workflow exists until Phase 3+); recomputing over a genuine pass would let
 *     a stray call silently overwrite a decided compliance outcome. `'fail'`/`'remediation_required'`
 *     cases MAY be recomputed (new evidence can legitimately arrive with no separate resubmission
 *     gate this phase).
 *   - KYC1_CHECKLIST_ITEM_NOT_FOUND — `POST .../verification-results` referenced a
 *     `checklist_item_id` that does not belong to the case.
 *   - KYC1_EVIDENCE_INVALID — `POST .../evidence`'s `evidence_ref` failed shape validation (blank,
 *     oversized, or shaped like inline document content — e.g. a `data:` URI or a base64-length
 *     blob) — see `lib/kyc-case.ts`'s `validateEvidenceRef`. KYC-01 never stores raw document
 *     content; this is the structural refusal, not merely a house style choice.
 *   - KYC1_VERIFICATION_RESULT_INVALID — `POST .../verification-results`'s `result_type` does not
 *     apply to the case's own `case_type` (e.g. `result_type='entity'` on an `individual` case).
 *   - KYC1_OUTCOME_NOT_FOUND — `GET .../outcome` was called before `compute-outcome` has ever run
 *     for the case (no `cdd_outcome` row exists yet).
 *   - KYC1_AUDIT_REQUIRED — the transaction-coupled audit/outbox write itself failed; mirrors every
 *     prior module's own `*_AUDIT_REQUIRED` (no mutation is ever returned without its audit trail
 *     durably committed first).
 *
 * DELIBERATELY NOT ADDED (Phase 1): `KYC1_OUTCOME_INVALID_STATE` — no reachable throw site exists
 * this phase distinct from `KYC1_CASE_INVALID_STATE` (which already covers the one genuine
 * invalid-state condition, recomputing over a passed case); adding a second code for the identical
 * condition would be decorative. No IAM-02/maker-checker/vendor/UBO/EDD/biometric/CLT-delivery/
 * AML-trigger/wallet/trading/settlement error code of any kind — all out of Phase 1 scope.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 2A additions (authoritative-outcome + publication model — approved Phase 2 planning
 * report, CLT-01 delivery itself deliberately NOT in scope this phase). Each new code maps to
 * exactly one reachable Phase 2A code path — the same "only add codes this stage's routes can
 * actually throw" discipline every prior phase in this file applies to itself:
 *   - KYC1_OUTCOME_NOT_PUBLISHABLE — `POST .../publish-outcome` was attempted for an application
 *     whose authoritative-outcome aggregate is `pending` (`lib/authoritative-outcome.ts`'s
 *     `computeAuthoritativeOutcome` returned `publishable: false`) — no primary
 *     (`individual`/`entity`) case exists yet for the application, or the primary anchor's latest
 *     case has no computed outcome yet. No `outcome_publication` row is created.
 *   - KYC1_OUTCOME_EVIDENCE_CONFLICT — `POST .../publish-outcome` would publish `pass`, but a
 *     contributing case's own evidence contains a tied conflicting `pass`/`fail` pair for the same
 *     `result_type`/`received_at_utc` (`lib/authoritative-outcome.ts`'s
 *     `detectTiedConflictingEvidence` — the D4/INFO-6 remedy: MED-1's deterministic-but-
 *     semantically-arbitrary tie-break surfacing here, refused rather than silently published). No
 *     `outcome_publication` row is created.
 *   - KYC1_OUTCOME_PUBLICATION_NOT_FOUND — `GET .../outcome-publications/:publication_id` found no
 *     matching row.
 *
 * DELIBERATELY NOT ADDED (Phase 2A): `KYC1_OUTCOME_PUBLICATION_INVALID_STATE` — the retry route
 * this code would guard (a retry against an already `succeeded`/`superseded` publication) is
 * Phase 2B's own concern; Phase 2A registers no retry route of its own, so there is no genuine
 * throw site yet. An earlier draft of this catalogue pre-registered this code as a documented
 * forward-compatibility exception (mirroring migration 043's own D6 treatment of
 * `outcome_publication.status`'s `succeeded`/`failed` CHECK values) — corrected on review: a
 * forward-compatible SCHEMA value costs nothing extra to declare early, but a forward-only ERROR
 * CODE with zero call sites is genuinely decorative in a way an unreached CHECK value is not, so
 * the two are not actually the same exception and this file's usual reachable-code-path-only rule
 * applies without a carve-out here. Added back below, now that Phase 2B's delivery route gives it a
 * genuine throw site.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 2B additions (CLT-01 outcome delivery — `routes/outcome-publication.ts`'s
 * `POST .../deliver`). Each new code maps to exactly one reachable Phase 2B code path:
 *   - KYC1_OUTCOME_PUBLICATION_INVALID_STATE — a delivery was attempted on a publication whose
 *     `status` is `succeeded` (nothing left to deliver) or `superseded` (a newer publication has
 *     already replaced it) — only `pending`/`failed` may be delivered/retried.
 *   - KYC1_OUTCOME_PUBLICATION_STALE — TX1 recomputed the authoritative aggregate from LIVE KYC-01
 *     case state and it no longer matches the publication's own stored snapshot (a corrective
 *     same-anchor case was opened, new evidence arrived, etc., since this publication was created —
 *     the LOW-7 closure's own delivery-time backstop). Thrown BEFORE any CLT-01 HTTP call; no
 *     `outcome_publication` row is mutated. Audited via the existing `kyc1.outcome_publication_
 *     refused` event (`reason_code: "stale"`), not a new event type.
 *   - KYC1_CLT_DELIVERY_FAILED — CLT-01 was reachable and responded with a genuine non-2xx decision
 *     (`lib/clt1-client.ts`'s `kind: "rejected"` — includes the real, expected
 *     `CLT1_APPLICATION_INVALID_STATE` wrong-lifecycle-window case). The failed attempt is first
 *     durably recorded (TX2 committed, `status='failed'`, `kyc1.outcome_delivery_failed` audited)
 *     and only THEN surfaced to the caller as this code — the row remains fully queryable and
 *     retriable afterward.
 *   - KYC1_CLT_UNAVAILABLE — no real CLT-01 decision was ever obtained: network error, timeout, or
 *     a malformed/unparseable/`success:false` response body (`lib/clt1-client.ts`'s `kind:
 *     "unavailable"`). Same durable-record-first discipline as `KYC1_CLT_DELIVERY_FAILED` above;
 *     kept as a DISTINCT code (a deliberate divergence from AML-01, which collapses both causes into
 *     one `AML1_CLT_DELIVERY_FAILED`) because CLT-01's own Phase 1 L1 finding was precisely that one
 *     code covering two causes is imprecise — CLT-01 Phase 2 itself later split an analogous
 *     `_SERVICE_UNAVAILABLE`/`_CFG_GATE_UNAVAILABLE` pair for the same reason.
 *
 * DELIBERATELY NOT ADDED (Phase 2B): `KYC1_OUTCOME_DELIVERY_BLOCKED` (subsumed by
 * `KYC1_OUTCOME_PUBLICATION_STALE` — one code, one condition, not two names for the same throw
 * site); `KYC1_OUTCOME_PUBLICATION_CONFLICT` (the LOW-5 advisory-lock fix serializes concurrent
 * publish/deliver calls rather than making either throw — the condition this code would have
 * guarded no longer exists). No IAM-02/maker-checker/manual-override/sensitive-evidence-read/
 * UBO/EDD/vendor/proofing/document-store/AML-integration/wallet/trading/settlement error code of
 * any kind — all out of Phase 2B scope.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 3A additions (KYC-01's first IAM-02 integration + the sensitive evidence-read route,
 * `routes/sensitive-evidence.ts`). Each new code maps to exactly one reachable Phase 3A code path:
 *   - KYC1_PERMISSION_DENIED — IAM-02's `checkPermission` (`lib/iam2-client.ts`) returned a
 *     genuine negative baseline decision (`deny`/`licence_locked`) for `kyc1.evidence.sensitive_
 *     read`. Checked BEFORE the target `document_checklist_item` row is fetched (permission-
 *     before-existence — an unpermissioned caller must never learn whether a `checklist_item_id`
 *     exists), so this code is also what an unknown id returns to an unpermissioned actor.
 *   - KYC1_IAM2_UNAVAILABLE — IAM-02 was not genuinely reached: network error, timeout, non-2xx,
 *     malformed/unparseable body, or `success:false`/missing `decision` (`lib/iam2-client.ts`'s
 *     own `iam2_unavailable` sentinel). Kept DISTINCT from `KYC1_PERMISSION_DENIED` — collapsing
 *     "IAM-02 said no" and "IAM-02 could not be reached" into one code was precisely AML-01's own
 *     Phase 3A Low-1 finding; both are fail-closed, but only one is genuinely diagnostic of an
 *     IAM-02 outage.
 *
 * DELIBERATELY NOT ADDED (Phase 3A): `KYC1_SENSITIVE_EVIDENCE_NOT_FOUND` — the sensitive route's
 * not-found path (an unknown `checklist_item_id`, once permission has already passed) reuses the
 * EXISTING `KYC1_CHECKLIST_ITEM_NOT_FOUND` — a second name for the identical condition would be
 * decorative, the same reachable-code-path-only discipline this file has applied to itself since
 * Phase 0. No `KYC1_APPROVAL_REQUIRED` — no route this phase carries `requires_approval=true`
 * (migration 044's own header comment), so there is no execute-verify throw site yet; that code is
 * added only when Phase 3B's manual-override apply route lands one. No manual-override/maker-
 * checker/execute-verify/UBO/EDD/vendor/document-store error code of any kind — all out of Phase
 * 3A scope.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 3B additions (maker-checker manual outcome override, `routes/outcome-override.ts`). Each
 * new code maps to exactly one reachable Phase 3B code path:
 *   - KYC1_APPROVAL_REQUIRED — the override apply route's `verifyDecisionToken` (execute-verify)
 *     call returned `authorised: false` for a reason OTHER than IAM-02 being unreachable: an
 *     absent/invalid/expired/replayed decision token, a requester/approver mismatch, a
 *     payload-hash mismatch (the stored request row no longer matches what the token was bound
 *     to), or `execution_authorised !== true`. Every one of IAM-02's own distinct reason codes
 *     collapses to this single generic code at the KYC-01 boundary — the same discipline
 *     AML-01/CFG-01/SEC-01/CLT-01 already apply for their own execute-verify call sites.
 *   - KYC1_OVERRIDE_NOT_FOUND — the apply route's `override_id`+`case_id` pair matched no
 *     `manual_override_request` row (unknown `override_id`, or one that does not belong to the
 *     `case_id` in the URL — the two must agree, mirrors AML-01's own
 *     `screening_match_id`-mismatch handling for `confirm`/`dismiss` apply).
 *   - KYC1_OVERRIDE_INVALID_STATE — a condition about the `manual_override_request` ROW's OWN
 *     state, never the case's: the request route found an existing `requested` override already
 *     open for the case (only one open request permitted at a time, migration 045's own partial
 *     unique index — a concurrent second request cleanly receives this code, never a raw `23505`),
 *     OR the apply route found the target row's `status` is not `requested` (already `applied`, or
 *     raced by a concurrent apply for the SAME override — the advisory lock plus
 *     `SELECT ... FOR UPDATE` re-check inside the final apply transaction is what makes this the
 *     ALWAYS-clean outcome of a race, never a raw `23505` surfacing as `KYC1_AUDIT_REQUIRED`, the
 *     exact MED-2 shape from Phase 2B applied here from day one).
 *   - KYC1_SELF_OVERRIDE_BLOCKED — the request route's own KYC-01-owned SoD check found that
 *     `requested_by` equals the `source_id` of an EXISTING `source_type='manual'`
 *     `verification_result` row on the SAME case (`lib/outcome-override.ts`'s
 *     `checkSelfOverrideBlocked`) — checked BEFORE the IAM-02 baseline call, mirroring AML-01's own
 *     `checkSelfDispositionBlocked` request-time-only precedent exactly. No override row is
 *     created; IAM-02 is never called for a blocked request. KNOWN LIMITATION (recorded, not
 *     silently accepted): for a case whose verification results are ALL `source_type='registry'`
 *     (no human manual verifier ever recorded a finding on this case), this check is structurally
 *     vacuous — there is no maker identity to compare `requested_by` against. SoD for such a case
 *     degrades to IAM-02's own unconditional requester != approver rule alone, a strictly weaker
 *     two-identity guarantee than the three-identity workflow a manually-verified case gets. This
 *     is NOT claimed to be closed by this code; see `lib/outcome-override.ts`'s own header comment
 *     and the dedicated registry-only-case test in `tests/integration/kyc1-db.test.ts`.
 *
 * REUSED (not new): `KYC1_PERMISSION_DENIED`/`KYC1_IAM2_UNAVAILABLE` (the baseline `checkPermission`
 * call at BOTH request and apply, identical semantics to Phase 3A's own sensitive-read route);
 * `KYC1_CASE_INVALID_STATE` — a condition about the CASE's own state, never the override row's:
 * covers (a) the compute-outcome recompute-lock (D5 — a case whose latest `cdd_outcome.outcome_
 * reason` is `manual_override_pass`/`_fail`/`_remediation_required` is terminal against
 * recomputation), and (b) every request-time case-state refusal in `routes/outcome-override.ts`'s
 * own request route — a case with no current outcome yet, a target status identical to the case's
 * current outcome (no-op), and a case whose latest outcome is already a manual override (the SAME
 * underlying condition (a) checks, reached from a different route — correction requires a NEW case
 * for the same anchor, per D5's own rule). One code, one condition-CLASS, checked from two call
 * sites, rather than a second name for the identical case-state concept; `KYC1_OUTCOME_PUBLICATION_
 * STALE`/`KYC1_OUTCOME_EVIDENCE_CONFLICT` (both reused UNCHANGED by the existing Phase 2A/2B
 * machinery once an override changes the case's current outcome — an override never calls publish/
 * deliver itself, so these are reused by the OPERATOR'S subsequent explicit publish/deliver calls,
 * not by any Phase 3B code directly).
 *
 * DELIBERATELY NOT ADDED (Phase 3B): `KYC1_OVERRIDE_NOT_ALLOWED` (subsumed by
 * `KYC1_OVERRIDE_INVALID_STATE`/`KYC1_CASE_INVALID_STATE` — no throw site needs a THIRD name for
 * "this action is not currently permitted"); `KYC1_MANUAL_REVIEW_NOT_FOUND`/`KYC1_MANUAL_REVIEW_
 * INVALID_STATE` (the table is `manual_override_request`, not a review queue — D10 — so the error
 * names follow `OVERRIDE`, not `MANUAL_REVIEW`); `KYC1_SENSITIVE_EVIDENCE_NOT_FOUND` (still
 * unreached, Phase 3A's own decision stands). No vendor/UBO/EDD/document-store/proofing/biometric/
 * AML-integration/wallet/trading/settlement error code of any kind — all out of Phase 3B scope.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 4B (CLT-01 roster completeness, publication binding, atomic delivery integration — migration
 * `048_kyc1_publication_roster_binding.cjs`). ZERO new codes — every genuinely reachable Phase 4B
 * condition maps onto an EXISTING code, reused for a reason, not merely to avoid growth for its own
 * sake:
 *   - `KYC1_OUTCOME_NOT_PUBLISHABLE` — now ALSO the throw site for every roster-completeness
 *     refusal at publish time (roster unavailable/malformed, application-status ineligible, primary
 *     missing/mismatched/ambiguous, a required party missing or its case having no outcome yet).
 *     Meaning is unchanged from Phase 2A ("no authoritative outcome is ready to publish for this
 *     application") — roster incompleteness is exactly one more reason that can be true, carried in
 *     the bounded `reason_code` (never a new code per reason — see
 *     `lib/authoritative-outcome.ts`'s own `PublicationRefusalReasonCode`).
 *   - `KYC1_OUTCOME_PUBLICATION_STALE` — now ALSO thrown when: (a) delivery's own roster-aware
 *     revalidation finds the current roster/required-party-set/aggregate no longer matches the
 *     publication's stored evidence (extends the EXISTING Phase 2B stale check, same code, richer
 *     comparison), (b) the publication predates migration 048 (`roster_hash IS NULL` — a legacy
 *     publication can never be delivered, `reason_code: "legacy_publication_unbound"`), and (c)
 *     CLT-01 itself returns `CLT1_KYC_ROSTER_STALE` (migration 047's own atomic receipt) —
 *     `lib/clt1-client.ts`'s new `kind: "stale"` discriminant maps here, NEVER to
 *     `KYC1_CLT_DELIVERY_FAILED`/`KYC1_CLT_UNAVAILABLE`. All three causes are the SAME underlying
 *     condition ("this publication's evidence is no longer current"), distinguished only by a
 *     bounded `reason_code`.
 *   - `KYC1_CLT_UNAVAILABLE` — now ALSO covers a roster-fetch failure (`lib/roster-client.ts`'s
 *     `fetchClt1KycRoster` returning `ok: false` for any reason — network/timeout/non-2xx/malformed/
 *     roster-cap) at either publish or delivery time. The existing meaning ("no real CLT-01 decision
 *     was obtained") already covers "no real CLT-01 roster was obtained" without qualification.
 *
 * No new IAM-02/maker-checker/UBO-discovery/EDD/vendor/document-store error code of any kind — all
 * out of Phase 4B scope. Phase 4A.2 (CLT-01 pre-approval authorised-party capture) remains a
 * separate, later, CLT-01-side phase this file has no code for and does not anticipate.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 4A.2B additions (KYC anchor sync, `routes/roster-sync.ts`). One new code, exactly one
 * reachable throw site:
 *   - KYC1_APPLICATION_INVALID_STATE — `POST .../roster-sync` was attempted against a CLT-01
 *     application whose reported `application_status` (learned from the SAME roster fetch every
 *     other Phase 4B/4A.2B route already makes — no separate CLT-01 call) is not `under_review`.
 *     Deliberately a NEW code, not a reuse of `KYC1_CASE_INVALID_STATE` (a condition about one
 *     `kyc_case` row's own state, never an application's) or `KYC1_OUTCOME_NOT_PUBLISHABLE` (a
 *     condition about aggregate publishability, which roster-sync never computes and would be a
 *     misleading response for an operation that neither reads nor writes `outcome_publication`).
 *     Roster-fetch failure itself (network/timeout/malformed/roster-too-large) continues to reuse
 *     the EXISTING `KYC1_CLT_UNAVAILABLE` — unchanged from Phase 4B, not this code's concern.
 *
 * DELIBERATELY NOT ADDED (Phase 4A.2B): a distinct "roster sync already in progress" code — the
 * application-scoped advisory lock (`lib/roster-controls.ts`) serialises concurrent calls instead
 * of making either throw, the identical LOW-5 precedent Phase 2B already established for publish/
 * deliver; a distinct "anchor already exists" code — an existing anchor is a normal, silent skip
 * (`created_count`/`skipped_count` in the response), never a refusal. A genuine 23505 raced by a
 * concurrent case-creation path outside the lock (e.g. a directly-invoked handoff for the same
 * anchor) reuses the EXISTING `KYC1_CASE_ALREADY_EXISTS` — the same condition `routes/handoffs.ts`
 * already maps, never a second name for it.
 */
import type { ErrorDetail } from "@aix/foundation";

export interface Kyc1ErrorSpec {
  http: number;
  message: string;
}

export const KYC1_ERROR_CODES = {
  KYC1_SERVICE_UNAVAILABLE: { http: 503, message: "KYC-01 database is not reachable." },
  KYC1_CASE_NOT_FOUND: { http: 404, message: "KYC/KYB case not found." },
  KYC1_CASE_ALREADY_EXISTS: { http: 409, message: "An active KYC/KYB case already exists for this anchor." },
  KYC1_CASE_INVALID_STATE: { http: 409, message: "This case is not in a state that permits this action." },
  KYC1_CHECKLIST_ITEM_NOT_FOUND: { http: 404, message: "Checklist item not found for this case." },
  KYC1_EVIDENCE_INVALID: { http: 422, message: "The evidence reference is invalid." },
  KYC1_VERIFICATION_RESULT_INVALID: { http: 422, message: "The verification result is invalid for this case." },
  KYC1_OUTCOME_NOT_FOUND: { http: 404, message: "No CDD outcome has been computed for this case yet." },
  KYC1_AUDIT_REQUIRED: { http: 503, message: "Audit/outbox write failed; action rolled back." },
  KYC1_OUTCOME_NOT_PUBLISHABLE: { http: 422, message: "No authoritative CDD outcome is ready to publish for this application." },
  KYC1_OUTCOME_EVIDENCE_CONFLICT: { http: 422, message: "Contributing evidence contains a tied conflicting result; refusing to publish a pass outcome." },
  KYC1_OUTCOME_PUBLICATION_NOT_FOUND: { http: 404, message: "Outcome publication not found." },
  KYC1_OUTCOME_PUBLICATION_INVALID_STATE: { http: 409, message: "This outcome publication is not in a state that permits delivery." },
  KYC1_OUTCOME_PUBLICATION_STALE: { http: 409, message: "The authoritative outcome has changed since this publication was created; re-publish before delivering." },
  KYC1_CLT_DELIVERY_FAILED: { http: 502, message: "CLT-01 rejected the outcome delivery." },
  KYC1_CLT_UNAVAILABLE: { http: 503, message: "CLT-01 is not reachable." },
  KYC1_PERMISSION_DENIED: { http: 403, message: "The actor is not permitted to perform this action." },
  KYC1_IAM2_UNAVAILABLE: { http: 503, message: "IAM-02 is not reachable." },
  KYC1_APPROVAL_REQUIRED: { http: 403, message: "A valid IAM-02 approval decision token is required for this action." },
  KYC1_OVERRIDE_NOT_FOUND: { http: 404, message: "Manual override request not found." },
  KYC1_OVERRIDE_INVALID_STATE: { http: 409, message: "This manual override request is not in a state that permits this action." },
  KYC1_SELF_OVERRIDE_BLOCKED: { http: 409, message: "The requester may not override an outcome for a case they provided manual verification evidence on." },
  KYC1_APPLICATION_INVALID_STATE: { http: 409, message: "This application is not in a state that permits roster synchronisation." },
} as const satisfies Record<string, Kyc1ErrorSpec>;

export type Kyc1ErrorCode = keyof typeof KYC1_ERROR_CODES;

export class Kyc1Error extends Error {
  readonly code: Kyc1ErrorCode;
  readonly http: number;
  readonly details: ErrorDetail[];

  constructor(code: Kyc1ErrorCode, opts?: { message?: string; details?: ErrorDetail[]; cause?: unknown }) {
    const spec = KYC1_ERROR_CODES[code];
    super(opts?.message ?? spec.message);
    this.name = "Kyc1Error";
    this.code = code;
    this.http = spec.http;
    this.details = opts?.details ?? [];
    if (opts?.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}
