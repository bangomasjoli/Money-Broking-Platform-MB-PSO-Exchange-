# ACC-01 Account Structure
## 13 Reconciliation Design (v0.4)

ACC-01 holds no money, so it has **no financial reconciliation**. It has **structural reconciliation**: proving that the account structure is internally consistent and that the structures other modules hold *about* it (LED-01 ledger accounts, CLT-01 clients) still point at valid, owned, usable accounts. It exists because ACC-01 deliberately has no cross-schema foreign keys (file 05 §1.2) — the database cannot prove those relationships, so reconciliation must.

## 1. Checks

| # | Check | Scope | Severity on break |
|---|---|---|---|
| R-1 | `subaccount.client_id = master_account.client_id` for every subaccount | ACC-01 only | Critical (should be impossible: composite FK + trigger) |
| R-2 | Stored `status` equals the last `account_status_history.to_status` for every row | ACC-01 only | Critical |
| R-3 | Every `client_id` on a non-`closed` account resolves in CLT-01, and no non-`closed` account exists under a CLT-01 client that is `closed` | ACC-01 ↔ CLT-01 | Critical |
| R-4 | Stored `restricted`/`suspended`/`frozen`/`active` equals the projection of the target's active restrictions (rows in `closing`/`closed` excluded) | ACC-01 only | Critical |
| R-5 | Every `led1.ledger_account.subaccount_id` resolves to an ACC-01 subaccount whose `client_id` equals the ledger account's `client_id` where LED-01 keeps one | ACC-01 ↔ LED-01 | Critical |
| R-6 | Every `closed` account has, per configured attester, a **latest** `clear` post-barrier attestation at its `closure_seal_version`, **bound to its seal pin** (`binding_ok`, `preseal_watermark_ref` = the pin's watermark), satisfying the completion criteria (file 06 §5), and zero LED-01 balance, no open hold/reservation/settlement, **no posting after the pre-seal watermark** and no posting whose stored resolution `version` ≥ `closure_sealed_at_version` (replay against current LED-01 data) | ACC-01 ↔ LED-01 | Critical |
| R-7 | Every account has an `applied` creation change request with `approval_id` and `sec_audit_ref`; every status-history row has `sec_audit_ref`. **(R2-F04)** The report states each row's `approval_id_source`: `caller_asserted` values are listed as *unverified evidence*, never counted as verified | ACC-01 only | High |
| R-8 | **(R3, ACC-REQ-050) Every non-`closed` master has exactly one non-`closed` default subaccount; a `closed` master has only `closed` subaccounts.** No `closing` master with an operational child (R2-F02); no `closure_sealed` master with a child that is neither a `closure_sealed` master-directed member nor a `closed` independent one; **no `closed` default under a non-`closed` master** (v0.3 treated it as legitimate after an abort; that state is now a Critical break); no default in `closing`/`closure_sealed`/`closed` without its master's `closure_family_id`; every `closure_family_member` set has exactly one master and one default; every `account_restriction` row's owner equals its target's owner | ACC-01 only | **Critical** |
| R-9 | **(R2)** `closure_barrier = (status ∈ {closure_sealed, closed})` for every row; every row whose barrier went `true → false` has a `closure_recovery` row; `closure_seal_version` never lower than any attestation's `seal_version_observed` for that target; every `closure_recovery` row has `sec_audit_ref` and an applied `abort_closure` request; **(R3)** every family-abort recovery set covers exactly the master, the default and the master-directed members and no independent closure | ACC-01 only | Critical |
| R-10 | **(R3, R3-F02)** Every `closure_sealed`/`closed` row has exactly one `closure_seal_pin` whose pinned readiness rows are `ready`, were the latest at the seal and match the pin's watermark and payload hash; **no `closure_readiness` row exists for that target with a `readiness_seq` above the pinned row's** (a row injected after the seal is an integrity break); every counting attestation's `preseal_watermark_ref` equals the pin's; every `closed` family member was closed in its master's completion transaction (history cause `closure_family_complete`) | ACC-01 only | Critical |

## 2. Mechanics

- ACC-01 exposes a **read-only extract** (`GET /internal/acc1/reconciliation/extract`, keyset-paged, no PII): `(subaccount_id, master_account_id, client_id, status, version)` and `(master_account_id, client_id, status, version)`.
- **R-1, R-2, R-4, R-7, R-8, R-9, R-10** run inside ACC-01 (a scheduled job under `role_acc1_runtime`, SELECT-only queries).
- **R-3** runs in ACC-01 by sampling the CLT-01 status seam in batches **through the dedicated read-scoped credential (the same single client as resolve/apply)**; an unreadable CLT-01 is recorded as *inconclusive*, never as *clean*.
- **R-5, R-6** run in **LED-01 / REC-01** using ACC-01's extract, because only they can read ledger data (ACC-01 has no `led1` grant). This is a `DCR-ACC-LED-01` / `REC-01` deliverable.
- A break emits `acc1.reconciliation_finding` (High/Critical) and is recorded by the running module; **findings are never auto-repaired** — repair of a structural break is a governed change, not a script. ACC-01 records the break; REC-01 owns break lifecycle and closure (Role Matrix §23 "Reconciliation break closure: Finance Officer / Finance Manager").
- Cadence: R-1…R-4, R-7…R-10 daily and after any recovery, family-completion or family-abort action; R-3, R-5, R-6 per REC-01 schedule. An *inconclusive* run is itself a finding after a configured number of consecutive occurrences.

## 3. Out of scope

Balance, holding, safeguarding-shortfall and client-money reconciliation (LED-01 / REC-01). ACC-01's contribution to those is only that the structure they group by is trustworthy.
