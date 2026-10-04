# 04 Review — DEC-015 (round 1)

- **Reviewer:** independent architecture / fund-flow reviewer / claude-opus-5-5 / HIGH — **separate context** from the authoring turn. **Independence is context-level only:** the author was the same model family (`01-plan.md`, `task.json` `planner`). The human should weigh that.
- **Decision:** **REMEDIATE**
- **Human approval required:** true. This review does not accept DEC-015, does not set any task state and authorises nothing.
- **Reviewed commit:** `b47deaaebcfbb95a1359f75d7ba1dd3636c4d394` (`main` = `origin/main`, tree clean at preflight). STR-04 **v0.1** (`PROPOSED / AWAITING HUMAN ACCEPTANCE`); STR-04A/B/C v0.1.
- **Read-only inputs:** `origin/module/ACC-01` @ `3f23c3dcb2c5023a64afa2bd2dfb0ef77fe544be` (blueprint v0.10); `origin/module/AST-01` @ `1978f2e24192b7d893939b25ec9176cc9920791a` (blueprint v1.8). Neither was checked out, merged or modified.
- **Evidence reviewed:** `01-plan.md`, `03-evidence.md`, `task.json`; STR-04 (all 57 sections); STR-04A/B/C; `DECISION_LOG.md` DEC-011…DEC-014 in full; `DOCUMENT_REGISTER.md` §3/§4d; `OPEN_FINDINGS.md`; `CURRENT_STATE.md`; `CLAUDE_CODE_USAGE_RULES.md`; `tasks/README.md`; Module Index v1.4 (§6–§16A rows, §22); Workflow Map v1.3 WF-19; Charter v1.5 §9.2/§9.4; LED-01 v1.1 §5.3–§5.5, §5.17–§5.19, §5.26, component list; WDR-01 v1.1 component list; ACC-01 v0.10 files 01 (§1–§4, §7, §7.1), 02, 04, 05, 06, 10, 13, 15, 17 and `04-review-r10.md`; AST-01 v1.8 file 01 (§1, §3, §5, §6, §7), 05 (`custody_support`), 17 and `task.json`; an independent keyword sweep of `docs/` and `platform/` (§9 below).

## 1. Baseline and governance checks (all passed)

| Check | Result |
|---|---|
| `HEAD` = `origin/main` | `b47deaa…` = `b47deaa…`; branch `main`; `git status --short` empty |
| `origin/module/ACC-01` / `AST-01` | `3f23c3d…` / `1978f2e…` (as expected) |
| DEC-015 status | `PROPOSED / AWAITING HUMAN ACCEPTANCE` in STR-04 front matter, `DOCUMENT_REGISTER.md` §4d and `CURRENT_STATE.md` §7 |
| `task.json` | `state: PLANNING`, `risk: CRITICAL` (appropriate), `acceptanceStatus: NOT_ACCEPTED`, no `acceptance` object |
| `DECISION_LOG.md` | No DEC-015 entry (last entry DEC-014) |
| `OPEN_FINDINGS.md` | No DEC-015 / DEC015-PNF row; none of the PNF subjects duplicates an existing row |
| Records | No `02-implementation-report.md`, `05-remediation.md` or `06-acceptance.md` |
| `03-evidence.md` | Accurate where spot-checked (Charter l.925, l.1338; SRS l.910; Module Index l.128, l.405; masters 02–11 baseline line; LED-01 v1.1 l.366, l.633; WDR-01 l.582–583; `public-trust-control.tsx` l.101; register authority v1.1 APPROVED / v1.2 REVIEW_REQUIRED) |
| Exchange approval | No approval instrument anywhere. Doc 00 v1.5 l.135 "Exchange application is still pending", l.534; STR-02 l.213 "[REG FACT] … Exchange application **pending**". STR-04 §29.4 / `EV-22` is correct and claims no live Exchange |

## 2. Verdict

**REMEDIATE.** The architecture's direction is sound and much of it is careful: F1 default with F3 fallback, VA ≠ custody, legal custodian ≠ custody technology, accounting truth vs external evidence, the DvP vocabulary, the build-vs-live layering and provider neutrality. **But four HIGH defects sit in the safeguarding arithmetic, the ledger's location model, the no-financing rule and the key-custody rule.** Each would be bound into `DECISION_LOG.md` and then into the LED-01 schema if accepted as drafted. Two MEDIUM normative contradictions must also be fixed before acceptance. All six are document corrections. None needs a new module, a provider fact or a legal conclusion. So the verdict is REMEDIATE, not HUMAN_DECISION_REQUIRED.

`HD-DEC015-01` does **not** by itself force a human-decision verdict. Remediation must still fix its framing and timing (R12).

## 3. Findings

