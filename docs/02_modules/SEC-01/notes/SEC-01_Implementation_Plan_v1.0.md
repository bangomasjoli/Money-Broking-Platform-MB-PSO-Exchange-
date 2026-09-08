# SEC-01 Audit Log / Security Monitoring — Implementation Plan (v1.0)

Module: **SEC-01 Audit Log / Security Monitoring**
Blueprint: `aix-platform-docs/modules/SEC-01_Audit_Log_Security_Monitoring_Blueprint_Pack_v1.2/`
Status: **Planning only — no code, no migrations written this pass.**
Depends on (accepted baselines): FND-01 v1.0, IAM-01 v1.0, IAM-02 v1.0 (Phases 0-5).

MODEL USAGE: this plan was authored by Sonnet, planning only. Opus is reserved for the
post-implementation security/compliance review once Phases 0-2 (or later) are built.

---

## 1. Scope read

Read before planning: `PROJECT_HANDOVER.md`, `MODULE_STATUS.md`, `SESSION_START_PROMPT.md`,
`FND-01_Final_Review_Opus_v1.0.md` (no standalone `FND-01_IMPLEMENTATION_NOTES.md` exists —
FND-01's implementation detail lives in its Final Review), `IAM-01_IMPLEMENTATION_NOTES.md`,
`IAM-02_IMPLEMENTATION_NOTES.md`, and the SEC-01 v1.2 blueprint pack files `01_Module_Blueprint`,
`04_API_Specification`, `05_Database_Design`, `07_Permission_Rules`, `08_Audit_Log_Events`,
`09_Error_Handling`, `10_Test_Cases`, `14_Go_Live_Checklist` (no standalone `README.md` exists in
the v1.2 pack — the directory listing serves as the index). Also read `@aix/foundation`'s
`packages/foundation/src/outbox.ts` and `audit.ts` directly to ground the ingestion design in the
actual current code, not just the blueprint.

This is a large blueprint — 35 functional requirements, 91 test cases, and several requirements
(external WORM/object-lock storage, a trusted timestamp authority, a real SIEM/notification
channel) that depend on infrastructure decisions the blueprint itself lists as still open
(`01_Module_Blueprint.md` §13 "Open Items"). The plan below splits SEC-01 into a buildable-now
core and an explicitly deferred tail, mirroring the IAM-02 Phase 0-5 / Phase 6-7 split.

---

## 2. Proposed phase plan

| Phase | Scope | Blueprint FRs covered |
|---|---|---|
| **0** | Scaffold `services/sec1` — own copy of request-context/error-catalogue/internal-identity-guard plugins (F3(c) import-boundary rule, never imported cross-service), Fastify app, config | — |
| **1** | Schema `sec1` + `role_sec1_runtime` grants; core tables (`audit_event`, `event_schema`, `audit_stream`, `audit_seal_batch`, `source_identity_binding`) | FR-004 |
| **2** | Audit ingestion core: `POST /internal/sec1/audit-events` (+ `/batch`), schema-registry validation, mandatory-field checks, idempotency (C2 `source_module`-scoped pattern), **hash-chain** (per-stream `sequence_no`/`event_hash`/`previous_hash`), ingestion-identity binding (`source_module` bound to caller identity, reject mismatch) | FR-001, 002, 003, 005, 018, 026 |
| **3** | Internal batch sealing (`seal_method='internal'`, explicitly non-authoritative per blueprint §5.5A rule 4) + integrity verification job (gap/hash-mismatch detection). External WORM anchor/trusted-timestamp built as a **pluggable interface with a stub adapter** — explicitly deferred, not faked | FR-006, 007 (internal only) |
| **4** | Read/search + sensitive-read logging + IAM-02 permission-guard integration (HTTP client mirroring IAM-02's `iam01-client.ts` fail-closed pattern) | FR-008, 015, 017 |
| **5** | Security monitoring rule engine (baseline rule shapes: threshold/count-window) + alert lifecycle (create/assign/triage/close-with-evidence, Critical-closure approval via IAM-02 decision-token) + dead-letter table | FR-010, 011, 032 (baseline) |
| **6** | Evidence export (request/approve/download, manifest/package hash, IAM-02-gated) | FR-009 |
| **Deferred** | External WORM/object-lock + real trusted-timestamp authority; interim IAM-01/IAM-02 audit handoff + reconciliation (blocked on IAM-02's not-yet-built protected-action registry); source-emission-sequence enforcement; clock-skew detection; audit correction; incident break-glass audit-read (blocked on IAM-02's not-yet-built steady-state break-glass); recovery integrity verification; retention/legal-hold; SIEM/notification channels | FR-013, 019, 020-025, 027-031, 033-035 |

Phases 0-2 are the recommended first coding pass — everything downstream depends on ingestion
and the hash-chain existing and being tested first, same as IAM-02's Phase 0-2 / Phase 3-5 split.

---

## 3. Minimum files likely to change

New files only — nothing in FND-01/IAM-01/IAM-02 needs touching *except* one shared-package
addition (see Risk #1):

- `services/sec1/package.json`, `tsconfig.json`, `src/{index,server,config}.ts`
- `services/sec1/src/plugins/{request-context,internal-identity}.ts` (own copies, per F3(c))
- `services/sec1/src/lib/{ingest,hash-chain,seal,guard-client,errors}.ts`
- `services/sec1/src/routes/{internal,events,alerts,exports}.ts`
- `infra/migrations/008_sec1_core.cjs` (schema + Phase 1-3 tables), possibly
  `009_sec1_alerts_export.cjs` for Phase 5-6 tables
- `infra/grants/sec1_runtime_grants.sql`
- `tests/integration/sec1-db.test.ts`, `tests/unit/sec1-*.test.ts`
- **Possibly** `packages/foundation/src/audit.ts` — see Risk #1 (adding a `sourceModule` field to
  `AuditEvent`, the same shape of change C2 already made to `beginIdempotent`/`completeIdempotent`)

---

## 4. Migration requirements

- New schema `sec1`, new role `role_sec1_runtime`.
- Phase 1 tables: `audit_event`, `event_schema`, `audit_stream`, `audit_seal_batch`,
  `source_identity_binding` (5 tables, per `05_Database_Design.md` §2.1-2.4, 2.14).
- Phase 5-6 tables added later: `security_monitoring_rule`, `monitoring_dead_letter`,
  `security_alert`, `alert_triage_note`, `evidence_export`, `sensitive_read_log`,
  `integrity_verification_run`.
- Deferred-phase tables (create later, not now): `interim_audit_handoff`, `audit_correction`,
  `expected_event_reconciliation`, `recovery_integrity_run`.
- **`sec1.audit_event` gets no UPDATE/DELETE grant at all for `role_sec1_runtime`** on the
  runtime path — append-only enforced at the grant layer, not just application logic (mirrors C1's
  INSERT-only discipline, but here even the writer role itself gets no UPDATE; corrections are a
  separate INSERT into `audit_correction`, deferred phase).
- Unique constraints per blueprint: `(source_module, event_id)`, `(stream_id, sequence_no)`.

---

## 5. Audit ingestion / storage model

Two ingestion paths, matching blueprint §4.2's component list ("Audit Ingestion API" +
"Audit Outbox Consumer"):

1. **Direct API** (`POST /internal/sec1/audit-events`) — a module calls this synchronously with
   the full SEC-01 event shape (source_module, severity, action, result, session_id, etc.) when
   it wants a *confirmed* authoritative write before proceeding. This is the path for anything
   covered by blueprint §5.3's fail-closed list (permission change, MFA reset approval,
   withdrawal approval, etc.).
