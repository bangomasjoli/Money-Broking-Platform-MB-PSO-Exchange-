import { KeyRound, LockKeyhole, ListChecks, Users, type LucideIcon } from "lucide-react";

/**
 * AIX public-site "Trust, Governance & Control" homepage section (UI Phase 1E) — one section
 * only, below `PublicOperatingModel`. Not a certification wall, not a trust-badge/regulator-logo
 * section, not a compliance-claim section, not a feature-card dump. `PublicHeader`, `PublicHero`,
 * and `PublicOperatingModel` (Phases 1B-1D) are consumed unchanged, not redesigned.
 *
 * REGULATORY/CLAIM DISCIPLINE: no claim here asserts "fully regulated," "bank-grade security,"
 * "institutional-grade custody," "audited security," "regulator certified," a blanket "approved
 * by LFSA," or "fully compliant" — none of those statements are governed/approved for platform-
 * wide use. No regulator logo or external-certification implication appears. Every visible
 * statement instead describes AIX's own control ARCHITECTURE, checked against
 * `docs/01_masters/04_Role_And_Permission_Matrix_v1.2.md` ("The platform must use default-deny
 * permission enforcement"; "role, permission, maker-checker, and segregation-of-duties model")
 * and `docs/01_masters/02_Software_Requirement_Specification_v1.2.md` ("Client money safeguarding
 * account = required"; safeguarding computation/reconciliation), plus the already-implemented,
 * real IAM-02/SEC-01 sensitive-read-logging concept referenced in
 * `docs/00_project_state/PROJECT_HANDOVER.md` (`aml1.screening.sensitive_read`, tier-based
 * redaction) — not invented capability. The section carries its own explicit "Platform design /
 * control model" disclosure line rather than implying completed external audit or certification.
 *
 * FOUR CONTROL GROUPS (this turn's preferred model, kept — not expanded into six generic cards):
 * Authority / Approval / Funds Control / Evidence. Rendered as ONE coherent, ordered control list
 * (`<ol>`, real 1-4 sequence — these are layers of one system, not independent feature cards) with
 * `divide-y` borders between rows — the "one continuous vertical rule" the brief asked for, read
 * as a single measured ledger-style structure rather than four boxed cards. No card border, no
 * per-row background fill, no rounded container around the whole list — deliberately avoiding the
 * "four generic SaaS cards" anti-pattern named explicitly in this turn's brief.
 *
 * LAYOUT: two-column at `lg:` (1024px+) — LEFT intro (eyebrow/heading/copy/disclosure),
 * RIGHT the control list — reusing the same `grid-cols-2`/`gap-16` (64px) pattern and the same
 * left-aligned intro treatment `PublicHero` already established, for homepage-wide visual
 * consistency. This is a deliberate difference from `PublicOperatingModel`'s own CENTERED intro:
 * that section's intro sits above a full-width horizontal sequence (centering suits that), while
 * this section's intro sits beside a column of content (left-aligned suits that) — not an
 * inconsistency, a layout-appropriate choice each time. Below `lg:`: single column, intro then
 * list, matching the same collapse pattern `PublicHero` and `PublicOperatingModel` already use.
 *
 * ICONS: Lucide, decorative (`aria-hidden`), one per control group, deliberately different from
 * `PublicOperatingModel`'s icon set even where a concept could overlap (e.g. "Funds Control" here
 * uses `LockKeyhole`, not the `Wallet` icon `PublicOperatingModel`'s "Funding" step already uses)
 * so the two sections don't visually repeat the same icon+label pairing. Sized 20px — the same
 * governed 20px-icon tier `PublicOperatingModel` established, not a new size invented for this
 * section.
 *
 * UI PHASE 1N REMEDIATION (UI-QA-003, homepage repetition/monotony): three changes, all
 * documented in `UI-02` §28.12 with the full before/after rhythm arithmetic — (1) the 40px
 * circular icon marker `PublicOperatingModel` established was found reused byte-identically by
 * this section and `PublicCapabilities` (3 of 4 icon-bearing sections sharing one treatment) —
 * removed here in favor of a bare icon (no circle, no border, no fill), per this turn's own
 * "consider removing circular containers and using bare/quiet icons" guidance;
 * `PublicOperatingModel`'s own circular markers are explicitly preserved unchanged (its process-
 * rail numbering genuinely needs the marker; this section's list does not). (2) Section top
 * padding reduced by one governed spacing step (`pt-16`→`pt-12`/`md:pt-20`→`md:pt-16`/
 * `lg:pt-24`→`lg:pt-20`) — this section now follows `PublicOperatingModel` more closely, as part
 * of the same "informative middle tier" flow, rather than repeating the identical
 * `pt-16`/`pb-20` pairing three-to-four consecutive sections in a row used. (3) Added a full-bleed
 * `--marketing-surface` background (the same already-established token `PublicHero`'s pill and
 * `PublicFinalCta`'s own section background already use, not a new one) — chosen over
 * `PublicProductPreview` for this turn's "at most one additional surface treatment" allowance,
 * because `PublicProductPreview`'s shell already carries its own contained surface tint; adding a
 * second, full-bleed tint immediately behind it would reduce the contrast that currently makes the
 * shell read as a distinct "product window" against a plain page background — this section has no
 * such existing treatment, so the addition is genuinely additive, not conflicting.
 *
 * VISUAL QA: intentionally DEFERRED this turn, per explicit instruction — this component was
 * verified via source/layout review, typecheck/lint/build, and rendered-HTML/compiled-CSS
 * inspection only. No screenshot review was requested or performed. See
 * `docs/04_ui/AIX_UI_MEASUREMENT_SPEC_v0.1.md` §23 for this section's own recorded visual-risk
 * flags, left open for a later consolidated QA pass rather than resolved piecemeal here — this
 * turn's rhythm/repetition remediation does not address or close them.
 */

