import { formatRequestDate, formatRequestDateTime } from "@/components/ops/client-request-data";

/**
 * Admin / Compliance — AML / Transaction Monitoring. Data layer. UI Phase 2P.
 *
 * **This is AML SCREENING, not transaction monitoring — and the distinction is the point of the page.**
 * No transaction-monitoring capability exists in the backend: there is no ledger/transaction service,
 * AML-01's schema has no transaction subject, and it defers `transaction_triggered` rescreening
 * ("DELIBERATELY excluded" — migration 039). AML-01's "monitoring run" is a route-triggered batch that
 * RESCREENS subjects against lists (no scheduler, no cron); its pre-use gate consults already-persisted
 * screening evidence; WLT-01's velocity limits are a pre-use limit control on authorised intent. None
 * analyses transactions. Nothing in this file models an alert, a case, a rule, a filing, an amount or a
 * transaction. Full capability-boundary table: `UI-04` §51.1; the decision and its four sources: §51.2.
 *
 * **A small B-classified demo dataset, not a projection of a real route.** Every AML-01 route is
 * `requireInternal`-guarded, `GET /internal/aml1/risk-signals` needs BOTH `subject_type` and
 * `subject_ref`, and the only cross-subject read (`GET .../screening-requests/stuck`) lists operational
 * exceptions only. So nothing here is browser-callable; the vocabularies are real, the records
 * illustrative.
 *
 * **Subjects are applications and authorised parties — never clients.** AML-01's `subject_type` is
 * `client_application` | `authorised_party` and it has "no local means to bind" an application to a
 * `client_id`, so this page does NOT show a client reference or organisation name (the safe projections
 * return neither — the declared identity lives in a snapshot that no read returns). `DEMO-004` is the
 * application behind the shared demo client `DEMO-CLI-001` (`client-request-data.ts`); its AML state is
 * `clear`, so it cannot contradict the Client Portal or `/admin/client-risk-kyc-kyb`.
 *
 * **Every record is a reachable state**, derived from `AML-01`'s code rather than assumed
 * (`UI-04` §51.3), and audited by a scratch script against these rules:
 * - a `completed` request has a result and a `screened_at_utc`; a `requested` or `failed` one has neither
 *   (a failed screen writes no result row);
 * - `screening_result.overall_status` is `clear` or `potential_match` only — `confirmed_hit`/`error` are
 *   never written, and the outcome shown is DERIVED from match statuses (`deriveEffectiveStatus`);
 * - an ORIGINAL screening never emits a risk signal: `potential_match_unresolved` needs a rescreen,
 *   `rescreen_overdue` needs a monitoring run, `confirmed_hit` needs a confirm disposition;
 * - `potential_match_unresolved` severity is `high` for `sanctions`, else `medium`; `confirmed_hit` is
 *   `critical`; `superseded` is never written, so no fixture uses it.
 * There are deliberately NO monitoring-run fixtures: a real run rescreens EVERY eligible subject, so any
 * candidates/rescreens/failures counters would have to reconcile with subjects this five-row demo
 * cannot show, and an unreconcilable number is worse than none.
 *
 * **What is deliberately NOT here — each a recorded finding, not an oversight:**
 * - **No risk rating.** A risk SIGNAL's severity is AML-01's own field, raised with the signal; it is not
 *   the CLT-01 CDD rating (`low|medium|high|prohibited`), which no read projection returns. The two are
 *   kept visibly apart and one is never derived from the other.
 * - **No match names, scores, list sources or details, no provider payload, no vendor.** Those live only
 *   behind the sensitive-tier read (`aml1.screening.sensitive_read`, audited). Only the coarse `category`
 *   and `match_status` are shown — both returned by the PII-free match inventory.
 * - **No STR, EDD, case, alert, amount, wallet, hash or transaction content** — none exists in AML-01.
 */

// ---------------------------------------------------------------------------
// Governed vocabularies (each verified against `platform/services/aml1/src`).
// ---------------------------------------------------------------------------

export type AmlSubjectType = "client_application" | "authorised_party";

export const AML_SUBJECT_TYPE_LABELS: Record<AmlSubjectType, string> = {
  client_application: "Client application",
  authorised_party: "Authorised party",
};

/** `screening_request.status`. Labelled with the enum's own words. */
export type ScreeningStatus = "requested" | "completed" | "failed";

export const SCREENING_STATUS_LABELS: Record<ScreeningStatus, string> = {
  requested: "Requested",
  completed: "Completed",
  failed: "Failed",
};

/** `screening_request.provenance`. Only `declared_identity` is writable today. */
export type ScreeningProvenance = "declared_identity" | "kyc_verified_identity";

