# ACC-01 Account Structure
## 14 Go-Live Checklist (v0.3)

A go-live checklist is a **safe-operation and dependency gate**, not a capability gate and **not an environment-availability control**. ACC-01 is not itself a regulated activity. **Environment availability of ACC-01 capability belongs to CFG-01** (ACC-R2-HD-06, DCR-ACC-CFG-02); this checklist records the evidence a deployment review needs, and ACC-01 enforces only the environment-agnostic `DEP-*` prerequisites of file 01 §4.5 in every environment.

## 1. Build-complete gate

- [ ] This pack **re-reviewed in a separate context** and human-approved; the still-pending decisions of file 17 §4.2 (HD-4, HD-6…HD-9) and open question OQ-13, plus the defaults of OQ-01…OQ-06, OQ-08, OQ-09, decided or explicitly deferred with owner.
- [ ] Every `ACC-REQ-*` traced to a passing test (file 10) with repository evidence (commit + reproduced result) — never a model's own report.
- [ ] Migration up/down/re-up regression committed; grants introspection green; full-repo canonical suite green under the non-superuser role.
- [ ] `iam2.permission` catalogue rows registered; **zero** `role_permission` rows and **no role** defined by ACC-01 (ACC-HD-2); **no** `acc1.*` row sets `requires_step_up`.
- [ ] Known-gap tests (T-048, T-060, T-066, T-127/128, T-181) present and labelled (`KNOWN_GAP_IAM2_FIND_002`, `KNOWN_GAP_IAM2_ACTOR_BINDING`).
- [ ] No route path trips `assertNoExchangeRuntime`; no unseal/reopen route (T-178).
- [ ] Source guards green: no environment-name conditional (T-190); production composition root imports no test double (T-188); no general CLT-01/IAM-02 token variable (T-146, T-187).
- [ ] Independent review (not the implementing session) recorded; human acceptance recorded.

## 2. Dependency prerequisites — each must be **evidenced** before its operations are relied on (any environment)

These are the environment-agnostic dependency states of file 01 §4.5. They replace v0.2's environment-keyed gates G1–G6. A test double satisfies a dependency **only** in tests (injected at a test composition root, labelled); nothing here is an environment exception.

| Dependency | Operations that need it | Evidence to record | Owner / DCR | Status at baseline |
|---|---|---|---|---|
| **DEP-IAM-ACTOR-BINDING** | Every governed apply | IAM-02 contract version returning attested authenticated actor, maker, checker, approval id/policy, payload binding | IAM-02 — DCR-ACC-IAM-06 | **Open** — current IAM-02 does not prove it |
| **DEP-IAM-ENTITLEMENT** | Every governed apply | `IAM2-FIND-002` fixed **including** the approval-gated short-circuit (DCR-ACC-IAM-03/-04); authority governed (DCR-ACC-GOV-02); approval policy rows seeded (DCR-ACC-IAM-02b/-02c) | IAM-02 / Role Matrix | **Open (HIGH finding)** |
| **DEP-IAM-SCOPED-CREDENTIAL** | Every governed apply, submit | Dedicated IAM-02 verify-scoped credential; general mutation-capable token never provisioned (DCR-ACC-IAM-05) | IAM-02 | **Open** |
| **DEP-CLT-READ-SCOPE** | resolve, batch, submit, **every apply**, R-3, client routes | Dedicated CLT-01 status-read credential; general token never provisioned (DCR-ACC-CLT-03) | CLT-01 | **Open** |
| **DEP-LED-CLOSURE-CONTRACT** | Create, all closure operations | LED-01 barrier + drain + pre-seal readiness + post-barrier attestation contract (DCR-ACC-LED-01c/-01e); ≥ 1 attester configured | LED-01 | **Open** (approved RF-02 decision: no creation until closure is completable) |
| **DEP-FREEZE-GOVERNANCE** | apply/lift/cancel restriction | Governance record for freeze ownership (DCR-ACC-GOV-05) — type G: declared reference; ACC-01 cannot verify the record's truth | Masters / CLT-01 / compliance | **Open** |
| **DEP-PUBLIC-PERIMETER** | `/acc1/client/*` | `FND-FIND-001` resolved, DCR-ACC-FND-01, DCR-ACC-IAM-01/-03 — type G | FND-01 / IMP-02 | **Open (HIGH finding)** |

