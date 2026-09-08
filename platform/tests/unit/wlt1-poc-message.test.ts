/**
 * WLT-01 Phase 3A-1 — canonical Proof-of-Control message construction, message hashing, and the
 * chain/network verification-scheme applicability map (`lib/proof-of-control/message.ts`). Pure
 * unit tests, no database.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildCanonicalPocMessage, computePocMessageHash, resolvePocVerificationScheme } from "../../services/wlt1/src/lib/proof-of-control/message.js";
import type { CanonicalPocMessageFields } from "../../services/wlt1/src/lib/proof-of-control/types.js";

const FIELDS: CanonicalPocMessageFields = {
  domainEnvironment: "dev",
  challengeId: "wlt1pocchal_test_0001",
  nonce: "ab".repeat(32),
  clientId: "clt1client_test",
  destinationId: "wlt1dest_test",
  chain: "ethereum",
  network: "mainnet",
  canonicalAddress: "0x6acb427ACF0724871b29023428f65AEb3B5d1255",
  addressHash: "sha256:" + "cd".repeat(32),
  issuedAtUtc: "2026-08-22T00:00:00.000Z",
  expiresAtUtc: "2026-08-22T00:15:00.000Z",
};

describe("WLT-01 Phase 3A-1 — buildCanonicalPocMessage", () => {
  it("produces the exact frozen 14-line, LF-only message with no trailing newline, in the exact frozen field order", () => {
    const message = buildCanonicalPocMessage(1, FIELDS);
    expect(message).toBe(
      [
        "AIX WLT-01 Proof of Control",
        "version: 1",
        "purpose: prove_control_of_destination_address",
        "environment: dev",
        "challenge_id: wlt1pocchal_test_0001",
        `nonce: ${"ab".repeat(32)}`,
        "client_id: clt1client_test",
        "destination_id: wlt1dest_test",
        "chain: ethereum",
        "network: mainnet",
        "address: 0x6acb427ACF0724871b29023428f65AEb3B5d1255",
        `address_hash: sha256:${"cd".repeat(32)}`,
        "issued_at_utc: 2026-08-22T00:00:00.000Z",
        "expires_at_utc: 2026-08-22T00:15:00.000Z",
      ].join("\n"),
    );
  });

  it("contains no trailing newline", () => {
    const message = buildCanonicalPocMessage(1, FIELDS);
    expect(message.endsWith("\n")).toBe(false);
  });

  it("uses LF only — no CR anywhere", () => {
    const message = buildCanonicalPocMessage(1, FIELDS);
    expect(message.includes("\r")).toBe(false);
  });

  it("is exactly 14 lines", () => {
    const message = buildCanonicalPocMessage(1, FIELDS);
    expect(message.split("\n")).toHaveLength(14);
  });

  it("dispatches explicitly on messageFormatVersion — an unsupported version fails closed rather than silently rendering via the current/latest builder", () => {
    expect(() => buildCanonicalPocMessage(2, FIELDS)).toThrow(/message_format_version/);
    expect(() => buildCanonicalPocMessage(0, FIELDS)).toThrow(/message_format_version/);
    expect(() => buildCanonicalPocMessage(-1, FIELDS)).toThrow(/message_format_version/);
  });

  // -------------------------------------------------------------------------------------------
  // M-3A1-1 CLOSURE — the builder boundary now enforces the frozen nonce/timestamp grammar,
  // regardless of caller correctness.
  // -------------------------------------------------------------------------------------------
  it("M-3A1-1: malformed nonce is rejected by the builder — never silently rendered or lowercased", () => {
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, nonce: "NOT-HEX" })).toThrow(/nonce/);
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, nonce: "ab".repeat(31) })).toThrow(/nonce/); // 62 chars, too short
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, nonce: "ab".repeat(33) })).toThrow(/nonce/); // 66 chars, too long
    // Uppercase hex is REJECTED, never silently lowercased by the builder.
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, nonce: "AB".repeat(32) })).toThrow(/nonce/);
  });

  it("M-3A1-1: an offset (non-UTC) timestamp is rejected by the builder", () => {
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, issuedAtUtc: "2026-08-22T17:15:42+08:00" })).toThrow(/issued_at_utc/);
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, expiresAtUtc: "2026-08-22T17:15:42+08:00" })).toThrow(/expires_at_utc/);
  });

  it("M-3A1-1: a missing-milliseconds timestamp is rejected by the builder", () => {
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, issuedAtUtc: "2026-08-22T09:15:42Z" })).toThrow(/issued_at_utc/);
  });

  it("M-3A1-1: a date-only timestamp is rejected by the builder", () => {
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, issuedAtUtc: "2026-08-22" })).toThrow(/issued_at_utc/);
  });

  it("M-3A1-1: an arbitrary/locale-formatted string is rejected by the builder", () => {
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, issuedAtUtc: "August 22, 2026" })).toThrow(/issued_at_utc/);
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, issuedAtUtc: "not-a-timestamp" })).toThrow(/issued_at_utc/);
  });

  it("M-3A1-1: exact canonical grammar (server-owned Date.toISOString()) is accepted", () => {
    const now = new Date("2026-08-22T09:15:42.123Z");
    expect(now.toISOString()).toBe("2026-08-22T09:15:42.123Z");
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, issuedAtUtc: now.toISOString(), expiresAtUtc: new Date(now.getTime() + 900_000).toISOString() })).not.toThrow();
  });

  // -------------------------------------------------------------------------------------------
  // L-3A2-1 CLOSURE — the grammar regex alone accepted calendar-IMPOSSIBLE values with the right
  // SHAPE. The builder must reject the underlying instant, not just its string shape.
  // -------------------------------------------------------------------------------------------
  it("L-3A2-1: calendar-impossible month/hour/minute/second values are rejected", () => {
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, issuedAtUtc: "2026-13-45T99:99:99.999Z" })).toThrow(/issued_at_utc/);
  });

  it("L-3A2-1: the zero/epoch-invalid date '0000-00-00T00:00:00.000Z' is rejected", () => {
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, issuedAtUtc: "0000-00-00T00:00:00.000Z" })).toThrow(/issued_at_utc/);
  });

  it("L-3A2-1: a day that does not exist in the given month is rejected (Feb 30, Apr 31) — JS Date normalization-away is caught by the round-trip check", () => {
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, issuedAtUtc: "2026-02-30T12:00:00.000Z" })).toThrow(/issued_at_utc/);
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, issuedAtUtc: "2026-04-31T12:00:00.000Z" })).toThrow(/issued_at_utc/);
  });

  it("L-3A2-1: genuinely valid calendar instants remain accepted — ordinary date, last instant of a non-leap February, and a real leap day", () => {
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, issuedAtUtc: "2026-08-22T12:34:56.000Z", expiresAtUtc: "2026-08-22T12:49:56.000Z" })).not.toThrow();
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, issuedAtUtc: "2026-02-28T23:59:59.999Z", expiresAtUtc: "2026-03-01T00:00:00.000Z" })).not.toThrow();
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, issuedAtUtc: "2028-02-29T00:00:00.000Z", expiresAtUtc: "2028-02-29T00:15:00.000Z" })).not.toThrow();
  });

  it("L-3A2-1: calendar validity is enforced on expiresAtUtc too, not only issuedAtUtc", () => {
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, expiresAtUtc: "2026-02-30T12:00:00.000Z" })).toThrow(/expires_at_utc/);
  });

  it("M-3A1-1: expiresAtUtc must be strictly after issuedAtUtc", () => {
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, issuedAtUtc: FIELDS.expiresAtUtc, expiresAtUtc: FIELDS.issuedAtUtc })).toThrow(/expiresAtUtc/);
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, issuedAtUtc: FIELDS.issuedAtUtc, expiresAtUtc: FIELDS.issuedAtUtc })).toThrow(/expiresAtUtc/); // equal, not strictly after
  });

  it("M-3A1-1: an unknown domainEnvironment is rejected by the builder (defence in depth beyond the compile-time union)", () => {
    expect(() => buildCanonicalPocMessage(1, { ...FIELDS, domainEnvironment: "sandbox" as unknown as CanonicalPocMessageFields["domainEnvironment"] })).toThrow(/domainEnvironment/);
  });

  it("is deterministic — identical fields produce byte-identical output", () => {
    expect(buildCanonicalPocMessage(1, FIELDS)).toBe(buildCanonicalPocMessage(1, { ...FIELDS }));
  });

  it("changing any single field changes the output (no field is silently ignored)", () => {
    const base = buildCanonicalPocMessage(1, FIELDS);
    const variants: Array<Partial<CanonicalPocMessageFields>> = [
      { challengeId: "different" },
      { nonce: "ff".repeat(32) },
      { clientId: "different" },
      { destinationId: "different" },
      { chain: "tron" },
      { network: "testnet" },
      { canonicalAddress: "0x0000000000000000000000000000000000dEaD" },
      { addressHash: "sha256:" + "00".repeat(32) },
      { issuedAtUtc: "2026-08-22T00:00:00.001Z" },
      { expiresAtUtc: "2026-08-22T00:15:00.001Z" },
      { domainEnvironment: "prod" },
    ];
    for (const variant of variants) {
      expect(buildCanonicalPocMessage(1, { ...FIELDS, ...variant })).not.toBe(base);
    }
  });
});

describe("WLT-01 Phase 3A-1 — computePocMessageHash", () => {
  it("is SHA-256 over the exact UTF-8 bytes of the canonical message — lowercase hex, 64 chars, no 0x prefix", () => {
    const message = buildCanonicalPocMessage(1, FIELDS);
    const hash = computePocMessageHash(message);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash("sha256").update(Buffer.from(message, "utf8")).digest("hex"));
  });

  it("hashes the raw string bytes, never a JSON/object re-serialization of the fields", () => {
    const message = buildCanonicalPocMessage(1, FIELDS);
    const jsonHash = createHash("sha256").update(Buffer.from(JSON.stringify(FIELDS), "utf8")).digest("hex");
    expect(computePocMessageHash(message)).not.toBe(jsonHash);
  });

  it("is deterministic and sensitive to every byte", () => {
    const a = computePocMessageHash("hello");
    const b = computePocMessageHash("hello");
    const c = computePocMessageHash("hellp");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("WLT-01 Phase 3A-1/3B — resolvePocVerificationScheme (applicability map)", () => {
  it("ethereum/mainnet resolves to eip191_personal_sign", () => {
    expect(resolvePocVerificationScheme("ethereum", "mainnet")).toEqual({ supported: true, verificationScheme: "eip191_personal_sign" });
  });

  it("tron/mainnet resolves to tron_personal_sign (Phase 3B) — a DIFFERENT scheme, never a silent fallback onto EIP-191", () => {
    expect(resolvePocVerificationScheme("tron", "mainnet")).toEqual({ supported: true, verificationScheme: "tron_personal_sign" });
  });

  it("every other chain/network pair resolves UNSUPPORTED, including TRON on a non-mainnet network", () => {
    expect(resolvePocVerificationScheme("ethereum", "testnet")).toEqual({ supported: false });
    expect(resolvePocVerificationScheme("tron", "nile")).toEqual({ supported: false });
    expect(resolvePocVerificationScheme("tron", "testnet")).toEqual({ supported: false });
    expect(resolvePocVerificationScheme("bitcoin", "mainnet")).toEqual({ supported: false });
    expect(resolvePocVerificationScheme("", "")).toEqual({ supported: false });
  });
});
