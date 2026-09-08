/**
 * SEC-01 §08_Audit_Log_Events.md §4 metadata restrictions — never store passwords, MFA codes,
 * refresh/access tokens, private keys, API secrets, full card/bank values, unmasked STR
 * contents, full wallet keys, or plaintext production credentials in audit metadata.
 *
 * CHOSEN POLICY (SEC1-TC-007 allows either "rejected" or "redacted"): REDACT, not reject. The
 * `sec1.audit_event` table's own column is named `metadata_redacted` (05_Database_Design.md
 * §2.1), not `metadata` — the schema itself signals that stored metadata is ALWAYS the
 * redacted form, never a raw pass-through. Redacting (rather than rejecting the whole event)
 * means a source module's otherwise-legitimate event still gets ingested and hash-chained even
 * if it accidentally included a sensitive-looking key — availability of the audit trail is
 * itself a control (§5.3/§5.4: audit must not silently fail to record a sensitive action), so
 * failing the whole ingestion over a redactable metadata key would work against that principle
 * for genuinely sensitive-action events. The redaction happens BEFORE canonicalisation/hashing
 * (lib/canonical.ts) — the hash-chain protects what SEC-01 actually stored, never a raw
 * pre-redaction payload SEC-01 never persists.
 *
 * Matching is on KEY NAME (case-insensitive substring), recursive through nested objects/
 * arrays — a conservative blocklist. This is a metadata SAFETY NET, not a replacement for
 * source modules already following the "no secrets in metadata" discipline
 * (`packages/foundation/src/audit.ts`'s own header comment already tells every caller this).
 */
const SENSITIVE_KEY_FRAGMENTS = [
  "password",
  "passwd",
  "token",
  "secret",
  "otp",
  "mfa_code",
  "mfa_seed",
  "private_key",
  "privatekey",
  "api_key",
  "apikey",
  "card_number",
  "cvv",
  "pin",
  "seed_phrase",
  "credential",
] as const;

const REDACTED_MARKER = "[REDACTED]";

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_FRAGMENTS.some((frag) => lower.includes(frag));
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === "object") return redactMetadata(value as Record<string, unknown>);
  return value;
}

/** Recursively redact any key matching the sensitive-fragment blocklist. Never mutates input. */
export function redactMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!metadata) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    out[key] = isSensitiveKey(key) ? REDACTED_MARKER : redactValue(value);
  }
  return out;
}
