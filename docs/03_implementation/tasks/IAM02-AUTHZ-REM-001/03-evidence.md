# 03 Evidence — IAM02-AUTHZ-REM-001

> Facts read from the repository and check output collected for this documentation checkpoint. Reference commits and files; no source copies, no large logs. Reproduction code lived outside the repository (session scratch) and is described, not stored; the implementer converts it into repository tests (plan §8).

- **Collected:** 2026-10-21T18:46Z (22 Oct 2026 Asia/Kuching)
- **Baseline commit:** `effcdf39c6666f014ce7c9776f83903f6263381f` (`main` = `origin/main`)
- **Resulting commit:** none — no commit made
- **Branch:** `docs/IAM02-AUTHZ-REM-001` (created from `main` at the baseline; uncommitted)
- **Working tree clean before the task files were written:** true
- **Other branches/refs:** open PR #5 (`docs/aix-accuracy-protocol-20261022`, head `981ab24`, docs only, not merged) does not touch IAM-02 sources; no `072+` migration exists on any known ref (E-8).
- **Environment used for executed checks:** PostgreSQL 17.10 scratch cluster, localhost only, own data directory, no connection to any other database; all 71 migrations (`001`…`071`) applied from scratch plus the fnd, iam and iam2 grant files; throwaway seed tokens for migration `008`; runtime roles pre-created. Production database version and settings are **NOT VERIFIED**.

## 1. Authoritative sources read
| Source | Facts used |
|---|---|
| GitHub Issue #6 (open, 0 comments, created 2026-10-21T18:38Z, state at fetch time) | approved decisions, qualifications, “not yet established” list |
| `docs/OPEN_FINDINGS.md` lines 105–109 (IAM-02 header), 114–117 (`IAM2-FIND-001…004`) | all four rows `OPEN`/requires triage; L1–L3 “tracked in that review, not here” |
| `docs/02_modules/IAM-02/acceptance/IAM-02_Approval_Control_Adjudication_Opus_v1.0.md` (APPROVED) | origin of FIND-002/003/004; closure criteria |
| `docs/02_modules/IAM-02/acceptance/IAM-02_Security_Review_Opus_v0.1.md` lines 81–83 | L1–L3 text; `…_v0.2_reverify.md`: baseline ACCEPTED |
| `docs/00_project_state/MODULE_STATUS.md` line 67 | IAM-02 “Accepted baseline v1.0 (Phases 0-5)” |
| `docs/DECISION_LOG.md` | DEC-005 (register ownership), DEC-008 (IAM-01 session seam). **No decision specific to IAM-02 approval authorisation exists**; DEC-001…DEC-014 headers were all listed; only DEC-005, DEC-008 and DEC-011 name IAM-02. Not every decision was read in full beyond these. |
| `docs/02_modules/IAM-02/blueprint/v1.2/07_Permission_Rules.md` §4, §6, §7, §8, §9 | maker-checker list; step-up list; precedence steps 6/7 before 10; Protected Action Registry (deferred); approval binding |
| `docs/02_modules/IAM-02/blueprint/v1.2/04_API_Specification.md` §4.3 | “Step-up required where policy says so” (conflicts with the seed flag — see decision C-3) |

