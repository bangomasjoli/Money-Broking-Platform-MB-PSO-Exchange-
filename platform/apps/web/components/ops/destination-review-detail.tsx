import type { ReactNode } from "react";
import { CircleCheck, CircleX, Minus } from "lucide-react";
import { formatRequestDateTime } from "@/components/ops/client-request-data";
import {
  BENEFICIARY_VERIFICATION_LABELS,
  CONTROL_STATE_NOTES,
  GATE_STATE_LABELS,
  PROOF_OF_CONTROL_LABELS,
  REVIEW_ACTION_LABELS,
  SCREENING_OUTCOME_LABELS,
  approvalReadiness,
  availableActions,
  destinationReference,
  type DestinationReviewRecord,
  type GateState,
} from "@/components/ops/destination-review-data";
import { Button } from "@/components/ui/button";
import { DestinationStatusLine } from "@/components/wallet-destinations/destination-status";
import {
  beneficiaryRelationshipLabel,
  beneficiaryTypeLabel,
  chainLabel,
  countryLabel,
  destinationTypeLabel,
  networkLabel,
  primaryIdentifier,
  walletTypeLabel,
} from "@/components/wallet-destinations/destination-data";

/**
 * Destination review detail — UI Phase 2K, the secondary/evidence region of the List + Detail
 * workspace. Pure content with no boundary of its own (the caller supplies it: `DETAIL PANEL`'s
 * single leading `border-l` on desktop, the `Sheet` below `lg:`), so one component renders
 * identically in both — no duplicated detail markup.
 *
 * **Deliberately NOT the Client `DestinationDetail`.** A client reviews their own destination
 * (what it is, where it stands); staff decide (what controls apply, what is missing, what action
 * exists). Different hierarchy, different sections — this one reuses only the domain formatters and
 * the status line from `UI Phase 2E`, never its layout.
 *
 * Sections appear only where WLT-01 backs them (`UI-04` §46.1): Client Context, Destination Details,
 * Control State, Screening & Evidence (non-revoked only), Review Actions. Not a raw debug view — no
 * version counters, hashes, internal ids or provider names.
 *
 * **Masked only.** Every destination value is the already-masked `address_masked` /
 * `account_identifier_masked`; there is no reveal control. Sensitive-read logging in WLT-01
 * (`lib/sensitive-read.ts`) is service-attributed audit around the proof-of-control routes — it is
 * not a staff reveal permission, and no other route discloses a full address or account number.
 *
 * **Review Actions is a display, not a control surface.** The listed actions are exactly what
 * `WLT-01` defines for the current status (`availableActions`); each button is natively `disabled`
 * (not focusable) because no staff action route is integrated. There is no "Approve": approval is
 * `approve/request` (a read-only preflight) → an IAM-02 approval by a different actor →
 * `approve/apply`, so the maker-side control is "Request approval". Revocation is a different kind of
 * action — single-step, no maker-checker, irreversible, valid from any non-revoked state — and the
 * wording says so. There is no "Reject": the backend has none.
 *
 * `showHeading` is true only for the desktop panel; the Sheet carries the identifier and reference
 * in its own title/description, so either way each appears exactly once.
 */
