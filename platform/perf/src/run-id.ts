/**
 * IMP-02 measurement harness — Turn M-A foundation. Deterministic-shape, unique run identity
 * binding a manifest, a result, and its raw evidence together.
 *
 * Composition: UTC timestamp (compact ISO, second resolution) + an 8-hex-character random
 * nonce + a short (7-character) commit-SHA fragment. Never a performance signal — the run ID
 * says nothing about what the run measured or how it went, only when/what/which-code it was.
 * Never derived from, or containing, a token, credential, or host secret.
 */
import { randomBytes } from "node:crypto";

const SHORT_SHA_LENGTH = 7;
const NONCE_BYTES = 4;

function compactUtcTimestamp(date: Date): string {
  // e.g. 2026-09-16T16:45:00.123Z -> 20260916T164500Z (second resolution — sub-second precision
  // adds nothing to identity uniqueness once the nonce is present, and only invites confusion
  // with the manifest's own separately-recorded millisecond-precision start time).
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export interface CreateRunIdInput {
  readonly commitSha: string;
  /** Injectable for deterministic tests; defaults to `new Date()`. */
  readonly now?: Date;
  /** Injectable for deterministic tests; defaults to `randomBytes`. Must return an even-length
   * hex string. */
  readonly nonceHex?: () => string;
}

export function createRunId(input: CreateRunIdInput): string {
  if (typeof input.commitSha !== "string" || input.commitSha.length === 0) {
    throw new Error("createRunId: commitSha is required");
  }
  const now = input.now ?? new Date();
  const nonce = input.nonceHex ? input.nonceHex() : randomBytes(NONCE_BYTES).toString("hex");
  if (!/^[0-9a-f]+$/i.test(nonce) || nonce.length === 0) {
    throw new Error("createRunId: nonceHex must produce a non-empty hex string");
  }
  const shortSha = input.commitSha.slice(0, SHORT_SHA_LENGTH);
  return `run-${compactUtcTimestamp(now)}-${nonce}-${shortSha}`;
}

/** Structural validity check — used by tests and by any consumer that receives a run ID from an
 * external source (e.g. read back from an evidence file name) and wants to confirm shape before
 * trusting it as a path component. */
const RUN_ID_PATTERN = /^run-\d{8}T\d{6}Z-[0-9a-f]+-[0-9a-f]+$/i;

export function isValidRunId(value: string): boolean {
  return RUN_ID_PATTERN.test(value);
}
