# 03 Evidence — IAM02-AUTHZ-REM-001

> Facts read from the repository and check output collected for this documentation checkpoint. Reference commits and files; no source copies, no large logs. Reproduction code lived outside the repository (session scratch) and is described, not stored; the implementer converts it into repository tests (plan §8).

- **Collected:** revision 1 2026-10-21T18:46Z; revision 2 2026-10-22 (Asia/Kuching); revision 3 2026-10-22 (Asia/Kuching, documentation-only). Revision-1 sections below are kept as recorded (§1–§6, §7 rev-1 text); revision-2 additions are §8–§10 and the entries E-10…E-15, and carry the label *rev-2*; revision-3 additions are §11–§14 and the entries E-16…E-22, and carry the label *rev-3 re-read* (Sonnet re-read source or the Issue) or *Opus reported* (focused Opus verification, not re-run).
- **Baseline commit (code):** `effcdf39c6666f014ce7c9776f83903f6263381f` (`main` = `origin/main`); `git diff --stat effcdf39..fd94dc97 -- platform` is empty (rev-2 verified), so every code fact below holds at the record commit as well.
- **Record base for revisions 2 and 3:** `fd94dc97a2676443e130289d71cb1a535006dad1` on local `docs/IAM02-AUTHZ-REM-001` (not pushed; working tree was clean before the revision-2 edits). Revision 3 is cumulative over revision 2; a copy of the revision-2 files was kept outside the repository for diffing.
- **Resulting commit:** none — revisions 2 and 3 are uncommitted working-tree edits; no commit made
- **Branch:** `docs/IAM02-AUTHZ-REM-001` (created from `main` at the baseline)
- **Working tree clean before the task files were written:** true
- **Other branches/refs:** open PR #5 (`docs/aix-accuracy-protocol-20261022`, head `981ab24`, docs only, not merged) does not touch IAM-02 sources; no `072+` migration exists on any known ref (E-8).
- **Environment used for executed checks:** PostgreSQL 17.10 scratch cluster, localhost only, own data directory, no connection to any other database; all 71 migrations (`001`…`071`) applied from scratch plus the fnd, iam and iam2 grant files; throwaway seed tokens for migration `008`; runtime roles pre-created. Production database version and settings are **NOT VERIFIED**.

## 1. Authoritative sources read
| Source | Facts used |
|---|---|
| GitHub Issue #6 (open; rev 1: 0 comments, created 2026-10-21T18:38Z; **rev 2: 1 comment `6339447853` by the repository owner, 2026-10-22T11:18:19Z, "D-1 through D-8 APPROVED WITH CONDITIONS"**, read in full) | approved decisions, qualifications, “not yet established” list; D-1…D-8 dispositions and the limits of the immediate docs-only task |
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

**Revision 2 correction to the description above:** the later Opus readiness review (§10) is a *different* review from the revision-1 same-session design review. See §10 for its provenance.

## 8. Revision-2 evidence (rev-2; collected 2026-10-22, Asia/Kuching)
Environment for executed checks: a **new** PostgreSQL 17.10 cluster (own data directory in session scratch, TCP localhost only, no connection to any other database), 71 migrations (`001`…`071`) applied from scratch plus the fnd, iam and iam2 grant files, throwaway seed tokens for migration `008`, runtime roles pre-created. The IAM-02 application (`buildApp`) was booted **as a LOGIN role that is a member of `role_iam2_runtime` only** (no superuser, no `BYPASSRLS`); fixtures were inserted through a separate superuser pool. Scripts lived outside the repository and are described, not stored. No file in the repository was modified by these runs.

