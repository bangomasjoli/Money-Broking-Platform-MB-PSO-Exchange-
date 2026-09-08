/**
 * WLT-01 Phase 3A-1/3A-2 — canonical Proof-of-Control challenge message construction + message
 * hashing + the chain/network verification-scheme applicability map. Pure, in-process, no DB
 * access, no HTTP, no crypto-signature operation (that is `crypto.ts`'s own responsibility) — this
 * file only builds and hashes bytes.
 *
 * FROZEN BYTE LAYOUT (Phase 3 architecture, do not redesign here): a 14-line, LF-only, UTF-8
 * string with NO trailing newline, exact field order below. `messageFormatVersion` is dispatched
 * on EXPLICITLY (`buildCanonicalPocMessage`'s own `switch`) — an unknown version throws rather than
 * silently falling back to the current/latest builder, so a future format 2 can be added without
 * this file ever reinterpreting an old persisted version under new rules.
 *
 * M-3A1-1 CLOSURE (Phase 3A-2): the 3A-1 builder accepted plain strings for `nonce`/`issuedAtUtc`/
 * `expiresAtUtc` without enforcing the frozen grammar — latent (nothing signed anything yet), but
 * load-bearing once 3A-3 must re-render a byte-identical message from persisted `timestamptz`
 * columns to verify a signature against it. `buildCanonicalPocMessageV1` now validates EVERY field
 * at this boundary, REGARDLESS of who the caller is or how correct today's only caller
 * (`routes/proof-of-control.ts`) happens to be — trusting a caller's current correctness is exactly
 * what M-3A1-1 flagged as insufficient. A malformed nonce/timestamp/expiry-ordering throws here,
 * never silently renders a non-canonical value into signed material.
 */
import { createHash } from "node:crypto";
import { POC_DOMAIN_ENVIRONMENTS, POC_MESSAGE_FORMAT_VERSION_1, POC_VERIFICATION_SCHEME_EIP191_PERSONAL_SIGN, POC_VERIFICATION_SCHEME_TRON_PERSONAL_SIGN } from "./types.js";
import type { CanonicalPocMessageFields, PocApplicabilityResult } from "./types.js";

/** Exactly 64 lowercase hex characters — the frozen nonce grammar (`randomBytes(32)` hex-encoded).
 * Uppercase hex is REJECTED here, never silently lowercased — the builder validates canonical
 * data, it does not repair non-canonical caller input (Part B: "issuance service generates
 * canonical data; builder validates canonical data"). */
const NONCE_PATTERN = /^[0-9a-f]{64}$/;

/** The frozen RFC3339 UTC-milliseconds-`Z` grammar this message format requires for BOTH
 * `issued_at_utc` and `expires_at_utc` — exactly what `Date.prototype.toISOString()` produces,
 * and nothing else: no timezone offset, no bare-seconds precision, no date-only value, no
 * arbitrary string. */
const CANONICAL_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function assertCanonicalNonce(nonce: string): void {
  if (!NONCE_PATTERN.test(nonce)) {
    throw new Error("WLT-01 PoC canonical message builder: nonce must be exactly 64 lowercase hex characters");
  }
}

/** L-3A2-1 CLOSURE (Phase 3A-3): the grammar regex alone accepts calendar-IMPOSSIBLE strings that
 * merely have the right SHAPE — `2026-13-45T99:99:99.999Z` matches `\d{4}-\d{2}-...` perfectly.
 * `Date.parse` on such a string returns `NaN`, which would otherwise silently bypass the
 * `expiresAtUtc > issuedAtUtc` ordering comparison (`NaN <= NaN` is `false`). Requiring
 * `Number.isFinite(parsed)` AND an exact `new Date(parsed).toISOString() === value` round-trip
 * catches both outright-impossible values (month 13, hour 99) and JS-Date-normalized-away values
 * (e.g. `2026-02-30...` would parse successfully but normalize to March 2 — the round-trip check
 * catches this too, since the re-serialized string would differ from the input). Rendering format
 * itself is unchanged — this only adds validation, never alters `toISOString()`'s own output. */
