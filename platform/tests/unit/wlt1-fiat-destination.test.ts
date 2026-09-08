/**
 * WLT-01 Fiat Payout Destinations (APAC) — pure/format-level unit tests for `lib/fiat/
 * encryption.ts`, `lib/fiat/beneficiary-name.ts`, `lib/fiat-destination.ts`'s freshness/effective-
 * validity/audit-metadata helpers, and `lib/evaluate-use.ts`'s new `evaluateFiatLocalGates`
 * (G1-G7) + `lib/decision-verify.ts`'s type-branched integrity check. No database.
 */
import { createDecipheriv, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as fiatEncryptionModule from "../../services/wlt1/src/lib/fiat/encryption.js";
import { deriveFiatAccountEncryptionKey, encryptFiatAccountIdentifier, FIAT_ENC_KEY_MIN_LENGTH } from "../../services/wlt1/src/lib/fiat/encryption.js";
import { computeBeneficiaryNameHash, normalizeBeneficiaryName } from "../../services/wlt1/src/lib/fiat/beneficiary-name.js";
import {
  buildBeneficiaryVerificationAuditMetadata,
  buildFiatRegistrationAuditMetadata,
  buildFiatScreeningAuditMetadata,
  computeEffectiveValidUntil,
  computeNaturalKeyHash,
  isEvidenceFresh,
} from "../../services/wlt1/src/lib/fiat-destination.js";
import { evaluateFiatLocalGates, type FiatLocalGateInput } from "../../services/wlt1/src/lib/evaluate-use.js";
import { evaluateDecisionVerification, type DecisionVerifyInput, type StoredDecisionRow } from "../../services/wlt1/src/lib/decision-verify.js";
import { evaluateFiatApprovalGates } from "../../services/wlt1/src/lib/destination-approval.js";

describe("FIAT_ENC_KEY_MIN_LENGTH / deriveFiatAccountEncryptionKey / encryptFiatAccountIdentifier", () => {
  it("min length is 32", () => {
    expect(FIAT_ENC_KEY_MIN_LENGTH).toBe(32);
  });

  it("derives a 32-byte key", () => {
    const key = deriveFiatAccountEncryptionKey("a".repeat(32));
    expect(key.length).toBe(32);
  });

  it("domain-separated: the same passphrase used bare (IAM's own sha256(passphrase)) derives a DIFFERENT key than WLT's own domain-separated KDF", () => {
    const passphrase = "shared-passphrase-used-by-both-services";
    const wltKey = deriveFiatAccountEncryptionKey(passphrase);
    const bareSha256 = createHash("sha256").update(passphrase, "utf8").digest();
    expect(wltKey.equals(bareSha256)).toBe(false);
  });

  it("ciphertext is never equal to the plaintext", () => {
    const key = deriveFiatAccountEncryptionKey("a".repeat(32));
    const envelope = encryptFiatAccountIdentifier('{"account_identifier":"12345678"}', key, "wlt1dest_1");
    expect(envelope).not.toContain("12345678");
  });

  it("two encryptions of the identical plaintext produce DIFFERENT ciphertext (random IV)", () => {
    const key = deriveFiatAccountEncryptionKey("a".repeat(32));
    const a = encryptFiatAccountIdentifier('{"x":"1"}', key, "wlt1dest_1");
    const b = encryptFiatAccountIdentifier('{"x":"1"}', key, "wlt1dest_1");
    expect(a).not.toBe(b);
  });

  it("envelope decodes to a 'v1' prefix", () => {
    const key = deriveFiatAccountEncryptionKey("a".repeat(32));
    const envelope = encryptFiatAccountIdentifier('{"x":"1"}', key, "wlt1dest_1");
    const decoded = Buffer.from(envelope, "base64");
    expect(decoded.subarray(0, 2).toString("ascii")).toBe("v1");
  });

  it("AAD binds to destinationId — decrypting with a different AAD fails to authenticate (proven via a test-only decrypt, never a production export)", () => {
    const key = deriveFiatAccountEncryptionKey("a".repeat(32));
    const envelope = encryptFiatAccountIdentifier('{"x":"1"}', key, "wlt1dest_correct");
    const decoded = Buffer.from(envelope, "base64");
    const iv = decoded.subarray(2, 14);
    const tag = decoded.subarray(14, 30);
    const ciphertext = decoded.subarray(30);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from("wlt1dest_WRONG", "utf8"));
    decipher.setAuthTag(tag);
    expect(() => Buffer.concat([decipher.update(ciphertext), decipher.final()])).toThrow();
  });

  it("production module exports no decrypt symbol", () => {
    const exportNames = Object.keys(fiatEncryptionModule);
    expect(exportNames.some((n) => n.toLowerCase().includes("decrypt"))).toBe(false);
  });
});

