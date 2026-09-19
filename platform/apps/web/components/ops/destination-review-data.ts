import { DEMO_APPROVED_CLIENT_REF } from "@/components/ops/client-request-data";
import {
  DEMO_DESTINATIONS,
  type DestinationStatus,
  type PublicDestination,
} from "@/components/wallet-destinations/destination-data";

/**
 * Staff/Operations — Wallet Destination Review. Shared data layer. UI Phase 2K.
 *
 * ONE source for the demo destination-review records, imported by BOTH Ops pages that show them
 * (`/ops` Operational Overview and `/ops/wallet-destination-review`) so they cannot disagree.
 *
 * **Shared base + staff-only metadata.** Each record's `destination` is taken from the Client
 * Portal's own fixtures (`wallet-destinations/destination-data.ts`'s `DEMO_DESTINATIONS`) — the
 * same object, by reference, for the five destinations the demo client owns — so the two portals
 * agree on identity, type, masked value, network/rail and status. Everything staff-only (client
 * reference, screening outcome, proof-of-control state, beneficiary verification, stuck-screening
 * age) lives in a separate `review` object that the client fixtures never see. One extra destination
 * (`demo-dest-006`) is staff-only because it belongs to a second client and so must not appear on
 * the first client's own page.
 *
 * Every value traces to real `WLT-01` source, verified this turn (full capability map: `UI-04`
 * §46.1). All internal routes are `requireInternal`-guarded and **no list route exists at any
 * layer** — nothing here is callable from a staff browser session today:
 *
 * - Base fields = the internal safe responses (`lib/safe-response.ts` `SafeWalletDestinationResponse`;
 *   `routes/payout-destinations.ts` `safeFiatDestinationResponse`) minus internal counters
 *   (`whitelist_version`, `revocation_epoch`, `destination_status_version`) that are noise to a
 *   reviewer. Both add `client_id`, which staff need and the public DTO deliberately omits.
 * - Fiat `verification_status` (`pending`/`verified`/`name_mismatch`/`not_supported`) is a real field
 *   of the internal fiat safe response — the ONLY review-evidence value any safe response carries.
 * - `ScreeningOutcome` — `RISK_STATUSES` (`clear`/`review_required`/`high_risk`/`hit`,
 *   `lib/providers/types.ts`) plus the two in-flight values `pending` and `failed` (`lib/stuck-
 *   screening.ts` widening). Coarse outcome only: `risk_score`, categories and exposure are never
 *   modelled. **No safe response exposes this today** — it is demo-projected (`UI-04` §46.9).
 * - Proof of control — coarse `verified`/`not_verified`/`not_applicable`. The only internal PoC read
 *   (`GET .../proof-of-control`) returns the FULL recovered address and writes a sensitive-read audit
 *   event, so it is not a staff summary; a coarse projection does not exist and is demo-projected.
 *
 * **Deliberately NOT modelled** (not in any safe response, or not for staff): `cooling_off_until_utc`
 * (column exists, in no safe projection — so no countdown or time-remaining is ever shown),
 * `whitelist_approval_ref`, screening validity window, `updated_at_utc` (only `created_at_utc`
 * exists), first-use state, limits/velocity/concentration profiles (no read route at all), any raw
 * address or account value, and any balance/ledger/custody/settlement figure (WLT-01 owns none).
 */

// ---------------------------------------------------------------------------
// Staff-only review metadata.
// ---------------------------------------------------------------------------

export type ScreeningOutcome = "pending" | "clear" | "review_required" | "high_risk" | "hit" | "failed";

export const SCREENING_OUTCOME_LABELS: Record<ScreeningOutcome, string> = {
  pending: "In progress",
  clear: "Clear",
  review_required: "Review required",
  high_risk: "High risk",
  hit: "Hit",
  failed: "Failed — recovered",
};

export type ProofOfControlState = "verified" | "not_verified" | "not_applicable";

