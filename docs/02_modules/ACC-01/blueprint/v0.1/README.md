---
document_id: ACC-01-BP-v0.1
title: ACC-01 Blueprint Pack — Account Structure (Master Account & Subaccount)
version: v0.1
document_status: DRAFT
implementation_status: NOT_STARTED
module: ACC-01
control: Master account and subaccount identity, lifecycle, legal-entity ownership
owner: Unassigned
effective_date: 2026-09-26
last_reviewed: 2026-09-26
supersedes: none
baseline_commit: 5a4f872
---

# ACC-01 Blueprint Pack v0.1 — Account Structure

**Status: PLANNED / AWAITING REVIEW.** Planning only. This pack designs; it authorises **no application code and no migration**. Implementation requires human approval of this pack, resolution of the human decisions in file 17, and its own approved task records.

## Reconstruction basis

ACC-01 has no prior blueprint. Its requirements are **reconstructed** from the sources below; no requirement in this pack is taken from memory. Where a source is silent, the pack says so and records an open question rather than inventing authority.

| Source | Used for |
|---|---|
| `DEC-011` (DECISION_LOG) and decision pack §4, §4.9, §4.10 | Hierarchy, the 14 binding design requirements, LED-01 consequence |
| `DEC-013` | Four-state capability model; build-unlocked / production-gated; five environments; fail-closed |
| `DEC-014` | `current_state` is one conjunct; nothing in ACC-01 may be read as activation |
| CURRENT_STATE (baseline `5a4f872`, migration head 071) | Repository state; IAM2-FIND-002, CFG-FIND-002 |
| Module Index v1.4 §7 (ACC-01 row and note), §11 (LED-01 gate), §18 (build sequence), §19 (rules 1–14) | Scope, "owns accounts only", build phase C, dependencies |
| Doc 00 v1.5 §2C, §21 condition 9, §21A, §23 (`A2-Q1`, `A2-Q2`) | Account hierarchy rules; account/subaccount status as production-gate input |
| SRS v1.3 §2A/§2B, `PAY-SRS-002`, `RWA-SRS-024` | State separation; merchant/issuer consume the hierarchy |
| Role Matrix v1.3 §3.7, §3.8, §5.1, §5.2A, §7, §23, §29 item 39, §30 item 19 | Permission ≠ activation; client-role scoping; maker-checker rows; subaccount scope tests |
| Workflow Map v1.3 WF-26, WF-27, §33A.3 step 4 | Freeze/restriction states and scopes; closure; merchant account creation |
| System Rules v1.3 `FRZ-RULE-001/002`, `OFF-RULE-001`, §26 error set | Restriction triggers/scopes, closure blockers, master error codes |
| Repository (inspected, **not modified**) — CLT-01 `clt1.client_profile`, `clt1.authorised_user`, `/internal/clt1/clients/:client_id/status`; IAM-02 guard, `iam2.permission`, `iam2.user_role`, execute-verify; LED-01 v1.2 `led1.ledger_account` | Integration seams and conventions |

## Files

| # | File | Content |
|---|---|---|
| 01 | [Module Blueprint](01_Module_Blueprint.md) | Ownership, requirement register, identifiers, lifecycles, ownership, scoping, integration |
| 02 | [Workflow](02_Workflow.md) | Creation, subaccount, restriction, lift, closure, resolve, change-request apply |
| 03 | [Diagrams](03_Diagrams.md) | Hierarchy, sequences |
| 04 | [API Specification](04_API_Specification.md) | Staff, internal and deferred client routes |
| 05 | [Database Design](05_Database_Design.md) | `acc1` schema, constraints, triggers, grants |
| 06 | [State Machine](06_State_Machine.md) | Master, subaccount, restriction, change request; effective status |
| 07 | [Permission Rules](07_Permission_Rules.md) | Catalogue, scope narrowing, maker-checker, SoD |
| 08 | [Audit Log Events](08_Audit_Log_Events.md) | `acc1.*` events |
| 09 | [Error Handling](09_Error_Handling.md) | `ACC1_*` codes and mapping to master error set |
| 10 | [Test Cases](10_Test_Cases.md) | Test plan |
| 11 | [Claude Prompt](11_Claude_Prompt.md) | **Future** phased implementation brief — not authorised |
| 12 | [Risk and Control Map](12_Risk_And_Control_Map.md) | Risks and controls |
| 13 | [Reconciliation Design](13_Reconciliation_Design.md) | Structural reconciliation |
| 14 | [Go-Live Checklist](14_Go_Live_Checklist.md) | Gates |
| 15 | [Regulatory Mapping](15_Regulatory_Mapping.md) | Internal-rule mapping; open regulatory questions |
| 16 | [Data Classification](16_Data_Classification.md) | Classification |
| 17 | [Dependency Change Requests and Open Questions](17_Dependency_Change_Requests_And_Open_Questions.md) | `DCR-ACC-*`, `OQ-*`, `HD-*` |

## Headline design decisions (all proposals pending review — see file 17)

1. **Owns accounts only.** ACC-01 stores no legal-entity data, no membership, no ledger account, no balance. Legal ownership is a `client_id` reference to CLT-01, validated at write time through CLT-01's existing internal status seam.
2. **Hierarchy enforced structurally.** A subaccount's owner cannot differ from its master account's owner: a composite foreign key `(master_account_id, client_id)` makes cross-client subaccount ownership unrepresentable.
3. **Ownership is immutable, always.** `client_id` and `master_account_id` are frozen by column privileges and triggers. No ownership-transfer path is designed; it is recorded as out of scope.
4. **Effective status is computed, never cascaded.** Stored status is own-level; effective status is derived at read from client, master and subaccount state and fails closed to `unknown`.
5. **Changes are governed.** Create, close, restrict and lift run through a change-request + IAM-02 maker-checker + execute-verify apply; account rows never exist in a "pending" state.
6. **Not a capability.** Subaccount purpose and account status never activate, permit or deny a product; they are inputs (Doc 00 §21 condition 9) consumed by CFG-01 and product modules.
7. **No dependency on unbuilt enforcement to build.** ACC-01 can be built on the accepted IAM-02 baseline; subaccount-scoped permission *enforcement* additionally needs the IAM-02 extension and `IAM2-FIND-002` (DCR-ACC-IAM-01).
