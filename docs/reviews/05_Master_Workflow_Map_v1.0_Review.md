# Principal Fintech Platform Architect Review

## Document Reviewed: 05_Master_Workflow_Map_v1.0.md

| Item | Details |
|---|---|
| Reviewed document | 05_Master_Workflow_Map_v1.0.md |
| Platform | AIX Money Broking Platform |
| Review type | Principal Fintech Platform Architect / Regulated Fintech Workflow & Security Review |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 03 v1.2, 02 v1.2, 04 v1.2 |
| Review basis | Labuan FSA Money Broking + PSO scope, Exchange application pending |
| Verdict | Strong, comprehensive workflow map; five lifecycle / money-control gaps to close before Master System Rules |

---

## 0. Summary

This is a strong, comprehensive workflow map — 26 workflows with default-deny principles, money-movement integrity rules, per-workflow state machines and blocking conditions, a cross-workflow dependency map, and consolidated audit-event / error-code / test sections. The agency / DvP / pre-funded-hold and exchange-lock controls are carried through cleanly.

**Version note (good this time):** the base docs cited (RPM v1.2, SRS v1.2, Module Index v1.2) all now exist as real files, so the traceability chain is consistent — no version conflict for doc 05.

This review focuses on genuine workflow gaps.

---

## 1. Critical Gaps

### C1. No dedicated Account Freeze / Suspension / Unfreeze workflow (Areas 1, 7) — HIGHEST PRIORITY

Freeze / suspension appears only as a *step* inside WF-16 (AML case, §20.3.9) and §32 lists "Account freeze/suspension" as needing a state machine — but there is **no first-class workflow** for it. Freezes are triggered independently of an AML case: sanctions hits, court orders, regulatory directives, fraud alerts, safeguarding shortfalls. This is a core compliance money-control workflow (with its own states, maker-checker, effective-time, scope, and unfreeze path) and it is missing.

### C2. No unmatched / unidentified deposit (suspense) handling (Areas 2, 8)

WF-07 (fiat) and WF-08 (digital) both assume a deposit can be matched to a client. A PSO routinely receives funds that **cannot be matched** — wrong reference, unknown sender. There is no `unmatched / unidentified` state, no route to a suspense account, and no investigate-then-match-or-return path. Unidentified money sitting outside the client-money model is both a safeguarding and an AML risk.

### C3. No client offboarding / account closure workflow (Areas 1, 8)

WF-01 has a `closed` state but no workflow executes closure: final position / settlement close-out, **return of client balance to a verified own-name destination**, safeguarding removal, record retention, and the guarantee that closure cannot strand client money. Institutional client exit is a regulated process and is currently unmodelled.

### C4. No periodic KYC/CDD refresh or sanctions re-screening workflow (Areas 1, 7)

Ongoing monitoring is a core AML obligation. WF-02 has a `refresh_required` state and CMP-16 / CMP-06 exist upstream, but **no workflow drives** periodic review, re-screening on sanctions-list updates, or the consequence (restrict / suspend if not refreshed by due date). Screening is effectively modelled as a one-time onboarding event.

### C5. Payout destination changes lack client-side dual authorization (Areas 6, 8)

WF-06 lets a single `CLIENT_OWNER / CLIENT_USER` submit a payout destination (step 1) with only **staff-side** maker-checker. Adding / approving a destination is the enabling step for all money-out and a classic account-takeover fraud vector (attacker adds their own account). Client-side dual authorization is applied to withdrawals and large trades (WF-09 / 10 / 11) but **not** to the destination change that unlocks them — the control is on the wrong side of the gate.

---

## 2. Recommended Corrections

1. **Add WF-27 Account Freeze / Suspension / Unfreeze (C1):** independent trigger sources (sanctions, court order, fraud, regulatory, safeguarding), states (`requested → active → partial → lifted / rejected`), scope (trade / withdraw / deposit / login), effective-time, maker-checker + SoD, and mandatory audit. Link it as a downstream target from WF-16 and WF-17, not only inside them.

2. **Add unmatched-deposit handling to WF-07 / WF-08 (C2):** an `unidentified / unmatched` state routing to a **suspense / clearing account**, an investigation step, and match-or-return resolution (return only to verified source). Add `DEPOSIT_UNMATCHED` error and `deposit_unmatched` audit event.

3. **Add WF-28 Client Offboarding / Account Closure (C3):** position close-out, balance return to verified own-name destination, safeguarding / whitelist deactivation, retention application, and a block on closure while balances or open settlements remain.

4. **Add WF-29 Periodic KYC Refresh & Sanctions Re-Screening (C4):** scheduled / triggered review, re-screening on list updates, and enforced consequence (auto-restrict → suspend) when refresh lapses. Tie to WF-05 product-access revocation.

5. **Extend client-side dual authorization to WF-06 (C5):** require a second client approver for adding / approving a payout destination under institutional mandates, and enforce the new-destination cooling-off as a hard gate before first use.

6. **Close the fiat / digital asymmetry.** WF-08 digital-asset deposit credit should carry the same **maker-checker on the credit decision** that WF-07 fiat has (WF-07 step 5 vs WF-08 which goes disposition → ledger credit with no explicit checker).

7. **Reconcile the error-code list (§34).** It omits `CLIENT_SUSPENDED` / `CLIENT_FROZEN` (present in SRS §24), plus the new `DEPOSIT_UNMATCHED` and an `ACCOUNT_FROZEN` code. Align §34 with the SRS taxonomy so the workflow engine and API share one set.

8. **Add a custodian-failure / asset-migration path** (custody exit plan) to WF-19 termination, and note the deferred **LP failover / backup-LP** workflow as an explicit open item (currently only "fail closed" on outage, no failover).

---

## 3. Additional Workflow Requirements / Parameters to Add

```txt
# --- New workflows ---
WF-27  Account Freeze / Suspension / Unfreeze        # independent trigger, states, maker-checker, SoD
WF-28  Client Offboarding / Account Closure          # balance return, close-out, retention
WF-29  Periodic KYC Refresh & Sanctions Re-Screening # ongoing monitoring + enforced consequence

# --- New/extended states ---
deposit_unmatched / suspense_held                    # WF-07, WF-08
account_frozen / account_suspended / account_lifted  # WF-27
closure_requested / balance_returned / closed        # WF-28

# --- New error codes (align §34 with SRS §24) ---
CLIENT_SUSPENDED
CLIENT_FROZEN
DEPOSIT_UNMATCHED
ACCOUNT_FROZEN

# --- New audit events ---
account_frozen / account_unfrozen
deposit_unmatched / deposit_returned
client_offboarding_started / client_balance_returned / client_closed
kyc_refresh_due / kyc_refresh_completed / sanctions_rescreen_run

# --- Control parameters ---
payout_destination_client_side_dual_auth = required_for_institutional_mandate
digital_deposit_credit_maker_checker = required
unmatched_deposit_handling = suspense_then_match_or_return
periodic_kyc_refresh = risk_based_schedule
sanctions_rescreen_on_list_update = required
closure_blocks_if_balance_or_open_settlement = true
custody_exit_migration_workflow = required
lp_failover_backup_lp = open_item_deferred
```

---

## 4. Top Priorities Before the Master System Rules

1. **C1** — Freeze / suspension as a first-class workflow. The compliance kill-switch is currently only a sub-step.
2. **C2** — Unmatched-deposit suspense handling. Real PSO money that has nowhere to go today.
3. **C5** — Client-side dual auth on payout-destination changes. The control is currently one gate too late to stop account-takeover.

C3 (offboarding) and C4 (ongoing monitoring) close the client lifecycle and should follow in the same pass.
