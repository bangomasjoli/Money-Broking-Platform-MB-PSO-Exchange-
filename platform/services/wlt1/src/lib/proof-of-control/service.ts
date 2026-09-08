/**
 * WLT-01 Phase 3A-2 — Proof-of-Control server-owned identifier/nonce generation and the stable
 * read-only "current proof" seam later phases (Phase 4A) will reuse. This file DOES touch the
 * database (unlike `message.ts`/`crypto.ts`, which stay pure) but owns no HTTP/route concerns —
 * `routes/proof-of-control.ts` is the sole caller.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { query, type Sql } from "@aix/foundation";
import { POC_VERIFICATION_SCHEME_EIP191_PERSONAL_SIGN } from "./types.js";

/** Server-generated challenge identifier — NEVER client-chosen, fits `varchar(64)`
 * (`"wlt1poc_" ` is 8 chars + a 36-char UUID = 44, well under the limit). */
export function mintChallengeId(): string {
  return "wlt1poc_" + randomUUID();
}

/** Server-generated CSPRNG nonce: `randomBytes(32)` (32 bytes, never predictable), lowercase-hex
 * encoded to exactly 64 characters — the SAME grammar `message.ts`'s own builder enforces at its
 * boundary. Never accepted from a request body; this is the ONLY production nonce source. */
export function mintNonce(): string {
  return randomBytes(32).toString("hex");
}

/** Phase 3A's own wallet-type applicability rule (distinct from `message.ts`'s chain/network
 * applicability map): PoC is meaningful for a self-custodied wallet, where the destination's own
 * holder can produce a personal-message signature. `'unhosted'` is the clear supported case.
 * `'unknown'` (Phase 1B's own third wallet_type value, meaning "not yet declared/verified as
 * hosted or unhosted") is conservatively treated the SAME as `'unhosted'` — the fail-closed
 * reading is "assume self-custody is POSSIBLE and let cryptographic proof settle it", not "assume
 * it is a custodial/hosted wallet and refuse outright" (the latter would need its own separate,
 * undesigned custodial-attestation workflow this phase does not have). `'hosted'` is the ONLY
 * value this function rejects — a custodial wallet's end-user does not hold the signing key, so a
 * personal-message PoC does not prove what it claims to prove for that wallet type. */
export function isPocSupportedWalletType(walletType: string): boolean {
  return walletType === "unhosted" || walletType === "unknown";
}

interface CurrentVerifiedProofRow {
  challenge_id: string;
  verification_scheme: string;
  chain: string;
  network: string;
  recovered_address: string;
  verified_at_utc: Date;
}

/** Frozen "current proof" semantics (Phase 3 architecture, Part W): returns the current VERIFIED
 * proof only if a `verified` row exists for this destination AND the destination itself is not
 * `revoked` — a revoked destination reports no current proof even though its historical verified
 * evidence row is retained untouched (Part Y: proof evidence is never mutated merely because the
 * destination became revoked). Never re-runs cryptography, never reads/reinterprets a raw
 * signature (none is ever persisted — see migration 053's own header comment). Read-only; no lock
 * needed since nothing here is ever mutated by a concurrent reader. */
export type CurrentProofOfControl =
  | { status: "verified"; challengeId: string; verificationScheme: string; chain: string; network: string; verifiedAddress: string; verifiedAtUtc: string }
  | { status: "none" };

export async function getCurrentProofOfControl(sql: Sql, destinationId: string): Promise<CurrentProofOfControl> {
  const rows = await query<CurrentVerifiedProofRow>(
    sql,
    `SELECT p.challenge_id, p.verification_scheme, p.chain, p.network, p.recovered_address, p.verified_at_utc
       FROM wlt1.proof_of_control p
       JOIN wlt1.destination d ON d.destination_id = p.destination_id
      WHERE p.destination_id = $1 AND p.verification_status = 'verified' AND d.status <> 'revoked'`,
    [destinationId],
  );
  const row = rows[0];
  if (!row) return { status: "none" };
  return {
    status: "verified",
    challengeId: row.challenge_id,
    verificationScheme: row.verification_scheme,
    chain: row.chain,
    network: row.network,
    verifiedAddress: row.recovered_address,
    verifiedAtUtc: row.verified_at_utc.toISOString(),
  };
}

/** Re-exported so route/test code has one canonical import for the frozen scheme literal without
 * reaching into `types.js` directly for this one constant. */
export { POC_VERIFICATION_SCHEME_EIP191_PERSONAL_SIGN };
