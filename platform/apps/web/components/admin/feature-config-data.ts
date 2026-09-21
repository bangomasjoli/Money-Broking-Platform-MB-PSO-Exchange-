/**
 * Feature flags / configuration data — UI Phase 2T (`UI-04` §55). The governed configuration and feature-flag model
 * as recorded in CFG-01, FND-01, WLT-01, IAM-01 and IAM-02 source at baseline `994c845`, for the read-only Feature Flags
 * / Configuration page.
 *
 * **These are seeded-state facts, not live readings.** No route lists a feature, licence profile, prohibited feature,
 * kill switch, policy or setting (CFG-01's specified `GET /cfg1/features`, `/licence-profiles` and
 * `/prohibited-features` are unbuilt; its only `GET`s are health and readiness). So the live database cannot be read
 * from a browser, and a change applied after the migrations would not appear here. The page says so in text and never
 * presents a value as a live measurement.
 *
 * **Every key below is a real identifier.** The 30 governance locks are the exact rows of CFG-01's reconciled
 * prohibited-feature registry (`services/cfg1/src/lib/doc00-baseline.ts`, seeded by migration 014); the three ordinary
 * features are the exact codes CLT-01's onboarding gate evaluates (`services/clt1/src/lib/cfg1-client.ts`); the three
 * capability switches are the exact environment keys read by their service config loaders. `label` is a UI-authored
 * human-readable name and the only authored field on a lock — the statement and reference are the registry's own
 * `prohibition_reason`, split at its trailing parenthetical and checked to rejoin byte-for-byte. Doc 00 §9.1/§9.2's
 * `feature_*` names are documentation identifiers, **not** implemented keys, and are deliberately not shown as flags.
 *
 * **DEFINED / DEFAULT / CONFIGURED / EFFECTIVE / LOCKED are five different things.** A registry entry is defined and
 * locked but has no default or configured value, because it is not a toggle; a referenced onboarding feature is not
 * even defined; a capability switch has a default but its configured and effective values are unreadable. Where the
 * source exposes no state, the page says so and infers none.
 *
 * Deliberately absent, each because it is sensitive or unreadable: every credential, token, key, endpoint and database
 * setting; integrity-seal and configuration hashes; numeric rate-limit thresholds and wallet limit amounts; the
 * environment values of any switch; and any change history (no route reads it).
 */

export const FEATURE_FLAGS_CONFIGURATION_HREF = "/admin/feature-flags-configuration";

// ---------------------------------------------------------------------------
// Governance locks — `cfg1.prohibited_feature`, migration 014: 30 rows, all `active`, sealed, `SELECT`-only to the runtime.
// ---------------------------------------------------------------------------

/** `applies_until`: `permanent`, or `until_formal_exchange_licence_approval` (five Exchange-pending codes only). */
export type LockDuration = "permanent" | "until_exchange_approval";

export const LOCK_DURATION_LABELS: Record<LockDuration, string> = {
  permanent: "Permanent",
  until_exchange_approval: "Until Exchange approval",
};

/** The decision-engine reason each lock yields — `exchange_pending_locked` for the five, `prohibited` for the rest. */
export const LOCK_DECISION_REASONS: Record<LockDuration, { label: string; code: string }> = {
  permanent: { label: "Prohibited feature", code: "prohibited" },
  until_exchange_approval: { label: "Exchange application pending", code: "exchange_pending_locked" },
};

export interface GovernanceLock {
  /** `feature_code` — the exact registry key. */
  key: string;
  /** UI-authored human-readable name. */
  label: string;
  lock: LockDuration;
  /** The registry's `prohibition_reason` before its trailing parenthetical. */
  statement: string;
  /** The parenthetical — the governing Doc 00 section and Master System Rule. */
  reference: string;
}

