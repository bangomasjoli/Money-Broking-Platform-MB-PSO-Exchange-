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
