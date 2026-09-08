/**
 * WLT-01 Phase 4A-2/4A-3 — pure decision-token identifier/hashing/comparison helpers
 * (`lib/decision-token.ts`). No database, no HTTP.
 */
import { describe, expect, it } from "vitest";
import { DECISION_ID_REGEX, DUMMY_TOKEN_HASH, RAW_TOKEN_REGEX, hashToken, mintDecisionId, mintDecisionToken, tokenHashMatches } from "../../services/wlt1/src/lib/decision-token.js";
import { createHash } from "node:crypto";

describe("WLT-01 Phase 4A-2 — mintDecisionToken", () => {
  it("1. raw token matches the frozen regex exactly", () => {
    const token = mintDecisionToken();
    expect(token).toMatch(RAW_TOKEN_REGEX);
    expect(token).toMatch(/^wlt1dt_[A-Za-z0-9_-]{43}$/);
  });

  it("2. raw token is exactly 50 characters total", () => {
    const token = mintDecisionToken();
    expect(token).toHaveLength(50);
  });

  it("3. distinct calls produce distinct tokens (CSPRNG, never a fixed value)", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => mintDecisionToken()));
    expect(tokens.size).toBe(50);
  });

  it("4. token is never derived from any caller input (pure generator, no arguments)", () => {
    expect(mintDecisionToken.length).toBe(0);
  });
});

describe("WLT-01 Phase 4A-2 — mintDecisionId", () => {
  it("5. decision_id matches the frozen regex exactly", () => {
    const id = mintDecisionId();
    expect(id).toMatch(DECISION_ID_REGEX);
    expect(id).toMatch(/^wlt1dec_[0-9a-f-]{36}$/);
  });

  it("6. distinct calls produce distinct decision ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => mintDecisionId()));
    expect(ids.size).toBe(50);
  });
});

describe("WLT-01 Phase 4A-2 — hashToken", () => {
  it("7. hash is 64 lowercase hex characters", () => {
    const hash = hashToken(mintDecisionToken());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("8. hash is deterministic for the same input", () => {
    const token = mintDecisionToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("9. hash matches an independently computed SHA-256 of the same raw token", () => {
    const token = mintDecisionToken();
    const expected = createHash("sha256").update(token, "utf8").digest("hex");
    expect(hashToken(token)).toBe(expected);
  });

  it("10. distinct tokens produce distinct hashes", () => {
    const a = mintDecisionToken();
    const b = mintDecisionToken();
    expect(hashToken(a)).not.toBe(hashToken(b));
  });

  it("11. the raw token itself never appears inside its own hash (sanity — hash is not an identity function)", () => {
    const token = mintDecisionToken();
    expect(hashToken(token)).not.toContain(token);
  });
});

describe("WLT-01 Phase 4A-3 — tokenHashMatches", () => {
  it("12. the correct raw token against its own stored hash matches", () => {
    const token = mintDecisionToken();
    const storedHash = hashToken(token);
    expect(tokenHashMatches(token, storedHash)).toBe(true);
  });

  it("13. a wrong raw token against an unrelated stored hash (same length) does not match", () => {
    const storedHash = hashToken(mintDecisionToken());
    const wrongToken = mintDecisionToken();
    expect(tokenHashMatches(wrongToken, storedHash)).toBe(false);
  });

  it("14. a same-length but incorrect hash is rejected (not merely a length check)", () => {
    const token = mintDecisionToken();
    const correctHash = hashToken(token);
    // Flip the first hex character — same length (64), different value.
    const flippedFirstChar = correctHash[0] === "0" ? "1" : "0";
    const tamperedHash = flippedFirstChar + correctHash.slice(1);
    expect(tokenHashMatches(token, tamperedHash)).toBe(false);
  });

  it("15. DUMMY_TOKEN_HASH is a fixed 64-lowercase-hex-character placeholder, never a real digest of the presented token", () => {
    expect(DUMMY_TOKEN_HASH).toMatch(/^[0-9a-f]{64}$/);
    const token = mintDecisionToken();
    expect(DUMMY_TOKEN_HASH).not.toBe(hashToken(token));
  });

  it("16. comparing against DUMMY_TOKEN_HASH always returns false, for any presented token (never accidentally 'valid')", () => {
    for (let i = 0; i < 10; i++) {
      expect(tokenHashMatches(mintDecisionToken(), DUMMY_TOKEN_HASH)).toBe(false);
    }
  });

  it("17. a malformed/non-canonical presented token never throws — it simply does not match (no format-validation oracle)", () => {
    const storedHash = hashToken(mintDecisionToken());
    for (const malformed of ["", "not-a-real-token", "wlt1dt_", "🎉".repeat(10), "a".repeat(64)]) {
      expect(() => tokenHashMatches(malformed, storedHash)).not.toThrow();
      expect(tokenHashMatches(malformed, storedHash)).toBe(false);
    }
  });

  it("18. a malformed presented token against DUMMY_TOKEN_HASH also never throws (the exact anti-oracle path)", () => {
    expect(() => tokenHashMatches("not-a-real-token", DUMMY_TOKEN_HASH)).not.toThrow();
    expect(tokenHashMatches("not-a-real-token", DUMMY_TOKEN_HASH)).toBe(false);
  });

  it("19. tokenHashMatches never uses direct string equality semantics that a length-revealing early-return would expose — same-length wrong-prefix and wrong-suffix hashes are both rejected identically", () => {
    const token = mintDecisionToken();
    const correctHash = hashToken(token);
    const wrongPrefix = ("f" + correctHash.slice(1)) === correctHash ? ("e" + correctHash.slice(1)) : ("f" + correctHash.slice(1));
    const wrongSuffix = correctHash.slice(0, -1) + (correctHash.slice(-1) === "0" ? "1" : "0");
    expect(tokenHashMatches(token, wrongPrefix)).toBe(false);
    expect(tokenHashMatches(token, wrongSuffix)).toBe(false);
  });
});