export const GOVERNANCE_LOCKS: GovernanceLock[] = [
  {
    key: "exchange.public_order_book",
    label: "Public order book",
    lock: "until_exchange_approval",
    statement: "Exchange application pending; AIX public order book locked",
    reference: "Doc00 §6",
  },
  {
    key: "exchange.matching_engine",
    label: "Internal matching engine",
    lock: "until_exchange_approval",
    statement: "Exchange application pending; internal matching engine locked",
    reference: "Doc00 §6",
  },
  {
    key: "exchange.client_to_client_matching",
    label: "Client-to-client matching",
    lock: "until_exchange_approval",
    statement: "Exchange application pending; client-to-client matching locked",
    reference: "Doc00 §6",
  },
  {
    key: "exchange.public_exchange_trading",
    label: "Public exchange trading",
    lock: "until_exchange_approval",
    statement: "Exchange application pending; public exchange trading locked",
    reference: "Doc00 §6",
  },
  {
    key: "exchange.public_market_depth",
    label: "AIX market depth as an exchange",
    lock: "until_exchange_approval",
    statement: "Exchange application pending; AIX market depth as exchange locked",
    reference: "Doc00 §6",
  },
  {
    key: "exchange.market_maker",
    label: "Market making",
    lock: "permanent",
    statement: "Market making blocked; not Money Broking MVP scope",
    reference: "Doc00 §8.1, MSR LIC-RULE-003",
  },
  {
    key: "exchange.principal_dealing",
    label: "Principal dealing",
    lock: "permanent",
    statement: "Principal dealing blocked; AIX acts as broker/intermediary only",
    reference: "Doc00 §4.1/§8.1, MSR LIC-RULE-003",
  },
  {
    key: "pricing.aix_spread_markup",
    label: "Spread markup",
    lock: "permanent",
    statement: "Revenue model is disclosed brokerage fee only; spread markup prohibited",
    reference: "Doc00 §4.2, MSR LIC-RULE-004",
  },
  {
    key: "onboarding.retail_default",
    label: "Retail onboarding",
    lock: "permanent",
    statement: "MVP client type scope is institutional/HNWI-professional only; retail onboarding disabled by default",
    reference: "Doc00 §10.2A, MSR CLT-RULE-001",
  },
  {
    key: "audit.bypass",
    label: "Audit bypass",
    lock: "permanent",
    statement: "Audit log must be append-only and tamper-evident; bypass prohibited",
    reference: "Doc00 §10.9, MSR SEC-RULE-002",
  },
  {
    key: "permission.bypass",
    label: "Permission bypass",
    lock: "permanent",
    statement: "Backend permission guard is the source of truth; bypass prohibited",
    reference: "MSR SYS-RULE-002",
  },
  {
    key: "kyc.bypass",
    label: "KYC bypass",
    lock: "permanent",
    statement: "KYC/KYB approval required before any transaction",
    reference: "MSR AML-RULE-001",
  },
  {
    key: "aml.bypass",
    label: "AML bypass",
    lock: "permanent",
    statement: "AML status must be checked before trade booking and withdrawal",
    reference: "Doc00 §10.3",
  },
  {
    key: "travel_rule.bypass",
    label: "Travel Rule bypass",
    lock: "permanent",
    statement: "Travel Rule enforcement required for digital asset transfers",
    reference: "MSR TR-RULE-001",
  },
  {
    key: "ledger.direct_edit",
    label: "Direct ledger edit",
    lock: "permanent",
    statement: "Direct ledger editing prohibited; double-entry ledger required",
    reference: "MSR LED-RULE-001",
  },
  {
    key: "balance.direct_edit",
    label: "Direct balance edit",
    lock: "permanent",
    statement: "Client balance must be derived from ledger; direct balance edit prohibited",
    reference: "MSR LED-RULE-002",
  },
  {
    key: "client_approval.bypass",
    label: "Client approval bypass",
    lock: "permanent",
    statement: "Client-side dual authorization required for sensitive actions",
    reference: "MSR CLT-RULE-003",
  },
  {
    key: "lp_settlement_approval.bypass",
    label: "LP settlement approval bypass",
    lock: "permanent",
    statement: "LP settlement payment requires maker-checker approval",
    reference: "MSR LP-RULE-004",
  },
  {
    key: "break_glass_logging.bypass",
    label: "Break-glass logging bypass",
    lock: "permanent",
    statement: "Break-glass access must be heightened-audit logged, never silent",
    reference: "MSR SEC-RULE-001",
  },
  {
    key: "securities.token_trading",
    label: "Securities token trading",
    lock: "permanent",
    statement: "Securities token trading requires separate approval; not approved for MB MVP",
    reference: "Doc00 §8.1, MSR ASSET-RULE-001",
  },
  {
    key: "advisory.investment_unlicensed",
    label: "Unlicensed investment advice",
    lock: "permanent",
    statement: "Investment advice requires separate licensing; not part of approved MB/PSO scope",
    reference: "Doc00 §1/§5",
  },
  {
    key: "custody.self_custody_wallet",
    label: "Self-custody wallet service",
    lock: "permanent",
    statement: "Self-custody wallet service prohibited; third-party custody model required",
    reference: "Doc00 §8.2",
  },
  {
    key: "credit.lending_borrowing",
    label: "Lending and borrowing",
    lock: "permanent",
    statement: "Lending or borrowing of client assets prohibited in MVP",
    reference: "Doc00 §8.1",
  },
  {
    key: "derivatives.trading",
    label: "Derivatives trading",
    lock: "permanent",
    statement: "Derivatives trading prohibited in MVP",
    reference: "Doc00 §8.1, MSR ASSET-RULE-001",
  },
  {
    key: "trading.margin_leverage",
    label: "Margin and leverage trading",
    lock: "permanent",
    statement: "Margin trading for digital assets prohibited in MVP",
    reference: "Doc00 §8.1",
  },
  {
    key: "product.staking",
    label: "Staking",
    lock: "permanent",
    statement: "Staking service prohibited in MVP",
    reference: "Doc00 §8.1",
  },
  {
    key: "product.yield_earn",
    label: "Yield and earn products",
    lock: "permanent",
    statement: "Yield/earn product prohibited in MVP",
    reference: "Doc00 §8.1",
  },
  {
    key: "pricing.internal_fallback",
    label: "Internal fallback pricing",
    lock: "permanent",
    statement: "No internal fallback pricing; LP outage must fail closed",
    reference: "Doc00 §7.4/§9.2, MSR LP-RULE-002",
  },
  {
    key: "inventory.internal_account",
    label: "Internal inventory position",
    lock: "permanent",
    statement: "AIX inventory limit is zero; no naked or internal inventory position",
    reference: "Doc00 §4.1/§4.3",
  },
  {
    key: "liquidity.synthetic",
    label: "Synthetic liquidity",
    lock: "permanent",
    statement: "Liquidity model is external-LP-backed only; no synthetic or internal liquidity",
    reference: "Doc00 §7.5",
  },
];

