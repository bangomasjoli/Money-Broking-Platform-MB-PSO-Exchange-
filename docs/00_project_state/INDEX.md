# AIX Money Broking + PSO Platform — Documentation Index

Labuan FSA Money Broking + PSO (Exchange application pending). This index maps each document to its **latest authoritative version** and **review status**.

## Start here (session handover)

| File | Purpose |
|---|---|
| [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) | Project context, licence lock, accepted modules, next module, rules — **read first** |
| [MODULE_STATUS.md](MODULE_STATUS.md) | Module status table (accepted / next / not started) |
| [SESSION_START_PROMPT.md](SESSION_START_PROMPT.md) | Copy-paste prompt to start a new session efficiently |
| [CLAUDE_CODE_USAGE_RULES.md](CLAUDE_CODE_USAGE_RULES.md) | Model selection + working discipline |

## Folder layout

| Folder | Contents |
|---|---|
| `masters/` | All source doc versions (00–11, every v1.0–v1.3) |
| `reviews/` | All `*_Review.md` + cross-cutting delta notes |
| `modules/` | Module blueprint pack directories + their reviews |
| `implementation/` | Master implementation handover packs (build phase) |

## Implementation Handover

- [IMP-01 AIX Master Implementation Handover](implementation/IMP-01_AIX_Master_Implementation_Handover/README.md)

---

## Master SDLC Foundation Pack (00 → 11)

Legend — **Reviewed**: ✅ final-verified · 🔁 clean version rollup confirmed via delta.

| # | Document | Latest (authoritative) | Reviewed | Notes |
|---|---|---|---|---|
| 00 | Licence Scope & Feature Lock | `v1.3` | ✅ | v1.2 reviewed; v1.2→v1.3 delta confirmed (lock-ins, consistent) |
| 01 | Project Charter | `v1.3` | ✅ | v1.2 reviewed; v1.2→v1.3 delta confirmed — 1 minor defect (dup FX params §9.5) |
| 02 | Software Requirement Specification | `v1.2` | ✅ 🔁 | v1.1 verified; v1.2 = header-only rollup (delta) |
| 03 | Master Module Index | `v1.2` | ✅ 🔁 | v1.1 verified; v1.2 delta = prior corrections only |
| 04 | Role & Permission Matrix | `v1.2` | ✅ 🔁 | |
| 05 | Master Workflow Map | `v1.2` | ✅ 🔁 | |
| 06 | Master System Rules | `v1.2` | ✅ 🔁 | AML-RULE-001A→006 rename confirmed |
| 07 | Master Data Flow | `v1.2` | ✅ 🔁 | |
| 08 | Master Technical Architecture | `v1.2` | ✅ 🔁 | v1.1 final-verified; clean v1.2 rollup |
| 09 | Master Security Architecture | `v1.2` | ✅ 🔁 | v1.1 final-verified; clean v1.2 rollup |
| 10 | Master Testing Strategy | `v1.2` | ✅ 🔁 | v1.1 final-verified; clean v1.2 rollup |
| 11 | Master Deployment Strategy | `v1.2` | ✅ 🔁 | v1.1 final-verified; v1.2 delta note on file |

**Base-version traceability:** `00–07` chain verified end-to-end via `reviews/00-07_Base_Version_Delta_Review.md`. `08–11` each carry a v1.1 final-verification review + a confirmed clean v1.2 rollup.

**00/01 v1.3 delta:** confirmed via `reviews/00-01_v1.2_to_v1.3_Delta_Note.md` — v1.3 additions are substantive but consistent (lock-ins + gates already implemented downstream), no contradictory drift. One minor cleanup: duplicated FX parameter block in `01 §9.5`.

---

## Module Blueprint Packs (Phase 2)

