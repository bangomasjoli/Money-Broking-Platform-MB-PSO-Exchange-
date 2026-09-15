---
document_id: WLT-01-IDX
title: WLT-01 — Wallet Screening / Payout-Destination Whitelist
version: N/A
document_status: APPROVED
implementation_status: IN_PROGRESS
module: WLT-01
control: Wallet screening, payout-destination whitelist
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 780e116
---

# WLT-01 — Wallet Screening / Payout-Destination Whitelist

**Module ID:** WLT-01
**Module name:** Wallet Screening / Payout-Destination Whitelist
**Available blueprint versions:** v1.1, v1.2
**Authoritative blueprint version:** v1.1 (see [DOCUMENT_REGISTER.md](../../DOCUMENT_REGISTER.md) — this README does not independently decide authority)
**Blueprint authority status:** APPROVED (v1.1, authoritative). v1.2 is **REVIEW_REQUIRED — CONFLICT**: MODULE_STATUS.md previously described v1.2 as accepted without citing delta-note evidence; INDEX.md (predecessor of DOCUMENT_REGISTER.md) cited v1.1. Unresolved — requires dedicated Opus adjudication. See [DOCUMENT_REGISTER.md](../../DOCUMENT_REGISTER.md).
**Implementation status:** IN_PROGRESS — see MODULE_STATUS.md for phase detail; the client-facing public `/wlt1/*` surface is COMPLETE / ACCEPTED (see below), but WLT-01 as a whole remains PARTIAL — see [00_project_state/MODULE_STATUS.md](../../00_project_state/MODULE_STATUS.md) for detail.

**Extension — Public Client Surface:** exactly six public `/wlt1/*` routes (`GET /destinations`, `GET /destinations/:destination_id`, `POST /wallet-destinations`, `POST /payout-destinations`, `POST .../proof-of-control/challenges`, `POST .../proof-of-control/verify`; 27 internal routes unchanged). Authority chain: client bearer → IAM-01 internal session introspection (fail-closed) → `user_class ∈ {client, client_approver}` → CLT-01 membership resolution (authoritative; `X-AIX-Client-Id` is a narrowing selector only, never an authority source — one eligible membership auto-resolves, two or more require the header) → derived `client_id` → FND-01 rate-limit check (DEC-009 bucket/subject bindings; explicit `allow` required before any mutation) → idempotency (wallet/payout/PoC-challenge idempotency binds the human IAM identity AND the derived client authority; PoC verify remains outside foundation idempotency, naturally idempotent via its own signature-hash replay match) → business operation → Sensitive Read evidence-before-response → response. Implemented at commit `12cedda`, independently reviewed with three MEDIUM findings (WLT-FIND-005/006/007) plus one LOW (WLT-FIND-008), all remediated and independently re-verified **CLOSED** at commit `7f9fc8a`. **WLT-01 PUBLIC CLIENT SURFACE: COMPLETE / ACCEPTED** — see [WLT-01_Public_Client_Surface_Opus_Acceptance_v1.0.md](acceptance/WLT-01_Public_Client_Surface_Opus_Acceptance_v1.0.md) for the full acceptance/remediation/re-review record. Non-blocking carry-forwards: WLT-FIND-009 through WLT-FIND-013 (LOW/INFORMATIONAL). **This does NOT mean WLT-01 is go-live ready, and does NOT mean internet exposure is approved** — `FND-FIND-001` (HIGH, pre-authentication abuse, tracked under FND-01) remains OPEN and is the separate, mandatory precondition before any WLT-01 public route is internet-exposed.

**Blueprint conflict note (unresolved, unaffected by the public-surface acceptance above):** `BP-WLT-01-v1.2` remains `REVIEW_REQUIRED — CONFLICT` (see above) — this acceptance record does not resolve it.

**Public perimeter / pre-authentication abuse control:** internet exposure of the accepted public surface remains **PROHIBITED** pending `FND-FIND-001` (HIGH, tracked under FND-01). The closing architecture is **ACCEPTED FOR IMPLEMENTATION** as [`DECISION_LOG.md`](../../DECISION_LOG.md) DEC-010 — a four-layer design (trusted edge pre-auth throttling + mandatory network isolation + a WLT-01-owned public-surface enablement gate/perimeter-provenance credential + the existing unchanged authenticated chain).

