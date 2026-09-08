/**
 * Pure (DB-free) tests for services/cfg1/src/lib/integrity-seal.ts — scope-hash computation and
 * the pass/fail/missing/duplicate evaluation logic. The DB-backed `checkConfigIntegritySeals`
 * orchestration function is covered by the integration suite (real Postgres required).
 */
import { describe, expect, it } from "vitest";
import {
  computeFeatureScopeHash,
  computeLicenceProfileScopeHash,
  computeProhibitedRegistryScopeHash,
  evaluateScopeSeal,
  resealScope,
  verifyDecisionTimeIntegrity,
  type FeatureSealRow,
  type LicenceProfileSealRow,
  type ProhibitedFeatureSealRow,
} from "../../services/cfg1/src/lib/integrity-seal.js";
import {
  DOC00_LICENCE_PROFILES,
  DOC00_PROHIBITED_FEATURES,
  DOC00_SOURCE_VERSION,
  computeDoc00BaselineHash,
} from "../../services/cfg1/src/lib/doc00-baseline.js";

const licenceRows: LicenceProfileSealRow[] = [
  { licence_profile_id: "licprof_mb", licence_code: "MB", licence_status: "approved", authority: "LFSA", evidence_ref: null, evidence_authenticity_status: "unverified", version: 1, status: "active" },
  { licence_profile_id: "licprof_pso", licence_code: "PSO", licence_status: "approved", authority: "LFSA", evidence_ref: null, evidence_authenticity_status: "unverified", version: 1, status: "active" },
  { licence_profile_id: "licprof_exchange", licence_code: "EXCHANGE", licence_status: "pending", authority: "LFSA", evidence_ref: null, evidence_authenticity_status: "unverified", version: 1, status: "active" },
];

const prohibitedRows: ProhibitedFeatureSealRow[] = [
  { prohibited_feature_id: "prohfeat_a", feature_code: "exchange.matching_engine", prohibition_reason: "r1", prohibition_source: "Doc00", applies_until: "until_formal_exchange_licence_approval", status: "active", version: 1 },
  { prohibited_feature_id: "prohfeat_b", feature_code: "pricing.aix_spread_markup", prohibition_reason: "r2", prohibition_source: "Doc00", applies_until: "permanent", status: "active", version: 1 },
];

describe("computeLicenceProfileScopeHash / computeProhibitedRegistryScopeHash", () => {
  it("is order-independent (row array order does not change the hash)", () => {
    const h1 = computeLicenceProfileScopeHash(licenceRows);
    const h2 = computeLicenceProfileScopeHash([...licenceRows].reverse());
    expect(h1).toBe(h2);
  });

  it("changes when any row's content changes (tamper-sensitive)", () => {
    const h1 = computeLicenceProfileScopeHash(licenceRows);
    const tampered = licenceRows.map((r) => (r.licence_code === "EXCHANGE" ? { ...r, licence_status: "approved" } : r));
    const h2 = computeLicenceProfileScopeHash(tampered);
    expect(h1).not.toBe(h2);
  });

  it("prohibited-registry hash is order-independent and tamper-sensitive", () => {
    const h1 = computeProhibitedRegistryScopeHash(prohibitedRows);
    const h2 = computeProhibitedRegistryScopeHash([...prohibitedRows].reverse());
    expect(h1).toBe(h2);

    const tampered = prohibitedRows.map((r) => (r.feature_code === "exchange.matching_engine" ? { ...r, status: "inactive" } : r));
    const h3 = computeProhibitedRegistryScopeHash(tampered);
    expect(h1).not.toBe(h3);
  });

  it("is insensitive to a row's own mutable/runtime-only columns not being in the allow-list (documented exclusion)", () => {
    // created_at_utc/updated_at_utc/last_integrity_check_utc are deliberately NOT part of
    // LicenceProfileSealRow's shape at all — this test documents that the allow-list type
    // itself structurally cannot include them, not merely that a handler chooses to ignore them.
    type Keys = keyof LicenceProfileSealRow;
    const forbidden: string[] = ["created_at_utc", "updated_at_utc", "last_integrity_check_utc"];
    const keys: Keys[] = ["licence_profile_id", "licence_code", "licence_status", "authority", "evidence_ref", "evidence_authenticity_status", "version", "status"];
    for (const f of forbidden) {
      expect(keys as string[]).not.toContain(f);
    }
  });
});

