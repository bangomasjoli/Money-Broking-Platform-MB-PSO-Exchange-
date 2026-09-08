# Principal Fintech Platform Architect Review — Final Verification

## Document Reviewed: DEP-01 Deposit Execution / Inbound Receipt v1.1

| Item | Details |
|---|---|
| Reviewed pack | DEP-01 Deposit Execution / Inbound Receipt Blueprint Pack v1.1 (16 files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 02–11 v1.2, FND-01/IAM-01/IAM-02/SEC-01 v1.2; CFG-01/CLT-01/KYC-01/AML-01/WLT-01/LED-01/TRD-01/E2E-01 cited v1.2 (E2E-01 accepted v1.1; compliance/money tier accepted v1.1 — see Consistency Note) |
| Review type | Principal Fintech Platform Architect — Final Verification |
| Verdict | **All 5 critical gaps resolved; all 6 recommended corrections landed.** Tests 33 → 67; tables 12 → 19; FR 18 → 36; principles 12 → 24; prohibited 25 → 40; components 17 → 28. **Acceptance-ready.** One cosmetic version-cell nit only. |

---

## 0. Summary

Final verification pass on DEP-01, the inbound deposit execution boundary (E2E-C-021). The v1.1 revision closes every ingestion-edge gap from the v1.0 review with matching principles (§5.13–5.24), functional requirements (FR-019–036), schema tables/columns, prohibited-behaviour entries (#26–40), data rules (11–19), new state machines (§6–8), dedicated components, and tests. The suite expanded from **33 (TC-001–033) to 67 (TC-001–067)** across five new sections mapping one-to-one onto the gaps and corrections. DEP-01 is ready for acceptance — the first supporting/execution-rail module accepted, and it keeps its clean "no ledger, no balance" separation intact throughout.

---

## 1. Critical Gaps — Resolution Status

| # | Prior Gap | Status | Evidence in v1.1 |
|---|---|---|---|
| C1 | Screening "clear" stored as durable refs, not re-validated fresh at credit-request; no revocation subscription | **Resolved** | **§5.13** credit-request assembles + revalidates a coherent bundle (WLT + AML + confirmation + client eligibility + match + E2E snapshot + correlation + amount + revocation epochs), fail-closed on mixed-snapshot/stale/revoked, "stale stored references not sufficient", failed bundle → quarantine before LED credit; **§5.14** subscribes to AML/WLT revocation, pulls in-flight deposits to review/quarantine, notifies LED clawback if already credited; new **`credit_screening_bundle`** (2.13) + **`revocation_signal`** (2.14); `deposit.credit_bundle_ref`; components **Screening Bundle Validator** + **AML/WLT Revocation Subscriber**; **FR-019/020**; prohibited #26/#27/#28; data rules 11/12; state machine **§6**; tests **TC-034–038** |
| C2 | No source-of-funds / own-source KYC binding; third-party inbound uncaught | **Resolved** | **§5.15** inbound source compared to client's KYC-verified own account/wallet, third-party = not-auto-credit → SoF review, approved third-party requires Compliance/MLRO, SoF/SoW for large/first deposit, explicitly mirrors WLT outbound own-name; `source_metadata` gains `own_source_status`/`kyc_verified_source_ref`; new **`source_of_funds_review`** (2.15); `deposit.sof_sow_evidence_ref`; component **Source-of-Funds Binder**; **FR-021/022**; prohibited #29/#30; data rule 13; state machine **§7**; tests **TC-039–042** |
| C3 | Naive finality (fixed crypto count; fiat ignores return window) | **Resolved** | **§5.16** per-source finality model — crypto reorg-depth-aware + multi-source corroboration + dropped/replaced monitoring; fiat value-date + clearing/return/recall window + risk-acceptance if credit before window closes; finality = evidence not authority; model changes governed by CFG-01; `confirmation_status` gains `finality_model`/`corroboration_status`/`return_window_until_utc` + `economic_final`/`return_window_open` statuses; `deposit.finality_model_ref`; component **Finality Model Engine**; **FR-023/024/025**; prohibited #31/#32; data rule 14; tests **TC-043–045** |
| C4 | Thin receipt-auth trust model; no fabricated-receipt guard | **Resolved** | **§5.17** provider signing-identity/HMAC/mTLS + key rotation/expiry, source-feed allowlist, file sequence/completeness checks, **fabricated-receipt mitigated by independent bank/chain/custodian truth reconciliation**, "webhook alone not enough to request credit"; `external_receipt` gains `provider_identity_ref`/`independent_truth_status`/`file_sequence_no`; new **`provider_identity`** (2.16) + **`file_feed_control`** (2.17); components **Provider Identity Verifier** + **File Feed Completeness Monitor** + **Independent Truth Reconciler**; **FR-026/027/028**; prohibited #33/#34/#35; data rule 15; tests **TC-046–048** |
| C5 | Reference/address reuse → wrong-correlation binding; no amount disposition | **Resolved** | **§5.18** unique-per-intent reference/address, reusable-pool memo/tag policy, expired/cancelled-intent → quarantine, no loose correlation inference, manual override maker-checker; **§5.19** amount cases (exact/partial/over/under/dust/unexpected/split) with unexpected → review, overpayment → SoF/AML, no silent excess credit; `deposit_intent` gains `reference_uniqueness_mode`/`address_reuse_policy_ref`; `deposit_match` gains `intent_status_at_match`/`amount_disposition_status`; new **`amount_disposition`** (2.18); components **Reference Integrity Guard** + **Amount Disposition Engine**; **FR-029/030/031**; prohibited #36/#37/#38; data rules 16/17; tests **TC-049–053** |

---

## 2. Recommended Corrections — Resolution Status

| # | Correction | Status | Evidence |
|---|---|---|---|
| 1 | LED-pending creation timing vs orphans | **Resolved** | **§5.21** preferred timing = after matched receipt; pre-match pending labelled unmatched + sweepable; E2E orphan sweeper reaps within SLA; spoofed/rejected leave no active pending; component **LED Pending Orphan Guard**; **FR-033**; test TC-056 |
| 2 | Unmatched-return is a payout, not a shortcut | **Resolved** | **§5.22** no auto-return; return via WLT/AML/LED payout controls; sanctioned/frozen source may be legally prohibited → Compliance/legal; new **`return_case`** (2.19); component **Return Path Controller**; **FR-034**; prohibited #39; data rule 18; state machine **§8**; tests TC-054/TC-055 |
| 3 | Re-check client eligibility at credit time | **Resolved** | **§5.23** CLT/KYC/AML/freeze/CFG rechecked at credit-request, now-frozen client quarantined, part of coherent bundle; **FR-035**; test TC-057 |
| 4 | Inbound Travel Rule capture | **Resolved** | **§5.20** capture originator/beneficiary/VASP/jurisdiction + missing-data reason, hand to AML-01; `source_metadata.travel_rule_ref`; component **Inbound Travel Rule Capture Service**; **FR-032**; test TC-058 |
| 5 | Confirmation-threshold governance via CFG-01 | **Resolved** | **§5.16** r4 finality model changes governed by CFG-01; test TC-059 |
| 6 | Reversal binds original correlation, not just receipt | **Resolved** | **§5.24** reversal carries original correlation + deposit ID + LED journal/credit ref, updates E2E saga/value-conservation, LED clawback traces original client + downstream use, SEC links original+reversal; **FR-036**; prohibited #40; data rule 19; tests TC-060/TC-061 |

---

## 3. Remaining Items (cosmetic — non-blocking)

1. **`01` §1 Document Control** still shows `Pack version | v1.0` while this is the v1.1 pack (the Status line correctly records the revision, listing every added control). The recurring version-cell miss — a clean rollup can close it.
2. **Version pinning.** Dependency list cites all upstreams at **v1.2 including E2E-01 v1.2**; E2E-01 is accepted at **v1.1** and CLT/KYC/AML/WLT/LED are substantively accepted at **v1.1** (clean rollups landing). Pin to accepted versions or mark as forward references.

No control is affected.

---

## 4. Verdict

DEP-01 v1.1 is **substantively resolved and acceptance-ready.** The most serious gap — C1, a deposit that passed screening being credited on stale durable decision refs after that screening was revoked — is now closed with a credit-request coherent-bundle revalidation (WLT + AML + confirmation + client eligibility bound to one correlation, point-in-time snapshot, and revocation epochs, fail-closed on any mismatch/staleness/revocation) plus a live AML/WLT revocation subscription that pulls in-flight deposits back to quarantine and notifies LED clawback if credit already occurred. This is the E2E-01 decision-bundle/freshness seam (files 14) correctly implemented at the deposit boundary. Source-of-funds is now real: inbound source is bound to the client's KYC-verified own account/wallet, and third-party/unexpected sources route to SoF review rather than auto-credit, symmetric with WLT-01's outbound own-name discipline (C2). Finality is now modelled per source — reorg-depth-aware crypto with multi-source corroboration and return-window-aware fiat, feeding LED as evidence only once economically final (C3). Receipt authenticity is hardened with provider signing-identity + key rotation, file-feed completeness detection, and — crucially — a fabricated-receipt guard requiring independent on-chain/bank truth before a credit request, so a spoofed webhook cannot drive credit (C4). And matching integrity now enforces unique-per-intent references with an explicit reuse/expired-intent policy plus a full amount-disposition policy so wrong-correlation binding and silent unexpected-value credit are both prevented (C5).

All six corrections landed, including LED-pending orphan control, the unmatched-return path routed through WLT/AML/LED payout controls (with sanctioned-source returns escalated to Compliance/legal), credit-time eligibility recheck, inbound Travel Rule capture, CFG-01-governed finality/threshold config, and reversal-to-original-correlation binding for traceable clawback. Coverage expanded 33 → 67 tests across five new sections, with the go-live gate extended to require each new suite pass.

The boundary integration is now tight: DEP-01 authenticates and independently corroborates external receipts, binds source-of-funds to KYC identity, hands a *fresh, coherent, revalidated* screening bundle to WLT-01/AML-01/LED-01, and structurally cannot credit — LED-01 remains the sole credit authority, and every deposit, screening decision, finality signal and reversal is correlation-bound for the E2E saga and value-conservation model.

Recommend: **accept DEP-01 at v1.1** (a clean v1.2 rollup can fix the version-cell nit and repin the baseline as the remaining rollups land).

Next per the E2E-01 register: **WDR-01 Withdrawal / Payout Execution Rail** (E2E-C-022) — the symmetric *outbound* boundary that DEP-01's return path already depends on (§5.22). Expect it to consume WLT-01 verify-and-consume, the AML pre-transaction gate, LED-01 atomic reserve/settlement, and the E2E saga, and to carry the outbound counterpart of DEP-01's finality (rail confirmation), fabricated-instruction, and reversal controls. After that: reconciliation/finance reporting, client/staff portals, and the incident/freeze/recovery module.
