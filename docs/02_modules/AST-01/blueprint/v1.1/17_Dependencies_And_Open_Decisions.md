# AST-01 — 17 Dependency-Change Requests, Human Decisions and Open Questions (v1.1)

**Status: REMEDIATED / AWAITING RE-REVIEW.** This task may modify only `docs/02_modules/AST-01/**` and `docs/03_implementation/tasks/AST-01/**`. Everything below that needs a change **outside** that boundary is **recorded here and not made**. No DCR is implemented by this branch. A human (or the owning module's track) decides each; the conductor promotes findings to `OPEN_FINDINGS.md`.

---

## 1. Human decisions

### 1.1 Approved by Aiman (recorded in the remediation turn)

| ID | Decision (as approved) | Where applied |
|---|---|---|
| **AST-HD-1** Fiat | Fiat is registered as **reference data** (currency identity, precision, ledger/payment references, pair-configuration inputs) and is **outside the §12A digital-asset classification/product-eligibility API**. A clear `NOT_APPLICABLE` / subject-not-applicable contract is used; fiat is never returned as digital-asset `INELIGIBLE`. MYR restrictions remain enforced by the pair/product control; AST-01 supplies the fiat identity/attribute, not the activation decision | 01 §3.10; 04 §2.2, §6.1 step 3; 05 §4.2; T-FIA-* |
| **AST-HD-2** Product admission | Keep `product_admission` as a **narrowing conjunct only**; never converts `INELIGIBLE`/`NOT_ASSESSED` into `ELIGIBLE`; bound to the current effective classification record; stale ⇒ inert | 01 §5.6; 05 §6–7; T-DER-03, T-SEC-06 |
| **AST-HD-3** Synthetic emulation | Keep `synthetic_emulates`: single source of truth, immutable from instrument creation, valid only for declared synthetic instruments, never production-valid, the classification record cannot contradict it | 01 §4.5; 05 §4.2, §5.1; T-SYN-* |
| **AST-HD-4** Presumptive classes | `TOKENISED_DEBT`/`TOKENISED_FUND` are **not** automatically securities by class label; they stay unresolved until governed classification establishes the outcome. For explicitly defined `SECURITY`/`SECURITY_TOKEN` outcomes the MB prohibition is absolute. `R4-Q3` and `R4-Q6` are **not** answered | 01 §3.4 |
| **AST-HD-6** Human holds | Until the Role Matrix establishes single-actor authority, **human-initiated holds/tightening use maker-checker**; no single-actor human authority is invented; a hold is a **narrowing deny conjunct** and does **not** change the classification outcome to `UNRESOLVED`; **system-detected integrity failure fails closed immediately** | 01 §4.6; 04 §4; 05 §5.2; 07 §2 |
| **AST-HD-8** `SECURITY → NON_SECURITY` | Elevated approval **plus lineage/history controls**; not bypassable via `SECURITY→UNRESOLVED→NON_SECURITY`, retire→recreate, or a replacement instrument under continuity; any lineage containing a previous `SECURITY` determination triggers the elevated path; new evidence after the last `SECURITY` determination required | 01 §3.9, §4.7; 05 §3, §5.1; T-SEC-10 |
| **AST-HD-9** Granularity | Classification **per instrument**; replacement/recreated instruments preserve governed lineage where identity or economic-subject continuity exists | 01 §3.1, §3.9 |
| **AST-HD-10** Token / logging | TTL **60 s**; **every** evaluate decision logged; the token is **not** an order-lifetime entitlement; eligibility re-evaluated/re-verified at each routing or execution attempt | 01 §5.8; 04 §6.2; DCR-AST1-004 |

### 1.2 NOT part of the approved package — recorded as pending, **not** as human-approved

| ID | Reviewed position | Working default in v1.1 (fail-closed) | Blocking? |
|---|---|---|---|
| **HD-5** Pay treatment of security outcomes | Independent review: **SUPPORTED WITH CORRECTION** (default-deny; include `PAY` in the DB backstop) | `PAY` × `SECURITY` ⇒ `INELIGIBLE` `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT`; `PAY` is in the MB/PSO domain and in backstop B1 | No. A default-deny needs no decision to be safe; only *permitting* it would |
| **HD-7** Meaning of `RWA` eligibility | Independent review: **SUPPORTED** | `RWA` = "instrument is an object of the RWA lifecycle"; payment-currency use is a Pay/ledger question | No |
| **P-3** `SECURITY_LABELLED` class rule (new) | Not reviewed | A `SECURITY`/`SECURITY_TOKEN` **class label** with a `NON_SECURITY` outcome is refused as definitional inconsistency. This is *not* the AST-HD-4 presumption and is not extended to any other class | No; flagged for confirmation |
| **P-4** Digital MYR-denominated instruments | Not reviewed | Stay `ASSET_NOT_ALLOWED` until OQ-6 assigns a pair-level MYR control (conservative carry-forward; does not contradict AST-HD-1, which concerns fiat) | No |

**No decision in §1.2 is recorded as approved by the human.**

---

## 2. Dependency-change requests (DCR) — none implemented

| ID | Target | Request (v1.1) | Classification |
|---|---|---|---|
| **DCR-AST1-001** | **IAM-02** | **(a)** Register the AST-01 permissions (07 §3; precedent migration 017). **(b)** Seed an **approval policy** for AST-01 actions. **(c)** Close `IAM2-FIND-002` and `IAM2-FIND-003` for these actions. **(d) [F05, new]** `execute-verify` must **return/attest the verified approver/checker identity(ies) and the applicable approval-policy identity** (today it returns only `execution_authorised`, `decision`, `verified_payload_hash`, `verified_cache_version`, `verified_session`) | **(a)+(d): implementation gate for enabling governed classification apply** (non-production tests use a labelled IAM-02 stub implementing the extended contract). **(b)+(c): go-live gate**, and gate UAT of maker-checker. AST-01 does not claim to verify maker ≠ checker from data IAM-02 does not attest |
| **DCR-AST1-002** | **WLT-01** (and **LED-01**) | **[F01]** WLT-01 consumer/domain contract: (1) resolve `(asset_or_currency, chain, network)` to an AST-01 instrument, unresolved ⇒ deny; (2) call `evaluate` with **`DEPOSIT_MB_PSO`/`WITHDRAWAL_MB_PSO` only** and `verify-decision` per operation; (3) enforce the published restrictions; (4) fiat legs use the reference endpoint, not `evaluate`; (5) **unsolicited inbound** instruments not permitted for `DEPOSIT_MB_PSO` — in particular any `SECURITY` outcome — are **quarantined with no ledger credit**; (6) **no code path in WLT-01 calls a securities-domain subject**; the MB wallet path never accepts a security instrument. Also reconcile `chain_coverage`/`asset_or_currency` with the registry. LED-01 consumes `amount_scale` (`LED-RULE-005`) and fiat precision | **Go-live gate** (before any real-instrument deposit; UAT of MB deposit flows). Not an implementation blocker for AST-01 |
| **DCR-AST1-003** | **CFG-01** | (a) Feature codes for AST-01 write capabilities under `environment_scope`. **Must not use `exchange.`** and should not reuse the reserved `securities_market.*` namespace (`DEC-013` cl. 10); propose `asset_registry.*`. (b) CFG-01 asset-eligibility conjunct calls AST-01 `evaluate` (`DEC-014`; Module Index §6) | (a) before UAT/DEMO availability (`CFG-FIND-002` a prerequisite); (b) go-live gate |
| **DCR-AST1-004** | **Consumers**: `OMS-01`, `TRD-01`, `EXE-01`, `PAY-01`, `RWA-01…04`, `EXM-01`, `EXP-01`, `EXC-01`, `CLT-01`/`KYC-01` | **[F02, AST-HD-10]** Consumer contract: (a) each is **allow-listed to its own subjects only** (01 §5.8); MB-domain modules never call securities/RWA subjects (Module Index §19 rule 5A); (b) call `evaluate` **and** `verify-decision` bound to subject, instrument and consumer; (c) **re-evaluate and re-verify at each routing or execution attempt — a token is not an order-lifetime entitlement**; (d) treat AST-01 error/timeout/unavailability as **deny**; (e) never act on `derived_summary`; (f) supply `client_facts` from `CLT-01`/`KYC-01`; (g) **fiat legs use the reference endpoint**, not `evaluate`; (h) `EXM-01` posts/withdraws the attestation and evaluates `SECONDARY_MARKET` before admission (01 §5.4); (i) react to `ast1.eligibility.instrument_revoked` | **Go-live gate** for every consuming product; an **implementation gate for each consumer's own blueprint** |
| **DCR-AST1-005** | Governance / unassigned | Assign an owner for the **document store** holding classification evidence; retention ≥ decision-log retention; immutability/hash-verifiability | Go-live gate for real classification |
| **DCR-AST1-006** | **Role & Permission Matrix v1.3** (master) | **[F07, F14, AST-HD-6, AST-HD-8]** State a matching authority for **every** AST-01 change kind with no row (07 §5): holds (place/release), admission suspend/withdraw, custody, operational enablement (confirm the "Asset/pair activation" mapping), restrictions, jurisdiction rules, evidence standard, lineage merge, risk profile, retire, a dedicated §23 row for classification (§19 rule 9), and the **elevated two-checker rule**. Establish **single-actor human hold authority only if desired**, with post-hoc review | **Implementation gate for any single-actor human path only.** With the master-compliant maker-checker default, not a blocker |
| **DCR-AST1-007** | **FND-01 / `MIG-001`** | `assertNoExchangeRuntime` rejects `exchange` in route paths unconditionally; AST-01 complies (enum is `SECURITIES_MARKET`, route `securities-market-admissions`). State whether the shared registry is an `MB_PRODUCT` call site under the future domain-aware guard | Not a blocker |
| **DCR-AST1-008** | **Masters** (Doc 00 / SRS / Workflow Map) | (a) `WF-35`: add **hold** as a conjunct; (b) fiat treatment under §12A per AST-HD-1 (clarify that fiat is outside the digital-asset gate); (c) `AST-SRS-002/003` cite legacy `AST-02`/`AST-03`/`CMP-20` absent from Module Index v1.4 — assign whitelist enforcement and **pair configuration/MYR control** (OQ-6); (d) add `synthetic_emulates` to `AST-SRS-001A`; **(e) [F12]** reconcile `AST-SRS-001` "production activation status" with Doc 00 §1.D (CFG-01-owned, read-through); **(f) [F03]** a Doc 00 revision is the only way to lift the real-instrument securities-route `NOT_ASSESSED` cells | Not implementation blockers; (b)/(c) affect fiat and pair scope |
| **DCR-AST1-009** | Control layer (`DOCUMENT_REGISTER.md`, `CURRENT_STATE.md`, `MODULE_STATUS.md`) | Record a checkpoint for v1.1 after re-review: register the pack, add AST-01 to next-work | Precedes blueprint promotion |

### 2.1 Which DCRs block implementation, and of what

| DCR | Blocks | Not |
|---|---|---|
| 001 (a)+(d) | **Enabling governed classification apply** (implementation phase P3). Phases P1–P2 (schema, derivation, evaluate/verify) are not blocked | — |
| 006 | **Any single-actor human path** (none is designed) | Maker-checker paths |
| 008 (b) | Fiat *scope* only (reference data is designed; the master statement is confirmatory) | Digital instruments |
| 002, 004, 001(b)(c), 003(b), 005, 008(c) | **Go-live**, and each consumer's own blueprint | AST-01 P1–P4 |

---

## 3. Open questions preserved (not answered here)

| ID | Question | Effect on AST-01 |
|---|---|---|
| **OQ-1 (`R4-Q3`)** | Legal classifier of record; binding evidence standard | PRODUCTION classification impossible until an approved standard with `r4q3_resolution_ref` exists (bucket A, 01 §5.9). AST-01 does not answer it |
| **OQ-2 (`R4-Q6`, `R4-Q7`)** | Non-security RWA issuance basis; secondary route (MB/Exchange/neither) | `R4-Q7` (route membership) ⇒ `NOT_ASSESSED`; `R4-Q6` (operating permission) ⇒ CFG-01. AST-01 does not answer either |
| **OQ-3 (`R4-Q5`)** | Custody basis for RWA tokens | Securities-domain custody `NOT_ASSESSED` for real instruments |
| **OQ-4 (`R1-Q1b`, `R4-Q2`)** | Scope of AIX's Exchange approval; lifting `securities.token_trading` | Real-instrument securities-route eligibility stays `NOT_ASSESSED` per Doc 00 §12E.2; production activation is CFG-01's |
| **OQ-5** | Who monitors on-chain identity change (proxy upgrade, implementation swap)? | Fingerprint covers what AIX recorded, not what the chain does afterwards (AR-08) |
| **OQ-6** | Ownership of **pair configuration/activation, whitelist technical enforcement and MYR-pair control** | AST-01 supplies fiat/digital identity and the MYR attribute only |
| ~~OQ-7~~ **Resolved by F15** | ~~`EXCHANGE` enum vs reserved namespace~~ | Enum renamed to `SECURITIES_MARKET`; no `exchange.*` identifier introduced |

---

## 4. Governing sources consumed

`DEC-012` (cl. 1 rules 5, 7; cl. 3; cl. 5; **cl. 6**), `DEC-013` (cl. 2–5, 7, 8, 9, 10, 11), `DEC-014`; `CURRENT_STATE.md`; Doc 00 §1.D, §8.1–8.2, §12A, §12B, **§12E.2**, §21, §21A, §22, §23, §25.3 (`MIG-010`); Module Index v1.4 §5.4, §6, §9, **§19** (rules 2, 3, 5A, 5B, 13, 14); SRS v1.3 `AST-SRS-001`, `001A`, `002`, `003`, `PAY-SRS-009`, `RWA-SRS-005`/`021`; Role Matrix v1.3 §3.4, §3.7, §5.2, **§19 rule 9**, §19A, **§23**, **§28**; Workflow Map v1.3 `WF-31`, `WF-32`, `WF-34`, `WF-35`; System Rules v1.3 `SYS-RULE-007`…`011`, `ASSET-RULE-001`, `ASSET-RULE-002`, `LED-RULE-005`, `CFG-RULE-004`. Read-only code inspection: `platform/services/cfg1`, `platform/services/iam2/src/routes/internal.ts`, `platform/packages/foundation/src/{environment,audit,no-exchange,idempotency}.ts`, WLT-01 migrations 049/066. No source file was modified.
