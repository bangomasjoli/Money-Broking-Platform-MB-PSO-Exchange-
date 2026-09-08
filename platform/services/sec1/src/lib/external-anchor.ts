/**
 * SEC-01 external seal-anchor provider — DOCUMENTED SEAM ONLY, for a LATER, infrastructure-
 * dependent phase (real WORM/object-lock storage + a real trusted timestamp authority;
 * 05_Database_Design.md §5.5A: "seal_method = external is mandatory for authoritative
 * production audit sealing").
 *
 * This file is INTERFACE ONLY:
 *   - No implementation of `ExternalSealAnchorProvider` exists anywhere in this codebase.
 *   - No `NullAnchorProvider` or any other no-op/placeholder implementation exists.
 *   - No default export.
 *   - NOTHING in `services/sec1/src/**` imports or references this file — proven
 *     structurally, not just by absence of evidence, by
 *     `tests/unit/sec1-external-anchor-boundary.test.ts`, which scans the entire source tree
 *     for any import of `external-anchor`.
 *
 * WHY NOT EVEN A NO-OP STUB: a stub implementation that "succeeds" with placeholder values —
 * even ones obviously fake to a careful reader — risks being accidentally wired into a real
 * code path later and producing what LOOKS like a genuine external anchor when none exists.
 * That is exactly the "no fake external anchor" violation this phase must not commit. Every
 * seal created and verified this phase has `seal_method = 'internal'`,
 * `external_anchor_ref = null`, `trusted_timestamp_ref = null`, and every seal-related API
 * response carries `production_authoritative: false` unconditionally (see lib/seal.ts). This
 * interface exists purely so a future implementer of the real WORM/TSA integration has a
 * documented contract to build against, with zero temptation to reach for a placeholder now.
 */
export interface ExternalSealAnchorProvider {
  anchorBatch(input: { sealBatchId: string; batchHash: string }): Promise<{
    externalAnchorRef: string;
    trustedTimestampRef: string;
    trustedTimestampUtc: string;
  }>;
}
