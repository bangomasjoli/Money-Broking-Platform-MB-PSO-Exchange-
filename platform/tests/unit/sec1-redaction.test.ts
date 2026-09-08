/**
 * Unit tests for SEC-01's metadata redaction policy (services/sec1/src/lib/redaction.ts).
 * Chosen policy: REDACT secret-like keys (never reject the whole event) — see that file's
 * header comment for why. No DB required.
 */
import { describe, expect, it } from "vitest";
import { redactMetadata } from "../../services/sec1/src/lib/redaction.js";

describe("redactMetadata", () => {
  it("redacts a top-level secret-like key", () => {
    const out = redactMetadata({ password: "hunter2", note: "safe" });
    expect(out.password).toBe("[REDACTED]");
    expect(out.note).toBe("safe");
  });

  it("is case-insensitive on key names", () => {
    const out = redactMetadata({ ACCESS_TOKEN: "abc.def.ghi" });
    expect(out.ACCESS_TOKEN).toBe("[REDACTED]");
  });

  it("redacts nested secret-like keys recursively", () => {
    const out = redactMetadata({ step_up: { mfa_code: "123456", assertion_ref: "stepup_1" } });
    expect((out.step_up as Record<string, unknown>).mfa_code).toBe("[REDACTED]");
    expect((out.step_up as Record<string, unknown>).assertion_ref).toBe("stepup_1");
  });

  it("redacts secret-like keys inside arrays of objects", () => {
    const out = redactMetadata({ items: [{ api_key: "sk_live_123" }, { safe: "value" }] });
    const items = out.items as Array<Record<string, unknown>>;
    expect(items[0]?.api_key).toBe("[REDACTED]");
    expect(items[1]?.safe).toBe("value");
  });

  it("returns an empty object for null/undefined metadata", () => {
    expect(redactMetadata(null)).toEqual({});
    expect(redactMetadata(undefined)).toEqual({});
  });

  it("never mutates the input object", () => {
    const input = { password: "secret" };
    redactMetadata(input);
    expect(input.password).toBe("secret");
  });

  it("passes through metadata with no sensitive keys unchanged", () => {
    const input = { approval_id: "approval_1", sod_check_id: "sod_1" };
    expect(redactMetadata(input)).toEqual(input);
  });
});
