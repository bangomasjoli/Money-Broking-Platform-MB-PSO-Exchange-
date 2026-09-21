---
document_id: STR-03
title: AIX Capability Lock Review — Build-Unlocked / Production-Gated Re-Baseline
version: v0.1
document_status: DRAFT
implementation_status: N/A
module: N/A
control: Repository-wide lock classification and migration requirement register
owner: Unassigned
effective_date: 2026-09-22
last_reviewed: 2026-09-22
supersedes: none
baseline_commit: b62ed89
---

# AIX Capability Lock Review
# Build-Unlocked / Production-Gated Re-Baseline

> ## DRAFT — ANALYSIS ONLY. NO AUTHORITY OVER ANY MASTER DOCUMENT.
>
> This review **classifies existing locks**. It changes none of them. It authorises no code
> change, no migration, no seeded-identifier change and no runtime-guard change.
>
> Its conclusions become binding only where they graduate into `DECISION_LOG.md` (they do, as
> `DEC-013`) or into an approved master version.
>
> **Scope:** every lock in this repository relevant to Exchange, securities, security-token
> trading, matching engines, client-to-client matching, order books, RWA, Pay, LP/venue
> management and feature activation — in documentation, governance records, seeded
> configuration, migrations and runtime guards.

---

## 0. Why this review exists

The owner has issued a platform-development principle:

> **Unresolved regulation blocks production activation, not software development.**

The repository's existing locks were drafted before that principle existed. They were written
against a single implicit question — *"may AIX do this?"* — and answer it with a single implicit
state, *locked*. That state conflates at least five independent facts:

1. whether the capability has been **architected**;
2. whether it has been **implemented**;
3. whether it is **available in a given environment**;
4. whether it is **permitted to operate in production** under AIX's regulatory position;
5. whether a **specific product, asset, client or counterparty** is eligible for it.

Where those five collapse into one boolean, a regulatory uncertainty about (4) silently blocks
(1) and (2). That is the defect this review identifies and classifies.

**It is not a defect everywhere.** Some locks are permanent product boundaries and some are
scope prohibitions; for those, collapsing the states is harmless because every state is
"never". This review's whole purpose is to tell the two apart without weakening either.

---

## 1. Classification scheme

Every lock below is classified into exactly one class. The classes are the owner's.

| Class | Name | Meaning | Action |
|---|---|---|---|
| **A** | **DEVELOPMENT BLOCKER — MUST CHANGE** | Prevents building, specifying, testing or UAT of a confirmed target capability | Re-scope through governed versioning so it gates production, not development |
| **B** | **PRODUCTION ACTIVATION GATE — KEEP** | Correctly prevents live activation before a regulatory or governance condition | Keep, unchanged, and restate as production-scoped |
| **C** | **MB SPOT PERMANENT BOUNDARY — KEEP** | Internal client matching, principal dealing, proprietary market making in the Money Broking product | Keep. Permanent in **every** environment, including development |
| **D** | **PRODUCT-SCOPE PROHIBITION — KEEP** | Derivatives, futures, margin, leverage, lending, staking, yield, privacy coins, algorithmic stablecoins, MYR pairs | Keep. Out of scope; no development effort |
| **E** | **COMPATIBILITY IDENTIFIER — KEEP NAME** | Name is stale but renaming breaks governance, integrity seals or acceptance evidence | Keep the name. Document the compatibility meaning |
| **F** | **REQUIRES CONTROLLED CODE MIGRATION** | Implementation blocks development or carries the wrong semantics | Specify the migration. Do not perform it in this task |

**A lock may appear twice** — once as class A for its build-state effect and once as class B for
its production effect. Where that happens it is stated explicitly. That duplication is the
point: the single lock is being split into two.

---

## 2. Documentation and governance locks

### 2.1 Doc 00 v1.4 — Licence Scope and Feature Lock

