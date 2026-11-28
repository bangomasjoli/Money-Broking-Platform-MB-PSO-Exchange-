/**
 * AIX-CI-001 / AIX-CI-HARD-001 L1 — offline controls for assert-disposable-database.mjs.
 * Run: node --test ci/assert-disposable-database.selftest.mjs   (from platform/)
 * No PostgreSQL is needed: the URL checks are pure, and the server-side checks run against a small
 * in-memory fake cluster (connection selection, identity, fail-closed paths, cleanup). The real
 * SQL semantics (relation kinds, catalogue locality) are exercised against a live disposable
 * PostgreSQL 16 server in the postgres job and in the task's live verification, not here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkDatabaseUrl, checkServerIsDisposable, databaseUrlFor, inspectionTargets, redact, USER_RELATION_SQL } from "./assert-disposable-database.mjs";

const GUARD = fileURLToPath(new URL("./assert-disposable-database.mjs", import.meta.url));

test("accepts a loopback postgres URL", () => {
  for (const u of ["postgres://u:p@localhost:5432/aix_ci", "postgresql://u:p@127.0.0.1:5432/aix_ci", "postgres://u:p@[::1]:5432/aix_ci"]) {
    const r = checkDatabaseUrl(u);
    assert.equal(r.ok, true, `${u}: ${r.errors}`);
    assert.equal(r.dbName, "aix_ci");
  }
});

test("rejects missing, blank and unparseable URLs", () => {
  for (const u of [undefined, "", "   ", "not a url"]) assert.equal(checkDatabaseUrl(u).ok, false, String(u));
});

test("rejects external / non-loopback hosts", () => {
  for (const u of ["postgres://u:p@db.example.com:5432/x", "postgres://u:p@10.0.0.5:5432/x", "postgres://u:p@localhost.evil.test:5432/x", "postgres://u:p@aix-prod.rds.amazonaws.com/x"]) {
    const r = checkDatabaseUrl(u);
    assert.equal(r.ok, false, u);
    assert.match(r.errors.join(" "), /not loopback/);
  }
});

test("rejects a host= override that would redirect a loopback-looking URL", () => {
  const r = checkDatabaseUrl("postgres://u:p@localhost/x?host=db.example.com");
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /"host" query override/);
});

test("rejects a non-postgres protocol and a missing database name", () => {
  assert.equal(checkDatabaseUrl("mysql://u:p@localhost/x").ok, false);
  assert.equal(checkDatabaseUrl("postgres://u:p@localhost").ok, false);
});

test("the CLI exits 1 (not 0) when TEST_DATABASE_URL is unset or external, and never echoes the password", () => {
  for (const url of [undefined, "postgres://u:s3cr3tpw@db.example.com:5432/x"]) {
    const env = { ...process.env };
    delete env.TEST_DATABASE_URL;
    if (url) env.TEST_DATABASE_URL = url;
    const r = spawnSync(process.execPath, [GUARD], { env, encoding: "utf8" });
    assert.equal(r.status, 1, `${url}: ${r.stdout}${r.stderr}`);
    assert.doesNotMatch(`${r.stdout}${r.stderr}`, /s3cr3tpw/);
  }
});

// ---------------------------------------------------------------------------------------------
// AIX-CI-HARD-001 L1 — server-side checks against an in-memory fake cluster.
// ---------------------------------------------------------------------------------------------
const PW = "s3cr3tpw";
const RAW = `postgres://postgres:${PW}@127.0.0.1:5432/aix_ci`;

/**
 * A fake cluster. `opts`: rels {db: n}, sysid, version, superuser, otherDbs, otherRoles,
 * templateDbs (extra databases flagged datistemplate), identity {db: reportedName}, sysids {db: id},
 * failConnect (db names), failQuery (db names), malformed (db names). Every client it hands out is tracked in `clients` so cleanup is checkable.
 */
