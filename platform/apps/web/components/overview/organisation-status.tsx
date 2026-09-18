import type { ReactNode } from "react";
import {
  CLIENT_LIFECYCLE_LABELS,
  DEMO_ORGANISATION_STATUS,
  KYC_CASE_LABELS,
} from "@/components/overview/overview-data";

/**
 * Organisation Status — UI Phase 2F, `WORKSPACE PANEL` (`UI-04` §35.17), borderless. Structured
 * key/value information only — no circular progress chart, no "completion percentage," no
 * invented risk/AML/compliance score (this turn's own explicit prohibitions). **Entire section is
 * `PARTIAL/B` — demo-only** (`UI-04` §41's capability map): `CLT-01` and `KYC-01` genuinely own
 * this state internally, but no public client-facing projection route exists for either, so this
 * section demonstrates the intended structure using real governed terminology rather than a live
 * read.
 */
export function OrganisationStatus() {
  const { clientLifecycle, kycCaseStatus, eligible } = DEMO_ORGANISATION_STATUS;

  return (
    <section aria-labelledby="organisation-status-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="organisation-status-heading" className="text-lg font-semibold tracking-tight text-foreground">
          Organisation Status
        </h2>
        <span className="text-xs text-muted-foreground">Demo — no live projection yet</span>
      </div>

      <dl className="mt-4 flex flex-col gap-3">
        <Row label="Client lifecycle">{CLIENT_LIFECYCLE_LABELS[clientLifecycle]}</Row>
        <Row label="KYC / KYB">{KYC_CASE_LABELS[kycCaseStatus]}</Row>
        <Row label="Eligibility">{eligible ? "Eligible" : "Not Eligible"}</Row>
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
