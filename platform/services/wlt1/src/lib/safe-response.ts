/**
 * WLT-01 Phase 1B — the SINGLE safe-projection point for a wallet destination. Both the
 * registration route and the read route build their response through this one function — never a
 * second, independently-maintained ad hoc projection (mirrors AML-01's own `safeScreeningResponse`
 * precedent). A wallet address is Restricted/AML-sensitive data (`16_Data_Classification.md`); the
 * full canonical address is NEVER returned by any Phase 1B API response — only a deterministically
 * masked value.
 */

export interface WalletDestinationRow {
  destination_id: string;
  client_id: string;
  destination_type: string;
  status: string;
  chain: string;
  network: string;
  canonical_address: string;
  memo_tag_identity: string;
  canonicalisation_version: string;
  wallet_type: string;
  beneficiary_relationship: string;
  whitelist_version: number;
  revocation_epoch: number;
  created_at_utc: string;
}

export interface SafeWalletDestinationResponse {
  destination_id: string;
  client_id: string;
  destination_type: string;
  status: string;
  chain: string;
  network: string;
  address_masked: string;
  memo_tag_present: boolean;
  canonicalisation_version: string;
  wallet_type: string;
  beneficiary_relationship: string;
  whitelist_version: number;
  revocation_epoch: number;
  created_at_utc: string;
}

const VISIBLE_PREFIX_LENGTH = 6;
const VISIBLE_SUFFIX_LENGTH = 4;
/** Fixed-length mask — deliberately NOT proportional to the hidden segment's real length, so the
 * mask itself cannot be used to infer how long the underlying address is. */
const FIXED_MASK = "••••••••";

/**
 * Masks a canonical address to `first 6 + fixed mask + last 4`. Minimum-length behaviour: if the
 * address is not longer than `VISIBLE_PREFIX_LENGTH + VISIBLE_SUFFIX_LENGTH` (10 characters), the
 * prefix/suffix windows would overlap or reveal the entire value — the fixed mask alone is
 * returned instead, revealing nothing positional about a short input.
 */
export function maskAddress(address: string): string {
  if (address.length <= VISIBLE_PREFIX_LENGTH + VISIBLE_SUFFIX_LENGTH) {
    return FIXED_MASK;
  }
  return address.slice(0, VISIBLE_PREFIX_LENGTH) + FIXED_MASK + address.slice(-VISIBLE_SUFFIX_LENGTH);
}

export function safeWalletDestinationResponse(row: WalletDestinationRow): SafeWalletDestinationResponse {
  return {
    destination_id: row.destination_id,
    client_id: row.client_id,
    destination_type: row.destination_type,
    status: row.status,
    chain: row.chain,
    network: row.network,
    address_masked: maskAddress(row.canonical_address),
    memo_tag_present: row.memo_tag_identity.length > 0,
    canonicalisation_version: row.canonicalisation_version,
    wallet_type: row.wallet_type,
    beneficiary_relationship: row.beneficiary_relationship,
    whitelist_version: row.whitelist_version,
    revocation_epoch: row.revocation_epoch,
    created_at_utc: row.created_at_utc,
  };
}
