# ACC-01 Account Structure
## 14 Go-Live Checklist (v0.4)

A go-live checklist is a **safe-operation and dependency gate**, not a capability gate and **not an environment-availability control**. ACC-01 is not itself a regulated activity. **Environment availability of ACC-01 capability belongs to CFG-01** (ACC-R2-HD-06, DCR-ACC-CFG-02); this checklist records the evidence a deployment review needs, and ACC-01 enforces only the environment-agnostic `DEP-*` prerequisites of file 01 §4.5 in every environment — each satisfied only by evidence ACC-01 verifies from the owning service, or by an authoritative governance record, **never by a configuration value** (ACC-R3-HD-03).

## 1. Build-complete gate

- [ ] This pack **re-reviewed in a separate context** and human-approved; the still-pending decisions of file 17 §4.2 (HD-4, HD-6…HD-9) plus the defaults of OQ-01…OQ-06, OQ-08, OQ-09, decided or explicitly deferred with owner (OQ-13 is resolved by ACC-R3-HD-02; the initiation catalogue rows are fixed before phase 1).
- [ ] Every `ACC-REQ-*` traced to a passing test (file 10) with repository evidence (commit + reproduced result) — never a model's own report.
- [ ] Migration up/down/re-up regression committed; grants introspection green; full-repo canonical suite green under the non-superuser role.
- [ ] `iam2.permission` catalogue rows registered; **zero** `role_permission` rows and **no role** defined by ACC-01 (ACC-HD-2); **no** `acc1.*` row sets `requires_step_up`; **`acc1.*.close_initiate` rows are non-approval (`requires_approval = false`)** (T-241).
- [ ] Known-gap tests (T-048, T-060, T-066, T-127/128, T-181) present and labelled (`KNOWN_GAP_IAM2_FIND_002`, `KNOWN_GAP_IAM2_ACTOR_BINDING`).
- [ ] No route path trips `assertNoExchangeRuntime`; no unseal/reopen route (T-178).
- [ ] Source guards green: no environment-name conditional (T-190); production composition root imports no test double (T-188) and binds the hard-unsatisfied governance gates (T-224); no configuration key read as dependency evidence (T-223); no general CLT-01/IAM-02 token variable name (T-146, T-187); ACC-01 mints/signs no identity assertion (T-233); abort path makes no LED-01 call (T-236).
- [ ] Structural invariant and seal-pin tests green: T-199…T-222 (family closure, invariant after every step, pinned readiness).
- [ ] Independent review (not the implementing session) recorded; human acceptance recorded.

## 2. Dependency prerequisites — each must be **evidenced** before its operations are relied on (any environment)

These are the environment-agnostic dependency states of file 01 §4.5. They replace v0.2's environment-keyed gates G1–G6. **A configuration string or self-declared contract version never satisfies any of them (ACC-R3-HD-03).** A test double satisfies a *runtime* dependency **only** in tests (injected at a test composition root, labelled); nothing here is an environment exception.

**Two evidence mechanisms — stated for each dependency (R3-F03 item 5):**

