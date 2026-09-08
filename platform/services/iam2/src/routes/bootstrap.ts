/**
 * IAM-02 — APPROVED BOOTSTRAP-TO-RBAC TRANSITION DESIGN (implemented exactly as specified;
 * see the task brief's dedicated design section — nothing here is re-derived).
 *
 * `POST /internal/iam2/bootstrap/first-assignment` lets IAM-01's known bootstrap admin
 * (created by services/iam/src/lib/bootstrap.ts, marked `is_interim_admin = true` on
 * `iam.user_identity` — a marker IAM-02 has NO HTTP visibility into, by design; see
 * IAM-01_IMPLEMENTATION_NOTES.md §12/§3) receive their FIRST `security_admin`/`tech_admin`
 * `iam2.user_role` row without a maker-checker approval — which structurally cannot exist yet,
 * since there is no admin able to approve anything before this runs. This is a config-sealed,
 * structurally-one-time escape hatch, NOT a general bypass:
 *   - config-gated (`IAM2_BOOTSTRAP_TRANSITION_ENABLED`, default false);
 *   - config-sealed to one specific user_id (`IAM2_BOOTSTRAP_ADMIN_USER_ID`, operator-copied
 *     from IAM-01 once — IAM-02 never auto-discovers this);
 *   - requires a verified, stepped-up IAM-01 assertion (`recent_auth_assertion` +
 *     `POST /internal/auth/verify-assertion`, purpose `iam2_bootstrap_transition` — the
 *     operational sequence of calling IAM-01's `/auth/step-up` + `/auth/step-up/verify` with
 *     that exact purpose, authenticated as the bootstrap admin, happens OUTSIDE this endpoint;
 *     this endpoint only verifies the resulting assertion, per the task brief's scope);
 *   - can only ever create a `security_admin` or `tech_admin` role row, never any other;
 *   - is structurally single-use: condition (d) below checks whether ANY active
 *     `security_admin`/`tech_admin` `iam2.user_role` row exists yet, ANYWHERE in the table —
 *     once even one exists (from this endpoint OR from ordinary maker-checker role
 *     assignment thereafter), the condition is permanently false. No separate disable-flag is
 *     needed, but it is checked explicitly and defensively, exactly as instructed.
 *
 * RLS PROBLEM AND FIX — condition (d) needs a GLOBAL existence check, not a per-user one.
 * `iam2.user_role` carries ENABLE + FORCE ROW LEVEL SECURITY scoped to
 * `current_setting('aix.user_id', true)` (006) — an ordinary scoped query can only ever see
 * ONE user's rows. `iam2.fn_count_active_role_assignments` (007, SECURITY DEFINER) is the
 * narrow escape hatch for exactly this — see 007's header comment for why this reuses IAM-01's
 * own established SECURITY DEFINER precedent rather than inventing new architecture.
 *
 * RACE SAFETY — condition (d) + the INSERT run inside one SERIALIZABLE transaction so two
 * concurrent bootstrap attempts cannot both observe "zero rows yet" and both insert; Postgres
 * aborts the loser with a serialization failure, which this handler maps to the same generic
 * denial as every other failure mode below (never leaking which condition/race branch hit).
 */
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { publishAudit, successEnvelope, withTransaction } from "@aix/foundation";
import { meta } from "../plugins/request-context.js";
import { makeIam2InternalIdentityGuard } from "../plugins/internal-identity.js";
import { Iam2Error } from "../lib/errors.js";
import { verifyStepUpAssertion } from "../lib/iam01-client.js";
import { bumpCacheVersion } from "../lib/cache-version.js";
import type { Iam2Config } from "../config.js";

const BOOTSTRAP_PURPOSE = "iam2_bootstrap_transition";
const ELIGIBLE_ROLE_CODES = ["security_admin", "tech_admin"] as const;
type EligibleRoleCode = (typeof ELIGIBLE_ROLE_CODES)[number];

const BootstrapBody = Type.Object(
  {
    recent_auth_assertion: Type.String({ minLength: 1, maxLength: 512 }),
    role_code: Type.Union([Type.Literal("security_admin"), Type.Literal("tech_admin")]),
  },
  { additionalProperties: false },
);

interface RoleRow {
  role_id: string;
}

