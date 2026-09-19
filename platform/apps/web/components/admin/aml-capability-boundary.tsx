/**
 * Transaction Monitoring boundary — UI Phase 2P. The page's governed title is "AML / Transaction
 * Monitoring"; this section is what keeps that title honest. **Transaction monitoring is not implemented in
 * the current backend** (`UI-04` §51.2): there is no ledger or transaction service, AML-01 has no
 * transaction subject and defers `transaction_triggered` rescreening, and the platform master documents
 * define transaction monitoring as a separate module that does not exist. AML-01's "monitoring" re-screens
 * subjects against lists — described here as rescreening, never relabelled.
 *
 * Restrained by design: a factual status line (not an error, not a warning colour), one paragraph, and a
 * plain list of what AML-01 does today, each with its real limit. It says the limitation out loud without
 * claiming the related obligations are met — "stating this boundary does not mean the obligation is
 * satisfied" — and it does not dress the gap up with a placeholder: no empty alert table, no
 * "0 alerts", no disabled rule editor. A Server Component with no interactive element.
 *
 * Not on this page, by decision (`UI-04` §51.1): filing workflows, EDD and case content — none exists in
 * AML-01, so the closing sentence names the categories as "not represented" without inventing a state,
 * action or workflow for them. WLT-01's velocity limits are a pre-use control on authorised intent, not
 * monitoring, and carry amounts; they are deliberately absent.
 */

const TODAY: { term: string; meaning: string }[] = [
  {
    term: "Subject screening",
    meaning: "Client applications and authorised parties are screened for sanctions, PEP and adverse-media matches.",
  },
  {
    term: "Rescreening",
    meaning:
      "A subject can be rescreened manually, when its last screening is overdue, or when the screening list version changes.",
  },
  {
    term: "Rescreening runs",
    meaning:
      "Route-triggered batches. No scheduler exists: a run happens only when an operator or another service calls for one.",
  },
  {
    term: "Risk signals",
    meaning:
      "Raised by rescreening and by a confirmed match. AML-01 only emits them — it never blocks, freezes or changes anything.",
  },
  {
    term: "Pre-use screening check",
    meaning:
      "Before a payout destination is used, the wallet module asks AML-01 for an allow, review or deny decision from existing screening evidence. This is not transaction analysis.",
  },
  {
    term: "Screening provider",
    meaning: "A deterministic test stub. No live screening vendor is integrated.",
  },
];

export function AmlCapabilityBoundary() {
  return (
    <section aria-labelledby="transaction-monitoring-heading" className="border-t border-border pt-8">
      <h2 id="transaction-monitoring-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Transaction Monitoring
      </h2>
      <p className="mt-2 text-sm font-medium text-foreground">Not implemented in the current backend.</p>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        AML-01&rsquo;s monitoring re-screens subjects against screening lists. It does not analyse transaction events,
        so no transaction alert, rule or case exists to show here. Stating this boundary does not mean the related
        obligations are met.
      </p>

      <h3 className="mt-6 text-sm font-semibold text-foreground">What AML-01 does today</h3>
      <dl className="mt-3 flex max-w-prose flex-col gap-3">
        {TODAY.map((item) => (
          <div key={item.term} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <dt className="text-sm text-foreground">{item.term}</dt>
            <dd className="mt-0.5 text-xs text-muted-foreground">{item.meaning}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 max-w-prose text-xs text-muted-foreground">
        Alert investigation, case management and regulatory reporting workflows are not represented in the current
        backend, and none is shown on this page.
      </p>
    </section>
  );
}
