# 04 Review — DEC-015 (round 2)

- **Review type:** ROUND-2 INDEPENDENT ARCHITECTURE REVIEW (adversarial financial-system architecture, fund-flow and governance review)
- **Reviewer:** independent architecture / fund-flow reviewer / claude-opus-5-5 / HIGH — **separate context** from the authoring turn, the Round-1 review and the Round-1 remediation. **Independence is context-level only:** author, Round-1 reviewer, remediator and this reviewer are the same model family (`01-plan.md`, `04-review.md`, `05-remediation.md`). The human should weigh that.
- **Decision:** **REMEDIATE**
- **Human approval required:** true. This review accepts nothing, sets no task state and authorises nothing.
- **Reviewed commit:** `5fcf43b8dc7a5e17de3b977b8ba99db5421eae25` (`main` = `origin/main`, tree clean at preflight).
- **Reviewed document:** STR-04 **v0.2** (`ROUND-1 REMEDIATED / AWAITING ROUND-2 INDEPENDENT REVIEW`), with STR-04A/B/C v0.2. v0.1 (`b47deaa`) used as historical comparison only.
- **Round-1 review:** `04-review.md` at `f9538b0` (REMEDIATE, R01–R17). Remediation record: `05-remediation.md` at `5fcf43b`.
- **Read-only inputs:** `origin/module/ACC-01` @ `3f23c3dcb2c5023a64afa2bd2dfb0ef77fe544be` (README, blueprint v0.10 files 01, 13, 17, `04-review-r10.md`, `task.json`); `origin/module/AST-01` @ `1978f2e24192b7d893939b25ec9176cc9920791a` (README, blueprint v1.8 files 01, 05, 17, `04-review-r9.md`, `task.json`). Read with `git show`; nothing checked out, merged or modified.
- **Evidence reviewed:** `CLAUDE_CODE_USAGE_RULES.md`; `CURRENT_STATE.md`; `DECISION_LOG.md` (DEC-011…DEC-014 in full); `DOCUMENT_REGISTER.md` §4d; `OPEN_FINDINGS.md` (no DEC-015 rows); `tasks/README.md`; `tasks/DEC-015/01-plan.md`, `03-evidence.md`, `04-review.md`, `05-remediation.md`, `task.json`; STR-04 v0.2 (all 58 sections, read in full); STR-04A/B/C v0.2 (in full); Module Index v1.4 rows FND-01, WLT-01, LED-01, TRE-01, DEP-01, WDR-01, REC-01, OMS-01, LQD-01, EXE-01, TRD-01; Workflow Map v1.3 WF-19 (l.1314–1362) and l.2308; WDR-01 and DEP-01 v1.1 blueprint §2–§4; an independent keyword sweep (§10).

## 1. Preflight and governance checks (all passed)

| Check | Result |
|---|---|
| Branch / `HEAD` / `origin/main` | `main`; `5fcf43b…` = `5fcf43b…`; `git status --short` empty |
| `origin/module/ACC-01` / `AST-01` | `3f23c3d…` / `1978f2e…` (as expected; unchanged) |
| DEC-015 status | STR-04 v0.2 front matter, `DOCUMENT_REGISTER.md` §4d l.208 and `CURRENT_STATE.md` §7 all read `ROUND-1 REMEDIATED / AWAITING ROUND-2 INDEPENDENT REVIEW`, `NOT_ACCEPTED` |
| `DECISION_LOG.md` | No DEC-015 entry (last entry DEC-014, l.1235). Not modified since `43f2f34` |
| `OPEN_FINDINGS.md` | No DEC-015 or DEC015-PNF row. Not modified since `43f2f34` |
| Acceptance record | No `06-acceptance.md` exists |
| Implementation | Not authorised anywhere; no `platform/**` change in `b47deaa`…`5fcf43b` |
| `task.json` | Unchanged since `b47deaa` (`state: PLANNING`, `acceptanceStatus: NOT_ACCEPTED`, `roundCounts.review: 0`). Consistent with precedent; see §12 |

## 2. Verdict

**REMEDIATE.**

v0.2 is a substantial, mostly sound remediation. The original safeguarding arithmetic defect is gone: Scenario A (−1,000 / +1,000 / 0) now fails coverage. The resource-pool dimension, the no-corporate-advance rule, the no-timer-release rule, the event-ownership routing, the LED-01 boundary and the fee lifecycle all hold under adversarial testing. Fourteen of seventeen Round-1 findings are closed.

Three defects must still be corrected before human acceptance. Each sits in text that §57 would bind into `DECISION_LOG.md`:

1. **R2-F01 (HIGH).** The new custodian ↔ location consistency rule (§13.5, §14, §57 E) makes custodian exit and in-kind custodian migration impossible. It also misframes HD-DEC015-02.
2. **R2-F02 (MEDIUM).** The coverage rule treats "evidence stale", "rail suspended" and "one client's funds legally restricted" as resources that do not exist. A provider outage or a single garnishment would then be reported as a pool-wide safeguarding shortfall.
3. **R2-F03 (MEDIUM).** The custody-control rule states a legal classification ("self-custody in substance"; "Legal custodian is AIX"). DEC-015's own non-goals forbid that.

All three are document corrections inside STR-04's scope. None needs a new module, a provider fact or a legal conclusion, and no human choice is needed before the architecture can be judged. So the verdict is REMEDIATE, not HUMAN_DECISION_REQUIRED. The non-blocking findings (R2-F04…R2-F18) should be corrected in the same remediation round.

## 3. Round-1 closure matrix

