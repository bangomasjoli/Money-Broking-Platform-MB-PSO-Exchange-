/**
 * CLT-01 — Authenticated Principal -> Client Membership Authority: dedicated integration coverage
 * for the read-only resolution route `GET /internal/clt1/principals/:iam_user_id/client-memberships`
 * (`services/clt1/src/routes/principal-memberships.ts`). Mirrors `tests/integration/clt1-db.test.ts`'s
 * own established shared-canonical-DB harness shape (own `RUNTIME_ROLE_USER`, own client_id
 * namespace prefix for `afterEach` isolation). Self-skips unless `TEST_DATABASE_URL` is set.
 *
 * add/request + add/apply's OWN binding behaviour (schema validation, maker-checker substitution
 * proof, duplicate-active mapping, concurrency) lives in `tests/integration/clt1-db.test.ts`. This
 * file's own concern is exclusively the RESOLUTION route: authority algorithm, no-oracle
 * semantics, projection, ordering, and fail-closed behaviour.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { closePool, initPool } from "@aix/foundation";
import type { Clt1Config } from "../../services/clt1/src/config.js";
import { buildApp } from "../../services/clt1/src/server.js";

const TEST_DB = process.env.TEST_DATABASE_URL;
const RUNTIME_ROLE_USER = "clt1_princmem_route_test";
const CLIENT_PREFIX = "clt1client_princmem_";

const config: Clt1Config = {
  environment: "dev",
  databaseUrl: TEST_DB ?? "postgres://unused",
  internalServiceToken: "test-clt1-shared-token-unused",
  port: 0,
  releaseVersion: "v0.1.0-it",
  artifactHash: "sha256:it",
  buildTimeUtc: "2026-01-01T00:00:00Z",
  clt1InternalServiceToken: "test-clt1-internal-token-princmem-it",
  cfg1BaseUrl: "http://127.0.0.1:0",
  cfg1InternalServiceToken: "test-clt1-cfg1-token-unused",
  iam2BaseUrl: "http://127.0.0.1:0",
  iam2InternalServiceToken: "test-clt1-iam2-token-unused",
};

const internalHeaders = { "x-internal-service-token": config.clt1InternalServiceToken };

let app: FastifyInstance;
let verifyPool: Pool;
let schemaReady = false;
let runtimeDbUrl: string;

async function schemasExist(): Promise<boolean> {
  try {
    const r = await verifyPool.query(`SELECT count(*) AS n FROM information_schema.columns WHERE table_schema = 'clt1' AND table_name = 'authorised_user' AND column_name = 'iam_user_id'`);
    return Number(r.rows[0]?.n) > 0;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  verifyPool = new Pool({ connectionString: TEST_DB ?? "postgres://unused" });
  schemaReady = await schemasExist();
  if (!schemaReady) return;

  await verifyPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE_USER}') THEN
        CREATE ROLE ${RUNTIME_ROLE_USER} LOGIN;
      END IF;
    END
    $$;
  `);
  await verifyPool.query(`GRANT role_clt1_runtime TO ${RUNTIME_ROLE_USER};`);

  runtimeDbUrl = (TEST_DB as string).replace(/^postgres:\/\/[^@]+@/, `postgres://${RUNTIME_ROLE_USER}@`);
  initPool(runtimeDbUrl);
  app = await buildApp(config);
});

afterAll(async () => {
  if (app) await app.close();
  await closePool();
  await verifyPool?.end();
});

afterEach(async () => {
  if (!schemaReady) return;
  await verifyPool.query(`DELETE FROM clt1.authorised_user WHERE client_id LIKE '${CLIENT_PREFIX}%'`);
  await verifyPool.query(`DELETE FROM clt1.client_profile WHERE client_id LIKE '${CLIENT_PREFIX}%'`);
  await verifyPool.query(`DELETE FROM clt1.client_application WHERE client_id LIKE '${CLIENT_PREFIX}%'`);
});

let clientCounter = 0;
async function insertClientProfile(status: "pending" | "active_limited" | "active" | "suspended" | "restricted" | "closed" = "active"): Promise<string> {
  clientCounter += 1;
  const clientId = CLIENT_PREFIX + clientCounter + "_" + randomUUID();
  const applicationId = "clt1app_princmem_" + randomUUID();
  await verifyPool.query(
    `INSERT INTO clt1.client_application (application_id, applicant_type, legal_name, client_class_claimed, status, client_id, created_by)
     VALUES ($1, 'corporate', 'Test Co', 'institutional', 'approved', $2, 'tester')`,
    [applicationId, clientId],
  );
  await verifyPool.query(
    `INSERT INTO clt1.client_profile (client_id, application_id, applicant_type, legal_name, client_class, status)
     VALUES ($1, $2, 'corporate', 'Test Co', 'institutional', $3)`,
    [clientId, applicationId, status],
  );
  return clientId;
}

async function insertAuthorisedUser(opts: {
  clientId: string;
  iamUserId?: string | null;
  status?: "active" | "inactive" | "suspended" | "revoked";
  role?: "client_admin" | "client_maker" | "client_approver" | "viewer";
}): Promise<string> {
  const authorisedUserId = "clt1au_princmem_" + randomUUID();
  await verifyPool.query(
    `INSERT INTO clt1.authorised_user (authorised_user_id, client_id, user_reference, role, status, requested_by, iam_user_id)
     VALUES ($1, $2, 'declared@example.com', $3, $4, 'staff_1', $5)`,
    [authorisedUserId, opts.clientId, opts.role ?? "viewer", opts.status ?? "active", opts.iamUserId ?? null],
  );
  return authorisedUserId;
}

function resolveMemberships(iamUserId: string, clientId?: string) {
  const query = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";
  return app.inject({
    method: "GET",
    url: `/internal/clt1/principals/${encodeURIComponent(iamUserId)}/client-memberships${query}`,
    headers: internalHeaders,
  });
}

describe("Authenticated Principal -> Client Membership Authority — GET /internal/clt1/principals/:iam_user_id/client-memberships", () => {
  it("H-fail-loud canary — schemaReady must be true whenever TEST_DATABASE_URL is set", () => {
    if (!TEST_DB) return;
    expect(schemaReady, "run migrate:up + fnd/clt1 runtime grants (migration 067 required) first").toBe(true);
  });

  it("A. UNBOUND membership (iam_user_id IS NULL) never resolves, even though the SAME user_reference/role/status would otherwise be a perfectly valid governed record", async () => {
    if (!schemaReady) return;
    const clientId = await insertClientProfile("active");
    await insertAuthorisedUser({ clientId, iamUserId: null, status: "active" });
    const res = await resolveMemberships("user_unbound_probe_" + randomUUID());
    expect(res.statusCode).toBe(200);
    expect(res.json().data.memberships).toEqual([]);
  });

  it("B. BOUND active membership + active client -> resolves", async () => {
    if (!schemaReady) return;
    const iamUserId = "user_b_" + randomUUID();
    const clientId = await insertClientProfile("active");
    await insertAuthorisedUser({ clientId, iamUserId, status: "active", role: "client_admin" });
    const res = await resolveMemberships(iamUserId);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.memberships).toHaveLength(1);
    expect(res.json().data.memberships[0]).toMatchObject({ client_id: clientId, role: "client_admin", membership_status: "active", client_status: "active" });
  });

  it("C. BOUND active membership + active_limited client -> resolves", async () => {
    if (!schemaReady) return;
    const iamUserId = "user_c_" + randomUUID();
    const clientId = await insertClientProfile("active_limited");
    await insertAuthorisedUser({ clientId, iamUserId, status: "active" });
    const res = await resolveMemberships(iamUserId);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.memberships).toHaveLength(1);
    expect(res.json().data.memberships[0].client_status).toBe("active_limited");
  });

  it("D. inactive membership -> []", async () => {
    if (!schemaReady) return;
    const iamUserId = "user_d_" + randomUUID();
    const clientId = await insertClientProfile("active");
    await insertAuthorisedUser({ clientId, iamUserId, status: "inactive" });
    const res = await resolveMemberships(iamUserId);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.memberships).toEqual([]);
  });

  it("E. suspended membership -> []", async () => {
    if (!schemaReady) return;
    const iamUserId = "user_e_" + randomUUID();
    const clientId = await insertClientProfile("active");
    await insertAuthorisedUser({ clientId, iamUserId, status: "suspended" });
    const res = await resolveMemberships(iamUserId);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.memberships).toEqual([]);
  });

  it("F. revoked membership -> []", async () => {
    if (!schemaReady) return;
    const iamUserId = "user_f_" + randomUUID();
    const clientId = await insertClientProfile("active");
    await insertAuthorisedUser({ clientId, iamUserId, status: "revoked" });
    const res = await resolveMemberships(iamUserId);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.memberships).toEqual([]);
  });

  it("G. client pending/suspended/restricted/closed each -> [] despite an otherwise-perfectly-bound active membership", async () => {
    if (!schemaReady) return;
    for (const clientStatus of ["pending", "suspended", "restricted", "closed"] as const) {
      const iamUserId = "user_g_" + clientStatus + "_" + randomUUID();
      const clientId = await insertClientProfile(clientStatus);
      await insertAuthorisedUser({ clientId, iamUserId, status: "active" });
      const res = await resolveMemberships(iamUserId);
      expect(res.statusCode, `client_status=${clientStatus}`).toBe(200);
      expect(res.json().data.memberships, `client_status=${clientStatus}`).toEqual([]);
    }
  });

  it("H. unknown iam_user_id -> [], byte-identical shape to every other no-authority state", async () => {
    if (!schemaReady) return;
    const res = await resolveMemberships("user_never_existed_" + randomUUID());
    expect(res.statusCode).toBe(200);
    expect(res.json().data.memberships).toEqual([]);
  });

  it("I. a foreign or nonexistent client_id selector narrows to [] — it can never substitute for genuine authority", async () => {
    if (!schemaReady) return;
    const iamUserId = "user_i_" + randomUUID();
    const clientId = await insertClientProfile("active");
    await insertAuthorisedUser({ clientId, iamUserId, status: "active" });

    const foreign = await resolveMemberships(iamUserId, "clt1client_someone_elses_client");
    expect(foreign.statusCode).toBe(200);
    expect(foreign.json().data.memberships).toEqual([]);

    const nonexistent = await resolveMemberships(iamUserId, CLIENT_PREFIX + "does_not_exist");
    expect(nonexistent.statusCode).toBe(200);
    expect(nonexistent.json().data.memberships).toEqual([]);

    // The SAME user, SAME real client, no selector -> genuinely resolves. Proves I is about the
    // selector narrowing, not a broken fixture.
    const real = await resolveMemberships(iamUserId, clientId);
    expect(real.json().data.memberships).toHaveLength(1);
  });

  it("J. multi-client membership: ALL eligible memberships are returned, none auto-selected as primary", async () => {
    if (!schemaReady) return;
    const iamUserId = "user_j_" + randomUUID();
    const clientA = await insertClientProfile("active");
    const clientB = await insertClientProfile("active_limited");
    await insertAuthorisedUser({ clientId: clientA, iamUserId, status: "active", role: "client_admin" });
    await insertAuthorisedUser({ clientId: clientB, iamUserId, status: "active", role: "viewer" });
    // A THIRD client where this user has no membership at all — must not leak in.
    await insertClientProfile("active");

    const res = await resolveMemberships(iamUserId);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.memberships).toHaveLength(2);
    const clientIds = res.json().data.memberships.map((m: { client_id: string }) => m.client_id).sort();
    expect(clientIds).toEqual([clientA, clientB].sort());
  });

  it("K. deterministic ordering: client_id ASC, authorised_user_id ASC — never incidental row order", async () => {
    if (!schemaReady) return;
    const iamUserId = "user_k_" + randomUUID();
    const clients: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const clientId = await insertClientProfile("active");
      await insertAuthorisedUser({ clientId, iamUserId, status: "active" });
      clients.push(clientId);
    }
    const res = await resolveMemberships(iamUserId);
    const returnedClientIds = res.json().data.memberships.map((m: { client_id: string }) => m.client_id);
    expect(returnedClientIds).toEqual([...clients].sort());
  });

  it("L. exact six-field item projection — no more, no fewer", async () => {
    if (!schemaReady) return;
    const iamUserId = "user_l_" + randomUUID();
    const clientId = await insertClientProfile("active");
    await insertAuthorisedUser({ clientId, iamUserId, status: "active", role: "client_maker" });
    const res = await resolveMemberships(iamUserId);
    const item = res.json().data.memberships[0];
    expect(Object.keys(item).sort()).toEqual(["authorised_user_id", "client_id", "client_status", "membership_status", "membership_version", "role"].sort());
  });

  it("M. no user_reference, PII, or IAM session/token field anywhere in the response — only the top-level iam_user_id echo", async () => {
    if (!schemaReady) return;
    const iamUserId = "user_m_" + randomUUID();
    const clientId = await insertClientProfile("active");
    await insertAuthorisedUser({ clientId, iamUserId, status: "active" });
    const res = await resolveMemberships(iamUserId);
    const body = JSON.stringify(res.json());
    expect(body).not.toContain("declared@example.com");
    expect(body).not.toContain("user_reference");
    for (const forbidden of ["email", "name", "session", "token", "password"]) {
      expect(body.toLowerCase()).not.toContain(forbidden);
    }
    expect(res.json().data.iam_user_id).toBe(iamUserId);
    expect(res.json().data).toHaveProperty("resolved_at_utc");
  });

  it("param schema: empty iam_user_id path segment is unreachable (405/404 route mismatch, never treated as a valid empty param)", async () => {
    if (!schemaReady) return;
    const res = await app.inject({ method: "GET", url: "/internal/clt1/principals//client-memberships", headers: internalHeaders });
    expect(res.statusCode).not.toBe(200);
  });

  it("param schema: a 65-character iam_user_id is rejected (400)", async () => {
    if (!schemaReady) return;
    const res = await resolveMemberships("u".repeat(65));
    expect(res.statusCode).toBe(400);
  });

  it("param schema: a 64-character iam_user_id is accepted (resolves to [])", async () => {
    if (!schemaReady) return;
    const res = await resolveMemberships("u".repeat(64));
    expect(res.statusCode).toBe(200);
    expect(res.json().data.memberships).toEqual([]);
  });

  it("query schema: an unexpected query field is rejected (additionalProperties: false)", async () => {
    if (!schemaReady) return;
    const res = await app.inject({
      method: "GET",
      url: `/internal/clt1/principals/${randomUUID()}/client-memberships?role=client_admin`,
      headers: internalHeaders,
    });
    expect(res.statusCode).toBe(400);
  });

  it("query schema: client_id selector length validation — 65 chars rejected, empty string rejected", async () => {
    if (!schemaReady) return;
    const tooLong = await resolveMemberships("user_x_" + randomUUID(), "c".repeat(65));
    expect(tooLong.statusCode).toBe(400);
    const empty = await app.inject({ method: "GET", url: `/internal/clt1/principals/${randomUUID()}/client-memberships?client_id=`, headers: internalHeaders });
    expect(empty.statusCode).toBe(400);
  });

  it("auth: missing internal-service token -> 401, never 404, and never a 200 with memberships", async () => {
    if (!schemaReady) return;
    const res = await app.inject({ method: "GET", url: `/internal/clt1/principals/${randomUUID()}/client-memberships` });
    expect(res.statusCode).toBe(401);
  });

  it("auth: wrong internal-service token -> 401", async () => {
    if (!schemaReady) return;
    const res = await app.inject({ method: "GET", url: `/internal/clt1/principals/${randomUUID()}/client-memberships`, headers: { "x-internal-service-token": "wrong-token" } });
    expect(res.statusCode).toBe(401);
  });

  it("N. DB/service unavailable -> 503 CLT1_SERVICE_UNAVAILABLE, NEVER a 200 with an empty memberships array (must remain LAST in this file — restores the pool afterward)", async () => {
    if (!schemaReady) return;
    await closePool();
    try {
      const res = await resolveMemberships("user_n_" + randomUUID());
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("CLT1_SERVICE_UNAVAILABLE");
      expect(res.json().data).toBeUndefined();
    } finally {
      initPool(runtimeDbUrl);
    }
  });
});
