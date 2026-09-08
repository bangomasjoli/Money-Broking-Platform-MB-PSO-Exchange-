/**
 * AML-01 Phase 3B — the provider registry (services/aml1/src/lib/providers/registry.ts). No
 * database, no HTTP. Proves provider-id resolution and the registry's own timeout wrapper
 * (`screenViaProvider`) in isolation — uses vitest's fake timers to fast-forward the 5s timeout
 * deterministically, never a real wall-clock wait.
 */
import { describe, expect, it, vi } from "vitest";
import { isKnownScreeningProviderId, KNOWN_SCREENING_PROVIDER_IDS, resolveScreeningProvider, screenViaProvider } from "../../services/aml1/src/lib/providers/registry.js";
import { STUB_PROVIDER_ID, stubProvider } from "../../services/aml1/src/lib/providers/stub-provider.js";
import type { ProviderScreeningPayload, ScreeningProvider } from "../../services/aml1/src/lib/providers/types.js";

const payload: ProviderScreeningPayload = { name: "Jane Doe", subject_nature: "individual" };

describe("AML-01 Phase 3B provider registry — resolution", () => {
  it("known provider id ('stub-v1') is accepted", () => {
    expect(isKnownScreeningProviderId(STUB_PROVIDER_ID)).toBe(true);
    expect(KNOWN_SCREENING_PROVIDER_IDS).toContain(STUB_PROVIDER_ID);
    expect(resolveScreeningProvider(STUB_PROVIDER_ID)).toBe(stubProvider);
  });

  it("unknown provider id is rejected", () => {
    expect(isKnownScreeningProviderId("not-a-real-provider")).toBe(false);
    expect(() => resolveScreeningProvider("not-a-real-provider")).toThrow();
  });
});

describe("AML-01 Phase 3B provider registry — screenViaProvider() timeout wrapper", () => {
  it("passes a screened outcome through unchanged", async () => {
    const outcome = await screenViaProvider(stubProvider, { ...payload, name: "AML1 TEST SANCTIONED ENTITY" });
    expect(outcome.kind).toBe("screened");
  });

  it("a provider that never resolves times out as kind='unavailable' (fake timers — no real 5s wait)", async () => {
    vi.useFakeTimers();
    try {
      const neverResolves: ScreeningProvider = { providerId: "test-hang", adaptorVersion: "1", screen: () => new Promise(() => {}) };
      const outcomePromise = screenViaProvider(neverResolves, payload);
      await vi.advanceTimersByTimeAsync(5000);
      const outcome = await outcomePromise;
      expect(outcome.kind).toBe("unavailable");
      if (outcome.kind !== "unavailable") throw new Error("unreachable");
      expect(outcome.reasonCode).toBe("provider_timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a provider that never resolves and stays just under the timeout is NOT reported as unavailable yet", async () => {
    vi.useFakeTimers();
    try {
      const neverResolves: ScreeningProvider = { providerId: "test-hang-2", adaptorVersion: "1", screen: () => new Promise(() => {}) };
      const outcomePromise = screenViaProvider(neverResolves, payload);
      let settled = false;
      void outcomePromise.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(4999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a provider whose screen() throws is treated as unavailable, never as a completed screen", async () => {
    const throwingProvider: ScreeningProvider = {
      providerId: "test-throw",
      adaptorVersion: "1",
      screen: () => {
        throw new Error("boom");
      },
    };
    const outcome = await screenViaProvider(throwingProvider, payload);
    expect(outcome.kind).toBe("unavailable");
    if (outcome.kind !== "unavailable") throw new Error("unreachable");
    expect(outcome.reasonCode).toBe("provider_error");
  });

  it("a provider whose screen() rejects is treated as unavailable, never as a completed screen", async () => {
    const rejectingProvider: ScreeningProvider = { providerId: "test-reject", adaptorVersion: "1", screen: () => Promise.reject(new Error("network down")) };
    const outcome = await screenViaProvider(rejectingProvider, payload);
    expect(outcome.kind).toBe("unavailable");
  });
});
