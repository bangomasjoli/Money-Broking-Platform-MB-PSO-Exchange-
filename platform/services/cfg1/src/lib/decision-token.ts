/**
 * CFG-01 Phase 2 — decision-token issuance + verification (blueprint
 * `04_API_Specification.md` §2.2, `07_Permission_Rules.md` §8 "Decision Token Binding Rules").
 *
 * Opaque-token convention mirrors IAM-01's own pattern exactly (services/iam/src/lib/
 * session.ts) and IAM-02's own fresh copy of it (services/iam2/src/lib/decision-token.ts) — a
 * random opaque value is returned to the caller ONCE at issuance; only its sha256 hash is ever
 * persisted (approved decision #12: no raw token storage). This is CFG-01's own fresh copy of
 * that same small pattern, not an import of iam/iam2 internals (F3(c)).
 *
 * BOUNDED-REUSE, NOT SINGLE-USE (approved decision #1) — the deliberate departure from IAM-02's
 * own decision-token model, which consumes a token on its first successful execute-verify. A
 * CFG-01 decision token gates a repeatable capability question ("is this still allowed right
 * now"), closer in spirit to IAM-01's step-up assertion (deliberately not single-use — expected
 * to be checked multiple times within its freshness window) than to a one-shot mutation
 * authorization. Safety under reuse comes from re-checking EVERYTHING on every single
 * verify-decision call (approved decision #2), not from single-use consumption:
 *   - exact binding-field match (feature_code/action/resource/caller_module/client_id/
 *     client_class/environment) — a token minted for one context can never verify for another.
 *   - a fresh `verifyDecisionTimeIntegrity()` run on every call — if the underlying config has
 *     failed integrity since issuance, verification fails closed regardless of the token itself.
 *   - the token's bound prohibited_registry_version/hash re-compared against the CURRENT
 *     values on every call — any registry change invalidates every outstanding token on its
 *     very next use, even though none of them have "expired" in the TTL sense.
 *   - ANY mismatch revokes the token immediately (approved decision #3) — a corrected retry
 *     with the SAME token can never succeed, learning directly from IAM-02's own F1 finding
 *     (binding checked, but not until after a real production-shaped attack was reproduced).
 */
import { randomBytes, createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, systemTime } from "@aix/foundation";
import { computeDecisionPayloadHash, type DecisionResult } from "./decision.js";

function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Fresh CFG-01-owned copy of the platform's sha256Hex pattern — see file header comment. */
function sha256HexRaw(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * 5 minutes — shorter than IAM-02's 12-minute decision-token TTL (services/iam2/src/lib/
 * decision-token.ts) and IAM-01's 10-minute step-up window. CFG-01 tokens gate licence-lock/
 * prohibited-feature state, which the Phase 1 Opus review already flagged as more consequential
 * to get stale than an ordinary permission decision — deliberately revalidated more
 * aggressively than either precedent.
 */
const DECISION_TOKEN_TTL_MS = 5 * 60_000;

export interface DecisionTokenBindingInput {
  decisionId: string;
  featureCode: string;
  action: string;
  resource?: string | null;
  callerModule: string;
  clientId?: string | null;
  clientClass?: string | null;
  environment: string;
}

export interface IssueDecisionTokenInput extends DecisionTokenBindingInput {
  /** Must be an `allow` decision — callers never issue a token for a deny (approved design;
   * enforced structurally by the DB CHECK constraint on `decision` too). */
  decision: DecisionResult;
}

export interface IssuedDecisionToken {
  /** Raw opaque token — returned to the caller ONCE. Never persisted, never logged. */
  rawToken: string;
  tokenId: string;
  expiresAtUtc: string;
}

export async function issueDecisionToken(client: PoolClient, input: IssueDecisionTokenInput): Promise<IssuedDecisionToken> {
  const rawToken = generateOpaqueToken();
  const tokenHash = sha256HexRaw(rawToken);
  const tokenId = "cfgtok_" + randomUUID();
  const expiresAtUtc = new Date(systemTime.nowDate().getTime() + DECISION_TOKEN_TTL_MS).toISOString();

  await client.query(
    `INSERT INTO cfg1.feature_decision_token
       (token_id, decision_id, token_hash, feature_code, action, resource, caller_module, client_id, client_class,
        environment, decision, reason_code, feature_config_version, licence_profile_version,
        prohibited_registry_version, prohibited_registry_hash, doc00_source_version, payload_hash, status,
        expires_at_utc, created_at_utc)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'allow',$11,$12,$13,$14,$15,$16,$17,'active',$18, now())`,
    [
      tokenId,
      input.decisionId,
      tokenHash,
      input.featureCode,
      input.action,
      input.resource ?? null,
      input.callerModule,
      input.clientId ?? null,
      input.clientClass ?? null,
      input.environment,
      input.decision.reasonCode,
      input.decision.featureConfigVersion,
      input.decision.licenceProfileVersion,
      input.decision.prohibitedRegistryVersion,
      input.decision.prohibitedRegistryHash,
      input.decision.doc00SourceVersion,
      input.decision.payloadHash,
      expiresAtUtc,
    ],
  );

  return { rawToken, tokenId, expiresAtUtc };
}

