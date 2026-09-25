# ACC-01 Account Structure
## 14 Go-Live Checklist

A go-live checklist is an **environment-availability and production gate**, not a capability gate. ACC-01 is not itself a regulated activity; the gates below are about safe operation, not about a licence.

## 1. Build-complete gate (all environments)

- [ ] This pack reviewed and **human-approved**; HD-1…HD-10 (file 17) decided or explicitly deferred with owner.
- [ ] Every `ACC-REQ-*` traced to a passing test (file 10) with repository evidence (commit + reproduced result) — never a model's own report.
- [ ] Migration up/down/re-up regression committed; grants introspection test green; full-repo canonical suite green under the non-superuser role.
- [ ] `iam2.permission` catalogue rows registered; **zero** `role_permission` rows seeded by ACC-01.
- [ ] No route path trips `assertNoExchangeRuntime`.
- [ ] Independent review (not the implementing session) recorded in `04-review.md`; human acceptance recorded.

## 2. Integration gates (each must be true before the dependent capability is used)

| Gate | Needed before | Status at baseline |
|---|---|---|
| IAM-02 approval policy rows exist for every `requires_approval` `acc1.*` code (IAM2-FIND-003: none seeded) | Any governed apply outside test | **Open** |
| IAM-02 `role_permission` populated / `IAM2-FIND-002` resolved | Any real-actor use (approval and read routes) | **Open (HIGH)** |
| CLT-01 closure guard consumes `open-accounts` (DCR-ACC-CLT-01) | Any client closure in an environment holding accounts | Not started |
| LED-01 consumes DEC-011 **and** ACC-01 resolve; provides closure attestation (DCR-ACC-LED-01) | LED-01 schema freeze; closure completion | Not started |
| CFG-01 consumes `resolve` for condition 9 (DCR-ACC-CFG-01) | Any capability decision that depends on account status | Not started |
| IAM-02 subaccount-scope enforcement (DCR-ACC-IAM-01) | Any subaccount-scoped grant | Not started |
| FND-01 rate-limit consumer secret for ACC-01; perimeter rules (`FND-FIND-001`) | **Any client route or internet exposure** | **Open (HIGH)** — exposure prohibited |
| Per-consumer capability secrets provisioned and unique; `.env.example` documents them | Any deployment | Not started |

## 3. Client-money gate (regulatory — not a build gate)

- [ ] **`A2-Q1` answered:** do institutional subaccounts attract distinct KYC, reporting or safeguarding treatment? (Doc 00 §2C, §23)
- [ ] **`A2-Q2` answered:** does subaccount segregation affect client-money safeguarding obligations?
- [ ] Until both are answered, **no subaccount may carry client money** in PRODUCTION. Building, testing and using subaccounts in DEVELOPMENT/TEST/UAT/DEMO with synthetic value is unaffected (DEC-013). ACC-01 enforces nothing here itself — the gate is recorded so LED-01/DEP-01 do not enable client-money flows against an account model whose regulatory treatment is unresolved.

## 4. Operational readiness

- [ ] Monitoring: `unknown` resolve rate, CLT-01 lookup failure rate, apply `failed`/`applying`-age gauge, audit-required failures, reconciliation findings.
- [ ] Runbooks: stuck `applying` recovery; CLT-01 outage (all accounts resolve `unknown` ⇒ consumers deny — expected, must be understood by operations); restriction emergency handling **(pending HD-4)**; mistaken-creation correction (closure and re-creation).
- [ ] **Operator note on mistaken creation:** closure cannot complete until LED-01's attestation contract exists (file 02 §7.7). In an environment with no ledger accounts this means a mistaken account can only reach `closing`; this is acceptable and fail-closed. If it proves operationally painful, the remedy is to build the LED-01 attester earlier, **not** to relax the empty-attester rule.
- [ ] Backup/restore covers `acc1.*`; history/attestation tables treated as evidence.
- [ ] Retention class defined (OQ-10).

## 5. Production gate statement

ACC-01 introduces **no** `PRODUCTION_ACTIVATION_STATE`. Having ACC-01 deployed and accounts `active` in PRODUCTION activates nothing; every capability that consumes it remains separately gated by CFG-01 (Doc 00 §21 conditions 1–14). Deployment to PRODUCTION follows the deployment/perimeter pack (IMP-02, IN_PROGRESS — internet exposure prohibited there).
