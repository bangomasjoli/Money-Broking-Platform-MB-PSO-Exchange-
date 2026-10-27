# 03 Evidence — IAM02-AUTHZ-REM-001

> Facts read from the repository and check output collected for this documentation checkpoint. Reference commits and files; no source copies, no large logs. Reproduction code lived outside the repository (session scratch) and is described, not stored; the implementer converts it into repository tests (plan §8).

- **Collected:** revision 1 2026-10-21T18:46Z; revision 2 2026-10-22 (Asia/Kuching); revision 3 2026-10-22 (Asia/Kuching, documentation-only). Revision-1 sections below are kept as recorded (§1–§6, §7 rev-1 text); revision-2 additions are §8–§10 and the entries E-10…E-15, and carry the label *rev-2*; revision-3 additions are §11–§14 and the entries E-16…E-22, and carry the label *rev-3 re-read* (Sonnet re-read source or the Issue) or *Opus reported* (focused Opus verification, not re-run).
- **Revision 6 (2026-10-28, Asia/Kuching, documentation-only):** governance records `02-implementation-report.md`, `04-review.md` and `05-remediation.md` added retrospectively and stale wording corrected; see §17. Statements below that the branch is "not pushed" or "local" describe the position when they were written: the branch was later pushed and draft PR #7 opened (§17.2).
- **Revision 4 (2026-10-28, Asia/Kuching):** implementation committed locally on `task/IAM02-AUTHZ-REM-001-impl` as `39639c0b6c5cc45b7e9012680cfd5268e037b318` (parent `a892bf374de2bf1291f7ba269d69bcfde9a9d66c`, not pushed); evidence in §15. The bullets below record revisions 1–3 as written; where they say "uncommitted" or "no commit" they predate `a892bf3` and this implementation commit.
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

## 15. Revision-4 evidence: implementation checkpoint and independent technical review (collected 2026-10-28, Asia/Kuching)

> Status words are used exactly: **VERIFIED** = observed by running the command or reading the file in this checkpoint; **REVIEWER-REPORTED** = stated in the independent Opus report (delivered in chat, not stored in this repository; its harness lived in session scratch and is described, not stored) and **not** re-run by the Sonnet checkpoint writer. Nothing here is acceptance, a finding closure or a production-readiness claim.

### 15.1 Implementation commit (VERIFIED)
- **Commit:** `39639c0b6c5cc45b7e9012680cfd5268e037b318`, `fix(iam2): harden approval authorisation and decision-token execution`; parent `a892bf374de2bf1291f7ba269d69bcfde9a9d66c`; branch `task/IAM02-AUTHZ-REM-001-impl`; **local only, not pushed**. 20 files, +4656 / −198.
- **Authority:** Issue #6 comments `6340858922` (implementation on a separate branch), `6345549226` (X-3, IMPL-01…04), `6446493744` (D7-01, D7-02) and `6448272837` (N-1 and two local commits; read in full).
- **Scope (exact paths, 11 modified + 9 added):**
  - IAM-01, additive `verify-assertion` identity fields only: `platform/services/iam/src/routes/step-up.ts`.
  - IAM-02 source: `platform/services/iam2/src/lib/{decision-token,errors,guard,iam01-client,sod}.ts`, new `platform/services/iam2/src/lib/approval-decision.ts`, `platform/services/iam2/src/routes/{approvals,internal,roles}.ts`.
  - Migration (schema only): `platform/infra/migrations/072_iam2_approval_authz_hardening.cjs`.
  - Tests: modified `platform/tests/integration/iam2-db.test.ts`, `platform/tests/unit/iam2-guard.test.ts`; new `platform/tests/integration/{iam-verify-assertion-runtime-role,iam2-authz-rem-consumers-real,iam2-authz-rem-db,iam2-authz-rem-decision-db,iam2-authz-rem-iam01-e2e,iam2-migration-072}.test.ts`, `platform/tests/unit/iam2-authz-rem.test.ts`.
