/**
 * CFG-01 bootstrap. Loads config (fail closed on missing critical config), initialises the DB
 * pool, builds the app, and listens. Any startup failure exits non-zero. Mirrors
 * services/iam2/src/index.ts / services/sec1/src/index.ts.
 *
 * Phase 0 note: `initPool` is called for platform-wide consistency (every service in this
 * codebase initialises the shared @aix/foundation pool at boot, even before it has its own
 * schema), but no CFG-01 route this phase queries the database — there is no `cfg1.*` schema
 * yet (Phase 1 introduces it).
 */
import { closePool, initPool } from "@aix/foundation";
import { loadCfg1Config } from "./config.js";
import { buildApp } from "./server.js";

async function main(): Promise<void> {
  const config = loadCfg1Config(process.env);
  initPool(config.databaseUrl);

  const app = await buildApp(config);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting_down");
    await app.close();
    await closePool();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(
    { environment: config.environment, release: config.releaseVersion, port: config.port },
    "cfg1_service_started",
  );
}

main().catch((err) => {
  // Startup must fail loudly and exit non-zero; do not start in a degraded state.
  console.error("CFG-01 startup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
