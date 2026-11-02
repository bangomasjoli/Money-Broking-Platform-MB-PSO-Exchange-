/**
 * IAM-02 permission guard core (`07_Permission_Rules.md` §7 precedence chain).
 *
 * `evaluatePermission` implements the 11-step precedence chain EXACTLY IN ORDER.
 *
 * STAGE 2 UPDATE (Phases 3-5): steps 6 (step-up) and 7 (approval) remain flag-only checks in
 * THIS function exactly as Phase 2 left them — `evaluatePermission` itself never calls out to
 * IAM-01 or creates an approval_request; it only signals that one is needed. The actual
 * approval lifecycle (routes/approvals.ts), decision-token issuance/verification
 * (lib/decision-token.ts), IAM-01 step-up verification (lib/iam01-client.ts), and SoD
 * enforcement (lib/sod.ts) are now real, but they live in the ROUTE layer around this
 * function, not inside it — see each route file's header comment for how they compose with a
 * guard call. Step 10 (role permission) gained one new behaviour: when the caller supplies a
 * `payloadHash` and the decision is "allow", a decision token is issued (Phase 3). Steps 3
 * (freeze) and 5 (SoD) remain documented no-op fall-throughs in this function — see their
 * inline comments below for exactly why each stays that way.
 *
 * IAM02-AUTHZ-REM-001 UPDATE: the chain below is now parameterised (`evaluateChain`) behind three
 * entry points — `evaluatePermission` (behaviour and result shape UNCHANGED),
 * `evaluatePermissionWithStepUp` (step 6 satisfied only by a registry-checked `VerifiedStepUp`
 * bound to the actor and an expected purpose; lib/iam01-client.ts) and `evaluateEntitlement`
 * (the UNDERLYING grant only — steps 6/7 skipped, no token — used to re-check the maker at
 * request, approval and execution). Step 3 (account/session freeze) is STILL a no-op, so a
 * suspended maker/rejecter/acting admin is not refused here (plan §4B R-1).
 *
 * ---------------------------------------------------------------------------------------
 * JUDGMENT CALL — what does the request's `action` field mean as a lookup key?
 * ---------------------------------------------------------------------------------------
 * `04_API_Specification.md` §2.1's example request has `"action": "withdrawal.approve"` and
 * a separate `"resource": "withdrawal"` field, but the permission namespace convention
 * (`07_Permission_Rules.md` §1) is `<module>.<resource>.<action>` (e.g.
 * `iam2.role.assign_user`, `exchange.market_maker.enable`) — a 3-segment code, not the
 * example's 2-segment shorthand, and there is no documented rule for concatenating a
 * separately-supplied `resource` field into the lookup key. This implementation treats the
 * request's `action` field AS the fully-qualified `iam2.permission.permission_code` to
 * evaluate (i.e. callers of this internal endpoint are expected to pass the complete
 * namespaced code, e.g. `"iam2.role.assign_user"`, in `action`); `resource`/`entity_id`/
 * `client_id` are carried through for logging/audit/context only, never concatenated into
 * the lookup key. Flagged explicitly for stage 2 / product-owner confirmation — see the
 * implementation report.
 *
 * ---------------------------------------------------------------------------------------
 * JUDGMENT CALL — explicit ALLOW overrides are not a grant path this stage.
 * ---------------------------------------------------------------------------------------
 * `05_Database_Design.md` §2.5 documents `iam2.user_permission_override.effect` as
 * `allow|deny`, but `07_Permission_Rules.md` §7's 11-step precedence list only names
 * "Explicit deny override" (step 4) — there is no corresponding "explicit allow override"
 * step anywhere in the chain. The task brief mirrors this exactly: step 4 is scoped to "deny
 * override... implement the real check" only, and the unit-test list only exercises the
 * deny-wins-over-role-allow case. This implementation therefore only reads/enforces `effect
 * = 'deny'` overrides; an `effect = 'allow'` row is stored (schema exists from Phase 1) but
 * is not read as an independent grant path by this stage's guard. This is a deliberate scope
 * match between the brief and the blueprint's own precedence list, not a contradiction to
 * halt on — but it means an isolated allow-override (with no underlying role permission)
 * currently grants nothing; flagged for stage 2 in the implementation report.
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { publishAudit } from "@aix/foundation";
import { issueDecisionToken } from "./decision-token.js";
import { isVerifiedStepUp } from "./iam01-client.js";

export type PermissionDecision = "allow" | "deny" | "approval_required" | "step_up_required" | "licence_locked";

export interface PermissionCheckInput {
  actorId: string;
  sessionId?: string;
  /** Treated as the fully-qualified iam2.permission.permission_code — see header comment. */
  action: string;
  resource: string;
  entityId?: string;
  clientId?: string;
  context?: Record<string, unknown>;
  /**
   * Phase 3 addition. Canonical hash (see routes/internal.ts — computed via @aix/foundation's
   * `fingerprint`) of the business payload this permission check is guarding. Only present
   * when the calling module has a payload worth binding to an execution (e.g. a withdrawal
   * amount/destination) — a simple read action has none. When present AND the decision
   * resolves to "allow", a decision token is issued (see PermissionCheckResult.decisionToken).
   */
  payloadHash?: string;
}