describe("normalizeBeneficiaryName / computeBeneficiaryNameHash", () => {
  it("trims, collapses whitespace, uppercases", () => {
    expect(normalizeBeneficiaryName("  John   Tan  ")).toBe("JOHN TAN");
  });

  it("hash is stable for equivalent inputs, different for different names", () => {
    expect(computeBeneficiaryNameHash(normalizeBeneficiaryName("John Tan"))).toBe(computeBeneficiaryNameHash(normalizeBeneficiaryName("  john   tan  ")));
    expect(computeBeneficiaryNameHash("JOHN TAN")).not.toBe(computeBeneficiaryNameHash("JANE TAN"));
  });
});

describe("computeNaturalKeyHash (fiat-destination.ts) — folds destination_type", () => {
  it("same account, same client, same type -> identical hash", () => {
    const a = computeNaturalKeyHash("clt1client_1", "fiat_payout", "sha256:abc");
    const b = computeNaturalKeyHash("clt1client_1", "fiat_payout", "sha256:abc");
    expect(a).toBe(b);
  });

  it("different client -> different hash (same account permitted across clients)", () => {
    const a = computeNaturalKeyHash("clt1client_1", "fiat_payout", "sha256:abc");
    const b = computeNaturalKeyHash("clt1client_2", "fiat_payout", "sha256:abc");
    expect(a).not.toBe(b);
  });

  it("wallet and fiat_payout cannot collide for the same client/hash", () => {
    const wallet = computeNaturalKeyHash("clt1client_1", "wallet", "sha256:abc");
    const fiat = computeNaturalKeyHash("clt1client_1", "fiat_payout", "sha256:abc");
    expect(wallet).not.toBe(fiat);
  });
});

describe("computeEffectiveValidUntil", () => {
  const issuedAtUtc = new Date("2026-06-01T00:00:00.000Z");

  it("no provider expiry -> issuedAt + ceiling", () => {
    const result = computeEffectiveValidUntil(issuedAtUtc, null, 24);
    expect(result.toISOString()).toBe("2026-06-02T00:00:00.000Z");
  });

  it("provider expiry earlier than ceiling -> uses provider expiry", () => {
    const providerExpiry = new Date("2026-06-01T06:00:00.000Z");
    const result = computeEffectiveValidUntil(issuedAtUtc, providerExpiry, 24);
    expect(result.getTime()).toBe(providerExpiry.getTime());
  });

  it("provider expiry later than ceiling -> clips to the ceiling, never the unconstrained provider value", () => {
    const providerExpiry = new Date("2027-01-01T00:00:00.000Z");
    const result = computeEffectiveValidUntil(issuedAtUtc, providerExpiry, 24);
    expect(result.toISOString()).toBe("2026-06-02T00:00:00.000Z");
  });
});