## 2. Code defects at the baseline (all VERIFIED by reading source)
| ID | File and lines | Fact |
|---|---|---|
| E-1 | `platform/services/iam2/src/routes/approvals.ts` | Imports only `lookupCacheVersion` from the guard (line 31); **no permission evaluation in any of the three handlers**. `lookupPolicy` selects `policy_id, required_approval_count, requires_step_up, expiry_minutes` only (81–90). Defaults `1` approval / `1440` minutes when no policy (145–146). Approve re-reads the policy by `(action, resource)` and **skips step-up when `policy_id` is null** (280–282). The IAM-01 result’s `userId` is **not compared** to `approver_user_id`; only `authLevel` is used (286–295). `23505` is caught and returned as an outcome (340–345 approve; 465–469 reject). |
| E-2 | `platform/services/iam2/src/routes/roles.ts` 122–133, 139 | The guard result is computed (123) but consulted **only when no `decision_token` is supplied** (130–133); with a token the route proceeds on `verifyAndConsumeDecisionToken` (139) alone. |
| E-4 | `platform/services/iam2/src/lib/guard.ts` 290, 298, 316, 338, 345, 356; `platform/services/iam2/src/routes/internal.ts` 128–170; `platform/services/iam2/src/lib/decision-token.ts` 199–290 | Guard precedence as implemented: licence lock → prohibited → deny override → step-up flag → approval flag → role grants; flagged permissions return **before** role grants are evaluated (matches blueprint `07_Permission_Rules.md` §7 order). `execute-verify` only calls `verifyAndConsumeDecisionToken`: existence/status/expiry, actor/action/resource/entity/client binding (230–232), payload hash, maker cache-version staleness (276–290). It **evaluates no permission, deny override, licence lock or revocation state**. `internal.ts` builds `PermissionCheckInput` field by field (no spread) at 85–97. |
| E-9 | `platform/services/iam/src/routes/step-up.ts` 39, 53, 255, 264, 336–347; `platform/infra/migrations/002_iam_auth_session.cjs` 109, 228 | IAM-01 assertion: `purpose` `varchar(64)` (NOT NULL on `step_up_assertion`), validator `minLength 1 / maxLength 64`, no pattern, no `CHECK` on purpose; verification is exact string equality; TTL 10 minutes; verification reads only the assertion row; **nothing in `services/iam/src` updates or deletes an assertion**, so it is reusable within its window and not revoked by logout. `iam2_approval:<approval_id>` is **55 characters** (`"appr_"` + UUID = 41, set at `approvals.ts:147`), within the 64 limit. |

## 3. Executed reproductions at the baseline (isolated scratch DB; the IAM-02 app under the `role_iam2_runtime` member login)
| ID | Setup and observed result |
|---|---|
| E-2 (R1 reproduction of the `roles.ts` code fact above) | Acting admin with an active **explicit DENY override** on `iam2.role.assign_user`. `/internal/iam2/permission/check` returned `deny`. Request → approve → assign with the minted token: **HTTP 200, `assigned`; 1 active `auditor` `user_role` row created.** |
| E-3 (R2) | Policy requires step-up; IAM-01 stubbed to report the assertion belongs to a **different user**. Approve returned **200 `approved`** and minted a token. |
| E-3 (R3) | Request pinned a step-up policy (`policy_id` matched); policy set inactive; approve with **no assertion**: **200 `approved`**, token issued. |
| E-3 (R4, control) | Same, policy still active, no assertion: **401 `IAM2_STEP_UP_INVALID`**. |
| E-3 (C7) | Two `active` policy rows for one `(action, resource)` inserted successfully (rolled back); no unique index exists on that pair. Which row `LIMIT 1` returns is INFERRED, not demonstrated. |

R1–R4 were repeated twice (once in the review, once for this record) with identical results.

## 4. Execution path, transaction and revocation facts
**E-5 — consumer/execution path.** Redemption call sites of `verifyDecisionToken` against IAM-02: **24** (AML-01 1, CFG-01 3, CLT-01 16, KYC-01 1, SEC-01 1, WLT-01 2).
- **22** are preceded, on the same path, by an advisory `checkPermission` baseline (CLT-01 via inline checks or `checkBaseline` in `lib/authorised-party-service.ts` 206–209 with calls at 305+, 459+, 615+; KYC-01 `outcome-override.ts` 340/347; AML-01 `matches.ts` 343/347; CFG-01 `feature-changes.ts` 280/290, `licence-changes.ts` 193/204, `kill-switches.ts` 221/236; SEC-01 `alerts.ts` baseline at the top of the close handler, 423 conditional on critical severity).
- **2 are not:** WLT-01 `destination-approval.ts` apply route (line 175 onward; the only `checkPermission` in the file is at 117 in the *request* route) and `evidence-export.ts` apply (verify at 304; baselines at 212, 428, 453 are for request and download).
- The baseline treats `approval_required` and `step_up_required` as a pass (`platform/services/clt1/src/lib/iam2-client.ts` header, line 27 “UNCONDITIONALLY… before role grants are even looked up”). **Executed accepted test** `platform/tests/integration/cfg1-iam2-guard-real.test.ts:248` asserts an unprovisioned actor reaches `allowed:true` for `cfg1.feature.enable`.
- `sec1.security_alert.close` is registered `normal` with no approval or step-up flag (`platform/infra/migrations/013_*.cjs` line 53), so its baseline does reach the role-grant step.
- The WLT-01 migration comment (`056_*.cjs`) describes `approve_apply` as “the sole real gate”.

