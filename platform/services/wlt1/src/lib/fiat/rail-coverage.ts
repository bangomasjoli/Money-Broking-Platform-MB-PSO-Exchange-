/**
 * WLT-01 Fiat Payout Destinations (APAC) — deny-by-default technical-support + operational-
 * activation read helper for `wlt1.fiat_rail_coverage`. Implements the FROZEN architecture
 * exactly. Mirrors `lib/chain-coverage.ts`'s own `fetchActiveChainCoverage` shape (structural
 * convention only — the two tables are independent; a fiat corridor's activation state has no
 * relationship to any chain's).
 *
 * Runtime is READ-ONLY against this table (`infra/grants/wlt1_runtime_grants.sql` — SELECT only,
 * no INSERT/UPDATE/DELETE) — the four dormant seed rows are written exclusively by migration 061
 * under the migration role; a live corridor activation is likewise migration-only, never
 * application-writable. `fetchActiveFiatRailCoverage` requires BOTH `coverage_status='supported'`
 * AND `activation_status='active'` — a technically-supported-but-inactive corridor (the shipped
 * default for all four APAC markets) fails this read exactly like an unsupported one; callers
 * needing to distinguish the two (none do, this phase) would need a separate query.
 */
import type { Sql } from "@aix/foundation";
import { query } from "@aix/foundation";

export interface FiatRailCoverageRow {
  coverage_id: string;
  rail: string;
  bank_country: string;
  currency: string;
  account_identifier_type: string;
  bank_identifier_type: string;
  coverage_status: string;
  activation_status: string;
  policy_version: number;
}

export async function fetchActiveFiatRailCoverage(sql: Sql, rail: string, bankCountry: string, currency: string): Promise<FiatRailCoverageRow | undefined> {
  const rows = await query<FiatRailCoverageRow>(
    sql,
    `SELECT coverage_id, rail, bank_country, currency, account_identifier_type, bank_identifier_type, coverage_status, activation_status, policy_version
       FROM wlt1.fiat_rail_coverage
      WHERE rail = $1 AND bank_country = $2 AND currency = $3 AND coverage_status = 'supported' AND activation_status = 'active'`,
    [rail, bankCountry, currency],
  );
  return rows[0];
}
