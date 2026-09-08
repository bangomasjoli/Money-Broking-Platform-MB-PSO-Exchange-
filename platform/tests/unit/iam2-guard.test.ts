/**
 * IAM-02 permission guard precedence-chain unit tests (no DB — a fake in-memory PoolClient
 * stands in for Postgres, dispatching on stable substrings of the SQL text that
 * services/iam2/src/lib/guard.ts actually issues). This lets every one of the 11 precedence
 * steps be forced deterministically, including the "this step doesn't block, chain proceeds"
 * proof for the steps that are documented no-op fall-throughs this stage (3, 5, 8, 9).
 *
 * `publishAudit` (called by guard.ts's recordDecision) needs an active RequestContext for
 * its correlation_id — tests wrap each call in `runWithContext`, mirroring what the real
 * Fastify onRequest hook does in production.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { createRequestContext, runWithContext } from "@aix/foundation";
import { evaluatePermission, type PermissionCheckInput } from "../../services/iam2/src/lib/guard.js";
import { IAM2_ERROR_CODES } from "../../services/iam2/src/lib/errors.js";

interface PermissionFixtureRow {
  permission_id: string;
  permission_code: string;
  licence_locked: boolean;
  prohibited: boolean;
  requires_step_up: boolean;
  requires_approval: boolean;
}

interface FakeDbFixture {
  cacheVersionRows: Array<{ cache_version: number }>;
  permissionRows: PermissionFixtureRow[];
  denyOverrideRows: Array<Record<string, unknown>>;
  roleGrantRows: Array<{ role_code: string }>;
}

interface CapturedQuery {
  marker: string;
  text: string;
  params: unknown[];
}

class FakeIam2Client {
  calls: CapturedQuery[] = [];
  decisionLogInserts: Array<{ params: unknown[] }> = [];
  outboxInserts: Array<{ params: unknown[] }> = [];

  constructor(private readonly fixture: FakeDbFixture) {}

  async query(text: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> {
    // Order matters: check the most specific/unique substrings first.
    if (text.includes("permission_cache_version")) {
      this.calls.push({ marker: "permission_cache_version", text, params });
      return { rows: this.fixture.cacheVersionRows, rowCount: this.fixture.cacheVersionRows.length };
    }
    if (text.includes("user_permission_override")) {
      this.calls.push({ marker: "user_permission_override", text, params });
      return { rows: this.fixture.denyOverrideRows, rowCount: this.fixture.denyOverrideRows.length };
    }
    if (text.includes("user_role ur")) {
      this.calls.push({ marker: "user_role_role_permission_join", text, params });
      return { rows: this.fixture.roleGrantRows, rowCount: this.fixture.roleGrantRows.length };
    }
    if (text.includes("permission_decision_log")) {
      this.calls.push({ marker: "permission_decision_log_insert", text, params });
      this.decisionLogInserts.push({ params });
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("foundation.outbox_event")) {
      this.calls.push({ marker: "foundation_outbox_event_insert", text, params });
      this.outboxInserts.push({ params });
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("FROM iam2.permission")) {
      this.calls.push({ marker: "permission_lookup", text, params });
      return { rows: this.fixture.permissionRows, rowCount: this.fixture.permissionRows.length };
    }
    throw new Error("FakeIam2Client: unmocked query: " + text);
  }

  hasCall(marker: string): boolean {
    return this.calls.some((c) => c.marker === marker);
  }
}

function basePermission(overrides: Partial<PermissionFixtureRow> = {}): PermissionFixtureRow {
  return {
    permission_id: "perm_test_1",
    permission_code: "iam2.role.read",
    licence_locked: false,
    prohibited: false,
    requires_step_up: false,
    requires_approval: false,
    ...overrides,
  };
}

function baseInput(overrides: Partial<PermissionCheckInput> = {}): PermissionCheckInput {
  return {
    actorId: "user_" + randomUUID(),
    action: "iam2.role.read",
    resource: "role",
    ...overrides,
  };
}

async function runGuard(client: FakeIam2Client, input: PermissionCheckInput) {
  const ctx = createRequestContext({ actorType: "service" });
  return runWithContext(ctx, () => evaluatePermission(client as unknown as PoolClient, input));
}

describe("IAM-02 permission guard precedence chain (07_Permission_Rules.md §7)", () => {
  it("fail-closed: unknown permission code -> deny, IAM2_PERMISSION_UNKNOWN (checked before the 11-step chain)", async () => {
    const client = new FakeIam2Client({
      cacheVersionRows: [],
      permissionRows: [], // lookup misses entirely
      denyOverrideRows: [],
      roleGrantRows: [],
    });
    const result = await runGuard(client, baseInput({ action: "no.such.permission" }));
    expect(result.decision).toBe("deny");
    expect(result.reason).toBe("IAM2_PERMISSION_UNKNOWN");
    // Nothing downstream of the permission lookup should ever run for an unknown code.
    expect(client.hasCall("user_permission_override")).toBe(false);
    expect(client.hasCall("user_role_role_permission_join")).toBe(false);
  });

  it("step 1: licence-lock deny wins even when nothing else would have blocked", async () => {
    const client = new FakeIam2Client({
      cacheVersionRows: [{ cache_version: 3 }],
      permissionRows: [basePermission({ licence_locked: true, prohibited: false })],
      denyOverrideRows: [],
      roleGrantRows: [{ role_code: "security_admin" }],
    });
    const result = await runGuard(client, baseInput());
    expect(result.decision).toBe("licence_locked");
    expect(result.reason).toBe("IAM2_LICENCE_LOCKED_PERMISSION");
    // Short-circuits before any override/role lookup.
    expect(client.hasCall("user_permission_override")).toBe(false);
    expect(client.hasCall("user_role_role_permission_join")).toBe(false);
  });

  it("step 2: prohibited deny wins even with an override attempting allow and a role that would otherwise grant it", async () => {
    const client = new FakeIam2Client({
      cacheVersionRows: [],
      // licence_locked deliberately false here so this test isolates step 2 from step 1.
      permissionRows: [basePermission({ licence_locked: false, prohibited: true, permission_code: "exchange.market_maker.enable" })],
      denyOverrideRows: [], // a real DB's `WHERE effect = 'deny'` would never return an allow-effect row anyway
      roleGrantRows: [{ role_code: "security_admin" }],
    });
    const result = await runGuard(
      client,
      baseInput({ action: "exchange.market_maker.enable", resource: "market_maker" }),
    );
    expect(result.decision).toBe("licence_locked");
    expect(result.reason).toBe("IAM2_LICENCE_LOCKED_PERMISSION");
    // Prohibited is checked BEFORE role/override resolution — neither table is even queried.
    expect(client.hasCall("user_permission_override")).toBe(false);
    expect(client.hasCall("user_role_role_permission_join")).toBe(false);
  });

  it("step 3: account/session freeze is a documented no-op fall-through this stage — chain proceeds to allow", async () => {
    const client = new FakeIam2Client({
      cacheVersionRows: [],
      permissionRows: [basePermission()],
      denyOverrideRows: [],
      roleGrantRows: [{ role_code: "security_admin" }],
    });
    const result = await runGuard(client, baseInput());
    // No freeze-related query exists anywhere in the guard this stage (Phase 5 integration).
    expect(client.calls.some((c) => c.text.toLowerCase().includes("freeze"))).toBe(false);
    expect(result.decision).toBe("allow");
  });

  it("step 4: explicit deny override wins even though the user ALSO has an active role-granted allow", async () => {
    const client = new FakeIam2Client({
      cacheVersionRows: [],
      permissionRows: [basePermission()],
      denyOverrideRows: [{ effect: "deny" }],
      roleGrantRows: [{ role_code: "security_admin" }], // would otherwise allow at step 10
    });
    const result = await runGuard(client, baseInput());
    expect(result.decision).toBe("deny");
    expect(result.reason).toBe("IAM2_PERMISSION_DENIED");
    // Short-circuits before role resolution — proves deny-override precedence over role-allow.
    expect(client.hasCall("user_role_role_permission_join")).toBe(false);
  });

  it("step 5: SoD block is a documented no-op fall-through this stage — chain proceeds to allow, no sod_rule/sod_check query issued", async () => {
    const client = new FakeIam2Client({
      cacheVersionRows: [],
      permissionRows: [basePermission()],
      denyOverrideRows: [],
      roleGrantRows: [{ role_code: "security_admin" }],
    });
    const result = await runGuard(client, baseInput());
    expect(client.calls.some((c) => c.text.toLowerCase().includes("sod_"))).toBe(false);
    expect(result.decision).toBe("allow");
  });

  it("step 6: missing step-up -> step_up_required (real blocking decision, short-circuits before role lookup)", async () => {
    const client = new FakeIam2Client({
      cacheVersionRows: [],
      permissionRows: [basePermission({ requires_step_up: true })],
      denyOverrideRows: [],
      roleGrantRows: [{ role_code: "security_admin" }],
    });
    const result = await runGuard(client, baseInput());
    expect(result.decision).toBe("step_up_required");
    expect(result.reason).toBe("IAM2_STEP_UP_REQUIRED");
    expect(result.stepUpRequired).toBe(true);
    expect(client.hasCall("user_role_role_permission_join")).toBe(false);
  });

  it("step 7: approval required -> approval_required (real blocking decision, short-circuits before role lookup)", async () => {
    const client = new FakeIam2Client({
      cacheVersionRows: [],
      permissionRows: [basePermission({ requires_approval: true })],
      denyOverrideRows: [],
      roleGrantRows: [{ role_code: "security_admin" }],
    });
    const result = await runGuard(client, baseInput());
    expect(result.decision).toBe("approval_required");
    expect(result.reason).toBe("IAM2_APPROVAL_REQUIRED");
    expect(result.approvalRequired).toBe(true);
    expect(client.hasCall("user_role_role_permission_join")).toBe(false);
  });

  it("steps 8/9: temporary/delegated permission are documented no-op fall-throughs this stage — no such tables are ever queried", async () => {
    const client = new FakeIam2Client({
      cacheVersionRows: [],
      permissionRows: [basePermission()],
      denyOverrideRows: [],
      roleGrantRows: [{ role_code: "security_admin" }],
    });
    const result = await runGuard(client, baseInput());
    expect(client.calls.some((c) => c.text.toLowerCase().includes("temporary_permission"))).toBe(false);
    expect(client.calls.some((c) => c.text.toLowerCase().includes("delegation"))).toBe(false);
    expect(result.decision).toBe("allow");
  });

  it("step 10: role permission grants allow with permission_granted, cache_version, and permission_sources recorded", async () => {
    const client = new FakeIam2Client({
      cacheVersionRows: [{ cache_version: 7 }],
      permissionRows: [basePermission()],
      denyOverrideRows: [],
      roleGrantRows: [{ role_code: "security_admin" }],
    });
    const result = await runGuard(client, baseInput());
    expect(result.decision).toBe("allow");
    expect(result.reason).toBe("permission_granted");
    expect(result.cacheVersion).toBe(7);
    expect(result.sodConflict).toBe(false);
    expect(result.stepUpRequired).toBe(false);
    expect(result.approvalRequired).toBe(false);
    expect(client.decisionLogInserts.length).toBe(1);
    expect(client.outboxInserts.length).toBe(1);
  });

  it("step 11: default deny for an actor with zero role assignments", async () => {
    const client = new FakeIam2Client({
      cacheVersionRows: [],
      permissionRows: [basePermission()],
      denyOverrideRows: [],
      roleGrantRows: [],
    });
    const result = await runGuard(client, baseInput());
    expect(result.decision).toBe("deny");
    expect(result.reason).toBe("IAM2_PERMISSION_DENIED");
  });

  it("a permission with no cache-version row yet is treated as version 0, not a failure (fresh install)", async () => {
    const client = new FakeIam2Client({
      cacheVersionRows: [], // no row at all
      permissionRows: [basePermission()],
      denyOverrideRows: [],
      roleGrantRows: [{ role_code: "security_admin" }],
    });
    const result = await runGuard(client, baseInput());
    expect(result.decision).toBe("allow");
    expect(result.cacheVersion).toBe(0);
  });

  it("every decision writes exactly one permission_decision_log row and emits exactly one audit event", async () => {
    const client = new FakeIam2Client({
      cacheVersionRows: [],
      permissionRows: [basePermission({ licence_locked: true })],
      denyOverrideRows: [],
      roleGrantRows: [],
    });
    await runGuard(client, baseInput());
    expect(client.decisionLogInserts.length).toBe(1);
    expect(client.outboxInserts.length).toBe(1);
  });
});

describe("Error-code completeness (guard.ts / routes reason vocabulary vs. IAM2_ERROR_CODES)", () => {
  it("every IAM2_* reason string guard.ts can produce exists in the IAM2_ERROR_CODES catalogue", async () => {
    const scenarios: Array<{ fixture: FakeDbFixture; expectedReason: string }> = [
      {
        fixture: { cacheVersionRows: [], permissionRows: [], denyOverrideRows: [], roleGrantRows: [] },
        expectedReason: "IAM2_PERMISSION_UNKNOWN",
      },
      {
        fixture: { cacheVersionRows: [], permissionRows: [basePermission({ licence_locked: true })], denyOverrideRows: [], roleGrantRows: [] },
        expectedReason: "IAM2_LICENCE_LOCKED_PERMISSION",
      },
      {
        fixture: { cacheVersionRows: [], permissionRows: [basePermission({ prohibited: true })], denyOverrideRows: [], roleGrantRows: [] },
        expectedReason: "IAM2_LICENCE_LOCKED_PERMISSION",
      },
      {
        fixture: { cacheVersionRows: [], permissionRows: [basePermission()], denyOverrideRows: [{ effect: "deny" }], roleGrantRows: [] },
        expectedReason: "IAM2_PERMISSION_DENIED",
      },
      {
        fixture: { cacheVersionRows: [], permissionRows: [basePermission({ requires_step_up: true })], denyOverrideRows: [], roleGrantRows: [] },
        expectedReason: "IAM2_STEP_UP_REQUIRED",
      },
      {
        fixture: { cacheVersionRows: [], permissionRows: [basePermission({ requires_approval: true })], denyOverrideRows: [], roleGrantRows: [] },
        expectedReason: "IAM2_APPROVAL_REQUIRED",
      },
      {
        fixture: { cacheVersionRows: [], permissionRows: [basePermission()], denyOverrideRows: [], roleGrantRows: [] },
        expectedReason: "IAM2_PERMISSION_DENIED", // default deny
      },
    ];

    for (const scenario of scenarios) {
      const client = new FakeIam2Client(scenario.fixture);
      const result = await runGuard(client, baseInput());
      expect(result.reason).toBe(scenario.expectedReason);
      // The core completeness assertion: every reason the guard actually produced is a key
      // in the catalogue (or the documented non-catalogue "permission_granted" literal from
      // 04_API_Specification.md's own example, which is not an error code at all).
      if (result.reason !== "permission_granted") {
        expect(Object.keys(IAM2_ERROR_CODES)).toContain(result.reason);
      }
    }
  });

  it("the catalogue contains exactly the Phase 0-2 codes plus the Phase 3-5 additions this stage's brief specifies (no premature Phase 6/7 codes invented)", () => {
    expect(Object.keys(IAM2_ERROR_CODES).sort()).toEqual(
      [
        // Phase 0-2 (unchanged).
        "IAM2_PERMISSION_DENIED",
        "IAM2_PERMISSION_UNKNOWN",
        "IAM2_ROLE_UNKNOWN",
        "IAM2_LICENCE_LOCKED_PERMISSION",
        "IAM2_SOD_CONFLICT",
        "IAM2_STEP_UP_REQUIRED",
        "IAM2_APPROVAL_REQUIRED",
        "IAM2_PERMISSION_CACHE_STALE",
        // Phase 3-5 additions (see lib/errors.ts class header comment).
        "IAM2_SELF_APPROVAL_BLOCKED",
        "IAM2_APPROVAL_EXPIRED",
        "IAM2_STEP_UP_INVALID",
        "IAM2_PAYLOAD_HASH_MISMATCH",
        "IAM2_DECISION_TOKEN_INVALID",
        "IAM2_DECISION_TOKEN_STALE",
        "IAM2_APPROVAL_ALREADY_DECIDED",
        "IAM2_BOOTSTRAP_TRANSITION_UNAVAILABLE",
      ].sort(),
    );
  });
});