**DEC-010 Turn 1 (WLT-01's own L3 application gate) is COMPLETE / ACCEPTED at commit `af52fe8`.** The six public routes are now registered only when `WLT1_PUBLIC_SURFACE_ENABLED` is exactly `"true"` (safe default: **disabled** — 0 public + 27 internal routes; no handler, no IAM/CLT/FND client, no DB path exists). When enabled (6 public + 27 internal routes), every public request must additionally present a valid `x-aix-perimeter-token` (`WLT1_PUBLIC_PERIMETER_TOKEN`, ≥32 characters, constant-time compared, boot fails closed if enabled without it) via an `onRequest` hook confined to a dedicated Fastify plugin scope, checked strictly before body parsing and before any IAM/CLT/FND call — independently proven inert on the 27 internal routes and on health/readiness, with zero downstream calls and zero database writes on rejection, and a `404` response indistinguishable from a disabled surface or an unknown route. **`OPEN_FINDINGS.md` WLT-FIND-010 is now CLOSED** — see [WLT-01_Public_Perimeter_Application_Gate_Opus_Acceptance_v1.0.md](acceptance/WLT-01_Public_Perimeter_Application_Gate_Opus_Acceptance_v1.0.md) for the full acceptance record. Two new non-blocking carry-forwards: WLT-FIND-014, WLT-FIND-015 (both INFORMATIONAL).

**Turn 1's acceptance does NOT close FND-FIND-001 and does NOT approve internet exposure.** DEC-010's Turn 2 scope (L1 trusted edge + L2 mandatory network isolation) is owned by **`IMP-02`** ([`03_implementation/IMP-02/README.md`](../../03_implementation/IMP-02/README.md); not an 18th module pack — the 17-module delivery taxonomy is unchanged) and is staged as two sub-turns: **Turn A (L1 UAT trusted-edge HTTP reference implementation) is COMPLETE / ACCEPTED at commit `65fca52`** ([`IMP-02-ACC-001`](../../03_implementation/IMP-02/acceptance/IMP-02_UAT_Trusted_Edge_Turn_A_Opus_Acceptance_v1.0.md)); **Turn B (L2 mandatory network isolation, UAT proof) is now COMPLETE / ACCEPTED at commit `7132057`** ([`IMP-02-ACC-002`](../../03_implementation/IMP-02/acceptance/IMP-02_UAT_L2_Network_Isolation_Turn_B_Opus_Acceptance_v1.0.md)) — proved only inside a disposable, provider-neutral UAT harness, NOT at a production deployment; **TLS termination remains PENDING IMP-02 work.** Production numeric pre-auth policy remains **NOT approved**; the explicitly non-production INTERNAL-UAT-only provisional policy Turn A implements is authorized for `IMP-02` engineering/abuse-test purposes only — see `IMP-02` and [DECISION_LOG.md](../../DECISION_LOG.md) DEC-010. Independent acceptance directly confirmed that a valid perimeter token combined with an invalid bearer still reaches IAM-01 — provenance is admission control, not pre-authentication abuse throttling; Turn A's edge-level throttling does not change this WLT-01-side property. **Neither Turn A nor Turn B acceptance closes FND-FIND-001. FND-FIND-001 remains HIGH/OPEN. Internet exposure remains PROHIBITED.**

## Reviews

- [WLT-01_Wallet_Screening_Payout_Destination_Whitelist_Blueprint_Pack_v1.0_Review.md](reviews/WLT-01_Wallet_Screening_Payout_Destination_Whitelist_Blueprint_Pack_v1.0_Review.md)
- [WLT-01_Wallet_Screening_Payout_Destination_Whitelist_Blueprint_Pack_v1.1_Review.md](reviews/WLT-01_Wallet_Screening_Payout_Destination_Whitelist_Blueprint_Pack_v1.1_Review.md)

## Acceptance evidence

- [WLT-01_Public_Client_Surface_Opus_Acceptance_v1.0.md](acceptance/WLT-01_Public_Client_Surface_Opus_Acceptance_v1.0.md) — Public Client Surface implementation acceptance (`12cedda`) + remediation (`7f9fc8a`)
- [WLT-01_Public_Perimeter_Application_Gate_Opus_Acceptance_v1.0.md](acceptance/WLT-01_Public_Perimeter_Application_Gate_Opus_Acceptance_v1.0.md) — Public Perimeter Application Gate (DEC-010 Turn 1) implementation + acceptance (`af52fe8`)

## Implementation notes / plans

- [WLT-01_IMPLEMENTATION_NOTES.md](notes/WLT-01_IMPLEMENTATION_NOTES.md)

## Open findings

WLT-FIND-001 through WLT-FIND-004 (WLT-FIND-004 now records public-surface acceptance
COMPLETE), plus WLT-FIND-005 through WLT-FIND-008 (public-surface MEDIUM/LOW findings,
all CLOSED), WLT-FIND-009 (LOW, OPEN), **WLT-FIND-010 (public-surface enablement gate
— CLOSED at commit `af52fe8`)**, WLT-FIND-011 through WLT-FIND-013 (non-blocking
carry-forwards, OPEN), and WLT-FIND-014/WLT-FIND-015 (public-perimeter-gate
INFORMATIONAL carry-forwards, OPEN, non-blocking) — see
[OPEN_FINDINGS.md](../../OPEN_FINDINGS.md) for the full register and current state of
each.
