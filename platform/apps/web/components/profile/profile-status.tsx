import type { ReactNode } from "react";
import { DEMO_CLIENT_STATE, KYC_CASE_LABELS } from "@/components/client/client-demo-data";
import { PROFILE_COMPLETENESS_ITEMS } from "@/components/profile/profile-data";

/**
 * Compliance Summary + Profile Completeness — UI Phase 2G, `WORKSPACE PANEL`. Plain,
 * non-interactive status only — this turn's own explicit instruction: the dedicated KYC/KYB
 * Compliance Status page is not implemented yet, so this section shows a concise summary and
 * **does not link anywhere** (no link to a nonexistent route) and does not duplicate
 * case-management detail (no analyst notes, no checklist, no evidence list — all of that is
 * internal-only `KYC-01` case detail, out of scope for a general profile page).
 *
 * Profile Completeness shows discrete section states only — **no fabricated percentage, no
 * progress ring** (this turn's explicit prohibition) — each state sourced from real data already
 * shown elsewhere on this page ("On file" reflects the sections above; "Compliance information"
 * reuses the exact same `KYC_CASE_LABELS` value the Compliance Summary section (and `UI Phase
 * 2F`'s Overview page) already show, not a second paraphrase like "Review required").
 */
export function ComplianceSummary() {
  return (
    <section aria-labelledby="compliance-summary-heading">
      <h2 id="compliance-summary-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Compliance Summary
      </h2>

      <dl className="mt-4">
        <Row label="KYC / KYB status">{KYC_CASE_LABELS[DEMO_CLIENT_STATE.kycCaseStatus]}</Row>
      </dl>
    </section>
  );
}

export function ProfileCompleteness() {
  return (
    <section aria-labelledby="profile-completeness-heading">
      <h2 id="profile-completeness-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Profile Completeness
      </h2>

      <dl className="mt-4 flex flex-col gap-3">
        {PROFILE_COMPLETENESS_ITEMS.map((item) => (
          <Row key={item.label} label={item.label}>
            {item.state}
          </Row>
        ))}
      </dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}
