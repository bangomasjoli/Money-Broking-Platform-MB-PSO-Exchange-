# 04 Review (round 2) — ACC-01: Account Structure blueprint pack v0.2

- **Task ID:** ACC-01 (planning task — blueprint pack, no implementation)
- **Reviewer:** independent architecture / compliance reviewer / claude-opus-5-5 / HIGH
- **Pack under review:** `docs/02_modules/ACC-01/blueprint/v0.2/` at `8ff4e9d` (remediation of v0.1 per `04-review.md`, verdict REMEDIATE at `2e26d13`)
- **Author of v0.1 and v0.2:** blueprint planner / claude-sonnet-5 (per `01-plan.md`, `05-remediation.md`)
- **Independence:** **separate context.** This review ran in a **new Claude Code session**. It carried no conversation from the authoring session (v0.1), the first review (`04-review.md`) or the remediation session (v0.2). Everything below was re-derived from the repository: the v0.2 text, the governing decisions and masters, and the IAM-02, CLT-01, CFG-01 and foundation source. `05-remediation.md` was read only as a map of what was claimed. It was **not** used as evidence. The reviewer is the same model family as the first reviewer and a different model from the author.
- **Decision:** **REMEDIATE**
- **Implementation authorised:** **No.** Nothing is accepted. No `06-acceptance.md` exists or is created.

## 1. Baseline verification (all passed)

| Check | Result |
|---|---|
| Worktree | `/Users/AimanRahimi/AIX-worktrees/acc-01` |
| Branch | `module/ACC-01` |
| HEAD | `8ff4e9d` (= `origin/module/ACC-01`) |
| Working tree | clean before this review |
| History | `43f2f34` (baseline) → `42316fe` (v0.1) → `2e26d13` (review, REMEDIATE) → `8ff4e9d` (v0.2) |
| `main` / `origin/main` | both `43f2f34`; untouched; `43f2f34` is an ancestor of HEAD; nothing merged |
| Diff `43f2f34..8ff4e9d` | 41 files, +4237/−0. **All** under `docs/02_modules/ACC-01/**` or `docs/03_implementation/tasks/ACC-01/**`. No `platform/**`, no migration, no master, no register |

## 2. Sources reviewed

**Decisions:**

- `DEC-011`, `DEC-013`, `DEC-014` (`DECISION_LOG.md`).

**Masters:**

- Doc 00 v1.5 §1.D (state 2 owner = CFG-01 environment scope), §1.E, §21, §21A.
- Module Index v1.4 §19 (rules 6, 7, 10–13).
- Workflow Map v1.3 WF-27 §31.
- System Rules v1.3 `OFF-RULE-001`.

**Registers:**

- `OPEN_FINDINGS.md` rows `IAM2-FIND-002`, `IAM2-FIND-003`, `FND-FIND-001`.

**Task records:**

- `04-review.md` and `05-remediation.md`, both compared against the actual v0.2 text.
- All 18 v0.2 files read in full, plus the module README.

**Source inspected read-only, to test the factual claims:**

| Area | Files |
|---|---|
| IAM-02 | `services/iam2/src/lib/guard.ts`, `lib/decision-token.ts`, `routes/approvals.ts`, `routes/internal.ts`, `plugins/internal-identity.ts` |
| CLT-01 | `services/clt1/src/routes/clients.ts` (status seam), `routes/decisions.ts` (apply precedent), `config.ts` |
| Foundation | `packages/foundation/src/idempotency.ts` (`fingerprint`) |
| CFG-01 | MIG-004 at `5a4f872` (`cfg1.feature.environment_scope`, `lib/environment-availability.ts`) |
| Conductor (`aix-conductor`, not modified) | `src/state.ts`, `src/implementation.ts`, `dist/records.js` → `validateTaskManifest` |

## 3. Source facts established independently

