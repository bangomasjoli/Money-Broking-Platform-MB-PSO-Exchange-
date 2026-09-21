import { SEEDED_ROLES } from "@/components/admin/iam-model-data";

/**
 * Roles & Membership — UI Phase 2S (`UI-04` §54.4). The four roles IAM-02 actually seeds, and how membership is
 * represented — with **no membership and no grant shown, because none is seeded**.
 *
 * **The roles are real records, so they are not demo fixtures.** Migration 006 seeds exactly four (`security_admin`,
 * `tech_admin`, `compliance_officer`, `auditor`) and states that they are a provisional bootstrap catalogue whose
 * final list is an open item; the blueprint's other actors (client user, client approver, staff user, finance
 * user, operations manager, super admin, system job, service account) are deliberately not seeded. So no
 * "Super Admin", "Operations Manager" or similar role appears. The exact `role_name` is shown (no humanised
 * mapping is needed) with `role_code` beside it.
 *
 * **A role's row states what it does and does not hold.** Members and permission grants are both "None seeded",
 * and effective permissions "None" — repeated per role on purpose, because that repetition is the finding, and a
 * role list that omitted the column would let a reader assume the roles do something. The one descriptive line is
 * the role's own recorded intent (its `description`), labelled as description only: it grants nothing, and a name
 * such as "Compliance Officer" must not be read as a set of permissions.
 *
 * **Membership mechanics** (below the list) are stated as source facts: the assignment record's fields; that no
 * migration assigns any role; the only two code paths that write one (the assignment route, gated by an approved
 * decision token and an SoD check, and a one-time config-sealed bootstrap for two roles); that no revoke route
 * exists and the runtime role cannot `UPDATE` an assignment; that roles are global and the optional client id on
 * an assignment is neither written by the route nor read by the permission check, so no client or tenant scope
 * applies; and that the assignment table is row-level-secured per user, so it can be read one user at a time and
 * no route lists it. A Server Component with no interactive element.
 */

const MEMBERSHIP: { term: string; meaning: string }[] = [
  {
    term: "Assignment record",
    meaning:
      "A user-role row binds an opaque user id to a role, with a status of active, revoked or expired, an assigner, an optional approval reference, a start time and an optional expiry.",
  },
  {
    term: "Seeded assignments",
    meaning: "None. No migration assigns any role to any user.",
  },
  {
    term: "How a role reaches a user",
    meaning:
      "Two code paths write an assignment. The assignment route needs a decision token from an approved request and runs a segregation-of-duties check; because approval decisions check no role or permission (IAM2-FIND-002), that path is subject to the same finding. A one-time bootstrap transition, off by default and sealed to one pre-configured identity, can give that identity Security Admin or Tech Admin only.",
  },
  {
    term: "Revocation",
    meaning: "No revoke route is built, so no route ends an assignment.",
  },
  {
    term: "Scope",
    meaning:
      "Roles are global catalogue entries. An assignment can carry a client id, but the assignment route does not set one and the permission check does not read it, so no client or tenant scope applies to a grant today.",
  },
  {
    term: "Readability",
    meaning:
      "Assignments are restricted to one user at a time by row-level security, and no route lists them, so a membership view has nothing to read from.",
  },
];

export function IamRolesMembership() {
  return (
    <section aria-labelledby="iam-roles-heading" className="border-t border-border pt-8">
      <h2 id="iam-roles-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Roles &amp; Membership
      </h2>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        The seeded IAM-02 catalogue defines {SEEDED_ROLES.length} roles. They are a provisional bootstrap set — the
        final role list is an open item — and a defined role is not a granted capability. The blueprint&apos;s
        other actors (client user, client approver, staff user, finance user, operations manager, super admin, system
        job, service account) are not defined as roles. Recorded intent is each role&apos;s own description; it is
        not a grant.
      </p>

      <ul aria-label="Seeded roles" className="mt-6 flex flex-col">
        {SEEDED_ROLES.map((role) => (
          <li
            key={role.code}
            className="border-t border-border py-4 first:border-t-0 first:pt-0 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-8"
          >
            <div>
              <h3 className="text-sm font-semibold text-foreground">{role.name}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <code>{role.code}</code>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {role.type} role · {role.sensitivity} · Active · {role.ownerTeam} team
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Recorded intent: {role.intent}.</p>
            </div>
            <dl className="mt-3 flex flex-col gap-2 md:mt-0">
              <RoleFact label="Members">None seeded</RoleFact>
              <RoleFact label="Permission grants">None seeded</RoleFact>
              <RoleFact label="Effective permissions">None</RoleFact>
            </dl>
          </li>
        ))}
      </ul>

      <h3 className="mt-6 text-sm font-semibold text-foreground">How membership is represented</h3>
      <dl className="mt-3 flex max-w-prose flex-col gap-3">
        {MEMBERSHIP.map((item) => (
          <div key={item.term} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <dt className="text-sm text-foreground">{item.term}</dt>
            <dd className="mt-0.5 text-xs text-muted-foreground">{item.meaning}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RoleFact({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2 first:border-t-0 first:pt-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm text-foreground">{children}</dd>
    </div>
  );
}