2. **FND outbox consumer** — SEC-01 polls `foundation.outbox_event` for `topic='audit.event'`
   rows (the ones `publishAudit` already writes) as a completeness backstop/general-purpose sink
   for everything not sensitive enough to warrant path 1.

**Path 2 currently doesn't work end-to-end** — see Risk #1, the single biggest open question
below.

---

## 6. Tamper-evidence / hash-chain proposal

- Per-stream (`stream_id` = e.g. `sec1-<source_module>` or a global stream) monotonic
  `sequence_no`, `event_hash = sha256(canonical_event_json + previous_hash)`, `previous_hash`
  chained from the prior row in the same stream — computed inside the same transaction as the
  INSERT (append + chain-link atomic, no separate sealing step needed for per-row integrity).
- Batch sealing (`audit_seal_batch`) runs periodically (a scheduled job, reusing FND-01's
  `scheduled_job`/`job_run` convention) over a `[from_sequence_no, to_sequence_no]` range,
  computing a `batch_hash` over the range.
- **Phase 3 ships `seal_method='internal'` only** — `batch_hash` computed and stored, but
  `external_anchor_ref`/`trusted_timestamp_ref` stay null. Per blueprint §5.5A rule 4 this is
  explicitly *allowed* for non-production/non-authoritative evidence — so this is not cutting a
  corner, it is building exactly the interim posture the blueprint itself sanctions, with
  `verification_status` never claiming production authority until a real WORM/timestamp adapter
  lands.
