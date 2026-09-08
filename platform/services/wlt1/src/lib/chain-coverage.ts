/**
 * WLT-01 Phase 1B — deny-by-default chain/network format-coverage read helper.
 * `wlt1.chain_coverage` is the AUTHORITATIVE registry — a `(chain, network)` pair is only ever
 * eligible for registration if an `active`/`supported` row exists. Runtime is READ-ONLY against
 * this table (see `infra/grants/wlt1_runtime_grants.sql` — SELECT only, no INSERT/UPDATE/DELETE);
 * the two Phase 1B seed rows are written exclusively by migration 049.
 *
 * Phase 2C-C2 addition: `provider_id` (migration 050) is now selected too — the screening-
 * initiation route resolves its wallet-analytics provider from this same row, never from caller
 * input, so no second query is needed.
 */
import type { Sql } from "@aix/foundation";
import { query } from "@aix/foundation";

export interface ChainCoverageRow {
  chain: string;
  network: string;
  address_format: string;
  canonicalisation_version: string;
  memo_tag_requirement: string;
  coverage_status: string;
  activation_status: string;
  policy_version: number;
  provider_id: string;
}

export async function fetchActiveChainCoverage(sql: Sql, chain: string, network: string): Promise<ChainCoverageRow | undefined> {
  const rows = await query<ChainCoverageRow>(
    sql,
    `SELECT chain, network, address_format, canonicalisation_version, memo_tag_requirement, coverage_status, activation_status, policy_version, provider_id
       FROM wlt1.chain_coverage
      WHERE chain = $1 AND network = $2 AND coverage_status = 'supported' AND activation_status = 'active'`,
    [chain, network],
  );
  return rows[0];
}
