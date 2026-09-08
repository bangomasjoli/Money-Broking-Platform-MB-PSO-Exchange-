# AIX Full Compliance — Open Findings Register

This is the single current register for unresolved findings, deferred controls, known
environment issues, and blockers across the AIX Full Compliance project. It supersedes
scattered findings text embedded in `00_project_state/PROJECT_HANDOVER.md` for
**current** status purposes — the historical narrative in `PROJECT_HANDOVER.md` is left
intact and remains the record of *when* and *how* each finding arose.

**State values:** `OPEN` · `DEFERRED` · `BLOCKED` · `ENVIRONMENT` · `FUTURE_CONSUMER` · `CLOSED`

A finding is marked `CLOSED` only when repository evidence (a commit, a remediation
turn, an independent re-review) proves closure. Nothing below has been closed as part
of this turn — all statuses/severities are carried forward unchanged from the source
tracking documents.

---

### CLT-01 — Membership Authority

| Finding ID | Module | Control | Severity / Status | Finding | Required Action | Due / Trigger | Source / Acceptance | State |
|---|---|---|---|---|---|---|---|---|
| CLT-FIND-001 | CLT-01 | Membership Authority | LOW / NON-BLOCKING | Bound `iam_user_id` is absent from authorised-user audit metadata. | No action required for current acceptance; consider adding to audit metadata in a future CLT-01 turn. | None set | CLT-01 Membership Authority independent Opus final acceptance | OPEN |
| CLT-FIND-002 | CLT-01 | Membership Authority | INFORMATIONAL / FUTURE_CONSUMER | Future consumers of the membership-resolution route must: derive `iam_user_id` from authenticated context (never from request input); enforce `userClass ∈ {client, client_approver}`. | Apply this constraint when the public `/wlt1/*` surface or any other consumer integrates against `GET /internal/clt1/principals/:iam_user_id/client-memberships`. | Trigger: any future consumer integration | CLT-01 Membership Authority independent Opus final acceptance | FUTURE_CONSUMER |
| CLT-FIND-003 | CLT-01 | Migration 067 | INFORMATIONAL | Migration 067 uses a non-concurrent index build (`CREATE UNIQUE INDEX`, not `CONCURRENTLY`). | No action required — acceptable for current migration-execution model. Note for any future high-availability migration policy. | None set | CLT-01 Membership Authority independent Opus final acceptance | OPEN |
| CLT-FIND-004 | CLT-01 | Test suite / migration head | LOW / NON-BLOCKING | `tests/integration/clt1-db.test.ts` (in the code tree, `aix-platform`) pins the platform-wide global migration head to `067_clt1_authorised_user_iam_binding`, reproducing the same anti-pattern already fixed for WLT-01's own test. Will break when migration 068 (any module) lands. | Correct in a dedicated, narrowly-scoped CLT-01 test turn, using the same fix pattern already applied to `wlt1-db.test.ts` — remove the global-head pin, keep the CLT-scoped per-migration-exists loop. Must land **before** migration 068. | Trigger: migration 068 (any module) | CLT-01 Membership Authority independent Opus re-review (Finding 5) | OPEN |

### IAM-02

| Finding ID | Module | Control | Severity / Status | Finding | Required Action | Due / Trigger | Source / Acceptance | State |
|---|---|---|---|---|---|---|---|---|
| IAM2-FIND-001 | IAM-02 | RBAC / permission consumption | Requires triage | IAM-02 double-consume issue requires dedicated triage. | Triage and remediate in a separate, dedicated IAM-02-scoped turn. Explicitly not addressed in this or any adjacent turn. | None set | `IAM-02_Security_Review_Opus_v0.1.md` / `v0.2_reverify.md` | OPEN |

### WDR-01

| Finding ID | Module | Control | Severity / Status | Finding | Required Action | Due / Trigger | Source / Acceptance | State |
|---|---|---|---|---|---|---|---|---|
| WDR-FIND-001 | WDR-01 | Implementation prerequisite | BLOCKED | WDR-01 implementation is blocked because KMS (key management service) is UNSATISFIED as a platform prerequisite. | Resolve KMS provisioning/integration before WDR-01 implementation can begin. | Trigger: KMS availability | `MODULE_STATUS.md` | BLOCKED |

### WLT-01

| Finding ID | Module | Control | Severity / Status | Finding | Required Action | Due / Trigger | Source / Acceptance | State |
|---|---|---|---|---|---|---|---|---|
| WLT-FIND-001 | WLT-01 | Monetary amount wire contract | LOW / NON-BLOCKING (2 routes hardened; broader rollout pending) | Ajv/Fastify `coerceTypes: true` allows a JSON numeric `amount` to enter a monetary string schema, silently losing precision beyond ~17 significant digits, unless explicitly rejected pre-coercion. | Two routes already hardened via `preValidation` (`rejectNonStringAmount`) and independently accepted (L-1 closed). Broader precision-hardening across remaining monetary-amount routes remains a dedicated, separate control. | None set | WLT-01 Monetary Amount Wire-Contract Hardening (L-1) independent Opus acceptance | OPEN |
| WLT-FIND-002 | WLT-01 | Concentration control | DEFERRED (by design) | Concentration control deferred at architecture stage. | None — deferred by design, not a defect. | None set | WLT-01 architecture review | DEFERRED |
| WLT-FIND-003 | WLT-01 | Step-up control | DEFERRED (by design) | Step-up control deferred at architecture stage. | None — deferred by design, not a defect. | None set | WLT-01 architecture review | DEFERRED |
| WLT-FIND-004 | WLT-01 | Client-facing public `/wlt1/*` surface | OPEN — final genuine WLT-01 control remaining | The client-facing public `/wlt1/*` surface remains blocked pending rate limiting and public-perimeter controls (3 blockers identified at architecture review; no code written). | Complete a dedicated architecture pass resolving the 3 blockers, then implement. | None set | WLT-01 Client-Facing Public `/wlt1/*` Surface architecture review | OPEN |

### Environment

| Finding ID | Module | Control | Severity / Status | Finding | Required Action | Due / Trigger | Source / Acceptance | State |
|---|---|---|---|---|---|---|---|---|
| ENV-FIND-001 | Platform-wide | Shared test database grants | ENVIRONMENT | The shared `aix_platform_test` database contains unrelated grant drift affecting some non-WLT roles. A fresh canonical database proves the grant *files* themselves are correct — the drift is local environment state, not a code or migration defect. | No code/migration action required. Environment cleanup (resetting the shared test DB) is separate from module development and may be done at any time without blocking module work. | None set | WLT-01 acceptance review process | ENVIRONMENT |

---

If a finding above is later closed, update its **State** to `CLOSED` and cite the
commit/review that proves closure — do not delete the row; closed findings remain
part of the historical register.
