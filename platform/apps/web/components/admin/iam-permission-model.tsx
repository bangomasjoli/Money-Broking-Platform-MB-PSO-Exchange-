import {
  APPROVAL_FLAGGED_COUNT,
  DEFINED_PERMISSION_COUNT,
  LICENCE_LOCKED_PERMISSIONS,
  PERMISSION_DOMAINS,
  SENSITIVITY_COUNTS,
  STEP_UP_FLAGGED_COUNT,
} from "@/components/admin/iam-model-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Permission Model — UI Phase 2S (`UI-04` §54.5). What permissions exist, that **none is granted to any role**,
 * and what that means for effective authorization. The centre of the page: "defined" must never read as
 * "granted".
 *
 * **Defined permissions by domain, as a plain list — not a matrix.** 99 permissions are seeded, counted per
 * owning module. A role × permission grid would be a screenful of empty cells (no `role_permission` row exists),
 * and a grid of checkmarks would be a fabrication; the brief prefers this list, with the grants stated separately.
 * The two flag columns ("Requires approval", "Requires step-up") are catalogue flags and the note says what they
 * are not — they do not say who may approve. The licence-locked permissions are a count and a fact, with no codes.
 *
 * **Role-permission grants: none currently seeded**, stated as its own block with the reasons a reader would ask
 * for, all read from source: no migration inserts one (006 says a raw seed would break the rule that assignment
 * goes through an approved workflow), the runtime role holds `SELECT` only, and the route the specification lists
 * for it is not built. The integration tests create grants only as temporary fixtures on a privileged connection
 * and delete them.
 *
 * **Effective permissions: an empty set under the current path.** `evaluatePermission` reaches an allow decision
 * in exactly one place — an active role assignment whose role holds an active grant (step 10). With no grants,
 * every check on a known permission ends in a non-allow decision. No other mechanism grants a permission: an
 * `allow` override row is stored but never read, and delegation, temporary permission and break-glass tables do
 * not exist. The page does **not** say an Admin role holds all permissions, or any.
 *
 * Approval permissions are defined but not enforced (`IAM2-FIND-002`), and the three `*.read` permissions that a
 * live version of this page would need are defined with no route that checks them. Below `md:` the domain table
 * becomes a list, so nothing scrolls horizontally on a phone. A Server Component with no interactive element.
 */

