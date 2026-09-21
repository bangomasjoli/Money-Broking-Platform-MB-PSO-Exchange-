/**
 * Approval Control Boundary — UI Phase 2R. What IAM-02 records and enforces about approvals today, stated as
 * fact (`UI-04` §53.2, re-verified from `services/iam2/src` and its migrations this turn). It is the page's
 * answer to "what does this control actually guarantee?" — and, deliberately, it does NOT say that only
 * authorised approvers can approve, because the approve route checks no role or permission.
 *
 * **The approve/reject asymmetry is the centre of it** and is shown as a per-control comparison, not
 * hidden: `approve` refuses the requester (audited; the request stays pending), runs a segregation-of-duties
 * check that blocks on a conflict, and enforces step-up only when a policy requires it; `reject` performs
 * none of those, and lazily records expiry without an audit event (approve's path emits one). Neither route
 * checks that the deciding user holds a role or permission, and both enforce one decision per user.
 *
 * The second group is configuration and design facts that an oversight reader would otherwise assume: no
 * approval policy is seeded (the runtime role holds `SELECT` only, so no route can create one) and
 * `required_approver_roles` is stored and read by no code; only two conflict rules are seeded, so "a pass"
 * means no seeded rule matched; the deciding user is asserted by the caller (IAM-02 has no session of its
 * own); one conflicting attempt blocks a request for every approver; and IAM-02 writes decision and
 * conflict-check rows it cannot read back.
 *
 * Restrained by design: plain text, not an error, warning or score — there is no "control health" and no
 * adequacy claim ("Stating these boundaries does not mean the controls are adequate"). Not a policy editor,
 * a role editor, an n-of-m editor or a conflict-rule editor: those are backend and configuration concerns,
 * and the Users / Roles / Permissions and Feature Flags / Configuration pages are separate. A Server
 * Component with no interactive element.
 */

const INDEPENDENCE: { control: string; approve: string; reject: string }[] = [
  {
    control: "Requester and deciding user must differ",
    approve: "Enforced. A self-approval attempt is refused and audited, and the request stays pending.",
    reject: "Not checked.",
  },
  {
    control: "Segregation-of-duties conflict check",
    approve: "Enforced. A conflict blocks the request.",
    reject: "Not checked.",
  },
  {
    control: "Step-up verification",
    approve: "Only when an approval policy requires it. No policy exists.",
    reject: "Not checked.",
  },
  {
    control: "Deciding user holds a role or permission",
    approve: "Not checked.",
    reject: "Not checked.",
  },
  {
    control: "One decision per user per request",
    approve: "Enforced.",
    reject: "Enforced.",
  },
  {
    control: "Expiry",
    approve: "Recorded when a decision is attempted after expiry, and audited.",
    reject: "Recorded when a decision is attempted after expiry. Not audited.",
  },
];

const CONFIGURATION: { term: string; meaning: string }[] = [
  {
    term: "Approval policies",
    meaning:
      "None are seeded, and no route can create one, so every request takes the defaults: one approval, no step-up and a 24-hour expiry.",
  },
  {
    term: "Required approver roles",
    meaning: "Stored on the policy table and read by no code, so they are not a control.",
  },
  {
    term: "Conflict rules",
    meaning:
      "Two are seeded, both between managing conflict rules and assigning roles or permissions. A recorded pass means no seeded rule matched.",
  },
  {
    term: "Identity of the deciding user",
    meaning: "A field in the request. IAM-02 has no signed-in session of its own, so the caller asserts who is deciding.",
  },
  {
    term: "A blocked request",
    meaning: "Is final for every approver, not only the one whose attempt conflicted. A new request is required.",
  },
  {
    term: "Decision records",
    meaning:
      "IAM-02 writes decision and conflict-check rows but cannot read them back, so no read route could show them today. The evidence on this page is demonstrative.",
  },
];

export function ApprovalControlBoundary() {
  return (
    <section aria-labelledby="approval-control-boundary-heading" className="border-t border-border pt-8">
      <h2 id="approval-control-boundary-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Approval Control Boundary
      </h2>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        Approval requests are governed by IAM-02. This section states what it records and enforces today. Admin
        visibility does not grant approval authority, and stating these boundaries does not mean the controls are
        adequate.
      </p>

      <h3 className="mt-6 text-sm font-semibold text-foreground">Independence controls: approve and reject</h3>
      <dl className="mt-3 flex max-w-prose flex-col gap-3">
        {INDEPENDENCE.map((item) => (
          <div key={item.control} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <dt className="text-sm text-foreground">{item.control}</dt>
            <dd className="mt-0.5 text-xs text-muted-foreground">
              <span className="text-foreground">Approve:</span> {item.approve}
            </dd>
            <dd className="mt-0.5 text-xs text-muted-foreground">
              <span className="text-foreground">Reject:</span> {item.reject}
            </dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-6 text-sm font-semibold text-foreground">Configuration and design facts</h3>
      <dl className="mt-3 flex max-w-prose flex-col gap-3">
        {CONFIGURATION.map((item) => (
          <div key={item.term} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <dt className="text-sm text-foreground">{item.term}</dt>
            <dd className="mt-0.5 text-xs text-muted-foreground">{item.meaning}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
