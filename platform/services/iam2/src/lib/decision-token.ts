/**
 * IAM-02 Phase 3 — approval-to-execution binding: decision-token issuance + verification.
 *
 * `iam2.permission_decision_token` is deliberately NOT RLS-protected (see
 * infra/migrations/006_iam2_core.cjs header comment — same class as IAM-01's
 * `iam.step_up_assertion`: a pre-auth-shaped hash lookup, resolved by `token_hash` before the
 * owning actor is known). This file is the ONLY code that reads/writes that table.
 *
 * Token shape mirrors IAM-01's own opaque-token convention exactly (services/iam/src/lib/
 * session.ts `generateOpaqueToken`/`sha256Hex`): a random opaque value is returned to the
 * caller ONCE at issuance; only its sha256 hash is ever persisted. This is a fresh IAM-02-owned
 * copy of that same small pattern, not an import of services/iam internals (F3(c) import
 * boundary) — mirrors how routes/internal.ts's internal-identity guard already keeps its own
 * copy of IAM-01's constant-time-compare pattern.
 *
 * `07_Permission_Rules.md` §9 "Approval Binding Rules": a decision token binds actor, session,
 * action, entity, payload hash, cache version, approval, and step-up — every one of those
 * fields is a column on `permission_decision_token` and is filled in at issuance time.
 */