**E-6 — duplicate-decision transaction behaviour (executed).** `withTransaction` issues a plain `COMMIT` (`platform/packages/foundation/src/db.ts` 70–87).
- *App path:* the unmodified accepted test (`iam2-db.test.ts`, “a duplicate approval decision…”) passes; afterwards the request shows `pending`, 1 of 2 approvals, **1** decision row and **1** `sod_check` row — the second attempt’s `sod_check` was discarded.
- *Mechanism:* after `23505` the next statement fails `25P02` and `COMMIT` returns tag `ROLLBACK`; only the first `sod_check` survived.
- *SAVEPOINT:* caught `23505`, `COMMIT` returned `COMMIT`, both surrounding `sod_check` rows survived.
- *Runtime grants* (`iam2_runtime_grants.sql` 80, 84): `approval_decision` and `sod_check` are INSERT-only. `ON CONFLICT (approval_id, approver_user_id) DO NOTHING` fails `42501`; `RETURNING` fails `42501`; target-less `ON CONFLICT DO NOTHING` works but also swallows a `decision_id` collision as a “duplicate”.
- *Concurrency:* three simultaneous same-approver transactions, run both ways without the row lock: exactly 1 decision row, all 3 `sod_check` rows persisted.
- The unique constraint name is the implicit `approval_decision_approval_id_approver_user_id_key`.
- **This probe was produced in the same shared session as the plan and is not independent validation** (plan §9, item 8).

**E-7 — revocation.** `bumpCacheVersion` is called only on role assignment (`routes/roles.ts:212`) and bootstrap (`routes/bootstrap.ts:158`). IAM-02 runtime code has no `UPDATE`/`DELETE` of `user_role` or any revoke path (searched). Runtime grants: `user_role` SELECT+INSERT (line 56), `role_permission` SELECT only (49), `user_permission_override` SELECT only (57), `permission_cache_version` SELECT+INSERT+UPDATE (63). Decision-token staleness compares the **maker’s** cache version only (`decision-token.ts:276`). Revocation therefore occurs only by privileged SQL, which does not bump the cache version unless the operator does so.

**E-8 — migrations.** Latest migration on `main` is `071_cfg1_environment_scope.cjs`; no file numbered `072` or higher exists on any known local or remote-tracking ref. Migration `006` defines `approval_policy` (162), `approval_request` (176) and `approval_decision` (199); `iam2.approval.approve` is seeded `sensitive`, `requires_step_up = true` (388). The `approval_policy` table has no unique constraint on `(action, resource)`.

