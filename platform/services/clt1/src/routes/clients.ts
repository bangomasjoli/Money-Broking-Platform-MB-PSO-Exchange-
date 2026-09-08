/**
 * CLT-01 Phase 2 — client status route (blueprint `04_API_Specification.md` §3.5). The only
 * `clt1.client_profile`-reading route this phase, reachable now that `approve/apply`
 * (routes/decisions.ts) is the first code path that can ever produce a row.
 *
 * Internal-identity-guarded only, NOT IAM-02-permission-gated — blueprint §3.5 frames this
 * explicitly as "internal current client status check for downstream modules", a
 * service-to-service read, not a human-permission-checked action (same posture routes/
 * outcomes.ts's outcome-receipt/handoff routes use for the identical dependency shape).
 *
 * Returns ONLY `client_id`/`status`/`client_class`/`created_at_utc` — never `legal_name`/
 * `registration_number`/`country_of_incorporation`, even though `client_profile` stores them
 * (approved Phase 2 design decision: no PII-returning route anywhere this phase).
 *
 * Phase 3 addition: `mandate_configured`/`authorised_users_configured` — additive,
 * non-breaking capability-readiness booleans ("≥1 active mandate exists" / "≥1 active
 * authorised_user exists"), NOT an active-transaction-capability status. `client_profile.status`
 * itself is untouched by this file and stays `active_limited` — no route in this codebase ever
 * writes `'active'` (approved Phase 3 design decision: authorised users and mandates are
 * necessary but not sufficient for real capability; wallet/deposit/withdrawal/trading modules and
 * the actual KYC/AML screening engines don't exist yet).
 *
 * Phase 4 addition: `authorised_parties_configured` — same additive-boolean shape ("≥1
 * authorised_party with authority_status='active' exists"). `authorised_party` is
 * APPLICATION-scoped, not client-scoped (see lib/authorised-parties.ts header comment), so this
 * count queries via `client_profile.application_id`, not `client_id`.
 *
 * Phase 5 addition: `GET .../clients/:client_id/related-parties` (blueprint
 * `04_API_Specification.md` §6.3's own literal route, the only related-party route the blueprint
 * documents at all). `clt1.related_party_edge` has no owning-scope column (see
 * lib/related-party-edges.ts header comment), so this route resolves the client's own known node
 * identities (`client_id`, `application_id`, and every `authorised_party_id` on that application)
 * and returns `active` edges touching ANY of them in either direction — a bounded, single-hop
 * lookup, explicitly NOT graph traversal (no recursion, no multi-hop). Does NOT add a
 * `related_parties_configured` boolean to the status route above (approved Phase 5 design
 * decision — deferred; computing it correctly would fold in the same multi-node-identity lookup
 * this read route already performs, which is graph-adjacent complexity kept out of the simple
 * status-boolean shape Phase 3/4 established).
 */
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { getPool, query, successEnvelope } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeClt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { checkPermission, type Iam2ClientConfig } from "../lib/iam2-client.js";
import { safeRelatedPartyEdgeResponse, type RelatedPartyEdgeRow } from "../lib/related-party-edges.js";
import { Clt1Error } from "../lib/errors.js";
import type { Clt1Config } from "../config.js";

