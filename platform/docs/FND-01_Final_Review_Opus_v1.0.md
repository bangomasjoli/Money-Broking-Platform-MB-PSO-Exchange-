# FND-01 Platform Foundation — Independent Final Review (Opus, v1.0)

| Item | Detail |
|---|---|
| Module | FND-01 Platform Foundation |
| Artifact | `aix-platform/` — `@aix/foundation` + `services/fnd` + `001_fnd_core`, after the F1/F2 patch |
| Reviewer | Principal Fintech Platform Architect (Opus) — independent final sign-off |
| Inputs | Blueprint v1.2 (§01/§04/§05), implementation review v0.1 (F1–F3), F1/F2 patch (Sonnet), notes file |
| Verification | Re-ran `tsc -b` (clean) + full suite **44/44** against a fresh disposable Postgres; teardown clean |
| Verdict | **ACCEPT FND-01 as the platform foundation baseline.** F1 and F2 are genuinely closed; F3 correctly deferred. 4 minor/low observations for follow-up, none blocking IAM-01. |

---

## 0. Scope + independence

This is the final review reserved for Opus after the Sonnet coding patch. I did not write the F1/F2 patch; I re-derived its correctness from the code and re-ran the full verification myself rather than trusting the patch report. FND-01 is the base every other module inherits, so the bar here is "is this safe to build IAM-01 → PRT-01 on top of."

## 1. Re-verification of the prior findings

### F1 — idempotency wired into sensitive writes — **CONFIRMED CLOSED**
`POST /foundation/scheduler/jobs/register` and `POST /foundation/jobs/enqueue`:
- Require `Idempotency-Key`; missing/blank fails closed with `IDEMPOTENCY_KEY_REQUIRED` (400) **before any DB work** — verified by test + observed in logs.
- `beginIdempotent` runs **inside the same `withTransaction`** as the insert(s) and `publishAudit`, so the idempotency record, the business row, and the audit event are one atomic unit. A `new` outcome completes with `completeIdempotent`; a `duplicate` replays (`replayed:true`, HTTP 200, prior `result_ref`) with **no repeated audit row** (asserted by the "no duplicate audit" test); a fingerprint mismatch propagates `VALIDATION_ERROR`.
- **Concurrency is safe** — this is worth calling out as a strength: `INSERT … ON CONFLICT DO NOTHING` followed by `SELECT` under a unique `(actor_id, action, idempotency_key)` constraint serializes correctly. A concurrent second caller's insert blocks on the first transaction; after commit it reads the committed record and replays, rather than double-executing. The transaction boundary makes "reserve → act → audit → complete" all-or-nothing.

### F2 — readiness licence-lock placeholder — **CONFIRMED CLOSED**
`buildReadiness()` is a pure, DB-free function (unit-tested both ways). `licence_lock_interface` reports `not_configured` / `interim_pre_cfg` — never a false `pass` — and is **blocking in prod only**: production readiness with no CFG-01 returns `not_ready` / 503 (correct fail-closed per §5.2). DB-backed checks are honestly relabelled `db_backed_queue` / `db_backed_audit_outbox`. This is exactly right: FND-01 alone is deliberately *not* prod-ready until CFG-01 provides the real licence-lock source — the gate enforces that rather than papering over it.

### F3 — module-boundary / cross-schema isolation — **CORRECTLY DEFERRED**
Recorded in `FND-01_IMPLEMENTATION_NOTES.md` with concrete obligations handed to IAM-01 (foreign-schema-denied test, missing-client-scope fail-closed test, import-boundary lint). Building it now would be artificial with one schema. Agreed.

## 2. Controls re-checked against the blueprint

Transaction-coupled audit/outbox (§5.5), correlation mandatory on the async path (§5.6), fail-closed config (§5.2/FR-001), server-authoritative time (FR-007), no-Exchange boot guard (§5.7/§11), least-privilege DB role + RLS convention (§5.4), standard envelope + error catalogue (§04). All present and, where testable without a second module, tested. No ledger/balance/audit-edit or guard-bypass surface exists. Licence posture is clean.

## 3. Observations (minor/low — none blocking)

| # | Sev | Observation | Suggested disposition |
|---|-----|-------------|-----------------------|
| O1 | Low | **Two idempotency keys on `jobs/enqueue`** — the pre-existing body `idempotency_key` field (drives `queue_message_id` + `ON CONFLICT` on `job_queue_message`) coexists with the new header baseline. Both are consistent today, but a caller could set them independently, and `queue_message_id` is derived from the *body* field while dedup authority is the *header*. | Collapse to one in a follow-up: derive `queue_message_id` from the header key (or drop the body field). Flag for whoever owns the queue worker. |
| O2 | Low | **Internal-identity token compared with `!==`** (not constant-time). Interim seam, low risk, but it is a secret comparison. | When IAM-01 replaces this seam, use a constant-time compare; acceptable as-is for the interim. |
| O3 | Low | **Audit `payload_ref` inlines `metadata` as JSON.** FND callers pass only safe fields, but the contract permits a future caller to place PII/secret in `metadata` and have it persisted to the outbox. | Add a doc-comment/guard note that audit `metadata` must be non-sensitive (NFR log-safety), and let SEC-01 enforce on ingest. |
| O4 | Low | **Outbox/queue worker + scheduler missed-run detector not implemented** (durable write side + contract are). The `pending` rows are never drained yet. | Expected — it is the next FND runtime task after IAM-01, or a small follow-up. Track it so it isn't forgotten before a module actually depends on async delivery. |

Plus the standing items: `npm audit` shows dev-dep vulnerabilities (schedule a sweep); `release_registry`/`config_baseline`/`config_drift_result` have tables but no producing logic yet (deferred by design).

## 4. Verdict + conditions

**Accept FND-01 v1.0 as the foundation baseline; proceed to IAM-01.**

The foundation now does what it must: it fails closed on missing config, unknown licence state (in prod), missing idempotency key, missing correlation, and missing internal identity; it makes audit atomic with the action; and it structurally refuses an Exchange runtime. F1 and F2 are real closures, not cosmetic. The four observations are low-severity and none changes the design.

**Conditions carried into IAM-01 (not FND-01 blockers):**
1. Land the F3 trio (foreign-schema-denied, missing-client-scope fail-closed, import-boundary lint) with IAM-01's second schema.
2. Resolve O1 (single idempotency key on enqueue) when the queue worker is built.
3. Replace the interim internal-identity seam with real IAM service-identity + IAM-02 permission guard, using O2's constant-time compare.

FND-01 is ready to be built on. IAM-01 should be the first real consumer of the idempotency, audit, outbox, and context baselines proven here (`services/iam` + migration `002_iam_auth_session`).