| Dependency | Class | Authoritative source | How ACC-01 verifies it | Failure looks like | Operations that need it | Owner / DCR | Status at baseline |
|---|---|---|---|---|---|---|---|
| **DEP-IAM-ACTOR-BINDING** | **Runtime — behavioural, per call** | IAM-02, verifying the actor against IAM-01 itself | Attested record from the actor-binding seam: `actor_assertion_authority` and every bound field; ACC-01 forwards the caller's IAM-01 session reference as received and never mints an assertion | Seam absent / record incomplete or mismatched | Every governed apply; closure initiation | IAM-02 — DCR-ACC-IAM-06 | **Open** — current IAM-02 does not provide it |
| **DEP-IAM-ENTITLEMENT** | **Runtime — behavioural, per call** | IAM-02 policy/grant evaluation | Explicit `entitlement_evidence` (maker / checker / initiator: evaluated, actor, permission code, decision, grant reference); `approval_required` alone never counts | Evidence absent, false or for another actor/code | Every governed apply; closure initiation | IAM-02 / Role Matrix — DCR-ACC-IAM-03/-04/-07, -02b/-02c, DCR-ACC-GOV-02 | **Open (HIGH finding)** |
| **DEP-IAM-SCOPED-CREDENTIAL** | **Runtime — behavioural, per call** | IAM-02 credential metadata | Each response states the presented credential's scope; only the narrow set is accepted | No scope statement / broad scope | Every governed apply; submit; collection | IAM-02 — DCR-ACC-IAM-05 | **Open** |
| **DEP-CLT-READ-SCOPE** | **Runtime — behavioural, per read** | CLT-01 seam / credential metadata | The status response states the credential scope (exact match) | No statement / other scope ⇒ `unknown` / refused | resolve, batch, submit, every apply, R-3, client routes | CLT-01 — DCR-ACC-CLT-03 | **Open** |
| **DEP-LED-CLOSURE-CONTRACT** | **Runtime — behavioural, at operation time** | The actual LED-01 attester(s) | Descriptor fetched from the attester at operation time (barrier refusal, allow-list version, readiness, attestation, **`commit_ordered_watermark = true`**) plus per-call response validation; **not needed by abort** | Unreachable / malformed / incomplete / non-commit-ordered | Create, initiation, collection, seal | LED-01 — DCR-ACC-LED-01c/-01e | **Open** (approved RF-02 decision: no creation until closure is completable) |
| **DEP-FREEZE-GOVERNANCE** | **Governance-only — HARD-UNSATISFIED in code** | Authoritative governance record closing DCR-ACC-GOV-05 (no runtime seam) | Cannot be verified at runtime; the production composition root refuses restriction apply/lift/cancel unconditionally; lifted only by an approved, independently reviewed ACC-01 code change citing the record | Always refused (`GOVERNANCE_HARD_UNSATISFIED`) | apply/lift/cancel restriction | Masters / CLT-01 / compliance — DCR-ACC-GOV-05 | **Open** — hard-unsatisfied |
| **DEP-PUBLIC-PERIMETER** | **Governance-only — HARD-UNSATISFIED in code** | Authoritative governance record closing `FND-FIND-001` and DCR-ACC-FND-01 (no runtime seam) | As above; `/acc1/client/*` not served | Always refused | `/acc1/client/*` | FND-01 / IMP-02 — DCR-ACC-FND-01, DCR-ACC-IAM-01/-03 | **Open (HIGH finding)** — hard-unsatisfied |

*What is verified behaviourally and what rests on deployment review (R3-F03 item 5):* the five **runtime** dependencies are verified from the owning service on every operation; **nothing** about them rests on ACC-01's configuration. The two **governance-only** dependencies are not verified at all — they are hard-unsatisfied, and the *removal* of a hard gate is itself a governed, reviewed code change. ACC-01 does not detect a general peer token by value at boot; least privilege is evidenced per call by the peers' scope statements (and by deployment review of what credentials were provisioned).

