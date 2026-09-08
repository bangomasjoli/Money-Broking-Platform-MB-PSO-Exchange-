/**
 * CLT-01's log-redaction path list (services/clt1/src/server.ts's `CLT1_LOG_REDACT_PATHS`) —
 * mirrors tests/unit/cfg1-log-redaction.test.ts's shape. Asserts against the exported constant
 * directly rather than introspecting pino's internal logger instance. Phase 1 adds the PII
 * intake-body fields (approved design decision: PII is stored in client_application but never
 * RETURNED by any route response — this is the defensive second layer for request logging). Phase
 * 2 adds `req.body.reason` (approve/request's free-text reviewer-supplied field) defensively, same
 * caution as `evidence_ref`. Phase 3 adds `req.body.user_reference` (the declared authorised-user
 * identity — name/email/external reference — stored but never returned by the default list
 * route). Phase 4 adds `req.body.party_reference` (the declared authorised-party identity — same
 * posture).
 */
import { describe, expect, it } from "vitest";
import { CLT1_LOG_REDACT_PATHS } from "../../services/clt1/src/server.js";

describe("CLT1_LOG_REDACT_PATHS", () => {
  it("redacts the internal-service-token header", () => {
    expect(CLT1_LOG_REDACT_PATHS).toContain("req.headers['x-internal-service-token']");
  });

  it("redacts every PII-bearing request-body field introduced by Phase 1 intake routes", () => {
    expect(CLT1_LOG_REDACT_PATHS).toContain("req.body.legal_name");
    expect(CLT1_LOG_REDACT_PATHS).toContain("req.body.applicant_email");
    expect(CLT1_LOG_REDACT_PATHS).toContain("req.body.registration_number");
    expect(CLT1_LOG_REDACT_PATHS).toContain("req.body.country_of_incorporation");
    expect(CLT1_LOG_REDACT_PATHS).toContain("req.body.evidence_ref");
    expect(CLT1_LOG_REDACT_PATHS).toContain("req.body.given_by");
    expect(CLT1_LOG_REDACT_PATHS).toContain("req.body.created_by");
    expect(CLT1_LOG_REDACT_PATHS).toContain("req.body.assigned_reviewer");
  });

  it("has exactly the expected entries — no unexpected additions or omissions", () => {
    expect(CLT1_LOG_REDACT_PATHS).toEqual([
      "req.headers['x-internal-service-token']",
      "req.body.legal_name",
      "req.body.applicant_email",
      "req.body.registration_number",
      "req.body.country_of_incorporation",
      "req.body.evidence_ref",
      "req.body.given_by",
      "req.body.created_by",
      "req.body.assigned_reviewer",
      "req.body.reason",
      "req.body.user_reference",
      "req.body.party_reference",
    ]);
  });
});
