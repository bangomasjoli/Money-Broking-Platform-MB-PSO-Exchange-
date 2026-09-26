# ACC-01 Account Structure
## 17 Dependency Change Requests, Open Questions and Human Decisions (v0.2)

ACC-01's ownership is `docs/02_modules/ACC-01/**` and `docs/03_implementation/tasks/ACC-01/**` only. Everything below that needs another module, a shared foundation, a master document or a governance register **stops here as a request**. **None of it has been made, agreed or scheduled by the owning module; no owning module has changed.** A human promotes findings to `OPEN_FINDINGS.md` and decisions to `DECISION_LOG.md`.

## 1. Classification (RF-10)

Every DCR carries exactly one class:

| Class | Meaning |
|---|---|
| **ACC-BUILD** | Blocks building the named ACC-01 phase in DEVELOPMENT/TEST |
| **ACC-REAL-USE** | Does **not** block building in DEV/TEST; blocks **real use** (UAT/DEMO/PRODUCTION) of the named gate (file 01 §4.5) |
| **LED-DESIGN** | Blocks **LED-01's** design/schema freeze — not ACC-01's build |
| **GO-LIVE** | Blocks go-live/use of a dependent capability, not ACC-01 build or gated real use |
| **GOV** | Governance hygiene (registers, masters); blocks nothing technical |

## 2. Dependency-change requests (DCR)

