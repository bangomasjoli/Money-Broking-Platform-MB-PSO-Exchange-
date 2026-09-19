import {
  CLIENT_CLASS_LABELS,
  CLIENT_LIFECYCLE_LABELS,
  DEMO_CLIENT_STATE,
  KYC_CASE_LABELS,
  UBO_ON_FILE,
  type ApplicantType,
  type ClientClass,
  type ClientLifecycleStatus,
  type KycCaseStatus,
} from "@/components/client/client-demo-data";
import {
  DEMO_CHECKLIST_ITEMS,
  DOCUMENT_TYPE_LABELS,
  outstandingChecklistItems,
  type ChecklistItemStatus,
  type DemoChecklistItem,
} from "@/components/compliance/compliance-data";
import { DEMO_APPROVED_CLIENT_REF } from "@/components/ops/client-request-data";

/**
 * Admin / Compliance — Client Risk / KYC-KYB. Data layer. UI Phase 2O.
 *
 * **A small B-classified demo dataset, not a projection of a real route.** No cross-client read exists
 * in the backend: `KYC-01`'s `GET /internal/kyc1/cases` requires `application_id` or `client_id`
 * (≤200 rows, "never a global unbounded dump"), `CLT-01` has no client list, and every route is
 * `requireInternal`-guarded. So nothing here is browser-callable; the vocabularies are real, the
 * records are illustrative. Full capability map: `UI-04` §50.1.
 *
 * **`DEMO-CLI-001` is not re-declared.** Its record is built from the very shared modules the Client
 * Portal, Profile, Compliance Status and Compliance Overview render (`client-demo-data.ts`,
 * `compliance-data.ts`, `client-request-data.ts`), so it cannot disagree with any of them. The other
 * three clients are fictitious and use only the same governed enums.
 *
 * **Every record is a reachable governed state** (`UI-04` §50.3), derived from `KYC-01`'s engine
 * (`lib/outcome-engine.ts`) and routes rather than assumed:
 *
 * - `kyc_case.status` is `pending_documents` until `compute-outcome` runs, which sets `current_outcome_status`
 *   to `pass`/`fail`/`remediation_required` and the status via `caseStatusForOutcome`: `pass` **and** `fail`
 *   both give `completed`, `remediation_required` gives `remediation`. So **`completed` does not mean
 *   "passed"** — the outcome is a separate field and must be shown beside it. `pending` is schema-present
 *   but never persisted.
 * - `pass` requires every required checklist item `verified`; `fail` follows any required item
 *   `rejected`/`expired`; anything else that has been computed is `remediation_required`.
 * - Checklist `expired` has no writer in any route (only `missing` at creation, `received` on evidence,
 *   `verified`/`rejected` on a verification result), and `manual_review`/`edd` case states are excluded from
 *   the CHECK — neither appears in a fixture or a filter.
 * - Client class is limited to `institutional`/`hnwi`/`professional`: `retail` and `unknown` are blocked at
 *   onboarding by CFG-01 (`onboarding.retail_default`), so no client of those classes can exist.
 *
 * **Organisation names are demo-only, not merely demo values.** `legal_name` is stored on
 * `clt1.client_profile` but is never returned by any CLT-01 route (approved PII discipline —
 * `safeApplicationResponse` and the client-status route both exclude it), so no live projection could
 * populate that column today. It is shown because a list of opaque references is barely usable (the same
 * call `UI Phase 2J` made, and disclosed the same way); the client reference is the real identifier.
 *
 * **What is deliberately NOT here — each a recorded finding, not an oversight:**
 * - **No risk rating.** `CLT-01` defines a governed rating (`low | medium | high | prohibited`) on
 *   `cdd_outcome.risk_rating`, but no read projection returns the value. It is never shown, inferred or
 *   derived from anything else.
 * - **No screening content, no EDD.** `AML-01` has no client-level summary projection; no EDD model exists.
 * - **No CLT-01 rollup statuses** (`aml_sanctions_status` etc.): application-scoped, and for an approved client
 *   fixed by the approval gate — showing them would assert screening outcomes the demo does not own.
 * - **No party cases.** One client can hold an `entity` case plus an `authorised_party` case per party; only
 *   the entity case is represented, and the detail says so.
 * - **No timestamps, evidence references or hashes, reviewer identity, notes, ownership percentages or
 *   identity detail** — a case's `created_at_utc`/`updated_at_utc` are safe but no other surface shows them,
 *   and inventing a chronology would only add ways to contradict the Client Portal.
 */

