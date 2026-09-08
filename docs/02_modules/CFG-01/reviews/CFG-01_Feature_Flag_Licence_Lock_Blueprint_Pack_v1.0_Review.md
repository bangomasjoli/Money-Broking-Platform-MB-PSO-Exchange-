# Principal Fintech Platform Architect Review — CFG-01 Feature Flag / Licence Lock v1.0

| Item | Details |
|---|---|
| Reviewed pack | CFG-01 Feature Flag / Licence Lock Blueprint Pack v1.0 (16 files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 02–11 v1.2, FND-01 v1.2, IAM-01 v1.2, IAM-02 v1.2, SEC-01 v1.2 |
| Review type | Principal Fintech Platform Architect — Initial Blueprint Review |
| Verdict | Strong foundation; **5 critical gaps** before acceptance. Most serious is C1 — the licence-lock config is the platform's source of truth but is a mutable table with no integrity anchoring. |

---

## 0. Summary

CFG-01 owns the **Exchange licence lock** — the single most consequential regulatory guardrail on the platform — so it is held to a high bar. It is a strong, well-structured blueprint: it correctly assumes the authority IAM-02 §5.14 and SEC-01 §5.10 defer to, reconciles the interim sealed lists + Doc 00 (WF-CFG01-06, closing that handoff thread), keeps a prohibited-feature registry separate from ordinary flags, places licence-lock deny above IAM permission (§5.3, consistent with IAM-02 §5.9), and carries decision-token binding, positive-version checks, a deployment gate, and a kill-switch ceiling. The prohibited set (07 §7) aligns with 00 v1.3. The five critical gaps are about whether the lock can be **trusted**, **unlocked safely**, and **guaranteed to be invoked**.

---

## Critical Gaps

### C1 — The licence-lock / prohibited-feature config has no tamper-evidence; it's a mutable table — **HIGHEST PRIORITY**
**Area:** 05 §2.1/2.3 (`licence_profile`, `prohibited_feature` — plain rows), §5.13/WF-CFG01-06 (Doc 00 recon is *scheduled*), 13.

CFG-01 is now the **source of truth** for the Exchange lock, yet the `prohibited_feature` registry and `licence_profile` are ordinary tables. An identity with `cfg1` DB write (migration role, DBA, infra) could flip `prohibited_feature.status → inactive` or `licence_profile.licence_status: pending → approved` and the runtime would honour it — with **no application-path SEC-01 event**, because the change never went through the workflow. The Doc 00 reconciliation exists but is a **scheduled job**, so there's a live window until the next run, and nothing anchors the baseline itself. A lock that can be flipped in a table row is not a lock.

Needed: **sign/hash-seal the prohibited-feature registry and licence profile against the config-sealed Doc 00 baseline**; verify that integrity at **decision time** for prohibited/Exchange features (not only on a schedule); detect and **fail-closed + Critical-alert on any out-of-band config change** (row that doesn't match a signed change record). This is the CFG-01 analogue of SEC-01 C1.

### C2 — The lock→unlock transition (Exchange activation) is the platform's highest-risk action but is only a maker-checker table edit
**Area:** §5.5, WF-CFG01-03/04 §3, 04 §5.3/§6.2, 05 §2.3 (`prohibited_feature.applies_until`).

Exchange features are prohibited "until formal licence transition," but **how a feature lawfully leaves the prohibited registry is undefined** beyond `cfg1.prohibited_feature.manage` requiring "Compliance + Security + Management" — the same control that, if it colludes or is compromised, unlocks the entire Exchange. Licence evidence is just an `evidence_ref` string with "validate source of evidence" (WF-03 step 3) left unspecified — nothing establishes the LFSA approval is **genuine**, so "pending → approved" hinges on an unverified reference. For the single most consequential regulatory action on the platform, that's too thin.

Needed: a dedicated, hardened **Exchange-activation governance ceremony** — verified LFSA licence-evidence authenticity (define the verification mechanism/source, not a free-text ref); mandatory **Board sign-off**; hard **sequencing** (licence profile `approved` **AND** per-feature activation **AND** deployment gate **AND** integrity re-seal); a **cool-down/time-lock**; and **SoD so the prohibited-registry manager is not also the licence-activation approver** (removing the collusion path to unlock).

### C3 — Nothing guarantees a downstream module actually calls CFG-01 before a feature-gated action
**Area:** 01 §5.9/FR-004, 13 §2 ("Permission registry: IAM-02 protected actions vs CFG feature policies").

The Exchange lock is only as strong as its **invocation**. If a matching-engine or principal-dealing code path exists but simply never calls `/features/evaluate`, the lock is moot — and no test or reconciliation would catch a *never-invoked* gate. The reconciliation maps IAM-02 protected-actions ↔ CFG feature policies, which is a good start, but it doesn't prove runtime actually consulted CFG-01.

Needed: **bind feature evaluation into IAM-02's permission guard** — a feature-gated protected action must present a valid **CFG-01 feature decision token** to obtain an IAM-02 allow (so the two decisions are coupled and un-bypassable) — plus a **coverage reconciliation** that every feature-gated/licence-relevant action is registered and demonstrably invokes CFG-01 (orphan-gate detection). This is the guard-coverage lesson from IAM-02 C2 / SEC-01 C2, applied to the licence gate.

### C4 — Fail-closed is symmetric, so a SEC-01 audit outage denies all licensed activity (self-inflicted DoS)
**Area:** §5.2, WF-CFG01-01 fail-closed #7 ("SEC-01 audit unavailable for sensitive decision"), 12 CFG1-RISK-015.

Failing closed on *unknown licence state* is correct. But the pack also fails closed on **"SEC-01 audit unavailable for sensitive decision"** — which couples every sensitive feature *allow* to SEC-01 liveness. For a PSO/broking platform, that means a monitoring outage **brings down withdrawals, trades, and settlement** platform-wide, even though those features are validly licensed. That converts an availability incident into a total denial of already-approved activity.

Needed: **asymmetric fail-closed** — *locked/prohibited* features always deny (fail-safe), but a *legitimately-allowed* feature must not be bricked by an audit-sink outage. Use FND-01's **transaction-coupled outbox** so the audit event is durably enqueued atomically with the decision (guaranteed-eventual), taking SEC-01 synchronous liveness off the critical path. Define the availability posture explicitly.

### C5 — Prohibited/Exchange features and environment scope: leak risk from non-prod enablement
**Area:** 05 §2.2 (`feature.environment_scope`), FR-016, 07 §6 precedence (prohibited #1 > environment #4).

`feature.environment_scope` and FR-016 allow per-environment enablement, and the precedence table puts prohibited-deny above environment — good — but the pack never states whether **Exchange/prohibited features are blocked in *all* environments** or can be "enabled" in dev/staging/UAT for testing. If they can be enabled in non-prod, you risk (a) a prod release carrying non-prod-enabled config, (b) non-prod handling real client/PSO data under exchange logic, and (c) ambiguity between the global prohibited registry and per-env scope.

Needed: state that **prohibited/Exchange-locked features are hard-blocked in every environment** (any non-prod exception is synthetic-data-only and explicitly quarantined), and make the **deployment gate hard-block any production release that carries a locked feature in an enabled state** regardless of source environment.

---

## Recommended Corrections

1. **Kill-switch immediacy:** a kill-switch must force an **immediate feature-version increment + decision-token revocation** (not wait for TTL), and define the propagation SLA (Open Item 3) as a hard control — otherwise a security-triggered disable leaves a stale-allow window on tokens issued just before.
2. **Suspended/revoked licence must revoke outstanding decision tokens immediately** (WF-03 rule 3 denies new decisions; confirm it also invalidates in-flight tokens), not just future evaluations.
3. **Decision-token binding (05 §2.6)** should include the **prohibited-registry version** (and its integrity hash), so a token cannot survive a prohibited-registry change — currently it binds only `feature_config_version` + `licence_profile_version`.
4. **Define licence-evidence authenticity** concretely (ties to C2): what source/attestation proves an LFSA approval is genuine before `licence_status` can become `approved`.
5. **Prohibited-registry meta-SoD** (ties to C2): registry manager ≠ licence-activation approver ≠ deployment-gate override.
6. **Make the prohibited-feature ↔ Doc 00 integrity check decision-time/near-real-time**, not only a scheduled job (ties to C1).

---

## Additional Parameters to Define

```txt
# Config integrity (C1)
licence_config_integrity              = signed_hash_sealed_to_doc00
prohibited_registry_signed            = true
prohibited_registry_integrity_check   = decision_time_not_only_scheduled
out_of_band_config_change             = critical_alert_and_fail_closed

# Exchange activation (C2)
exchange_activation_requires          = verified_lfsa_evidence+board+per_feature+deployment_gate
exchange_activation_cooldown          = to_be_defined
licence_evidence_authenticity         = defined_verification_source
prohibited_removal_sod                = registry_manager_ne_activation_approver

# Gate enforcement coverage (C3)
feature_gate_enforcement              = bound_to_iam02_decision_token
feature_gate_coverage_recon           = every_gated_action_registered_and_invokes_cfg

# Resilience (C4)
fail_closed_asymmetry                 = deny_locked_always;allowed_not_bricked_by_audit_outage
audit_coupling                        = fnd_transaction_coupled_outbox

# Environment (C5)
prohibited_in_all_environments        = true
prod_deploy_blocks_nonprod_enabled_locked_feature = true

# Corrections
kill_switch_forces_version_bump_and_token_revocation = true
kill_switch_propagation_sla_seconds   = to_be_defined
suspended_licence_revokes_outstanding_tokens = true
decision_token_bound_to               = feature+action+resource+client+env+feature_version+licence_version+prohibited_registry_version
```

---

## Consistency Note

CFG-01 correctly assumes the authority IAM-02 §5.14 and SEC-01 §5.10 defer to and reconciles both interim sealed lists plus Doc 00 (WF-06) — cleanly closing the licence-lock handoff thread those packs opened. The prohibited set (07 §7) matches 00 v1.3, IAM-02 07 §3, and SEC-01, and licence-lock precedence over IAM permission (§5.3) is consistent with IAM-02 §5.9. Two structural tensions surface here: **config integrity** (C1) and the **runtime audit-coupling DoS** (C4). One coverage item: the feature-gate → IAM-02 protected-action mapping exists in reconciliation, but the runtime enforcement binding (C3) is not yet a hard contract.

---

## Top Priorities

1. **C1** — sign/seal + decision-time integrity for the prohibited-feature registry and licence profile. A flippable table is not a lock.
2. **C2** — a hardened Exchange-activation governance ceremony with verified LFSA evidence and SoD; today "unlock the Exchange" is a maker-checker edit.
3. **C3** — bind the feature gate into IAM-02's decision token so the lock is guaranteed to be invoked.
4. **C4 / C5** — asymmetric fail-closed (no monitoring-outage DoS) and all-environment prohibition with a prod deployment hard-block.