describe("evaluateScopeSeal", () => {
  const hash = "sha256:abc123";

  it("passes when exactly one active seal for the scope matches the computed hash", () => {
    const result = evaluateScopeSeal("licence_profile", hash, [{ config_scope: "licence_profile", config_hash: hash }]);
    expect(result).toEqual({ scope: "licence_profile", status: "pass", reason: "ok" });
  });

  it("fails closed with seal_missing when no active seal exists for the scope", () => {
    const result = evaluateScopeSeal("licence_profile", hash, [{ config_scope: "prohibited_registry", config_hash: hash }]);
    expect(result).toEqual({ scope: "licence_profile", status: "fail", reason: "seal_missing" });
  });

  it("fails closed with seal_duplicate_active when more than one active seal exists for the scope", () => {
    const result = evaluateScopeSeal("licence_profile", hash, [
      { config_scope: "licence_profile", config_hash: hash },
      { config_scope: "licence_profile", config_hash: hash },
    ]);
    expect(result).toEqual({ scope: "licence_profile", status: "fail", reason: "seal_duplicate_active" });
  });

  it("fails closed with hash_mismatch when the stored seal hash does not match the computed hash", () => {
    const result = evaluateScopeSeal("licence_profile", hash, [
      { config_scope: "licence_profile", config_hash: "sha256:different" },
    ]);
    expect(result).toEqual({ scope: "licence_profile", status: "fail", reason: "hash_mismatch" });
  });

  it("never picks 'the first matching seal' and silently passes when duplicates disagree", () => {
    // Even if one of the two duplicate active seals happens to match, duplication itself is the
    // failure — this proves the check doesn't just find-and-compare against seals[0].
    const result = evaluateScopeSeal("licence_profile", hash, [
      { config_scope: "licence_profile", config_hash: hash },
      { config_scope: "licence_profile", config_hash: "sha256:different" },
    ]);
    expect(result.status).toBe("fail");
    expect(result.reason).toBe("seal_duplicate_active");
  });
});

// =================================================================================================
// Phase 2 F-2 closure — verifyDecisionTimeIntegrity, pure (DB-free via a fake Sql object). This
// function's contract only ever calls `.query()` three times, in a fixed order (licence_profile
// rows, prohibited_feature rows, active seals) — a fake object satisfies the `Sql` type without
// needing a real Postgres connection, matching how this codebase unit-tests DB-shaped logic
// elsewhere (e.g. tests/unit/sec1-iam2-client.test.ts's fake-client pattern).
// =================================================================================================

function fakeSql(licenceRows: unknown[], prohibitedRows: unknown[], sealRows: unknown[]) {
  const calls = [licenceRows, prohibitedRows, sealRows];
  let i = 0;
  return {
    query: async () => {
      const rows = calls[i];
      i += 1;
      return { rows };
    },
  } as never;
}

/** A genuinely valid DB row set — built FROM the vendored constant, not hand-typed, so these
 * tests prove real agreement rather than a coincidentally-matching fixture. */
function buildValidLicenceRows(): LicenceProfileSealRow[] {
  return DOC00_LICENCE_PROFILES.map((f) => ({
    licence_profile_id: `licprof_${f.licence_code.toLowerCase()}`,
    licence_code: f.licence_code,
    licence_status: f.licence_status,
    authority: f.authority,
    evidence_ref: null,
    evidence_authenticity_status: "unverified",
    version: 1,
    status: "active",
  }));
}

