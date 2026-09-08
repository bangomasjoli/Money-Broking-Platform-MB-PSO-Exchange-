/**
 * CLT-01 Phase 4A — the application-keyed KYC roster contract. Exactly one route:
 *
 *   GET /internal/clt1/applications/:application_id/kyc-roster
 *
 * See lib/kyc-roster.ts's header for WHY this exists (the chronological inversion in the existing
 * client-keyed roster read) and for the canonical-ordering / hash / complete-or-error rules. This
 * file holds only the auth posture, the two reads, and the lookup semantics.
 *
 * ---------------------------------------------------------------------------------------
 * AUTHENTICATION — internal service identity only; no human actor is accepted at all
 * ---------------------------------------------------------------------------------------
 * Guarded by `makeClt1InternalIdentityGuard` and nothing else. NO IAM-02 `checkPermission` call,
 * NO `actor_id` query parameter, no caller-asserted human identity anywhere.
 *
 * This deliberately follows `routes/outcomes.ts`'s own service-to-service precedent — the
 * `POST .../outcomes` CDD-outcome receipt and `GET .../handoff-status` are internal-identity-only
 * for exactly this reason, while `GET .../outcome-status` IS IAM-02-gated because it is a human
 * operator's read. This route is a machine read on a machine path: a downstream CDD module calls
 * it as part of its own control flow, with no human in the loop. Bolting `actor_id` onto it would
 * manufacture a caller-asserted identity that no human ever supplied and that the interim
 * shared-token model cannot authenticate — strictly worse than having none.
 *
 * The empty querystring schema (`additionalProperties: false`) makes that structural rather than
 * conventional: a request carrying `?actor_id=...` is REJECTED, so the route cannot quietly grow
 * an actor-trust surface later without an explicit schema change.
 *
 * ---------------------------------------------------------------------------------------
 * LOOKUP — application-keyed, with NO client_profile dependency
 * ---------------------------------------------------------------------------------------
 * Keyed directly by `clt1.client_application.application_id`. It does NOT resolve a `client_id`,
 * does NOT read `clt1.client_profile`, and does NOT call `fetchActiveClientOrThrow` (the
 * `active_limited` gate every Phase 3-6 client-scoped route uses). It therefore works while the
 * application is `under_review` with no `client_profile` row in existence — which is the entire
 * point of Phase 4A.
 *
 * NO STATUS RESTRICTION IS APPLIED. `validateTransition` is deliberately not called: this is a
 * read, not a lifecycle action, and gating it on a status list would bake a consumer's eligibility
 * policy into CLT-01. `application_status` is RETURNED instead, so the consuming KYC control can
 * decide for itself whether the application is currently in a state its own rules accept.
 *
 * An unknown `application_id` returns `CLT1_APPLICATION_NOT_FOUND` (404) via the shared
 * `applicationNotFound()` helper — never `CLT1_CLIENT_NOT_FOUND`. Nothing in the response or the
 * error path reveals whether a `client_profile` exists, because this route never looks.
 *
 * ---------------------------------------------------------------------------------------
 * READS — column-scoped, PII never materialised
 * ---------------------------------------------------------------------------------------
 * Both SELECTs name their columns explicitly; neither uses `SELECT *`. `party_reference` (the
 * declared party name/identity, PII) and the application's own PII columns (`legal_name`,
 * `applicant_email`, `registration_number`, `country_of_incorporation`) are never read into this
 * process at all, so there is no projection step that could accidentally omit a redaction.
 *
 * The party read is bounded by `LIMIT KYC_ROSTER_MAX_PARTIES + 1`: fetching one row beyond the cap
 * is what makes "over the cap" detectable without ever materialising an unbounded result set, and
 * `assertRosterWithinCap` then REFUSES rather than truncating. The `+ 1` row is never returned and
 * never hashed.
 *
 * This route writes nothing: no INSERT, no UPDATE, no transaction, and no audit/outbox event. A
 * non-mutating internal machine read has nothing to make durable, and emitting an outbox event per
 * roster read would put an unbounded, self-inflicted write load on the audit path. (The consuming
 * module records the roster digest it acted on in its own evidence, which is where that fact
 * belongs.)
 */
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { getPool, query, successEnvelope } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeClt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { applicationNotFound } from "../lib/applications.js";
import { Clt1Error } from "../lib/errors.js";
import { KYC_ROSTER_MAX_PARTIES, buildKycRosterResponse, type ApplicantType, type KycRosterParty } from "../lib/kyc-roster.js";

const ApplicationIdParams = Type.Object({ application_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

/** Structurally rejects `?actor_id=...` (and anything else) — see the file header. */
const NoQuery = Type.Object({}, { additionalProperties: false });

interface RosterApplicationRow {
  application_id: string;
  applicant_type: ApplicantType;
  status: string;
}

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Clt1Error("CLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

export async function registerKycRosterRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeClt1InternalIdentityGuard(app.config.clt1InternalServiceToken);

  app.get(
    "/internal/clt1/applications/:application_id/kyc-roster",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, querystring: NoQuery } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      assertPoolAvailable();

      const applicationRows = await query<RosterApplicationRow>(
        getPool(),
        `SELECT application_id, applicant_type, status FROM clt1.client_application WHERE application_id = $1`,
        [application_id],
      );
      const application = applicationRows[0];
      if (!application) applicationNotFound();

      // ORDER BY here only bounds WHICH rows the LIMIT window would take if the cap were ever
      // exceeded; the authoritative, collation-independent ordering that feeds the hash is
      // applied by `canonicaliseRosterParties` in application code (see lib/kyc-roster.ts).
      const parties = await query<KycRosterParty>(
        getPool(),
        `SELECT authorised_party_id, party_type, authority_status, version
           FROM clt1.authorised_party
          WHERE application_id = $1
          ORDER BY authorised_party_id ASC
          LIMIT $2`,
        [application_id, KYC_ROSTER_MAX_PARTIES + 1],
      );

      const roster = buildKycRosterResponse({
        application_id: application.application_id,
        application_status: application.status,
        applicant_type: application.applicant_type,
        parties,
      });

      return reply.send(successEnvelope(roster, meta(request)));
    },
  );
}
