/**
 * CLT-01 Phase 5 — pure related-party-edge validation logic. No DB access, no HTTP —
 * routes/related-party-edges.ts is the only caller. Kept pure and DB-free so every rule here is
 * unit-testable without a database, same discipline lib/authorised-parties.ts and
 * lib/mandates.ts already established.
 *
 * `from_entity_type`/`to_entity_type` are the blueprint's own exact enum (`client`/`application`/
 * `party`) — `authorised_user`/`client_mandate` are deliberately NOT node types (approved Phase 5
 * design decision; the blueprint's own enum doesn't include them either). `relationship_type` is
 * the blueprint's own exact enum. `status` is the blueprint's own exact 2-value enum
 * (`active`/`inactive`) — no state-machine diagram exists for this table, and the blueprint's own
 * DB design is genuinely this simple.
 *
 * Node EXISTENCE validation (does a `client`/`application`/`party` row with this ID actually
 * exist) requires a DB read and therefore lives in routes/related-party-edges.ts, not here — this
 * file only validates the SHAPE of a proposed edge (self-reference), which needs no DB access.
 */
import { AppError } from "@aix/foundation";
import { Clt1Error } from "./errors.js";

export const RELATED_PARTY_ENTITY_TYPES = ["client", "application", "party"] as const;
export type RelatedPartyEntityType = (typeof RELATED_PARTY_ENTITY_TYPES)[number];

export const RELATIONSHIP_TYPES = ["ubo", "director", "signatory", "shared_identity", "shared_address", "associated_account"] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const RELATED_PARTY_EDGE_STATUSES = ["active", "inactive"] as const;
export type RelatedPartyEdgeStatus = (typeof RELATED_PARTY_EDGE_STATUSES)[number];

export interface RelatedPartyEdgeRow {
  related_party_edge_id: string;
  from_entity_type: RelatedPartyEntityType;
  from_entity_id: string;
  to_entity_type: RelatedPartyEntityType;
  to_entity_id: string;
  relationship_type: RelationshipType;
  status: RelatedPartyEdgeStatus;
  evidence_ref: string | null;
  approval_id: string | null;
  requested_by: string;
  version: number;
  created_at_utc: string;
  updated_at_utc: string;
}

/** Non-PII projection of a related_party_edge row — every column here is an internal ID,
 * enum value, or free-text evidence reference, never a joined PII field like
 * `authorised_party.party_reference` (the caller must never join that in). */
export function safeRelatedPartyEdgeResponse(row: RelatedPartyEdgeRow): Record<string, unknown> {
  return {
    related_party_edge_id: row.related_party_edge_id,
    from_entity_type: row.from_entity_type,
    from_entity_id: row.from_entity_id,
    to_entity_type: row.to_entity_type,
    to_entity_id: row.to_entity_id,
    relationship_type: row.relationship_type,
    status: row.status,
    evidence_ref: row.evidence_ref,
    version: row.version,
    created_at_utc: row.created_at_utc,
    updated_at_utc: row.updated_at_utc,
  };
}

/** Throws the shared foundation VALIDATION_ERROR (not a new CLT-01 code — same discipline
 * lib/mandates.ts's validateMandateRules and lib/authorised-parties.ts's
 * validateOwnershipPercentagePrecision already established) if the proposed edge's `from`/`to`
 * node is identical (same type, same id) — a self-reference. The DB's own CHECK constraint
 * (migration 027) is a backstop; this is the primary, earlier check so a self-reference never
 * reaches a decision-request row at all. */
export function validateNotSelfReference(fromEntityType: RelatedPartyEntityType, fromEntityId: string, toEntityType: RelatedPartyEntityType, toEntityId: string): void {
  if (fromEntityType === toEntityType && fromEntityId === toEntityId) {
    throw new AppError("VALIDATION_ERROR", {
      details: [{ field: "to_entity_id", issue: "from and to must not reference the same entity" }],
    });
  }
}

type EdgeAction = "update" | "remove";

/** Throws CLT1_RELATED_PARTY_EDGE_INVALID_STATE if `currentStatus` does not allow `action`. Both
 * update and remove require the edge to currently be 'active' — there is nothing to update or
 * remove on an already-'inactive' edge (a corrected relationship requires a fresh remove+add, not
 * a transition back to 'active'; no reactivation path exists this phase). */
export function validateRelatedPartyEdgeTransition(currentStatus: RelatedPartyEdgeStatus, action: EdgeAction): void {
  if (currentStatus !== "active") {
    throw new Clt1Error("CLT1_RELATED_PARTY_EDGE_INVALID_STATE", {
      details: [{ field: "status", issue: `cannot perform '${action}' on a related-party edge in status '${currentStatus}'` }],
    });
  }
}

export function relatedPartyEdgeNotFound(): never {
  throw new Clt1Error("CLT1_RELATED_PARTY_EDGE_NOT_FOUND");
}

export function relatedPartyNodeNotFound(): never {
  throw new Clt1Error("CLT1_RELATED_PARTY_NODE_NOT_FOUND");
}
