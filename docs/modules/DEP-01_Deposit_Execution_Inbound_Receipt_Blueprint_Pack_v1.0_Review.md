# Principal Fintech Platform Architect Review — DEP-01 Deposit Execution / Inbound Receipt v1.0

| Item | Details |
|---|---|
| Reviewed pack | DEP-01 Deposit Execution / Inbound Receipt Blueprint Pack v1.0 (16 files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 02–11 v1.2, FND-01/IAM-01/IAM-02/SEC-01 v1.2; CFG-01/CLT-01/KYC-01/AML-01/WLT-01/LED-01/TRD-01/E2E-01 cited v1.2 (E2E-01 accepted v1.1, compliance/money tier accepted v1.1 — see Consistency Note) |
| Review type | Principal Fintech Platform Architect — Initial Blueprint Review |
| Verdict | Strong, well-scoped ingestion-boundary draft with clean LED-01 separation and correct E2E-01 integration; **5 critical gaps** before acceptance. Most serious is **C1** — screening "clear" statuses are stored as durable refs and not re-validated as a coherent, still-current bundle at credit-request, and DEP-01 does not consume AML/WLT revocation for in-flight deposits. |

---

## 0. Summary

DEP-01 is the inbound deposit execution boundary — the ingestion edge between external bank/custodian/chain sources and LED-01's credit path, scoped from the E2E-01 register as the `DEP-01 Pending` boundary (E2E-C-021). It is a disciplined draft: it refuses to credit ("detect / authenticate / deduplicate / extract / match / hand off, never post ledger", §5.1, prohibited #1–3), binds every event to an E2E correlation ID (§5.10), integrates the saga/orphan-sweeper, deduplicates receipts by `(source_provider, source_event_id, source_transaction_ref)` (§5.3), extracts source metadata for WLT/AML, tracks confirmation by source type, quarantines conservatively on ambiguity, and routes reorg/recall/reversal to LED-01 clawback (§5.9). Boundaries are clean — no balance table, no ledger posting.

The five gaps are all in the dimensions unique to the point where external money *enters* the platform: screening freshness at credit-request (C1), source-of-funds / own-source binding (C2), finality trust (C3), receipt authenticity (C4), and reference/correlation/amount integrity in matching (C5). The theme mirrors the money tier: the boundary *declares* "clear before credit" but under-specifies the *mechanism* that makes each handoff real assurance.

---

## Critical Gaps

### C1 — Screening/confirmation "clear" statuses are captured at different times and not re-validated as a coherent, still-current bundle at credit-request; DEP-01 doesn't consume AML/WLT revocation for in-flight deposits — **HIGHEST PRIORITY**
**Area:** §5.7, WF-DEP01-06 ("when all required statuses are clear, request LED credit evaluation"), 05 §2.5 `deposit` (`wlt_decision_ref`/`aml_decision_ref` stored as durable refs), §5.10 (correlation), vs E2E-C-007 (AML revocation signal) / E2E-01 file 14 (decision-bundle coherence + freshness).

DEP-01 stores `wlt_decision_ref` and `aml_decision_ref` on the deposit and later requests LED credit "when statuses are clear." Those decisions are captured at different points and treated as **durable**: an AML clear at T can be revoked at T+1 (AML-01 emits revocation signals), yet DEP requests credit at T+2 on the stale stored ref. DEP-01 does not subscribe to AML/WLT revocation for in-flight deposits, and nothing requires the screening + confirmation statuses to be **mutually fresh and still-valid as one coherent bundle** (same correlation, none revoked) at the credit-request moment. This is the E2E-01 decision-bundle/freshness seam (file 14) applied at the deposit boundary — the one path by which an unscreened-since-revoked deposit could reach credit.

**Needed:** assemble and re-validate a coherent screening bundle (WLT + AML + confirmation, one correlation, none revoked, within freshness window) at the credit-request instant; subscribe to AML-01/WLT-01 revocation signals so an in-flight deposit whose source screening flips is pulled back to quarantine before LED credit.

### C2 — Source-of-Funds / own-source binding is missing; DEP screens the source for sanctions but never checks the deposit came from the client's own KYC-verified account/wallet, so third-party/unexpected-source inbound is not caught
**Area:** §5.4 (matches to *client*, not to client's *own source*), §5.5 (source extraction), vs WLT-01 §5.24 (outbound own-name/third-party rigor), KYC-01 verified identity.

A deposit is both a screening event and a **Source-of-Funds event**. DEP matches the receipt to a client and hands the source to WLT (address screening) and AML (sanctions/counterparty), but never asks whether the **source belongs to the client** — an own-account/own-wallet binding to KYC-01 verified identity — or is an approved third party. For an institutional/HNWI Money Broking + PSO, an inbound deposit from an **unexpected third-party source** that passes pure sanctions screening is a classic layering/mule pattern, and it is the exact mirror of the outbound own-name/third-party-prohibited rigor WLT-01 enforces (§5.24). There is also no SoF/SoW evidence linkage for large or first deposits.

**Needed:** bind inbound source to the client's KYC-verified own accounts/wallets; flag third-party or unexpected-source deposits for Source-of-Funds review (not auto-credit), symmetric with WLT-01's outbound own-source discipline; link SoF/SoW evidence for large/first deposits.

### C3 — Confirmation/finality is single-sourced and naive: crypto is a fixed count with no reorg-depth model or corroboration, and fiat "settled" ignores the recall/return window
**Area:** §5.6, 05 §2.6 `confirmation_status` (`current_confirmations`/`required_confirmations`/`finality_status`), WF-DEP01-05.

Finality is treated as a threshold or a flag. For crypto, a fixed confirmation count ignores **reorg depth beyond threshold**, probabilistic-vs-deterministic finality differences per chain, and the fact that a single indexer supplying the count could be wrong or compromised — there is no **per-chain finality model** and no **multi-source corroboration**. For fiat, a bank "settled" webhook can still be **recalled within the clearing/return window** (ACH/SEPA returns run days), but the model marks it `settled`/`sufficient` with no notion of the **remaining return window** before economic finality — so a LED credit can be requested on funds still recallable. This is the entry side of LED-01's clawback (§5.23), but DEP-01 should not signal "final/sufficient" until finality genuinely supports it.

**Needed:** a per-source finality model — reorg-depth-aware crypto finality with multi-source/indexer corroboration, and fiat return-window-aware finality (don't signal economic-final until the return/clearing window has passed or is explicitly risk-accepted) — feeding LED as evidence rather than a single count/flag.

### C4 — Receipt authentication is asserted but the provider-identity/key-management trust model and fabricated-receipt protection are thin; a deposit-ingestion endpoint is a prime injection target
**Area:** §5.2, WF-DEP01-02 (authenticate source/provider), 05 §2.2 `external_receipt.source_authenticated` (boolean), vs SEC-01 C3 (ingestion authenticity).

"Webhook/API/file source must be authenticated" with a payload hash is the right instinct, but the **mechanism and provider-identity binding are unspecified** — is the receipt bound to a verified provider signing identity / mutual TLS / rotated-key HMAC? A deposit endpoint is a high-value **injection target**: a spoofed receipt for a plausible amount/reference creates a pending deposit and, if it matches an intent, drives a credit request for money that never arrived — reconciliation catches "credited without confirmed receipt" only *after the fact*. There is also no **file-feed completeness/missing-file detection** (bank statement files: ordering, gaps), no cross-provider replay handling, and the failed-auth path merely "rejects" with no abuse/alert monitoring.

**Needed:** provider-identity-bound authentication (signing identity + key rotation, per SEC-01's ingestion-authenticity pattern), file-feed completeness/missing-sequence detection, and fabricated-receipt protection — the credit path must reconcile to an **independently-confirmed on-chain/bank truth**, never solely the inbound webhook, before LED credit is requested.

### C5 — Matching handles client ambiguity but not reference/address reuse, expired-intent deposits, or amount disposition (partial/over/under/dust); a receipt can bind to the wrong correlation, and unexpected value is uncontrolled
**Area:** §5.4 (matching keys), §5.10 (correlation binding), WF-DEP01-01 (intent expiry) / WF-DEP01-03, 05 §2.1 `deposit_intent` (`expected_amount` optional, `expires_at`), §2.4 `deposit_match`.

Two holes behind the conservative-ambiguity logic. **(a) Reference/address reuse & correlation mis-binding:** crypto addresses and virtual accounts are frequently reused or long-lived; if intents share/reuse an address or a client sends with a wrong/absent memo, a receipt can bind to the **wrong intent/correlation**. There is no rule requiring **unique-per-intent references/addresses**, no address-reuse policy, and no defined behaviour when a receipt matches an **expired/cancelled intent** (does a late deposit to an expired address credit, or quarantine?). **(b) Amount disposition:** `expected_amount` is optional and matching "compares amount," but there is no policy for **partial deposit, overpayment, underpayment, or dust/below-minimum** — actual ≠ expected has no defined route, yet an overpayment or far-exceeding deposit is both an ops and an AML unexpected-value signal.

**Needed:** unique-per-intent reference/address binding with an explicit address-reuse and expired-intent-deposit policy (late deposits to expired/cancelled intents → quarantine/review), and an explicit amount-disposition policy (partial/over/under/dust) where unexpected value routes to review, not silent credit.

---

## Recommended Corrections

1. **LED-pending creation timing vs orphans.** WF-DEP01-06 step 1 creates the LED pending deposit "as soon as receipt is authenticated" — before matching is confirmed — which can spawn orphaned LED pendings for unmatched/spoofed receipts. Tie LED-pending creation to a matched receipt, or ensure the E2E orphan sweeper explicitly reaps unmatched LED-pendings within SLA.
2. **Unmatched/rejected-deposit return path is a payout, not a shortcut.** Quarantine has no terminal "return-to-source" branch; returning funds is itself a payout and must run through WLT/AML/LED payout controls — and returning to a **sanctioned** source may be prohibited (asset-freeze), so route to Compliance/legal rather than auto-return.
3. **Re-check client eligibility at credit time.** Intent is created after a CLT/KYC/AML check, but funds may arrive days later when the client is suspended/expired. State that eligibility is re-checked at credit-request (ties C1) and a deposit for a now-frozen client is quarantined (prohibited #20 covers the credit; make the re-check explicit).
4. **Inbound Travel Rule capture.** Where the source is a VASP, capture originator/beneficiary Travel Rule data and hand it to AML-01 for **inbound** Travel Rule (the flows emphasise Travel Rule mostly on payout).
5. **Confirmation-threshold governance via CFG-01.** §5.6 r5 says threshold change "requires approval" but not where it is sourced — bind thresholds to CFG-01 as the config/licence authority (audited, governed), not a local DEP table, consistent with platform config governance.
6. **Reversal binds original correlation, not just original receipt.** WF-DEP01-08 notifies LED clawback — ensure the reversal carries the **original correlation/saga** linkage so E2E value-conservation and LED clawback-shortfall (LED §5.23) can tie the reversal to the original credit and any downstream use.

---

## Additional Parameters to Define

```txt
# Screening-bundle freshness (C1)
credit_request_revalidates   = coherent_bundle_wlt_aml_confirmation
screening_decision_freshness = window_bound_not_durable_ref
revocation_subscription      = aml_and_wlt_for_inflight_deposits
decl_deposit_on_revocation   = pull_back_to_quarantine

# Source-of-funds (C2)
inbound_source_binding       = client_own_kyc_verified_account_wallet
third_party_source           = flag_for_sof_review_not_auto_credit
sof_sow_evidence             = linked_for_large_or_first_deposit
own_source_symmetry          = mirror_wlt_outbound_own_name

# Finality model (C3)
crypto_finality              = reorg_depth_aware + multi_source_corroboration
fiat_finality                = return_window_aware_not_just_settled_flag
finality_signal_to_led       = evidence_only_after_true_finality

# Receipt authenticity (C4)
receipt_authentication       = provider_signing_identity + key_rotation
file_feed                    = completeness_and_missing_sequence_detection
fabricated_receipt_guard     = reconcile_to_independent_onchain_or_bank_truth
failed_auth                  = alert_and_abuse_monitor

# Matching / correlation / amount (C5)
intent_reference             = unique_per_intent
address_reuse_policy         = defined
expired_intent_deposit       = quarantine_review_not_auto_credit
amount_disposition           = partial_over_under_dust_defined
unexpected_value             = route_to_review

# Corrections
led_pending_creation         = on_match_or_sweeper_reaped
unmatched_return_path        = via_wlt_aml_led_payout_controls
credit_time_eligibility      = rechecked_frozen_client_quarantined
inbound_travel_rule          = captured_where_source_is_vasp
confirmation_threshold_source = cfg_01_governed
reversal_binds               = original_correlation_and_saga
```

---

## Consistency Note

DEP-01 sits correctly at the ingestion edge and honours the E2E-01 contract it was scoped from: it fulfils `E2E-C-021` (DEP-01 Pending deposit-execution boundary), binds every event to a correlation ID, integrates the saga/orphan-sweeper (§5.10), hands inbound source to WLT-01 §5.23 and the AML gate, requests LED-01 pending/credit/clawback (LED §5.6/§5.23), and structurally holds the "no ledger, no available balance" line (05 §1 rules 2–3, prohibited #1–3) — clean separation from LED-01. Two alignment items: (a) the unifying theme is the same one the money tier learned — the boundary *declares* "clear before credit" but needs the *mechanism* for freshness/revocation-coherence (C1) and finality trust (C3), plus the own-source and authenticity rigor (C2/C4) that turn a screening handoff into real assurance; and (b) version pinning — the dependency list cites everything at **v1.2 including E2E-01 v1.2** and TRD-01 v1.2, but E2E-01 is accepted at **v1.1** (no v1.2 yet) and CLT-01/KYC-01/AML-01/WLT-01/LED-01 are substantively accepted at **v1.1**; pin to the accepted versions or mark as forward references.

---

## Top Priorities

1. **C1** — re-validate a coherent, still-current WLT+AML+confirmation bundle at credit-request and subscribe to revocation for in-flight deposits; a de-cleared deposit must never reach LED credit.
2. **C2** — bind inbound source to the client's own KYC-verified accounts/wallets; third-party/unexpected sources go to SoF review, symmetric with WLT outbound.
3. **C3** — a real per-source finality model (reorg-depth crypto with corroboration; fiat return-window), not a single count/flag.
4. **C4 / C5** — provider-identity-bound authentication + independent-truth reconciliation against fabricated receipts, and reference/correlation-binding integrity + amount disposition.
