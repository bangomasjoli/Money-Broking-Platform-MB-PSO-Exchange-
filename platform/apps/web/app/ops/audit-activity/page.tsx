import { AuditActivityWorkspace } from "@/components/ops/audit-activity-workspace";
import { DemoDisclosure } from "@/components/shell/demo-disclosure";
import { PageHeader } from "@/components/shell/page-header";

/**
 * Staff/Operations Portal — Audit / Activity. UI Phase 2M. `B`-classified (`UI-04` §8/§48): `SEC-01`
 * genuinely owns a paginated, tier-redacted audit search/read (`POST /internal/sec1/audit-events/
 * search` and `.../read`), but both are internal-token routes gated by an `IAM-02` permission that no
 * role is granted, with the acting user a request-body field; and nothing carries the modules' own
 * audit events into SEC-01 yet (no relay, only three source bindings, four registered event types).
 * Nothing here is callable from a staff browser session — hence the demo disclosure and no fetch,
 * server action, auth, permission check, export or mutation of any kind.
 *
 * Route `/ops/audit-activity` — the slug of the governed nav label "Audit / Activity", following the
 * label → slug convention `/ops/client-requests`, `/ops/wallet-destination-review` and
 * `/ops/maker-checker-queue` set (a `/` in the label becomes a `-`).
 *
 * An ACTIVITY LIST / DETAIL WORKSPACE (`UI-04` §35.16) — not a log viewer, SIEM, debug console or
 * database event browser: only the safe, standard-tier projection is shown, never a raw payload.
 */
export default function AuditActivityPage() {
  return (
    <div>
      <PageHeader
        title="Audit / Activity"
        description="Review governed operational activity and safe audit evidence across supported AIX workflows."
      />
      <DemoDisclosure>
        Interface preview — activity records are demonstrative until the staff-facing SEC-01 audit projection is
        integrated.
      </DemoDisclosure>
      <AuditActivityWorkspace />
    </div>
  );
}
