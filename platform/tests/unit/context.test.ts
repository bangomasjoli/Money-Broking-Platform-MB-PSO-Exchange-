import { describe, it, expect } from "vitest";
import { createRequestContext, deriveAsyncContext } from "@aix/foundation";

describe("request context (FND-FR-002, §5.6)", () => {
  it("generates request_id and correlation_id when absent", () => {
    const ctx = createRequestContext({});
    expect(ctx.request_id).toMatch(/^req_/);
    expect(ctx.correlation_id).toMatch(/^corr_/);
    expect(ctx.server_time_utc).toMatch(/T.*Z$/);
  });

  it("accepts a well-formed inbound correlation id", () => {
    const ctx = createRequestContext({ headerCorrelationId: "corr_abc-123" });
    expect(ctx.correlation_id).toBe("corr_abc-123");
  });

  it("rejects malformed inbound ids and falls back to generated (fail safe)", () => {
    const ctx = createRequestContext({ headerCorrelationId: "bad id with spaces!" });
    expect(ctx.correlation_id).toMatch(/^corr_/);
    expect(ctx.correlation_id).not.toContain(" ");
  });

  it("derives async context preserving origin + causation", () => {
    const parent = createRequestContext({ headerCorrelationId: "corr_root" });
    const child = deriveAsyncContext(parent, { causationId: "evt_1" });
    expect(child.correlation_id).toBe("corr_root");
    expect(child.origin_correlation_id).toBe("corr_root");
    expect(child.causation_id).toBe("evt_1");
    expect(child.request_id).not.toBe(parent.request_id);
  });
});
