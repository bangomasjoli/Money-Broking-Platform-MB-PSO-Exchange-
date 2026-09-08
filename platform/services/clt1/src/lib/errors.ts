/**
 * CLT-01 domain error catalogue.
 *
 * Same rationale as `services/iam2/src/lib/errors.ts` / `services/sec1/src/lib/errors.ts` /
 * `services/cfg1/src/lib/errors.ts` (mirrored, not imported — F3(c)): `@aix/foundation`'s
 * `AppError` is intentionally closed over `FndErrorCode`, and CLT-01-specific codes not in the
 * shared foundation catalogue get their own small parallel error type here, carrying the exact
 * same on-wire shape (`{code, message, details}` + `http`), so the request-context error handler
 * can treat both uniformly.
 *
 * PHASE 1 — "only add codes this stage's routes can actually throw" (IAM-02/SEC-01/CFG-01's own
 * repeated header-comment discipline, applied identically here; carried forward from Phase 0's
 * empty catalogue). Each code below maps to exactly one reachable Phase 1 code path
 * (routes/applications.ts / lib/applications.ts / lib/cfg1-client.ts):
 *   - CLT1_CFG_GATE_REQUIRED    — a transition that requires a prior CFG-01 gate check
 *     (submit) is attempted with none on file yet. Distinct from CLT1_CFG_GATE_DENIED: this is
 *     "no check has run", not "a check ran and said no".
 *   - CLT1_CFG_GATE_DENIED      — CFG-01's evaluate() returned a non-retail deny (e.g. unknown/
 *     not-yet-enabled, kill-switch-active).
 *   - CLT1_RETAIL_ONBOARDING_BLOCKED — CFG-01's evaluate() denied specifically because the
 *     mapped feature code is `onboarding.retail_default`, CFG-01's permanently prohibited
 *     registry entry (Doc00 §10.2A / MSR CLT-RULE-001) — a sharper, named code distinct from the
 *     generic gate-denied case, mirroring CFG-01's own reason_code split between "prohibited"
 *     and ordinary deny reasons.
 *   - CLT1_APPLICATION_INVALID_STATE — a transition attempted from a status that does not allow
 *     it (e.g. submit on a non-draft application).
 *   - CLT1_APPLICATION_NOT_FOUND — no client_application row for the given application_id.
 *   - CLT1_CONSENT_REQUIRED     — submit attempted with zero consent_record rows on file.
 *   - CLT1_AUDIT_REQUIRED       — the transaction-coupled audit/outbox write itself failed;
 *     mirrors CFG-01's own CFG1_AUDIT_REQUIRED (no mutation is ever returned without its audit
 *     trail durably committed first).
 *   - CLT1_SERVICE_UNAVAILABLE  — the DB pool was never reachable, mirrors CFG-01's own
 *     CFG1_DECISION_ENGINE_UNAVAILABLE for the equivalent "downstream not reachable" case.
 *
 * DELIBERATELY NOT ADDED (Phase 1) — no reachable Phase 1 code path throws these, even though the
 * task brief's draft list named them:
 *   - CLT1_CLIENT_CLASS_UNVERIFIED — nothing in Phase 1 OR Phase 2 gates on verified-vs-claimed
 *     class (no verify route exists yet; `client_class_status` never leaves 'claimed').
 *   - CLT1_SENSITIVE_READ_LOG_REQUIRED — no route (Phase 1 or Phase 2) returns PII, so no
 *     sensitive-read-logging code path exists to guard.
 * Both remain available for whichever later phase actually builds the route/logic that can throw
 * them.
 *
 * `assertNoExchangeRuntime`'s own boot-time violation throws a raw `Error` from
 * `@aix/foundation` directly (never converted to an `AppError`/`Clt1Error`) — it crashes
 * `buildApp()` itself before any route could ever serve a request, so no CLT-01 error code is
 * reachable for it at the HTTP layer at all.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 2 additions (CDD outcome gate + final approval control). Each new code maps to exactly
 * one reachable Phase 2 code path (lib/outcomes.ts / routes/outcomes.ts / routes/decisions.ts /
 * routes/clients.ts):
 *   - CLT1_CDD_OUTCOME_REQUIRED — a required CDD rollup status is not yet 'pass' (pending/
 *     unavailable/not_required) at approve/apply time.
 *   - CLT1_CDD_OUTCOME_FAILED  — a required CDD rollup status resolved to fail/rejected/stale/
 *     remediation_required (not the sharper aml_sanctions_status='hit' or
 *     risk_rating_status='rejected' cases below).
 *   - CLT1_AML_SANCTIONS_HIT   — sharper, named code for aml_sanctions_status='hit' specifically
 *     (blueprint's own named hard-block), checked before the generic FAILED code.
 *   - CLT1_RISK_REJECTED       — sharper, named code for risk_rating_status='rejected'
 *     specifically, checked before the generic FAILED code.
 *   - CLT1_KYC_HANDOFF_REQUIRED / CLT1_AML_HANDOFF_REQUIRED — blueprint data rule 3 ("Final
 *     approval requires KYC/KYB and AML handoff creation"): approve/apply requires at least one
 *     `handoff_status` row per target module, independent of what `cdd_outcome` says.
 *   - CLT1_PERMISSION_DENIED  — IAM-02's baseline `checkPermission` did not pass, for
 *     review/reject/hold/outcome-status-read and approve/request's own baseline check. Mirrors
 *     CFG-01's own `CFG1_MUTATION_UNAUTHORISED`.
 *   - CLT1_APPROVAL_REQUIRED  — approve/apply's IAM-02 `execute-verify` call did not authorise
 *     (missing/invalid/mismatched decision token). Mirrors CFG-01's own
 *     `CFG1_MUTATION_APPROVAL_REQUIRED` — deliberately a DIFFERENT code from
 *     CLT1_PERMISSION_DENIED, since the two failure modes (no baseline permission vs. no verified
 *     approval) need to be distinguishable by an operator.
 *   - CLT1_SELF_APPROVAL_BLOCKED — approve/request's local partial-SoD check (blueprint SoD rule
 *     1): the reviewer who called start-review cannot also be the one who requests final
 *     approval. IAM-02's own approve endpoint separately blocks requester==approver; this code is
 *     CLT-01's own additional check IAM-02 has no way to know about.
 *   - CLT1_DECISION_REQUEST_INVALID_STATE — approve/apply attempted on a decision_id whose
 *     `application_decision_request.status` is not 'requested' (already applied, or raced).
 *     Mirrors CFG-01's own `CFG1_CHANGE_REQUEST_INVALID_STATE`.
 *   - CLT1_CLIENT_NOT_FOUND    — GET client-status for an unknown client_id.
 *   - CLT1_CFG_GATE_UNAVAILABLE — CFG-01 could not be reached. Split out of
 *     CLT1_SERVICE_UNAVAILABLE this phase (Phase 1 Opus review L1: the old message was reused for
 *     both "CLT-01's own DB is unreachable" and "CFG-01 is unreachable", which was inaccurate for
 *     the latter) — CLT1_SERVICE_UNAVAILABLE is now reserved strictly for CLT-01's own DB/service
 *     failure. `lib/applications.ts`'s `interpretCfgGate` now throws this code for the
 *     `cfg1_unavailable` reason, not CLT1_SERVICE_UNAVAILABLE.
 *   - CLT1_IAM2_UNAVAILABLE   — IAM-02 could not be reached. Same reasoning as
 *     CLT1_CFG_GATE_UNAVAILABLE, applied from day one for this new dependency rather than
 *     discovered by a later review pass.
 *
 * `09_Error_Handling.md`'s remaining blueprint codes (duplicate-review, evidence-export, etc.)
 * still belong to the later phases that actually build the routes/logic that can throw them —
 * same discipline as Phase 1.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 3 additions (authorised users + client mandate baseline). Each new code maps to exactly
 * one reachable Phase 3 code path (lib/authorised-users.ts / lib/mandates.ts /
 * routes/authorised-users.ts / routes/mandates.ts):
 *   - CLT1_CLIENT_NOT_ACTIVE   — every Phase 3 route requires `client_profile.status =
 *     'active_limited'`; this fires when the client row exists but is not in that status. A
 *     rejected/held application never has a `client_profile` row at all, so those cases surface
 *     as CLT1_CLIENT_NOT_FOUND instead (the row genuinely does not exist), not this code.
 *   - CLT1_AUTHORISED_USER_NOT_FOUND — no `authorised_user` row for the given
 *     authorised_user_id/client_id pair.
 *   - CLT1_AUTHORISED_USER_INVALID_STATE — suspend/reactivate/remove attempted from a status
 *     that does not allow it (e.g. suspend on an already-suspended or revoked user).
 *   - CLT1_MANDATE_NOT_FOUND   — no active `client_mandate` row for the given client (the
 *     current-mandate read route, or `update/request` when no active mandate exists to update).
 *   - CLT1_MANDATE_INVALID_STATE — reserved for a mandate-status transition attempted from a
 *     status that does not allow it. Not reachable via any Phase 3 route today (no suspend/
 *     revoke/expire route exists this phase — see implementation notes deferred-items list) but
 *     kept in the catalogue now rather than added later, since `client_mandate.status`'s CHECK
 *     constraint already carries `inactive`/`expired`/`revoked` forward-compat values a later
 *     phase's transition logic will need this exact code for.
 *
 * `CLT1_SELF_APPROVAL_BLOCKED`, `CLT1_PERMISSION_DENIED`, `CLT1_APPROVAL_REQUIRED`,
 * `CLT1_DECISION_REQUEST_INVALID_STATE`, `CLT1_CLIENT_NOT_FOUND`, `CLT1_IAM2_UNAVAILABLE`, and
 * `CLT1_AUDIT_REQUIRED` are all REUSED as-is for Phase 3's own authorised-user/mandate
 * decision-request flows — the meaning is identical regardless of which decision-request table
 * is involved, so no `_AUTHORISED_USER_`/`_MANDATE_`-qualified duplicate of any of these was
 * created (same "don't proliferate codes for an identical condition" discipline
 * `CLT1_APPLICATION_INVALID_STATE` already established across many distinct Phase 1/2 routes).
 * Invalid `client_mandate.rules` shape (unknown key / wrong type) is NOT a new CLT-01 code either
 * — it reuses the shared foundation `VALIDATION_ERROR`, the same code Fastify's own TypeBox/AJV
 * body-schema rejection produces for any other malformed request body in this codebase.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 4 additions (authorised party + screening linkage baseline). Each new code maps to
 * exactly one reachable Phase 4 code path (lib/authorised-parties.ts / routes/authorised-parties.ts):
 *   - CLT1_AUTHORISED_PARTY_NOT_FOUND — no `authorised_party` row for the given
 *     authorised_party_id/application_id pair.
 *   - CLT1_AUTHORISED_PARTY_INVALID_STATE — update/remove/activate/restrict/reject/suspend
 *     attempted from an `authority_status` that does not allow it. No reactivation path exists
 *     this phase — the blueprint's own state diagram draws no arrow back to `active`/`pending`
 *     from any of `restricted`/`rejected`/`revoked`/`suspended`.
 *   - CLT1_AUTHORISED_PARTY_SCREENING_REQUIRED — blueprint-named (`09_Error_Handling.md`);
 *     `activate/apply` attempted while `identity_verification_status !== 'pass'` or
 *     `sanctions_pep_status` is not `clear`/`review_required` (blueprint Rule 3, §5.15).
 *   - CLT1_UBO_THRESHOLD_REQUIRED — blueprint-named (`04_API_Specification.md`, absent from
 *     `09_Error_Handling.md`'s own table). Registered here for forward-compatibility only — the
 *     blueprint's own `ubo_identification_threshold` parameter is explicitly `to_be_defined`
 *     (`01_Module_Blueprint.md` §5.15), so NO Phase 4 route enforces any threshold and this code
 *     is present-but-defensive, not reachable this phase (same posture Phase 3's
 *     `CLT1_MANDATE_INVALID_STATE` should have had from the start — see Phase 3 F2).
 *
 * `CLT1_SELF_APPROVAL_BLOCKED`, `CLT1_PERMISSION_DENIED`, `CLT1_APPROVAL_REQUIRED`,
 * `CLT1_DECISION_REQUEST_INVALID_STATE`, `CLT1_CLIENT_NOT_FOUND`, `CLT1_CLIENT_NOT_ACTIVE`,
 * `CLT1_IAM2_UNAVAILABLE`, and `CLT1_AUDIT_REQUIRED` are all REUSED as-is for Phase 4's own
 * authorised-party decision-request flows — same "don't proliferate codes for an identical
 * condition" discipline as Phase 3.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 5 additions (related-party edge baseline). Each new code maps to exactly one reachable
 * Phase 5 code path (lib/related-party-edges.ts / routes/related-party-edges.ts):
 *   - CLT1_RELATED_PARTY_EDGE_NOT_FOUND — no `related_party_edge` row for the given
 *     related_party_edge_id.
 *   - CLT1_RELATED_PARTY_EDGE_INVALID_STATE — update/remove attempted on an edge whose `status`
 *     is not `active`. No reactivation path exists — an `inactive` edge requires a fresh
 *     remove+add, not a transition back to `active`.
 *   - CLT1_RELATED_PARTY_EDGE_DUPLICATE — `add/apply`'s insert collided with the partial unique
 *     index (`idx_clt1_related_party_edge_one_active_per_tuple`, migration 027) — an identical
 *     `(from_entity_type, from_entity_id, to_entity_type, to_entity_id, relationship_type)` tuple
 *     already has an `active` row. Deliberately mapped to a real 409 conflict, NOT collapsed into
 *     the generic `CLT1_AUDIT_REQUIRED` (503) catch — applying the lesson from Phase 4's own
 *     carried-forward F1 finding (a near-identical unique-violation on `client_mandate` was left
 *     collapsed into a misleading 503 there) rather than repeating it in new code.
 *   - CLT1_RELATED_PARTY_NODE_NOT_FOUND — a proposed edge's `from`/`to` entity reference does not
 *     exist in the table its `entity_type` names (`client` -> `client_profile`, `application` ->
 *     `client_application`, `party` -> `authorised_party`). No real Postgres FK is possible on
 *     the polymorphic `from_entity_type`/`from_entity_id` (or `to_`) columns, so this check is
 *     performed entirely at the application layer, not backstopped by a DB constraint.
 *
 * Self-reference (`from` and `to` naming the identical entity) is NOT a new CLT-01 code — it
 * reuses the shared foundation `VALIDATION_ERROR`, the same code Fastify's own TypeBox/AJV
 * body-schema rejection produces for any other malformed request body in this codebase (same
 * discipline `lib/mandates.ts`'s `validateMandateRules` and `lib/authorised-parties.ts`'s
 * `validateOwnershipPercentagePrecision` already established).
 *
 * `CLT1_PERMISSION_DENIED`, `CLT1_APPROVAL_REQUIRED`, `CLT1_DECISION_REQUEST_INVALID_STATE`,
 * `CLT1_IAM2_UNAVAILABLE`, and `CLT1_AUDIT_REQUIRED` are all REUSED as-is for Phase 5's own
 * related-party-edge decision-request flows. `CLT1_CLIENT_NOT_FOUND`/`CLT1_CLIENT_NOT_ACTIVE` are
 * reused by the one client-scoped route (`GET .../clients/:client_id/related-parties`) only — the
 * top-level add/update/remove routes have no single owning client to check.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 6 additions (duplicate-candidate review baseline). Each new code maps to exactly one
 * reachable Phase 6 code path (lib/duplicate-candidates.ts / routes/duplicate-candidates.ts):
 *   - CLT1_DUPLICATE_CANDIDATE_NOT_FOUND — no `duplicate_candidate` row for the given
 *     duplicate_candidate_id.
 *   - CLT1_DUPLICATE_CANDIDATE_INVALID_STATE — update/confirm/dismiss attempted on a candidate
 *     whose `status` is not `open`. No reactivation path — a resolved candidate requires a fresh
 *     `create` (permitted, since the partial unique index is `status='open'`-scoped), not a
 *     transition back to `open`.
 *   - CLT1_DUPLICATE_CANDIDATE_ALREADY_OPEN — `create/apply`'s insert collided with the partial
 *     unique index (`idx_clt1_duplicate_candidate_one_open_per_tuple`, migration 029) — an
 *     identical `(subject_type, subject_ref, matched_type, matched_ref, match_type)` tuple already
 *     has an `open` row. Deliberately mapped to a real 409 conflict, NOT collapsed into the generic
 *     `CLT1_AUDIT_REQUIRED` (503) — applying the lesson from Phase 4's own carried-forward F1
 *     finding and Phase 5's own `CLT1_RELATED_PARTY_EDGE_DUPLICATE` mapping, rather than repeating
 *     the F1 mistake in new code a third time.
 *   - CLT1_DUPLICATE_NODE_NOT_FOUND — a proposed candidate's `subject`/`matched` entity reference
 *     does not exist in the table its node type names (`application` -> `client_application`,
 *     `client` -> `client_profile`, `party` -> `authorised_party`). No real Postgres FK is possible
 *     on the polymorphic `subject_type/subject_ref` (or `matched_`) columns, so this check is
 *     performed entirely at the application layer, not backstopped by a DB constraint.
 *   - CLT1_DUPLICATE_SELF_REVIEW_BLOCKED — blueprint SoD rule 4 (`07_Permission_Rules.md` §3):
 *     `confirm`/`dismiss` attempted by the same actor who created the `client_application` on
 *     either side of the pair. A local, CLT-01-owned check (no IAM-02 change) — same class as
 *     Phase 2's own `CLT1_SELF_APPROVAL_BLOCKED`.
 *
 * Self-candidate (`subject` and `matched` naming the identical entity) is NOT a new CLT-01 code —
 * it reuses the shared foundation `VALIDATION_ERROR`, same discipline `lib/related-party-edges.ts`'s
 * `validateNotSelfReference` already established.
 *
 * `CLT1_PERMISSION_DENIED`, `CLT1_APPROVAL_REQUIRED`, `CLT1_DECISION_REQUEST_INVALID_STATE`,
 * `CLT1_IAM2_UNAVAILABLE`, `CLT1_AUDIT_REQUIRED`, `CLT1_APPLICATION_NOT_FOUND`, and
 * `CLT1_CLIENT_NOT_FOUND`/`CLT1_CLIENT_NOT_ACTIVE` are all REUSED as-is for Phase 6's own
 * duplicate-candidate decision-request flows and its two read routes.
 *
 * (Phase 6 deliberately did NOT add `CLT1_DUPLICATE_REVIEW_REQUIRED` — it had zero reachable code
 * path then, since Phase 6 did not touch the Phase 2 approval gate at all. Phase 7, below, is the
 * later phase that actually wires duplicate-candidate review into the approval gate and supplies
 * that throw site.)
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 7 additions (final approval compliance gate wiring). One new code, mapping to exactly one
 * reachable Phase 7 code path (lib/duplicate-candidates.ts's `evaluateDuplicateCandidateGateForApproval`,
 * called from routes/decisions.ts's `approve/request` and `approve/apply`):
 *   - CLT1_DUPLICATE_REVIEW_REQUIRED — the blueprint's own literal code (`09_Error_Handling.md`),
 *     now reachable: a `duplicate_candidate` touching the application (or one of its
 *     `authorised_party` nodes) has status `open`/`duplicate`/`needs_more_info` — unresolved or a
 *     reviewer-confirmed adverse duplicate. `http: 409`, the same "precondition not yet satisfied,
 *     retry once resolved" family as `CLT1_CDD_OUTCOME_REQUIRED`/`CLT1_KYC_HANDOFF_REQUIRED`/
 *     `CLT1_AML_HANDOFF_REQUIRED` — resolving (dismissing) the blocking candidate via Phase 6's own
 *     route and retrying the SAME approval request is the expected remedy, not a hard denial.
 *
 * DELIBERATELY NOT ADDED (Phase 7, approved design decisions) — `CLT1_RELATED_PARTY_REVIEW_REQUIRED`
 * (no code path: `related_party_edge` does not directly block approval this phase) and
 * `CLT1_AUTHORISED_PARTY_REVIEW_REQUIRED` (no code path: `authorised_party` screening status does
 * not directly block final approval this phase — screening effects stay local to Phase 4's own
 * party-activation gate). Neither is registered — same "no code without a reachable path"
 * discipline this codebase has followed since Phase 1.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 8 additions (client_profile lifecycle baseline). One new code, mapping to every reachable
 * Phase 8 code path (lib/client-profiles.ts's `validateClientProfileTransition`/
 * `validateLifecycleReason`, routes/client-profiles.ts's suspend/reactivate/close request+apply):
 *   - CLT1_CLIENT_PROFILE_INVALID_STATE — a lifecycle action attempted from a `client_profile.
 *     status` that does not allow it (including any action attempted from the terminal `closed`
 *     status, and a raced apply where the status changed between request and apply), OR a
 *     required `reason` was omitted for `suspend`/`close`. `http: 409`, the same family as
 *     `CLT1_APPLICATION_INVALID_STATE`/`CLT1_MANDATE_INVALID_STATE`/
 *     `CLT1_DUPLICATE_CANDIDATE_INVALID_STATE`.
 *
 * DELIBERATELY NOT ADDED (Phase 8, approved design decisions) — `CLT1_CLIENT_PROFILE_NOT_FOUND`
 * (the existing `CLT1_CLIENT_NOT_FOUND` is reused as-is — the condition is identical, no new code
 * for an identical condition, same discipline every prior phase applied) and
 * `CLT1_CLIENT_PROFILE_CLOSED` (a `closed -> X` attempt is just another instance of
 * `CLT1_CLIENT_PROFILE_INVALID_STATE`, not a distinct condition needing its own code).
 *
 * `CLT1_CLIENT_NOT_FOUND`, `CLT1_PERMISSION_DENIED`, `CLT1_IAM2_UNAVAILABLE`,
 * `CLT1_APPROVAL_REQUIRED`, `CLT1_DECISION_REQUEST_INVALID_STATE`, `CLT1_AUDIT_REQUIRED`, and
 * `CLT1_SERVICE_UNAVAILABLE` are all REUSED as-is for Phase 8's own client_profile-lifecycle
 * decision-request flow — same "don't proliferate codes for an identical condition" discipline
 * this codebase has followed since Phase 3.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 9 additions (module closure & final hardening baseline). One new code, closing the
 * oldest open carry-forward (Phase 3 F1):
 *   - CLT1_MANDATE_ALREADY_ACTIVE — `client_mandate` `create/apply`'s INSERT collided with the
 *     partial unique index (`idx_clt1_client_mandate_one_active_per_client`, migration 023) — the
 *     target client already has an `active` mandate. Previously collapsed into the generic
 *     `CLT1_AUDIT_REQUIRED` (503) like any other apply-transaction failure; now mapped to a real
 *     409 conflict, applying the exact `isDuplicateEdgeViolation` (Phase 5) /
 *     `isAlreadyOpenViolation` (Phase 6) unique-violation-detection pattern a third time. `http:
 *     409`, the same family as `CLT1_RELATED_PARTY_EDGE_DUPLICATE`/
 *     `CLT1_DUPLICATE_CANDIDATE_ALREADY_OPEN`.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 4A addition (application-keyed KYC roster contract, `GET /internal/clt1/applications/
 * :application_id/kyc-roster`). One new code, closing a gap reported (not silently resolved) at
 * the end of the Phase 4A implementation pass:
 *   - CLT1_KYC_ROSTER_TOO_LARGE — `lib/kyc-roster.ts`'s `assertRosterWithinCap`'s single
 *     reachable throw site: the application's `authorised_party` roster has more than
 *     `KYC_ROSTER_MAX_PARTIES` (500) rows. The roster contract is complete-or-error (no
 *     pagination, no truncation), so this is a real refusal, not a downgrade — no roster and no
 *     `roster_hash` are ever produced on this path. `http: 409`, the same
 *     precondition-not-yet-satisfiable family as `CLT1_CDD_OUTCOME_REQUIRED`/
 *     `CLT1_KYC_HANDOFF_REQUIRED`/`CLT1_DUPLICATE_REVIEW_REQUIRED`. Previously this condition
 *     reused `CLT1_APPLICATION_INVALID_STATE`, whose catalogue message inaccurately describes an
 *     application-status problem when the actual cause is roster size — the same
 *     message-vs-`details` imprecision class as the Phase 1 Opus review's own L1 finding, here
 *     closed by giving the condition its own accurately-worded code rather than continuing to
 *     reuse a mismatched one.
 *
 * ---------------------------------------------------------------------------------------
 * PHASE 4A.1 addition (atomic KYC outcome receipt + approval roster binding, migration
 * `047_clt1_atomic_kyc_roster_binding.cjs`). One new code, closing a confirmed, empirically-
 * reproduced TOCTOU between KYC-01's roster read and CLT-01's outcome acceptance (see the KYC-01
 * Phase 4 delivery-atomicity planning amendment):
 *   - CLT1_KYC_ROSTER_STALE — two reachable throw sites, both guarded by the same shared
 *     application-scoped `pg_advisory_xact_lock` and both comparing a freshly-recomputed
 *     `roster_hash` (the accepted Phase 4A canonical helper) against a caller-independent expected
 *     value:
 *       1. `routes/outcomes.ts`'s `kyc_kyb` outcome receipt — the current roster digest, recomputed
 *          under the lock, does not exactly match the caller-supplied `expected_roster_hash`. No
 *          `cdd_outcome` row and no rollup update are ever produced on this path.
 *       2. `routes/decisions.ts`'s `approve/apply` — the current roster digest, recomputed under
 *          the SAME lock, does not exactly match the application's own STORED
 *          `client_application.kyc_roster_hash` (or that column is `NULL`, meaning no `kyc_kyb`
 *          outcome was ever accepted under this binding). No `client_profile` row is ever created
 *          on this path.
 *     `http: 409` — a real, retriable-after-recovery conflict, the same family as
 *     `CLT1_KYC_ROSTER_TOO_LARGE`/`CLT1_DUPLICATE_REVIEW_REQUIRED`, deliberately NOT
 *     `CLT1_APPLICATION_INVALID_STATE` (which describes an application-STATUS problem, not a
 *     roster-CONTENT problem — reusing it here would repeat the exact imprecision the
 *     `CLT1_KYC_ROSTER_TOO_LARGE` addition above already corrected, in the same module, one phase
 *     later) and deliberately NOT `CLT1_CDD_OUTCOME_FAILED` (which means the outcome itself did not
 *     pass — false here; the outcome may well be a genuine `pass`, computed correctly, over a
 *     roster that has since changed) or `CLT1_AUDIT_REQUIRED` (a 503 server-fault code; this is a
 *     409 caller/state conflict).
 *
 * A malformed or missing `expected_roster_hash` on a `kyc_kyb` receipt is NOT this code — it is
 * the shared foundation `VALIDATION_ERROR` (400), the same "malformed input reuses the generic
 * validation code" discipline `lib/mandates.ts`'s `validateMandateRules` and
 * `lib/related-party-edges.ts`'s `validateNotSelfReference` already established. `CLT1_KYC_ROSTER_
 * STALE` is reserved exclusively for a WELL-FORMED expected hash that does not match the current
 * roster — a state conflict, not a request-shape problem.
 */
