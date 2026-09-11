/**
 * WLT-01 domain error catalogue.
 *
 * Same rationale as every prior module's own copy (services/aml1/src/lib/errors.ts /
 * services/clt1/src/lib/errors.ts / services/kyc1/src/lib/errors.ts / services/cfg1/src/lib/
 * errors.ts, mirrored, not imported — F3(c)): `@aix/foundation`'s `AppError` is intentionally
 * closed over `FndErrorCode`, and WLT-01-specific codes not in the shared foundation catalogue
 * get their own small parallel error type here, carrying the exact same on-wire shape
 * (`{code, message, details}` + `http`), so the request-context error handler can treat both
 * uniformly.
 *
 * PHASE 1B — exactly the 10 codes with a reachable throw site this phase. The accepted WLT-01
 * v1.2 blueprint catalogue (09_Error_Handling.md) defines 41 WLT-specific error codes; only the
 * subset Phase 1B's own registration/read/readiness routes can actually reach is registered here
 * — the same "add a code only when a reachable throw site exists" discipline every prior module's
 * own catalogue growth followed (mirrors AML-01 Phase 1's identical posture).
 *
 *   - WLT1_SERVICE_UNAVAILABLE          — DB pool unreachable (readiness probe / assertPoolAvailable).
 *   - WLT1_DESTINATION_NOT_FOUND        — GET by destination_id misses.
 *   - WLT1_DESTINATION_DUPLICATE        — natural-key re-check under lock, or the partial unique
 *     index's own `23505` backstop mapped to the same code.
 *   - WLT1_WALLET_ADDRESS_INVALID       — the raw input is not even SHAPED like a valid address for
 *     the given chain: whitespace, invisible/control characters, missing/wrong prefix, wrong hex
 *     body/Base58-alphabet/payload length, wrong network-prefix byte, the zero address, or a
 *     memo/tag supplied where none is permitted (see `lib/address/{ethereum,tron}.ts`'s own bounded
 *     reason codes).
 *   - WLT1_ADDRESS_CANONICALISATION_FAILED — the input IS shaped like a valid address (correct
 *     length/alphabet/prefix) but its own self-verifying checksum is wrong — an EIP-55 mixed-case
 *     checksum mismatch, or a TRON Base58Check checksum mismatch. Distinct from
 *     `WLT1_WALLET_ADDRESS_INVALID` because this category means "this could plausibly be a
 *     transcription error in an otherwise-real address", not "this was never a valid address
 *     shape".
 *   - WLT1_NAME_SERVICE_ALIAS_NOT_ALLOWED — alias-shaped raw input (dotted, e.g. `name.eth`),
 *     rejected before any canonicalisation attempt — never resolved, never stored.
 *   - WLT1_UNSUPPORTED_CHAIN            — no active `wlt1.chain_coverage` row for the requested
 *     `(chain, network)` pair (deny-by-default).
 *   - WLT1_CLIENT_STATUS_BLOCKED        — CLT-01 client not found, or status other than
 *     `active`/`active_limited`.
 *   - WLT1_CLT1_UNAVAILABLE             — CLT-01 timeout, network error, or a malformed/unparseable
 *     response body.
 *   - WLT1_AUDIT_REQUIRED               — a required audit/outbox write inside a WLT-01 transaction
 *     failed; the whole action (registration OR refusal-evidence recording) rolls back.
 *
 * PHASE 2C-B — exactly TWO codes added, both with a reachable throw site in
 * `lib/screening-application.ts`'s `applyNormalizedScreeningResult` (no route reaches either yet —
 * that function is called only from Phase 2C-B's own service-level tests this phase):
 *
 *   - WLT1_DESTINATION_INVALID_STATE    — an approved WLT implementation extension (not a literal
 *     WLT v1.2 blueprint code): the destination/screening-row lifecycle state does not permit the
 *     requested result-application transition — destination is not `pending_screening`, the target
 *     screening row is not `pending` (already terminal, or superseded by a newer
 *     `screening_result_version`), or the screening row does not belong to the given destination.
 *     Deliberately distinct from `WLT1_DESTINATION_NOT_FOUND` (the destination genuinely does not
 *     exist) — this code means the destination exists but is in the wrong lifecycle state for the
 *     operation attempted.
 *   - WLT1_VENDOR_RESULT_INVALID        — blueprint-backed (09_Error_Handling.md): the supplied
 *     evidence envelope's `providerId`/`providerAdaptorVersion` does not match the pending
 *     screening row's own immutable binding, or the normalized result's temporal fields are
 *     invalid (`issuedAtUtc` unparseable or excessively future-dated, `validUntilUtc` at or before
 *     `issuedAtUtc`, or the computed effective validity has already expired).
 *
 * PHASE 2C-D2 — exactly ONE code added, with a reachable throw site in
 * `routes/provider-receipt.ts`:
 *
 *   - WLT1_RECEIPT_CONFLICT             — an authenticated provider reused an existing
 *     `(provider_id, provider_result_id)` replay key with a body whose server-computed
 *     `payload_hash` differs from the immutable original — a genuine integrity conflict, never a
 *     harmless duplicate. The original `wlt1.vendor_result_inbox` row is never mutated; a
 *     `wlt1.provider_receipt_conflict_detected` audit is durably recorded instead.
 *
 * PHASE 2C-D3A — exactly ONE code added, with a reachable throw site in
 * `routes/provider-receipt.ts`:
 *
 *   - WLT1_RECEIPT_STALE                — an authenticated receipt (already past D2's replay/
 *     conflict classification) targets screening state or a historical adaptor-version context
 *     that can no longer be terminally applied, and provider redelivery of this EXACT receipt will
 *     never recover it: the target screening is no longer `pending` (already terminal, or the
 *     destination has moved off `pending_screening`), the target screening has been superseded by
 *     a newer `screening_result_version`, or the pending row's own frozen `provider_adaptor_version`
 *     is no longer present in the deployed version-addressed provider registry (or that exact
 *     version has no receipt-normalization capability at all). Recovery, if any, requires a future
 *     new-version rescreen — never a receipt replay. Deliberately distinct from
 *     `WLT1_VENDOR_RESULT_INVALID` (the receipt's own normalized content is malformed/inconsistent
 *     — a provider-side data problem, not a screening-state problem) and from
 *     `WLT1_RECEIPT_CONFLICT` (a content-integrity tamper signal, not a staleness signal).
 *
 * Deliberately NOT added this phase (reachable-throw-site discipline — mirrors this file's own
 * Phase 1B posture): `WLT1_VENDOR_SOURCE_UNAUTHORISED` (blueprint-backed, but receipt authentication
 * failure already reuses the shared foundation `SERVICE_IDENTITY_REQUIRED` code, not a WLT-local
 * one); `WLT1_PROVIDER_UNAVAILABLE` — deliberately never added at all; a provider timeout/outage/
 * error reuses the existing `WLT1_SERVICE_UNAVAILABLE` (both mean "WLT cannot complete this right
 * now, retry later", and the caller cannot act on the two differently). No IAM-02/CFG-01-unavailable
 * code (no IAM-02/CFG-01 integration exists yet).
 *
 * PHASE 3A-2 — exactly ONE code added, with a reachable throw site in
 * `routes/proof-of-control.ts`'s challenge-creation route:
 *
 *   - WLT1_POC_UNSUPPORTED               — the destination's `(chain, network)` pair has no Phase
 *     3A-supported Proof-of-Control verification scheme (everything except `ethereum`/`mainnet` —
 *     `tron`/`mainnet` included, pending Phase 3B), OR the destination's `wallet_type` is `hosted`
 *     (a custodial wallet's end-user does not hold the signing key a personal-message PoC needs).
 *
 * PHASE 3A-3 — exactly FOUR codes added, all with a reachable throw site in `routes/
 * proof-of-control.ts`'s new verify route (the third and final frozen Phase 3 route):
 *
 *   - WLT1_POC_CHALLENGE_NOT_FOUND       — the addressed `challenge_id` does not exist, or does not
 *     belong to the given `destination_id`/`client_id` (collapsed into ONE enumeration-resistant
 *     code — the caller can never distinguish "wrong destination", "wrong client", "wrong
 *     challenge_id", or "destination doesn't exist" from each other).
 *   - WLT1_POC_CHALLENGE_EXPIRED         — the addressed challenge's `expires_at_utc` has passed
 *     (either already persisted as `expired`, or discovered and transitioned during THIS request).
 *   - WLT1_POC_CHALLENGE_INVALID_STATE   — the addressed challenge is `failed`/`superseded`, OR is
 *     `verified` but the submitted signature's canonical hash does not match the persisted
 *     successful one (a genuinely different signature after verification is final — Model A has no
 *     re-verification path), OR a server-state evidence-integrity check failed (reconstructed
 *     message hash mismatch, unsupported persisted version/scheme/chain, destination-snapshot
 *     mismatch, or a defensive Model-A "another verified row already exists" guard) — all of these
 *     are workflow/evidence-state failures, never a cryptographic-attempt outcome, so none consumes
 *     an attempt or publishes a failed-proof audit.
 *   - WLT1_PROOF_OF_CONTROL_FAILED       — a syntactically well-formed signature was evaluated
 *     cryptographically against a genuinely `issued` (unexpired) challenge and rejected — invalid
 *     `v`/out-of-range `r`/`s`/high-`s`/unrecoverable point/recovered-address mismatch. Returned for
 *     BOTH a non-terminal invalid attempt (challenge remains `issued`) and the terminal max-attempt
 *     failure (challenge transitions to `failed`) — the caller cannot distinguish which from the
 *     HTTP response alone (Part BA: no reason code, no attempt count, no remaining-attempts count
 *     is ever exposed). A THIRD submission against an already-`failed` challenge instead returns
 *     `WLT1_POC_CHALLENGE_INVALID_STATE` above (no further attempt, no cryptography re-run).
 *
 * Malformed signature syntax (not `0x` + exactly 130 hex chars) is rejected by the route's own
 * TypeBox schema as the shared foundation `VALIDATION_ERROR` (400) — before authentication, before
 * the transaction, before any attempt is consumed — never a WLT-local code.
 *
 * PHASE 4A-1 — exactly THREE codes added, all with a reachable throw site in
 * `routes/destination-approval.ts`:
 *
 *   - WLT1_DESTINATION_APPROVAL_INVALID_STATE — approve/request or approve/apply was attempted
 *     against a destination that is not `pending_review`, whose latest wallet screening result is
 *     not `risk_status='clear'` or has expired, whose required Proof-of-Control (unhosted/unknown
 *     wallets) is missing, or (approve/apply only) whose locally re-checked state drifted from the
 *     snapshot captured before the IAM-02 execute-verify call. Deliberately distinct from the
 *     existing `WLT1_DESTINATION_INVALID_STATE` (Phase 2C-B's own screening-application-transition
 *     code) — this is Phase 4A-1's own whitelist-approval-eligibility gate, a different lifecycle
 *     concern with its own reason taxonomy.
 *   - WLT1_APPROVAL_REQUIRED             — IAM-02's baseline `checkPermission` genuinely denied the
 *     action, OR `verifyDecisionToken`/execute-verify reported `execution_authorised !== true`
 *     (including a Segregation-of-Duties denial when the requester and approver are the same
 *     actor — IAM-02's own enforcement, surfaced here as a single generic code, same discipline
 *     CLT-01/CFG-01/SEC-01 already apply to execute-verify failures).
 *   - WLT1_IAM2_UNAVAILABLE              — IAM-02 was unreachable, timed out, returned a non-2xx
 *     response, or returned a malformed/unparseable body, for either `checkPermission` or
 *     `verifyDecisionToken`. WLT-01's first IAM-02 integration; mirrors every prior module's own
 *     identical `<MODULE>_IAM2_UNAVAILABLE` code (AML-01, CLT-01, CFG-01, SEC-01, KYC-01) — never
 *     reused as `WLT1_CLT1_UNAVAILABLE`, which names an entirely different dependency.
 *
 * PHASE 4A-2 — exactly ONE code added, with a reachable throw site in `routes/evaluate-use.ts`:
 *
 *   - WLT1_AML_GATE_UNAVAILABLE          — a TECHNICAL failure of the AML-01 pre-transaction gate:
 *     non-2xx, timeout, network error, malformed envelope/body, an unknown `decision` value, a
 *     binding mismatch (`client_id`/`requested_action` do not match the request), an invalid/
 *     unparseable `decision_id`/timestamp, an already-expired `valid_until_utc`, or (WLT's own
 *     defensive check) an empty `evidence_provider_ids` on an otherwise-affirmative `allow`.
 *     Deliberately distinct from a legitimate AML `review`/`deny` outcome, which is a BUSINESS
 *     decision (`200 deny/aml_not_allowed`), never this code — WLT never reinterprets AML's own
 *     `reason_code`, and never synthesizes `allow` from any technical-failure path. P-ROSTER
 *     technical failures (404/409/5xx/timeout/network/malformed, and the empty/oversized-roster
 *     business cases) are likewise business denies (`aml_subjects_unavailable`/
 *     `aml_subject_limit_exceeded`), never this code — this code is reserved for the AML-01 call
 *     itself.
 *
 * ONGOING RESCREENING — exactly ONE code added, with a reachable throw site in
 * `routes/rescreening-run.ts`:
 *
 *   - WLT1_RESCREENING_RUN_ACTIVE     — `POST /internal/wlt1/rescreening-runs` was called while a
 *     non-stuck run (`status='running'`, `started_at_utc` within the stuck threshold) already
 *     exists. Global and scope-agnostic — a manual `scope:"destination"` request during an active
 *     `periodic_due` run (or vice versa) gets the identical code. No queueing, no priority bypass.
 *     A `running` row PAST the stuck threshold is instead silently reclaimed (marked `failed`) and
 *     does not produce this code.
 *
 * FIAT PAYOUT DESTINATIONS (APAC) — exactly THREE codes added, all with a reachable throw site in
 * `routes/payout-destinations.ts`:
 *
 *   - WLT1_ACCOUNT_IDENTIFIER_INVALID   — a country-profile structural validation failure: a
 *     malformed account digit string (empty, non-digit, all-zero, below/above the profile's own
 *     length bounds), a structurally invalid or country-mismatched BIC, or a
 *     required-but-missing/forbidden-but-present branch identifier. Never echoes the rejected raw
 *     value — carries only a bounded `details.issue` reason code.
 *   - WLT1_FIAT_RAIL_NOT_SUPPORTED       — no `wlt1.fiat_rail_coverage` row exists for the
 *     requested `(rail, bank_country, currency)` triple with BOTH `coverage_status='supported'`
 *     AND `activation_status='active'` (deny-by-default) — covers an unsupported corridor and a
 *     technically-supported-but-not-yet-operationally-active one identically.
 *   - WLT1_BENEFICIARY_VERIFICATION_UNAVAILABLE — reserved for a future dedicated verification-
 *     unavailable signal; the current `assess` route instead reuses the existing
 *     `WLT1_SERVICE_UNAVAILABLE` for its own "both evidence domains failed technically" case
 *     (mirrors this file's own established "do not invent a second code for the same caller
 *     action" discipline — see the `WLT1_PROVIDER_UNAVAILABLE`-was-never-added precedent above).
 *   - WLT1_SENSITIVE_READ_LOG_REQUIRED   — Sensitive Read Logging (FR-018): the
 *     `wlt1.sensitive_destination_read` audit-evidence transaction (`lib/sensitive-read.ts`)
 *     failed to commit before a sensitive Proof-of-Control response (a full canonical wallet
 *     address) would otherwise have been released. Fail closed — the sensitive response is never
 *     sent.
 *
 * EVIDENCE EXPORT — exactly THREE codes added, all with a reachable throw site in
 * `routes/evidence-export.ts`:
 *
 *   - WLT1_EVIDENCE_EXPORT_SCOPE_INVALID — the requested export scope is invalid: an unknown
 *     `evidence_types` value, a duplicate `evidence_types` entry (never silently deduplicated), a
 *     malformed/offset-less `from_utc`/`to_utc`, `from_utc >= to_utc`, or the bounded collection
 *     strategy discovered the total record count across every requested evidence-type array would
 *     exceed `WLT1_EVIDENCE_EXPORT_MAX_RECORDS` (never silently truncated).
 *   - WLT1_EVIDENCE_EXPORT_NOT_FOUND     — the addressed `export_id` does not exist, or does not
 *     belong to the given `client_id` (collapsed into ONE enumeration-resistant code — the caller
 *     can never distinguish "wrong client" from "unknown export_id"). Also reused for the WLT-side
 *     IAM-02 double-consume backstop: a `23505` on `uq_wlt1_evidence_export_approval_ref` maps to
 *     `WLT1_APPROVAL_REQUIRED` instead (an authority failure, not a not-found), never this code.
 *   - WLT1_EVIDENCE_EXPORT_LOG_REQUIRED  — the `wlt1.evidence_exported` disclosure-audit
 *     transaction (mirrors `lib/sensitive-read.ts`'s own identical fail-closed contract) failed to
 *     commit before the download route would otherwise have released export bytes. Fail closed —
 *     no export content is ever sent without its accompanying disclosure log having committed.
 *
 * INBOUND-SOURCE SCREENING — exactly TWO codes added, both with a reachable throw site in
 * `routes/inbound-source-screening.ts`:
 *
 *   - WLT1_INBOUND_SCREENING_UNAVAILABLE — the wallet-analytics provider returned `unavailable`
 *     or `invalid_response` (network error, timeout, malformed/untrusted response), OR the
 *     `wlt1.inbound_source_screened` generated-audit transaction failed to commit. Fail closed —
 *     no evidence row, no audit, no `completeIdempotent`; the Idempotency-Key remains `processing`
 *     and recovery requires a NEW key (never a same-key reclaim — foundation has none). Also
 *     reused for the frozen divergent-provider-outcome ruling: a post-`23505` concurrency loser
 *     whose own (discarded) provider observation differs from the committed winner's persisted
 *     `risk_status` fails closed here rather than silently replaying a possibly-more-favourable
 *     winner result the loser itself never actually observed.
 *   - WLT1_INBOUND_TRANSFER_CONFLICT     — a `23505` on the exact named constraint
 *     `uq_wlt1_inbound_source_transfer` (`client_id, chain, network, transaction_ref`), OR the
 *     pre-provider existing-transfer lookup, found an existing row for the SAME transfer whose
 *     `address_hash` does NOT match the current request's — a genuine caller defect (the same
 *     `transaction_ref` reused for two different source addresses), never treated as a replay.
 *
 * STUCK-SCREENING OPERATIONAL CLOSURE — exactly TWO codes added, both with a reachable throw site
 * in `routes/stuck-screening.ts`:
 *
 *   - WLT1_STUCK_SCREENING_NOT_FOUND      — no `wallet_screening_result` row exists for the
 *     addressed `screening_result_id`. Thrown from the non-authoritative pre-read, BEFORE
 *     `beginIdempotent` — a deterministic lookup failure never burns an Idempotency-Key.
 *   - WLT1_STUCK_SCREENING_INVALID_STATE  — the row exists but recovery cannot apply: not
 *     `risk_status = 'pending'` (already terminal, including an already-`failed` row reached via a
 *     NEW Idempotency-Key — never a domain replay), its destination is not `pending_screening`,
 *     its pending age has not yet reached the configured threshold, or the authoritative
 *     `destination_id` cross-check failed. Never conflated with `NOT_FOUND` — a known row in the
 *     wrong state is always this code, never a 404.
 *
 * PUBLIC CLIENT SURFACE — exactly THREE codes added, all with a reachable throw site in the new
 * `plugins/public-auth.ts` preHandler shared by all six public `/wlt1/*` routes. Reconciled
 * against the existing shared foundation catalogue first (`@aix/foundation`'s `FND_ERROR_CODES`)
 * — the frozen architecture's own proposed `PUBLIC_RATE_LIMITED` name is deliberately NOT added
 * here: for a GENUINE quota exceed, the shared `RATE_LIMITED` (429) code already carries the
 * exact required semantics, so every public route reuses `AppError("RATE_LIMITED")` directly (its
 * `Retry-After` preserved end to end). The enforcement-INDETERMINATE case (engine unavailable, DB
 * failure, missing/inactive/malformed policy row, or any other non-allow/non-429 outcome) is
 * DIFFERENT: DEC-009 requires FND-01's own internal `RATE_LIMIT_UNAVAILABLE` code never leak past
 * a public boundary as-is — `checkPublicRateLimit` (`plugins/public-auth.ts`) maps it instead to
 * the ALREADY-EXISTING `WLT1_SERVICE_UNAVAILABLE` below (the same generic "WLT cannot complete
 * this right now" code the DB-pool/provider-outage paths already reuse), not a new code. Likewise
 * CLT-01 membership-resolution unavailability reuses the EXISTING `WLT1_CLT1_UNAVAILABLE` above
 * (same dependency, same failure semantics, same corrective action as the pre-existing
 * client-status check) rather than a new code:
 *
 *   - WLT1_AUTH_REQUIRED             — no bearer token was presented, IAM-01 introspection
 *     returned `valid:false` (or any collapsed-negative outcome), or the token is otherwise
 *     rejected. Distinct from the shared `SERVICE_IDENTITY_REQUIRED` (401) — that code's own
 *     message ("Internal service identity required") is internal-caller-shaped and would be
 *     confusing on a public client-facing route; this is WLT-01's own client-facing equivalent,
 *     mirroring IAM-01's own `AUTH_SESSION_REQUIRED` naming spirit (WLT cannot import IAM-01's
 *     error catalogue — F3(c) — so this is a fresh, WLT-prefixed copy of the same concept).
 *   - WLT1_CLIENT_AUTHORITY_REQUIRED — the caller is genuinely authenticated (a valid IAM-01
 *     session) but has no eligible client authority for this request: `user_class` is not
 *     `client`/`client_approver`, no active CLT-01 membership resolves for the introspected
 *     `user_id`, more than one eligible membership resolves and no (or a non-matching)
 *     `X-AIX-Client-Id` narrowing header was supplied to disambiguate, or a supplied
 *     `X-AIX-Client-Id` does not match any membership the caller actually holds. Deliberately one
 *     generic code for every one of these — never a state-specific reason that would let a caller
 *     enumerate which membership(s) exist. 403, not 401 — the caller IS authenticated, it simply
 *     lacks authority for this specific client-scoped action.
 *   - WLT1_IAM01_UNAVAILABLE          — IAM-01's introspection call itself failed: timeout,
 *     network error, a non-200/non-401 response, or a malformed/unparseable response body/missing
 *     field. Mirrors every other WLT-01 dependency's own identical `<DEP>_UNAVAILABLE` naming
 *     precedent (`WLT1_CLT1_UNAVAILABLE`/`WLT1_IAM2_UNAVAILABLE`/`WLT1_AML_GATE_UNAVAILABLE`) —
 *     WLT-01's first IAM-01 integration. Deliberately distinct from `WLT1_AUTH_REQUIRED` — an
 *     indeterminate IAM-01 outcome must never be treated as "not authenticated" (which a public
 *     caller could not distinguish from a genuinely invalid token) or as authenticated; it is its
 *     own fail-closed 503.
 */
