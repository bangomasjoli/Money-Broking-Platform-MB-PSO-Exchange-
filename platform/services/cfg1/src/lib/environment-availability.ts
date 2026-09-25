/**
 * MIG-004 — `ENVIRONMENT_AVAILABILITY` (Doc 00 v1.5 §1.D state 2), read from
 * `cfg1.feature.environment_scope` (migration 071). CFG-01 owns this vocabulary; the foundation
 * owns only environment classification (`canonicalEnvironment`, MIG-005), so this helper
 * deliberately lives here and not in `@aix/foundation`.
 *
 * The WHOLE object is validated on every read, not just the entry being looked up: a malformed
 * scope denies in every environment, never only in the environments whose key happens to be
 * broken. Validation mirrors migration 071's CHECK constraint so a row that somehow bypassed it
 * (an out-of-band write, a future schema drift) still fails closed here:
 *   - a plain, non-null, non-array object;
 *   - own string keys equal to EXACTLY the five canonical environments (no extra, missing,
 *     lower-case, `STAGING`, symbol or prototype-named keys);
 *   - every value an own data property holding exactly one of the three state strings.
 *
 * Only `ENABLED` is availability. Callers must never derive availability from anything else —
 * in particular never from `!isProductionGated(...)` (MIG-005 review, MIG-004 gate condition 4).
 */
import { CANONICAL_ENVIRONMENTS, type CanonicalEnvironment } from "@aix/foundation";

export const ENVIRONMENT_AVAILABILITY_STATES = Object.freeze(["ENABLED", "DISABLED", "NOT_APPLICABLE"] as const);
export type EnvironmentAvailability = (typeof ENVIRONMENT_AVAILABILITY_STATES)[number];

/** `INVALID` means the scope as a whole is unreadable; callers deny with `environment_scope_invalid`. */
export type EnvironmentAvailabilityReading = EnvironmentAvailability | "INVALID";

function isAvailabilityState(value: unknown): value is EnvironmentAvailability {
  return typeof value === "string" && (ENVIRONMENT_AVAILABILITY_STATES as readonly string[]).includes(value);
}

function isValidEnvironmentScope(scope: unknown): scope is Record<CanonicalEnvironment, EnvironmentAvailability> {
  if (typeof scope !== "object" || scope === null || Array.isArray(scope)) return false;
  const proto = Object.getPrototypeOf(scope);
  if (proto !== Object.prototype && proto !== null) return false;

  const keys = Reflect.ownKeys(scope);
  if (keys.length !== CANONICAL_ENVIRONMENTS.length) return false;
  for (const key of keys) {
    if (typeof key !== "string" || !(CANONICAL_ENVIRONMENTS as readonly string[]).includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(scope, key);
    if (!descriptor || !("value" in descriptor) || !isAvailabilityState(descriptor.value)) return false;
  }
  return true;
}

/**
 * The availability of `canonical` in `scope`, or `INVALID` if the scope is not a complete,
 * well-formed five-environment map. `canonical` must come from `canonicalEnvironment()` of
 * CFG-01's OWN configured environment — never from a caller-supplied value (CFG-FIND-001).
 */
export function readEnvironmentAvailability(scope: unknown, canonical: CanonicalEnvironment): EnvironmentAvailabilityReading {
  if (!isValidEnvironmentScope(scope)) return "INVALID";
  if (!(CANONICAL_ENVIRONMENTS as readonly string[]).includes(canonical)) return "INVALID";
  return scope[canonical];
}
