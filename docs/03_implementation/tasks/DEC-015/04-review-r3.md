# 04 Review — DEC-015 (round 3)

- **Review:** independent acceptance-gate architecture and fund-flow review; 2026-10-05.
- **Verdict:** **REMEDIATE**.
- **Reviewed commit:** `642597a7abb26c7c1e205fa653859e4af807378f` on `main`, equal to `origin/main` after fetch; working tree clean at preflight.
- **Reviewed artefacts:** STR-04 v0.3 and STR-04A/B/C v0.3, including all 58 architecture sections and all three provider-requirement documents.
- **Status:** DEC-015 remains **NOT_ACCEPTED**. This review is not human acceptance, implementation authorisation, provider approval or production approval.
- **Independence:** this turn independently tested the source rules and reference-branch contracts. Prior review conclusions and remediation claims were treated as assertions, not evidence of closure. No remediation was performed.
- **Read-only reference heads:** ACC-01 `3f23c3dcb2c5023a64afa2bd2dfb0ef77fe544be`; AST-01 `1978f2e24192b7d893939b25ec9176cc9920791a`.
- **Only authorised repository write:** `docs/03_implementation/tasks/DEC-015/04-review-r3.md`.

## 1. Evidence and method

Source abbreviations below identify these exact repository-relative files at the reviewed commit:

| Reference | File |
|---|---|
| STR-04 | `docs/05_strategy/AIX_Client_Asset_Fiat_Banking_Virtual_Account_Custody_Settlement_Architecture_v0.3.md` |
| STR-04A | `docs/05_strategy/AIX_Bank_PSP_Settlement_Provider_Requirements_v0.3.md` |
| STR-04B | `docs/05_strategy/AIX_Institutional_Custodian_Requirements_v0.3.md` |
| STR-04C | `docs/05_strategy/AIX_LP_OTC_Counterparty_Requirements_v0.3.md` |
| ACC-01 | `docs/02_modules/ACC-01/blueprint/v0.10/` on the pinned ACC-01 reference head |
| AST-01 | `docs/02_modules/AST-01/blueprint/v1.8/` on the pinned AST-01 reference head |

Read the complete DEC-015 plan, evidence, Round-1 review/remediation and Round-2 review/remediation records, plus `task.json`. Checked `CURRENT_STATE.md`, `DOCUMENT_REGISTER.md`, `OPEN_FINDINGS.md`, tasks governance and `CLAUDE_CODE_USAGE_RULES.md`; read binding DEC-011 through DEC-014 in `docs/DECISION_LOG.md`. The register determines authoritative versions: masters 00/01 v1.5, 02/04/05/06 v1.3, 03 v1.4, 07–11 v1.2; money-module packs LED/WLT/DEP/WDR/REC/INC v1.1, TRD v1.2. Merely newer REVIEW_REQUIRED packs were not promoted by this review.

Reference-branch verification used `git show`, not checkout or merge. The decisive module contracts were ACC file 01 §§7.1–7.2 and §10, file 17's consumer/governance dependencies, and AST file 01 §§5.2, 5.7–5.8, 6, file 04 custody-support interface and file 05 custody-support schema/index. Their task manifests remain NOT_ACCEPTED. Their prior ACCEPT review outcomes do not decide DEC-015 compatibility.

Adversarial checks below are **document-level state and accounting walkthroughs**, not runtime tests or provider capability tests. No provider was contacted, selected or credited with an unproven capability. This is a review against repository architecture and its stated evidence gates, not an external legal opinion.

### Preflight

`git fetch origin --prune` completed. `git status --short` was empty; branch was `main`; HEAD and origin/main both matched the required full SHA. The ten-commit log and reviewed commit stat matched the requested history: `b47deaa` draft → `f9538b0` R1 review → `5fcf43b` v0.2 → `b9e8277` R2 review → `642597a` v0.3. No reset, stash, clean, amend or overwrite was used.

## 2. Verdict and acceptance consequence

**REMEDIATE. DEC-015 v0.3 is NOT suitable for human acceptance.**

Eight material findings remain: **one HIGH and seven MEDIUM**. Three LOW findings are non-blocking. No BLOCKER severity is assigned: these are proposed-architecture defects, not demonstrated production incidents.

The principal improvements are real: new-placement eligibility is separated from servicing; outages no longer erase resources; custody indicators no longer determine legal classification; requester-owned holds and a provider-registry seam are defined; raw evidence and write-ahead intent are required; X1–X7 contain balanced journal pairs. Those improvements do not resolve the contradictory exit gates, hold workflow, source-account guards and closure attestation assumptions identified below.

HD-DEC015-01 and HD-DEC015-02 are **OPEN / SAFE TO DEFER** with their stated dependency gates. Neither human choice is needed to identify or correct these defects. Accordingly the verdict is REMEDIATE, not HUMAN_DECISION_REQUIRED. HD-DEC015-03 remains **NOT REQUIRED**.

## 3. Round-2 closure matrix

Each row compares the original evidence in `04-review-r2.md` §4, the corresponding claim in `05-remediation-r2.md`, and the actual v0.3 rules. Closure is scoped to the original finding; it is not a blanket acceptance of the surrounding feature.

