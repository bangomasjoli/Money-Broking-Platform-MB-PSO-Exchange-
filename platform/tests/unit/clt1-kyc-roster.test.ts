/**
 * CLT-01 Phase 4A — pure KYC-roster contract unit coverage
 * (services/clt1/src/lib/kyc-roster.ts), no DB required.
 *
 * Everything the roster hash promises is provable here without a database: determinism,
 * insertion-order independence, sensitivity to every hashed field, INsensitivity to everything
 * deliberately excluded (timestamps, request_id/correlation_id, party_count, PII), the
 * primary-subject mapping, the duplicate-`authorised_party_id` malformed-state rejection, and the
 * complete-or-error cap. The route-level behaviour (auth posture, application lookup, the
 * chronological-inversion regression) lives in tests/integration/clt1-db.test.ts.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AppError } from "@aix/foundation";
import {
  KYC_ROSTER_MAX_PARTIES,
  assertRosterWithinCap,
  buildKycRosterResponse,
  canonicaliseRosterParties,
  codePointCompare,
  computeRosterHash,
  primarySubjectTypeForApplicantType,
  type KycRosterParty,
} from "../../services/clt1/src/lib/kyc-roster.js";
import { Clt1Error } from "../../services/clt1/src/lib/errors.js";

function party(id: string, overrides: Partial<KycRosterParty> = {}): KycRosterParty {
  return { authorised_party_id: id, party_type: "director", authority_status: "pending", version: 1, ...overrides };
}

const BASE = {
  application_id: "clt1app_1",
  application_status: "under_review",
  applicant_type: "corporate" as const,
  parties: [party("clt1ap_b"), party("clt1ap_a"), party("clt1ap_c")],
};

describe("primarySubjectTypeForApplicantType", () => {
  it("maps individual -> individual", () => {
    expect(primarySubjectTypeForApplicantType("individual")).toBe("individual");
  });

  it("maps corporate -> entity", () => {
    expect(primarySubjectTypeForApplicantType("corporate")).toBe("entity");
  });

  it("maps institutional -> entity", () => {
    expect(primarySubjectTypeForApplicantType("institutional")).toBe("entity");
  });
});

describe("codePointCompare (CFG-01 F-1 lesson: locale-independent ordering)", () => {
  it("orders by code unit, not by locale collation — uppercase sorts before lowercase", () => {
    // Under many ICU locales `localeCompare` returns "a" < "B"; codepoint ordering does not.
    expect(codePointCompare("B", "a")).toBe(-1);
    expect("B".localeCompare("a")).toBe(1);
  });

  it("is a total order on distinct values and returns 0 only for equality", () => {
    expect(codePointCompare("clt1ap_a", "clt1ap_b")).toBe(-1);
    expect(codePointCompare("clt1ap_b", "clt1ap_a")).toBe(1);
    expect(codePointCompare("clt1ap_a", "clt1ap_a")).toBe(0);
  });
});

describe("canonicaliseRosterParties", () => {
  it("sorts by authorised_party_id ASC regardless of input order", () => {
    const sorted = canonicaliseRosterParties([party("clt1ap_c"), party("clt1ap_a"), party("clt1ap_b")]);
    expect(sorted.map((p) => p.authorised_party_id)).toEqual(["clt1ap_a", "clt1ap_b", "clt1ap_c"]);
  });

  it("does not mutate the caller's array", () => {
    const input = [party("clt1ap_c"), party("clt1ap_a")];
    canonicaliseRosterParties(input);
    expect(input.map((p) => p.authorised_party_id)).toEqual(["clt1ap_c", "clt1ap_a"]);
  });

  it("accepts an empty roster", () => {
    expect(canonicaliseRosterParties([])).toEqual([]);
  });

  it("rejects a duplicate authorised_party_id as malformed internal state (500 INTERNAL_ERROR, not a 4xx)", () => {
    expect(() => canonicaliseRosterParties([party("clt1ap_a"), party("clt1ap_a", { version: 2 })])).toThrowError(AppError);
    try {
      canonicaliseRosterParties([party("clt1ap_a"), party("clt1ap_a", { version: 2 })]);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as AppError).code).toBe("INTERNAL_ERROR");
      expect((e as AppError).http).toBe(500);
    }
  });

  it("detects duplicates that are not adjacent in the INPUT order (the sort runs first)", () => {
    expect(() => canonicaliseRosterParties([party("clt1ap_a"), party("clt1ap_z"), party("clt1ap_a")])).toThrowError(AppError);
  });
});

describe("assertRosterWithinCap (complete-or-error, never truncate)", () => {
  it("KYC_ROSTER_MAX_PARTIES is 500", () => {
    expect(KYC_ROSTER_MAX_PARTIES).toBe(500);
  });

  it("permits exactly the cap", () => {
    expect(() => assertRosterWithinCap(KYC_ROSTER_MAX_PARTIES)).not.toThrow();
  });

  it("refuses one over the cap", () => {
    expect(() => assertRosterWithinCap(KYC_ROSTER_MAX_PARTIES + 1)).toThrowError(Clt1Error);
  });

  it("the refusal is CLT1_KYC_ROSTER_TOO_LARGE (409) — a dedicated code, no longer CLT1_APPLICATION_INVALID_STATE", () => {
    try {
      assertRosterWithinCap(KYC_ROSTER_MAX_PARTIES + 1);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Clt1Error).code).toBe("CLT1_KYC_ROSTER_TOO_LARGE");
      expect((e as Clt1Error).code).not.toBe("CLT1_APPLICATION_INVALID_STATE");
      expect((e as Clt1Error).http).toBe(409);
    }
  });

  it("the catalogue message concerns roster size, not application status", () => {
    try {
      assertRosterWithinCap(KYC_ROSTER_MAX_PARTIES + 1);
      throw new Error("should have thrown");
    } catch (e) {
      const message = (e as Clt1Error).message.toLowerCase();
      expect(message).toContain("roster");
      expect(message).not.toContain("status");
      expect(message).not.toContain("application's current status");
    }
  });

  it("details are bounded, non-PII diagnostics — reason_code/maximum_party_count/observed_at_least only, never the exact database row count", () => {
    try {
      assertRosterWithinCap(KYC_ROSTER_MAX_PARTIES + 1);
      throw new Error("should have thrown");
    } catch (e) {
      const detail = (e as Clt1Error).details[0];
      expect(detail?.field).toBe("authorised_parties");
      expect(detail?.issue).toContain("reason_code=roster_too_large");
      expect(detail?.issue).toContain(`maximum_party_count=${KYC_ROSTER_MAX_PARTIES}`);
      expect(detail?.issue).toContain(`observed_at_least=${KYC_ROSTER_MAX_PARTIES + 1}`);
    }
  });

  it("observed_at_least is fixed at the cap+1 floor, not the caller's own partyCount — a much larger count still reports the same bounded floor", () => {
    try {
      assertRosterWithinCap(999999);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Clt1Error).details[0]?.issue).toContain(`observed_at_least=${KYC_ROSTER_MAX_PARTIES + 1}`);
      expect((e as Clt1Error).details[0]?.issue).not.toContain("999999");
    }
  });
});

describe("computeRosterHash", () => {
  const base = {
    application_id: "clt1app_1",
    application_status: "under_review",
    primary_subject_type: "entity" as const,
    parties: [party("clt1ap_a"), party("clt1ap_b")],
  };

  it("is a sha256: fingerprint", () => {
    expect(computeRosterHash(base)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("is deterministic — the same semantic roster always yields the same hash", () => {
    expect(computeRosterHash(base)).toBe(computeRosterHash({ ...base, parties: [party("clt1ap_a"), party("clt1ap_b")] }));
  });

  it("changes when a party is ADDED", () => {
    expect(computeRosterHash({ ...base, parties: [...base.parties, party("clt1ap_c")] })).not.toBe(computeRosterHash(base));
  });

  it("changes when a party is REMOVED", () => {
    expect(computeRosterHash({ ...base, parties: [party("clt1ap_a")] })).not.toBe(computeRosterHash(base));
  });

  it("changes when authority_status changes", () => {
    expect(computeRosterHash({ ...base, parties: [party("clt1ap_a", { authority_status: "active" }), party("clt1ap_b")] })).not.toBe(computeRosterHash(base));
  });

  it("changes when party_type changes", () => {
    expect(computeRosterHash({ ...base, parties: [party("clt1ap_a", { party_type: "ubo" }), party("clt1ap_b")] })).not.toBe(computeRosterHash(base));
  });

  it("changes when a party's version increments (an in-place amendment that alters neither membership nor status)", () => {
    expect(computeRosterHash({ ...base, parties: [party("clt1ap_a", { version: 2 }), party("clt1ap_b")] })).not.toBe(computeRosterHash(base));
  });

  it("changes when application_status changes", () => {
    expect(computeRosterHash({ ...base, application_status: "approved" })).not.toBe(computeRosterHash(base));
  });

  it("changes when primary_subject_type changes", () => {
    expect(computeRosterHash({ ...base, primary_subject_type: "individual" })).not.toBe(computeRosterHash(base));
  });

  it("changes when application_id changes", () => {
    expect(computeRosterHash({ ...base, application_id: "clt1app_2" })).not.toBe(computeRosterHash(base));
  });

  it("depends on ARRAY ORDER — which is why the input must already be canonicalised (this is the guard the sort exists for, not a defect)", () => {
    expect(computeRosterHash({ ...base, parties: [party("clt1ap_b"), party("clt1ap_a")] })).not.toBe(computeRosterHash(base));
  });

  it("ignores any field not in the declared hash input (party_reference/ownership_percentage/timestamps cannot influence it)", () => {
    const contaminated = base.parties.map((p) => ({
      ...p,
      party_reference: "Jane Doe",
      ownership_percentage: "51.00",
      created_at_utc: "2026-01-01T00:00:00.000Z",
      updated_at_utc: "2026-07-01T00:00:00.000Z",
    })) as unknown as KycRosterParty[];
    expect(computeRosterHash({ ...base, parties: contaminated })).toBe(computeRosterHash(base));
  });
});

describe("buildKycRosterResponse", () => {
  it("returns EXACTLY the six approved top-level fields, no more, no less", () => {
    const res = buildKycRosterResponse(BASE);
    expect(Object.keys(res).sort()).toEqual(
      ["application_id", "application_status", "authorised_parties", "party_count", "primary_subject_type", "roster_hash"].sort(),
    );
  });

  it("returns EXACTLY the four approved per-party fields — party_reference/ownership_percentage/screening columns are structurally absent", () => {
    const res = buildKycRosterResponse(BASE);
    for (const p of res.authorised_parties) {
      expect(Object.keys(p).sort()).toEqual(["authorised_party_id", "authority_status", "party_type", "version"].sort());
    }
  });

  it("never emits applicant_type (primary_subject_type is the single resolved value that crosses the boundary)", () => {
    expect(JSON.stringify(buildKycRosterResponse(BASE))).not.toContain("applicant_type");
    expect(JSON.stringify(buildKycRosterResponse(BASE))).not.toContain("corporate");
  });

  it("returns parties in authorised_party_id ASC order", () => {
    expect(buildKycRosterResponse(BASE).authorised_parties.map((p) => p.authorised_party_id)).toEqual(["clt1ap_a", "clt1ap_b", "clt1ap_c"]);
  });

  it("party_count equals the COMPLETE returned array length", () => {
    const res = buildKycRosterResponse(BASE);
    expect(res.party_count).toBe(3);
    expect(res.party_count).toBe(res.authorised_parties.length);
  });

  it("insertion order does not affect roster_hash (the canonical sort runs before the hash)", () => {
    const shuffled = { ...BASE, parties: [BASE.parties[2]!, BASE.parties[0]!, BASE.parties[1]!] };
    expect(buildKycRosterResponse(shuffled).roster_hash).toBe(buildKycRosterResponse(BASE).roster_hash);
  });

  it("handles an empty roster — a real hash over a real empty roster, not a null/sentinel", () => {
    const res = buildKycRosterResponse({ ...BASE, parties: [] });
    expect(res.authorised_parties).toEqual([]);
    expect(res.party_count).toBe(0);
    expect(res.roster_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    // An empty roster is NOT the same state as a one-party roster.
    expect(res.roster_hash).not.toBe(buildKycRosterResponse({ ...BASE, parties: [party("clt1ap_a")] }).roster_hash);
  });

  it("returns every authority_status unfiltered — CLT-01 reports facts, KYC-01 decides which statuses are required", () => {
    const all = ["pending", "active", "restricted", "rejected", "revoked", "suspended"] as const;
    const res = buildKycRosterResponse({
      ...BASE,
      parties: all.map((s, i) => party(`clt1ap_${i}`, { authority_status: s })),
    });
    expect(res.party_count).toBe(6);
    expect(res.authorised_parties.map((p) => p.authority_status).sort()).toEqual([...all].sort());
  });

  it("returns every party_type unfiltered, including 'ubo' (roster COVERAGE of a UBO needs no UBO look-through engine)", () => {
    const types = ["signatory", "director", "controller", "ubo"] as const;
    const res = buildKycRosterResponse({ ...BASE, parties: types.map((t, i) => party(`clt1ap_${i}`, { party_type: t })) });
    expect(res.authorised_parties.map((p) => p.party_type).sort()).toEqual([...types].sort());
  });

  it("accepts exactly KYC_ROSTER_MAX_PARTIES parties", () => {
    const parties = Array.from({ length: KYC_ROSTER_MAX_PARTIES }, (_, i) => party(`clt1ap_${String(i).padStart(4, "0")}`));
    const res = buildKycRosterResponse({ ...BASE, parties });
    expect(res.party_count).toBe(KYC_ROSTER_MAX_PARTIES);
    expect(res.authorised_parties).toHaveLength(KYC_ROSTER_MAX_PARTIES);
  });

  it("refuses KYC_ROSTER_MAX_PARTIES + 1 with CLT1_KYC_ROSTER_TOO_LARGE — and refuses BEFORE any hash is computed (no partial roster, no partial hash)", () => {
    const parties = Array.from({ length: KYC_ROSTER_MAX_PARTIES + 1 }, (_, i) => party(`clt1ap_${String(i).padStart(4, "0")}`));
    try {
      buildKycRosterResponse({ ...BASE, parties });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Clt1Error).code).toBe("CLT1_KYC_ROSTER_TOO_LARGE");
    }
  });

  it("individual applicant -> individual primary_subject_type, and that choice is bound into the hash", () => {
    const asIndividual = buildKycRosterResponse({ ...BASE, applicant_type: "individual" });
    expect(asIndividual.primary_subject_type).toBe("individual");
    expect(asIndividual.roster_hash).not.toBe(buildKycRosterResponse(BASE).roster_hash);
  });

  it("corporate and institutional produce the SAME primary_subject_type and therefore the SAME hash", () => {
    expect(buildKycRosterResponse({ ...BASE, applicant_type: "institutional" }).roster_hash).toBe(buildKycRosterResponse({ ...BASE, applicant_type: "corporate" }).roster_hash);
  });
});

describe("CLT1_KYC_ROSTER_TOO_LARGE has exactly one reachable throw site (static source sweep)", () => {
  function findTsFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return findTsFiles(full);
      return entry.name.endsWith(".ts") ? [full] : [];
    });
  }

  it("appears only in lib/errors.ts (catalogue definition) and lib/kyc-roster.ts (its own throw site) — no other CLT-01 route accidentally uses it", () => {
    const srcDir = join(__dirname, "..", "..", "services", "clt1", "src");
    const hits = findTsFiles(srcDir)
      .filter((f) => readFileSync(f, "utf8").includes("CLT1_KYC_ROSTER_TOO_LARGE"))
      .map((f) => f.slice(srcDir.length + 1));
    expect(hits.sort()).toEqual(["lib/errors.ts", "lib/kyc-roster.ts"].sort());
  });

  it("has exactly one `throw new Clt1Error(\"CLT1_KYC_ROSTER_TOO_LARGE\"` call site in the whole services/clt1/src tree", () => {
    const srcDir = join(__dirname, "..", "..", "services", "clt1", "src");
    const throwSites = findTsFiles(srcDir).flatMap((f) => {
      const content = readFileSync(f, "utf8");
      const matches = content.match(/throw new Clt1Error\("CLT1_KYC_ROSTER_TOO_LARGE"/g) ?? [];
      return matches.map(() => f);
    });
    expect(throwSites).toHaveLength(1);
    expect(throwSites[0]).toContain("lib/kyc-roster.ts");
  });
});
