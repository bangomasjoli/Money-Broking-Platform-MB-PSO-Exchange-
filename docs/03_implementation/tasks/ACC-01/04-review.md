# 04 Review — ACC-01: Account Structure blueprint pack v0.1

- **Task ID:** ACC-01 (planning task — blueprint pack, no implementation)
- **Reviewer:** independent architecture / compliance reviewer / claude-opus-5-5 / HIGH
- **Author:** blueprint planner / claude-sonnet-5
- **Independence disclosure:** this review ran **in the same Claude Code session** that authored the pack. The model was switched to Opus for the review, but the session context was shared. Independence is therefore at the **model level only, not the session level**. The human should weigh this, as with `MIG-005`. Every finding below was re-verified against the sources and the repository, not against the author's report.
- **Reviewed commit:** `42316fe` on `module/ACC-01`; baseline `43f2f34`
- **Decision:** **REMEDIATE**
- **Implementation authorised:** **No.** The pack is not accepted. No `06-acceptance.md` exists.

## 1. Verification gate (all passed)

| Check | Result |
|---|---|
| Branch | `module/ACC-01` |
| HEAD | `42316fe` |
| Working tree | clean |
| `main` | local `main` = `43f2f34` (unchanged); nothing merged |
| Diff `43f2f34..42316fe` | 21 files, all under `docs/02_modules/ACC-01/**` or `docs/03_implementation/tasks/ACC-01/**`; 0 outside |
| `platform/**` / migrations | untouched |

## 2. Sources reviewed

- `DEC-011`, plus decision pack §4.4–§4.10
- `DEC-013`, `DEC-014`
- `CURRENT_STATE.md`
- Doc 00 v1.5 §2C, §10.2A, §21, §23
- Module Index v1.4 §7, §11, §18, §19
- Role Matrix v1.3 §3.7, §3.8, §5.1, §5.2A, §7, §23
- Workflow Map v1.3 WF-26, WF-27, §33A.3
- System Rules v1.3 §18, §26
- `OPEN_FINDINGS.md` rows `IAM2-FIND-002` and `IAM2-FIND-003`
- CLT-01 blueprint v1.2 §5.19

Repository seams inspected read-only, to verify what the pack asserts:

- `services/iam2/src/lib/guard.ts`: steps 1–10.
- `services/iam2/src/lib/decision-token.ts`.
- `services/iam2/src/routes/approvals.ts`: request, approve, token issuance.
- `services/iam2/src/routes/internal.ts`: execute-verify.
- `services/clt1/src/routes/clients.ts`: the status seam.
- Every `makeClt1InternalIdentityGuard` consumer in `services/clt1/src/routes/`.
- `packages/foundation/src/idempotency.ts`: `fingerprint`.
- Migrations `006`, `020`, `022`.
- `aix-conductor/src/state.ts`, `docs/architecture.md`, `docs/phase1-planner.md`: the task-state convention.

## 3. Answers to the review questions

