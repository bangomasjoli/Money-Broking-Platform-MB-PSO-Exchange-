#!/usr/bin/env node
/**
 * AIX-CI-001 / AIX-CI-HARD-001 L1 — abort unless TEST_DATABASE_URL is a configured, LOCAL Postgres
 * server in which no user-created relation was found. This is a pre-flight safety check for CI,
 * not proof that a server is disposable.
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
 *      own database; a database flagged datistemplate is NOT exempt) and NO other login/non-system roles.
 *   6. Each of THREE databases — the URL's own database, `postgres` and `template1` — holds NO
 *      user-created relations (ordinary/partitioned tables, views, materialized views, sequences,
 *      foreign tables, in any schema outside pg_catalog / information_schema / pg_toast). PostgreSQL
 *      catalogues are database-local, so each database is inspected over its own connection (the
 *      same validated URL with only the database name replaced). Every connection must report the
 *      expected current_database() and the same cluster system_identifier as the first one.
 *      A database that cannot be connected to, cannot be inspected, reports an unexpected identity
 *      or returns an invalid result FAILS the guard; a failure is never read as "zero relations".
 *
 * What this does NOT establish: it does not prove the server is a CI container or is safe for
 * arbitrary reused use. A loopback address and the absence of detected user relations in those three
 * databases say nothing about extensions, event triggers, other schemas' non-relation objects,
 * template0, or data outside the inspected databases. It is meant for a freshly provisioned,
 * ephemeral service. template0 is neither inspected nor modified. Passwords are never printed.
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

/** Same relation semantics as before: tables, partitioned tables, views, matviews, sequences, foreign tables. */
export const USER_RELATION_SQL =`SELECT count(*)::int AS n,
       coalesce((array_agg(format('%I.%I (%s)', s.nspname, c.relname, c.relkind::text) ORDER BY s.nspname, c.relname))[1:3], '{}') AS sample
  FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
 WHERE c.relkind IN ('r','p','v','m','S','f') AND s.nspname NOT IN ('pg_catalog','information_schema','pg_toast')`;
const IDENTITY_SQL = `SELECT current_database() AS db, (SELECT system_identifier::text FROM pg_control_system()) AS sysid`;

/** Databases that must be inspected, de-duplicated, URL database first. template0 is never touched. */
export function inspectionTargets(dbName) {
  return [...new Set([dbName, "postgres", "template1"])];
}

/** The validated URL with ONLY the database path replaced (host, port, credentials and options are unchanged). */
export function databaseUrlFor(raw, dbName) {
  const u = new URL(raw);
  u.pathname = `/${encodeURIComponent(dbName)}`;
  return u.toString();
}

/** Remove the password and the raw URL from a diagnostic string. */
export function redact(message, raw) {
  let out = String(message ?? "");
  if (!raw) return out;
  const secrets = [raw];
  try {
    const u = new URL(raw);
    for (const v of [u.password, decodeURIComponent(u.password)]) if (v) secrets.push(v);
  } catch {
    /* unparseable URL has no extractable password */
  }
  for (const sct of secrets.sort((a, b) => b.length - a.length)) out = out.split(sct).join("[redacted]");
  return out;
}

/**
 * Inspect ONE database over `client`. Returns { errors, sysid }. Never throws, and never reports an
 * inspection failure, unexpected identity or malformed result as "no relations".
 */
export async function inspectDatabase(client, expectedDb, { expectedSysid, secret } = {}) {
  const fail = (m) => ({ errors: [`database "${expectedDb}": ${redact(m, secret)}`], sysid: undefined });
  let id;
  let rel;
  try {
    id = (await client.query(IDENTITY_SQL)).rows;
    if (!Array.isArray(id) || id.length !== 1 || typeof id[0].db !== "string" || typeof id[0].sysid !== "string" || id[0].sysid === "") {
      return fail("identity query returned an invalid result");
    }
    if (id[0].db !== expectedDb) return fail(`connected to database "${id[0].db}", expected "${expectedDb}"`);
    if (expectedSysid !== undefined && id[0].sysid !== expectedSysid) return fail("connected to a different PostgreSQL cluster than the first connection");
    rel = (await client.query(USER_RELATION_SQL)).rows;
  } catch (err) {
    return fail(`inspection failed: ${err?.code ?? ""} ${err?.message ?? err}`.replace(/\s+/g, " ").trim());
  }
  const n = rel?.[0]?.n;
  if (!Array.isArray(rel) || rel.length !== 1 || !Number.isInteger(n) || n < 0 || !Array.isArray(rel[0].sample)) {
    return fail("relation query returned an invalid result");
  }
  const errors = n > 0 ? [`database "${expectedDb}" already contains ${n} user relation(s) (e.g. ${rel[0].sample.join(", ")}): not empty`] : [];
  return { errors, sysid: id[0].sysid };
}