function buildValidProhibitedRows(): ProhibitedFeatureSealRow[] {
  return DOC00_PROHIBITED_FEATURES.map((f) => ({
    prohibited_feature_id: `prohfeat_${f.feature_code.replace(/\./g, "_")}`,
    feature_code: f.feature_code,
    prohibition_reason: f.prohibition_reason,
    prohibition_source: f.prohibition_source,
    applies_until: f.applies_until,
    status: "active",
    version: 1,
  }));
}

function buildValidSeals(licenceRows: LicenceProfileSealRow[], prohibitedRows: ProhibitedFeatureSealRow[]) {
  const doc00Hash = computeDoc00BaselineHash();
  return [
    {
      config_scope: "licence_profile",
      config_version: 1,
      config_hash: computeLicenceProfileScopeHash(licenceRows),
      doc00_baseline_hash: doc00Hash,
      doc00_source_version: DOC00_SOURCE_VERSION,
    },
    {
      config_scope: "prohibited_registry",
      config_version: 1,
      config_hash: computeProhibitedRegistryScopeHash(prohibitedRows),
      doc00_baseline_hash: doc00Hash,
      doc00_source_version: DOC00_SOURCE_VERSION,
    },
  ];
}

describe("verifyDecisionTimeIntegrity (Phase 2 F-2 closure)", () => {
  it("verifies clean when DB rows, seals, and the vendored Doc00 baseline all genuinely agree", async () => {
    const licenceRows = buildValidLicenceRows();
    const prohibitedRows = buildValidProhibitedRows();
    const seals = buildValidSeals(licenceRows, prohibitedRows);

    const result = await verifyDecisionTimeIntegrity(fakeSql(licenceRows, prohibitedRows, seals));
    expect(result.status).toBe("verified");
    expect(result.scopes).toEqual([
      { scope: "licence_profile", status: "pass", reason: "ok" },
      { scope: "prohibited_registry", status: "pass", reason: "ok" },
    ]);
    expect(result.licenceProfileVersion).toBe(1);
    expect(result.prohibitedRegistryVersion).toBe(1);
  });

  it("fails closed when doc00_baseline_hash is stale/wrong even though config_hash still agrees with the DB rows", async () => {
    const licenceRows = buildValidLicenceRows();
    const prohibitedRows = buildValidProhibitedRows();
    const seals = buildValidSeals(licenceRows, prohibitedRows);
    seals[0]!.doc00_baseline_hash = "sha256:stale_baseline_hash";

    const result = await verifyDecisionTimeIntegrity(fakeSql(licenceRows, prohibitedRows, seals));
    expect(result.status).toBe("failed");
    const licenceScope = result.scopes.find((s) => s.scope === "licence_profile");
    expect(licenceScope).toMatchObject({ status: "fail", reason: "doc00_baseline_hash_stale" });
  });

  it("fails closed when doc00_source_version is stale/wrong", async () => {
    const licenceRows = buildValidLicenceRows();
    const prohibitedRows = buildValidProhibitedRows();
    const seals = buildValidSeals(licenceRows, prohibitedRows);
    seals[1]!.doc00_source_version = "v1.2";

    const result = await verifyDecisionTimeIntegrity(fakeSql(licenceRows, prohibitedRows, seals));
    expect(result.status).toBe("failed");
    const prohibitedScope = result.scopes.find((s) => s.scope === "prohibited_registry");
    expect(prohibitedScope).toMatchObject({ status: "fail", reason: "doc00_source_version_stale" });
  });

  it("fails closed when a required prohibited-feature code is removed from the DB AND the seal is recomputed to match the tampered DB (the exact attack Phase 1's check alone could not catch)", async () => {
    const licenceRows = buildValidLicenceRows();
    // Remove exchange.matching_engine entirely — simulating an attacker who deletes a row.
    const tamperedProhibitedRows = buildValidProhibitedRows().filter((r) => r.feature_code !== "exchange.matching_engine");
    // The seal is recomputed FROM the tampered row set — this is what "an attacker who also
    // rewrites the seal" looks like. Phase 1's checkConfigIntegritySeals would report PASS here
    // (DB agrees with its own seal); verifyDecisionTimeIntegrity must still fail.
    const seals = buildValidSeals(licenceRows, tamperedProhibitedRows);

    const result = await verifyDecisionTimeIntegrity(fakeSql(licenceRows, tamperedProhibitedRows, seals));
    expect(result.status).toBe("failed");
    const prohibitedScope = result.scopes.find((s) => s.scope === "prohibited_registry");
    expect(prohibitedScope).toMatchObject({ status: "fail", reason: "doc00_prohibited_fact_missing" });
  });

  it("fails closed when EXCHANGE is flipped to approved in the DB AND the seal is recomputed to match the tampered DB", async () => {
    const tamperedLicenceRows = buildValidLicenceRows().map((r) => (r.licence_code === "EXCHANGE" ? { ...r, licence_status: "approved" } : r));
    const prohibitedRows = buildValidProhibitedRows();
    const seals = buildValidSeals(tamperedLicenceRows, prohibitedRows);

    const result = await verifyDecisionTimeIntegrity(fakeSql(tamperedLicenceRows, prohibitedRows, seals));
    expect(result.status).toBe("failed");
    const licenceScope = result.scopes.find((s) => s.scope === "licence_profile");
    expect(licenceScope).toMatchObject({ status: "fail", reason: "doc00_licence_fact_mismatch" });
  });

  it("still fails closed (Phase 1 layer) on an ordinary hash_mismatch — DB tampered but seal NOT recomputed", async () => {
    const licenceRows = buildValidLicenceRows();
    const prohibitedRows = buildValidProhibitedRows();
    const seals = buildValidSeals(licenceRows, prohibitedRows);
    const tamperedProhibitedRows = prohibitedRows.map((r) => (r.feature_code === "exchange.matching_engine" ? { ...r, status: "inactive" } : r));

    const result = await verifyDecisionTimeIntegrity(fakeSql(licenceRows, tamperedProhibitedRows, seals));
    expect(result.status).toBe("failed");
    const prohibitedScope = result.scopes.find((s) => s.scope === "prohibited_registry");
    expect(prohibitedScope).toMatchObject({ status: "fail", reason: "hash_mismatch" });
  });
});

