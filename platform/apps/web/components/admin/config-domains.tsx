import { CAPABILITY_SWITCHES, CONFIG_DOMAINS, type ConfigDomain } from "@/components/admin/feature-config-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Configuration Domains — UI Phase 2T (`UI-04` §55.5). The configuration domains that actually exist, each with its
 * owner, **source class** (database, environment or code), how it changes, and what is seeded — and the three
 * capability switches by their exact keys.
 *
 * **Nine domains, every one verified in source and none invented.** CFG-01 owns four database domains (licence
 * profile, prohibited-feature registry, feature registry, kill switches). FND-01's rate-limit policy and WLT-01's
 * wallet limit policy are database-held numeric policy, changed only by a governance migration or schema-owner
 * provisioning — the runtime role cannot write either. Capability switches and service settings are read from the
 * **environment** when a service starts, and are labelled as such: an environment-derived setting is never presented
 * as a database-managed one. The guards are **code**. Source is a column so the difference is visible at a glance.
 *
 * **Sensitive configuration is omitted, not masked.** No credential, token, key, endpoint or connection setting is
 * named, and "Service settings" says only that they exist and are not listed. Numeric rate-limit thresholds and wallet
 * limit amounts are withheld too: security-control parameters and amount thresholds are the kind of operational
 * configuration the brief keeps hidden. No raw JSON, no free-form key/value browser.
 *
 * **Capability switches** are the three default-off, enabled-only-by-exact-"true" environment keys. Their configured and
 * effective values are environment values that no route reads, so the page shows the default and says the others are
 * not readable — it does not guess. The public-surface switch controls exposure, not authorization, and enabling it is
 * not production readiness. Below `lg:` the domain table becomes stacked blocks. A Server Component with no
 * interactive element.
 */

export function ConfigDomains() {
  return (
    <section aria-labelledby="ffc-domains-heading" className="border-t border-border pt-8">
      <h2 id="ffc-domains-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Configuration Domains
      </h2>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        Each domain shows where its values live and how they change. Environment-derived settings are not database
        settings, and sensitive configuration is not shown.
      </p>

      <div className="mt-4 hidden lg:block">
        <Table aria-label="Configuration domains">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Domain</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>How it changes</TableHead>
              <TableHead>Seeded</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {CONFIG_DOMAINS.map((row) => (
              <TableRow key={row.domain} className="hover:bg-transparent">
                <TableHead scope="row" className="h-auto py-3 align-top text-sm whitespace-normal">
                  {row.domain}
                </TableHead>
                <TableCell className="py-3 align-top text-xs whitespace-normal text-muted-foreground">{row.owner}</TableCell>
                <TableCell className="py-3 align-top text-xs whitespace-normal text-foreground">{row.source}</TableCell>
                <TableCell className="py-3 align-top text-xs whitespace-normal text-muted-foreground">{row.changePath}</TableCell>
                <TableCell className="py-3 align-top text-xs whitespace-normal text-muted-foreground">{row.seeded}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul aria-label="Configuration domains" className="mt-4 flex flex-col lg:hidden">
        {CONFIG_DOMAINS.map((row) => (
          <li key={row.domain} className="border-t border-border py-4 first:border-t-0 first:pt-0">
            <DomainBlock row={row} />
          </li>
        ))}
      </ul>

      <h3 className="mt-8 text-sm font-semibold text-foreground">Capability switches</h3>
      <p className="mt-2 max-w-prose text-xs text-muted-foreground">
        Three environment switches gate one-time or exposure capabilities. Each is off by default and is enabled only by the
        exact value &quot;true&quot;. Their configured and effective values are environment values that no route reads, so
        they are not shown.
      </p>
      <ul aria-label="Capability switches" className="mt-3 flex flex-col">
        {CAPABILITY_SWITCHES.map((item) => (
          <li key={item.key} className="border-t border-border py-4 first:border-t-0 first:pt-0">
            <h4 className="text-sm font-medium text-foreground">{item.label}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <code>{item.key}</code> · {item.owner}
            </p>
            <p className="mt-2 max-w-prose text-xs text-muted-foreground">{item.effect}</p>
            <dl className="mt-2 grid max-w-prose grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">Default</dt>
              <dd className="text-foreground">Default Off</dd>
              <dt className="text-muted-foreground">Configured value</dt>
              <dd className="text-foreground">Not readable</dd>
              <dt className="text-muted-foreground">Effective value</dt>
              <dd className="text-foreground">Not readable</dd>
              <dt className="text-muted-foreground">Locked</dt>
              <dd className="text-foreground">No — set by the deployment</dd>
            </dl>
            <p className="mt-2 max-w-prose text-xs text-muted-foreground">{item.note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DomainBlock({ row }: { row: ConfigDomain }) {
  return (
    <>
      <h4 className="text-sm font-medium text-foreground">{row.domain}</h4>
      <p className="mt-0.5 text-xs text-muted-foreground">{row.owner}</p>
      <dl className="mt-2 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">Source</dt>
        <dd className="text-foreground">{row.source}</dd>
        <dt className="text-muted-foreground">How it changes</dt>
        <dd className="text-muted-foreground">{row.changePath}</dd>
        <dt className="text-muted-foreground">Seeded</dt>
        <dd className="text-muted-foreground">{row.seeded}</dd>
      </dl>
    </>
  );
}
