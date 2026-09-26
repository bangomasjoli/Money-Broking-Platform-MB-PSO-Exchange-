# 05 Remediation — ACC-01: blueprint v0.2

- **Task ID:** ACC-01 (planning task; documentation only)
- **Remediating:** `04-review.md` — verdict **REMEDIATE**, reviewed commit `42316fe` (blueprint v0.1)
- **Starting HEAD:** `2e26d13` on `module/ACC-01`
- **Output:** `docs/02_modules/ACC-01/blueprint/v0.2/` (17 files + README). **v0.1 is unchanged** (reviewed historical pack).
- **Author:** blueprint planner / claude-sonnet-5 (effort not recorded — not invented)
- **Status:** **REMEDIATED / AWAITING RE-REVIEW.** Nothing is accepted. The remediation has **not** been re-reviewed and must be re-reviewed in a **separate context**; the same session family authored both the pack and this remediation.
- **Implementation authorised:** **No.**

## 1. Human decisions applied (approved by Aiman) — recorded, not re-decided

| Decision | Applied in v0.2 |
|---|---|
| ACC-HD-1 default `general` subaccount, structural only | 01 §8, ACC-REQ-018; 02 §3, §8; 04 (resolve needs explicit `subaccount_id`, no `is_default`); 10 T-122…125, T-139 |
| ACC-HD-2 no locally invented roles; Matrix + IAM-02 define maker/checker; no real-actor governed apply until `IAM2-FIND-002` fixed | 01 §4.5 (G1), ACC-REQ-038; 07 (local role table **removed**); 17 DCR-ACC-GOV-02, -IAM-03/-04/-05 |
| ACC-HD-3 subaccount limit is configuration; fail closed | 01 §6; 09 `ACC1_CONFIG_INVALID`; 10 T-131 |
| RF-02 no bypass/void; creation DEV/TEST-only until LED-01 attester | 01 §4.5 (G2), §9.2; 02 §7; 14 §2, §5; 10 T-121, T-133, T-134 |
| Preventive closure sequence | 01 §7; 02 §7; 06 §1; 05 (seal columns/trigger); 10 T-135…139 |
| Retention: no hard deletion; platform policy once defined | 01 ACC-REQ-017; 05 §7 rule 5b; 15 §3; 16; DCR-ACC-GOV-06; T-147 |
| Second human approval for closure: **not newly decided** | 02 §7 item 8; 17 OQ-12 |

HD-4, HD-6, HD-7, HD-8 and HD-9 remain *review-adjudicated recommendations*; they were **not** separately approved by a human in this turn and are labelled so (17 §4.2). HD-9's substance (inert `active_limited` accounts) is applied in v0.2 because the RF-04 remediation instruction specifies `active_limited` semantics; the HD itself is not recorded as approved.

## 2. Finding-by-finding evidence

State legend: **REMEDIATED** — the blueprint is corrected and nothing external is required for the correction to be complete. **CARRY-FORWARD / REQUIRES EXTERNAL OWNER** — the blueprint is corrected, but real use or full closure depends on a change owned by another module or governance owner. No external module has changed.

