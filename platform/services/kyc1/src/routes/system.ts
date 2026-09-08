/**
 * KYC-01 system endpoints. `GET /internal/kyc1/health` is a single unauthenticated liveness
 * check, mirroring services/aml1/src/routes/system.ts's own Phase 0 precedent (plain "alive"
 * status, standard success envelope, no auth — infra liveness probes must not require an
 * internal-service-token).
 *
 * `GET /internal/kyc1/readiness` (Phase 1) checks DB connectivity and `kyc1.*` table reachability
 * ONLY — deliberately unauthenticated for the same reason `/health` is (an orchestration probe
 * must not need a secret to ask "are you healthy"), mirrors AML-01's own
 * `/internal/aml1/readiness` shape exactly.
 */
import type { FastifyInstance } from "fastify";
import { getPool, successEnvelope } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";

export async function registerSystemRoutes(app: FastifyInstance): Promise<void> {
  app.get("/internal/kyc1/health", async (request, reply) => {
    return reply.send(successEnvelope({ status: "alive" }, meta(request)));
  });

  app.get("/internal/kyc1/readiness", async (request, reply) => {
    let checks: Array<{ scope: string; status: "pass" | "fail"; reason: string }>;

    try {
      const pool = getPool();
      await pool.query("SELECT 1 FROM kyc1.kyc_case LIMIT 1");
      checks = [{ scope: "database", status: "pass", reason: "kyc1_schema_reachable" }];
    } catch {
      // getPool() throws if the pool was never initialised; a query throws on a genuinely
      // unavailable/unreachable database or a missing kyc1 schema/table. Both collapse to the
      // same fail-closed outcome — never leak connection-string/driver internals into the
      // response, mirroring AML-01's own readiness route exactly.
      checks = [{ scope: "database", status: "fail", reason: "db_unavailable" }];
    }

    const ready = checks.every((c) => c.status === "pass");
    return reply
      .code(ready ? 200 : 503)
      .send(successEnvelope({ status: ready ? "ready" : "not_ready", checks }, meta(request)));
  });
}
