/**
 * WLT-01 Public Client Surface — `GET /wlt1/destinations` (list, the one approved NEW read
 * capability) and `GET /wlt1/destinations/:destination_id` (single read, a safe projection of the
 * already-accepted internal read capability).
 *
 * Both routes: requirePublicClientAuthority -> FND-01 rate-limit check -> read. No mutation, no
 * Idempotency-Key (GETs never require one, same convention as every other WLT-01 read route).
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { AppError, getPool, successEnvelope } from "@aix/foundation";
import { meta } from "../../plugins/request-context.js";
import { makePublicClientAuthorityGuard, checkPublicRateLimit } from "../../plugins/public-auth.js";
import { listDestinationsForClient, fetchDestinationForClient } from "../../lib/public/destination-list.js";
import { decodeCursor, encodeCursor } from "../../lib/public/cursor.js";
import { Wlt1Error } from "../../lib/errors.js";
import type { Wlt1Config } from "../../config.js";

const ALLOWED_STATUSES = ["draft", "pending_screening", "pending_review", "approved_pending_cooling", "active", "revoked"] as const;
const ALLOWED_DESTINATION_TYPES = ["wallet", "fiat_payout"] as const;

const ListQuerystring = Type.Object(
  {
    status: Type.Optional(Type.Union(ALLOWED_STATUSES.map((v) => Type.Literal(v)))),
    destination_type: Type.Optional(Type.Union(ALLOWED_DESTINATION_TYPES.map((v) => Type.Literal(v)))),
    limit: Type.Optional(Type.Integer({ minimum: 1 })),
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 2048 })),
  },
  { additionalProperties: false },
);
type ListQuerystring = Static<typeof ListQuerystring>;

const DestinationIdParams = Type.Object({ destination_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Wlt1Error("WLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

export async function registerPublicDestinationRoutes(app: FastifyInstance): Promise<void> {
  const requireAuthority = makePublicClientAuthorityGuard();

  app.get(
    "/wlt1/destinations",
    { preHandler: requireAuthority, schema: { querystring: ListQuerystring } },
    async (request, reply) => {
      assertPoolAvailable();
      const config = app.config as Wlt1Config;
      const { clientId } = request.publicAuth!;
      const { status, destination_type, limit, cursor } = request.query as ListQuerystring;

      await checkPublicRateLimit(config, { bucket: "READ_LIST", subjectType: "client", subjectId: clientId });

      // Client-requested limit may only LOWER the server cap, never raise it.
      const effectiveLimit = limit !== undefined ? Math.min(limit, config.publicDestinationListMax) : config.publicDestinationListMax;

      let cursorPosition: { clientId: string; createdAtUtc: string; destinationId: string } | undefined;
      if (cursor !== undefined) {
        const decoded = decodeCursor(cursor, clientId);
        if (!decoded) {
          throw new AppError("VALIDATION_ERROR", { details: [{ field: "cursor", issue: "invalid or expired cursor" }] });
        }
        cursorPosition = decoded;
      }

      const page = await listDestinationsForClient(getPool(), clientId, { status, destinationType: destination_type }, effectiveLimit, cursorPosition);

      return reply.send(
        successEnvelope(
          {
            destinations: page.destinations,
            next_cursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
          },
          meta(request),
        ),
      );
    },
  );

  app.get(
    "/wlt1/destinations/:destination_id",
    { preHandler: requireAuthority, schema: { params: DestinationIdParams } },
    async (request, reply) => {
      assertPoolAvailable();
      const config = app.config as Wlt1Config;
      const { clientId } = request.publicAuth!;
      const { destination_id } = request.params as Static<typeof DestinationIdParams>;

      await checkPublicRateLimit(config, { bucket: "READ_ITEM", subjectType: "client", subjectId: clientId });

      const destination = await fetchDestinationForClient(getPool(), destination_id, clientId);
      if (!destination) throw new Wlt1Error("WLT1_DESTINATION_NOT_FOUND");

      return reply.send(successEnvelope(destination, meta(request)));
    },
  );
}