export async function registerBootstrapRoutes(app: FastifyInstance): Promise<void> {
  const requireInternal = makeIam2InternalIdentityGuard(app.config.iam2InternalServiceToken);
  const config = app.config as Iam2Config;

  app.post(
    "/internal/iam2/bootstrap/first-assignment",
    { preHandler: requireInternal, schema: { body: BootstrapBody } },
    async (request, reply) => {
      const body = request.body as { recent_auth_assertion: string; role_code: EligibleRoleCode };

      const deny = async (internalReason: string): Promise<never> => {
        // Deliberately the SAME generic audit + error for every failure branch — see class
        // header comment. `internalReason` is server-side-only forensic metadata, never
        // reflected in the thrown error's message/code.
        await withTransaction(async (client) => {
          await publishAudit(client, {
            event_type: "iam2.bootstrap_transition_blocked",
            source_module: "IAM-02",
            actor_id: "iam2_bootstrap_transition",
            actor_type: "system",
            entity_type: "user_role",
            entity_id: body.role_code,
            metadata: { internal_reason: internalReason },
          });
        });
        throw new Iam2Error("IAM2_BOOTSTRAP_TRANSITION_UNAVAILABLE");
      };

      // (a) explicit env flag.
      if (!config.bootstrapTransitionEnabled) {
        return deny("transition_disabled");
      }
      if (!config.bootstrapAdminUserId) {
        return deny("no_sealed_admin_configured");
      }

      // Verify the assertion via IAM-01 (fail-closed on any network/non-2xx/invalid outcome —
      // see lib/iam01-client.ts).
      const verified = await verifyStepUpAssertion(
        { baseUrl: config.iam01BaseUrl, internalServiceToken: config.iam01InternalServiceToken, fetchImpl: config.iam01FetchImpl },
        { recentAuthAssertion: body.recent_auth_assertion, requiredPurpose: BOOTSTRAP_PURPOSE },
      );
      if (!verified.valid) {
        return deny("assertion_invalid_or_unreachable");
      }
      // (b) the verified assertion's user_id must exactly equal the config-sealed admin.
      if (verified.userId !== config.bootstrapAdminUserId) {
        return deny("assertion_user_mismatch");
      }
      // (c) auth_level must be present — proves step-up/MFA was actually completed.
      if (!verified.authLevel) {
        return deny("missing_auth_level");
      }

      const result = await withTransaction(async (client) => {
        // Race safety for condition (d) — see class header comment.
        await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

        // (d) no active security_admin/tech_admin user_role row exists yet, ANYWHERE.
        const countRows = await client.query<{ cnt: string }>(
          `SELECT iam2.fn_count_active_role_assignments($1::varchar[]) AS cnt`,
          [ELIGIBLE_ROLE_CODES as unknown as string[]],
        );
        const existingCount = Number(countRows.rows[0]?.cnt ?? "0");
        if (existingCount > 0) {
          return { ok: false as const, reason: "already_consumed" };
        }

        const roleRows = await client.query<RoleRow>(
          `SELECT role_id FROM iam2.role WHERE role_code = $1 AND status = 'active'`,
          [body.role_code],
        );
        const role = roleRows.rows[0];
        if (!role) {
          return { ok: false as const, reason: "role_catalogue_missing" };
        }

        await client.query("SELECT set_config('aix.user_id', $1, true)", [config.bootstrapAdminUserId]);
        await client.query(
          `INSERT INTO iam2.user_role (user_id, role_id, status, assigned_by, approval_id, effective_from_utc)
           VALUES ($1,$2,'active','iam2_bootstrap_transition',NULL, now())`,
          [config.bootstrapAdminUserId, role.role_id],
        );

        await publishAudit(client, {
          event_type: "iam2.bootstrap_transition_completed",
          source_module: "IAM-02",
          actor_id: "iam2_bootstrap_transition",
          actor_type: "system",
          entity_type: "user_role",
          entity_id: config.bootstrapAdminUserId!,
          metadata: { role_code: body.role_code, user_id: config.bootstrapAdminUserId },
        });
        await bumpCacheVersion(client, config.bootstrapAdminUserId!, "bootstrap_transition");

        return { ok: true as const };
      }).catch((err: unknown) => {
        // Serialization failure (concurrent bootstrap attempts) -> same generic denial.
        const pgErr = err as { code?: string };
        if (pgErr?.code === "40001") return { ok: false as const, reason: "serialization_conflict" };
        throw err;
      });

      if (!result.ok) {
        return deny(result.reason);
      }

      return reply.send(successEnvelope({ status: "assigned", role_code: body.role_code }, meta(request)));
    },
  );
}
