/**
 * KYC-01's log-redaction path list (services/kyc1/src/server.ts's `KYC1_LOG_REDACT_PATHS`) —
 * mirrors tests/unit/aml1-log-redaction.test.ts's shape. Asserts against the exported constant
 * directly rather than introspecting pino's internal logger instance.
 */
import { describe, it, expect } from "vitest";
import { KYC1_LOG_REDACT_PATHS } from "../../services/kyc1/src/server.js";

describe("KYC1_LOG_REDACT_PATHS", () => {
  it("redacts the internal-service-token header", () => {
    expect(KYC1_LOG_REDACT_PATHS).toContain("req.headers['x-internal-service-token']");
  });

  it("redacts the evidence reference introduced by the Phase 1 evidence route (defensive second layer — an opaque reference can still point at a real document)", () => {
    expect(KYC1_LOG_REDACT_PATHS).toContain("req.body.evidence_ref");
  });

  it("has exactly the expected entries — no unexpected additions or omissions", () => {
    expect(KYC1_LOG_REDACT_PATHS).toEqual(["req.headers['x-internal-service-token']", "req.body.evidence_ref"]);
  });

  it("Phase 3A: no new redaction entry is needed for the IAM-02 shared secret — lib/iam2-client.ts sends it OUTBOUND only (never received via a KYC-01 request header/body, never passed to a logger), unlike the inbound x-internal-service-token header this list already covers", () => {
    expect(KYC1_LOG_REDACT_PATHS).toEqual(["req.headers['x-internal-service-token']", "req.body.evidence_ref"]);
  });
});