| # | Lock | Location | Class | Finding |
|---|---|---|---|---|
| L-01 | AIX internal matching engine (digital currency) — STANDING | §6, §7.7 | **C** | Correct as drafted. Permanent in every environment |
| L-02 | Client-to-client matching (digital currency) — STANDING | §6, §7.7 | **C** | Correct as drafted |
| L-03 | AIX-operated central order book for MB Spot — STANDING | §6, §7.7 | **C** | Correct as drafted |
| L-04 | Market maker engine — STANDING | §6, §7.7 | **C** | Correct as drafted |
| L-05 | Principal dealing engine — STANDING | §6, §7.7 | **C** | Correct as drafted |
| L-06 | AIX providing its own principal liquidity — STANDING | §6, §7.7 | **C** | Correct as drafted |
| L-07 | Presenting AIX as operating a public digital-currency exchange — STANDING | §6, §2A rule 1 | **C** | Conduct/terminology boundary. Correct as drafted |
| L-08 | Public market API for an AIX-operated market — STANDING | §6 | **C** | Follows from L-01/L-03 |
| L-09 | **Securities / financial-instrument Exchange capability — "Locked / PENDING APPROVAL"** | §6, §12C | **A + B** | **A:** as drafted, a single "Locked" state with no build dimension; §20.5 records the architecture as `NOT DESIGNED`, which forbids design. **B:** the production-activation half is correct and is kept |
| L-10 | **Security-token secondary market — "Locked / PENDING APPROVAL"** | §6, §12B.2 | **A + B** | Same split as L-09 |
| L-11 | Stop, Stop-Limit, IOC, FOK, GTC order types — SEPARATELY GOVERNED | §6, §11B | **B** | Already correctly framed as product-rule review, not a licence lock. Keep; add that implementation behind a product/configuration gate is permitted |
| L-12 | §8.1 derivatives, futures, margin, leverage, lending, staking, yield | §8.1 | **D** | Keep. Reaffirmed out of scope by the owner decision |
| L-13 | §8.1 privacy coins, algorithmic stablecoins, MYR pairs | §8.1 | **D** | Keep |
| L-14 | §8.2 self-custody prohibited / third-party custody required | §8.2 | **B/D** | Keep. Constrains RWA token custody design (`R4-Q5`) |
| L-15 | §9.2 `feature_securities_token = disabled` | §9.2 | **A + B** | **A:** as a documentation flag it currently reads as "not built". **B:** production disabled is correct |
| L-16 | §9.2 `feature_exchange_orderbook`, `feature_matching_engine`, `feature_market_depth_as_aix_exchange`, `feature_public_exchange_trading`, `feature_public_market_api`, `feature_client_to_client_matching` | §9.2 | **C + E** | Keep names, keep locks. §9A already records these as MB-boundary standing prohibitions |
| L-17 | §9.2 `feature_market_making`, `feature_proprietary_trading`, `feature_aix_spread_markup`, `feature_internal_fallback_pricing`, `feature_executable_price_target_request` | §9.2 | **C** | Keep |
| L-18 | §9.3 rules 11–13 — default disabled, unknown fails closed, default deny | §9.3 | **B** | Keep. This is the fail-closed spine and must survive the re-baseline verbatim |
| L-19 | §12A asset classification gate — UNRESOLVED fails closed | §12A | **B** | Keep. Must be restated as *production* fail-closed so synthetic/test assets can exist in non-production |
| L-20 | §12B.2 RWA security-token route LOCKED; non-security route "not activated" | §12B.2 | **A + B** | **A:** blocks building the RWA lifecycle software. **B:** production activation gate is correct |
| L-21 | §12D AIX Pay beyond §5.2 baseline = `PENDING / FEATURE-LOCKED` | §12D | **A + B** | **A:** §20.3 records the architecture as `PLANNED`, and the section says capabilities "may be designed" — but nothing authorises implementation and testing. **B:** PSO-scope verification gate is correct |
| L-22 | §20.4 security-token issuance / secondary market — Architectural `NOT DESIGNED` | §20.4 | **A** | A capability matrix that records `NOT DESIGNED` as a *status* forbids designing it |
| L-23 | §20.5 any securities listing / trading capability — Architectural `NOT DESIGNED` | §20.5 | **A** | As L-22. This single cell is the largest single development blocker in the repository |
| L-24 | §21 thirteen activation conditions, fail-closed | §21 | **B** | Keep in full. Must be restated as the **production** activation gate and extended with an environment dimension |
| L-25 | §23 unresolved regulatory questions hold capability disabled "regardless of architectural readiness" | §23, §21 rule 3 | **A + B** | **A:** "regardless of architectural readiness" is the exact sentence that blocks development. **B:** holding *production* disabled is correct and is kept |
| L-26 | §25.3 route guard / seeded identifiers / sealed baseline — "no action" | §25.3 | **E + F** | Keep names; the migrations are specified in §4 below |

### 2.2 Project Charter v1.4

| # | Lock | Location | Class | Finding |
|---|---|---|---|---|
| L-27 | §6.3 "Exchange Locked Scope" items 1–8 | §6.3 | **C** | Items 1–8 are MB-boundary prohibitions. Keep |
| L-28 | §6.3 items 9–10 resting limit / stop-limit / GTC / post-only / maker-taker | §6.3 | **A** | **Stale.** Doc 00 v1.4 §6 already reclassified order types out of the exchange-behaviour lock into §11B product-rule review. The Charter was not updated |
| L-29 | §10.2 Out of Scope items 1–8 (order book, matching, public market depth/trading/API, client-to-client, market maker, proprietary trading) | §10.2 | **C** | Keep |
| L-30 | §10.2 item 9 "Securities token trading" | §10.2 | **A + B** | Build unlocked / production gated |
| L-31 | §10.2 items 10–18 derivatives, margin, lending, staking, yield, self-custody, privacy coins, algo stablecoins, MYR | §10.2 | **D** | Keep |
| L-32 | §10.2 item 19 retail onboarding | §10.2 | **B** | Keep — client-scope lock, unchanged |
| L-33 | §10.2 items 20–23 resting public exchange orders, executable price target, click-to-trade depth ladder, maker/taker fee model | §10.2 | **B + C** | Click-to-trade remains `R3-Q2b`; maker/taker is MB-boundary. Keep, restated as production gates |
| L-34 | §12.6 "Locked Future Modules" item 5 — **Market Surveillance** | §12.6 | **A** | **Stale and contradictory.** Master Module Index v1.3 §13 creates `SUR-01` Market Surveillance & Trading Risk as a NEW module; LFSA-DMB-2025 ¶6.4(i) *requires* suspicious-order detection. Surveillance is a required control, not a locked future module |
| L-35 | §26.1 Environment Matrix — `development / test / staging / production` | §26.1 | **A** | No UAT and no DEMO environment exists in the Charter. The owner's environment model requires five |

### 2.3 Master Module Index v1.3

