import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { CANONICAL_ENVIRONMENTS, ENVIRONMENTS, canonicalEnvironment, type CanonicalEnvironment } from "@aix/foundation";
import * as foundation from "@aix/foundation";
import {
  ENVIRONMENT_AVAILABILITY_STATES,
  readEnvironmentAvailability,
} from "../../services/cfg1/src/lib/environment-availability.js";

/**
 * MIG-004 — CFG-01-owned ENVIRONMENT_AVAILABILITY parser (`01-plan.md` §3, §4, §7, §13).
 */

function scope(overrides: Partial<Record<CanonicalEnvironment, unknown>> = {}): Record<string, unknown> {
  return { DEVELOPMENT: "DISABLED", TEST: "DISABLED", UAT: "DISABLED", DEMO: "DISABLED", PRODUCTION: "DISABLED", ...overrides };
}

describe("MIG-004 environment_scope parser — valid scopes", () => {
  it("vocabulary is exactly ENABLED / DISABLED / NOT_APPLICABLE", () => {
    expect([...ENVIRONMENT_AVAILABILITY_STATES]).toEqual(["ENABLED", "DISABLED", "NOT_APPLICABLE"]);
  });

  it.each(CANONICAL_ENVIRONMENTS.flatMap((env) => ENVIRONMENT_AVAILABILITY_STATES.map((state) => [env, state] as const)))(
    "reads %s = %s exactly",
    (env, state) => {
      expect(readEnvironmentAvailability(scope({ [env]: state }), env)).toBe(state);
    },
  );

  it("each entry is independent — enabling four environments says nothing about the fifth", () => {
    const s = scope({ DEVELOPMENT: "ENABLED", TEST: "ENABLED", UAT: "ENABLED", DEMO: "ENABLED", PRODUCTION: "DISABLED" });
    expect(readEnvironmentAvailability(s, "PRODUCTION")).toBe("DISABLED");
    expect(readEnvironmentAvailability(s, "DEVELOPMENT")).toBe("ENABLED");
  });

  it("the migration-071 default (all DISABLED) is valid and available nowhere", () => {
    for (const env of CANONICAL_ENVIRONMENTS) expect(readEnvironmentAvailability(scope(), env)).toBe("DISABLED");
  });

  it("accepts a null-prototype object with the exact keys", () => {
    const s = Object.assign(Object.create(null), scope({ UAT: "ENABLED" }));
    expect(readEnvironmentAvailability(s, "UAT")).toBe("ENABLED");
  });
});

describe("MIG-004 environment_scope parser — whole-object validation fails closed as INVALID", () => {
  const invalid: Array<[string, unknown]> = [
    ["null", null],
    ["undefined", undefined],
    ["array", ["ENABLED", "ENABLED", "ENABLED", "ENABLED", "ENABLED"]],
    ["string", "ENABLED"],
    ["JSON string of a valid scope", JSON.stringify(scope())],
    ["number", 1],
    ["boolean", true],
    ["empty object", {}],
    ["four keys (PRODUCTION missing)", { DEVELOPMENT: "ENABLED", TEST: "ENABLED", UAT: "ENABLED", DEMO: "ENABLED" }],
    ["six keys (STAGING added)", { ...scope(), STAGING: "ENABLED" }],
    ["STAGING in place of PRODUCTION", { DEVELOPMENT: "DISABLED", TEST: "DISABLED", UAT: "DISABLED", DEMO: "DISABLED", STAGING: "ENABLED" }],
    ["wildcard key", { ...scope(), "*": "ENABLED" }],
    ["lower-case keys", { development: "ENABLED", test: "ENABLED", uat: "ENABLED", demo: "ENABLED", production: "ENABLED" }],
    ["deployment-identifier keys", { dev: "ENABLED", qa: "ENABLED", uat: "ENABLED", demo: "ENABLED", prod: "ENABLED" }],
    ["lower-case value", scope({ DEVELOPMENT: "enabled" })],
    ["unknown value", scope({ DEVELOPMENT: "ALLOWED" })],
    ["boolean shorthand true", scope({ DEVELOPMENT: true })],
    ["boolean shorthand false", scope({ PRODUCTION: false })],
    ["null value", scope({ TEST: null })],
    ["numeric value", scope({ UAT: 1 })],
    ["nested value", scope({ DEMO: { state: "ENABLED" } })],
    ["array value", scope({ DEMO: ["ENABLED"] })],
    ["whitespace value", scope({ DEVELOPMENT: " ENABLED" })],
    ["__proto__ own key from JSON", JSON.parse('{"DEVELOPMENT":"ENABLED","TEST":"ENABLED","UAT":"ENABLED","DEMO":"ENABLED","__proto__":"ENABLED"}')],
    ["Date object", new Date()],
    ["Map", new Map(Object.entries(scope()))],
  ];

  it.each(invalid)("%s → INVALID for every canonical environment", (_label, value) => {
    for (const env of CANONICAL_ENVIRONMENTS) expect(readEnvironmentAvailability(value, env)).toBe("INVALID");
  });

  it("a malformed entry for ANOTHER environment still invalidates the whole scope", () => {
    const s = scope({ DEVELOPMENT: "ENABLED", DEMO: "BROKEN" });
    expect(readEnvironmentAvailability(s, "DEVELOPMENT")).toBe("INVALID");
  });

  it("an inherited (prototype) key never counts — only own keys are read", () => {
    const proto = { PRODUCTION: "ENABLED" };
    const s = Object.create(proto);
    Object.assign(s, { DEVELOPMENT: "DISABLED", TEST: "DISABLED", UAT: "DISABLED", DEMO: "DISABLED" });
    expect(readEnvironmentAvailability(s, "PRODUCTION")).toBe("INVALID");
  });

  it("an accessor (getter) value is never trusted", () => {
    const s = scope();
    Object.defineProperty(s, "PRODUCTION", { get: () => "ENABLED", enumerable: true });
    expect(readEnvironmentAvailability(s, "PRODUCTION")).toBe("INVALID");
  });

  it("a symbol key invalidates the scope", () => {
    const s = scope() as Record<string | symbol, unknown>;
    s[Symbol("PRODUCTION")] = "ENABLED";
    expect(readEnvironmentAvailability(s, "PRODUCTION")).toBe("INVALID");
  });

  it("a non-canonical lookup environment is INVALID, never a default", () => {
    expect(readEnvironmentAvailability(scope({ DEVELOPMENT: "ENABLED" }), "STAGING" as CanonicalEnvironment)).toBe("INVALID");
  });
});

