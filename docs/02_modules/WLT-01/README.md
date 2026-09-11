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

## Reviews

- [WLT-01_Wallet_Screening_Payout_Destination_Whitelist_Blueprint_Pack_v1.0_Review.md](reviews/WLT-01_Wallet_Screening_Payout_Destination_Whitelist_Blueprint_Pack_v1.0_Review.md)
- [WLT-01_Wallet_Screening_Payout_Destination_Whitelist_Blueprint_Pack_v1.1_Review.md](reviews/WLT-01_Wallet_Screening_Payout_Destination_Whitelist_Blueprint_Pack_v1.1_Review.md)

## Acceptance evidence

- [WLT-01_Public_Client_Surface_Opus_Acceptance_v1.0.md](acceptance/WLT-01_Public_Client_Surface_Opus_Acceptance_v1.0.md) — Public Client Surface implementation acceptance (`12cedda`) + remediation (`7f9fc8a`)

## Implementation notes / plans

- [WLT-01_IMPLEMENTATION_NOTES.md](notes/WLT-01_IMPLEMENTATION_NOTES.md)

## Open findings

WLT-FIND-001 through WLT-FIND-004 (WLT-FIND-004 now records public-surface acceptance
COMPLETE), plus WLT-FIND-005 through WLT-FIND-008 (public-surface MEDIUM/LOW findings,
all CLOSED) and WLT-FIND-009 through WLT-FIND-013 (public-surface non-blocking
carry-forwards, OPEN) — see [OPEN_FINDINGS.md](../../OPEN_FINDINGS.md) for the full
register and current state of each.