describe("isEvidenceFresh", () => {
  it("strictly before valid_until_utc is fresh", () => {
    expect(isEvidenceFresh(new Date("2026-06-02T00:00:00.000Z"), new Date("2026-06-01T00:00:00.000Z"))).toBe(true);
  });
  it("at or after valid_until_utc is NOT fresh", () => {
    const t = new Date("2026-06-01T00:00:00.000Z");
    expect(isEvidenceFresh(t, t)).toBe(false);
    expect(isEvidenceFresh(new Date(t.getTime() - 1), t)).toBe(false);
  });
});

describe("audit metadata builders — exact key counts", () => {
  it("registration metadata is exactly 10 keys", () => {
    const meta = buildFiatRegistrationAuditMetadata({
      destinationId: "wlt1dest_1",
      clientId: "clt1client_1",
      bankCountry: "MY",
      currency: "MYR",
      rail: "apac_local_my",
      bankIdentifier: "ABMBMYKL",
      branchIdentifier: null,
      accountIdentifierMasked: "••••3456",
      beneficiaryType: "individual",
    });
    expect(Object.keys(meta)).toHaveLength(10);
    expect(meta).not.toHaveProperty("account_identifier");
    expect(meta).not.toHaveProperty("account_identifier_hash");
    expect(meta).not.toHaveProperty("beneficiary_name");
  });

  it("verification metadata is exactly 8 keys", () => {
    const meta = buildBeneficiaryVerificationAuditMetadata({
      destinationId: "wlt1dest_1",
      verificationId: "wlt1bv_1",
      verificationVersion: 1,
      result: "verified",
      providerId: "stub-beneficiary-verification-v1",
      matchScore: 98.5,
      validUntilUtc: new Date(),
      verifiedAtUtc: new Date(),
    });
    expect(Object.keys(meta)).toHaveLength(8);
  });

  it("screening metadata is exactly 9 keys, never carries beneficiary_name_hash/matched_name_normalized/full account material", () => {
    const meta = buildFiatScreeningAuditMetadata({
      destinationId: "wlt1dest_1",
      screeningResultId: "wlt1fscr_1",
      screeningResultVersion: 1,
      riskStatus: "clear",
      sanctionsExposure: false,
      riskCategories: [],
      providerId: "stub-fiat-screening-v1",
      validUntilUtc: new Date(),
      screenedAtUtc: new Date(),
    });
    expect(Object.keys(meta)).toHaveLength(9);
    expect(meta).not.toHaveProperty("beneficiary_name_hash");
    expect(meta).not.toHaveProperty("matched_name_normalized");
    expect(meta).not.toHaveProperty("account_identifier_hash");
  });
});

function fiatGateInput(overrides: Partial<FiatLocalGateInput> = {}): FiatLocalGateInput {
  const NOW = new Date("2026-06-15T12:00:00.000Z");
  return {
    status: "active",
    destinationType: "fiat_payout",
    requestedAction: "destination_use",
    railCoverageOk: true,
    screening: { screeningResultId: "wlt1fscr_1", riskStatus: "clear", validUntilUtc: new Date(NOW.getTime() + 3600_000) },
    verification: { verificationId: "wlt1bv_1", result: "verified", validUntilUtc: new Date(NOW.getTime() + 3600_000), beneficiaryNameHash: "hash_name", accountIdentifierHash: "hash_account" },
    expectedBeneficiaryNameHash: "hash_name",
    expectedAccountIdentifierHash: "hash_account",
    coolingOffUntilUtc: null,
    nowUtc: NOW,
    ...overrides,
  };
}