| ID | Owner (must change) | Change requested | Why (source) | Class | Gate / timing |
|---|---|---|---|---|---|
| **DCR-ACC-LED-01a** | LED-01 | Consume `DEC-011` **and this pack** before freezing schema: add `subaccount_id` to `led1.ledger_account`; decide each other `client_id`-scoped table deliberately per DEC-011 §4.10 (a hold likely needs `client_id` + `subaccount_id` + account; a safeguarding position may need no subaccount; a journal line stays keyed on the ledger account) | DEC-011 status; Module Index §11 | **LED-DESIGN** | Before LED-01 schema freeze |
| **DCR-ACC-LED-01b** | LED-01 | Call ACC-01 `resolve` before creating/posting to a ledger account; apply the **consumer rule** (`effective_status ≠ active` ⇒ deny transaction-producing activity unless explicitly authorised; `unknown` ⇒ deny; missing `subaccount_id` ⇒ deny; never default) | ACC-REQ-039; RF-04 | **LED-DESIGN** | Before LED-01 schema freeze |
| **DCR-ACC-LED-01c** | LED-01 | **Closure barrier and post-barrier attestation contract:** refuse **every** posting to a `closure_sealed` target (from resolve); provide an attester returning `{target_id, seal_version_observed, status, journal_watermark, in_flight_predating_seal, evidence_ref, as_of}` **after** the seal; make its resolve-then-post atomic w.r.t. the seal evidence so an in-flight posting resolved before the seal is counted or refused; attest master-level after all children | RF-02, RF-03; OFF-RULE-001 items 1–5 | **ACC-REAL-USE** (G2, G5) | Before real creation/closure |
| **DCR-ACC-LED-01d** | LED-01 / REC-01 | Provide reconciliation R-5/R-6 using the ACC-01 extract | file 13 | **GO-LIVE** | REC-01 blueprint |
| **DCR-ACC-CLT-01** | CLT-01 | Before the client-profile lifecycle permits `closed`, call ACC-01 `open-accounts` and refuse unless affirmative with zero counts; unavailable ⇒ refuse | OFF-RULE-001; ACC-REQ-029 | **GO-LIVE** | Before any client closure in an environment holding accounts |
| **DCR-ACC-CLT-02** | CLT-01 | Define the *scope* of client status `restricted` (which activities) and confirm accounts may be created inert while `active_limited` | file 06 §2.1 | **GOV** | Any time |
| **DCR-ACC-CLT-03** | CLT-01 | **A dedicated read-scoped capability credential for the status seam.** `GET /internal/clt1/clients/:client_id/status` is today guarded by the single `clt1InternalServiceToken`, which also guards CLT-01's mutating internal routes (mandates, authorised parties, related-party edges, duplicate candidates, decisions, outcomes). **ACC-01 must NEVER receive that general credential.** Follow the `IAM_INTROSPECTION_SERVICE_TOKEN` precedent | RF-05 | **ACC-REAL-USE** (G3) | Before phase-2 use outside DEV/TEST |
| **DCR-ACC-IAM-01** | IAM-02 | Narrowing-only **subaccount-scoped** grants: a scope dimension beyond the unused `iam2.user_role.client_id`; guard consults ACC-01 `scope-validate`; §29 item 39 tests. Exact model = Role Matrix §30 item 19 (undecided). Build cycle IAM-02 ext ↔ ACC-01 broken by phasing | DEC-011 #8; Role Matrix §5.2A | **GO-LIVE** (G6) | After ACC-01 phase 2 |
| **DCR-ACC-IAM-02a** | IAM-02 | Cross-module catalogue registration migration for the `acc1.*` codes (`iam2`-scoped, precedent 022; `licence_locked=false`; **no `role_permission` seed**; no role defined) | file 07 | **ACC-BUILD** (phase 1 completeness; unit tests can stub) | ACC-01 phase 1 |
| **DCR-ACC-IAM-02b** | IAM-02 | Seed **approval policy** rows for each `requires_approval` `acc1.*` code (`IAM2-FIND-003`: none seeded, weakest control applied silently) | IAM2-FIND-003 | **ACC-REAL-USE** (G1) | Before real-actor apply |
| **DCR-ACC-IAM-02c** | IAM-02 | Step-up policy for the checker's approve action | file 07 | **ACC-REAL-USE** (G1) | Before real-actor apply |
| **DCR-ACC-IAM-03** | IAM-02 | Resolve `IAM2-FIND-002` (HIGH): entitlement-check create/approve/reject and populate `role_permission` through the governed workflow. **Platform-wide dimension to consider at the next revision of that governance row (not edited here):** the guard's step-7 `approval_required` short-circuit precedes the step-10 role lookup for **every** approval-gated permission of **every** module, and `execute-verify` checks no role | RF-01; CURRENT_STATE §6 | **ACC-REAL-USE** (G1, hard prerequisite) | Before any real-actor governed apply |
| **DCR-ACC-IAM-04** | IAM-02 | An entitlement mechanism for approval-gated actions that **cannot be bypassed by the `approval_required` short-circuit** — candidates (IAM-02 chooses): (A) paired non-approval `*.initiate` code checked at submit and apply, plus an `*.approve` code; (B) evaluate the role grant before returning `approval_required`. Any new codes are added by this DCR | RF-01 (file 07 §3.1) | **ACC-REAL-USE** (G1) | Before real-actor apply |
| **DCR-ACC-IAM-05** | IAM-02 | Scoped credentials so ACC-01 can call **only** `permission/check` and `permission/execute-verify`, **not** the approval request/approve/reject routes that the general `iam2InternalServiceToken` also reaches | RF-05 (IAM-02 analogue); review §9 | **ACC-REAL-USE** (G1) | Before real-actor apply |
| **DCR-ACC-CFG-01** | CFG-01 | Doc 00 §21 condition 9 input: `evaluate` consumes ACC-01 `resolve`, applies the consumer rule, treats `unknown` as deny; register `ACC-01` if `caller_module` is validated. **No** activation semantics move into ACC-01 | Doc 00 §21 cond. 9 | **GO-LIVE** | After ACC-01 phase 2 |
| **DCR-ACC-FND-01** | FND-01 / foundation | ACC-01 consumer secret in the shared rate-limit engine before any public route; per-consumer secret handling and `.env.example` entries; confirm no foundation change is needed for a new service workspace, migration role and boot guards | FND rate-limit; `FND-FIND-001` | **GO-LIVE** (G6) | Before phase 6 |
| **DCR-ACC-WLT-01** | WLT-01 | Destination scoping to a subaccount consumes `resolve` under the consumer rule (later, separate task) | Module Index WLT-01 ext. | **GOV** (sequencing) | After ACC-01 phase 2 |
| **DCR-ACC-GOV-01** | Registers | `DOCUMENT_REGISTER.md` rows (v0.1 REVIEWED/REMEDIATE, v0.2 REMEDIATED/AWAITING RE-REVIEW), `MODULE_STATUS.md` row, `CURRENT_STATE.md` pointer, and (if agreed) a `DEC-015` recording the ACC-01 design decisions (identifier scheme; no cross-schema FK; ownership immutable from creation; computed effective status and consumer rule; change-request mirror of CLT-01/CFG-01; closing barrier; real-use gates) and the human decisions of §4 | tasks README record-checkpoint rules | **GOV** | On human acceptance |
| **DCR-ACC-GOV-02** | Role Matrix + IAM-02 | **Authoritative maker/checker authority** for master-account and subaccount **create**, and for **close**, **restrict**, **lift** as applied to accounts (existing rows §7 "Close client account" and §23 "Account freeze/unfreeze" are sources, not ACC-01 assignments). ACC-01 defines none (ACC-HD-2) | ACC-HD-2; Role Matrix §30 item 19 | **ACC-REAL-USE** (G1) | Before real-actor apply |
| **DCR-ACC-GOV-03** | Module Index | ACC-01's stated dependencies are `CLT-01, IAM-02`; this design also depends on **SEC-01**, **FND-01** and **LED-01** (closure attestation); record the IAM-02↔ACC-01 cycle resolution and the runtime dependency graph (file 01 §13) | Module Index §7 | **GOV** | On human acceptance |
| **DCR-ACC-GOV-04** | Masters / System Rules (CFG-01, consumers) | The **authoritative status→activity policy**: which specific activities, if any, are authorised for an account in `restricted`, `closing`, `suspended` etc. (e.g. what a `closing` account may still drain). Until it exists the consumer rule denies | RF-04 | **GO-LIVE** | Before any non-`active` activity is to be permitted |
| **DCR-ACC-GOV-05** | Masters / CLT-01 / compliance workflow | **Freeze ownership:** the owner of **whole-client freeze**; the owner of **`login_block`**; the relationship between a CLT-01 client freeze and an ACC-01 account restriction; confirm that an ACC-01 restriction **never substitutes** for a client-level freeze | RF-09; WF-26; FRZ-RULE-002 | **ACC-REAL-USE** (G4) | Before real phase-4 use |
| **DCR-ACC-GOV-06** | Platform / client-record retention | Formally define the platform/client-record retention policy ACC-01 will follow (ACC-01 invents none) | Approved retention decision; CLT-01 `retention_period_by_class = to_be_defined` | **GO-LIVE** | Before go-live |
| **DCR-ACC-REC-01** | REC-01 | Consume the ACC-01 reconciliation extract; own break lifecycle for R-5/R-6 | file 13 | **GO-LIVE** | REC-01 blueprint |