| # | Lock | Location | Class | Finding |
|---|---|---|---|---|
| L-36 | §17 "AIX-operated order book / internal matching / matching engine for MB Spot / market making / principal liquidity" — STANDING PROHIBITION | §17 | **C** | Keep verbatim |
| L-37 | §13 "No internal matching module exists, and none may be created" | §13 | **C** | Keep — but must be re-scoped to say *for MB Spot*, because a securities Exchange matching engine is now a target capability in a different domain |
| L-38 | §17 "Securities / financial-instrument Exchange capability — LOCKED pending approval" | §17 | **A + B** | Build unlocked / production gated |
| L-39 | §17 "Security-token secondary market — LOCKED" | §17 | **A + B** | Build unlocked / production gated |
| L-40 | §17 derivatives, margin, futures, lending, staking, yield; privacy coins, algorithmic stablecoins, MYR pairs | §17 | **D** | Keep |
| L-41 | **Absence of any Exchange-domain module** | §6–§16 | **A** | The 33-module set contains no owner for instrument admission, a central order book, a matching engine, Exchange market operations or Exchange clearing/settlement interfacing. `OMS-01`/`MKD-01`/`LQD-01`/`EXE-01`/`TRD-01`/`SUR-01` are the **MB Spot external-routing** architecture and must not absorb a venue matching capability |

### 2.4 SRS v1.2, Role & Permission Matrix v1.2, Workflow Map v1.2, Master System Rules v1.2

| # | Lock | Location | Class | Finding |
|---|---|---|---|---|
| L-42 | SRS §19 "Future-Locked Exchange Requirements" | SRS §19 | **A** | The securities Exchange has no requirements at all. A "future-locked" placeholder section cannot be implemented, tested or UAT'd |
| L-43 | Role Matrix §22 "Future-Locked Exchange Permission Matrix" | Role Matrix §22 | **A + F** | No Exchange roles exist. Permissions must also be re-stated so that holding one never implies production activation |
| L-44 | Workflow Map §33 "WF-29 Future-Locked Exchange Workflow" | Workflow §33 | **A** | No Exchange workflow exists to build against |
| L-45 | **MSR `LIC-RULE-002` Exchange Scope Lock, rule 1** — "No active route may call these modules" | MSR §6 | **A + F** | Unconditional, environment-blind. This is the documentation twin of `assertNoExchangeRuntime` and blocks the Exchange product in development exactly as in production |
| L-46 | MSR `LIC-RULE-002` locked list items "Resting Limit Orders / Stop-Limit / GTC / Post-Only / IOC / FOK" | MSR §6 | **A** | **Stale** — superseded by Doc 00 v1.4 §11B, same defect as L-28 |
| L-47 | MSR `LIC-RULE-002` rules 2–6 | MSR §6 | **B** | Keep. Rule 5 ("no test/staging feature flag may leak to production") becomes *more* important under a five-environment model, not less |
| L-48 | MSR `LIC-RULE-003` Principal Dealing Block | MSR §6 | **C** | Keep verbatim |
| L-49 | MSR `LIC-RULE-004` Disclosed Brokerage Fee Only | MSR §6 | **B/C** | Keep. Pay and RWA fee models remain unresolved (`R5-Q2`) |
| L-50 | MSR `ASSET-RULE-001` item 4 "Securities tokens unless separately approved" | MSR §6 | **A + B** | Build unlocked with synthetic instruments / production gated |
| L-51 | MSR `ASSET-RULE-001` items 1–3, 5–10 | MSR §6 | **D** | Keep |
| L-52 | MSR `ASSET-RULE-001` rule 6 "Admin and Super Admin cannot override prohibited asset categories" | MSR §6 | **C/D** | Keep verbatim |
| L-53 | MSR `CFG-RULE-001` feature flag default disabled | MSR §7 | **B** | Keep |
| L-54 | MSR `SYS-RULE-003` Fail Closed | MSR §5 | **B** | Keep. The spine of the whole model |

---

## 3. Code, configuration and runtime locks

**No item in this section is changed by this review or by `DEC-013`.** Each produces a migration
requirement in §4.

