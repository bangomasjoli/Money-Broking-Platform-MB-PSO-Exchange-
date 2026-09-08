/**
 * WLT-01 Phase 4A-2 — AML-01 pre-transaction client (`lib/aml1-client.ts`). No database, no live
 * AML-01 service — `fetchImpl` is stubbed per test (the established DI seam).
 */
import { describe, expect, it } from "vitest";
import { screenPreTransaction, type Aml1ClientConfig } from "../../services/wlt1/src/lib/aml1-client.js";

const NOW = new Date("2026-06-15T12:00:00.000Z");

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    clientId: "clt1client_1",
    subjectRefs: ["ap_1", "ap_2"],
    destinationRef: "wlt1dest_1",
    chain: "ethereum",
    network: "mainnet",
    nowUtc: NOW,
    ...overrides,
  };
}

function fetchStub(handler: (url: string, init: RequestInit) => { ok: boolean; status?: number; json: () => Promise<unknown> } | Promise<never>): typeof fetch {
  return (async (url: unknown, init?: unknown) => {
    const result = handler(String(url), init as RequestInit);
    if (result instanceof Promise) return result;
    return result as unknown as Response;
  }) as typeof fetch;
}

function allowResponse(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      decision: "allow",
      decision_id: "aml1ptd_" + "1".repeat(8) + "-1111-1111-1111-" + "1".repeat(12),
      reason_code: "evidence_clear",
      evaluated_at_utc: "2026-06-15T11:59:00.000Z",
      valid_until_utc: "2026-06-15T12:04:00.000Z",
      evidence_provider_ids: ["stub-v1"],
      client_id: "clt1client_1",
      requested_action: "destination_use",
      ...overrides,
    },
  };
}

function config(fetchImpl: typeof fetch): Aml1ClientConfig {
  return { baseUrl: "http://aml1.test", internalServiceToken: "tok", fetchImpl };
}

describe("WLT-01 Phase 4A-2 — screenPreTransaction request shape", () => {
  it("1. sends the exact frozen request body and headers", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit = {};
    const impl = fetchStub((url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return { ok: true, json: async () => allowResponse() };
    });
    await screenPreTransaction(config(impl), baseInput());
    expect(capturedUrl).toBe("http://aml1.test/internal/aml1/pre-transaction/screen");
    expect((capturedInit.headers as Record<string, string>)["x-internal-service-token"]).toBe("tok");
    const body = JSON.parse(capturedInit.body as string);
    expect(body).toEqual({
      client_id: "clt1client_1",
      subject_refs: [
        { subject_type: "authorised_party", subject_ref: "ap_1" },
        { subject_type: "authorised_party", subject_ref: "ap_2" },
      ],
      requested_action: "destination_use",
      caller_module: "WLT-01",
      destination_ref: "wlt1dest_1",
      chain: "ethereum",
      network: "mainnet",
    });
  });
});

describe("WLT-01 Phase 4A-2 — screenPreTransaction affirmative path", () => {
  it("2. valid allow response -> outcome allow with parsed fields", async () => {
    const impl = fetchStub(() => ({ ok: true, json: async () => allowResponse() }));
    const result = await screenPreTransaction(config(impl), baseInput());
    expect(result.outcome).toBe("allow");
    if (result.outcome === "allow") {
      expect(result.decisionId).toMatch(/^aml1ptd_[0-9a-f-]{36}$/);
      expect(result.validUntilUtc.toISOString()).toBe("2026-06-15T12:04:00.000Z");
      expect(result.evidenceProviderIds).toEqual(["stub-v1"]);
    }
  });
});

describe("WLT-01 Phase 4A-2 — screenPreTransaction business non-allow", () => {
  it("3. decision review -> not_allow", async () => {
    const impl = fetchStub(() => ({ ok: true, json: async () => allowResponse({ decision: "review" }) }));
    const result = await screenPreTransaction(config(impl), baseInput());
    expect(result.outcome).toBe("not_allow");
  });

  it("4. decision deny -> not_allow", async () => {
    const impl = fetchStub(() => ({ ok: true, json: async () => allowResponse({ decision: "deny" }) }));
    const result = await screenPreTransaction(config(impl), baseInput());
    expect(result.outcome).toBe("not_allow");
  });
});