| Round-2 finding | Classification | Independent result |
|---|---|---|
| DEC015-R2-F01 | **PARTIALLY_REMEDIATED** | Rule A/B and the normal cutover sequence fix the same-custodian placement deadlock. Distressed exit still requires approved/verified gates; termination conflates relationship end and claim resolution. R3-F01/F02/F08. |
| DEC015-R2-F02 | **CLOSED_BY_V0.3** | §§16.8, 17.2, 17.7 preserve last verified resources, distinguish uncertainty from an evidenced shortfall, and separate client-specific from pool-wide restrictions. Outage/staleness alone cannot authorise X6. |
| DEC015-R2-F03 | **PARTIALLY_REMEDIATED** | §§13.2–13.4 and EV-34 remove the legal presumption and preserve unconditional technical prohibitions. CUS-REQ-026 still conflicts with the assessed-participation route: non-blocking R3-F09. |
| DEC015-R2-F04 | **PARTIALLY_REMEDIATED** | §35.8 defines the intended five-way split, but §§18.2, 25.1, 31.1, 32 and R6 still conflict over hold owner, conversion and release. R3-F03. |
| DEC015-R2-F05 | **CLOSED_BY_V0.3** | §§11, 36.4–36.5, D-1 and §58 keep VA identity/lifecycle behind an explicit owner-pending registry; DEP consumes attribution. No new top-level module is silently created. |
| DEC015-R2-F06 | **PARTIALLY_REMEDIATED** | §17.9 explains pool containment and protects unrelated clients, but its missing-configuration default imposes a cross-pool recovery hold without first evidencing authority to impose that hold. R3-F04. The prior review's suggested default is not accepted merely because it was implemented. |
| DEC015-R2-F07 | **CLOSED_BY_V0.3** | §§9.3, 17.2 and 17.5 classify unexplained excess as an unknown-owner claim; X4c is limited to proven fee payable, not excess. |
| DEC015-R2-F08 | **PARTIALLY_REMEDIATED** | Raw evidence, transport-attempt separation, conflict quarantine and downstream idempotency are corrected. A stable parent object reference does not make the fallback fingerprint event-unique. R3-F05. |
| DEC015-R2-F09 | **CLOSED_BY_V0.3** | §56 explicitly connects HD-01 to ownership masters/step 6 and HD-02 to AST disposition/PLAN_READY; masters may retain explicitly OPEN seams. |
| DEC015-R2-F10 | **CLOSED_BY_V0.3** | §31.3 rule 6 and §46.4 always record a real fill/obligation even if routing becomes inactive. Denial occurs at routing/instruction, not suppression of executed reality. |
| DEC015-R2-F11 | **CLOSED_BY_V0.3** | §18.3 rule 7 and §35.8.3 require committed intent/outbox before send, record attempted execution before routing, and forbid blind retransmission. Non-idempotent-provider detail remains LOW R3-F11. |
| DEC015-R2-F12 | **CLOSED_BY_V0.3** | All X1–X7 pairs, X4 variants, recall/deficit, recovery, exception and excess journals balance per book/asset. The §17.2 identity now includes deficit and both signs of Pool Exception. This does not certify the conflicting movement gates or migration example. |
| DEC015-R2-F13 | **PARTIALLY_REMEDIATED** | FI-ACC-5 now names the missing drain items. §51.5 does not establish how an LED journal watermark proves completeness/fencing of independently owned non-ledger facts. R3-F07; fee close-out also encounters R3-F06. |
| DEC015-R2-F14 | **CLOSED_BY_V0.3** | §§9.6.3–9.6.5 explicitly reject 600+400 funding of a 1,000 order. S-1…S-9 are requirements for a future controlled change, not enablement. |
| DEC015-R2-F15 | **CLOSED_BY_V0.3** | §20.10 and BNK-REQ-052…056 require evidenced source/timing/cap/consent authority; entitlement alone cannot authorise a debit. R3-F06 is a separate source-reservation defect. |
| DEC015-R2-F16 | **CLOSED_BY_V0.3** | §19.5 and LPC-REQ-066…070 record involuntary corporate collateral use, classify a receivable only on a valid basis, otherwise retain corporate loss, and prohibit ordinary-course client funding. |
| DEC015-R2-F17 | **CLOSED_BY_V0.3** | Informational disposition verified: descriptive fields remain stale but there is no mandatory review-time manifest transcription. NOT_ACCEPTED is correct. Closure here means the governance disposition is accepted, not that v0.1 descriptions were rewritten. |
| DEC015-R2-F18 | **CLOSED_BY_V0.3** | §27.2 and §35.7 give PAY the dispute lifecycle; §16.7 defines all eight freshness dimensions with operation-specific denial. |

**Totals: 12 CLOSED_BY_V0.3; 6 PARTIALLY_REMEDIATED; 0 NOT_REMEDIATED; 0 SUPERSEDED_BY_NEW_FINDING.**

## 4. Blocking Round-3 findings

### DEC015-R3-F01 — HIGH — The distressed-exit path still requires normal approval/verification

- **Document/sections:** STR-04 §10.2.1 L696–702; §13.5 L1037–1043; §13.6 L1071–1072; §16.3 L1178–1186; §35.6 L2883–2894; §52. AST file 01 §§5.2, 5.7–5.8; file 05 L738–757, L809. Master Workflow Map v1.3 WF-19 §§23.2–23.4.
- **Evidence:** Every wind-down outflow remains subject to §16.3; that requires VERIFIED, COVERED and an ACTIVE operation rail. §35.6 additionally requires the shared WF-19 record to be `approved`. WF-19 can instead be `suspended` or `terminated`. WLT must still obtain WITHDRAWAL_MB_PSO eligibility, whose C6 requires an APPROVED custody row. The distressed sequence says the old row **is not withdrawn** while it is the only return path.
- **Counterexample:** Old custodian loses new-business approval; WF-19 is suspended, the arrangement is REVERIFICATION_DUE, or its AST row is already WITHDRAWN; no successor exists. A return is legally permitted and the provider can process it with authenticated evidence. Rule B says return-only, but the unchanged approval gates deny it. Retaining an approval is not a solution to an approval that has already been withdrawn or cannot truthfully be retained. Conversely, insolvency or a legal prohibition cannot be cured by putting a location into WIND_DOWN.
- **Risk:** Assets can be unnecessarily trapped, or implementers may bypass normal security/eligibility gates informally to honour the claimed exit guarantee. The categorical claim that exit is always available is unsupported.
- **Required correction:** Define a governed, operation-specific exit authorisation and its exact interaction with WF-19, arrangement verification, coverage exceptions, rail activation and AST/WLT. Distinguish new-business approval, lawful exit authority, actual provider ability and unresolved recovery claims. Preserve authentication, destination, AML, maker-checker, allocation, anti-preference and applicable legal restrictions. Prove the already-withdrawn/no-successor case, not only planned cutover. Where movement is impossible, report a blocked recovery claim without promising movement. Re-evaluate FI-AST-6 against that corrected contract; no choice of HD-02 is made here.
- **Blocks HUMAN ACCEPTANCE:** **YES**.

### DEC015-R3-F02 — MEDIUM — Relationship termination is conditional on resolving every asset claim

- **Document/sections:** STR-04 §10.2.1 L687–694; §13.5 Rule B; §13.6 L1071 and diagram L1091; §40 rows 28/52. Compare CUS-REQ-007/-083 and BNK-REQ-077/-080.
- **Evidence:** TERMINATED requires every asset returned/migrated, a provider-authenticated zero and clean reconciliation. The planned exit ends the old relationship only at that point. The terminal-state row assumes “no assets”.
- **Counterexample:** The contract and operational relationship end after insolvency, but an administrator recognises a disputed claim of 100 and the failed provider can no longer issue a zero statement. An economic claim can survive indefinitely after operational termination.
- **Risk:** A terminated relationship remains falsely represented as servicing/winding down, or a claim must be written off/relabelled merely to reach a lifecycle endpoint. Neither accurately represents stranded client assets.
- **Required correction:** Separate operational relationship termination from location drain and economic-claim resolution. Retain amount/asset, claimant, debtor/administrator, evidence age, recovery status and unresolved exposure after termination. Neither a write-off nor a provider-zero fiction may be a prerequisite to recording operational reality. Do not imply a terminated/inaccessible provider can execute transfers.
- **Blocks HUMAN ACCEPTANCE:** **YES**.

### DEC015-R3-F03 — MEDIUM — Hold ownership and release/transition rules remain contradictory