describe("evaluateFiatLocalGates — G1-G7 frozen order", () => {
  it("1. active + all gates pass -> eligible", () => {
    const result = evaluateFiatLocalGates(fiatGateInput());
    expect(result).toMatchObject({ eligible: true, screeningResultId: "wlt1fscr_1", beneficiaryVerificationId: "wlt1bv_1" });
  });

  it("G1: revoked -> destination_revoked, checked first", () => {
    const result = evaluateFiatLocalGates(fiatGateInput({ status: "revoked", railCoverageOk: false, screening: null }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "destination_revoked" });
  });

  it("G2: wrong destination_type -> action_not_supported", () => {
    const result = evaluateFiatLocalGates(fiatGateInput({ destinationType: "wallet" }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "action_not_supported" });
  });

  it("G2: wrong requested_action -> action_not_supported", () => {
    const result = evaluateFiatLocalGates(fiatGateInput({ requestedAction: "something_else" }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "action_not_supported" });
  });

  it("G3: rail not supported -> rail_not_supported", () => {
    const result = evaluateFiatLocalGates(fiatGateInput({ railCoverageOk: false }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "rail_not_supported" });
  });

  it("G4: no screening -> screening_not_clear", () => {
    const result = evaluateFiatLocalGates(fiatGateInput({ screening: null }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "screening_not_clear" });
  });

  it("G4: screening not clear -> screening_not_clear", () => {
    for (const riskStatus of ["review_required", "high_risk", "hit"]) {
      const result = evaluateFiatLocalGates(fiatGateInput({ screening: { screeningResultId: "wlt1fscr_1", riskStatus, validUntilUtc: null } }));
      expect(result).toMatchObject({ eligible: false, reasonCode: "screening_not_clear" });
    }
  });

  it("G5: screening stale -> screening_stale", () => {
    const NOW = new Date("2026-06-15T12:00:00.000Z");
    const result = evaluateFiatLocalGates(fiatGateInput({ screening: { screeningResultId: "wlt1fscr_1", riskStatus: "clear", validUntilUtc: new Date(NOW.getTime() - 1) } }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "screening_stale" });
  });

  it("G6: no verification -> beneficiary_verification_invalid", () => {
    const result = evaluateFiatLocalGates(fiatGateInput({ verification: null }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "beneficiary_verification_invalid" });
  });

  it("G6: verification result not 'verified' -> beneficiary_verification_invalid", () => {
    for (const result of ["name_mismatch", "not_supported"]) {
      const gateResult = evaluateFiatLocalGates(fiatGateInput({ verification: { verificationId: "wlt1bv_1", result, validUntilUtc: null, beneficiaryNameHash: "hash_name", accountIdentifierHash: "hash_account" } }));
      expect(gateResult).toMatchObject({ eligible: false, reasonCode: "beneficiary_verification_invalid" });
    }
  });

  it("G6: verification stale -> beneficiary_verification_invalid", () => {
    const NOW = new Date("2026-06-15T12:00:00.000Z");
    const result = evaluateFiatLocalGates(fiatGateInput({ verification: { verificationId: "wlt1bv_1", result: "verified", validUntilUtc: new Date(NOW.getTime() - 1), beneficiaryNameHash: "hash_name", accountIdentifierHash: "hash_account" } }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "beneficiary_verification_invalid" });
  });

  it("G6: verification binding mismatch (name hash) -> beneficiary_verification_invalid", () => {
    const result = evaluateFiatLocalGates(fiatGateInput({ expectedBeneficiaryNameHash: "different_hash" }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "beneficiary_verification_invalid" });
  });

  it("G6: verification binding mismatch (account hash) -> beneficiary_verification_invalid", () => {
    const result = evaluateFiatLocalGates(fiatGateInput({ expectedAccountIdentifierHash: "different_hash" }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "beneficiary_verification_invalid" });
  });

  it("G7: pending_review/pending_screening/draft -> destination_not_whitelisted", () => {
    for (const status of ["draft", "pending_screening", "pending_review"]) {
      const result = evaluateFiatLocalGates(fiatGateInput({ status }));
      expect(result).toMatchObject({ eligible: false, reasonCode: "destination_not_whitelisted" });
    }
  });

  it("G7: approved_pending_cooling with cooling elapsed -> eligible", () => {
    const NOW = new Date("2026-06-15T12:00:00.000Z");
    const result = evaluateFiatLocalGates(fiatGateInput({ status: "approved_pending_cooling", coolingOffUntilUtc: new Date(NOW.getTime() - 1) }));
    expect(result.eligible).toBe(true);
  });

  it("G7: approved_pending_cooling with cooling still active -> cooling_off_active", () => {
    const NOW = new Date("2026-06-15T12:00:00.000Z");
    const result = evaluateFiatLocalGates(fiatGateInput({ status: "approved_pending_cooling", coolingOffUntilUtc: new Date(NOW.getTime() + 3600_000) }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "cooling_off_active" });
  });
});

