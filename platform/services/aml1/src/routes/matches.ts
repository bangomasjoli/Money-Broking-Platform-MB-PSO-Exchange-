/**
 * AML-01 Phase 2B — match inventory, sensitive-detail read, and human match disposition
 * (confirm/dismiss) routes (approved Phase 2B scope, internal-only).
 *
 * The match-inventory route (`GET .../screening-requests/:id/matches`) exists because NO prior
 * AML-01 route ever returns `screening_match_id` — every disposition route below is keyed by it,
 * so without this route the disposition workflow would be unreachable (a real gap caught during
 * Phase 2B planning, not discovered later). It is deliberately PII-free (no `matched_name`/
 * `match_detail`/`score`/`list_source`) so routine review never needs the sensitive-read route.
 *
 * Disposition (`confirm`/`dismiss`) follows the SAME request/apply + IAM-02 execute-verify pattern
 * every prior maker-checker table in this codebase uses (mirrors CLT-01's own
 * `duplicate-candidates.ts`): `payload_hash` snapshotted at request time over
 * `{decision_id, screening_match_id, decision_type, reason, requested_by}`, recomputed from the
 * STORED row at apply time (never from caller-supplied apply input); `execute-verify`'s `actor_id`
 * bound to the stored row's own `requested_by` (the maker, never a caller-presented arbitrary
 * actor); token-consumed-after-verify (only `fingerprint(token)` is ever stored, never the raw
 * token). `potential_match` -> `confirmed_hit`/`dismissed` are BOTH terminal — no re-open path; a
 * wrong disposition is corrected by a fresh screening request, never by mutating history.
 *
 * Strict SoD (approved Phase 2B mandatory design decision): the disposition requester may never
 * equal the ORIGINAL screening request's own `requested_by` (`AML1_SELF_DISPOSITION_BLOCKED`,
 * checked once at request time, mirroring CLT-01's own self-review-block precedent) — combined
 * with IAM-02's own unconditional requester != approver rule, the normal workflow needs the
 * screener, the disposition requester, and the approver as three distinct identities.
 *
 * Apply's concurrency guard uses `SELECT ... FOR UPDATE` on BOTH the decision row and the target
 * match row inside the transaction (mirrors CLT-01's own `duplicate-candidates.ts` apply routes
 * exactly) — a genuine concurrent-apply race resolves to a clean `AML1_DISPOSITION_INVALID_STATE`
 * (decision already applied) or `AML1_MATCH_INVALID_STATE` (match already resolved by a
 * DIFFERENT decision row for the same match), never a silent double-apply.
 *
 * The sensitive-detail route is the ONLY AML-01 route that ever returns `matched_name`/
 * `match_detail`/`score`/`list_source` — write-before-return, same-transaction, fail-closed
 * `aml1.sensitive_match_detail_read` audit (if the audit write fails, the read fails as
 * `AML1_AUDIT_REQUIRED` — no unlogged sensitive disclosure, ever, mirrors SEC-01's own
 * `sec1.audit_event.read_sensitive` discipline).
 *
 * All routes internal-identity-guarded AND IAM-02-gated (via AML-01's own `lib/iam2-client.ts`,
 * F3(c)-clean). No public route. No list/search endpoint beyond the one bounded, PII-free
 * inventory read.
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { fingerprint, getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeAml1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { checkPermission, verifyDecisionToken, type Iam2ClientConfig } from "../lib/iam2-client.js";
import { checkSelfDispositionBlocked, decisionPayload, dispositionNotFound, matchNotFound, targetMatchStatusFor, validateMatchTransition, type MatchDispositionType } from "../lib/match-disposition.js";
import { emitRiskSignal } from "../lib/risk-signals.js";
import { Aml1Error } from "../lib/errors.js";
import type { Aml1Config } from "../config.js";

const ScreeningRequestIdParams = Type.Object({ screening_request_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const ScreeningMatchIdParams = Type.Object({ screening_match_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const ActorQuery = Type.Object({ actor_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const DispositionRequestBody = Type.Object(
  { requested_by: Type.String({ minLength: 1, maxLength: 64 }), reason: Type.Optional(Type.String({ maxLength: 128 })) },
  { additionalProperties: false },
);
const DispositionApplyBody = Type.Object(
  {
    decision_id: Type.String({ minLength: 1, maxLength: 64 }),
    approval_id: Type.String({ minLength: 1, maxLength: 64 }),
    decision_token: Type.String({ minLength: 1, maxLength: 512 }),
  },
  { additionalProperties: false },
);

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Aml1Error("AML1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function iam2Config(app: FastifyInstance): Iam2ClientConfig {
  const config = app.config as Aml1Config;
  return { baseUrl: config.iam2BaseUrl, internalServiceToken: config.iam2InternalServiceToken, fetchImpl: config.iam2FetchImpl };
}

interface MatchInventoryRow {
  screening_match_id: string;
  category: string;
  match_status: string;
  reviewed_at_utc: string | null;
}

interface SensitiveMatchDetailRow {
  screening_match_id: string;
  category: string;
  match_status: string;
  matched_name: string;
  match_detail: string | null;
  score: string;
  list_source: string;
  screening_request_id: string;
}

interface MatchWithScreeningContextRow {
  screening_match_id: string;
  match_status: string;
  screening_request_id: string;
  screening_requested_by: string;
  subject_type: string;
  subject_ref: string;
  subject_parent_ref: string | null;
}

interface DecisionRequestRow {
  decision_id: string;
  screening_match_id: string;
  decision_type: MatchDispositionType;
  reason: string | null;
  requested_by: string;
  status: string;
}

async function assertScreeningRequestExists(screeningRequestId: string): Promise<void> {
  const rows = await query<{ screening_request_id: string }>(getPool(), `SELECT screening_request_id FROM aml1.screening_request WHERE screening_request_id = $1`, [screeningRequestId]);
  if (rows.length === 0) throw new Aml1Error("AML1_SCREENING_REQUEST_NOT_FOUND");
}

async function fetchMatchWithScreeningContextOrThrow(screeningMatchId: string): Promise<MatchWithScreeningContextRow> {
  const rows = await query<MatchWithScreeningContextRow>(
    getPool(),
    `SELECT sm.screening_match_id, sm.match_status, sq.screening_request_id, sq.requested_by AS screening_requested_by,
            sq.subject_type, sq.subject_ref, sq.subject_parent_ref
       FROM aml1.screening_match sm
       JOIN aml1.screening_result sr ON sr.screening_result_id = sm.screening_result_id
       JOIN aml1.screening_request sq ON sq.screening_request_id = sr.screening_request_id
      WHERE sm.screening_match_id = $1`,
    [screeningMatchId],
  );
  const row = rows[0];
  if (!row) matchNotFound();
  return row;
}

/** Single safe-response projection point for disposition results — no PII (never `matched_name`/
 * `match_detail`/`score`/`list_source`). */
