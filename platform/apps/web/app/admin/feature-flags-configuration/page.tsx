import { ConfigControlBoundary } from "@/components/admin/config-control-boundary";
import { ConfigDomains } from "@/components/admin/config-domains";
import { FeatureAvailability } from "@/components/admin/feature-availability";
import { GovernanceLocksSection } from "@/components/admin/governance-locks-section";
import { DemoDisclosure } from "@/components/shell/demo-disclosure";
import { PageHeader } from "@/components/shell/page-header";

/**
 * Admin/Compliance Portal — Feature Flags / Configuration. UI Phase 2T. `B`-classified (`UI-04` §9/§55.2): `CFG-01`
 * genuinely owns the licence-profile, prohibited-feature, feature-registry and kill-switch model, and FND-01, WLT-01,
 * IAM-01 and IAM-02 own the other configuration domains shown — but every route is `requireInternal`-guarded and **no
 * route lists or reads a feature, licence profile, lock, kill switch or setting** (CFG-01's only `GET`s are health and
 * readiness). Nothing here is callable from an admin browser session. Hence the demo disclosure, and no fetch, server
 * action, auth, permission check or mutation.
 *
 * **A read-only view of the governed configuration model, not a feature-toggle console.** No Enable, Disable, Change
 * value, Override or Save control, no switch (not even a disabled one — a disabled switch still implies an editable
 * control model), no input, no JSON editor, no link. It is not a secret or environment editor, an approval-policy
 * editor or a licence-bypass surface: **feature flags control availability, not authority**, and **no flag can widen
 * the licence scope** — the prohibited registry, the change-request guard and the startup route scan hold whatever a
 * feature or licence record says.
 *
 * **Four sections, in the brief's order** (`UI-04` §55.3). Feature Availability carries the state vocabulary and the
 * decisive finding — no ordinary feature flag is defined; Configuration Domains states each domain's source class and
 * change path, keeping environment-derived settings distinct from database ones and sensitive configuration out; Licence
 * / Governance Locks is the only List + Detail workspace, over the thirty locked registry entries, because thirty
 * keyed, explained entries are the one place a list and a detail panel earn their place; and the Configuration Control
 * Boundary states change control and the `IAM2-FIND-002`/`003` boundaries without overclaiming either.
 *
 * Consistent with `UI Phase 2S` (configuration is not authorization; visible navigation is not a permission grant) and
 * `UI Phase 2R`. Audit / Sensitive Access is a separate future Admin page and is not absorbed — no audit history is shown.
 */
export default function FeatureFlagsConfigurationPage() {
  return (
    <div>
      <PageHeader
        title="Feature Flags / Configuration"
        description="Review governed feature availability and configuration boundaries across AIX modules."
      />
      <DemoDisclosure>
        Interface preview — configuration records are demonstrative until the required Admin-safe configuration
        projections and governed change controls are integrated.
      </DemoDisclosure>

      <div className="flex flex-col gap-8">
        <FeatureAvailability />
        <ConfigDomains />
        <GovernanceLocksSection />
        <ConfigControlBoundary />
      </div>
    </div>
  );
}