import { randomBytes, createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { publishAudit, systemTime } from "@aix/foundation";
import { lookupCacheVersion } from "./guard.js";

/** Fresh IAM-02-owned copy of IAM-01's opaque-token pattern — see file header comment. */
function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Fresh IAM-02-owned copy of IAM-01's sha256Hex pattern — see file header comment. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** §9 rule 4: decision-token TTL. 12 minutes — inside the brief's suggested 10-15 minute
 * window and close to IAM-01's own step-up-assertion TTL (10 minutes), the closest existing
 * platform precedent for "how long should a just-completed authorisation stay usable". */
const DECISION_TOKEN_TTL_MS = 12 * 60_000;

export interface IssueDecisionTokenInput {
  actorUserId: string;
  sessionId?: string | null;
  authLevel?: string | null;
  action: string;
  resource: string;
  entityId?: string | null;
  clientId?: string | null;
  payloadHash?: string | null;
  approvalId?: string | null;
  stepUpAssertionRef?: string | null;
  /** The actor's iam2.permission_cache_version AT ISSUANCE TIME — bound into the token so
   * execute-verify can detect "something about this actor's permissions changed since the
   * decision was made" (§9 rule 5 "stale decision token fails closed"). */
  cacheVersion: number;
}

export interface IssuedDecisionToken {
  /** Raw opaque token — returned to the caller ONCE. Never persisted in plaintext. */
  rawToken: string;
  decisionTokenId: string;
  expiresAtUtc: string;
}

export async function issueDecisionToken(
  client: PoolClient,
  input: IssueDecisionTokenInput,
): Promise<IssuedDecisionToken> {
  const rawToken = generateOpaqueToken();
  const tokenHash = sha256Hex(rawToken);
  const decisionTokenId = "dtok_" + randomUUID();
  const expiresAtUtc = new Date(systemTime.nowDate().getTime() + DECISION_TOKEN_TTL_MS).toISOString();

  await client.query(
    `INSERT INTO iam2.permission_decision_token
       (decision_token_id, token_hash, actor_user_id, session_id, auth_level, action, resource,
        entity_id, client_id, payload_hash, approval_id, step_up_assertion_ref, cache_version,
        status, issued_at_utc, expires_at_utc)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active', now(), $14)`,
    [
      decisionTokenId,
      tokenHash,
      input.actorUserId,
      input.sessionId ?? null,
      input.authLevel ?? null,
      input.action,
      input.resource,
      input.entityId ?? null,
      input.clientId ?? null,
      input.payloadHash ?? null,
      input.approvalId ?? null,
      input.stepUpAssertionRef ?? null,
      input.cacheVersion,
      expiresAtUtc,
    ],
  );

  await publishAudit(client, {
    event_type: "iam2.decision_token_issued",
    source_module: "IAM-02",
    actor_id: input.actorUserId,
    actor_type: "user",
    entity_type: input.resource,
    entity_id: input.entityId ?? input.action,
    metadata: { action: input.action, approval_id: input.approvalId ?? null, cache_version: input.cacheVersion },
  });

  return { rawToken, decisionTokenId, expiresAtUtc };
}

export type DecisionTokenFailureReason =
  | "IAM2_DECISION_TOKEN_INVALID"
  | "IAM2_PAYLOAD_HASH_MISMATCH"
  | "IAM2_DECISION_TOKEN_STALE";

export type DecisionTokenVerifyResult =
  | {
      ok: true;
      decisionTokenId: string;
      actorUserId: string;
      sessionId: string | null;
      action: string;
      resource: string;
      entityId: string | null;
      clientId: string | null;
      approvalId: string | null;
      /** F1 fix — these reflect what was ACTUALLY checked on this call, not a hardcoded
       * `true`. `verifiedPayloadHash` is true only when the token had a real (non-null)
       * payload_hash that was compared and matched — a null/null comparison (a token with no
       * execution binding, which can no longer even be issued after the F1 approval-side fix
       * below, but is still possible via a permission/check call with no payloadHash reaching
       * this far only if `currentPayloadHash` is also omitted) is NOT "verified", it's
       * vacuous. `verifiedSession` is true only when both the token's bound session_id and the
       * presented sessionId were actually present and compared (not the common case where an
       * approval-issued token has session_id = null and nothing meaningful was checked).
       * `verifiedCacheVersion` is unconditionally computed every call that reaches this point
       * (an actual mismatch would already have returned IAM2_DECISION_TOKEN_STALE above), so
       * it is legitimately always true here. */
      verifiedPayloadHash: boolean;
      verifiedSession: boolean;
      verifiedCacheVersion: boolean;
    }
  | { ok: false; reasonCode: DecisionTokenFailureReason };

export interface VerifyDecisionTokenInput {
  tokenRaw: string;
  /**
   * F1 fix — `07_Permission_Rules.md` §9 "Approval Binding Rules" / `04_API_Specification.md`
   * §5.9: the token must be re-validated against the SAME actor/action/resource/entity/client
   * it was issued for. These four (plus the existing `currentPayloadHash`/`sessionId` below)
   * are compared against `permission_decision_token`'s stored bound columns; any mismatch is
   * treated identically to an invalid/expired token (`IAM2_DECISION_TOKEN_INVALID`) — from the
   * caller's point of view a binding mismatch and an unusable token are the same "this token
   * cannot authorise this execution" outcome (the audit trail distinguishes them internally,
   * see the binding-check block below).
   *
   * Null-safe: `entityId`/`clientId` follow the SAME convention as `currentPayloadHash` — a
   * token bound to `entity_id = null` (or `client_id = null`) only matches a presented value
   * that is ALSO null/undefined. A null-bound field is never treated as a wildcard that
   * matches anything presented.
   */
  actorUserId: string;
  action: string;
  resource: string;
  entityId?: string | null;
  clientId?: string | null;
  /** `null`/`undefined` means "no payload for this action" — must match the token's stored
   * payload_hash exactly (also null/undefined) or it is treated as a mismatch. */
  currentPayloadHash?: string | null;
  /** If supplied, must match the token's bound session_id (Rule "session/freeze/auth-level
   * invalidation blocks execution", §2.2 rule 4) — a token issued under one session cannot be
   * redeemed while presenting a different session_id. */
  sessionId?: string | null;
}

interface DecisionTokenRow {
  decision_token_id: string;
  actor_user_id: string;
  session_id: string | null;
  action: string;
  resource: string;
  entity_id: string | null;
  client_id: string | null;
  payload_hash: string | null;
  approval_id: string | null;
  cache_version: number | null;
  status: string;
  expires_at_utc: string;
}

/**
 * §2.2 / §9 execute-verify binding check, single-use. Resolves BY HASH (no RLS on this table —
 * see file header). Order: existence/status/expiry -> binding fields
 * (actor/action/resource/entity/client, F1 fix) -> payload hash -> cache version -> consume.
 * Binding checks are placed right after existence/status/expiry and BEFORE the payload-hash
 * check because a binding mismatch (this token was never issued for this actor/action/
 * resource/entity/client at all) is the more fundamental failure — no point comparing a
 * payload hash for an execution the token was never bound to in the first place.
 */
export async function verifyAndConsumeDecisionToken(
  client: PoolClient,
  input: VerifyDecisionTokenInput,
): Promise<DecisionTokenVerifyResult> {
  const tokenHash = sha256Hex(input.tokenRaw);
  const rows = await client.query<DecisionTokenRow>(
    `SELECT decision_token_id, actor_user_id, session_id, action, resource, entity_id, client_id,
            payload_hash, approval_id, cache_version, status, expires_at_utc
       FROM iam2.permission_decision_token
      WHERE token_hash = $1`,
    [tokenHash],
  );
  const row = rows.rows[0];

  const notFoundOrExpiredOrWrongState =
    !row ||
    row.status !== "active" ||
    new Date(row.expires_at_utc).getTime() <= Date.now() ||
    (input.sessionId !== undefined && input.sessionId !== null && row.session_id !== null && row.session_id !== input.sessionId);
  if (notFoundOrExpiredOrWrongState) {
    return { ok: false, reasonCode: "IAM2_DECISION_TOKEN_INVALID" };
  }

  // ---- F1 fix: binding check — actor/action/resource/entity/client must match the token's
  // stored bound values (07_Permission_Rules.md §9). Null-safe (see VerifyDecisionTokenInput's
  // header comment): a token bound to entity_id/client_id = null only matches a presented
  // value that is ALSO null/undefined, never a wildcard. This is what closes F1 — previously
  // NONE of these fields were compared, so a token minted for one actor/action/entity could be
  // redeemed for a completely different one as long as the (optional) payload hash matched.
  const presentedEntityId = input.entityId ?? null;
  const presentedClientId = input.clientId ?? null;
  const bindingMismatch =
    row!.actor_user_id !== input.actorUserId ||
    row!.action !== input.action ||
    row!.resource !== input.resource ||
    row!.entity_id !== presentedEntityId ||
    row!.client_id !== presentedClientId;
  if (bindingMismatch) {
    // Same discipline as the payload-hash-mismatch branch below (Critical, token revoked so
    // it can never be retried) but a DISTINCT event type — this is a binding mismatch, not
    // specifically a payload-hash mismatch, and the two are worth telling apart in the audit
    // trail even though they collapse to the same caller-facing reason code. Metadata mirrors
    // the existing payload-hash-mismatch shape (action/approval_id, no raw mismatched values).
    await client.query(`UPDATE iam2.permission_decision_token SET status = 'revoked' WHERE decision_token_id = $1`, [
      row!.decision_token_id,
    ]);
    await publishAudit(client, {
      event_type: "iam2.decision_token_binding_mismatch",
      source_module: "IAM-02",
      actor_id: row!.actor_user_id,
      actor_type: "user",
      entity_type: row!.resource,
      entity_id: row!.entity_id ?? row!.action,
      metadata: { action: row!.action, approval_id: row!.approval_id ?? null },
    });
    return { ok: false, reasonCode: "IAM2_DECISION_TOKEN_INVALID" };
  }

  const tokenPayloadHash = row!.payload_hash ?? null;
  const presentedPayloadHash = input.currentPayloadHash ?? null;
  if (tokenPayloadHash !== presentedPayloadHash) {
    // §9 rule 3 / brief: Critical, and the token can never be retried after a mismatch.
    await client.query(`UPDATE iam2.permission_decision_token SET status = 'revoked' WHERE decision_token_id = $1`, [
      row!.decision_token_id,
    ]);
    await publishAudit(client, {
      event_type: "iam2.approval_payload_hash_mismatch",
      source_module: "IAM-02",
      actor_id: row!.actor_user_id,
      actor_type: "user",
      entity_type: row!.resource,
      entity_id: row!.entity_id ?? row!.action,
      metadata: { action: row!.action, approval_id: row!.approval_id ?? null },
    });
    return { ok: false, reasonCode: "IAM2_PAYLOAD_HASH_MISMATCH" };
  }

  const currentCacheVersion = await lookupCacheVersion(client, row!.actor_user_id);
  if ((row!.cache_version ?? 0) !== currentCacheVersion) {
    // Deliberately NOT consumed here (§9 rule 5 doesn't say "revoke", just "fails closed") —
    // a stale-cache-version block is a "your permissions changed, re-check" outcome, not a
    // forged-payload attack; leaving status as-is lets it simply expire naturally.
    await publishAudit(client, {
      event_type: "iam2.decision_token_stale_blocked",
      source_module: "IAM-02",
      actor_id: row!.actor_user_id,
      actor_type: "user",
      entity_type: row!.resource,
      entity_id: row!.entity_id ?? row!.action,
      metadata: { action: row!.action, bound_cache_version: row!.cache_version, current_cache_version: currentCacheVersion },
    });
    return { ok: false, reasonCode: "IAM2_DECISION_TOKEN_STALE" };
  }

  await client.query(`UPDATE iam2.permission_decision_token SET status = 'consumed' WHERE decision_token_id = $1`, [
    row!.decision_token_id,
  ]);

  return {
    ok: true,
    decisionTokenId: row!.decision_token_id,
    actorUserId: row!.actor_user_id,
    sessionId: row!.session_id,
    action: row!.action,
    resource: row!.resource,
    entityId: row!.entity_id,
    clientId: row!.client_id,
    approvalId: row!.approval_id,
    // F1 fix — real flags, not hardcoded true (see DecisionTokenVerifyResult's header comment
    // for exactly what "verified" means for each).
    verifiedPayloadHash: tokenPayloadHash !== null,
    verifiedSession: row!.session_id !== null && input.sessionId !== undefined && input.sessionId !== null,
    verifiedCacheVersion: true,
  };
}
