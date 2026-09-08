/**
 * CLT-01 Phase 4A — pure application-keyed KYC-roster contract logic (canonical ordering,
 * duplicate/cap validation, primary-subject mapping, CLT-owned roster hash). No DB access, no
 * HTTP — routes/kyc-roster.ts is the only caller. Kept pure and DB-free so every rule here is
 * unit-testable without a database, the same discipline lib/authorised-parties.ts /
 * lib/related-party-edges.ts / lib/duplicate-candidates.ts already established.
 *
 * PHASE 4A.1 EXCEPTION to the above (atomic KYC outcome receipt + approval roster binding,
 * migration `047_clt1_atomic_kyc_roster_binding.cjs`): the two functions at the bottom of this
 * file, `acquireKycRosterLock` and `fetchCurrentRosterHash`, ARE DB-touching — this is the one
 * deliberate exception to the file's own pure/DB-free discipline. They exist so
 * `routes/outcomes.ts`'s KYC/KYB outcome receipt and `routes/decisions.ts`'s `approve/apply` can
 * both read-and-hash the CURRENT roster from inside their own locked transaction (via a
 * `PoolClient`-compatible `Sql`) using the EXACT SAME canonicalisation/hash logic
 * `routes/kyc-roster.ts`'s GET route already uses — never a second, drifting reimplementation of
 * `assertRosterWithinCap`/`canonicaliseRosterParties`/`computeRosterHash`/`buildKycRosterResponse`
 * above. See those two functions' own doc comments for why this closes the confirmed,
 * empirically-reproduced TOCTOU between a KYC-01 roster read and CLT-01's outcome acceptance (the
 * KYC-01 Phase 4 delivery-atomicity planning amendment).
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS (the chronological inversion Phase 4A removes)
 * ---------------------------------------------------------------------------------------
 * CLT-01 already stores the authorised-party roster (`clt1.authorised_party`, migration 025,
 * APPLICATION-scoped). But the only route that reads it —
 * `GET /internal/clt1/clients/:client_id/authorised-parties` — is CLIENT-keyed and gated by
 * `fetchActiveClientOrThrow`, which requires a `clt1.client_profile` row at
 * `status='active_limited'`. `client_profile` is inserted ONLY at final approval
 * (routes/decisions.ts's approve/apply), in the same transaction that sets
 * `client_application.status='approved'` and populates `client_id`.
 *
 * A downstream CDD module (KYC-01) does its work, publishes, and delivers while the application
 * is still `under_review` — i.e. BEFORE any `client_profile` exists and before any `client_id` is
 * assigned. So the existing roster read is chronologically unavailable at exactly the moment the
 * roster is needed: it can only be called after the approval it is supposed to inform. This
 * module supplies the application-keyed, pre-approval, PII-free read that removes that inversion.
 *
 * ---------------------------------------------------------------------------------------
 * SCOPE BOUNDARY — CLT-01 reports FACTS, it does not evaluate KYC COMPLETENESS
 * ---------------------------------------------------------------------------------------
 * Every `authorised_party` row for the application is returned, in every `authority_status`
 * (`pending`/`active`/`restricted`/`rejected`/`revoked`/`suspended`). CLT-01 deliberately applies
 * NO status filter: deciding which authority statuses a KYC result must cover is a KYC-01
 * compliance judgement, and silently pre-filtering here would make that judgement invisibly on
 * KYC-01's behalf. CLT-01's contract is "here is the complete, current factual roster, and here
 * is a digest of it"; nothing more.
 *
 * ---------------------------------------------------------------------------------------
 * ROSTER HASH — CLT-owned, content-addressed, deliberately NOT a version counter
 * ---------------------------------------------------------------------------------------
 * `roster_hash` is computed by CLT-01 (the source of truth) over the canonical roster content
 * itself, via `@aix/foundation`'s shared `fingerprint()` (key-sorted canonical JSON + sha256,
 * `sha256:`-prefixed). Two consequences that matter:
 *
 *   1. NO `roster_version` COLUMN IS NEEDED. A monotonic counter would require touching all four
 *      already-accepted `authorised_party` maker-checker apply paths (add/update/remove/activate)
 *      plus a migration — real regression risk in a completed module, for a diagnostic
 *      convenience the hash already subsumes. Phase 4A therefore adds no migration and no schema
 *      change at all.
 *   2. THE "SAME VERSION, DIFFERENT CONTENTS" DRIFT CLASS IS STRUCTURALLY IMPOSSIBLE. The digest
 *      IS the content, so a roster that differs in any hashed field cannot present the same
 *      digest. A counter could; a content hash cannot.
 *
 * Each party's own `version` is inside the hash input, so an in-place amendment (which changes
 * neither roster membership nor `authority_status`) still changes `roster_hash` — correct,
 * because an amendment can change WHO the party is.
 *
 * `party_count` is deliberately EXCLUDED from the hash input: it is derived from the array's own
 * length, and hashing a derived value alongside its source adds no discriminating power while
 * creating a second place for the two to disagree. Timestamps, `request_id`, `correlation_id`,
 * `party_reference`, `ownership_percentage` and every other mutable/PII/per-request field are
 * excluded for the same reason `config_integrity_seal`'s own allow-list excludes them: a digest
 * that changes when nothing semantic changed is a false drift signal.
 *
 * ---------------------------------------------------------------------------------------
 * CANONICAL ORDERING — codepoint, never timestamp (CFG-01 F-1 lesson, applied up front)
 * ---------------------------------------------------------------------------------------
 * Parties are ordered by `authorised_party_id` ASC using `codePointCompare` — a
 * locale-INDEPENDENT comparison, CLT-01's own copy of the comparator CFG-01 adopted when its
 * `localeCompare`-based seal ordering was found capable of producing a false `hash_mismatch`
 * under a differing `LC_COLLATE` (CFG-01 F-1). The sort is performed HERE, in application code,
 * rather than being trusted to the database's `ORDER BY` collation, so the ordering that feeds
 * the hash is provably independent of the server's collation settings.
 *
 * `created_at_utc` — the ordering the existing client-keyed list route uses — is explicitly NOT
 * used: `timestamptz` values can tie, and a tie makes the resulting digest non-deterministic.
 * `authorised_party_id` is `UNIQUE` at the DB level (migration 025), so it is a total order.
 *
 * ---------------------------------------------------------------------------------------
 * COMPLETE-OR-ERROR — never paginated, never truncated
 * ---------------------------------------------------------------------------------------
 * A completeness proof computed over a partial page is worse than no proof at all, so this
 * contract has no pagination, no cursor, and no truncation. Above `KYC_ROSTER_MAX_PARTIES` the
 * request fails explicitly with `CLT1_KYC_ROSTER_TOO_LARGE` and NO hash is computed. See
 * `assertRosterWithinCap`.
 */