### E-10 — executed reproductions (rev-2; identical outcome in the earlier Opus run)
| ID | Setup and observed result |
|---|---|
| **N1** (F08) | An actor holding a role that grants `sec1.security_alert.close` called `/internal/iam2/permission/check` with the SEC-01 close-payload hash: `allow` and a `decision_token`. `execute-verify` with `approval_id = "appr_FABRICATED_never_existed"` returned **HTTP 200, `execution_authorised: true`** (`verified_payload_hash: true`). A query for any `iam2.approval_request` row with that id returned **0**. |
| **N2** (F04) | Same shape: token issued, then an active **deny override** inserted for that actor and permission. `permission/check` then returned `deny`, yet `execute-verify` of the earlier token returned **HTTP 200, authorised**. |
| **N3** (F01 broadened) | Maker, approver and acting admin all had **zero** `user_role` rows. `POST /iam2/approvals/request` (`iam2.role.assign_user`, payload `{role_code, target_user_id}`) → 200; approve → 200 with a token; `POST /iam2/users/:id/roles` with the token and matching payload hash → **HTTP 200 `assigned`; 1 active `auditor` `user_role` row created**. |
| **N4** (F09) | Per trial: a fresh token, then 3 **concurrent** `execute-verify` calls with identical bodies; 5 trials. Successes per trial: **`[1, 3, 3, 3, 3]`** (the same pattern as the Opus run). Timing-dependent: trial 1 had one success; trials 2–5 had three, i.e. more than one success in 4 of 5 trials. |
| **SAVEPOINT matrix** | Run through `psql` as the runtime login. (A) duplicate approver without savepoint → second insert `23505` on `approval_decision_approval_id_approver_user_id_key`, next statement `25P02`, `COMMIT` reported `ROLLBACK`. (C) with `SAVEPOINT`/`ROLLBACK TO` around the decision insert → both surrounding `sod_check` rows persisted, `COMMIT`. (D) `INSERT … ON CONFLICT (approval_id, approver_user_id) DO NOTHING` and `INSERT … RETURNING` → `42501 permission denied for table approval_decision`. (E) a `decision_id` collision raises `23505` on the **different** constraint `approval_decision_decision_id_key`. Both constraint names exist. Result of the run: 2 `sod_check` rows, 1 decision row for the test approval, as the strategy requires. |

### E-11 — blueprint basis for the service-account and multi-approver requirements (rev-2 verified by reading)
`05_Database_Design.md` §2.8: constraint 2 "Service account cannot satisfy human checker approval", constraint 5 "Dual approvers must be distinct and mutually non-conflicting under SoD". `07_Permission_Rules.md` §5: "Service account as human approver | Block". `09_Error_Handling.md` §2 lists `IAM2_SERVICE_ACCOUNT_APPROVER_BLOCKED` (Critical) and `IAM2_APPROVER_NOT_ELIGIBLE` (High) (also `04_API_Specification.md` line 315 for the first); **neither is defined in `platform/services/iam2/src/lib/errors.ts`** (no match). `10_Test_Cases.md`: IAM2-TC-022 (dual approval), 063 and 089 (service-account approval blocked), 090 (same-user race), 091 (conflicting dual approvers). `14_Go_Live_Checklist.md` items 19 and 21 are "Pending". `09` §1 rule 2 "Fail closed on missing policy" and §3 case 4 "Approval policy unavailable".

### E-12 — how step-up assertions are issued and what `verify-assertion` returns (rev-2 verified)
IAM-01 `services/iam/src/routes/step-up.ts`: `/auth/step-up` (`:73-74`) and `/auth/step-up/verify` (`:148-149`) are both `requireUserSession`; start requires an **active TOTP factor** in `iam.mfa_factor` for the session user; an assertion row is inserted only after a passed challenge, with `auth_level = 'mfa'` (`:256`). `iam.step_up_assertion.user_id` references `iam.user_identity (user_id)` (`002_iam_auth_session.cjs:77`). `iam.user_identity.user_type` permits `client|staff|admin|service` (`:39`); `iam.service_account` is a **separate table** (`:208`) with no session or factor reference. `verify-assertion` returns `{valid, user_id, auth_level, fresh_until_utc}` only (`:368`, `:377`) — **no principal type**. IAM-02's runtime role has no grant into `iam.*`. **INFERRED:** an `iam.service_account` principal cannot obtain an assertion. **UNVERIFIED (revision-2 text, preserved):** whether an identity with `user_type = 'service'` could hold a session and TOTP factor. **Superseded in revision 3 by E-16 (Opus reported): it can** — a `service`-class identity obtained a valid purpose-bound assertion on a disposable database. The "INFERRED" statement above holds only for the separate `iam.service_account` table.