| # | Question | Result |
|---|---|---|
| 1 | No identity-domain duplication | **Holds in data.** ACC-01 stores no legal-entity or membership data; the `client_status_at_creation` / `client_class_at_creation` snapshot is evidence, not a copy of record. **Capability-level leak:** the design reads CLT-01 through a token that also unlocks CLT-01 identity mutations — **RF-05** |
| 2 | No ledger/balance leak | **Holds.** No amount, balance or ledger identifier; schema-guard tests T-011/T-012 are specified. LED-01 references ACC-01, never the reverse |
| 3 | Cross-client subaccounts impossible | **Holds for `subaccount`.** The composite FK `(master_account_id, client_id)` → `UNIQUE (master_account_id, client_id)`, the owner-deriving trigger and the immutable master owner make it unrepresentable. **Gap:** `account_restriction.subaccount_id` is not bound to its subaccount's owner — **RF-06** |
| 4 | Immutable ownership from creation | **Safe as a strengthening of DEC-011 #5** (DEC-011 permits pre-activity change but does not require it). **As specified, it creates a lifecycle defect:** the only correction path (close and re-create) cannot complete, and the pack contradicts itself about this — **RF-02** |
| 5 | Inert accounts for `active_limited` clients | **Acceptable in principle** (supports HD-9) **but not inert as specified:** the four-scope client-derived mapping omits settlement and Exchange access, which CLT-01 §5.19 forbids — **RF-04** |
| 6 | Effective status fail-closed | **Mostly.** `unknown` dominates; an unreadable CLT-01 gives `unknown`; a DB failure gives 503, never an empty 200. **Defects:** the `blocked_scopes` deny-list fails open for unlisted activity classes (**RF-04**); scheduled restrictions depend on a job (**RF-08**) |
| 7 | Restriction semantics vs masters | **Aligned** with FRZ-RULE-001/002, the WF-26 states (split between the change request and the restriction record) and the Role Matrix §23 "Account freeze/unfreeze" maker-checker. **Unowned:** `login_block`, and whether a whole-client freeze is CLT-01 status or ACC-01 restriction — **RF-09** |
| 8 | Closure and LED-01 readiness | **Right direction** (two-phase, fail-closed, OFF-RULE-001 items 1–5 via LED-01, items 6–8 client-level). **Defects:** an attest-then-close race (**RF-03**) and a deadlock before LED-01 exists (**RF-02**) |
| 9 | IAM-02 maker-checker represented honestly | **No.** The pack claims default-deny holds while `iam2.role_permission` is empty. For approval-gated codes it does not — **RF-01 (HIGH)**. The seam mechanics are also misdescribed — **RF-07** |
| 10 | Purpose is classification only | **Holds.** Blueprint §11.3, OQ-03 and OQ-09, T-065. Purpose is used only to *tighten* checker policy (HD-2), never to grant |
| 11 | Hidden circular dependencies | **None that deadlock.** Build cycle IAM-02 ext ↔ ACC-01 is correctly broken by phasing. **Undocumented runtime bidirectional dependencies:** ACC-01 ↔ LED-01 (resolve / attest), ACC-01 ↔ CLT-01 (status / open-accounts), and ACC-01 → IAM-02 → ACC-01 re-entrancy via `scope-validate`. There is also a lifecycle coupling: client closure → account closure → LED-01 attester → RF-02 — **RF-10** |
| 12 | DCR classification | **Partly wrong** — **RF-10**. DCR-ACC-LED-01 is labelled "B" but mostly blocks LED-01, not ACC-01. DCR-ACC-IAM-02 mixes a build blocker (a) with go-live items (b, c). Two DCRs are missing (RF-05, RF-09) |
| 13 | DEC-011's 14 binding requirements | **All addressed** (table in §5). #7 is designed but not enforced under current IAM-02 (RF-01). #8, #9 and #11 are satisfied at contract level only, which is acceptable for a structural module |
| 14 | HD-1…HD-10 | §6 |
| 15 | Proposals → formal findings | §7 |

## 4. Findings

Severity: HIGH / MEDIUM / LOW / INFO. "Blocking" means blocking **approval of the named implementation phase**. It does not block remediating the pack.

### ACC-01-RF-01 — HIGH — The default-deny claim is false for approval-gated codes; maker-checker is not entitlement-checked under current IAM-02

- **Affected:**
  - file 07 §2, last bullet ("nobody holds an effective permission, so the routes are unusable by any human")
  - file 07 §4 item 1
  - file 02 §1 step 1 ("`approval_required` counts as pass … the real gate is step 6")
  - file 10 T-060
  - file 01 §16 ("Phases 0–5 depend only on the *accepted* IAM-02 baseline")
  - file 14 §2
  - file 17 DCR-ACC-IAM-03 rationale