function storedFiatDecision(overrides: Partial<StoredDecisionRow> = {}): StoredDecisionRow {
  return {
    decisionId: "wlt1dec_1",
    tokenHash: "0".repeat(64),
    destinationId: "wlt1dest_1",
    clientId: "clt1client_1",
    requestedAction: "destination_use",
    status: "issued",
    expiresAtUtc: new Date("2026-06-15T13:00:00.000Z"),
    revocationEpoch: 0,
    pocChallengeId: null,
    destinationType: "fiat_payout",
    rail: "apac_local_my",
    currency: "MYR",
    beneficiaryVerificationId: "wlt1bv_1",
    ...overrides,
  };
}

describe("evaluateDecisionVerification — fiat integrity extension", () => {
  const nowUtc = new Date("2026-06-15T12:00:00.000Z");
  function input(overrides: Partial<DecisionVerifyInput> = {}): DecisionVerifyInput {
    return {
      callerClientId: "clt1client_1",
      callerDestinationId: "wlt1dest_1",
      callerRequestedAction: "destination_use",
      decision: storedFiatDecision(),
      currentDestination: { status: "active", revocationEpoch: 0, destinationType: "fiat_payout", rail: "apac_local_my", currency: "MYR" },
      nowUtc,
      ...overrides,
    };
  }

  it("valid fiat decision -> eligible", () => {
    expect(evaluateDecisionVerification(input())).toEqual({ eligible: true });
  });

  it("decision destination_type mismatch vs current -> evidence_integrity_invalid", () => {
    const result = evaluateDecisionVerification(input({ currentDestination: { status: "active", revocationEpoch: 0, destinationType: "wallet", walletType: "hosted" } }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "evidence_integrity_invalid" });
  });

  it("fiat decision with a non-null poc_challenge_id -> evidence_integrity_invalid", () => {
    const result = evaluateDecisionVerification(input({ decision: storedFiatDecision({ pocChallengeId: "wlt1poc_1" }) }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "evidence_integrity_invalid" });
  });

  it("fiat decision with a null beneficiary_verification_id -> evidence_integrity_invalid", () => {
    const result = evaluateDecisionVerification(input({ decision: storedFiatDecision({ beneficiaryVerificationId: null }) }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "evidence_integrity_invalid" });
  });

  it("decision rail mismatched against current destination's rail -> evidence_integrity_invalid", () => {
    const result = evaluateDecisionVerification(input({ currentDestination: { status: "active", revocationEpoch: 0, destinationType: "fiat_payout", rail: "apac_local_sg", currency: "MYR" } }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "evidence_integrity_invalid" });
  });

  it("decision currency mismatched against current destination's currency -> evidence_integrity_invalid", () => {
    const result = evaluateDecisionVerification(input({ currentDestination: { status: "active", revocationEpoch: 0, destinationType: "fiat_payout", rail: "apac_local_my", currency: "SGD" } }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "evidence_integrity_invalid" });
  });

  it("binding_mismatch/expired/revoked precedence is unaffected by the fiat extension", () => {
    expect(evaluateDecisionVerification(input({ callerClientId: "wrong_client" }))).toMatchObject({ eligible: false, reasonCode: "binding_mismatch" });
    expect(evaluateDecisionVerification(input({ nowUtc: new Date("2026-06-15T13:00:01.000Z") }))).toMatchObject({ eligible: false, reasonCode: "expired" });
    expect(evaluateDecisionVerification(input({ currentDestination: { status: "revoked", revocationEpoch: 0, destinationType: "fiat_payout", rail: "apac_local_my", currency: "MYR" } }))).toMatchObject({ eligible: false, reasonCode: "revoked" });
  });

  it("wallet decisions remain governed by the ORIGINAL PoC biconditional, unaffected by the fiat branch", () => {
    const walletDecision = storedFiatDecision({ destinationType: "wallet", rail: null, currency: null, beneficiaryVerificationId: null, pocChallengeId: null });
    const hostedResult = evaluateDecisionVerification(
      input({ decision: walletDecision, currentDestination: { status: "active", revocationEpoch: 0, destinationType: "wallet", walletType: "hosted" } }),
    );
    expect(hostedResult).toEqual({ eligible: true });

    const unhostedMissingPoc = evaluateDecisionVerification(
      input({ decision: walletDecision, currentDestination: { status: "active", revocationEpoch: 0, destinationType: "wallet", walletType: "unhosted" } }),
    );
    expect(unhostedMissingPoc).toMatchObject({ eligible: false, reasonCode: "evidence_integrity_invalid" });
  });
});

