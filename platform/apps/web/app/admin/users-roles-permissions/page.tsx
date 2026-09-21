import { IamAuthorizationBoundary } from "@/components/admin/iam-authorization-boundary";
import { IamIdentityModel } from "@/components/admin/iam-identity-model";
import { IamModelKey } from "@/components/admin/iam-model-key";
import { IamPermissionModel } from "@/components/admin/iam-permission-model";
import { IamRolesMembership } from "@/components/admin/iam-roles-membership";
import { DemoDisclosure } from "@/components/shell/demo-disclosure";
import { PageHeader } from "@/components/shell/page-header";

/**
 * Admin/Compliance Portal — Users / Roles / Permissions. UI Phase 2S. `B`-classified (`UI-04` §9/§54.2): `IAM-01`
 * and `IAM-02` genuinely own the identity, role, permission, assignment and segregation-of-duties model, but
 * every route is `requireInternal`-guarded or caller-scoped and **no route lists or reads an identity, role,
 * permission, grant, assignment or rule** — nothing here is callable from an admin browser session. Hence the demo
 * disclosure, and no fetch, server action, auth, permission check or mutation.
 *
 * **A read-only view of the authorization model, not a user-management console.** No Create User, Disable User,
 * Assign Role, Grant Permission, Reset MFA, Approve or Edit control exists, disabled or otherwise, and no link:
 * Admin visibility does not grant mutation authority. It is not a role, permission, grant, policy or SoD-rule editor.
 *
 * **Section-based, not List + Detail** (`UI-04` §54.3). Every Admin page since `2O` has been a workspace over a
 * record list, but here the source has no useful list: no identity list exists, no assignment is seeded, no grant
 * exists, and the four seeded roles are a short, complete set that reads better as a list than as a workspace with
 * a detail panel over four near-identical rows. Five sections in the order a reader needs them: the four
 * authorization words, identities, roles and membership, the permission model, and the control boundary.
 *
 * **The rule the page is built around:** DEFINED, ASSIGNED, EFFECTIVE and ENFORCED are not interchangeable. A role
 * exists but holds no grant; a permission is defined but `role_permission` has no rows, so no identity holds an
 * effective permission; approval permissions and required approver roles are defined or stored but enforced by
 * no route (`IAM2-FIND-002`); and the two seeded SoD rules have nothing to match while no grant exists.
 *
 * Consistent with `UI Phase 2R`'s Approval Queue, which states the same approval facts. Feature Flags /
 * Configuration and Audit / Sensitive Access are separate future Admin pages and are not absorbed here.
 */
export default function UsersRolesPermissionsPage() {
  return (
    <div>
      <PageHeader
        title="Users / Roles / Permissions"
        description="Review the current IAM identity, role and permission-control model and its effective authorization boundaries."
      />
      <DemoDisclosure>
        Interface preview — identity and authorization records are demonstrative until the required Admin-safe IAM
        projections and provisioning controls are integrated.
      </DemoDisclosure>

      <div className="flex flex-col gap-8">
        <IamModelKey />
        <IamIdentityModel />
        <IamRolesMembership />
        <IamPermissionModel />
        <IamAuthorizationBoundary />
      </div>
    </div>
  );
}