| Finding | Sev. (R1) | Round-2 status | Basis (v0.2 evidence) | Residual |
|---|---|---|---|---|
| R01 | HIGH | **CLOSED_BY_V0.2** | §17.2 rules 1–8 (zero floor per client × subaccount; Client Deficit outside coverage; per P × A; no cross-pool/currency/legal-pool netting); §17.3–§17.4 in-flight claims in an explicit settlement-exposure view; §9.3 Client Settlement Claim and Client Deficit accounts; §57 I. Scenarios A–D pass (§5) | New: R2-F02, R2-F06, R2-F07 |
| R02 | HIGH | **CLOSED_BY_V0.2** | §9.6.1–§9.6.4 (location / pool / legal pool; S × A × P; deterministic source selection; no silent split; `INSUFFICIENT_AVAILABLE_AT_SOURCE`; allocation modes, `UNSUPPORTED` fail-closed); BNK-REQ-025/026 | R2-F14 (LOW) |
| R03 | HIGH | **CLOSED_BY_V0.2** | §19.4 unconditional; §25.4 variant struck; §57 N; P-04; no "timing advance", "bridge", "settlement buffer", "temporary liquidity" or "operational settlement liquidity" path in any authoritative document (§10) | R2-F07, R2-F16 (LOW) |
| R04 | HIGH | **SUPERSEDED_BY_NEW_FINDING** (R2-F03) | §13.4 K1–K17 and §13.4.2 AIX-alone prohibitions are correct and close the original defect. The classification rule that replaced it (§13.4.3, §13.2 rows 3–4, §57 D) asserts a legal characterisation | R2-F03 |
| R05 | MEDIUM | **CLOSED_BY_V0.2** | §18.3 rules 1–6, §18.5, §18.6, §32 rule 2, §33.1, §40 rows 16, 30–38 | R2-F11 (LOW) |
| R06 | MEDIUM | **CLOSED_BY_V0.2** | No provider → LED-01 or LED-01 → provider/WDR-01 edge remains (verified by grep of every diagram); single requester (§18.1–§18.2); event-ownership table and credential cardinality (§35.7) | R2-F04, R2-F08 |
| R07 | MEDIUM | **CLOSED_BY_V0.2** | §30.3 `settlement_basis`; §33.3 `claim_holder` / `loss_bearer` abstractions with fail-closed values; EV-30/31/33; STR-04C §2.6 | — |
| R08 | MEDIUM | **CLOSED_BY_V0.2** | §31.1 lifecycles and owners; LED-01 guards only, "no timers, no retries and no provider instructions"; obligation starts at the fill (§31.2); finality ≠ accounting settled (§31.4) | R2-F10 (LOW) |
| R09 | MEDIUM | **CLOSED_BY_V0.2** | §16.4 X1–X3; §20.3–§20.6; pool-level fee payable; `fee_sweep_max_latency` fail-closed; variable-charge cap | R2-F15 (LOW) |
| R10 | MEDIUM | **CLOSED_BY_V0.2** | §51 FI-ACC-5 / FI-ACC-6; "Contradictions found" corrected; §51.4 | R2-F13 (LOW) |
| R11 | MEDIUM | **CLOSED_BY_V0.2** | §10.3, §23.1, §40 rows 41–45, EV-32, BNK-REQ-011…014/038/049 | — |
| R12 | MEDIUM | **PARTIALLY_REMEDIATED** | WLT-01 narrowed, field table (§36.4), HD reframed (§58). But the fiat VA registry is pre-assigned to DEP-01 (§36.1 l.2323, §57 R) instead of being decided with the location/arrangement owner, as Round 1 recommended | R2-F05 |
| R13 | MEDIUM | **SUPERSEDED_BY_NEW_FINDING** (R2-F01) | A-06 corrected; single-custodian assumption withdrawn (§52.2); consistency rule added (§13.5). The rule as written traps assets on custodian exit and makes option A unworkable | R2-F01 |
| R14 | MEDIUM | **CLOSED_BY_V0.2** | §40 rows 30–50 present; every row carries state, Moves?, Avail., Res., Esc., reconciliation, MC and audit evidence | Rows 1, 2, 28, 43, 44 inherit R2-F02 |
| R15 | LOW | **CLOSED_BY_V0.2** | §16.7 rules 1–4; §34.3; §34.4; D-5 | — |
| R16 | LOW | **CLOSED_BY_V0.2** | STR-04A/B/C v0.2 (§11); no candidate capability claimed | R2-F03 (CUS-REQ wording), R2-F15 |
| R17 | LOW | **CLOSED_BY_V0.2** | All four sub-items verified in text: §43.5 G-05 "PNF-01…10"; §41.2 ordered 01…10; §56 step 8 depends on 5; §37.1 "Provider hold instruction controls" | — |

## 4. Round-2 findings

| ID | Sev. | Source | Blocks acceptance | Subject |
|---|---|---|---|---|
| DEC015-R2-F01 | **HIGH** | R13 | **Yes** | §13.5 consistency rule makes custodian exit / in-kind migration impossible; HD-DEC015-02 option A misframed |
| DEC015-R2-F02 | **MEDIUM** | R01, R14 | **Yes** | Coverage conflates evidence freshness, rail usability and client-attributable restriction with resource existence |
| DEC015-R2-F03 | **MEDIUM** | R04 | **Yes** | Custody-control indicators are stated as a legal classification in the decision text |
| DEC015-R2-F04 | MEDIUM | R06, mandatory point 10 | No (fix this round) | WDR-01 stretched from payout rail to sole provider-instruction gateway without an explicit, gated scope change |
| DEC015-R2-F05 | MEDIUM | R12, mandatory point 11 | No (fix this round) | Fiat VA registry pre-assigned to DEP-01 instead of being decided with HD-DEC015-01 |
| DEC015-R2-F06 | MEDIUM | R01 | No (fix this round) | Deficit-client freeze scope undefined; pool-wide block rationale unstated and internally inconsistent |
| DEC015-R2-F07 | LOW | R01, R03 | No | "AIX-owned surplus to deduct from" (§17.5 item 2) implies silent corporate absorption |
| DEC015-R2-F08 | MEDIUM | R06 | No (fix this round) | Provider Event Ingress keeps a hash, not raw evidence; dedupe key admits redeliveries; no schema/normaliser versioning |
| DEC015-R2-F09 | LOW | R17 | No | §56: HD outcomes feed step 4b masters, but 5a / 4c have no edge into 4b |
| DEC015-R2-F10 | LOW | R08 | No | §46.4 "LED-01 refuses to create obligations" contradicts §31.3 rule 3 |
| DEC015-R2-F11 | LOW | R05 | No | `EXECUTION_ATTEMPTED` write-ahead ordering not stated |
| DEC015-R2-F12 | LOW | R01, R09 | No | X4 / X6 client-book journals one-sided; §17.2 rule 8 identity omits Pool Exception and Client Deficit |
| DEC015-R2-F13 | LOW | R10 | No | FI-ACC-5 omits Client Deficit and unresolved-execution reservations; attester-contract fit for non-ledger attesters unstated |
| DEC015-R2-F14 | LOW | R02 | No | Multi-pool split reservations have no minimum control invariants |
| DEC015-R2-F15 | LOW | R09, R16 | No | No `aix_instruction_authority` value or BNK requirement for fee collection (X2 sweep) |
| DEC015-R2-F16 | LOW | R03 | No | Accounting for LP recourse to AIX collateral after a client failure is unspecified |
| DEC015-R2-F17 | INFO | — | No | `task.json` title and paths still describe v0.1 (transcribe at acceptance) |
| DEC015-R2-F18 | INFO | R06 | No | Pay collection / chargeback events absent from §35.7; freshness keyed by operation class only |

