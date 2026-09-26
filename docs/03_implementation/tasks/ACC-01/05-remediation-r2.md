# 05 Remediation record (round 2) — ACC-01: Account Structure blueprint pack v0.3

- **Task ID:** ACC-01 (planning task — blueprint pack, **documentation only**)
- **Author:** blueprint planner / claude-sonnet-5 (the model that authored v0.1 and v0.2)
- **Review remediated:** [`04-review-r2.md`](04-review-r2.md) — v0.2 at `8ff4e9d`, separate-context review, verdict **REMEDIATE** (recorded at `b5c21bd`)
- **Output:** `docs/02_modules/ACC-01/blueprint/v0.3/` (v0.1 and v0.2 are **unmodified** historical reviewed evidence)
- **Status of v0.3:** **REMEDIATED / AWAITING RE-REVIEW.** Nothing is accepted. **Implementation is not authorised.** No application code, no migration, no test was written or changed. **No other module changed** — every IAM-02, CLT-01, LED-01, CFG-01, FND-01 and governance change below is a *request* (file 17), not a delivered fact.
- **Independence caveat:** this remediation was written by the same model family that authored the pack. It is not evidence of correctness. A further **separate-context re-review** is required before any human acceptance.

## 1. Human decisions recorded (ACC-R2-HD-01 … 08, approved by Aiman)

Recorded as a new table in v0.3 (file 17 §4.3; summarised in the v0.3 README). They do not overwrite or reinterpret ACC-HD-1/2/3, RF-02, Closure safety or Retention (file 17 §4.1, unchanged).

| ID | Decision (short) | Principal v0.3 locations |
|---|---|---|
| ACC-R2-HD-01 | Closure draining: `closing` permits only an explicit closure-drain allow-list (CDA-1…CDA-5); fail closed; not a generally active state | 01 §7.1, §10; 06 §2.0; 02 §7.2; T-158/159 |
| ACC-R2-HD-02 | Final checker approval immediately before the seal; post-seal machine-verified; no second checker | 01 §7; 02 §7.3–§7.6; 03 §5; T-166…169 |
| ACC-R2-HD-03 | Governed abort/unseal from `closing` or `closure_sealed`; maker-checker; Critical audit; barrier cleared only there | 01 §7.3; 02 §7.7; 05 §2.8, §5; T-174…179 |
| ACC-R2-HD-04 | Master + default subaccount enter `closing` atomically; all children (default included) close before the master seals | 01 §7, §8; 02 §7.1, §7.8; 05 §5; 06 §1 rule 7; T-160…165 |
| ACC-R2-HD-05 | `closure_barrier` is an independent fact; consumer order barrier → structure → policy | 01 §10; 04 §3.1; 05 §2.1; 06 §2; T-153…157 |
| ACC-R2-HD-06 | CFG-01 owns environment availability; ACC-01 enforces only environment-agnostic `DEP-*`; test doubles are dependency injection | 01 §4.5; 14 §2; T-111, T-112, T-121, T-188…191 |
| ACC-R2-HD-07 | No claim IAM-02 binds the apply actor; explicit IAM-02 dependency; real governed apply gated; no faking from `actor_id` | 02 §0, §1; 04 §2.1; 07 §4; DCR-ACC-IAM-06; T-130, T-180…185 |
| ACC-R2-HD-08 | Least-privilege peer credentials in every environment; no temporary broad token | 01 §2, §4.5; 04 §1; DCR-ACC-CLT-03, -IAM-05; T-146, T-186…188 |

**Resolved open questions:** OQ-07 (by ACC-R2-HD-03), OQ-11 (by ACC-R2-HD-06), OQ-12 (by ACC-R2-HD-02) — file 17 §3.

**Earlier recommendations not silently approved.** HD-4, HD-6, HD-7, HD-8, HD-9 remain **PENDING** recommendations. HD-5 is **superseded in substance** by ACC-R2-HD-02 (the approved model differs from HD-5) and is *not* approved as written. One new **non-blocking pending** question, **OQ-13**, records an ambiguity in ACC-R2-HD-02: whether closure *initiation* itself needs a checker approval. v0.3's default keeps initiation as a governed change request (ACC-REQ-012) and does not treat it as the final approval; the human may decide otherwise.

