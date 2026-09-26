# ACC-01 Account Structure
## 11 Claude Prompt — FUTURE implementation brief (v0.3)

> **NOT AUTHORISED.** This is a template for a *future* implementation task. It may be used only after (1) this pack has passed a **separate-context re-review** and is human-approved, (2) the still-pending human decisions — file 17 §4.2 (HD-4, HD-6…HD-9) and the open questions of §3 (OQ-13 and the defaults) — are decided or explicitly deferred, and (3) the specific phase has its own approved task record under `docs/03_implementation/tasks/`. Until then no code, migration or test may be written for ACC-01.

## Per-phase brief (fill the `<…>` from the approved task record)

```txt
Task: ACC-01 phase <n> — <title>            Task ID: <approved id>
Baseline: <commit>          Blueprint: docs/02_modules/ACC-01/blueprint/<approved version>/
Decisions consumed: DEC-011, DEC-013, DEC-014 (+ any DEC recorded for ACC-01)
Model role: <per CLAUDE_CODE_USAGE_RULES — Opus for money/security/compliance review; Sonnet for coding>

You are implementing ONE phase of ACC-01 and nothing else.

OWNERSHIP
May modify: platform/services/acc1/**, its own tests, its own migration(s) and
the iam2-scoped catalogue migration named in the task, docs/02_modules/ACC-01/**,
docs/03_implementation/tasks/<id>/**.
May inspect, MUST NOT modify: CLT-01, IAM-02, CFG-01, AST-01, LED-01, SEC-01,
shared foundation, any other service. If another module must change: STOP and
record a dependency-change request (file 17). Do not "just fix it".

NON-NEGOTIABLES (each is a test in file 10)
1. ACC-01 owns master account and subaccount ONLY. No legal-entity data, no
   membership, no ledger account, no balance, no amount, no ledger identifier.
2. Owner (client_id, master_account_id, purpose) immutable from creation:
   column grants + trigger + composite FK. Subaccount owner derived by trigger.
   Restrictions bound to the real owner by composite FKs (incl. subaccount).
3. No cross-schema FK; role_acc1_runtime has zero grants outside acc1; no DELETE.
4. Every create/close-initiation/seal/abort/restrict/lift/cancel-scheduled-
   restriction is a change request mirroring CLT-01 approve/apply: canonical
   payload + fingerprint stored ("sha256:"+64 hex); an operator creates the
   IAM-02 approval with that payload (IAM-02 fingerprints it itself; ACC-01
   never sends a hash); recompute the hash from the STORED payload; verify
   BEFORE the local transaction; ANY failure after verify rolls back and leaves
   the row 'requested' (a FRESH approval is needed). NO 'applying' /
   'verification_ref' invention.
   IAM-02 today does NOT entitlement-check makers/checkers (IAM2-FIND-002;
   guard step 6 step-up precedes step 7 approval, which precedes the step-10
   role lookup) and does NOT authenticate the apply actor (execute-verify
   actor_id is a body field; approval_id is never verified or returned). NEVER
   claim otherwise and NEVER fake the proof with a caller-supplied actor_id.
   Real governed apply needs the IAM-02 actor-binding contract (DEP-IAM-ACTOR-
   BINDING, DCR-ACC-IAM-06): consume ATTESTED facts only. Build and test against
   explicit labelled test doubles of that target contract. Assign NO roles.
4a. NO ENVIRONMENT LOGIC. ACC-01 implements no environment-availability control
   (CFG-01 owns it). Enforce only the environment-agnostic DEP-* prerequisites
   of file 01 §4.5 (ACC1_DEPENDENCY_NOT_SATISFIED). Never write
   `if environment == ...`. Test doubles are injected at a TEST composition
   root only; the production composition root imports none; no config selects one.
5. Effective status computed live; unknown/unreadable => 'unknown'/503, never
   allow. NO cache. Never fan restriction state out to children.
   resolve returns closure_barrier (independent stored fact), closure_draining,
   restriction_status per level, closure/seal evidence, applied_restriction_ids.
   CONSUMER ORDER: (1) closure_barrier=true => DENY everything, never masked by
   any effective_status; (2) components conjunctive, closing => closure-drain
   allow-list only; (3) product policy. effective_status is DESCRIPTIVE.
   blocked_scopes is EXPLANATORY ONLY; active_limited / restricted client =>
   report-only. Scheduled restrictions are effective BY TIME; the job is
   housekeeping and NEVER decides whether a restriction can be lifted (lift a
   time-effective row inline) or cancelled (cancel_scheduled_restriction only
   while not yet effective). Every restriction change bumps the target version.
6. Every state change: legal-transition trigger, history row with cause, SEC-01
   audit; unrecordable audit => refuse the mutation.
7. Nothing is named or used as an 'enabled' capability boolean. Never read or
   write cfg1.feature.current_state / environment_scope. A permission, purpose,
   default subaccount or account status never activates anything.
8. No route path contains a fragment rejected by assertNoExchangeRuntime.
9. Import nothing from another services/* directory; peers are HTTP through
   ACC-01-local clients (F3(c)).
10. Closure is PREVENTIVE, COMPLETABLE and fails closed: closing (closure-drain
    allow-list ONLY) -> pre-seal readiness -> FINAL CHECKER APPROVAL (seal_closure
    request) -> closure_sealed (closure_barrier=true) -> POST-BARRIER attestation
    (seal_version_observed, preseal_watermark_ref, committed_after_preseal_
    watermark=0, max_resolution_version_committed < closure_sealed_at_version,
    in-flight status; ONLY the LATEST row per target+attester+seal_version
    counts) -> machine-verified compare-and-set closed (no second checker).
    Governed abort (abort_closure, maker-checker, evidence-conditioned, Critical
    audit) is the ONLY way to clear the barrier. Empty/unreachable/stale/
    mismatched attesters => blocked. Master + its DEFAULT subaccount enter
    closing atomically; every child (default included) closes first; the master
    seals only when every child is closed.
11. The default 'general' subaccount is STRUCTURAL ONLY: resolve requires an
    explicit subaccount_id; no default lookup; is_default never returned by
    internal seams; a missing subaccount_id denies.
12. Limits are configuration: ACC1_MAX_SUBACCOUNTS_PER_MASTER has NO code default;
    missing/invalid => fail closed. closing/closure_sealed rows still count.
13. ACC-01 never holds CLT-01's or IAM-02's GENERAL internal credential IN ANY
    ENVIRONMENT (DEV/TEST included; no temporary broad token): use dedicated
    scoped credentials or labelled test doubles. Every CLT-01 status read
    (resolve, submit, apply, R-3) uses the one read-scoped client. Readiness
    validates configuration/contract only and makes NO outbound peer call.
14. No hard deletion; no retention period invented; no void/bypass route; no
    client-level freeze or login_block (ungoverned); no eligibility verdicts.

TESTS
Real PostgreSQL, non-superuser role_acc1_runtime, fail-loud canary per DB test
file, ownership-scoped fixtures (never unscoped DELETE/COUNT on shared tables),
no migration-head pin, migration up/down/re-up regression committed. Map each
test to file 10 IDs. Run typecheck + the canonical suite; report actual output.

DO NOT
Write outside the phase. Add capability flags, caches, ownership-transfer,
client-initiated creation, void/bypass, role assignments, or product coupling.
Mark anything accepted. Store secrets. Modify main. Merge.

REPORT
Files changed; tests added (IDs); commands run and their real output; any
dependency-change request raised; anything you could not verify.
The implementation report proves nothing — acceptance rests on independent
evidence and human approval.
```

