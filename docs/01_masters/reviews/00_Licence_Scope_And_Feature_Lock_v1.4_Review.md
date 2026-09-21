# Independent Governance Review — Licence Scope & Feature Lock v1.4

## Document Reviewed: 00_Licence_Scope_And_Feature_Lock_v1.4.md

| Item | Details |
|---|---|
| Reviewed document | `00_Licence_Scope_And_Feature_Lock_v1.4.md` (candidate) |
| Prior approved baseline | `00_Licence_Scope_And_Feature_Lock_v1.3.md` |
| Platform | AIX Institutional Digital Asset & Tokenized Securities Platform |
| Review type | Independent adversarial governance review for promotion |
| Review basis | `DEC-011`, `DEC-012`, `STR-01`, `STR-02` (verified LFSA evidence §0.2), v1.3 control set, repository configuration identifiers |
| Reviewed at | `1ad3cf3` |
| **Verdict** | **ACCEPT WITH CORRECTIONS APPLIED — PROMOTE** |

---

## 0. Summary

v1.4 was reviewed adversarially against the prior baseline, the two governing decisions and the repository's own configuration, **not** against the drafting session's report.

**Five material findings were raised. All five are corrected in the reviewed document.** Two were internal contradictions capable of unlocking a prohibited capability by implication; one materially understated a confirmed product pillar; two were terminology defects in un-revised inherited sections.

After correction the document satisfies every promotion criterion: no regulatory overclaim, no internal contradiction, no accidental capability unlock, no loss of a material v1.3 control, correct `DEC-011`/`DEC-012` implementation, correct effective-date treatment, correct fail-closed treatment.

---

## 1. Findings raised and corrected

| # | Severity | Location | Finding | Correction |
|---|---|---|---|---|
| **F1** | **HIGH** | §10.1 item 2 | *"Exchange features must remain disabled **until Exchange approval is granted**"* — inherited un-revised from v1.3. Read with the frozen identifiers (which include `exchange.matching_engine` and `exchange.client_to_client_matching`), this states that an Exchange approval would unlock internal matching — **directly contradicting §7.7's standing prohibition and §4.1's correction**. An accidental capability unlock by implication | Split into the two lock classes: securities/financial-instrument Exchange capability is **pending approval**; internal client-to-client matching is a **standing prohibition not unlocked by any Exchange approval** |
| **F2** | **HIGH** | §10.1 item 5 | *"must not allow exchange-style order matching **before approval**"* — same defect, same mechanism | Restated as a standing prohibition, explicitly *"not conditional on any approval"* |
| **F3** | **MEDIUM** | §10.1 item 6, §10.6 item 1 | *"Spot broking must remain **quote-and-confirm**"* mandated the v1.3 execution flow as the only permitted one, **contradicting §7.3's Model A** (recorded client orders routed externally), which the same document accepts. An internal contradiction that would have left the document self-defeating on its central architectural change | Both restated to Model A, with quote-and-confirm expressly preserved as valid for OTC/RFQ (§10.5). §10.6 item 3 generalised to cover a recorded client instruction per LFSA-DMB-2025 ¶5.5 |
| **F4** | **MEDIUM** | §12B | **AIX RWA was narrowed to a classification gate.** Seven required lifecycle stages were absent entirely — structuring, token configuration, smart-contract orchestration, offering, allocation, corporate actions, redemption — and issuer, asset onboarding, holder registry and servicing appeared only in passing. RWA is a **confirmed** target pillar; this would have propagated an undersized RWA domain into the Module Index and SRS | §12B restructured. New §12B.1 establishes the full 19-stage asset-lifecycle scope with mandatory shared-core reuse; §12B.2 retains the classification boundary. Scope confirmed; **activation still gated** |
| **F5** | **LOW** | §5.1 items 6–8 | Retained v1.3 product naming ("MB Spot Broking Terminal", "LP-backed quote request") in a **normative** build-scope list, inconsistent with §2A terminology | Renamed to AIX OTC / AIX Spot with the regulatory route explicitly unchanged, and the rename recorded inline |

**No finding required weakening a control.** F1 and F2 corrections make the document **stricter** than v1.3.

---

## 2. Promotion criteria — verification

