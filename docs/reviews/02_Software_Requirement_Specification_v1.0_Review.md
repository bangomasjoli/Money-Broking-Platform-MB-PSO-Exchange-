# Principal Fintech Platform Architect Review

## Document Reviewed: 02_Software_Requirement_Specification_v1.0.md

| Item | Details |
|---|---|
| Reviewed document | 02_Software_Requirement_Specification_v1.0.md |
| Platform | AIX Money Broking Platform |
| Review type | Principal Fintech Platform Architect / SRS Review |
| Base documents (as cited) | 00_Licence_Scope_And_Feature_Lock_v1.3.md, 01_Project_Charter_v1.3.md, 03_Master_Module_Index_v1.2.md |
| Review basis | Labuan FSA Money Broking + PSO scope, Exchange application pending |
| Verdict | Strong SRS; five critical gaps (one AML loophole, one PSO safeguarding gap, one concurrency gap, one market-conduct FR, one version conflict) to close before the Role & Permission Matrix |

---

## 0. Summary

This is a strong SRS. It faithfully carries the licence locks, agency / back-to-back model, pre-funded hold, DvP, payout whitelist, and go-live gates from the upstream documents, and adds a solid error-code taxonomy (§24) and state-machine list (§22).

**Version-control flag (read first):** the SRS cites **Base document 3 = `03_Master_Module_Index_v1.2.md`**, but the accepted / available module index is **v1.1** (no v1.2 exists in the document set). The SRS is built on a phantom base version — this must be reconciled for traceability.

This review focuses on the genuine gaps.

---

## 1. Critical Gaps

### C1. Third-party payout loophole (Areas 3, 5) — HIGHEST PRIORITY

MON-SRS-006 says a payout destination must "**belong to or be approved for** the client." The "or be approved for" clause permits withdrawals to **third-party accounts** — one of the sharpest AML / safeguarding red flags for a money broker holding client funds. Client money should return only to an account in the **client's own verified name**. As written, this quietly authorises third-party remittance.

### C2. No client-money safeguarding *computation* requirement (Areas 4, 5)

MON-SRS-009 gives daily client-money *reconciliation*, but there is **no FR for the safeguarding obligation itself**: that client funds must be **fully backed at all times** in the segregated account, with **shortfall detection, top-up obligation, and a prohibition on using client money for AIX operations**. Module MON-23 (Client Money Safeguarding Account Control) from the index is never translated into an SRS requirement. This is a core PSO / client-money control and it is missing at the requirement level.

### C3. No concurrency / transactional-integrity control for balances and ledger (Areas 1, 5)

MON-SRS-002 / 003 state "hold cannot exceed available balance," but nothing specifies **how simultaneous operations are serialized.** Two concurrent trades can both pass the "hold ≤ available" check and **double-spend the same available balance**, and ledger postings can interleave out of order. For a money-critical system this needs an explicit requirement: **atomic hold + ledger posting, row-level locking / serializable isolation, and no double-commit against available balance.** Idempotency (FND-SRS-004) prevents duplicate *retries* but not concurrent *distinct* operations — a different problem.

### C4. No best-execution / fair-pricing functional requirement (Areas 3, 10)

Best execution appears as stored *evidence* (data §21) and the pricing engine has a price-deviation check (PRD-SRS-002.7), but there is **no FR obligating a best-execution / fair-pricing check** before booking. This was elevated in the earlier lock / charter reviews as the key conflict-of-interest control (AIX chooses the LP and the price); it needs to be a requirement, not just an artifact.

### C5. Base-document version conflict (Area 11)

As noted — SRS base 3 references Module Index **v1.2**, which does not exist (set contains v1.0, v1.1). A controlled SRS must trace to a real, accepted upstream version. Either surface v1.2 or correct the reference to v1.1.

---

## 2. Recommended Corrections

1. **Close the third-party payout loophole (C1).** Rewrite MON-SRS-006.1 to: *payout destination must be in the client's own verified name.* Prohibit third-party withdrawals by default; if ever allowed, gate behind EDD + senior compliance approval + documented rationale, and add error code `THIRD_PARTY_PAYOUT_BLOCKED`.