| # | Fact | Evidence |
|---|---|---|
| S1 | For `requires_approval = true`, `evaluatePermission` returns `approval_required` at step 7, before the step-10 role lookup, for any actor | `guard.ts` L342–347 vs L355 |
| S2 | **Step 6 (step-up) precedes step 7 (approval).** With `requires_step_up = true`, the check returns `step_up_required` before approval is considered | `guard.ts` L338–340; also `IAM2-FIND-002` text |
| S3 | `/iam2/approvals/request\|approve\|reject` are guarded only by `iam2InternalServiceToken`. `maker_user_id` / `approver_user_id` are body fields. No entitlement is evaluated | `approvals.ts` L120, L128, L217, L433 |
| S4 | IAM-02 computes `fingerprint(payload)` itself; the request schema has no hash field. `payload` is optional; with no payload, no redeemable token is minted | `approvals.ts` L50–52, L140, L388 |
| S5 | `fingerprint` = `"sha256:" + 64 hex` (71 characters), computed over sorted-key canonical JSON | `idempotency.ts` L42–52 |
| S6 | The decision token is **bound** to `approval.maker_user_id`, but the raw token is **returned in the `/approve` response**, i.e. to the approve caller | `approvals.ts` L388–401, L413–421 |
| S7 | `execute-verify` body: `decision_token, approval_id?, actor_id, session_id?, action, resource, entity_id?, client_id?, current_payload_hash?` (`additionalProperties: false`, `current_payload_hash` ≤ 128). **`approval_id` is accepted but never passed to verification and never compared.** No role grant is checked | `internal.ts` L47–60, L146–157; `decision-token.ts` L228–235 |
| S8 | CLT-01's apply precedent is an **internal-token route**. Its `actor_id` is the stored `requested_by`, and whoever holds the internal token and the decision token can call it (caller-asserted identity) | `clt1/routes/decisions.ts` L336–392 |
| S9 | `/internal/clt1/clients/:client_id/status` is guarded by the single `clt1InternalServiceToken`. That same guard and token are used by all 13 CLT-01 route files that call `makeClt1InternalIdentityGuard`, including the mutating ones. The seam returns `status` and `client_class`, and `404` for an unknown client | `clt1/routes/clients.ts` L81–84, L88–115 |
| S10 | CFG-01 enforces per-environment availability (`cfg1.feature.environment_scope`, migration 071) at the baseline. Doc 00 §1.D names CFG-01 the owner of `ENVIRONMENT_AVAILABILITY` | `5a4f872`; Doc 00 L152 |
| S11 | WF-27 step 5 returns the remaining balance to a verified own-name destination **during** closure, before the steps 9–10 maker-checker. `OFF-RULE-001` items 1, 4 and 7 require balance return and completed withdrawals | Workflow Map L1737; System Rules L1476–1487 |

## 4. Verdict

**REMEDIATE.**

v0.2 is a large, honest improvement. What it closes:

- the false default-deny claim (RF-01), except for two residual test rows;
- the `blocked_scopes` fail-open (RF-04);
- the restriction owner binding (RF-06);
- scheduled-restriction timing (RF-08);
- DCR classification and the runtime dependency graph (RF-10);
- the eligibility-authority statement (RF-11).

It correctly carries forward the IAM-02, CLT-01, LED-01 and governance dependencies as external gates.

The redesigned **closure** path, however, contains two deterministic deadlocks and a latent barrier bypass:

1. A funded account that enters `closing` can never drain and never leave (**R2-F01, HIGH**).
2. A master account can never reach `closure_sealed` because of its own default subaccount (**R2-F02**).
3. The single worst-of `effective_status` can mask the seal barrier (**R2-F03**).

In addition, the real-use gates are keyed on environment names. That makes them an ACC-01-local environment-availability control, which the masters assign to CFG-01. It needs correction and a human decision (**R2-F08**, OQ-11).

These are ACC-01 blueprint defects that the pack author can fix. They are not external dependencies. They must be fixed before the pack can be accepted.

## 5. RF-01 … RF-11 disposition

