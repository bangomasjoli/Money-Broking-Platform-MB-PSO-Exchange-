import Link from "next/link";
import { REVIEW_AREAS } from "@/components/admin/admin-compliance-data";

/**
 * Review Areas — UI Phase 2N, secondary column. The Admin equivalent of `UI Phase 2F`'s capability
 * status list: the seven planned `B`-classified Admin areas (`UI-04` §9), each under its exact
 * governed label (identical to `ADMIN_NAV`) with its owning module. An area whose page does not exist is
 * "Interface planned"; `UI Phase 2O` made the first one real, so Client Risk / KYC-KYB is now
 * "Interface preview" and the only row that is a link.
 *
 * **Planned areas are plain text, not links.** Their routes do not exist, so nothing there is a link or a
 * control and nothing is focusable — an inert row is never a keyboard trap. A built area links to its
 * own Admin page (same surface; the already-real Ops pages are still deliberately not linked from an
 * Admin page). This is not a shortcut hub, and it is not a permission statement: visible navigation is not a permission grant, and hidden navigation is not a security
 * control (`UI-04` §10) — the note says so. `C`-classified areas (Reporting, Incidents / Exceptions)
 * are absent.
 */
export function ReviewAreas() {
  return (
    <section aria-labelledby="review-areas-heading" className="mt-8">
      <h2 id="review-areas-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Review Areas
      </h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Detailed compliance areas for this portal; areas marked planned are not yet built. Listing an area is not a
        permission grant.
      </p>

      {REVIEW_AREAS.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No areas are represented in this demo view.</p>
      ) : (
        <ul className="mt-4 flex flex-col">
          {REVIEW_AREAS.map((area) => (
            <li key={area.label} className="border-t border-border py-3 first:border-t-0 first:pt-0">
              {area.href ? (
                <Link
                  href={area.href}
                  className="block rounded-sm text-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {area.label}
                </Link>
              ) : (
                <span className="block text-sm text-foreground">{area.label}</span>
              )}
              <span className="block text-xs text-muted-foreground">
                {area.owner} · {area.href ? "Interface preview" : "Interface planned"}
                {area.note ? ` · ${area.note}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