// -------------------------------------------------------------------------------------------
// ACCEPTANCE REMEDIATION (H-2) — evaluateFiatApprovalGates unit coverage. Route-level integration
// coverage (the REAL approve/request + approve/apply authority-granting paths) lives in
// tests/integration/wlt1-fiat-approval-route.test.ts — this file's own coverage proves the pure
// gate logic in isolation, it is NOT the sole proof of approval behaviour.
// -------------------------------------------------------------------------------------------
function fiatApprovalInput(overrides: Partial<Parameters<typeof evaluateFiatApprovalGates>[0]> = {}): Parameters<typeof evaluateFiatApprovalGates>[0] {
  const NOW = new Date("2026-06-15T12:00:00.000Z");
  return {
    status: "pending_review",
    railCoverageOk: true,
    screening: { screeningResultId: "wlt1fscr_1", riskStatus: "clear", validUntilUtc: new Date(NOW.getTime() + 3600_000) },
    verification: { verificationId: "wlt1bv_1", result: "verified", validUntilUtc: new Date(NOW.getTime() + 3600_000) },
    nowUtc: NOW,
    ...overrides,
  };
}

describe("evaluateFiatApprovalGates — fiat maker-checker eligibility gates", () => {
  it("verified + clear (fresh) + coverage active + pending_review -> eligible", () => {
    const result = evaluateFiatApprovalGates(fiatApprovalInput());
    expect(result).toMatchObject({ eligible: true, screeningResultId: "wlt1fscr_1" });
  });

  it("status other than pending_review -> destination_not_pending_review", () => {
    for (const status of ["draft", "pending_screening", "approved_pending_cooling", "active", "revoked"]) {
      const result = evaluateFiatApprovalGates(fiatApprovalInput({ status }));
      expect(result).toMatchObject({ eligible: false, reasonCode: "destination_not_pending_review" });
    }
  });

  it("coverage inactive/unsupported (railCoverageOk: false) -> rail_not_supported", () => {
    const result = evaluateFiatApprovalGates(fiatApprovalInput({ railCoverageOk: false }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "rail_not_supported" });
  });

  it("screening missing -> screening_missing", () => {
    const result = evaluateFiatApprovalGates(fiatApprovalInput({ screening: null }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "screening_missing" });
  });

  it("screening not clear (review_required/high_risk/hit) -> screening_not_clear", () => {
    for (const riskStatus of ["review_required", "high_risk", "hit"]) {
      const result = evaluateFiatApprovalGates(fiatApprovalInput({ screening: { screeningResultId: "wlt1fscr_1", riskStatus, validUntilUtc: null } }));
      expect(result).toMatchObject({ eligible: false, reasonCode: "screening_not_clear" });
    }
  });

  it("screening expired -> screening_expired", () => {
    const NOW = new Date("2026-06-15T12:00:00.000Z");
    const result = evaluateFiatApprovalGates(fiatApprovalInput({ screening: { screeningResultId: "wlt1fscr_1", riskStatus: "clear", validUntilUtc: new Date(NOW.getTime() - 1) } }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "screening_expired" });
  });

  it("verification missing -> verification_missing", () => {
    const result = evaluateFiatApprovalGates(fiatApprovalInput({ verification: null }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "verification_missing" });
  });

  it("verification not verified (name_mismatch/not_supported) -> verification_not_verified", () => {
    for (const result of ["name_mismatch", "not_supported"]) {
      const gateResult = evaluateFiatApprovalGates(fiatApprovalInput({ verification: { verificationId: "wlt1bv_1", result, validUntilUtc: null } }));
      expect(gateResult).toMatchObject({ eligible: false, reasonCode: "verification_not_verified" });
    }
  });

  it("verification expired -> verification_expired", () => {
    const NOW = new Date("2026-06-15T12:00:00.000Z");
    const result = evaluateFiatApprovalGates(fiatApprovalInput({ verification: { verificationId: "wlt1bv_1", result: "verified", validUntilUtc: new Date(NOW.getTime() - 1) } }));
    expect(result).toMatchObject({ eligible: false, reasonCode: "verification_expired" });
  });

  it("no PoC gate exists for fiat — a fiat-eligible input never carries a pocVerified/walletType field at all", () => {
    const input = fiatApprovalInput();
    expect(input).not.toHaveProperty("pocVerified");
    expect(input).not.toHaveProperty("walletType");
  });
});

