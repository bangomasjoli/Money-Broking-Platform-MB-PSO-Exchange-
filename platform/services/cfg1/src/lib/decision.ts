/**
 * CFG-01 Phase 2 — runtime feature decision precedence chain (blueprint
 * `07_Permission_Rules.md` §6), adapted honestly to what this codebase actually has:
 *
 *   1. Prohibited feature deny            — LIVE, checked against cfg1.prohibited_feature.
 *   2. Licence lock deny                  — would fire via feature.licence_profile_id, but no
 *                                            `feature` row exists yet to declare one.
 *   3. Suspended/revoked licence deny     — same as #2; dormant, not faked.
 *   4. Environment constraint deny        — STRUCTURALLY N/A: cfg1.feature (migration 014) has
 *                                            no environment_scope column at all yet, not merely
 *                                            unpopulated data.
 *   5. Client-class constraint deny       — STRUCTURALLY N/A, same reason as #4.
 *   6. Kill-switch deny                   — LIVE as of Phase 3B (migration 018's
 *                                            cfg1.kill_switch, lib/kill-switch.ts's
 *                                            isKillSwitchActiveForFeature) — a direct, unversioned,
 *                                            unsealed read, checked immediately after the
 *                                            prohibited-feature check and before the feature-row
 *                                            lookup (a feature_code can be kill-switched even with
 *                                            no cfg1.feature row yet).
 *   7. Dependency not ready deny          — STRUCTURALLY N/A, same reason as #4.
 *   8. Feature state disabled/locked deny — LIVE, via cfg1.feature.current_state, but only
 *                                            reachable through a synthetic test-fixture row
 *                                            (approved decision #6) — production cfg1.feature
 *                                            stays empty (approved decision #5).
 *   9. Config integrity mismatch deny     — LIVE, and runs FIRST, not ninth. See the
 *                                            deliberate-reordering note in lib/errors.ts's
 *                                            header comment: nothing below this point can be
 *                                            trusted unless the tables it reads have already
 *                                            passed decision-time integrity verification.
 *  10. Stale version deny/revalidate      — LIVE, interpreted against `prohibited_registry_
 *                                            version` (the only real, security-critical version
 *                                            number Phase 2 has) — `feature_config_version` has
 *                                            no real per-feature data yet to compare against.
 *  11. Explicit feature allow             — only reachable via a synthetic test-fixture row.
 *  12. Default deny                       — LIVE, `unknown_fail_closed` catches everything else.
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { publishAudit, query } from "@aix/foundation";
import { canonicalJson, sha256Prefixed } from "./canonical.js";
import { verifyDecisionTimeIntegrity, type DecisionIntegrityScopeResult } from "./integrity-seal.js";
import { isKillSwitchActiveForFeature } from "./kill-switch.js";

export type DecisionReasonCode =
  | "prohibited"
  | "exchange_pending_locked"
  | "kill_switch_active"
  | "stale_revalidate"
  | "unknown_fail_closed"
  | "feature_disabled"
  | "feature_allowed";

export interface EvaluateFeatureInput {
  featureCode: string;
  action: string;
  resource?: string | null;
  environment: string;
  clientId?: string | null;
  clientClass?: string | null;
  callerModule: string;
  requestedConfigVersion?: number | null;
}

export interface DecisionResult {
  decision: "allow" | "deny";
  reasonCode: DecisionReasonCode;
  featureConfigVersion: number | null;
  licenceProfileVersion: number;
  prohibitedRegistryVersion: number;
  prohibitedRegistryHash: string;
  doc00SourceVersion: string;
  payloadHash: string;
}

export type EvaluateOutcome =
  | { kind: "integrity_failed"; scopes: DecisionIntegrityScopeResult[] }
  | { kind: "decision"; result: DecisionResult };

/**
 * The binding fingerprint bound into both the decision log and any issued token — an explicit
 * allow-list of exactly the fields that identify WHAT was decided, never an arbitrary payload.
 * Recomputed at verify-decision time from the presented fields and compared against what was
 * stored at issuance (services/cfg1/src/lib/decision-token.ts).
 */