| Code | Module | Version | Reviewed | Notes |
|---|---|---|---|---|
| FND-01 | Platform Foundation | `v1.2` | ✅ accepted | v1.1 final-verified; v1.2 clean rollup cleared all 3 cosmetics (dup component row, retention rows, idempotency scope) |
| IAM-01 | Authentication / MFA / Session | `v1.2` | ✅ accepted | v1.1 final-verified; v1.2 clean rollup (§12 cosmetic fixed); depends on FND-01 v1.2 (resolves) |
| IAM-02 | RBAC / Permission Guard / SoD | `v1.2` | ✅ accepted | v1.1 final-verified (5 gaps + 7 corrections, tests 64→94); v1.2 clean rollup cleared all 3 cosmetic nits; retires IAM-01 §5.6 interim MFA-reset |
| SEC-01 | Audit Log / Security Monitoring | `v1.2` | ✅ accepted | v1.1 final-verified (5 gaps + 6 corrections, tests 60→91); v1.2 clean acceptance rollup; authoritative audit store; takes over IAM-01/IAM-02 interim audit handoff |
| CFG-01 | Feature Flag / Licence Lock | `v1.1` | ✅ accepted | v1.1 final-verified — all 5 critical gaps + 6 corrections resolved (tests 60→88); licence-lock source-of-truth; takes over IAM-02 §5.14 + SEC-01 §5.10 |
| CLT-01 | Client Onboarding / Client Profile | `v1.1` | ✅ accepted | v1.1 final-verified — all 5 critical gaps + 6 corrections resolved (tests 41→65); first business-tier module; feeds outcome-gated handoffs downstream |
| KYC-01 | KYC / KYB Verification | `v1.1` | ✅ accepted | v1.1 final-verified — all 5 critical gaps + 6 corrections resolved (tests 40→62); provides CDD outcomes CLT-01 §5.14 gates on |
| AML-01 | Sanctions / PEP / Adverse-Media / Travel Rule | `v1.1` | ✅ accepted | v1.1 final-verified — all 5 critical gaps + 6 corrections resolved (tests 43→67); real-time pre-transaction sanctions gate; provides screening outcomes CLT-01 §5.14 + KYC-01 §5.18 depend on |
| WLT-01 | Wallet Screening / Payout-Destination Whitelist | `v1.1` | ✅ accepted | v1.1 final-verified — all 5 critical gaps + 6 corrections resolved (tests 40→69); execution-time verify-and-consume; consumes AML-01 pre-transaction gate + revocation signals |
| LED-01 | Ledger / Settlement / Safeguarding | `v1.1` | ✅ accepted | v1.1 final-verified — all 5 critical gaps + 6 corrections resolved (tests 40→72, tables 12→23, FR 24→41); money core — atomic reservation, two-leg DvP, preventive free-vs-encumbered backing, FX conversion + bounded residual, journal hash-chain; consumes WLT-01 + AML-01 at execution |
| TRD-01 | Quote / Trade / LP Execution | `v1.2` | ✅ accepted | v1.1 final-verified — all 5 critical gaps + 6 corrections resolved (tests 40→71, tables 12→18, FR 22→38); trading core — contingent/atomic-firm agency (no AIX principal window), fill conservation invariant, price-construction identity, LP timeout query-back, structural no-internalisation + execution-time CFG revalidation. v1.2 = clean cosmetic rollup (cleared version-cell nit). **Final module — build order complete** |
| E2E-01 | Cross-Module End-to-End Fund-Flow Review | `v1.1` | ✅ accepted | v1.1 final-verified — all 5 critical cross-module gaps + 6 corrections resolved (E2E tests 45→70, contracts 15→24); platform-level assurance — global saga/compensation + orphan sweeper, coherent decision bundle + point-in-time snapshot + revocation SLA, end-to-end value conservation, cross-module freeze/recovery. Names DEP-01/WDR-01 execution rails as pending boundaries |
| DEP-01 | Deposit Execution / Inbound Receipt | `v1.1` | ✅ accepted | v1.1 final-verified — all 5 critical gaps + 6 corrections resolved (tests 33→67, tables 12→19, FR 18→36); inbound deposit boundary (E2E-C-021), clean LED separation — credit-request coherent-bundle revalidation + revocation subscription, source-of-funds own-source KYC binding, per-source finality model, provider-identity auth + fabricated-receipt guard, reference/amount integrity. First supporting/execution-rail module accepted |
| WDR-01 | Withdrawal / Payout Execution Rail | `v1.1` | ✅ accepted | v1.1 final-verified — all 5 critical gaps + 6 corrections resolved (tests 40→76, tables 11→18, FR 20→37); outbound payout boundary (E2E-C-022), no ledger/balance/keys — atomic revalidate-and-transmit, outbound value conservation, last-mile beneficiary/WLT-canonical-dest integrity, batch/file execution, one-reserve-one-send + logical-payout dedup. **Both execution rails complete — money perimeter closed** |
| REC-01 | Reconciliation / Finance Reporting | `v1.1` | ✅ accepted | v1.1 final-verified — all 5 critical gaps + 6 corrections resolved (tests 38→81, tables 11→18, FR 20→35); independent detective/assurance layer — population-coverage proof vs SEC/E2E denominator, consistent as-of + in-flight class, external-statement trust, REC hash-chain/anchor + independence/four-eyes, closed-loop remediation, tolerance/severity/rule governance + report restatement + regulatory-obligation tracking |
| INC-01 | Incident / Freeze / Recovery | `v1.1` | ✅ accepted | v1.1 final-verified — all 5 critical gaps + 6 corrections resolved (tests 36→83, tables 11→17, FR 16→31); highest-authority control action (E2E-01 §15 realisation), orchestrator-only — atomic/ordered/verified-effective freeze, INC authority governance + hash-chain/anchor, degraded-mode when SEC/IAM/CFG is the incident, closed-loop money recovery, freeze-collateral/client-access tracking, auto-freeze + reference-counted overlapping freezes + E2E saga binding |
| PRT-01 | Client / Staff / Admin Portal Workflows | `v1.1` | ✅ accepted | v1.1 final-verified — all 5 critical gaps + 6 corrections resolved (tests 32→78, tables 6→11, FR 18→32, principles 14→25, prohibited 28→48, components 17→31); presentation layer, owns no truth/state — §5.15 non-regression display-truth (source version/epoch + overlay precedence + fail-closed-to-less-favourable), §5.16 object-level read authz + service-account re-scoping (defeats IDOR/BOLA + confused deputy), §5.17 push invalidation-epoch subscription (fail-closed on loss; consistent with INC verified-effective freeze), §5.18 export egress hardening (source-side masking + single-use recipient-bound token + disclosure log + gen/download recheck), §5.19 hostile-browser boundary (server-bound quote economics + upload scan + web-integrity), §5.20–5.25 notification supersession / action-bound step-up / disclosed-fee truthfulness / client-safe reason-code separation / correlation propagation into E2E-SEC denominator / degraded-display. **Final module — platform blueprint chain review-complete** |

**Priority downstream modules** (per FND-01 §7.2): IAM-01 Auth/MFA/Session → IAM-02 RBAC/SoD → SEC-01 Audit/Security-Monitoring → CFG-01 Feature-Flag/Licence-Lock → CLT / CMP / MON.

---

## Regulatory guardrails enforced across all reviews

Money Broking + PSO approved; **Exchange pending — all exchange/order-book/matching/market-making/principal-dealing LOCKED**. Agency back-to-back execution; disclosed brokerage fee only; AIX inventory = zero. Third-party custody; client-money safeguarding (full-backing). Institutional/HNWI only; retail off by default.
