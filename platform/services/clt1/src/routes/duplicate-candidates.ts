/**
 * CLT-01 Phase 6 — duplicate-candidate create/update/confirm/dismiss routes plus two bounded
 * read routes (blueprint `05_Database_Design.md` §2.8 generalized to the approved Phase 6 scope —
 * the blueprint itself documents no API route for this table at all).
 *
 * Structural difference from every Phase 3/4 route file, same as Phase 5's `related-party-edges.ts`:
 * `clt1.duplicate_candidate` has NO single owning scope (no `client_id`/`application_id` column),
 * so mutation routes are TOP-LEVEL (`/internal/clt1/duplicate-candidates/...`). Unlike Phase 5,
 * BOTH read routes also live in this file (approved LOCKED DESIGN DECISION 28) rather than being
 * split into `routes/clients.ts`/`routes/applications.ts` — a deliberate, documented variation from
 * Phase 5's placement choice, since `duplicate_candidate` has no owning scope to justify living
 * alongside either of those existing files.
 *
 * `create`/`update`/`confirm`/`dismiss` are request/apply with mandatory IAM-02 execute-verify —
 * the same pattern every prior Phase 2/3/4/5 mutation route uses: `payload_hash` computed over the
 * decision-request row's own snapshotted fields at request time, recomputed from the STORED row at
 * apply time; `execute-verify`'s `actor_id` bound to the stored row's own `requested_by`;
 * token-consumed-after-verify discipline. The blueprint's own single `clt1.duplicate.review`
 * permission (`07_Permission_Rules.md` §2) is generalized into this granular action set — a
 * documented, reasoned extension, the same reasoning already applied to
 * `authorised_party.add/.update/.remove` (Phase 4) and `related_party.add/.update/.remove`
 * (Phase 5).
 *
 * `create/request`'s `entityId` for `checkPermission`/`execute-verify` has no natural single target
 * (no candidate exists yet) — a synthetic composite `${subject_type}:${subject_ref}` (the subject
 * node) is used, mirroring Phase 5's own `add/request` precedent exactly.
 *
 * Node existence validation (does the referenced `application`/`client`/`party` entity actually
 * exist) happens entirely here, at the application layer — no real Postgres FK is possible on the
 * polymorphic `subject_type/subject_ref` (or `matched_`) columns.
 *
 * `create/apply`'s duplicate-open-tuple case is deliberately mapped to a real 409
 * `CLT1_DUPLICATE_CANDIDATE_ALREADY_OPEN`, not collapsed into the generic `CLT1_AUDIT_REQUIRED`
 * (503) catch — applying the lesson from Phase 4's own carried-forward F1 finding and Phase 5's
 * `CLT1_RELATED_PARTY_EDGE_DUPLICATE` mapping a second time. `withTransaction`
 * (packages/foundation/src/db.ts) rolls back and rethrows the RAW, unwrapped pg error on any
 * failure — so the outer catch here can inspect `err.code`/`err.constraint` directly to detect this
 * specific violation before falling back to the generic conversion.
 *
 * Blueprint SoD rule 4 (`07_Permission_Rules.md` §3): `confirm`/`dismiss` requests resolve EVERY
 * `application`-typed side of the pair (subject, matched, or both — a candidate can legitimately be
 * application-vs-application) and block if the requester created ANY of those applications
 * (`CLT1_DUPLICATE_SELF_REVIEW_BLOCKED`) — checked once, at request time, mirroring every prior
 * self-block check in this codebase (Phase 2's `CLT1_SELF_APPROVAL_BLOCKED`, Phase 4's
 * `requireNotSelfAction`) which are also request-time-only, not re-checked at apply.
 */
