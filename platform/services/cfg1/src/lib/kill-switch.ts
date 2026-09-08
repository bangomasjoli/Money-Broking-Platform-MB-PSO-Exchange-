/**
 * CFG-01 Phase 3B — feature-scoped kill-switch workflow (blueprint `05_Database_Design.md`
 * §2.7, extended per approved Phase 3B decisions — see `infra/migrations/018_cfg1_kill_switch.cjs`'s
 * header comment for the full data-model rationale).
 *
 * Mirrors `lib/decision.ts`'s own division of labour: these functions do the DB writes AND the
 * transaction-coupled `publishAudit` call under a caller-supplied transaction client (same shape
 * as `evaluateFeature`/`logFeatureEvaluation`), while `routes/kill-switches.ts` owns the HTTP
 * layer, IAM-02 calls, and error translation — never the reverse.
 *
 * NO seal, NO reseal, NO Doc00 baseline dependency (approved decision #12) — kill-switch is
 * live operational/emergency state with no regulatory anchor, read directly and freshly on
 * every decision. `isKillSwitchActiveForFeature` is the ONE function every other kill-switch-
 * aware code path (the decision engine, verify-decision, and this file's own routes) calls —
 * a single, trivial, always-fresh source of truth.
 *
 * Feature-scoped only (approved decisions #1/#2) — `feature_code` is required everywhere; no
 * global/platform-wide switch, no `scope` column (approved decision #3).
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { fingerprint, publishAudit, query } from "@aix/foundation";

export async function isKillSwitchActiveForFeature(client: PoolClient, featureCode: string): Promise<boolean> {
  const rows = await query<{ status: string }>(
    client,
    `SELECT status FROM cfg1.kill_switch WHERE feature_code = $1 AND status = 'active'`,
    [featureCode],
  );
  return rows.length > 0;
}

interface KillSwitchLookupRow {
  kill_switch_id: string;
  feature_code: string;
  status: string;
  activated_by: string;
  version: number;
}

async function lookupKillSwitch(client: PoolClient, featureCode: string, forUpdate: boolean): Promise<KillSwitchLookupRow | undefined> {
  const rows = await query<KillSwitchLookupRow>(
    client,
    `SELECT kill_switch_id, feature_code, status, activated_by, version FROM cfg1.kill_switch WHERE feature_code = $1${forUpdate ? " FOR UPDATE" : ""}`,
    [featureCode],
  );
  return rows[0];
}

function activationPayload(input: { featureCode: string; reason: string; evidenceRef?: string | null }): Record<string, unknown> {
  return { feature_code: input.featureCode, reason: input.reason, evidence_ref: input.evidenceRef ?? null };
}

export interface ActivateKillSwitchInput {
  featureCode: string;
  reason: string;
  evidenceRef?: string | null;
  activatedBy: string;
  requestId: string;
  correlationId: string;
}

export type ActivateKillSwitchOutcome =
  | { kind: "activated"; killSwitchId: string; version: number; activatedAtUtc: string }
  | { kind: "already_active" };

/**
 * Re-activates an existing (previously deactivated) row for the same `feature_code` if one
 * exists — `cfg1.kill_switch` holds current state only, `cfg1.kill_switch_event` is the full
 * history, so a feature's `kill_switch_id` stays stable across its whole activate/deactivate
 * lifecycle rather than growing a new row every cycle.
 *
 * Self-review finding (fixed before Opus review): `FOR UPDATE` on `lookupKillSwitch` only takes
 * a lock when a matching row already exists — it does nothing for the TRUE first-ever-activation
 * race, where two concurrent callers both see zero rows and both attempt an INSERT. The partial
 * unique index (`cfg1_kill_switch_one_active_per_feature`) still prevents two active rows from
 * ever existing, but the LOSER of that race would surface as a raw Postgres unique-violation
 * (23505), which `routes/kill-switches.ts` would then mis-translate into `CFG1_AUDIT_REQUIRED`
 * (503, "audit unavailable") instead of the correct, clean `already_active` (409) outcome — a
 * misleading error for what is actually a successful-but-raced activation attempt. Fixed with a
 * transaction-scoped advisory lock, keyed by `feature_code`, taken BEFORE the lookup — the same
 * `pg_advisory_xact_lock(hashtext($1))` idiom SEC-01 already established for the identical class
 * of "first concurrent writer wins, others must resolve cleanly" problem
 * (`services/sec1/src/lib/alerts.ts`, `services/sec1/src/lib/monitoring-rules.ts`). This makes
 * the `FOR UPDATE` lookup's zero-rows case safe too, since all concurrent callers for the same
 * `feature_code` are now fully serialized before either the lookup or the INSERT/UPDATE runs.
 */
