# Principal Fintech Platform Architect Review

## Document Reviewed: 10_Master_Testing_Strategy_v1.0.md

| Item | Details |
|---|---|
| Reviewed document | 10_Master_Testing_Strategy_v1.0.md |
| Platform | AIX Money Broking + PSO Platform |
| Review type | Principal Fintech Platform Architect / Regulated Fintech QA · Security · Compliance Review |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 03 v1.2, 02 v1.2, 04 v1.2, 05 v1.2, 06 v1.2, 07 v1.2, 08 v1.2, 09 v1.2 |
| Review basis | Labuan FSA Money Broking + PSO scope, Exchange application pending |
| Verdict | Strong, comprehensive testing strategy; five gaps (traceability coverage audit, offboarding/complaints coverage, aggregate zero-inventory + money-outbox, deposit-source verification, data-migration integrity) to close before the Master Deployment Strategy (doc 11) |

---

## 0. Summary

This is a strong, comprehensive testing strategy — 12 test levels (§4), risk-based / mandatory-negative / backend-enforcement / evidence-based principles (§3), an environment strategy (§5), a traceability chain (§6), and roughly 230 enumerated test cases across licence-lock (§7), onboarding (§8), RBAC/SoD (§9), auth/impersonation (§10), API security (§11), webhook/vendor (§12), deposit/withdrawal (§13), quote/LP (§14), ledger/concurrency (§15), settlement/recon/safeguarding (§16), AML/STR/TR (§17), privacy (§18), audit (§19), backup/DR/ransomware (§20), CI/CD (§21), performance (§22), UAT (§23), defect management (§24), automation coverage targets (§25), and a 29-item go-live gate (§26). It picks up the doc-09 additions well (field-level encryption, impersonation, ransomware, transaction limits/velocity, SBOM).

**Version chain is clean:** `08_v1.2` and `09_v1.2` both exist, so the base-document citations resolve — the recurring version-drift defect is not present here.

This review focuses on genuine coverage gaps.

---

## 1. Critical Gaps

### C1. No bidirectional traceability coverage audit — the rule mapping is one-dimensional (Areas 11, 12) — HIGHEST PRIORITY

§6 promises a full chain (requirement → rule → workflow → data flow → architecture component → security control → test) and §6.1 defines the matrix columns — but the only mapping actually delivered is §28, which maps **test *areas* → rules**. There is no requirement that **every** SRS requirement, **every** rule, **every** workflow (WF-xx), **every** data flow (DF-xx), **every** architecture component, and **every** security control has ≥1 test (**forward coverage**), nor that every test traces back (**no orphan tests**). For a regulated go-live, "every control is provably tested" is *the* assurance artifact — the strategy defines the matrix skeleton but never mandates the completeness/orphan audit or names it as a go-live gate. §28 also only covers doc-06 rules, not WF / DF / security-control coverage. This is the backbone of a testing strategy and it is missing.

### C2. Offboarding/account-closure and complaints handling are untested (Areas 3, 5, 13)

Two in-scope regulated surfaces have **no test cases**:

- **Account offboarding / closure (OFF-RULE-001):** §28 maps it, and freeze/unfreeze is tested (AML-TC-010–012), but there are no tests for the exit path — asset return, final reconciliation, custody exit, ledger zeroing, and data retention on closure. Offboarding is where client-money and custody mistakes are most costly.
- **Complaints lifecycle (CMP-RULE-001):** §23.1 lists "Complaints/DSAR" as a UAT area and §30 references it, but §18 tests only DSAR/privacy/retention — the complaint workflow (submission, SLA/timers, maker-checker closure, SoD owner-cannot-close-own, escalation) has no test cases. DSAR is covered; complaints is not.

### C3. No aggregate zero-inventory assurance test, and no money-event outbox delivery test (Areas 6, 7, 12)

Two integrity proofs for the core agency/exposure model are missing:

- **Aggregate AIX position = zero:** TRD-TC-012 blocks a *residual position per trade*, but "AIX inventory limit = zero" needs a **standing/end-of-day reconciliation test** proving AIX holds no net position across *all* trades. Per-trade blocking does not prove the aggregate invariant.
- **Money-event outbox:** doc 08 §10.4 defines an outbox for trade booking, deposit credit, withdrawal release, and LP settlement, but §19 only tests the *audit* outbox. The money-event outbox needs delivery / duplicate-publish / retry / dead-letter tests — otherwise a committed financial event that never publishes (or double-publishes) goes undetected.

### C4. No third-party / unverified deposit-source test (Areas 3, 5)

Withdrawals are heavily tested for own-name vs third-party (WDR-TC-002), but **deposits** are tested only for confirmation and matching (DEP-TC-001–008). There is no test that a deposit arriving from a **non-client-owned or unverified source account** is blocked, quarantined, or investigated. This is the deposit-side mirror of the own-name withdrawal rule and a core AML/PSO source-of-funds control; leaving it untested allows third-party funding to enter undetected.

### C5. No data-migration / ledger-migration integrity testing (Areas 7, 9)

§21 CICD-TC-009 tests that a DB migration is *backward-compatible*, but nothing tests **data-migration correctness** — that a migration touching ledger/balance/hold data preserves financial integrity (trial balance before == after, no balance drift, no orphaned holds). For a money platform, a migration that silently corrupts balances is a Critical event; the strategy tests deployment mechanics but not financial-data integrity across migrations.