export function IamPermissionModel() {
  return (
    <section aria-labelledby="iam-permissions-heading" className="border-t border-border pt-8">
      <h2 id="iam-permissions-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Permission Model
      </h2>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        A defined permission is not a granted permission. {DEFINED_PERMISSION_COUNT} permissions are defined in the
        seeded catalogue, all active; none is granted to any role.
      </p>

      <h3 className="mt-6 text-sm font-semibold text-foreground">Defined permissions by domain</h3>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        {SENSITIVITY_COUNTS.normal} normal · {SENSITIVITY_COUNTS.sensitive} sensitive · {SENSITIVITY_COUNTS.privileged}{" "}
        privileged · {SENSITIVITY_COUNTS.prohibited} prohibited. {APPROVAL_FLAGGED_COUNT} are flagged as requiring
        approval and {STEP_UP_FLAGGED_COUNT} as requiring step-up. These are catalogue flags: the permission check
        returns a blocking decision for them, and they do not say who may approve.
      </p>

      <div className="mt-4 hidden max-w-2xl md:block">
        <Table aria-label="Defined permissions by domain">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Domain</TableHead>
              <TableHead className="text-right">Defined</TableHead>
              <TableHead className="text-right">Requires approval</TableHead>
              <TableHead className="text-right">Requires step-up</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERMISSION_DOMAINS.map((row) => (
              <TableRow key={row.domain} className="h-10 hover:bg-transparent">
                <TableCell className="font-medium text-foreground">{row.domain}</TableCell>
                <TableCell className="text-right text-foreground tabular-nums">{row.defined}</TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">{row.requiresApproval}</TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">{row.requiresStepUp}</TableCell>
              </TableRow>
            ))}
            <TableRow className="h-10 hover:bg-transparent">
              <TableCell className="font-medium text-foreground">Licence-locked</TableCell>
              <TableCell className="text-right text-foreground tabular-nums">{LICENCE_LOCKED_PERMISSIONS}</TableCell>
              <TableCell className="text-right text-muted-foreground">Not applicable</TableCell>
              <TableCell className="text-right text-muted-foreground">Not applicable</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <ul aria-label="Defined permissions by domain" className="mt-4 flex flex-col md:hidden">
        {PERMISSION_DOMAINS.map((row) => (
          <li key={row.domain} className="border-t border-border py-3 first:border-t-0 first:pt-0">
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-foreground">{row.domain}</span>
              <span className="text-sm text-foreground tabular-nums">{row.defined} defined</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.requiresApproval} require approval · {row.requiresStepUp} require step-up
            </p>
          </li>
        ))}
        <li className="border-t border-border py-3">
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-foreground">Licence-locked</span>
            <span className="text-sm text-foreground tabular-nums">{LICENCE_LOCKED_PERMISSIONS} defined</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Prohibited · approval and step-up flags not applicable</p>
        </li>
      </ul>
      <p className="mt-3 max-w-prose text-xs text-muted-foreground">
        Licence-locked permissions are prohibited. The permission check denies them before any override or role
        lookup, so they can never be effective. Their codes are not listed.
      </p>

      <h3 className="mt-6 text-sm font-semibold text-foreground">Role-permission grants</h3>
      <p className="mt-2 text-base font-medium text-foreground">None currently seeded.</p>
      <dl className="mt-3 flex max-w-prose flex-col gap-3">
        <div className="border-t border-border pt-3">
          <dt className="text-sm text-foreground">No migration grants a permission to a role</dt>
          <dd className="mt-0.5 text-xs text-muted-foreground">
            The migration records why: role-permission assignment is meant to happen only through an approved
            workflow, so a raw seed would break that rule.
          </dd>
        </div>
        <div className="border-t border-border pt-3">
          <dt className="text-sm text-foreground">No route provisions one</dt>
          <dd className="mt-0.5 text-xs text-muted-foreground">
            The runtime role can read role grants and cannot write them, and the route the specification lists for
            assigning a permission to a role is not built.
          </dd>
        </div>
        <div className="border-t border-border pt-3">
          <dt className="text-sm text-foreground">Enforcement cannot yet be switched on</dt>
          <dd className="mt-0.5 text-xs text-muted-foreground">
            Enabling approver-permission enforcement before grants exist would deny every approval (IAM2-FIND-002).
          </dd>
        </div>
      </dl>

      <h3 className="mt-6 text-sm font-semibold text-foreground">Effective permissions</h3>
      <p className="mt-2 max-w-prose text-sm text-foreground">
        Under the current evaluation path, no identity holds an effective permission.
      </p>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        The IAM-02 permission check reaches an allow decision in one place only: an active role assignment whose role
        holds an active grant for the permission. With no grants, every check on a known permission ends in a
        non-allow decision — deny by default, a blocking step-up or approval requirement, or a licence lock. No other
        mechanism grants a permission: explicit allow overrides are stored but never read, and delegation, temporary
        permission and break-glass do not exist. This is derived from source and the seeded data; a role name or
        description is never evidence of what an identity may do.
      </p>

      <h3 className="mt-6 text-sm font-semibold text-foreground">Notable defined permissions</h3>
      <dl className="mt-3 flex max-w-prose flex-col gap-3">
        <div className="border-t border-border pt-3 first:border-t-0 first:pt-0">
          <dt className="text-sm text-foreground">Approval permissions</dt>
          <dd className="mt-0.5 text-xs text-muted-foreground">
            <code>iam2.approval.create</code>, <code>iam2.approval.approve</code> and{" "}
            <code>iam2.approval.reject</code> are defined and active. IAM2-FIND-002 records that the current decision
            routes do not enforce them.
          </dd>
        </div>
        <div className="border-t border-border pt-3">
          <dt className="text-sm text-foreground">Read permissions for this area</dt>
          <dd className="mt-0.5 text-xs text-muted-foreground">
            <code>iam2.role.read</code>, <code>iam2.permission.read</code> and <code>iam2.sod.read</code> are defined.
            No route exists that would check them, because no role, permission or rule read route is built.
          </dd>
        </div>
      </dl>
    </section>
  );
}