| RF | Severity (v0.1) | Disposition | Basis |
|---|---|---|---|
| **RF-01** IAM-02 entitlement | HIGH | **EXTERNAL GATE REMAINS** | Every location RF-01 named is corrected and matches S1–S3: 02 §0, 07 §1/§3, 01 ACC-REQ-023/§16, 10 T-060, 14 §2, 17 DCR-ACC-IAM-03. G1 gates real-actor governed apply. The `IAM2-FIND-002` fix remains IAM-02's and is **not** closed. **Caveat:** two test rows outside RF-01's list (T-048, T-066) still assert entitlement denials that do not exist. The blueprint side closes only with **R2-F06** |
| **RF-02** mistaken-creation deadlock | MEDIUM | **EXTERNAL GATE REMAINS** | The v0.1 contradiction is removed (01 §9.2). Creation is DEV/TEST-only until the LED-01 attester exists (G2, the human-approved RF-02 decision). `closing`/`closure_sealed` count against limits and names. The empty-attester fail-closed rule is kept. The LED-01 attester (DCR-ACC-LED-01c) is external. Note: the "closure and re-creation" correction path for a master is itself blocked by **R2-F02** |
| **RF-03** attest-then-close race | MEDIUM | **SUPERSEDED BY NEW FINDING** (R2-F01, R2-F03) | The seal barrier plus post-barrier attestation plus CAS addresses the v0.1 stale-attestation race. However, the barrier's "remains effective by construction" claim (01 §7 L159; 02 §7.5) does not hold under R2-F03. The attestation contract has no "no posting committed after the seal" assertion, and the design is not completable for funded accounts (R2-F01) |
| **RF-04** `blocked_scopes` fail-open | MEDIUM | **CLOSED IN BLUEPRINT** | Normative consumer rule (06 §2.0; 01 ACC-REQ-039, §10). `active_limited`/`restricted` ⇒ report-only, including settlement and Exchange access (06 §2.1). Scopes are explanatory only. No permit field (04 §3.1). Tests T-036/037/041/140/141. Not affected by R2-F03, which is a different defect (single-label masking across components) |
| **RF-05** CLT-01 credential | MEDIUM | **EXTERNAL GATE REMAINS** | Verified against S9. ACC-REQ-031, 01 §2/§13, DCR-ACC-CLT-03 and T-146 say ACC-01 **never** holds the general token. The IAM-02 analogue is DCR-ACC-IAM-05. The dedicated credential is CLT-01's to deliver. Residual gate-coverage and DEV/TEST inconsistency → **R2-F05** |
| **RF-06** restriction owner binding | LOW | **CLOSED IN BLUEPRINT** | 05 §2.2 has `UNIQUE (subaccount_id, master_account_id, client_id)`. 05 §2.3 has two composite FKs plus a `CHECK` on `target_type` ⇔ `subaccount_id`. A client-A master cannot be paired with a client-B subaccount (T-145) |
| **RF-07** IAM-02 seam mechanics | LOW | **SUPERSEDED BY NEW FINDING** (R2-F04) | Corrected and verified against S4–S7: IAM-02 fingerprints the payload itself; ACC-01 never sends a hash; 71-character hash fits `varchar(80)`; exact `execute-verify` field names including `current_payload_hash`; recompute from the stored payload; token consumed after verify; any post-verify failure ⇒ `requested` and a fresh approval. **Not delivered:** the "a different caller cannot apply" property. Also misstated: token delivery, `approval_id` verification and the step-up ordering |
| **RF-08** scheduled-restriction timing / evidence | LOW | **CLOSED IN BLUEPRINT** | Time-effective rule (06 §3). A late job errs **conservative**: an unprocessed expiry keeps the stored projection strict, and an unprocessed activation is counted by time. Every restriction change bumps the target `version` (05 `trg_acc1_restriction_version`). Resolve returns both versions and `applied_restriction_ids`. Minor lifecycle gaps → **R2-F07** (no enforcement gap) |
| **RF-09** freeze ownership | LOW | **EXTERNAL GATE REMAINS** | Nothing invented: `login_block` is rejected; there is no client-freeze route (T-152); DCR-ACC-GOV-05; G4. The ownership decision belongs to governance |
| **RF-10** DCR classification / dependencies | LOW | **CLOSED IN BLUEPRINT** | Five classes. LED-01 is split a/b/c/d and IAM-02 a/b/c. Runtime edges are documented (01 §13, 03 §6). Readiness checks configuration and contract only, with no outbound peer call (ACC-REQ-040, 04 §3.4, T-132). `scope-validate` never calls IAM-02 (T-126). Residual classification point for DEV/TEST credentials → R2-F05 |
| **RF-11** not an eligibility authority | INFO | **CLOSED IN BLUEPRINT** | 01 §4.6, ACC-REQ-013, 09 notes, 15 row, T-150 |

## 6. New findings

Severity uses HIGH / MEDIUM / LOW / INFO. "Blocking" means blocking **approval of the pack or of the named phase**; nothing here blocks remediation.

### ACC-01-R2-F01 — HIGH — A funded account that enters closure can never drain or exit; client money is trapped with no recovery path

- **Evidence.** Four v0.2 rules combine:
  1. `closing` denies **every** transaction-producing activity, because the consumer rule denies all non-`active` activity until DCR-ACC-GOV-04 exists (02 §7.2; 06 §2.0). GOV-04 is classed **GO-LIVE**, not part of G5 (17 L42; 01 §4.5 G5).
  2. `closing → closure_sealed` has **no readiness precondition**. The seal needs only state `closing` and a binding to the approved request (02 §7.3; 04 §2.4; 09 `ACC1_CLOSURE_SEAL_INVALID`).
  3. There is **no transition out** of `closing` other than `closure_sealed`, and none out of `closure_sealed` other than `closed` (06 §1 diagram and rule 3; T-084). No abort path exists (OQ-07).
  4. A blocked completion "leaves the target `closure_sealed` (still barred) … no return path" (02 §7.6).
