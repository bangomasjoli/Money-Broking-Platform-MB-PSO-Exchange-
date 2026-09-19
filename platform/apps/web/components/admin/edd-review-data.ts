import {
  AML_SUBJECT_TYPE_LABELS,
  DEMO_AML_SUBJECTS,
  SCREENING_STATUS_LABELS,
  isStalled,
  openSignals,
  outcomeFor as amlOutcomeFor,
  outcomeLabel as amlOutcomeLabel,
  screeningStateLabel,
  subjectsNeedingAttention,
  type DemoAmlSubject,
} from "@/components/admin/aml-monitoring-data";
import { DEMO_CLIENT_COMPLIANCE, kycStateLabel, type DemoClientCompliance } from "@/components/admin/client-risk-data";

/**
 * Admin / Compliance — EDD / Review. Data layer. UI Phase 2Q.
 *
 * **EDD NOT IMPLEMENTED — and this file models no EDD.** Re-verified from source this turn (`UI-04`
 * §52.1): the whole backend contains eight lines mentioning "EDD" (in three files), every one a comment
 * or description stating it is excluded; KYC-01's `manual_review`/`edd` case states have "no reachable
 * code path"; no EDD permission, route, outcome type or rescreen trigger exists; and source-of-funds/wealth
 * has no code at all. The platform masters define EDD (CMP-07, AML-RULE-006) but no service implements it. So there is no EDD case, status,
 * trigger, owner, assignee, due date, SLA, decision, escalation or evidence pack here, and none is implied.
 * Look-alike models (SEC-01's security-alert assignee/SLA, CLT-01's application reviewer, KYC-01's outcome
 * override) belong to other domains and are deliberately not used.
 *
 * **REVIEW ATTENTION IS A DEMO/ADMIN PROJECTION, NOT A SINGLE BACKEND CASE OBJECT.** No backend "review
 * state" exists. Every item below is COMPUTED, at module load, from two existing shared datasets — each
 * standing in for a different module's real state — so this page owns no domain facts of its own and cannot
 * contradict the pages that do:
 *
 * - KYC/KYB items ← `client-risk-data.ts` (`UI Phase 2O`): a case that is `pending_documents` or
 *   `remediation`, or `completed` with a `fail` outcome;
 * - AML items ← `aml-monitoring-data.ts` (`UI Phase 2P`): exactly `subjectsNeedingAttention`, the
 *   definition that page and the Compliance Overview already share.
 *
 * **An item is (subject × review area).** One underlying event is never counted twice: a party's open risk
 * signal was raised because of its unresolved match, so that is ONE AML item with the signal as related
 * context. **Reason selection is a label choice, never a ranking** — stalled, then failed, then potential
 * match, then open signal: exceptions with no result first, because a potential match needs a completed
 * result. Nothing is ordered by importance, and **there is no universal priority**: KYC status is not ranked
 * against signal severity, and severity appears only inside AML detail, labelled as the signal's own.
 *
 * **Deliberately not items** (`UI-04` §52.2): a suspended client (the result of a decision already taken,
 * with a reason no read returns), a held application and a `pending_review` wallet destination (owned by the
 * Ops pages), a pending approval (the future Approval Queue), a confirmed hit with no open signal (a
 * determination already made), and anything from SEC-01 (a different domain).
 *
 * **No review reference is invented.** A neutral `DEMO-REV-001` was permitted and not used: a per-row
 * identifier is the one thing that makes a projection look like a case. A row's identity is its subject and
 * area.
 *
 * **Not here, each a recorded finding:** no risk rating (a governed rating exists, no read returns it, and
 * it is never derived from a reason, state, severity or class); no timestamp on KYC items (the shared KYC
 * data has none, and inventing one would add ways to contradict `UI Phase 2O`); no reviewer, assignee or
 * name; no timeline; no PII, document, matched-person detail, provider payload or evidence.
 */

// ---------------------------------------------------------------------------
// Review areas, reasons and source modules. Areas and reasons are UI projection labels chosen for
// factual accuracy — they are NOT backend enums — so each is defined next to the governed state it reads.
// ---------------------------------------------------------------------------

export type ReviewArea = "kyc_kyb" | "aml_screening";

export const REVIEW_AREA_LABELS: Record<ReviewArea, string> = {
  kyc_kyb: "KYC / KYB",
  aml_screening: "AML screening",
};

/** The order areas are listed in — a grouping, not a priority. */
export const REVIEW_AREA_ORDER: ReviewArea[] = ["kyc_kyb", "aml_screening"];

export type ReviewReason =
  | "pending_required_information"
  | "remediation_required"
  | "completed_with_fail_outcome"
  | "potential_match_awaiting_review"
  | "screening_stalled"
  | "screening_failed"
  | "open_risk_signal";

