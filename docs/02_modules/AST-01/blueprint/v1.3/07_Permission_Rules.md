# AST-01 — 07 Permission Rules (v1.3)

**Status: REMEDIATED / AWAITING RE-REVIEW.** Sources (citations corrected in v1.1 [F14]): Role Matrix v1.3 **§3.4** (no self-approval), **§3.7** (a permission never activates a capability), **§5.2** (Staff Roles — `INSTRUMENT_CLASSIFIER`), **§19 rule 9** ("an instrument's classification may be changed only by `INSTRUMENT_CLASSIFIER` as maker with a Compliance Officer checker, never self-approved"), **§19A** (capability activation; kill switch), **§23** (Maker-Checker Matrix), **§28** (Role-to-Module Summary: Asset & Instrument Registry — makers "Instrument Classifier, Compliance"; checkers "Compliance Officer, MLRO"); Doc 00 §21A rule 3; `ASSET-RULE-001` rule 6; `CFG-RULE-004`. (v1.0 mis-cited "§5.2A rule 9" and "§22"; they are §19 rule 9 and §28.)

Permission names are **proposed**; registering them in IAM-02 is a change to IAM-02 (migration `017_iam2_register_cfg1_mutation_permissions` is the precedent) and is **DCR-AST1-001**, not made here.

## 1. Roles (from the masters; none invented)

| Role | Source | AST-01 duties |
|---|---|---|
| `INSTRUMENT_CLASSIFIER` | Role Matrix §5.2 | **Maker** of classification. Never self-approves |
| `COMPLIANCE_OFFICER` | Role Matrix §23, §28 | **Checker** of classification, admission, restrictions, evidence standard |
| `MLRO` | Role Matrix §23, §28 | Checker; **second checker** on the elevated path (AST-HD-8) |
| `RWA_OPERATIONS_OFFICER`, `ADMIN` | `WF-35` step 1 | Propose assets/instruments (creates `DRAFT`) |
| Compliance Analyst, Ops / Ops Manager | Role Matrix §23 "Asset approval", §28 | Admission, custody, operational requests |
| `MANAGEMENT` | Role Matrix §19A pattern | Co-approver of evidence standards |
| `AUDITOR` | §5.2 | Read-only |
| Service identities (`OMS-01`, `TRD-01`, `WLT-01`, `PAY-01`, `RWA-*`, `EXM-01`, `EXP-01`, `EXC-01`, `CFG-01`) | — | `evaluate`/`verify-decision` for **allow-listed subjects only** (01 §5.8) |

**`SUPER_ADMIN` and `ADMIN` cannot classify, approve a classification, or override a prohibited category** (`ASSET-RULE-001` rule 6; Role Matrix §3.4).

## 2. Standing rules

1. **A permission never activates or grants eligibility** (§3.7; Doc 00 §21A rule 3).
2. **Maker ≠ checker is checked against approver identity that IAM-02 attests** [F05]. IAM-02 `execute-verify` currently returns no approver identity (`services/iam2/src/routes/internal.ts`); AST-01 therefore does **not** claim to verify it independently. **DCR-AST1-001(d)** requires IAM-02 to return the verified approver identity(ies) and approval-policy identity; AST-01 stores only those, and the DB CHECK constrains the stored values. **Until (a)+(d) are delivered, governed classification apply cannot be enabled** (an implementation gate, 01 §4.8). `IAM2-FIND-002` and `IAM2-FIND-003` remain open and independently gate go-live.
3. A checker who attached evidence to the case cannot approve it (`CHECKER_CONFLICT`).
4. Every action requires an IAM-02 `permission/check` result of `allow` (or `approval_required` routed to request/apply). Unknown ⇒ deny.
5. Service identities are allow-listed per **subject**; an unlisted subject is refused before any state is read. **[v1.2: F23]** The allow-list is a deep-frozen constant guarded by a boot invariant (04 §1.1): MB/PSO service identities can never be allow-listed for securities/RWA subjects, and `WLT-01` only for `DEPOSIT_MB_PSO`/`WITHDRAWAL_MB_PSO`.
6. **Human-initiated changes of either direction — loosening or tightening — are maker-checkered** until the Role Matrix establishes a single-actor authority [F07, AST-HD-6]. **`SYS-RULE-008` (deactivation of `PRODUCTION_ACTIVATION_STATE`) and the CFG-01 kill switch (`SECURITY_ADMIN`/`SUPER_ADMIN`, post-hoc review — Role Matrix §19A) are precedent only, not authority for instrument holds.** System-detected integrity failures deny immediately by derivation and need no human approval (`SYS-RULE-010`).

## 3. Proposed permission catalogue

