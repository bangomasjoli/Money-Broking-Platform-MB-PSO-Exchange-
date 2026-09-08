# DEP-01 Deposit Execution / Inbound Receipt
## 07 Permission Rules

## 1. Permission Namespace

```txt
dep1.<resource>.<action>
```

---

## 2. Permissions

| Permission | Purpose |
|---|---|
| `dep1.intent.create` | Create deposit intent |
| `dep1.intent.read` | Read deposit intent |
| `dep1.receipt.ingest` | Ingest receipt |
| `dep1.receipt.read` | Read receipt |
| `dep1.receipt.match` | Match receipt |
| `dep1.source.extract` | Extract source metadata |
| `dep1.screening.send` | Send WLT/AML screening |
| `dep1.led.create_pending` | Create LED pending deposit |
| `dep1.led.request_credit_evaluation` | Request LED credit evaluation |
| `dep1.led.notify_clawback` | Notify LED clawback |
| `dep1.quarantine.read` | Read quarantine case |
| `dep1.quarantine.resolve` | Resolve quarantine |
| `dep1.reconciliation.run` | Run reconciliation |
| `dep1.reconciliation.resolve` | Resolve recon break |
| `dep1.evidence.export` | Export deposit evidence |
| `dep1.admin.configure` | Configure deposit settings |

---

## 3. Maker-Checker Required

Required for:

1. manual receipt match.
2. ambiguous deposit resolution.
3. manual evidence acceptance.
4. quarantine release.
5. LED credit evaluation replay.
6. reversal/recall manual resolution.
7. confirmation threshold change.
8. supported rail/asset change.
9. evidence export.
10. reconciliation break resolution.

---

## 4. Never Allowed

No role may have:

```txt
dep1.ledger.credit
dep1.balance.edit
dep1.bypass_wlt_screening
dep1.bypass_aml_gate
dep1.bypass_led_credit
dep1.force_auto_match
dep1.delete_receipt_evidence
```

---

## 5. SoD Rules

1. User who manually matches receipt cannot approve same deposit release.
2. User who resolves quarantine cannot be sole approver for LED credit replay.
3. Super Admin cannot credit balance.
4. Service account cannot approve manual match.
5. Break-glass cannot mark deposit clear.