- **Document/sections:** STR-04 §18.2 L1737–1743; §18.3 L1760–1787; §25.1; §31.1 L2561; §32 L2637–2638; §34.2 R6; §35.8.2 L3030–3035; §37.1.
- **Evidence:** The requester is the sole hold owner, including place/extend/release/convert in §35.8.2. Yet §31.1 includes hold instructions under WDR; §32 has WDR release/reduce an order's hold; R6 labels the hold instruction WDR-owned; the Spot sequence gives WDR “convert hold → payment”. §32 releases the internal 400 before provider release, contrary to §18.3 rule 5. §18.2 also rejects any hold instruction unless the reservation is RESERVED and has no live hold instruction, which cannot literally govern extension/release/conversion of a BOUND or EXECUTION_UNKNOWN hold.
- **Counterexample:** OMS owns reservation R, 600 of 1,000 fills and the remainder is terminal. Following §32, LED exposes 400 before provider confirmation and WDR acts on OMS's hold. Following §35.8/§18.2 instead, the adapter rejects WDR or rejects the non-RESERVED reservation. An extension needed during unknown execution is likewise denied by the generic predicate.
- **Risk:** Two competing instruction owners, prematurely reusable balance, or unreleaseable/unrenewable holds. Shared credentials do not resolve business authority.
- **Required correction:** Make every flow/table agree on one requester-owned hold lifecycle. Define per-action legal states and idempotency identities; distinguish initial placement from extend/release/consume. Define the single authorised conversion handoff into a WDR payment without creating a second hold owner. Provider-confirmed release/reduction must precede internal availability; RELEASE_PENDING_PROVIDER is not released balance. Fix the examples and R6, not only the ownership summary.
- **Blocks HUMAN ACCEPTANCE:** **YES**.

### DEC015-R3-F04 — MEDIUM — Missing configuration creates an unevidenced cross-pool recovery hold

- **Document/sections:** STR-04 §17.9 L1650–1659 and rules 1/5; §17.5; EV-31/EV-35.
- **Evidence:** §17.9 automatically restrains value leaving all of the deficit client's other pools/assets/subaccounts while the deficit exists: “Missing configuration ⇒ the hold applies”. A contractual basis is expressly required for application/set-off, but not as a prerequisite to imposing the cross-pool hold itself. Missing configuration also supplies no scope/amount/duration/release policy.
- **Counterexample:** A's deficit is in X; A has fully backed, unrelated property in Y under an agreement with no evidenced recovery-restraint right. B's assets in X may also be fully backed following restoration. The rule still imposes an unbounded Y hold because configuration is missing.
- **Risk:** Trapped legitimate property and an unsupported recovery power. Maker-checker alone does not establish authority. This review does not conclude whether a particular agreement or law grants such authority; the defect is assuming it before evidence exists.
- **Required correction:** Require evidenced legal/contractual or specific lawful emergency authority **for the hold itself**, with purpose, scope, cap, duration, review/escalation and release criteria. Missing evidence may deny new risk-taking and trigger assessment; it cannot silently manufacture a cross-pool recovery right. Keep distinct the justified pool anti-preference block, the deficit client's operational restrictions, and any separately authorised cross-pool restraint/set-off.
- **Blocks HUMAN ACCEPTANCE:** **YES**.

### DEC015-R3-F05 — MEDIUM — The semantic fingerprint can collapse distinct events sharing a parent reference

- **Document/sections:** STR-04 §35.7 L2924–2950; §40 row 6; STR-04A BNK-REQ-034/-057, STR-04B CUS-REQ-085, STR-04C LPC-REQ-070.
- **Evidence:** The fallback hashes stable object/reference, type, amount, asset, direction, account, value date and counterparty. Ambiguity handling is triggered only when **neither** event ID **nor** stable object reference exists. It does not require that the object reference identify a unique economic occurrence.
- **Counterexample:** Two genuine USD 100 partial settlement events reference the same parent payment/order, on the same value date with the same remaining fields, and lack event IDs. Both satisfy the fallback with a stable object reference; the second becomes a delivery attempt and is never routed. Downstream idempotency cannot restore an event ingress discarded. A parent reference is not a fill/leg/event identity.
- **Risk:** Lost financial evidence, understated receipts/liabilities and inconsistent settlement state. Provider MUST requirements reduce admissible live configurations, but the normative fallback still authorises silent collapse of malformed or unsupported events.
- **Required correction:** Namespace native event identity by provider/tenant-arrangement/environment/feed as appropriate; specify provider-profile uniqueness semantics. Accept a fallback as canonical only when its discriminator is proven unique per economic occurrence. Quarantine ambiguous equal fingerprints even when a stable parent reference exists; resolve from authoritative statement/transaction sequence evidence. Treat missing required IDs as a contract breach, not proof of duplicate delivery. Preserve raw attempts and downstream idempotency.
- **Blocks HUMAN ACCEPTANCE:** **YES**.

### DEC015-R3-F06 — MEDIUM — Client-entitlement reservation is imposed on pool-level fee and suspense outflows

- **Document/sections:** STR-04 §9.3 L498–505; §9.6.3 L568–575; §16.3 L1168–1173; §16.4 X2; §20.4 L1988–1997; §21.4; §35.8.2 L3026–3033; FI-ACC-5 L4013.
- **Evidence:** Every fee sweep and return must name S × A × P and reserve against S's available entitlement. The instruction-class gates are explicitly “in addition to §16.3”. X2 instead debits pool-level AIX Fee Payable, which deliberately has no subaccount. Unmatched receipts sit in pool suspense without an identified S.
- **Counterexample:** S deposits 1,000, pays 990 in settlement and earns a disclosed fee of 10. After X1, S's entitlement is zero, pool resource is 10 and fee payable is 10. X2 is economically funded and properly authorised, but §16.3 cannot reserve 10 from S. An own-pool close-out waits for that impossible sweep. An unidentified receipt similarly cannot satisfy an S-entitlement reserve before return-to-source.
- **Risk:** Trapped funds/closure deadlock, or an implementation invents a client entitlement, debits the client twice, or bypasses reservation/coverage controls to make the flow work.
- **Required correction:** Define source-account-specific reservation/encumbrance and conservation rules for client entitlement, pool fee payable, suspense/exception returns and corporate funding. Keep pool selection, evidence, authority, segregation and duplicate-spend checks. X2 must consume the payable once, without re-reserving client funds; a suspense return must consume its identified suspense item without fabricating a subaccount balance. Align closure and instruction-intent fields with legitimate pool-level operations.
- **Blocks HUMAN ACCEPTANCE:** **YES**.

### DEC015-R3-F07 — MEDIUM — The sole-attester claim does not establish completeness of non-ledger closure evidence

