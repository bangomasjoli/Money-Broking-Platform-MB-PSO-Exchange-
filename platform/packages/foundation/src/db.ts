/**
 * FND-01 database access baseline. Thin wrapper over pg with a transaction helper.
 * The transaction helper is the vehicle for the §5.5 audit/outbox transaction-coupling
 * contract: sensitive/money actions must commit their audit/outbox record in the SAME tx.
 */
import { Pool, type PoolClient, type QueryResultRow } from "pg";

export type Sql = Pool | PoolClient;

let pool: Pool | undefined;

export function initPool(connectionString: string): Pool {
  if (!pool) {
    pool = new Pool({ connectionString, application_name: "aix-fnd" });
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
