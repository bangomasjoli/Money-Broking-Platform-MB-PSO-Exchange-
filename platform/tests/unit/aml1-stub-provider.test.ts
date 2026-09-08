/**
 * AML-01 Phase 3B — the deterministic stub provider (services/aml1/src/lib/providers/
 * stub-provider.ts). No database, no HTTP — proves the SAME deterministic fixture behaviour that
 * lived directly in lib/screening.ts's own `screen()` through Phase 3A, now behind the
 * `ScreeningProvider` adaptor boundary, plus the three NEW Phase 3B fixtures (malformed response,
 * unknown category, null score).
 */
import { describe, expect, it } from "vitest";
import { stubProvider, STUB_PROVIDER_ID, STUB_ADAPTOR_VERSION } from "../../services/aml1/src/lib/providers/stub-provider.js";
import type { ProviderScreeningPayload } from "../../services/aml1/src/lib/providers/types.js";

function payload(name: string, extra: Partial<ProviderScreeningPayload> = {}): ProviderScreeningPayload {
  return { name, subject_nature: "individual", ...extra };
}

describe("AML-01 Phase 3B stub provider — stubProvider.screen()", () => {
  it("exposes a stable providerId/adaptorVersion", () => {
    expect(stubProvider.providerId).toBe("stub-v1");
    expect(stubProvider.providerId).toBe(STUB_PROVIDER_ID);
    expect(stubProvider.adaptorVersion).toBe(STUB_ADAPTOR_VERSION);
  });

  it("an ordinary/clean name produces kind='screened' with zero rawMatches", async () => {
    const outcome = await stubProvider.screen(payload("John Ordinary Citizen"));
    expect(outcome.kind).toBe("screened");
    if (outcome.kind !== "screened") throw new Error("unreachable");
    expect(outcome.rawMatches).toEqual([]);
    expect(outcome.providerReferenceId).toBeNull();
  });

  it("the sanctions fixture ('AML1 TEST SANCTIONED ENTITY') produces exactly one sanctions rawMatch", async () => {
    const outcome = await stubProvider.screen(payload("AML1 TEST SANCTIONED ENTITY"));
    expect(outcome.kind).toBe("screened");
    if (outcome.kind !== "screened") throw new Error("unreachable");
    expect(outcome.rawMatches).toHaveLength(1);
    expect(outcome.rawMatches[0]?.category).toBe("sanctions");
    expect(outcome.rawMatches[0]?.score).toBeGreaterThan(0);
    expect(outcome.listVersion).toBe("stub-list-v1");
    expect(outcome.providerReferenceId).toBeTruthy();
  });

  it("the PEP fixture ('AML1 TEST PEP') produces exactly one pep rawMatch", async () => {
    const outcome = await stubProvider.screen(payload("AML1 TEST PEP", { subject_nature: "entity" }));
    expect(outcome.kind).toBe("screened");
    if (outcome.kind !== "screened") throw new Error("unreachable");
    expect(outcome.rawMatches).toHaveLength(1);
    expect(outcome.rawMatches[0]?.category).toBe("pep");
  });

  it("the adverse-media fixture ('AML1 TEST ADVERSE MEDIA') produces exactly one adverse_media rawMatch carrying non-empty match_detail", async () => {
    const outcome = await stubProvider.screen(payload("AML1 TEST ADVERSE MEDIA"));
    expect(outcome.kind).toBe("screened");
    if (outcome.kind !== "screened") throw new Error("unreachable");
    expect(outcome.rawMatches).toHaveLength(1);
    expect(outcome.rawMatches[0]?.category).toBe("adverse_media");
    expect(outcome.rawMatches[0]?.match_detail).toBeTruthy();
  });

  it("the provider-down fixture ('AML1 TEST PROVIDER DOWN') returns kind='unavailable', not a screened outcome", async () => {
    const outcome = await stubProvider.screen(payload("AML1 TEST PROVIDER DOWN"));
    expect(outcome.kind).toBe("unavailable");
    if (outcome.kind !== "unavailable") throw new Error("unreachable");
    expect(outcome.reasonCode).toBeTruthy();
  });

  it("Phase 3B NEW: the malformed-response fixture ('AML1 TEST PROVIDER MALFORMED') returns kind='invalid_response', distinct from 'unavailable'", async () => {
    const outcome = await stubProvider.screen(payload("AML1 TEST PROVIDER MALFORMED"));
    expect(outcome.kind).toBe("invalid_response");
    if (outcome.kind !== "invalid_response") throw new Error("unreachable");
    expect(outcome.reasonCode).toBeTruthy();
  });

  it("Phase 3B NEW: the unknown-category fixture ('AML1 TEST UNKNOWN CATEGORY') returns kind='screened' with a raw category outside sanctions/pep/adverse_media", async () => {
    const outcome = await stubProvider.screen(payload("AML1 TEST UNKNOWN CATEGORY"));
    expect(outcome.kind).toBe("screened");
    if (outcome.kind !== "screened") throw new Error("unreachable");
    expect(outcome.rawMatches).toHaveLength(1);
    expect(["sanctions", "pep", "adverse_media"]).not.toContain(outcome.rawMatches[0]?.category);
  });

  it("Phase 3B NEW: the no-score fixture ('AML1 TEST NO SCORE MATCH') returns a match with score: null", async () => {
    const outcome = await stubProvider.screen(payload("AML1 TEST NO SCORE MATCH"));
    expect(outcome.kind).toBe("screened");
    if (outcome.kind !== "screened") throw new Error("unreachable");
    expect(outcome.rawMatches).toHaveLength(1);
    expect(outcome.rawMatches[0]?.score).toBeNull();
  });

  it("fixture matching is case-insensitive and whitespace-normalized (a real deterministic lookup, not a fragile exact-string match)", async () => {
    const outcome = await stubProvider.screen(payload("  aml1  test   sanctioned entity  "));
    expect(outcome.kind).toBe("screened");
    if (outcome.kind !== "screened") throw new Error("unreachable");
    expect(outcome.rawMatches).toHaveLength(1);
  });

  it("is deterministic — the same input always produces the same output", async () => {
    const input = payload("AML1 TEST SANCTIONED ENTITY");
    const first = await stubProvider.screen(input);
    const second = await stubProvider.screen(input);
    expect(first).toEqual(second);
  });
});