- **Evidence:**
  - `guard.ts` returns `approval_required` at step 7 whenever `requires_approval` is true, **before** the step-10 role-grant lookup. So the baseline `permission/check` for every approval-gated `acc1.*` code passes for **any** actor, with or without a role. The pack adopts CLT-01's pattern of treating `approval_required` as a pass.
  - `routes/approvals.ts` request and approve evaluate no entitlement (`IAM2-FIND-002`, HIGH, OPEN). `approver_user_id` and `maker_user_id` are body fields, guarded only by the IAM-02 internal service token.
  - `execute-verify` checks token existence, binding, payload and cache version. It checks **no role grant**.
- **Consequence:** with zero `role_permission` rows, any two distinct authenticated staff users can create, close, restrict or lift accounts. So can any service holding the IAM-02 internal token, acting "as" any user. The pack's claimed protection does not exist.
- **Required correction:**
  1. Remove or correct every claim above. State plainly that approval-gated ACC-01 actions are **not** role-entitled for either maker or checker under current IAM-02.
  2. Rewrite T-060 to assert the **actual** behaviour, as a known-gap regression test, until IAM-02 is fixed.
  3. Make DCR-ACC-IAM-03 (`IAM2-FIND-002`) a **hard prerequisite for enabling phases 3–5 in any environment with real actors** (UAT, DEMO, PRODUCTION). Build and test in DEVELOPMENT/TEST are unaffected.
  4. Record an interim design option for the human to decide (not decided here): pair each approval-gated code with a non-approval "initiate" entitlement code, checked at submit and apply, so the step-7 short-circuit cannot bypass the maker's role check.
- **Blocking:** yes, for phase 3 (and therefore 4 and 5).

### ACC-01-RF-02 — MEDIUM — Mistaken-creation correction deadlocks; the pack contradicts itself

- **Affected:**
  - file 01 §9 item 2 ("closure readiness clears trivially")
  - file 02 §7 item 7 and file 06 §5 (closure impossible until LED-01 attests; empty attester set disables closure)
  - file 01 §6 (limits count non-closed rows)
  - file 05 §2.2 (name uniqueness is `WHERE status <> 'closed'`)
  - DCR-ACC-CLT-01 (client closure requires zero non-closed accounts)
  - file 14 §4 operator note
- **Consequence:** before LED-01 provides an attester, a mistakenly created account can only reach `closing`, and stays there forever. While there it:
  - consumes the per-client master limit (which is 1);
  - consumes the subaccount limit and holds on to the subaccount's name;
  - once DCR-ACC-CLT-01 is implemented, makes the owning client **permanently un-closable**.

  The only mitigation offered ("build the LED-01 attester earlier") is not in ACC-01's control. Immutability is sound; the lifecycle around it is not.
- **Required correction:**
  1. Remove the §9.2 / §7.7 contradiction.
  2. Specify one of these, as a human decision:
     - (a) no account creation outside DEVELOPMENT/TEST until the LED-01 attester exists;
     - (b) a governed void path usable only with an affirmative LED-01 "no ledger account exists for this subaccount" attestation, which still fails closed;
     - (c) `closing` rows excluded from limits and name uniqueness, with the CLT-01 closure consequence stated.

  Do not relax the empty-attester fail-closed rule.
- **Blocking:** yes, for phase 3 outside DEVELOPMENT/TEST and for phase 5.

### ACC-01-RF-03 — MEDIUM — Closure has an attest-then-close race

- **Affected:** file 02 §7 items 2–4; file 06 §2.2 (`closing` implies only `trade_block` and `deposit_block`); HD-5.
- **Consequence:** attestations are accepted for up to `ACC1_ATTESTATION_MAX_AGE` (15 min). While `closing`, withdrawals and settlement still post. So LED-01 can attest `clear` at T, post at T+1, and ACC-01 closes at T+2 — a `closed` account with a balance. R-6 would detect this afterwards. Nothing prevents it.
- **Required correction:** make completion preventive:
  1. Enter a final state or scope that blocks **all** postings (a `full_account_freeze`-equivalent that LED-01 enforces) before collecting the final attestation.
  2. Attest after that point.
  3. Close within the same bounded step.

  Alternatively, LED-01's attestation carries a journal-sequence watermark, and LED-01 refuses postings to a `closing` target after it. Either way, record it in DCR-ACC-LED-01(c). Also clarify how a master-account closure transitions its subaccounts: does each child need its own approval, or does the master request cover them?