| Permission | Roles (proposal) | Notes |
|---|---|---|
| `ast1.registry.read` | staff roles, `AUDITOR`, allow-listed services (incl. fiat lookup) | |
| `ast1.registry.propose` | `RWA_OPERATIONS_OFFICER`, `ADMIN`, `INSTRUMENT_CLASSIFIER` | Creates `DRAFT`, grants nothing |
| `ast1.classification.open` / `.record_evidence` | `INSTRUMENT_CLASSIFIER`, Compliance Analyst | |
| `ast1.classification.submit` | `INSTRUMENT_CLASSIFIER` | Maker |
| `ast1.classification.approve` | `COMPLIANCE_OFFICER`, `MLRO` | Checker; `requires_approval` |
| `ast1.classification.approve_elevated` | `MLRO` | Second checker on the `elevated` path — including the **reaffirmation of a sibling** held by `LINEAGE_SECURITY_REVIEW_REQUIRED` (**whether the trigger was a `SECURITY` record or a lineage merge [v1.3: F27]**) and a wrapper of a security-determined instrument |
| `ast1.classification.read` | as registry read | |
| `ast1.hold.request` / `.release_request` | `COMPLIANCE_OFFICER`, `MLRO`, `INSTRUMENT_CLASSIFIER` request; approval as §5 | **Maker-checker** [F07]. No single-actor permission exists |
| `ast1.admission.request` / `.approve` | analyst/ops / `COMPLIANCE_OFFICER` | |
| `ast1.custody.request` / `.approve` | ops / `COMPLIANCE_OFFICER` | |
| `ast1.operational.request` / `.approve` | ops / `OPS_MANAGER` + `COMPLIANCE_OFFICER` | |
| `ast1.restriction.request` / `ast1.jurisdiction.request` / `.approve` | compliance / `COMPLIANCE_OFFICER` | |
| `ast1.lineage.merge_request` / `.approve` | compliance / `COMPLIANCE_OFFICER` | Irreversible; the only governed lineage operation |
| `ast1.asset.class_correction_request` / `.approve` **[v1.2: AST-P-3]** | `INSTRUMENT_CLASSIFIER` / `COMPLIANCE_OFFICER` (+ `MLRO` via `ast1.classification.approve_elevated` when leaving `SECURITY`/`SECURITY_TOKEN`) | Corrects a mislabelled class; lineage preserved |
| `ast1.evidence_standard.propose` / `.approve` / `.retire` | `COMPLIANCE_OFFICER` / `COMPLIANCE_OFFICER` + `MANAGEMENT` / `COMPLIANCE_OFFICER` | PRODUCTION needs `r4q3_resolution_ref` |
| `ast1.risk_profile.request` / `.approve` | compliance / `COMPLIANCE_OFFICER` | Informational |
| `ast1.instrument.retire_request` / `.approve` | compliance / `COMPLIANCE_OFFICER` | |
| `ast1.eligibility.evaluate` | service identities | Not a human permission |
| `ast1.audit.read`, `ast1.evidence.export_*` | `AUDITOR`, `COMPLIANCE_OFFICER` / `MLRO` | Later phase |

No permission can set eligibility, edit a classification record, delete evidence, clear a prohibited attribute, promote a synthetic instrument, or classify fiat.

## 4. Enforcement layering