export function computeDecisionPayloadHash(input: {
  featureCode: string;
  action: string;
  resource?: string | null;
  environment: string;
  clientId?: string | null;
  clientClass?: string | null;
  callerModule: string;
}): string {
  return sha256Prefixed(
    canonicalJson({
      feature_code: input.featureCode,
      action: input.action,
      resource: input.resource ?? null,
      environment: input.environment,
      client_id: input.clientId ?? null,
      client_class: input.clientClass ?? null,
      caller_module: input.callerModule,
    }),
  );
}

interface ProhibitedFeatureLookupRow {
  applies_until: string;
}

/**
 * Phase 3A mutation-guard helper — used by `routes/feature-changes.ts`'s request AND apply
 * routes (defense in depth: checked at proposal time so a doomed change never wastes an IAM-02
 * approval cycle, and re-checked at apply time in case the registry changed between the two —
 * see that file's header comment) to structurally block a mutation from ever touching a
 * prohibited or Exchange-shaped feature code. Two independent layers, mirroring Phase 1's own
 * "not status alone" philosophy for the EXCHANGE licence profile:
 *   1. Direct `cfg1.prohibited_feature` membership (the same table `evaluateFeature`'s own
 *      step 1 reads) — covers every one of the 30 currently-reconciled codes.
 *   2. A structural `exchange.` prefix block, independent of table content — a defence-in-depth
 *      backstop against a FUTURE Exchange-shaped code that has not yet been added to the
 *      prohibited registry, so a mutation route can never be the first place a new
 *      Exchange-shaped feature code becomes enabled.
 * This function performs NO write — it is a pure guard, safe to call from either the request or
 * apply route without any transactional side effect of its own.
 */
export async function isFeatureMutationBlocked(
  client: PoolClient,
  featureCode: string,
): Promise<{ blocked: boolean; reason?: "prohibited_registry" | "exchange_shaped" }> {
  if (featureCode.startsWith("exchange.")) {
    return { blocked: true, reason: "exchange_shaped" };
  }
  const rows = await query<{ status: string }>(
    client,
    `SELECT status FROM cfg1.prohibited_feature WHERE feature_code = $1 AND status = 'active'`,
    [featureCode],
  );
  if (rows.length > 0) {
    return { blocked: true, reason: "prohibited_registry" };
  }
  return { blocked: false };
}

interface FeatureLookupRow {
  current_state: string;
  version: number;
}

/**
 * Pure decision logic + reads only — no writes. Runs `verifyDecisionTimeIntegrity` FIRST,
 * unconditionally (see class-level comment on step 9's reordering).
 */
