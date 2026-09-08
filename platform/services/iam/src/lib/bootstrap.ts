/**
 * First-admin break-glass bootstrap (decision #3).
 *
 * Env-flag gated (`IAM_BOOTSTRAP_ENABLED=true`). Runs at service startup. Creates exactly
 * ONE initial admin identity, but ONLY if `iam.user_identity` is completely empty — the
 * presence of any row is the "already bootstrapped / consumed" marker, so this is safely
 * idempotent across restarts without a separate flag table. The created admin:
 *   - is marked `is_interim_admin = true` (interim until IAM-02 owns the real role model —
 *     no RBAC/permission grant is created here, just an authentication-layer marker);
 *   - has `mfa_required = true` and `privileged_mfa_required = true` (forces MFA before a
 *     full session can ever be issued — see routes/auth.ts login handler);
 *   - has `credential_password.must_change_password = true` (forces a password change);
 *   - is fully audited via the standard transaction-coupled `publishAudit` + `auth_event`.
 *
 * MFA enrolment endpoints are DEFERRED this pass (see IAM-01_IMPLEMENTATION_NOTES.md), so in
 * practice this account cannot complete login into a full session until that lands — it will
 * perpetually receive the `mfa_required` challenge-state response. That is intentional
 * secure-by-default behaviour, not a bug: a bootstrap admin must not be usable end-to-end
 * without explicit further setup.
 */
import { randomUUID } from "node:crypto";
import { createRequestContext, publishAudit, runWithContext, withTransaction } from "@aix/foundation";
import type { IamConfig } from "../config.js";
import { hashPassword } from "./password.js";
import { sha256Hex, insertAuthEvent } from "./session.js";

export async function runBootstrap(config: IamConfig): Promise<void> {
  if (!config.bootstrapEnabled) return;
  if (!config.bootstrapAdminIdentifier || !config.bootstrapAdminPassword) return; // validated at config load; defensive no-op

  // publishAudit derives correlation_id from the active request context; bootstrap runs at
  // startup outside any request, so give it one explicitly rather than falling through to
  // "corr_unknown".
  const ctx = createRequestContext({ actorType: "system", actorId: "iam_system_bootstrap" });
  await runWithContext(ctx, () => runBootstrapTransaction(config, ctx.correlation_id));
}

async function runBootstrapTransaction(config: IamConfig, correlationId: string): Promise<void> {
  await withTransaction(async (client) => {
    const existing = await client.query(`SELECT 1 FROM iam.user_identity LIMIT 1`);
    if ((existing.rowCount ?? 0) > 0) {
      // Already bootstrapped (or real users exist) — the bootstrap path is consumed.
      return;
    }

    const identifierNormalised = config.bootstrapAdminIdentifier!.trim().toLowerCase();
    const identifierHash = sha256Hex(identifierNormalised);
    const userId = "user_" + randomUUID();

    await client.query(
      `INSERT INTO iam.user_identity
         (user_id, user_type, identifier_normalised, identifier_hash, status, mfa_required,
          privileged_mfa_required, user_class, is_interim_admin, created_at_utc, updated_at_utc)
       VALUES ($1,'admin',$2,$3,'active',true,true,'admin',true,now(),now())`,
      [userId, identifierNormalised, identifierHash],
    );

    const hashed = await hashPassword(config.bootstrapAdminPassword!);
    await client.query(
      `INSERT INTO iam.credential_password
         (user_id, password_hash, hash_algorithm, hash_params, password_changed_at_utc,
          must_change_password, failed_attempt_count, created_at_utc, updated_at_utc)
       VALUES ($1,$2,$3,$4,now(),true,0,now(),now())`,
      [userId, hashed.hash, hashed.algorithm, JSON.stringify(hashed.params)],
    );

    await publishAudit(client, {
      event_type: "iam.bootstrap.admin_created",
      source_module: "IAM-01",
      actor_id: "iam_system_bootstrap",
      actor_type: "system",
      entity_type: "user_identity",
      entity_id: userId,
      metadata: { user_class: "admin", is_interim_admin: true, must_change_password: true, mfa_required: true },
    });
    await insertAuthEvent(client, {
      eventType: "iam.bootstrap.admin_created",
      userId,
      result: "success",
      correlationId,
    });
  });
}