### E-13 — request-time contract facts (rev-2 verified from source; detail in plan §10)
- All 24 call sites' argument lists re-read: action, resource, entity, maker source, payload function (plan §10.2). **CLT-01 (16), KYC-01, AML-01 and CFG-01 pass no `clientId`**; WLT-01 passes `body.client_id`; SEC-01 passes `preview.client_id` conditionally. All 24 sites pass `approvalId`.
- CLT-01, AML-01 and CFG-01 request routes return `payload_hash` and ids but **not the payload object** (e.g. `clt1/src/routes/decisions.ts:329`, `mandates.ts:183,365`, `aml1/src/routes/matches.ts:308`, `cfg1/src/routes/feature-changes.ts:239`, `licence-changes.ts:153`); WLT-01 returns `approval_payload`, `approval_payload_hash`, `iam2_action`, `iam2_resource`, `iam2_entity_id` (`wlt1/src/routes/destination-approval.ts` request route; `evidence-export.ts`). KYC-01 and SEC-01 request/preview routes were not re-read for response shape.
- IAM-02 `CreateApprovalBody` (`approvals.ts:42-55`) accepts `payload` (object), not `payload_hash` (`additionalProperties: false`); blueprint `04` §4.1 shows `payload_hash`.
- WLT-01 `approve/request` writes a local audit event only (no IAM-02 approval, no stored requester); the token is bound to the IAM-02 maker (`approvals.ts:390-391`); migration `056` header calls `approve_apply` "the checker's actual … execution".
- The approval-lifecycle test (`iam2-db.test.ts:1093` onward) creates a policy for the unregistered action `iam2.test.approval_flow_<id>` and uses an unprovisioned maker and approver.
- Composite entity ids (`type:id`) are used for CLT-01 related-party-edge add (`related-party-edges.ts:290`) and duplicate-candidate create (`duplicate-candidates.ts:331`); whether they always fit IAM-02's `varchar(64)` entity columns is **UNVERIFIED**.

### E-14 — provenance of the "double-consume" wording (rev-2 verified by search)
`docs/OPEN_FINDINGS.md:114` (`IAM2-FIND-001`, "IAM-02 double-consume issue requires dedicated triage", source column cites `IAM-02_Security_Review_Opus_v0.1.md` / `v0.2_reverify.md`) and `docs/02_modules/IAM-02/README.md:44` contain the phrase; **those two reviews do not** (search of `docs/` and `platform/`). It also appears in `IAM-01_Session_Introspection_Opus_v1.0.md:117` (§9, "does not … the IAM-02 double-consume triage") and an E2E-01 review line (matched; not read for this task). Accepted WLT-01 source comments describe the defect: `services/wlt1/src/routes/decision-consume.ts:11` (IAM-02 `verifyAndConsumeDecisionToken` "issues an UNLOCKED `SELECT` followed by an unconditional `UPDATE` — a genuine double-consume race a separate architecture review identified") and `routes/evidence-export.ts:35` ("SEPARATELY-TRACKED IAM-02 decision-token double-consume race — NOT fixed here"); WLT-01 `UNIQUE (approval_ref)` (`uq_wlt1_evidence_export_approval_ref`, migration `062`) is the consumer-side backstop. **Equivalence of F09 and `IAM2-FIND-001` is INFERRED and is a triage decision (D-1); it is not asserted.**