export const PROVENANCE_LABELS: Record<ScreeningProvenance, string> = {
  declared_identity: "Declared identity",
  kyc_verified_identity: "KYC-verified identity",
};

/** `screening_match.category` — the coarse, safe vocabulary. */
export type MatchCategory = "sanctions" | "pep" | "adverse_media";

export const MATCH_CATEGORY_LABELS: Record<MatchCategory, string> = {
  sanctions: "Sanctions",
  pep: "PEP",
  adverse_media: "Adverse media",
};

/** `screening_match.match_status`. `dismissed` is a MATCH status, never a result status. */
export type MatchStatus = "potential_match" | "confirmed_hit" | "dismissed";

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  potential_match: "Potential match",
  confirmed_hit: "Confirmed hit",
  dismissed: "Dismissed",
};

/** AML-01's own "effective status", derived from match statuses (`clt1-outcome-mapping.ts`). */
export type ScreeningOutcome = "clear" | "potential_match" | "confirmed_hit" | "clear_after_review";

export const SCREENING_OUTCOME_LABELS: Record<ScreeningOutcome, string> = {
  clear: "Clear",
  potential_match: "Potential match",
  confirmed_hit: "Confirmed hit",
  clear_after_review: "Cleared after review",
};

/** A copy of `deriveEffectiveStatus`: a single confirmed hit outranks everything; else an unresolved
 * potential match outranks a dismissed one; only when every match is dismissed is the screen
 * reviewed-and-cleared, distinct from one that never matched anything. */
export function deriveScreeningOutcome(matchStatuses: MatchStatus[]): ScreeningOutcome {
  if (matchStatuses.length === 0) return "clear";
  if (matchStatuses.includes("confirmed_hit")) return "confirmed_hit";
  if (matchStatuses.includes("potential_match")) return "potential_match";
  return "clear_after_review";
}

/** `risk_signal.signal_type`. */
export type SignalType = "confirmed_hit" | "potential_match_unresolved" | "rescreen_overdue";

export const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  confirmed_hit: "Confirmed hit",
  potential_match_unresolved: "Potential match unresolved",
  rescreen_overdue: "Rescreen overdue",
};

/** What each signal type means in AML-01's own code — not a judgement about the subject. */
export const SIGNAL_TYPE_MEANINGS: Record<SignalType, string> = {
  confirmed_hit: "A screening match was confirmed as a hit through a human disposition.",
  potential_match_unresolved: "A rescreen surfaced a match that has not yet been reviewed.",
  rescreen_overdue: "The subject is overdue for rescreening, or its screening request is stalled.",
};

/** `risk_signal.severity` — a property of the SIGNAL, set when AML-01 raises it. Not a client risk rating. */
export type SignalSeverity = "low" | "medium" | "high" | "critical";

export const SIGNAL_SEVERITY_LABELS: Record<SignalSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/** `risk_signal.status`. `superseded` exists in the CHECK and is never written. */
export type SignalStatus = "open" | "acknowledged" | "superseded";

export const SIGNAL_STATUS_LABELS: Record<SignalStatus, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  superseded: "Superseded",
};

// ---------------------------------------------------------------------------
// Demo records.
// ---------------------------------------------------------------------------

export interface DemoMatch {
  category: MatchCategory;
  status: MatchStatus;
  /** `screening_match.reviewed_at_utc` — set only once a disposition exists. */
  reviewedAtUtc: string | null;
}

export interface DemoSignal {
  type: SignalType;
  severity: SignalSeverity;
  status: SignalStatus;
  createdAtUtc: string;
  acknowledgedAtUtc: string | null;
}

export interface DemoAmlSubject {
  /** `subject_ref` — an opaque, caller-supplied reference, never a name. Also the row identity. */
  subjectRef: string;
  subjectType: AmlSubjectType;
  /** `subject_parent_ref` — the owning application, for an authorised party. */
  parentRef: string | null;
  provenance: ScreeningProvenance;
  screeningStatus: ScreeningStatus;
  /** `screening_request.created_at_utc`. */
  requestedAtUtc: string;
  /** `screening_result.screened_at_utc` — present only for a completed screening. */
  screenedAtUtc: string | null;
  /** From the stuck projection's `age_seconds`: set only for a `requested` screening past the stuck
   * threshold, fixed at the moment the projection was read (a demo constant, never a live clock). */
  stalledAgeSeconds: number | null;
  matches: DemoMatch[];
  signals: DemoSignal[];
}

/**
 * Five subjects, each a distinct AML-01 state. The timeline fits the Ops application fixtures:
 * `DEMO-004` was under review 03 Sep and approved 10 Sep; `DEMO-002` has been under review since 14 Sep.
 */
