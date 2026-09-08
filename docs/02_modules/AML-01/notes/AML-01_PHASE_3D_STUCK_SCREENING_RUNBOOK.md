# AML-01 — Stuck Requested-Screening Detection & Recovery — Operator Runbook

Standalone operational runbook for Phase 3D (stuck requested-screening detection + operator
recovery). This is not a status/acceptance document — it carries no phase-acceptance verdict and
is not part of `AML-01_IMPLEMENTATION_NOTES.md`'s own per-phase acceptance record, which updates
only after independent Opus ACCEPT.

## What "stuck" means

A screening request is stuck when all of the following hold:

- `status = 'requested'`
- its latest provider attempt is `status = 'pending'`
- it has been in this state for longer than `AML1_STUCK_SCREENING_THRESHOLD_SECONDS` (default
  900s / 15 minutes; hard floor 300s / 5 minutes — a value below the floor fails AML-01 startup
  closed)

This happens only when the AML-01 process crashes or is killed between TX1 (the request/attempt
being recorded as `requested`/`pending`) and TX2 (recording the provider's answer) — never during
ordinary operation, since the screening lifecycle is otherwise synchronous within a single HTTP
request.

**Non-pending-attempt case (not recoverable this phase):** a `requested` request whose latest
attempt is NOT `pending` (already `succeeded`/`failed`) is a narrower, rarer crash shape — a crash
between the attempt's own terminal update and the request's own terminal update. The stuck list
still surfaces these rows (`recoverable: false`) so an operator knows they exist, but the recover
route rejects them (`AML1_STUCK_SCREENING_INVALID_STATE`). This requires manual DB-level review —
a documented Phase 3D limitation, not an oversight.

## Detecting stuck requests

**Via the API** (requires `aml1.screening.stuck_read`):

```
GET /internal/aml1/screening-requests/stuck?actor_id=<staff_id>[&min_age_seconds=<n>]
```

Returns a bounded (max 200), PII-free list: `screening_request_id`, `subject_type`, `subject_ref`,
`subject_parent_ref`, `status`, `trigger_reason`, `rescreen_of_request_id`, `attempt_id`,
`attempt_status`, `age_seconds`, `created_at_utc`, `recoverable`. `min_age_seconds` may only RAISE
the effective threshold above the configured floor — it can never surface a request younger than
`AML1_STUCK_SCREENING_THRESHOLD_SECONDS`.

**Via direct SQL** (read-only, for an operator with DB access — mirrors the route's own query):

```sql
SELECT sr.screening_request_id, sr.subject_type, sr.subject_ref, sr.status,
       spa.attempt_id, spa.status AS attempt_status,
       EXTRACT(EPOCH FROM (now() - sr.created_at_utc))::int AS age_seconds
FROM aml1.screening_request sr
JOIN aml1.screening_provider_attempt spa ON spa.screening_request_id = sr.screening_request_id
WHERE sr.status = 'requested'
  AND sr.created_at_utc < now() - interval '900 seconds'
ORDER BY sr.created_at_utc ASC;
```

**Via monitoring:** every route-triggered monitoring run (`POST /internal/aml1/monitoring-runs`,
either `trigger_reason`) also detects stuck subjects and raises a `rescreen_overdue` risk signal
(`GET /internal/aml1/risk-signals?...`) plus an `aml1.stuck_screening_detected` audit event for
each one — this happens automatically, with no operator action required, but monitoring only
DETECTS; it never recovers or fails a stuck request itself.

## Recovering a stuck request

**Via the API** (requires `aml1.screening.stuck_recover` — a genuine role-granted `allow`; an
`approval_required`/`step_up_required` baseline decision does NOT authorise this action):

```
POST /internal/aml1/screening-requests/:screening_request_id/recover
{ "actor_id": "<staff_id>", "reason_code": "<one of the closed set below>" }
```

Allowed `reason_code` values (closed set, no free text accepted):

- `process_crash_orphan`
- `provider_call_abandoned`
- `deployment_interruption`
- `manual_operator_recovery`

This marks the request `failed` and its attempt `failed` (with
`failure_reason_code = "stuck_recovery_<reason_code>"`), publishes `aml1.stuck_screening_recovered`,
and returns the same safe projection the list route uses. **No evidence is ever deleted.** The
route re-checks the request's actual age against the configured threshold inside its own
transaction — never trusting a stale list-route snapshot — so a request that became fresh (or was
completed/failed by something else) between listing and recovering is rejected with
`AML1_STUCK_SCREENING_TOO_FRESH` / `AML1_STUCK_SCREENING_INVALID_STATE` rather than force-recovered.

## Required follow-up: recovery does not itself screen anyone

**Recovery only unblocks the subject — it does NOT perform a new screen.** After recovery, the
subject's latest request is `failed` — a state NO detection surface in AML-01 selects for
re-screening: stuck detection only selects `status='requested'`, and `periodic_due` monitoring only
selects `status='completed'`. **A monitoring cycle will NEVER automatically re-screen a recovered
subject.** The operator MUST manually trigger the re-screen themselves; there is no cycle or
automation to fall back on:

```
POST /internal/aml1/screening-requests/:source_screening_request_id/rescreen
{ "trigger_reason": "manual", "requested_by": "<staff_id>" }
```

Use the just-recovered request's own `screening_request_id` as `:source_screening_request_id` —
`lib/rescreen.ts` carries the subject's declared identity forward from its snapshot, so the
operator never re-supplies PII. Skipping this step leaves the subject genuinely unscreened; the
runbook step is not optional.

**Safety net, not a substitute:** the `rescreen_overdue` risk signal raised while the subject was
stuck (see "Detecting stuck requests" above) stays `open` through recovery — it is not closed or
superseded automatically. A subject-scoped `GET /internal/aml1/risk-signals` review will still
surface a recovered-but-not-re-screened subject. This is a secondary safeguard only; it does not
replace the manual re-screen step above.

## What this phase deliberately does NOT do

- No automatic recovery of any kind — recovery is always an explicit, IAM-02-gated operator action.
- No automatic re-screen after recovery — the two actions stay separate and separately auditable.
- No resume of the original abandoned provider call — its outcome is permanently unknown; a fresh
  re-screen is the only way to get a new result.
- No recovery of a `requested` request whose latest attempt is not `pending` — flagged, not fixed,
  this phase.
