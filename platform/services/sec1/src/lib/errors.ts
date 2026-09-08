/**
 * SEC-01 domain error catalogue (blueprint `09_Error_Handling.md` §2 code/severity table).
 *
 * Same rationale as `services/iam2/src/lib/errors.ts` (mirrored, not imported — F3(c)):
 * `@aix/foundation`'s `AppError` is intentionally closed over `FndErrorCode`, and generic/
 * shared codes (VALIDATION_ERROR, SERVICE_IDENTITY_REQUIRED, NOT_FOUND, INTERNAL_ERROR,
 * CONFIGURATION_INVALID, IDEMPOTENCY_KEY_REQUIRED, ...) are still constructed via the real
 * foundation `AppError`. SEC-01-specific codes NOT in the foundation catalogue get their own
 * small parallel error type here, carrying the exact same on-wire shape
 * (`{code, message, details}` + `http`).
 *
 * Scope: only codes actually reachable by SOME already-implemented route are included, per
 * `09_Error_Handling.md` §2 and per IAM-02's own error catalogue discipline for its own stages.
 * Phases 0-2 added the ingestion codes; Phase 3 added none new; Phase 4 added exactly the three
 * codes its new read/search routes can throw (`SEC1_UNAUTHORISED_AUDIT_READ`,
 * `SEC1_SENSITIVE_READ_LOG_FAILED`, `SEC1_IAM02_REGISTRY_MISSING`); Phase 5 adds the three codes
 * the approved brief named (`SEC1_ALERT_CLOSURE_EVIDENCE_REQUIRED`,
 * `SEC1_CRITICAL_ALERT_CLOSURE_APPROVAL_REQUIRED`, `SEC1_ALERT_PIPELINE_BACKLOG`) plus one more
 * this stage's own lifecycle routes genuinely need: `SEC1_ALERT_INVALID_TRANSITION` (the
 * approved brief's own test list requires "invalid transition rejected" as a distinct,
 * diagnosable outcome from a missing-evidence close or an unauthorised caller; reusing either of
 * those codes for a state-machine violation would be a real semantic bug, not a stylistic
 * choice) and `SEC1_UNAUTHORISED_ALERT_ACTION` (reusing Phase 4's `SEC1_UNAUTHORISED_AUDIT_READ`
 * — whose message is specifically "read this audit data" — for an alert assign/triage/close
 * denial would be wrong on the wire; alerts are a distinct resource from audit-event reads) —
 * the remaining blueprint catalogue (export/reconciliation/correction/break-glass codes) belongs
 * to later, deferred phases and is deliberately NOT added yet.
 */
import type { ErrorDetail } from "@aix/foundation";

export interface Sec1ErrorSpec {
  http: number;
  message: string;
}

