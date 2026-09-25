# ACC-01 Account Structure
## 12 Risk and Control Map

| # | Risk | Consequence | Control | Evidence / test |
|---|---|---|---|---|
| 1 | Subaccount owned by a different legal entity than its master | Cross-client money mixing; safeguarding evidence corrupted | Composite FK `(master_account_id, client_id)`; owner derived by trigger, never supplied | ACC1-T-004/005 |
| 2 | Account ownership silently changed | Client-money attribution and audit trail rewritten | Immutable by column grants + trigger; no transfer path designed; attempt audited Critical | T-006…010 |
| 3 | `client_id` mistaken for `subaccount_id` (or vice versa) downstream | Wrong-owner posting, limit or permission scope | Distinct opaque prefixed identifiers (`mac_`, `sac_`); resolve returns all three dimensions; DEC-011 §4.10 dimension rule in LED-01 DCR | T-001/002; DCR-ACC-LED-01 |
| 4 | Stale `active` account used after freeze or client suspension | Trading/withdrawal on a restricted account | Effective status computed live from CLT-01 + restrictions; **no cache**; consumers store `versions` evidence | T-039/045 |
| 5 | CLT-01 or ACC-01 unavailable read as "fine" | Fail-open on the hot path | `unknown` and 503 are both deny; never empty-200 | T-039/096 |
| 6 | Account created for an ineligible client (retail, pending, closed) | Regulatory breach; retail lock bypass | Client status **and** class checked at submit and again at apply through CLT-01 | T-043/054 |
| 7 | Unapproved or self-approved account change | Fraudulent account creation / restriction lifting | IAM-02 maker-checker, payload-hash-bound execute-verify, single-use token; no direct create/set-status route | T-047…052 |
| 8 | Crash between token consumption and mutation | Stranded approval or double-apply | Claim → verify → `verification_ref` → mutate; recovery finishes exactly once or fails closed | T-055…057 |
| 9 | Status changed without record | Unauditable freeze/unfreeze | Transition + history triggers; commit fails without cause; audit reference `NOT NULL` | T-027/028/088 |
| 10 | Restriction lapses or is lifted improperly | Frozen account released without authority | Authority-sourced restrictions cannot expire; lift needs evidence + approval; child recomputed, never blindly `active` | T-070…072 |
| 11 | Closure strands client money | Balance, open trade or settlement lost | Two-phase closure; readiness attested by LED-01 (fail closed on unreachable/unconfigured); no reopen | T-077…084 |
| 12 | Permission read as capability activation | A held permission or an `active` account treated as production approval | ACC-01 exposes status only; no `enabled` field; DEC-013/014 conjunction; denial attribution | T-061/062/065/113/114 |
| 13 | Subaccount purpose read as product eligibility | `payments`/`rwa` label taken as AIX Pay/RWA approval | Purpose is a label; never read by any control; CFG-01 gates products | T-065; blueprint §11.3 |
| 14 | Scoped permission widens access | Cross-subaccount access | Registry provides validation only; **IAM-02** enforces narrowing-only (DCR-ACC-IAM-01) | IAM-02 suite, §29 item 39 |
| 15 | Enforcement dependency ignored | Scope model shipped with zero effective permissions (IAM2-FIND-002) | Explicit prerequisite; default-deny with zero role_permission tested | T-060 |
| 16 | Existence oracle on client routes | Enumeration of accounts/clients | Observationally identical "no authority" responses | T-064 |
| 17 | Internal seam abuse (e.g. a compromised consumer) | Account enumeration, DoS | Per-module capability secrets, read-only seams, caller audit, rate alarms; interim shared-secret posture accepted (as FINDING-C) — **not** true per-caller cryptographic identity | T-091/094 |
| 18 | Public exposure before perimeter control | Pre-auth abuse (`FND-FIND-001`, HIGH, OPEN) | Client routes deferred; no internet exposure until the finding is resolved | Go-live gate |
| 19 | Route path trips or evades the licence-lock boot guard | Service fails to boot, or an Exchange-shaped route ships | Path allow-list source test | T-099 |
| 20 | Concurrent creation exceeds limit / two defaults | Policy breach, ambiguous default | Advisory lock; partial unique index | T-019/020/118 |
| 21 | Structure drifts from ledger/CLT-01 (no cross-schema FK) | Orphaned ledger accounts; accounts under closed clients | Structural reconciliation R-1…R-8 | file 13 |
| 22 | Subaccount segregation misread as client-money safeguarding | Regulatory misstatement (`A2-Q2`) | ACC-01 asserts **no** safeguarding property; open questions gate go-live for client money | file 15; file 14 |
| 23 | Test-harness fragility (shared DB, unscoped deletes, superuser runs) | False greens | Fail-loud canary, ownership-scoped fixtures, non-superuser role canary, no head pin | T-105…110 |
| 24 | ACC-01 built before its consumers agree the contract | Rework across LED-01/CLT-01/IAM-02 | DCR register (file 17); LED-01 may not freeze until it consumes DEC-011 **and** this pack | file 17 |