export interface PermissionCheckResult {
  decision: PermissionDecision;
  reason: string;
  cacheVersion: number;
  sodConflict: false;
  stepUpRequired: boolean;
  approvalRequired: boolean;
  /** Echoed back verbatim when the caller supplied one (04_API_Specification.md §2.1). */
  payloadHash?: string;
  /** Only present when a decision token was actually issued (allow + payloadHash supplied). */
  decisionToken?: string;
}

interface PermissionRow {
  permission_id: string;
  permission_code: string;
  licence_locked: boolean;
  prohibited: boolean;
  requires_step_up: boolean;
  requires_approval: boolean;
}

async function lookupPermission(client: PoolClient, permissionCode: string): Promise<PermissionRow | undefined> {
  const res = await client.query<PermissionRow>(
    `SELECT permission_id, permission_code, licence_locked, prohibited, requires_step_up, requires_approval
       FROM iam2.permission
      WHERE permission_code = $1 AND status = 'active'`,
    [permissionCode],
  );
  return res.rows[0];
}

/**
 * Step 4 — explicit deny override. `iam2.user_permission_override` is RLS-protected by
 * `user_id`; the caller MUST have already set `aix.module`-equivalent scope, i.e.
 * `SELECT set_config('aix.user_id', $actorId, true)`, on this SAME transaction before this
 * runs, or FORCE RLS will (correctly) hide the row — see routes/internal.ts.
 */
async function lookupActiveDenyOverride(
  client: PoolClient,
  actorId: string,
  permissionId: string,
): Promise<boolean> {
  const res = await client.query(
    `SELECT 1
       FROM iam2.user_permission_override
      WHERE user_id = $1
        AND permission_id = $2
        AND effect = 'deny'
        AND status = 'active'
        AND (expires_at_utc IS NULL OR expires_at_utc > now())
      LIMIT 1`,
    [actorId, permissionId],
  );
  return (res.rowCount ?? 0) > 0;
}

interface RoleGrantRow {
  role_code: string;
}

/**
 * Step 10 — role permission. `iam2.user_role` is RLS-protected by `user_id`; same scoping
 * requirement as lookupActiveDenyOverride above. `iam2.role`/`iam2.role_permission` are
 * global catalogues (no RLS) but are still filtered by status here (active-only).
 */
