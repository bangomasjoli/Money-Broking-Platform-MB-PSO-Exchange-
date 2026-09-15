/**
 * FND-01 database access baseline. Thin wrapper over pg with a transaction helper.
 * The transaction helper is the vehicle for the §5.5 audit/outbox transaction-coupling
 * contract: sensitive/money actions must commit their audit/outbox record in the SAME tx.
 */
import { Pool, type PoolClient, type QueryResultRow } from "pg";

export type Sql = Pool | PoolClient;

/**
 * FND-FIND-010 remediation — a deliberately narrow options surface. Only these two capacity
 * inputs are accepted, never an arbitrary `PoolConfig` pass-through, so a caller can govern its
 * own concurrency ceiling and acquisition timeout without gaining the ability to alter any other
 * pg connection behaviour through this seam.
 */
export interface PoolCapacityOptions {
  max?: number;
  connectionTimeoutMillis?: number;
}

let pool: Pool | undefined;

/**
 * `options` is honoured ONLY on the call that actually constructs the singleton (the first call
 * after process start, or the first call after `closePool()`). Once `pool` exists, every
 * subsequent `initPool()` call — with or without options — returns the SAME pool instance
 * unchanged; it never reconfigures a live pool. Callers that pass no `options` (all services
 * except IAM-01) construct the pool exactly as before this change — `max`/`connectionTimeoutMillis`
 * are added to the constructor object only when explicitly supplied, never as `undefined` keys.
 */
export function initPool(connectionString: string, options?: PoolCapacityOptions): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString,
      application_name: "aix-fnd",
      ...(options?.max !== undefined ? { max: options.max } : {}),
      ...(options?.connectionTimeoutMillis !== undefined
        ? { connectionTimeoutMillis: options.connectionTimeoutMillis }
        : {}),
    });
  }
  return pool;
}

export function getPool(): Pool {
  if (!pool) throw new Error("CONFIGURATION_INVALID: database pool not initialised");
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: Sql,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await sql.query<T>(text, params as never[]);
  return res.rows;
}

/**
 * Run `fn` inside a single transaction. If `fn` throws (including a failed audit/outbox
 * write), the whole transaction rolls back — the action fails closed (§5.5 rule 3).
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore rollback failure; original error is the signal */
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Lightweight liveness probe used by readiness (§04.3.2). */
export async function pingDatabase(sql: Sql): Promise<boolean> {
  try {
    await sql.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
