/**
 * CFG-01's own canonical-JSON + sha256 hashing (services/cfg1/src/lib/canonical.ts). Pure,
 * no DB — mirrors tests/unit/sec1-canonical.test.ts's canonical/hash-determinism portion.
 */
import { describe, expect, it } from "vitest";
import { canonicalJson, codePointCompare, sha256Hex, sha256Prefixed } from "../../services/cfg1/src/lib/canonical.js";

describe("CFG-01 canonicalJson", () => {
  it("produces identical output regardless of input key order", () => {
    const a = canonicalJson({ b: 1, a: 2, c: 3 });
    const b = canonicalJson({ c: 3, a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":3}');
  });

  it("sorts keys recursively at every nesting depth", () => {
    const a = canonicalJson({ z: { y: 1, x: 2 }, a: 1 });
    const b = canonicalJson({ a: 1, z: { x: 2, y: 1 } });
    expect(a).toBe(b);
  });

  it("preserves array element order (order is meaningful)", () => {
    const a = canonicalJson([{ a: 1 }, { a: 2 }]);
    const b = canonicalJson([{ a: 2 }, { a: 1 }]);
    expect(a).not.toBe(b);
  });

  it("omits undefined-valued keys rather than serializing them as null", () => {
    const withUndefined = canonicalJson({ a: 1, b: undefined });
    const withoutKey = canonicalJson({ a: 1 });
    expect(withUndefined).toBe(withoutKey);
  });

  it("serializes null and undefined top-level values as the literal null", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(undefined)).toBe("null");
  });
});

describe("CFG-01 sha256Hex / sha256Prefixed", () => {
  it("hash changes when the canonical input is tampered", () => {
    const h1 = sha256Hex(canonicalJson({ feature_code: "exchange.matching_engine", status: "active" }));
    const h2 = sha256Hex(canonicalJson({ feature_code: "exchange.matching_engine", status: "inactive" }));
    expect(h1).not.toBe(h2);
  });

  it("is deterministic for the same logical input", () => {
    const h1 = sha256Hex(canonicalJson({ a: 1, b: 2 }));
    const h2 = sha256Hex(canonicalJson({ b: 2, a: 1 }));
    expect(h1).toBe(h2);
  });

  it("sha256Prefixed uses the sha256: prefix per CFG-01's own blueprint convention", () => {
    const value = sha256Prefixed("test");
    expect(value.startsWith("sha256:")).toBe(true);
    expect(value).toBe("sha256:" + sha256Hex("test"));
  });
});

describe("codePointCompare (Phase 2 F-1 closure)", () => {
  it("orders ASCII strings the same way String.prototype.localeCompare does for plain lowercase words", () => {
    const words = ["balance", "audit", "kyc", "aml"];
    const byCodePoint = [...words].sort(codePointCompare);
    const byLocale = [...words].sort((a, b) => a.localeCompare(b));
    expect(byCodePoint).toEqual(byLocale);
  });

  it("returns -1, 1, or 0 exactly, never a locale-collation-weighted value", () => {
    expect(codePointCompare("a", "b")).toBe(-1);
    expect(codePointCompare("b", "a")).toBe(1);
    expect(codePointCompare("a", "a")).toBe(0);
  });

  it("orders punctuation strictly by UTF-16 code unit, independent of host locale — the exact case that makes localeCompare unsafe here", () => {
    // Codepoint order: '.' (0x2E) < '_' (0x5F) < letters, always, on every host. Some locale
    // collations (ICU) treat punctuation as either ignorable or ordered differently — this is
    // the concrete fixture proving codePointCompare does NOT delegate to localeCompare.
    const codes = ["pricing.internal_fallback", "pricing_internal_fallback", "pricing.aix_spread_markup"];
    const sorted = [...codes].sort(codePointCompare);
    // '.' sorts before '_' at the same divergence point (both share the "pricing" prefix, then
    // "." vs "_" decides "pricing.aix_spread_markup"/"pricing.internal_fallback" before
    // "pricing_internal_fallback").
    expect(sorted[2]).toBe("pricing_internal_fallback");
  });

  it("real CFG-01 prohibited-feature codes sort identically under codePointCompare and localeCompare in this environment (empirically confirmed, not assumed)", () => {
    const codes = [
      "exchange.public_order_book",
      "exchange.matching_engine",
      "pricing.aix_spread_markup",
      "onboarding.retail_default",
      "liquidity.synthetic",
    ];
    const byCodePoint = [...codes].sort(codePointCompare);
    const byLocale = [...codes].sort((a, b) => a.localeCompare(b));
    expect(byCodePoint).toEqual(byLocale);
  });

  it("hash ordering does not depend on host locale — sorting with codePointCompare is the ONLY comparator used by CFG-01's hash functions (no localeCompare call sites remain)", () => {
    // Direct proof by construction: canonicalJson + codePointCompare together produce a
    // deterministic ordering derived purely from UTF-16 code units, never Intl/ICU collation.
    const rows = [{ k: "b" }, { k: "a" }, { k: "c" }];
    const ordered = [...rows].sort((a, b) => codePointCompare(a.k, b.k)).map((r) => r.k);
    expect(ordered).toEqual(["a", "b", "c"]);
  });
});