// ---------------------------------------------------------------------------
// Governed vocabularies (each verified against `platform/services/kyc1/src/lib/kyc-case.ts`).
// ---------------------------------------------------------------------------

export type KycCaseType = "individual" | "entity" | "authorised_party";

/** `case_type` in staff wording. `KYC` for a natural person, `KYB` for an entity. */
export const KYC_CASE_TYPE_LABELS: Record<KycCaseType, string> = {
  individual: "Individual (KYC)",
  entity: "Entity (KYB)",
  authorised_party: "Authorised party (KYC)",
};

/** CLT-01's three `applicant_type` values collapse onto KYC-01's two primary-subject kinds
 * (`primarySubjectTypeForApplicantType`): `corporate` and `institutional` both become `entity`. */
export function kycCaseTypeForApplicant(applicantType: ApplicantType): KycCaseType {
  return applicantType === "individual" ? "individual" : "entity";
}

/** `kyc_case.current_outcome_status` — the engine's computed result. Distinct from `kyc_case.status`. */
export type KycCaseOutcome = "pass" | "fail" | "remediation_required";

export const KYC_OUTCOME_LABELS: Record<KycCaseOutcome, string> = {
  pass: "Pass",
  fail: "Fail",
  remediation_required: "Remediation required",
};

/** `checklist_item.status` words for staff. The Client Portal uses client-instruction wording ("Not Yet
 * Submitted"); a compliance reader uses the enum's own terms. */
export const CHECKLIST_STAFF_LABELS: Record<ChecklistItemStatus, string> = {
  missing: "Missing",
  received: "Received",
  verified: "Verified",
  rejected: "Rejected",
  expired: "Expired",
};

const CHECKLIST_ORDER: ChecklistItemStatus[] = ["missing", "received", "verified", "rejected", "expired"];

// ---------------------------------------------------------------------------
// Demo records.
// ---------------------------------------------------------------------------

export interface DemoClientCompliance {
  /** The client reference (`clt1.client_profile.client_id`), also the row identity. */
  clientRef: string;
  legalName: string;
  clientClass: ClientClass;
  clientLifecycle: ClientLifecycleStatus;
  caseType: KycCaseType;
  caseStatus: KycCaseStatus;
  /** `null` until `compute-outcome` has run — exactly while `caseStatus` is `pending_documents`. */
  outcome: KycCaseOutcome | null;
  checklist: DemoChecklistItem[];
  /** A coarse boolean only — never a name, percentage or identity detail. */
  beneficialOwnershipOnFile: boolean;
}

/** The outcome the shared Client Portal state implies. Only `pending_documents` is `null`; the other two
 * shared states have exactly one reachable outcome for an `entity` case, so a change to the shared
 * `kycCaseStatus` cannot leave this record contradicting it. */
function sharedClientOutcome(status: KycCaseStatus): KycCaseOutcome | null {
  if (status === "pending_documents") return null;
  return status === "remediation" ? "remediation_required" : "pass";
}

/** Items for the fictitious clients: the real `entity` case type's two default documents, both required. */
function entityChecklist(
  prefix: string,
  certificate: ChecklistItemStatus,
  representative: ChecklistItemStatus,
): DemoChecklistItem[] {
  return [
    { id: `${prefix}-doc-1`, documentType: "certificate_of_incorporation", status: certificate },
    { id: `${prefix}-doc-2`, documentType: "authorised_representative_evidence", status: representative },
  ];
}

