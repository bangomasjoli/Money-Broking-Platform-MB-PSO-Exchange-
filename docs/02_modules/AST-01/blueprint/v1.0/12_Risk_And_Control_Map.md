# AST-01 — 12 Risk, Control and Regulatory Map

**Status: PLANNED / AWAITING REVIEW.** Regulatory statements are limited to what the masters and `DEC-012`/`DEC-013` already record; this document answers **no** regulatory open question and describes no Labuan FSA position beyond the cited masters. The 2025 Digital Money Broking guideline is **effective 1 January 2027** and is used only as a target requirement (Doc 00 §22).

## 1. Risk register (module-level)

| ID | Risk | Severity | Control(s) | Residual / owner |
|---|---|---|---|---|
| **AR-01** | A securities-featured instrument reaches Spot/OTC, taking AIX outside the Money Broking framework (LFSA-MB-2024 fn 1 ¶1.2) | **Critical** | INV-01 in matrix constant + boot self-test, evaluate, DB CHECKs (log, token), admission trigger, verify re-assertion; T-SEC-* exhaustive | Depends on **classification being correct** — a legal judgment AST-01 records but cannot make. Owner: Compliance |
| **AR-02** | Eligibility flag drifts from classification | **Critical** | No stored eligibility; derived at read; schema-lint T-SCH-01; admission is conjunct-only and record-bound | None structurally |
| **AR-03** | Instrument forgotten in a permissive default | **Critical** | Unresolved = absence; NOT NULL/no-default on characteristics; `NOT_ASSESSED` denies | None structurally |
| **AR-04** | Classifier self-approves / collusion | High | `maker≠checker` ×3; checker-conflict rule; elevated approval for `SECURITY→NON_SECURITY` (HD-8); `SUPER_ADMIN` excluded | **`IAM2-FIND-002`/`003` open** — IAM-02 does not itself evaluate entitlement or seed approval policy. AST-01 must not go live for real classification before DCR-AST1-001 lands |
| **AR-05** | A classification is made on inadequate evidence | High | Evidence standard as governed data, required-type check, hash-bound bundle, fingerprint binding | **`R4-Q3` open**: no binding standard exists → PRODUCTION classification is *impossible* by design until governance answers it |
| **AR-06** | Non-production/synthetic classification leaks into PRODUCTION | High | `recorded_environment` binding; synthetic unpromotable; PRODUCTION collapse; anomaly holds | Restoring non-prod data into prod collapses to `UNRESOLVED` (fails closed) |
| **AR-07** | Caller spoofs environment to relax control | High | Own-environment authority (INV-06); `CFG-FIND-001` lesson | — |
| **AR-08** | Classified identity changes silently (contract upgrade, re-pointed proxy) | High | Fingerprint; identity immutability; drift ⇒ `UNRESOLVED` + system hold | On-chain proxy/implementation changes are not observable by AST-01; needs an external monitor (OQ-5) |
| **AR-09** | Stale approval used after reclassification | High | Single-use tokens, TTL 60 s, `classification_record_seq` binding, revoke-on-narrow, verify re-derivation | Consumers must call `verify-decision` immediately before acting (DCR-AST1-004) |
| **AR-10** | Consumers treat `ELIGIBLE` as permission to trade | High | `conjunct`/`not_evaluated` fields; INV-10; naming (`eligibility`, never `access`) | Consumer discipline; tested in consumer modules |
| **AR-11** | Consumers act on the informational summary or a cached allow | Medium | Summary marked informational tokenless; token TTL; consumers instructed | Consumer discipline |
| **AR-12** | AST-01 unavailable ⇒ consumers fail open | High | Documented contract: unavailability = deny; no cached allow beyond TTL | Consumer discipline; consumer tests |
| **AR-13** | AST-01 becomes a backdoor to Exchange/Model C | Critical | No matching/order/quote surface; INV-14; T-BND-*; `EXCHANGE` only as eligibility enum; attestation cannot create eligibility | `DEC-013` cl. 5 stands |
| **AR-14** | Two registries of networks/assets diverge (AST-01 vs WLT-01 `chain_coverage`, `asset_or_currency` free text) | Medium | Consumers AND both; DCR-AST1-002 to reconcile later | Until reconciled, WLT-01 accepts assets AST-01 has never seen |
| **AR-15** | Transfer restrictions recorded but not enforced downstream | High | Published in every deposit/withdrawal/secondary decision; `enforcement_points` explicit; on-chain reference | Enforcement is `WLT-01`/`RWA-04`/`EXP-01`/contract; each needs its own control and test |
| **AR-16** | Prohibited-category attribute misdeclared `false` | High | Explicit NOT NULL declarations; compliance review at admission; attributes immutable after lock | Human review is the control; cannot be automated away |
| **AR-17** | Classification approved by a checker under `PRODUCTION` regulatory ambiguity | High | Standard gate (AR-05); AST-01 holds `NOT_ASSESSED` for questions it cannot answer (`R4-Q6`/`Q7`) rather than guessing | — |
| **AR-18** | Evidence documents lost/altered outside AST-01 | Medium | Hash binding; retention requirement on the document store (DCR-AST1-005) | Document store ownership unassigned in the masters |