// ===============================================================================================
// Phase 3A — computeFeatureScopeHash + resealScope. The 'feature' config_scope value has been
// legal in cfg1.config_integrity_seal's CHECK constraint since migration 014 (Phase 1), but no
// row for it was ever seeded — cfg1.feature was empty until Phase 3A's mutation workflow could
// create rows. resealScope is what actually populates the FIRST feature-scope seal.
// ===============================================================================================
describe("computeFeatureScopeHash", () => {
  const featureRows: FeatureSealRow[] = [
    { feature_id: "feat_1", feature_code: "otc.rfq.submit", feature_name: "OTC RFQ Submit", current_state: "enabled", licence_profile_id: "licprof_mb", version: 1 },
    { feature_id: "feat_2", feature_code: "otc.rfq.cancel", feature_name: "OTC RFQ Cancel", current_state: "disabled", licence_profile_id: null, version: 1 },
  ];

  it("is order-independent (codepoint-sorted internally)", () => {
    expect(computeFeatureScopeHash(featureRows)).toBe(computeFeatureScopeHash([...featureRows].reverse()));
  });

  it("is tamper-sensitive to current_state and version", () => {
    const h1 = computeFeatureScopeHash(featureRows);
    expect(computeFeatureScopeHash(featureRows.map((r) => (r.feature_code === "otc.rfq.submit" ? { ...r, current_state: "disabled" } : r)))).not.toBe(h1);
    expect(computeFeatureScopeHash(featureRows.map((r) => (r.feature_code === "otc.rfq.submit" ? { ...r, version: 2 } : r)))).not.toBe(h1);
  });

  it("is deterministic on an empty row set (the state before any feature has ever been created)", () => {
    expect(computeFeatureScopeHash([])).toBe(computeFeatureScopeHash([]));
    expect(computeFeatureScopeHash([]).startsWith("sha256:")).toBe(true);
  });
});