import type { ErrorDetail } from "@aix/foundation";

export interface Clt1ErrorSpec {
  http: number;
  message: string;
}

export const CLT1_ERROR_CODES = {
  CLT1_CFG_GATE_REQUIRED: { http: 409, message: "No CFG-01 onboarding gate check is on file for this application yet." },
  CLT1_CFG_GATE_DENIED: { http: 403, message: "CFG-01 denied the onboarding feature gate for this client class." },
  CLT1_RETAIL_ONBOARDING_BLOCKED: { http: 403, message: "Retail onboarding is permanently prohibited by platform licence scope." },
  CLT1_APPLICATION_INVALID_STATE: { http: 409, message: "This action is not valid for the application's current status." },
  CLT1_APPLICATION_NOT_FOUND: { http: 404, message: "Client application not found." },
  CLT1_CONSENT_REQUIRED: { http: 409, message: "At least one consent record is required before submission." },
  CLT1_AUDIT_REQUIRED: { http: 503, message: "Audit/outbox write failed; action rolled back." },
  CLT1_SERVICE_UNAVAILABLE: { http: 503, message: "CLT-01 database is not reachable." },
  CLT1_CDD_OUTCOME_REQUIRED: { http: 409, message: "A required CDD outcome is not yet available for this application." },
  CLT1_CDD_OUTCOME_FAILED: { http: 403, message: "A required CDD outcome did not pass." },
  CLT1_AML_SANCTIONS_HIT: { http: 403, message: "AML/sanctions screening returned a hit; approval is blocked." },
  CLT1_RISK_REJECTED: { http: 403, message: "Risk rating was rejected; approval is blocked." },
  CLT1_KYC_HANDOFF_REQUIRED: { http: 409, message: "A KYC/KYB handoff must be recorded before final approval." },
  CLT1_AML_HANDOFF_REQUIRED: { http: 409, message: "An AML handoff must be recorded before final approval." },
  CLT1_PERMISSION_DENIED: { http: 403, message: "IAM-02 did not authorise this actor for this action." },
  CLT1_APPROVAL_REQUIRED: { http: 403, message: "A verified IAM-02 approval is required for this action." },
  CLT1_SELF_APPROVAL_BLOCKED: { http: 403, message: "The assigned reviewer cannot also request final approval." },
  CLT1_DECISION_REQUEST_INVALID_STATE: { http: 409, message: "This approval request is not in a state that allows apply." },
  CLT1_CLIENT_NOT_FOUND: { http: 404, message: "Client not found." },
  CLT1_CFG_GATE_UNAVAILABLE: { http: 503, message: "CFG-01 onboarding gate could not be reached." },
  CLT1_IAM2_UNAVAILABLE: { http: 503, message: "IAM-02 could not be reached." },
  CLT1_CLIENT_NOT_ACTIVE: { http: 409, message: "Client is not active_limited." },
  CLT1_AUTHORISED_USER_NOT_FOUND: { http: 404, message: "Authorised user not found." },
  CLT1_AUTHORISED_USER_INVALID_STATE: { http: 409, message: "This action is not valid for the authorised user's current status." },
  CLT1_MANDATE_NOT_FOUND: { http: 404, message: "Client mandate not found." },
  CLT1_MANDATE_INVALID_STATE: { http: 409, message: "This action is not valid for the mandate's current status (present as a defensive guard; not triggerable via any Phase 3 route)." },
  CLT1_AUTHORISED_PARTY_NOT_FOUND: { http: 404, message: "Authorised party not found." },
  CLT1_AUTHORISED_PARTY_INVALID_STATE: { http: 409, message: "This action is not valid for the authorised party's current authority status." },
  CLT1_AUTHORISED_PARTY_SCREENING_REQUIRED: { http: 409, message: "Authorised-party screening must be pass/clear before authority can be activated." },
  CLT1_UBO_THRESHOLD_REQUIRED: { http: 409, message: "UBO identification threshold not met (present as a defensive guard; the threshold parameter is not yet defined and no Phase 4 route enforces it)." },
  CLT1_RELATED_PARTY_EDGE_NOT_FOUND: { http: 404, message: "Related-party edge not found." },
  CLT1_RELATED_PARTY_EDGE_INVALID_STATE: { http: 409, message: "This action is not valid for the related-party edge's current status." },
  CLT1_RELATED_PARTY_EDGE_DUPLICATE: { http: 409, message: "An active related-party edge already exists for this exact relationship." },
  CLT1_RELATED_PARTY_NODE_NOT_FOUND: { http: 404, message: "The referenced entity does not exist for the given entity_type." },
  CLT1_DUPLICATE_CANDIDATE_NOT_FOUND: { http: 404, message: "Duplicate candidate not found." },
  CLT1_DUPLICATE_CANDIDATE_INVALID_STATE: { http: 409, message: "This action is not valid for the duplicate candidate's current status." },
  CLT1_DUPLICATE_CANDIDATE_ALREADY_OPEN: { http: 409, message: "An open duplicate candidate already exists for this exact subject/matched/match_type tuple." },
  CLT1_DUPLICATE_NODE_NOT_FOUND: { http: 404, message: "The referenced entity does not exist for the given node type." },
  CLT1_DUPLICATE_SELF_REVIEW_BLOCKED: { http: 403, message: "The actor who created this application cannot also confirm or dismiss its duplicate candidate." },
  CLT1_DUPLICATE_REVIEW_REQUIRED: { http: 409, message: "An unresolved or confirmed duplicate candidate must be resolved before final approval." },
  CLT1_CLIENT_PROFILE_INVALID_STATE: { http: 409, message: "This lifecycle action is not valid for the client profile's current status." },
  CLT1_MANDATE_ALREADY_ACTIVE: { http: 409, message: "An active mandate already exists for this client." },
  CLT1_KYC_ROSTER_TOO_LARGE: { http: 409, message: "KYC roster exceeds the maximum supported size." },
  CLT1_KYC_ROSTER_STALE: { http: 409, message: "The authorised-party roster changed since the KYC outcome was computed." },
} as const satisfies Record<string, Clt1ErrorSpec>;

export type Clt1ErrorCode = keyof typeof CLT1_ERROR_CODES;

export class Clt1Error extends Error {
  readonly code: Clt1ErrorCode;
  readonly http: number;
  readonly details: ErrorDetail[];

  constructor(code: Clt1ErrorCode, opts?: { message?: string; details?: ErrorDetail[]; cause?: unknown }) {
    const spec = CLT1_ERROR_CODES[code];
    super(opts?.message ?? spec.message);
    this.name = "Clt1Error";
    this.code = code;
    this.http = spec.http;
    this.details = opts?.details ?? [];
    if (opts?.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}
