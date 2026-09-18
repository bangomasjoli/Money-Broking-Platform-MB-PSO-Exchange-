import {
  CHECKLIST_ACTION_NEEDED,
  CHECKLIST_STATUS_LABELS,
  DEMO_CHECKLIST_ITEMS,
  DOCUMENT_TYPE_LABELS,
  outstandingChecklistItems,
} from "@/components/compliance/compliance-data";

/**
 * Outstanding Information — UI Phase 2H, primary column, `ACTION PANEL`-adjacent (`UI-04`
 * §35.17's subtle `bg-muted/40` per-row treatment — the same pattern `UI Phase 2F`'s Attention
 * Items section already established, reused here for the identical "needs action" semantic, not
 * a new pattern).
 *
 * Rows derive from the real `CHECKLIST_ITEM_STATUSES` model (`missing`/`received`/`verified`/
 * `rejected`/`expired`) — no invented deadline, analyst name, case ID, or severity score anywhere
 * (this turn's explicit prohibition). Each row shows: document title (the real governed document
 * type), a short explanation (the mapped client-facing state), and whether client action is
 * needed — derived from `CHECKLIST_ACTION_NEEDED`, not a fabricated urgency flag.
 *
 * **No upload action anywhere** — no client-facing document-submission route exists in `KYC-01`
 * (confirmed this turn: every registered route is internal-only). One explanatory note at the
 * section's own end states this once, not per row (this turn's own "prefer restraint" guidance) —
 * no `<input type="file">`, no drag-and-drop, no upload button, no document preview.
 *
 * Empty state ("No additional information is currently required.") is implemented and reachable
 * — a neutral/positive state, never "Fully compliant" or similar unsupported claim.
 */
export function OutstandingInformation() {
  const items = outstandingChecklistItems(DEMO_CHECKLIST_ITEMS);

  return (
    <section aria-labelledby="outstanding-information-heading">
      <h2
        id="outstanding-information-heading"
        className="text-lg font-semibold tracking-tight text-foreground"
      >
        Outstanding Information
      </h2>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No additional information is currently required.
        </p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-md bg-muted/40 px-3 py-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {DOCUMENT_TYPE_LABELS[item.documentType]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {CHECKLIST_STATUS_LABELS[item.status]}
                    {CHECKLIST_ACTION_NEEDED[item.status] ? " — action needed" : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Document upload will be available when the client document-submission service is
            integrated.
          </p>
        </>
      )}
    </section>
  );
}