| ID | Sev. | Blocks acceptance | Subject |
|---|---|---|---|
| DEC015-R01 | HIGH | **Yes** | Safeguarding invariant undefined under asynchronous settlement, one-leg exceptions and negative client balances |
| DEC015-R02 | HIGH | **Yes** | Client entitlement has no location dimension; the per-location invariant, the reservation location and the outflow source are undefined |
| DEC015-R03 | HIGH | **Yes** | The AIX corporate "timing advance" is credit to a client and is pre-authorised by the decision text |
| DEC015-R04 | HIGH | **Yes** | "AIX holds no client signing key" is too imprecise for provider-managed MPC / orchestration |
| DEC015-R05 | MEDIUM | **Yes** | Reservation expiry can release funds while execution status is unknown (contradiction) |
| DEC015-R06 | MEDIUM | **Yes** | Provider-event and instruction flows in normative diagrams contradict the §36 ownership matrix; webhook ingress owner undefined |
| DEC015-R07 | MEDIUM | No (fix in remediation) | LP legal capacity, LP-default allocation and LP net settlement are presumed rather than evidenced |
| DEC015-R08 | MEDIUM | No | D-4: the obligation state model absorbs the order lifecycle; LED-01 becomes an active orchestrator |
| DEC015-R09 | MEDIUM | No | Fee accrual contradicts the closed cross-book enumeration; fee payable blocks closure drain; sweep latency is unbounded |
| DEC015-R10 | MEDIUM | No | ACC-01 analysis is incomplete: closed CDA allow-list; DEC-015 numbering collision |
| DEC015-R11 | MEDIUM | No | Uninstructed, provider-evidenced client outflows have no posting path or owner; hold enforceability is not an EV |
| DEC015-R12 | MEDIUM | No (must precede §56 step 6) | HD-DEC015-01 framing and timing; D-1 broadens WLT-01 without basis; fact split undefined |
| DEC015-R13 | MEDIUM | No | AST-01: stale LQD-01 reference; the single-custodian assumption is unrecorded; no custodian ↔ location consistency rule |
| DEC015-R14 | MEDIUM | No | Failure-mode matrix gaps |
| DEC015-R15 | LOW | No | D-5: REC-01 snapshots sit in the preventive path with no conflict rule |
| DEC015-R16 | LOW | No | Provider requirements gaps (STR-04A/B/C) |
| DEC015-R17 | LOW | No | Consistency and governance nits |

Counts: **HIGH 4 · MEDIUM 10 · LOW 3**. Blocking: R01–R06.

### DEC015-R01 — HIGH — Safeguarding invariant is undefined under asynchronous settlement (blocking)

- **Affected:** STR-04 §17.1–§17.3, §33.3–§33.4, §16.4, §57 I.
- **Evidence:** §17.1 sums `client_entitlement`, but nowhere says whether Client Settlement Clearing, counterparty receivables and **negative** client entitlements are inside that sum. §17.2 l.765 says an in-flight outbound leg is "backed by the Client Settlement Clearing account". That is circular: a ledger account backs nothing. §17.3 l.785 replaces the client's cash entitlement with a counterparty receivable and still calls the state "balanced". §33.4 and §40 row 8 allow a recall to drive a client negative ("client receivable"), against Module Index l.793 `client_negative_balance = prohibited`. §16.4 lists no event for a regulatory shortfall top-up.
- **Failure scenarios:**
  - **(a) Normal buy.** Cash leaves location L on confirmation, but the asset has not yet arrived. If clearing counts as a liability, the per-location invariant breaches on every cash-first trade. LED-01 v1.1 §5.19 rule 7 ("invariant breach blocks movement and freezes affected scope") would then freeze L for **all** clients. If clearing does not count, in-flight client value is outside any protection measure, and nothing says so.
  - **(b) Recall.** Client A's USD 1,000 deposit is spent and then recalled. A goes to −1,000 while client B holds +1,000 at the same L, and L's resources are now 0. The sum is 0 ≤ 0, so the invariant **passes** while B is entirely unbacked. The negative nets away another client's shortfall.
- **Required correction:**
  - Define the liability side exactly. Client claims include clearing and in-flight entitlements. Each client's term is floored at zero (`Σ max(entitlement,0)`). Receivables **from** clients and **from** counterparties are never resources and never offset liabilities.
  - Name in-transit / counterparty value as a separately measured exposure with configured limits and windows. Inside the window it is reported, not frozen. Past the window it becomes a break.
  - Add a regulatory shortfall top-up cross-book event, gated by `EV-07`. Distinguish it from trade financing, and record it against the defaulting client.
  - Reconcile with Module Index `client_negative_balance = prohibited`.

### DEC015-R02 — HIGH — Client entitlement lacks the location dimension (blocking)

- **Affected:** §9.3 l.397, §7.4, §16.3, §17.1, §12 rule 2 l.564, §18, §23, STR-04A §2.3.
- **Evidence:** §9.3 gives the Client Entitlement account the dimensions `client_id`, `subaccount_id` and asset, with no location. Yet §17.1 needs `Σ client_entitlement(A, L)`, and §12 rule 2 says "balances are never silently moved between rails", which presumes location-attributed balances. §16.3 step 1 reserves against S×A. §18.1 places the external hold at a single location L, and §23 step 5 pays "from location L" without saying how L is chosen.
- **Failure scenario:** S holds USD 600 via a VA at underlying account L1 and USD 400 at L2. A USD 1,000 reservation passes S×A, but no single location can hold or pay it. Worse, F1 VAs are often attribution labels on a **pooled** underlying account (§9.1 row 3). A 1,000 instruction against L1 could then be honoured by the bank out of other clients' money. No STR-04A requirement makes the provider limit VA debits to the VA's own balance.
- **Required correction:**
  - Either make the entitlement sub-ledger S×A×L, or adopt an explicit "one home location per S×A, with governed transfers" rule.
  - Make reservation, hold and outflow location-specific.
  - Define source-location selection.
  - Add a BNK requirement (MUST for F1 pooled structures) that debits against a VA are limited to that VA's own credited balance, or else that AIX enforces it per location.

