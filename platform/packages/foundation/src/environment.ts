/**
 * MIG-005 — canonical five-environment model (Doc 00 v1.5 §1.E, §25.3; SRS v1.3 ENV-SRS-001/002/007;
 * STR-03 §8.3; DEC-013 clause 2).
 *
 * `Environment` is the deployment identifier read from `ENVIRONMENT` at startup and persisted in
 * existing records (e.g. `foundation.release_registry`, WLT-01 PoC `domain_environment`), so its
 * lowercase members are kept and MAPPED onto the canonical names, never renamed.
 *
 * This module only classifies an environment. It grants nothing: environment availability,
 * production activation and asset eligibility are separate, conjunctive states owned by CFG-01
 * (`MIG-004`). No environment value relaxes any permanent prohibition or control.
 */

/** Deployment environment identifiers accepted at startup. `demo` added by MIG-005. */
export type Environment = "dev" | "qa" | "uat" | "demo" | "staging" | "prod";
export const ENVIRONMENTS: readonly Environment[] = Object.freeze(["dev", "qa", "uat", "demo", "staging", "prod"]);

/** The five canonical capability-control environments. */
export type CanonicalEnvironment = "DEVELOPMENT" | "TEST" | "UAT" | "DEMO" | "PRODUCTION";
export const CANONICAL_ENVIRONMENTS: readonly CanonicalEnvironment[] = Object.freeze([
  "DEVELOPMENT",
  "TEST",
  "UAT",
  "DEMO",
  "PRODUCTION",
]);

/**
 * `staging` is the pre-production mirror of production: it inherits PRODUCTION's activation
 * gate, not UAT's (Doc 00 §1.E rule 5, ENV-SRS-007).
 */
const CANONICAL_BY_ENVIRONMENT: Readonly<Record<Environment, CanonicalEnvironment>> = Object.freeze({
  dev: "DEVELOPMENT",
  qa: "TEST",
  uat: "UAT",
  demo: "DEMO",
  staging: "PRODUCTION",
  prod: "PRODUCTION",
});

/** Exact, case-sensitive membership test. No trimming or case folding. */
export function isEnvironment(value: unknown): value is Environment {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CANONICAL_BY_ENVIRONMENT, value);
}

/**
 * Map an environment identifier to its canonical environment. Unknown, unrecognised or malformed
 * input resolves to PRODUCTION (Doc 00 §1.E rule 4, ENV-SRS-002) — the fail-closed direction.
 */
export function canonicalEnvironment(value: unknown): CanonicalEnvironment {
  return isEnvironment(value) ? CANONICAL_BY_ENVIRONMENT[value] : "PRODUCTION";
}

/**
 * True where PRODUCTION's regulatory activation gate applies: `prod`, the `staging` mirror, and
 * every unknown or malformed value. A `false` result is NOT permission — it only means the
 * production gate is not the applicable gate; every other conjunctive control still applies.
 */
export function isProductionGated(value: unknown): boolean {
  return canonicalEnvironment(value) === "PRODUCTION";
}
