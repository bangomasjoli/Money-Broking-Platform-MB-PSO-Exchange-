/**
 * AML-01 — point-in-time screening request routes (internal-only).
 *
 * Phase 3B restructure (approved Phase 3 planning report §5.1, confirmed decision D1): `POST
 * .../screening-requests` is now a TWO-PHASE lifecycle — mirroring the pattern this codebase
 * already established for CLT-01 outcome delivery (routes/clt-outcome-delivery.ts) and AML-01's own
 * match disposition (routes/matches.ts) — instead of Phase 1 through Phase 3A's single transaction
 * wrapping the ENTIRE screen. The screening provider call (today the deterministic stub, in a
 * future phase a real HTTP-backed vendor adaptor) now happens OUTSIDE any database transaction:
 *
 *   TX1: INSERT screening_request ('requested') -> INSERT screening_subject_snapshot (including
 *        `subject_nature`) -> INSERT screening_provider_attempt ('pending') -> publish
 *        `aml1.screening_request_created` -> commit.
 *   PROVIDER CALL: `lib/providers/registry.ts`'s `screenViaProvider` — timeout-bounded, never
 *        inside a transaction, never holding a DB connection.
 *   TX2: update the provider-attempt row to `succeeded`/`failed`; on success, INSERT
 *        screening_result + zero-or-more screening_match rows and UPDATE the request to
 *        `completed`, publishing `aml1.screening_completed`; on ANY failure (provider unavailable,
 *        or a response that could not be normalized), UPDATE the request to `failed` instead (no
 *        result/match row is ever written), publishing `aml1.screening_failed` -> commit.
 *
 * The HTTP response contract is UNCHANGED and stays SYNCHRONOUS — no async/polling contract this
 * phase (approved decision D1). A crash between TX1 and TX2 leaves a `requested` request with a
 * `pending` provider attempt; this is an acceptable, resumable-in-a-future-phase shape (mirrors
 * CLT-01 delivery's own crash posture) — Phase 3B does not implement a retry/resume route.
 *
 * `subject_nature` (`individual`/`entity`, CALLER-SUPPLIED, never derived by AML-01 — decision D2)
 * gates provider-payload minimization (`lib/screening.ts`'s `buildProviderScreeningPayload`):
 * `registration_number` is sent to the provider ONLY for `entity` subjects, `date_of_birth`/
 * `nationality` ONLY for `individual` subjects. The raw provider request/response payloads are
 * NEVER retained — only their `fingerprint()` hashes (`screening_provider_attempt.
 * request_payload_hash`/`response_payload_hash`).
 *
 * A provider can only ever produce `clear`/`potential_match` (`lib/screening.ts`'s
 * `deriveOverallStatus`) — `confirmed_hit` remains the sole output of human disposition (Phase 2B).
 * An unknown match category fails closed as `AML1_VENDOR_RESPONSE_INVALID`, never silently
 * bucketed into `adverse_media` and never silently dropped.
 *
 * Both routes remain internal-identity-guarded only (not IAM-02-gated — screening itself has no
 * IAM-02 permission; only the NEW provider-status route does, see routes/provider.ts).
 *
 * Phase 2A addition (unchanged by Phase 3B): `subject_parent_ref` — an OPTIONAL, OPAQUE
 * caller-supplied parent reference for an `authorised_party` subject, read back by
 * routes/clt-outcome-delivery.ts to construct CLT-01's party-receipt URL.
 *
 * Phase 3C refactor: the TX1 -> provider call -> TX2 core below was EXTRACTED into
 * `lib/screening-execution.ts`'s `executeScreening` (and the safe-response fetch into that same
 * file's `fetchSafeScreeningResponse`) so `routes/rescreen.ts` / the monitoring run
 * (`lib/rescreen.ts`) can run through the identical lifecycle instead of a second, drifting copy.
 * This route's own behaviour (audit event names, error codes, response shape) is UNCHANGED by the
 * extraction — `rescreen_of_request_id`/`trigger_reason` are always `null` for a request created
 * here (this route never creates a re-screen; see `routes/rescreen.ts` for that).
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { getPool, successEnvelope } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeAml1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { SCREENING_PROVENANCE_VALUES, SCREENING_SUBJECT_TYPES, validateScreeningSubject } from "../lib/screening.js";
import { executeScreening, fetchSafeScreeningResponse } from "../lib/screening-execution.js";
import { resolveScreeningProvider } from "../lib/providers/registry.js";
import { SUBJECT_NATURES, type ScreeningProvider } from "../lib/providers/types.js";
import { Aml1Error } from "../lib/errors.js";
import type { Aml1Config } from "../config.js";

const SubjectTypeSchema = Type.Union(SCREENING_SUBJECT_TYPES.map((t) => Type.Literal(t)));
const ProvenanceSchema = Type.Union(SCREENING_PROVENANCE_VALUES.map((p) => Type.Literal(p)));
const SubjectNatureSchema = Type.Union(SUBJECT_NATURES.map((n) => Type.Literal(n)));

const DeclaredIdentitySchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 256 }),
    registration_number: Type.Optional(Type.String({ maxLength: 64 })),
    country: Type.Optional(Type.String({ minLength: 2, maxLength: 2 })),
    date_of_birth: Type.Optional(Type.String({ maxLength: 40 })),
    nationality: Type.Optional(Type.String({ minLength: 2, maxLength: 2 })),
  },
  { additionalProperties: false },
);

const CreateScreeningRequestBody = Type.Object(
  {
    subject_type: SubjectTypeSchema,
    subject_ref: Type.String({ minLength: 1, maxLength: 64 }),
    subject_parent_ref: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    subject_nature: SubjectNatureSchema,
    provenance: ProvenanceSchema,
    requested_by: Type.String({ minLength: 1, maxLength: 64 }),
    declared_identity: DeclaredIdentitySchema,
  },
  { additionalProperties: false },
);

const ScreeningRequestIdParams = Type.Object({ screening_request_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Aml1Error("AML1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function resolveConfiguredProvider(app: FastifyInstance): ScreeningProvider {
  const config = app.config as Aml1Config;
  return config.screeningProviderImpl ?? resolveScreeningProvider(config.screeningProviderId);
}

export async function registerScreeningRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeAml1InternalIdentityGuard((app.config as Aml1Config).aml1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/aml1/screening-requests
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/aml1/screening-requests",
    { preHandler: requireInternal, schema: { body: CreateScreeningRequestBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof CreateScreeningRequestBody>;
      assertPoolAvailable();
      validateScreeningSubject({ subject_type: body.subject_type, provenance: body.provenance, declared_identity: body.declared_identity });

      const screeningRequestId = "aml1req_" + randomUUID();
      const attemptId = "aml1attempt_" + randomUUID();
      const provider = resolveConfiguredProvider(app);

      const outcome = await executeScreening({
        screeningRequestId,
        attemptId,
        subjectType: body.subject_type,
        subjectRef: body.subject_ref,
        subjectParentRef: body.subject_parent_ref ?? null,
        subjectNature: body.subject_nature,
        provenance: body.provenance,
        requestedBy: body.requested_by,
        declaredIdentity: body.declared_identity,
        rescreenOfRequestId: null,
        triggerReason: null,
        provider,
        requestId: request.ctx.request_id,
        correlationId: request.ctx.correlation_id,
        createdEventType: "aml1.screening_request_created",
        completedEventType: "aml1.screening_completed",
      });

      if (outcome.kind === "failed") {
        throw new Aml1Error(outcome.errorCode);
      }
      if (outcome.kind === "aborted") {
        // Phase 3D TX2 concurrency guard (lib/screening-execution.ts) — this request was recovered
        // as stuck by an operator while the provider call was still in flight; it is already
        // durably `failed`, never `completed`, by that recovery. No new AML1_* code added — reuses
        // the existing request-lifecycle-state code (see lib/errors.ts's own header comment).
        throw new Aml1Error("AML1_SCREENING_REQUEST_INVALID_STATE", {
          message: "This screening request was recovered as stuck before the provider response could be recorded.",
        });
      }

      const safeResponse = await fetchSafeScreeningResponse(screeningRequestId);
      return reply.code(201).send(successEnvelope(safeResponse, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // GET /internal/aml1/screening-requests/:screening_request_id
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/aml1/screening-requests/:screening_request_id",
    { preHandler: requireInternal, schema: { params: ScreeningRequestIdParams } },
    async (request, reply) => {
      const { screening_request_id } = request.params as { screening_request_id: string };
      assertPoolAvailable();
      const safeResponse = await fetchSafeScreeningResponse(screening_request_id);
      return reply.send(successEnvelope(safeResponse, meta(request)));
    },
  );
}