export function DestinationReviewDetail({
  record,
  showHeading = false,
}: {
  record: DestinationReviewRecord;
  showHeading?: boolean;
}) {
  const { destination, review } = record;
  const actions = availableActions(record);
  const isRevoked = destination.status === "revoked";
  const readiness = destination.status === "pending_review" ? approvalReadiness(record) : null;

  return (
    <div className="flex flex-col gap-6">
      {showHeading && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{destinationReference(record)}</p>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{primaryIdentifier(destination)}</h2>
        </div>
      )}

      <Section title="Client Context">
        <Row label="Client">{review.clientRef}</Row>
      </Section>

      <Section title="Destination Details">
        <Row label="Type">{destinationTypeLabel(destination.destination_type)}</Row>
        {destination.destination_type === "wallet" ? (
          <>
            <Row label="Network">
              {chainLabel(destination.chain)} · {networkLabel(destination.network)}
            </Row>
            <Row label="Wallet type">{walletTypeLabel(destination.wallet_type)}</Row>
            <Row label="Relationship">{beneficiaryRelationshipLabel(destination.beneficiary_relationship)}</Row>
            <Row label="Memo / tag">{destination.memo_tag_present ? "Present" : "Not required"}</Row>
          </>
        ) : (
          <>
            <Row label="Country">{countryLabel(destination.bank_country)}</Row>
            <Row label="Currency">{destination.currency}</Row>
            <Row label="Rail">{destination.rail}</Row>
            <Row label="Bank identifier">{destination.bank_identifier}</Row>
            {destination.branch_identifier && <Row label="Branch">{destination.branch_identifier}</Row>}
            <Row label="Beneficiary type">{beneficiaryTypeLabel(destination.beneficiary_type)}</Row>
          </>
        )}
        <Row label="Registered">{formatRequestDateTime(destination.created_at_utc)}</Row>
      </Section>

      <section aria-label="Control State">
        <h3 className="text-sm font-semibold text-foreground">Control State</h3>
        <div className="mt-3">
          <DestinationStatusLine status={destination.status} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{CONTROL_STATE_NOTES[destination.status]}</p>
      </section>

      {!isRevoked && (
        <section aria-label="Screening & Evidence">
          <h3 className="text-sm font-semibold text-foreground">Screening &amp; Evidence</h3>
          <dl className="mt-3 flex flex-col gap-3">
            <Row label="Screening outcome">{review.screening ? SCREENING_OUTCOME_LABELS[review.screening] : "—"}</Row>
            {destination.destination_type === "wallet" ? (
              <Row label="Proof of control">{PROOF_OF_CONTROL_LABELS[review.proofOfControl]}</Row>
            ) : (
              <Row label="Beneficiary verification">
                {review.beneficiaryVerification ? BENEFICIARY_VERIFICATION_LABELS[review.beneficiaryVerification] : "—"}
              </Row>
            )}
            {review.stuckScreeningMinutes !== null && (
              <Row label="Screening running for">{formatMinutes(review.stuckScreeningMinutes)}</Row>
            )}
          </dl>

          {readiness && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-xs font-medium text-foreground">Approval gates</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {readiness.gates.map((gate) => (
                  <li key={gate.label} className="flex items-center justify-between gap-4 text-xs text-foreground">
                    <span>{gate.label}</span>
                    <GateIndicator state={gate.state} />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                {readiness.allMet
                  ? "The gates shown are met. Approval also requires an unexpired screening result, which is not visible here."
                  : "Approval cannot be requested until the gates above are met; revocation remains available."}
              </p>
            </div>
          )}
        </section>
      )}

      <section aria-label="Review Actions">
        <h3 className="text-sm font-semibold text-foreground">Review Actions</h3>
        {actions.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">No staff action is available for a revoked destination.</p>
        ) : (
          <>
            <p className="mt-3 text-xs text-muted-foreground">
              Interface preview — staff action routes are not yet integrated, so these actions are unavailable.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {actions.map((action) => (
                <li key={action}>
                  <Button type="button" variant="outline" size="sm" disabled>
                    {REVIEW_ACTION_LABELS[action]}
                  </Button>
                </li>
              ))}
            </ul>
            {actions.includes("request_approval") && (
              <p className="mt-3 text-xs text-muted-foreground">
                Approval is a separate maker-checker step: it is completed by a different authorised approver, not by
                the person who requests it.
              </p>
            )}
            {actions.includes("revoke") && (
              <p className="mt-3 text-xs text-muted-foreground">
                Revocation is immediate, single-step and irreversible. It is not a maker-checker action.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const GATE_ICON: Record<GateState, typeof CircleCheck> = {
  met: CircleCheck,
  not_met: CircleX,
  not_applicable: Minus,
};

function GateIndicator({ state }: { state: GateState }) {
  const Icon = GATE_ICON[state];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {GATE_STATE_LABELS[state]}
    </span>
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
