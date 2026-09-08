/**
 * Pure/DB-free tests for services/cfg1/src/lib/decision.ts. `computeDecisionPayloadHash` is
 * fully pure. `evaluateFeature`'s integrity_failed passthrough is exercised via a fake
 * PoolClient (only `.query()` is used, and only through `verifyDecisionTimeIntegrity`'s fixed
 * 3-call sequence before evaluateFeature ever touches `cfg1.prohibited_feature`/`cfg1.feature`).
 * The full precedence chain (prohibited/unknown/allow/feature_disabled/stale_revalidate) against
 * REAL seeded data is covered by tests/integration/cfg1-db.test.ts — a real disposable Postgres
 * is a stronger, more realistic proof for this kind of multi-table sequential logic than a
 * heavily-mocked unit test would be.
 */
import { describe, expect, it } from "vitest";
import { computeDecisionPayloadHash, evaluateFeature, isFeatureMutationBlocked } from "../../services/cfg1/src/lib/decision.js";
import {
  DOC00_LICENCE_PROFILES,
  DOC00_PROHIBITED_FEATURES,
  DOC00_SOURCE_VERSION,
  computeDoc00BaselineHash,
} from "../../services/cfg1/src/lib/doc00-baseline.js";
import { computeLicenceProfileScopeHash, computeProhibitedRegistryScopeHash } from "../../services/cfg1/src/lib/integrity-seal.js";

describe("computeDecisionPayloadHash", () => {
  const base = {
    featureCode: "otc.rfq.submit",
    action: "execute",
    resource: "trade",
    environment: "prod",
    clientId: "client_1",
    clientClass: "institutional",
    callerModule: "TRD-01",
  };

  it("is deterministic for the same logical input", () => {
    expect(computeDecisionPayloadHash(base)).toBe(computeDecisionPayloadHash({ ...base }));
  });

  it("is sha256:-prefixed", () => {
    expect(computeDecisionPayloadHash(base).startsWith("sha256:")).toBe(true);
  });

  it("changes when any bound field changes (tamper-sensitive)", () => {
    const h1 = computeDecisionPayloadHash(base);
    expect(computeDecisionPayloadHash({ ...base, featureCode: "otc.rfq.cancel" })).not.toBe(h1);
    expect(computeDecisionPayloadHash({ ...base, action: "read" })).not.toBe(h1);
    expect(computeDecisionPayloadHash({ ...base, clientId: "client_2" })).not.toBe(h1);
    expect(computeDecisionPayloadHash({ ...base, callerModule: "WDR-01" })).not.toBe(h1);
    expect(computeDecisionPayloadHash({ ...base, environment: "dev" })).not.toBe(h1);
  });

  it("treats a null/undefined optional field consistently (never a wildcard)", () => {
    const withNull = computeDecisionPayloadHash({ ...base, resource: null });
    const withUndefined = computeDecisionPayloadHash({ ...base, resource: undefined });
    expect(withNull).toBe(withUndefined);
    expect(withNull).not.toBe(computeDecisionPayloadHash(base));
  });
});

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

function buildValidLicenceRows() {
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

function buildValidProhibitedRows() {
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

describe("evaluateFeature — integrity_failed passthrough (fake client)", () => {
  it("returns kind: 'integrity_failed' and never reaches the precedence chain when decision-time integrity fails", async () => {
    const licenceRows = buildValidLicenceRows();
    const prohibitedRows = buildValidProhibitedRows();
    const doc00Hash = computeDoc00BaselineHash();
    // Tamper: seal's doc00_baseline_hash is stale — F-2 must catch this before step 1 ever runs.
    const seals = [
      {
        config_scope: "licence_profile",
        config_version: 1,
        config_hash: computeLicenceProfileScopeHash(licenceRows),
        doc00_baseline_hash: "sha256:stale",
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

    const outcome = await evaluateFeature(fakeSql(licenceRows, prohibitedRows, seals) as never, {
      featureCode: "exchange.matching_engine",
      action: "execute",
      environment: "prod",
      callerModule: "TRD-01",
    });

    expect(outcome.kind).toBe("integrity_failed");
    if (outcome.kind === "integrity_failed") {
      expect(outcome.scopes.some((s) => s.status === "fail")).toBe(true);
    }
  });
});

// ===============================================================================================
// Phase 3A — isFeatureMutationBlocked (approved decisions #5/#6/#7): the mutation-route guard
// used by BOTH routes/feature-changes.ts's request AND apply handlers to structurally block a
// prohibited/Exchange-shaped feature_code before any change row (request) or state mutation
// (apply) can be created. Pure read + string-prefix check, exercised here via a minimal fake
// PoolClient — the real cfg1.prohibited_feature membership check is proven against real seeded
// data in tests/integration/cfg1-db.test.ts.
// ===============================================================================================
describe("isFeatureMutationBlocked", () => {
  function fakeClient(rows: unknown[]) {
    return { query: async () => ({ rows }) } as never;
  }

  it("blocks ANY exchange.-prefixed code structurally, even one not present in the prohibited registry (defence in depth)", async () => {
    const client = fakeClient([]); // prohibited_feature query would return no rows for this hypothetical code
    const result = await isFeatureMutationBlocked(client, "exchange.some_future_code_not_yet_in_registry");
    expect(result).toEqual({ blocked: true, reason: "exchange_shaped" });
  });

  it("blocks a non-exchange code that IS in the prohibited registry", async () => {
    const client = fakeClient([{ status: "active" }]);
    const result = await isFeatureMutationBlocked(client, "kyc.bypass");
    expect(result).toEqual({ blocked: true, reason: "prohibited_registry" });
  });

  it("does not block an ordinary, non-prohibited, non-exchange feature code", async () => {
    const client = fakeClient([]);
    const result = await isFeatureMutationBlocked(client, "otc.rfq.submit");
    expect(result).toEqual({ blocked: false });
  });
});