Counts: **HIGH 1 · MEDIUM 6 · LOW 9 · INFO 2.** Blocking: R2-F01, R2-F02, R2-F03.

### DEC015-R2-F01 — HIGH — Custodian consistency rule traps assets on custodian exit (blocking)

- **Where:** STR-04 v0.2 §13.5 (l.836–850), §14 (l.863–867), §52.2, §57 E, §58 HD-DEC015-02.
- **Evidence:**
  - §13.5: a custody location "may accept **or release** client assets **only while** AST-01 holds an `APPROVED` `custody_support` row for (I, D) … [with] the same legal custodian". A mismatch denies the movement.
  - §14: "during any custodian change the §13.5 consistency rule **applies continuously**".
  - AST-01 v1.8 file 05 l.809: `ux_ast1_custody_live (instrument_id, domain) WHERE status IN ('PROPOSED','APPROVED')` allows one live row only.
  - Workflow Map v1.3 WF-19 step 10 (l.1348), blocking condition 8 (l.1361) and l.2308 require a custody-exit / asset-migration path. So do CUS-REQ-063 (MUST) and EV-15.
- **Failure scenarios:**
  - **(a) Option A, planned migration.** The old custodian's row is `APPROVED`. A successor row cannot be `PROPOSED` while it stays live. Once it is `WITHDRAWN`, the old location can no longer *release*. The successor location can *accept* only after its own row is `APPROVED`, and by then the old one cannot release. No ordering lets an in-kind transfer satisfy §13.5 at both ends. Option A, as presented in §58, cannot work.
  - **(b) Any option, distressed custodian.** Governance withdraws approval of a failing or de-licensed custodian. Its location may then not release anything. Client assets are trapped exactly when EV-15 asset return is most needed.
- **Risk:** If accepted as written, a binding rule blocks client-asset return on custodian failure. The human would also choose HD-DEC015-02 on a false premise.
- **Required correction:**
  - Keep §13.5 for **acceptance** into a location and for **ordinary** outflows.
  - Add a governed **custodian-exit / migration transfer** class (WF-19 step 10, EV-25, maker-checker, reconciliation before and after). It may **release** from a location whose custodian is no longer approved, **only** to a successor custody location satisfying §13.5 or by a governed client-return path.
  - Restate HD-DEC015-02 option A as: old row `WITHDRAWN` (ordinary deposits/withdrawals stop) → successor `PROPOSED` → `APPROVED` → governed migration transfer under the exemption.
  - State whether client asset return directly to own-name destinations during exit needs an AST-01 wind-down state. AST-01 `WITHDRAWAL_MB_PSO` denies once the row is not `APPROVED`. If it does, record it as a new FI-AST item, not as a change made here.

### DEC015-R2-F02 — MEDIUM — Coverage conflates usability and freshness with resource existence (blocking)

- **Where:** §17.2 (l.1018 "QualifyingResources = authenticated, **fresh** provider evidence"), §17.7 (l.1176–1178: live-routing not `ACTIVE` ⇒ "contributes **zero** to qualifying resources"), §40 rows 1, 2, 28, 43, 44, 50; §16.6 l.966.
- **Evidence and failure scenarios:**
  - **Bank API outage** (row 1) or stale evidence (row 2): no fresh evidence, so qualifying resources = 0, so coverage fails at every affected pool. Row 50 ("any cause") then makes each pool `SHORTFALL` with INC-01 + Management escalation and a shortfall report. Rows 1/2 themselves say only "usable-for-movement fails". The document contradicts itself.
  - **Suspension** (row 28, DD lapse) or **provider freeze** (row 43): live routing is `SUSPENDED`. Under §17.7 the pool's money "does not count", so a fully funded pool reports a safeguarding shortfall.
  - **Legal order against one client** (row 44): the attached resources leave qualifying resources while that client's claim stays in ClientClaims. One client's garnishment becomes a shortfall for every client of the pool, which is then frozen.
  - **§26 test (1,000 = pool A 600 + pool B 400, pool A becomes unavailable):** entitlement correctly stays at 600 / 400 (§9.6.2) and A's available amount becomes 0. But coverage at A reports a 600 shortfall that does not exist.
- **Risk:**
  - False regulatory shortfall reporting.
  - Pool-wide contagion from operational events.
  - A false shortfall is the trigger for X6 (AIX corporate money into a client pool, §17.5 item 4c). The corporate-cover path R03 closed would then be invoked on a premise that is not true.
  - LED-01 would freeze this definition into its schema.
- **Required correction:**
  - Make the coverage outcome three-valued: `COVERED` / `SHORTFALL` / `UNDETERMINED`.
  - Stale or missing evidence, provider outage and rail suspension give `UNDETERMINED`. It denies movement exactly as `SHORTFALL` does (fail closed). It is **not** a shortfall, never triggers X6 and reports as an evidence gap with its own escalation.
  - Confine §17.7's "contributes zero" to facts that defeat the legal basis: arrangement `UNVERIFIED`, `UNSUPPORTED` allocation, §13.5 failure.
  - Treat an encumbrance attributable to one client's claim (an order against S) as `Blocked` on S's entitlement, not as a pool-resource exclusion. Exclusion from qualifying resources remains correct for third-party claims against AIX or the account as a whole (EV-32).
  - Reconcile §16.6 l.966 ("client S only if attributable") with §16.3 step 3.

### DEC015-R2-F03 — MEDIUM — Control indicators stated as a legal classification (blocking)

- **Where:** §13.2 table (l.757–762: "Any AIX control indicator present … Legal custodian is **AIX** (self-custody in substance)"); §13.4.3 (l.817); §57 D (l.3414–3417); §54 Q14; §48 "Custody control"; STR-04B CUS-REQ-070…076.
- **Evidence:**
  - §50 says DEC-015 does not "reach any legal conclusion on custody, control". §13.4.3's last sentence says classification "remains an external legal/contractual validation item".
  - Yet §57 D, the text that would enter `DECISION_LOG.md`, says an indicator "makes the arrangement self-custody in substance unless external legal analysis concludes otherwise". That is a legal presumption.
  - Separately, CUS-REQ-070…076 are MUSTs requiring confirmation that "**AIX holds none**". An arrangement that EV-34 clears would still fail a MUST and stay `UNVERIFIED`. The §13.4.3 escape and STR-04B contradict each other.
