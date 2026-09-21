/**
 * IAM model data — UI Phase 2S (`UI-04` §54). The seeded IAM-01 / IAM-02 authorization model, as recorded in
 * source, for the read-only Users / Roles / Permissions page.
 *
 * **These are seeded-state facts, not live readings.** Every figure below was counted from
 * `platform/infra/migrations` (006, 007 and the eighteen `iam2_register_*` permission migrations) and the IAM-02
 * route and guard code at baseline `c04d5bd`. No route lists a role, permission, grant, rule or identity, so the
 * live database cannot be read from a browser; a privileged database write after the migrations would not appear
 * here. The page says so in text and never presents a count as a live measurement.
 *
 * **DEFINED / ASSIGNED / EFFECTIVE / ENFORCED are four different things** (the brief's critical rule): a role or
 * permission can be defined and never assigned, assigned and never effective, and effective and never enforced.
 * `CONTROL_ROWS` states all four for each control, so nothing on the page is asserted by implication.
 *
 * Deliberately absent, each because the source has no such concept or no safe projection: any identity record
 * (no route lists identities; the login identifier is personal data), any per-role permission list or matrix
 * (no grant exists to list), any membership (no assignment is seeded), any required-approver-role or policy
 * value (no policy is seeded and the field is read by no code), and any score or percentage.
 */

export const USERS_ROLES_PERMISSIONS_HREF = "/admin/users-roles-permissions";

// ---------------------------------------------------------------------------
// Roles — `iam2.role`, seeded by migration 006 (four rows, the only role seed).
// ---------------------------------------------------------------------------

export interface SeededRole {
  /** `role_code` — the exact identifier. */
  code: string;
  /** `role_name` — the exact seeded display name, so no humanised mapping is needed. */
  name: string;
  /** `role_type`, capitalised for display. Only `admin` and `staff` are seeded. */
  type: "Admin" | "Staff";
  /** `sensitivity`, capitalised. Only `privileged` and `sensitive` are seeded. */
  sensitivity: "Privileged" | "Sensitive";
  /** `owner_team`, capitalised. */
  ownerTeam: string;
  /** The purpose clause of the role's own `description` — recorded intent, never a grant. */
  intent: string;
}

/**
 * All four seeded roles. Each is described in its own row as a "Provisional bootstrap role" whose "final
 * canonical role list is an open item (blueprint §13)". Every seeded role has `status = 'active'`.
 */
export const SEEDED_ROLES: SeededRole[] = [
  {
    code: "security_admin",
    name: "Security Admin",
    type: "Admin",
    sensitivity: "Privileged",
    ownerTeam: "Security",
    intent: "permission security control",
  },
  {
    code: "tech_admin",
    name: "Tech Admin",
    type: "Admin",
    sensitivity: "Privileged",
    ownerTeam: "Technology",
    intent: "technical and admin permission control",
  },
  {
    code: "compliance_officer",
    name: "Compliance Officer / MLRO",
    type: "Staff",
    sensitivity: "Sensitive",
    ownerTeam: "Compliance",
    intent: "compliance approvals and sensitive reads",
  },
  {
    code: "auditor",
    name: "Auditor",
    type: "Staff",
    sensitivity: "Sensitive",
    ownerTeam: "Audit",
    intent: "read-only evidence review",
  },
];

// ---------------------------------------------------------------------------
// Permissions — `iam2.permission`: migration 006 plus eighteen `iam2_register_*` migrations. 99 rows, all `active`.
// ---------------------------------------------------------------------------

export interface PermissionDomain {
  /** `owner_module` — the module whose actions the permission names. */
  domain: string;
  defined: number;
  /** Permissions flagged `requires_approval` (a catalogue flag — it does not say who may approve). */
  requiresApproval: number;
  /** Permissions flagged `requires_step_up`. */
  requiresStepUp: number;
}