export const PROOF_OF_CONTROL_LABELS: Record<ProofOfControlState, string> = {
  verified: "Verified",
  not_verified: "Not verified",
  not_applicable: "Not applicable",
};

export type BeneficiaryVerificationStatus = "pending" | "verified" | "name_mismatch" | "not_supported";

export const BENEFICIARY_VERIFICATION_LABELS: Record<BeneficiaryVerificationStatus, string> = {
  pending: "Pending",
  verified: "Verified",
  name_mismatch: "Name mismatch",
  not_supported: "Not supported",
};

export interface DestinationReviewMetadata {
  /** Short obviously-fictitious reference. Real ids are `wlt1dest_<uuid>`. */
  ref: string;
  /** `client_id` — present in both internal safe responses. An APPROVED client's reference, never a
   * pending application's (`UI Phase 2J` correction: a destination belongs to a client, and a
   * client exists only after approval). */
  clientRef: string;
  screening: ScreeningOutcome | null;
  proofOfControl: ProofOfControlState;
  beneficiaryVerification: BeneficiaryVerificationStatus | null;
  /** `age_seconds` from `GET /internal/wlt1/stuck-screenings`, in minutes — non-null ONLY for a
   * `pending_screening` wallet whose screening has outlived the recovery threshold. */
  stuckScreeningMinutes: number | null;
}

export interface DestinationReviewRecord {
  destination: PublicDestination;
  review: DestinationReviewMetadata;
}

/** Second demo client — a reference string only; no CLT demo application backs it (the Client
 * Requests queue is a small slice, not the client register). */
export const DEMO_SECOND_CLIENT_REF = "DEMO-CLI-002";

/** Staff-only destination — belongs to `DEMO_SECOND_CLIENT_REF`, so it is absent from the first
 * client's own Wallet & Payout Destinations page by design. */
const STAFF_ONLY_DESTINATION: PublicDestination = {
  destination_id: "demo-dest-006",
  destination_type: "wallet",
  status: "pending_review",
  chain: "ethereum",
  network: "mainnet",
  address_masked: "0x3D8e••••••••A04b",
  memo_tag_present: false,
  wallet_type: "unhosted",
  beneficiary_relationship: "third_party",
  created_at_utc: "2026-09-14T12:20:00Z",
};

function baseFor(id: string): PublicDestination {
  const found = DEMO_DESTINATIONS.find((d) => d.destination_id === id);
  if (!found) throw new Error(`demo destination ${id} missing from the client fixtures`);
  return found;
}

/**
 * 6 records, each a REACHABLE combination (`UI-04` §46.5):
 * - `001` wallet `active`, hosted → no proof-of-control applies.
 * - `002` wallet `pending_screening`, screening `pending`, stuck 94 min → the only queue row that
 *   awaits staff at this stage (recovery). Wallet only — a fiat destination never enters
 *   `pending_screening` (`draft → pending_review` directly).
 * - `003` fiat `pending_review`, screening clear, beneficiary verified → all approval gates met.
 * - `004` fiat `approved_pending_cooling` → past approval; cooling end time is not staff-visible.
 * - `005` wallet `revoked` → terminal; evidence not shown.
 * - `006` wallet `pending_review`, screening `review_required`, PoC verified → a `pending_review`
 *   destination whose screening is NOT clear: any terminal screening result advances the wallet to
 *   `pending_review` (`lib/screening-application.ts`), but only `clear` passes the approval gate.
 *   No `high_risk`/`hit` row: same mechanism, and this turn asks not to overload negatives.
 */
