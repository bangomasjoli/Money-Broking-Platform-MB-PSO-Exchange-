# ACC-01 Account Structure
## 08 Audit Log Events (v0.3)

## 1. Principles

1. Audit goes to SEC-01 through ACC-01's own client (no cross-service import).
2. **Every state-changing action fails closed if its audit event cannot be recorded** (`ACC1_AUDIT_REQUIRED`, 503) — the mutation and the audit reference commit together or not at all (`sec_audit_ref` is `NOT NULL` on history).
3. Every event carries: `event_type`, `severity`, `actor` (IAM user or `system:acc1`), **`authenticated_actor_id` and `requested_by` where an apply is involved (R2)**, `session_id` where present, `request_id`, `correlation_id`, `environment`, `client_id`, target identifiers, `approval_id` and `change_request_id` where applicable, `version_before/after`, `reason_code`, `caller_module` for internal seams.
4. **No PII, secrets or free text** in event bodies: identifiers, enumerated codes and references only. `blocked_scopes`, `source_type`, `reason_code` follow the confidentiality rules of file 16 §3.
5. Environment is recorded identically in all five environments; audit is never reduced for non-production (Doc 00 §21A rule 7).

## 2. Events

| Event type | Trigger | Severity |
|---|---|---|
| `acc1.change_requested` | Change request submitted | High |
| `acc1.change_cancelled` | Maker cancelled | Medium |
| `acc1.change_expired` | TTL lapsed | Medium |
| `acc1.change_apply_denied` | Apply refused: verify non-affirmative, attested-fact mismatch, precondition failed, dependency prerequisite unmet, or rolled back after verify (request stays `requested`; best-effort, audit-only when the cause is not itself an audit failure) | High |
| `acc1.dependency_not_satisfied` | A governed operation refused because a named `DEP-*` prerequisite is not evidenced (`ACC1_DEPENDENCY_NOT_SATISFIED`); records the dependency id and the evidence `provider` (`real`/`test_double`) — **never an environment-based decision** | High |
| `acc1.actor_binding_mismatch` | Session principal ≠ stored `requested_by` at apply/cancel, or an attested identity did not match (`ACC1_ACTOR_BINDING_MISMATCH`); both identities recorded | Critical |
| `acc1.master_account_created` | Master account created | High |
| `acc1.subaccount_created` | Subaccount created (incl. default) | High |
| `acc1.account_profile_updated` | Name/description changed | Medium |
| `acc1.account_status_changed` | Any stored-status transition | High (Critical for `frozen`, `suspended`, `closing`, `closure_sealed`, `closed`, and any abort recovery) |
| `acc1.account_restriction_applied` | Restriction applied | Critical |
| `acc1.account_restriction_activated` | Scheduled restriction became effective — by housekeeping **or inline inside a governed lift** (cause recorded) | Critical |
| `acc1.account_restriction_lifted` | Restriction lifted (with `lift_evidence_ref`); records whether an inline activation preceded it | Critical |
| `acc1.account_restriction_cancelled` | **(R2-F07)** Scheduled, not-yet-effective restriction cancelled (governed) | Critical |
| `acc1.account_restriction_expired` | Timed restriction lapsed | High |
| `acc1.account_closure_initiated` | → `closing` (master + default + listed children in one transaction; records `closure_cycle`) | Critical |
| `acc1.account_closure_readiness_checked` | **Pre-seal** readiness collected (per attester, `closure_cycle_observed`, result, W_pre) | High |
| `acc1.account_closure_sealed` | → `closure_sealed` on the **final checker approval**: barrier set; records `closure_seal_version`, `closure_sealed_at_version`, approval ids | Critical |
| `acc1.account_closure_attested` | **Post-barrier** attestation collected (per attester, `seal_version_observed`, watermark evidence, status) | High |
| `acc1.account_closure_blocked` | Completion refused (per-attester outcome codes) | High |
| `acc1.account_closure_aborted` | **(R2, ACC-R2-HD-03)** Governed abort/recovery from `closing` or `closure_sealed`: barrier cleared, evidence invalidated, versions bumped, projection restored; records `reason_code`, blocking evidence, both approval identities | **Critical** |
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

Status history (`account_status_history`) is itself an append-only evidence table tied to `sec_audit_ref`. **No hard deletion.** Retention follows the platform/client-record retention policy **once it is formally defined** (DCR-ACC-GOV-06); ACC-01 sets no period and must not introduce one that could conflict. Until then: retain everything.