- **Not in the commit (VERIFIED by path inspection before staging):** any file under `docs/`, `platform/infra/grants/`, `platform/package*.json`, `platform/packages/` or the consumer services (`sec1`, `cfg1`, `clt1`, `aml1`, `kyc1`, `wlt1`, `fnd`); no migration 073 (the migrations directory ends at 072); migration 072 contains no `GRANT`, `REVOKE` or `INSERT`; no policy seed; no secret pattern (two synthetic test-fixture passwords for `example.invalid` identities on disposable databases, the same pattern as existing IAM tests).
- **`task.json` tallies (manual; the conductor did not drive these rounds):** `roundCounts.review` = 2 independent review rounds (the fresh-session D-7 review, REMEDIATE; the focused D7 re-review, ACCEPT WITH CONDITIONS); the non-independent same-conversation review of 2026-10-22 is not counted. `roundCounts.remediation` = 3 owner-authorised remediation passes (Issue #6 comments `6345549226`, `6446493744`, `6448272837`). `implementer` and `reviewer` stay `null` because no conductor execution records exist; `state` is `IMPLEMENTATION_COMPLETE` and `acceptanceStatus` stays `NOT_ACCEPTED` with no `acceptance` object. `findingsSummary` is unchanged.
- **Code changed after the independent review:** exactly one file, `platform/tests/integration/iam2-authz-rem-db.test.ts` (N-1, §15.2), test-only. It has **not** been re-reviewed by an independent session. All other 19 paths are byte-identical to the tree the reviewer examined (the tree hash matched the reviewed baseline at the start of this checkpoint).

### 15.2 N-1 remediation (VERIFIED)
- **Defect (reviewer-reported, reproduced here):** 53 tests in `iam2-authz-rem-db.test.ts` began with `if (!schemaReady) return;` (plus one in `beforeAll`), so a configured but unmigrated database passed them without executing any assertion. **Reproduced** with the pre-fix file against an empty database: 54 passed, 0 failed, nothing run.
- **Change:** `beforeAll` now records a prerequisite error (missing schema `foundation`/`iam`/`iam2`, missing role `role_iam2_runtime`, migration 072 not applied, `iam2_runtime_grants.sql` not applied, unreachable server or failed test-role setup) and `assertPrerequisites()` replaces each guard, so every database-dependent test **fails** with that evidence; with `TEST_DATABASE_URL` unset a named `it.skip` states the reason (the convention already used by `iam2-authz-rem-iam01-e2e.test.ts` and `iam2-migration-072.test.ts`). The diff against the pre-fix file has exactly three hunks (header comment, declarations, `beforeAll`); with the guard substitution reversed no other line differs, so **no assertion was added, removed or weakened**. T-22 (a source-text scan with no database) was never guarded and still runs.
- **Scenario results** (each on a fresh clone of a disposable database, `npx vitest run tests/integration/iam2-authz-rem-db.test.ts`):

| Scenario | Result |
|---|---|
| Ready (001–072 + all grant files), 3 runs | 54 passed, 0 failed, 0 skipped each |
| Empty database | 53 failed with `PREREQUISITE UNAVAILABLE … schema foundation/iam/iam2 is missing`; 1 passed (T-22) |
| Migrations 001–071 only | 53 failed naming migration 072; 1 passed (T-22) |
| Full migrations, grants not applied | 53 failed naming `iam2_runtime_grants.sql`; 1 passed (T-22) |
| Unreachable server (`ECONNREFUSED`) | 53 failed with the connection error; 1 passed (T-22) |
| `TEST_DATABASE_URL` unset | 55 reported skipped, the named reason first; 0 passed |
| Pre-fix file, same empty database | **54 passed** (the false-green) |
| Pre-fix file, migrations 001–071 / grants missing | 45 / 51 failed with unactionable errors (`Cannot read properties of undefined`) |

- **Sibling files, NOT remediated (outside the authorised scope; follow-up needs owner authorisation):** `platform/tests/integration/iam2-authz-rem-decision-db.test.ts` (5 test blocks plus `beforeAll`) and `platform/tests/integration/iam2-authz-rem-consumers-real.test.ts` (3 test blocks plus `beforeAll`) still use `if (!schemaReady) return;` and can pass without running against an unmigrated configured database. The independent review reported N-1 for `iam2-authz-rem-db.test.ts` only; these two were found while implementing N-1. Not registered as a finding. **[Forward reference, added 2026-10-28: this sentence records the position when §15 was written. Both sibling files were corrected afterwards in commit `928c828`; see §16.2–§16.5.]**

### 15.3 Checks run in this checkpoint (VERIFIED)
Environment: PostgreSQL 17.10, localhost only, throwaway cluster with its own data directory; no shared, staging or production database; migrations `001`…`072` applied from scratch with `npx node-pg-migrate -m infra/migrations --no-check-order up` after creating the nine `role_*_runtime` roles; all nine `infra/grants/*.sql` files applied; every run used a fresh database cloned from that migrated template.

| Check | Command (abridged) | Result |
|---|---|---|
| Targeted IAM-02 / IAM-01 / consumer batch (16 files: `iam2-db`, the four `iam2-authz-rem-*` integration files, `iam2-migration-072`, `iam-verify-assertion-runtime-role`, `aml1`/`cfg1`/`clt1-iam2-guard-real`, `iam-app`, `iam2-app`, `iam2-authz-rem`, `iam2-decision-token`, `iam2-guard`, `iam2-import-boundary`) | `TEST_DATABASE_URL=<clone> npx vitest run <files>` ×3 | **257 passed, 0 failed, 0 skipped**, all three runs |
| D7-01 role-substitution subset | same file with `-t D7-01` | 8 passed (46 deselected) |
| Decision-token single-use / concurrency | within the batch (titles matching T-36, concurren*, single-use) | 25 tests passed |
| Typecheck | `npm run typecheck` | exit 0 (incremental build state was up to date) |
| Forced typecheck | `tsc -b --force` in a scratch copy of `platform/` | exit 0 |
| Changed test file | `tsc --noEmit` on `iam2-authz-rem-db.test.ts` (test files are outside `tsc -b`) | exit 0 |
| Full suite, run A | `TEST_DATABASE_URL=<clone> npx vitest run` | 5589 tests: **5532 passed, 4 failed, 53 skipped** |
| Full suite, run B | same, fresh clone | 5589 tests: **5531 passed, 5 failed, 53 skipped** |

**The full suite did not pass cleanly in either run.** Classification of every failure:
- **Pre-existing, 3 in both runs:** `tests/integration/perf-m2a-observe.test.ts` (`expected 'INVALID' to be 'OBSERVED'`); the same 3 fail on an export of `a892bf3`.
- **Pre-existing, database-isolation race (run A 1, run B 2):** `tests/integration/clt1-principal-membership-route.test.ts` (foreign-key violations on `authorised_user` / `client_profile`) when it shares a database with `clt1-db.test.ts`. The pair failed in **6 of 6** runs on this tree and **6 of 6** on an export of `a892bf3`; the CLT-01 test and service files are identical to `a892bf3`. It is intermittent inside the full suite. Not caused by this work; not remediated.
- **Skipped, 53:** live edge / UAT files needing external infrastructure (`imp02-edge-live` 23, `imp02-uat-tls-live` 22, `imp02-uat-topology-live` 8). Intentional; not evidence of anything.
- **Introduced by this work:** none observed. Absence of an observed regression is not proof of its absence.
- Two full runs on the `a892bf3` export (5479 tests) showed 7 and 4 failures: the 3 `perf-m2a`, `clt1-db` ×2 (run 1), one `wlt1-fiat-approval-route` 409 (run 1, did not recur) and `perf-harness-boundaries` ×1 (an artefact of exporting HEAD to a directory that is not a git repository).

### 15.4 Independent Opus technical verdict: ACCEPT WITH CONDITIONS (REVIEWER-REPORTED)
- **Date and subject:** 2026-10-28; focused re-review of D7-01 (HIGH, role substitution) and D7-02 (LOW, e2e test isolation) against the uncommitted tree at `a892bf3` (11 tracked modifications + 9 untracked). Read-only. **This is a technical review verdict, not owner or governance acceptance.**
- **Provenance, stated precisely:** it ran in a **new session** and independently reproduced the claims below. It **automatically inherited** the user's project-memory summary (the memory index and the IAM-02 project-state note, which recorded earlier verdicts and the D7 fix as leads) and the user-level instructions file. It also read tracked-diff and file-hash snapshots left by an earlier session in a scratch directory to identify which files D7 changed; the snapshot's author was not verified by the reviewer. Reviewer model as stated by the session: `claude-opus-5-5`; effort not recorded. It therefore does **not** have "no inherited context". The earlier same-conversation Opus review (2026-10-22, also ACCEPT WITH CONDITIONS) did **not** satisfy D-7 and is supporting evidence only. The fresh-session D-7 review of 2026-10-27 returned REMEDIATE (D7-01 HIGH, D7-02 LOW; recorded in Issue #6 comment `6446493744`).
- **D7-01 (reported resolved):** `roles.ts` derives `fingerprint({ role_code, target_user_id })` on the server from the role actually assigned and the URL target; a caller-supplied `current_payload_hash` can only be an extra consistency check; the server value is never null. An independent real-HTTP harness (real IAM-01 and IAM-02 processes, each logged in as its own runtime role only, disposable database) passed **25 of 25** checks in each of two complete runs: A→A succeeds with and without a hash; A approved/B executed is refused with A's hash, B's hash and no hash; target X→Y refused with X's hash, Y's hash and none; inconsistent hash, forged null-hash tokens, fabricated `approval_id`, explicit deny after approval and replay all refused with no role row; every payload-hash and binding mismatch revoked the token and committed exactly one Critical audit, while entitlement-deny, provenance and schema refusals left the token active; audit text never contained a hash value; 24 trials of 8 concurrent redemptions and 24 mixed A/B races never produced more than one success or any role B. Mutation checks: restoring trust in the caller hash assigned role B (15/25); removing only the asserted-hash comparison failed exactly the two "supplied hash must match" checks (23/25).
- **D7-02 (reported resolved):** the e2e file builds and drops its own disposable database; the shared database held 0 identities, 0 outbox rows and 0 user roles after a run; no `aix_e2e_*` database survived any run; unreachable server and missing CREATEDB privilege fail every test with a named prerequisite; unset URL gives a named skip; T-51 counts are scoped to the test identity; no assertion removed. Race matrix: e2e alone 4/4 clean; `iam-db` alone 4/4; `iam-db` + new e2e **10/10** clean; `iam-db` + `iam-session-introspection` **0/10** clean on the working tree and **0/10** on an export of `a892bf3`, failing the same assertion each time.
- **`iam-db` ↔ `iam-session-introspection` race (pre-existing; reviewer-reported finding):** in the reviewer's environment this pairing fails **deterministically**, not intermittently, at `platform/tests/integration/iam-db.test.ts:179` (`expected 2 to be 1`, the "Decision #3" bootstrap `count(*)=1` check across identity-inserting files), identically on `a892bf3`. Earlier task notes described it as an intermittent race; the reviewer observed it on every run of this pairing. Not remediated; baseline suites were not modified.
- **Reviewer regression evidence:** IAM-02 batch 257/257 ×3; full suite 5533 passed, 3 failed (`perf-m2a-observe`, also failing at `a892bf3`), 53 skipped; `tsc -b` exit 0 (forced build in a scratch copy plus a deliberately broken negative control).
- **Conditions and non-blocking observations from the verdict:** (1) record the D7 evidence and the deterministic race in the task record (this section); (2) fix or record N-1 (§15.2: fixed for the authorised file; siblings open); (3) the owner decides whether to track O-1. Observations: **N-2** (INFO) the `caller_hash_differs_from_server_derived` audit reason does not say whether the token was approved for a different operation, and a substitution sent with no hash carries no reason; **N-3** (INFO) the D7-01 null-hash test asserts only "not 200, no role row", not the error code or token revocation (the reviewer's harness did).
- **Not re-run by the checkpoint writer:** the reviewer's real-HTTP harness, the mutation checks, the 10-trial race matrix on `iam-db` pairings and the disposable-database failure-mode runs for the e2e file. The checkpoint writer did re-run the batch, D7-01 subset, full suites, typechecks, the CLT-01 pair and the N-1 matrix (§15.2–§15.3).

### 15.5 Observation O-1 — unresolved design observation (not a finding)
`iam2.approval_request` stores `payload_hash` and a maker-controlled free-text `payload_ref`; it does **not** reliably present the actual role and target to the human checker. With D7-01 the hash binding is now enforced server-side, so the checker approving a hash is the next weak link: a checker cannot see what they are approving from the record. This predates this work, is **not fixed** here, and is **not** registered in `docs/OPEN_FINDINGS.md` (no authorisation to do so). Treat as a maker-checker workflow design question and a **dependency for real-approval UAT**, pending human review (related to OD-2).

### 15.6 Residuals and dependencies — all still open (VERIFIED as unchanged by reading the code and plan §4B)
- **R-1** maker (and any non-approver) account status is not enforced; **R-2** carry-forward L3 (caller-asserted maker, rejecter, acting-admin and consumer actor identities) is not remediated, the reject path takes no assertion; **R-3** CFG-01 capability, kill-switch and licence-profile enforcement is not an IAM-02 control; **R-4** time-of-check/time-of-use between the wrapper's transaction and the consumer's own write; **R-5** step-up assertion reuse within its TTL (L2 reduced, not closed); **R-6** eligibility is a classification (`staff`/`admin`), not proof of personhood; **R-7** approver status can change between the check and commit and is not re-checked at execution.
- **Findings:** `IAM2-FIND-001…004` remain `OPEN` in `docs/OPEN_FINDINGS.md` (unchanged). F01…F11 remain PROPOSED and unpromoted; none is closed. The review labels D7-01, D7-02, N-1…N-3 and O-1 are review observations, not registered findings.
- **Consumers (OD-2):** no consumer production code changed; consumers' advisory baselines and their payload-object retrieval for the request step are unchanged. Real approval flows for CLT-01, KYC-01, AML-01, CFG-01, SEC-01 and WLT-01 are not demonstrated.
- **Policy and grants (OD-3, OD-4):** no `approval_policy` row exists and migration 073 is not authored, so with the fail-closed behaviour no protected action can complete an approval until policy configuration is separately reviewed and authorised; no role grants or checker roster were added.
- **Multi-approver (OD-5):** policies requiring more than one approver remain refused (AZ-18) until a separate task lifts it.
- **Deployment/integration:** migration 072 was applied only to disposable local databases; an IAM-01 without the additive fields makes every approval fail closed (T-50). Nothing was executed against a shared, staging or production database.
- **Not done:** push, merge, UAT, production-readiness or regulatory claim, owner acceptance (`06-acceptance.md` does not exist), `OPEN_FINDINGS.md` / `DECISION_LOG.md` / register edits. `01-plan.md` is intentionally unchanged and still describes the pre-implementation contract; the sections above supersede its "unimplemented" wording for implementation status only. `02-implementation-report.md` and `04-review.md` were not created: no conductor execution records exist, and the review is recorded here from the reviewer's chat report. **[Update, added 2026-10-28: `02-implementation-report.md`, `04-review.md` and `05-remediation.md` were later created as retrospective records, not conductor executions; see §17.]**
- **Next checkpoint (owner):** whether to authorise remediation of the two sibling N-1 files, whether to track O-1, whether to push or merge the branch, and, separately, controlled task acceptance.

## 16. Addendum (2026-10-28, Asia/Kuching): sibling test-reliability correction

> Additive and dated; §1–§15 are not rewritten. Written by the Sonnet checkpoint writer. **VERIFIED** = observed by running the command or reading the file in this checkpoint. Nothing here is acceptance, a finding closure or a production-readiness claim.

### 16.1 Authority and baseline (VERIFIED)
- **Authority:** Issue #6 comment `6448938869` (2026-10-27T17:30:47Z), read in full: correct the two remaining false-green test files, one local test-only commit, one local evidence addendum, no push or merge.
- **Preflight:** branch `task/IAM02-AUTHZ-REM-001-impl`; HEAD `64889785888b68107ed58517c827b3ca9edcaced`; working tree clean; no upstream; the branch is not on the remote; ancestry `a892bf3` → `39639c0` → `6488978` confirmed; no stash.

### 16.2 Test-only commit (VERIFIED)
- **Commit:** `928c828cc67b56ccac756070188a0ae4a8a2e760`, `test(iam2): fail visibly when security test prerequisites are missing`; parent `64889785888b68107ed58517c827b3ca9edcaced`; local, **not pushed**; 2 files, +161 / −36.
- **Files (the only paths changed):** `platform/tests/integration/iam2-authz-rem-decision-db.test.ts`, `platform/tests/integration/iam2-authz-rem-consumers-real.test.ts`.
- **Change:** the same approach as N-1 (§15.2). `beforeAll` records a prerequisite error (missing schema `foundation`/`iam`/`iam2`, missing `role_iam2_runtime`, migration 072 not applied, runtime grants missing, including `INSERT` on `iam2.approval_decision` and `iam2.sod_check` for the decision file and on `iam2.approval_decision` and `iam2.permission_decision_token` for the consumers file, unreachable database, or a test login role / listening app that cannot be prepared); every database-dependent test calls `assertPrerequisites()` and fails with that evidence; with `TEST_DATABASE_URL` unset a named `it.skip` states the reason. 5 + 3 guard blocks replaced (the consumers file generates 11 tests from 3 blocks and a loop); the `beforeAll` guards were folded into the new setup.
- **Not weakened:** with the guard substitution reversed, each file differs from its pre-fix version in exactly three hunks (header comment, declarations, `beforeAll`); no test body changed. The decision file's runtime-role assertion (not superuser, not `BYPASSRLS`) is preserved inside the new setup and, if it fails, now fails every test. Neither file contains a test that legitimately needs no database, so none is exempted. `git diff --check` clean; `tsc` on the two files exits 0 (a planted type error is caught by the same check).
- **Not touched:** production code, migrations, grants, policies, consumer code, other tests, registers.

### 16.3 False-green reproduction on the pre-fix files (VERIFIED)
Run from an untouched scratch mirror holding the old files, on fresh clones of disposable databases (16 tests in total: decision-db 5, consumers-real 11).

| Scenario | Pre-fix result |
|---|---|
| Healthy | 16 passed |
| **Empty database** | **16 passed, 0 failed: no assertion executed** |
| Migrations 001–071 only | decision-db 5 **passed** (they do not need 072, so the missing migration went unnoticed); consumers 11 skipped because `beforeAll` threw |
| Grants not applied | 16 failed with unactionable errors (`current transaction is aborted`, HTTP 500) |
| Unreachable server | 16 reported **skipped**, not failed |

### 16.4 Post-fix prerequisite results (VERIFIED)
`npx vitest run` on both files, fresh clone of a disposable database per run:

| Scenario | Result |
|---|---|
| Healthy (001–072 + all grant files), 3 runs | 16 passed, 0 failed, 0 skipped each |
| Empty database | 16 failed: `schema foundation/iam/iam2 is missing (run migrate:up)` |
| Migrations 001–071 only | 16 failed: `migration 072 is not applied (iam2.approval_request.snapshot_taken_at_utc is missing)` |
| Full migrations, grants not applied | 16 failed: `iam2_runtime_grants.sql is not applied (role_iam2_runtime lacks SELECT on iam2.approval_request; … INSERT on …)` |
| Unreachable server | 16 failed: `[ECONNREFUSED] connect ECONNREFUSED 127.0.0.1:1` |
| `TEST_DATABASE_URL` unset | 18 reported skipped (the 16 plus the two named skips), the named reason first; 0 passed |

No suite-level or `afterAll` errors in the runs checked (empty, 072-missing, grants-missing, unreachable, unset, healthy). A wrongly named database also produced a precise `[3D000] database … does not exist` prerequisite failure in a discarded run (see §16.6).

### 16.5 Targeted and regression results (VERIFIED)
- **IAM-02 / IAM-01 / consumer batch** (16 files: `iam2-db`, the four `iam2-authz-rem-*` integration files including the N-1 file and the real-IAM-01 e2e, `iam2-migration-072`, `iam-verify-assertion-runtime-role`, `aml1`/`cfg1`/`clt1-iam2-guard-real`, `iam-app`, `iam2-app`, `iam2-authz-rem`, `iam2-decision-token`, `iam2-guard`, `iam2-import-boundary`): **257 passed, 0 failed, 0 skipped**, three runs (same count as §15.3).
- **D7-01 role-substitution subset:** 8 passed (46 deselected).
- **D7-02 pairing `iam-db` + the e2e file:** 41 passed, 0 failed, three runs; no `aix_e2e_*` database left behind.
- **Typecheck:** `npm run typecheck` exit 0 (incremental state); the two changed test files separately exit 0 (test files are outside `tsc -b`).
- **Consumer IAM-02 contracts:** `iam2-authz-rem-consumers-real` (CLT-01, KYC-01, AML-01, CFG-01, SEC-01, WLT-01 clients against a real listening IAM-02) and the three `*-iam2-guard-real` files are in the batch above; SEC-01 and WLT-01 route suites are in the full suite.

### 16.6 Wider verification and baseline comparison (VERIFIED)
- Two full-suite runs were **discarded as invalid** (158 failures each): my harness created a database whose name contained an uppercase letter, so the tests connected to a database that did not exist. They say nothing about the code.
- **Valid full runs on this tree (5589 tests, 53 skipped each):** failures 4, 7, 3, 4, 3. **Same suite at the pre-change commit `6488978`:** failures 3, 3, 3, 3, 6.
  - `perf-m2a-observe.test.ts` ×3: observed failing in every valid full run recorded in this section, on both trees (baseline). This is an observation of those runs, not a claim that the tests always fail; see the note below.
  - `clt1-db.test.ts` ×1 (`expected 8 to be +0`): in 2 of 5 tree runs, 0 of 5 at `6488978` here; also seen at `a892bf3` in §15.3. Shared-database CLT-01 race.
  - `wlt1-sensitive-read-route.test.ts` (count mismatches such as `expected 78 to be 76`): tree 3 failures in one run and 1 in another; baseline 3 in one run. Passes alone, 3 of 3. Shared-database count race.
  - **Neither changed file failed in any valid run.** With five runs each I cannot show the intermittent failure rates are equal, and I do not claim it; I observed no failure traceable to this change, and the changed files are test-only.
  - 53 skipped = the live edge / UAT files (23 + 22 + 8).
- **Known baseline issues, kept separate:** (1) the 3 `perf-m2a-observe` failures observed in the runs recorded in §15.3 and §16.6; (2) `iam-db` + `iam-session-introspection` fails deterministically (`expected 2 to be 1`, `iam-db.test.ts:179`), 3 of 3 again here, identical at `a892bf3` per the independent review; (3) the CLT-01 `clt1-db` ↔ `clt1-principal-membership-route` race (6 of 6 at `a892bf3` and on the tree per §15.3; not re-run here). None was modified or remediated.
- **Note added 2026-10-28 (§17): a later run did not show the `perf-m2a-observe` failures.** The PR #7 self-check (`04-review.md` round D; **same-conversation and not independent; reviewer-reported, not re-run by the record writer**) reported one further full-suite run of 5589 tests: 5535 passed, 1 failed (`clt1-db`, the known shared-database race), 53 skipped, in which all three `perf-m2a-observe` tests passed. The failures are therefore run- or environment-dependent, and their cause has not been investigated. The results recorded above are unchanged.

### 16.7 Remaining false-green limitations (VERIFIED by reading the files)
- The pattern `if (!schemaReady) return;` remains in **pre-existing, accepted-baseline suites outside the authorised paths, unchanged**: `platform/tests/integration/iam2-db.test.ts` (48 occurrences including setup; one test, line 278, is fail-visible), `aml1-iam2-guard-real.test.ts` (18; one fail-loud canary), `cfg1-iam2-guard-real.test.ts` (17) and `clt1-iam2-guard-real.test.ts` (25). Against a configured but unmigrated database most tests in these files pass without executing assertions. Other modules' suites were **not audited**. Not remediated; not registered as a finding; a further correction needs separate owner authorisation.
- The prerequisite check proves the presence of the schemas, role, migration-072 column and the named table privileges. It does not prove every grant or every later migration is applied.
- The named skip hides nothing but also proves nothing: an unset `TEST_DATABASE_URL` run is skipped, not passed.

### 16.8 Provenance and open items (carried forward, unchanged)
- **Independent Opus verdict (2026-10-28), ACCEPT WITH CONDITIONS, REVIEWER-REPORTED:** as in §15.4: a new session that independently reproduced D7-01/D7-02 results but **automatically inherited the project-memory summary** and read a prior session's scratch snapshot; a technical verdict, not owner or governance acceptance. Its condition "fix or record N-1" is now met for the three IAM-02 remediation database files that had the pattern (`iam2-authz-rem-db`, `-decision-db`, `-consumers-real`; the e2e and migration-072 files already failed visibly); this addendum's two commits have **not** been re-reviewed by an independent session (both are test-only).
- **R-1…R-7** remain open, exactly as in §15.6. **O-1** remains an unresolved checker-comprehension observation and a dependency for real-approval UAT; it is not a registered finding. `IAM2-FIND-001…004` and F01…F11 are unchanged; nothing is closed.
- **Status:** `IMPLEMENTATION_COMPLETE` / `NOT_ACCEPTED`. `task.json.roundCounts.remediation` is raised from 3 to 4 (manual tally; this authorisation, Issue #6 comment `6448938869`); `findingsSummary`, `acceptanceStatus`, `resultingCommit` (the implementation commit `39639c0`) and `state` are unchanged.
- **Next owner checkpoint:** push or merge review; whether to authorise the remaining silent-return suites (§16.7); whether to track O-1; and, separately, controlled task acceptance.

## 17. Governance record completion (2026-10-28, Asia/Kuching): documentation-only checkpoint

> Additive and dated; §1–§16 are not rewritten (the corrections above are bracketed or minimal). Written by the Sonnet checkpoint writer. **VERIFIED** = checked against git or GitHub when written. Nothing here is acceptance, a finding closure or a production-readiness claim.

### 17.1 Authority and baseline (VERIFIED)
- **Authority:** Issue #6 comment `6450001986`, read in full: Option A, acceptance-before-merge; this checkpoint prepares missing governance records and corrects stale documentation only. It grants no acceptance, no push, no merge, no ready-for-review and no D-7 exception.
- **Preflight:** branch `task/IAM02-AUTHZ-REM-001-impl`, HEAD `5969c2cb606dcb2476f514fd124853db0577e79e`, clean tree, no other writer; PR #7 open, draft, unmerged, head `5969c2c`, base `main` `effcdf39c6666f014ce7c9776f83903f6263381f`; the task folder held only `01-plan.md`, `03-evidence.md`, `task.json`.

### 17.2 Status since §16 (VERIFIED against GitHub)
The branch was pushed (Issue #6 comment `6449571186`) and draft PR #7 was opened against `main`; remote branch head equals `5969c2c`. The earlier "not pushed" / "local" wording in §15–§16 was true when written and is superseded for repository status only.

### 17.3 Records created (retrospective; not conductor executions)
- `02-implementation-report.md` — the implementer's account of commit `39639c0`, its scope, files and limits, with results tagged implementer-reported or reviewer-reported.
- `04-review.md` — an archival summary of review rounds A–D. Round C is the Opus **ACCEPT WITH CONDITIONS** technical verdict; round D is the PR #7 self-check, which declared itself **not independent**. Original reports, execution identifiers and harness files are **not on file** and are not invented. No round-specific files were created because no round's original evidence is recoverable.
- `05-remediation.md` — IMPL-01…04 and X-3, D7-01 and D7-02, N-1 and the two sibling test fixes, each with its Issue #6 authority, the commit it was first committed in, before/after effect and who verified it.

### 17.4 Corrections made (VERIFIED by diff)
`task.json`: title no longer says "not pushed" or that the sibling tests are unresolved, and `relevantRecordPaths` lists the new records. `03-evidence.md`: header bullet, a forward reference from §15.2 to §16, an update note on the "were not created" sentence in §15.6, the §16.6 `perf-m2a-observe` wording and a dated note on the later run, and this section. No test result was altered.

### 17.5 Review provenance and its limits (read with `04-review.md`)
- The strict **clean-context D-7 condition is not established** by anything on file. "Independent" in §15.4 and §16.8 means only "run in a session other than the implementer's"; it does not assert that condition.
- The round-C reviewer ran in a new session but **automatically inherited project-memory material** and read a prior session's scratch snapshot. The same conversation later hosted the N-1 correction, the sibling fixes, the evidence commits, the push, the draft PR and the round-D self-check; the post-review changes were authored in the reviewer's own conversation. No uninvolved session has reviewed them.
- Resolving this needs a genuine clean-context review or a separate, explicit, human-approved exception (Issue #6 comment `6450001986`). None is granted here.

### 17.6 Still open and unchanged
`state` `IMPLEMENTATION_COMPLETE`; `acceptanceStatus` `NOT_ACCEPTED`; no `acceptance` object; no `06-acceptance.md`. `resultingCommit` remains the code commit `39639c0`; `roundCounts` remain a manual tally. F01…F11 proposed and open; `IAM2-FIND-001…004` open; R-1…R-7; O-1 (checker comprehension, a UAT dependency); OD-2 consumer payload delivery; OD-3 approval-policy matrix (no live policy rows); OD-4 checker roles and grants; migration 073 not authored; multi-approver fail-closed; legacy silent-return suites disclosed (§16.7). No production, UAT or regulatory claim. `docs/OPEN_FINDINGS.md`, `DECISION_LOG.md`, `DOCUMENT_REGISTER.md`, `MODULE_STATUS.md` and `CURRENT_STATE.md` are unchanged.

### 17.7 Next owner checkpoint
Resolve the D-7 review-provenance condition (clean-context review or human-approved exception); assess findings and dependencies; take a separate human acceptance decision **before** any owner-authorised merge of PR #7 (Option A). Push of this checkpoint's commit is not authorised.

## Changed files
- `docs/03_implementation/tasks/IAM02-AUTHZ-REM-001/01-plan.md` (revision 1 new at `fd94dc9`; revisions 2 and 3 modified, uncommitted)
- `docs/03_implementation/tasks/IAM02-AUTHZ-REM-001/03-evidence.md` (revision 1 new at `fd94dc9`; revisions 2 and 3 modified, uncommitted)
- `docs/03_implementation/tasks/IAM02-AUTHZ-REM-001/task.json` (revision 1 new at `fd94dc9`; revisions 2 and 3 modified, uncommitted)

- Revision 4: `docs/03_implementation/tasks/IAM02-AUTHZ-REM-001/03-evidence.md` (new §15 and one header bullet) and `docs/03_implementation/tasks/IAM02-AUTHZ-REM-001/task.json` (state, title, `resultingCommit`, `updatedAt`, review/remediation round tally). `01-plan.md` unchanged. The implementation files are listed in §15.1 (commit `39639c0`).

- Revision 5 addendum (§16): `03-evidence.md` (new §16) and `task.json` (`roundCounts.remediation`, `updatedAt`); test-only commit `928c828` changes the two files named in §16.2.

- Revision 6 (§17): `02-implementation-report.md`, `04-review.md` and `05-remediation.md` added; `03-evidence.md` and `task.json` corrected as listed in §17.4.

## Targeted evidence references
- `docs/OPEN_FINDINGS.md` 105–117 — registered state, unchanged by this task.
- `platform/services/iam2/src/routes/approvals.ts`, `routes/roles.ts`, `routes/internal.ts`, `lib/guard.ts`, `lib/decision-token.ts` — defect locations (§2).
- `platform/tests/integration/cfg1-iam2-guard-real.test.ts:248` — accepted test encoding the baseline-pass semantics (§4, E-5).