| Finding | Severity | State | Corrected sections (v0.2) | External dependency (not done here) |
|---|---|---|---|---|
| **RF-01** IAM-02 entitlement gap | HIGH | **CARRY-FORWARD / REQUIRES EXTERNAL OWNER** (blueprint corrected) | 02 §0 (source-verified facts; v0.1 claim withdrawn); 01 ACC-REQ-023, §4.5 G1, §16; 07 §1, §3, §3.1 (proposed pattern); 10 T-060 rewritten, T-127, T-128; 12 risk 7, 15; 14 §2 G1; 17 DCR-ACC-IAM-03/-04/-05 | IAM-02 owns `IAM2-FIND-002` fix and the entitlement pattern; platform-wide dimension to be considered when the finding row is next revised (`OPEN_FINDINGS.md` **not** modified here) |
| **RF-02** wrongly-created-account contradiction | MEDIUM | **CARRY-FORWARD / REQUIRES EXTERNAL OWNER** (blueprint corrected) | 01 §4.5 G2, §6 (`closing` rows still count), §9.2 (contradiction removed; lifecycle stated); 02 §3, §4, §7; 05 §2.2; 10 T-018, T-021, T-133, T-134; 12 risk 25; 14 §5 | LED-01 attester (DCR-ACC-LED-01c) gates real creation |
| **RF-03** attest-then-close race | MEDIUM | **CARRY-FORWARD / REQUIRES EXTERNAL OWNER** (blueprint corrected) | 01 ACC-REQ-016/030, §7; 02 §7 (barrier → post-barrier attestation → CAS; master vs children); 03 §5; 05 seal columns, `trg_acc1_seal`, attestation columns; 06 §1, §5; 04 §2.4; 09; 10 T-077…084, T-135…139; 12 risk 11; 13 R-6, R-8 | LED-01 barrier + attestation contract (DCR-ACC-LED-01c, updated) |
| **RF-04** `blocked_scopes` fail-open | MEDIUM | **REMEDIATED** | 01 ACC-REQ-039, §10; 06 §2.0 (consumer rule), §2.1 (`active_limited`/`restricted` ⇒ report-only, settlement and Exchange access included), §2.2 (scopes explanatory); 04 §3.1 (`scope_semantics`, no permit field); 09 §3; 10 T-036/037/041/140/141; 12 risk 26 | Authoritative status→activity policy is a separate governance item (DCR-ACC-GOV-04); until it exists consumers **deny**, so the blueprint is complete |
| **RF-05** CLT-01 credential | MEDIUM | **CARRY-FORWARD / REQUIRES EXTERNAL OWNER** (blueprint corrected) | 01 §2, §13, ACC-REQ-031, §4.5 G3; 04 §1; 07 §3 point 4; 10 T-146; 12 risk 27; 17 DCR-ACC-CLT-03 (+ IAM-02 analogue DCR-ACC-IAM-05); `01-plan.md` claim corrected | CLT-01 must provide a dedicated read-scoped credential |
| **RF-06** restriction owner binding | LOW | **REMEDIATED** | 05 §2.2 (`UNIQUE (subaccount_id, master_account_id, client_id)`), §2.3 (two composite FKs); 03 §1; 10 T-145; 12 risk 28; 13 R-8 | — |
| **RF-07** IAM-02 mechanics | LOW | **REMEDIATED** | 02 §1 (IAM-02 fingerprints the payload; `sha256:`+64 hex; operator creates the approval; token to the maker), §2 (apply bound to stored maker; `current_payload_hash`, `actor_id`, `approval_id`, `entity_id`, `client_id`; token-consumed-after-verify; any post-verify failure ⇒ row stays `requested`, fresh approval); 04 §2.1; 05 §2.4 (`payload_hash varchar(80)`, states reduced, `applying`/`verification_ref` removed); 06 §4; 07 §4; 10 T-055…058, T-129, T-130 | — (mirrors CLT-01 `routes/decisions.ts` and CFG-01; no new seam) |
| **RF-08** scheduled-restriction timing and evidence | LOW | **REMEDIATED** | 01 ACC-REQ-041; 02 §5 item 6; 06 §3 (time-effective rule; **one** version design: every restriction change bumps the target `version`, resolve returns both versions **plus** `applied_restriction_ids`); 05 `trg_acc1_restriction_version`, §7 rule 5/5a; 04 §3.1; 10 T-142…144; 12 risk 29 | — |
| **RF-09** freeze ownership | LOW | **CARRY-FORWARD / REQUIRES EXTERNAL OWNER** (blueprint corrected: nothing invented) | 01 §2 row, §4.5 G4, §15; 02 §5; 06 §3; 15 (FRZ-RULE row); 09 `ACC1_SCOPE_NOT_APPLICABLE`; 10 T-151, T-152; 12 risk 31; 17 DCR-ACC-GOV-05 | Owner of whole-client freeze and `login_block`, and the CLT-01/ACC-01 relationship, need governance; real phase-4 use is gated |
| **RF-10** DCR classification and dependencies | LOW | **REMEDIATED** | 17 §1 (five classes) and §2 (every DCR classified; LED-01 split a/b/c/d; IAM-02 split a/b/c); 01 §13 (runtime dependencies, incl. ACC ↔ CLT-01, ACC ↔ LED-01, ACC → IAM-02 → ACC re-entrancy); 03 §6; 04 §3.4 and 01 ACC-REQ-040 (readiness = configuration/contract only, no peer call); 10 T-126, T-132 | — |
| **RF-11** client check is not an eligibility authority | INFO | **REMEDIATED** | 01 ACC-REQ-013, §2, §4.6; 02 §3; 09 (`ACC1_CLIENT_*` notes); 15 (§10.2A row); 10 T-044, T-150 | — |

## 3. `task.json` normalisation — verified against the actual local `aix-conductor`

Inspected (read-only): `src/types.ts` (`TASK_STATES`, `TaskManifest`, `AgentSelection`), `src/state.ts` (`TRANSITIONS`), `src/records.ts` (`validateTaskManifest`), `src/planningCheckpoint.ts`, `src/implementation.ts` (implementation gate).

Findings that override the previous turn's assumption:

1. **`PLAN_READY` is the only implementation-eligible state.** `implementation.ts` line 252: `if (manifest.state !== 'PLAN_READY') … implementation starts only from PLAN_READY`. The previous review set `PLAN_READY`. That was **wrong for a REMEDIATE verdict**: it made ACC-01 implementation-eligible. Corrected here.
2. **`PLANNED` is not a state; `IDLE` is pre-planning.** `TRANSITIONS`: `IDLE → PLANNING`; `PLAN_READY → {APPROVED_FOR_IMPLEMENTATION (gate `start_implementation`), PLANNING (ungated), HUMAN_DECISION_REQUIRED, FAILED}`; `PLANNING → {PLAN_READY, HUMAN_DECISION_REQUIRED, FAILED}`.
3. **The manifest is strict.** `validateTaskManifest` rejects unknown keys, strings over 300 characters, `planner`/`reviewer` roles outside `LOGICAL_AGENT_ROLES`, efforts outside `LOGICAL_EFFORTS`, and `relevantRecordPaths` outside `docs/03_implementation/tasks/ACC-01/`. The committed `2e26d13` `task.json` **failed** it with 8 `unknown key` errors (`statusNote`, `proposedFindings`, `pendingHumanDecisions`, `dependencyChangeRequests`, `reviewVerdict`, `reviewedCommit`, `reviewFindings`, `hdAdjudication`).