function assertCanonicalTimestamp(fieldName: "issued_at_utc" | "expires_at_utc", value: string): void {
  if (!CANONICAL_UTC_TIMESTAMP_PATTERN.test(value)) {
    throw new Error(`WLT-01 PoC canonical message builder: ${fieldName} must be exact RFC3339 UTC-milliseconds-Z grammar (YYYY-MM-DDTHH:mm:ss.sssZ)`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`WLT-01 PoC canonical message builder: ${fieldName} is not a calendar-valid instant`);
  }
}

/** The two reachable chain/network pairs for Proof-of-Control verification (Phase 3A + 3B). Every
 * other chain/network deliberately resolves `{ supported: false }` — never a fallback onto either
 * scheme. `tron/mainnet` resolves to TRON's OWN byte layout (`tron_personal_sign`, TronWeb
 * `signMessageV2`-compatible) — never the EVM scheme. */
function resolvePocVerificationScheme(chain: string, network: string): PocApplicabilityResult {
  if (chain === "ethereum" && network === "mainnet") {
    return { supported: true, verificationScheme: POC_VERIFICATION_SCHEME_EIP191_PERSONAL_SIGN };
  }
  if (chain === "tron" && network === "mainnet") {
    return { supported: true, verificationScheme: POC_VERIFICATION_SCHEME_TRON_PERSONAL_SIGN };
  }
  return { supported: false };
}

function buildCanonicalPocMessageV1(fields: CanonicalPocMessageFields): string {
  // M-3A1-1 CLOSURE — validated at the builder boundary, never trusted merely because today's
  // only caller happens to be correct.
  if (!POC_DOMAIN_ENVIRONMENTS.includes(fields.domainEnvironment)) {
    throw new Error(`WLT-01 PoC canonical message builder: domainEnvironment '${fields.domainEnvironment}' is not one of ${POC_DOMAIN_ENVIRONMENTS.join("/")}`);
  }
  assertCanonicalNonce(fields.nonce);
  assertCanonicalTimestamp("issued_at_utc", fields.issuedAtUtc);
  assertCanonicalTimestamp("expires_at_utc", fields.expiresAtUtc);
  if (Date.parse(fields.expiresAtUtc) <= Date.parse(fields.issuedAtUtc)) {
    throw new Error("WLT-01 PoC canonical message builder: expiresAtUtc must be strictly after issuedAtUtc");
  }

  return [
    "AIX WLT-01 Proof of Control",
    "version: 1",
    "purpose: prove_control_of_destination_address",
    `environment: ${fields.domainEnvironment}`,
    `challenge_id: ${fields.challengeId}`,
    `nonce: ${fields.nonce}`,
    `client_id: ${fields.clientId}`,
    `destination_id: ${fields.destinationId}`,
    `chain: ${fields.chain}`,
    `network: ${fields.network}`,
    `address: ${fields.canonicalAddress}`,
    `address_hash: ${fields.addressHash}`,
    `issued_at_utc: ${fields.issuedAtUtc}`,
    `expires_at_utc: ${fields.expiresAtUtc}`,
  ].join("\n");
}

/** Builds the canonical PoC challenge message for the given (persisted/supplied)
 * `messageFormatVersion`. FAILS CLOSED on any version this build does not recognise — Phase 3A
 * supports exactly version 1; a hypothetical stored version 2 row is never rendered through the
 * version-1 builder as a "reasonable default." */
export function buildCanonicalPocMessage(messageFormatVersion: number, fields: CanonicalPocMessageFields): string {
  switch (messageFormatVersion) {
    case POC_MESSAGE_FORMAT_VERSION_1:
      return buildCanonicalPocMessageV1(fields);
    default:
      throw new Error(`WLT-01 PoC message_format_version ${messageFormatVersion} is not supported`);
  }
}

/** `message_hash`: SHA-256 over the EXACT UTF-8 bytes of the canonical message string — never over
 * a JSON/object re-serialization. Lowercase hex, 64 characters, no `0x` prefix (deliberately
 * different from `@aix/foundation`'s own `fingerprint()`, which prepends `sha256:` — this column
 * is a raw hash value, mirroring `provider-receipt.ts`'s own `payload_hash` convention exactly). */
export function computePocMessageHash(canonicalMessage: string): string {
  return createHash("sha256").update(Buffer.from(canonicalMessage, "utf8")).digest("hex");
}

export { resolvePocVerificationScheme };