export function locksCountsLine(locks: GovernanceLock[]): string {
  const permanent = locks.filter((lock) => lock.lock === "permanent").length;
  const pending = locks.length - permanent;
  return `${permanent} permanent · ${pending} until Exchange approval`;
}

// ---------------------------------------------------------------------------
// Ordinary features — `cfg1.feature` is EMPTY (approved decision #5; migrations 014/015). The only ordinary feature keys
// in use are those CLT-01's onboarding gate evaluates, and they have no record, so the engine denies them (fail closed).
// ---------------------------------------------------------------------------

export interface ReferencedFeature {
  key: string;
  label: string;
  referencedBy: string;
}

export const REFERENCED_FEATURES: ReferencedFeature[] = [
  { key: "onboarding.institutional", label: "Institutional client onboarding", referencedBy: "CLT-01 onboarding gate" },
  { key: "onboarding.hnwi", label: "HNWI client onboarding", referencedBy: "CLT-01 onboarding gate" },
  { key: "onboarding.professional", label: "Professional client onboarding", referencedBy: "CLT-01 onboarding gate" },
];

/** `cfg1.feature` rows seeded — none, in any migration. */
export const SEEDED_FEATURE_RECORDS = 0;
/** `cfg1.kill_switch` rows seeded — none. */
export const SEEDED_KILL_SWITCHES = 0;

// ---------------------------------------------------------------------------
// Licence profiles — `cfg1.licence_profile`, migration 014: three rows from Doc 00 §3.
// ---------------------------------------------------------------------------

export interface LicenceProfile {
  code: "MB" | "PSO" | "EXCHANGE";
  name: string;
  status: "Approved" | "Pending";
  /** Doc 00 §3 "System Treatment". */
  treatment: string;
}

export const LICENCE_PROFILES: LicenceProfile[] = [
  { code: "MB", name: "Money Broking licence", status: "Approved", treatment: "Active build scope" },
  { code: "PSO", name: "Payment System Operator licence", status: "Approved", treatment: "Active build scope" },
  { code: "EXCHANGE", name: "Exchange application", status: "Pending", treatment: "Locked until approval" },
];

