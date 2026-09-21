/**
 * Identities — UI Phase 2S (`UI-04` §54.3). What IAM-01 defines as an identity, and how identities and their links
 * come to exist today — **not an identity directory**, because the source has no directory to show.
 *
 * Re-verified from source this turn: IAM-01 has no route that lists, reads or creates an identity (its readable
 * routes return the caller's own sessions); the only code that inserts into `iam.user_identity` is the
 * environment-gated first-admin bootstrap (`lib/bootstrap.ts`), which runs only when the table is empty, creates one
 * `is_interim_admin` identity and — in its own words — creates "no RBAC/permission grant". `iam.service_account` has
 * an insert nowhere in service code. IAM-02 stores `user_id` as a plain `varchar` with no foreign key into `iam.*`.
 *
 * So the section states the identity vocabulary (three CHECK constraints: type, class, status) and the creation
 * and linkage facts, and carries a factual empty state instead of fictitious identities. The brief allowed three to
 * five demo identities "only if source concepts support them"; what the source supports is the vocabulary, not any
 * identity, and a fixture list of "Active" staff and admin users would invent both existence and status. It also
 * shows no login identifier (the normalised identifier is personal data), credential, MFA material, session or
 * token — authentication, sessions and MFA are IAM-01 concerns and stay out of this authorization page.
 *
 * Service accounts are a separate IAM-01 record, so they are described as such and never as "users". A client's
 * authorised users belong to CLT-01: its optional `iam_user_id` binding establishes client membership, which is
 * not an IAM-02 role and grants no permission. A Server Component with no interactive element.
 */

const VOCABULARY: { term: string; values: string }[] = [
  { term: "Identity type", values: "Client, Staff, Admin or Service." },
  { term: "Identity class", values: "Admin, Staff, Client, Client approver or Service." },
  { term: "Account status", values: "Active, Locked, Suspended or Deactivated." },
];

const FACTS: { term: string; meaning: string }[] = [
  {
    term: "Creation",
    meaning:
      "The only code path that creates an identity is an environment-gated first-admin bootstrap. It runs only when no identity exists, creates one interim admin, and gives that identity no role or permission.",
  },
  {
    term: "Service accounts",
    meaning:
      "Held in a separate IAM-01 record — a service name, a status of active, disabled or rotating, and a scope — not as user identities, although the identity vocabulary also includes a service value. None is seeded, no route creates or lists them, and credentials are never shown.",
  },
  {
    term: "Client-linked users",
    meaning:
      "A client's authorised users belong to CLT-01, which may reference an IAM identity to establish client membership. That link is not an IAM-02 role and grants no permission.",
  },
  {
    term: "Link to roles",
    meaning:
      "IAM-02 stores a user id as a plain value with no database link to IAM-01, so a role assignment does not by itself show that the identity exists.",
  },
];

export function IamIdentityModel() {
  return (
    <section aria-labelledby="iam-identities-heading" className="border-t border-border pt-8">
      <h2 id="iam-identities-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Identities
      </h2>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        IAM-01 holds an identity record for each person who signs in, and IAM-02 attaches roles to an identity by its
        opaque user id. No identity list is shown: no route lists identities, and login identifiers are personal data
        that this page does not display.
      </p>

      <h3 className="mt-6 text-sm font-semibold text-foreground">Identity vocabulary</h3>
      <dl className="mt-3 flex max-w-prose flex-col gap-3">
        {VOCABULARY.map((item) => (
          <div key={item.term} className="flex items-baseline justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0">
            <dt className="text-xs text-muted-foreground">{item.term}</dt>
            <dd className="text-right text-sm text-foreground">{item.values}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 max-w-prose text-xs text-muted-foreground">
        Vocabularies as defined by IAM-01. They describe what an identity record may hold, not which identities exist.
      </p>

      <h3 className="mt-6 text-sm font-semibold text-foreground">How identities and links exist today</h3>
      <dl className="mt-3 flex max-w-prose flex-col gap-3">
        {FACTS.map((item) => (
          <div key={item.term} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <dt className="text-sm text-foreground">{item.term}</dt>
            <dd className="mt-0.5 text-xs text-muted-foreground">{item.meaning}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex max-w-prose flex-col items-start gap-2 rounded-lg border border-dashed border-border px-6 py-6">
        <p className="text-sm font-medium text-foreground">No identities are represented in this demo view.</p>
        <p className="text-xs text-muted-foreground">
          Authentication, sessions and MFA are IAM-01 concerns and are not part of this page. Login identifiers,
          credentials, MFA material, sessions and tokens are not shown.
        </p>
      </div>
    </section>
  );
}