export const DEMO_CLIENT_COMPLIANCE: DemoClientCompliance[] = [
  // The shared demo client — every field comes from the modules the other surfaces render.
  {
    clientRef: DEMO_APPROVED_CLIENT_REF,
    legalName: DEMO_CLIENT_STATE.legalName,
    clientClass: DEMO_CLIENT_STATE.clientClass,
    clientLifecycle: DEMO_CLIENT_STATE.clientLifecycle,
    caseType: kycCaseTypeForApplicant(DEMO_CLIENT_STATE.applicantType),
    caseStatus: DEMO_CLIENT_STATE.kycCaseStatus,
    outcome: sharedClientOutcome(DEMO_CLIENT_STATE.kycCaseStatus),
    checklist: DEMO_CHECKLIST_ITEMS,
    beneficialOwnershipOnFile: UBO_ON_FILE,
  },
  // `completed` + `pass`: every required item verified.
  {
    clientRef: "DEMO-CLI-002",
    legalName: "Placeholder Custody Group Ltd.",
    clientClass: "professional",
    clientLifecycle: "active_limited",
    caseType: "entity",
    caseStatus: "completed",
    outcome: "pass",
    checklist: entityChecklist("demo-cli-002", "verified", "verified"),
    beneficialOwnershipOnFile: true,
  },
  // `remediation` + `remediation_required`: computed while evidence was incomplete — nothing rejected,
  // not everything verified. A `corporate` applicant, so the case type is still `entity`.
  {
    clientRef: "DEMO-CLI-003",
    legalName: "Fictional Advisory Holdings Ltd.",
    clientClass: "hnwi",
    clientLifecycle: "active_limited",
    caseType: "entity",
    caseStatus: "remediation",
    outcome: "remediation_required",
    checklist: entityChecklist("demo-cli-003", "verified", "received"),
    beneficialOwnershipOnFile: true,
  },
  // Lifecycle is independent of the KYC case: `active_limited → suspended` is its own maker-checker
  // transition, so a suspended client with a `completed` + `pass` case is an ordinary combination.
  {
    clientRef: "DEMO-CLI-004",
    legalName: "Specimen Investment Partners Ltd.",
    clientClass: "institutional",
    clientLifecycle: "suspended",
    caseType: "entity",
    caseStatus: "completed",
    outcome: "pass",
    checklist: entityChecklist("demo-cli-004", "verified", "verified"),
    beneficialOwnershipOnFile: true,
  },
];

// ---------------------------------------------------------------------------
// Presentation helpers — every string is a governed label, never invented wording.
// ---------------------------------------------------------------------------

export function clientClassLabel(clientClass: ClientClass): string {
  return CLIENT_CLASS_LABELS[clientClass];
}

export function lifecycleLabel(lifecycle: ClientLifecycleStatus): string {
  return CLIENT_LIFECYCLE_LABELS[lifecycle];
}

/** "DEMO-CLI-001, Example Institutional Holdings Ltd." — begins with the visible reference, so it is a
 * valid accessible name for a control whose visible label is that reference (label-in-name). */
export function clientReference(client: DemoClientCompliance): string {
  return `${client.clientRef}, ${client.legalName}`;
}

/**
 * The KYC/KYB state as governed words. A `completed` case appends the outcome, because `completed` alone
 * cannot tell `pass` from `fail`; the other statuses already carry their meaning (`remediation` is only
 * ever `remediation_required`), so repeating it would be noise.
 */
export function kycStateLabel(caseStatus: KycCaseStatus, outcome: KycCaseOutcome | null): string {
  if (caseStatus === "completed" && outcome) return `${KYC_CASE_LABELS.completed} · ${KYC_OUTCOME_LABELS[outcome]}`;
  return KYC_CASE_LABELS[caseStatus];
}

/** "Not yet computed" until `compute-outcome` has produced one — never a guess. */
export function outcomeLabel(outcome: KycCaseOutcome | null): string {
  return outcome ? KYC_OUTCOME_LABELS[outcome] : "Not yet computed";
}

/** Counts by governed status, only statuses present, in a fixed order: "1 Missing · 1 Received". A
 * summary of state — deliberately never a percentage or a completion ratio. */
export function checklistSummary(items: DemoChecklistItem[]): string {
  const parts = CHECKLIST_ORDER.map((status) => ({ status, n: items.filter((item) => item.status === status).length }))
    .filter((entry) => entry.n > 0)
    .map((entry) => `${entry.n} ${CHECKLIST_STAFF_LABELS[entry.status]}`);
  return parts.length === 0 ? "No items" : parts.join(" · ");
}

/** Items not yet `verified` — the same definition the Client Portal's Outstanding Information uses. */
export function outstandingItems(client: DemoClientCompliance): DemoChecklistItem[] {
  return outstandingChecklistItems(client.checklist);
}

export function documentTypeLabel(item: DemoChecklistItem): string {
  return DOCUMENT_TYPE_LABELS[item.documentType];
}

export function beneficialOwnershipLabel(onFile: boolean): string {
  return onFile ? "Information on file" : "Information pending";
}

/** The Compliance Overview's link to this page (the route is the nav label's slug). */
export const CLIENT_RISK_KYC_KYB_HREF = "/admin/client-risk-kyc-kyb";
