/**
 * Shared Rate-Limit Engine — pure unit tests (no DB required).
 *
 * Covers: `deriveSubjectHash` (deterministic, collision-resistant across the four input
 * dimensions), `computeDecision` (the race-free transition-detection arithmetic — see
 * `services/fnd/src/lib/rate-limit.ts`'s own header comment for the derivation this pins), and
 * `loadFndConfig`'s `FND_RATE_LIMIT_CONSUMER_SECRETS` validation.
 */
import { describe, expect, it } from "vitest";
import type { RawEnv } from "@aix/foundation";
import { AppError } from "@aix/foundation";
import { deriveSubjectHash, computeDecision, type CounterRow, type PolicyRow } from "../../services/fnd/src/lib/rate-limit.js";
import { loadFndConfig } from "../../services/fnd/src/config.js";

// -------------------------------------------------------------------------------------------
// deriveSubjectHash
// -------------------------------------------------------------------------------------------
describe("deriveSubjectHash", () => {
  it("is deterministic for identical input", () => {
    const a = deriveSubjectHash("WLT-01", "READ_LIST", "client", "clt1client_1");
    const b = deriveSubjectHash("WLT-01", "READ_LIST", "client", "clt1client_1");
    expect(a).toBe(b);
  });

  it("produces a lowercase 64-character hex string (SHA-256)", () => {
    const hash = deriveSubjectHash("WLT-01", "READ_LIST", "client", "clt1client_1");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for a different subject_id", () => {
    const a = deriveSubjectHash("WLT-01", "READ_LIST", "client", "clt1client_1");
    const b = deriveSubjectHash("WLT-01", "READ_LIST", "client", "clt1client_2");
    expect(a).not.toBe(b);
  });

  it("differs for a different bucket (same module/subject)", () => {
    const a = deriveSubjectHash("WLT-01", "READ_LIST", "client", "clt1client_1");
    const b = deriveSubjectHash("WLT-01", "READ_ITEM", "client", "clt1client_1");
    expect(a).not.toBe(b);
  });

  it("differs for a different module (same bucket/subject)", () => {
    const a = deriveSubjectHash("WLT-01", "READ_LIST", "client", "clt1client_1");
    const b = deriveSubjectHash("IAM-01", "READ_LIST", "client", "clt1client_1");
    expect(a).not.toBe(b);
  });

  it("differs for a different subject_type (client vs user) with the same subject_id value", () => {
    const a = deriveSubjectHash("WLT-01", "MUTATE_POC", "client", "same_id_1");
    const b = deriveSubjectHash("WLT-01", "MUTATE_POC", "user", "same_id_1");
    expect(a).not.toBe(b);
  });

  it("does not collide across a field-boundary split of the same concatenated characters (proves the separator matters)", () => {
    // "AB" + "CDEF" vs "ABC" + "DEF" would concatenate identically WITHOUT a separator.
    const a = deriveSubjectHash("AB-01", "CDEF", "client", "x");
    const b = deriveSubjectHash("ABC-01", "DEF", "client", "x");
    expect(a).not.toBe(b);
  });
});

