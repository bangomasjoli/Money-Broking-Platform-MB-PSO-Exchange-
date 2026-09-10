/**
 * WLT-01 Public Client Surface — `GET /wlt1/destinations`, the ONE approved NEW read capability
 * (every other public route is a projection of already-accepted WLT capability). WLT owns this
 * read because WLT owns `wlt1.destination`. Adds NO mutation authority.
 *
 * Client-scoped in SQL, always — `WHERE d.client_id = $1` is applied directly in the query; rows
 * are NEVER fetched across clients and filtered afterward in application code.
 *
 * Allowed filters ONLY: `status`, `destination_type`. No `client_id` filter (the derived client_id
 * IS the scope, not a filter a caller can widen/narrow), no risk/screening/policy/provider/
 * staff/created-by/internal filter of any kind.
 *
 * Stable deterministic order: `created_at_utc ASC, destination_id ASC` — matches
 * `lib/public/cursor.ts`'s own keyset position exactly, so pagination is gap-free and
 * duplicate-free even across same-timestamp rows.
 */
import { query, type Sql } from "@aix/foundation";
import type { WalletDestinationRow } from "../safe-response.js";
import type { FiatPayoutDestinationRow } from "../fiat-destination.js";
import { publicWalletDestinationResponse, publicFiatDestinationResponse, type PublicDestination } from "./dto.js";
import type { CursorPosition } from "./cursor.js";

export interface ListDestinationsFilters {
  status?: string;
  destinationType?: string;
}

export interface ListDestinationsPage {
  destinations: PublicDestination[];
  /** `undefined` when this page is the last one. */
  nextCursor?: CursorPosition;
}

interface JoinedDestinationRow {
  destination_id: string;
  destination_type: string;
  status: string;
  created_at_utc: string;
  // wallet_destination columns (NULL when destination_type <> 'wallet')
  w_chain: string | null;
  w_network: string | null;
  w_canonical_address: string | null;
  w_memo_tag_identity: string | null;
  w_canonicalisation_version: string | null;
  w_wallet_type: string | null;
  w_beneficiary_relationship: string | null;
  w_whitelist_version: number | null;
  w_revocation_epoch: number | null;
  // fiat_payout_destination columns (NULL when destination_type <> 'fiat_payout')
  f_bank_country: string | null;
  f_currency: string | null;
  f_rail: string | null;
  f_bank_identifier: string | null;
  f_branch_identifier: string | null;
  f_account_identifier_masked: string | null;
  f_beneficiary_type: string | null;
  f_destination_status_version: number | null;
  f_whitelist_version: number | null;
}

function projectRow(row: JoinedDestinationRow): PublicDestination | undefined {
  if (row.destination_type === "wallet") {
    if (row.w_chain === null || row.w_network === null || row.w_canonical_address === null || row.w_memo_tag_identity === null || row.w_canonicalisation_version === null || row.w_wallet_type === null || row.w_beneficiary_relationship === null) {
      return undefined; // structurally unreachable (the JOIN always matches for a genuine 'wallet' row) — defensive only
    }
    const walletRow: WalletDestinationRow = {
      destination_id: row.destination_id,
      client_id: "", // never read by publicWalletDestinationResponse — the public DTO never includes it
      destination_type: row.destination_type,
      status: row.status,
      chain: row.w_chain,
      network: row.w_network,
      canonical_address: row.w_canonical_address,
      memo_tag_identity: row.w_memo_tag_identity,
      canonicalisation_version: row.w_canonicalisation_version,
      wallet_type: row.w_wallet_type,
      beneficiary_relationship: row.w_beneficiary_relationship,
      whitelist_version: row.w_whitelist_version ?? 0,
      revocation_epoch: row.w_revocation_epoch ?? 0,
      created_at_utc: row.created_at_utc,
    };
    return publicWalletDestinationResponse(walletRow);
  }
  if (row.destination_type === "fiat_payout") {
    if (row.f_bank_country === null || row.f_currency === null || row.f_rail === null || row.f_bank_identifier === null || row.f_account_identifier_masked === null || row.f_beneficiary_type === null) {
      return undefined; // defensive only, same rationale as above
    }
    const fiatRow: FiatPayoutDestinationRow = {
      destination_id: row.destination_id,
      client_id: "", // never read by publicFiatDestinationResponse
      destination_type: row.destination_type,
      status: row.status,
      destination_status_version: row.f_destination_status_version ?? 1,
      whitelist_version: row.f_whitelist_version ?? 0,
      revocation_epoch: 0,
      beneficiary_name: "",
      beneficiary_name_normalized: "",
      beneficiary_type: row.f_beneficiary_type,
      bank_country: row.f_bank_country,
      bank_identifier: row.f_bank_identifier,
      bank_identifier_type: "bic",
      branch_identifier: row.f_branch_identifier,
      account_identifier_type: "local_account",
      account_identifier_masked: row.f_account_identifier_masked,
      account_identifier_hash: "",
      currency: row.f_currency,
      rail: row.f_rail,
      verification_status: "",
      created_at_utc: row.created_at_utc,
    };
    return publicFiatDestinationResponse(fiatRow);
  }
  return undefined; // unknown/future destination_type — never surfaced publicly until this projection is extended
}

