import { DEMO_CLIENT_STATE, UBO_ON_FILE } from "@/components/client/client-demo-data";

/**
 * KYC / KYB Compliance Status — data layer. UI Phase 2H.
 *
 * Full internal→client mapping table: `UI-04` §43.2. Every value below traces to real governed
 * `KYC-01` source, verified this turn:
 *
 * - `ChecklistItemStatus` — the exact `CHECKLIST_ITEM_STATUSES` tuple from
 *   `platform/services/kyc1/src/lib/kyc-case.ts` (`missing`/`received`/`verified`/`rejected`/
 *   `expired`).
 * - `DocumentType` — the exact document types from that file's own
 *   `DEFAULT_CHECKLIST_BY_CASE_TYPE` (`certificate_of_incorporation`/
 *   `authorised_representative_evidence` for the `entity` case type — AIX's demo client is
 *   `institutional`/`entity`, matching `DEMO_CLIENT_STATE.applicantType`; `identity_document`/
 *   `authority_evidence` for the `authorised_party` case type, included for completeness even
 *   though not used in this turn's own demo fixtures).
 * - The primary client-facing "Current Status" reuses `DEMO_CLIENT_STATE.kycCaseStatus`
 *   (`kyc_case.status` — `pending_documents`/`completed`/`remediation`) directly — the SAME
 *   shared value `UI Phase 2F`'s Overview and `UI Phase 2G`'s Profile pages already show. The
 *   engine-level `cdd_outcome.outcome_status` (`pass`/`fail`/`remediation_required`) and its
 *   `outcome_reason` are deliberately NOT surfaced anywhere on this page — an internal decision-
 *   record detail, not the governed client-facing status (`kyc_case.status` already reflects its
 *   practical consequence; see `UI-04` §43.2 for the full "why this one, not that one" reasoning).
 *
 * Deliberately NOT modeled — no field/case/document-type exists anywhere in the governed
 * `KYC-01` source for either (searched directly this turn, not assumed): Source of Funds / Source
 * of Wealth, and Business Activity. No risk rating, AML score, sanctions/PEP screening result,
 * STR status, or internal case-management detail (owner/reviewer/analyst/notes/queue) is modeled
 * anywhere in this file — none of it is client-facing in the governed model, and this turn's own
 * instruction requires omitting it by default regardless.
 */

// ---------------------------------------------------------------------------
// Checklist items — the real per-document verification-request model.
// ---------------------------------------------------------------------------

export type ChecklistItemStatus = "missing" | "received" | "verified" | "rejected" | "expired";
export type DocumentType =
  | "certificate_of_incorporation"
  | "authorised_representative_evidence"
  | "identity_document"
  | "authority_evidence";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  certificate_of_incorporation: "Certificate of Incorporation",
  authorised_representative_evidence: "Authorised Representative Evidence",
  identity_document: "Identity Document",
  authority_evidence: "Authority Evidence",
};

/** Client-facing label per checklist state — never the raw internal enum value. */
export const CHECKLIST_STATUS_LABELS: Record<ChecklistItemStatus, string> = {
  missing: "Not Yet Submitted",
  received: "Received — Under Review",
  verified: "Verified",
  rejected: "Resubmission Required",
  expired: "Resubmission Required (Expired)",
};

/** Whether a checklist state represents something the CLIENT still needs to act on — used to
 * decide "Outstanding Information" membership and the section's own "action needed" wording.
 * `received` is outstanding (not yet complete) but NOT client-actionable right now. */
export const CHECKLIST_ACTION_NEEDED: Record<ChecklistItemStatus, boolean> = {
  missing: true,
  received: false,
  verified: false,
  rejected: true,
  expired: true,
};

export interface DemoChecklistItem {
  id: string;
  documentType: DocumentType;
  status: ChecklistItemStatus;
}

/** 2 items — this turn's own "keep 1–3 items maximum" instruction. Both drawn from the real
 * `entity` case type's own checklist (`certificate_of_incorporation`,
 * `authorised_representative_evidence`) — consistent with `DEMO_CLIENT_STATE.applicantType`
 * (`institutional`) and `DEMO_CLIENT_STATE.kycCaseStatus` (`pending_documents` — at least one item
 * genuinely outstanding). */
export const DEMO_CHECKLIST_ITEMS: DemoChecklistItem[] = [
  { id: "demo-doc-1", documentType: "certificate_of_incorporation", status: "received" },
  { id: "demo-doc-2", documentType: "authorised_representative_evidence", status: "missing" },
];

export function outstandingChecklistItems(items: DemoChecklistItem[]): DemoChecklistItem[] {
  return items.filter((item) => item.status !== "verified");
}

// ---------------------------------------------------------------------------
// Verification areas — a broad, client-facing rollup (not a literal 1:1 projection of KYC-01's
// own case-per-party model, which would be too granular for this summary page). Three areas,
// matching the three real KYC-01 `KYC_CASE_TYPES` concepts, not five speculative categories.
// ---------------------------------------------------------------------------

export type VerificationAreaState = "On file" | "Under Review" | "Pending Information";

export interface VerificationArea {
  label: string;
  state: VerificationAreaState;
}

export function deriveVerificationAreas(items: DemoChecklistItem[]): VerificationArea[] {
  const byType = new Map(items.map((item) => [item.documentType, item.status]));

  const stateFor = (status: ChecklistItemStatus | undefined): VerificationAreaState => {
    if (status === "verified") return "On file";
    if (status === "received") return "Under Review";
    return "Pending Information";
  };

  return [
    { label: "Organisation Identity", state: stateFor(byType.get("certificate_of_incorporation")) },
    { label: "Authorised Representatives", state: stateFor(byType.get("authorised_representative_evidence")) },
    { label: "Beneficial Ownership", state: UBO_ON_FILE ? "On file" : "Pending Information" },
  ];
}

export const DEMO_VERIFICATION_AREAS: VerificationArea[] = deriveVerificationAreas(DEMO_CHECKLIST_ITEMS);

// ---------------------------------------------------------------------------
// Current status — reuses the shared client-level demo state directly, never a second value.
// ---------------------------------------------------------------------------

export const CURRENT_KYC_STATUS = DEMO_CLIENT_STATE.kycCaseStatus;