2. **Add MON-SRS-011 Client Money Safeguarding Computation (C2):** daily client-money requirement vs resource computation, full-backing invariant, shortfall detection and top-up obligation, and an explicit rule that client money is never used for AIX expenses / settlement of proprietary obligations.

3. **Add a Concurrency & Transactional Integrity requirement (C3)** (FND- or MON-level): balance hold + ledger posting must be atomic and serialized; concurrent operations cannot double-allocate available balance; define isolation / locking expectation. Add a corresponding test (see below).

4. **Add a Best-Execution / Fair-Pricing FR (C4):** before trade booking, the quote must be validated against the LP reference within tolerance, fairness evidence retained, and the check enforced (not just recorded). Reference the conflict-of-interest risk from the Charter.

5. **Fix the base-document reference (C5)** to the real accepted Module Index version, and confirm §21's "every PII module must have `16_Data_Classification.md`" aligns with the module-index pack rule (this SRS statement actually resolves the earlier "high-risk-only" scope mismatch — keep it).

6. **Strengthen testing (§25):** add **performance / load testing** (there is a perf NFR but no perf test), a **concurrency / race test** for balance holds, and a **DvP / settlement-sequence test**. Currently the perf targets in NFR-SRS-001 are unverified by any test requirement.

7. **Add a Segregation-of-Duties requirement.** Maker-checker (OPS-SRS-002) covers dual control, but nothing prevents SoD conflicts (e.g., the onboarding approver also approving that client's withdrawals). Add an SoD conflict-matrix requirement.

8. **Add a Data-Residency / Privacy NFR.** Data residency and PDPA appear only as open items (§28); given KYC / Travel Rule PII, they warrant an NFR, not just a deferred value.

9. **Specify fee reversal on voided trades.** PRD-SRS-001 defines fee calculation but not what happens to a charged fee when a trade voids / re-quotes (LP failure, slippage). Add a fee-reversal rule tied to MON-SRS-007.

10. **Tighten staff-entered quotes (PRD-SRS-004.6).** State explicitly that staff / system quotes must be LP-derived with disclosed fee only — no manual price markup — to prevent a manual-quote path around the spread lock.

---

## 3. Additional Requirements / Parameters to Add

```txt
# --- New / revised functional requirements ---
MON-SRS-006 (revise)  Payout destination must be in client's own verified name; third-party payout prohibited by default
MON-SRS-011 (new)     Client Money Safeguarding Computation (full-backing, shortfall, top-up, no operational use)
FND-SRS-006 (new)     Concurrency & Transactional Integrity (atomic hold+ledger, serialized, no double-spend)
PRD-SRS-008 (new)     Best Execution / Fair Pricing check enforced before booking
OPS-SRS-006 (new)     Segregation-of-Duties conflict matrix
NFR-SRS-006 (new)     Data residency + PDPA / privacy compliance

# --- New error codes ---
THIRD_PARTY_PAYOUT_BLOCKED
CLIENT_MONEY_SHORTFALL
BEST_EXECUTION_CHECK_FAILED
CONCURRENCY_CONFLICT

# --- Control parameters ---
withdrawal_own_name_only = true
third_party_payout = prohibited_by_default
client_money_fully_backed_invariant = true
client_money_operational_use = prohibited
balance_operations_atomic = true
balance_isolation = serializable_or_row_lock
best_execution_check = required_before_booking
fee_reversal_on_void = required
segregation_of_duties_matrix = required
load_test_required = true
concurrency_test_required = true
dvp_sequence_test_required = true
data_residency = required_before_production
staff_quote_manual_markup = prohibited
```

---

## 4. Top Priorities Before the Role & Permission Matrix

1. **C1** — Third-party payout loophole. An outright AML weakness.
2. **C2** — Client-money safeguarding computation. The PSO obligation that daily reconciliation alone does not satisfy.
3. **C3** — Concurrency control on balances. The money-critical integrity gap that idempotency does not cover.

C4 (best-execution FR) and C5 (version conflict) should be closed in the same pass — one is a market-conduct requirement, the other a traceability defect.