export async function listDestinationsForClient(sql: Sql, clientId: string, filters: ListDestinationsFilters, limit: number, cursor: CursorPosition | undefined): Promise<ListDestinationsPage> {
  const conditions: string[] = ["d.client_id = $1"];
  const params: unknown[] = [clientId];

  if (filters.status !== undefined) {
    params.push(filters.status);
    conditions.push(`d.status = $${params.length}`);
  }
  if (filters.destinationType !== undefined) {
    params.push(filters.destinationType);
    conditions.push(`d.destination_type = $${params.length}`);
  }
  if (cursor !== undefined) {
    params.push(cursor.createdAtUtc, cursor.destinationId);
    conditions.push(`(d.created_at_utc, d.destination_id) > ($${params.length - 1}::timestamptz, $${params.length})`);
  }

  // Fetch one extra row to determine whether a next page exists, without a separate COUNT query.
  const fetchLimit = limit + 1;
  params.push(fetchLimit);

  const rows = await query<JoinedDestinationRow>(
    sql,
    `SELECT d.destination_id, d.destination_type, d.status, d.created_at_utc,
            w.chain AS w_chain, w.network AS w_network, w.canonical_address AS w_canonical_address,
            w.memo_tag_identity AS w_memo_tag_identity, w.canonicalisation_version AS w_canonicalisation_version,
            w.wallet_type AS w_wallet_type, w.beneficiary_relationship AS w_beneficiary_relationship,
            d.whitelist_version AS w_whitelist_version, d.revocation_epoch AS w_revocation_epoch,
            f.bank_country AS f_bank_country, f.currency AS f_currency, f.rail AS f_rail,
            f.bank_identifier AS f_bank_identifier, f.branch_identifier AS f_branch_identifier,
            f.account_identifier_masked AS f_account_identifier_masked, f.beneficiary_type AS f_beneficiary_type,
            d.destination_status_version AS f_destination_status_version, d.whitelist_version AS f_whitelist_version
       FROM wlt1.destination d
       LEFT JOIN wlt1.wallet_destination w ON w.destination_id = d.destination_id
       LEFT JOIN wlt1.fiat_payout_destination f ON f.destination_id = d.destination_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY d.created_at_utc ASC, d.destination_id ASC
      LIMIT $${params.length}`,
    params,
  );

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const destinations = pageRows.map(projectRow).filter((d): d is PublicDestination => d !== undefined);

  let nextCursor: CursorPosition | undefined;
  if (hasMore && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1]!;
    nextCursor = { clientId, createdAtUtc: last.created_at_utc, destinationId: last.destination_id };
  }

  return { destinations, nextCursor };
}

/**
 * `GET /wlt1/destinations/:destination_id` — tenant isolation enforced in SQL
 * (`destination_id = $1 AND client_id = $2`), never fetched by `destination_id` alone and
 * compared in application code. Unknown destination and a foreign-client destination are
 * indistinguishable — both simply return `undefined` — mirroring every other WLT-01 client-scoped
 * route's established enumeration-resistance convention.
 */
export async function fetchDestinationForClient(sql: Sql, destinationId: string, clientId: string): Promise<PublicDestination | undefined> {
  const rows = await query<JoinedDestinationRow>(
    sql,
    `SELECT d.destination_id, d.destination_type, d.status, d.created_at_utc,
            w.chain AS w_chain, w.network AS w_network, w.canonical_address AS w_canonical_address,
            w.memo_tag_identity AS w_memo_tag_identity, w.canonicalisation_version AS w_canonicalisation_version,
            w.wallet_type AS w_wallet_type, w.beneficiary_relationship AS w_beneficiary_relationship,
            d.whitelist_version AS w_whitelist_version, d.revocation_epoch AS w_revocation_epoch,
            f.bank_country AS f_bank_country, f.currency AS f_currency, f.rail AS f_rail,
            f.bank_identifier AS f_bank_identifier, f.branch_identifier AS f_branch_identifier,
            f.account_identifier_masked AS f_account_identifier_masked, f.beneficiary_type AS f_beneficiary_type,
            d.destination_status_version AS f_destination_status_version, d.whitelist_version AS f_whitelist_version
       FROM wlt1.destination d
       LEFT JOIN wlt1.wallet_destination w ON w.destination_id = d.destination_id
       LEFT JOIN wlt1.fiat_payout_destination f ON f.destination_id = d.destination_id
      WHERE d.destination_id = $1 AND d.client_id = $2`,
    [destinationId, clientId],
  );
  const row = rows[0];
  if (!row) return undefined;
  return projectRow(row);
}
