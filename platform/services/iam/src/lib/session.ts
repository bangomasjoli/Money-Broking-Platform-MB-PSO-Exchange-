/**
 * IAM-01 session/refresh-token lifecycle (decision #2, IAM-FR-007/008/009, blueprint §5.7-5.10).
 *
 * Opaque bearer tokens: the raw token is generated with `crypto.randomBytes` and returned to
 * the caller exactly once; only `sha256(token)` is ever persisted (`session_token_hash` /
 * `refresh_token.token_hash`). Validation is hash + DB lookup, never token decoding — this
 * gives instant server-side revocation (blueprint §5.7 rule 2), which a self-contained JWT
 * would not.
 */
import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { publishAudit, systemTime } from "@aix/foundation";
import { IamError } from "./errors.js";

export type UserClass = "admin" | "staff" | "client" | "client_approver" | "service";
export type AuthLevel = "password" | "mfa" | "webauthn" | "step_up";

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

interface SessionPolicyRow {
  user_class: UserClass;
  access_token_ttl_seconds: number;
  refresh_token_ttl_seconds: number;
  idle_timeout_seconds: number | null;
  max_session_lifetime_seconds: number;
  reauth_interval_seconds: number | null;
  max_concurrent_sessions: number;
  token_binding_level: string;
}

export async function resolveSessionPolicy(client: PoolClient, userClass: UserClass): Promise<SessionPolicyRow> {
  const rows = await client.query<SessionPolicyRow>(
    `SELECT user_class, access_token_ttl_seconds, refresh_token_ttl_seconds, idle_timeout_seconds,
            max_session_lifetime_seconds, reauth_interval_seconds, max_concurrent_sessions, token_binding_level
       FROM iam.session_policy WHERE user_class = $1 AND status = 'active'`,
    [userClass],
  );
  const row = rows.rows[0];
  if (!row) {
    // §09 Error Handling §4 rule 12: session policy cannot be resolved -> fail closed.
    throw new IamError("AUTH_SESSION_POLICY_UNAVAILABLE", {
      message: `No active session policy for user class '${userClass}'.`,
    });
  }
  return row;
}

/**
 * §5.10: enforce the per-class concurrent-session cap by revoking the oldest active
 * sessions beyond the limit before a new one is issued. Emits an audit event when eviction
 * occurs. Must be called with the SAME transaction client that will insert the new session.
 */
async function enforceConcurrentLimit(
  client: PoolClient,
  userId: string,
  maxConcurrentSessions: number,
): Promise<void> {
  const existing = await client.query<{ session_id: string }>(
    `SELECT session_id FROM iam.session
      WHERE user_id = $1 AND session_status = 'active'
      ORDER BY issued_at_utc ASC`,
    [userId],
  );
  const overBy = existing.rows.length - (maxConcurrentSessions - 1);
  if (overBy <= 0) return;
  const toEvict = existing.rows.slice(0, overBy).map((r) => r.session_id);
  await client.query(
    `UPDATE iam.session SET session_status = 'revoked', revoked_at_utc = now(), revoke_reason = 'concurrent_session_limit'
      WHERE session_id = ANY($1::varchar[])`,
    [toEvict],
  );
  await client.query(
    `UPDATE iam.refresh_token SET status = 'revoked'
      WHERE session_id = ANY($1::varchar[]) AND status = 'active'`,
    [toEvict],
  );
  await publishAudit(client, {
    event_type: "iam.concurrent_session_limit_enforced",
    source_module: "IAM-01",
    actor_id: userId,
    actor_type: "user",
    entity_type: "user_identity",
    entity_id: userId,
    metadata: { evicted_session_count: toEvict.length, max_concurrent_sessions: maxConcurrentSessions },
  });
}

export interface IssuedSession {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  tokenFamilyId: string;
  expiresAtUtc: string;
  refreshExpiresAtUtc: string;
}

export interface CreateSessionInput {
  userId: string;
  userClass: UserClass;
  authLevel: AuthLevel;
  deviceId?: string;
  sourceIpHash?: string;
  userAgentHash?: string;
  correlationId: string;
}

