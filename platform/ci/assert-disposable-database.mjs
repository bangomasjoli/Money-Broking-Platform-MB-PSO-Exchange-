#!/usr/bin/env node
/**
 * AIX-CI-001 — abort unless TEST_DATABASE_URL is a configured, LOCAL, empty, throwaway Postgres.
 *
 * The migration-072 suite connects as a superuser, runs CREATE ROLE (cluster-wide) and
 * CREATE/DROP DATABASE. It must therefore never be pointed at a shared, external or populated
 * server. This guard runs BEFORE the suite and exits non-zero (1) if any check fails:
 *
 *   1. TEST_DATABASE_URL is set and is a postgres:// or postgresql:// URL.
 *   2. The host is loopback (localhost, 127.0.0.1, ::1) and no `host=` / `hostaddr=` override is
 *      present in the query string (that could redirect to a unix socket or another machine).
 *   3. The server answers, and (optionally) its major version equals --expect-major.
 *   4. The role is a superuser (the suite needs one) — fails early with a clear message.
 *   5. The cluster holds NO other databases (beyond postgres, template0, template1 and the URL's
 *      own database), NO other login/non-system roles, and the URL's database holds NO
 *      user-created relations: i.e. a fresh disposable service with no real or operational data.
 *
 * It does not prove the server is a CI container; it proves the server is local and empty, which
 * is the property that matters for safety. Passwords are never printed.
 *
 *   node ci/assert-disposable-database.mjs [--expect-major 16]
 */
import { pathToFileURL } from "node:url";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Pure URL check. Returns { ok, errors, dbName } and never throws. */
export function checkDatabaseUrl(raw) {
  const errors = [];
  if (!raw || raw.trim() === "") return { ok: false, errors: ["TEST_DATABASE_URL is not set"] };
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, errors: ["TEST_DATABASE_URL is not a parseable URL"] };
  }
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") errors.push(`TEST_DATABASE_URL protocol must be postgres:// or postgresql://, got ${u.protocol}`);
  if (!LOOPBACK.has(u.hostname.toLowerCase())) errors.push(`TEST_DATABASE_URL host "${u.hostname}" is not loopback (localhost, 127.0.0.1, ::1): external databases are refused`);
  for (const k of ["host", "hostaddr", "service", "sslrootcert"]) {
    if (u.searchParams.has(k)) errors.push(`TEST_DATABASE_URL must not carry a "${k}" query override`);
  }
  const dbName = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!dbName) errors.push("TEST_DATABASE_URL names no database");
  return { ok: errors.length === 0, errors, dbName };
}

/** Server-side emptiness / privilege checks over an open pg client. Returns an array of error strings. */
export async function checkServerIsDisposable(client, { dbName, expectMajor }) {
  const errors = [];
  const q = async (sql, params) => (await client.query(sql, params)).rows;

  const [{ v }] = await q(`SELECT current_setting('server_version_num')::int / 10000 AS v`);
  if (expectMajor !== undefined && Number(v) !== expectMajor) errors.push(`server major version is ${v}, expected ${expectMajor}`);

  const [{ is_super, who }] = await q(`SELECT rolsuper AS is_super, current_user AS who FROM pg_roles WHERE rolname = current_user`);
  if (!is_super) errors.push(`role "${who}" is not a superuser; the migration-072 suite needs CREATE ROLE / CREATE DATABASE`);

  const dbs = (await q(`SELECT datname FROM pg_database WHERE NOT datistemplate`)).map((r) => r.datname);
  const extraDbs = dbs.filter((d) => d !== "postgres" && d !== dbName);
  if (extraDbs.length > 0) errors.push(`server holds other database(s) (${extraDbs.join(", ")}): not a fresh disposable service`);

  const roles = (await q(`SELECT rolname FROM pg_roles WHERE rolname NOT LIKE 'pg\\_%' AND rolname <> current_user`)).map((r) => r.rolname);
  if (roles.length > 0) errors.push(`server holds other role(s) (${roles.join(", ")}): not a fresh disposable service`);

  const [{ n }] = await q(
    `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
      WHERE c.relkind IN ('r','p','v','m','S','f') AND s.nspname NOT IN ('pg_catalog','information_schema','pg_toast')`,
  );
  if (n > 0) errors.push(`database "${dbName}" already contains ${n} user relation(s): not empty`);
  return errors;
}

async function main() {
  const args = process.argv.slice(2);
  let expectMajor;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--expect-major" && i + 1 < args.length) expectMajor = Number(args[++i]);
    else {
      console.error(`usage error: unknown or incomplete argument ${args[i]}`);
      process.exit(2);
    }
  }
  const fail = (errors) => {
    console.error("DATABASE SAFETY GUARD FAILED — refusing to run database tests:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  };

  const urlCheck = checkDatabaseUrl(process.env.TEST_DATABASE_URL);
  if (!urlCheck.ok) fail(urlCheck.errors);

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
  } catch (err) {
    fail([`cannot connect to TEST_DATABASE_URL: ${err.code ?? ""} ${err.message}`.trim()]);
  }
  let errors;
  try {
    errors = await checkServerIsDisposable(client, { dbName: urlCheck.dbName, expectMajor });
  } catch (err) {
    errors = [`server inspection failed: ${err.message}`];
  } finally {
    await client.end().catch(() => {});
  }
  if (errors.length > 0) fail(errors);
  console.log(`DATABASE SAFETY GUARD PASSED: loopback host, empty throwaway Postgres${expectMajor ? ` (major ${expectMajor})` : ""}, database "${urlCheck.dbName}".`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