- **Example:** 2-of-3 MPC; the custodian holds two shares and can sign alone; AIX holds one share and cannot sign or block. That is a key-share indicator. v0.2 declares it AIX self-custody. Whether it is custody by AIX is a legal question. Architecturally it is simply "not eligible as third-party custody until assessed".
- **What is correct and must stay:** §13.4.2 is unconditional. AIX must not, by itself, reconstruct signing authority, move assets, recover to itself, bypass custodian controls or re-policy so it alone can move. Initiation and approval participation (K8, K9) are disclosure items, not indicators. Both are right.
- **Required correction:**
  - Rename the set **custody control indicators**. Their architectural effect is classification `CONTROL_ASSESSMENT_REQUIRED`: no `THIRD_PARTY_CUSTODIAN` eligibility and no live custody location until EV-34 classifies the arrangement.
  - Remove "Legal custodian is AIX" and "self-custody in substance" as conclusions from §13.2, §13.4.3, §54 Q14 and §57 D. Say instead that the arrangement is treated as **not** third-party custody, fail closed, pending EV-34. Doc 00 §8.2 applies if EV-34 finds AIX control.
  - Align CUS-REQ-070…076 so that each asks for evidence of the facet holder. Absence of an AIX indicator, or an EV-34 clearance, then satisfies the requirement.

### DEC015-R2-F04 — MEDIUM — WDR-01 scope stretched without an explicit, gated scope change (mandatory point 10)

- **Evidence of canonical domain:**
  - Module Index v1.4 l.418: WDR-01 "Withdrawal / Payout Execution Rail — Outbound payout execution".
  - WDR-01 v1.1 §2: "executes withdrawals/payouts only after WLT-01, AML-01, IAM-02, CFG-01 and LED-01 controls"; §4 out of scope item 9 "Trading/LP execution".
- **What v0.2 gives WDR-01:**
  - the provider-hold instruction lifecycle for **every** purpose: trade, payment, subscription (§18.1, §36.1);
  - Spot cash legs to LP SSIs (§25.1) and fee sweeps (§20.3);
  - observed uninstructed outflows (§23.1);
  - account-frozen, legal-order and set-off notices (§35.7 l.2280);
  - sole possession of instruct credentials (§35.7).
- **Assessment:**
  - A provider hold for a Spot trade is not a withdrawal; no value leaves.
  - WDR-01's existing gate set does not fit a hold, which has no destination. It does not fit an LP settlement payment either: the destination is an LQD-01 SSI, not a WLT-01 decision.
  - The single-instruct-credential boundary is a sound security choice. Distributing bank instruct credentials to OMS-01, PAY-01 and RWA-03 would be worse, and D-3 states the KMS rationale. So **no new module is warranted**.
  - The stretch is real, though. It is recorded only as impact rows (M-22, B-10), not as a canonical scope change with per-class controls.
  - Account-status notices (freeze, legal order, set-off) are pool-arrangement events, not outbound movements.
- **Required correction:**
  - Record the extension as an explicit Module Index scope change: WDR-01 becomes the outbound transfer **and** provider-instruction execution boundary. Name the instruction classes: payout, settlement payment, fee sweep, hold place/extend/release/convert, custodian transfer request.
  - Give each class its own gate set (holds: LED-01 reservation validation, no destination gate; settlement payments: LQD-01 SSI + LED-01 guard; payouts: unchanged).
  - State that WDR-01 owns **transmission and instruction state only**. The hold's business purpose stays with the requester and its accounting meaning with LED-01 (already stated in §18.2 rule 0; carry it into §57 J).
  - Route account-status notices to the holding-arrangement owner (HD-DEC015-01) + INC-01. WDR-01 handles only the debits that follow from them.

### DEC015-R2-F05 — MEDIUM — Fiat VA registry pre-assigned to DEP-01 (mandatory point 11)

- **Evidence:**
  - DEP-01 v1.1 §3 items 1–2 and workflow step 5 cover deposit reference / VA **instruction** generation, and l.911 leaves "Final virtual account/reference model" open. That is a basis for consuming a VA mapping, not for owning the VA as a resource location.
  - Under F1, a VA is also an outbound source: holds bind to it (§18.1 `place_hold(…, P, L …)`), it may carry client direct authority (§10.2) and it is a closure-drain item (§11.4).
  - Under `PROVIDER_PER_VA_ENFORCED` a VA **is** a resource pool (§9.6.4). The VA lifecycle (`suspended/closing/closed`, DEP-01) and the pool `arrangement_status` (`SUSPENDED/TERMINATED`, arrangement owner) would then be two lifecycle authorities over one object.
  - Round 1 recommended deciding the location owner **together with** HD-DEC015-01 (`04-review.md` §5 D-1). v0.2 instead binds "DEP-01 VA registry" in §57 R (l.3486), with the alternative only noted in §53.
- **Required correction:**
  - Make the VA registry owner (registry entry, lifecycle, subaccount binding) an explicit sub-question of HD-DEC015-01: DEP-01, or the holding-arrangement owner.
  - Keep DEP-01's use of the VA → subaccount mapping for inbound attribution regardless of the answer.
  - State one lifecycle authority where a VA is its own pool.
  - Change §36.1, §53 D-1 and §57 R accordingly. Until decided, consumers carry an opaque `external_location_id`, which is already the §36.1 pattern for pools.

### DEC015-R2-F06 — MEDIUM — Deficit freeze scope and pool-wide block

- **Evidence:** §17.5 item 3 ("S's **affected scope** is frozen; outbound movements from P are blocked") leaves "affected scope" undefined. §7.4 computes S's available amount per S × A × P without regard to a deficit elsewhere. §16.6 l.966 freezes "client S only if attributable" while §16.3 step 3 and row 50 block the whole pool.
- **Scenario B (tested):** A and B each hold +1,000 in P (2,000). A spends 1,000 by buying X held at pool Q. The bank then recalls A's deposit. A's entitlement at P is 0 with Client Deficit 1,000. P holds 1,000 against B's claim of 1,000 plus 1,000 already gone, so coverage fails by 1,000. B is correctly shown as unbacked and B's available amount is 0. **But** nothing stops A from withdrawing X from Q, which defeats recovery step 4(a). The loss then falls on B or, under X6, on AIX.
- **Scenario C:** when coverage fails, blocking the whole pool is correct. With fungible resources, any innocent client's outflow reduces the backing of the rest, a first-mover preference. v0.2 does not state that rationale. Once coverage holds (after recovery or X6) and only a deficit remains, freezing the whole pool is unnecessary contagion; only S's scope should stay frozen.
- **Required correction:**
  - Define deficit freeze scope as client-level across pools and subaccounts by default. Make it configurable per client agreement (EV-31/EV-35 family), deny on missing configuration, and never enable set-off without a contractual basis.
  - Pool-wide block applies **only while coverage is `SHORTFALL` or `UNDETERMINED`** (R2-F02), with the anti-preference rationale stated.
  - Reconcile §16.6 with it.
  - Innocent clients' executed obligations blocked by the pool freeze go to `settlement_exception` with a named exposure.