## 2. Control catalogue → invariant → test

| Control | INV | Tests |
|---|---|---|
| Matrix constant + `assertMatrixInvariants` | 01, 02 | T-SEC-03, T-DER-01/02 |
| Derived-only eligibility, schema lint | 03 | T-SCH-01, T-API-01 |
| Conjunct-only narrowing | 04 | T-DER-03, T-CNJ-* |
| Append-only ledger + fingerprint + maker≠checker | 05 | T-CLS-03/06/07 |
| Own-environment authority | 06 | T-ENV-* |
| Synthetic structural unpromotability | 07, 08 | T-SYN-* |
| Tighten single-actor / loosen M+C | 09 | T-HLD-*, T-CNJ-06 |
| No override path for prohibited categories | 11 | T-CNJ-01 |
| Decision log with provenance | 12 | T-AUD-02, T-TOK-04 |
| No cross-service import; no `exchange` routes | 13, 14 | T-BND-* |

## 3. Regulatory / master mapping

| Requirement | Source | AST-01 element |
|---|---|---|
| Securities-featured assets excluded from Money Broking | LFSA-MB-2024 fn 1 to ¶1.2 (via `DEC-012` cl. 6; Doc 00 §12A) | INV-01; classification gate |
| Classification precedes product eligibility; eligibility derived, never independent | Doc 00 §12A; `AST-SRS-001` req 1–2; `ASSET-RULE-002`; `SYS-RULE-009`; Workflow `WF-35` | 01 §5; INV-02/03/04 |
| Unresolved is default and fails closed | Doc 00 §12A; `AST-SRS-001` req 3; `SYS-RULE-010` | INV-02 |
| Security/security token never Spot/OTC in any environment | `AST-SRS-001` req 4; `ASSET-RULE-002` rule 1; Module Index rule 5B | INV-01 |
| Exchange eligibility only via resolved security classification and `EXM-01` admission | `AST-SRS-001` req 5 | 01 §5.4, §8.6 |
| Classification changes maker-checkered, audited | `AST-SRS-001` req 6; Role Matrix §5.2A rule 9; `ASSET-RULE-002` rule 4 | 07 §5; 05 §4.4 |
| Synthetic valid non-production only, fails closed in PRODUCTION, unpromotable | `AST-SRS-001A`; `MIG-010`; Doc 00 §12A | INV-07/08 |
| Every asset has precision; no precision ⇒ blocked | `LED-RULE-005` rules 1, 10 | 01 §3.8; `ASSET_PRECISION_INVALID` |
| Prohibited assets cannot be activated; admin cannot override | `ASSET-RULE-001` rules 1, 2, 6 | INV-11 |
| Third-party custody; no self-custody / AIX key custody | Doc 00 §8.2 | 01 §6 |
| Access = permission ∧ availability ∧ activation ∧ eligibility ∧ production gate | Doc 00 §21A rule 2; `DEC-013` cl. 11; `DEC-014` | INV-10; 01 §9 |
| Permissions never activate | Role Matrix §3.7; Doc 00 §21A rule 3 | 07 §2 |
| Controls never environment-relaxed | Doc 00 §21A rule 7; `SYS-RULE-007A` | 01 §5.8; T-ENV-04 |
| Evidence obligations follow the capability | Doc 00 §21A rule 8; `DEC-012` cl. 1 rule 7 | 08 §2 |
| Six-year retention (**target, from 1 Jan 2027, not currently in force**) | LFSA-DMB-2025 ¶5.12; Doc 00 §22 | 08 §3 |
| `assertNoExchangeRuntime` retained; `exchange.*` namespace frozen | `DEC-013` cl. 8, 10 | INV-14 |

## 4. Not asserted by this pack

That any asset is or is not a security; that any evidence standard is adequate; that AIX's Exchange approval covers securities (`R1-Q1b`); that non-security RWAs may trade on MB rails (`R4-Q6`, `R4-Q7`); that any custodian is acceptable (`R4-Q5`); that production may be activated for anything (`R4-Q1…Q7`, Doc 00 §21). Each remains open and is modelled as a fail-closed gap.
