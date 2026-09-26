# AST-01 — 09 Error Handling (v1.1)

**Status: REMEDIATED / AWAITING RE-REVIEW.** Two vocabularies, kept separate as in CFG-01:

1. **Decision reason codes** — returned inside a `200` `evaluate` body and written to `eligibility_decision_log.reason_code` (`varchar(48)`).
2. **Thrown errors** — non-2xx, for gating and write calls, in the on-wire `{code, message, details}` shape via an AST-01-local error type (mirrored, not imported — F3(c); guard/config/boot failures reuse the shared foundation codes `SERVICE_IDENTITY_REQUIRED`, `CONFIGURATION_INVALID`, `VALIDATION_ERROR`).

**Master-defined codes are used verbatim** (`ASSET-RULE-001`, `ASSET-RULE-002`, `LED-RULE-005`) so the platform's codes do not fork.

## 1. Decision reason codes

| Reason code | Length | State | Meaning |
|---|---:|---|---|
| **`INSTRUMENT_CLASSIFICATION_UNRESOLVED`** *(master)* | 36 | `NOT_ASSESSED` | No valid effective classification. The default. Fail closed |
| **`SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT`** *(master)* | 48 | `INELIGIBLE` | Security outcome × Spot/OTC/Pay. Permanent, environment-independent |
| **`INSTRUMENT_NOT_ELIGIBLE_FOR_PRODUCT`** *(master)* | — | `INELIGIBLE` / `NOT_ASSESSED` | Class/outcome does not permit the product |
| **`SYNTHETIC_INSTRUMENT_NOT_VALID_IN_PRODUCTION`** *(master)* | 44 | `INELIGIBLE` | Synthetic in PRODUCTION |
| **`ASSET_NOT_ALLOWED`** *(master)* | — | `INELIGIBLE` | Prohibited category (privacy coin, algorithmic stablecoin, yield/derivative feature, MYR) |
| `PAIR_NOT_ALLOWED`, `LICENCE_SCOPE_BLOCKED` *(master)* | — | — | Reserved for pair-level consumers; AST-01 does not emit them |
| `CLASSIFICATION_ENVIRONMENT_MISMATCH` | 35 | `NOT_ASSESSED` | Record from another canonical environment |
| `CLASSIFICATION_IDENTITY_DRIFT` | ≤ 48 | `NOT_ASSESSED` | Fingerprint ≠ classified fingerprint |
| `EVIDENCE_STANDARD_NOT_ESTABLISHED` | ≤ 48 | `NOT_ASSESSED` | No approved standard for this environment (PRODUCTION today, `R4-Q3`) |
| `INSTRUMENT_ON_HOLD` | ≤ 48 | `NOT_ASSESSED` | Active hold — a conjunct; **the classification outcome is unchanged** [F07] |
| `INSTRUMENT_RETIRED` | ≤ 48 | `INELIGIBLE` | Retired |
| `PRODUCT_ADMISSION_NOT_APPROVED` | ≤ 48 | `NOT_ASSESSED` | No admission, suspended, or admission against a superseded record |
| `TRANSFER_RESTRICTIONS_UNASSESSED` | ≤ 48 | `NOT_ASSESSED` | Profile `UNASSESSED` |
| `SECURITIES_MARKET_ADMISSION_ABSENT` | ≤ 48 | `NOT_ASSESSED` | No `EXM-01` attestation (Exchange) |
| `RWA_ROUTE_REGULATORY_QUESTION_OPEN` | ≤ 48 | `NOT_ASSESSED` | Non-security RWA on MB/PSO rails or secondary (`R4-Q6`/`R4-Q7`; bucket A/B — 01 §5.9) |
| `CLIENT_JURISDICTION_REQUIRED` | ≤ 48 | `NOT_ASSESSED` | `ALLOW_ONLY` rule exists, no jurisdiction supplied |
| `JURISDICTION_BLOCKED` | ≤ 48 | `INELIGIBLE` | Client jurisdiction matches a `BLOCK` or is outside `ALLOW_ONLY` |
| `CUSTODY_NOT_SUPPORTED` / `OPERATIONAL_STATE_NOT_ENABLED` / `NETWORK_NOT_ACTIVE` | ≤ 48 | `NOT_ASSESSED` | Deposit/withdrawal conjuncts |
| `INSTRUMENT_NOT_FOUND` | ≤ 48 | `NOT_ASSESSED` | Unresolvable reference (logged with null instrument) |
| **`SUBJECT_NOT_APPLICABLE_FIAT`** [F08] | ≤ 48 | `NOT_APPLICABLE` (`decision: not_applicable`) | Fiat is outside the §12A API. Not a deny; not a statement that the leg may not be used |
| **`SECURITIES_ROUTE_REAL_INSTRUMENT_NOT_ASSESSED`** [F03] | 45 | `NOT_ASSESSED` | Real security instrument on a securities-route subject (Doc 00 §12E.2) |
| `SECURITIES_MARKET_ATTESTATION_STALE` [F13] | ≤ 48 | `NOT_ASSESSED` | Attestation bound to a superseded record |
| `CLIENT_CLASS_REQUIRED` [F12] | ≤ 48 | `NOT_ASSESSED` | `INVESTOR_CLASS_ONLY` restriction, no `client_class` supplied |
| `CLASS_CLASSIFICATION_CONFLICT` | ≤ 48 | `NOT_ASSESSED` | `SECURITY_LABELLED` class with `NON_SECURITY` (unreachable cell, kept for totality) |
| `MATRIX_CELL_NOT_DEFINED` [F10] | ≤ 48 | `NOT_ASSESSED` | Totality default: any unlisted matrix combination |
| `environment_mismatch` | 20 | `NOT_ASSESSED` | Asserted ≠ own (lower-case: kept identical to CFG-01's `MIG-004` reason for cross-module log correlation) |
| `ELIGIBILITY_STATE_UNREADABLE` | ≤ 48 | `NOT_ASSESSED` | Any read/parse failure — deny, never allow |
| `ELIGIBLE` | — | `ELIGIBLE` | Only value with `decision = allow` |

All lengths are ≤ 48 and are asserted by a unit test against the column width (T-ERR-02).

## 2. Thrown errors

| Code | HTTP | When |
|---|---:|---|
| `AST1_INSTRUMENT_IDENTITY_LOCKED` | 409 | Identity edit after lock |
| `AST1_INSTRUMENT_PROFILE_INCOMPLETE` (`INSTRUMENT_PROFILE_INCOMPLETE`) | 422 | Submit with missing precision/attributes/backing |
| `ASSET_PRECISION_INVALID` *(master)* | 422 | Missing/invalid `amount_scale`, or `amount_scale > on_chain_decimals` |
| `AST1_NETWORK_NOT_REGISTERED` | 422 | Chain/network not in `network_registry` |
| `AST1_INSTRUMENT_DUPLICATE_IDENTITY` | 409 | On-chain identity already registered |
| `AST1_CLASS_CLASSIFICATION_CONFLICT` | 422 | `SECURITY`/`SECURITY_TOKEN` class proposed `NON_SECURITY` (definitional; **not** raised for `TOKENISED_DEBT`/`TOKENISED_FUND`, AST-HD-4) |
| `AST1_SYNTHETIC_MISMATCH` | 422 | Real instrument given synthetic outcome or vice versa; synthetic code/declaration mismatch; synthetic evidence cited by a real instrument |
| `SYNTHETIC_INSTRUMENT_NOT_VALID_IN_PRODUCTION` *(master)* | 422 | Attempt to create/classify a synthetic instrument in PRODUCTION |
| `AST1_EVIDENCE_STANDARD_NOT_ESTABLISHED` | 422 | Submit/apply with no applicable approved standard |
| `AST1_EVIDENCE_INCOMPLETE` | 422 | Evidence does not satisfy the standard's required types |
| `AST1_CASE_ALREADY_OPEN` | 409 | Second non-terminal case |
| `AST1_CLASSIFICATION_SELF_APPROVAL_FORBIDDEN` | 403 | maker ∈ IAM-02-attested approvers |
| `AST1_APPROVER_ATTESTATION_MISSING` | 403 | IAM-02 returned no attested approver identity/policy [F05]; apply refused |
| `AST1_ELEVATED_APPROVAL_REQUIRED` | 403 | `elevated` lineage: fewer than two distinct attested checkers, or no new post-`SECURITY` evidence [F06] |
| `AST1_LINEAGE_CONTINUITY_REQUIRED` | 409 | On-chain identity previously registered outside the proposed lineage [F06] |
| `AST1_INSTRUMENT_IMMUTABLE_FIELD` | 409 | Edit of `instrument_code`/`declared_synthetic`/`synthetic_emulates` [F09] |
| `AST1_SUBJECT_NOT_PERMITTED_FOR_CALLER` | 403 | Caller not allow-listed for the subject [F02, F01] |
| `AST1_CURRENCY_NOT_FOUND` | 404 | Fiat reference lookup miss [F08] |
| `AST1_CHECKER_CONFLICT` | 403 | Checker attached evidence to the case, or lacks the role required by the elevated path |
| `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT` *(master)* | 422 | Admission request for Spot/OTC/Pay on a security outcome; `verify-decision` re-assertion |
| `INSTRUMENT_NOT_ELIGIBLE_FOR_PRODUCT` *(master)* | 422 | Admission for a product the matrix does not permit |
| `AST1_CHANGE_NOT_FOUND` / `AST1_CHANGE_STATE_INVALID` | 404 / 409 | Governed-change lookup/state |
| `AST1_APPROVAL_INVALID` | 403 | IAM-02 token missing/expired/consumed/bound to a different payload |
| `AST1_PAYLOAD_DRIFT` | 409 | Recomputed `payload_hash` ≠ stored (instrument or evidence changed after request) |
| `AST1_DECISION_STALE` | 409 | Classification changed since `evaluate` |
| `AST1_DECISION_EXPIRED` / `AST1_DECISION_CONSUMED` / `AST1_DECISION_REVOKED` | 409 | Token state |
| `AST1_DECISION_BINDING_MISMATCH` | 409 | **Subject, domain, consumer service, instrument**, environment or payload binding mismatch [F02] (same name family as `CFG1_DECISION_BINDING_MISMATCH`) |
| `AST1_VERSION_CONFLICT` | 409 | Stale `expected_version` |
| `AST1_HOLD_PLACEMENT_FORBIDDEN` | 403 | Actor lacks `ast1.hold.request`. **No single-actor human hold exists** [F07] |
| `AST1_ATTESTATION_INVALID` | 422 | `EXM-01` attestation for a non-security instrument, or bound to a non-current record [F13] |
| `SERVICE_IDENTITY_REQUIRED` / `CONFIGURATION_INVALID` / `VALIDATION_ERROR` *(foundation)* | 401/500/400 | Reused verbatim |

## 3. Principles

1. **Fail closed.** Any error on an evaluation path is a **deny** to the consumer; AST-01 never converts an internal failure into an allow, and documents that consumers must treat non-2xx/timeout as deny.
2. **Decisions are answers, gates throw** (04 §1.4).
3. **Never leak evidence.** Errors carry codes, ids and field names, not evidence contents or rationale text.
4. **One code, one meaning across modules.** Master codes are reused; module codes carry `AST1_`. Reason codes for the same concept as CFG-01's use the identical spelling (`environment_mismatch`).
5. **Every deny of a security instrument for an MB product is also a signal** (`ast1.eligibility.security_instrument_refused_for_mb_product`) — someone asked for something that must never happen.
