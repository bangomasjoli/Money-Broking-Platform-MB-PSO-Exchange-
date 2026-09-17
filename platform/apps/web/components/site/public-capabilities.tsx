import {
  Handshake,
  IdCard,
  ClipboardCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * AIX public-site "Platform Capabilities" homepage section (UI Phase 1F) — one section only,
 * below `PublicTrustControl`. Not a generic feature-card dump, not a claim that every capability
 * is live, not an implication that Exchange functionality is active. `PublicHeader`, `PublicHero`,
 * `PublicOperatingModel`, and `PublicTrustControl` (Phases 1B-1E) are consumed unchanged.
 *
 * REGULATORY/PRODUCT BOUNDARY: matches
 * `docs/01_masters/00_Licence_Scope_And_Feature_Lock_v1.3.md` §3's "Current Licence Status"
 * table exactly — Money Broking Licence (Approved, active build scope), Payment System Operator
 * Licence (Approved, active build scope), Exchange Application (Pending, "Locked until
 * approval"). The Broking & Execution domain below carries an explicit, quiet boundary sentence
 * for exactly this reason — not a loud warning box, a precise statement matching the masters'
 * own "Locked until approval" language. No principal dealing, proprietary trading, market
 * making, derivatives, margin, futures, staking, lending, yield, MYR pairs, privacy coins, or
 * algorithmic stablecoins are named or implied anywhere in this component.
 *
 * SOURCE VALIDATION: every capability item was checked against
 * `docs/01_masters/03_Master_Module_Index_v1.2.md` / `02_Software_Requirement_Specification_v1.2.md`
 * before being used — "institutional and HNWI/professional onboarding" ("MVP client type =
 * institutional and HNWI/professional only... Retail onboarding is disabled by default" — retail
 * is deliberately NOT listed as a capability here), "KYC/KYB", "AML"/"Transaction Monitoring",
 * "Travel Rule Enforcement", "OTC/RFQ" ("Agency RFQ request, quote, acceptance, trade booking"),
 * "MB Spot Broking Terminal", agency/back-to-back execution, "deposit_withdrawal = enabled",
 * pre-funded controls, settlement, reconciliation, maker-checker, audit log, default-deny
 * role/permission controls, and safeguarding/reconciliation reporting. No capability name was
 * invented for marketing purposes.
 *
 * GROUPING: 4 larger capability domains (Client & Compliance / Broking & Execution / Payments &
 * Settlement / Controls & Reporting), each with its own short internal list — not 8-12 small
 * cards, per this turn's explicit instruction.
 *
 * VISUAL PATTERN: a 2x2 "architectural capability matrix" (brief's Pattern B) at desktop,
 * separated by thin rule dividers rather than card borders/backgrounds — one continuous cross of
 * dividers, not four boxed cards, echoing the divided-list language `PublicTrustControl` already
 * established for the homepage, applied here on both axes instead of one. Below `lg:`: single
 * column, one domain after another (the brief's explicit "simplify deliberately" instruction —
 * a 2x2 grid was judged harder to read at tablet widths than a straightforward stack).
 *
 * INTERACTION: fully static — no Tabs/Accordion/carousel. All 4 domains are shown at once, which
 * is clearer for a first-time visitor scanning platform scope than hiding 3 of 4 behind a
 * click; `Separator`/`Tabs` were both considered per this turn's shadcn policy and judged
 * unnecessary (the divider is a plain 1px border, and no interaction improves this section's
 * comprehension over showing everything statically).
 *
 * ICONS: Lucide, one per domain (not per capability item, per this turn's "one icon per domain
 * maximum" instruction), decorative (`aria-hidden`), 20px — the same governed icon-size tier
 * every prior homepage section uses.
 *
 * VISUAL QA: intentionally DEFERRED this turn, per explicit instruction. See
 * `docs/04_ui/AIX_UI_MEASUREMENT_SPEC_v0.1.md` §24 for the recorded visual-risk flags (this
 * section's own, plus the still-open Phase 1D and Phase 1E flags, all intentionally left open
 * for a later consolidated QA pass).
 */

type CapabilityDomain = {
  title: string;
  description: string;
  icon: LucideIcon;
  items: string[];
  boundaryNote?: string;
};

const DOMAINS: CapabilityDomain[] = [
  {
    title: "Client & Compliance",
    description:
      "Institutional and HNWI/professional client onboarding, under governed eligibility and compliance controls.",
    icon: IdCard,
    items: [
      "Institutional and HNWI/professional onboarding",
      "KYC / KYB verification",
      "AML and transaction monitoring",
      "Travel Rule enforcement where applicable",
    ],
  },
  {
    title: "Broking & Execution",
    description:
      "Agency execution against external liquidity, using a controlled quote-and-confirm workflow.",
    icon: Handshake,
    items: [
      "OTC / RFQ request, quote, and acceptance",
      "MB Spot Broking Terminal",
      "Agency / back-to-back execution with external counterparties",
    ],
    boundaryNote:
      "Exchange-related functionality remains controlled and disabled until the applicable approval and go-live conditions are satisfied.",
  },
  {
    title: "Payments & Settlement",
    description: "Controlled payment workflows from deposit through settlement and reconciliation.",
    icon: Wallet,
    items: [
      "Deposits and withdrawals",
      "Pre-funded controls before execution",
      "Controlled settlement handling",
      "Reconciliation",
    ],
  },
  {
    title: "Controls & Reporting",
    description: "Independent checks and full activity evidence across the platform.",
    icon: ClipboardCheck,
    items: [
      "Maker-checker for controlled actions",
      "Audit logging",
      "Role and permission controls (default-deny)",
      "Operational and reconciliation reporting",
    ],
  },
];

const CONTAINER_CLASS = "mx-auto max-w-[1280px] px-4 md:px-8 lg:px-12";

function matrixCellClass(index: number) {
  const isRightColumn = index % 2 === 1;
  const isBottomRow = index >= 2;
  return [
    // Stacked mode (<lg:): uniform 32px vertical rhythm between domains.
    "py-8 lg:py-0",
    // Matrix mode (lg: and up): a 32px gap on each side of the divider line (64px combined),
    // so the divider sits exactly centered in the gap rather than touching either domain's text.
    isRightColumn ? "lg:border-l lg:border-border lg:pl-8" : "lg:pr-8",
    isBottomRow ? "lg:border-t lg:border-border lg:pt-8" : "lg:pb-8",
  ]
    .filter(Boolean)
    .join(" ");
}

function DomainCapabilityList({ domain }: { domain: CapabilityDomain }) {
  const Icon = domain.icon;
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-[var(--marketing-surface)]">
          <Icon className="size-5 text-foreground" aria-hidden />
        </div>
        <h3 className="text-sm font-semibold text-foreground">{domain.title}</h3>
      </div>
      <p className="mt-3 max-w-[440px] text-xs leading-[1.5] text-muted-foreground">
        {domain.description}
      </p>
      <ul className="mt-4 space-y-1.5">
        {domain.items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
            <span className="max-w-[420px] text-xs leading-[1.5] text-muted-foreground">
              {item}
            </span>
          </li>
        ))}
      </ul>
      {domain.boundaryNote ? (
        <p className="mt-4 max-w-[440px] text-xs leading-[1.5] text-muted-foreground">
          {domain.boundaryNote}
        </p>
      ) : null}
    </div>
  );
}

export function PublicCapabilities() {
  return (
    <section
      // id added in UI Phase 1I for PublicFooter's same-page anchor — no visual change.
      id="capabilities"
      aria-labelledby="capabilities-heading"
      className="pt-16 pb-20 md:pt-20 md:pb-24 lg:pt-24 lg:pb-28"
    >
      <div className={CONTAINER_CLASS}>
        <div className="mx-auto max-w-[720px] text-center">
          <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
            Platform Capabilities
          </p>
          <h2
            id="capabilities-heading"
            className="mt-4 text-[32px] leading-[1.15] font-semibold tracking-tight text-foreground md:text-[36px] lg:text-[40px]"
          >
            Operational capabilities built around governed workflows.
          </h2>
          <p className="mt-4 text-base leading-[1.5] text-muted-foreground">
            AIX combines institutional client controls, agency execution, payment and settlement
            workflows, and operational evidence in one governed platform.
          </p>
          <p className="mt-3 text-xs leading-[1.5] text-muted-foreground">
            Platform design / operational scope — reflects AIX&rsquo;s approved build scope, not a
            claim that every capability operates at full production scope today.
          </p>
        </div>

        {/* No grid `gap` here — deliberately. Horizontal/vertical spacing around the matrix
            dividers is owned entirely by each cell's own lg:pl-8/pr-8/pt-8/pb-8 padding
            (matrixCellClass); adding a grid gap-x/gap-y on top would double-count with that
            padding and produce a wider gap than the intended 64px. */}
        <div className="mt-12 grid grid-cols-1 md:mt-16 lg:mt-20 lg:grid-cols-2">
          {DOMAINS.map((domain, index) => (
            <div key={domain.title} className={matrixCellClass(index)}>
              <DomainCapabilityList domain={domain} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
