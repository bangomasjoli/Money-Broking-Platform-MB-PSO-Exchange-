import {
  ArrowLeftRight,
  BadgeCheck,
  ClipboardList,
  FileText,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * AIX public-site "How AIX Works" / operating-model section (UI Phase 1D) — one homepage
 * section only, below the accepted hero. No feature grid, pricing, testimonials, partners,
 * footer, FAQ, or portal/dashboard content belongs here. `PublicHeader` and `PublicHero`
 * (both VISUALLY ACCEPTED) are consumed unchanged, not redesigned.
 *
 * REGULATORY/BUSINESS TRUTH: this sequence describes AIX's approved agency / back-to-back
 * execution model — confirmed against `docs/01_masters/00_Licence_Scope_And_Feature_Lock_v1.3.md`
 * (`execution_model = agency_back_to_back`, `feature_derivatives`/`feature_margin_trading`/
 * `feature_staking`/`feature_yield_product` all `disabled`, "principal dealing, market making,
 * internal matching, ... public exchange trading are blocked") and
 * `docs/01_masters/04_Role_And_Permission_Matrix_v1.2.md` ("pre-funded hold", "LP settlement
 * payment", "Settlement sequence must not create AIX principal exposure", "reconciliation
 * break", "audit log"). No step here names a capability, workflow, or counterparty relationship
 * that is not already governed in those documents. "DvP" is deliberately NOT used as visible
 * copy — the masters use it only in an internal control-sequence context ("DvP/safeguarded
 * sequence checks"), not as a universally-applicable settlement-method claim; "controlled
 * settlement and reconciliation sequence" is used instead, per this turn's explicit instruction
 * not to overstate DvP.
 *
 * NOT A LIVE-STATUS CLAIM: this section is explicitly labeled "Operating model / platform
 * design" in its own copy (see below) — it describes AIX's approved execution design, not a
 * live transaction feed or a claim that every stage is in live production today (consistent
 * with `docs/00_project_state/PROJECT_HANDOVER.md`'s own current-state record).
 *
 * LAYOUT: `<ol>` (native ordinal semantics — a screen reader announces "item N of 6" regardless
 * of the visual numbering, so the connector/number styling below is presentational only, never
 * load-bearing for understanding order). Desktop (`xl:`, 1280px+ — revised, see UI Phase 1M
 * below): a single horizontal row of 6 steps with a thin connector line running through each step
 * marker — the brief's preferred "measured horizontal process/timeline". Tablet (768-1279px —
 * revised range): a 2-row x 3-column grid, no connector line (a line crossing a wrapped 2-row
 * grid reads as broken, not measured; the visible "01"-"06" numbers already carry the sequence).
 * Mobile (<768px, unchanged): a single vertical column with a thin vertical connector behind the
 * step markers.
 *
 * UI PHASE 1M REMEDIATION (UI-QA-004, closes the below-noted open flag): the 6-column row's
 * breakpoint moved from `lg:` (1024px) to `xl:` (1280px). At 1024px the row was tight — 928px
 * available content width / 6 columns minus `gap-6`'s 5×24px ≈ 134.67px per column, producing an
 * estimated ~5-line wrap on the longest step description. At `xl:` (1280px) and up, the container
 * (capped at its own `max-w-[1280px]`) yields a constant 1184px inner content width regardless of
 * how much wider the viewport grows beyond 1280px — (1184 − 120px gaps) / 6 ≈ **177.33px per
 * column**, a **+31.7%** increase, dropping the same longest description to an estimated ~4 lines.
 * Materially better, verified by arithmetic before implementing, not merely asserted — see
 * `UI-02` §28.11 for the full calculation across 1024/1280/1440. The 3×2 tablet grid's own range
 * widened correspondingly (now 768-1279px, was 768-1023px) rather than redesigned — same
 * `grid-cols-3`/`gap-x-8`/`gap-y-10` values, unchanged.
 *
 * ICONS: Lucide, decorative (`aria-hidden`) — each step's own text title/description already
 * carries the meaning. Neutral (foreground/border), not accent-colored, per this turn's "prefer
 * neutral hierarchy first, accent sparingly" instruction. Sized 20px inside a 40px circle — reuse
 * of UI-02 §4's existing Default (40px) control-height token as the circle diameter, and §14's
 * existing 20px "standalone action icon at Default control height" tier, rather than inventing a
 * new icon/marker size for this one section.
 */

type OperatingModelStep = {
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

const STEPS: OperatingModelStep[] = [
  {
    number: "01",
    title: "Instruction",
    description: "Client instruction enters the controlled workflow.",
    icon: ClipboardList,
  },
  {
    number: "02",
    title: "Control",
    description: "Eligibility, authority, and required approval checks are applied.",
    icon: ShieldCheck,
  },
  {
    number: "03",
    title: "Funding",
    description: "Required funds remain subject to governed pre-funded controls before execution.",
    icon: Wallet,
  },
  {
    number: "04",
    title: "Execution",
    description: "AIX acts on an agency / back-to-back basis with approved external counterparties.",
    icon: ArrowLeftRight,
  },
  {
    number: "05",
    title: "Settlement",
    description: "Completion follows a controlled settlement and reconciliation sequence.",
    icon: BadgeCheck,
  },
  {
    number: "06",
    title: "Evidence",
    description: "Activity is captured for audit, reconciliation, and reporting.",
    icon: FileText,
  },
];

const CONTAINER_CLASS = "mx-auto max-w-[1280px] px-4 md:px-8 lg:px-12";

function StepMarker({
  icon: Icon,
  showLeftConnector,
  showRightConnector,
}: {
  icon: LucideIcon;
  showLeftConnector: boolean;
  showRightConnector: boolean;
}) {
  return (
    <div className="flex w-full items-center">
      <div className={`h-px flex-1 bg-border ${showLeftConnector ? "" : "invisible"}`} />
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-[var(--marketing-surface)]">
        <Icon className="size-5 text-foreground" aria-hidden />
      </div>
      <div className={`h-px flex-1 bg-border ${showRightConnector ? "" : "invisible"}`} />
    </div>
  );
}

function DesktopProcessRow() {
  return (
    <ol className="hidden list-none xl:grid xl:grid-cols-6 xl:gap-6">
      {STEPS.map((step, index) => (
        <li key={step.number} className="flex flex-col items-center px-2 text-center">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground">
            {step.number}
          </span>
          <div className="mt-2 w-full">
            <StepMarker
              icon={step.icon}
              showLeftConnector={index > 0}
              showRightConnector={index < STEPS.length - 1}
            />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-foreground">{step.title}</h3>
          <p className="mt-1 text-xs leading-[1.5] text-muted-foreground">{step.description}</p>
        </li>
      ))}
    </ol>
  );
}

function TabletProcessGrid() {
  return (
    <ol className="hidden list-none grid-cols-3 gap-x-8 gap-y-10 md:grid xl:hidden">
      {STEPS.map((step) => {
        const Icon = step.icon;
        return (
          <li key={step.number} className="flex flex-col items-start text-left">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground">
              {step.number}
            </span>
            <div className="mt-2 flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-[var(--marketing-surface)]">
              <Icon className="size-5 text-foreground" aria-hidden />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">{step.title}</h3>
            <p className="mt-1 text-xs leading-[1.5] text-muted-foreground">{step.description}</p>
          </li>
        );
      })}
    </ol>
  );
}

function MobileProcessList() {
  return (
    <ol className="relative list-none space-y-8 md:hidden">
      {/* Thin vertical connector behind the step markers — purely decorative (the <ol>'s native
          ordinal semantics and the visible "01"-"06" labels already carry the sequence). */}
      <div
        aria-hidden
        className="absolute top-5 bottom-5 left-5 w-px -translate-x-1/2 bg-border"
      />
      {STEPS.map((step) => {
        const Icon = step.icon;
        return (
          <li key={step.number} className="relative flex items-start gap-4">
            <div className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-[var(--marketing-surface)]">
              <Icon className="size-5 text-foreground" aria-hidden />
            </div>
            <div className="pt-1.5">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground">
                {step.number}
              </span>
              <h3 className="mt-1 text-sm font-semibold text-foreground">{step.title}</h3>
              <p className="mt-1 text-xs leading-[1.5] text-muted-foreground">{step.description}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function PublicOperatingModel() {
  return (
    <section
      // id added in UI Phase 1I for PublicFooter's same-page anchor — no visual change.
      // scroll-mt-24/lg:scroll-mt-28 added in UI Phase 1L (UI-QA-001 fix): without this, native
      // anchor-scroll placed this section's top edge at viewport y=0, hidden behind the fixed
      // header (72px compact/88px desktop occupied envelope). scroll-mt-24=96px/lg:scroll-mt-28
      // =112px give the header's own envelope plus a deliberate 24px breathing margin —
      // computed once for PublicHeader's actual geometry, reused identically across all 5
      // anchored sections. See UI-02 §28.10 for the full arithmetic.
      id="how-it-works"
      aria-labelledby="operating-model-heading"
      className="scroll-mt-24 pt-16 pb-20 md:pt-20 md:pb-24 lg:scroll-mt-28 lg:pt-24 lg:pb-28"
    >
      <div className={CONTAINER_CLASS}>
        <div className="mx-auto max-w-[720px] text-center">
          <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
            How AIX Works
          </p>
          <h2
            id="operating-model-heading"
            className="mt-4 text-[32px] leading-[1.15] font-semibold tracking-tight text-foreground md:text-[36px] lg:text-[40px]"
          >
            Controlled execution from instruction to settlement.
          </h2>
          <p className="mt-4 text-base leading-[1.5] text-muted-foreground">
            A governed operating model built around control, transparency, and separation of
            roles.
          </p>
          <p className="mt-3 text-xs leading-[1.5] text-muted-foreground">
            Operating model / platform design — this sequence describes AIX&rsquo;s approved
            execution design, not a live transaction feed.
          </p>
        </div>

        <div className="mt-12 md:mt-16 lg:mt-20">
          <DesktopProcessRow />
          <TabletProcessGrid />
          <MobileProcessList />
        </div>
      </div>
    </section>
  );
}
