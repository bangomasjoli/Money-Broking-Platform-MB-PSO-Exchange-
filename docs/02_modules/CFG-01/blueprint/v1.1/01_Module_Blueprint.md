# CFG-01 Feature Flag / Licence Lock  
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | CFG-01 |
| Module name | Feature Flag / Licence Lock |
| Pack version | v1.1 |
| Status | Revised after Claude Opus review; config integrity, Exchange activation ceremony, IAM-02 gate binding, asymmetric audit fail-closed, all-environment prohibited lock, kill-switch token revocation, and prohibited-registry version binding added |
| Platform | AIX Money Broking + PSO Platform |
| Licence posture | Money Broking and PSO approved; Exchange pending |
| Module category | Configuration / Licence Control / Feature Governance |
| Depends on | FND-01 v1.2, IAM-01 v1.2, IAM-02 v1.2, SEC-01 v1.2 |
| Becomes authority for | Licence-lock state, feature flag evaluation, prohibited feature registry |

Base documents:
- 00_Licence_Scope_And_Feature_Lock_v1.3.md
- 01_Project_Charter_v1.3.md
- 02_Software_Requirement_Specification_v1.2.md
- 03_Master_Module_Index_v1.2.md
- 04_Role_And_Permission_Matrix_v1.2.md
- 05_Master_Workflow_Map_v1.2.md
- 06_Master_System_Rules_v1.2.md
- 07_Master_Data_Flow_v1.2.md
- 08_Master_Technical_Architecture_v1.2.md
- 09_Master_Security_Architecture_v1.2.md
- 10_Master_Testing_Strategy_v1.2.md
- 11_Master_Deployment_Strategy_v1.2.md
- FND-01_Platform_Foundation_Blueprint_Pack_v1.2
- IAM-01_Authentication_MFA_Session_Blueprint_Pack_v1.2
- IAM-02_RBAC_Permission_Guard_SoD_Blueprint_Pack_v1.2
- SEC-01_Audit_Log_Security_Monitoring_Blueprint_Pack_v1.2


---

## 2. Module Purpose

CFG-01 is the source of truth for feature availability and licence-scope enforcement.

It answers:

```txt
Is this feature/action allowed under the current licence, environment, client class, module status, approval state, and feature policy?
```

CFG-01 must make sure the platform cannot accidentally or deliberately enable features that are outside AIX's approved licence scope.

---

## 3. In Scope

CFG-01 covers:

1. Licence profile registry.
2. Licence-lock source of truth.
3. Prohibited feature registry.
4. Feature flag registry.
5. Runtime feature evaluation.
6. Environment-level feature status.
7. Tenant/client-class feature constraints.
8. Module/action feature dependency mapping.
9. Feature change workflow.
10. Licence-lock change workflow.
11. Emergency feature kill-switch.
12. Feature rollout and rollback control.
13. Feature cache and propagation.
14. Feature decision token/reference.
15. IAM-02 permission and maker-checker integration.
16. SEC-01 audit and security monitoring integration.
17. Interim sealed-list handoff from IAM-02 and SEC-01.
18. Downstream module enforcement contract.
19. Licence evidence export.
20. Feature status dashboard data.
21. Go-live and deployment feature gates.
22. Exchange-pending lock enforcement.
23. Retail onboarding default lock.
24. AIX spread markup prohibition.
25. Principal dealing / market making / matching engine prohibition.

---

## 4. Out of Scope

CFG-01 does not implement:

1. Authentication/MFA/session.
2. RBAC/permission guard.
3. Audit store.
4. KYC/KYB business workflow.
5. AML/sanctions/Travel Rule.
6. Ledger posting.
7. Trading/quote/LP execution.
8. Exchange matching engine/order book.
9. Regulatory reporting content.
10. Legal licence approval itself.
11. User interface design beyond configuration data/flows.

---

## 5. Critical Principles

### 5.1 Licence-Lock Source of Truth

Once CFG-01 is live, CFG-01 becomes the authoritative source of truth for licence-lock state.

IAM-02 and SEC-01 interim config-sealed licence-lock lists must reconcile to CFG-01 and then treat CFG-01 as authority.

### 5.2 Default Deny

If licence/feature state is unknown, unavailable, stale, mismatched, unsigned, expired, or not evaluated, feature use must fail closed.

```txt
feature_unknown = deny
licence_state_unknown = deny
```


### 5.2A Asymmetric Audit Fail-Closed