import { AppError, fingerprint, query, type Sql } from "@aix/foundation";
import { Clt1Error } from "./errors.js";
import type { AuthorityStatus, AuthorisedPartyType } from "./authorised-parties.js";

/**
 * Hard upper bound on the number of `authorised_party` rows this contract will serve for one
 * application. Not a page size — a refusal threshold. Chosen well above any plausible real
 * corporate/institutional ownership structure so it is a resource guard, never an operational
 * limit.
 */
export const KYC_ROSTER_MAX_PARTIES = 500;

/** KYC-01's primary-subject anchor kinds. `individual` and `entity` are the only two — CLT-01's
 * three `applicant_type` values collapse onto them (see `primarySubjectTypeForApplicantType`). */
export const PRIMARY_SUBJECT_TYPES = ["individual", "entity"] as const;
export type PrimarySubjectType = (typeof PRIMARY_SUBJECT_TYPES)[number];

export type ApplicantType = "individual" | "corporate" | "institutional";

/** The exact, PII-free per-party projection this contract exposes and hashes. Deliberately a
 * strict SUBSET of `safeAuthorisedPartyResponse`'s already-non-PII field set — `ownership_
 * percentage`, `sec_audit_ref`, `last_screened_at_utc`, `screening_source_module` and both
 * screening-status columns are omitted because nothing in a roster-completeness proof needs them,
 * and every field NOT sent is a field that cannot leak. `party_reference` (the declared
 * name/identity string, PII) is never selected from the database at all by this contract. */
export interface KycRosterParty {
  authorised_party_id: string;
  party_type: AuthorisedPartyType;
  authority_status: AuthorityStatus;
  version: number;
}

export interface KycRosterResponse {
  application_id: string;
  application_status: string;
  primary_subject_type: PrimarySubjectType;
  authorised_parties: KycRosterParty[];
  party_count: number;
  roster_hash: string;
}

/**
 * Locale-INDEPENDENT string ordering — CLT-01's own copy of the comparator CFG-01 introduced when
 * closing its F-1 finding (`services/cfg1/src/lib/canonical.ts`). Mirrored rather than imported:
 * a cross-service import would violate the F3(c) module-import boundary this module proves.
 * JavaScript's own `<`/`>` on strings compare UTF-16 code units and are unaffected by
 * `LC_COLLATE`/ICU locale data, unlike `String.prototype.localeCompare`.
 */
