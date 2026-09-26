# ACC-01 Account Structure
## 11 Claude Prompt — FUTURE implementation brief (v0.2)

> **NOT AUTHORISED.** This is a template for a *future* implementation task. It may be used only after (1) this pack has passed a **separate-context re-review** and is human-approved, (2) the still-open human decisions of file 17 §3 are decided or explicitly deferred, and (3) the specific phase has its own approved task record under `docs/03_implementation/tasks/`. Until then no code, migration or test may be written for ACC-01.

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
4. Every create/close/restrict/lift is a change request mirroring CLT-01
   approve/apply: canonical payload + fingerprint stored ("sha256:"+64 hex);
   an operator creates the IAM-02 approval with that payload (IAM-02 fingerprints
   it itself; ACC-01 never sends a hash); apply is bound to the STORED maker;
   recompute the hash from the STORED payload; execute-verify (actor_id,
   current_payload_hash, ...) BEFORE the local transaction; ANY failure after
   verify rolls back and leaves the row 'requested' (a FRESH approval is needed).
   NO 'applying' / 'verification_ref' invention.
   IAM-02 today does NOT entitlement-check makers/checkers (IAM2-FIND-002;
   approval_required short-circuits before the role lookup). Implement and test
   with fixture actors ONLY; the REAL-USE GATES G1-G6 (file 01 §4.5) refuse
   outside DEVELOPMENT/TEST (unknown env => PRODUCTION). Assign NO roles.
5. Effective status computed live; unknown/unreadable => 'unknown'/503, never
   allow. NO cache. Never fan restriction state out to children.
   CONSUMER RULE: effective_status != active => DENY transaction-producing
   activity unless explicitly authorised; blocked_scopes is EXPLANATORY ONLY;
   active_limited / restricted client => report-only. Scheduled restrictions
   are effective BY TIME; the job is housekeeping. Every restriction change
   bumps the target version; resolve returns applied_restriction_ids.
6. Every state change: legal-transition trigger, history row with cause, SEC-01
   audit; unrecordable audit => refuse the mutation.
7. Nothing is named or used as an 'enabled' capability boolean. Never read or
   write cfg1.feature.current_state / environment_scope. A permission, purpose,
   default subaccount or account status never activates anything.
8. No route path contains a fragment rejected by assertNoExchangeRuntime.
9. Import nothing from another services/* directory; peers are HTTP through
   ACC-01-local clients (F3(c)).
10. Closure is PREVENTIVE and fails closed: closing -> closure_sealed (final
    barrier, no unseal) -> POST-BARRIER attestation (seal_version_observed,
    watermark, in_flight_predating_seal=0, fresh) -> compare-and-set closed.
    Empty/unreachable/stale/mismatched attesters => blocked. A master seals
    only when every child is closed.
11. The default 'general' subaccount is STRUCTURAL ONLY: resolve requires an
    explicit subaccount_id; no default lookup; is_default never returned by
    internal seams; a missing subaccount_id denies.
12. Limits are configuration: ACC1_MAX_SUBACCOUNTS_PER_MASTER has NO code default;
    missing/invalid => fail closed. closing/closure_sealed rows still count.
13. ACC-01 never holds CLT-01's or IAM-02's GENERAL internal credential; use the
    dedicated scoped credentials. Readiness validates configuration/contract
    only and makes NO outbound peer call.
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

| Phase | Content | Build prerequisite (DEV/TEST) | Real-use gate outside DEV/TEST |
|---|---|---|---|
| 0 | Scaffold, config, boot guards, internal-identity guard | Pack approved | — |
| 1 | Schema, migration, grants, triggers, `iam2` catalogue migration | Migration number at the time; DCR-ACC-IAM-02(a) | — |
| 2 | Reads, `resolve`, `resolve-batch`, `scope-validate`, `open-accounts` | Phase 1 | **G3** (DCR-ACC-CLT-03) |
| 3 | Change-request + apply: create master (+default), create subaccount, profile edit | Phase 1 (IAM-02 stubbed) | **G1 + G2** |
| 4 | Restrictions apply/lift, time-effective resolution, housekeeping | Phase 3 | **G1 + G4** (DCR-ACC-GOV-05) |
| 5 | Closure (closing → closure_sealed → closed), attester port | Phase 3 (stub attester) | **G1 + G5** (DCR-ACC-LED-01c) |
| 6 | Client read routes | Phase 2 | **G6** |
| 7 | Reconciliation extract + checks | LED-01 / REC-01 | — |