async function lookupActiveRoleGrants(
  client: PoolClient,
  actorId: string,
  permissionId: string,
): Promise<RoleGrantRow[]> {
  const res = await client.query<RoleGrantRow>(
    `SELECT DISTINCT r.role_code
       FROM iam2.user_role ur
       JOIN iam2.role r ON r.role_id = ur.role_id
       JOIN iam2.role_permission rp ON rp.role_id = ur.role_id
      WHERE ur.user_id = $1
        AND rp.permission_id = $2
        AND ur.status = 'active'
        AND ur.revoked_at_utc IS NULL
        AND ur.effective_from_utc <= now()
        AND (ur.expires_at_utc IS NULL OR ur.expires_at_utc > now())
        AND r.status = 'active'
        AND rp.status = 'active'
        AND rp.revoked_at_utc IS NULL
        AND rp.effective_from_utc <= now()`,
    [actorId, permissionId],
  );
  return res.rows;
}

/**
 * Not RLS-protected (small state table, no owner). Absence of a row is normal for a fresh
 * install / an actor that has never had its cache invalidated — treated as version 0, NOT a
 * fail-closed error (§09 Error Handling doesn't list "no cache row yet" as an unavailable-
 * cache failure mode; that's for when the cache mechanism itself is broken, which Phase 5
 * introduces alongside the bump logic).
 *
 * Exported (Phase 3-5): `lib/decision-token.ts`'s execute-verify path needs the actor's
 * CURRENT cache version to compare against a decision token's bound cache_version, and
 * `lib/cache-version.ts`'s `bumpCacheVersion` is the only writer — this stays the one reader.
 */
export async function lookupCacheVersion(client: PoolClient, subjectId: string): Promise<number> {
  const res = await client.query<{ cache_version: number }>(
    `SELECT cache_version FROM iam2.permission_cache_version WHERE subject_id = $1`,
    [subjectId],
  );
  return res.rows[0]?.cache_version ?? 0;
}

/** Maps a guard decision to the `08_Audit_Log_Events.md` event type to publish. */
function auditEventType(decision: PermissionDecision): string {
  switch (decision) {
    case "allow":
      return "iam2.permission_decision_allow";
    case "approval_required":
      return "iam2.permission_decision_approval_required";
    case "licence_locked":
      // Dedicated event per 08_Audit_Log_Events.md ("Locked permission attempted", Critical)
      // — more specific than the generic deny event, used for both the licence-lock (step 1)
      // and prohibited (step 2) precedence rules (see guard.ts step 1/2 comments for why
      // they share one public decision/reason vocabulary).
      return "iam2.licence_locked_permission_blocked";
    case "deny":
    case "step_up_required":
      // The brief names iam2.permission_decision_allow/iam2.permission_decision_deny as the
      // two events this stage emits; 08_Audit_Log_Events.md has no dedicated "step up
      // required" event, so step_up_required is audited under the generic deny event too —
      // it IS a blocking outcome, not a successful grant.
      return "iam2.permission_decision_deny";
  }
}

async function recordDecision(
  client: PoolClient,
  input: PermissionCheckInput,
  decision: PermissionDecision,
  reasonCode: string,
  internalReasonCode: string,
  cacheVersion: number,
  permissionSources: string[],
): Promise<void> {
  const decisionId = "dec_" + randomUUID();
  await client.query(
    `INSERT INTO iam2.permission_decision_log
       (decision_id, actor_user_id, action, resource, entity_id, client_id, decision, reason_code,
        permission_sources, session_id, cache_version, occurred_at_utc, correlation_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now(), $12)`,
    [
      decisionId,
      input.actorId,
      input.action,
      input.resource,
      input.entityId ?? null,
      input.clientId ?? null,
      decision,
      internalReasonCode,
      JSON.stringify(permissionSources),
      input.sessionId ?? null,
      cacheVersion,
      null,
    ],
  );

  await publishAudit(client, {
    event_type: auditEventType(decision),
    source_module: "IAM-02",
    actor_id: input.actorId,
    actor_type: "user",
    entity_type: input.resource,
    entity_id: input.entityId ?? input.action,
    metadata: {
      action: input.action,
      decision,
      reason: reasonCode,
      client_id: input.clientId ?? null,
    },
  });
}