const ClientIdParams = Type.Object({ client_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const RelatedPartiesQuery = Type.Object({ actor_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

interface ClientStatusRow {
  client_id: string;
  status: string;
  client_class: string;
  created_at_utc: string;
  application_id: string;
}

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Clt1Error("CLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function iam2Config(app: FastifyInstance): Iam2ClientConfig {
  const config = app.config as Clt1Config;
  return { baseUrl: config.iam2BaseUrl, internalServiceToken: config.iam2InternalServiceToken, fetchImpl: config.iam2FetchImpl };
}

interface ClientProfileRefRow {
  client_id: string;
  status: string;
  application_id: string;
}

export async function registerClientRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeClt1InternalIdentityGuard(app.config.clt1InternalServiceToken);

  app.get(
    "/internal/clt1/clients/:client_id/status",
    { preHandler: requireInternal, schema: { params: ClientIdParams } },
    async (request, reply) => {
      const { client_id } = request.params as { client_id: string };
      assertPoolAvailable();

      const rows = await query<ClientStatusRow>(
        getPool(),
        `SELECT client_id, status, client_class, created_at_utc, application_id FROM clt1.client_profile WHERE client_id = $1`,
        [client_id],
      );
      const row = rows[0];
      if (!row) throw new Clt1Error("CLT1_CLIENT_NOT_FOUND");

      const [mandateRows, authorisedUserRows, authorisedPartyRows] = await Promise.all([
        query<{ count: string }>(getPool(), `SELECT count(*) FROM clt1.client_mandate WHERE client_id = $1 AND status = 'active'`, [client_id]),
        query<{ count: string }>(getPool(), `SELECT count(*) FROM clt1.authorised_user WHERE client_id = $1 AND status = 'active'`, [client_id]),
        query<{ count: string }>(getPool(), `SELECT count(*) FROM clt1.authorised_party WHERE application_id = $1 AND authority_status = 'active'`, [row.application_id]),
      ]);

      return reply.send(
        successEnvelope(
          {
            client_id: row.client_id,
            status: row.status,
            client_class: row.client_class,
            created_at_utc: row.created_at_utc,
            mandate_configured: Number(mandateRows[0]?.count ?? "0") > 0,
            authorised_users_configured: Number(authorisedUserRows[0]?.count ?? "0") > 0,
            authorised_parties_configured: Number(authorisedPartyRows[0]?.count ?? "0") > 0,
          },
          meta(request),
        ),
      );
    },
  );

  // -------------------------------------------------------------------------------------------
  // GET /internal/clt1/clients/:client_id/related-parties (blueprint §6.3's own literal route)
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/clt1/clients/:client_id/related-parties",
    { preHandler: requireInternal, schema: { params: ClientIdParams, querystring: RelatedPartiesQuery } },
    async (request, reply) => {
      const { client_id } = request.params as { client_id: string };
      const { actor_id } = request.query as { actor_id: string };
      assertPoolAvailable();

      const profileRows = await query<ClientProfileRefRow>(getPool(), `SELECT client_id, status, application_id FROM clt1.client_profile WHERE client_id = $1`, [client_id]);
      const profile = profileRows[0];
      if (!profile) throw new Clt1Error("CLT1_CLIENT_NOT_FOUND");
      if (profile.status !== "active_limited") throw new Clt1Error("CLT1_CLIENT_NOT_ACTIVE");

      const baseline = await checkPermission(iam2Config(app), { actorId: actor_id, action: "clt1.related_party.read", resource: "related_party_edge", entityId: client_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const partyRows = await query<{ authorised_party_id: string }>(getPool(), `SELECT authorised_party_id FROM clt1.authorised_party WHERE application_id = $1`, [profile.application_id]);
      const partyIds = partyRows.map((r) => r.authorised_party_id);

      // Bounded, single-hop lookup — every clause below matches edges touching one of THIS
      // client's own already-known node identities (client_id/application_id/its own
      // authorised_party_ids), in either direction. No recursion, no multi-hop, no graph
      // traversal of any kind.
      const edgeRows = await query<RelatedPartyEdgeRow>(
        getPool(),
        `SELECT * FROM clt1.related_party_edge
         WHERE status = 'active'
           AND (
             (from_entity_type = 'client' AND from_entity_id = $1) OR (to_entity_type = 'client' AND to_entity_id = $1)
             OR (from_entity_type = 'application' AND from_entity_id = $2) OR (to_entity_type = 'application' AND to_entity_id = $2)
             OR (from_entity_type = 'party' AND from_entity_id = ANY($3)) OR (to_entity_type = 'party' AND to_entity_id = ANY($3))
           )
         ORDER BY created_at_utc ASC`,
        [client_id, profile.application_id, partyIds],
      );

      return reply.send(successEnvelope({ client_id, related_parties: edgeRows.map(safeRelatedPartyEdgeResponse) }, meta(request)));
    },
  );
}
