# LED-01 Ledger / Settlement / Safeguarding
## 05 Database Design

## 1. Schema

Recommended schema:

```txt
led1
```

Runtime DB role:

```txt
role_led1_runtime
```

Rules:

1. LED-01 runtime role owns/accesses LED-01 schema only.
2. Posted journals are append-only.
3. Balances are derived from journal lines and holds.
4. No direct balance edit table/function.
5. Production/test ledgers are physically/logically separated.

---

## 2. Tables

### 2.1 `led1.ledger_account`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| account_id | varchar | Unique |
| account_type | varchar | client_liability/safeguarded_asset/fee_income/settlement/hold/clearing/operational |
| client_id | varchar | Optional |
| asset_or_currency | varchar | Asset/currency |
| rail_or_chain | varchar | Rail/chain |
| status | varchar | active/frozen/closed |
| created_at_utc | timestamptz | Created |
| sec_audit_ref | varchar | Audit |

### 2.2 `led1.journal`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| journal_id | varchar | Unique |
| source_module | varchar | Source |
| source_event_id | varchar | Event |
| idempotency_key | varchar | Idempotency |
| journal_type | varchar | deposit_credit/withdrawal_reserve/settlement/fee/reversal/adjustment/hold |
| status | varchar | posted/reversed/voided |
| posting_period | varchar | Period |
| control_refs | jsonb | WLT/AML/CLT/hold refs |
| total_debit | numeric | Debit |
| total_credit | numeric | Credit |
| balanced | boolean | Must be true |
| posted_at_utc | timestamptz | Posted |
| sec_audit_ref | varchar | Audit |

### 2.3 `led1.journal_line`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| journal_line_id | varchar | Unique |
| journal_id | varchar | Journal |
| account_id | varchar | Account |
| debit_credit | varchar | debit/credit |
| amount | numeric | Amount |
| asset_or_currency | varchar | Asset/currency |
| client_id | varchar | Optional |
| line_memo | varchar | Safe memo |
| sequence_no | int | Sequence |

### 2.4 `led1.balance_snapshot`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| snapshot_id | varchar | Unique |
| account_id | varchar | Account |
| client_id | varchar | Optional |
| asset_or_currency | varchar | Asset |
| available_balance | numeric | Derived |
| held_balance | numeric | Derived |
| pending_balance | numeric | Derived |
| settled_balance | numeric | Derived |
| as_of_journal_sequence | bigint | Sequence |
| computed_at_utc | timestamptz | Computed |
| hash | varchar | Integrity |

### 2.5 `led1.hold`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| hold_id | varchar | Unique |
| client_id | varchar | Client |
| asset_or_currency | varchar | Asset |
| amount | numeric | Held |
| hold_type | varchar | lp_execution/payout/withdrawal/settlement |
| status | varchar | active/consumed/released/expired/cancelled |
| source_ref | varchar | Trade/payout ref |
| expires_at_utc | timestamptz | Expiry |
| consumed_at_utc | timestamptz | Consumed |
| released_at_utc | timestamptz | Released |
| sec_audit_ref | varchar | Audit |

### 2.6 `led1.deposit`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| deposit_id | varchar | Unique |
| client_id | varchar | Client |
| asset_or_currency | varchar | Asset |
| amount | numeric | Amount |
| source_ref | varchar | Bank/custodian/chain ref |
| wlt_source_screening_ref | varchar | WLT inbound source |
| receipt_status | varchar | pending/confirmed/failed |
| credit_status | varchar | pending/quarantined/credited/rejected |
| journal_id | varchar | Credit journal |
| sec_audit_ref | varchar | Audit |

