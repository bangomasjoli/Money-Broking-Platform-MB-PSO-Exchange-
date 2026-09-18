"use client";

import { useState, useSyncExternalStore } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DestinationDetail } from "@/components/wallet-destinations/destination-detail";
import { DestinationTable } from "@/components/wallet-destinations/destination-table";
import { DEMO_DESTINATIONS, primaryIdentifier } from "@/components/wallet-destinations/destination-data";

/**
 * Wallet & Payout Destinations — workspace composition root. UI Phase 2E. Holds the one piece of
 * client state this page needs (`selectedId` — "Because this is UI-first: local React state is
 * allowed... Do NOT call backend APIs," this turn's own instruction) and implements the
 * responsive List + Detail transformation (`UI-04` §35.16's adjudication, §24's responsive model):
 *
 * - `≥1024px` (`lg:`): persistent split — `DestinationTable` (flexible width) beside a fixed
 *   ~360px `DETAIL PANEL` (`UI-04` §35.17 — a single leading `border-l`, no full box), showing
 *   whichever destination is `selectedId`. Verified safe by arithmetic before choosing this
 *   breakpoint (not rendered/screenshot-confirmed — visual QA is explicitly deferred this turn):
 *   at 1024px with no persistent sidebar (the shell's own sidebar only shows from `xl:`/1280px)
 *   and `sm:px-6` content padding, ~976px is available — table (~590px) + panel (360px) + 24px
 *   gap fits with room to spare; at 1280px+ (sidebar now showing, `xl:px-8` padding), the
 *   available width is comparable (~976–1136px), so the same split remains safe.
 * - `<1024px`: `DestinationTable` alone, full width — selecting a row opens a `Sheet` (the same
 *   primitive already used for the shell's own mobile nav) containing the identical
 *   `DestinationDetail` content, per "do not duplicate detail markup." A real `matchMedia` check
 *   (`useIsLgUp`, below) — not a CSS-only trick — gates whether row selection opens the Sheet, so
 *   selecting a row at `≥1024px` updates only the always-visible persistent panel and never pops
 *   a redundant overlay on top of it.
 */

const LG_QUERY = "(min-width: 1024px)";

function subscribeToLgQuery(callback: () => void) {
  const mql = window.matchMedia(LG_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getLgSnapshot(): boolean {
  return window.matchMedia(LG_QUERY).matches;
}

function getLgServerSnapshot(): boolean {
  return false;
}

/**
 * `useSyncExternalStore`, not `useState`+`useEffect` — the React-recommended pattern for reading
 * external browser state (a media query) without an effect-body `setState` call, which the
 * project's `react-hooks/set-state-in-effect` lint rule correctly flags as a cascading-render
 * risk. Server snapshot is `false` (matches this component's `"use client"` SSR pass, where
 * `window` does not exist) — corrected to the real value on the client without an extra render
 * caused by an effect.
 */
function useIsLgUp(): boolean {
  return useSyncExternalStore(subscribeToLgQuery, getLgSnapshot, getLgServerSnapshot);
}

export function WalletDestinationsWorkspace() {
  const isLgUp = useIsLgUp();
  const [selectedId, setSelectedId] = useState<string>(DEMO_DESTINATIONS[0]!.destination_id);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const selected = DEMO_DESTINATIONS.find((d) => d.destination_id === selectedId);

  function handleSelect(destinationId: string) {
    setSelectedId(destinationId);
    if (!isLgUp) setMobileDetailOpen(true);
  }

  if (DEMO_DESTINATIONS.length === 0) {
    return <EmptyDestinationsState />;
  }

  return (
    <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
      {/* WORKSPACE PANEL (`UI-04` §35.17) — the primary region stays borderless/card-free; the
          Table primitive's own hairline row dividers are the only internal structure, and the
          DETAIL PANEL's single leading border (below) is the sole boundary between the two
          regions, not a box around the table itself. */}
      <div className="min-w-0">
        <DestinationTable
          destinations={DEMO_DESTINATIONS}
          selectedId={isLgUp ? selectedId : undefined}
          onSelect={handleSelect}
        />
      </div>

      <aside className="hidden lg:block lg:border-l lg:border-border lg:pl-6">
        {selected && <DestinationDetail destination={selected} />}
      </aside>

      <Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected ? primaryIdentifier(selected) : "Destination"}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">{selected && <DestinationDetail destination={selected} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/**
 * Real empty state — UI Phase 2E. Not rendered today (`DEMO_DESTINATIONS` always has fixtures
 * this turn), but implemented as first-class per this turn's explicit instruction, so the
 * component architecture does not silently assume data always exists.
 */
function EmptyDestinationsState() {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border px-6 py-10">
      <p className="text-sm font-medium text-foreground">No payout destinations yet.</p>
      <p className="max-w-prose text-sm text-muted-foreground">
        Add a governed destination to begin the approval process.
      </p>
    </div>
  );
}