| # | Lock | Location | Class | Finding |
|---|---|---|---|---|
| L-55 | **`assertNoExchangeRuntime` / `PROHIBITED_EXCHANGE_FRAGMENTS`** | `platform/packages/foundation/src/no-exchange.ts` | **E + F** | Path-string boot guard over registered route paths. Blocks any path containing `exchange`, `order-book`, `orderbook`, `matching-engine`, `matching_engine`, `client-to-client`, `market-maker`, `market_maker`, `market-making`, `principal-dealing`, `principal_dealing`, `spread-markup`, `spread_markup`, `maker-taker`, `maker_taker`. It is **environment-blind and domain-blind**: it would refuse to boot a securities Exchange service in local development. See §5 |
| L-56 | Boot-guard call sites — `services/{sec1,kyc1,iam2,aml1,clt1,cfg1,...}/src/server.ts` | 6+ services | **C** | **Correct and must stay unconditional for these services.** Every current service is an MB/PSO-domain service. The migration must not weaken them |
| L-57 | CFG-01 `isFeatureMutationBlocked` — structural `exchange.` prefix block | `services/cfg1/src/lib/decision.ts:131` | **F** | Blocks *any* feature code beginning `exchange.` from ever being mutated, in every environment, regardless of registry content. Defence-in-depth by design |
| L-58 | CFG-01 seeded prohibited-feature registry — 30 codes | `infra/migrations/014_cfg1_core.cjs`, `015_cfg1_decision_engine.cjs`, `services/cfg1/src/lib/doc00-baseline.ts` | **E + F** | Byte-identical triplicate, bound into a sealed integrity hash and asserted by a `length !== 30` migration invariant. **No code may be added or removed without a reseal** |
| L-59 | `exchange.public_order_book`, `exchange.matching_engine`, `exchange.client_to_client_matching`, `exchange.public_exchange_trading`, `exchange.public_market_depth` — `applies_until: "until_formal_exchange_licence_approval"` | migrations 014/015, `doc00-baseline.ts` | **C + F** | **Defect found, in the direction of being too weak.** Doc 00 v1.4 §6 reclassified all five as **STANDING** MB-boundary prohibitions that Exchange approval does **not** lift. The seeded data still says an Exchange licence approval lifts them. Under the new model that is now materially misleading |
| L-60 | `exchange.market_maker`, `exchange.principal_dealing` — `applies_until: "permanent"` | migrations 014/015 | **C + E** | Correct as seeded. Keep |
| L-61 | **`securities.token_trading` — `applies_until: "permanent"`** | migrations 014/015, `doc00-baseline.ts` | **E + F** | See §6 |
| L-62 | `pricing.aix_spread_markup`, `pricing.internal_fallback`, `inventory.internal_account`, `liquidity.synthetic` | migrations 014/015 | **C** | Keep. MB-boundary, permanent |
| L-63 | `derivatives.trading`, `trading.margin_leverage`, `credit.lending_borrowing`, `product.staking`, `product.yield_earn` | migrations 014/015 | **D** | Keep |
| L-64 | `audit.bypass`, `permission.bypass`, `kyc.bypass`, `aml.bypass`, `travel_rule.bypass`, `ledger.direct_edit`, `balance.direct_edit`, `client_approval.bypass`, `lp_settlement_approval.bypass`, `break_glass_logging.bypass` | migrations 014/015 | **B** | Control-bypass prohibitions. Keep permanently, in **every** environment |
| L-65 | `custody.self_custody_wallet`, `onboarding.retail_default`, `advisory.investment_unlicensed` | migrations 014/015 | **B/D** | Keep |
| L-66 | IAM-02 seeded `exchange.*` permission rows (7) with `licence_locked = true, prohibited = true` | `infra/migrations/006_iam2_core.cjs:352–358` | **C + E + F** | Six of seven are MB-boundary permanent (class C). The rows are *catalogue data*, not a runtime surface — the migration comment says so explicitly. The migration requirement is only that a future securities Exchange must not reuse this namespace |
| L-67 | CFG-01 decision reason code `exchange_pending_locked` | `services/cfg1/src/lib/decision.ts:46` | **E** | Keep the name. Its meaning narrows to the MB-boundary prohibition |
| L-68 | **CFG-01 decision chain steps 4, 5, 7 — "STRUCTURALLY N/A: `cfg1.feature` has no `environment_scope` column at all"** | `services/cfg1/src/lib/decision.ts:10–21` | **F** | The environment dimension the owner's model requires **does not exist in the schema**. `EvaluateFeatureInput.environment` is accepted, bound into the decision payload hash and written to the decision log, but is **never evaluated**. This is the single most important code gap for the new model |
| L-69 | `Environment` type — `["dev", "qa", "uat", "staging", "prod"]` | `packages/foundation/src/config.ts:10` | **F** | Has `uat` but **no `demo`**, and carries both `qa` and `staging`. Needs a governed mapping onto the five canonical environments |
| L-70 | `EXCHANGE_MODULE_LOCKED` error code | MSR §6/§26, Workflow §37, Data Flow, Testing Strategy | **E** | Keep. Cited across masters and test names |
| L-71 | CFG-01 kill switch (`cfg1.kill_switch`, migration 018) | `services/cfg1/src/lib/kill-switch.ts` | **B** | Keep. An independent, unsealed, immediate-effect deny path — valuable under the new model as the emergency production control |
| L-72 | CFG-01 vendored `DOC00_SOURCE_VERSION = "v1.3"` and the sealed baseline hash | `services/cfg1/src/lib/doc00-baseline.ts` | **F** | Already a recorded deferred code requirement (Doc 00 v1.4 §25.3). The version label is now two versions stale |

---

## 4. Migration requirement register

**None of these is performed in this task.** Each is a future controlled implementation task
requiring its own approved task record. Identifiers are stable and are cited by `DEC-013`.

