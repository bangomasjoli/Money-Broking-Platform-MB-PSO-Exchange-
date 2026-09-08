/**
 * CLT-01 Phase 1 application-intake routes (blueprint `04_API_Specification.md`, adapted to the
 * approved Phase 1 scope — internal-only, per Design Issue 2). All routes guarded by CLT-01's own
 * interim internal-identity guard; no IAM-02 permission integration this phase (see file header
 * comment on `registerApplicationRoutes` below for why).
 *
 * Follows CFG-01's own `routes/features.ts` discipline (IAM-02 bug lesson,
 * `CFG-01_IMPLEMENTATION_NOTES.md` §6): a thrown error inside `withTransaction` rolls back
 * whatever that callback already wrote, so a CFG-01 gate denial — which DOES write an audit
 * event before the outcome is known — is returned as a structured "denied" outcome instead of
 * thrown, and the ROUTE throws the specific error only AFTER the transaction has committed, so
 * the denial's audit trail is never lost. The concurrency-guard throws inside the same
 * transactions below (0 rows returned from a state-guarded `UPDATE`) are safe to throw directly
 * — they fire BEFORE any write happens in that attempt, so there is nothing to lose by rolling
 * back.
 *
 * State-machine guards double as the concurrency mechanism: every mutating UPDATE embeds its
 * required current `status` directly in the `WHERE` clause (e.g. `WHERE application_id = $1 AND
 * status = 'draft'`) and checks the row was actually returned — a concurrent conflicting request
 * simply loses the race and gets `CLT1_APPLICATION_INVALID_STATE`, with no separate `FOR UPDATE`
 * locking needed for this phase's low-throughput admin flows.
 */
import { randomUUID } from "node:crypto";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { getPool, publishAudit, query, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeClt1InternalIdentityGuard } from "../plugins/internal-identity.js";
import { evaluateOnboardingGate, type Cfg1ClientConfig, type OnboardingGateResult } from "../lib/cfg1-client.js";
import {
  applicationNotFound,
  interpretCfgGate,
  requireCfgGateOnFile,
  requireConsentForSubmit,
  safeApplicationResponse,
  validateTransition,
  type ClientApplicationRow,
} from "../lib/applications.js";
import { Clt1Error } from "../lib/errors.js";
import type { Clt1Config } from "../config.js";

const CLIENT_CLASSES = ["institutional", "hnwi", "professional", "retail", "unknown"] as const;
const ClientClassSchema = Type.Union(CLIENT_CLASSES.map((c) => Type.Literal(c)));
const APPLICANT_TYPES = ["individual", "corporate", "institutional"] as const;
const ApplicantTypeSchema = Type.Union(APPLICANT_TYPES.map((t) => Type.Literal(t)));

const ApplicationIdParams = Type.Object({ application_id: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });

