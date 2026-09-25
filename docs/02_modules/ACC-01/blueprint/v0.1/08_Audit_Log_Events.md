# ACC-01 Account Structure
## 08 Audit Log Events

## 1. Principles

1. Audit goes to SEC-01 through ACC-01's own client (no cross-service import).
2. **Every state-changing action fails closed if its audit event cannot be recorded** (`ACC1_AUDIT_REQUIRED`, 503) — the mutation and the audit reference commit together or not at all (`sec_audit_ref` is `NOT NULL` on history).
3. Every event carries: `event_type`, `severity`, `actor` (IAM user or `system:acc1`), `session_id` where present, `request_id`, `correlation_id`, `environment`, `client_id`, target identifiers, `approval_id` and `change_request_id` where applicable, `version_before/after`, `reason_code`, `caller_module` for internal seams.
4. **No PII, secrets or free text** in event bodies: identifiers, enumerated codes and references only.
5. Environment is recorded identically in all five environments; audit is never reduced for non-production (Doc 00 §21A rule 7).

## 2. Events

| Event type | Trigger | Severity |
|---|---|---|
| `acc1.change_requested` | Change request submitted | High |
| `acc1.change_cancelled` | Maker cancelled | Medium |
| `acc1.change_rejected` | Approval rejected | High |
| `acc1.change_expired` | TTL lapsed | Medium |
| `acc1.change_apply_started` | Apply claimed (`applying`) | Medium |
| `acc1.change_apply_failed` | Verify negative / precondition failed / uncertain | High |
| `acc1.change_apply_recovered` | Operator completed an `applying` request | High |
| `acc1.master_account_created` | Master account created | High |
| `acc1.subaccount_created` | Subaccount created (incl. default) | High |
| `acc1.account_profile_updated` | Name/description changed | Medium |
| `acc1.account_status_changed` | Any stored-status transition | High (Critical for `frozen`, `suspended`, `closing`, `closed`) |
| `acc1.account_restriction_applied` | Restriction applied | Critical |
| `acc1.account_restriction_activated` | Scheduled restriction became effective | Critical |
| `acc1.account_restriction_lifted` | Restriction lifted (with `lift_evidence_ref`) | Critical |
| `acc1.account_restriction_expired` | Timed restriction lapsed | High |
| `acc1.account_closure_initiated` | → `closing` | Critical |
| `acc1.account_closure_readiness_checked` | Attestations collected | High |
| `acc1.account_closure_blocked` | Completion refused | High |
| `acc1.account_closed` | → `closed` | Critical |
| `acc1.ownership_change_blocked` | An attempt to alter owner/identity/purpose was refused | Critical |
| `acc1.client_lookup_failed` | CLT-01 unreadable during a governed action | High |
| `acc1.sensitive_account_read` | Cross-client listing or status-history read by staff | High |
| `acc1.internal_caller_denied` | Internal seam presented an invalid/unknown capability secret | High |
| `acc1.limit_reached` | Master/subaccount limit refused a creation | Medium |
| `acc1.reconciliation_finding` | Structural reconciliation break (file 13) | High / Critical |

## 3. Not audited per call (by design)

`resolve` / `resolve-batch` / `scope-validate` / reconciliation extract are read-only hot-path seams: per-call audit would dwarf the platform's audit volume. They emit **metrics** (counts by `caller_module` and outcome, `unknown` rate) and audit only caller-authentication failures. The *decision evidence* for a consumer's action lives in the **consumer's** audit (it stores the `versions` tuple ACC-01 returned), which is the correct owner of that evidence.

## 4. Evidence and retention

Status history (`account_status_history`) is itself an append-only evidence table tied to `sec_audit_ref`. Retention class and period: **to be defined** (OQ-10) — recommended to align with client-record retention and the ≥ 6-year evidence posture already stated for execution records; no period is asserted here.