describe("MIG-004 deployment identifier → environment_scope entry (via the foundation mapping)", () => {
  const expected: Record<string, CanonicalEnvironment> = {
    dev: "DEVELOPMENT",
    qa: "TEST",
    uat: "UAT",
    demo: "DEMO",
    staging: "PRODUCTION",
    prod: "PRODUCTION",
  };

  it.each(ENVIRONMENTS.map((e) => [e]))("%s reads its own canonical entry and no other", (deployment) => {
    const canonical = canonicalEnvironment(deployment);
    expect(canonical).toBe(expected[deployment]);
    // ENABLED only in this deployment's canonical entry.
    expect(readEnvironmentAvailability(scope({ [canonical]: "ENABLED" }), canonical)).toBe("ENABLED");
    // ENABLED everywhere EXCEPT its own entry → not available.
    const allButOwn = Object.fromEntries(CANONICAL_ENVIRONMENTS.map((e) => [e, e === canonical ? "DISABLED" : "ENABLED"]));
    expect(readEnvironmentAvailability(allButOwn, canonical)).toBe("DISABLED");
  });

  it("staging reads the PRODUCTION entry — there is no STAGING entry to read", () => {
    const s = scope({ DEVELOPMENT: "ENABLED", TEST: "ENABLED", UAT: "ENABLED", DEMO: "ENABLED", PRODUCTION: "DISABLED" });
    expect(readEnvironmentAvailability(s, canonicalEnvironment("staging"))).toBe("DISABLED");
    expect(readEnvironmentAvailability(scope({ PRODUCTION: "ENABLED" }), canonicalEnvironment("staging"))).toBe("ENABLED");
  });

  it("an unknown own environment falls to the PRODUCTION entry (fail-closed direction)", () => {
    expect(canonicalEnvironment("bogus")).toBe("PRODUCTION");
    expect(readEnvironmentAvailability(scope({ DEVELOPMENT: "ENABLED" }), canonicalEnvironment("bogus"))).toBe("DISABLED");
  });

  it("ENVIRONMENT_AVAILABILITY stays CFG-01-owned: the foundation still exports no availability helper", () => {
    expect(Object.keys(foundation).filter((n) => /availab/i.test(n))).toEqual([]);
  });
});

describe("MIG-004 static guards over CFG-01 source", () => {
  const srcDir = join(__dirname, "..", "..", "services", "cfg1", "src");
  const files = readdirSync(srcDir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts"));
  // Code only: block and line comments are stripped so explanatory prose ("never from
  // `!isProductionGated(...)`") cannot mask or trigger a match.
  const source = files
    .map((f) => readFileSync(join(srcDir, f), "utf8"))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("no CFG-01 code path uses isProductionGated (availability must never be inferred from being non-production)", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(source).not.toMatch(/isProductionGated/);
  });

  it("CFG-01 keeps no local copy of the deployment environment vocabulary", () => {
    expect(source).not.toMatch(/\[\s*"dev"\s*,\s*"qa"\s*,\s*"uat"/);
  });

  it("the production hold reason code is production_activation_absent, never the over-length variant", () => {
    expect(source).toMatch(/"production_activation_absent"/);
    expect(source).not.toMatch(/production_activation_unrepresented/);
  });
});
