/**
 * CLT-01 Phase 3 — pure client-mandate state/rules-validation logic. No DB access, no HTTP —
 * routes/mandates.ts is the only caller. Kept pure and DB-free so every rule here is
 * unit-testable without a database, same discipline lib/authorised-users.ts and lib/outcomes.ts
 * already established.
 *
 * `mandate_type`/`status` are the blueprint's own real enums (`05_Database_Design.md` §2.5).
 * `status` has no `pending`/`draft`/`approval_required` value: mirroring `client_profile`, a row
 * is only ever inserted directly at `status='active'` by `create/apply` — the blueprint's Mandate
 * State diagram's `draft -> approval_required` prefix is realised entirely by
 * `client_mandate_decision_request`'s own `requested -> applied` lifecycle, not by a
 * half-approved row in the real table.
 *
 * `MandateRulesSchema` is the single source of truth for the six allowed `rules` keys — no
 * arbitrary/open-ended JSON. No IAM-02 mandate-schema contract exists to validate against
 * (direct inspection of the accepted IAM-02 implementation confirms no policy/schema concept at
 * all) — this schema is CLT-01's own local contract, not derived from or bound to anything IAM-02
 * exposes.
 */
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { AppError } from "@aix/foundation";
import { Clt1Error } from "./errors.js";

export const MANDATE_TYPES = ["standard", "custom", "institutional"] as const;
export type MandateType = (typeof MANDATE_TYPES)[number];

export const MANDATE_STATUSES = ["active", "inactive", "expired", "revoked"] as const;
export type MandateStatus = (typeof MANDATE_STATUSES)[number];

export const MANDATE_ACTION_TYPES = [
  "wallet_registration",
  "deposit_instruction",
  "withdrawal_request",
  "trade_request",
  "settlement_instruction",
  "client_data_amendment",
] as const;
export type MandateActionType = (typeof MANDATE_ACTION_TYPES)[number];

/**
 * The six allowed keys — additionalProperties:false rejects anything else. Exported so
 * routes/mandates.ts embeds the SAME schema in its TypeBox request-body validation (Fastify/AJV
 * enforcement at the HTTP boundary) rather than a hand-copied duplicate.
 */
export const MandateRulesSchema = Type.Object(
  {
    max_transaction_amount: Type.Optional(Type.Number({ minimum: 0 })),
    max_daily_amount: Type.Optional(Type.Number({ minimum: 0 })),
    currency: Type.Optional(Type.String({ minLength: 3, maxLength: 3 })),
    requires_dual_signature: Type.Optional(Type.Boolean()),
    approved_action_types: Type.Optional(Type.Array(Type.Union(MANDATE_ACTION_TYPES.map((t) => Type.Literal(t))))),
  },
  { additionalProperties: false },
);
export type MandateRules = Static<typeof MandateRulesSchema>;

/** Throws the shared foundation `VALIDATION_ERROR` (not a new CLT-01 code — same code Fastify's
 * own TypeBox/AJV body-schema rejection would produce for identical malformed input) if `rules`
 * contains an unknown key or a wrong-shaped value. Defense-in-depth: routes/mandates.ts's own
 * TypeBox body schema already rejects this at the HTTP boundary — this pure function exists so
 * the same rule is directly unit-testable without spinning up Fastify, and so it can be
 * re-applied to a stored decision-request snapshot at apply time without re-deriving a schema. */
export function validateMandateRules(rules: unknown): void {
  if (!Value.Check(MandateRulesSchema, rules)) {
    const firstError = Value.Errors(MandateRulesSchema, rules).First();
    throw new AppError("VALIDATION_ERROR", {
      details: firstError ? [{ field: firstError.path || "rules", issue: firstError.message }] : [],
    });
  }
}

export interface ClientMandateRow {
  mandate_id: string;
  client_id: string;
  mandate_type: MandateType;
  rules: MandateRules;
  mandate_schema_version: string;
  iam2_dual_auth_policy_ref: string | null;
  status: MandateStatus;
  effective_from_utc: string | null;
  expires_at_utc: string | null;
  approval_id: string | null;
  requested_by: string;
  version: number;
  created_at_utc: string;
  updated_at_utc: string;
}

/** Non-PII projection of a client_mandate row. `rules` IS returned — business configuration
 * (thresholds/currency/action-types), not personal data (approved Phase 3 design decision). */
export function safeMandateResponse(row: ClientMandateRow): Record<string, unknown> {
  return {
    mandate_id: row.mandate_id,
    client_id: row.client_id,
    mandate_type: row.mandate_type,
    rules: row.rules,
    mandate_schema_version: row.mandate_schema_version,
    status: row.status,
    effective_from_utc: row.effective_from_utc,
    expires_at_utc: row.expires_at_utc,
    version: row.version,
    created_at_utc: row.created_at_utc,
    updated_at_utc: row.updated_at_utc,
  };
}

export function mandateNotFound(): never {
  throw new Clt1Error("CLT1_MANDATE_NOT_FOUND");
}
