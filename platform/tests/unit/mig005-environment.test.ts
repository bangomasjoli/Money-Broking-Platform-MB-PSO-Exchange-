import { describe, it, expect } from "vitest";
import * as foundation from "@aix/foundation";
import {
  AppError,
  CANONICAL_ENVIRONMENTS,
  ENVIRONMENTS,
  assertNoExchangeRuntime,
  canonicalEnvironment,
  isEnvironment,
  isProductionGated,
  loadConfig,
} from "@aix/foundation";

/**
 * MIG-005 — canonical five-environment model (Doc 00 v1.5 §1.E, §25.3; SRS v1.3 ENV-SRS-001/002/007;
 * STR-03 §8.3; DEC-013 clause 2).
 */

const base = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  INTERNAL_SERVICE_TOKEN: "internal-token-123",
  PORT: "8080",
};

describe("MIG-005 canonical environment mapping (STR-03 §8.3)", () => {
  it("defines exactly the five canonical environments", () => {
    expect([...CANONICAL_ENVIRONMENTS]).toEqual(["DEVELOPMENT", "TEST", "UAT", "DEMO", "PRODUCTION"]);
  });

  it("maps dev → DEVELOPMENT", () => expect(canonicalEnvironment("dev")).toBe("DEVELOPMENT"));
  it("maps qa → TEST", () => expect(canonicalEnvironment("qa")).toBe("TEST"));
  it("maps uat → UAT", () => expect(canonicalEnvironment("uat")).toBe("UAT"));
  it("maps demo → DEMO (added by MIG-005)", () => expect(canonicalEnvironment("demo")).toBe("DEMO"));
  it("maps prod → PRODUCTION", () => expect(canonicalEnvironment("prod")).toBe("PRODUCTION"));

  it("maps the staging pre-production mirror → PRODUCTION, never UAT (Doc 00 §1.E rule 5, ENV-SRS-007)", () => {
    expect(canonicalEnvironment("staging")).toBe("PRODUCTION");
    expect(isProductionGated("staging")).toBe(true);
  });

  it("accepts exactly the six deployment identifiers, with demo added", () => {
    expect([...ENVIRONMENTS]).toEqual(["dev", "qa", "uat", "demo", "staging", "prod"]);
    for (const env of ENVIRONMENTS) expect(isEnvironment(env)).toBe(true);
  });

  it("every identifier maps to a canonical environment and every canonical environment is reachable", () => {
    const reached = new Set(ENVIRONMENTS.map((e) => canonicalEnvironment(e)));
    expect([...reached].sort()).toEqual([...CANONICAL_ENVIRONMENTS].sort());
  });

  it("keeps the environment model frozen against runtime mutation", () => {
    expect(Object.isFrozen(ENVIRONMENTS)).toBe(true);
    expect(Object.isFrozen(CANONICAL_ENVIRONMENTS)).toBe(true);
  });
});

describe("MIG-005 unknown / malformed environment fails closed as PRODUCTION (Doc 00 §1.E rule 4, ENV-SRS-002)", () => {
  const unknown: unknown[] = [
    "production",
    "development",
    "test",
    "sandbox",
    "local",
    "preprod",
    "",
    " ",
    "demo ",
    " dev",
    "dev\n",
    "prod\u0000",
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    undefined,
    null,
    0,
    1,
    true,
    {},
    [],
    ["dev"],
    { toString: () => "dev" },
    Symbol("dev"),
  ];

  it.each(unknown.map((v) => [v]))("resolves %s to PRODUCTION", (value) => {
    expect(isEnvironment(value)).toBe(false);
    expect(canonicalEnvironment(value)).toBe("PRODUCTION");
    expect(isProductionGated(value)).toBe(true);
  });

  it("is case-sensitive: canonical or upper-case names are not identifiers and fail closed", () => {
    for (const value of ["DEV", "Dev", "QA", "UAT", "DEMO", "Demo", "PROD", "Prod", "STAGING", ...CANONICAL_ENVIRONMENTS]) {
      expect(isEnvironment(value)).toBe(false);
      expect(canonicalEnvironment(value)).toBe("PRODUCTION");
    }
  });

  it("loadConfig aborts startup on an unknown, malformed or wrong-case ENVIRONMENT", () => {
    for (const ENVIRONMENT of ["production", "DEMO", "PROD", "DEVELOPMENT", "__proto__", "toString", "", undefined]) {
      expect(() => loadConfig({ ...base, ENVIRONMENT })).toThrowError(AppError);
    }
  });

  it("loadConfig accepts every identifier including demo, trimming only surrounding whitespace", () => {
    for (const env of ENVIRONMENTS) {
      expect(loadConfig({ ...base, ENVIRONMENT: env }).environment).toBe(env);
    }
    expect(loadConfig({ ...base, ENVIRONMENT: "  demo  " }).environment).toBe("demo");
  });
});

describe("MIG-005 production gate applicability", () => {
  it("DEVELOPMENT, TEST, UAT and DEMO are not production-gated; PRODUCTION and its mirror are", () => {
    expect(isProductionGated("dev")).toBe(false);
    expect(isProductionGated("qa")).toBe(false);
    expect(isProductionGated("uat")).toBe(false);
    expect(isProductionGated("demo")).toBe(false);
    expect(isProductionGated("prod")).toBe(true);
    expect(isProductionGated("staging")).toBe(true);
  });

  it("DEMO is not PRODUCTION (Doc 00 §1.E rule 1)", () => {
    expect(canonicalEnvironment("demo")).not.toBe("PRODUCTION");
  });

  it("no non-production identifier resolves to PRODUCTION, and PRODUCTION never resolves to non-production", () => {
    for (const env of ["dev", "qa", "uat", "demo"] as const) expect(canonicalEnvironment(env)).not.toBe("PRODUCTION");
    for (const env of ["prod", "staging"] as const) expect(canonicalEnvironment(env)).toBe("PRODUCTION");
  });

  it("the environment model grants nothing: foundation exports no activation, availability or enable helper", () => {
    const names = Object.keys(foundation);
    const granting = names.filter((n) => /activat|availab|enable|unlock|eligib|permit|allow/i.test(n));
    expect(granting).toEqual([]);
  });
});

describe("MIG-005 environment cannot bypass permanent locks (Doc 00 §1.E, MSR permanent prohibitions)", () => {
  const prohibitedRoutes = [
    "/v1/order-book",
    "/v1/matching-engine",
    "/v1/market-maker",
    "/v1/principal-dealing",
    "/v1/maker-taker",
    "/v1/client-to-client",
    "/v1/exchange/orders",
  ];

  it.each(ENVIRONMENTS.map((e) => [e]))("the boundary guard still refuses Exchange-runtime routes with ENVIRONMENT=%s", (env) => {
    const previous = process.env.ENVIRONMENT;
    process.env.ENVIRONMENT = env;
    try {
      for (const route of prohibitedRoutes) {
        expect(() => assertNoExchangeRuntime([route])).toThrow();
      }
    } finally {
      if (previous === undefined) delete process.env.ENVIRONMENT;
      else process.env.ENVIRONMENT = previous;
    }
  });

  it("the boundary guard signature stays environment-blind (MIG-001 not implemented here)", () => {
    expect(assertNoExchangeRuntime.length).toBe(1);
  });
});