- **Consequence.** WF-27 step 5 and `OFF-RULE-001` items 1, 4 and 7 require the remaining balance to be **returned during** closure (S11). Under v0.2, an account with any balance or open item that enters `closing` cannot move money. It stays in `closing` forever, or, once sealed, is refused every posting forever while its attestation stays `blocked`. The runbook instruction "resolve the attester issue, do not bypass" (14 §5) cannot be carried out. Client money is trapped with no designed recovery. The seal is irreversible and money-trapping. Its gate is `acc1.*.close`, an approval-gated code whose baseline check passes for any actor (S1), and it carries no approval of its own.
- **Also:**
  - The attestation contract does not state what makes a post-barrier `clear` sufficient. `in_flight_predating_seal` counts postings not yet committed. Nothing asserts that **no posting committed after the seal** on pre-seal resolve evidence.
  - `trg_acc1_seal` accepts "a `clear` attestation row". It does not require the **latest** row per attester.
- **Affected:** 01 §7; 02 §7; 03 §5; 04 §2.4; 06 §1, §5; 07 §2 (`close` row); 14 §2 G5, §5; 17 DCR-ACC-LED-01c, DCR-ACC-GOV-04, OQ-07, OQ-12.
- **Required correction:**
  1. Make the **closing-drain subset** of the status→activity policy a prerequisite of **G5** (class ACC-REAL-USE, not GO-LIVE). At minimum, cover balance return to a verified own-name destination, completion of open settlement and open withdrawal, and closure of reconciliation breaks. Alternatively, require an affirmative LED-01 "drained" attestation **before** `closing` can be applied.
  2. Add a **seal precondition**: a pre-seal LED-01 readiness result showing drained and zero in-flight. The post-barrier attestation stays the authority for `closed`; the pre-check only prevents sealing a funded account.
  3. Specify the outcome of a **blocked** post-barrier attestation. Record as a **human decision** (OQ-07 / OQ-12) one of:
     - (a) a governed, maker-checker **abort** from `closing` and from `closure_sealed`, returning to the prior projection;
     - (b) making `seal` itself the WF-27 steps 9–10 maker-checker act, performed only after drain;
     - (c) another governed path.

     "Forever sealed with a balance" must not be the only outcome.
  4. Tighten DCR-ACC-LED-01c. The attester asserts that **no posting committed to the target on resolve evidence older than the seal**, not only zero in-flight. A clock-free form: LED-01 stores the resolve `versions` with each posting (08 §3 already expects consumers to), and attests that the maximum evidence version among committed postings is below the target `version` written by the seal transition. ACC-01 verifies this at completion.
  5. Completion and `trg_acc1_seal` use the **latest** attestation per configured attester at the current seal version.
  6. State that, once G1 lifts, `seal` and `complete` require an **entitled** actor, not only the approval-gated baseline.
- **Implementation impact:** phase 5 cannot be approved as designed, and the G5 prerequisites change. Phases 0–4 are unaffected apart from the resolve-contract changes in R2-F03.

### ACC-01-R2-F02 — MEDIUM — The default subaccount and the master seal block each other, so no master account can ever close

- **Evidence:**
  - 05 §5 `trg_acc1_default_protected` (L202): "Default subaccount cannot enter `closing`/`closure_sealed`/`closed` unless its master is already in that state or beyond."
  - 05 §5 `trg_acc1_seal` (L203) and 06 §1 rule 6: "a master may enter `closure_sealed` only if no child is non-`closed`."
  - The default subaccount is a child. It cannot reach `closed` until the master is `closed`. The master cannot reach `closure_sealed` until the default is `closed`.
  - T-031 (L50) and T-139 (L222) test the blocking rule. 01 §8 and 02 §7.1 ("closes only with its master") restate it. 06 §1 rule 6 restricts only `closing`, so the pack also contradicts itself.
- **Consequence:** every master account is permanently un-closable. Under DCR-ACC-CLT-01, every client holding an account then becomes permanently un-closable. The RF-02 "closure and re-creation" correction path is unreachable for a master.
- **Required correction:**
  1. Define the default's rule once: it enters `closing` **only in the same transaction as its master's `closing`**, and thereafter proceeds `closure_sealed → closed` like any listed child, **before** the master seals.
  2. Align 01 §8, 02 §7.1, 05 §5, 06 §1 rule 6, and T-031/T-139.
  3. Add an end-to-end test: a master with only its default subaccount completes closure.
  4. Separately, `trg_acc1_sa_owner` must read the master row with a lock (`FOR SHARE` or stronger). Otherwise a subaccount insert can pass the status check against an `active` master while a concurrent master-closing apply commits. That leaves an unlisted child under a `closing` master.