- **Document/sections:** STR-04 FI-ACC-1/5, §§51.3–51.5 L3987–4043; §36.1 ownership table. ACC file 01 §7.2 L267–309, DCR-ACC-LED-01c and DCR-ACC-CONS-01.
- **Evidence:** §51.5 says registry close-out, hold-release and REC break facts “reach LED-01 as governed state” and that LED's journal watermark then covers them. ACC requires commit-ordered evidence, the pinned pre-seal watermark, apply-time recheck, in-flight fencing and post-barrier open-item checks. The original authorities remain registry/WLT/requester/WDR/REC, not LED. §51.1 also still says additional attesters are needed, whereas §§51.3/51.5 prefer LED alone.
- **Counterexample:** The registry or REC commits a target-affecting close-out failure/break after sending its prior clear state, but publication to LED is delayed. LED can present the same journal watermark and zero locally known open items at seal and post-barrier checks. Its financial journal has not changed. “Received as governed state” alone does not prove that no upstream work or delivery remains.
- **Risk:** A subaccount can be represented as fully drained while an external hold, resource allocation, break or instruction remains unresolved. Pool Exception is necessary for genuinely late external events, but is not a substitute for proving known pre-seal work was drained/fenced.
- **Required correction:** Specify original fact authority and a verifiable closure handoff: source acknowledgements/watermarks, outstanding-intent/event delivery completeness, target/cycle binding and barrier/fencing rules, or equivalent atomic guarantees. Make non-financial governed transitions participate in the attester proof, rather than asserting a financial journal automatically covers them. LED may aggregate these proofs; it must not become the original authority for every external state. Alternatively use pinned independent attesters that satisfy the existing ACC contract. Deny readiness when any required evidence is missing/stale/ambiguous.
- **Blocks HUMAN ACCEPTANCE:** **YES**. This requires a DEC-015 contract correction; it does not by itself require an ACC schema change.

### DEC015-R3-F08 — MEDIUM — Failed/partial migration leaves a contradictory source-pool entitlement

- **Document/sections:** STR-04 §13.6 L1062–1064; §17.4 L1496–1526; §40 row 53 L3430; §48 custodian-exit test row.
- **Evidence:** §13.6 introduces an in-flight migration leg; §17.4 says a provider-confirmed departing leg is no longer a claim on the source pool. Row 53 instead says entitlement stays at the departing pool until authenticated receipt at the successor, including partial/uncertain exit transfers. The test row repeats that a failed exit leaves entitlement at the departing pool.
- **Counterexample:** Old custodian confirms 100 debited; successor confirms 60 and the remaining 40 is in transit/disputed. Keeping the full 100 as a claim on the old pool until complete receipt misstates location and source-pool coverage; crediting 60 without consuming the corresponding source/in-flight slice duplicates a claim. A failure before debit is a different case and should retain the old entitlement.
- **Risk:** False safeguarding location/shortfall reporting or double allocation during the very exit procedure intended to preserve assets.
- **Required correction:** Distinguish not sent, send unknown, confirmed source debit, partial destination receipt, destination failure and confirmed return. Transfer each evidenced slice from source allocation to a separately reported in-flight migration claim, then to destination allocation only on receipt; conserve the client claim throughout. Do not count a transit claim as a qualifying pool resource without the separately validated basis. Align row 53, the example and future tests.
- **Blocks HUMAN ACCEPTANCE:** **YES**.

## 5. Non-blocking findings

### DEC015-R3-F09 — LOW — CUS-REQ-026 retains an absolute key-material exclusion

- **Document/sections:** STR-04B §2.3 CUS-REQ-026 versus §2.3A/CUS-REQ-070 and STR-04 §13.4.3.
- **Evidence:** CUS-REQ-026 requires “no client key material ever exposed to AIX”; §2.3A allows disclosed non-unilateral participation after EV-34 clearance. A non-controlling MPC share is key material in the latter analysis.
- **Risk:** A provider can pass the intended assessment route and still fail an unconditional procurement MUST; no unsafe provider is thereby admitted.
- **Required correction:** Align the credential/key-material wording with the approved control-facet model, distinguishing signing secrets under AIX unilateral control from disclosed assessed non-controlling participation. Do not weaken the AIX-alone prohibition.
- **Blocks HUMAN ACCEPTANCE:** **NO**; conservative eligibility inconsistency, not a legal-custodian presumption or unilateral-control permission.

### DEC015-R3-F10 — LOW — Proposed decision summary omits a coverage term

- **Document/sections:** STR-04 §57 I L4427–4429 versus §17.2 L1392–1396; also §54 Q7 versus X7.
- **Evidence:** The proposed binding summary lists entitlement, suspense and excess but omits `PoolException_credit`, which the canonical formula correctly includes. Q7 says only X1/X2 can move client money to treasury, although authorised X7 recovery is also enumerated.
- **Risk:** Copying the abbreviated text alone into the later decision record loses part of the intended claim universe / permitted-event enumeration.
- **Required correction:** Carry the complete canonical formula, or incorporate it unambiguously by reference; align Q7 with X1–X7. Do not treat a post-seal inflow as ownerless surplus.
- **Blocks HUMAN ACCEPTANCE:** **NO** for the architecture: §17.2 and §16.4 already supply the correct controlling rules. Correct the transcription before publishing the eventual accepted decision text.

### DEC015-R3-F11 — LOW — No-idempotency provider recovery needs an explicit operational profile

- **Document/sections:** STR-04 §§35.8.3, 37.1 and §40 row 56; STR-04A BNK-REQ-046.
- **Evidence:** Provider idempotent submission is SHOULD, but recovery examples query by the idempotency key. The generic no-blind-resend rule is sound; it does not describe what authoritative correlation/query evidence is available when the provider does not honour that key.
- **Risk:** An uncertainty case can remain unresolved or operators may overestimate what an idempotency key proves. The architecture does not currently authorise blind resubmission.
- **Required correction:** Before activating such a provider/class, document single-flight sending, query/statement correlation, authoritative non-execution evidence, duplicate-risk limits and manual escalation. If safe resolution cannot be proven, remain UNCERTAIN and do not resend/release. Explicitly distinguish provider-idempotent retry from a non-idempotent resend.
- **Blocks HUMAN ACCEPTANCE:** **NO**; existing fail-closed uncertainty rules prevent an authorised unsafe retry. Required before activation of a non-idempotent profile.

## 6. Custodian exit, resource state and containment walkthroughs

