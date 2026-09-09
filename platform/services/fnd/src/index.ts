/**
 * FND-01 bootstrap (FND-FR-001). Loads config (fail closed on missing critical config),
 * initialises the DB pool, builds the app, and listens. Any startup failure exits non-zero.
 */
import { closePool, initPool } from "@aix/foundation";
import { loadFndConfig } from "./config.js";
import { buildApp } from "./server.js";

async function main(): Promise<void> {
  const config = loadFndConfig(process.env);
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
    "fnd_service_started",
  );
}

main().catch((err) => {
  // Startup must fail loudly and exit non-zero; do not start in a degraded state.
  console.error("FND-01 startup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
