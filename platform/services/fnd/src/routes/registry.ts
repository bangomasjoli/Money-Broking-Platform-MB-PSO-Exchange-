/**
 * Module registry read endpoint (FND-01 §04.3.4 / FND-FR-005).
 * Lists registered modules and runtime activation state.
 */
import type { FastifyInstance } from "fastify";
import { getPool, successEnvelope } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";

interface ModuleRow {
  module_code: string;
  module_name: string;
  module_version: string;
  go_live_status: string;
  owner_team: string;
  runtime_enabled: boolean;
}

export async function registerRegistryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/foundation/modules", async (request, reply) => {
    const rows = await getPool().query<ModuleRow>(
      `SELECT module_code, module_name, module_version, go_live_status, owner_team, runtime_enabled
         FROM foundation.module_registry
        ORDER BY module_code`,
    );
    const data = rows.rows.map((r) => ({
      module_code: r.module_code,
      module_name: r.module_name,
      version: r.module_version,
      status: r.go_live_status,
      owner: r.owner_team,
      runtime_enabled: r.runtime_enabled,
    }));
    return reply.send(successEnvelope(data, meta(request)));
  });
}