| Scenario | Independent result |
|---|---|
| Normal Option-A migration | Works at the eligibility level if ordinary arrangement/WF-19 gates remain satisfied: old location WIND_DOWN blocks new placements; successor becomes the sole approved new-placement custodian; Rule B permits old-location exit. A short planned instrument-level gate gap is explicit. R3-F08 still needs correction for migration accounting. |
| Suspended/de-approved old provider, legally permitted return | Not generally proven. Provider inability/legal prohibition must deny; a new-business suspension alone must not accidentally deny a separately authorised return. R3-F01 identifies the unresolved gate composition. |
| Insolvent/inaccessible custodian | SUSPENDED records inability; a deadline/escalation does not make assets movable. Keep last evidence and stranded claims. R3-F02 requires truthful terminal relationship and unresolved recovery states. |
| API outage with last verified USD 1m | Verified amount remains 1m. Movement needing a fresh read denies; safeguarding can stay COVERED while its own freshness policy holds, then UNDETERMINED. No automatic loss or X6. |
| Stale evidence | UNDETERMINED for an evidence gap, not a fabricated SHORTFALL. An already authenticated, evidenced shortfall is not erased merely because that observation later becomes stale. |
| Client A garnishment | Block A's identified amount; retain both its entitlement and its backing. B–Z are not arithmetically made unbacked. |
| Whole-pool legal order | Preserve existence, deny restricted movements, assess scope/priority under EV-32. UNDER_ASSESSMENT is uncertainty; an evidenced restriction defeating client backing can reduce qualifying resources and create a real classified coverage shortfall. |
| Client entitlement 1,000; rail temporarily unavailable | Entitlement remains 1,000; usable movement capacity can be zero. Neither display nor bookkeeping should erase the claim. |
| Recall after A spent its deposit | A/B each begin with 1,000 and pool resources 2,000. A's 1,000 settlement leaves resources 1,000 and B's claim 1,000. A's recalled 1,000 then leaves resources 0, B's claim 1,000 and a separate A deficit 1,000: SHORTFALL 1,000. The deficit never nets against B. |
| Restore the preceding actual shortfall | Only after classification, EV-35 and separate approval: X6 adds 1,000 pool resource and discharges the pool's deficit receivable; corporate cash decreases and the evidenced corporate recovery claim increases. B is backed again; A gains no available entitlement. No restoration follows solely from outage/staleness/rail suspension/client-specific order. |
| A has unrelated assets in pool Y | Y is not economically short merely because A owes X. A's cross-pool recovery restraint needs its own authority and bounded policy: R3-F04. |
| Unexplained excess | Dr Pool Resource / Cr Unallocated Excess; unknown ownership remains on the claims side. It cannot fund a deficit or be swept as AIX's property just because arithmetic shows excess. |

Coverage is per asset and resource pool; legal-pool and aggregate views do not make resources interchangeable. Pool-level anti-preference blocks are distinct from client-specific restrictions. No unrelated client's resources may repair A's deficit.

## 7. Custody control and provider/VA ownership

The v0.3 control model passes the core R2 test: K1–K17 record actual powers; the absence of a complete key is not treated as proof of non-custody. CONTROL_ASSESSMENT_REQUIRED blocks third-party eligibility/live locations until EV-34. Legal classification is not inferred from participation. AIX-alone reconstruction, movement, recovery to itself, control bypass or policy change enabling unilateral movement remain prohibited irrespective of a favourable assessment. The residual procurement inconsistency is R3-F09.

The provider/resource registry is an explicit architectural abstraction with an unresolved placement, not an authorised new top-level module. Shared provider identity/DD/WF-19 facts, product/rail arrangement facts, legal holding facts and client/location assignments are distinct. The VA registry sub-question is explicitly part of HD-01. DEP consumes VA-to-client/subaccount/pool attribution; LED owns allocation/reservation/accounting; WDR consumes outbound mapping; WLT owns destination/address eligibility; REC compares registry/evidence. A VA that is itself a pool needs one lifecycle authority, not competing DEP and arrangement state machines.

## 8. Provider-instruction responsibility test

For every outbound instruction, the **lifecycle/instruction owner** must commit durable intent/outbox; the adapter authenticates the service identity/class/arrangement, validates its authority and executes using SEC/FND-governed KMS credentials. LED is accounting authority; REC reconciles independently. An inbound notice is not automatically an instruction. The following is the intended §35.8 contract; R3-F03/F06 identify where other normative sections contradict it.

| Class | Business purpose / authorisation | Durable intent and resulting lifecycle | Accounting / execution / reconciliation |
|---|---|---|---|
| Spot cash hold | OMS order; LED reservation, purpose and identity/class gate | OMS/requester; requester alone place/extend/release/convert, subject to corrected conversion handoff | LED binding; bank adapter; R6/R14 |
| OTC cash hold | OMS/requester order resources; TRD owns execution/orchestration, not a second hold | Requester as recorded on reservation | LED; bank adapter; R6/R14 |
| Custody asset hold | The product reservation requester and evidenced custodian hold capability | Requester, with custodian-side policy/approval | LED binding; custodian adapter; R6 |
| Client withdrawal | WDR; WLT verify-and-consume, AML, IAM and capability gates | WDR; also requester for its own hold | LED reserve/post; adapter; movement/hold reconciliation |
| Pay payout/refund | PAY business decision and dispute/product controls | WDR transfer, PAY business lifecycle | LED; payment adapter; R10/R11 |
| RWA subscription/distribution | RWA-03/04; offering's role-based settlement party and approvals | WDR external transfer; RWA business lifecycle | LED; adapter; obligation/transfer reconciliation |
| Fee sweep | FEE collection decision plus COLLECT_DISCLOSED_FEE scope/timing/cap | WDR, pool-level transfer; source guard must be corrected under F06 | LED payable/X2; adapter; R8/R14 |
| Custodian migration | Arrangement owner exit plan; Rule B/EV-15/25, destination controls, maker-checker | WDR per-client exit transfer | LED source/in-flight/destination allocation; custodian adapter; R15 |
| Provider freeze notice | Arrangement/resource owner + affected modules + INC; evidence and scope assessment | Ingress evidence then arrangement state; no WDR instruction merely because a notice exists | LED affected blocks/accounting only when instructed; REC independent |
| Legal-order notice | Arrangement/resource owner with Compliance/Legal, client-versus-pool scope | Arrangement owner; WDR owns any actual observed debit, not the legal decision | LED governed consequence; REC; INC if escalated |

Thus WDR is **intended** to own external transfers and observed debits, not every provider interaction. Acceptance cannot rely on that intention while §§31/32/R6 retain the contrary execution path.

## 9. Event ingress, reservations and execution

