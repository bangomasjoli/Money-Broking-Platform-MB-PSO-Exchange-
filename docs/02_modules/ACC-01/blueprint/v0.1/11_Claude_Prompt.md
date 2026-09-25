# ACC-01 Account Structure
## 11 Claude Prompt — FUTURE implementation brief

> **NOT AUTHORISED.** This is a template for a *future* implementation task. It may be used only after (1) this pack is human-approved, (2) HD-1…HD-10 are decided, and (3) the specific phase has its own approved task record under `docs/03_implementation/tasks/`. Until then no code, migration or test may be written for ACC-01.

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
3. No cross-schema FK; role_acc1_runtime has zero grants outside acc1; no DELETE.
4. Every create/close/restrict/lift is a change request with IAM-02 maker-checker,
   payload-hash-bound execute-verify, claim -> verify -> verification_ref -> mutate.
5. Effective status computed live; unknown/unreadable => 'unknown'/503, never allow.
   NO cache. Never fan-out child writes.
6. Every state change: legal-transition trigger, history row with cause, SEC-01
   audit; unrecordable audit => refuse the mutation.
7. Nothing is named or used as an 'enabled' capability boolean. Never read or write
   cfg1.feature.current_state / environment_scope. A permission or account status
   never activates anything. Behaviour identical in all five environments.
8. No route path contains a fragment rejected by assertNoExchangeRuntime.
9. Import nothing from another services/* directory; peers are HTTP through
   ACC-01-local clients (F3(c)).
10. Closure fails closed: empty/unreachable/stale attesters => blocked.

TESTS
Real PostgreSQL, non-superuser role_acc1_runtime, fail-loud canary per DB test
file, ownership-scoped fixtures (never unscoped DELETE/COUNT on shared tables),
no migration-head pin, migration up/down/re-up regression committed. Map each
test to file 10 IDs. Run typecheck + the canonical suite; report actual output.

DO NOT
Write outside the phase. Add capability flags, caches, ownership-transfer,
client-initiated creation, or product coupling. Mark anything accepted.
Store secrets. Modify main. Merge.

REPORT
Files changed; tests added (IDs); commands run and their real output; any
dependency-change request raised; anything you could not verify.
The implementation report proves nothing — acceptance rests on independent
evidence and human approval.
```

## Phase → prerequisite map

| Phase | Content | Prerequisite gate |
|---|---|---|
| 0 | Scaffold, config, boot guards, internal-identity guard | Pack approved |
| 1 | Schema, migration, grants, triggers, `iam2` catalogue migration | Migration number at the time; DCR-ACC-IAM-02(a) |
| 2 | Reads, `resolve`, `resolve-batch`, `scope-validate`, `open-accounts` | Phase 1 |
| 3 | Change-request + apply: create master (+default), create subaccount, profile edit | DCR-ACC-IAM-02(b) approval policy |
| 4 | Restrictions apply/lift, lifecycle job | Phase 3 |
| 5 | Closure two-phase, attester port | DCR-ACC-LED-01(c) |
| 6 | Client read routes | DCR-ACC-FND-01, `FND-FIND-001`, DCR-ACC-IAM-01/03 |
| 7 | Reconciliation extract + checks | DCR-ACC-REC-01 |
