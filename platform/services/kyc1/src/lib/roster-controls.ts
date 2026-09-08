/**
 * KYC-01 Phase 2B/4B/4A.2B — shared roster-completeness business constants + the application-scoped
 * advisory lock, extracted from `routes/outcome-publication.ts` so `routes/roster-sync.ts` (Phase
 * 4A.2B) can use the SAME values without importing from a route module. One definition, two
 * callers — never a second, independently-maintained copy of either.
 *
 * LOCK NAMESPACE — deliberately UNCHANGED (`kyc1.outcome_publication:<application_id>`), not
 * renamed for this phase. It now serialises every application-scoped KYC case-set evaluation AND
 * mutation for a given application: outcome publication, outcome delivery (both Phase 2B/4B,
 * unchanged), and roster sync (Phase 4A.2B, new). Keeping the original key string means publish/
 * deliver and roster-sync are fully serialized against each other with zero additional lock
 * plumbing — a roster-sync commit is always fully visible (or fully absent) to the very next
 * publish/deliver call for the same application, and vice versa.
 */
import type { Sql } from "@aix/foundation";
import type { Clt1RosterResponse } from "./roster-client.js";

/** The approved Phase 4B compliance decision, reused unchanged by Phase 4A.2B: an `authorised_
 * party` is REQUIRED when its `authority_status` is one of these four values. `rejected`/`revoked`
 * are terminal and never required. */
export const REQUIRED_AUTHORITY_STATUSES = new Set(["pending", "active", "restricted", "suspended"]);

/** Sorted, deduplicated (roster-client already guarantees uniqueness) required `authorised_party_id`
 * set. Pure, no DB/HTTP. Shared verbatim by `publish-outcome` (Phase 4B) and `roster-sync` (Phase
 * 4A.2B) — the two routes must never derive two different required sets from the same roster. */
export function requiredPartyIdsFromRoster(roster: Clt1RosterResponse): string[] {
  return roster.authorisedParties.filter((p) => REQUIRED_AUTHORITY_STATUSES.has(p.authorityStatus)).map((p) => p.authorisedPartyId);
}

/** MUST be the first statement inside the transaction, and MUST NOT be held across an HTTP call —
 * see this file's own header comment for the widened meaning as of Phase 4A.2B. */
export async function takeKycApplicationLock(client: Sql, applicationId: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`kyc1.outcome_publication:${applicationId}`]);
}