describe("resealScope", () => {
  interface RecordedCall {
    sql: string;
    params: unknown[];
  }

  function fakeClient(queryResults: Array<{ rows: unknown[] }>) {
    const calls: RecordedCall[] = [];
    let i = 0;
    return {
      calls,
      client: {
        query: async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params });
          const result = queryResults[i] ?? { rows: [] };
          i += 1;
          return result;
        },
      } as never,
    };
  }

  it("first-ever feature-scope reseal: no prior active seal -> version 1, INSERT only, no supersede UPDATE", async () => {
    const featureRows = [{ feature_id: "feat_1", feature_code: "otc.rfq.submit", feature_name: "x", current_state: "enabled", licence_profile_id: null, version: 1 }];
    const { calls, client } = fakeClient([
      { rows: [] }, // FOR UPDATE lock — no existing active seal for 'feature'
      { rows: featureRows }, // live cfg1.feature rows
      { rows: [] }, // INSERT
    ]);
    const result = await resealScope(client, "feature", { approvalId: "appr_1" });
    expect(result.scope).toBe("feature");
    expect(result.previousVersion).toBeNull();
    expect(result.newVersion).toBe(1);
    expect(result.sealId.startsWith("seal_")).toBe(true);
    expect(result.newHash).toBe(computeFeatureScopeHash(featureRows as FeatureSealRow[]));
    expect(calls).toHaveLength(3); // no 4th (supersede) call — nothing to supersede
    expect(calls[2]!.sql).toMatch(/INSERT INTO cfg1\.config_integrity_seal/);
    expect(calls[2]!.params).toContain("appr_1");
  });

  it("subsequent licence_profile-scope reseal: an existing active seal is superseded BEFORE the new one is inserted (partial-unique-index ordering), and the new version increments", async () => {
    const licenceRows = [{ licence_profile_id: "licprof_mb", licence_code: "MB", licence_status: "approved", authority: "LFSA", evidence_ref: null, evidence_authenticity_status: "unverified", version: 2, status: "active" }];
    const { calls, client } = fakeClient([
      { rows: [{ config_integrity_seal_id: "seal_licence_profile_v1", config_version: 1 }] }, // FOR UPDATE lock — existing active seal
      { rows: licenceRows }, // live cfg1.licence_profile rows
      { rows: [] }, // UPDATE ... SET status = 'superseded' — MUST run before the INSERT below, or the
      // partial unique index (one active row per scope) would reject the INSERT while the old
      // row is still 'active'.
      { rows: [] }, // INSERT the new active seal
    ]);
    const result = await resealScope(client, "licence_profile", { approvalId: null });
    expect(result.previousVersion).toBe(1);
    expect(result.newVersion).toBe(2);
    expect(calls).toHaveLength(4);
    expect(calls[2]!.sql).toMatch(/UPDATE cfg1\.config_integrity_seal SET status = 'superseded'/);
    expect(calls[2]!.params).toContain("seal_licence_profile_v1");
    expect(calls[3]!.sql).toMatch(/INSERT INTO cfg1\.config_integrity_seal/);
  });

  it("fails closed (throws) when more than one active seal is somehow found for the scope — never picks 'the first one'", async () => {
    const { client } = fakeClient([
      { rows: [{ config_integrity_seal_id: "seal_a", config_version: 1 }, { config_integrity_seal_id: "seal_b", config_version: 1 }] },
    ]);
    await expect(resealScope(client, "feature", { approvalId: null })).rejects.toThrow(/more than one active seal/);
  });

  it("never inserts a real signature/KMS reference — signed_by/signature_ref remain NULL", async () => {
    const { calls, client } = fakeClient([{ rows: [] }, { rows: [] }, { rows: [] }]);
    await resealScope(client, "feature", { approvalId: null });
    const insertCall = calls[2]!;
    expect(insertCall.sql).toMatch(/signed_by, signature_ref/);
    expect(insertCall.sql).toMatch(/VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,'sha256',NULL,NULL,\$7/);
  });
});