import type { ErrorDetail } from "@aix/foundation";

export interface Wlt1ErrorSpec {
  http: number;
  message: string;
}

export const WLT1_ERROR_CODES = {
  WLT1_SERVICE_UNAVAILABLE: { http: 503, message: "WLT-01 database is not reachable." },
  WLT1_DESTINATION_NOT_FOUND: { http: 404, message: "Destination not found." },
  WLT1_DESTINATION_DUPLICATE: { http: 409, message: "This destination is already registered for this client." },
  WLT1_WALLET_ADDRESS_INVALID: { http: 422, message: "The wallet address is invalid." },
  WLT1_ADDRESS_CANONICALISATION_FAILED: { http: 422, message: "The address could not be canonicalised." },
  WLT1_NAME_SERVICE_ALIAS_NOT_ALLOWED: { http: 422, message: "A name-service alias cannot be registered as a destination." },
  WLT1_UNSUPPORTED_CHAIN: { http: 409, message: "This chain/network is not currently supported." },
  WLT1_CLIENT_STATUS_BLOCKED: { http: 409, message: "This client is not in a state that permits destination registration." },
  WLT1_CLT1_UNAVAILABLE: { http: 503, message: "CLT-01 client-status service is not reachable." },
  WLT1_AUDIT_REQUIRED: { http: 503, message: "Audit/outbox write failed; action rolled back." },
  WLT1_DESTINATION_INVALID_STATE: { http: 409, message: "The destination or its screening attempt is not in a state that permits this operation." },
  WLT1_VENDOR_RESULT_INVALID: { http: 422, message: "The screening result evidence is invalid." },
  WLT1_RECEIPT_CONFLICT: { http: 409, message: "This provider result was already recorded with different content." },
  WLT1_RECEIPT_STALE: { http: 409, message: "This receipt can no longer be applied to the target screening attempt." },
  WLT1_POC_UNSUPPORTED: { http: 409, message: "Proof-of-Control is not currently supported for this destination." },
  WLT1_POC_CHALLENGE_NOT_FOUND: { http: 404, message: "Proof-of-Control challenge not found." },
  WLT1_POC_CHALLENGE_EXPIRED: { http: 409, message: "This Proof-of-Control challenge has expired." },
  WLT1_POC_CHALLENGE_INVALID_STATE: { http: 409, message: "This Proof-of-Control challenge is not in a state that permits this operation." },
  WLT1_PROOF_OF_CONTROL_FAILED: { http: 422, message: "The submitted proof of control is invalid." },
  WLT1_DESTINATION_APPROVAL_INVALID_STATE: { http: 409, message: "This destination is not eligible for whitelist approval." },
  WLT1_APPROVAL_REQUIRED: { http: 403, message: "A valid IAM-02 approval is required for this action." },
  WLT1_IAM2_UNAVAILABLE: { http: 503, message: "IAM-02 could not be reached." },
  WLT1_AML_GATE_UNAVAILABLE: { http: 503, message: "AML-01 pre-transaction gate could not be reached or returned an invalid response." },
  WLT1_RESCREENING_RUN_ACTIVE: { http: 409, message: "Another rescreening run is already in progress." },
  WLT1_ACCOUNT_IDENTIFIER_INVALID: { http: 422, message: "The bank account identifier is invalid for the given country profile." },
  WLT1_FIAT_RAIL_NOT_SUPPORTED: { http: 409, message: "This fiat payout rail/country/currency corridor is not currently supported." },
  WLT1_BENEFICIARY_VERIFICATION_UNAVAILABLE: { http: 503, message: "Beneficiary verification could not be completed." },
  WLT1_SENSITIVE_READ_LOG_REQUIRED: { http: 503, message: "The sensitive read could not be logged; the read was denied." },
  WLT1_EVIDENCE_EXPORT_SCOPE_INVALID: { http: 422, message: "The requested evidence export scope is invalid." },
  WLT1_EVIDENCE_EXPORT_NOT_FOUND: { http: 404, message: "Evidence export not found." },
  WLT1_EVIDENCE_EXPORT_LOG_REQUIRED: { http: 503, message: "The evidence export disclosure could not be logged; the download was denied." },
  WLT1_INBOUND_SCREENING_UNAVAILABLE: { http: 503, message: "Inbound-source screening could not be completed." },
  WLT1_INBOUND_TRANSFER_CONFLICT: { http: 409, message: "This inbound transfer reference is already associated with a different source address." },
  WLT1_STUCK_SCREENING_NOT_FOUND: { http: 404, message: "Stuck screening not found." },
  WLT1_STUCK_SCREENING_INVALID_STATE: { http: 409, message: "This screening is not eligible for stuck-screening recovery." },
  WLT1_AUTH_REQUIRED: { http: 401, message: "Authentication required." },
  WLT1_CLIENT_AUTHORITY_REQUIRED: { http: 403, message: "No eligible client authority for this request." },
  WLT1_IAM01_UNAVAILABLE: { http: 503, message: "IAM-01 could not be reached." },
} as const satisfies Record<string, Wlt1ErrorSpec>;

export type Wlt1ErrorCode = keyof typeof WLT1_ERROR_CODES;

export class Wlt1Error extends Error {
  readonly code: Wlt1ErrorCode;
  readonly http: number;
  readonly details: ErrorDetail[];

  constructor(code: Wlt1ErrorCode, opts?: { message?: string; details?: ErrorDetail[]; cause?: unknown }) {
    const spec = WLT1_ERROR_CODES[code];
    super(opts?.message ?? spec.message);
    this.name = "Wlt1Error";
    this.code = code;
    this.http = spec.http;
    this.details = opts?.details ?? [];
    if (opts?.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}
