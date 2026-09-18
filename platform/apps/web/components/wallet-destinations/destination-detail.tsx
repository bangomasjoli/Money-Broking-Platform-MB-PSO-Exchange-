import type { ReactNode } from "react";
import { DestinationStatusLine } from "@/components/wallet-destinations/destination-status";
import {
  beneficiaryRelationshipLabel,
  beneficiaryTypeLabel,
  chainLabel,
  countryLabel,
  destinationTypeLabel,
  formatRegisteredDate,
  networkLabel,
  primaryIdentifier,
  walletTypeLabel,
  type PublicDestination,
} from "@/components/wallet-destinations/destination-data";

/**
 * Destination detail — UI Phase 2E, the secondary/evidence region of the List + Detail workspace.
 * Pure content, no wrapping border/surface of its own — the caller supplies the boundary
 * (`DETAIL PANEL`'s single leading `border-l`, `UI-04` §35.17, for the desktop split view; the
 * `Sheet`'s own `OVERLAY` container for the mobile/tablet presentation) so this one component
 * genuinely renders identically in both places, per this turn's "do not duplicate detail markup"
 * instruction.
 *
 * **Every field below exists in the actual governed `PublicDestination` contract** — verified
 * against `dto.ts` directly. Deliberately NOT shown, because the public contract does not return
 * them: Proof-of-Control verification status, first-use state, limits/velocity/concentration
 * thresholds, maker-checker approver/queue detail, evidence/audit trail, any balance figure. A
 * single `DestinationStatusLine` represents BOTH "current lifecycle state" and "approval state" —
 * the contract has exactly one `status` field, so presenting two separate rows for it would
 * fabricate a distinction that does not exist server-side.
 */
export function DestinationDetail({ destination }: { destination: PublicDestination }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{destinationTypeLabel(destination.destination_type)}</p>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {primaryIdentifier(destination)}
        </h2>
        <DestinationStatusLine status={destination.status} />
      </div>

      <dl className="flex flex-col gap-3">
        {destination.destination_type === "wallet" ? (
          <>
            <DetailRow label="Network">
              {chainLabel(destination.chain)} · {networkLabel(destination.network)}
            </DetailRow>
            <DetailRow label="Wallet type">{walletTypeLabel(destination.wallet_type)}</DetailRow>
            <DetailRow label="Relationship">
              {beneficiaryRelationshipLabel(destination.beneficiary_relationship)}
            </DetailRow>
            <DetailRow label="Memo / tag">{destination.memo_tag_present ? "Present" : "Not required"}</DetailRow>
          </>
        ) : (
          <>
            <DetailRow label="Country">{countryLabel(destination.bank_country)}</DetailRow>
            <DetailRow label="Currency">{destination.currency}</DetailRow>
            <DetailRow label="Bank identifier">{destination.bank_identifier}</DetailRow>
            {destination.branch_identifier && (
              <DetailRow label="Branch">{destination.branch_identifier}</DetailRow>
            )}
            <DetailRow label="Beneficiary type">{beneficiaryTypeLabel(destination.beneficiary_type)}</DetailRow>
          </>
        )}
        <DetailRow label="Registered">{formatRegisteredDate(destination.created_at_utc)}</DetailRow>
      </dl>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm text-foreground">{children}</dd>
    </div>
  );
}