/** By owning module, largest first. Counted per row from the migrations' seed tuples. */
export const PERMISSION_DOMAINS: PermissionDomain[] = [
  { domain: "CLT-01", defined: 33, requiresApproval: 19, requiresStepUp: 0 },
  { domain: "IAM-02", defined: 24, requiresApproval: 9, requiresStepUp: 5 },
  { domain: "AML-01", defined: 11, requiresApproval: 2, requiresStepUp: 0 },
  { domain: "CFG-01", defined: 11, requiresApproval: 6, requiresStepUp: 1 },
  { domain: "SEC-01", defined: 6, requiresApproval: 0, requiresStepUp: 0 },
  { domain: "WLT-01", defined: 5, requiresApproval: 2, requiresStepUp: 0 },
  { domain: "KYC-01", defined: 2, requiresApproval: 1, requiresStepUp: 0 },
];

/**
 * Seeded permissions marked `prohibited` and `licence_locked`. The permission check denies them before any
 * override or role lookup, so they can never be effective. Shown as a count and a fact only — their codes are not
 * listed, because naming them would present licence-gated functionality on an access-control page.
 */
export const LICENCE_LOCKED_PERMISSIONS = 7;

export const DEFINED_PERMISSION_COUNT =
  PERMISSION_DOMAINS.reduce((total, domain) => total + domain.defined, 0) + LICENCE_LOCKED_PERMISSIONS;

export const APPROVAL_FLAGGED_COUNT = PERMISSION_DOMAINS.reduce((total, domain) => total + domain.requiresApproval, 0);
export const STEP_UP_FLAGGED_COUNT = PERMISSION_DOMAINS.reduce((total, domain) => total + domain.requiresStepUp, 0);

/** `sensitivity` across all 99: 36 normal, 52 sensitive, 4 privileged, and the 7 prohibited (`financial_critical`). */
export const SENSITIVITY_COUNTS = { normal: 36, sensitive: 52, privileged: 4, prohibited: LICENCE_LOCKED_PERMISSIONS };

// ---------------------------------------------------------------------------
// Seeded counts stated on the page. Each is a verified absence or a verified presence, not a measurement.
// ---------------------------------------------------------------------------

/** `iam2.role_permission` — no migration inserts a row and the runtime role holds `SELECT` only. */
export const SEEDED_ROLE_PERMISSION_GRANTS = 0;
/** `iam2.user_role` — no migration assigns a role to any user. */
export const SEEDED_USER_ROLE_ASSIGNMENTS = 0;
/** `iam2.approval_policy` — no `INSERT` exists anywhere, and the runtime role holds `SELECT` only. */
export const SEEDED_APPROVAL_POLICIES = 0;
/** `iam2.sod_rule` — migration 007 seeds exactly two rows. */
export const SEEDED_SOD_RULES = 2;

export function seededStateLine(): string {
  return [
    `${SEEDED_ROLES.length} defined roles`,
    `${DEFINED_PERMISSION_COUNT} defined permissions`,
    `${SEEDED_ROLE_PERMISSION_GRANTS} seeded role-permission grants`,
    `${SEEDED_USER_ROLE_ASSIGNMENTS} seeded user-role assignments`,
    `${SEEDED_SOD_RULES} seeded SoD rules`,
    `${SEEDED_APPROVAL_POLICIES} seeded approval policies`,
  ].join(" · ");
}

// ---------------------------------------------------------------------------
// SoD rules — `iam2.sod_rule`, migration 007. Both are `permission_permission`, `critical`, `block`,
// `risk_acceptance_allowed = false`, `status = 'active'`.
// ---------------------------------------------------------------------------

export interface SodRule {
  label: string;
  leftPermission: string;
  rightPermission: string;
}

export const SOD_RULES: SodRule[] = [
  {
    label: "Managing conflict rules, and assigning roles to users",
    leftPermission: "iam2.sod.manage",
    rightPermission: "iam2.role.assign_user",
  },
  {
    label: "Managing conflict rules, and assigning permissions to roles",
    leftPermission: "iam2.sod.manage",
    rightPermission: "iam2.permission.assign_role",
  },
];

