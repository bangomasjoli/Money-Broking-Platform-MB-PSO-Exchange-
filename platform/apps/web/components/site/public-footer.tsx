import Link from "next/link";

/**
 * AIX public-site footer (UI Phase 1I) — the final structural component of the current
 * homepage, after `PublicFinalCta`. Every prior public-site component (Phases 1B-1H) is
 * consumed unchanged. Not a sitemap dump, not a consumer-app footer, not a social-media wall,
 * not a newsletter signup, not a legal-document wall, not a regulator-logo area.
 *
 * BRAND: the same temporary "AIX" typographic wordmark `PublicHeader` already uses — BRAND ASSET
 * PENDING, no logo invented. The descriptor ("Institutional digital-finance infrastructure for
 * governed operations.") is deliberately worded differently from `PublicHero`'s own headline
 * ("Infrastructure for governed money broking and digital-asset operations.") — both are
 * accurate, but using near-identical phrasing top and bottom of the same page would read as
 * repetitive rather than as a deliberate bookend.
 *
 * COPYRIGHT / LEGAL ENTITY: **no registered legal entity name exists anywhere in the governed
 * project docs.** Checked `docs/01_masters/00_Licence_Scope_And_Feature_Lock_v1.3.md` and
 * `docs/01_masters/01_Project_Charter_v1.3.md`'s own Document Control tables (`owner:
 * Unassigned` in both files' frontmatter) and every master document's own naming — only "AIX
 * Money Broking Platform" / "AIX MB Platform" (a *platform* name, not a *legal entity* name)
 * appears anywhere. This turn's own brief suggested "© 2026 AIX Investment Group Company Ltd."
 * as an example but explicitly required confirming the exact naming first and explicitly
 * prohibited inventing a legal entity suffix — since no such name is governed anywhere, the
 * copyright line below uses "AIX" alone, with no corporate suffix, rather than fabricating one.
 *
 * NAVIGATION / ANCHOR POLICY: only anchors that map to a section that genuinely exists on this
 * page are used. Five existing section root elements were given a same-page `id` this turn
 * (`#how-it-works` on `PublicOperatingModel`, `#trust` on `PublicTrustControl`, `#capabilities`
 * on `PublicCapabilities`, `#product` on `PublicProductPreview`, `#request-access` on
 * `PublicFinalCta`) — a minimal, semantic-only addition to each file (one attribute, one
 * comment), not a visual or structural change to any of them. No "Platform" or "Company"
 * standalone link was added, and no "Security"/"Regulatory Scope" link was added — none of
 * those have a distinct real destination on this page without either duplicating an anchor
 * already used for something else or pointing at nothing. "Contact" was deliberately mapped to
 * `#request-access` (not a separate/duplicate link) because that section already contains the
 * "Speak With Our Team" CTA — the genuine contact point. No fake route, no dead link, no 404.
 *
 * CONTACT DETAILS: no email address, phone number, or office address is shown — none is
 * approved for public display in any governed document, per this turn's explicit instruction not
 * to invent one. The existing CTA wording (via the `#request-access` anchor) is the only contact
 * mechanism.
 *
 * SOCIAL LINKS: none — no official social-media link exists in governed project data.
 *
 * BOUNDARY NOTE: uses this turn's exact suggested wording — "Availability of products and
 * functionality is subject to eligibility, onboarding, applicable approvals, and controlled
 * platform enablement" — the same family of language `PublicFinalCta` (§26) already uses, kept
 * consistent rather than introducing new phrasing for the same underlying constraint.
 *
 * SURFACE: deliberately does **not** repeat `PublicFinalCta`'s `--marketing-surface` tint —
 * stacking the same tinted background across two consecutive sections would blend them into one
 * block with no visible seam, undermining "close the page cleanly." Instead the footer uses the
 * page's own base `--marketing-background` (inherited, no override) with a `border-t
 * border-border` at its top edge — a plain divider is the actual closure mechanism here, not a
 * second surface color.
 *
 * DESKTOP LAYOUT (revised, UI Phase 1P / UI-QA-009 fix — see `UI-02` §28.14 for the full
 * geometry): a two-zone `grid-cols-[1fr_auto]` layout at `lg:` (1024px+) — brand zone (`1fr`,
 * absorbs the container's flexible remaining width) on the left, navigation zone (`auto`, sized
 * to its own content) anchored toward the right. Phase 1O's own `flex`+`gap-16` fix (removing a
 * dead `lg:justify-between`) resolved a ~681px empty-middle defect but introduced a left-heavy
 * cluster instead — confirmed only by rendered visual review, not the earlier analytical-only QA
 * pass — corrected here with a genuine two-zone grid rather than restoring `justify-between`
 * (which had its own, different defect). Below `lg:`: unchanged single-column stack.
 */

const PLATFORM_LINKS = [
  { label: "How AIX Works", href: "#how-it-works" },
  { label: "Trust & Governance", href: "#trust" },
  { label: "Capabilities", href: "#capabilities" },
  { label: "Product Experience", href: "#product" },
] as const;

const COMPANY_LINKS = [{ label: "Contact", href: "#request-access" }] as const;

const CONTAINER_CLASS = "mx-auto max-w-[1280px] px-4 md:px-8 lg:px-12";

function FooterLinkGroup({
  title,
  links,
}: {
  title: string;
  links: readonly { label: string; href: string }[];
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-wide text-foreground uppercase">{title}</h3>
      <ul className="mt-4 space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-border pt-12 pb-8">
      <div className={CONTAINER_CLASS}>
        {/* UI Phase 1P (UI-QA-009 fix): Phase 1O's own `lg:justify-between` removal (fixing a
            real ~681px dead-middle gap) traded that defect for a different one — a plain
            `lg:flex-row` with only two children far narrower than the container left the
            navigation zone sitting immediately after the brand block (64px away), with all the
            container's remaining width (~617px) trailing uselessly *after* the navigation zone
            instead of separating the two zones — a left-heavy cluster, confirmed by rendered
            visual review, that the earlier analytical-only QA pass did not catch. Fixed with a
            genuine two-zone `grid-cols-[1fr_auto]` layout (this turn's own suggested concept):
            the brand column takes all available flexible space (`1fr`) while the navigation
            column sizes to its own content (`auto`) and is positioned immediately after the 1fr
            track — which, because that track absorbs the container's full remaining width, places
            the navigation zone at the container's right portion instead of directly beside the
            brand block. `lg:items-start` is explicit (rather than relying on CSS Grid's own
            default `align-items: stretch`) so neither zone is stretched to match the other's
            height when switching layout modes. Full before/after geometry in `UI-02` §28.14. */}
        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[1fr_auto] lg:items-start lg:gap-16">
          <div className="max-w-[280px]">
            <Link
              href="/"
              aria-label="AIX home — brand asset pending, temporary wordmark"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              AIX
            </Link>
            <p className="mt-3 text-sm leading-[1.5] text-muted-foreground">
              Institutional digital-finance infrastructure for governed operations.
            </p>
          </div>

          <nav aria-label="Footer" className="flex flex-col gap-8 sm:flex-row sm:gap-12">
            <FooterLinkGroup title="Platform" links={PLATFORM_LINKS} />
            <FooterLinkGroup title="Company" links={COMPANY_LINKS} />
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">© 2026 AIX. All rights reserved.</p>
          <p className="max-w-[560px] text-xs leading-[1.5] text-muted-foreground sm:text-right">
            Availability of products and functionality is subject to eligibility, onboarding,
            applicable approvals, and controlled platform enablement.
          </p>
        </div>
      </div>
    </footer>
  );
}