- **Implementation impact:** phase 1 (triggers) and phase 5.

### ACC-01-R2-F03 — MEDIUM — A single worst-of `effective_status` can mask the closure barrier and closing limits

- **Evidence:**
  - Precedence is `closed > frozen > suspended > closure_sealed > closing > restricted > active` (06 L59; 01 L193; T-040).
  - Restrictions may be applied to `closing`/`closure_sealed` targets, and "effective status honours them" (06 §1 rule 2; T-074). A sealed subaccount with an in-force suspension therefore resolves `effective_status = suspended`.
  - The consumer rule and the future GOV-04 policy key on `effective_status` (06 §2.0).
  - DCR-ACC-LED-01c says LED-01 refuses "when resolve shows `closure_sealed`".
- **Consequence:** today the effect is safe only because every non-`active` status denies. Once GOV-04 authorises any activity for `suspended`, `restricted` or `frozen` (for example a withdrawal-only suspension), a sealed or closing account that also carries that restriction is reported under the weaker label. The activity is then authorised through the barrier. The "barrier remains effective by construction" claim (01 L159; 02 L89) is conditional on a policy that does not exist yet. The statuses are not totally ordered: lifecycle and restriction states are different dimensions.
- **Required correction:**
  1. Make the consumer rule **conjunctive over components**: an activity is permitted only if authorised for **every** non-`active` component (client-derived, master lifecycle and projection, subaccount lifecycle and projection).
  2. Have resolve expose the lifecycle state explicitly (for example `lifecycle_status` for both levels) alongside `effective_status`.
  3. DCR-ACC-GOV-04 is defined over the component set, never over the single label.
  4. `closure_sealed`/`closed` can never be authorised for any transaction-producing activity.
  5. DCR-ACC-LED-01b/c key the barrier on the lifecycle fields.
  6. Add tests for sealed+suspended, sealed+frozen and closing+restricted.
- **Implementation impact:** phase 2 resolve contract; LED-01 DCR text.

### ACC-01-R2-F04 — LOW — The apply actor-binding claim is not delivered by its mechanism; seam details misstated (RF-07 residue)

- **Evidence and correction:**
  - **(a) Actor binding.** 02 §1 step 7, 04 §2.1, 07 §4.1 and T-130 claim "apply is bound to the stored maker … a different caller cannot apply". The mechanism, `actor_id = stored requested_by` sent to `execute-verify`, makes IAM-02's actor binding pass **for any caller** holding the decision token (S7, S8). The raw token is returned to the **approve caller** (S6), not "to the maker" as 02 §1 step 6 and 03 §2 state. v0.2's staff routes carry an IAM-01 session (04 §1). ACC-01 must therefore:
    - require the authenticated session principal to equal the stored `requested_by` at apply, and at cancel ("maker's own request only");
    - audit both identities;
    - state how the token reaches the maker.

    Alternatively, if ACC-01 deliberately mirrors CLT-01's internal-route, caller-asserted posture (S8; the `IAM2-FIND-002` carry-forward L3), withdraw the claim and T-130's assertion.
  - **(b) `approval_id`.** `execute-verify` neither verifies nor returns the token's approval id (S7). The `approval_id` ACC-01 records (05 §2.4) and reconciliation R-7 relies on is **caller-asserted**. Label it so, or obtain the bound id from IAM-02 by a DCR.
  - **(c) Step-up ordering.** 07 §2 (L35) states that `guard.ts` "returns `approval_required` before `step_up_required`". That is inverted (S2). The conclusion (do not set `requires_step_up` on catalogue rows) holds for the opposite reason: the baseline would return a blocking `step_up_required` for every actor. Correct the rationale.
- **Implementation impact:** phase 3 apply and cancel design; T-130 rewrite.

### ACC-01-R2-F05 — LOW — Credential-boundary gates do not cover the apply-time CLT-01 read, and the DEV/TEST credential path is unstated