/** The layered locks that hold independently of the licence status, each verified in source. */
export const LAYERED_LOCKS: { term: string; meaning: string }[] = [
  {
    term: "Prohibited-feature registry",
    meaning:
      "Thirty governed entries in the database, checked first by every feature decision. The runtime role can only read them and no route can change or clear one.",
  },
  {
    term: "Change-request guard",
    meaning:
      "A feature change request is refused for any registry entry and for any key in the Exchange namespace, at the request step and again at the apply step.",
  },
  {
    term: "Startup route scan",
    meaning:
      "Every service checks its registered routes when it starts and refuses to run if one exposes an Exchange runtime surface, whatever the database holds.",
  },
  {
    term: "Integrity seal",
    meaning:
      "The licence records and the registry are hash-sealed and verified before every decision; a mismatch denies every decision. The seal detects changes and is not a signature.",
  },
];

/** True of the licence workflow, from `routes/licence-changes.ts` — stated on the page, not derived. */
export const LICENCE_STATUS_NOTE =
  "Changing a licence status does not enable any locked feature. The registry, the change-request guard and the startup route scan are separate locks. These records are seeded from the Doc 00 v1.3 baseline; no evidence reference is recorded, and no in-system evidence verification exists yet.";

// ---------------------------------------------------------------------------
// Configuration domains — each verified against its own source, with sensitive detail withheld.
// ---------------------------------------------------------------------------

export interface ConfigDomain {
  domain: string;
  owner: string;
  source: string;
  changePath: string;
  seeded: string;
}

export const CONFIG_DOMAINS: ConfigDomain[] = [
  {
    domain: "Licence profile",
    owner: "CFG-01",
    source: "Database, sealed",
    changePath: "Governed change request, bound to an IAM-02 approval",
    seeded: "3 records: two approved, one pending",
  },
  {
    domain: "Prohibited-feature registry",
    owner: "CFG-01",
    source: "Database, sealed; read-only to the runtime",
    changePath: "None — no route can change it",
    seeded: `${GOVERNANCE_LOCKS.length} entries`,
  },
  {
    domain: "Feature registry",
    owner: "CFG-01",
    source: "Database, sealed",
    changePath: "Governed change request, bound to an IAM-02 approval",
    seeded: "None seeded",
  },
  {
    domain: "Kill switches",
    owner: "CFG-01",
    source: "Database",
    changePath: "Activation is one permission-gated step; deactivation is a request, then an approval",
    seeded: "None seeded",
  },
  {
    domain: "Rate-limit policy",
    owner: "FND-01",
    source: "Database, set by governance",
    changePath: "Governance migration only — the runtime cannot write it",
    seeded: "4 WLT-01 policies; limits withheld",
  },
  {
    domain: "Wallet limit policy",
    owner: "WLT-01",
    source: "Database, versioned",
    changePath: "Controlled schema-owner provisioning; no route",
    seeded: "None seeded; thresholds withheld",
  },
  {
    domain: "Capability switches",
    owner: "IAM-01, IAM-02, WLT-01",
    source: "Environment",
    changePath: "Deployment change, read when the service starts",
    seeded: "3 switches, all off by default",
  },
  {
    domain: "Service settings",
    owner: "Every module",
    source: "Environment",
    changePath: "Deployment change",
    seeded: "Not listed — includes credentials, keys and endpoints",
  },
  {
    domain: "Code guards",
    owner: "FND-01, CFG-01",
    source: "Code",
    changePath: "Code change and release",
    seeded: "Startup route scan; Doc 00 v1.3 baseline",
  },
];

export interface CapabilitySwitch {
  /** The exact environment key. */
  key: string;
  label: string;
  owner: string;
  effect: string;
  note: string;
}

/**
 * The three dangerous-capability switches, each default off and enabled only by the exact string "true". Their
 * configured and effective values are environment values that no route reads, so neither is shown.
 */