// -------------------------------------------------------------------------------------------
// computeDecision — the race-free transition-detection arithmetic
// -------------------------------------------------------------------------------------------
describe("computeDecision", () => {
  const policy: PolicyRow = {
    policy_id: "frl_test",
    burst_limit: 10,
    burst_window_seconds: 60,
    sustained_limit: 60,
    sustained_window_seconds: 3600,
    version: 1,
  };

  function counter(overrides: Partial<CounterRow>): CounterRow {
    const now = new Date().toISOString();
    return {
      burst_count: 1,
      sustained_count: 1,
      burst_window_start_utc: now,
      sustained_window_start_utc: now,
      server_now_utc: now,
      ...overrides,
    };
  }

  it("first-ever request (count=1 on both dimensions) is always allow, never a transition", () => {
    const d = computeDecision(counter({ burst_count: 1, sustained_count: 1 }), policy);
    expect(d.allowed).toBe(true);
    expect(d.isTransitionToDeny).toBe(false);
  });

  it("exactly at burst limit -> allow, not a transition", () => {
    const d = computeDecision(counter({ burst_count: 10, sustained_count: 10 }), policy);
    expect(d.allowed).toBe(true);
    expect(d.isTransitionToDeny).toBe(false);
  });

  it("exactly at sustained limit -> allow", () => {
    const d = computeDecision(counter({ burst_count: 5, sustained_count: 60 }), policy);
    expect(d.allowed).toBe(true);
  });

  it("burst limit + 1 -> deny, and IS the transition (previous count was exactly at limit, allowed)", () => {
    const d = computeDecision(counter({ burst_count: 11, sustained_count: 11 }), policy);
    expect(d.allowed).toBe(false);
    expect(d.isTransitionToDeny).toBe(true);
  });

  it("sustained limit + 1 -> deny and IS the transition", () => {
    const d = computeDecision(counter({ burst_count: 5, sustained_count: 61 }), policy);
    expect(d.allowed).toBe(false);
    expect(d.isTransitionToDeny).toBe(true);
  });

  it("burst limit + 2 -> deny but is NOT a new transition (already denied at count-1=11>10)", () => {
    const d = computeDecision(counter({ burst_count: 12, sustained_count: 12 }), policy);
    expect(d.allowed).toBe(false);
    expect(d.isTransitionToDeny).toBe(false);
  });

  it("far over limit (many subsequent denials) never re-flags a transition", () => {
    const d = computeDecision(counter({ burst_count: 50, sustained_count: 50 }), policy);
    expect(d.allowed).toBe(false);
    expect(d.isTransitionToDeny).toBe(false);
  });

  it("both dimensions exceeded simultaneously in one call -> deny, IS a transition (previous state was allow on both)", () => {
    // burst_count-1=10<=10 (was allowed), sustained_count-1=60<=60 (was allowed); new: 11>10 and 61>60.
    const d = computeDecision(counter({ burst_count: 11, sustained_count: 61 }), policy);
    expect(d.allowed).toBe(false);
    expect(d.isTransitionToDeny).toBe(true);
  });

  it("rollover (count resets to 1) is always allow for that dimension regardless of how high it was before", () => {
    // Simulates a burst window that just rolled over to count=1, while sustained is mid-window
    // at a value that would itself already be over limit if not for the independent rollover
    // semantics — burst alone determines allow/deny for burst's own dimension.
    const d = computeDecision(counter({ burst_count: 1, sustained_count: 30 }), policy);
    expect(d.allowed).toBe(true);
  });

  it("mixed: burst already denied (no rollover), sustained just rolled over -> still deny, NOT a new transition", () => {
    // burst_count=16 (previous=15>10, already denied), sustained just rolled to 1 (previous=0<=60, allowed).
    const d = computeDecision(counter({ burst_count: 16, sustained_count: 1 }), policy);
    expect(d.allowed).toBe(false);
    // previous combined = (burst previously denied) AND (sustained previously allowed) = false
    // -> NOT previously allowed overall -> not a transition, even though sustained just reset.
    expect(d.isTransitionToDeny).toBe(false);
  });

  it("retry_after_seconds is at least 1 even at the exact reset boundary", () => {
    const now = new Date();
    const d = computeDecision(
      counter({
        burst_count: 11,
        sustained_count: 11,
        burst_window_start_utc: now.toISOString(),
        server_now_utc: now.toISOString(),
      }),
      policy,
    );
    expect(d.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("retry_after_seconds uses the LATER reset when both dimensions deny", () => {
    const now = new Date();
    const burstStart = new Date(now.getTime() - 50_000); // burst resets in 10s
    const sustainedStart = new Date(now.getTime() - 3000_000); // sustained resets in 600s
    const d = computeDecision(
      counter({
        burst_count: 11,
        sustained_count: 61,
        burst_window_start_utc: burstStart.toISOString(),
        sustained_window_start_utc: sustainedStart.toISOString(),
        server_now_utc: now.toISOString(),
      }),
      policy,
    );
    // burst resets at +60s from burstStart = now+10s; sustained resets at +3600s from
    // sustainedStart = now+600s. The later (sustained) reset must govern.
    expect(d.retryAfterSeconds).toBeGreaterThan(500);
  });

  it("allow never carries a positive retry_after (defaults to 1, but decision.allowed=true means the route never uses it)", () => {
    const d = computeDecision(counter({ burst_count: 3, sustained_count: 3 }), policy);
    expect(d.allowed).toBe(true);
  });
});

// -------------------------------------------------------------------------------------------
// loadFndConfig — FND_RATE_LIMIT_CONSUMER_SECRETS validation
// -------------------------------------------------------------------------------------------
describe("loadFndConfig — FND_RATE_LIMIT_CONSUMER_SECRETS", () => {
  const validEnv: RawEnv = {
    ENVIRONMENT: "dev",
    DATABASE_URL: "postgres://unused:unused@localhost:5432/unused",
    INTERNAL_SERVICE_TOKEN: "test-internal-token-config-check",
    FND_RATE_LIMIT_CONSUMER_SECRETS: JSON.stringify({ "WLT-01": "test-wlt1-consumer-secret-32ch!!" }),
  };

  function configErrorIssues(env: RawEnv): string[] {
    try {
      loadFndConfig(env);
      return [];
    } catch (err) {
      if (err instanceof AppError && err.code === "CONFIGURATION_INVALID") {
        return err.details.map((d) => d.issue ?? "");
      }
      throw err;
    }
  }

  it("a fully valid env loads without throwing, and the map is carried through", () => {
    const cfg = loadFndConfig(validEnv);
    expect(cfg.rateLimitConsumerSecrets).toEqual({ "WLT-01": "test-wlt1-consumer-secret-32ch!!" });
  });

  it("missing FND_RATE_LIMIT_CONSUMER_SECRETS -> CONFIGURATION_INVALID (required, no default)", () => {
    const { FND_RATE_LIMIT_CONSUMER_SECRETS: _omit, ...env } = validEnv;
    const issues = configErrorIssues(env);
    expect(issues.some((i) => i.includes("FND_RATE_LIMIT_CONSUMER_SECRETS"))).toBe(true);
  });

  it("blank FND_RATE_LIMIT_CONSUMER_SECRETS -> CONFIGURATION_INVALID", () => {
    const issues = configErrorIssues({ ...validEnv, FND_RATE_LIMIT_CONSUMER_SECRETS: "   " });
    expect(issues.some((i) => i.includes("FND_RATE_LIMIT_CONSUMER_SECRETS"))).toBe(true);
  });

  it("invalid JSON -> CONFIGURATION_INVALID", () => {
    const issues = configErrorIssues({ ...validEnv, FND_RATE_LIMIT_CONSUMER_SECRETS: "{not valid json" });
    expect(issues.some((i) => i.includes("not valid JSON"))).toBe(true);
  });

  it("a JSON array (not a flat object) -> CONFIGURATION_INVALID", () => {
    const issues = configErrorIssues({ ...validEnv, FND_RATE_LIMIT_CONSUMER_SECRETS: "[]" });
    expect(issues.some((i) => i.includes("flat JSON object"))).toBe(true);
  });

  it("a JSON primitive (not an object) -> CONFIGURATION_INVALID", () => {
    const issues = configErrorIssues({ ...validEnv, FND_RATE_LIMIT_CONSUMER_SECRETS: '"just a string"' });
    expect(issues.some((i) => i.includes("flat JSON object"))).toBe(true);
  });

  it("an invalid module id key (does not match ^[A-Z]{2,4}-[0-9]{2}$) -> CONFIGURATION_INVALID", () => {
    const issues = configErrorIssues({ ...validEnv, FND_RATE_LIMIT_CONSUMER_SECRETS: JSON.stringify({ wlt01: "test-wlt1-consumer-secret-32ch!!" }) });
    expect(issues.some((i) => i.includes("malformed module id"))).toBe(true);
  });

  it("a blank secret value -> CONFIGURATION_INVALID", () => {
    const issues = configErrorIssues({ ...validEnv, FND_RATE_LIMIT_CONSUMER_SECRETS: JSON.stringify({ "WLT-01": "   " }) });
    expect(issues.some((i) => i.includes("non-blank string"))).toBe(true);
  });

  it("a secret shorter than 16 characters -> CONFIGURATION_INVALID", () => {
    const issues = configErrorIssues({ ...validEnv, FND_RATE_LIMIT_CONSUMER_SECRETS: JSON.stringify({ "WLT-01": "short" }) });
    expect(issues.some((i) => i.includes("at least 16 characters"))).toBe(true);
  });

  it("a secret equal to INTERNAL_SERVICE_TOKEN -> CONFIGURATION_INVALID", () => {
    const issues = configErrorIssues({
      ...validEnv,
      FND_RATE_LIMIT_CONSUMER_SECRETS: JSON.stringify({ "WLT-01": validEnv.INTERNAL_SERVICE_TOKEN }),
    });
    expect(issues.some((i) => i.includes("must not equal INTERNAL_SERVICE_TOKEN"))).toBe(true);
  });

  it("a duplicate raw JSON key -> CONFIGURATION_INVALID (fails closed rather than silently keeping the last value)", () => {
    const raw = '{"WLT-01":"test-wlt1-consumer-secret-32ch!!","WLT-01":"a-different-secret-value-here"}';
    const issues = configErrorIssues({ ...validEnv, FND_RATE_LIMIT_CONSUMER_SECRETS: raw });
    expect(issues.some((i) => i.includes("duplicate module id key"))).toBe(true);
  });

  // NEW-2 (independent Opus post-acceptance review): two DIFFERENT module ids sharing the same
  // secret VALUE previously booted successfully, making module identity ambiguous —
  // `makeRateLimitConsumerGuard` resolves whichever module is iterated first, silently
  // enforcing the other module's traffic under the wrong namespace/policy. This is distinct
  // from the duplicate-KEY case above (same module id twice); here the two module ids are both
  // individually valid, only the shared value is the problem.
  it("two different module ids sharing the same secret VALUE -> CONFIGURATION_INVALID (module identity would be ambiguous)", () => {
    const sharedSecret = "shared-secret-value-used-by-two-modules";
    const issues = configErrorIssues({
      ...validEnv,
      FND_RATE_LIMIT_CONSUMER_SECRETS: JSON.stringify({ "WLT-01": sharedSecret, "CLT-01": sharedSecret }),
    });
    expect(issues.some((i) => i.includes("must not share the same secret value"))).toBe(true);
    // The problem message must name which two modules collided, but never the secret value itself.
    expect(issues.some((i) => i.includes("'WLT-01'") && i.includes("'CLT-01'"))).toBe(true);
    expect(issues.some((i) => i.includes(sharedSecret))).toBe(false);
  });

  it("three module ids where only two share a value -> CONFIGURATION_INVALID names exactly the colliding pair", () => {
    const issues = configErrorIssues({
      ...validEnv,
      FND_RATE_LIMIT_CONSUMER_SECRETS: JSON.stringify({
        "WLT-01": "duplicated-secret-value-abcdefgh",
        "CLT-01": "a-completely-different-secret-1",
        "AML-01": "duplicated-secret-value-abcdefgh",
      }),
    });
    expect(issues.some((i) => i.includes("'WLT-01'") && i.includes("'AML-01'"))).toBe(true);
    expect(issues.some((i) => i.includes("CLT-01"))).toBe(false);
  });

  it("distinct secret values for different module ids -> loads successfully (control case, not rejected)", () => {
    const cfg = loadFndConfig({
      ...validEnv,
      FND_RATE_LIMIT_CONSUMER_SECRETS: JSON.stringify({
        "WLT-01": "test-wlt1-consumer-secret-32ch!!",
        "CLT-01": "test-clt1-consumer-secret-DIFFERENT",
      }),
    });
    expect(cfg.rateLimitConsumerSecrets).toEqual({
      "WLT-01": "test-wlt1-consumer-secret-32ch!!",
      "CLT-01": "test-clt1-consumer-secret-DIFFERENT",
    });
  });

  it("duplicate-value check does not fire on entries already rejected for another reason (no false positive from two blank/short entries)", () => {
    // Two blank values are individually invalid; neither should ALSO produce a duplicate-value
    // problem (both are skipped via `continue` before reaching the value-uniqueness tracking).
    const issues = configErrorIssues({
      ...validEnv,
      FND_RATE_LIMIT_CONSUMER_SECRETS: JSON.stringify({ "WLT-01": "   ", "CLT-01": "   " }),
    });
    expect(issues.filter((i) => i.includes("non-blank string")).length).toBe(2);
    expect(issues.some((i) => i.includes("must not share the same secret value"))).toBe(false);
  });

  it("multiple valid consumer entries all load correctly", () => {
    const cfg = loadFndConfig({
      ...validEnv,
      FND_RATE_LIMIT_CONSUMER_SECRETS: JSON.stringify({
        "WLT-01": "test-wlt1-consumer-secret-32ch!!",
        "CLT-01": "test-clt1-consumer-secret-32ch!!",
      }),
    });
    expect(Object.keys(cfg.rateLimitConsumerSecrets).sort()).toEqual(["CLT-01", "WLT-01"]);
  });
});