- `integrity_verification_run` job: walks a stream's `sequence_no` range, recomputes each
  `event_hash`, flags gaps and mismatches — real and fully buildable now, independent of external
  anchoring.

---

## 7. Security monitoring / alerting proposal

- `security_monitoring_rule`: baseline rule shape = event-type filter + threshold (count within a
  time window) — covers the blueprint's concrete examples (failed-login spike, MFA-reset abuse,
  self-approval attempt, SoD conflict, break-glass activation), since these are all "N events of
  type X for actor Y within window W" shapes.
- Rule evaluation runs against newly-ingested events (post-ingest hook), writes `security_alert`
  rows with all 8 required fields from §5.8 (severity, trigger rule, actor, event refs, entity,
  recommended action, SLA, escalation path).
- `monitoring_dead_letter` + retry: rule-evaluation failures land here rather than being silently
  dropped — satisfies FR-032's "guaranteed eventual Critical evaluation" at a baseline level (a
  scheduled sweep retries dead-lettered Critical-category items).
- **Deferred**: real notification channels (email/Slack/PagerDuty) — same posture as IAM-01's
  deferred password-reset notification ("outbox placeholder, no provider exists this pass"). Alert
  *creation* is real; alert *delivery* is a documented stub.

---

## 8. Evidence / query / export proposal

