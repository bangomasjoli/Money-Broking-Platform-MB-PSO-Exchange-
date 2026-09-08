/**
 * F2: readiness licence-lock interim status, tested via the pure buildReadiness helper
 * (no DB required). Ensures licence_lock_interface never reports a false "pass" and that
 * production fails closed while non-prod stays non-blocking (§5.2).
 */
import { describe, it, expect } from "vitest";
import { buildReadiness } from "../../services/fnd/src/routes/system.js";

describe("readiness licence-lock interim status (F2)", () => {
  it("non-prod: licence lock is not_configured/interim and non-blocking; overall ready", () => {
    const result = buildReadiness({
      dbOk: true,
      auditOutboxOk: true,
      timeSyncOk: true,
      environment: "dev",
    });
    const licence = result.checks.find((c) => c.name === "licence_lock_interface");
    expect(licence?.status).toBe("not_configured");
    expect(licence?.mode).toBe("interim_pre_cfg");
    expect(licence?.blocking).toBe(false);
    expect(result.status).toBe("ready");
    expect(result.http).toBe(200);
  });

  it("prod: not_configured licence lock fails closed (not_ready / 503)", () => {
    const result = buildReadiness({
      dbOk: true,
      auditOutboxOk: true,
      timeSyncOk: true,
      environment: "prod",
    });
    const licence = result.checks.find((c) => c.name === "licence_lock_interface");
    expect(licence?.status).toBe("not_configured");
    expect(licence?.blocking).toBe(true);
    expect(result.status).toBe("not_ready");
    expect(result.http).toBe(503);
  });

  it("never reports a false pass for licence_lock_interface, in any environment", () => {
    const environments = ["dev", "qa", "uat", "staging", "prod"] as const;
    for (const environment of environments) {
      const result = buildReadiness({ dbOk: true, auditOutboxOk: true, timeSyncOk: true, environment });
      const licence = result.checks.find((c) => c.name === "licence_lock_interface");
      expect(licence?.status).not.toBe("pass");
    }
  });

  it("labels DB-backed checks accurately (not a separate broker)", () => {
    const result = buildReadiness({
      dbOk: true,
      auditOutboxOk: true,
      timeSyncOk: true,
      environment: "dev",
    });
    expect(result.checks.some((c) => c.name === "db_backed_queue")).toBe(true);
    expect(result.checks.some((c) => c.name === "db_backed_audit_outbox")).toBe(true);
    expect(result.checks.some((c) => c.name === "queue")).toBe(false);
    expect(result.checks.some((c) => c.name === "audit_outbox")).toBe(false);
  });

  it("a real infra failure (db down) still fails closed regardless of licence lock", () => {
    const result = buildReadiness({
      dbOk: false,
      auditOutboxOk: false,
      timeSyncOk: true,
      environment: "dev",
    });
    expect(result.status).toBe("not_ready");
    expect(result.http).toBe(503);
  });
});