| ID | Migration | Source locks | Blocking? |
|---|---|---|---|
| **MIG-001** | `assertNoExchangeRuntime` → domain- and environment-aware boundary guard (§5) | L-55, L-56, L-45 | **Blocks AIX Exchange implementation.** Not blocking for SRS/architecture work |
| **MIG-002** | CFG-01 `exchange.` prefix mutation block → keep unconditional; add an explicit Exchange capability namespace that does **not** collide with it (§7) | L-57 | Blocks Exchange capability control |
| **MIG-003** | `securities.token_trading` semantics — `applies_until` `permanent` → production-activation-gated (§6) | L-61, L-58 | Blocks RWA security-token UAT |
| **MIG-004** | CFG-01 `cfg1.feature.environment_scope` — add the column, populate it, and make decision-chain step 4 live | L-68 | **Blocks the entire capability-state model in code** |
| **MIG-005** | Foundation `Environment` type → canonical five-environment model with `demo` (§8) | L-69, L-35 | Blocks MIG-004 |
| **MIG-006** | `exchange.public_order_book` / `matching_engine` / `client_to_client_matching` / `public_exchange_trading` / `public_market_depth` — `applies_until` `until_formal_exchange_licence_approval` → `permanent` | L-59 | Not blocking; a correctness fix |
| **MIG-007** | New `securities_market.*` capability namespace for AIX Exchange, reserved and seeded as production-gated (§7) | L-38, L-57, L-66 | Blocks Exchange capability control |
| **MIG-008** | CFG-01 vendored Doc 00 baseline re-derivation and reseal (`DOC00_SOURCE_VERSION`) | L-72, L-58 | Required before **any** of MIG-003 / MIG-006 / MIG-007 land |
| **MIG-009** | IAM-02 permission model — separate *grantability* from *production activation*; an Exchange permission must never imply an enabled capability | L-43, L-66 | Blocks Exchange role work |
| **MIG-010** | AST-01 instrument classification — allow `SYNTHETIC` / `TEST_INSTRUMENT` classification valid only in non-production, fail-closed in production | L-19, L-50 | Blocks RWA and Exchange automated testing |

**Ordering constraint:** MIG-005 → MIG-004 precedes everything else. MIG-008 must accompany any
of MIG-003, MIG-006, MIG-007 in the same controlled change, because all three touch the sealed
registry.

---

## 5. Special review — `assertNoExchangeRuntime`

### 5.1 What it actually is

```ts
export const PROHIBITED_EXCHANGE_FRAGMENTS = [
  "order-book", "orderbook", "matching-engine", "matching_engine",
  "market-maker", "market_maker", "market-making",
  "principal-dealing", "principal_dealing",
  "spread-markup", "spread_markup", "maker-taker", "maker_taker",
  "client-to-client", "exchange",
] as const;
```

It lowercases each **registered route path** at boot and throws
`MODULE_BOUNDARY_VIOLATION` if any contains any fragment. It is called once per service, after
route registration, before listen.

**It is a terminology tripwire, not a capability control.** It cannot tell a matching engine
from a route called `/clt1/applications/exchange-onboarding` — the CLT-01 test suite asserts
exactly that false positive, deliberately.

### 5.2 Reassessment under the owner decision

| Property | Assessment |
|---|---|
| Does it prevent an accidental MB-domain venue surface? | **Yes, and well.** It is cheap, unconditional and impossible to forget |
| Does it prevent building the securities Exchange? | **Yes — in every environment, including local development.** A securities Exchange service registering `/…/order-book/…` or `/…/matching-engine/…` cannot boot |
| Should it be deleted? | **No.** Deleting it removes the only unconditional boundary control between the MB product surface and a venue surface |
| Should it be weakened for current services? | **No.** L-56: every service that calls it today is an MB/PSO-domain service, and for those the guard must remain unconditional in all five environments |

### 5.3 Target concept (specification only — not authorised for implementation)

```txt
assertServiceRuntimeBoundary({ serviceDomain, environment, routePaths })

serviceDomain = MB_PRODUCT            (FND, IAM, CLT, KYC, AML, SEC, WLT, LED, DEP,
                                       WDR, REC, OMS, MKD, LQD, EXE, TRD, SUR, PAY, …)
  → PROHIBITED_EXCHANGE_FRAGMENTS enforced UNCONDITIONALLY, in every environment.
    No configuration, flag, environment variable or capability state may relax it.
    This is the MB Spot permanent boundary (class C) expressed in code.

serviceDomain = SECURITIES_EXCHANGE   (the AIX Exchange domain modules only)
  → venue-shaped route fragments are PERMITTED, subject to ALL of:
      1. the service is registered in the Exchange domain registry (an explicit
         allow-list, not a string test);
      2. environment != PRODUCTION
           → boot permitted per the environment capability configuration;
      3. environment == PRODUCTION
           → boot permitted ONLY if the production regulatory activation gate
             affirmatively passes (Doc 00 §21 / §21A). Unknown, unreadable,
             unresolved or absent → FAIL CLOSED, refuse to boot.

INVARIANT, independent of domain and environment:
  MB_SPOT_INTERNAL_MATCHING is permanently prohibited.
  No serviceDomain value, environment value or capability state may permit an
  MB_PRODUCT service to expose a client-to-client matching surface.
```

### 5.4 Binding constraints on MIG-001

1. **The exported name `assertNoExchangeRuntime` is retained** as a deprecated alias delegating
   to the new guard with `serviceDomain: MB_PRODUCT`. Class E: it is named in six service
   bootstraps, eleven test files and multiple acceptance records.
2. **`PROHIBITED_EXCHANGE_FRAGMENTS` is retained unchanged**, including the `exchange` fragment.
3. **No current service changes domain.** Every existing call site stays `MB_PRODUCT`.
4. **The domain is a compile-time property of the service**, never a runtime-configurable value,
   and never derived from an environment variable a deployment could set.
5. **The guard fails closed on its own inputs**: unknown domain, unknown environment, unreadable
   activation state → throw.
6. **Route-path naming recommendation that reduces MIG-001's urgency:** if AIX Exchange routes
   are mounted under a prefix that avoids the frozen fragments, the Exchange product can be
   **specified and largely built** before MIG-001 lands. This is a sequencing aid, not a way to
   evade the guard — the matching-engine and order-book route surfaces will eventually need the
   domain-aware guard, and naming must never be used to slip a venue surface past it.

---

## 6. Special review — `securities.token_trading`

### 6.1 Current state

