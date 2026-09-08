/**
 * CLT-01 system endpoints. `GET /internal/clt1/health` is a single unauthenticated liveness
 * check, mirroring services/fnd/src/routes/system.ts's `GET /foundation/health` shape exactly
 * (plain "alive" status, standard success envelope, no auth — infra liveness probes must not
 * require an internal-service-token) and services/cfg1/src/routes/system.ts's own Phase 0
 * precedent.
 *
 * `GET /internal/clt1/readiness` (Phase 1) checks DB connectivity and `clt1.*` table
 * reachability ONLY — deliberately does NOT check CFG-01 reachability (approved Phase 1 design
 * decision #6). Coupling CLT-01's own health signal to a downstream dependency would make an
 * orchestrator restart/reroute a perfectly healthy CLT-01 instance for an unrelated CFG-01 blip;
 * a CFG-01 outage instead surfaces at request time as a fail-closed gate denial
 * (CLT1_SERVICE_UNAVAILABLE via lib/cfg1-client.ts), never as a false CLT-01 "not ready" signal —
 * same reasoning FND-01's own readiness applies to `licence_lock_interface` ("not_configured",
 * not a hard dependency check). No IAM-02 guard (internal route only, per approved Phase 1
 * scope) — deliberately unauthenticated for the same reason `/health` is: an orchestration probe
 * must not need a secret to ask "are you healthy". Response shape mirrors CFG-01's own
 * `/internal/cfg1/readiness` (services/cfg1/src/routes/system.ts).
 */
import type { FastifyInstance } from "fastify";
import { getPool, successEnvelope } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";

export async function registerSystemRoutes(app: FastifyInstance): Promise<void> {
  app.get("/internal/clt1/health", async (request, reply) => {
    return reply.send(successEnvelope({ status: "alive" }, meta(request)));
  });

  app.get("/internal/clt1/readiness", async (request, reply) => {
    let checks: Array<{ scope: string; status: "pass" | "fail"; reason: string }>;

    try {
      const pool = getPool();
      await pool.query("SELECT 1 FROM clt1.client_application LIMIT 1");
      checks = [{ scope: "database", status: "pass", reason: "clt1_schema_reachable" }];
    } catch {
      // getPool() throws if the pool was never initialised; a query throws on a genuinely
      // unavailable/unreachable database or a missing clt1 schema/table. Both collapse to the
      // same fail-closed outcome — never leak connection-string/driver internals into the
      // response, mirroring CFG-01's own readiness route exactly.
      checks = [{ scope: "database", status: "fail", reason: "db_unavailable" }];
    }

    const ready = checks.every((c) => c.status === "pass");
    return reply
      .code(ready ? 200 : 503)
      .send(successEnvelope({ status: ready ? "ready" : "not_ready", checks }, meta(request)));
  });
}