export async function createSession(client: PoolClient, input: CreateSessionInput): Promise<IssuedSession> {
  // S1 gap-closing patch: iam.session/iam.refresh_token carry FORCE RLS with an ownership
  // policy (user_id = current_setting('aix.user_id', true)), which under role_iam_runtime
  // (non-superuser) applies to INSERT's implicit WITH CHECK too, not just SELECT. The caller
  // (login / MFA-challenge-verify route handlers) always invokes createSession from inside an
  // explicit withTransaction, so scoping aix.user_id to the now-known owning user here — the
  // same set_config(..., true) pattern plugins/user-session.ts's withUserScope already uses —
  // makes the INSERTs below (and enforceConcurrentLimit's read/evict of this user's own prior
  // sessions) satisfy the ownership predicate instead of being silently denied.
  await client.query("SELECT set_config('aix.user_id', $1, true)", [input.userId]);

  const policy = await resolveSessionPolicy(client, input.userClass);
  await enforceConcurrentLimit(client, input.userId, policy.max_concurrent_sessions);

  const nowMs = systemTime.nowDate().getTime();
  const sessionId = "sess_" + randomUUID();
  const accessToken = generateOpaqueToken();
  const sessionTokenHash = sha256Hex(accessToken);
  const expiresAtUtc = new Date(nowMs + policy.access_token_ttl_seconds * 1000).toISOString();
  const reauthRequiredAtUtc = policy.reauth_interval_seconds
    ? new Date(nowMs + policy.reauth_interval_seconds * 1000).toISOString()
    : null;

  await client.query(
    `INSERT INTO iam.session
       (session_id, session_token_hash, user_id, session_status, issued_at_utc, expires_at_utc,
        user_class, auth_level, reauth_required_at_utc, bound_device_id, risk_status, device_id,
        source_ip_hash, user_agent_hash, last_seen_at_utc, correlation_id)
     VALUES ($1,$2,$3,'active',now(),$4,$5,$6,$7,$8,'normal',$8,$9,$10,now(),$11)`,
    [
      sessionId,
      sessionTokenHash,
      input.userId,
      expiresAtUtc,
      input.userClass,
      input.authLevel,
      reauthRequiredAtUtc,
      input.deviceId ?? null,
      input.sourceIpHash ?? null,
      input.userAgentHash ?? null,
      input.correlationId,
    ],
  );

  const tokenFamilyId = "fam_" + randomUUID();
  const refreshToken = generateOpaqueToken();
  const refreshTokenHash = sha256Hex(refreshToken);
  const tokenId = "rtok_" + randomUUID();
  const refreshExpiresAtUtc = new Date(nowMs + policy.refresh_token_ttl_seconds * 1000).toISOString();

  await client.query(
    `INSERT INTO iam.refresh_token
       (token_id, token_hash, token_family_id, session_id, user_id, status, issued_at_utc, expires_at_utc)
     VALUES ($1,$2,$3,$4,$5,'active',now(),$6)`,
    [tokenId, refreshTokenHash, tokenFamilyId, sessionId, input.userId, refreshExpiresAtUtc],
  );

  return { sessionId, accessToken, refreshToken, tokenFamilyId, expiresAtUtc, refreshExpiresAtUtc };
}

interface SessionRow {
  session_id: string;
  user_id: string;
  session_status: "active" | "expired" | "revoked";
  expires_at_utc: string;
  user_class: UserClass;
}

/**
 * Hash + DB lookup validation of a bearer access token (decision #2). Never decodes a token.
 *
 * S1 gap-closing patch: this runs on a bare, non-transactional pooled connection (see
 * plugins/user-session.ts's requireUserSession) BEFORE the owning user_id is known, so it
 * cannot rely on `aix.user_id` scoping the way authenticated routes do. iam.session carries
 * FORCE RLS with an ownership policy, so under role_iam_runtime a direct `SELECT ... WHERE
 * session_token_hash = $1` (or the last_seen UPDATE that follows) would silently return zero
 * rows / touch zero rows — auth would fail closed to "not found" on every request. Both the
 * resolve and the touch go through SECURITY DEFINER functions
 * (infra/migrations/003_iam_rls_token_lookup.cjs) instead, which is the ONLY RLS bypass this
 * module grants role_iam_runtime, and only for exactly this pre-auth shape of lookup.
 */
