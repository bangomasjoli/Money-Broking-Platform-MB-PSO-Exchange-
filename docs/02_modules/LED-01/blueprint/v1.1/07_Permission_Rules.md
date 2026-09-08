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
| `led1.reservation.atomic_create` | Atomic reservation |
| `led1.dvp.create` | Create DvP group |
| `led1.backing.encumber` | Encumber backing |
| `led1.conversion.create` | Create conversion event |
| `led1.clawback.create` | Create clawback |
| `led1.journal_chain.verify` | Verify journal chain |
| `led1.operational_bounds.manage` | Manage operational account bounds |

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
11. operational/clearing/suspense/residual bound change.
12. residual disposition/writeoff.
13. clawback/shortfall resolution.
14. DvP unwind approval.
15. external anchor exception.

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

## 6. v1.1 Elevated Rules

1. No permission may bypass atomic reservation.
2. No permission may use balance snapshot for reservation.
3. No permission may post unsealed journal.
4. No permission may allow operational/clearing/suspense account to fund client settlement.
5. Residual/dust disposition requires approved policy.
6. Clawback shortfall resolution requires maker-checker and Finance/Compliance review.
