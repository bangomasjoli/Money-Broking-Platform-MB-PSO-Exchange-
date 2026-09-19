import { Ban, CircleCheck, CircleX } from "lucide-react";
import { AUDIT_RESULT_LABELS, type AuditResult } from "@/components/ops/audit-activity-data";

/**
 * Audit-event result indicator — UI Phase 2M. Icon + the exact SEC-01 `result` value, never colour
 * alone (`UI-04` §21). `result` is `success | failure | blocked` and NOT NULL on every stored row, so
 * there is always one to show; nothing is inferred beyond it. `blocked` (a control stopped the action)
 * gets its own icon so it cannot be read as `failure`.
 */

const RESULT_ICON: Record<AuditResult, typeof Ban> = {
  success: CircleCheck,
  failure: CircleX,
  blocked: Ban,
};

export function AuditResultLine({ result, size = "xs" }: { result: AuditResult; size?: "xs" | "sm" }) {
  const Icon = RESULT_ICON[result];
  return (
    <span
      className={
        size === "xs"
          ? "inline-flex items-center gap-1.5 text-xs text-foreground"
          : "inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
      }
    >
      <Icon className={size === "xs" ? "size-3.5 shrink-0" : "size-4 shrink-0"} aria-hidden="true" />
      {AUDIT_RESULT_LABELS[result]}
    </span>
  );
}