export async function validateAccessToken(client: PoolClient, token: string): Promise<SessionRow> {
  const hash = sha256Hex(token);
  const rows = await client.query<SessionRow>(`SELECT * FROM iam.fn_resolve_session_by_token_hash($1)`, [hash]);
  const row = rows.rows[0];
  if (!row) throw new IamError("AUTH_SESSION_REQUIRED");
  if (row.session_status === "revoked") throw new IamError("AUTH_SESSION_REVOKED");
  if (row.session_status === "expired" || new Date(row.expires_at_utc).getTime() <= Date.now()) {
    throw new IamError("AUTH_SESSION_EXPIRED");
  }
  const user = await client.query<{ status: string }>(`SELECT status FROM iam.user_identity WHERE user_id = $1`, [
    row.user_id,
  ]);
  if (user.rows[0]?.status && user.rows[0].status !== "active") {
    throw new IamError("AUTH_ACCOUNT_FROZEN");
  }
  // S3 (deferred, documented, not implemented this pass): throttle this write to only fire
  // when last_seen_at_utc is stale by N seconds, instead of on every single call.
  await client.query(`SELECT iam.fn_touch_session_last_seen($1)`, [row.session_id]);
  return row;
}

/**
 * S1 gap-closing patch: `sessionId` alone does not carry the owning user_id, and
 * iam.session/iam.refresh_token carry FORCE RLS, so callers must pass the ALREADY-
 * ESTABLISHED owning userId (from an authenticated request.iamSession, or from a caller that
 * has independently resolved it) — this sets `aix.user_id` for the rest of the ambient
 * transaction before touching either table, exactly like createSession/rotateRefreshToken.
 */
export async function revokeSession(
  client: PoolClient,
  input: { sessionId: string; userId: string; reason: string },
): Promise<{ userId: string } | null> {
  await client.query("SELECT set_config('aix.user_id', $1, true)", [input.userId]);
  const rows = await client.query<{ user_id: string }>(
    `UPDATE iam.session SET session_status = 'revoked', revoked_at_utc = now(), revoke_reason = $2
      WHERE session_id = $1 AND session_status != 'revoked'
      RETURNING user_id`,
    [input.sessionId, input.reason],
  );
  await client.query(`UPDATE iam.refresh_token SET status = 'revoked' WHERE session_id = $1 AND status = 'active'`, [
    input.sessionId,
  ]);
  const row = rows.rows[0];
  return row ? { userId: row.user_id } : null;
}

/**
 * S1 gap-closing patch: scopes `aix.user_id` to `input.userId` before touching iam.session/
 * iam.refresh_token (FORCE RLS). Used both for a user revoking their own sessions AND for
 * internal/system-initiated bulk revocation (freeze-event, admin revoke-all) where the ACTOR
 * is not `input.userId` — that is fine: RLS ownership is about which rows are being written
 * (they belong to `input.userId`), not who the caller is; the internal-identity guard is the
 * authority check for those routes, RLS is defense-in-depth on top of it.
 */
export async function revokeAllSessionsForUser(
  client: PoolClient,
  input: { userId: string; reason: string },
): Promise<number> {
  await client.query("SELECT set_config('aix.user_id', $1, true)", [input.userId]);
  const rows = await client.query(
    `UPDATE iam.session SET session_status = 'revoked', revoked_at_utc = now(), revoke_reason = $2
      WHERE user_id = $1 AND session_status = 'active'
      RETURNING session_id`,
    [input.userId, input.reason],
  );
  await client.query(`UPDATE iam.refresh_token SET status = 'revoked' WHERE user_id = $1 AND status = 'active'`, [
    input.userId,
  ]);
  return rows.rowCount ?? 0;
}

export interface RotatedSession {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  expiresAtUtc: string;
  refreshExpiresAtUtc: string;
}

interface RefreshTokenRow {
  token_id: string;
  token_family_id: string;
  session_id: string;
  user_id: string;
  status: string;
  expires_at_utc: string;
}

/**
 * Tagged result rather than a thrown error: the "reuse detected" / "account frozen" paths
 * below MUST persist their revocation + Critical audit rows, which would be lost if we threw
 * inside this function and let `withTransaction` roll the transaction back. The route handler
 * inspects `outcome` AFTER the transaction has committed and decides the HTTP response there.
 */
export type RotateRefreshResult =
  | { outcome: "not_found" }
  | { outcome: "reuse_detected" }
  | { outcome: "expired" }
  | { outcome: "session_revoked" }
  | { outcome: "account_frozen" }
  | { outcome: "rotated"; session: RotatedSession };

