/**
 * CLT-01 Phase 1 — pure application state-transition and gate-interpretation logic. No DB access,
 * no HTTP — routes/applications.ts is the only caller, and is the only place that touches
 * `PoolClient`/`withTransaction`/`publishAudit`. Kept pure and DB-free so every rule here is
 * unit-testable without a database (tests/unit/clt1-applications.test.ts).
 */
import { Clt1Error } from "./errors.js";
import type { Clt1ClientClass } from "./cfg1-client.js";
import type { OnboardingGateResult } from "./cfg1-client.js";

export type ApplicationStatus =
  | "draft"
  | "submitted"
  | "duplicate_review"
  | "pending_kyc"
  | "pending_aml"
  | "under_review"
  | "approved"
  | "rejected"
  | "held"
  | "cancelled";

/** Phase 1 actions plus Phase 2's additions (handoff/outcome receipt and the review/approve/
 * reject/hold decision actions) — the rest of ApplicationStatus's value space exists in the DB
 * CHECK constraint for forward compatibility only (see
 * infra/migrations/020_clt1_intake_baseline.cjs's header comment). */
export type Clt1Action =
  | "patch"
  | "classification-evidence"
  | "consent"
  | "submit"
  | "start-review"
  | "cancel"
  | "handoff"
  | "receive-outcome"
  | "approve-request"
  | "approve-apply"
  | "reject"
  | "hold"
  | "authorised-party-capture"
  | "authorised-party-screening";

const ALLOWED_STATUSES_FOR_ACTION: Record<Clt1Action, readonly ApplicationStatus[]> = {
  patch: ["draft"],
  "classification-evidence": ["draft", "submitted"],
  consent: ["draft", "submitted"],
  submit: ["draft"],
  "start-review": ["submitted"],
  cancel: ["draft", "submitted"],
  handoff: ["under_review"],
  "receive-outcome": ["under_review"],
  "approve-request": ["under_review"],
  "approve-apply": ["under_review"],
  reject: ["under_review"],
  hold: ["under_review"],
  // Phase 4A.2A — application-keyed pre-approval authorised-party capture (list/add/update/
  // remove). Permitted while the application is still being assembled/reviewed and BEFORE
  // approval creates client_profile; 'held' is deliberately excluded (see this phase's own
  // implementation notes — no resume/unhold transition exists yet for ANY action, so 'held'
  // cannot be distinguished from a dead end here without a separate lifecycle change).
  "authorised-party-capture": ["draft", "submitted", "under_review"],
  // Screening-outcome receipt (service-to-service) — only meaningful once the application has
  // reached under_review (the same window KYC-01/the roster contract operate in); narrower than
  // capture itself since a screening result presupposes a party already exists to screen.
  "authorised-party-screening": ["under_review"],
};

/** Throws CLT1_APPLICATION_INVALID_STATE if `action` is not valid for `currentStatus`. */
export function validateTransition(currentStatus: string, action: Clt1Action): void {
  const allowed = ALLOWED_STATUSES_FOR_ACTION[action];
  if (!allowed.includes(currentStatus as ApplicationStatus)) {
    throw new Clt1Error("CLT1_APPLICATION_INVALID_STATE", {
      details: [{ field: "status", issue: `cannot perform '${action}' on an application in status '${currentStatus}'` }],
    });
  }
}

export interface ApplicationGateColumns {
  cfg_feature_code: string | null;
  cfg_decision_id: string | null;
  cfg_reason_code: string | null;
  cfg_evaluated_at_utc: string | null;
}

/**
 * Defensive invariant check before `submit` re-runs the CFG-01 gate: an application must have
 * been gate-checked at least once already (at creation, per approved decision #15) before it can
 * ever reach submit at all — unreachable in the normal HTTP flow (create() always runs the gate),
 * but guarded explicitly rather than assumed, the same "defense in depth even though the normal
 * flow already prevents it" discipline CFG-01's own `isFeatureMutationBlocked` applies at both
 * request AND apply time. Proven in tests/integration/clt1-db.test.ts by directly clearing the
 * stored gate columns on a row and confirming submit still fails closed.
 */
export function requireCfgGateOnFile(application: ApplicationGateColumns): void {
  if (!application.cfg_feature_code || !application.cfg_reason_code) {
    throw new Clt1Error("CLT1_CFG_GATE_REQUIRED", {
      details: [{ field: "cfg_feature_code", issue: "no CFG-01 onboarding gate check is recorded for this application" }],
    });
  }
}

/**
 * Interprets a fresh CFG-01 gate result. Throws on any deny — never returns a value the caller
 * needs to branch on, since "allowed" is the only non-throwing outcome (mirrors CFG-01's own
 * `verify-decision` route: "can I proceed" is a binary question a thrown/not-thrown outcome
 * answers directly, not a `permission/check`-style advisory decision).
 */
