import {
  CONTROL_ROWS,
  GOVERNED_FINDINGS,
  SOD_RULES,
  type ControlRow,
} from "@/components/admin/iam-model-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Authorization Control Boundary — UI Phase 2S (`UI-04` §54.6). For each control the page has described, what is
 * DEFINED, ASSIGNED, EFFECTIVE and ENFORCED — as four separate statements, so no control is asserted by
 * implication — then the seeded segregation-of-duties rules, pointers to the three governed findings, and the
 * authority statement.
 *
 * **The control table is the page's answer to "what does this actually guarantee?"** Each row's "Enforced" cell
 * opens with an unambiguous word (Yes / No / Indirectly / Defaults only / Deny rows only) so the difference
 * between a control that exists and one that operates is visible without reading a sentence. The approval
 * permissions and required approver roles are "No", by reference to `IAM2-FIND-002`; the approval policy is
 * "Defaults only", by reference to `IAM2-FIND-003`. Consistent with `UI Phase 2R`'s Approval Control Boundary,
 * which it extends and does not contradict: no enforced approver role, no seeded policy, no fake checker
 * eligibility, no seeded grant.
 *
 * **SoD, stated without overclaiming.** Two rules are seeded, both between managing conflict rules and assigning
 * roles or permissions, both critical, blocking and not risk-acceptable. `lib/sod.ts` evaluates a
 * `permission_permission` rule against each side's effective permission set, and that set is built only from role
 * grants — so **while no grants exist neither seeded rule has anything to match** (derived from source, recorded
 * as an observation and not registered as a finding). No role-to-role rule is seeded and action-level conflicts
 * are not evaluated. The recorded result is never described as compliant or as a pass for a user or role: at most
 * "no seeded rule matched", which the text says is not a compliance result.
 *
 * **Findings are context, not a dashboard.** Three lines — identifier, title, severity and status as text — and a
 * pointer to the register. Not a findings table, count, colour or trend.
 *
 * The control table shows at `lg:` (about 976px of content, so five columns fit); below it each control is a
 * stacked block, so nothing scrolls horizontally on a tablet or phone. A Server Component with no interactive
 * element and no link.
 */

export function IamAuthorizationBoundary() {
  return (
    <section aria-labelledby="iam-boundary-heading" className="border-t border-border pt-8">
      <h2 id="iam-boundary-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Authorization Control Boundary
      </h2>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        This UI does not grant or modify authority. Backend enforcement remains authoritative, and Admin visibility of
        this page is not a permission. Current approval authorization is subject to IAM2-FIND-002.
      </p>

      <h3 className="mt-6 text-sm font-semibold text-foreground">Controls: defined, assigned, effective, enforced</h3>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        Effective describes what the IAM-02 permission check would resolve today from the seeded data alone. Live
        state cannot be read.
      </p>

      <div className="mt-4 hidden lg:block">
        <Table aria-label="Authorization controls: defined, assigned, effective and enforced">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Control</TableHead>
              <TableHead>Defined</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Effective</TableHead>
              <TableHead>Enforced</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {CONTROL_ROWS.map((row) => (
              <TableRow key={row.control} className="hover:bg-transparent">
                <TableHead scope="row" className="h-auto py-3 align-top whitespace-normal">
                  <span className="block text-sm font-medium text-foreground">{row.control}</span>
                  {row.detail && <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{row.detail}</span>}
                </TableHead>
                <TableCell className="py-3 align-top text-xs whitespace-normal text-muted-foreground">
                  {row.defined}
                </TableCell>
                <TableCell className="py-3 align-top text-xs whitespace-normal text-muted-foreground">
                  {row.assigned}
                </TableCell>
                <TableCell className="py-3 align-top text-xs whitespace-normal text-muted-foreground">
                  {row.effective}
                </TableCell>
                <TableCell className="py-3 align-top text-xs whitespace-normal text-foreground">
                  {row.enforced}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul aria-label="Authorization controls: defined, assigned, effective and enforced" className="mt-4 flex flex-col lg:hidden">
        {CONTROL_ROWS.map((row) => (
          <li key={row.control} className="border-t border-border py-4 first:border-t-0 first:pt-0">
            <ControlBlock row={row} />
          </li>
        ))}
      </ul>

      <h3 className="mt-8 text-sm font-semibold text-foreground">Segregation-of-duties rules</h3>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        {SOD_RULES.length} rules are seeded. Both compare permissions, and are critical, blocking and not
        risk-acceptable. Permission sets come only from role grants, so while none exist neither rule has anything to
        match. No role-to-role rule is seeded and action-level conflicts are not evaluated, so this is not full
        coverage. A recorded result of no seeded rule matched is not a compliance result.
      </p>
      <ul aria-label="Seeded segregation-of-duties rules" className="mt-3 flex max-w-prose flex-col gap-3">
        {SOD_RULES.map((rule) => (
          <li key={rule.rightPermission} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <p className="text-sm text-foreground">{rule.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <code>{rule.leftPermission}</code> with <code>{rule.rightPermission}</code>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Permission conflict · Critical · Block · Risk acceptance not allowed · Active
            </p>
          </li>
        ))}
      </ul>

      <h3 className="mt-8 text-sm font-semibold text-foreground">Governed findings</h3>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        Context for this area, tracked in the open-findings register. This page records them and does not manage them.
      </p>
      <ul aria-label="Governed IAM-02 findings" className="mt-3 flex max-w-prose flex-col gap-3">
        {GOVERNED_FINDINGS.map((finding) => (
          <li key={finding.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <p className="text-sm text-foreground">
              {finding.id} — {finding.title}
            </p>
            <p className="mt-0.5 text-xs font-medium text-foreground">
              {finding.severity} · {finding.status}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{finding.relevance}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ControlBlock({ row }: { row: ControlRow }) {
  return (
    <>
      <h4 className="text-sm font-medium text-foreground">{row.control}</h4>
      {row.detail && <p className="mt-0.5 text-xs text-muted-foreground">{row.detail}</p>}
      <dl className="mt-2 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">Defined</dt>
        <dd className="text-muted-foreground">{row.defined}</dd>
        <dt className="text-muted-foreground">Assigned</dt>
        <dd className="text-muted-foreground">{row.assigned}</dd>
        <dt className="text-muted-foreground">Effective</dt>
        <dd className="text-muted-foreground">{row.effective}</dd>
        <dt className="text-muted-foreground">Enforced</dt>
        <dd className="text-foreground">{row.enforced}</dd>
      </dl>
    </>
  );
}