## 2. R2-F01 … R2-F09 → corrected v0.3 sections

Status vocabulary: **BLUEPRINT REMEDIATED** = corrected in v0.3, awaiting independent re-review (not closed); **EXTERNAL GATE REMAINS** = the blueprint side is done but an external module must deliver.

| Finding | Sev | Status | Correction (v0.3 sections) |
|---|---|---|---|
| **R2-F01** funded account can never drain or exit | HIGH | **BLUEPRINT REMEDIATED** (LED-01 contract itself is an **EXTERNAL GATE**: DCR-ACC-LED-01c/-01e, `DEP-LED-CLOSURE-CONTRACT`) | (1) Closure-drain allow-list → 01 §7.1, ACC-REQ-043, 06 §2.0, DCR-ACC-LED-01e. (2) Pre-seal readiness (balance none/returned, no open withdrawal/settlement, no blocking break, no unaccounted in-flight, child conditions) as a seal precondition → 01 §7.2; 02 §7.3–§7.4; 05 §2.6 (`closure_readiness`), `trg_acc1_seal`; 06 §5; `ACC1_CLOSURE_NOT_READY`; T-166…168. (3) Governed abort → 01 §7.3; 02 §7.7; 05 §2.8; 06 §1; T-174…179 (resolves OQ-07). (4) DCR-ACC-LED-01c tightened: seal version, journal watermark, `max_resolution_version_committed`, in-flight status, fence, fresh evidence; resolved-before/committed-after race detected by version/watermark, no wall-clock primary control → 01 §7.2; 17 DCR-ACC-LED-01c; 05 §2.7; T-170, T-171. (5) **Latest** attestation per target + attester + current seal version; blocked ⇒ governed recovery → 01 §7.2; 02 §7.5–§7.6; 05 `trg_acc1_seal`; T-172, T-173, T-179. (6) Final human approval timing per WF-27 (resolves OQ-12) → 02 §7.4; 15 |
| **R2-F02** master/default deadlock | MEDIUM | **BLUEPRINT REMEDIATED** | Master + default enter `closing` atomically; default follows ordinary child rules; master seals only after **all** children closed → 01 §7, §8; 02 §7.1, §7.8; 05 §5 (`trg_acc1_default_protected` replaced, `trg_acc1_seal`, new deferred `trg_acc1_closure_family`); 06 §1 rules 6–8, §6; 09 `ACC1_DEFAULT_SUBACCOUNT_PROTECTED`; 13 R-8. Concurrency: `create_subaccount` reads the master `FOR SHARE` (A4 and `trg_acc1_sa_owner`); master in `closing`+ rejects new children → 01 §8; 02 §4; 05 §5; T-164/165. Tests: T-031/T-139 rewritten; T-160 master-with-only-default closes |
| **R2-F03** barrier masked by worst-of status | MEDIUM | **BLUEPRINT REMEDIATED** | Independent stored `closure_barrier` + closure/seal evidence + `restriction_status` + `closure_draining` returned by resolve → 04 §3.1; 05 §2.1; 06 §2.3. Consumer order barrier → conjunctive components → policy; `effective_status` descriptive → 01 §10; 06 §2.0. DCR-ACC-LED-01c/-01b say "refuse every new posting when `closure_barrier = true`" → 17. DCR-ACC-GOV-04 defined over components; `closure_sealed`/`closed` never authorisable. Tests barrier + suspended / frozen / restriction: T-153…157 |
| **R2-F04** apply actor binding | LOW | **BLUEPRINT REMEDIATED**; **EXTERNAL GATE** for real apply (DCR-ACC-IAM-06, `DEP-IAM-ACTOR-BINDING`) | False claims withdrawn (see §4); token delivery corrected (returned to the approve caller); `approval_id` labelled caller-asserted (`approval_id_source`); step-up ordering corrected (step 6 before step 7; catalogue does not set `requires_step_up` because the baseline would block every actor) → 02 §0, §1; 07 §2, §3, §4; 05 §2.4; 13 R-7. Target contract binding `approval_id`, authenticated actor, maker, checker, `policy_id`, `payload_hash`, action, resource, entity/client scope → 04 §2.1.1; 07 §4.1; 17 DCR-ACC-IAM-06. Tests T-130 rewritten, T-180…185 |
| **R2-F05** credential gate coverage | LOW | **BLUEPRINT REMEDIATED**; **EXTERNAL GATE** for real credentials (DCR-ACC-CLT-03, -IAM-05) | `DEP-CLT-READ-SCOPE` required by resolve, batch, submit, **every apply** (create/close/seal/abort/restrict/lift/cancel) and R-3; not modelled as production-only; DEV/TEST use labelled doubles or dedicated scoped test credentials; general tokens forbidden in every environment; same for IAM-02 → 01 §2, §4.5; 04 §1; 13; 14 §4; 17 DCR-ACC-CLT-03/-IAM-05. Tests T-146, T-186…188 |
| **R2-F06** residual entitlement tests | LOW | **BLUEPRINT REMEDIATED** | T-048 and T-066 rewritten (non-approval codes deny; approval-gated codes are `KNOWN_GAP_IAM2_FIND_002` with the external `DEP-IAM-ENTITLEMENT` gate). Whole-pack sweep found and fixed: T-050 (bound-to-maker claim), T-127 (environment gate), T-130 (different-caller claim), 07 §4 item 1, 02 §0/§1, 03 §2, 04 §2.1, 11 item 4, 12 risk row 7. New rows T-181, T-189 test the honest baseline plus the gate |
| **R2-F07** restriction lifecycle | LOW | **BLUEPRINT REMEDIATED** | `cancel_scheduled_restriction` (governed; not-yet-effective only) and lift of a time-effective restriction still stored `scheduled` (inline activation in the lift transaction); legality decided by effective time only, never by housekeeping → 02 §6; 04 §2.1.1; 05 §2.3, §2.4, §5; 06 §3; 07 §2; 08; 09. Tests T-192…198 |
| **R2-F08** parallel environment control | MEDIUM | **BLUEPRINT REMEDIATED** (environment availability is CFG-01's: DCR-ACC-CFG-02, no change delivered) | G1–G6 withdrawn; environment names removed from gating logic; named environment-agnostic prerequisites `DEP-IAM-ACTOR-BINDING`, `DEP-IAM-ENTITLEMENT`, `DEP-IAM-SCOPED-CREDENTIAL`, `DEP-CLT-READ-SCOPE`, `DEP-LED-CLOSURE-CONTRACT`, `DEP-FREEZE-GOVERNANCE`, `DEP-PUBLIC-PERIMETER`; test doubles are explicit dependencies; `ACC1_REAL_USE_NOT_PERMITTED` → `ACC1_DEPENDENCY_NOT_SATISFIED` → 01 §4.5, ACC-REQ-035/047, §12, §16; 04; 07; 08; 09; 14 §2; 17. OQ-11 resolved. Tests T-111, T-112, T-121, T-188…191. **Honesty note:** for `DEP-FREEZE-GOVERNANCE` and `DEP-PUBLIC-PERIMETER` (type G) ACC-01 can check only that a governance reference is declared, not that the record is truly closed (01 §4.5) |
| **R2-F09** editorial | INFO | **BLUEPRINT REMEDIATED** | README "file 17 §3" → 17 §4.2 + §3/OQ refs (v0.3 README, 11, 14); T-045 "no cache in v0.1" → v0.3; 04 §5 "not in v0.1 (HD-6)" → "not in this version"; 05 §2.2 duplicate name-uniqueness statement merged; file headings and version cross-references updated |

**Consistency checks run on v0.3:** relative-link check across all v0.3 files and the module README (all resolve, including this record); grep for withdrawn/stale phrases (`G1`–`G6`, `REAL_USE`, "real-use", `in_flight_predating`, "different caller cannot", "bound to the stored maker", "no unseal", "only after its master", "unknown environment ⇒ PRODUCTION", "17 §3"). Remaining hits are intentional negations or historical notes.

## 3. RF-01 … RF-11 — updated dispositions

Vocabulary: **CLOSED** (closed in blueprint by the round-2 review and not regressed), **EXTERNAL GATE REMAINS**, **SUPERSEDED**, **BLUEPRINT REMEDIATED** (corrected in v0.3, awaiting re-review). Nothing here claims an external module changed.

| RF | Round-2 disposition | v0.3 status | Note |
|---|---|---|---|
| RF-01 IAM-02 entitlement | EXTERNAL GATE REMAINS | **EXTERNAL GATE REMAINS** — plus R2-F06 residue **BLUEPRINT REMEDIATED** | Gate is now `DEP-IAM-ENTITLEMENT` (no environment logic). `IAM2-FIND-002` is IAM-02's and is **not** closed by this pack |
| RF-02 mistaken-creation deadlock | EXTERNAL GATE REMAINS | **EXTERNAL GATE REMAINS** | Creation needs `DEP-LED-CLOSURE-CONTRACT` (LED-01 contract external). The "closure and re-creation" path for a master is now reachable (R2-F02). Approved RF-02 decision preserved; its environment dimension belongs to CFG-01 |
| RF-03 attest-then-close race | SUPERSEDED by R2-F01/F03 | **SUPERSEDED** — replaced by the R2-F01/F03 design (**BLUEPRINT REMEDIATED**) | Not re-opened as RF-03; tracked as R2-F01/F03 |
| RF-04 `blocked_scopes` fail-open | CLOSED IN BLUEPRINT | **CLOSED** — not regressed | The consumer rule is *strengthened* (barrier first, conjunctive components); `blocked_scopes` still explanatory only; T-036/037/041/140/141 intact |
| RF-05 CLT-01 credential | EXTERNAL GATE REMAINS | **EXTERNAL GATE REMAINS** | Gate is `DEP-CLT-READ-SCOPE`; coverage and every-environment least privilege fixed (R2-F05, **BLUEPRINT REMEDIATED**); credential is CLT-01's to deliver |
| RF-06 restriction owner binding | CLOSED IN BLUEPRINT | **CLOSED** — not regressed | 05 §2.3 composite FKs unchanged (new cancel columns added without touching them); T-145 |
| RF-07 IAM-02 seam mechanics | SUPERSEDED by R2-F04 | **SUPERSEDED** — replaced by R2-F04 (**BLUEPRINT REMEDIATED**; real apply **EXTERNAL GATE**, `DEP-IAM-ACTOR-BINDING`) | Fingerprint/`current_payload_hash` mechanics retained (verified correct in round 2) |
| RF-08 scheduled-restriction timing | CLOSED IN BLUEPRINT | **CLOSED** — not regressed; R2-F07 lifecycle gaps **BLUEPRINT REMEDIATED** | Time-effective rule and version evidence unchanged; cancellation bumps `version` too |
| RF-09 freeze ownership | EXTERNAL GATE REMAINS | **EXTERNAL GATE REMAINS** | Gate is `DEP-FREEZE-GOVERNANCE` (type G, DCR-ACC-GOV-05); nothing invented; T-151/152 |
| RF-10 DCR classification / dependencies | CLOSED IN BLUEPRINT | **CLOSED** — not regressed | Five classes retained; new DCRs classified (IAM-06, LED-01e, CFG-02, CONS-01); readiness still makes no peer call (T-132, T-191); classification point for credentials resolved by R2-F05 |
| RF-11 not an eligibility authority | CLOSED IN BLUEPRINT | **CLOSED** — not regressed | 01 §4.6, ACC-REQ-013, T-150 unchanged |

## 4. Claims withdrawn or corrected in v0.3

- "Apply is bound to the stored maker / a different caller cannot apply / `actor_id = stored requested_by` proves the actor" — **withdrawn** (false under today's seam; 02 §0).
- "The decision token is minted to the maker" — **corrected**: the current seam returns it to the approve caller.
- "`approval_id` is verified by execute-verify" — **withdrawn**: accepted but never verified or returned; recorded as `caller_asserted`.
- "`guard.ts` returns `approval_required` before `step_up_required`" — **corrected**: step-up (step 6) precedes approval (step 7).
- "One early approval covers the whole closure sequence" — **withdrawn** (WF-27 steps 9–10; ACC-R2-HD-02).
- "The barrier remains effective by construction" / "no unseal in this version" — **replaced** by the independent barrier and the governed abort.
- "The default closes only with (after) its master" — **withdrawn** (deadlock); replaced by ACC-R2-HD-04.
- "Real-use gates G1–G6 keyed on environment names" — **withdrawn** (ACC-R2-HD-06).
- "DEV/TEST may hold general peer credentials" — never stated as a rule, but left unsaid in v0.2; now **explicitly forbidden** (ACC-R2-HD-08).

## 5. Design choices the reviewer may want to test

These are v0.3 authoring decisions inside the approved decisions, not new decisions:

1. **Pre-seal readiness is evidence, not a status**, so the seven-status vocabulary is unchanged.
2. **`committed_after_preseal_watermark = 0` is strict:** any posting after the readiness the checker approved blocks completion and needs a governed abort and re-drain. This is conservative and closes the resolved-before/committed-after race without wall-clock assumptions.
3. **Abort scope:** a child of a `closing`/`closure_sealed` master, and the default alone, cannot be aborted independently; a master abort returns the master and every listed non-closed child; already-`closed` children stay `closed`, so a master may end with a closed default (harmless: nothing resolves "the default").
4. **Completion and evidence collection use non-approval permission codes** (`*.close_complete`, `*.close_collect_evidence`), so they reach guard step 10 — a real entitlement — unlike the approval-gated codes.
5. **`DEP-IAM-SCOPED-CREDENTIAL`** is an added seventh dependency beyond the six named examples, needed by ACC-R2-HD-08.
6. **Type-G dependencies** (`DEP-FREEZE-GOVERNANCE`, `DEP-PUBLIC-PERIMETER`) rest on a declared governance reference; ACC-01 cannot verify the underlying record.

## 6. Task manifest and conductor state

- `task.json` kept in **`PLANNING`** — valid for a remediation/planning turn (`TRANSITIONS`: `PLANNING → PLAN_READY | HUMAN_DECISION_REQUIRED | FAILED`; implementation starts only from `PLAN_READY`). **`PLAN_READY` was not set; implementation is not eligible.** `acceptanceStatus` remains `NOT_ACCEPTED`.
- Normalised to the strict schema with no custom keys. `roundCounts.planning` set to **3** (v0.1, v0.2, v0.3). The conductor's `maxPlanningRounds` is **3**, so a further planning round would exceed the limit and route to `HUMAN_DECISION_REQUIRED` — the human should know this before ordering another remediation.
- `findingsSummary` updated (strict schema has no INFO severity): open = RF-01, RF-02, RF-05, RF-09 (external gates) and R2-F01…F09 (blueprint remediated, open until independently re-reviewed) → HIGH 2, MEDIUM 5, LOW 5 (R2-F09 is INFO and listed by id only). `carryForwardIds` = RF-01, RF-02, RF-05, RF-09. RF-03/RF-07 (superseded) and RF-04/06/08/10/11 (closed) removed from open.
- `relevantRecordPaths` now includes `04-review-r2.md` and this record.
- **Validator:** `validateTaskManifest` (aix-conductor `dist/records.js`, HEAD `00a7bde`, not modified) on the updated `task.json` → `{"ok":true,"errors":[]}`.

## 7. What this record does not do

It does not accept anything, create `06-acceptance.md`, set `PLAN_READY`, modify any master, register (`OPEN_FINDINGS`, `DECISION_LOG`, `CURRENT_STATE`, `DOCUMENT_REGISTER`, `MODULE_STATUS`), `platform/**`, migration, IAM-02, CLT-01, LED-01, CFG-01, or `main`. A human promotes findings and decisions to the registers.