export type VerifyDecisionTokenReasonCode =
  | "CFG1_DECISION_TOKEN_INVALID"
  | "CFG1_DECISION_TOKEN_EXPIRED"
  | "CFG1_DECISION_TOKEN_REVOKED"
  | "CFG1_DECISION_BINDING_MISMATCH"
  | "CFG1_TOKEN_REVOKED_BY_KILL_SWITCH";

export type VerifyDecisionTokenResult =
  | { ok: true; tokenId: string; decisionId: string; featureCode: string }
  | { ok: false; reasonCode: VerifyDecisionTokenReasonCode };

export interface VerifyDecisionTokenInput extends DecisionTokenBindingInput {
  tokenRaw: string;
}

/** The fresh integrity/version state to re-check the token's BOUND values against — supplied
 * by the caller (route handler), which must have already re-run `verifyDecisionTimeIntegrity`
 * on the SAME transaction before calling this (approved decision #2).
 *
 * Phase 3A extension (approved decision #8): `licenceProfileVersion` and `featureConfigVersion`
 * were added alongside the Phase 2 prohibited-registry fields — before Phase 3A, nothing could
 * ever change `cfg1.licence_profile.version` or create/mutate a `cfg1.feature` row, so comparing
 * them would have been dead code. Now that a mutation workflow exists, a token issued before a
 * licence-profile or feature-state change must fail on its very next verify, exactly the same
 * "any registry change invalidates every outstanding token" guarantee Phase 2 already gave the
 * prohibited registry. `featureConfigVersion` is the CALLER's responsibility to look up fresh
 * (the current `cfg1.feature.version` for the SPECIFIC feature_code being verified, or `null` if
 * no feature row exists for it) — this file has no opinion on which feature_code is in scope. */
export interface CurrentIntegrityState {
  prohibitedRegistryVersion: number | null;
  prohibitedRegistryHash: string | null;
  licenceProfileVersion: number | null;
  /** Current `cfg1.feature.version` for the token's bound feature_code, or `null` if no feature
   * row exists for it (including because it was never created). Compared only when the token
   * itself was issued with a non-null `feature_config_version` (approved decision #8's "if
   * feature row exists" — an allow decision, the only kind that ever mints a token, always has a
   * real feature row and therefore a real bound version, but this stays defensive rather than
   * assuming that invariant can never change). */
  featureConfigVersion: number | null;
}

interface DecisionTokenRow {
  token_id: string;
  decision_id: string;
  feature_code: string;
  action: string;
  resource: string | null;
  caller_module: string;
  client_id: string | null;
  client_class: string | null;
  environment: string;
  prohibited_registry_version: number;
  prohibited_registry_hash: string;
  licence_profile_version: number;
  feature_config_version: number | null;
  payload_hash: string;
  status: string;
  expires_at_utc: string;
}

async function revoke(client: PoolClient, tokenId: string, reason: string): Promise<void> {
  await client.query(
    `UPDATE cfg1.feature_decision_token SET status = 'revoked', revoked_at_utc = now(), revoked_reason = $2 WHERE token_id = $1`,
    [tokenId, reason],
  );
}

/**
 * Verification order: existence -> already-revoked -> expiry -> binding fields (exact,
 * null-safe — a token bound to e.g. client_id = null only matches a presented value that is
 * ALSO null/undefined, never a wildcard) -> recomputed payload_hash (redundant with the field
 * checks by design — defence in depth, catches any field the individual comparisons might
 * miss) -> kill-switch (Phase 3B) -> current prohibited-registry version/hash re-check. ANY
 * failure from the binding check onward revokes the token (approved decision #3);
 * existence/already-revoked/expiry checks do not re-revoke an already-terminal token.
 *
 * `killSwitchActive` (Phase 3B, approved decisions #13/#14) is supplied by the CALLER
 * (`routes/features.ts`), computed via `lib/kill-switch.ts`'s `isKillSwitchActiveForFeature`
 * for the token's bound `feature_code`, fresh on every call — this file has no opinion on how
 * that's determined, the same division of responsibility `featureConfigVersion` already
 * establishes in `CurrentIntegrityState`. Deliberately NOT folded into `CurrentIntegrityState`'s
 * version-comparison mechanism: kill-switch is a live active/inactive boolean, not a mutable
 * registry that benefits from version-hash drift detection, and adding it there would require
 * an `ALTER TABLE` on the already-accepted Phase 2 `cfg1.feature_decision_token` table for no
 * real benefit over a direct, fresh, unversioned check.
 */