// ---------------------------------------------------------------------------
// Control rows — DEFINED / ASSIGNED / EFFECTIVE / ENFORCED, one row per control (`UI-04` §54.5).
// ---------------------------------------------------------------------------

export interface ControlRow {
  control: string;
  /** A muted second line — the exact codes, where the control is a specific set of permissions. */
  detail?: string;
  defined: string;
  assigned: string;
  effective: string;
  /** Always opens with an unambiguous word ("Yes", "No", "Indirectly", "Defaults only", "Deny rows only"). */
  enforced: string;
}

export const CONTROL_ROWS: ControlRow[] = [
  {
    control: "Roles",
    defined: `${SEEDED_ROLES.length} seeded roles, a provisional set`,
    assigned: "No user assignment seeded",
    effective: "None — a role confers nothing until it holds permission grants",
    enforced: "Indirectly — consulted only through role grants",
  },
  {
    control: "Permissions",
    defined: `${DEFINED_PERMISSION_COUNT} seeded permissions, all active`,
    assigned: "No role grant seeded",
    effective: "None — no permission can resolve to allow",
    enforced: "Yes — the permission check consults it, and with no grants no check resolves to allow",
  },
  {
    control: "Approval permissions",
    detail: "iam2.approval.create, approve, reject",
    defined: "3 seeded permissions, active",
    assigned: "No role grant seeded",
    effective: "None",
    enforced: "No — the approval routes never evaluate them (IAM2-FIND-002)",
  },
  {
    control: "Required approver roles",
    defined: "A field on the approval policy table",
    assigned: "No policy row seeded",
    effective: "None — not a checker-eligibility rule",
    enforced: "No — read by no code (IAM2-FIND-002)",
  },
  {
    control: "Approval policy",
    defined: "Table exists",
    assigned: "None seeded, and no route can create one",
    effective: "Defaults: one approval, no step-up, 24-hour expiry",
    enforced: "Defaults only — a missing policy does not fail closed (IAM2-FIND-003)",
  },
  {
    control: "Segregation-of-duties rules",
    defined: `${SEEDED_SOD_RULES} seeded rules, both permission-level`,
    assigned: "Not applicable",
    effective: "Cannot match while no role grants exist",
    enforced: "Yes — at role assignment and at approval decision; coverage is narrow",
  },
  {
    control: "Explicit deny override",
    defined: "Table exists",
    assigned: "None seeded, and no route writes one",
    effective: "None",
    enforced: "Deny rows only — allow rows are stored but never read",
  },
  {
    control: "Licence-locked permissions",
    defined: `${LICENCE_LOCKED_PERMISSIONS} seeded permissions, marked prohibited`,
    assigned: "No role grant seeded",
    effective: "Never allowed",
    enforced: "Yes — checked before any override or role lookup",
  },
  {
    control: "Delegation, temporary permission and break-glass",
    defined: "Permissions are defined; the supporting tables are not built",
    assigned: "Nothing to assign",
    effective: "None",
    enforced: "No — deferred to a later IAM-02 phase",
  },
];

// ---------------------------------------------------------------------------
// Governed findings — pointers only (`docs/OPEN_FINDINGS.md`). Text severity and status; never colour alone.
// ---------------------------------------------------------------------------

export interface GovernedFinding {
  id: string;
  title: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  status: "OPEN";
  relevance: string;
}

export const GOVERNED_FINDINGS: GovernedFinding[] = [
  {
    id: "IAM2-FIND-002",
    title: "Approver authorization enforcement gap",
    severity: "HIGH",
    status: "OPEN",
    relevance: "The approval routes check no role or permission for the deciding user.",
  },
  {
    id: "IAM2-FIND-003",
    title: "Approval policy configuration gap",
    severity: "MEDIUM",
    status: "OPEN",
    relevance: "No approval policy is seeded, so defaults apply and nothing fails closed.",
  },
  {
    id: "IAM2-FIND-004",
    title: "Reject-expiry audit gap",
    severity: "LOW",
    status: "OPEN",
    relevance: "Expiry recorded through the reject route is not audited.",
  },
];