export const DEMO_AML_SUBJECTS: DemoAmlSubject[] = [
  // Completed, no matches → `clear`. The application behind the shared demo client DEMO-CLI-001,
  // screened while under review (CLT-01 requires `under_review`) and before its 10 Sep approval.
  {
    subjectRef: "DEMO-004",
    subjectType: "client_application",
    parentRef: null,
    provenance: "declared_identity",
    screeningStatus: "completed",
    requestedAtUtc: "2026-09-04T11:29:00Z",
    screenedAtUtc: "2026-09-04T11:30:00Z",
    stalledAgeSeconds: null,
    matches: [],
    signals: [],
  },
  // Completed, one unreviewed PEP match → `potential_match`. An ORIGINAL screening, so no signal.
  {
    subjectRef: "DEMO-002",
    subjectType: "client_application",
    parentRef: null,
    provenance: "declared_identity",
    screeningStatus: "completed",
    requestedAtUtc: "2026-09-15T10:14:00Z",
    screenedAtUtc: "2026-09-15T10:15:00Z",
    stalledAgeSeconds: null,
    matches: [{ category: "pep", status: "potential_match", reviewedAtUtc: null }],
    signals: [],
  },
  // A party of the approved application, rescreened after approval: the rescreen surfaced an unreviewed
  // adverse-media match, so `potential_match_unresolved` was raised — `medium`, since it is not sanctions.
  {
    subjectRef: "DEMO-PTY-001",
    subjectType: "authorised_party",
    parentRef: "DEMO-004",
    provenance: "declared_identity",
    screeningStatus: "completed",
    requestedAtUtc: "2026-09-16T09:39:00Z",
    screenedAtUtc: "2026-09-16T09:40:00Z",
    stalledAgeSeconds: null,
    matches: [{ category: "adverse_media", status: "potential_match", reviewedAtUtc: null }],
    signals: [
      {
        type: "potential_match_unresolved",
        severity: "medium",
        status: "open",
        createdAtUtc: "2026-09-16T09:40:00Z",
        acknowledgedAtUtc: null,
      },
    ],
  },
  // `requested` for far longer than the stuck threshold (default 900s): no result, no matches. 13 800s
  // = 3 h 50 min, as the stuck projection reported it.
  {
    subjectRef: "DEMO-PTY-002",
    subjectType: "authorised_party",
    parentRef: "DEMO-002",
    provenance: "declared_identity",
    screeningStatus: "requested",
    requestedAtUtc: "2026-09-19T05:10:00Z",
    screenedAtUtc: null,
    stalledAgeSeconds: 13_800,
    matches: [],
    signals: [],
  },
  // `failed`: the provider call failed, so a failed screen wrote no result row. A monitoring run never
  // retries a failed request — it waits for a manual rescreen.
  {
    subjectRef: "DEMO-PTY-003",
    subjectType: "authorised_party",
    parentRef: "DEMO-002",
    provenance: "declared_identity",
    screeningStatus: "failed",
    requestedAtUtc: "2026-09-15T10:20:00Z",
    screenedAtUtc: null,
    stalledAgeSeconds: null,
    matches: [],
    signals: [],
  },
];

// ---------------------------------------------------------------------------
// Presentation helpers — every string is a governed label or a defined meaning, never invented.
// ---------------------------------------------------------------------------

/** "DEMO-PTY-001, Authorised party" — begins with the visible reference (label-in-name). */
export function subjectReference(subject: DemoAmlSubject): string {
  return `${subject.subjectRef}, ${AML_SUBJECT_TYPE_LABELS[subject.subjectType]}`;
}

/** The screening outcome, or `null` when there is no result to derive one from (requested/failed). */
export function outcomeFor(subject: DemoAmlSubject): ScreeningOutcome | null {
  if (subject.screeningStatus !== "completed") return null;
  return deriveScreeningOutcome(subject.matches.map((match) => match.status));
}

export function outcomeLabel(subject: DemoAmlSubject): string {
  const outcome = outcomeFor(subject);
  return outcome ? SCREENING_OUTCOME_LABELS[outcome] : "No result";
}

/** Whether a `requested` screening is past the stuck threshold — the state `GET .../stuck` lists. */
export function isStalled(subject: DemoAmlSubject): boolean {
  return subject.screeningStatus === "requested" && subject.stalledAgeSeconds !== null;
}

/** "Requested · Stalled" — the governed status, plus the exception when the stuck projection lists it. */
export function screeningStateLabel(subject: DemoAmlSubject): string {
  const base = SCREENING_STATUS_LABELS[subject.screeningStatus];
  return isStalled(subject) ? `${base} · Stalled` : base;
}

export function openSignals(subject: DemoAmlSubject): DemoSignal[] {
  return subject.signals.filter((signal) => signal.status === "open");
}