**Summary of classes:** ACC-BUILD — IAM-02a only. LED-DESIGN — LED-01a, LED-01b. ACC-REAL-USE — LED-01c, CLT-03, IAM-02b/c, IAM-03, IAM-04, IAM-05, GOV-02, GOV-05. GO-LIVE — CLT-01, LED-01d, IAM-01, CFG-01, FND-01, GOV-04, GOV-06, REC-01. GOV — CLT-02, WLT-01, GOV-01, GOV-03.

## 3. Open questions (OQ)

| ID | Question | Status / default in this pack |
|---|---|---|
| OQ-01 | Ownership transfer / succession / merger of a legal entity's accounts (regulated event touching safeguarding evidence, `A2-Q2`) | Not designed; refused and audited |
| OQ-02 | Should `active_limited` clients get inert accounts? | Yes, report-only (HD-9 recommendation; not separately approved) |
| OQ-03 | CFG-01 check when creating `payments`/`rwa` subaccounts? | No — structure ≠ capability |
| OQ-04 | Bounded-staleness cache for `resolve`? | No cache in v0.2 |
| OQ-05 | Human-facing account numbers/references? | Not designed |
| OQ-06 | What may a frozen client see? What may a client be told about a restriction? Master error code for CLT-01 `restricted`? | Compliance decides; ACC-01 exposes status only |
| OQ-07 | A governed "abort closure" / unseal? | No unseal in v0.2; `closure_sealed` is one-way |
| OQ-08 | Purposes for Exchange-domain participants, securities/RWA holders, new products | By migration under the owning module's task |
| OQ-09 | Purpose-restricted resolve guards? | No — would make purpose an authorisation |
| OQ-10 | Retention class/period | **Resolved in principle:** no hard deletion; platform/client-record policy once defined (DCR-ACC-GOV-06) |
| OQ-11 | Should the real-use gates (G1–G6) be represented in CFG-01 rather than as an ACC-01 code-level interlock (CFG-01 is the sole capability-eligibility authority, Module Index rule 7)? | Open. v0.2 treats them as fail-closed safety interlocks that lift only by an approved task citing closed-finding evidence, not as capability flags |
| OQ-12 | Should a second human approval be required for closure completion? | **Not newly decided.** Reviewed model preserved (one approval covers the closure sequence; seal/complete are permission-checked, request-bound, machine-verified) unless the masters require otherwise |

