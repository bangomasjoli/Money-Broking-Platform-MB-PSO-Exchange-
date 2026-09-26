# AST-01 — 12 Risk, Control and Regulatory Map (v1.3)

**Status: REMEDIATED / AWAITING RE-REVIEW.** Regulatory statements are limited to what the masters and `DEC-012`/`DEC-013` already record; this document answers **no** regulatory open question and describes no Labuan FSA position beyond the cited masters. The 2025 Digital Money Broking guideline is **effective 1 January 2027** and is used only as a target requirement (Doc 00 §22).

## 1. Risk register (module-level)

| ID | Risk | Severity | Control(s) | Residual / owner |
|---|---|---|---|---|
| **AR-01** | A securities-featured instrument reaches Spot, OTC, Pay or **any MB/PSO-domain path (incl. MB wallet deposit/withdrawal)**, taking AIX outside the Money Broking framework (LFSA-MB-2024 fn 1 ¶1.2) | **Critical** | INV-01: total matrix + exhaustive boot invariant; pure derivation; **SQL backstop reading the ledger, at mint and at consumption** (F18); **service/subject allow-list (frozen, boot-asserted) and bound tokens**; **canonical instrument resolution** (F17); domain-scoped custody subjects (F01, F02, F04); T-SEC-*, T-DOM-*, T-RES-*, T-CON-* | Depends on **classification being correct** (a legal judgment AST-01 records but cannot make) and on **consumers** (WLT-01 etc.) honouring DCR-AST1-002/-004, including **WLT-01 supplying contract identity** (F17). Owner: Compliance; consumer modules |
| **AR-02** | Eligibility flag drifts from classification | **Critical** | No stored eligibility; derived at read; schema-lint T-SCH-01; admission is conjunct-only and record-bound | None structurally |
| **AR-03** | Instrument forgotten in a permissive default | **Critical** | Unresolved = absence; NOT NULL/no-default on characteristics; `NOT_ASSESSED` denies | None structurally |
| **AR-04** | Classifier self-approves / collusion | High | Maker ∉ **IAM-02-attested** approvers (service + DB on attested values); checker-conflict rule; **elevated two-checker path with lineage** (AST-HD-8); `SUPER_ADMIN` excluded | **`IAM2-FIND-002`/`003` open and IAM-02 attests no approver identity today (F05).** Governed classification apply is **disabled until DCR-AST1-001(a)+(d)**; go-live additionally needs (b)(c) |
| **AR-05** | A classification is made on inadequate evidence | High | Evidence standard as governed data, required-type check, hash-bound bundle, fingerprint binding | **`R4-Q3` open**: no binding standard exists → PRODUCTION classification is *impossible* by design until governance answers it |
| **AR-06** | Non-production/synthetic classification leaks into PRODUCTION | High | `recorded_environment` **filled by trigger from `deployment_environment`**; synthetic unpromotable, immutable from insert; PRODUCTION collapse; SYSTEM holds; a real instrument's `NON_SECURITY` needs a production-applicable standard in every environment (F25) | Restoring non-prod data into prod collapses to `UNRESOLVED` |
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
| **AR-19** | A prior `SECURITY` determination is escaped by a *disguised* replacement, or leaves a related instrument silently eligible | High | **Deterministic signals are wired, not left to judgement [F19, F20]:** canonical identity registered once (token and native `(chain, network)`, retired rows included); lineage assignment immutable from creation; same-asset membership; declared predecessor; **transitive underlying link forces the elevated path**; **derived sibling/wrapper conjunct** `LINEAGE_SECURITY_REVIEW_REQUIRED` — **[v1.3: F27] which a governed merge now triggers too: the merge carries a DB-assigned `merge_global_seq`, narrows every affected member and wrapper and revokes their tokens in its own transaction (the AR-19 remedy path now does what it promises);** irreversible merge; advisory candidates (issuer, shared underlying, name). The v1.1 code-hash claim is **withdrawn** (no data source) | **Residual (non-deterministic only):** an economic-subject replacement with no matching canonical identifier, no underlying relationship, no declared predecessor, no same-asset membership and no surfaced signal — including a code-identical redeployment that shares no issuer reference (no code-hash source, OQ-5). Handled by the human classifier and evidence process; **not** used to excuse any signal the platform can deterministically know |
| **AR-20** | SQL backstop and TypeScript matrix diverge (two implementations) | Medium | Backstop is deliberately coarser (forbid-only); parity test T-DB-09/T-SEC-12; boot invariant | Divergence is tested, not impossible |
| **AR-21** | Wrong or ambiguous instrument resolved — a security sibling credited under an eligible sibling's classification | **High** | **Canonical resolution [F17]:** the only keys are instrument id/code and canonical contract or native identity; symbol, asset code and `(asset, chain, network)` never resolve; 0 or >1 ⇒ deny, no token; a sibling is never guessed; consumers bind `instrument_id` at `verify-decision`; the backstop guarantees the *named* instrument's ledger permits the `allow`; T-RES-* | **WLT-01 has no contract-identity field today** (verified in the round-2 review, migrations `049`/`066`): an external integration gate (DCR-AST1-002 (7)); no real token deposit path may go live without it. Consumer discipline for the rest |
| **AR-22** | Fiat mishandled by a consumer: treated as `INELIGIBLE` (breaking fiat-quoted pairs or Pay), or a MYR pair activated with no control | Medium | `not_applicable` by **form**; reference endpoint; consumer tests (T-FIA-04/-07); **digital MYR ⇒ `NOT_ASSESSED` `MYR_PAIR_CONTROL_UNRESOLVED`, no override** (`AST-P-4`); consumers deny a `myr_denominated` fiat leg in a trading pair without a recorded pair-level approval; DCR-AST1-008(c) gates any consumer blueprint that activates a fiat-quoted or MYR pair | **No MYR-pair control exists; MYR-pair prevention is not enforced anywhere until OQ-6 assigns an owner (F21).** AST-01 provides identity, the attribute and the fail-closed result only |
| **AR-23** | A canonical identity is consumed by a mistake (typo in an insert-immutable field, abandoned draft, retired instrument) and can never be registered again | Medium | `POST /instruments/validate` dry run; only non-identity fields are editable in `DRAFT`; the consequence is stated (05 §4.2) | Fail-closed by design (F19.E). **OQ-8:** whether a governed correction for never-locked drafts is wanted is a human decision; none exists |
| **AR-24** | One `SECURITY` determination — or **a lineage merge that joins one [v1.3: F27]** — fail-closes many siblings/wrappers at once (bridged variants, wrappers) — an availability impact. Clause (b) of the predicate is a deliberate **over-approximation**: merging an unrelated clean tree into a security-holding tree also narrows members that were already reviewed | Medium | Intended: derived conjunct (01 §4.7A); released only by explicit elevated review; no classification rewritten; the merge request lists the instruments it would narrow before approval | Operational, accepted; Compliance must staff elevated reviews. A later version may refine clause (b) with a side-aware form (safety-neutral) |
| **AR-25** | Lock contention or timeout makes mint/consume unavailable | Medium | Short `lock_timeout`; instrument-before-token order and ascending multi-lock; unavailability = deny for the consumer with the token left unconsumed (05 §7A); T-CON-07 | Availability, not safety; consumers may retry within the TTL |
| **AR-26** | No real instrument can be eligible anywhere, including non-production, until `R4-Q3` yields a production-applicable standard | Medium | Strict Doc 00 §1.D rule 4 (`AST-R2-HD-01`); synthetic instruments are the non-production route | Intended consequence: no provisional real-asset classification enables any product |
| **AR-27** [v1.3: F26] | An `ASSET_CLASS_CORRECTION` leaves an old classification usable below TypeScript (stale `NON_SECURITY` on an instrument whose class was corrected into `SECURITY`/`SECURITY_TOKEN`; tokens, admissions or attestations still passing SQL) | **High** | SQL `record_fingerprint_matches` and backstop rule **B12** (no allow, consumption, admission, attestation, custody or operational enable on a mismatched record); the correction is a locked writer (governed change → asset → every instrument ascending → tokens) that **revokes all tokens** in its own transaction; a governing-change **marker** distinguishes the expected state from unexplained drift; new classification mandatory; T-FPR-* | Availability: the asset's instruments are `NOT_ASSESSED` until reclassified (intended). The database cannot recompute the fingerprint hash itself; raw tampering with identity columns is the sweep's and TypeScript's job (S4) |
| **AR-28** [v1.3: F28.a] | A registration-path defect stores a second spelling of one contract, defeating the identity index and the resolver | Medium | Database-enforced canonical form (`CHECK` + trigger, versioned SQL canonicaliser, rejects rather than rewrites); one canonicaliser for resolver and registration; sweep re-canonicalisation and collision detection; T-ADR-01…05 | The database has no checksum primitive: a well-formed but mistyped address registers a wrong identity (harmless; OQ-8). A network with no supported rule cannot carry a token instrument |
| **AR-29** [v1.3: F28.b] | An application-suppliable timestamp lets non-new evidence look newer than a `SECURITY` determination or merge | Medium | One DB sequence orders records, merges, evidence and markers under the §7A locks; `recorded_at_utc` trigger-filled and audit-only; explicit `follows_event_*` binding computed by the database; INV-21; T-ADR-06…10 | None structurally |
| **AR-30** [v1.3: F28.c] | `lineage.synthetic` edited to move a history across the real/synthetic boundary | Medium | `lineage` insert-only: no `UPDATE` grant and a trigger for every role; sweep trigger/grant inventory; T-ADR-11/12 | An out-of-band DBA action (disabling the trigger) is detected by the sweep, not prevented |
| **AR-31** [v1.3] | Lock-order inversion or a class/form or lineage-membership race between writers, the first instrument insert, the merge and the correction | Medium | One total order (governed change → lineage gate → asset → instruments ascending → tokens → inserts) with level-tracking lock helpers that raise `AS006`; affected-set re-derivation; no lock held across a remote call; T-LOK-* | Availability (`lock_timeout`) — safety is unaffected; the global gate serialises rare classification writes |

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
| Lineage / elevated approval (own lineage, underlying, immutable lineage, identity registered once) | 17, 05 | T-SEC-10, T-CLS-14, T-LIN-* |
| Sibling/wrapper fail-closed conjunct (record **or merge** trigger; narrowing in the merge transaction) | 17, 04, 21 | T-LIN-08…13, T-LIN-15…27, T-DER-13 |
| SQL record-to-identity binding (B12), class-correction locking and token revocation | 22, 20 | T-FPR-* |
| Database-enforced canonical address; server-authoritative evidence ordering; immutable `lineage.synthetic` | 21, 23 | T-ADR-* |
| Global lock order and cycle freedom | 20 | T-LOK-*, T-CON-07/12/14 |
| Canonical instrument resolution | 18, 01 | T-RES-* |
| Serialised mint/consume, token immutability, SQL backstop at consumption | 20, 01 | T-CON-* |
| Real instruments need a production-applicable basis | 19 | T-RNP-* |
| Digital MYR fail-closed, no override | 04, 11 | T-MYR-* |
| Payload/allow-list binding | 15 | T-PLD-* |

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
| MYR pairs prohibited unless separately approved; a pair cannot activate if either leg is prohibited | `ASSET-RULE-001`; `DEC-013` cl. 6 | **Not enforced by AST-01 and by no existing control (OQ-6).** AST-01 supplies identity, the MYR attribute and `NOT_ASSESSED` `MYR_PAIR_CONTROL_UNRESOLVED`; 01 §3.10 |
| MB-domain / securities-domain isolation | Module Index §19 rule 5A | 01 §5.8; INV-15 |
| Real-instrument securities-route eligibility `NOT_ASSESSED` | Doc 00 §12E.2, §12B; `DEC-013` cl. 9 | 01 §5.3 ⁵ |
| Controls never environment-relaxed | Doc 00 §21A rule 7; `SYS-RULE-007A` | 01 §5.8; T-ENV-04 |
| Evidence obligations follow the capability | Doc 00 §21A rule 8; `DEC-012` cl. 1 rule 7 | 08 §2 |
| Six-year retention (**target, from 1 Jan 2027, not currently in force**) | LFSA-DMB-2025 ¶5.12; Doc 00 §22 | 08 §3 |
| `assertNoExchangeRuntime` retained; `exchange.*` namespace frozen | `DEC-013` cl. 8, 10 | INV-14 |

## 4. Not asserted by this pack

That any asset is or is not a security; that any evidence standard is adequate; that AIX's Exchange approval covers securities (`R1-Q1b`); that non-security RWAs may trade on MB rails (`R4-Q6`, `R4-Q7`); that any custodian is acceptable (`R4-Q5`); that any MYR-pair control exists or enforces MYR-pair restrictions (none does; OQ-6); that production may be activated for anything (`R4-Q1…Q7`, Doc 00 §21). Each remains open and is modelled as a fail-closed gap.