export async function activateKillSwitch(client: PoolClient, input: ActivateKillSwitchInput): Promise<ActivateKillSwitchOutcome> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`cfg1.kill_switch:${input.featureCode}`]);
  const existing = await lookupKillSwitch(client, input.featureCode, true);
  if (existing?.status === "active") {
    return { kind: "already_active" };
  }

  const activatedAtUtc = new Date().toISOString();
  const payloadHash = fingerprint(activationPayload(input));
  let killSwitchId: string;
  let version: number;

  if (existing) {
    killSwitchId = existing.kill_switch_id;
    version = existing.version + 1;
    await client.query(
      `UPDATE cfg1.kill_switch
          SET status = 'active', reason = $2, evidence_ref = $3, activated_by = $4,
              activated_at_utc = $5, deactivated_at_utc = NULL, version = $6, updated_at_utc = now()
        WHERE kill_switch_id = $1`,
      [killSwitchId, input.reason, input.evidenceRef ?? null, input.activatedBy, activatedAtUtc, version],
    );
  } else {
    killSwitchId = "ks_" + randomUUID();
    version = 1;
    await client.query(
      `INSERT INTO cfg1.kill_switch
         (kill_switch_id, feature_code, reason, evidence_ref, activated_by, status, activated_at_utc, version, created_at_utc, updated_at_utc)
       VALUES ($1,$2,$3,$4,$5,'active',$6,$7, now(), now())`,
      [killSwitchId, input.featureCode, input.reason, input.evidenceRef ?? null, input.activatedBy, activatedAtUtc, version],
    );
  }

  await client.query(
    `INSERT INTO cfg1.kill_switch_event (event_id, kill_switch_id, feature_code, event_type, actor_id, reason, evidence_ref, payload_hash, created_at_utc)
     VALUES ($1,$2,$3,'activated',$4,$5,$6,$7, now())`,
    ["kse_" + randomUUID(), killSwitchId, input.featureCode, input.activatedBy, input.reason, input.evidenceRef ?? null, payloadHash],
  );

  await publishAudit(client, {
    event_type: "cfg1.kill_switch.activated",
    source_module: "CFG-01",
    actor_id: input.activatedBy,
    actor_type: "user",
    entity_type: "feature",
    entity_id: input.featureCode,
    severity: "critical",
    action: "kill_switch_activate",
    result: "success",
    reason_code: "kill_switch_activated",
    metadata: { kill_switch_id: killSwitchId, version, request_id: input.requestId, correlation_id: input.correlationId },
  });

  return { kind: "activated", killSwitchId, version, activatedAtUtc };
}

function deactivationPayload(input: { changeId: string; killSwitchId: string; featureCode: string }): Record<string, unknown> {
  return { change_id: input.changeId, kill_switch_id: input.killSwitchId, feature_code: input.featureCode, action: "deactivate" };
}

/**
 * Exported so `routes/kill-switches.ts`'s apply handler can recompute the SAME hash from the
 * stored change row (never a re-submitted request body) BEFORE calling IAM-02's execute-verify
 * — the exact payload shape an operator's IAM-02 approval must have been created against.
 */
export function computeKillSwitchDeactivationPayloadHash(input: { changeId: string; killSwitchId: string; featureCode: string }): string {
  return fingerprint(deactivationPayload(input));
}

export interface RequestKillSwitchDeactivationInput {
  featureCode: string;
  changeReason: string;
  requestedBy: string;
  requestId: string;
  correlationId: string;
}

export type RequestKillSwitchDeactivationOutcome =
  | { kind: "requested"; changeId: string; payloadHash: string; killSwitchId: string }
  | { kind: "not_active" }
  | { kind: "self_deactivation_blocked" };

/**
 * Approved decision #6/#7 — partial SoD mitigation: the deactivation-request PROPOSER cannot be
 * the SAME actor who activated the kill-switch (CFG-01 already owns `activated_by`, a cheap,
 * real, enforceable check). This does NOT prevent the original activator from later being the
 * IAM-02 APPROVER of someone else's deactivation request — `execute-verify` never exposes
 * approver identity to CFG-01, so that half of the SoD concern is a documented, accepted
 * residual gap (approved decision #7), not silently ignored.
 */
