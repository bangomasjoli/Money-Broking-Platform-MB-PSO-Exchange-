/**
 * Unit tests for SEC-01's event-schema-registry mandatory-field validation
 * (services/sec1/src/lib/schema-registry.ts). Pure logic — no DB required (a fake
 * `EventSchemaRow` stands in for a row `lookupEventSchema` would otherwise return).
 */
import { describe, expect, it } from "vitest";
import {
  assertEventTypeKnown,
  assertMandatoryFieldsPresent,
  type EventSchemaRow,
} from "../../services/sec1/src/lib/schema-registry.js";
import { Sec1Error } from "../../services/sec1/src/lib/errors.js";

function fakeSchema(overrides: Partial<EventSchemaRow> = {}): EventSchemaRow {
  return {
    event_type: "fnd01.generic_event",
    source_module: "FND-01",
    category: "system",
    default_severity: "medium",
    mandatory_fields: ["event_id", "action", "result"],
    classification: "restricted",
    retention_class: "standard",
    sensitive_read: false,
    status: "active",
    version: 1,
    ...overrides,
  };
}

describe("assertEventTypeKnown", () => {
  it("does not throw when a schema row is found", () => {
    expect(() => assertEventTypeKnown(fakeSchema(), "fnd01.generic_event")).not.toThrow();
  });

  it("throws SEC1_EVENT_TYPE_UNKNOWN when no schema row is found", () => {
    try {
      assertEventTypeKnown(undefined, "unknown.event.type");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(Sec1Error);
      expect((err as Sec1Error).code).toBe("SEC1_EVENT_TYPE_UNKNOWN");
    }
  });
});

describe("assertMandatoryFieldsPresent", () => {
  it("passes when every mandatory field is present and non-blank", () => {
    const schema = fakeSchema();
    expect(() =>
      assertMandatoryFieldsPresent(schema, { event_id: "evt_1", action: "enqueue", result: "success" }),
    ).not.toThrow();
  });

  it("throws SEC1_REQUIRED_FIELD_MISSING listing every missing field at once", () => {
    const schema = fakeSchema({ mandatory_fields: ["event_id", "action", "result", "entity_type"] });
    try {
      assertMandatoryFieldsPresent(schema, { event_id: "evt_1" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(Sec1Error);
      const sec1Err = err as Sec1Error;
      expect(sec1Err.code).toBe("SEC1_REQUIRED_FIELD_MISSING");
      const missingFields = sec1Err.details.map((d) => d.field);
      expect(missingFields).toEqual(["action", "result", "entity_type"]);
    }
  });

  it("treats a blank string as missing", () => {
    const schema = fakeSchema({ mandatory_fields: ["action"] });
    expect(() => assertMandatoryFieldsPresent(schema, { action: "   " })).toThrow(Sec1Error);
  });

  it("treats null as missing", () => {
    const schema = fakeSchema({ mandatory_fields: ["action"] });
    expect(() => assertMandatoryFieldsPresent(schema, { action: null })).toThrow(Sec1Error);
  });
});