```js
{ feature_code: "securities.token_trading",
  prohibition_reason: "Securities token trading requires separate approval; not approved for MB MVP (Doc00 §8.1, MSR ASSET-RULE-001)",
  prohibition_source: "Doc00",
  applies_until: "permanent" }
```

Seeded identically in migration 014, migration 015 and `services/cfg1/src/lib/doc00-baseline.ts`,
inside a sealed 30-row registry with a `length !== 30` migration invariant.

### 6.2 Assessment

`applies_until: "permanent"` is **not** a statement that securities tokens are permanently
prohibited as a matter of law. It was seeded to mean *"this does not lapse merely because the
Exchange ceremony completes"* — which remains true and correct. Read literally today it says the
capability may never exist, which contradicts the confirmed AIX RWA and AIX Exchange product
direction.

**The name is not the problem. The `applies_until` value is.**

### 6.3 Decided position

| Dimension | Position |
|---|---|
| **Identifier** | **NOT renamed, NOT deleted, in this task or by `DEC-013`** |
| **Compatibility meaning** | *Live securities / security-token trading in the AIX production environment* |
| **DEVELOPMENT** | **May be enabled** for AIX Exchange and AIX RWA software development, against synthetic instruments only |
| **TEST** | **May be enabled** for automated testing, against synthetic instruments only |
| **UAT** | **May be enabled** for UAT of the securities Exchange and RWA security-token lifecycle |
| **DEMO** | **May be enabled** for controlled demo, with mock/synthetic non-live execution only |
| **PRODUCTION** | **FAIL CLOSED** until the applicable regulatory activation condition is satisfied — `R4-Q2` and `R1-Q1b` both unresolved |
| **MB Spot** | **This is NOT permission for securities in MB Spot.** Doc 00 §12A stands: an asset bearing the features of securities must never enter AIX Spot or AIX OTC through the Money Broking route, in any environment |

### 6.4 Required future migration — `MIG-003`

1. `applies_until` changes from `"permanent"` to a value expressing production-activation
   gating. Recommended: **`"until_production_regulatory_activation"`**, introduced as a new
   permitted value alongside the existing two.
2. `prohibition_reason` is rewritten to state the production scope explicitly.
3. The change is applied **byte-identically in all three seeded copies** (migrations 014, 015 and
   `doc00-baseline.ts`), or the integrity seal breaks.
4. **`MIG-008` (reseal) must land in the same controlled change.**
5. A non-production enablement path requires **`MIG-004`** (`environment_scope`) to exist first —
   otherwise the only way to enable it anywhere is to enable it everywhere, which is precisely
   the failure mode the new model exists to prevent.
6. Dependent tests naming this code, and the acceptance records citing the 30-code registry, are
   updated in the same change.
7. **`R1-Q4` applies**: whether changing a seeded licence-lock record requires regulator
   notification is unresolved. This migration is held until that is answered.

---

## 7. Special review — `exchange.*` identifiers

### 7.1 Inventory

| Identifier | Seeded in | `applies_until` | Doc 00 v1.4 §6 class | Target treatment |
|---|---|---|---|---|
| `exchange.public_order_book` | CFG-01 registry | `until_formal_exchange_licence_approval` | **STANDING** | **MB-boundary permanent.** `MIG-006` corrects `applies_until` |
| `exchange.matching_engine` | CFG-01 registry | `until_formal_exchange_licence_approval` | **STANDING** | As above |
| `exchange.client_to_client_matching` | CFG-01 registry | `until_formal_exchange_licence_approval` | **STANDING** | As above |
| `exchange.public_exchange_trading` | CFG-01 registry | `until_formal_exchange_licence_approval` | **STANDING** | As above |
| `exchange.public_market_depth` | CFG-01 registry | `until_formal_exchange_licence_approval` | **STANDING** | As above |
| `exchange.market_maker` | CFG-01 registry | `permanent` | **STANDING** | Correct. No change |
| `exchange.principal_dealing` | CFG-01 registry | `permanent` | **STANDING** | Correct. No change |
| `exchange.orderbook.enable` | IAM-02 permission | — | — | MB-boundary permission. No change |
| `exchange.matching_engine.enable` | IAM-02 permission | — | — | As above |
| `exchange.client_to_client_matching.enable` | IAM-02 permission | — | — | As above |
| `exchange.public_trading.enable` | IAM-02 permission | — | — | As above |
| `exchange.market_maker.enable` | IAM-02 permission | — | — | As above |
| `exchange.principal_dealing.enable` | IAM-02 permission | — | — | As above |
| `exchange.aix_spread_markup.enable` | IAM-02 permission | — | — | As above |
| `exchange.` prefix mutation block | CFG-01 `decision.ts` | — | — | **Keep unconditional** |

### 7.2 The decisive finding

**Every single `exchange.*` identifier in this repository refers to the OLD MB
client-matching concept. Not one of them refers to the securities Exchange product.**

This is confirmed by `STR-02` §1.5's classification of all 315 "Exchange" occurrences across the
twelve masters: **zero** carried the securities meaning.

### 7.3 Consequence — no reuse

Reinterpreting `exchange.matching_engine` to mean "the AIX securities Exchange matching engine"
would take an identifier whose seeded meaning is *"the thing AIX may never build"* and silently
change it into *"the thing AIX is now building"*. Under an integrity-sealed registry cited as
licence-lock evidence, that is an unacceptable regulatory risk.

