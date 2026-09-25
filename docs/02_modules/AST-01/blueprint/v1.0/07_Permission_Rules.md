# AST-01 — 07 Permission Rules

**Status: PLANNED / AWAITING REVIEW.** Sources: Role Matrix v1.3 §3.4 (never self-approve), §3.7 (a permission never activates a capability), §5.2 (`INSTRUMENT_CLASSIFIER`), §5.2A rule 9, §19A, §22 (Asset & Instrument Registry row); Doc 00 §21A rule 3; `ASSET-RULE-001` rule 6.

Permission names below are **proposed**. Registering them in IAM-02 is a change to IAM-02 (`017_iam2_register_cfg1_mutation_permissions` is the precedent) and is recorded as **DCR-AST1-001**, not made here.

## 1. Roles (from the masters; none invented)

| Role | Source | AST-01 duties |
|---|---|---|
| `INSTRUMENT_CLASSIFIER` | Role Matrix §5.2 (new in v1.3, `AST-01`) | **Maker** of classification. Records outcome and evidence. **Never self-approves** |
| `COMPLIANCE_OFFICER` | Role Matrix §22 | **Checker** of classification, admission, evidence standard |
| `MLRO` | Role Matrix §22 (checker for Asset & Instrument Registry) | Checker; elevated second checker (HD-8) |
| `RWA_OPERATIONS_OFFICER`, `ADMIN` | `WF-35` step 1 | Propose instruments (create `DRAFT`) |
| `COMPLIANCE_ANALYST`, `OPS`/`OPS_MANAGER` | Role Matrix §22 (makers "Instrument Classifier, Compliance") | Admission/operational requests |
| `MANAGEMENT` | §19A-style | Co-approver for evidence standards |
| `AUDITOR` | §5.2 | Read-only |
| Service identities (`OMS-01`, `TRD-01`, `WLT-01`, `PAY-01`, `RWA-*`, `EXM-01`, `EXP-01`, `CFG-01`) | — | `evaluate` / `verify-decision` only |

**`SUPER_ADMIN` and `ADMIN` cannot classify, cannot approve a classification, and cannot override a prohibited category** (`ASSET-RULE-001` rule 6; Role Matrix §3.4). Neither role appears in any checker column here.

## 2. Standing rules

1. **A permission never activates or grants eligibility** (Role Matrix §3.7, Doc 00 §21A rule 3). Holding `ast1.classification.submit` says nothing about any instrument's eligibility; an `ELIGIBLE` answer says nothing about the caller's permission.
2. `maker ≠ checker` is enforced **three times**: IAM-02 approval policy, AST-01's local check on the verified checker identity (`governed_change` CHECK, 05 §6), and the `classification_record` CHECK. `IAM2-FIND-002` (no entitlement evaluation on approve/reject) and `IAM2-FIND-003` (no approval policy seeded; weakest control applied silently) are open, so AST-01 does **not** rely on IAM-02 alone. **AST-01 must not go live for real classification until an approval policy for the AST-01 actions is seeded in IAM-02** (DCR-AST1-001; a trigger condition, not a blocker on design).
3. **Separation across the classification pipeline:** the actor who proposed the instrument, the maker who submitted the outcome, and the checker are three roles; proposer = maker is allowed, maker = checker is never allowed. A checker who attached evidence to the case cannot approve that case (`CHECKER_CONFLICT`).
4. Every action requires an IAM-02 `permission/check` result of `allow` (or `approval_required` for LOOSEN kinds routed to request/apply). Unknown ⇒ deny.
5. Service identities are allow-listed per route; an unlisted service is refused before any state is read.

## 3. Proposed permission catalogue

| Permission | Roles (proposal) | Notes |
|---|---|---|
| `ast1.registry.read` | staff roles above, `AUDITOR`, service identities (read routes) | |
| `ast1.registry.propose` | `RWA_OPERATIONS_OFFICER`, `ADMIN`, `INSTRUMENT_CLASSIFIER` | Creates `DRAFT`; grants nothing |
| `ast1.classification.open` / `.record_evidence` | `INSTRUMENT_CLASSIFIER`, `COMPLIANCE_ANALYST` | |
| `ast1.classification.submit` | `INSTRUMENT_CLASSIFIER` | Maker |
| `ast1.classification.approve` | `COMPLIANCE_OFFICER`, `MLRO` | Checker via IAM-02 approval; `requires_approval = true` |
| `ast1.classification.approve_elevated` | `MLRO` (+ `COMPLIANCE_OFFICER`) | Second checker for `SECURITY → NON_SECURITY` (HD-8) |
| `ast1.classification.read` | as registry read | |
| `ast1.hold.place` | **HD-6** — proposal: `COMPLIANCE_OFFICER`, `MLRO`, `INSTRUMENT_CLASSIFIER`; plus `system` | Single actor; tighten only |
| `ast1.hold.release_request` / `.release_approve` | `COMPLIANCE_OFFICER` / `COMPLIANCE_OFFICER`+`MLRO` | Loosen |
| `ast1.admission.request` / `.approve` / `.suspend` | analyst-or-ops / `COMPLIANCE_OFFICER` / `COMPLIANCE_OFFICER`,`OPS_MANAGER`,`MLRO` | Suspend is tighten |
| `ast1.custody.request` / `.approve` / `.withdraw` | ops / `COMPLIANCE_OFFICER` / ops+compliance | |
| `ast1.operational.enable_request` / `.enable_approve` / `.suspend` | ops / `OPS_MANAGER`+`COMPLIANCE_OFFICER` / ops+compliance | Enable is loosen |
| `ast1.restriction.add` / `.relax_request` / `.relax_approve` | compliance / compliance / `COMPLIANCE_OFFICER` | |
| `ast1.jurisdiction.add` / `.relax_request` / `.relax_approve` | same | |
| `ast1.evidence_standard.propose` / `.approve` / `.retire` | `COMPLIANCE_OFFICER` / `COMPLIANCE_OFFICER`+`MANAGEMENT` / `COMPLIANCE_OFFICER` | Approve has `r4q3_resolution_ref` precondition for PRODUCTION |
| `ast1.instrument.retire` | `COMPLIANCE_OFFICER` (M+C) | |
| `ast1.eligibility.evaluate` | service identities | Not a human permission |
| `ast1.audit.read` / `ast1.evidence.export_request` / `.export_approve` | `AUDITOR`, `COMPLIANCE_OFFICER` / `MLRO` | Later phase |