## 4. Human decisions recorded

### 4.1 Approved by Aiman — binding on v0.2

| ID | Decision | Applied |
|---|---|---|
| **ACC-HD-1** | Default `general` subaccount created atomically with a master account; **structural only** — never a catch-all scope, fallback trading/payment account, default product-authorisation target, or evidence a capability is available; consumers still use explicit account, permission, product and eligibility controls | 01 §8; 02 §3, §8; 04; 10 T-122…125 |
| **ACC-HD-2** | ACC-01 invents **no** role assignments; the Role Matrix + IAM-02 define maker/checker authority; no real-actor governed apply until `IAM2-FIND-002` is fixed and the DCRs are governed; DEV/TEST implementation permitted; Role Matrix/IAM-02 change recorded as DCRs | 01 §4.5; 07; DCR-ACC-GOV-02, -IAM-03/-04/-05 |
| **ACC-HD-3** | Subaccount maximum is **configuration**, no arbitrary architectural number; missing/invalid ⇒ fail closed; concrete value explicitly configured before real use; master initial policy 1 | 01 §6; 09; 10 T-131 |
| **RF-02** | No bypass/void; account creation built/tested in DEV/TEST only and unavailable for real governed use until the LED-01 readiness attester exists; ownership immutability preserved; empty-attester fail-closed unchanged | 01 §4.5, §9; 02 §7; G2 |
| **Closure safety** | Preventive: closing barrier → block all new transactional/posting activity → **fresh post-barrier** LED-01 attestation → close only while barrier effective; not a 15-minute stale attestation | 01 §7; 02 §7; 06 |
| **Retention** | No hard deletion; use platform/client-record retention policy once formally defined; invent none; retain until then | 15 §3; 16; DCR-ACC-GOV-06 |

**Not newly decided:** second human approval for closure (OQ-12).

### 4.2 Adjudicated in the review (`04-review.md` §6) but **not separately approved** by a human in this turn — carried as recommendations

| ID | Recommendation | Review adjudication |
|---|---|---|
| HD-4 | No emergency single-actor restrict-only path in this version | SUPPORTED |
| HD-5 | Single approval at closure request; machine-verified completion | SUPPORTED WITH CORRECTION → corrected by the preventive sequence; second approval not newly decided |
| HD-6 | Staff-initiated only; client surface read-only, deferred | SUPPORTED |
| HD-7 | `A2-Q1`/`A2-Q2` gate client-money go-live, not the build | SUPPORTED |
| HD-8 | Purposes `general`, `trading`, `treasury`, `payments`, `rwa`; extension by migration | SUPPORTED |
| HD-9 | Inert accounts for `active_limited` clients | SUPPORTED WITH CORRECTION → corrected (report-only, consumer rule); applied in v0.2 as instructed by the RF-04 remediation, but the HD itself is not separately approved |

Superseded by 4.1: HD-1 (→ ACC-HD-1), HD-2 (→ ACC-HD-2; local role table **removed**), HD-3 (→ ACC-HD-3), HD-10 (→ retention decision).

## 5. Findings this pack would raise (for a human to promote — none added to `OPEN_FINDINGS.md`)

- **RF-01 platform dimension:** consider at the next revision of `IAM2-FIND-002` (see DCR-ACC-IAM-03).
- **ACC-PROP-001 (INFO):** IAM-02 ↔ ACC-01 dependency cycle in the Module Index (resolved by phasing).
- **ACC-PROP-002 (INFO):** Role Matrix has no maker-checker row for account structure (DCR-ACC-GOV-02).
- **ACC-PROP-003 (LOW):** CLT-01 `restricted` has no defined scope (DCR-ACC-CLT-02) — ACC-01 fails closed to report-only.
- **ACC-PROP-004:** not a new finding — already a binding DEC-011 requirement (LED-01 `client_id`).
- **New in v0.2 (INFO, for triage):** CLT-01's single internal token also reaches its mutating routes (DCR-ACC-CLT-03); IAM-02's general internal token reaches approval creation (DCR-ACC-IAM-05).