Other integration prerequisites for *use of dependent capabilities* (not ACC-01's own): CLT-01 closure guard consumes `open-accounts` (DCR-ACC-CLT-01, before any client closure in an environment holding accounts); LED-01 consumes DEC-011 **and this pack** (DCR-ACC-LED-01a/b, before LED-01 schema freeze); CFG-01 consumes `resolve` for condition 9 (DCR-ACC-CFG-01) **and decides environment availability of ACC-01 operations (DCR-ACC-CFG-02)**; other consumers apply the evaluation order and drain allow-list (DCR-ACC-CONS-01); non-drain status→activity policy (DCR-ACC-GOV-04) — until it exists consumers **deny**; per-consumer capability secrets provisioned, unique, documented in `.env.example`. **(R3)** The CDA-1 discriminator (`closure_initiation_id`) is consumed by LED-01 and the withdrawal module (DCR-ACC-LED-01e).

## 3. Client-money gate (regulatory — not a build gate)

- [ ] **`A2-Q1` answered:** do institutional subaccounts attract distinct KYC, reporting or safeguarding treatment? (Doc 00 §2C, §23)
- [ ] **`A2-Q2` answered:** does subaccount segregation affect client-money safeguarding obligations?
- [ ] Until both are answered, **no subaccount may carry client money** in PRODUCTION. Building/testing/using subaccounts in DEVELOPMENT/TEST/UAT/DEMO with synthetic value is unaffected (DEC-013). ACC-01 enforces nothing here itself.

## 4. Configuration required before **any real use** (fail closed if absent)

- [ ] `ACC1_MAX_SUBACCOUNTS_PER_MASTER` — explicit positive integer set by the business; **no code default** (ACC-HD-3).
- [ ] `ACC1_MAX_MASTER_ACCOUNTS_PER_CLIENT` — initial policy 1 (DEC-011) unless explicitly changed.
- [ ] `ACC1_ATTESTATION_MAX_AGE_SECONDS` (secondary freshness guard for readiness **and** attestation), `ACC1_CHANGE_REQUEST_TTL` — explicit; **no default**.
- [ ] Dedicated credentials: CLT-01 status-read, IAM-02 permission-check/actor-binding; per-consumer secrets unique and mutually distinct. ACC-01 **never** provisioned CLT-01's or IAM-02's general token — **in any environment, DEVELOPMENT and TEST included**; no "temporary broad token". (Evidence that this holds is the peers' per-call scope statements; ACC-01 cannot check a general token by value.)
- [ ] **There is no configuration that declares a dependency satisfied** — no governance reference, contract version or Boolean to set. Before real use, each **runtime** dependency's owning-module change is delivered and observed satisfied by ACC-01's own per-operation verification (audit shows `provider = real`); each **governance-only** dependency is lifted only by an approved ACC-01 code change citing the closing governance record.

## 5. Operational readiness

- [ ] Monitoring: `unknown` resolve rate, CLT-01 lookup failure rate, apply-denied rate, `dependency_not_satisfied` count, `actor_binding_mismatch` count, audit-required failures, closure readiness/attestation outcomes, **aborts**, reconciliation findings.
- [ ] Runbooks: CLT-01 outage (all accounts resolve `unknown` ⇒ consumers deny — expected); stuck `requested` requests after a post-verify rollback (obtain a **fresh** approval); **closure not draining** (check the closure-drain allow-list activity with the owning module — balance return, open withdrawal/settlement, recon break — then re-collect readiness); **closure blocked at `closure_sealed`** (target stays barred: resolve the attester issue and re-collect the attestation — latest wins — or, only if it cannot resolve, raise the **governed abort** (maker-checker, evidence-conditioned, Critical; **available even when the LED-01 attester or contract is what failed**); **do not bypass**); **(R3) master-directed children waiting at `closure_sealed`** (expected: they wait for the master's atomic family completion; if the master cannot complete, abort the **master** — it returns the whole family — never a child alone; independent child closures are not affected by a master abort and complete or abort on their own evidence); restriction emergency handling **(pending decision HD-4)**.
- [ ] **Wrongly-created account (RF-02):** there is **no void or bypass**. Test data is reset outside ACC-01. Otherwise correction is governed **closure and re-creation** via the full preventive sequence, which a master completes as an atomic family. A `closing`/`closure_sealed` row still counts against limits. Do **not** relax the empty-attester rule.
- [ ] Backup/restore covers `acc1.*`; history/readiness/attestation/recovery tables are evidence.
- [ ] Retention: **no hard deletion**; platform/client-record retention policy applies once formally defined (DCR-ACC-GOV-06); ACC-01 sets none.

## 6. Production gate statement

ACC-01 introduces **no** `PRODUCTION_ACTIVATION_STATE` and **no** environment-availability state. Having ACC-01 deployed and accounts `active` in PRODUCTION activates nothing; every capability that consumes it remains separately gated by CFG-01 (Doc 00 §21 conditions 1–14), which also decides environment availability. Deployment follows the deployment/perimeter pack (IMP-02, IN_PROGRESS — internet exposure prohibited there).
