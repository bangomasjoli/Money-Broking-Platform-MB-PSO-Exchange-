import { AML_MONITORING_HREF, subjectsNeedingAttention } from "@/components/admin/aml-monitoring-data";
import { APPROVAL_QUEUE_HREF } from "@/components/admin/approval-oversight-data";
import { EDD_REVIEW_HREF, REVIEW_ITEMS } from "@/components/admin/edd-review-data";
import {
  CHECKLIST_STAFF_LABELS,
  CLIENT_RISK_KYC_KYB_HREF,
  DEMO_CLIENT_COMPLIANCE,
  KYC_CASE_TYPE_LABELS,
  kycCaseTypeForApplicant,
} from "@/components/admin/client-risk-data";
import { CLIENT_LIFECYCLE_LABELS, DEMO_CLIENT_STATE, KYC_CASE_LABELS, UBO_ON_FILE } from "@/components/client/client-demo-data";
import {
  DEMO_CHECKLIST_ITEMS,
  outstandingChecklistItems,
  type ChecklistItemStatus,
} from "@/components/compliance/compliance-data";
import {
  APPROVAL_STATUS_LABELS,
  APPROVAL_TYPES,
  DEMO_APPROVAL_REQUESTS_ALL,
  isAwaitingChecker,
} from "@/components/ops/approval-request-data";
import { DEMO_AUDIT_EVENTS, auditEventModule, recordsSensitiveAccess } from "@/components/ops/audit-activity-data";
import { DEMO_APPROVED_CLIENT_REF } from "@/components/ops/client-request-data";

/**
 * Admin / Compliance — Compliance Overview. Data layer. UI Phase 2N.
 *
 * **A narrow PROJECTION of existing demo domain state — no fixture of its own.** Every count and
 * status below is computed from the shared sources the other surfaces already render, so this page
 * cannot contradict them:
 *
 * - the client summary ← `client/client-demo-data.ts` + `compliance/compliance-data.ts` (the Client
 *   Portal's own Phase 2F–2H state: `kyc_case.status = pending_documents`, lifecycle `active_limited`, a
 *   checklist of one `received` and one `missing` document, beneficial-ownership information on file);
 * - KYC/KYB attention ← `admin/client-risk-data.ts` (UI Phase 2O), the Client Risk / KYC-KYB page's
 *   dataset, whose `DEMO-CLI-001` record is built from those same Client Portal modules — so the counts
 *   here and the rows on that page are one source, not two;
 * - pending approvals ← `ops/approval-request-data.ts` (the Maker-Checker Queue's requests);
 * - sensitive access ← `ops/audit-activity-data.ts` (the Audit / Activity events).
 *
 * Every vocabulary is a real governed one, verified against source this turn (full capability map:
 * `UI-04` §49.1): `kyc_case.status` (`pending_documents`/`completed`/`remediation`),
 * `checklist_item.status` (`missing`/`received`/`verified`/`rejected`/`expired`), the client lifecycle,
 * `iam2.approval_request.status`, and SEC-01's event types.
 *
 * **What is deliberately NOT here — and why (each is a recorded finding, not an oversight):**
 * - **No cross-client aggregation exists in the backend.** KYC-01's `GET /internal/kyc1/cases`
 *   requires `application_id` or `client_id` ("never a global unbounded dump"); AML-01's
 *   `GET /internal/aml1/risk-signals` requires `subject_type` AND `subject_ref`; CLT-01 and IAM-02
 *   have no list route. So the counts below are demo aggregation, not a real projection.
 * - **No AML content.** AML-01 has real concepts — screening requests, matches, risk signals with a
 *   `low | medium | high | critical` severity, route-triggered rescreening runs — but no admin-safe
 *   projection, and its "monitoring" is periodic RESCREENING, not transaction monitoring (no
 *   transaction module exists). Inventing an open signal or match would be inventing an alert.
 * - **No EDD content.** No EDD model exists in code; KYC-01's `manual_review`/`edd` case states are
 *   excluded from its CHECK because "no reachable code path" exists.
 * - **No risk rating.** CLT-01 defines a governed rating (`low | medium | high | prohibited`) stored
 *   on `cdd_outcome.risk_rating`, but NO read projection returns the value — `outcome-status` returns
 *   only the four rollup STATUSES. A rating shown here would be invented, so none is.
 * - **No percentages, scores, totals, averages or trends** — nothing in the governed models supports
 *   them, and they are not derivable from a handful of demo records honestly.
 */

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Compliance Attention — only areas with a real governed state AND a consistent demo source.
// ---------------------------------------------------------------------------

export interface AttentionRow {
  id: string;
  area: string;
  /** Owning module(s). */
  owner: string;
  /** A governed state label, or a plain factual statement — never a judgement ("Healthy", "Safe"). */
  status: string;
  count: string;
  meaning: string;
}

function checklistCount(status: ChecklistItemStatus): number {
  return DEMO_CHECKLIST_ITEMS.filter((item) => item.status === status).length;
}

