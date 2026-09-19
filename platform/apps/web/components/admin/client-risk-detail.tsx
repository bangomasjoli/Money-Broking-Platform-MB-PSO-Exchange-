import type { ReactNode } from "react";
import {
  CHECKLIST_STAFF_LABELS,
  KYC_CASE_TYPE_LABELS,
  beneficialOwnershipLabel,
  checklistSummary,
  clientClassLabel,
  documentTypeLabel,
  lifecycleLabel,
  outcomeLabel,
  outstandingItems,
  type DemoClientCompliance,
} from "@/components/admin/client-risk-data";
import { KycStateLine } from "@/components/admin/client-risk-status";

/**
 * Client compliance detail — UI Phase 2O, the secondary/evidence region of the List + Detail workspace.
 * Pure content with no boundary of its own: the caller supplies it (the `DETAIL PANEL`'s single leading
 * `border-l` on desktop, the `Sheet`'s overlay container below `lg:`), so one component renders
 * identically in both places. `showHeading` is true only for the desktop panel — the Sheet already has a
 * `SheetTitle`/`SheetDescription` carrying the organisation and reference, and repeating them would
 * duplicate the dialog's own title.
 *
 * Sections appear only where a governed concept backs them (`UI-04` §50.1): Client Summary, KYC / KYB
 * Case (which carries the CDD outcome as a row — one field does not earn a section), Outstanding
 * Information, Beneficial Ownership, and Risk and Screening. No "Compliance Score", no generic overview.
 *
 * **Read-only by construction.** There is no Review Actions section and no button, link or input: an
 * override, a request for documents or an escalation would each be a governed, authority-checked
 * workflow (`kyc1.outcome.override` is maker-checker), and Admin visibility does not imply mutation
 * authority. Nothing here resembles an outcome being decided.
 *
 * **Risk and Screening states what is absent, and why**, rather than omitting the section: this page is
 * titled "Client Risk", so a reader will look for a rating. The governed rating exists but no read
 * projection returns it — saying so is more honest than a silent gap, and none is shown or inferred.
 * Screening and enhanced due diligence are separate future review areas and are not represented.
 *
 * Not shown, by decision: identity documents, evidence references or hashes, beneficial-owner names or
 * percentages, screening results, reviewer identity or notes, and CLT-01's per-application rollup
 * statuses.
 */
export function ClientRiskDetail({
  client,
  showHeading = false,
}: {
  client: DemoClientCompliance;
  showHeading?: boolean;
}) {
  const outstanding = outstandingItems(client);

  return (
    <div className="flex flex-col gap-6">
      {showHeading && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{client.clientRef}</p>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{client.legalName}</h2>
        </div>
      )}

      <Section title="Client Summary">
        <Row label="Client class">{clientClassLabel(client.clientClass)}</Row>
        <Row label="Lifecycle">{lifecycleLabel(client.clientLifecycle)}</Row>
      </Section>

      <section aria-label="KYC / KYB Case">
        <h3 className="text-sm font-semibold text-foreground">KYC / KYB Case</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Case type">{KYC_CASE_TYPE_LABELS[client.caseType]}</Row>
          <Row label="Status">
            <KycStateLine caseStatus={client.caseStatus} outcome={client.outcome} />
          </Row>
          <Row label="CDD outcome">{outcomeLabel(client.outcome)}</Row>
          <Row label="Checklist">{checklistSummary(client.checklist)}</Row>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Shows the primary case. Cases for authorised parties are not represented in this preview.
        </p>
      </section>

      <section aria-label="Outstanding Information">
        <h3 className="text-sm font-semibold text-foreground">Outstanding Information</h3>
        {outstanding.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">No checklist items are outstanding.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {outstanding.map((item) => (
              <li
                key={item.id}
                className="flex items-baseline justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0"
              >
                <span className="text-sm text-foreground">{documentTypeLabel(item)}</span>
                <span className="text-right text-xs text-muted-foreground">{CHECKLIST_STAFF_LABELS[item.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Section title="Beneficial Ownership">
        <Row label="Ownership information">{beneficialOwnershipLabel(client.beneficialOwnershipOnFile)}</Row>
      </Section>

      <section aria-label="Risk and Screening">
        <h3 className="text-sm font-semibold text-foreground">Risk and Screening</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <Row label="Risk rating">Not available in this preview</Row>
          <Row label="Screening and EDD">Not represented in this preview</Row>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          A governed risk rating exists in the compliance model, but no read projection exposes it yet, so none is
          shown or inferred. Screening and enhanced due diligence are separate review areas.
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        Identity documents, evidence references, beneficial-owner names and percentages, screening results and
        reviewer notes are not shown here.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <dl className="mt-3 flex flex-col gap-3">{children}</dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm text-foreground">{children}</dd>
    </div>
  );
}
