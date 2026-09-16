/**
 * IMP-02 measurement harness — Turn M-A foundation. Pure PostgreSQL global-capacity budget
 * calculator (architecture §17).
 *
 * All nine AIX services share one PostgreSQL server; each constructs its own connection pool via
 * `@aix/foundation`'s `initPool()` singleton. This calculator evaluates the arithmetic
 * inequality that bounds any candidate `IAM_DB_POOL_MAX`:
 *
 *   Σ (each service's pool.max × its process count) + reserved/admin allowance  ≤  max_connections
 *
 * This module is ARITHMETIC EVIDENCE ONLY. It never emits a recommended pool value, and it
 * contains no production default for any input — every number must be supplied explicitly by
 * the caller, sourced from runtime observation (this turn's M2a observer, or later equivalents
 * for the other eight services) or from `pg_settings`. A caller providing `all services = 10`
 * or any other assumed default is a caller-side error this module does not paper over.
 */

export interface DbBudgetServiceDemand {
  /** Service identifier for the evidence trail (e.g. "iam", "wlt1") — required so a slack figure
   * can always be traced back to which service contributed how much. */
  readonly service: string;
  /** That service's effective `pool.max`, evidenced (not assumed). */
  readonly poolMax: number;
  /** Total live processes for that service across the deployment being evaluated. */
  readonly processCount: number;
}

export interface EvaluateDbBudgetInput {
  /** `pg_settings` / `SHOW max_connections` — the server-wide connection ceiling. */
  readonly maxConnections: number;
  /** `pg_settings` / `SHOW superuser_reserved_connections`. */
  readonly reservedConnections: number;
  /** Explicit, caller-declared headroom for migrations/admin/monitoring sessions not captured by
   * `reservedConnections` — deliberately NOT defaulted, since the appropriate figure is a
   * deployment-specific judgement, not a constant this module could safely assume. */
  readonly adminAllowance: number;
  /** One entry per service sharing the database. Every entry contributes `poolMax *
   * processCount` to total declared demand. */
  readonly serviceDemands: readonly DbBudgetServiceDemand[];
}

export type DbBudgetResult =
  | {
      readonly status: "DETERMINED";
      readonly totalDeclaredDemand: number;
      readonly maxConnections: number;
      readonly reservedConnections: number;
      readonly adminAllowance: number;
      /** `maxConnections - reservedConnections - adminAllowance - totalDeclaredDemand`. Negative
       * means the declared demand already exceeds the server's budget. */
      readonly slack: number;
      readonly withinBudget: boolean;
      readonly perServiceDemand: readonly { readonly service: string; readonly demand: number }[];
    }
  | { readonly status: "UNDETERMINED"; readonly reason: string };

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Pure arithmetic evaluation of the DB-wide budget inequality. `UNDETERMINED` (never a
 * fabricated number) whenever any required input is missing, non-numeric, negative where a
 * non-negative value is required, or the service-demand list is empty. The result never
 * contains a "recommended" field of any kind — see
 * `tests/unit/perf-db-budget.test.ts`'s structural guard on that property.
 */
export function evaluateDbBudget(input: EvaluateDbBudgetInput | undefined): DbBudgetResult {
  if (!input) {
    return { status: "UNDETERMINED", reason: "no input supplied" };
  }
  if (!isPositiveInteger(input.maxConnections)) {
    return { status: "UNDETERMINED", reason: "maxConnections must be an evidenced positive integer (from pg_settings)" };
  }
  if (!isNonNegativeInteger(input.reservedConnections)) {
    return { status: "UNDETERMINED", reason: "reservedConnections must be an evidenced non-negative integer (from pg_settings)" };
  }
  if (!isNonNegativeInteger(input.adminAllowance)) {
    return { status: "UNDETERMINED", reason: "adminAllowance must be an explicit non-negative integer supplied by the caller — no default is assumed" };
  }
  if (!Array.isArray(input.serviceDemands) || input.serviceDemands.length === 0) {
    return { status: "UNDETERMINED", reason: "serviceDemands must be a non-empty array — no service demand has been declared" };
  }

  const perServiceDemand: { service: string; demand: number }[] = [];
  let totalDeclaredDemand = 0;
  for (const entry of input.serviceDemands) {
    if (typeof entry.service !== "string" || entry.service.trim().length === 0) {
      return { status: "UNDETERMINED", reason: "every serviceDemands entry requires a non-empty service identifier" };
    }
    if (!isPositiveInteger(entry.poolMax)) {
      return { status: "UNDETERMINED", reason: `service "${entry.service}": poolMax must be an evidenced positive integer` };
    }
    if (!isPositiveInteger(entry.processCount)) {
      return { status: "UNDETERMINED", reason: `service "${entry.service}": processCount must be an evidenced positive integer` };
    }
    const demand = entry.poolMax * entry.processCount;
    totalDeclaredDemand += demand;
    perServiceDemand.push({ service: entry.service, demand });
  }

  const slack = input.maxConnections - input.reservedConnections - input.adminAllowance - totalDeclaredDemand;

  return {
    status: "DETERMINED",
    totalDeclaredDemand,
    maxConnections: input.maxConnections,
    reservedConnections: input.reservedConnections,
    adminAllowance: input.adminAllowance,
    slack,
    withinBudget: slack >= 0,
    perServiceDemand,
  };
}