export function codePointCompare(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Maps CLT-01's own `client_application.applicant_type` onto KYC-01's primary-subject anchor
 * kind. `corporate` and `institutional` both collapse to `entity`: the distinction is a CLT-01
 * classification concern (it drives the CFG-01 onboarding gate), not a CDD-anchor concern.
 *
 * `applicant_type` itself is NOT returned by this contract — returning both would give a consumer
 * two fields to disagree about and would push CLT-01's classification vocabulary into a KYC
 * anchor decision. The mapping is resolved once, here, and only the result crosses the boundary.
 */
export function primarySubjectTypeForApplicantType(applicantType: ApplicantType): PrimarySubjectType {
  return applicantType === "individual" ? "individual" : "entity";
}

/**
 * Throws `CLT1_KYC_ROSTER_TOO_LARGE` (409) if the roster exceeds `KYC_ROSTER_MAX_PARTIES`. No
 * hash is computed and no partial page is returned — the request fails outright.
 *
 * The error-model gap flagged at the end of the initial Phase 4A implementation pass — this
 * condition previously reused `CLT1_APPLICATION_INVALID_STATE`, whose catalogue message
 * inaccurately describes an application-status problem — is closed by `CLT1_KYC_ROSTER_TOO_LARGE`
 * (`lib/errors.ts`'s own Phase 4A doc-comment section has the full history).
 *
 * `details` is deliberately bounded and non-PII: `reason_code` names the condition,
 * `maximum_party_count` is the configured cap, and `observed_at_least` is fixed at
 * `KYC_ROSTER_MAX_PARTIES + 1` rather than the caller's own `partyCount` — the route's `LIMIT
 * KYC_ROSTER_MAX_PARTIES + 1` means the true row count is never read at all, so this function
 * must not imply it knows a number it does not have. No authorised_party_id, party_type,
 * authority_status, party_reference, or other roster content ever appears here.
 */
export function assertRosterWithinCap(partyCount: number): void {
  if (partyCount > KYC_ROSTER_MAX_PARTIES) {
    throw new Clt1Error("CLT1_KYC_ROSTER_TOO_LARGE", {
      details: [
        {
          field: "authorised_parties",
          issue: `reason_code=roster_too_large maximum_party_count=${KYC_ROSTER_MAX_PARTIES} observed_at_least=${KYC_ROSTER_MAX_PARTIES + 1}`,
        },
      ],
    });
  }
}

/**
 * Returns the roster sorted by `authorised_party_id` ASC (codepoint), rejecting a duplicate
 * `authorised_party_id` as malformed internal state.
 *
 * The duplicate check is defensive, not reachable through this route: `authorised_party.
 * authorised_party_id` carries a DB-level `UNIQUE` constraint (migration 025), so a duplicate
 * would mean CLT-01's own storage invariant has been violated. It is validated anyway — a
 * completeness contract that silently hashed a duplicated roster would attest to a roster that
 * cannot exist. `INTERNAL_ERROR` (500) is deliberate for this case rather than a 4xx: nothing a
 * caller sends can cause it and nothing a caller does can fix it.
 */
export function canonicaliseRosterParties(parties: readonly KycRosterParty[]): KycRosterParty[] {
  const sorted = [...parties].sort((a, b) => codePointCompare(a.authorised_party_id, b.authorised_party_id));
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.authorised_party_id === sorted[i - 1]!.authorised_party_id) {
      throw new AppError("INTERNAL_ERROR", {
        details: [{ field: "authorised_party_id", issue: "duplicate authorised_party_id in roster; roster is malformed" }],
      });
    }
  }
  return sorted;
}

/**
 * The EXACT hash input. Written as one explicit object literal rather than assembled from the
 * response object, so that adding a field to the response can never silently change the digest
 * (and vice versa) without an intentional edit here. `fingerprint()` sorts object keys itself, so
 * the declaration order below is irrelevant; ARRAY order is not, which is why `parties` must
 * already be canonicalised.
 */
export function computeRosterHash(input: {
  application_id: string;
  application_status: string;
  primary_subject_type: PrimarySubjectType;
  parties: readonly KycRosterParty[];
}): string {
  return fingerprint({
    application_id: input.application_id,
    application_status: input.application_status,
    primary_subject_type: input.primary_subject_type,
    authorised_parties: input.parties.map((p) => ({
      authorised_party_id: p.authorised_party_id,
      party_type: p.party_type,
      authority_status: p.authority_status,
      version: p.version,
    })),
  });
}

/**
 * The single assembly point for the whole contract: cap check -> canonicalise -> hash -> project.
 * Every field the route returns is produced here, so the route itself holds no shaping logic and
 * the entire contract is exercisable without a database.
 */
