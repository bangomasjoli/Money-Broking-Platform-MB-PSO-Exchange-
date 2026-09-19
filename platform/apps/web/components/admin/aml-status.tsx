import { Circle, CircleAlert, CircleX, Clock } from "lucide-react";
import { isStalled, screeningStateLabel, type DemoAmlSubject } from "@/components/admin/aml-monitoring-data";

/**
 * Screening state indicator — UI Phase 2P. Icon + the exact governed words, never colour alone
 * (`UI-04` §21); plain text + icon rather than a `Badge`, for the same "excessive pills" reason as the
 * other status lines (`UI-01` §4).
 *
 * The icon deliberately says nothing about the OUTCOME. `completed` means only that the screening
 * finished; a completed screening can have found a potential match, so a check mark would be a false
 * signal (the same trap `completed` set in `UI Phase 2O`). `completed` is therefore a neutral circle,
 * `requested` a clock (waiting), a stalled `requested` an alert (the exception the stuck read lists), and
 * `failed` a cross. The outcome is read in its own column, in words.
 */

type StateKey = "requested" | "stalled" | "completed" | "failed";

const STATE_ICON: Record<StateKey, typeof Circle> = {
  requested: Clock,
  stalled: CircleAlert,
  completed: Circle,
  failed: CircleX,
};

function stateKeyFor(subject: DemoAmlSubject): StateKey {
  if (isStalled(subject)) return "stalled";
  return subject.screeningStatus;
}

export function ScreeningStateLine({ subject, size = "xs" }: { subject: DemoAmlSubject; size?: "xs" | "sm" }) {
  const Icon = STATE_ICON[stateKeyFor(subject)];
  return (
    <span
      className={
        size === "xs"
          ? "inline-flex items-center gap-1.5 text-xs text-foreground"
          : "inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
      }
    >
      <Icon className={size === "xs" ? "size-3.5 shrink-0" : "size-4 shrink-0"} aria-hidden="true" />
      {screeningStateLabel(subject)}
    </span>
  );
}
