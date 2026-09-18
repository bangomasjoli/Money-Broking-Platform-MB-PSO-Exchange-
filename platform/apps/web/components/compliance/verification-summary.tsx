import type { ReactNode } from "react";
import Link from "next/link";
import { DEMO_VERIFICATION_AREAS } from "@/components/compliance/compliance-data";

/**
 * Verification Areas + Next Steps — UI Phase 2H, secondary column, `DETAIL/EVIDENCE PANEL`
 * treatment (single leading `border-l`, `UI-04` §35.17 — the same pattern `UI Phase 2F`'s
 * Platform Access section and `UI Phase 2E`'s detail panel already use).
 *
 * Verification Areas is a broad, client-facing ROLLUP — three areas matching `KYC-01`'s own real
 * `KYC_CASE_TYPES` concept (organisation/entity, authorised representatives, beneficial
 * ownership), not five speculative categories. Source of Funds/Source of Wealth and Business
 * Activity are absent — no field, case type, or document type exists anywhere in the governed
 * `KYC-01` source for either (searched directly this turn). States are broad and safe
 * ("On file"/"Under Review"/"Pending Information") — never an internal verification method,
 * provider score, screening hit, analyst note, or risk rating.
 *
 * Next Steps uses only a real route (`/app/profile`, `UI Phase 2G`) plus a plain-text pointer to
 * the Outstanding Information section already visible on this same page — not a fake link to a
 * document-submission page that does not exist.
 */
export function VerificationAreas() {
  return (
    <section aria-labelledby="verification-areas-heading">
      <h2 id="verification-areas-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Verification Areas
      </h2>

      <dl className="mt-4 flex flex-col gap-3">
        {DEMO_VERIFICATION_AREAS.map((area) => (
          <Row key={area.label} label={area.label}>
            {area.state}
          </Row>
        ))}
      </dl>
    </section>
  );
}

export function NextSteps() {
  return (
    <section aria-labelledby="next-steps-heading" className="mt-8">
      <h2 id="next-steps-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Next Steps
      </h2>

      <ul className="mt-4 flex flex-col gap-2">
        <li>
          <Link
            href="/app/profile"
            className="text-sm font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Review your organisation profile
          </Link>
        </li>
        <li className="text-sm text-muted-foreground">
          Review the outstanding information listed above.
        </li>
      </ul>
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
