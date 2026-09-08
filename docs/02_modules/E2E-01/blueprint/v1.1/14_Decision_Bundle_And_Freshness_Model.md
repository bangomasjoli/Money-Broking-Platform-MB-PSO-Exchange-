# E2E-01 Cross-Module End-to-End Fund-Flow Review
## 14 Decision Bundle And Freshness Model

## 1. Purpose

This file defines the coherent decision-bundle model and global freshness/revocation propagation contract.

## 2. Decision Bundle

A bundle is valid only when every included token shares:

```txt
correlation_id
client_id
action_type
amount
asset_or_currency
point_in_time_snapshot_id
```

## 3. Point-In-Time Eligibility Snapshot

Snapshot includes:

1. CLT client status/version.
2. KYC outcome/version/freshness.
3. AML outcome/version/freshness.
4. CFG licence/feature decision/version.
5. IAM mandate/dual-authorisation/version.
6. freeze/restriction status.
7. timestamp.
8. expiry.
9. payload hash.
10. SEC audit ref.

## 4. Freshness Windows

Define per gate:

| Decision | Suggested Rule |
|---|---|
| CFG action decision | short-lived; revalidate at execution/settlement |
| AML pre-transaction gate | shortest practical window; revalidate at money movement |
| WLT destination decision | one-time verify-and-consume |
| LED reservation | valid while hold active/pinned |
| CLT/KYC eligibility snapshot | expires before money movement unless revalidated |
| TRD quote | <= LP quote validity |

Exact durations remain policy parameters.

## 5. Revocation Propagation

Revocation signal must include:

1. signal ID.
2. source module.
3. affected client/destination/trade/asset.
4. revocation type.
5. effective time.
6. action required.
7. propagation SLA.
8. SEC audit ref.

## 6. In-Flight Disposition Matrix

| Stage | Revocation / Freeze Action |
|---|---|
| Pre-hold | deny/cancel |
| Hold active, no external instruction | release/hold for review |
| LP order submitted, no fill | query-back/cancel if possible |
| LP fill received, not settled | hold/quarantine/settlement review |
| DvP one leg done | compensate/quarantine |
| Rail instruction sent | query/cancel if possible; otherwise quarantine/exception |
| Ledger settled | reversal/clawback/exception according to law/policy |

## 7. Irreversible-Leg Rule

If an external leg cannot be reversed:

```txt
do_not_silently_complete
create_exception
quarantine_or_restrict_related balance/destination/client
preserve evidence
route to Compliance/Finance/Ops
```
