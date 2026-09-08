/**
 * AML-01 Phase 3B — provider-status route (approved Phase 3B scope, internal-only).
 *
 * `GET /internal/aml1/provider/status` returns AML-01's OWN screening-provider configuration —
 * which provider is active, its adaptor version, whether it's the deterministic stub — gated by
 * IAM-02's `aml1.provider.read` (AML-01's first Phase 3B permission). Deliberately returns NO
 * credentials, NO base URLs, NO tokens, and makes NO live vendor health call this phase (Phase 3B
 * scope: a static read of AML-01's own resolved configuration, never a network probe).
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { successEnvelope } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeAml1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { checkPermission, type Iam2ClientConfig } from "../lib/iam2-client.js";
import { resolveScreeningProvider } from "../lib/providers/registry.js";
import { STUB_PROVIDER_ID } from "../lib/providers/stub-provider.js";
import type { ScreeningProvider } from "../lib/providers/types.js";
import { Aml1Error } from "../lib/errors.js";
import type { Aml1Config } from "../config.js";

const ActorQuery = Type.Object({ actor_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

function iam2Config(app: FastifyInstance): Iam2ClientConfig {
  const config = app.config as Aml1Config;
  return { baseUrl: config.iam2BaseUrl, internalServiceToken: config.iam2InternalServiceToken, fetchImpl: config.iam2FetchImpl };
}

function resolveConfiguredProvider(app: FastifyInstance): ScreeningProvider {
  const config = app.config as Aml1Config;
  return config.screeningProviderImpl ?? resolveScreeningProvider(config.screeningProviderId);
}

export async function registerProviderRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeAml1InternalIdentityGuard((app.config as Aml1Config).aml1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // GET /internal/aml1/provider/status
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/aml1/provider/status",
    { preHandler: requireInternal, schema: { querystring: ActorQuery } },
    async (request, reply) => {
      const { actor_id } = request.query as Static<typeof ActorQuery>;

      const baseline = await checkPermission(iam2Config(app), { actorId: actor_id, action: "aml1.provider.read", resource: "provider" });
      if (!baseline.allowed) throw new Aml1Error(baseline.reason === "iam2_unavailable" ? "AML1_IAM2_UNAVAILABLE" : "AML1_PERMISSION_DENIED");

      const provider = resolveConfiguredProvider(app);
      const config = app.config as Aml1Config;

      // Safe fields only — no credentials, no base URLs, no tokens, no raw provider config.
      return reply.send(
        successEnvelope(
          {
            active_provider_id: provider.providerId,
            adaptor_version: provider.adaptorVersion,
            environment: config.environment,
            stub_provider: provider.providerId === STUB_PROVIDER_ID,
          },
          meta(request),
        ),
      );
    },
  );
}
