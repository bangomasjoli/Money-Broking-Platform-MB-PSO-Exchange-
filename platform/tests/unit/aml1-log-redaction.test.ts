/**
 * AML-01's log-redaction path list (services/aml1/src/server.ts's `AML1_LOG_REDACT_PATHS`) —
 * mirrors tests/unit/clt1-log-redaction.test.ts's shape. Asserts against the exported constant
 * directly rather than introspecting pino's internal logger instance. Phase 1 adds the
 * declared-identity PII body fields accepted by `POST .../screening-requests` (approved design
 * decision: PII is stored in `aml1.screening_subject_snapshot` but never RETURNED by any route
 * response — see lib/screening.ts's `safeScreeningResponse` — this is the defensive second layer
 * for request logging).
 */
import { describe, expect, it } from "vitest";
import { AML1_LOG_REDACT_PATHS } from "../../services/aml1/src/server.js";

describe("AML1_LOG_REDACT_PATHS", () => {
  it("redacts the internal-service-token header", () => {
    expect(AML1_LOG_REDACT_PATHS).toContain("req.headers['x-internal-service-token']");
  });

  it("redacts every PII-bearing declared_identity field introduced by Phase 1 screening routes", () => {
    expect(AML1_LOG_REDACT_PATHS).toContain("req.body.declared_identity.name");
    expect(AML1_LOG_REDACT_PATHS).toContain("req.body.declared_identity.registration_number");
    expect(AML1_LOG_REDACT_PATHS).toContain("req.body.declared_identity.date_of_birth");
    expect(AML1_LOG_REDACT_PATHS).toContain("req.body.declared_identity.nationality");
  });

  it("redacts the disposition reason and raw decision token introduced by Phase 2B disposition routes", () => {
    expect(AML1_LOG_REDACT_PATHS).toContain("req.body.reason");
    expect(AML1_LOG_REDACT_PATHS).toContain("req.body.decision_token");
  });

  it("has exactly the expected entries — no unexpected additions or omissions", () => {
    expect(AML1_LOG_REDACT_PATHS).toEqual([
      "req.headers['x-internal-service-token']",
      "req.body.declared_identity.name",
      "req.body.declared_identity.registration_number",
      "req.body.declared_identity.date_of_birth",
      "req.body.declared_identity.nationality",
      "req.body.reason",
      "req.body.decision_token",
    ]);
  });
});