export async function evaluateFeature(client: PoolClient, input: EvaluateFeatureInput): Promise<EvaluateOutcome> {
  const integrity = await verifyDecisionTimeIntegrity(client);
  if (integrity.status !== "verified") {
    return { kind: "integrity_failed", scopes: integrity.scopes };
  }

  const payloadHash = computeDecisionPayloadHash(input);
  const licenceProfileVersion = integrity.licenceProfileVersion as number;
  const prohibitedRegistryVersion = integrity.prohibitedRegistryVersion as number;
  const prohibitedRegistryHash = integrity.prohibitedRegistryHash as string;
  const doc00SourceVersion = integrity.doc00SourceVersion as string;

  function deny(reasonCode: DecisionReasonCode, featureConfigVersion: number | null = null): EvaluateOutcome {
    return {
      kind: "decision",
      result: {
        decision: "deny",
        reasonCode,
        featureConfigVersion,
        licenceProfileVersion,
        prohibitedRegistryVersion,
        prohibitedRegistryHash,
        doc00SourceVersion,
        payloadHash,
      },
    };
  }

  // Step 1 — prohibited feature deny (highest precedence; checked before anything else that
  // could allow).
  const prohibitedRows = await query<ProhibitedFeatureLookupRow>(
    client,
    `SELECT applies_until FROM cfg1.prohibited_feature WHERE feature_code = $1 AND status = 'active'`,
    [input.featureCode],
  );
  if (prohibitedRows.length > 0) {
    const row = prohibitedRows[0]!;
    return deny(row.applies_until === "until_formal_exchange_licence_approval" ? "exchange_pending_locked" : "prohibited");
  }

  // Step 6 (Phase 3B) — kill-switch deny. Live, unversioned, no seal — see lib/kill-switch.ts's
  // own header comment for why. Checked here, BEFORE the feature-row lookup (same reasoning as
  // the prohibited-feature check immediately above it): a feature_code can be kill-switched
  // even if no cfg1.feature row exists for it yet (a pre-emptive emergency block), so this must
  // not be gated behind "does a feature row exist". Prohibited/licence restrictions still
  // outrank kill-switch (checked first, above); kill-switch outranks ordinary feature-state
  // allow (checked below).
  if (await isKillSwitchActiveForFeature(client, input.featureCode)) {
    return deny("kill_switch_active");
  }

  // Steps 2-8 — feature lookup. See class-level comment: steps 2/3/8 are live mechanisms with
  // no real data outside test fixtures this phase; steps 4/5/6/7 have no schema support at all
  // yet. A feature_code with no prohibited_feature row and no feature row is simply unknown.
  const featureRows = await query<FeatureLookupRow>(
    client,
    `SELECT current_state, version FROM cfg1.feature WHERE feature_code = $1`,
    [input.featureCode],
  );
  if (featureRows.length === 0) {
    // Step 12 — default deny.
    return deny("unknown_fail_closed");
  }
  const feature = featureRows[0]!;

  // Step 10 — stale requested version, interpreted against prohibited_registry_version (see
  // class-level comment for why).
  if (
    input.requestedConfigVersion !== undefined &&
    input.requestedConfigVersion !== null &&
    input.requestedConfigVersion !== prohibitedRegistryVersion
  ) {
    return deny("stale_revalidate", feature.version);
  }

  // Step 8 / Step 11 — feature state.
  if (feature.current_state !== "enabled") {
    return deny("feature_disabled", feature.version);
  }

  return {
    kind: "decision",
    result: {
      decision: "allow",
      reasonCode: "feature_allowed",
      featureConfigVersion: feature.version,
      licenceProfileVersion,
      prohibitedRegistryVersion,
      prohibitedRegistryHash,
      doc00SourceVersion,
      payloadHash,
    },
  };
}

export interface LogFeatureEvaluationContext {
  requestId: string;
  correlationId: string;
  occurredAtUtc: string;
}

/**
 * Writes the decision_log row and publishes the audit event(s) for ONE evaluate() call, on the
 * SAME transaction as the caller's `withTransaction` block (approved decisions #10/#11: no
 * decision response is ever returned without this having durably committed first). Covers
 * BOTH outcome kinds — an integrity failure is still logged and audited, not silently thrown
 * away; per blueprint §5.4A rule 5, an out-of-band config change must itself emit a Critical
 * SEC-01 alert, which only happens if this function runs for the integrity-failed case too.
 */
