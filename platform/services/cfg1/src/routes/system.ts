/**
 * CFG-01 system endpoints. `GET /internal/cfg1/health` (Phase 0) is a single unauthenticated
 * liveness check, mirroring services/fnd/src/routes/system.ts's `GET /foundation/health` shape
 * exactly (plain "alive" status, standard success envelope, no auth — infra liveness probes
 * must not require an internal-service-token).
 *
 * `GET /internal/cfg1/readiness` (Phase 1) recomputes both sealed scopes' hashes and compares
 * them against the active `cfg1.config_integrity_seal` rows (services/cfg1/src/lib/
 * integrity-seal.ts). This is READINESS (queried on demand), not a boot-time hard-fail —
 * `assertNoExchangeRuntime` remains the only boot-time throw (server.ts); a transient DB hiccup
 * during startup must not crash the whole process, mirroring FND-01's own
 * `licence_lock_interface` precedent of reporting `not_configured`/`fail` rather than crashing.
 * This does NOT replace the real per-decision integrity check blueprint §5.4A rule 3 requires —
 * that lands with Phase 2's runtime decision engine; readiness is early operational visibility
 * only. No IAM-02 guard yet (internal route only, per approved Phase 1 scope) — deliberately
 * unauthenticated for the same reason `/health` is: an orchestration probe must not need a
 * secret to ask "are you healthy".
 *
 * Response shape is deliberately minimal: scope name + pass/fail + a stable reason code only.
 * NEVER the raw licence_profile/prohibited_feature row content, and NEVER the computed/stored
 * hash values — this data is classified Restricted/Security-Critical
 * (`16_Data_Classification.md`) and no IAM-02 read-guard exists yet to gate a real inspection
 * route; readiness must not become an unauthenticated side-channel for it.
 */
import type { FastifyInstance } from "fastify";
import { getPool, successEnvelope } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { checkConfigIntegritySeals, type SealCheckResult } from "../lib/integrity-seal.js";

export async function registerSystemRoutes(app: FastifyInstance): Promise<void> {
  app.get("/internal/cfg1/health", async (request, reply) => {
    return reply.send(successEnvelope({ status: "alive" }, meta(request)));
  });

  app.get("/internal/cfg1/readiness", async (request, reply) => {
    let checks: Array<{ scope: string; status: "pass" | "fail"; reason: string }>;

    try {
      const pool = getPool();
      const results: SealCheckResult[] = await checkConfigIntegritySeals(pool);
      checks = results.map((r) => ({ scope: r.scope, status: r.status, reason: r.reason }));
    } catch {
      // getPool() throws if the pool was never initialised; a query throws on a genuinely
      // unavailable/unreachable database. Both collapse to the same fail-closed outcome —
      // never leak connection-string/driver internals into the response.
      checks = [{ scope: "database", status: "fail", reason: "db_unavailable" }];
    }

    const ready = checks.every((c) => c.status === "pass");
    return reply
      .code(ready ? 200 : 503)
      .send(successEnvelope({ status: ready ? "ready" : "not_ready", checks }, meta(request)));
  });
}