- **Evidence:**
  - G3 gates only resolve, batch and open-accounts (01 §4.5). Submit and apply for **every** change type read CLT-01 status (02 §1 step 2, §2 A2). G1, G2, G4 and G5 do not include DCR-ACC-CLT-03. Outside DEV/TEST, the governed apply path would therefore need a CLT-01 credential that no gate requires.
  - ACC-REQ-031, 04 §1 and T-146 forbid CLT-01's and IAM-02's general tokens in **all** environments. Today those seams accept **only** the general tokens (S3, S9). Yet DCR-ACC-CLT-03 and DCR-ACC-IAM-05 are classed ACC-REAL-USE, which implies DEV/TEST can proceed without them. The pack never says DEV/TEST uses peer stubs only. Leaving it unsaid is the path by which a general token gets configured "just for DEV".
- **Required correction:**
  1. Add DCR-ACC-CLT-03 to every gate whose operations read CLT-01, or make it a precondition of ACC-01 boot outside stub mode.
  2. State explicitly that DEV/TEST uses CLT-01 and IAM-02 **stubs** until DCR-ACC-CLT-03 and DCR-ACC-IAM-05 land, and that the general tokens are forbidden in DEV/TEST too.
  3. Otherwise, reclassify those DCRs as ACC-BUILD for real-peer integration.
- **Implementation impact:** phase 2/3 DEV/TEST integration plan; gate table.

### ACC-01-R2-F06 — LOW — Two test rows still assume entitlement denials that current IAM-02 does not provide (RF-01 residue)

- **Evidence:** T-048 (L77, "caller lacking the permission ⇒ deny") and T-066 (L100, "SUPER_ADMIN/ADMIN without the specific permission cannot create/close/restrict/lift") concern the approval-gated `acc1.*` codes. Under S1, both are false against observed IAM-02. They also contradict T-060 in the same file.
- **Required correction:** restrict both rows to non-approval codes, or label them `KNOWN_GAP_IAM2_FIND_002` with the same expected-failure discipline as T-060/T-127/T-128.
- **Implementation impact:** test plan only.

### ACC-01-R2-F07 — LOW — Restriction lifecycle gaps (no enforcement gap)

- **Evidence:**
  - 06 §3 draws `scheduled → cancelled` "(approved)". No `change_type` exists for it (05 §2.4 `CHECK`; 04 §2.1.1), so the transition cannot be implemented.
  - A lift is legal only from `active` (06 §3). A restriction that is time-effective but still stored `scheduled` therefore cannot be lifted until housekeeping runs. A late job delays a lift. This fails closed, but it is an availability defect.
- **Required correction:** add a governed cancel change type, or remove the transition. Allow a lift to apply to a time-effective `scheduled` row by performing the activation inline in the lift transaction. Add tests.
- **Implementation impact:** phase 4.

### ACC-01-R2-F08 — MEDIUM — Real-use gates G1–G6 duplicate CFG-01's environment-availability control (OQ-11)

- **Evidence:**
  - G1–G6 decide per **environment name** whether an ACC-01 operation is available: "UAT, DEMO, PRODUCTION and any unknown environment … refuse" (01 §4.5 L113).
  - They are "lifted only by an approved task", that is, an ACC-01 code change (01 L124; T-121).
  - That is structurally an `ENVIRONMENT_AVAILABILITY` control. Doc 00 §1.D assigns that state to **CFG-01 environment scope (MIG-004)**, which is implemented at the baseline (S10). Module Index §19 rule 7 says CFG-01 is the **sole** capability-eligibility authority.
  - G4 (freeze-ownership governance) and G6 (`FND-FIND-001` perimeter) have **no runtime dependency ACC-01 could test**. They can only ever be environment switches.
  - The pack's own defence ("safety interlocks, not capability flags", 01 §4.5; 17 OQ-11) is right about the **substance** of G1–G3 and G5: fail closed while a dependency's safety property is absent. It is wrong to key that substance on environment names.
- **Adjudication (not a decision):** see §8.
- **Required correction:**
  1. Split 01 §4.5 into **dependency preconditions** and **environment availability**.
     - **Dependency preconditions** stay in ACC-01. They are environment-agnostic and fail closed on absent evidence: the dedicated CLT-01 and IAM-02 credentials configured, and the general tokens forbidden (G3, R2-F05); an LED-01 attester configured with a declared contract version that supports barrier and attestation (G2/G5 — `ACC1_CLOSURE_ATTESTERS_UNCONFIGURED` already works this way); a declared IAM-02 contract version that enforces maker/checker entitlement (G1).
     - **Environment availability** is the "DEV/TEST only until …" dimension required by ACC-HD-2 and the RF-02 decision. Either ACC-01 **consumes CFG-01 `environment_scope`** (ACC-01 governed operations registered as CFG-01-owned availability entries; unreadable ⇒ deny; the readiness rule unchanged), **or** a human records an explicit, time-boxed **exception** authorising an ACC-01-local interlock with CFG-01 ownership acknowledged.
  2. Move G4 and G6 to go-live/deployment gates (file 14; IMP-02 perimeter) unless the human decides otherwise.
  3. Decide OQ-11 **before phase 0 approval**, because phase 0 builds the boot guards that would implement the interlock.
  4. Do **not** move capability ownership into ACC-01 in the meantime.