### DEC015-R2-F07 — LOW — "AIX-owned surplus to deduct from"

§17.5 item 2 (l.1120): "If P had no AIX-owned surplus to deduct from, coverage now fails at P by D." This implies that unswept AIX fee payable in P would silently absorb a client deficit. That is a corporate cover with no X6 governance or EV-35 gate, and it contradicts §17.2 rule 7. **Correction:** delete the conditional. AIX-owned money in P is never applied to a client deficit except through X6 under EV-35.

### DEC015-R2-F08 — MEDIUM — Provider Event Ingress evidence and idempotency model

- **Evidence:**
  - §35.7 keeps "hash, authentication result, receipt time, route", and §34.5 "raw signed payload **hash**, parsed record". The raw signed payload itself is not retained. A hash cannot be re-verified against the provider's signature, and normalisation errors cannot be re-derived.
  - Dedupe key = "provider event id + payload hash" (§35.7, §34.3, §37.1). Many providers sign redeliveries with a per-attempt timestamp or counter. Redeliveries would then hash differently and pass dedupe as new events. The reverse case, the same id with different economic content, is treated as a new event instead of a conflict.
  - Canonical event schema versioning, normaliser version, and the provider timestamp beside the AIX receipt timestamp are not stated.
- **Mitigation present:** DEP-01 dedupe (§21.2) and LED-01 idempotency keys reduce, but do not remove, the double-posting risk.
- **Required correction:**
  - Retain the raw signed payload immutably (in the ingress log or with the owning module) for the §34.5 period.
  - Dedupe on provider event id (plus provider sequence/version where offered). Quarantine the same id with different economic content as a conflict.
  - Record canonical schema version, normaliser version, provider timestamp and AIX receipt timestamp on every event.
  - State that the owning module can re-derive the canonical event from raw evidence, and that normalisation may not change amount, currency, direction, account/VA or counterparty without quarantine.

### DEC015-R2-F09 — LOW — §56 sequencing of the human decisions

§56 step 4b says Module Index v1.5 "records … HD outcomes" (also M-21, M-46), and Workflow Map v1.4 records the WF-19 owner (M-29). But step 5a (HD-DEC015-01) depends only on 3 and gates only step 6, and step 4c (HD-DEC015-02) has no edge into 4b. **Correction:** either make 5a and 4c precede the Module Index v1.5 / Workflow Map v1.4 parts of 4b, or have v1.5/v1.4 record both HDs as OPEN with triggers and plan a later governed update. The step 8 → step 5 dependency corrected in R17 is verified.

### DEC015-R2-F10 — LOW — LED-01 must always record executed fills

§46.4 l.2989: "LED-01 refuses to create obligations … for an inactive rail". §31.3 rule 3 says an executed trade is never treated as unexecuted, and obligations are created from fill evidence. If a fill exists, LED-01 must record it. **Correction:** the inactive-rail refusal belongs to OMS-01/EXE-01 before routing and to WDR-01 before instructing, never to obligation creation.

### DEC015-R2-F11 — LOW — Write-ahead of the execution attempt

§18.3 rule 1 runs from the moment the requester "records" an attempt. The §25.1 diagram puts routing and recording on one line (l.1706). If the order reaches the LP before `EXECUTION_ATTEMPTED` is durable, a crash leaves a `BOUND` reservation with a live attempt. The `EXPIRED` timer path could then release it. **Correction:** `EXECUTION_ATTEMPTED` must be durably recorded **before** transmission to EXE-01/LP. Without it, nothing is routed.

### DEC015-R2-F12 — LOW — Cross-book journal precision

Every journal must be single-book and balanced (§16.4). X6 lists the client-book leg as "Pool Resource ↑" only. The counter-leg should be Client Deficit ↓, assigning the deficit to AIX's corporate receivable. X4 also lists one side; the counter-account for the original AIX-borne provider debit is unspecified. Separately, §17.2 rule 8's reconciliation identity omits Pool Exception and Client Deficit, while R1 (§34.2) includes Pool Exception. **Correction:** specify both legs of X4 and X6 and complete the identity.

### DEC015-R2-F13 — LOW — FI-ACC-5 gaps (ACC-01 classification unaffected)

- **Client Deficit has a `subaccount_id`** (§9.3). It is not mapped. After the seal, ACC-01's barrier refuses every posting to the sealed target (file 01 §7, §10), so deficit recovery postings to a closed subaccount are impossible. **Correction:** either make "no outstanding Client Deficit" a pre-seal readiness precondition, or define the post-seal deficit home (client-level or Pool Exception), stated as consumer-side integration.
- **Unresolved executions.** The "open unexecuted orders" precondition must include reservations in `EXECUTION_ATTEMPTED` / `EXECUTION_UNKNOWN`. Those cannot be released (§18.3), so closure initiation must wait for their resolution.
- **Attester contract.** ACC-01's attester contract (file 01 §7.2; DCR-ACC-LED-01c) is ledger-shaped: commit-ordered `journal_watermark`, `committed_after_preseal_watermark`, `max_resolution_version_committed`. FI-ACC-1 adds DEP-01, WDR-01 and REC-01 attesters without stating how non-ledger attesters satisfy it. The alternative is LED-01 attesting external-drain facts it already owns (allocations, binding states, deficits).
- **Single-subaccount pools.** "X2 never blocks a subaccount's closure" is overstated for pools that serve one subaccount (C1 custody subaccount; a VA designated its own pool). There, external close-out readiness waits on the bounded sweep. This is not a deadlock, because X2 carries no `subaccount_id`.

### DEC015-R2-F14 — LOW — Split reservations across pools

