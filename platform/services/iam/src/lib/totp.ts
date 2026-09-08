/**
 * RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30s step) implemented directly on node:crypto —
 * deliberately NOT a new dependency (task guidance: "prefer no new native deps"; otplib
 * pulls in extra transitive weight this pass does not need for a single, well-specified
 * RFC). Base32 encode/decode is hand-rolled (no external base32 package) since it is ~20
 * lines and RFC 4648 is unambiguous.
 *
 * Code comparison is constant-time (`timingSafeEqual`) to avoid timing side-channels on
 * MFA verification, mirroring the same discipline as the internal-identity guard.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecretBase32(byteLength = 20): string {
  return base32Encode(randomBytes(byteLength));
}

export function base32Encode(buffer: Buffer): string {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  const remainder = bits.length % 5;
  if (remainder !== 0) {
    const chunk = bits.slice(bits.length - remainder).padEnd(5, "0");
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return output;
}

export function base32Decode(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number, digits: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const lastByte = hmac[hmac.length - 1];
  const offset = lastByte === undefined ? 0 : lastByte & 0x0f;
  const b0 = hmac[offset] ?? 0;
  const b1 = hmac[offset + 1] ?? 0;
  const b2 = hmac[offset + 2] ?? 0;
  const b3 = hmac[offset + 3] ?? 0;
  const code = ((b0 & 0x7f) << 24) | ((b1 & 0xff) << 16) | ((b2 & 0xff) << 8) | (b3 & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, "0");
}

export interface TotpOptions {
  digits?: number;
  periodSeconds?: number;
}

export function totpAt(secretBase32: string, timestampMs: number, opts: TotpOptions = {}): string {
  const digits = opts.digits ?? 6;
  const period = opts.periodSeconds ?? 30;
  const counter = Math.floor(timestampMs / 1000 / period);
  return hotp(base32Decode(secretBase32), counter, digits);
}

function constantTimeStringEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface VerifyTotpOptions extends TotpOptions {
  /** Number of 30s steps of clock-skew tolerance either side of "now". Default 1 (±30s). */
  windowSteps?: number;
  /** Override "now" for testing. */
  atMs?: number;
}

/** Verify a caller-submitted code against `secretBase32` within a small clock-drift window. */
export function verifyTotp(secretBase32: string, code: string, opts: VerifyTotpOptions = {}): boolean {
  const digits = opts.digits ?? 6;
  const period = opts.periodSeconds ?? 30;
  const window = opts.windowSteps ?? 1;
  const now = opts.atMs ?? Date.now();
  const trimmed = code.trim();
  if (!/^\d+$/.test(trimmed) || trimmed.length !== digits) return false;
  for (let w = -window; w <= window; w++) {
    const candidate = totpAt(secretBase32, now + w * period * 1000, { digits, periodSeconds: period });
    if (constantTimeStringEquals(candidate, trimmed)) return true;
  }
  return false;
}

/** otpauth:// provisioning URI for authenticator apps (returned once at enrolment). */
export function buildOtpauthUri(input: { secretBase32: string; accountLabel: string; issuer: string }): string {
  const label = encodeURIComponent(`${input.issuer}:${input.accountLabel}`);
  const issuer = encodeURIComponent(input.issuer);
  return `otpauth://totp/${label}?secret=${input.secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