/**
 * IAM02-AUTHZ-REM-001 (C-1, AZ-02, AZ-04, AZ-05). The 11-step chain, parameterised. The three
 * public entry points below differ ONLY in these options:
 *   - `evaluatePermission`            : no options — behaviour and result shape UNCHANGED.
 *   - `evaluatePermissionWithStepUp`  : step 6 is satisfied by an unforgeable `VerifiedStepUp`
 *                                       bound to the actor and the expected purpose.
 *   - `evaluateEntitlement`           : steps 6/7 (flag-only step-up/approval signals) are
 *                                       deliberately skipped — the caller is checking the
 *                                       UNDERLYING grant (maker entitlement, C-2 B) because an
 *                                       approval is additional to, never a substitute for, it —
 *                                       and no decision token is ever issued.
 * Every other step (unknown permission, licence lock, prohibited, explicit deny override, role
 * grant, default deny) and every audit/decision-log write is the same code path.
 */
interface ChainOptions {
  skipApprovalSteps?: boolean;
  suppressToken?: boolean;
  stepUp?: { evidence: unknown; expectedPurpose: string };
}

export interface ResolvedPermissionFlags {
  permissionCode: string;
  requiresStepUp: boolean;
  requiresApproval: boolean;
}

interface ChainOutcome {
  result: PermissionCheckResult;
  /** Present once the permission code resolved to an active catalogue row. */
  permission?: ResolvedPermissionFlags;
}

function stepUpSatisfies(
  option: ChainOptions["stepUp"],
  actorId: string,
): boolean {
  if (!option || !isVerifiedStepUp(option.evidence)) return false;
  const evidence = option.evidence;
  return (
    evidence.userId === actorId &&
    evidence.purpose === option.expectedPurpose &&
    evidence.freshUntilMs > Date.now()
  );
}

