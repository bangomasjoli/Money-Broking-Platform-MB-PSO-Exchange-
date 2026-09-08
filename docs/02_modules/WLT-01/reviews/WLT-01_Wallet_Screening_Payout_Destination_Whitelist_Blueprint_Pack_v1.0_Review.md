# Principal Fintech Platform Architect Review — WLT-01 Wallet Screening / Payout-Destination Whitelist v1.0

| Item | Details |
|---|---|
| Reviewed pack | WLT-01 Wallet Screening / Payout Destination Whitelist Blueprint Pack v1.0 (16 files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 02–11 v1.2, FND-01/IAM-01/IAM-02/SEC-01/CFG-01/CLT-01/KYC-01/AML-01 v1.2 |
| Review type | Principal Fintech Platform Architect — Initial Blueprint Review |
| Verdict | Strong structure; **5 critical gaps** before acceptance. Most serious is C1 — the eligibility decision token isn't re-validated at money-movement, so a revoked destination can be used on a pre-issued token. |

---

## 0. Summary

WLT-01 is a strong money-tier draft and the first to consume the AML-01 real-time pre-transaction gate (AML-01 §5.16). It binds to CLT-01 client status/mandate, uses KYC beneficiary data, inherits IAM-02 maker-checker + client-side dual auth (WF-IAM02-10), SEC-01 sensitive-read + fail-closed, and the CFG-01 gate, and correctly keeps custody/keys/execution out of scope. Whitelist-before-movement, cooling-off, immediate revocation, action-scoped decision token, third-party-fiat prohibition, and vendor integrity are present and coherent. The five gaps are in the **execution binding**, **value controls**, and **crypto-specific** dimensions of a destination gate.

---

## Critical Gaps

### C1 — Destination decision token is short-lived but not re-validated at execution (TOCTOU) — **HIGHEST PRIORITY**
**Area:** §5.18 (decision token binding), §5.15 ("revocation … invalidates decision tokens"), WF-WLT01-05, 05 §2.7 `destination_decision`.

The token binds AML hash, risk-result version, whitelist version, mandate version, and expiry — good — but nothing requires the downstream payout/settlement module to **re-validate it against current state at the point of money movement**. That's the exact IAM-02 C1 / CFG-01 kill-switch failure mode: destination cleared at T, revoked at T+1 (AML true hit or client suspension), payout executes at T+2 on a still-unexpired token. §5.15 says revocation "invalidates decision tokens," but there is no **positive revocation-epoch / whitelist-version re-check enforced at consume time** — TTL alone leaves a window where a revoked destination is usable. For a destination gate, this defeats the entire control.

Needed: make token consumption a **hard contract** with MON/settlement — the token must be **re-validated atomically at execution** against current revocation/whitelist/AML state (positive-epoch check, fail closed if anything changed after issuance), not merely presented before TTL.

### C2 — No value / velocity / limit or new-destination first-use controls; the gate has no notion of amount
**Area:** §5.1 (eligibility only), §5.18 (token has no amount binding), 05 (no limit fields), 07 §5 (decision rules).

WLT-01 answers "*is this destination allowed?*" but never "*how much / how often?*". There are no **per-destination or per-client limits** (per-transaction max, daily/velocity caps), no **concentration control**, and no **constrained first-use** after a new destination activates. A large first payout to a freshly whitelisted destination is a classic account-takeover/fraud pattern, and a compromised session could drain funds to a legitimately-whitelisted destination unchecked. Cooling-off delays *activation* but doesn't cap *value*.

Needed: destination-level and client-level **risk-based limits/velocity caps** carried by WLT-01 and enforced at the use-gate (and by MON), plus a **lower first-use limit / step-up** for newly-activated destinations.

### C3 — Inbound deposit-source screening is in scope but unspecified; the module is outbound-focused
**Area:** §3 item + §5.1 ("relevant deposit attribution"), `destination_decision.action_type = deposit_attribution`, but no inbound workflow.

`deposit_attribution` appears as an action, yet every workflow screens **registered client destinations (outbound)** — there is no flow to screen the **sending wallet/bank source of an inbound deposit** (source-of-funds, sanctioned/high-risk sender). For a PSO, money arriving from a sanctioned or high-risk source is a sanctions and SoF risk that must be caught, **held/quarantined**, and routed to Compliance before crediting — equal treatment to outbound.

Needed: an **inbound source-screening workflow** — screen the originating address/account of deposits; a deposit from an unscreened/sanctioned/high-risk source is **held/quarantined pending Compliance**, never auto-attributed/credited.

### C4 — Unhosted-wallet proof-of-control is optional, and wallet destinations lack the own-name rigor applied to fiat
**Area:** §5.8/5.9, 05 §2.2 `proof_of_control_status = not_required/…`, vs §5.11 (fiat third-party prohibited).

For fiat, §5.11 is strict: beneficiary must match and **unapproved third-party payout is prohibited**. For wallets, §5.9 is soft ("may require ownership/control evidence … according to policy") and `proof_of_control_status` can be **`not_required`** — a hole for the **highest-risk destination type**. Withdrawals to **unhosted/self-hosted wallets** (no counterparty VASP) warrant *stronger* control: proof of control (signed-message/Satoshi test) and enhanced Travel-Rule/counterparty-absent handling, plus the same **own-name / first-party binding and third-party prohibition** the platform's own-name-whitelist principle mandates.

Needed: **required proof-of-control for unhosted wallets** (signed message / micro-deposit), enhanced handling where no counterparty VASP exists, and **wallet own-name/first-party binding with third-party prohibition** symmetric with fiat.

### C5 — Address-poisoning and canonicalisation integrity for crypto destinations
**Area:** §5.7 ("exact match after canonicalisation"), WF-WLT01-01 step 5, 05 §2.2 `address`/`address_hash`, Open Items 4/5.

Exact-match-after-canonicalisation is required, but the **canonicalisation correctness** is unspecified — chain-specific checksum/case/format handling, and **name-service (ENS-style) resolution to a raw address that is never stored as a name** — and there's no **address-poisoning / lookalike protection** at registration (full-address re-confirmation by the client, screening against known-scam/lookalike addresses). A canonicalisation bug (treating two different addresses as the same, or vice-versa) or a poisoned lookalike address copied by the client is a **direct, irreversible fund-loss** vector unique to crypto rails.

Needed: chain-specific canonicalisation rules with test coverage; name-service resolution to raw address (never store a name); and address-poisoning protection at registration (client full-address re-confirmation + scam-address screening).

---

## Recommended Corrections

1. **Chain/provider coverage:** define the supported-chain list and analytics coverage; screening on an **unsupported chain/asset is not `clear`** (hold/review), mirroring AML-01's coverage discipline.
2. **Subscribe to AML-01 outcome revocation:** AML-01 §5.23 revokes a prior clear on a new hit — WLT-01 should **consume that revocation signal** (revoke affected destinations immediately), not only re-check the AML gate at use time.
3. **Tie wallet ownership + payout beneficiary to KYC-01 data:** where the beneficiary is a related party/UBO, bind to KYC-01 verified identity so the relationship is evidence-based (ties C4).
4. **Cooling-off ↔ new-risk interplay (explicit):** confirm a revocation/new hit **during** cooling-off cancels activation and requires re-approval (WF-04 rule 2 hints at re-check — state it as a hard rule).
5. **Deposit mis-attribution guard:** an inbound deposit that cannot be matched to a screened source/destination is **quarantined**, never auto-credited (ties C3).

---

## Additional Parameters to Define

```txt
# Execution-time binding (C1)
decision_token_revalidated_at_execution = true
decision_token_revocation_epoch_bound   = true
destination_use_consumption_contract     = hard_with_mon_settlement
ttl_only                                  = insufficient_revalidate_current_state

# Value controls (C2)
destination_limits            = per_destination_and_client
velocity_caps                 = daily+per_transaction
new_destination_first_use     = constrained_lower_limit_or_stepup
concentration_limit           = to_be_defined

# Inbound screening (C3)
inbound_source_screening      = enabled_for_deposits
deposit_from_unscreened_source = hold_quarantine_compliance

# Unhosted wallet / own-name (C4)
unhosted_wallet_proof_of_control = required_signed_message_or_microdeposit
wallet_own_name_binding          = first_party_or_approved_beneficiary
wallet_third_party               = prohibited_unless_approved

# Address integrity (C5)
address_canonicalisation      = chain_specific_checksum_case_format
name_service_resolution       = resolve_to_raw_never_store_name
address_poisoning_protection  = full_address_reconfirm+scam_address_screen
supported_chain_list          = to_be_defined
unsupported_chain             = not_clear_hold_review

# Corrections
aml_outcome_revocation_subscription = enabled
wallet_beneficiary_from_kyc          = related_party_bound_to_kyc
```

---

## Consistency Note

WLT-01 pairs cleanly with the accepted tiers: it consumes AML-01's real-time pre-transaction gate (AML-01 §5.16) and Travel-Rule support, binds to CLT-01 client status/mandate, uses KYC beneficiary data, and inherits IAM-02 maker-checker + client-side dual auth (WF-IAM02-10), SEC-01 sensitive-read + fail-closed, and the CFG-01 gate. Two threads need tightening: the **own-name / third-party rigor is strong for fiat but soft for wallets** (C4), and the **decision-token pattern echoes IAM-02/CFG-01 but needs the same execution-time re-validation** those modules learned (C1). The unifying theme: WLT-01 models the destination *whitelist lifecycle* well but under-specifies *execution-time binding* (C1), *value controls* (C2), *inbound screening* (C3), *unhosted-wallet rigor* (C4), and *crypto address integrity* (C5).

---

## Top Priorities

1. **C1** — re-validate the decision token at execution against current revocation/whitelist/AML state; a revoked destination must never be usable on a pre-issued token.
2. **C2** — destination/client value + velocity limits and constrained new-destination first-use.
3. **C3** — inbound deposit-source screening with quarantine.
4. **C4 / C5** — unhosted-wallet proof-of-control + own-name rigor, and crypto address canonicalisation/poisoning integrity.
