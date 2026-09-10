/**
 * WLT-01 Public Client Surface — opaque server-generated keyset-pagination cursor for `GET
 * /wlt1/destinations`. NOT offset pagination (an offset drifts under concurrent inserts and
 * degrades on a large page count; keyset position is stable and index-friendly).
 *
 * Cursor position is `(created_at_utc, destination_id)` — the SAME stable deterministic total
 * order the list route sorts by, so `WHERE (created_at_utc, destination_id) >
 * (:cursor_created_at, :cursor_destination_id)` resumes exactly where the previous page ended,
 * with no duplicates and no gaps even if a same-timestamp tie exists (destination_id is the
 * tie-breaker in both the ORDER BY and the cursor).
 *
 * BOUND TO THE DERIVED CLIENT: the cursor also carries the `client_id` it was minted for. A
 * cursor whose embedded `client_id` does not match the CURRENT request's server-derived
 * `client_id` is treated as malformed (never silently re-scoped to a different client, never used
 * as an oracle to distinguish "wrong client" from "genuinely malformed") — this is a defence-in-
 * depth check only; the actual per-row tenant isolation is always the SQL `client_id = $1`
 * predicate the caller applies independently, never this cursor's own claim.
 *
 * OPAQUE: callers must treat this as an opaque token. It is NOT cryptographically sealed (no
 * HMAC) — nothing in the response depends on trusting the cursor's own claims beyond the
 * client-id equality check above, and the underlying query is always independently
 * client-scoped, so a hand-crafted cursor can influence only wire and reveal nothing.
 */
export interface CursorPosition {
  clientId: string;
  createdAtUtc: string;
  destinationId: string;
}

export function encodeCursor(position: CursorPosition): string {
  const payload = JSON.stringify({ v: 1, client_id: position.clientId, created_at_utc: position.createdAtUtc, destination_id: position.destinationId });
  return Buffer.from(payload, "utf8").toString("base64url");
}

/** Returns `undefined` for ANY malformed/invalid/wrong-client cursor — the caller maps this to a
 * safe validation error, never a silent "start from the beginning" or a client-scope switch. */
export function decodeCursor(raw: string, expectedClientId: string): CursorPosition | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object") return undefined;
  const obj = parsed as Record<string, unknown>;
  if (obj.v !== 1 || typeof obj.client_id !== "string" || typeof obj.created_at_utc !== "string" || typeof obj.destination_id !== "string") {
    return undefined;
  }
  if (obj.client_id !== expectedClientId) return undefined;
  // created_at_utc must itself be a genuine parseable timestamp — a syntactically-valid-JSON but
  // semantically-garbage cursor is still malformed.
  if (Number.isNaN(Date.parse(obj.created_at_utc))) return undefined;
  return { clientId: obj.client_id, createdAtUtc: obj.created_at_utc, destinationId: obj.destination_id };
}
