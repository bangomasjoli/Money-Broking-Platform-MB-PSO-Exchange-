# Principal Fintech Platform Architect Review — IAM-02 RBAC / Permission Guard / SoD v1.0

| Item | Details |
|---|---|
| Reviewed pack | IAM-02 RBAC / Permission Guard / SoD Blueprint Pack v1.0 (16 files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 02–11 v1.2, FND-01 v1.2, IAM-01 v1.2 |
| Review type | Principal Fintech Platform Architect — Initial Blueprint Review |
| Verdict | Strong foundation; **5 critical gaps** must be closed before acceptance. Most serious is C1 — no approval-to-execution binding, which makes maker-checker defeatable. |

---

## 0. Summary

IAM-02 is a well-structured blueprint that inherits the FND-01 template cleanly (schema-isolated `role_iam2_runtime`, scheduler missed-run detection, audit envelope) and the IAM-01 contracts (step-up assertion ref, SEC-01 audit authority, freeze signal). Default-deny, precedence ordering, licence-lock supremacy, and the break-glass / SoD / maker-checker skeletons are all present and coherent. Five critical gaps remain — they matter disproportionately because IAM-02 is the authorization engine sitting in front of money movement.

---

## Critical Gaps

### C1 — Approval/decision-to-execution binding is missing (approve-then-modify + TOCTOU) — **HIGHEST PRIORITY**
**Area:** 04 §4 (approvals), 05 §2.7/2.8 (`approval_request.payload_ref`, `approval_decision`), 02 WF-IAM02-04, WF-IAM02-01.

The approval request stores a `payload_ref` but nothing binds **what was approved** to **what executes**. Two concrete failures:
- **Approve-then-modify:** a maker submits a withdrawal for 10,000, the checker approves the `payload_ref`, then the maker mutates the underlying payload to 500,000 before execution. Nothing detects the change.
- **Check-then-revoke (TOCTOU):** `permission/check` returns `allow` at T; the role is revoked at T+1; the action executes at T+2 on the stale allow. Cache invalidation alone does not close this — there is no decision token consumed atomically at execution.

Needed: an immutable payload **hash** captured at approval-request creation and re-verified at execution (mismatch ⇒ block + Critical audit); and a permission **decision token** bound to `{actor, action, entity, payload_hash, cache_version}` that the executing module must present and that is re-validated at commit. Without this, C1 makes maker-checker, SoD, and step-up all bypassable after the fact.

### C2 — No guard-coverage assurance (silent unprotected-action bypass)
**Area:** 01 §5.2 / FR-005 ("every protected action must call the guard"), 13 (reconciliation).

FR-005 is aspirational — nothing *guarantees* a downstream endpoint actually calls `permission/check`. An endpoint that simply never calls the guard bypasses 100% of IAM-02 silently, and no test or reconciliation would catch it. This is the authorization analogue of the IAM-01 "central audit authority" pattern. Needed: a **protected-action registry** (canonical action → required permission_code + policy), a build/CI + runtime reconciliation that every sensitive action resolves to a registered guard call (orphan-action detection), and a fail-closed default for any sensitive action not in the registry.

### C3 — SoD `risk_acceptance` is an unspecified bypass, and IAM-02's own admin controls lack meta-SoD
**Area:** 05 §2.9 (`sod_rule.enforcement = block|risk_acceptance`), 02 WF-IAM02-05, 07 §5.

`risk_acceptance` is a legitimate-looking hole: there is no rule on **who** may accept the risk, no independent approval (should require Compliance + Management, non-self, step-up), no expiry, and no periodic re-attestation. Critical-severity conflicts should be **block-only** (never risk-acceptable). Separately, IAM-02 governs SoD for the whole platform but does not harden its *own* keystone permissions: the editor of `iam2.sod.manage` must not also hold `role.assign_user` / `permission.assign_role` (otherwise: disable a rule → self-assign → re-enable). SoD-matrix changes need dual control (security + compliance) + step-up + **matrix versioning and tamper/integrity reconciliation** that no critical rule was silently disabled.

### C4 — Break-glass has no privilege ceiling and can self-perpetuate
**Area:** 01 §5.10, 02 WF-IAM02-08, 05 §2.13 (`requested_permissions jsonb`).

Break-glass grants arbitrary `requested_permissions` with no defined ceiling. It must not be able to grant permission-administration itself (`iam2.role.*`, `iam2.permission.*`, `iam2.sod.manage`, licence controls) — otherwise break-glass becomes a path to *durable* privilege, defeating its own time-box. Also missing: an explicit **break-glass-eligible permission whitelist**, a **maximum duration ceiling**, and a **concurrent-grant limit per user**. Current controls (approver ≠ recipient, step-up, expiry, post-review) are good but do not bound *what* can be granted.

### C5 — Depends on CFG-01 (licence-lock source) and SEC-01 (audit authority) that don't exist yet — no interim contract + dual-source-of-truth risk
**Area:** 05 §2.2 (`permission.licence_locked` local boolean), 08 §1 (SEC-01 authoritative), 07 §3, 15 §1.

IAM-02's licence-lock supremacy depends on CFG-01 for licence-lock **state**, and its audit authority depends on SEC-01 — **neither module is built** (both are listed as *downstream* of IAM-02, yet IAM-02 consumes them). Meanwhile `iam2.permission.licence_locked` is a **local copy** of the lock state → a dual-source-of-truth drift risk against 00 v1.3. This is the same sequencing hole as IAM-01's C2 (which routed to the not-yet-built IAM-02). Needed: an interim contract — until CFG-01, the licence-locked/prohibited permission set is a **config-sealed list matching 00 v1.3** (no runtime grant path), with mandatory reconciliation against CFG-01 once it exists; and an interim audit-authority statement until SEC-01, mirroring IAM-01 §2.16.

---

## Recommended Corrections

1. **Resolve the service-account-approver contradiction.** 05 §2.9 constraint 2 says a service account cannot approve "*unless policy explicitly allows system approval*" — this "unless" contradicts prohibited-behaviour #20 and TC-063 (hard block). Remove the loophole: automated/system approval is a distinct, tightly-scoped concept that never satisfies the human checker for financial maker-checker.
2. **Replace vague qualifiers.** "where required" / "where applicable" recur in 02 WF-IAM02-09 (session revalidation), 01 §7.1.7 (freeze signal), and cache-invalidation paths — the same ambiguity flagged in IAM-01 C3. Make revocation → cache-invalidation + IAM-01 re-evaluation **mandatory and deterministic** on any privilege reduction, and define the propagation SLA (currently Open Item 8).
3. **Approval concurrency + collusion.** Add a DB unique constraint on `approval_decision(approval_id, approver_user_id)` and atomic `approved_count` increment (prevents double-count race); require dual approvers to be **distinct and mutually non-conflicting** under SoD, not just distinct from the maker.
4. **Cache must be positive-version-checked, not TTL-only.** A decision must fail closed if its `cache_version` is older than the latest `permission_cache_version.invalidated_at_utc` for the subject (05 §2.15) — TTL expiry alone leaves a stale-allow window.
5. **Delegation depth.** Prohibit re-delegation (a delegate cannot further delegate) and ensure delegated approvals count against SoD / self-approval under *both* the delegator and delegate identities (02 WF-IAM02-06).
6. **Bind the permission decision to the IAM-01 session / auth_level** so a decision is invalidated on freeze or step-down mid-flight (ties to C1's decision token).
7. **Tighten 05 §2.5 deny-override + licence-lock interaction** — confirm a `licence_locked` / `prohibited` permission can never be satisfied by a `user_permission_override` allow (state it explicitly; precedence in 07 §7 implies it but the table does not constrain it).

---

## Additional Parameters to Define

```txt
# Approval / decision binding (C1)
approval_payload_immutable                = true
approval_payload_hash_verified_at_exec    = true
permission_decision_token_bound_to        = actor_action_entity_payloadhash_cacheversion
permission_decision_bound_to_session      = true

# Guard coverage (C2)
protected_action_registry_enforced        = true
unregistered_sensitive_action             = fail_closed

# SoD (C3)
sod_critical_conflict_enforcement         = block_only
sod_risk_acceptance_requires              = compliance_plus_management_dual_nonself_stepup
sod_risk_acceptance_max_duration_days     = to_be_defined
sod_risk_acceptance_reattestation_days    = to_be_defined
sod_matrix_change_requires                = dual_security_compliance_plus_stepup
sod_matrix_integrity_reconciliation       = enabled
iam2_admin_meta_sod                       = matrix_editor_ne_role_assigner

# Break-glass (C4)
break_glass_eligible_permission_set       = explicit_whitelist
break_glass_cannot_grant                  = iam2_admin,sod_manage,licence_control
break_glass_max_duration_minutes          = to_be_defined
break_glass_max_concurrent_per_user       = to_be_defined

# Interim dependencies (C5)
licence_lock_source_until_cfg01            = config_sealed_list_matching_00_v1.3
licence_locked_permission_runtime_grant    = prohibited
audit_authority_until_sec01                = iam2_local_index_nonauthoritative
cfg01_licence_lock_reconciliation          = required_when_available

# Cache / revocation (corrections 2,4)
permission_cache_positive_version_required = true
revocation_propagation_sla_seconds         = to_be_defined
dual_approvers_must_be_distinct            = true
dual_approvers_must_be_non_conflicting     = true
delegation_redelegation                    = prohibited
```

---

## Consistency Note

Inheritance from FND-01 and IAM-01 is clean and the licence-lock prohibited set (07 §3) matches 00 v1.3. Three consistency issues: (a) the **service-account-approver contradiction** between 05 §2.9 and prohibited #20 / TC-063 (correction 1); (b) the **"where required/applicable" vagueness** recurring from IAM-01 C3 (correction 2); and (c) IAM-02 lists **CFG-01 and SEC-01 as downstream** (01 §7.2) while functionally **depending on them** for licence-lock state and audit authority (C5) — the dependency direction needs reconciling, most likely by making the licence-lock and audit-authority *contracts* explicit and interim-sourced until those modules ship.

---

## Top Priorities

1. **C1** — approval payload hash + decision-token binding (defeats approve-then-modify and check-then-revoke). Nothing else matters if this stays open.
2. **C2** — guard-coverage registry + orphan-action reconciliation.
3. **C5** — interim licence-lock source (config-sealed to 00 v1.3) + audit-authority contract until CFG-01 / SEC-01 exist.
4. **C3 / C4** — close the SoD `risk_acceptance` bypass and bound break-glass privilege / self-perpetuation.
