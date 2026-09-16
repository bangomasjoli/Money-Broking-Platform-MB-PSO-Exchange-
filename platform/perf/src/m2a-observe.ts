/**
 * IMP-02 measurement harness — Turn M-A foundation. The M2a observer.
 *
 * M2a is the application-side half of M2 (architecture §14): the effective, RUNTIME-read
 * `pool.max` / `connectionTimeoutMillis` a controlled IAM-shaped pool actually constructs with.
 * It is observable now, using exactly the seam FND-FIND-010 already governs
 * (`@aix/foundation`'s `initPool(url, { max, connectionTimeoutMillis })`) — this module imports
 * that seam unmodified; it does not patch, wrap, or reimplement it.
 *
 * M2a is NOT M2: M2 additionally requires M2b (deployment process topology), which this
 * repository currently has no evidence source for (architecture §14, §16) — every result this
 * module produces says so explicitly via `does_not_prove`, and `measurement_id` is always
 * exactly `"M2a"`, never `"M2"` (which is not even a member of `MeasurementId` — see
 * `schema.ts`).
 *
 * Dirty-tree refusal: per this turn's explicit instruction, a dirty working tree must not
 * silently produce an `OBSERVED` result. This observer checks `working_tree_clean` from the
 * environment manifest BEFORE opening any database connection; if the tree is dirty, it returns
 * an `INVALID` result without ever calling `initPool` — the "observer refuses to start" reading
 * of that instruction, applied to the actual capacity-observation work while still returning a
 * structured, traceable record of why.
 */
import { Pool } from "pg";
import { initPool, closePool, type PoolCapacityOptions } from "@aix/foundation";
import {
  buildEnvironmentManifest,
  type BuildEnvironmentManifestInput,
  type DatabaseFingerprint,
  type ServiceTopologyFingerprint,
} from "./environment-manifest.js";
import { createMeasurementResult, type MeasurementResult } from "./schema.js";

const M2A_DOES_NOT_PROVE = [
  "does not establish production IAM process count",
  "does not establish production C_iam",
  "does not approve IAM_DB_POOL_MAX",
  "does not complete M2 (M2b — deployment process topology — remains separately blocked)",
  "does not establish throughput capacity",
] as const;

/** The `pg_settings` names this observer reads. All are globally readable (no superuser
 * required) and none requires any database mutation. */
const PG_SETTINGS_NAMES = [
  "max_connections",
  "superuser_reserved_connections",
  "shared_buffers",
  "synchronous_commit",
  "wal_level",
  "fsync",
  "full_page_writes",
] as const;

export interface M2aDetails {
  readonly requested: {
    readonly poolMax?: number;
    readonly connectionTimeoutMillis?: number;
  };
  /** Read directly from the constructed `Pool` instance's own `options` — never echoed back
   * from the request, so a bug in `initPool()`'s option-forwarding would be visible here. */
  readonly effective: {
    readonly poolMax: number | undefined;
    readonly connectionTimeoutMillis: number | undefined;
  };
  readonly reason?: string;
}

export interface ObserveM2aInput {
  readonly runId: string;
  readonly databaseUrl: string;
  readonly poolOptions?: PoolCapacityOptions;
  /** Injectable for tests — see `BuildEnvironmentManifestInput.gitInfoProvider`. Defaults to the
   * real git provider (`readRealGitInfo`) via `buildEnvironmentManifest`. */
  readonly gitInfoProvider?: BuildEnvironmentManifestInput["gitInfoProvider"];
  readonly now?: Date;
}

async function queryDatabaseFingerprint(databaseUrl: string): Promise<DatabaseFingerprint> {
  // A short-lived, dedicated single-connection pool for the settings query itself — deliberately
  // NOT the same pool object being observed, so reading the fingerprint never perturbs the
  // pool-configuration observation it accompanies.
  const settingsPool = initPoolForFingerprintOnly(databaseUrl);
  try {
    const client = await settingsPool.connect();
    try {
      const versionResult = await client.query<{ version: string }>("SELECT version() AS version");
      const settingsResult = await client.query<{ name: string; setting: string }>(
        "SELECT name, setting FROM pg_catalog.pg_settings WHERE name = ANY($1)",
        [PG_SETTINGS_NAMES as unknown as string[]],
      );
      const settingsByName = new Map(settingsResult.rows.map((row) => [row.name, row.setting]));

      const maxConnectionsRaw = settingsByName.get("max_connections");
      const reservedRaw = settingsByName.get("superuser_reserved_connections");
      if (maxConnectionsRaw === undefined || reservedRaw === undefined) {
        throw new Error("pg_settings did not return max_connections / superuser_reserved_connections — cannot build database fingerprint");
      }

      return {
        observed: true,
        postgres_version: versionResult.rows[0]?.version ?? "",
        max_connections: Number(maxConnectionsRaw),
        superuser_reserved_connections: Number(reservedRaw),
        ...(settingsByName.has("shared_buffers") ? { shared_buffers: settingsByName.get("shared_buffers")! } : {}),
        ...(settingsByName.has("synchronous_commit") ? { synchronous_commit: settingsByName.get("synchronous_commit")! } : {}),
        ...(settingsByName.has("wal_level") ? { wal_level: settingsByName.get("wal_level")! } : {}),
        ...(settingsByName.has("fsync") ? { fsync: settingsByName.get("fsync")! } : {}),
        ...(settingsByName.has("full_page_writes") ? { full_page_writes: settingsByName.get("full_page_writes")! } : {}),
      };
    } finally {
      client.release();
    }
  } finally {
    await settingsPool.end();
  }
}

