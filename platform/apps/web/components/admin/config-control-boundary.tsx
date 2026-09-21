import { AUTHORITY_STATEMENTS, CHANGE_CONTROL, CONFIG_FINDINGS } from "@/components/admin/feature-config-data";

/**
 * Configuration Control Boundary — UI Phase 2T (`UI-04` §55.8). What configuration is and is not, how it can change,
 * and what the governed IAM-02 findings mean for that — stated as fact, in plain text, with no control.
 *
 * **Configuration is not authorization.** The first group is the brief's boundary in four sentences: a flag decides
 * availability, not who may use it (an enabled feature is not an authorized user, and visible navigation is not a
 * permission grant — consistent with `UI Phase 2S`); locks outrank flags, in the order `evaluateFeature` actually applies
 * them (integrity first, then the prohibited registry, then a kill switch, then the feature's own state, with unknown
 * denied); hiding a feature in a page is not a control; and enabling something is not production readiness.
 *
 * **Change control is read-only facts**, re-verified from `routes/feature-changes.ts`, `routes/licence-changes.ts` and
 * `routes/kill-switches.ts`: feature and licence-status changes are a request then an apply bound to an approved IAM-02
 * decision token; a kill switch activates in one permission-gated step and deactivates through a request and an
 * approval. **The page does not say that only authorized approvers approve a change**, because IAM-02 checks no role or
 * permission for the approver (`IAM2-FIND-002`), and **does not say approval is dual or stepped-up**, because no approval
 * policy is seeded (`IAM2-FIND-003`) — a step-up flag on a permission is a catalogue flag, not a policy. One derived
 * observation is stated (and recorded in `UI-04` as an observation, not a finding): with no role grants seeded, none of the
 * four starting steps — feature request, licence-profile request, kill-switch activation, kill-switch deactivation request
 * — can pass its own permission check, so no configuration change can currently be started. No history is shown; the
 * change and version records exist but no route reads them, and audit belongs to Audit / Sensitive Access.
 *
 * Findings are pointers, not a dashboard: identifier, title, severity and status as text (never colour alone) and one
 * line of relevance. A Server Component with no interactive element and no link.
 */

export function ConfigControlBoundary() {
  return (
    <section aria-labelledby="ffc-boundary-heading" className="border-t border-border pt-8">
      <h2 id="ffc-boundary-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Configuration Control Boundary
      </h2>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        This UI does not enable, disable or change any feature or setting. Backend enforcement remains authoritative, and
        configuration is not authorization.
      </p>

      <h3 className="mt-6 text-sm font-semibold text-foreground">What configuration is and is not</h3>
      <dl className="mt-3 flex max-w-prose flex-col gap-3">
        {AUTHORITY_STATEMENTS.map((item) => (
          <div key={item.term} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <dt className="text-sm text-foreground">{item.term}</dt>
            <dd className="mt-0.5 text-xs text-muted-foreground">{item.meaning}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-6 text-sm font-semibold text-foreground">Change control</h3>
      <dl className="mt-3 flex max-w-prose flex-col gap-3">
        {CHANGE_CONTROL.map((item) => (
          <div key={item.term} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <dt className="text-sm text-foreground">{item.term}</dt>
            <dd className="mt-0.5 text-xs text-muted-foreground">{item.meaning}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-6 text-sm font-semibold text-foreground">Governed findings</h3>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        Context for configuration approvals, tracked in the open-findings register. This page records them and does not
        manage them.
      </p>
      <ul aria-label="Governed IAM-02 findings relevant to configuration" className="mt-3 flex max-w-prose flex-col gap-3">
        {CONFIG_FINDINGS.map((finding) => (
          <li key={finding.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <p className="text-sm text-foreground">
              {finding.id} — {finding.title}
            </p>
            <p className="mt-0.5 text-xs font-medium text-foreground">
              {finding.severity} · {finding.status}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{finding.relevance}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