- **Blocking:** yes, for phase 5.

### ACC-01-RF-04 — MEDIUM — The client-derived `blocked_scopes` deny-list fails open for unlisted activity

- **Affected:** file 06 §2.1 (`active_limited` and `restricted` rows) and §2.2; file 03 §3 note ("deny unless effective_status permits the activity class"); HD-9.
- **Evidence:** CLT-01 v1.2 §5.19 says `active_limited` is **not permitted**: trading, deposit, withdrawal, **settlement**, wallet/payout activation, **Exchange access**. The pack blocks only `trade_block`, `deposit_block`, `withdrawal_block` and `payout_destination_block`. There is no scope for settlement, internal transfer, fee, subscription (RWA-03), payment acceptance (PAY-01) or Exchange access. A consumer that reads `blocked_scopes` as a deny-list would allow those activities.
- **Required correction:**
  1. Client-derived `active_limited` and `restricted` map to `report_only_access`, meaning every transactional activity is blocked.
  2. Define the consumer rule normatively: **any `effective_status` other than `active` is deny for a transactional activity unless that activity is explicitly allow-listed for that status.** `blocked_scopes` is explanatory evidence, not the gate.
  3. Add tests.
- **Blocking:** yes, for phase 2 (resolve).

### ACC-01-RF-05 — MEDIUM — The CLT-01 read seam requires a write-capable CLT-01 credential

- **Affected:** file 01 §2 and §13; README headline 1; `01-plan.md` design outcome 1 ("no CLT-01 change is needed to build ACC-01").
- **Evidence:** `/internal/clt1/clients/:client_id/status` is guarded by `makeClt1InternalIdentityGuard(clt1InternalServiceToken)`. That is the **same single token** that guards CLT-01's internal mutating routes: mandates create/update, authorised-party add/update/remove/activate/screening-outcome, related-party edges, duplicate candidates, decisions and outcomes. Provisioning it to ACC-01 gives the account module write reach into the identity and membership domain. That undercuts the ownership boundary this module exists to preserve.
- **Required correction:**
  1. Add a DCR against CLT-01 for a **read-scoped capability credential** for the status seam, following the dedicated `IAM_INTROSPECTION_SERVICE_TOKEN` precedent (IAM-01).
  2. Classify it as blocking phase 2 in any environment beyond DEVELOPMENT/TEST.
  3. State that ACC-01 must never be provisioned CLT-01's general internal token.
  4. Record the analogous IAM-02 internal-token exposure (see RF-01) as a cross-module risk.
- **Blocking:** yes, for phase 2 outside DEVELOPMENT/TEST.

### ACC-01-RF-06 — LOW — A restriction can name another client's subaccount

- **Affected:** file 05 §2.3.
- **Evidence:** `account_restriction` has an FK to `master_account (master_account_id, client_id)`, but `subaccount_id` is unconstrained. A row can pair client A's master with client B's subaccount, and resolve-by-subaccount would then apply it cross-client.
- **Required correction:**
  1. Add `UNIQUE (subaccount_id, master_account_id, client_id)` on `subaccount`.
  2. Add a composite FK from `account_restriction (subaccount_id, master_account_id, client_id)` to it.
  3. Add a test.
- **Blocking:** yes, for phase 1 (schema).

### ACC-01-RF-07 — LOW — IAM-02 seam mechanics misdescribed

- **Affected:** file 02 §1 steps 3–4 and §2 A2; file 04 §2.1.1 ("the maker takes `payload_hash` into the IAM-02 approval request") and §2.1 apply; file 05 §2.4 `payload_hash varchar(64)`; file 07 §4.
- **Evidence:**
  - `/iam2/approvals/request` takes a `payload` and computes its own hash via `@aix/foundation` `fingerprint` (`"sha256:" + 64 hex` = 71 characters). It does not accept a caller hash.
  - The decision token is issued to `maker_user_id`, and F1 binding rejects any other actor.
  - The execute-verify field is `current_payload_hash`.