| Test | Result |
|---|---|
| Duplicate delivery, same immutable event ID | One canonical event; each delivery attempt/raw evidence retained; downstream owner and LED idempotency remain mandatory. |
| Same event ID, different economic payload | Conflict quarantined and alerted, no overwrite/no second ordinary posting. If the first was already posted, correction must follow governed reversal/exception handling, not retroactive evidence deletion. |
| No event ID | Not safe merely because a stable object reference exists: R3-F05. Provider event-ID MUSTs must be enforced, not silently waived by fallback. |
| Out-of-order events | §34.3 requires lifecycle ordering/validation by the owner; ingress does not own business transitions. Invalid/impossible transitions wait for query-back/reconciliation, not timestamp-based state regression. |
| Replayed signed event | Authenticity alone is insufficient; replay controls plus canonical/downstream idempotency prevent another economic action, subject to F05 identity correction. |
| Raw evidence / normalisation | Immutable payload or protected reference, hash, signature/header evidence, provider/received timestamps, provider schema version, canonical schema and normaliser versions persist. Economic fields cannot be silently changed. |
| Internal reserve succeeds, provider hold fails | HOLD_FAILED; no execution; governed release. |
| Provider hold succeeds, local bind fails | ORPHAN_HOLD/RECONCILE_REQUIRED; preserve external evidence; no execution; governed verified release. |
| Provider hold disappears / is unknown | HOLD_LOST/uncertainty, protected internal amount, query/re-hold/escalation. Never interpret unknown as released. |
| Hold release fails | RELEASE_PENDING_PROVIDER; internal balance stays unavailable. §32 must be corrected to conform. |
| Hold expiry before execution | Stop progression inside safety margin; renew/re-hold or governed expiry only when no attempt exists. |
| Hold expiry after attempt / unknown fill | Protect the reservation; renew/re-hold, otherwise controlled HOLD_LOST exception; no timer release. Per-action adapter predicates need F03 correction. |
| Crash before send | Durable intent survives. Retry is safe only if non-transmission is proven or provider idempotency makes resubmission safe; a sender crash is not itself proof no network request escaped. |
| Send succeeds, response not stored | Intent/attempt exists; UNCERTAIN means possibly executed, not failed. No blind resend. |
| Late fill while unknown | Consume the still-protected reservation. |
| Late fill after authoritative no-fill/cancel | Park exception; no automatic settlement; fresh client resources and governed acceptance required. |
| Duplicate fill | Execution identity plus downstream posting idempotency prevents repeat consumption. |
| 600 at A + 400 at B, order 1,000 | Reject INSUFFICIENT_AVAILABLE_AT_SOURCE. S-1…S-9 do not enable split funding. |

## 10. Accounting, one-leg settlement, collateral and fees

### Journal audit

For an amount q in one asset, each listed journal has equal debit and credit q; the recall example splits its debit into available entitlement plus deficit whose sum equals the full resource credit. Cross-book links join **two separately balanced books**, not a journal whose client debit is balanced only by a corporate credit.

| Event | Client book | Corporate book | Result |
|---|---|---|---|
| X1 earned fee | Dr entitlement / Cr fee payable | Dr fee receivable / Cr revenue | Balanced; no external movement |
| X2 sweep | Dr fee payable / Cr resource | Dr cash / Cr fee receivable | Balanced completed-transfer example; execution/source guard F06 remains |
| X3 refund after sweep | Dr resource / Cr entitlement | Dr revenue or refund expense / Cr cash | Balanced; before-sweep refund reverses both X1 journals |
| X4a AIX-borne charge | Dr receivable from AIX / Cr resource | Dr provider expense / Cr payable to pool | Balanced; receivable is not qualifying resource |
| X4b reimbursement | Dr resource / Cr receivable from AIX | Dr payable to pool / Cr cash | Balanced; externally evidenced |
| X4c use proven unswept AIX fees | Dr fee payable / Cr receivable from AIX | Dr payable to pool / Cr fee receivable | Balanced at same pool/asset; not unidentified excess |
| X5 compensation | Dr resource / Cr entitlement | Dr compensation expense / Cr cash | Balanced; approved AIX error case |
| X6 restoration | Dr resource / Cr client deficit | Dr evidenced exposure receivable from S / Cr cash | Balanced; no entitlement/buying-power credit |
| X7 recovery | Dr S entitlement / Cr Q resource | Dr cash / Cr receivable from S | Balanced; authority and S's resources only |
| Recall exceeding entitlement | Dr entitlement + Dr deficit / Cr full resource debit | None | Balanced; no negative entitlement |
| Pre-X6 recovery | Dr resource / Cr deficit | None | Balanced |
| Unattributable outflow | Dr Pool Exception / Cr resource | None | Balanced; not silently allocated to another client |
| Unexplained excess | Dr resource / Cr unallocated excess | None | Balanced; ownership unproven |
| §19.5 collateral application/classification | On delivered asset: Dr resource / Cr blocked Pool Exception; release: Dr exception / Cr entitlement | Dr pending collateral application / Cr venue prefunding; then Dr valid receivable **or** loss / Cr pending classification | Each stage balanced; no automatic client credit |

These are canonical categories, not a complete implemented chart of accounts. Asynchronous send/receipt, reversals, partials and multiple assets still require per-leg balanced journals and transit/clearing evidence in later LED work; the completed X2 example cannot be booked as corporate cash before destination-credit evidence (§20.10.4). STR-04's state walkthroughs are not a licence for unbalanced `balance += amount` postings. §17.2's pool identity includes debit/credit Pool Exception, deficit and receivable categories; its coverage rule deliberately excludes receivables as backing.

Cash-first buy and asset-first sell both retain an in-flight claim on the obligation, with counterparty, asset due, client/subaccount, age/window, settlement state, exposure limits, reporting and claim-holder/loss-bearer evidence (§§17.4, 31–33; EV-07/29/30/31). Once the departing leg is confirmed, the pool resource and pool entitlement decrease together; unreceived countervalue does not become qualifying pool backing. An overdue/defaulted leg stays an exception and visible exposure. Migration must follow equally precise per-slice semantics (F08).

If an LP defaults after client cash delivery, there is no automatic write-down, unrelated-client substitution or corporate cover. If the LP involuntarily seizes AIX collateral, §19.5 records a corporate exposure and blocks any delivered asset in Pool Exception. A client receivable needs a valid contractual basis; otherwise the loss stays corporate. LPC-REQ-066 expressly requires evidence of whether collateral application discharges the external LP obligation: later resolution must preserve that fact and avoid paying an already discharged obligation again. Recording an involuntary event does not authorise ordinary-course financing.

Fees follow the actual earning event and disclosed policy. Partial fills charge only the earned amount; failed/unexecuted activity does not make unearned fees corporate property. Amounts above the approved maximum need new client authority or AIX absorption. COLLECT_DISCLOSED_FEE is independently evidenced by source, timing, maximum and consent; its absence requires a configured invoice/client-payment route or denial of fee-bearing activity. A failed/uncertain sweep retains a payable/receivable and open transfer/uncertainty state; no corporate cash receipt is invented. The pool-level payable avoids a subaccount fee object, but F06 currently defeats the intended close-out route.

## 11. ACC-01 compatibility and closure

**Classification: DEC015_COMPATIBLE_FUTURE_INTEGRATION_ONLY.** This is a structural compatibility assessment, conditional on correcting DEC-015 F06/F07; it is not acceptance of the current sole-attester claim.

ACC owns structure/status/barriers, not balances or provider master data. Its existing contract supports a pinned, authenticated attester set and commit-ordered evidence. The review finds no necessity to put external financial state in ACC or redesign its schema. LED can be an **aggregation attester** only with verifiable evidence from the actual owners. Alternatively, separate attesters can satisfy the existing contract. A timestamp or cached “closed” flag alone is insufficient.