CFG-01 must not convert a SEC-01 monitoring outage into a full platform outage for already-licensed allowed activity.

Rules:

1. Locked, prohibited, unknown, stale, unsigned, or mismatched licence/feature state always denies.
2. Allowed licensed activity may proceed during temporary SEC-01 synchronous outage only if FND transaction-coupled outbox durably enqueues the CFG-01 audit event atomically with the decision.
3. If the audit event cannot be durably enqueued, sensitive action fails closed.
4. Prohibited/locked deny events must still be enqueued for SEC-01 delivery.
5. Audit outage mode must be visible, alerted, time-limited, and reconciled.
6. Audit outage mode cannot allow feature changes, licence profile changes, prohibited registry changes, Exchange activation, or kill-switch deactivation.

Parameters:

```txt
fail_closed_asymmetry = deny_locked_always;allowed_not_bricked_by_audit_outage
audit_coupling = fnd_transaction_coupled_outbox
```

### 5.3 Licence Lock Overrides Permission

IAM-02 permission cannot override CFG-01 licence lock.

Even Super Admin, Security Admin, break-glass, service account, temporary permission, delegated permission, or user override cannot enable locked/prohibited feature.

Priority:

```txt
CFG licence lock deny > IAM permission allow
```

### 5.4 Prohibited Features Are Not Flags

Prohibited features must not be ordinary runtime toggle flags.

They must be hard-blocked unless a formal licence-status transition occurs with evidence and approvals.

Examples:

```txt
public_order_book
matching_engine
client_to_client_matching
public_exchange_trading
market_making
principal_dealing
aix_spread_markup
retail_onboarding_default
audit_bypass
permission_bypass
direct_ledger_edit
direct_balance_edit
```


### 5.4A Config Integrity and Decision-Time Seal Verification

CFG-01 licence profile and prohibited-feature registry are security-critical configuration.

Rules:

1. Licence profiles and prohibited registry must be signed/hash-sealed against the config-sealed Document 00 baseline.
2. Integrity must be verified at decision time for prohibited, Exchange, and licence-sensitive features.
3. Scheduled reconciliation is not enough for prohibited/Exchange-sensitive decisions.
4. Any row/state that does not match a signed change record is an out-of-band config change.
5. Out-of-band config change must fail closed and emit Critical SEC-01 alert.
6. Migration/DBA/infra writes must not become trusted until reconciled with signed change records.
7. Prohibited registry baseline must include version, hash, signer, approval reference, Doc 00 baseline hash, and SEC-01 audit reference.

Parameters:

```txt
licence_config_integrity = signed_hash_sealed_to_doc00
prohibited_registry_signed = true
prohibited_registry_integrity_check = decision_time_not_only_scheduled
out_of_band_config_change = critical_alert_and_fail_closed
```

### 5.5 Exchange-Pending Lock

Exchange application is pending.

Until approved and formally activated through governance:

1. Public exchange trading locked.
2. Order book locked.
3. Matching engine locked.
4. Client-to-client matching locked.
5. Market making locked.
6. Principal dealing locked.
7. Public market depth locked.
8. Exchange API locked.


### 5.5A Hardened Exchange Activation Governance

Unlocking any Exchange-related feature is the highest-risk CFG-01 action.

Exchange activation requires a dedicated ceremony, not an ordinary feature flag edit.

Mandatory sequence:

1. Verified LFSA licence evidence authenticity.
2. Compliance validation.
3. Legal/Company Secretary evidence check where applicable.
4. Board sign-off.
5. Management sign-off.
6. Prohibited-registry removal proposal.
7. Licence profile transition from pending to approved.
8. Per-feature activation request.
9. IAM-02 maker-checker, SoD, step-up, and protected-action approval.
10. Prohibited-registry meta-SoD check.
11. Cooldown/time-lock before production activation.
12. Deployment gate pass.
13. Registry and licence profile re-seal to Doc 00 successor/baseline.
14. SEC-01 external audit evidence and alerting.

Rules:

1. Prohibited registry manager cannot be licence activation approver.
2. Licence activation approver cannot be deployment gate override approver.
3. Exchange activation cannot be performed by one person or one role group.
4. LFSA evidence cannot be a free-text reference only.
5. Pending licence cannot be treated as approved.
6. Board approval alone does not activate Exchange features unless all technical gates pass.
7. Technical deployment cannot activate Exchange features unless legal/licence gates pass.