/**
 * Server-side checks over `client`, which must be connected to the URL's database. `connectTo(name)`
 * must resolve to a NEW connected client for database `name`; it is used for postgres and template1
 * and every client it returns is closed here. Returns an array of error strings.
 */
export async function checkServerIsDisposable(client, { dbName, expectMajor, connectTo, secret }) {
  const errors = [];
  const q = async (sql, params) => (await client.query(sql, params)).rows;

  const [{ v }] = await q(`SELECT current_setting('server_version_num')::int / 10000 AS v`);
  if (expectMajor !== undefined && Number(v) !== expectMajor) errors.push(`server major version is ${v}, expected ${expectMajor}`);

  const [{ is_super, who }] = await q(`SELECT rolsuper AS is_super, current_user AS who FROM pg_roles WHERE rolname = current_user`);
  if (!is_super) errors.push(`role "${who}" is not a superuser; the migration-072 suite needs CREATE ROLE / CREATE DATABASE`);

  // Every database counts, including ones flagged datistemplate: the flag is settable by the owner and must not hide a database.
  const dbs = (await q(`SELECT datname FROM pg_database`)).map((r) => r.datname);
  const permitted = new Set(["postgres", "template0", "template1", dbName]);
  const extraDbs = dbs.filter((d) => !permitted.has(d));
  if (extraDbs.length > 0) errors.push(`server holds other database(s) (${extraDbs.join(", ")}): not a fresh disposable service`);

  const roles = (await q(`SELECT rolname FROM pg_roles WHERE rolname NOT LIKE 'pg\\_%' AND rolname <> current_user`)).map((r) => r.rolname);
  if (roles.length > 0) errors.push(`server holds other role(s) (${roles.join(", ")}): not a fresh disposable service`);

  // Database-local catalogues: inspect the URL database on this connection, then postgres and template1 each on their own.
  const own = await inspectDatabase(client, dbName, { secret });
  errors.push(...own.errors);
  if (own.sysid === undefined) return errors; // identity unproven: do not open further connections

  for (const target of inspectionTargets(dbName).filter((t) => t !== dbName)) {
    let other;
    try {
      if (typeof connectTo !== "function") throw new Error("no connection factory supplied");
      other = await connectTo(target);
    } catch (err) {
      errors.push(`database "${target}": cannot connect for inspection: ${redact(`${err?.code ?? ""} ${err?.message ?? err}`.replace(/\s+/g, " ").trim(), secret)}`);
      continue;
    }
    try {
      errors.push(...(await inspectDatabase(other, target, { expectedSysid: own.sysid, secret })).errors);
    } finally {
      await Promise.resolve(other.end()).catch(() => {});
    }
  }
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

  const raw = process.env.TEST_DATABASE_URL;
  const { default: pg } = await import("pg");
  const open = async (name) => {
    const c = new pg.Client({ connectionString: databaseUrlFor(raw, name), connectionTimeoutMillis: 10_000, query_timeout: 30_000 });
    try {
      await c.connect();
    } catch (err) {
      await c.end().catch(() => {});
      throw err;
    }
    return c;
  };
  let client;
  try {
    client = await open(urlCheck.dbName);
  } catch (err) {
    fail([redact(`cannot connect to TEST_DATABASE_URL: ${err.code ?? ""} ${err.message}`.trim(), raw)]);
  }
  let errors;
  try {
    errors = await checkServerIsDisposable(client, { dbName: urlCheck.dbName, expectMajor, connectTo: open, secret: raw });
  } catch (err) {
    errors = [redact(`server inspection failed: ${err.message}`, raw)];
  } finally {
    await client.end().catch(() => {});
  }
  if (errors.length > 0) fail(errors);
  const inspected = inspectionTargets(urlCheck.dbName).join(", ");
  console.log(`DATABASE SAFETY GUARD PASSED: loopback host${expectMajor ? `, server major ${expectMajor}` : ""}, superuser role, no databases beyond postgres, template0, template1 and "${urlCheck.dbName}", no roles beyond the connecting role and pg_* roles, and no user relations detected in: ${inspected}. This does not prove the server is safe for reused or shared use.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
