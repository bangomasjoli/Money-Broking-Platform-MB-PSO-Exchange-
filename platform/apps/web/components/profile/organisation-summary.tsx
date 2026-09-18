import type { ReactNode } from "react";
import {
  APPLICANT_TYPE_LABELS,
  CLIENT_CLASS_LABELS,
  CLIENT_LIFECYCLE_LABELS,
  DEMO_CLIENT_STATE,
  countryOfIncorporationLabel,
} from "@/components/client/client-demo-data";

/**
 * Organisation Details + Client Classification & Lifecycle — UI Phase 2G, two `WORKSPACE PANEL`
 * sections (`UI-04` §35.17), borderless. Both source the SAME shared `DEMO_CLIENT_STATE`
 * (`components/client/client-demo-data.ts`) `UI Phase 2F`'s Overview page also reads — cross-page
 * consistency by construction, not by convention.
 *
 * A 2-column `dl` field grid (`lg:grid-cols-2`, `UI-02` semantic `dt`/`dd`) — this turn's own
 * "2-column definition layout on desktop... single column on mobile" instruction, engaged from
 * `lg:` (1024px) up, since every field label here is short enough to stay readable at that width
 * (verified: "Legal name," "Registration number," "Country of incorporation," "Entity type,"
 * "Client classification," "Client lifecycle" — none wraps awkwardly at typical `lg:` column
 * widths). Distinct from `UI Phase 2F`'s label-left/value-right `Row` pattern (better suited to
 * single-line status summaries) — this page's field VALUES (a full legal name, in particular) can
 * run longer, so label-above/value-below reads more reliably.
 */
export function OrganisationDetails() {
  const { legalName, registrationNumber, countryOfIncorporation, applicantType } = DEMO_CLIENT_STATE;

  return (
    <section aria-labelledby="organisation-details-heading">
      <h2 id="organisation-details-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Organisation Details
      </h2>

      <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
        <Field label="Legal name">{legalName}</Field>
        <Field label="Registration number">{registrationNumber || "Not provided"}</Field>
        <Field label="Country of incorporation">{countryOfIncorporationLabel(countryOfIncorporation)}</Field>
        <Field label="Entity type">{APPLICANT_TYPE_LABELS[applicantType]}</Field>
      </dl>
    </section>
  );
}

export function ClientClassification() {
  const { clientClass, clientLifecycle } = DEMO_CLIENT_STATE;

  return (
    <section aria-labelledby="client-classification-heading">
      <h2 id="client-classification-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Client Classification &amp; Lifecycle
      </h2>

      <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
        <Field label="Client classification">{CLIENT_CLASS_LABELS[clientClass]}</Field>
        <Field label="Client lifecycle">{CLIENT_LIFECYCLE_LABELS[clientLifecycle]}</Field>
      </dl>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}