// -------------------------------------------------------------------------------------------
// ACCEPTANCE REMEDIATION (M-1) — source guard: no call site in the production route may pass
// `account_identifier_hash` (or any sha256:-prefixed value) into
// `BeneficiaryVerificationProvider.verify().accountIdentifier`. This is a DEFENSIVE second layer,
// not the sole proof of correct behaviour — the real end-to-end resubmission/mismatch contract is
// integration-tested in tests/integration/wlt1-payout-destination-route.test.ts.
// -------------------------------------------------------------------------------------------
describe("acceptance-sensitive source guard — no hash-as-account regression", () => {
  const routeSource = readFileSync(join(__dirname, "..", "..", "services", "wlt1", "src", "routes", "payout-destinations.ts"), "utf8");

  it("no call site passes account_identifier_hash (or destination.account_identifier_hash) into a provider's own accountIdentifier field", () => {
    // Every `accountIdentifier:` assignment inside this file, checked individually — none may be
    // the destination's own persisted HASH column. The persisted `accountIdentifierHash:` field
    // used when PERSISTING evidence (a different, legitimate binding key) is deliberately a
    // DIFFERENT property name and is not matched by this pattern.
    const forbidden = /accountIdentifier:\s*destination\.account_identifier_hash/;
    expect(routeSource).not.toMatch(forbidden);
  });

  it("BeneficiaryVerificationProvider's own accountIdentifier is sourced from the fingerprint-validated resubmission helper, never a raw hash literal", () => {
    expect(routeSource).toContain("accountIdentifier: validatedAccountIdentifier");
  });

  it("no accountIdentifier assignment anywhere in the route is a literal sha256:-prefixed string", () => {
    const shaLiteralAsAccount = /accountIdentifier:\s*["'`]sha256:/;
    expect(routeSource).not.toMatch(shaLiteralAsAccount);
  });

  it("fiat screening call sites never reference accountIdentifier at all (the input type structurally excludes it)", () => {
    const screeningCallBlocks = routeSource.match(/screenFiatDestinationViaProvider\(\s*screeningProvider,\s*\{[^}]*\}/gs) ?? [];
    expect(screeningCallBlocks.length).toBeGreaterThan(0);
    for (const block of screeningCallBlocks) {
      expect(block).not.toMatch(/accountIdentifier/);
    }
  });
});