function fakeCluster(opts = {}) {
  const o = { rels: {}, sysid: "7001", version: 16, superuser: true, otherDbs: [], templateDbs: [], otherRoles: [], identity: {}, sysids: {}, failConnect: [], failQuery: [], malformed: [], ...opts };
  const clients = [];
  const connects = [];
  const make = (db) => {
    const c = { db, ended: 0 };
    c.end = async () => {
      c.ended++;
    };
    c.query = async (sql) => {
      if (o.failQuery.includes(db) && /pg_class|current_database/.test(sql)) throw new Error(`boom for ${PW} in ${db}`);
      if (/server_version_num/.test(sql)) return { rows: [{ v: o.version }] };
      if (/rolsuper/.test(sql)) return { rows: [{ is_super: o.superuser, who: "postgres" }] };
      if (/FROM pg_database/.test(sql)) {
        // Like the real catalogue: templates are rows too, flagged datistemplate; a `NOT datistemplate` filter hides them.
        const all = [["aix_ci", false], ["postgres", false], ["template0", true], ["template1", true], ...o.otherDbs.map((d) => [d, false]), ...o.templateDbs.map((d) => [d, true])];
        return { rows: all.filter(([, t]) => !(/NOT datistemplate/.test(sql) && t)).map(([datname]) => ({ datname })) };
      }
      if (/NOT LIKE 'pg/.test(sql)) return { rows: o.otherRoles.map((rolname) => ({ rolname })) };
      if (/current_database\(\)/.test(sql)) {
        if (o.malformed.includes(db)) return { rows: [] };
        return { rows: [{ db: o.identity[db] ?? db, sysid: o.sysids[db] ?? o.sysid }] };
      }
      if (/pg_class/.test(sql)) {
        const n = o.rels[db] ?? 0;
        return { rows: [{ n, sample: Array.from({ length: Math.min(n, 3) }, (_, i) => `public.t${i} (r)`) }] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    };
    clients.push(c);
    return c;
  };
  const connectTo = async (name) => {
    connects.push(name);
    if (o.failConnect.includes(name)) throw Object.assign(new Error(`connect refused for ${PW}`), { code: "ECONNREFUSED" });
    return make(name);
  };
  return { primary: make("aix_ci"), connectTo, clients, connects };
}
const run = (cl, extra = {}) => checkServerIsDisposable(cl.primary, { dbName: "aix_ci", expectMajor: 16, connectTo: cl.connectTo, secret: RAW, ...extra });
const joined = (errs) => errs.join("\n");

test("a clean fake cluster passes and inspects exactly aix_ci, postgres and template1", async () => {
  const cl = fakeCluster();
  assert.deepEqual(await run(cl), []);
  assert.deepEqual(cl.connects, ["postgres", "template1"]);
  assert.deepEqual(inspectionTargets("aix_ci"), ["aix_ci", "postgres", "template1"]);
});

test("contamination in the URL database, postgres or template1 each fails, independently", async () => {
  for (const db of ["aix_ci", "postgres", "template1"]) {
    const errs = await run(fakeCluster({ rels: { [db]: 2 } }));
    assert.equal(errs.length, 1, `${db}: ${joined(errs)}`);
    assert.match(errs[0], new RegExp(`database "${db}" already contains 2 user relation`));
  }
});

test("the relation query covers every supported relkind in every non-system schema", () => {
  for (const k of ["'r'", "'p'", "'v'", "'m'", "'S'", "'f'"]) assert.ok(USER_RELATION_SQL.includes(k), `missing relkind ${k}`);
  for (const s of ["pg_catalog", "information_schema", "pg_toast"]) assert.ok(USER_RELATION_SQL.includes(`'${s}'`));
  assert.doesNotMatch(USER_RELATION_SQL, /nspname\s*=\s*'public'/i, "must not be limited to the public schema");
});

test("duplicate targets are collapsed when the URL database is postgres or template1", async () => {
  for (const dbName of ["postgres", "template1"]) {
    assert.deepEqual(inspectionTargets(dbName), [dbName, ...["postgres", "template1"].filter((d) => d !== dbName)]);
    const cl = fakeCluster();
    cl.primary.db = dbName;
    const errs = await checkServerIsDisposable(
      { end: cl.primary.end, query: async (sql) => (/FROM pg_database/.test(sql) ? { rows: [{ datname: dbName }] } : /current_database\(\)/.test(sql) ? { rows: [{ db: dbName, sysid: "7001" }] } : cl.primary.query(sql)) },
      { dbName, expectMajor: 16, secret: RAW, connectTo: cl.connectTo },
    );
    assert.deepEqual(errs, [], dbName);
    assert.deepEqual(cl.connects, ["postgres", "template1"].filter((d) => d !== dbName), `${dbName}: only the OTHER system database is opened`);
    assert.ok(!cl.connects.includes(dbName), "the URL database must not be opened a second time");
  }
});

test("a required database that cannot be connected to fails closed, and the others are still inspected", async () => {
  const errs = await run(fakeCluster({ failConnect: ["postgres"], rels: { template1: 1 } }));
  assert.match(errs[0], /database "postgres": cannot connect for inspection/);
  assert.match(joined(errs), /database "template1" already contains 1 user relation/);
  assert.equal(errs.length, 2);
});

test("a missing connection factory fails closed rather than skipping postgres/template1", async () => {
  const errs = await checkServerIsDisposable(fakeCluster().primary, { dbName: "aix_ci", expectMajor: 16, secret: RAW });
  assert.equal(errs.length, 2);
  assert.match(joined(errs), /database "postgres": cannot connect for inspection/);
  assert.match(joined(errs), /database "template1": cannot connect for inspection/);
});

test("an inspection query failure fails closed (never read as zero relations)", async () => {
  for (const db of ["aix_ci", "postgres", "template1"]) {
    const errs = await run(fakeCluster({ failQuery: [db] }));
    assert.ok(errs.length >= 1, db);
    assert.match(joined(errs), new RegExp(`database "${db}": inspection failed`));
  }
});

test("malformed or empty inspection results fail closed", async () => {
  for (const db of ["aix_ci", "postgres", "template1"]) {
    const errs = await run(fakeCluster({ malformed: [db] }));
    assert.match(joined(errs), new RegExp(`database "${db}": identity query returned an invalid result`), db);
  }
  // a relation count that is not a non-negative integer must also be rejected
  const bad = fakeCluster();
  const orig = bad.primary.query;
  bad.primary.query = async (sql) => (/pg_class/.test(sql) ? { rows: [{ n: "0", sample: [] }] } : orig(sql));
  assert.match(joined(await run(bad)), /database "aix_ci": relation query returned an invalid result/);
});

test("an unexpected connected database name fails closed", async () => {
  for (const db of ["aix_ci", "postgres", "template1"]) {
    const errs = await run(fakeCluster({ identity: { [db]: "somewhere_else" } }));
    assert.match(joined(errs), new RegExp(`database "${db}": connected to database "somewhere_else", expected "${db}"`), db);
  }
});

test("a connection that reaches a different cluster fails closed", async () => {
  const errs = await run(fakeCluster({ sysids: { postgres: "9999" } }));
  assert.match(joined(errs), /database "postgres": connected to a different PostgreSQL cluster/);
});

test("when the first connection's identity is wrong, no further connections are opened", async () => {
  const cl = fakeCluster({ identity: { aix_ci: "other" } });
  const errs = await run(cl);
  assert.match(joined(errs), /expected "aix_ci"/);
  assert.deepEqual(cl.connects, []);
});

test("existing server controls still fire: version, superuser, extra databases, extra roles", async () => {
  const all = joined(await run(fakeCluster({ version: 15, superuser: false, otherDbs: ["prod"], otherRoles: ["app"] })));
  assert.match(all, /server major version is 15, expected 16/);
  assert.match(all, /role "postgres" is not a superuser/);
  assert.match(all, /other database\(s\) \(prod\)/);
  assert.match(all, /other role\(s\) \(app\)/);
});

test("an unexpected database is rejected even when flagged datistemplate; the permitted inventory still passes", async () => {
  for (const sc of [{ templateDbs: ["hidden_tpl"] }, { otherDbs: ["hidden_plain"] }, { templateDbs: ["hidden_tpl"], otherDbs: ["hidden_plain"] }]) {
    const cl = fakeCluster(sc);
    const errs = await run(cl);
    const extra = [...(sc.otherDbs ?? []), ...(sc.templateDbs ?? [])].sort();
    assert.equal(errs.length, 1, joined(errs));
    assert.match(errs[0], /server holds other database\(s\)/);
    for (const d of extra) assert.ok(errs[0].includes(d), `${d} named in: ${errs[0]}`);
    assert.doesNotMatch(errs[0], /template0|template1/, "the permitted template0/template1 are not reported");
    assert.ok(!cl.connects.includes("template0") && !cl.connects.includes("hidden_tpl"), "no connection to template0 or the extra database");
  }
  // permitted inventory only (postgres, template0, template1, the URL database) passes with no database error
  assert.deepEqual(await run(fakeCluster()), []);
});

test("every connection opened by the check is closed, on success and on every failure path", async () => {
  const scenarios = [{}, { rels: { postgres: 1, template1: 1 } }, { failQuery: ["postgres"] }, { malformed: ["template1"] }, { identity: { template1: "x" } }, { sysids: { postgres: "1" } }, { failConnect: ["template1"] }];
  for (const sc of scenarios) {
    const cl = fakeCluster(sc);
    await run(cl);
    const opened = cl.clients.filter((c) => c !== cl.primary);
    assert.equal(opened.length, 2 - (sc.failConnect?.length ?? 0), JSON.stringify(sc));
    for (const c of opened) assert.equal(c.ended, 1, `${JSON.stringify(sc)}: client for ${c.db} closed ${c.ended}x`);
    assert.equal(cl.primary.ended, 0, "the caller owns the primary connection");
  }
});

test("diagnostics never contain the password or the connection string", async () => {
  const out = joined(await run(fakeCluster({ failConnect: ["postgres"], failQuery: ["template1"] })));
  assert.match(out, /cannot connect for inspection/);
  assert.match(out, /inspection failed/);
  assert.doesNotMatch(out, new RegExp(PW));
  assert.doesNotMatch(out, /postgres:\/\/postgres:/);
  assert.equal(redact(`failed for ${RAW} / ${PW}`, RAW), "failed for [redacted] / [redacted]");
  assert.equal(redact("x", undefined), "x");
});

test("additional connection URLs change only the database name", () => {
  const u = new URL(databaseUrlFor("postgres://u:p%40ss@localhost:5433/aix_ci?sslmode=disable", "template1"));
  assert.equal(u.pathname, "/template1");
  assert.equal(`${u.protocol}//${u.username}:${u.password}@${u.host}${u.search}`, "postgres://u:p%40ss@localhost:5433?sslmode=disable");
  assert.equal(new URL(databaseUrlFor("postgres://u:p@[::1]:5432/x", "postgres")).hostname, "[::1]");
});

test("the CLI fails closed (exit 1) when a loopback server cannot be reached, without echoing the password", () => {
  const env = { ...process.env, TEST_DATABASE_URL: "postgres://postgres:s3cr3tpw@127.0.0.1:1/aix_ci" };
  const r = spawnSync(process.execPath, [GUARD], { env, encoding: "utf8" });
  assert.equal(r.status, 1, `${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /DATABASE SAFETY GUARD FAILED/);
  assert.doesNotMatch(`${r.stdout}${r.stderr}`, /s3cr3tpw/);
});