**Final state: `PLANNING`.** A REMEDIATE plan returns from `PLAN_READY` to `PLANNING` (an ungated transition that counts a planning round — `roundCounts.planning` 1 → 2). `PLANNING` can reach `PLAN_READY` only by a future conductor step, after re-review; from `PLANNING` there is **no** path to `APPROVED_FOR_IMPLEMENTATION`. Implementation is therefore **not** eligible. (`HUMAN_DECISION_REQUIRED` was not chosen: this turn's blockers are review/remediation loops, not an open human decision; the human decisions that remain are carried in file 17.)

Other normalisations, each limited to what the schema can carry:

| Field | Value | Reason |
|---|---|---|
| `planner` | `null` | The planner effort was never recorded; **not invented**. Provenance (Sonnet authoring) is in this file and `01-plan.md` |
| `reviewer` | `high_risk_reviewer / claude_code / claude-opus-5-5 / HIGH` | Stated by the review assignment; role name is the conductor's |
| `selectedEfforts` | `{ high_risk_reviewer: HIGH }` | Matches the reviewer selection only |
| `roundCounts.review` | `0` | The conductor counts a review round on **entering `REVIEWING`**, which never happened; the independent review is recorded in `04-review.md`. The previous `1` was an invention (noted in that turn's `statusNote`, now removed) |
| `findingsSummary.open` | HIGH 1, MEDIUM 4, LOW 5 | Findings stay **open until a re-review closes them**; the INFO finding (RF-11) has no severity slot. `openFindingIds` RF-01…RF-11 |
| `findingsSummary.carryForwardIds` | RF-01, RF-02, RF-03, RF-05, RF-09 | Externally gated (§2) |
| `relevantRecordPaths` | `01-plan.md`, `04-review.md`, `05-remediation.md` | The validator rejects paths outside the task folder (the previous `docs/02_modules/…` entries were invalid) |
| Removed | `statusNote`, `reviewVerdict`, `reviewedCommit`, `reviewFindings`, `hdAdjudication`, `proposedFindings`, `pendingHumanDecisions`, `dependencyChangeRequests` | Not accepted by the validator. Their content is preserved in `04-review.md` (verdict, findings, HD adjudication), this file, and blueprint file 17 (HD/DCR/proposed findings) |

The human-readable status **REMEDIATED / AWAITING RE-REVIEW** lives in Markdown (module README, blueprint v0.2 README, this file), because the manifest cannot carry it.

### Conductor validator result

Run against the final `task.json` with the actual conductor code (`/Users/AimanRahimi/aix-conductor/dist/records.js` → `validateTaskManifest`, built after `src/records.ts`; the conductor repository was not modified):

```txt
final task.json                         -> {"ok":true,"errors":[]}
implementation-eligible (state==PLAN_READY) -> false
control: same manifest + statusNote key -> ok:false, "unknown key: statusNote"
previous committed task.json (2e26d13)  -> ok:false, 8 errors (unknown keys listed above)
```

## 4. Scope statement

No `platform/**`, no migration, no test code, no IAM-02/CLT-01/LED-01 change, no master or register change, no `OPEN_FINDINGS.md`/`DECISION_LOG.md` edit, no `main` change, no merge. `04-review.md` is a historical record and is left as written; its §8 `PLAN_READY` correction is **superseded** by §3 above. **No claim is made that any external module has changed.**

## 5. Remaining external blockers (all recorded in file 17)

IAM-02: `IAM2-FIND-002` incl. step-7 short-circuit; entitlement pattern; approval policy rows; scoped credentials. CLT-01: dedicated read credential; closure guard; `restricted` scope. LED-01: DEC-011 consumption and schema freeze; barrier + post-barrier attestation. Governance: Role Matrix maker/checker rows; freeze ownership; status→activity policy; retention policy; registers. FND-01: rate-limit consumer secret; `FND-FIND-001`. CFG-01: condition-9 consumption; possible ownership of the real-use gates (OQ-11).

## 6. Next steps (none started)

1. **Separate-context re-review** of v0.2 against `04-review.md` and the approved decisions (checking, in particular, the closure barrier design, the real-use gates and their OQ-11 question).
2. On re-review ACCEPT: conductor step `PLANNING → PLAN_READY`, then the remaining human decisions (17 §4.2, OQ-12), then governance follow-ups (DCR-ACC-GOV-01/-02/-03).
3. Only then an approved implementation task per phase (blueprint file 11). The external DCRs proceed in their owning modules on their own timelines.
