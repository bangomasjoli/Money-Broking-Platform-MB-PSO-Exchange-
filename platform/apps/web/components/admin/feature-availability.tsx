import { availabilityLine, REFERENCED_FEATURES } from "@/components/admin/feature-config-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Feature Availability — UI Phase 2T (`UI-04` §55.4). What is available, and the five state words the page uses —
 * defined once, before any section relies on them. The brief's rule is that DEFINED, DEFAULT, CONFIGURED, EFFECTIVE
 * and LOCKED are not interchangeable, and a reader who meets "default" or "effective" without a definition will
 * supply their own. Where the source does not expose a state, the page says so and infers none.
 *
 * **The finding this section carries: no ordinary feature flag is defined.** `cfg1.feature` is created empty and no
 * migration seeds it (approved decision #5). The only ordinary feature keys in use are the three CLT-01's onboarding
 * gate evaluates, and none has a record — so each is "Not defined" and the decision engine denies it (unknown fails
 * closed). The page therefore shows those three as referenced and undefined, not as `Enabled` or `Disabled`, and
 * invents no flag: Doc 00 §9.1's `feature_*` names are documentation identifiers, not implemented keys.
 *
 * One line of seeded counts (`UI-04` §55.7) — each a verified presence or absence, with no score, percentage or
 * health mark — and the provenance sentence that keeps them honest: this is seeded state recorded in source, not a
 * live reading. A Server Component with no interactive element; the referenced features are a table at `lg:` and a
 * list below it, so nothing scrolls horizontally on a phone.
 */

const STATE_TERMS: { term: string; meaning: string }[] = [
  { term: "Defined", meaning: "A record or setting exists in the model." },
  {
    term: "Default",
    meaning: "What applies when nothing is configured. A feature defaults to disabled, and an unknown feature is denied.",
  },
  { term: "Configured", meaning: "A value has been set on top of the default." },
  { term: "Effective", meaning: "What the decision engine would actually apply." },
  { term: "Locked", meaning: "A governance lock overrides configuration, and no change request can lift it." },
];

export function FeatureAvailability() {
  return (
    <section aria-labelledby="ffc-availability-heading">
      <h2 id="ffc-availability-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Feature Availability
      </h2>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        These five words are not interchangeable. A defined lock has no default, a referenced feature may not be defined at
        all, and where the source exposes no state, this page says so and does not infer one.
      </p>

      <dl className="mt-4 grid gap-x-6 gap-y-3 md:grid-cols-2 lg:grid-cols-5">
        {STATE_TERMS.map((item) => (
          <div key={item.term} className="border-t border-border pt-3">
            <dt className="text-sm font-medium text-foreground">{item.term}</dt>
            <dd className="mt-0.5 text-xs text-muted-foreground">{item.meaning}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 text-xs text-foreground">{availabilityLine()}</p>
      <p className="mt-1 max-w-prose text-xs text-muted-foreground">
        This page describes the seeded state recorded in source. No route lists features, licence profiles, locks, kill
        switches or settings, so live configuration cannot be read here.
      </p>

      <h3 className="mt-6 text-sm font-semibold text-foreground">Ordinary features</h3>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        No ordinary feature record is seeded. The three below are the keys CLT-01&apos;s onboarding gate evaluates. None has a
        record, so each is denied until a governed change request creates and enables it.
      </p>

      <div className="mt-4 hidden lg:block">
        <Table aria-label="Referenced ordinary features">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Feature</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Effective</TableHead>
              <TableHead>Referenced by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {REFERENCED_FEATURES.map((feature) => (
              <TableRow key={feature.key} className="hover:bg-transparent">
                <TableCell className="py-3 align-top whitespace-normal">
                  <span className="block text-sm font-medium text-foreground">{feature.label}</span>
                  <code className="mt-0.5 block text-xs text-muted-foreground">{feature.key}</code>
                </TableCell>
                <TableCell className="py-3 align-top text-xs whitespace-normal text-foreground">Not defined</TableCell>
                <TableCell className="py-3 align-top text-xs whitespace-normal text-foreground">
                  Denied — unknown feature, fails closed
                </TableCell>
                <TableCell className="py-3 align-top text-xs whitespace-normal text-muted-foreground">
                  {feature.referencedBy}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul aria-label="Referenced ordinary features" className="mt-4 flex flex-col lg:hidden">
        {REFERENCED_FEATURES.map((feature) => (
          <li key={feature.key} className="border-t border-border py-4 first:border-t-0 first:pt-0">
            <h4 className="text-sm font-medium text-foreground">{feature.label}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <code>{feature.key}</code>
            </p>
            <dl className="mt-2 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">State</dt>
              <dd className="text-foreground">Not defined</dd>
              <dt className="text-muted-foreground">Effective</dt>
              <dd className="text-foreground">Denied — unknown feature, fails closed</dd>
              <dt className="text-muted-foreground">Referenced by</dt>
              <dd className="text-muted-foreground">{feature.referencedBy}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
