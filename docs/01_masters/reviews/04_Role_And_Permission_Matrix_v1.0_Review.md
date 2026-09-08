# Principal Fintech Platform Architect Review

## Document Reviewed: 04_Role_And_Permission_Matrix_v1.0.md

| Item | Details |
|---|---|
| Reviewed document | 04_Role_And_Permission_Matrix_v1.0.md |
| Platform | AIX Money Broking Platform |
| Review type | Principal Fintech Platform Architect / Regulated Fintech Security Review |
| Base documents (as cited) | 00_Licence_Scope_And_Feature_Lock_v1.3.md, 01_Project_Charter_v1.3.md, 03_Master_Module_Index_v1.2.md, 02_Software_Requirement_Specification_v1.2.md |
| Review basis | Labuan FSA Money Broking + PSO scope, Exchange application pending |
| Verdict | Strong RBAC / maker-checker / SoD matrix; five gaps to close before the Master Workflow Map |

---

## 0. Summary

This is a thorough, well-structured RBAC matrix — default-deny, backend-source-of-truth, a strong maker-checker matrix (§20), a real SoD conflict matrix (§21), an explicit prohibited-permissions list (§24), and a fully-locked future-exchange matrix (§19). The licence-boundary and principal-dealing controls are tight.

**Version-control flag (read first):** Base document 4 cites **`02_Software_Requirement_Specification_v1.2.md`** and Base document 3 cites **Module Index v1.2** — but the accepted SRS is **v1.1** (no v1.2 exists) and the file named Module Index `v1.2` internally declares itself **v1.3**. The version-labeling drift flagged in the SRS review has now propagated into doc 04. This is a traceability defect (review area 13).

This review focuses on the genuine gaps.

---

## 1. Critical Gaps

### C1. No client-side dual authorization on client money-out (Areas 2, 8) — HIGHEST PRIORITY

Every maker-checker control is **staff-side**. On the client side, a single `CLIENT_OWNER` can submit a withdrawal or accept a trade with no second client approver. For **institutional / HNWI** clients this is a material gap — corporate mandates routinely require dual-signatory authorization on outbound funds. The matrix has `CLIENT_OWNER / CLIENT_USER / CLIENT_READONLY` but no **client-side approver role** and no dual-control requirement for withdrawals or large trades. This is both a fraud-control and an operational-risk gap.

### C2. Complaints/Dispute and DSAR/Privacy modules have no owner or permissions (Areas 1, 2, 9)

SRS CMP-SRS-010 (Complaints / Dispute) and CMP-SRS-011 (Data-Subject Rights / Privacy) exist, but **no role in this matrix can perform them** — no permission rows anywhere, and no **Data Protection Officer (DPO)** role for privacy / DSAR ownership. Two regulated functions (market-conduct complaints handling and PDPA data-subject rights) are unassigned.

### C3. No approval control for outbound payment to the LP / settlement disbursement (Areas 8, 12)

Paying the LP (Binance) for the hedge leg is a **real outbound money movement**, but §11–§13 only cover client-facing trade / settlement. There is no distinct "authorize LP settlement payment / disbursement" permission with maker-checker. The operational money-out path to the counterparty is unassigned — a money-movement control gap.

### C4. No break-glass / emergency access provision (Area 11)

For a regulated production platform there is no defined **emergency elevated-access** path with mandatory heightened logging and post-incident review. Without it, real incidents get handled through informal secret-sharing or standing over-provisioning — both worse than a controlled break-glass procedure.

### C5. Maker-checker matrix (§20) is internally inconsistent with the section tables (Area 5)

§20 is presented as the authoritative maker-checker list, but several actions that carry maker-checker in their own sections are **missing from §20**: MFA reset (IAM-SRS-002.4), data-retention settings change (§17), audit-log export (§18), safeguarding override (§14), and vendor secret rotation (§15). The consolidated matrix should be the single source of truth; these omissions will cause the API / blueprint layer to miss controls.

---

## 2. Recommended Corrections