type ControlGroup = {
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

const CONTROL_GROUPS: ControlGroup[] = [
  {
    number: "01",
    title: "Authority",
    description:
      "Default-deny access control, with explicit role and permission boundaries for every action.",
    icon: KeyRound,
  },
  {
    number: "02",
    title: "Approval",
    description:
      "Maker-checker and segregation-of-duties apply to controlled actions, so no single person completes a sensitive workflow alone.",
    icon: Users,
  },
  {
    number: "03",
    title: "Funds Control",
    description:
      "Client funds remain subject to pre-funded controls and safeguarding boundaries throughout the settlement process.",
    icon: LockKeyhole,
  },
  {
    number: "04",
    title: "Evidence",
    description:
      "Platform activity, including sensitive access, is logged for audit, reconciliation, and reporting.",
    icon: ListChecks,
  },
];

const CONTAINER_CLASS = "mx-auto max-w-[1280px] px-4 md:px-8 lg:px-12";

function ControlList() {
  return (
    <ol className="list-none divide-y divide-border">
      {CONTROL_GROUPS.map((group) => {
        const Icon = group.icon;
        return (
          <li key={group.number} className="flex items-start gap-4 py-6 first:pt-0 last:pb-0">
            {/* Bare icon — no circular container. UI Phase 1N (UI-QA-003): removed the 40px
                circle/border/fill marker to reduce this page's repeated icon-marker treatment;
                see the header comment above and UI-02 §28.12. `mt-0.5` (2px) is a documented
                optical-correction exception (UI-01 §5) nudging the icon toward the "01" label's
                own line — not verified in a rendered viewport, since no screenshot tool was
                available this turn; flagged for confirmation in a future visual QA pass. */}
            <Icon className="mt-0.5 size-5 shrink-0 text-foreground" aria-hidden />
            <div>
              <span className="text-xs font-semibold tracking-wide text-muted-foreground">
                {group.number}
              </span>
              <h3 className="mt-1 text-sm font-semibold text-foreground">{group.title}</h3>
              <p className="mt-1 max-w-[440px] text-xs leading-[1.5] text-muted-foreground">
                {group.description}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function PublicTrustControl() {
  return (
    <section
      // id added in UI Phase 1I for PublicFooter's same-page anchor — no visual change.
      // scroll-mt-24/lg:scroll-mt-28 added in UI Phase 1L (UI-QA-001 fix) — clears the fixed
      // header's occupied envelope plus 24px breathing margin; see public-operating-model.tsx's
      // own comment for the full arithmetic, identical across all 5 anchored sections.
      id="trust"
      aria-labelledby="trust-control-heading"
      // UI Phase 1N (UI-QA-003): top padding reduced one step (pt-16/md:pt-20/lg:pt-24 →
      // pt-12/md:pt-16/lg:pt-20) and a full-bleed --marketing-surface background added — both
      // reasoned in the header comment above; full before/after rhythm arithmetic in UI-02
      // §28.12. scroll-mt-24/lg:scroll-mt-28 (Phase 1L) are unaffected by this change — they
      // govern where the section's own top edge lands, independent of the section's own top
      // padding, so no retuning was needed.
      className="scroll-mt-24 bg-[var(--marketing-surface)] pt-12 pb-20 md:pt-16 md:pb-24 lg:scroll-mt-28 lg:pt-20 lg:pb-28"
    >
      <div className={CONTAINER_CLASS}>
        <div className="grid grid-cols-1 gap-10 md:gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
              Trust &amp; Control
            </p>
            <h2
              id="trust-control-heading"
              className="mt-4 max-w-[480px] text-[32px] leading-[1.15] font-semibold tracking-tight text-foreground md:text-[36px] lg:text-[40px]"
            >
              Control is built into the operating model.
            </h2>
            <p className="mt-4 max-w-[440px] text-base leading-[1.5] text-muted-foreground">
              AIX is designed around explicit authority, segregation of duties, controlled
              approval, and auditable activity — with clear operational boundaries at every
              stage.
            </p>
            <p className="mt-3 max-w-[440px] text-xs leading-[1.5] text-muted-foreground">
              Platform design / control model — reflects AIX&rsquo;s governed control
              architecture, not a claim of external certification or completed audit.
            </p>
          </div>

          <div>
            <ControlList />
          </div>
        </div>
      </div>
    </section>
  );
}