export async function logFeatureEvaluation(
  client: PoolClient,
  outcome: EvaluateOutcome,
  input: EvaluateFeatureInput,
  ctx: LogFeatureEvaluationContext,
): Promise<{ decisionId: string; decisionLogId: string }> {
  const decisionId = "cfgdec_" + randomUUID();
  const decisionLogId = "cfgdeclog_" + randomUUID();

  if (outcome.kind === "integrity_failed") {
    const payloadHash = computeDecisionPayloadHash(input);
    await client.query(
      `INSERT INTO cfg1.feature_decision_log
         (decision_log_id, decision_id, feature_code, action, resource, caller_module, client_id, client_class, environment,
          requested_config_version, decision, reason_code, feature_config_version, licence_profile_version,
          prohibited_registry_version, prohibited_registry_hash, doc00_source_version, integrity_status, payload_hash,
          audit_event_ref, request_id, correlation_id, occurred_at_utc)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'deny','config_integrity_failed',NULL,NULL,NULL,NULL,NULL,'failed',$11,$12,$13,$14,$15)`,
      [
        decisionLogId,
        decisionId,
        input.featureCode,
        input.action,
        input.resource ?? null,
        input.callerModule,
        input.clientId ?? null,
        input.clientClass ?? null,
        input.environment,
        input.requestedConfigVersion ?? null,
        payloadHash,
        `corr:${ctx.correlationId}:cfg1.integrity_check.failed`,
        ctx.requestId,
        ctx.correlationId,
        ctx.occurredAtUtc,
      ],
    );

    await publishAudit(client, {
      event_type: "cfg1.feature_evaluation.denied",
      source_module: "CFG-01",
      actor_id: input.callerModule,
      actor_type: "service",
      entity_type: "feature",
      entity_id: input.featureCode,
      severity: "critical",
      action: input.action,
      result: "blocked",
      client_id: input.clientId ?? undefined,
      reason_code: "config_integrity_failed",
      metadata: { decision_id: decisionId, scopes: outcome.scopes },
    });
    // Distinct, additional Critical event — this IS the "out-of-band change -> Critical SEC-01
    // alert" blueprint §5.4A rule 5 requires, not merely a normal deny.
    await publishAudit(client, {
      event_type: "cfg1.integrity_check.failed",
      source_module: "CFG-01",
      actor_id: input.callerModule,
      actor_type: "service",
      entity_type: "feature",
      entity_id: input.featureCode,
      severity: "critical",
      action: "integrity_check",
      result: "failure",
      metadata: { decision_id: decisionId, scopes: outcome.scopes },
    });

    return { decisionId, decisionLogId };
  }

  const { result } = outcome;
  await client.query(
    `INSERT INTO cfg1.feature_decision_log
       (decision_log_id, decision_id, feature_code, action, resource, caller_module, client_id, client_class, environment,
        requested_config_version, decision, reason_code, feature_config_version, licence_profile_version,
        prohibited_registry_version, prohibited_registry_hash, doc00_source_version, integrity_status, payload_hash,
        audit_event_ref, request_id, correlation_id, occurred_at_utc)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'verified',$18,$19,$20,$21,$22)`,
    [
      decisionLogId,
      decisionId,
      input.featureCode,
      input.action,
      input.resource ?? null,
      input.callerModule,
      input.clientId ?? null,
      input.clientClass ?? null,
      input.environment,
      input.requestedConfigVersion ?? null,
      result.decision,
      result.reasonCode,
      result.featureConfigVersion,
      result.licenceProfileVersion,
      result.prohibitedRegistryVersion,
      result.prohibitedRegistryHash,
      result.doc00SourceVersion,
      result.payloadHash,
      `corr:${ctx.correlationId}:cfg1.feature_evaluation.${result.decision === "allow" ? "allowed" : "denied"}`,
      ctx.requestId,
      ctx.correlationId,
      ctx.occurredAtUtc,
    ],
  );

  const isProhibitedReason = result.reasonCode === "prohibited" || result.reasonCode === "exchange_pending_locked";

  await publishAudit(client, {
    event_type: result.decision === "allow" ? "cfg1.feature_evaluation.allowed" : "cfg1.feature_evaluation.denied",
    source_module: "CFG-01",
    actor_id: input.callerModule,
    actor_type: "service",
    entity_type: "feature",
    entity_id: input.featureCode,
    severity: isProhibitedReason ? "critical" : result.decision === "allow" ? "medium" : "high",
    action: input.action,
    result: result.decision === "allow" ? "success" : "blocked",
    client_id: input.clientId ?? undefined,
    reason_code: result.reasonCode,
    metadata: { decision_id: decisionId, environment: input.environment },
  });

  if (isProhibitedReason) {
    // Additional Critical event, layered on top of the base .denied event — mirrors SEC-01
    // Phase 5's own precedent of a decision triggering an extra Critical alert-hook event.
    await publishAudit(client, {
      event_type: "cfg1.prohibited_feature.blocked",
      source_module: "CFG-01",
      actor_id: input.callerModule,
      actor_type: "service",
      entity_type: "feature",
      entity_id: input.featureCode,
      severity: "critical",
      action: input.action,
      result: "blocked",
      client_id: input.clientId ?? undefined,
      reason_code: result.reasonCode,
      metadata: { decision_id: decisionId },
    });
  }

  return { decisionId, decisionLogId };
}
