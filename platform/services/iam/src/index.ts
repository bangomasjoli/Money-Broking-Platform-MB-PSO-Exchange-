/**
 * IAM-01 bootstrap. Loads config (fail closed on missing critical config), initialises the
 * DB pool, runs the first-admin break-glass bootstrap if enabled (decision #3), builds the
 * app, and listens. Any startup failure exits non-zero. Mirrors services/fnd/src/index.ts.
 */
import { closePool, initPool } from "@aix/foundation";
import { loadIamConfig } from "./config.js";
import { runBootstrap } from "./lib/bootstrap.js";
import { buildApp } from "./server.js";

async function main(): Promise<void> {
  const config = loadIamConfig(process.env);
  // FND-FIND-010: pass IAM's explicit pool-capacity inputs only when configured (prod-required,
  // optional elsewhere — see config.ts). When absent, initPool() constructs the pool exactly as
  // it did before this remediation; the options object below is never `{ max: undefined }`.
  initPool(config.databaseUrl, {
    ...(config.dbPoolMax !== undefined ? { max: config.dbPoolMax } : {}),
    ...(config.dbConnectionTimeoutMs !== undefined
      ? { connectionTimeoutMillis: config.dbConnectionTimeoutMs }
      : {}),
  });

  await runBootstrap(config);

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
    {
      environment: config.environment,
      release: config.releaseVersion,
      port: config.port,
      // FND-FIND-010 auditability: record the EFFECTIVE pool capacity inputs (never a secret —
      // DATABASE_URL itself is never logged here or elsewhere in this line) so a deployed
      // ceiling is verifiable against the governed value of record, not merely assumed.
      dbPoolMax: config.dbPoolMax ?? "unset (node-postgres library default)",
      dbConnectionTimeoutMs: config.dbConnectionTimeoutMs ?? "unset (node-postgres library default)",
    },
    "iam_service_started",
  );
}

main().catch((err) => {
  // Startup must fail loudly and exit non-zero; do not start in a degraded state.
  console.error("IAM-01 startup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