async function evaluateChain(
  client: PoolClient,
  input: PermissionCheckInput,
  options: ChainOptions,
): Promise<ChainOutcome> {
  const cacheVersion = await lookupCacheVersion(client, input.actorId);

  const finish = async (
    decision: PermissionDecision,
    reason: string,
    internalReasonCode: string,
    permissionSources: string[] = [],
  ): Promise<PermissionCheckResult> => {
    await recordDecision(client, input, decision, reason, internalReasonCode, cacheVersion, permissionSources);
    return {
      decision,
      reason,
      cacheVersion,
      sodConflict: false,
      stepUpRequired: decision === "step_up_required",
      approvalRequired: decision === "approval_required",
      ...(input.payloadHash !== undefined ? { payloadHash: input.payloadHash } : {}),
    };
  };

  // Fail-closed: unknown permission code (§09 Error Handling §3 rule 1). Checked before the
  // 11-step chain even starts — there is nothing to evaluate a precedence rule against.
  const permission = await lookupPermission(client, input.action);
  if (!permission) {
    return { result: await finish("deny", "IAM2_PERMISSION_UNKNOWN", "unknown_permission_code") };
  }
  const flags: ResolvedPermissionFlags = {
    permissionCode: permission.permission_code,
    requiresStepUp: permission.requires_step_up,
    requiresApproval: permission.requires_approval,
  };
  const out = async (result: PermissionCheckResult): Promise<ChainOutcome> => ({ result, permission: flags });

  // ---- Step 1: licence-lock deny (§7 rule 1 / §5.12 / §5.14 interim contract). ----
  // `iam2.permission.licence_locked` is the cached/index flag; source of truth is the
  // config-sealed list matching Document 00 v1.3 until CFG-01 exists. This IS real
  // enforcement this stage (not a stub) — see the task brief's Phase 2 spec for step 1.
  if (permission.licence_locked) {
    return out(await finish("licence_locked", "IAM2_LICENCE_LOCKED_PERMISSION", "licence_lock_deny"));
  }

  // ---- Step 2: prohibited permission deny (§7 rule 2 / §5.12). ----
  // Never overridable by anything below this point — checked before any override/role logic
  // can run, exactly as required by §2A ("cannot be overridden by user override, delegation,
  // temporary permission, or break-glass").
  if (permission.prohibited) {
    return out(await finish("licence_locked", "IAM2_LICENCE_LOCKED_PERMISSION", "prohibited_deny"));
  }

  // ---- Step 3: account/session freeze deny — STILL a documented no-op fall-through. ----
  // Phase 5 gave IAM-02 exactly ONE IAM-01 HTTP capability to integrate with:
  // `POST /internal/auth/verify-assertion` (lib/iam01-client.ts) — a PURPOSE-BOUND, one-shot
  // "was a specific step-up assertion just completed" check, not a general "is this user's
  // account/session currently frozen/suspended" query. IAM-01 does not expose any HTTP
  // endpoint that reports freeze/suspension/session status generically (its session-status
  // surface is internal to services/iam), and adding one would mean modifying IAM-01's
  // already-accepted code — explicitly out of scope for this stage (see the task brief's
  // READ FIRST §1: "if it turns out to need more than that, leave it as documented fall-
  // through and note why"). So this step remains exactly what it was in Phase 2: the chain
  // proceeds to step 4 rather than blocking or erroring. Flagged as a Phase 6/7-adjacent gap
  // (needs a new IAM-01-side endpoint, which is IAM-01's call to make, not IAM-02's).
  // IAM02-AUTHZ-REM-001 (plan §4B R-1): still NOT enforced for makers after OD-1 Option A —
  // the new IAM-01 fields cover only the step-up ASSERTION OWNER (the approver) at approval
  // time. A suspended/frozen maker, rejecter or acting admin is not refused here.

  // ---- Step 4: explicit deny override (§7 rule 4 / §05.2.5 rule 1). Real check. ----
  const denied = await lookupActiveDenyOverride(client, input.actorId, permission.permission_id);
  if (denied) {
    return out(await finish("deny", "IAM2_PERMISSION_DENIED", "explicit_deny_override"));
  }

  // ---- Step 5: SoD block — STILL a no-op fall-through IN THIS FUNCTION, by design. ----
  // Phase 4 makes SoD enforcement real (lib/sod.ts), but re-reading 07_Permission_Rules.md §5
  // "SoD Conflict Examples" (maker==checker, role-assigner==approver, permission-admin
  // approving own privilege escalation, ...) shows every example is about a MUTATION (a role
  // being assigned, an approval being decided) — never about a plain `permission/check` read
  // of "can actor X do Y". There is nothing for THIS function to check here: `evaluatePermission`
  // is not assigning a role or deciding an approval, so there is no "proposed change" to test
  // against `iam2.sod_rule` yet. SoD is therefore enforced AT THE TWO PLACES THINGS ACTUALLY
  // GET ASSIGNED/DECIDED instead: `routes/roles.ts` (role assignment) and `routes/approvals.ts`
  // (approval decision) — both call `lib/sod.ts`'s `checkRoleAssignmentSodConflict` /
  // `checkApprovalSodConflict`. This step's slot in the precedence chain remains a documented
  // no-op: the chain proceeds to step 6 without querying sod_rule/sod_check here.

  // ---- Step 6: missing step-up -> step_up_required. Real BLOCKING decision. ----
  // `evaluatePermission` never verifies an assertion itself; it gates on the permission's own
  // flag per 07_Permission_Rules.md §7 rule 6. `evaluatePermissionWithStepUp` lets a caller
  // that ALREADY verified an assertion (lib/iam01-client.ts `verifyApproverStepUp`) satisfy
  // this step with unforgeable evidence bound to the actor and the expected purpose.
  if (permission.requires_step_up && !options.skipApprovalSteps && !stepUpSatisfies(options.stepUp, input.actorId)) {
    return out(await finish("step_up_required", "IAM2_STEP_UP_REQUIRED", "step_up_required"));
  }

  // ---- Step 7: approval required. Real BLOCKING decision. ----
  // Actual approval-request creation/maker-checker lifecycle is Phase 3/4 (later stage) —
  // this stage only signals that approval is needed, per 07_Permission_Rules.md §7 rule 7.
  if (permission.requires_approval && !options.skipApprovalSteps) {
    return out(await finish("approval_required", "IAM2_APPROVAL_REQUIRED", "approval_required"));
  }

  // ---- Step 8: temporary permission — NO-OP FALL-THROUGH THIS STAGE. ----
  // iam2.temporary_permission does not exist yet (Phase 6, out of scope). Falls through.

  // ---- Step 9: delegated permission — NO-OP FALL-THROUGH THIS STAGE. ----
  // iam2.delegation does not exist yet (Phase 6, out of scope). Falls through.

  // ---- Step 10: role permission. Real check. ----
  const grants = await lookupActiveRoleGrants(client, input.actorId, permission.permission_id);
  if (grants.length > 0) {
    const result = await finish(
      "allow",
      "permission_granted",
      "role_permission_grant",
      grants.map((g) => g.role_code),
    );
    // Phase 3: a check with no payloadHash (e.g. a simple read action) needs no execution
    // binding — only issue a decision token when the caller supplied a payload to bind.
    if (input.payloadHash && !options.suppressToken) {
      const issued = await issueDecisionToken(client, {
        actorUserId: input.actorId,
        sessionId: input.sessionId ?? null,
        action: input.action,
        resource: input.resource,
        entityId: input.entityId ?? null,
        clientId: input.clientId ?? null,
        payloadHash: input.payloadHash,
        approvalId: null,
        stepUpAssertionRef: null,
        cacheVersion,
      });
      return out({ ...result, decisionToken: issued.rawToken });
    }
    return out(result);
  }

  // ---- Step 11: default deny. Structural fail-closed default. ----
  return out(await finish("deny", "IAM2_PERMISSION_DENIED", "default_deny_no_assignment"));
}

