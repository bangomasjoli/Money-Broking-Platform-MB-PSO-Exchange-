# DEP-01 Deposit Execution / Inbound Receipt
## 13 Reconciliation Design

## 1. Purpose

DEP-01 reconciliation proves that every external receipt is authenticated, deduplicated, matched or quarantined, screened through WLT/AML where required, handed to LED, and not credited by DEP.

---

## 2. Reconciliation Types

| Reconciliation | Source A | Source B | Purpose |
|---|---|---|---|
| External receipt | provider statement/webhook/API | DEP receipt | Receipt completeness |
| Deduplication | provider event IDs | DEP unique keys | No duplicates |
| Matching | DEP receipt | deposit intent/client | Attribution |
| Screening | DEP deposit | WLT/AML decision | Source control |
| Confirmation | provider finality | DEP confirmation | No premature credit |
| LED pending | DEP deposit | LED pending deposit | Ledger handoff |
| LED credit | DEP credit request | LED journal/status | Credit authority |
| Reversal | provider reversal | LED clawback | Recall control |
| Audit | expected events | SEC emitted events | Evidence completeness |
| E2E | correlation ID | evidence bundle | Saga completeness |

---

## 3. Scheduled Jobs

1. Receipt without DEP record.
2. DEP receipt without authentication.
3. Duplicate provider event.
4. Same event/different payload conflict.
5. Authenticated receipt older than SLA with no match/quarantine.
6. Matched deposit without WLT/AML decision.
7. Credit-requested deposit without sufficient confirmation.
8. LED credited deposit without DEP clear status.
9. Reversal event without LED clawback notification.
10. Quarantine case older than SLA.
11. Missing correlation ID.
12. Missing SEC event.

---

## 4. Critical Findings

| Finding | Severity |
|---|---|
| DEP ledger credit attempt | Critical |
| Unauthenticated receipt matched | Critical |
| Duplicate receipt credited | Critical |
| Ambiguous deposit credited | Critical |
| Deposit credited without WLT/AML clear | Critical |
| Deposit credited before confirmation | Critical |
| Reversal ignored | Critical |
| Missing correlation ID | Critical |
| Missing SEC audit | Critical |

## v1.1 Additional Reconciliation

Additional scheduled jobs:

1. Deposit credit request without valid coherent bundle.
2. In-flight deposit affected by AML/WLT revocation.
3. Deposit source not own-verified or SoF-reviewed.
4. Large/first deposit without SoF/SoW evidence.
5. Crypto finality missing reorg-depth/corroboration.
6. Fiat finality with open return window.
7. Receipt provider identity invalid/expired.
8. File feed missing sequence.
9. Webhook receipt not corroborated by independent truth.
10. Expired/cancelled intent matched.
11. Reused address/memo correlation ambiguity.
12. Unexpected amount disposition missing.
13. Return case bypassing payout controls.
14. Reversal event not linked to original correlation/saga.
15. LED pending unmatched older than SLA.

Critical findings:

1. stale WLT/AML decision used for credit request.
2. third-party source auto-credit.
3. fabricated receipt enters credit path.
4. false economic finality.
5. wrong correlation/expired intent auto-credit.
6. reversal cannot trace original credit.