### 2.7 `led1.settlement`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| settlement_id | varchar | Unique |
| settlement_type | varchar | payout/withdrawal/trade/lp_execution/internal |
| client_id | varchar | Client |
| asset_or_currency | varchar | Asset |
| amount | numeric | Amount |
| status | varchar | requested/held/instructed/confirmed/failed/released/reversed |
| hold_id | varchar | Hold |
| wlt_decision_ref | varchar | WLT decision |
| aml_decision_ref | varchar | AML decision |
| execution_ref | varchar | Payment/custodian/LP |
| journal_id | varchar | Final journal |
| sec_audit_ref | varchar | Audit |

### 2.8 `led1.safeguarding_position`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| position_id | varchar | Unique |
| asset_or_currency | varchar | Asset |
| client_liability_total | numeric | Liabilities |
| safeguarded_asset_total | numeric | Assets |
| variance | numeric | Assets - liabilities |
| invariant_status | varchar | pass/breach/review |
| source_refs | jsonb | Bank/custodian/chain refs |
| computed_at_utc | timestamptz | Time |
| sec_audit_ref | varchar | Audit |

### 2.9 `led1.reconciliation_run`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| run_id | varchar | Unique |
| recon_type | varchar | bank/custodian/chain/subledger/holds/wlt/aml/lp/safeguarding |
| status | varchar | running/completed/failed |
| break_count | int | Count |
| started_at_utc | timestamptz | Start |
| completed_at_utc | timestamptz | Complete |
| sec_audit_ref | varchar | Audit |

### 2.10 `led1.reconciliation_break`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| break_id | varchar | Unique |
| run_id | varchar | Run |
| severity | varchar | low/medium/high/critical |
| break_type | varchar | mismatch/missing/stale/invariant_breach/unposted |
| affected_ref | varchar | Ref |
| status | varchar | open/in_review/resolved/escalated |
| owner | varchar | Owner |
| resolution_ref | varchar | Evidence |
| sec_audit_ref | varchar | Audit |

### 2.11 `led1.freeze`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| freeze_id | varchar | Unique |
| scope_type | varchar | client/asset/rail/module/global |
| scope_ref | varchar | Scope |
| reason_code | varchar | Safe reason |
| status | varchar | active/released |
| approval_id | varchar | IAM-02 approval |
| created_at_utc | timestamptz | Created |
| released_at_utc | timestamptz | Released |
| sec_audit_ref | varchar | Audit |

### 2.12 `led1.period_close`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary |
| close_id | varchar | Unique |
| period | varchar | Period |
| status | varchar | open/closing/closed/reopened_for_adjustment |
| closed_by | varchar | User |
| approval_id | varchar | Approval |
| closed_at_utc | timestamptz | Closed |
| sec_audit_ref | varchar | Audit |

---

## 3. Indexes

1. `ledger_account(account_id, status)`.
2. `ledger_account(client_id, asset_or_currency)`.
3. `journal(source_module, source_event_id)`.
4. `journal(idempotency_key)`.
5. `journal(posting_period, status)`.
6. `journal_line(journal_id, account_id)`.
7. `balance_snapshot(account_id, as_of_journal_sequence)`.
8. `hold(client_id, status, expires_at_utc)`.
9. `deposit(client_id, credit_status)`.
10. `settlement(client_id, status)`.
11. `safeguarding_position(asset_or_currency, invariant_status)`.
12. `reconciliation_break(run_id, severity, status)`.
13. `freeze(scope_type, scope_ref, status)`.
14. `period_close(period, status)`.

---

## 4. Data Rules

1. Journal must be balanced.
2. Journal lines cannot be changed after posting.
3. Balance is derived, not edited.
4. Available balance cannot go negative.
5. Deposit credit requires confirmed/backed receipt.
6. Withdrawal/payout requires reserve/hold.
7. LP execution requires prefunded hold.
8. Settlement requires valid DvP state.
9. WLT decision must be consumed at execution time.
10. AML decision must be current.
11. Client liabilities must be fully backed.
12. Fee must have disclosure reference.
13. Reversal must reference original journal.
14. Closed/frozen scope blocks posting.
15. Duplicate source event cannot double-post.
