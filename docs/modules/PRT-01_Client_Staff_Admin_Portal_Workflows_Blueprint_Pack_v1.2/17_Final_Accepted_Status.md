# PRT-01 Final Accepted Status

## Status

PRT-01 Client / Staff / Admin Portal Workflows v1.2 is accepted / final verified.

## Control Change From v1.1

None.

## Accepted Baseline

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
- PRT-01 Client / Staff / Admin Portal Workflows v1.2 — Accepted


## Assurance Result

PRT-01 is accepted as the presentation and portal interaction layer. It displays and routes actions only; it cannot own ledger, balances, source-of-truth decisions, deposit credit, payout execution, trade execution, AML/WLT/KYC decisions, REC break closure, INC freeze release, audit deletion, or Exchange UI.

Key accepted controls:

1. Display-truth non-regression model.
2. Source status version / epoch binding.
3. Overlay precedence for freeze, quarantine, reversal, restatement and revocation.
4. Fail-closed degraded display when source is stale, absent or unreachable.
5. Object-level read authorization.
6. BOLA / IDOR protection.
7. Staff assigned-case / mandate scoping.
8. Portal service account re-scoped to end-user entitlement.
9. Push invalidation subscription.
10. Export egress hardening.
11. Source-side masking only.
12. Recipient / purpose / lawful-basis disclosure log.
13. Recipient-bound single-use expiring download token.
14. Generation-time and download-time rechecks.
15. Hostile browser / input boundary.
16. Quote acceptance bound to server quote ID / hash / validity / economics.
17. Upload safety controls.
18. CSRF / clickjacking / session-fixation / output-encoding controls.
19. Notification supersession and reconcile-before-send.
20. Action-bound step-up.
21. Disclosed-fee display truthfulness.
22. Client-safe reason-code catalogue.
23. Correlation ID propagation into every source call and SEC event.
24. Source unavailable displayed as degraded / unknown, never all-clear.

## Programme Status

The platform blueprint chain is review-complete and accepted.

## Next Step

AIX Master Implementation Handover Pack v1.0.