export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  pending_required_information: "Pending required information",
  remediation_required: "Remediation required",
  completed_with_fail_outcome: "Completed with fail outcome",
  potential_match_awaiting_review: "Potential match awaiting review",
  screening_stalled: "Screening stalled",
  screening_failed: "Screening failed",
  open_risk_signal: "Open risk signal",
};

export type ReviewSourceModule = "KYC-01" | "AML-01";

export interface ReviewItem {
  /** `${area}:${subjectRef}` — the row identity. Not a case identifier: none exists. */
  key: string;
  area: ReviewArea;
  subjectRef: string;
  subjectTypeLabel: string;
  reason: ReviewReason;
  sourceModule: ReviewSourceModule;
  /** The governed source state, in the source page's own words. */
  stateLabel: string;
  /** Exactly one of these is set: the shared record the item is projected from. */
  kyc: DemoClientCompliance | null;
  aml: DemoAmlSubject | null;
}

// ---------------------------------------------------------------------------
// Projection.
// ---------------------------------------------------------------------------

/** The KYC review condition a case is in, or `null` when it needs none (`completed` + `pass`). */
export function kycReviewReason(client: DemoClientCompliance): ReviewReason | null {
  if (client.caseStatus === "pending_documents") return "pending_required_information";
  if (client.caseStatus === "remediation") return "remediation_required";
  if (client.caseStatus === "completed" && client.outcome === "fail") return "completed_with_fail_outcome";
  return null;
}

/** The single reason label for an AML subject. Label selection, not ranking — see the file header. */
export function amlReviewReason(subject: DemoAmlSubject): ReviewReason | null {
  if (isStalled(subject)) return "screening_stalled";
  if (subject.screeningStatus === "failed") return "screening_failed";
  if (amlOutcomeFor(subject) === "potential_match") return "potential_match_awaiting_review";
  if (openSignals(subject).length > 0) return "open_risk_signal";
  return null;
}

/** "Completed · Potential match" / "Requested · Stalled" / "Failed" — the AML page's own state words. */
function amlStateLabel(subject: DemoAmlSubject): string {
  if (subject.screeningStatus !== "completed") return screeningStateLabel(subject);
  return `${SCREENING_STATUS_LABELS.completed} · ${amlOutcomeLabel(subject)}`;
}

export function buildReviewItems(
  clients: DemoClientCompliance[] = DEMO_CLIENT_COMPLIANCE,
  subjects: DemoAmlSubject[] = DEMO_AML_SUBJECTS,
): ReviewItem[] {
  const items: ReviewItem[] = [];

  for (const client of clients) {
    const reason = kycReviewReason(client);
    if (!reason) continue;
    items.push({
      key: `kyc_kyb:${client.clientRef}`,
      area: "kyc_kyb",
      subjectRef: client.clientRef,
      subjectTypeLabel: "Client",
      reason,
      sourceModule: "KYC-01",
      stateLabel: kycStateLabel(client.caseStatus, client.outcome),
      kyc: client,
      aml: null,
    });
  }

  // The AML half reuses the AML page's own "needs attention" definition, so the two pages cannot disagree.
  for (const subject of subjectsNeedingAttention(subjects)) {
    const reason = amlReviewReason(subject);
    if (!reason) continue;
    items.push({
      key: `aml_screening:${subject.subjectRef}`,
      area: "aml_screening",
      subjectRef: subject.subjectRef,
      subjectTypeLabel: AML_SUBJECT_TYPE_LABELS[subject.subjectType],
      reason,
      sourceModule: "AML-01",
      stateLabel: amlStateLabel(subject),
      kyc: null,
      aml: subject,
    });
  }

  return items;
}

/** Computed once from the shared datasets. Grouped by review area, then in the source datasets' order. */
export const REVIEW_ITEMS: ReviewItem[] = buildReviewItems();

/** Areas that actually have an item, in `REVIEW_AREA_ORDER` — so the filter never offers an empty option. */
export function areasPresent(items: ReviewItem[] = REVIEW_ITEMS): ReviewArea[] {
  return REVIEW_AREA_ORDER.filter((area) => items.some((item) => item.area === area));
}

/** "DEMO-004, AML screening" — begins with the visible reference (label-in-name). */
export function reviewItemReference(item: ReviewItem): string {
  return `${item.subjectRef}, ${REVIEW_AREA_LABELS[item.area]}`;
}

// ---------------------------------------------------------------------------
// Links.
// ---------------------------------------------------------------------------

/** The Compliance Overview's link to this page (the route is the nav label's slug). */
export const EDD_REVIEW_HREF = "/admin/edd-review";