**Decided: the `exchange.*` namespace is frozen as the MB-boundary prohibition namespace,
permanently. The securities Exchange gets a new namespace.**

### 7.4 Recommended new namespace — `MIG-007`

```txt
securities_market.instrument_admission
securities_market.listing
securities_market.order_entry
securities_market.central_order_book
securities_market.matching_engine
securities_market.market_data
securities_market.trading_halt
securities_market.market_operations
securities_market.surveillance
securities_market.clearing_settlement_interface
securities_market.corporate_action_interaction
securities_market.investor_eligibility
securities_market.transfer_restriction
securities_market.api
```

Chosen deliberately:

1. It does **not** begin with `exchange.`, so CFG-01's structural prefix block (L-57) stays
   unconditional and untouched.
2. It cannot be confused with the frozen MB-boundary namespace by a human or a grep.
3. It carries the regulatory character of the domain — securities — in the name itself.
4. Corresponding route paths mount under `/securities-market/…`, which avoids the frozen
   boot-guard fragment `exchange` (§5.4 constraint 6).

Every code in the new namespace is seeded **production-gated, default disabled, fail-closed**,
with `environment_scope` (`MIG-004`) controlling non-production availability.

`securities_market.matching_engine` is **the securities Exchange matching engine only**. It
grants nothing to `OMS-01`, `EXE-01` or `TRD-01`, and no MB-domain service may evaluate it.

---

## 8. Environment and capability-state model (specification)

### 8.1 Four independent states

| State | Values | Owner |
|---|---|---|
| **`CAPABILITY_BUILD_STATE`** | `NOT_SPECIFIED` → `SPECIFIED` → `IMPLEMENTED` → `TESTED` | Module blueprints, acceptance records, `MODULE_STATUS.md` |
| **`ENVIRONMENT_AVAILABILITY`** | per environment: `ENABLED` / `DISABLED` / `NOT_APPLICABLE` | CFG-01 `environment_scope` (`MIG-004`) |
| **`PRODUCTION_ACTIVATION_STATE`** | `DISABLED_PENDING_REGULATORY_ACTIVATION` / `DISABLED_PENDING_GOVERNANCE` / `DISABLED_BY_POLICY` / `PROHIBITED_PERMANENT` / `ACTIVE` | Doc 00 §21 gates; CFG-01 registry + kill switch |
| **`PRODUCT_ASSET_ELIGIBILITY_STATE`** | `NOT_ASSESSED` / `INELIGIBLE` / `ELIGIBLE` per product × asset × client × jurisdiction × counterparty | AST-01 classification; CFG-01 eligibility |

**Rule:** these are four states, never one boolean named `enabled`. Where a single boolean
already exists in code, it means `PRODUCTION_ACTIVATION_STATE` only.

**Worked example — the AIX Exchange matching engine:**

```txt
CAPABILITY_BUILD_STATE          : SPECIFIED  →  IMPLEMENTED  →  TESTED
ENVIRONMENT_AVAILABILITY        : DEVELOPMENT ENABLED
                                  TEST        ENABLED
                                  UAT         ENABLED
                                  DEMO        ENABLED (synthetic instruments only)
                                  PRODUCTION  DISABLED
PRODUCTION_ACTIVATION_STATE     : DISABLED_PENDING_REGULATORY_ACTIVATION  (R1-Q1b)
PRODUCT_ASSET_ELIGIBILITY_STATE : NOT_ASSESSED for every real instrument
```

**Counter-example — MB Spot internal client matching:**

```txt
CAPABILITY_BUILD_STATE          : NOT_SPECIFIED — and must remain so, permanently
ENVIRONMENT_AVAILABILITY        : DISABLED in all five environments, permanently
PRODUCTION_ACTIVATION_STATE     : PROHIBITED_PERMANENT
PRODUCT_ASSET_ELIGIBILITY_STATE : N/A
```

### 8.2 Five canonical environments

| Environment | Purpose | Regulated execution |
|---|---|---|
| **DEVELOPMENT** | Local and shared development | Mock / synthetic only |
| **TEST** | Automated unit, integration and E2E testing | Mock / synthetic only |
| **UAT** | User acceptance testing | Mock / synthetic only |
| **DEMO** | Controlled demonstration to named audiences | **Mock / synthetic / non-live only**, unless the applicable environment design explicitly permits otherwise |
| **PRODUCTION** | Live regulated operation | Subject to the full §21 production activation gate |

**Binding rules:**

1. **DEMO is not public production.** A controlled demo must use mock, synthetic or otherwise
   non-live regulated execution. It must never route a real client order to a real venue, move
   real client money, or issue a real instrument.
2. **Non-production must not use real client PII or live LP credentials** (Charter §26.1 rules
   1–3, preserved and extended to UAT and DEMO).
3. **No non-production configuration may propagate to PRODUCTION** (MSR `LIC-RULE-002` rule 5,
   preserved and strengthened).
4. **Unknown environment → FAIL CLOSED**, treated as PRODUCTION.
5. **Enabling in four environments is never evidence for the fifth.**

### 8.3 Mapping onto the existing `Environment` type — `MIG-005`

Current: `["dev", "qa", "uat", "staging", "prod"]`.

| Canonical | Existing member | Action |
|---|---|---|
| DEVELOPMENT | `dev` | Map |
| TEST | `qa` | Map |
| UAT | `uat` | Map |
| DEMO | *(absent)* | **Add `demo`** |
| PRODUCTION | `prod` | Map |
| — | `staging` | **Pre-production mirror of PRODUCTION.** Must inherit PRODUCTION's activation gate, not UAT's. Decided by `MIG-005`; fail closed until then |

