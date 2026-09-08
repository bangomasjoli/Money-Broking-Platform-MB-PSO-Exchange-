# WLT-01 Wallet Screening / Payout Destination Whitelist
## 07 Permission Rules

## 1. Permission Namespace

```txt
wlt1.<resource>.<action>
```

---

## 2. Permissions

| Permission | Purpose |
|---|---|
| `wlt1.wallet.create` | Register wallet |
| `wlt1.wallet.read` | Read wallet |
| `wlt1.wallet.screen` | Screen wallet |
| `wlt1.wallet.approve` | Approve wallet whitelist |
| `wlt1.wallet.revoke` | Revoke wallet |
| `wlt1.payout_destination.create` | Register payout destination |
| `wlt1.payout_destination.read` | Read payout destination |
| `wlt1.payout_destination.verify` | Verify payout destination |
| `wlt1.payout_destination.approve` | Approve payout whitelist |
| `wlt1.payout_destination.revoke` | Revoke payout destination |
| `wlt1.destination.evaluate_use` | Evaluate destination use |
| `wlt1.destination.override_cooling` | Override cooling-off |
| `wlt1.destination.high_risk_approve` | Approve high-risk destination |
| `wlt1.evidence.export` | Export evidence |
| `wlt1.admin.configure` | Configure WLT module |

---

## 3. Maker-Checker Required

Required for:

1. whitelist activation.
2. high-risk wallet approval.
3. third-party beneficiary approval.
4. cooling-off override.
5. revocation reversal.
6. vendor/manual risk override.
7. Travel Rule exception.
8. evidence export.
9. destination status override.
10. beneficiary mismatch approval.

---

## 4. SoD Rules

1. Client maker cannot approve own destination.
2. Client maker cannot approve own payout beneficiary.
3. Staff who reviews high-risk wallet cannot solely approve exception where Compliance required.
4. Super Admin cannot bypass whitelist.
5. Break-glass cannot approve destination.
6. Service account cannot approve whitelist.
7. AML/KYC/CLT restriction cannot be overridden inside WLT-01.
8. Destination decision issuer cannot alter destination status.

---

## 5. Decision Rules

Destination use allow requires:

```txt
destination_status = active
cooling_off = completed_or_not_applicable
client_status = active_allowed
mandate = valid
client_dual_auth = satisfied where required
wallet_or_payout_risk = clear_or_approved
aml_pre_transaction_gate = current_clear where required
travel_rule_data = complete where required
decision_scope = exact_match
```

Hard block:

```txt
revoked_destination
stale_aml_decision
sanctions_hit
wallet_sanctions_exposure
beneficiary_mismatch_unapproved
cooling_off_active
scope_mismatch
```
