# E2E-01 Cross-Module End-to-End Fund-Flow Review
## 09 Gap Risk Checklist For Claude

## 1. Critical Cross-Module Questions

Claude should verify:

1. Is there any route from onboarding to trading without both KYC and AML current clear?
2. Is there any money movement path that does not call AML pre-transaction gate?
3. Is there any payout/withdrawal route that does not consume WLT destination decision?
4. Is there any trade route that does not obtain LED prefunded hold before LP execution?
5. Is there any client fill route without conserved external LP fill?
6. Is there any client balance credit without confirmed/free backing?
7. Is there any settlement that can create AIX principal exposure?
8. Is there any Exchange feature path despite CFG/IAM locks?
9. Is there any critical action that can proceed when SEC audit fails?
10. Is there any stale decision token accepted by a downstream module?
11. Is there any race between quote acceptance, AML revocation, CFG revocation and execution?
12. Is there any race between WLT destination revocation and LED payout?
13. Is there any race between LED hold and TRD LP execution?
14. Is there any weak link in idempotency where duplicate fill/posting can happen?
15. Is there any module owning logic that should be owned elsewhere?

## 2. Integration Risk Areas

| Risk Area | What to Check |
|---|---|
| Decision freshness | expiry, revocation epoch, version binding |
| Source of truth | no duplicate ownership of KYC/AML/ledger/trade |
| Fail-closed | vendor outage, audit outage, LP outage, AML outage |
| Runtime licence lock | CFG checks at action points, not only setup |
| Principal exposure | AIX never fills gaps |
| Internalisation | no client-to-client netting |
| Ledger integrity | live balance, hash-chain, immutable journal |
| Safeguarding | preventive free backing check |
| Confirmation truth | client sees LED actual settlement outcome |
| Reconciliation | critical breaks do not auto-clear |

## 3. Expected Claude Output

Claude should return:

1. Critical cross-module gaps.
2. Recommended corrections.
3. Missing integration contracts.
4. Missing E2E tests.
5. Missing go-live gates.
6. Whether the accepted module chain is ready for implementation handover.
