# LED-01 Ledger / Settlement / Safeguarding
## 07 Permission Rules

## 1. Permission Namespace

```txt
led1.<resource>.<action>
```

---

## 2. Permissions

| Permission | Purpose |
|---|---|
| `led1.journal.post` | Post journal |
| `led1.journal.read` | Read journal |
| `led1.journal.reverse` | Reverse journal |
| `led1.balance.read` | Read balances |
| `led1.hold.create` | Create hold |
| `led1.hold.consume` | Consume hold |
| `led1.hold.release` | Release hold |
| `led1.deposit.create_pending` | Create pending deposit |
| `led1.deposit.credit` | Credit deposit |
| `led1.settlement.create` | Create settlement |
| `led1.settlement.confirm` | Confirm settlement |
| `led1.reconciliation.run` | Run reconciliation |
| `led1.reconciliation.resolve` | Resolve break |
| `led1.freeze.create` | Create freeze |
| `led1.freeze.release` | Release freeze |
| `led1.period_close.manage` | Close/reopen period |
| `led1.evidence.export` | Export evidence |
| `led1.admin.configure` | Configure ledger |

---

## 3. Maker-Checker Required

Required for:

1. manual journal adjustment.
2. reversal/correction.
3. reconciliation break resolution.
4. freeze release.
5. period close.
6. closed-period adjustment.
7. fee schedule configuration.
8. safeguarding breach remediation.
9. hold manual release for failed settlement.
10. evidence export.

---

## 4. Never Allowed

No role may have:

```txt
ledger.direct_edit
balance.direct_edit
journal.delete
journal.update_posted
safeguarding.bypass
negative_balance.allow
principal_exposure.allow
```

---

## 5. SoD Rules

1. Requester of adjustment cannot approve it.
2. Poster of original journal cannot approve reversal where policy requires.
3. Reconciliation break owner cannot solely approve own resolution.
4. Super Admin cannot edit balance.
5. Break-glass cannot post financial movement.
6. Service account cannot approve manual adjustment.
7. Finance close approver cannot be the only reconciler for same period.
