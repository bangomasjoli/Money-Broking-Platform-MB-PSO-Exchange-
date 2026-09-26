# ACC-01 Account Structure
## 14 Go-Live Checklist (v0.2)

A go-live checklist is an **environment-availability and safe-operation gate**, not a capability gate. ACC-01 is not itself a regulated activity; the gates below concern safe operation and are the operational form of the **real-use gates G1–G6** (file 01 §4.5).

## 1. Build-complete gate (DEVELOPMENT / TEST)

- [ ] This pack **re-reviewed in a separate context** and human-approved; remaining open decisions of file 17 §3 decided or explicitly deferred with owner.
- [ ] Every `ACC-REQ-*` traced to a passing test (file 10) with repository evidence (commit + reproduced result) — never a model's own report.
- [ ] Migration up/down/re-up regression committed; grants introspection green; full-repo canonical suite green under the non-superuser role.
- [ ] `iam2.permission` catalogue rows registered; **zero** `role_permission` rows and **no role** defined by ACC-01 (ACC-HD-2).
- [ ] Known-gap tests (T-060, T-127/128) present and labelled `KNOWN_GAP_IAM2_FIND_002`.
- [ ] No route path trips `assertNoExchangeRuntime`.
- [ ] Independent review (not the implementing session) recorded; human acceptance recorded.

## 2. Real-use gates (UAT, DEMO, PRODUCTION) — each must be **evidenced closed** before its operations are used

| Gate | Operations | Prerequisites | Status at baseline |
|---|---|---|---|
| **G1** governed apply | create / close / restrict / lift apply | `IAM2-FIND-002` fixed **including** the approval-gated short-circuit dimension (DCR-ACC-IAM-03/-04); maker/checker authority governed in Role Matrix + IAM-02 (DCR-ACC-GOV-02); approval policy rows seeded (DCR-ACC-IAM-02b, `IAM2-FIND-003`); scoped IAM-02 credentials (DCR-ACC-IAM-05) | **Open (HIGH finding)** |
| **G2** account creation | create master / subaccount | G1 + LED-01 closure-readiness attester contract (DCR-ACC-LED-01c) | **Open** — approved RF-02 decision: creation unavailable beyond DEV/TEST until then |
| **G3** resolve | resolve, batch, open-accounts | dedicated read-scoped CLT-01 status credential (DCR-ACC-CLT-03) | **Open** |
| **G4** restrictions | apply / lift | G1 + freeze ownership governed (DCR-ACC-GOV-05) | **Open** |
| **G5** closure | close request, seal, complete | G1 + LED-01 barrier + post-barrier attestation contract (DCR-ACC-LED-01c) | **Open** |
| **G6** client routes | `/acc1/client/*` | `FND-FIND-001` resolved (internet exposure prohibited until then), DCR-ACC-FND-01, DCR-ACC-IAM-01/-03 | **Open (HIGH finding)** |

Other integration prerequisites for *use of dependent capabilities* (not ACC-01's own gates): CLT-01 closure guard consumes `open-accounts` (DCR-ACC-CLT-01, before any client closure in an environment holding accounts); LED-01 consumes DEC-011 **and this pack** (DCR-ACC-LED-01a/b, before LED-01 schema freeze) and denies per the consumer rule; CFG-01 consumes `resolve` for condition 9 (DCR-ACC-CFG-01); authoritative status→activity policy (DCR-ACC-GOV-04) — until it exists consumers **deny**; per-consumer capability secrets provisioned, unique, documented in `.env.example`.

## 3. Client-money gate (regulatory — not a build gate)

- [ ] **`A2-Q1` answered:** do institutional subaccounts attract distinct KYC, reporting or safeguarding treatment? (Doc 00 §2C, §23)
- [ ] **`A2-Q2` answered:** does subaccount segregation affect client-money safeguarding obligations?
- [ ] Until both are answered, **no subaccount may carry client money** in PRODUCTION. Building/testing/using subaccounts in DEVELOPMENT/TEST/UAT/DEMO with synthetic value is unaffected (DEC-013). ACC-01 enforces nothing here itself.

## 4. Configuration required before **any real use** (fail closed if absent)

- [ ] `ACC1_MAX_SUBACCOUNTS_PER_MASTER` — explicit positive integer set by the business; **no code default** (ACC-HD-3).
- [ ] `ACC1_MAX_MASTER_ACCOUNTS_PER_CLIENT` — initial policy 1 (DEC-011) unless explicitly changed.
- [ ] `ACC1_ATTESTATION_MAX_AGE_SECONDS`, `ACC1_CHANGE_REQUEST_TTL` — explicit; **no default**.
- [ ] Dedicated credentials: CLT-01 status-read, IAM-02 permission-check/verify; per-consumer secrets unique. ACC-01 **never** provisioned CLT-01's or IAM-02's general internal token.

## 5. Operational readiness

- [ ] Monitoring: `unknown` resolve rate, CLT-01 lookup failure rate, apply-denied rate, `real_use_gate_denied` count, audit-required failures, closure attestation outcomes, reconciliation findings.
- [ ] Runbooks: CLT-01 outage (all accounts resolve `unknown` ⇒ consumers deny — expected); stuck `requested` requests after a post-verify rollback (obtain a **fresh** approval); closure blocked at `closure_sealed` (stays barred — resolve the attester issue, do not bypass); restriction emergency handling **(pending decision HD-4)**.
- [ ] **Wrongly-created account (RF-02):** there is **no void or bypass**. In DEV/TEST, reset the disposable environment outside ACC-01. Beyond DEV/TEST, creation is gated until closure is completable (G2); thereafter correction is governed **closure and re-creation** via the full preventive sequence. A `closing`/`closure_sealed` row still counts against limits. Do **not** relax the empty-attester rule.
- [ ] Backup/restore covers `acc1.*`; history/attestation tables are evidence.
- [ ] Retention: **no hard deletion**; platform/client-record retention policy applies once formally defined (DCR-ACC-GOV-06); ACC-01 sets none.

## 6. Production gate statement

ACC-01 introduces **no** `PRODUCTION_ACTIVATION_STATE`. Having ACC-01 deployed and accounts `active` in PRODUCTION activates nothing; every capability that consumes it remains separately gated by CFG-01 (Doc 00 §21 conditions 1–14). Deployment follows the deployment/perimeter pack (IMP-02, IN_PROGRESS — internet exposure prohibited there).
