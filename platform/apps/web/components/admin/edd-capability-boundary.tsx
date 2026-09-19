/**
 * EDD Capability boundary — UI Phase 2Q. The page's governed title is "EDD / Review"; this section is what
 * keeps that title honest. **A dedicated EDD workflow is not implemented in the current backend**
 * (`UI-04` §52.1): the whole backend mentions EDD only in comments that say it is excluded, KYC-01's
 * `manual_review`/`edd` states have no reachable code path, and no EDD permission, route, outcome type or
 * trigger exists. The platform's governing documents define EDD (CMP-07, AML-RULE-006); nothing implements
 * it.
 *
 * Restrained by design: a factual status line (not an error, not a warning colour), one paragraph, and a
 * plain list of what does not exist, each in one sentence. It says the limitation out loud without claiming
 * the related obligations are met, and it does not dress the gap up with a placeholder — no empty case
 * table, no "0 EDD cases", no disabled "Start EDD". A Server Component with no interactive element.
 *
 * **What it deliberately does not do:** name a current state an "EDD trigger" or "EDD required" (the
 * governing design intends a high risk rating and PEP exposure to trigger EDD, but the rating is unreadable
 * and the backend only flags a potential match awaiting disposition); display source-of-funds or
 * source-of-wealth as a case requirement (no model exists — the evidence sentence states that absence,
 * nothing more); or mention a filing workflow. The one sentence on where EDD fits is the governing design's
 * own order, not a description of anything built.
 */

const ABSENT: { term: string; meaning: string }[] = [
  {
    term: "Case lifecycle",
    meaning: "No EDD case, status, owner, assignment, due date, decision or approval model exists.",
  },
  {
    term: "Trigger",
    meaning: "The current backend does not define a formal EDD trigger model.",
  },
  {
    term: "Evidence",
    meaning: "No source-of-funds or source-of-wealth evidence model exists.",
  },
  {
    term: "Review record",
    meaning:
      "The review items above are a projection of existing KYC/KYB and AML states. They are not a single object in any module.",
  },
];

export function EddCapabilityBoundary() {
  return (
    <section aria-labelledby="edd-capability-heading" className="border-t border-border pt-8">
      <h2 id="edd-capability-heading" className="text-lg font-semibold tracking-tight text-foreground">
        EDD Capability
      </h2>
      <p className="mt-2 text-sm font-medium text-foreground">Not implemented in the current backend.</p>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        Existing KYC/KYB and AML states can show that a subject needs further assessment. They do not create an EDD
        case. In the platform&rsquo;s governing design, EDD follows screening and risk assessment and precedes product
        access approval. Stating this boundary does not mean the related obligations are met.
      </p>

      <h3 className="mt-6 text-sm font-semibold text-foreground">What does not exist yet</h3>
      <dl className="mt-3 flex max-w-prose flex-col gap-3">
        {ABSENT.map((item) => (
          <div key={item.term} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <dt className="text-sm text-foreground">{item.term}</dt>
            <dd className="mt-0.5 text-xs text-muted-foreground">{item.meaning}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 max-w-prose text-xs text-muted-foreground">
        Implementing EDD needs backend and compliance design, not a frontend change, and none is shown on this page.
      </p>
    </section>
  );
}