/** Unchanged public behaviour: the flag-only guard (callers: permission/check, roles.ts). */
export async function evaluatePermission(
  client: PoolClient,
  input: PermissionCheckInput,
): Promise<PermissionCheckResult> {
  return (await evaluateChain(client, input, {})).result;
}

/**
 * C-1 / AZ-04 / AZ-05. Same chain as `evaluatePermission`, except step 6 passes when
 * `stepUp.evidence` is a registry-checked `VerifiedStepUp` for THIS actor and
 * `stepUp.expectedPurpose` that has not expired. Anything else (absent, forged, other user,
 * other purpose, stale) leaves the blocking `step_up_required` decision in force. The caller
 * must have set `aix.user_id` to the actor first (RLS-protected reads in steps 4 and 10).
 */
export async function evaluatePermissionWithStepUp(
  client: PoolClient,
  input: PermissionCheckInput,
  stepUp: { evidence: unknown; expectedPurpose: string } | undefined,
): Promise<PermissionCheckResult> {
  return (await evaluateChain(client, input, { suppressToken: true, ...(stepUp ? { stepUp } : {}) })).result;
}

/**
 * C-2 B / AZ-01 / AZ-02. Is the actor entitled to the UNDERLYING permission? Used for the
 * maker at approval-request time, at approval time and at execution. Skips the flag-only
 * step-up/approval signals (an approval is additional to the grant, never a replacement for
 * it), records its decision like every other evaluation, and never issues a token. The caller
 * must have set `aix.user_id` to the actor first.
 */
export async function evaluateEntitlement(
  client: PoolClient,
  input: Omit<PermissionCheckInput, "payloadHash">,
): Promise<ChainOutcome> {
  return evaluateChain(client, input, { skipApprovalSteps: true, suppressToken: true });
}