export async function verifyDecisionToken(
  client: PoolClient,
  input: VerifyDecisionTokenInput,
  currentIntegrity: CurrentIntegrityState,
  killSwitchActive: boolean,
): Promise<VerifyDecisionTokenResult> {
  const tokenHash = sha256HexRaw(input.tokenRaw);
  const rows = await query<DecisionTokenRow>(
    client,
    `SELECT token_id, decision_id, feature_code, action, resource, caller_module, client_id, client_class, environment,
            prohibited_registry_version, prohibited_registry_hash, licence_profile_version, feature_config_version,
            payload_hash, status, expires_at_utc
       FROM cfg1.feature_decision_token WHERE token_hash = $1`,
    [tokenHash],
  );
  const row = rows[0];

  if (!row) return { ok: false, reasonCode: "CFG1_DECISION_TOKEN_INVALID" };
  if (row.status === "revoked") return { ok: false, reasonCode: "CFG1_DECISION_TOKEN_REVOKED" };
  if (new Date(row.expires_at_utc).getTime() <= Date.now()) return { ok: false, reasonCode: "CFG1_DECISION_TOKEN_EXPIRED" };

  const presentedResource = input.resource ?? null;
  const presentedClientId = input.clientId ?? null;
  const presentedClientClass = input.clientClass ?? null;
  const recomputedPayloadHash = computeDecisionPayloadHash(input);

  const bindingMismatch =
    row.decision_id !== input.decisionId ||
    row.feature_code !== input.featureCode ||
    row.action !== input.action ||
    row.resource !== presentedResource ||
    row.caller_module !== input.callerModule ||
    row.client_id !== presentedClientId ||
    row.client_class !== presentedClientClass ||
    row.environment !== input.environment ||
    row.payload_hash !== recomputedPayloadHash;

  if (bindingMismatch) {
    await revoke(client, row.token_id, "binding_mismatch");
    return { ok: false, reasonCode: "CFG1_DECISION_BINDING_MISMATCH" };
  }

  // Phase 3B (approved decisions #13/#14): an active kill-switch revokes the token immediately,
  // checked BEFORE the ordinary config-changed re-check below — kill-switch is a stronger,
  // more urgent condition (an emergency control), the same precedence relationship
  // lib/decision.ts's own evaluateFeature() gives it relative to ordinary feature-state checks.
  if (killSwitchActive) {
    await revoke(client, row.token_id, "kill_switch_active");
    return { ok: false, reasonCode: "CFG1_TOKEN_REVOKED_BY_KILL_SWITCH" };
  }

  // Approved decision #2: re-check current config/version/hash state on EVERY call, not just
  // at issuance. A registry change since issuance invalidates the token on its very next use,
  // independent of whether it has nominally expired yet. Phase 3A extension (approved decision
  // #8): licence-profile version and (when the token was bound to a real feature row)
  // feature-config version are now part of this same re-check — a feature-state or
  // licence-profile mutation invalidates every outstanding token bound to the mutated scope on
  // its very next use, the same guarantee Phase 2 already gave the prohibited registry.
  const configChanged =
    row.prohibited_registry_version !== currentIntegrity.prohibitedRegistryVersion ||
    row.prohibited_registry_hash !== currentIntegrity.prohibitedRegistryHash ||
    row.licence_profile_version !== currentIntegrity.licenceProfileVersion ||
    (row.feature_config_version !== null && row.feature_config_version !== currentIntegrity.featureConfigVersion);

  if (configChanged) {
    await revoke(client, row.token_id, "config_changed");
    return { ok: false, reasonCode: "CFG1_DECISION_BINDING_MISMATCH" };
  }

  await client.query(`UPDATE cfg1.feature_decision_token SET last_verified_at_utc = now() WHERE token_id = $1`, [row.token_id]);

  return { ok: true, tokenId: row.token_id, decisionId: row.decision_id, featureCode: row.feature_code };
}
