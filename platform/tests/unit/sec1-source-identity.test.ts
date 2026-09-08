/**
 * Unit tests for SEC-01's source-identity-binding resolution (constant-time hash match —
 * services/sec1/src/plugins/source-identity.ts). Pure logic against a fake binding row set —
 * no DB required.
 */
import { describe, expect, it } from "vitest";
import { matchSourceIdentity, sha256Hex } from "../../services/sec1/src/plugins/source-identity.js";

const bindings = [
  { source_module: "FND-01", token_hash: sha256Hex("fnd01-secret-token") },
  { source_module: "IAM-01", token_hash: sha256Hex("iam01-secret-token") },
  { source_module: "IAM-02", token_hash: sha256Hex("iam02-secret-token") },
];

describe("matchSourceIdentity", () => {
  it("resolves the correct source_module for a valid token", () => {
    expect(matchSourceIdentity("fnd01-secret-token", bindings)).toBe("FND-01");
    expect(matchSourceIdentity("iam01-secret-token", bindings)).toBe("IAM-01");
    expect(matchSourceIdentity("iam02-secret-token", bindings)).toBe("IAM-02");
  });

  it("returns null for a token that matches no binding", () => {
    expect(matchSourceIdentity("not-a-real-token", bindings)).toBeNull();
  });

  it("returns null for an empty binding set", () => {
    expect(matchSourceIdentity("fnd01-secret-token", [])).toBeNull();
  });

  it("does not match a different module's token to the wrong module", () => {
    // Sanity: presenting IAM-01's token must resolve to IAM-01, never FND-01/IAM-02.
    const resolved = matchSourceIdentity("iam01-secret-token", bindings);
    expect(resolved).not.toBe("FND-01");
    expect(resolved).not.toBe("IAM-02");
  });
});