Parameters:

```txt
exchange_activation_requires = verified_lfsa_evidence+board+per_feature+deployment_gate
exchange_activation_cooldown = to_be_defined
licence_evidence_authenticity = defined_verification_source
prohibited_removal_sod = registry_manager_ne_activation_approver
```

### 5.5B All-Environment Prohibited Lock

Prohibited and Exchange-locked features are hard-blocked in all environments.

Rules:

1. Production, UAT, staging, and development must treat prohibited/Exchange-locked features as locked by default.
2. Non-production testing exception may exist only as synthetic-data-only, isolated, quarantined, non-production simulation.
3. Synthetic non-prod exception must not use real client, PSO, payment, wallet, settlement, or production-like data.
4. Synthetic exception must not be deployable to production.
5. Production deployment gate must hard-block any release carrying a locked feature in enabled state, even if it came from non-prod config.
6. Environment scope cannot override prohibited registry.

Parameters:

```txt
prohibited_in_all_environments = true
prod_deploy_blocks_nonprod_enabled_locked_feature = true
```

### 5.6 Money Broking / PSO Allowed Scope

CFG-01 may allow only features aligned with approved Money Broking and PSO operating model.

Allowed-scope examples subject to module readiness:

1. Institutional/HNWI professional onboarding.
2. KYC/KYB.
3. AML/sanctions screening.
4. Wallet screening.
5. Payout destination verification.
6. RFQ/OTC/LP-backed agency execution.
7. Disclosed brokerage fee.
8. Pre-funded hold.
9. Double-entry ledger.
10. Client money safeguarding.
11. Settlement/reconciliation.
12. Audit and reporting.

### 5.7 No Silent Enablement

No feature can be enabled silently.

Every feature state change requires:

1. IAM-02 permission.
2. Maker-checker approval.
3. Step-up where sensitive.
4. SoD check.
5. SEC-01 audit event.
6. Effective date/time.
7. Rollback/kill-switch rule.
8. Evidence and reason.

### 5.8 Kill-Switch Must Be Faster Than Enablement

Disabling a feature for security/compliance/risk reason must be fast, controlled, auditable, and propagated quickly.

Kill-switch can be activated by authorised emergency control but cannot disable audit, permission guard, licence lock, or safety controls.

Kill-switch rules:

1. Kill-switch must immediately increment feature version.
2. Kill-switch must revoke outstanding feature decision tokens.
3. Kill-switch must invalidate downstream caches.
4. Kill-switch propagation SLA must be defined and monitored.
5. Runtime after kill-switch must deny even if token TTL has not expired.

Parameters:

```txt
kill_switch_forces_version_bump_and_token_revocation = true
kill_switch_propagation_sla_seconds = to_be_defined
```

### 5.9 Runtime Evaluation Required

Downstream modules must not cache feature state indefinitely.

Runtime sensitive actions must call CFG-01 directly or use a CFG-01 signed/validated decision with positive version check.


### 5.9A IAM-02 Feature-Gate Binding

A feature-gated protected action must be bound to IAM-02 permission approval.

Rules:

1. IAM-02 protected-action registry must declare required CFG-01 feature gate for feature/licence-sensitive actions.
2. IAM-02 permission allow for a feature-gated action requires a valid CFG-01 feature decision token/reference.
3. CFG-01 decision token must be presented to IAM-02 and verified before final allow.
4. CFG-01 decision token must be bound to IAM-02 decision context where applicable.
5. Runtime action without CFG-01 feature gate is orphan-gate and fails closed.
6. Coverage reconciliation must prove every feature-gated/licence-relevant action is registered and invokes CFG-01.

Parameters:

```txt
feature_gate_enforcement = bound_to_iam02_decision_token
feature_gate_coverage_recon = every_gated_action_registered_and_invokes_cfg
```

### 5.10 Feature Decision Binding

Feature decision must bind to:

1. feature code.
2. action.
3. resource.
4. environment.
5. client class.
6. client ID where applicable.
7. licence profile.
8. feature config version.
9. prohibited registry version and integrity hash.
10. requested action.
11. timestamp/expiry.
12. decision reason.

### 5.11 Stale Feature Cache Fails Closed

If feature cache version is older than latest CFG-01 version, sensitive action fails closed or revalidates before execution.

### 5.12 Deployment Gate

Production deployment cannot enable a feature unless:

