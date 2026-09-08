/**
 * IAM-02 Phase 5 — permission cache invalidation. `iam2.permission_cache_version` has no RLS
 * (small state table, no owner — see 006_iam2_core.cjs header comment); `subject_id` carries a
 * UNIQUE constraint, which is what makes the upsert below race-safe under concurrent bumps for
 * the SAME subject (`ON CONFLICT` serialises on that unique index).
 *
 * `guard.ts`'s `lookupCacheVersion` remains the only READER; this is the only WRITER.
 */
import type { PoolClient } from "pg";
import { publishAudit } from "@aix/foundation";

export async function bumpCacheVersion(client: PoolClient, subjectId: string, reason: string): Promise<number> {
  const res = await client.query<{ cache_version: number }>(
    `INSERT INTO iam2.permission_cache_version (subject_id, cache_version, invalidated_at_utc, reason)
     VALUES ($1, 1, now(), $2)
     ON CONFLICT (subject_id) DO UPDATE
       SET cache_version = iam2.permission_cache_version.cache_version + 1,
           invalidated_at_utc = now(),
           reason = EXCLUDED.reason
     RETURNING cache_version`,
    [subjectId, reason],
  );
  const newVersion = res.rows[0]!.cache_version;

  await publishAudit(client, {
    event_type: "iam2.permission_cache_invalidated",
    source_module: "IAM-02",
    actor_id: subjectId,
    actor_type: "user",
    entity_type: "permission_cache_version",
    entity_id: subjectId,
    metadata: { reason, new_cache_version: newVersion },
  });

  return newVersion;
}