const CreateApplicationBody = Type.Object(
  {
    applicant_type: ApplicantTypeSchema,
    legal_name: Type.String({ minLength: 1, maxLength: 256 }),
    registration_number: Type.Optional(Type.String({ maxLength: 64 })),
    country_of_incorporation: Type.Optional(Type.String({ minLength: 2, maxLength: 2 })),
    applicant_email: Type.Optional(Type.String({ maxLength: 256 })),
    client_class_claimed: ClientClassSchema,
    created_by: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);

const PatchApplicationBody = Type.Object(
  {
    legal_name: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    registration_number: Type.Optional(Type.String({ maxLength: 64 })),
    country_of_incorporation: Type.Optional(Type.String({ minLength: 2, maxLength: 2 })),
    applicant_email: Type.Optional(Type.String({ maxLength: 256 })),
    client_class_claimed: Type.Optional(ClientClassSchema),
  },
  { additionalProperties: false },
);

const ClassificationEvidenceBody = Type.Object(
  {
    evidence_type: Type.String({ minLength: 1, maxLength: 32 }),
    evidence_ref: Type.String({ minLength: 1, maxLength: 256 }),
    created_by: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);

const ConsentBody = Type.Object(
  {
    consent_type: Type.String({ minLength: 1, maxLength: 32 }),
    consent_version: Type.String({ minLength: 1, maxLength: 16 }),
    consent_given: Type.Boolean(),
    given_by: Type.String({ minLength: 1, maxLength: 64 }),
    source: Type.Optional(Type.String({ maxLength: 32 })),
  },
  { additionalProperties: false },
);

interface CreateApplicationBodyType {
  applicant_type: (typeof APPLICANT_TYPES)[number];
  legal_name: string;
  registration_number?: string;
  country_of_incorporation?: string;
  applicant_email?: string;
  client_class_claimed: (typeof CLIENT_CLASSES)[number];
  created_by: string;
}

interface PatchApplicationBodyType {
  legal_name?: string;
  registration_number?: string;
  country_of_incorporation?: string;
  applicant_email?: string;
  client_class_claimed?: (typeof CLIENT_CLASSES)[number];
}

interface ClassificationEvidenceBodyType {
  evidence_type: string;
  evidence_ref: string;
  created_by: string;
}

interface ConsentBodyType {
  consent_type: string;
  consent_version: string;
  consent_given: boolean;
  given_by: string;
  source?: string;
}

/** Probe the pool eagerly so an unreachable/uninitialised DB is reported as
 * CLT1_SERVICE_UNAVAILABLE rather than falling through to the generic CLT1_AUDIT_REQUIRED catch
 * around a transaction below — mirrors CFG-01's own `assertPoolAvailable`
 * (services/cfg1/src/routes/features.ts). */
function assertPoolAvailable(): void {
  try {
    getPool();
  } catch (err) {
    throw new Clt1Error("CLT1_SERVICE_UNAVAILABLE", { cause: err });
  }
}

function cfg1ClientConfig(config: Clt1Config): Cfg1ClientConfig {
  return {
    baseUrl: config.cfg1BaseUrl,
    internalServiceToken: config.cfg1InternalServiceToken,
    fetchImpl: config.cfg1FetchImpl,
  };
}

async function fetchApplicationOrThrow(applicationId: string): Promise<ClientApplicationRow> {
  const rows = await query<ClientApplicationRow>(getPool(), `SELECT * FROM clt1.client_application WHERE application_id = $1`, [applicationId]);
  const row = rows[0];
  if (!row) applicationNotFound();
  return row;
}

/** Deny-outcome audit event type — a sharper, named event for the permanently-prohibited retail
 * case (mirrors CFG-01's own `cfg1.prohibited_feature.blocked` vs. generic `.denied` split). */
function gateDeniedEventType(gate: OnboardingGateResult): string {
  return gate.featureCode === "onboarding.retail_default" ? "clt1.retail_onboarding_blocked" : "clt1.cfg_gate_denied";
}

/**
 * Registers CLT-01's Phase 1 application-intake routes (create/patch/classification-evidence/
 * consents/submit/cancel/get). Internal-only (approved Design Issue 2: no public `/clt1/*`
 * surface). No IAM-02 permission-guard integration in THIS file — `start-review` moved to
 * routes/decisions.ts in Phase 2 (now IAM-02-permission-gated, alongside approve/reject/hold),
 * since it is a review/decision action, not an intake action. This file's own routes remain
 * ungated beyond the interim internal-identity token, unchanged from Phase 1.
 */
export async function registerApplicationRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeClt1InternalIdentityGuard(app.config.clt1InternalServiceToken);

  app.post(
    "/internal/clt1/applications",
    { preHandler: requireInternal, schema: { body: CreateApplicationBody } },
    async (request, reply) => {
      const body = request.body as CreateApplicationBodyType;
      assertPoolAvailable();

      const applicationId = "clt1app_" + randomUUID();
      const gate = await evaluateOnboardingGate(cfg1ClientConfig(app.config), {
        clientClass: body.client_class_claimed,
        applicationId,
        environment: app.config.environment,
      });

      let outcome: { kind: "denied" } | { kind: "created"; row: ClientApplicationRow };
      try {
        outcome = await withTransaction(async (client) => {
          if (!gate.allowed) {
            await publishAudit(client, {
              event_type: gateDeniedEventType(gate),
              source_module: "CLT-01",
              actor_id: body.created_by,
              actor_type: "user",
              entity_type: "client_application",
              entity_id: applicationId,
              severity: gate.featureCode === "onboarding.retail_default" ? "critical" : "high",
              action: "create",
              result: "blocked",
              reason_code: gate.reasonCode,
              metadata: { feature_code: gate.featureCode, decision_id: gate.decisionId },
            });
            return { kind: "denied" as const };
          }

          const rows = await query<ClientApplicationRow>(
            client,
            `INSERT INTO clt1.client_application
               (application_id, applicant_type, legal_name, registration_number, country_of_incorporation, applicant_email,
                client_class_claimed, client_class_status, status,
                cfg_feature_code, cfg_decision_id, cfg_reason_code, cfg_evaluated_at_utc,
                created_by, request_id, correlation_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'claimed','draft',$8,$9,$10,$11,$12,$13,$14)
             RETURNING *`,
            [
              applicationId,
              body.applicant_type,
              body.legal_name,
              body.registration_number ?? null,
              body.country_of_incorporation ?? null,
              body.applicant_email ?? null,
              body.client_class_claimed,
              gate.featureCode,
              gate.decisionId,
              gate.reasonCode,
              gate.evaluatedAtUtc,
              body.created_by,
              request.ctx.request_id,
              request.ctx.correlation_id,
            ],
          );

          await publishAudit(client, {
            event_type: "clt1.application_created",
            source_module: "CLT-01",
            actor_id: body.created_by,
            actor_type: "user",
            entity_type: "client_application",
            entity_id: applicationId,
            severity: "medium",
            action: "create",
            result: "success",
            metadata: { applicant_type: body.applicant_type },
          });
          await publishAudit(client, {
            event_type: "clt1.client_class_claimed",
            source_module: "CLT-01",
            actor_id: body.created_by,
            actor_type: "user",
            entity_type: "client_application",
            entity_id: applicationId,
            severity: "medium",
            action: "classify",
            result: "success",
            reason_code: gate.reasonCode,
            metadata: { client_class_claimed: body.client_class_claimed, feature_code: gate.featureCode, decision_id: gate.decisionId },
          });

          return { kind: "created" as const, row: rows[0]! };
        });
      } catch (err) {
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "denied") {
        interpretCfgGate(gate);
        // interpretCfgGate always throws when gate.allowed is false, which is guaranteed here
        // (outcome is only "denied" when gate.allowed was false) — unreachable at runtime, kept
        // only so TypeScript narrows `outcome` to the "created" variant below.
        throw new Clt1Error("CLT1_CFG_GATE_DENIED");
      }

      return reply.code(201).send(successEnvelope(safeApplicationResponse(outcome.row), meta(request)));
    },
  );

  app.patch(
    "/internal/clt1/applications/:application_id",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, body: PatchApplicationBody } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      const body = request.body as PatchApplicationBodyType;
      assertPoolAvailable();

      const current = await fetchApplicationOrThrow(application_id);
      validateTransition(current.status, "patch");

      const classChanging = body.client_class_claimed !== undefined && body.client_class_claimed !== current.client_class_claimed;
      let gate: OnboardingGateResult | null = null;
      if (classChanging) {
        gate = await evaluateOnboardingGate(cfg1ClientConfig(app.config), {
          clientClass: body.client_class_claimed!,
          applicationId: application_id,
          environment: app.config.environment,
        });
      }

      let outcome: { kind: "denied" } | { kind: "updated"; row: ClientApplicationRow };
      try {
        outcome = await withTransaction(async (client) => {
          if (gate && !gate.allowed) {
            await publishAudit(client, {
              event_type: gateDeniedEventType(gate),
              source_module: "CLT-01",
              actor_id: application_id,
              actor_type: "service",
              entity_type: "client_application",
              entity_id: application_id,
              severity: gate.featureCode === "onboarding.retail_default" ? "critical" : "high",
              action: "patch",
              result: "blocked",
              reason_code: gate.reasonCode,
              metadata: { feature_code: gate.featureCode, decision_id: gate.decisionId },
            });
            return { kind: "denied" as const };
          }

          const rows = await query<ClientApplicationRow>(
            client,
            `UPDATE clt1.client_application SET
               legal_name = COALESCE($2, legal_name),
               registration_number = COALESCE($3, registration_number),
               country_of_incorporation = COALESCE($4, country_of_incorporation),
               applicant_email = COALESCE($5, applicant_email),
               client_class_claimed = COALESCE($6, client_class_claimed),
               cfg_feature_code = COALESCE($7, cfg_feature_code),
               cfg_decision_id = COALESCE($8, cfg_decision_id),
               cfg_reason_code = COALESCE($9, cfg_reason_code),
               cfg_evaluated_at_utc = COALESCE($10, cfg_evaluated_at_utc),
               version = version + 1,
               updated_at_utc = now()
             WHERE application_id = $1 AND status = 'draft'
             RETURNING *`,
            [
              application_id,
              body.legal_name ?? null,
              body.registration_number ?? null,
              body.country_of_incorporation ?? null,
              body.applicant_email ?? null,
              body.client_class_claimed ?? null,
              gate?.featureCode ?? null,
              gate?.decisionId ?? null,
              gate?.reasonCode ?? null,
              gate?.evaluatedAtUtc ?? null,
            ],
          );
          if (rows.length === 0) {
            // Lost a race against a concurrent transition away from 'draft' since the pre-check
            // above — same fail-closed outcome as any other invalid-state attempt.
            throw new Clt1Error("CLT1_APPLICATION_INVALID_STATE", {
              details: [{ field: "status", issue: "application status changed concurrently" }],
            });
          }

          await publishAudit(client, {
            event_type: "clt1.application_updated",
            source_module: "CLT-01",
            actor_id: application_id,
            actor_type: "service",
            entity_type: "client_application",
            entity_id: application_id,
            severity: "low",
            action: "patch",
            result: "success",
            metadata: { class_changed: classChanging },
          });
          if (classChanging) {
            await publishAudit(client, {
              event_type: "clt1.client_class_claimed",
              source_module: "CLT-01",
              actor_id: application_id,
              actor_type: "service",
              entity_type: "client_application",
              entity_id: application_id,
              severity: "medium",
              action: "classify",
              result: "success",
              reason_code: gate?.reasonCode,
              metadata: { client_class_claimed: body.client_class_claimed, feature_code: gate?.featureCode, decision_id: gate?.decisionId },
            });
          }

          return { kind: "updated" as const, row: rows[0]! };
        });
      } catch (err) {
        if (err instanceof Clt1Error) throw err;
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "denied") {
        interpretCfgGate(gate!);
        throw new Clt1Error("CLT1_CFG_GATE_DENIED");
      }

      return reply.send(successEnvelope(safeApplicationResponse(outcome.row), meta(request)));
    },
  );

  app.post(
    "/internal/clt1/applications/:application_id/classification-evidence",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, body: ClassificationEvidenceBody } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      const body = request.body as ClassificationEvidenceBodyType;
      assertPoolAvailable();

      const current = await fetchApplicationOrThrow(application_id);
      validateTransition(current.status, "classification-evidence");

      const evidenceId = "clt1ev_" + randomUUID();
      let evidence: { evidence_id: string; client_class: string; evidence_type: string; status: string; created_at_utc: string };
      try {
        evidence = await withTransaction(async (client) => {
          const rows = await query<{ evidence_id: string; client_class: string; evidence_type: string; status: string; created_at_utc: string }>(
            client,
            `INSERT INTO clt1.client_classification_evidence
               (evidence_id, application_id, client_class, evidence_type, evidence_ref, status, created_by)
             VALUES ($1,$2,$3,$4,$5,'provided',$6)
             RETURNING evidence_id, client_class, evidence_type, status, created_at_utc`,
            [evidenceId, application_id, current.client_class_claimed, body.evidence_type, body.evidence_ref, body.created_by],
          );
          await publishAudit(client, {
            event_type: "clt1.classification_evidence_added",
            source_module: "CLT-01",
            actor_id: body.created_by,
            actor_type: "user",
            entity_type: "client_application",
            entity_id: application_id,
            severity: "low",
            action: "classification_evidence.add",
            result: "success",
            metadata: { evidence_id: evidenceId, evidence_type: body.evidence_type },
          });
          return rows[0]!;
        });
      } catch (err) {
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.code(201).send(successEnvelope(evidence, meta(request)));
    },
  );

  app.post(
    "/internal/clt1/applications/:application_id/consents",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams, body: ConsentBody } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      const body = request.body as ConsentBodyType;
      assertPoolAvailable();

      const current = await fetchApplicationOrThrow(application_id);
      validateTransition(current.status, "consent");

      const consentId = "clt1con_" + randomUUID();
      let consent: { consent_id: string; consent_type: string; consent_version: string; consent_given: boolean; given_at_utc: string };
      try {
        consent = await withTransaction(async (client) => {
          const rows = await query<{ consent_id: string; consent_type: string; consent_version: string; consent_given: boolean; given_at_utc: string }>(
            client,
            `INSERT INTO clt1.consent_record
               (consent_id, application_id, consent_type, consent_version, consent_given, given_by, given_at_utc, source)
             VALUES ($1,$2,$3,$4,$5,$6, now(), $7)
             RETURNING consent_id, consent_type, consent_version, consent_given, given_at_utc`,
            [consentId, application_id, body.consent_type, body.consent_version, body.consent_given, body.given_by, body.source ?? null],
          );
          await publishAudit(client, {
            event_type: "clt1.consent_recorded",
            source_module: "CLT-01",
            actor_id: body.given_by,
            actor_type: "user",
            entity_type: "client_application",
            entity_id: application_id,
            severity: "low",
            action: "consent.record",
            result: "success",
            metadata: { consent_id: consentId, consent_type: body.consent_type },
          });
          return rows[0]!;
        });
      } catch (err) {
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.code(201).send(successEnvelope(consent, meta(request)));
    },
  );

  app.post(
    "/internal/clt1/applications/:application_id/submit",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      assertPoolAvailable();

      const current = await fetchApplicationOrThrow(application_id);
      validateTransition(current.status, "submit");
      requireCfgGateOnFile(current);

      const consentCountRows = await query<{ count: string }>(getPool(), `SELECT count(*) FROM clt1.consent_record WHERE application_id = $1`, [application_id]);
      requireConsentForSubmit(Number(consentCountRows[0]?.count ?? "0"));

      // Fresh re-check, defense in depth — mirrors CFG-01's own feature-changes.ts propose/apply
      // double-check (the licence/prohibited registry could have changed since creation).
      const gate = await evaluateOnboardingGate(cfg1ClientConfig(app.config), {
        clientClass: current.client_class_claimed,
        applicationId: application_id,
        environment: app.config.environment,
      });

      let outcome: { kind: "denied" } | { kind: "submitted"; row: ClientApplicationRow };
      try {
        outcome = await withTransaction(async (client) => {
          if (!gate.allowed) {
            await publishAudit(client, {
              event_type: gateDeniedEventType(gate),
              source_module: "CLT-01",
              actor_id: application_id,
              actor_type: "service",
              entity_type: "client_application",
              entity_id: application_id,
              severity: gate.featureCode === "onboarding.retail_default" ? "critical" : "high",
              action: "submit",
              result: "blocked",
              reason_code: gate.reasonCode,
              metadata: { feature_code: gate.featureCode, decision_id: gate.decisionId },
            });
            return { kind: "denied" as const };
          }

          const rows = await query<ClientApplicationRow>(
            client,
            `UPDATE clt1.client_application SET
               status = 'submitted',
               submitted_at_utc = now(),
               cfg_feature_code = $2,
               cfg_decision_id = $3,
               cfg_reason_code = $4,
               cfg_evaluated_at_utc = $5,
               version = version + 1,
               updated_at_utc = now()
             WHERE application_id = $1 AND status = 'draft'
             RETURNING *`,
            [application_id, gate.featureCode, gate.decisionId, gate.reasonCode, gate.evaluatedAtUtc],
          );
          if (rows.length === 0) {
            throw new Clt1Error("CLT1_APPLICATION_INVALID_STATE", {
              details: [{ field: "status", issue: "application status changed concurrently" }],
            });
          }

          await publishAudit(client, {
            event_type: "clt1.application_submitted",
            source_module: "CLT-01",
            actor_id: application_id,
            actor_type: "service",
            entity_type: "client_application",
            entity_id: application_id,
            severity: "medium",
            action: "submit",
            result: "success",
            reason_code: gate.reasonCode,
            metadata: { decision_id: gate.decisionId },
          });

          return { kind: "submitted" as const, row: rows[0]! };
        });
      } catch (err) {
        if (err instanceof Clt1Error) throw err;
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      if (outcome.kind === "denied") {
        interpretCfgGate(gate);
        throw new Clt1Error("CLT1_CFG_GATE_DENIED");
      }

      return reply.send(successEnvelope(safeApplicationResponse(outcome.row), meta(request)));
    },
  );

  app.post(
    "/internal/clt1/applications/:application_id/cancel",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      assertPoolAvailable();

      const current = await fetchApplicationOrThrow(application_id);
      validateTransition(current.status, "cancel");

      let row: ClientApplicationRow;
      try {
        row = await withTransaction(async (client) => {
          const rows = await query<ClientApplicationRow>(
            client,
            `UPDATE clt1.client_application SET
               status = 'cancelled',
               cancelled_at_utc = now(),
               version = version + 1,
               updated_at_utc = now()
             WHERE application_id = $1 AND status IN ('draft','submitted')
             RETURNING *`,
            [application_id],
          );
          if (rows.length === 0) {
            throw new Clt1Error("CLT1_APPLICATION_INVALID_STATE", {
              details: [{ field: "status", issue: "application status changed concurrently" }],
            });
          }
          await publishAudit(client, {
            event_type: "clt1.application_cancelled",
            source_module: "CLT-01",
            actor_id: application_id,
            actor_type: "service",
            entity_type: "client_application",
            entity_id: application_id,
            severity: "low",
            action: "cancel",
            result: "success",
            metadata: {},
          });
          return rows[0]!;
        });
      } catch (err) {
        if (err instanceof Clt1Error) throw err;
        throw new Clt1Error("CLT1_AUDIT_REQUIRED", { cause: err });
      }

      return reply.send(successEnvelope(safeApplicationResponse(row), meta(request)));
    },
  );

  app.get(
    "/internal/clt1/applications/:application_id",
    { preHandler: requireInternal, schema: { params: ApplicationIdParams } },
    async (request, reply) => {
      const { application_id } = request.params as { application_id: string };
      assertPoolAvailable();
      const row = await fetchApplicationOrThrow(application_id);
      return reply.send(successEnvelope(safeApplicationResponse(row), meta(request)));
    },
  );
}