export function buildAttentionRows(): AttentionRow[] {
  const rows: AttentionRow[] = [];

  // KYC / KYB — derived from the Client Risk / KYC-KYB dataset, one row per attention-worthy governed
  // `kyc_case.status`. For the original single demo client this yields exactly the row Phase 2N first
  // rendered (1 case, 1 missing, 1 received).
  const pendingCases = DEMO_CLIENT_COMPLIANCE.filter((client) => client.caseStatus === "pending_documents");
  const pendingItems = pendingCases.flatMap((client) => client.checklist);
  const missing = pendingItems.filter((item) => item.status === "missing").length;
  const received = pendingItems.filter((item) => item.status === "received").length;
  rows.push({
    id: "kyc-kyb",
    area: "KYC / KYB",
    owner: "KYC-01",
    status: KYC_CASE_LABELS.pending_documents,
    count: plural(pendingCases.length, "case"),
    meaning: `${plural(missing, "checklist item")} ${missing === 1 ? "is" : "are"} ${CHECKLIST_STAFF_LABELS.missing.toLowerCase()}; ${received} ${received === 1 ? "has" : "have"} been ${CHECKLIST_STAFF_LABELS.received.toLowerCase()} and ${received === 1 ? "is" : "are"} awaiting verification.`,
  });

  // A remediation case is more urgent than one still awaiting documents, so the Overview must not
  // under-report it while the Client Risk / KYC-KYB page (one click away) lists it. Only when present.
  const remediationCases = DEMO_CLIENT_COMPLIANCE.filter((client) => client.caseStatus === "remediation");
  if (remediationCases.length > 0) {
    const unverified = remediationCases.flatMap((client) => outstandingChecklistItems(client.checklist)).length;
    rows.push({
      id: "kyc-kyb-remediation",
      area: "KYC / KYB",
      owner: "KYC-01",
      status: KYC_CASE_LABELS.remediation,
      count: plural(remediationCases.length, "case"),
      meaning: `Required evidence is incomplete; ${plural(unverified, "checklist item")} ${unverified === 1 ? "is" : "are"} not yet verified.`,
    });
  }

  // Independent approvals — `iam2.approval_request.status = pending`, from the Maker-Checker fixtures.
  const pending = DEMO_APPROVAL_REQUESTS_ALL.filter(isAwaitingChecker);
  const byType = new Map<string, number>();
  for (const request of pending) {
    const type = APPROVAL_TYPES[request.action];
    const key = `${type.label.toLowerCase()} (${type.module})`;
    byType.set(key, (byType.get(key) ?? 0) + 1);
  }
  const breakdown = joinList([...byType.entries()].map(([label, n]) => `${n} ${label}`));
  rows.push({
    id: "approvals",
    area: "Independent approvals",
    owner: "IAM-02",
    status: APPROVAL_STATUS_LABELS.pending,
    count: plural(pending.length, "request"),
    meaning: pending.length === 0 ? "No requests are represented in this demo view." : `${breakdown} — waiting on an independent approver.`,
  });

  // Sensitive access — events that RECORD a governed read of restricted data (SEC-01 event concept).
  const sensitive = DEMO_AUDIT_EVENTS.filter(recordsSensitiveAccess);
  const modules = Array.from(new Set(sensitive.map(auditEventModule)));
  rows.push({
    id: "sensitive-access",
    area: "Sensitive access",
    owner: "SEC-01",
    status: "Sensitive access recorded",
    count: plural(sensitive.length, "event"),
    meaning:
      sensitive.length === 0
        ? "No events are represented in this demo view."
        : `A governed read of restricted data was recorded (${modules.join(", ")}). The value that was read is never shown.`,
  });

  // AML screening — the AML / Transaction Monitoring page now exists as an interface preview, so this
  // row no longer says "not represented". The count comes from that page's own dataset and definition of
  // "needs attention" (`subjectsNeedingAttention`), so the two cannot drift. It claims no live
  // integration, and the meaning states that transaction monitoring does not exist rather than letting
  // silence read as "no alerts".
  const amlAttention = subjectsNeedingAttention();
  rows.push({
    id: "aml-screening",
    area: "AML screening",
    owner: "AML-01",
    status: "Interface preview",
    count: plural(amlAttention.length, "subject"),
    meaning:
      "Potential matches awaiting review, stalled or failed screenings and open risk signals are shown in the AML / Transaction Monitoring preview. Transaction monitoring is not implemented in the current backend.",
  });

  // EDD / Review — the EDD / Review page now exists as an interface preview, but a dedicated EDD workflow
  // still does NOT (re-verified `UI Phase 2Q`: no EDD table, route, permission, outcome type or trigger, and
  // KYC-01's `manual_review`/`edd` states are excluded from its CHECK). So the status keeps the gap in the
  // same line as the preview — "Interface preview" alone would hide it. The count comes from that page's own
  // projection (`REVIEW_ITEMS`); it is not an EDD count, the meaning says so, and the items it counts are the
  // same KYC/KYB and AML conditions already listed in the rows above.
  rows.push({
    id: "edd",
    area: "EDD / Review",
    owner: "KYC-01",
    status: "Interface preview · EDD backend not implemented",
    count: plural(REVIEW_ITEMS.length, "item"),
    meaning:
      "Existing KYC/KYB and AML conditions that may need further assessment are listed in the EDD / Review preview. They are not EDD cases; no EDD model exists.",
  });

  return rows;
}