import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { fingerprint, getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeClt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { checkPermission, verifyDecisionToken, type Iam2ClientConfig } from "../lib/iam2-client.js";
import {
  DUPLICATE_CANDIDATE_NODE_TYPES,
  MATCH_TYPES,
  checkDuplicateSelfReviewBlocked,
  duplicateCandidateNodeNotFound,
  duplicateCandidateNotFound,
  safeDuplicateCandidateResponse,
  validateDuplicateCandidateTransition,
  validateNotSelfCandidate,
  type DuplicateCandidateNodeType,
  type DuplicateCandidateRow,
  type MatchType,
} from "../lib/duplicate-candidates.js";
import { Clt1Error } from "../lib/errors.js";
import type { Clt1Config } from "../config.js";

const DuplicateCandidateIdParams = Type.Object({ duplicate_candidate_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const ApplicationIdParams = Type.Object({ application_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const ClientIdParams = Type.Object({ client_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
const ReadQuery = Type.Object({ actor_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const NodeTypeSchema = Type.Union(DUPLICATE_CANDIDATE_NODE_TYPES.map((t) => Type.Literal(t)));
const MatchTypeSchema = Type.Union(MATCH_TYPES.map((t) => Type.Literal(t)));

const CreateRequestBody = Type.Object(
  {
    subject_type: NodeTypeSchema,
    subject_ref: Type.String({ minLength: 1, maxLength: 64 }),
    matched_type: NodeTypeSchema,
    matched_ref: Type.String({ minLength: 1, maxLength: 64 }),
    match_type: MatchTypeSchema,
    evidence_ref: Type.Optional(Type.String({ maxLength: 256 })),
    requested_by: Type.String({ minLength: 1, maxLength: 64 }),
    reason: Type.Optional(Type.String({ maxLength: 128 })),
  },
  { additionalProperties: false },
);

// LOCKED DESIGN DECISION 13: update/apply updates evidence_ref only — required here (not
// optional) since it is the sole mutable field this route exists to change.
const UpdateRequestBody = Type.Object(
  {
    evidence_ref: Type.String({ maxLength: 256 }),
    requested_by: Type.String({ minLength: 1, maxLength: 64 }),
    reason: Type.Optional(Type.String({ maxLength: 128 })),
  },
  { additionalProperties: false },
);

const ConfirmDismissRequestBody = Type.Object(
  { requested_by: Type.String({ minLength: 1, maxLength: 64 }), reason: Type.Optional(Type.String({ maxLength: 128 })) },
  { additionalProperties: false },
);

const ApplyBody = Type.Object(
  {
    decision_id: Type.String({ minLength: 1, maxLength: 64 }),
    approval_id: Type.String({ minLength: 1, maxLength: 64 }),
    decision_token: Type.String({ minLength: 1, maxLength: 512 }),
  },
  { additionalProperties: false },
);

interface DuplicateCandidateDecisionRow {
  decision_id: string;
  decision_type: "create" | "update" | "confirm" | "dismiss";
  target_duplicate_candidate_id: string | null;
  subject_type: DuplicateCandidateNodeType | null;
  subject_ref: string | null;
  matched_type: DuplicateCandidateNodeType | null;
  matched_ref: string | null;
  match_type: MatchType | null;
  evidence_ref: string | null;
  requested_by: string;
  status: string;
}

interface ClientApplicationRefRow {
  application_id: string;
}

interface ClientProfileRefRow {
  client_id: string;
  status: string;
  application_id: string;
}

function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Clt1Error("CLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function iam2Config(app: FastifyInstance): Iam2ClientConfig {
  const config = app.config as Clt1Config;
  return { baseUrl: config.iam2BaseUrl, internalServiceToken: config.iam2InternalServiceToken, fetchImpl: config.iam2FetchImpl };
}

/** Node existence validation — no real Postgres FK is possible on the polymorphic
 * subject_type/subject_ref (or matched_) columns, so this check lives entirely here. */
async function validateNodeExists(nodeType: DuplicateCandidateNodeType, ref: string): Promise<void> {
  const tableAndColumn: Record<DuplicateCandidateNodeType, { table: string; column: string }> = {
    application: { table: "clt1.client_application", column: "application_id" },
    client: { table: "clt1.client_profile", column: "client_id" },
    party: { table: "clt1.authorised_party", column: "authorised_party_id" },
  };
  const { table, column } = tableAndColumn[nodeType];
  const rows = await query<{ exists: number }>(getPool(), `SELECT 1 AS exists FROM ${table} WHERE ${column} = $1`, [ref]);
  if (rows.length === 0) duplicateCandidateNodeNotFound();
}

/** Blueprint SoD rule 4 support — resolves EVERY side of the pair that is `application`-typed
 * (subject, matched, or both — a candidate can legitimately be application-vs-application) and
 * returns their `client_application.created_by` values, so the caller can block against either
 * side, not just the subject. Returns an empty array if neither side is an application (in which
 * case `checkDuplicateSelfReviewBlocked` is a documented no-op). */
async function resolveApplicationCreatedByValues(
  subjectType: DuplicateCandidateNodeType,
  subjectRef: string,
  matchedType: DuplicateCandidateNodeType,
  matchedRef: string,
): Promise<string[]> {
  const applicationRefs = Array.from(
    new Set([subjectType === "application" ? subjectRef : null, matchedType === "application" ? matchedRef : null].filter((ref): ref is string => ref !== null)),
  );
  if (applicationRefs.length === 0) return [];
  const rows = await query<{ created_by: string }>(getPool(), `SELECT created_by FROM clt1.client_application WHERE application_id = ANY($1)`, [applicationRefs]);
  return rows.map((r) => r.created_by);
}

function decisionPayload(row: {
  decision_id: string;
  decision_type: string;
  target_duplicate_candidate_id: string | null;
  subject_type: string | null;
  subject_ref: string | null;
  matched_type: string | null;
  matched_ref: string | null;
  match_type: string | null;
  evidence_ref: string | null;
  requested_by: string;
}): Record<string, unknown> {
  return {
    decision_id: row.decision_id,
    decision_type: row.decision_type,
    target_duplicate_candidate_id: row.target_duplicate_candidate_id,
    subject_type: row.subject_type,
    subject_ref: row.subject_ref,
    matched_type: row.matched_type,
    matched_ref: row.matched_ref,
    match_type: row.match_type,
    evidence_ref: row.evidence_ref,
    requested_by: row.requested_by,
  };
}

/** Detects the specific partial-unique-index violation this table can raise (migration 029's
 * `idx_clt1_duplicate_candidate_one_open_per_tuple`) so it can be mapped to a real 409, not the
 * generic CLT1_AUDIT_REQUIRED (503) — see file header comment for why. */
function isAlreadyOpenViolation(err: unknown): boolean {
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr?.code === "23505" && pgErr?.constraint === "idx_clt1_duplicate_candidate_one_open_per_tuple";
}

const CREATE_ACTION = "clt1.duplicate_candidate.create";
const UPDATE_ACTION = "clt1.duplicate_candidate.update";
const CONFIRM_ACTION = "clt1.duplicate_candidate.confirm";
const DISMISS_ACTION = "clt1.duplicate_candidate.dismiss";
const READ_ACTION = "clt1.duplicate_candidate.read";

export async function registerDuplicateCandidateRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeClt1InternalIdentityGuard(app.config.clt1InternalServiceToken);

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/duplicate-candidates/create/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/duplicate-candidates/create/request",
    { preHandler: requireInternal, schema: { body: CreateRequestBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof CreateRequestBody>;
      assertPoolAvailable();

      validateNotSelfCandidate(body.subject_type, body.subject_ref, body.matched_type, body.matched_ref);
      await validateNodeExists(body.subject_type, body.subject_ref);
      await validateNodeExists(body.matched_type, body.matched_ref);

      const entityId = `${body.subject_type}:${body.subject_ref}`;
      const baseline = await checkPermission(iam2Config(app), { actorId: body.requested_by, action: CREATE_ACTION, resource: "duplicate_candidate", entityId });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const decisionId = "clt1dcd_" + randomUUID();
      const payloadHash = fingerprint(
        decisionPayload({
          decision_id: decisionId,
          decision_type: "create",
          target_duplicate_candidate_id: null,
          subject_type: body.subject_type,
          subject_ref: body.subject_ref,
          matched_type: body.matched_type,
          matched_ref: body.matched_ref,
          match_type: body.match_type,
          evidence_ref: body.evidence_ref ?? null,
          requested_by: body.requested_by,
        }),
      );

      try {
        await withTransaction(async (txClient) => {
          await txClient.query(
            `INSERT INTO clt1.duplicate_candidate_decision_request
               (decision_id, decision_type, subject_type, subject_ref, matched_type, matched_ref, match_type, evidence_ref, reason, requested_by, status, payload_hash, request_id, correlation_id)
             VALUES ($1,'create',$2,$3,$4,$5,$6,$7,$8,$9,'requested',$10,$11,$12)`,
            [
              decisionId,
              body.subject_type,
              body.subject_ref,
              body.matched_type,
              body.matched_ref,
              body.match_type,
              body.evidence_ref ?? null,
              body.reason ?? null,
              body.requested_by,
              payloadHash,
              request.ctx.request_id,
              request.ctx.correlation_id,
            ],
          );
          await publishAudit(txClient, {
            event_type: "clt1.duplicate_candidate_create_requested",
            source_module: "CLT-01",
            actor_id: body.requested_by,
            actor_type: "user",
            entity_type: "duplicate_candidate",
            entity_id: decisionId,
            severity: "medium",
            action: "duplicate_candidate.create_request",
            result: "success",
            metadata: { decision_id: decisionId, subject_type: body.subject_type, matched_type: body.matched_type, match_type: body.match_type },
          });
        });
      } catch (err) {
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.send(successEnvelope({ decision_id: decisionId, status: "requested", payload_hash: payloadHash }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/duplicate-candidates/create/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/duplicate-candidates/create/apply",
    { preHandler: requireInternal, schema: { body: ApplyBody } },
    async (request, reply) => {
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      const decisionRows = await query<DuplicateCandidateDecisionRow>(
        getPool(),
        `SELECT decision_id, decision_type, target_duplicate_candidate_id, subject_type, subject_ref, matched_type, matched_ref, match_type, evidence_ref, requested_by, status
           FROM clt1.duplicate_candidate_decision_request WHERE decision_id = $1`,
        [body.decision_id],
      );
      const decisionRow = decisionRows[0];
      if (!decisionRow || decisionRow.decision_type !== "create") throw new Clt1Error("CLT1_DUPLICATE_CANDIDATE_NOT_FOUND");
      if (decisionRow.status !== "requested") throw new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE");

      // Defensive re-validation — a referenced node could have been removed between request and
      // apply (e.g. the authorised_party it names was later removed).
      await validateNodeExists(decisionRow.subject_type!, decisionRow.subject_ref!);
      await validateNodeExists(decisionRow.matched_type!, decisionRow.matched_ref!);

      const entityId = `${decisionRow.subject_type}:${decisionRow.subject_ref}`;
      const baseline = await checkPermission(iam2, { actorId: decisionRow.requested_by, action: CREATE_ACTION, resource: "duplicate_candidate", entityId });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const currentPayloadHash = fingerprint(decisionPayload(decisionRow));
      const verify = await verifyDecisionToken(iam2, {
        decisionToken: body.decision_token,
        approvalId: body.approval_id,
        actorId: decisionRow.requested_by,
        action: CREATE_ACTION,
        resource: "duplicate_candidate",
        entityId,
        currentPayloadHash,
      });
      if (!verify.authorised) throw new Clt1Error("CLT1_APPROVAL_REQUIRED");

      const requestedBy = decisionRow.requested_by;
      async function recordFailureAudit(): Promise<void> {
        await withTransaction((txClient) =>
          publishAudit(txClient, {
            event_type: "clt1.duplicate_candidate_create_failed",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "duplicate_candidate",
            entity_id: body.decision_id,
            severity: "high",
            action: "duplicate_candidate.create_apply",
            result: "failure",
            metadata: { decision_id: body.decision_id },
          }),
        ).catch(() => {
          // Best-effort only.
        });
      }

      type ApplyOutcome = { kind: "raced"; error: Clt1Error } | { kind: "applied"; duplicateCandidateId: string };
      let outcome: ApplyOutcome;
      try {
        outcome = await withTransaction(async (txClient) => {
          const lockedDecision = await txClient.query<{ status: string }>(
            `SELECT status FROM clt1.duplicate_candidate_decision_request WHERE decision_id = $1 FOR UPDATE`,
            [body.decision_id],
          );
          if (lockedDecision.rows[0]?.status !== "requested") {
            return { kind: "raced", error: new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE") };
          }

          const duplicateCandidateId = "clt1dc_" + randomUUID();
          // May throw a 23505 unique-violation on idx_clt1_duplicate_candidate_one_open_per_tuple
          // — deliberately NOT caught here (see file header comment on why the outer catch, after
          // withTransaction's own rollback, is the correct place to inspect and map it).
          await txClient.query(
            `INSERT INTO clt1.duplicate_candidate
               (duplicate_candidate_id, subject_type, subject_ref, matched_type, matched_ref, match_type, evidence_ref, requested_by, approval_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              duplicateCandidateId,
              decisionRow.subject_type,
              decisionRow.subject_ref,
              decisionRow.matched_type,
              decisionRow.matched_ref,
              decisionRow.match_type,
              decisionRow.evidence_ref,
              decisionRow.requested_by,
              body.approval_id,
            ],
          );
          await txClient.query(
            `UPDATE clt1.duplicate_candidate_decision_request SET
               status = 'applied', approval_id = $2, decision_token_hash = $3, applied_at_utc = now()
             WHERE decision_id = $1`,
            [body.decision_id, body.approval_id, fingerprint(body.decision_token)],
          );
          await publishAudit(txClient, {
            event_type: "clt1.duplicate_candidate_created",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "duplicate_candidate",
            entity_id: duplicateCandidateId,
            severity: "high",
            action: "duplicate_candidate.create",
            result: "success",
            metadata: { decision_id: body.decision_id, approval_id: body.approval_id, match_type: decisionRow.match_type },
          });
          return { kind: "applied", duplicateCandidateId };
        });
      } catch (err) {
        await recordFailureAudit();
        if (isAlreadyOpenViolation(err)) throw new Clt1Error("CLT1_DUPLICATE_CANDIDATE_ALREADY_OPEN", { cause: err });
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "raced") {
        await recordFailureAudit();
        throw outcome.error;
      }

      return reply.send(successEnvelope({ decision_id: body.decision_id, status: "applied", duplicate_candidate_id: outcome.duplicateCandidateId }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/duplicate-candidates/:duplicate_candidate_id/update/request
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/duplicate-candidates/:duplicate_candidate_id/update/request",
    { preHandler: requireInternal, schema: { params: DuplicateCandidateIdParams, body: UpdateRequestBody } },
    async (request, reply) => {
      const { duplicate_candidate_id } = request.params as { duplicate_candidate_id: string };
      const body = request.body as Static<typeof UpdateRequestBody>;
      assertPoolAvailable();

      const targetRows = await query<DuplicateCandidateRow>(getPool(), `SELECT * FROM clt1.duplicate_candidate WHERE duplicate_candidate_id = $1`, [duplicate_candidate_id]);
      const target = targetRows[0];
      if (!target) duplicateCandidateNotFound();
      validateDuplicateCandidateTransition(target.status, "update");

      const baseline = await checkPermission(iam2Config(app), { actorId: body.requested_by, action: UPDATE_ACTION, resource: "duplicate_candidate", entityId: duplicate_candidate_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const decisionId = "clt1dcd_" + randomUUID();
      const payloadHash = fingerprint(
        decisionPayload({
          decision_id: decisionId,
          decision_type: "update",
          target_duplicate_candidate_id: duplicate_candidate_id,
          subject_type: null,
          subject_ref: null,
          matched_type: null,
          matched_ref: null,
          match_type: null,
          evidence_ref: body.evidence_ref,
          requested_by: body.requested_by,
        }),
      );

      try {
        await withTransaction(async (txClient) => {
          await txClient.query(
            `INSERT INTO clt1.duplicate_candidate_decision_request
               (decision_id, decision_type, target_duplicate_candidate_id, evidence_ref, reason, requested_by, status, payload_hash, request_id, correlation_id)
             VALUES ($1,'update',$2,$3,$4,$5,'requested',$6,$7,$8)`,
            [decisionId, duplicate_candidate_id, body.evidence_ref, body.reason ?? null, body.requested_by, payloadHash, request.ctx.request_id, request.ctx.correlation_id],
          );
          await publishAudit(txClient, {
            event_type: "clt1.duplicate_candidate_update_requested",
            source_module: "CLT-01",
            actor_id: body.requested_by,
            actor_type: "user",
            entity_type: "duplicate_candidate",
            entity_id: duplicate_candidate_id,
            severity: "medium",
            action: "duplicate_candidate.update_request",
            result: "success",
            metadata: { decision_id: decisionId },
          });
        });
      } catch (err) {
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.send(successEnvelope({ decision_id: decisionId, duplicate_candidate_id, status: "requested", payload_hash: payloadHash }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // POST /internal/clt1/duplicate-candidates/:duplicate_candidate_id/update/apply
  // -------------------------------------------------------------------------------------------
  app.post(
    "/internal/clt1/duplicate-candidates/:duplicate_candidate_id/update/apply",
    { preHandler: requireInternal, schema: { params: DuplicateCandidateIdParams, body: ApplyBody } },
    async (request, reply) => {
      const { duplicate_candidate_id } = request.params as { duplicate_candidate_id: string };
      const body = request.body as Static<typeof ApplyBody>;
      assertPoolAvailable();
      const iam2 = iam2Config(app);

      const decisionRows = await query<DuplicateCandidateDecisionRow>(
        getPool(),
        `SELECT decision_id, decision_type, target_duplicate_candidate_id, subject_type, subject_ref, matched_type, matched_ref, match_type, evidence_ref, requested_by, status
           FROM clt1.duplicate_candidate_decision_request WHERE decision_id = $1`,
        [body.decision_id],
      );
      const decisionRow = decisionRows[0];
      if (!decisionRow || decisionRow.decision_type !== "update" || decisionRow.target_duplicate_candidate_id !== duplicate_candidate_id) {
        throw new Clt1Error("CLT1_DUPLICATE_CANDIDATE_NOT_FOUND");
      }
      if (decisionRow.status !== "requested") throw new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE");

      const targetRows = await query<DuplicateCandidateRow>(getPool(), `SELECT * FROM clt1.duplicate_candidate WHERE duplicate_candidate_id = $1`, [duplicate_candidate_id]);
      const target = targetRows[0];
      if (!target) duplicateCandidateNotFound();
      validateDuplicateCandidateTransition(target.status, "update");

      const baseline = await checkPermission(iam2, { actorId: decisionRow.requested_by, action: UPDATE_ACTION, resource: "duplicate_candidate", entityId: duplicate_candidate_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const currentPayloadHash = fingerprint(decisionPayload(decisionRow));
      const verify = await verifyDecisionToken(iam2, {
        decisionToken: body.decision_token,
        approvalId: body.approval_id,
        actorId: decisionRow.requested_by,
        action: UPDATE_ACTION,
        resource: "duplicate_candidate",
        entityId: duplicate_candidate_id,
        currentPayloadHash,
      });
      if (!verify.authorised) throw new Clt1Error("CLT1_APPROVAL_REQUIRED");

      const requestedBy = decisionRow.requested_by;
      async function recordFailureAudit(): Promise<void> {
        await withTransaction((txClient) =>
          publishAudit(txClient, {
            event_type: "clt1.duplicate_candidate_update_failed",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "duplicate_candidate",
            entity_id: duplicate_candidate_id,
            severity: "high",
            action: "duplicate_candidate.update_apply",
            result: "failure",
            metadata: { decision_id: body.decision_id },
          }),
        ).catch(() => {
          // Best-effort only.
        });
      }

      type ApplyOutcome = { kind: "raced"; error: Clt1Error } | { kind: "applied" };
      let outcome: ApplyOutcome;
      try {
        outcome = await withTransaction(async (txClient) => {
          const lockedDecision = await txClient.query<{ status: string }>(
            `SELECT status FROM clt1.duplicate_candidate_decision_request WHERE decision_id = $1 FOR UPDATE`,
            [body.decision_id],
          );
          if (lockedDecision.rows[0]?.status !== "requested") {
            return { kind: "raced", error: new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE") };
          }
          const lockedTarget = await txClient.query<{ status: string }>(
            `SELECT status FROM clt1.duplicate_candidate WHERE duplicate_candidate_id = $1 FOR UPDATE`,
            [duplicate_candidate_id],
          );
          if (lockedTarget.rows[0]?.status !== "open") {
            return { kind: "raced", error: new Clt1Error("CLT1_DUPLICATE_CANDIDATE_INVALID_STATE") };
          }

          await txClient.query(
            `UPDATE clt1.duplicate_candidate SET
               evidence_ref = $2, approval_id = $3, version = version + 1, updated_at_utc = now()
             WHERE duplicate_candidate_id = $1`,
            [duplicate_candidate_id, decisionRow.evidence_ref, body.approval_id],
          );
          await txClient.query(
            `UPDATE clt1.duplicate_candidate_decision_request SET
               status = 'applied', approval_id = $2, decision_token_hash = $3, applied_at_utc = now()
             WHERE decision_id = $1`,
            [body.decision_id, body.approval_id, fingerprint(body.decision_token)],
          );
          await publishAudit(txClient, {
            event_type: "clt1.duplicate_candidate_updated",
            source_module: "CLT-01",
            actor_id: requestedBy,
            actor_type: "user",
            entity_type: "duplicate_candidate",
            entity_id: duplicate_candidate_id,
            severity: "high",
            action: "duplicate_candidate.update",
            result: "success",
            metadata: { decision_id: body.decision_id, approval_id: body.approval_id },
          });
          return { kind: "applied" };
        });
      } catch (err) {
        await recordFailureAudit();
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "raced") {
        await recordFailureAudit();
        throw outcome.error;
      }

      return reply.send(successEnvelope({ decision_id: body.decision_id, duplicate_candidate_id, status: "applied" }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // Shared body/helper for confirm and dismiss — both request routes are structurally identical
  // apart from the target status/action/event names, so a small factory avoids duplicating the
  // maker-checker request-side wiring twice.
  // -------------------------------------------------------------------------------------------
  function registerResolutionRequest(pathSegment: "confirm" | "dismiss", action: string, eventType: string): void {
    app.post(
      `/internal/clt1/duplicate-candidates/:duplicate_candidate_id/${pathSegment}/request`,
      { preHandler: requireInternal, schema: { params: DuplicateCandidateIdParams, body: ConfirmDismissRequestBody } },
      async (request, reply) => {
        const { duplicate_candidate_id } = request.params as { duplicate_candidate_id: string };
        const body = request.body as Static<typeof ConfirmDismissRequestBody>;
        assertPoolAvailable();

        const targetRows = await query<DuplicateCandidateRow>(getPool(), `SELECT * FROM clt1.duplicate_candidate WHERE duplicate_candidate_id = $1`, [duplicate_candidate_id]);
        const target = targetRows[0];
        if (!target) duplicateCandidateNotFound();
        validateDuplicateCandidateTransition(target.status, pathSegment === "confirm" ? "confirm" : "dismiss");

        // Blueprint SoD rule 4 — request-time-only check, mirrors every prior self-block check in
        // this codebase (see file header comment). Checks EVERY application-typed side of the
        // pair, not just the subject — a candidate can legitimately be application-vs-application.
        const applicationCreatedByValues = await resolveApplicationCreatedByValues(target.subject_type, target.subject_ref, target.matched_type, target.matched_ref);
        checkDuplicateSelfReviewBlocked(body.requested_by, applicationCreatedByValues);

        const baseline = await checkPermission(iam2Config(app), { actorId: body.requested_by, action, resource: "duplicate_candidate", entityId: duplicate_candidate_id });
        if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

        const decisionId = "clt1dcd_" + randomUUID();
        const payloadHash = fingerprint(
          decisionPayload({
            decision_id: decisionId,
            decision_type: pathSegment,
            target_duplicate_candidate_id: duplicate_candidate_id,
            subject_type: null,
            subject_ref: null,
            matched_type: null,
            matched_ref: null,
            match_type: null,
            evidence_ref: null,
            requested_by: body.requested_by,
          }),
        );

        try {
          await withTransaction(async (txClient) => {
            await txClient.query(
              `INSERT INTO clt1.duplicate_candidate_decision_request
                 (decision_id, decision_type, target_duplicate_candidate_id, reason, requested_by, status, payload_hash, request_id, correlation_id)
               VALUES ($1,$2,$3,$4,$5,'requested',$6,$7,$8)`,
              [decisionId, pathSegment, duplicate_candidate_id, body.reason ?? null, body.requested_by, payloadHash, request.ctx.request_id, request.ctx.correlation_id],
            );
            await publishAudit(txClient, {
              event_type: eventType,
              source_module: "CLT-01",
              actor_id: body.requested_by,
              actor_type: "user",
              entity_type: "duplicate_candidate",
              entity_id: duplicate_candidate_id,
              severity: "medium",
              action: `duplicate_candidate.${pathSegment}_request`,
              result: "success",
              metadata: { decision_id: decisionId },
            });
          });
        } catch (err) {
          throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
        }

        return reply.send(successEnvelope({ decision_id: decisionId, duplicate_candidate_id, status: "requested", payload_hash: payloadHash }, meta(request)));
      },
    );
  }

  function registerResolutionApply(pathSegment: "confirm" | "dismiss", action: string, resultStatus: "duplicate" | "not_duplicate", appliedEventType: string, failedEventType: string): void {
    app.post(
      `/internal/clt1/duplicate-candidates/:duplicate_candidate_id/${pathSegment}/apply`,
      { preHandler: requireInternal, schema: { params: DuplicateCandidateIdParams, body: ApplyBody } },
      async (request, reply) => {
        const { duplicate_candidate_id } = request.params as { duplicate_candidate_id: string };
        const body = request.body as Static<typeof ApplyBody>;
        assertPoolAvailable();
        const iam2 = iam2Config(app);

        const decisionRows = await query<DuplicateCandidateDecisionRow>(
          getPool(),
          `SELECT decision_id, decision_type, target_duplicate_candidate_id, subject_type, subject_ref, matched_type, matched_ref, match_type, evidence_ref, requested_by, status
             FROM clt1.duplicate_candidate_decision_request WHERE decision_id = $1`,
          [body.decision_id],
        );
        const decisionRow = decisionRows[0];
        if (!decisionRow || decisionRow.decision_type !== pathSegment || decisionRow.target_duplicate_candidate_id !== duplicate_candidate_id) {
          throw new Clt1Error("CLT1_DUPLICATE_CANDIDATE_NOT_FOUND");
        }
        if (decisionRow.status !== "requested") throw new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE");

        const targetRows = await query<DuplicateCandidateRow>(getPool(), `SELECT * FROM clt1.duplicate_candidate WHERE duplicate_candidate_id = $1`, [duplicate_candidate_id]);
        const target = targetRows[0];
        if (!target) duplicateCandidateNotFound();
        validateDuplicateCandidateTransition(target.status, pathSegment === "confirm" ? "confirm" : "dismiss");

        const baseline = await checkPermission(iam2, { actorId: decisionRow.requested_by, action, resource: "duplicate_candidate", entityId: duplicate_candidate_id });
        if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

        const currentPayloadHash = fingerprint(decisionPayload(decisionRow));
        const verify = await verifyDecisionToken(iam2, {
          decisionToken: body.decision_token,
          approvalId: body.approval_id,
          actorId: decisionRow.requested_by,
          action,
          resource: "duplicate_candidate",
          entityId: duplicate_candidate_id,
          currentPayloadHash,
        });
        if (!verify.authorised) throw new Clt1Error("CLT1_APPROVAL_REQUIRED");

        const requestedBy = decisionRow.requested_by;
        async function recordFailureAudit(): Promise<void> {
          await withTransaction((txClient) =>
            publishAudit(txClient, {
              event_type: failedEventType,
              source_module: "CLT-01",
              actor_id: requestedBy,
              actor_type: "user",
              entity_type: "duplicate_candidate",
              entity_id: duplicate_candidate_id,
              severity: "high",
              action: `duplicate_candidate.${pathSegment}_apply`,
              result: "failure",
              metadata: { decision_id: body.decision_id },
            }),
          ).catch(() => {
            // Best-effort only.
          });
        }

        type ApplyOutcome = { kind: "raced"; error: Clt1Error } | { kind: "applied" };
        let outcome: ApplyOutcome;
        try {
          outcome = await withTransaction(async (txClient) => {
            const lockedDecision = await txClient.query<{ status: string }>(
              `SELECT status FROM clt1.duplicate_candidate_decision_request WHERE decision_id = $1 FOR UPDATE`,
              [body.decision_id],
            );
            if (lockedDecision.rows[0]?.status !== "requested") {
              return { kind: "raced", error: new Clt1Error("CLT1_DECISION_REQUEST_INVALID_STATE") };
            }
            const lockedTarget = await txClient.query<{ status: string }>(
              `SELECT status FROM clt1.duplicate_candidate WHERE duplicate_candidate_id = $1 FOR UPDATE`,
              [duplicate_candidate_id],
            );
            if (lockedTarget.rows[0]?.status !== "open") {
              return { kind: "raced", error: new Clt1Error("CLT1_DUPLICATE_CANDIDATE_INVALID_STATE") };
            }

            await txClient.query(
              `UPDATE clt1.duplicate_candidate SET
                 status = $2, reviewed_by = $3, reviewed_at_utc = now(), approval_id = $4, version = version + 1, updated_at_utc = now()
               WHERE duplicate_candidate_id = $1`,
              [duplicate_candidate_id, resultStatus, requestedBy, body.approval_id],
            );
            await txClient.query(
              `UPDATE clt1.duplicate_candidate_decision_request SET
                 status = 'applied', approval_id = $2, decision_token_hash = $3, applied_at_utc = now()
               WHERE decision_id = $1`,
              [body.decision_id, body.approval_id, fingerprint(body.decision_token)],
            );
            await publishAudit(txClient, {
              event_type: appliedEventType,
              source_module: "CLT-01",
              actor_id: requestedBy,
              actor_type: "user",
              entity_type: "duplicate_candidate",
              entity_id: duplicate_candidate_id,
              severity: "high",
              action: `duplicate_candidate.${pathSegment}`,
              result: "success",
              metadata: { decision_id: body.decision_id, approval_id: body.approval_id },
            });
            return { kind: "applied" };
          });
        } catch (err) {
          await recordFailureAudit();
          throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
        }

        if (outcome.kind === "raced") {
          await recordFailureAudit();
          throw outcome.error;
        }

        return reply.send(successEnvelope({ decision_id: body.decision_id, duplicate_candidate_id, status: resultStatus }, meta(request)));
      },
    );
  }

  registerResolutionRequest("confirm", CONFIRM_ACTION, "clt1.duplicate_candidate_confirm_requested");
  registerResolutionApply("confirm", CONFIRM_ACTION, "duplicate", "clt1.duplicate_candidate_confirmed", "clt1.duplicate_candidate_confirm_failed");

  registerResolutionRequest("dismiss", DISMISS_ACTION, "clt1.duplicate_candidate_dismiss_requested");
  registerResolutionApply("dismiss", DISMISS_ACTION, "not_duplicate", "clt1.duplicate_candidate_dismissed", "clt1.duplicate_candidate_dismiss_failed");

  // -------------------------------------------------------------------------------------------
  // GET /internal/clt1/applications/:application_id/duplicate-candidates
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/clt1/applications/:application_id/duplicate-candidates",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, querystring: ReadQuery } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      const { actor_id } = request.query as Static<typeof ReadQuery>;
      assertPoolAvailable();

      const applicationRows = await query<ClientApplicationRefRow>(getPool(), `SELECT application_id FROM clt1.client_application WHERE application_id = $1`, [application_id]);
      if (!applicationRows[0]) throw new Clt1Error("CLT1_APPLICATION_NOT_FOUND");

      const baseline = await checkPermission(iam2Config(app), { actorId: actor_id, action: READ_ACTION, resource: "duplicate_candidate", entityId: application_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const rows = await query<DuplicateCandidateRow>(
        getPool(),
        `SELECT * FROM clt1.duplicate_candidate
         WHERE (subject_type = 'application' AND subject_ref = $1) OR (matched_type = 'application' AND matched_ref = $1)
         ORDER BY created_at_utc ASC`,
        [application_id],
      );

      return reply.send(successEnvelope({ application_id, duplicate_candidates: rows.map(safeDuplicateCandidateResponse) }, meta(request)));
    },
  );

  // -------------------------------------------------------------------------------------------
  // GET /internal/clt1/clients/:client_id/duplicate-candidates
  // -------------------------------------------------------------------------------------------
  app.get(
    "/internal/clt1/clients/:client_id/duplicate-candidates",
    { preHandler: requireInternal, schema: { params: ClientIdParams, querystring: ReadQuery } },
    async (request, reply) => {
      const { client_id } = request.params as { client_id: string };
      const { actor_id } = request.query as Static<typeof ReadQuery>;
      assertPoolAvailable();

      const profileRows = await query<ClientProfileRefRow>(getPool(), `SELECT client_id, status, application_id FROM clt1.client_profile WHERE client_id = $1`, [client_id]);
      const profile = profileRows[0];
      if (!profile) throw new Clt1Error("CLT1_CLIENT_NOT_FOUND");
      if (profile.status !== "active_limited") throw new Clt1Error("CLT1_CLIENT_NOT_ACTIVE");

      const baseline = await checkPermission(iam2Config(app), { actorId: actor_id, action: READ_ACTION, resource: "duplicate_candidate", entityId: client_id });
      if (!baseline.allowed) throw new Clt1Error(baseline.reason === "iam2_unavailable" ? "CLT1_IAM2_UNAVAILABLE" : "CLT1_PERMISSION_DENIED");

      const partyRows = await query<{ authorised_party_id: string }>(getPool(), `SELECT authorised_party_id FROM clt1.authorised_party WHERE application_id = $1`, [profile.application_id]);
      const partyIds = partyRows.map((r) => r.authorised_party_id);

      // Bounded, single-hop lookup — every clause below matches candidates touching one of THIS
      // client's own already-known node identities (client_id/application_id/its own
      // authorised_party_ids), in either subject/matched role. No recursion, no multi-hop.
      const rows = await query<DuplicateCandidateRow>(
        getPool(),
        `SELECT * FROM clt1.duplicate_candidate
         WHERE
           (subject_type = 'client' AND subject_ref = $1) OR (matched_type = 'client' AND matched_ref = $1)
           OR (subject_type = 'application' AND subject_ref = $2) OR (matched_type = 'application' AND matched_ref = $2)
           OR (subject_type = 'party' AND subject_ref = ANY($3)) OR (matched_type = 'party' AND matched_ref = ANY($3))
         ORDER BY created_at_utc ASC`,
        [client_id, profile.application_id, partyIds],
      );

      return reply.send(successEnvelope({ client_id, duplicate_candidates: rows.map(safeDuplicateCandidateResponse) }, meta(request)));
    },
  );
}
