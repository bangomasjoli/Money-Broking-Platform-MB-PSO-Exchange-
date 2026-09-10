/**
 * WLT-01 Public Client Surface — the SINGLE safe-projection point for every public destination
 * response (list + single-read + registration). Deliberately SEPARATE from `lib/safe-response.ts`
 * (wallet) and `routes/payout-destinations.ts`'s own `safeFiatDestinationResponse` (fiat) — both
 * of those existing internal-safe projections still include `client_id` (correct for an internal
 * caller that already supplied/knows the client_id; wrong for a public response, which must never
 * echo it back — the caller's own authenticated identity already implies it, and a public DTO
 * that carries it would be one more thing to redact everywhere else). This file's own projections
 * never include `client_id`, any IAM/session identifier, provider/staff/screening/risk metadata,
 * policy ids, or raw internal DB fields — an explicit allowlist construction only, never a spread
 * of a raw row.
 */
import { maskAddress, type WalletDestinationRow } from "../safe-response.js";
import type { FiatPayoutDestinationRow } from "../fiat-destination.js";

export interface PublicWalletDestination {
  destination_id: string;
  destination_type: "wallet";
  status: string;
  chain: string;
  network: string;
  address_masked: string;
  memo_tag_present: boolean;
  wallet_type: string;
  beneficiary_relationship: string;
  created_at_utc: string;
}

export function publicWalletDestinationResponse(row: WalletDestinationRow): PublicWalletDestination {
  return {
    destination_id: row.destination_id,
    destination_type: "wallet",
    status: row.status,
    chain: row.chain,
    network: row.network,
    address_masked: maskAddress(row.canonical_address),
    memo_tag_present: row.memo_tag_identity.length > 0,
    wallet_type: row.wallet_type,
    beneficiary_relationship: row.beneficiary_relationship,
    created_at_utc: row.created_at_utc,
  };
}

export interface PublicFiatPayoutDestination {
  destination_id: string;
  destination_type: "fiat_payout";
  status: string;
  bank_country: string;
  currency: string;
  rail: string;
  bank_identifier: string;
  branch_identifier: string | null;
  account_identifier_masked: string;
  beneficiary_type: string;
  created_at_utc: string;
}

export function publicFiatDestinationResponse(row: FiatPayoutDestinationRow): PublicFiatPayoutDestination {
  return {
    destination_id: row.destination_id,
    destination_type: "fiat_payout",
    status: row.status,
    bank_country: row.bank_country,
    currency: row.currency,
    rail: row.rail,
    bank_identifier: row.bank_identifier,
    branch_identifier: row.branch_identifier,
    account_identifier_masked: row.account_identifier_masked,
    beneficiary_type: row.beneficiary_type,
    created_at_utc: row.created_at_utc,
  };
}

export type PublicDestination = PublicWalletDestination | PublicFiatPayoutDestination;
