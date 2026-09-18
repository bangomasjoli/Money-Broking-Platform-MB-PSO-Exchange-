import { KYC_CASE_LABELS } from "@/components/client/client-demo-data";
import { CURRENT_KYC_STATUS } from "@/components/compliance/compliance-data";

/**
 * Current Status — UI Phase 2H, primary column, `WORKSPACE PANEL` (`UI-04` §35.17). The ONE
 * primary client-facing status this page leads with — `kyc_case.status`
 * (`pending_documents`/`completed`/`remediation`), reused verbatim from the shared
 * `client-demo-data.ts` module (`UI Phase 2F`/`2G`'s own value) so this page can never disagree
 * with Overview or Profile about the organisation's KYC/KYB state.
 *
 * **No timeline/progress stepper** — evaluated and omitted (`UI-04` §43's own reasoning): the
 * governed model has exactly 3 coarse case states, not a stable sequential "Submitted → Document
 * Review → Verification → Decision" pipeline found anywhere in the actual `KYC-01` source; `
 * remediation` is a RETURN transition, not a forward step, so representing these three states as
 * a linear progress bar would misrepresent the real state machine. No percentage, no progress
 * ring (this turn's explicit prohibition) — a plain status line only, not color-only (icon-free
 * here deliberately, since the single large status line's own text is already the complete
 * signal; `Badge`/icon treatment is reserved for the denser Verification Areas list instead).
 */
export function CurrentStatus() {
  return (
    <section aria-labelledby="current-status-heading">
      <h2 id="current-status-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Current Status
      </h2>

      <p className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
        {KYC_CASE_LABELS[CURRENT_KYC_STATUS]}
      </p>

      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        This is your organisation&rsquo;s current KYC/KYB verification status. Any outstanding
        information is listed below.
      </p>
    </section>
  );
}