IAM-02 (who may attempt, approval existence, **attested** approvers) → AST-01 service (role separation on attested identities, payload-hash binding, service/subject allow-list) → DB (CHECK/trigger backstops, grants) → CFG-01 (availability of AST-01's own write capabilities; never an input to derivation, DCR-AST1-003).

## 5. Change-kind authority map [F14]

**Every governed change kind is mapped to the Role Matrix authority that covers it, or to a DCR where the matrix has no matching row.** "M/C" = maker/checker roles as the master states them.

| Change kind | Origin | Approval used by AST-01 | Role Matrix authority | Status |
|---|---|---|---|---|
| Create asset/instrument (`DRAFT`), issuer reference, underlying | HUMAN | none (audit only; grants nothing) | `WF-35` step 1 (`RWA_OPERATIONS_OFFICER`/`ADMIN`) | Covered |
| `CLASSIFICATION_APPLY` (not elevated) | HUMAN | `INSTRUMENT_CLASSIFIER` M; `COMPLIANCE_OFFICER` C | **§19 rule 9** (explicit); §28 checkers CO/MLRO. No dedicated §23 row | **Covered by §19 rule 9; §23 row missing → DCR-AST1-006** |
| `CLASSIFICATION_APPLY` **elevated** (`→NON_SECURITY` with a real `SECURITY` in lineage) | HUMAN | M + **`COMPLIANCE_OFFICER` and `MLRO`** | Stricter than §19 rule 9; within the §28 checker set | AST-HD-8 approved; **encode in Role Matrix → DCR-AST1-006** |
| `PRODUCT_ADMISSION_APPROVE` / re-approve | HUMAN | Compliance Analyst/Officer M; `COMPLIANCE_OFFICER` C | **§23 "Asset approval"** (M: Compliance Analyst/Officer; C: Compliance Officer/MLRO; min CO) | Covered |
| `PRODUCT_ADMISSION_SUSPEND` / `WITHDRAW` | HUMAN | M + `COMPLIANCE_OFFICER` C | No row (nearest: §23 "Asset approval") | **DCR-AST1-006** |
| `HOLD_PLACE` / `HOLD_RELEASE` | HUMAN | M + `COMPLIANCE_OFFICER` C (release: + `MLRO` for a `SECURITY` instrument) | **No matching authority** (§19A kill switch / `SYS-RULE-008` = precedent only) | **DCR-AST1-006** |
| `HOLD_PLACE` | **SYSTEM** | none | `SYS-RULE-010` (unknown/unreadable denies) | Covered by fail-closed rule |
| `CUSTODY_APPROVE` / `WITHDRAW` | HUMAN | ops M; `COMPLIANCE_OFFICER` C | No row (nearest §23 "Asset approval") | **DCR-AST1-006** |
| `OPERATIONAL_ENABLE` / `SUSPEND` / `DISABLE` (deposit/withdrawal subjects) | HUMAN | ops M; `OPS_MANAGER` + `COMPLIANCE_OFFICER` C | Nearest **§23 "Asset/pair activation"** (Admin + domain M; Super Admin + domain checker) — asset activation, not deposit/withdrawal enablement | **Confirm mapping → DCR-AST1-006** |
| `RESTRICTION_ADD/LIFT`, `JURISDICTION_ADD/LIFT`, `TRANSFER_PROFILE_ASSESS` | HUMAN | compliance M; `COMPLIANCE_OFFICER` C | No row | **DCR-AST1-006** |
| `EVIDENCE_STANDARD_APPROVE` / `RETIRE` | HUMAN | `COMPLIANCE_OFFICER` M; `MANAGEMENT` C | No row (pattern of §19A activation) | **DCR-AST1-006** |
| `LINEAGE_MERGE` | HUMAN | compliance M; `COMPLIANCE_OFFICER` C. **[v1.3: F27]** The apply also performs the propagation (narrowing, token revocation) — a tightening, so no extra approver | No row | **DCR-AST1-006** (extended: merge-triggered elevated reaffirmation, next row) |
| `ASSET_CLASS_CORRECTION` **[v1.2]** | HUMAN | `INSTRUMENT_CLASSIFIER` M; `COMPLIANCE_OFFICER` C (+ `MLRO` when leaving `SECURITY`/`SECURITY_TOKEN`) | Stricter than §19 rule 9 where it loosens; within the §28 checker set | **DCR-AST1-006** |
| `CLASSIFICATION_APPLY` **reaffirming a sibling** after a lineage `SECURITY` determination **[v1.2]** — **and, [v1.3: F27], reaffirming or reclassifying an instrument held by `LINEAGE_SECURITY_REVIEW_REQUIRED` because a governed lineage merge joined security history to it (including through an underlying's tree)** | HUMAN | as elevated `CLASSIFICATION_APPLY` (M + `COMPLIANCE_OFFICER` + `MLRO`); evidence newer than the review floor, bound to the triggering event | as elevated row | **DCR-AST1-006** (extended to name merge-triggered elevated reaffirmation/review authority) |
| `SYSTEM_HOLD` **on lineage-propagation gap or unexplained identity drift** **[v1.3]** (sweep, 05 §7.1) | **SYSTEM** | none | `SYS-RULE-010` | Covered by fail-closed rule. A *governed* correction awaiting reclassification, or a lineage awaiting elevated review, is **not** an anomaly and places no hold |
| `HOLD_PLACE` after a caught backstop error **[v1.2]** | **SYSTEM** | none | `SYS-RULE-010`; placed by the application in a separate transaction | Covered by fail-closed rule |
| `RISK_PROFILE_SET` | HUMAN | compliance M; `COMPLIANCE_OFFICER` C | No row | **DCR-AST1-006** |
| `INSTRUMENT_RETIRE` | HUMAN | compliance M; `COMPLIANCE_OFFICER` C | No row | **DCR-AST1-006** |
| `ATTESTATION_WITHDRAW` | **SERVICE** (`EXM-01`) | none | `WF-32` (EXM-01 owns listing status) | Covered by service-origin rule |

Where the Role Matrix is silent, AST-01 applies the master-compliant default (**actor + `COMPLIANCE_OFFICER` checker**) and does not invent an authority; the DCR asks the Role Matrix owner to state one.

## 6. Actor evidence

Every governed action records `requested_by`, `approval_id`, **IAM-02-attested** `approver_actor_ids` and `approval_policy_id`, decision-token hash, `payload_hash`, environment, request/correlation ids, and the classification record and matrix version relevant to the decision (08).
