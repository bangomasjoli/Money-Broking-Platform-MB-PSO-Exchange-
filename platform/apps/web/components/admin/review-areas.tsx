import { REVIEW_AREAS } from "@/components/admin/admin-compliance-data";

/**
 * Review Areas — UI Phase 2N, secondary column. The Admin equivalent of `UI Phase 2F`'s capability
 * status list: the seven planned `B`-classified Admin areas (`UI-04` §9), each under its exact
 * governed label (identical to `ADMIN_NAV`) with its owning module, all "Interface planned".
 *
 * **Plain text, not links.** None of these routes exists, so nothing here is a link or a control and
 * nothing is focusable — an inert row is never a keyboard trap. This is not a shortcut hub either: the
 * already-real Ops pages are deliberately not linked from an Admin page. And it is not a permission
 * statement: visible navigation is not a permission grant, and hidden navigation is not a security
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
        Detailed compliance areas planned for this portal. Listing an area is not a permission grant.
      </p>

      {REVIEW_AREAS.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No areas are represented in this demo view.</p>
      ) : (
        <ul className="mt-4 flex flex-col">
          {REVIEW_AREAS.map((area) => (
            <li key={area.label} className="border-t border-border py-3 first:border-t-0 first:pt-0">
              <span className="block text-sm text-foreground">{area.label}</span>
              <span className="block text-xs text-muted-foreground">{area.owner} · Interface planned</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
