# AST-01 — 09 Error Handling (v1.3)

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
| **`ASSET_NOT_ALLOWED`** *(master)* | — | `INELIGIBLE` | Prohibited category (privacy coin, algorithmic stablecoin, yield/derivative feature, `ALGORITHMIC` backing). **Digital MYR is no longer here**: it is `NOT_ASSESSED` `MYR_PAIR_CONTROL_UNRESOLVED` (AST-P-4) |
| `PAIR_NOT_ALLOWED`, `LICENCE_SCOPE_BLOCKED` *(master)* | — | — | Reserved for pair-level consumers; AST-01 does not emit them |
| `CLASSIFICATION_ENVIRONMENT_MISMATCH` | 35 | `NOT_ASSESSED` | Record from another canonical environment |
| `CLASSIFICATION_IDENTITY_DRIFT` | ≤ 48 | `NOT_ASSESSED` | Record fingerprint ≠ the instrument's fingerprint and **no verified correction marker explains it** — **unexplained drift**: integrity failure, `SYSTEM` hold. SQL rule B12 denies (`AS001`, tag `B12`) [v1.3: F26 clarifies scope] |
| **`CLASSIFICATION_REQUIRED_AFTER_CORRECTION`** [v1.3: F26] | 40 | `NOT_ASSESSED` | The asset's class was corrected by a **governed** `ASSET_CLASS_CORRECTION`; earlier records are unusable; a **new governed classification** is required. **Expected state, not an integrity failure — no hold.** SQL rule B12 denies with the same tag; a verified `class_correction_marker` selects this code over `CLASSIFICATION_IDENTITY_DRIFT` |
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
| `INSTRUMENT_NOT_FOUND` | ≤ 48 | `NOT_ASSESSED` | **0 matches** for a canonical reference (logged with a null instrument and the requested reference) |
| **`INSTRUMENT_REFERENCE_AMBIGUOUS`** [F17] | 30 | `NOT_ASSESSED` | >1 match or any doubt; never resolved to a "best" instrument. No token |
| **`INSTRUMENT_REFERENCE_MISMATCH`** [F17] | 29 | `NOT_ASSESSED` | `asserted_asset_code` ≠ the resolved instrument's asset code |
| **`LINEAGE_SECURITY_REVIEW_REQUIRED`** [F20; v1.3: F27] | 32 | `NOT_ASSESSED` | A real `SECURITY` determination newer than this instrument's own record exists in its lineage or its underlying's lineage, **or a lineage merge newer than its record whose tree holds a real `SECURITY` record recorded before the merge** (own tree or an underlying's); cleared only by a newer elevated record. The evaluate response's `lineage_review_trigger` names which |
| **`MYR_PAIR_CONTROL_UNRESOLVED`** [F21, AST-P-4] | 27 | `NOT_ASSESSED` | Digital MYR-denominated instrument; no pair-control owner/rule exists; **no override** |
| **`REAL_INSTRUMENT_NON_PRODUCTION_BASIS`** [F25, AST-R2-HD-01] | 36 | `NOT_ASSESSED` | Real `NON_SECURITY` record whose evidence standard is not production-applicable |
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
| **`AST1_ADDRESS_NOT_CANONICAL`** [v1.3: F28.a] | 422 | Contract address not in the database's canonical form for the network's registered rule (or the network has no supported rule); rejected, never rewritten or stored under a second spelling. SQLSTATE `AS005` |
| **`AST1_LOCK_SET_CHANGED`** [v1.3: F27, F26] | 409 | A lineage merge, real `SECURITY` apply or `ASSET_CLASS_CORRECTION` found its affected set had grown after it was locked; the transaction rolled back; retry with a fresh approval. SQLSTATE `AS006` |
| `AST1_INSTRUMENT_DUPLICATE_IDENTITY` | 409 | Canonical identity (token contract, or native chain+network) already registered in **any** status, including retired/abandoned — never re-registrable [F19.E] |
| `AST1_CLASS_CLASSIFICATION_CONFLICT` | 422 | `SECURITY`/`SECURITY_TOKEN` class proposed `NON_SECURITY` (definitional; **not** raised for `TOKENISED_DEBT`/`TOKENISED_FUND`, AST-HD-4) |
| `AST1_SYNTHETIC_MISMATCH` | 422 | Real instrument given synthetic outcome or vice versa; synthetic code/declaration mismatch; synthetic evidence cited by a real instrument |
| `SYNTHETIC_INSTRUMENT_NOT_VALID_IN_PRODUCTION` *(master)* | 422 | Attempt to create/classify a synthetic instrument in PRODUCTION |
| `AST1_EVIDENCE_STANDARD_NOT_ESTABLISHED` | 422 | Submit/apply with no applicable approved standard |
| `AST1_EVIDENCE_INCOMPLETE` | 422 | Evidence does not satisfy the standard's required types |
| `AST1_CASE_ALREADY_OPEN` | 409 | Second non-terminal case |
| `AST1_CLASSIFICATION_SELF_APPROVAL_FORBIDDEN` | 403 | maker ∈ IAM-02-attested approvers |
| `AST1_APPROVER_ATTESTATION_MISSING` | 403 | IAM-02 returned no attested approver identity/policy [F05]; apply refused |
| `AST1_ELEVATED_APPROVAL_REQUIRED` | 403 | `elevated` lineage: fewer than two distinct attested checkers, or no evidence whose DB-assigned `evidence_global_seq` exceeds the review floor (the newest triggering `SECURITY` record **or lineage merge**), or a stale `follows_event_*` binding (`binding_stale`) [F06; v1.3: F27, F28.b] |
| ~~`AST1_LINEAGE_CONTINUITY_REQUIRED`~~ | — | **Withdrawn in v1.2**: same-contract continuity is impossible (identity is registered once), so this is never raised; a duplicate is `AST1_INSTRUMENT_DUPLICATE_IDENTITY` |
| `AST1_INSTRUMENT_IMMUTABLE_FIELD` | 409 | Edit of `instrument_code`/`declared_synthetic`/`synthetic_emulates` [F09] or `asset_id`/`instrument_form`/`chain`/`network`/`contract_address` [F19.D] |
| `AST1_ASSET_CLASS_FROZEN` | 409 | `asset_class` update once an instrument exists, other than a governed `ASSET_CLASS_CORRECTION` [F22, AST-P-3] |
| `AST1_UNDERLYING_CYCLE` | 422 | Underlying link closes a cycle, exceeds depth 8, or crosses real/synthetic [F19.B] |
| `AST1_EVIDENCE_STANDARD_NOT_PRODUCTION_APPLICABLE` | 422 | Real instrument `NON_SECURITY` proposed under a non-production standard [F25] |
| `AST1_SUBJECT_NOT_PERMITTED_FOR_CALLER` | 403 | Caller not allow-listed for the subject [F02, F01] |
| `AST1_CURRENCY_NOT_FOUND` | 404 | Fiat reference lookup miss [F08] |
| `AST1_CHECKER_CONFLICT` | 403 | Checker attached evidence to the case, or lacks the role required by the elevated path |
| `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT` *(master)* | 422 | Admission request for Spot/OTC/Pay on a security outcome; `verify-decision` re-assertion |
| `INSTRUMENT_NOT_ELIGIBLE_FOR_PRODUCT` *(master)* | 422 | Admission for a product the matrix does not permit |
| `AST1_CHANGE_NOT_FOUND` / `AST1_CHANGE_STATE_INVALID` | 404 / 409 | Governed-change lookup/state |
| `AST1_APPROVAL_INVALID` | 403 | IAM-02 token missing/expired/consumed/bound to a different payload |
| `AST1_PAYLOAD_DRIFT` | 409 | Recomputed `payload_hash` ≠ stored (instrument or evidence changed after request) |
| `AST1_DECISION_STALE` | 409 | Classification changed since `evaluate`, or a conjunct (hold, lineage review, MYR, basis) or the SQL backstop now denies at consumption [F18] |
| `AST1_DECISION_EXPIRED` / `AST1_DECISION_CONSUMED` / `AST1_DECISION_REVOKED` | 409 | Token state |
| `AST1_DECISION_NOT_FOUND` | 404 | Unknown token hash [F18] |
| `AST1_DECISION_UNAVAILABLE` | 503 | Lock timeout or deadlock during mint/consume; token left unconsumed; **consumers treat as deny** [F18] |
| `AST1_DECISION_BINDING_MISMATCH` | 409 | **Subject, domain, consumer service, instrument**, environment, or payload binding mismatch — including the **client facts, caller reference and client reference** covered by `payload_hash` [F02, F23] (same name family as `CFG1_DECISION_BINDING_MISMATCH`) |
| `AST1_VERSION_CONFLICT` | 409 | Stale `expected_version` |
| `AST1_HOLD_PLACEMENT_FORBIDDEN` | 403 | Actor lacks `ast1.hold.request`. **No single-actor human hold exists** [F07] |
| `AST1_ATTESTATION_INVALID` | 422 | `EXM-01` attestation for a non-security instrument, or bound to a non-current record [F13] |
| `SERVICE_IDENTITY_REQUIRED` / `CONFIGURATION_INVALID` / `VALIDATION_ERROR` *(foundation)* | 401/500/400 | Reused verbatim |

### 2.1 Database integrity errors (SQLSTATE class `AS`) [v1.2: F18, F24]

Raised by triggers; the transaction that hit them **is rolled back** and nothing they attempted persists. The application catches them, maps them to the API vocabulary above and performs any follow-up (revoke, `SYSTEM` hold, critical audit) in a **separate** transaction.

| SQLSTATE | Meaning | Mapped to |
|---|---|---|
| `AS001` | Backstop denied an `allow` insert or a conjunct-row approval (`backstop_permits` false) | deny + `hard_rule_backstop_triggered`; `SECURITY_INSTRUMENT_NOT_ADMISSIBLE_TO_MB_PRODUCT` where B1; **[v1.3] tag `B12`: `CLASSIFICATION_REQUIRED_AFTER_CORRECTION` when explained by a correction marker (no hold), else `CLASSIFICATION_IDENTITY_DRIFT` (+ `SYSTEM` hold)**; tag `B8`: `LINEAGE_SECURITY_REVIEW_REQUIRED` |
| `AS002` | Immutable column/table touched (`UPDATE` of an insert-immutable key, token binding column, `deployment_environment`, lineage field, **`lineage` row (incl. `synthetic`)**, `lineage_gate` [v1.3: F28.c]) | `AST1_INSTRUMENT_IMMUTABLE_FIELD` or internal error + critical event |
| `AS003` | Token consumption rejected by `assert_token_consumable()` (incl. rules B8 and **B12** at consumption) | `AST1_DECISION_STALE`; `consume_backstop_triggered` when the app had not already flagged it (not for an explained B12: the correction transaction already revoked the token) |
| `AS004` | Identity/lineage invariant (duplicate canonical identity, underlying cycle, class/form inconsistency, **merge argument not a current root, real/synthetic merge** [v1.3]) | `AST1_INSTRUMENT_DUPLICATE_IDENTITY` / `AST1_UNDERLYING_CYCLE` / validation error |
| **`AS005`** [v1.3: F28.a] | Non-canonical contract identity (the supplied value ≠ the database's canonical form; unsupported network rule) | `AST1_ADDRESS_NOT_CANONICAL` |
| **`AS006`** [v1.3: F27, F26] | Lock protocol violation: an out-of-order lock request, or the affected set grew after locking | `AST1_LOCK_SET_CHANGED` (retry) or internal error + critical event |

## 3. Principles

1. **Fail closed.** Any error on an evaluation path is a **deny** to the consumer; AST-01 never converts an internal failure into an allow, and documents that consumers must treat non-2xx/timeout as deny.
2. **Decisions are answers, gates throw** (04 §1.4).
3. **Never leak evidence.** Errors carry codes, ids and field names, not evidence contents or rationale text.
4. **One code, one meaning across modules.** Master codes are reused; module codes carry `AST1_`. Reason codes for the same concept as CFG-01's use the identical spelling (`environment_mismatch`).
5. **Every deny of a security instrument for an MB product is also a signal** (`ast1.eligibility.security_instrument_refused_for_mb_product`) — someone asked for something that must never happen.
