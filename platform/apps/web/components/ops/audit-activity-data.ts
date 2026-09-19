import { demoRequestReference } from "@/components/ops/client-request-data";
import { MAKER_CHECKER_QUEUE_HREF } from "@/components/ops/approval-request-data";

/**
 * Staff/Operations — Audit / Activity. Shared data layer. UI Phase 2M.
 *
 * ONE source for the demo audit events, imported by `/ops/audit-activity` AND by the Operational
 * Overview's "Recent Staff Activity", so the two cannot disagree. Every event corresponds to a
 * state already shown on Client Requests, Wallet Destination Review or the Maker-Checker Queue —
 * timestamps included (e.g. `clt1.application_approved` at 2026-09-10T15:00Z is exactly
 * `DEMO-004`'s `approvedAtUtc`).
 *
 * Designed against the **SEC-01 normal-tier read projection**, never a raw row
 * (`services/sec1/src/lib/read-redaction.ts`, `redactAuditEventRow`). Verified this turn (full
 * capability map: `UI-04` §48.1). At normal tier the projection carries:
 * `audit_event_ref`, `event_type`, `event_category`, `severity`, `source_module`, `actor_user_id`,
 * `actor_type`, `entity_type`, `entity_id`, `action`, `result`, `reason_code`, `occurred_at_utc`,
 * `ingested_at_utc`, `classification`, `retention_class`, `status` — and `client_id` only when the
 * search was scoped to that client. It OMITS — as absent keys, deliberately not as null, so redaction
 * is indistinguishable from absence — `session_id`, `request_id`, `correlation_id` and
 * `metadata_redacted`. Hash-chain and integrity fields are never even selected. So this module models
 * none of the omitted fields, and there is no per-row "redacted" marker to model.
 *
 * **Event vocabulary.** `event_type` strings are the real ones the modules pass to `publishAudit`
 * (verified in `clt1`, `wlt1` and `iam2` source). The labels are UI names for them, not new
 * vocabulary — the exact string is always shown in the detail.
 *
 * **Vocabularies that differ from what the emitters use** (a backend gap, `UI-04` §48.11):
 * `actor_type` in SEC-01 is `client | staff | system | service`; `publishAudit`'s own type is
 * `user | system | service`, with no mapping for `user`. The fixtures use SEC-01's. `result` is
 * `success | failure | blocked` and NOT NULL on every stored row; but `wlt1.*`, `iam2.*` and the
 * sensitive-read emitters do not supply `severity`, `action` or `result` at all (SEC-01 mandates all
 * three), whereas `clt1.*` does. Values for those rows are therefore demo-projected — noted per
 * event type in `AUDIT_EVENT_TYPES.emitterSuppliesFields`.
 *
 * **The actor is never named.** `actor_user_id` is an opaque id visible at both tiers; no display
 * projection exists, so only the actor CLASS is shown. A `service` actor is shown by the emitting
 * module, and is never presented as a person.
 *
 * **Sensitive access has two distinct meanings, kept apart.** (1) An event that RECORDS a governed
 * read of restricted data (`wlt1.sensitive_destination_read`, `kyc1.sensitive_evidence_read`,
 * `aml1.sensitive_match_detail_read`) — modelled here as `recordsSensitiveAccess`. (2) An event whose
 * OWN detail is only disclosed at the sensitive read tier (`event_schema.sensitive_read`) — invisible
 * in the normal-tier projection by design, so not modelled per row. The disclosed value itself is
 * never part of either.
 *
 * **Deliberately NOT modelled:** session/request/correlation identifiers, `client_id`, metadata (all
 * omitted at normal tier), `retention_class` (no governed retention periods are exposed), `status`
 * (all `active` — the correction workflow is deferred), raw payloads, IP addresses, tokens, error
 * details, and any financial figure.
 */

// ---------------------------------------------------------------------------
// Governed vocabularies — sec1.audit_event CHECK constraints (008_sec1_core.cjs).
// ---------------------------------------------------------------------------

export type AuditActorType = "client" | "staff" | "system" | "service";

export const AUDIT_ACTOR_TYPE_LABELS: Record<AuditActorType, string> = {
  client: "Client user",
  staff: "Staff user",
  system: "System",
  service: "Service",
};

export type AuditResult = "success" | "failure" | "blocked";

export const AUDIT_RESULT_LABELS: Record<AuditResult, string> = {
  success: "Success",
  failure: "Failure",
  blocked: "Blocked",
};

export type AuditSeverity = "info" | "low" | "medium" | "high" | "critical";

