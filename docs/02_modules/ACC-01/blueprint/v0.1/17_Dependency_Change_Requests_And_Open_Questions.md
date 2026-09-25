# ACC-01 Account Structure
## 17 Dependency Change Requests, Open Questions and Proposed Human Decisions

ACC-01's ownership is `docs/02_modules/ACC-01/**` and `docs/03_implementation/tasks/ACC-01/**` only. Everything below that needs another module, a shared foundation, a master document or a governance register **stops here as a request**. Nothing in this file has been made, agreed or scheduled by the owning module. A human promotes findings to `OPEN_FINDINGS.md` and decisions to `DECISION_LOG.md`.

## 1. Dependency-change requests (DCR)

Priority: **B** = blocks ACC-01 build; **G** = blocks go-live/use of a dependent capability; **S** = sequencing/hygiene.

| ID | Owner (must change) | Change requested | Why (source) | Pri | Timing |
|---|---|---|---|---|---|
| **DCR-ACC-LED-01** | LED-01 | (a) Consume `DEC-011` **and this pack** before freezing schema: add `subaccount_id` to `led1.ledger_account` (each other `client_id`-scoped table decided table-by-table per DEC-011 §4.10 — hold likely needs `client_id` + `subaccount_id` + account; safeguarding position may need no subaccount; journal line stays keyed on the ledger account); (b) call ACC-01 `resolve` before creating/posting to a ledger account and deny on non-`active` / `unknown`; (c) provide the **closure-readiness attestation** contract (balance, holds, open settlement/withdrawal/trade, reconciliation break); (d) provide R-5/R-6 for reconciliation | DEC-011 status ("LED-01 may not freeze…"); Module Index §7/§11; OFF-RULE-001 | **B** for LED-01 schema freeze; **G** for closure | Before LED-01 design freeze |
| **DCR-ACC-CLT-01** | CLT-01 | Before the client-profile lifecycle permits `closed`, call ACC-01 `GET /internal/acc1/clients/{id}/open-accounts` and refuse unless affirmative with zero counts; unavailable ⇒ refuse | OFF-RULE-001; ACC-REQ-029 | **G** | Before ACC-01 phase 5 use |
| **DCR-ACC-CLT-02** | CLT-01 | Clarify the *scope* of client status `restricted` (which activities), so ACC-01 need not fail closed to "all transactional scopes". Also confirm `active_limited` → accounts may be created inert (HD-9) | ACC-01 file 06 §2.1 | S (LOW) | Any time |
| **DCR-ACC-IAM-01** | IAM-02 | Extension for narrowing-only **subaccount-scoped** grants: a scope dimension beyond the currently-unused `iam2.user_role.client_id`; guard consults ACC-01 `scope-validate`; §29 item 39 tests. Exact model = Role Matrix §30 item 19 (undecided). Note the **cycle**: Module Index lists IAM-02 ext ↔ ACC-01; broken by ACC-01 phases 0–5 needing only the accepted IAM-02 baseline | DEC-011 #8; Role Matrix §5.2A | **G** (not a build blocker) | After ACC-01 phase 2 |
| **DCR-ACC-IAM-02** | IAM-02 | (a) Cross-module catalogue registration migration for the `acc1.*` codes (`iam2`-scoped, precedent 022; `licence_locked=false`; **no** `role_permission` seed); (b) seed **approval policy** rows for each `requires_approval` code (`IAM2-FIND-003`: none seeded today, weakest control applied silently); (c) step-up policy for the checker's approve | File 07; IAM2-FIND-003 | **B** for a real governed apply | ACC-01 phase 1/3 |
| **DCR-ACC-IAM-03** | IAM-02 | Resolve `IAM2-FIND-002` (approval endpoints evaluate no permission entitlement; `role_permission` has zero rows) | CURRENT_STATE §6; DEC-011 enforcement dependency | **G** (HIGH, existing finding) | Before any real-actor use |
| **DCR-ACC-CFG-01** | CFG-01 | Doc 00 §21 condition 9 input: `evaluate` accepts/derives a `subaccount_id`, consults ACC-01 `resolve`, and treats `unknown` as deny; register `ACC-01` if `caller_module` is validated. **No** `enabled`/activation semantics move into ACC-01 | Doc 00 §21 cond. 9; Module Index §7 (CFG-01 deps incl. ACC-01) | **G** | After ACC-01 phase 2 |
| **DCR-ACC-FND-01** | FND-01 / shared foundation | (a) ACC-01 consumer-module secret in the shared rate-limit engine before any public route; (b) canonical per-consumer secret handling and `.env.example` entries for the ACC-01 consumer set; (c) confirm no foundation change is needed for a new service workspace, migration role and boot guards (`assertNoExchangeRuntime`, environment validation) | FND-01 rate-limit engine; `FND-FIND-001` | **G** | Before phase 6 |
| **DCR-ACC-WLT-01** | WLT-01 | Destination scoping to a subaccount consumes `resolve` (Module Index §10). WLT-01 change is a later, separate task | Module Index WLT-01 extension | S | After ACC-01 phase 2 |
| **DCR-ACC-GOV-01** | Governance registers | Add a `DOCUMENT_REGISTER.md` row for `BP-ACC-01-v0.1` (status per review), `MODULE_STATUS.md` implementation row, `CURRENT_STATE.md` pointer, and (if the human agrees) a `DEC-015` recording the ACC-01 design decisions (identifier scheme; no cross-schema FK; immutability from creation; computed effective status; change-request mechanism). **Not** done here: those files are outside ACC-01's ownership | tasks README record-checkpoint rules | S | On human acceptance |
| **DCR-ACC-GOV-02** | Role Matrix (master doc) | Add rows for master-account/subaccount create, close, restriction apply/lift (file 07 §3) to §23 maker-checker and §7/§8 as appropriate; add `acc1.*` where a permission catalogue is listed | Role Matrix has no account-structure row; §30 item 19 | S | On human acceptance |
| **DCR-ACC-GOV-03** | Module Index (master doc) | ACC-01's stated dependencies are `CLT-01, IAM-02`; this design additionally depends on **SEC-01** (audit) and **FND-01** (foundation), and on **LED-01** for closure attestation; record the IAM-02↔ACC-01 cycle resolution | Module Index §7 | S (LOW) | On human acceptance |
| **DCR-ACC-REC-01** | REC-01 | Consume the ACC-01 reconciliation extract; own break lifecycle for R-5/R-6 | File 13 | S | REC-01 blueprint |