- **Implementation impact:** phase 0 boot-guard design; possibly a new ACC-01 → CFG-01 runtime read edge, which must not enter readiness.

### ACC-01-R2-F09 — INFO — Editorial inconsistencies

- README v0.2 L33 cites "file 17 §3" for the carried recommendations; they are at §4.2.
- Files 11 (L4) and 14 (L8) cite "open decisions of file 17 §3"; the pending decisions are §4.2 plus OQ-07/OQ-11/OQ-12.
- T-045 says "no cache in v0.1".
- 04 §5 says "not in v0.1 (HD-6)".
- 05 §2.2 states the name-uniqueness index twice.

Fix when next editing. Not blocking.

**Totals (new):** HIGH 1, MEDIUM 3, LOW 4, INFO 1.

## 7. Adversarial focus — results

| # | Focus | Result |
|---|---|---|
| 1 | IAM-02 entitlement | v0.2 no longer assumes maker/checker entitlement (S1–S3), and real-actor use is gated (G1). Residue: T-048/T-066 (**R2-F06**); actor binding at apply (**R2-F04**) |
| 2 | Closure safety | **Fails.** Drain is impossible and there is no exit (**R2-F01**). Master/default deadlock (**R2-F02**). Barrier masking (**R2-F03**). No "committed after seal" assertion and no latest-attestation rule (R2-F01 items 4–5). Seal-version races: none. The seal is set once, CAS on a one-way state, concurrent seals serialise on the row lock. Stale attestations: pre-seal attestations are correctly rejected. Master/child race: the listed set is re-checked at apply, but `trg_acc1_sa_owner` needs a lock (R2-F02 item 4) |
| 3 | Status semantics | `≠ active` ⇒ deny unless authoritative policy: **holds** (RF-04 closed). `blocked_scopes` is explanatory only: **holds**. Latent masking across components: **R2-F03** |
| 4 | CLT-01 credential boundary | Never designed to hold the general token: **holds** (ACC-REQ-031, T-146). Gate coverage and DEV/TEST path: **R2-F05** |
| 5 | Restriction ownership | Cross-client restriction unrepresentable: **holds** (RF-06 closed) |
| 6 | IAM-02 seam details | Fingerprint format, `current_payload_hash`, stored-payload recompute and verify-before-transaction: **correct**. Actor binding, token delivery, `approval_id` and step-up rationale: **R2-F04** |
| 7 | Scheduled restrictions / version evidence | A late job creates **no enforcement gap**: activation counts by time, and a lapse is conservative until housekeeping. Version evidence is complete (`versions` plus `applied_restriction_ids`). Cancel/lift gaps: **R2-F07** |
| 8 | Freeze ownership | Nothing invented; whole-client freeze and `login_block` remain ungoverned and gated (G4) |
| 9 | Runtime dependency cycles | Documented. Readiness makes no peer call. `scope-validate` does not re-enter IAM-02. No boot-order deadlock. R2-F08's CFG-01 option adds an edge, which must also stay out of readiness |
| 10 | Default subaccount | Not a permission, product, trading/payment or missing-subaccount fallback: **holds**. Explicit `subaccount_id`; `is_default` never returned by internal seams; missing ⇒ deny; T-122…125. Its **closure** rule deadlocks: **R2-F02** |
| 11 | G1–G6 / OQ-11 | See §8 and **R2-F08** |

## 8. OQ-11 / G1–G6 adjudication

**Question:** are G1–G6 fail-closed dependency preconditions, or is ACC-01 accidentally implementing a parallel capability-control system?

**Answer: both, mixed.** The finding is **R2-F08**. The *substance* of G1, G2, G3 and G5 is legitimate module-local fail-closed behaviour: refuse while a named dependency's safety property is absent. That is not capability control, and ACC-01 should keep it. The *form* is the problem:

- the gates are keyed on environment names;
- they are lifted by ACC-01 code changes;
- two of them (G4, G6) have no testable dependency at all.

In that form they are an ACC-01-owned `ENVIRONMENT_AVAILABILITY` matrix. That is a parallel control, contrary to Doc 00 §1.D (owner: CFG-01 `environment_scope`, MIG-004) and Module Index §19 rule 7.