const RAW_REVIEW_RECORDS: DestinationReviewRecord[] = [
  {
    destination: baseFor("demo-dest-001"),
    review: {
      ref: "DEMO-WLT-001",
      clientRef: DEMO_APPROVED_CLIENT_REF,
      screening: "clear",
      proofOfControl: "not_applicable",
      beneficiaryVerification: null,
      stuckScreeningMinutes: null,
    },
  },
  {
    destination: baseFor("demo-dest-002"),
    review: {
      ref: "DEMO-WLT-002",
      clientRef: DEMO_APPROVED_CLIENT_REF,
      screening: "pending",
      proofOfControl: "not_verified",
      beneficiaryVerification: null,
      stuckScreeningMinutes: 94,
    },
  },
  {
    destination: baseFor("demo-dest-003"),
    review: {
      ref: "DEMO-PAY-001",
      clientRef: DEMO_APPROVED_CLIENT_REF,
      screening: "clear",
      proofOfControl: "not_applicable",
      beneficiaryVerification: "verified",
      stuckScreeningMinutes: null,
    },
  },
  {
    destination: baseFor("demo-dest-004"),
    review: {
      ref: "DEMO-PAY-002",
      clientRef: DEMO_APPROVED_CLIENT_REF,
      screening: "clear",
      proofOfControl: "not_applicable",
      beneficiaryVerification: "verified",
      stuckScreeningMinutes: null,
    },
  },
  {
    destination: baseFor("demo-dest-005"),
    review: {
      ref: "DEMO-WLT-003",
      clientRef: DEMO_APPROVED_CLIENT_REF,
      screening: null,
      proofOfControl: "not_applicable",
      beneficiaryVerification: null,
      stuckScreeningMinutes: null,
    },
  },
  {
    destination: STAFF_ONLY_DESTINATION,
    review: {
      ref: "DEMO-WLT-004",
      clientRef: DEMO_SECOND_CLIENT_REF,
      screening: "review_required",
      proofOfControl: "verified",
      beneficiaryVerification: null,
      stuckScreeningMinutes: null,
    },
  },
];

/**
 * Queue order: records awaiting staff action first, then the rest, each group in fixture order
 * (`Array.prototype.sort` is stable). A review queue leads with what needs a decision — and the
 * workspace selects the first row by default, so the panel opens on a record that matters. Client
 * Portal fixture order is irrelevant to staff.
 */
export const DEMO_REVIEW_RECORDS: DestinationReviewRecord[] = [...RAW_REVIEW_RECORDS].sort(
  (a, b) => Number(isAwaitingStaffAction(b)) - Number(isAwaitingStaffAction(a)),
);

export function recordId(record: DestinationReviewRecord): string {
  return record.destination.destination_id;
}

/** Display reference, e.g. `Payout Destination DEMO-PAY-001`. "Payout" is the fiat category's
 * own word in `UI Phase 2E`'s `destinationTypeLabel` ("Bank Payout"). */
export function destinationReference(record: DestinationReviewRecord): string {
  const kind = record.destination.destination_type === "wallet" ? "Wallet Destination" : "Payout Destination";
  return `${kind} ${record.review.ref}`;
}

/** Reference text for a demo destination by id — lets other Ops fixtures point at one without
 * hard-coding its display string. Falls back to the id so a broken link is visible, not silent. */
export function demoDestinationReference(id: string): string {
  const record = DEMO_REVIEW_RECORDS.find((r) => recordId(r) === id);
  return record ? destinationReference(record) : id;
}

// ---------------------------------------------------------------------------
// What awaits staff — derived from the transition logic, not "every non-active state".
// ---------------------------------------------------------------------------

/**
 * `pending_review` — a human decision is required (request approval, or revoke).
 * `pending_screening` — ONLY when the screening is stuck (the platform runs screening itself; the
 * sole staff action is stuck-screening recovery, which the route refuses before its age threshold).
 * NOT awaiting staff: `draft` (the platform initiates screening), a healthy `pending_screening`,
 * `approved_pending_cooling` (no manual step — promotion to `active` is lazy, on first eligible
 * use, once cooling-off has elapsed), `active`, and `revoked` (absorbing). Revocation remains
 * available from every non-revoked state as containment, but availability is not a queue.
 */