## 2. Open questions (OQ) — answers needed, none blocks *review* of this pack

| ID | Question | Recommendation / default in this pack |
|---|---|---|
| OQ-01 | Ownership transfer / succession / merger of a legal entity's accounts — regulated event touching safeguarding evidence (`A2-Q2`) | Not designed. Refused and audited. Needs its own governed decision and design |
| OQ-02 | Should `active_limited` clients get accounts at all? | Yes, inert (avoids a CLT-01 activation-gate circularity: CLT-01 says `active` follows downstream gates) — HD-9 |
| OQ-03 | Should creating a `payments`/`rwa` (or future securities) subaccount need a CFG-01 build/activation check? | No — structure ≠ capability; the product module gates the product. Revisit if `A2-Q1` says such subaccounts are regulated differently |
| OQ-04 | Bounded-staleness cache for `resolve`? | No cache in v0.1; measure first; any cache carries `versions`, has a hard expiry and fails closed |
| OQ-05 | Human-facing account numbers / references / virtual accounts? | Not designed; any such value would be a display alias, never authority |
| OQ-06 | What may a frozen client see (statements)? What may the client be told about a restriction (tipping-off)? Is a master error code wanted for CLT-01 `restricted`? | ACC-01 exposes scopes only; compliance decides visibility |
| OQ-07 | A governed "abort closure" (`closing → active`)? | Not in v0.1; closure is one-way |
| OQ-08 | Purposes for Exchange-domain participants (`EXP-01`), securities/RWA holders, or new products | Enumeration extended by migration under the owning module's task; `exchange` as a *path fragment* is forbidden at boot regardless |
| OQ-09 | Should `resolve` support a "purpose-restricted" guard (e.g. only `payments` subaccounts for PAY-01)? | No — that would make purpose an authorisation. Consumers may *read* purpose but must gate through CFG-01/IAM-02 |
| OQ-10 | Retention class/period for account and history records | To be defined; never deleted, so safe under any period |

## 3. Proposed human decisions (HD) — for the reviewer; recommendation first

| ID | Decision | Recommendation |
|---|---|---|
| HD-1 | Auto-create a default `general` subaccount atomically with each master account? | **Yes.** DEC-011 wants a subaccount dimension present from the first migration "even if only a single default subaccount is provisioned"; guarantees LED-01 always has a subaccount |
| HD-2 | Maker/checker role assignments for create / close / restrict / lift, and whether `payments`/`rwa` subaccount creation needs a compliance checker | As file 07 §3 (conservative: compliance checker for `payments`/`rwa` until `A2-Q1`) |
| HD-3 | Initial limits: master accounts per client = **1** (DEC-011); subaccounts per master = ? (a value must be chosen; the pack proposes it be configuration) | Choose a value with the business; do not hard-code |
| HD-4 | Is an emergency restrict-only single-actor path wanted (court order/regulatory directive)? | **Not in v0.1.** WF-26 requires maker-checker; if wanted it must be restrict-only, audited, and never able to lift or activate |
| HD-5 | Closure completion: machine-verified readiness with permission check only (proposed) vs. a second approval | Proposed: single approval at request; completion machine-verified. Stricter option is cheap if preferred |
| HD-6 | Client-initiated requests (subaccount creation) in scope for v0.1? | **No** — staff-initiated only; client surface is read-only and deferred |
| HD-7 | Confirm `A2-Q1`/`A2-Q2` gate **client-money go-live**, not build | Yes (as DEC-011 and DEC-013 clause 4) |
| HD-8 | Initial `purpose` set: `general`, `trading`, `treasury`, `payments`, `rwa` | Approve; extension by migration |
| HD-9 | Allow account creation while the client is `active_limited` (inert) | Yes |
| HD-10 | Retention class for account-structure records (OQ-10) | Define with compliance; align to client-record retention |

## 4. Findings this pack would raise (for a human to promote — none are added to `OPEN_FINDINGS.md`)

- **ACC-PROP-001 (INFO):** IAM-02 ↔ ACC-01 dependency cycle in the Module Index (resolved by phasing, DCR-ACC-IAM-01).
- **ACC-PROP-002 (INFO):** the Role Matrix has no maker-checker row for account structure (DCR-ACC-GOV-02).
- **ACC-PROP-003 (LOW):** CLT-01 `restricted` client status has no defined scope (DCR-ACC-CLT-02).
- **ACC-PROP-004 (MEDIUM):** LED-01 v1.2 keys `client_id` in 9 of 23 tables with no subaccount dimension; ACC-01 cannot be consumed until LED-01 is re-specified (DEC-011 gate; already a recorded requirement, restated).
