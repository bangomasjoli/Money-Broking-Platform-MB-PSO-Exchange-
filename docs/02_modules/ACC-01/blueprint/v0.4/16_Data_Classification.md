# ACC-01 Account Structure
## 16 Data Classification (v0.4)

Classification labels follow the CLT-01 pack's vocabulary (Restricted / Personal Data / Security Critical) for consistency. The platform's canonical classification scheme is `SEC-01`/Doc 09 owned; if it differs, it wins and this file is amended.

## 1. Data inventory

| Data | Classification | Protection |
|---|---|---|
| `master_account_id`, `subaccount_id` | Restricted | Opaque, non-derivable; internal to authenticated callers |
| `client_id` on an account | Restricted | Owner link; access controlled; never returned to a foreign client |
| `display_name`, `description`, subaccount `name` | Restricted; **must not contain personal data** | Length cap; guidance; access controlled |
| `purpose` | Restricted | Label only |
| Account `status`, effective status, `blocked_scopes` | Restricted / Security Critical | Integrity: trigger-enforced, append history |
| Restriction: `kind`, `scopes`, `reason_code`, `source_type` | Restricted / Security Critical | Reason and source are **codes**, not narrative; freeze existence can be sensitive (tipping-off) — see §3 |
| Restriction `source_ref`, `lift_evidence_ref` | Restricted | Reference only, never document content |
| Change request payload | Restricted / Security Critical | Minimal, canonicalised, no PII |
| `payload_hash`, `approval_id` | Security Critical | Integrity evidence |
| Status history, **closure readiness, closure attestations, closure recovery rows, closure seal pins, closure family and family-member rows (R3)** (incl. `seal_version_observed`, watermarks, resolution-version evidence, in-flight status, balance *state*, drained-state counts, payload hashes, contract references) | Restricted / Security Critical | Append-only evidence; **no amounts** (states/counts/codes only); **no hard deletion** — retained per the platform/client-record retention policy once defined (ACC-01 sets none) |
| `approval_id`, `approval_id_source`, attested apply-actor/approver/policy ids | Security Critical | Integrity evidence; `caller_asserted` values are labelled unverified |
| `closure_barrier`, `closure_cycle`, `closure_seal_version` | Restricted / Security Critical | Integrity: trigger-enforced; barrier cleared only by a governed recovery |
| Dependency verification results (`DEP-*`, `provider`, `evidence_failure`, attested entitlement evidence reference, `actor_assertion_authority`, credential-scope statement) | Restricted / Security Critical | Per-call evidence recorded in audit and on applied requests; **not configuration**; contains no secret; the dedicated peer credentials themselves are Secret |
| Internal consumer capability secrets; **dedicated CLT-01 read-scoped and IAM-02 verify-scoped credentials** | Secret | Environment/secret store only; never logged; unique (boot check); **never a general CLT-01/IAM-02 token in any environment** |
| Audit events | Per SEC-01 | Codes and identifiers only |

## 2. Prohibited data (ACC-01 must not store)

1. Legal name, registration number, UBO, mandate, KYC/AML outcome beyond the creation snapshot of `client_status`/`client_class`.
2. Balances, amounts, limits, prices, holdings, ledger identifiers.
3. Wallet addresses, bank/payment-instrument details, credentials, API keys, private keys.
4. Free-text reasons, case narratives, sanctions/AML details (references and codes only).
5. Any personal data of individuals.
6. Cached copies of CLT-01 status (staleness hazard, blueprint §14.4).

## 3. Confidentiality of restrictions

A freeze or restriction can be legally sensitive (an AML-driven restriction must not tip off the client; WF-26 step 8 "notification issued **where permitted**"). Therefore: client-facing routes (phase 6) expose the *effect* the client is entitled to see and never `source_type`, `source_ref`, `reason_code` or which trigger applied; staff reads of restriction detail require `acc1.restriction.read` and the sensitive-read logging of file 08; `resolve` returns explanatory `blocked_scopes`, status and `applied_restriction_ids` to internal consumers but no `source_*` fields. What a client may be told is a compliance decision (OQ-06), not an ACC-01 default.