- **Required correction:**
  1. ACC-01 computes `payload_hash` with the shared `fingerprint` and submits the canonical payload to IAM-02.
  2. Widen the column to at least 71 characters, or store the canonical form.
  3. Apply is **by the maker only**; remove "or an authorised operator".
  4. Name fields as the seam does.
- **Blocking:** yes, for phase 1 / phase 3 detail.

### ACC-01-RF-08 — LOW — Effective-status timing and evidence gaps

- **Affected:** file 02 §5 item 6; file 06 §3; file 05 §7 item 5.
- **Evidence:**
  - A `scheduled` restriction takes effect only when a job runs. A late job is a fail-open window.
  - A restriction applied or lifted on a `closing` row does not mutate the account row, so `version` does not change. The consumer's evidence tuple then fails to distinguish two different effective states.
- **Required correction:**
  1. Resolve treats `scheduled` rows with `effective_from_utc <= now()` as active; the job only tidies state.
  2. Bump the target's `version` (or return a restriction-set version) on every restriction change.
  3. Add tests.
- **Blocking:** yes, for phases 2 and 4.

### ACC-01-RF-09 — LOW — Freeze ownership between CLT-01 and ACC-01 is undecided

- **Affected:** file 01 §2 ("Freeze/restriction policy … CLT-01/AML-01/INC-01 side"); file 02 §5 item 3; file 17.
- **Evidence:**
  - WF-26 and the Role Matrix §23 "Account freeze/unfreeze" row predate the account layer.
  - CLT-01 already has client `suspended`/`restricted` lifecycle decisions.
  - The pack adds account-level restrictions but does not say which module applies a *whole-client* freeze.
  - `login_block` (FRZ-RULE-002 item 1) is rejected by ACC-01 but assigned to no owner.
  - Risk: two freeze systems with divergent lift paths.
- **Required correction:** add a DCR against the masters/CLT-01, plus a human decision, fixing (a) the owner of client-level freeze, (b) the owner of `login_block`, and (c) the rule that ACC-01 restrictions never substitute for a client-level freeze.
- **Blocking:** yes, for phase 4.

### ACC-01-RF-10 — LOW — DCR classification and dependency-graph corrections

- **Affected:** file 17 §1; file 01 §13.
- **Required corrections:**
  1. **DCR-ACC-LED-01:** parts (a) and (b) **block LED-01's schema freeze, not ACC-01's build**. Only (c) blocks ACC-01 (phase 5). Relabel it.
  2. **DCR-ACC-IAM-02:** split (a) catalogue (blocks phase 1) from (b) approval policy and (c) step-up (blocks real-actor use).
  3. **New DCRs:** add the ones required by RF-05 and RF-09.
  4. **Runtime dependencies:** document the bidirectional ACC ↔ LED-01 and ACC ↔ CLT-01 dependencies and the ACC → IAM-02 → ACC `scope-validate` re-entrancy.
  5. **Readiness:** readiness checks must validate peer **configuration only, never peer liveness**, to avoid a boot-order cycle.
- **Blocking:** no.

### ACC-01-RF-11 — INFO — The ACC-01 client-class check is not an eligibility authority

- **Affected:** file 01 ACC-REQ-013; file 02 §3.
- **Note:** the retail/unknown class refusal is defence in depth and fails closed, because CLT-01 already prevents a retail client from becoming active. The pack should state that it is **not** a second eligibility authority (Module Index §19 rule 7: CFG-01 is the sole one), and that any future retail approval (Doc 00 §10.2A rule 6) requires a governed ACC-01 change.
- **Blocking:** no.

## 5. DEC-011 §4.9 binding-requirement coverage (independently traced)

