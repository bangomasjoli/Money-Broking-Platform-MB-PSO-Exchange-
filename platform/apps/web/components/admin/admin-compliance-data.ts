import { CLIENT_LIFECYCLE_LABELS, DEMO_CLIENT_STATE, KYC_CASE_LABELS, UBO_ON_FILE } from "@/components/client/client-demo-data";
import { DEMO_CHECKLIST_ITEMS, type ChecklistItemStatus } from "@/components/compliance/compliance-data";
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
 * - KYC/KYB and the client summary ← `client/client-demo-data.ts` + `compliance/compliance-data.ts`
 *   (the Client Portal's own Phase 2F–2H state: `kyc_case.status = pending_documents`, lifecycle
 *   `active_limited`, a checklist of one `received` and one `missing` document, beneficial-ownership
 *   information on file);
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

/** Governed `checklist_item.status` words for staff. The Client Portal uses client-instruction
 * wording ("Not Yet Submitted"); a compliance user reads the enum's own terms. */
const CHECKLIST_STAFF_LABELS: Record<ChecklistItemStatus, string> = {
  missing: "Missing",
  received: "Received",
  verified: "Verified",
  rejected: "Rejected",
  expired: "Expired",
};

function checklistCount(status: ChecklistItemStatus): number {
  return DEMO_CHECKLIST_ITEMS.filter((item) => item.status === status).length;
}

export function buildAttentionRows(): AttentionRow[] {
  const rows: AttentionRow[] = [];

  // KYC / KYB — `kyc_case.status = pending_documents` for the demo client.
  const pendingCases = DEMO_CLIENT_STATE.kycCaseStatus === "pending_documents" ? 1 : 0;
  const missing = checklistCount("missing");
  const received = checklistCount("received");
  rows.push({
    id: "kyc-kyb",
    area: "KYC / KYB",
    owner: "KYC-01",
    status: KYC_CASE_LABELS.pending_documents,
    count: plural(pendingCases, "case"),
    meaning: `${plural(missing, "checklist item")} ${missing === 1 ? "is" : "are"} ${CHECKLIST_STAFF_LABELS.missing.toLowerCase()}; ${received} ${received === 1 ? "has" : "have"} been ${CHECKLIST_STAFF_LABELS.received.toLowerCase()} and ${received === 1 ? "is" : "are"} awaiting verification.`,
  });

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

  // AML / EDD — real concepts, no admin-safe projection: stated, never implied to be clear.
  rows.push({
    id: "aml-edd",
    area: "AML screening and EDD",
    owner: "AML-01 / KYC-01",
    status: "Not represented in this preview",
    count: "—",
    meaning:
      "No admin-safe projection exists yet, so nothing is implied about current screening, alerts or enhanced due diligence.",
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
    { label: "Case type", value: DEMO_CLIENT_STATE.applicantType === "individual" ? "Individual (KYC)" : "Entity (KYB)" },
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
}

export const REVIEW_AREAS: ReviewArea[] = [
  { label: "Client Risk / KYC-KYB", owner: "KYC-01" },
  { label: "AML / Transaction Monitoring", owner: "AML-01" },
  { label: "EDD / Review", owner: "KYC-01" },
  { label: "Approval Queue", owner: "IAM-02" },
  { label: "Users / Roles / Permissions", owner: "IAM-02 / IAM-01" },
  { label: "Feature Flags / Configuration", owner: "CFG-01" },
  { label: "Audit / Sensitive Access", owner: "SEC-01" },
];
