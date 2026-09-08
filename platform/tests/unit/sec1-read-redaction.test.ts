/**
 * Unit tests for SEC-01 Phase 4 tier-based read redaction
 * (services/sec1/src/lib/read-redaction.ts). No DB required — pure function over an in-memory
 * row shape. See that file's header comment for the tier model
 * (`07_Permission_Rules.md` §6).
 */
import { describe, expect, it } from "vitest";
import { redactAuditEventRow, type RedactableAuditEventRow } from "../../services/sec1/src/lib/read-redaction.js";

function sampleRow(overrides: Partial<RedactableAuditEventRow> = {}): RedactableAuditEventRow {
  return {
    audit_event_ref: "audit_1",
    event_type: "sec1.self_audit_event",
    event_category: "security",
    severity: "medium",
    source_module: "SEC-01",
    actor_user_id: "user_1",
    actor_type: "staff",
    session_id: "session_1",
    client_id: "client_1",
    entity_type: "entity_x",
    entity_id: "entity_1",
    action: "test.action",
    result: "success",
    reason_code: null,
    request_id: "req_1",
    correlation_id: "corr_1",
    occurred_at_utc: "2026-01-01T00:00:00.000Z",
    ingested_at_utc: "2026-01-01T00:00:01.000Z",
    metadata_redacted: { safe_key: "safe_value" },
    classification: "restricted",
    retention_class: "standard",
    status: "active",
    sensitive_read: true,
    ...overrides,
  };
}

describe("redactAuditEventRow", () => {
  it("discloses sensitive-tier fields when the row is sensitive AND the actor holds read_sensitive", () => {
    const { redacted, disclosedSensitive } = redactAuditEventRow(sampleRow({ sensitive_read: true }), true, undefined);
    expect(disclosedSensitive).toBe(true);
    expect(redacted.session_id).toBe("session_1");
    expect(redacted.client_id).toBe("client_1");
    expect(redacted.request_id).toBe("req_1");
    expect(redacted.correlation_id).toBe("corr_1");
    expect(redacted.metadata_redacted).toEqual({ safe_key: "safe_value" });
  });

  it("redacts to normal tier when the row is sensitive but the actor lacks read_sensitive", () => {
    const { redacted, disclosedSensitive } = redactAuditEventRow(sampleRow({ sensitive_read: true }), false, undefined);
    expect(disclosedSensitive).toBe(false);
    expect(redacted.client_id).toBeNull();
    expect(redacted).not.toHaveProperty("session_id");
    expect(redacted).not.toHaveProperty("request_id");
    expect(redacted).not.toHaveProperty("correlation_id");
    expect(redacted).not.toHaveProperty("metadata_redacted");
  });

  it("stays normal tier for a non-sensitive row even when the actor holds read_sensitive", () => {
    const { redacted, disclosedSensitive } = redactAuditEventRow(sampleRow({ sensitive_read: false }), true, undefined);
    expect(disclosedSensitive).toBe(false);
    expect(redacted.client_id).toBeNull();
    expect(redacted).not.toHaveProperty("metadata_redacted");
  });

  it("reveals client_id at normal tier only when the request was scoped to that exact client_id", () => {
    const row = sampleRow({ sensitive_read: false, client_id: "client_42" });
    const scoped = redactAuditEventRow(row, false, "client_42");
    const unscoped = redactAuditEventRow(row, false, undefined);
    const wrongScope = redactAuditEventRow(row, false, "client_99");
    expect(scoped.redacted.client_id).toBe("client_42");
    expect(unscoped.redacted.client_id).toBeNull();
    expect(wrongScope.redacted.client_id).toBeNull();
  });

  it("never omits hash-chain/integrity fields from the input shape at all (nothing to leak)", () => {
    const { redacted } = redactAuditEventRow(sampleRow({ sensitive_read: true }), true, undefined);
    for (const forbidden of [
      "event_hash",
      "previous_hash",
      "sequence_no",
      "stream_id",
      "ingest_payload_hash",
      "canonical_format_version",
      "seal_batch_id",
      "external_anchor_ref",
      "trusted_timestamp_ref",
    ]) {
      expect(redacted).not.toHaveProperty(forbidden);
    }
  });

  it("never exposes secrets/tokens regardless of tier (base fields carry no such data)", () => {
    const normal = redactAuditEventRow(sampleRow({ sensitive_read: false }), false, undefined).redacted;
    const sensitive = redactAuditEventRow(sampleRow({ sensitive_read: true }), true, undefined).redacted;
    for (const redacted of [normal, sensitive]) {
      expect(redacted).not.toHaveProperty("token_hash");
      expect(redacted).not.toHaveProperty("source_identity_token");
      expect(JSON.stringify(redacted)).not.toMatch(/password|secret|token_hash/i);
    }
  });

  it("visible fields (event_type, severity, source_module, entity, classification) are identical across both tiers", () => {
    const row = sampleRow({ sensitive_read: true });
    const normal = redactAuditEventRow(row, false, undefined).redacted;
    const sensitive = redactAuditEventRow(row, true, undefined).redacted;
    for (const field of ["event_type", "severity", "source_module", "entity_type", "entity_id", "classification", "retention_class"]) {
      expect(normal[field]).toEqual(sensitive[field]);
    }
  });
});
