/**
 * CLT-01 — Authenticated Principal -> Client Membership Authority (Implementation-Contract
 * Architecture accepted; Final Implementation-Exactness Micro-Clarification accepted). A
 * READ-ONLY internal resolution seam: given an already-authenticated IAM `user_id`, returns every
 * CLT client membership that principal genuinely governs right now.
 *
 * This route does NOT authenticate the caller, does NOT determine `userClass`, and makes NO IAM
 * call, NO `iam.*`/`iam2.*` query, and NO `iam2.user_role` lookup of any kind (source-guarded —
 * see tests/integration/clt1-principal-membership-route.test.ts's own "no IAM dependency" test).
 * The future authenticated public consumer owns:
 *   - resolving the caller's own IAM session to a live `user_id` (already-accepted IAM-01
 *     `requireUserSession`),
 *   - enforcing `userClass ∈ {client, client_approver}` BEFORE treating this route's result as
 *     client-surface authority — a staff/admin principal holding a CLT membership row gains NO
 *     authority from this route alone.
 *
 * `client_id`, when supplied, is a SELECTOR ONLY, never authority — it can only NARROW the query
 * (`au.client_id = $2`), it can never substitute for `au.iam_user_id = $1`, the sole
 * authority-bearing predicate. Every "no genuine authority" state — unknown `iam_user_id`, an
 * UNBOUND legacy/declared-signatory row (`iam_user_id IS NULL`), inactive/suspended/revoked
 * membership, a client that is pending/suspended/restricted/closed, a foreign or nonexistent
 * client selector — is OBSERVATIONALLY IDENTICAL: HTTP 200, `memberships: []`. Never a 404/403,
 * never an existence flag, never a state-specific reason — this route must never become a
 * client/membership-existence oracle.
 *
 * A genuine service/DB failure is the ONLY case that ever returns something other than a clean
 * 200: `assertPoolAvailable()` fails closed to 503 `CLT1_SERVICE_UNAVAILABLE`, which must never
 * degrade to an empty-but-200 authority result — a healthy "no authority" and an unavailable
 * authority service are deliberately kept distinguishable so a consumer can fail closed on 503.
 *
 * Mutates nothing: no audit event, no membership mutation, no token minting, no session/client
 * state change.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { getPool, query, successEnvelope } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeClt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { safeMembershipResponse, type AuthorisedUserMembershipRow } from "../lib/authorised-users.js";
import { Clt1Error } from "../lib/errors.js";

const PrincipalParams = Type.Object({ iam_user_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const MembershipQuery = Type.Object({ client_id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })) }, { additionalProperties: false });

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Clt1Error("CLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

export async function registerPrincipalMembershipRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeClt1InternalIdentityGuard(app.config.clt1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // GET /internal/clt1/principals/:iam_user_id/client-memberships
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/clt1/principals/:iam_user_id/client-memberships",
    { preHandler: requireInternal, schema: { params: PrincipalParams, querystring: MembershipQuery } },
    async (request, reply) => {
      const { iam_user_id } = request.params as Static<typeof PrincipalParams>;
      const { client_id } = request.query as Static<typeof MembershipQuery>;
      assertPoolAvailable();

      // Authoritative single-snapshot join: membership status and client status are resolved
      // together in ONE query, so no consumer can ever observe a torn state (e.g. an active
      // membership paired with a client that was suspended a moment ago). Deterministic total
      // ordering (authorised_user_id is UNIQUE) — never incidental row order, never an
      // auto-selected "primary" client for a multi-client principal.
      const rows = await query<AuthorisedUserMembershipRow>(
        getPool(),
        `SELECT au.client_id, au.authorised_user_id, au.role, au.status, au.version, cp.status AS client_status
           FROM clt1.authorised_user au
           JOIN clt1.client_profile cp ON cp.client_id = au.client_id
          WHERE au.iam_user_id = $1
            AND au.status = 'active'
            AND cp.status IN ('active', 'active_limited')
            AND ($2::varchar IS NULL OR au.client_id = $2)
          ORDER BY au.client_id ASC, au.authorised_user_id ASC`,
        [iam_user_id, client_id ?? null],
      );

      return reply.send(
        successEnvelope({ iam_user_id, resolved_at_utc: request.ctx.server_time_utc, memberships: rows.map(safeMembershipResponse) }, meta(request)),
      );
    },
  );
}
