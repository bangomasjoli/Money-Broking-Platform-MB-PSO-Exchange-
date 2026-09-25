# AST-01 — 02 Workflow

**Status: PLANNED / AWAITING REVIEW.** Refines `WF-35` (Workflow Map v1.3 §33F). `WF-35`'s later states (`eligibility_derived`, `operationally_eligible`, `activated`) are **derived views or other modules' states**, not AST-01 stored states — storing them would create the independent flags the rules forbid (06 §9).

Legend: **M** = maker, **C** = checker (IAM-02 approval), **S** = single authorised actor (tightening only), **sys** = service identity.

---

## W1. Instrument registration (`WF-35` steps 1–2)

```
Propose ─► DRAFT ─► [profile complete?] ─► (classification case may open)
```

| Step | Action | Actor | Rule |
|---:|---|---|---|
| 1 | Create issuer reference (if needed) | `RWA_OPERATIONS_OFFICER` / `ADMIN` | Descriptive only; no KYB |
| 2 | Create asset (code, class, origin jurisdiction) | same | `asset_code` unique; class from taxonomy |
| 3 | Create instrument in `DRAFT` | same | Declares form, network, contract, precision, prohibited-category attributes (all NOT NULL, **no defaults**), `declared_synthetic`. Network must exist in `network_registry`; contract address canonicalised; duplicate on-chain identity refused |
| 4 | Add underlying reference(s) | same | Stablecoin needs ≥ 1 with known backing before submission |
| 5 | Edit draft | same | Only in `DRAFT` (identity mutable) |

Creation grants nothing: with no classification record the instrument is `UNRESOLVED` and every product denies (INV-02). Creation is audited but not maker-checkered because it changes no eligibility.

## W2. Classification (`WF-35` steps 2–4, `ASSET-RULE-002` rule 4)

```
DRAFT ─► open case ─► gather evidence ─► submit (M) ─► IAM-02 approval (C) ─► apply ─► record appended
                                          │                         │
                                          └── identity locks here   └── reject / cancel ─► case closed; instrument stays UNRESOLVED
```

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Open case (`INITIAL` or `RECLASSIFICATION`) | `INSTRUMENT_CLASSIFIER` | One open case per instrument at a time |
| 2 | Attach evidence items | Classifier (proposer may also attach) | Immutable; hash + object_ref; standard-conformant types |
| 3 | Declare proposed outcome + rationale + `features_assessment` | `INSTRUMENT_CLASSIFIER` (M) | Validated against the approved evidence standard; class/outcome conflict refused (HD-4); profile completeness gate |
| 4 | **Submit**: identity locked, `payload_hash` computed over `{instrument_id, identity_fingerprint, outcome, evidence_bundle_hash, standard_id, environment}`; governed change `requested` | M | After this, identity edits are impossible |
| 5 | IAM-02 approval | `COMPLIANCE_OFFICER` / `MLRO` (C) | `checker ≠ maker`. Reclassification that **loosens** (`SECURITY → NON_SECURITY`) needs the elevated approval in 07 §5 |
| 6 | **Apply**: verify IAM-02 decision token bound to `payload_hash`; recheck fingerprint and standard; re-run validity; append `classification_record` in one transaction with the audit outbox row | system | Any mismatch ⇒ nothing applied; change stays `requested` (retriable with a fresh approval) |
| 7 | Consumers see the new effective classification on next evaluation; outstanding decision tokens for that instrument become stale | — | `verify-decision` revalidates |

Outcomes and consequences are exactly `WF-35` §33F.5. A `SECURITY_OR_SECURITY_TOKEN` record routes the instrument to the securities path (`WF-32`) by *deriving* `RWA`/`SECONDARY_MARKET`/`EXCHANGE` PERMITS — AST-01 starts no other workflow.

**Production:** step 3 cannot complete until an `APPROVED` evidence standard applicable to PRODUCTION exists, which needs `R4-Q3` answered by governance (4.3). Until then real instruments stay `UNRESOLVED` in PRODUCTION.

## W3. Reclassification and reversion

