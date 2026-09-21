import { seededStateLine } from "@/components/admin/iam-model-data";

/**
 * Reading This Page — UI Phase 2S. The four authorization words the page uses, defined once, before any
 * section relies on them. The brief's critical language rule is that DEFINED, ASSIGNED, EFFECTIVE and ENFORCED are
 * not interchangeable, and a reader who meets "assigned" or "enforced" without a definition will supply their own.
 *
 * Then one plain line of seeded-state counts (`UI-04` §54.7) — understated facts, each a verified presence or
 * absence in the migrations, with no score, percentage or health indicator — and the provenance sentence that
 * keeps the counts honest: this is the seeded state recorded in source, not a live reading, because no route
 * lists any of it.
 *
 * Not a KPI strip: the counts are one line of muted text. A Server Component with no interactive element.
 */

const TERMS: { term: string; meaning: string }[] = [
  {
    term: "Defined",
    meaning: "The item exists in a catalogue: a role, a permission, a rule or a policy field.",
  },
  {
    term: "Assigned",
    meaning: "A binding record exists: a role given to a user, or a permission granted to a role.",
  },
  {
    term: "Effective",
    meaning: "What the IAM-02 permission check would actually allow today, given the seeded data.",
  },
  {
    term: "Enforced",
    meaning: "A route or check actually consults the item to permit or refuse an action.",
  },
];

export function IamModelKey() {
  return (
    <section aria-labelledby="iam-reading-heading">
      <h2 id="iam-reading-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Reading This Page
      </h2>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        These four words are not interchangeable. A defined role holds no permission until one is assigned, and an
        assigned or defined control that no code consults is not enforced.
      </p>

      <dl className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2 lg:grid-cols-4">
        {TERMS.map((item) => (
          <div key={item.term} className="border-t border-border pt-3">
            <dt className="text-sm font-medium text-foreground">{item.term}</dt>
            <dd className="mt-0.5 text-xs text-muted-foreground">{item.meaning}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 text-xs text-foreground">{seededStateLine()}</p>
      <p className="mt-1 max-w-prose text-xs text-muted-foreground">
        This page describes the seeded state recorded in source. No route lists roles, permissions, grants, rules or
        identities, so live database contents cannot be read here.
      </p>
    </section>
  );
}