## 5. Redemption-time pairs (code-confirmed) and what is NOT confirmed
Confirmed at the 24 call sites above (resource in parentheses): CLT-01 `clt1.application.approve` (application); `clt1.authorised_party.{add,update,remove,activate}` (authorised_party); `clt1.client_mandate.{create,update}` (client_mandate); `clt1.related_party.{add,update,remove}` (related_party_edge); `clt1.duplicate_candidate.{create,update,confirm,dismiss}` (duplicate_candidate); `clt1.authorised_user.{add,remove}` (authorised_user); `clt1.client_profile.{suspend,reactivate,close}` (client_profile) — 19. KYC-01 `kyc1.outcome.override` (cdd_outcome). AML-01 `aml1.match.{confirm,dismiss}` (screening_match). SEC-01 `sec1.security_alert.close` (security_alert). WLT-01 `wlt1.destination.approve_apply` (destination), `wlt1.evidence_export.apply` (evidence_export). CFG-01 `cfg1.feature.{enable,disable}` (feature; `feature-changes.ts` 278, 290–295), `cfg1.licence_profile.{activate,suspend,revoke}` (licence_profile; `licence-changes.ts` 62–64, 204–209), `cfg1.kill_switch.deactivate` (feature; `kill-switches.ts` 236–241). IAM-02 itself: `iam2.role.assign_user` (role). **32 pairs.**
- All 32 are registered permissions (migrations `006`, `013`, `017`, `019`, `022`…`063`); 31 carry `requires_approval = true`, and `sec1.security_alert.close` does not.
- `cfg1.kill_switch.activate` and the `*.change_request` / `deactivate_request` permissions are used for baseline checks only, not redemption.
- Eight registered permissions have no redeemer in code (`iam2.role.create/update/retire`, `iam2.permission.assign_role`, `iam2.sod.manage`, `iam2.delegation.create`, `iam2.temporary_permission.grant`, `iam2.break_glass.request`).
- **NOT confirmed:** any request-time `(action, resource, entity_id, payload)` contract. No repository code, script or UI path calls `POST /iam2/approvals/request`; every consumer’s tests stub IAM-02. The only real pair exercised is `iam2.role.assign_user` / `role` in `iam2-db.test.ts`. A mismatch fails safe because the token binds action and resource (`decision-token.ts:230–233`).
- **No consumer workflow is demonstrated end to end against a real IAM-02 approval.**

## 6. Checks
| Check | Command | Status | Exit | Evidence reference |
|---|---|---|---|---|
| tests (fresh DB) | `TEST_DATABASE_URL=<scratch> npx vitest run` on `tests/integration/iam2-db.test.ts`, `tests/unit/iam2-guard.test.ts`, `tests/unit/iam2-app.test.ts`, `tests/unit/iam2-decision-token.test.ts`, `tests/unit/cfg1-iam2-client.test.ts`, `tests/integration/{cfg1,clt1,aml1}-iam2-guard-real.test.ts` | PASS — 8 files, **148 passed, 0 failed, 0 skipped** | 0 | summary only |
| tests (reused DB) | same command, second run on the same database | **1 failed** (the one-time bootstrap test) | 1 | see note |
| full suite | `npx vitest run` (entire repository) | **NOT_RUN** | – | – |
| typecheck | `npm run typecheck` | **NOT_RUN** | – | – |
| lint | – | **NOT_RUN** | – | – |
| migrations | `npx node-pg-migrate -m infra/migrations --no-check-order up` on the scratch DB | PASS — 71 applied (`001`…`071`) | 0 | summary only |

*Reused-DB note:* “Bootstrap-to-RBAC transition … succeeds exactly once, then is permanently disabled” failed with HTTP 403 on a database where an earlier run had already consumed the single-use transition (1 active bootstrap-assigned admin row confirmed). The IAM-02 database suite is therefore **not repeatable on a reused database**; every acceptance run must start from a freshly migrated database. This is a property of the test design, not an observed regression.

## 7. Supporting design review (NOT independent)
An Opus 5.5 design review of the earlier v2 plan was produced in the **same shared Claude session** as that plan (verdict ACCEPT WITH CONDITIONS). It raised F01–F07, the C-1…C-16 matrix and a proposed specification. It is retained here only as supporting analysis; its text is not stored in this repository and its conclusions were re-verified against source for §2–§5 above. It does not satisfy the fresh-context independent review required for closure.

## Changed files
- `docs/03_implementation/tasks/IAM02-AUTHZ-REM-001/01-plan.md` (new)
- `docs/03_implementation/tasks/IAM02-AUTHZ-REM-001/03-evidence.md` (new)
- `docs/03_implementation/tasks/IAM02-AUTHZ-REM-001/task.json` (new)

## Targeted evidence references
- `docs/OPEN_FINDINGS.md` 105–117 — registered state, unchanged by this task.
- `platform/services/iam2/src/routes/approvals.ts`, `routes/roles.ts`, `routes/internal.ts`, `lib/guard.ts`, `lib/decision-token.ts` — defect locations (§2).
- `platform/tests/integration/cfg1-iam2-guard-real.test.ts:248` — accepted test encoding the baseline-pass semantics (§4, E-5).
