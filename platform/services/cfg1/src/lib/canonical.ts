/**
 * CFG-01's own copy of the deterministic canonical-JSON + sha256 hashing algorithm
 * (blueprint §5.4A "Config Integrity and Decision-Time Seal Verification"). NOT imported from
 * `services/sec1/src/lib/canonical.ts` — that would violate the F3(c) module-import boundary
 * this module is held to as well. Same algorithm SEC-01 uses (which itself mirrors
 * `packages/foundation/src/idempotency.ts`'s own internal, unexported `canonical()` helper):
 * every object's keys are recursively sorted lexicographically at every nesting depth; arrays
 * preserve element order (order IS meaningful there). This is what makes the hash "explicitly
 * field-ordered" — the same logical row set hashes identically regardless of how it was
 * assembled upstream, and regardless of the DB's own physical row order.
 *
 * `infra/migrations/014_cfg1_core.cjs` duplicates this exact algorithm inline in plain JS
 * (migrations cannot import TypeScript service source without a build step) — the two copies
 * are proven to agree by `tests/integration/cfg1-db.test.ts`'s readiness test, which recomputes
 * every seal hash through THIS file's functions and compares against what the migration seeded.
 */
import { createHash } from "node:crypto";

export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Locale-independent string comparator for ordering rows before hashing (Phase 2 F-1 closure).
 *
 * `Array.prototype.sort`'s default comparator already coerces to string and compares by UTF-16
 * code unit, so this exists to make that guarantee EXPLICIT and named, not because the default
 * comparator was wrong — the actual bug this closes was every CFG-01 seal/hash call site using
 * `String.prototype.localeCompare` instead, which is host-collation-dependent
 * (`Intl`/`LC_COLLATE`). Two environments with different default locales could, in principle,
 * order the SAME row set differently under `localeCompare`, producing two different — but
 * equally "correct" per their own host — canonical hashes for identical underlying data. That
 * is exactly the shape of bug that must never exist in a security-relevant hash: the migration
 * that seeds a hash and the service that later re-verifies it can run on different hosts.
 *
 * Empirically, for CFG-01's actual current data (30 prohibited-feature codes + 3 licence
 * codes, all lowercase ASCII with `.`/`_` separators), `localeCompare` and codepoint order
 * happened to agree in every environment tested — so this was a latent fragility, not a live
 * defect. Fixed anyway, everywhere ordering feeds a hash, before any decision-time check comes
 * to depend on it (Phase 2 F-2).
 */
export function codePointCompare(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * CFG-01's blueprint (`04_API_Specification.md` §2.1's own response example:
 * `"prohibited_registry_hash": "sha256:..."`) uses a `sha256:`-prefixed hash format, unlike
 * SEC-01's bare-hex convention — this module follows ITS OWN blueprint's documented example
 * rather than mirroring SEC-01's unrelated convention.
 */
export function sha256Prefixed(value: string): string {
  return "sha256:" + sha256Hex(value);
}