export async function requestKillSwitchDeactivation(
  client: PoolClient,
  input: RequestKillSwitchDeactivationInput,
): Promise<RequestKillSwitchDeactivationOutcome> {
  const active = await lookupKillSwitch(client, input.featureCode, false);
  if (!active || active.status !== "active") {
    return { kind: "not_active" };
  }
  if (active.activated_by === input.requestedBy) {
    return { kind: "self_deactivation_blocked" };
  }

  const changeId = "ksdr_" + randomUUID();
  const payloadHash = fingerprint(deactivationPayload({ changeId, killSwitchId: active.kill_switch_id, featureCode: input.featureCode }));

  await client.query(
    `INSERT INTO cfg1.kill_switch_deactivation_request
       (change_id, kill_switch_id, feature_code, change_reason, requested_by, status, payload_hash, request_id, correlation_id, created_at_utc)
     VALUES ($1,$2,$3,$4,$5,'requested',$6,$7,$8, now())`,
    [changeId, active.kill_switch_id, input.featureCode, input.changeReason, input.requestedBy, payloadHash, input.requestId, input.correlationId],
  );

  await client.query(
    `INSERT INTO cfg1.kill_switch_event (event_id, kill_switch_id, feature_code, event_type, actor_id, reason, payload_hash, created_at_utc)
     VALUES ($1,$2,$3,'deactivation_requested',$4,$5,$6, now())`,
    ["kse_" + randomUUID(), active.kill_switch_id, input.featureCode, input.requestedBy, input.changeReason, payloadHash],
  );

  await publishAudit(client, {
    event_type: "cfg1.kill_switch.deactivation_requested",
    source_module: "CFG-01",
    actor_id: input.requestedBy,
    actor_type: "user",
    entity_type: "feature",
    entity_id: input.featureCode,
    severity: "medium",
    action: "kill_switch_deactivate_request",
    result: "success",
    metadata: { change_id: changeId, kill_switch_id: active.kill_switch_id, request_id: input.requestId, correlation_id: input.correlationId },
  });

  return { kind: "requested", changeId, payloadHash, killSwitchId: active.kill_switch_id };
}

export interface ApplyKillSwitchDeactivationInput {
  changeId: string;
  approvalId: string;
  decisionTokenHash: string;
  requestedBy: string;
}

export type ApplyKillSwitchDeactivationOutcome =
  | { kind: "raced" }
  | { kind: "not_active" }
  | { kind: "deactivated"; killSwitchId: string; featureCode: string; newVersion: number; deactivatedAtUtc: string };

interface DeactivationRequestRow {
  change_id: string;
  kill_switch_id: string;
  feature_code: string;
  status: string;
}

/**
 * Re-locks (`FOR UPDATE`) both the change row and the kill_switch row fresh — the caller
 * (`routes/kill-switches.ts`) has already resolved IAM-02's baseline check + mandatory
 * execute-verify BEFORE this is called (no DB lock was held across that network round-trip);
 * this function trusts nothing about the earlier, unlocked read and re-validates status from
 * scratch under the lock, exactly Phase 3A's own established discipline.
 */
export async function applyKillSwitchDeactivation(client: PoolClient, input: ApplyKillSwitchDeactivationInput): Promise<ApplyKillSwitchDeactivationOutcome> {
  const changeRows = await query<DeactivationRequestRow>(
    client,
    `SELECT change_id, kill_switch_id, feature_code, status FROM cfg1.kill_switch_deactivation_request WHERE change_id = $1 FOR UPDATE`,
    [input.changeId],
  );
  const change = changeRows[0];
  if (!change || change.status !== "requested") {
    return { kind: "raced" };
  }

  const killSwitch = await lookupKillSwitch(client, change.feature_code, true);
  if (!killSwitch || killSwitch.status !== "active" || killSwitch.kill_switch_id !== change.kill_switch_id) {
    return { kind: "not_active" };
  }

  const newVersion = killSwitch.version + 1;
  const deactivatedAtUtc = new Date().toISOString();

  await client.query(
    `UPDATE cfg1.kill_switch SET status = 'inactive', deactivated_at_utc = $2, version = $3, updated_at_utc = now() WHERE kill_switch_id = $1`,
    [killSwitch.kill_switch_id, deactivatedAtUtc, newVersion],
  );

  await client.query(
    `UPDATE cfg1.kill_switch_deactivation_request
        SET status = 'applied', approval_id = $2, decision_token_hash = $3, applied_at_utc = now()
      WHERE change_id = $1`,
    [input.changeId, input.approvalId, input.decisionTokenHash],
  );

  const payloadHash = fingerprint(deactivationPayload({ changeId: input.changeId, killSwitchId: killSwitch.kill_switch_id, featureCode: change.feature_code }));

  await client.query(
    `INSERT INTO cfg1.kill_switch_event (event_id, kill_switch_id, feature_code, event_type, actor_id, approval_id, payload_hash, created_at_utc)
     VALUES ($1,$2,$3,'deactivated',$4,$5,$6, now())`,
    ["kse_" + randomUUID(), killSwitch.kill_switch_id, change.feature_code, input.requestedBy, input.approvalId, payloadHash],
  );

  await publishAudit(client, {
    event_type: "cfg1.kill_switch.deactivated",
    source_module: "CFG-01",
    actor_id: input.requestedBy,
    actor_type: "user",
    entity_type: "feature",
    entity_id: change.feature_code,
    severity: "high",
    action: "kill_switch_deactivate",
    result: "success",
    metadata: { change_id: input.changeId, kill_switch_id: killSwitch.kill_switch_id, new_version: newVersion },
  });

  return { kind: "deactivated", killSwitchId: killSwitch.kill_switch_id, featureCode: change.feature_code, newVersion, deactivatedAtUtc };
}