export const AUDIT_SEVERITY_LABELS: Record<AuditSeverity, string> = {
  info: "Info",
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export type AuditCategory = "auth" | "permission" | "money" | "security" | "system";

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  auth: "Auth",
  permission: "Permission",
  money: "Money",
  security: "Security",
  system: "System",
};

export type AuditSourceModule = "IAM-02" | "CLT-01" | "WLT-01";

/** Explains each actor class in staff terms. No class is ever a named person. */
export const AUDIT_ACTOR_NOTES: Record<AuditActorType, string> = {
  client: "A client user. The user's identity is an opaque id and is not shown in this preview.",
  staff: "A staff user. The user's identity is an opaque id and is not shown in this preview.",
  system: "The platform itself — not a person.",
  service: "An automated internal service — not a person.",
};

// ---------------------------------------------------------------------------
// Event types — the real `event_type` strings, as emitted.
// ---------------------------------------------------------------------------

export type AuditEventType =
  | "iam2.approval_requested"
  | "iam2.approval_approved"
  | "iam2.sod_conflict_detected"
  | "clt1.application_submitted"
  | "clt1.application_under_review"
  | "clt1.application_approval_requested"
  | "clt1.application_approved"
  | "wlt1.proof_of_control_verified"
  | "wlt1.sensitive_destination_read";

export interface AuditEventTypeInfo {
  eventType: AuditEventType;
  module: AuditSourceModule;
  /** A UI name for the real event type; the exact string is always shown in the detail. */
  label: string;
  /** True only for events that RECORD a governed read of restricted data. */
  recordsSensitiveAccess: boolean;
  /** Whether the emitting code supplies `severity`, `action` and `result` — SEC-01 mandates all
   * three. Where false, the fixture values are demo-projected (`UI-04` §48.11). */
  emitterSuppliesFields: boolean;
}

export const AUDIT_EVENT_TYPES: Record<AuditEventType, AuditEventTypeInfo> = {
  "iam2.approval_requested": {
    eventType: "iam2.approval_requested",
    module: "IAM-02",
    label: "Approval requested",
    recordsSensitiveAccess: false,
    emitterSuppliesFields: false,
  },
  "iam2.approval_approved": {
    eventType: "iam2.approval_approved",
    module: "IAM-02",
    label: "Approval approved",
    recordsSensitiveAccess: false,
    emitterSuppliesFields: false,
  },
  "iam2.sod_conflict_detected": {
    eventType: "iam2.sod_conflict_detected",
    module: "IAM-02",
    label: "SoD conflict detected",
    recordsSensitiveAccess: false,
    emitterSuppliesFields: false,
  },
  "clt1.application_submitted": {
    eventType: "clt1.application_submitted",
    module: "CLT-01",
    label: "Application submitted",
    recordsSensitiveAccess: false,
    emitterSuppliesFields: true,
  },
  "clt1.application_under_review": {
    eventType: "clt1.application_under_review",
    module: "CLT-01",
    label: "Application under review",
    recordsSensitiveAccess: false,
    emitterSuppliesFields: true,
  },
  "clt1.application_approval_requested": {
    eventType: "clt1.application_approval_requested",
    module: "CLT-01",
    label: "Application approval requested",
    recordsSensitiveAccess: false,
    emitterSuppliesFields: true,
  },
  "clt1.application_approved": {
    eventType: "clt1.application_approved",
    module: "CLT-01",
    label: "Application approved",
    recordsSensitiveAccess: false,
    emitterSuppliesFields: true,
  },
  "wlt1.proof_of_control_verified": {
    eventType: "wlt1.proof_of_control_verified",
    module: "WLT-01",
    label: "Proof of control verified",
    recordsSensitiveAccess: false,
    emitterSuppliesFields: false,
  },
  "wlt1.sensitive_destination_read": {
    eventType: "wlt1.sensitive_destination_read",
    module: "WLT-01",
    label: "Sensitive destination read",
    recordsSensitiveAccess: true,
    emitterSuppliesFields: false,
  },
};

// ---------------------------------------------------------------------------
// Demo events.
// ---------------------------------------------------------------------------