§9.6.3 rule 3 lets product rules create several reservations in different pools; rule 4 rejects by default. **Test: 600 in pool A + 400 in pool B for a 1,000 order** → rejected `INSUFFICIENT_AVAILABLE_AT_SOURCE` by default. That is correct, and there is no silent aggregation. Any product rule that permits splitting still lacks minimum invariants. **Correction:** state them:

- all-or-nothing binding before `READY_TO_EXECUTE`;
- a deterministic fill-consumption order across the reservations;
- one cash leg per source pool on the obligation;
- independent release per reservation under §18.3.

### DEC015-R2-F15 — LOW — Fee-collection authority

The X2 sweep pays AIX's corporate account from a client pool. `aix_instruction_authority` (§10.2 l.582) has no fee-collection value: `PAY_APPROVED_COUNTERPARTY`, `PAY_OWN_NAME_DESTINATION`, `PLACE_HOLD`, `RELEASE_HOLD`, `CLOSE_VA`. STR-04A has no BNK requirement for it. On F1 pools without that authority the payable can never be swept, the latency bound breaches, and fee-bearing activity is refused (fail closed, but a design gap). **Correction:** add an evidenced `COLLECT_DISCLOSED_FEE` authority (EV-05), a fallback collection route (client-instructed payment or invoice, recorded as an AIX receivable), and a BNK-REQ.

### DEC015-R2-F16 — LOW — LP recourse to AIX collateral

§19.3 accepts that an LP "may have contractual recourse to [AIX corporate prefunding] if a client obligation fails". That is an involuntary corporate cover of a client failure. §19.4 and §33.3 keep the asset blocked and unwinding, but the accounting is not stated. **Correction:**

- The seizure is a `COUNTERPARTY_DEFAULT`/`settlement_exception` event.
- AIX's loss is a CORPORATE Operational Exposure receivable from the client.
- The client obligation is **not** treated as settled from corporate value: no asset release to the client on the strength of it.
- An LP whose terms grant such recourse is an LPC-REQ-061 disclosure item for TRE-01 limits.

### DEC015-R2-F17 — INFO — `task.json` is stale by design

Title and `relevantRecordPaths` describe v0.1; `roundCounts.review` is 0. By repository precedent this is transcribed at the acceptance checkpoint (§12). It is not changed here.

### DEC015-R2-F18 — INFO

- §35.7 has no row for Pay collection, refund and chargeback events. Collections are presumably DEP-01 and refunds WDR-01; chargebacks need an owner at the PAY-01 blueprint.
- Freshness windows are keyed by operation class (§16.3 step 2, §16.7). Stating "per provider arrangement × operation class" would make provider-specific policy explicit.

## 5. Safeguarding review (scenario tests)

| Scenario | v0.2 result | Pass? |
|---|---|---|
| **A** — A = −1,000, B = +1,000, pool 0 | An entitlement can never be negative (§7.4, §17.2 rule 1). A negative term reaching the computation is itself a critical break. A's position is entitlement 0 + Client Deficit 1,000. ClientClaims = 0 + 1,000 = 1,000; resources 0; **coverage fails by 1,000**. It does not pass by netting | **Yes** |
| **B** — A +1,000, B +1,000, pool 2,000; bank recalls A's deposit | Unspent: A's entitlement → 0, pool → 1,000, coverage holds, no deficit. Spent: A's entitlement 0 + deficit 1,000, pool short by 1,000, B's claim intact but unbacked and shown so, B's available amount 0 while short. A's other-pool assets not frozen → R2-F06 | **Yes**, with R2-F06 |
| **C** — one deficit, others fully backed | Pool-wide block is justified only while coverage fails (anti-preference). The rationale is unstated and §16.6 is inconsistent → R2-F06 | Partial |
| **D1** — cash leg completed, asset pending | Entitlement(S, USD, P) ↓ and Pool Resource(P) ↓ on provider-confirmed debit; In-flight Client Settlement Claim (§9.3 account with obligation, client, subaccount, asset due, counterparty) ↑; settlement-exposure view per counterparty × asset; limits; window; `settlement_exception` past window; separate safeguarding-report line marked "explicitly unprotected" (§17.4). Not hidden | **Yes** |
| **D2** — asset leg completed, cash pending | Asset-first sell: mirror image via in-flight claim on USD. LP-delivers-first buy: asset credited **blocked**, client cash reservation pinned, unwind or completion from client funds only (§33.3) | **Yes** |

- **Economic completeness:** the client's economic position = Σ entitlements (≥ 0) + in-flight claims − deficits. Each is an explicit ledger account with counterparty, amount, asset, window/status and EV-gated legal treatment (EV-07, EV-29, EV-30, EV-31). Live cash-first and asset-first settlement of client money is held until EV-07/EV-29 (§17.4, LCF/LCA), which is fail-closed. One-leg exposure is never made invisible by leaving the pool.
- **Client Deficit vs `client_negative_balance = prohibited`:** consistent. A deficit arises only from externally imposed events (recall, custodian reversal, reorg below finality, provider correction, provider-originated or client-direct debit beyond entitlement — §17.5, §23.1). It is a receivable / exception record, never an entitlement and never buying power. Reservations already cover consideration + fee + maximum charges, so ordinary trading cannot create one. LED-01 `negative_balance.allow` stays prohibited (B-28). One gap: a deficit does not reduce the client's availability in other pools (R2-F06).

## 6. Resource-location and reservation review

- **Pool model:** location ⊂ pool ⊂ legal pool, each with its own identifier (§9.6.1). The model answers:
  - which resource backs which entitlement (S × A × P);
  - which pool may fund which transfer (§9.6.3 candidates);
  - what is reserved (per S × A × P);
  - what is unavailable (operation-class usability);
  - which legal pool applies (P → G).
- **Instances tested:** two underlying accounts, multiple VAs, multiple subaccounts, pooled omnibus account (`AIX_EXCLUSIVE_INSTRUCTION`), custodian omnibus vault (C2 per-client sub-ledger).
- **Residual — per-VA enforced, same pool:** with `PROVIDER_PER_VA_ENFORCED` and two same-currency VAs of one client in one pool, the per-VA split is not on the ledger. A payout above one VA's balance is rejected by the provider: an operational issue, not a safety one.
- **Multi-pool funding:** rejected by default; product-rule splits need invariants (R2-F14).
- **Source selection:** deterministic, configured and recorded; refunds go back to the source pool.
- **VA / omnibus:** a VA is attribution, not segregation; `UNSUPPORTED` holds no live funds.
- **Internal reservation:** atomic compare-and-set on S × A × P; withdrawal vs order race resolved by first reserve (§18.2 rule 4).
- **Provider hold:**
  - one requester, bound by `reservation_id`;
  - `TECHNICAL_ONLY` is treated as no hold;
  - a mandatory enforceable hold for client-direct pools (§10.3);
  - "a software reservation does not legally restrict a bank account" is stated (§10.3).
