/**
 * M-REV-1 CLOSURE — pure regression proof for the safe restricted-role URL derivation used
 * throughout the WLT-01 (and, after this same remediation, every other module's) DB-backed test
 * suite: `sourceUrl.replace(/^postgres:\/\/[^@]+@/, \`postgres://${role}@\`)`.
 *
 * M-REV-1 itself: the FRAGILE predecessor pattern, `sourceUrl.replace("postgres@", \`${role}@\`)`,
 * only rewrites the connection string when the literal substring `"postgres@"` appears verbatim.
 * A passwordless canonical URL (`postgres://postgres@host/db`) happens to contain that substring,
 * so the fragile form worked by coincidence for every URL this repository's tests have ever
 * actually been run against — but a password-bearing source URL (`postgres://postgres:pw@host/
 * db`) does NOT contain the literal substring `"postgres@"` (the password sits between `postgres`
 * and `@`), so the fragile `.replace()` is a silent no-op: the connection string is returned
 * UNCHANGED, and the "restricted role" pool silently keeps authenticating as the original
 * (typically superuser) identity — while every downstream "this proves least privilege" assertion
 * in that test file continues to pass, having proven nothing.
 *
 * This file is pure string-transformation testing — no database connection required — because the
 * defect and its fix live entirely in the derivation itself, independent of whether a real
 * Postgres instance is reachable.
 */
import { describe, expect, it } from "vitest";

const RESTRICTED_ROLE = "wlt1_app_test";

/** The ONE safe derivation this repository now uses everywhere (`wlt1-db.test.ts`,
 * `wlt1-poc-verify-route.test.ts`, `aml1-iam2-guard-real.test.ts`, and every other DB-backed test
 * file remediated under M-REV-1) — replaces the ENTIRE userinfo segment (`user[:password]`) up to
 * and including the first unescaped `@`, regardless of whether a password is present. */
function safeRoleUrl(sourceUrl: string, role: string): string {
  return sourceUrl.replace(/^postgres:\/\/[^@]+@/, `postgres://${role}@`);
}

/** The FRAGILE M-REV-1 predecessor pattern, reproduced here ONLY to empirically demonstrate the
 * defect this file closes — never reintroduced anywhere in the actual test suite. */
function fragileRoleUrl(sourceUrl: string, role: string): string {
  return sourceUrl.replace("postgres@", `${role}@`);
}

describe("M-REV-1 closure — safe restricted-role URL derivation", () => {
  it("safe derivation: passwordless canonical URL resolves to the restricted role", () => {
    const result = safeRoleUrl("postgres://postgres@localhost:5432/aix_platform_test", RESTRICTED_ROLE);
    expect(result).toBe(`postgres://${RESTRICTED_ROLE}@localhost:5432/aix_platform_test`);
  });

  it("safe derivation: password-bearing URL resolves to the restricted role, WITHOUT retaining postgres as the username", () => {
    const result = safeRoleUrl("postgres://postgres:postgres@localhost:5432/testdb", RESTRICTED_ROLE);
    expect(result).toBe(`postgres://${RESTRICTED_ROLE}@localhost:5432/testdb`);
    // The username must be exactly the restricted role — not "postgres", and not the password text
    // masquerading as part of the role segment.
    const userinfo = result.replace("postgres://", "").split("@")[0];
    expect(userinfo).toBe(RESTRICTED_ROLE);
    expect(userinfo).not.toContain("postgres");
  });

  it("safe derivation: URL-encoded special characters in the password are still fully stripped with the userinfo segment", () => {
    const result = safeRoleUrl("postgres://postgres:p%40ssword@localhost:5432/testdb", RESTRICTED_ROLE);
    expect(result).toBe(`postgres://${RESTRICTED_ROLE}@localhost:5432/testdb`);
    expect(result).not.toContain("p%40ssword");
    expect(result.replace("postgres://", "")).not.toContain("postgres:");
  });

  it("safe derivation: a non-default admin username (not literally 'postgres') is also fully replaced", () => {
    // Proves the fix is not merely "handle the postgres case specially" — it replaces the WHOLE
    // userinfo segment regardless of what the source username happens to be.
    const result = safeRoleUrl("postgres://admin_root:s3cr3t@db.internal:5432/aix_prod_like", RESTRICTED_ROLE);
    expect(result).toBe(`postgres://${RESTRICTED_ROLE}@db.internal:5432/aix_prod_like`);
  });

  it("NON-VACUITY: the fragile M-REV-1 predecessor pattern silently fails to rewrite a password-bearing URL (empirically reproducing the defect this closure fixes)", () => {
    // Password deliberately does NOT contain the literal substring "postgres" — isolates the
    // defect from the (separate, also-real) hazard of a password that happens to collide with the
    // search string. This is the clean "the fragile .replace() is a true no-op" case.
    const source = "postgres://postgres:s3cr3t-db-password@localhost:5432/testdb";
    const fragileResult = fragileRoleUrl(source, RESTRICTED_ROLE);
    // The fragile pattern returns the SOURCE URL COMPLETELY UNCHANGED — the literal substring
    // "postgres@" never appears in a password-bearing URL (the password sits between "postgres"
    // and "@"). A pool opened with this string would silently keep authenticating as whatever
    // identity the SOURCE URL's userinfo names — "postgres" here, i.e. the superuser — while every
    // downstream "this proves the restricted role" assertion in the calling test file would still
    // observe a connection, just the WRONG (superuser) one.
    expect(fragileResult).toBe(source);
    expect(fragileResult).not.toContain(RESTRICTED_ROLE);
    expect(fragileResult).toContain("postgres:s3cr3t-db-password@");
    // Proves the SAFE derivation genuinely differs from (and fixes) the fragile one for this exact
    // input — the two are not accidentally equivalent.
    const safeResult = safeRoleUrl(source, RESTRICTED_ROLE);
    expect(safeResult).not.toBe(fragileResult);
    expect(safeResult).toContain(RESTRICTED_ROLE);
    expect(safeResult).not.toContain("s3cr3t-db-password");
  });

  it("NON-VACUITY: a password that happens to contain 'postgres' makes the fragile pattern corrupt the credential instead of leaving it inert — still never resolving to the restricted role as the username", () => {
    // A different, subtler failure mode of the SAME fragile pattern: when the password text itself
    // contains the literal substring "postgres@" (e.g. a password equal to the admin username),
    // .replace() matches WITHIN the password rather than the intended username segment — the
    // username portion ("postgres:") is left completely untouched either way.
    const source = "postgres://postgres:postgres@localhost:5432/testdb";
    const fragileResult = fragileRoleUrl(source, RESTRICTED_ROLE);
    expect(fragileResult).toContain("postgres://postgres:");
    expect(fragileResult).not.toBe(`postgres://${RESTRICTED_ROLE}@localhost:5432/testdb`);
    const safeResult = safeRoleUrl(source, RESTRICTED_ROLE);
    expect(safeResult).toBe(`postgres://${RESTRICTED_ROLE}@localhost:5432/testdb`);
  });

  it("NON-VACUITY: the fragile pattern happens to work ONLY for the passwordless canonical form — explaining why it went undetected", () => {
    const passwordless = "postgres://postgres@localhost:5432/aix_platform_test";
    expect(fragileRoleUrl(passwordless, RESTRICTED_ROLE)).toBe(safeRoleUrl(passwordless, RESTRICTED_ROLE));
  });
});