This must be settled before LED-01 schema design. Preventing exactly this kind of schema error is the stated purpose of DEC-015 (§2).

### DEC015-R03 — HIGH — The AIX corporate "timing advance" is client financing, and the decision text pre-authorises it (blocking)

- **Affected:** §19.4, §25.4 row 3 (l.1191), §54 Q6, §57 N.
- **Evidence:** §19.4 says "AIX corporate funds are **never** used to make up a client shortfall, including transiently". The next sentence permits a corporate leg that moves first, "recorded as an operational receivable from the client's reserved resources". A receivable from a client funded by AIX money is credit extended to that client, whatever the collateral. `DEC-013` clause 6 puts **lending**, margin and leverage out of scope, with no build. HB-10 says "AIX must not finance client trades". §57 N then makes the pattern a permitted architecture element, needing only "its own governance record before use". The prefunded-venue variant also never says where the purchased asset lands. If it lands in AIX's venue account, which §9.1 puts in the CORPORATE book, a client asset sits in an AIX account.
- **Required correction:** Remove the permission from §19.4, §25.4 and §57 N. State that no AIX-corporate-funded leg may precede the client-funded leg. Any future need goes to a **separate decision** with its own legal EV (credit-extension and licence analysis), not a governance record under DEC-015. If the human wants to keep the option open, record it as `HD-DEC015-03` (§6) with "prohibited" as the default.

### DEC015-R04 — HIGH — "AIX holds no client signing key" is insufficiently precise (blocking)

- **Affected:** §13.3 rule 4 (l.629), §37.2 (l.1787), §57 D, STR-04B CUS-REQ-002/020/022/023.
- **Evidence:** In provider-managed MPC and orchestration, the platform customer commonly holds:
  - an MPC **key share** or API co-signer;
  - recovery or backup material;
  - policy-administrator rights, including over whitelists;
  - seats on the transfer-approval quorum.

  None of these is literally "a client signing key", but together they amount to control. CUS-REQ-020 even expects the policy engine to be "configurable by AIX". §13.2 row 3 classifies "AIX controls keys/policies" as self-custody, but the binding sentence in §57 D does not carry that test.
- **Required correction:** Replace the rule with a defined set of **control indicators**: any key share, co-signer, recovery or backup material, policy-admin rights, quorum membership able to release without the custodian's independent approval, or unilateral whitelist authority. Any indicator present means §13.2 row 3 (Doc 00 §8.2) applies unless `EV-11` legal analysis concludes otherwise. Add CUS-REQ items that evidence each indicator's absence. AIX-side IAM-02 approvals request an action; they never complete a transfer.

### DEC015-R05 — MEDIUM — Reservation expiry vs unresolved execution (blocking)

- **Affected:** §18.2 rule 5 (l.842–843), §32 rule 2 (l.1440), §33.1, §40 row 16, §54 Q5.
- **Evidence:** §32 rule 2 releases the residual "at the order's terminal state **or at the configured reservation expiry, whichever first**". §33.1 and §54 Q5 say that a timeout keeps the reservation until the LP confirms. Provider holds also expire on their own (§40 row 5).
- **Failure scenario:** The LP fills late, after the expiry released the internal reservation or the provider hold lapsed. The fill is then unfunded. AIX, as the LP's counterparty, must settle, which means corporate funds (R03) or a client shortfall.
- **Required correction:** Expiry must never release, or let lapse unreplaced, any amount bound to an execution attempt whose status is unresolved. Provider-hold expiry while status is unresolved must re-hold or escalate. State this as a normative rule and add it to §48.

### DEC015-R06 — MEDIUM — Provider-event and instruction flows contradict the ownership matrix (blocking)

- **Affected:** §18.1 (l.818), §25.1 (l.1153–1162), §36.1–§36.2, §35.1–§35.3, §37.1 (l.1777).
- **Evidence:**
  - §25.1 has `BANK-->>LED` twice (hold confirmed, cash leg complete) and `LED->>WDR` initiating both the external hold and the cash-leg instruction.
  - §18.1 has the **requester** (`OMS->>WDR`) asking for the external hold.
  - §36.2 says LED-01 must not "ingest provider events", and D-5 gives original events to DEP-01/WDR-01.
  - §35.1 gives the same bank adapter to DEP-01, WDR-01, REC-01 and WLT-01. Under §35.2 each module boundary owns its adapter, which means multiple credential sets and webhook endpoints per provider. Nothing defines who authenticates and routes the single inbound provider stream (receipts, hold confirmations, payment status, returns, statements).
- **Required correction:**
  - Fix the diagrams so every provider event flows BANK/CUS → DEP-01 or WDR-01 → LED-01.
  - Name one requester of external holds.
  - Name the owner of provider-event ingress, signature verification, the replay store and routing. For example, a shared ingress component in FND-01 or IMP-02 that verifies and routes but owns no business state.
  - State credential cardinality per provider and function.

### DEC015-R07 — MEDIUM — LP legal capacity, default allocation and net settlement are presumed