| Direction | Effect on eligibility | Approval |
|---|---|---|
| `UNRESOLVED → NON_SECURITY` | Loosens | M + C |
| `UNRESOLVED → SECURITY` | Narrows Spot/OTC (already denied) and opens the securities path | M + C |
| `NON_SECURITY → SECURITY` | **Tightens** — Spot/OTC eligibility ends on apply | M + C (and a hold can bridge the gap, W4) |
| `SECURITY → NON_SECURITY` | **Loosens the most dangerous way** | M + C + second checker (proposal, HD-8) and a fresh evidence bundle that is not the one used for the earlier record |
| `* → UNRESOLVED` (explicit reversion) | Tightens | M + C (or a hold for immediacy) |

On apply of any record that ends Spot/OTC eligibility, AST-01 **revokes outstanding eligibility decision tokens** for that instrument and emits `ast1.eligibility.instrument_revoked` so consumers (`OMS-01`, `TRD-01`) can cancel or re-check in-flight work. AST-01 does not cancel orders itself.

## W4. Hold (emergency tightening, single actor)

```
Suspect securities features / evidence integrity concern / drift alarm
   ─► place hold (S) ─► effective classification = UNRESOLVED immediately ─► all products deny
   ─► investigate ─► release (M + C) ─► previously effective record re-validates, or a new case is required
```

A hold writes no classification record and does not need a checker (fail-closed action never blocked by a missing checker). A **system** hold is placed automatically on: fingerprint mismatch detected by the integrity sweep; synthetic row in PRODUCTION; evidence-standard retirement; decision-log backstop violation attempt. Holds are always audited at severity ≥ high.

## W5. Product admission (`WF-35` step 5, `ASSET-RULE-001` rule 7)

```
classification effective & PERMITS for product ─► request admission (M) ─► approve (C) ─► APPROVED
```

| Step | Action | Actor | Control |
|---:|---|---|---|
| 1 | Request admission for (instrument, product), attesting `jurisdiction_assessed` | `COMPLIANCE_ANALYST`/`OPS`/`INSTRUMENT_CLASSIFIER` | Refused unless the matrix currently says `PERMITS` for that instrument/product/environment (`INSTRUMENT_NOT_ELIGIBLE_FOR_PRODUCT`; `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT` for Spot/OTC) |
| 2 | Approve | `COMPLIANCE_OFFICER` (C) | Bound to `classification_record_id`; DB trigger re-checks |
| 3 | Suspend / withdraw | S | Tightening |
| 4 | Re-approve after suspension | M + C | Loosening |

Admission approval is **not** production activation and is never evidence of it (`DEC-014`, `SYS-RULE-008`). Pair activation is outside AST-01 (OQ-6).

## W6. Operational enablement (`WF-35` step 6)

`custody_support` approval (M + C) → `operational_state(DEPOSIT|WITHDRAWAL)` enable (M + C) → suspend (S) at any time. Transfer-restriction profile assessed (M + C) before RWA/secondary/Exchange or security-outcome withdrawal. Defaults are `DISABLED` / `UNASSESSED`; absence denies.

## W7. Eligibility evaluation on an execution path

```
consumer (OMS-01/TRD-01/WLT-01/PAY-01/RWA-*/EXM-01/EXP-01)
  ─► POST evaluate {instrument | asset+network, product|capability, client facts}
        AST-01: own environment ─► effective classification ─► derive ─► conjuncts ─► log ─► (token if ELIGIBLE)
  ─► consumer ALSO evaluates CFG-01 (features/environment/activation) and IAM-02 (permission)
  ─► immediately before action: POST verify-decision (single use) ─► AST-01 revalidates against live state
```

`evaluate` is advisory ("what is the answer"); `verify-decision` **gates** (throws on stale/revoked/consumed/mismatch) — the same split as CFG-01. Any AST-01 unavailability, timeout or unreadable state must be treated by the consumer as **deny**; AST-01 never returns a cached allow past its token TTL.

## W8. Evidence standard lifecycle

`DRAFT → APPROVED (M + C, Compliance Officer + Management) → RETIRED`. A standard applicable to PRODUCTION requires a non-null `r4q3_resolution_ref`. Retiring a standard triggers W4 system holds on instruments whose effective record relied on it, in the environments it covered.

## W9. Synthetic instrument lifecycle

Created `declared_synthetic` in non-production with a `SYN-` code; classified `SYNTHETIC_TEST_INSTRUMENT` (M + C, as any classification — control parity, Doc 00 §21A rule 7); usable for RWA/Exchange/Spot-flow tests; **never** promoted. In PRODUCTION it derives all-`INELIGIBLE`. To onboard the real analogue, W1–W2 start again from scratch.