export const SEC1_ERROR_CODES = {
  // High/Critical, "Reject event" (09_Error_Handling.md §2). Unknown/unregistered event_type.
  SEC1_EVENT_TYPE_UNKNOWN: { http: 422, message: "This audit event type is not registered." },
  // High, "Reject event". A mandatory field (per event_schema.mandatory_fields or the
  // always-mandatory §3 list) is missing/blank.
  SEC1_REQUIRED_FIELD_MISSING: { http: 400, message: "A mandatory audit event field is missing." },
  // Critical, "Reject event". Payload source_module does not match the authenticated
  // ingestion identity's bound source_module (§5.5C ingestion authenticity).
  SEC1_SOURCE_MODULE_IDENTITY_MISMATCH: {
    http: 403,
    message: "The declared source module does not match the authenticated ingestion identity.",
  },
  // High, "Reject and alert if mismatch". Same (source_module, event_id) already ingested
  // with a DIFFERENT payload.
  SEC1_IDEMPOTENCY_CONFLICT: { http: 409, message: "This audit event was already ingested with a different payload." },
  // Critical, "Fail closed for sensitive". The per-stream hash-chain state could not be
  // locked/read/updated.
  SEC1_HASH_CHAIN_UNAVAILABLE: { http: 503, message: "Audit hash-chain state is unavailable." },
  // Critical, "Fail closed for sensitive". The audit event row could not be persisted.
  SEC1_AUDIT_PERSIST_FAILED: { http: 503, message: "Audit event could not be persisted." },
  // High, generic fallback for a structurally invalid event that doesn't fit a more specific
  // code above. Reachable: `lib/ingest.ts` throws this when `occurred_at_utc` is not a
  // parseable timestamp (TypeBox only enforces it is a 1-64 char string, not a valid date —
  // the P3-F1 gap patch added the actual parseability check, since normalizing an unparseable
  // value would otherwise hash/store garbage).
  SEC1_AUDIT_EVENT_INVALID: { http: 400, message: "The audit event payload is invalid." },
  // Critical, "Deny". Phase 4: IAM-02's baseline permission check for a read/search did not
  // resolve to "allow" — covers an explicit deny, step-up/approval-required, licence-locked,
  // AND IAM-02 being unreachable/erroring (lib/iam2-client.ts fails closed to the same outcome
  // in every one of those cases — see its own header comment). Deliberately generic: the
  // caller never learns WHICH of those reasons applied, only that the read is not authorised.
  SEC1_UNAUTHORISED_AUDIT_READ: { http: 403, message: "You are not authorised to read this audit data." },
  // Critical, "Fail closed". Phase 4: the sensitive_read_log INSERT that must accompany a
  // sensitive-tier disclosure did not commit — per SEC1-TC-038, the whole read is denied, no
  // data is ever returned without its accompanying log entry having successfully committed.
  SEC1_SENSITIVE_READ_LOG_FAILED: { http: 503, message: "The sensitive read could not be logged; the read was denied." },
  // High, "Fail closed / configuration gap". Phase 4: a SEC-01 permission code IAM-02's own
  // guard reports as IAM2_PERMISSION_UNKNOWN — migration 011 has not been applied, or a
  // permission_code string has drifted out of sync between SEC-01 and the IAM-02 catalogue.
  // Distinguished from SEC1_UNAUTHORISED_AUDIT_READ specifically so this configuration gap is
  // diagnosable (SEC1-TC-079) rather than looking like an ordinary access denial.
  SEC1_IAM02_REGISTRY_MISSING: { http: 503, message: "This SEC-01 permission is not yet registered in the IAM-02 catalogue." },
  // High, "Closure blocked". Phase 5: an alert-close request is missing closure_reason and/or
  // closure_evidence_ref — both are mandatory on EVERY closure, not just Critical (SEC1-TC-032).
  SEC1_ALERT_CLOSURE_EVIDENCE_REQUIRED: { http: 400, message: "Closing an alert requires a reason and evidence reference." },
  // High, "Blocked". Phase 5: assign/triage/close attempted from a status the
  // open->assigned->triaged->{closed,escalated} lifecycle (06_State_Machine.md §2) does not
  // allow (e.g. closing an alert that is not currently 'triaged') — a distinct, diagnosable
  // outcome from a missing-evidence close (SEC1_ALERT_CLOSURE_EVIDENCE_REQUIRED) or an
  // unauthorised caller (SEC1_UNAUTHORISED_AUDIT_READ), per the approved brief's own
  // "invalid transition rejected" test requirement.
  SEC1_ALERT_INVALID_TRANSITION: { http: 409, message: "This alert cannot transition from its current status." },
  // Critical, "Deny". Phase 5: IAM-02's baseline permission check for an alert search/read/
  // assign/triage/close did not resolve to "allow" — same generic-on-the-wire discipline as
  // SEC1_UNAUTHORISED_AUDIT_READ (covers explicit deny, step-up/approval-required, licence-
  // locked, AND IAM-02 being unreachable, all collapsed to one outcome), kept as its OWN code
  // because alerts are a distinct resource from audit-event reads.
  SEC1_UNAUTHORISED_ALERT_ACTION: { http: 403, message: "You are not authorised to perform this action on this alert." },
  // High, "Approval required". Phase 5: a Critical-severity alert close was attempted without
  // a valid IAM-02 approval/decision-token binding this specific alert_id/close-payload/actor
  // (SEC1-TC-033) — covers a missing token, a token that failed IAM-02's own execute-verify
  // check (invalid/expired/binding-mismatch/payload-hash-mismatch/stale-cache-version), or IAM-02
  // being unreachable. Deliberately generic on the wire, same discipline as
  // SEC1_UNAUTHORISED_AUDIT_READ: the caller never learns exactly which of those reasons applied.
  SEC1_CRITICAL_ALERT_CLOSURE_APPROVAL_REQUIRED: { http: 403, message: "Closing a Critical alert requires a verified approval." },
  // High/Critical, "Dead-letter/replay/alert". Phase 5: the dead-letter replay route was asked
  // to process a backlog beyond a sane single-call bound — a signal the backlog itself needs
  // operational attention, not a per-item failure.
  SEC1_ALERT_PIPELINE_BACKLOG: { http: 503, message: "The monitoring alert pipeline has a backlog that needs attention." },
} as const satisfies Record<string, Sec1ErrorSpec>;

export type Sec1ErrorCode = keyof typeof SEC1_ERROR_CODES;

export class Sec1Error extends Error {
  readonly code: Sec1ErrorCode;
  readonly http: number;
  readonly details: ErrorDetail[];

  constructor(code: Sec1ErrorCode, opts?: { message?: string; details?: ErrorDetail[]; cause?: unknown }) {
    const spec = SEC1_ERROR_CODES[code];
    super(opts?.message ?? spec.message);
    this.name = "Sec1Error";
    this.code = code;
    this.http = spec.http;
    this.details = opts?.details ?? [];
    if (opts?.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}
