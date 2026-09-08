/**
 * Pure/DB-free tests for services/cfg1/src/lib/decision-token.ts, via a fake PoolClient that
 * records every `.query()` call (SQL text is not exercised here — that's the integration
 * suite's job — only that the RIGHT VALUES flow into the RIGHT calls, in particular that the
 * raw token is never one of them). Full end-to-end token lifecycle (issue -> verify twice
 * within TTL -> config change invalidates -> binding mismatch revokes) against a real database
 * is covered by tests/integration/cfg1-db.test.ts.
 */
import { describe, expect, it } from "vitest";
import { issueDecisionToken, verifyDecisionToken } from "../../services/cfg1/src/lib/decision-token.js";
import { computeDecisionPayloadHash, type DecisionResult } from "../../services/cfg1/src/lib/decision.js";

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

const baseDecision: DecisionResult = {
  decision: "allow",
  reasonCode: "feature_allowed",
  featureConfigVersion: 1,
  licenceProfileVersion: 1,
  prohibitedRegistryVersion: 1,
  prohibitedRegistryHash: "sha256:abc",
  doc00SourceVersion: "v1.3",
  payloadHash: "sha256:def",
};

describe("issueDecisionToken", () => {
  it("stores only the token hash — the raw token never appears in any query parameter", async () => {
    const { calls, client } = fakeClient([{ rows: [] }]);
    const issued = await issueDecisionToken(client, {
      decisionId: "cfgdec_1",
      featureCode: "otc.rfq.submit",
      action: "execute",
      callerModule: "TRD-01",
      environment: "prod",
      decision: baseDecision,
    });

    expect(issued.rawToken).toBeTruthy();
    expect(calls).toHaveLength(1);
    const insertParams = calls[0]!.params.map(String);
    // The raw token must not appear anywhere in the INSERT's parameter list — only its hash
    // (a distinct, non-reversible value) does.
    expect(insertParams).not.toContain(issued.rawToken);
  });

  it("returns a future expiry (bounded TTL, not indefinite)", async () => {
    const { client } = fakeClient([{ rows: [] }]);
    const issued = await issueDecisionToken(client, {
      decisionId: "cfgdec_1",
      featureCode: "otc.rfq.submit",
      action: "execute",
      callerModule: "TRD-01",
      environment: "prod",
      decision: baseDecision,
    });
    expect(new Date(issued.expiresAtUtc).getTime()).toBeGreaterThan(Date.now());
    // Bounded — not e.g. a year in the future.
    expect(new Date(issued.expiresAtUtc).getTime()).toBeLessThan(Date.now() + 60 * 60_000);
  });

  it("generates a fresh, distinct token and token_id on every call", async () => {
    const { client: client1 } = fakeClient([{ rows: [] }]);
    const { client: client2 } = fakeClient([{ rows: [] }]);
    const a = await issueDecisionToken(client1, {
      decisionId: "cfgdec_1",
      featureCode: "otc.rfq.submit",
      action: "execute",
      callerModule: "TRD-01",
      environment: "prod",
      decision: baseDecision,
    });
    const b = await issueDecisionToken(client2, {
      decisionId: "cfgdec_2",
      featureCode: "otc.rfq.submit",
      action: "execute",
      callerModule: "TRD-01",
      environment: "prod",
      decision: baseDecision,
    });
    expect(a.rawToken).not.toBe(b.rawToken);
    expect(a.tokenId).not.toBe(b.tokenId);
  });
});

