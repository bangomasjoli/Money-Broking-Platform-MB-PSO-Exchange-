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

## 4. v1.1 Additional Claude Checks

Claude should also verify:

1. Is every money-flow action bound to one saga/correlation ID?
2. Does every saga step define forward action, compensation, owner and SLA?
3. Can any WLT decision, LED hold, LP order, settlement handoff or rail instruction become orphaned?
4. Are all tokens in a decision bundle bound to same correlation/client/amount/asset/action/snapshot?
5. Is point-in-time eligibility snapshot defined strongly enough?
6. Are global validity windows and revocation SLAs defined?
7. Is disposition defined for revocation during pre-hold, held, executing, settling and irreversible-leg stages?
8. Is value conservation proven across TRD and LED seams?
9. Is AIX net zero proven per correlation and daily?
10. Is freeze propagation ordered and scoped across modules?
11. Does recovery require global integrity, safeguarding and orphan checks?
12. Are deposit/withdrawal execution rail boundaries clearly marked pending?
13. Can regulators retrieve one complete evidence bundle by correlation ID?