| # | Requirement | Where the pack covers it | Verdict |
|---|---|---|---|
| 1 | Stable identifiers | 01 §5; 05 `CHECK` | Covered |
| 2 | Explicit legal-entity ownership | ACC-REQ-003/004; 05 §2.1–2.2 | Covered |
| 3 | No cross-client subaccount ownership | Composite FK; trigger | Covered (RF-06 closes the restriction side-channel) |
| 4 | Lifecycle states | 06 §1 | Covered |
| 5 | Ownership immutable after financial activity | 01 §9 (from creation) | Covered and strengthened; lifecycle defect RF-02 |
| 6 | Audit events | 08 §2 | Covered |
| 7 | Maker-checker via IAM-02 | 02 §1–2; 07 §4 | Designed; **not enforced under current IAM-02** (RF-01) |
| 8 | Subaccount-scoped permissions, narrowing-only | 07 §5; `scope-validate`; DCR-ACC-IAM-01 | Registry side covered; enforcement correctly delegated |
| 9 | Wallet compatibility | DCR-ACC-WLT-01; resolve | Contract level only — acceptable |
| 10 | Ledger posting compatibility | DCR-ACC-LED-01; resolve | Covered |
| 11 | Four pillars | Purposes; resolve; §33A.3 | Contract level only — acceptable |
| 12 | Reporting / reconciliation | 13 | Covered |
| 13 | No balances on CLT identity records | ACC-REQ-007; ACC-01 never writes `clt1` | Covered |
| 14 | One-to-many entity → master | 05 §2.1 (no unique on `client_id`); limit as configuration | Covered |

## 6. HD-1…HD-10 adjudication (the reviewer does not decide them)

| HD | Pack recommendation | Adjudication | Basis / condition |
|---|---|---|---|
| HD-1 | Auto-create a default `general` subaccount | **SUPPORTED WITH CORRECTION** | Decision pack §4.7 ("single default subaccount provisioned initially"). Correction: state that no consumer may substitute the default subaccount for a missing `subaccount_id`. An implicit catch-all would re-create the `client_id` conflation DEC-011 removes |
| HD-2 | Maker/checker role assignments | **HUMAN DECISION REQUIRED** | The Role Matrix supports only the close (§7) and freeze/unfreeze (§23) rows. Create rows have no master basis. Also, under RF-01 role assignments are not enforced at the approval step until `IAM2-FIND-002` closes |
| HD-3 | Master = 1 per client; subaccount limit to be chosen | **HUMAN DECISION REQUIRED** | Master = 1 is supported by DEC-011. The subaccount value has no source. RF-02 affects how limits count `closing` rows |
| HD-4 | No emergency single-actor restrict path in v0.1 | **SUPPORTED** | WF-26 steps 4–5 and Role Matrix §23 require maker-checker for freeze/unfreeze. Any emergency path is a later human decision |
| HD-5 | Single approval at request; machine-verified completion | **SUPPORTED WITH CORRECTION** | Only if RF-03's preventive completion (full posting block, then attest, then close) is adopted |
| HD-6 | Staff-initiated only; client surface read-only | **SUPPORTED** | Conservative. Role Matrix §7 lets a client *request* closure; that can be a later extension |
| HD-7 | `A2-Q1`/`A2-Q2` gate client-money go-live, not the build | **SUPPORTED** | DEC-011 status; Doc 00 §2C and §23; DEC-013 clause 4 |
| HD-8 | Purposes `general`, `trading`, `treasury`, `payments`, `rwa` | **SUPPORTED** | DEC-011's list is illustrative ("e.g."). Extension by migration keeps it governed. Exchange-domain purposes stay out (OQ-08) |
| HD-9 | Inert accounts for `active_limited` clients | **SUPPORTED WITH CORRECTION** | Only if RF-04 is applied (client-derived `active_limited` ⇒ all transactional activity blocked, allow-list consumer rule) |
| HD-10 | Retention class | **HUMAN DECISION REQUIRED** | No repository source states a period. Never-delete is safe meanwhile |

## 7. Proposals → formal findings