| FI-ACC-5 item | Required closure treatment / owner |
|---|---|
| Client Deficit | Pre-seal readiness must show no outstanding subaccount deficit; governed recovery under CDA-4. Post-seal late facts go to pool exception/legal-entity attribution, never a sealed subaccount posting. |
| Unexecuted active reservation | Requester cancellation/release before initiation; no live provider hold left. CDA-5 is currently empty, so any alternative drain activity needs an explicit governed list change. |
| Attempted reservation / unknown execution | Resolve before initiation; no timer release. Any real fill is recorded; already-open obligations drain through CDA-3. |
| Provider holds incl. orphan/lost/release-pending | Authoritative resolution, release/consumption evidence and no unresolved live hold at readiness; requester/provider authority cannot be replaced by LED inference. |
| Settlement obligations / exceptions | CDA-3/CDA-4; no unresolved required leg/exception at seal. |
| Pending deposit | Confirmed-unposted events drained/accounted; recall windows elapsed or exposure governed. Unknown expected receipts are not invented balances. |
| Pending withdrawal | CDA-2, or closure-bound own-name balance return under CDA-1. |
| Fee payable / sweep | Pool-level item; a single-subaccount pool cannot close externally until cleared. F06 must make that sweep possible without a subaccount entitlement. |
| Financial reconciliation break | REC is original break authority; CDA-4 correction via owning module/LED. F07 requires complete current proof. |
| Unresolved external allocation / suspense | Resolve attributable amounts before readiness; do not erase an unattributed claim to close an account. |
| VA/location close-out, address retirement, exit transfer | Registry/WLT/provider facts must be evidenced and fenced. Non-own-name migration is not automatically CDA-1; initiation waits or governed abort applies. |

FI-ACC-6 is independently confirmed: file 17 DCR-ACC-GOV-01 provisionally names DEC-015 for ACC's design decisions. Renumber that provisional reference at ACC's next controlled revision; do not renumber this platform decision or invent the next free number now. The earlier §51.1 additional-attester wording should be aligned with the chosen attestation route.

**Revision required:** no structural ACC revision established by this review. FI-ACC-6 text correction is required at the next controlled revision; a CDA-5 fallback would require an explicit list amendment. ACC-RF-01/IAM entitlement and peer-authentication dependencies remain external gates, not closed by DEC-015. Neither ACC acceptance nor PLAN_READY is set.

## 12. AST-01 compatibility and HD-02

**Classification: DEC015_COMPATIBLE_FUTURE_INTEGRATION_ONLY**, with the **current v0.3 claim of universally safe exit rejected under F01**. This classification means the Option-A model need not inherently change AST's data model; it does not mean every v0.3 exit sequence is complete.

Independent schema evidence: `custody_support` has separate immutable `deposit_supported` and `withdrawal_supported` booleans, PROPOSED/APPROVED/WITHDRAWN status, an opaque custodian reference and domain; `ux_ast1_custody_live` permits one PROPOSED/APPROVED row per instrument/domain. Operational deposit and withdrawal state are separate. C6 requires approved support for the capability; WLT must evaluate and consume a fresh withdrawal token.

A normal Option-A cutover can therefore keep one new-placement custodian while old locations service previously held assets under consumer-side wind-down controls. A new AST wind-down status is **not inherently necessary**. The corrected DEC-015 exit contract must, however, prove what happens after the old approval was already withdrawn: for example, whether existing capability-specific support can truthfully represent a separately approved return-only path. No reapproval for **new business** or bypass of AST's instrument/domain rules is implied. If no existing-contract exit route can meet the required distressed scenario, a controlled AST change becomes required; it cannot be dismissed by the present blanket “FI-AST-6 recommended” statement.

**FI-AST-6 disposition:** retain the possible status enhancement as optional for normal Option A, but make proof/disposition of the distressed exit contract **mandatory before AST PLAN_READY** and consuming exit design. Option B inherently requires controlled cardinality/schema/contract revision before PLAN_READY. The choice between A/B is not made here; neither choice fixes F01's WF-19/verification gates by itself.

AST remains owner of instrument identity/classification/eligibility, not client holdings, location verification or custody legal classification. Canonical instrument identity and the MB/PSO versus securities-domain prohibition remain intact. FI-AST-1 and WLT canonical-identity integration remain required. No AST branch file was modified.

## 13. Provider requirements, Pay and production gates

| Pack / area | Independent conclusion |
|---|---|
| Bank/PSP | Requirements cover legal account holder/beneficial ownership, VA structure and enforced debit allocation, client direct authority, set-off/order/freeze scope, enforceable holds/priority, evidence, return-to-source, fee authority, event IDs/raw evidence and wind-down. These are demanded evidence, not proven capabilities. F01/F05/F06 concern internal use; F11 concerns optional submission idempotency. |
| Custodian | Legal role is distinct from technology; control/quorum/recovery evidence, privacy, fees, insolvency and return/migration support are demanded. CUS-REQ-080…084 do not guarantee a failed provider can act, nor solve internal gate conflicts. CUS-REQ-026 needs F09 alignment. |
| LP/OTC | Gross/net basis, set-off/netting scope, default/loss allocation, corporate collateral/margin terms, close-out, recovery, audit, BCP/DR and exit are explicit requirements. No cross-client resource netting or routine collateral-funded client settlement is permitted. A requirement to disclose margin terms does not enable margin trading. |
| Pay | PAY owns collection/refund-dispute/chargeback business state and represent/accept decisions. Ingress authenticates/normalises; DEP/WDR own movement records; LED posts; REC reconciles; INC handles escalation. A debit does not transfer dispute ownership to WDR. |
| Freshness | Provider × resource type × asset/currency × pool/location × operation × risk tier × capability × observation method. The most specific applicable policy wins; absent configuration denies the dependent operation. Spot pre-trade can require a newer read than EOD reporting. No rewrite of economic existence follows merely from age. |
| DEC-013/014 | Build permission, environment availability, operational feature state, asset eligibility and production activation remain distinct. Live routing also needs provider/class/rail controls and secure credentials. UI hiding is not enforcement; inactive routing cannot suppress an already executed obligation. |

CFG-FIND-002, IAM2-FIND-002/-003 and WDR-FIND-001 remain open prerequisites at their recorded triggers. The review does not convert proposed architecture, sandbox build permission or a mock test into live-use approval. Exchange approval evidence remains EV-22; permanent MB prohibitions remain intact.

## 14. Human decisions and future dependency graph

| Decision | Review disposition | Latest safe point / reason |
|---|---|---|
| HD-DEC015-01 | **OPEN / SAFE TO DEFER**; no acceptance blocker by itself | Before Module Index/Workflow/System Rules/master 08 lock provider ownership, unless they expressly retain the OPEN seam and trigger; **mandatory before §56 step 6** and any consuming blueprint/schema depending on that owner. Includes shared identity/DD/WF-19 ownership and VA registry identity/lifecycle/binding. Option D remains a recommendation, not a decision. |
| HD-DEC015-02 | **OPEN / SAFE TO DEFER**; no acceptance blocker by itself | Before AST compatibility disposition and **AST PLAN_READY/schema freeze**, and before any consuming design hard-codes cardinality. Correct F01 and prove the exit contract first. A is one new-placement custodian with old-location servicing; B is concurrent new-placement custodians requiring AST revision. |
| HD-DEC015-03 | **NOT REQUIRED** | No client-financing permission reintroduced. A corporate loss/recovery record is not authority to advance client funds. |