export function interpretCfgGate(gate: OnboardingGateResult): void {
  if (gate.allowed) return;

  if (gate.reasonCode === "cfg1_unavailable") {
    // Phase 2: split out of CLT1_SERVICE_UNAVAILABLE (Phase 1 Opus review L1 — that code's
    // message ("CLT-01 database is not reachable") was inaccurate when reused for a CFG-01
    // outage). CLT1_SERVICE_UNAVAILABLE is now reserved strictly for CLT-01's own DB/service
    // failure (lib/errors.ts).
    throw new Clt1Error("CLT1_CFG_GATE_UNAVAILABLE", {
      details: [{ field: "cfg_gate", issue: "CFG-01 onboarding gate could not be reached" }],
    });
  }

  if (gate.featureCode === "onboarding.retail_default") {
    throw new Clt1Error("CLT1_RETAIL_ONBOARDING_BLOCKED", {
      details: [{ field: "client_class_claimed", issue: gate.reasonCode }],
    });
  }

  throw new Clt1Error("CLT1_CFG_GATE_DENIED", {
    details: [{ field: "client_class_claimed", issue: gate.reasonCode }],
  });
}

/** Throws CLT1_CONSENT_REQUIRED if no consent_record row exists for the application yet. */
export function requireConsentForSubmit(consentCount: number): void {
  if (consentCount < 1) {
    throw new Clt1Error("CLT1_CONSENT_REQUIRED", {
      details: [{ field: "consent", issue: "at least one consent_record is required before submit" }],
    });
  }
}

export interface ClientApplicationRow {
  application_id: string;
  applicant_type: "individual" | "corporate" | "institutional";
  legal_name: string;
  registration_number: string | null;
  country_of_incorporation: string | null;
  applicant_email: string | null;
  client_class_claimed: Clt1ClientClass;
  client_class_status: string;
  status: ApplicationStatus;
  client_id: string | null;
  cfg_feature_code: string | null;
  cfg_decision_id: string | null;
  cfg_reason_code: string | null;
  cfg_evaluated_at_utc: string | null;
  assigned_reviewer: string | null;
  submitted_at_utc: string | null;
  under_review_at_utc: string | null;
  cancelled_at_utc: string | null;
  version: number;
  created_at_utc: string;
  updated_at_utc: string;
  /** Phase 2 — CDD-outcome rollup + decision columns (infra/migrations/021_clt1_cdd_final_approval.cjs). */
  cdd_outcome_status: string;
  aml_sanctions_status: string;
  pep_adverse_media_status: string;
  risk_rating_status: string;
  approved_at_utc: string | null;
  rejected_at_utc: string | null;
  held_at_utc: string | null;
  approval_id: string | null;
  rejection_reason: string | null;
  hold_reason: string | null;
  /** Phase 4A.1 (infra/migrations/047_clt1_atomic_kyc_roster_binding.cjs) — the roster digest the
   * LATEST accepted `kyc_kyb` outcome was validated against; NULL if none has ever been accepted
   * under this binding. Deliberately NOT included in `safeApplicationResponse`'s explicit
   * allowlist below — it is read only by `routes/decisions.ts`'s approval-gate recheck. */
  kyc_roster_hash: string | null;
}

/**
 * Non-PII projection of a client_application row — approved Phase 1 design decision (PII/
 * sensitive-reads): `legal_name`/`registration_number`/`country_of_incorporation`/
 * `applicant_email` are stored but NEVER returned by any Phase 1 route. This is the single choke
 * point every route response passes through, so a future field addition to the DB row does not
 * silently leak into an API response without an explicit decision to add it here.
 */
export function safeApplicationResponse(row: ClientApplicationRow): Record<string, unknown> {
  return {
    application_id: row.application_id,
    applicant_type: row.applicant_type,
    client_class_claimed: row.client_class_claimed,
    client_class_status: row.client_class_status,
    status: row.status,
    client_id: row.client_id,
    cfg_feature_code: row.cfg_feature_code,
    cfg_decision_id: row.cfg_decision_id,
    cfg_reason_code: row.cfg_reason_code,
    cfg_evaluated_at_utc: row.cfg_evaluated_at_utc,
    assigned_reviewer: row.assigned_reviewer,
    submitted_at_utc: row.submitted_at_utc,
    under_review_at_utc: row.under_review_at_utc,
    cancelled_at_utc: row.cancelled_at_utc,
    version: row.version,
    created_at_utc: row.created_at_utc,
    updated_at_utc: row.updated_at_utc,
    cdd_outcome_status: row.cdd_outcome_status,
    aml_sanctions_status: row.aml_sanctions_status,
    pep_adverse_media_status: row.pep_adverse_media_status,
    risk_rating_status: row.risk_rating_status,
    approved_at_utc: row.approved_at_utc,
    rejected_at_utc: row.rejected_at_utc,
    held_at_utc: row.held_at_utc,
    approval_id: row.approval_id,
    rejection_reason: row.rejection_reason,
    hold_reason: row.hold_reason,
  };
}

export function applicationNotFound(): never {
  throw new Clt1Error("CLT1_APPLICATION_NOT_FOUND");
}
