/**
 * WLT-01 — Destination Revocation + AML Revocation Signal Ingestion, pure/format-level unit tests
 * (no database). Implements the frozen architecture exactly. DB-touching behaviour (locked reads,
 * transitions, evidence inserts, the routes themselves) is covered by
 * tests/integration/wlt1-destination-revocation-route.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  AML_REASON_CODE,
  buildRevocationAuditMetadata,
  buildRevocationResponse,
  mintRevocationId,
  OPERATOR_REASON_CODES,
  REVOCATION_ID_REGEX,
  REVOKED_STATUS,
  type RevocationEvidenceRow,
} from "../../services/wlt1/src/lib/destination-revocation.js";

function evidence(overrides: Partial<RevocationEvidenceRow> = {}): RevocationEvidenceRow {
  return {
    revocationId: "wlt1rev_11111111-1111-1111-1111-111111111111",
    destinationId: "wlt1dest_1",
    clientId: "clt1client_1",
    source: "operator",
    reasonCode: "compromise",
    reasonDetail: null,
    actorId: "staff_1",
    signalRef: null,
    signalType: null,
    destinationStatusVersionAfter: 2,
    revocationEpochAfter: 1,
    revokedAtUtc: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("mintRevocationId / REVOCATION_ID_REGEX", () => {
  it("mints exactly the wlt1rev_ + UUID shape, 44 characters total", () => {
    const id = mintRevocationId();
    expect(id).toMatch(REVOCATION_ID_REGEX);
    expect(id).toHaveLength(44);
    expect(id.startsWith("wlt1rev_")).toBe(true);
  });

  it("mints a distinct id on every call (never reused/cached)", () => {
    const ids = new Set(Array.from({ length: 50 }, () => mintRevocationId()));
    expect(ids.size).toBe(50);
  });

  it("REVOCATION_ID_REGEX rejects a decision_id/consumption_id-shaped value (wrong prefix) and a too-short/too-long UUID body", () => {
    expect("wlt1dec_11111111-1111-1111-1111-111111111111").not.toMatch(REVOCATION_ID_REGEX);
    expect("wlt1con_11111111-1111-1111-1111-111111111111").not.toMatch(REVOCATION_ID_REGEX);
    expect("wlt1rev_" + "a".repeat(35)).not.toMatch(REVOCATION_ID_REGEX);
    expect("wlt1rev_" + "a".repeat(37)).not.toMatch(REVOCATION_ID_REGEX);
    expect("wlt1rev_" + "A".repeat(36)).not.toMatch(REVOCATION_ID_REGEX); // uppercase hex not permitted
  });
});

describe("REVOKED_STATUS / OPERATOR_REASON_CODES / AML_REASON_CODE — frozen constants", () => {
  it("REVOKED_STATUS is exactly 'revoked'", () => {
    expect(REVOKED_STATUS).toBe("revoked");
  });

  it("OPERATOR_REASON_CODES is exactly the frozen 5-value set, in order, never including aml_risk_signal", () => {
    expect(OPERATOR_REASON_CODES).toEqual(["compromise", "client_request", "beneficiary_change", "operator_security_action", "administrative"]);
    expect(OPERATOR_REASON_CODES).not.toContain("aml_risk_signal");
  });

  it("AML_REASON_CODE is exactly 'aml_risk_signal', never a caller choice", () => {
    expect(AML_REASON_CODE).toBe("aml_risk_signal");
  });
});

describe("buildRevocationResponse — the common 9-key shape", () => {
  it("Case A (operator first revoke): exact 9 keys, evidence-sourced fields populated from the NEW row", () => {
    const ev = evidence();
    const body = buildRevocationResponse({
      outcome: "revoked",
      evidenceRecorded: true,
      evidence: ev,
      destinationId: "wlt1dest_1",
      clientId: "clt1client_1",
      revocationEpoch: 1,
      destinationStatusVersion: 2,
    });
    expect(Object.keys(body).sort()).toEqual(
      ["outcome", "evidence_recorded", "revocation_id", "destination_id", "client_id", "revocation_epoch", "destination_status_version", "revoked_at_utc", "signal_ref"].sort(),
    );
    expect(body).toEqual({
      outcome: "revoked",
      evidence_recorded: true,
      revocation_id: ev.revocationId,
      destination_id: "wlt1dest_1",
      client_id: "clt1client_1",
      revocation_epoch: 1,
      destination_status_version: 2,
      revoked_at_utc: ev.revokedAtUtc.toISOString(),
      signal_ref: null,
    });
  });

  it("Case B (operator already-revoked): evidence null fields — revocation_id/revoked_at_utc/signal_ref all null, evidence_recorded false", () => {
    const body = buildRevocationResponse({
      outcome: "already_revoked",
      evidenceRecorded: false,
      evidence: null,
      destinationId: "wlt1dest_1",
      clientId: "clt1client_1",
      revocationEpoch: 1,
      destinationStatusVersion: 2,
    });
    expect(body).toEqual({
      outcome: "already_revoked",
      evidence_recorded: false,
      revocation_id: null,
      destination_id: "wlt1dest_1",
      client_id: "clt1client_1",
      revocation_epoch: 1,
      destination_status_version: 2,
      revoked_at_utc: null,
      signal_ref: null,
    });
  });

  it("Case C (AML first signal): signal_ref populated from evidence, PostgreSQL-authoritative revoked_at_utc as ISO string", () => {
    const ev = evidence({ source: "aml", reasonCode: "aml_risk_signal", actorId: null, signalRef: "aml1sig_1", signalType: "confirmed_hit" });
    const body = buildRevocationResponse({
      outcome: "revoked",
      evidenceRecorded: true,
      evidence: ev,
      destinationId: "wlt1dest_1",
      clientId: "clt1client_1",
      revocationEpoch: 1,
      destinationStatusVersion: 2,
    });
    expect(body.signal_ref).toBe("aml1sig_1");
    expect(body.revoked_at_utc).toBe("2026-01-01T00:00:00.000Z");
    expect(typeof body.revoked_at_utc).toBe("string");
  });

  it("Case D (AML exact duplicate): outcome already_revoked + evidence_recorded false, but revocation_id/revoked_at_utc/signal_ref are the ORIGINAL evidence's own values (never null)", () => {
    const original = evidence({ source: "aml", reasonCode: "aml_risk_signal", actorId: null, signalRef: "aml1sig_1", signalType: "confirmed_hit" });
    const body = buildRevocationResponse({
      outcome: "already_revoked",
      evidenceRecorded: false,
      evidence: original,
      destinationId: "wlt1dest_1",
      clientId: "clt1client_1",
      revocationEpoch: 1,
      destinationStatusVersion: 2,
    });
    expect(body.evidence_recorded).toBe(false);
    expect(body.revocation_id).toBe(original.revocationId);
    expect(body.revoked_at_utc).toBe(original.revokedAtUtc.toISOString());
    expect(body.signal_ref).toBe("aml1sig_1");
  });

  it("Case E (AML new signal against already-revoked destination): outcome already_revoked + evidence_recorded true, with the NEW row's own identity", () => {
    const newEvidence = evidence({ source: "aml", reasonCode: "aml_risk_signal", actorId: null, signalRef: "aml1sig_2", signalType: "rescreen_overdue", revocationId: "wlt1rev_22222222-2222-2222-2222-222222222222" });
    const body = buildRevocationResponse({
      outcome: "already_revoked",
      evidenceRecorded: true,
      evidence: newEvidence,
      destinationId: "wlt1dest_1",
      clientId: "clt1client_1",
      revocationEpoch: 1,
      destinationStatusVersion: 2,
    });
    expect(body.evidence_recorded).toBe(true);
    expect(body.revocation_id).toBe("wlt1rev_22222222-2222-2222-2222-222222222222");
    expect(body.signal_ref).toBe("aml1sig_2");
  });

  it("every field is sourced from the supplied arguments, never fabricated — destination_id/client_id/versions are exactly the passed-in values", () => {
    const body = buildRevocationResponse({
      outcome: "revoked",
      evidenceRecorded: true,
      evidence: evidence(),
      destinationId: "wlt1dest_ARBITRARY",
      clientId: "clt1client_ARBITRARY",
      revocationEpoch: 99,
      destinationStatusVersion: 42,
    });
    expect(body.destination_id).toBe("wlt1dest_ARBITRARY");
    expect(body.client_id).toBe("clt1client_ARBITRARY");
    expect(body.revocation_epoch).toBe(99);
    expect(body.destination_status_version).toBe(42);
  });
});

describe("buildRevocationAuditMetadata — the frozen 11-key allowlist", () => {
  it("exactly 11 keys, no more, no less", () => {
    const metadata = buildRevocationAuditMetadata({
      destinationId: "wlt1dest_1",
      clientId: "clt1client_1",
      outcome: "revoked",
      source: "operator",
      reasonCode: "compromise",
      reasonDetail: "compromised device",
      actorId: "staff_1",
      signalRef: null,
      evidence: evidence(),
    });
    expect(Object.keys(metadata).sort()).toEqual(
      ["destination_id", "client_id", "outcome", "source", "reason_code", "reason_detail", "actor_id", "signal_ref", "revocation_id", "revoked_at_utc", "evidence_recorded"].sort(),
    );
  });

  it("never includes address/natural_key_hash/token_hash/decision_token/poc_challenge_id/PII-shaped keys", () => {
    const metadata = buildRevocationAuditMetadata({
      destinationId: "wlt1dest_1",
      clientId: "clt1client_1",
      outcome: "revoked",
      source: "operator",
      reasonCode: "compromise",
      reasonDetail: null,
      actorId: "staff_1",
      signalRef: null,
      evidence: evidence(),
    });
    for (const forbiddenKey of ["address", "natural_key_hash", "token_hash", "decision_token", "poc_challenge_id", "internal_service_token"]) {
      expect(Object.keys(metadata)).not.toContain(forbiddenKey);
    }
  });

  it("evidence_recorded is true iff an evidence row was supplied — distinguishes AML exact-duplicate (false) from AML new-signal-against-revoked (true), both outcome=already_revoked", () => {
    const duplicateMeta = buildRevocationAuditMetadata({
      destinationId: "wlt1dest_1",
      clientId: "clt1client_1",
      outcome: "already_revoked",
      source: "aml",
      reasonCode: "aml_risk_signal",
      reasonDetail: null,
      actorId: null,
      signalRef: "aml1sig_1",
      evidence: null,
    });
    const newSignalMeta = buildRevocationAuditMetadata({
      destinationId: "wlt1dest_1",
      clientId: "clt1client_1",
      outcome: "already_revoked",
      source: "aml",
      reasonCode: "aml_risk_signal",
      reasonDetail: null,
      actorId: null,
      signalRef: "aml1sig_2",
      evidence: evidence({ signalRef: "aml1sig_2" }),
    });
    expect(duplicateMeta.evidence_recorded).toBe(false);
    expect(duplicateMeta.revocation_id).toBeNull();
    expect(newSignalMeta.evidence_recorded).toBe(true);
    expect(newSignalMeta.revocation_id).not.toBeNull();
  });

  it("operator source: signal_ref is always null in the metadata regardless of caller input shape", () => {
    const metadata = buildRevocationAuditMetadata({
      destinationId: "wlt1dest_1",
      clientId: "clt1client_1",
      outcome: "revoked",
      source: "operator",
      reasonCode: "compromise",
      reasonDetail: null,
      actorId: "staff_1",
      signalRef: null,
      evidence: evidence(),
    });
    expect(metadata.signal_ref).toBeNull();
  });

  it("AML source: actor_id is always null in the metadata", () => {
    const metadata = buildRevocationAuditMetadata({
      destinationId: "wlt1dest_1",
      clientId: "clt1client_1",
      outcome: "revoked",
      source: "aml",
      reasonCode: "aml_risk_signal",
      reasonDetail: null,
      actorId: null,
      signalRef: "aml1sig_1",
      evidence: evidence({ source: "aml", actorId: null, signalRef: "aml1sig_1" }),
    });
    expect(metadata.actor_id).toBeNull();
  });
});
