# Principal Fintech Platform Architect Review — INC-01 Incident / Freeze / Recovery v1.0

| Item | Details |
|---|---|
| Reviewed pack | INC-01 Incident / Freeze / Recovery Blueprint Pack v1.0 (16 files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 02–11 v1.2, FND-01/IAM-01/IAM-02/SEC-01 v1.2; CFG-01/CLT-01/KYC-01/AML-01/WLT-01/LED-01/TRD-01/E2E-01/DEP-01/WDR-01/REC-01 cited v1.2 (E2E/DEP/WDR/REC accepted v1.1, compliance/money tier accepted v1.1 — see Consistency Note) |
| Review type | Principal Fintech Platform Architect — Initial Blueprint Review |
| Verdict | Strong, well-scoped resilience orchestrator; correct orchestrator-only posture and E2E-01 §15 alignment. **5 critical gaps** before acceptance — all in the dimensions that decide whether a freeze truly contains and a recovery truly corrects. Most serious is **C1** — freeze propagation is best-effort and ack-only, so it can be false containment. |

---

## 0. Summary

INC-01 coordinates incident response, freeze propagation, money-flow quiescence, evidence preservation and controlled recovery — the operational counterpart to the E2E-01 §15 freeze/recovery model that LED-01, WDR-01, DEP-01 and REC-01 all reference. It is a strong draft: strictly orchestrator-only (§5.12 / prohibited #1–9 — no ledger, no balance edit, no source mutation), with an incident command structure (§5.1), severity classification (§5.2), explicit freeze scope (§5.3), propagation with acknowledgements (§5.4), staged money-flow quiescence (§5.5), point-of-no-return respect (§5.6), hash-linked evidence (§5.7), a recovery plan (§5.8), a multi-sign-off resume gate (§5.9), notification-obligation tracking (§5.10), post-incident review (§5.11) and client-status truthfulness (§5.13). It routes all correction through owning modules.

The five gaps are the ones unique to being the platform's highest-authority control action: a freeze that is atomic/complete/verified rather than best-effort (C1), governance of the super-weapon itself including the dangerous resume direction (C2), resilience when INC's own dependencies are the incident (C3), recovery that proves the money position was corrected (C4), and handling the freeze's own client-money-access harm (C5).

---

## Critical Gaps

### C1 — Freeze propagation is best-effort and non-atomic: money can move through a not-yet-frozen module during the propagation window, a partial freeze has no fail-closed rule, and an acknowledgement is not proof the freeze is effective — **HIGHEST PRIORITY**
**Area:** §5.4 (propagation list), WF-INC01-03 (issue commands, record acks, retry on missing), 05 §2.3 `freeze_order.status` (`propagating`/`partial`/`failed`), §2.4 `freeze_acknowledgement` (`acknowledged`/`failed`/`timeout`).

Freeze commands are issued module-by-module and acknowledgements recorded, but three things are missing. **(a) Non-atomic / unordered:** between "freeze WDR" and "freeze TRD" a trade can still execute — there's no **stop-the-world barrier** and no defined **ordering** (money-exit points — WDR/TRD/LED settlement — must freeze first, before intake). **(b) Partial-freeze has no fail-safe:** `partial`/`failed` is a recorded status, but nothing requires a partial freeze to **escalate to a broader/platform freeze or fail-closed** — a half-applied freeze is worse than none because it manufactures false containment. **(c) Ack ≠ effective:** an acknowledgement means "command received," not "money movement actually stopped"; a module can ack while a race lets an in-flight action complete. The freeze must be **verified-effective**, not merely acknowledged.

**Needed:** ordered, barrier-based freeze (exit points first), an explicit fail-closed rule when any in-scope module doesn't confirm within SLA (escalate/broaden, never proceed as "contained"), and freeze *verification* (proof money movement stopped) distinct from acknowledgement.

### C2 — INC-01 is the platform's most powerful weapon but its own authority/abuse model is thin: freeze (a DoS lever) and resume (the dangerous unlock) lack maker-checker/SoD rigor, there's no anti-suppression/anti-downgrade control, and INC's own records aren't tamper-evident
**Area:** §5.1 (command roles), §5.9 (resume sign-offs), §5.12 (no bypass), 05 §2.1 `incident`/§2.3 `freeze_order` (no hash-chain/anchor), Actors (Incident Commander).

INC commands the CFG kill-switch, IAM freeze and LED gating — it is effectively super-admin over money flow — yet its authority controls are underspecified. **(a)** A **platform-wide freeze** (a self-inflicted DoS) and, more dangerously, a **resume** (unlocking money movement) need strong maker-checker/SoD; the resume gate has sign-offs but nothing stops a single actor from both declaring the incident resolved *and* releasing the freeze, and the freeze/command-assignment side lacks equivalent rigor. **(b)** The incident mechanism itself can be **abused** — a compromised operator could suppress an incident (never raise it), downgrade severity to avoid a freeze, or drive a premature resume. **(c)** INC's incident/freeze/evidence records aren't stated to be **hash-chained/externally anchored** like SEC-01/LED-01, so an attacker covering tracks could alter them.

**Needed:** IAM-02 maker-checker/SoD over freeze *and* (especially) resume with separation between "declare resolved" and "release freeze"; anti-suppression/anti-downgrade controls (severity changes and non-raising are themselves audited/alerted); and hash-chained, externally-anchored INC records.

### C3 — Circular dependency / self-referential failure: INC depends on SEC (evidence), IAM (authority) and CFG (kill-switch) — but the incident may BE in one of those, with no degraded-mode or out-of-band path
**Area:** §5.2 critical types (audit-log tampering, privileged-access compromise, Exchange-feature/CFG path), §5.7 (evidence via SEC), §5.4 (freeze via CFG kill-switch), dependency on IAM for authority.

The critical-incident catalogue explicitly includes SEC audit tampering, IAM privileged-access compromise, and CFG/Exchange-feature failures — yet INC **relies on those exact modules** to function: SEC for trustworthy evidence, IAM for the authority to act, CFG for the kill-switch it wants to pull. If SEC is compromised, INC's evidence is untrustworthy; if IAM privileged access is compromised, the attacker likely holds INC authority too; if CFG is the failure, the kill-switch may be subverted. There is no **degraded-mode / independent path** — no out-of-band freeze channel, no independent/immutable evidence capture, no break-glass-with-ceiling for when IAM itself is down or compromised. The resilience module has an unaddressed single point of failure in its own control chain.

**Needed:** a degraded-mode operating model with independent/out-of-band control and evidence paths — an out-of-band freeze trigger when CFG/IAM is the incident, independent tamper-evident evidence capture when SEC is suspect, and a bounded break-glass authority path for when IAM is unavailable.

### C4 — Recovery correctness is under-specified on the money side: resume checks "REC validation complete" and "modules confirm safe state," but not that the incident's specific money damage was actually corrected
**Area:** §5.9 (resume gate), §5.8 (recovery plan — generic remediation), WF-INC01-08, 05 §2.9 `resume_gate` (`rec_validation_status`/`source_safe_state_status` booleans), §2.5 `inflight_item.disposition`.

The resume gate proves reconciliation *ran* and modules *say* they're safe — but not that the incident's damage was *fixed*. An incident typically leaves specific money damage: an orphaned LED reserve, an executed-late payout needing LED settlement + clawback, a half-settled DvP leg, a deposit stuck in quarantine. "REC validation complete" is process completion, not correction. There's no hard requirement that **every in-flight item reached a proven terminal corrected disposition** and that any **value/safeguarding discrepancy the incident caused is resolved to zero (or explicitly, auditably risk-accepted with safeguarding intact)** before resume.

**Needed:** closed-loop money recovery — resume gated on every incident-scoped in-flight item reaching a terminal *corrected* state (via LED/owning module), and the incident-scoped value-conservation + safeguarding position proven restored (or explicitly accepted), not just "recon ran and modules say OK."

### C5 — Freeze collateral damage is unmodelled: freezing client withdrawals to contain an incident denies clients access to their own safeguarded money — itself a client-detriment/regulatory event — yet there's no minimum-scope, time-bounding, or consequence-tracking for the freeze
**Area:** §5.3 r4 (only "overly broad freeze handled through controlled release"), §5.10 (notification), no freeze-duration/re-justification model.

A freeze is a **double-edged control**: containing an incident by freezing withdrawals also *denies clients access to their own money*, which for a safeguarding/PSO licensee is a reportable client-detriment event with its own obligations and time pressure (clients must be able to access safeguarded funds; an extended freeze may breach that). The pack has no **minimum-necessary-scope** principle (freeze the narrowest scope that contains the incident, not reflexively platform-wide), no **time-bounding / duration SLA / periodic re-justification** (an indefinite freeze needs escalating approval), and no treatment of the **freeze's own client-money-access denial as a tracked, notifiable consequence** — nor how a freeze interacts with an obligation the platform already owes (an in-flight instruction, a contractual payout).

**Needed:** a minimum-necessary-scope principle, time-bounded freezes with periodic re-justification and escalating approval for extension, and explicit tracking of client-money-access denial as a consequence with its own notification/obligation and interaction rules for already-owed obligations.

---

## Recommended Corrections

1. **Freeze idempotency & overlapping/nested freezes.** Two incidents freezing overlapping scope, or a freeze order issued twice — freeze orders must be idempotent, and releasing one incident's freeze must not release a scope another incident still needs frozen (reference-counted freeze holds).
2. **Automated auto-freeze for defined critical conditions.** Some conditions (safeguarding deficit, sanctions hit after movement, ledger hash-chain mismatch) should trigger an **immediate automated freeze** without waiting for human incident-command assembly; define which conditions auto-freeze vs human-initiated so containment isn't delayed by process.
3. **Bind in-flight disposition to the E2E-01 saga/compensation model.** E2E-01 (files 13) already defines saga compensation; INC's in-flight disposition should *drive* the E2E saga compensation, not run a parallel recovery brain — avoid two conflicting recovery mechanisms.
4. **Precise notification clock + de-duplicate with REC.** §5.10's clock-start ("from detection/escalation according to policy") is vague; for LFSA/PSO the deadline is statutory — define clock-start as detection time, and reconcile with REC-01's regulatory-obligation tracker so obligations aren't tracked in two places conflictingly.
5. **Communication approval respects tipping-off + market sensitivity.** Incident client/external communication (§5.13) must honour AML **tipping-off** (an incident involving a suspected client can't be disclosed to that client) and route external/security-incident disclosure through Compliance.
6. **Fail-closed default during the acknowledgement gap.** WF-03 treats a missing ack as "high/critical," but the **default posture while a freeze is `propagating`** must be **fail-closed** (affected scope's money movement denied-by-default) — gates deny until freeze is confirmed effective, never "pending/allow."

---

## Additional Parameters to Define

```txt
# Atomic / verified freeze (C1)
freeze_ordering          = exit_points_first_then_intake
freeze_barrier           = stop_the_world_before_per_module_confirm
partial_freeze           = fail_closed_escalate_or_broaden
freeze_effectiveness     = verified_not_just_acknowledged

# INC authority / abuse control (C2)
freeze_authority         = iam2_maker_checker_sod
resume_authority         = separated_from_declare_resolved
anti_suppression         = non_raise_and_downgrade_audited_alerted
inc_record_integrity     = hash_chain + external_anchor

# Degraded-mode / self-SPOF (C3)
dependency_incident      = sec_iam_cfg_can_be_the_incident
out_of_band_freeze       = available_when_cfg_or_iam_compromised
independent_evidence     = when_sec_suspect
break_glass_authority    = bounded_ceiling_when_iam_down

# Closed-loop recovery (C4)
resume_requires          = every_inflight_item_terminal_corrected
incident_value_position  = restored_to_zero_or_explicitly_accepted
safeguarding_after       = intact_proven_before_resume

# Freeze collateral / client money (C5)
freeze_scope             = minimum_necessary_to_contain
freeze_duration          = time_bounded_periodic_re_justification
client_money_access_denial = tracked_consequence_with_notification
owed_obligation_interaction = defined

# Corrections
freeze_idempotency       = reference_counted_overlapping_freezes
auto_freeze              = defined_critical_conditions
inflight_disposition     = drives_e2e_saga_compensation
notification_clock       = detection_time_reconciled_with_rec
comms_approval           = tipping_off_and_market_sensitivity_via_compliance
ack_gap_default          = fail_closed_deny_by_default
```

---

## Consistency Note

INC-01 is the operational realisation of the freeze/recovery contracts the rest of the platform already references, and it is well-aligned: it mirrors E2E-01 §15 (freeze propagation + recovery-resume-gate), consumes REC-01 validation, SEC-01 evidence, the CFG-01 kill-switch, and the per-module freeze gates that LED-01/WDR-01/DEP-01/TRD-01 already expose; it respects point-of-no-return and executed-late (WDR-01 §5.21), routes all correction through owning modules (no source mutation, §5.12 / prohibited #1–9), and requires client-status truthfulness (§5.13, mirroring TRD/WDR). The gaps are the ones unique to being the highest-authority control action: a freeze that is atomic/complete/verified rather than best-effort (C1), governance of the super-weapon itself including the dangerous resume direction (C2), resilience when INC's own dependencies are the incident (C3), recovery that proves the money position was corrected (C4), and handling the freeze's own client-money-access harm (C5). One housekeeping item: the dependency list cites everything at **v1.2 including E2E-01/DEP-01/WDR-01/REC-01 v1.2**, but those are accepted at **v1.1** and the compliance/money tier is substantively at **v1.1**; pin to accepted versions or mark as forward references.

---

## Top Priorities

1. **C1** — atomic, ordered, fail-closed, *verified-effective* freeze; a partial or ack-only freeze is false containment.
2. **C2** — govern the super-weapon: maker-checker/SoD over freeze and (especially) resume, anti-suppression, and tamper-evident INC records.
3. **C3** — degraded-mode / out-of-band operation for when SEC/IAM/CFG are themselves the incident.
4. **C4 / C5** — resume only on proven money-position correction, and treat the freeze's own client-money-access denial as a scoped, time-bounded, notifiable consequence.