// A private, non-singleton Pool constructed directly (not through @aix/foundation's
// process-wide singleton) so the fingerprint query can run and close independently of the
// pool configuration actually being observed for M2a itself. This is the one place in this
// module that talks to `pg` directly rather than through `@aix/foundation`, confined to a
// short-lived, single-purpose settings query — never the pool whose configuration M2a is
// observing.
function initPoolForFingerprintOnly(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl, application_name: "aix-perf-m2a-fingerprint", max: 1 });
}

/**
 * Observes the effective, runtime pool configuration a controlled `initPool()` call actually
 * constructs against the supplied (scratch/non-production) database. Refuses to run against a
 * dirty working tree (returns `INVALID` without connecting). Never claims production process
 * count, production `C_iam`, or a production policy value — see `M2A_DOES_NOT_PROVE`.
 */
export async function observeM2a(input: ObserveM2aInput): Promise<MeasurementResult<M2aDetails>> {
  if (typeof input.databaseUrl !== "string" || input.databaseUrl.length === 0) {
    throw new Error("observeM2a: databaseUrl is required");
  }

  const startedAt = input.now ?? new Date();
  const preManifest = buildEnvironmentManifest({
    runId: input.runId,
    gitInfoProvider: input.gitInfoProvider,
    now: startedAt,
  });

  if (!preManifest.provenance.working_tree_clean) {
    // Refuse to start: no pool is initialized, no database connection is opened. The manifest
    // itself (built above) already captured WHY — dirty-tree provenance is visible in the
    // returned record for diagnosis, even though no observation was attempted.
    const endedAt = new Date();
    return createMeasurementResult<M2aDetails>({
      measurement_id: "M2a",
      run_id: input.runId,
      status: "INVALID",
      timestamp_utc_start: startedAt.toISOString(),
      timestamp_utc_end: endedAt.toISOString(),
      commit_sha: preManifest.provenance.commit_sha,
      working_tree_clean: preManifest.provenance.working_tree_clean,
      environment: preManifest,
      does_not_prove: [...M2A_DOES_NOT_PROVE],
      details: {
        requested: { poolMax: input.poolOptions?.max, connectionTimeoutMillis: input.poolOptions?.connectionTimeoutMillis },
        effective: { poolMax: undefined, connectionTimeoutMillis: undefined },
        reason: "working tree is dirty — observer refused to start; no pool was initialized and no database connection was opened",
      },
    });
  }

  let effectivePoolMax: number | undefined;
  let effectiveConnectionTimeoutMillis: number | undefined;
  let databaseFingerprint: DatabaseFingerprint;
  try {
    const pool = initPool(input.databaseUrl, input.poolOptions);
    effectivePoolMax = pool.options.max;
    effectiveConnectionTimeoutMillis = pool.options.connectionTimeoutMillis;
    databaseFingerprint = await queryDatabaseFingerprint(input.databaseUrl);
  } finally {
    // Always release the observed singleton so a subsequent call in the same process (e.g. a
    // second test, or a future run in the same harness invocation) starts from a clean slate
    // rather than silently reusing a pool configured by this call.
    await closePool();
  }

  const serviceTopology: ServiceTopologyFingerprint = {
    observed: true,
    iam_processes_total: 1,
    iam_pool_max: effectivePoolMax,
    ...(effectiveConnectionTimeoutMillis !== undefined ? { iam_connection_timeout_millis: effectiveConnectionTimeoutMillis } : {}),
    source: "observed_local_process — a single harness-owned process in this run; NOT production deployment topology",
  };

  const endedAt = new Date();
  const manifest = buildEnvironmentManifest({
    runId: input.runId,
    gitInfoProvider: input.gitInfoProvider,
    now: startedAt,
    database: databaseFingerprint,
    serviceTopology,
  });

  return createMeasurementResult<M2aDetails>({
    measurement_id: "M2a",
    run_id: input.runId,
    status: "OBSERVED",
    timestamp_utc_start: startedAt.toISOString(),
    timestamp_utc_end: endedAt.toISOString(),
    commit_sha: manifest.provenance.commit_sha,
    working_tree_clean: manifest.provenance.working_tree_clean,
    environment: manifest,
    does_not_prove: [...M2A_DOES_NOT_PROVE],
    details: {
      requested: { poolMax: input.poolOptions?.max, connectionTimeoutMillis: input.poolOptions?.connectionTimeoutMillis },
      effective: { poolMax: effectivePoolMax, connectionTimeoutMillis: effectiveConnectionTimeoutMillis },
    },
  });
}
