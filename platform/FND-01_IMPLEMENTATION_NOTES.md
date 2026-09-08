# FND-01 Implementation Notes — Findings F1–F3

Tracks disposition of the three medium findings raised in
`docs/FND-01_Implementation_Review_v0.1.md` §3. Blueprint reference:
`modules/FND-01_Platform_Foundation_Blueprint_Pack_v1.2` §05.5.3 / §5.3.

## F1 — Idempotency baseline wired into sensitive writes — CLOSED

`POST /foundation/scheduler/jobs/register` and `POST /foundation/jobs/enqueue` now require
an `Idempotency-Key` header (fail closed with `IDEMPOTENCY_KEY_REQUIRED` if missing/blank,
before any DB work). Inside the same `withTransaction` used for the action, the handler
calls `beginIdempotent(client, scope)` — scope is `(actor_id, actorType: "service",
namespaced action, Idempotency-Key)` with the fingerprint computed from the validated
request body. A `"new"` outcome performs the insert(s) + `publishAudit` (still
transaction-coupled) and finishes with `completeIdempotent`. A `"duplicate"` outcome
(same key + same fingerprint) skips the work/audit and returns a replay-safe envelope
(`replayed: true`, prior `result_ref`) with HTTP 200. A fingerprint mismatch on a reused
key propagates `beginIdempotent`'s `VALIDATION_ERROR` unchanged. See
`services/fnd/src/routes/scheduler.ts` and `services/fnd/src/routes/jobs.ts`.

## F2 — Readiness licence-lock placeholder — CLOSED

`GET /foundation/readiness` no longer reports `licence_lock_interface: "pass"`. It now
reports `status: "not_configured"`, `mode: "interim_pre_cfg"`, and a note that CFG-01 will
replace it with a real fail-closed check. `blocking` is `false` for dev/qa/uat/staging and
`true` for `prod` — in production a `not_configured` licence lock now fails the whole
readiness response closed (`status: "not_ready"`, HTTP 503). The DB-backed checks are
relabelled `db_backed_queue` / `db_backed_audit_outbox` (they are DB-backed, not a separate
broker). The computation is a pure, DB-free helper — `buildReadiness()` — exported from
`services/fnd/src/routes/system.ts` and unit-tested in `tests/unit/readiness.test.ts`; the
route itself only calls `pingDatabase` then the pure helper.

## F3 — Module-boundary / cross-schema isolation enforcement — DEFERRED

Still convention-only (`fnd_runtime_grants.sql`), as originally noted — this is correct for
now because only one schema (`foundation`) exists. **Not built in this patch** (out of
FND-01 scope; second-schema tests would be untestable/artificial today). Deferred until
IAM-01 introduces the second schema (`services/iam` + `002_iam_auth_session`). At that
point IAM-01 must add:

- (a) a test proving the IAM runtime DB role is denied when it attempts to read/write a
  foreign schema (e.g. `foundation`);
- (b) a test proving a request with missing/absent client scope fails closed rather than
  defaulting to an unscoped read;
- (c) an import-boundary lint/test that prevents one module from importing another
  module's internals (e.g. `services/iam` importing from `services/fnd/src/**` directly,
  or reaching past `@aix/foundation`'s public surface).

Reference: blueprint §05.5.3 (deployment/isolation tests) and §5.3 (module boundary
rules). Tracked as the first item IAM-01 must land alongside its own slice.

## Final acceptance — 2026-07-11

Independent Opus final review accepted FND-01 as the platform foundation baseline
(ref: `aix-platform/docs/FND-01_Final_Review_Opus_v1.0.md`). IAM-01 Authentication /
MFA / Session is next.

## C2 closed — idempotency_record cross-module isolation (post-acceptance patch)

IAM-01's final review (C1) and IAM-02 planning (`docs/implementation/
IAM-02_Implementation_Plan_v1.0.md` §7) both flagged that `foundation.idempotency_record` is
shared cross-module infrastructure: every module's runtime role needs the full
SELECT/INSERT/UPDATE cycle on it for `beginIdempotent`/`completeIdempotent`, and a table-level
grant alone cannot stop one module reading/mutating another's rows. This was carried forward as
"C2" rather than fixed immediately, on the basis that it should be resolved before a third
module (IAM-02) started consuming the table.

**Fix (migration `infra/migrations/005_fnd_idempotency_module_scope.cjs`):** added a
`source_module` column (shape-checked via `CHECK (source_module ~ '^[A-Z]{2,4}-[0-9]{2}$')`, not
an enum, so new modules never require a migration edit), folded it into the uniqueness key
(`UNIQUE (source_module, actor_id, action, idempotency_key)` — cross-module key collision is now
structurally impossible, not just RLS-hidden), and enabled + forced RLS with a policy scoped to
`current_setting('aix.module', true)` — the exact `aix.user_id`/`withUserScope` pattern IAM-01's
S1 patch proved, applied per-module instead of per-user. `packages/foundation/src/idempotency.ts`
now requires a `sourceModule` field on `IdempotencyScope` (a compile-time literal supplied by the
calling module's own route code, never derived from request/user input — this is what prevents a
caller spoofing another module's scope) and sets `aix.module` on the caller's already-open
transaction before touching the table. No grant changed — RLS is the isolation mechanism, the
existing table-level grants on `role_fnd_runtime`/`role_iam_runtime` are unchanged.

**Verified independently on a fresh disposable Postgres** (migrations 001→005, both grant
files, full suite): **123/123 tests pass** (118 baseline + 4 new FND + 1 new IAM). Direct proof
under dedicated non-superuser LOGIN roles (member of `role_fnd_runtime`/`role_iam_runtime`
only): each module's role sees only its own rows even when many rows from both modules exist
side by side; cross-module UPDATE by primary key is blocked (0 rows affected) in both
directions; a connection with `aix.module` never set sees zero rows despite data existing
(fail-closed); C1 (`foundation.outbox_event` INSERT-only for `role_iam_runtime`) is unaffected.

**C2 is closed.** This `source_module` + RLS pattern is now the standard every future module —
including IAM-02 — must use when consuming the shared idempotency helper; IAM-02 may proceed as
the third consumer without widening cross-module access.