describe("verifyDecisionToken", () => {
  const bindingInput = {
    decisionId: "cfgdec_1",
    featureCode: "otc.rfq.submit",
    action: "execute",
    callerModule: "TRD-01",
    environment: "prod",
    tokenRaw: "raw-token-value",
  };

  // Phase 3A extension: licenceProfileVersion/featureConfigVersion now required on
  // CurrentIntegrityState (services/cfg1/src/lib/decision-token.ts) — set to match tokenRow()'s
  // own bound defaults below so pre-existing "nothing has changed" tests stay true no-op
  // baselines; the dedicated Phase 3A describe block further down deliberately diverges them.
  const currentIntegrity = { prohibitedRegistryVersion: 1, prohibitedRegistryHash: "sha256:abc", licenceProfileVersion: 1, featureConfigVersion: 1 };

  // The REAL payload hash for bindingInput's fields — a placeholder here would make every
  // binding check fail at the payload_hash comparison regardless of which specific mismatch a
  // test intends to exercise, silently masking the config-changed path in particular.
  const matchingPayloadHash = computeDecisionPayloadHash({
    featureCode: bindingInput.featureCode,
    action: bindingInput.action,
    resource: undefined,
    environment: bindingInput.environment,
    clientId: undefined,
    clientClass: undefined,
    callerModule: bindingInput.callerModule,
  });

  function tokenRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      token_id: "cfgtok_1",
      decision_id: "cfgdec_1",
      feature_code: "otc.rfq.submit",
      action: "execute",
      resource: null,
      caller_module: "TRD-01",
      client_id: null,
      client_class: null,
      environment: "prod",
      prohibited_registry_version: 1,
      prohibited_registry_hash: "sha256:abc",
      licence_profile_version: 1,
      feature_config_version: 1,
      payload_hash: matchingPayloadHash,
      status: "active",
      expires_at_utc: new Date(Date.now() + 60_000).toISOString(),
      ...overrides,
    };
  }

  it("rejects with CFG1_DECISION_TOKEN_INVALID when no row is found", async () => {
    const { client } = fakeClient([{ rows: [] }]);
    const result = await verifyDecisionToken(client, bindingInput, currentIntegrity, false);
    expect(result).toEqual({ ok: false, reasonCode: "CFG1_DECISION_TOKEN_INVALID" });
  });

  it("rejects with CFG1_DECISION_TOKEN_REVOKED when the token was already revoked", async () => {
    const { client } = fakeClient([{ rows: [tokenRow({ status: "revoked" })] }]);
    const result = await verifyDecisionToken(client, bindingInput, currentIntegrity, false);
    expect(result).toEqual({ ok: false, reasonCode: "CFG1_DECISION_TOKEN_REVOKED" });
  });

  it("rejects with CFG1_DECISION_TOKEN_EXPIRED when expires_at_utc has passed", async () => {
    const { client } = fakeClient([{ rows: [tokenRow({ expires_at_utc: new Date(Date.now() - 1000).toISOString() })] }]);
    const result = await verifyDecisionToken(client, bindingInput, currentIntegrity, false);
    expect(result).toEqual({ ok: false, reasonCode: "CFG1_DECISION_TOKEN_EXPIRED" });
  });

  it("rejects with CFG1_DECISION_BINDING_MISMATCH and revokes the token when a bound field differs from what was presented", async () => {
    const { calls, client } = fakeClient([{ rows: [tokenRow({ feature_code: "different.feature" })] }, { rows: [] }]);
    const result = await verifyDecisionToken(client, bindingInput, currentIntegrity, false);
    expect(result).toEqual({ ok: false, reasonCode: "CFG1_DECISION_BINDING_MISMATCH" });
    // Second call must be the revoke UPDATE.
    expect(calls).toHaveLength(2);
    expect(calls[1]!.sql).toMatch(/UPDATE cfg1\.feature_decision_token SET status = 'revoked'/);
    expect(calls[1]!.params).toContain("binding_mismatch");
  });

  it("rejects with CFG1_DECISION_BINDING_MISMATCH and revokes the token when the prohibited-registry version/hash has changed since issuance", async () => {
    const { calls, client } = fakeClient([{ rows: [tokenRow({ prohibited_registry_version: 1, prohibited_registry_hash: "sha256:old" })] }, { rows: [] }]);
    // currentIntegrity reflects a NEWER prohibited_registry_hash than what the token was bound to.
    const result = await verifyDecisionToken(client, bindingInput, { ...currentIntegrity, prohibitedRegistryHash: "sha256:new" }, false);
    expect(result).toEqual({ ok: false, reasonCode: "CFG1_DECISION_BINDING_MISMATCH" });
    expect(calls[1]!.params).toContain("config_changed");
  });

  it("never accepts a null-bound field as a wildcard for a presented value", async () => {
    // Token bound with client_id = null; caller presents a real client_id — must NOT match.
    const { client } = fakeClient([{ rows: [tokenRow({ client_id: null })] }, { rows: [] }]);
    const result = await verifyDecisionToken(client, { ...bindingInput, clientId: "client_1" }, currentIntegrity, false);
    expect(result.ok).toBe(false);
  });

  // -----------------------------------------------------------------------------------------
  // Phase 3A — decision-token invalidation through licence-profile / feature-version mutation
  // (approved decision #8). Both scenarios are otherwise identical to a clean, matching
  // currentIntegrity — only the ONE field under test diverges from the token's bound value.
  // -----------------------------------------------------------------------------------------
  it("rejects with CFG1_DECISION_BINDING_MISMATCH and revokes the token when licence_profile_version has changed since issuance (Phase 3A licence-profile mutation)", async () => {
    const { calls, client } = fakeClient([{ rows: [tokenRow({ licence_profile_version: 1 })] }, { rows: [] }]);
    const result = await verifyDecisionToken(client, bindingInput, { ...currentIntegrity, licenceProfileVersion: 2 }, false);
    expect(result).toEqual({ ok: false, reasonCode: "CFG1_DECISION_BINDING_MISMATCH" });
    expect(calls[1]!.params).toContain("config_changed");
  });

  it("rejects with CFG1_DECISION_BINDING_MISMATCH and revokes the token when feature_config_version has changed since issuance (Phase 3A feature-state mutation)", async () => {
    const { calls, client } = fakeClient([{ rows: [tokenRow({ feature_config_version: 1 })] }, { rows: [] }]);
    const result = await verifyDecisionToken(client, bindingInput, { ...currentIntegrity, featureConfigVersion: 2 }, false);
    expect(result).toEqual({ ok: false, reasonCode: "CFG1_DECISION_BINDING_MISMATCH" });
    expect(calls[1]!.params).toContain("config_changed");
  });

  it("does not compare feature_config_version when the token itself was bound with a null feature_config_version (no feature row existed at issuance)", async () => {
    const { client } = fakeClient([{ rows: [tokenRow({ feature_config_version: null })] }]);
    // currentIntegrity's featureConfigVersion is deliberately different from anything meaningful
    // — must be ignored entirely since the token's own bound value is null.
    const result = await verifyDecisionToken(client, bindingInput, { ...currentIntegrity, featureConfigVersion: 99 }, false);
    expect(result.ok).toBe(true);
  });

  // -----------------------------------------------------------------------------------------
  // Phase 3B — kill-switch revocation (approved decisions #13/#14). killSwitchActive is
  // supplied by the CALLER (routes/features.ts, via lib/kill-switch.ts's live check) — this
  // file only proves the revoke-and-fail-closed behaviour once told the switch is active.
  // -----------------------------------------------------------------------------------------
  it("rejects with CFG1_TOKEN_REVOKED_BY_KILL_SWITCH and revokes the token when killSwitchActive is true, even though every other field matches", async () => {
    const { calls, client } = fakeClient([{ rows: [tokenRow()] }, { rows: [] }]);
    const result = await verifyDecisionToken(client, bindingInput, currentIntegrity, true);
    expect(result).toEqual({ ok: false, reasonCode: "CFG1_TOKEN_REVOKED_BY_KILL_SWITCH" });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.sql).toMatch(/UPDATE cfg1\.feature_decision_token SET status = 'revoked'/);
    expect(calls[1]!.params).toContain("kill_switch_active");
  });

  it("succeeds normally when killSwitchActive is false and nothing else has changed", async () => {
    const { client } = fakeClient([{ rows: [tokenRow()] }]);
    const result = await verifyDecisionToken(client, bindingInput, currentIntegrity, false);
    expect(result.ok).toBe(true);
  });
});