- **R05 test — 1,000 reserved, hold confirmed, order sent, local timeout, LP status unknown:**
  - The reservation stays `EXECUTION_UNKNOWN`, the order `reconcile_required`, and the hold is renewed / re-held or else `HOLD_LOST` fail-closed with the internal reservation kept.
  - **Late fill** → consumes the protected reservation → one obligation (row 36).
  - **Authoritative no-fill** → release, then `RELEASE_PENDING_PROVIDER`, then `RELEASED` once the provider confirms (row 30 if release fails).
  - **Late fill after no-fill** → parked exception; settles only from fresh client resources by governed decision; never corporate funds (row 37).
  - Each path ends in exactly one terminal outcome. No timer alone frees resources once execution is possible, subject to write-ahead (R2-F11).
- **Hold expiry / orphan:** §18.5 rows; rows 31 and 35 are governed release after REC-01 confirms no other use.

## 7. Custody-control review

- **Legal custody (K16)** stays external (EV-11, EV-34).
- **Operational participation:** K8 initiator and K9 approver are disclosure items (§13.4.4), correctly **not** indicators. The K10 quorum seat counts only if AIX seats can release without the custodian's independent approval. That is correct.
- **Key / MPC control:** K1–K4 and recovery K5/K6 are indicators.
- **AIX-alone prohibitions:** §13.4.2 is unconditional on reconstructing signing authority (K14), unilateral movement (K15), recovery to AIX (K5/K6/K12), bypass (K11) and re-policy (K7/K10/K12). CUS-REQ-070…077 evidence each. **Verified.**
- **Remaining correction:** R2-F03 (classification wording and CUS-REQ alignment). Indicators must trigger fail-closed assessment, not a legal conclusion.

## 8. Module ownership review

| Module / component | Round-2 position |
|---|---|
| **LED-01** | Accounting authority only: books, S × A × P, coverage computation, reservation + binding, accounting obligation, leg status, guards, deficits, in-flight claims, fee postings. No phrase makes LED-01 sequence legs, control workflows or send provider instructions (§31.1, §36.2). One contradiction: R2-F10 |
| **DEP-01** | Inbound lifecycle and original inbound events: confirmed. VA registry: not justified as a pre-assignment (R2-F05) |
| **WDR-01** | Outbound transfer lifecycle and observed outflows: confirmed. The hold-instruction gateway is acceptable **only** as an explicit, per-class-gated scope change; account-status notices belong elsewhere (R2-F04) |
| **WLT-01** | No longer owns VA, underlying account, pool, arrangement, beneficial ownership or external balance (§36.2 "Must not"; D-1). Keeps destinations, custody deposit-address assignment and eligibility, custody-orchestration requests. **Confirmed** (R12 core closed) |
| **REC-01** | Detective only; can deny via a blocking break, never authorise; never the sufficiency input; fresh read ≠ REC evidence → fail closed where material + break, no convenient choice (§16.7). **Confirmed** |
| **LQD-01** | LP/venue arrangement, SSIs, settlement basis, claim holder, venue gate, limits; not the generic provider record. **Confirmed** |
| **Provider Event Ingress** | An FND-01 shared component (D-6, proposed), governed through a Module Index v1.5 row change (M-46). It owns no business state, so it is not a hidden top-level owner. Ownership of each event class is defined (§35.7): bank deposit → DEP-01; bank debit → WDR-01; custodian receipt → DEP-01; custodian withdrawal status → WDR-01; LP execution → TRD-01; hold events → WDR-01; inbound correction/recall → DEP-01; outbound/uninstructed correction → WDR-01; statements → REC-01; **never LED-01**. Evidence model: R2-F08; Pay events: R2-F18 |
| **VA registry** | Owner should be decided within HD-DEC015-01 (R2-F05) |

## 9. ACC-01 and AST-01

| Module | Round-2 classification | Basis | Required future work |
|---|---|---|---|
| **ACC-01** v0.10 @ `3f23c3d` | **`DEC015_COMPATIBLE_FUTURE_INTEGRATION_ONLY`** — reconfirmed | No DEC-015 object enters ACC-01 (file 01 §2 "Never in ACC-01"). Fee payable is pool-level (no subaccount fee object). CDA-1…CDA-4 cover return, open withdrawals, open settlements and break resolution. Post-seal events go to pool-level Pool Exception (consumer side) | **FI-ACC-5** needs **no** blueprint revision under its preferred route, after the R2-F13 additions (deficit, unresolved executions, attester fit). **FI-ACC-6** is a text item. DCR-ACC-GOV-01 (file 17 l.48) is itself conditional ("(if agreed) a `DEC-015`…"), so it is satisfied by using the next free number when that DCR is executed, or by a one-word edit at ACC-01's next controlled revision. Neither is structural, and neither blocks ACC-01 acceptance or `PLAN_READY`. `treasury` = a client's own pocket (FI-ACC-2): text at the next revision |
| **AST-01** v1.8 @ `1978f2e` | **`DEC015_COMPATIBLE_FUTURE_INTEGRATION_ONLY`** — reconfirmed, subject to HD-DEC015-02 and to R2-F01 being corrected on the **DEC-015** side | `custody_model ∈ {THIRD_PARTY_CUSTODIAN, NOT_SUPPORTED}`; `custodian_ref` an opaque `varchar(64)` (file 05 l.741), not LQD-01 (A-06 corrected); the one-custodian model is no longer presented as human-approved (§52.2); the §13.5 eligibility link is consumer-side | FI-AST-1…5 as listed. Option B → controlled AST-01 revision before `PLAN_READY`. If R2-F01's correction needs an AST-01 wind-down state for direct client return during exit, record it as a new FI-AST item (no AST-01 change here) |

## 10. Repository-wide stale-assumption sweep (independent)

`git grep -i -E` over `docs/` and `platform/` at `5fcf43b`, excluding `docs/90_archive/**`, the STR-04/04A/B/C files and `tasks/DEC-015/**`.