No permission in this catalogue can set eligibility, edit a classification record, delete evidence, clear a prohibited attribute, or promote a synthetic instrument — those operations do not exist (04 §9).

## 4. Enforcement layering

| Layer | Enforces |
|---|---|
| IAM-02 permission + approval | Who may attempt each action; approval existence |
| AST-01 service | Actor/role separation, maker ≠ checker on the verified identity, direction (tighten/loosen) determination, payload-hash binding |
| DB | CHECK/trigger backstops (05), grants |
| CFG-01 | Whether AST-01's write capabilities are available in the environment (DCR-AST1-003) — **not** an input to AST-01's eligibility derivation |

## 5. Maker-checker matrix and the tighten/loosen asymmetry

`direction` is computed by the server from (kind, current state), never supplied by the caller.

| Change kind | Direction | Maker | Checker(s) |
|---|---|---|---|
| `CLASSIFICATION_APPLY` `UNRESOLVED→NON_SECURITY` / `→SECURITY` / `→SYNTHETIC` | LOOSEN (opens paths) | `INSTRUMENT_CLASSIFIER` | `COMPLIANCE_OFFICER` (or `MLRO`) |
| `CLASSIFICATION_APPLY` `NON_SECURITY→SECURITY`, `*→UNRESOLVED` | TIGHTEN in effect but **still maker-checkered** (Role Matrix §5.2A rule 9 — a classification is only ever changed maker-checkered); hold provides immediacy | `INSTRUMENT_CLASSIFIER` | `COMPLIANCE_OFFICER` |
| `CLASSIFICATION_APPLY` `SECURITY→NON_SECURITY` | LOOSEN (most dangerous) | `INSTRUMENT_CLASSIFIER` | `COMPLIANCE_OFFICER` **and** `MLRO` (HD-8), fresh evidence bundle |
| `HOLD_PLACE` | TIGHTEN | single actor / `system` | none |
| `HOLD_RELEASE` | LOOSEN | ops/compliance | `COMPLIANCE_OFFICER` (+ `MLRO`) |
| `ADMISSION_APPROVE` / re-approve | LOOSEN | analyst/ops | `COMPLIANCE_OFFICER` |
| `ADMISSION_SUSPEND` / `WITHDRAW` | TIGHTEN | single | none |
| `CUSTODY_APPROVE` | LOOSEN | ops | `COMPLIANCE_OFFICER` |
| `OPERATIONAL_ENABLE` | LOOSEN | ops | `OPS_MANAGER` + `COMPLIANCE_OFFICER` |
| `OPERATIONAL_SUSPEND` / `DISABLE` | TIGHTEN | single | none |
| `RESTRICTION_ADD` / `JURISDICTION_ADD` | TIGHTEN | single | none |
| `RESTRICTION_LIFT` / `JURISDICTION_LIFT` | LOOSEN | compliance | `COMPLIANCE_OFFICER` |
| `TRANSFER_PROFILE_ASSESS` | LOOSEN | compliance | `COMPLIANCE_OFFICER` |
| `EVIDENCE_STANDARD_APPROVE` | LOOSEN | `COMPLIANCE_OFFICER` | `MANAGEMENT` (+ `r4q3_resolution_ref` for PRODUCTION) |
| `INSTRUMENT_RETIRE` | TIGHTEN in effect, maker-checkered (permanent) | compliance | `COMPLIANCE_OFFICER` |
| `EXCHANGE_ATTESTATION_WITHDRAW` | TIGHTEN | `EXM-01` service | none |

Rationale: **fail-closed actions must never be blocked by a missing checker** (`SYS-RULE-008`); **actions that open a path must be approved** (`AST-SRS-001` req 6). Only classification itself stays strictly maker-checkered in both directions, because the Role Matrix says so without a tightening exception.

## 6. Actor evidence

Every governed action records `requested_by`, `approval_id`, `checker_actor_id`, IAM-02 decision-token hash, `payload_hash`, environment, `request_id`, `correlation_id`, and the classification record and matrix version relevant to the decision (08).