1. feature exists in registry.
2. licence status allows it.
3. go-live checklist complete.
4. test evidence exists.
5. IAM-02 permission approval exists.
6. SEC-01 audit is working.
7. rollback plan exists.

### 5.13 Interim Handoff

CFG-01 must reconcile:

1. IAM-02 interim config-sealed licence-lock list.
2. SEC-01 interim licence monitoring assumptions.
3. Master Document 00 licence scope and prohibited feature list.

Any mismatch is Critical until resolved.

---

## 6. Actors

| Actor | Role in CFG-01 |
|---|---|
| System Module | Requests feature/licence decision |
| Operations Manager | Feature change requester/approver where allowed |
| Compliance Officer / MLRO | Licence-sensitive approval |
| Security Admin | Security-sensitive flags/kill-switch |
| Tech Admin | Technical configuration implementation |
| Super Admin | Limited admin; cannot bypass licence lock |
| Auditor | Read-only evidence |
| Deployment Manager | Deployment gate coordination |
| Service Account | Scoped internal feature-decision client |
| Board/Management Approver | High-risk feature/licence approval |

---

## 7. Dependencies

### 7.1 Upstream

1. FND-01 request/correlation ID.
2. FND-01 scheduler/job baseline.
3. FND-01 DB isolation baseline.
4. IAM-01 step-up authentication.
5. IAM-02 permission guard, protected-action registry, maker-checker, SoD.
6. SEC-01 authoritative audit and security monitoring.

### 7.2 Downstream

All modules that need feature/licence decisions depend on CFG-01.

Priority consumers:

1. IAM-02 permission guard.
2. SEC-01 monitoring and evidence.
3. Client onboarding.
4. KYC/KYB.
5. AML/Travel Rule.
6. Wallet/payout whitelist.
7. Quote/trade/LP execution.
8. Ledger/settlement.
9. Admin/staff/client portals.
10. Deployment pipeline.

---

## 8. Components

| Component | Description |
|---|---|
| Licence Profile Registry | Approved, pending, locked, prohibited licence scope |
| Feature Registry | Canonical feature definitions |
| Prohibited Feature Registry | Hard-blocked features/actions with signed/sealed integrity |
| Feature Policy Engine | Runtime allow/deny evaluation integrated with IAM-02 token binding |
| Licence Lock Engine | Licence-level lock evaluation with decision-time integrity checks |
| Feature Decision Token Service | Short-lived feature decision evidence bound to feature/licence/prohibited versions |
| Feature Version Service | Global and per-feature versioning |
| Feature Cache Invalidation | Propagates feature changes |
| Feature Change Workflow | Maker-checker controlled change |
| Kill-Switch Service | Fast disablement |
| Deployment Gate Service | Deployment feature validation |
| Handoff Reconciler | IAM-02/SEC-01 interim sealed-list reconciliation |
| Config Integrity Sealer | Signs/hash-seals licence/prohibited registry to Doc 00 baseline |
| Exchange Activation Ceremony Engine | Dedicated governed exchange activation workflow |
| Gate Coverage Reconciler | Verifies feature-gated actions invoke CFG-01 |
| Audit Outage Mode Controller | Asymmetric audit-outage handling using FND outbox |
| Audit Publisher | SEC-01 audit event emission |
| Feature Monitoring Export | Status and evidence dashboard data |
| Evidence Export Service | Licence/feature decision evidence |
| Reconciliation Jobs | Detect drift/stale/missing enforcement |

---

## 9. Functional Requirements

### CFG1-FR-001 Licence Profile Registry

The platform shall maintain licence profiles for approved, pending, locked, prohibited, suspended, or retired licence scopes.

### CFG1-FR-002 Feature Registry

The platform shall maintain canonical feature definitions with owner module, licence scope, risk class, default state, and environment constraints.

### CFG1-FR-003 Prohibited Feature Registry

The platform shall maintain hard-blocked prohibited features separate from ordinary flags.

### CFG1-FR-004 Runtime Feature Evaluation

The platform shall evaluate runtime feature availability for protected actions.

### CFG1-FR-005 Licence Lock Evaluation

The platform shall deny features outside approved licence scope.

### CFG1-FR-006 Exchange-Pending Lock

The platform shall lock all Exchange features while Exchange is pending.

### CFG1-FR-007 Permission Cannot Override Licence Lock

The platform shall reject any attempt to use IAM-02 permission to override CFG-01 lock.

### CFG1-FR-008 Feature Change Approval

