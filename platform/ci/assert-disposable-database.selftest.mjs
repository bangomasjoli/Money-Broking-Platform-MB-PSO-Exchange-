/**
 * AIX-CI-001 — offline controls for the URL half of assert-disposable-database.mjs.
 * Run: node --test ci/assert-disposable-database.selftest.mjs   (from platform/)
 * The server-side emptiness checks need a live Postgres and are exercised in the postgres job.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkDatabaseUrl } from "./assert-disposable-database.mjs";

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