// ---------------------------------------------------------------------------
// Client Compliance — the one demo client, exactly as the Client Portal shows it.
// ---------------------------------------------------------------------------

export interface ClientComplianceRow {
  label: string;
  value: string;
}

export function buildClientComplianceRows(): ClientComplianceRow[] {
  const checklist = (["missing", "received", "verified", "rejected", "expired"] as const)
    .map((status) => ({ status, n: checklistCount(status) }))
    .filter((entry) => entry.n > 0)
    .map((entry) => `${entry.n} ${CHECKLIST_STAFF_LABELS[entry.status]}`)
    .join(" · ");

  return [
    { label: "Client", value: DEMO_APPROVED_CLIENT_REF },
    { label: "Lifecycle", value: CLIENT_LIFECYCLE_LABELS[DEMO_CLIENT_STATE.clientLifecycle] },
    { label: "Case type", value: KYC_CASE_TYPE_LABELS[kycCaseTypeForApplicant(DEMO_CLIENT_STATE.applicantType)] },
    { label: "KYC / KYB status", value: KYC_CASE_LABELS[DEMO_CLIENT_STATE.kycCaseStatus] },
    // `kyc_case.current_outcome_status` stays null until `compute-outcome` runs, which is what moves a
    // case out of `pending_documents`.
    {
      label: "CDD outcome",
      value: DEMO_CLIENT_STATE.kycCaseStatus === "pending_documents" ? "Not yet computed" : "Computed",
    },
    { label: "Checklist", value: checklist || "No items" },
    { label: "Beneficial ownership", value: UBO_ON_FILE ? "Information on file" : "Information pending" },
  ];
}

// ---------------------------------------------------------------------------
// Approval / Control Dependencies — real governed approval-gated actions in the compliance modules.
// ---------------------------------------------------------------------------

export interface ControlDependencyRow {
  workflow: string;
  owner: string;
  /** The real `(action)` verified at each module's `verifyDecisionToken` call site. */
  action: string;
  /** Pending requests among the shared Maker-Checker fixtures; null when the workflow has none
   * represented in this demo (never rendered as zero — "not represented" is not "none"). */
  pending: number | null;
}

interface DependencyDefinition {
  workflow: string;
  owner: string;
  action: string;
}

/**
 * Compliance-relevant workflows that require independent approval through `IAM-02` (each action
 * string verified in source). Owned by `CLT-01`, `WLT-01`, `KYC-01`, `AML-01` and `SEC-01`; 22
 * approval call sites exist across seven modules, of which these five are the compliance-domain
 * ones. The control is uniform — a different user, no segregation-of-duties conflict — not a role.
 */
const DEPENDENCY_DEFINITIONS: DependencyDefinition[] = [
  { workflow: "Client application approval", owner: "CLT-01", action: "clt1.application.approve" },
  { workflow: "Destination approval", owner: "WLT-01", action: "wlt1.destination.approve_apply" },
  { workflow: "CDD outcome override", owner: "KYC-01", action: "kyc1.outcome.override" },
  { workflow: "Screening match confirmation or dismissal", owner: "AML-01", action: "aml1.match.confirm / aml1.match.dismiss" },
  { workflow: "Security alert closure", owner: "SEC-01", action: "sec1.security_alert.close" },
];

export function buildControlDependencies(): ControlDependencyRow[] {
  return DEPENDENCY_DEFINITIONS.map((definition) => {
    const represented = DEMO_APPROVAL_REQUESTS_ALL.filter((request) => request.action === definition.action);
    return {
      ...definition,
      pending: represented.length === 0 ? null : represented.filter(isAwaitingChecker).length,
    };
  });
}

// ---------------------------------------------------------------------------
// Review Areas — `UI-04` §9's planned Admin IA, with the owning module. Never links.
// ---------------------------------------------------------------------------

export interface ReviewArea {
  /** Exact governed label — identical to `ADMIN_NAV`. */
  label: string;
  owner: string;
  /** Present only once the area's page exists (`UI Phase 2O` was the first, `2P` the second, `2Q` the third, `2R` the fourth) — otherwise "planned". */
  href?: string;
  /** A capability caveat shown beside the status, for a page whose backend is only partly there. */
  note?: string;
}

export const REVIEW_AREAS: ReviewArea[] = [
  { label: "Client Risk / KYC-KYB", owner: "KYC-01", href: CLIENT_RISK_KYC_KYB_HREF },
  { label: "AML / Transaction Monitoring", owner: "AML-01", href: AML_MONITORING_HREF },
  { label: "EDD / Review", owner: "KYC-01", href: EDD_REVIEW_HREF, note: "EDD backend not implemented" },
  { label: "Approval Queue", owner: "IAM-02", href: APPROVAL_QUEUE_HREF },
  { label: "Users / Roles / Permissions", owner: "IAM-02 / IAM-01" },
  { label: "Feature Flags / Configuration", owner: "CFG-01" },
  { label: "Audit / Sensitive Access", owner: "SEC-01" },
];