describe("WLT-01 Phase 4A-2 — screenPreTransaction technical failures", () => {
  it("5. non-2xx -> unavailable", async () => {
    const impl = fetchStub(() => ({ ok: false, status: 500, json: async () => ({}) }));
    expect((await screenPreTransaction(config(impl), baseInput())).outcome).toBe("unavailable");
  });

  it("6. network error -> unavailable", async () => {
    const impl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect((await screenPreTransaction(config(impl), baseInput())).outcome).toBe("unavailable");
  });

  it("7. timeout (abort) -> unavailable", async () => {
    const impl = (async () => {
      throw new DOMException("aborted", "AbortError");
    }) as unknown as typeof fetch;
    expect((await screenPreTransaction(config(impl), baseInput())).outcome).toBe("unavailable");
  });

  it("8. malformed JSON body -> unavailable", async () => {
    const impl = fetchStub(() => ({
      ok: true,
      json: async () => {
        throw new Error("not json");
      },
    }));
    expect((await screenPreTransaction(config(impl), baseInput())).outcome).toBe("unavailable");
  });

  it("9. success:false envelope -> unavailable", async () => {
    const impl = fetchStub(() => ({ ok: true, json: async () => ({ success: false }) }));
    expect((await screenPreTransaction(config(impl), baseInput())).outcome).toBe("unavailable");
  });

  it("10. client_id mismatch -> unavailable", async () => {
    const impl = fetchStub(() => ({ ok: true, json: async () => allowResponse({ client_id: "clt1client_WRONG" }) }));
    expect((await screenPreTransaction(config(impl), baseInput())).outcome).toBe("unavailable");
  });

  it("11. requested_action mismatch -> unavailable", async () => {
    const impl = fetchStub(() => ({ ok: true, json: async () => allowResponse({ requested_action: "something_else" }) }));
    expect((await screenPreTransaction(config(impl), baseInput())).outcome).toBe("unavailable");
  });

  it("12. invalid decision_id format -> unavailable", async () => {
    const impl = fetchStub(() => ({ ok: true, json: async () => allowResponse({ decision_id: "not-a-valid-id" }) }));
    expect((await screenPreTransaction(config(impl), baseInput())).outcome).toBe("unavailable");
  });

  it("13. unparseable evaluated_at_utc -> unavailable", async () => {
    const impl = fetchStub(() => ({ ok: true, json: async () => allowResponse({ evaluated_at_utc: "not-a-date" }) }));
    expect((await screenPreTransaction(config(impl), baseInput())).outcome).toBe("unavailable");
  });

  it("14. unparseable valid_until_utc -> unavailable", async () => {
    const impl = fetchStub(() => ({ ok: true, json: async () => allowResponse({ valid_until_utc: "not-a-date" }) }));
    expect((await screenPreTransaction(config(impl), baseInput())).outcome).toBe("unavailable");
  });

  it("15. valid_until_utc not after evaluated_at_utc -> unavailable", async () => {
    const impl = fetchStub(() => ({ ok: true, json: async () => allowResponse({ valid_until_utc: "2026-06-15T11:59:00.000Z" }) }));
    expect((await screenPreTransaction(config(impl), baseInput())).outcome).toBe("unavailable");
  });

  it("16. valid_until_utc already at/before the caller-supplied authoritative nowUtc -> unavailable (already expired)", async () => {
    const impl = fetchStub(() => ({ ok: true, json: async () => allowResponse({ valid_until_utc: "2026-06-15T12:00:00.000Z" }) }));
    // NOW === "2026-06-15T12:00:00.000Z" exactly — at, not after, the authoritative instant.
    const result = await screenPreTransaction(config(impl), baseInput({ nowUtc: NOW }));
    expect(result.outcome).toBe("unavailable");
  });

  it("17. unknown decision value -> unavailable (never treated as allow or as a legitimate business deny)", async () => {
    const impl = fetchStub(() => ({ ok: true, json: async () => allowResponse({ decision: "maybe" }) }));
    expect((await screenPreTransaction(config(impl), baseInput())).outcome).toBe("unavailable");
  });

  it("18. empty evidence_provider_ids on an otherwise-affirmative allow -> unavailable (WLT's own defensive non-empty-provenance check)", async () => {
    const impl = fetchStub(() => ({ ok: true, json: async () => allowResponse({ evidence_provider_ids: [] }) }));
    expect((await screenPreTransaction(config(impl), baseInput())).outcome).toBe("unavailable");
  });

  it("19. missing evidence_provider_ids entirely -> unavailable", async () => {
    const impl = fetchStub(() => ({ ok: true, json: async () => allowResponse({ evidence_provider_ids: undefined }) }));
    expect((await screenPreTransaction(config(impl), baseInput())).outcome).toBe("unavailable");
  });

  it("20. reason_code missing on allow -> unavailable", async () => {
    const impl = fetchStub(() => ({ ok: true, json: async () => allowResponse({ reason_code: undefined }) }));
    expect((await screenPreTransaction(config(impl), baseInput())).outcome).toBe("unavailable");
  });

  it("21. no AML reason_code can synthesize allow — a review/deny with an 'allow'-sounding reason_code is still not_allow, never allow", async () => {
    const impl = fetchStub(() => ({ ok: true, json: async () => allowResponse({ decision: "review", reason_code: "evidence_clear" }) }));
    const result = await screenPreTransaction(config(impl), baseInput());
    expect(result.outcome).toBe("not_allow");
  });
});