### E-15 — policy-table schema facts (rev-2 verified)
`approval_policy` (migration `006`): unique only on `policy_id`; `threshold_type` `CHECK IN ('value','count','risk','action')`; `status` `CHECK IN ('active','inactive')`; no `CHECK` on `required_approval_count`, `expiry_minutes` or the shape of `required_approver_roles`; no unique on `(action, resource)`. `threshold_type` and `required_approver_roles` are referenced by **no** code under `services/iam2/src`. `approval_request.policy_id` references `approval_policy (policy_id)`. Runtime grants: `approval_policy` SELECT only; `approval_request` SELECT, INSERT, UPDATE **table-wide** (`iam2_runtime_grants.sql:72,76`). No `072+` migration exists on any of 20 local and remote-tracking refs (rev-2 scan).

## 9. Checks (revision 2)
| Check | Command / method | Status | Evidence |
|---|---|---|---|
| baseline | `git rev-parse` HEAD / branch / `git status` / `git fetch` | PASS — HEAD `fd94dc97…`, clean tree, `origin/main` `effcdf39…` | summary |
| reproductions N1–N4 | scratch-DB script via the IAM-02 app as a runtime-role login | PASS (defects reproduced) | E-10 |
| SAVEPOINT matrix | `psql` as runtime login | PASS (strategy validated) | E-10 |
| repository test suites, `typecheck`, lint, migrate via `migrate:up` repo script | — | **NOT_RUN** this revision (migrations were applied with the repo's `node-pg-migrate` against the scratch DB only to build the environment) | – |
| consistency check of the three revised records | manual cross-check of requirement ↔ finding ↔ test ↔ decision IDs | done; see report | – |

## 10. Reviewer provenance for revision 2
| Source | Attribution | Notes |
|---|---|---|
| Opus readiness review (verdict **REMEDIATE**, read-only, chat only, **not stored in the repository**) | produced F08–F10, P1–P4, D-1…D-8, interface proposals (plan §7), candidate policy values and the C-6 reading | Run with the user's persistent project memory loaded (it contained a summary of the earlier same-session plan/review). It reports re-verifying against source; it is **not** the fresh-context independent review required by D-7 and for closure. |
| Items re-verified by Sonnet in revision 2 | F01 (N3), F04 (N2), F08 (N1), F09 (N4), F07/SAVEPOINT; code locations for F02, F03, F05, F06, F08, F09; D-1…D-8 text; step-up issuance (E-12); contract facts (E-13); double-consume provenance (E-14); schema facts (E-15); the P1 test-fixture claim for `iam2-db.test.ts:1093` and the decision-token unit-test fake | *rev-2 verified* |
| Items still **Opus reported** (not re-checked in revision 2; see §14 for revision 3) | F10 severity proposal; that 32 redemption pairs' resources equal `iam2.permission.resource` (rev-1 recorded; not re-run for all 32); fixture impact in `iam2-db.test.ts` blocks at `:792`, `:1357`, `:1492`; the proposed `VerifiedStepUp`/wrapper/`evaluateEntitlement` designs; the C-6 boundary reading; the 072 content proposals | Carried as PROPOSED, with validation tasks V-1…V-8 in plan §9.2. |

## 11. Revision-3 evidence: owner decision and focused Opus verification (collected 2026-10-22, Asia/Kuching)
### E-20 — owner decision (rev-3 re-read)
GitHub Issue #6, read in full through the public API (`gh` is not installed): the body, comment `6339447853` (D-1…D-8) and comment `6340362022` (owner, 2026-10-22T12:08:38Z, "OD-1 Option A APPROVED; final documentation-only correction authorised"). Its limits are recorded verbatim in plan §2.3. The Issue was open and had exactly these two comments at the time of that reading. **Phase A (revision 3 final):** a third owner comment, `6340858922` (2026-10-22T12:34:20Z, "controlled IAM-02 documentation commit + Sonnet implementation"), was read in full; it adds binding clarification 1 (X-2 handling) and clarification 2 (mixed staff/admin pairs), authorises the local documentation commit and a bounded, uncommitted implementation, and lists the exclusions (plan §2.4).

### E-16 — service-class approver and account status (NF-1, NF-2) — **Opus reported; not re-executed by Sonnet in revision 3**
Environment (as reported): a new PostgreSQL 17.10 cluster, TCP localhost only, 71 migrations plus the fnd, iam and iam2 grant files, apps booted as LOGIN roles that are members of the runtime roles only (`rolsuper = false`, `rolbypassrls = false`); the cluster was deleted afterwards; scripts were not stored.
- An IAM-01 identity inserted with `user_type = 'service'` and `user_class = 'service'` and a password credential: `POST /auth/login` → 200 `authenticated`; the session row shows `user_class = 'service'`, `session_status = 'active'`.
- `POST /auth/mfa/enrol` → 201; `POST /auth/mfa/verify` → 200 `enrolled`; `POST /auth/step-up` with purpose `iam2_approval:appr_<uuid>` (55 characters) → 200; `POST /auth/step-up/verify` → 200 with an assertion.
- `POST /internal/auth/verify-assertion` with that purpose → 200 `valid: true`, `user_id` equal to the service identity, `auth_level: mfa`.
- After setting the identity's `status` to `suspended`, the same call → 200 `valid: true` (still valid within the assertion window).
- Same run, IAM-02: F08 (fabricated `approval_id` → 200, 0 approval rows), F04 (deny override after token → `execute-verify` still 200), F01 (`roles.ts` assigns despite an explicit deny; admin and approver hold 0 roles), F09 (3 concurrent redemptions × 20 trials: more than one success in 19 of 20 trials) — consistent with E-10 (rev-2 verified).

*Rev-3 re-read of the code behind it:* `user_type` is referenced in IAM-01 source only in the bootstrap insert (`services/iam/src/lib/bootstrap.ts:52`); `routes/auth.ts:152` selects `user_id, user_class, status, mfa_required` by identifier hash and does not restrict by class; `routes/mfa.ts:526-558` creates the session from the stored `user_class` without restriction; `002_iam_auth_session.cjs:39` permits `user_type` ∈ client/staff/admin/service, `:46-47` permits `user_class` ∈ admin/staff/client/client_approver/service, and `:373` seeds an **active** session policy for `service`; `routes/step-up.ts` `verify-assertion` (`:320-380`) reads only the assertion row and returns `valid`, `user_id`, `auth_level`, `fresh_until_utc` — it neither joins `iam.user_identity` nor checks status.

### E-17 — IAM-01 facts for the additive interface (rev-3 re-read)
- Only caller of the endpoint: `services/iam2/src/lib/iam01-client.ts:40`, used by `routes/approvals.ts:286` and `routes/bootstrap.ts:103`; no other service references `verify-assertion` (search of `services/*/src`, excluding IAM-01 itself).
- `iam.user_identity` carries no row-level security: the `ENABLE ROW LEVEL SECURITY` statements in migrations `002`–`004` cover `iam.session` (`:342`), `iam.refresh_token` (`:347`), `iam.device_registry` (`:352`) and `iam.mfa_factor` (`:357`) only; `role_iam_runtime` holds `SELECT, INSERT, UPDATE` on all `iam` tables (`infra/grants/iam_runtime_grants.sql:22`).
- IAM-01's bootstrap admin is created with `user_type = 'admin'` and `user_class = 'admin'` (`lib/bootstrap.ts:52`).
- Existing tests that must stay unedited: `tests/integration/iam-db.test.ts:1017` (describe "Step-up + internal verify-assertion", calls at `:1074` and `:1083`) and `tests/unit/iam-app.test.ts:173`.

### E-18 — IAM-02 test facts behind the §8.1 exceptions (rev-3 re-read)
- `tests/integration/iam2-db.test.ts:1143` — `expect(sentBody.required_purpose).toBe("iam2_approval")` (exception X-1: C-4 changes the purpose).
- `:1215` — "a duplicate approval decision from the same approver is a clean error, not a crash": seeds `requiredCount: 2`, expects the first approve to return `pending` (1 of 2) and the second to fail with `IAM2_APPROVAL_ALREADY_DECIDED` (exception X-2; incompatible with the AZ-18 gate by design).
- `:1099` full round trip: the fake IAM-01 body at `:1120-1123` carries `valid`, `user_id`, `auth_level`, `fresh_until_utc` only (needs the OD-1 identity fields as a fixture update); the fail-closed IAM-01 tests are at `:1252`, `:1280`, `:1304`, `:1328`; the Bootstrap-to-RBAC block begins at `:1557` with fake bodies at `:1582-1584`, `:1609-1611`, `:1644-1646`.
- With a count-1 policy, `routes/approvals.ts` locks the request row (`lookupApprovalForUpdate … FOR UPDATE`, `:107-117`) and returns `IAM2_APPROVAL_ALREADY_DECIDED` for any non-`pending` status (`:260-262`) **before** the decision insert (`:333`), so the `23505` handler (`:340-346`) cannot be reached by a second same-approver attempt at count 1 (INFERRED from code; not executed).
- `tests/unit/iam2-decision-token.test.ts:42-98`: the fake dispatches on `text.includes(...)`; a `FOR UPDATE` suffix on the token `SELECT` and a `status = 'active'` predicate on the consuming `UPDATE` remain matched, and the fake always reports `rowCount: 1` (INFERRED, so the row-count branch needs its own test, T-36).

### E-19 — boundaries and ordering facts (rev-3 re-read)
- Guard step 3 (account/session freeze) is a documented no-op fall-through (`guard.ts:302-313`); the licence and prohibited checks read only `iam2.permission.licence_locked` and `prohibited` (`guard.ts:290-300`). IAM-02 holds no CFG-01 grant.
- `execute-verify` sets no `aix.user_id` scope (`routes/internal.ts:146-157`); `permission/check` does (`:85`). The role-grant and deny-override reads are RLS-protected by that setting (`guard.ts:107-164`).
- SEC-01 critical close: `verifyDecisionToken` at `routes/alerts.ts:423`, the closing write in a separate transaction at `:444`.
- `iam2_runtime_grants.sql`: `approval_request` SELECT, INSERT, UPDATE (table-wide); `permission_decision_token` SELECT, INSERT, UPDATE (sufficient for `SELECT … FOR UPDATE`); `approval_decision` INSERT only.
- Blueprint two-person requirements (for AZ-18): `docs/02_modules/IAM-02/blueprint/v1.2/01_Module_Blueprint.md:184` (SoD risk acceptance, Compliance + Management dual non-self approval) and `:188` (SoD matrix changes, Security + Compliance dual approval and step-up); `04_API_Specification.md:235`; `07_Permission_Rules.md:187`; `10_Test_Cases.md:43` (IAM2-TC-022), `:195` (-090), `:196` (-091); `docs/02_modules/CFG-01/blueprint/v1.1/02_Workflow.md:84` ("Sensitive feature change requires dual approval where policy says so"); `docs/02_modules/AML-01/blueprint/v1.2/05_Database_Design.md:274` (`approver_two`).

### E-21 — items reported by the focused Opus verification and not re-checked in revision 3
That all 32 redeemed permissions are registered with the resources listed in plan §10 (queried on a freshly migrated database); the F08/F04/F01/F09 re-runs quoted in E-16; the characterisation of composite `entity_id` over-length values as failing closed; the statement that IAM-02 is the sole caller of `verify-assertion` (Sonnet re-read confirms it by search, E-17).

## 12. Checks (revision 3)
| Check | Command / method | Status | Evidence |
|---|---|---|---|
| baseline | `git rev-parse` (top-level, branch, HEAD), `git status`, `git remote get-url origin` | PASS — branch `docs/IAM02-AUTHZ-REM-001`, HEAD `fd94dc97…`, three modified task files only | summary |
| owner decision | Issue #6 read in full (public API) | PASS — comments `6340362022` and `6340858922` present and read | E-20 |
| source re-reads | `grep`/`sed` of IAM-01, IAM-02, SEC-01 sources, grants, migrations, tests, blueprint | done | E-16…E-19 |
| reproductions | — | **NOT_RUN in revision 3** (Opus reported only) | E-16 |
| repository test suites, `typecheck`, lint, `migrate:up` | — | **NOT_RUN** (documentation-only task) | – |
| consistency check of the three revised records | requirement ↔ finding ↔ test ↔ decision identifiers cross-checked by script and by reading (results in the final report) | done | see report |

## 13. Reviewer provenance for revision 3
| Source | Attribution | Notes |
|---|---|---|
| Focused Opus verification of revision 2 (verdict **OWNER DECISION REQUIRED**, read-only, chat only, **not stored in the repository**) | NF-1…NF-9, the amended implementation contract, the OD classifications, V-9/V-10 context | Fresh session, but the user's persistent project memory index (with a summary of the earlier planning) was loaded; it states it re-checked every claim against source and executed the reproductions in E-16. **Not** the D-7 post-implementation review. |
| Items re-read by Sonnet in revision 3 | Issue #6 comments; E-16 code facts; E-17; E-18; E-19 | *rev-3 re-read* |
| Items still **Opus reported** | E-16 executed results; E-21 | Carried as reported; no Sonnet re-execution. |

## 14. Revision-3 finding and defect traceability
| Opus item | Recorded as | Plan sections |
|---|---|---|
| NF-1 | F10 (refined) | AZ-16, AZ-19, T-46, T-52; §4B R-2, R-6 |
| NF-2 | F11 (new, proposed) | AZ-16 (v), T-47; §4B R-1 (maker side open) |
| NF-3 | plan defect P5 | §8.1 exception X-1, AZ-05 |
| NF-4 | plan defect P6 | AZ-09, §8.1 exception X-2, T-24, T-25, T-44 |
| NF-5 | plan defect P7 | AZ-18, T-38 |
| NF-6 | plan defect P8 | AZ-17, §7 (072), T-48, T-49 |
| NF-7 | plan defect P9 | AZ-02, T-54 |
| NF-8 | plan defect P10 | AZ-02, §4B R-3 |
| NF-9 | plan defect P11 | AZ-20, T-50 |
None is promoted to `docs/OPEN_FINDINGS.md`, accepted or closed. F09 remains cross-referenced to, not equated with, `IAM2-FIND-001`.

## Changed files
- `docs/03_implementation/tasks/IAM02-AUTHZ-REM-001/01-plan.md` (revision 1 new at `fd94dc9`; revisions 2 and 3 modified, uncommitted)
- `docs/03_implementation/tasks/IAM02-AUTHZ-REM-001/03-evidence.md` (revision 1 new at `fd94dc9`; revisions 2 and 3 modified, uncommitted)
- `docs/03_implementation/tasks/IAM02-AUTHZ-REM-001/task.json` (revision 1 new at `fd94dc9`; revisions 2 and 3 modified, uncommitted)

## Targeted evidence references
- `docs/OPEN_FINDINGS.md` 105–117 — registered state, unchanged by this task.
- `platform/services/iam2/src/routes/approvals.ts`, `routes/roles.ts`, `routes/internal.ts`, `lib/guard.ts`, `lib/decision-token.ts` — defect locations (§2).
- `platform/tests/integration/cfg1-iam2-guard-real.test.ts:248` — accepted test encoding the baseline-pass semantics (§4, E-5).
