/**
 * WLT-01 Public Client Surface — `lib/public/cursor.ts` opaque keyset-pagination cursor. No DB
 * required — pure encode/decode logic.
 */
import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor } from "../../services/wlt1/src/lib/public/cursor.js";

describe("WLT-01 Public Client Surface — pagination cursor", () => {
  it("round-trips a valid position for the correct client", () => {
    const position = { clientId: "clt1client_1", createdAtUtc: "2026-01-01T00:00:00.000Z", destinationId: "wlt1dest_abc" };
    const encoded = encodeCursor(position);
    const decoded = decodeCursor(encoded, "clt1client_1");
    expect(decoded).toEqual(position);
  });

  it("is opaque (not human-readable plaintext of the position fields)", () => {
    const encoded = encodeCursor({ clientId: "clt1client_1", createdAtUtc: "2026-01-01T00:00:00.000Z", destinationId: "wlt1dest_abc" });
    expect(encoded).not.toContain("clt1client_1");
    expect(encoded).not.toContain("wlt1dest_abc");
  });

  it("rejects a cursor minted for a DIFFERENT client — never silently re-scopes", () => {
    const encoded = encodeCursor({ clientId: "clt1client_A", createdAtUtc: "2026-01-01T00:00:00.000Z", destinationId: "wlt1dest_abc" });
    expect(decodeCursor(encoded, "clt1client_B")).toBeUndefined();
  });

  it("rejects garbage base64url input", () => {
    expect(decodeCursor("not-valid-base64!!!", "clt1client_1")).toBeUndefined();
    expect(decodeCursor("", "clt1client_1")).toBeUndefined();
  });

  it("rejects a syntactically-valid-base64 payload that is not JSON", () => {
    const raw = Buffer.from("not json at all", "utf8").toString("base64url");
    expect(decodeCursor(raw, "clt1client_1")).toBeUndefined();
  });

  it("rejects a JSON payload missing required fields", () => {
    const raw = Buffer.from(JSON.stringify({ v: 1, client_id: "clt1client_1" }), "utf8").toString("base64url");
    expect(decodeCursor(raw, "clt1client_1")).toBeUndefined();
  });

  it("rejects an unknown version number", () => {
    const raw = Buffer.from(JSON.stringify({ v: 2, client_id: "clt1client_1", created_at_utc: "2026-01-01T00:00:00.000Z", destination_id: "wlt1dest_abc" }), "utf8").toString("base64url");
    expect(decodeCursor(raw, "clt1client_1")).toBeUndefined();
  });

  it("rejects a semantically-invalid (unparseable) timestamp", () => {
    const raw = Buffer.from(JSON.stringify({ v: 1, client_id: "clt1client_1", created_at_utc: "not-a-timestamp", destination_id: "wlt1dest_abc" }), "utf8").toString("base64url");
    expect(decodeCursor(raw, "clt1client_1")).toBeUndefined();
  });

  it("rejects a JSON array or primitive payload", () => {
    expect(decodeCursor(Buffer.from("[1,2,3]", "utf8").toString("base64url"), "clt1client_1")).toBeUndefined();
    expect(decodeCursor(Buffer.from('"just a string"', "utf8").toString("base64url"), "clt1client_1")).toBeUndefined();
    expect(decodeCursor(Buffer.from("null", "utf8").toString("base64url"), "clt1client_1")).toBeUndefined();
  });
});