function safeMatchDispositionResponse(row: { screening_match_id: string; category: string; match_status: string; reviewed_by: string | null; reviewed_at_utc: string | null }) {
  return {
    screening_match_id: row.screening_match_id,
    category: row.category,
    match_status: row.match_status,
    reviewed_by: row.reviewed_by,
    reviewed_at_utc: row.reviewed_at_utc,
  };
}

export async function registerMatchRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeAml1InternalIdentityGuard((app.config as Aml1Config).aml1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // GET /internal/aml1/screening-requests/:screening_request_id/matches
  // PII-free match inventory — the only way to discover a screening_match_id for disposition.
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/aml1/screening-requests/:screening_request_id/matches",
    { preHandler: requireInternal, schema: { params: ScreeningRequestIdParams, querystring: ActorQuery } },
    async (request, reply) => {
      const { screening_request_id } = request.params as { screening_request_id: string };
      const { actor_id } = request.query as Static<typeof ActorQuery>;
      assertPoolAvailable();

      const baseline = await checkPermission(iam2Config(app), { actorId: actor_id, action: "aml1.screening.read", resource: "screening", entityId: screening_request_id });
      if (!baseline.allowed) throw new Aml1Error(baseline.reason === "iam2_unavailable" ? "AML1_IAM2_UNAVAILABLE" : "AML1_PERMISSION_DENIED");

      await assertScreeningRequestExists(screening_request_id);

      const rows = await query<MatchInventoryRow>(
        getPool(),
        `SELECT sm.screening_match_id, sm.category, sm.match_status, sm.reviewed_at_utc
           FROM aml1.screening_match sm
           JOIN aml1.screening_result sr ON sr.screening_result_id = sm.screening_result_id
          WHERE sr.screening_request_id = $1
          ORDER BY sm.created_at_utc`,
        [screening_request_id],
      );

      return reply.send(
        successEnvelope(
          { screening_request_id, matches: rows.map((r) => ({ screening_match_id: r.screening_match_id, category: r.category, match_status: r.match_status, reviewed_at_utc: r.reviewed_at_utc })) },
          meta(request),
        ),
      );
    },
  );

  // -------------------------------------------------------------------------------------------
  // GET /internal/aml1/matches/:screening_match_id/sensitive-detail
  // The ONLY AML-01 route returning matched_name/match_detail/score/list_source. Single record
  // only — no list/search endpoint.
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/aml1/matches/:screening_match_id/sensitive-detail",
    { preHandler: requireInternal, schema: { params: ScreeningMatchIdParams, querystring: ActorQuery } },
    async (request, reply) => {
      const { screening_match_id } = request.params as { screening_match_id: string };
      const { actor_id } = request.query as Static<typeof ActorQuery>;
      assertPoolAvailable();

      // Permission checked BEFORE the row is fetched (Phase 3A Low-2 fix) — an unpermissioned
      // caller must never learn whether a screening_match_id exists (404 vs 403 existence oracle)
      // and the PII row must never be materialised in-process before authorization is established.
      const baseline = await checkPermission(iam2Config(app), { actorId: actor_id, action: "aml1.screening.sensitive_read", resource: "screening_match", entityId: screening_match_id });
      if (!baseline.allowed) throw new Aml1Error(baseline.reason === "iam2_unavailable" ? "AML1_IAM2_UNAVAILABLE" : "AML1_PERMISSION_DENIED");

      const rows = await query<SensitiveMatchDetailRow>(
        getPool(),
        `SELECT sm.screening_match_id, sm.category, sm.match_status, sm.matched_name, sm.match_detail, sm.score, sm.list_source, sq.screening_request_id
           FROM aml1.screening_match sm
           JOIN aml1.screening_result sr ON sr.screening_result_id = sm.screening_result_id
           JOIN aml1.screening_request sq ON sq.screening_request_id = sr.screening_request_id
          WHERE sm.screening_match_id = $1`,
        [screening_match_id],
      );
      const row = rows[0];
      if (!row) matchNotFound();

      // Write-before-return, same transaction, fail-closed — if the audit write fails, the read
      // fails. No PII in audit metadata (screening_match_id/screening_request_id/category only).
      try {
        await withTransaction((client) =>
          publishAudit(client, {
            event_type: "aml1.sensitive_match_detail_read",
            source_module: "AML-01",
            actor_id,
            actor_type: "user",
            entity_type: "screening_match",
            entity_id: screening_match_id,
            severity: "high",
            action: "screening_match.sensitive_read",
            result: "success",
            metadata: { screening_match_id, screening_request_id: row.screening_request_id, category: row.category },
          }),
        );
      } catch (err) {
        throw new Aml1Error("AML1_AUDIT_REQUIRED", { cause: err });
      }

      // Exactly the approved 6-field set (Phase 2B scope) — deliberately no screening_match_id
      // echo (the caller already has it from the URL param); adding it would be unrequested scope.
      return reply.send(
        successEnvelope(
          { category: row.category, match_status: row.match_status, matched_name: row.matched_name, match_detail: row.match_detail, score: row.score, list_source: row.list_source },
          meta(request),
        ),
      );
    },
  );

  // -------------------------------------------------------------------------------------------
  // Shared factory for confirm/request and dismiss/request — structurally identical apart from
  // decision_type/action/event metadata, mirrors CLT-01's own registerResolutionRequest factory.
  // -------------------------------------------------------------------------------------------
  function registerDispositionRequest(decisionType: MatchDispositionType, action: string): void {
    app.post(
      `/internal/aml1/matches/:screening_match_id/${decisionType}/request`,
      { preHandler: requireInternal, schema: { params: ScreeningMatchIdParams, body: DispositionRequestBody } },
      async (request, reply) => {
        const { screening_match_id } = request.params as { screening_match_id: string };
        const body = request.body as Static<typeof DispositionRequestBody>;
        assertPoolAvailable();

        const target = await fetchMatchWithScreeningContextOrThrow(screening_match_id);
        validateMatchTransition(target.match_status);

        // Strict SoD — request-time-only check (see file header). Checked BEFORE the IAM-02
        // baseline call, same ordering CLT-01's own self-block check uses.
        checkSelfDispositionBlocked(body.requested_by, target.screening_requested_by);

        const baseline = await checkPermission(iam2Config(app), { actorId: body.requested_by, action, resource: "screening_match", entityId: screening_match_id });
        if (!baseline.allowed) throw new Aml1Error(baseline.reason === "iam2_unavailable" ? "AML1_IAM2_UNAVAILABLE" : "AML1_PERMISSION_DENIED");

        const decisionId = "aml1disp_" + randomUUID();
        const payloadHash = fingerprint(decisionPayload({ decision_id: decisionId, screening_match_id, decision_type: decisionType, reason: body.reason ?? null, requested_by: body.requested_by }));

        try {
          await withTransaction(async (client) => {
            await client.query(
              `INSERT INTO aml1.match_disposition_decision_request
                 (decision_id, screening_match_id, decision_type, reason, requested_by, status, payload_hash, request_id, correlation_id)
               VALUES ($1,$2,$3,$4,$5,'requested',$6,$7,$8)`,
              [decisionId, screening_match_id, decisionType, body.reason ?? null, body.requested_by, payloadHash, request.ctx.request_id, request.ctx.correlation_id],
            );
            await publishAudit(client, {
              event_type: "aml1.match_disposition_requested",
              source_module: "AML-01",
              actor_id: body.requested_by,
              actor_type: "user",
              entity_type: "screening_match",
              entity_id: screening_match_id,
              severity: "medium",
              action: `screening_match.${decisionType}_request`,
              result: "success",
              metadata: { decision_id: decisionId, screening_match_id, decision_type: decisionType },
            });
          });
        } catch (err) {
          if (err instanceof Aml1Error) throw err;
          throw new Aml1Error("AML1_AUDIT_REQUIRED", { cause: err });
        }

        return reply.code(201).send(successEnvelope({ decision_id: decisionId, screening_match_id, status: "requested", payload_hash: payloadHash }, meta(request)));
      },
    );
  }

  // -------------------------------------------------------------------------------------------
  // Shared factory for confirm/apply and dismiss/apply — mirrors CLT-01's own
  // registerResolutionApply factory, including the FOR-UPDATE-locked race-safe transaction.
  // -------------------------------------------------------------------------------------------
  function registerDispositionApply(decisionType: MatchDispositionType, action: string, appliedEventType: string): void {
    const targetStatus = targetMatchStatusFor(decisionType);

    app.post(
      `/internal/aml1/matches/:screening_match_id/${decisionType}/apply`,
      { preHandler: requireInternal, schema: { params: ScreeningMatchIdParams, body: DispositionApplyBody } },
      async (request, reply) => {
        const { screening_match_id } = request.params as { screening_match_id: string };
        const body = request.body as Static<typeof DispositionApplyBody>;
        assertPoolAvailable();
        const iam2 = iam2Config(app);

        const decisionRows = await query<DecisionRequestRow>(
          getPool(),
          `SELECT decision_id, screening_match_id, decision_type, reason, requested_by, status FROM aml1.match_disposition_decision_request WHERE decision_id = $1`,
          [body.decision_id],
        );
        const decisionRow = decisionRows[0];
        if (!decisionRow || decisionRow.decision_type !== decisionType || decisionRow.screening_match_id !== screening_match_id) {
          dispositionNotFound();
        }
        if (decisionRow.status !== "requested") throw new Aml1Error("AML1_DISPOSITION_INVALID_STATE");

        const target = await fetchMatchWithScreeningContextOrThrow(screening_match_id);
        validateMatchTransition(target.match_status);

        const baseline = await checkPermission(iam2, { actorId: decisionRow.requested_by, action, resource: "screening_match", entityId: screening_match_id });
        if (!baseline.allowed) throw new Aml1Error(baseline.reason === "iam2_unavailable" ? "AML1_IAM2_UNAVAILABLE" : "AML1_PERMISSION_DENIED");

        const currentPayloadHash = fingerprint(decisionPayload(decisionRow));
        const verify = await verifyDecisionToken(iam2, {
          decisionToken: body.decision_token,
          approvalId: body.approval_id,
          actorId: decisionRow.requested_by,
          action,
          resource: "screening_match",
          entityId: screening_match_id,
          currentPayloadHash,
        });
        // Phase 3A Low-1 fix — distinguish "IAM-02 reachable but rejected" from "IAM-02 could not
        // be reached", mirroring the ternary already used at every checkPermission call site above.
        if (!verify.authorised) throw new Aml1Error(verify.reason === "iam2_unavailable" ? "AML1_IAM2_UNAVAILABLE" : "AML1_APPROVAL_REQUIRED");

        const requestedBy = decisionRow.requested_by;

        type ApplyOutcome = { kind: "raced"; error: Aml1Error } | { kind: "applied"; category: string; reviewedAtUtc: string };
        let outcome: ApplyOutcome;
        try {
          outcome = await withTransaction(async (client) => {
            const lockedDecision = await client.query<{ status: string }>(`SELECT status FROM aml1.match_disposition_decision_request WHERE decision_id = $1 FOR UPDATE`, [body.decision_id]);
            if (lockedDecision.rows[0]?.status !== "requested") {
              return { kind: "raced", error: new Aml1Error("AML1_DISPOSITION_INVALID_STATE") };
            }
            const lockedMatch = await client.query<{ match_status: string; category: string }>(
              `SELECT match_status, category FROM aml1.screening_match WHERE screening_match_id = $1 FOR UPDATE`,
              [screening_match_id],
            );
            if (lockedMatch.rows[0]?.match_status !== "potential_match") {
              return { kind: "raced", error: new Aml1Error("AML1_MATCH_INVALID_STATE") };
            }

            const updated = await client.query<{ reviewed_at_utc: string }>(
              `UPDATE aml1.screening_match SET
                 match_status = $2, reviewed_by = $3, reviewed_at_utc = now(), approval_id = $4, version = version + 1, updated_at_utc = now()
               WHERE screening_match_id = $1
               RETURNING reviewed_at_utc`,
              [screening_match_id, targetStatus, requestedBy, body.approval_id],
            );
            await client.query(
              `UPDATE aml1.match_disposition_decision_request SET
                 status = 'applied', approval_id = $2, decision_token_hash = $3, applied_at_utc = now()
               WHERE decision_id = $1`,
              [body.decision_id, body.approval_id, fingerprint(body.decision_token)],
            );
            await publishAudit(client, {
              event_type: appliedEventType,
              source_module: "AML-01",
              actor_id: requestedBy,
              actor_type: "user",
              entity_type: "screening_match",
              entity_id: screening_match_id,
              severity: "high",
              action: `screening_match.${decisionType}`,
              result: "success",
              metadata: { decision_id: body.decision_id, screening_match_id, decision_type: decisionType, match_status: targetStatus, category: lockedMatch.rows[0]!.category, approval_id: body.approval_id },
            });

            // Phase 3C (confirmed decision D9) — a HUMAN-confirmed match emits a critical, open
            // risk signal in the SAME transaction as the disposition itself (atomic — a confirmed
            // hit is never recorded without its signal). Never fired for "dismiss" — a dismissal is
            // the opposite finding. Duplicate-suppressed by lib/risk-signals.ts's own dedup (keyed
            // on screening_match_id) — see that file's header comment for why this can never
            // actually collide given confirm's own terminal, once-only state transition.
            if (decisionType === "confirm") {
              await emitRiskSignal(client, {
                signalType: "confirmed_hit",
                subjectType: target.subject_type,
                subjectRef: target.subject_ref,
                subjectParentRef: target.subject_parent_ref,
                screeningRequestId: target.screening_request_id,
                screeningMatchId: screening_match_id,
                severity: "critical",
                actorId: requestedBy,
                actorType: "user",
                requestId: request.ctx.request_id,
                correlationId: request.ctx.correlation_id,
              });
            }

            return { kind: "applied", category: lockedMatch.rows[0]!.category, reviewedAtUtc: updated.rows[0]!.reviewed_at_utc };
          });
        } catch (err) {
          if (err instanceof Aml1Error) throw err;
          throw new Aml1Error("AML1_AUDIT_REQUIRED", { cause: err });
        }

        if (outcome.kind === "raced") throw outcome.error;

        return reply.send(
          successEnvelope(
            {
              ...safeMatchDispositionResponse({ screening_match_id, category: outcome.category, match_status: targetStatus, reviewed_by: requestedBy, reviewed_at_utc: outcome.reviewedAtUtc }),
              redelivery_required: true,
              screening_request_id: target.screening_request_id,
            },
            meta(request),
          ),
        );
      },
    );
  }

  registerDispositionRequest("confirm", "aml1.match.confirm");
  registerDispositionRequest("dismiss", "aml1.match.dismiss");
  registerDispositionApply("confirm", "aml1.match.confirm", "aml1.match_disposition_confirmed");
  registerDispositionApply("dismiss", "aml1.match.dismiss", "aml1.match_disposition_dismissed");
}