The platform shall require IAM-02 maker-checker, SoD, and step-up for sensitive feature changes.

### CFG1-FR-009 Kill-Switch

The platform shall support fast feature disablement without bypassing audit or controls.

### CFG1-FR-010 Feature Decision Token

The platform shall issue short-lived feature decision token/reference for sensitive runtime actions.

### CFG1-FR-011 Positive Feature Version Check

The platform shall fail closed if cached feature decision/version is stale.

### CFG1-FR-012 SEC-01 Audit

The platform shall emit SEC-01 audit events for feature decisions, denials, changes, kill-switch, and licence-lock violations.

### CFG1-FR-013 Deployment Gate

The platform shall block deployment/activation of features without registry, licence, test, approval, audit, and rollback evidence.

### CFG1-FR-014 Interim Handoff

The platform shall reconcile IAM-02/SEC-01 interim sealed licence-lock lists to CFG-01.

### CFG1-FR-015 Client-Class Constraint

The platform shall evaluate feature availability by client class, including institutional/HNWI/professional only and retail default lock.

### CFG1-FR-016 Environment Constraint

The platform shall evaluate feature availability by environment: dev, staging, UAT, production.

### CFG1-FR-017 Drift Detection

The platform shall detect drift between registry, runtime, deployment config, and downstream module behaviour.

### CFG1-FR-018 Evidence Export

The platform shall provide controlled evidence export for licence/feature state and decisions.

### CFG1-FR-019 Feature Expiry / Review

The platform shall support feature approval expiry/review dates for temporary or pilot features.

### CFG1-FR-020 Feature Dependency Mapping

The platform shall map module/action dependencies to features and licence scopes.

### CFG1-FR-021 Config Integrity Seal

The platform shall sign/hash-seal licence profiles and prohibited registry against the config-sealed Document 00 baseline.

### CFG1-FR-022 Decision-Time Integrity Check

The platform shall verify licence/prohibited config integrity at decision time for prohibited, Exchange, and licence-sensitive features.

### CFG1-FR-023 Out-of-Band Change Detection

The platform shall detect out-of-band config changes and fail closed with Critical SEC-01 alert.

### CFG1-FR-024 Exchange Activation Ceremony

The platform shall require a hardened Exchange activation ceremony with verified LFSA evidence, Board sign-off, per-feature activation, deployment gate, cooldown, re-seal, and SoD.

### CFG1-FR-025 LFSA Evidence Authenticity

The platform shall define and verify the authenticity source for LFSA licence evidence before licence profile approval.

### CFG1-FR-026 IAM-02 Feature Gate Binding

The platform shall bind CFG-01 feature decisions into IAM-02 permission decisions for feature-gated protected actions.

### CFG1-FR-027 Feature Gate Coverage Reconciliation

The platform shall reconcile every feature-gated/licence-relevant action to a CFG-01 invocation and detect orphan gates.

### CFG1-FR-028 Asymmetric Audit Fail-Closed

The platform shall deny locked/prohibited features always, while allowed licensed decisions may proceed during SEC-01 outage only when FND transaction-coupled audit outbox enqueue succeeds.

### CFG1-FR-029 All-Environment Prohibited Lock

The platform shall hard-block prohibited/Exchange-locked features in all environments except quarantined synthetic-data-only non-prod simulation.

### CFG1-FR-030 Kill-Switch Token Revocation

The platform shall force feature version increment, decision-token revocation, and cache invalidation on kill-switch.

### CFG1-FR-031 Suspended Licence Token Revocation

The platform shall immediately revoke outstanding decision tokens when licence is suspended, revoked, or materially locked.

### CFG1-FR-032 Prohibited Registry Version Binding

The platform shall bind decision token to prohibited-registry version and integrity hash.

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Unknown feature state | Deny |
| Unknown licence state | Deny |
| Feature cache | Positive version checked |
| Sensitive action cache | Short-lived only |
| Licence lock override | Prohibited |
| Feature change audit | Required; may use FND transaction-coupled outbox if SEC-01 synchronous unavailable for allowed decisions only |
| Feature change approval | Required |
| Kill-switch propagation | Fast; SLA to define |
| Deployment gate | Required |
| Prohibited features | Hard-blocked in all environments; decision-time integrity verified |
| SEC-01 audit | Required |
| IAM-02 protection | Required |
| Reconciliation | Required |
| Data classification | Restricted / Security Critical |
| Config integrity | Signed/sealed to Doc 00 baseline |
| Exchange activation | Dedicated hardened ceremony |
| Gate coverage | IAM-02-bound + orphan-gate reconciliation |
| Audit outage mode | Asymmetric, outbox-coupled, time-limited |
| Kill-switch token revocation | Immediate |
| Test coverage | Critical controls 100% |