export function buildKycRosterResponse(input: {
  application_id: string;
  application_status: string;
  applicant_type: ApplicantType;
  parties: readonly KycRosterParty[];
}): KycRosterResponse {
  assertRosterWithinCap(input.parties.length);
  const primary_subject_type = primarySubjectTypeForApplicantType(input.applicant_type);
  const authorised_parties = canonicaliseRosterParties(input.parties);
  const roster_hash = computeRosterHash({
    application_id: input.application_id,
    application_status: input.application_status,
    primary_subject_type,
    parties: authorised_parties,
  });
  return {
    application_id: input.application_id,
    application_status: input.application_status,
    primary_subject_type,
    authorised_parties,
    party_count: authorised_parties.length,
    roster_hash,
  };
}

/**
 * ---------------------------------------------------------------------------------------
 * PHASE 4A.1 — shared application-scoped advisory lock (see this file's own header comment).
 * ---------------------------------------------------------------------------------------
 * A `pg_advisory_xact_lock` — automatically released at the enclosing transaction's COMMIT or
 * ROLLBACK, never held beyond it. Every transaction that can change any field this module's
 * `roster_hash` is computed over (`authorised_party` membership/`party_type`/`authority_status`/
 * `version`, or `client_application.status`) MUST call this as its OWN FIRST STATEMENT, before any
 * row lock (`FOR UPDATE`) or mutation — never after. This is what makes the lock deadlock-free:
 * no participating transaction can be holding a row lock while waiting for the advisory lock, so
 * no cycle can form (see routes/outcomes.ts, routes/decisions.ts, and
 * routes/authorised-parties.ts's own call sites for the exact ordering proof at each site).
 *
 * `applicationId` is ALWAYS passed as a bound parameter to `hashtext($1)`, never interpolated into
 * the SQL string — `hashtext` runs entirely inside Postgres, so this carries no injection risk
 * either way, but every query in this codebase is parameterized uniformly on principle (the same
 * discipline the Phase 4 Opus review's L2 finding enforced for `authorised-parties.ts`).
 *
 * The lock key is namespaced (`clt1.kyc_roster:<application_id>`) so it can never collide with a
 * lock key some other, unrelated future feature might introduce under a different prefix.
 */
const KYC_ROSTER_LOCK_KEY_PREFIX = "clt1.kyc_roster:";

export async function acquireKycRosterLock(sql: Sql, applicationId: string): Promise<void> {
  await query(sql, `SELECT pg_advisory_xact_lock(hashtext($1))`, [KYC_ROSTER_LOCK_KEY_PREFIX + applicationId]);
}

/**
 * Reads the CURRENT `client_application` + complete `authorised_party` roster via the given `Sql`
 * (a `PoolClient` inside an active transaction, in every real call site) and returns the roster
 * digest — by calling `buildKycRosterResponse` above, never by reimplementing any of its
 * canonicalisation/hashing logic. The caller MUST have already called `acquireKycRosterLock` for
 * the SAME `applicationId` on the SAME `Sql`/transaction before invoking this function — that lock
 * is what makes "current" mean something: without it, this is just an ordinary, non-atomic read,
 * no different from the Phase 4A GET route's own two-statement, non-snapshot-consistent read (see
 * that route's own LOW-1 finding). With the lock held, no OTHER lock-respecting transaction can be
 * concurrently mutating the roster, so this read is effectively atomic with respect to every
 * mutation path that participates in the same lock discipline.
 *
 * Deliberately does NOT accept a caller-supplied `application_status`/`applicant_type` — both are
 * read fresh, here, from the row this function itself locks-and-reads, so a caller cannot
 * accidentally hash a stale value it captured before the lock was acquired.
 *
 * Propagates `CLT1_KYC_ROSTER_TOO_LARGE` unchanged if the roster exceeds `KYC_ROSTER_MAX_PARTIES`
 * (via `buildKycRosterResponse`'s own `assertRosterWithinCap` call) — a receipt or approval against
 * an uncomputable roster must fail exactly the same way the GET route already fails, not silently
 * approve a hash it could never actually have offered the caller in the first place.
 */
export async function fetchCurrentRosterHash(
  sql: Sql,
  applicationId: string,
  application: { application_status: string; applicant_type: ApplicantType },
): Promise<string> {
  const parties = await query<KycRosterParty>(
    sql,
    `SELECT authorised_party_id, party_type, authority_status, version
       FROM clt1.authorised_party
      WHERE application_id = $1
      ORDER BY authorised_party_id ASC
      LIMIT $2`,
    [applicationId, KYC_ROSTER_MAX_PARTIES + 1],
  );
  return buildKycRosterResponse({
    application_id: applicationId,
    application_status: application.application_status,
    applicant_type: application.applicant_type,
    parties,
  }).roster_hash;
}