§56's dependency edges are materially improved: review/remediation precede human acceptance; ownership masters may begin **after later human acceptance** with clearly OPEN seams; Module Index precedes ownership-dependent blueprints; masters 08/09 precede rail integration; LED/WLT/registry work consumes DEC-011 and DEC-015 before schema freeze; TRE/FEE and rail work follow; product consumers and E2E come later. All are separately authorised tasks. Nothing downstream starts because this review was committed.

F01/F03/F06/F07 corrections must be consumed consistently by those dependencies; they cannot be deferred as mere implementation details. No master or module was changed in this turn.

## 15. Independent repository search and impact matrix check

Ran a fresh `rg` inventory/search over **1,401 files** under `docs/` and `platform/`, excluding archives, review/acceptance/task history, node_modules/build output, lockfiles and strategy drafts from the current-content pass. All supplied search terms were searched, including broad ledger/balance/settlement/provider terms and the financing phrases. Search hits were then classified against DOCUMENT_REGISTER; the inventory itself includes REVIEW_REQUIRED packs and narrative files and is not a claim that all 1,401 are authoritative. STR-04/04A/04B/04C v0.3 were searched separately, and the ACC/AST reference contracts inspected read-only.

Selected reproducible file-hit counts: client money 51; safeguarding 196; virtual account 6; word VA 3; bank account 23; custodian 67; custody 70; resource pool 1; legal pool 0; Client Deficit 1; provider hold 1; fee sweep 0; custodian migration 0; wind-down 2; chargeback 8; freshness 111. The narrow new-concept hits outside strategy are predominantly register/current-state pointers. Counts are discovery evidence, not proof of absence of every semantic equivalent.

| Current source checked | Material assumption / result | STR-04 impact coverage |
|---|---|---|
| Charter v1.5 §§9.2/9.4, L436/459/925/1043/1338; Module Index v1.4 L128/405/406/534/793/795 | F3-style safeguarding baseline, sole-source wording, named LP, unqualified treasury funding/prefund, non-negative balances | M-08…M-25 and PNF-01/02/05/07; current text must change later, not silently superseded today |
| Workflow Map v1.3 WF-19 §§23.2–23.4, WF-27 | Provider suspended/terminated states, exit-plan duty, closure workflow | M-29/M-48 exist; their **disposition is incomplete** under F01, rather than an omitted document |
| Master 08 v1.2 L201/527, §10.4 | Named LP, stale-hold sweeps, same-transaction outbox | M-35/M-45/M-47; timer sweeps cannot release attempted reservations |
| LED v1.1 §§5.14/5.18/5.22/5.24 and component list L633 | Ordered/idempotent journals, “atomic completion”, live-leg hold pinning, duplicate reconciliation ownership | B-01…B-06/B-25/B-28; accounting guards versus orchestration/reconciliation rebaseline required |
| DEP v1.1 §§5.3/5.22, L143/235/911; WDR v1.1 §§5.7/5.19 and database event enums | VA consumer/open design, governed return-to-source, idempotency/send lock, movement chargeback labels | B-07…B-12/B-29/B-30/B-32; new ingress must preserve downstream dedupe |
| REC v1.1 L266/380 and statement/freshness design | Chargeback reports, period-aligned freshness and completeness | B-31/B-34; detective evidence is not movement authority |
| TRD v1.2 §§5.20–5.24 and TRD1-FR-029/030/036 | Query-back, terminal late-fill exception and coordinated residual release | B-24/B-27; reinforces F03 rather than excusing §32 |
| WLT migration 061; UI public trust copy; INC freeze-consequence tracking | Fiat destination coverage, ambiguous prefund copy, restriction consequence ownership | Existing code/UI rows and PNF-06/10/B-33; not new provider capability evidence |
| Read-only ACC/AST contracts | Closure barrier/attester contract, provisional DEC-015 identifier, C6 and custody-row uniqueness | A-02/A-06/A-07/A-10/A-11/A-12 exist; F01/F07 correct conclusions, not document discovery |

**Material omitted current source of truth: none identified in this independent search.** The important misses are unsafe interpretations of already-listed sources and internal v0.3 contradictions. This is not a claim that old masters already implement DEC-015 or that a keyword sweep proves implementation completeness.

Financing-specific results: no current authoritative permission for a corporate timing bridge, temporary client funding, settlement buffer or corporate cover was found. `advance`/`bridge` discovery hits were code/state advancement or historical implementation/role-bridge narrative; v0.3's financing uses are prohibitions or removed-draft history. Existing unqualified prefund/treasury text is already in the impact matrix and must be qualified in later rebaseline. HD-03 remains NOT REQUIRED.

## 16. Governance, validation and next action

- `task.json` remains unchanged: PLANNING, NOT_ACCEPTED, review count 0 and stale v0.1 descriptions. Tasks README defines the fields but does not mandate transcription merely on review; the MIG-004 acceptance manifest change at `43f2f34` supports the documented acceptance-checkpoint precedent. Descriptive staleness is informational.
- `docs/DECISION_LOG.md` remains unchanged with no accepted DEC-015 entry.
- `docs/OPEN_FINDINGS.md` remains unchanged; R3 findings live in this review. Existing proposed PNF entries are not promoted or closed.
- No `06-acceptance.md` is created. No task state, PLAN_READY, provider activation or implementation permission is changed.
- Application code, migrations, masters, module blueprints, STR-04 and provider requirements remain unchanged.
- ACC/AST refs remain the pinned hashes; neither branch was checked out, merged, advanced or edited.

Pre-commit validation covered the actual staged new file, since ordinary `git diff` does not include untracked content:

| Check | Result |
|---|---|
| `git status --short` | Only this review record added |
| `git diff --check`; `git diff --cached --check` | PASS, no whitespace errors |
| Unstaged diff/stat/name | Empty |
| Staged diff/stat/name and protected-path allowlist | Exactly this one file; no other repository change |
| ACC-01 / AST-01 reference heads | Exact pinned hashes unchanged |
| Acceptance file | Absent |
| Text/structure checks | UTF-8; final newline; no trailing whitespace; balanced fences; 18 closure dispositions; 11 unique R3 IDs, eight blocking and three non-blocking; repository file references checked |
| Application tests/build | Not run: documentation-only architecture review; no implementation behaviour changed |

The commit introducing this file is the resulting review commit; its SHA/publication result is reported in the turn response rather than inserted self-referentially here.

**Next governance action:** a separately authorised DEC-015 remediation turn addressing R3-F01…F08, aligning the non-blocking text where practical, followed by an independent acceptance-gate re-review. No human decision is made by this record. Only a later suitable review can precede a separately controlled human acceptance turn.

**Review verdict: REMEDIATE. Human acceptance: NOT_ACCEPTED. Implementation: NOT AUTHORISED.**
