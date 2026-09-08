/**
 * SEC-01 §5.5C ingestion-authenticity guard — resolves a presented ingestion bearer token to
 * its bound `source_module` via `sec1.source_identity_binding` (migration 008, seeded with one
 * row per approved source module: FND-01, IAM-01, IAM-02).
 *
 * Deliberately a SEPARATE mechanism from `plugins/internal-identity.ts`'s generic single-secret
 * guard: three different modules call the SAME ingestion endpoint, and a single shared secret
 * cannot tell them apart. This guard resolves WHICH module is calling by comparing the
 * presented token's sha256 hash against every ACTIVE binding's stored `token_hash`, using
 * `crypto.timingSafeEqual` (never `!==`) for every comparison — mirrors IAM-02's
 * `plugins/internal-identity.ts` constant-time-compare convention. `sec1.source_identity_binding`
 * has no RLS and is a tiny table (one row per approved module), so a full active-row scan with
 * a constant-time compare per row is cheap and avoids any timing/hash-oracle subtlety a
 * SQL `WHERE token_hash = $1` indexed-equality lookup could theoretically raise for a
 * security-critical identity boundary (unlike IAM-01's session/refresh-token hash lookups,
 * which use indexed SQL equality because those tables are large and the hash itself is
 * high-entropy random data, not a low-entropy shared secret guessable via any residual channel;
 * this ingestion credential is closer in shape to the interim internal-service-token secrets
 * this codebase always compares with `timingSafeEqual`).
 *
 * The route handler (routes/internal.ts / lib/ingest.ts) is responsible for comparing the
 * RESOLVED source_module (`request.resolvedSourceModule`) against each event's OWN declared
 * `source_module` field and rejecting a mismatch with `SEC1_SOURCE_MODULE_IDENTITY_MISMATCH` —
 * this guard only performs AUTHENTICATION (who is calling), never the per-event authorization
 * comparison (does this call's declared source_module match), so a batch request cannot smuggle
 * a foreign module's event under one authenticated identity by getting this guard to also
 * silently accept a body-supplied source_module.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError, getPool } from "@aix/foundation";
import { meta } from "./request-context.js";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

interface BindingRow {
  source_module: string;
  token_hash: string;
}

/**
 * Resolve a presented raw bearer token to its bound source_module, or null if no active
 * binding matches. Exported for direct unit testing of the constant-time-match logic against
 * a fake row set (no DB required).
 */
export function matchSourceIdentity(presentedToken: string, bindings: readonly BindingRow[]): string | null {
  const presentedHash = Buffer.from(sha256Hex(presentedToken), "utf8");
  for (const row of bindings) {
    const storedHash = Buffer.from(row.token_hash, "utf8");
    if (storedHash.length === presentedHash.length && timingSafeEqual(storedHash, presentedHash)) {
      return row.source_module;
    }
  }
  return null;
}

async function loadActiveBindings(): Promise<BindingRow[]> {
  const res = await getPool().query<BindingRow>(
    `SELECT source_module, token_hash FROM sec1.source_identity_binding WHERE status = 'active'`,
  );
  return res.rows;
}

export function makeRequireSourceIdentity() {
  return async function requireSourceIdentity(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const provided = request.headers["x-internal-service-token"];
    const token = Array.isArray(provided) ? provided[0] : provided;
    const fail = async (): Promise<FastifyReply> => {
      const err = new AppError("SERVICE_IDENTITY_REQUIRED");
      await reply.code(err.http).send({
        success: false,
        ...meta(request),
        error: { code: err.code, message: err.message, details: err.details },
      });
      return reply;
    };

    if (!token) {
      await fail();
      return;
    }

    const bindings = await loadActiveBindings();
    const resolved = matchSourceIdentity(token, bindings);
    if (!resolved) {
      await fail();
      return;
    }

    request.resolvedSourceModule = resolved;
    request.ctx.actor_id = request.ctx.actor_id ?? `sec1_ingest_${resolved}`;
    request.ctx.actor_type = "service";
  };
}