- `GET /sec1/audit-events` (search) and `GET /sec1/audit-events/{ref}` (read) — both go through
  the IAM-02 HTTP guard client first (mirrors IAM-02's own `iam01-client.ts` fail-closed pattern),
  then a `sensitive_read_log` row is written **before** returning sensitive data (per data rule #4
  — read fails closed if the log write fails).
- `POST /sec1/evidence-exports` — request → (IAM-02 approval/decision-token, reusing the exact
  approval-to-execution binding IAM-02 just built and hardened) → generate → manifest/package hash
  → download-logged.
- Redaction rules (`07_Permission_Rules.md` §6) applied at the query layer based on the caller's
  permission tier (normal vs. `read_sensitive`).

---

## 9. Tests likely needed

Following the same runtime-role-connected discipline as FND-01/IAM-01/IAM-02
(`role_sec1_runtime` via a real LOGIN role from the start, never superuser-only):

- **Ingestion**: valid event, missing mandatory field, unknown event type, duplicate idempotency
  (same vs. different payload), business-module-cannot-direct-write, metadata-contains-secret-
  rejected (SEC1-TC-001–007).
- **Hash chain**: hash generated/linked, sequence-gap detected, tamper detected, batch seal,
  integrity pass/fail (SEC1-TC-008–014).
- **Fail-closed**: sensitive-action-blocked-on-persist-failure, blocked-on-outbox-failure
  (SEC1-TC-015–016).
- **Monitoring baseline**: rule fires on threshold breach, alert created with all required fields
  (subset of SEC1-TC-019–028).
- **Alert lifecycle**: create→assign→triage→close-with-evidence, Critical-closure-requires-
  approval (SEC1-TC-029–034).
- **Read/export**: unauthorised read denied, sensitive read logged, sensitive-read-log-failure
  denies the read, export requires approval (SEC1-TC-035–043).
- **Permission/SoD**: audit admin cannot modify own trail, exporter cannot self-approve, service
  account cannot approve export (SEC1-TC-055–060).
- **Import-boundary static scan** (F3(c), reusing the generic scanner introduced for IAM-02).

Full ~90-test blueprint catalogue is the eventual target; Phases 0-6 realistically land
~50-60% of it, with the remainder gated on the deferred-phase items in §2.

---

## 10. Risks / questions before coding

1. **[Blocking — needs a decision before Phase 2] The FND outbox consumer path doesn't have
   enough data to work today.** `packages/foundation/src/audit.ts`'s `publishAudit` writes a
   `payload_ref` carrying only `entity_type/entity_id/actor_id/actor_type/occurred_at_utc/
   metadata` — no `source_module`, `severity`, `event_category`, `action`, `result`, `session_id`,
   `client_id`, or `source_emission_sequence`, all of which SEC-01's ingestion schema requires as
   mandatory (`08_Audit_Log_Events.md` §3). Three options:
   - **(a)** extend `@aix/foundation`'s `AuditEvent`/`publishAudit` with a required
     `sourceModule` field (+ a few optional ones) — a shared-package change, but the *exact same
     shape* of change C2 already made to `beginIdempotent`/`completeIdempotent`, so it is a
     precedented move, not a new pattern. **Recommended.**
   - **(b)** modules call SEC-01's direct ingestion API for anything that needs full fidelity, and
     the outbox consumer stays a completeness backstop only.
   - **(c)** SEC-01's consumer best-effort-maps what little the outbox gives it and accepts
     degraded fidelity for outbox-sourced events.

   This touches accepted FND-01 code, same as C1/C2 did, so it needs explicit sign-off before
   Phase 2 is coded.

2. **SEC-01 needs to read `foundation.outbox_event` across all modules** to act as the consumer —
   this means `role_sec1_runtime` needs `SELECT` (and `UPDATE` to mark delivered) on that table, a
   deliberate, narrow exception to the C1 INSERT-only pattern every other module follows.
   Architecturally correct (SEC-01 is structurally the one legitimate consumer of that queue), but
   the first grant of its kind — worth flagging explicitly.

3. **The blueprint's own dependency chain isn't fully buildable yet.** §7.1 lists IAM-02 as an
   upstream dependency for "permission guard for SEC-01 read/export/admin access" — that exists.
   But §5.9A's incident break-glass audit-read requires "IAM-02 break-glass read access," and
   §5.5B's expected-event reconciliation requires "IAM-02 protected-action registry" — **both are
   IAM-02 Phase 6-7 items that are explicitly deferred and don't exist yet.** These SEC-01
   features are correctly placed in the Deferred phase, not because SEC-01 can't build them, but
   because their IAM-02 dependency isn't there.

4. **External WORM/object-lock storage and a trusted timestamp authority are infrastructure
   decisions, not code** — the blueprint's own Open Items (§13) list these as unresolved ("final
   WORM/object-lock storage configuration", "final trusted timestamp authority / external anchor
   provider"). Building a stub/pluggable interface now is right; picking a real vendor is not a
   coding task for this session.

5. **Retention periods, alert SLA-by-severity, and clock-skew thresholds are all blueprint Open
   Items** ("to_be_defined") — Phase 3-6 code will need placeholder/configurable values with the
   same "explicitly not final" documentation style FND-01 used for its licence-lock placeholder.

---

## 11. Go/no-go recommendation

**Go — for Phases 0-2 as the first coding pass**, with Risk #1 resolved first (option (a)/(b)/(c)
decision needed before the migration is written, since it determines the ingestion API's exact
required-field set and whether `packages/foundation` gets touched). Phases 3-6 are buildable in
subsequent passes within this same module effort.

The Deferred tail (§2) is legitimately blocked on either external infrastructure decisions or
IAM-02 features that don't exist yet — building those now would mean inventing placeholder
infrastructure the blueprint explicitly says isn't decided, which is the wrong instinct given how
this session has handled every prior "genuinely not ready" item (CFG-01 licence-lock, KMS,
notification providers).

---

## 12. Out-of-scope confirmation

Nothing was implemented this pass (planning only). Confirmed not touched: CFG-01, CLT/KYC/AML/WLT,
LED/DEP/WDR/TRD, E2E/REC/INC/PRT, Exchange runtime, order book, matching engine, market making,
principal dealing, AIX spread markup.
