/**
 * SEC-01 Phase 5 security alert lifecycle routes (`04_API_Specification.md` §6;
 * `06_State_Machine.md` §2; `docs/implementation/SEC-01_Phase5_Implementation_Plan_v1.0.md`).
 *
 * INTERNAL routes this phase, same posture as Phase 4's `routes/read.ts` — no session/cookie
 * authentication mechanism exists anywhere in this codebase yet; `actor_id`/`session_id` are
 * trusted request fields from an already-authenticated caller, guarded by the GENERIC
 * internal-identity guard (`plugins/internal-identity.ts`), the same one every non-ingestion
 * internal route since Phase 3 uses.
 *
 * AUTHORIZATION ORDER (fixed, mirrors `routes/read.ts`):
 *   1. Schema validation (Fastify/TypeBox).
 *   2. IAM-02 permission check for the specific action — a non-allow is a HARD STOP,
 *      `SEC1_UNAUTHORISED_ALERT_ACTION` (or `SEC1_IAM02_REGISTRY_MISSING` for a catalogue gap).
 *   3. ONLY THEN does the route query the database — a detail read's 404 is always AFTER
 *      authorization, never before (an unauthorized caller never learns whether the alert
 *      exists).
 *
 * MUTATIONS (assign/triage/close/replay) all require the standard `Idempotency-Key` header,
 * same discipline as every other mutating endpoint in this codebase; search/read do not (read/
 * decision operations, not mutations with replay risk — same reasoning `routes/read.ts` already
 * documents for its own two routes).
 *
 * CRITICAL ALERT CLOSURE (§7 of the approved implementation brief): IAM-02's
 * `sec1.security_alert.close` permission is registered with `requires_approval = false` — the
 * guard precedence chain gates `requires_approval` as a static, binary property of the
 * permission CODE, which cannot express "approval required only for Critical severity" (see
 * migration 013's own header comment). The Critical-only requirement is enforced HERE, at the
 * SEC-01 route layer, by additionally requiring a valid IAM-02 approval/decision-token binding
 * this exact alert_id + close payload + actor, verified via IAM-02's EXISTING generic
 * `execute-verify` endpoint (`lib/iam2-client.ts::verifyDecisionToken`) — no new IAM-02 code, no
 * IAM-02 guard change. The approval itself (`/iam2/approvals/request` +
 * `/iam2/approvals/:id/approve`, a maker-checker flow run by an operator OUTSIDE this route,
 * e.g. a future PRT-01/staff-portal BFF or direct operational tooling) is out of this route's
 * own scope — this route only ever VERIFIES+CONSUMES an already-issued token, never mints one.
 */
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  AppError,
  beginIdempotent,
  completeIdempotent,
  fingerprint,
  successEnvelope,
  withTransaction,
  type IdempotencyScope,
} from "@aix/foundation";
import { meta, requireIdempotencyKey } from "../plugins/request-context.js";
import { makeSec1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { checkPermission, verifyDecisionToken, type CheckPermissionResult, type Iam2ClientConfig } from "../lib/iam2-client.js";
import { Sec1Error } from "../lib/errors.js";
import {
  assignAlert,
  closeAlert,
  decodeAlertCursor,
  encodeAlertCursor,
  getAlertDetail,
  searchAlerts,
  triageAlert,
  DEFAULT_ALERT_SEARCH_LIMIT,
  MAX_ALERT_SEARCH_LIMIT,
  type AlertSearchFilters,
} from "../lib/alerts.js";
import { replayDeadLetterRow } from "../lib/monitoring-rules.js";
import { assertDeadLetterFound, countEligibleDeadLetters, fetchDeadLetterForUpdate, listEligibleDeadLetters } from "../lib/monitoring-dead-letter.js";

const AlertFilters = Type.Object(
  {
    status: Type.Optional(
      Type.Union([
        Type.Literal("open"),
        Type.Literal("assigned"),
        Type.Literal("triaged"),
        Type.Literal("escalated"),
        Type.Literal("closed"),
      ]),
    ),
    severity: Type.Optional(
      Type.Union([
        Type.Literal("info"),
        Type.Literal("low"),
        Type.Literal("medium"),
        Type.Literal("high"),
        Type.Literal("critical"),
      ]),
    ),
    rule_id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    assigned_to: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  },
  { additionalProperties: false },
);

const SearchBody = Type.Object(
  {
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    session_id: Type.Optional(Type.String({ maxLength: 64 })),
    filters: Type.Optional(AlertFilters),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_ALERT_SEARCH_LIMIT })),
    cursor: Type.Optional(Type.String({ maxLength: 512 })),
  },
  { additionalProperties: false },
);