- **Affected:** §33.3 l.1472, §17.2 one-leg row, §30.3, §41.1 (`EV-20`), STR-04C LPC-REQ-010/022.
- **Evidence:** §33.3 puts a **counterparty receivable on the client book "attributed to the client"**, which presumes the client bears LP default. Under agency / back-to-back execution through an AIX venue account (§9.1), the LP's legal counterparty may be AIX. In that case AIX owes the client and the exposure is AIX's (Charter §9.4 rule 5). No EV covers this. LPC-REQ-010 is only "MUST (INFO)". §30.3 forbids netting, but LP terms commonly settle AIX's account **net**. One client's cash would then fund another client's proceeds.
- **Required correction:** Add EVs for (i) the legal capacity in which AIX faces each LP and (ii) the client-agreement allocation of LP default. Hold the receivable's owner behind the abstraction rather than asserting it. Require gross settlement per obligation, or record LP net settlement as an EV, with a rule that no client's funds settle another client's obligation.

### DEC015-R08 — MEDIUM — D-4: the obligation model absorbs the order lifecycle

- **Affected:** §31.1–§31.3, §25.1, §53 D-4.
- **Evidence:** The obligation states start at `created → awaiting_resources → reserved → ready_to_execute → executed`, which are order and reservation states. §25.1 creates obligations **per fill, after execution**. §31.3 rule 3 gives LED-01 per-state timers that escalate and open breaks, and §25.1 has LED-01 actively instructing WDR-01. `settled → reversed` exists, but nowhere says that "settled" is not "final".
- **Required correction:** Start the obligation at `executed`/fill. Pre-execution states belong to the OMS-01 order and the LED-01 reservation. Keep the accounting state and transition guards in LED-01. Name the active driver (timers, retry, instruct) as a distinct LED-01 settlement-controller component with no posting rights (LED-01 v1.1 already lists a DvP Settlement Controller), or as TRD-01. Define settlement finality separately from accounting `settled`.

D-4's ownership itself is acceptable (§5).

### DEC015-R09 — MEDIUM — Fee accrual and the cross-book enumeration

- **Affected:** §20.3 l.949, §16.4 l.703–714, §9.3 l.401, §17.2, §20.5.
- **Evidence:**
  - Accrual at fill posts to **both** books (client: entitlement ↓ / fee payable ↑; corporate: receivable ↑ / revenue ↑). But §16.4 says "No other journal may touch both books" beyond three enumerated events, and accrual is not one of them.
  - Fee Payable carries `subaccount_id`, so an unswept fee blocks the subaccount's closure drain (R10).
  - Sweep latency is unbounded ("batched per configuration"), so AIX-owned money can sit in a client-money structure indefinitely, against Charter §9.2 rule 1.
  - §20.5 leaves the difference between estimated and actual network fees to product policy, without saying the client is never charged above the disclosed amount.
- **Required correction:**
  - Enumerate fee accrual as an internal-evidence cross-book event, or restructure it as two single-book journals with a defined link.
  - Book the fee payable at the location level, or add a closure rule (R10).
  - Add a configured maximum sweep latency that fails closed.
  - Cap client-borne third-party charges at the disclosed amount, with any excess borne by AIX under §20.8.

### DEC015-R10 — MEDIUM — ACC-01 analysis is incomplete (classification still holds; see §4)

- **Affected:** §51 (l.2351–2356), §51.1, §51.3, §43.3 A-02.
- **Evidence:**
  - ACC-01 v0.10 file 01 §7.1 (l.251–261) makes the closure-drain allow-list **closed and fail-closed**: CDA-5 "None defined. Adding one needs a master citation and a governed change to this list". File 10 T-158/T-159 deny any unlisted activity class under `closing`.
  - DEC-015 adds drain activities STR-04 never maps to CDA-1…CDA-4: the fee sweep of a subaccount-scoped Fee Payable (R09); the release of external holds; provider-side VA and custody-location close-out; and the posting of uninstructed client outflows (R11). With a fee payable on the subaccount, readiness cannot pass, the sweep is not allow-listed, and the barrier refuses postings after the seal. The only exit is abort. §51.1 says external drain needs "only attester contracts", and that is not right.
  - ACC-01 v0.10 file 17 l.48 (DCR-ACC-GOV-01, present since v0.1) provisionally names **"a `DEC-015` recording the ACC-01 design decisions"**. STR-04 §1 claims DEC-015 as the next free number and reports "Contradictions found: None".
- **Required correction:**
  - Add FI-ACC-5: map each DEC-015 drain activity to CDA-1…CDA-4. Preferred: put the fee payable at the location level so no ACC-01 change is needed. Otherwise route it through CDA-5 by citing WF-27 v1.4, plus a narrow ACC-01 list-text amendment at ACC-01's next revision. That amendment changes no schema, state or invariant, because consumers enforce the list.
  - Add FI-ACC-6: DCR-ACC-GOV-01 must reference another decision number.
  - Correct "Contradictions found".

### DEC015-R11 — MEDIUM — Uninstructed, provider-evidenced client outflows