/**
 * §5.9/IAM-FR-009: rotate on use, detect reuse. A refresh token presented in any state other
 * than 'active' (used/revoked/reused/expired) is treated as reuse — the ENTIRE token family
 * and its session are revoked and a Critical audit event is emitted. Every call re-checks
 * user/account status (blueprint §5.7 rule 3) before rotating.
 *
 * S1 gap-closing patch: the initial resolve is BY TOKEN HASH, before the owning user_id is
 * known, so it goes through the same SECURITY DEFINER function pattern as
 * validateAccessToken (see its comment / infra/migrations/003_iam_rls_token_lookup.cjs).
 * Once resolved, this function IS always called from inside an explicit withTransaction
 * (routes/auth.ts's /auth/refresh handler) — so, exactly like createSession, we scope
 * `aix.user_id` to the now-known owner for the rest of this transaction. That makes every
 * subsequent read/write below (revokeTokenFamily, the session/refresh_token UPDATEs, the new
 * refresh_token INSERT) satisfy the ownership RLS policy instead of being silently denied
 * under role_iam_runtime.
 */
export async function rotateRefreshToken(
  client: PoolClient,
  input: { refreshToken: string; correlationId: string },
): Promise<RotateRefreshResult> {
  const hash = sha256Hex(input.refreshToken);
  const rows = await client.query<RefreshTokenRow>(`SELECT * FROM iam.fn_resolve_refresh_by_token_hash($1)`, [hash]);
  const token = rows.rows[0];
  if (!token) return { outcome: "not_found" };

  await client.query("SELECT set_config('aix.user_id', $1, true)", [token.user_id]);

  if (token.status !== "active") {
    // Reuse of a used/revoked/expired token -> revoke the whole family + session, Critical audit.
    await revokeTokenFamily(client, token.token_family_id);
    await client.query(
      `UPDATE iam.session SET session_status = 'revoked', revoked_at_utc = now(), revoke_reason = 'refresh_reuse_detected'
        WHERE session_id = $1 AND session_status = 'active'`,
      [token.session_id],
    );
    await publishAudit(client, {
      event_type: "iam.refresh_reuse_detected",
      source_module: "IAM-01",
      actor_id: token.user_id,
      actor_type: "user",
      entity_type: "refresh_token",
      entity_id: token.token_id,
      metadata: { token_family_id: token.token_family_id, session_id: token.session_id, prior_status: token.status },
    });
    await insertAuthEvent(client, {
      eventType: "iam.refresh_reuse_detected",
      userId: token.user_id,
      result: "blocked",
      correlationId: input.correlationId,
    });
    return { outcome: "reuse_detected" };
  }

  if (new Date(token.expires_at_utc).getTime() <= Date.now()) {
    await client.query(`UPDATE iam.refresh_token SET status = 'expired' WHERE token_id = $1`, [token.token_id]);
    return { outcome: "expired" };
  }

  const session = await client.query<{ session_status: string; user_class: UserClass }>(
    `SELECT session_status, user_class FROM iam.session WHERE session_id = $1`,
    [token.session_id],
  );
  const sessionRow = session.rows[0];
  if (!sessionRow || sessionRow.session_status !== "active") {
    return { outcome: "session_revoked" };
  }

  // §5.7 rule 3: re-check user/account status on every refresh call.
  const user = await client.query<{ status: string }>(`SELECT status FROM iam.user_identity WHERE user_id = $1`, [
    token.user_id,
  ]);
  if (user.rows[0]?.status !== "active") {
    await revokeTokenFamily(client, token.token_family_id);
    await client.query(
      `UPDATE iam.session SET session_status = 'revoked', revoked_at_utc = now(), revoke_reason = 'account_frozen'
        WHERE session_id = $1 AND session_status = 'active'`,
      [token.session_id],
    );
    await publishAudit(client, {
      event_type: "iam.frozen_user_refresh_denied",
      source_module: "IAM-01",
      actor_id: token.user_id,
      actor_type: "user",
      entity_type: "refresh_token",
      entity_id: token.token_id,
      metadata: { session_id: token.session_id },
    });
    await insertAuthEvent(client, {
      eventType: "iam.frozen_user_refresh_denied",
      userId: token.user_id,
      result: "blocked",
      correlationId: input.correlationId,
    });
    return { outcome: "account_frozen" };
  }

  const policy = await resolveSessionPolicy(client, sessionRow.user_class);
  const nowMs = systemTime.nowDate().getTime();

  // Mark the presented token used and link the rotation.
  const newTokenId = "rtok_" + randomUUID();
  await client.query(
    `UPDATE iam.refresh_token SET status = 'used', used_at_utc = now(), replaced_by_token_id = $2 WHERE token_id = $1`,
    [token.token_id, newTokenId],
  );

  const newRefreshToken = generateOpaqueToken();
  const newRefreshExpiresAtUtc = new Date(nowMs + policy.refresh_token_ttl_seconds * 1000).toISOString();
  await client.query(
    `INSERT INTO iam.refresh_token
       (token_id, token_hash, token_family_id, session_id, user_id, status, issued_at_utc, expires_at_utc)
     VALUES ($1,$2,$3,$4,$5,'active',now(),$6)`,
    [newTokenId, sha256Hex(newRefreshToken), token.token_family_id, token.session_id, token.user_id, newRefreshExpiresAtUtc],
  );

  const newAccessToken = generateOpaqueToken();
  const newExpiresAtUtc = new Date(nowMs + policy.access_token_ttl_seconds * 1000).toISOString();
  await client.query(
    `UPDATE iam.session
        SET session_token_hash = $2, expires_at_utc = $3, last_seen_at_utc = now()
      WHERE session_id = $1`,
    [token.session_id, sha256Hex(newAccessToken), newExpiresAtUtc],
  );

  await publishAudit(client, {
    event_type: "iam.session_refreshed",
    source_module: "IAM-01",
    actor_id: token.user_id,
    actor_type: "user",
    entity_type: "session",
    entity_id: token.session_id,
    metadata: { token_family_id: token.token_family_id },
  });
  await insertAuthEvent(client, {
    eventType: "iam.session_refreshed",
    userId: token.user_id,
    result: "success",
    correlationId: input.correlationId,
  });

  return {
    outcome: "rotated",
    session: {
      sessionId: token.session_id,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAtUtc: newExpiresAtUtc,
      refreshExpiresAtUtc: newRefreshExpiresAtUtc,
    },
  };
}

