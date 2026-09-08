# Principal Fintech Platform Architect Review — WDR-01 Withdrawal / Payout Execution Rail v1.0

| Item | Details |
|---|---|
| Reviewed pack | WDR-01 Withdrawal / Payout Execution Rail Blueprint Pack v1.0 (16 files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 02–11 v1.2, FND-01/IAM-01/IAM-02/SEC-01 v1.2; CFG-01/CLT-01/KYC-01/AML-01/WLT-01/LED-01/TRD-01/E2E-01/DEP-01 cited v1.2 (E2E-01/DEP-01 accepted v1.1, compliance/money tier accepted v1.1 — see Consistency Note) |
| Review type | Principal Fintech Platform Architect — Initial Blueprint Review |
| Verdict | Strong, well-scoped outbound boundary; clean LED/WLT/AML separation and correct E2E-01 integration. **5 critical gaps** before acceptance — all in the dimensions that matter because a payout is irreversible. Most serious is **C1** — the decision bundle is validated before the instruction is built but never re-validated atomically at the point of transmission. |

---

## 0. Summary

WDR-01 is the outbound payout execution boundary — the highest-consequence edge on the platform, where client money leaves irreversibly to banks/custodians/chains/rails, scoped from the E2E-01 register as `E2E-C-022`. It is the strongest first-draft boundary in the set: it already carries the money-tier lessons — a coherent decision bundle (WF-02) bound to one correlation, WLT-01 verify-and-consume (§5.3), the AML-01 pre-transaction gate + Travel Rule (§5.4), LED-01 reserve-required-before-instruction (§5.2), CFG-01 kill-switch + IAM-02 maker-checker/dual-auth revalidation (§5.5), approved-provider authentication (§5.6), idempotency/replay protection (§5.7), provider query-back on timeout (§5.7 r6 / WF-05), a per-rail finality model where ack ≠ finality (§5.8), no principal/operational funding (§5.11), freeze/kill-switch in-flight handling (§5.13), return/reversal → LED (§5.9), and correlation/saga binding (§5.12). It structurally holds "no ledger, no balance, no keys stored" (05 §1).

The five gaps are the residual ones unique to *irreversible outbound execution* — the controls a payout rail needs beyond what an inbound boundary requires: a send-time atomic re-check (C1), outbound value conservation (C2), last-mile destination integrity (C3), batch/file execution (C4), and one-reserve-one-send double-pay protection (C5).

---

## Critical Gaps

### C1 — The decision bundle is validated before the instruction is built but never re-validated atomically at the transmission instant; the build→sign→send window is an unguarded TOCTOU on an irreversible action — **HIGHEST PRIORITY**
**Area:** WF-WDR01-02 (bundle validation), WF-WDR01-03 (build/sign), WF-WDR01-04 (transmit — no revalidation step), §5.3 r5 / §5.4 r6 / §5.13 (acknowledge revocation-in-flight but no send-time gate), 06 §1 (`bundle_validated → submitted`).

WF-02 validates the coherent bundle, WF-03 builds and signs the instruction, WF-04 transmits — and **nothing re-checks the bundle at the point of transmission**. Between validation and the irreversible send, WLT/AML/CFG can revoke, the kill-switch can flip, or the LED reserve can change (the module itself acknowledges in-flight revocation in §5.3/5.4/5.13, but provides no send-time enforcement). Once the instruction hits the rail it is typically irreversible, so a bundle stale by milliseconds sends real client money. This is the outbound, highest-consequence version of the execution-time re-validation LED-01, WLT-01, TRD-01 and DEP-01 all had to add. WF-04 currently just "submits."

**Needed:** an atomic **revalidate-and-transmit** — re-check the coherent bundle (WLT/AML revocation epochs, CFG kill-switch, LED reserve still pinned, IAM/CFG current) in the same critical section that marks the instruction submitted, fail-closed, so nothing can change between the last check and the point of no return.

### C2 — No outbound value-conservation invariant: the reserved amount, instruction amount, rail/network fee, partial sends and rail-side FX aren't bound, so value can diverge with no defined home
**Area:** §5.2 (reserve match), §5.8 (finality), §5.11 (no principal funding), 05 §2.6 `finality_record` (no fee/amount-sent fields), vs LED-01 §5.25 residual/operational bounds, TRD-01 fill conservation.

WDR validates that the reserve amount matches the request, but there is no invariant binding **reserved amount = amount actually sent + disclosed rail/network fee + bounded residual**. There's no handling of a **network fee/gas** (which reduces what the beneficiary receives, or must be funded — from where?), **partial payout** (a bank clears less, or a batched item partially settles), or **rail-side FX** (instructed in asset A, rail converts to B — who bears the slippage?). This is the outbound mirror of the TRD↔LED residual-seam gap: without a conservation contract, the delta between reserve and actual send lands in an operational/suspense account (the LED §5.25 backdoor) or is silently absorbed (principal exposure — the very thing §5.11 forbids).

**Needed:** a per-correlation payout value-conservation invariant — reserved = sent + disclosed fee + bounded residual, with explicit partial/fee/FX disposition, `amount_sent`/`fee` captured on the finality record, and reconciliation to the LED settlement so no value leaks or is AIX-absorbed.

### C3 — Last-mile beneficiary-detail integrity is unprotected: nothing binds the signed instruction's destination/amount to the WLT-consumed canonical decision, or makes the payload tamper-evident end-to-end (the payment-alteration / BEC vector)
**Area:** §5.3 (WLT consume), §5.6 (authenticate *channel*), WF-WDR01-03 (build/sign, store payload hash), 05 §2.4 `provider_instruction.request_payload_hash`, vs WLT-01 §5.25 (address canonicalisation/poisoning).

The design authenticates the *provider channel* and consumes the WLT decision, but the critical outbound control is that the **beneficiary details in the actual signed provider payload equal the WLT-verified canonical destination** — canonical account/wallet, amount, asset — and cannot be altered between build, sign and provider receipt. WLT-01 did all the address-canonicalisation/poisoning work for the *whitelist*; WDR must guarantee the **instruction it signs carries exactly that canonical destination**, not a mutated one, and that `request_payload_hash` binds the *full beneficiary detail* and is verified end-to-end. Payment-instruction alteration in the last mile (BEC / insider swap of an account number) is the classic payout-fraud vector, and high-value outbound payloads warrant independent/four-eyes verification of the destination actually being sent.

**Needed:** cryptographically bind the signed instruction's canonical destination + amount + asset to the consumed WLT decision, make the payload tamper-evident from build through provider receipt, and require independent verification of the outbound beneficiary detail above a value threshold.

### C4 — Batch/file payout rails are unmodelled: no batch envelope, per-item vs whole-file finality, partial-batch failure, batch-vs-item idempotency, or outbound file integrity
**Area:** §5.6 r5 (file/API sequence), §5.7 (idempotency per instruction), WF-WDR01-04 (single submit), 05 §2.4 (`provider_instruction` = one per payout), Open Item 2 (bank file format).

Real fiat payout rails are **batch/file-based** — one file carries N payouts — but the design models a single `provider_instruction` per payout with no **batch/file envelope**. So: per-item finality when the bank acks the *file* not each item is undefined; a **partial-batch outcome** (item 3 of 10 fails/returns) has no model; **batch-vs-item idempotency** risks a retry re-sending the other N−1 items; and there's no **outbound file completeness/checksum** so a truncated or altered file isn't partially executed. This is a concrete operational and money-safety gap for fiat rails.

**Needed:** a batch/file payout envelope with per-item finality tracking, defined partial-batch handling, batch-level *and* item-level idempotency, and outbound file integrity (checksum/manifest) so a batch cannot be partially or doubly executed.

### C5 — Double-pay protection is only per-provider-instruction; nothing enforces one-reserve → at-most-one-successful-send or dedups the logical payout across execution records
**Area:** §5.7 (idempotency within an instruction), §5.2 (reserve binding), 05 §2.1 `payout_execution` (distinct IDs), vs LED-01 atomic reservation (prevents balance overspend, not double-instruction).

Idempotency is keyed on the provider instruction within one execution. But the dangerous double-pay is one level up: the **same logical withdrawal arriving twice** — upstream retry, saga replay, client double-submit — creating two `payout_execution` rows, each validating its own bundle and each sending. There's no stated **exclusive one-reserve → at-most-one-successful-instruction** invariant binding a LED reserve to a single terminal outbound send, and no **logical-payout dedup** (correlation + client + destination + amount) across execution records. LED atomic reservation stops *balance* overspend, but a single reserve could be referenced by two WDR executions if not exclusively bound.

**Needed:** an exclusive reserve-to-instruction binding (one reserve can back at most one successful send, enforced atomically) plus logical-payout dedup across `payout_execution` records within a correlation, so a replayed or duplicated request cannot produce a second real send.

---

## Recommended Corrections

1. **Bind state transitions to `status_version` compare-and-set.** `payout_execution.status_version` exists but transitions aren't stated to be CAS-guarded — the same fix TRD-01 needed. Out-of-order provider events (finality before ack, late finality after timeout/cancel) must reject/park via CAS, not overwrite.
2. **Define `executed_late` disposition.** The cancellation state carries `executed_late`, but the *outcome* isn't defined — a payout cancelled locally yet executed by the rail is a real irreversible send; it must reconcile to LED as an **actual settlement** (money left) + exception, never leave the reserve released or the payout shown "cancelled."
3. **Provider signing-key management table.** §5.6 references a key/credential but there's no provider-identity/key-rotation model (DEP-01 added `provider_identity`); mirror it for **outbound signing keys** — rotation, expiry, revocation, and HSM/custody of the signing material, since WDR signs value-moving instructions.
4. **Travel Rule payload consistency at send.** WDR validates Travel Rule *status* — also confirm the Travel Rule payload **transmitted to the rail matches** the AML-provided originator/beneficiary data (no divergence between what AML cleared and what was sent), and handle counterparty-VASP-unreachable/sunrise at execution.
5. **Pinned-reserve SLA + stuck-payout escalation.** Reserve stays pinned until terminal (good), but bank/chain finality can be slow; define a **max-pending SLA** and stuck-payout escalation so a reserve isn't pinned indefinitely on `unknown`, and the E2E sweeper reaps orphaned instructions (recon references orphans but no SLA is defined here).
6. **Client-facing status truthfulness.** Mirror TRD-01's settlement-truth: client/staff payout status (WF-06 step 6) must reflect **actual rail finality + LED outcome**, never "paid/complete" on provider-ack-only (§5.8 r1 already says ack ≠ finality), and a return/reversal must correct a previously-shown status.

---

## Additional Parameters to Define

```txt
# Atomic revalidate-and-transmit (C1)
send_time_revalidation   = atomic_bundle_recheck_in_send_critical_section
recheck_covers           = wlt_aml_revocation_epoch + cfg_killswitch + led_reserve_pinned
stale_bundle_at_send     = fail_closed_no_transmit
point_of_no_return       = guarded

# Outbound value conservation (C2)
payout_conservation      = reserved = sent + disclosed_fee + bounded_residual
network_fee_disposition  = defined_client_or_policy_never_principal
partial_payout           = defined_disposition
rail_side_fx             = defined_owner_never_aix_absorbed

# Last-mile integrity (C3)
instruction_destination  = equals_wlt_consumed_canonical_destination
payload_tamper_evidence  = build_to_provider_receipt
high_value_beneficiary   = independent_or_four_eyes_verification

# Batch/file execution (C4)
batch_envelope           = per_item_finality + partial_batch_handling
idempotency_scope        = batch_level_and_item_level
outbound_file_integrity  = checksum_manifest_completeness

# Double-pay protection (C5)
reserve_to_instruction   = exclusive_one_successful_send
logical_payout_dedup     = correlation+client+destination+amount
duplicate_request        = cannot_produce_second_send

# Corrections
state_transition         = status_version_compare_and_set
executed_late            = reconcile_as_settled_plus_exception
provider_signing_keys    = rotation_expiry_revocation_hsm
travel_rule_payload      = matches_aml_cleared_data
pinned_reserve_sla       = max_pending + stuck_escalation + orphan_sweep
client_status            = reflects_rail_finality_and_led_truth
```

---

## Consistency Note

WDR-01 is the strongest first-draft boundary in the set and correctly fulfils the E2E-01 contract it was scoped from: it honours `E2E-C-022` (WDR-01 outbound rail boundary), validates a coherent decision bundle (WF-02) bound to one correlation, consumes WLT-01 verify-and-consume, validates the AML-01 pre-transaction gate + Travel Rule, requires an active LED-01 reserve and leaves settlement/journal to LED, revalidates the CFG-01 kill-switch and IAM-02 maker-checker/dual-auth, resolves timeouts by provider query-back (the pattern TRD-01 established), models per-rail finality (ack ≠ finality), forbids principal/operational funding (§5.11), and structurally holds "no ledger, no balance, no keys stored" (05 §1) — and it is the counterpart that DEP-01's return path (§5.22) already depends on. Two alignment items: (a) the residual gaps are the ones unique to *irreversibility* — a send-time atomic re-check (C1), outbound value conservation (C2), last-mile destination integrity (C3), batch execution (C4), and one-reserve-one-send (C5) — the controls a payout rail needs beyond what an inbound boundary requires; and (b) version pinning — the dependency list cites everything at **v1.2 including E2E-01 v1.2 and DEP-01 v1.2**, but E2E-01/DEP-01 are accepted at **v1.1** and the compliance/money tier is substantively at **v1.1**; pin to accepted versions or mark as forward references.

---

## Top Priorities

1. **C1** — atomic revalidate-and-transmit; the bundle must be re-checked in the send critical section because the send is irreversible.
2. **C2** — outbound value conservation (reserve = sent + fee + residual; partial/fee/FX disposition), so no value leaks or is AIX-absorbed.
3. **C3** — bind the signed instruction's canonical destination/amount to the WLT-consumed decision, tamper-evident, with high-value verification.
4. **C4 / C5** — batch/file payout envelope with per-item finality and integrity, and exclusive one-reserve-one-send with logical-payout dedup.
