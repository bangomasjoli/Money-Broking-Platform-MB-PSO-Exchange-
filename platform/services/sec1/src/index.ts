/**
 * SEC-01 bootstrap. Loads config (fail closed on missing critical config), initialises the DB
 * pool, builds the app, and listens. Any startup failure exits non-zero. Mirrors
 * services/iam2/src/index.ts.
 */
import { closePool, initPool } from "@aix/foundation";
import { loadSec1Config } from "./config.js";
import { buildApp } from "./server.js";

async function main(): Promise<void> {
  const config = loadSec1Config(process.env);
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
    "sec1_service_started",
  );
}

main().catch((err) => {
  // Startup must fail loudly and exit non-zero; do not start in a degraded state.
  console.error("SEC-01 startup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