- **Affected:** §10.3, §23 (l.1108–1110), §40 row 29, §16.3, §21–§24.
- **Evidence:** For `CLIENT_INDEPENDENT` locations, and for every withdrawal where `settlement_instruction_authority = CLIENT_ONLY`, funds leave the location without any AIX instruction. STR-04 says AIX "record[s] the provider-evidenced outflow" but names no owner, posting path or state. It also does not acknowledge that WLT-01 destination verification, the AML-01 pre-transaction gate and the Travel Rule do not run on these outflows. §40 row 29 covers only the *misrecorded* case. Separately, an AIX-requested hold on a **client-held** account is only effective if the client's mandate to the bank makes it binding and if it ranks ahead of set-off and legal orders. `EV-08` covers API capability only.
- **Required correction:** Define the owner (DEP-01 or WDR-01) and the evidence-driven posting path for uninstructed outflows, including during `closing`. Record the compliance-control consequence for such locations (AML-01 monitoring input). Add an EV for the legal enforceability and priority of provider holds.

### DEC015-R12 — MEDIUM — HD-DEC015-01 framing and timing; D-1 basis

- **Affected:** §36.1, §53 D-1/D-2, §8.1, §10.2, §56, PNF-08.
- **Evidence:**
  - Workflow Map WF-19 (l.1314–1361) is **one** workflow, "Vendor / LP / Custodian / Bank Approval", with a single vendor record covering DD, security, compliance, finance and management reviews, the exit plan and the custodian asset-migration plan (§23.4 item 8). D-2 splits LPs (LQD-01) from everything else (HD), which would give one WF-19 record type two owners.
  - §8.1 and §10.2 split the arrangement facts between the arrangement record ("structure-level") and the WLT-01 entry ("location-level") without a field list. `withdrawal_authority`, the fact the double-spend control depends on, has no definite owner.
  - D-1 widens WLT-01 from *destinations* (Module Index l.397: "Wallet Screening / Payout-Destination Whitelist / Custody Orchestration") to *safeguarding locations*. Those carry holder, beneficial-ownership and designation facts, a different concern. The Module Index basis covers deposit-address assignment (custody orchestration) but not fiat VAs. DEP-01 v1.1 workflow step 5 already generates VA, reference and deposit-address instructions.
  - §53 says the gap "blocks live provider activation, not build". But WLT-01's location schema (§56 step 6) depends on the fact split.
- **Required correction:**
  - Reframe HD-DEC015-01 as "owner of the WF-19 provider record for **all** provider types, plus the field-level fact split".
  - Add a field-by-field owner table.
  - Require the HD outcome before §56 step 6, not merely before live activation.
  - Present D-1 alternatives alongside HD: keep WLT-01 to destinations and deposit-address assignment, and put safeguarding-location facts with the location/arrangement owner.

Reviewer recommendation is in §5.

### DEC015-R13 — MEDIUM — AST-01 integration items

- **Affected:** §43.3 A-06 (l.2078), §52.2 (l.2423), §52.3 FI-AST-1/FI-AST-2.
- **Evidence:**
  - A-06 still binds `custodian_ref` to an "LQD-01 arrangement", contradicting D-2. This is residue from the first draft.
  - "The initial operating model has one legal custodian per instrument × domain" is not among HB-01…HB-13. Yet WF-19 §23.4 item 8 and CUS-REQ-063 (MUST) anticipate custodian replacement.
  - AST-01 v1.8 permits a sequenced cutover: `custody_support.status ∈ {PROPOSED, APPROVED, WITHDRAWN}` with one live row (file 05 l.738–748, l.809). During the cutover, `DEPOSIT/WITHDRAWAL_MB_PSO` deny platform-wide for that instrument.
  - Nothing requires a WLT-01 custody location's custodian to equal AST-01's approved `custodian_ref`. Without that rule, AST-01's custodian approval constrains nothing. With it, the single-row rule becomes a hard constraint during migration.
  - FI-AST-1's "approving `custody_support` requires the arrangement `VERIFIED`" would add a new AST-01 apply-time dependency.
- **Required correction:**
  - Fix A-06.
  - Record the single-custodian / sequenced-cutover model as human decision **HD-DEC015-02** (§6).
  - Add the custodian ↔ location consistency rule.
  - Enforce arrangement verification at the location (WLT-01 / §17.4), not inside AST-01's approval path.

### DEC015-R14 — MEDIUM — Failure-mode matrix gaps

§40 has no row (state, availability, reservation, movement, escalation, reconciliation, MC, evidence) for:

- a provider hold that persists after LED-01 release (release failure);
- an orphan hold confirmed after the internal timeout;
- provider-confirmed receipt with a failed ledger posting (governed idempotent replay, never a manual adjustment);
- provider settlement complete while ledger settlement is pending;
- a provider hold that disappears **after** execution was funded on it;
- a late LP fill (R05);
- provider correction as its own row;
- stale **custodian** evidence (row 2 is bank-only).

### DEC015-R15 — LOW — D-5: REC-01 snapshots in the preventive path

D-5 has LED-01 read REC-01 scheduled snapshots "for preventive freshness". That puts REC-01's ingestion on the movement critical path. STR-04 does not say which evidence wins when a movement-scoped pre-read and a REC-01 snapshot disagree. LED-01 v1.1 §5.17 uses "balance snapshot" for an internal artefact that is "reconciliation only, never reservation". Prefer movement-scoped reads for preventive checks, with REC-01 read-only and fail-closed; add a disagreement rule; disambiguate the terminology.