## Phase → prerequisite map

| Phase | Content | Build prerequisite (peers as labelled test doubles) | Dependency prerequisites to operate (file 01 §4.5; environment-agnostic) |
|---|---|---|---|
| 0 | Scaffold, config, boot guards, internal-identity guard | Pack approved | — |
| 1 | Schema, migration, grants, triggers, `iam2` catalogue migration | Migration number at the time; DCR-ACC-IAM-02(a) | — |
| 2 | Reads, `resolve`, `resolve-batch`, `scope-validate`, `open-accounts` | Phase 1 | DEP-CLT-READ-SCOPE (DCR-ACC-CLT-03) |
| 3 | Change-request + apply: create master (+default), create subaccount, profile edit | Phase 1 (IAM-02 actor-binding + entitlement as labelled doubles) | governed-apply set + DEP-LED-CLOSURE-CONTRACT |
| 4 | Restrictions apply/lift/cancel-scheduled, time-effective resolution, housekeeping | Phase 3 | governed-apply set + DEP-FREEZE-GOVERNANCE (DCR-ACC-GOV-05) |
| 5 | Closure: drain → readiness → final-approval seal → attestation → complete; governed abort; attester port | Phase 3 (labelled test attester) | governed-apply set + DEP-LED-CLOSURE-CONTRACT (DCR-ACC-LED-01c/-01e) |
| 6 | Client read routes | Phase 2 | DEP-PUBLIC-PERIMETER + DEP-CLT-READ-SCOPE |
| 7 | Reconciliation extract + checks | LED-01 / REC-01 | — |
