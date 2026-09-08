/**
 * WLT-01 system endpoints. `GET /internal/wlt1/health` is a single unauthenticated liveness
 * check, mirroring services/aml1/src/routes/system.ts's / services/clt1/src/routes/system.ts's
 * own Phase 0 precedent exactly (plain "alive" status, standard success envelope, no auth —
 * infra liveness probes must not require an internal-service-token).
 *
 * `GET /internal/wlt1/readiness` (Phase 1B) checks DB connectivity and `wlt1.destination` table
 * reachability ONLY — deliberately unauthenticated for the same reason `/health` is (an
 * orchestration probe must not need a secret to ask "are you ready"), mirrors AML-01's/CLT-01's
 * own readiness-route shape exactly (services/aml1/src/routes/system.ts). Does NOT check
 * CLT-01 availability, CFG-01, external network, migration tooling, or the migration-head table —
 * readiness must not fail because an unrelated dependency is down, and this codebase's readiness
 * routes have never coupled to migration tooling.
 */
import type { FastifyInstance } from "fastify";
import { getPool, successEnvelope } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";

export async function registerSystemRoutes(app: FastifyInstance): Promise<void> {
  app.get("/internal/wlt1/health", async (request, reply) => {
    return reply.send(successEnvelope({ status: "alive", module: "WLT-01" }, meta(request)));
  });

  app.get("/internal/wlt1/readiness", async (request, reply) => {
    let checks: Array<{ scope: string; status: "pass" | "fail"; reason: string }>;

    try {
      const pool = getPool();
      await pool.query("SELECT 1 FROM wlt1.destination LIMIT 1");
      checks = [{ scope: "database", status: "pass", reason: "wlt1_schema_reachable" }];
    } catch {
      // getPool() throws if the pool was never initialised; a query throws on a genuinely
      // unreachable database or a missing wlt1 schema/table. Both collapse to the same
      // fail-closed outcome — never leak connection-string/driver internals into the response,
      // mirroring AML-01's/CLT-01's own readiness route exactly.
      checks = [{ scope: "database", status: "fail", reason: "db_unavailable" }];
    }

    const ready = checks.every((c) => c.status === "pass");
    return reply
      .code(ready ? 200 : 503)
      .send(successEnvelope({ status: ready ? "ready" : "not_ready", checks }, meta(request)));
  });
}
