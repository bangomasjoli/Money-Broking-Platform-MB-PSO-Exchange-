import { LayoutGrid } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * AIX public-site "Product Experience / Platform Preview" homepage section (UI Phase 1G) — one
 * section only, below `PublicCapabilities`. This is a PUBLIC DEMO of the authenticated client
 * portal's wallet-destination workflow, not the actual authenticated portal itself. No API
 * client, no auth integration, no live data of any kind — everything below is a static,
 * explicitly-labeled illustrative preview. `PublicHeader`/`PublicHero`/`PublicOperatingModel`/
 * `PublicTrustControl`/`PublicCapabilities` (Phases 1B-1F) are consumed unchanged.
 *
 * WORKFLOW CHOSEN: Wallet Destination / Approval Status, per this turn's explicit preference —
 * "already strongly grounded in AIX implementation and governance," confirmed against
 * `docs/01_masters/04_Role_And_Permission_Matrix_v1.2.md` ("Payout destination: Create, verify,
 * approve, reject, delete/deactivate"; `deposit_address_assignment = maker_checker`; SOD-003
 * "User creates payout destination and approves same destination: Block") and
 * `docs/01_masters/05_Master_Workflow_Map_v1.2.md` ("Destination becomes active after
 * cooling-off"; `payout_destination_cooling_off_hard_gate = true`). The 3 demo statuses map to
 * real governed states, not invented ones: "Active" (post-cooling-off, matching the masters'
 * own "Destination becomes active after cooling-off"), "Pending Approval" (the maker-checker
 * approval step itself), and "Evidence Required" (matching the masters' own "Wallet address
 * ownership evidence" requirement — deliberately worded "Evidence," not the brief's suggested
 * "Proof," to match that exact governed phrase).
 *
 * NO FAKE METRICS: no portfolio value, PnL, price, volume, yield, APY, or TVL appears anywhere.
 * The detail panel deliberately does NOT include a "Last Review" field (suggested in the brief)
 * — no governed AIX document was found grounding a specific "last review" timestamp for a payout
 * destination precisely enough to include with confidence, so it was dropped rather than
 * invented. The one address-like value shown is a clearly masked placeholder
 * (`bc1q••••••••92F1`), never a real-format address implying a real wallet.
 *
 * DISCLOSURE: a quiet sentence near the section intro ("Illustrative product preview — demo data
 * only, not connected to live production services") plus a small "Demo" badge inside the preview
 * shell's own top bar — redundant by design, since this is the most product-like public section
 * so far and the point of contact (the shell itself) should carry its own reminder, not only the
 * marketing copy above it.
 *
 * SHADCN: `table` and `badge` added this turn (pinned CLI 4.21.0) — both are pure Tailwind/
 * semantic-HTML components with zero new npm dependencies (verified: `package-lock.json`
 * unchanged after adding them), genuinely needed for a real tabular destination list and a
 * restrained status indicator, not added for decoration. `Badge`'s `outline` variant is used
 * uniformly for all three statuses — no per-status color — per this turn's explicit "do not
 * invent arbitrary color semantics" instruction; status is differentiated by label text only.
 * `Badge`'s own default radius (`rounded-4xl`, ~26px) does not match UI-02 §5's governed 4px
 * "Micro" chip tier — an out-of-scope, precisely-flagged deviation (the same category as the
 * already-recorded `Button` radius deviation from Phase 1B), not silently shipped or unilaterally
 * redesigned this turn. `Tabs`/`DropdownMenu`/`Tooltip`/`ScrollArea`/`Separator` were all
 * considered and judged unnecessary — the preview is fully static, per this turn's explicit
 * interaction guidance.
 *
 * SHELL STRUCTURE: top bar (full width) above a two-part body — a compact, non-interactive
 * context rail (plain text, not real `<nav>`/`<button>` elements, since none of it is
 * functional — avoiding any misleading clickable affordance) and the main content (the
 * destination table plus one selected destination's detail panel). Desktop (`lg:`, 1024px+):
 * context rail visible, table and detail panel side by side. Below `lg:`: context rail hidden
 * (de-emphasizing secondary navigation, per this turn's suggested mobile strategy) and the
 * detail panel stacks below the table rather than beside it.
 */

const CONTAINER_CLASS = "mx-auto max-w-[1280px] px-4 md:px-8 lg:px-12";

const CONTEXT_RAIL_ITEMS = [
  { label: "Overview", active: false },
  { label: "Wallet Destinations", active: true },
  { label: "Transactions", active: false },
  { label: "Approvals", active: false },
] as const;

type DestinationStatus = "Active" | "Pending Approval" | "Evidence Required";

type Destination = {
  name: string;
  network: string;
  status: DestinationStatus;
};

const DESTINATIONS: Destination[] = [
  { name: "USDT Treasury Wallet", network: "TRC-20", status: "Active" },
  { name: "BTC Settlement Wallet", network: "Bitcoin", status: "Pending Approval" },
  { name: "Institutional Payout Destination", network: "Bank Transfer", status: "Evidence Required" },
];

// The demo-selected destination for the detail panel — deliberately the "Pending Approval" row,
// since it best illustrates the approval/control-visibility purpose of this preview (an already-
// "Active" or already-rejected destination would show less of the workflow in progress).
const SELECTED_DESTINATION_DETAIL = {
  name: "BTC Settlement Wallet",
  network: "Bitcoin",
  maskedAddress: "bc1q••••••••92F1",
  controlStatus: "Cooling-Off Complete",
  approvalStatus: "Pending Checker Review",
};

function ContextRail() {
  return (
    <div className="hidden w-[200px] shrink-0 border-r border-border p-4 lg:block">
      <ul className="space-y-1">
        {CONTEXT_RAIL_ITEMS.map((item) => (
          <li key={item.label}>
            <span
              className={`flex h-8 items-center rounded-[8px] px-3 text-sm ${
                item.active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DestinationTable() {
  return (
    <div className="min-w-0 flex-1">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Destination</TableHead>
            <TableHead>Network</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {DESTINATIONS.map((destination) => (
            <TableRow key={destination.name}>
              <TableCell className="font-medium text-foreground">{destination.name}</TableCell>
              <TableCell className="text-muted-foreground">{destination.network}</TableCell>
              <TableCell>
                <Badge variant="outline">{destination.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DestinationDetailPanel() {
  const detail = SELECTED_DESTINATION_DETAIL;
  return (
    <div className="w-full shrink-0 rounded-[8px] border border-border bg-[var(--marketing-surface)] p-4 lg:w-[280px]">
      <h3 className="text-sm font-semibold text-foreground">{detail.name}</h3>
      <dl className="mt-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-xs text-muted-foreground">Network</dt>
          <dd className="text-xs text-foreground">{detail.network}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-xs text-muted-foreground">Address</dt>
          <dd className="font-mono text-xs text-foreground">{detail.maskedAddress}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-xs text-muted-foreground">Control Status</dt>
          <dd className="text-xs text-foreground">{detail.controlStatus}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-xs text-muted-foreground">Approval Status</dt>
          <dd className="text-xs text-foreground">{detail.approvalStatus}</dd>
        </div>
      </dl>
    </div>
  );
}

function PreviewShell() {
  return (
    <div className="mx-auto max-w-[1120px] overflow-hidden rounded-[12px] border border-border bg-[var(--marketing-surface)] shadow-sm">
      {/* Top bar — 48px (Large control-height tier). */}
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="size-5 text-foreground" aria-hidden />
          <span className="text-sm font-semibold text-foreground">Wallet Destinations</span>
        </div>
        <Badge variant="outline">Demo</Badge>
      </div>

      <div className="flex flex-col lg:flex-row">
        <ContextRail />

        <div className="min-w-0 flex-1 p-6">
          <div className="flex flex-col gap-6 lg:flex-row">
            <DestinationTable />
            <DestinationDetailPanel />
          </div>
        </div>
      </div>
    </div>
  );
}

export function PublicProductPreview() {
  return (
    <section
      // id added in UI Phase 1I for PublicFooter's same-page anchor — no visual change.
      id="product"
      aria-labelledby="product-preview-heading"
      className="pt-16 pb-20 md:pt-20 md:pb-24 lg:pt-24 lg:pb-28"
    >
      <div className={CONTAINER_CLASS}>
        <div className="mx-auto max-w-[720px] text-center">
          <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
            Product Experience
          </p>
          <h2
            id="product-preview-heading"
            className="mt-4 text-[32px] leading-[1.15] font-semibold tracking-tight text-foreground md:text-[36px] lg:text-[40px]"
          >
            Operational clarity, from overview to action.
          </h2>
          <p className="mt-4 text-base leading-[1.5] text-muted-foreground">
            AIX brings client context, workflow state, and control status into one controlled
            interface, designed for precise financial operations.
          </p>
          <p className="mt-3 text-xs leading-[1.5] text-muted-foreground">
            Illustrative product preview — demo data only, not connected to live production
            services.
          </p>
        </div>

        <div className="mt-12 md:mt-16 lg:mt-20">
          <PreviewShell />
        </div>
      </div>
    </section>
  );
}
