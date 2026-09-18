import {
  AUTHORISED_PARTY_TYPE_LABELS,
  DEMO_AUTHORISED_PARTIES,
  UBO_ON_FILE,
} from "@/components/profile/profile-data";

/**
 * Authorised Representatives — UI Phase 2G, `WORKSPACE PANEL`. Uses the real governed
 * `AUTHORISED_PARTY_TYPES` vocabulary (`signatory`/`director`/`controller` — `ubo` handled
 * separately below, never mixed into this list) — this turn's own "do not collapse these roles"
 * instruction: these are `CLT-01`'s legal-representative roles (`authorised_party`), NOT the
 * platform-access roles (`authorised_user`: `client_admin`/`client_maker`/`client_approver`/
 * `viewer`) — the two are never conflated here, and platform-access roles are not shown on this
 * page at all (that is an IAM/account-access concern, out of this page's scope).
 *
 * **No representative name is shown** — the real `authorised_party` row has no name field
 * (`party_reference`/`party_type`/`ownership_percentage` only), so each row shows only its role
 * and "On file," never a fabricated person name.
 *
 * **Beneficial ownership (UBO):** a single minimal summary line only — "On file" or "Not
 * provided" — never an ownership percentage, party count, or identity detail, per this turn's
 * explicit sensitive-data restriction. Not listed among the representative rows above (`ubo` is
 * excluded from `AuthorisedPartyType`).
 */
export function AuthorisedRepresentatives() {
  return (
    <section aria-labelledby="authorised-representatives-heading">
      <h2
        id="authorised-representatives-heading"
        className="text-lg font-semibold tracking-tight text-foreground"
      >
        Authorised Representatives
      </h2>

      <ul className="mt-4 flex flex-col gap-1">
        {DEMO_AUTHORISED_PARTIES.map((party) => (
          <li
            key={party.id}
            className="flex items-center justify-between gap-4 border-t border-border py-2.5 first:border-t-0"
          >
            <span className="text-sm font-medium text-foreground">
              {AUTHORISED_PARTY_TYPE_LABELS[party.partyType]}
            </span>
            <span className="text-xs text-muted-foreground">On file</span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-4 border-t border-border py-2.5">
          <span className="text-sm font-medium text-foreground">Beneficial ownership</span>
          <span className="text-xs text-muted-foreground">
            {UBO_ON_FILE ? "On file" : "Not provided"}
          </span>
        </li>
      </ul>
    </section>
  );
}