export function isAwaitingStaffAction(record: DestinationReviewRecord): boolean {
  const status = record.destination.status;
  if (status === "pending_review") return true;
  return status === "pending_screening" && record.review.stuckScreeningMinutes !== null;
}

// ---------------------------------------------------------------------------
// Staff actions — a display of the transitions the backend defines. NOT operational.
// ---------------------------------------------------------------------------

export type ReviewActionKey = "recover_screening" | "request_approval" | "revoke";

export const REVIEW_ACTION_LABELS: Record<ReviewActionKey, string> = {
  recover_screening: "Recover stuck screening",
  request_approval: "Request approval",
  revoke: "Revoke destination",
};

/**
 * The state-transition matrix's staff column (`UI-04` §46.6). There is deliberately no "Reject":
 * WLT-01 has no reject transition — declining a request before activation is a revocation, which
 * acts on ANY non-revoked state.
 */
export function availableActions(record: DestinationReviewRecord): ReviewActionKey[] {
  const status: DestinationStatus = record.destination.status;
  switch (status) {
    case "revoked":
      return [];
    case "pending_review":
      // `approve/request` re-evaluates every gate and refuses (`WLT1_DESTINATION_APPROVAL_INVALID_STATE`)
      // when any is unmet, so the action is offered only when they are all met.
      return approvalReadiness(record).allMet ? ["request_approval", "revoke"] : ["revoke"];
    case "pending_screening":
      return record.review.stuckScreeningMinutes !== null ? ["recover_screening", "revoke"] : ["revoke"];
    default:
      return ["revoke"];
  }
}

// ---------------------------------------------------------------------------
// Approval readiness — the real gates (`lib/destination-approval.ts`), coarse outcome only.
// ---------------------------------------------------------------------------

export type GateState = "met" | "not_met" | "not_applicable";

export interface ReadinessGate {
  label: string;
  state: GateState;
}

/**
 * Wallet: screening `clear` (and unexpired — not visible to staff) + proof of control verified when
 * the wallet type needs one (`unhosted`/`unknown`). Fiat: screening `clear` + beneficiary
 * verification `verified` (+ rail coverage, not modelled) — no proof of control for fiat. Only
 * meaningful while `pending_review` — the sole status approval accepts.
 */
export function approvalReadiness(record: DestinationReviewRecord): { gates: ReadinessGate[]; allMet: boolean } {
  const { destination, review } = record;
  const gates: ReadinessGate[] = [
    { label: "Screening outcome clear", state: review.screening === "clear" ? "met" : "not_met" },
  ];
  if (destination.destination_type === "wallet") {
    gates.push({
      label: "Proof of control",
      state: review.proofOfControl === "not_applicable" ? "not_applicable" : review.proofOfControl === "verified" ? "met" : "not_met",
    });
  } else {
    gates.push({
      label: "Beneficiary verification",
      state: review.beneficiaryVerification === "verified" ? "met" : "not_met",
    });
  }
  return { gates, allMet: gates.every((g) => g.state !== "not_met") };
}

export const GATE_STATE_LABELS: Record<GateState, string> = {
  met: "Met",
  not_met: "Not met",
  not_applicable: "Not applicable",
};

/** One sentence per status, in staff terms. The status LABELS are `UI Phase 2E`'s (single source);
 * this is the explanatory text a reviewer needs and a client does not. */
export const CONTROL_STATE_NOTES: Record<DestinationStatus, string> = {
  draft: "Registered. The platform initiates screening; no staff step is pending.",
  pending_screening: "Screening is run automatically by the platform. Staff act only if it stalls.",
  pending_review: "Screening has produced a result. A review decision is required.",
  approved_pending_cooling:
    "Approved through maker-checker. Cooling-off applies; the destination becomes active on its first eligible use once cooling-off has elapsed.",
  active: "Whitelisted and usable, subject to per-use evaluation.",
  revoked: "Revoked. Revocation is terminal and cannot be reversed.",
};