Other integration prerequisites for *use of dependent capabilities* (not ACC-01's own): CLT-01 closure guard consumes `open-accounts` (DCR-ACC-CLT-01, before any client closure in an environment holding accounts); LED-01 consumes DEC-011 **and this pack** (DCR-ACC-LED-01a/b, before LED-01 schema freeze); CFG-01 consumes `resolve` for condition 9 (DCR-ACC-CFG-01) **and decides environment availability of ACC-01 operations (DCR-ACC-CFG-02)**; other consumers apply the evaluation order and drain allow-list (DCR-ACC-CONS-01); non-drain status→activity policy (DCR-ACC-GOV-04) — until it exists consumers **deny**; per-consumer capability secrets provisioned, unique, documented in `.env.example`.

## 3. Client-money gate (regulatory — not a build gate)

- [ ] **`A2-Q1` answered:** do institutional subaccounts attract distinct KYC, reporting or safeguarding treatment? (Doc 00 §2C, §23)
- [ ] **`A2-Q2` answered:** does subaccount segregation affect client-money safeguarding obligations?
- [ ] Until both are answered, **no subaccount may carry client money** in PRODUCTION. Building/testing/using subaccounts in DEVELOPMENT/TEST/UAT/DEMO with synthetic value is unaffected (DEC-013). ACC-01 enforces nothing here itself.

## 4. Configuration required before **any real use** (fail closed if absent)

- [ ] `ACC1_MAX_SUBACCOUNTS_PER_MASTER` — explicit positive integer set by the business; **no code default** (ACC-HD-3).
- [ ] `ACC1_MAX_MASTER_ACCOUNTS_PER_CLIENT` — initial policy 1 (DEC-011) unless explicitly changed.
- [ ] `ACC1_ATTESTATION_MAX_AGE_SECONDS` (secondary freshness guard for readiness **and** attestation), `ACC1_CHANGE_REQUEST_TTL` — explicit; **no default**.
- [ ] Dedicated credentials: CLT-01 status-read, IAM-02 permission-check/verify; per-consumer secrets unique. ACC-01 **never** provisioned CLT-01's or IAM-02's general token — **in any environment, DEVELOPMENT and TEST included**; no "temporary broad token".
- [ ] Each `DEP-*` evidence record present with its `provider` label; readiness output shows `real` for every dependency in any environment where real use is intended.

## 5. Operational readiness

- [ ] Monitoring: `unknown` resolve rate, CLT-01 lookup failure rate, apply-denied rate, `dependency_not_satisfied` count, `actor_binding_mismatch` count, audit-required failures, closure readiness/attestation outcomes, **aborts**, reconciliation findings.
- [ ] Runbooks: CLT-01 outage (all accounts resolve `unknown` ⇒ consumers deny — expected); stuck `requested` requests after a post-verify rollback (obtain a **fresh** approval); **closure not draining** (check the closure-drain allow-list activity with the owning module — balance return, open withdrawal/settlement, recon break — then re-collect readiness); **closure blocked at `closure_sealed`** (target stays barred: resolve the attester issue and re-collect the attestation — latest wins — or, only if it cannot resolve, raise the **governed abort** (maker-checker, evidence-conditioned, Critical); **do not bypass**); restriction emergency handling **(pending decision HD-4)**.
- [ ] **Wrongly-created account (RF-02):** there is **no void or bypass**. Test data is reset outside ACC-01. Otherwise correction is governed **closure and re-creation** via the full preventive sequence, which a master can now complete. A `closing`/`closure_sealed` row still counts against limits. Do **not** relax the empty-attester rule.
- [ ] Backup/restore covers `acc1.*`; history/readiness/attestation/recovery tables are evidence.
- [ ] Retention: **no hard deletion**; platform/client-record retention policy applies once formally defined (DCR-ACC-GOV-06); ACC-01 sets none.

## 6. Production gate statement

ACC-01 introduces **no** `PRODUCTION_ACTIVATION_STATE` and **no** environment-availability state. Having ACC-01 deployed and accounts `active` in PRODUCTION activates nothing; every capability that consumes it remains separately gated by CFG-01 (Doc 00 §21 conditions 1–14), which also decides environment availability. Deployment follows the deployment/perimeter pack (IMP-02, IN_PROGRESS — internet exposure prohibited there).
