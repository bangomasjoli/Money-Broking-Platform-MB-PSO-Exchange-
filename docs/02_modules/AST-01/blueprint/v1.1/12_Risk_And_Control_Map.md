# AST-01 — 12 Risk, Control and Regulatory Map (v1.1)

**Status: REMEDIATED / AWAITING RE-REVIEW.** Regulatory statements are limited to what the masters and `DEC-012`/`DEC-013` already record; this document answers **no** regulatory open question and describes no Labuan FSA position beyond the cited masters. The 2025 Digital Money Broking guideline is **effective 1 January 2027** and is used only as a target requirement (Doc 00 §22).

## 1. Risk register (module-level)

| ID | Risk | Severity | Control(s) | Residual / owner |
|---|---|---|---|---|
| **AR-01** | A securities-featured instrument reaches Spot, OTC, Pay or **any MB/PSO-domain path (incl. MB wallet deposit/withdrawal)**, taking AIX outside the Money Broking framework (LFSA-MB-2024 fn 1 ¶1.2) | **Critical** | INV-01: total matrix + exhaustive boot invariant; pure derivation; **SQL backstop reading the ledger**; **service/subject allow-list and bound tokens**; domain-scoped custody subjects (F01, F02, F04); T-SEC-*, T-DOM-* | Depends on **classification being correct** (a legal judgment AST-01 records but cannot make) and on **consumers** (WLT-01 etc.) honouring DCR-AST1-002/-004. Owner: Compliance; consumer modules |
| **AR-02** | Eligibility flag drifts from classification | **Critical** | No stored eligibility; derived at read; schema-lint T-SCH-01; admission is conjunct-only and record-bound | None structurally |
| **AR-03** | Instrument forgotten in a permissive default | **Critical** | Unresolved = absence; NOT NULL/no-default on characteristics; `NOT_ASSESSED` denies | None structurally |
| **AR-04** | Classifier self-approves / collusion | High | Maker ∉ **IAM-02-attested** approvers (service + DB on attested values); checker-conflict rule; **elevated two-checker path with lineage** (AST-HD-8); `SUPER_ADMIN` excluded | **`IAM2-FIND-002`/`003` open and IAM-02 attests no approver identity today (F05).** Governed classification apply is **disabled until DCR-AST1-001(a)+(d)**; go-live additionally needs (b)(c) |
| **AR-05** | A classification is made on inadequate evidence | High | Evidence standard as governed data, required-type check, hash-bound bundle, fingerprint binding | **`R4-Q3` open**: no binding standard exists → PRODUCTION classification is *impossible* by design until governance answers it |
| **AR-06** | Non-production/synthetic classification leaks into PRODUCTION | High | `recorded_environment` **filled by trigger from `deployment_environment`**; synthetic unpromotable, immutable from insert; PRODUCTION collapse; SYSTEM holds; a non-production classification of a real instrument is provisional test data | Restoring non-prod data into prod collapses to `UNRESOLVED` |
| **AR-07** | Caller spoofs environment to relax control | High | Own-environment authority (INV-06); `CFG-FIND-001` lesson | — |
| **AR-08** | Classified identity changes silently (contract upgrade, re-pointed proxy) | High | Fingerprint; identity immutability; drift ⇒ `UNRESOLVED` + system hold | On-chain proxy/implementation changes are not observable by AST-01; needs an external monitor (OQ-5) |
| **AR-09** | Stale approval or wrong-purpose token used | High | Single-use tokens, TTL 60 s, bound to subject/domain/consumer/instrument/environment/**record id**; revoke-on-narrow; verify re-derivation; **not an order-lifetime entitlement** (AST-HD-10) | Consumers must re-evaluate and re-verify at each routing/execution attempt (DCR-AST1-004) |
| **AR-10** | Consumers treat `ELIGIBLE` as permission to trade | High | `conjunct`/`not_evaluated` fields; INV-10; naming (`eligibility`, never `access`) | Consumer discipline; tested in consumer modules |
| **AR-11** | Consumers act on the informational summary or a cached allow | Medium | Summary marked informational tokenless; token TTL; consumers instructed | Consumer discipline |
| **AR-12** | AST-01 unavailable ⇒ consumers fail open | High | Documented contract: unavailability = deny; no cached allow beyond TTL | Consumer discipline; consumer tests |
| **AR-13** | AST-01 becomes a backdoor to the securities Exchange/Model C or reaches MB from the securities domain | Critical | No matching/order/quote surface; INV-14 (no `exchange` route/identifier; enum is `SECURITIES_MARKET`); **MB-domain services never allow-listed to securities subjects (Module Index §19 rule 5A)**; attestation cannot create eligibility; T-BND-*, T-DOM-* | `DEC-013` cl. 5 stands |
| **AR-14** | Two registries of networks/assets diverge (AST-01 vs WLT-01 `chain_coverage`, `asset_or_currency` free text) | Medium | Consumers AND both; DCR-AST1-002 to reconcile later | Until reconciled, WLT-01 accepts assets AST-01 has never seen |
| **AR-15** | Transfer restrictions recorded but not enforced downstream | High | Published in every deposit/withdrawal/secondary decision; `enforcement_points` explicit; on-chain reference | Enforcement is `WLT-01`/`RWA-04`/`EXP-01`/contract; each needs its own control and test |
| **AR-16** | Prohibited-category attribute misdeclared `false` | High | Explicit NOT NULL declarations; compliance review at admission; attributes immutable after lock | Human review is the control; cannot be automated away |
| **AR-17** | Classification approved under regulatory ambiguity | High | Evidence-standard gate (AR-05); bucketed rule for open questions (01 §5.9): route-membership → AST-01 `NOT_ASSESSED`, operating permission → CFG-01; Doc 00 §12E.2 followed verbatim for real securities-route instruments | — |
| **AR-18** | Evidence documents lost/altered outside AST-01 | Medium | Hash binding; retention requirement on the document store (DCR-AST1-005) | Document store ownership unassigned in the masters |
| **AR-19** | A prior `SECURITY` determination is escaped by a *disguised* replacement (new asset, new contract, no declared continuity) | High | Automatic on-chain continuity; mandatory predecessor declaration; candidate surfacing (issuer, underlying, code hash, name); irreversible lineage merge; integrity sweep `lineage_gap_found` | **Residual: continuity that is not on-chain-identical, declared or surfaced depends on the human checker (F06)** |
| **AR-20** | SQL backstop and TypeScript matrix diverge (two implementations) | Medium | Backstop is deliberately coarser (forbid-only); parity test T-DB-09/T-SEC-12; boot invariant | Divergence is tested, not impossible |
| **AR-21** | Application logs a decision against the wrong instrument id | Medium | Consumers bind `instrument_id` at `verify-decision` (F02); backstop guarantees the *named* instrument's ledger permits the `allow` | Consumer discipline |
| **AR-22** | Fiat treated as digital-asset `INELIGIBLE` by a consumer, breaking fiat-quoted pairs or Pay | Medium | `not_applicable` contract; reference endpoint; consumer contract tests (T-FIA-04) | Pair/product control ownership unassigned (OQ-6) |

## 2. Control catalogue → invariant → test

| Control | INV | Tests |
|---|---|---|
| Matrix constant + `assertMatrixInvariants` | 01, 02 | T-SEC-03, T-DER-01/02 |
| Derived-only eligibility, schema lint | 03 | T-SCH-01, T-API-01 |
| Conjunct-only narrowing | 04 | T-DER-03, T-CNJ-* |
| Append-only ledger + fingerprint + maker≠checker | 05 | T-CLS-03/06/07 |
| Own-environment authority | 06 | T-ENV-* |
| Synthetic structural unpromotability | 07, 08 | T-SYN-* |
| Human tighten and loosen both maker-checkered; system integrity failure denies immediately | 09 | T-HLD-*, T-CNJ-06 |
| No override path for prohibited categories | 11 | T-CNJ-01 |
| Decision log with provenance | 12 | T-AUD-02, T-TOK-04 |
| No cross-service import; no `exchange` routes / identifiers | 13, 14 | T-BND-* |
| Domain and consumer binding | 15 | T-DOM-* |
| Fiat reference-only | 16 | T-FIA-* |
| Lineage / elevated approval | 17, 05 | T-SEC-10, T-CLS-14 |

## 3. Regulatory / master mapping

| Requirement | Source | AST-01 element |
|---|---|---|
| Securities-featured assets excluded from Money Broking | LFSA-MB-2024 fn 1 to ¶1.2 (via `DEC-012` cl. 6; Doc 00 §12A) | INV-01; classification gate |
| Classification precedes product eligibility; eligibility derived, never independent | Doc 00 §12A; `AST-SRS-001` req 1–2; `ASSET-RULE-002`; `SYS-RULE-009`; Workflow `WF-35` | 01 §5; INV-02/03/04 |
| Unresolved is default and fails closed | Doc 00 §12A; `AST-SRS-001` req 3; `SYS-RULE-010` | INV-02 |
| Security/security token never Spot/OTC in any environment | `AST-SRS-001` req 4; `ASSET-RULE-002` rule 1; Module Index §19 rule 5B | INV-01 |
| Exchange eligibility only via resolved security classification and `EXM-01` admission | `AST-SRS-001` req 5 | 01 §5.4, §8.6 |
| Classification changes maker-checkered, audited | `AST-SRS-001` req 6; Role Matrix **§19 rule 9**; `ASSET-RULE-002` rule 4 | 07 §5; 05 §4.4 |
| Synthetic valid non-production only, fails closed in PRODUCTION, unpromotable | `AST-SRS-001A`; `MIG-010`; Doc 00 §12A | INV-07/08 |
| Every asset has precision; no precision ⇒ blocked | `LED-RULE-005` rules 1, 10 | 01 §3.8; `ASSET_PRECISION_INVALID` |
| Prohibited assets cannot be activated; admin cannot override | `ASSET-RULE-001` rules 1, 2, 6 | INV-11 |
| Third-party custody; no self-custody / AIX key custody | Doc 00 §8.2 | 01 §6 |
| Access = permission ∧ availability ∧ activation ∧ eligibility ∧ production gate | Doc 00 §21A rule 2; `DEC-013` cl. 11; `DEC-014` | INV-10; 01 §9 |
| Permissions never activate | Role Matrix §3.7; Doc 00 §21A rule 3 | 07 §2 |
| Fiat identity/precision as reference data outside §12A | `LED-RULE-005` rule 2; Doc 00 §12A (digital assets) | 01 §3.10; AST-HD-1 |
| MB-domain / securities-domain isolation | Module Index §19 rule 5A | 01 §5.8; INV-15 |
| Real-instrument securities-route eligibility `NOT_ASSESSED` | Doc 00 §12E.2, §12B; `DEC-013` cl. 9 | 01 §5.3 ⁵ |
| Controls never environment-relaxed | Doc 00 §21A rule 7; `SYS-RULE-007A` | 01 §5.8; T-ENV-04 |
| Evidence obligations follow the capability | Doc 00 §21A rule 8; `DEC-012` cl. 1 rule 7 | 08 §2 |
| Six-year retention (**target, from 1 Jan 2027, not currently in force**) | LFSA-DMB-2025 ¶5.12; Doc 00 §22 | 08 §3 |
| `assertNoExchangeRuntime` retained; `exchange.*` namespace frozen | `DEC-013` cl. 8, 10 | INV-14 |

## 4. Not asserted by this pack

That any asset is or is not a security; that any evidence standard is adequate; that AIX's Exchange approval covers securities (`R1-Q1b`); that non-security RWAs may trade on MB rails (`R4-Q6`, `R4-Q7`); that any custodian is acceptable (`R4-Q5`); that production may be activated for anything (`R4-Q1…Q7`, Doc 00 §21). Each remains open and is modelled as a fail-closed gap.
