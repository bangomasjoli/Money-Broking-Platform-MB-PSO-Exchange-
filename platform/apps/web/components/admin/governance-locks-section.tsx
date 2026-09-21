import { GovernanceLockWorkspace } from "@/components/admin/governance-lock-workspace";
import { LAYERED_LOCKS, LICENCE_PROFILES, LICENCE_STATUS_NOTE } from "@/components/admin/feature-config-data";

/**
 * Licence / Governance Locks — UI Phase 2T (`UI-04` §55.6). The licence scope the platform is locked to, the layered
 * locks that hold independently of it, and the register of governance-locked features.
 *
 * **Feature flags are not a way around the licence scope**, and the section is written so a reader cannot take them
 * for one. The three licence profiles restate Doc 00 §3 as seeded: Money Broking approved, Payment System Operator
 * approved, Exchange application pending and locked until approval. The note beneath them carries the source fact that
 * matters — changing a licence status does not enable any locked feature (`routes/licence-changes.ts`) — because the
 * licence-status workflow is real and approval-bound, and a status of Approved on the Exchange profile would otherwise
 * invite exactly that misreading. The four layered locks (sealed registry, change-request guard, startup route scan,
 * integrity seal) are stated as separate mechanisms, each verified in source.
 *
 * The workspace below lists the thirty locks. They are shown as governed controls, never as toggles: nothing here
 * implies an Admin can enable them, and Exchange-related entries appear only as locked scope boundaries and are never
 * described as available or operational. No principal dealing, market making, derivatives, margin, staking, lending,
 * yield or spread markup is offered anywhere — each is a locked entry. Section-level composition only; the workspace is
 * the sole Client Component.
 */

export function GovernanceLocksSection() {
  return (
    <section aria-labelledby="ffc-locks-heading" className="border-t border-border pt-8">
      <h2 id="ffc-locks-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Licence / Governance Locks
      </h2>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        AIX&apos;s build scope is the approved Money Broking and Payment System Operator licences. The Exchange
        application is pending and locked. Feature configuration cannot widen that scope: the locks below apply
        regardless of any feature or licence record.
      </p>

      <h3 className="mt-6 text-sm font-semibold text-foreground">Licence profiles</h3>
      <ul aria-label="Licence profiles" className="mt-3 flex max-w-prose flex-col">
        {LICENCE_PROFILES.map((profile) => (
          <li
            key={profile.code}
            className="flex items-baseline justify-between gap-4 border-t border-border py-3 first:border-t-0 first:pt-0"
          >
            <span className="text-sm text-foreground">{profile.name}</span>
            <span className="text-right text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{profile.status}</span> · {profile.treatment}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 max-w-prose text-xs text-muted-foreground">{LICENCE_STATUS_NOTE}</p>

      <h3 className="mt-6 text-sm font-semibold text-foreground">Locks that hold regardless of licence status</h3>
      <dl className="mt-3 flex max-w-prose flex-col gap-3">
        {LAYERED_LOCKS.map((item) => (
          <div key={item.term} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <dt className="text-sm text-foreground">{item.term}</dt>
            <dd className="mt-0.5 text-xs text-muted-foreground">{item.meaning}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-8 text-sm font-semibold text-foreground">Governance-locked features</h3>
      <p className="mt-2 mb-4 max-w-prose text-xs text-muted-foreground">
        Entries in the sealed prohibited-feature registry. Each is a governed control that no change request can enable,
        not a switch. Selecting one shows its key, reason and source.
      </p>
      <GovernanceLockWorkspace />
    </section>
  );
}