### DEC015-R16 — LOW — Provider requirements gaps

- **STR-04A:** no requirement that VA debits are limited to the VA's balance (R02); no requirement on hold enforceability or priority over set-off and legal orders (R11).
- **STR-04B:** no custodian **fee schedule** (STR-04 §20.5 depends on it); no data-protection or data-residency item (`EV-27` applies); no control-indicator evidence (R04).
- **STR-04C:** no BCP/DR, audit rights, exit/termination or data-security requirement beyond API security; no gross-vs-net settlement item (R07).

No document fabricates a provider capability. Every candidate (Maybank, CIMB, Bank Muamalat, Fireblocks, Kraken, Binance OTC) stays context only. Confirmed by grep: no bank name appears outside the DEC-015 files.

### DEC015-R17 — LOW — Consistency and governance nits

- §43.5 G-05 says "PNF-01…07", but ten PNFs exist.
- The §41.2 table lists PNF-10 before PNF-07.
- §56 step 8 (DEP-01/WDR-01/REC-01) should depend on step 5 (masters 08/09), per STR-04's own §44 rationale.
- §37.1 "Reservation create/release only by WDR-01 service identity" should say *provider hold instruction*, consistent with D-3.

## 4. ACC-01 and AST-01 compatibility

| Module | Reviewer classification | Reason | Revision required |
|---|---|---|---|
| **ACC-01** v0.10 @ `3f23c3d` | **`DEC015_COMPATIBLE_FUTURE_INTEGRATION_ONLY`** (confirmed after attempting to disprove it; STR-04's supporting analysis is incomplete — R10) | No DEC-015 concept enters ACC-01: no balance, external reference, address or ledger id (file 01 §2 "Never in ACC-01"; ACC-REQ-007/009; T-011 schema guard). Master/subaccount identity, ownership immutability, lifecycle, closure barrier and attester-pinning mechanism are unchanged. `purpose` is a label (file 05 l.68). `treasury` ≠ AIX treasury is a consumer rule (FI-ACC-2). External drain = new attesters **plus** mapping DEC-015 drain activities onto the closed CDA list (R10) | **No structural revision.** Two text items for ACC-01's next revision: the DCR-ACC-GOV-01 "DEC-015" renumbering, and — only if STR-04 keeps a subaccount-scoped fee payable — a CDA-5 list amendment. Recommend STR-04 avoid the latter. Neither blocks ACC-01 acceptance or `PLAN_READY` |
| **AST-01** v1.8 @ `1978f2e` | **`DEC015_COMPATIBLE_FUTURE_INTEGRATION_ONLY`** (confirmed with corrections — R13) | `custody_model ∈ {THIRD_PARTY_CUSTODIAN, NOT_SUPPORTED}` has no AIX-custody value (§6). Instrument = one network deployment (§3.1, §3.11). Eligibility C6 is custodian-agnostic. WLT-01 is the sole `DEPOSIT/WITHDRAWAL_MB_PSO` caller (§5.8). AST-01 never owns entitlement, custodian balance or settlement state (§1.2). One live custody row per instrument × domain still permits a sequenced custodian cutover (`WITHDRAWN` → new `PROPOSED` → `APPROVED`) | **No**, provided the human accepts the single-custodian / sequenced-cutover model (HD-DEC015-02). If concurrent custodians per instrument × domain are required, FI-AST-2 fires and AST-01 needs a controlled revision **before** its `PLAN_READY` (schema freeze of `ux_ast1_custody_live`) |

## 5. Ownership review

| Item | Reviewer position |
|---|---|
| **D-1** WLT-01 location registry | **Not proven as drafted (R12).** Sound: withdrawal/payout destinations (existing) and custody deposit-address *assignment* requests (Module Index "custody orchestration"). Not supported by repository evidence: making WLT-01 the owner of fiat VAs and safeguarding-location facts. Destinations (where money may *go*) and safeguarding locations (where client money *is held*) need different controls and should not share one registry for convenience. Recommend deciding the location owner together with HD-DEC015-01 |
| **D-2** LQD-01 stays LP/venue | **Confirmed.** Withdrawing the extension was correct: Module Index l.432 scope plus the `DEC-012` venue gate. But WF-19's vendor record spans LPs too (R12), so LQD-01 owns the LP *arrangement* (terms, SSIs, venue gate), not the provider identity/DD record |
| **D-3** reservations | **Confirmed in principle**, with R02 (location-specific) and R05 (expiry). **Scenario — USD 1,000; Spot reserves 1,000; concurrent 1,000 withdrawal:** <br>• *Inside AIX:* LED-01's atomic compare-and-set on live available balance (LED-01 v1.1 §5.17) admits whichever request arrives first. The second fails `INSUFFICIENT_AVAILABLE`. The authoritative state is the LED-01 reservation; WDR-01 holds none. <br>• *At the bank (`CLIENT_INDEPENDENT`/`JOINT`):* only the provider hold prevents it. Execution may proceed only at `RESERVED_CONFIRMED`; a failed hold denies. <br>• *Pooled VA without per-VA debit limits:* neither control is sufficient until R02 is fixed |
| **D-4** settlement obligation | **Ownership acceptable** (Module Index LED-01 row; LED-01 v1.1 DvP controllers). Fix the model and orchestration boundary per R08. LED-01 owns the accounting obligation, leg state and transition guards. A named non-posting controller drives the sequence. WDR-01/DEP-01 execute and record. The provider executes |
| **D-5** reconciliation | **Confirmed.** REC-01 owns periodic statements and scheduled snapshots as immutable detective evidence, plus runs, breaks and evidence associations. DEP-01/WDR-01 own original events. REC-01 never writes the ledger (P-12). Add R15 |
| **HD-DEC015-01** | **Stays OPEN.** Repository authority does not resolve it. Assessment below. **Recommendation: Option D.** **Timing:** may remain open at DEC-015 acceptance only if STR-04 adds the field-level split (R12). It must be decided **before §56 step 6** (WLT-01/LED-01 blueprints) |

**HD-DEC015-01 options:**

| Option | Assessment |
|---|---|
| A — each consuming module owns its arrangements | Duplicates provider identity, DD and regulatory status, and breaks WF-19's single approval |
| B — shared registry in an existing module | No existing module fits. CLT-01 is the *client* domain, and §9.4's reasoning against AIX-as-client applies equally to vendors-as-clients. KYC-01 performs DD as a service but owns no relationships. LQD-01, TRE-01 and CFG-01 were rightly rejected |
| C — new module | Justifiable only for the identity/DD/WF-19 record. The repository shows a cross-provider workflow (WF-19) with no owner |
| **D — split: shared provider identity/DD/WF-19 status (one owner) + module-owned product/rail arrangement** | Gives one provider identity, one lifecycle/DD/termination/BCP/exit record and one audit trail. LQD-01 keeps LP terms, SSIs and the venue gate; the bank, custodian and agent rail arrangements stay with their executing modules. The shared owner may be a narrowly scoped Module Index addition. Credentials and adapter configuration stay environment-scoped with the consuming adapters |

## 6. Human decisions

| ID | Question | When it must be decided | Reviewer recommendation |
|---|---|---|---|
| **HD-DEC015-01** (existing, reframe per R12) | Owner of the WF-19 provider record for all provider types, plus the field-level fact split | Before §56 step 6; may stay open at acceptance once R12 is fixed | Option D |
| **HD-DEC015-02** (proposed, R13) | One legal custodian per instrument × domain with a sequenced cutover on migration (deposits/withdrawals of that instrument paused during the cutover), **or** concurrent custodians | Before AST-01 `PLAN_READY` | Human's call. Sequenced cutover keeps AST-01 at v1.8 |
| **HD-DEC015-03** (proposed, only if the human rejects R03's removal) | May any AIX-corporate-funded leg ever precede a client-funded leg? | At DEC-015 acceptance | Prohibit under DEC-015; any future need goes to a separate decision with legal EV |

## 7. Domain reviews (summary)

- **Fiat / VA:**
  - Rail hierarchy F1 → F2 → F3 is sound.
  - A VA is never treated as non-custodial (§11.3, §57 B).
  - Holder, beneficial owner, withdrawal authority and settlement authority are separate, evidenced facts (§10.2), with fail-closed `UNVERIFIED`.
  - Return-to-source, insolvency (`EV-10`) and safeguarding classification (`EV-06`/`EV-07`) are covered as EVs.
  - Gaps: pooled-VA debit limits (R02), uninstructed outflows and hold enforceability (R11), bank API freshness (handled; R15 for source conflicts).
- **Custody:**
  - Legal custodian ≠ wallet infrastructure ≠ custody technology ≠ orchestration (§7.3, §13.2).
  - Fireblocks is not equated with a legal custodian anywhere.
  - Infrastructure-only arrangements are correctly classed as self-custody.
  - The key-control rule needs R04.
  - C1/C2, deposit addresses and omnibus attribution are sound.
- **Ledger / safeguarding:**
  - The accounting-truth vs external-evidence principle (§16.1) is correct and adds no silent correction (§16.6, §34.4).
  - `ledger 1,000 / bank 900` → break, fail closed, "under review" (§16.6). `BTC 1 / 0.9` → R2/R4, §40 row 12.
  - Confirmed-but-unposted, vanished-hold and provider-complete/ledger-pending cases: R14.
  - The invariant arithmetic needs R01 and R02.
  - Definitions of pending, unidentified, reserved, settlement receivable, one-leg, returned/recalled, fee and corporate are present in §17.2. The liability side is not.
- **Settlement / DvP:**
  - "Atomic DvP" is confined to infrastructure that guarantees it (§30.1).
  - LED-01 v1.1 §5.18 rule 3's "atomic completion" is correctly flagged (PNF-03).
  - STR-04's own "atomic" uses (§16.3, journals) are accounting atomicity.
  - Need R07 (net settlement, LP capacity) and R08 (finality).
- **Treasury / principal:** Book separation (§16.4) and TRE-01's corporate-only scope (§19.2) are sound; R03 is the exception. Operational exposure is correctly distinguished from prohibited principal exposure (§33.6). The DEC-012/DEC-013 clause 5 prohibitions are preserved: no crossing, netting or internalisation (§30.3), subject to R07.
- **Fees:** The explicit, evidenced transition is sound. Partial fills, cancels, failures and rebates are handled. Fix R09: accrual cross-book, network-fee cap, sweep bound, closure. Chargebacks for Pay are covered only by "reversing obligations" (§27.2). That is adequate at architecture level.
- **Reconciliation:** R1–R13 are complete in topology. Detective, never corrective. Statement completeness is preserved.
- **Security:**
  - KMS/vault, mTLS, signatures, replay, idempotency, maker-checker, allowlists, environment-separated credentials, incident freeze and outage handling are all present (§37).
  - Ingress via the IMP-02 perimeter is correctly left as a future IMP-02 item.
  - Gaps: R06 (event ingress owner, credential cardinality) and R04.
- **Build vs live:** No regression of DEC-013/DEC-014. §46.4 enforces every layer, provider live-routing is an additional conjunct never inferred from `current_state`, and "hide it" ≠ CSS (P-15).
- **Prior decisions:** No silent supersession found. DEC-011's four layers are preserved (§9; corporate-book accounts carry no `subaccount_id`, compatible with ACC-01 R-5). DEC-012 Model A/C and DEC-013 clauses 5/6/7 are preserved, except R03's tension with clause 6. DEC-014 is preserved.

## 8. Master, module impact and proposed findings

**Masters (§44):**
- The order (Doc 00 v1.6 → Charter v1.6 → Module Index v1.5 → SRS / Role Matrix / Workflow Map / System Rules v1.4 → 07–11 v1.3) is coherent and mirrors DEC-013.
- Each master has a real DEC-015 hit (verified: the baseline line in 02–11; Charter §9.2; l.925; Module Index l.405/l.534).
- The Module Index must also record HD-DEC015-02 if adopted.
- Fix the §56 dependency (R17).

**Module impact (§45):** Complete for the 37 modules. FND-01 (or IMP-02) also gains provider-event ingress (R06).

**Impact matrix (§43):**
- The independent sweep found no missed material **authoritative** statement on: client money / safeguarding account, sole/only source, DvP/atomic, prefund, Binance/Kraken/Fireblocks, bank candidates (0 hits), omnibus (Charter only), virtual account (DEP-01 v1.1/v1.2, covered by B-07/B-09) and Exchange approval (pending only).
- The CLT-01/FND-01/CFG-01 "client money safeguarding" mentions are generic capability lists that inherit the master rebaseline.
- The matrix **missed** the ACC-01 DCR-ACC-GOV-01 DEC-015 collision (R10), the closed CDA list (R10), WF-19's LP scope (R12) and Module Index l.793 `client_negative_balance = prohibited` (R01).

**Proposed findings (not promoted):**

| PNF | Review | Notes |
|---|---|---|
| PNF-01 MEDIUM | Confirm | New. Evidence verified (SRS l.910, Charter l.1338). Owner: masters |
| PNF-02 MEDIUM | Confirm | Trigger "before LED-01/DEP-01 schema freeze" is correct |
| PNF-03 LOW | Confirm | — |
| PNF-04 MEDIUM | Confirm | Owner OMS-01 with WLT-01. No AST-01 change |
| PNF-05 LOW | Confirm | — |
| PNF-06 LOW | Confirm | UI copy (Fable) |
| PNF-07 MEDIUM | **Downgrade → LOW** | Wording. LED-01 v1.1 §5.15 already makes reconciliation mandatory |
| PNF-08 MEDIUM | Confirm, **reframe** | Merge with R12. Scope = WF-19 record for all provider types. Trigger = before §56 step 6 |
| PNF-09 LOW | Confirm | — |
| PNF-10 INFO | Confirm | — |

None duplicates an `OPEN_FINDINGS.md` row. If promoted, R01–R17 belong to the DEC-015 remediation, not to `OPEN_FINDINGS.md`. A human promotes.

## 9. Independent keyword sweep (method)

`git grep -i -E` over `docs/` and `platform/` at `b47deaa`, excluding `90_archive/`, `*/reviews/` and the DEC-015 files, for: Fireblocks, Kraken, Maybank|CIMB|Muamalat, omnibus, virtual account, atomic, DvP, sole/only source, Exchange approval / approval received / licence approved, client money, prefund. Hits were read at section level where material. Findings R01, R10, R12 and R13 cite the extra evidence found.

## 10. Escalation decision

None needed. The blocking items are document corrections inside STR-04's own scope. Remediation (`05-remediation.md`, a later human-authorised turn) should produce STR-04 v0.2 addressing R01–R06, preferably R07–R17 as well, then return for a round-2 separate-context review.

## 11. What this review does not do

It does not modify STR-04, STR-04A/B/C, any master, blueprint, ACC-01 or AST-01 branch, code or migration. It does not change `task.json`, because existing convention transcribes review records into `task.json` at the acceptance checkpoint, as in the MIG-004, MIG-005 and IMP02-MA-HARDEN-001 history. It does not create `05-remediation.md` or `06-acceptance.md`, add anything to `DECISION_LOG.md` or `OPEN_FINDINGS.md`, decide HD-DEC015-01/02/03, select a provider, state a legal conclusion, or claim any regulatory approval.

```txt
DEC-015 REVIEW ROUND 1: REMEDIATE
NOT ACCEPTED — IMPLEMENTATION NOT AUTHORISED
```
