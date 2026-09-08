/**
 * Unit test for SEC-01 Phase 5's LOW-3 fix (Opus review): `decision_token` (the Critical-alert-
 * closure single-use bearer token, `POST /internal/sec1/security-alerts/close`) must be
 * redacted from Fastify/pino logs, same as the ingestion bearer token header and raw metadata
 * already are. Asserts against the exported `SEC1_LOG_REDACT_PATHS` constant directly rather
 * than introspecting pino's internal logger instance.
 */
import { describe, expect, it } from "vitest";
import { SEC1_LOG_REDACT_PATHS } from "../../services/sec1/src/server.js";

describe("SEC1_LOG_REDACT_PATHS", () => {
  it("redacts the Critical-closure decision_token", () => {
    expect(SEC1_LOG_REDACT_PATHS).toContain("req.body.decision_token");
  });

  it("still redacts the pre-existing ingestion bearer token header and raw metadata (unchanged by this fix)", () => {
    expect(SEC1_LOG_REDACT_PATHS).toContain("req.headers['x-internal-service-token']");
    expect(SEC1_LOG_REDACT_PATHS).toContain("req.body.metadata");
  });

  it("does NOT redact approval_id (an approval record identifier, not a secret bearer credential)", () => {
    expect(SEC1_LOG_REDACT_PATHS).not.toContain("req.body.approval_id");
  });
});