---

## 11. Prohibited Behaviours

CFG-01 must not allow:

1. Enable public order book while Exchange pending.
2. Enable matching engine while Exchange pending.
3. Enable client-to-client matching while Exchange pending.
4. Enable public exchange trading while Exchange pending.
5. Enable market making.
6. Enable principal dealing.
7. Enable AIX spread markup.
8. Enable retail onboarding by default.
9. Enable audit bypass.
10. Enable permission bypass.
11. Enable KYC bypass.
12. Enable AML bypass.
13. Enable Travel Rule bypass.
14. Enable pre-funded hold bypass.
15. Enable direct ledger edit.
16. Enable direct balance edit.
17. Enable client-side approval bypass.
18. Feature enablement without approval.
19. Feature enablement without audit.
20. Feature enablement with stale licence state.
21. Feature enablement by break-glass.
22. Feature enablement through user permission override.
23. Kill-switch disabling audit/security/licence controls.
24. Runtime action using stale allow after feature disabled.
25. Deployment activating unregistered feature.
26. Prohibited feature represented as ordinary flag.
27. Licence profile changed without evidence and approval.
28. Downstream module hard-coding feature allow.
29. Feature decision token reused across client/action/environment.
30. Feature cache TTL-only without version check.
31. Licence/prohibited registry change outside signed change record.
32. Decision-time use of unsigned/mismatched licence config.
33. Exchange activation through ordinary feature edit.
34. LFSA approval represented by unverified free-text evidence.
35. Prohibited registry manager approving own unlock.
36. Feature-gated action bypassing CFG-01 evaluation.
37. SEC-01 synchronous outage bricking already-licensed allowed activity when FND audit outbox can durably enqueue.
38. Non-prod locked feature config promoted to production.
39. Real client/PSO data used in synthetic non-prod Exchange simulation.
40. Outstanding tokens remaining valid after kill-switch or licence suspension.

---

## 12. Acceptance Criteria

CFG-01 is accepted only if:

1. Licence profile registry defined.
2. Feature registry defined.
3. Prohibited feature registry defined.
4. Runtime feature evaluation defined.
5. Licence-lock override priority defined.
6. Exchange-pending locked features defined.
7. Money Broking/PSO allowed scope defined.
8. Feature change maker-checker defined.
9. Kill-switch defined.
10. Feature decision token defined.
11. Positive version check defined.
12. Deployment gate defined.
13. IAM-02 integration defined.
14. SEC-01 audit integration defined.
15. Interim handoff from IAM-02/SEC-01 defined.
16. Client-class/environment constraints defined.
17. Reconciliation jobs defined.
18. Prohibited behaviours listed and tested.
19. Config integrity seal is defined.
20. Decision-time integrity verification is defined.
21. Exchange activation ceremony is defined.
22. LFSA evidence authenticity is defined.
23. IAM-02 feature-gate binding is defined.
24. Feature-gate coverage reconciliation is defined.
25. Asymmetric audit fail-closed is defined.
26. All-environment prohibited lock is defined.
27. Kill-switch token revocation is defined.
28. Suspended/revoked licence token revocation is defined.
29. Decision token binds prohibited registry version and hash.
30. Test cases pass.

---

## 13. Open Items

1. Final feature code namespace.
2. Final licence profile state list.
3. Final kill-switch propagation SLA.
4. Final feature decision token TTL.
5. Final feature cache invalidation mechanism.
6. Final deployment gate integration.
7. Final production approval thresholds.
8. Final feature review/expiry schedule.
9. Final client-class policy table.
10. Final evidence export format.
11. Final operational dashboard metrics.
12. Final source of LFSA licence-status evidence.
13. Final config signing/hash-seal method.
14. Final Doc 00 baseline hash/seal method.
15. Final Exchange activation cooldown/time-lock.
16. Final LFSA evidence authenticity verification source.
17. Final feature-gate coverage instrumentation.
18. Final audit outage mode maximum duration.
19. Final synthetic-data-only non-prod exception policy.
20. Final prohibited-registry version/hash binding format.