---

## 2. Recommended Corrections

1. **Add a Traceability Coverage Audit (C1):** require a populated matrix and a **completeness + orphan audit** — every requirement/rule/workflow/data-flow/architecture-component/security-control maps to ≥1 test, and every test maps back. Make "100% Critical-control coverage, zero orphan tests" a go-live gate (§26). Extend §28 beyond rules to WF/DF/security-control coverage.

2. **Add Offboarding and Complaints test sections (C2):** offboarding/closure tests (asset return, final reconciliation, custody exit, ledger zeroing, retention-on-exit, OFF-RULE-001) and complaint-lifecycle tests (submission, SLA, maker-checker closure, SoD owner-cannot-close-own, escalation, CMP-RULE-001).

3. **Add aggregate-position and money-outbox tests (C3):** an aggregate/end-of-day AIX-position = zero reconciliation test, plus money-event outbox delivery/duplicate/retry/dead-letter tests (parallel to the audit-outbox tests).

4. **Add deposit-source verification tests (C4):** deposit from unverified/third-party source blocked or quarantined; source-of-funds mismatch handling; wrong-network/wrong-asset deposit handling.

5. **Add data-migration integrity tests (C5):** trial-balance-preserved-across-migration, no balance drift, no orphaned holds, reversibility/rollback of a financial migration.

6. **Add rotation/expiry tests:** doc 09 requires certificate rotation/expiry fail-safe (§11.1) and secret/HMAC rotation (§11.5) — add certificate-expiry-fail-safe, secret-rotation, and webhook-HMAC-rotation tests (none currently exist).

7. **Close AML coverage edges:** tipping-off leakage via **client notifications/statements** (not just direct STR read — AML-TC-004 covers read only); **related-party/director/UBO** sanctions screening (not just the client); and a PEP-handling test. Add **CMP-RULE-001** and **CFG-RULE-001/002/003** to the §28 mapping (feature-flag rules are exercised by LIC-TC-011/012 and CICD-TC-011/012 but unmapped).

8. **Add functional notification tests:** OTP delivery, payload PII-minimisation, and no-sensitive-data-in-notification — §22.13 only load-tests notification throughput.

9. **Add vendor-adapter contract tests and API backward-compatibility tests** (consumer-driven contracts; versioning) — §4 lists integration tests but no contract-level guard against a vendor/API shape change breaking money flows.

10. **Add a permission-revocation propagation test:** a revoked/role-changed user's **active session** loses access immediately (AUTH-TC-008 covers password reset only).

---

## 3. Consistency Note

- **Version chain is clean:** `08_v1.2` and `09_v1.2` both exist, so all base-document citations resolve — the recurring version-drift defect is not present here.
- **§28 mapping omissions:** CFG-RULE (feature flags) and CMP-RULE-001 (complaints) are absent from the testing-to-rule map though both are exercised/needed — fold into correction 7.
- Otherwise the exchange-lock (§7, TRD-TC-013/014), client-money (§16.3), STR tipping-off (§17), audit-atomicity (§19), and ransomware/DR (§20) coverage is tight and consistent with docs 06–09.

---

## 4. Additional Testing Requirements / Parameters to Add

```txt
# --- New test sections ---
Traceability Coverage Audit (forward coverage + orphan-test check across all upstream layers)
Offboarding / Account-Closure Tests (asset return, final recon, custody exit, retention)
Complaints Lifecycle Tests (submission, SLA, maker-checker closure, SoD, escalation)
Aggregate AIX-Position / Zero-Inventory Assurance Test
Money-Event Outbox Delivery Tests (delivery, duplicate, retry, dead-letter)
Deposit-Source Verification Tests (third-party/unverified source blocked)
Data-Migration Integrity Tests (trial balance preserved, no drift, no orphaned holds)
Certificate/Secret/HMAC Rotation & Expiry Tests

# --- Parameters ---
traceability_coverage_audit = required
every_upstream_item_has_test = required_for_requirement_rule_workflow_dataflow_control
orphan_test_check = required
offboarding_test_coverage = required
complaints_test_coverage = required
aggregate_aix_position_zero_test = required
money_event_outbox_test = required
deposit_source_verification_test = required
data_migration_integrity_test = required
threat_model_to_test_mapping = required
cert_secret_hmac_rotation_test = required
notification_functional_test = required
permission_revocation_propagation_test = required
```

---

## 5. Top Priorities Before the Master Deployment Strategy (doc 11)

1. **C1** — Traceability coverage audit. The assurance backbone; without it, "everything is tested" is unproven.
2. **C2** — Offboarding + complaints. Two untested regulated modules.
3. **C3** — Aggregate zero-inventory + money-outbox. Integrity proofs for the agency/exposure model.

C4 (deposit-source verification) and C5 (data-migration integrity) should ride along as scoped additions.

---

## 6. Consistency Note (Design Alignment)

The gaps are **coverage holes and a missing assurance artifact** (traceability audit, two untested modules, two integrity proofs, a deposit-side AML control, and migration integrity), not contradictions of the regulated design. The core money-control, exchange-lock, and security test coverage is otherwise tight and well-aligned with the upstream chain, and the go-live gate (§26) and defect model (§24) are appropriately strict for a regulated platform.
