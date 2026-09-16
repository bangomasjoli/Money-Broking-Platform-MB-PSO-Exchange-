/**
 * IMP-02 measurement harness — Turn M-A foundation. Secret scanner run over every evidence
 * payload BEFORE it is written (see `evidence-store.ts`'s construct -> scan -> validate -> write
 * sequence). A failed scan must leave no artifact on disk containing the secret, and must never
 * echo the offending value in its own diagnostic output — only a category label.
 *
 * Mirrors, in spirit, IMP-02 Turn C's private-key-marker discipline (no PEM material in
 * evidence/logs/test output) and FND-FIND-010's DATABASE_URL-never-logged discipline — applied
 * here to every measurement evidence write, not only those two prior contexts.
 */

export type SecretScanReasonCode =
  | "PRIVATE_KEY_PEM_MARKER"
  | "CREDENTIAL_URL_PATTERN"
  | "AUTHORIZATION_BEARER_PATTERN"
  | "KNOWN_SECRET_VALUE_MATCH";

export interface SecretScanResult {
  readonly clean: boolean;
  /** Category labels only — never the matched text itself. */
  readonly reasons: readonly SecretScanReasonCode[];
}

// PEM private-key markers: RSA/EC/DSA/generic PKCS#8, and OpenSSH private keys.
const PRIVATE_KEY_PATTERN = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/;

// A URL embedding inline user:password credentials, any scheme — e.g.
// postgres://user:pass@host/db, https://user:pass@host/path. Deliberately scheme-agnostic:
// DATABASE_URL is the concrete concern, but the same shape is dangerous regardless of scheme.
const CREDENTIAL_URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i;

// A literal "Bearer <token-looking-string>" — either as an Authorization header value or as
// free text. Requires a minimum token-body length to avoid false-positiving on short/placeholder
// words while still catching real opaque tokens (which are 43-character base64url in this
// platform, per services/wlt1/src/lib/iam-client.ts's own documented token shape).
const AUTHORIZATION_BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9\-_.~+/]{16,}=*/;

export interface ScanForSecretsInput {
  readonly text: string;
  /** Known live secret values (e.g. the current process's `IAM_INTERNAL_SERVICE_TOKEN` /
   * `IAM_INTROSPECTION_SERVICE_TOKEN`, read by the CALLER from its own environment — this
   * module never reads `process.env` itself, so it can never accidentally widen what it
   * considers "known"). Empty/undefined values are ignored, never treated as a match-everything
   * wildcard. */
  readonly knownSecrets?: readonly (string | undefined)[];
}

/**
 * Scans `text` for secret-shaped content. Returns a clean/reasons summary — NEVER the matched
 * substring, satisfying the "report secret scan failed, not the offending value" requirement by
 * construction (there is no code path in this function that returns matched text).
 */
export function scanForSecrets(input: ScanForSecretsInput): SecretScanResult {
  const { text } = input;
  const reasons: SecretScanReasonCode[] = [];

  if (PRIVATE_KEY_PATTERN.test(text)) {
    reasons.push("PRIVATE_KEY_PEM_MARKER");
  }
  if (CREDENTIAL_URL_PATTERN.test(text)) {
    reasons.push("CREDENTIAL_URL_PATTERN");
  }
  if (AUTHORIZATION_BEARER_PATTERN.test(text)) {
    reasons.push("AUTHORIZATION_BEARER_PATTERN");
  }

  const knownSecrets = (input.knownSecrets ?? []).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  for (const secret of knownSecrets) {
    if (text.includes(secret)) {
      reasons.push("KNOWN_SECRET_VALUE_MATCH");
      break; // one match is enough to fail the scan; no need to enumerate every occurrence
    }
  }

  return { clean: reasons.length === 0, reasons };
}

export class SecretScanFailedError extends Error {
  readonly reasons: readonly SecretScanReasonCode[];
  constructor(reasons: readonly SecretScanReasonCode[]) {
    // Deliberately does NOT include the scanned text or any matched value — only the category
    // labels, per "report secret scan failed, not the offending value".
    super(`secret scan failed (${reasons.join(", ")})`);
    this.name = "SecretScanFailedError";
    this.reasons = reasons;
  }
}

/** Throws `SecretScanFailedError` (reasons only, never the value) if the scan is not clean. */
export function assertNoSecrets(input: ScanForSecretsInput): void {
  const result = scanForSecrets(input);
  if (!result.clean) {
    throw new SecretScanFailedError(result.reasons);
  }
}