- **0 authoritative hits:** "timing advance", "settlement buffer", "temporary liquidity", "operational settlement liquidity", "bridg(e|ing) (financ|fund|leg)", "prefund(ed) venue/LP/account", "corporate funds", "net/gross settlement", "set-off", "client deficit", "fee payable", "closure drain".
- **Register / state only:** "provider hold" and "resource pool" appear only in the `DOCUMENT_REGISTER.md` STR-04 row.
- **Covered by the impact matrix:**
  - "virtual account": DEP-01 v1.1/v1.2 l.143, l.911, `02_Workflow.md` l.22 → B-07, B-09;
  - "omnibus": Charter l.412 → M-08;
  - "WF-19": Workflow Map l.261, l.1314, l.2308 → M-29;
  - the l.2308 custody-exit tie-in is evidence for R2-F01.
- **Not provider selection:** "Fireblocks" appears only as UI design reference `REF-UI-002` and in handover narrative → G-07.
- **Earlier v0.2 hits:** the client-money / safeguard / sole-source / DvP / Binance / negative-balance / hold-expiry hits listed in v0.2 §55 were spot-checked at the cited lines and are represented in §43.

**No material authoritative contradiction is missing from the impact matrix.** Archived copies were not treated as contradictions.

## 11. Provider requirements (STR-04A/B/C v0.2)

- **Bank / PSP:**
  - per-VA debit limit BNK-REQ-025 and debit attribution BNK-REQ-026;
  - hold enforceability and priority BNK-REQ-038;
  - set-off BNK-REQ-013, legal order BNK-REQ-012, freeze BNK-REQ-014;
  - client direct withdrawal BNK-REQ-011, uninstructed debit events BNK-REQ-049.
  - **Complete.** Add a fee-collection authority item (R2-F15).
- **Custodian:**
  - control evidence CUS-REQ-070…077;
  - fee schedule CUS-REQ-066;
  - data protection / privacy CUS-REQ-067, data residency CUS-REQ-068;
  - recovery / quorum CUS-REQ-071/073.
  - **Complete.** Align the "AIX holds none" MUSTs with the EV-34 route (R2-F03).
- **LP / OTC:**
  - BCP/DR LPC-REQ-055, audit rights 056, exit/termination 057;
  - gross/net 060, netting / set-off 061, default 062.
  - **Complete.**
- **Neutrality:** no document states that any candidate (Maybank, CIMB, Bank Muamalat, Fireblocks, Kraken, Binance OTC) supports any capability. Each appears only as "candidate (not selection)".

## 12. Masters, sequence, proposed findings and governance

- **Master rebaseline order (§44, §56):** coherent and mirrors DEC-013. The step 8 → step 5 correction is verified. HD dependencies into step 4b are missing (R2-F09).
- **What must be frozen first:**
  - the safeguarding model (R2-F02) and the resource-location model before LED-01 (step 6), already the plan;
  - provider / arrangement ownership (HD-DEC015-01, including the VA registry per R2-F05) before Module Index v1.5 / Workflow Map v1.4, or recorded there as open, and in all cases before step 6.
- **Proposed findings:** dispositions match Round 1:
  - PNF-01…06 confirmed;
  - PNF-07 LOW;
  - PNF-08 merged into R12 / HD-DEC015-01;
  - PNF-09 confirmed;
  - PNF-10 confirmed (INFO).
  - **v0.2 introduces no new PNF**, and this review proposes none: every Round-2 issue is a defect in STR-04 itself and belongs to the DEC-015 remediation, not to `OPEN_FINDINGS.md`. Nothing is promoted.
- **`task.json`:** left unchanged. In MIG-004 (`43f2f34`), MIG-005 (`6d2e4fe`) and IMP02-MA-HARDEN-001 (`d5e48b0`), `04-review.md` and the `task.json` update land together in the **acceptance** commit. `tasks/README.md` defines no review-time transcription rule, and the Round-1 review and remediation followed the same convention. Changing it now only for symmetry is not warranted (R2-F17).
- **Record naming:** `04-review-r2.md` follows `tasks/README.md` ("one file per review round"); `04-review.md` is not overwritten.

## 13. Human decisions

| ID | May DEC-015 be accepted with it open? | Latest safe decision point | Notes |
|---|---|---|---|
| **HD-DEC015-01** | **Yes.** No v0.2 rule needs the owner's identity, because consumers carry opaque `resource_pool_id` / `provider_arrangement_id`. Until an owner exists, no arrangement can be maker-checked to `VERIFIED`, so every pool stays `UNVERIFIED` and contributes nothing live (§10.2, §17.7). Fail-safe | **Before the Module Index v1.5 / Workflow Map v1.4 rebaseline (§56 step 4b)** if those masters are to record the owner in one pass (M-21, M-29); otherwise those masters record it OPEN. **In all cases before §56 step 6** (LED-01 / WLT-01 / VA-registry blueprints) | Option D recommendation stands (shared identity / DD / WF-19 record + module-owned rail arrangements). Add the VA registry owner as an explicit sub-question (R2-F05) |
| **HD-DEC015-02** | **Yes, once R2-F01 is corrected.** As written, option A cannot perform an in-kind migration, so the human would be choosing between an unworkable option and B | **Before AST-01 `PLAN_READY`.** That is the schema-freeze gate for `ux_ast1_custody_live`, so it is early enough. Because DEC-015 binds nothing until accepted and AST-01 could reach `PLAN_READY` first, the trigger should also be carried into the ACC-01/AST-01 disposition record (§56 step 4a) | Module Index v1.5 records it or marks it OPEN (R2-F09) |
| **HD-DEC015-03** | **NOT REQUIRED — confirmed.** No corporate-funded client settlement path remains in v0.2 or any authoritative document (§10). LP recourse to AIX collateral (R2-F16) is an exposure to account for, not a settlement path, and does not revive it | — | — |

## 14. What this review does not do

It does not modify:

- STR-04, STR-04A/B/C, any v0.1 document;
- `CURRENT_STATE.md`, `DOCUMENT_REGISTER.md`, `DECISION_LOG.md`, `OPEN_FINDINGS.md`, `task.json`;
- any master or blueprint;
- the ACC-01 or AST-01 branches;
- code or migrations.

It also does not:

- remediate any finding, create `05-remediation-r2.md` or `06-acceptance.md`;
- decide HD-DEC015-01/02;
- select a provider, state a legal conclusion or claim a regulatory approval.

```txt
DEC-015 REVIEW ROUND 2: REMEDIATE
BLOCKING: DEC015-R2-F01 (HIGH), DEC015-R2-F02 (MEDIUM), DEC015-R2-F03 (MEDIUM)
NOT ACCEPTED — IMPLEMENTATION NOT AUTHORISED
```