export interface DemoAuditEvent {
  id: string;
  /** Obviously-fictitious reference standing in for `audit_event_ref`. */
  ref: string;
  eventType: AuditEventType;
  /** `event_category` — null unless the event type is registered in SEC-01 with a category. Only the
   * four seeded schemas exist (`iam02.generic_event` is `permission`); module-specific types are not
   * registered, so their category is unknown. */
  category: AuditCategory | null;
  severity: AuditSeverity;
  actorType: AuditActorType;
  action: string;
  result: AuditResult;
  /** `reason_code` — optional; never given an invented value. */
  reasonCode: string | null;
  /** `entity_type`, verbatim from the emitter. */
  entityType: string;
  /** The target's reference — a demo ref standing in for the opaque `entity_id`. */
  targetLabel: string;
  /** A real Ops page for the target, or null. */
  targetHref: string | null;
  occurredAtUtc: string;
  ingestedAtUtc: string;
  classification: string;
}

/**
 * 10 events. Newest first (the order is by occurrence; SEC-01's own search orders by
 * `ingested_at_utc DESC`, which is the same sequence here). Every event is consistent with the
 * originating pages: `DEMO-002`'s review start and approval request, `DEMO-004`'s approval and
 * approved status, `DEMO-001`'s submission, the approval requests `DEMO-APR-001`/`002`, the blocked
 * mandate update behind `DEMO-APR-006`, and `DEMO-WLT-004`'s verified proof of control.
 *
 * Domains: IAM-02 (4), CLT-01 (4), WLT-01 (2). Results are `success` except the segregation-of-duties
 * conflict, which is `blocked`. No `failure` fixture and no `expired`-approval event: that emitter
 * carries no result, and mapping an expiry onto `success | failure | blocked` would invent an outcome.
 * Actor classes use SEC-01's vocabulary (see the header).
 */
export const DEMO_AUDIT_EVENTS: DemoAuditEvent[] = [
  {
    id: "demo-evt-001",
    ref: "DEMO-EVT-001",
    eventType: "iam2.approval_requested",
    category: "permission",
    severity: "medium",
    actorType: "staff",
    action: "approval.request",
    result: "success",
    reasonCode: null,
    entityType: "application",
    targetLabel: demoRequestReference("demo-app-002"),
    targetHref: MAKER_CHECKER_QUEUE_HREF,
    occurredAtUtc: "2026-09-19T08:10:12Z",
    ingestedAtUtc: "2026-09-19T08:10:15Z",
    classification: "restricted",
  },
  {
    id: "demo-evt-002",
    ref: "DEMO-EVT-002",
    eventType: "clt1.application_approval_requested",
    category: null,
    severity: "medium",
    actorType: "staff",
    action: "approve_request",
    result: "success",
    reasonCode: null,
    entityType: "client_application",
    targetLabel: demoRequestReference("demo-app-002"),
    targetHref: "/ops/client-requests",
    occurredAtUtc: "2026-09-19T08:05:40Z",
    ingestedAtUtc: "2026-09-19T08:05:43Z",
    classification: "restricted",
  },
  {
    id: "demo-evt-003",
    ref: "DEMO-EVT-003",
    eventType: "iam2.approval_requested",
    category: "permission",
    severity: "medium",
    actorType: "staff",
    action: "approval.request",
    result: "success",
    reasonCode: null,
    entityType: "destination",
    targetLabel: "Payout Destination DEMO-PAY-001",
    targetHref: MAKER_CHECKER_QUEUE_HREF,
    occurredAtUtc: "2026-09-18T15:30:05Z",
    ingestedAtUtc: "2026-09-18T15:30:08Z",
    classification: "restricted",
  },
  {
    id: "demo-evt-004",
    ref: "DEMO-EVT-004",
    eventType: "iam2.sod_conflict_detected",
    category: "permission",
    severity: "high",
    actorType: "staff",
    action: "approval.approve",
    result: "blocked",
    reasonCode: null,
    entityType: "client_mandate",
    targetLabel: "Client Mandate DEMO-MND-001",
    targetHref: MAKER_CHECKER_QUEUE_HREF,
    occurredAtUtc: "2026-09-17T16:40:31Z",
    ingestedAtUtc: "2026-09-17T16:40:34Z",
    classification: "restricted",
  },
  {
    id: "demo-evt-005",
    ref: "DEMO-EVT-005",
    eventType: "clt1.application_submitted",
    category: null,
    severity: "medium",
    actorType: "service",
    action: "submit",
    result: "success",
    reasonCode: null,
    entityType: "client_application",
    targetLabel: demoRequestReference("demo-app-001"),
    targetHref: "/ops/client-requests",
    occurredAtUtc: "2026-09-16T10:05:00Z",
    ingestedAtUtc: "2026-09-16T10:05:03Z",
    classification: "restricted",
  },
  {
    id: "demo-evt-006",
    ref: "DEMO-EVT-006",
    eventType: "wlt1.sensitive_destination_read",
    category: null,
    severity: "medium",
    actorType: "service",
    action: "read",
    result: "success",
    reasonCode: null,
    entityType: "proof_of_control",
    targetLabel: "Proof of Control DEMO-POC-001",
    targetHref: "/ops/wallet-destination-review",
    occurredAtUtc: "2026-09-14T13:02:18Z",
    ingestedAtUtc: "2026-09-14T13:02:21Z",
    classification: "restricted",
  },
  {
    id: "demo-evt-007",
    ref: "DEMO-EVT-007",
    eventType: "wlt1.proof_of_control_verified",
    category: null,
    severity: "medium",
    actorType: "client",
    action: "verify",
    result: "success",
    reasonCode: null,
    entityType: "proof_of_control",
    targetLabel: "Proof of Control DEMO-POC-001",
    targetHref: "/ops/wallet-destination-review",
    occurredAtUtc: "2026-09-14T13:00:47Z",
    ingestedAtUtc: "2026-09-14T13:00:50Z",
    classification: "restricted",
  },
  {
    id: "demo-evt-008",
    ref: "DEMO-EVT-008",
    eventType: "clt1.application_under_review",
    category: null,
    severity: "medium",
    actorType: "staff",
    action: "start_review",
    result: "success",
    reasonCode: null,
    entityType: "client_application",
    targetLabel: demoRequestReference("demo-app-002"),
    targetHref: "/ops/client-requests",
    occurredAtUtc: "2026-09-14T09:20:00Z",
    ingestedAtUtc: "2026-09-14T09:20:03Z",
    classification: "restricted",
  },
  {
    id: "demo-evt-009",
    ref: "DEMO-EVT-009",
    eventType: "clt1.application_approved",
    category: null,
    severity: "high",
    actorType: "staff",
    action: "approve",
    result: "success",
    reasonCode: null,
    entityType: "client_application",
    targetLabel: demoRequestReference("demo-app-004"),
    targetHref: "/ops/client-requests",
    occurredAtUtc: "2026-09-10T15:00:00Z",
    ingestedAtUtc: "2026-09-10T15:00:03Z",
    classification: "restricted",
  },
  {
    id: "demo-evt-010",
    ref: "DEMO-EVT-010",
    eventType: "iam2.approval_approved",
    category: "permission",
    severity: "medium",
    actorType: "staff",
    action: "approval.approve",
    result: "success",
    reasonCode: null,
    entityType: "application",
    targetLabel: demoRequestReference("demo-app-004"),
    targetHref: MAKER_CHECKER_QUEUE_HREF,
    occurredAtUtc: "2026-09-10T14:52:00Z",
    ingestedAtUtc: "2026-09-10T14:52:03Z",
    classification: "restricted",
  },
];