export const CAPABILITY_SWITCHES: CapabilitySwitch[] = [
  {
    key: "WLT1_PUBLIC_SURFACE_ENABLED",
    label: "Public wallet surface",
    owner: "WLT-01 · DEC-010",
    effect:
      "When off, the six public wallet routes are not registered at all. When on, a separate perimeter credential is required on every public request.",
    note: "This controls exposure, not authorization: enabling it grants no permission and does not make the surface production-ready. Internet exposure remains prohibited under the open findings register.",
  },
  {
    key: "IAM_BOOTSTRAP_ENABLED",
    label: "First-admin bootstrap",
    owner: "IAM-01",
    effect: "When on, creates one interim admin identity at startup, and only if no identity exists.",
    note: "A one-time capability. The identity it creates holds no role or permission.",
  },
  {
    key: "IAM2_BOOTSTRAP_TRANSITION_ENABLED",
    label: "First role-assignment transition",
    owner: "IAM-02",
    effect: "When on, allows one first Security Admin or Tech Admin assignment for one pre-configured identity.",
    note: "A one-time capability, sealed to a single identity.",
  },
];

// ---------------------------------------------------------------------------
// Change control and boundary statements.
// ---------------------------------------------------------------------------

export const AUTHORITY_STATEMENTS: { term: string; meaning: string }[] = [
  {
    term: "Availability, not authority",
    meaning:
      "A feature flag decides whether a capability is available. It does not decide who may use it: an enabled feature is not an authorized user, and visible navigation is not a permission grant.",
  },
  {
    term: "Locks outrank flags",
    meaning:
      "The integrity check runs first, then the prohibited registry, then any active kill switch, then the feature's own state. An unknown feature is denied.",
  },
  {
    term: "Hidden UI is not security",
    meaning: "The backend guard is the source of truth. Hiding or showing a feature in a page changes nothing about what is allowed.",
  },
  {
    term: "Production readiness",
    meaning: "Enabling a switch or feature is one gate among several. It does not by itself make anything production-ready.",
  },
];

export const CHANGE_CONTROL: { term: string; meaning: string }[] = [
  {
    term: "Feature state",
    meaning:
      "Two steps: a change request, then an apply that needs a decision token from an approved IAM-02 request bound to the requester and the exact change. Only enabled and disabled are reachable. Registry entries and any Exchange-namespace key are refused at both steps.",
  },
  {
    term: "Licence profile status",
    meaning:
      "The same two steps. Activation is flagged for step-up in the permission catalogue. Changing a licence status does not enable any locked feature.",
  },
  {
    term: "Kill switch",
    meaning: "Activation is a single permission-gated step. Deactivation is a request followed by an approval. A kill switch applies to one feature.",
  },
  {
    term: "Under the seeded IAM state",
    meaning:
      "No role holds any permission grant, so no feature, licence-profile or kill-switch change can be started: each starting step needs a permission that no role holds.",
  },
  {
    term: "Configuration history",
    meaning:
      "Change requests, applied versions and version snapshots are recorded in the database, but no route lists or returns them, so no history is shown. Audit belongs to Audit / Sensitive Access.",
  },
  {
    term: "Never shown",
    meaning:
      "Credentials, tokens, keys, endpoints, connection settings, integrity hashes, numeric security thresholds and environment values.",
  },
];

export interface ConfigFinding {
  id: string;
  title: string;
  severity: "HIGH" | "MEDIUM";
  status: "OPEN";
  relevance: string;
}

export const CONFIG_FINDINGS: ConfigFinding[] = [
  {
    id: "IAM2-FIND-002",
    title: "Approver authorization enforcement gap",
    severity: "HIGH",
    status: "OPEN",
    relevance:
      "The approval that binds a configuration change checks no role or permission for the approver, so approver authorization is not a current guarantee of this control.",
  },
  {
    id: "IAM2-FIND-003",
    title: "Approval policy configuration gap",
    severity: "MEDIUM",
    status: "OPEN",
    relevance:
      "No approval policy is seeded, so each approval takes the defaults — one approval, no step-up, 24-hour expiry. Dual approval and step-up are not current guarantees.",
  },
];

export function availabilityLine(): string {
  const approved = LICENCE_PROFILES.filter((profile) => profile.status === "Approved").length;
  const pending = LICENCE_PROFILES.length - approved;
  return [
    `${SEEDED_FEATURE_RECORDS} ordinary feature records seeded`,
    `${GOVERNANCE_LOCKS.length} governance locks`,
    `${LICENCE_PROFILES.length} licence profiles (${approved} approved, ${pending} pending)`,
    `${SEEDED_KILL_SWITCHES} kill switches seeded`,
    `${CAPABILITY_SWITCHES.length} capability switches, all off by default`,
  ].join(" · ");
}
