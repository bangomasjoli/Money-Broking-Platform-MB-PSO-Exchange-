/**
 * Own-session (bearer access-token) authentication guard for user-facing endpoints
 * (§04.2.7-2.8, §04.2.6/2.15 logout/logout-all). Resolves `Authorization: Bearer <token>`
 * to a session via hash + DB lookup (decision #2) and fails closed if it is missing,
 * malformed, expired, or revoked — this is the source of the F3(b) "missing client scope
 * fails closed" guarantee at the app layer (the RLS policy on iam.session/refresh_token/
 * device_registry/mfa_factor is the DB backstop for the same rule).
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { getPool } from "@aix/foundation";
import { IamError } from "../lib/errors.js";
import { validateAccessToken, type UserClass } from "../lib/session.js";

declare module "fastify" {
  interface FastifyRequest {
    iamSession?: { sessionId: string; userId: string; userClass: UserClass };
  }
}

function bearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header || Array.isArray(header)) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim();
}

export async function requireUserSession(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = bearerToken(request);
  if (!token) {
    // Fail closed: no resolvable scope at all — never fall through to an unscoped query.
    throw new IamError("AUTH_SESSION_REQUIRED");
  }
  const client = await getPool().connect();
  try {
    const session = await validateAccessToken(client, token);
    request.iamSession = { sessionId: session.session_id, userId: session.user_id, userClass: session.user_class };
    request.ctx.actor_id = session.user_id;
    request.ctx.actor_type = "user";
  } finally {
    client.release();
  }
}

/**
 * Set the RLS session variable (`aix.user_id`) on the transaction's connection before
 * running owner-scoped queries — the DB-level backstop for F3(b). Must be called with the
 * SAME client used for the subsequent query.
 *
 * `set_config(..., true)` sets the value LOCAL to the current transaction (cleared at
 * COMMIT/ROLLBACK) rather than for the whole session/connection — deliberately, since this
 * client came from a shared pool and must never leak `aix.user_id` into whatever the next
 * borrower of that connection does. That requires an explicit transaction: outside one,
 * every statement auto-commits its own implicit transaction, so a `true`-scoped
 * `set_config` would already be cleared by the time the next statement ran, silently
 * defeating the RLS scoping (and the app's own WHERE-clause filter would then be the ONLY
 * thing enforcing ownership, with the RLS "backstop" quietly not backstopping anything).
 */
export async function withUserScope<T>(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('aix.user_id', $1, true)", [userId]);
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore rollback failure; original error is the signal */
    }
    throw err;
  }
}