- **Candidates for a human to promote to `OPEN_FINDINGS.md`:** none are promoted by this review.
  - **RF-01's platform component** is recommended for review as an addendum to `IAM2-FIND-002`: for **every** approval-gated permission, CLT-01 included, the maker's domain permission is never role-checked. The guard's step 7 precedes step 10, and execute-verify checks no role. This widens the scope of the existing HIGH finding beyond the approval endpoints. It is not an ACC-01 defect.
- **Pack-proposed items:**

  | Item | Recommendation |
  |---|---|
  | ACC-PROP-001 (IAM-02 cycle) | Keep as an INFO note |
  | ACC-PROP-002 (Role Matrix row missing) | Keep; it feeds HD-2 / DCR-ACC-GOV-02 |
  | ACC-PROP-003 (CLT-01 `restricted` scope) | Folded into RF-04 and RF-09 |
  | ACC-PROP-004 (LED-01 `client_id`) | **Not a new finding.** Already a binding DEC-011 requirement |
- **RF-01 … RF-11** stay as review findings of this task, to be remediated in pack v0.2.

## 8. `task.json` state correction

- **Authoritative convention:** the conductor state machine `aix-conductor/src/state.ts` `TRANSITIONS` has: `IDLE`, `PLANNING`, `PLAN_READY`, `APPROVED_FOR_IMPLEMENTATION`, `IMPLEMENTING`, `IMPLEMENTATION_COMPLETE`, `REVIEWING`, `REMEDIATION_REQUIRED`, `ESCALATION_REQUIRED`, `HUMAN_DECISION_REQUIRED`, `ACCEPTED`, `FAILED`. `PLANNED` is not among them.
- **Why `IDLE` is not correct:** `IDLE` is the pre-planning initial state; its only exit is `→ PLANNING`. It is the template default only because the template describes a new task. `docs/phase1-planner.md` says a completed plan "stays `PLAN_READY` and needs a human", and `docs/architecture.md` shows `IDLE → PLANNING → PLAN_READY ──(human: start_implementation)──▶ APPROVED_FOR_IMPLEMENTATION`.
- **Set:** `"state": "PLAN_READY"`, with the human-readable `PLANNED / AWAITING REVIEW` preserved in `statusNote`, plus the review outcome.
- **Why not another state:** `REVIEWING` and `REMEDIATION_REQUIRED` are implementation-review states; `REMEDIATION_REQUIRED` only exits to `IMPLEMENTING`, which would be wrong for a plan. The conductor path to rework a plan is `PLAN_READY → PLANNING` (ungated). That transition is left to whoever starts the remediation round, so this review does not open a planning round on anyone's behalf.
- **Gate status:** the `start_implementation` gate **must not be granted** while this review's verdict is REMEDIATE.
- **`roundCounts.review` set to 1:** this records a **plan** review. The conductor normally counts review rounds on entering `REVIEWING`, which did not happen; the discrepancy is noted in `statusNote`.

## 9. Cross-module dependency risks (summary)

1. **IAM-02:** approval-gated actions are not entitlement-checked (RF-01, `IAM2-FIND-002`). No approval policy is seeded (`IAM2-FIND-003`). The internal token lets a holder act as any maker or approver.
2. **CLT-01:** a single write-capable internal token (RF-05). The client-closure guard (DCR-ACC-CLT-01) interacts with RF-02. Freeze ownership is split (RF-09).
3. **LED-01:** schema freeze is gated on DEC-011 and this pack. The attestation contract, including the race fix (RF-03), is on ACC-01's critical path for closure. LED-01 posting depends on ACC-01 availability.
4. **Availability coupling:** every resolve reads CLT-01 live with no cache, so a CLT-01 outage denies all money flows. This is correct fail-closed behaviour and must be operationally owned.
5. **FND-01:** no client route until `FND-FIND-001` is resolved (correctly recorded).

## 10. Required before re-review

A pack **v0.2** that:

- closes RF-01 … RF-10;
- records RF-11;
- applies the HD corrections in §6;
- updates file 17's DCR table;
- does not alter `v0.1`.

After that, a re-review, preferably in a separate session, then the human decisions. **Implementation is not authorised by this review.**