1. **Add client-side dual control (C1).** Introduce a client-side approver capability (e.g., a `CLIENT_APPROVER` role or an authorized-signatory flag) and require **dual authorization for withdrawals and trades above a configurable threshold** — one client user initiates, another approves. Add it to §12, §20, and §23.2.

2. **Assign Complaints and Privacy ownership (C2).** Add permission rows for CMP-SRS-010 (Support / Compliance create → Compliance / Management resolve) and CMP-SRS-011, and add a **DPO** (or named privacy owner) role accountable for DSAR handling within retention limits.

3. **Add an LP settlement-payment approval permission (C3):** an explicit outbound-to-LP disbursement action with Ops maker / Finance-Manager checker, tied to the three-way reconciliation and DvP sequence so no LP payment fires before client-side control (consistent with SRS MON-SRS-007).

4. **Define a break-glass procedure (C4):** time-boxed emergency access, mandatory heightened audit logging, automatic alerting to Security + Management, and post-incident review — with its own SoD entry (emergency grantor ≠ user).

5. **Reconcile §20 (C5).** Add MFA reset, data-retention change, audit-log export, safeguarding override, and vendor secret rotation to the consolidated maker-checker matrix so it matches the section tables.

6. **Fix the version references (Area 13).** Correct Base document 3 and 4 to the real accepted versions (SRS v1.1; the Module Index whose internal version is v1.3), and align filename ↔ internal-version ↔ citation across the chain.

7. **Add regulatory / threshold reporting permissions.** No role currently owns **threshold transaction report** submission (SRS threshold reporting) or **regulatory report submission to LFSA** (RPT-08) — add with MLRO / Compliance approval.

8. **Tighten the third-party payout override (§12).** The MLRO "OV senior only if future policy allows" cell should be explicitly gated behind the **policy-approval feature flag + EDD**, not MLRO discretion alone, matching SRS MON-SRS-006.3.

9. **Minor:** add permission rows for deposit-address assignment (VND-SRS-004) and client-agreement-version publishing; and require auditor export of highly-restricted STR / AML to be approval-gated (currently `V/X highly restricted` reads as self-serve export).

---

## 3. Additional Permissions / Parameters to Add

```txt
# --- New roles ---
CLIENT_APPROVER            # client-side second authorizer (or authorized-signatory flag)
DPO                        # data protection officer / privacy + DSAR owner

# --- New permission areas ---
approve_client_withdrawal_client_side      # dual client control
resolve_complaint / manage_dispute         # CMP-SRS-010 owner
handle_dsar_privacy_request                # CMP-SRS-011 owner
approve_lp_settlement_payment              # outbound-to-LP disbursement (Ops maker / Finance checker)
submit_threshold_transaction_report        # AML threshold reporting
submit_regulatory_report                   # LFSA returns (RPT-08)
assign_client_deposit_address              # VND-SRS-004
publish_client_agreement_version           # CLT agreement lifecycle
grant_break_glass_access                   # emergency access (heightened logging)

# --- New SoD conflicts ---
SOD-016  Onboarding reviewer approves same client's first/large trade        # Block or senior override
SOD-017  Break-glass grantor is the same user receiving emergency access     # Block
SOD-018  Complaint owner resolves own complaint without oversight            # Block/senior

# --- Control parameters ---
client_side_dual_authorization = required_for_withdrawal_and_large_trade
client_dual_control_threshold = to_be_defined
lp_settlement_payment_approval = maker_checker
break_glass_access = defined_with_heightened_logging_and_post_review
third_party_payout_override = requires_policy_approval_flag
complaints_module_owner = assigned
dsar_privacy_owner = dpo
makerchecker_matrix_is_single_source_of_truth = true
base_document_versions = reconciled
```

---

## 4. Top Priorities Before the Master Workflow Map

1. **C1** — Client-side dual authorization. The biggest access-control hole for institutional money-out.
2. **C3** — LP settlement-payment approval. The unassigned outbound money path to the counterparty.
3. **C2** — Complaints + DSAR ownership. Two regulated functions with no role.

C5 (§20 consistency) and the version fix (Area 13) should be closed in the same pass, since the workflow map will inherit whatever §20 and the base references say.