| Criterion | Result | Evidence |
|---|---|---|
| Four real product pillars | **PASS** | §2B establishes Spot, OTC, Pay, RWA with regulatory routes. RWA confirmed, not hypothetical (§12B.1, after F4) |
| AIX Spot correctly bounded | **PASS** | §7.3 Model A; §7.7 no internal matching; §4.1 no principal/market-making/LP; §12A non-security assets only |
| AIX OTC correctly bounded | **PASS** | §20.2; external counterparties, pre-funded hold, DvP, settlement, reconciliation; internal matching prohibited |
| AIX Pay fails closed on unverified capability | **PASS** | §12D: anything beyond the §5.2 baseline is `PENDING / FEATURE-LOCKED`; third-party product sites excluded as authority |
| AIX RWA full lifecycle, gated | **PASS after F4** | §12B.1 scope; §12B.2 gate; §20.4 matrix |
| AIX Exchange reserved, not activated | **PASS** | §2A, §12C; terminology approved, activation not; `R1-Q1b` preserved |
| Model A accepted | **PASS** | §7.3 |
| Model B gated capability | **PASS** | §7.3, §7A; approves no venue; "lowest price wins" rejected |
| Model C blocked, no approval-unlock wording | **PASS after F1/F2** | §7.7 standing; §6 two-class table; scan for unlock wording now clean |
| Order store ≠ market depth ≠ matching book | **PASS** | §11A three-way distinction |
| No residual "no order book data structures" prohibiting the OMS | **PASS** | Sole occurrence is §11A's reframing note, which explicitly permits (1) and (2) and prohibits only (3) |
| Provider neutrality | **PASS** | No named provider in normative text; `primary_lp` removed from **both** parameter blocks (§7.5, §16); sole residual mention is inside the labelled historical §19 artefact |
| Asset gate before Spot/OTC admission | **PASS** | §12A platform-wide, citing LFSA-MB-2024 fn 1 to ¶1.2 (section 2 LFSSA); unresolved fails closed |
| Temporal treatment | **PASS** | §22 effective 1 January 2027; not represented as in force; §5.9 records pre-trade **and** post-trade incl. "close to real-time as technically feasible" |
| Prohibitions retained | **PASS** | All 14 §8.1 prohibitions plus §8.2/§8.3 verified present; §8A classifies all A–F; two strengthened; six new locks |
| Frozen identifiers intact | **PASS** | `exchange.*`, `securities.token_trading`, `feature_*`, `EXCHANGE_MODULE_LOCKED`, route-guard fragments — all present, none renamed; compatibility meanings in §9A |
| `DEC-011` implemented | **PASS** | §2C four-layer hierarchy; no balances on identity records; narrowing-only scope |
| `DEC-012` implemented | **PASS** | §7.3, §7.7, §11A, §11B, §12A, §2A — all seven clauses represented |
| Fail-closed | **PASS** | §21 thirteen conditions; unknown → deny; §23 questions hold capabilities disabled |
| v1.3 preserved | **PASS** | v1.3 unmodified (0 changed lines); historical artefacts retained and labelled, not rewritten |

---

## 3. Integrity-seal assessment

CFG-01 vendors `DOC00_SOURCE_VERSION = "v1.3"` and seals a hash over the Doc 00 licence facts and prohibited-feature registry.

**Assessment: promotion does not invalidate the seal, and no code change is required by this promotion.**

- **Licence status unchanged** — MB approved, PSO approved, Exchange pending (§1.C, §3).
- **Prohibited-feature scope unchanged** — v1.4 adds no row to, and removes no row from, the seeded 30-code registry. Its new locks (F1–F6 in §8A) are document-level controls, not registry rows.
- Because both hash inputs are unchanged, **the sealed hash remains correct**.

**Recorded consequence, deliberately not actioned here.** The constant's *version label* now names a superseded document version. Bumping it to `"v1.4"` would itself change the computed hash (`doc00_source_version` is a hash input) and therefore requires a reseal migration. That is a code and migration change, out of scope for a governance turn. Recorded as a downstream requirement in §25.3 and carried to the next code-touching turn. **The correct present state is: constant left at `"v1.3"`, seal valid, requirement recorded.**

---

## 4. Residual items — accepted, not blocking

| Item | Why not blocking |
|---|---|
| §13–§15, §17–§19 retained from v1.3 | Labelled as retained/superseded with pointers to the normative sections. Historical artefacts are preserved rather than rewritten, per §26 |
| §19 v1.3 review prompt still names a liquidity provider | Inside the explicitly labelled historical block. Rewriting it would falsify v1.3's review trail. A v1.4 review prompt requirement is recorded in that section |
| 20 unresolved regulatory questions | Correctly represented; each holds its capability disabled (§23). Unresolved ≠ unmanaged |
| Two module-numbering taxonomies persist | Pre-existing (`STR-01` §2.5); belongs to the Master Module Index re-baseline, not Doc 00 |

---

## 5. Verdict

**ACCEPT — PROMOTE `v1.4` to authoritative.**

Five findings were raised and all five corrected in the reviewed document. The corrected v1.4 loses no material v1.3 control, strengthens two, adds six, implements both governing decisions faithfully, and represents every unresolved regulatory question fail-closed.

`v1.3` is superseded prospectively and archived intact under `90_archive/masters/`. It is not rewritten, and its historical statements remain accurate for the period they describe.