---

## 9. Exchange module architecture assessment

**Question:** does the 33-module index provide ownership for a real securities Exchange?

**Answer: no.** The Spot modules are the **external-routing** architecture:

```txt
OMS-01  client order store + pre-trade controls   → an AIX client's own instructions
MKD-01  external market data + aggregated depth    → data sourced FROM other venues
LQD-01  LP / venue registry + adapters             → connecting TO other venues
EXE-01  execution routing                          → deciding WHICH external venue
TRD-01  trade execution + evidence                 → recording external fills
SUR-01  market surveillance                        → monitoring AIX client activity
```

Not one of them owns: instrument admission or listing, a central order book holding mutually
executable orders, a matching engine, trading halts, market operations, or an interface to a
clearing/settlement infrastructure.

**`EXE-01` is a router, not a matcher.** Putting a matching engine inside it would place a venue
capability inside the MB Spot execution path — the exact structural failure Doc 00 §7.7 exists to
prevent. **`OMS-01`'s order store must never become a book of mutually executable orders.**

**Recommendation: four new modules, MODULE ≠ SERVICE.**

| ID | Module | Owns |
|---|---|---|
| **EXM-01** | Exchange Market & Instrument Administration | Instrument admission, listing lifecycle and status, market configuration, trading calendar and sessions, trading halts, market operations |
| **EXO-01** | Exchange Order Book & Matching Engine | Exchange order entry, the central order book, the matching engine, execution generation, price/time priority, Exchange market data and depth |
| **EXC-01** | Exchange Clearing & Settlement Interface | Post-trade Exchange-domain clearing/settlement interfacing, corporate-action interaction, holder-registry and transfer-control handoff to `RWA-04` and `AST-01` |
| **EXP-01** | Exchange Participation & Eligibility | Investor/participant eligibility for the Exchange, market permissions, transfer restrictions at the market boundary, Exchange admission of participants |

**Deliberately not created:** a separate Exchange surveillance module (`SUR-01` extends —
surveillance logic is shared, the domain differs), a separate Exchange reporting module
(`RPT-01` extends), a separate Exchange API module (`API-01` extends), and a separate Exchange
asset registry (`AST-01` is platform-wide by Doc 00 §12A).

**Hard architectural boundary, binding on all four:**

> No MB-domain module may call `EXO-01`. No `EXO-01` capability may be reachable from
> `OMS-01`, `EXE-01` or `TRD-01`. The Exchange matching engine serves the securities /
> financial-instrument / security-token domain **only**, and its existence grants nothing to
> AIX Spot in any environment.

**Resulting module count: 37.**

---

## 10. RWA → Exchange integration

```txt
RWA-01  issuer onboarding, asset onboarding, evidence
   ↓
AST-01  classification  →  SECURITY / SECURITY TOKEN
   ↓
RWA-02  structuring, token configuration, transfer restrictions, issuance
   ↓
RWA-03  offering, subscription, investor eligibility, allocation
   ↓
RWA-04  holder registry, transfers, servicing, corporate actions, distributions
   ↓
AST-01  secondary-market eligibility flag  (derived from classification, never set independently)
   ↓
EXM-01  instrument admission / listing
   ↓
EXP-01  investor eligibility + transfer restrictions at the market boundary
   ↓
EXO-01  Exchange order entry → central order book → matching → execution
   ↓
EXC-01  clearing / settlement interface
   ↓
LED-01  settlement postings      RWA-04  holder registry update + transfer control
   ↓
RPT-01  issuer, holder and regulatory reporting
```

**Build now. Production activation gated at every arrow.** No instrument reaches
`EXM-01` admission without a resolved `SECURITY / SECURITY TOKEN` classification in `AST-01`,
and no admission reaches production without `R1-Q1b` and `R4-Q2` answered.

---

## 11. Unresolved regulatory questions — unchanged

**This review answers none of them, and none of them blocks development.** Each holds its
capability's `PRODUCTION_ACTIVATION_STATE` at `DISABLED_PENDING_REGULATORY_ACTIVATION`:
`R1-Q1b`, `R1-Q2`, `R1-Q3`, `R1-Q4`, `R3-Q2b`, `R3-Q3`, `R3-Q6`, `R4-Q1`…`R4-Q7`, `R5-Q1`,
`R5-Q2`, `A2-Q1`, `A2-Q2`, `R-MODEL-C`.

**`R-MODEL-C` is different in kind.** It is not a question awaiting an answer that would unlock
anything — no verified provision supports internal client matching, and it is recorded as a
standing prohibition. It is listed with the others for completeness only.

**New question raised by this review, recorded not answered:**

| ID | Question | Holds |
|---|---|---|
| **R6-Q1** | Does a controlled demo of a production-gated regulated capability to an external audience constitute holding out an unapproved activity? | DEMO exposure of Exchange and RWA capabilities to external audiences |

---

## 12. What this review does not do

- It changes no lock, identifier, seeded row, migration, test or guard.
- It approves no securities activity, RWA issuance, venue, order type or asset.
- It answers no regulatory open question.
- It does not authorise any migration in §4.
- It grants AIX Spot nothing. Model C remains a standing prohibition in every environment.
- It does not expand scope into derivatives, futures, margin, leverage, lending, staking, yield
  or DeFi. Those remain class D.