async function revokeTokenFamily(client: PoolClient, tokenFamilyId: string): Promise<void> {
  await client.query(`UPDATE iam.refresh_token SET status = 'revoked' WHERE token_family_id = $1 AND status = 'active'`, [
    tokenFamilyId,
  ]);
}

/**
 * `iam.auth_event` insert — NON-authoritative index metadata only (§05.8). `audit_event_ref`
 * is an interim reference into the correlation chain (publishAudit's outbox row id is not
 * returned to callers); SEC-01 remains the store of record. See IAM-01_IMPLEMENTATION_NOTES.md.
 */
export async function insertAuthEvent(
  client: PoolClient,
  input: { eventType: string; userId: string | null; result: "success" | "failure" | "blocked"; correlationId: string },
): Promise<void> {
  await client.query(
    `INSERT INTO iam.auth_event (event_type, user_id, result, correlation_id, occurred_at_utc, audit_event_ref)
     VALUES ($1,$2,$3,$4,now(),$5)`,
    [input.eventType, input.userId, input.result, input.correlationId, `corr:${input.correlationId}:${input.eventType}`],
  );
}

/** S1 gap-closing patch: iam.device_registry also carries FORCE RLS ownership; scope first. */
export async function upsertDevice(
  client: PoolClient,
  input: { userId: string; deviceId: string; deviceLabel?: string },
): Promise<void> {
  await client.query("SELECT set_config('aix.user_id', $1, true)", [input.userId]);
  await client.query(
    `INSERT INTO iam.device_registry
       (device_id, user_id, device_fingerprint_hash, device_label, first_seen_at_utc, last_seen_at_utc, trusted_status, risk_status)
     VALUES ($1,$2,$3,$4,now(),now(),'unknown','normal')
     ON CONFLICT (user_id, device_id) DO UPDATE
       SET last_seen_at_utc = now(),
           device_label = COALESCE(EXCLUDED.device_label, iam.device_registry.device_label)`,
    [input.deviceId, input.userId, sha256Hex(input.deviceId), input.deviceLabel ?? null],
  );
}
