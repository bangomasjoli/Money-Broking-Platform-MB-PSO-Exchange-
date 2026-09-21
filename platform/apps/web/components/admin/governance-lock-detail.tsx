import type { ReactNode } from "react";
import { LOCK_DECISION_REASONS, type GovernanceLock } from "@/components/admin/feature-config-data";

/**
 * Governance-lock detail — UI Phase 2T, the secondary/evidence region of the List + Detail workspace. Pure content with
 * no boundary of its own: the caller supplies it (the `DETAIL PANEL`'s single leading `border-l` on desktop, the
 * `Sheet`'s overlay container below `lg:`), so one component renders identically in both places. `showHeading` is true
 * only for the desktop panel — the Sheet carries the name and key in its own title and description.
 *
 * **Sections are the brief's**: Feature Summary, State, Configuration Source, Scope / Licence Boundary, Change Control
 * and Control Notes. **State is the five separate words**, never collapsed: a registry entry is *defined* and *locked*,
 * has *no default* (it is not a toggle), is *not configured* (no route writes the registry), and is *effectively denied*
 * with the decision reason the engine returns for it — `exchange_pending_locked` for the five Exchange-pending locks and
 * `prohibited` for the rest, both read from `lib/decision.ts`.
 *
 * **Every claim is a real field or an invariant of the source, never a per-lock invention:** the statement and
 * reference are the registry's own `prohibition_reason`; "refused at the request step and again at apply" is
 * `isFeatureMutationBlocked`, called by both routes; "no route lifts this lock" is the absence of any write route or
 * grant on `cfg1.prohibited_feature`. What lifting would take is the migration's own reasoning: a lock that applies only
 * until Exchange approval would need that approval and an activation ceremony (not built), and a permanent one a new
 * licence-scope document revision. Neither is presented as a workflow the page offers.
 *
 * No control of any kind — no toggle, no button, no link — and no value beyond the registry text. A lock limits
 * availability; it grants and removes no user's authority.
 */
export function GovernanceLockDetail({ lock, showHeading = false }: { lock: GovernanceLock; showHeading?: boolean }) {
  const reason = LOCK_DECISION_REASONS[lock.lock];
  const lifting =
    lock.lock === "until_exchange_approval"
      ? "No route lifts this lock. It applies until formal Exchange licence approval, and the Exchange activation ceremony is not built."
      : "No route lifts this lock. It would need a new licence-scope document revision.";

  return (
    <div className="flex flex-col gap-6">
      {showHeading && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            <code>{lock.key}</code>
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{lock.label}</h2>
        </div>
      )}

      <section aria-label="Feature Summary">
        <h3 className="text-sm font-semibold text-foreground">Feature Summary</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Name">{lock.label}</Row>
          <Row label="Key">
            <code className="text-xs">{lock.key}</code>
          </Row>
          <Row label="Registry entry">Active</Row>
        </dl>
      </section>

      <section aria-label="State">
        <h3 className="text-sm font-semibold text-foreground">State</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Defined">Yes — an active registry entry</Row>
          <Row label="Default">Not applicable — a registry entry, not a toggle</Row>
          <Row label="Configured">No — no route writes the registry</Row>
          <Row label="Effective">
            Denied — {reason.label} (<code className="text-xs">{reason.code}</code>)
          </Row>
          <Row label="Locked">Governance Locked</Row>
        </dl>
      </section>

      <section aria-label="Configuration Source">
        <h3 className="text-sm font-semibold text-foreground">Configuration Source</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Source">Prohibited-feature registry</Row>
          <Row label="Storage">Database, sealed</Row>
          <Row label="Runtime access">Read-only</Row>
          <Row label="Baseline">Doc 00 v1.3, held in code</Row>
        </dl>
      </section>

      <section aria-label="Scope and Licence Boundary">
        <h3 className="text-sm font-semibold text-foreground">Scope / Licence Boundary</h3>
        <p className="mt-3 text-sm text-foreground">{lock.statement}.</p>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Reference">{lock.reference}</Row>
          <Row label="Duration">
            {lock.lock === "permanent" ? "Permanent" : "Until formal Exchange licence approval"}
          </Row>
        </dl>
      </section>

      <section aria-label="Change Control">
        <h3 className="text-sm font-semibold text-foreground">Change Control</h3>
        <p className="mt-3 text-xs text-muted-foreground">
          A feature change request for this key is refused at the request step and again at apply. {lifting}
        </p>
      </section>

      <section aria-label="Control Notes">
        <h3 className="text-sm font-semibold text-foreground">Control Notes</h3>
        <p className="mt-3 text-xs text-muted-foreground">
          A lock limits availability. It grants and removes no user&apos;s authority.
        </p>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm text-foreground">{children}</dd>
    </div>
  );
}