**What the reviewer does not do:**

- It does **not** decide the owner.
- It does **not** move capability ownership into ACC-01.
- It does **not** treat the human decisions ACC-HD-2 and RF-02 ("DEV/TEST only until …") as wrong. Those decisions state **what** must be unavailable; OQ-11 is **who enforces the environment dimension**.

OQ-11 is a **pending human decision** and must be decided before phase 0 approval. The options are given in R2-F08 item 1.

## 9. Human decisions

**Treated as approved** — exactly the six rows of v0.2 file 17 §4.1:

- ACC-HD-1 (default subaccount structural only);
- ACC-HD-2 (no local roles; no real-actor apply until `IAM2-FIND-002`);
- ACC-HD-3 (subaccount limit is configuration, fail closed);
- the RF-02 decision (no void; creation DEV/TEST-only until the LED-01 attester);
- Closure safety (barrier → post-barrier attestation → close while the barrier is effective);
- Retention (no hard deletion; platform policy once defined).

v0.2 applies each faithfully. The corrections in R2-F01…F03 are needed to make the approved **closure-safety** decision achievable. They do not contradict it: an abort path never *closes* an account without the barrier.

**Still pending — not converted into decisions by this review:**

| Item | Status | Reviewer note |
|---|---|---|
| HD-4 no emergency single-actor restrict path | Recommendation (17 §4.2) | Unchanged |
| HD-5 single approval at request; machine-verified completion | Recommendation | Now bound up with OQ-12 and R2-F01 item 3 |
| HD-6 staff-initiated only; client surface read-only | Recommendation | Unchanged |
| HD-7 `A2-Q1`/`A2-Q2` gate client money, not build | Recommendation | Unchanged |
| HD-8 purpose set | Recommendation | Unchanged |
| HD-9 inert accounts for `active_limited` clients | Recommendation (substance applied under RF-04) | Unchanged |
| OQ-07 unseal / abort closure | Open | **Elevated** by R2-F01: a governed exit or ordering decision is needed before phase 5 |
| OQ-11 real-use gates in CFG-01 vs ACC-01 | Open | **Elevated** by R2-F08: decide before phase 0 approval |
| OQ-12 second approval for closure completion | Open | WF-27 steps 9–10 place maker (closure prepared) and checker (closure approved) **after** obligations are cleared (S11). The claim "unless the masters require otherwise" should be reconsidered against that text. The human decides |
| OQ-01…OQ-06, OQ-08, OQ-09 | Defaults in 17 §3 | Unchanged |
| DCR-ACC-GOV-04 content (status→activity policy) | External | Its closing-drain subset becomes a G5 prerequisite under R2-F01 |

## 10. Task-state adjudication

- The actual conductor was inspected read-only (`aix-conductor` `00a7bde`; `dist/records.js` built after `src/records.ts`):
  - `TRANSITIONS`: `PLANNING → {PLAN_READY, HUMAN_DECISION_REQUIRED, FAILED}`.
  - `implementation.ts` L252: implementation starts **only** from `PLAN_READY`.
- `validateTaskManifest` on the current `task.json` gives `{"ok":true,"errors":[]}`. State is `PLANNING`, so implementation-eligible = **false**.
- **Adjudication:** `PLANNING` is safe, schema-valid and correct for a REMEDIATE outcome. The next conductor step is a further planning round (v0.3), not `PLAN_READY`.
- `HUMAN_DECISION_REQUIRED` was considered and not chosen. The pending human decisions (OQ-07, OQ-11, OQ-12) are real, but the blocking items are ACC-01 blueprint defects the author can remediate. The human decisions can be taken alongside that remediation.
- **`task.json` is not modified by this review.** The strict schema does not require it. Its `findingsSummary` still lists RF-01…RF-11 as open; this record, not the manifest, carries the round-2 dispositions. `PLAN_READY` was **not** set, and implementation eligibility was **not** created.

## 11. Required before the next review

A pack **v0.3** (v0.1 and v0.2 left unaltered) that:

1. fixes **R2-F01…R2-F07** and notes **R2-F09**;
2. restructures the real-use gates per **R2-F08**, with OQ-11 decided by the human or explicitly carried as a phase-0 blocker;
3. updates file 17 with the changed DCR text: LED-01b/c, GOV-04 (closing-drain subset), CLT-03 / IAM-05 classification, and any new CFG-01 DCR;
4. leaves the six approved human decisions intact.

After that, a further **separate-context** re-review, then the pending human decisions. **Implementation is not authorised by this review.**
