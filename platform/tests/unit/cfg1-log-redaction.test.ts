/**
 * CFG-01's log-redaction path list (services/cfg1/src/server.ts's `CFG1_LOG_REDACT_PATHS`) —
 * mirrors tests/unit/sec1-log-redaction.test.ts's shape. Asserts against the exported constant
 * directly rather than introspecting pino's internal logger instance.
 */
import { describe, expect, it } from "vitest";
import { CFG1_LOG_REDACT_PATHS } from "../../services/cfg1/src/server.js";

describe("CFG1_LOG_REDACT_PATHS", () => {
  it("redacts the internal-service-token header", () => {
    expect(CFG1_LOG_REDACT_PATHS).toContain("req.headers['x-internal-service-token']");
  });

  it("redacts the Phase 2 verify-decision raw decision_token field (approved decision #13)", () => {
    expect(CFG1_LOG_REDACT_PATHS).toContain("req.body.decision_token");
  });

  it("has exactly these two entries this phase — no unexpected additions", () => {
    expect(CFG1_LOG_REDACT_PATHS).toEqual(["req.headers['x-internal-service-token']", "req.body.decision_token"]);
  });
});
