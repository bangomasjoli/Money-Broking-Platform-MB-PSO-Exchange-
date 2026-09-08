# PRT-01 Client / Staff / Admin Portal Workflows Blueprint Pack v1.1

## Module

PRT-01 Client / Staff / Admin Portal Workflows

## Purpose

PRT-01 defines portal-facing workflows and presentation-layer controls for client, staff, finance, compliance, operations, security, management and admin users.

PRT-01 is an interaction and workflow presentation layer. It must not own source-of-truth decisions, post ledger, edit balances, execute trades, execute deposits or withdrawals, override AML/WLT decisions, bypass IAM/CFG/INC controls, or hide material statuses.

It answers:

```txt
Can users interact with the platform safely, truthfully and role-appropriately without the portal becoming a bypass around the accepted backend controls?
```

## Core Scope

1. Client portal workflows.
2. Staff operations portal workflows.
3. Compliance/MLRO portal workflows.
4. Finance portal workflows.
5. Security/admin portal workflows.
6. Management dashboard workflows.
7. Read-only and action workflows.
8. Backend-driven status truthfulness.
9. Permission, masking and SoD enforcement.
10. Maker-checker user interaction.
11. Client dual-authorisation UX.
12. Notifications and disclosure controls.
13. AML tipping-off-safe messages.
14. Incident/freeze-aware status.
15. Evidence/export portal controls.
16. Portal audit events.
17. No-source-of-truth / no-bypass boundary.

## Strict Out of Scope

1. Ledger posting.
2. Balance editing.
3. Deposit crediting.
4. Payout execution.
5. Trade / LP execution.
6. AML / WLT decision ownership.
7. KYC/KYB decision ownership.
8. Reconciliation break closure ownership.
9. Incident freeze release ownership.
10. Exchange order book / matching.
11. Principal dealing or AIX inventory.

## Pack Contents

1. `01_Module_Blueprint.md`
2. `02_Workflow.md`
3. `03_Diagrams.md`
4. `04_API_Specification.md`
5. `05_Database_Design.md`
6. `06_State_Machine.md`
7. `07_Permission_Rules.md`
8. `08_Audit_Log_Events.md`
9. `09_Error_Handling.md`
10. `10_Test_Cases.md`
11. `11_Claude_Prompt.md`
12. `12_Risk_And_Control_Map.md`
13. `13_Reconciliation_Design.md`
14. `14_Go_Live_Checklist.md`
15. `15_Regulatory_Mapping.md`
16. `16_Data_Classification.md`

Accepted baseline:
- FND-01 Platform Foundation v1.2 — Accepted
- IAM-01 Authentication / MFA / Session v1.2 — Accepted
- IAM-02 RBAC / Permission Guard / SoD v1.2 — Accepted
- SEC-01 Audit Log / Security Monitoring v1.2 — Accepted
- CFG-01 Feature Flag / Licence Lock v1.2 — Accepted
- CLT-01 Client Onboarding / Client Profile v1.2 — Accepted
- KYC-01 KYC / KYB Verification v1.2 — Accepted
- AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening v1.2 — Accepted
- WLT-01 Wallet Screening / Payout Destination Whitelist v1.2 — Accepted
- LED-01 Ledger / Settlement / Safeguarding v1.2 — Accepted
- TRD-01 Quote / Trade / LP Execution v1.2 — Accepted
- E2E-01 Cross-Module End-to-End Fund-Flow Review v1.2 — Accepted
- DEP-01 Deposit Execution / Inbound Receipt v1.2 — Accepted
- WDR-01 Withdrawal / Payout Execution Rail v1.2 — Accepted
- REC-01 Reconciliation / Finance Reporting v1.2 — Accepted
- INC-01 Incident / Freeze / Recovery v1.2 — Accepted


## v1.1 Review Patch Summary

This v1.1 patch closes the Claude Opus initial review gaps:

1. Display-truth non-regression model added:
   - source status version/epoch.
   - never show more favourable status than source.
   - overlay precedence for freeze, quarantine, reversal, restatement and revocation.
   - fail-closed to less favourable / unavailable state when source is stale or absent.
2. Object-level read authorization added:
   - ownership/entitlement check on every readable object.
   - staff assigned-case/mandate scoping.
   - portal service account re-scoped to end-user entitlement.
   - BOLA/IDOR protection.
3. Push invalidation model added:
   - invalidation epoch subscription for freeze/revocation/restatement.
   - loss of subscription fails closed.
   - stale epoch forces revalidation before sensitive display/action.
4. Export/evidence path hardening added:
   - source/policy-engine masking only, never portal-side masking.
   - recipient/purpose/lawful-basis capture.
   - single-use recipient-bound expiring download token.
   - watermark and disclosure log.
   - recheck at generation and download.
5. Hostile browser/input boundary added:
   - quote acceptance bound to server-issued quote ID/hash/validity.
   - client-posted economics rejected.
   - upload safety controls.
   - CSRF/clickjacking/session-fixation/output-encoding controls.
6. Notification supersession and reconcile-before-send added.
7. Step-up bound to action risk and high-value action/amount/destination.
8. Disclosed-fee display truthfulness added.
9. Client-safe reason-code catalogue structurally separated from internal reason codes.
10. Correlation ID propagation into every source call and SEC event added.
11. Source unavailable degraded-display rule added.
12. New tests PRT1-TC-033 to PRT1-TC-078.
