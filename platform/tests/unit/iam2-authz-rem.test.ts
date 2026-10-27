/**
 * IAM02-AUTHZ-REM-001 — unit tests (no database): human-checker eligibility (AZ-16, AZ-19;
 * T-46, T-47, T-52, T-53), unforgeable step-up evidence (T-14), the token wrapper's database
 * user scoping and conditional single-use consumption (T-36 unit leg, T-54), bootstrap
 * isolation (AZ-20, T-50) and the parallel error catalogue (AZ-11).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { createRequestContext, runWithContext } from "@aix/foundation";
import {
  approvalStepUpPurpose,
  isVerifiedStepUp,
  requireEligibleHumanChecker,
  verifyApproverStepUp,
  verifyStepUpAssertion,
  type VerifyStepUpAssertionResult,
} from "../../services/iam2/src/lib/iam01-client.js";
import { verifyAndConsumeForExecution, verifyAndConsumeDecisionToken, sha256Hex } from "../../services/iam2/src/lib/decision-token.js";
import { IAM2_ERROR_CODES, Iam2Error } from "../../services/iam2/src/lib/errors.js";

const NOW = Date.parse("2026-10-22T12:00:00.000Z");
const FUTURE = new Date(NOW + 600_000).toISOString();
const APPROVER = "user_approver_1";

function ok(over: Partial<Extract<VerifyStepUpAssertionResult, { valid: true }>> = {}): VerifyStepUpAssertionResult {
  return { valid: true, userId: APPROVER, authLevel: "mfa", freshUntilUtc: FUTURE, userType: "staff", userClass: "staff", userStatus: "active", ...over };
}
const check = (v: VerifyStepUpAssertionResult) => requireEligibleHumanChecker(v, { approverUserId: APPROVER, nowMs: NOW });

describe("requireEligibleHumanChecker (AZ-16 (i)-(v); owner OD-1 Option A + clarification 2)", () => {
  it("accepts staff/staff, admin/admin and BOTH mixed pairs with an active status", () => {
    for (const [t, c] of [["staff", "staff"], ["admin", "admin"], ["staff", "admin"], ["admin", "staff"]] as const) {
      expect(check(ok({ userType: t, userClass: c })), `${t}/${c}`).toEqual({ ok: true });
    }
  });

  it("(iv) service in EITHER field is the Critical blocked outcome — even when the other field is missing", () => {
    for (const over of [{ userType: "service" }, { userClass: "service" }, { userType: "service", userClass: "service" }, { userType: "service", userClass: undefined }, { userType: undefined, userClass: "service" }, { userType: "service", userStatus: "suspended" }]) {
      expect(check(ok(over as never)), JSON.stringify(over)).toMatchObject({ ok: false, code: "IAM2_SERVICE_ACCOUNT_APPROVER_BLOCKED" });
    }
  });

  it("(iv) client classes, unknown values and mixed eligible/ineligible pairs are not eligible", () => {
    for (const over of [
      { userType: "client" },
      { userClass: "client" },
      { userClass: "client_approver" },
      { userType: "client", userClass: "client_approver" },
      { userType: "admin", userClass: "client" },
      { userType: "client", userClass: "admin" },
      { userType: "wizard" },
      { userClass: "wizard" },
      { userType: "Staff" },
      { userClass: "ADMIN" },
    ]) {
      expect(check(ok(over)), JSON.stringify(over)).toMatchObject({ ok: false, code: "IAM2_APPROVER_NOT_ELIGIBLE" });
    }
  });

  it("(iv)/(v) missing, null, empty, non-string values fail closed (no default is assumed)", () => {
    for (const over of [
      { userType: undefined },
      { userClass: undefined },
      { userStatus: undefined },
      { userType: null },
      { userClass: null },
      { userStatus: null },
      { userType: "" },
      { userClass: "" },
      { userType: 1 },
      { userClass: ["staff"] },
      { userStatus: true },
    ]) {
      expect(check(ok(over as never)), JSON.stringify(over)).toMatchObject({ ok: false, code: "IAM2_APPROVER_NOT_ELIGIBLE" });
    }
  });

  it("(v) any status other than exactly 'active' is refused", () => {
    for (const status of ["suspended", "locked", "deactivated", "ACTIVE", "Active", "active ", "", "pending"]) {
      expect(check(ok({ userStatus: status })), status).toMatchObject({ ok: false, code: "IAM2_APPROVER_NOT_ELIGIBLE" });
    }
  });

  it("(i)/(ii)/(iii) invalid assertion, another user's assertion, missing auth level and missing/stale/unparseable freshness are STEP_UP_INVALID", () => {
    expect(check({ valid: false })).toMatchObject({ ok: false, code: "IAM2_STEP_UP_INVALID" });
    expect(check(ok({ userId: "someone_else" }))).toMatchObject({ ok: false, code: "IAM2_STEP_UP_INVALID" });
    expect(check(ok({ userId: "" }))).toMatchObject({ ok: false, code: "IAM2_STEP_UP_INVALID" });
    expect(check(ok({ authLevel: "" }))).toMatchObject({ ok: false, code: "IAM2_STEP_UP_INVALID" });
    for (const fresh of [undefined, "", "not-a-date", new Date(NOW - 1).toISOString(), new Date(NOW).toISOString()]) {
      expect(check(ok({ freshUntilUtc: fresh as never })), String(fresh)).toMatchObject({ ok: false, code: "IAM2_STEP_UP_INVALID" });
    }
  });
});

describe("verifyApproverStepUp / VerifiedStepUp (AZ-05, AZ-19; T-14, T-53)", () => {
  const config = (body: unknown, httpOk = true) => ({
    baseUrl: "http://iam01.invalid",
    internalServiceToken: "t",
    fetchImpl: (async () => ({ ok: httpOk, json: async () => body })) as unknown as typeof fetch,
  });
  const goodBody = { success: true, data: { valid: true, user_id: APPROVER, auth_level: "mfa", fresh_until_utc: FUTURE, user_type: "staff", user_class: "admin", user_status: "active" } };

  it("mints a registry-tracked VerifiedStepUp only for an eligible approver and asks IAM-01 for the approval-specific purpose", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const cfg = { ...config(goodBody), fetchImpl: (async (_u: unknown, init: { body: string }) => {
      calls.push(JSON.parse(init.body));
      return { ok: true, json: async () => goodBody };
    }) as unknown as typeof fetch };
    const result = await verifyApproverStepUp(cfg, { recentAuthAssertion: "a", approverUserId: APPROVER, approvalId: "appr_1", nowMs: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls[0]!.required_purpose).toBe(approvalStepUpPurpose("appr_1"));
    expect(calls[0]!.required_purpose).toBe("iam2_approval:appr_1");
    expect(isVerifiedStepUp(result.stepUp)).toBe(true);
    expect(result.stepUp).toMatchObject({ userId: APPROVER, purpose: "iam2_approval:appr_1", userType: "staff", userClass: "admin", userStatus: "active" });
    expect(Object.isFrozen(result.stepUp)).toBe(true);
  });

  it("a structural clone, a spread copy, null and primitives are NOT VerifiedStepUp evidence", async () => {
    const result = await verifyApproverStepUp(config(goodBody), { recentAuthAssertion: "a", approverUserId: APPROVER, approvalId: "appr_1", nowMs: NOW });
    if (!result.ok) throw new Error("expected ok");
    expect(isVerifiedStepUp({ ...result.stepUp })).toBe(false);
    expect(isVerifiedStepUp(JSON.parse(JSON.stringify(result.stepUp)))).toBe(false);
    for (const v of [null, undefined, 1, "x", {}, []]) expect(isVerifiedStepUp(v)).toBe(false);
  });

  it("an older IAM-01 (no identity fields), a non-2xx, a malformed body and a thrown fetch all fail closed", async () => {
    const older = { success: true, data: { valid: true, user_id: APPROVER, auth_level: "mfa", fresh_until_utc: FUTURE } };
    expect(await verifyApproverStepUp(config(older), { recentAuthAssertion: "a", approverUserId: APPROVER, approvalId: "x", nowMs: NOW })).toMatchObject({ ok: false, code: "IAM2_APPROVER_NOT_ELIGIBLE" });
    expect(await verifyApproverStepUp(config({}, false), { recentAuthAssertion: "a", approverUserId: APPROVER, approvalId: "x", nowMs: NOW })).toMatchObject({ ok: false, code: "IAM2_STEP_UP_INVALID" });
    expect(await verifyApproverStepUp(config("not-json-object"), { recentAuthAssertion: "a", approverUserId: APPROVER, approvalId: "x", nowMs: NOW })).toMatchObject({ ok: false, code: "IAM2_STEP_UP_INVALID" });
    const throwing = { baseUrl: "x", internalServiceToken: "t", fetchImpl: (async () => { throw new Error("boom"); }) as unknown as typeof fetch };
    expect(await verifyApproverStepUp(throwing, { recentAuthAssertion: "a", approverUserId: APPROVER, approvalId: "x", nowMs: NOW })).toMatchObject({ ok: false, code: "IAM2_STEP_UP_INVALID" });
  });

  it("AZ-20 / T-50: the low-level verifyStepUpAssertion stays backward compatible (no identity fields required) so bootstrap is unaffected", async () => {
    const older = { success: true, data: { valid: true, user_id: "u", auth_level: "mfa", fresh_until_utc: FUTURE } };
    const r = await verifyStepUpAssertion(config(older), { recentAuthAssertion: "a", requiredPurpose: "p" });
    expect(r).toMatchObject({ valid: true, userId: "u", authLevel: "mfa" });
    const bootstrapSource = readFileSync(resolve(__dirname, "../../services/iam2/src/routes/bootstrap.ts"), "utf8");
    expect(bootstrapSource).not.toMatch(/requireEligibleHumanChecker|verifyApproverStepUp/);
  });
});

// ---------------------------------------------------------------------------------------
// Token wrapper with a recording fake client.
// ---------------------------------------------------------------------------------------
interface Row { [k: string]: unknown }
class FakeClient {
  calls: Array<{ text: string; params: unknown[] }> = [];
  consumeRowCount = 1;
  constructor(private readonly token: Row, private readonly o: { grants?: boolean; deny?: boolean; approvalRow?: Row | null } = {}) {}
  async query(text: string, params: unknown[] = []): Promise<{ rows: Row[]; rowCount: number }> {
    this.calls.push({ text, params });
    if (text.includes("FROM iam2.permission_decision_token") && text.includes("SELECT decision_token_id")) return { rows: [this.token], rowCount: 1 };
    if (text.includes("UPDATE iam2.permission_decision_token") && text.includes("'consumed'")) return { rows: [], rowCount: this.consumeRowCount };
    if (text.includes("UPDATE iam2.permission_decision_token") && text.includes("'revoked'")) return { rows: [], rowCount: 1 };
    if (text.includes("permission_cache_version")) return { rows: [{ cache_version: 0 }], rowCount: 1 };
    if (text.includes("set_config")) return { rows: [], rowCount: 1 };
    if (text.includes("FROM iam2.permission") && text.includes("permission_code = $1")) {
      return { rows: [{ permission_id: "perm_1", permission_code: params[0], licence_locked: false, prohibited: false, requires_step_up: false, requires_approval: false }], rowCount: 1 };
    }
    if (text.includes("user_permission_override")) return this.o.deny ? { rows: [{ "?column?": 1 }], rowCount: 1 } : { rows: [], rowCount: 0 };
    if (text.includes("user_role ur")) return this.o.grants === false ? { rows: [], rowCount: 0 } : { rows: [{ role_code: "r" }], rowCount: 1 };
    if (text.includes("permission_decision_log") || text.includes("foundation.outbox_event")) return { rows: [], rowCount: 1 };
    if (text.includes("FROM iam2.approval_request")) return { rows: this.o.approvalRow ? [this.o.approvalRow] : [], rowCount: this.o.approvalRow ? 1 : 0 };
    throw new Error("FakeClient: unmocked query: " + text);
  }
}
const RAW = "raw-token-1";
const tokenRow = (over: Row = {}): Row => ({
  decision_token_id: "dtok_1", actor_user_id: "u_maker", session_id: null, action: "a.b.c", resource: "res", entity_id: "e1", client_id: null,
  payload_hash: "sha256:p", approval_id: null, cache_version: 0, status: "active", expires_at_utc: new Date(Date.now() + 60_000).toISOString(), ...over,
});
const input = (over: Record<string, unknown> = {}) => ({ tokenRaw: RAW, actorUserId: "u_maker", action: "a.b.c", resource: "res", entityId: "e1", currentPayloadHash: "sha256:p", ...over });
const inCtx = <T>(fn: () => Promise<T>) => runWithContext(createRequestContext({ actorType: "service" }), fn);

describe("verifyAndConsumeForExecution (AZ-02, AZ-15; T-36 unit leg, T-54)", () => {
  it("T-54: sets aix.user_id to the token's bound actor BEFORE any RLS-protected read (deny override / role grants)", async () => {
    const c = new FakeClient(tokenRow());
    const r = await inCtx(() => verifyAndConsumeForExecution(c as unknown as PoolClient, input()));
    expect(r.ok).toBe(true);
    const idx = (needle: string) => c.calls.findIndex((q) => q.text.includes(needle));
    const scopeAt = c.calls.findIndex((q) => q.text.includes("set_config") && q.params[0] === "u_maker");
    expect(scopeAt).toBeGreaterThan(-1);
    expect(scopeAt).toBeLessThan(idx("user_permission_override"));
    expect(scopeAt).toBeLessThan(idx("user_role ur"));
  });

  it("the token row is read FOR UPDATE and consumed by a CONDITIONAL update (status = 'active')", async () => {
    const c = new FakeClient(tokenRow());
    await inCtx(() => verifyAndConsumeForExecution(c as unknown as PoolClient, input()));
    const select = c.calls.find((q) => q.text.includes("SELECT decision_token_id"))!;
    expect(select.text).toMatch(/FOR UPDATE/);
    const update = c.calls.find((q) => q.text.includes("'consumed'"))!;
    expect(update.text).toMatch(/AND status = 'active'/);
  });

  it("T-36 (unit leg): a conditional UPDATE that affects 0 rows (lost race) is refused as an invalid token — in the wrapper and in the base verifier", async () => {
    const c1 = new FakeClient(tokenRow());
    c1.consumeRowCount = 0;
    expect(await inCtx(() => verifyAndConsumeForExecution(c1 as unknown as PoolClient, input()))).toEqual({ ok: false, reasonCode: "IAM2_DECISION_TOKEN_INVALID" });
    const c2 = new FakeClient(tokenRow());
    c2.consumeRowCount = 0;
    expect(await inCtx(() => verifyAndConsumeDecisionToken(c2 as unknown as PoolClient, input()))).toEqual({ ok: false, reasonCode: "IAM2_DECISION_TOKEN_INVALID" });
  });

  it("an explicit deny or a missing grant refuses BEFORE the token is consumed (token stays unconsumed)", async () => {
    for (const o of [{ deny: true }, { grants: false }]) {
      const c = new FakeClient(tokenRow(), o);
      const r = await inCtx(() => verifyAndConsumeForExecution(c as unknown as PoolClient, input()));
      expect(r).toEqual({ ok: false, reasonCode: "IAM2_PERMISSION_DENIED" });
      expect(c.calls.some((q) => q.text.includes("'consumed'"))).toBe(false);
    }
  });

  it("a presented approval id that the token does not carry is a binding mismatch: token revoked, Critical audit, no entitlement evaluation", async () => {
    const c = new FakeClient(tokenRow({ approval_id: null }));
    const r = await inCtx(() => verifyAndConsumeForExecution(c as unknown as PoolClient, input({ approvalId: "appr_FABRICATED" })));
    expect(r).toEqual({ ok: false, reasonCode: "IAM2_DECISION_TOKEN_INVALID" });
    expect(c.calls.some((q) => q.text.includes("'revoked'"))).toBe(true);
    expect(c.calls.some((q) => q.text.includes("user_role ur"))).toBe(false);
    expect(sha256Hex(RAW)).toHaveLength(64);
  });

  it("D7-01: a caller-asserted payload hash that differs from the server-derived one is a payload-hash mismatch even when the token matches the server value — revoked, audited, never consumed, no entitlement evaluation", async () => {
    const c = new FakeClient(tokenRow());
    const r = await inCtx(() => verifyAndConsumeForExecution(c as unknown as PoolClient, input({ assertedPayloadHash: "sha256:caller-lies" })));
    expect(r).toEqual({ ok: false, reasonCode: "IAM2_PAYLOAD_HASH_MISMATCH" });
    expect(c.calls.some((q) => q.text.includes("'revoked'"))).toBe(true);
    expect(c.calls.some((q) => q.text.includes("'consumed'"))).toBe(false);
    expect(c.calls.some((q) => q.text.includes("user_role ur"))).toBe(false);
    const audit = c.calls.find((q) => q.text.includes("foundation.outbox_event"));
    expect(audit).toBeDefined();
  });

  it("D7-01: an asserted hash EQUAL to the server-derived one, an absent one and a null one all leave the redemption unchanged; the base verifier honours the same field", async () => {
    for (const asserted of ["sha256:p", undefined, null]) {
      const c = new FakeClient(tokenRow());
      const r = await inCtx(() => verifyAndConsumeForExecution(c as unknown as PoolClient, input(asserted === undefined ? {} : { assertedPayloadHash: asserted })));
      expect(r.ok, String(asserted)).toBe(true);
    }
    const c = new FakeClient(tokenRow());
    expect(await inCtx(() => verifyAndConsumeDecisionToken(c as unknown as PoolClient, input({ assertedPayloadHash: "sha256:other" })))).toEqual({ ok: false, reasonCode: "IAM2_PAYLOAD_HASH_MISMATCH" });
  });

  it("an approval-bearing token is refused when the approval row cannot be re-read", async () => {
    const c = new FakeClient(tokenRow({ approval_id: "appr_1" }), { approvalRow: null });
    const r = await inCtx(() => verifyAndConsumeForExecution(c as unknown as PoolClient, input({ approvalId: "appr_1" })));
    expect(r).toEqual({ ok: false, reasonCode: "IAM2_APPROVAL_PROVENANCE_INVALID" });
    expect(c.calls.some((q) => q.text.includes("'consumed'"))).toBe(false);
  });
});

describe("error catalogue (AZ-11, IMPL-01, X-3)", () => {
  const REM_CODES: Record<string, { http: number; message: RegExp }> = {
    IAM2_APPROVER_NOT_ELIGIBLE: { http: 403, message: /not eligible/ },
    IAM2_SERVICE_ACCOUNT_APPROVER_BLOCKED: { http: 403, message: /control restrictions/ },
    IAM2_APPROVAL_POLICY_MISSING: { http: 403, message: /Approval is required/ },
    IAM2_APPROVAL_POLICY_REVOKED: { http: 403, message: /control restrictions/ },
    IAM2_APPROVAL_SNAPSHOT_MISSING: { http: 409, message: /requested again/ },
    IAM2_APPROVAL_MULTI_APPROVER_UNSUPPORTED: { http: 403, message: /control restrictions/ },
    IAM2_APPROVAL_RESOURCE_MISMATCH: { http: 400, message: /could not be processed/ },
    IAM2_APPROVAL_PROVENANCE_INVALID: { http: 409, message: /re-authentication/ },
  };

  it("the approval-authorisation codes live in the ONE canonical IAM2_ERROR_CODES catalogue with the approved HTTP mapping and generic messages", () => {
    for (const [code, expected] of Object.entries(REM_CODES)) {
      expect(Object.keys(IAM2_ERROR_CODES), code).toContain(code);
      const spec = (IAM2_ERROR_CODES as Record<string, { http: number; message: string }>)[code]!;
      expect(spec.http, code).toBe(expected.http);
      expect(spec.message, code).toMatch(expected.message);
      const err = new Iam2Error(code as keyof typeof IAM2_ERROR_CODES);
      expect(err.http).toBe(expected.http);
      expect(err.code).toBe(code);
      expect(err.message).toBe(spec.message);
    }
  });

  it("there is NO second catalogue: errors.ts exports exactly one code registry (no parallel/merged map)", () => {
    const source = readFileSync(resolve(__dirname, "../../services/iam2/src/lib/errors.ts"), "utf8");
    const exportedConsts = [...source.matchAll(/^export const (\w+)/gm)].map((m) => m[1]);
    expect(exportedConsts).toEqual(["IAM2_ERROR_CODES"]);
    expect(source).not.toMatch(/REMEDIATION_ERROR_CODES|ALL_IAM2_ERROR_CODES/);
  });

  it("existing error contracts are unchanged (spot check of pre-existing codes and statuses)", () => {
    expect(new Iam2Error("IAM2_PERMISSION_DENIED").http).toBe(403);
    expect(new Iam2Error("IAM2_APPROVAL_EXPIRED").http).toBe(410);
    expect(new Iam2Error("IAM2_STEP_UP_INVALID").http).toBe(401);
    expect(new Iam2Error("IAM2_DECISION_TOKEN_INVALID").http).toBe(409);
    expect(new Iam2Error("IAM2_APPROVAL_ALREADY_DECIDED").http).toBe(409);
  });
});