const ReadBody = Type.Object(
  {
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    session_id: Type.Optional(Type.String({ maxLength: 64 })),
    alert_id: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);

const AssignBody = Type.Object(
  {
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    session_id: Type.Optional(Type.String({ maxLength: 64 })),
    alert_id: Type.String({ minLength: 1, maxLength: 64 }),
    assigned_to: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);

const TriageBody = Type.Object(
  {
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    session_id: Type.Optional(Type.String({ maxLength: 64 })),
    alert_id: Type.String({ minLength: 1, maxLength: 64 }),
    triage_status: Type.Union([
      Type.Literal("true_positive"),
      Type.Literal("false_positive"),
      Type.Literal("duplicate"),
      Type.Literal("expected"),
      Type.Literal("escalated"),
    ]),
    note: Type.Optional(Type.String({ maxLength: 2000 })),
    evidence_refs: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { maxItems: 20 })),
  },
  { additionalProperties: false },
);

const CloseBody = Type.Object(
  {
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    session_id: Type.Optional(Type.String({ maxLength: 64 })),
    alert_id: Type.String({ minLength: 1, maxLength: 64 }),
    // Both OPTIONAL at the wire-schema level so a missing value produces the distinct
    // SEC1_ALERT_CLOSURE_EVIDENCE_REQUIRED (checked below), not a generic VALIDATION_ERROR.
    closure_reason: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
    closure_evidence_ref: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
    approval_id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    decision_token: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
  },
  { additionalProperties: false },
);

const MAX_REPLAY_LIMIT = 50;
const MAX_REPLAY_BACKLOG_BOUND = 200;

const ReplayBody = Type.Object(
  {
    actor_id: Type.String({ minLength: 1, maxLength: 64 }),
    session_id: Type.Optional(Type.String({ maxLength: 64 })),
    dead_letter_id: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_REPLAY_LIMIT })),
  },
  { additionalProperties: false },
);

function iam2ClientConfig(app: FastifyInstance): Iam2ClientConfig {
  return {
    baseUrl: app.config.iam2BaseUrl,
    internalServiceToken: app.config.iam2InternalServiceToken,
    ...(app.config.iam2FetchImpl ? { fetchImpl: app.config.iam2FetchImpl } : {}),
  };
}

/** Distinct from `routes/read.ts`'s own `denyUnlessAllowed` — alerts are a different resource
 * from audit-event reads, so a denial here surfaces `SEC1_UNAUTHORISED_ALERT_ACTION`, not
 * `SEC1_UNAUTHORISED_AUDIT_READ` (see `lib/errors.ts`'s own header comment for why reusing the
 * audit-read code would be a wire-level semantic bug, not a stylistic choice). */
function denyUnlessAlertActionAllowed(result: CheckPermissionResult): void {
  if (result.allowed) return;
  if (result.reason === "IAM2_PERMISSION_UNKNOWN") {
    throw new Sec1Error("SEC1_IAM02_REGISTRY_MISSING");
  }
  throw new Sec1Error("SEC1_UNAUTHORISED_ALERT_ACTION");
}

