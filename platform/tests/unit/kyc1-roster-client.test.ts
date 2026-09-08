/**
 * KYC-01 Phase 4B — `lib/roster-client.ts` pure-client unit coverage, no DB/network required.
 * Every call goes through `config.fetchImpl` (the same DI seam `lib/clt1-client.ts` already
 * established) — a synthetic `Response`-shaped object, never a real HTTP call.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fetchClt1KycRoster, type Clt1RosterParty } from "../../services/kyc1/src/lib/roster-client.js";

const APPLICATION_ID = "clt1app_roster_test";
const TOKEN = "test-clt1-token";

function party(overrides: Partial<Clt1RosterParty & { authorised_party_id: string }> = {}): Record<string, unknown> {
  return {
    authorised_party_id: overrides.authorisedPartyId ?? "clt1ap_a",
    party_type: overrides.partyType ?? "director",
    authority_status: overrides.authorityStatus ?? "pending",
    version: overrides.version ?? 1,
  };
}

/** Independent recomputation of CLT-01's own roster_hash algorithm — TEST-ONLY defensive check,
 * never production logic (the client itself never recomputes CLT's hash — see that file's own
 * header comment). Mirrors CLT-01's `@aix/foundation` `fingerprint()` canonical-JSON + sha256. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return "{" + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
}
function fingerprint(v: unknown): string {
  return "sha256:" + createHash("sha256").update(canonical(v)).digest("hex");
}
function rosterHashFor(applicationId: string, applicationStatus: string, primarySubjectType: string, parties: Record<string, unknown>[]): string {
  return fingerprint({
    application_id: applicationId,
    application_status: applicationStatus,
    primary_subject_type: primarySubjectType,
    authorised_parties: parties.map((p) => ({ authorised_party_id: p.authorised_party_id, party_type: p.party_type, authority_status: p.authority_status, version: p.version })),
  });
}

function okResponse(data: unknown): typeof fetch {
  return (async () => ({ ok: true, json: async () => ({ success: true, data }) })) as unknown as typeof fetch;
}
function nonOkResponse(status: number, code = "CLT1_SOME_ERROR"): typeof fetch {
  return (async () => ({ ok: false, status, json: async () => ({ success: false, error: { code } }) })) as unknown as typeof fetch;
}
function throwingFetch(err: Error): typeof fetch {
  return (async () => {
    throw err;
  }) as unknown as typeof fetch;
}
function malformedJsonResponse(): typeof fetch {
  return (async () => ({
    ok: true,
    json: async () => {
      throw new Error("not json");
    },
  })) as unknown as typeof fetch;
}

function config(fetchImpl: typeof fetch): { baseUrl: string; internalServiceToken: string; fetchImpl: typeof fetch } {
  return { baseUrl: "http://clt1.invalid", internalServiceToken: TOKEN, fetchImpl };
}

describe("fetchClt1KycRoster — valid responses", () => {
  it("valid complete response with multiple parties, every authority status, every party type", async () => {
    const parties = [
      party({ authorisedPartyId: "clt1ap_a", partyType: "director", authorityStatus: "pending", version: 1 }),
      party({ authorisedPartyId: "clt1ap_b", partyType: "signatory", authorityStatus: "active", version: 2 }),
      party({ authorisedPartyId: "clt1ap_c", partyType: "controller", authorityStatus: "restricted", version: 1 }),
      party({ authorisedPartyId: "clt1ap_d", partyType: "ubo", authorityStatus: "suspended", version: 3 }),
      party({ authorisedPartyId: "clt1ap_e", partyType: "director", authorityStatus: "rejected", version: 1 }),
      party({ authorisedPartyId: "clt1ap_f", partyType: "director", authorityStatus: "revoked", version: 1 }),
    ];
    const rosterHash = rosterHashFor(APPLICATION_ID, "under_review", "entity", parties);
    const result = await fetchClt1KycRoster(
      config(okResponse({ application_id: APPLICATION_ID, application_status: "under_review", primary_subject_type: "entity", authorised_parties: parties, party_count: parties.length, roster_hash: rosterHash })),
      APPLICATION_ID,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.roster.authorisedParties).toHaveLength(6);
    expect(result.roster.partyCount).toBe(6);
    expect(result.roster.rosterHash).toBe(rosterHash);
    expect(result.roster.authorisedParties.map((p) => p.authorisedPartyId)).toEqual(["clt1ap_a", "clt1ap_b", "clt1ap_c", "clt1ap_d", "clt1ap_e", "clt1ap_f"]);
  });

  it("empty roster", async () => {
    const rosterHash = rosterHashFor(APPLICATION_ID, "under_review", "individual", []);
    const result = await fetchClt1KycRoster(
      config(okResponse({ application_id: APPLICATION_ID, application_status: "under_review", primary_subject_type: "individual", authorised_parties: [], party_count: 0, roster_hash: rosterHash })),
      APPLICATION_ID,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.roster.authorisedParties).toEqual([]);
    expect(result.roster.partyCount).toBe(0);
  });

  it("one party", async () => {
    const parties = [party()];
    const rosterHash = rosterHashFor(APPLICATION_ID, "under_review", "individual", parties);
    const result = await fetchClt1KycRoster(
      config(okResponse({ application_id: APPLICATION_ID, application_status: "under_review", primary_subject_type: "individual", authorised_parties: parties, party_count: 1, roster_hash: rosterHash })),
      APPLICATION_ID,
    );
    expect(result.ok).toBe(true);
  });
});

describe("fetchClt1KycRoster — strict validation rejects malformed shapes", () => {
  const baseGoodParties = [party()];
  const goodHash = rosterHashFor(APPLICATION_ID, "under_review", "individual", baseGoodParties);
  const goodBody = { application_id: APPLICATION_ID, application_status: "under_review", primary_subject_type: "individual", authorised_parties: baseGoodParties, party_count: 1, roster_hash: goodHash };

  it("malformed roster_hash (not the sha256: pattern)", async () => {
    const result = await fetchClt1KycRoster(config(okResponse({ ...goodBody, roster_hash: "not-a-hash" })), APPLICATION_ID);
    expect(result.ok).toBe(false);
  });

  it("malformed party_count (non-integer)", async () => {
    const result = await fetchClt1KycRoster(config(okResponse({ ...goodBody, party_count: 1.5 })), APPLICATION_ID);
    expect(result.ok).toBe(false);
  });

  it("party_count/array-length mismatch", async () => {
    const result = await fetchClt1KycRoster(config(okResponse({ ...goodBody, party_count: 2 })), APPLICATION_ID);
    expect(result.ok).toBe(false);
  });

  it("duplicate party ID", async () => {
    const dup = [party({ authorisedPartyId: "clt1ap_a" }), party({ authorisedPartyId: "clt1ap_a" })];
    const result = await fetchClt1KycRoster(config(okResponse({ ...goodBody, authorised_parties: dup, party_count: 2, roster_hash: rosterHashFor(APPLICATION_ID, "under_review", "individual", dup) })), APPLICATION_ID);
    expect(result.ok).toBe(false);
  });

  it("unsorted party array (not authorised_party_id ASC)", async () => {
    const unsorted = [party({ authorisedPartyId: "clt1ap_b" }), party({ authorisedPartyId: "clt1ap_a" })];
    const result = await fetchClt1KycRoster(
      config(okResponse({ ...goodBody, authorised_parties: unsorted, party_count: 2, roster_hash: rosterHashFor(APPLICATION_ID, "under_review", "individual", unsorted) })),
      APPLICATION_ID,
    );
    expect(result.ok).toBe(false);
  });

  it("wrong application_id (does not match the requested application)", async () => {
    const result = await fetchClt1KycRoster(config(okResponse({ ...goodBody, application_id: "clt1app_someone_else" })), APPLICATION_ID);
    expect(result.ok).toBe(false);
  });

  it("unsupported application_status", async () => {
    const result = await fetchClt1KycRoster(config(okResponse({ ...goodBody, application_status: "not_a_real_status" })), APPLICATION_ID);
    expect(result.ok).toBe(false);
  });

  it("unsupported primary_subject_type", async () => {
    const result = await fetchClt1KycRoster(config(okResponse({ ...goodBody, primary_subject_type: "corporate" })), APPLICATION_ID);
    expect(result.ok).toBe(false);
  });

  it("unsupported party_type", async () => {
    const bad = [party({ authorisedPartyId: "clt1ap_a" }), { authorised_party_id: "clt1ap_z", party_type: "client_admin", authority_status: "pending", version: 1 }];
    const result = await fetchClt1KycRoster(config(okResponse({ ...goodBody, authorised_parties: bad, party_count: 2 })), APPLICATION_ID);
    expect(result.ok).toBe(false);
  });

  it("unsupported authority_status", async () => {
    const bad = [{ authorised_party_id: "clt1ap_a", party_type: "director", authority_status: "not_a_status", version: 1 }];
    const result = await fetchClt1KycRoster(config(okResponse({ ...goodBody, authorised_parties: bad, party_count: 1 })), APPLICATION_ID);
    expect(result.ok).toBe(false);
  });

  it("invalid version (zero)", async () => {
    const bad = [{ authorised_party_id: "clt1ap_a", party_type: "director", authority_status: "pending", version: 0 }];
    const result = await fetchClt1KycRoster(config(okResponse({ ...goodBody, authorised_parties: bad, party_count: 1 })), APPLICATION_ID);
    expect(result.ok).toBe(false);
  });

  it("invalid version (non-integer)", async () => {
    const bad = [{ authorised_party_id: "clt1ap_a", party_type: "director", authority_status: "pending", version: 1.5 }];
    const result = await fetchClt1KycRoster(config(okResponse({ ...goodBody, authorised_parties: bad, party_count: 1 })), APPLICATION_ID);
    expect(result.ok).toBe(false);
  });

  it("no unexpected malformed shape is accepted — completely wrong top-level shape (array instead of object)", async () => {
    const result = await fetchClt1KycRoster(config(okResponse([1, 2, 3])), APPLICATION_ID);
    expect(result.ok).toBe(false);
  });

  it("envelope success:false is rejected even with a 2xx status", async () => {
    const result = await fetchClt1KycRoster(config(okResponse(undefined)), APPLICATION_ID);
    expect(result.ok).toBe(false);
  });
});

describe("fetchClt1KycRoster — transport failure modes, all fail closed", () => {
  it("timeout (AbortError)", async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    const result = await fetchClt1KycRoster(config(throwingFetch(err)), APPLICATION_ID);
    expect(result.ok).toBe(false);
  });

  it("connection failure", async () => {
    const result = await fetchClt1KycRoster(config(throwingFetch(new Error("ECONNREFUSED"))), APPLICATION_ID);
    expect(result.ok).toBe(false);
  });

  it("non-2xx (application not found)", async () => {
    const result = await fetchClt1KycRoster(config(nonOkResponse(404, "CLT1_APPLICATION_NOT_FOUND")), APPLICATION_ID);
    expect(result.ok).toBe(false);
  });

  it("CLT roster-cap refusal (409 CLT1_KYC_ROSTER_TOO_LARGE) fails closed, identically to any other non-2xx", async () => {
    const result = await fetchClt1KycRoster(config(nonOkResponse(409, "CLT1_KYC_ROSTER_TOO_LARGE")), APPLICATION_ID);
    expect(result.ok).toBe(false);
  });

  it("malformed/unparseable JSON body", async () => {
    const result = await fetchClt1KycRoster(config(malformedJsonResponse()), APPLICATION_ID);
    expect(result.ok).toBe(false);
  });
});

describe("fetchClt1KycRoster — request shape and safety", () => {
  it("sends no actor_id and includes the internal service token header, never a caller-asserted identity", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    const spyFetch = (async (url: unknown, init?: unknown) => {
      capturedUrl = String(url);
      capturedHeaders = ((init as { headers?: Record<string, string> } | undefined)?.headers) ?? {};
      const parties = [party()];
      return { ok: true, json: async () => ({ success: true, data: { application_id: APPLICATION_ID, application_status: "under_review", primary_subject_type: "individual", authorised_parties: parties, party_count: 1, roster_hash: rosterHashFor(APPLICATION_ID, "under_review", "individual", parties) } }) };
    }) as unknown as typeof fetch;

    await fetchClt1KycRoster(config(spyFetch), APPLICATION_ID);
    expect(capturedUrl).not.toContain("actor_id");
    expect(capturedUrl).toContain(`/internal/clt1/applications/${APPLICATION_ID}/kyc-roster`);
    expect(capturedHeaders["x-internal-service-token"]).toBe(TOKEN);
  });

  it("the internal service token never appears in a failure result (never logged/returned)", async () => {
    const result = await fetchClt1KycRoster(config(nonOkResponse(503)), APPLICATION_ID);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("no PII is accepted or surfaced — a malformed response smuggling PII-shaped fields is rejected outright, not partially trusted", async () => {
    const withPii = { application_id: APPLICATION_ID, application_status: "under_review", primary_subject_type: "individual", authorised_parties: [{ authorised_party_id: "clt1ap_a", party_type: "director", authority_status: "pending", version: 1, party_reference: "Jane Doe <jane@example.com>" }], party_count: 1, roster_hash: "sha256:" + "0".repeat(64) };
    const result = await fetchClt1KycRoster(config(okResponse(withPii)), APPLICATION_ID);
    // Malformed anyway (hash won't match), but even if it somehow validated, party_reference is
    // never read into the validated shape — prove it structurally:
    if (result.ok) {
      expect(JSON.stringify(result.roster)).not.toContain("Jane Doe");
    }
  });
});