/** "None", "1 open", "1 open · 1 acknowledged" — counts by governed status, never a score. */
export function signalSummary(subject: DemoAmlSubject): string {
  if (subject.signals.length === 0) return "None";
  const parts = (["open", "acknowledged", "superseded"] as const)
    .map((status) => ({ status, n: subject.signals.filter((signal) => signal.status === status).length }))
    .filter((entry) => entry.n > 0)
    .map((entry) => `${entry.n} ${SIGNAL_STATUS_LABELS[entry.status].toLowerCase()}`);
  return parts.join(" · ");
}

/** "3 h 50 min" — the stuck projection's `age_seconds`, in words. */
export function formatAge(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export function lastScreeningDate(subject: DemoAmlSubject): string {
  return subject.screenedAtUtc ? formatRequestDate(subject.screenedAtUtc) : "—";
}

export function lastScreeningDateTime(subject: DemoAmlSubject): string {
  return subject.screenedAtUtc ? formatRequestDateTime(subject.screenedAtUtc) : "—";
}

// ---------------------------------------------------------------------------
// AML Attention — only states AML-01 actually defines, counted from the dataset above.
// ---------------------------------------------------------------------------

export interface AmlAttentionRow {
  id: string;
  area: string;
  /** The owning module, or `null` where no module implements the capability (transaction monitoring). */
  owner: string | null;
  /** A governed state or a plain factual statement — never a judgement ("Safe", "Compliant"). */
  status: string;
  count: string;
  meaning: string;
}

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

const isAwaitingReview = (subject: DemoAmlSubject) => outcomeFor(subject) === "potential_match";
const isFailed = (subject: DemoAmlSubject) => subject.screeningStatus === "failed";

/** Subjects with a real AML-01 state that a reviewer would act on — one definition, shared by this page and
 * the Compliance Overview so the two counts cannot drift. */
export function subjectsNeedingAttention(subjects: DemoAmlSubject[] = DEMO_AML_SUBJECTS): DemoAmlSubject[] {
  return subjects.filter(
    (subject) => isAwaitingReview(subject) || isStalled(subject) || isFailed(subject) || openSignals(subject).length > 0,
  );
}

export function buildAmlAttentionRows(subjects: DemoAmlSubject[] = DEMO_AML_SUBJECTS): AmlAttentionRow[] {
  const awaiting = subjects.filter(isAwaitingReview);
  const stalled = subjects.filter(isStalled);
  const failed = subjects.filter(isFailed);
  const signals = subjects.flatMap((subject) => openSignals(subject));

  return [
    {
      id: "potential-match",
      area: "Screening requires review",
      owner: "AML-01",
      status: SCREENING_OUTCOME_LABELS.potential_match,
      count: plural(awaiting.length, "subject"),
      meaning:
        awaiting.length === 0
          ? "No subjects are represented in this demo view."
          : "A screening surfaced a match that has not been confirmed or dismissed. Disposition is a separate, independently approved step.",
    },
    {
      id: "stalled",
      area: "Screening stalled",
      owner: "AML-01",
      status: `${SCREENING_STATUS_LABELS.requested} · Stalled`,
      count: plural(stalled.length, "request"),
      meaning:
        stalled.length === 0
          ? "No requests are represented in this demo view."
          : "A screening request has stayed in flight past the stuck threshold, so the subject cannot be rescreened until it is recovered.",
    },
    {
      id: "failed",
      area: "Screening failed",
      owner: "AML-01",
      status: SCREENING_STATUS_LABELS.failed,
      count: plural(failed.length, "request"),
      meaning:
        failed.length === 0
          ? "No requests are represented in this demo view."
          : "The provider call failed and no result was recorded. Rescreening runs do not retry it; it waits for a manual rescreen.",
    },
    {
      id: "open-signals",
      area: "Risk signals",
      owner: "AML-01",
      status: SIGNAL_STATUS_LABELS.open,
      count: plural(signals.length, "signal"),
      meaning:
        signals.length === 0
          ? "No signals are represented in this demo view."
          : "AML-01 raises signals but never blocks or freezes anything. Acknowledging one records that a person has seen it.",
    },
    {
      id: "transaction-monitoring",
      area: "Transaction monitoring",
      owner: null,
      status: "Not implemented in the current backend",
      count: "—",
      meaning:
        "AML-01 rescreens subjects against lists; it does not analyse transactions. Nothing on this page describes transaction activity.",
    },
  ];
}

// ---------------------------------------------------------------------------
// Links.
// ---------------------------------------------------------------------------

/** The Compliance Overview's link to this page (the route is the nav label's slug). */
export const AML_MONITORING_HREF = "/admin/aml-transaction-monitoring";