export async function registerAlertRoutes(app: FastifyInstance): Promise<void> {
  const requireInternalIdentity = makeSec1InternalIdentityGuard(app.config.sec1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // Search / read — no Idempotency-Key (read/decision operations, not mutations).
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/sec1/security-alerts/search",
    { preHandler: requireInternalIdentity, schema: { body: SearchBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof SearchBody>;
      const iam2Config = iam2ClientConfig(app);

      const baseline = await checkPermission(iam2Config, {
        actorId: body.actor_id,
        ...(body.session_id ? { sessionId: body.session_id } : {}),
        action: "sec1.security_alert.read",
        resource: "security_alert",
      });
      denyUnlessAlertActionAllowed(baseline);

      const filters: AlertSearchFilters = body.filters ?? {};
      const limit = body.limit ?? DEFAULT_ALERT_SEARCH_LIMIT;
      const cursor = decodeAlertCursor(body.cursor);

      const result = await withTransaction((client) => searchAlerts(client, filters, limit, cursor));

      return reply.send(
        successEnvelope(
          { alerts: result.rows, next_cursor: result.nextCursor ? encodeAlertCursor(result.nextCursor) : null },
          meta(request),
        ),
      );
    },
  );

  app.post(
    "/internal/sec1/security-alerts/read",
    { preHandler: requireInternalIdentity, schema: { body: ReadBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof ReadBody>;
      const iam2Config = iam2ClientConfig(app);

      const baseline = await checkPermission(iam2Config, {
        actorId: body.actor_id,
        ...(body.session_id ? { sessionId: body.session_id } : {}),
        action: "sec1.security_alert.read",
        resource: "security_alert",
        entityId: body.alert_id,
      });
      // Hard stop BEFORE any query runs — an unauthorized caller never learns whether the
      // referenced alert exists (404-after-authz, not before).
      denyUnlessAlertActionAllowed(baseline);

      const alert = await withTransaction((client) => getAlertDetail(client, body.alert_id));
      if (!alert) throw new AppError("NOT_FOUND");

      return reply.send(successEnvelope(alert, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // Assign / triage — mutations, Idempotency-Key required.
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/sec1/security-alerts/assign",
    { preHandler: requireInternalIdentity, schema: { body: AssignBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof AssignBody>;
      const iam2Config = iam2ClientConfig(app);

      const baseline = await checkPermission(iam2Config, {
        actorId: body.actor_id,
        ...(body.session_id ? { sessionId: body.session_id } : {}),
        action: "sec1.security_alert.triage",
        resource: "security_alert",
        entityId: body.alert_id,
      });
      denyUnlessAlertActionAllowed(baseline);

      const idempotencyKey = requireIdempotencyKey(request);
      const idemScope: IdempotencyScope = {
        actorId: body.actor_id,
        actorType: "user",
        action: "sec1.security_alert.assign",
        key: idempotencyKey,
        request: body,
        sourceModule: "SEC-01",
      };

      const result = await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") {
          const current = await getAlertDetail(client, body.alert_id);
          if (!current) throw new AppError("NOT_FOUND");
          return current;
        }
        const updated = await assignAlert(client, { alertId: body.alert_id, assignedTo: body.assigned_to });
        await completeIdempotent(client, idemScope, updated.alert_id);
        return updated;
      });

      return reply.send(successEnvelope(result, meta(request)));
    },
  );

  app.post(
    "/internal/sec1/security-alerts/triage",
    { preHandler: requireInternalIdentity, schema: { body: TriageBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof TriageBody>;
      const iam2Config = iam2ClientConfig(app);

      const baseline = await checkPermission(iam2Config, {
        actorId: body.actor_id,
        ...(body.session_id ? { sessionId: body.session_id } : {}),
        action: "sec1.security_alert.triage",
        resource: "security_alert",
        entityId: body.alert_id,
      });
      denyUnlessAlertActionAllowed(baseline);

      const idempotencyKey = requireIdempotencyKey(request);
      const idemScope: IdempotencyScope = {
        actorId: body.actor_id,
        actorType: "user",
        action: "sec1.security_alert.triage_note",
        key: idempotencyKey,
        request: body,
        sourceModule: "SEC-01",
      };

      const result = await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") {
          const current = await getAlertDetail(client, body.alert_id);
          if (!current) throw new AppError("NOT_FOUND");
          return current;
        }
        const updated = await triageAlert(client, {
          alertId: body.alert_id,
          reviewerUserId: body.actor_id,
          triageStatus: body.triage_status,
          ...(body.note ? { note: body.note } : {}),
          ...(body.evidence_refs ? { evidenceRefs: body.evidence_refs } : {}),
        });
        await completeIdempotent(client, idemScope, updated.alert_id);
        return updated;
      });

      return reply.send(successEnvelope(result, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // Close — mutation, Idempotency-Key required; Critical severity additionally requires a
  // verified IAM-02 decision token (see this file's header comment).
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/sec1/security-alerts/close",
    { preHandler: requireInternalIdentity, schema: { body: CloseBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof CloseBody>;
      const iam2Config = iam2ClientConfig(app);

      const baseline = await checkPermission(iam2Config, {
        actorId: body.actor_id,
        ...(body.session_id ? { sessionId: body.session_id } : {}),
        action: "sec1.security_alert.close",
        resource: "security_alert",
        entityId: body.alert_id,
      });
      denyUnlessAlertActionAllowed(baseline);

      // Mandatory on EVERY closure, not just Critical (SEC1-TC-032) — checked before touching
      // idempotency/the DB, same "fail closed before any work" discipline every other route in
      // this codebase follows.
      if (!body.closure_reason || !body.closure_evidence_ref) {
        throw new Sec1Error("SEC1_ALERT_CLOSURE_EVIDENCE_REQUIRED");
      }
      const closureReason = body.closure_reason;
      const closureEvidenceRef = body.closure_evidence_ref;

      const idempotencyKey = requireIdempotencyKey(request);
      const idemScope: IdempotencyScope = {
        actorId: body.actor_id,
        actorType: "user",
        action: "sec1.security_alert.close",
        key: idempotencyKey,
        request: body,
        sourceModule: "SEC-01",
      };

      const idem = await withTransaction((client) => beginIdempotent(client, idemScope));
      // Self-review finding: `beginIdempotent` commits in its OWN transaction here (never
      // inside the same transaction as the eventual write — see this file's header comment on
      // why the network round-trip to IAM-02 must never happen under a held row lock). If a
      // PRIOR attempt under this exact key threw anywhere between here and `completeIdempotent`
      // below (missing alert, missing/invalid/mismatched decision token), that prior attempt's
      // idempotency row is left at `status = 'processing'` forever — `beginIdempotent` itself
      // already fails closed if a retry changes the body (fingerprint mismatch -> a NEW key is
      // required, correct/by-design), but a retry with the IDENTICAL (still-incomplete) body
      // must NOT be silently treated as a successful replay. Only a genuinely `'completed'`
      // record is a real prior success; anything else (most commonly `'processing'`) falls
      // through and REPROCESSES the request from here — reproducing the SAME honest outcome
      // (e.g. the same missing-token error) rather than returning a misleading 200 showing the
      // alert's current, still-unclosed state.
      if (idem.status === "duplicate" && idem.recordStatus === "completed") {
        const current = await withTransaction((client) => getAlertDetail(client, body.alert_id));
        if (!current) throw new AppError("NOT_FOUND");
        return reply.send(successEnvelope(current, meta(request)));
      }

      // Existence + severity PREVIEW — a plain read, no row lock (never hold a Postgres lock
      // across the IAM-02 execute-verify network call below). Authorization already ran above
      // (baseline check), so this existence check is correctly AFTER authz, not before.
      const preview = await withTransaction((client) => getAlertDetail(client, body.alert_id));
      if (!preview) throw new AppError("NOT_FOUND");

      if (preview.severity === "critical") {
        if (!body.approval_id || !body.decision_token) {
          throw new Sec1Error("SEC1_CRITICAL_ALERT_CLOSURE_APPROVAL_REQUIRED");
        }
        // The exact payload shape an operator must have hashed at IAM-02 approval-CREATION
        // time (`/iam2/approvals/request`'s `payload` field) for the resulting decision token
        // to verify here — documented as an operational contract in the Phase 5 implementation
        // notes, since IAM-02's own fingerprint() has no other way to agree on shape.
        const closePayload = {
          alert_id: body.alert_id,
          severity: preview.severity,
          closure_reason: closureReason,
          closure_evidence_ref: closureEvidenceRef,
        };
        const currentPayloadHash = fingerprint(closePayload);
        const verify = await verifyDecisionToken(iam2Config, {
          decisionToken: body.decision_token,
          approvalId: body.approval_id,
          actorId: body.actor_id,
          ...(body.session_id ? { sessionId: body.session_id } : {}),
          action: "sec1.security_alert.close",
          resource: "security_alert",
          entityId: body.alert_id,
          // Self-review: bind client_id too, symmetric with entityId, for an alert that
          // happens to carry one (a future client-scoped rule) — otherwise a token an operator
          // legitimately bound to this alert's client_id would fail IAM-02's own binding check
          // (a presented client_id of `undefined` only matches a token bound to `null`).
          ...(preview.client_id ? { clientId: preview.client_id } : {}),
          currentPayloadHash,
        });
        if (!verify.authorised) {
          throw new Sec1Error("SEC1_CRITICAL_ALERT_CLOSURE_APPROVAL_REQUIRED");
        }
      }

      const result = await withTransaction(async (client) => {
        const updated = await closeAlert(client, {
          alertId: body.alert_id,
          closureReason,
          closureEvidenceRef,
        });
        await completeIdempotent(client, idemScope, updated.alert_id);
        return updated;
      });

      return reply.send(successEnvelope(result, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // Dead-letter replay — IAM-02 gated (least privilege: `sec1.security_alert.triage`, per the
  // approved brief — replaying a dead-lettered evaluation is an operational/investigative
  // action, not full closure authority). Route-triggered only; no scheduler/cron this phase.
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/sec1/monitoring-dead-letter/replay",
    { preHandler: requireInternalIdentity, schema: { body: ReplayBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof ReplayBody>;
      const iam2Config = iam2ClientConfig(app);

      const baseline = await checkPermission(iam2Config, {
        actorId: body.actor_id,
        ...(body.session_id ? { sessionId: body.session_id } : {}),
        action: "sec1.security_alert.triage",
        resource: "security_alert",
      });
      denyUnlessAlertActionAllowed(baseline);

      const idempotencyKey = requireIdempotencyKey(request);
      const idemScope: IdempotencyScope = {
        actorId: body.actor_id,
        actorType: "user",
        action: "sec1.monitoring_dead_letter.replay",
        key: idempotencyKey,
        request: body,
        sourceModule: "SEC-01",
      };

      const result = await withTransaction(async (client) => {
        const idem = await beginIdempotent(client, idemScope);
        if (idem.status === "duplicate") {
          return { replayed: [] as Awaited<ReturnType<typeof replayDeadLetterRow>>[] };
        }

        let outcomes: Awaited<ReturnType<typeof replayDeadLetterRow>>[];
        if (body.dead_letter_id) {
          const row = await fetchDeadLetterForUpdate(client, body.dead_letter_id);
          assertDeadLetterFound(row);
          outcomes = [await replayDeadLetterRow(client, row)];
        } else {
          const backlog = await countEligibleDeadLetters(client);
          if (backlog > MAX_REPLAY_BACKLOG_BOUND) {
            throw new Sec1Error("SEC1_ALERT_PIPELINE_BACKLOG", {
              message: `The monitoring dead-letter backlog (${backlog} eligible items) exceeds the single-call replay bound; it needs operational attention before replaying.`,
            });
          }
          const rows = await listEligibleDeadLetters(client, body.limit ?? 20);
          outcomes = [];
          for (const row of rows) {
            outcomes.push(await replayDeadLetterRow(client, row));
          }
        }

        await completeIdempotent(client, idemScope, `replayed:${outcomes.length}`);
        return { replayed: outcomes };
      });

      return reply.send(successEnvelope(result, meta(request)));
    },
  );
}