// ---------------------------------------------------------------------------
// Derived helpers.
// ---------------------------------------------------------------------------

/** Distinct source modules actually present in the data — the Domain filter's options, so it can
 * never offer a module with no events or invent one. */
export const AUDIT_DOMAINS: AuditSourceModule[] = Array.from(
  new Set(DEMO_AUDIT_EVENTS.map((e) => AUDIT_EVENT_TYPES[e.eventType].module)),
).sort();

export function auditEventLabel(event: DemoAuditEvent): string {
  return AUDIT_EVENT_TYPES[event.eventType].label;
}

export function auditEventModule(event: DemoAuditEvent): AuditSourceModule {
  return AUDIT_EVENT_TYPES[event.eventType].module;
}

export function recordsSensitiveAccess(event: DemoAuditEvent): boolean {
  return AUDIT_EVENT_TYPES[event.eventType].recordsSensitiveAccess;
}

/** Actor shown by CLASS only; a service is named by its emitting module and is never a person. */
export function auditActorLabel(event: DemoAuditEvent): string {
  const base = AUDIT_ACTOR_TYPE_LABELS[event.actorType];
  return event.actorType === "service" ? `${base} · ${auditEventModule(event)}` : base;
}

/** The two most recent events, for the Overview's "Recent Staff Activity". */
export const RECENT_AUDIT_EVENTS: DemoAuditEvent[] = DEMO_AUDIT_EVENTS.slice(0, 2);

export const AUDIT_ACTIVITY_HREF = "/ops/audit-activity";

export { formatRequestDate, formatRequestDateTime } from "@/components/ops/client-request-data";
