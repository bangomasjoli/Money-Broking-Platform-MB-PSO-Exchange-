import { Circle, CircleAlert, CircleCheck, CircleX, Clock } from "lucide-react";
import { kycStateLabel, type KycCaseOutcome } from "@/components/admin/client-risk-data";
import type { KycCaseStatus } from "@/components/client/client-demo-data";

/**
 * KYC/KYB state indicator — UI Phase 2O. Icon + the exact governed words, never colour alone
 * (`UI-04` §21); plain text + icon rather than a `Badge`, for the same "excessive pills" reason as the
 * Ops status lines (`UI-01` §4).
 *
 * The icon follows the case status **and the outcome together**, because `completed` covers both `pass`
 * and `fail`: a check mark on a failed case would be a false signal. `completed` with an outcome shows a
 * check for `pass` and a cross for `fail`; `pending_documents` is a clock (waiting, not failed);
 * `remediation` is an alert. A `completed` case with no outcome cannot occur in the governed model, so
 * it falls back to a neutral circle rather than implying either result.
 */

type StateKey = "pending_documents" | "remediation" | "pass" | "fail" | "neutral";

const STATE_ICON: Record<StateKey, typeof Circle> = {
  pending_documents: Clock,
  remediation: CircleAlert,
  pass: CircleCheck,
  fail: CircleX,
  neutral: Circle,
};

function stateKeyFor(caseStatus: KycCaseStatus, outcome: KycCaseOutcome | null): StateKey {
  if (caseStatus === "pending_documents") return "pending_documents";
  if (caseStatus === "remediation") return "remediation";
  if (outcome === "pass") return "pass";
  if (outcome === "fail") return "fail";
  return "neutral";
}

export function KycStateLine({
  caseStatus,
  outcome,
  size = "xs",
}: {
  caseStatus: KycCaseStatus;
  outcome: KycCaseOutcome | null;
  size?: "xs" | "sm";
}) {
  const Icon = STATE_ICON[stateKeyFor(caseStatus, outcome)];
  return (
    <span
      className={
        size === "xs"
          ? "inline-flex items-center gap-1.5 text-xs text-foreground"
          : "inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
      }
    >
      <Icon className={size === "xs" ? "size-3.5 shrink-0" : "size-4 shrink-0"} aria-hidden="true" />
      {kycStateLabel(caseStatus, outcome)}
    </span>
  );
}
